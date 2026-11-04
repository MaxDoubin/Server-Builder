
## The short answer

The Linux zoned flag cannot report drive-managed SMR (DM-SMR), so the dependable test is the exact model number checked against the vendor's own list. These disks pass as ordinary drives: the kernel documents that [drive-managed devices "will be treated as regular block devices and zoned will report 'none'"](https://www.kernel.org/doc/Documentation/ABI/stable/sysfs-block). Western Digital's [SKU list](https://blog.westerndigital.com/wp-content/uploads/2020/07/WD_SMR_SKUs_vDS.pdf) names WD20EFAX, WD30EFAX, WD40EFAX and WD60EFAX, the 2 to 6 TB WD Red, as SMR. Seagate [confirmed SMR](https://blocksandfiles.com/2020/04/15/seagate-2-4-and-8tb-barracuda-and-desktop-hdd-smr/) in the ST2000DM008, ST4000DM004 and ST8000DM004 BarraCuda, and Toshiba [listed the 4 and 6 TB P300 and the L200](https://www.toshiba-storage.com/about/press-center/use-of-shingled-magnetic-recording-smr-technology-in-toshiba-consumer-hard-drives/). WD Red Plus, WD Red Pro, Seagate IronWolf and Toshiba N300 are listed as CMR. `smartctl` labels many SMR models in its Model Family line, but only for drives its database knows. For ZFS, OpenZFS calls DM-SMR drives ["not recommended for ZFS pools"](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html), a ServeTheHome RAIDZ resilver took [nearly 230 hours on a WD40EFAX against under 17 hours on CMR drives](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/2/), and iXsystems reported [IDNF errors from the WD40EFAX on firmware 82.00A82](https://www.truenas.com/docs/hardware/notices/wdsmr/).

## What is the difference between CMR, drive-managed SMR and host-managed SMR?

CMR leaves gaps between tracks. SMR removes them: per the [Zoned Storage project](https://zonedstorage.io/docs/introduction/smr), the write head is wider than one track, so "the next track partially overwrites the previous one," which raises areal density and per-drive capacity. The cost is that "all data streams must be organized and written sequentially to the media." Overlapping tracks are grouped into zones, and changing one sector means rewriting its zone, because "direct modification is not permitted." Reads stay random-access, since SMR disks keep "true random-read capability."

| Variant | Who enforces sequential writes | What Linux reports in `queue/zoned` | Standard |
|---|---|---|---|
| CMR | Nobody, there is no constraint | `none` | None |
| Drive-managed | Drive firmware | `none`, same as a regular disk | Transparent to the host: "No industry standard exists" for the model, per the [Zoned Storage project](https://zonedstorage.io/docs/introduction/smr) |
| Host-aware | Host preferably, drive handles the rest | `host-aware` | ZBC (SCSI), ZAC (ATA) |
| Host-managed | Host, required | `host-managed` | ZBC (SCSI), ZAC (ATA) |

The [Zoned Storage guide](https://zonedstorage.io/docs/getting-started/smr-disk) defines `none` as "Regular disk or drive managed ZBC/ZAC disk."

NAS-branded SMR is drive-managed. WD's [April 20, 2020 statement](https://blog.westerndigital.com/wd-red-nas-drives/) says SMR is implemented as drive-managed SMR "on the device itself" in its 2 to 6 TB WD Red drives and as host-managed SMR in high-capacity data center drives. Host-managed disks need software that follows zone rules: Seagate's [CMR and SMR list](https://www.seagate.com/products/cmr-smr-list/) says they require "control over zone management, write ordering, and filesystem selection," and the [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) says "ZFS cannot manage the zone semantics these drives require, so they do not work with TrueNAS."

### What a drive-managed disk does behind the interface

The firmware takes random writes into a persistent cache and merges them into the shingled bands later. A 2015 [USENIX FAST paper, Skylight](https://www.usenix.org/system/files/conference/fast15/fast15-paper-aghayev.pdf), reverse engineered Seagate's 5 TB and 8 TB drive-managed disks and found a persistent disk cache of 20 GiB on a 5 TB model and 25 GiB on an 8 TB model, "with high random write speed until the cache is full." The bands were 15 to 40 MiB, and aggressive cleaning during idle time took 0.6 to 1.6 seconds per modified band. These are 2015 Seagate figures; the WD documents cited here give none for the EFAX drives. iXsystems says WD's drives ["use an indirect Logical Block Addressing model, which is similar to SSDs"](https://www.truenas.com/docs/hardware/notices/wdsmr/) and do background garbage collection that "does reduce their sustained random write performance."

## Which WD, Seagate and Toshiba models do the vendors list as SMR?

### Western Digital

WD's [SMR SKU list](https://blog.westerndigital.com/wp-content/uploads/2020/07/WD_SMR_SKUs_vDS.pdf), updated July 6, 2020, covers client internal drives and ends with "All other capacity points use CMR recording technology."

| Family | SMR model numbers |
|---|---|
| WD Red 3.5 in | WD20EFAX (2 TB), WD30EFAX (3 TB), WD40EFAX (4 TB), WD60EFAX (6 TB) |
| WD Blue 3.5 in | WD20EZAZ (2 TB), WD60EZAZ (6 TB) |
| WD Blue 2.5 in | WD10SPZX (1 TB), WD20SPZX (2 TB) |
| WD Black 2.5 in | WD5000LPSX (500 GB), WD10SPSX (1 TB) |

WD's September 2023 [WD Red brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-hdd/product-brief-western-digital-wd-red-hdd.pdf) still lists the same four EFAX models, each with 256 MB of cache and the footnote "Implementation of SMR for these products is device-managed SMR." The letters are not enough on their own: [TrueNAS](https://www.truenas.com/docs/hardware/notices/wdsmr/) notes that the "8TB and larger drives with the 'EFAX' code use CMR technology," and the same code marks SMR at 2 to 6 TB. WD's later documents add models to that list. The [WD Blue 3.5 in brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-blue-hdd/product-brief-western-digital-wd-blue-pc-hdd.pdf), March 2025, marks the WD40EZAZ, WD30EZAZ and WD20EZBX as SMR alongside the WD60EZAZ and WD20EZAZ. The July 2020 list names only the 2 and 6 TB Blue.

### Seagate

In April 2020 [Blocks and Files](https://blocksandfiles.com/2020/04/15/seagate-2-4-and-8tb-barracuda-and-desktop-hdd-smr/) reported that a Seagate spokesperson confirmed SMR in these four products: "I confirm all four products listed use SMR technology."

| Product | Model | Capacity |
|---|---|---|
| BarraCuda | ST2000DM008 | 2 TB |
| BarraCuda | ST4000DM004 | 4 TB |
| BarraCuda | ST8000DM004 | 8 TB |
| Desktop HDD | ST5000DM000 | 5 TB |

Seagate's [current list](https://www.seagate.com/products/cmr-smr-list/) is by capacity, not model number. It shows SMR for the 4 and 8 TB 3.5 in BarraCuda, the 2 and 4 TB 2.5 in BarraCuda, the 1 and 2 TB 2.5 in FireCuda and the 8 TB Archive, and CMR for the 3.5 in BarraCuda at 12 to 24 TB. It has no 2 TB 3.5 in BarraCuda, so for the ST2000DM008 rely on the 2020 confirmation and the smartmontools database ("Seagate BarraCuda 3.5 (SMR)").

### Toshiba

Toshiba's [statement dated April 30, 2020](https://www.toshiba-storage.com/about/press-center/use-of-shingled-magnetic-recording-smr-technology-in-toshiba-consumer-hard-drives/) lists these SMR parts and says the N300 "does not use SMR."

| Family | Model numbers |
|---|---|
| P300 | HDWD260UZSVA (6 TB), HDWD240UZSVA (4 TB) |
| L200 | HDWL120UZSVA, HDWL120EZSTA, HDWL120XZSTA (2 TB); HDWL110UZSVA, HDWL110EZSTA, HDWL110XZSTA (1 TB) |

The [smartmontools database](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/drivedb.h) tags more Toshiba models than that page does, including the S300 models HDWT720, HDWT740, HDWT840 and HDWT860.

## How do you check a drive you already own?

Read the exact model, look it up on the vendor's list, and use the Linux flags only as hints. A drive behind a [RAID](/blog/raid-levels-comparison) controller may report the controller's name instead of its own, so read the label, switch to HBA mode as in the [PERC H730 HBA mode](/blog/perc-h730-hba-mode) article, or query through the controller with [`smartctl -d megaraid,N`](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html).

```bash
sudo smartctl -i /dev/sda
lsblk -d -o NAME,MODEL,SERIAL,ROTA,ZONED
cat /sys/block/sda/queue/zoned
```

### Read the model and the Model Family line

The [smartctl manual](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html) says `-i` prints the model number, serial number and firmware version, indicates whether the drive is in the smartmontools database, and if so "the drive model family may also be printed." The [database](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/drivedb.h) carries entries named "Western Digital Red (SMR)" for `WDC WD[2346]0EFAX-.*`, "Western Digital Red (CMR)" for the EFRX and EFPX series, "Seagate BarraCuda 3.5 (SMR)", "Toshiba P300 (SMR)" and "Toshiba L200 (SMR)." A trimmed `smartctl` printout [posted by a TrueNAS SCALE 24.10.2 owner](https://forums.truenas.com/t/cant-trim-pool-of-smr-drives/34557) in February 2025 shows what to read:

```
Model Family:     Seagate BarraCuda 3.5 (SMR)
Device Model:     ST2000DM008-2FR102
Rotation Rate:    7200 rpm
Form Factor:      3.5 inches
TRIM Command:     Available
Device is:        In smartctl database 7.3/5660
```

Old databases miss newer models. The manual says to run `update-smart-drivedb`, and `-P showall` takes a model and firmware to list matching entries. The strings below are copied from the "Western Digital Red (SMR)" entry's own "tested with" comment.

```bash
sudo update-smart-drivedb
sudo smartctl -P showall 'WDC WD60EFAX-68SHWN0' '82.00A82'
```

The label comes from matching the model string against that database (the manual's entry format is a model regular expression), not from probing the drive, so a missing "(SMR)" tag is not a clean bill of health. Treat the vendor list as the authority and the tag as a second opinion.

### What the zoned flag cannot tell you

`queue/zoned` and `lsblk`'s ZONED column come from the same kernel attribute (the [lsblk source](https://raw.githubusercontent.com/util-linux/util-linux/stable/v2.40/misc-utils/lsblk.c) reads `queue/zoned`), which reports `none` for a drive-managed disk. The `smartctl` source also prints a "Zoned Device" line from ATA identify data, with "Host Aware Zones" and "Device managed zones" as the possible values, but a code comment says the field was "added in ACS-4, obsoleted in ACS-5" (see [ataprint.cpp](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/ataprint.cpp)). The information section in the forum post above has no such line, and the drive is SMR. A flag that says `none` or prints nothing clears nothing.

### Why TRIM is a hint and not a test

The same source prints a TRIM line for a spinning drive only when it reports support, with the comment "HDD: if supported (SMR)." The pattern is unreliable: the [database's own comment](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/drivedb.h) marks a tested ST4000DM004-2CV104 as "TRIM: no." Advertising is not the same as working. In the forum post above, `zpool trim` answered "cannot trim: no devices in pool support trim operations" while `smartctl` said TRIM was available, and `lsblk -D` showed 0B discard granularity. A reply said "smartctl says what the vendor tells it to." Yet the same drive showed 4K granularity after the poster moved it to a Fedora 41 machine, and a reply allowed that TRIM might be blocked at the libata driver level, so a zero reflects the operating system's path as much as the drive.

### Do not infer it from cache size

Cache size and RPM class fail as tells. These three 4 TB WD NAS drives are all 5400 RPM class:

| Model | Recording | Cache | Source |
|---|---|---|---|
| WD40EFRX | CMR | 64 MB | [WD Red spec sheet, 2017](https://products.wdc.com/library/SpecSheet/ENG/2879-800002.pdf); CMR per [TrueNAS](https://www.truenas.com/docs/hardware/notices/wdsmr/) |
| WD40EFAX | DM-SMR | 256 MB | [WD Red brief, September 2023](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-hdd/product-brief-western-digital-wd-red-hdd.pdf) |
| WD40EFPX | CMR | 256 MB | [WD Red Plus brief, March 2025](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-plus-hdd/product-brief-western-digital-wd-red-plus-hdd.pdf) |

The SMR drive and the newest CMR drive share a cache size, and ServeTheHome noted that [the SMR drive "has a much larger cache than the CMR version, 256MB vs 64MB"](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/2/) against the WD40EFRX.

### Measure it on a spare drive

A write test settles the cases a list cannot, but it destroys data on its target, so run it only on an empty, unmounted drive. [fio](https://fio.readthedocs.io/en/latest/fio_doc.html) aborts write jobs aimed at what looks like a mounted device unless told otherwise. `write_bw_log` with `log_avg_msec` records one averaged bandwidth figure per interval, so the log shows when throughput steps down.

```bash
sudo fio --name=smr-probe --filename=/dev/sdX --ioengine=libaio --direct=1 \
  --rw=randwrite --bs=4k --iodepth=16 --time_based --runtime=7200 \
  --write_bw_log=smr-probe --log_avg_msec=10000
```

Skylight describes high random write speed "until the cache is full," and says the effective cache size "is a function of write size and queue depth," so the plateau length varies. A long plateau followed by a step down matches that description; a flat log proves little if the run ended before the cache filled. The [fio benchmarking article](/blog/storage-benchmarking-fio) covers sustained runs, and [reading SMART data](/blog/smart-data-drive-failure) covers what else to check on a used drive.

## Why do DM-SMR drives stall during a ZFS resilver or RAID rebuild?

A resilver is a long run of writes with no idle time, and idle time is when a DM-SMR drive empties its cache. WD's [June 23, 2020 post](https://blog.westerndigital.com/wd-red-nas-drives/) says DMSMR drives "prefer idle time to perform background operations, without which the drive may take longer to complete a command," and that the "increased amount of sustained random writes during ZFS resilvering (similar to a rebuild) causes a lack of idle time for DMSMR drives to execute internal data management tasks." Once the persistent cache fills, the drive must move data into bands to accept new writes, a cleaning step Skylight timed at 0.6 to 1.6 seconds per modified band on the 2015 drives. Blocks and Files describes the effect as ["a pause of potentially many seconds"](https://blocksandfiles.com/2020/04/15/seagate-2-4-and-8tb-barracuda-and-desktop-hdd-smr/) when the cache is flushed.

### What the tests measured

ServeTheHome's May 2020 [RAIDZ test](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/) used a four-drive pool of Toshiba CMR disks on FreeNAS 11.3-U2, filled to around 60 percent. Each test drive replaced one member and the resilver was timed, with extra load: 1 MB files copied to the array over the network, and 2 TB read from it and copied to another device. Each drive had been prepped with 3 TB written and 1 TB deleted, run through the review's write benchmarks, and unplugged right afterward. On the [second page of the review](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/2/), scrubs were disabled and "resilvering priority was completely disabled." The result: "all three CMR drives comfortably completed the resilver in under 17 hours, the SMR drive took nearly 230 hours to perform an identical task." A second WD40EFAX gave the same result, and the review called it a "9 day and almost 14-hour rebuild." The resilver did finish without errors. The same review found the drive "seemed to recover relatively quickly if given even brief periods of inactivity," and a reader comment objected that the test drives had been heavily written and unplugged just before the run, unlike a new drive swapped in after a failure. One test bed is evidence, not a law, but it matches WD's explanation.

On non-ZFS RAID, WD [says](https://blog.westerndigital.com/wd-red-nas-drives/) that on "a typical Synology or QNAP (non-ZFS) platform" its DMSMR drives "perform as well as CMR drives or show slightly longer RAID rebuild times," while acknowledging that "in some cases" DMSMR "can result in slower rebuild times." The [rebuild risk math](/blog/raid-rebuild-risk-math) article explains why a longer rebuild window matters even when the rebuild succeeds.

### How it fails

iXsystems [reported](https://www.truenas.com/docs/hardware/notices/wdsmr/), in a notice that calls its testing unfinished, that the 4 TB WD40EFAX with firmware 82.00A82 "can cause it to enter a faulty state under heavy write loads, including resilvering," and expected other WD Red DM-SMR models on the same firmware to behave the same. In that state the drive "returns IDNF errors, becomes unusable, and is treated as a drive failure by ZFS," and the notice warns that data within a vdev or pool can be lost if multiple drives fail. The notice calls the failure rare: about 100 FreeNAS Mini systems shipped with 2 and 6 TB DM-SMR drives, and one issue was reported. It states no cause. Its advice is to erase a DM-SMR drive before adding it to a pool, keep backups, and contact iXsystems if IDNF errors appear.

OpenZFS says DM-SMR can trigger ["severe write-amplification stalls during RAIDZ/mirror resilver, scrub, and zfs send/receive workloads"](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html). The TrueNAS guide says DM-SMR and host-aware drives "function poorly with TrueNAS, and the TrueNAS team does not recommend them," with "longer, less reliable resilver operations." A related option is `zpool replace -s`, which the [OpenZFS manual](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-replace.8.html) says reconstructs the new device "sequentially to restore redundancy as quickly as possible," skips checksum verification until a scrub that starts afterward, and "is not supported for raidz configurations." None of the sources above tested it on an SMR drive, so it is no proven fix. Pool design is covered in [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware).

## Are WD Red Plus, Red Pro, IronWolf and N300 all CMR?

Yes, per each vendor's published documents, with the model suffix still worth reading.

| Line | What the vendor says | Source |
|---|---|---|
| WD Red Plus | CMR for every model in the March 2025 brief: WD20EFPX, WD40EFPX, WD60EFPX, WD80EFPX and larger up to 12 TB; rated 180 TB/year | [WD Red Plus brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-plus-hdd/product-brief-western-digital-wd-red-plus-hdd.pdf) |
| WD Red Pro | "CMR 2TB to 18TB" in June 2020 | [WD blog](https://blog.westerndigital.com/wd-red-nas-drives/) |
| Seagate IronWolf | CMR at 2 to 16 TB; the SMR column reads N/A | [Seagate list](https://www.seagate.com/products/cmr-smr-list/) |
| Seagate IronWolf Pro | CMR at 2 to 24 TB, plus HAMR CMR at 28 to 32 TB | [Seagate list](https://www.seagate.com/products/cmr-smr-list/) |
| Toshiba N300 | Recording Technology listed as CMR, buffer 256 MiB to 1 GiB, 180 TB/year rated workload | [N300 data sheet](https://toshiba.semicon-storage.com/content/dam/toshiba-ss-v3/master/en/storage/product/internal-specialty/HDD-NSENE.pdf) |

WD introduced Red Plus in 2020 as ["the new name for conventional magnetic recording (CMR)-based NAS drives"](https://blog.westerndigital.com/wd-red-nas-drives/) for write-intensive work "such as ZFS," and the [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) calls Red Plus "non-SMR." Seagate [stated in 2020](https://blocksandfiles.com/2020/04/15/seagate-2-4-and-8tb-barracuda-and-desktop-hdd-smr/) that it does not use SMR "in any IronWolf or IronWolf Pro drives," and that it does not market BarraCuda "as being suitable for NAS applications."

For WD Red, the suffix tells the generation. TrueNAS says the previous generation, the EFRX drives, [uses CMR](https://www.truenas.com/docs/hardware/notices/wdsmr/), the EFPX and related Red Plus codes are CMR in WD's brief, and EFAX is SMR only at 2 to 6 TB. A listing that omits the suffix or the recording technology is a reason to ask the seller.

## Is SMR ever fine in a homelab?

Yes, for single disks holding large files that are written once and read occasionally. Seagate's list says SMR "is best suited for workloads that are sequential or easily sequentialized," and names large media repositories, backup tiers, compliance archives and object storage. ServeTheHome's verdict on the WD40EFAX was that [for single drive installations it "will likely function without issue,"](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/2/) while its RAIDZ results, in the reviewer's words, "overshadow the otherwise decent performance of the drive."

| Use | DM-SMR fit | Basis |
|---|---|---|
| Single-disk archive of large files | Reasonable | Seagate's sequential workload list; ServeTheHome's single-drive verdict |
| Mirror or RAIDZ pool that must resilver | Avoid | [OpenZFS](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) and [TrueNAS](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) say not recommended |
| ZFS send/receive target | Not exempt | OpenZFS names send/receive as an affected workload |
| VM disks and zvols with random overwrites | Avoid | Skylight: random write speed holds only until the persistent cache is full |
| Non-ZFS RAID on a Synology or QNAP | Vendor-qualified | WD reports equal or "slightly longer" rebuilds, with caveats |
| Behind a hardware RAID card | Check the card | The [PERC H755 article](/blog/perc-h755-hba-mode) quotes Dell: the card "does not support" SMR |

One [TrueNAS forum reply](https://forums.truenas.com/t/cant-trim-pool-of-smr-drives/34557) argued that sequentially writing 1 TB to a mirror of 2 TB drives, with no overwrites in place, is unlikely to hit the worst behavior. It is a forum opinion, not vendor guidance, and the poster said it was not "a blanket endorsement of SMR." For a redundant pool, buy CMR drives and keep SMR out of anything that must resilver; the full build is in [TrueNAS on a Dell R730](/blog/truenas-on-dell-r730).

## What breaks

**A resilver estimate climbs from hours to days.** WD ties the slowdown to a lack of idle time for background work, and ServeTheHome measured nearly 230 hours under added load. Fix: stop other writes to the pool, keep backups current, and plan to replace SMR members with CMR drives.

**The replacement faults with IDNF errors.** iXsystems saw this on the WD40EFAX at firmware 82.00A82 under heavy writes, and ZFS treats the drive as failed. Fix: do not resilver a second SMR member at the same time, since multiple failures in a vdev lose data, and contact the vendor.

**`smartctl` says TRIM is available and `zpool trim` refuses.** The operating system may not be sending TRIM to the drive. Fix: check `lsblk -D`; a zero discard granularity means that kernel is not offering TRIM, whatever `smartctl` lists.

**Two drives share a prefix and differ in recording.** EFAX covers SMR at 2 to 6 TB and CMR at 8 TB and up, and WD's 2020 list omits the WD40EZAZ and WD30EZAZ that its March 2025 Blue brief marks SMR. Fix: compare the full model against the newest vendor document and the database, and ask the vendor when they disagree.

## Sources

- [Linux kernel: sysfs-block ABI, queue/zoned](https://www.kernel.org/doc/Documentation/ABI/stable/sysfs-block)
- [Zoned Storage: Shingled Magnetic Recording Hard Disks](https://zonedstorage.io/docs/introduction/smr)
- [Zoned Storage: Getting Started with SMR Hard Disks](https://zonedstorage.io/docs/getting-started/smr-disk)
- [USENIX FAST '15: Skylight, A Window on Shingled Disk Operation](https://www.usenix.org/system/files/conference/fast15/fast15-paper-aghayev.pdf)
- [Western Digital: On WD Red NAS Drives](https://blog.westerndigital.com/wd-red-nas-drives/)
- [Western Digital: SMR Drives by Capacity, SKU list updated 7/06/2020](https://blog.westerndigital.com/wp-content/uploads/2020/07/WD_SMR_SKUs_vDS.pdf)
- [Western Digital: WD Red Product Brief, September 2023](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-hdd/product-brief-western-digital-wd-red-hdd.pdf)
- [Western Digital: WD Red Plus Product Brief, March 2025](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-red-plus-hdd/product-brief-western-digital-wd-red-plus-hdd.pdf)
- [Western Digital: WD Blue 3.5-inch HDD Product Brief, March 2025](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-blue-hdd/product-brief-western-digital-wd-blue-pc-hdd.pdf)
- [Western Digital: WD Red NAS Storage Specification Sheet, 2017](https://products.wdc.com/library/SpecSheet/ENG/2879-800002.pdf)
- [Seagate: CMR and SMR list](https://www.seagate.com/products/cmr-smr-list/)
- [Blocks and Files: Seagate submarines SMR into 3 Barracuda drives and a Desktop HDD](https://blocksandfiles.com/2020/04/15/seagate-2-4-and-8tb-barracuda-and-desktop-hdd-smr/)
- [Toshiba: Use of Shingled Magnetic Recording (SMR) Technology in Toshiba Consumer Hard Drives](https://www.toshiba-storage.com/about/press-center/use-of-shingled-magnetic-recording-smr-technology-in-toshiba-consumer-hard-drives/)
- [Toshiba: N300 NAS Hard Drive data sheet](https://toshiba.semicon-storage.com/content/dam/toshiba-ss-v3/master/en/storage/product/internal-specialty/HDD-NSENE.pdf)
- [TrueNAS Documentation: WD Red SMR Drive Compatibility with ZFS](https://www.truenas.com/docs/hardware/notices/wdsmr/)
- [TrueNAS Documentation: Hardware Guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/)
- [OpenZFS documentation: Hardware, SMR vs CMR](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [OpenZFS manual: zpool-replace(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-replace.8.html)
- [ServeTheHome: WD Red SMR vs CMR Tested, Avoid Red SMR](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/)
- [ServeTheHome: WD Red SMR vs CMR Tested, page 2](https://www.servethehome.com/wd-red-smr-vs-cmr-tested-avoid-red-smr/2/)
- [smartmontools: smartctl(8) manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html)
- [smartmontools: drivedb.h drive database](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/drivedb.h)
- [smartmontools: ataprint.cpp source](https://raw.githubusercontent.com/smartmontools/smartmontools/master/smartmontools/ataprint.cpp)
- [util-linux: lsblk.c source, v2.40](https://raw.githubusercontent.com/util-linux/util-linux/stable/v2.40/misc-utils/lsblk.c)
- [TrueNAS forum: Can't trim pool of SMR drives?](https://forums.truenas.com/t/cant-trim-pool-of-smr-drives/34557)
- [fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html)
