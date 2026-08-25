
## Why BIOS Settings Matter

Server BIOS settings control how the hardware behaves at the lowest level. A misconfigured BIOS can leave performance on the table, cause stability issues, or create security vulnerabilities. Most people never touch BIOS settings after initial setup, which means they are running with defaults that may not match their workload.

The other reason to care is that several of these settings are invisible from inside the operating system. If NUMA is hidden by the firmware, no amount of kernel tuning brings it back. If SR-IOV is off, the virtual functions do not exist and `lspci` shows nothing missing. A surprising share of "why is Linux ignoring my tuning" questions are answered two layers down.

## System Profile

Dell servers offer system profiles that bundle related settings. The most important choice is between "Performance" and "Performance Per Watt (OS)." Performance mode runs CPUs at maximum frequency regardless of load. Performance Per Watt lets the OS manage frequency scaling, saving power during idle periods.

For virtualization workloads, I use "Performance Per Watt (OS)" because my servers are not constantly under full load. The power savings are real, and the performance impact is minimal because the OS scales frequency up instantly when load increases.

There is a third option that trips people up: "Performance Per Watt (DAPC)," where DAPC stands for Dell Active Power Controller. In DAPC mode the firmware manages P-states itself and the operating system has no say. That is fine, but it means your `cpupower frequency-set` commands and your carefully chosen governor do nothing at all, silently. If you intend to tune frequency scaling from Linux using `intel_pstate` or `acpi-cpufreq`, you need the (OS) profile or a Custom profile with OS control enabled. Checking `cpupower frequency-info` after a profile change takes ten seconds and saves an afternoon.

What Performance mode actually does is disable C-states and C1E, lock memory frequency to maximum, and stop the OS from scaling anything down. The reason to want that is not throughput, it is latency jitter. Waking a core from a deep C-state costs time: C1 exit is on the order of a couple of microseconds, while deeper package C-states run into the tens of microseconds. For a workload where a packet arriving on an idle core must be handled immediately, that variance is the whole problem. For a hypervisor running general-purpose VMs, the cores are rarely idle long enough for it to matter and you are paying for heat.

One more thing surprises people about Performance mode: it does not give you the maximum turbo bin all the time. All-core turbo is lower than single-core turbo, and on Intel Xeon Scalable parts, AVX-512 workloads run at a separately specified, lower base and turbo frequency. A CPU advertised at 3.0 GHz base can legitimately run heavy vector code below that number, and no BIOS setting changes it.

## Memory Settings

Memory interleaving should be enabled for maximum memory bandwidth. This spreads memory access across all channels evenly. I also enable ECC error logging so any memory errors are recorded in the system event log and trigger alerts through iDRAC.

Memory operating mode should be set to "Optimizer Mode" for best performance. "Mirror Mode" provides memory redundancy at the cost of half the usable capacity, which is only worth it for mission-critical production servers.

Distinguish two settings that both have "interleave" in the name, because they pull in opposite directions. Channel interleaving, within a socket, is the one you want on: it spreads consecutive addresses across the memory channels so one stream of reads uses all of them. Node interleaving, across sockets, is the one you want off. It interleaves memory between physical CPUs and hides the NUMA topology from the operating system, making every access uniformly mediocre instead of mostly local. Every modern hypervisor and database is NUMA-aware and places memory intelligently if you let it see the topology. With node interleaving on, `numactl --hardware` reports a single node and you have thrown that away.

The setting that costs the most performance is not a setting at all, it is how you populated the slots. Xeon Scalable processors in an R740 have six memory channels per socket, and bandwidth scales with populated channels, so filling four of six costs roughly a third of your memory bandwidth no matter how fast the DIMMs are. Populate in multiples of six per socket. Going to two DIMMs per channel also often drops the configured speed a tier, so 12 DIMMs per socket can be slower than 6 in bandwidth-bound work while giving double the capacity.

Mixing DIMMs is where people lose days. The whole system clocks down to the slowest module present, mixing ranks and sizes within a channel is restricted, and some combinations will not post at all. Buy matched kits.

On ECC, the distinction worth understanding is between correctable and uncorrectable errors. A correctable error is silently fixed and logged, so a rising count on one DIMM is a replace-it-soon signal, not an emergency. An uncorrectable error results in a machine check, which usually means a crash. On Linux the counters live in the EDAC subsystem under `/sys/devices/system/edac/`, and `rasdaemon` attributes them to a specific DIMM slot. Turn correctable error logging on and actually alert on it, because the entire value of ECC is the warning it gives you before the failure.

## Virtualization

If you are running a hypervisor, enable Intel VT-x (or AMD-V) and VT-d (or AMD-Vi). VT-x provides hardware-assisted CPU virtualization, and VT-d enables direct device passthrough to virtual machines. Both are required for modern hypervisors to work at full performance.

Two follow-ups that the checklists usually omit.

First, SR-IOV is a separate switch. On Dell servers it lives under Integrated Devices as "SR-IOV Global Enable" and it ships disabled. With VT-d on and SR-IOV off, the physical function works fine and no virtual functions ever appear, which looks exactly like a driver problem and is not one.

Second, on Linux the BIOS setting is necessary but not sufficient. You also need `intel_iommu=on` (or `amd_iommu=on`) on the kernel command line. After that, passthrough is constrained by IOMMU groups: every device in a group must be assigned to the same guest, because the hardware cannot isolate them from one another. Group granularity depends on whether the PCIe root ports support Access Control Services. On consumer boards a whole slot often lands in one group with the chipset; on server boards the grouping is usually clean, which is a concrete reason to use server hardware for passthrough work.

## Boot Configuration

Set the boot mode to UEFI rather than Legacy BIOS. UEFI is faster, supports larger disks, and provides Secure Boot capabilities. Unless you are running a very old operating system, there is no reason to use Legacy mode.

The disk size limit has a specific number behind it. Legacy boot uses an MBR partition table, whose LBA fields are 32 bits wide. With 512-byte sectors that caps addressable space at 2^32 times 512 bytes, which is 2 TiB. GPT, which UEFI uses, uses 64-bit LBAs and removes the ceiling for any drive you will ever buy. A 4 TB boot volume is simply not possible in Legacy mode.

The mistake to avoid is flipping this setting on a server that already has an operating system installed. Boot mode is not cosmetic: the firmware looks for a completely different thing on disk in each mode, so switching after installation produces an unbootable system and a "no boot device found" message even though the disk is perfectly healthy. Set it before you install. Windows has `MBR2GPT` and Linux can usually be converted by hand, but both are more work than reinstalling a lab box.

Secure Boot has a real tradeoff worth naming. It requires everything in the boot chain to be signed by a key the firmware trusts, which also means unsigned kernel modules will not load. On Linux that hits out-of-tree drivers: proprietary NVIDIA modules, ZFS built through DKMS, VirtualBox. The fix is enrolling a Machine Owner Key and signing your modules, which is worth learning and not worth discovering at 11 PM.

## Power Redundancy

If your server has dual power supplies, set the power redundancy policy to "Redundant." This means the server distributes load across both PSUs and can survive the failure of either one. "Non-Redundant" uses all available power capacity but offers no protection against PSU failure.

Dell also offers Hot Spare mode, which is worth knowing about. In Hot Spare the server puts one PSU into a standby state and runs the load on the other, waking the standby unit if demand rises or the active one fails. The reason this saves power is the shape of the efficiency curve: a supply is most efficient near half load, so one PSU at 40 percent beats two PSUs at 20 percent each. Redundancy is preserved because the standby comes up in milliseconds.

Two caveats. Redundancy at the server means nothing if both cords go to the same PDU on the same breaker, so plan the feeds as well as the setting. And do not mix PSU wattages in one chassis; Dell will flag the mismatch, and depending on the model it will either refuse to use both or derate to the smaller one.

## Firmware Updates

Keep the BIOS firmware updated. Dell releases BIOS updates that fix bugs, improve stability, and patch security vulnerabilities. Use iDRAC or the Lifecycle Controller to apply updates without needing a bootable USB drive.

Order matters. Update iDRAC and the Lifecycle Controller first, then the BIOS, then everything else, because a BIOS package can fail to stage against an old Lifecycle Controller. Expect the update to add several minutes to the next boot while the Lifecycle Controller applies it, and never interrupt a flash: power loss during a BIOS write is one of the few ways to genuinely brick a server.

The reason to actually track BIOS releases rather than treating them as optional is CPU microcode. Speculative execution mitigations for Spectre, Meltdown, and the various MDS variants ship as microcode inside BIOS updates, and there is no other path to them apart from the operating system's own early-load microcode package. Be aware that they are not free. Syscall-heavy and context-switch-heavy workloads take a measurable hit from these mitigations, which is a real tradeoff on an isolated lab host and not a real tradeoff on anything running untrusted code.

Finally, export the configuration before you change anything. On Dell hardware, `racadm get -f bios.xml -t xml` or a Server Configuration Profile export from the Lifecycle Controller captures every setting in a file you can diff, version in git, and replay onto an identical machine. That turns "what did I change six months ago" into a `git log`, and makes building a second identical host a ten minute job.

## What BIOS Settings Will Not Fix

Firmware tuning is a small multiplier on hardware you already have. It will not make a 6-channel CPU with 4 populated channels perform like a fully populated one, and Performance mode will not rescue a workload that is actually waiting on disk or network. Measure first, find the real bottleneck, and only then open the setup screen. The settings that reliably matter are the handful above: NUMA visibility, channel population, IOMMU and SR-IOV, boot mode, and ECC logging. Almost everything else is a default for good reasons.

## References

- https://www.kernel.org/doc/html/latest/admin-guide/pm/intel_pstate.html
- https://www.kernel.org/doc/html/latest/driver-api/vfio.html
- https://www.kernel.org/doc/html/latest/driver-api/edac.html
- https://en.wikipedia.org/wiki/Unified_Extensible_Firmware_Interface
- https://en.wikipedia.org/wiki/GUID_Partition_Table
- https://en.wikipedia.org/wiki/Non-uniform_memory_access
