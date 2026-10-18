
## The problem

Someone with an HP ProLiant Gen8 server and an embedded Smart Array P420i wants the operating system to see the drives without a [RAID](/blog/raid-levels-comparison) layer, usually for ZFS or another software storage stack. They need to know whether this controller supports HBA mode at all, which firmware and commands to use, and what stops working once the drives are exposed.

## HPE documentation does not confirm HBA mode on the P420i

The [HPE Smart Storage Administrator User Guide](https://usercontent.one/wp/ramsgaard.me/wp-content/uploads/2022/10/HPE_c03909334_HPE-Smart-Storage-Administrator-User-Guide.pdf?media=1661795354), dated October 2016, describes the mode in general terms: "In HBA mode, all physical drives are presented directly to the operating system and the hardware RAID engine is disabled." It lists "Enable HBA/RAID/Smart Array Mode operations" as a controller task with the footnote "This task is not available on all controller models," and it points readers to the controller user guide for model-specific support. The P420i is not named anywhere in that document.

<figure>
<img src="/images/blog/smart-array-p420i-hba-mode/photo-1.jpg" alt="HP ProLiant DL580 G7 rack server" width="1400" height="788" loading="lazy" decoding="async">
<figcaption>An HP ProLiant DL580 G7 server photographed in 2023, which its owner describes as fitted with an HP Smart Array P410i RAID controller. The P410i is on the hpsahba README's tested list, and a December 2018 kernel mailing list reply said the P410 controllers do not fully support HBA mode. Photo: Btrs, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:HP_ProLiant_DL580_G7_in_2023.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The [P420 QuickSpecs](https://bargainhardware.co.uk/media/quick-specs/storagectrl/HP_P420_CTL54_55.pdf), dated June 6, 2012, point the same way. They describe the P420 as "ideal for RAID 0/1, 1+0, 5, 50, 6 & 60" and list no HBA mode.

What exists is owner evidence. Owners of ProLiant ML350p Gen8 and DL360p Gen8 servers report that the `ssacli` tool accepted the mode on a P420i. The [babaei post](https://www.babaei.net/blog/disable-hp-proliant-ml350p-gen8-p420i-raid-controller-enable-hba-mode-pass-through-perform-freebsd-root-zfs-installation/) shows `Firmware Version: 8.32-0` in its controller output. The [hpsahba tool](https://github.com/im-0/hpsahba) says it "is able to enable or disable HBA mode on some HP Smart Array controllers." Its README lists the Smart Array P410i, P812, G6 P410 and G6 P212 as tested, all at firmware 6.64, and it does not mention the P420i.

A statement from the driver side concerns a different controller. In December 2018, Don Brace replied to a patch series for HBA mode on the P410i and wrote that the P410 controllers "do not fully support HBA mode" and that the driver should not add it. That reply is on the [Linux kernel mailing list](https://lkml.iu.edu/hypermail/linux/kernel/1812.1/07469.html). Treat HBA mode on a P420i as owner-reported and undocumented for this model, and test it on a server you can rebuild.

## Which firmware the P420i needs before HBA mode works

HPE gives no firmware number for HBA mode. The [Unraid forum post](https://forums.unraid.net/topic/91922-convert-hp-smart-array-controller-to-hba-mode/) from May 4, 2020, says, "For the P420 Smart Array, be sure your firmware is 6.6.8 or above," while an [alfter.us post](https://alfter.us/2024/03/28/disabling-raid-on-hp-smart-array-420i-controllers/) from March 28, 2024, says that 3.xx firmware would "gripe about HBA mode not being supported" and that 8.32-0 firmware should work.

The [babaei post](https://www.babaei.net/blog/disable-hp-proliant-ml350p-gen8-p420i-raid-controller-enable-hba-mode-pass-through-perform-freebsd-root-zfs-installation/) also shows `Firmware Version: 8.32-0` on its controller, and it advises updating to the latest firmware first, "or else this might not work!"

For Smart Array Gen8 controllers, HPE says to "update the controller firmware to take advantage of the advanced features of SAAP without the need of license." That sentence covers Smart Array Advanced Pack features rather than HBA mode, but it is HPE's direction on Gen8 firmware, so update to the newest Smart Array firmware before you switch. One [Proxmox forum reply](https://forum.proxmox.com/threads/hp-smart-array-p420i-hba-mode-complete-guide.142350/) says firmware v8 is on the SPP image P03093_001_spp-Gen8.1-SPPGen81.4.iso.

## Switching a P420i to HBA mode with ssacli

Start by clearing the array. HPE's guide warns that entering HBA mode "will disable any drives configured using a Smart Array until the configuration is cleared." The Unraid post deletes "all Virtual Disks from the firmware" before switching, and the babaei post says to delete all the RAID configurations on the controller by pressing F8 at boot time. Back up anything on the array first. The Proxmox tutorial warns that without a backup, "your data will be wiped!"

Install the tool. HPE's guide uses the name ssacli, and the Unraid post uses hpssacli. The alfter.us post, whose RAID-disabling step uses a Debian live install image, adds HPE's package repository, imports HPE's signing keys, and installs the tool with apt:

```bash
curl -fsSL https://downloads.linux.hpe.com/SDR/hpePublicKey2048_key1.pub \
  | gpg --dearmor | tee /usr/share/keyrings/hpePublicKey.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/hpePublicKey.gpg] http://downloads.linux.hpe.com/SDR/repo/mcp jammy/current non-free" > /etc/apt/sources.list.d/hp-mcp.list
apt update && apt install -y ssacli
```

Find the controller slot. Most posts use slot 0 for the P420i, but the Unraid post used slot 2 for its P420, so read the slot from your own output:

```bash
ssacli ctrl all show
```

The output includes a line such as `Smart Array P420i in Slot 0 (Embedded)`.

Set the mode, then reboot:

```bash
ssacli ctrl slot=0 modify hbamode=on
```

HPE's syntax is a controller selector followed by `modify [hbamode=on|off|?]`, with the example `controller slot=1 modify hbamode=on`. HPE's guide says "A reboot is required for HBA mode to be enabled." The hpsahba README says its change takes effect without a reboot, but that README tests other controllers, so reboot after you set the mode.

Confirm the change:

```bash
ssacli controller slot=0 show | grep -i hba
```

The correct output includes `HBA Mode Enabled: True`, the line the babaei post shows. To revert, set `hbamode=off` with the same controller selector.

Some posts add `forced`, as in `ssacli controller slot=0 modify hbamode=on forced`. A [HardForum thread](https://hardforum.com/threads/hp-dl380p-gen8-p420i-controller-hbamode.1852528/) includes steps that the poster attributes to HP, and they use the keyword: "Here are the steps HP prescribed to convert the P420i into HBA mode." HPE's hbamode syntax lists only on, off and the query form, with no forced option. Start with the plain command, and read the output before you try `forced`.

## What the OS sees after the switch

HPE says that in HBA mode all physical drives are presented to the operating system, but what the system sees depends on the operating system and the driver. The babaei post, which installs FreeBSD root on ZFS, says the first 8 disks, `da0` through `da7`, will be the SAS disks. It also lists an internal SD card and an installer USB drive, and it warns that the order of the two "could change."

Not every report is that clean. In the same Unraid thread, a P420 owner saw one drive or none, with a [syslog](/blog/syslog-centralized-logging) line that read "problem getting id," and replaced the card with a different HBA.

The driver appears to matter. In a [2016 TrueNAS forum thread](https://www.truenas.com/community/threads/hp-dl360p-gen8-p420i-controller.47956/) about a DL360p Gen8, the poster enabled HBA mode, and FreeNAS, which uses the ciss driver, detected only the first 2 drives. Booted from an Ubuntu ISO, the same poster saw every drive. The [FreeBSD ciss(4) man page](https://man.freebsd.org/cgi/man.cgi?query=ciss&sektion=4) says the driver supports controllers implementing the CISS v1.04 specification, and its hardware list includes the HP Smart Array P420.

The [hpsahba README](https://github.com/im-0/hpsahba) says the kernel needs patches before it sees and uses disks in HBA mode, and that this functionality is "disabled by default." Because the README does not list the P420i, treat that patch as untested on this model.

## Why boot from the array disks fails

Disks behind a controller in HBA mode cannot be boot devices on the servers reported. The babaei post says the server "won't be able to boot from any disk connected in HBA mode to the controller!" A Proxmox forum reply says it more briefly: "Unfortunately you cannot boot from disk in HBA mode." The hpsahba README is more cautious: "Some servers may not be able to boot from disks attached to controller in HBA mode."

The workarounds keep the boot path off the array. The babaei post installs only the `/boot` partition on an internal SD card, with the FreeBSD root on ZFS on the disks, and it warns that "placing only a bootloader such as GRUB, rEFInd or other similar tools won't work." Another forum reply reports that a USB device in the internal slot worked "instead of a SD card," and a third suggests onboard SATA as the boot device. A single-disk RAID 0 volume for each disk is the other route, and the babaei post says that "this is not recommended."

## Using the disks with ZFS

Vendor guidance on ZFS is consistent. The [TrueNAS hardware guide](https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/) says "There are countless warnings against using hardware RAID cards with TrueNAS," and that ZFS and TrueNAS "provide a built-in RAID that protects your data better than any hardware RAID card." For Broadcom controllers, it says to "Flash using the latest IT or Target Mode firmware to disable the optional RAID functionality." The [Proxmox wiki](https://pve.proxmox.com/wiki/ZFS_on_Linux) says "ZFS needs to communicate directly with the disks," and that an HBA adapter or an LSI controller flashed in IT mode "is more appropriate."

<figure>
<img src="/images/blog/smart-array-p420i-hba-mode/photo-2.jpg" alt="Back side of an LSI SAS9211-8i PCIe x8 SAS host bus adapter circuit board" width="1400" height="1050" loading="lazy" decoding="async">
<figcaption>The back of an LSI SAS9211-8i SAS host bus adapter, board H3-25250-02B, photographed in 2013. The Proxmox wiki names an HBA or an LSI controller flashed to IT mode as the more appropriate choice for ZFS. Photo: Solomon203, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_SAS9211-8i_H3-25250-02B_rear.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Owner and forum reports are mixed. The 2016 FreeNAS poster could not get any drives beyond the first two to enumerate, and a TrueNAS forum member later wrote that the ciss driver "does not work that well under the heavy loads FreeNAS and ZFS can place on it." An iXsystems staff member in a [2021 TrueNAS thread](https://www.truenas.com/community/threads/best-with-raid-controllers-or-raid-z-software.94587/) wrote, "if you're on a ciss/aacraid/etc driver then buy an HBA." A [HardForum reply](https://hardforum.com/threads/hp-dl380p-gen8-p420i-controller-hbamode.1852528/) dated January 30, 2026 says the steps "worked perfectly" on a DL360p Gen8 for Proxmox with ZFS, using a PCIe adapter for the system drives. The outcome depends on the operating system, the driver and the boot path.

## What breaks

- **HBA mode disables the drives in your arrays.** HPE's guide says entering HBA mode disables any drives configured with a Smart Array until the configuration is cleared, and that a reboot is required before the mode takes effect. Fix: back up the data, delete every logical drive, run `ssacli ctrl slot=0 modify hbamode=on`, reboot, and confirm `HBA Mode Enabled: True`.
- **The controller refuses the command.** One owner report describes a P420i on 3.xx firmware that would "gripe about HBA mode not being supported." The hpsahba README says regular tools, like ssacli, report HBA mode as not supported, and it lists no P420i among its tested controllers. Fix: update to the newest Smart Array firmware, delete the logical drives, and read `ssacli controller slot=0 show`. If the mode still fails, stop, and do not treat hpsahba as a fix for a P420i.
- **The server won't boot from the disks.** Disks in HBA mode cannot serve as boot devices on the servers reported, so the bootloader has to live somewhere else. Fix: put it on an internal USB device, an internal SD card or onboard SATA, and reboot once to prove it before you trust the array.
- **Some drives never appear under the ciss driver.** The 2016 FreeNAS poster saw only the first two drives, while the same poster's Ubuntu ISO detected all of them. Fix: count the drives in your target operating system before you build a pool, and if that system uses ciss, use an HBA for ZFS.
- **Old tutorials use options the HPE syntax does not list.** Some posts use `hpssacli` and the `forced` keyword, and the HPE guide's hbamode syntax has neither. Fix: use `ssacli`, run the plain `hbamode=on` command first, and read the output before adding `forced`.

## What this means

On a P420i, HBA mode is an owner-reported result, not a documented feature for this model. If you try it, update the firmware to the newest Smart Array release, clear the logical drives, set `hbamode=on`, reboot, and confirm the output before you trust the disks. For ZFS, the vendor guidance points to an HBA flashed to IT mode. For ZFS on Dell servers, see [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware).

## References

- https://forum.proxmox.com/threads/hp-smart-array-p420i-hba-mode-complete-guide.142350/
- https://www.babaei.net/blog/disable-hp-proliant-ml350p-gen8-p420i-raid-controller-enable-hba-mode-pass-through-perform-freebsd-root-zfs-installation/
- https://alfter.us/2024/03/28/disabling-raid-on-hp-smart-array-420i-controllers/
- https://forums.unraid.net/topic/91922-convert-hp-smart-array-controller-to-hba-mode/
- https://www.truenas.com/community/threads/hp-dl360p-gen8-p420i-controller.47956/
- https://www.truenas.com/community/threads/best-with-raid-controllers-or-raid-z-software.94587/
- https://hardforum.com/threads/hp-dl380p-gen8-p420i-controller-hbamode.1852528/
- https://github.com/im-0/hpsahba
- https://usercontent.one/wp/ramsgaard.me/wp-content/uploads/2022/10/HPE_c03909334_HPE-Smart-Storage-Administrator-User-Guide.pdf?media=1661795354
- https://bargainhardware.co.uk/media/quick-specs/storagectrl/HP_P420_CTL54_55.pdf
- https://lkml.iu.edu/hypermail/linux/kernel/1812.1/07469.html
- https://www.truenas.com/docs/scale/gettingstarted/tnhardwareguide/
- https://pve.proxmox.com/wiki/ZFS_on_Linux
- https://man.freebsd.org/cgi/man.cgi?query=ciss&sektion=4
