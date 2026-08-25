
## The Problem With Sharing a Box

Consolidation is good for utilisation and bad for isolation. Put several services on one machine and eventually one of them misbehaves: a memory leak, a runaway batch job, a log processor that saturates the disk. Everything else on the machine suffers for a problem it did not cause.

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

The rule that trips people up: a controller must be enabled in a parent's `subtree_control` before children can use it. Enabling it in the parent is what makes the corresponding interface files appear in the child.

The other rule is the "no internal processes" constraint. A cgroup with children cannot itself hold processes when controllers are enabled. Processes live in leaf nodes. Once you internalise that, the tree layouts you see in the wild make sense.

```bash
cd /sys/fs/cgroup
mkdir -p demo
echo "+cpu +memory +io" > cgroup.subtree_control
mkdir -p demo/batch
echo $$ > demo/batch/cgroup.procs   # move this shell into the group
cat demo/batch/cgroup.procs
```

## The Knobs That Matter

**Memory.** `memory.max` is a hard limit: exceed it and the kernel reclaims aggressively, then invokes the out of memory killer inside that group. `memory.high` is a throttle: past it, processes are slowed by reclaim pressure but not killed. Setting `high` below `max` gives you a warning zone where a leaking process degrades before it dies, which is usually what you want in production.

```bash
echo "2G" > demo/batch/memory.high
echo "3G" > demo/batch/memory.max
cat demo/batch/memory.current
cat demo/batch/memory.events      # counts of high/max/oom events
```

**CPU.** `cpu.max` takes a quota and a period in microseconds. `"200000 100000"` means 200 milliseconds of CPU time per 100 millisecond period, in other words two full cores. `cpu.weight` is the softer control: it only matters under contention, and it divides spare capacity proportionally rather than capping.

```bash
echo "200000 100000" > demo/batch/cpu.max   # hard cap at 2 cores
echo "50" > demo/batch/cpu.weight           # low priority when contended
```

Prefer weight over quota where you can. A hard cap leaves the machine idle while a job waits, which is waste. Weight lets a job use everything available and yield only when something else needs it.

**I/O.** `io.max` limits bytes and operations per second per device, addressed by major and minor numbers. `io.weight` again gives proportional sharing under contention, and needs a compatible I/O scheduler to be effective.

```bash
lsblk -o NAME,MAJ:MIN            # find the device numbers
echo "259:0 rbps=100000000 wbps=50000000" > demo/batch/io.max
```

## Doing It Through systemd Instead

Writing to those files directly is excellent for understanding and poor for production, because nothing survives a reboot and systemd will happily reorganise the tree underneath you. On a systemd machine, systemd owns the cgroup hierarchy, so express limits as unit properties and let it manage them.

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

Slices group units so a limit applies to several services collectively, which is how you reserve capacity for a class of workload rather than a single process.

```ini
# /etc/systemd/system/batch.slice
[Unit]
Description=Batch workloads, deliberately deprioritised

[Slice]
CPUWeight=20
MemoryHigh=8G
IOWeight=20
```

Add `Slice=batch.slice` to any service that should live inside it. Now the whole class of batch work shares one budget, and interactive services keep priority under load without anyone being hard capped.

Useful commands while working with this:

```bash
systemd-cgls                       # the tree, as systemd sees it
systemd-cgtop                      # live resource use per cgroup
systemctl show indexer -p MemoryMax -p CPUQuotaPerSecUSec
systemctl set-property indexer MemoryMax=4G   # persistent, no file editing
```

## Watching the Pressure

Limits without observation are guesses. Every cgroup exposes pressure stall information, which reports how much time work was lost waiting on a resource.

```bash
cat /sys/fs/cgroup/batch.slice/memory.pressure
cat /sys/fs/cgroup/batch.slice/cpu.pressure
cat /sys/fs/cgroup/batch.slice/io.pressure
```

`some` is the share of time at least one task was stalled. `full` is the share where nothing could proceed. This is far more actionable than utilisation, because it measures the thing you actually care about, which is delay caused by contention, rather than a percentage that tells you a resource was busy without saying whether anyone was waiting.

My practice is to set `memory.high` deliberately low at first and watch `memory.events` and `memory.pressure` for a week. That tells me the real working set instead of the number I guessed, and I can then set limits that reflect measured behaviour.

## Why This Is Worth Learning Directly

Every container runtime and orchestrator is a wrapper over this. When a container gets killed and the platform reports an unhelpful reason, the truth is in `memory.events` and the kernel log. Knowing the layer underneath turns an opaque platform behaviour into a mechanism you can inspect.

It is also immediately useful without any container platform at all. Putting a memory limit on the one service you know leaks is a ten minute change that converts a machine wide outage into a single service restart.

## References

- [Linux kernel: control group v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Linux kernel: pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [systemd.resource-control(5)](https://man.archlinux.org/man/systemd.resource-control.5)
- [systemd.slice(5)](https://man.archlinux.org/man/systemd.slice.5)
- [cgroups](https://en.wikipedia.org/wiki/Cgroups)
