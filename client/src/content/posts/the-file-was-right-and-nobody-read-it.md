## The setting was correct and it was never consulted

A service is failing with "too many open files". Somebody adds a line to
`/etc/security/limits.conf`:

```
appuser  soft  nofile  65536
appuser  hard  nofile  65536
```

They log out, log back in, run `ulimit -n`, and get 65536. The setting is
correct and it has taken effect. They restart the service, which continues to
fail at exactly the same point.

Nothing is broken. `pam_limits(8)` describes itself in one sentence: it "sets
limits on the system resources that can be obtained in a user-session". It is
a PAM module. PAM runs when somebody authenticates. A unit that systemd
started at boot never authenticated as anybody, so the file was not read, and
it will not be read after a reboot either.

The check that appeared to pass was a login session. That session did
authenticate, PAM did run, and it genuinely has 65536. Two different
mechanisms, and the one that was tested is not the one in the path.

## Five mechanisms, and they are not a chain

The instinct is to look for a precedence order. There is not one. These apply
to different kinds of process, and the first question is always how the
process got started.

| Mechanism | Applies to |
|---|---|
| `/etc/security/limits.conf` | login sessions, via pam_limits |
| `DefaultLimitNOFILE` | units systemd starts |
| `LimitNOFILE=` in a unit | that unit |
| the container runtime's nofile | what the runtime starts |
| `fs.nr_open` | a ceiling on any hard limit, everywhere |

And separately, `fs.file-max`, which is not a per-process limit at all.

The consequences are not symmetrical. A cron job on a systemd host, with
nothing in `limits.conf`, gets neither the file nor systemd's defaults: it
gets the kernel's own pair, which is a soft of 1024 and a hard of **4096**.
Not 524288. People are surprised by that number because they have read
systemd's, and systemd's was never in scope.

## The soft limit is a starting point

`ulimit -n` shows the soft limit and the soft limit is what is enforced. The
hard limit is a ceiling, and a process may raise its own soft limit up to it
at any time, with no privilege at all. `getrlimit(2)` reserves
`CAP_SYS_RESOURCE` for raising the *hard* limit.

So systemd shipping 1024 soft and 524288 hard is not a compromise, it is a
design, and `systemd.exec(5)` says why:

> Be careful when raising the soft limit above 1024, since select(2) cannot
> function with file descriptors above 1023 on Linux. Nowadays, the hard limit
> defaults to 524288, a very high value compared to historical defaults.
> Typically applications should increase their soft limit to the hard limit on
> their own, if they are OK with working with file descriptors above 1023.

A low soft limit protects anything still calling `select()`, where an fd of
1024 or more writes past the end of an `fd_set` and corrupts memory rather
than returning an error. A high hard limit lets anything that knows better
take the lot in one `setrlimit` call.

Which produces two very different services on one host. A daemon that raises
itself is running at 524288 and the soft value in its unit never mattered. One
that does not is at 1024 on a machine that would have allowed half a million.
The only way to know which you have is to look:

```
$ cat /proc/$(systemctl show -p MainPID --value thing.service)/limits
Limit                     Soft Limit           Hard Limit           Units
Max open files            524288               524288               files
```

## Setting LimitNOFILE can lower a ceiling

A unit's `LimitNOFILE=65536` replaces both halves of the default, not just the
soft one. So that unit now has 65536 soft and 65536 hard, where it previously
had 1024 and 524288.

For a daemon that raises itself, that is a reduction: it used to reach 524288
and now reaches 65536. Somebody trying to help has capped it. Write both when
you mean both:

```
LimitNOFILE=65536:524288
```

## Infinity is 1048576

`LimitNOFILE=infinity` looks like the end of the conversation. `getrlimit(2)`
is explicit that raising the hard limit above `/proc/sys/fs/nr_open` returns
`EPERM`, and `fs.nr_open` defaults to 1048576, so infinity is a million and a
bit.

Mostly harmless. Occasionally not: a program that reads its hard limit and
allocates a table of that size gets a million entries rather than four
billion, which is the difference between a large allocation and an immediate
death. Write the number you mean.

## A limit of 1024 and a descriptor numbered 1024

`getrlimit(2)` defines `RLIMIT_NOFILE` as "a value one greater than the maximum
file descriptor number that can be opened by this process".

So a limit of 1024 permits descriptors 0 through 1023, and a program reporting
a failure on descriptor 1024 with a limit of 1024 is being consistent rather
than contradicting itself. The off by one is in the kernel's definition. It
also means the process can hold exactly 1024 of them, stdin, stdout and stderr
included.

## Two limits, two errnos, one message

Almost every library renders both as "too many open files", and they point at
different files on different machines.

**EMFILE** is this process against its own `RLIMIT_NOFILE`.

**ENFILE** is the whole machine against `fs.file-max`. It arrives while the
process reporting it is nowhere near its own limit, which is why raising that
limit does nothing and why the investigation goes in circles. The process that
reports the error is usually not the one that caused it: it is whichever one
happened to ask next, and the actual leaker is somewhere else entirely,
quietly holding four hundred thousand descriptors it opened last Tuesday.

Read the errno rather than the message. `strace` the failing call, or:

```
$ cat /proc/sys/fs/file-nr
899104	0	900000
```

The first field is descriptors allocated machine wide and the third is
`fs.file-max`. If those are close, no per-process limit will help anybody, and
the job is to find the leaker:

```
$ for p in /proc/[0-9]*; do echo "$(ls $p/fd 2>/dev/null | wc -l) $p"; done | sort -rn | head
```

## Containers bring their own

A container runtime sets rlimits on the process it starts, so the host's
arrangements for its own units and its own logins are not in scope at all.
That is why the same image behaves differently under different runtimes and
different orchestrators, and why "it works on my machine" survives
containerisation intact.

Read `/proc/1/limits` inside the container. It is the only place the answer is
not a guess.

## Reading it on a real host

```
$ cat /proc/$(systemctl show -p MainPID --value thing.service)/limits
```

The limits of the thing that is actually failing. This is the reading that
settles it, and a shell cannot substitute for it, because a shell only tells
you about shells.

```
$ systemctl show -p LimitNOFILE -p LimitNOFILESoft thing.service
```

What systemd set, which is a different question from what the process has
now, because the process may have raised itself since.

```
$ prlimit --pid 1234 --nofile
```

Reads a running process, and with a value, changes it without a restart.
Useful in an incident when the alternative is losing state.

Then three questions:

1. How did the process get started? That decides which mechanism was in
   scope, and it is the first question rather than the last.
2. Is it EMFILE or ENFILE? One is yours and one is the machine's, and they
   have nothing to do with each other.
3. Does the program raise its own soft limit? If it does, only the hard limit
   ever mattered, and setting a soft value in the unit achieved nothing.

And if somebody has already edited `limits.conf` for a service, take the line
out. It changed nothing, and leaving it there means the next person spends an
afternoon reading a file that was never in the path.

You can work through ten of these, including the one that gets 4096 and the
one where the shell was telling the truth, at
[too many open files](/limits).

## References

- [getrlimit(2), on soft and hard limits, EPERM against nr_open, and RLIMIT_NOFILE being one greater](https://man7.org/linux/man-pages/man2/getrlimit.2.html)
- [pam_limits(8), on limits.conf applying to a user session](https://man7.org/linux/man-pages/man8/pam_limits.8.html)
- [systemd.exec(5), on LimitNOFILE, the 524288 hard default and why the soft one stays at 1024](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [proc_sys_fs(5), on file-max and nr_open](https://man7.org/linux/man-pages/man5/proc_sys_fs.5.html)
