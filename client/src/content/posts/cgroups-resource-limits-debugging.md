
## The abstraction under every container

A container is not a thing the kernel implements. It is a bundle of kernel
features assembled by a runtime: namespaces to change what a process can see,
and control groups to constrain what it can use. Namespaces get most of the
attention because they are the visible magic. Cgroups are the ones that
explain the incidents.

Modern distributions use the unified hierarchy, cgroup v2, mounted at
`/sys/fs/cgroup`. It is a tree of directories, each with control and
statistics files, and every process belongs to exactly one node in that tree.
Controllers, memory, cpu, io, pids, are enabled per subtree, and a child can
never exceed its parent's limits. That last property is why a limit you did
not set can still bite you: your service inherits its slice.

Because systemd organises services into slices and scopes, most of what you
run on a normal Linux host is already in a cgroup whether you asked or not.

## Memory, and the kill you did not see

The memory controller is where the classic mystery lives: a process
disappears with no log message from the application itself.

The key files, relative to a cgroup directory:

- `memory.current`, current usage in bytes.
- `memory.max`, the hard limit. Exceeding it after reclaim fails means the
  out of memory killer fires inside the cgroup.
- `memory.high`, a soft limit. Above it the kernel throttles the workload and
  reclaims aggressively rather than killing. Underused and often the better
  setting.
- `memory.events`, counters including `oom` and `oom_kill`.
- `memory.stat`, the detailed breakdown, including page cache.

```bash
CG=/sys/fs/cgroup/system.slice/worker.service
cat $CG/memory.current $CG/memory.max $CG/memory.peak
cat $CG/memory.events                 # low high max oom oom_kill
grep -E '^(anon|file|slab) ' $CG/memory.stat

journalctl -k | grep -i -E 'killed process|oom'
```

If `memory.events` shows a nonzero `oom_kill`, the container did not crash,
it was killed for exceeding its limit. That is a capacity or a leak question,
not a debugging-the-stack-trace question, and the two get confused constantly.

One nuance worth knowing: page cache counts toward the cgroup's memory usage.
A process that reads a very large file can push a cgroup toward its limit
without leaking anything. Usually the kernel reclaims cache instead of
killing, but if the workload's anonymous memory is already near the limit,
heavy IO can be the thing that tips it over.

## CPU: shares, quota, and the throttling trap

CPU control comes in two flavours and people mix them up.

`cpu.weight` is proportional. It only matters when there is contention: a
cgroup with double the weight gets double the share of a busy CPU, and gets
as much as it wants when the machine is idle.

`cpu.max` is a hard quota, expressed as a budget and a period, for example
`50000 100000` meaning 50 milliseconds of CPU per 100 millisecond period,
which is half a core. Once the budget is spent, every thread in the cgroup is
frozen until the next period begins.

That freezing is the trap. A multithreaded application can burn its whole
quota in the first few milliseconds of a period and then sit idle for the
rest, which shows up as terrible tail latency while average CPU utilisation
looks low. Somebody looks at a graph showing 40 percent CPU usage and
concludes the limit is not the problem. It is.

```bash
cat $CG/cpu.max            # e.g. "50000 100000", or "max 100000"
cat $CG/cpu.stat           # usage_usec nr_periods nr_throttled throttled_usec
```

`nr_throttled` climbing is the smoking gun. If it is rising, raise the quota
or reduce concurrency inside the workload. For latency sensitive services I
prefer weights over quotas, and I reserve hard quotas for things I actively
want to contain.

## IO and pressure

The io controller can weight or cap block device throughput and IOPS per
cgroup, keyed by device major and minor number. It is more situational than
memory and CPU, but it is the answer when one noisy backup job makes
everything else feel broken.

More broadly useful is pressure stall information, which reports how much
time tasks were stalled waiting on a resource. It exists per cgroup and
system wide:

```bash
cat /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io
cat $CG/memory.pressure
cat $CG/io.pressure
```

The `avg10`, `avg60`, and `avg300` values are percentages of time stalled.
I find these far more actionable than utilisation, because utilisation tells
you a resource is busy and pressure tells you something is actually waiting.
A machine at 100 percent CPU utilisation with zero pressure is being used
efficiently. The same machine with high pressure is oversubscribed.

## Debugging a limit in practice

The workflow when something dies or drags:

1. Find the cgroup. `systemctl status name.service` prints it, or read
   `/proc/PID/cgroup`.
2. Check `memory.events` for `oom_kill`. Nonzero means the limit killed it.
3. Check `cpu.stat` for `nr_throttled`. Rising means the quota is the
   bottleneck, whatever the utilisation graph says.
4. Check the pressure files to see which resource tasks were waiting on.
5. Only then look at the application.

Reproducing a suspected limit is easy, which makes testing straightforward:

```bash
# Run something under a temporary limit and watch it hit the ceiling
systemd-run --user --scope -p MemoryMax=256M -p CPUQuota=50% \
    python3 -c "b = bytearray(400 * 1024 * 1024); print('allocated')"

# Set limits on a real unit and reload
systemctl set-property worker.service MemoryMax=2G CPUQuota=150%
systemctl show worker.service -p MemoryMax -p CPUQuota
```

Knowing this layer is what separates "the container keeps restarting" from
"the container exceeds its memory limit during the nightly import, and here
is the counter that proves it." The kernel already recorded what happened.
You just have to know which file to read.

## References

- [Linux kernel control group v2 documentation](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [systemd.resource-control(5)](https://man.archlinux.org/man/systemd.resource-control.5)
- [cgroups(7) manual page](https://man7.org/linux/man-pages/man7/cgroups.7.html)
- [cgroups](https://en.wikipedia.org/wiki/Cgroups)
