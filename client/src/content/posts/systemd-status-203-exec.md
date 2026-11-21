## The short answer

systemd is the service manager that starts and supervises services on most Linux distributions. When it reports `status=203/EXEC` and the journal has a matching `Failed at step EXEC spawning` line, it forked a process for the service, but the `execve(2)` system call that should have replaced that process with the program failed. None of the program's own code ran. Without that line, the program may have started and exited 203 itself, which shows the same status ([see below](#what-else-can-hide-or-fake-a-203-exec)). [systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Process%20Exit%20Codes) says this is "Most likely" caused by "a missing or non-accessible executable file". The full journal line, `Failed at step EXEC spawning <path>: <error>`, carries the kernel's error text, and that text settles which case it is:

- "No such file or directory" (ENOENT): the file, or the interpreter named on its `#!` line, does not exist where the unit looks.
- "Permission denied" (EACCES): no execute bit, a directory the unit's user cannot search, a `noexec` mount, an SELinux denial or a sandbox setting.
- "Exec format error" (ENOEXEC): a script with no `#!` line, or a binary for another CPU.

Read the line with `journalctl -u NAME -b`, test the path with `namei -l`, and decode the number with `systemd-analyze exit-status 203`. Current systemd releases name 45 codes of their own, from 200 to 246, and older ones fewer. By convention each one names a setup step that failed before the program started, such as 226/NAMESPACE for a missing `ReadWritePaths=` target and 217/USER for a missing `User=` account. systemd applies the name to the number whoever returned it, so the matching `Failed at step NAME spawning` journal line is what confirms the step really failed ([why](#what-does-status-203-exec-mean)).

## What does status=203/EXEC mean?

The number comes from the child process the manager creates for every command line. [systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Process%20Exit%20Codes) says that when the manager cannot apply a unit's execution settings, "the already created service process will exit with a non-zero exit code" before the configured command runs. That is after `fork(2)` and before the program. The 203 row, `EXIT_EXEC`, reads: "The actual process execution failed (specifically, the execve(2) system call). Most likely this is caused by a missing or non-accessible executable file."

The word after the slash is the entry's name in systemd's own table, where [the source](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.c) has `[EXIT_EXEC] = { "EXEC", EXIT_STATUS_SYSTEMD }`. The same name appears in the journal, because [the executor](https://raw.githubusercontent.com/systemd/systemd/main/src/core/executor.c) logs `Failed at step %s spawning %s: %m` with that name and the command path. "Step EXEC" and "203/EXEC" are one fact reported twice.

The status line, though, is built from the number alone. [unit.c](https://raw.githubusercontent.com/systemd/systemd/main/src/core/unit.c) writes `status=%i/%s` with the name from `exit_status_to_string()`, a table lookup on the exit code, and the status line carries nothing else about why the process exited. A program that starts normally and returns 203, or 217, gets the same `203/EXEC` or `217/USER` label as a real setup failure. The journal line is what separates them. The executor logs `Failed at step %s spawning` only when `exec_invoke()` returns an error, which happens during setup or when `execve()` itself fails; once `execve()` succeeds the process is the program and no systemd code runs in it to log anything. Every name in the 200s below is therefore systemd's conventional meaning, confirmed by that line, and the rest of this article reads the codes that way.

Status 203 also says something about the steps before it. In [the current source](https://raw.githubusercontent.com/systemd/systemd/main/src/core/exec-invoke.c), a comment shortly before the executable lookup begins: "Now that the mount namespace has been set up and privileges adjusted, let's look for the thing we shall execute". The lookup therefore happens inside the unit's own view of the filesystem, with the unit's sandbox in place. A file that a root shell can see may be hidden or unusable there.

Three rules from [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html) explain many 203 reports:

- The first word must be "either an absolute path to an executable or a simple file name without any slashes". A simple name is resolved with "a fixed search path determined at compilation time" that includes `/usr/local/bin/` and `/usr/bin/`. The `$PATH` of a login shell is not used.
- It is not a shell line. Redirection, pipes, background jobs "and other elements of shell syntax are not supported". The manual's own workaround is `ExecStart=sh -c 'dmesg | tac'`.
- The program to execute "may not be a variable". [The source](https://raw.githubusercontent.com/systemd/systemd/main/src/core/load-fragment.c) rejects a bad first word while loading the unit, with the message "Neither a valid executable name nor an absolute path". That is a load error, not a 203.

With `Type=simple`, the manager "will consider the unit started immediately after the main service process has been forked off", so the page warns that `systemctl start` reports success even when the binary cannot be invoked. With `Type=exec`, `systemctl start` "will report failure when the service's binary cannot be invoked successfully". The manual itself says that "Typically, Type=exec is the better choice". The [units that behave](/blog/systemd-units-that-behave) article has more on writing unit files.

## Why does a script that runs fine by hand fail with 203/EXEC?

A shell and the service manager both end in `execve(2)`, and they differ in everything before it. The text after `spawning <path>:` is the C library's message for the error number (errno) that the kernel returned. [errno(3)](https://man7.org/linux/man-pages/man3/errno.3.html) lists them: ENOENT "No such file or directory", EACCES "Permission denied", ENOEXEC "Exec format error" and ETXTBSY "Text file busy".

| Text after the path | execve(2) says | Usual causes |
|---|---|---|
| No such file or directory | "path or a script or ELF interpreter does not exist" | Wrong path; bare name outside systemd's search path; `#!` names a missing interpreter; binary built for a loader the host lacks; path hidden by `ProtectHome=` |
| Permission denied | Search denied on a path component, file not regular, execute denied, or "The filesystem is mounted noexec" | No execute bit; closed parent directory; `noexec` mount; SELinux; `NoExecPaths=` |
| Exec format error | "not in a recognized format, is for the wrong architecture" | Script without a `#!` line; wrong CPU architecture |
| Text file busy | "open for writing by one or more processes" | A deploy still writing the file when the unit starts |

The middle column comes from the ERRORS section of [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html). The right column is my summary of the cases below.

### A script with no #! line

When `execve()` fails with ENOEXEC, the [POSIX shell rules](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html) have the shell fall back to running the file as a shell script itself. Typing `./job.sh` at a prompt therefore works without a `#!` line. systemd does no such retry. A poster on the Arch Linux forum in 2012 reported a script that [failed under systemd with `status=203/EXEC` and "Exec format error"](https://bbs.archlinux.org/viewtopic.php?id=149425), then wrote that the `#!/bin/sh` line had been left out and marked the thread solved. Red Hat's knowledge base shows the same "Exec format error" for [`/etc/rc.d/rc.local` on RHEL 7.2](https://access.redhat.com/solutions/7036450) and a 203/EXEC for [rc-local.service on RHEL 9](https://access.redhat.com/solutions/7027153). Both resolutions are behind a subscriber login, so I can only point at the symptom. Units that replace old init scripts, covered in [init scripts to systemd units](/blog/init-scripts-to-systemd-units), are a natural place for this to show up.

### A carriage return in the shebang

[execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html) says an interpreter script starts with a line of the form `#!interpreter [optional-arg]`, that the interpreter "must be a valid pathname for an executable file", and that on Linux "the entire string following the interpreter name is passed as a single argument". A script saved with Windows line endings ends that line in a carriage return, written `\r`.

With `#!/bin/bash` and nothing after it, the carriage return becomes part of the interpreter path. No file is named `/bin/bash\r`, so the kernel returns ENOENT. The message says "No such file or directory" about a script that plainly exists, which is what makes this one confusing.

With `#!/usr/bin/env python3` the carriage return lands in env's argument instead. A [Virginia Tech course Q&A](https://courses.cs.vt.edu/cs3214/fall2023/questions/shebang) shows the result: `/usr/bin/env: 'python3\r': No such file or directory`. That time env did start, and [env(1)](https://man7.org/linux/man-pages/man1/env.1.html) exits with 127 when the command cannot be found. So the unit reports 127, not 203.

### A different user, a different filesystem view

The unit runs as its `User=`, not as the person typing. [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html) returns EACCES when "Search permission is denied on a component of the path prefix", so every directory on the path needs search permission for that user. Which permission bits apply is the owner, group, other rule described in [permissions do not add up](/blog/permissions-do-not-add-up). [namei(1)](https://man7.org/linux/man-pages/man1/namei.1.html) with `-l` prints the mode and owner of each component, and the [chmod calculator](/tools/chmod-calculator) decodes the bits. The first directory that user cannot search is the answer.

Sandbox settings change the view itself. [systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html) says that with `ProtectHome=` enabled, `/home/`, `/root` and `/run/user` "are made inaccessible and empty for processes invoked by this unit". It also says "Content in paths listed in `NoExecPaths=` are not executable even if the usual file access controls would permit this". A binary under `/home` plus `ProtectHome=yes` is a 203.

### A noexec mount

[mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html) describes `noexec` as not permitting direct execution of any binaries on the mounted filesystem. [findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html) with `-T path` finds the mount holding a path, and its OPTIONS column shows the flag. The key word is "direct". An interpreter can still read a script from such a mount, so `sh /tmp/job.sh` works where `/tmp/job.sh` fails. [Broadcom's knowledge base article](https://knowledge.broadcom.com/external/article/441634/agent-fails-to-start-with-permission-den.html) on a 203/EXEC lists a `noexec` mount as the thing to check when SELinux is not the cause.

### An SELinux label

SELinux is a kernel access control layer, on by default on Fedora and RHEL, that attaches a label to every file and process and checks them against a policy. Under it a service runs in a confined domain, not in the unconfined one a login shell normally gets. So a file can be executable by mode bits and still be refused.

A poster on Fedora Discussion in December 2020 reported `status=203/EXEC` with an audit denial `{ execute }` from `scontext=system_u:system_r:init_t:s0` against a file labeled [`screen_exec_t`](https://discussion.fedoraproject.org/t/selinux-policy-prevents-systemd-from-executing-screen-review-my-solution-please/77785). The Broadcom article describes a RHEL 9 agent whose file mode was `-rwxr-xr-x` and still failed with "Permission denied" and 203/EXEC, and it names SELinux as the cause. A [2026 blog post by Thomas Powell](https://thomaspowell.com/2026/04/03/the-selinux-203-exec-systemd/) reports a binary that systemd could execute from `/opt/myapp/bin` (labeled `bin_t`) and could not from `/srv/myapp/releases/...` (labeled `default_t`).

The commands below come from those two sources. The first is Broadcom's search for recent denials. The other two are the blog post's label fix:

```bash
ausearch -m avc -ts recent
```

```bash
semanage fcontext -a -t bin_t "/srv/myapp/.*/bin(/.*)?"
```

```bash
restorecon -Rv /srv/myapp
```

Broadcom's article also suggests a temporary `setenforce 0` to see whether the service then starts, followed by `setenforce 1`. That turns enforcement off for the whole machine, so treat it as a short test and not a fix.

## How do you find the real reason in the journal?

Start with the unit's own lines for this boot. The [journalctl(1)](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html) options `-u` and `-b` select the unit and the boot. The lines have this shape, shown here with a placeholder path:

```text
myapp.service: Failed to locate executable /opt/myapp/bin/myapp: Permission denied
myapp.service: Failed at step EXEC spawning /opt/myapp/bin/myapp: Permission denied
myapp.service: Main process exited, code=exited, status=203/EXEC
```

The first line is worded "Failed to locate executable" on the RHEL 9 system in [Broadcom's article](https://knowledge.broadcom.com/external/article/441634/agent-fails-to-start-with-permission-den.html). [The current source](https://raw.githubusercontent.com/systemd/systemd/main/src/core/exec-invoke.c) writes "Unable to locate executable '%s': %m", so newer releases word it that way. The third line says "Main process exited" for the main `ExecStart=` command, as in the Fedora thread and [Red Hat's rc-local page](https://access.redhat.com/solutions/7027153). Broadcom's article shows "Control process exited" instead. The Red Hat page also shows the `Process:` line of `systemctl status` naming the failed directive: `ExecStart=/etc/rc.local (code=exited, status=203/EXEC)`.

Four commands cover it. The unit's lines for this boot:

```bash
journalctl -u myapp.service -b --no-pager
```

Every spawn failure this boot, for all units:

```bash
journalctl -b MESSAGE_ID=641257651c1b4ec9a8624d7a40a9e1e7
```

The last exit status as a bare number, for scripts:

```bash
systemctl show myapp.service -p ExecMainStatus
```

The name and class behind a number:

```bash
systemd-analyze exit-status 203
```

Some notes on those:

- **The message ID** is `SD_MESSAGE_SPAWN_FAILED` in [sd-messages.h](https://raw.githubusercontent.com/systemd/systemd/main/src/systemd/sd-messages.h), and the executor attaches it to the failure line. journalctl matches `FIELD=VALUE` pairs, per its manual.
- **Adding `-x`** brings explanatory catalog text. [The catalog entry](https://raw.githubusercontent.com/systemd/systemd/main/catalog/systemd.catalog.in) is titled "Process @EXECUTABLE@ could not be executed" and says "The error number returned by this process is @ERRNO@." The journalctl manual asks people not to use `-x` when attaching output to bug reports.
- **ExecMainStatus** is one of the service properties listed in [org.freedesktop.systemd1(5)](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html).
- **`systemd-analyze exit-status`** prints each status with its name and class. The example in [systemd-analyze(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html) includes the row `SUCCESS 0 libc`. Class `systemd` marks the 200s.

Before any of that, `systemd-analyze verify myapp.service` reports "commands listed in `ExecStart=` and similar which are not found in the system or not executable". [Its source](https://raw.githubusercontent.com/systemd/systemd/main/src/analyze/analyze-verify-util.c) skips commands prefixed with `-`, and it checks from the caller's side. It cannot see a sandbox, another user or an SELinux label.

## What do the other exit codes in the 200s mean?

The "systemd-specific exit codes" table in [systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Process%20Exit%20Codes) has 43 rows, from 200 (`EXIT_CHDIR`) to 245 (`EXIT_BPF`), and that last number is wrong, as explained below the second table. It says "The LSB specification suggests that error codes 200 and above are reserved for implementations." LSB is the Linux Standard Base, an older cross-distribution standard. Numbers 223 and 234 are missing from the table. [The header](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.h) marks them reserved: "used to be tcpwrap, don't reuse!" and "used to be used by kdbus, don't reuse". The page also lists C library codes 0 and 1, LSB codes 2 to 7 and BSD codes 64 to 78. A status outside the 200s usually came from the program itself.

The table below uses the numbers the code assigns, which is what the status line prints. Each name is the conventional meaning, which the matching `Failed at step` line confirms ([see above](#what-does-status-203-exec-mean)). The grouping is my reading aid, not systemd's own classification. The counts 10, 13, 7, 6, 5, 3 and 1 add up to 45, the codes on systemd 260 and later. Releases 254 to 259 have 44 (no 246), and 250 to 253 have 43 (no 245 either).

| Family | Codes, by conventional name | Count |
|---|---|---|
| Sandboxing, namespaces and labels | 210 CHROOT, 225 NETWORK, 226 NAMESPACE, 227 NO_NEW_PRIVILEGES, 228 SECCOMP, 229 SELINUX_CONTEXT, 231 APPARMOR_PROFILE, 232 ADDRESS_FAMILIES, 236 SMACK_PROCESS_LABEL, 244 BPF | 10 |
| Scheduling, limits and process properties | 201 NICE, 204 MEMORY, 205 LIMITS, 206 OOM_ADJUST, 207 SIGNAL_MASK, 211 IOPRIO, 212 TIMERSLACK, 214 SETSCHEDULER, 215 CPUAFFINITY, 230 PERSONALITY, 242 NUMA_POLICY, 245 KSM (254 and later), 246 MEMORY_THP (260 and later) | 13 |
| Descriptors, cgroup, keyring and other | 202 FDS, 219 CGROUP, 220 SETSID, 221 CONFIRM, 235 CHOWN, 237 KEYRING, 243 CREDENTIALS | 7 |
| Directories | 200 CHDIR, 233 RUNTIME_DIRECTORY, 238 STATE_DIRECTORY, 239 CACHE_DIRECTORY, 240 LOGS_DIRECTORY, 241 CONFIGURATION_DIRECTORY | 6 |
| User, group and privileges | 213 SECUREBITS, 216 GROUP, 217 USER, 218 CAPABILITIES, 224 PAM | 5 |
| Standard streams | 208 STDIN, 209 STDOUT, 222 STDERR | 3 |
| Exec itself | 203 EXEC | 1 |

The next table pairs the codes that configuration mistakes tend to produce with the setting involved and a message that [the current source](https://raw.githubusercontent.com/systemd/systemd/main/src/core/exec-invoke.c) logs during setup. That message, followed by the `Failed at step` line, is the evidence that the step itself failed:

| Code, by convention | Trigger | Logged message |
|---|---|---|
| 200/CHDIR | `WorkingDirectory=` missing; with a `-` prefix a missing directory "is not considered fatal" | "Changing to the requested working directory failed: %m" |
| 208, 209, 222 | `StandardInput=`, `StandardOutput=` or `StandardError=` target cannot be set up | "Failed to set up standard output: %m" and its input and error twins |
| 216/GROUP, 217/USER | `Group=` or `User=` unknown: "If the user does not exist by then program invocation will fail" | "Failed to determine credentials for user '%s': %s" |
| 226/NAMESPACE | A path in `ReadWritePaths=` and related settings missing | "Failed to set up mount namespacing" followed by the path and the error |
| 228/SECCOMP | `SystemCallFilter=` could not be installed | "Failed to apply system call filters: %m" |
| 233, 238 to 241 | A runtime, state, cache, logs or configuration directory could not be set up | "Failed to set up special execution directory in %s: %m" |
| 243/CREDENTIALS | `LoadCredential=` and related settings | "Failed to set up credentials: %m" |

The quotes in the Trigger column are from [systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html).

The manual and the code disagree on one number. The page, in the v255 source and on the main branch, gives `EXIT_BPF` as 245. The enum in [the header](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.h) starts at `EXIT_CHDIR = 200` and counts up in sequence through the two reserved slots, which puts `EXIT_CREDENTIALS` at 243, `EXIT_BPF` at 244, `EXIT_KSM` at 245 and `EXIT_MEMORY_THP` at 246. The man page has no row for the last two. The header at each release tag shows when they arrived: `EXIT_BPF` first appears in v250, `EXIT_KSM` in v254 and `EXIT_MEMORY_THP` in v260. So BPF has been 244 in every release that has it, and on 250 to 253 a status of 245 is not a systemd code at all. `systemd-analyze exit-status` prints the table from the installed systemd, so trust it when the last digit matters. The status line also uses short names: [the source table](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.c) names 231 `APPARMOR`, not `APPARMOR_PROFILE`.

## Why did hardening a unit start producing 226/NAMESPACE or 217/USER?

Sandboxing directives change the child process before the program runs, so a directive that cannot be applied fails the unit with a code in the 200s and a `Failed at step` line before the program starts. The [service hardening](/blog/systemd-service-hardening) article covers what to set, and `systemd-analyze security` estimates an exposure level from 0.0 to 10.0 per unit, according to [systemd-analyze(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html). This section covers reading the failures.

| Directive added | Code | Why, per systemd.exec(5) |
|---|---|---|
| `ReadWritePaths=`, `ReadOnlyPaths=`, `InaccessiblePaths=` naming a missing path | 226/NAMESPACE | Paths "may be prefixed with -, in which case they will be ignored when they do not exist" |
| `ProtectHome=yes`, program under `/home` | 203/EXEC | `/home/`, `/root` and `/run/user` "are made inaccessible and empty" |
| `NoExecPaths=/` without `ExecPaths=` for the program | 203/EXEC | "Nest `ExecPaths=` inside of `NoExecPaths=` in order to provide executable content within non-executable directories" |
| `User=` for an account missing from the user database | 217/USER | Accounts must exist "no later than the moment the service is started" |
| `SystemCallFilter=` blocking a call the program makes | Not 228 | "The default action when a system call is denied is to terminate the processes with a SIGSYS signal" |

All rows quote the [exec settings manual](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html). The last row matters because the two failures look different. Status 228 with its `Failed at step SECCOMP spawning` line means the filter could not be installed. A denied call at runtime kills the program with `SIGSYS`, which systemd reports as a signal, not as a code in the 200s.

For 226, the journal names the culprit. The message is built from the failing path, so a missing directory appears in the form `Failed to set up mount namespacing: /var/lib/myapp: No such file or directory`. Create the directory, prefix the path with `-` if it is optional, or use `StateDirectory=`. [The same manual](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html) says that setting creates the directory under `/var/lib/` and excludes it from the effect of `ProtectSystem=`.

A method that keeps this manageable is one directive per restart. Add it, run `systemctl daemon-reload` and `systemctl restart`, read the status, and keep the change only if the service still starts. If it fails, the code and its `Failed at step` line name the family, and the "See ... above" text in the manual's row names the setting to look at.

## How do you test a unit change before restarting the service?

[systemd-run(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html) can run a command with a unit's properties without editing anything. Its `--property` option (`-p`) "takes an assignment in the same format as" the `set-property` command of systemctl, `--uid` sets the user, and `--wait` reports the exit code and status of the main process. The manual warns that services it creates default to the simple type, which counts start-up as successful "before the execve() is invoked", and suggests `--property=Type=exec`.

First the static check:

```bash
systemd-analyze verify /etc/systemd/system/myapp.service
```

Then a throwaway run with the settings under test:

```bash
systemd-run --pty --wait --collect --uid=myapp \
  -p Type=exec -p ProtectHome=yes -p ProtectSystem=strict \
  /opt/myapp/bin/myapp --version
```

`--collect` unloads the transient unit even if it failed, so nothing is left behind for the next try. `--shell` (`-S`) is "A shortcut for `--pty --same-dir --wait --collect --service-type=exec $SHELL`", an interactive shell running in service context. With the same `-p` options it gives a prompt inside the sandbox, where `ls -l` and `id` show what the unit sees.

After editing the real unit, [systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) has three useful commands. `systemctl cat` prints the files on disk, which the manual warns "might not match the system manager's understanding of these units" until a reload. `systemctl daemon-reload` loads the change. `systemctl reset-failed` clears the failed state and, per the same page, resets "the start rate limit counter", so the next start is a clean attempt. The `NeedDaemonReload` property in [org.freedesktop.systemd1(5)](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html) says whether the unit file changed since it was loaded:

```bash
systemctl show -p NeedDaemonReload myapp.service
```

For the filesystem checks, this sequence follows the error table. Permissions of every path component:

```bash
namei -l /opt/myapp/bin/myapp
```

The mount and its options:

```bash
findmnt -T /opt/myapp/bin/myapp
```

The raw bytes of the first line:

```bash
head -1 /opt/myapp/bin/myapp | od -c | head -2
```

Whether the unit's user can execute it:

```bash
sudo -u myapp test -x /opt/myapp/bin/myapp && echo executable
```

The `od -c` output shows `\r` before `\n` if the shebang has Windows line endings. The last command has to run as the unit's user, because root passes checks that the service will fail. None of these four see the unit's sandbox or an SELinux label, so a clean result here points you back at those.

## What else can hide or fake a 203/EXEC?

**The `-` prefix hides it.** For a command prefixed with `-`, a failure "is recorded, but has no further effect and is considered equivalent to success", per [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). When the executable cannot be located, [the source](https://raw.githubusercontent.com/systemd/systemd/main/src/core/exec-invoke.c) comments that a missing executable "is very much expected in this case" and returns a value that [the executor](https://raw.githubusercontent.com/systemd/systemd/main/src/core/executor.c) treats as an "expected/ignored failure, do not log at error level". Only a notice-level "Unable to locate executable" line remains. An `ExecStartPre=-/usr/local/bin/check` with a typo in the path quietly never runs.

**`Type=simple` hides it from `systemctl start`.** The start returns success, and the failure shows up in `systemctl status` afterwards. A deploy script that only checks the exit status of `systemctl start` sees nothing wrong.

**Retries hide the first failure.** With `Restart=on-failure`, the service "will be restarted when the process exits with a non-zero exit code", per [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html). A missing binary fails the same way every time, and the retries run into the start limit described in [the service that crashed faster is the one that stopped](/blog/the-service-that-crashed-faster-is-the-one-that-stopped). Read the first spawn failure in the journal, not the last status.

**A program can exit 203 itself.** The same goes for any number in the 200s. The numbers are a convention for what systemd's child process returns before the program starts, and nothing stops a program from returning 203 or 217 on its own; `systemctl status` prints the same `203/EXEC` or `217/USER` either way. The `Failed at step` line is what tells them apart, as [explained above](#what-does-status-203-exec-mean). More on reading exit statuses from the shell side is in [one byte and two kinds of news](/blog/one-byte-and-two-kinds-of-news).

**An unreloaded edit.** The manager runs the unit it loaded, not the file on disk. A fixed file and a still-failing unit can mean `daemon-reload` was skipped. `NeedDaemonReload` exists to answer that question.

**A deploy that races the start.** ETXTBSY, "Text file busy", is returned when the executable "was open for writing by one or more processes", per [execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html). Write the new binary under a temporary name in the same directory and rename it over the old one, so the path never names a half-written file.

The [it works in the shell](/blog/it-works-in-the-shell) article covers the matching problem for cron, where a command behaves differently outside an interactive shell.

## Sources

- [freedesktop.org: systemd.exec(5), Process Exit Codes](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Process%20Exit%20Codes)
- [freedesktop.org: systemd.exec(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [freedesktop.org: systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [freedesktop.org: systemd-analyze(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html)
- [freedesktop.org: systemd-run(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)
- [freedesktop.org: journalctl(1)](https://www.freedesktop.org/software/systemd/man/latest/journalctl.html)
- [freedesktop.org: systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [freedesktop.org: org.freedesktop.systemd1(5)](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html)
- [man7.org: execve(2)](https://man7.org/linux/man-pages/man2/execve.2.html)
- [man7.org: errno(3)](https://man7.org/linux/man-pages/man3/errno.3.html)
- [man7.org: mount(8)](https://man7.org/linux/man-pages/man8/mount.8.html)
- [man7.org: findmnt(8)](https://man7.org/linux/man-pages/man8/findmnt.8.html)
- [man7.org: namei(1)](https://man7.org/linux/man-pages/man1/namei.1.html)
- [man7.org: env(1)](https://man7.org/linux/man-pages/man1/env.1.html)
- [The Open Group: POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)
- [systemd source: src/core/executor.c](https://raw.githubusercontent.com/systemd/systemd/main/src/core/executor.c)
- [systemd source: src/core/exec-invoke.c](https://raw.githubusercontent.com/systemd/systemd/main/src/core/exec-invoke.c)
- [systemd source: src/core/load-fragment.c](https://raw.githubusercontent.com/systemd/systemd/main/src/core/load-fragment.c)
- [systemd source: src/shared/exit-status.c](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.c)
- [systemd source: src/shared/exit-status.h](https://raw.githubusercontent.com/systemd/systemd/main/src/shared/exit-status.h)
- [systemd source: src/systemd/sd-messages.h](https://raw.githubusercontent.com/systemd/systemd/main/src/systemd/sd-messages.h)
- [systemd source: catalog/systemd.catalog.in](https://raw.githubusercontent.com/systemd/systemd/main/catalog/systemd.catalog.in)
- [systemd source: src/analyze/analyze-verify-util.c](https://raw.githubusercontent.com/systemd/systemd/main/src/analyze/analyze-verify-util.c)
- [Red Hat: Solution 7027153, rc-local.service status=203/EXEC](https://access.redhat.com/solutions/7027153)
- [Red Hat: Solution 7036450, rc.local failing with Exec format error](https://access.redhat.com/solutions/7036450)
- [Broadcom: Agent fails to start with Permission denied status=203/EXEC on RHEL 9](https://knowledge.broadcom.com/external/article/441634/agent-fails-to-start-with-permission-den.html)
- [Fedora Discussion: SELinux policy prevents systemd from executing screen](https://discussion.fedoraproject.org/t/selinux-policy-prevents-systemd-from-executing-screen-review-my-solution-please/77785)
- [Arch Linux Forums: Startup script not getting executed in systemd](https://bbs.archlinux.org/viewtopic.php?id=149425)
- [Virginia Tech CS3214: shebang and Windows line endings](https://courses.cs.vt.edu/cs3214/fall2023/questions/shebang)
- [Thomas Powell: The SELinux label that decides whether your binary runs or dies in systemd](https://thomaspowell.com/2026/04/03/the-selinux-203-exec-systemd/)