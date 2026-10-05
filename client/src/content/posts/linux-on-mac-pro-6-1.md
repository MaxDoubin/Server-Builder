
## The short answer

Linux runs well on the 2013 Mac Pro 6,1, and it is easier than on the 2019 model because this Mac has no T2 chip: hold Option at power-on, pick the EFI Boot entry and install as you would on a PC. On kernel 6.19 or newer, such as Ubuntu 26.04 LTS or Proxmox VE 9.2 (both kernel 7.0), the FirePro D300, D500 and D700 use the amdgpu driver by default, while older kernels need `radeon.si_support=0 amdgpu.si_support=1`. The built-in Broadcom Wi-Fi needs a proprietary driver, so use the two Gigabit Ethernet ports for a server. Apple rates idle draw at 43 to 44 W, and GPU passthrough is unproven.

## Does the Mac Pro 6,1 have the T2 problems of newer Macs?

No. Apple's [list of Macs with the T2 chip](https://support.apple.com/en-us/103265) names only the "Mac Pro introduced in 2019", and [EveryMac](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.7-xeon-e5-gray-black-cylinder-late-2013-specs.html) identifies the Late 2013 model as MacPro6,1 with a 64-bit EFI. The Startup Security Utility settings that the [Mac Pro 7,1 guide](/blog/linux-on-mac-pro-7-1) walks through for Secure Boot and external boot media therefore do not apply.

Hold Option at power-on to reach [Startup Manager](https://support.apple.com/en-us/102603). The [Arch Wiki](https://wiki.archlinux.org/title/Mac) says it lists any EFI system partition that has a /EFI/BOOT/BOOTX64.EFI file as an "EFI Boot" entry. The same wiki says macOS is the only known method for installing firmware updates, and EveryMac lists Monterey as the newest macOS this Mac supports, so update to Monterey before you wipe the drive.

## Which Linux distributions work on the Mac Pro 6,1, and how do you boot the installer?

Any 64-bit UEFI distribution boots here. What differs is the kernel, because [kernel 6.19 changed the default driver](https://www.phoronix.com/news/Linux-6.19-Graphics-Drivers) for this Mac's GPUs.

| Release | Kernel | Default GPU driver | Flags needed |
|---|---|---|---|
| [Ubuntu 26.04 LTS](https://documentation.ubuntu.com/release-notes/26.04/summary-for-lts-users/) | 7.0 | amdgpu | No |
| [Proxmox VE 9.2](https://pve.proxmox.com/wiki/Roadmap) | 7.0 | amdgpu | No |
| Proxmox VE 9.1 | 6.17 | radeon | Yes |
| Ubuntu 24.04 LTS | 6.8 (GA) or 7.0 (HWE) | radeon on 6.8 | Yes on 6.8 |
| [Debian 13](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html) | 6.12 | radeon | Yes |

Owner reports confirm [Ubuntu, Linux Mint and Proxmox](https://oldpcguy.com/mac-pro-2013/) running here, including [Mint 22.1](https://forums.linuxmint.com/viewtopic.php?t=444231).

To boot the installer, write it to a USB stick (owners use balenaEtcher), shut the Mac down, press the power button and hold Option. Apple says to [plug in a wireless keyboard or use a wired one](https://support.apple.com/en-us/102603) and to wait a few seconds so the keyboard is recognized. Choose the icon labeled EFI Boot. If the screen goes black after you pick the installer, highlight the entry, press e, add `nomodeset` to the end of the line that starts with linux and press F10, [as an owner guide describes](https://oldpcguy.com/mac-pro-2013/).

## Should the FirePro D300, D500 and D700 use amdgpu or radeon?

Use amdgpu. It is the default from kernel 6.19, it is the only kernel driver that works with Mesa's Vulkan driver, and older kernels switch to it with two parameters.

<figure>
<img src="/images/blog/linux-on-mac-pro-6-1/radeon-hd-7970.jpg" alt="A Radeon HD 7970 graphics card with its cooler removed, showing the GPU package and memory chips" width="1200" height="552" loading="lazy" decoding="async">
<figcaption>A Radeon HD 7970 with its cooler off. Its Tahiti chip is the one in the D500 and D700, so the same amdgpu driver and kernel parameters apply. Photo: Aunva6, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Radeon_7970.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

All three cards are first-generation GCN ("Southern Islands") chips. [Apple](https://support.apple.com/en-us/112025) gives the memory, the [PCI ID database](https://pci-ids.ucw.cz/v2.2/pci.ids) names the Apple-specific IDs, and amdgpu's [device table](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/gpu/drm/amd/amdgpu/amdgpu_drv.c) maps them to chips:

| Model | VRAM | PCI ID | Chip | Closest Radeon |
|---|---|---|---|---|
| D300 | 2GB | 1002:6810 | Pitcairn | R9 270X/370X |
| D500 | 3GB | 1002:679e | Tahiti | HD 7870 XT |
| D700 | 6GB | 1002:6798 | Tahiti | HD 7970 / R9 280X |

Until 6.19, amdgpu support for these chips was [experimental and opt-in](https://www.phoronix.com/news/Linux-6.19-Graphics-Drivers), and on [Debian](https://wiki.debian.org/AtiHowTo) a card that both drivers support defaults to radeon. Mesa's RADV driver offers [Vulkan 1.3 on GCN 1](https://docs.mesa3d.org/drivers/radv.html) but is not supported by the radeon kernel driver. An April 2025 [owner report](https://forums.linuxmint.com/viewtopic.php?t=444231) shows OpenGL 4.6 and Vulkan 1.3.275 on a D300 under amdgpu.

On a kernel older than 6.19, add the parameters to /etc/default/grub, then run `sudo update-grub` and reboot:

```text
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash radeon.si_support=0 amdgpu.si_support=1"
```

Confirm that both cards use amdgpu (the `lspci` command comes from the [Arch Wiki](https://wiki.archlinux.org/title/AMDGPU), the log message from the kernel source):

```bash
lspci -k -d ::03xx                # each card: Kernel driver in use: amdgpu
sudo dmesg | grep "SI support"    # expect: SI support provided by amdgpu.
```

amdgpu also needs current firmware, which the Arch Wiki says each model requires to boot; Debian ships it in the [firmware-amd-graphics](https://wiki.debian.org/AtiHowTo) package.

Apple's [developer note TN2335](https://developer.apple.com/library/archive/technotes/tn2335/_index.html) says only the primary GPU provides output for the display, while the secondary handles compute and off-screen work. Linux lists both cards, and in the 2025 report the active monitor sat on the second one (bus 06:00.0), so do not assume the first card drives your screen.

## Do Wi-Fi and Bluetooth work on the Mac Pro 6,1?

Yes, but Wi-Fi needs Broadcom's proprietary driver. [iFixit](https://www.ifixit.com/Teardown/Mac+Pro+Late+2013+Teardown/20778) found a BCM4360 802.11ac chip and a BCM20702 Bluetooth 4.0 controller on the AirPort card, and an owner's report lists the Wi-Fi as [14e4:43a0 using the wl driver](https://forums.linuxmint.com/viewtopic.php?t=444231).

The in-kernel Broadcom drivers do not cover it. The Arch Wiki says [brcmsmac only supports old chipsets](https://wiki.archlinux.org/title/Broadcom_wireless) such as BCM4313, BCM43224 and BCM43225, and a February 2026 Ubuntu [bug report](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/2139532) shows brcmfmac failing on a 14e4:43a0 card with "unknown chip: BCM4360/3". Install the wl module instead, which [Debian's wiki](https://wiki.debian.org/wl) lists as supporting BCM4360 and describes as including a binary-only component:

```bash
sudo apt update && sudo apt install broadcom-sta-dkms
```

On Ubuntu 26.04 the older bcmwl-kernel-source package that many guides name is [gone from the release](https://packages.ubuntu.com/resolute/bcmwl-kernel-source), so install broadcom-sta-dkms. BCM4360 chips also [do not support WPA3](https://wiki.archlinux.org/title/Broadcom_wireless), so use WPA2.

Bluetooth runs on btusb: an [owner's inxi](https://forums.linuxmint.com/viewtopic.php?t=444231) shows an Apple Bluetooth host controller (USB 05ac:828d) with hci0 up. Broadcom controllers can load a patch file named after the controller's USB IDs, and the kernel's [btbcm driver](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/bluetooth/btbcm.c) logs "firmware Patch file not found" when there is none and carries on, so that line alone is not a failure.

## How do Thunderbolt 2 and the six ports behave on Linux?

The six ports share Thunderbolt buses, and Linux makes you authorize PCIe devices. Apple's [display guide](https://support.apple.com/en-us/101318) says to attach displays to different buses, never more than two per bus, and, if you use HDMI, to use only one of the bottom two Thunderbolt ports (Bus 0). It also says only one connected display lights up at power-on, so expect the boot picker on a single screen.

The [kernel documentation](https://docs.kernel.org/admin-guide/thunderbolt.html) says Apple systems use a software connection manager, which Linux runs at security level user: PCIe tunneling stays off until you authorize each device. Read the level, then authorize a device as root (domain0 and device 0-1 are the documentation's examples, so your numbers may differ):

```bash
cat /sys/bus/thunderbolt/devices/domain0/security
echo 1 > /sys/bus/thunderbolt/devices/0-1/authorized
```

Hot-plug is less predictable. One owner [reported](https://enotacoes.wordpress.com/2016/07/15/installing-ubuntu-on-a-mac-pro-61-late-2013/) in a 2020 live session that two NVMe devices connected at boot both mounted, but one that was unmounted and plugged back in was not recognized.

For host-to-host networking, the same documentation says the thunderbolt-net driver loads automatically when the other host runs macOS or Windows, creating a virtual Ethernet interface per port. This site's [Thunderbolt networking article](/blog/thunderbolt-networking) covers the Apple side.

## How loud and hot does the Mac Pro 6,1 get under Linux?

It stays quiet because one large fan cools everything, and the System Management Controller (SMC), not Linux, normally runs that fan. [iFixit](https://www.ifixit.com/Teardown/Mac+Pro+Late+2013+Teardown/20778) found a giant triangular heat sink shared by both GPUs and the CPU, a single fan that pulls air from under the case and out the top, and a power supply with no dedicated cooling. Apple specifies [12 dBA at idle](https://support.apple.com/en-us/112025).

<figure>
<img src="/images/blog/linux-on-mac-pro-6-1/dust-intake.jpg" alt="Dust collected at the air intake slots around the base of a cylindrical Mac Pro" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>Dust at the intake ring of a 2013 Mac Pro. One fan pulls air up through the base and across a shared heat sink, so a clogged intake heats both GPUs and the CPU at once. Photo: Atomicdragon136, <a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Pro_dust_bunnies.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Apple says the SMC controls [thermal features like fans](https://support.apple.com/en-us/102605). Linux's [applesmc driver](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/hwmon/applesmc.c) matches product names containing MacPro and can expose fan and temperature sensors. Even so, an [owner's inxi report](https://forums.linuxmint.com/viewtopic.php?t=444231) from a 6,1 read "Fan Speeds (rpm): N/A" while the CPU and two GPUs showed 54, 51 and 49 C, so run `sensors` before assuming Linux can read or set the fan. Some owners [install mbpfan](https://oldpcguy.com/mac-pro-2013/), a fan-control tool for Macs, but nothing reviewed here confirms it works on this model.

The GPUs are the weak point. Craig Federighi said in 2017 that Apple had ["designed ourselves into a bit of a thermal corner"](https://techcrunch.com/2017/04/06/transcript-phil-schiller-craig-federighi-and-john-ternus-on-the-state-of-apples-pro-macs/), and Apple's repair program covered [D500 and D700 units built February 8 to April 11, 2015](https://www.macrumors.com/2016/02/06/late-2013-mac-pro-video-issues-repair-program/) until May 30, 2018. Keep the bottom vents clear and test both GPUs under load before you buy one.

If the fans run fast at idle, reset the SMC: shut down, unplug the power cord, wait 15 seconds, plug it back in, wait 5 seconds and press the power button.

## Is the 2013 Mac Pro a good home server or Proxmox host?

It works as a quiet host, but it idles at 43 to 44 W, has one internal drive slot and has no proven GPU passthrough. Apple [measured](https://support.apple.com/en-us/102839) idle draw of 43 W (D300 and D500 models) and 44 W (D700) with only Finder open and no peripherals attached, and maximums of 205, 238 and 270 W. At 43 W around the clock you use about 377 kWh a year, roughly $69 at the [18.31 cents per kWh U.S. residential average for July 2026](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a), and every extra 10 W adds about $16. One [owner guide](https://oldpcguy.com/mac-pro-2013/) says owners often measure 65 to 95 W at idle with a display and accessories attached, and this site's [power monitoring guide](/blog/power-consumption-monitoring) shows how to measure your own.

Storage is the other limit. The internal SSD is a custom [PCIe 2.0 x4 design](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.7-xeon-e5-gray-black-cylinder-late-2013-specs.html) that Linux presented as /dev/sda in an [owner's report](https://forums.linuxmint.com/viewtopic.php?t=444231), and extra drives go in USB 3 or Thunderbolt enclosures. NVMe adapters work, but booting from NVMe needs the firmware that comes with macOS High Sierra or later, so [update it](https://oldpcguy.com/mac-pro-2013/) while the original SSD is still installed.

Proxmox installs: a February 2024 forum post [installed Proxmox VE 8.1.2](https://forum.proxmox.com/threads/intel-mac-pro-hardware.141064/) to a USB 3 M.2 enclosure after setting up rEFInd, which requires disabling SIP. In a June 2026 [write-up](https://www.vimoire.com/blog/2026/failing_gpu_passthrough_proxmox_macpro), Proxmox installed in about 20 minutes while Debian took over 12 hours and never reached a display manager. The same writer passed both D700s to a VM, but the guest never initialized them after trying ROM files and a vendor-reset patch. Treat passthrough as unproven; this site's [Proxmox GPU passthrough guide](/blog/gpu-passthrough-proxmox) covers the general method.

For headless use, install with a monitor and wired keyboard attached, then manage the host over SSH or the Proxmox web interface; no owner report reviewed here mentions needing a dummy display plug. One [owner guide](https://oldpcguy.com/mac-pro-2013/) calls sleep and wake unreliable, and Debian's wiki says [suspension should be disabled on servers](https://wiki.debian.org/Suspend) with a drop-in file named /etc/systemd/sleep.conf.d/nosuspend.conf:

```text
[Sleep]
AllowSuspend=no
AllowHibernation=no
AllowSuspendThenHibernate=no
AllowHybridSleep=no
```

## How do you install Linux on a Mac Pro 6,1, step by step?

1. Update macOS to Monterey and back up anything you need, because installing to the internal SSD [replaces macOS](https://oldpcguy.com/mac-pro-2013/).
2. Write an Ubuntu 26.04 LTS or Debian 13 installer to a USB stick, then connect a wired keyboard, a monitor and Ethernet.
3. Shut down, press the power button, hold Option and choose EFI Boot. If the screen stays black, reboot and add `nomodeset` as described above.
4. Install as on any UEFI PC. With GRUB, run `grub-install --removable` so the loader lands at /EFI/BOOT/BOOTX64.EFI, where the Mac's picker looks.
5. On first boot, remove `nomodeset`. On kernels older than 6.19, add the si_support parameters shown earlier and run `sudo update-grub`. On Debian, install `firmware-amd-graphics` first.
6. Install `broadcom-sta-dkms` if you want Wi-Fi; otherwise stay on Ethernet.
7. Check `lspci -k -d ::03xx`, `dmesg` and `sensors`.
8. If the Mac will be a server, add the nosuspend drop-in shown earlier.

## What breaks

**The installer shows a black screen.** One owner found that [`nomodeset` was needed on the 6,1 but not on a 5,1](https://enotacoes.wordpress.com/2016/07/15/installing-ubuntu-on-a-mac-pro-61-late-2013/), which points to the installer's default graphics mode setting failing on this model. Fix: add `nomodeset` for the installer only, as in the boot steps above.

**Only one display works, or the desktop is slow, after installing.** A leftover `nomodeset` keeps amdgpu from loading, and the Arch Wiki says amdgpu requires kernel mode setting. Fix: remove it and, on kernels before 6.19, add the si_support parameters; one owner reported [multi-monitor luck](https://enotacoes.wordpress.com/2016/07/15/installing-ubuntu-on-a-mac-pro-61-late-2013/) after swapping `nomodeset` for them on Fedora 34.

**Wi-Fi disappears after a kernel update.** The wl module is built outside the kernel with DKMS, and Ubuntu bug [2161038](https://bugs.launchpad.net/ubuntu/+source/broadcom-sta/+bug/2161038) recorded broadcom-sta-dkms failing to build on 24.04's 7.0 HWE kernel with an objtool error. Fix: keep Ethernet connected during upgrades and update the package; 26.04's version already carries the patch, and the 24.04 fix was accepted in August 2026.

**Wired Ethernet vanishes after installing the Wi-Fi driver on Arch.** Arch's broadcom-wl-dkms blacklists tg3, the driver for the Mac Pro's BCM57762 Ethernet ports. Fix: skip that driver on Arch and use Ethernet or a USB Wi-Fi adapter.

**The installed system is missing from the Option picker.** The Mac's picker detects Linux through the /EFI/BOOT/BOOTX64.EFI fallback file, and a [January 2026 forum poster](https://forum.proxmox.com/threads/proxmox-installs-on-external-ssd-but-mac-pro-2013-always-boots-back-to-macos.178945/) saw only Macintosh HD after installing Proxmox to an external SSD. Fix: reinstall the loader with `grub-install --removable`, or use rEFInd, which forum users say requires disabling SIP.

**Graphics artifacts, random restarts or no video.** Apple ran a repair program for some D500 and D700 units, and it ended May 30, 2018. Fix: no vendor repair remains, so test both GPUs under load before buying; Apple's program [replaced both cards](https://www.macrumors.com/2016/02/06/late-2013-mac-pro-video-issues-repair-program/) on an affected Mac.

## Frequently asked questions

### What is the best Linux distribution for the Mac Pro 6,1?

Ubuntu 26.04 LTS or Proxmox VE 9.2 if you want amdgpu without extra parameters, since both ship kernel 7.0. Debian 13 needs the two parameters on its 6.12 kernel and keeps Broadcom's Wi-Fi driver in non-free. An owner guide also reports Linux Mint running, so the choice mostly depends on the job.

### Can the Mac Pro 6,1 run Proxmox with GPU passthrough?

Proxmox itself installs and runs. Passthrough of the D-series cards is unproven, because the only detailed write-up reviewed here passed both GPUs to a VM but never got the guest to initialize them. Plan on CPU-only guests.

### Can I boot Linux from an NVMe SSD in the Mac Pro 6,1?

An owner guide says yes with an adapter, once the firmware that came with macOS High Sierra is installed, so update firmware while the original SSD is still in place. In an owner's report Linux saw the stock SSD as /dev/sda, so check device names before you partition.

### Can I keep macOS and dual boot?

Yes, if you install Linux to a separate drive or shrink the macOS partition in Disk Utility first. Installing to the internal SSD replaces macOS, and a Proxmox forum poster who installed to an external USB 3 disk left macOS untouched but had to change the efibootmgr boot order to keep booting it.

## What this means

If you already own a 6,1, update firmware from macOS, install Ubuntu 26.04 LTS or Debian 13, use amdgpu and rely on Ethernet; it makes a quiet workstation or a learning Proxmox host. It is a poor always-on server: idle draw costs about $69 a year, storage is one internal slot plus external enclosures, and the GPUs have a known failure history. Two owners, in a [Proxmox forum reply](https://forum.proxmox.com/threads/proxmox-installs-on-external-ssd-but-mac-pro-2013-always-boots-back-to-macos.178945/) and an [owner guide](https://oldpcguy.com/mac-pro-2013/), both suggest a mini PC for that job.

## References

- [Mac computers with the Apple T2 Security Chip](https://support.apple.com/en-us/103265)
- [Mac startup key combinations](https://support.apple.com/en-us/102603)
- [Mac Pro (Late 2013) Technical Specifications](https://support.apple.com/en-us/112025)
- [Use multiple displays with your Mac Pro (Late 2013)](https://support.apple.com/en-us/101318)
- [Reset the SMC of your Mac](https://support.apple.com/en-us/102605)
- [Mac Pro power consumption and thermal output](https://support.apple.com/en-us/102839)
- [Technical Note TN2335: Selecting a GPU for OpenCL on the Mac Pro (Late 2013)](https://developer.apple.com/library/archive/technotes/tn2335/_index.html)
- [Mac Pro Late 2013 Teardown, iFixit](https://www.ifixit.com/Teardown/Mac+Pro+Late+2013+Teardown/20778)
- [Mac Pro Quad Core 3.7 (Late 2013) specs, EveryMac](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.7-xeon-e5-gray-black-cylinder-late-2013-specs.html)
- [Apple Launches Repair Program for Late 2013 Mac Pro Video Issues, MacRumors](https://www.macrumors.com/2016/02/06/late-2013-mac-pro-video-issues-repair-program/)
- [Transcript of the April 2017 Apple pro Mac briefing, TechCrunch](https://techcrunch.com/2017/04/06/transcript-phil-schiller-craig-federighi-and-john-ternus-on-the-state-of-apples-pro-macs/)
- [Mac, ArchWiki](https://wiki.archlinux.org/title/Mac)
- [AMDGPU, ArchWiki](https://wiki.archlinux.org/title/AMDGPU)
- [Broadcom wireless, ArchWiki](https://wiki.archlinux.org/title/Broadcom_wireless)
- [AtiHowTo, Debian Wiki](https://wiki.debian.org/AtiHowTo)
- [wl, Debian Wiki](https://wiki.debian.org/wl)
- [Suspend, Debian Wiki](https://wiki.debian.org/Suspend)
- [USB4 and Thunderbolt, Linux kernel documentation](https://docs.kernel.org/admin-guide/thunderbolt.html)
- [amdgpu_drv.c, Linux kernel source](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/gpu/drm/amd/amdgpu/amdgpu_drv.c)
- [applesmc.c, Linux kernel source](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/hwmon/applesmc.c)
- [btbcm.c, Linux kernel source](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/bluetooth/btbcm.c)
- [Linux 6.19 GPU Driver Features, Phoronix](https://www.phoronix.com/news/Linux-6.19-Graphics-Drivers)
- [RADV, Mesa documentation](https://docs.mesa3d.org/drivers/radv.html)
- [PCI ID database](https://pci-ids.ucw.cz/v2.2/pci.ids)
- [Ubuntu 26.04 LTS release notes, summary for LTS users](https://documentation.ubuntu.com/release-notes/26.04/summary-for-lts-users/)
- [What's new in Debian 13, release notes](https://www.debian.org/releases/trixie/release-notes/whats-new.en.html)
- [Roadmap, Proxmox VE](https://pve.proxmox.com/wiki/Roadmap)
- [bcmwl-kernel-source in Ubuntu 26.04, package page](https://packages.ubuntu.com/resolute/bcmwl-kernel-source)
- [Launchpad bug 2139532: BCM4360 not supported by brcmfmac](https://bugs.launchpad.net/ubuntu/+source/linux/+bug/2139532)
- [Launchpad bug 2161038: broadcom-sta-dkms fails to build with kernel 7.0 HWE](https://bugs.launchpad.net/ubuntu/+source/broadcom-sta/+bug/2161038)
- [amdgpu support on a 2013 Mac Pro, Linux Mint Forums](https://forums.linuxmint.com/viewtopic.php?t=444231)
- [Intel Mac Pro hardware, Proxmox Support Forum](https://forum.proxmox.com/threads/intel-mac-pro-hardware.141064/)
- [Proxmox installs on external SSD but Mac Pro 2013 always boots back to macOS, Proxmox Support Forum](https://forum.proxmox.com/threads/proxmox-installs-on-external-ssd-but-mac-pro-2013-always-boots-back-to-macos.178945/)
- [Failing GPU passthrough on Proxmox to Debian host on MacPro 6,1, the vimoire](https://www.vimoire.com/blog/2026/failing_gpu_passthrough_proxmox_macpro)
- [The 2013 trash can Mac Pro in 2026, OldPCGuy](https://oldpcguy.com/mac-pro-2013/)
- [Installing Ubuntu on a Mac Pro 6,1 (late 2013) and 5,1 (mid 2010), E-notacoes](https://enotacoes.wordpress.com/2016/07/15/installing-ubuntu-on-a-mac-pro-61-late-2013/)
- [Electric Power Monthly, Table 5.6.A, U.S. Energy Information Administration](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a)
