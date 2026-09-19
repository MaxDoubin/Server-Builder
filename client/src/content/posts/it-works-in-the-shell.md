## The backup ran every night for six weeks and there is nothing to restore

The crontab is right there:

```
0 2 * * * /home/mika/bin/snapshot.sh >/dev/null 2>&1
```

Cron agrees that it ran:

```
$ journalctl -u cron --since "2 days ago" | grep snapshot
Sep 17 02:00:01 app01 CRON[24310]: (mika) CMD (/home/mika/bin/snapshot.sh >/dev/null 2>&1)
Sep 18 02:00:01 app01 CRON[26902]: (mika) CMD (/home/mika/bin/snapshot.sh >/dev/null 2>&1)
```

Run the script by hand and it takes four minutes and leaves a file behind. Under cron it takes about a second and leaves nothing, and nobody noticed for six weeks because of the redirect at the end of that line.

The script is not broken and cron is not broken. Cron ran it in a different environment than the one you tested in, and the differences are few, fixed and documented.

## The environment cron gives you, and nothing else

crontab(5) is unusually specific about what a job starts with:

> SHELL is set to /bin/sh, and LOGNAME and HOME are set from the /etc/passwd line of the crontab's owner.

Three variables, named. What the sentence does not mention is your shell's startup files, because cron runs neither a login shell nor an interactive one. `/etc/profile`, `~/.bash_profile`, `~/.bashrc` and `~/.profile` are never read. Every PATH entry those files append, every `pyenv` shim they install, every `SSH_AUTH_SOCK` they export, is not there.

Do not reason about which survived. Print them:

```
* * * * * /usr/bin/env > /tmp/cronenv 2>&1
```

A minute later, on a Debian host with a user crontab, I get six lines:

```
SHELL=/bin/sh
PWD=/home/mika
LOGNAME=mika
HOME=/home/mika
LANG=en_US.UTF-8
PATH=/usr/bin:/bin
```

My interactive shell on the same box has about fifty. `LANG` is there only because Debian's cron goes through PAM and `pam_env` reads `/etc/environment` and `/etc/default/locale`. Where that does not happen the line is absent, which is its own bug the first time a script sorts text.

## PATH, and the exact value

Debian and Ubuntu ship Vixie cron. When a crontab has no PATH line of its own, `entry.c` supplies one:

```c
if (!env_get("PATH", e->envp)) {
        sprintf(envstr, "PATH=%s", _PATH_DEFPATH);
```

and `_PATH_DEFPATH` is glibc's, from `paths.h`:

```c
/* Default search path. */
#define	_PATH_DEFPATH	"/usr/bin:/bin"
```

Two directories. Fedora and RHEL ship cronie, which does the same with `_PATH_STDPATH`, `/usr/bin:/bin:/usr/sbin:/sbin`, unless the daemon was started with `-P`: "Don't set PATH. PATH is instead inherited from the environment."

Four directories at the most, and `/usr/local/bin` is in neither list. Neither is `~/.local/bin`, `/opt/vendor/bin`, or wherever `go install` and `pip install --user` put the binary you are calling. That is the whole failure, most of the time:

```
/bin/sh: 1: restic: not found
```

Exit status 127. If the script does not check it, the archive is never uploaded and the script still exits 0, on the strength of the last command that did work.

You can set PATH in the crontab, above the schedule lines, but read the warning first. crontab(5) says the value "is not parsed for environmental substitutions or replacement of variables or tilde(~) expansion, thus lines like" `PATH=$HOME/bin:$PATH` "will not work as you might expect." There is no error. Your PATH contains the literal characters `$HOME`, which resolves nothing.

## /bin/sh is not bash

crontab(5) on the sixth field:

> The entire command portion of the line, up to a newline or a "%" character, will be executed by /bin/sh or by the shell specified in the SHELL variable of the cronfile.

On Debian and Ubuntu, `/bin/sh` is dash. `[[`, arrays, `source`, `${var,,}` and process substitution are all bash, and dash reports them the way it reports any unknown word:

```
/bin/sh: 1: [[: not found
```

The distinction that matters: this is the command string in the crontab, not a script with a shebang. If the line calls `snapshot.sh` and that file begins with `#!/bin/bash`, bash runs it and bash syntax is fine. SHELL bites you when the logic is inline, when the script has no shebang, or when it says `#!/bin/sh` on top and has bash syntax underneath, which passes every test because you have been running it as `bash snapshot.sh`.

Setting `SHELL=/bin/bash` in the crontab is legal and usually the wrong instinct. Put the work in a script, give it an honest shebang, and keep the crontab line to a path.

## No terminal, and the things that check

Cron gives a job no controlling terminal, so anything calling `isatty()` takes its other branch: `git` will not page, `ls` drops color, `docker run -it` fails outright.

The expensive case is authentication. `ssh` with a passphrase-protected key wants to prompt, finds no terminal and no `SSH_AUTH_SOCK` (your agent was set up by a login shell that never ran), and falls through:

```
Permission denied (publickey).
```

Add `-o BatchMode=yes` to every `ssh`, `scp` and `rsync -e ssh` in a cron job. It does not fix the auth, it makes the failure immediate instead of a hang. `gpg` needs `--batch` for the same reason, and `sudo` needs `NOPASSWD` or it will not work from cron at all.

## The percent sign, which nobody guesses

This one is in the man page and still catches everyone:

> A "%" character in the command, unless escaped with a backslash (\\), will be changed into newline characters, and all data after the first % will be sent to the command as standard input.

So this:

```
5 3 * * * tar -czf /srv/backups/db-$(date +%F).tar.gz /var/lib/db
```

is not a tar command. The command is everything up to the first percent, `tar -czf /srv/backups/db-$(date +`, an unterminated command substitution, and `F).tar.gz /var/lib/db` arrives on its standard input.

Watch the mechanism directly:

```
* * * * * cat > /tmp/pct %one%two
```

A minute later:

```
$ cat /tmp/pct
one
two
```

The command was `cat > /tmp/pct `. Everything after the first percent became the input, and the remaining percent became a newline. Escape each one as `\%`, or move the `date` call inside a script, where percent means what it means everywhere else.

## The output went to mail, and there is no mail

crontab(5) on where a job's output goes:

> If MAILTO is defined (and non-empty), mail is sent to the specified address. If MAILTO is defined but empty (MAILTO=""), no mail is sent. Otherwise, mail is sent to the owner of the crontab.

"Otherwise" is the default, and on a server with no MTA there is nothing to hand the message to. The error that says your job failed becomes an error about delivering the error. The reflex everybody copies, `>/dev/null 2>&1`, is not the cause of the silence. It is the second cause, and the one that makes it permanent.

Send output somewhere a human can reach:

```
MAILTO=ops@example.net
0 2 * * * /home/mika/bin/snapshot.sh >> /var/log/snapshot.log 2>&1
```

or pipe it into `logger -t snapshot` so it lands in the journal alongside [everything else you already centralize](/blog/syslog-centralized-logging). Watch the order in `>> file 2>&1`: redirect stdout first, then point stderr at the same place. `2>&1 >> file` points stderr wherever stdout used to go, then moves stdout. It is backwards, and it looks identical.

## run-parts, and the file with a dot in it

Drop-in directories are a separate trap with the same symptom. Debian's `/etc/crontab` runs them:

```
17 * * * *  root  cd / && run-parts --report /etc/cron.hourly
```

and run-parts(8) is explicit about which files it will touch:

> run-parts runs all the executable files named within constraints described below, found in directory directory. Other files and directories are silently ignored.

> If neither the --lsbsysinit option nor the --regex option is given then the names must consist entirely of ASCII upper- and lower-case letters, ASCII digits, ASCII underscores, and ASCII minus-hyphens.

A period is not on that list. `/etc/cron.daily/snapshot` runs. `/etc/cron.daily/snapshot.sh` does not, and neither does `snapshot.bak` or `snapshot~`. Nothing is logged, because "silently ignored" is the documented behavior and not a bug.

I lost a week of a rotation job to this. What would have told me in one second:

```
$ run-parts --test /etc/cron.daily
/etc/cron.daily/apt-compat
/etc/cron.daily/dpkg
/etc/cron.daily/logrotate
```

`--test` prints the names it would run without running them. If your script is not in that output, the schedule was never the problem. Check the executable bit in the same breath: a file matching the name rule that is not `+x` is skipped as well.

## Reproducing it without waiting until 2am

`env -i` starts a command with an empty environment, so you can rebuild cron's by hand and see the failure on demand:

```
$ env -i SHELL=/bin/sh HOME=/home/mika LOGNAME=mika PATH=/usr/bin:/bin \
    setsid /bin/sh -c '/home/mika/bin/snapshot.sh' < /dev/null 2>&1 | cat
```

`env -i` removes everything your login shell built, and the four assignments put back exactly what cron sets. `setsid` runs it in a new session with no controlling terminal, `< /dev/null` gives it cron's empty stdin, and the pipe into `cat` makes stdout something other than a tty. Almost every one of these bugs reproduces from that one command.

The ground truth is still cron. Schedule the thing five minutes out, output going to a file, and read the file.

## What to do

Absolute paths for every binary, or a PATH line written out in full at the top of the crontab. One script per job, with a real shebang and `set -eu`, and a crontab entry that is a path and a redirect and nothing else. No percent signs. An explicit `MAILTO` and a log file, at least until you have watched it succeed twice.

If the job has ordering requirements, needs a timeout, or must not overlap with itself, this is where a [systemd timer earns its keep](/blog/systemd-units-that-behave): the unit states its environment, `systemctl status` says whether the last run failed, and output reaches the journal without you arranging it. Cron's advantage is that the schedule is one line, and if you want to check that line says what you think, there is [a cron expression explainer](/tools/cron-explainer) here.

## The questions, in order

1. Did it run at all? `journalctl -u cron`, or `grep CRON /var/log/syslog`. No logged invocation means the schedule or the file name, not the script.
2. What environment did it get? Run `env` from cron once and read the file. Do not reconstruct it from memory.
3. Is the binary on cron's PATH? Two directories on Debian, four on cronie, and `/usr/local/bin` is not one of them.
4. What shell ran it? Inline logic runs under `/bin/sh`. A script runs under its shebang.
5. Is there a percent in the crontab line? Everything after the first one is standard input.
6. Where did the output go? If the answer is `/dev/null`, you have no evidence, and getting some is the next step, not a later one.

None of those are about the schedule, and the schedule is the first thing everybody changes.

## References

- [crontab(5), on the environment, MAILTO and the percent sign](https://man7.org/linux/man-pages/man5/crontab.5.html)
- [cron(8), on -P and where output is mailed](https://man7.org/linux/man-pages/man8/cron.8.html)
- [run-parts(8), on which file names are run and which are ignored](https://manpages.debian.org/trixie/debianutils/run-parts.8.en.html)
- [Debian crontab(5), on why PATH=$HOME/bin does not work](https://manpages.debian.org/trixie/cron/crontab.5.en.html)
- [Debian cron entry.c, where the default PATH is set](https://salsa.debian.org/debian/cron/-/blob/master/entry.c)
- [cronie entry.c, the same code with _PATH_STDPATH](https://github.com/cronie-crond/cronie/blob/master/src/entry.c)
- [glibc paths.h, for _PATH_DEFPATH and _PATH_STDPATH](https://sourceware.org/git/?p=glibc.git;a=blob;f=sysdeps/unix/sysv/linux/paths.h)
- [env(1), for -i and an empty environment](https://man7.org/linux/man-pages/man1/env.1.html)
- [systemd.timer(5), for the alternative](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)