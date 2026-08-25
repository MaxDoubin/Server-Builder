
## Memory is not equidistant

On a multi socket server, and on plenty of modern single socket parts, memory is not one flat pool. Each socket or die has memory controllers attached directly to some of the DIMM slots. Access to that local memory is fast. Access to memory attached to another socket has to cross the interconnect, which costs latency and has less bandwidth than the local path.

That is NUMA: non uniform memory access. The hardware presents it as one address space and the operating system quietly hides it, which is exactly why it bites you. A guest can have plenty of vCPUs and plenty of RAM and still feel slow because half its memory is on the far side of a link.

## Look at your topology first

Never guess. Two commands tell you everything.

```bash
lscpu | grep -i numa
numactl --hardware
```

`numactl --hardware` gives you nodes, which CPUs belong to each node, free memory per node, and a distance matrix. The matrix is relative: 10 means local, and higher numbers mean more expensive. A two node box typically shows something like local 10 and remote 21, which is your rough penalty factor for getting it wrong.

Also check where a device lives, because a network card or accelerator is attached to a specific node too:

```bash
cat /sys/class/net/eth0/device/numa_node
```

An interface on node 0 being serviced by an interrupt handler on node 1 is a real and very common performance bug.

## The three ways a guest lands wrong

Split memory. The guest is bigger than one node, so the hypervisor allocates pages from both. Roughly half of memory accesses now cross the interconnect.

Split vCPUs. The guest fits in one node's worth of RAM, but the scheduler places its vCPU threads on both sockets. Threads on the far socket pay the remote penalty for every access.

Wandering threads. Nothing is pinned, so the host scheduler migrates vCPU threads between nodes under load. Memory does not follow, so the penalty appears and disappears and your benchmark looks like noise.

The tell for all three is the same: performance that varies run to run for no visible reason, with system time higher than you expect.

## Sizing beats pinning

Before you pin anything, size the guest so it fits. If a node has a given amount of memory and a given core count, a guest that stays inside both will usually be placed well by the host on its own. Most of the NUMA problems I have seen were created by someone allocating a guest slightly larger than a node because the round number looked nice.

If the workload genuinely needs more than one node, do not pretend otherwise. Expose the topology to the guest so its own scheduler can make good decisions, rather than lying to it about a flat memory space.

## Pinning in practice

With libvirt, pin vCPUs to physical CPUs and bind memory to the matching node:

```xml
<vcpu placement='static' cpuset='0-7'>8</vcpu>
<cputune>
  <vcpupin vcpu='0' cpuset='0'/>
  <vcpupin vcpu='1' cpuset='1'/>
  <vcpupin vcpu='2' cpuset='2'/>
  <vcpupin vcpu='3' cpuset='3'/>
</cputune>
<numatune>
  <memory mode='strict' nodeset='0'/>
</numatune>
```

`mode='strict'` is the important part. Preferred will silently fall back to remote memory under pressure, which gets you the slow behavior you were trying to avoid, without the error message that would have told you.

For a plain process rather than a VM, `numactl` does the same job in one line:

```bash
numactl --cpunodebind=0 --membind=0 ./my-service
```

And to check what a running process actually got:

```bash
numastat -p $(pgrep -f my-service)
```

Non zero counts in the remote columns are your answer.

## When not to pin

Pinning trades flexibility for predictability, and the trade is not always good.

On a consolidation host running many small, bursty guests, pinning wastes capacity: pinned cores sit idle while other guests queue. Let the scheduler work. On a host you live migrate frequently, pinning to specific physical CPU numbers assumes a topology that the destination may not share. And if you overcommit CPU heavily, pinning concentrates contention onto exactly the cores you chose.

I pin when a guest is latency sensitive, has a stable footprint, and owns its host. I do not pin general purpose guests, and I never pin as a first response to a performance complaint. Measure, look at the topology, size correctly, and only then reach for `numatune`.

## References

- [Non-uniform memory access](https://en.wikipedia.org/wiki/Non-uniform_memory_access)
- [numactl(8) manual page](https://man7.org/linux/man-pages/man8/numactl.8.html)
- [Linux NUMA memory policy documentation](https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html)
- [libvirt domain XML format](https://libvirt.org/formatdomain.html)
- [taskset(1) manual page](https://man7.org/linux/man-pages/man1/taskset.1.html)
