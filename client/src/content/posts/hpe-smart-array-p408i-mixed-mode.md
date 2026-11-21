## The short answer

The HPE Smart Array P408i-a SR Gen10 has no HBA-mode switch (HBA means host bus adapter, a card that hands disks to the operating system untouched), because HPE builds pass-through into every Gen10 E-class and P-class controller as "mixed mode." HPE's [SR Gen10 user guide](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/30-F5AC2861-011.pdf) says "Any drive that is not a member of a logical drive or assigned as a spare is presented to the operating system," and that this "occurs by default without any user intervention." The [May 2020 edition](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/879006-005_en.pdf) adds "and cannot be disabled." To pass disks through, delete every logical drive that claims them, from UEFI System Utilities, offline SSA or `ssacli ctrl slot=0 ld all delete`. The freed drives then list as `unassigned` in ssacli and appear in Linux as ordinary disks on the in-kernel `smartpqi` driver. The Gen8 P420i `hbamode=on` procedure does not apply. HPE describes the 2 GB flash-backed write cache in terms of logical drives, and the P-class controllers need an energy pack. OpenZFS and Proxmox documentation say to use a plain HBA, TrueNAS accepts a card's pass-through mode, and owner reports of ZFS pools on the P408i-a are positive but few.

## Does the P408i-a have an HBA mode, or is mixed mode the same thing?

For running ZFS, mixed mode is the HBA mode, but nobody switches it on. HPE's [Smart Array SR Gen10 Controller User Guide](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/30-F5AC2861-011.pdf), edition 11 from September 2023, describes it under "Mixed mode (RAID and HBA simultaneously)": "Any drive that is not a member of a logical drive or assigned as a spare is presented to the operating system. This mode occurs by default without any user intervention. Logical drives are also presented to the operating system." The [2020 edition](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/879006-005_en.pdf) ends the second sentence with "and cannot be disabled." The later edition drops those words, but neither edition documents an `hbamode` setting or any other way to turn pass-through on or off.

The `hbamode` parameter does appear in HPE's [Smart Storage Administrator User Guide](https://usercontent.one/wp/ramsgaard.me/wp-content/uploads/2022/10/HPE_c03909334_HPE-Smart-Storage-Administrator-User-Guide.pdf?media=1661795354), part number 742648-008a from October 2016. Under "Managing modes" it warns: "Enabling HBA Mode exposes the physical drives to the operating system. Smart Array configuration is not allowed." That is a whole-controller switch for older models, and it is the mechanism owners use on the Gen8 P420i in the [P420i HBA mode article](/blog/smart-array-p420i-hba-mode). The Gen10 design differs in four ways.

| | Gen8 Smart Array P420i | Gen10 Smart Array P408i-a SR |
|---|---|---|
| Linux driver | `hpsa`, with PCI subsystem ID 103c:3354 per the [kernel source](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/hpsa.c) | `smartpqi`, with subsystem ID 103c:0602 per [pci.ids](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids) |
| How pass-through starts | `ssacli ... modify hbamode=on`, owner-reported for this model | Automatic for any drive outside a logical drive or spare |
| RAID beside pass-through | No: HPE says configuration is not allowed in HBA mode | Yes, by design |
| HPE documents it | Not for the P420i | Yes, as mixed mode |

Two consequences follow from HPE's wording. A drive assigned as a spare is not presented to the operating system, and neither is any member of a logical drive, including a single-drive RAID 0, which adds no redundancy (see [RAID levels](/blog/raid-levels-comparison)). The [OpenZFS hardware guide](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) says one "might be inclined to try using single-drive RAID 0 arrays to try to use a RAID controller like a HBA, but this is not recommended," and the [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) calls that setup "functional when necessary" but "not the ideal setup." On the P408i-a the better route is to leave the drives out of every logical drive.

HPE's own example of the intended use is a "two-drive mirror for boot support" with every other drive presented as HBA, "accomplished with a single controller attached to a single backplane."

## Which Gen10 controllers support mixed mode?

Every E-class and P-class SR Gen10 controller does, and the S-class does not. The table combines the [user guide](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/30-F5AC2861-011.pdf) with the SR Gen10 [QuickSpecs](https://edshop.edsystem.cz/fileshare/products/specification/hpe/a00047736enw%28439586%29.pdf).

| Controller | Class | Mixed mode | Flash-backed write cache | SAS lanes |
|---|---|---|---|---|
| S100i SR Gen10 SW RAID | S | No | None | Up to 14 SATA |
| E208i-a, E208i-p | E | Yes | 0 GB (none) | 8 internal |
| E208e-p | E | Yes | 0 GB (none) | 8 external |
| P408i-a, P408i-p | P | Yes | 2 GB | 8 internal |
| P408e-p | P | Yes | 4 GB | 8 external |
| P816i-a | P | Yes | 4 GB | 16 internal |

The user guide says the S100i "is only supported on Windows" and that "Only SATA drives are supported," and its feature table shows no mixed-mode support for the S-class. The E-class has "No cache memory support," and the guide's capacity table gives both E-class and P-class up to 64 volumes and up to 238 physical drives, a figure the guide footnotes. The suffix names the form factor: the guide describes type-a modular controllers as compatible with ProLiant DL, ProLiant ML and Apollo platforms, which matches owner reports of the P408i-a in DL380 and ML350 Gen10 servers in a [Proxmox forum thread](https://forum.proxmox.com/threads/downsides-of-using-smart-array-p408i-a-sr-gen10-in-hba-mode-zfs.136214/) (the QuickSpecs list SKU 804331-B21 and the LH variant 869081-B21).

The QuickSpecs also list a separate Smart Array MR Gen10 family managed with "HPE MR Storage Administrator" and "HPE StorCLI." That family is outside this article, and none of the ssacli commands below apply to it.

## How do you see which drives the OS gets with ssacli?

ssacli is HPE's command-line tool for Smart Array controllers. On Linux it reaches a `smartpqi` controller through compatibility ioctls: the [kernel documentation](https://docs.kernel.org/scsi/smartpqi.html) describes `CCISS_PASSTHRU` as passing "BMIC" and "CISS" commands to the controller, and says they are "used extensively by the SSA Array Configuration Utility." HPE's [Software Delivery Repository](https://downloads.linux.hpe.com/SDR/repo/mcp/) hosts the package in its Management Component Pack tree, with signing keys named `GPG-KEY-mcp` and `GPG-KEY2-mcp`. The repository's [package index for Ubuntu 24.04](https://downloads.linux.hpe.com/SDR/repo/mcp/dists/noble/current/non-free/binary-amd64/Packages) currently lists `ssacli` version 6.45-8.0, and the [index for Debian 13](https://downloads.linux.hpe.com/SDR/repo/mcp/dists/trixie/current/non-free/binary-amd64/Packages) lists 6.60-8.0. Run the following as root:

```bash
curl -fsSL https://downloads.linux.hpe.com/SDR/repo/mcp/GPG-KEY2-mcp \
  | gpg --dearmor -o /usr/share/keyrings/hpe-mcp.gpg
echo "deb [signed-by=/usr/share/keyrings/hpe-mcp.gpg] https://downloads.linux.hpe.com/SDR/repo/mcp noble/current non-free" \
  | tee /etc/apt/sources.list.d/hpe-mcp.list
apt update && apt install ssacli
```

Replace `noble` with the codename of the installed release. The detached signature on the [`noble` Release file](https://downloads.linux.hpe.com/SDR/repo/mcp/dists/noble/current/Release) verifies against the key in `GPG-KEY2-mcp`, a 4096-bit RSA key created on September 5, 2024 (`gpgv` reports a good signature from that key on both the `noble` and `trixie` Release files as of November 2026), while the older `GPG-KEY-mcp` is a separate file in the same directory. HPE's [ssacli 3.10 readme](https://downloads.hpe.com/pub/softlib2/software1/pubsw-linux/p1857046646/v122802/ssacli-3.10-3.0.x86_64.txt) warns that on Red Hat Enterprise Linux 7.1 the `sg` driver must be added or "devices or controllers may not be discovered," so `modprobe sg` is a cheap first check on any distribution if ssacli lists no controller.

The [Smart Storage Administrator guide](https://usercontent.one/wp/ramsgaard.me/wp-content/uploads/2022/10/HPE_c03909334_HPE-Smart-Storage-Administrator-User-Guide.pdf?media=1661795354) defines `show` with `detail` and `status` options, plus `show config` for a controller. Its sample output groups drives that belong to no array under a bare `unassigned` heading, which is the state that mixed mode presents to the operating system.

```bash
ssacli ctrl all show
ssacli ctrl slot=0 show config
ssacli ctrl slot=0 pd all show
ssacli ctrl slot=0 ld all show
```

The first command prints each controller's header line with its slot number, as in the guide's sample "Smart Array P421 in Slot 9." Use that number in place of `slot=0`. The guide's samples label drives in port:box:bay form, so a Gen10 drive reads like `1I:1:3`. Any `physicaldrive` listed under `unassigned` is visible to the operating system. Anything listed under an `array` heading, including a spare, is not.

To find a bay, the guide's `modify led=on|off` command flashes a target's LEDs for an hour or until turned off, and HPE's LED table marks the ssacli locate method as working for both HBA and RAID drives.

```bash
ssacli ctrl slot=0 pd 1I:1:3 modify led=on
```

## How do you clear old logical drives so the disks pass through?

Deleting a logical drive destroys its data, so back up first and confirm the slot and drive list. Three tools can do it. HPE's comparison table shows "Create or delete arrays and logical drives" as supported in both Smart Storage Administrator and the UEFI System Utilities, which opens with F9 during POST. SSA also runs offline, before the host OS starts, which is the safe choice when the logical drive being removed holds the running system.

From a shell, the SSA guide defines `<target> delete [forced]` and gives `ctrl slot=3 ld all delete` as an example. It says the screen shows a warning prompt "unless you include the forced parameter," so leave `forced` off until the target is right.

```bash
ssacli ctrl slot=0 ld all show
ssacli ctrl slot=0 ld all delete
ssacli ctrl slot=0 pd all show
```

The last command should now list every disk under `unassigned`. The guide's syntax also accepts `array all` as a target, so `ssacli ctrl slot=0 array all delete` removes any array entry that remains. Add `forced` only in scripts.

Drives that came out of a hardware array can carry leftover metadata. One poster in the [Proxmox forum thread](https://forum.proxmox.com/threads/downsides-of-using-smart-array-p408i-a-sr-gen10-in-hba-mode-zfs.136214/), describing RAID 0 drives tested long ago on a different Smart Array model, warned that "the drives have 'HP RAID' information on them." For a former ZFS member, the [OpenZFS manual page](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-labelclear.8.html) describes `zpool labelclear` as removing ZFS label information from the device, with `-f` meaning "Treat exported or foreign devices as inactive." The OpenZFS [Debian root-on-ZFS guide](https://openzfs.github.io/openzfs-docs/Getting%20Started/Debian/Debian%20Bookworm%20Root%20on%20ZFS.html) wipes previously used disks with these commands (the guide uses a `$DISK` variable where the example path appears here):

```bash
wipefs -a /dev/disk/by-id/ata-EXAMPLE
sgdisk --zap-all /dev/disk/by-id/ata-EXAMPLE
blkdiscard -f /dev/disk/by-id/ata-EXAMPLE
```

The guide marks `blkdiscard` as optional for flash storage. HPE's user guide lists "Erase Drives" as a task in both SSA and UEFI System Utilities, which is the controller-side alternative.

To keep a boot mirror as HPE's example describes, create one logical drive from two disks and leave the rest unassigned. The SSA guide's `create type=ld drives=... raid=...` form covers it, with drive IDs taken from `pd all show`:

```bash
ssacli ctrl slot=0 create type=ld drives=1I:1:1,1I:1:2 raid=1
```

## What does Linux see: the smartpqi driver, device names and SMART?

The P408i-a is a Microchip PQI controller. [pci.ids](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids) names PCI device 9005:028f "Smart Storage PQI SAS" and lists subsystem 103c:0602 as "Smart Array P408i-a SR Gen10" (103c:0654 is the E208i-a and 103c:1100 the P816i-a). The [smartpqi driver source](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/smartpqi/smartpqi_init.c) carries those subsystem IDs in its device table, and the [Kconfig help text](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/smartpqi/Kconfig) warns that "the aacraid driver will not manage a smartpqi controller." The [FreeBSD smartpqi(4) page](https://man.freebsd.org/cgi/man.cgi?query=smartpqi&sektion=4) lists the "HPE Gen10 Smart Array Controller Family" as supported.

```bash
lspci -nnk -d 9005:028f
```

The output should show subsystem 103c:0602 and `Kernel driver in use: smartpqi`. The driver treats the two drive types differently. In `pqi_add_device`, a logical device goes through `scsi_add_device`, and every other device is added to the SAS transport layer. The kernel documentation agrees: "HBA devices are added to the SAS transport layer," with `sas_address` and `scsi_target_id` attributes under `/sys/class/sas_device/`. The `raid_level` attribute gives a quick test: the driver reports "N/A" for anything that is not a logical disk, and a string such as "RAID-1(1+0)" for a logical drive.

```bash
grep -H . /sys/block/sd*/device/raid_level 2>/dev/null
```

Three `smartpqi` details matter on a mixed layout:

- **Device order.** The module parameter `expose_ld_first` is described as "Expose logical drives before physical drives," and the default is off, so the driver lists physical drives first. Pools should use `/dev/disk/by-id` paths either way, because the OpenZFS Debian root-on-ZFS guide warns that using the `/dev/sd*` device nodes directly "can cause sporadic import failures."
- **Virtual enclosure.** HPE says Virtual SES is "hosted by the controller driver," appears as a normal enclosure and works with host tools such as the `sg_ses` tool from the Linux sg3_utils package (HPE writes "SG_UTIL" and "SG_SES"). The `hide_vsep` parameter hides "the virtual SEP for direct attached drives."
- **New drives.** Writing to `/sys/class/scsi_host/host*/rescan` triggers the driver "to scan for new, changed, or removed devices."

HPE's LED table shows what the controller still does for pass-through drives:

| LED | Method | HBA drive | RAID drive |
|---|---|---|---|
| Locate (solid blue) | ssacli | Yes | Yes |
| Locate | Virtual SES | Yes | No |
| Drive failure (solid amber) | Automatic | Yes | Yes |
| Predictive drive failure (blinking amber) | Automatic | No | Yes |
| Predictive drive failure | Virtual SES | Yes | No |

The automatic predictive-failure LED is therefore a RAID-drive feature, and for pass-through drives HPE lists Virtual SES, a host-side method, instead. SMART monitoring itself falls to the host. The [smartctl manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html) says the default `-d auto` guesses the device type, that `-d sat` is for ATA disks behind a SCSI to ATA Translation layer, and that "In some cases the '-d sat' option is needed on the command line." Its HP Smart Array example, `smartctl -a -d cciss,0 /dev/sg2`, names only the `cciss`, `hpsa` and `hpahcisr` drivers, so it documents disks behind a RAID controller on those older drivers, not a recipe for `smartpqi`. The [SMART article](/blog/smart-data-drive-failure) covers which attributes to schedule with `smartd`.

Two more behaviors differ from a plain HBA. On controller firmware 6.22 or later, HPE says a Redfish volume with RAIDType set to None "is automatically generated for each HBA drive" and deleted when the drive joins a RAID volume. The `drivewritecache` setting, with syntax `<target> modify drivewritecache=enable|disable|? [forced]`, applies to drives in a logical drive and to drives that are "Unconfigured and exposed to the host on the controller." A drive's own write cache is not protected by the controller's energy pack, so the usual power-loss risk applies. Controller surface scan, in HPE's description, verifies "physical drives in fault-tolerant logical drives," so media checks on pass-through disks fall to ZFS scrubs and drive self-tests.

## Is P408i-a mixed mode safe for ZFS and TrueNAS?

None of the three major ZFS documents names the P408i-a. They state general positions on RAID controllers, which the table sets next to HPE's own wording:

| Source | Statement |
|---|---|
| [OpenZFS hardware guide](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) | "Hardware RAID controllers should not be used with ZFS." |
| [Proxmox VE administration guide](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html) | "Do not use ZFS on top of a hardware RAID controller which has its own cache management. ZFS needs to communicate directly with the disks." |
| [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) | "do not use their RAID facility if your hardware RAID card supports HBA mode, also known as passthrough or JBOD mode," which "allows it to perform indistinguishably from a standard HBA." Some RAID cards can "Mask disk serial number and S.M.A.R.T. health information." |
| [HPE SR Gen10 guide](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/30-F5AC2861-011.pdf) | Drives outside a logical drive or spare are "presented to the operating system." |

Read together, the TrueNAS condition, a pass-through mode in place of the RAID facility, is what unassigned drives provide. The OpenZFS and Proxmox objections concern the RAID and cache layers between ZFS and the disks, and HPE's wording describes unassigned drives as presented directly. HPE does not say that those drives bypass the controller cache, and none of the three ZFS documents blesses the arrangement. If a boot mirror stays on the controller, that logical drive does use its write cache, and the OpenZFS warning that a "failure point is introduced" applies to the mirror.

Owner reports on the Proxmox forum:

- A poster wrote on March 25, 2021 that Proxmox 6.3 worked with the P408i-a on a DL380 Gen10, with a [kernel log](https://forum.proxmox.com/threads/hpe-smart-array-e208i-or-e408i-a-sr-gen-10-compatibility.86417/) showing `smartpqi` attaching to the controller. The post does not say whether any drives were passed through.
- In a [thread](https://forum.proxmox.com/threads/downsides-of-using-smart-array-p408i-a-sr-gen10-in-hba-mode-zfs.136214/) that started in November 2023, one poster reported on October 8, 2024 running an ML350 Gen10 with the P408i-a and ZFS "very successfully for about 2 months now, even under heavy load," noting that without a RAID the SSDs are usable "1:1."
- A second poster reported on October 9, 2024 that a DL380 Gen10 had run ZFS RAID1 for the OS plus a second ZFS data pool for about a month, after deleting all logical volumes with the BIOS tool. The poster later gave the controller firmware as 6.22, and another member pointed to a newer 7.11 release.
- The same poster described one reboot after an `apt update` with ten ZFS-offline emails and five solid amber drive LEDs. The pool showed ONLINE with good SMART values after boot, and the alerts did not return after a second reboot. No cause was identified.
- The original poster of that thread chose a hardware RAID1 for the boot drive and left ZFS to the NVMe drives, because it "sounded like 'IT Mode or forget it.'"

In a [February 2021 thread](https://forum.proxmox.com/threads/hp-dl380-gen10-pve-advice-for-raid-controller.83144/), Proxmox staff advised an HBA instead of a RAID controller for ZFS or Ceph. The Proxmox administration guide names the alternative: "An HBA adapter or something like an LSI controller flashed in 'IT' mode is more appropriate." Two common LSI cards are compared in [9207-8i vs 9211-8i](/blog/lsi-9207-8i-vs-9211-8i). The [ZFS on enterprise hardware article](/blog/zfs-on-enterprise-hardware) and the [PERC H730 article](/blog/perc-h730-hba-mode) walk through the same trade-off on Dell hardware, and the [HBA330 comparison](/blog/dell-hba330-vs-h330) covers Dell's true HBA.

## Does the controller need its Smart Storage Battery when no logical drives exist?

HPE's documents do not say outright. The QuickSpecs state: "An HPE Smart Storage energy pack is required with Performance RAID controllers," which covers the P-class. The user guide describes the cache in terms of logical drives. Cache ratio can be changed only if "the controller has a cache that uses backup power" and "there are logical drives configured on the controller," with a default of 90% write and 10% read. Nothing in HPE's text describes the controller cache serving unconfigured drives, so a fully pass-through P408i-a most likely leaves its 2 GB cache unused, but HPE does not state that, and it does not say whether such a controller runs without the pack.

Keep the pack connected. Flash-backed write cache, in HPE's description, "uses flash devices to retain cache data and the energy pack to provide power during a power loss," and a missing pack shows up on the controller's FBWC LEDs as "The FBWC module is idle, and waiting for backup power." A boot mirror on the controller depends on the cache and the pack. The guide's energy pack figures:

| Energy pack | Recharge time | Backup duration |
|---|---|---|
| 96 W Smart Storage Battery | 2 hours | 150 seconds |
| 12 W Smart Storage Battery | 1 hour | 150 seconds |
| Smart Storage Hybrid Capacitor | "Not applicable; charge is immediate" in the table, "less than one minute" in the text | 60 seconds |

The guide says pack health appears in the iLO GUI under Power & Thermal, and in the controller tools and iLO Redfish under StorageController > CacheSummary. The SSA guide's sample `ssacli ctrl slot=N show` output includes "Cache Status," "Cache Backup Power Source" and "Battery/Capacitor Status" lines. HPE also notes that the type-a modular form factor "does not support the 3-pin controller backup power cable as power is delivered through the PCI connector." The E208i-a avoids the question: it has no cache memory and no energy pack requirement.

## What can break with P408i-a pass-through drives?

- **A blank drive is exposed immediately.** Under HPE's rule, any drive outside a logical drive or spare is presented. An OS installer will list newly inserted disks, so pick targets by serial number.
- **Pass-through drives skip controller encryption.** HPE lists Controller Based Encryption "for RAID volumes (HBA drives not supported)."
- **Host-managed SMR drives need pass-through.** HPE's SMR table marks host-managed and host-aware SAS and SATA SMR as "HBA Only," and device-managed SMR as unsupported.
- **ssacli and the OS must agree.** If the kernel lacks `smartpqi`, the controller is invisible, and the Kconfig note says `aacraid` will not substitute.
- **Metadata survives.** Wipe disks as shown above, because HPE RAID and ZFS labels persist until cleared.
- **Device names move.** Use `/dev/disk/by-id` paths for pools, not `sdX` names.
- **The mixed-mode wording changed between editions.** The 2020 guide says "cannot be disabled" and the 2023 guide omits it. Neither documents a switch, so plan around always-on pass-through and test after updates, since one owner saw a scare on the reboot after an `apt update`.
- **Alerts differ.** The automatic predictive-failure LED is RAID-only, so schedule `smartd` checks and ZFS scrubs. The [RAID levels article](/blog/raid-levels-comparison) explains why a RAID layer alone does not replace them.

An HPE 12G SAS Expander card extends the controller to as many as 28 drives, according to the guide, and the [SAS expander article](/blog/do-you-need-a-sas-expander-homelab) covers when one is worth buying.

## Sources

- [HPE: Smart Array SR Gen10 Controller User Guide, edition 11, September 2023 (copy hosted by Hitachi)](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/30-F5AC2861-011.pdf)
- [HPE: Smart Array SR Gen10 User Guide, edition 5, May 2020 (copy hosted by Hitachi)](https://itpfdoc.hitachi.co.jp/manuals/ha8000v/hard/Gen10/SA/879006-005_en.pdf)
- [HPE: Smart Array SR Gen10 Controllers QuickSpecs (mirrored copy)](https://edshop.edsystem.cz/fileshare/products/specification/hpe/a00047736enw%28439586%29.pdf)
- [HPE: Smart Storage Administrator User Guide, part 742648-008a, October 2016](https://usercontent.one/wp/ramsgaard.me/wp-content/uploads/2022/10/HPE_c03909334_HPE-Smart-Storage-Administrator-User-Guide.pdf?media=1661795354)
- [HPE: Software Delivery Repository, Management Component Pack](https://downloads.linux.hpe.com/SDR/repo/mcp/)
- [HPE: Software Delivery Repository package index for Ubuntu 24.04](https://downloads.linux.hpe.com/SDR/repo/mcp/dists/noble/current/non-free/binary-amd64/Packages)
- [HPE: ssacli 3.10 readme](https://downloads.hpe.com/pub/softlib2/software1/pubsw-linux/p1857046646/v122802/ssacli-3.10-3.0.x86_64.txt)
- [Linux kernel: smartpqi documentation](https://docs.kernel.org/scsi/smartpqi.html)
- [Linux kernel: smartpqi_init.c](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/smartpqi/smartpqi_init.c)
- [Linux kernel: smartpqi Kconfig](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/smartpqi/Kconfig)
- [Linux kernel: hpsa.c](https://raw.githubusercontent.com/torvalds/linux/master/drivers/scsi/hpsa.c)
- [pciutils: pci.ids database](https://raw.githubusercontent.com/pciutils/pciids/master/pci.ids)
- [FreeBSD: smartpqi(4) manual page](https://man.freebsd.org/cgi/man.cgi?query=smartpqi&sektion=4)
- [smartmontools: smartctl(8) manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html)
- [OpenZFS: Hardware](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [OpenZFS: zpool-labelclear(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-labelclear.8.html)
- [OpenZFS: Debian Bookworm Root on ZFS](https://openzfs.github.io/openzfs-docs/Getting%20Started/Debian/Debian%20Bookworm%20Root%20on%20ZFS.html)
- [Proxmox: Proxmox VE Administration Guide, host system administration](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html)
- [TrueNAS: Hardware Guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/)
- [Proxmox forum: downsides of using Smart Array P408i-a SR Gen10 in HBA mode, ZFS](https://forum.proxmox.com/threads/downsides-of-using-smart-array-p408i-a-sr-gen10-in-hba-mode-zfs.136214/)
- [Proxmox forum: HPE Smart Array E208i or E408i-a SR Gen 10 compatibility](https://forum.proxmox.com/threads/hpe-smart-array-e208i-or-e408i-a-sr-gen-10-compatibility.86417/)
- [Proxmox forum: HP DL380 Gen10 PVE advice for RAID controller](https://forum.proxmox.com/threads/hp-dl380-gen10-pve-advice-for-raid-controller.83144/)