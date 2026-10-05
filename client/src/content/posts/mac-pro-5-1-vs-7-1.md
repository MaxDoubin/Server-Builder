
## The short answer

The 7,1 is the better machine, but in dealer listings on October 5, 2026 a 5,1 cost a quarter to a third as much. In Geekbench 6 averages, the base 8-core 7,1 scores 1,262 single-core and 7,326 multi-core against 550 and 3,933 for a 12-core 3.06GHz 5,1, about 2.3 and 1.9 times as much. Apple's newest macOS is Mojave 10.14 for the 5,1 and Tahoe 26, the last release for Intel Macs, for the 7,1. Buy a 5,1 as a cheap project or legacy-software machine, and a 7,1 if you need current macOS, Thunderbolt 3 or modern graphics cards.

## Mac Pro 5,1 vs 7,1 at a glance

The table compares the stock 2010 and 2012 Mac Pro 5,1 with the 2019 7,1. Apple used one identifier, MacPro5,1, for both older years, and [EveryMac](https://everymac.com/systems/apple/mac_pro/faq/differences-between-mac-pro-mid-2012-mid-2010-models.html) says they share the same processor architectures, memory, storage and other internal components, so the table treats them as one machine.

<figure>
<img src="/images/blog/mac-pro-5-1-vs-7-1/mac-pro-2010-power-mac-g5-mac-pro-2009.jpg" alt="Three silver aluminum towers side by side: a 2010 Mac Pro, a Power Mac G5 and a 2009 Mac Pro" width="1000" height="734" loading="lazy" decoding="async">
<figcaption>A Mac Pro from 2010 (left), a Power Mac G5 (center) and a Mac Pro from 2009 (right); the Mac Pro case is based on the G5's, which is why the towers look alike. Photo: Uadro, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Pro_(2010).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| | Mac Pro 5,1 (2010 and 2012) | Mac Pro 7,1 (2019) |
| :--- | :--- | :--- |
| Sold | July 27, 2010 to October 22, 2013 | December 10, 2019 to June 5, 2023 |
| Processors | One or two Xeons, 4 to 12 cores in total | One Xeon W, 8 to 28 cores |
| Memory | 4 or 8 DDR3 ECC slots, 32GB or 64GB official | 12 DDR4 ECC slots, 1.5TB official |
| PCIe | 2.0, four slots | 3.0, eight slots, two MPX bays |
| Graphics as shipped | Radeon HD 5770 or HD 5870 | Radeon Pro MPX modules |
| Storage | Four 3Gb/s SATA bays, up to 8TB | Apple SSD modules, up to 8TB |
| Ports | 4 FireWire 800, 5 USB 2.0, 2 Gigabit Ethernet | 2 USB-A, 4 Thunderbolt 3, 2 10Gb Ethernet |
| Newest macOS from Apple | Mojave 10.14 | Tahoe 26 |

Specs come from Apple's tech specs for the [Mid 2010](https://support.apple.com/en-us/112578), [Mid 2012](https://support.apple.com/en-us/118464) and [2019](https://support.apple.com/en-us/118461) models, and dates from EveryMac's [2019](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-eight-core-3.5-xeon-w-silver-tower-workstation-2019-specs.html) and [Mid 2012](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-twelve-core-3.06-mid-2012-westmere-specs.html) pages.

## How much faster is the 7,1?

The 7,1 is more than twice as fast per core as any stock 5,1, and 1.9 to 2.7 times as fast across all cores in Geekbench 6. The scores are EveryMac's averages of user-submitted Geekbench 6 results as read on October 5, 2026; none were measured on this site's hardware.

| Machine | Single-core | Multi-core |
| :--- | ---: | ---: |
| 5,1, 8-core 2.4GHz (2010) | 425 | 2,521 |
| 5,1, 12-core 2.4GHz (2012) | 441 | 3,245 |
| 5,1, 12-core 3.06GHz (2012) | 550 | 3,933 |
| 7,1, 8-core 3.5GHz | 1,262 | 7,326 |
| 7,1, 12-core 3.3GHz | 1,346 | 9,552 |
| 7,1, 16-core 3.2GHz | 1,356 | 10,557 |
| 7,1, 28-core 2.5GHz | 1,311 | 10,810 |

Primate Labs says Geekbench 6 uses a "shared task" model that [may not scale as well](https://www.geekbench.com/doc/geekbench6-benchmark-internals.pdf) as Geekbench 5's, which helps explain why the 28-core's 10,810 barely beats the 16-core's 10,557. EveryMac's Geekbench 5 averages show the spread: 19,174 multi-core for the 28-core 7,1 against 5,648 for the 3.06GHz 5,1.

Instruction sets likely explain part of the single-core gap. Geekbench 6 runs the most advanced build a CPU supports, and Dortania's [OpenCore Legacy Patcher FAQ](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html) lists the 7,1 as the first Mac Pro with AVX2 and the 2013 model as the first with AVX, so no 5,1 has either.

Application tests differ. [Barefeats' December 20, 2019 shootout](https://barefeats.com/mac-pro-2019-versus-2010.html) found an upgraded 12-core 2010 Mac Pro (3.33GHz X5680, Radeon VII) "certainly out-classed" by a 2019 12-core.

## How do the processors, memory and PCIe slots compare?

The 5,1 tops out at two 6-core Westmere Xeons, a reported 128GB of memory and PCIe 2.0, while the 7,1 starts at 8 cores with 12 DIMM slots and PCIe 3.0.

### Processors and memory

A 5,1 takes one or two Xeons on a slide-out tray. Greg Gant's [classic Mac Pro guide](https://blog.greggant.com/posts/2018/05/07/definitive-mac-pro-upgrade-guide.html) says dual-CPU trays often cost nearly as much as a whole used Mac Pro, so the usual upgrade is a faster CPU of the same type: the X5690 is the fastest, and the X5680 costs about half as much. The 7,1's Xeon W sits in an LGA 3647 socket that EveryMac says is removable.

Apple lists 64GB for a dual-CPU 5,1 and 32GB for a single-CPU one. EveryMac, citing OWC's testing, reports [128GB](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-twelve-core-3.06-mid-2012-westmere-specs.html) for dual-CPU Mid 2012 models on OS X 10.9 or later and 48GB for single-CPU ones. Its Mid 2010 pages call 32GB Apple's limit where Apple's page says 64GB, and this article uses Apple's figure.

The 7,1 officially takes [1.5TB](https://support.apple.com/en-us/118461) with a 24- or 28-core CPU. EveryMac lists 1TB for the 8-, 12- and 16-core models, based on OWC's finding that the 8-core takes eight 128GB DIMMs. The 8-core runs memory at 2666MHz and the others at 2933MHz.

### PCIe and MPX

PCIe 2.0 matters less for graphics than it sounds. Greg Gant's guide notes that an x8 PCIe 3.0 slot equals an x16 PCIe 2.0 slot, and cites Puget Systems testing that put the x8 penalty for a GPU at roughly 3 to 4 percent.

The 5,1 has a double-wide x16 graphics slot plus three open slots, one x16 and two x4, sharing [300W](https://support.apple.com/en-us/118464). The 7,1 has eight x16-sized slots, though slots 2, 6 and 7 run up to x8 and slot 8 is an x4 slot holding Apple's I/O card, per [Apple](https://support.apple.com/en-us/101640). Each MPX bay adds x16 gen 3 for graphics, x8 gen 3 for Thunderbolt and up to 500W, and Greg Gant's [7,1 guide](https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html) says a PEX8796 switch manages the other [PCIe lanes](/blog/pcie-lanes-explained).

## Which graphics cards and boot screens work in each?

The 7,1 takes most PC graphics cards and still shows a boot screen with them, while a 5,1 needs a Metal-capable card for Mojave and loses its boot screen with almost all of them.

<figure>
<img src="/images/blog/mac-pro-5-1-vs-7-1/mac-pro-and-pro-display-xdr.jpg" alt="A 2019 Mac Pro beside an Apple Pro Display XDR" width="1200" height="932" loading="lazy" decoding="async">
<figcaption>A 2019 Mac Pro beside a Pro Display XDR; Apple's spec sheet lists how many of these displays each MPX module can drive, from one for the W5500X to six for the W6800X Duo. Photo: KKPCW, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Apple_Pro_Display_XDR_and_Mac_Pro_(2019_model)_-_1.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The 5,1 shipped with a Radeon HD 5770 or HD 5870, and [Apple says](https://support.apple.com/en-us/101330) neither supports Metal, so installing Mojave requires a new card. Apple's tested list includes the RX 560, RX 580 and HD 7950 Mac Edition, and other RX 570/580, Vega and WX cards "might also be compatible." Dortania's FAQ adds that AMD Navi cards (RX 5000 and 6000) do not work in a 5,1 on Ventura or newer because the CPU lacks AVX2.

The boot screen is the catch. Greg Gant's guide explains that Apple's EFI used an older graphics protocol that PC cards do not implement, and Apple warns that many third-party cards show nothing at startup, so you cannot log in to FileVault, pick a startup disk or run diagnostics. OpenCore's EnableGop driver can add one, but its [README](https://github.com/acidanthera/OpenCorePkg/blob/master/Staging/EnableGop/README.md) calls it a beta that "may brick your hardware."

The 7,1 uses UEFI, so Greg Gant's 7,1 guide says any UEFI GPU, including current AMD cards, shows a boot screen. Apple says the Mac Pro supports [the same GPUs as eGPUs](https://support.apple.com/en-us/101644), such as the Radeon RX 6800, 6800 XT and 6900 XT, while NVIDIA cards work only outside macOS. Non-MPX cards lack Thunderbolt 3 passthrough, so displays connect to the card. [GPU compute on the Mac Pro](/blog/mac-pro-gpu-compute) covers MPX performance, which Apple rates from 5.6 to 30.2 single-precision teraflops.

Metal is another divider. [Apple's Metal page](https://support.apple.com/en-us/102894) lists the 5,1 under Metal 2 only, and Metal 3 for the 2019 Mac Pro except units with a Radeon Pro 500 series card, which includes the base 580X.

## How do storage and ports compare?

The 5,1 gives you four cheap SATA bays and legacy ports, and the 7,1 gives you faster but locked-down storage and current ports.

<figure>
<img src="/images/blog/mac-pro-5-1-vs-7-1/four-sata-bays.jpg" alt="The open side of a Mac Pro showing four hard drives in their sleds" width="1200" height="720" loading="lazy" decoding="async">
<figcaption>Four drive sleds with their release tabs in a Mac Pro photographed in 2008; the 2010 and 2012 models also have four bays, each on its own 3Gb/s SATA channel. Photo: Tony Webster, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Pro_-_Four_SATA_Hard_Drives_(2485906684).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

A 5,1 has [four 3.5-inch drive bays](https://support.apple.com/en-us/118464) on separate 3Gb/s SATA channels, for up to 8TB, and that link caps SSDs at 300MB/s according to Greg Gant. NVMe boot needs Boot ROM 140.0.0.0.0 or later and a PCIe adapter. Cheap single-drive adapters top out near 1,500MB/s because they use four lanes, while adapters with a controller that uses more lanes reach about 3GB/s.

<figure>
<img src="/images/blog/mac-pro-5-1-vs-7-1/mac-pro-rear-connectors.jpg" alt="The rear connector panel of an older Mac Pro tower" width="1200" height="1600" loading="lazy" decoding="async">
<figcaption>The rear panel of a Mac Pro photographed in 2009, showing three USB 2.0, two FireWire 800, optical audio, audio jacks and two Gigabit Ethernet ports, the same set Apple lists for the Mid 2012 model. Photo: Glenn Batuyong, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Mac_Pro_rear_connectors.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The 7,1's SSD modules read and write at up to 3.4GB/s and are encrypted by the [T2 chip](/blog/apple-t2-security-chip). Apple says they are [paired to the T2](https://support.apple.com/en-us/101654), so replacing them means erasing and restoring with Apple Configurator, and Greg Gant's guide says the Mac will not boot without the Apple SSD.

The 5,1 has no USB 3 or Thunderbolt, so a USB 3 card is one of the most common upgrades. The 7,1 has two USB-A ports at 5Gb/s, four Thunderbolt 3 ports and two 10Gb Ethernet ports that also negotiate 1, 2.5 and 5Gb/s.

## How much power does each draw, and how loud are they?

A base 7,1 idles at 101W, lower than any 5,1 Apple measured, but a fully loaded 7,1 can reach 902W.

Apple's [power consumption page](https://support.apple.com/en-us/102839), published November 30, 2023, measures at the wall, with only Finder open for idle. The Mid 2010 5,1 drew 125W idle and 218W peak as a quad-core 2.8GHz, 162W and 248W as an 8-core 2.4GHz, and 145W and 285W as a 12-core 2.66GHz. The 7,1 drew 101W and 430W as an 8-core with a 580X and 32GB, and 302W and 902W as a 28-core with two Vega II Duo modules, 1.5TB of memory, Afterburner and a 4TB SSD. Apple has no Mid 2012 row.

Every 100W of constant draw is about 876kWh a year, so a 12-core 5,1 idling all year uses roughly 385kWh more than a base 7,1. Apple declares idle sound power of 3.5 to 3.7 bels (1 bel is 10dB) for the Mid 2012 models under ISO 9296 and 2.7 for the 7,1 under ECMA-109. The 5,1 figure is an upper limit, and adding Apple's 0.3 adder to the 7,1's gives 3.0, so the 7,1 is about 5 to 7dB quieter at idle on a like-for-like basis.

## Which macOS can each run in 2026?

The 5,1 officially stops at macOS Mojave 10.14, and the 7,1 runs macOS Tahoe 26, the last version for Intel Macs.

[Apple's model identification page](https://support.apple.com/en-us/102887), published September 14, 2026, lists Mojave as the newest macOS for both 5,1 years and Tahoe 26 for the 2019 Mac Pro. Apple's [security releases page](https://support.apple.com/en-us/100100) shows Tahoe 26.7.1 on September 28, 2026 and lists macOS 27 only for Apple silicon Macs, matching [9to5Mac's report](https://9to5mac.com/2025/06/09/apple-will-end-support-for-intel-macs/) that Tahoe is the last release for Intel Macs. Mojave is the last macOS that [runs 32-bit apps](https://support.apple.com/en-us/103076), and its last security update, [Security Update 2021-005](https://support.apple.com/en-us/103140), shipped on July 21, 2021.

### The OpenCore Legacy Patcher route for the 5,1

OpenCore Legacy Patcher (OCLP) lets a 5,1 run macOS from Big Sur up to Sequoia 15. Its FAQ says it targets Big Sur through Sequoia, while its [README](https://github.com/dortania/OpenCore-Legacy-Patcher) says Big Sur through Tahoe and its [changelog](https://github.com/dortania/OpenCore-Legacy-Patcher/blob/main/CHANGELOG.md) lists Tahoe support under 3.0.0. On October 5, 2026 the [releases page](https://github.com/dortania/OpenCore-Legacy-Patcher/releases) showed 3.0.0 only as a pre-release, and none of these pages says the 5,1 works on Tahoe, so treat Sequoia as the ceiling. The steps:

1. Update the 5,1 to Mojave first. OCLP's [supported models page](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html) says to run the latest native macOS "to ensure you're on the highest firmware," and Apple says to go through High Sierra 10.13.6.
2. Install a Metal-capable GPU. OCLP flags the 5,1 as "non-Metal GPU (macOS 11+)" and recommends upgrading.
3. Create the installer in OCLP on a USB drive. Its [installer guide](https://dortania.github.io/OpenCore-Legacy-Patcher/INSTALLER.html) recommends 32GB for Sonoma and Sequoia.
4. Build and install OpenCore to the drive, restart holding Option and choose the EFI Boot entry with the OpenCore icon, per the [boot guide](https://dortania.github.io/OpenCore-Legacy-Patcher/BOOT.html).
5. After installing, put OpenCore on the internal drive and apply root patches, which every macOS update wipes ([post-install guide](https://dortania.github.io/OpenCore-Legacy-Patcher/POST-INSTALL.html)).

### Why Boot ROM 144.0.0.0.0 matters

144.0.0.0.0 is the last firmware Apple released for the 5,1, and it arrives only through macOS installers. Greg Gant's firmware table, credited to a list kept by MacRumors forum member tsialex in the [BootROM thread](https://forums.macrumors.com/threads/macpro5-1-bootrom-thread-144-0-0-0-0.2132317/), shows 138.0.0.0.0 adding 5GT/s for every PCIe 2.0 card, 140.0.0.0.0 adding NVMe boot and 144.0.0.0.0 bringing "lots of corrections, booting improvements."

Check yours under Apple menu, About This Mac, System Report, Hardware Overview, Boot ROM Version. If you are stuck on 138 or 140, install High Sierra on a spare drive, download Mojave 10.14.6 from it and install that.

## What are they worth used, and what is each still good for?

Dealer asking prices on October 5, 2026 ran from $125 for a quad-core 5,1 to $395 for a 12-core one, and the cheapest 7,1 was $1,199 to $1,295. These are asking prices, not sold prices, and the pages show no date of their own.

| Machine | Dealer | Asking price |
| :--- | :--- | ---: |
| 5,1, quad-core 3.2GHz, 8GB | [UsedMac.com](https://usedmac.com/product-category/apple-mac-pro/page/2/) | $125 |
| 5,1, 12-core 3.46GHz, 16GB, 1TB | [UsedMac.com](https://usedmac.com/product-category/apple-mac-pro/) | $335 |
| 5,1, 12-core 3.46GHz, 32GB, 1TB | UsedMac.com | $395 |
| 7,1, 8-core 3.5GHz, 32GB, 1TB, open box | [iPower Resale](https://ipowerresale.com/collections/mac-pro) | from $1,199 |
| 7,1, 8-core 3.5GHz, 32GB, 256GB, 580X | UsedMac.com | $1,295 |
| 7,1, 12-core 3.3GHz, 96GB, 1TB, 580X | UsedMac.com | $1,495 |
| 7,1, 28-core 2.5GHz, 96GB, 1TB, 580X | UsedMac.com | $3,250 |

A 5,1 is still good as a low-cost project machine: it takes PCIe cards, four drives and swap-in CPUs, and Mojave runs 32-bit apps that no newer macOS can. Under OCLP it runs Sequoia, but some newer apps will not run (see What breaks).

A 7,1 is still good for daily work on a supported macOS, with AVX2, 10Gb Ethernet, Thunderbolt 3 and modern GPUs. Apple also lists a [rack model](https://support.apple.com/en-us/102887), and [running a rack-mount Mac Pro in a homelab](/blog/mac-pro-rack-mount-homelab) covers that use. The catch is the end of the line: macOS 27 skips Intel Macs, and MacRumors reported on [March 26, 2026](https://www.macrumors.com/2026/03/26/apple-discontinues-mac-pro/) that Apple discontinued the Mac Pro and plans no new one.

## What breaks

**A PC graphics card gives a black screen until macOS loads (5,1).** Apple's EFI cannot use the startup graphics of PC cards, so you lose the boot picker, FileVault login and diagnostics. Fix: turn off FileVault before installing Mojave, keep an EFI-compatible card for firmware and OS upgrades, and switch systems in the Startup Disk pane because holding Option does not work.

**The Mojave installer refuses the 5,1, or firmware stalls at 138 or 140.** Mojave needs a Metal-capable GPU and a High Sierra 10.13.6 starting point, and firmware only arrives through the installer. Fix: install a Metal card from Apple's list, update to 10.13.6 first, and use the spare-drive method above if the firmware is stuck.

**Keyboard and mouse stop working on Ventura or later (5,1 with OCLP).** Ventura removed the USB 1.1 drivers that the 5,1's controllers use. Fix: put a USB 2.0 or 3.0 hub between the devices and the Mac Pro until OCLP's [root patches](https://dortania.github.io/OpenCore-Legacy-Patcher/TROUBLESHOOT-HARDWARE.html) restore the drivers.

**Apps crash with "illegal instruction" (5,1 on newer macOS).** Dortania's [FAQ](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html) says newer apps use AVX and AVX2, which no 5,1 CPU has. Fix: install older app versions or run an older macOS, and buy a 7,1 if you need current software.

**A replaced SSD module will not boot the 7,1 until the T2 pairs with it.** The modules are paired to and encrypted by the T2 chip. Fix: back up first, because the old data is unrecoverable once pairing starts, then use Apple Configurator 2.12 or later on another Mac to erase and set up the new modules.

## Frequently asked questions

### What is the difference between the 2010 and 2012 Mac Pro?

Almost nothing. Apple identifies both as MacPro5,1, and Greg Gant's guide says every part is interchangeable regardless of year.

### Can a Mac Pro 5,1 run Sonoma or Sequoia?

Yes, with OCLP, which lists MacPro5,1 as supported. You need a Metal-capable GPU, must reinstall root patches after each update, and may hit apps that need AVX or AVX2.

### Does the 2019 Mac Pro need MPX graphics cards?

No. Greg Gant's guide says MPX is not a requirement for GPUs. MPX adds power delivery plus Thunderbolt 3 passthrough and video support, and standard PCIe cards still show a boot screen.

### Will the 2019 Mac Pro run macOS 27?

No. Apple lists macOS 27 for Apple silicon Macs, and its identification page shows Tahoe 26 as the newest macOS for the 2019 Mac Pro. 9to5Mac wrote that Intel Macs would keep receiving security updates for another three years.

## What this means

Buy the 7,1 if you need current macOS, AVX2 software, Thunderbolt 3 or modern GPUs. Choose the core count for your workload, and prefer a card newer than the 580X, which lacks Metal 3.

Buy a 5,1 only if Mojave or an OCLP-patched Sequoia is enough. It is cheap, runs 32-bit apps and takes inexpensive PCIe upgrades, but budget for a Metal GPU, a USB 3 card and an NVMe adapter. Neither machine has an upgrade path past Tahoe (7,1) or Sequoia (5,1 with OCLP).

## References

- [Apple: Mac Pro (Mid 2010) technical specifications](https://support.apple.com/en-us/112578)
- [Apple: Mac Pro (Mid 2012) technical specifications](https://support.apple.com/en-us/118464)
- [Apple: Mac Pro (2019) technical specifications](https://support.apple.com/en-us/118461)
- [Apple: Mac Pro power consumption and thermal output](https://support.apple.com/en-us/102839)
- [Apple: Identify your Mac Pro model](https://support.apple.com/en-us/102887)
- [Apple: Install macOS 10.14 Mojave on Mac Pro (Mid 2010) and Mac Pro (Mid 2012)](https://support.apple.com/en-us/101330)
- [Apple: Install PCIe cards in your Mac Pro (2019)](https://support.apple.com/en-us/101640)
- [Apple: PCIe cards you can install in your Mac Pro (2019)](https://support.apple.com/en-us/101644)
- [Apple: Install or replace SSD modules in your Mac Pro (2019)](https://support.apple.com/en-us/101654)
- [Apple: Support for Metal on Apple devices](https://support.apple.com/en-us/102894)
- [Apple: Use an external graphics processor with your Mac](https://support.apple.com/en-us/102363)
- [Apple: 32-bit app compatibility with macOS](https://support.apple.com/en-us/103076)
- [Apple: Apple security releases](https://support.apple.com/en-us/100100)
- [Apple: About the security content of Security Update 2021-005 Mojave](https://support.apple.com/en-us/103140)
- [EveryMac: Differences between Mid-2012 and Mid-2010 Mac Pro models](https://everymac.com/systems/apple/mac_pro/faq/differences-between-mac-pro-mid-2012-mid-2010-models.html)
- [EveryMac: Mac Pro Eight Core 3.5 (2019) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-eight-core-3.5-xeon-w-silver-tower-workstation-2019-specs.html)
- [EveryMac: Mac Pro 12-Core 3.3 (2019) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-12-core-3.3-xeon-w-silver-tower-workstation-2019-specs.html)
- [EveryMac: Mac Pro 16-Core 3.2 (2019) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-16-core-3.2-xeon-w-silver-tower-workstation-2019-specs.html)
- [EveryMac: Mac Pro 28-Core 2.5 (2019) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-28-core-2.5-xeon-w-silver-tower-workstation-2019-specs.html)
- [EveryMac: Mac Pro Twelve Core 3.06 (Mid 2012) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-twelve-core-3.06-mid-2012-westmere-specs.html)
- [EveryMac: Mac Pro Twelve Core 2.4 (Mid 2012) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-twelve-core-2.4-mid-2012-westmere-specs.html)
- [EveryMac: Mac Pro Six Core 3.33 (Mid 2012) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-six-core-3.33-mid-2012-westmere-specs.html)
- [EveryMac: Mac Pro Eight Core 2.4 (Mid 2010) specs](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-eight-core-2.4-mid-2010-westmere-specs.html)
- [Greg Gant: The Definitive Classic Mac Pro Upgrade Guide (2006 to 2012)](https://blog.greggant.com/posts/2018/05/07/definitive-mac-pro-upgrade-guide.html)
- [Greg Gant: The Definitive Mac Pro 2019 7,1 Upgrade Guide](https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html)
- [Primate Labs: Geekbench 6 Benchmark Internals](https://www.geekbench.com/doc/geekbench6-benchmark-internals.pdf)
- [Barefeats: Shootout, 2019 Mac Pro 12-Core versus 2010 Mac Pro 12-Core](https://barefeats.com/mac-pro-2019-versus-2010.html)
- [OpenCore Legacy Patcher README](https://github.com/dortania/OpenCore-Legacy-Patcher)
- [OpenCore Legacy Patcher changelog](https://github.com/dortania/OpenCore-Legacy-Patcher/blob/main/CHANGELOG.md)
- [OpenCore Legacy Patcher releases](https://github.com/dortania/OpenCore-Legacy-Patcher/releases)
- [OpenCore Legacy Patcher: Supported models](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html)
- [OpenCore Legacy Patcher: FAQ](https://dortania.github.io/OpenCore-Legacy-Patcher/FAQ.html)
- [OpenCore Legacy Patcher: Creating macOS installers](https://dortania.github.io/OpenCore-Legacy-Patcher/INSTALLER.html)
- [OpenCore Legacy Patcher: Booting OpenCore and macOS](https://dortania.github.io/OpenCore-Legacy-Patcher/BOOT.html)
- [OpenCore Legacy Patcher: Post-installation](https://dortania.github.io/OpenCore-Legacy-Patcher/POST-INSTALL.html)
- [OpenCore Legacy Patcher: Troubleshooting hardware](https://dortania.github.io/OpenCore-Legacy-Patcher/TROUBLESHOOT-HARDWARE.html)
- [OpenCorePkg: EnableGop README](https://github.com/acidanthera/OpenCorePkg/blob/master/Staging/EnableGop/README.md)
- [9to5Mac: Apple will end support for Intel Macs next year](https://9to5mac.com/2025/06/09/apple-will-end-support-for-intel-macs/)
- [MacRumors: Apple confirms Mac Pro is dead, no future models planned](https://www.macrumors.com/2026/03/26/apple-discontinues-mac-pro/)
- [MacRumors forums: MacPro5,1 BootROM thread (144.0.0.0.0)](https://forums.macrumors.com/threads/macpro5-1-bootrom-thread-144-0-0-0-0.2132317/)
- [UsedMac.com: Apple Mac Pro listings](https://usedmac.com/product-category/apple-mac-pro/)
- [UsedMac.com: Apple Mac Pro listings, page 2](https://usedmac.com/product-category/apple-mac-pro/page/2/)
- [iPower Resale: Mac Pro open box](https://ipowerresale.com/collections/mac-pro)
