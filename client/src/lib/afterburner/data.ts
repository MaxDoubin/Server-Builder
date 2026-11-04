/**
 * Every measured table in Max's report on three Apple Afterburner cards.
 *
 * One machine, one set of cards, and locally generated ProRes test clips of
 * gradient and noise content rather than real footage. Nothing here is a
 * general specification: each figure is what this Mac Pro measured, typed
 * as the report printed it, with the report section it came from.
 *
 * Two things are deliberately absent.
 *
 *   Section 1.8 compares the cards with Apple's published figures for newer
 *   chips. Those are not measurements on this machine, so they live in the
 *   write-up, where each one carries its source.
 *
 *   Several of the report's notes compare a result with Apple's own claims
 *   ("matches Apple's number", "beyond any resolution Apple has claimed").
 *   The notes below keep what was measured and leave the comparison out.
 *
 * The 3.3 hardware ceiling was measured with the decoder forced to 32-bit
 * BGRA output, which 3.5 then showed slows hardware decode 2.18 times.
 * Every row that inherits that condition says so in its own `output` field,
 * so the page cannot quote the number without it.
 */

/** A figure the report gives as a span, "15.60 to 15.63". */
export interface Span {
  lo: number;
  hi: number;
}

/** "Real time" in Part 1: at least this many frames per second on every stream. */
export const REAL_TIME_FPS = 24;

export function isRealTime(fps: number): boolean {
  return fps >= REAL_TIME_FPS;
}

/** Percent lower `to` is than `from`, to one decimal place. */
export function percentDrop(from: number, to: number): number {
  return Math.round(((from - to) / from) * 1000) / 10;
}

/** "15.60 to 15.63", or one number when the span is a point. */
export function spanText(span: Span, digits = 1): string {
  const lo = span.lo.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const hi = span.hi.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return span.lo === span.hi ? lo : `${lo} to ${hi}`;
}

/* ------------------------------------------------------------ the machine */

export interface Card {
  name: string;
  registryId: string;
  slot: number;
  lanes: number;
}

export const MACHINE = {
  section: "System Under Test",
  host: "Mac Pro 7,1",
  cpu: "Intel Xeon",
  physicalCores: 16,
  logicalCores: 32,
  os: "macOS",
  fpga: "Xilinx Kintex UltraScale+ XCKU15P",
  fpgaPackage: "FFVA1156",
  pciId: "106b:0205",
  cards: [
    { name: "Card A", registryId: "0x100000b7d", slot: 5, lanes: 16 },
    { name: "Card B", registryId: "0x100000b71", slot: 7, lanes: 8 },
    { name: "Card C", registryId: "0x100000b72", slot: 6, lanes: 8 },
  ] as Card[],
  excluded: "Two AMD Radeon Pro Vega II MPX modules, excluded from all testing",
  decodePath: "VideoToolbox, hardware-required decode",
  clips: "Locally generated gradient and noise ProRes test clips, not real footage",
};

/* --------------------------------------------- Part 1, the cards' own job */

export type Resolution = "1080p" | "4K" | "8K" | "16K";

export interface StreamCeiling {
  resolution: Resolution;
  /**
   * Most streams that all held at least 24 fps, all three cards together.
   * For 16K it is only the number decoded at once: no rate or frame size was
   * logged, so it is not counted as a real-time result (see `realTime`).
   */
  streams: number;
  /** False where the log has no frame rate to judge real time by. */
  realTime: boolean;
  note: string;
}

export const STREAM_CEILINGS = {
  section: "1.1",
  rows: [
    {
      resolution: "1080p",
      streams: 96,
      realTime: true,
      note: "N=96 held 26.7 fps on its slowest stream; N=112 failed at 22.8 fps. No count in between was tested. Host CPU was 81.6% idle at the ceiling.",
    },
    {
      resolution: "4K",
      streams: 27,
      realTime: true,
      note: "N=24, 25, 26 and 27 all passed, 27 at 24.3 fps; N=28 failed at 23.4 fps.",
    },
    { resolution: "8K", streams: 6, realTime: true, note: "Six streams held real time. The slowest stream's rate was not logged." },
    {
      resolution: "16K",
      streams: 2,
      realTime: false,
      note: "Two streams decoded at the same time. Their frame rate and frame size were not logged, so this is not counted as real time.",
    },
  ] as StreamCeiling[],
};

export interface BoundaryTest {
  resolution: Resolution;
  streams: number;
  /** The slowest stream's rate, which is what decides pass or fail. */
  slowestFps: number;
  passed: boolean;
}

/** The two exact boundaries the report gives figures for. */
export const BOUNDARY_TESTS = {
  section: "1.1",
  rows: [
    { resolution: "1080p", streams: 96, slowestFps: 26.7, passed: true },
    { resolution: "1080p", streams: 112, slowestFps: 22.8, passed: false },
    { resolution: "4K", streams: 27, slowestFps: 24.3, passed: true },
    { resolution: "4K", streams: 28, slowestFps: 23.4, passed: false },
  ] as BoundaryTest[],
  /** Also passed at 4K, with no rate printed for them. */
  alsoPassed4K: [24, 25, 26],
  hostIdlePercentAt1080pCeiling: 81.6,
};

export const DECODE_32K = {
  section: "1.1",
  width: 30720,
  height: 17280,
  note: "A 32K clip was generated and decoded successfully. This was not a streaming capacity test.",
};

export interface FpsPair {
  min: number;
  avg: number;
}

export interface IsolationRow {
  workload: string;
  resolution: Resolution;
  streams: number;
  baseline: FpsPair;
  saturated: FpsPair;
  /** As printed beside the saturated figures. It is the slowest stream's drop. */
  reportedDropPercent: number;
}

export const CPU_ISOLATION = {
  section: "1.2",
  /** All 32 logical cores pinned with independent busy loops. */
  saturatedLoad: "89.5% sys, about 9% idle",
  rows: [
    {
      workload: "1080p x96",
      resolution: "1080p",
      streams: 96,
      baseline: { min: 26.7, avg: 28.1 },
      saturated: { min: 25.8, avg: 27.2 },
      reportedDropPercent: 3.4,
    },
    {
      workload: "4K x27",
      resolution: "4K",
      streams: 27,
      baseline: { min: 24.4, avg: 25.2 },
      saturated: { min: 24.2, avg: 25.0 },
      reportedDropPercent: 0.8,
    },
  ] as IsolationRow[],
  /**
   * Per-card busy percent while decoding, not tied to a named card. Uneven at
   * the 1080p ceiling, even at the 4K one where all three were saturated.
   * The page shows only the 4K figures: 1.4 reports the same 96-stream 1080p
   * configuration near 99 to 100% on every card, and until the two are
   * reconciled neither 1080p reading is published.
   */
  perCardBusy1080p: [87, 35, 20],
  perCardBusy4K: [91, 94, 96],
};

export interface MixedRow {
  resolution: Resolution;
  streams: number;
  soloCeiling: number;
  fps: { min: number; avg: number; max: number };
  /**
   * The report's "solo baseline" column, kept as printed and not shown on the
   * page: the 8K and 4K entries are rates at the full solo ceiling, not at
   * the half count in this batch, and no 48-stream solo 1080p run appears in
   * the report, so the column does not compare like with like.
   */
  soloBaseline: string;
  /** The report's solo figure for the same count, where it gives one. */
  soloFps?: number;
  verdict: "no" | "yes" | "barely";
}

/**
 * One batch, all three resolutions at once, each at half its solo ceiling.
 * Together that is about 1.48 single-resolution ceilings of work (3 of 6,
 * 13 of 27 and 48 of 96), so the batch was over capacity by design.
 */
export const MIXED_LOAD = {
  section: "1.3",
  /** Half of each ceiling, summed: the work asked for, in ceilings. */
  ceilingsOfWork: 1.48,
  rows: [
    {
      resolution: "8K",
      streams: 3,
      soloCeiling: 6,
      fps: { min: 18.8, avg: 19.5, max: 20.8 },
      soloBaseline: "about 24 to 26 fps",
      verdict: "no",
    },
    {
      resolution: "4K",
      streams: 13,
      soloCeiling: 27,
      fps: { min: 24.5, avg: 25.4, max: 27.8 },
      soloBaseline: "about 24 to 26 fps",
      verdict: "yes",
    },
    {
      resolution: "1080p",
      streams: 48,
      soloCeiling: 96,
      fps: { min: 24.3, avg: 25.4, max: 28.1 },
      soloBaseline: "about 45 fps at this count solo",
      soloFps: 45,
      verdict: "barely",
    },
  ] as MixedRow[],
};

export const ENDURANCE = {
  section: "1.4",
  resolution: "1080p" as Resolution,
  streams: 96,
  minutes: 6,
  sampleEverySeconds: 20,
  /** pmset -g therm's CPU_Speed_Limit, which stayed here for the whole run. */
  cpuSpeedLimit: 100,
  streamsAlive: 96,
  /** "Near 99 to 100%". Not shown on the page; see CPU_ISOLATION.perCardBusy1080p. */
  perCardBusy: { lo: 99, hi: 100 } as Span,
  /** The other Part 1 figures came from bursts of this length, in seconds. */
  burstSeconds: { lo: 15, hi: 40 } as Span,
};

export const SCRUBBING = {
  section: "1.5",
  resolution: "4K" as Resolution,
  streams: 1,
  passes: 20,
  sequentialFps: 329.5,
  randomFps: 328.7,
};

export const EDITORS = {
  section: "1.6",
  editors: 6,
  resolution: "4K" as Resolution,
  burst: { seconds: 9.3, fps: [101.5, 102.1, 102.1, 103.3, 103.5, 105.5] },
  sustained: { seconds: 93, fps: [103.1, 103.1, 103.2, 103.3, 103.3, 104.1] },
};

export interface FormatRow {
  format: string;
  fps: number;
  /** As printed, against native. Zero for native itself. */
  reportedDropPercent: number;
}

export const PIXEL_FORMAT = {
  section: "1.7",
  clip: "4K gradient test clip",
  rows: [
    { format: "Native (no format requested)", fps: 330.7, reportedDropPercent: 0 },
    { format: "4:2:0 planar (forced conversion)", fps: 236.2, reportedDropPercent: 29 },
    { format: "32-bit BGRA (forced conversion)", fps: 191.3, reportedDropPercent: 42 },
  ] as FormatRow[],
  /** Native over BGRA, as the report's "up to 73%" faster. */
  reportedGainPercent: 73,
};

/* ------------------------------------------ Part 2, the FPGA left alone */

export const FPGA = {
  section: "Part 2",
  /** What was never done, in the report's own terms. */
  neverDone: "No FPGA reprogramming, JTAG access, or firmware flash write was ever performed on this hardware.",
  established: [
    "The chip: Xilinx Kintex UltraScale+ XCKU15P, FFVA1156 package, PCI ID 106b:0205.",
    "The driver's register layout, SPI flash protocol and IOKit user-client API: 7 selectors, every one decode specific.",
    "AMD/Xilinx UG570: the FUSE_SEC bits decide whether unencrypted bitstreams load at all and whether the JTAG pins are disabled.",
    "A flash read, write and restore tool, tested only against a simulated hardware model, never against a real card.",
  ],
  reasons: [
    "A reprogram needs three things, and none is optional: a chip that accepts unencrypted bitstreams, which the UG570 fuse documentation suggests is unlikely; a Vivado CORE license and months of HDL written from scratch; and a JTAG recovery path for when a bitstream goes wrong.",
    "The JTAG recovery path is physical hardware work, and the investigation was kept software only.",
    "The one decisive test, flashing a known unencrypted Apple firmware to see whether the fuses enforce encryption, could only ever confirm the first of those three. The license and the months of development would remain either way.",
    "The software-only restore design could not stand in for a hardware recovery path once real development started producing bad bitstreams.",
  ],
  /** CORE tier, the minimum covering this chip family, per year. */
  vivadoCoreUsd: { nodeLocked: 1200, floating: 1800 },
  ioKitSelectors: 7,
};

/* ------------------------------------- Part 3, files through a decoder */

export const TECHNIQUE = {
  section: "3.1",
  codec: "ProRes 4444",
  blockPixels: 16,
  bytesPerBlock: 3,
  header: "A header block in every frame carries a magic byte and the frame's own index.",
};

export interface CorrectnessRow {
  test: string;
  scale: string;
  result: string;
}

export const CORRECTNESS = {
  section: "3.1",
  rows: [
    { test: "Small scale", scale: "500 KB, then 10 MB", result: "Bit-exact" },
    { test: "Parallel chunks", scale: "48 x 1 MB, 48 separate files decoded concurrently", result: "48/48 bit-exact" },
    { test: "Large scale", scale: "3 x 50 MB, 6 x 50 MB, 1 GB (3 x 333 MB)", result: "All bit-exact, zero errors" },
    {
      test: "A real file",
      scale: "A compiled Mach-O executable, 97,416 bytes",
      result: "Bit-exact. The recovered binary was made executable and ran, printing its own usage message.",
    },
  ] as CorrectnessRow[],
  parallelFiles: 48,
  parallelExact: 48,
  machOBytes: 97416,
};

export const ARCHITECTURE_B = {
  section: "3.2",
  rows: [
    {
      architecture: "In memory: pixel buffers compressed with VTCompressionSession and fed straight to VTDecompressionSession, no disk I/O and no container",
      result: "The same throughput, about 5.4 to 5.6 MB/s per concurrent session either way, and no extra samples",
    },
    {
      architecture: "Concurrency through GCD threads inside one process",
      result: "The same per-session rate, about 4.9 MB/s, and the same aggregate, about 14.6 to 16 MB/s",
    },
  ],
};

/** Part 4's two findings that shaped the technique. */
export const PIPELINE_FINDINGS = {
  section: "Part 4",
  /** The decoder's own output for this content was v216, 16-bit packed YCbCr. */
  nativeOutput: "v216",
  /** Recovered bytes that were wrong when v216 was read as if it were BGRA. */
  wrongWhenMisreadPercent: 99.6,
  /** One test wrote this many frames and read back this many samples. */
  phantom: { framesWritten: 1, samplesRead: 5 },
};

export const CONCURRENCY_SWEEP = {
  section: "3.3",
  /** Per-session decode time for one fixed small workload. Only the ends of 1 to 9 are printed. */
  smooth: { fromN: 1, toN: 9, fromSeconds: 0.19, toSeconds: 0.68 },
  cliff: { n: 10, seconds: 1.87 },
  plateau: { fromN: 11, toN: 13, seconds: { lo: 3.1, hi: 3.6 } as Span },
  /** N=9, four times back to back: worse each time, without crossing the N=10 cliff. */
  repeatedN9: [0.76, 0.74, 1.06, 2.69],
  /** Raising the harness's own in-flight limit made no measurable difference. */
  inFlightLimit: { from: 8, to: 32 },
  output: "32-bit BGRA",
};

export interface CeilingRow {
  configuration: string;
  mbps: Span;
  note: string;
}

export const CEILING_CONFIGS = {
  section: "3.3",
  output: "32-bit BGRA",
  /** Where the configurations converge, in MB/s, all three cards together. */
  converges: { lo: 15.6, hi: 16.4 } as Span,
  rows: [
    { configuration: "1080p, N=3, one session per card", mbps: { lo: 15.6, hi: 15.63 }, note: "100% bit-exact, stable across repeats" },
    { configuration: "1080p, N=6", mbps: { lo: 15.75, hi: 15.75 }, note: "The same ceiling, not higher" },
    { configuration: "4K, N=3", mbps: { lo: 16.0, hi: 16.03 }, note: "The same ceiling again, independent of resolution" },
    { configuration: "1080p and 4K, N=3, 1 GB sustained over 60+ seconds", mbps: { lo: 16.35, hi: 16.35 }, note: "Zero degradation, 3/3 bit-exact" },
  ] as CeilingRow[],
};

export interface BusyRow {
  registryId: string;
  slot: number;
  lanes: number;
  busy: Span;
}

export const PER_CARD_BUSY = {
  section: "3.4",
  rows: [
    { registryId: "0x100000b7d", slot: 5, lanes: 16, busy: { lo: 73, hi: 76 } },
    { registryId: "0x100000b71", slot: 7, lanes: 8, busy: { lo: 59, hi: 60 } },
    { registryId: "0x100000b72", slot: 6, lanes: 8, busy: { lo: 59, hi: 60 } },
  ] as BusyRow[],
  /** x16 over x8, as the report states it. A pure bandwidth limit would predict about 2. */
  reportedRatio: 1.24,
};

export interface DecodeCompareRow {
  metric: string;
  hardware: string;
  software: string;
}

export const SOFTWARE_VS_HARDWARE = {
  section: "3.5",
  output: "32-bit BGRA on both paths",
  rows: [
    { metric: "One session, 10 MB payload", hardware: "7.7 to 8.2 MB/s", software: "37.9 MB/s" },
    {
      metric: "All sessions, best concurrency",
      hardware: "About 16 MB/s, the ceiling, at N=3 to 6",
      software: "136 to 139 MB/s at N=24 to 32, matching the 32 logical cores",
    },
    { metric: "Correctness, 32 distinct payloads at once", hardware: "Not reported", software: "32/32 bit-exact" },
    {
      metric: "While 48 video decode streams also run",
      hardware: "1.0 MB/s, 13% of its solo rate",
      software: "23.3 MB/s, 61% of its solo rate",
    },
    {
      metric: "Effect on those 48 video streams",
      hardware: "Unaffected: 55.4 fps average, then 54.9 to 70.0",
      software: "Unaffected",
    },
  ] as DecodeCompareRow[],
  hardwareSolo: { lo: 7.7, hi: 8.2 } as Span,
  softwareSolo: 37.9,
  hardwareAggregate: 16,
  softwareAggregate: { lo: 136, hi: 139 } as Span,
  hardwareUnderLoad: 1.0,
  softwareUnderLoad: 23.3,
  hardwareUnderLoadPercent: 13,
  softwareUnderLoadPercent: 61,
  /** What the BGRA-forced aggregate comparison implied before the correction. */
  uncorrectedMargin: 9,
};

export interface NativeRow {
  path: "Hardware" | "Software";
  nativeFps: number;
  bgraFps: number;
}

/** The correction: one session each, frames per second, with and without forced BGRA. */
export const NATIVE_VS_BGRA = {
  section: "3.5",
  rows: [
    { path: "Hardware", nativeFps: 779.3, bgraFps: 357.2 },
    { path: "Software", nativeFps: 1717.5, bgraFps: 1641.7 },
  ] as NativeRow[],
  hardwarePenalty: 2.18,
  softwarePenaltyPercent: 5,
  correctedMargin: 2.2,
};

export interface CodecRow {
  profile: string;
  mbps: number;
}

export const CODEC_PROFILES = {
  section: "3.6",
  payload: "10 MB payload",
  decode: "software",
  rows: [
    { profile: "ProRes 4444", mbps: 37.9 },
    { profile: "ProRes 422 Proxy", mbps: 31.6 },
    { profile: "ProRes 422 HQ", mbps: 28.6 },
    { profile: "HEVC", mbps: 8.5 },
    { profile: "H.264", mbps: 2.0 },
  ] as CodecRow[],
};

export interface CorruptionRow {
  level: string;
  percents: number[];
  decoded: boolean;
  result: string;
  /** VideoToolbox's status code when the frame was rejected. */
  status?: number;
}

export const CORRUPTION = {
  section: "3.7",
  rows: [
    { level: "0% (control)", percents: [0], decoded: true, result: "Decoded, instantly" },
    { level: "0.1%", percents: [0.1], decoded: true, result: "Decoded after about 2 seconds; bytes not checked" },
    { level: "1%, 5%, 20%", percents: [1, 5, 20], decoded: false, result: "Error, decoder not available now", status: -12913 },
    { level: "50%", percents: [50], decoded: false, result: "Error, decoder malfunction", status: -12911 },
    { level: "100%", percents: [100], decoded: false, result: "Error, bad data", status: -12909 },
  ] as CorruptionRow[],
};

export interface BaselineRow {
  method: string;
  mbps: Span;
  project: boolean;
  /** Measured with the decoder forced to 32-bit BGRA output. */
  bgra: boolean;
}

/** The same 10 MB random payload, single threaded, through Apple's Compression framework. */
export const BASELINE = {
  section: "3.9",
  rows: [
    { method: "LZ4", mbps: { lo: 1034, hi: 1034 }, project: false, bgra: false },
    { method: "LZMA", mbps: { lo: 806, hi: 806 }, project: false, bgra: false },
    { method: "LZFSE", mbps: { lo: 456, hi: 456 }, project: false, bgra: false },
    { method: "This project, software decode on 24 to 32 cores", mbps: { lo: 136, hi: 139 }, project: true, bgra: true },
    { method: "zlib", mbps: { lo: 126, hi: 126 }, project: false, bgra: false },
    { method: "This project, hardware decode", mbps: { lo: 16, hi: 16 }, project: true, bgra: true },
  ] as BaselineRow[],
  /** LZ4 over the project's best, as the report rounds it. */
  reportedLz4Margin: 7,
  /** Encoding is software only; at 24-way concurrency on a 42 MB payload, per process. */
  endToEnd: { payloadMB: 42, concurrency: 24, encodeSeconds: { lo: 50, hi: 55 } as Span, decodeSeconds: { lo: 7, hi: 11 } as Span },
};
