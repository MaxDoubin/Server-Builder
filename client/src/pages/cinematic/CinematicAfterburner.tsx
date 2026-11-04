/**
 * The companion to Max's write-up on three Apple Afterburner cards.
 *
 * Every figure on the page comes from lib/afterburner/data, which holds the
 * report's tables with their section numbers, so the page and the static
 * document a crawler gets cannot disagree about a number. The caveats live
 * beside the figures they qualify rather than in a footnote: the data
 * recovery ceiling is never quoted without the BGRA output it was measured
 * with, and the technique is never described without the LZ4 result that
 * puts it in proportion.
 *
 * The demo is a browser simulation of the block code in Section 3.1. It runs
 * on the pure functions in lib/afterburner/blockCodec, which the CI gate
 * round trips, and draws into one small canvas that CSS scales up. Nothing
 * runs on a timer and nothing is stored.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import {
  BASELINE,
  BOUNDARY_TESTS,
  BUSY_SETTLE,
  CEILING_CONFIGS,
  CLIPS,
  CODEC_PROFILES,
  CONCURRENCY_SWEEP,
  CORRECTNESS,
  CORRUPTION,
  CPU_ISOLATION,
  DECODE_32K,
  EDITORS,
  ENDURANCE,
  FIRST_PASS_BOUNDARIES,
  FIXED_TOTAL,
  FPGA,
  LINK_STATE,
  MACHINE,
  MIXED_IN_BUDGET,
  MIXED_LOAD,
  NATIVE_SWEEP,
  NATIVE_VS_BGRA,
  PER_CARD_BUSY,
  PIPELINE_FINDINGS,
  PIXEL_FORMAT,
  REAL_TIME_FPS,
  SCRUBBING,
  SOFTWARE_VS_HARDWARE,
  STILL_OPEN,
  STREAM_CEILINGS,
  TECHNIQUE,
  isRealTime,
  percentDrop,
  spanText,
} from "@/lib/afterburner/data";
import {
  BLOCK,
  FRAME_COLS,
  FRAME_HEIGHT,
  FRAME_ROWS,
  FRAME_WIDTH,
  INSET,
  MAX_BYTES,
  addNoise,
  capacity,
  compare,
  corrupt,
  decode,
  encode,
  joined,
  patchAt,
  utf8Bytes,
  utf8Text,
} from "@/lib/afterburner/blockCodec";
import { BarChart, ChartFigure, DataTable, FpsChart, SweepChart, type FpsRow } from "@/lib/afterburner/charts";

const SITE_URL = "https://maxdoubin.com";
const WRITE_UP = "/blog/three-apple-afterburner-cards";

const n = (value: number, digits = 1) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ceilingOf = (resolution: string) => STREAM_CEILINGS.rows.find((row) => row.resolution === resolution)?.streams ?? 0;

/* ------------------------------------------------------------ page parts */

const P = "mt-4 max-w-2xl font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const NOTE = "mt-3 max-w-2xl font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]";

function Section({ id, tag, title, children }: { id: string; tag: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-20 scroll-mt-28">
      <p className="font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">· {tag}</p>
      <h2
        id={`${id}-title`}
        className="mt-3 font-display text-[clamp(1.5rem,3.4vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sub({ id, tag, title, children }: { id: string; tag: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="mt-14 scroll-mt-28">
      <h3 className="font-display text-xl font-medium leading-snug text-[hsl(var(--brand-bone))]">
        {title}
        <span className="ml-3 inline-block whitespace-nowrap align-middle font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
          {tag}
        </span>
      </h3>
      {children}
    </div>
  );
}

function BgraNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl border-l-2 border-[hsl(var(--brand-amber)/0.7)] pl-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
      <span className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-amber))]">Measured with BGRA output · </span>
      {children}
    </p>
  );
}

/* ---------------------------------------------------------------- the demo */

const SAMPLES: Array<{ name: string; text: string }> = [
  {
    name: "One line",
    text: "Every frame carries a header block with a magic byte and its own index.",
  },
  {
    name: "Three frames",
    text:
      "Arbitrary bytes were written as solid 16 by 16 pixel blocks into ProRes 4444 frames, one byte in each of the red, green and blue channels, and read back through the Afterburner's hardware decode path. " +
      "Every frame began with a header block carrying a magic byte and the frame's own index, because the container did not guarantee that one frame written came back as one sample read. " +
      "Recovery was bit-exact from 500 KB to 1 GB. Plain LZ4 on one core was still about seven times faster than the best result, so this shows what a fixed-function decoder will do, not a way to store files.",
  },
  {
    name: "Multi-byte text",
    text: "ASCII takes one byte a character. é takes two, € and 東 take three, and 𝄞 takes four, so this line fills more blocks than its length suggests.",
  },
];

const CAP_1080 = capacity(1920, 1080);
const CAP_4K = capacity(3840, 2160);
const GAP = 6;

function BlockDemo() {
  const [text, setText] = useState(SAMPLES[0].text);
  const [noise, setNoise] = useState(0);
  const [patchOn, setPatchOn] = useState(false);
  const [patchBlock, setPatchBlock] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { bytes, truncated } = useMemo(() => utf8Bytes(text), [text]);
  const clean = useMemo(() => encode(bytes), [bytes]);
  const noisy = useMemo(() => addNoise(clean, noise, 1), [clean, noise]);
  const totalBlocks = clean.length * FRAME_COLS * FRAME_ROWS;
  const at = Math.min(patchBlock, totalBlocks - 1);
  const patch = useMemo(() => patchAt(at, clean.length), [at, clean.length]);
  const shown = useMemo(() => (patchOn ? corrupt(noisy, patch, 7) : noisy), [noisy, patch, patchOn]);
  const decoded = useMemo(() => decode(shown), [shown]);
  const result = useMemo(() => compare(bytes, decoded), [bytes, decoded]);
  const recovered = useMemo(() => utf8Text(joined(decoded)), [decoded]);

  const canvasHeight = shown.length * FRAME_HEIGHT + (shown.length - 1) * GAP;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shown.forEach((frame, index) => {
      ctx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, index * (FRAME_HEIGHT + GAP));
    });
  }, [shown, canvasHeight]);

  const patchFrame = Math.floor(at / (FRAME_COLS * FRAME_ROWS));
  const patchLocal = at % (FRAME_COLS * FRAME_ROWS);
  const accepted = decoded.frames.filter((frame) => frame.accepted).length;

  return (
    <div className="mt-5 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-4 sm:p-6" data-testid="afterburner-demo">
      <p className="font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
        A browser simulation of the idea, not ProRes and not the Afterburner. The noise is a random
        stand-in for compression error, and each frame is {FRAME_WIDTH} by {FRAME_HEIGHT} pixels so the
        whole picture fits on a phone.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLES.map((sample) => (
          <button
            key={sample.name}
            type="button"
            onClick={() => setText(sample.text)}
            aria-pressed={text === sample.text}
            className={`rounded-full border px-3.5 py-1.5 font-mono-tight text-[0.71875rem] transition-colors ${
              text === sample.text
                ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
            }`}
          >
            {sample.name}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="whitespace-nowrap font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Text to encode</span>
          <span className="whitespace-nowrap font-mono-tight text-[0.6875rem] tabular-nums text-[hsl(var(--brand-bone-dim))]">
            {bytes.length} of {MAX_BYTES} bytes{truncated ? ", the rest cut" : ""}
          </span>
        </span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_BYTES}
          rows={3}
          spellCheck={false}
          data-testid="afterburner-input"
          className="mt-2 block w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal)/0.7)] focus:outline-none"
        />
      </label>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-5">
        <div className="md:col-span-2">
          <canvas
            ref={canvasRef}
            width={FRAME_WIDTH}
            height={canvasHeight}
            role="img"
            aria-label={`${shown.length} ${shown.length === 1 ? "frame" : "frames"} of colored ${BLOCK} by ${BLOCK} pixel blocks holding ${bytes.length} bytes. The top left block of each frame is its header.`}
            data-testid="afterburner-canvas"
            className="block h-auto w-full max-w-[28rem] rounded-md [image-rendering:pixelated]"
          />
          <p className="mt-2 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            {shown.length} {shown.length === 1 ? "frame" : "frames"}, {FRAME_COLS} by {FRAME_ROWS} blocks each. The top
            left block of every frame is the header; black blocks are unused.
          </p>
        </div>

        <div className="md:col-span-3">
          <label className="block">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="whitespace-nowrap font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Compression noise</span>
              <span className="whitespace-nowrap font-mono-tight text-[0.75rem] tabular-nums text-[hsl(var(--brand-bone))]">
                up to {noise} {noise === 1 ? "level" : "levels"} a pixel
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={noise}
              onChange={(event) => setNoise(Number(event.target.value))}
              aria-label="Compression noise, in levels per pixel channel"
              data-testid="afterburner-noise"
              className="range-slider mt-2"
            />
          </label>

          <button
            type="button"
            onClick={() => setPatchOn((on) => !on)}
            aria-pressed={patchOn}
            data-testid="afterburner-patch"
            className={`mt-4 rounded-full border px-4 py-2 font-mono-tight text-[0.71875rem] transition-colors ${
              patchOn
                ? "border-[hsl(var(--brand-danger)/0.7)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)]"
            }`}
          >
            {patchOn ? "Remove the corrupted patch" : "Corrupt a patch of pixels"}
          </button>

          {patchOn ? (
            <label className="mt-3 block">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="whitespace-nowrap font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Patch position</span>
                <span className="whitespace-nowrap font-mono-tight text-[0.75rem] tabular-nums text-[hsl(var(--brand-bone))]">
                  frame {patchFrame + 1}, {patchLocal === 0 ? "on the header" : `block ${patchLocal}`}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={totalBlocks - 1}
                step={1}
                value={at}
                onChange={(event) => setPatchBlock(Number(event.target.value))}
                aria-label="Which block the corrupted patch lands on"
                data-testid="afterburner-patch-position"
                className="range-slider mt-2"
              />
            </label>
          ) : null}

          <dl className="mt-5 grid grid-cols-2 gap-3" aria-live="polite" data-testid="afterburner-result">
            <div className="flex flex-col justify-between rounded-lg border border-[hsl(var(--brand-iron))] p-3">
              <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Byte errors</dt>
              <dd className="mt-1 font-display text-2xl text-[hsl(var(--brand-bone))]">
                {result.errors}
                <span className="ml-1 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">of {result.total}</span>
              </dd>
            </div>
            <div className="flex flex-col justify-between rounded-lg border border-[hsl(var(--brand-iron))] p-3">
              <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Frames accepted</dt>
              <dd className="mt-1 font-display text-2xl text-[hsl(var(--brand-bone))]">
                {accepted}
                <span className="ml-1 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-ash))]">of {decoded.frames.length}</span>
              </dd>
            </div>
          </dl>
          <p className="mt-2 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-ash))]">
            {result.errors === 0
              ? "Every byte came back exactly."
              : [
                  result.wrong ? `${result.wrong} read back as a different value` : "",
                  result.lost ? `${result.lost} lost with a rejected frame` : "",
                  result.extra ? `${result.extra} extra` : "",
                ]
                  .filter(Boolean)
                  .join(", ") + "."}
          </p>
          <ul className="mt-2 space-y-1 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {decoded.frames.map((frame) => (
              <li key={frame.position}>
                Frame {frame.position + 1}:{" "}
                {frame.accepted
                  ? `magic byte found, index ${frame.index}, ${frame.length} bytes`
                  : `rejected, ${frame.reason}`}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5">
        <p className="font-techno text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">Recovered text</p>
        <p
          className="mt-2 min-h-[3rem] whitespace-pre-wrap break-words rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone))]"
          data-testid="afterburner-recovered"
        >
          {recovered || " "}
        </p>
      </div>

      <p className="mt-4 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        The decoder averages the {BLOCK - 2 * INSET} by {BLOCK - 2 * INSET} interior of each block, rounds to the
        nearest whole number, and checks the header&apos;s magic byte before it trusts the frame. Each channel
        carries a whole byte, so there is no spare margin: after averaging, the error has to stay under half a
        level or the byte rounds to its neighbor. A damaged header loses its whole frame, which is what the magic
        byte is for: a frame is rejected rather than misread.
      </p>
      <p className="mt-3 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="afterburner-capacity">
        At {BLOCK} by {BLOCK} pixels and three bytes a block, with one block per frame spent on the header, a
        1920 by 1080 frame holds {CAP_1080.blocks.toLocaleString("en-US")} blocks and{" "}
        {CAP_1080.bytes.toLocaleString("en-US")} bytes, and a 3840 by 2160 frame holds{" "}
        {CAP_4K.blocks.toLocaleString("en-US")} blocks and {CAP_4K.bytes.toLocaleString("en-US")} bytes. This
        demo&apos;s own frames hold {capacity(FRAME_WIDTH, FRAME_HEIGHT).bytes} bytes each.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- the page */

const ANCHORS: Array<[string, string]> = [
  ["verification", "What changed"],
  ["capacity", "Capacity"],
  ["cpu", "CPU load"],
  ["mixed", "Mixed timelines"],
  ["endurance", "Long runs"],
  ["format", "Pixel format"],
  ["fpga", "The FPGA"],
  ["files", "Files through a decoder"],
  ["demo", "Try it"],
];

export function CinematicAfterburner() {
  useSEO({
    title: "Three Apple Afterburner Cards, Measured | Max Doubin",
    description:
      "Interactive results from three Apple Afterburner cards in one Mac Pro 7,1: 106 real-time 1080p streams, 27 at 4K and 6 at 8K across all three cards, CPU isolation, mixed timelines, a verification pass that corrected the first report, and a browser demo of recovering files through a video decoder.",
    canonical: `${SITE_URL}/afterburner`,
    ogImage: `${SITE_URL}/images/og/afterburner.jpg`,
    schema: {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Three Apple Afterburner cards, measured",
      description:
        "Decode capacity, CPU isolation, mixed-resolution, endurance and data recovery measurements from three Apple Afterburner cards in one Mac Pro 7,1, using locally generated ProRes test clips, only one of which has realistic gradient and noise content.",
      url: `${SITE_URL}/afterburner`,
      creator: { "@type": "Person", "@id": `${SITE_URL}/#person`, name: "Max Doubin" },
      isBasedOn: `${SITE_URL}${WRITE_UP}`,
      isAccessibleForFree: true,
    },
    schemaId: "afterburner-schema",
  });

  const ceilings = STREAM_CEILINGS.rows;
  const isolationRows: FpsRow[] = CPU_ISOLATION.rows.flatMap((row) => [
    {
      key: `${row.workload}-min`,
      label: `${row.resolution} ×${row.streams}, slowest stream`,
      summary: `${n(row.baseline.min)} to ${n(row.saturated.min)}`,
      marks: [
        { value: row.saturated.min, shape: "dot" as const, tone: "accent" as const, name: "All cores busy" },
        { value: row.baseline.min, shape: "ring" as const, tone: "muted" as const, name: "CPU idle" },
      ],
    },
    {
      key: `${row.workload}-avg`,
      label: `${row.resolution} ×${row.streams}, average`,
      summary: `${n(row.baseline.avg)} to ${n(row.saturated.avg)}`,
      marks: [
        { value: row.saturated.avg, shape: "dot" as const, tone: "accent" as const, name: "All cores busy" },
        { value: row.baseline.avg, shape: "ring" as const, tone: "muted" as const, name: "CPU idle" },
      ],
    },
  ]);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          {/* ── 1. hero ── */}
          <header>
            <div className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Original research · {MACHINE.host}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Three Apple Afterburner cards
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Three Afterburner cards in one Mac Pro: how much ProRes they decode, why the FPGA on them was left
              alone, and what comes back when ordinary files go through the decoder.
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-iron))] sm:grid-cols-4" data-testid="afterburner-headline">
              {ceilings.map((row) => (
                <div key={row.resolution} className="bg-[hsl(var(--brand-graphite))] p-5">
                  <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    Streams of {row.resolution}
                  </dt>
                  <dd className="mt-2 font-display text-[clamp(2.5rem,7vw,3.5rem)] font-medium leading-none text-[hsl(var(--brand-bone))]">
                    {row.streams}
                  </dd>
                  <dd className="mt-2 font-mono-tight text-[0.6875rem] leading-snug text-[hsl(var(--brand-ash))]">
                    {row.realTime ? "real time" : "rate not logged"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 max-w-2xl font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              All three cards together; each count is the most streams that all held {REAL_TIME_FPS} fps or better. Only
              the 4K clip is realistic, hard-to-compress content. The 1080p, 8K and 16K clips are flat test patterns, so
              those counts are likely more favorable than real footage would give.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href={WRITE_UP}
                data-testid="afterburner-writeup"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] px-5 py-2.5 font-mono-tight text-[0.75rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.2)]"
              >
                Read the full write-up <span aria-hidden="true">→</span>
              </Link>
            </div>

            <p className="mt-8 max-w-2xl font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-ash))]">
              <span className="text-[hsl(var(--brand-bone-dim))]">The machine.</span> {MACHINE.host}, {MACHINE.cpu} with{" "}
              {MACHINE.physicalCores} physical and {MACHINE.logicalCores} logical cores, {MACHINE.memory} of memory,{" "}
              {MACHINE.os}, {MACHINE.kext}. Three
              Afterburner cards ({MACHINE.fpga}) in PCIe{" "}
              {MACHINE.cards.map((card) => `slot ${card.slot} (x${card.lanes})`).join(", ")}. The two Radeon Pro Vega
              II modules were left out of every test.
            </p>

            <p
              className="mt-6 max-w-2xl rounded-xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-graphite)/0.5)] p-4 font-mono-tight text-[0.78125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="afterburner-caveat"
            >
              Every number on this page is a measurement on this one machine, not a specification. The video
              tests used locally generated ProRes test clips, not real footage, and only the 4K clip has gradient and
              noise content. Stream counts
              are for all three cards together, through VideoToolbox&apos;s hardware-required decode path, and real
              time means at least {REAL_TIME_FPS} fps on every stream.
            </p>

            <nav aria-label="On this page" className="mt-8">
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {ANCHORS.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="tap-target inline-block font-mono-tight text-[0.75rem] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          {/* ── verification addendum ── */}
          <Section id="verification" tag="Verification addendum" title="What the verification pass changed">
            <p className={P}>
              A seven-item test list was run against the first report. Two of its findings change conclusions, not
              just confidence, and several figures on this page were re-measured. Where this page and the first report
              differ, this page is current.
            </p>
            <ol className="mt-5 max-w-2xl list-decimal space-y-3 pl-5 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))] marker:text-[hsl(var(--brand-signal))]">
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">
                  The 16 MB/s data recovery ceiling and the cliff past nine sessions came from forcing BGRA output, not
                  from the cards.
                </span>{" "}
                With native output the same sessions show no cliff, and stay flat from 9 to 96 sessions (
                {spanText(NATIVE_SWEEP.extended.combinedMBps)} MB/s combined, {NATIVE_SWEEP.extended.exact} of{" "}
                {NATIVE_SWEEP.extended.of} bit-exact).
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">The stream counts are not an apples-to-apples comparison across resolutions.</span>{" "}
                Only the 4K clip has gradient and noise content. The 1080p, 8K and 16K clips are flat, so those counts
                are likely more favorable than real footage would give.
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">The 1080p ceiling is 106, not about 96.</span> The first
                pass tested only widely spaced levels; a fine sweep found the edge.
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">The fixed-total idea holds at 1080p and 4K only.</span>{" "}
                8K and 16K totals were still rising with the stream count.
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">The 27-stream 4K ceiling was sometimes reached with only one or two of the three cards working.</span>{" "}
                The true all-three-cards capacity may be higher.
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">Mixing penalty is an 8K effect.</span> Redone at exactly
                one third of each solo ceiling, 4K and 1080p had headroom and 8K did not.
              </li>
              <li className="pl-1">
                <span className="text-[hsl(var(--brand-bone))]">Cards B and C were in slots 6 and 7, not 7 and 6.</span>{" "}
                The machine record corrects the first report&apos;s table; both are x8 slots.
              </li>
            </ol>
            <Sub id="open" tag="Still open" title="What is still open">
              <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))] marker:text-[hsl(var(--brand-signal))]">
                {STILL_OPEN.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Sub>
          </Section>

          {/* ── 2. capacity ── */}
          <Section id="capacity" tag={`Section ${STREAM_CEILINGS.section}`} title="How many streams play in real time">
            <p className={P}>
              The ceiling is the most streams that all held {REAL_TIME_FPS} fps at once, found with a fine sweep. At
              1080p, {BOUNDARY_TESTS.rows[0].streams} streams held {n(BOUNDARY_TESTS.rows[0].slowestFps)} fps on the
              slowest one and {BOUNDARY_TESTS.rows[1].streams} fell to {n(BOUNDARY_TESTS.rows[1].slowestFps)}, with{" "}
              {BOUNDARY_TESTS.rows[1].passingStreams} of the {BOUNDARY_TESTS.rows[1].streams} still at {REAL_TIME_FPS} fps
              or better. At 4K, {BOUNDARY_TESTS.rows[2].streams} passed at {n(BOUNDARY_TESTS.rows[2].slowestFps)} fps and{" "}
              {BOUNDARY_TESTS.rows[3].streams} failed at {n(BOUNDARY_TESTS.rows[3].slowestFps)}. 8K held{" "}
              {BOUNDARY_TESTS.rows[4].streams} ({n(BOUNDARY_TESTS.rows[4].slowestFps)} fps) and failed at{" "}
              {BOUNDARY_TESTS.rows[5].streams}; 16K held {BOUNDARY_TESTS.rows[6].streams} (
              {n(BOUNDARY_TESTS.rows[6].slowestFps)} fps) and failed at {BOUNDARY_TESTS.rows[7].streams}. The first pass
              tested only widely spaced levels and reported about {FIRST_PASS_BOUNDARIES.rows[0].streams} for 1080p.
            </p>
            <ChartFigure
              caption={`Most simultaneous streams per resolution, all three cards together, from the fine sweep. Only the 4K clip has gradient and noise content; the 1080p, 8K and 16K clips are flat. Host CPU was ${n(BOUNDARY_TESTS.hostIdlePercentAt96Streams1080p)}% idle at 96 streams of 1080p.`}
              table={
                <DataTable
                  label="Real-time stream ceilings by resolution"
                  head={["Resolution", "Streams", "Notes"]}
                  rows={ceilings.map((row) => [row.resolution, row.streams, row.note])}
                />
              }
            >
              <BarChart
                label={`Stream ceilings: ${ceilings
                  .map((row) => `${row.resolution} ${row.streams}${row.realTime ? "" : " decoded at once, rate not logged"}`)
                  .join(", ")}.`}
                rows={ceilings.map((row) => ({
                  key: row.resolution,
                  label: row.realTime ? row.resolution : `${row.resolution}, decoded at once, rate not logged`,
                  value: row.streams,
                  display: `${row.streams} ${row.streams === 1 ? "stream" : "streams"}`,
                  tone: row.realTime ? "accent" : "muted",
                }))}
                max={120}
                ticks={[0, 30, 60, 90, 120]}
                unit="streams"
              />
            </ChartFigure>
            <ChartFigure
              caption={`The slowest stream decides. Each resolution's last pass and first fail. The first pass had 1080p at ${FIRST_PASS_BOUNDARIES.rows[0].streams} (${n(FIRST_PASS_BOUNDARIES.rows[0].slowestFps)} fps) and ${FIRST_PASS_BOUNDARIES.rows[1].streams} (${n(FIRST_PASS_BOUNDARIES.rows[1].slowestFps)} fps), and 4K at ${FIRST_PASS_BOUNDARIES.rows[2].streams} (${n(FIRST_PASS_BOUNDARIES.rows[2].slowestFps)} fps) and ${FIRST_PASS_BOUNDARIES.rows[3].streams} (${n(FIRST_PASS_BOUNDARIES.rows[3].slowestFps)} fps).`}
              table={
                <DataTable
                  label="Pass and fail boundaries"
                  head={["Run", "Slowest stream", "Streams at 24 fps or better", "Result"]}
                  rows={BOUNDARY_TESTS.rows.map((row) => [
                    `${row.resolution}, ${row.streams} streams`,
                    `${n(row.slowestFps, 2)} fps`,
                    `${row.passingStreams} of ${row.streams}`,
                    row.passed ? "Pass" : "Fail",
                  ])}
                />
              }
            >
              <FpsChart
                label={`Slowest stream at each boundary: ${BOUNDARY_TESTS.rows
                  .map((row) => `${row.resolution} ${row.streams} streams ${n(row.slowestFps, 2)} fps, ${row.passed ? "pass" : "fail"}`)
                  .join("; ")}.`}
                domain={[18, 30]}
                ticks={[18, 20, 22, 24, 26, 28, 30]}
                line={REAL_TIME_FPS}
                legend={[
                  { shape: "dot", tone: "accent", text: "Pass, every stream at 24 fps or better" },
                  { shape: "cross", tone: "danger", text: "Fail" },
                ]}
                rows={BOUNDARY_TESTS.rows.map((row) => ({
                  key: `${row.resolution}-${row.streams}`,
                  label: `${row.resolution}, ${row.streams} streams`,
                  summary: `${n(row.slowestFps, 2)} fps, ${row.passed ? "pass" : "fail"}`,
                  marks: [
                    {
                      value: row.slowestFps,
                      shape: row.passed ? "dot" : "cross",
                      tone: row.passed ? "accent" : "danger",
                      name: row.passed ? "Pass" : "Fail",
                    },
                  ],
                }))}
              />
            </ChartFigure>
            <p className={NOTE}>
              A 32K clip ({DECODE_32K.width.toLocaleString("en-US")} by {DECODE_32K.height.toLocaleString("en-US")}) was
              also generated and decoded successfully. That was a test of resolution, not a count of streams.
            </p>

            <Sub id="clips" tag={CLIPS.section} title="What the test clips were">
              <p className={P}>
                All five clips are {CLIPS.codec} ({CLIPS.fourCC}). Only the 4K clip has the gradient and noise content
                that is hard to compress; the others are flat or solid-color patterns, so their ceilings are likely more
                favorable than real footage would give, and the ceilings should not be compared across resolutions as
                if the content were the same.
              </p>
              <div className="mt-5">
                <DataTable
                  label="Test clips"
                  head={["Clip", "Dimensions", "Frames", "Bitrate", "Content"]}
                  rows={CLIPS.rows.map((row) => [
                    row.clip,
                    `${row.width.toLocaleString("en-US")} by ${row.height.toLocaleString("en-US")}`,
                    `${row.frames} at ${row.fps} fps`,
                    `${n(row.mbps)} Mb/s`,
                    row.note ? `${row.content}. ${row.note}` : row.content,
                  ])}
                />
              </div>
            </Sub>

            <Sub id="totals" tag={FIXED_TOTAL.section} title="The fixed total holds at 1080p and 4K">
              <p className={P}>
                Total frames per second across all streams stayed flat as streams were added: about{" "}
                {FIXED_TOTAL.rows[0].totalFps} fps at 4K (within {FIXED_TOTAL.rows[0].within}, N={FIXED_TOTAL.rows[0].fromN}{" "}
                to {FIXED_TOTAL.rows[0].toN}) and about {FIXED_TOTAL.rows[1].totalFps.toLocaleString("en-US")} at 1080p
                (within {FIXED_TOTAL.rows[1].within}, N={FIXED_TOTAL.rows[1].fromN} to {FIXED_TOTAL.rows[1].toN}).
                Dividing a total by {FIXED_TOTAL.divisor} gives a close but slightly optimistic estimate of the real
                ceiling: {n(FIXED_TOTAL.rows[0].estimateFromTotal)} for 4K against a real boundary of{" "}
                {FIXED_TOTAL.rows[0].boundary}, and {n(FIXED_TOTAL.rows[1].estimateFromTotal)} for 1080p against{" "}
                {FIXED_TOTAL.rows[1].boundary}. The gap is per-stream variance, not an error in the idea.
              </p>
              <p className={P}>
                {FIXED_TOTAL.notAPlateau.resolutions.join(" and ")} do not show the pattern in the tested range: their
                total throughput was still rising with the stream count ({FIXED_TOTAL.notAPlateau.example.resolution},{" "}
                {n(FIXED_TOTAL.notAPlateau.example.fromFps)} to {n(FIXED_TOTAL.notAPlateau.example.toFps)} fps across N=
                {FIXED_TOTAL.notAPlateau.example.fromN} to {FIXED_TOTAL.notAPlateau.example.toN}), so they had not reached
                a fixed-budget plateau.
              </p>
              <p className={NOTE}>{FIXED_TOTAL.statsNote}</p>
            </Sub>

            <Sub id="links" tag={LINK_STATE.section} title="The PCIe links did not change under load">
              <p className={P}>
                Link width and speed were identical idle and during a 27-stream 4K decode, so the x16 against x8
                asymmetry is a fixed property of the slots, not a load effect.
              </p>
              <div className="mt-5">
                <DataTable
                  label="PCIe link state, idle against load"
                  head={["Card", "Slot", "Idle", "During 27 x 4K decode"]}
                  rows={LINK_STATE.rows.map((row) => [row.card, `Slot ${row.slot} (x${row.lanes})`, row.idle, row.underLoad])}
                />
              </div>
              <p className={NOTE}>{LINK_STATE.notCaptured}</p>
            </Sub>
          </Section>

          {/* ── 3. CPU isolation ── */}
          <Section id="cpu" tag={`Section ${CPU_ISOLATION.section}`} title="A saturated CPU barely moves the decode">
            <p className={P}>
              All {MACHINE.logicalCores} logical cores were pinned with busy loops ({CPU_ISOLATION.saturatedLoad})
              while the cards ran 96 streams of 1080p and 27 of 4K. Every stream stayed above {REAL_TIME_FPS} fps.
            </p>
            <ChartFigure
              caption={`The slowest 1080p stream dropped ${percentDrop(CPU_ISOLATION.rows[0].baseline.min, CPU_ISOLATION.rows[0].saturated.min)}% and the slowest 4K stream ${percentDrop(CPU_ISOLATION.rows[1].baseline.min, CPU_ISOLATION.rows[1].saturated.min)}%.`}
              table={
                <DataTable
                  label="Decode rate with the CPU idle and saturated"
                  head={["Condition", "1080p ×96, min / avg fps", "4K ×27, min / avg fps"]}
                  rows={[
                    ["CPU idle", ...CPU_ISOLATION.rows.map((row) => `${n(row.baseline.min)} / ${n(row.baseline.avg)}`)],
                    [
                      "All cores busy",
                      ...CPU_ISOLATION.rows.map(
                        (row) => `${n(row.saturated.min)} / ${n(row.saturated.avg)} (−${n(row.reportedDropPercent)}%)`,
                      ),
                    ],
                  ]}
                />
              }
            >
              <FpsChart
                label={`Decode rate, CPU idle then saturated: ${isolationRows.map((row) => `${row.label} ${row.summary} fps`).join("; ")}.`}
                domain={[22, 30]}
                ticks={[22, 24, 26, 28, 30]}
                line={REAL_TIME_FPS}
                legend={[
                  { shape: "ring", tone: "muted", text: "CPU idle" },
                  { shape: "dot", tone: "accent", text: `All ${MACHINE.logicalCores} logical cores busy` },
                ]}
                rows={isolationRows}
              />
            </ChartFigure>
            <p className={NOTE}>
              Per-second sampling of each card, three runs each. At 96 streams of 1080p the first second after launch
              reads unevenly ({BUSY_SETTLE.firstSecond1080p.map((triple) => triple.join("/")).join(", ")}% across the
              three runs) and settles to {BUSY_SETTLE.settled1080p.join("/")}% by second {BUSY_SETTLE.settledBySecond},
              so it is a ramp-up transient. At 4K ×{BUSY_SETTLE.fourK.streams} it is different: in{" "}
              {BUSY_SETTLE.fourK.runsWithOneX8CardIdle} of {BUSY_SETTLE.fourK.runs} runs one x8 card (
              {BUSY_SETTLE.fourK.idleCard}) dropped to 0% busy for most of the run while the other two carried the
              full load, and in the third run both x8 cards dropped to 0%, leaving the x16 card doing almost all the
              work. So the 27-stream ceiling was sometimes reached with only one or two of the three cards, and the
              true all-three-cards 4K capacity may be higher. That is an open question, not a settled number.
            </p>
          </Section>

          {/* ── 4. mixed ── */}
          <Section id="mixed" tag={`Section ${MIXED_LOAD.section}`} title="When resolutions mix, 8K falls behind first">
            <p className={P}>
              One batch ran 8K, 4K and 1080p at once, each at half its first-pass solo ceiling. Added up, that is about{" "}
              {MIXED_LOAD.ceilingsOfWork} ceilings of work ({MIXED_LOAD.ceilingsOfWorkCorrected} against the corrected
              1080p ceiling), so something had to give. 4K and 1080p stayed just above{" "}
              {REAL_TIME_FPS} fps; 8K fell to {n(MIXED_LOAD.rows[0].fps.min)} to {n(MIXED_LOAD.rows[0].fps.max)} fps.
            </p>
            <ChartFigure
              caption="Each bar runs from the slowest stream to the fastest; the mark is the average. Only 8K fell below real time, on every stream. It is one batch, and it was over capacity by design."
              table={
                <DataTable
                  label="Mixed-resolution batch"
                  head={["Tier", "Streams", "Min / avg / max fps", "Real time"]}
                  rows={MIXED_LOAD.rows.map((row) => [
                    row.resolution,
                    `${row.streams} of ${row.soloCeiling}`,
                    `${n(row.fps.min)} / ${n(row.fps.avg)} / ${n(row.fps.max)}`,
                    row.verdict === "no" ? "No" : "Yes",
                  ])}
                />
              }
            >
              <FpsChart
                label={`Mixed batch, slowest to fastest stream: ${MIXED_LOAD.rows
                  .map((row) => `${row.resolution} ${n(row.fps.min)} to ${n(row.fps.max)} fps`)
                  .join("; ")}. 8K is below 24 fps.`}
                domain={[16, 30]}
                ticks={[16, 18, 20, 22, 24, 26, 28, 30]}
                line={REAL_TIME_FPS}
                legend={[
                  { shape: "span", tone: "accent", text: "Slowest to fastest stream" },
                  { shape: "dot", tone: "accent", text: "Average, real time held" },
                  { shape: "cross", tone: "danger", text: "Average, below real time" },
                ]}
                rows={MIXED_LOAD.rows.map((row) => {
                  const ok = isRealTime(row.fps.min);
                  return {
                    key: row.resolution,
                    label: `${row.resolution}, ${row.streams} of ${row.soloCeiling}`,
                    summary: `${n(row.fps.min)} / ${n(row.fps.avg)} / ${n(row.fps.max)}`,
                    span: { lo: row.fps.min, hi: row.fps.max, tone: ok ? "accent" : "danger" },
                    marks: [
                      {
                        value: row.fps.avg,
                        shape: ok ? "dot" : "cross",
                        tone: ok ? "accent" : "danger",
                        name: "Average",
                      },
                    ],
                  };
                })}
              />
            </ChartFigure>

            <Sub id="mixed-budget" tag={MIXED_IN_BUDGET.section} title="Redone within capacity, it is still an 8K problem">
              <p className={P}>
                That batch could not show a pure mixing penalty, because it asked for more than the cards had. The redo
                ran exactly one third of each tier&apos;s solo ceiling at once: {MIXED_IN_BUDGET.rows[0].streams} of{" "}
                {MIXED_IN_BUDGET.rows[0].soloCeiling} at 8K, {MIXED_IN_BUDGET.rows[1].streams} of{" "}
                {MIXED_IN_BUDGET.rows[1].soloCeiling} at 4K and {MIXED_IN_BUDGET.rows[2].streams} of{" "}
                {MIXED_IN_BUDGET.rows[2].soloCeiling} at 1080p. 4K and 1080p had 50 to 65 percent headroom and no
                penalty. 8K ran right at the {REAL_TIME_FPS} fps edge, with one of its two streams failing. So the
                mixing penalty is specific to 8K at this allocation, not a uniform effect across the tiers.
              </p>
              <ChartFigure
                caption="Each bar runs from the slowest stream to the fastest; the mark is the average. Exactly one third of each solo ceiling."
                table={
                  <DataTable
                    label="Mixed-resolution batch within capacity"
                    head={["Tier", "Streams", "Min / avg / max fps", "Streams at 24 fps or better"]}
                    rows={MIXED_IN_BUDGET.rows.map((row) => [
                      row.resolution,
                      `${row.streams} of ${row.soloCeiling}`,
                      `${n(row.fps.min)} / ${n(row.fps.avg)} / ${n(row.fps.max)}`,
                      row.passing,
                    ])}
                  />
                }
              >
                <FpsChart
                  label={`Mixed batch within capacity, slowest to fastest stream: ${MIXED_IN_BUDGET.rows
                    .map((row) => `${row.resolution} ${n(row.fps.min)} to ${n(row.fps.max)} fps`)
                    .join("; ")}. 8K's slowest stream is below 24 fps.`}
                  domain={[20, 42]}
                  ticks={[20, 24, 28, 32, 36, 40]}
                  line={REAL_TIME_FPS}
                  legend={[
                    { shape: "span", tone: "accent", text: "Slowest to fastest stream" },
                    { shape: "dot", tone: "accent", text: "Average, real time held" },
                    { shape: "cross", tone: "danger", text: "Average, slowest stream below real time" },
                  ]}
                  rows={MIXED_IN_BUDGET.rows.map((row) => {
                    const ok = isRealTime(row.fps.min);
                    return {
                      key: row.resolution,
                      label: `${row.resolution}, ${row.streams} of ${row.soloCeiling}`,
                      summary: `${n(row.fps.min)} / ${n(row.fps.avg)} / ${n(row.fps.max)}`,
                      span: { lo: row.fps.min, hi: row.fps.max, tone: ok ? "accent" : "danger" },
                      marks: [
                        {
                          value: row.fps.avg,
                          shape: ok ? "dot" : "cross",
                          tone: ok ? "accent" : "danger",
                          name: "Average",
                        },
                      ],
                    };
                  })}
                />
              </ChartFigure>
              <p className={NOTE}>
                A second allocation gave 8K {MIXED_IN_BUDGET.second.eightKStreams} of 6 streams and 1080p fewer. {MIXED_IN_BUDGET.second.note}
              </p>
            </Sub>
          </Section>

          {/* ── 5. endurance, scrubbing, editors ── */}
          <Section id="endurance" tag={`Sections ${ENDURANCE.section} to ${EDITORS.section}`} title="Long runs, scrubbing and six editors">
            <dl className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
                <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {ENDURANCE.section} · {ENDURANCE.minutes} minutes at 96 streams
                </dt>
                <dd className="mt-3 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {ENDURANCE.streams} streams of {ENDURANCE.resolution}, sampled every {ENDURANCE.sampleEverySeconds} seconds.
                  All {ENDURANCE.streamsAlive} streams kept decoding, the cards&apos; pending queues stayed bounded, and
                  the host CPU never throttled (CPU_Speed_Limit stayed at {ENDURANCE.cpuSpeedLimit}).
                </dd>
              </div>
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
                <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {SCRUBBING.section} · Scrubbing is free
                </dt>
                <dd className="mt-3 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  One {SCRUBBING.resolution} stream decoded in order at {n(SCRUBBING.sequentialFps)} fps, and in random
                  order over {SCRUBBING.passes} passes at {n(SCRUBBING.randomFps)} fps. No measurable penalty.
                </dd>
              </div>
              <div className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5">
                <dt className="font-techno text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                  {EDITORS.section} · Six editors at once
                </dt>
                <dd className="mt-3 font-mono-tight text-[0.75rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {EDITORS.editors} scrubbing processes on {EDITORS.resolution}: {n(Math.min(...EDITORS.burst.fps))} to{" "}
                  {n(Math.max(...EDITORS.burst.fps))} fps each over {n(EDITORS.burst.seconds)} seconds, and{" "}
                  {n(Math.min(...EDITORS.sustained.fps))} to {n(Math.max(...EDITORS.sustained.fps))} fps over{" "}
                  {EDITORS.sustained.seconds} seconds.
                </dd>
              </div>
            </dl>
          </Section>

          {/* ── 6. pixel format ── */}
          <Section id="format" tag={`Section ${PIXEL_FORMAT.section}`} title="Asking for a pixel format costs frames">
            <p className={P}>
              Forcing the decoder to convert its output is not free. The stream ceilings above all used native
              output, so this is a separate cost for anything that asks for a conversion.
            </p>
            <ChartFigure
              caption={`Decode rate on a ${PIXEL_FORMAT.clip}. Native output was ${PIXEL_FORMAT.reportedGainPercent}% faster than forced BGRA.`}
              table={
                <DataTable
                  label="Decode rate by requested output format"
                  head={["Requested output", "Decode rate", "Against native"]}
                  rows={PIXEL_FORMAT.rows.map((row) => [
                    row.format,
                    `${n(row.fps)} fps`,
                    row.reportedDropPercent ? `−${row.reportedDropPercent}%` : "",
                  ])}
                />
              }
            >
              <BarChart
                label={`Decode rate by output format: ${PIXEL_FORMAT.rows.map((row) => `${row.format} ${n(row.fps)} fps`).join(", ")}.`}
                rows={PIXEL_FORMAT.rows.map((row, i) => ({
                  key: row.format,
                  label: row.format.replace(/ \(.*\)$/, ""),
                  value: row.fps,
                  display: row.reportedDropPercent ? `${n(row.fps)} (−${row.reportedDropPercent}%)` : n(row.fps),
                  tone: i === 0 ? "accent" : "muted",
                }))}
                max={350}
                ticks={[0, 100, 200, 300]}
                unit="fps"
              />
            </ChartFigure>
          </Section>

          {/* ── 7. the FPGA ── */}
          <Section id="fpga" tag={FPGA.section} title="Why the FPGA was not reprogrammed">
            <p className={P}>
              Each card is built around a {MACHINE.fpga}. The driver, its flash protocol and the chip&apos;s fuse documentation
              were studied, and a flash tool was built and tested against a simulator only. {FPGA.neverDone}
            </p>
            <ol className="mt-5 max-w-2xl list-decimal space-y-3 pl-5 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))] marker:text-[hsl(var(--brand-signal))]">
              {FPGA.reasons.map((reason) => (
                <li key={reason} className="pl-1">
                  {reason}
                </li>
              ))}
            </ol>
            <p className={NOTE}>
              A Vivado CORE license, the lowest tier covering this chip family, is ${FPGA.vivadoCoreUsd.nodeLocked.toLocaleString("en-US")} a
              year node-locked or ${FPGA.vivadoCoreUsd.floating.toLocaleString("en-US")} floating.
            </p>
          </Section>

          {/* ── 8. files through a decoder ── */}
          <Section id="files" tag="Part 3" title="Files through a video decoder">
            <p className={P}>
              The Afterburner only decodes ProRes, so the question was whether its decoder would hand back arbitrary
              bytes disguised as video. It does, bit for bit. It is a demonstration, not a practical way to store
              data: plain LZ4 on one core decompressed a 10 MB random payload at{" "}
              {BASELINE.rows[0].mbps.lo.toLocaleString("en-US")} MB/s, about {BASELINE.reportedLz4Margin} times the best
              result here.
            </p>

            <Sub id="technique" tag={`Section ${TECHNIQUE.section}`} title="How it works">
              <ul className="mt-4 max-w-2xl list-disc space-y-2 pl-5 font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))] marker:text-[hsl(var(--brand-signal))]">
                <li>
                  Bytes are painted as solid {TECHNIQUE.blockPixels} by {TECHNIQUE.blockPixels} pixel blocks in{" "}
                  {TECHNIQUE.codec} frames.
                </li>
                <li>
                  {TECHNIQUE.codec} keeps red, green and blue separate at full resolution, so each block carries{" "}
                  {TECHNIQUE.bytesPerBlock} bytes, one per channel.
                </li>
                <li>
                  {TECHNIQUE.header} The container did not map frames to samples one to one (one test wrote{" "}
                  {PIPELINE_FINDINGS.phantom.framesWritten} frame and read back {PIPELINE_FINDINGS.phantom.samplesRead}{" "}
                  samples), so the decoder trusts content, not position.
                </li>
                <li>
                  Decoding through the hardware path gives the bytes back. The decoder&apos;s native output for this
                  content was {PIPELINE_FINDINGS.nativeOutput}, 16-bit packed YCbCr; read as if it were BGRA,{" "}
                  {n(PIPELINE_FINDINGS.wrongWhenMisreadPercent)}% of bytes came back wrong, so the data runs asked
                  for BGRA output.
                </li>
              </ul>
            </Sub>

            <Sub id="correctness" tag={`Section ${CORRECTNESS.section}`} title="Did the bytes come back">
              <p className={P}>
                Bit-exact at every scale tested, including a {CORRECTNESS.machOBytes.toLocaleString("en-US")}-byte
                Mach-O executable that ran after recovery.
              </p>
              <div className="mt-5">
                <DataTable
                  label="Correctness results"
                  head={["Test and scale", "Result"]}
                  rows={CORRECTNESS.rows.map((row) => [
                    <>
                      {row.test}
                      <span className="mt-0.5 block text-[hsl(var(--brand-bone-dim))]">{row.scale}</span>
                    </>,
                    row.result,
                  ])}
                />
              </div>
            </Sub>

            <Sub id="demo" tag="Browser simulation" title="Try it">
              <p className={P}>
                Type something, or pick a sample. The page paints its UTF-8 bytes as blocks, adds noise if you ask
                for it, and reads them back.
              </p>
              <BlockDemo />
            </Sub>

            <Sub id="sweep" tag={`Section ${CONCURRENCY_SWEEP.section}`} title="Where more sessions stop helping">
              <p className={P}>
                Many short sessions at once, each decoding the same small workload. From 1 to 9 sessions the time per
                session grew smoothly, from {CONCURRENCY_SWEEP.smooth.fromSeconds} s to {CONCURRENCY_SWEEP.smooth.toSeconds}{" "}
                s. At 10 it jumped to {CONCURRENCY_SWEEP.cliff.seconds} s, and 11 to 13 sat at{" "}
                {spanText(CONCURRENCY_SWEEP.plateau.seconds)} s.
              </p>
              <ChartFigure
                caption="Per-session decode time for a fixed small workload. The report prints only the two ends of the 1 to 9 range, so that stretch is a straight line between them, and 11 to 13 is the band it gives for all three."
                table={
                  <DataTable
                    label="Concurrency sweep"
                    head={["Concurrent sessions", "Per-session time", "Behavior"]}
                    rows={[
                      ["1 to 9", `${CONCURRENCY_SWEEP.smooth.fromSeconds} s to ${CONCURRENCY_SWEEP.smooth.toSeconds} s`, "Smooth, stable across repeats"],
                      ["10", `${CONCURRENCY_SWEEP.cliff.seconds} s`, "A sudden jump"],
                      ["11 to 13", `${spanText(CONCURRENCY_SWEEP.plateau.seconds)} s`, "Degraded, stable there"],
                      ["9, four times in a row", CONCURRENCY_SWEEP.repeatedN9.map((s) => `${s} s`).join(", "), "Worse each time, under the cliff"],
                    ]}
                  />
                }
              >
                <SweepChart
                  label={`Per-session decode time: ${CONCURRENCY_SWEEP.smooth.fromSeconds} s at 1 session, ${CONCURRENCY_SWEEP.smooth.toSeconds} s at 9, ${CONCURRENCY_SWEEP.cliff.seconds} s at 10, ${spanText(CONCURRENCY_SWEEP.plateau.seconds)} s at 11 to 13.`}
                  smooth={CONCURRENCY_SWEEP.smooth}
                  cliff={CONCURRENCY_SWEEP.cliff}
                  plateau={CONCURRENCY_SWEEP.plateau}
                />
              </ChartFigure>
              <ChartFigure
                caption="The same N=9 run four times back to back. It degraded without crossing the N=10 cliff, which points to a resource not being released promptly between short-lived sessions."
              >
                <BarChart
                  label={`Nine sessions, four runs in a row: ${CONCURRENCY_SWEEP.repeatedN9.map((s) => `${s} s`).join(", ")}.`}
                  rows={CONCURRENCY_SWEEP.repeatedN9.map((seconds, i) => ({
                    key: `run-${i}`,
                    label: `Run ${i + 1}`,
                    value: seconds,
                    display: `${seconds} s`,
                    tone: i === CONCURRENCY_SWEEP.repeatedN9.length - 1 ? "danger" : "accent",
                  }))}
                  max={3}
                  ticks={[0, 1, 2, 3]}
                  unit="seconds"
                />
              </ChartFigure>
              <BgraNote>
                These short sessions forced 32-bit BGRA output. The verification pass re-ran them with native output
                and found no cliff at all (the section after the ceiling, below).
              </BgraNote>
              <p className={NOTE}>
                A few long-lived sessions doing substantial work removed the degradation entirely. Raising the
                harness&apos;s own in-flight limit from {CONCURRENCY_SWEEP.inFlightLimit.from} to{" "}
                {CONCURRENCY_SWEEP.inFlightLimit.to} made no measurable difference.
              </p>
            </Sub>

            <Sub id="ceiling" tag={`Section ${CEILING_CONFIGS.section}`} title="The 16 MB/s ceiling was a BGRA limit">
              <p className={P}>
                With long-lived sessions, four configurations converged on {spanText(CEILING_CONFIGS.converges)} MB/s
                for all three cards together. Six sessions did not beat three; they split the same capacity.
              </p>
              <BgraNote>
                Every figure in this table was measured with the decoder forced to 32-bit BGRA output, which slows
                hardware decode {NATIVE_VS_BGRA.hardwarePenalty} times (Section {NATIVE_VS_BGRA.section}). The
                verification pass showed that this conversion, not the cards, produced the ceiling: the same pipeline
                with native output is about {NATIVE_SWEEP.longLived.advantage} times faster at matched density.
              </BgraNote>
              <div className="mt-5">
                <DataTable
                  label="Data recovery ceiling by configuration, BGRA output"
                  head={["Configuration", "Aggregate"]}
                  rows={CEILING_CONFIGS.rows.map((row) => [
                    <>
                      {row.configuration}
                      <span className="mt-0.5 block text-[hsl(var(--brand-bone-dim))]">{row.note}</span>
                    </>,
                    `${spanText(row.mbps, 2)} MB/s`,
                  ])}
                />
              </div>
              <p className={NOTE}>
                The pipeline was also rebuilt entirely in memory, with no file and no container, and separately run
                from threads inside one process. Both gave the same throughput as before (Section 3.2).
              </p>
            </Sub>

            <Sub id="native" tag={NATIVE_SWEEP.section} title="With native output there is no cliff">
              <p className={P}>
                The short-session pipeline was rebuilt to decode to the hardware&apos;s native pixel format (
                {NATIVE_SWEEP.nativeFormat} for ProRes 4444) instead of forcing BGRA. Every configuration came back 100%
                bit-exact. At low concurrency native is a consistent 1.3 to 1.4 times faster. At 9 and 12 sessions BGRA
                collapses while native does not degrade at all. Extending the native sweep to{" "}
                {NATIVE_SWEEP.extended.levels.join(", ")} sessions keeps it flat at {spanText(NATIVE_SWEEP.extended.combinedMBps)}{" "}
                MB/s combined, {NATIVE_SWEEP.extended.exact} of {NATIVE_SWEEP.extended.of} bit-exact.
              </p>
              <div className="mt-5">
                <DataTable
                  label="Native output against forced BGRA, aggregate MB/s"
                  head={["Resolution", "Sessions", "BGRA", "Native", "Native advantage"]}
                  rows={NATIVE_SWEEP.rows.map((row) => [
                    row.resolution,
                    row.n,
                    row.bgraNote ? `${n(row.bgraMBps, 2)} MB/s (${row.bgraNote})` : `${n(row.bgraMBps, 2)} MB/s`,
                    `${n(row.nativeMBps, 2)} MB/s`,
                    `${row.advantage}x`,
                  ])}
                />
              </div>
              <p className={P}>
                The same check on the few long-lived sessions that produced the original 16 MB/s (
                {NATIVE_SWEEP.longLived.sessions} sessions, {NATIVE_SWEEP.longLived.payloadMB} MB payloads each) gave{" "}
                {n(NATIVE_SWEEP.longLived.nativeMBps)} MB/s decode-only with native output against{" "}
                {n(NATIVE_SWEEP.longLived.bgraMBps)} MB/s with BGRA at matched (1x) density, about{" "}
                {NATIVE_SWEEP.longLived.advantage} times. One caveat: the original 16 MB/s used a 3x-density scheme that
                has only been calibrated for native output on the luma channel, not chroma, so a native 3x-density
                number has not been measured. A linear projection puts it near {NATIVE_SWEEP.longLived.projectedNative3xMBps}{" "}
                MB/s; that is a projection, not a result.
              </p>
              <p className={NOTE}>{NATIVE_SWEEP.calibration}</p>
            </Sub>

            <Sub id="cards" tag={`Section ${PER_CARD_BUSY.section}`} title="The x16 card works harder">
              <p className={P}>
                During three-way decode the card in the x16 slot ran about {PER_CARD_BUSY.reportedRatio} times as busy
                as the two in x8 slots. A pure bandwidth limit would predict about 2, which suggests PCIe bandwidth is a
                factor but not the only one.
              </p>
              <ChartFigure
                caption="Sustained busy percent per card under three-way data decode. The lighter end of each bar is the top of the range."
                table={
                  <DataTable
                    label="Per-card busy percent"
                    head={["Card", "PCIe slot", "Busy"]}
                    rows={PER_CARD_BUSY.rows.map((row) => [row.registryId, `x${row.lanes} (slot ${row.slot})`, `${spanText(row.busy, 0)}%`])}
                  />
                }
              >
                <BarChart
                  label={`Busy percent per card: ${PER_CARD_BUSY.rows.map((row) => `slot ${row.slot} x${row.lanes} ${spanText(row.busy, 0)}%`).join(", ")}.`}
                  rows={PER_CARD_BUSY.rows.map((row) => ({
                    key: row.registryId,
                    label: `x${row.lanes}, slot ${row.slot} (${row.registryId})`,
                    value: row.busy,
                    display: `${spanText(row.busy, 0)}%`,
                    tone: row.lanes === 16 ? "accent" : "muted",
                  }))}
                  max={100}
                  ticks={[0, 25, 50, 75, 100]}
                  unit="% busy"
                />
              </ChartFigure>
            </Sub>

            <Sub id="software" tag={`Section ${SOFTWARE_VS_HARDWARE.section}`} title="Software decode was faster, by less than it first looked">
              <p className={P}>
                For this deliberately hard content, high-frequency blocks with no correlation, software decode beat the
                hardware path. The first comparison forced both paths to BGRA output, which hurts hardware far more than
                software.
              </p>
              <BgraNote>
                Every row below was measured with both paths forced to 32-bit BGRA output. The aggregate comparison,{" "}
                {spanText(SOFTWARE_VS_HARDWARE.softwareAggregate, 0)} against about {SOFTWARE_VS_HARDWARE.hardwareAggregate} MB/s,
                was not re-run with native output.
              </BgraNote>
              <div className="mt-5">
                <DataTable
                  label="Hardware and software decode compared"
                  head={["Measure", "Hardware-required decode", "Software decode"]}
                  rows={SOFTWARE_VS_HARDWARE.rows.map((row) => [row.metric, row.hardware, row.software])}
                />
              </div>
              <ChartFigure
                caption={`The correction, one session each with native output: software ${n(NATIVE_VS_BGRA.rows[1].nativeFps)} fps against hardware ${n(NATIVE_VS_BGRA.rows[0].nativeFps)}, about ${NATIVE_VS_BGRA.correctedMargin} times. Forced BGRA made hardware ${NATIVE_VS_BGRA.hardwarePenalty} times slower and left software nearly unaffected. The first, BGRA-forced comparison of all sessions together had implied about ${SOFTWARE_VS_HARDWARE.uncorrectedMargin} times; it measured something different and was not re-run with native output.`}
                table={
                  <DataTable
                    label="Native and forced BGRA output, frames per second"
                    head={["Decode path", "Native", "Forced BGRA"]}
                    rows={NATIVE_VS_BGRA.rows.map((row) => [row.path, `${n(row.nativeFps)} fps`, `${n(row.bgraFps)} fps`])}
                  />
                }
              >
                <BarChart
                  label={`Frames per second: ${NATIVE_VS_BGRA.rows
                    .map((row) => `${row.path} native ${n(row.nativeFps)}, ${row.path} BGRA ${n(row.bgraFps)}`)
                    .join("; ")}.`}
                  rows={NATIVE_VS_BGRA.rows.flatMap((row) => [
                    { key: `${row.path}-native`, label: `${row.path}, native output`, value: row.nativeFps, display: n(row.nativeFps), tone: "accent" as const },
                    { key: `${row.path}-bgra`, label: `${row.path}, forced BGRA`, value: row.bgraFps, display: n(row.bgraFps), tone: "muted" as const },
                  ])}
                  max={1800}
                  ticks={[0, 600, 1200, 1800]}
                  unit="fps"
                />
              </ChartFigure>
            </Sub>

            <Sub id="codecs" tag={`Section ${CODEC_PROFILES.section}`} title="ProRes 4444 was the right codec">
              <p className={P}>
                It is the only profile tested that keeps the three channels separate, and it also decoded fastest in
                software. HEVC and H.264, with far more complex decoders, were much slower here.
              </p>
              <ChartFigure
                caption={`Software decode rate, ${CODEC_PROFILES.payload}.`}
                table={
                  <DataTable
                    label="Software decode rate by codec profile"
                    head={["Codec profile", "Software decode rate"]}
                    rows={CODEC_PROFILES.rows.map((row) => [row.profile, `${n(row.mbps)} MB/s`])}
                  />
                }
              >
                <BarChart
                  label={`Software decode rate by codec: ${CODEC_PROFILES.rows.map((row) => `${row.profile} ${n(row.mbps)} MB/s`).join(", ")}.`}
                  rows={CODEC_PROFILES.rows.map((row, i) => ({
                    key: row.profile,
                    label: row.profile,
                    value: row.mbps,
                    display: `${n(row.mbps)} MB/s`,
                    tone: i === 0 ? "accent" : "muted",
                  }))}
                  max={40}
                  ticks={[0, 10, 20, 30, 40]}
                  unit="MB/s"
                />
              </ChartFigure>
            </Sub>

            <Sub id="corruption" tag={`Section ${CORRUPTION.section}`} title="Damaged frames: errors, and one silent risk">
              <p className={P}>
                A known-good compressed frame was corrupted at increasing severity, one frame per level. The process
                never hung or crashed. Heavier damage returned a VideoToolbox error instead of a frame, but only the
                fully corrupted frame got the bad-data code. At 0.1% a frame came back after about 2 seconds and its
                bytes were not checked, so light damage can pass silently: real use needs a checksum.
              </p>
              <div className="mt-5">
                <DataTable
                  label="Decoder behavior under corruption"
                  head={["Corruption", "Result"]}
                  rows={CORRUPTION.rows.map((row) => [
                    row.level,
                    row.status !== undefined ? `${row.result}, status −${Math.abs(row.status)}` : row.result,
                  ])}
                />
              </div>
            </Sub>

            <Sub id="baseline" tag={`Section ${BASELINE.section}`} title="Against ordinary compression">
              <p className={P}>
                The same 10 MB random payload through Apple&apos;s built-in Compression framework, single threaded, with
                no video and no Afterburner. Every library tested except zlib was faster than the best result here.
              </p>
              <ChartFigure
                caption={`Decompression or decode rate. LZ4 on one core was about ${BASELINE.reportedLz4Margin} times this project's best result.`}
                table={
                  <DataTable
                    label="Decompression rate against this project's results"
                    head={["Method", "Rate", "Note"]}
                    rows={BASELINE.rows.map((row) => [
                      row.method,
                      `${row.project && row.mbps.lo === row.mbps.hi ? "about " : ""}${spanText(row.mbps, 0)} MB/s`,
                      row.project ? "Measured with BGRA output" : "Single threaded",
                    ])}
                  />
                }
              >
                <BarChart
                  label={`Rates in MB/s: ${BASELINE.rows.map((row) => `${row.method} ${spanText(row.mbps, 0)}`).join(", ")}.`}
                  rows={BASELINE.rows.map((row) => ({
                    key: row.method,
                    label: row.bgra ? `${row.method}, BGRA output` : row.method,
                    value: row.mbps.lo === row.mbps.hi ? row.mbps.lo : row.mbps,
                    display: row.mbps.lo.toLocaleString("en-US") + (row.mbps.lo === row.mbps.hi ? "" : ` to ${row.mbps.hi}`),
                    tone: row.project ? "accent" : "muted",
                  }))}
                  max={1100}
                  ticks={[0, 250, 500, 750, 1000]}
                  unit="MB/s"
                />
              </ChartFigure>
              <BgraNote>
                Both project rows come from the BGRA-forced comparison in Section {SOFTWARE_VS_HARDWARE.section}. The
                hardware figure is the ceiling above, measured that way. The verification pass found native output about{" "}
                {NATIVE_SWEEP.longLived.advantage} times faster in this pipeline, so the hardware rows understate what
                native output gives.
              </BgraNote>
              <p className={NOTE}>
                Encoding is software only on this machine; the Afterburner does not accelerate ProRes encode. At{" "}
                {BASELINE.endToEnd.concurrency}-way concurrency on a {BASELINE.endToEnd.payloadMB} MB payload, each
                process spent about {spanText(BASELINE.endToEnd.encodeSeconds, 0)} seconds compressing against{" "}
                {spanText(BASELINE.endToEnd.decodeSeconds, 0)} decoding.
              </p>
            </Sub>
          </Section>

          <footer className="mt-24 border-t border-[hsl(var(--brand-iron))] pt-8">
            <p className="max-w-2xl font-mono-tight text-[0.8125rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The write-up covers the whole investigation, with Max&apos;s photos of the machine and the comparisons
              with Apple&apos;s published figures, each with its source.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href={WRITE_UP}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] px-5 py-2.5 font-mono-tight text-[0.75rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.2)]"
              >
                Read the full write-up <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/blog/mac-pro-afterburner-card"
                className="tap-target inline-block font-mono-tight text-[0.75rem] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
              >
                What the Afterburner card is
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </CinematicLayout>
  );
}
