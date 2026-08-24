
## The default is worse than you think

Install something from a tarball, write a five line unit file, enable it, move
on. That is the normal path, and the result is a process running as root with
read and write access to the entire filesystem, the ability to load kernel
modules, full network access, and no restrictions on what system calls it can
make.

Meanwhile the same person will spend an evening configuring a firewall. The
firewall matters, but if the service is compromised, the firewall is on the
wrong side of the problem. systemd ships a sandbox that is genuinely good, it is
already installed, and turning it on is a matter of editing a config file.

## Start with the score

systemd will grade a unit for you.

```bash
systemd-analyze security
systemd-analyze security myapp.service
```

The per unit output lists every hardening setting, whether it is enabled, and an
exposure weight. It is a checklist with the reasoning attached. Run it on a
default unit and the output is long and unflattering, which is the point.

Do not treat the numeric score as a target to optimise. Some settings do not
apply to some services, and turning on something that breaks your application to
improve a number is not security work. Use it as a list of things to consider.

## A hardened unit

```ini
[Unit]
Description=My application
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/myapp --config /etc/myapp/config.toml
Restart=on-failure
RestartSec=5

# --- identity -------------------------------------------------------
DynamicUser=yes
StateDirectory=myapp
RuntimeDirectory=myapp
LogsDirectory=myapp

# --- filesystem -----------------------------------------------------
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/myapp
NoExecPaths=/
ExecPaths=/usr/local/bin/myapp /usr/lib /lib

# --- kernel and privileges -----------------------------------------
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectProc=invisible
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
RestrictNamespaces=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources @obsolete

# --- network --------------------------------------------------------
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
IPAddressDeny=any
IPAddressAllow=localhost
IPAddressAllow=10.20.30.0/24

# --- resources ------------------------------------------------------
MemoryMax=2G
TasksMax=256
CPUQuota=200%

[Install]
WantedBy=multi-user.target
```

That is not exotic and none of it requires a container runtime.

## The settings that do the most work

**DynamicUser.** systemd allocates a transient user for the service, and the
state, runtime, cache, and log directories it creates are owned by that user
with correct permissions. No `useradd`, no stale accounts, no group creep. If
your service needs a fixed uid for shared storage, use `User=` and a dedicated
account instead, but reach for `DynamicUser` first.

**ProtectSystem=strict.** The entire filesystem hierarchy becomes read only for
this process, except what you explicitly list in `ReadWritePaths`. Combined with
`ProtectHome`, a compromised process cannot write a persistence mechanism into
your dotfiles or a system directory. This one setting removes a large fraction
of post exploitation options.

**CapabilityBoundingSet= (empty).** Drops every capability. If the service needs
to bind a port below 1024, either give it exactly `CAP_NET_BIND_SERVICE` or,
better, use socket activation so systemd binds the privileged port and hands
over the already open socket. The second option means the process never has the
capability at all.

**SystemCallFilter.** The `@system-service` set is a curated allowlist covering
what normal daemons do. Subtracting `@privileged`, `@resources`, and `@obsolete`
removes administrative calls, resource limit manipulation, and legacy interfaces
nobody should be calling. Blocked calls return an error, and you will see them
in the journal, which makes debugging a broken filter straightforward.

**IPAddressDeny and IPAddressAllow.** A per service firewall implemented in the
kernel filter layer. A web application that only needs to talk to a local
database and one internal API has no business being able to reach arbitrary
hosts, and this is where you say so. It is the cheapest anti exfiltration
control available on a Linux box.

**MemoryDenyWriteExecute.** Prevents mapping memory both writable and
executable, which blocks a common shellcode technique. Some runtimes with just
in time compilation genuinely need write plus execute and will fail. Test it,
and if it breaks, that is useful information about the runtime.

## Rolling it out without breaking things

Do not paste the whole block into a working service and restart it in
production. Add it in layers with an override file, which keeps your changes
separate from the packaged unit:

```bash
systemctl edit myapp.service      # creates an override drop-in
systemctl daemon-reload
systemctl restart myapp.service
journalctl -u myapp.service -f
```

Add the filesystem protections first, then capabilities, then system call
filtering, then network restrictions, restarting and exercising the application
after each layer. When something breaks, the journal usually names the exact
denied operation, and `strace` on the failing invocation will name a blocked
call.

The resource limits at the bottom deserve a mention of their own. `MemoryMax`
and `TasksMax` are cgroup limits, and they turn "one service leaked memory and
the kernel killed something important" into "one service was killed and
restarted." That is availability engineering, not security, and it is just as
valuable.

Twenty minutes per service, and the result is a meaningful sandbox around
software you did not write and cannot audit. That is the best return on time in
Linux operations that I know of.

## References

- [systemd.exec(5): sandboxing directives](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [systemd.service(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.resource-control(5)](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html)
- [systemd-analyze(1)](https://www.freedesktop.org/software/systemd/man/latest/systemd-analyze.html)
- [Linux control group v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
