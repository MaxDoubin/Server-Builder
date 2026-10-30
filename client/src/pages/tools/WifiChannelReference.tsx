/**
 * Wi-Fi channel reference.
 *
 * An interactive chart of the 2.4, 5 and 6 GHz channel plans. 2.4 GHz is
 * drawn to scale as overlapping arcs, because overlap is the whole story
 * there. 5 and 6 GHz are drawn as a grid of 20 MHz slots with the bonded
 * 40, 80, 160 and 320 MHz channels underneath, because in those bands the
 * channels sit side by side and the question is which ones combine.
 *
 * Every number on the page comes from lib/toolkit/wifi-channel-reference,
 * which holds the US FCC plan and the 802.11 channel formulas.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BANDS,
  BAND_LABEL,
  BAND_WIDTHS,
  MAX_LOOKUP_LENGTH,
  PSC,
  SUBBANDS,
  bondedChannels,
  bondedNotes,
  centerFrequency,
  channelNotes,
  channels,
  containing,
  findBonded,
  formulaText,
  getChannel,
  ht40Notes,
  ht40Options,
  overlapping24,
  overlappingRange24,
  parseLookup,
  type Band,
  type Bonded,
  type Channel20,
  type Mask,
  type RegNotes,
  type Width,
} from "@/lib/toolkit/wifi-channel-reference";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ state */

interface Sel {
  width: Width;
  /** 20 MHz channel, bonded center, or (2.4 GHz HT40) the primary. */
  channel: number;
  ht40: "above" | "below" | null;
}

const DEFAULT_SEL: Record<Band, Sel> = {
  "2.4": { width: 20, channel: 6, ht40: null },
  "5": { width: 20, channel: 36, ht40: null },
  "6": { width: 20, channel: 37, ht40: null },
};

const BAND_SUMMARY: Record<Band, string> = {
  "2.4":
    "Channels 1 to 13 are 5 MHz apart, from 2412 to 2472 MHz; channel 14 sits alone at 2484 MHz. A 20 MHz signal spans four channel steps, so neighbors overlap. US equipment uses 1 to 11.",
  "5": "28 channels at 20 MHz in the US: 25 in UNII-1 to UNII-3 and 3 in UNII-4. 16 of them need DFS. 5350 to 5470 MHz (UNII-2B) has no Wi-Fi channels.",
  "6": `59 channels at 20 MHz from 5925 to 7125 MHz, with no DFS. ${PSC.length} preferred scanning channels: 5, 21, 37 and every sixteenth channel after. Wi-Fi Alliance certification requires WPA3 or Enhanced Open in this band. 802.11ax also defines a lone channel 2 at 5935 MHz, not shown.`,
};

/**
 * 6 GHz is drawn in two halves so each fits a desktop panel. The split at
 * 125 / 129 is the boundary of the first two 320 MHz channels in set 1, so
 * only one block (320 MHz channel 127, set 2) crosses it.
 */
const SIX_HALVES = [
  { lo: 1, hi: 125 },
  { lo: 129, hi: 233 },
];

/* ----------------------------------------------------------------- styles */

const LABEL = "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";

const pillClass = (active: boolean) => `inline-flex min-h-[44px] items-center rounded-full border px-5 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] transition-colors ${FOCUS} ${
  active
    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
}`;

type CellState = "selected" | "member" | "overlap" | "plain";

function cellClass(state: CellState, opts: { dfs?: boolean; unii4?: boolean; offPlan?: boolean }): string {
  const border = opts.dfs ? "border-dashed" : opts.unii4 || opts.offPlan ? "border-dotted" : "border-solid";
  const tone =
    state === "selected"
      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.3)] text-[hsl(var(--brand-bone))]"
      : state === "member"
        ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-bone))]"
        : state === "overlap"
          ? "border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.1)] text-[hsl(var(--brand-amber))]"
          : opts.dfs
            ? "border-[hsl(var(--brand-amber)/0.7)] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-amber))] hover:border-[hsl(var(--brand-signal)/0.6)]"
            : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.6)]";
  return `relative flex items-center justify-center rounded-[4px] border font-mono-tight text-[0.625rem] leading-none transition-colors ${FOCUS} ${border} ${tone}`;
}

/* ------------------------------------------------------- 2.4 GHz drawing */

const F0 = 2398;
const F1 = 2498;
const SVG_W = 1000;
// The top 24 units hold the band label, clear of the tallest (40 MHz) arc.
const SVG_BASE = 146;
const SVG_H = 170;
const fx = (mhz: number) => ((mhz - F0) / (F1 - F0)) * SVG_W;

function arcPath(lo: number, hi: number, height: number): string {
  const x1 = fx(lo);
  const x2 = fx(hi);
  return `M ${x1} ${SVG_BASE} A ${(x2 - x1) / 2} ${height} 0 0 1 ${x2} ${SVG_BASE}`;
}

function Chart24({
  sel,
  mask,
  onPick,
}: {
  sel: Sel;
  mask: Mask;
  onPick: (s: Sel) => void;
}) {
  const option = sel.ht40 ? ht40Options(sel.channel).find((o) => o.direction === sel.ht40) ?? null : null;
  const overlap = new Set(
    option
      ? overlappingRange24(option.lowMHz, option.highMHz, mask).filter((c) => c !== option.primary && c !== option.secondary)
      : overlapping24(sel.channel, mask),
  );
  const half = mask / 2;
  const list = channels("2.4");

  const label = option
    ? `40 MHz channel from ${option.lowMHz} to ${option.highMHz} MHz, primary ${option.primary}, secondary ${option.secondary}. Overlaps channels ${[...overlap].join(", ") || "none"}.`
    : `Channel ${sel.channel} at ${centerFrequency("2.4", sel.channel)} MHz. Overlaps channels ${[...overlap].join(", ") || "none"} at ${mask} MHz width.`;

  return (
    <div className="relative min-w-[40rem]">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-auto w-full" role="img" aria-label={label}>
        <rect
          x={fx(2400)}
          y={24}
          width={fx(2483.5) - fx(2400)}
          height={SVG_BASE - 24}
          fill="hsl(var(--brand-iron))"
          opacity={0.18}
        />
        <text x={fx(2400)} y={16} fontSize="16" fill="hsl(var(--brand-ash))">
          ISM band 2400 to 2483.5 MHz
        </text>
        {option ? (
          <path
            d={arcPath(option.lowMHz, option.highMHz, 112)}
            fill="hsl(var(--brand-signal))"
            fillOpacity={0.12}
            stroke="hsl(var(--brand-signal))"
            strokeWidth={3}
          />
        ) : null}
        {list.map((c) => {
          const isPrimary = c.channel === sel.channel;
          const isSecondary = option !== null && c.channel === option.secondary;
          const isOverlap = overlap.has(c.channel);
          const clean = [1, 6, 11].includes(c.channel);
          const offPlan = c.us !== "allowed";
          const stroke = isPrimary || isSecondary
            ? "hsl(var(--brand-signal))"
            : isOverlap
              ? "hsl(var(--brand-amber))"
              : clean
                ? "hsl(var(--brand-cyan))"
                : "hsl(var(--brand-iron))";
          return (
            <path
              key={c.channel}
              d={arcPath(c.centerMHz - half, c.centerMHz + half, 84)}
              fill={isPrimary ? "hsl(var(--brand-signal))" : "none"}
              fillOpacity={isPrimary ? 0.2 : 0}
              stroke={stroke}
              strokeWidth={isPrimary ? 3 : isOverlap || isSecondary ? 2.25 : 1.5}
              strokeDasharray={offPlan && !isPrimary ? "7 6" : undefined}
            />
          );
        })}
        <line x1={0} y1={SVG_BASE} x2={SVG_W} y2={SVG_BASE} stroke="hsl(var(--brand-iron))" strokeWidth={1.5} />
        {[2400, 2420, 2440, 2460, 2480].map((f) => (
          <g key={f}>
            <line x1={fx(f)} y1={SVG_BASE} x2={fx(f)} y2={SVG_BASE + 6} stroke="hsl(var(--brand-ash))" strokeWidth={1.5} />
            <text x={fx(f)} y={SVG_BASE + 22} fontSize="16" textAnchor="middle" fill="hsl(var(--brand-ash))">
              {f}
            </text>
          </g>
        ))}
      </svg>
      <div className="relative mt-1 h-[44px]">
        {list.map((c) => {
          const active = c.channel === sel.channel;
          const state: CellState = active
            ? "selected"
            : option && c.channel === option.secondary
              ? "member"
              : overlap.has(c.channel)
                ? "overlap"
                : "plain";
          return (
            <button
              key={c.channel}
              type="button"
              onClick={() => onPick({ width: 20, channel: c.channel, ht40: null })}
              aria-pressed={active}
              aria-label={`Channel ${c.channel}, ${c.centerMHz} MHz${c.us === "allowed" ? "" : c.us === "low-power" ? ", low power only in the US" : ", not allowed in the US"}`}
              data-testid={`button-channel-2.4-${c.channel}`}
              style={{ left: `${(fx(c.centerMHz) / SVG_W) * 100}%` }}
              className={`absolute top-0 min-h-[44px] w-7 -translate-x-1/2 ${cellClass(state, { offPlan: c.us !== "allowed" })}`}
            >
              {c.channel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------------------------- 5 and 6 GHz grid */

type Column = { kind: "ch"; ch: Channel20 } | { kind: "gap" };

function columnsFor(band: "5" | "6", lo: number, hi: number): Column[] {
  const out: Column[] = [];
  for (const ch of channels(band)) {
    if (ch.channel < lo || ch.channel > hi) continue;
    if (band === "5" && ch.channel === 100) out.push({ kind: "gap" });
    out.push({ kind: "ch", ch });
  }
  return out;
}

interface Row {
  label: string;
  width: Width;
  items: Bonded[];
}

function rowsFor(band: "5" | "6", lo: number, hi: number): Row[] {
  const rows: Row[] = [];
  for (const width of BAND_WIDTHS[band]) {
    if (width === 20) continue;
    const items = bondedChannels(band, width).filter((b) => b.members.some((m) => m >= lo && m <= hi));
    if (width === 320) {
      rows.push({ label: "320 · 1", width, items: items.filter((b) => b.set === "320-1") });
      rows.push({ label: "320 · 2", width, items: items.filter((b) => b.set === "320-2") });
    } else {
      rows.push({ label: `${width}`, width, items });
    }
  }
  return rows;
}

function GridChart({
  band,
  lo,
  hi,
  sel,
  onPick,
}: {
  band: "5" | "6";
  /** Lowest and highest 20 MHz channel shown. */
  lo: number;
  hi: number;
  sel: Sel;
  onPick: (s: Sel) => void;
}) {
  const cols = useMemo(() => columnsFor(band, lo, hi), [band, lo, hi]);
  const rows = useMemo(() => rowsFor(band, lo, hi), [band, lo, hi]);
  const colOf = useMemo(() => {
    const map = new Map<number, number>();
    cols.forEach((c, i) => {
      if (c.kind === "ch") map.set(c.ch.channel, i + 2);
    });
    return map;
  }, [cols]);

  const slot = band === "6" ? 1.625 : 1.875;
  const gapWidth = 1.25;
  const template = ["4rem", ...cols.map((c) => (c.kind === "gap" ? `${gapWidth}rem` : `minmax(${slot}rem, 1fr)`))].join(" ");
  const chCount = cols.filter((c) => c.kind === "ch").length;
  const gapCount = cols.length - chCount;
  const gridStyle: CSSProperties = {
    gridTemplateColumns: template,
    minWidth: `${4 + chCount * (slot + 0.125) + gapCount * gapWidth}rem`,
  };

  const selected = sel.width === 20 ? null : findBonded(band, sel.width, sel.channel);
  const memberSet = new Set(selected ? selected.members : []);

  // Sub-band header spans: runs of consecutive columns with the same label.
  const headers: { label: string; start: number; end: number }[] = [];
  cols.forEach((c, i) => {
    if (c.kind === "gap") return;
    const label = c.ch.subband;
    const last = headers[headers.length - 1];
    if (last && last.label === label && last.end === i + 1) last.end = i + 2;
    else headers.push({ label, start: i + 2, end: i + 2 });
  });
  const lastRow = 2 + rows.length;
  const gapIndex = cols.findIndex((c) => c.kind === "gap");

  return (
    <div
      className="relative grid gap-[0.125rem]"
      style={gridStyle}
      role="group"
      aria-label={`${BAND_LABEL[band]} channel chart, channels ${lo} to ${hi}`}
    >
      {headers.map((h) => {
        const info = SUBBANDS[band].find((s) => s.name === h.label);
        const short = h.end === h.start ? h.label.replace("UNII-", "") : h.label;
        return (
          <div
            key={h.label}
            style={{ gridColumn: `${h.start} / ${h.end + 1}`, gridRow: 1 }}
            title={info ? `${info.name}: ${info.lowMHz} to ${info.highMHz} MHz. ${info.summary}` : h.label}
            className="truncate border-b border-[hsl(var(--brand-iron))] pb-1 text-center font-mono-tight text-[0.625rem] uppercase tracking-[0.12em] text-[hsl(var(--brand-ash))]"
          >
            {short}
          </div>
        );
      })}
      {gapIndex >= 0 ? (
        <div
          style={{ gridColumn: gapIndex + 2, gridRow: `1 / ${lastRow + 1}` }}
          title="5350 to 5470 MHz (UNII-2B): no Wi-Fi channels in the US"
          className="rounded-[4px] border border-dotted border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-iron)/0.2)]"
        >
          <span className="sr-only">Gap: 5350 to 5470 MHz has no Wi-Fi channels in the US.</span>
        </div>
      ) : null}

      <div style={{ gridColumn: 1, gridRow: 2 }} className="flex items-center font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
        20 MHz
      </div>
      {cols.map((c) => {
        if (c.kind === "gap") return null;
        const ch = c.ch;
        const active = sel.width === 20 && sel.channel === ch.channel;
        const state: CellState = active ? "selected" : memberSet.has(ch.channel) ? "member" : "plain";
        return (
          <button
            key={ch.channel}
            type="button"
            onClick={() => onPick({ width: 20, channel: ch.channel, ht40: null })}
            aria-pressed={active}
            aria-label={`Channel ${ch.channel}, ${ch.centerMHz} MHz${ch.dfs ? ", DFS" : ""}${ch.psc ? ", preferred scanning channel" : ""}${ch.unii4 ? ", UNII-4" : ""}`}
            data-testid={`button-channel-${band}-${ch.channel}`}
            style={{ gridColumn: colOf.get(ch.channel), gridRow: 2 }}
            className={`min-h-[44px] w-full ${cellClass(state, { dfs: ch.dfs, unii4: ch.unii4 })}`}
          >
            {ch.channel}
            {ch.psc ? (
              <span aria-hidden className="absolute inset-x-1 bottom-1 h-[3px] rounded-full bg-[hsl(var(--brand-cyan))]" />
            ) : null}
          </button>
        );
      })}

      {rows.map((row, r) => (
        <RowCells key={row.label} band={band} row={row} rowIndex={r + 3} sel={sel} colOf={colOf} lo={lo} hi={hi} onPick={onPick} />
      ))}
    </div>
  );
}

function RowCells({
  band,
  row,
  rowIndex,
  sel,
  colOf,
  lo,
  hi,
  onPick,
}: {
  band: "5" | "6";
  row: Row;
  rowIndex: number;
  sel: Sel;
  colOf: Map<number, number>;
  lo: number;
  hi: number;
  onPick: (s: Sel) => void;
}) {
  return (
    <>
      <div
        style={{ gridColumn: 1, gridRow: rowIndex }}
        className="flex items-center font-mono-tight text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
      >
        {row.label}
      </div>
      {row.items.map((b) => {
        // A block that crosses the edge of this half is drawn clipped, with an
        // arrow on the side where it continues.
        const shown = b.members.filter((m) => m >= lo && m <= hi);
        const start = colOf.get(shown[0]) ?? 2;
        const end = colOf.get(shown[shown.length - 1]) ?? start;
        const clippedLeft = b.members[0] < lo;
        const clippedRight = b.members[b.members.length - 1] > hi;
        const active = sel.width === b.width && sel.channel === b.channel;
        return (
          <button
            key={b.channel}
            type="button"
            onClick={() => onPick({ width: b.width, channel: b.channel, ht40: null })}
            aria-pressed={active}
            aria-label={`${b.width} MHz channel ${b.channel}, ${b.centerMHz} MHz, channels ${b.members[0]} to ${b.members[b.members.length - 1]}${b.dfs ? ", includes DFS" : ""}${b.unii4 ? ", needs UNII-4" : ""}`}
            data-testid={`button-bonded-${band}-${b.width}-${b.channel}`}
            style={{ gridColumn: `${start} / ${end + 1}`, gridRow: rowIndex }}
            className={`min-h-[36px] w-full ${cellClass(active ? "selected" : "plain", { dfs: b.dfs, unii4: b.unii4 })}`}
          >
            {clippedLeft ? <span aria-hidden>{"\u2039 "}</span> : null}
            {b.channel}
            {clippedRight ? <span aria-hidden>{" \u203a"}</span> : null}
          </button>
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------- details */

function NotesList({ notes }: { notes: RegNotes }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className={LABEL}>United States (FCC)</h3>
        <ul className="mt-2 space-y-2" data-testid="list-notes-us">
          {notes.us.map((n) => (
            <li key={n} className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {n}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className={LABEL}>Elsewhere</h3>
        <ul className="mt-2 space-y-2" data-testid="list-notes-elsewhere">
          {notes.elsewhere.map((n) => (
            <li key={n} className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {n}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
          Rules differ by country and change over time. Check the national regulator before deploying outside the US.
        </p>
      </div>
    </div>
  );
}

function OptionButton({ active, onClick, children, testId }: { active?: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors ${FOCUS} ${
        active
          ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
          : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
      }`}
    >
      {children}
    </button>
  );
}

function listText(nums: number[]): string {
  return nums.length ? nums.join(", ") : "none";
}

function Details({
  band,
  sel,
  mask,
  onPick,
}: {
  band: Band;
  sel: Sel;
  mask: Mask;
  onPick: (s: Sel) => void;
}) {
  if (band === "2.4") {
    const option = sel.ht40 ? ht40Options(sel.channel).find((o) => o.direction === sel.ht40) ?? null : null;
    const ch = getChannel("2.4", sel.channel);
    if (!ch) return null;
    const options = ht40Options(ch.channel);
    const overlap = option
      ? overlappingRange24(option.lowMHz, option.highMHz, mask).filter((c) => c !== option.primary && c !== option.secondary)
      : overlapping24(ch.channel, mask);
    const half = mask / 2;
    const clear = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(
      (c) => c !== ch.channel && !overlap.includes(c) && (!option || c !== option.secondary),
    );
    const notes = option ? ht40Notes(option) : channelNotes("2.4", ch.channel);
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Selected channel">
          <div data-testid="output-channel">
            {option ? (
              <>
                <ToolResult
                  label="Channel"
                  value={`${option.primary} + ${option.secondary} (HT40${option.direction === "above" ? "+" : "-"}, 40 MHz)`}
                  testId="text-channel"
                />
                <ToolResult label="Center frequency" value={`${option.centerMHz} MHz`} testId="text-center" />
                <ToolResult label="Occupies" value={`${option.lowMHz} to ${option.highMHz} MHz`} />
                <ToolResult label="Primary" value={`${option.primary} at ${centerFrequency("2.4", option.primary)} MHz`} />
                <ToolResult label="Secondary" value={`${option.secondary} at ${centerFrequency("2.4", option.secondary)} MHz`} />
              </>
            ) : (
              <>
                <ToolResult label="Channel" value={`${ch.channel} (20 MHz)`} testId="text-channel" />
                <ToolResult
                  label="Center frequency"
                  value={`${ch.centerMHz} MHz = ${formulaText("2.4", ch.channel)}`}
                  testId="text-center"
                />
                <ToolResult
                  label="Occupies"
                  value={`${ch.centerMHz - half} to ${ch.centerMHz + half} MHz (${mask === 20 ? "20 MHz OFDM" : "22 MHz DSSS"})`}
                />
                <ToolResult
                  label="US status"
                  value={ch.us === "allowed" ? "Allowed" : ch.us === "low-power" ? "Low power only" : "Not allowed"}
                />
              </>
            )}
            <ToolResult label={`Overlaps (${mask} MHz)`} value={listText(overlap)} testId="text-overlap" />
            <ToolResult label="Clear of (1 to 11)" value={listText(clear)} />
          </div>

          <h3 className={`${LABEL} mt-6`}>Width options</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <OptionButton
              active={option === null}
              onClick={() => onPick({ width: 20, channel: ch.channel, ht40: null })}
              testId="button-width-20"
            >
              <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">20 MHz</span>
              <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">{ch.centerMHz} MHz</span>
            </OptionButton>
            {options.map((o) => (
              <OptionButton
                key={o.direction}
                active={option?.direction === o.direction}
                onClick={() => onPick({ width: 40, channel: ch.channel, ht40: o.direction })}
                testId={`button-ht40-${o.direction}`}
              >
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  40 MHz HT40{o.direction === "above" ? "+" : "-"}
                </span>
                <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  with {o.secondary}, {o.centerMHz} MHz{o.us ? "" : ", not US"}
                </span>
              </OptionButton>
            ))}
          </div>
          {options.length === 0 ? (
            <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              Channel 14 is 802.11b only, so it has no 40 MHz option.
            </p>
          ) : null}
        </ToolPanel>
        <ToolPanel title="Regulatory notes">
          <NotesList notes={notes} />
        </ToolPanel>
      </div>
    );
  }

  const bonded = sel.width === 20 ? null : findBonded(band, sel.width, sel.channel);
  const ch = sel.width === 20 ? getChannel(band, sel.channel) : null;
  if (!bonded && !ch) return null;

  if (bonded) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ToolPanel title="Selected channel">
          <div data-testid="output-channel">
            <ToolResult label="Channel" value={`${bonded.channel} (${bonded.width} MHz)`} testId="text-channel" />
            <ToolResult
              label="Center frequency"
              value={`${bonded.centerMHz} MHz = ${formulaText(band, bonded.channel)}`}
              testId="text-center"
            />
            <ToolResult label="Occupies" value={`${bonded.lowMHz} to ${bonded.highMHz} MHz`} />
            <ToolResult label="Sub-bands" value={bonded.subbands.join(", ")} />
            {band === "5" ? (
              <ToolResult label="DFS" value={bonded.dfs ? `Yes, on ${bonded.dfsMembers.join(", ")}` : "No"} testId="text-dfs" />
            ) : (
              <>
                <ToolResult label="Standard power" value={bonded.standardPower ? "Allowed with AFC" : "No, low power indoor only"} />
                <ToolResult label="PSC inside" value={listText(bonded.pscMembers)} />
              </>
            )}
            {bonded.set ? <ToolResult label="320 MHz set" value={bonded.set} /> : null}
          </div>
          <h3 className={`${LABEL} mt-6`}>20 MHz members</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {bonded.members.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onPick({ width: 20, channel: m, ht40: null })}
                data-testid={`button-member-${m}`}
                className={pillClass(false)}
              >
                {m}
              </button>
            ))}
          </div>
        </ToolPanel>
        <ToolPanel title="Regulatory notes">
          <NotesList notes={bondedNotes(bonded)} />
        </ToolPanel>
      </div>
    );
  }

  const c = ch as Channel20;
  const options = containing(band, c.channel);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ToolPanel title="Selected channel">
        <div data-testid="output-channel">
          <ToolResult label="Channel" value={`${c.channel} (20 MHz)`} testId="text-channel" />
          <ToolResult label="Center frequency" value={`${c.centerMHz} MHz = ${formulaText(band, c.channel)}`} testId="text-center" />
          <ToolResult label="Occupies" value={`${c.lowMHz} to ${c.highMHz} MHz`} />
          <ToolResult label="Sub-band" value={c.subband} />
          {band === "5" ? <ToolResult label="DFS" value={c.dfs ? "Yes" : "No"} testId="text-dfs" /> : null}
          {band === "6" ? (
            <>
              <ToolResult label="Preferred scanning" value={c.psc ? "Yes" : "No"} testId="text-psc" />
              <ToolResult
                label="Standard power"
                value={c.subband === "UNII-5" || c.subband === "UNII-7" ? "Allowed with AFC" : "No, low power indoor only"}
              />
            </>
          ) : null}
        </div>
        <h3 className={`${LABEL} mt-6`}>Width options</h3>
        {options.length ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {options.map((b) => (
              <OptionButton
                key={`${b.width}-${b.channel}`}
                onClick={() => onPick({ width: b.width, channel: b.channel, ht40: null })}
                testId={`button-option-${b.width}-${b.channel}`}
              >
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {b.width} MHz{b.set ? ` (${b.set})` : ""}: channel {b.channel}
                </span>
                <span className="font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
                  {b.centerMHz} MHz, {b.lowMHz} to {b.highMHz}
                  {b.dfs ? ", DFS" : ""}
                  {b.unii4 ? ", UNII-4" : ""}
                </span>
              </OptionButton>
            ))}
          </div>
        ) : (
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            20 MHz only: no wider channel in the plan includes channel {c.channel}.
          </p>
        )}
      </ToolPanel>
      <ToolPanel title="Regulatory notes">
        <NotesList notes={channelNotes(band, c.channel)} />
      </ToolPanel>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export function WifiChannelReference() {
  const [band, setBand] = useState<Band>("2.4");
  const [sels, setSels] = useState<Record<Band, Sel>>(DEFAULT_SEL);
  const [mask, setMask] = useState<Mask>(20);
  const [query, setQuery] = useState("");
  const [queryResult, setQueryResult] = useState<{ tone: "error" | "note"; text: string } | null>(null);
  const [jump, setJump] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const sel = sels[band];

  // After a lookup or a width option, bring the selected cell into view
  // inside the chart's own horizontal scroller, without moving the page.
  useEffect(() => {
    if (jump === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!target) return;
    scroller.scrollLeft = Math.max(0, target.offsetLeft - scroller.clientWidth / 2 + target.offsetWidth / 2);
  }, [jump, band]);

  function pick(s: Sel, scroll = false) {
    setSels((prev) => ({ ...prev, [band]: s }));
    if (scroll) setJump((n) => n + 1);
  }

  function runLookup() {
    const result = parseLookup(query, band);
    if (result.kind === "empty") {
      setQueryResult(null);
      return;
    }
    if (result.kind === "error") {
      setQueryResult({ tone: "error", text: result.message });
      return;
    }
    setBand(result.band);
    setSels((prev) => ({ ...prev, [result.band]: { width: result.width, channel: result.channel, ht40: null } }));
    setQueryResult(result.note ? { tone: "note", text: result.note } : null);
    setJump((n) => n + 1);
  }

  const summary =
    band === "2.4"
      ? sel.ht40
        ? `2.4 GHz, 40 MHz on channel ${sel.channel} HT40${sel.ht40 === "above" ? "+" : "-"}.`
        : `2.4 GHz channel ${sel.channel}, ${centerFrequency("2.4", sel.channel)} MHz.`
      : sel.width === 20
        ? `${BAND_LABEL[band]} channel ${sel.channel}, ${centerFrequency(band, sel.channel)} MHz.`
        : `${BAND_LABEL[band]} ${sel.width} MHz channel ${sel.channel}, centered at ${centerFrequency(band, sel.channel)} MHz.`;

  return (
    <ToolShell slug="wifi-channel-reference">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Band">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Band">
              {BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    setBand(b);
                    setQueryResult(null);
                  }}
                  aria-pressed={band === b}
                  data-testid={`button-band-${b}`}
                  className={pillClass(band === b)}
                >
                  {BAND_LABEL[b]}
                </button>
              ))}
            </div>
            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-band-summary">
              {BAND_SUMMARY[band]}
            </p>
          </ToolPanel>

          <ToolPanel title="Look up">
            <label htmlFor="wifi-lookup" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Channel number or frequency
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                id="wifi-lookup"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runLookup();
                  }
                }}
                maxLength={MAX_LOOKUP_LENGTH}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="decimal"
                aria-invalid={queryResult?.tone === "error"}
                aria-describedby="wifi-lookup-hint"
                placeholder="149, 5180, 5.18 GHz"
                data-testid="input-channel"
                className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
              />
              <button type="button" onClick={runLookup} data-testid="button-lookup" className={pillClass(false)}>
                Show
              </button>
            </div>
            {queryResult ? (
              <p
                id="wifi-lookup-hint"
                role={queryResult.tone === "error" ? "alert" : "status"}
                data-testid={queryResult.tone === "error" ? "text-lookup-error" : "text-lookup-note"}
                className={`mt-3 rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${
                  queryResult.tone === "error"
                    ? "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]"
                    : "border-[hsl(var(--brand-signal)/0.45)] bg-[hsl(var(--brand-signal)/0.07)] text-[hsl(var(--brand-bone-dim))]"
                }`}
              >
                {queryResult.text}
              </p>
            ) : (
              <p id="wifi-lookup-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                A plain number is a channel in the current band, or in another band if it has none. Four digits, or
                a unit, is read as a frequency. Press Enter or Show.
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title={`${BAND_LABEL[band]} channels`}>
          {band === "2.4" ? (
            <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Signal width used for overlap">
              <span className={LABEL}>Overlap at</span>
              <button type="button" onClick={() => setMask(20)} aria-pressed={mask === 20} data-testid="button-mask-20" className={pillClass(mask === 20)}>
                20 MHz OFDM
              </button>
              <button type="button" onClick={() => setMask(22)} aria-pressed={mask === 22} data-testid="button-mask-22" className={pillClass(mask === 22)}>
                22 MHz DSSS
              </button>
            </div>
          ) : null}

          <div ref={scrollerRef} className="overflow-x-auto pb-2">
            {band === "2.4" ? (
              <Chart24 sel={sel} mask={mask} onPick={(s) => pick(s)} />
            ) : (
              band === "5" ? (
                <GridChart band="5" lo={36} hi={177} sel={sel} onPick={(s) => pick(s)} />
              ) : (
                <div className="space-y-6">
                  {SIX_HALVES.map((h) => (
                    <div key={h.lo}>
                      <h3 className={`${LABEL} mb-2`}>
                        Channels {h.lo} to {h.hi}, {centerFrequency("6", h.lo)! - 10} to {centerFrequency("6", h.hi)! + 10} MHz
                      </h3>
                      <GridChart band="6" lo={h.lo} hi={h.hi} sel={sel} onPick={(s) => pick(s)} />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            {band === "2.4" ? (
              <>
                <li>
                  <span className="text-[hsl(var(--brand-signal))]">Green</span>: selected
                </li>
                <li>
                  <span className="text-[hsl(var(--brand-amber))]">Amber</span>: overlaps the selection
                </li>
                <li>
                  <span className="text-[hsl(var(--brand-cyan))]">Cyan</span>: channels 1, 6 and 11
                </li>
                <li>Dashed: low power only or not allowed in the US</li>
              </>
            ) : (
              <>
                <li>
                  <span className="text-[hsl(var(--brand-signal))]">Green</span>: selected
                </li>
                {band === "5" ? (
                  <>
                    <li>
                      <span className="text-[hsl(var(--brand-amber))]">Amber, dashed</span>: DFS required
                    </li>
                    <li>Dotted: UNII-4, needs device support</li>
                  </>
                ) : (
                  <li>
                    <span className="text-[hsl(var(--brand-cyan))]">Cyan bar</span>: preferred scanning channel
                  </li>
                )}
                <li>Rows below 20 MHz: bonded channels, named by their center number</li>
              </>
            )}
          </ul>
          {band !== "2.4" ? (
            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
              The chart scrolls sideways on narrow screens.
            </p>
          ) : null}
        </ToolPanel>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        <Details band={band} sel={sel} mask={mask} onPick={(s) => pick(s, true)} />
      </div>
    </ToolShell>
  );
}
