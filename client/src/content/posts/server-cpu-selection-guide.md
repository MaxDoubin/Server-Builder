
## The problem

You are staring at a used server listing, or a configurator, and trying to work out whether 24 cores at 3.0 GHz beats 32 cores at 2.4 GHz for what you actually run. Every spec sheet gives you core counts and cache sizes and none of them tell you which number matters for your workload. Here is how I decide, and how to check the machine in front of you rather than guessing.

## Three questions before you look at any part number

**How does your workload parallelise?** If it splits cleanly across many independent tasks, cores win. If it is one long dependency chain, clock speed and per-core cache win, and buying 64 cores just gets you 63 idle ones.

**How much memory bandwidth does it need?** This is the one people skip. Cores share memory channels, so a high-core-count part with the same channel count feeds each core less bandwidth. A streaming workload can saturate the memory controller long before it saturates the cores.

**How many PCIe lanes do you need?** NICs, HBAs, NVMe, and GPUs all consume lanes, and lane counts differ enormously between platforms. Add up what you plan to install before you pick a socket, not after.

Everything below is really just those three questions applied to specific families.

## Intel Xeon

Xeon has been the default server CPU for decades. The current Xeon Scalable lineup (Sapphire Rapids and beyond) offers high core counts, massive memory support, and a mature ecosystem. Every server vendor, every hypervisor, and every enterprise application is tested and certified on Xeon.

The generational shape matters when you are shopping used. First and second generation Scalable (Skylake-SP in 2017, Cascade Lake in 2019) gave you six memory channels and 48 PCIe 3.0 lanes per socket, up to 28 cores. Ice Lake-SP moved to eight channels and 64 PCIe 4.0 lanes. Sapphire Rapids moved again to eight channels of DDR5 and 80 PCIe 5.0 lanes, up to 60 cores, and added the AMX matrix extensions for AI work. Granite Rapids widened memory to twelve channels.

That progression is the whole story: Intel has been steadily fixing the two things AMD beat it on, channels and lanes.

For a homelab, used Xeon processors from the previous generation (Cascade Lake, Skylake-SP) offer incredible value. A 24-core Xeon Gold that cost thousands new can be found for a fraction of that on the used market.

The Xeon ecosystem also means broad compatibility. BIOS updates, driver support, and firmware tools are all well-maintained by Intel and the server vendors.

## AMD EPYC

EPYC has disrupted the server market significantly. The current generation offers more cores per socket, more PCIe lanes, and better performance per watt than Xeon in many workloads. AMD's chiplet architecture lets them scale core counts without the yield problems that monolithic designs face.

The lane count is the standout. A single-socket EPYC has provided 128 PCIe lanes since the Rome generation, which is more than two Cascade Lake sockets combined. That means a one-socket EPYC box can carry more NVMe and more NICs than a two-socket Intel box of the same era, with no NUMA hop at all. Genoa moved to twelve channels of DDR5 and PCIe 5.0 with up to 96 Zen 4 cores, and the dense Bergamo and Turin parts push core counts far higher still. Genoa-X adds stacked cache for workloads that live and die on L3 hit rate.

The chiplet design has a consequence worth knowing about. The cores live on multiple compute dies talking to a central I/O die, so memory latency is not perfectly uniform even within one socket. AMD exposes this through an NPS (nodes per socket) BIOS setting that can present one socket as one, two, or four NUMA domains. For a hypervisor host, NPS1 keeps things simple. For a latency-sensitive database pinned to specific cores, more domains can help. It is a real tuning knob, and it is invisible if you do not know to look.

The downside is that EPYC is newer in the server space, and some enterprise software vendors are still catching up with certification and optimization. That gap is closing fast, but it is worth checking if your specific workloads are validated on EPYC.

For homelabs, EPYC is harder to find used and the platforms (motherboards, and so on) are less common on the secondary market. But if you are buying new, EPYC offers better value than Xeon at most price points.

## Apple Xeon W

The Mac Pro uses Intel's Xeon W processors, which are essentially workstation-class Xeons. They offer high single-threaded performance and large cache sizes, making them good for workloads that do not scale perfectly across many cores.

The W-3200 series in the 2019 Mac Pro gives you six memory channels of DDR4-2933 and 64 PCIe 3.0 lanes, which is more lanes than a contemporary Xeon Gold socket, and explains how Apple fits eight PCIe slots into a single-socket machine. The limitation is that the Mac Pro only supports a single socket. For workloads that benefit from dual-socket configurations (massive memory capacity, high core counts), Dell and HP platforms with dual Xeon or EPYC chips are the better choice.

Apple Silicon changes the shape of this question entirely rather than answering it. Unified memory delivers very high bandwidth but is soldered and capped, there are no DIMM slots, and there is no documented ECC reporting. It is a workstation architecture, not a server one.

## Reading the machine you actually have

Before buying anything, know what you are running. On Linux:

```bash
lscpu | grep -E '^(Model name|Socket|Core|Thread|CPU\(s\)|NUMA|L3)'
```

Correct output for a dual Xeon Gold 6248R host:

```
CPU(s):                  96
Thread(s) per core:      2
Core(s) per socket:      24
Socket(s):               2
Model name:              Intel(R) Xeon(R) Gold 6248R CPU @ 3.00GHz
NUMA node(s):            2
NUMA node0 CPU(s):       0-23,48-71
NUMA node1 CPU(s):       24-47,72-95
L3 cache:                71.5 MiB
```

Read the NUMA lines carefully. CPUs 0 to 23 and 48 to 71 are the same 24 physical cores, counted once as cores and once as hyperthreads. Pinning a workload to "0 to 47" therefore straddles both sockets, which is almost never what someone means to do.

```bash
numactl --hardware
```

```
available: 2 nodes (0-1)
node 0 size: 262144 MB
node 0 free: 231045 MB
node 1 size: 262144 MB
node 1 free: 240118 MB
node distances:
node   0   1
  0:  10  21
  1:  21  10
```

The distance matrix is the point. Local memory is 10, remote is 21, and that ratio is roughly the latency penalty a thread pays for reaching across the socket. A VM sized larger than one node's 256 GB is guaranteed to pay it.

Two more checks that change how a used server actually performs:

```bash
grep -o 'avx512[a-z0-9_]*' /proc/cpuinfo | sort -u
grep . /sys/devices/system/cpu/vulnerabilities/*
```

The first tells you which vector extensions you have. The second lists every speculative execution mitigation the kernel has enabled, and on a Skylake or Cascade Lake part that list is long. Those mitigations are not free, and they are the reason a used 2019 server benchmarks slower today than it did in its launch reviews.

## What I run

My main workloads are virtualization and storage, which benefit from high core counts and memory capacity. I run dual Xeon Gold 6248R processors in my primary R740, giving me 48 cores and 96 threads total. Each is a 24-core part with a 3.0 GHz base clock and a 205 W TDP. For my workloads, this is more than enough.

If I were building from scratch today, I would seriously consider EPYC for the core count and memory bandwidth advantages. But the used Xeon market is hard to beat on price, and the Dell PowerEdge ecosystem makes it easy to get started.

## The decision framework

Pick your CPU based on your actual workload:

- **Virtualization with many VMs:** High core counts matter. EPYC or dual Xeon. Size individual VMs to fit inside one NUMA node.
- **Database workloads:** Single-threaded performance matters. Xeon with high boost clocks, and enough L3 per core to hold the working set.
- **Storage servers:** Memory channels and PCIe lanes matter more than cores. ZFS wants RAM bandwidth and NVMe wants lanes. A single-socket EPYC is often the right answer here.
- **Media processing on macOS:** Xeon W in a Mac Pro, or Apple Silicon if the software supports it.
- **Budget homelab:** Used Xeon Gold on a Dell platform. Best value per dollar.

## What breaks

**Licensing costs more than the CPU.** Windows Server is licensed per core with a minimum of 8 cores per processor and 16 per server, and VMware moved vSphere to per-core licensing with a per-CPU minimum. Doubling your core count can double a recurring bill that dwarfs the hardware. Work out the licence cost before you pick the part.

**Unbalanced memory population.** Six channels per socket on Cascade Lake means DIMMs go in sixes. Install eight per socket because it seemed like a round number and two channels carry double load while others sit idle. You lose bandwidth silently, and nothing in the BIOS complains.

**Ignoring NUMA when sizing VMs.** A VM with more vCPUs than one socket has cores, or more RAM than one node has, gets scheduled across both and pays the remote memory penalty on a large fraction of its accesses. Size guests to fit a node, or configure vNUMA so the guest OS at least knows the topology.

**AVX-512 frequency offset.** On Skylake and Cascade Lake, sustained AVX-512 work drops the all-core turbo for the whole package, not just the thread doing vector math. One tenant running a vectorised benchmark can slow every other VM on the host. This is documented behaviour, not a fault.

**Assuming TDP is power draw.** TDP is a thermal design figure for sizing a cooler, not a wattmeter reading. Real draw depends on the power limits configured in firmware and on the workload. Size your UPS and your circuit from measured wall power, not from adding up TDP numbers.

**Fitting a high-TDP CPU under the wrong heatsink.** Vendors ship different heatsink and fan SKUs for high-TDP parts. Drop a 205 W chip onto a chassis built for 125 W and it will either refuse to boot or thermally throttle constantly. Check the vendor's configuration rules before you buy the CPU.

## References

- https://man7.org/linux/man-pages/man1/lscpu.1.html
- https://man7.org/linux/man-pages/man8/numactl.8.html
- https://www.kernel.org/doc/html/latest/admin-guide/pm/cpufreq.html
- https://en.wikipedia.org/wiki/Non-uniform_memory_access
- https://en.wikipedia.org/wiki/Xeon
- https://en.wikipedia.org/wiki/Epyc
