
## The problem

Someone running a Dell PowerEdge server who has to choose between a PERC H330 and an HBA330 usually wants ZFS or TrueNAS to see every disk with no [RAID](/blog/raid-levels-comparison) layer in the way. The two cards use the same LSI 3008 chipset, so the choice turns on firmware, queue depth and which PowerEdge model takes which card.

## The H330 is a RAID card, and the HBA330 is not

Dell's [PERC 9 card specifications](https://www.dell.com/support/manuals/en-us/poweredge-rc-h330/perc9ugpublication/perc-card-specifications?guid=guid-ff4e55fb-921b-4445-9ee3-768d80807f2a&lang=en-us) list RAID levels 0, 1, 5, 10 and 50 for the H330 and describe it as a "Dell Adapter SAS RAID-on-Chip, 8-port with LSI 3008 chipset." Dell's [HBA card specifications](https://www.dell.com/support/manuals/en-us/dell-sas-hba-12gbps/dell_hba_ug_publication/dell-hba-card-specifications?guid=guid-06cb2c46-07fb-4f69-b558-fa0a275d1d51&lang=en-us) give the HBA330 the same LSI 3008 chipset, describe its processor as a "Dell Adapter SAS I/O controller," and mark "Non-RAID or pass through mode" as "Yes." A Dell community moderator put the difference in one line on August 12, 2020: "HBA330 Controller, 12Gbps Adapter does NOT do RAID. H330 can." ([Dell Community thread, August 2020](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/perc-h330-vs-hba330-controller-vs-no-raid-for-small-medical-office-server/647f8b37f4ccf8a8deb44710))

The table compares the attributes that matter for a storage build.

| Attribute | PERC H330 | HBA330 |
|---|---|---|
| Chipset, as Dell lists it | LSI 3008, RAID-on-Chip | LSI 3008, I/O controller |
| RAID levels | 0, 1, 5, 10, 50 | None; Dell staff say it does not do RAID |
| Cache | None | None, per Dell staff |
| Queue depth | 895 | 9548 |
| Out-of-box firmware | RAID, with an HBA mode switch | Dell 12Gbps IT firmware, per an owner |

The H330 is also the only PERC 9 card without RAID 6. [Wikipedia's PERC article](https://en.wikipedia.org/wiki/Dell_PERC) says "All PERC 9 series cards support RAID 6 except for the PERC H330," and it notes that the H330 has "no battery backup unit (BBU)." Dell calls the H330 chip a RAID-on-Chip, while a [TrueNAS forum post](https://www.truenas.com/community/threads/will-a-dell-r530-with-a-perc-hba330-work-with-zfs.48532/page-2) says the same LSI 3008 is "NOT a raid chip."

## Pass-through and RAID mode change what the disks see

Dell documents a mode switch for the PERC 9 family: "The controller is switched to the HBA mode. You must reboot the system for the change to be effected." ([Dell PERC 9 user guide](https://www.dell.com/support/manuals/en-us/poweredge-rc-h730/perc9ugpublication/switching-the-controller-to-hba-mode?guid=guid-1fcc87e1-d534-451a-9947-56f1175886c5&lang=en-us)) The switch sits under Controller Management, then Advanced Controller Management, then Switch to HBA mode, and Dell says to review the prerequisites before you start. One TrueNAS forum poster, who has an H330 in HBA mode, quoted another owner who reported that the drives appeared as "daX" devices in FreeNAS ([TrueNAS forum thread](https://www.truenas.com/community/threads/will-a-dell-r530-with-a-perc-hba330-work-with-zfs.48532/page-2)).

Owners also say the switch is not the same as an HBA330. On August 13, 2024, a poster in a [Dell Community thread](https://www.dell.com/community/en/conversations/poweredge-os-forum/r730-h330-best-choice-for-proxmox-zfs/66b4fad340d71075c4182926) wrote that HBA mode on an H730 or H330 "will work but its not the same as say HBA330 or the flashing the h730/330 into IT mode." The same post says that "The raid controller will still boot the raid bios drivers which does slow the boot."

Dell staff drew the cache line in the same thread. They wrote that an H730P in HBA mode is "simply a passthrough" and that the H730P "also has cache memory, where the HBA330 doesn't." For the mode switch on the H730 family in more detail, see [PERC H730 HBA mode](/blog/perc-h730-hba-mode).

## Queue depth: 895 against 9548

Dell's spec tables give the two cards very different queue depths. The H330 table gives a queue depth of 895, and the HBA card table gives 9548. A [reseller guide](https://pcserverandparts.com/news/raid-levels-controllers-guide-2026/) repeats both figures. Dell's tables do not say how much throughput the difference buys, so read the gap as a spec, not a benchmark.

Owner reports put a number on it, though, and they come from a single forum thread. One poster said disks were "reported with 150MB/s transfer" on an H330 in HBA mode, and that after a crossflash to HBA330 firmware they were "reported with 600MB/s transfers" ([TrueNAS forum thread](https://www.truenas.com/community/threads/will-a-dell-r530-with-a-perc-hba330-work-with-zfs.48532/page-2)). Another poster in that thread blamed Dell's firmware, saying that "the Dell rom specifically limits transfer speeds through a ridiculously low" queue depth. These are owner reports from their own systems, not benchmark results.

## ZFS and TrueNAS: use the HBA330

The [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) sets the position plainly: "ZFS and TrueNAS provide a built-in RAID that protects your data better than any hardware RAID card." For a card with a pass-through mode, it says to "do not use their RAID facility if your hardware RAID card supports HBA mode, also known as passthrough or JBOD mode." It also lists risks: some cards can "Mask disk serial number and S.M.A.R.T. health information" and can "Perform slower than their HBA equivalents."

Disk identity is the other half of the problem. In an [OpenZFS discussion](https://github.com/openzfs/zfs/discussions/14458), a contributor writes that "since some RAIDs do not pass through original disk identification, and TrueNAS requires unique disk serial numbers." The same contributor says an HBA "does not do anything other than delivering commands and data to the disks," and calls that setup "the preferred configuration for ZFS."

For a ZFS or TrueNAS pool on a PowerEdge, that points to the HBA330. The H330 can run in HBA mode, as the owner reports above show, but Dell's own tables describe the HBA330 as the non-RAID card, and it is the one to build on. For how the pool itself should be laid out, see [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware).

## Which PowerEdge models take each card

Dell's [R740 storage controller specifications](https://www.dell.com/support/manuals/en-us/poweredge-r740/per740_techspecs_pub/storage-controller-specifications?guid=guid-cab093cc-70ba-4037-a013-e410965f75a2&lang=en-us) list "PowerEdge RAID Controller (PERC) H330, PERC H730P, PERC H740P, HBA330, S140," among the internal controllers. The [R740xd specifications](https://www.dell.com/support/manuals/en-us/poweredge-r740xd/per740xd_techspecs_pub/storage-controller-specifications?guid=guid-cab093cc-70ba-4037-a013-e410965f75a2&lang=en-us) list the HBA330 with the H730P and H740P but leave the H330 off. A parts list that works on an R740 can therefore fail on an R740xd. In August 2024, Dell community staff wrote that "both the R730 and R740 support both the H330 and the HBA330."

The R740 specifications also set a mixing rule: "NOTE: H750/H350 and HBA350i cards cannot be mixed with H730P, H740P, H330, and HBA330 cards." For drive counts, Dell's [list of PERC types](https://www.dell.com/support/kbdoc/en-us/000131648/list-of-poweredge-raid-controller-perc-types-for-dell-emc-systems) gives the H330 adapter and mini mono "16 RAID, 32 Non-RAID" drives, and lists the mini blade at 8.

## Can an H330 be crossflashed into an HBA330?

Owners do it. A [GitHub crossflash guide](https://github.com/TubalQ/h330-hba330-it-crossflash) aims at "clean ZFS / software-RAID pass-through," and it warns that a generic LSI IT image leaves iDRAC seeing a third-party card, "and the fan floor stays." The same guide says that flashing Dell's own hba330.fw on a blank SBR gives the card Dell's identity: "That is what produces the Dell identity 1028:1f45."

The RAID configuration has to go first. According to a [crossflash article from nasdisks](https://www.nasdisks.com/uk/articles/crossflash-lsi-hba-it-mode/), "MegaRAID-based cards (M1015, H330) won't let the flasher touch them until you clear the onboard config with megarec." The GitHub guide adds that "the controller change re-enumerates them," so disks should be identified by serial rather than by their sdX names.

A poster in the TrueNAS thread warned that flashing an H330 to HBA330 firmware could break a guarantee, so check your warranty terms before you flash. For fan tuning after a change to the card, see [iDRAC Fan Speed Offset](/blog/idrac-fan-speed-offset).

## What breaks

**The R740xd specifications do not list an H330.** Dell's R740xd specifications name the HBA330 and omit the H330, while the R740 specifications name both, so a plan built on one chassis can fail on the other. Fix: On an R740xd, plan around an HBA330, and check your exact chassis in Dell's storage controller specifications before you order.

**RAID mode can hide the disk identity ZFS needs.** Some RAID cards do not pass through original disk identification, and TrueNAS requires unique serial numbers. The TrueNAS guide adds that some cards mask serial numbers and S.M.A.R.T. health data. Fix: Put the H330 in HBA mode or use an HBA330, then confirm that every disk reports its own serial before you create the pool.

**RAID 5 and RAID 50 on an H330 run without cache.** Dell's table says "H330 does not support caching, which affects performance in RAID 5 and RAID 50 arrays." Fix: If the array needs cache, use an H730P, which a Dell staff member describes as having "the cache memory," or leave redundancy to ZFS on an HBA.

**The H330 cannot build a RAID 6 array.** The [Wikipedia article on PERC](https://en.wikipedia.org/wiki/Dell_PERC) notes that "All PERC 9 series cards support RAID 6 except for the PERC H330." Fix: If you need hardware RAID 6, choose a different PERC 9 card. If you need data redundancy, use ZFS on an HBA and keep the H330 for a mirrored boot pair, since RAID 1 is on its list of levels.

**A crossflash can change how iDRAC treats the card.** A generic LSI IT image leaves iDRAC treating the card as a third-party part, and the fan floor stays where it was. Fix: If you flash, use Dell's hba330.fw on a blank SBR, clear the RAID configuration with megarec first, and identify disks by serial rather than by sdX name.

## What this means

For ZFS or TrueNAS on a PowerEdge, the HBA330 is the card the vendor tables and the TrueNAS guide point to. It is non-RAID, owners report that it ships with IT firmware, and it leaves no RAID features in the disk path. The H330 suits a RAID 1 boot mirror, since Dell lists RAID 1 for it, but it is the wrong card for a data pool. If you already own an H330 and need TrueNAS running now, Dell's HBA mode switch is the documented route. One owner reports that an H330 crossflashed to the 12Gbps IT firmware "works exactly like the HBA330 firmware," but that path carries the iDRAC and warranty trade-offs covered above.

## References

- https://www.dell.com/support/manuals/en-us/poweredge-rc-h330/perc9ugpublication/perc-card-specifications?guid=guid-ff4e55fb-921b-4445-9ee3-768d80807f2a&lang=en-us
- https://www.dell.com/support/manuals/en-us/dell-sas-hba-12gbps/dell_hba_ug_publication/dell-hba-card-specifications?guid=guid-06cb2c46-07fb-4f69-b558-fa0a275d1d51&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-rc-h730/perc9ugpublication/switching-the-controller-to-hba-mode?guid=guid-1fcc87e1-d534-451a-9947-56f1175886c5&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r740/per740_techspecs_pub/storage-controller-specifications?guid=guid-cab093cc-70ba-4037-a013-e410965f75a2&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r740xd/per740xd_techspecs_pub/storage-controller-specifications?guid=guid-cab093cc-70ba-4037-a013-e410965f75a2&lang=en-us
- https://www.dell.com/support/kbdoc/en-us/000131648/list-of-poweredge-raid-controller-perc-types-for-dell-emc-systems
- https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/perc-h330-vs-hba330-controller-vs-no-raid-for-small-medical-office-server/647f8b37f4ccf8a8deb44710
- https://www.dell.com/community/en/conversations/poweredge-os-forum/r730-h330-best-choice-for-proxmox-zfs/66b4fad340d71075c4182926
- https://en.wikipedia.org/wiki/Dell_PERC
- https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/
- https://www.truenas.com/community/threads/will-a-dell-r530-with-a-perc-hba330-work-with-zfs.48532/page-2
- https://github.com/openzfs/zfs/discussions/14458
- https://github.com/TubalQ/h330-hba330-it-crossflash
- https://www.nasdisks.com/uk/articles/crossflash-lsi-hba-it-mode/
- https://pcserverandparts.com/news/raid-levels-controllers-guide-2026/
