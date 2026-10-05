
## The unit file is a contract

Most self hosted services I see are wrapped in a systemd unit that was copied from a forum post, has `Type=simple`, `Restart=always`, runs as root, and orders itself after `network.target`. Every one of those four choices is probably wrong, and each has a real consequence.

A unit file is a contract with the init system: here is how to start me, here is how to know I am ready, here is what to do when I die, here is what I am allowed to touch. Fill it in properly once and you stop babysitting the service.

## Type= and Restart=, the two that matter most

`Type=` tells systemd when to consider the service started, which is what everything ordered after it waits on.

- `simple`: considered started the instant the process is forked. Almost always wrong for anything else that depends on it, because the process has not bound its socket yet.
- `exec`: started once the binary has actually been executed successfully. A strictly better default than `simple`.
- `forking`: for daemons that background themselves. Needs `PIDFile=`. Avoid writing new services this way.
- `notify`: the service tells systemd when it is ready via the notify socket. This is the correct answer if your software supports it.
- `oneshot`: runs to completion. Pair with `RemainAfterExit=yes` for setup tasks.

If a dependent service intermittently fails at boot but works fine when you start it by hand, this directive is where to look.

The other high value directive is the restart policy. `Restart=always` on a service with a config error gives you an infinite crash loop that fills the journal. Use `on-failure`, which restarts after a non-zero exit, a fatal signal or a timeout but leaves a clean exit alone, so it also suits jobs that legitimately finish. Then set rate limits so systemd gives up and tells you instead of hammering forever. The limits are what actually end the loop: a config error exits non-zero, so `on-failure` alone would retry it just as tirelessly, and a service that crashes because a dependency is down would keep hammering that dependency.

```ini
[Unit]
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Restart=on-failure
RestartSec=5s
```

That means: five failures in five minutes and the unit goes into a failed state and stays there. Which is what you want, because a service flapping silently is worse than a service that is clearly down.

Mind the section. The `StartLimit` settings belong in `[Unit]`. Put `StartLimitIntervalSec=` under `[Service]` and systemd logs "Unknown key name 'StartLimitIntervalSec' in section 'Service', ignoring", keeps the default 10 second window, and a 5 second `RestartSec` never trips it. The unit loops forever, which is exactly what the limit was there to prevent.

## Ordering versus requirement

These are two independent things and conflating them causes most boot ordering bugs.

- `After=` and `Before=` control **order only**. They do not pull anything in.
- `Wants=` pulls a unit in but does not fail if it fails. The soft dependency.
- `Requires=` pulls it in, and fails your unit if it fails **only when you also set `After=` on the failing unit**. Without the ordering the two start together, yours is already up when the other fails, and the requirement quietly did nothing. It says nothing about order on its own, which is why you want `Requires=` plus `After=` together every time.
- `BindsTo=` is `Requires=` plus: your unit stops if the other one stops later.

On networking specifically, `network.target` means "the network stack is being brought up", not "you have an IP address". If your service binds to a specific address at startup, you want `network-online.target`, and that target only works if the corresponding wait service is enabled.

## A unit I would actually ship

```ini
# /etc/systemd/system/metrics-collector.service
[Unit]
Description=Metrics collector
Documentation=https://example.internal/runbooks/metrics-collector
Wants=network-online.target
After=network-online.target
Requires=postgresql.service
After=postgresql.service
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=exec
User=metrics
Group=metrics
WorkingDirectory=/opt/metrics-collector
EnvironmentFile=/etc/metrics-collector/env
ExecStart=/opt/metrics-collector/bin/collector --config /etc/metrics-collector/config.yml
ExecReload=/bin/kill -HUP $MAINPID

Restart=on-failure
RestartSec=5s
TimeoutStopSec=30

# Sandboxing: cheap, effective, and almost nobody sets it
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
ReadWritePaths=/var/lib/metrics-collector

# Resource ceilings so one service cannot take the host down
MemoryMax=2G
TasksMax=256

[Install]
WantedBy=multi-user.target
```

Create the account it runs as first: a system user with no login shell and no home directory, because nothing should run as root just because that was easier. Then load, enable and watch it:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin metrics
sudo systemctl daemon-reload
sudo systemctl enable --now metrics-collector
journalctl -u metrics-collector -f
```

If the service is a script, turn off output buffering (`python -u`, or the equivalent for your runtime) so log lines reach the journal as they are written instead of in delayed bursts.

Those sandboxing directives are free security. `ProtectSystem=strict` makes the entire filesystem read only except the API filesystems (`/dev`, `/proc` and `/sys`, which the `PrivateDevices=` and `Protect` lines cover) and whatever you list in `ReadWritePaths=`. `SystemCallFilter=@system-service` blocks whole categories of syscalls a normal daemon never needs.

Grade your work:

```bash
systemd-analyze security metrics-collector.service
```

It scores each unit and lists exactly which directive would improve it. It is the fastest security win available on a Linux box. Do not chase a perfect score; going from wide open to reasonably locked down is usually ten minutes of work. When you retrofit an existing service, add the directives one at a time and restart between each, because `SystemCallFilter=` in particular will break runtimes that need something you did not anticipate.

## Timers instead of cron

For anything scheduled that matters, timers beat cron: they log to the journal, they inherit all the sandboxing above, they can catch up on missed runs, and they will not stampede.

```ini
# /etc/systemd/system/backup-verify.timer
[Unit]
Description=Verify backup integrity nightly

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=900
AccuracySec=1m

[Install]
WantedBy=timers.target
```

`Persistent=true` runs the job on next boot if the machine was off at the scheduled time. `RandomizedDelaySec` spreads load so twenty machines do not all hit the backup target at 03:30:00 exactly.

A timer starts the service with the same name unless you set `Unit=`, so this one needs a `backup-verify.service`, written as a oneshot:

```ini
# /etc/systemd/system/backup-verify.service
[Unit]
Description=Verify backup integrity

[Service]
Type=oneshot
User=backup
ExecStart=/usr/local/bin/verify-backups.sh
```

It has no `[Install]` section because nothing but the timer should start it. Enable the timer, not the service: `sudo systemctl enable --now backup-verify.timer`.

Check schedules with `systemctl list-timers --all`, and test a calendar expression before trusting it with `systemd-analyze calendar "*-*-* 03:30:00"`.

## When a unit misbehaves

`systemctl status name` shows the current state and the last few log lines. For more, `journalctl -u name -b` limits the journal to this boot, `-p err` filters by priority, and `--since "10 min ago"` narrows the window.

Two failure patterns cover most of what I hit. When a unit refuses to start and the logs say nothing useful, comment out the sandboxing directives and add them back one by one; that is the answer perhaps four times out of five. When a unit starts fine by hand but fails at boot, it is an ordering problem: something it needs, usually the network or a mounted filesystem, was not ready yet. Either the unit is missing the right `After=` and `Requires=`, or the dependency reports itself started too early (the `Type=` problem above). Fix the dependency declarations rather than adding a sleep to the start script.

## The habits that stick

Put a `Documentation=` line pointing at the runbook in every unit. Future you, at 3am, will follow that link.

Use drop ins rather than editing packaged units: `systemctl edit foo.service` creates an override that survives package upgrades.

Always run `systemd-analyze verify` on a new unit before enabling it, and in CI if you keep unit files in a repository. It catches syntax and dependency mistakes, including a setting in the wrong section like the misplaced `StartLimitIntervalSec=` above. And always `systemctl daemon-reload` after editing. Half of "my change did nothing" is a forgotten reload.

There are ten sets of unit files to work through at [it started before the
thing it needs](/units), including the one where `systemctl start` returns zero
and the binary does not exist.

## References

- [systemd.service(5)](https://man.archlinux.org/man/systemd.service.5)
- [systemd.exec(5), sandboxing directives](https://man.archlinux.org/man/systemd.exec.5)
- [systemd.unit(5), dependencies and ordering](https://man.archlinux.org/man/systemd.unit.5)
- [systemd.timer(5)](https://man.archlinux.org/man/systemd.timer.5)
- [systemd.resource-control(5)](https://man.archlinux.org/man/systemd.resource-control.5)
- [systemd-analyze(1)](https://man.archlinux.org/man/systemd-analyze.1)
- [Control Group v2 kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
