
## The script you no longer write

A SysV init script is a program that answers four questions: how to start, how
to stop, how to restart, and whether it is running. Most of them were three
hundred lines and two hundred and eighty of those lines were the same three
hundred lines from the last package, adapted. Background the process. Write a
PID file. Read the PID file back and hope the number still belongs to you. Fake
a status check by sending signal 0. Redirect stdout somewhere and rotate it
later.

A unit file answers a different question. It does not tell the system how to
manage the process, it describes the process and lets PID 1 do the managing.
Everything the init script implemented by hand, systemd already implements
once: process supervision, ordering, restart, output capture, resource limits.
The translation is mostly deletion.

```ini
# /etc/systemd/system/inventory-api.service
[Unit]
Description=Inventory API
Documentation=https://wiki.lab.example/runbooks/inventory-api

[Service]
Type=exec
ExecStart=/opt/inventory/bin/api --config /etc/inventory/api.toml
User=inventory
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

No PID file, no daemonising, no logging setup. If your daemon has a
`--daemonize` flag, do not use it: systemd wants the process in the
foreground so it can supervise it directly.

## The unit types you will meet

There are eleven, and five carry the weight.

`.service` is a process. `.socket` is a listening socket systemd holds open
and hands to a service when a connection arrives, which is how you bind port
443 without the service ever having the capability to do it. `.target` is a
grouping and a synchronisation point, and is what replaced runlevels:
`multi-user.target` is roughly runlevel 3, `graphical.target` roughly
runlevel 5. `.timer` replaces a crontab entry and logs like everything else.
`.mount` and `.automount` are generated from `/etc/fstab`, which is why a bad
fstab line now fails as a unit.

```bash
systemctl list-units --type=target
systemctl list-unit-files --state=enabled
```

Anything still shipping an init script gets wrapped by
`systemd-sysv-generator` at boot into a real unit, and its LSB
`# Required-Start:` header is translated into ordering. That is why a legacy
script mostly keeps working, and also why `systemctl status` on it shows a
generated unit you cannot find on disk.

## After= is not Requires=, and this is the one that bites

An init script encoded dependency as a number in a filename: `S20postgresql`
sorted before `S40inventory`, so the database went first. That was ordering
and requirement at the same time, because there was only one mechanism.

systemd splits them, and the split is where most boot bugs live.

- `After=` and `Before=` control **order only**. Neither one causes a unit to
  start.
- `Wants=` causes a unit to start, and does not care if it fails.
- `Requires=` causes it to start, and fails your unit if it fails to start.
- `BindsTo=` is `Requires=` plus: if the other unit stops later, yours stops.

Read that list again with this in mind: `Requires=` says nothing about order.
Two units in a `Requires=` relationship start in parallel by default.

Here is the failure. Somebody writes the obvious thing:

```ini
[Unit]
Description=Inventory API
After=postgresql.service
```

It works on their machine for a year. Then the API is deployed to a host where
PostgreSQL is not enabled, or the database is masked during maintenance, and
the API starts immediately and crashes, because `After=` only orders units
that were already going to start. Ordering an absent unit is a no-op.

The mirror image is just as common: `Requires=postgresql.service` with no
`After=`. The database is pulled in, both units start together, the API opens
a socket to a Postgres that has not finished recovery, and it fails maybe one
boot in four. Intermittent, host-specific, and impossible to reproduce by hand,
because when you type `systemctl start inventory-api` the database has been up
for an hour.

Ask the running system rather than guessing:

```bash
systemctl show inventory-api.service -p Requires -p Wants -p After
```

```text
Requires=system.slice sysinit.target
Wants=
After=system.slice basic.target sysinit.target postgresql.service
```

`postgresql.service` in `After=` and absent from `Requires=` is the bug, in
one line of output. What you almost always want is both directives:

```ini
[Unit]
Requires=postgresql.service
After=postgresql.service
Wants=network-online.target
After=network-online.target
```

`network.target` deserves the same scepticism. It means the networking stack
is being configured, not that an address exists. If the service binds to a
specific address at startup, you need `network-online.target`, and that target
is only meaningful if the matching wait service is enabled.

## Restart policy, and the state that outlives it

`respawn` in `/etc/inittab` had one behaviour: bring it back, forever. That is
`Restart=always`, and on a service with a typo in its config it produces a
crash loop that fills a disk with log lines about the same missing file.

`Restart=on-failure` restarts on a non-zero exit or a signal and leaves a
clean exit alone. Pair it with the rate limiter, which is the part people miss:

```ini
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
```

Five failures in five minutes and systemd stops trying and parks the unit in
`failed`. That is the correct outcome: a unit sitting in `failed` is visible to
every monitoring check you have, while a unit in a crash loop reports as
`activating` and looks alive.

The detail that catches people afterwards is that the start limit is sticky.
Once a unit has tripped it, `systemctl start` refuses until you clear the
counter:

```bash
systemctl reset-failed inventory-api.service
systemctl start inventory-api.service
```

Also note that `StartLimitIntervalSec` and `StartLimitBurst` belong in
`[Unit]`, not `[Service]`. They were moved years ago, and half the examples
online still put them in the wrong section, where they are silently ignored.

## The journal replaces the log file you were managing

Delete the redirection from the init script. Anything the process writes to
stdout or stderr is captured, tagged with the unit, the PID, the boot ID and a
priority, and stored as structured records rather than lines of text. That
changes what a query looks like. The classic centralised
[syslog](/blog/syslog-centralized-logging) pipeline still has a place, and
journald can forward into it, but the local first stop is now a query.

```bash
journalctl -u inventory-api.service -b --since "10 min ago"
journalctl -u inventory-api.service -p err -o short-precise
journalctl -u inventory-api.service -f
journalctl _SYSTEMD_UNIT=inventory-api.service _PID=1432
```

`-b` is this boot, `-b -1` the previous one, which is the fastest way to see
what a machine said before it went down. `-p err` filters by the priority
field, so you are filtering on a real value, not grepping for the string
"error". The underscore-prefixed fields are trusted: journald sets them from
the kernel and the cgroup, so a process cannot forge the unit it belongs to.

Two settings decide whether any of this is there when you need it:

```ini
# /etc/systemd/journald.conf
Storage=persistent
SystemMaxUse=2G
RateLimitIntervalSec=30s
RateLimitBurst=10000
```

Without `Storage=persistent` and a `/var/log/journal` directory, the journal
lives in `/run` and is gone at reboot, which is exactly when you wanted it.
And the rate limiter really does drop messages under it: a service logging
hard during an incident gets truncated, and the only trace is a line saying
some messages were suppressed. Raise the burst on hosts where that matters.

```bash
journalctl --disk-usage
journalctl --vacuum-time=30d
```

## Four commands before you enable anything

```bash
systemd-analyze verify /etc/systemd/system/inventory-api.service
systemctl daemon-reload
systemctl list-dependencies inventory-api.service
systemd-analyze critical-chain inventory-api.service
```

`verify` catches typos and missing referenced units before they become boot
behaviour. `daemon-reload` is the answer to half of all "my change did
nothing". `list-dependencies` shows the tree you actually built rather than
the one you meant. `critical-chain` shows what your unit waited on and for how
long, which is where you find out that the whole boot is held up by a network
wait nobody needed.

Use `systemctl edit` for changes to packaged units so a drop-in survives the
next upgrade, and `systemctl cat` to see the merged result. Between those two
and `verify`, a unit file becomes something you can reason about, which is
more than an init script ever offered.

## References

- [systemd.unit(5): dependencies and ordering](https://man.archlinux.org/man/systemd.unit.5)
- [systemd.service(5)](https://man.archlinux.org/man/systemd.service.5)
- [systemd.special(7): the standard targets](https://man.archlinux.org/man/systemd.special.7)
- [journalctl(1)](https://man.archlinux.org/man/journalctl.1)
- [systemd.journal-fields(7)](https://man.archlinux.org/man/systemd.journal-fields.7)
- [journald.conf(5)](https://man.archlinux.org/man/journald.conf.5)
- [systemd-analyze(1)](https://man.archlinux.org/man/systemd-analyze.1)
