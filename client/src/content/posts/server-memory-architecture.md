
## Memory Channels

Modern server CPUs support multiple memory channels. Intel Xeon Scalable processors support six or eight channels per CPU. Running memory in more channels increases memory bandwidth significantly, which matters for memory-intensive workloads like virtualization and databases.

To use all available channels, you need to populate DIMMs in the correct slots. The motherboard manual (or Dell's memory compatibility matrix for PowerEdge servers) specifies exactly which slots to fill first and in what combinations to maximize channel utilization.

The generation matters, and the numbers are worth memorizing because they drive every purchasing decision. First and second generation Xeon Scalable (Skylake-SP and Cascade Lake-SP, which is what a PowerEdge R740 takes) have six DDR4 channels per socket with two DIMM slots per channel, so twelve slots per CPU and 24 in a dual-socket box. Third generation (Ice Lake-SP) moved to eight DDR4 channels. Fourth and fifth generation (Sapphire Rapids and Emerald Rapids) have eight DDR5 channels. On the AMD side, EPYC 7001 through 7003 have eight channels and EPYC 9004 has twelve.

Channel count is a bandwidth multiplier, and the arithmetic is simple: a DDR4 channel is 64 bits wide, so it moves 8 bytes per transfer. DDR4-2666 gives 2666 x 8 = 21.3 GB/s per channel, and six channels is about 128 GB/s per socket. Populate only three of those six channels and you have cut the theoretical ceiling in half no matter how much capacity you installed.

## DIMM Placement Rules

The rule of thumb: populate symmetrically. If you have a dual-socket server, put the same amount of memory in each socket. If a socket has eight memory channels, fill one DIMM per channel before adding a second DIMM to any channel.

For a Dell PowerEdge R740 with two CPUs and 24 DIMM slots, filling 12 DIMMs (6 per CPU) in the correct slots gives you full channel utilization. Adding more DIMMs fills the remaining slots.

The single most common real-world mistake is buying a "64 GB" kit as four 16 GB sticks and putting all four in one socket of a six-channel server. That leaves two channels empty. The memory controller cannot interleave across an odd, incomplete set, so it falls back to a reduced interleave and you lose roughly a third of your bandwidth. The server boots, the capacity reads correctly, and nothing looks wrong. Dell's BIOS will usually log a "memory configuration is not optimal" message in the System Event Log, which nobody reads. Buy DIMMs in multiples of the channel count: six or twelve per socket on an R740, not four or eight.

Two more placement failures worth knowing:

**Populating the second CPU's slots with no second CPU installed.** Half the DIMM slots on a dual-socket board are wired to socket 2. With one CPU installed, memory in those slots is simply invisible. There is no error, the capacity is just lower than you paid for. Dell colour-codes and numbers the slots (A1 through A12 for CPU1, B1 through B12 for CPU2) precisely so you can check this at a glance.

**Filling the second slot of a channel first.** Slots are populated white first, then black, and on most Dell boards the far slot of the pair is the one that must be filled first for signal integrity. Getting this backwards can produce a machine that either refuses to POST or trains the whole channel down a speed grade.

You also give up capacity if you enable the RAS features. Memory mirroring halves usable RAM outright, and single rank sparing reserves one rank per channel. Both are configured in BIOS and both are turned on by accident more often than on purpose.

## ECC Memory

ECC (Error-Correcting Code) memory detects and corrects single-bit memory errors automatically. It also detects (but cannot correct) multi-bit errors. For servers running production workloads, ECC is not optional. Silent memory corruption can corrupt data and cause crashes that are extremely difficult to diagnose.

All enterprise server platforms require ECC registered (RDIMM) or load-reduced (LRDIMM) memory. Consumer platforms typically do not support ECC at all.

Mechanically, standard server ECC is SECDED: Single Error Correct, Double Error Detect. It works by storing 8 check bits alongside every 64 bits of data, which is why an ECC DIMM is 72 bits wide instead of 64 and physically carries 9 or 18 DRAM chips rather than 8 or 16. That extra chip is the entire hardware cost of ECC, and it is why ECC DIMMs run roughly 10 to 20 percent more than non-ECC.

How often does this actually matter? Google's large-scale field study of its fleet, published at SIGMETRICS in 2009, found that more than 8 percent of DIMMs saw at least one correctable error per year and about a third of machines did, with roughly 1.3 percent of machines per year hitting an uncorrectable error. Those are not rare-event numbers. A homelab with 384 GB across two servers running 24/7 will see correctable errors, and without ECC it would see silent corruption instead.

What ECC cannot do is worth stating plainly. SECDED corrects one bad bit per 64-bit word and detects two. Three or more flipped bits in the same word can be miscorrected into wrong data with no error reported. It does not protect against a failing memory controller, a bad CPU, or bit flips that happen in cache or on the bus after the check. And it only partially mitigates Rowhammer: hammering a row can flip multiple bits in a word, and published work has shown ECC-equipped systems can still be exploited. ECC is a very good floor, not a guarantee.

Correctable errors are also a leading indicator, not a nuisance. A DIMM that logs a rising count of correctable errors is usually weeks away from producing an uncorrectable one. Dell's BIOS applies a correctable error threshold and will flag or map out the DIMM once it is crossed, and the Patrol Scrub feature (enabled by default on PowerEdge, running on a weekly schedule in Standard mode) walks memory in the background specifically to correct single-bit errors before a second bit in the same word turns them into an uncorrectable fault.

## LRDIMM vs RDIMM

Registered DIMMs (RDIMMs) use a register to buffer signals between the memory controller and the DRAM chips. Load-Reduced DIMMs (LRDIMMs) buffer data signals as well, reducing electrical load and allowing higher memory capacities per server.

LRDIMMs support larger capacity configurations but add a small amount of latency. For most virtualization workloads, this is an acceptable trade-off when you need maximum memory capacity.

The concrete difference is rank loading. A DDR4 memory controller can drive a limited number of ranks per channel, typically eight. An RDIMM buffers only address and command lines, so every rank on it still loads the data bus. An LRDIMM's memory buffer isolates the data lines too, presenting the controller with what looks like a single rank regardless of how many are physically on the module. That is what makes 128 GB and 256 GB 3DS LRDIMMs possible at all, and why a 24-slot R740 can reach 3 TB with LRDIMMs but not with RDIMMs.

The cost is about one extra clock cycle of latency, roughly 1 to 2 ns, on every access. For a database with a tight latency budget that is measurable. For a hypervisor running thirty VMs, it disappears into the noise, and the extra capacity is worth far more.

The rule you cannot break: **do not mix RDIMM and LRDIMM.** Dell forbids mixing DIMM types within a channel, within a socket, or across sockets on the same system. A mixed configuration typically will not POST, and when it does it runs in a degraded mode. The same applies to mixing 64 GB and 128 GB LRDIMMs. Check the technical specifications for your exact platform before combining parts from two different pulls.

## Speed Considerations

Memory speed is limited by the slowest DIMM installed and by the number of DIMMs per channel. Adding a second DIMM to a channel often drops the maximum speed. Always check the specific speed rating for your configuration in the server's documentation.

Three separate ceilings apply and the lowest one wins: the DIMM's own rating from its SPD chip, the CPU's maximum supported speed for its SKU, and the platform's derating for the population you chose. On a Cascade Lake R740, DDR4-2933 is supported at one DIMM per channel, and filling the second slot of each channel drops the whole system to 2666 MT/s. Twelve 32 GB sticks at 2933 outrun 24 of them at 2666 for bandwidth, so if you need 384 GB rather than 768 GB, buy 32 GB DIMMs and stay at one per channel.

The BIOS reads every module's Serial Presence Detect EEPROM at POST and trains the whole system to the lowest common denominator. One 2400 MT/s stick mixed into eleven 2933 sticks makes all twelve run at 2400. Also note that a lower-binned Xeon (the Bronze and Silver tiers, and the "Gold 51xx" line) caps memory at a lower speed regardless of what you install, so the DIMMs are not always the constraint.

## NUMA, and Why a VM Suddenly Runs Half as Fast

On a dual-socket server, each CPU owns its own memory controller and its own DIMMs. Memory attached to the other socket is reachable, but only across the UPI link, and remote access typically costs somewhere between 1.5x and 2x the local latency with lower bandwidth. This is Non-Uniform Memory Access, and it produces one of the most confusing symptoms in a homelab: a VM that ran fine at 64 GB becomes noticeably slower when you grow it to 200 GB, because it no longer fits inside one socket's memory and half its accesses are now remote.

Check the topology with `numactl --hardware`, which prints the nodes, the memory attached to each, and the inter-node distance matrix. On a hypervisor, size VMs to fit inside a single NUMA node where you can, and enable NUMA passthrough for the ones that genuinely need to span sockets so the guest can make its own placement decisions.

## Watching for Errors in Linux

Do not wait for a crash. The kernel's EDAC subsystem exposes per-controller counters you can poll:

```bash
# Correctable and uncorrectable error counts per memory controller
grep -H . /sys/devices/system/edac/mc/mc*/ce_count
grep -H . /sys/devices/system/edac/mc/mc*/ue_count
```

Install `rasdaemon` if you want the errors decoded down to the specific DIMM label rather than a bare counter. A count that stays at zero for months and then starts climbing on one DIMM is your notice to order a replacement while the server is still healthy.

## References

- https://en.wikipedia.org/wiki/ECC_memory
- https://en.wikipedia.org/wiki/Registered_memory
- https://en.wikipedia.org/wiki/Multi-channel_memory_architecture
- https://www.kernel.org/doc/html/latest/admin-guide/RAS/main.html
- https://research.google/pubs/dram-errors-in-the-wild-a-large-scale-field-study/
- https://downloads.dell.com/topicspdf/poweredge-r740_owners-manual2_en-us.pdf
