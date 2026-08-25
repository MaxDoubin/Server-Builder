
## The numbers

You are filling drive bays and you have to decide whether the NVMe premium is real or marketing. The spec sheets are not much help, because the sequential numbers everyone quotes describe a workload almost no server actually runs. Here is what the difference is made of, where it shows up in practice, and how to measure it on your own hardware instead of trusting anyone's chart.

A typical SATA SSD tops out at around 550 MB/s sequential read. A modern NVMe SSD reaches 5,000 MB/s or more on PCIe 4.0, and enterprise NVMe drives designed for consistent random I/O push even harder. The gap is not marginal. It is an order of magnitude.

But raw speed is only part of the story. The more important metric for servers is IOPS (input/output operations per second) for random small-block reads and writes. That is where NVMe really pulls ahead.

## Why the gap exists

SATA and NVMe are not two speeds of the same thing. They are different protocols with different assumptions about what is on the other end.

SATA III signals at 6 Gbit/s. After 8b/10b line encoding that leaves about 600 MB/s of payload on the wire, and real drives land near 550 MB/s. That ceiling is fixed, it is per port, and no drive can beat it. It also sets a hard limit on small random I/O: at 4 KiB per operation, 550 MB/s is roughly 135,000 IOPS no matter how good the flash is.

The protocol on top of SATA is AHCI, which was designed when the thing at the end of the cable was a spinning platter with one arm. AHCI gives you a single command queue, 32 commands deep. That was generous for a mechanical disk that could service one request at a time anyway. For a flash device with dozens of parallel NAND channels, it is a funnel.

NVMe threw that model out. It talks to the drive over PCIe directly, with no host bus adapter translating between protocols, and it is built around many deep queues instead of one shallow one: the specification allows up to 65,535 I/O queues with up to 65,536 entries each. In practice a driver creates one submission and completion queue pair per CPU core, so each core talks to the drive without taking a lock shared with the other cores. The command set itself is smaller, the register interface is a doorbell write rather than a legacy port sequence, and completions arrive as MSI-X interrupts steered back to the core that issued the request.

Bandwidth follows from PCIe rather than from a fixed cable speed. A PCIe 3.0 x4 link carries roughly 3.9 GB/s, PCIe 4.0 x4 roughly 7.9 GB/s, and PCIe 5.0 x4 roughly 15.8 GB/s. Want more, add lanes.

The result is that the interesting number is not throughput, it is latency under concurrency. A SATA SSD at queue depth 32 is already saturated and every additional request just waits. An enterprise NVMe drive at queue depth 32 is barely awake.

## Where NVMe wins clearly

**VM storage:** Virtual machines doing lots of random I/O benefit enormously from NVMe. Boot times drop, responsiveness improves, and you can run more VMs per storage device before hitting I/O bottlenecks.

**Database workloads:** Any database doing lots of small random reads and writes sees dramatic improvements with NVMe.

**Live migrations:** Moving a running VM between hosts over NVMe-backed storage is smoother and faster than SATA.

The common thread is concurrency. Ten VMs each doing modest random I/O do not add up to a nice sequential stream at the drive; they add up to a blender. That is the exact case where the queueing model matters more than the headline bandwidth, and it is why a single NVMe drive can replace a small shelf of SATA SSDs in a virtualisation host.

## Where SATA is still fine

**Bulk storage and archives:** If you are storing backup files, logs, or large media files that are written once and read occasionally, SATA is perfectly adequate. Sequential throughput on SATA is more than sufficient for these workloads.

**Cold data tiers:** Many storage systems implement tiering, where hot data lives on NVMe and cold data moves to SATA or spinning disk. SATA fits naturally in this architecture.

Add a third: anything gated by something slower than the drive. A backup target fed by a 1 GbE uplink cannot absorb more than about 118 MB/s, so a SATA SSD there is idling and an NVMe drive would idle harder. Before paying for NVMe, find the actual bottleneck. If it is the network, the CPU, or a single threaded application that never issues more than one request at a time, faster storage changes nothing you can measure.

SATA also wins on lanes and on ports. A cheap HBA gives you sixteen SATA ports. Sixteen U.2 NVMe drives want 64 PCIe lanes, which on most platforms means a PCIe switch, a more expensive backplane, and a real look at your slot budget.

## Enterprise NVMe specifics

Consumer NVMe drives are not designed for 24/7 server duty. Enterprise NVMe drives have features like power loss protection (capacitors that complete writes if power fails), consistent latency profiles under sustained load, and much higher endurance ratings.

Power loss protection deserves the most attention, because it changes correctness and not just speed. A drive with PLP can acknowledge a write once it is in the drive's own volatile buffer, knowing the onboard capacitors hold enough charge to flush that buffer to NAND if the rack loses power. A drive without PLP either has to write through to flash before acknowledging, which is slow, or lie about durability, which is worse. This is why consumer NVMe drives post terrible numbers for synchronous small writes, and why they are a bad choice for a ZFS log device or a database write-ahead log.

Endurance is quoted as drive writes per day over a warranty period, usually five years. Read-intensive enterprise parts sit around 1 DWPD, mixed-use around 3 DWPD, and write-intensive around 10 DWPD, achieved mostly by overprovisioning more spare NAND. Match the tier to the workload rather than buying the biggest number: a backup target that is written once a night does not need write-intensive flash.

Form factor matters too. M.2 was designed for laptops. It has no hot-swap story, limited surface area for heat, and in a hot server chassis it will thermally throttle. U.2 and the EDSFF formats are the server answer: front loading, hot swappable, and built to be cooled by chassis airflow.

In my lab, I run NVMe for VM storage pools and SATA SSDs for secondary storage. The performance difference is obvious in daily use, and the cost difference has narrowed enough that NVMe is the right choice for anything performance-sensitive.

## A worked example: measure it yourself

Do not trust the sticker. Measure with fio, using direct I/O so the page cache is out of the way, and a queue depth that reflects your real concurrency. Read-only tests against a raw device are safe. A write test against a raw device destroys the data on it, so point write tests at a file inside a filesystem unless the drive is genuinely empty.

```bash
fio --name=randread --filename=/dev/nvme0n1 --rw=randread --bs=4k \
    --ioengine=libaio --direct=1 --iodepth=32 --numjobs=4 \
    --group_reporting --runtime=60 --time_based
```

The line that matters in the output looks like this:

```
   read: IOPS=612k, BW=2392MiB/s (2508MB/s)(140GiB/60001msec)
    clat (usec): min=41, max=2287, avg=207.44, stdev=51.02
```

Run the identical command against a SATA SSD and the shape of the answer changes completely. Expect somewhere in the region of 90,000 IOPS, hard capped by the 6 Gbit/s link long before the flash gives up, with completion latency about an order of magnitude higher and much more variable. That variance is the part that shows up as a laggy VM.

Two settings worth checking before you conclude anything. NVMe devices should be using the multi-queue block layer with no I/O scheduler, since reordering requests for a device with no seek penalty just adds latency:

```bash
cat /sys/block/nvme0n1/queue/scheduler
```

```
[none] mq-deadline kyber bfq
```

And check the drive's own health and wear counters, which is the closest thing to an honest opinion you will get out of the hardware:

```bash
sudo nvme smart-log /dev/nvme0
```

```
critical_warning                    : 0
temperature                         : 36 C
available_spare                     : 100%
available_spare_threshold           : 10%
percentage_used                     : 2%
media_errors                        : 0
```

`percentage_used` is the controller's estimate of consumed endurance, and it is allowed to exceed 100. `available_spare` dropping toward its threshold means the drive is running out of replacement blocks, which is the signal to replace it. Note that `data_units_read` and `data_units_written`, if you print the full log, are counted in thousands of 512-byte units, so each unit is 512 KB. People routinely misread that field by three orders of magnitude.

## What breaks

**The drive is in an x4 slot electrically wired for x1.** Physical slot length tells you nothing about the lane count behind it, and cheap risers and some backplanes silently drop you to x1 or x2. Your 7 GB/s drive then benchmarks at a quarter of that and everything looks like a driver problem. Check with `sudo lspci -vv -s <bdf> | grep LnkSta` and compare the negotiated width and speed against `LnkCap`.

**M.2 drives throttle in server chassis.** A drive that starts at 6,000 MB/s and settles at 900 MB/s two minutes into a copy is not defective, it is hot. Watch `nvme smart-log` temperature during a sustained run, and if it is climbing into the drive's throttle range, the fix is airflow or a different form factor, not firmware.

**Benchmarking with queue depth 1 and concluding NVMe is not worth it.** A single threaded `dd` sees the latency of one request at a time, which is the one measurement where SATA looks respectable. It also is not how anything on a server behaves. Test at the concurrency your workload actually generates, and if you do not know what that is, look at `avgqu-sz` in `iostat -x 1` on the live system.

**Consumer drives fall off a cliff after the SLC cache fills.** Client NVMe drives write incoming data into a fast pseudo-SLC region and fold it into denser cells later. Benchmarks under a minute never leave that cache, so the drive looks fantastic. Write 200 GB continuously and throughput can collapse to well below SATA speeds. Always run sustained-write tests long enough to exhaust the cache before you believe a number.

**Discard is never issued, so the drive slowly gets slower.** Without TRIM the controller does not know which blocks are free and garbage collection has to relocate data it could have thrown away, driving up write amplification. Confirm the path works end to end: `lsblk --discard` should show non-zero discard granularity and maximum, and a periodic `fstrim -av` should report bytes trimmed. On thin-provisioned or virtualised storage, discard also has to be enabled at every layer in between or it stops at the first one that ignores it.

**Mixing a SATA SSD into an NVMe pool and wondering why the pool is slow.** A striped or mirrored set runs at the pace of its slowest member for anything that has to touch all members. This shows up most painfully when someone adds a leftover SATA drive as a mirror partner for an NVMe device.

## References

- https://en.wikipedia.org/wiki/NVM_Express
- https://en.wikipedia.org/wiki/Serial_ATA
- https://en.wikipedia.org/wiki/Advanced_Host_Controller_Interface
- https://en.wikipedia.org/wiki/PCI_Express
- https://www.kernel.org/doc/html/latest/block/blk-mq.html
- https://fio.readthedocs.io/en/latest/fio_doc.html
