## The short answer

The symptom is usually indirect: a process that comes back after you kill it, a login you cannot explain, or a server you already cleaned once that got reinfected. The cause is persistence, a way for code to run again without the attacker doing anything. On Linux it sits in a short list of places that can be enumerated in minutes: cron and at jobs, systemd timers and units (including per-user units), `authorized_keys` files and the sshd hooks around them, shell profiles and `rc.local`, and `/etc/ld.so.preload`. MITRE ATT&CK v20 lists 14 Linux sub-techniques across the six technique families that cover these places, and its [Linux matrix](https://attack.mitre.org/matrices/enterprise/linux/) shows 17 persistence techniques in all. Each place takes one or two commands to list (below), and `dpkg --verify` or `rpm -Va` shows whether package-owned files changed, with the catch that dpkg's manual says its check "should not be considered as any kind of security verification." Read `/etc/ld.so.preload` and compare process lists with a static BusyBox build, because a preloaded library can hide files and processes from every dynamically linked tool. Then add audit rules so the next edit to these paths is logged.

Everything here is read-only until the audit rules at the end. Run it on machines you own or are responsible for.

## Where can an attacker make code run again after a reboot?

ATT&CK defines persistence as techniques that keep "access to systems across restarts, changed credentials, and other interruptions" ([TA0003](https://attack.mitre.org/tactics/TA0003/)). On Linux the places in this article reduce to six technique families. The counts below come from the [Linux matrix](https://attack.mitre.org/matrices/enterprise/linux/) as of ATT&CK v20, which the [version history](https://attack.mitre.org/resources/versions/) dates to October 13, 2026.

| Technique | Linux sub-techniques | Where to look |
|---|---|---|
| T1546 Event Triggered Execution | 5: Unix Shell Configuration Modification, Trap, Installer Packages, Udev Rules, Python Startup Hooks | `/etc/profile`, `/etc/profile.d`, `~/.bash_profile`, `~/.bashrc`, `~/.bash_logout` ([T1546.004](https://attack.mitre.org/techniques/T1546/004/)) |
| T1053 Scheduled Task/Job | 3: At, Cron, Systemd Timers | Next section |
| T1098 Account Manipulation | 2: SSH Authorized Keys, Additional Local or Domain Groups | `authorized_keys` section |
| T1574 Hijack Execution Flow | 2: Dynamic Linker Hijacking, Path Interception by PATH Environment Variable | `/etc/ld.so.preload`; v20 lists the technique under [Stealth and Execution](https://attack.mitre.org/techniques/T1574/), not Persistence |
| T1543 Create or Modify System Process | 1: Systemd Service | Unit directories |
| T1037 Boot or Logon Initialization Scripts | 1: RC Scripts | `rc.local`, whose contents run as root on reboot ([T1037.004](https://attack.mitre.org/techniques/T1037/004/)) |

The counts sum to 14. The table is a map, not a ranking, because intrusions stack entries: MITRE credits Rocke with both a [cron job](https://attack.mitre.org/techniques/T1053/003/) and an [`/etc/ld.so.preload` edit](https://attack.mitre.org/techniques/T1574/006/), and Skidmap with both crontab persistence and a key in [`authorized_keys`](https://attack.mitre.org/techniques/T1098/004/). Elastic's detection engineers make the cost explicit: when an attack is found and the entry point patched, "any leftover persistence mechanism can allow the attackers to regain access" ([Elastic](https://www.elastic.co/security-labs/primer-on-persistence-mechanisms)). So the goal is to list every place, not to stop at the first hit.

For each place, ask two questions. Does a package own the file? Did it change recently? Neither answer is proof on its own, and the last section covers how both can mislead.

## How do you list every cron job, at job and systemd timer on the host?

Cron has several homes. Debian's [cron(8)](https://manpages.debian.org/bookworm/cron/cron.8.en.html) puts per-user crontabs in `/var/spool/cron/crontabs`, while the cronie [crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html) used on Red Hat style systems names `/var/spool/cron/`. System jobs live in `/etc/crontab` and `/etc/cron.d/`, and Debian adds scripts in `/etc/cron.hourly`, `/etc/cron.daily`, `/etc/cron.weekly` and `/etc/cron.monthly`, which `run-parts` runs. Debian says spool files "should not be accessed directly", so read them with `crontab -l -u`.

```bash
sudo ls -la /etc/crontab /etc/cron.d /etc/cron.hourly /etc/cron.daily /etc/cron.weekly /etc/cron.monthly
sudo cat /etc/crontab /etc/cron.d/* 2>/dev/null
sudo sh -c 'for u in $(cut -d: -f1 /etc/passwd); do crontab -l -u "$u" 2>/dev/null | sed "s|^|$u: |"; done'
sudo grep -rnE '^\s*(@reboot|-)' /etc/crontab /etc/cron.d /var/spool/cron 2>/dev/null
sudo atq
sudo ls -la /var/spool/cron/atjobs 2>/dev/null
systemctl list-timers --all
```

Two cron details deserve a grep. `@reboot` means "Run once after reboot" per crontab(5), and MITRE records the GoldMax Linux variant [persisting with a crontab `@reboot` line](https://attack.mitre.org/techniques/T1053/003/). In cronie, a root crontab entry may also start with `-`, which "will prevent cron from writing a syslog message about the command being executed", so that job runs without cron's usual log line. MITRE's examples show the payload shape: Rocke's job "downloaded and executed files from the C2", and Kinsing used crontab "to download and run shell scripts every minute".

For at jobs, Debian's [at(1)](https://manpages.debian.org/bookworm/at/at.1.en.html) says `atq` lists the user's pending jobs, or everyone's for the superuser, `at -c JOB` prints a job, and the spool is `/var/spool/cron/atjobs`. Elastic notes that At is not present on most Linux distributions by default, so an installed `atd` on a server that never needed it is worth a question. MITRE's [at page](https://attack.mitre.org/techniques/T1053/002/) lists the technique for Linux, Windows and macOS.

Systemd timers need a matching service. MITRE's [timer page](https://attack.mitre.org/techniques/T1053/006/) says "Each .timer file must have a corresponding .service file with the same name", and that privileged timers sit in `/etc/systemd/system/` and `/usr/lib/systemd/system` while user-level ones sit in `~/.config/systemd/user/`. [systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html) documents `list-timers` and its NEXT, LAST, UNIT and ACTIVATES columns, and its own sample output shows what normal looks like: `apt-daily.timer`, `systemd-tmpfiles-clean.timer` and `snapd.refresh.timer`. For any timer you cannot place, run `systemctl cat NAME.timer NAME.service`. A timer using `OnBootSec=` fires relative to boot, per [systemd.timer(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html).

A [cron expression explainer](/tools/cron-explainer) decodes a schedule field faster than reading crontab(5), and [why jobs behave differently under cron](/blog/it-works-in-the-shell) covers the minimal environment cron provides.

## How do you spot a malicious systemd unit, including user units?

Start with where units load from. [systemd.unit(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html) lists `/etc/systemd/system` for units created by the administrator, `/run/systemd/system` for runtime units, `/usr/local/lib/systemd/system` for units the administrator installed and `/usr/lib/systemd/system` for units from the package manager. For user managers it lists `~/.config/systemd/user`, `/etc/systemd/user` and `~/.local/share/systemd/user`, among others. Precedence matters: [systemd-delta(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-delta.html) says files in `/etc/` "have highest priority", so a same-named unit there replaces the distribution's, and `.d/` drop-in files can change a vendor unit without editing it.

```bash
systemd-delta systemd/system
systemd-delta systemd/user
systemctl list-unit-files | grep -w enabled
for f in /etc/systemd/system/*.service /etc/systemd/system/*.timer; do
  [ -f "$f" ] && ! dpkg -S "$f" >/dev/null 2>&1 && echo "no owner: $f"
done
sudo grep -rnE '^Exec[A-Za-z]*=.*(/tmp/|/dev/shm/|/var/tmp/)' /etc/systemd /usr/local/lib/systemd /run/systemd 2>/dev/null
```

On RPM systems use `rpm -qf "$f"` in place of `dpkg -S`. The `-S` lookup has a stated gap: [dpkg-query](https://man7.org/linux/man-pages/man1/dpkg-query.1.html) "will not list extra files created by maintainer scripts", so a missing owner is a lead, not a verdict. Units you wrote yourself will also show up as unowned, which is the point: you should be able to name every one.

Read every `Exec` line in a suspect unit. MITRE's [systemd service page](https://attack.mitre.org/techniques/T1543/002/) lists `ExecStart`, `ExecStartPre`, `ExecStartPost`, `ExecReload` and `ExecStop`, notes that the `User` directive sets which account the service runs as, and adds that adversaries "may also place symbolic links in these directories, enabling systemd to find these payloads regardless of where they reside on the filesystem." Its detection notes flag execution from `/tmp`, `/dev/shm` or unmounted volumes, which is what the last grep above targets. Knowing what a [well-formed unit](/blog/systemd-units-that-behave) looks like makes odd ones easier to spot.

Generators are the quiet variant. [systemd.generator(7)](https://www.freedesktop.org/software/systemd/man/latest/systemd.generator.html) describes small executables in `/usr/lib/systemd/system-generators/`, `/etc/systemd/system-generators/`, `/run/systemd/system-generators/` and `/usr/local/lib/systemd/system-generators/`, which systemd runs "very early at bootup and at configuration reload time" and which write unit files that join the load path. A generator is an executable, not a unit file, so a search of unit directories misses it. Any file in the `/etc`, `/run` or `/usr/local` generator directories needs an owner.

User units are the other blind spot. Normally they start with that user's manager at login, but with `loginctl enable-linger` "a user manager is spawned for the user at boot and kept around after logouts" ([loginctl(1)](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html)). Without lingering, the user manager is generally ["started on first login only"](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html). The systemd source stores linger state as files in [`/var/lib/systemd/linger/`](https://github.com/systemd/systemd/blob/main/src/login/logind-user.c), so an account listed there that nobody enabled on purpose is a finding.

```bash
sudo find /etc/systemd/user /home /root -path '*/systemd/user/*' \( -type f -o -type l \) -ls 2>/dev/null
ls -la /var/lib/systemd/linger 2>/dev/null
```

## How do you audit authorized_keys files and sshd options?

MITRE's [T1098.004](https://attack.mitre.org/techniques/T1098/004/) says adversaries "may modify SSH authorized_keys files directly with scripts or shell commands", and in cloud environments can push keys through the provider's API, for example Google Cloud's `add-metadata` command. So a key can appear without anyone logging in to the server. The same page records that TeamTNT has "added RSA keys in authorized_keys".

Do not start with `find`. Start with the effective sshd configuration, because the keys sshd honors come from options, and a `Match` block can change them per user. The [sshd_config(5)](https://man.openbsd.org/sshd_config) defaults and hooks that matter:

| Option | Default or behavior |
|---|---|
| `AuthorizedKeysFile` | `.ssh/authorized_keys .ssh/authorized_keys2`, so a second file is read |
| `AuthorizedKeysCommand` | A program that prints keys. It is tried after the files and "will not be executed if a matching key is found there" |
| `TrustedUserCAKeys` | Certificates signed by a listed authority are accepted, with no `authorized_keys` line needed |
| `AuthorizedPrincipalsFile` / `Command` | Names accepted for those signed certificates |
| `PermitUserEnvironment` | `no` by default; enabling it "may enable users to bypass access restrictions in some configurations using mechanisms such as LD_PRELOAD" |
| `PermitUserRC` | `yes` by default, so `~/.ssh/rc` runs at login |

```bash
sudo sshd -T | grep -E '^(authorizedkeysfile|authorizedkeyscommand|authorizedkeyscommanduser|authorizedprincipalsfile|authorizedprincipalscommand|trustedusercakeys|permituserenvironment|permituserrc|permitrootlogin|strictmodes) '
sudo sshd -T -C user=alice,host=lab1,addr=192.0.2.10 | grep -i authorizedkeysfile
sudo find / -xdev \( -name 'authorized_keys' -o -name 'authorized_keys2' -o -path '*/.ssh/rc' -o -name sshrc \) -type f -ls 2>/dev/null
sudo find /home /root -name 'authorized_keys*' -type f -exec sh -c 'for f; do echo "== $f"; ssh-keygen -lf "$f"; done' _ {} +
```

[sshd(8)](https://man.openbsd.org/sshd) documents `-T` as extended test mode that prints the effective configuration, with `-C` supplying the connection parameters that `Match` rules need. Replace `alice`, `lab1` and the address with a real account and client. The [OpenSSH 7.2 release notes](https://www.openssh.com/releasenotes.html) (February 2016) added fingerprinting of every key in a file with `ssh-keygen -lf`. The [SSH hardening post](/blog/ssh-hardening-linux-servers) makes the same point about checking the running configuration instead of the file.

Look at option prefixes too. Per sshd(8), a line may begin with options such as `command=`, `environment=`, `from=` and `expiry-time=`, and `command="..."` "is executed whenever this key is used for authentication". `grep -vE '^(#|$|(sk-)?(ssh|ecdsa)-)' ~/.ssh/authorized_keys` prints only lines that begin with options. sshd also runs `~/.ssh/rc`, or `/etc/ssh/sshrc`, at login, and `no-user-rc` disables the per-user file for a key.

Finally, tie keys to logins. sshd logs a successful login at its default log level, and the [OpenSSH source](https://github.com/openssh/openssh-portable/blob/master/auth.c) builds the line as `Accepted publickey for USER from ADDRESS port N ssh2:` followed by key type and fingerprint. Match those against the `ssh-keygen -lf` list:

```bash
sudo journalctl --no-pager | grep 'Accepted publickey'
```

A fingerprint that appears in logs but in no file means the key was removed after use, or was accepted through a signed certificate or `AuthorizedKeysCommand`. The [key-based authentication post](/blog/ssh-key-based-authentication) covers the options and the legacy `authorized_keys2` file from the owner's side.

## What does /etc/ld.so.preload do, and why do rootkits use it?

It loads libraries into every dynamically linked program. [ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html) defines `LD_PRELOAD` as "additional, user-specified, ELF shared objects to be loaded before all others" that "can be used to selectively override functions in other shared objects." (ELF is the file format of Linux programs and libraries.) Preloads are handled in order: the `LD_PRELOAD` variable, then the linker's `--preload` option, then `/etc/ld.so.preload`. The last has "a system-wide effect, causing the specified libraries to be preloaded for all programs that are executed on the system", which the manual calls "usually undesirable" and "typically employed only as an emergency remedy." On most servers the file does not exist at all. A non-empty one needs an explanation.

That reach is why rootkits want it. A library loaded first can replace libc functions, so one that overrides directory reads can drop entries before `ls`, `ps` or `top` see them. Unit 42's [Hildegard analysis](https://unit42.paloaltonetworks.com/hildegard-malware-teamtnt/) (February 3, 2021) describes malware that modified `/etc/ld.so.preload` and overwrote `readdir()` and `readdir64()` to filter `/proc` entries with keywords such as tmate, xmrig and ziggy, so that `ps`, `top` and many container monitoring tools "will be blinded from these malicious processes". [Sandfly](https://sandflysecurity.com/blog/linux-medusa-rootkit-detection-and-de-cloaking) describes the Medusa rootkit, written up in July 2025, as the same style, hiding a directory from `ls`, and says such rootkits slow the machine because "every command is potentially being intercepted". Elastic's rootkit research says the file ["forces the dynamic linker to inject the listed shared object into every dynamically linked binary"](https://www.elastic.co/security-labs/linux-rootkits-2-caught-in-the-act) and shows a shared object moved from a hidden directory under `/tmp` to `/usr/local/lib/libz.so.1`, a name that looks like a real library.

Two sibling mechanisms need the same check. Elastic also lists `/etc/ld.so.conf` and `/etc/ld.so.conf.d/` followed by `ldconfig`, which changes how libraries resolve. The ld.so(8) search order consults the `/etc/ld.so.cache` that `ldconfig` builds before the default `/lib` and `/usr/lib`. Per sshd_config above, `PermitUserEnvironment` and `environment=` are a route to `LD_PRELOAD` for logins, and MITRE's [T1574.006](https://attack.mitre.org/techniques/T1574/006/) covers the environment variable as the other half of the technique.

Check from outside the preload. Sandfly's advice is a static BusyBox build, since statically built binaries "do not rely on dynamic libraries" and "are not fooled by rootkits that have modified them." Sandfly also warns that installing it on the suspect host "will alter the state of the box", so bring it from another host or disk. Confirm it is really static first: `file "$(command -v busybox)"` should say `statically linked`.

```bash
cat /etc/ld.so.preload
busybox cat /etc/ld.so.preload
ls -l /etc/ld.so.conf /etc/ld.so.conf.d/
sudo grep -rIl 'LD_PRELOAD' /etc /usr/lib/systemd /home /root 2>/dev/null
diff <(ls /proc | grep -E '^[0-9]+$' | sort) <(busybox ls /proc | grep -E '^[0-9]+$' | sort)
```

`No such file or directory` from both `cat` commands is the healthy answer. If only the BusyBox one prints content, the file is being hidden from normal tools. The `diff` will always show a few lines, because each side of the comparison lists its own short-lived process IDs. Run it two or three times: a process ID that shows up only on the BusyBox side every time is the finding, and so is any file that `busybox ls` shows in a library directory and `ls` does not. For each path in the preload file, find the owning package with `dpkg -S` or `rpm -qf`; an unowned `.so` is the finding.

## How do you check package files for tampering with dpkg --verify or rpm -Va?

Both compare installed files with what the package database recorded, which finds swapped binaries such as `ssh`, `ls` or a login module. They have different depth. [dpkg(1)](https://man7.org/linux/man-pages/man1/dpkg.1.html) says the "only functional check" `--verify` performs today is an md5sum comparison, done only if the database holds a sum for the file, and that it "should not be considered as any kind of security verification." Its output has one line per failed path in the form `?M5?????? [c] pathname`, where `?` means a check could not be done, `.` means it passed, a `5` means the checksum did not match and `c` marks a conffile. So `??5?????? c /etc/ssh/sshd_config` is a changed configuration file. [debsums(1)](https://manpages.debian.org/bookworm/debsums/debsums.1.en.html) reads `/var/lib/dpkg/info/*.md5sums`, `debsums -l` lists packages with no checksum list, and `-c` prints changed files.

[rpm(8)](https://rpm-software-management.github.io/rpm/man/rpm.8.html) checks more: "size, digest, permissions, type, owner and group of each file." It prints nine result characters, where `.` means pass and a letter means failure: `S` size, `M` mode, `5` digest, `D` device, `L` link, `U` user, `G` group, `T` mtime and `P` capabilities. A `c` marks a config file, so `S.5....T.  c /etc/ssh/sshd_config` is a modified config file, usually benign.

```bash
sudo dpkg --verify 2>/dev/null | grep -v ' c /'
debsums -l
sudo rpm -Va 2>/dev/null | grep -v ' c /'
sudo dpkg --verify openssh-server openssh-client libc6 libpam-modules coreutils procps
sudo rpm -V openssh-server openssh-clients glibc pam coreutils procps-ng
```

No output from a verify command means every check passed. Expect some noise on real systems, and debsums itself warns that files "which have been replaced by another package may be erroneously reported as changed". Spend time on `/usr/bin`, `/usr/sbin`, `/lib` and the PAM (Pluggable Authentication Modules) directory, and on anything with a mismatched size or digest. Do not filter config files out forever: the first and third commands hide them to cut noise, but `sshd_config` and files under `/etc/pam.d` are exactly where a quiet change lives, so read that list once too. Files no package ships are the other half, and the `dpkg -S` loop above covers them.

## How do you catch the next change as it happens?

Verification finds yesterday's change. The Linux audit system logs tomorrow's. [auditctl(8)](https://man7.org/linux/man-pages/man8/auditctl.8.html) says the `-w` watch form "is for backwards compatibility and is deprecated due to poor system performance", and gives the replacement: `-a always,exit -F arch=b64 -F path=/etc/shadow -F perm=wa`, with `dir=` for a recursive directory watch. The community [Neo23x0 rule set](https://github.com/Neo23x0/auditd/blob/master/audit.rules) still uses `-w` lines for cron, `/etc/ld.so.preload` (key `systemwide_preloads`), systemd directories, SSH and shell profiles, which is a good checklist of paths.

```bash
# /etc/audit/rules.d/persistence.rules
-a always,exit -F arch=b64 -F path=/etc/crontab -F perm=wa -k persist_cron
-a always,exit -F arch=b32 -F path=/etc/crontab -F perm=wa -k persist_cron
-a always,exit -F arch=b64 -F dir=/etc/cron.d/ -F perm=wa -k persist_cron
-a always,exit -F arch=b32 -F dir=/etc/cron.d/ -F perm=wa -k persist_cron
-a always,exit -F arch=b64 -F dir=/var/spool/cron/ -F perm=wa -k persist_cron
-a always,exit -F arch=b32 -F dir=/var/spool/cron/ -F perm=wa -k persist_cron
-a always,exit -F arch=b64 -F dir=/etc/systemd/system/ -F perm=wa -k persist_systemd
-a always,exit -F arch=b32 -F dir=/etc/systemd/system/ -F perm=wa -k persist_systemd
-a always,exit -F arch=b64 -F dir=/usr/local/lib/systemd/system/ -F perm=wa -k persist_systemd
-a always,exit -F arch=b32 -F dir=/usr/local/lib/systemd/system/ -F perm=wa -k persist_systemd
-a always,exit -F arch=b64 -F path=/etc/ld.so.preload -F perm=wa -k persist_preload
-a always,exit -F arch=b32 -F path=/etc/ld.so.preload -F perm=wa -k persist_preload
-a always,exit -F arch=b64 -F dir=/etc/ld.so.conf.d/ -F perm=wa -k persist_preload
-a always,exit -F arch=b32 -F dir=/etc/ld.so.conf.d/ -F perm=wa -k persist_preload
-a always,exit -F arch=b64 -F path=/etc/ssh/sshd_config -F perm=wa -k persist_ssh
-a always,exit -F arch=b32 -F path=/etc/ssh/sshd_config -F perm=wa -k persist_ssh
-a always,exit -F arch=b64 -F dir=/root/.ssh/ -F perm=wa -k persist_ssh
-a always,exit -F arch=b32 -F dir=/root/.ssh/ -F perm=wa -k persist_ssh
```

Each path appears twice because a rule with `arch=b64` matches only 64-bit system calls, and an x86_64 kernel also accepts the 32-bit ones. The same manual says that on a bi-arch system you will likely want to "write 2 rules, one with arch equal to b32 and one with b64 to make sure the kernel finds the events that you intend." Without the `b32` lines, a 32-bit program could write to these paths and match nothing. On a machine with no 32-bit system call interface, such as arm64 without compat support, drop the `b32` lines if they fail to load.

The `/etc/ld.so.preload` rule works even though that file normally does not exist. The kernel resolves the parent directory and records the file's inode only if the file is already there ([kernel/audit_watch.c](https://github.com/torvalds/linux/blob/master/kernel/audit_watch.c), `audit_get_nd`), and a create or rename event in the parent fills the inode in later (`audit_watch_handle_event`). The parent directory does have to exist, which `/etc` always does.

[augenrules(8)](https://man7.org/linux/man-pages/man8/augenrules.8.html) merges the files in `/etc/audit/rules.d` that end in `.rules`, and `augenrules --load` loads the result. Then verify, which is the step people skip:

```bash
sudo augenrules --load
sudo auditctl -l | grep persist_
sudo touch /etc/cron.d/audit-test && sudo rm /etc/cron.d/audit-test
sudo ausearch -k persist_cron -i | tail
```

`auditctl -l` should print all 18 rules, including the two for `/etc/ld.so.preload`, and [ausearch(8)](https://man7.org/linux/man-pages/man8/ausearch.8.html) should show the test file being created and removed. If either comes back empty, the rules are not live. Each rule names one literal path, so add one `dir=` line per account whose `.ssh` directory matters; `-F dir=/home/` would also log every ordinary write under it. Once the rules are right, auditctl's `-e 2` locks the configuration so that any attempt to change it "will be audited and denied" until a reboot. The manual says it is meant to be the last command in `audit.rules`, and it also means your own rule fixes need a reboot.

For a baseline of file state, AIDE's [manual](https://aide.github.io/doc/) says to build the database "immediately after the operating system and applications have been installed, before the machine is plugged into a network", to move it to read-only media along with the binary and configuration, and not to keep the config on the target machine, because an attacker "could read the config file and alter it". For queries across hosts, osquery exposes [`crontab`](https://github.com/osquery/osquery/blob/master/specs/posix/crontab.table), [`authorized_keys`](https://github.com/osquery/osquery/blob/master/specs/posix/authorized_keys.table) and [`systemd_units`](https://github.com/osquery/osquery/blob/master/specs/linux/systemd_units.table) tables, and Elastic notes that osquery "focuses on static on-disk presence" where telemetry shows activity over time.

```sql
SELECT path, event, minute, hour, command FROM crontab;
SELECT u.username, k.key_file, k.algorithm, k.options, k.comment FROM users u JOIN authorized_keys k USING (uid);
SELECT id, fragment_path, unit_file_state FROM systemd_units WHERE fragment_path LIKE '/etc/%' OR fragment_path LIKE '/run/%' OR fragment_path LIKE '/home/%';
```

Send audit and sshd logs off the host so a local cleanup cannot erase them: [centralized syslog](/blog/syslog-centralized-logging) is the plumbing, and a [SOC home lab](/blog/soc-home-lab-build) is a place to practice the alerts. Elastic's advice is to monitor some mechanisms "close to real time and hunt others regularly".

## What breaks, and what do these checks miss?

**The tools can lie.** Everything above runs on the host being judged. Elastic's rootkit research reports that "static detection alone is fundamentally insufficient for reliable rootkit detection", and a rootkit in the kernel can hide from a static BusyBox too, because BusyBox still asks that kernel for the file list. One weak signal is `cat /proc/sys/kernel/tainted`: per the [kernel documentation](https://docs.kernel.org/admin-guide/tainted-kernels.html), loading an out-of-tree module sets bit 12 (value 4096) and an unsigned module sets bit 13 (value 8192). A nonzero value is only a lead, since a proprietary graphics driver sets bit 0, and a zero from a compromised kernel proves nothing. MITRE's [rootkit page](https://attack.mitre.org/techniques/T1014/) says rootkits may reside "at the user or kernel level". For serious doubt, inspect the disk from known-good boot media.

**Package checks verify packages only.** `dpkg --verify` and debsums cover files with recorded sums, and debsums calls itself "of limited use as a security tool", pointing to AIDE, integrit, samhain or tripwire run from safe media. Files no package ships, which is most persistence, need the ownership checks.

**Timestamps and logs are editable.** A "changed recently" filter fails against `touch -r`, which MITRE's [timestomp page](https://attack.mitre.org/techniques/T1070/006/) describes for Linux. The audit system is a target too: [T1685.004](https://attack.mitre.org/techniques/T1685/004/) covers killing `auditd` and editing `/etc/audit/audit.rules`, which is the case for `-e 2` and off-host logs.

**The process list comparison is noisy.** Short-lived processes appear on one side of the `diff` and not the other. Only a difference that repeats counts.

**Legitimate changes look identical.** Cloud metadata can write keys, configuration management rewrites `authorized_keys`, and distributions ship timers and cron files. Keep a baseline of what each server should have, in the way [threat modeling](/blog/threat-modeling-homelab) treats expected flows.

**The list is not complete.** The Linux matrix also carries login modules ([T1556.003](https://attack.mitre.org/techniques/T1556/003/)), kernel modules, XDG autostart entries, new local accounts, web shells and valid credentials, none of which this checklist walks. The persistence definition includes surviving "changed credentials", so a stolen password defeats a clean host.

**Removal is not recovery.** Deleting an entry leaves the way in unexplained. If a host fails these checks, preserve evidence before installing tools on it (Sandfly's warning above), rotate every key and password that host held, and rerun the whole list afterward instead of only the check that fired. A host with a preload or kernel finding is a rebuild, not a cleanup. Then write it up as an incident, as in [postmortems for a team of one](/blog/postmortems-team-of-one).

## Sources

- [attack.mitre.org: Persistence (TA0003)](https://attack.mitre.org/tactics/TA0003/)
- [attack.mitre.org: Linux Matrix](https://attack.mitre.org/matrices/enterprise/linux/)
- [attack.mitre.org: Version history](https://attack.mitre.org/resources/versions/)
- [attack.mitre.org: Scheduled Task/Job: Cron (T1053.003)](https://attack.mitre.org/techniques/T1053/003/)
- [attack.mitre.org: Scheduled Task/Job: At (T1053.002)](https://attack.mitre.org/techniques/T1053/002/)
- [attack.mitre.org: Scheduled Task/Job: Systemd Timers (T1053.006)](https://attack.mitre.org/techniques/T1053/006/)
- [attack.mitre.org: Create or Modify System Process: Systemd Service (T1543.002)](https://attack.mitre.org/techniques/T1543/002/)
- [attack.mitre.org: Account Manipulation: SSH Authorized Keys (T1098.004)](https://attack.mitre.org/techniques/T1098/004/)
- [attack.mitre.org: Hijack Execution Flow (T1574)](https://attack.mitre.org/techniques/T1574/)
- [attack.mitre.org: Hijack Execution Flow: Dynamic Linker Hijacking (T1574.006)](https://attack.mitre.org/techniques/T1574/006/)
- [attack.mitre.org: Event Triggered Execution: Unix Shell Configuration Modification (T1546.004)](https://attack.mitre.org/techniques/T1546/004/)
- [attack.mitre.org: Boot or Logon Initialization Scripts: RC Scripts (T1037.004)](https://attack.mitre.org/techniques/T1037/004/)
- [attack.mitre.org: Modify Authentication Process: Pluggable Authentication Modules (T1556.003)](https://attack.mitre.org/techniques/T1556/003/)
- [attack.mitre.org: Rootkit (T1014)](https://attack.mitre.org/techniques/T1014/)
- [attack.mitre.org: Disable or Modify Tools: Disable or Modify Linux Audit System Log (T1685.004)](https://attack.mitre.org/techniques/T1685/004/)
- [attack.mitre.org: Indicator Removal: Timestomp (T1070.006)](https://attack.mitre.org/techniques/T1070/006/)
- [man7.org: ld.so(8)](https://man7.org/linux/man-pages/man8/ld.so.8.html)
- [man7.org: crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html)
- [Debian manpages: cron(8)](https://manpages.debian.org/bookworm/cron/cron.8.en.html)
- [Debian manpages: at(1)](https://manpages.debian.org/bookworm/at/at.1.en.html)
- [freedesktop.org: systemd.unit(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)
- [freedesktop.org: systemd.generator(7)](https://www.freedesktop.org/software/systemd/man/latest/systemd.generator.html)
- [freedesktop.org: systemd-delta(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-delta.html)
- [freedesktop.org: systemctl(1)](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
- [freedesktop.org: systemd.timer(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- [freedesktop.org: loginctl(1)](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html)
- [GitHub: systemd, src/login/logind-user.c](https://github.com/systemd/systemd/blob/main/src/login/logind-user.c)
- [OpenBSD: sshd_config(5)](https://man.openbsd.org/sshd_config)
- [OpenBSD: sshd(8)](https://man.openbsd.org/sshd)
- [OpenSSH: Release notes](https://www.openssh.com/releasenotes.html)
- [GitHub: openssh-portable, auth.c](https://github.com/openssh/openssh-portable/blob/master/auth.c)
- [man7.org: dpkg(1)](https://man7.org/linux/man-pages/man1/dpkg.1.html)
- [man7.org: dpkg-query(1)](https://man7.org/linux/man-pages/man1/dpkg-query.1.html)
- [Debian manpages: debsums(1)](https://manpages.debian.org/bookworm/debsums/debsums.1.en.html)
- [rpm.org: rpm(8)](https://rpm-software-management.github.io/rpm/man/rpm.8.html)
- [AIDE: The AIDE manual](https://aide.github.io/doc/)
- [man7.org: auditctl(8)](https://man7.org/linux/man-pages/man8/auditctl.8.html)
- [man7.org: augenrules(8)](https://man7.org/linux/man-pages/man8/augenrules.8.html)
- [man7.org: ausearch(8)](https://man7.org/linux/man-pages/man8/ausearch.8.html)
- [GitHub: Neo23x0/auditd, audit.rules](https://github.com/Neo23x0/auditd/blob/master/audit.rules)
- [GitHub: osquery, crontab table spec](https://github.com/osquery/osquery/blob/master/specs/posix/crontab.table)
- [GitHub: osquery, authorized_keys table spec](https://github.com/osquery/osquery/blob/master/specs/posix/authorized_keys.table)
- [GitHub: osquery, systemd_units table spec](https://github.com/osquery/osquery/blob/master/specs/linux/systemd_units.table)
- [Elastic Security Labs: Linux Detection Engineering, a primer on persistence mechanisms](https://www.elastic.co/security-labs/primer-on-persistence-mechanisms)
- [Elastic Security Labs: Hooked on Linux, Rootkit Detection Engineering](https://www.elastic.co/security-labs/linux-rootkits-2-caught-in-the-act)
- [Palo Alto Networks Unit 42: Hildegard, New TeamTNT Cryptojacking Malware Targeting Kubernetes](https://unit42.paloaltonetworks.com/hildegard-malware-teamtnt/)
- [Sandfly Security: Linux Medusa Rootkit Detection and De-Cloaking](https://sandflysecurity.com/blog/linux-medusa-rootkit-detection-and-de-cloaking)
- [Linux kernel documentation: Tainted kernels](https://docs.kernel.org/admin-guide/tainted-kernels.html)