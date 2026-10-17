
## The problem

You own a 2019 Mac Pro (the 7,1), or are about to buy one, and its GPU is too slow or too old for your work. Apple's upgrade path is an MPX module, a card format built for this Mac, while the alternative is an ordinary PCIe graphics card. Before you spend money, you need to know what each choice gives up in power, Thunderbolt video and macOS driver support.

## What an MPX module adds over a standard PCIe card

An MPX (Mac Pro Expansion) module is a card that fits one of the Mac Pro's two MPX bays. [Apple's technical specifications](https://support.apple.com/en-us/118461) say each bay provides x16 gen 3 bandwidth for graphics, x8 gen 3 bandwidth for Thunderbolt, DisplayPort video routing and "Up to 500W power for an MPX Module." Apple's [MPX installation guide](https://support.apple.com/guide/mac-pro/apd8e22bab6b/2022/mac/13) rates each PCIe slot at a maximum of 75 W, each 6-pin auxiliary connector at 75 W and each 8-pin auxiliary connector at 150 W.

Those bays are why a module can draw power from the bay itself and send video into the Mac's own Thunderbolt ports. Apple's [June 3, 2019 announcement](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/) said the MPX Module "is cooled by the Mac Pro system thermals," and that three fans move air through the Mac Pro.

A module takes up to two slots. [Apple's slot guide](https://support.apple.com/en-us/101640) places modules in slots 1 and 2 and in slots 3 and 4, and the installation guide says "MPX Modules must be installed in PCIe expansion slots 1 and 3." None of this makes MPX mandatory. Greg Gant's [Mac Pro 2019 upgrade guide](https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html) states that "MPX is not a requirement for GPUs," and because the Mac Pro 2019s use UEFI, all aftermarket GPUs output a boot screen.

## Which MPX modules Apple shipped

Apple sold nine graphics modules for this Mac. The table combines memory, single-precision compute and Pro Display XDR counts from the [technical specifications](https://support.apple.com/en-us/118461) with the supported module counts from Apple's [PCIe card list](https://support.apple.com/en-us/101644).

| Module | Memory | FP32 teraflops | Modules supported | Pro Display XDRs |
|---|---|---|---|---|
| Radeon Pro 580X | 8GB GDDR5 | 5.6 | 1 | 2 |
| Radeon Pro W5500X | 8GB GDDR6 | 5.6 | 1 or 2 | 1 |
| Radeon Pro W5700X | 16GB GDDR6 | 9.4 | 1 or 2 | 3 |
| Radeon Pro W6600X | 8GB GDDR6 | 9.8 | 1 | 2 |
| Radeon Pro Vega II | 32GB HBM2 | 14.1 | 1 or 2 | 2 |
| Radeon Pro W6800X | 32GB GDDR6 | 16.0 | 1 or 2 | 3 |
| Radeon Pro W6900X | 32GB GDDR6 | 22.2 | 1 or 2 | 3 |
| Radeon Pro Vega II Duo | 64GB HBM2 | 28.3 | 1 or 2 | 4 |
| Radeon Pro W6800X Duo | 64GB GDDR6 | 30.2 | 1 or 2 | 6 |

On August 4, 2021, [Macworld reported](https://www.macworld.com/article/677459/mac-pro-gets-new-high-end-graphics-cards.html) that Apple had replaced the Vega II and Vega II Duo in build-to-order configurations, listing the W6800X from $2,400 and the W6900X from $5,600. The Vega II modules stayed available separately for existing customers.

Two matching modules that support Infinity Fabric Link can be joined with a bridge board, but the bridge for the [W6800X](https://support.apple.com/en-us/101835) and the [W6900X](https://support.apple.com/en-us/101845) "isn't compatible with previous-generation Radeon Pro MPX Modules." The [Vega II Duo](https://support.apple.com/en-us/101899) ships with its link preinstalled, and Apple says it "enables up to five times faster data transfer between the GPUs."

## How MPX modules drive Thunderbolt and displays

Five of the nine graphics modules (the W5500X, W5700X, Vega II, W6800X and W6900X) send two DisplayPort connections back to the system. The 580X, Vega II Duo and W6800X Duo send four, and the W6600X sends up to four. Apple's specifications say they are "routed to system to support internal Thunderbolt 3 ports." The Mac has two Thunderbolt 3 ports on top of the tower and two more on its I/O card.

The module also carries its own outputs. The [W5700X](https://support.apple.com/en-us/101893), W6800X and W6900X modules each have four Thunderbolt 3 ports and one HDMI 2.0 port, split across two buses, and when you connect two 5K or 6K displays Apple says to put one on each bus. One W5700X drives up to six displays over Thunderbolt 3, and two drive up to 12.

Skipping MPX costs you this routing. Gant's guide warns: "If an MPX module isn't present, the Thunderbolt 3 ports on the Mac will not output video." With a standard card, every monitor plugs into the card itself. The RX 6000 cards have three DisplayPorts, so [BareFeats](https://barefeats.com/rx-6900-xt-versus-other-gpus.html) recommends a display "that has DisplayPort 1.4 with DSC." The Pro Display XDR is the hardest case: Apple's [XDR specifications](https://support.apple.com/en-us/111892) list the 2019 tower as compatible only as "Mac Pro (2019) with MPX Module GPUs."

## Fitting a standard GPU: power, length and slots

Power is the first limit. Apple's [PCIe card list](https://support.apple.com/en-us/101644) says the PCIe bus provides up to 300W of auxiliary power, and that a card requiring additional power, "such as a GPU," should use the Belkin Aux Power Cable. Apple gives that 300 W as one figure for the whole bus, not per card, so a second power-hungry card shares it with the first.

The Mac Pro's auxiliary sockets are not standard PC connectors. Gant lists four 8-pin and one 6-pin mini-PCIe AUX connector on the board and calls the cables custom. He names OWC's PCIe AUX Power Cables Kit as an alternative to Apple's Belkin kit.

A slot is rated 75 W and each 8-pin connector 150 W, so a card with two 8-pin connectors tops out at 375 W: 75 W from the slot plus 300 W from the connectors, which is the whole auxiliary budget. [Notebookcheck](https://www.notebookcheck.net/AMD-Radeon-RX-6900-XT-Review-Near-RTX-3090-performance-for-US-500-less-but-only-marginally-better-than-RX-6800-XT.519238.0.html) says the RX 6900 XT "is rated for a total board power of 300 W" and shows two 8-pin connectors on the reference card, which fits. [Club386 reports](https://www.club386.com/amd-announces-rtx-40-series-rivals-enter-999-rdna-3-radeon-rx-7900-xtx-and-899-rx-7900-xt/) that AMD's reference RX 7900 XTX peaks at 355 W and uses standard dual 8-pin connectors, which fits the 375 W total on paper with only 20 W to spare.

Length is the second limit. Gant's guide gives 305mm (12 inches) as the longest card the Mac Pro 2019 can accommodate, while BareFeats fit Sapphire Nitro+ RX 6800 XT and RX 6900 XT cards it describes as 12.2 inches long (about 310mm) and says "Versions longer than that will not fit in the 2019 Mac Pro." Measure the exact model, not the reference design.

Slots are the third. Apple's slot guide lists slots 1, 3, 4 and 5 at up to x16 lanes, slots 2, 6 and 7 at up to x8, and slot 8 at up to x4 for the half-length I/O card, with slots 1 to 4 double-wide. By default the Mac automatically balances bandwidth across two PCIe pools. Expansion Slot Utility "lets you view and change how your cards are allocated." Avoid old cards: Apple warns that with a 32-bit Option ROM installed, your Mac Pro "might not start up correctly."

## Which standard cards macOS will drive

Apple's PCIe card list puts the rule in one sentence: "Mac Pro supports the same GPUs that are supported by external graphics processors (eGPUs)." In practice that means the AMD cards on Apple's eGPU list, none newer than the RX 6000 series.

The [eGPU support list](https://support.apple.com/en-us/102363) names these cards:

- Radeon RX 6800, 6800 XT and 6900 XT, with macOS Big Sur 11.4 or later
- Radeon RX 6600 XT, with macOS Monterey 12.1 or later
- Radeon RX 5700, 5700 XT and 5700 XT 50th Anniversary, with macOS Catalina 10.15.1 or later
- Radeon RX Vega 56, Vega 64, Vega Frontier Edition Air and Radeon Pro WX 9100
- Radeon RX 470, 480, 570, 580 and Radeon Pro WX 7100

Gant's guide reaches the same limit: it says the Mac Pro 2019s "are locked to 6000 series AMD GPUs." RX 7000 series cards appear on neither list.

Nearly everything else is a card for another operating system. Gant notes that Apple decided "to revoke Nvidia's developer license at the end of 10.13 High Sierra" and that the only usable GPUs in Mojave and later are "a handful of older Nvidia GPUs based on the Kepler architecture." For Boot Camp, Apple says that if you want an NVIDIA card in Windows, "don't install the card in slot 2." An Intel Arc A770 fared no better in [Gant's April 20, 2025 test](https://blog.greggant.com/posts/2025/04/20/intel-arc-a770-mac-pro-2019-bad-idea.html): macOS saw it "only as a generic display adapter," and after his Windows testing the Mac would not boot into macOS at all. Setup details for Windows and Linux are in [Windows 11 on the Mac Pro 7,1](/blog/windows-11-on-mac-pro-7-1) and [Linux on the Mac Pro 7,1](/blog/linux-on-mac-pro-7-1).

Two more limits apply even to supported cards. When an MPX GPU is also installed, BareFeats says that unless an app lets you choose the RX card, "the app will likely insist on using the MPX GPU." Apple also says a Radeon MPX Module and a third-party AMD card aren't supported together when the Mac runs Windows. Tahoe is the end of the line: [Six Colors reported](https://sixcolors.com/post/2025/06/macos-tahoe-is-the-last-release-to-support-intel/) on June 9, 2025 that macOS Tahoe "will be the last to support Intel-based Macs," with security updates continuing for three years. [macOS Tahoe on the Mac Pro 7,1](/blog/macos-tahoe-on-mac-pro-7-1) covers that cutoff.

## Buying a used MPX module

A module cannot move to Apple's current tower. Apple's [2023 Mac Pro card list](https://support.apple.com/en-us/101988) says the 2023 Mac Pro "doesn't support additional graphics processors such as PCIe graphics cards or MPX modules." Check these points before you pay:

- **The exact model.** Apple lists the 580X and W6600X for one module only; the others support one or two.
- **The bridge.** Apple's install steps call for "the included bridge board" when you pair two matching modules, so make sure the listing includes it. The W6800X and W6900X bridges are not compatible with previous-generation modules.
- **Your displays.** Count the Pro Display XDR screens you run and compare them with the table.

Then price a standard card against it. On May 1, 2021, [BareFeats called](https://barefeats.com/rx-6900-xt-versus-other-gpus.html) the RX 6900 XT "a lot faster than the previous best GPUs for the 2019 Mac Pro," a test that predates the W6900X. On July 22, 2021, [BareFeats found](https://barefeats.com/rx-6800-xt-versus-other-gpus.html) the 6900 XT "averaged only 8 percent faster than the AMD RX 6800 XT" while it was "priced 36 percent higher." An RX 6800 XT powered through the Belkin cables therefore gets you most of that speed in macOS for less money. The MPX module earns its price when you need Thunderbolt display routing, a Pro Display XDR, power from the bay instead of cables or two linked GPUs.

## What breaks

**The Mac's Thunderbolt ports go dark when no MPX module is installed.** Video on those ports comes through the module's DisplayPort routing, and a standard card has no such link. Fix: connect monitors to the card's own video outputs, and use a display with DisplayPort 1.4 and DSC on an RX 6000 card.

**A card needs more power than the Mac Pro will supply.** The bus offers 300 W of auxiliary power in total, each 8-pin connector is rated 150 W, and a slot is rated 75 W. Fix: check the card's board power and connector count against those ratings before you buy, power it with the Belkin Aux Power Cable or OWC's kit, and run one high-power card rather than two.

**The card does not fit.** Partner cards vary in length. Fix: check the maker's listed length against Gant's 305mm (12 inch) figure and the 12.2 inch ceiling BareFeats reports.

**macOS shows a generic display adapter or no acceleration.** The card is not on Apple's eGPU list, which rules out Intel Arc, RX 7000 and post-Kepler NVIDIA cards. Fix: use a card from Apple's eGPU list for macOS.

**The Mac will not start after you add an older card.** Apple warns that cards with 32-bit Option ROMs are not compatible. Fix: remove the card and install one from Apple's eGPU list instead.

**The screen stays black in Windows after a module swap.** Apple does not support an MPX module and a third-party AMD card together in Windows, and a W5700X installed without AMD drivers can show a black screen. Fix: connect a display to the module's HDMI port, install AMD's drivers, then move back to Thunderbolt 3.

## What this means

If you need only macOS and can do without video on the Mac's built-in Thunderbolt ports, a Radeon RX 6800 XT or 6900 XT from Apple's eGPU list is the most direct GPU upgrade for a 7,1, provided it fits the length limit and stays within the 300 W auxiliary budget. Buy an MPX module instead when you run a Pro Display XDR, want Thunderbolt display routing or need Infinity Fabric Link between two GPUs. Anything newer than the RX 6000 series is outside Apple's list for macOS, and Tahoe is the last macOS release for Intel Macs. For what the installed GPUs can do with Metal, see [GPU compute on the Mac Pro](/blog/mac-pro-gpu-compute).

## References

- https://support.apple.com/en-us/118461
- https://support.apple.com/en-us/101644
- https://support.apple.com/guide/mac-pro/apd8e22bab6b/2022/mac/13
- https://support.apple.com/en-us/101640
- https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/
- https://support.apple.com/en-us/101893
- https://support.apple.com/en-us/101835
- https://support.apple.com/en-us/101845
- https://support.apple.com/en-us/101899
- https://support.apple.com/en-us/111892
- https://support.apple.com/en-us/102363
- https://support.apple.com/en-us/101988
- https://blog.greggant.com/posts/2021/12/19/definitive-mac-pro-2019-upgrade-guide.html
- https://blog.greggant.com/posts/2025/04/20/intel-arc-a770-mac-pro-2019-bad-idea.html
- https://barefeats.com/rx-6900-xt-versus-other-gpus.html
- https://barefeats.com/rx-6800-xt-versus-other-gpus.html
- https://www.macworld.com/article/677459/mac-pro-gets-new-high-end-graphics-cards.html
- https://www.notebookcheck.net/AMD-Radeon-RX-6900-XT-Review-Near-RTX-3090-performance-for-US-500-less-but-only-marginally-better-than-RX-6800-XT.519238.0.html
- https://www.club386.com/amd-announces-rtx-40-series-rivals-enter-999-rdna-3-radeon-rx-7900-xtx-and-899-rx-7900-xt/
- https://sixcolors.com/post/2025/06/macos-tahoe-is-the-last-release-to-support-intel/
