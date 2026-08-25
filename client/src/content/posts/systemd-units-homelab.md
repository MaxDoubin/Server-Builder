
## Why I stopped using screen and cron

For a long time my self written services ran inside a terminal multiplexer, started by hand, with output going to a log file I redirected myself. It works right up until the machine reboots at 4 in the morning and nothing comes back, or until the process dies and nobody notices for a week.

systemd solves all of that, and the cost is one text file. You get automatic start at boot, restart on failure, dependency ordering, structured logging, resource limits, and a sandbox, without writing any of it yourself.

## The minimum viable unit

Put this at `/etc/systemd/system/metrics-collector.service`:

```ini
[Unit]
Description=Metrics collector
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=metrics
Group=metrics
WorkingDirectory=/opt/metrics
ExecStart=/opt/metrics/venv/bin/python -u collector.py
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now metrics-collector
journalctl -u metrics-collector -f
```

Two details worth calling out. `After=network-online.target` with the matching `Wants=` is what you need when the service must reach the network at startup; plain `network.target` only means the networking stack has been configured, not that an address exists. And `-u` on Python, or the equivalent for your runtime, disables output buffering so logs appear in the journal immediately instead of in 4 KB bursts.

Never run a service as root because it was easier. Create a system user with no shell and no home directory.

## Restart policy, and not making things worse

`Restart=on-failure` restarts on a non zero exit or a signal, but not on a clean exit. `Restart=always` restarts even on success, which is right for a daemon that should never exit and wrong for anything that legitimately finishes.

The failure mode people hit is a service that crashes instantly because a dependency is down, restarts, crashes, and hammers that dependency hundreds of times a minute. Rate limiting is built in:

```ini
Restart=on-failure
RestartSec=5s
StartLimitIntervalSec=300
StartLimitBurst=5
```

Five failures in five minutes and systemd stops trying and leaves the unit in a failed state, which is exactly what you want, because a unit sitting in `failed` is visible and a unit in a crash loop looks like it is running.

## Sandboxing you get for free

This is the part I wish I had used sooner. A handful of directives dramatically reduce what a compromised service can reach:

```ini
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/metrics
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
```

`ProtectSystem=strict` makes the entire filesystem read only except `/dev`, `/proc`, `/sys`, and whatever you list in `ReadWritePaths`. That single line stops a lot of bad outcomes.

Grade your work:

```bash
systemd-analyze security metrics-collector.service
```

It scores each unit and lists what you left open. Do not chase a perfect score, but going from wide open to reasonably locked down is usually ten minutes of work. Add directives one at a time and restart between each, because `SystemCallFilter` in particular will break runtimes that need something you did not anticipate.

## Timers instead of cron

For periodic work, timers beat cron: the same logging, the same dependency handling, the same sandboxing, plus the ability to catch up on missed runs after downtime.

A oneshot service:

```ini
[Unit]
Description=Nightly config backup

[Service]
Type=oneshot
User=backup
ExecStart=/usr/local/bin/backup-configs.sh
```

And its timer, at `backup-configs.timer`:

```ini
[Unit]
Description=Run config backup nightly

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` runs a missed job after the machine comes back up. `RandomizedDelaySec` staggers things so twelve hosts do not all hit the same target at once. Enable the timer, not the service.

```bash
systemctl list-timers --all
```

## Debugging

`systemctl status` for the current state and the last few log lines. `journalctl -u name -b` for this boot, `-p err` to filter by priority, `--since "10 min ago"` to narrow. `systemd-analyze verify unit.service` catches syntax and dependency mistakes before you deploy them, which is worth running in CI if you keep unit files in a repository.

Two failure patterns cover most of what I hit. When a unit refuses to start and the logs say nothing useful, comment out the sandboxing directives and add them back one by one; that is the answer perhaps four times out of five. And when a unit starts fine by hand but fails at boot, it is an ordering problem: something it needs, usually the network or a mounted filesystem, was not ready yet, and the fix is a correct `After=` and `Requires=` rather than a sleep in the start script.

## References

- [systemd.service manual page](https://man.archlinux.org/man/systemd.service.5)
- [systemd.timer manual page](https://man.archlinux.org/man/systemd.timer.5)
- [systemd.exec manual page](https://man.archlinux.org/man/systemd.exec.5)
- [systemd-analyze manual page](https://man.archlinux.org/man/systemd-analyze.1)
- [Control Group v2 kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
