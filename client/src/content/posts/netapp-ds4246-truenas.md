
## The problem

The reader who searches "netapp ds4246 truenas" has a 24-bay NetApp shelf and wants its drives to appear as ordinary disks in a TrueNAS pool. The forum threads on this combination describe a short list of recurring problems: the wrong HBA, too few or the wrong cables, drives still formatted for NetApp controllers, and pools that misbehave on TrueNAS SCALE.

## The DS4246 and its IOM6 modules

The DS4246 takes 24 drives per shelf, and each shelf carries two IO modules for connectivity to its controllers ([FlackBox](https://www.flackbox.com/netapp-disk-shelf-models-cabling)). The module model matters more than the shelf label. [Digital Spaceport](https://digitalspaceport.com/netapp-ds4246-ds4243-jbod-high-capacity-storage/) says the DS4243 uses IOM3 modules, which are SAS-1 and rated at 3 Gbps per lane, while the DS4246 uses SAS-2 IOM6 modules rated at 6 Gbps per lane. [Park Place Technologies](https://www.parkplacetechnologies.com/blog/netapp-disk-shelves-101/) makes the same comparison, describing the DS4246's 6 Gbps connections as an upgrade over the DS4243's 3 Gbps. Digital Spaceport also reports that an IOM6 can be used in a DS4243 to raise it to SAS-2 speed, so check the module model on any used shelf, whatever the shelf is labeled.

Both shelves accept SAS and SATA drives, according to Digital Spaceport, and Park Place lists SSDs as well. Park Place gives the DS4246's raw maximum as 144 TB, which matches 24 drives of 6 TB each.

## Cabling: QSFP on the shelf, SFF-8088 on the HBA

The IOM modules use QSFP ports, while the LSI SAS 9200-8e uses external mini-SAS ports, so the link needs an adapter cable. [Digital Spaceport](https://digitalspaceport.com/netapp-ds4246-ds4243-jbod-high-capacity-storage/) puts it directly: "QSFP to 8088 cables are required to connect the HBA to the JBOD." Broadcom's [user guide for the LSI SAS 9200-8e](https://docs.broadcom.com/doc/12353324) lists two x4 external mini-SAS connectors (SFF-8088) and eight external 6 Gb/s SATA and SAS ports. For the connector family as a whole, see [SFP, SFP+, and QSFP](/blog/sfp-transceivers-explained).

Two shelves mean a layout decision. Chaining shelves through their IOM modules takes extra cable. Digital Spaceport says "additional QSFP to QSFP cables must be used" for the IOM3 and IOM6 controllers. A 2018 owner of two DS4246 shelves ran one cable from each shelf to a 9200-8e and reported 24 disks per cable, instead of 48 on one cable through an interconnect ([TrueNAS forum, 2018](https://www.truenas.com/community/threads/lsi-9200-8e-ds4246-ssd-speeds-and-ses-transfer-speeds.71234/)). A 2022 owner had only one QSFP-to-SFF-8088 cable and considered buying a second ([TrueNAS forum, 2022](https://www.truenas.com/community/threads/netapp-x2065a-r6-ds4246-and-truenas.104615/)). Count the cables your layout needs before you power anything on.

## Picking the HBA for TrueNAS

| Card | External connectors | Host interface | What the reports say |
|---|---|---|---|
| LSI SAS 9200-8e | Two x4 SFF-8088 | PCIe 2.0 x8 | Used by a 2018 owner on two DS4246 shelves. A 2022 owner moved to one from a NetApp card and reported a more reliable system |
| LSI SAS 9207-8e | Two external SAS ports | PCIe 3.0 x8 | Called "a popular choice" by Digital Spaceport. A May 2024 owner ran it on SCALE, and a second poster saw the same problem with another card model |

The [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) names Broadcom (formerly Avago, formerly LSI) SAS host bus adapters (HBAs) and tells you to "Flash using the latest IT or Target Mode firmware to disable the optional [RAID](/blog/raid-levels-comparison) functionality." A RAID controller reflashed into HBA mode is a different case, covered in [PERC H730 HBA Mode](/blog/perc-h730-hba-mode).

NetApp's own card is the cautionary case in these reports. A 2022 owner with two DS4246 shelves reported "Read SMART Self-Test Log Failed" errors on five or six drives across both shelves, seemingly at random. The owner later called the NetApp X2065A-R6 "a bust." On April 11, 2023, the same owner wrote that, after switching to an LSI SAS9200-8e, "the whole system was much more reliable afterwards."

## Formatting 520-byte drives to 512 before you build a pool

NetApp-branded drives can ship with 520-byte sectors, as a [2017 thread about NetApp Seagate ES.3 drives](https://www.truenas.com/community/threads/formatting-netapp-seagate-constellation-es-3-to-512-byte-blocks.55159/) shows. A [TrueNAS forum reply](https://forums.truenas.com/t/520-sector-size-compatibility/8373) gives the reason: "Some drives have 520 byte sectors in order to store an 8 byte checksum." One poster reported that the drives "show up in windows disk management but obviously cannot initialize the disks," and a [Level1Techs thread](https://forum.level1techs.com/t/how-to-reformat-520-byte-drives-to-512-bytes-usually/133021) quotes the Linux kernel on a 520-byte drive: "Unsupported sector size 520."

Start with a read-only check. Run sg_format with only a device name, and it reports the current block size without changing the disk:

```
sg_format /dev/sg2
```

A drive still at 520 bytes reports a line like this:

```
Block size=520 [0x208]
```

The conversion itself is destructive. The [sg_format manual](https://manpages.debian.org/unstable/sg3-utils/sg_format.8.en.html) says "These commands will destroy all the data held on the media." Unless you pass --quick, sg_format also pauses for 15 seconds and invites you to abort before it starts. Run the format inside tmux or screen, because the erase can run for hours.

```
sg_format -v --format --size=512 /dev/sg2
```

The Level1Techs author's direct 512-byte format failed, so the author formatted to 520 first and then reissued the 512-byte format immediately:

```
sg_format -v --format --size=520 /dev/sg2
sg_format -v --format --size=512 /dev/sg2
```

The second step matters. The author warns that "if you prod the drive or write even one byte to it, it will be locked for formatting once again." The same author says the erase can take "10 minutes to 10 hours." In a [2017 thread that continued into 2019](https://www.truenas.com/community/threads/formatting-netapp-seagate-constellation-es-3-to-512-byte-blocks.55159/), one poster reported about five and a half hours to format eleven disks.

SATA is less clear. The DS4246 accepts SATA drives, but one [TrueNAS reply](https://forums.truenas.com/t/520-sector-size-compatibility/8373) says "sg_format only works with sas/scsi disks, and these are sata." An earlier post in the same thread suggested trying a recent version of hdparm. Test one SATA drive before you convert a full set.

## Noise and power: two supplies and full bays

Digital Spaceport describes the shelf as one that "relies on the power supplies for cooling, rather than a wall of noisy fans." Two rules follow. The first is power: the shelf "requires at least two power supplies for redundancy," and running with fewer than two can lead to "horrible increased fan noise." The second is airflow: "If you leave huge gaps, it will cause higher fan speeds." Fill the bays or install blanks. For redundancy in general, see [Redundant Power Supplies](/blog/redundant-power-supplies).

Measure the shelf's draw at the outlet with your drives installed. A [reseller listing](https://www.orangehardwares.com/products/82562-21-netapp-580-watts-power-supply-with-fan-for-disk-shelves-ds4243-ds4246) sells a 580-watt power supply for the DS4243 and DS4246. That is the rating of each supply, not what a loaded shelf draws.

## Pools on SCALE with a DS4246: what owners reported in 2024

In a [May 2024 TrueNAS thread](https://forums.truenas.com/t/3-pools-on-netapp-ds4246-causing-issues/5355), an owner with a DS4246 on an LSI SAS9207-8e in a Dell R620 reported that the pools were suspended after moving to SCALE 23.10.2 and 24.04.1, while the web interface showed them online. The owner reported about 20 emails saying SMART data could not be read from any of the drives. Importing the same pools on CORE 13.3 BETA worked for that owner. A second poster said the problem appeared only after an upgrade to SCALE, and tried another card model with the same issue, so the HBA model alone does not appear to explain it.

The bug was filed as NAS-129294, and the original poster wrote that "there seems to be no fix in sight for this issue from the dev team." Another owner who upgraded the ZFS feature flags found the way back to CORE closed: "Big mistake to update the ZFS flags and not be able to get back to TrueNAS Core." For the pool side of that decision, see [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware).

## What breaks

**520-byte drives may refuse to initialize.** The 520-byte format adds 8 bytes per sector for a checksum. Windows may show the drive but refuse to initialize it, and Linux logs "Unsupported sector size 520." Fix: run the read-only check, then convert each drive to 512 bytes before you create the pool.

**sg_format returns "Parameter list length error" on some drives.** A 2017 thread about NetApp-branded Seagate Constellation ES.3 drives reports that the drives "produce an error no matter what options" were given to sg_format, and the owner could not complete a firmware update. Fix: try the two-step sequence above. A 2019 reply in the same thread describes a camcontrol route, and one owner reported that eleven disks were formatted to 512 with it. Test one drive first.

**Drives link at half speed after some reboots.** A 2018 owner reported that SATA drives sometimes "negotiate at 300MB/s rather than 600MB/s" on reboot, and a forum reply notes that "Many SAS enclosures that are rated for 600MB/s with SAS disks drop to 300MB/s with SATA disks." Fix: if you can choose, use SAS disks, which the TrueNAS hardware guide calls "the best choice." After a power cycle, check each drive's negotiated speed. A later poster in the same thread reported that every disk was identified after a shelf power cycle, with no SAS negotiation errors.

**The NetApp card produced SMART self-test errors.** The 2022 owner with the NetApp X2065A-R6 reported "Read SMART Self-Test Log Failed" on five or six drives, and one drive froze the shell during smartctl runs. Fix: use an LSI SAS HBA, which is what the owner moved to, and flash it to IT or Target Mode firmware as the TrueNAS hardware guide says.

**Pools were suspended after the move to SCALE in one 2024 report.** The owner saw SMART data that could not be read and suspended pools after moving to SCALE. The thread says the bug was filed as NAS-129294 and that no fix was in sight. Fix: as the owner reported, import the pools on CORE 13.3, and hold off on ZFS feature flag upgrades until you know which release you will keep.

## What this means

Buy a shelf with IOM6 modules, populate every bay or fill the gaps with blanks, and run two power supplies. Cable each shelf to its own QSFP-to-SFF-8088 cable on an LSI SAS HBA flashed to IT firmware, as the TrueNAS hardware guide describes. Convert each drive to 512-byte sectors one at a time, with the read-only check first, and test one SATA drive before you convert the rest. If you run SCALE, expect the SMART and pool problems in the 2024 report, and decide on the release before you touch the ZFS feature flags.

## References

- https://www.parkplacetechnologies.com/blog/netapp-disk-shelves-101/
- https://digitalspaceport.com/netapp-ds4246-ds4243-jbod-high-capacity-storage/
- https://www.flackbox.com/netapp-disk-shelf-models-cabling
- https://docs.broadcom.com/doc/12353324
- https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/
- https://www.truenas.com/community/threads/netapp-x2065a-r6-ds4246-and-truenas.104615/
- https://www.truenas.com/community/threads/lsi-9200-8e-ds4246-ssd-speeds-and-ses-transfer-speeds.71234/
- https://forums.truenas.com/t/3-pools-on-netapp-ds4246-causing-issues/5355
- https://forums.truenas.com/t/520-sector-size-compatibility/8373
- https://www.truenas.com/community/threads/formatting-netapp-seagate-constellation-es-3-to-512-byte-blocks.55159/
- https://forum.level1techs.com/t/how-to-reformat-520-byte-drives-to-512-bytes-usually/133021
- https://manpages.debian.org/unstable/sg3-utils/sg_format.8.en.html
- https://www.orangehardwares.com/products/82562-21-netapp-580-watts-power-supply-with-fan-for-disk-shelves-ds4243-ds4246
- https://commons.wikimedia.org/wiki/File:SFF_8088.jpg
- https://commons.wikimedia.org/wiki/File:Wikimedia_Foundation_Servers-8055_01.jpg
- https://commons.wikimedia.org/wiki/File:LSI_SAS9212-4i4e_front.jpg
