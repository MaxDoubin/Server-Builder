
## The short answer

A Dell BOSS card (Boot Optimized Storage Solution) is a small hardware [RAID](/blog/raid-levels-comparison) 1 controller that mirrors two 80 mm M.2 drives for the operating system, so the front drive bays stay free for data. BOSS-S1 (14G, M.2 SATA, PCIe card, no hot-plug) came first, BOSS-S2 (15G, M.2 SATA, hot-plug carriers) followed, and BOSS-N1 (16G, M.2 NVMe, hot-plug on most versions) is current, with DC-MHS variants on 17G. Dell supports only the M.2 drives it ships, recommends BOSS for boot use only, and the N1 cannot pass its drives through individually.

## What is a Dell BOSS card for?

BOSS gives a PowerEdge a separate, mirrored operating system volume without using hot-swap drive bays. Dell's 2017 tech note says it was [developed for a separate, cost-effective hardware RAID 1 solution for operating system drives](https://dl.dell.com/manuals/all-products/esuprt_solutions_int/esuprt_solutions_int_solutions_resources/servers-solution-resources_white-papers10_en-us.pdf), freeing slots for data. Dell's [R640 technical guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf) lists the cases: a full operating system where the dual SD module would otherwise be used, no wish to trade hot-plug bays for the OS, and data drives in passthrough mode on an HBA.

<figure>
<img src="/images/blog/dell-boss-card/poweredge-r710-servers.jpg" alt="Two Dell PowerEdge R710 servers stacked in a rack, front bezels off" width="1200" height="802" loading="lazy" decoding="async">
<figcaption>PowerEdge R710 servers, from before BOSS existed. A BOSS card gives a server its own pair of M.2 boot drives, so the operating system no longer takes a front drive bay. Photo: Dell Inc., <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R710_servers.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The host sees one disk, which Dell's [deployment KB](https://www.dell.com/support/kbdoc/en-us/000177584/automating-operating-system-deployment-to-dell-boss-techniques-for-different-operating-systems) shows as DELLBOSS VD. S-series cards use the [inbox AHCI driver](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us) and N-series cards the [inbox NVMe driver](https://dl.dell.com/content/manual30863516-dell-boot-optimized-storage-solution-n1-user-s-guide.pdf?language=en-us). Broadcom adds that [OEM vendors agreed to stop supporting SD and USB boot devices](https://knowledge.broadcom.com/external/article?legacyId=85685) on platforms such as Sapphire Rapids and Genoa.

Every generation shares one limit: Dell's [S1](https://gfx3.senetic.com/akeneo-catalog/5/9/1/9/591966c81a8012b3627fe196787aa7676d51ca9e_1711209_4XJTD_icecat_multimedia_other_digital_assets_4_en_GB.pdf), S2 and N1 guides recommend BOSS only as an operating system boot device.

## BOSS-S1, BOSS-S2 and BOSS-N1 compared

The generations differ mainly in drive type, hot-plug and whether drives can pass through to the operating system.

| | BOSS-S1 | BOSS-S2 | BOSS-N1 | BOSS-N1 DC-MHS |
|---|---|---|---|---|
| Server generation | 14G, some 15G | 15G | 16G | 17G |
| M.2 drives | SATA, 80 mm | SATA, 80 mm | NVMe, 80 mm | NVMe, 80 mm |
| Host link | PCIe 2.0 x2 on an x8 connector | PCIe Gen 2 x4 | PCIe Gen 3 x4 | PCIe Gen 3 x4 |
| Mounting | Low-profile or full-height PCIe card | Rear module, slide-out carriers | Rear module with carriers | Front or rear card with carriers |
| Hot-plug and LEDs | No | Yes | Monolithic only | DC-MHS card only |
| Modes | RAID 1 or passthrough | RAID 1 or passthrough | RAID 1 or one-drive RAID 0 | RAID 1 or one-drive RAID 0 |
| TRIM | Passthrough only | Passthrough only | None | None |
| Rebuild | At boot, or manual | On drive swap | On drive swap | On drive swap |
| Dell-listed drives | Intel S4510, Micron 5100 and 5300 | Solidigm S4520, Micron 5400 | SK hynix PE9010, Micron 7450, Phison D100P, Samsung PM9D3a | Same four |
| CLI | mvcli, mvsetup | mvcli, mvsetup | mnvcli | mnvcli |

The table draws on Dell's S1 ([A07](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf)), [S2](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us), [N1](https://dl.dell.com/content/manual30863516-dell-boot-optimized-storage-solution-n1-user-s-guide.pdf?language=en-us) and [N1 DC-MHS](https://dl.dell.com/content/manual24888099-dell-boot-optimized-storage-solution-n1-dc-mhs-user-s-guide.pdf?language=en-us) guides. Leaseweb's [operator summary](https://blog.leaseweb.com/2022/11/02/is-it-time-for-a-new-boss-boot-optimized-storage-solution/) describes the S1 as a half-height, half-length PCIe card that must be powered off to replace and the S2 as a hot-swappable unit like a power supply.

N1 also comes as Modular and Modular Extreme Temperature cards with the M.2 mounted directly on the card and no hot-plug. The 17G family adds Modular DC-MHS and an embedded eBOSS-N1, also without hot-plug. Dell's separate [RAID on RISER-N1](https://www.dell.com/support/manuals/en-us/raid-on-riser/ror_n1_ug/dell-raid-on-riser-n1?guid=guid-2fe69dff-0141-4bf9-9ca7-65f16e043077&lang=en-us) covers the XR8640t, XR4520c and XR4510c. As of October 5, 2026, [Dell's BOSS support page](https://www.dell.com/support/product-details/en-us/product/boss-s-1/resources/manuals) lists guides for S1, S2, N1 and N1 DC-MHS and nothing newer.

## Which PowerEdge servers take which BOSS card?

Match the card to the server, because Dell documents each generation for specific models.

| Card | PowerEdge models in Dell's documents |
|---|---|
| S1 adapter | C4140, C6525, R240, R340, R440, R540, R640, R740, R740xd, R940, R6415, R6515, R6525, R7415, R7425, R7515, R7525, T140, T340, T440, T640 |
| S1 modular | C6420, FC640, M640 (M1000e and VRTX), MX740c, MX840c |
| S2 | R6525 and R7525 in the S2 guide; R350, R550, R650, R750 and T550 in installation manuals |
| N1 | R260, R360, R660, R6615, R6625, R760, R760xa, R760xd2, R760xs, R7615, R7625, R860, R960, T160, T360, T560, HS5610, HS5620, XE8640, XE9640, XE9680 |
| N1 DC-MHS | R470, R570, R670, R6715, R6725, R770, R7715, R7725, R7725xd, XE7740, XE7745 |

The S1 rows come from the [S1 guide, Rev. A09](https://gfx3.senetic.com/akeneo-catalog/5/9/1/9/591966c81a8012b3627fe196787aa7676d51ca9e_1711209_4XJTD_icecat_multimedia_other_digital_assets_4_en_GB.pdf), and the [S1 firmware package](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=3p39v) also lists the R250, R740xd2, R750xa, R840, R940xa, T150 and XE8545. The N1 rows are the compatibility lists on Dell's [Monolithic](https://www.dell.com/support/home/en-hk/drivers/driversdetails?driverid=c6mvr) and [DC-MHS](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=cp1t8) firmware packages, so they show where the firmware applies, not a sales list.

Three details matter when shopping. BOSS is not a 13G option: Dell's R640 guide lists the [R630's BOSS module as "None"](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf), though [one Proxmox forum poster reported](https://forum.proxmox.com/threads/install-proxmox-8-1-on-boss-n1-and-using-dell-perc-h965i-controller.140902/) running an S1 in a 13th-generation Dell, which Dell does not document. The S2 guide names only two servers, but Dell's manuals for the [R350](https://www.dell.com/support/manuals/en-us/poweredge-r350/r350_ism_pub/installing-the-boss-s2-module?guid=guid-057deb3f-f773-407c-91ae-e777f2051b99&lang=en-us) and [R750](https://www.dell.com/support/manuals/en-nz/poweredge-r750/per750_ism_pub/boss-s2-module-kit?guid=guid-f111ed88-20d7-45f4-8934-308573c0c969&lang=en-us) describe S2 modules, while the [R250 manual](https://www.dell.com/support/manuals/en-ee/poweredge-r250/per250_ism_pub/installing-the-m2-ssd-module?guid=guid-034d26e1-88d2-4ebd-b22d-035bbd5308bb&lang=en-us) describes an S1 card. And a [PowerEdge R740](/blog/dell-poweredge-r740-deep-dive) takes at most one BOSS card, with the low-profile version in [slot 6](https://www.dell.com/support/manuals/en-us/poweredge-r740/per740_ism_pub/expansion-card-installation-guidelines?guid=guid-2356b79e-a3e7-4d3f-b97f-9d85dfaea34d&lang=en-us).

The 17G R670 and R770 can alternatively ship an M.2 interposer board for two NVMe drives, per Dell's [R670 guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r670-technical-guide.pdf). Dell's guide gives no detail on how it presents them.

## How does BOSS RAID 1 behave?

BOSS is a fixed-function mirror with almost nothing to tune. It builds one virtual disk from both drives, and Dell's S1 guide says [specifying the size is not supported](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf). The cache is write-through with no battery, and Dell's S2 and N1 tables list no hot spare, consistency check or patrol read.

Passthrough is where the generations split. On S1 and S2, [unconfigured drives are automatically non-RAID](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us), so deleting the virtual disk gives two plain disks, and TRIM works only in that mode. N1 has no passthrough: Dell says it [uses only one drive for a RAID 0 volume](https://dl.dell.com/content/manual30863516-dell-boot-optimized-storage-solution-n1-user-s-guide.pdf?language=en-us), with no migration between RAID 0 and RAID 1.

Rebuilds are automatic. Auto-rebuild takes any functional drive on the card that is not in the virtual disk and has equal or greater capacity, without prompting, and [overwrites its data](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us). S1 rebuilds at the next boot, and S2 and N1 rebuild when you hot-plug the replacement. HII (F2, Device Settings) offers a manual rebuild.

Moved drives are foreign. BOSS presents only a virtual disk native to the adapter, so import a mirror from another controller in HII and reboot, because iDRAC cannot import it. Boot in UEFI mode: N1 does not support Legacy BIOS, and two unconfigured S1 drives boot only from slot 0 in legacy mode.

## How do you manage a BOSS card with iDRAC and the BOSS CLI?

iDRAC handles inventory, health, LED blink and staged virtual disk changes, the CLI reads SMART data and events inside the OS, and HII handles import and rebuild. The [iDRAC9 guide](https://gfx3.senetic.com/akeneo-catalog/7/2/1/2/72128faf64ab186f01b2bb9d2128c34004f03afc_1781207_WYKPV_icecat_multimedia_other_digital_assets_8_en_GB.pdf) marks virtual disk create and delete as staged on all three cards, so they apply after a reboot. It marks LED blink and hot-plug as real-time on S2 and N1 and not applicable on S1, and says to keep Collect System Inventory on Reboot (CSIOR) enabled. More iDRAC habits are in [iDRAC tips and tricks](/blog/dell-idrac-tips-tricks).

Dell's [deployment KB](https://www.dell.com/support/kbdoc/en-us/000177584/automating-operating-system-deployment-to-dell-boss-techniques-for-different-operating-systems) creates the RAID 1 from RACADM and sets the boot order, with variables holding the controller and drive IDs:

```
racadm storage createvd:$boss_ctrl -rl r1 -name boss_ssd -pdkey:${boss_disks[0]},${boss_disks[1]}
racadm set BIOS.BootSettings.HddSeq $ahci_ctrl
```

Inside the OS, S1 and S2 use `mvcli` (`mvsetup` on Windows) and N1 uses `mnvcli`. Run them as root or administrator, because Dell lists a ["No Adapter Found" error](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us) for non-root Linux users.

```
./mvcli info -o vd       # S1 and S2: virtual disk state
./mvcli info -o pd       # S1 and S2: drive state
./mvcli smart -p 0       # S1 and S2: SMART for drive 0
./mnvcli smart -i 0      # N1: SMART for drive 0
./mnvcli event -c 20     # N1: last 20 events
```

In the SMART output, look for [Life Remaining](https://www.dell.com/support/kbdoc/en-us/000215395/how-to-install-the-mvcli-boss-utility-on-esxi-in-order-to-determine-the-m-2-ssd-remaining-endurance), the attribute Dell's ESXi KB uses for endurance. Save the output of `mvcli event`, because Dell's [S1 utility KB](https://www.dell.com/support/kbdoc/en-us/000120728/installing-and-using-the-mvcli-mvsetup-boss-s1-utility) warns that reading it may clear the event data.

## How do you replace a failed M.2 and rebuild the mirror?

On S2 and N1 you swap the carrier with the server running, while S1 needs a shutdown. Dell's R750 manual says [installing the BOSS S2 card carrier does not require the system to be powered off](https://www.dell.com/support/manuals/en-nz/poweredge-r750/per750_ism_pub/boss-s2-module-kit?guid=guid-f111ed88-20d7-45f4-8934-308573c0c969&lang=en-us), and the R760 manual says the same for the [N1 carrier](https://www.dell.com/support/manuals/en-us/poweredge-r760/per760_ism_pub/boss-n1-module-kit?guid=guid-c5d1e7f6-6f32-4f2d-ac44-6aba5f6c8c6e&lang=en-us). Only the controller module needs a shutdown.

1. Identify the failed drive. On S2 and N1, a blinking amber status LED means failed (on N1, also a SMART trip), and iDRAC can blink a carrier green to locate it. S1 has no LEDs, so use iDRAC or `mvcli info -o pd`.
2. Confirm the failure first. Dell's KB 000177690 describes a [polling race condition](https://www.dell.com/support/kbdoc/en-us/000177690/false-boss-m-2-failures-reported-by-the-idrac-and-in-the-lcc-log) that can raise a false failure event (SSD0001) and clears at the next 30-second poll or an iDRAC reset.
3. Pick a replacement of the same type (SATA for S, NVMe for N) with at least the survivor's capacity. For DC-MHS carriers, Dell [recommends replacing both thermal pads](https://dl.dell.com/content/manual24888099-dell-boot-optimized-storage-solution-n1-dc-mhs-user-s-guide.pdf?language=en-us) each time.
4. Lift the carrier latch, slide the carrier out, remove the M.2 screw, swap the drive and refit it. Dell's [S2 guide](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us) gives 1.7 in-lb (0.19 N-m) for that screw. On N1, leave 30 seconds between removal and insertion for ISE drives, or five minutes for self-encrypting drives.
5. Slide the carrier in and close the latch. The rebuild starts on its own: the S2 status LED stays green for online or rebuild, and the N1 activity LED blinks green during it.
6. Watch progress in iDRAC or the CLI. Dell says [HII background activity is not real-time](https://gfx3.senetic.com/akeneo-catalog/5/9/1/9/591966c81a8012b3627fe196787aa7676d51ca9e_1711209_4XJTD_icecat_multimedia_other_digital_assets_4_en_GB.pdf) and recommends the CLI.

For S1, power off, disconnect the server, open it, remove the card, take out the M.2 screw, swap the module, reseat the card and boot. The rebuild starts at boot. If none begins, use HII's RAID Rebuild option, which works only when a degraded volume and a target drive both exist.

## Which firmware and drives should a BOSS card use?

### Firmware and the 2026 Marvell notice

Update with a Dell Update Package, iDRAC (Maintenance, System Update, Manual Update), Lifecycle Controller (F10), or on S1 the UEFI shell or CLI. Updates are staged and a reboot applies them. The newest packages on Dell's pages on October 5, 2026 were [2.5.13.3024 for S1](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=3p39v) (March 6, 2024), [2.5.13.4009 for S2](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=ttr5r) (March 6, 2024), [2.1.13.2037 for N1 Monolithic](https://www.dell.com/support/home/en-hk/drivers/driversdetails?driverid=c6mvr) (August 18, 2025) and [2.2.13.2033 for N1 DC-MHS](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=cp1t8) (March 4, 2025).

S1 and S2 carry a security caveat. Dell's [notice DSN-2026-002](https://www.dell.com/support/kbdoc/en-uk/000461333/dsn-2026-002-marvell-component-vulnerability-in-dell-boot-optimized-server-storage-boss-boss-s1-and-boss-s2), last modified May 26, 2026 (CVE-2026-34880), says the Marvell 88SE9230 chip on those cards, a [PCIe 2.0 to SATA 6 Gb/s controller](https://www.marvell.com/content/dam/marvell/en/public-collateral/storage/marvell-storage-88se92xx-product-brief-2012-04.pdf), has no secure boot or firmware integrity protection, and that Marvell has no fix. The newest S1 and S2 versions above are on the affected list. Dell's workaround is a UEFI tool that computes a SHA-384 checksum of the flash for you to compare with the released image. The notice does not mention N1. Dell's S2 guide describes a signed update path in which the controller is locked except during updates, yet the notice still lists S2 as affected.

### Third-party M.2 drives

Dell says each card is [tested and supported only with the M.2 drives that are shipped with the controller](https://dl.dell.com/content/manual30863516-dell-boot-optimized-storage-solution-n1-user-s-guide.pdf?language=en-us). Support is also firmware-gated: the Samsung PM9D3a needs BOSS-N1 2.1.13.2034 or later, and the Phison D100P needs iDRAC9 7.30.10.50 or later.

Dell staff have not described a lockout. In April 2021, a Dell community reply said Dell [did not block any SSDs in BIOS](https://www.dell.com/community/en/conversations/poweredge-hardware-general/compatible-m2-drives-for-boss-on-t340/647f9254f4ccf8a8de40948a) but cannot support third-party hardware. Owner reports are mixed: one poster reported in 2020 that [Intel D3-S4510 drives worked](https://www.dell.com/community/en/conversations/poweredge-hardware-general/boss-s1-card-with-m2-ssd/647f7f8ef4ccf8a8dee10ef3?page=2), another that about six NVMe and four SATA M.2 drives did not, and a 2023 poster reported Micron 480 GB SATA drives working.

Use SATA for S1 and S2 and NVMe for N1, match or exceed the surviving drive's capacity, prefer read-intensive enterprise models, and keep drive firmware current, as Dell advises.

## Is a BOSS card a good fit for Proxmox, ESXi or TrueNAS?

Yes for a boot mirror on any of the three, provided VMs and data live on other drives.

### ESXi

ESXi is the closest match. Broadcom's [ESXi 8.0 requirements](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/esx-installation-and-setup/installing-and-setting-up-esxi-install/esxi-requirements-install/esxi-hardware-requirements-install.html) require a boot disk of at least 32 GB, ask for 128 GB or more for ESX-OSData and 128 TBW of endurance, and recommend a RAID 1 mirrored device. BOSS drives start at 240 GB, and at Dell's 1 DWPD rating for S2 drives, 240 GB works out to about 438 TB over five years (arithmetic, not a Dell figure). Broadcom's KB lists 128 GB as the vSphere 9 minimum.

Dell's S1 guide says ESXi on S1 gets no VMFS datastore by default and a custom image [disables VMFS](https://gfx3.senetic.com/akeneo-catalog/5/9/1/9/591966c81a8012b3627fe196787aa7676d51ca9e_1711209_4XJTD_icecat_multimedia_other_digital_assets_4_en_GB.pdf), so treat BOSS as boot only. Dell's KB uses this kickstart line for automated installs:

```
install --overwritevmfs --firstdisk="DELLBOSS VD"
```

### Proxmox

The installer lists the virtual disk like any other. One forum poster reported an S1 mirror made with the CLI that [showed up as an install target](https://forum.proxmox.com/threads/install-proxmox-8-1-on-boss-n1-and-using-dell-perc-h965i-controller.140902/), installed with XFS, and another reported Proxmox on two 480 GB drives in RAID 1 on a BOSS-N1.

The [Proxmox installation guide](https://pve.proxmox.com/pve-docs/chapter-pve-installation.html) says ZFS on top of any hardware RAID is not supported and can result in data loss, and OpenZFS notes that [hardware RAID limits self-healing](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html). With a BOSS RAID 1, choose ext4 or XFS. For a ZFS boot mirror, delete the virtual disk on S1 or S2 and let Proxmox mirror the raw drives, which N1 cannot do. More in [ZFS on enterprise hardware](/blog/zfs-on-enterprise-hardware) and [Proxmox vs ESXi](/blog/proxmox-vs-esxi).

### TrueNAS

TrueNAS's [hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) asks for a 20 GB SSD boot device and warns against hardware RAID cards, so keep pool disks on an HBA and use BOSS for boot only. On May 8, 2024, a TrueNAS forum member [reported](https://forums.truenas.com/t/has-anyone-tried-dell-r730xd-or-r740xd-with-nvme/856?page=2) that all their TrueNAS servers run a BOSS card without problems. FreeBSD-based releases had trouble, as the next section shows.

## What breaks

**The rebuild never starts after a drive swap.** Auto-rebuild accepts only a functional drive outside the virtual disk with equal or greater capacity, and a drive carrying another controller's RAID metadata is not presented to the OS. Fix: use a drive at least as large as the survivor, clear old metadata (Erase Physical Disk in HII on S1 and S2, or Reset Configuration in iDRAC), then reinsert it, or run the manual rebuild in HII.

**ESXi installs fail with an invalid partition table on a BOSS RAID 1.** A member drive still holds an ESXi partition that the installer cannot clear inside a virtual disk. Fix: per Dell's S1 and S2 guides, delete the RAID 1, run Erase Physical Disk on both drives, recreate the RAID 1 with quick initialization on, and reinstall.

**Only one of the two BOSS-N1 drives is in use.** Choosing RAID 0 leaves the second drive unused, and N1 cannot migrate between RAID 0 and RAID 1. Fix: delete the virtual disk and create RAID 1 with both drives before installing the OS.

**The OS or iDRAC shows no virtual disk after a controller swap.** BOSS presents only virtual disks native to the adapter, so the old mirror is foreign. Fix: import it in HII and reboot. iDRAC cannot import it, and Reset Configuration wipes it if you do not need the data.

**FreeBSD-based TrueNAS stops seeing BOSS-S1 drives after a firmware update.** In a 2020 forum thread, an owner reported the [AHCI error "stopping AHCI engine failed"](https://www.truenas.com/community/threads/ahci-driver-problems-with-marvell-88se9230-dell-boss-s1.85128/) on firmware 2.5.13.3022, with no confirmed cause. Fix: owners reported that downgrading to A03 worked, and one poster reported that UEFI boot with the BOSS RAID 1 let TrueNAS SCALE install on October 24, 2022. Weigh a downgrade against DSN-2026-002.

## Frequently asked questions

### Is a Dell BOSS card hot-swappable?

S2 and the N1 Monolithic and DC-MHS cards are, and S1 is not. Only the M.2 carrier is hot-plug: installing the controller module needs a shutdown, and the N1 Modular, Modular DC-MHS and eBOSS-N1 variants have no hot-plug. On S1, Dell's guide says to turn the system off and disconnect it first.

### Can I use a BOSS card for VM storage?

Dell recommends BOSS only as a boot device. An R740 owner with an S1 reported in February 2022 that [reads benchmarked about 4.5 times slower](https://www.dell.com/community/en/conversations/poweredge-hardware-general/boss-s1-performance/647f9a43f4ccf8a8dede29af) than a laptop M.2 drive and 11.5 times slower than the server's PERC-attached drives. That is one report, so keep VMs on data drives.

### Do I need drivers for a BOSS card?

Not for the OS: S1 and S2 use the inbox AHCI driver, and N1 uses the inbox NVMe driver. The CLI is separate, and on Windows the S2 CLI needs a management driver, while Linux and ESXi `mvcli` do not.

### Can I move to larger M.2 drives later?

You can replace a failed drive with a larger one, since auto-rebuild accepts equal or greater capacity. Dell lists virtual disk expansion as unsupported on S2 and N1, so using the extra space means recreating the virtual disk and reinstalling.

## What this means

Use BOSS the way Dell designed it: a mirrored operating system volume on a 14G or newer PowerEdge, with VMs and data on other drives. Match the card to the server (S1 for 14G, S2 for most 15G, N1 for 16G and 17G) and check your model's installation manual before buying.

For ESXi, or Proxmox on ext4 or XFS, a BOSS mirror is a clean choice. If you want ZFS to manage the boot mirror, use S1 or S2 in non-RAID mode, because N1 cannot. Stay on Dell-listed drives for support, install the CLI for SMART checks, and read DSN-2026-002 if you run S1 or S2.

## References

- [Dell BOSS-N1 User's Guide, Rev. A01, July 2026](https://dl.dell.com/content/manual30863516-dell-boot-optimized-storage-solution-n1-user-s-guide.pdf?language=en-us)
- [Dell BOSS-N1 DC-MHS User's Guide, Rev. A01, July 2026](https://dl.dell.com/content/manual24888099-dell-boot-optimized-storage-solution-n1-dc-mhs-user-s-guide.pdf?language=en-us)
- [Dell BOSS-S2 User's Guide, Rev. A01, July 2023](https://dl.dell.com/content/manual32734952-dell-technologies-boot-optimized-storage-solution-s2-user-s-guide.pdf?language=en-us)
- [Dell BOSS-S1 User's Guide, Rev. A07, October 2019](https://dl.dell.com/topicspdf/boss-s-1_users-guide_en-us.pdf)
- [Dell BOSS-S1 User's Guide, Rev. A09, July 2022](https://gfx3.senetic.com/akeneo-catalog/5/9/1/9/591966c81a8012b3627fe196787aa7676d51ca9e_1711209_4XJTD_icecat_multimedia_other_digital_assets_4_en_GB.pdf)
- [Dell iDRAC9 User's Guide 7.xx, Rev. A09, September 2025](https://gfx3.senetic.com/akeneo-catalog/7/2/1/2/72128faf64ab186f01b2bb9d2128c34004f03afc_1781207_WYKPV_icecat_multimedia_other_digital_assets_8_en_GB.pdf)
- [Dell Support: Boot Optimized Server Storage (BOSS) manuals](https://www.dell.com/support/product-details/en-us/product/boss-s-1/resources/manuals)
- [Dell Direct from Development: BOSS-S2](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/direct-from-development-dell-emc-poweredge-boot-optimized-storage-solution-boss-s2.pdf)
- [Dell BOSS-N1 specification sheet, January 2023](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/dell-poweredge-boot-optimized-storage-solution-datasheet-for-n1.pdf.external)
- [Dell Direct from Development: BOSS (S1), 2017](https://dl.dell.com/manuals/all-products/esuprt_solutions_int/esuprt_solutions_int_solutions_resources/servers-solution-resources_white-papers10_en-us.pdf)
- [Dell PowerEdge R640 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf)
- [Dell PowerEdge R670 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r670-technical-guide.pdf)
- [Dell PowerEdge R750 Installation and Service Manual: BOSS S2 module kit](https://www.dell.com/support/manuals/en-nz/poweredge-r750/per750_ism_pub/boss-s2-module-kit?guid=guid-f111ed88-20d7-45f4-8934-308573c0c969&lang=en-us)
- [Dell PowerEdge R760 Installation and Service Manual: BOSS-N1 module kit](https://www.dell.com/support/manuals/en-us/poweredge-r760/per760_ism_pub/boss-n1-module-kit?guid=guid-c5d1e7f6-6f32-4f2d-ac44-6aba5f6c8c6e&lang=en-us)
- [Dell PowerEdge R740 Installation and Service Manual: expansion card guidelines](https://www.dell.com/support/manuals/en-us/poweredge-r740/per740_ism_pub/expansion-card-installation-guidelines?guid=guid-2356b79e-a3e7-4d3f-b97f-9d85dfaea34d&lang=en-us)
- [Dell PowerEdge R350 Installation and Service Manual: installing the BOSS S2 module](https://www.dell.com/support/manuals/en-us/poweredge-r350/r350_ism_pub/installing-the-boss-s2-module?guid=guid-057deb3f-f773-407c-91ae-e777f2051b99&lang=en-us)
- [Dell PowerEdge R250 Installation and Service Manual: installing the M.2 SSD module](https://www.dell.com/support/manuals/en-ee/poweredge-r250/per250_ism_pub/installing-the-m2-ssd-module?guid=guid-034d26e1-88d2-4ebd-b22d-035bbd5308bb&lang=en-us)
- [Dell RAID on RISER-N1 User's Guide](https://www.dell.com/support/manuals/en-us/raid-on-riser/ror_n1_ug/dell-raid-on-riser-n1?guid=guid-2fe69dff-0141-4bf9-9ca7-65f16e043077&lang=en-us)
- [Dell KB 000177584: Automating OS deployment to Dell BOSS](https://www.dell.com/support/kbdoc/en-us/000177584/automating-operating-system-deployment-to-dell-boss-techniques-for-different-operating-systems)
- [Dell KB 000120728: Installing and using the MVCLI MVSETUP BOSS-S1 utility](https://www.dell.com/support/kbdoc/en-us/000120728/installing-and-using-the-mvcli-mvsetup-boss-s1-utility)
- [Dell KB 000215395: MVCLI on ESXi to check M.2 remaining endurance](https://www.dell.com/support/kbdoc/en-us/000215395/how-to-install-the-mvcli-boss-utility-on-esxi-in-order-to-determine-the-m-2-ssd-remaining-endurance)
- [Dell KB 000177690: False BOSS M.2 failures reported by iDRAC](https://www.dell.com/support/kbdoc/en-us/000177690/false-boss-m-2-failures-reported-by-the-idrac-and-in-the-lcc-log)
- [Dell DSN-2026-002: Marvell component vulnerability in BOSS-S1 and BOSS-S2](https://www.dell.com/support/kbdoc/en-uk/000461333/dsn-2026-002-marvell-component-vulnerability-in-dell-boot-optimized-server-storage-boss-boss-s1-and-boss-s2)
- [Dell BOSS-S1 Adapter firmware 2.5.13.3024](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=3p39v)
- [Dell BOSS-S2 firmware 2.5.13.4009](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=ttr5r)
- [Dell BOSS-N1 Monolithic firmware 2.1.13.2037](https://www.dell.com/support/home/en-hk/drivers/driversdetails?driverid=c6mvr)
- [Dell BOSS-N1 DC-MHS firmware 2.2.13.2033](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=cp1t8)
- [Dell Community: Compatible M.2 drives for BOSS on T340](https://www.dell.com/community/en/conversations/poweredge-hardware-general/compatible-m2-drives-for-boss-on-t340/647f9254f4ccf8a8de40948a)
- [Dell Community: BOSS S1 card with M2 SSD](https://www.dell.com/community/en/conversations/poweredge-hardware-general/boss-s1-card-with-m2-ssd/647f7f8ef4ccf8a8dee10ef3?page=2)
- [Dell Community: BOSS-S1 Performance](https://www.dell.com/community/en/conversations/poweredge-hardware-general/boss-s1-performance/647f9a43f4ccf8a8dede29af)
- [Leaseweb: Is it time for a new BOSS (Boot Optimized Storage Solution)?](https://blog.leaseweb.com/2022/11/02/is-it-time-for-a-new-boss-boot-optimized-storage-solution/)
- [Marvell 88SE9220/9230/9235/9215 SATA 6Gb/s Host Controllers product brief](https://www.marvell.com/content/dam/marvell/en/public-collateral/storage/marvell-storage-88se92xx-product-brief-2012-04.pdf)
- [Broadcom KB: SD card/USB boot device revised guidance](https://knowledge.broadcom.com/external/article?legacyId=85685)
- [Broadcom ESXi 8.0 hardware requirements](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/esx-installation-and-setup/installing-and-setting-up-esxi-install/esxi-requirements-install/esxi-hardware-requirements-install.html)
- [Proxmox VE installation guide](https://pve.proxmox.com/pve-docs/chapter-pve-installation.html)
- [Proxmox forum: Install Proxmox 8.1 on Boss-N1 and using Dell PERC H965i](https://forum.proxmox.com/threads/install-proxmox-8-1-on-boss-n1-and-using-dell-perc-h965i-controller.140902/)
- [OpenZFS documentation: Hardware](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [TrueNAS Hardware Guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/)
- [TrueNAS community: ahci driver problems with Marvell 88SE9230 (Dell BOSS-S1)](https://www.truenas.com/community/threads/ahci-driver-problems-with-marvell-88se9230-dell-boss-s1.85128/)
- [TrueNAS forums: Has anyone tried Dell R730xd or R740xd with NVMe](https://forums.truenas.com/t/has-anyone-tried-dell-r730xd-or-r740xd-with-nvme/856?page=2)
