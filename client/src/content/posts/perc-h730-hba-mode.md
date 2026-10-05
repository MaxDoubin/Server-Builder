
## The short answer

On a PERC H730, H730P or H330, HBA mode is a [Dell-documented setting](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) that removes virtual disks and hands every drive to the operating system; you enable it from System Setup or iDRAC after deleting the arrays, then reboot. The card still enumerates as a MegaRAID controller and uses `megaraid_sas`, so it is not a Dell HBA330, which runs IT-style firmware with `mpt3sas`. Owners report working SMART data and ZFS pools, and the [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) accepts the mode as a fallback, but OpenZFS, Proxmox and TrueNAS forum regulars prefer a true HBA. The H730 has no published crossflash path like the 12th generation H310 and H710, so the clean upgrade is an HBA330 Mini in the same slot.

## What does HBA mode do on the PERC H730, H730P and H330?

HBA mode removes the virtual-disk layer and leaves the same controller, firmware family and driver in place. Dell's [PERC 9 guide](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) says the series supports "two personality modes." [RAID](/blog/raid-levels-comparison) mode, the factory default, allows virtual disks and non-RAID disks. HBA mode "does not contain virtual disks or the ability to create them," and "all physical disks function as non-RAID disks under operating system control."

<figure>
<img src="/images/blog/perc-h730-hba-mode/sas-backplane.jpg" alt="The back of a disk backplane with an SFF-8643 SAS connector" width="1200" height="877" loading="lazy" decoding="async">
<figcaption>The back of a Supermicro disk backplane with an SFF-8643 SAS connector. In HBA mode, every drive behind the controller reaches the operating system as its own disk. Photo: Dmitry Nosachev, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Supermicro_BPN-SAS3-213A_disk_backplane_(back_view,_SFF-8643_connector).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Dell adds that HBA mode lets the operating system control backplane LEDs on supported systems, and that "SMART monitoring is disabled" on the controller. The mode dates to at least [firmware 25.5.0.0018](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=2h45f) (October 31, 2016), which fixes a bug after "converting PERC personality mode to HBA."

The table sets RAID mode beside Dell's documentation and owner reports.

| | RAID mode (default) | HBA mode, per Dell | HBA mode, per owners |
|---|---|---|---|
| Drives the OS sees | Virtual disks, plus any non-RAID disks | All physical disks act as non-RAID disks | Each drive shows its own model and serial on [Debian and TrueNAS CORE](https://www.truenas.com/community/threads/raid-controllers-hba-mode.95368/) |
| Driver | `megaraid_sas` | Unchanged: Dell's [PERC 9 Linux steps](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) use `megaraid_sas` | An [H730 owner's lspci](https://forums.truenas.com/t/bare-metal-install-issues/27715) names a "MegaRAID SAS-3 3108" |
| SMART | Read with [`smartctl -d megaraid,N`](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html) | The controller "does not report SMART errors" | Plain `smartctl --all /dev/sdd` printed a full SAS report |
| Cache | Policy set per virtual disk | Not stated | One reply says HBA mode ["deactivates all caches and the BBU"](https://forum.proxmox.com/threads/new-proxmox-box-w-zfs-r730xd-w-perc-h730-mini-in-%E2%80%9Chba-mode%E2%80%9D-big-no-no.135642/) |

The H330 has no cache ("H330 does not support caching"), so cache questions apply to the H730 and H730P. Dell's SMART note describes the controller's own monitoring, while owners read drives from the OS, so run SMART checks there. HBA mode is all or nothing: for a hardware RAID 1 boot mirror beside pass-through data disks, stay in RAID mode and convert the data disks to non-RAID.

## How do you switch a PERC H730 to HBA mode?

Delete every virtual disk, choose Switch to HBA mode in System Setup or iDRAC, and reboot. Dell's [prerequisites](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) also require removing hot spares, foreign configurations, failed disks and any local security key for self-encrypting drives.

1. Back up everything on the controller's virtual disks, because deleting them destroys the arrays.
2. Update the PERC firmware first. Dell's [25.5.9.0001 package](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=700gg) (A17, March 5, 2024) lists the R730 and R730xd.
3. Press F2 at boot for System Setup, choose Device Settings, then Dell PERC 9 Configuration Utility.
4. Delete the virtual disks under Virtual Disk Management, or use Configuration Management > Clear Configuration, then confirm no hot spares, foreign configurations or failed disks remain.
5. Choose Controller Management > Advanced Controller Management > Switch to HBA mode and confirm with OK and Yes.
6. Reboot. Dell says "You must reboot the system for the change to be effected."

iDRAC8 can stage the same change on "PERC 9.1 and later controllers": open Overview > Storage > Controllers, click Setup > Controller Mode, choose HBA and click Apply. [Dell's iDRAC8 guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf) also gives these RACADM commands, where CONTROLLER_FQDD is the controller's fully qualified device descriptor:

```bash
racadm get Storage.Controller.1.RequestedControllerMode[key=CONTROLLER_FQDD]
racadm set Storage.Controller.1.RequestedControllerMode HBA [Key=CONTROLLER_FQDD]
```

Dell calls this "a staged operation" that "does not occur in real time," so reboot to apply it, and the controller must have no preserved cache. The Ctrl+R utility has a Personality Mode option, but Dell gives no steps for it. To go back, choose Switch to RAID mode; the disks "retain their non-RAID status until converted to Unconfigured Good."

Verify from Linux before you build a pool:

```bash
lspci | grep -i -E "megaraid|fusion-mpt"
lsblk -d -o NAME,MODEL,SERIAL,SIZE
sudo smartctl -i /dev/sda
```

Correct output is a controller line, one `lsblk` row per physical drive with the maker's model and serial, and drive-level `smartctl` fields such as the SEAGATE ST1200MM0099 in an owner's report. A controller name where a drive model belongs is a virtual disk, which fails [jgreco's test](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/) that you must "see the type of device." Per [pci.ids](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids), the controller IDs are `1000:005d` (H730, H730P), `1000:005f` (H330) and `1000:0097` (HBA330).

## Can you flash a PERC H730 to IT mode like an H710?

No supported procedure exists, and the popular crossflash guide does not cover the card. IT mode is separate LSI firmware that, per the [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/), disables "the optional RAID functionality found in the IR firmware"; HBA mode is a switch inside Dell's RAID firmware. The [guide at fohdeesha.com](https://fohdeesha.com/docs/perc.html) is titled "H310/H710/H710P/H810 Mini & Full Size IT Crossflashing" and covers "12th gen Dell Mini Mono & full size cards," with nothing from the 13th generation.

Chip IDs below come from [pci.ids](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids) and the guide's own output.

| Card | Generation | LSI chip (PCI ID) | Crossflash status |
|---|---|---|---|
| PERC H310 | 12th | SAS2008 (1000:0073) | In the guide; [ends as SAS9211-8i IT](https://fohdeesha.com/docs/H310.html), firmware 20.00.07.00 |
| PERC H710, H710P | 12th | SAS2208 (1000:005b) | In the guide; [reports as SAS2308](https://fohdeesha.com/docs/H710-D1.html), firmware 20.00.07.00 |
| PERC H330 | 13th | SAS3008 (1000:005f) | Not in the guide; owner guides flash Dell's HBA330 image |
| PERC H730, H730P | 13th | SAS3108 (1000:005d) | Not in the guide; no IT path in the pages reviewed here |

The 12th generation method replaces the Dell flash with LSI IT firmware, so the card moves from the MegaRAID driver to "the much simpler mpt3sas driver." The guide also warns that iDRAC may then lose drive temperatures and, in some cases, hold the fans near 30 percent.

The H330 is the exception. It shares the SAS3008 chip with the HBA330, and an [owner-written GitHub guide](https://github.com/TubalQ/h330-hba330-it-crossflash) flashes Dell's own `hba330.fw` onto an H330 to get the Dell identity 1028:1f45. Dell does not support that.

The H730 has no such route. Its chip is a [3108 RAID-on-chip](https://docs.broadcom.com/doc/LSISAS3108) with a DDR3 cache interface rather than an I/O controller, and none of the Dell, Broadcom or fohdeesha pages reviewed here describe an IT path for it. TrueNAS's [jgreco](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/) calls IT-mode conversion of high-end RAID cards "theoretically possible" but warns of "additional components such as cache, flash, and battery circuits that the IT firmware doesn't expect to be there." Dell supports only "Dell certified firmware" on a PERC, so every crossflash is unsupported.

One 2025 [blog post](https://errantminds.net/servers-it/the-dell-h730-minis-hba-mode-is-not-what-you-think/) calls the 3108 "physically INCAPABLE of IT mode" while labeling itself speculation. LSI's brief lists an Integrated RAID personality for the chip, and the kernel's `mpt3sas` carries [Fusion-MPT IDs for a 3108](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/mpt3sas/mpt3sas_scsih.c), so the claim that it is impossible is not documented either. Still, do not borrow another card's guide: fohdeesha warns that picking the closest option means "you'll brick your card."

## What is the Dell HBA330 and why do ZFS guides recommend it?

The HBA330 is Dell's plain SAS host bus adapter: the same LSI SAS3008 chip as the LSI 9300-8i, with no RAID, no cache, no battery and the `mpt3sas` driver. Dell's [HBA guide](https://dl.dell.com/topicspdf/dell-sas-hba-12gbps_users-guide_en-us.pdf) lists it in adapter and mini monolithic forms with an "LSI 3008 chipset" and pass-through support. A TrueNAS forum post calls it ["a Broadcom SAS3008 with trivially-customized IT mode firmware,"](https://forums.truenas.com/t/dell-hba330-which-underlying-lsi-firmware/3159) and Broadcom's [9300-8i guide](https://docs.broadcom.com/doc/12354877) names the same SAS 3008 controller.

<figure>
<img src="/images/blog/perc-h730-hba-mode/lsi-hba.jpg" alt="An LSI PCI Express SAS host bus adapter card" width="1200" height="880" loading="lazy" decoding="async">
<figcaption>An LSI SAS host bus adapter. The HBA330 is Dell's card of this kind: an LSI SAS3008 chip with no RAID, cache or battery, run by the mpt3sas driver. Photo: Antonio Kless, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_PCI-E_SAS_HBA.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The Mini fits where the H730 Mini sits: both Dell guides describe the same "storage-controller card holder on the system board," and the [HBA330 Mini firmware page](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2) lists the R730 and R730xd. That package is 16.17.01.00 (May 18, 2020), marked urgent for Linux because it fixes T10 Protection Information errors. Unlike a PERC flashed with generic LSI firmware, the HBA330 is a card iDRAC supports: Dell's iDRAC8 guide lists the "HBA330 internal controller" among the non-RAID controllers it monitors, including SMART trip status and LED blinking.

ZFS guides recommend it because it matches what OpenZFS asks of a controller: [driver support, stability and no need for "RAID, Battery Backup Units and hardware write caches."](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) The table compares the four cards using Dell's figures.

| | PERC H330 | PERC H730 | PERC H730P | Dell HBA330 |
|---|---|---|---|---|
| Chip (Dell) | LSI 3008 | LSI 3108 | LSI 3108 | LSI 3008 |
| Linux driver | `megaraid_sas` | `megaraid_sas` | `megaraid_sas` | `mpt3sas` |
| Cache and battery | None | 1 GB NV, battery | 2 GB NV, battery | None |
| RAID levels | 0, 1, 5, 10, 50 | 0, 1, 5, 6, 10, 50, 60 | 0, 1, 5, 6, 10, 50, 60 | None |
| Pass-through | HBA mode or non-RAID disks | HBA mode or non-RAID disks | HBA mode or non-RAID disks | Always |
| Controller SMART monitoring | Disabled in HBA mode | Disabled in HBA mode | Disabled in HBA mode | Real-time, via iDRAC |
| Queue depth | 895 | 928 | 928 | 9548 |

## What do TrueNAS, ZFS, Proxmox and Unraid say about RAID controllers?

TrueNAS and Unraid both accept a RAID card's HBA mode, while OpenZFS and Proxmox point toward a true HBA. The [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) says "You can use a hardware RAID card if it is all you have, but there are limitations," and "do not use their RAID facility if your hardware RAID card supports HBA mode, also known as passthrough or JBOD mode." In that mode it "allows it to perform indistinguishably from a standard HBA."

<figure>
<img src="/images/blog/perc-h730-hba-mode/lsi-9207.jpg" alt="An LSI 9207-4i4e SAS host bus adapter with internal and external ports" width="1200" height="638" loading="lazy" decoding="async">
<figcaption>An LSI 9207-4i4e, an IT-mode host bus adapter of the kind OpenZFS and Proxmox point to instead of a RAID controller. Photo: Dmitry Nosachev, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_9207-4i4e_PCI-E_SAS_HBA.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The same guide warns that some RAID cards "Mask disk serial number and S.M.A.R.T. health information" and "Cause data loss if using a write cache with a dead battery backup unit (BBU)." [Unraid](https://docs.unraid.net/unraid-os/troubleshooting/faq/) says to set the controller to "HBA/IT mode, not RAID mode."

[OpenZFS](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) is blunter: "Hardware RAID controllers should not be used with ZFS." [Proxmox VE](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html) says "Do not use ZFS on top of a hardware RAID controller which has its own cache management," and calls an HBA or a controller flashed to IT mode "more appropriate."

TrueNAS forum veterans go further. jgreco's resource says a RAID controller's JBOD or HBA mode "isn't the same" as an HBA because "you are relying on the RAID card driver," and that a working smartctl is "not any sort of proof." In 2021 [HoneyBadger wrote](https://www.truenas.com/community/threads/raid-controllers-hba-mode.95368/) that FreeBSD's `mrsas` driver, which he believed an H730 uses in HBA mode, is less well-tested than the HBA drivers but "mostly okay." In 2025 [Protopia replied](https://forums.truenas.com/t/running-truenas-on-dell-r730-with-perc-h730-in-hba-mode-via-proxmox/43926) that it "works just fine until it doesn't."

### Verdict on HBA mode for ZFS

HBA mode on an H730 is a reasonable fallback, not a first choice. For it: Dell documents pass-through with no virtual disks, owners get serial numbers and SMART through, `megaraid_sas` is in the [mainline kernel](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/Kconfig.megaraid) and [claims the H730's PCI ID](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/megaraid_sas.h), and one owner reported [more than a year of flawless use](https://forums.truenas.com/t/bare-metal-install-issues/27715) on TrueNAS SCALE in December 2024.

Against it: the firmware is still RAID firmware, which OpenZFS counts as a layer "that cannot be inspected by arbitrary third parties." Dell does not say what the cache does in this mode, and its driver list stops at RHEL 7.2, SLES 12 and Windows Server 2016, so TrueNAS and Proxmox rely on the in-kernel driver. Use HBA mode with redundancy and backups, and replace the card for data you cannot recreate. The full R730 build is in [TrueNAS on a Dell R730](/blog/truenas-on-dell-r730), and pool layout is in [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware).

## PERC H730 vs H730P: what do the extra cache and battery change?

The H730P has 2 GB of non-volatile cache and the H730 has 1 GB; the rest that matters here is the same. Dell's [H730P spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/PowerEdge-RAID-Controller-H730P-Spec-Sheet.pdf) calls it a "Doubling of NV Cache from 1GB to 2GB," and both use the LSI SAS 3108 with RAID 0, 1, 5, 6, 10, 50 and 60. The [R730 technical guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf) adds that two-controller systems need "both controllers" to be H730P. Dell's documents disagree on the H730's cache speed: its [spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-Poweredge-RAID-Controller-H730.pdf) says 1333 MT/s and the technical guide says 1866 MT/s.

Both Mini cards carry a battery. Dell's guide shows a battery cable and carrier on the "H730/H730P mini monolithic card," and says the battery supplies "a small amount of power" to move cache contents to flash after a power loss. The firmware runs a learn cycle every 90 days, and keeps running them on reboot while the battery is marked failed. The [same guide](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf) has replacement steps for the H730P Mini battery.

In HBA mode neither extra matters for your data as far as Dell documents: write-back and write-through policies belong to virtual disks, and HBA mode has none. Do not pay extra for a P card to run ZFS. If you return to RAID mode, replace a failed battery first.

## What breaks

**The installer or boot menu shows no drives after you switch.** One owner set HBA mode in the BIOS and iDRAC, and the TrueNAS SCALE installer still listed no drives until they [updated the H730 to 25.5.9.0001](https://forums.truenas.com/t/bare-metal-install-issues/27715). Fix: update the PERC firmware before switching, confirm the disks list as non-RAID in the PERC utility, and keep Enable Controller BIOS on if you boot from a controller-attached disk, since Dell says "If the boot device is on the RAID controller, the BIOS must be enabled."

**Single-drive RAID 0 "passthrough" looks right and is not.** TrueNAS tolerates it only for cards with no HBA mode. OpenZFS calls it "not recommended" and warns that when one of several arrays on a controller fails, the identifiers the OS sees "might become inconsistent," which can fault pools imported from the cachefile. Fix: use the H730's HBA mode, or swap in an HBA330.

**Predictive-failure warnings from the controller stop.** The guide says the controller "does not report SMART errors" in HBA mode. Fix: run SMART tests and alerts in the OS, as in [reading SMART data](/blog/smart-data-drive-failure).

**TrueNAS CORE shows 150 MB/s for every disk behind the H730.** On FreeBSD-based CORE, owners [saw "150.000MB/s transfers"](https://www.truenas.com/community/threads/dell-pe-r730xd-and-h730-hba-mode-only-showing-150-00-transfer-mode.87303/) for each drive, against about 1200 MB/s on an HBA330 and a flashed H330. A forum regular called it cosmetic, but one R630 and H730P owner reported reads limited to 150 MB/s that Debian with ZFS did not show. Fix: judge by measured throughput, test on Linux, or swap in an HBA330 Mini, as that regular advised.

**Passing disks, or the whole controller, into a TrueNAS VM goes wrong.** A TrueNAS forum reply warns that Proxmox "will happily import that pool if it feels like it" when disks are passed individually, so pass the whole controller and blacklist it on the host. On an R730xd ([bays compared here](/blog/dell-r730-vs-r730xd)) one owner [found the rear flex-bay cable led to the same HBA330](https://forum.proxmox.com/threads/proxmox-ve-8-3-hba-passthrough-issue-on-r730xd.159587/), so the host's boot drives went with it. Fix: boot the host from elsewhere; that owner rerouted the flex-bay cable to a motherboard SAS port and reported passthrough then worked.

## Frequently asked questions

### Can I flash a PERC H730 to IT mode?

No Dell-supported procedure exists, and the crossflash guide covers only the 12th generation. For IT-style firmware, buy an HBA330 Mini, or flash an H330 as an unsupported owner procedure.

### What is the difference between HBA mode and RAID mode on a PERC?

In RAID mode, the factory default, the card builds virtual disks and can also expose non-RAID disks. In HBA mode no virtual disks can exist, every drive is non-RAID, the OS controls the backplane LEDs and the controller's SMART monitoring is off. A [Dell Community reply](https://www.dell.com/community/en/conversations/rack-servers/perc-h730-raid-or-hba-mode/647f9f85f4ccf8a8de45b1b1) says HBA mode and non-RAID disks in RAID mode have "the same access to the OS," and Dell documents no data-path difference, so choose HBA mode for ZFS because the card then cannot hold a stray virtual disk.

### Is the HBA330 the same as an H330?

Same chip, different firmware. Dell gives both an LSI 3008 chipset, but the H330 runs MegaRAID firmware on `megaraid_sas` with a queue depth of 895, while the HBA330 runs "Non-RAID" firmware on `mpt3sas` with 9548. Owners flash H330s into HBA330s, which Dell does not support.

### Does the H730P battery matter in HBA mode?

Dell ties write-back caching to virtual disks, which HBA mode lacks, so the battery matters for your data mainly in RAID mode. One forum reply says HBA mode deactivates the cache and the BBU.

## What this means

If an R730 already has an H730 or H730P Mini, update the firmware, back up and delete the virtual disks, switch to HBA mode, verify with `smartctl`, and monitor SMART from the OS. That is a documented setup for a redundant pool with backups. If you are buying parts or the data is irreplaceable, swap in an HBA330 Mini: same slot, the same chip family as the 9300 HBAs [TrueNAS names](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/), Dell-published firmware and no RAID layer to wonder about. Skip IT-flashing an H730, since no procedure is published, and treat the H330-to-HBA330 flash as an owner procedure.

## References

- [Dell PowerEdge RAID Controller 9 User's Guide H330, H730 and H830, Rev. A08](https://dl.dell.com/topicspdf/poweredge-rc-h330_users-guide_en-us.pdf)
- [Dell EMC Host Bus Adapter User's Guide, HBA330 and External 12 Gbps SAS HBA, Rev. A04](https://dl.dell.com/topicspdf/dell-sas-hba-12gbps_users-guide_en-us.pdf)
- [Dell Integrated Dell Remote Access Controller 8 Version 2.75.75.75 User's Guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf)
- [Dell PowerEdge RAID Controller H730 spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-Poweredge-RAID-Controller-H730.pdf)
- [Dell PowerEdge RAID Controller H730P spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/PowerEdge-RAID-Controller-H730P-Spec-Sheet.pdf)
- [Dell PowerEdge R730 and R730xd Technical Guide v1.7](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf)
- [Dell PERC H730/H730P/H830 firmware 25.5.9.0001](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=700gg)
- [Dell PERC H730/H730P/H830 firmware 25.5.0.0018](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=2h45f)
- [Dell HBA330 Mini firmware 16.17.01.00](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=124x2)
- [Dell Community: PERC h730 RAID or HBA mode](https://www.dell.com/community/en/conversations/rack-servers/perc-h730-raid-or-hba-mode/647f9f85f4ccf8a8de45b1b1)
- [fohdeesha: H310/H710/H710P/H810 Mini and Full Size IT Crossflashing](https://fohdeesha.com/docs/perc.html)
- [fohdeesha: H310 Mini IT mode flashing](https://fohdeesha.com/docs/H310.html)
- [fohdeesha: H710 D1 IT mode flashing](https://fohdeesha.com/docs/H710-D1.html)
- [LSI SAS 3108 product brief](https://docs.broadcom.com/doc/LSISAS3108)
- [LSI SAS 9300-8i Host Bus Adapter User Guide](https://docs.broadcom.com/doc/12354877)
- [pci.ids database of PCI vendors and devices](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids)
- [Linux kernel megaraid_sas.h PCI device IDs](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/megaraid_sas.h)
- [Linux kernel mpt3sas_scsih.c PCI device table](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/mpt3sas/mpt3sas_scsih.c)
- [Linux kernel Kconfig for megaraid_sas](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/megaraid/Kconfig.megaraid)
- [TrueNAS Hardware Guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/)
- [OpenZFS documentation: Hardware](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [Proxmox VE Administration Guide: ZFS on Linux](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html)
- [Unraid documentation: FAQ](https://docs.unraid.net/unraid-os/troubleshooting/faq/)
- [smartctl(8) manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html)
- [jgreco: What's all the noise about HBAs, and why can't I use a RAID controller?](https://www.truenas.com/community/resources/whats-all-the-noise-about-hbas-and-why-cant-i-use-a-raid-controller.139/)
- [TrueNAS forum: RAID controllers HBA mode](https://www.truenas.com/community/threads/raid-controllers-hba-mode.95368/)
- [TrueNAS forum: Bare Metal Install Issues](https://forums.truenas.com/t/bare-metal-install-issues/27715)
- [TrueNAS forum: Running TrueNAS on Dell r730 with PERC H730 in HBA mode via Proxmox](https://forums.truenas.com/t/running-truenas-on-dell-r730-with-perc-h730-in-hba-mode-via-proxmox/43926)
- [TrueNAS forum: Dell HBA330, which underlying LSI firmware?](https://forums.truenas.com/t/dell-hba330-which-underlying-lsi-firmware/3159)
- [TrueNAS forum: Dell PE R730XD and H730 (HBA mode) only showing 150.00 transfer mode](https://www.truenas.com/community/threads/dell-pe-r730xd-and-h730-hba-mode-only-showing-150-00-transfer-mode.87303/)
- [Proxmox forum: R730xd with PERC H730 Mini in HBA mode, big no no?](https://forum.proxmox.com/threads/new-proxmox-box-w-zfs-r730xd-w-perc-h730-mini-in-%E2%80%9Chba-mode%E2%80%9D-big-no-no.135642/)
- [Proxmox forum: HBA passthrough issue on R730xd](https://forum.proxmox.com/threads/proxmox-ve-8-3-hba-passthrough-issue-on-r730xd.159587/)
- [GitHub: H330 to HBA330 IT-mode crossflash guide](https://github.com/TubalQ/h330-hba330-it-crossflash)
- [The Dell H730 Mini's HBA Mode is Probably Not What You're Looking For (blog post, July 29, 2025)](https://errantminds.net/servers-it/the-dell-h730-minis-hba-mode-is-not-what-you-think/)
