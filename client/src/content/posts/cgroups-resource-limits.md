
## The Problem With Sharing a Box

Consolidation is good for utilization and bad for isolation. Put several services on one machine and eventually one of them misbehaves: a memory leak, a runaway batch job, a log processor that saturates the disk. Everything else on the machine suffers for a problem it did not cause.

The kernel's answer is control groups. A cgroup is a set of processes with resource limits attached, enforced by the kernel rather than by the cooperation of the processes involved. This is the mechanism containers use, but there is nothing container specific about it. You can apply the same limits to an ordinary system service, and often should.

## The cgroup v2 Interface

Version 2 replaced the older design's separate per controller hierarchies with one unified tree, which removed a lot of confusion about which hierarchy a process belonged to. It is mounted at `/sys/fs/cgroup` and is a filesystem: directories are groups, files are knobs.

```bash
# Confirm you are on v2. cgroup2fs means yes.
stat -fc %T /sys/fs/cgroup

# What controllers exist here, and which are delegated to children.
cat /sys/fs/cgroup/cgroup.controllers
cat /sys/fs/cgroup/cgroup.subtree_control
```

The rule that trips people up: a controller must be enabled in a parent's `subtree_control` before children can use it. Enabling it in the parent is what makes the corresponding interface files appear in the child. That holds at every level, which is why the demo below writes it twice.

The other rule is the "no internal processes" constraint. A cgroup with children cannot itself hold processes when controllers are enabled. Processes live in leaf nodes. Once you internalize that, the tree layouts you see in the wild make sense. Break the rule and the write fails with "Device or resource busy", which does not tell you why.

```bash
cd /sys/fs/cgroup
mkdir -p demo
echo "+cpu +memory +io" > cgroup.subtree_control        # root delegates to demo
echo "+cpu +memory +io" > demo/cgroup.subtree_control   # demo delegates to batch
mkdir -p demo/batch
echo $$ > demo/batch/cgroup.procs   # move this shell into the group
cat demo/batch/cgroup.procs
```

## The Knobs That Matter

**Memory.** `memory.max` is a hard limit: exceed it and the kernel reclaims aggressively, then invokes the out of memory killer inside that group, so the victim comes from the group that overran rather than from some unrelated service elsewhere on the host. `memory.high` is a throttle: past it, processes are slowed by reclaim pressure but not killed. Setting `high` below `max` gives you a warning zone where a leaking process degrades before it dies, which is usually what you want in production.

```bash
echo "2G" > demo/batch/memory.high
echo "3G" > demo/batch/memory.max
cat demo/batch/memory.current
cat demo/batch/memory.peak        # high water mark (kernel 5.19 and later)
cat demo/batch/memory.events      # counts of low/high/max/oom/oom_kill events
grep -E '^(anon|file) ' demo/batch/memory.stat
```

Page cache counts toward a group's usage, so `memory.current` near the limit is not proof of a leak. `memory.stat` splits it: `anon` is the processes' own memory, and `file` is cache the kernel can usually reclaim. The kernel reclaims cache before it kills anything, but when `anon` alone is close to the limit there is little left to give back.

On a host with swap, `memory.max` limits only RAM, so a group at its limit can push its excess into swap and get slow instead of getting killed. `memory.swap.max` (`MemorySwapMax=` in a unit) caps that, and setting it to 0 makes `memory.max` the real ceiling. In the other direction, `memory.min` and `memory.low` protect a group's memory from reclaim, firmly and on a best effort basis respectively, which is how you keep an important service's working set resident while something else churns.

**CPU.** `cpu.max` takes a quota and a period in microseconds. `"200000 100000"` means 200 milliseconds of CPU time per 100 millisecond period, in other words two full cores. `cpu.weight` is the softer control: it only matters under contention, and it divides spare capacity proportionally rather than capping. The default is 100 and the range is 1 to 10000, so a group at 200 gets twice the CPU time of a group at 100 when both want more than is available.

```bash
echo "200000 100000" > demo/batch/cpu.max   # hard cap at 2 cores
echo "50" > demo/batch/cpu.weight           # low priority when contended
cat demo/batch/cpu.stat                     # nr_periods, nr_throttled, throttled_usec
```

Prefer weight over quota where you can. A hard cap leaves the machine idle while a job waits, which is waste. Weight lets a job use everything available and yield only when something else needs it.

A cap also has a latency cost that utilization graphs hide. Once a group spends its quota, every thread in it is frozen until the next period begins. Under a half core quota (`50000 100000`), eight threads running in parallel spend the 50 millisecond budget in about 6 milliseconds, then sit frozen for the remaining 94. That shows up as terrible tail latency while average CPU use looks modest. A climbing `nr_throttled` in `cpu.stat` means the quota is the bottleneck, whatever the graph says: raise the quota or reduce the concurrency inside the workload.

**I/O.** `io.max` limits bytes and operations per second per device, addressed by major and minor numbers. `io.weight` again gives proportional sharing under contention, and needs a compatible I/O scheduler to be effective.

```bash
lsblk -o NAME,MAJ:MIN            # find the device numbers
echo "259:0 rbps=100000000 wbps=50000000 riops=2000 wiops=2000" > demo/batch/io.max
```

Buffered writes reach the disk later, through writeback, and v2 still charges that I/O to the group that dirtied the pages, provided the memory controller is enabled alongside io and the filesystem supports cgroup writeback (ext4, XFS and Btrfs do). On other filesystems, writeback is charged to the root cgroup and escapes the limit.

## Doing It Through systemd Instead

Writing to those files directly is excellent for understanding and poor for production, because nothing survives a reboot and systemd will happily reorganize the tree underneath you. On a systemd machine, systemd owns the cgroup hierarchy, so express limits as unit properties and let it manage them.

```ini
# /etc/systemd/system/indexer.service
[Unit]
Description=Document indexing worker
After=network-online.target

[Service]
ExecStart=/usr/local/bin/indexer --config /etc/indexer.toml
Restart=on-failure

# Resource control
MemoryHigh=2G
MemoryMax=3G
CPUWeight=50
CPUQuota=200%
IOWeight=50
TasksMax=512

[Install]
WantedBy=multi-user.target
```

`TasksMax` caps the processes and threads in the unit, which bounds a fork bomb. For a unit a package installed, leave the vendor file alone: `systemctl edit name.service` opens a drop-in, and the same lines go under its `[Service]` header.

Slices group units so a limit applies to several services collectively, which is how you reserve capacity for a class of workload rather than a single process.

```ini
# /etc/systemd/system/batch.slice
[Unit]
Description=Batch workloads, deliberately deprioritized

[Slice]
CPUWeight=20
MemoryHigh=8G
IOWeight=20
```

Add `Slice=batch.slice` to any service that should live inside it. Now the whole class of batch work shares one budget, and interactive services keep priority under load without anyone being hard capped.

Limits nest, too: a child can never use more than its parent allows. Every service sits in a slice, so it can hit a ceiling its own unit never set. When that happens, look up the tree.

Useful commands while working with this:

```bash
systemd-cgls                       # the tree, as systemd sees it
systemd-cgtop                      # live resource use per cgroup
systemctl show indexer -p MemoryMax -p CPUQuotaPerSecUSec
systemctl set-property indexer MemoryMax=4G   # persistent, no file editing
cat /sys/fs/cgroup/system.slice/indexer.service/memory.max   # what the kernel enforces
```

`systemctl show` reports what systemd loaded. If it says `infinity` where you expected a number, your drop-in is not where you think it is, or you skipped `systemctl daemon-reload` after editing by hand.

## Watching the Pressure

Limits without observation are guesses. Every cgroup exposes pressure stall information, which reports how much time work was lost waiting on a resource.

```bash
cat /sys/fs/cgroup/batch.slice/memory.pressure
cat /sys/fs/cgroup/batch.slice/cpu.pressure
cat /sys/fs/cgroup/batch.slice/io.pressure
cat /proc/pressure/memory          # the same, system wide
```

`some` is the share of time at least one task was stalled. `full` is the share where nothing could proceed. Each line gives `avg10`, `avg60` and `avg300`, percentages over the last 10, 60 and 300 seconds. This is far more actionable than utilization, because it measures the thing you actually care about, which is delay caused by contention, rather than a percentage that tells you a resource was busy without saying whether anyone was waiting.

My practice is to set `memory.high` deliberately low at first and watch `memory.events` and `memory.pressure` for a week. That tells me the real working set instead of the number I guessed, and I can then set limits that reflect measured behavior. As a starting rule, `MemoryMax` goes at roughly double the observed steady state.

## When Something Dies or Drags

When a service disappears without a word in its own logs, or slows down for no obvious reason, read what the kernel recorded before reading the application:

1. Find the cgroup. `systemctl status name.service` prints it, or read `/proc/PID/cgroup`.
2. Check `memory.events`. A nonzero `oom_kill` means the limit killed it. It did not crash. It ran out of budget, which makes this a capacity or leak question rather than a stack trace question. `journalctl -k | grep -i -E 'killed process|oom'` shows the kernel's side.
3. Check `cpu.stat`. A rising `nr_throttled` means the quota is the bottleneck.
4. Check the pressure files to see which resource tasks were waiting on.
5. Only then look at the application.

To watch a limit fire on purpose:

```bash
# Run something under a temporary limit and watch it hit the ceiling
systemd-run --user --scope -p MemoryMax=256M -p MemorySwapMax=0 \
    python3 -c "b = bytearray(400 * 1024 * 1024); print('allocated')"
```

It is killed before it can print, and `journalctl -k` shows why.

## Why This Is Worth Learning Directly

Every container runtime and orchestrator is a wrapper over this. When a container gets killed and the platform reports an unhelpful reason, the truth is in `memory.events` and the kernel log. Knowing the layer underneath turns an opaque platform behavior into a mechanism you can inspect.

It is also immediately useful without any container platform at all. Putting a memory limit on the one service you know leaks is a ten minute change that converts a machine wide outage into a single service restart.

## References

- [Linux kernel: control group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Linux kernel: pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [systemd.resource-control(5)](https://man.archlinux.org/man/systemd.resource-control.5)
- [systemd.slice(5)](https://man.archlinux.org/man/systemd.slice.5)
- [systemd.service manual page](https://man.archlinux.org/man/systemd.service.5)
- [cgroups(7) manual page](https://man7.org/linux/man-pages/man7/cgroups.7.html)
- [cgroups](https://en.wikipedia.org/wiki/Cgroups)
