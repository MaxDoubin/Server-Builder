
## The problem

A host runs a dozen services. One of them has a memory leak, or spawns a build that eats every core, or starts a backup that saturates the disk. Everything else on the box gets slow or dies, and the thing that actually gets killed by the out of memory handler is frequently not the guilty process.

Control groups fix this by putting resource accounting and limits on groups of processes rather than trusting them to behave. Version 2 replaced the older split hierarchy with a single unified tree, and it is what current distributions use by default.

## The unified hierarchy

Everything lives under one mount, normally `/sys/fs/cgroup`. Each directory is a cgroup, nesting is real containment, and processes are members of exactly one group.

```bash
# where is this process?
cat /proc/$(pgrep -f my-service)/cgroup

# what controllers are available here?
cat /sys/fs/cgroup/cgroup.controllers

# live view by group
systemd-cgls
systemd-cgtop
```

There is one rule that confuses everyone the first time: the no internal process constraint. A cgroup that has child cgroups cannot itself hold processes when controllers are enabled. Processes live in leaves. If you try to structure things otherwise the kernel will refuse and the error is not obvious.

## CPU: weight versus max

Two different knobs, for two different intentions.

`cpu.weight` is proportional share. Default 100, range 1 to 10000. It only matters under contention: a group with weight 200 gets twice the CPU time of one with weight 100 when both want more than is available. When the machine is idle, a low weight group can still use everything. This is what you want for prioritization.

`cpu.max` is a hard ceiling, written as quota and period in microseconds. `200000 100000` means at most two cores worth of time per 100 ms period, even on an idle machine. This is what you want for predictability and for stopping a runaway.

Use weight by default. Use max when you genuinely need a cap, and know that a hard cap causes throttling that can look like latency spikes in a request serving process.

## Memory: high, max, and who dies

`memory.max` is the hard limit. Exceed it and the kernel invokes the out of memory killer inside that group, so the process that overran is the one that dies, not some unrelated victim elsewhere on the host. That alone is worth configuring.

`memory.high` is the throttle. Above it the kernel puts heavy reclaim pressure on the group and slows its allocations, but does not kill anything. It is a much kinder first line of defense.

`memory.min` and `memory.low` protect memory from reclaim, which is how you keep an important service's working set resident while something else is churning.

I set `high` somewhat below `max` on anything I do not fully trust. The service degrades before it dies, and the degradation is visible in metrics, which gives you time to react.

## IO, the one people forget

CPU and memory limits are useless if a single backup job makes the disk unusable. `io.weight` does proportional sharing, and `io.max` sets hard limits per device in bytes and operations per second:

```bash
# 8:0 is the device major:minor from lsblk
echo "8:0 rbps=52428800 wbps=52428800 riops=2000 wiops=2000" \
  | sudo tee /sys/fs/cgroup/system.slice/backup.service/io.max
```

Note that IO limits interact badly with buffered writes, because the writeback happens later and in a different context. `io.latency` and the writeback integration handle a lot of this, but if you need strict guarantees, direct IO in the application is more reliable than any cgroup setting.

## Do it through systemd

Writing to `/sys/fs/cgroup` by hand does not survive a reboot and is not how you should manage this. Every knob above has a unit file directive, and systemd creates the cgroup for you.

```bash
sudo systemctl edit backup.service
```

```ini
[Service]
CPUWeight=20
CPUQuota=150%
MemoryHigh=2G
MemoryMax=3G
MemorySwapMax=0
IOWeight=20
TasksMax=512
```

Then check what actually applied, which is the step people skip:

```bash
systemctl show backup.service -p CPUQuotaPerSecUSec -p MemoryMax -p IOWeight
systemctl status backup.service | grep -i memory
```

`systemctl show` reads the effective value. If it says `infinity` where you expected a number, the controller is not enabled on the parent slice or your drop in is not where you think it is.

The way I apply all of this is deliberately unambitious. Every service I write a unit for gets `MemoryMax` at roughly double its observed steady state, and `TasksMax` to bound fork bombs. Anything batch flavored, backups, indexing, media processing, gets a low `CPUWeight` and a low `IOWeight` so interactive services win under contention. I only add `CPUQuota` when a hard ceiling is genuinely required, because throttling has its own costs.

The goal is not to squeeze the machine. It is that a single bad process degrades itself first and the host last.

## References

- [Control Group v2 kernel documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [systemd.service manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [systemd.exec manual page](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
- [Linux kernel documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
