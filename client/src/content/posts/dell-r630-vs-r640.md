## The short answer

The Dell PowerEdge R630 is a 13th generation 1U server with iDRAC8 (Dell's remote management controller) that takes up to two [Xeon E5-2600 v3 or v4 processors](https://downloads.dell.com/topicspdf/poweredge-r630_owners-manual_en-us.pdf) with four memory channels each. The R640 is a 14th generation 1U server with iDRAC9 that takes 1st and 2nd Generation Xeon Scalable processors with [six channels each](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf). Both hold 24 memory modules. The R640 raises the largest CPU from 22 cores and 145 W to 28 cores and 205 W, DDR4 from 2400 to 2933 MT/s (a calculated peak of 76.8 against 140.8 GB/s per socket), NVMe bays from 4 to 10, and the newest operating systems Dell lists from Windows Server 2019 and ESXi 7.0 to Windows Server 2022 and ESXi 8.0. It also takes a BOSS boot card, which the R630 does not. The R630's iDRAC8 ended at [version 2.86.86.86](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8), while iDRAC9 software maintenance runs to [February 1, 2027](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9). Dell's published noise figures and benchmark idle power do not favor the R640, so its case rests on platform life, NVMe and memory bandwidth.

## What changed from the 13th generation R630 to the 14th generation R640?

Dell's R640 technical guide includes a [side-by-side table](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf) against the R630. The table below merges it with the [R630 Owner's Manual](https://downloads.dell.com/topicspdf/poweredge-r630_owners-manual_en-us.pdf), the [R630 spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-spec-sheet.pdf) and the [R640 Installation and Service Manual](https://downloads.dell.com/topicspdf/poweredge-r640_owners-manual_en-us.pdf).

| | R630 | R640 |
|---|---|---|
| Chipset | Intel C610 series | Intel C620 series |
| Processors | Xeon E5-2600 v3 or v4 | 1st and 2nd Gen Xeon Scalable |
| Memory | 24 DDR4 slots, 4 channels per CPU | 24 DDR4 slots, 6 channels per CPU |
| Front bays | 8 or 10 x 2.5 in, or 24 x 1.8 in | 4 x 3.5 in, 8 or 10 x 2.5 in, plus 2 optional rear 2.5 in |
| NVMe | Up to 4, through a PCIe bridge card | Up to 10, direct to the CPUs |
| PCIe slots | Up to 3, x16/x8/x16 | Up to 3, x16/x16/x16 |
| Management | iDRAC8 | iDRAC9 |
| Boot media | SD cards (IDSDM), internal USB | microSD cards (IDSDM), internal USB, BOSS |
| Power supplies | 495 to 1100 W | 495 to 1600 W |
| Fans | Up to 7 | Up to 8 |
| Maximum weight | 18.5 kg (10-bay) | 21.9 kg |
| Depth | 75.51 cm (10-bay and 24-bay) | 80.85 cm |

The R630 manual's weight table gives 16.9 kg for the 8-bay and 17.4 kg for the 24-bay. The R630 spec sheet lists a depth of 70.05 cm for the 8-bay chassis. The R640 guide gives 808.5 mm and defines it as bezel to rear power supply handle. The two documents do not say they measure depth the same way, so allow extra rack depth for the R640 and its cables.

The R630 chassis is also fixed at purchase. Dell's [R630 Technical Guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-technical-guide-v1-6.pdf) says a chassis "cannot be reconfigured or upgraded after point of purchase," so an 8-bay R630 stays an 8-bay.

## Which CPUs does each take, and how fast does the memory run?

### Processors

The R630 spec sheet lists up to [22 cores](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-spec-sheet.pdf) with the E5-2600 v4 family. The June 2015 R630 technical guide lists only v3 parts and says the server supports "up to 18 cores per processor," topping out at the 145 W E5-2699 v3. Dell's [iDRAC8 2.30.119.30 release notes](https://dl.dell.com/manuals/all-products/esuprt_software/esuprt_remote_ent_sys_mgmt/esuprt_rmte_ent_sys_rmte_access_cntrllr/idrac8-lifecycle-controller-v2.30.119.30_Release%20Notes_en-us.pdf) (April 2016) "Added support for the Intel E5-26xx v4 family of processors." An R630 that has sat on older firmware should get its BIOS and iDRAC updated before a v4 chip goes in.

Heat limits the v4 choices. In its temperature specifications, the R630 manual names the 8-bay chassis with two PCIe slots as the configuration that supports a 145 W, 22-core processor. For a 10-bay chassis with PCIe SSDs it restricts ambient temperature to 30 C with a processor of up to 135 W, or 35 C with a processor of up to 120 W.

The R640 guide lists a much larger set, from Bronze parts to the 28-core, 205 W Platinum 8280. The table compares the largest parts using Dell's lists and Intel's specification pages.

| | R630 | R640 |
|---|---|---|
| Largest listed CPU | [E5-2699 v4](https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html): 22 cores, 145 W | [Platinum 8280](https://www.intel.com/content/www/us/en/products/sku/192478/intel-xeon-platinum-8280-processor-38-5m-cache-2-70-ghz/specifications.html): 28 cores, 205 W |
| Cores with two sockets | 44 | 56 |
| Socket | FCLGA2011 | FCLGA3647 |
| PCIe 3.0 lanes per CPU | 40 | 48 |
| Intel servicing updates ended | June 30, 2022 (E5-2699 v4) | December 31, 2023 ([Gold 6130](https://www.intel.com/content/www/us/en/products/sku/120492/intel-xeon-gold-6130-processor-22m-cache-2-10-ghz/specifications.html)); June 30, 2025 ([Gold 6230](https://www.intel.com/content/www/us/en/products/sku/192437/intel-xeon-gold-6230-processor-27-5m-cache-2-10-ghz/specifications.html), Platinum 8280) |

The 2nd Generation parts need current firmware. Dell's [iDRAC9 3.34.34.34 release notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes2_en-us.pdf) (June 2019) say "This release adds support for Intel Cascade Lake processors and DDR4 2933 MT/s memory." Cascade Lake is Intel's code name for 2nd Generation Xeon Scalable. Check the installed versions before swapping CPUs:

```bash
ssh root@IDRAC_IP racadm getversion
```

Dell's [iDRAC8 guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf) shows this form of a single RACADM command over SSH, and the [iDRAC9 guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) describes the same use of SSH. The output lists the BIOS and iDRAC versions.

### Memory

Both servers have 24 slots, 12 per CPU, but the layout differs. The R630 spreads them over four channels of three slots, and the [R640 manual](https://downloads.dell.com/topicspdf/poweredge-r640_owners-manual_en-us.pdf) describes six channels per processor, which is two slots each. Both take registered DDR4 modules (RDIMMs) and load-reduced modules (LRDIMMs), and both manuals say "RDIMMs and LRDIMMs must not be mixed." The R640 adds NVDIMM-N and Intel Optane persistent memory. The [server memory architecture](/blog/server-memory-architecture) article covers population rules.

Dell's tables set the running speed. The R630 manual gives these RDIMM speeds by modules per channel:

| RDIMMs per channel | R630 speed, MT/s |
|---|---|
| 1 | 2400, 2133 or 1866 |
| 2 | 2400, 2133 or 1866 |
| 3 | 1866 |

The R640 guide's [speed table](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf) is organized by CPU family and module instead:

| CPU family | Module | R640 speed, MT/s |
|---|---|---|
| 1st Gen Xeon Scalable | 8, 16 or 32 GB RDIMM | 2666 |
| 2nd Gen Xeon Scalable | 8 GB single-rank RDIMM | 2666 |
| 2nd Gen Xeon Scalable | 16, 32 or 64 GB dual-rank RDIMM | 2933 |
| Either | 64 or 128 GB LRDIMM | 2666 |

The CPU sets the cap in each case. Intel lists DDR4-2400 for the E5-2699 v4 but only 2133 for the [E5-2640 v4](https://www.intel.com/content/www/us/en/products/sku/92984/intel-xeon-processor-e52640-v4-25m-cache-2-40-ghz/specifications.html). On the R640 side, Intel lists 2666 for the Gold 6130 and 2933 for the Gold 6230, while Dell's processor list shows the Silver 4210 and Gold 5120 at 2400. Peak bandwidth per socket is channels times transfer rate times 8 bytes. That is arithmetic, not a Dell figure, except where Intel's published number is shown.

| Configuration | Calculation | Peak per socket |
|---|---|---|
| R630, E5-2699 v4, DDR4-2400 | 4 x 2,400 x 8 | 76,800 MB/s (Intel lists 76.8 GB/s) |
| R630, E5-2640 v4, DDR4-2133 | 4 x 2,133.3 x 8 | 68,267 MB/s (Intel lists 68.3 GB/s) |
| R630, three RDIMMs per channel | 4 x 1,866.7 x 8 | 59,733 MB/s |
| R640, Gold 6130, DDR4-2666 | 6 x 2,666.7 x 8 | 128,000 MB/s |
| R640, Gold 6230, DDR4-2933 | 6 x 2,933.3 x 8 | 140,800 MB/s |

Dell's R640 guide credits the move to "50% increased memory bandwidth and capacity" from six channels against four. The higher speed adds to that, which makes the best case 1.83 times the R630's (140,800 divided by 76,800). These peaks are ceilings, not measurements. A dual-socket R640 needs 12 matching modules to fill every channel, since the R640 manual says to "Populate six identical memory modules per processor (one DIMM per channel) at a time to maximize performance." The R630 needs 8.

Capacity also differs.

| | R630 | R640 |
|---|---|---|
| RDIMM sizes | 4, 8, 16, 32 GB | 8, 16, 32, 64 GB |
| Maximum RDIMM | 768 GB | 1.53 TB |
| LRDIMM sizes | 64 GB | 64 and 128 GB |
| Maximum LRDIMM | 1,536 GB | 3 TB |

The R630 manual prints 786 GB for dual-processor RDIMM capacity, but 24 x 32 GB is 768 GB, so that looks like a typo. Intel lists 1 TB per socket for the Gold 6230 and Platinum 8280, so the R640's 3 TB total implies one of the high-memory L or M parts in Dell's list. That is an inference from those numbers, not a Dell statement.

Dell publishes no statement on moving R630 memory to an R640. Both use 288-pin registered DDR4, and the R640 manual says modules with different speeds "will operate at the speed of the slowest installed" module. Check the running speed afterward from Linux:

```bash
sudo dmidecode -t memory | grep -E "Locator:|Speed:"
```

The [dmidecode manual](https://linux.die.net/man/8/dmidecode) lists `memory` among its `--type` keywords.

## How many drives and NVMe bays can each chassis hold?

| | R630 | R640 |
|---|---|---|
| 3.5 in | None | 4 bays |
| 2.5 in SAS or SATA | 8 or 10 bays | 8 or 10 bays |
| 2.5 in NVMe | Up to 4 (in the 10-bay) | Up to 8 of 10, or all 10 |
| Other | 24 x 1.8 in SATA SSD | 2 optional rear 2.5 in |

The R630's NVMe support uses Dell Express Flash drives. The R630 manual describes the mixed 10-bay as up to six 2.5-inch hot swappable drives plus up to four Express Flash PCIe SSDs, so adding NVMe costs regular bays. The R640 guide contrasts "Up to 10 CPU Direct Attach PCIe SSD" with the R630's "Up to 4x PCIe SSD from PCIe bridge card." The R640 guide's NVMe drive list includes Gen4 models, but the same guide describes the platform's slots and lanes as PCIe 3.0, so expect Gen3 speeds.

Two cautions apply to the R640. The guide's comparison table lists the rear bays as "SAS/SATA/SSD/NVMe" while its backplane list gives a rear "(x2) SAS or SATA backplane," so confirm the part before buying one for NVMe. And a 10-bay R640 can be SAS/SATA with up to 8 NVMe, or all NVMe, so ask the seller which backplane is installed. The 1.8-inch R630 chassis uses SATA SSDs with a 0.96 TB maximum in the spec sheet.

Storage controllers differ too. The R630 guide lists the PERC S130 (8-bay only), H330, H730 and H730P, and the spec sheet adds the external H830. The R640 guide adds the S140, the H740P and the HBA330, an internal non-RAID option. The R640 guide also warns that on-board SATA ports "are not accessible if mini PERC is installed." For ZFS, the [H730 HBA mode](/blog/perc-h730-hba-mode) article covers the R630 side.

## What are the PCIe slot and riser layouts?

The R630 has two riser arrangements, per its [owner's manual](https://downloads.dell.com/topicspdf/poweredge-r630_owners-manual_en-us.pdf). The three-slot layout has low-profile, half-length slots on riser 1 (slot 1 at x16 and slot 2 at x8, both on processor 2) and riser 3 (slot 3, x16, processor 1). The two-slot layout has one low-profile slot on riser 2 (x8 from processor 1 or x16 from processor 2) and a full-height, three-quarter-length x16 slot on riser 3. The manual says "Both the processors must be installed to use riser 1 slots," so a single-CPU R630 loses those two slots.

The R640 guide lists four riser options, and every slot is x16.

| Riser | Slots | CPU | Card size |
|---|---|---|---|
| 1A | Two x16 | 1 | Low profile |
| 1B | One x16 | 1 | Low profile |
| 2A | One x16 | 2 | Low profile |
| 2B | One x16 | 2 | Full height, up to three-quarter length |

Both servers add a dedicated storage-controller slot and a network daughter card slot. The R640 guide places both on processor 1, at x8 each. The embedded network options grow too: the R630 spec sheet lists 4 x 1 Gb, 2 x 1 Gb plus 2 x 10 Gb, or 4 x 10 Gb, and the R640 adds 2 x 25 GbE. For accelerators, the R640 guide lists up to three single-width NVIDIA T4 GPUs or one FPGA. The [PCIe lanes](/blog/pcie-lanes-explained) article explains why slots on the second CPU matter.

## What does iDRAC8 versus iDRAC9 change for a homelab?

| | iDRAC8 (R630) | iDRAC9 (R640) |
|---|---|---|
| Default license | Express | Express |
| Virtual console | Needs Enterprise | Needs Enterprise |
| HTML5 console | Added in 2.30.119.30 (April 2016) | Yes |
| Last firmware | 2.86.86.86 (April 3, 2024) | 7.00.00.185 (August 2026) is the latest Dell lists |
| Software maintenance | Ended February 2024 | Runs to February 1, 2027 |
| Third-party PCIe card cooling | One raw IPMI command per server | Per-slot airflow setting, Datacenter license |
| Raw IPMI fan commands | Reported available | Reported removed from 3.34.34.34 on |

The [iDRAC8 guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf) and the [iDRAC9 guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) both say Express is "available by default on all 600 and higher series of rack or tower servers." Each guide's license table marks Virtual Console "No" for Express, and the iDRAC9 table puts PCIe airflow settings under Datacenter only. The [iDRAC9 Enterprise license](/blog/idrac-9-enterprise-license) article covers buying one. The iDRAC8 HTML5 console arrived in [2.30.119.30](https://dl.dell.com/manuals/all-products/esuprt_software/esuprt_remote_ent_sys_mgmt/esuprt_rmte_ent_sys_rmte_access_cntrllr/idrac8-lifecycle-controller-v2.30.119.30_Release%20Notes_en-us.pdf) along with Redfish 1.0, so an R630 on that firmware or later can avoid the Java console.

The maintenance dates come from [KB 000178044](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8), which says iDRAC8 "reaches the End of Software Maintenance as of February 2024" and that the last release is 2.86.86.86, and from [KB 000178016](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9) for iDRAC9. Dell's [2.86.86.86 download page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=vwf72) is dated April 3, 2024 and lists fixes for a predictable IPMI session ID, the deprecated SHA1 algorithm in SSH, and CVE-2023-48795. After the maintenance date, KB 000178044 says "iDRAC Engineering is no longer obligated to maintain or repair the firmware," so keep an iDRAC8 on an isolated management network.

For quiet running, the generations split. On 13th generation servers, Dell's [KB 000135682](https://www.dell.com/support/kbdoc/en-us/000135682) disables the fan increase that a third-party PCIe card triggers:

```bash
ipmitool -I lanplus -H IDRAC_IP -U USERNAME -P PASSWORD raw 0x30 0xce 0x00 0x16 0x05 0x00 0x00 0x00 0x05 0x00 0x01 0x00 0x00
```

The same article gives a command to read the current state:

```bash
ipmitool -I lanplus -H IDRAC_IP -U USERNAME -P PASSWORD raw 0x30 0xce 0x01 0x16 0x05 0x00 0x00 0x00
```

Dell notes that this only removes the increase tied to the card, so it may change nothing if the fans are already fast for another reason.

Manual fan control is a community technique, not a Dell feature. The fan-controller project's [README](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker) lists raw fan commands as available on iDRAC 6, 7 and 8, available on iDRAC9 up to firmware 3.30.30.30, and removed by Dell from 3.34.34.34 on. That lines up badly with the CPU note above: 3.34.34.34 is the release whose notes add Cascade Lake support. Plan on a 2nd Generation R640 not having raw fan control. Downgrading is not a way around it either. Dell's [KB 000225924](https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers) says iDRAC9 "cannot downgrade/rollback to iDRAC9 firmware 4.40.10.00 or older" once the June 2024 release (7.00.00.172 on 14th generation) is installed. The [fan speed offset](/blog/idrac-fan-speed-offset) article covers what iDRAC9 does allow.

## How does each one boot: IDSDM, SD, USB or BOSS?

IDSDM is Dell's Internal Dual SD Module, and BOSS is its Boot Optimized Storage Solution card.

| Option | R630 | R640 |
|---|---|---|
| IDSDM | Two SD cards, mirrored | Two microSD cards, combined with vFlash |
| Internal USB | Yes | Yes |
| BOSS-S1 | Listed as "None" | Two M.2 SATA drives, RAID 1 or non-RAID |
| SATADOM | Not listed by Dell | Not listed by Dell |

The R630's [Internal Dual SD Module](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-technical-guide-v1-6.pdf) keeps its two cards in a mirrored configuration. The R640 moves to microSD and merges the module with the vFlash card. Its guide adds that "The IDSDM only option is available with vFlash hardware and requires an iDRAC Enterprise license to enable this feature."

BOSS is the 14th generation answer. Dell's [BOSS-S1 guide](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf) lists the R640 among supported systems and names M.2 drives such as the Intel S3520 (120, 240 and 480 GB), Intel S4510 and Micron 5100 (both 240 and 480 GB). It adds, "Dell EMC recommends that you use the BOSS-S1 card only as an operating system boot device." The S1 is a PCIe card, so it uses one of the three slots. The [BOSS card](/blog/dell-boss-card) article covers its modes.

SD boot has a software cost. Broadcom's [KB 317631](https://knowledge.broadcom.com/external/article/317631) says "Endurance ratings alone cannot guarantee the viability of SD cards/USB media as a boot option," sets an endurance requirement of 128 TBW over five years for a boot device, and says newer servers that carry SD or USB as a boot device "will not certify successfully." An R630 on ESXi 7.0 that boots from IDSDM falls under that guidance.

Dell does not list a SATADOM option for either server in these guides. A third-party SATADOM is untested by Dell, and on the R640 the on-board SATA ports are not accessible once a mini PERC is installed.

## Which is the better used buy for noise, power and support dates?

### Noise

Dell publishes sound data for each, in different papers and setups. The R630 numbers come from the [R630 technical guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-technical-guide-v1-6.pdf) at 23 C, plus or minus 2. The R640 numbers come from Dell's [14G acoustics paper](https://downloads.dell.com/manuals/common/dell_emc_poweredge_14g_acoustical_performance_and_dependencies_22nov2018.pdf) at 25 C. LpA is sound pressure at the listener, in A-weighted decibels.

| Configuration, idle / operating LpA | R630 (23 C) | R640 (25 C) |
|---|---|---|
| Minimum | 25 / 29 dBA | 35 / 37 dBA |
| Typical | 32 / 33 dBA | 36 / 39 dBA |
| Feature-rich | 43 / 43 dBA | 39 / 46 dBA |

The configurations are not matched. The R630's minimum build is one 85 W CPU, one memory module and one SATA SSD, while the R640's is one 85 W CPU, two modules and a 7,200 rpm SATA drive in the 3.5-inch chassis. The R630's typical build has two 105 W CPUs, eight modules and four 10,000 rpm SAS drives, and the R640's has two 105 W CPUs, twelve modules, eight 10,000 rpm SAS drives and a network card. Read the table as a rough guide, not a ranking.

Temperature matters more than the model. Dell's R640 table lists idle at 28 C as 46 to 48 dBA, against 35 to 39 dBA at 25 C, and says "the idle fan speed of the system cannot be lowered without changing the configuration." Both servers get louder with NVMe: the R630 guide says a configuration with PCIe SSD "requires more airflow for cooling," and the R640 paper says NVMe drives need higher fan speeds.

### Power

Dell's own SPECpower_ssj2008 submissions give a hint at the top end only.

| | [R630 run](https://spec.org/power_ssj2008/results/res2016q2/power_ssj2008-20160510-00731.html) | [R640 run](https://spec.org/power_ssj2008/results/res2017q3/power_ssj2008-20170829-00781.html) |
|---|---|---|
| CPUs | 2 x E5-2699 v4 (44 cores) | 2 x Platinum 8180 (56 cores) |
| Memory | 8 x 16 GB, limited to 1866 | 12 x 16 GB, 2666 rated |
| Active idle | 46.7 W | 55.0 W |
| 100% load | 279 W | 469 W |
| Score | 11,157 overall ssj_ops/watt | 11,542 overall ssj_ops/watt |

Both runs used one 120 GB SATA SSD and had Turbo Boost disabled, and the R630 report also notes a 290 W user-defined power cap. These are tuned benchmark builds, not a home server at idle. Efficiency per watt is within 4 percent (11,542 against 11,157), and the R640 idled 8.3 W higher with more cores and more memory modules. The [rack budget tool](/tools/rack-budget) converts watts to heat and yearly cost.

### Support dates

| | R630 | R640 |
|---|---|---|
| Management firmware | iDRAC8, final at 2.86.86.86 | iDRAC9, maintenance to February 1, 2027 |
| Newest Windows Server Dell lists | [2019 LTSC](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r630) | [2022 LTSC](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r640) |
| Newest ESXi Dell lists | 7.0 | 8.0 |

The newest R630 BIOS on Dell's download page is [2.19.0](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=km6p8), dated March 18, 2024. Dell's [vSphere 8.0 certified list](https://www.dell.com/support/kbdoc/en-us/000217592/dell-poweredge-servers-certified-for-vmware-vsphere-8-0) includes the R640 and has no R630 entry. The [R740 end-of-life](/blog/poweredge-r740-end-of-life) article tracks the 14th generation dates.

Choose by the job. The R630 fits a Proxmox or ESXi 7 host that needs three PCIe slots and no NVMe, with the lower idle draw in these two runs, if the end of firmware updates is acceptable. The R640 fits ESXi 8, Windows Server 2022, an NVMe pool, 3.5-inch drives or six-channel memory. For more 13th generation bays, the [R730 vs R730xd](/blog/dell-r730-vs-r730xd) article covers the 2U siblings.

## What breaks

**A 2nd Generation CPU needs newer firmware in an R640.** Dell's 3.34.34.34 notes are where Cascade Lake and DDR4-2933 support appear. Fix: update iDRAC and BIOS before the CPU swap, and expect raw fan commands to stop working.

**An R630 with one CPU has fewer slots.** The manual says both processors must be installed to use riser 1 slots. Fix: use the two-slot layout, or install the second CPU.

**A hot CPU in a 10-bay R630 with NVMe.** Dell names the 8-bay, two-slot chassis for the 145 W, 22-core part. Fix: choose a part at or under 135 W for a 10-bay with PCIe SSDs, and keep ambient at 30 C or lower.

**Memory runs below its rating.** The R630 drops to 1866 MT/s at three RDIMMs per channel, and Dell's R640 table shows 2666 for 1st Generation CPUs and for 8 GB single-rank modules. Fix: populate one identical module per channel, and read the speed with dmidecode.

**A power supply from the other generation will not work.** The R640 manual says mixing PSUs from previous generations "is not supported, even if the PSUs have the same power rating," and results in "a PSU mismatch condition or failure to turn the system on." Fix: buy 14th generation supplies for the R640.

**Virtual console is missing.** Express lacks it on both generations. Fix: check the license in the iDRAC web interface, and read the Enterprise license article before buying.

**An iDRAC9 downgrade reports success and logs RAC0181.** Dell describes RAC0181 as an informational Lifecycle Log event that appears on reboot, with no action required. Fix: do not plan on downgrading iDRAC9 to 4.40.10.00 or older.

**ESXi on an SD card wears out.** Broadcom no longer treats SD or USB media as a dependable boot option. Fix: use a BOSS-S1 on the R640, or an SSD in a front bay on either server.

## Sources

- [Dell: PowerEdge R630 Owner's Manual](https://downloads.dell.com/topicspdf/poweredge-r630_owners-manual_en-us.pdf)
- [Dell: PowerEdge R640 Installation and Service Manual](https://downloads.dell.com/topicspdf/poweredge-r640_owners-manual_en-us.pdf)
- [Dell: PowerEdge R640 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf)
- [Dell: PowerEdge R630 Technical Guide, version 1.6](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-technical-guide-v1-6.pdf)
- [Dell: PowerEdge R630 Spec Sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/dell-poweredge-r630-spec-sheet.pdf)
- [Dell: PowerEdge 14th Generation Acoustical Performance and Dependencies](https://downloads.dell.com/manuals/common/dell_emc_poweredge_14g_acoustical_performance_and_dependencies_22nov2018.pdf)
- [Dell: iDRAC8 Version 2.75.75.75 User's Guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf)
- [Dell: iDRAC9 User's Guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf)
- [Dell: iDRAC8 2.30.119.30 Release Notes](https://dl.dell.com/manuals/all-products/esuprt_software/esuprt_remote_ent_sys_mgmt/esuprt_rmte_ent_sys_rmte_access_cntrllr/idrac8-lifecycle-controller-v2.30.119.30_Release%20Notes_en-us.pdf)
- [Dell: iDRAC9 3.34.34.34 Release Notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes2_en-us.pdf)
- [Dell KB 000178044: Support for iDRAC8](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8)
- [Dell KB 000178016: Support for iDRAC9](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9)
- [Dell KB 000135682: Disable the third-party PCIe card default cooling response on 13G servers](https://www.dell.com/support/kbdoc/en-us/000135682)
- [Dell KB 000225924: RAC0181 iDRAC9 firmware downgrade failures](https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers)
- [Dell: iDRAC8 2.86.86.86 download page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=vwf72)
- [Dell: BIOS 2.19.0 for R630, R730 and R730xd](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=km6p8)
- [Dell: PowerEdge R630 supported operating systems](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r630)
- [Dell: PowerEdge R640 supported operating systems](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r640)
- [Dell KB 000217592: PowerEdge servers certified for VMware vSphere 8.0](https://www.dell.com/support/kbdoc/en-us/000217592/dell-poweredge-servers-certified-for-vmware-vsphere-8-0)
- [Dell: Boot Optimized Server Storage-S1 User's Guide](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf)
- [Broadcom KB 317631: SD card/USB boot device revised guidance](https://knowledge.broadcom.com/external/article/317631)
- [Intel: Xeon E5-2699 v4 specifications](https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html)
- [Intel: Xeon E5-2640 v4 specifications](https://www.intel.com/content/www/us/en/products/sku/92984/intel-xeon-processor-e52640-v4-25m-cache-2-40-ghz/specifications.html)
- [Intel: Xeon Gold 6130 specifications](https://www.intel.com/content/www/us/en/products/sku/120492/intel-xeon-gold-6130-processor-22m-cache-2-10-ghz/specifications.html)
- [Intel: Xeon Gold 6230 specifications](https://www.intel.com/content/www/us/en/products/sku/192437/intel-xeon-gold-6230-processor-27-5m-cache-2-10-ghz/specifications.html)
- [Intel: Xeon Platinum 8280 specifications](https://www.intel.com/content/www/us/en/products/sku/192478/intel-xeon-platinum-8280-processor-38-5m-cache-2-70-ghz/specifications.html)
- [SPEC: SPECpower_ssj2008 result for Dell PowerEdge R630 (E5-2699 v4)](https://spec.org/power_ssj2008/results/res2016q2/power_ssj2008-20160510-00731.html)
- [SPEC: SPECpower_ssj2008 result for Dell PowerEdge R640 (Platinum 8180)](https://spec.org/power_ssj2008/results/res2017q3/power_ssj2008-20170829-00781.html)
- [GitHub: Dell iDRAC fan controller README](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker)
- [dmidecode(8) manual page](https://linux.die.net/man/8/dmidecode)