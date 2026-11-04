
## The problem

You are dropping 4K or 8K ProRes onto a timeline and playback stutters, the CPU pegs, and everything else on the machine slows down. Somebody tells you to buy an Afterburner card. Before you spend that money it is worth understanding exactly what the card accelerates, what it does nothing for, and how to tell whether it is the thing actually limiting you.

I have since tested three Afterburner cards in one Mac Pro, written up in [a separate post](/blog/three-apple-afterburner-cards) with the measurements on [an interactive companion page](/afterburner); this article sticks to what one card does and how to check it.

## What Afterburner does

The Apple Afterburner card is a PCIe accelerator designed to decode ProRes and ProRes RAW video in hardware. Apple rates it at up to [6.3 billion pixels per second](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/), and its [published specification](https://support.apple.com/en-us/118461) is up to 6 streams of 8K ProRes RAW or 23 streams of 4K ProRes RAW. Those figures are for one card in a 28-core Mac Pro, playing back in Final Cut Pro at 29.97 fps, and [Apple credits](https://support.apple.com/en-us/101662) Final Cut Pro optimizations that use the Mac Pro's CPU cores alongside the card. Apple's June 2019 launch figures of 3 and 12 streams came from prerelease software and still turn up in older articles, including an earlier version of this one. Without Afterburner, these decode operations happen on the CPU, which limits how many streams you can play back in real time.

Note the word decode. Afterburner is a decoder, full stop. It does not accelerate encoding, it does not accelerate effects, and it does not accelerate color grading. It makes turning compressed ProRes frames into pixels in memory cheap. Everything downstream of that is still the CPU and GPU's problem, including demosaicing ProRes RAW, which [Apple says](https://support.apple.com/en-us/101662) is handled by the GPU.

## Why ProRes is expensive to decode

ProRes is an intra-frame codec. Every frame is compressed on its own, with no reference to the frames around it, using a discrete cosine transform on blocks within each frame much like JPEG does. Delivery codecs such as H.264 and HEVC instead encode most frames as differences from neighbors, which is why an H.264 file is small and why seeking in one is awkward.

Intra-frame coding is the right choice for production. You can cut on any frame, you can scrub backwards as cheaply as forwards, and dropping a frame does not poison the ones after it. The cost is bitrate. [Apple's published target data rates](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf) at 1920x1080 and 29.97 fps give you roughly 45 Mb/s for 422 Proxy, 102 Mb/s for 422 LT, 147 Mb/s for 422, 220 Mb/s for 422 HQ, 330 Mb/s for 4444, and 500 Mb/s for 4444 XQ. Those scale roughly with pixel count, so 4K is about four times those figures and 8K about sixteen.

The 422 profiles are 4:2:2 chroma at 10 bits per component. The 4444 profiles carry full 4:4:4 chroma, up to 12 bits, plus an optional alpha channel of up to 16 bits that is coded losslessly. ProRes itself is documented in [SMPTE RDD 36](https://pub.smpte.org/pub/rdd36/rdd36-2022.pdf), so the bitstream format is public, and FFmpeg has its own decoder that does not depend on Apple's. ProRes RAW is a different thing. It stores sensor data before demosaicing, one sample per photosite, which keeps the files smaller than you might expect: [Apple puts](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf) ProRes RAW data rates generally between those of ProRes 422 and 422 HQ, and ProRes RAW HQ between 422 HQ and 4444, though RAW rates vary with image content more than ProRes rates do. The extra cost comes at playback, where every decoded frame still has to be demosaiced.

Multiply that out. In video post-production, editors need to scrub through high-resolution footage in real time. ProRes is Apple's professional codec, used widely in film and broadcast. Raw footage from professional cameras is enormous. Going by Apple's rates for ProRes 422 and 422 HQ at 8192x4320 and 30 fps, a single stream of 8K ProRes RAW comes to roughly 19 to 28 GB per minute.

Without hardware acceleration, playing back multiple 4K or 8K streams simultaneously would require an extremely powerful CPU. Afterburner offloads this work to a dedicated FPGA (field-programmable gate array), freeing the CPU for other tasks like effects rendering and compositing.

## The hardware

Afterburner is built on a Xilinx FPGA with, in Apple's words, over a million system logic cells, which Apple programmed with their ProRes decode logic to make a purpose-built accelerator. It is a [PCI Express x16 card](https://support.apple.com/en-us/118461) for one of the Mac Pro's full-length slots. [Apple recommends](https://support.apple.com/en-us/101662) slot 5, then 3, then 4, all x16, and its [2020 white paper](https://web.archive.org/web/20210511175358/https://www.apple.com/mac-pro/pdf/Mac_Pro_White_Paper_Feb_2020.pdf) says the highest stream counts need an x16 slot because of the bandwidth decoded frames take. Apple publishes no power figure for the card. In my three-card machine the two Vega II MPX modules fill both MPX bays and leave slot 5 as the only free x16 slot, so the other two cards sit in the x8 slots 6 and 7, a setup the [three-card write-up](/blog/three-apple-afterburner-cards) describes and [the companion page](/afterburner) charts.

The reason an FPGA wins here is that a CPU spends much of its silicon on things a decoder does not need: branch prediction, out-of-order scheduling, cache coherency across cores. An FPGA is a sea of configurable logic blocks you wire into whatever datapath you want. Apple has not published its design, but a decoder built that way can run the inverse DCT as a fixed pipeline, many blocks in parallel, with no instruction fetch and no speculation. Apple's own numbers show the size of the gap: on a 28-core Mac Pro in Final Cut Pro, the CPU alone played 2 streams of 8K ProRes RAW, and the CPU plus one card played 6.

This approach is interesting from an engineering perspective. FPGAs can be reprogrammed (Apple says this one takes on the order of 50 milliseconds to reprogram and only runs Apple-authorized code), which means Apple could in theory update the card to support new codecs or improved decode algorithms through a firmware update. Whether they actually will is another question, and so far the answer has been no: Apple's documentation still lists only ProRes and ProRes RAW.

## Checking that it is there and working

The card shows up on the PCIe bus like any other device:

```bash
system_profiler SPPCIDataType | grep -i -A 14 afterburner
```

Correct output names the card, reports `Driver Installed: Yes`, and shows a `Link Width` of `x16` when the card is in slot 5, 3 or 4. In slot 6 or 7 expect `x8`, because [those slots](https://support.apple.com/en-us/101640) have eight lanes. If the driver line says no, macOS can see the card but has not loaded its driver, and nothing will use the card until it does. If the card does not appear at all, the problem is physical: reseat it, and make sure it is in one of the Mac Pro's own slots, since Apple does not support Afterburner in a Thunderbolt expansion chassis.

For the software side of the comparison, you can measure what CPU-only ProRes decode costs with `ffmpeg`, which has its own decoder and does not use Apple's frameworks unless you ask it to with `-hwaccel videotoolbox`. Make a test clip first:

```bash
ffmpeg -f lavfi -i testsrc2=size=3840x2160:rate=30 -t 20 \
  -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le test-hq.mov

ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,profile,width,height,pix_fmt \
  -of default=noprint_wrappers=1 test-hq.mov
```

`ffprobe` should report exactly this:

```
codec_name=prores
profile=HQ
width=3840
height=2160
pix_fmt=yuv422p10le
```

Profile 3 in `prores_ks` is 422 HQ. The profile numbers run 0 for Proxy, 1 for LT, 2 for standard 422, 3 for HQ, 4 for 4444, and 5 for 4444 XQ. Now time a pure decode with no output:

```bash
ffmpeg -hide_banner -benchmark -i test-hq.mov -f null - 2>&1 | tr '\r' '\n' | tail -3
```

The last three lines are the final progress line, with the frame rate achieved, and two `bench:` lines, the first of which gives `utime=`, the CPU seconds consumed. That utime figure is roughly the work Afterburner takes off the CPU when the same media is played through an application that uses Apple's frameworks; Apple's own software decoder is different code, so treat it as an estimate. Run the same clip in QuickTime Player with Activity Monitor open on an Afterburner machine and the CPU column stays low, because QuickTime goes through AVFoundation and VideoToolbox, and VideoToolbox routes ProRes to the card.

That last point is the one that determines whether any given application benefits. Afterburner is not something an app opts into with a checkbox. An app gets it by decoding through AVFoundation or VideoToolbox. An app that ships its own ProRes decoder gets nothing.

## In practice

In my setup, Afterburner makes a noticeable difference when working with ProRes footage in Final Cut Pro. Timeline scrubbing stays smooth, even with multiple 4K streams and effects applied. How much of that is the card depends on the codec. In the white paper's tests on a 28-core Mac Pro, adding one card took 4K ProRes RAW playback from 7 streams to 23, but 4K ProRes 422 only from 15 streams to 16, since the CPU alone already managed 15.

So the card earns its place on a Mac Pro that plays ProRes RAW, or more streams of ProRes than the CPU can decode on its own. For a few streams of ProRes 422 on a many-core Xeon, it adds little to the stream count, though it still takes the decode work off the CPU.

The catch is that it moves the bottleneck rather than removing it. Apple's 23 simultaneous 4K ProRes RAW streams work out to roughly 1.8 to 2.7 GB per second of sustained sequential read, using the same ProRes 422 to 422 HQ bracket at 4096x2160. If that media lives on a single SATA SSD, or on a network share, the card will sit mostly idle waiting for bytes. Afterburner only pays off if the storage tier underneath it can actually feed it.

## What breaks

**Expecting faster exports.** Afterburner does not encode. A render or an export that was CPU-bound on encoding finishes in the same time it always did. The faster transcoding Apple lists as a benefit comes from the decode half: reading ProRes sources gets cheaper, encoding does not. People buy the card, watch their export bar move at the same speed, and assume it is broken. It is working exactly as designed.

**Expecting it to help other codecs.** ProRes and ProRes RAW only, and not interlaced ProRes, which Apple says the card does not accelerate. H.264, HEVC, RED R3D, Blackmagic RAW, and camera-native formats from other vendors get nothing from it. If your project is mostly HEVC from a mirrorless camera, transcode to ProRes first or the card is dead weight.

**Feeding it from slow storage.** Covered above and worth repeating, because it is the most common reason a correctly installed card appears to do nothing. Check your sustained read throughput before blaming the accelerator.

**Assuming any NLE will use it.** The application has to decode through AVFoundation or VideoToolbox. Apple names Final Cut Pro, Motion, Compressor and QuickTime Player. Applications with their own decoder implementations may not, and support has varied by version, so test with your actual software rather than assuming. None of this applies under Windows: Apple says Afterburner acceleration is not available in Boot Camp.

**Planning an Afterburner around an Apple silicon Mac Pro.** It is [not supported in the Mac Pro (2023)](https://support.apple.com/en-us/101988), and it does not need to be: Apple says that machine's M2 Ultra media engine has superior performance to Afterburner. Apple silicon from the [M1 Pro and M1 Max](https://www.apple.com/newsroom/2021/10/introducing-m1-pro-and-m1-max-the-most-powerful-chips-apple-has-ever-built/) onward includes dedicated ProRes acceleration in the SoC's media engine, which Apple's specifications list as a [ProRes encode and decode engine](https://support.apple.com/en-us/111902), so it covers encode as well as decode. Afterburner is a 2019 Mac Pro accessory and that is where it stays.

## The bigger picture

Afterburner is a good example of how much hardware acceleration can do for specific workloads. The same principle applies to GPU-accelerated machine learning, FPGA-based network packet processing, and ASICs designed for cryptocurrency mining. When you can move a compute-intensive task from general-purpose hardware to dedicated hardware, the performance and efficiency gains are large.

It is also a good example of the tradeoff. Fixed-function silicon is enormously faster at the one job it was built for and worth exactly nothing for anything else. Apple eventually folded the same capability into the SoC, and the discrete card became a footnote. That is usually how this story ends.

## References

- [Apple: About the Afterburner accelerator card for Mac Pro (2019)](https://support.apple.com/en-us/101662)
- [Apple: Mac Pro (2019) technical specifications](https://support.apple.com/en-us/118461)
- [Apple: Install PCIe cards in your Mac Pro (2019)](https://support.apple.com/en-us/101640)
- [Apple: Mac Pro Technology Overview, February 2020 (archived)](https://web.archive.org/web/20210511175358/https://www.apple.com/mac-pro/pdf/Mac_Pro_White_Paper_Feb_2020.pdf)
- [Larry Jordan: Thoughts on Afterburner (quotes the white paper's Afterburner section and performance table)](https://larryjordan.com/articles/thoughts-on-afterburner-a-prores-gpu-for-the-2019-mac-pro/)
- [Apple Newsroom: Mac Pro announcement, June 2019](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/)
- [Apple ProRes white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes.pdf)
- [Apple ProRes RAW white paper](https://www.apple.com/final-cut-pro/docs/Apple_ProRes_RAW.pdf)
- [SMPTE RDD 36: Apple ProRes bitstream syntax and decoding process](https://pub.smpte.org/pub/rdd36/rdd36-2022.pdf)
- [Apple: PCIe cards you can install in your Mac Pro (2023)](https://support.apple.com/en-us/101988)
- [Apple Newsroom: M1 Pro and M1 Max, October 2021](https://www.apple.com/newsroom/2021/10/introducing-m1-pro-and-m1-max-the-most-powerful-chips-apple-has-ever-built/)
- [Apple: MacBook Pro (14-inch, 2021) technical specifications](https://support.apple.com/en-us/111902)
- [Apple VideoToolbox documentation](https://developer.apple.com/documentation/videotoolbox)
- [FFmpeg codecs documentation](https://ffmpeg.org/ffmpeg-codecs.html)
