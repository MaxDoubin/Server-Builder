/**
 * Shannon entropy analyzer.
 *
 * Measures order-0 entropy in bits per byte over a whole file and across a
 * sliding window, draws the 256-bin byte histogram, and lists the regions
 * whose windows reach a chosen threshold. Chi-square, mean and serial
 * correlation sit beside the entropy because entropy alone cannot tell
 * compressed data from encrypted data, and chi-square often can. The file is
 * read into memory in this tab and is never stored or sent.
 */

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, PointerEvent } from "react";
import { ToolShell, ToolPanel, ToolResult } from "./ToolShell";
import { pluralise } from "@/lib/plural";
import {
  MAX_FILE_BYTES,
  MAX_PASTE_CHARS,
  MAX_REGIONS_LISTED,
  MAX_WINDOW,
  MAX_WINDOWS,
  MIN_WINDOW,
  byteStats,
  checkWindow,
  decodeBase64,
  decodeHex,
  describeEntropy,
  downsample,
  encodedAlphabet,
  expectedRandomEntropy,
  formatBytes,
  hexOffset,
  highRegions,
  maxEntropyFor,
  pseudoRandomBytes,
  slidingEntropy,
  type Column,
  type Region,
  type SlidingResult,
} from "@/lib/toolkit/entropy-analyzer";

/* ----------------------------------------------------------------- styles */

const LABEL =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_IDLE = `${CHIP_CLASS} min-h-[44px] border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]`;
const CHIP_ON = `${CHIP_CLASS} min-h-[44px] border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-signal))]`;
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const TD_NUM = "py-2 pr-4 text-right font-mono-tight text-xs tabular-nums text-[hsl(var(--brand-bone-dim))]";

const PLOT_W = 1000;
const PLOT_COLUMNS = 600;
const WINDOW_PRESETS = [256, 1024, 4096, 16384];
const REGION_PAGE = 100;

type PasteMode = "text" | "hex" | "base64";

const PASTE_MODES: { key: PasteMode; label: string }[] = [
  { key: "text", label: "UTF-8 text" },
  { key: "hex", label: "Hex" },
  { key: "base64", label: "Base64" },
];

/* ---------------------------------------------------------------- samples */

const PROSE =
  "Entropy measures how unpredictable the next byte is. Ordinary English uses a few dozen characters, " +
  "and some of them far more often than others, so counting byte frequencies gives roughly four to five " +
  "bits per byte rather than eight. A compressor removes that redundancy, and a cipher hides it, and in " +
  "both cases what remains looks like noise to a frequency count.\n";

function sampleMixed(): Uint8Array {
  const enc = new TextEncoder();
  const text = enc.encode(PROSE.repeat(16)).subarray(0, 6144);
  const out = new Uint8Array(6144 + 4096 + 8192 + 2048);
  out.set(text, 0);
  // Bytes 6144 to 10239 stay zero, like the fill between sections of a firmware image.
  out.set(pseudoRandomBytes(8192, 0x2545f491), 6144 + 4096);
  out.set(text.subarray(0, 2048), 6144 + 4096 + 8192);
  return out;
}

const SAMPLES: { key: string; label: string; make: () => Uint8Array }[] = [
  { key: "mixed", label: "Text, zeros, random", make: sampleMixed },
  { key: "text", label: "English text", make: () => new TextEncoder().encode(PROSE.repeat(24)) },
  { key: "random", label: "Pseudo-random 64 KiB", make: () => pseudoRandomBytes(65536, 0x1b873593) },
];

/* ---------------------------------------------------------------- helpers */

function errorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "unexpected error";
}

function dec(n: number): string {
  return n.toLocaleString("en-US");
}

function byteLabel(b: number): string {
  const hex = `0x${b.toString(16).toUpperCase().padStart(2, "0")}`;
  if (b >= 0x21 && b <= 0x7e) return `${hex} "${String.fromCharCode(b)}"`;
  if (b === 0x20) return `${hex} space`;
  if (b === 0x0a) return `${hex} LF`;
  if (b === 0x0d) return `${hex} CR`;
  if (b === 0x09) return `${hex} tab`;
  if (b === 0x00) return `${hex} NUL`;
  return hex;
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "0%";
  const p = (part / whole) * 100;
  return p > 0 && p < 0.01 ? "<0.01%" : `${p.toFixed(2)}%`;
}

function formatP(p: number): string {
  if (!Number.isFinite(p)) return "n/a";
  if (p === 0) return "below 1e-300";
  if (p < 0.0001) return p.toExponential(1);
  return p.toFixed(4);
}

const y8 = (h: number) => 100 - (h / 8) * 100;

/* --------------------------------------------------------- sliding plot */

function EntropyPlot({
  sliding,
  columns,
  regions,
  threshold,
  size,
}: {
  sliding: SlidingResult;
  columns: Column[];
  regions: Region[];
  threshold: number;
  size: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const cols = columns.length;
  const downsampled = cols < sliding.count;
  const randomLine = expectedRandomEntropy(Math.min(sliding.window, size));

  // Each column sits at the byte position of the middle of its windows, so
  // the x axis is in bytes even though the windows are what is sampled.
  const xs = useMemo(
    () =>
      columns.map((c) => {
        const start = sliding.offsets[c.first];
        const end = sliding.offsets[c.last] + sliding.lengths[c.last];
        return (((start + end) / 2) / size) * PLOT_W;
      }),
    [columns, sliding, size],
  );

  const maxLine = columns.map((c, i) => `${xs[i].toFixed(2)},${y8(c.max).toFixed(2)}`).join(" ");
  const band = downsampled
    ? `${maxLine} ${columns
        .map((c, i) => `${xs[i].toFixed(2)},${y8(c.min).toFixed(2)}`)
        .reverse()
        .join(" ")}`
    : "";

  // Regions merged at drawing resolution, so a file with thousands of short
  // regions still draws a bounded number of rectangles.
  const shades = useMemo(() => {
    const out: [number, number][] = [];
    for (const r of regions) {
      const x0 = (r.start / size) * PLOT_W;
      const x1 = Math.max(x0 + 1, (r.end / size) * PLOT_W);
      const last = out[out.length - 1];
      if (last && x0 <= last[1] + 0.5) last[1] = Math.max(last[1], x1);
      else out.push([x0, x1]);
    }
    return out;
  }, [regions, size]);

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || cols === 0) return;
    const x = ((e.clientX - rect.left) / rect.width) * PLOT_W;
    let best = 0;
    for (let i = 1; i < cols; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    setActive(best);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const cur = active ?? 0;
    const jump = e.shiftKey ? 10 : 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(cols - 1, cur + jump);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - jump);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = cols - 1;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  const col = active !== null ? columns[active] : null;
  let readout = "Point at the plot, or focus it and use the arrow keys (Shift for bigger steps), to read a window.";
  if (col) {
    const start = sliding.offsets[col.first];
    const end = sliding.offsets[col.last] + sliding.lengths[col.last];
    readout =
      col.first === col.last
        ? `Window ${hexOffset(start)} to ${hexOffset(end - 1)} (bytes ${dec(start)} to ${dec(end - 1)}): ${col.max.toFixed(4)} bits per byte.`
        : `${dec(col.last - col.first + 1)} windows covering ${hexOffset(start)} to ${hexOffset(end - 1)}: ${col.min.toFixed(4)} to ${col.max.toFixed(4)} bits per byte, peak at ${hexOffset(sliding.offsets[col.peak])}.`;
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-hidden="true">
        <span className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          <span className="inline-block h-0.5 w-5 bg-[hsl(var(--brand-signal))]" />
          {downsampled ? "Window entropy (line: highest, band: range)" : "Window entropy"}
        </span>
        <span className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          <span className="inline-block w-5 border-t-2 border-dashed border-[hsl(var(--brand-amber))]" />
          Threshold {threshold.toFixed(2)}
        </span>
        <span className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          <span className="inline-block h-0.5 w-5 bg-[hsl(var(--brand-cyan))]" />
          Random data at this window, {randomLine.toFixed(2)}
        </span>
        <span className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
          <span className="inline-block h-3 w-3 rounded-sm bg-[hsl(var(--brand-danger)/0.25)]" />
          At or above threshold
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative h-56 w-6 font-mono-tight text-[0.625rem] tabular-nums text-[hsl(var(--brand-ash))]" aria-hidden="true">
          {[8, 6, 4, 2, 0].map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${y8(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div
          tabIndex={0}
          role="group"
          aria-label={`Sliding window entropy across ${formatBytes(size)}: ${dec(sliding.count)} ${pluralise(sliding.count, "window")}, ${dec(regions.length)} ${pluralise(regions.length, "region")} at or above ${threshold.toFixed(2)} bits per byte. Use the arrow keys to read each point.`}
          aria-describedby="plot-readout"
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? 0)}
          onBlur={() => setActive(null)}
          data-testid="chart-sliding"
          className="h-56 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          <svg viewBox={`0 0 ${PLOT_W} 100`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
            {shades.map(([x0, x1]) => (
              <rect key={x0} x={x0} y="0" width={x1 - x0} height="100" fill="hsl(var(--brand-danger))" opacity="0.18" />
            ))}
            {[0, 25, 50, 75, 100].map((y) => (
              <line key={y} x1="0" x2={PLOT_W} y1={y} y2={y} stroke="hsl(var(--brand-iron))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <line
              x1="0"
              x2={PLOT_W}
              y1={y8(randomLine)}
              y2={y8(randomLine)}
              stroke="hsl(var(--brand-cyan))"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {band ? <polygon points={band} fill="hsl(var(--brand-signal))" opacity="0.18" /> : null}
            {cols === 1 ? (
              <line
                x1="0"
                x2={PLOT_W}
                y1={y8(columns[0].max)}
                y2={y8(columns[0].max)}
                stroke="hsl(var(--brand-signal))"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <polyline
                points={maxLine}
                fill="none"
                stroke="hsl(var(--brand-signal))"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <line
              x1="0"
              x2={PLOT_W}
              y1={y8(threshold)}
              y2={y8(threshold)}
              stroke="hsl(var(--brand-amber))"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            {active !== null ? (
              <line
                x1={xs[active]}
                x2={xs[active]}
                y1="0"
                y2="100"
                stroke="hsl(var(--brand-bone))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        </div>
        <div />
        <div className="relative mt-2 h-4 font-mono-tight text-[0.625rem] tabular-nums text-[hsl(var(--brand-ash))]" aria-hidden="true">
          {ticks.map((t) => {
            const pos = t === 0 ? "left-0" : t === 1 ? "right-0" : "-translate-x-1/2";
            const hide = t === 0.25 || t === 0.75 ? "hidden sm:block" : "";
            return (
              <span
                key={t}
                className={`absolute ${pos} ${hide}`}
                style={t === 0 || t === 1 ? undefined : { left: `${t * 100}%` }}
              >
                {hexOffset(Math.round(t * size))}
              </span>
            );
          })}
        </div>
      </div>
      <p
        id="plot-readout"
        aria-live="polite"
        className="mt-3 min-h-[2.5rem] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
      >
        {readout}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- histogram */

function ByteHistogram({ histogram, size }: { histogram: Uint32Array; size: number }) {
  const [log, setLog] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const max = useMemo(() => histogram.reduce((m, c) => Math.max(m, c), 0), [histogram]);
  const scale = (c: number) => {
    if (max === 0 || c === 0) return 0;
    return log ? Math.log10(c + 1) / Math.log10(max + 1) : c / max;
  };

  const top = useMemo(
    () =>
      Array.from(histogram, (count, value) => ({ value, count }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count || a.value - b.value)
        .slice(0, 10),
    [histogram],
  );

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setActive(Math.max(0, Math.min(255, Math.floor(((e.clientX - rect.left) / rect.width) * 256))));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const cur = active ?? 0;
    const jump = e.shiftKey ? 16 : 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(255, cur + jump);
    else if (e.key === "ArrowLeft") next = Math.max(0, cur - jump);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 255;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]" aria-hidden="true">
          <span className="inline-block h-3 w-3 rounded-sm bg-[hsl(var(--brand-iron)/0.5)]" />
          Shaded: printable ASCII, 0x20 to 0x7E
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Histogram scale">
          <button type="button" aria-pressed={!log} onClick={() => setLog(false)} className={!log ? CHIP_ON : CHIP_IDLE}>
            Linear
          </button>
          <button type="button" aria-pressed={log} onClick={() => setLog(true)} className={log ? CHIP_ON : CHIP_IDLE} data-testid="button-log-scale">
            Log
          </button>
        </div>
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label={`Byte value histogram, 256 bins, ${log ? "logarithmic" : "linear"} scale. Use the arrow keys to read each value.`}
        aria-describedby="histogram-readout"
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? 0)}
        onBlur={() => setActive(null)}
        data-testid="chart-histogram"
        className="mt-3 h-40 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
      >
        <svg viewBox="0 0 256 100" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
          <rect x="32" y="0" width="95" height="100" fill="hsl(var(--brand-iron))" opacity="0.25" />
          <line x1="0" x2="256" y1="100" y2="100" stroke="hsl(var(--brand-iron))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {Array.from(histogram, (c, i) => {
            const h = scale(c) * 100;
            if (h === 0) return null;
            return (
              <rect
                key={i}
                x={i + 0.1}
                y={100 - h}
                width="0.8"
                height={h}
                fill={active === i ? "hsl(var(--brand-bone))" : "hsl(var(--brand-signal))"}
              />
            );
          })}
        </svg>
      </div>
      <div className="relative mt-2 h-4 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]" aria-hidden="true">
        <span className="absolute left-0">0x00</span>
        <span className="absolute -translate-x-1/2" style={{ left: "25%" }}>0x40</span>
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>0x80</span>
        <span className="absolute -translate-x-1/2" style={{ left: "75%" }}>0xC0</span>
        <span className="absolute right-0">0xFF</span>
      </div>
      <p
        id="histogram-readout"
        aria-live="polite"
        className="mt-3 min-h-[1.5rem] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
      >
        {active !== null
          ? `${byteLabel(active)}: ${dec(histogram[active])} ${pluralise(histogram[active], "time")}, ${percent(histogram[active], size)} of bytes.`
          : "Point at the histogram, or focus it and use the arrow keys, to read a byte value."}
      </p>

      <h3 className={`${LABEL} mt-5`}>Most common byte values</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[300px] border-collapse text-left" data-testid="table-top-bytes">
          <thead>
            <tr className="border-b border-[hsl(var(--brand-iron))]">
              <th scope="col" className={TH_CLASS}>Value</th>
              <th scope="col" className={`${TH_CLASS} text-right`}>Count</th>
              <th scope="col" className={`${TH_CLASS} text-right`}>Share</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.value} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-bone))]">
                  {byteLabel(r.value)}
                </th>
                <td className={TD_NUM}>{dec(r.count)}</td>
                <td className={TD_NUM}>{percent(r.count, size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

interface LoadedFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

export function EntropyAnalyzer() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [pasted, setPasted] = useState("");
  const [mode, setMode] = useState<PasteMode>("text");
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [windowText, setWindowText] = useState("1024");
  const [stepText, setStepText] = useState("256");
  const [threshold, setThreshold] = useState(7.5);
  const [regionLimit, setRegionLimit] = useState(REGION_PAGE);
  const runRef = useRef(0);

  const deferredPaste = useDeferredValue(pasted);
  const deferredThreshold = useDeferredValue(threshold);

  const input = useMemo<{ bytes: Uint8Array | null; error: string | null }>(() => {
    if (file) return { bytes: file.bytes, error: null };
    if (deferredPaste === "") return { bytes: null, error: null };
    if (deferredPaste.length > MAX_PASTE_CHARS) {
      return {
        bytes: null,
        error: `The paste is ${dec(deferredPaste.length)} characters, over the ${formatBytes(MAX_PASTE_CHARS)} limit for pasted text. Save it to a file and choose the file instead.`,
      };
    }
    if (mode === "text") return { bytes: new TextEncoder().encode(deferredPaste), error: null };
    const decoded = mode === "hex" ? decodeHex(deferredPaste) : decodeBase64(deferredPaste);
    return decoded.ok ? { bytes: decoded.bytes, error: null } : { bytes: null, error: decoded.error };
  }, [file, deferredPaste, mode]);

  const bytes = input.bytes && input.bytes.length > 0 ? input.bytes : null;
  const stats = useMemo(() => (bytes ? byteStats(bytes) : null), [bytes]);

  const windowSize = /^\d+$/.test(windowText.trim()) ? Number(windowText.trim()) : NaN;
  const stepSize = /^\d+$/.test(stepText.trim()) ? Number(stepText.trim()) : NaN;
  const check = checkWindow(windowSize, stepSize);

  const sliding = useMemo(
    () => (bytes && check.ok ? slidingEntropy(bytes, windowSize, stepSize) : null),
    [bytes, check.ok, windowSize, stepSize],
  );
  const columns = useMemo(() => (sliding ? downsample(sliding, PLOT_COLUMNS) : []), [sliding]);
  const regions = useMemo(() => (sliding ? highRegions(sliding, deferredThreshold) : []), [sliding, deferredThreshold]);
  const covered = useMemo(() => regions.reduce((sum, r) => sum + (r.end - r.start), 0), [regions]);
  const spread = useMemo(() => {
    if (!sliding || sliding.count < 2) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < sliding.count; k++) {
      const h = sliding.entropy[k];
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return { lo, hi };
  }, [sliding]);

  async function loadFile(f: File) {
    const run = ++runRef.current;
    setReadError(null);
    setBusy(true);
    setRegionLimit(REGION_PAGE);
    try {
      const buffer = await f.slice(0, Math.min(f.size, MAX_FILE_BYTES)).arrayBuffer();
      if (run !== runRef.current) return;
      setFile({ name: f.name, size: f.size, bytes: new Uint8Array(buffer) });
      setPasted("");
    } catch (err) {
      if (run === runRef.current) {
        setFile(null);
        setReadError(`Could not read ${f.name || "the file"}: ${errorText(err)}`);
      }
    } finally {
      if (run === runRef.current) setBusy(false);
    }
  }

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const f = el.files?.[0];
    el.value = "";
    if (f) void loadFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) void loadFile(f);
  }

  function onPaste(value: string) {
    runRef.current++;
    setBusy(false);
    setFile(null);
    setReadError(null);
    setPasted(value);
    setRegionLimit(REGION_PAGE);
  }

  function loadSample(make: () => Uint8Array, name: string) {
    runRef.current++;
    setBusy(false);
    setReadError(null);
    setPasted("");
    const b = make();
    setFile({ name, size: b.length, bytes: b });
    setRegionLimit(REGION_PAGE);
  }

  const alphabet = stats && !file && mode === "text" ? encodedAlphabet(stats.histogram, stats.size) : null;
  const windowCeiling = check.ok ? maxEntropyFor(windowSize) : 0;
  const windowRandom = check.ok ? expectedRandomEntropy(windowSize) : 0;
  const capped = file !== null && file.size > MAX_FILE_BYTES;

  const statusLine = readError
    ? readError
    : busy
      ? "Reading the file."
      : input.error
        ? input.error
        : !stats
          ? "Choose a file or paste data to measure its entropy."
          : `${formatBytes(stats.size)} measured: ${stats.entropy.toFixed(4)} bits per byte overall${
              sliding ? `, ${dec(regions.length)} ${pluralise(regions.length, "region")} at or above ${deferredThreshold.toFixed(2)}` : ""
            }.`;

  let chiReading = "";
  if (stats && stats.size >= 1280) {
    if (stats.entropy >= 7.5 && stats.chiP < 0.01) {
      chiReading =
        "The chi-square test rejects a uniform distribution (p below 0.01). A sound cipher's output should pass it, while deflate, Brotli and most other compressed formats usually fail on anything over a few kilobytes, so this leans toward compression or a structured format. It is a heuristic, not proof.";
    } else if (stats.entropy >= 7.5) {
      chiReading =
        "The chi-square test is consistent with uniform random bytes. Encrypted data, random keys and some very well compressed data look like this.";
    }
  }

  return (
    <ToolShell slug="entropy-analyzer">
      <div className="space-y-6">
        <ToolPanel title="Input">
          <label htmlFor="entropy-file" className="mb-2 block font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
            Choose any file (the first {formatBytes(MAX_FILE_BYTES)} are read)
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="dropzone"
            className={`rounded-xl border border-dashed p-4 transition-colors ${
              dragging
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.06)]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)]"
            }`}
          >
            <input
              id="entropy-file"
              type="file"
              onChange={onFileChosen}
              data-testid="input-entropy-file"
              className="block min-h-[44px] w-full cursor-pointer font-mono-tight text-sm text-[hsl(var(--brand-bone))] file:mr-4 file:min-h-[44px] file:cursor-pointer file:rounded-lg file:border file:border-[hsl(var(--brand-iron))] file:bg-transparent file:px-4 file:font-mono-tight file:text-xs file:uppercase file:tracking-[0.18em] file:text-[hsl(var(--brand-bone))]"
            />
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Or drop a file here. Firmware images, executables, archives, memory dumps and disk images all work.
            </p>
          </div>

          <fieldset className="mt-5">
            <legend className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">Or paste data, read as</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PASTE_MODES.map((m) => (
                <label key={m.key} className={`${mode === m.key ? CHIP_ON : CHIP_IDLE} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]`}>
                  <input
                    type="radio"
                    name="paste-mode"
                    value={m.key}
                    checked={mode === m.key}
                    onChange={() => setMode(m.key)}
                    className="sr-only"
                    data-testid={`radio-mode-${m.key}`}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="entropy-paste" className="sr-only">
            Data to measure
          </label>
          <textarea
            id="entropy-paste"
            value={pasted}
            onChange={(e) => onPaste(e.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={mode === "hex" ? "de ad be ef 00 11 22 33" : mode === "base64" ? "U29tZSBkYXRhIGhlcmU=" : "Paste any text"}
            aria-invalid={input.error !== null}
            aria-describedby={input.error ? "entropy-paste-error" : undefined}
            data-testid="input-entropy"
            className="mt-3 w-full resize-y break-all rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
          />
          {input.error && !file ? (
            <p
              id="entropy-paste-error"
              role="alert"
              data-testid="text-input-error"
              className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
            >
              {input.error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">Try</span>
            {SAMPLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => loadSample(s.make, `sample-${s.key}.bin`)}
                data-testid={`button-sample-${s.key}`}
                className={CHIP_IDLE}
              >
                {s.label}
              </button>
            ))}
            {file || pasted ? (
              <button type="button" onClick={() => onPaste("")} data-testid="button-clear" className={CHIP_IDLE}>
                Clear
              </button>
            ) : null}
            {busy ? <span className="font-mono-tight text-xs text-[hsl(var(--brand-cyan))]">Reading file</span> : null}
          </div>

          {readError ? (
            <p role="alert" className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
              {readError}
            </p>
          ) : null}
          {file ? (
            <p className="mt-4 break-all font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              <span className="text-[hsl(var(--brand-bone))]">{file.name || "(no name)"}</span>, {formatBytes(file.size)}.
            </p>
          ) : null}
          {capped && file ? (
            <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
              Only the first {formatBytes(MAX_FILE_BYTES)} were read. Every figure below describes offsets 0x0 to{" "}
              {hexOffset(MAX_FILE_BYTES - 1)}, not the whole {formatBytes(file.size)}.
            </p>
          ) : null}
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {statusLine}
        </p>

        {stats ? (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Whole input">
                <div data-testid="output-entropy">
                  <ToolResult label="Size" value={`${dec(stats.size)} ${pluralise(stats.size, "byte")}`} />
                  <ToolResult label="Entropy" value={`${stats.entropy.toFixed(4)} bits per byte`} testId="text-entropy" />
                  <ToolResult
                    label="Ceiling at this size"
                    value={`${stats.maxPossible.toFixed(4)} (${percent(stats.entropy, stats.maxPossible || 1)} reached)`}
                  />
                  {stats.size > 1 ? (
                    <ToolResult label="Random data this long" value={`about ${stats.randomExpected.toFixed(4)}`} />
                  ) : null}
                  <ToolResult
                    label="Distinct byte values"
                    value={`${stats.distinct} of 256 (ceiling ${maxEntropyFor(stats.distinct).toFixed(2)} with these)`}
                  />
                  <ToolResult
                    label="Chi-square, 255 df"
                    value={
                      stats.size >= 1280
                        ? `${stats.chiSquare.toFixed(2)}, p = ${formatP(stats.chiP)}`
                        : `${stats.chiSquare.toFixed(2)} (under 1,280 bytes, too few to test)`
                    }
                    testId="text-chi-square"
                  />
                  <ToolResult label="Mean byte value" value={`${stats.mean.toFixed(4)} (127.5 if uniform)`} />
                  <ToolResult
                    label="Serial correlation"
                    value={
                      stats.serialCorrelation === null
                        ? stats.size < 2
                          ? "undefined: needs at least 2 bytes"
                          : "undefined: every byte is the same"
                        : `${stats.serialCorrelation.toFixed(6)} (near 0 if uncorrelated)`
                    }
                  />
                  <ToolResult
                    label="Order-0 coding bound"
                    value={`${formatBytes(Math.ceil((stats.size * stats.entropy) / 8))} (${percent(stats.entropy, 8)} of the input)`}
                  />
                </div>
              </ToolPanel>

              <ToolPanel title="Reading">
                <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone))]" data-testid="text-reading">
                  {describeEntropy(stats.entropy)}
                </p>
                <ul className="mt-4 space-y-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {stats.size < 256 ? (
                    <li>
                      With {dec(stats.size)} {pluralise(stats.size, "byte")}, 8 bits per byte is out of reach: even if every byte
                      were different, the ceiling is log2({dec(stats.size)}) = {stats.maxPossible.toFixed(2)}.
                    </li>
                  ) : null}
                  {alphabet === "hex" ? (
                    <li className="text-[hsl(var(--brand-amber))]">
                      Every byte is a hex digit or whitespace. A hex digit carries 4 bits, so this reading describes the
                      encoding more than the data. Read the paste as Hex to measure the bytes it spells out.
                    </li>
                  ) : null}
                  {alphabet === "base64" ? (
                    <li className="text-[hsl(var(--brand-amber))]">
                      Every byte falls in the Base64 alphabet. A Base64 character carries 6 bits, so if this is Base64 the
                      reading is held near 6 by the encoding. Read the paste as Base64 to measure the decoded bytes.
                    </li>
                  ) : null}
                  {spread && spread.hi - spread.lo >= 2 ? (
                    <li>
                      The windows range from {spread.lo.toFixed(2)} to {spread.hi.toFixed(2)}, so this input mixes regions of
                      different kinds and the whole-input figure is an average of them. The sliding window plot shows where each
                      one sits.
                    </li>
                  ) : null}
                  {chiReading ? <li>{chiReading}</li> : null}
                  <li>
                    Rough bands: plain text and source code usually measure 4 to 5, executable code 5 to 6.5, and compressed
                    or encrypted data above 7.9 once there are a few kilobytes of it.
                  </li>
                </ul>
              </ToolPanel>
            </div>

            <ToolPanel title="Sliding window">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="entropy-window" className={LABEL}>
                    Window, bytes
                  </label>
                  <input
                    id="entropy-window"
                    inputMode="numeric"
                    value={windowText}
                    onChange={(e) => {
                      setWindowText(e.target.value);
                      setRegionLimit(REGION_PAGE);
                    }}
                    aria-invalid={!check.ok}
                    aria-describedby="entropy-window-help"
                    data-testid="input-window"
                    className={INPUT_CLASS}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WINDOW_PRESETS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setWindowText(String(w));
                          setStepText(String(w / 4));
                          setRegionLimit(REGION_PAGE);
                        }}
                        className={windowSize === w ? CHIP_ON : CHIP_IDLE}
                      >
                        {w >= 1024 ? `${w / 1024} KiB` : w}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="entropy-step" className={LABEL}>
                    Step, bytes
                  </label>
                  <input
                    id="entropy-step"
                    inputMode="numeric"
                    value={stepText}
                    onChange={(e) => {
                      setStepText(e.target.value);
                      setRegionLimit(REGION_PAGE);
                    }}
                    aria-invalid={!check.ok}
                    aria-describedby="entropy-window-help"
                    data-testid="input-step"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="entropy-threshold" className={LABEL}>
                    Threshold: <span className="text-[hsl(var(--brand-signal))]">{threshold.toFixed(2)}</span> bits per byte
                  </label>
                  <input
                    id="entropy-threshold"
                    type="range"
                    min={0}
                    max={8}
                    step={0.05}
                    value={threshold}
                    onChange={(e) => {
                      setThreshold(Number(e.target.value));
                      setRegionLimit(REGION_PAGE);
                    }}
                    data-testid="input-threshold"
                    className="range-slider mt-3 w-full"
                  />
                  <div className="flex justify-between font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                    <span>0</span>
                    <span>8</span>
                  </div>
                </div>
              </div>
              <p
                id="entropy-window-help"
                role={check.ok ? undefined : "alert"}
                className={`mt-3 font-mono-tight text-xs leading-relaxed ${check.ok ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-danger))]"}`}
              >
                {check.ok
                  ? `A ${dec(windowSize)} byte window tops out at ${windowCeiling.toFixed(2)}, and random data in a window that size averages ${windowRandom.toFixed(2)}, not 8. Window ${MIN_WINDOW} to ${dec(MAX_WINDOW)}, step 1 to the window size.`
                  : check.error}
              </p>
              {sliding?.stepRaised ? (
                <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                  A step of {dec(sliding.requestedStep)} would need more than {dec(MAX_WINDOWS)} windows, so the step was raised
                  to {dec(sliding.step)}.
                  {sliding.gaps
                    ? ` That is larger than the window, so ${dec(sliding.uncovered)} ${pluralise(sliding.uncovered, "byte")} (${percent(
                        sliding.uncovered,
                        stats.size,
                      )}) fall between windows and are not measured. Use a larger window to cover them.`
                    : ""}
                </p>
              ) : null}

              {sliding && sliding.count > 0 ? (
                <div className="mt-5">
                  <EntropyPlot
                    sliding={sliding}
                    columns={columns}
                    regions={regions}
                    threshold={deferredThreshold}
                    size={stats.size}
                  />
                </div>
              ) : null}
            </ToolPanel>

            {sliding ? (
              <ToolPanel title="Regions at or above the threshold">
                {regions.length === 0 ? (
                  <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="text-no-regions">
                    No window reaches {deferredThreshold.toFixed(2)} bits per byte. Lower the threshold to find the densest parts.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {dec(regions.length)} {pluralise(regions.length, "region")} covering {formatBytes(covered)} ({percent(covered, stats.size)}{" "}
                      of the input). Overlapping and touching windows are merged. End offsets are inclusive.
                      {regions.length > MAX_REGIONS_LISTED ? ` The first ${dec(MAX_REGIONS_LISTED)} can be listed.` : ""}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-left" data-testid="table-regions">
                        <thead>
                          <tr className="border-b border-[hsl(var(--brand-iron))]">
                            <th scope="col" className={TH_CLASS}>Start</th>
                            <th scope="col" className={TH_CLASS}>End</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Length</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Windows</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Peak</th>
                            <th scope="col" className={`${TH_CLASS} text-right`}>Mean</th>
                          </tr>
                        </thead>
                        <tbody>
                          {regions.slice(0, Math.min(regionLimit, MAX_REGIONS_LISTED)).map((r) => (
                            <tr key={r.start} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                              <th scope="row" className="py-2 pr-4 text-left font-mono-tight text-xs font-normal text-[hsl(var(--brand-signal))]">
                                {hexOffset(r.start)}
                                <span className="block text-[hsl(var(--brand-ash))]">{dec(r.start)}</span>
                              </th>
                              <td className="py-2 pr-4 font-mono-tight text-xs text-[hsl(var(--brand-bone))]">
                                {hexOffset(r.end - 1)}
                                <span className="block text-[hsl(var(--brand-ash))]">{dec(r.end - 1)}</span>
                              </td>
                              <td className={TD_NUM}>{formatBytes(r.end - r.start)}</td>
                              <td className={TD_NUM}>{dec(r.windows)}</td>
                              <td className={TD_NUM}>{r.max.toFixed(4)}</td>
                              <td className={TD_NUM}>{r.mean.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {Math.min(regions.length, MAX_REGIONS_LISTED) > regionLimit ? (
                      <button
                        type="button"
                        onClick={() => setRegionLimit((n) => n + REGION_PAGE)}
                        className={`${CHIP_IDLE} mt-4`}
                      >
                        Show {dec(Math.min(REGION_PAGE, Math.min(regions.length, MAX_REGIONS_LISTED) - regionLimit))} more
                      </button>
                    ) : null}
                  </>
                )}
              </ToolPanel>
            ) : null}

            <ToolPanel title="Byte histogram">
              <ByteHistogram histogram={stats.histogram} size={stats.size} />
            </ToolPanel>
          </>
        ) : null}
      </div>
    </ToolShell>
  );
}
