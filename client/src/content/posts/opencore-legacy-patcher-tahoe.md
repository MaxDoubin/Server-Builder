
## The short answer

OpenCore Legacy Patcher (OCLP) supports macOS Tahoe 26 only as a pre-release: [3.0.0-rc.1 and 3.0.0-rc.2](https://github.com/dortania/OpenCore-Legacy-Patcher/releases/tag/3.0.0-rc.2), both published on October 4, 2026, which the project warns can cause "instability, system crashes, and potential data loss." The latest stable release, 2.5.1 (September 19, 2026), stops at macOS Sequoia 15, and OCLP has no plans to support macOS 27 Golden Gate, which dropped every Intel Mac. The project has published no list of Macs tested on Tahoe, and the T2 Macs that Tahoe dropped have no published working path. For an unsupported Mac you depend on, stay on Sequoia or older and try Tahoe on a spare disk.

## Does OpenCore Legacy Patcher support macOS Tahoe?

It does in pre-release and does not in the stable build. [Pull request 1187, "Implement support for macOS Tahoe,"](https://github.com/dortania/OpenCore-Legacy-Patcher/pull/1187) merged 42 commits into the main branch on October 4, 2026. The [3.0.0 changelog](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/main/CHANGELOG.md) lists Tahoe support, improved wireless patches, improved non-Metal graphics patches, restored FileVault 2 support on macOS 26 and USB mappings for macOS 26.

The same day, the project published two release candidates, separated by [one commit](https://github.com/dortania/OpenCore-Legacy-Patcher/compare/3.0.0-rc.1...3.0.0-rc.2): "Update HDA patch and enable Tahoe patching without developer enablement." The [rc.1 source](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/3.0.0-rc.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py) refuses to root patch anything newer than Sequoia unless a developer file exists. The [rc.2 source](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/sys_patch/patchsets/detect.py) raises the limit to Tahoe. [PatcherSupportPkg](https://github.com/dortania/PatcherSupportPkg/releases) 2.0.0 and 2.0.1 (October 3 and 4, 2026) added the Tahoe patch files, credited to EduCovas and ASentientBot.

The documentation has not caught up. The [README](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/main/README.md) says OCLP "officially supports patching to run macOS Big Sur through Tahoe installs," yet its feature list stops at Sequoia. The [FAQ](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html) says the patcher "is designed to target macOS Big Sur 11.x to macOS Sequoia 15.x," and the [supported models page](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html) never mentions Tahoe. Treat "officially" as intent, not a tested-hardware list.

## What is the latest OpenCore Legacy Patcher version?

The latest stable version is 2.5.1, and the newest build is the 3.0.0-rc.2 pre-release. Dates come from the project's [tags page](https://github.com/dortania/OpenCore-Legacy-Patcher/tags).

| Version | Published | Status | macOS range in its source |
| :--- | :--- | :--- | :--- |
| 3.0.0-rc.2 | October 4, 2026 | Pre-release | Big Sur through Tahoe |
| 3.0.0-rc.1 | October 4, 2026 | Pre-release | Tahoe only with a developer file |
| 2.5.1 | September 19, 2026 | Latest stable | [Big Sur through Sequoia](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/2.5.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py) |
| 2.4.1 | September 1, 2025 | Older stable | [Big Sur through Sequoia](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/2.4.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py) |

The in-app updater only [asks GitHub for the release marked Latest](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/support/updates.py), so it never offers a release candidate. Download `OpenCore-Patcher.pkg` from the Releases page yourself, and only from `github.com/dortania/OpenCore-Legacy-Patcher`. Third-party sites rank for these searches, and at least one, opencorelegacypatcher.net, says "Independent guide. Not affiliated with Apple or Dortania" while listing 2.4.1 as the current stable version.

## Which Macs can run Tahoe, with or without OCLP?

Apple's own Tahoe list holds only four Intel Macs, and every other Intel Mac needs a patcher or an older macOS. [Apple's compatibility page](https://support.apple.com/en-us/122867) lists the MacBook Pro (16-inch, 2019), MacBook Pro (13-inch, 2020, four Thunderbolt 3 ports), iMac (Retina 5K, 27-inch, 2020) and Mac Pro (2019). All four are [T2 Macs](https://support.apple.com/en-us/103265), and none needs OCLP.

<figure>
<img src="/images/blog/opencore-legacy-patcher-tahoe/macbook-pro-2019.jpg" alt="Keyboard of a space gray 2019 16-inch MacBook Pro" width="1200" height="628" loading="lazy" decoding="async">
<figcaption>A 2019 16-inch MacBook Pro, one of only four Intel Macs on Apple's Tahoe list. It needs no patcher for Tahoe, and macOS 27 leaves it behind. Photo: Jack Baty from Grand Rapids, MI, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:2019_16-inch_MacBook_Pro_(49183242933).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Tahoe dropped the 13-inch and 15-inch MacBook Pro from 2018 to 2019, the two-port 2020 13-inch MacBook Pro, the 2020 MacBook Air, the 2018 Mac mini, the iMac Pro and the 2019 iMac, [per the project](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/1167). Every one except the iMac has a T2 chip, and the project wrote in 2025 that "T2 machines have panic issues when booting the OS through OpenCorePkg," with panics still occurring. The project's Sequoia page traces the panic to an [AppleKeyStore timeout with the T2 chip](https://dortania.github.io/OpenCore-Legacy-Patcher/SEQUOIA-DROP.html).

The picture is not uniform. The same page says the MacBookPro15,2 and Macmini8,1 did not panic in the project's own tests, but [Low End Mac](https://lowendmac.com/2025/oclp-tahoe-and-2018-mac-mini-a-no-go-so-far/) reported a failed Tahoe attempt on a 2018 Mac mini in June 2025, and nothing published says Tahoe boots on either. For the chip itself, see [Apple's T2 chip in the Mac Pro](/blog/apple-t2-security-chip).

Older Macs are in scope: the README lists "Supports Penryn and newer Macs," and the models page excludes PowerPC and Apple silicon. The rc.2 source has Tahoe-specific code for the graphics classes below, for T1 (Touch ID) Macs and for audio, and [it allows non-Metal acceleration on Tahoe](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/constants.py). That shows intent, not testing. The [release notes](https://github.com/dortania/OpenCore-Legacy-Patcher/releases/tag/3.0.0-rc.2) list no models, and the [non-Metal](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/108) and legacy Metal tracking issues still end at Sequoia.

| GPU class | Typical Macs | Tahoe handling in the rc.2 source |
| :--- | :--- | :--- |
| Non-Metal: Intel HD 3000, NVIDIA Tesla, AMD TeraScale | 2008 to 2011 | Acceleration allowed on Tahoe |
| Metal 3802: Intel Ivy Bridge and Haswell, NVIDIA Kepler | 2012 to 2015 | Replaces the [RenderBox Metal library](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/sys_patch/patchsets/shared_patches/tahoe_graphics.py) on disk |
| Metal 31001: Intel Broadwell, AMD GCN, Polaris, Vega, Navi | 2013 to 2017, upgraded Mac Pros | Same patch plus Tahoe driver bundles, and GCN cards need a Kernel Debug Kit |

## What does the end of Intel support in macOS 27 mean for OCLP?

It means Tahoe is the last macOS OCLP will target. Apple released macOS 27 Golden Gate on September 14, 2026, and it [runs only on Apple silicon](https://www.apple.com/macos/). [MacRumors](https://www.macrumors.com/2026/09/14/macos-golden-gate-marks-the-end-of-an-era-2/) confirmed that none of the four Intel Macs on Apple's Tahoe list can run Golden Gate.

The OCLP team said on June 15, 2026 that "there are currently no plans to attempt working with Golden Gate." Its [issue 1183](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/1183) says Apple removed most Intel kernel and driver extensions in beta 1 and that what remains "is not enough to grant entry to this release of macOS." OCLP also [does not support Apple silicon](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html), so there is nothing for it to patch beyond Tahoe.

The team has also shrunk. [AppleInsider](https://appleinsider.com/articles/26/03/24/opencore-legacy-patcher-faces-uncertainty-with-the-end-of-intel-mac-support-nearing) reported in March 2026 that lead developer Mykola Grymalyuk had left for a job at Apple, and the project [stopped taking donations on March 22, 2026](https://opencollective.com/opencore-legacy-patcher/updates/closing-off-to-new-donations). In June it said it could not "provide ETAs as before."

Apple says macOS 26 is ["the last macOS release with full support for Intel-based Mac computers"](https://support.apple.com/en-gb/guide/deployment/depd567c9ffa/web) and that Intel Macs keep getting security updates "for three years." The Eclectic Light Company says Tahoe 26.7 [began its first two years of security-only support](https://eclecticlight.co/2026/09/14/apple-has-released-macos-golden-gate-and-security-updates-to-tahoe-26-7-sequoia-15-8/) while Sequoia 15.8 began its final year. A patched Mac on Tahoe may therefore get Apple fixes about a year longer than one on Sequoia, but each Tahoe update can break root patches that a small team must repair.

## How do you install or update OCLP safely?

Back up first, test on a spare disk and treat every macOS update as a reinstall of the patches. The steps follow the project's [installer](https://dortania.github.io/OpenCore-Legacy-Patcher/INSTALLER.html) and [update](https://dortania.github.io/OpenCore-Legacy-Patcher/UPDATE.html) guides.

1. Read the Model Identifier in System Information and check the [models page](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html) and Apple's Tahoe list. If Apple supports your Mac, use Software Update instead.
2. Update the Mac to its newest native macOS first, which the project calls "extremely recommended" for current firmware.
3. Back up with Time Machine, which [needs a drive at least twice your Mac's capacity](https://support.apple.com/en-us/104984), and keep a second copy under the [3-2-1 rule](/blog/backup-strategy-321-rule). A [Time Machine restore can break](https://dortania.github.io/OpenCore-Legacy-Patcher/TIMEMACHINE.html) while root patches are installed, so [test a restore](/blog/restore-drills-that-matter).
4. Download 2.5.1 for Sequoia and older, and a release candidate only for a machine you can wipe.
5. In the app, choose Create macOS Installer. If you build the USB drive on a different Mac than the target, select the target model in Settings first. The project recommends 32GB because later Sonoma and Sequoia installers do not fit with patches on 16GB.
6. Build and install OpenCore to the USB drive, hold Option at startup, pick the EFI Boot entry and install to a spare disk. On a Touch Bar Mac, erase only the volume, not the whole disk, or the T1 firmware is lost.
7. After the first boot, install OpenCore to the internal disk and apply root patches over Ethernet, because without a connection the first pass may install only the Wi-Fi driver.
8. Turn off "Download new updates when available," which the project says can break a patched Mac by staging changes into the system volume.
9. After each macOS update, update OCLP, rebuild OpenCore on the internal disk and reinstall root patches. The project prefers a USB installer over System Settings for major upgrades.

To see which patcher built your OpenCore, run this in Terminal:

```
nvram 4D1FDA02-38C7-4A6A-9CC6-4BCCA8B30102:OCLP-Version
```

It prints a version such as `3.0.0`. Both release candidates report 3.0.0, so note which release you downloaded.

To back out, choose Revert Root Patches in the app. Do not delete OpenCore from a Mac that needs it to boot, because the [project says](https://dortania.github.io/OpenCore-Legacy-Patcher/UNINSTALL.html) the Mac then shows the prohibited symbol.

## What do root patches, SIP and FileVault change?

Root patches write older drivers into the system volume, which is why a patched Mac is not a normal Mac. The [project](https://dortania.github.io/OpenCore-Legacy-Patcher/POST-INSTALL.html) says they cover graphics, Wi-Fi, Bluetooth, Touch Bar and T1, camera and USB 1.1 drivers. They also break macOS's sealed system volume, which is why every update downloads a [full copy of macOS](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html) and wipes the patches.

<figure>
<img src="/images/blog/opencore-legacy-patcher-tahoe/macbook-pro-2012-ports.jpg" alt="Left side of a mid-2012 Retina MacBook Pro showing the MagSafe 2 port, two Thunderbolt ports and a USB port" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A mid-2012 Retina MacBook Pro. OCLP groups its Ivy Bridge and Kepler graphics as legacy Metal, which needs root patches on Ventura and newer. Photo: JJ163, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:2012_MacBook_Pro_Retina_15%22_Twin_ThunderBolt_Ports.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

### System Integrity Protection and AMFI

Apple describes [System Integrity Protection](https://support.apple.com/en-us/102149) as "a security technology designed to help prevent potentially malicious software from modifying protected files and folders." On Ventura and newer, OCLP says "All unsupported systems require lowered SIP," and you cannot re-enable SIP after patching "without potentially breaking the current install." Its [patch notes](https://dortania.github.io/OpenCore-Legacy-Patcher/PATCHEXPLAIN.html) also add the boot argument `amfi=0x80`, which disables Apple Mobile File Integrity so unsigned root patches load. A patched Mac has weaker system protection than a native one.

### FileVault on Tahoe

The project reported that Tahoe turns FileVault on during installation, "leading to issues with volume decryption," and 3.0.0 restores FileVault 2 support on macOS 26. The rc.2 source [still stops root patching when FileVault is on](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/sys_patch/patchsets/detect.py) unless OCLP has patched APFS to allow it. [Apple advises](https://support.apple.com/guide/mac-help/protect-data-on-your-mac-with-filevault-mh11785/mac) keeping the recovery key somewhere other than the encrypted disk.

## Which macOS should your Mac run?

Pick the newest macOS your Mac runs natively or with a stable OCLP release, and test Tahoe only on spare hardware. Apple's newest Tahoe is 26.7.1 ([September 28, 2026](https://support.apple.com/en-us/100100)), and the project has not said which 26.x builds its release candidates were tested on. The sources checked for this article held no independent test reports of them. Sequoia is in its final year of updates, so plan any Tahoe move for 2027, after a stable 3.x.

| Mac generation | Examples | Tahoe status | Recommendation |
| :--- | :--- | :--- | :--- |
| 2019 to 2020 Intel Macs on Apple's list | MacBook Pro 16-inch 2019, iMac 2020, Mac Pro 2019 | Native | Use Software Update. Tahoe is the last macOS for them. |
| 2018 to 2020 Macs Tahoe dropped | MacBook Pro 2018 to 2019, Mac mini 2018, MacBook Air 2020, iMac Pro, iMac 2019 | No published OCLP path (T2 panics, and Apple removed the analog audio driver) | Stay on [Sequoia](https://support.apple.com/en-us/120282), which Apple supports on these. |
| 2018 to 2019 MacBook Air | MacBookAir8,1 and 8,2 | Not supported by OCLP (T2) | Sonoma is its last native macOS and no longer gets security updates. |
| 2016 to 2017 Macs | Touch Bar MacBook Pro, MacBook, iMac 2017 | Tahoe patch code exists, T1 included | Test install candidate, with Sequoia as the daily system. |
| 2013 to 2015 Macs with Metal GPUs | Retina MacBook Pro, iMac 2013 to 2015 | Tahoe graphics code exists | Best candidates among unsupported Macs, after a stable 3.x. |
| 2012 Macs and the 2013 Mac Pro | Ivy Bridge MacBook Pro, Mac Pro 6,1 | Code exists, no AVX2 | Stay on Sequoia or older. |
| 2008 to 2011 Macs, 2009 to 2012 Mac Pro | Early unibody MacBook Pro, Mac Pro 5,1 | Allowed in code, untested | Stay on Monterey or older. |

The last two rows matter because some applications crash with "illegal instruction" on CPUs without AVX2, and AMD Navi cards do not work in 2008 to 2012 Mac Pros on Ventura and newer, [per the project](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html). [AppleInsider](https://appleinsider.com/articles/26/03/24/opencore-legacy-patcher-faces-uncertainty-with-the-end-of-intel-mac-support-nearing) suggested Monterey for owners of 2008 and 2009 Macs, and on Monterey a Mac Pro with an upgraded GPU that does not need its stock Wi-Fi can skip root patching, per the [post-install guide](https://dortania.github.io/OpenCore-Legacy-Patcher/POST-INSTALL.html). Macs with 2GB of RAM cannot install Sonoma or newer.

## What breaks

**Graphics acceleration and Wi-Fi vanish after a macOS update.** Updates replace the system volume and wipe root patches. Fix: open OCLP, update it, rebuild OpenCore on the internal disk and reinstall root patches over Ethernet, so downloads such as the Kernel Debug Kit arrive in one pass.

**A T2 Mac panics at boot.** The T2 chip times out when OpenCore boots the Mac, and the AppleKeyStore driver panics. Fix: none exists in OCLP, so stay on the last native macOS for that model.

<figure>
<img src="/images/blog/opencore-legacy-patcher-tahoe/mac-mini-2018.jpg" alt="Top view of a 2018 Mac mini in black and white" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A 2018 Mac mini, one of the T2 Macs that Tahoe dropped. Low End Mac reported in June 2025 that a Tahoe install on this model failed with OCLP. Photo: Khaosaming, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_mini_2018.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

**Audio, Touch Bar, Wi-Fi or USB input stops working on Tahoe.** The project listed wireless, T1 and USB patches as broken in 2025, Apple removed `AppleHDA.kext` for analog audio, and USB 1.1 drivers have been missing since Ventura. Fix: use rc.2 or newer, which updates the audio patch, and never wipe a Touch Bar Mac's whole disk. For keyboards on older Macs, see the FAQ below.

**Fusion Drive volumes appear split, or FileVault blocks patching.** Apple dropped Fusion Drive support in Tahoe, and Tahoe turns FileVault on during installation. Fix: the project has published no Fusion Drive workaround, so keep those Macs on Sequoia or move the system to a single SSD. For FileVault, keep your recovery key and use a build that restores support.

**Apps crash, or Apple features are missing.** Newer apps need AVX or AVX2 instructions, and Apple Intelligence and iPhone Mirroring need hardware OCLP cannot supply. Fix: run older app versions or an older macOS, because the missing features cannot be restored.

## Frequently asked questions

### Is there a stable OpenCore Legacy Patcher release for Tahoe?

No. As of October 5, 2026 the only Tahoe builds are the 3.0.0 release candidates, and the team has said it "cannot provide ETAs as before." In September 2025 Low End Mac reported a [goal of late fall or early winter](https://lowendmac.com/2025/macos-26-0-tahoe/) for 3.0.0, and that window passed.

### Can OCLP run macOS 27 Golden Gate?

No. Golden Gate needs Apple silicon, OCLP supports only Intel Macs, and the team says it has no plans to attempt it.

### Does OCLP work on a 2018 Mac mini or a 2019 15-inch MacBook Pro?

There is no published Tahoe support for either. These T2 Macs are on Apple's Sequoia list, so Sequoia runs natively.

### Why is the keyboard not working after installing macOS with OCLP?

Many Macs from mid-2010 and earlier, and the 2011 Mac mini, use USB 1.1 controllers, and macOS dropped those drivers in Ventura. The [project's guide](https://dortania.github.io/OpenCore-Legacy-Patcher/TROUBLESHOOT-HARDWARE.html) says to put a USB hub between the Mac and an external keyboard until root patches install. It covers Ventura and newer and has no Tahoe-specific advice.

### Are the Tahoe forks on GitHub safe to use?

The README and release notes do not mention them. Forks that claim Tahoe patches, such as OCLP-Plus on the InsanelyMac forum, come from other authors. OCLP installs a privileged helper and rewrites the system volume, so use only Dortania's releases.

## What this means

OCLP's Tahoe support is real but unfinished, and it is the project's last chapter. Keep unsupported Macs on the newest macOS that runs well on them, which is Sequoia with 2.5.1 for most 2013 to 2017 models, and run Tahoe on a spare disk until a stable 3.x arrives. If you run a 2019 Mac Pro, Tahoe is native and final, and [running a rack-mount Mac Pro](/blog/mac-pro-rack-mount-homelab) covers that machine.

## References

- [OpenCore Legacy Patcher 3.0.0-rc.2 release notes (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/releases/tag/3.0.0-rc.2)
- [Pull request 1187, Implement support for macOS Tahoe (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/pull/1187)
- [OpenCore Legacy Patcher changelog (raw file)](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/main/CHANGELOG.md)
- [Comparison of 3.0.0-rc.1 and 3.0.0-rc.2 (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/compare/3.0.0-rc.1...3.0.0-rc.2)
- [3.0.0-rc.1 root patch detection source, detect.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/3.0.0-rc.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py)
- [3.0.0-rc.2 root patch detection source, detect.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/sys_patch/patchsets/detect.py)
- [2.5.1 root patch detection source, detect.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/2.5.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py)
- [2.4.1 root patch detection source, detect.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/2.4.1/opencore_legacy_patcher/sys_patch/patchsets/detect.py)
- [3.0.0-rc.2 updater source, updates.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/support/updates.py)
- [3.0.0-rc.2 constants source, constants.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/constants.py)
- [3.0.0-rc.2 Tahoe graphics patch source, tahoe_graphics.py](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/d622cd5de86e5cb9a8c975c2809dbdbd2822c86e/opencore_legacy_patcher/sys_patch/patchsets/shared_patches/tahoe_graphics.py)
- [PatcherSupportPkg releases (GitHub)](https://github.com/dortania/PatcherSupportPkg/releases)
- [OpenCore Legacy Patcher tags page (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/tags)
- [OpenCore Legacy Patcher README (raw file)](https://raw.githubusercontent.com/dortania/OpenCore-Legacy-Patcher/main/README.md)
- [OpenCore Legacy Patcher FAQ](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html)
- [OpenCore Legacy Patcher supported models](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html)
- [OpenCore Legacy Patcher guide: creating macOS installers](https://dortania.github.io/OpenCore-Legacy-Patcher/INSTALLER.html)
- [OpenCore Legacy Patcher guide: updating](https://dortania.github.io/OpenCore-Legacy-Patcher/UPDATE.html)
- [OpenCore Legacy Patcher guide: post-installation and root patches](https://dortania.github.io/OpenCore-Legacy-Patcher/POST-INSTALL.html)
- [OpenCore Legacy Patcher guide: restoring a Time Machine backup](https://dortania.github.io/OpenCore-Legacy-Patcher/TIMEMACHINE.html)
- [OpenCore Legacy Patcher guide: uninstalling](https://dortania.github.io/OpenCore-Legacy-Patcher/UNINSTALL.html)
- [OpenCore Legacy Patcher guide: hardware issues](https://dortania.github.io/OpenCore-Legacy-Patcher/TROUBLESHOOT-HARDWARE.html)
- [OpenCore Legacy Patcher guide: explaining the patches](https://dortania.github.io/OpenCore-Legacy-Patcher/PATCHEXPLAIN.html)
- [OpenCore Legacy Patcher guide: macOS Sequoia and T2 panics](https://dortania.github.io/OpenCore-Legacy-Patcher/SEQUOIA-DROP.html)
- [Issue 1167, macOS Tahoe 26 and OpenCore Legacy Patcher Support (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/1167)
- [Issue 1183, macOS Golden Gate 27 and the Future of OpenCore Legacy Patcher (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/1183)
- [Issue 108, Legacy Non-Metal GPUs and macOS Big Sur through Sequoia (GitHub)](https://github.com/dortania/OpenCore-Legacy-Patcher/issues/108)
- [OpenCore Legacy Patcher on OpenCollective: Closing off to new donations](https://opencollective.com/opencore-legacy-patcher/updates/closing-off-to-new-donations)
- [Apple: macOS Tahoe 26 is compatible with these computers](https://support.apple.com/en-us/122867)
- [Apple: macOS Sequoia is compatible with these computers](https://support.apple.com/en-us/120282)
- [Apple: Mac computers with the Apple T2 Security Chip](https://support.apple.com/en-us/103265)
- [Apple: security releases](https://support.apple.com/en-us/100100)
- [Apple: macOS Golden Gate](https://www.apple.com/macos/)
- [Apple Platform Deployment: WWDC26 app management updates](https://support.apple.com/en-gb/guide/deployment/depd567c9ffa/web)
- [Apple: Back up your Mac with Time Machine](https://support.apple.com/en-us/104984)
- [Apple: About System Integrity Protection on your Mac](https://support.apple.com/en-us/102149)
- [Apple: Protect data on your Mac with FileVault](https://support.apple.com/guide/mac-help/protect-data-on-your-mac-with-filevault-mh11785/mac)
- [MacRumors: macOS Golden Gate Marks the End of an Era](https://www.macrumors.com/2026/09/14/macos-golden-gate-marks-the-end-of-an-era-2/)
- [The Eclectic Light Company: Apple has released macOS Golden Gate, and security updates to Tahoe 26.7, Sequoia 15.8](https://eclecticlight.co/2026/09/14/apple-has-released-macos-golden-gate-and-security-updates-to-tahoe-26-7-sequoia-15-8/)
- [AppleInsider: OpenCore Legacy Patcher faces uncertainty with the end of Intel Mac support nearing](https://appleinsider.com/articles/26/03/24/opencore-legacy-patcher-faces-uncertainty-with-the-end-of-intel-mac-support-nearing)
- [Low End Mac: OCLP Tahoe and 2018 Mac mini, a no-go so far](https://lowendmac.com/2025/oclp-tahoe-and-2018-mac-mini-a-no-go-so-far/)
- [Low End Mac: macOS 26.0 Tahoe](https://lowendmac.com/2025/macos-26-0-tahoe/)
