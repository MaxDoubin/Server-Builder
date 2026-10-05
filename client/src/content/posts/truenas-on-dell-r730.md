
## The short answer

TrueNAS runs well on a Dell R730 or R730xd as long as ZFS sees the physical disks. The safest controller is the Dell HBA330 Mini, which [Dell lists for both servers](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2). A PERC H730 or H330 in HBA mode is documented by Dell and some owners report it working, but TrueNAS's guidance and its forum regulars still prefer a true HBA. Boot from two SATA or SAS SSDs, not a PCIe NVMe adapter, which R730 owners report will not boot, and install TrueNAS Community Edition 25.10, because CORE is no longer in development.

## Why does TrueNAS want direct disk access?

ZFS checksums every block and repairs bad data from its own redundancy, so it needs to talk to each physical disk. The [OpenZFS hardware documentation](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) says "Hardware [RAID](/blog/raid-levels-comparison) controllers should not be used with ZFS": a controller that handles redundancy limits ZFS's chances to self-heal, and a failed one can force you to find the same model.

[TrueNAS's hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) cites "countless warnings against using hardware RAID cards" and says some cards mask disk serial numbers and S.M.A.R.T. data, run slower than HBAs, and risk data loss when a write cache has a dead battery. Its preferred workaround is a card with HBA mode (passthrough or JBOD mode), which can "perform indistinguishably from a standard HBA." Without that mode, a RAID0 volume per disk is "functional when necessary" but not ideal.

The practical test comes from a [TrueNAS community resource](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/): if you cannot get smartctl output for a device, "you DO NOT HAVE A TRUE HBA." The setup steps include that check, and [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware) covers other Dell models.

## Which TrueNAS version should you run in 2026, and what happened to CORE?

Run TrueNAS Community Edition 25.10 on a new build. TrueNAS [renamed SCALE to Community Edition](https://www.truenas.com/blog/truenas-community-edition-release-2504/) in a May 15, 2025 announcement, its [February 4, 2026 plans post](https://www.truenas.com/blog/truenas-plans-for-2026/) calls 25.10 "Goldeye" the recommended version for new deployments, and the [Software Status page](https://www.truenas.com/docs/softwarestatus/) lists 25.10.7 (September 2, 2026) as the General recommendation and 26.0.0-BETA.3 for early adopters.

CORE, the FreeBSD edition, is finished: the status page says it is "no longer under active development" and lists 13.0-U6.8 (July 14, 2025) and 13.3-U1.2 (April 29, 2025) as the latest releases. Leaving CORE means a fresh ISO install and a configuration upload.

That matters here because most forum threads on this topic come from the CORE era, so their driver advice (mrsas, mpr, mps) describes FreeBSD. On Linux, the [megaraid_sas driver](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/megaraid_sas.h) claims the MegaRAID chips behind the H730 and a stock H330 (IDs 0x005d and 0x005f), and [mpt3sas](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/mpt3sas/mpi/mpi2_cnfg.h) claims the plain SAS3008 HBA chip (0x0097). The [PCI ID database](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids) maps the H730 Mini to 0x005d and the H330 Mini to 0x005f.

## Which R730 and R730xd controllers pass disks through?

Only the HBA330 Mini is a plain HBA. The H330, H730 and H730P can act like one in HBA mode, and everything else is RAID-only or external. Dell's [PERC 9 guide](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) says these cards "support two personality modes," RAID and HBA.

<figure>
<img src="/images/blog/truenas-on-dell-r730/lsi-9300-8i-hba.jpg" alt="An LSI SAS 9300-8i host bus adapter card with a heatsink and two mini-SAS HD connectors" width="1200" height="880" loading="lazy" decoding="async">
<figcaption>An LSI SAS 9300-8i host bus adapter. It uses the same SAS3008 controller as Dell's HBA330, which is why both appear under Linux's mpt3sas driver. Photo: Antonio Kless, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_PCI-E_SAS_HBA.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Controller | Chip, cache | Disks to the OS | TrueNAS verdict |
|---|---|---|---|
| PERC S130 | Software RAID | Windows only | No |
| PERC H330 | LSI 3008, none | HBA mode | Acceptable once verified |
| PERC H730 | LSI 3108, 1 GB | HBA mode | Acceptable once verified |
| PERC H730P | LSI 3108, 2 GB | HBA mode | Same as H730 |
| HBA330 Mini | LSI 3008, none | Native HBA | Best choice |
| 12Gb/s SAS HBA | LSI 3008, none | Native HBA | External shelves only |
| PERC H830 | External | RAID | No |

Dell's [R730 technical guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf) (June 2015) lists these controllers but not the HBA330, which appears in Dell's [HBA guide](https://dl.dell.com/topicspdf/dell-sas-hba-12gbps_users-guide_en-us.pdf) beside the external 12Gb/s SAS HBA. The guide simply predates the card, so trust the later firmware page, which lists the R730 and R730xd.

### Can you use the H730 in HBA mode?

Yes, with conditions. Dell documents the switch: press F2 at startup, open Device Settings and the PERC utility, choose Controller Management > Advanced Controller Management > Switch to HBA mode, and reboot after deleting virtual disks, hot spares and foreign configurations. Dell says all disks then "function as non-RAID disks under operating system control," but the controller "does not report SMART errors," so the OS has to.

Owner reports are mixed:

- In 2021 an H730P owner on firmware 25.5.8.0001 [posted full smartctl output](https://www.truenas.com/community/threads/raid-controllers-hba-mode.95368/), serial number included, from Debian.
- On December 16, 2024 an R730xd owner [saw no drives in the SCALE installer](https://forums.truenas.com/t/bare-metal-install-issues/27715) until updating the H730 to firmware 25.5.9.0001; a T330 owner there said the same controller ran "for more than a year flawlessly in HBA mode."
- Against that, [new SATA drives vanished](https://www.truenas.com/community/threads/dell-perc-h730-working-with-sas-not-sata.91878/) behind an H730 on TrueNAS 12, an R730xd owner called [performance poor](https://www.truenas.com/community/threads/replacement-for-perc-h730p.114613/), and [another poster](https://forums.truenas.com/t/bare-metal-install-issues/27715) said HBA mode "is not the same as an HBA."

An iXsystems moderator wrote in 2022 that the H730 ["should be replaced by an HBA330"](https://www.truenas.com/community/threads/are-there-anyone-running-truenas-successfully-here-with-dell-r730xd.104972/) because its FreeBSD driver was less mature, and no source reviewed here compares the Linux driver. Treat an H730 you already own as acceptable once its firmware is current and it passes the smartctl check, with an HBA330 as the fallback.

## Should you flash a PERC to IT mode or buy an HBA330?

Buy the HBA330 Mini. It is the route Dell documents, and it avoids a firmware procedure with no Dell recovery path. Dell's HBA guide describes an 8-port LSI 3008 card with "Non-RAID or pass through mode," no battery or cache, and boot support, and the [firmware page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2) lists 16.17.01.00 (May 18, 2020), marked Urgent because it fixes T10 Protection Information errors under Linux.

Crossflashing is community territory. [fohdeesha's guide](https://fohdeesha.com/docs/perc.html) covers 12th generation H310, H710, H710P and H810 cards, not the H330 or H730, and warns that picking the "closest" firmware will brick the card; it also says iDRAC on those servers can lose drive temperatures after an IT flash and hold the fans near 30%. For the H330 the reports go both ways:

- One owner called flashing an H330 to an HBA330 ["quite easy"](https://forums.truenas.com/t/crossflash-dell-perc-h330-to-it-hba-mode/21039) and ran four drives in RAIDZ1 without errors.
- A [ServeTheHome thread](https://forums.servethehome.com/index.php?threads/crossflash-dell-h330-to-hba330.43573/) shows the catches: record the SAS address with megacli first, and LSI's 16.00.12.00 build fails on the Dell card with "Failed to Validate Mfg Page 2!"
- [Another owner](https://forums.truenas.com/t/dell-hba330-h330-recover-crossflash/5983) could not find the original H330 firmware to go back.

For the H730, TrueNAS's HBA resource calls the idea ["veering off into" "that might not be a good idea"-land](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/), and no source reviewed here shows Dell converting a PERC into an HBA330. Also check what you receive: one buyer's "HBA330" [showed as "PERC H330 mini"](https://www.truenas.com/community/threads/replacement-for-perc-h730p.114613/) in the configuration utility.

### What changes on an R720?

The R720 has no HBA330 option: the firmware page lists no 12th generation server. Dell's technical guide pairs the R720 with H310, H710, H710P and external H810 controllers, and the [PERC 8 guide](https://dl.dell.com/manuals/all-products/esuprt_ser_stor_net/esuprtl_adapters/poweredge-rc-h310_User's%20Guide_en-us.pdf) says "Only the PERC H310 controller allows configuration of disk drives as Non-RAID," so the H710 and H710P are RAID-only. The usual fix is crossflashing an H310 or H710 with fohdeesha's guide, which says stock firmware uses the MegaRAID driver while IT mode uses mpt3sas. Dell's comparison also lists DDR3, E5-2600 v2 and USB 2.0 for the R720 against DDR4, v3 and USB 3.0 for the R730.

## Where should the boot pool go on a 13th generation Dell?

Put it on two 2.5-inch SATA or SAS SSDs behind the HBA. On an R730xd the optional rear bays are the natural home: a TrueNAS moderator told one buyer ["You can use the rear-mounted 2.5" bays for your boot device."](https://www.truenas.com/community/threads/ready-to-click-purchase-dell-r730-xd-system-just-need-a-sanity-check.111438/) Without them (see [R730 vs R730xd](/blog/dell-r730-vs-r730xd)), use a front bay or an onboard SATA port.

| Boot option | Verdict | Notes |
|---|---|---|
| Rear 2.5-inch bays (R730xd) | Best | Optional; the HBA330 lists boot support |
| Onboard SATA port | Works | One owner [boots from one](https://www.truenas.com/community/threads/are-there-anyone-running-truenas-successfully-here-with-dell-r730xd.104972/) with a slimline power adapter |
| PCIe NVMe or M.2 adapter | Avoid | Dell moderators say the firmware cannot boot them |
| Internal USB or SD module | Avoid | TrueNAS says USB drives and SATA DOMs "vary too widely in quality"; Dell aims the SD module at hypervisors |
| BOSS-S1 card | Unsupported | [Dell's guide](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf) lists no 13th generation server |

Dell's [boot mode paper](https://downloads.dell.com/manuals/common/dellemc-boot-mode-bios-uefi.pdf) says NVMe boot firmware is part of the BIOS "beginning with the 13th generation" and works only in UEFI mode, and its [NVMe guide](https://www.dell.com/support/manuals/en-us/dell-poweredge-exp-fsh-nvme-pcie-ssd/nvme_pcie_ssd_ug/boot-from-an-nvme-pcie-u2-ssd?guid=guid-04daee9b-70bf-4e58-af02-b7e261206dac&lang=en-us) limits booting to "select PowerEdge platforms." Owners report otherwise for third-party adapters: a [Dell moderator replied in 2024](https://www.dell.com/community/en/conversations/poweredge-hardware-general/r730-refuses-to-boot-from-pcie-storage/66b5a8da58ef9a642bc3416f) that "13Gen architecture and firmware have yet to be able to support PCIe M.2 SSD," and a TrueNAS owner's [ASUS adapter](https://www.truenas.com/community/threads/recommended-pcie-to-m-2-nvme-adapter-for-dell-poweredge-r730xd.109483/) worked as storage but was not enumerated at boot. The R730 has no NVMe bays and the [R730xd](https://dl.dell.com/topicspdf/poweredge-r730xd_owners-manual_en-us.pdf) offers up to four (slots 20 to 23). One forum poster says those boot with Dell's U.2 kit, but no Dell source reviewed here confirms it, so use them for pools.

TrueNAS needs a boot device of at least 20 GB, and the installer erases the drive you pick. Install to one SSD, then [attach the second](https://www.truenas.com/docs/scale/25.10/scaletutorials/systemsettings/managebootenvironscale/) under System > Boot > Boot Pool Status to mirror it. Pick BIOS or UEFI first: Dell warns that switching later "may prevent the system from booting."

## How much memory and which network card does it need?

### Memory

TrueNAS wants at least 8 GB of RAM for up to eight drives, plus 1 GB for each drive after eight, and 16 GB or more (32 GB or more is optimal) for iSCSI or VM storage. A 12-drive R730xd works out to a 12 GB floor. Skip deduplication (about 5 GB per TB) and L2ARC (about 1 GB per 50 GB) without a reason; [ZFS Caching: ARC, L2ARC, and the SLOG Misunderstanding](/blog/zfs-arc-l2arc-tuning) explains what extra RAM does.

The R730 has 24 DIMM slots, 12 per processor in four channels, and takes only DDR4 RDIMMs or LRDIMMs, up to 768 GB. Dell's [R730 manual](https://dl.dell.com/topicspdf/poweredge-r730-dsms_owners-manual_en-us.pdf) says to populate one DIMM per channel (four modules) per processor first, keep both processors identical, and leave memory mode on the default Optimizer setting, because mirror mode halves usable memory. PCIe slots 1 to 4 need a second CPU, but a TrueNAS moderator advises against [filling the second socket](https://www.truenas.com/community/threads/feedback-on-used-hardware-choice-dell-r730.98829/) "unless it's necessary for PCIe slot activation or DIMMs."

### Networking

Dell's guide lists network daughter cards built on Intel X520, X540 and X710, QLogic 57840S and Broadcom 5720 controllers. TrueNAS's hardware guide says "Intel and Chelsio interfaces are the best-supported options" and prefers one faster interface (10/25/40/100GbE) to aggregating slower ones. Choose an Intel X520 or X710 NDC if you can, or an Intel or Chelsio card in a PCIe slot.

## Why are the fans loud after adding a card?

Dell's 13th generation servers add a fan response when you install a third-party PCIe card. Dell's [knowledge base article](https://www.dell.com/support/kbdoc/en-us/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers) says the default response "provisions airflow based on common industry card requirements" and targets "a maximum of 55C inlet air to the PCIe card region." To turn it off over IPMI (IPMI over LAN enabled in iDRAC, Administrator account), run the first command below; the second checks the state, and the output `16 05 00 00 00 05 00 01 00 00` means disabled.

```bash
ipmitool -I lanplus -H IDRAC_IP -U IDRAC_USER -P IDRAC_PASSWORD raw 0x30 0xce 0x00 0x16 0x05 0x00 0x00 0x00 0x05 0x00 0x01 0x00 0x00
ipmitool -I lanplus -H IDRAC_IP -U IDRAC_USER -P IDRAC_PASSWORD raw 0x30 0xce 0x01 0x16 0x05 0x00 0x00 0x00
```

The [RACADM guide](https://dl.dell.com/topicspdf/idrac7-8-lifecycle-controller-v2404040_reference-guide_en-us.pdf) lists the same switch as ThirdPartyPCIFanResponse, enabled by default. Dell says disabling it "only removes the fan response associated with the addition of a third-party PCIe card and does not compromise original thermal algorithm-based cooling needs," and that fans already high for other reasons "may have no effect." Watch the card's temperature afterward. For fan curves and other noise fixes, see [quieting R730 fans](/blog/dell-r730-quiet-fans).

## Parts list and step-by-step setup

### Parts

| Part | Pick |
|---|---|
| Controller | Dell HBA330 Mini (or an H730 in HBA mode on firmware 25.5.9.0001) |
| Boot | Two 2.5-inch SATA or SAS SSDs, 20 GB or more |
| Memory | Matched DDR4 RDIMMs, 16 GB or more (32 GB for VMs or iSCSI) |
| Network | Intel X520 or X710 NDC, or an Intel or Chelsio card |

### Steps

1. Update iDRAC, BIOS and controller firmware. [Dell's H730 page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=700gg) lists 25.5.9.0001 (A17, March 5, 2024) for the R730 and R730xd.
2. HBA330 Mini: nothing to configure. H730: press F2, open Device Settings and the PERC utility, choose Switch to HBA mode, and reboot.
3. In System Setup, set Boot Settings to BIOS or UEFI, and leave Embedded SATA on AHCI (the default) if the boot SSDs use onboard ports.
4. Write the ISO to a USB stick. The [install guide](https://www.truenas.com/docs/scale/gettingstarted/install/installingscale/) uses `dd status=progress if=path/to/.iso of=path/to/USB` and suggests `lsblk -po +vendor,model` to find the stick.
5. Boot the installer, select the boot SSD, confirm the erase, choose "Administrative user (truenas_admin)" and set a password. The guide's wording for the last prompt is confusing (Yes allows UEFI boot, No is for legacy BIOS hardware), so match your BIOS mode.
6. Boot TrueNAS, attach the second SSD to the boot pool, then run these checks in the shell:

```bash
lspci -nnk | grep -i -A3 "serial attached\|raid"
lsblk -d -o NAME,MODEL,SERIAL,SIZE
sudo smartctl -a /dev/sda
```

An HBA330 should show the SAS3008 device `[1000:0097]` with `Kernel driver in use: mpt3sas`; an H730 in HBA mode shows `[1000:005d]` with `megaraid_sas`. Either way, `lsblk` should list each drive's own model and serial, and smartctl should print a full health report. A controller name instead of a drive model, or a smartctl failure, means the disks are not passed through.

Then create the pool, schedule scrubs and SMART tests, and save the configuration file.

## What breaks

**The installer or TrueNAS shows no disks, or only some.** Old PERC firmware, leftover virtual disks or RAID mode can hide drives; one R730xd owner's stayed invisible until firmware 25.5.9.0001. Fix: update the firmware, delete virtual disks, switch to HBA mode, reboot, and try an HBA330 if SATA drives still vanish.

**The installer fails with write errors on every drive.** A bad HBA, cabling or the backplane can cause it; one R730xd owner with an HBA330 Mini [saw cascading failures](https://www.truenas.com/community/threads/beginner-truenas-will-not-install-on-r730xd.96633/) and a moderator suspected the HBA. Fix: run the lspci check, reseat the cables, and test a known-good drive.

**The R730 will not boot from the NVMe adapter.** Reports say 13th generation firmware does not boot third-party PCIe M.2 adapters. Fix: boot from SATA or SAS SSDs and use NVMe for pools.

**The fans run high after adding a card.** The third-party PCIe cooling response is active. Fix: apply Dell's ipmitool setting.

**A crossflash leaves the card dead.** The reports above trace it to wrong firmware, a missing SAS address record or no original firmware to revert to. Fix: use a guide written for your exact card, record the SAS address first, or buy an HBA330 Mini.

## Frequently asked questions

### Is the HBA330 better than an H730 in HBA mode?

For TrueNAS, yes. It is a plain HBA with no cache or RAID firmware, Dell lists it for the R730, and the iXsystems moderator quoted above recommends it over the H730.

### Can TrueNAS boot from NVMe on an R730?

Not reliably. Dell says NVMe boot exists from the 13th generation on select platforms in UEFI mode, but Dell moderators say the R730 cannot boot PCIe M.2 SSDs. Use SATA or SAS boot SSDs.

### Does the R730 support PCIe bifurcation?

Yes. Dell's manual documents per-slot bifurcation: x16 slots can run x16, x8x8 or x4x4x4x4, and x8 slots x8 or x4x4. One owner of an R720, R730 and R730xd reports the R720 lacks it and runs a two-drive NVMe card in an R730.

## What this means

For a new 13th generation build, buy an R730xd with a Dell HBA330 Mini, two small SATA SSDs in the rear bays as a mirrored boot pool, matched DDR4 RDIMMs and an Intel 10GbE NDC, then install Community Edition 25.10. If you already own an H730, switch it to HBA mode on current firmware and prove it with smartctl. Reserve crossflashing for cards a widely used guide covers, such as the R720's H310 and H710.

## References

- [OpenZFS documentation: Hardware](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [TrueNAS Hardware Guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/)
- [TrueNAS community resource: What's all the noise about HBAs, and why can't I use a RAID controller?](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/)
- [TrueNAS Software Status](https://www.truenas.com/docs/softwarestatus/)
- [TrueNAS blog: Community Edition release 25.04](https://www.truenas.com/blog/truenas-community-edition-release-2504/)
- [TrueNAS blog: TrueNAS plans for 2026](https://www.truenas.com/blog/truenas-plans-for-2026/)
- [TrueNAS install guide](https://www.truenas.com/docs/scale/gettingstarted/install/installingscale/)
- [TrueNAS 25.10 boot pool management](https://www.truenas.com/docs/scale/25.10/scaletutorials/systemsettings/managebootenvironscale/)
- [Dell PERC 9 User's Guide (H330, H730, H830)](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf)
- [Dell HBA User's Guide: HBA330 and External 12 Gbps SAS HBA](https://dl.dell.com/topicspdf/dell-sas-hba-12gbps_users-guide_en-us.pdf)
- [Dell PowerEdge R730 and R730xd Technical Guide, version 1.7](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf)
- [Dell PowerEdge R730 Owner's Manual](https://dl.dell.com/topicspdf/poweredge-r730-dsms_owners-manual_en-us.pdf)
- [Dell PowerEdge R730xd Owner's Manual](https://dl.dell.com/topicspdf/poweredge-r730xd_owners-manual_en-us.pdf)
- [Dell PERC H730, H730P, H830 firmware 25.5.9.0001](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=700gg)
- [Dell HBA330 Mini firmware 16.17.01.00](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2)
- [Dell KB: How to disable the third-party PCIe card default cooling response on 13G servers](https://www.dell.com/support/kbdoc/en-us/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers)
- [Dell iDRAC7 and iDRAC8 RACADM CLI Reference Guide](https://dl.dell.com/topicspdf/idrac7-8-lifecycle-controller-v2404040_reference-guide_en-us.pdf)
- [Dell: Boot Mode Considerations, BIOS vs. UEFI](https://downloads.dell.com/manuals/common/dellemc-boot-mode-bios-uefi.pdf)
- [Dell Express Flash NVMe PCIe SSD User's Guide: Boot from an NVMe PCIe U.2 SSD](https://www.dell.com/support/manuals/en-us/dell-poweredge-exp-fsh-nvme-pcie-ssd/nvme_pcie_ssd_ug/boot-from-an-nvme-pcie-u2-ssd?guid=guid-04daee9b-70bf-4e58-af02-b7e261206dac&lang=en-us)
- [Dell PERC H310, H710, H710P and H810 User's Guide](https://dl.dell.com/manuals/all-products/esuprt_ser_stor_net/esuprtl_adapters/poweredge-rc-h310_User's%20Guide_en-us.pdf)
- [Dell BOSS-S1 User's Guide](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf)
- [Dell Community: R730 refuses to boot from PCIe storage](https://www.dell.com/community/en/conversations/poweredge-hardware-general/r730-refuses-to-boot-from-pcie-storage/66b5a8da58ef9a642bc3416f)
- [fohdeesha: PERC H310, H710, H710P and H810 IT crossflashing](https://fohdeesha.com/docs/perc.html)
- [ServeTheHome forums: Crossflash Dell H330 to HBA330](https://forums.servethehome.com/index.php?threads/crossflash-dell-h330-to-hba330.43573/)
- [TrueNAS forums: Crossflash Dell PERC H330 to IT / HBA mode](https://forums.truenas.com/t/crossflash-dell-perc-h330-to-it-hba-mode/21039)
- [TrueNAS forums: Dell HBA330 to H330 recover crossflash](https://forums.truenas.com/t/dell-hba330-h330-recover-crossflash/5983)
- [TrueNAS forums: Bare metal install issues](https://forums.truenas.com/t/bare-metal-install-issues/27715)
- [TrueNAS community: Dell PERC H730 working with SAS, not SATA](https://www.truenas.com/community/threads/dell-perc-h730-working-with-sas-not-sata.91878/)
- [TrueNAS community: RAID controllers HBA mode](https://www.truenas.com/community/threads/raid-controllers-hba-mode.95368/)
- [TrueNAS community: Replacement for PERC H730p](https://www.truenas.com/community/threads/replacement-for-perc-h730p.114613/)
- [TrueNAS community: Are there anyone running TrueNAS successfully here with Dell R730XD?](https://www.truenas.com/community/threads/are-there-anyone-running-truenas-successfully-here-with-dell-r730xd.104972/)
- [TrueNAS community: Ready to click purchase (Dell R730-XD system)](https://www.truenas.com/community/threads/ready-to-click-purchase-dell-r730-xd-system-just-need-a-sanity-check.111438/)
- [TrueNAS community: Feedback on used hardware choice (Dell R730)](https://www.truenas.com/community/threads/feedback-on-used-hardware-choice-dell-r730.98829/)
- [TrueNAS community: Recommended PCIe to M.2 NVMe adapter for Dell PowerEdge R730xd](https://www.truenas.com/community/threads/recommended-pcie-to-m-2-nvme-adapter-for-dell-poweredge-r730xd.109483/)
- [TrueNAS community: TrueNAS will not install on R730XD (beginner thread)](https://www.truenas.com/community/threads/beginner-truenas-will-not-install-on-r730xd.96633/)
- [Linux kernel: megaraid_sas.h](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/megaraid_sas.h)
- [Linux kernel: mpi2_cnfg.h (mpt3sas)](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/mpt3sas/mpi/mpi2_cnfg.h)
- [PCI ID database (pci.ids)](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids)
