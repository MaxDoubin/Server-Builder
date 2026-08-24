
## The cliff

Somebody complains an application is slow. You give the virtual machine more
vCPUs and more RAM. It gets slower. Not a little slower, noticeably slower,
and CPU utilisation looks fine. That result feels like it violates
conservation of reason, and the usual explanation is NUMA.

Non-uniform memory access means exactly what it says. On a multi-socket
server, and on many modern single-socket parts internally, memory is attached
to specific CPUs. A core reaching memory attached to its own node gets low
latency and full bandwidth. A core reaching memory attached to another node
goes across an interconnect and pays for it, in both latency and available
bandwidth. When a guest is small enough to fit inside one node, all of its
memory accesses are local. When you grow it past the boundary, a growing
fraction become remote, and the average cost per access goes up.

## Reading your topology

Before tuning anything, look at what you actually have:

```bash
lscpu | grep -i -E 'numa|socket|core|thread'
numactl --hardware
cat /sys/devices/system/node/node0/meminfo | head -4
cat /sys/devices/system/node/node0/cpulist
```

`numactl --hardware` prints the node list, the memory on each node, and a
distance matrix. The distances are relative numbers where local is normally
10, so a value of 21 for a remote node means roughly twice the cost. Some
processors expose more nodes than there are sockets, splitting a single
package into several memory domains, which is worth knowing before you assume
one node equals one socket.

To see whether processes are actually taking remote hits:

```bash
numastat                     # system-wide hit/miss counters
numastat -c qemu-system-x86_64
```

The columns to care about are `numa_miss` and `numa_foreign`. Steady growth
in those while a workload runs means allocations are landing off-node.

## Size guests to fit, first

The single highest value action is not pinning, it is sizing. If a node has,
say, half of the machine's memory and half of its cores, then a guest that
stays under both of those limits can be placed entirely within one node, and
the hypervisor scheduler will usually do the right thing on its own.

So before adding resources to a slow VM, ask whether the addition crosses a
node boundary. Going from a guest that fits in one node to one that spans two
is a step change in memory behaviour, not a smooth increase in capacity. It
is often better to run two right-sized guests than one oversized one,
particularly for workloads that scale horizontally.

The same applies to huge pages and to memory ballooning. Ballooning fights
with NUMA locality, because reclaimed and re-added pages do not necessarily
come back from the same node.

## When the guest genuinely must be large

If the workload really needs more than one node's worth of resources, do not
let the topology be invisible to it. Expose a virtual NUMA topology to the
guest that mirrors the physical layout, so the guest operating system and any
NUMA-aware application inside it can make local allocations too. A large
guest with a flat virtual topology on a multi-node host is the worst case:
the guest thinks all memory is equal and schedules accordingly, while half of
its accesses cross the interconnect.

On a KVM based stack the pieces are: enable NUMA for the guest, define
virtual cells that match the physical node sizes, and pin each cell's memory
to the corresponding host node. With libvirt this is the `<numa>` cell
configuration inside the CPU definition plus `numatune` for memory placement;
on Proxmox VE the guest option is `numa`, and CPU affinity is set separately.

```bash
# Proxmox: enable NUMA awareness for guest 100
qm set 100 --numa 1

# Pin a benchmark to node 0 for a controlled comparison
numactl --cpunodebind=0 --membind=0 ./bench
numactl --cpunodebind=0 --membind=1 ./bench    # deliberately remote
```

Running that pair of `numactl` commands is the cheapest way to measure what
remote access actually costs on your hardware, rather than trusting a rule of
thumb from someone else's machine.

## When to pin, and when to leave it alone

CPU pinning gets recommended constantly and is right less often than people
think. Pinning vCPUs to physical cores prevents the scheduler from migrating
a guest across nodes and taking its cache and locality with it. That is a
genuine win for latency sensitive, consistently busy workloads.

It is a loss when the host is consolidated and bursty. A pinned guest cannot
use idle capacity elsewhere, so you have traded average throughput for
predictability. On a general purpose host running many mixed guests, static
pinning frequently makes the whole machine worse while making one guest
slightly better.

My working rules:

1. Size the guest to fit one node whenever possible. This solves most cases.
2. If it must span nodes, give it a matching virtual NUMA topology.
3. Pin only workloads with a real latency requirement, and only after
   measuring.
4. Measure with `numastat` before and after, and keep the numbers. "It feels
   faster" is not a result.
5. Remember that devices have locality too. An accelerator or a high speed
   network card hangs off particular PCIe lanes attached to a particular
   node, and a guest using that device is better off on the same node as the
   device.

That last point catches people building GPU or high throughput networking
hosts. You can do everything right on memory placement and still lose
bandwidth because the card is on the far side of the interconnect from the
cores driving it.

## References

- [Non-uniform memory access](https://en.wikipedia.org/wiki/Non-uniform_memory_access)
- [Linux kernel NUMA documentation](https://www.kernel.org/doc/html/latest/mm/numa.html)
- [numactl(8) manual page](https://man7.org/linux/man-pages/man8/numactl.8.html)
- [libvirt domain XML format](https://libvirt.org/formatdomain.html)
