## The problem

You are comparing a used Dell PowerEdge R730 and R730xd at similar prices and need to know what each one rules out. The two share a platform, but the chassis decides how many drives fit, whether NVMe or a GPU is supported and how many PCIe cards you can add. Here are the exact differences from Dell's documentation, and which one fits a ZFS storage box versus a GPU or virtualization host.

## What the R730 and R730xd share

Both are two-socket 2U servers on Intel's C610 chipset, documented together in one Dell [technical guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf). Behind the drive cage, they are the same platform.

**Processors.** Both take the Xeon E5-2600 v3 and v4 families. The technical guide covers only v3, with up to 18 cores per processor; the later [R730 spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf) lists v4 with up to 22 cores, and the 22-core E5-2699 v4 is a [145 W part](https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html). Before putting v4 chips in a unit that shipped with v3, check the BIOS: Dell added v4 support in [BIOS 2.0.1](https://www.dell.com/support/home/us/en/04/drivers/driversdetails?driverid=y5w1r), released March 17, 2016, the upgrade path [ServeTheHome's E5-2699 v4 review](https://www.servethehome.com/intel-xeon-e5-2699-v4-benchmarking-the-top-end/) also describes. The one processor difference: the guide marks the 160 W E5-2687W v3 as not supported on the R730xd, and the [R730xd owner's manual](https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/standard-operating-temperature?guid=guid-c5c1a8e6-c380-46ea-a788-604fd8778370&lang=en-us) caps its 2.5-inch chassis at 145 W processors. The manuals also list a 120 W limit for the 3.5-inch chassis, but it is one of Dell's [expanded operating temperature restrictions](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/expanded-operating-temperature-restrictions?guid=guid-c7ed6a84-6734-4315-b167-92b007911598&lang=en-us), which apply only outside the standard 10 to 35C range.

**Memory.** Both have 24 DIMM slots, 12 per processor, and take DDR4 RDIMMs or LRDIMMs, never both in one system. The v3 chips in Dell's table top out at 2133MT/s; the R730xd manual lists 2400MT/s, which arrives with v4. Dell's documents disagree on maximum capacity. The technical guide says 768GB, while the R730 spec sheet says up to 3TB with 128GB modules and the R730xd manual gives 768GB for RDIMMs and 3,072GB for LRDIMMs with two processors. The guide predates the larger LRDIMMs (it says 64GB modules were coming), so trust the later documents.

**Management, power and RAID.** Both use iDRAC8 with Lifecycle Controller, Express by default and Enterprise as an upgrade. Both take up to two hot-plug power supplies from the same menu: 495 W, 750 W and 1100 W Platinum AC, a 750 W Titanium AC unit, and 1100 W DC. Both use the PERC9 family: the H330, the H730 with 1GB of non-volatile cache and the H730P with 2GB, as a mini card that takes no PCIe slot or as an adapter. The S130 software RAID option is R730 only.

## Where the two chassis differ

Every difference comes from the chassis, and Dell's guide says the backplane option "must be selected at point of purchase and cannot be changed or upgraded later."

| Feature | R730 | R730xd |
|---|---|---|
| Front bays | 8 x 3.5-inch, 8 x 2.5-inch or 16 x 2.5-inch | 12 x 3.5-inch, 24 x 2.5-inch, or 8 x 3.5-inch plus 18 x 1.8-inch SATA SSD |
| Middle bays | None | 4 x 3.5-inch tray, certain 12-bay configurations only |
| Rear bays | None | 2 x 2.5-inch, optional |
| Most drives | 16 | 28 |
| NVMe (Express Flash) | Not supported | Up to 4 U.2 in slots 20 to 23, 24-bay chassis only |
| PCIe 3.0 slots | 7, plus PERC slot | 6, plus PERC slot |
| Riser 3 | Two x8 slots, or one x16 | One x16 slot |
| Internal GPUs | Two 300 W double-wide or four 150 W single-wide | Not supported |
| 160 W E5-2687W v3 | Supported | Not supported |
| Optical drive | Optional slimline SATA DVD-ROM or DVD+/-RW | Not supported |
| Front panel | LCD panel, 2 USB, vFlash slot | LED panel, 1 USB (iDRAC Direct), vFlash at rear |
| PERC S130 software RAID | 8 x 2.5-inch chassis only | Not offered |

### Drive bays

The [R730 owner's manual](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/hard-drives?guid=guid-8bf49739-41c1-4642-a4f5-5e42a448116c&lang=en-us) lists only eight-drive systems, in 3.5-inch or 2.5-inch, and sixteen-drive 2.5-inch systems. The [R730xd manual](https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/hard-drives?guid=guid-8bf49739-41c1-4642-a4f5-5e42a448116c&lang=en-us) builds every layout from three fronts (12 x 3.5-inch, 24 x 2.5-inch or the 1.8-inch hybrid) plus the optional rear pair, the middle tray or the NVMe bays. The middle tray holds four 3.5-inch drives behind the fan assembly, and the [manual](https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r730xd-owners-manual-en-us-180912.pdf) says systems with it "require low-profile heat sinks and do not require or support a cooling shroud." [StorageReview](https://www.storagereview.com/review/dell-poweredge-13g-r730xd-review) and [InfoWorld](https://www.infoworld.com/article/2181612/servers-review-dell-s-13g-poweredge-r730xd-a-workhorse-server-with-a-kick.html) confirm the four NVMe bays.

### Slots and the front panel

Both manuals put three low-profile x8 slots on riser 1, and a full-height x16 plus a full-height x8 on riser 2. Riser 3 is the difference: the [R730](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/expansion-bus-specifications?guid=guid-25fe748e-f8c6-463e-846d-d489758b0870&lang=en-us) gets two full-height x8 slots or, with the alternate riser, one x16, while the [R730xd](https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/expansion-bus-specifications?guid=guid-25fe748e-f8c6-463e-846d-d489758b0870&lang=en-us) offers only the single x16. The R730 takes an [optional SATA DVD-ROM or DVD+/-RW drive](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/optical-drive?guid=guid-30864d8a-11ca-4534-a85f-d95217368533&lang=en-us); the guide says the R730xd "does not support an internal optical drive."

## Which one to buy for a ZFS or TrueNAS box

If the pool is spinning disks, the R730xd's 12 x 3.5-inch front is the reason to buy it, because the R730 stops at eight large drives. The rear 2.5-inch pair keeps boot drives out of the pool; InfoWorld's review unit used its rear pair as a RAID-1 mirror for the operating system. The 1.8-inch hybrid chassis pairs 18 SATA SSDs with eight 3.5-inch drives, but Dell's 1.8-inch SSD options topped out at 960GB and Dell ranks it the loudest R730xd chassis at idle.

The controller matters more than the chassis. [OpenZFS](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) says plainly that "Hardware RAID controllers should not be used with ZFS" and recommends an HBA. Dell's HBA330 is an [8-port LSI 3008 card with non-RAID pass-through](https://www.dell.com/support/manuals/en-us/dell-sas-hba-12gbps/dell_hba_ug_publication/dell-hba-card-specifications?guid=guid-06cb2c46-07fb-4f69-b558-fa0a275d1d51&lang=en-us), and Dell's [HBA330 Mini firmware page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2) lists both the R730 and R730xd. If you already have an H330 or H730, Dell's PERC 9 guide describes an [HBA mode](https://www.dell.com/support/manuals/en-us/poweredge-rc-h730/perc9ugpublication/perc-9-personality-management?guid=guid-bc0aac4e-f574-4202-9379-be3a4d6a142c&lang=en-us) with no virtual disks, where all physical disks run "under operating system control." [TrueNAS](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) accepts that: it says not to use a RAID card's RAID facility when the card has an HBA mode, and calls one RAID0 volume per disk "not the ideal setup." The two disagree on strictness; trust OpenZFS for a new build, because TrueNAS's own list of RAID card limitations includes masking disk serial numbers and S.M.A.R.T. data. For pool layout, see [running ZFS on Dell enterprise hardware](/blog/zfs-on-enterprise-hardware).

## Which one to buy for a GPU or virtualization host

For any GPU, buy the R730. Dell supports two 300 W double-wide or four 150 W single-wide GPUs in it, passively cooled only and for compute only: "external video out is not supported." The cards sit on risers 2 and 3: two double-wide cards need the optional single-x16 riser 3, and three or four single-wide cards need the standard riser 3. Dell's guide lists accelerators including the NVIDIA K40, GRID K1 and GRID K2, AMD FirePro S7000 and S9050, and Intel Xeon Phi cards, and the [R730 owner's manual](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/gpu-card-installation-guidelines?guid=guid-c3605f65-c4ae-4beb-9a32-907a90753b81&lang=en-us) adds rules for the NVIDIA K80. [StorageReview's R730 review](https://www.storagereview.com/review/dell-poweredge-13g-r730-server-review) confirms the same options. To hand a card to a VM, see [GPU passthrough on Proxmox](/blog/gpu-passthrough-proxmox).

Without a GPU, processor and memory options match apart from that one 160 W chip, so a virtualization host comes down to the R730's seventh slot and optical drive against the R730xd's extra bays.

## How loud each one is, by Dell's measurements

In Dell's guide, a typical 3.5-inch R730 measured 28 dBA idle and 33 dBA operating, and a typical 3.5-inch R730xd measured 32 dBA idle and 43 dBA operating. Dell's typical R730xd carries ten drives to the R730's six, so treat that as a direction, not a matched test. Dell also says a 3.5-inch R730xd with 16 drives is about 50% louder at idle than one with four (6.2 versus 5.6 bels).

On the R730, any GPGPU card makes it about twice as loud. PCIe SSD configurations need more airflow and can reach 7.0 bels under stress. Low-power chips such as the E5-2650L v3 and E5-2630L v3 run about twice as loud as typical under moderate or heavy load, because they have lower temperature limits. Dell's default Power Optimized (DAPC) profile keeps fans slower than Performance Optimized. Owners report non-Dell PCIe cards raising fan speed: one [R730xd owner](https://forums.developer.nvidia.com/t/dell-pe-r730xd-fans-running-too-fast-because-of-connectx-3-pcie-card/207266) reported about 17,000 RPM at idle with a ConnectX-3 card installed and about 5,000 RPM without it.

## What iDRAC8's end of maintenance means for both

Both are 13th-generation servers with iDRAC8, and [Dell's iDRAC8 support article](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8) gives the dates that matter. iDRAC8 reached End of Sale in December 2021 and End of Software Maintenance in February 2024, and the last iDRAC8 firmware is version 2.86.86.86. Dell defines the maintenance date as the last date for iDRAC engineering to release maintenance releases or fixes, so treat that firmware as final: update to 2.86.86.86 and keep the iDRAC port on an isolated management network. The [iDRAC tips and tricks](/blog/dell-idrac-tips-tricks) post covers day-to-day use.

For the hardware there is no published date: owners who asked on [Dell's community forum](https://www.dell.com/community/en/conversations/rack-servers/poweredge-servers-end-of-life-dates/66e9cfa5631be3413cd3db37) were told by a Dell moderator that no article lists PowerEdge end-of-life dates, and to check each server by service tag.

## What breaks

**Buying an R730xd to run GPUs.**

Dell's guide is blunt: "The R730xd does not support internal or external GPUs." The R730xd's card installation table has no GPU entry, and the GPU enablement kit that carries the power cables is described for the R730 chassis. A card may fit the full-height x16 slot, but its power and cooling are not validated.

Fix: buy an R730 for GPU work, or keep the R730xd as the storage box and put the GPU in a separate host.

**Assuming any 2.5-inch chassis takes NVMe.**

Dell states that "The R730 does not support Express Flash drives," in any chassis. On the R730xd, only the 24-bay layout with U.2 slots 20 to 23 takes NVMe, and the backplane is fixed at purchase. Owners asking on [Dell's community forum](https://www.dell.com/community/en/conversations/rack-servers/r730xd-u2-nvme-enablement-kit-installation/6627b2f9abffb86bf86f5ffb) were told by a Dell moderator that the kit's PCIe extender card goes in slot 4, that slot 4 needs two processors, and that a field change to the backplane is not supported. That matches the [R730xd card table](https://www.dell.com/support/manuals/en-gb/poweredge-r730xd/r730xd_ompublication/expansion-card-installation-guidelines?guid=guid-48fdcedc-e689-4cb6-a83c-7b9ea4e31449&lang=en-us&lwp=rt), which reserves slot 4 for a PCIe bridge card.

Fix: confirm the listing is a 24-bay R730xd with the four NVMe bays, the extender card and two processors. Otherwise, put NVMe on a PCIe add-in card.

**Leaving the PERC in RAID mode for ZFS.**

Dell says PERC9 controllers are "mostly shipped from the factory in RAID mode." If you build a RAID volume, or one RAID0 per drive, and give it to ZFS, ZFS sees the controller's virtual disks instead of the drives, and OpenZFS warns that hardware RAID "will limit opportunities for ZFS to perform self healing on checksum failures."

Fix: fit an HBA330, or switch the H330 or H730 to HBA mode, so ZFS gets every disk directly. Treat one RAID0 per disk as the last resort TrueNAS describes.

**Fitting a GPU to an R730 without Dell's power and cooling conditions.**

Each GPU takes power through the GPU enablement kit's cables, and Dell requires redundant 1100 W power supplies, both processors installed and the kit's low-profile heat sinks. Inlet air is limited to 30C instead of the usual 35C. For the NVIDIA K80, the owner's manual asks for two 1100 W supplies set to non-redundant mode. The processor limit is where Dell disagrees with itself: 120 W or less in the technical guide, 135 W or less in the owner's manual. The manual is the more recent document, since it covers the K80 that the guide's GPU list omits, but 120 W satisfies both.

Fix: buy the GPU enablement kit, fit two 1100 W supplies, choose processors at 120 W or below (the 14-core E5-2695 v3 and E5-2683 v3 are 120 W parts in Dell's table), and keep the rack inlet under 30C.

**Buying a single-processor unit and expecting every slot.**

Slots 1 through 4 are wired to the second processor, and each processor drives 12 of the 24 DIMM slots. A one-processor R730 keeps slots 5 to 7 and a one-processor R730xd keeps slots 5 and 6, each with half the memory slots. That also rules out GPUs, which need both processors, and the R730xd's NVMe extender in slot 4.

Fix: budget for a second processor and heat sink before you count on more than two or three cards.

**Planning to add rear bays, the middle tray or a different backplane later.**

The rear pair and the middle tray are backplane options, which Dell says are fixed at purchase, and the middle tray works only in certain 12-bay configurations, with low-profile heat sinks and no cooling shroud.

Fix: buy the unit with the layout you want already installed; Dell does not support changing the backplane in the field.

## What this means

For a ZFS or TrueNAS box, buy an R730xd with the 12 x 3.5-inch front, fit an HBA330 and use the rear bays for boot. For front-bay NVMe, only a 24-bay R730xd with the four U.2 bays and two processors will do. For any GPU, buy an R730 with 1100 W supplies and the GPU kit. For general virtualization they are the same server with different drive cages, so buy the one that matches your disks. Either way, iDRAC8 stopped getting fixes in February 2024, so keep it off your main network, and run the checks from [evaluating used enterprise gear](/blog/buying-used-enterprise-gear) before you pay.

## References

- https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf
- https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-Spec-Sheet.pdf
- https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r730xd-owners-manual-en-us-180912.pdf
- https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/standard-operating-temperature?guid=guid-c5c1a8e6-c380-46ea-a788-604fd8778370&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/hard-drives?guid=guid-8bf49739-41c1-4642-a4f5-5e42a448116c&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/hard-drives?guid=guid-8bf49739-41c1-4642-a4f5-5e42a448116c&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/expansion-bus-specifications?guid=guid-25fe748e-f8c6-463e-846d-d489758b0870&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730xd/r730xd_ompublication/expansion-bus-specifications?guid=guid-25fe748e-f8c6-463e-846d-d489758b0870&lang=en-us
- https://www.dell.com/support/manuals/en-gb/poweredge-r730xd/r730xd_ompublication/expansion-card-installation-guidelines?guid=guid-48fdcedc-e689-4cb6-a83c-7b9ea4e31449&lang=en-us&lwp=rt
- https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/gpu-card-installation-guidelines?guid=guid-c3605f65-c4ae-4beb-9a32-907a90753b81&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/optical-drive?guid=guid-30864d8a-11ca-4534-a85f-d95217368533&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/expanded-operating-temperature-restrictions?guid=guid-c7ed6a84-6734-4315-b167-92b007911598&lang=en-us
- https://www.dell.com/support/home/us/en/04/drivers/driversdetails?driverid=y5w1r
- https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8
- https://www.dell.com/support/manuals/en-us/poweredge-rc-h730/perc9ugpublication/perc-9-personality-management?guid=guid-bc0aac4e-f574-4202-9379-be3a4d6a142c&lang=en-us
- https://www.dell.com/support/manuals/en-us/dell-sas-hba-12gbps/dell_hba_ug_publication/dell-hba-card-specifications?guid=guid-06cb2c46-07fb-4f69-b558-fa0a275d1d51&lang=en-us
- https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2
- https://www.dell.com/community/en/conversations/rack-servers/r730xd-u2-nvme-enablement-kit-installation/6627b2f9abffb86bf86f5ffb
- https://www.dell.com/community/en/conversations/rack-servers/poweredge-servers-end-of-life-dates/66e9cfa5631be3413cd3db37
- https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html
- https://www.servethehome.com/intel-xeon-e5-2699-v4-benchmarking-the-top-end/
- https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html
- https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/
- https://www.storagereview.com/review/dell-poweredge-13g-r730xd-review
- https://www.storagereview.com/review/dell-poweredge-13g-r730-server-review
- https://www.infoworld.com/article/2181612/servers-review-dell-s-13g-poweredge-r730xd-a-workhorse-server-with-a-kick.html
- https://forums.developer.nvidia.com/t/dell-pe-r730xd-fans-running-too-fast-because-of-connectx-3-pcie-card/207266
