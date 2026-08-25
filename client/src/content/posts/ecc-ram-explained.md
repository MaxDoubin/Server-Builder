
## What ECC does

You are speccing a server, the ECC memory costs more than the desktop sticks sitting in a bin on your desk, and nobody can give you a straight answer about whether it matters. Or you already have a machine that randomly panics once a month and you are trying to work out whether the memory is lying to you. Both of those questions have the same answer underneath, so here is how ECC works and how to check whether yours is doing anything.

ECC stands for Error-Correcting Code. Standard desktop RAM (non-ECC) can detect some memory errors but cannot fix them. ECC RAM adds an extra bit per byte that allows the memory controller to detect and correct single-bit errors automatically, and detect (but not correct) double-bit errors.

Single-bit errors happen more often than you might think. Cosmic rays, electrical noise, and manufacturing imperfections can all flip a bit in memory. On a desktop, this might cause a crash or a corrupted file once in a while. On a server running 24/7 with terabytes of RAM, the probability of a bit flip becomes a near certainty over time.

## How the correction actually works

The scheme is called SECDED: single error correct, double error detect. A DDR4 ECC DIMM is 72 bits wide where a non-ECC DIMM is 64 bits wide, and `dmidecode` will show you exactly that as "Total Width: 72 bits, Data Width: 64 bits". Those 8 extra bits per 64-bit word are check bits derived from a Hamming code with one added overall parity bit.

On every read, the memory controller recomputes the check bits from the data it got back and compares them to the check bits it stored. If they match, the read is clean. If they differ, the pattern of the difference (the syndrome) points at exactly which of the 72 bit positions is wrong, and the controller flips it back before the data reaches the CPU. That is a correctable error, or CE. If two bits in the same word are wrong, the syndrome is ambiguous: the controller can tell something is broken but not what, so it reports an uncorrectable error, or UE, and the kernel usually kills the affected process or panics rather than continuing on data it knows is wrong.

Server platforms layer more on top of plain SECDED. Patrol scrubbing walks memory in the background reading and rewriting it, so a latent single-bit error gets corrected before a second flip in the same word turns it into an uncorrectable one. Chipkill, which Intel calls single device data correction, spreads a codeword across DRAM devices so that an entire failed chip looks like a correctable error rather than a catastrophe.

DDR5 muddies the vocabulary. Every DDR5 module, including consumer ones, has on-die ECC inside the DRAM chips, because the cell densities are high enough that the parts would not be reliable without it. That is not the same thing as an ECC DIMM. On-die ECC protects the array internally, does not protect the data as it crosses the bus to the CPU, and does not report anything to the operating system. A real DDR5 ECC module is wider on the wire: two 32-bit subchannels each carrying 8 bits of ECC, 80 bits total. If a vendor tells you a DDR5 stick "has ECC", ask which one they mean.

## Why servers need it

Servers store critical data in memory. Database pages, file system caches, VM memory, and application state all live in RAM. A single flipped bit in a database page could corrupt a record. A flipped bit in a file system write could silently damage data on disk.

ECC memory prevents this by catching and fixing errors before they can cause damage. The correction happens transparently, with no performance penalty and no software involvement. The server logs the correction so administrators can monitor memory health, and if a DIMM starts throwing too many errors, it can be replaced before it fails completely.

That logging is the underrated half. Large scale studies of production fleets keep finding the same shape of result: memory errors are not spread evenly across all modules, they cluster hard on a small number of bad DIMMs, and a DIMM that has thrown correctable errors is dramatically more likely to throw more. In other words the useful signal is not "did an error happen", it is "is this specific slot getting worse". Non-ECC hardware gives you neither the correction nor the signal.

## A worked example: proving your ECC is working

Three checks, in order. First, confirm the hardware is actually ECC:

```bash
sudo dmidecode -t memory | grep -E 'Total Width|Data Width|Error Correction'
```

```
	Error Correction Type: Multi-bit ECC
	Total Width: 72 bits
	Data Width: 64 bits
```

If total width equals data width, the module is not ECC no matter what the sticker says. If the memory array reports "None" for error correction type, the board or the CPU is not running the memory in ECC mode even if the sticks support it.

Second, confirm the kernel has an EDAC driver bound to your memory controller. EDAC is the kernel subsystem that reads the controller's error registers and exposes counters in sysfs:

```bash
grep . /sys/devices/system/edac/mc/mc0/{ce_count,ue_count}
```

```
/sys/devices/system/edac/mc/mc0/ce_count:0
/sys/devices/system/edac/mc/mc0/ue_count:0
```

Two zeros is the healthy answer. No `mc0` directory at all is the answer you have to chase, because it means nothing is reading the error registers and errors will be corrected silently with no record. Check that an EDAC module for your platform is loaded with `lsmod | grep edac`.

Third, install rasdaemon so errors get decoded, timestamped, and stored rather than just incrementing a counter:

```bash
sudo ras-mc-ctl --summary
```

```
No Memory errors.
No PCIe AER errors.
No Extlog errors.
No MCE errors.
```

When something does go wrong, `ras-mc-ctl --errors` prints the location down to the DIMM label, which is what you need to know which slot to pull. Cross-check against the out of band log on the service processor, the iDRAC or IPMI system event log, because that records memory events even when the host operating system is not running.

## The performance question

ECC RAM is often slightly slower than non-ECC RAM because of the additional error-checking overhead. In practice, the difference is negligible for server workloads. We are talking about single-digit percentage differences in memory bandwidth, which almost never matters for real applications.

The bigger factor is that server-class ECC DIMMs (RDIMMs and LRDIMMs) run at specific speeds that are often lower than what consumer DDR4 or DDR5 achieves. But servers compensate with more memory channels and more DIMMs, so total bandwidth is usually higher than a consumer system despite the lower per-DIMM speed.

The reason those DIMMs are slower per module is worth knowing, because it explains the whole product line. A registered DIMM puts a register between the memory controller and the DRAM chips for the command and address signals, which adds a cycle of latency but massively reduces the electrical load the controller has to drive. A load-reduced DIMM buffers the data lines too. That buffering is what lets a server hang eight, twelve, or more high capacity modules off one controller at all. Unbuffered ECC also exists, and is what you find on entry level server boards and workstation platforms.

## When you need it

If you are running workloads where data integrity matters (databases, file servers, ZFS, virtualization), use ECC. ZFS in particular strongly recommends ECC RAM because it relies on the integrity of its in-memory data structures to maintain data consistency.

Worth being precise about the ZFS case, because the internet has invented a monster around it. The folklore says a scrub on a machine with bad RAM will progressively destroy the whole pool. That specific escalating failure is not a documented behaviour of ZFS and the developers have said so. The real risk is duller and still bad: ZFS checksums data after it exists in memory, so if a bit flips before the checksum is computed, ZFS faithfully stores corrupt data with a perfectly valid checksum and will defend that corruption forever. ECC closes the window that no filesystem can close from software.

For a homelab, ECC is a strong recommendation but not an absolute requirement. If you are running ZFS or storing data you care about, get ECC. If you are just experimenting with VMs and do not mind the occasional crash, non-ECC will work, but you are accepting a risk that grows with the amount of RAM in the system.

## What breaks

**The DIMMs are ECC but the platform is not.** ECC needs support from the memory controller, which lives in the CPU, and from the firmware. Put ECC modules in a board that does not support it and, if they post at all, they run as ordinary memory with the check bits ignored. You will have paid for ECC and got nothing. Verify with `dmidecode` after the build, not with the invoice.

**Nothing is watching the counters.** Correctable errors are, by design, invisible. The machine keeps working. A DIMM can spend six months quietly correcting thousands of errors an hour, then produce an uncorrectable one at three in the morning. Scrape `ce_count` per DIMM into your monitoring and alert on the rate of change, not the absolute value, because a slot that suddenly starts accumulating is the thing you want to catch.

**memtest86+ comes back clean on genuinely bad memory.** On an ECC system, single-bit faults get corrected before the test sees them, so the test passes while the hardware degrades. Memory testers are for non-ECC systems and for confirming gross failures. On a server, the EDAC and rasdaemon logs are the real diagnostic, and they run continuously instead of only when the machine is offline.

**Mixing modules, or filling slots in the wrong order.** Server memory population rules are not suggestions. Channels must usually be filled symmetrically and in a documented slot order, and mixing ranks, sizes, or RDIMM with LRDIMM often forces the whole set to a lower speed or refuses to post. Read the board's memory population table before you order, because the cheap secondhand DIMM that will not cooperate with your existing set is not a bargain.

**Assuming ECC makes you immune to Rowhammer.** Repeatedly hammering one DRAM row can disturb bits in adjacent rows, and researchers have demonstrated attacks that work on ECC systems by finding multi-bit patterns the code cannot catch or by using the timing of corrections as a side channel. ECC raises the difficulty substantially. It is not a mitigation you can rely on by itself, and target row refresh in the DRAM plus a patched hypervisor still matter.

**Uncorrectable errors get treated as software bugs.** A UE typically surfaces as a machine check exception, and the visible symptom is a process that died for no reason or a host that panicked. If you see those in a pattern and you have not checked the memory logs, you can burn a week debugging an application that was never at fault.

## References

- https://en.wikipedia.org/wiki/ECC_memory
- https://en.wikipedia.org/wiki/Hamming_code
- https://www.kernel.org/doc/html/latest/admin-guide/RAS/main.html
- https://www.kernel.org/doc/html/latest/driver-api/edac.html
- https://en.wikipedia.org/wiki/Registered_memory
- https://en.wikipedia.org/wiki/Row_hammer
