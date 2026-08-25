
## The problem

You are dropping 4K or 8K ProRes onto a timeline and playback stutters, the CPU pegs, and everything else on the machine slows down. Somebody tells you to buy an Afterburner card. Before you spend that money it is worth understanding exactly what the card accelerates, what it does nothing for, and how to tell whether it is the thing actually limiting you.

## What Afterburner does

The Apple Afterburner card is a PCIe accelerator designed to decode ProRes and ProRes RAW video in hardware. It handles up to 6.3 billion pixels per second, which translates to 3 streams of 8K ProRes RAW or 12 streams of 4K ProRes RAW simultaneously. Without Afterburner, these decode operations happen on the CPU, which limits how many streams you can play back in real time.

Note the word decode. Afterburner is a decoder, full stop. It does not accelerate encoding, it does not accelerate effects, and it does not accelerate colour grading. It makes getting pixels off disk and into memory cheap. Everything downstream of that is still the CPU and GPU's problem.

## Why ProRes is expensive to decode

ProRes is an intra-frame codec. Every frame is compressed on its own, with no reference to the frames around it, using a discrete cosine transform on blocks within each frame much like JPEG does. Delivery codecs such as H.264 and HEVC instead encode most frames as differences from neighbours, which is why an H.264 file is small and why seeking in one is awkward.

Intra-frame coding is the right choice for production. You can cut on any frame, you can scrub backwards as cheaply as forwards, and dropping a frame does not poison the ones after it. The cost is bitrate. Apple's published target data rates at 1920x1080 and 29.97 fps give you roughly 45 Mb/s for 422 Proxy, 102 Mb/s for 422 LT, 147 Mb/s for 422, 220 Mb/s for 422 HQ, 330 Mb/s for 4444, and 500 Mb/s for 4444 XQ. Those scale roughly with pixel count, so 4K is about four times those figures and 8K about sixteen.

The 422 profiles are 4:2:2 chroma at 10 bits per component. The 4444 profiles carry full 4:4:4 chroma, up to 12 bits, plus an alpha channel. ProRes itself has been published as SMPTE RDD 36, which is why open source decoders exist and behave correctly. ProRes RAW is a different thing: it stores sensor data before debayering, so the decoder has more work to do and the files are larger still.

Multiply that out. In video post-production, editors need to scrub through high-resolution footage in real time. ProRes is Apple's professional codec, used widely in film and broadcast. Raw footage from professional cameras is enormous. A single stream of 8K ProRes RAW produces about 4 GB per minute.

Without hardware acceleration, playing back multiple 4K or 8K streams simultaneously would require an extremely powerful CPU. Afterburner offloads this work to a dedicated FPGA (field-programmable gate array), freeing the CPU for other tasks like effects rendering and compositing.

## The hardware

Afterburner is built on a Xilinx FPGA. Apple programmed the FPGA with their ProRes decode logic, creating a purpose-built accelerator that is more power-efficient than doing the same work on a general-purpose CPU or GPU. The card draws about 25 watts and occupies a half-length PCIe slot.

The reason an FPGA wins here is that a CPU spends most of its transistor budget on things a decoder does not need: branch prediction, out-of-order scheduling, cache coherency across cores. An FPGA is a sea of configurable logic blocks you wire into whatever datapath you want. Apple wired theirs into an inverse DCT pipeline that processes blocks in a fixed-latency stream, dozens of them in parallel, with no instruction fetch and no speculation. That is why 25 W of FPGA beats 200 W of Xeon at this one job by such a wide margin.

This approach is interesting from an engineering perspective. FPGAs can be reprogrammed, which means Apple could theoretically update the card to support new codecs or improved decode algorithms through a firmware update. Whether they actually will is another question, and the answer so far has been no.

## Checking that it is there and working

The card shows up on the PCIe bus like any other device:

```bash
system_profiler SPPCIDataType | grep -i -A 8 afterburner
```

Correct output names the card, reports `Driver Installed: Yes`, and shows a `Link Width` of `x16`. If the driver line says no, the machine is on a macOS release older than Catalina 10.15.1 and the card is inert. If the card does not appear at all, it is a seating problem, not a software one.

For the software side of the comparison, you can measure what CPU-only ProRes decode costs with `ffmpeg`, which has its own decoder and does not use Apple's frameworks. Make a test clip first:

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
ffmpeg -hide_banner -benchmark -i test-hq.mov -f null - 2>&1 | tail -2
```

The last lines report the frame rate achieved and a `bench: utime=` line giving CPU seconds consumed. That utime figure is the work Afterburner is removing when the same media is played through an application that uses Apple's frameworks. Run the same clip in QuickTime Player with Activity Monitor open on an Afterburner machine and the CPU column stays near idle, because QuickTime goes through AVFoundation and VideoToolbox, and VideoToolbox routes ProRes to the card.

That last point is the one that determines whether any given application benefits. Afterburner is not something an app opts into with a checkbox. An app gets it by decoding through AVFoundation or VideoToolbox. An app that ships its own ProRes decoder gets nothing.

## In practice

In my setup, Afterburner makes a noticeable difference when working with ProRes footage in Final Cut Pro. Timeline scrubbing is instant, even with multiple 4K streams and effects applied. Without Afterburner, the same timeline would stutter and drop frames.

For anyone doing serious video work on a Mac Pro, the Afterburner card is one of the most cost-effective upgrades available. It turns the Mac Pro from a powerful workstation into a dedicated video processing machine.

The catch is that it moves the bottleneck rather than removing it. Twelve simultaneous 4K ProRes RAW streams is several gigabytes per second of sustained sequential read. If that media lives on a single SATA SSD, or on a network share, the card will sit mostly idle waiting for bytes. Afterburner only pays off if the storage tier underneath it can actually feed it.

## What breaks

**Expecting faster exports.** Afterburner does not encode. A render or an export that was CPU-bound on encoding finishes in the same time it always did. People buy the card, watch their export bar move at the same speed, and assume it is broken. It is working exactly as designed.

**Expecting it to help other codecs.** ProRes and ProRes RAW only. H.264, HEVC, RED R3D, Blackmagic RAW, and camera-native formats from other vendors get nothing from it. If your project is mostly HEVC from a mirrorless camera, transcode to ProRes first or the card is dead weight.

**Feeding it from slow storage.** Covered above and worth repeating, because it is the most common reason a correctly installed card appears to do nothing. Check your sustained read throughput before blaming the accelerator.

**Assuming any NLE will use it.** The application has to decode through AVFoundation or VideoToolbox. Final Cut Pro and QuickTime do. Applications with their own decoder implementations may not, and support has varied by version, so test with your actual software rather than assuming.

**Planning an Afterburner around an Apple Silicon Mac Pro.** It is not supported there, and it does not need to be. Apple silicon from the M1 Pro and M1 Max onward includes dedicated ProRes encode and decode engines in the SoC, which cover both directions rather than just decode. Afterburner is a 2019 Mac Pro accessory and that is where it stays.

## The bigger picture

Afterburner is a good example of how hardware acceleration can transform specific workloads. The same principle applies to GPU-accelerated machine learning, FPGA-based network packet processing, and ASICs designed for cryptocurrency mining. When you can move a compute-intensive task from general-purpose hardware to dedicated hardware, the performance and efficiency gains are dramatic.

It is also a good example of the tradeoff. Fixed-function silicon is enormously faster at the one job it was built for and worth exactly nothing for anything else. Apple eventually folded the same capability into the SoC, and the discrete card became a footnote. That is usually how this story ends.

## References

- https://en.wikipedia.org/wiki/Apple_ProRes
- https://en.wikipedia.org/wiki/Field-programmable_gate_array
- https://en.wikipedia.org/wiki/Discrete_cosine_transform
- https://en.wikipedia.org/wiki/Chroma_subsampling
- https://ffmpeg.org/ffmpeg-codecs.html
- https://developer.apple.com/documentation/videotoolbox
