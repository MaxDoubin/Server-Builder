## What I found

My Mac Pro 7,1 holds three Apple Afterburner cards, Apple's FPGA-based PCIe accelerators that decode ProRes video in hardware, and I decoded through the same public VideoToolbox interfaces any app uses, with the two Radeon Pro Vega II GPUs left out. Apple supports up to three cards but publishes performance figures only for one ([Apple Support: About the Afterburner accelerator card](https://support.apple.com/en-us/101662)), and I could not find a published test of two or three cards in one Mac Pro. At the 1080p and 4K limits the total frames decoded per second was nearly the same just below and just above the limit, so at a given resolution the cards appear to share a fixed amount of work among however many streams are open, and pinning every CPU thread barely moved them. I looked into repurposing each card's FPGA and stopped before writing to one. Then I stored arbitrary files as ProRes 4444 frames and got them back through the cards bit for bit, including a small program that still ran afterward. It works, and it is slow. The [interactive companion page](/afterburner) has these results as explorable charts, plus an in-browser demonstration of the files-through-video idea.

**Updated November 4, 2026.** A verification pass against the first version of this report found two things that change its conclusions, not just my confidence in them. First, the roughly 16 MB/s ceiling on file recovery and the cliff past nine sessions came from forcing 32-bit BGRA output, not from the cards. Second, only my 4K test clip has realistic, hard-to-compress content. The 1080p, 8K and 16K clips are flat test patterns, so the stream counts are not comparable across resolutions and are probably more favorable than real footage would give. The 1080p limit is 106, not about 96, and the 4K ceiling may be higher than 27, because the three cards were not always all working. Each correction is marked where it applies, and the [addendum section](#verification-addendum) lists everything the pass measured and what is still open.

- **Capacity.** 106 streams of 1080p, 27 of 4K, 6 of 8K and 2 of 16K held real time (24 fps or better) across three cards, found with a fine sweep. Only the 4K clip is realistic content, so these counts are not comparable with each other, and at 4K the 27 was sometimes reached with only one or two of the three cards working. This is not the same measurement as Apple's published figures.
- **CPU isolation.** With all 32 logical cores pinned by busy loops, the slowest stream lost 3.4 percent at 1080p and 0.8 percent at 4K, and stayed above 24 fps.
- **Mixed resolutions.** Half of each solo limit at once asked for about one and a half times the work of any single limit, and the 8K streams fell to 19.5 fps on average. Redone at one third of each first-pass solo limit (about 0.97 of capacity against the corrected 1080p limit), 4K and 1080p had 50 to 65 percent headroom and one of the two 8K streams still fell under 24 fps, so the penalty is specific to 8K.
- **Output format.** On one 4K stream, forcing 32-bit BGRA output made decode 42 percent slower than the decoder's native format. In the file-recovery pipeline, native output ran about 1.3 to 1.4 times faster at low concurrency and about 1.9 times faster in long-lived sessions at matched density.
- **FPGA.** I mapped the driver's interface and built a flash tool, tested only against a simulator, and never wrote to a card. Whether these chips accept an unencrypted bitstream is unknown.
- **Files through video.** Bit-exact recovery from 500 KB to 1 GB, and a 97,416-byte Mach-O executable that ran after recovery. With output forced to BGRA, recovery topped out near 16 MB/s, and a cliff appeared past nine sessions. The verification pass showed both came from the forced conversion, not the cards: with native output the same sessions stay flat from 9 to 96. LZ4 in Apple's Compression framework, on one CPU thread with random data, decompressed about 7.5 times faster than my best result.

Every number here is a measurement from this one machine and these test clips, not a specification.

## The machine

The host is a Mac Pro 7,1 with an Intel Xeon W-3245 (16 physical and 32 logical cores) and 192 GB of memory, running macOS 26.5 (build 25F71) with System Integrity Protection enabled. The Afterburner driver is `com.apple.driver.AppleAfterburner` version 6.1. It holds three Apple Afterburner cards, each built around a Xilinx Kintex UltraScale+ XCKU15P and each enumerating as PCI device `106b:0205`, and two AMD Radeon Pro Vega II MPX modules, which I kept out of every test. Unrelated Metal compute work on one of the two GPUs had caused a kernel panic earlier the same day, and one of them drives the display, where heavy compute can trip the WindowServer watchdog. (Compute on those GPUs is its own subject, in [GPU compute on the Mac Pro](/blog/mac-pro-gpu-compute).) What a single card does is in [my earlier post on the Afterburner card](/blog/mac-pro-afterburner-card).

<figure>
<img src="/images/blog/three-apple-afterburner-cards/vega-ii-mpx-modules.jpg" alt="A close, angled view of the three Afterburner cards edge-on in slots 5 to 7, above two enclosures labeled Radeon Pro Vega II MPX Module, with part of the logic board at the top and a slot latch panel at the right" width="1320" height="1526" loading="lazy" decoding="async">
<figcaption>The three Afterburner cards, edge-on in slots 5 to 7, above the two Radeon Pro Vega II MPX modules. The Vega II GPUs are the ones I excluded; nothing ran on them.</figcaption>
</figure>

### Where the three cards sit

Apple's slot table gives slots 1, 3, 4 and 5 up to sixteen lanes and slots 2, 6 and 7 up to eight, and an MPX module takes slots 1 and 2 or 3 and 4 ([Apple Support: Install PCIe cards in your Mac Pro (2019)](https://support.apple.com/en-us/101640)). With both MPX bays holding a Vega II, the three cards can only use slots 5, 6 and 7, and only slot 5 is x16. Apple recommends "installing Afterburner in slot 5" ([Apple Support: About the Afterburner accelerator card](https://support.apple.com/en-us/101662)), and its white paper says the card "requires a PCI Express x16 slot to deliver the highest stream counts due to the bandwidth required for decoded video frames" (the February 2020 Mac Pro white paper, no longer hosted by Apple, quoted verbatim by [Larry Jordan](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)).

| Card | Registry ID | Slot | Slot width |
|---|---|---|---|
| A | `0x100000b7d` | 5 | x16 |
| B | `0x100000b71` | 6 | x8 |
| C | `0x100000b72` | 7 | x8 |

Correction: the first version of this table had cards B and C in each other's slots. The machine record taken during verification puts `0x100000b71` in slot 6 and `0x100000b72` in slot 7, both x8. The negotiated links were the same idle and during a 27-stream 4K decode, x16 in slot 5 and x8 in slots 6 and 7, all at 8.0 GT/s (PCIe Gen 3), so the x16 against x8 difference is a fixed property of the slots, not an effect of load. I did not capture the Expansion Slot Utility's pool screenshot: reading that app needs a Screen Recording or Accessibility permission my automated session did not have.

Apple says "Up to three Afterburner cards will provide increased performance of ProRes and ProRes RAW decoding" ([Apple Support](https://support.apple.com/en-us/101662)), and that its driver "will load-balance ProRes decode tasks across multiple Afterburner cards if installed" ([Larry Jordan](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)), but it publishes no performance figure for more than one card. The machine's wider layout is in [my engineering analysis of the 2019 Mac Pro](/blog/mac-pro-2019-teardown-analysis).

<figure>
<img src="/images/blog/three-apple-afterburner-cards/mac-pro-interior.jpg" alt="Inside a Mac Pro: the Mac Pro label beside the finned processor heat sink, the three Afterburner cards edge-on below it, and two Radeon Pro Vega II MPX Module enclosures at the bottom" width="1320" height="1580" loading="lazy" decoding="async">
<figcaption>Inside the Mac Pro: the processor heat sink beside the Mac Pro label, the three Afterburner cards edge-on below it, and the two Vega II MPX modules at the bottom. Neither GPU was used for any test.</figcaption>
</figure>

## How I measured, and why my numbers are not Apple's

Every hardware decode test created its decompression sessions with `kVTVideoDecoderSpecification_RequireHardwareAcceleratedVideoDecoder` set to true. With that key in the decoder specification, "VideoToolbox tries to allocate a hardware-accelerated decoder. If it cannot, it returns an error and the session creation fails" ([Apple Developer documentation](https://developer.apple.com/documentation/videotoolbox/kvtvideodecoderspecification_requirehardwareacceleratedvideodecoder)), so nothing fell back to the CPU unnoticed. Per-card busy percentages came from `ab_percard`, a diagnostic tool that queries each card's driver user client directly. Apple does not document that interface, so read its busy figure as the driver's own indicator, not a calibrated measure of utilization.

The test clips were generated on this machine, not shot with a camera, and they are not alike. Only the 4K clip has gradient and noise content; the 1080p, 8K and 16K clips are flat test patterns, and the 32K clip came from the same generator as the 8K and 16K ones, which I did not re-verify. I counted a stream as real time if its decode rate stayed at 24 fps or better, the cinema frame rate; that criterion is mine, not Apple's. The stream-limit, CPU-load and mixed-resolution runs were bursts of about 15 to 40 seconds. Some things that matter were still not recorded: trials per configuration and run-to-run variance, and card temperatures.

The flavor matters. Apple's target rates at 1920x1080 and 29.97 fps run from about 45 Mbps for ProRes 422 Proxy to about 500 Mbps for ProRes 4444 XQ ([Apple Support: About Apple ProRes](https://support.apple.com/en-us/102207)). Every clip here is ProRes 422 HQ (FourCC `apch`) at 24 fps:

| Clip | Dimensions | Frames | Bitrate | Content |
|---|---|---|---|---|
| 1080p | 1920x1080 | 48 | 32.9 Mb/s | Flat |
| 4K | 3840x2160 | 48 | 698.7 Mb/s | Gradient and noise |
| 8K | 7680x4320 | 8 | 524.3 Mb/s | Flat |
| 16K | 15360x8640 | 4 | 2,086.6 Mb/s | Flat |
| 32K | 30720x17280 | 2 | 8,176.2 Mb/s | Not re-verified; same generator as 8K and 16K |

The 1080p clip's 32.9 Mb/s at 24 fps would be about 41 Mb/s at 29.97 fps, still under the roughly 45 Mbps Apple lists for the lightest flavor, so it is about as easy to decode as ProRes gets. The 4K clip is the only realistic one. That means the 1080p, 8K and 16K results were probably measured under more favorable conditions than real footage gives, and the four tiers should not be compared as if they decoded the same kind of content. Where a result depends on frame size, I state the assumption and call it an estimate.

Apple measured something else. Its claim is that "a 28-core Mac Pro with Afterburner can play back six streams of 8K DCI ProRes RAW at 29.97 fps" in Final Cut Pro with dual Vega II graphics, where "demosaicing frames of ProRes RAW is handled by the GPU" ([Apple Support](https://support.apple.com/en-us/101662)); the spec sheet gives the frame size as 8192x4320 ([Apple Support: Mac Pro (2019) Technical Specifications](https://support.apple.com/en-us/118461)). That is one card, ProRes RAW, 29.97 fps, application playback with the CPU and GPUs taking part. Mine is three cards, hardware-only decode, synthetic non-RAW ProRes, a 24 fps line and no GPU. Apple's own number has also moved: when it announced the Mac Pro in June 2019 it said "three streams of 8K ProRes RAW video" ([Apple Newsroom](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/)).

## How many streams do three cards hold?

Each count comes with its slowest stream's rate.

| Resolution | Highest pass | Lowest fail |
|---|---|---|
| 1080p | 106 at 24.10 fps | 108 at 23.80 fps (105 of 108 streams at 24 fps or better) |
| 4K | 27 at 24.40 fps | 28 at 23.50 fps (19 of 28) |
| 8K | 6 at 27.60 fps | 7 at 23.70 fps (5 of 7) |
| 16K | 2 at 27.80 fps | 3 at 19.30 fps (0 of 3) |
| 32K | 1 clip decoded | not a capacity test |

These come from a fine sweep (1080p at 96 to 112 streams, 4K at 20 to 32, 8K at 1 to 8, 16K at 1 to 3). My first pass tested only widely spaced levels and reported about 96 for 1080p (96 streams at 26.7 fps, 112 at 22.8) and had no rate for 8K or 16K. At 4K it read 24.3 fps at 27 streams and 23.4 at 28, against 24.40 and 23.50 here, a difference of about 0.1 fps, so I would still not call 27 exact. A bug in the first pass of the sweep's own stats script, found by reproducing its numbers by hand, led me to save every stream's raw rate and compute the statistics in a separate pass. Three of these four rows used flat clips, so only the 4K row reflects realistic content. The 32K clip was 30720x17280, and that row shows the decoder accepting the frame on the hardware-only path, not real-time capacity. ProRes itself supports "any frame size (including SD, HD, 2K, 4K, 6K, 8K, and larger)" ([Apple ProRes White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)), and Jonathan Morrison played a composited 15360x8640 timeline on one card in 2019 ([Wccftech](https://wccftech.com/mac-pro-afterburner-card-16k-footage-playback/)). Apple has not published Afterburner figures above 8K.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-capacity.jpg" alt="Chart of the slowest stream's frame rate against a 24 fps line: 1080p at 106 streams 24.10 pass, at 108 streams 23.80 fail; 4K at 27 streams 24.40 pass, at 28 streams 23.50 fail; 8K at 6 streams 27.60 pass, at 7 streams 23.70 fail; 16K at 2 streams 27.80 pass, at 3 streams 19.30 fail. Below, total frames per second across the sweep: about 2,700 at 1080p, about 680 at 4K, and 145.6 rising to 176.7 at 8K" width="1600" height="1996" loading="lazy" decoding="async">
<figcaption>The last pass and first fail at each resolution from the fine sweep, and the total frame rate across the sweep. The 1080p and 4K totals stay nearly flat, which is what a fixed amount of decode work shared among more streams looks like; the 8K total was still rising. Only the 4K clip has realistic content.</figcaption>
</figure>

### The limit looks like a fixed total, not a cliff

Multiply the stream count by the slowest stream's rate and the result barely changes across the 1080p and 4K boundaries. In the fine sweep the total stayed within about 8 of 680 frames per second at 4K (20 to 32 streams) and within about 25 of 2,700 at 1080p (96 to 112 streams). Each added stream divides a fixed total more finely. Dividing the total by 24 gives a close but slightly optimistic estimate of the ceiling: 28.3 for 4K against a real boundary of 27 passing and 28 failing, and 112.5 for 1080p against 106 passing and 108 failing. The gap is per-stream variance, not an error in the idea. In the first pass the same arithmetic had put the 1080p crossing near 106, an estimate the sweep then confirmed.

The pattern does not hold everywhere. 8K and 16K do not show it in the range I tested: the 8K total was still rising with the stream count, from 145.6 frames per second at one stream to 176.7 at eight, so 8K had not reached a fixed-budget plateau of the same kind. The first pass also read the three cards at 91, 94 and 96 percent busy at the 4K limit, which I took to mean all three were working. Per-second sampling later showed it did not (see the verification addendum below).

### The same limit, in pixels

Decoded pixels per second put the tiers on one scale. My log lacks frame sizes, so assume UHD (3840x2160 and 7680x4320); the DCI figures use 4096x2160 and 8192x4320:

| Tier | Basis | Pixels per second (estimate) |
|---|---|---|
| 1080p | 106 at 24.10 fps | about 5.3 billion |
| 4K | 27 at 24.40 fps | about 5.5 billion (DCI 5.8) |
| 8K | 6 at 27.60 fps | about 5.5 billion (DCI 5.9) |
| 16K | 2 at 27.80 fps, at 15360x8640 | about 7.4 billion |

The first three land in a band of 5.3 to 5.5 billion, and the flat 16K clip reaches 7.4 billion. I would not read the band as one throughput limit. Only the 4K clip has realistic content, flat clips are cheap to decode, and the 8K total was still rising with the stream count when the sweep ended. The mixed-resolution batch below does not fit a one-limit picture either, so treat that picture as a working model, not a finding.

Apple described one card as "capable of decoding up to 6.3 billion pixels per second" ([Apple Newsroom, June 2019](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/)), and its six-stream figure works out to the same: 6 x 8192 x 4320 x 29.97 is about 6.36 billion. By these estimates, at the 1080p, 4K and 8K limits my three cards together decoded fewer pixels per second than Apple's rating for one card; only the flat 16K clip, at about 7.4 billion, and the mixed batch below, at an estimated 7.2 billion, came out above it. That alone does not show the cards underperform. ProRes RAW carries "only one sample value per photosite" ([Apple ProRes RAW White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf)), while 4:2:2 and 4:4:4 ProRes carry more per pixel, and noisy frames may be costly to decode. Without the clip flavor and a one-card baseline I cannot separate content, imperfect scaling across cards and host-side limits. My six 8K streams equal Apple's six in value only; they neither confirm nor contradict Apple's figure.

## Does host CPU load slow the cards down?

Barely. At 96 streams of 1080p the host CPU was only about 18.6 percent busy. For the converse I pinned all 32 logical cores with independent busy-loop processes during decode at the first pass's limits, 96 streams of 1080p and 27 of 4K, leaving the CPU about 9 percent idle. Rates are slowest / average stream, in fps.

| Condition | 1080p, 96 streams | 4K, 27 streams |
|---|---|---|
| CPU idle | 26.7 / 28.1 | 24.4 / 25.2 |
| All 32 cores pinned | 25.8 / 27.2 | 24.2 / 25.0 |
| Slowest stream | 3.4% slower | 0.8% slower |

Both stayed above 24 fps. The cost is small, not zero, and the 4K change, 0.2 fps, is close to the 0.1 fps difference between two runs of the same configuration. The load was `yes > /dev/null` processes, which kept the CPU 89.5 percent in system time, so this does not cover memory-heavy or disk-heavy background work. The 1080p column ran at 96 streams, which the fine sweep later showed is 10 under that tier's edge.

## Mixed resolutions: the largest frames fell behind

Real timelines mix resolutions, so I ran half of each solo limit at the same time, in one batch: 3 streams of 8K, 13 of 4K and 48 of 1080p.

| Tier | Streams | fps: slowest / avg / fastest | Real time? |
|---|---|---|---|
| 8K | 3 of 6 | 18.8 / 19.5 / 20.8 | No |
| 4K | 13 of 27 | 24.5 / 25.4 / 27.8 | Yes |
| 1080p | 48 of 96 | 24.3 / 25.4 / 28.1 | Yes |

Added up, that asks for about one and a half times the work of any single limit (3 of 6, plus 13 of 27, plus 48 of 96 is 1.48 limits, or 1.43 against the corrected 1080p limit), so something had to give. The 4K and 1080p streams stayed just above 24 fps and the 8K streams took the whole shortfall: when resolutions mixed, the largest frames were the ones that fell behind.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-mixed-resolution.jpg" alt="Range chart of stream frame rates in the mixed batch against a 24 fps line: 8K, 3 streams, 18.8 to 20.8, average 19.5; 4K, 13 streams, 24.5 to 27.8, average 25.4; 1080p, 48 streams, 24.3 to 28.1, average 25.4" width="1600" height="1350" loading="lazy" decoding="async">
<figcaption>The first mixed batch, which was over capacity by design. Only the 8K tier dropped below 24 fps, on every one of its streams.</figcaption>
</figure>

In decoded pixels, again assuming UHD sizes, the batch ran at about 7.2 billion per second at its average rates, about 98 percent of what every stream at 24 fps would need and about 1.28 times the best single-resolution run measured the same way (27 streams of 4K at their 25.2 fps average, about 5.6 billion). So the solo limits correctly predicted the batch would not fit, and it still did better than a fixed-capacity model says. The solo tests may be held back by per-stream overhead or uneven balancing rather than pixel capacity; it was one batch, worth rerunning.

### Redone within capacity: still an 8K problem

I did rerun it, sized to add up to one limit: one third of each tier's first-pass solo ceiling, 2 of 6 at 8K, 9 of 27 at 4K and 32 of 96 at 1080p, 43 streams in all. That is exactly 1.00 of the first-pass ceilings. Against the corrected 1080p ceiling of 106 it is about 0.97 (2/6 + 9/27 + 32/106), so it is within budget either way, though not precisely at it.

| Tier | Streams | fps: slowest / avg / fastest | Streams at 24 fps or better |
|---|---|---|---|
| 8K | 2 of 6 | 23.0 / 24.0 / 25.0 | 1 of 2 |
| 4K | 9 of 27 | 36.1 / 37.4 / 39.3 | 9 of 9 |
| 1080p | 32 of 96 | 36.0 / 37.4 / 40.1 | 32 of 32 |

Even at a third of each solo ceiling, which is genuinely within budget, there is still a measurable penalty, but it is concentrated in 8K. The 8K streams ran right at the 24 fps edge and one of the two failed, while 4K and 1080p had 50 to 65 percent headroom and showed no penalty at all. That is a cleaner, narrower version of the over-budget finding: the mixing penalty is an 8K effect at this allocation, not a uniform one across the tiers.

A second allocation gave 8K a larger share (3 of 6) and 1080p a smaller one, and it improved every tier. But it also ran far fewer streams in total, 28 against 43, so it mostly shows the effect of a lower total load. It is not evidence that favoring 8K helps, and a cleaner test would hold the total constant while moving share toward 8K.

## Long runs, scrubbing and six processes at once

**Six minutes at 96 streams of 1080p.** I reran the 96-stream 1080p configuration, the first pass's limit, for six minutes, sampling every 20 seconds. All 96 streams kept decoding the whole time with no crashes or silent drops, the cards' pending-queue depth stayed bounded, and `CPU_Speed_Limit` in `pmset -g therm` stayed at 100 throughout, so the Mac's CPU never throttled. That flag reports on the CPU, not the cards, and I did not log card temperatures or per-stream frame rates over the run, so this shows six stable minutes, not 24 fps on every stream throughout.

**Scrubbing.** Feeding the decoder one 4K stream's frames in natural order gave 329.5 fps; in random order, repeated over 20 passes, 328.7 fps. That is within noise, as ProRes's design predicts: "each frame is encoded and decoded independently of any other frame" ([Apple ProRes White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)). It covers decoding only, not reading frames from storage.

**Six scrubbing processes.** Six scrub-pattern decode processes on this Mac each held 101.5 to 105.5 fps of 4K in a 9.3-second burst and 103.1 to 104.1 fps over 93 seconds. Together they total about 618 and 620 frames per second, within about 10 percent of the roughly 680 the 4K sweep held, which fits the fixed-total picture at 4K. These are six processes on one machine, not six workstations.

## What asking for a pixel format costs

VideoToolbox can return frames in the decoder's native format or convert them to one you request, such as 32-bit BGRA. Apple's guidance is that "Your video pipeline will be most efficient if your renderer is able to consume buffers in a format that is native to the decoder," since a mismatched request adds "a VTPixelTransferSession to do the required conversion" ([Apple WWDC20: Decode ProRes with AVFoundation and VideoToolbox](https://developer.apple.com/videos/play/wwdc2020/10090/)). The advice is Apple's; what I can add is the cost on these cards.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-output-format.jpg" alt="Bar chart. One 4K gradient and noise stream: native output 330.7 fps, forced 4:2:0 planar 236.2 fps, 29 percent slower, forced 32-bit BGRA 191.3 fps, 42 percent slower. Data-in-video frames: hardware native 779.3 fps, hardware forced BGRA 357.2 fps, 2.18 times slower; software native 1,717.5 fps, software forced BGRA 1,641.7 fps, about 4 percent slower" width="1600" height="1860" loading="lazy" decoding="async">
<figcaption>Two tests on different content, so the panels use different scales. The first is hardware decode only; in the second, conversion cost the hardware path far more than software decode.</figcaption>
</figure>

On one 4K stream of my test clips, with hardware decode required:

| Requested output | Decode rate | Against native |
|---|---|---|
| None (native) | 330.7 fps | |
| 4:2:0 planar | 236.2 fps | 29% slower |
| 32-bit BGRA | 191.3 fps | 42% slower |

That is one stream and synthetic content, with no trial count recorded; I did not measure the effect at the multi-stream limit, and all the stream counts above used native output. On the data-in-video frames from the file experiment below, the gap was larger: hardware decode ran at 779.3 fps native and 357.2 fps with BGRA, 2.18 times slower, while software decode went from 1,717.5 to 1,641.7 fps, about 4 percent slower. With no format requested for my ProRes 4444 data, this decoder handed back `v216`, a 16-bit 4:2:2 Y'CbCr format, although Apple names `y416` as the optimal native format for ProRes 4444 and `v216` as the native one for ProRes 422 ([Apple WWDC20](https://developer.apple.com/videos/play/wwdc2020/10090/)). That is an observation about this path, not documented behavior.

The verification pass rebuilt the file-recovery pipeline to read the decoder's native output and found the same direction at the pipeline level. At 4K with 1, 3 and 6 sessions native was 1.38, 1.31 and 1.36 times faster than forced BGRA, and on the long-lived sessions at matched density it was about 1.9 times faster. The sections on file recovery below have the details.

## How do three cards compare with Apple silicon?

Far behind. Apple says M3 Ultra can "play back up to 24 streams of 8K ProRes 422 video" ([Apple Newsroom, March 2025](https://www.apple.com/newsroom/2025/03/apple-reveals-m3-ultra-taking-apple-silicon-to-a-new-extreme/)), and its 2025 Mac Studio page describes that test as Final Cut Pro at 8192x4320 and 30 fps and rates the M4 Max Mac Studio at "Up to 18 streams of 8K ProRes video playback" ([Apple: Mac Studio, 2025 lineup](https://www.apple.com/ng/mac-studio/)). Its current Mac Studio page lists up to 19 streams of 8K ProRes 422 at 30 fps for M5 Max and up to 33 for M5 Ultra ([Apple: Mac Studio](https://www.apple.com/mac-studio/)). In 2023 Apple said the M2 Ultra Mac Pro "has the performance of not just one but seven Afterburner cards built in" ([Apple Newsroom, June 2023](https://www.apple.com/newsroom/2023/06/apple-unveils-new-mac-studio-and-brings-apple-silicon-to-mac-pro/)).

These are Final Cut Pro tests of whole computers at 30 fps, so the comparison with my six 8K streams is rough, but no difference in method closes a gap this large. Apple also says the card "is not supported in Mac Pro (2023)," whose media engine "has superior performance to Afterburner" ([Apple Support: PCIe cards you can install in your Mac Pro (2023)](https://support.apple.com/en-us/101988)). The honest case for these cards is narrower: dedicated decode capacity, largely isolated from the CPU, that an existing Intel Mac Pro can add. (I looked at [whether Apple silicon could replace x86 in servers](/blog/apple-silicon-server-future) separately.)

## Could the FPGA do something else?

Before the benchmarks I asked a more ambitious question: whether the FPGA under the card's ProRes function could be reprogrammed for general compute or signal processing. I stopped before any firmware write, any JTAG access and any physical modification.

### What is on the card

Each card is built around a Xilinx (now AMD) Kintex UltraScale+ XCKU15P in the FFVA1156 package; the lid reads FFVA1156AAZ, where AAZ is AMD's mask code, not part of the package name ([AMD UG575](https://docs.amd.com/v/u/en-US/ug575-ultrascale-pkg-pinout)). The marking is visible in board photos, but I was not the first to name the chip publicly: a December 2025 MacRumors teardown thread names it, with forum user rb2112 writing "XCKU15P FFVA1156AAZ" under board photos posted by user Zhi ([MacRumors forums](https://forums.macrumors.com/threads/apple-afterburner-card-teardown.2474849/)). Apple's description, "The FPGA has over a million system logic cells and can process up to 6.3 billion pixels per second," fits the part ([Larry Jordan, quoting Apple's white paper](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)). The PCI ID `106b:0205` says only that the card is an Apple device; the identification rests on the board markings. AMD lists the XCKU15P at 1,143,450 system logic cells, 522,720 lookup tables and 1,968 DSP slices ([AMD DS890](https://docs.amd.com/v/u/en-US/ds890-ultrascale-overview)).

### What I worked out

I reverse-engineered enough of `AppleAfterburner.kext` to map its BAR0 register section-walk layout, its SPI flash protocol (dual-parallel x8, with each byte nibble-interleaved across primary and secondary halves), the golden and live pointer mechanism that decides which bitstream boots, and its IOKit user-client API. That API has seven selectors, all decode-specific: submit frame, query completion, bind frame, card status, check-for-space, unbind and get-percent. There is no general-compute hook in it.

Parts were already visible. Method names such as `submitFrame`, `queryCompletion`, `cardStatus`, `getPercent` and the flash routine `spiprogram` appear in public symbol databases built from Apple's kernel debug kits ([blacktop/symbolicator](https://github.com/blacktop/symbolicator)), and Apple's sandbox profiles name the `AppleAfterburnerUserClient` class ([knightsc/sandbox_profiles](https://github.com/knightsc/sandbox_profiles)). The flash arrangement is standard AMD: UG570 describes "two identical x4 SPI flash devices connected in a parallel fashion," each holding one nibble of every byte, and a MultiBoot scheme that falls back to a golden image at address 0 ([AMD UG570](https://docs.amd.com/r/en-US/ug570-ultrascale-configuration)). I could not find a public write-up of the register layout, flash layout or full selector table, and I have not published the register offsets, flash addresses or selector numbers here.

### What the fuses do, and why their state is unknown

UG570's Table 41 documents a one-time-programmable security register, `FUSE_SEC`. Bit 0, `FUSE_SHAD_SEC[0]` (`CFG_AES_Only` in Vivado), means "Only allow encrypted bitstreams" through the external configuration ports. Bit 3, `FUSE_SHAD_SEC[3]`, "Disables external JTAG pins." Other bits force RSA signature checks (`RSA_AUTH`) or allow only the AES key stored in eFUSE, and "each selection is permanent" ([AMD UG570](https://docs.amd.com/r/en-US/ug570-ultrascale-configuration); [AMD UG908](https://docs.amd.com/r/en-US/ug908-vivado-programming-debugging)). AMD's current app note recommends programming bit 0 in designs that use encryption ([AMD XAPP1267](https://docs.amd.com/r/en-US/xapp1267-encryp-efuse-program)).

The guide says what the fuses do, not whether Apple blew them. I never read the cards' fuse register or ran the test that would show it, so their state on these cards is unknown. Apple's own statement points one way: the card "uses a secure firmware loading process that ensures it can only run Apple authorized code" ([Larry Jordan, quoting Apple's white paper](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)). Published attacks on this chip family do not help an owner with software alone: JustSTART (CVE-2023-20570) bypasses RSA authentication only on chips that enforce it without also enforcing encryption by fuse ([AMD advisory 000036039](https://docs.amd.com/r/en-US/000036039)), and thermal laser extraction of a battery-backed key needs failure-analysis lab equipment ([Lohrke et al., IACR ePrint](https://eprint.iacr.org/2018/717)).

### The tooling and the test I never ran

Vivado's free tier does not support this chip. As of Vivado 2026.1 the free BASIC tier covers only the XCKU3P and XCKU5P in this family ([AMD UG973](https://docs.amd.com/r/en-US/ug973-vivado-release-notes-install-license/Device-Availability-by-Subscription-Tier)), so the XCKU15P needs at least the CORE tier, which AMD lists at $1,200 a year node-locked or $1,800 a year floating ([AMD: Vivado licensing options](https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado/vivado-licensing-options.html)).

I built a flash read, write and restore tool and tested it only against a simulated model of the hardware, never a real card. That testing caught several bugs in the tool and forced a redesign of the restore mechanism once it showed that the planned flash-read backup could not tell the card's two physical flash chips apart. The decisive next step was designed and never run: flash an Apple firmware image to one card's live region from a Linux boot environment (what Linux can do on this machine is in my [Linux on the Mac Pro 7,1](/blog/linux-on-mac-pro-7-1) notes), purely to see whether the fuses enforce encrypted-only loading.

### Why I stopped

After three rounds of outside critique I stopped, for three reasons in order of weight:

1. A real reprogram needs three things, none optional: a chip that accepts bitstreams I can produce, which is unknown; a CORE license plus realistically months of from-scratch HDL work, since no bitstream library exists for turning this chip into a general accelerator; and a JTAG recovery path for the bad bitstreams real FPGA development produces, which breaks my rule for this project: software only.
2. Even a successful decisive test would have settled only the first of those.
3. The critique found a real inconsistency in my design: the restore tool existed to avoid needing JTAG, but a software-only restore cannot stand in for a hardware recovery path in real development.

So the outcome is a documented feasibility study and an abandoned plan, not a reprogrammed card. The reasoning is here for anyone with a different tolerance for risk.

## Files through a video decoder

The card has no general-compute interface, but its decoder is a deterministic transform from compressed bits to pixels, so it might carry arbitrary data. Storing files as video is not new. David K. Zhang's YouTubeDrive did it in 2017 with colored squares on YouTube ([GitHub: YouTubeDrive](https://github.com/dzhang314/YouTubeDrive)), and Infinite Storage Glitch's color mode put one byte in each of a block's red, green and blue values in 2023: "One rgb pixel can contain 3 bytes at a time" ([GitHub: Infinite Storage Glitch](https://github.com/KristianAskS/Infinite-Storage-Glitch); [Gigazine](https://gigazine.net/gsc_news/en/20230222-youtube-infinite-file-storage)). My block layout uses the same idea. Bringing non-video data back exactly through a hardware video decoder is not new either: NVIDIA researchers streamed light-probe data through hardware HEVC in 2021, using "the YUV444 surface format to avoid chroma subsampling for lossless compression" ([Stengel et al., ACM MMSys '21, arXiv](https://arxiv.org/abs/2103.05875)). What I could not find was anyone doing it through ProRes, or through the Afterburner.

### The technique

Bytes go into ProRes 4444 frames as large solid-color blocks, each 16x16-pixel block carrying 3 bytes, one in each of its red, green and blue values. ProRes 4444 keeps full-resolution color with no chroma subsampling, so each block's three values survive, though not losslessly: the bitstream codes Y'CbCr ([SMPTE RDD 36](https://pub.smpte.org/pub/rdd36/rdd36-2022.pdf)), and Apple calls ProRes 4444 "visually lossless" for color, with only its alpha channel "mathematically lossless" ([Apple ProRes White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)). Even so, in every test below the bytes came back exact. The block size also matches ProRes's 16x16 macroblocks ([SMPTE RDD 36](https://pub.smpte.org/pub/rdd36/rdd36-2022.pdf)). Every frame carries a small header block with a magic byte and the frame's own index, so the reader trusts content rather than position (see the bugs below). Decoding goes through the cards with hardware decode required.

The [demo on the companion page](/afterburner#demo) is a browser simulation of the block idea, not ProRes and not the Afterburner: type some text, and it paints the bytes as blocks, adds noise if you ask, and reads them back.

### Did the bytes come back?

| Test | Scale | Result |
|---|---|---|
| Small files | 500 KB, then 10 MB | Bit-exact |
| Parallel files | 48 x 1 MB, at once | 48 of 48 bit-exact |
| Large runs | 3 x 50 MB, 6 x 50 MB | All bit-exact |
| Sustained run | 1 GB (3 x 333 MB) | All bit-exact |
| A real program | 97,416-byte Mach-O | Bit-exact, and it ran |

Made executable after recovery, the compiled program ran and printed its usage message. An executable is just a file, and any file-in-video tool could carry one; what is new is the path it took.

### About 16 MB/s, a ceiling of the BGRA conversion

Rebuilding the pipeline entirely in memory, `VTCompressionSession` straight into `VTDecompressionSession` with no disk and no container, gave the same throughput, about 5.4 to 5.6 MB/s per concurrent session, and threads in one process matched separate processes, about 4.9 MB/s per session and 14.6 to 16 MB/s in total. That rules out file I/O, the container and process scheduling as causes of the figure below.

With long-lived sessions and output forced to 32-bit BGRA, which my byte-extraction code needed, recovery topped out at about 16 MB/s across all three cards:

| Configuration | Total throughput |
|---|---|
| 1080p, 3 sessions | 15.60 to 15.63 MB/s |
| 1080p, 6 sessions | 15.75 MB/s |
| 4K, 3 sessions | 16.0 to 16.03 MB/s |
| 3 sessions, 1 GB total | 16.35 MB/s |

The three-session 1080p runs were bit-exact and stable across repeats, and the 1 GB run took a little over 60 seconds with no slowdown, 3 of 3 bit-exact. Six sessions added nothing over three, the figure held at both resolutions, and raising my harness's in-flight request limit from 8 to 32 did not move it. That is a ceiling for this pipeline, and the verification pass below showed that the forced BGRA conversion produced it, not the cards. No card was more than about 76 percent busy in the three-session runs, against 91 to 96 percent at the 4K video limit, and in a separate test BGRA output alone made hardware decode 2.18 times slower. A constant MB/s across resolutions is what any per-pixel limit produces, since the payload is a fixed 3 bytes per 256 pixels. And if that separate test was one session at 1080p (my log does not say), its native 779.3 fps would carry an estimated 18.8 MB/s on its own (about 24,100 payload bytes per 1080p frame, counting a MB as a million bytes), more than the three-card BGRA figure.

The card in the x16 slot was consistently busier, about 73 to 76 percent, than the two in x8 slots, about 59 to 60 percent, with all three working at once. Busy percentage is not throughput, so this shows uneven load, not how much slot bandwidth matters, and a rough estimate says lane count was unlikely to be the limit: 16 MB/s of payload at 1080p is roughly 660 frames per second, which at 4 bytes per output pixel is about 5.5 GB/s for all three cards, around 1.8 GB/s each, against about 7.9 GB/s for a PCIe 3.0 x8 link (Apple lists the slots as PCI Express gen 3 in its [technical specifications](https://support.apple.com/en-us/118461)). I did not capture the Expansion Slot Utility pool allocation, though the negotiated link widths, recorded later, were x16 in slot 5 and x8 in slots 6 and 7, identical idle and under load, and the Mac Pro balances bandwidth across two PCIe pools by default ([Apple Support](https://support.apple.com/en-us/101640)).

Sending work to each card directly through raw IOKit might beat this figure, but VideoToolbox's two device-selection keys, `kVTVideoDecoderSpecification_RequiredDecoderGPURegistryID` and `kVTVideoDecoderSpecification_PreferredDecoderGPURegistryID`, each "can only be used to specify a GPU registryID corresponding to a removable GPU (eGPU)" ([VTDecompressionProperties.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTDecompressionProperties.h)), and the raw route needs System Integrity Protection disabled or blind reverse engineering of the undocumented format the submit-frame call expects, so I did not attempt it.

### With forced BGRA, many short sessions hit a cliff at ten

With many short-lived sessions each doing the same small job, time per session grew smoothly from 0.19 seconds with one session to 0.68 seconds with nine. At ten it jumped to 1.87 seconds, 2.75 times the nine-session time, and eleven to thirteen sessions sat between 3.1 and 3.6 seconds. Counted as total work done, throughput fell by about 60 percent from nine sessions to ten.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-session-sweep.jpg" alt="Chart of time per session against concurrent sessions: 0.19 s at 1, 0.68 s at 9, 1.87 s at 10, and 3.1 to 3.6 s at 11 to 13. Below, nine sessions run four times back to back: 0.76, 0.74, 1.06 and 2.69 seconds" width="1600" height="1938" loading="lazy" decoding="async">
<figcaption>The short-session sweep, and the same nine-session run repeated four times in a row. The repeats slowed down without ever crossing ten.</figcaption>
</figure>

Repeating the nine-session run four times back to back also slowed it: 0.76, 0.74, 1.06, then 2.69 seconds. Something is not released promptly between short-lived sessions, so part of what looks like a cliff at ten may be state left from earlier runs. The long-lived sessions above avoided the problem entirely. The cliff belongs to the short-session pattern and is unrelated to the stream limits above, since the video tests ran 96 and 112 concurrent streams without it. The verification pass later showed it also belongs to the forced BGRA output, as the next section describes.

### With native output there is no cliff

I rebuilt the short-session pipeline to decode to the hardware's native pixel format, `y416` for ProRes 4444, instead of forcing BGRA. That needed one calibration. Reading only the top 8 bits of the native 16-bit luma channel makes adjacent byte values collide, so that 0 and 1 both read back as the same output; the rebuilt pipeline uses the full 16-bit value through a calibrated linear inverse transform. With that fixed, every configuration below came back 100 percent bit-exact.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-native-sweep.jpg" alt="Bar chart of aggregate recovery throughput at 1080p for 1, 3, 6, 9 and 12 sessions. Forced BGRA: 1.04, 2.11, 2.30, then 0.48 and 0.31 MB/s, collapsed. Native output: 1.40, 2.73, 3.24, 3.39 and 3.48 MB/s. Below, native output from 16 to 96 sessions holds 3.4 to 3.5 MB/s combined, 280 of 280 bit-exact" width="1600" height="1560" loading="lazy" decoding="async">
<figcaption>The short-session sweep with forced BGRA against native output, aggregate MB/s on three cards. BGRA collapses at 9 and 12 sessions while native keeps rising slightly and then stays flat.</figcaption>
</figure>

| Resolution | Sessions | BGRA | Native | Native advantage |
|---|---|---|---|---|
| 1080p | 1 | 1.04 MB/s | 1.40 MB/s | 1.35x |
| 1080p | 3 | 2.11 MB/s | 2.73 MB/s | 1.29x |
| 1080p | 6 | 2.30 MB/s | 3.24 MB/s | 1.41x |
| 1080p | 9 | 0.48 MB/s (collapsed) | 3.39 MB/s | 7.1x |
| 1080p | 12 | 0.31 MB/s (collapsed further) | 3.48 MB/s | 11.2x |
| 4K | 1 | 1.23 MB/s | 1.70 MB/s | 1.38x |
| 4K | 3 | 2.32 MB/s | 3.03 MB/s | 1.31x |
| 4K | 6 | 2.47 MB/s | 3.37 MB/s | 1.36x |

At low concurrency native is a consistent 1.3 to 1.4 times faster, which matches the earlier controlled frame-rate comparison. At 9 and 12 sessions BGRA collapses, exactly where the cliff above sits, while native does not degrade at all. I extended the native sweep to 16, 24, 32, 48, 64 and 96 sessions: it stays flat at 3.4 to 3.5 MB/s combined, with 280 of 280 runs bit-exact. The cliff at ten sessions was not a limit of the cards. It belonged to the forced BGRA path.

The same swap on the few long-lived sessions that produced the 16 MB/s figure (3 sessions, 50 MB payloads each) gave 10.4 MB/s decode-only with native output against 5.5 MB/s with BGRA at matched (1x) density, about 1.9 times, consistent with the advantage above. One caveat matters. The original 16 MB/s used a 3x-density scheme that triples the RGB channels, and I have calibrated the native path only for the luma channel, not yet chroma. So a native number at that density has not been measured. Scaling the 1x result linearly puts it near 30 MB/s, and that projection is not a result.

### Software decode was faster, by less than it first looked

This content is deliberately hostile to a DCT codec: high-frequency, uncorrelated blocks, closer to worst-case entropy for such a codec than real video. On it, software decode beat the hardware path.

| Measure | Hardware | Software |
|---|---|---|
| One session | 7.7 to 8.2 MB/s | 37.9 MB/s |
| Best total | about 16 MB/s | 136 to 139 MB/s |
| 32 distinct payloads | | 32 of 32 bit-exact |
| With 48 video streams | 1.0 MB/s | 23.3 MB/s |

The single-session runs used a 10 MB payload. Hardware decode reached its best total at 3 to 6 sessions and software decode at 24 to 32, matching the 32 logical cores. With 48 hardware video streams also running, the hardware path fell to 13 percent of its solo rate and software decode to 61 percent, while the video streams kept an average above real time in every run (54.9 to 70.0 fps against 55.4 without the extra work); my log does not give their resolution.

My first pass overstated the margin, because every number in that table was taken with BGRA forced on both paths, and BGRA costs the hardware path far more than software. In the separate frame-rate test from the pixel-format section, each path with its native output, software decode ran about 2.2 times as fast as the hardware path on this content (1,717.5 against 779.3 fps); my log does not record that test's session count or frame size. With every core against all three cards the measured gap was about 8.5 to 9 times, but that comparison forced BGRA, and I did not repeat it with native output. The direction holds; the size depends on what you compare. Native output would also speed up the hardware path in the first table, so its hardware rows understate what the cards can do.

### Codec profiles

In software decode with a 10 MB payload, ProRes 4444 was the fastest of the five formats I tried:

| Format | Software decode |
|---|---|
| ProRes 4444 | 37.9 MB/s |
| ProRes 422 Proxy | 31.6 MB/s |
| ProRes 422 HQ | 28.6 MB/s |
| HEVC | 8.5 MB/s |
| H.264 | 2.0 MB/s |

It is also the only one of the five with full-resolution color, which the three-bytes-per-block layout needs. I verified bit-exact recovery only with ProRes 4444; for the others these are throughput figures.

### Damaged frames

I corrupted a known-good compressed frame at increasing levels and fed it to the decoder (my log does not say whether this test required the hardware path):

| Corruption | Result |
|---|---|
| 0% | Decoded at once |
| 0.1% | Decoded after about 2 seconds |
| 1, 5 and 20% | Error -12913 (not available now) |
| 50% | Error -12911 (malfunction) |
| 100% | Error -12909 (bad data) |

The three codes are `kVTVideoDecoderNotAvailableNowErr`, `kVTVideoDecoderMalfunctionErr` and `kVTVideoDecoderBadDataErr` in Apple's header ([VTErrors.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTErrors.h)), whose documentation pages give the names and nothing more ([Apple Developer: kVTVideoDecoderNotAvailableNowErr](https://developer.apple.com/documentation/videotoolbox/kvtvideodecodernotavailablenowerr)). Only the 100 percent corrupted frame produced the bad-data code. "Not available now" is not a verdict on the input, and its cause here is undocumented. I tested one frame per level, so I would not read these results as the decoder detecting bad data.

The process never crashed or hung, and by Apple's design a decoder crash would not have taken it down: VideoToolbox "runs decoders out-of-process in a sandboxed server," so "if there is a crash in the video decoder, the result is a decode error rather than crashing your entire application" ([Apple WWDC20](https://developer.apple.com/videos/play/wwdc2020/10090/)). The quiet result matters most for storing data: at 0.1 percent the decoder returned a frame, and I did not check whether its bytes were still correct, so a lightly damaged file could come back wrong without any error. A checksum over the recovered file belongs in any real use.

### Dead ends

- **Scaled decode as an averaging primitive.** Half-resolution output matched neither a clean 2x2 average (mean error 46 out of 255) nor nearest-neighbor sampling, probably because the 8x8-pixel test pattern was too fine to survive ProRes compression, so this was inconclusive.
- **ProRes RAW.** Asking VideoToolbox for a ProRes RAW encoder on this Mac failed with -12908, `kVTCouldNotFindVideoEncoderErr` ([Apple Developer](https://developer.apple.com/documentation/videotoolbox/kvtcouldnotfindvideoencodererr)). ProRes RAW encodes camera sensor data, "the Bayer pattern image" ([Apple ProRes RAW White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf)), so I could not synthesize it here.

### Against ordinary compression

I ran the same 10 MB random payload through Apple's built-in Compression framework, with no video and no Afterburner.

<figure>
<img src="/images/blog/three-apple-afterburner-cards/fig-baseline.jpg" alt="Bar chart of decompression rates: LZ4 1,034 MB/s, LZMA 806, LZFSE 456, software ProRes decode with 24 to 32 sessions 136 to 139, zlib 126, and three Afterburner cards with BGRA output about 16 MB/s" width="1600" height="1548" loading="lazy" decoding="async">
<figcaption>One library call on one CPU thread against my best results through video. The hardware path is the short bar at the bottom.</figcaption>
</figure>

| Method | MB/s |
|---|---|
| LZ4, one thread | 1,034 |
| LZMA, one thread | 806 |
| LZFSE, one thread | 456 |
| zlib, one thread | 126 |
| Software ProRes decode | 136 to 139 |
| Three cards, BGRA output | about 16 |

LZ4 on one thread was about 7.5 times my best software-decode result and more than 60 times the BGRA hardware path, and still more than 30 times even the unmeasured native projection of about 30 MB/s. Random data does not compress, so these library rates are close to a plain copy and are not a ranking of the algorithms. The point is only that the video route is not a fast way to move bytes.

End to end it is slower still, because those numbers are read-back only, and encoding into ProRes is software on this machine: Apple documents the card as accelerating "ProRes and Pro Res RAW decoding and playback" ([Apple Support](https://support.apple.com/en-us/101662)), and its ProRes encoders "have all been built as efficient software implementations" ([Apple ProRes White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)). With 24 processes each handling a 42 MB payload, encoding took about 50 to 55 seconds per process and decoding about 7 to 11 seconds. This is a demonstration, not a tool.

## The bugs that shaped the results

- **The wrong pixel format.** With no format requested, the decoder handed back `v216` (`kCVPixelFormatType_422YpCbCr16`), which TN2162 lays out as 16-bit little-endian Cb, Y'0, Cr, Y'1 per pair of pixels ([Apple TN2162](https://developer.apple.com/library/archive/technotes/tn2162/_index.html)): the same 4 bytes per pixel as BGRA, with a completely different meaning. Reading it as BGRA got 99.6 percent of recovered bytes wrong. Requesting BGRA explicitly fixed it, and measuring that request's cost led to the pixel-format results.
- **Phantom frames.** One test wrote exactly one frame and `AVAssetReader` returned five samples. Apple documents that `copyNextSampleBuffer` "may return marker-only sample buffers as well as sample buffers containing media data" ([AVAssetReaderOutput.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/AVFoundation.framework/Versions/A/Headers/AVAssetReaderOutput.h)), the likely explanation. The self-describing header fixed it, and the in-memory pipeline never showed extra samples.
- **A semaphore that crashed when it was freed.** A `DispatchSemaphore` throttled in-flight decode requests, and a small fixed number of submissions per file never produced a completion callback in my harness. Deallocating a semaphore while its count is below its starting value "causes an EXC_BAD_INSTRUCTION exception" ([Apple Developer: DispatchSemaphore](https://developer.apple.com/documentation/dispatch/dispatchsemaphore/init(value:)); [libdispatch source](https://github.com/apple-oss-distributions/libdispatch)), so a lock-protected counter replaced it. VideoToolbox documents a callback for every decode call that does not return an error ([VTDecompressionSession.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTDecompressionSession.h)), so the missing callbacks more likely came from how my harness submitted frames.
- **A `wait` that never returned.** The CPU-stress script's bare `wait` also waited on the endless `yes > /dev/null &` load generators, since bash's bare `wait` covers "all currently active child processes" ([bash 3.2 source, Apple open source](https://github.com/apple-oss-distributions/bash)); waiting on specific PIDs fixed it.
- **Mistaking a conversion for a limit.** I read the 16 MB/s figure and the cliff at ten sessions as properties of the cards. A rebuild that read the decoder's native output removed both, which puts the cause in the BGRA conversion my harness forced, so the first headline number of the file experiment was an artifact of my own pipeline.
- **A stats script that hid the edge.** The first pass of the verification sweep's stats script had a bug. I reproduced its numbers by hand before trusting any result, and the fixed version saves every stream's raw rate and computes the statistics in a separate, auditable pass.

## Verification addendum

After the first version of this report I ran a seven-item test list meant to remove the hedges I had written into it. The raw data (CSVs, logs and the harness source) is saved on the test machine. Two results change conclusions and the others tighten numbers. Where a number in the sections above differs from the first version, the sections above are current.

| Item | What I ran | What it changed |
|---|---|---|
| 1. Machine record | macOS, CPU, memory, driver, SIP and PCI details | Filled in the machine. Cards B and C are in slots 6 and 7, not 7 and 6 |
| 2. Test clips | FourCC, dimensions, frames, bitrate and content of each clip | Only the 4K clip is realistic content. The 1080p, 8K and 16K clips are flat, so tiers are not comparable |
| 3. PCIe links | Link width and speed idle and during a 27-stream 4K decode | No change: the x16 against x8 difference is a fixed property of the slots |
| 4. Native output | Rebuilt the file-recovery pipeline for native output | No cliff. The 16 MB/s figure and the cliff past nine sessions came from forced BGRA |
| 5. Fine stream sweep | 1080p 96 to 112, 4K 20 to 32, 8K 1 to 8, 16K 1 to 3 | The 1080p limit is 106. The fixed total holds at 1080p and 4K, not at 8K or 16K |
| 6. Per-card busy | Per-second sampling, three runs each | The early 1080p readings were a ramp-up transient. At 4K one or two cards were sometimes idle |
| 7. Mixed within capacity | One third of each first-pass solo ceiling, 43 streams | The penalty is an 8K effect |

On item 6: at 96 streams of 1080p the first second after launch reads unevenly across runs (23/13/9, 98/12/18 and 87/16/72 percent per card) and settles to 99/100/100 by the third second, which reconciles the early readings with the later ones. At 4K with 27 streams it is different. In two of three runs one x8 card (`0x100000b71`) dropped to 0 percent busy for most of the run while the other two carried the full load, and in the third run both x8 cards dropped to 0, leaving the x16 card doing nearly all the work. So the 27-stream ceiling was sometimes reached with only one or two of the three cards, and the true all-three-cards 4K capacity may be higher. I count that as an open question, not a settled number.

### What the pass did not settle

- **The Expansion Slot Utility pool screenshot** (item 3), which needs a Screen Recording permission I could not grant from an automated session.
- **The native 3x-density ceiling** (item 4): projected at about 30 MB/s from the 1x result and not measured, and it needs chroma-channel calibration for the native `y416` Cb and Cr components.
- **Whether the 4K ceiling is truly 27 with all three cards reliably active,** or higher with better load distribution (item 6).
- **A cleaner 8K-favoring mixed test** that holds the total stream count constant (item 7).

## What is new here, and what is not

As far as I could find, these are new:

- **Measurements of a three-card Afterburner system,** which I could not find published. Single-card results do exist: Apple's own, [Bare Feats](https://barefeats.com/mac-pro-2019-with-afterburner-render-speeds.html) on render times, Macworld's export test via [9to5Mac](https://9to5mac.com/2021/12/16/m1-max-prores-benchmark/), Max Yuryev's report of four 8K ProRes RAW streams on [MacRumors](https://forums.macrumors.com/threads/afterburner-card.2221517/), and Jonathan Morrison's stream tests.
- **Bit-exact file recovery through the Afterburner's hardware ProRes decoder,** from 500 KB to 1 GB, including a program that ran afterward, and how that path behaves under load.
- **Measured costs of output-format conversion on these cards.**
- **A documented feasibility study of reprogramming the FPGA,** with the driver's register, flash and selector details worked out but not published, and no card reprogrammed.

And these are not:

- Storing files as video (YouTubeDrive, 2017), or one byte per color channel of a block (Infinite Storage Glitch, 2023).
- Recovering non-video data exactly through a hardware video decoder (NVIDIA Research, 2021).
- The chip's identity (the December 2025 MacRumors thread), and Apple's statement that the card runs only Apple-authorized code (Apple, 2020).
- Requesting the decoder's native format (Apple, WWDC20), the missing scrubbing penalty (ProRes is intra-frame by design), and the preference for an x16 slot (Apple).

## What I would test next

- **Regenerate the 1080p, 8K and 16K clips with matching gradient and noise content,** then repeat the limits five or more times each, and add Apple's 29.97 fps line, before comparing the tiers with each other again.
- **Find out why the load balancer sometimes leaves one or two cards idle at 4K,** and rerun the 27-stream test until all three stay busy to learn the true three-card ceiling.
- **Measure the native 3x-density ceiling** after calibrating the chroma channels, instead of projecting it.
- **Capture the Expansion Slot Utility pool screenshot,** idle and during a 4K run.
- **Rerun the mixed test** with a design that holds the total stream count constant while moving share toward 8K, and **test real ProRes formats Apple's way,** in Final Cut Pro at 29.97 fps.
- **Validate the busy figure and get a one-card baseline,** checking that `ab_percard` tracks load linearly.
- **Run an hour** with per-stream logging and `powermetrics`, **repeat the corruption test** with many frames per level, checking the 0.1 percent frames byte for byte, and **publish SHA-256 hashes** of the recovered files.

## Sources

- [Apple Support: About the Afterburner accelerator card for Mac Pro (2019)](https://support.apple.com/en-us/101662)
- [Apple Support: Mac Pro (2019) Technical Specifications](https://support.apple.com/en-us/118461)
- [Apple Support: Install PCIe cards in your Mac Pro (2019)](https://support.apple.com/en-us/101640)
- [Apple Support: PCIe cards you can install in your Mac Pro (2023)](https://support.apple.com/en-us/101988)
- [Apple Support: About Apple ProRes](https://support.apple.com/en-us/102207)
- [Apple Newsroom: Apple unveils powerful, all-new Mac Pro and groundbreaking Pro Display XDR (June 2019)](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/)
- [Apple Newsroom: Apple unveils new Mac Studio and brings Apple silicon to Mac Pro (June 2023)](https://www.apple.com/newsroom/2023/06/apple-unveils-new-mac-studio-and-brings-apple-silicon-to-mac-pro/)
- [Apple Newsroom: Apple reveals M3 Ultra, taking Apple silicon to a new extreme (March 2025)](https://www.apple.com/newsroom/2025/03/apple-reveals-m3-ultra-taking-apple-silicon-to-a-new-extreme/)
- [Apple: Mac Studio (2025 lineup, regional page)](https://www.apple.com/ng/mac-studio/)
- [Apple: Mac Studio](https://www.apple.com/mac-studio/)
- [Apple: Apple ProRes White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)
- [Apple: Apple ProRes RAW White Paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf)
- [Apple Developer: WWDC20, Decode ProRes with AVFoundation and VideoToolbox](https://developer.apple.com/videos/play/wwdc2020/10090/)
- [Apple Developer: kVTVideoDecoderSpecification_RequireHardwareAcceleratedVideoDecoder](https://developer.apple.com/documentation/videotoolbox/kvtvideodecoderspecification_requirehardwareacceleratedvideodecoder)
- [Apple Developer: kVTVideoDecoderNotAvailableNowErr](https://developer.apple.com/documentation/videotoolbox/kvtvideodecodernotavailablenowerr)
- [Apple Developer: kVTCouldNotFindVideoEncoderErr](https://developer.apple.com/documentation/videotoolbox/kvtcouldnotfindvideoencodererr)
- [Apple Developer: DispatchSemaphore init(value:)](https://developer.apple.com/documentation/dispatch/dispatchsemaphore/init(value:))
- [Apple Developer: TN2162, Uncompressed Y'CbCr Video in QuickTime Files](https://developer.apple.com/library/archive/technotes/tn2162/_index.html)
- [Apple SDK header mirror: VTErrors.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTErrors.h)
- [Apple SDK header mirror: VTDecompressionProperties.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTDecompressionProperties.h)
- [Apple SDK header mirror: VTDecompressionSession.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/VideoToolbox.framework/Versions/A/Headers/VTDecompressionSession.h)
- [Apple SDK header mirror: AVAssetReaderOutput.h, macOS 15.5 SDK](https://raw.githubusercontent.com/alexey-lysiuk/macos-sdk/main/MacOSX15.5.sdk/System/Library/Frameworks/AVFoundation.framework/Versions/A/Headers/AVAssetReaderOutput.h)
- [Apple Open Source: libdispatch](https://github.com/apple-oss-distributions/libdispatch)
- [Apple Open Source: bash](https://github.com/apple-oss-distributions/bash)
- [Larry Jordan: Thoughts on Afterburner, 2019 Mac Pro ProRes GPU (quoting Apple's Mac Pro white paper)](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)
- [SMPTE: RDD 36, Apple ProRes Bitstream Syntax and Decoding Process](https://pub.smpte.org/pub/rdd36/rdd36-2022.pdf)
- [MacRumors Forums: Apple Afterburner card teardown](https://forums.macrumors.com/threads/apple-afterburner-card-teardown.2474849/)
- [MacRumors Forums: Afterburner card](https://forums.macrumors.com/threads/afterburner-card.2221517/)
- [AMD: DS890, UltraScale Architecture and Product Data Sheet](https://docs.amd.com/v/u/en-US/ds890-ultrascale-overview)
- [AMD: UG570, UltraScale Architecture Configuration User Guide](https://docs.amd.com/r/en-US/ug570-ultrascale-configuration)
- [AMD: UG575, UltraScale and UltraScale+ Device Packaging and Pinouts](https://docs.amd.com/v/u/en-US/ug575-ultrascale-pkg-pinout)
- [AMD: UG908, Vivado Programming and Debugging](https://docs.amd.com/r/en-US/ug908-vivado-programming-debugging)
- [AMD: XAPP1267, Using Encryption and Authentication to Secure an UltraScale/UltraScale+ FPGA Bitstream](https://docs.amd.com/r/en-US/xapp1267-encryp-efuse-program)
- [AMD: UG973, Vivado Release Notes, Installation, and Licensing](https://docs.amd.com/r/en-US/ug973-vivado-release-notes-install-license/Device-Availability-by-Subscription-Tier)
- [AMD: Vivado licensing options](https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado/vivado-licensing-options.html)
- [AMD: Design advisory 000036039, RSA authentication vulnerability (JustSTART)](https://docs.amd.com/r/en-US/000036039)
- [IACR ePrint: Lohrke et al., Key Extraction using Thermal Laser Stimulation](https://eprint.iacr.org/2018/717)
- [GitHub: blacktop/symbolicator](https://github.com/blacktop/symbolicator)
- [GitHub: knightsc/sandbox_profiles](https://github.com/knightsc/sandbox_profiles)
- [GitHub: dzhang314, YouTubeDrive](https://github.com/dzhang314/YouTubeDrive)
- [GitHub: Infinite Storage Glitch (fork of DvorakDwarf's archived original)](https://github.com/KristianAskS/Infinite-Storage-Glitch)
- [Gigazine: Infinite Storage Glitch, storing files on YouTube](https://gigazine.net/gsc_news/en/20230222-youtube-infinite-file-storage)
- [arXiv: Stengel, Majercik, Boudaoud and McGuire, A Distributed, Decoupled System for Losslessly Streaming Dynamic Light Probes to Thin Clients (ACM MMSys '21)](https://arxiv.org/abs/2103.05875)
- [Bare Feats: 2019 Mac Pro with Afterburner, render speeds](https://barefeats.com/mac-pro-2019-with-afterburner-render-speeds.html)
- [9to5Mac: M1 Max ProRes benchmark](https://9to5mac.com/2021/12/16/m1-max-prores-benchmark/)
- [Wccftech: Mac Pro Afterburner card 16K footage playback](https://wccftech.com/mac-pro-afterburner-card-16k-footage-playback/)
