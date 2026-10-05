
## The short answer

Linux runs on the Mac Pro 7,1, tower or rack, once you set Secure Boot to No Security and allow external boot media in Startup Security Utility, and only on a kernel with the T2 patches that the [t2linux project](https://wiki.t2linux.org/state/) builds for Ubuntu, Fedora, Arch and others. The internal SSD, USB, Thunderbolt and the two 10GbE ports use mainline kernel drivers, and Wi-Fi works once you extract Apple's firmware from macOS. t2linux rates AMD GPUs and the MacPro7,1 as partially working: GPUs can crash, and PCIe address-space problems may need the Infinity Fabric Link removed. [Apple documents the Afterburner card](https://support.apple.com/en-us/101662) only for macOS, so keep macOS installed as the firmware source and recovery path.

## What does the T2 chip change for Linux?

The T2 chip decides what the Mac Pro will boot and controls its internal SSD, so a stock Linux installer will not start on factory settings. Its Boot ROM verifies iBoot, iBoot checks the T2 kernel, and the T2 then checks the UEFI firmware, which is ["initially available only to the T2 chip"](https://support.apple.com/guide/security/boot-process-for-an-intel-based-mac-sec5d0fab7c6/web). By default, Apple states, "an Intel-based Mac that supports secure boot trust only content signed by Apple."

<figure>
<img src="/images/blog/linux-on-mac-pro-7-1/t2-chip.jpg" alt="An illustration of the Apple T2 chip on a logic board" width="720" height="739" loading="lazy" decoding="async">
<figcaption>An illustration of Apple's T2 security chip. Its Secure Boot settings decide whether a Mac Pro 7,1 will start Linux at all. Photo: Henriok, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Apple_T2_APL1027.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

[Phoronix reported on November 5, 2018](https://www.phoronix.com/news/Apple-T2-Blocks-Linux-UEFI) that such Macs "will not be able to boot Linux operating systems" by default, with an update noting that Startup Security Utility might disable Secure Boot, the step t2linux's guide now walks through. The kernel knows this model too: since Linux 5.19 a [quirk list that includes MacPro7,1](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=155ca952c7ca19aa32ecfb7373a32bbc2e1ec6eb) skips reading UEFI certificate variables, because on T2 Macs "a page fault occurs in Apple firmware code and EFI runtime services are disabled." The [T2 article](/blog/apple-t2-security-chip) covers the chip's other jobs.

### Startup Security Utility settings for Linux

Hold Command-R at power on to enter macOS Recovery, choose Utilities, then Startup Security Utility, and sign in with an administrator account, [as Apple describes](https://support.apple.com/en-us/102522). It only runs in Recovery, so attach a display and keyboard.

| Setting | Choices | Pick for Linux |
|---|---|---|
| Secure Boot | Full Security (default), Medium Security, No Security | No Security. Medium accepts only an OS "properly signed by Apple (macOS) or Microsoft (Windows)", and [t2linux says](https://wiki.t2linux.org/guides/preinstall/) even shim-signed GRUB will not boot with Secure Boot on. |
| Allowed boot media | Disallow external or removable media (default), or allow | Allow it for the install, then disallow it again once Linux is on the internal SSD. |
| Firmware password | Off by default | Optional. It requires a password to boot anything but the default OS. |

Apple says the Mac ["doesn't support booting from network volumes"](https://support.apple.com/en-us/102522), so network installs are out.

## Which distributions and kernels support the Mac Pro 7,1?

Any distribution works if it runs a T2 kernel, and t2linux supplies installers for the common ones. Its [preinstall](https://wiki.t2linux.org/guides/preinstall/) and [post-install](https://wiki.t2linux.org/guides/postinstall/) guides list these:

| Distribution | T2 installer ISO | T2 kernel source |
|---|---|---|
| Ubuntu, flavors and Mint | T2-Ubuntu, T2-Mint | T2-Debian-and-Ubuntu-Kernel |
| Fedora | fedora-iso | fedora-kernel |
| Arch Linux | archiso-t2 | linux-t2-arch |
| NixOS | nixos-t2-iso | nixos-hardware |

CachyOS, EndeavourOS and Gentoo have T2 images or pages too. t2linux says a T2 kernel is required to get "the keyboard, trackpad, touch bar, audio, fan, and Wi-Fi working." The Mac Pro has no built-in keyboard or trackpad, so audio, fans and Wi-Fi are what it buys you.

The [Debian and Ubuntu kernel repository](https://github.com/t2linux/T2-Debian-and-Ubuntu-Kernel) covers Ubuntu 22.04, 24.04, 25.10 and 26.04 plus Debian 12, 13 and testing, and says it "will try to keep up with kernel new releases." Its [newest release](https://github.com/t2linux/T2-Debian-and-Ubuntu-Kernel/releases) on October 5, 2026 was v7.2.9-2, dated October 4. Mainline picked up the Mac Pro pieces over time:

| Kernel | What it added |
|---|---|
| 5.4 | NVMe quirks for Apple's 2018 and later controllers, so the internal SSD works |
| 5.19 | MacPro7,1 in the EFI certificate quirk list |
| 6.3 | brcmfmac firmware selection for BCM4364 B2 and B3, with the Mac Pro listed as B3 |

### What apple-bce and t2bce provide

apple-bce talks to the T2 over its Buffer Copy Engine. Its [README](https://github.com/t2linux/apple-bce-drv) calls it "a driver for MacBook models 2018 and newer, implementing the VHCI (required for mouse/keyboard/etc.) and audio functionality." VHCI is a virtual USB host controller. The driver [binds to PCI ID 106b:1801](https://raw.githubusercontent.com/t2linux/apple-bce-drv/aur/apple_bce.c), which the [PCI ID database](https://pci-ids.ucw.cz/v2.2/pci.ids) names "T2 Bridge Controller".

On a Mac Pro the audio side matters most, since t2linux says the T2 audio device covers [the 3.5mm headphone port and the built in speakers](https://wiki.t2linux.org/guides/audio-config/). t2linux kernels now use [t2bce](https://github.com/deqrocks/t2bce), a replacement split into t2bce_core, t2bce_dma, t2bce_vhci and t2bce_audio. An [Omarchy bug report](https://github.com/omacom/omarchy/issues/10699) from September 7, 2026 says linux-t2 7.1.4 renamed the driver and 7.1.8 has no apple-bce at all, so older guides fail.

## How does Linux see the internal SSD modules?

Linux talks to a T2-based NVMe controller, and the kernel has handled it since 5.4. Apple fits [one or two modules depending on capacity](https://support.apple.com/en-us/101654) that are "paired to and encrypted by the T2 Security Chip", and iFixit found the SSD ["bound to the T2 chip"](https://www.ifixit.com/Teardown/Mac+Pro+2019+Teardown/128922). The PCI ID database lists Apple device 106b:2005 as "ANS2 NVMe Controller".

It is not a normal drive. The [kernel patch](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=66341331ba0d2de4ff421cdc401a1e34de50502a) handles "twice-as-big SQ entries for the IO queues" and only interrupt vector 0 working, and a [follow-up](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=d38e9f04ebf667d9cb8185b45bff747485f1d3e9) found it will "blow up (and shut the machine down)" on queue tag collisions. Claims that Linux cannot use this SSD predate 5.4.

t2linux's guides assume the internal EFI partition is `/dev/nvme0n1p1`. Apple does not document how two modules are presented, so check with [lsblk](https://man.archlinux.org/man/lsblk.8) and [nvme list](https://man.archlinux.org/man/nvme-list.1) before partitioning, and match by size if you also have a PCIe NVMe card:

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
sudo nvme list
```

Linux also ["cannot read the internal SSD's macOS APFS partition's Data and System volume"](https://wiki.t2linux.org/state/). PCIe NVMe cards are a separate case: William Lam found that [only the Apple SSDs are "cryptographically tied to the T2 chip"](https://williamlam.com/2020/01/esxi-on-the-new-2019-apple-mac-pro.html), and the [storage expansion article](/blog/mac-pro-storage-expansion) covers those cards.

## How do Wi-Fi, Bluetooth and the 10GbE ports behave?

Wi-Fi needs Apple firmware that comes out of macOS, Bluetooth needs none, and the 10GbE ports should work with the stock kernel driver.

### Wi-Fi and Bluetooth (BCM4364 firmware)

Apple lists [802.11ac Wi-Fi and Bluetooth 5.0](https://support.apple.com/en-us/118461), and Dortania's guide gives the chip as ["MacPro7,1 - 4364B3(Bluetooth 5.0)"](https://dortania.github.io/Wireless-Buyers-Guide/Airport.html), a Broadcom BCM4364 revision B3. The kernel's [brcmfmac patch](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=6a142f70774fd10350a52a10ba1297d52da46780) lists both "Mac Pro (2019)" and "Mac Pro (2019, Rack)" as B3, so tower and rack behave the same.

The firmware is the catch: t2linux says it can be [legally obtained only from macOS](https://wiki.t2linux.org/roadmap/) because it is non-redistributable. Its [firmware guide](https://wiki.t2linux.org/guides/wifi-bluetooth/) offers five methods, and Method 5 downloads a macOS Recovery image from Monterey to Sonoma. The [firmware script](https://wiki.t2linux.org/tools/firmware.sh) says Bluetooth firmware is needed only for MacBookPro15,4, MacBookPro16,3 and MacBookAir9,1, so a Mac Pro needs the Wi-Fi files only. Confirm the load with this command and look for a `brcmfmac4364b3-pcie` line:

```bash
sudo journalctl -k --grep=brcmfmac
```

Two regressions matter. t2linux says Arch Linux and EndeavourOS hit a [wpa_supplicant 2.11 bug](https://wiki.t2linux.org/guides/wifi-bluetooth/) that iwd or `brcmfmac.feature_disable=0x82000` works around, and kernel 6.13 broke BCM4364 Wi-Fi until [a fix in 6.14](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=0e9724d0f89e8d77fa683e3129cadaed7c6e609d).

### The two 10GbE ports

Apple specifies [two 10Gb Ethernet ports](https://support.apple.com/en-us/118461) that run at 1, 2.5, 5 or 10Gb over RJ-45. iFixit found "2x aQuantia AQtion AQC107-B1-C" controllers, the kernel's [atlantic driver](https://docs.kernel.org/networking/device_drivers/ethernet/aquantia/atlantic.html) is "compatible with AQC-100, AQC-107, AQC-108 based ethernet adapters", and William Lam read the device ID as 0x07b1, the driver's [AQC107 entry](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/net/ethernet/aquantia/atlantic/aq_common.h). Check with [lspci -nn](https://man.archlinux.org/man/lspci.8) and [ethtool -i](https://man.archlinux.org/man/ethtool.8), expecting two devices at 1d6a:07b1 and `driver: atlantic`:

```bash
lspci -nn | grep -i 1d6a
ethtool -i <interface>
```

T2 Macs also expose an internal USB Ethernet interface, which t2linux [renames t2_ncm and tells NetworkManager to ignore](https://wiki.t2linux.org/guides/postinstall/). Do not mistake it for a 10GbE port.

## Which AMD GPUs work, and what about the Afterburner card?

All nine MPX options are AMD parts that amdgpu covers, yet t2linux marks both "AMD GPUs" and "MacPro7,1" as partially working. The [kernel docs](https://docs.kernel.org/gpu/amdgpu/index.html) say the driver supports "all AMD Radeon GPUs based on the Graphics Core Next (GCN), Radeon DNA (RDNA), and Compute DNA (CDNA) architectures."

### The nine GPU options

IDs come from the PCI ID database and the amdgpu source, and link data from Apple's specs:

| Option | Architecture and PCI ID | Infinity Fabric Link |
|---|---|---|
| Radeon Pro 580X | Polaris 10, 1002:67df | Not listed |
| Radeon Pro W5500X | [RDNA](https://9to5mac.com/2020/07/01/apple-begins-offering-new-radeon-pro-w5500x-gpu-option-for-mac-pro/), no named ID | Not listed |
| Radeon Pro W5700X | Navi 10, 1002:7310 | Not listed |
| Radeon Pro Vega II | Vega 20, 1002:66a3 | Bridge, two cards |
| Radeon Pro Vega II Duo | Vega 20 x2, 1002:66a3 | Preinstalled jumper |
| Radeon Pro W6800X | [RDNA 2](https://ir.amd.com/news-events/press-releases/detail/1016/new-amd-radeon-pro-w6000x-series-gpus-bring-groundbreakinghigh-performance-amd-rdna-2-architecture-to-mac-pro), Navi 21, 1002:73ab | Bridge, two cards |
| Radeon Pro W6900X | RDNA 2, Navi 21, 1002:73a2 | Bridge, two cards |
| Radeon Pro W6800X Duo | RDNA 2, Navi 21 x2, 1002:73ab | Jumper, or bridge for two Duos |
| Radeon Pro W6600X | [RDNA 2](https://www.cined.com/amd-radeon-pro-w6600x-for-apple-mac-pro-available-now/), no named ID | Not listed |

The [t2linux state page](https://wiki.t2linux.org/state/) gives one status for all AMD GPUs: changing resolution, using DRI_PRIME and other actions can cause crashes. This command stops them, as does adding `amdgpu.dpm=0` to the kernel command line:

```bash
echo high | sudo tee /sys/bus/pci/drivers/amdgpu/0000:??:??.?/power_dpm_force_performance_level
```

The Mac Pro-specific warning is about address space: "Users have encountered PCIe Address Space issues, with auto remap breaking," and removing the Infinity Fabric Link (bridge or jumper) may help. [Apple says](https://support.apple.com/en-us/101899) the Vega II Duo ships with the link preinstalled, so for it that fix means pulling the jumper.

Owner reports add detail. A [GitHub issue opened June 29, 2026](https://github.com/CachyOS/linux-cachyos/issues/907) describes two Vega II cards that freeze on kernel 7.1.1 and later but ran fine on 7.0.12. A [Proxmox owner](https://github.com/pi0n00r/pve-macpro7-1) passed an "AMD RX 580 / Pro 580X" through to a VM on a T2-patched 6.17 kernel. If Thunderbolt does not work, t2linux suggests [adding `pcie_ports=native`](https://wiki.t2linux.org/state/).

### The Afterburner card

Treat it as macOS-only. Apple documents Afterburner for [Final Cut Pro, Motion, Compressor and QuickTime Player](https://support.apple.com/en-us/101662) and says its decode acceleration "is available in macOS and is not available when using Windows with Boot Camp." It accelerates ProRes and ProRes RAW decoding and playback, not encoding. Neither the t2linux state page nor the PCI ID database mentions it, so do not expect Linux to use it. See the [Afterburner article](/blog/mac-pro-afterburner-card) for the card itself.

## What about fans, thermals and rack versus tower?

Fan control works through a small daemon, and tower and rack are the same machine to Linux. The hardware is [three axial fans in the front and a blower in the rear](https://www.macrumors.com/2019/12/12/apple-engineers-explain-mac-pro-cooling-features/).

<figure>
<img src="/images/blog/linux-on-mac-pro-7-1/mac-pro-on-wheels.jpg" alt="A silver 2019 Mac Pro tower on wheels beside a desk" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A 2019 Mac Pro tower on Apple's optional wheels. The rack model takes the same Linux setup. Photo: Gavin Lckg, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Pro_2019_on_wheels.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

t2linux says on some Macs the fan [works out of the box](https://wiki.t2linux.org/guides/fan/), and the daemon is for forcing speeds. T2 fan support lives in t2linux's kernel patches, such as [3006-applesmc-fan-support-on-T2-Macs.patch](https://github.com/t2linux/linux-t2-patches). Enable the daemon:

```bash
sudo systemctl enable --now t2fanrd
```

Its `/etc/t2fand.conf` has `low_temp`, `high_temp`, `speed_curve` and `always_full_speed` per fan, per the [T2FanRD readme](https://github.com/GnomedDev/T2FanRD). [Its source](https://raw.githubusercontent.com/GnomedDev/T2FanRD/master/src/main.rs) reads the CPU's coretemp sensor and the first GPU, `card0`, and uses the hotter reading, so extra GPUs are ignored. On multi-GPU builds set conservative values or `always_full_speed`.

Apple identifies [both enclosures as MacPro7,1](https://support.apple.com/en-us/102887). [The rack](https://support.apple.com/en-us/111907) is 8.67 inches high, 18.98 wide and 21.24 deep at 38.8 pounds, with rails in a separate box and its two Thunderbolt 3 ports on the front instead of the top. Apple rates operation at 10 to 35 C (50 to 95 F), so watch intake temperatures in a closed rack. The [rack-mount homelab article](/blog/mac-pro-rack-mount-homelab) covers fitting one.

## Can you dual boot Linux and macOS?

Yes, and t2linux says you should. Its [roadmap](https://wiki.t2linux.org/roadmap/) says macOS is the only legal source of the Wi-Fi firmware, doubles as a backup, and brings updates: "macOS updates often bring along certain firmware updates, which tend to be useful for Linux as well."

In macOS Disk Utility choose Partition, then Add Partition, not Volume, because [the size cannot change later](https://wiki.t2linux.org/guides/preinstall/). Hold Option at startup to open Startup Manager, which Apple says [lets you choose other startup disks](https://support.apple.com/en-us/102603), and hold Control while you pick your Linux entry to make it the default. After a macOS upgrade, [the default reverts to macOS](https://wiki.t2linux.org/guides/startup-manager/).

Apple lists macOS Tahoe 26 as the [newest compatible release](https://support.apple.com/en-us/102887) for the 2019 Mac Pro, and Production Expert [quotes Apple](https://www.production-expert.com/production-expert-1/intel-mac-users-apple-gives-12-month-countdown) saying Tahoe "will be the last release for Intel-based Mac computers." Keep Tahoe updated while Apple ships it, then let Linux carry the machine.

## How do you install Linux on a Mac Pro 7,1?

This is the Ubuntu route from the [t2linux Ubuntu guide](https://wiki.t2linux.org/distributions/ubuntu/installation/). Fedora and Arch differ at the partitioning step.

1. Update macOS and back up. Create a bootable macOS installer if you may delete macOS later.
2. In Disk Utility, partition the internal volume with Add Partition, name it Linux, pick exFAT, and choose the final size.
3. Download the T2-Ubuntu ISO and write it to a USB drive in macOS Terminal, using a USB-A port on the Apple I/O card:
   ```bash
   diskutil list
   sudo diskutil unmountDisk /dev/diskX
   sudo dd if=path/to/linux.iso of=/dev/rdiskX bs=1m
   ```
4. Shut down, hold Command-R, open Utilities, then Startup Security Utility. Set Secure Boot to No Security and allow external or removable media.
5. Restart holding Option and pick the orange EFI Boot entry. If there are two, try the rightmost first.
6. Install with manual partitioning only. Mount `/dev/nvme0n1p1` at `/boot/efi` and the partition you made at `/` as ext4 or btrfs. Never choose automatic partitioning.
7. Reboot holding Option and choose EFI Boot. If Ubuntu's GRUB shows a blank screen, install rEFInd.
8. Run `get-apple-firmware get_from_macos` for Wi-Fi, or `get_from_online` if macOS is gone (it needs wired internet).
9. Check the kernel with [uname -r](https://man.archlinux.org/man/uname.1) and the firmware with the journalctl command above.
10. Install t2fanrd from t2linux's apt repository and enable it as shown above.
11. If you used a stock ISO or want [LUKS](/blog/luks-at-rest-encryption), follow the post-install guide: add `intel_iommu=on iommu=pt pm_async=off` to the kernel command line and load the t2bce modules early.

## What breaks

**The installer says "A software update is required to use this startup disk."** Secure Boot is still enforced, or the ISO sits on an APFS or HFS+ partition, [per t2linux](https://wiki.t2linux.org/guides/preinstall/). Fix: set No Security, allow external media, and try the other EFI Boot entry.

**Ubuntu boots to a blank screen from Startup Manager.** t2linux says [Ubuntu's GRUB does not boot through Startup Manager](https://wiki.t2linux.org/distributions/ubuntu/installation/) for many users. Fix: install rEFInd and boot the kernel from it.

**There is no Wi-Fi.** The firmware is missing, the kernel is 6.13, or broadcom-wl is installed, which t2linux says is not the driver for these Macs. Fix: run the firmware script, move off 6.13, and use only brcmfmac.

**The screen freezes under amdgpu.** t2linux lists crashes on AMD GPUs, and one Vega II owner reports a regression on 7.1.1. Fix: boot with `amdgpu.dpm=0`, remove the Infinity Fabric Link if address errors appear, or pin kernel 7.0.12.

**The initramfs build fails or the LUKS keyboard is dead.** Current T2 kernels ship t2bce modules, and the Omarchy report says "mkinitcpio cannot resolve the module." Fix: list `t2bce_dma t2bce_core t2bce_vhci` in the initramfs and drop apple-bce.

## Frequently asked questions

### Which Linux distribution should I use on a Mac Pro 7,1?

Pick one with a t2linux ISO. The [roadmap](https://wiki.t2linux.org/roadmap/) says Arch has the most documentation, EndeavourOS needs little configuration, Ubuntu needs less post-configuration, and Fedora mostly works out of the box but needs the Wi-Fi guide.

### Can a Mac Pro 7,1 run Proxmox or ESXi?

An owner reports [Proxmox VE 9.1.2 on a T2-patched 6.17 kernel](https://github.com/pi0n00r/pve-macpro7-1) with [GPU passthrough](/blog/gpu-passthrough-proxmox) working. William Lam installed ESXi with Secure Boot disabled, and notes [VMware will no longer pursue hardware certification](https://williamlam.com/2020/01/esxi-on-the-new-2019-apple-mac-pro.html) for the 7,1.

### Can installing Linux brick the Mac Pro?

t2linux says nobody has broken a machine by installing Linux and following its guides closely, though it takes no responsibility. The real risk is data loss during partitioning, so back up first.

### What happens when macOS drops Intel Macs?

The machine keeps running Tahoe, and Linux keeps working. The T2 kernel repository tracks upstream, with 7.2.9 newest on October 4, 2026, while Apple's Intel support is finite.

## What this means

Use the Mac Pro 7,1 for Linux if you accept the T2 steps: set No Security, install a t2linux image, add the Wi-Fi firmware, and run t2fanrd. Keep macOS Tahoe for firmware and recovery. A single-GPU configuration without the Infinity Fabric Link is the lowest-risk choice, because t2linux's only Mac Pro warning concerns that link and the one detailed multi-GPU failure involves two Vega II cards. Leave the Afterburner card for macOS work.

## References

- [t2linux wiki: Device support and state of features](https://wiki.t2linux.org/state/)
- [t2linux wiki: Pre install steps](https://wiki.t2linux.org/guides/preinstall/)
- [t2linux wiki: Installing a kernel for T2 support](https://wiki.t2linux.org/guides/postinstall/)
- [t2linux wiki: Wi-Fi and Bluetooth](https://wiki.t2linux.org/guides/wifi-bluetooth/)
- [t2linux wiki: Fan control](https://wiki.t2linux.org/guides/fan/)
- [t2linux wiki: Roadmap](https://wiki.t2linux.org/roadmap/)
- [t2linux wiki: Startup Manager](https://wiki.t2linux.org/guides/startup-manager/)
- [t2linux wiki: Ubuntu and Linux Mint installation](https://wiki.t2linux.org/distributions/ubuntu/installation/)
- [t2linux wiki: Audio configuration](https://wiki.t2linux.org/guides/audio-config/)
- [t2linux firmware script](https://wiki.t2linux.org/tools/firmware.sh)
- [Apple Support: About Startup Security Utility on a Mac with the Apple T2 Security Chip](https://support.apple.com/en-us/102522)
- [Apple Platform Security: Boot process for an Intel-based Mac](https://support.apple.com/guide/security/boot-process-for-an-intel-based-mac-sec5d0fab7c6/web)
- [Apple Support: Mac Pro (2019) Technical Specifications](https://support.apple.com/en-us/118461)
- [Apple Support: Mac Pro (Rack, 2019) Technical Specifications](https://support.apple.com/en-us/111907)
- [Apple Support: Install or replace SSD modules in your Mac Pro (2019)](https://support.apple.com/en-us/101654)
- [Apple Support: About the Afterburner accelerator card for Mac Pro (2019)](https://support.apple.com/en-us/101662)
- [Apple Support: Identify your Mac Pro model](https://support.apple.com/en-us/102887)
- [Apple Support: Mac startup key combinations](https://support.apple.com/en-us/102603)
- [Apple Support: Use the Radeon Pro Vega II Duo MPX Module with your Mac Pro (2019)](https://support.apple.com/en-us/101899)
- [Linux kernel commit: efi: Do not import certificates from UEFI Secure Boot for T2 Macs](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=155ca952c7ca19aa32ecfb7373a32bbc2e1ec6eb)
- [Linux kernel commit: nvme-pci: Add support for Apple 2018+ models](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=66341331ba0d2de4ff421cdc401a1e34de50502a)
- [Linux kernel commit: nvme-pci: Support shared tags across queues for Apple 2018 controllers](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=d38e9f04ebf667d9cb8185b45bff747485f1d3e9)
- [Linux kernel commit: wifi: brcmfmac: pcie: Perform correct BCM4364 firmware selection](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=6a142f70774fd10350a52a10ba1297d52da46780)
- [Linux kernel commit: wifi: brcmfmac: use random seed flag for BCM4355 and BCM4364 firmware](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=0e9724d0f89e8d77fa683e3129cadaed7c6e609d)
- [Linux kernel source: atlantic driver aq_common.h](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/plain/drivers/net/ethernet/aquantia/atlantic/aq_common.h)
- [Linux kernel documentation: drm/amdgpu AMDgpu driver](https://docs.kernel.org/gpu/amdgpu/index.html)
- [Linux kernel documentation: Marvell(Aquantia) AQtion Driver](https://docs.kernel.org/networking/device_drivers/ethernet/aquantia/atlantic.html)
- [PCI ID Repository](https://pci-ids.ucw.cz/v2.2/pci.ids)
- [GitHub: t2linux/apple-bce-drv](https://github.com/t2linux/apple-bce-drv)
- [GitHub: apple_bce.c in t2linux/apple-bce-drv](https://raw.githubusercontent.com/t2linux/apple-bce-drv/aur/apple_bce.c)
- [GitHub: deqrocks/t2bce](https://github.com/deqrocks/t2bce)
- [GitHub: t2linux/T2-Debian-and-Ubuntu-Kernel](https://github.com/t2linux/T2-Debian-and-Ubuntu-Kernel)
- [GitHub: T2-Debian-and-Ubuntu-Kernel releases](https://github.com/t2linux/T2-Debian-and-Ubuntu-Kernel/releases)
- [GitHub: t2linux/linux-t2-patches](https://github.com/t2linux/linux-t2-patches)
- [GitHub: GnomedDev/T2FanRD](https://github.com/GnomedDev/T2FanRD)
- [GitHub: T2FanRD main.rs](https://raw.githubusercontent.com/GnomedDev/T2FanRD/master/src/main.rs)
- [GitHub: CachyOS linux-cachyos issue 907, Mac Pro 7,1 AMD Radeon Pro Vega II](https://github.com/CachyOS/linux-cachyos/issues/907)
- [GitHub: pi0n00r/pve-macpro7-1, GPU passthrough on Mac Pro 7,1 with Proxmox VE](https://github.com/pi0n00r/pve-macpro7-1)
- [GitHub: Omarchy issue 10699, installer still writes apple-bce](https://github.com/omacom/omarchy/issues/10699)
- [William Lam: ESXi on the new 2019 Apple Mac Pro](https://williamlam.com/2020/01/esxi-on-the-new-2019-apple-mac-pro.html)
- [Phoronix: Apple's New Hardware With The T2 Security Chip Will Currently Block Linux From Booting](https://www.phoronix.com/news/Apple-T2-Blocks-Linux-UEFI)
- [iFixit: Mac Pro 2019 Teardown](https://www.ifixit.com/Teardown/Mac+Pro+2019+Teardown/128922)
- [MacRumors: Apple Engineers Explain New Mac Pro's Innovative Cooling Features](https://www.macrumors.com/2019/12/12/apple-engineers-explain-mac-pro-cooling-features/)
- [Arch manual pages: lsblk(8)](https://man.archlinux.org/man/lsblk.8)
- [Arch manual pages: nvme-list(1)](https://man.archlinux.org/man/nvme-list.1)
- [Arch manual pages: lspci(8)](https://man.archlinux.org/man/lspci.8)
- [Arch manual pages: ethtool(8)](https://man.archlinux.org/man/ethtool.8)
- [Arch manual pages: uname(1)](https://man.archlinux.org/man/uname.1)
- [Dortania: Wireless Buyer's Guide, Airport](https://dortania.github.io/Wireless-Buyers-Guide/Airport.html)
- [9to5Mac: Apple begins offering new Radeon Pro W5500X GPU option for Mac Pro](https://9to5mac.com/2020/07/01/apple-begins-offering-new-radeon-pro-w5500x-gpu-option-for-mac-pro/)
- [CineD: AMD Radeon PRO W6600X for Apple Mac Pro Available Now](https://www.cined.com/amd-radeon-pro-w6600x-for-apple-mac-pro-available-now/)
- [AMD: New AMD Radeon PRO W6000X Series GPUs Bring AMD RDNA 2 Architecture to Mac Pro](https://ir.amd.com/news-events/press-releases/detail/1016/new-amd-radeon-pro-w6000x-series-gpus-bring-groundbreakinghigh-performance-amd-rdna-2-architecture-to-mac-pro)
- [Production Expert: Intel Macs And macOS Tahoe, What The End Of Support Actually Means](https://www.production-expert.com/production-expert-1/intel-mac-users-apple-gives-12-month-countdown)
