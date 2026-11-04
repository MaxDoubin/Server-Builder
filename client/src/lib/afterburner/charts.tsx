/**
 * The charts on /afterburner, drawn as inline SVG.
 *
 * Each one measures its own width and draws at that width, one SVG unit to a
 * pixel, so its type stays at the size the stylesheet sets instead of
 * shrinking with the drawing on a phone. Type is set in rem through classes,
 * which keeps the reader's text size preference in charge of it.
 *
 * Color comes only from the brand tokens, so the light theme repaints every
 * mark. The accent and the danger tone sit close together for a reader with
 * a red-green deficiency in the light theme, so neither carries meaning
 * alone: a failing mark is also a cross rather than a dot, and every row says
 * pass or fail in words. Every chart has its table beside it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

/* -------------------------------------------------------------- plumbing */

/** The element's width in pixels, and the root font size the rem classes resolve against. */
function useChartBox(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: fallback, rem: 16 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const width = Math.max(240, Math.round(el.getBoundingClientRect().width));
      setBox((old) => (old.width === width && old.rem === rem ? old : { width, rem }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...box };
}

/** Rough width of monospaced text at a size in rem. JetBrains Mono is 0.6em a glyph. */
const textWidth = (text: string, sizeRem: number, rem: number) => text.length * 0.6 * sizeRem * rem;

/** Greedy word wrap to a width, so a long label takes two lines instead of running off the card. */
function wrap(text: string, width: number, sizeRem: number, rem: number): string[] {
  const perLine = Math.max(8, Math.floor(width / (0.6 * sizeRem * rem)));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > perLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Tick labels along the bottom. The one at each edge is anchored inward so it
 * stays on the card, and the last one carries the unit, so no separate unit
 * label has to share the row with it.
 */
function Ticks({
  ticks,
  x,
  y,
  unit,
  left,
  right,
  rem,
}: {
  ticks: number[];
  x: (v: number) => number;
  y: number;
  unit: string;
  left: number;
  right: number;
  rem: number;
}) {
  // Laid out from the right, so the label carrying the unit always survives,
  // and any label that would touch the one beside it is left out.
  const kept: Array<{ t: number; at: number; text: string; anchor: "start" | "middle" | "end" }> = [];
  let limit = Infinity;
  for (let i = ticks.length - 1; i >= 0; i -= 1) {
    const at = x(ticks[i]);
    const text = i === ticks.length - 1 ? `${fmt(ticks[i])} ${unit}` : fmt(ticks[i]);
    const full = textWidth(text, 0.625, rem);
    const anchor = at - full / 2 < left ? "start" : at + full / 2 > right ? "end" : "middle";
    const from = anchor === "start" ? at : anchor === "end" ? at - full : at - full / 2;
    if (from + full + 0.4 * rem > limit) continue;
    kept.push({ t: ticks[i], at, text, anchor });
    limit = from;
  }
  return (
    <>
      {kept.map(({ t, at, text, anchor }) => (
        <text key={t} x={at} y={y} textAnchor={anchor} className={TICK}>
          {text}
        </text>
      ))}
    </>
  );
}

export type Tone = "accent" | "muted" | "danger";

const FILL: Record<Tone, string> = {
  accent: "fill-[hsl(var(--brand-signal))]",
  muted: "fill-[hsl(var(--brand-ash))]",
  danger: "fill-[hsl(var(--brand-danger))]",
};
const FILL_SOFT: Record<Tone, string> = {
  accent: "fill-[hsl(var(--brand-signal)/0.35)]",
  muted: "fill-[hsl(var(--brand-ash)/0.35)]",
  danger: "fill-[hsl(var(--brand-danger)/0.3)]",
};
const STROKE: Record<Tone, string> = {
  accent: "stroke-[hsl(var(--brand-signal))]",
  muted: "stroke-[hsl(var(--brand-ash))]",
  danger: "stroke-[hsl(var(--brand-danger))]",
};

/*
  Labels and values carry a halo in the card's own color, so a gridline or the
  real-time line passing behind a word stops at its edges instead of striking
  through it. The card is solid graphite for the same reason: a halo only
  disappears against the exact color it was painted in.
*/
const HALO = "stroke-[hsl(var(--brand-graphite))]";
const HALO_PROPS = { paintOrder: "stroke", strokeWidth: 4, strokeLinejoin: "round" } as const;
const LABEL = `fill-[hsl(var(--brand-bone-dim))] ${HALO} font-mono-tight text-[0.6875rem]`;
const VALUE = `fill-[hsl(var(--brand-bone))] ${HALO} font-mono-tight text-[0.6875rem]`;
const TICK = "fill-[hsl(var(--brand-ash))] font-mono-tight text-[0.625rem]";
const GRID = "stroke-[hsl(var(--brand-iron))]";

/*
  The halo stops a line at the edge of each glyph, but a line still shows in
  the gaps between words. Row labels and values that a gridline or the
  real-time line can cross also sit on a plate of the card's color, sized
  from the monospaced width, so the line breaks cleanly around the whole
  label.
*/
const PLATE = "fill-[hsl(var(--brand-graphite))]";

function PlatedText({
  x,
  y,
  text,
  rem,
  className,
  anchor = "start",
  dominantBaseline,
}: {
  x: number;
  y: number;
  text: string;
  rem: number;
  className: string;
  anchor?: "start" | "middle" | "end";
  dominantBaseline?: "central";
}) {
  const size = 0.6875 * rem;
  const pad = 0.25 * rem;
  const w = textWidth(text, 0.6875, rem) + 2 * pad;
  const left = anchor === "start" ? x - pad : anchor === "end" ? x - w + pad : x - w / 2;
  // A central baseline puts the glyphs' middle on y; an alphabetic one puts their foot there.
  const top = dominantBaseline === "central" ? y - 0.6 * size : y - 0.9 * size;
  return (
    <>
      <rect x={left} y={top} width={w} height={1.2 * size} rx={2} className={PLATE} />
      <text x={x} y={y} textAnchor={anchor} dominantBaseline={dominantBaseline} className={className} {...HALO_PROPS}>
        {text}
      </text>
    </>
  );
}

const fmt = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: value < 10 ? 2 : 1 });

/**
 * A chart and everything that makes it readable without the picture: a
 * caption, and a table of the same numbers behind a disclosure.
 */
export function ChartFigure({
  caption,
  table,
  children,
}: {
  caption: ReactNode;
  table?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="mt-5 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite))] p-4 sm:p-5">
      {children}
      <figcaption className="mt-3 font-mono-tight text-[0.71875rem] leading-relaxed text-[hsl(var(--brand-ash))]">
        {caption}
      </figcaption>
      {table ? (
        <details className="mt-3">
          <summary className="tap-target inline-block cursor-pointer font-mono-tight text-[0.71875rem] text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline">
            The numbers as a table
          </summary>
          <div className="mt-2">{table}</div>
        </details>
      ) : null}
    </figure>
  );
}

/** A plain table in its own horizontal scroller, so a wide one never pushes the page sideways. */
export function DataTable({
  label,
  head,
  rows,
}: {
  label: string;
  head: string[];
  rows: ReactNode[][];
}) {
  // A table of short cells fits a phone as it is; one with sentences in it gets a floor and scrolls.
  // Two columns always fit: the second wraps. Three or more with a sentence in them do not.
  const wide = head.length >= 4 || (head.length >= 3 && rows.some((row) => row.some((cell) => typeof cell === "string" && cell.length > 40)));
  return (
    <div
      className="overflow-x-auto rounded-lg border border-[hsl(var(--brand-iron))]"
      tabIndex={0}
      role="region"
      aria-label={`${label}, scrollable`}
    >
      <table className={`w-full ${wide ? "min-w-[34rem]" : "min-w-full"} border-collapse text-left font-mono-tight text-[0.71875rem] leading-relaxed`}>
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-carbon)/0.5)]">
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-3 py-2 font-medium text-[hsl(var(--brand-bone))]">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-[hsl(var(--brand-iron)/0.6)] last:border-b-0">
              {row.map((cell, c) =>
                c === 0 ? (
                  <th key={c} scope="row" className="px-3 py-2 align-top font-normal text-[hsl(var(--brand-bone))]">
                    {cell}
                  </th>
                ) : (
                  <td key={c} className="px-3 py-2 align-top tabular-nums text-[hsl(var(--brand-bone-dim))]">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

export interface BarRow {
  key: string;
  label: string;
  /** One value, or a span drawn solid to its low end and lighter to its high end. */
  value: number | { lo: number; hi: number };
  display: string;
  tone?: Tone;
}

/**
 * One bar per row, every bar from one zero baseline.
 *
 * The label sits on its own line above the bar rather than beside it, which
 * is what lets the same chart work at 360 pixels and at 1040: nothing has to
 * share a line with a bar except the bar's own value.
 */
export function BarChart({
  label,
  rows,
  max,
  ticks,
  unit,
}: {
  label: string;
  rows: BarRow[];
  max: number;
  ticks: number[];
  unit: string;
}) {
  const { ref, width, rem } = useChartBox();
  const axis = 1.5 * rem;
  const left = 2;
  const lineHeight = 1.05 * rem;
  const thick = Math.min(14, 0.75 * rem);
  const gutter = Math.max(...rows.map((row) => textWidth(row.display, 0.6875, rem))) + 0.75 * rem;
  const plot = Math.max(40, width - left - gutter);
  const x = (v: number) => left + (Math.min(Math.max(v, 0), max) / max) * plot;
  let cursor = 0;
  const placed = rows.map((row) => {
    const lines = wrap(row.label, width - left, 0.6875, rem);
    const top = cursor;
    const barY = top + lines.length * lineHeight + 0.3 * rem;
    cursor = barY + thick + 0.65 * rem;
    return { row, lines, top, barY };
  });
  const bottom = cursor;
  const height = bottom + axis;

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={label}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={bottom} className={GRID} strokeWidth={1} />
        ))}
        <Ticks ticks={ticks} x={x} y={bottom + 0.95 * rem} unit={unit} left={0} right={width} rem={rem} />
        {placed.map(({ row, lines, top, barY }) => {
          const lo = typeof row.value === "number" ? row.value : row.value.lo;
          const hi = typeof row.value === "number" ? row.value : row.value.hi;
          const tone = row.tone ?? "accent";
          return (
            <g key={row.key}>
              <title>{`${row.label}: ${row.display}`}</title>
              {lines.map((line, i) => (
                <PlatedText key={i} x={left} y={top + (i + 1) * lineHeight - 0.2 * rem} text={line} rem={rem} className={LABEL} />
              ))}
              <path d={barPath(left, barY, Math.max(2, x(lo) - left), thick, hi > lo ? 0 : 3)} className={FILL[tone]} />
              {hi > lo ? (
                <path d={barPath(x(lo), barY, Math.max(2, x(hi) - x(lo)), thick, 3)} className={FILL_SOFT[tone]} />
              ) : null}
              <PlatedText x={x(hi) + 0.4 * rem} y={barY + thick / 2} dominantBaseline="central" text={row.display} rem={rem} className={VALUE} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A bar with a square base and a rounded data end. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2);
  return [
    `M${x},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h - radius}`,
    `Q${x + w},${y + h} ${x + w - radius},${y + h}`,
    `H${x}`,
    "Z",
  ].join(" ");
}

/* --------------------------------------------- frames per second, per row */

export interface FpsMark {
  value: number;
  /** A filled dot, an open ring, or a cross for a stream that missed real time. */
  shape: "dot" | "ring" | "cross";
  tone: Tone;
  name: string;
}

export interface FpsRow {
  key: string;
  label: string;
  summary: string;
  marks: FpsMark[];
  /** A min to max span drawn under the marks. */
  span?: { lo: number; hi: number; tone: Tone };
}

export interface LegendItem {
  shape: FpsMark["shape"] | "span";
  tone: Tone;
  text: string;
}

/**
 * Rates on one axis against the 24 fps line.
 *
 * The axis does not start at zero, and does not need to: nothing here is a
 * length to compare. Each mark is a position against a threshold, and the
 * threshold is the subject.
 */
export function FpsChart({
  label,
  rows,
  domain,
  ticks,
  line,
  legend,
}: {
  label: string;
  rows: FpsRow[];
  domain: [number, number];
  ticks: number[];
  line: number;
  legend?: LegendItem[];
}) {
  const { ref, width, rem } = useChartBox();
  const head = 1.4 * rem;
  const axis = 1.5 * rem;
  const left = 0.5 * rem;
  const right = 0.5 * rem;
  const lineHeight = 1.05 * rem;
  const plot = Math.max(40, width - left - right);
  const x = (v: number) => left + ((v - domain[0]) / (domain[1] - domain[0])) * plot;
  const r = Math.max(4, 0.3 * rem);
  let cursor = head;
  const placed = rows.map((row) => {
    // The summary shares the label's line when both fit, and takes its own line when they do not.
    const together = textWidth(row.label, 0.6875, rem) + textWidth(row.summary, 0.6875, rem) + rem <= plot;
    const lines = together ? [row.label] : wrap(row.label, plot, 0.6875, rem);
    const top = cursor;
    const summaryY = top + (together ? 1 : lines.length + 1) * lineHeight - 0.2 * rem;
    const track = summaryY + 0.2 * rem + 0.85 * rem;
    cursor = track + 0.95 * rem;
    return { row, lines, top, summaryY, track };
  });
  const bottom = cursor;
  const height = bottom + axis;
  const lineX = x(line);
  const lineLabelLeft = lineX > left + plot * 0.6;

  return (
    <div ref={ref} className="w-full">
      {legend ? <Legend items={legend} /> : null}
      <svg
        role="img"
        aria-label={label}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={head} y2={bottom} className={GRID} strokeWidth={1} />
        ))}
        <Ticks ticks={ticks} x={x} y={bottom + 0.95 * rem} unit="fps" left={0} right={width} rem={rem} />
        <line
          x1={lineX}
          x2={lineX}
          y1={head - 0.2 * rem}
          y2={bottom}
          className="stroke-[hsl(var(--brand-bone)/0.75)]"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={lineX + (lineLabelLeft ? -0.35 * rem : 0.35 * rem)}
          y={head - 0.45 * rem}
          textAnchor={lineLabelLeft ? "end" : "start"}
          className={VALUE} {...HALO_PROPS}
        >
          {`${line} fps, real time`}
        </text>
        {placed.map(({ row, lines, top, summaryY, track }) => (
          <g key={row.key}>
            <title>{`${row.label}: ${row.summary}`}</title>
            {lines.map((text, i) => (
              <PlatedText key={i} x={left} y={top + (i + 1) * lineHeight - 0.2 * rem} text={text} rem={rem} className={LABEL} />
            ))}
            <PlatedText x={left + plot} y={summaryY} anchor="end" text={row.summary} rem={rem} className={VALUE} />
            {row.span ? (
              <rect
                x={x(row.span.lo)}
                y={track - r * 0.6}
                width={Math.max(2, x(row.span.hi) - x(row.span.lo))}
                height={r * 1.2}
                rx={r * 0.6}
                className={FILL_SOFT[row.span.tone]}
              />
            ) : null}
            {row.marks.length === 2 ? (
              <line
                x1={x(row.marks[0].value)}
                x2={x(row.marks[1].value)}
                y1={track}
                y2={track}
                className={STROKE.muted}
                strokeWidth={2}
              />
            ) : null}
            {row.marks.map((mark) => (
              <Mark key={mark.name} cx={x(mark.value)} cy={track} r={r} mark={mark} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function Mark({ cx, cy, r, mark }: { cx: number; cy: number; r: number; mark: FpsMark }) {
  if (mark.shape === "cross") {
    const d = r * 0.95;
    return (
      <g>
        <title>{`${mark.name}: ${fmt(mark.value)} fps`}</title>
        <path
          d={`M${cx - d},${cy - d} L${cx + d},${cy + d} M${cx - d},${cy + d} L${cx + d},${cy - d}`}
          className={STROKE[mark.tone]}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </g>
    );
  }
  return (
    <g>
      <title>{`${mark.name}: ${fmt(mark.value)} fps`}</title>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className={
          mark.shape === "ring"
            ? `fill-[hsl(var(--brand-graphite))] ${STROKE[mark.tone]}`
            : `${FILL[mark.tone]} stroke-[hsl(var(--brand-graphite))]`
        }
        strokeWidth={2}
      />
    </g>
  );
}

/** A legend in HTML, so it wraps on a phone instead of running off the drawing. */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <li key={item.text} className="flex items-center gap-2 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]">
          <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" className="shrink-0">
            {item.shape === "span" ? (
              <rect x="1" y="3.5" width="14" height="5" rx="2.5" className={FILL_SOFT[item.tone]} />
            ) : item.shape === "cross" ? (
              <path d="M4,2 L12,10 M4,10 L12,2" className={STROKE[item.tone]} strokeWidth={2.5} strokeLinecap="round" />
            ) : (
              <circle
                cx="8"
                cy="6"
                r="4.5"
                className={item.shape === "ring" ? `fill-none ${STROKE[item.tone]}` : FILL[item.tone]}
                strokeWidth={2}
              />
            )}
          </svg>
          {item.text}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------- the concurrency sweep, 3.3 */

/**
 * Per-session decode time against the number of concurrent sessions.
 *
 * The report prints only the two ends of the 1 to 9 range, so that stretch is
 * drawn as a straight line between two marked points and labeled as such,
 * rather than as a curve through points nobody measured. 11 to 13 is a band,
 * because the report gives a span for the three of them, not one value each.
 */
export function SweepChart({
  label,
  smooth,
  cliff,
  plateau,
}: {
  label: string;
  smooth: { fromN: number; toN: number; fromSeconds: number; toSeconds: number };
  cliff: { n: number; seconds: number };
  plateau: { fromN: number; toN: number; seconds: { lo: number; hi: number } };
}) {
  const { ref, width, rem } = useChartBox();
  const height = 15 * rem;
  const left = 2.2 * rem;
  const right = 0.75 * rem;
  const top = 0.8 * rem;
  const axis = 2.2 * rem;
  const plot = Math.max(40, width - left - right);
  const bottom = height - axis;
  const nMax = plateau.toN;
  const sMax = 4;
  const x = (n: number) => left + ((n - 1) / (nMax - 1)) * plot;
  const y = (s: number) => bottom - (s / sMax) * (bottom - top);
  const r = Math.max(4, 0.3 * rem);
  // On a phone a session is under 28 pixels wide, and 10 and 11 would touch; 10 is the one that matters.
  const nTicks = plot / (nMax - 1) < 28 ? [1, 3, 5, 7, 9, 10, 13] : [1, 3, 5, 7, 9, 10, 11, 13];
  const sTicks = [0, 1, 2, 3, 4];

  return (
    <div ref={ref} className="w-full">
      <svg
        role="img"
        aria-label={label}
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
      >
        {sTicks.map((s) => (
          <g key={`s${s}`}>
            <line x1={left} x2={left + plot} y1={y(s)} y2={y(s)} className={GRID} strokeWidth={1} />
            <text x={left - 0.4 * rem} y={y(s)} textAnchor="end" dominantBaseline="central" className={TICK}>
              {`${s} s`}
            </text>
          </g>
        ))}
        {nTicks.map((n) => (
          <text key={`n${n}`} x={x(n)} y={bottom + 1 * rem} textAnchor="middle" className={TICK}>
            {n}
          </text>
        ))}
        <text x={left + plot} y={height - 0.1 * rem} textAnchor="end" className={TICK}>
          concurrent sessions
        </text>

        {/* 11 to 13: a span, not three points */}
        <g>
          <title>{`${plateau.fromN} to ${plateau.toN} sessions: ${plateau.seconds.lo} to ${plateau.seconds.hi} s each`}</title>
          <rect
            x={x(plateau.fromN) - r}
            y={y(plateau.seconds.hi)}
            width={x(plateau.toN) - x(plateau.fromN) + 2 * r}
            height={y(plateau.seconds.lo) - y(plateau.seconds.hi)}
            rx={3}
            className={FILL_SOFT.danger}
          />
        </g>
        <text x={x(plateau.toN) + r} y={y(plateau.seconds.hi) - 0.45 * rem} textAnchor="end" className={VALUE} {...HALO_PROPS}>
          {`${plateau.seconds.lo} to ${plateau.seconds.hi} s`}
        </text>

        {/* 1 to 9: only the ends were printed */}
        <line
          x1={x(smooth.fromN)}
          x2={x(smooth.toN)}
          y1={y(smooth.fromSeconds)}
          y2={y(smooth.toSeconds)}
          className={STROKE.accent}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <line
          x1={x(smooth.toN)}
          x2={x(cliff.n)}
          y1={y(smooth.toSeconds)}
          y2={y(cliff.seconds)}
          className={STROKE.danger}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Point cx={x(smooth.fromN)} cy={y(smooth.fromSeconds)} r={r} tone="accent" title={`${smooth.fromN} session: ${smooth.fromSeconds} s`} />
        <Point cx={x(smooth.toN)} cy={y(smooth.toSeconds)} r={r} tone="accent" title={`${smooth.toN} sessions: ${smooth.toSeconds} s`} />
        <Point cx={x(cliff.n)} cy={y(cliff.seconds)} r={r} tone="danger" title={`${cliff.n} sessions: ${cliff.seconds} s`} />
        <text x={x(smooth.fromN)} y={y(smooth.fromSeconds) - 0.7 * rem} className={VALUE} {...HALO_PROPS}>
          {`${smooth.fromSeconds} s`}
        </text>
        <text x={x(smooth.toN) - 0.5 * rem} y={y(smooth.toSeconds) - 0.7 * rem} textAnchor="end" className={VALUE} {...HALO_PROPS}>
          {`${smooth.toSeconds} s`}
        </text>
        <text x={x(cliff.n) - 0.5 * rem} y={y(cliff.seconds) - 0.2 * rem} textAnchor="end" className={VALUE} {...HALO_PROPS}>
          {`${cliff.seconds} s`}
        </text>
      </svg>
    </div>
  );
}

function Point({ cx, cy, r, tone, title }: { cx: number; cy: number; r: number; tone: Tone; title: string }) {
  return (
    <g>
      <title>{title}</title>
      <circle cx={cx} cy={cy} r={r} className={`${FILL[tone]} stroke-[hsl(var(--brand-graphite))]`} strokeWidth={2} />
    </g>
  );
}
