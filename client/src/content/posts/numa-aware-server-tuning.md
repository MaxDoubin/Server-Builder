
## The lie of the flat address space

Every multi socket server, and plenty of single socket ones with chiplet based
CPUs, presents memory as one flat range of addresses. That is a convenience,
not a description of the hardware. Physically, each socket has its own memory
controllers and its own attached DIMMs. When a core on socket 0 reads an
address that lives on socket 1, the request crosses the inter socket link.

That crossing is not free. Remote access has higher latency than local access
and shares a link with every other remote access happening at the same time.
On a workload that is already memory bound, this is the difference between a
server that performs like the spec sheet and one that mysteriously does not.

Non uniform memory access, NUMA, is just the name for that asymmetry. Linux
knows about it. The question is whether your workload does.

## Look at the topology first

Before tuning anything, find out what the machine actually looks like.

```bash
# nodes, their CPUs, and their memory
numactl --hardware

# distance matrix: 10 is local, higher is farther
numactl --hardware | grep -A4 distances

# which node each CPU belongs to
lscpu | grep -i numa

# per node allocation and miss counters
numastat -m
```

The `numa_miss` and `numa_foreign` counters in `numastat` are the ones I watch.
A miss means an allocation wanted one node and got another. A handful is noise.
A steadily climbing count under load means your process is being fed remote
memory, and you are paying for it on every access.

Also check that memory is physically balanced. If someone populated all the
DIMM slots on one socket and left the other empty, half your cores are remote
to every single page and no software tuning will fix it.

## Pinning work to where its memory lives

The default Linux policy is "first touch": a page is allocated on the node of
the CPU that first writes to it. That is a good default, and it works when a
process stays put. It falls apart when the scheduler migrates a thread to
another node after its memory is already allocated, which is exactly what
happens on a busy box.

For anything long lived and memory heavy, I pin explicitly.

```bash
# run a process with CPUs and memory both bound to node 0
numactl --cpunodebind=0 --membind=0 ./my-service

# interleave across all nodes: right for a big shared cache or in-memory DB
numactl --interleave=all ./cache-server
```

For systemd managed services the same idea lives in the unit file, which is
where I prefer it because it survives restarts and is visible to anyone reading
the config:

```ini
[Service]
ExecStart=/usr/local/bin/my-service
NUMAPolicy=bind
NUMAMask=0
CPUAffinity=0-15
```

Two policies cover most cases. Bind, when a single process has a working set
that fits in one node's memory and you want every access local. Interleave,
when one process has a working set larger than a node and you would rather
spread the traffic evenly than have one memory controller saturated while the
other idles.

## Virtualization makes it worse and easier

Hypervisors add a layer. A VM with more vCPUs than a single socket has cores,
or more RAM than a single node has, is inherently spanning nodes. Most
hypervisors will expose a virtual NUMA topology to the guest so the guest OS
can make sane decisions, but only if you let them, and only if the guest
topology roughly matches reality.

The practical guidance I follow: size guests to fit inside one node when you
can. A VM that fits in a node gets local memory and clean scheduling. A VM that
spans nodes needs its virtual topology to match the physical layout, otherwise
the guest kernel optimizes against a map that is wrong.

Device locality matters too. A network card or accelerator hangs off the PCIe
root complex of one specific socket. If a VM pinned to node 1 is pushing packets
through a NIC attached to node 0, every packet crosses the link. You can see
which node a device belongs to:

```bash
cat /sys/class/net/eth0/device/numa_node
lspci -vv -s 0000:41:00.0 | grep -i "NUMA node"
```

## When to bother

I do not pin everything. Most services are not memory bound and the scheduler
does a fine job. The workloads where NUMA awareness has actually mattered for
me are the predictable ones: in memory databases and caches, packet processing,
storage servers with large caches, and anything doing sustained large matrix
work.

The tell is simple. If a workload scales up nicely as you add threads and then
flattens or gets worse past a certain point, and CPU utilization looks high but
useful work does not increase, look at memory locality before you look at
anything else. That plateau is often the inter socket link, not the cores.

## What I actually do

My default process is: read the topology, size the workload to fit a node if it
can, pin it if it is long lived, and interleave if it genuinely cannot fit.
Then check `numastat` under real load rather than trusting that the config did
what I intended. Configuration that is never verified is just a comment.

None of this is exotic. It is the same principle as keeping a database and its
storage on the same side of a network: put the work near the data, and stop
paying for a trip you did not need.

## References

- [Linux NUMA memory policy](https://docs.kernel.org/admin-guide/mm/numa_memory_policy.html)
- [numactl(8) manual page](https://man7.org/linux/man-pages/man8/numactl.8.html)
- [Non-uniform memory access](https://en.wikipedia.org/wiki/Non-uniform_memory_access)
- [Linux network scaling documentation](https://docs.kernel.org/networking/scaling.html)
- [systemd.exec(5) resource and NUMA settings](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
