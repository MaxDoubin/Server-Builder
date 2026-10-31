/**
 * Server power supply sizing calculator.
 *
 * The parts list is held as the strings the reader typed, one row per
 * component, and parsed on every render so a half-typed value shows a
 * precise message for that row instead of corrupting the total. A row that
 * does not parse is left out and named in a banner, so the totals are never
 * silently wrong. The sizing and the 80 PLUS efficiency curve live in
 * lib/toolkit/psu-sizing-calculator so they can be unit tested without React.
 */

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ELECTRICITY_USD_PER_KWH } from "@/lib/buildCosts";
import {
  COMMON_RATINGS,
  KIND_ORDER,
  LOAD_POINTS,
  MAX_N,
  PRESETS,
  RATED_FACTORS,
  STANDARDS,
  TIERS,
  type ComponentKind,
  type ComponentLoad,
  type OperatingPoint,
  type Parsed,
  type Redundancy,
  type Standard,
  type Tier,
  EFFICIENCY_TABLE,
  fromRating,
  lowestCertified,
  parseNumber,
  size,
  supplyCounts,
  tierAvailable,
  totals,
} from "@/lib/toolkit/psu-sizing-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-40";
const CHIP_ON =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const WARN_BOX =
  "break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

/* ------------------------------------------------------------------- data */

const MAX_ROWS = 40;
const MAX_QTY = 999;
const MAX_WATTS = 10_000;
const MAX_RATED = 2_000;

interface RowDraft {
  id: number;
  kind: ComponentKind;
  label: string;
  qty: string;
  rated: string;
  typical: string;
  peak: string;
}

function draftFor(id: number, kind: ComponentKind, qty: number): RowDraft {
  const p = PRESETS[kind];
  return {
    id,
    kind,
    label: p.label,
    qty: String(qty),
    rated: p.rated !== undefined ? String(p.rated) : "",
    typical: String(p.typical),
    peak: String(p.peak),
  };
}

/** A two-socket server with one accelerator, sixteen DIMMs and eight NVMe drives. */
function initialRows(): RowDraft[] {
  return [
    draftFor(1, "cpu", 2),
    draftFor(2, "gpu", 1),
    draftFor(3, "ram", 16),
    draftFor(4, "nvme", 8),
    draftFor(5, "fan", 6),
    draftFor(6, "nic", 1),
    draftFor(7, "board", 1),
  ];
}

const REDUNDANCY: { id: Redundancy; label: string; note: string }[] = [
  { id: "none", label: "None", note: "N supplies share the load. Losing one can take the server down." },
  { id: "1+1", label: "1+1", note: "Two supplies, each able to carry the whole server alone." },
  { id: "n+1", label: "N+1", note: "N supplies carry the load and one more is spare." },
  { id: "n+n", label: "N+N", note: "Two groups of N, usually one per power feed, so a whole feed can fail." },
];

const MARGIN_CHIPS = ["10", "20", "25", "30", "50"];

/* ----------------------------------------------------------------- helpers */

const watts = (n: number) => `${Math.round(n).toLocaleString("en-US")} W`;
const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

interface RowParsed {
  draft: RowDraft;
  qty: Parsed;
  typical: Parsed;
  peak: Parsed;
  error: string | null;
  load: ComponentLoad | null;
}

function parseRow(draft: RowDraft): RowParsed {
  const qty = parseNumber(draft.qty, "Quantity", { min: 0, max: MAX_QTY, integer: true });
  const typical = parseNumber(draft.typical, "Typical watts", { min: 0, max: MAX_WATTS });
  const peak = parseNumber(draft.peak, "Peak watts", { min: 0, max: MAX_WATTS });
  let error: string | null = null;
  if (!qty.ok) error = qty.message;
  else if (!typical.ok) error = typical.message;
  else if (!peak.ok) error = peak.message;
  else if (typical.value > peak.value) {
    error = "Typical draw is higher than peak. Peak is the most the part can draw, so it should be the larger figure.";
  }
  const load =
    error === null && qty.ok && typical.ok && peak.ok
      ? { kind: draft.kind, qty: qty.value, typical: typical.value, peak: peak.value }
      : null;
  return { draft, qty, typical, peak, error, load };
}

function errorOfParsed(parsed: Parsed): string | null {
  return parsed.ok ? null : parsed.message;
}

function regionNote(point: OperatingPoint, name: string, lowest: number): string | null {
  if (point.region === "below") {
    return `At ${name} load each supply runs at ${pct(point.loadFraction)}, under the lowest certified point of ${pct(lowest)}. The program sets no efficiency there and real units fall off, so wall draw is likely higher than shown.`;
  }
  if (point.region === "over") {
    return `At ${name} load each supply would run at ${pct(point.loadFraction)} of its rating. That is past its continuous rating, and its overload protection may shut it down.`;
  }
  return null;
}

/** A 0 to 100 percent bar with the certified load points and the operating points marked. */
function LoadMeter({
  typical,
  peak,
  afterFailure,
  lowest,
}: {
  typical: number;
  peak: number;
  afterFailure: number | null;
  lowest: number;
}) {
  const clamp = (f: number) => `${Math.min(100, Math.max(0, f * 100))}%`;
  const marks: { at: number; label: string; className: string }[] = [
    { at: typical, label: "Typical", className: "bg-[hsl(var(--brand-cyan))]" },
    { at: peak, label: "Peak", className: "bg-[hsl(var(--brand-signal))]" },
  ];
  if (afterFailure !== null) marks.push({ at: afterFailure, label: "Peak after a failure", className: "bg-[hsl(var(--brand-amber))]" });
  return (
    <div>
      <div className="relative mt-2 h-8" aria-hidden="true">
        <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-[hsl(var(--brand-iron)/0.6)]" />
        <div
          className="absolute top-3 h-2 rounded-l-full bg-[hsl(var(--brand-ash)/0.35)]"
          style={{ left: 0, width: clamp(lowest) }}
        />
        {LOAD_POINTS.filter((p) => p >= lowest).map((p) => (
          <div key={p} className="absolute top-1 h-6 w-px bg-[hsl(var(--brand-bone-dim))]" style={{ left: clamp(p) }} />
        ))}
        {marks.map((m) => (
          <div
            key={m.label}
            className={`absolute top-0 h-8 w-1.5 -translate-x-1/2 rounded-full ${m.className}`}
            style={{ left: clamp(m.at) }}
          />
        ))}
      </div>
      <div className="relative h-4 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]" aria-hidden="true">
        <span className="absolute left-0">0</span>
        {LOAD_POINTS.filter((p) => p < 1 && (p === lowest || p >= 0.2)).map((p) => (
          <span key={p} className="absolute -translate-x-1/2" style={{ left: clamp(p) }}>
            {p * 100}
          </span>
        ))}
        <span className="absolute right-0">100%</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        {marks.map((m) => (
          <li key={m.label} className="flex items-center gap-2">
            <span className={`inline-block h-3 w-1.5 rounded-full ${m.className}`} aria-hidden="true" />
            {m.label} {pct(m.at)}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="inline-block h-2 w-4 rounded-full bg-[hsl(var(--brand-ash)/0.35)]" aria-hidden="true" />
          Uncertified, under {pct(lowest)}
        </li>
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- component */

export function PsuSizingCalculator() {
  const [rows, setRows] = useState<RowDraft[]>(initialRows);
  const nextId = useRef(100);
  const [marginRaw, setMarginRaw] = useState("20");
  const [redundancy, setRedundancy] = useState<Redundancy>("1+1");
  const [nRaw, setNRaw] = useState("2");
  const [standard, setStandard] = useState<Standard>("230v-redundant");
  const [tier, setTier] = useState<Tier>("platinum");
  const [ratingRaw, setRatingRaw] = useState("");
  const [transientRaw, setTransientRaw] = useState("2");
  const [priceRaw, setPriceRaw] = useState(String(ELECTRICITY_USD_PER_KWH));

  const parsedRows = rows.map(parseRow);
  const goodLoads = parsedRows.flatMap((r) => (r.load ? [r.load] : []));
  const badRows = parsedRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.error !== null)
    .map(({ i }) => i + 1);
  const sum = totals(goodLoads);

  const margin = parseNumber(marginRaw, "Headroom", { min: 0, max: 200 });
  const nNeeded = redundancy !== "1+1";
  const n = parseNumber(nRaw, "N", { min: 1, max: MAX_N, integer: true });
  const rating: Parsed | null =
    ratingRaw.trim() === "" ? null : parseNumber(ratingRaw, "Rating to check", { min: 50, max: 20_000 });
  const transient = parseNumber(transientRaw, "Transient multiple", { min: 1, max: 5 });
  const price = parseNumber(priceRaw, "Electricity price", { min: 0, max: 10 });
  const tierOk = tierAvailable(standard, tier);

  // Ruby is certified from 5 percent load, Titanium from 10, every other level from 20.
  const lowestRaw = lowestCertified(standard, tier);
  const lowestPoint = Number.isFinite(lowestRaw) ? lowestRaw : LOAD_POINTS[2];

  const inputsOk =
    margin.ok &&
    (!nNeeded || n.ok) &&
    (rating === null || rating.ok) &&
    // The transient field is only shown, and only matters, when a GPU is listed.
    (sum.gpuPeak <= 0 || transient.ok) &&
    price.ok &&
    tierOk;
  const noLoad = sum.peak <= 0;

  const result =
    inputsOk && !noLoad
      ? size({
          typicalW: sum.typical,
          peakW: sum.peak,
          gpuPeakW: sum.gpuPeak,
          marginPct: margin.ok ? margin.value : 0,
          redundancy,
          n: nNeeded && n.ok ? n.value : 1,
          standard,
          tier,
          ratingW: rating && rating.ok ? rating.value : null,
          transientFactor: transient.ok ? transient.value : 1,
          pricePerKwh: price.ok ? price.value : 0,
        })
      : null;

  const counts = supplyCounts(redundancy, nNeeded && n.ok ? n.value : 1);
  const tierLabel = TIERS.find((t) => t.id === tier)?.label ?? tier;
  const standardLabel = STANDARDS.find((s) => s.id === standard)?.label ?? standard;
  const redundancyLabel =
    redundancy === "none"
      ? `${counts.installed} ${counts.installed === 1 ? "supply" : "supplies"}, no redundancy`
      : redundancy === "1+1"
        ? "1+1"
        : redundancy === "n+1"
          ? `${counts.carrying}+1`
          : `${counts.carrying}+${counts.carrying}`;

  const nMessage =
    redundancy === "none"
      ? `${counts.installed} installed, no spare.`
      : redundancy === "n+1"
        ? `${counts.installed} installed; ${counts.carrying} must carry peak after one fails.`
        : `${counts.installed} installed in two groups; one group of ${counts.carrying} must carry peak alone.`;

  function pickRedundancy(next: Redundancy) {
    setRedundancy(next);
    // A lone supply is the usual unprotected case; N+1 and N+N with N = 1 would just be 1+1.
    if (next === "none") setNRaw("1");
    else if ((next === "n+1" || next === "n+n") && nRaw.trim() === "1") setNRaw("2");
  }

  function editRow(id: number, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function changeKind(id: number, kind: ComponentKind) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...draftFor(r.id, kind, 1), qty: r.qty } : r)));
  }
  function changeRated(id: number, kind: ComponentKind, value: string) {
    const parsed = parseNumber(value, "Rating", { min: 1, max: MAX_RATED });
    const derived = parsed.ok ? fromRating(kind, parsed.value) : null;
    editRow(id, derived ? { rated: value, typical: String(derived.typical), peak: String(derived.peak) } : { rated: value });
  }
  function addRow(kind: ComponentKind) {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, draftFor(nextId.current++, kind, 1)]));
  }
  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function changeStandard(next: Standard) {
    setStandard(next);
    if (!tierAvailable(next, tier)) setTier("bronze");
  }

  const notes: string[] = [];
  if (result) {
    const t = regionNote(result.typical, "typical", lowestPoint);
    const p = regionNote(result.peak, "peak", lowestPoint);
    if (t) notes.push(t);
    if (p) notes.push(p);
    if (result.afterFailure && result.afterFailure.loadFraction > 1) {
      notes.push(
        `After a failure the remaining ${result.carrying === 1 ? "supply carries" : `${result.carrying} supplies each carry`} ${watts(result.afterFailure.perPsuW)}, more than the ${watts(result.evaluatedW)} rating. The redundancy is not real at peak load.`,
      );
    }
    if (result.headroomFraction >= 0 && margin.ok && result.headroomFraction + 1e-9 < margin.value / 100) {
      notes.push(
        `The checked rating leaves ${pct(result.headroomFraction)} headroom over peak${result.installed > result.carrying ? " after a failure" : ""}, less than the ${margin.value}% asked for.`,
      );
    }
  }

  const summary = result
    ? [
        `Parts: ${goodLoads.length} ${goodLoads.length === 1 ? "line" : "lines"}, typical ${watts(sum.typical)}, peak ${watts(sum.peak)} DC`,
        `Redundancy ${redundancyLabel}, headroom ${margin.ok ? margin.value : 0}%, ${tierLabel} (${standardLabel})`,
        `Required per supply ${watts(result.requiredPerPsuW)}; recommended ${result.recommendedW ? watts(result.recommendedW) : "none of the common ratings"}`,
        `Checked ${result.installed} x ${watts(result.evaluatedW)}`,
        `Load per supply: typical ${pct(result.typical.loadFraction)}, peak ${pct(result.peak.loadFraction)}${result.afterFailure ? `, peak after a failure ${pct(result.afterFailure.loadFraction)}` : ""}`,
        `Wall power: typical ${watts(result.typical.wallW)}, peak ${watts(result.peak.wallW)}`,
        `Energy: ${Math.round(result.annualKwh).toLocaleString("en-US")} kWh a year, ${usd(result.annualCost)} at ${price.ok ? price.value : 0} USD per kWh`,
      ].join("\n")
    : "";

  const status = result
    ? `${result.installed} ${result.installed === 1 ? "supply" : "supplies"} of ${watts(result.evaluatedW)}. Typical load ${pct(result.typical.loadFraction)} per supply, wall draw ${watts(result.typical.wallW)}.`
    : noLoad
      ? "Add at least one component that draws power."
      : "Fix the highlighted field to see the sizing.";

  return (
    <ToolShell slug="psu-sizing-calculator">
      <div className="space-y-6">
        <ToolPanel title="Components">
          <ol className="space-y-3" data-testid="list-components">
            {parsedRows.map((row, index) => {
              const d = row.draft;
              const base = `psu-${d.id}`;
              const factor = RATED_FACTORS[d.kind];
              const ratedError =
                factor && d.rated.trim() !== ""
                  ? errorOfParsed(parseNumber(d.rated, factor.ratingName, { min: 1, max: MAX_RATED }))
                  : null;
              return (
                <li
                  key={d.id}
                  className="rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-[2] basis-[9rem]">
                      <label htmlFor={`${base}-kind`} className={LABEL_CLASS}>
                        Part {index + 1}
                      </label>
                      <select
                        id={`${base}-kind`}
                        value={d.kind}
                        onChange={(e) => changeKind(d.id, e.target.value as ComponentKind)}
                        data-testid={`select-kind-${index + 1}`}
                        className={`mt-2 ${SELECT_CLASS}`}
                      >
                        {KIND_ORDER.map((k) => (
                          <option key={k} value={k}>
                            {PRESETS[k].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 flex-[2] basis-[9rem]">
                      <label htmlFor={`${base}-label`} className={LABEL_CLASS}>
                        Name
                      </label>
                      <input
                        id={`${base}-label`}
                        value={d.label}
                        onChange={(e) => editRow(d.id, { label: e.target.value })}
                        maxLength={60}
                        spellCheck={false}
                        autoComplete="off"
                        data-testid={`input-label-${index + 1}`}
                        className={`mt-2 ${INPUT_CLASS}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1 basis-[4.5rem]">
                      <label htmlFor={`${base}-qty`} className={LABEL_CLASS}>
                        Qty
                      </label>
                      <input
                        id={`${base}-qty`}
                        value={d.qty}
                        onChange={(e) => editRow(d.id, { qty: e.target.value })}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-invalid={!row.qty.ok}
                        aria-describedby={row.error ? `${base}-error` : undefined}
                        data-testid={`input-qty-${index + 1}`}
                        className={`mt-2 ${INPUT_CLASS}`}
                      />
                    </div>
                    {factor ? (
                      <div className="min-w-0 flex-1 basis-[6rem]">
                        <label htmlFor={`${base}-rated`} className={LABEL_CLASS}>
                          {factor.ratingName} W
                        </label>
                        <input
                          id={`${base}-rated`}
                          value={d.rated}
                          onChange={(e) => changeRated(d.id, d.kind, e.target.value)}
                          inputMode="decimal"
                          autoComplete="off"
                          aria-invalid={ratedError !== null}
                          aria-describedby={ratedError ? `${base}-rated-error` : row.error ? `${base}-error` : `${base}-hint`}
                          data-testid={`input-rated-${index + 1}`}
                          className={`mt-2 ${INPUT_CLASS}`}
                        />
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 basis-[5.5rem]">
                      <label htmlFor={`${base}-typical`} className={LABEL_CLASS}>
                        Typical W
                      </label>
                      <input
                        id={`${base}-typical`}
                        value={d.typical}
                        onChange={(e) => editRow(d.id, { typical: e.target.value })}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={!row.typical.ok || (row.error !== null && row.qty.ok && row.peak.ok)}
                        aria-describedby={row.error ? `${base}-error` : undefined}
                        data-testid={`input-typical-${index + 1}`}
                        className={`mt-2 ${INPUT_CLASS}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1 basis-[5.5rem]">
                      <label htmlFor={`${base}-peak`} className={LABEL_CLASS}>
                        Peak W
                      </label>
                      <input
                        id={`${base}-peak`}
                        value={d.peak}
                        onChange={(e) => editRow(d.id, { peak: e.target.value })}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={!row.peak.ok}
                        aria-describedby={row.error ? `${base}-error` : undefined}
                        data-testid={`input-peak-${index + 1}`}
                        className={`mt-2 ${INPUT_CLASS}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(d.id)}
                      aria-label={`Remove part ${index + 1}, ${d.label || PRESETS[d.kind].label}`}
                      data-testid={`button-remove-${index + 1}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-danger)/0.6)] hover:text-[hsl(var(--brand-danger))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  {ratedError ? (
                    <p id={`${base}-rated-error`} role="alert" className={ERROR_TEXT}>
                      {ratedError} Typical and peak keep their last values until it parses.
                    </p>
                  ) : null}
                  {row.error ? (
                    <p id={`${base}-error`} role="alert" className={ERROR_TEXT}>
                      {row.error}
                    </p>
                  ) : row.load ? (
                    <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono-tight text-xs leading-relaxed">
                      <span id={`${base}-hint`} className="text-[hsl(var(--brand-ash))]">
                        {PRESETS[d.kind].hint}
                      </span>
                      <span className="text-[hsl(var(--brand-bone))]">
                        {row.load.qty} x {watts(row.load.peak)} = {watts(row.load.qty * row.load.peak)} peak
                      </span>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {rows.length === 0 ? (
            <p className="font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">The list is empty. Add a part below.</p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Add a part">
            {KIND_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => addRow(k)}
                disabled={rows.length >= MAX_ROWS}
                data-testid={`button-add-${k}`}
                className={`${CHIP_CLASS} ${CHIP_OFF}`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> {PRESETS[k].label}
              </button>
            ))}
          </div>
          <p className={HINT_TEXT}>
            Starting values are typical figures, not measurements. Replace them with datasheet numbers or readings from
            the BMC. Up to {MAX_ROWS} lines.
          </p>
          {badRows.length > 0 ? (
            <p role="alert" className={`mt-3 ${WARN_BOX}`} data-testid="text-excluded-rows">
              {badRows.length === 1 ? `Part ${badRows[0]} is` : `Parts ${badRows.join(", ")} are`} left out of the totals
              until fixed.
            </p>
          ) : null}
        </ToolPanel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Redundancy and headroom">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Redundancy">
              {REDUNDANCY.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pickRedundancy(r.id)}
                  aria-pressed={redundancy === r.id}
                  data-testid={`button-redundancy-${r.id}`}
                  className={`${CHIP_CLASS} ${redundancy === r.id ? CHIP_ON : CHIP_OFF}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className={HINT_TEXT}>{REDUNDANCY.find((r) => r.id === redundancy)?.note}</p>
            {nNeeded ? (
              <div className="mt-4">
                <label htmlFor="psu-n" className={LABEL_CLASS}>
                  N, supplies that carry the load
                </label>
                <input
                  id="psu-n"
                  value={nRaw}
                  onChange={(e) => setNRaw(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!n.ok}
                  aria-describedby="psu-n-msg"
                  data-testid="input-n"
                  className={`mt-2 ${INPUT_CLASS} sm:max-w-[160px]`}
                />
                <p id="psu-n-msg" className={n.ok ? HINT_TEXT : ERROR_TEXT} role={n.ok ? undefined : "alert"}>
                  {n.ok ? nMessage : n.message}
                </p>
              </div>
            ) : null}

            <div className="mt-5">
              <label htmlFor="psu-margin" className={LABEL_CLASS}>
                Headroom over peak, percent
              </label>
              <input
                id="psu-margin"
                value={marginRaw}
                onChange={(e) => setMarginRaw(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={!margin.ok}
                aria-describedby="psu-margin-msg"
                data-testid="input-margin"
                className={`mt-2 ${INPUT_CLASS} sm:max-w-[160px]`}
              />
              <p id="psu-margin-msg" className={margin.ok ? HINT_TEXT : ERROR_TEXT} role={margin.ok ? undefined : "alert"}>
                {margin.ok
                  ? "Room for parts added later, aging capacitors and a hot inlet, which derates many supplies."
                  : margin.message}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MARGIN_CHIPS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMarginRaw(m)}
                    aria-pressed={marginRaw.trim() === m}
                    data-testid={`button-margin-${m}`}
                    className={`${CHIP_CLASS} ${marginRaw.trim() === m ? CHIP_ON : CHIP_OFF}`}
                  >
                    {m}%
                  </button>
                ))}
              </div>
            </div>

            {sum.gpuPeak > 0 ? (
              <div className="mt-5">
                <label htmlFor="psu-transient" className={LABEL_CLASS}>
                  GPU transient, multiple of GPU peak
                </label>
                <input
                  id="psu-transient"
                  value={transientRaw}
                  onChange={(e) => setTransientRaw(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={!transient.ok}
                  aria-describedby="psu-transient-msg"
                  data-testid="input-transient"
                  className={`mt-2 ${INPUT_CLASS} sm:max-w-[160px]`}
                />
                <p
                  id="psu-transient-msg"
                  className={transient.ok ? HINT_TEXT : ERROR_TEXT}
                  role={transient.ok ? undefined : "alert"}
                >
                  {transient.ok
                    ? "GPUs can spike well above board power for well under a millisecond. 1 ignores the spikes."
                    : transient.message}
                </p>
              </div>
            ) : null}
          </ToolPanel>

          <ToolPanel title="Efficiency and cost">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="psu-standard" className={LABEL_CLASS}>
                  Test standard
                </label>
                <select
                  id="psu-standard"
                  value={standard}
                  onChange={(e) => changeStandard(e.target.value as Standard)}
                  data-testid="select-standard"
                  className={`mt-2 ${SELECT_CLASS}`}
                >
                  {STANDARDS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label htmlFor="psu-tier" className={LABEL_CLASS}>
                  80 PLUS tier
                </label>
                <select
                  id="psu-tier"
                  value={tier}
                  onChange={(e) => setTier(e.target.value as Tier)}
                  data-testid="select-tier"
                  className={`mt-2 ${SELECT_CLASS}`}
                >
                  {TIERS.filter((t) => tierAvailable(standard, t.id)).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={HINT_TEXT}>{STANDARDS.find((s) => s.id === standard)?.note}</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[340px] border-collapse" data-testid="table-efficiency">
                <caption className="sr-only">
                  Minimum efficiency for {tierLabel}, {standardLabel}, at each certified load
                </caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Load
                    </th>
                    {LOAD_POINTS.map((p) => (
                      <th key={p} scope="col" className={TH_CLASS}>
                        {p * 100}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className={TH_CLASS}>
                      Min. efficiency
                    </th>
                    {(EFFICIENCY_TABLE[standard][tier] ?? LOAD_POINTS.map(() => null)).map((e, i) => (
                      <td key={i} className="py-2 pr-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {e === null ? <span className="text-[hsl(var(--brand-ash))]">none</span> : `${e}%`}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <label htmlFor="psu-price" className={LABEL_CLASS}>
                  Electricity, USD per kWh
                </label>
                <input
                  id="psu-price"
                  value={priceRaw}
                  onChange={(e) => setPriceRaw(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={!price.ok}
                  aria-describedby={price.ok ? undefined : "psu-price-error"}
                  data-testid="input-price"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                {!price.ok ? (
                  <p id="psu-price-error" role="alert" className={ERROR_TEXT}>
                    {price.message}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <label htmlFor="psu-rating" className={LABEL_CLASS}>
                  Rating to check, W
                </label>
                <input
                  id="psu-rating"
                  value={ratingRaw}
                  onChange={(e) => setRatingRaw(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="blank = recommended"
                  aria-invalid={rating !== null && !rating.ok}
                  aria-describedby="psu-rating-msg"
                  data-testid="input-rating"
                  className={`mt-2 ${INPUT_CLASS}`}
                />
                <p
                  id="psu-rating-msg"
                  className={rating && !rating.ok ? ERROR_TEXT : HINT_TEXT}
                  role={rating && !rating.ok ? "alert" : undefined}
                >
                  {rating && !rating.ok ? rating.message : "Leave blank to use the recommendation, or enter a supply you already have."}
                </p>
              </div>
            </div>
          </ToolPanel>
        </div>

        <p role="status" aria-live="polite" className="sr-only" data-testid="text-summary">
          {status}
        </p>

        {!result ? (
          <ToolPanel>
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="output-psu">
              {status}
            </p>
          </ToolPanel>
        ) : (
          <div className="space-y-6" data-testid="output-psu">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ToolPanel title="Recommendation">
                <p
                  className="font-display text-3xl font-medium tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
                  data-testid="text-recommended"
                >
                  {result.installed} x {watts(result.evaluatedW)}
                </p>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                  {redundancyLabel}, {tierLabel}, {standardLabel}.{" "}
                  {rating && rating.ok
                    ? "This is the rating you entered."
                    : result.recommendedW
                      ? `The smallest common rating at or above ${watts(result.requiredPerPsuW)}.`
                      : `No common rating reaches ${watts(result.requiredPerPsuW)}. Use N+1 or N+N with a larger N so each supply carries less.`}
                </p>
                <div className="mt-4">
                  <ToolResult label="DC load, typical" value={watts(sum.typical)} testId="text-dc-typical" />
                  <ToolResult label="DC load, peak" value={watts(sum.peak)} testId="text-dc-peak" />
                  <ToolResult
                    label="Peak plus headroom"
                    value={watts(sum.peak * (1 + (margin.ok ? margin.value : 0) / 100))}
                  />
                  <ToolResult label="Needed per supply" value={watts(result.requiredPerPsuW)} testId="text-required" />
                  <ToolResult
                    label="Recommended rating"
                    value={result.recommendedW ? watts(result.recommendedW) : `over ${watts(COMMON_RATINGS[COMMON_RATINGS.length - 1])}`}
                  />
                  <ToolResult
                    label={result.installed > result.carrying ? "Capacity after a failure" : "Total capacity, not redundant"}
                    value={`${watts(result.carrying * result.evaluatedW)} (${pct(result.headroomFraction)} ${result.headroomFraction >= 0 ? "over" : "under"} peak)`}
                    testId="text-capacity"
                  />
                </div>
              </ToolPanel>

              <ToolPanel title="Operating point">
                <ToolResult
                  label="Load per supply, typical"
                  value={`${pct(result.typical.loadFraction)} at ${pct(result.typical.efficiency)} efficiency`}
                  testId="text-load-typical"
                />
                <ToolResult
                  label="Load per supply, peak"
                  value={`${pct(result.peak.loadFraction)} at ${pct(result.peak.efficiency)} efficiency`}
                  testId="text-load-peak"
                />
                {result.afterFailure ? (
                  <ToolResult label="Peak after a failure" value={pct(result.afterFailure.loadFraction)} />
                ) : null}
                <ToolResult label="Wall power, typical" value={watts(result.typical.wallW)} testId="text-wall-typical" />
                <ToolResult label="Wall power, peak" value={watts(result.peak.wallW)} testId="text-wall-peak" />
                <ToolResult label="Lost in the supplies, typical" value={watts(result.typical.lossW)} />
                <ToolResult
                  label="Heat to remove, typical"
                  value={`${Math.round(result.btuPerHourTypical).toLocaleString("en-US")} BTU/hr`}
                />
                <ToolResult
                  label="Energy per year"
                  value={`${Math.round(result.annualKwh).toLocaleString("en-US")} kWh`}
                  testId="text-annual-kwh"
                />
                <ToolResult label="Cost per year" value={usd(result.annualCost)} testId="text-annual-cost" />
                <div className="mt-4">
                  <div className={LABEL_CLASS}>Load on each supply</div>
                  <LoadMeter
                    typical={result.typical.loadFraction}
                    peak={result.peak.loadFraction}
                    afterFailure={result.afterFailure ? result.afterFailure.loadFraction : null}
                    lowest={lowestPoint}
                  />
                </div>
              </ToolPanel>
            </div>

            {result.transient ? (
              <div
                className={`rounded-2xl border p-5 ${
                  result.transient.ratio > 1
                    ? "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.06)]"
                    : "border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.06)]"
                }`}
                data-testid="panel-transient"
              >
                <div
                  className={`font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] ${
                    result.transient.ratio > 1 ? "text-[hsl(var(--brand-amber))]" : "text-[hsl(var(--brand-signal))]"
                  }`}
                >
                  GPU transients
                </div>
                <p className="mt-2 break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  If every GPU spikes to {transient.ok ? transient.value : 1} times its peak figure while everything
                  else is at peak, the {watts(sum.gpuPeak)} of GPU peak becomes{" "}
                  {watts(sum.gpuPeak * (transient.ok ? transient.value : 1))} and the server draws about{" "}
                  {watts(result.transient.watts)}, against {watts(result.transient.capacityW)} of continuous rating
                  {result.installed > result.carrying ? " left after a failure" : ""}.{" "}
                  {result.transient.ratio > 1
                    ? "Riding through that depends on the supply's tolerance for short excursions above its rating and on where its overcurrent protection trips. Check the vendor's figures, or size up."
                    : "The spike stays within the continuous rating, so it does not lean on the supply's excursion tolerance."}
                </p>
              </div>
            ) : null}

            {notes.length > 0 ? (
              <div className="space-y-3" data-testid="list-psu-warnings">
                {notes.map((note) => (
                  <p key={note} className={WARN_BOX}>
                    {note}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={summary} label="Copy the sizing as text" testId="button-copy-summary">
                <span>Copy summary</span>
              </CopyButton>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
