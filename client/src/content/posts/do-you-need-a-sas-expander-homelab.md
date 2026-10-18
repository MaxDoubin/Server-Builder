
## The problem

You have more drives than your HBA has connectors, or a backplane that came with a server and you cannot tell whether it contains an expander. You need to know what an expander does to bandwidth, when a direct connection is enough, and how to cable the setup you already have.

## How an HBA connects drives

An HBA (host bus adapter) sits in a PCIe slot and talks to drives through its own SAS ports. Broadcom's user guide for the 9300-8i describes eight lanes of 12 Gb/s SAS, delivered through two x4 internal mini-SAS HD (SFF-8643) connectors, with a PCIe 3.0 x8 host interface ([Broadcom](https://docs.broadcom.com/doc/12354877)).

<figure>
<img src="/images/blog/do-you-need-a-sas-expander-homelab/photo-1.jpg" alt="Internal SFF-8643 mini-SAS HD connector, the four-lane connector type used on SAS-3 HBAs such as the 9300-8i" width="1400" height="1109" loading="lazy" decoding="async">
<figcaption>An internal mini-SAS HD (SFF-8643) connector for four SAS lanes, photographed in 2016. A 9300-8i uses two connectors of this type, and a fan-out cable splits each one into four drive connections. Photo: Dmitry Nosachev, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:SFF-8643_SMC.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

A fan-out cable splits one x4 connector into four direct drive connections, so the two connectors on a 9300-8i reach eight drives with no expander at all ([Techtellectual](https://techtellectual.com/sas-expander-vs-hba/)). Each direct drive also has its own link. A SAS-3 port carries 1,200 MB/s ([Thomas-Krenn](https://www.thomas-krenn.com/en/wiki/Serial_Attached_SCSI_Standards_Overview)), and a 20TB Exos X20 is rated at a maximum sustained 285 MB/s at its outer diameter ([StorageReview](https://www.storagereview.com/review/seagate-exos-x20-20tb-enterprise-hdd-review)). For one drive, the link is never the limit.

The limit of direct attach is the connector count. Once you have more drives than connectors, the choices are a second HBA, a card with more ports, or an expander.

## How an expander connects drives

An expander is a chip that takes the HBA's uplinks and fans them out to more drives. jro.io describes it as "a chip on the backplane itself that acts as a SAS splitter" ([jro.io](https://jro.io/truenas/hardware/)). Wikipedia's wording is that an expander "allows a single initiator to communicate with more SAS/SATA targets" ([Wikipedia](https://en.wikipedia.org/wiki/Serial_Attached_SCSI)).

Supermicro's user guide for the BPN-SAS3-216EL1 backplane says it has "a single-port expander on the daughter card that accesses all of the drives" ([Supermicro](https://www.supermicro.com/manuals/other/BPN-SAS3-216EL.pdf)). All 24 drives sit behind that one expander, and the cables you run from the HBA decide how many links carry their traffic. The payoff is connector count. Thomas-Krenn notes that 24 SSDs can be connected to an 8-port HBA or [RAID](/blog/raid-levels-comparison) controller when an expander sits between them ([Thomas-Krenn](https://www.thomas-krenn.com/en/wiki/SAS_expander_backplane_performance_effects)). The cost is that those 24 drives now share the HBA's links.

An expander does not add bandwidth. jro.io's 24-drive example says "you still have the same bandwidth between the backplane and the HBA (24Gbit/s for SAS-2 and 48Gbit/s for SAS-3)." That bandwidth is split out to all the attached drives ([jro.io](https://jro.io/truenas/hardware/)).

## Bandwidth math for one SAS link

SAS-2 runs at 6 Gbit/s per lane and SAS-3 at 12 Gbit/s, and both use 8b/10b encoding ([Wikipedia](https://en.wikipedia.org/wiki/Serial_Attached_SCSI)). Eight bits of data occupy ten bits on the wire, so one 12 Gbit/s lane carries 9.6 Gbit/s of payload, or 1,200 MB/s. Thomas-Krenn's table gives 600 MB/s per SAS-2 port. A four-port wide link carries 2,400 MB/s on SAS-2 and 4,800 MB/s on SAS-3 ([Thomas-Krenn](https://www.thomas-krenn.com/en/wiki/Serial_Attached_SCSI_Standards_Overview)).

Drive demand is the other side of the sum. StorageReview's spec table lists the 20TB Exos X20 at 285 MB/s (272 MiB/s) maximum sustained at the outer diameter ([StorageReview](https://www.storagereview.com/review/seagate-exos-x20-20tb-enterprise-hdd-review)). jro.io plans with about 150 MB/s per drive in its 24-drive example ([jro.io](https://jro.io/truenas/hardware/)). The table uses the outer-diameter figure as the upper bound and divides demand by each link's rate.

| Drives behind one x4 link | Demand at 285 MB/s | SAS-2 link (2,400 MB/s) | SAS-3 link (4,800 MB/s) |
| --- | --- | --- | --- |
| 8 | 2,280 MB/s | Fits | Fits |
| 12 | 3,420 MB/s | About 1.4 times over | Fits |
| 24 | 6,840 MB/s | About 2.85 times over | About 1.4 times over |

To check any build, multiply the drive count by the rate you expect per drive, then divide by the link rate. A result above 1.0 means the drives will queue whenever they all read at once.

At jro.io's 150 MB/s, 24 drives want 3,600 MB/s, or 1.5 times one SAS-2 link. jro.io calls a single SAS-2 cable "a slight bottleneck" in that case and says the "slight SAS-2 bottleneck really wouldn't be an issue" behind a 10 Gbit/s Ethernet link ([jro.io](https://jro.io/truenas/hardware/)).

The slot is the other limit. Two x4 cables from a 9300-8i carry eight SAS-3 lanes, or 9,600 MB/s, but a PCIe 3.0 x8 slot carries 7.877 GB/s per direction ([Wikipedia](https://en.wikipedia.org/wiki/PCI_Express)). The slot is therefore the ceiling for the card. It still clears the 6,840 MB/s that 24 drives can demand at outer-track speed. One SAS-3 cable cannot carry that load, and two can.

## Expander overhead in a benchmark

An expander also costs write throughput on its own. Thomas-Krenn tested a single Intel D3-S4610 960 GB SSD behind a Broadcom 9300-8i and a BPN-SAS3-216EL1 backplane. With the expander in the path, maximum write throughput fell by 15.3% at 1024k blocks and by 18.6% at 4k blocks. Latency rose by 4% for 100% reads and 12% for 100% writes ([Thomas-Krenn](https://www.thomas-krenn.com/en/wiki/SAS_expander_backplane_performance_effects)). The same test recorded about 15.6% fewer IOPS in the 100% write case, while the 100% read and 50/50 mixes stayed about the same. Reads showed noticeable differences only at the smaller 8k block size.

That test used one drive, so it isolates the expander's cost in the I/O path. It says nothing about many drives competing for one uplink, which is a bandwidth question.

## When a homelab needs an expander

Start with the connector count. If your drives fit the HBA's connectors, an expander adds cost and overhead without adding bandwidth. If they do not, check how the backplane connects to the HBA before you buy the controller, because the cable count sets how many HBA ports you need. Techtellectual gives two reasons to choose an expander: "If there are inadequate PCIe slots for an additional HBA, or it is cheaper to purchase a SAS Expander, go with it" ([Techtellectual](https://techtellectual.com/sas-expander-vs-hba/)).

One TrueNAS forum owner reports 12 drives connected to a 9400-16i in their build, and the post does not mention an expander ([TrueNAS community](https://forums.truenas.com/t/guidance-on-hba-expanders-for-new-build/37841)).

The chassis decides too. Thomas-Krenn says servers with a discrete backplane offer up to 12 storage slots, while "Servers with an expander backplane offer up to 36 disk slots" ([Thomas-Krenn](https://www.thomas-krenn.com/en/wiki/SAS_expander_backplane_performance_effects)).

Bandwidth sets the rest. For a file server on spinning disks, a single SAS-2 link can be acceptable, as jro.io's example suggests. For SSD pools, measure before committing, because the overhead Thomas-Krenn measured was on an SSD.

The HBA side needs the same care. OpenZFS says "It is best to use a HBA instead of a RAID controller, for both performance and reliability" ([OpenZFS](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)). If your server uses a Dell PERC, settle the controller mode first with [PERC H730 HBA mode](/blog/perc-h730-hba-mode). For an R730 build, [TrueNAS on a Dell R730](/blog/truenas-on-dell-r730) covers the controller and boot-drive layout.

## SATA drives behind an expander

Wikipedia says SAS controllers can reach SATA devices "through SAS expanders using Serial ATA Tunneling Protocol (STP)" ([Wikipedia](https://en.wikipedia.org/wiki/Serial_Attached_SCSI)), while OpenZFS says "Never place SATA disks into a SAS expander without a SAS interposer" ([OpenZFS](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)). Direct attach avoids the question. Wikipedia also describes the other path, in which SATA devices are "directly connected using native SATA protocol" ([Wikipedia](https://en.wikipedia.org/wiki/Serial_Attached_SCSI)). Check the backplane vendor's manual for SATA support before you mix drive types, and keep an all-SATA pool on direct attach if the manual says nothing.

<figure>
<img src="/images/blog/do-you-need-a-sas-expander-homelab/photo-2.jpg" alt="Connectors of a SAS hard drive and a SATA hard drive, shown for comparison" width="1400" height="327" loading="lazy" decoding="async">
<figcaption>A comparison of the SAS and SATA connectors on 3.5-inch hard drives. A SAS backplane slot accepts either kind of drive, which is how SATA drives end up behind an expander. Photo: Gmelander, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:SASvsSATA_Connector.JPG">Wikimedia Commons</a>.</figcaption>
</figure>

## What breaks

- **One SAS-3 cable on a 24-bay expander.** The link carries 4,800 MB/s, while 24 drives at 285 MB/s can ask for 6,840 MB/s, about 1.4 times the link. Fix: cable every uplink the backplane offers that your HBA can drive, and check the backplane manual to see which connectors link to the HBA.
- **A SAS-2 HBA on a SAS-3 backplane.** A SAS-2 wide link tops out at 2,400 MB/s, so the backplane cannot deliver its SAS-3 bandwidth through that HBA. Techtellectual says to "Keep in mind the SAS generation for compatibility to get the best bandwidth" ([Techtellectual](https://techtellectual.com/sas-expander-vs-hba/)). ServeTheHome says it no longer recommends "SAS-1 based expander products or even older generation SAS products" ([ServeTheHome](https://www.servethehome.com/buyers-guides/top-hardware-components-for-truenas-freenas-nas-servers/top-picks-truenas-freenas-hbas/)). Fix: match the HBA generation to the backplane, and avoid SAS-1 expanders entirely.
- **Expecting the expander to add bandwidth.** The HBA-to-backplane link stays the same size, and jro.io says that bandwidth "is split out to all the attached drives" ([jro.io](https://jro.io/truenas/hardware/)). Fix: size the uplink against the drive count before you buy the chassis.
- **Seating the HBA in a narrow slot.** The 9300-8i can drive 9,600 MB/s across its two x4 links, but a PCIe 3.0 x8 slot caps it at 7.877 GB/s per direction. Broadcom's installation steps say to "Locate an empty x8 PCIe slot" ([Broadcom](https://docs.broadcom.com/doc/12354877)). Fix: use an empty x8 slot, and treat 7,877 MB/s as the ceiling for the whole card.
- **Benchmarking one drive and trusting the result.** Thomas-Krenn's write loss of 15.3% to 18.6% came from a single SSD, and the overhead changes with block size. Fix: benchmark the pool with the block sizes your workload uses, with the expander in place, before you move data onto it.

## What this means

Use an HBA on its own while your drive count fits its connectors. For eight drives or fewer, a 9300-8i in direct attach covers the whole question, and that layout is the simplest because it skips the overhead Thomas-Krenn measured. When the count forces an expander, pair a SAS-3 HBA in an x8 PCIe 3.0 slot with two uplink cables, which covers 24 drives at outer-track speed. A 24-drive backplane on one SAS-2 cable is oversubscribed by about 2.85 times at outer-track speed, so plan for the drives to queue whenever they all read at once.

## References

- https://docs.broadcom.com/doc/12354877
- https://en.wikipedia.org/wiki/Serial_Attached_SCSI
- https://en.wikipedia.org/wiki/PCI_Express
- https://www.thomas-krenn.com/en/wiki/SAS_expander_backplane_performance_effects
- https://www.thomas-krenn.com/en/wiki/Serial_Attached_SCSI_Standards_Overview
- https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html
- https://jro.io/truenas/hardware/
- https://techtellectual.com/sas-expander-vs-hba/
- https://www.servethehome.com/buyers-guides/top-hardware-components-for-truenas-freenas-nas-servers/top-picks-truenas-freenas-hbas/
- https://www.storagereview.com/review/seagate-exos-x20-20tb-enterprise-hdd-review
- https://www.supermicro.com/manuals/other/BPN-SAS3-216EL.pdf
- https://forums.truenas.com/t/guidance-on-hba-expanders-for-new-build/37841
