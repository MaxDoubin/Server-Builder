
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

The other high value directive is the restart policy. `Restart=always` on a service with a config error gives you an infinite crash loop that fills the journal. Use `on-failure`, and set rate limits so systemd gives up and tells you instead of hammering forever.

```ini
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
```

That means: five failures in five minutes and the unit goes into a failed state and stays there. Which is what you want, because a service flapping silently is worse than a service that is clearly down.

## Ordering versus requirement

These are two independent things and conflating them causes most boot ordering bugs.

- `After=` and `Before=` control **order only**. They do not pull anything in.
- `Wants=` pulls a unit in but does not fail if it fails. The soft dependency.
- `Requires=` pulls it in and fails your unit if it fails. Note this still says nothing about order, so you nearly always want `Requires=` plus `After=` together.
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
StartLimitIntervalSec=300
StartLimitBurst=5
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

Those sandboxing directives are free security. `ProtectSystem=strict` makes the entire filesystem read only except what you list in `ReadWritePaths=`. `SystemCallFilter=@system-service` blocks whole categories of syscalls a normal daemon never needs.

Grade your work:

```bash
systemd-analyze security metrics-collector.service
```

It scores each unit and lists exactly which directive would improve it. It is the fastest security win available on a Linux box.

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

Check schedules with `systemctl list-timers --all`, and test a calendar expression before trusting it with `systemd-analyze calendar "*-*-* 03:30:00"`.

## The habits that stick

Put a `Documentation=` line pointing at the runbook in every unit. Future you, at 3am, will follow that link.

Use drop ins rather than editing packaged units: `systemctl edit foo.service` creates an override that survives package upgrades.

Always run `systemd-analyze verify` on a new unit before enabling it, and always `systemctl daemon-reload` after editing. Half of "my change did nothing" is a forgotten reload.

## References

- [systemd.service(5)](https://man.archlinux.org/man/systemd.service.5)
- [systemd.exec(5), sandboxing directives](https://man.archlinux.org/man/systemd.exec.5)
- [systemd.unit(5), dependencies and ordering](https://man.archlinux.org/man/systemd.unit.5)
- [systemd.timer(5)](https://man.archlinux.org/man/systemd.timer.5)
- [systemd.resource-control(5)](https://man.archlinux.org/man/systemd.resource-control.5)
