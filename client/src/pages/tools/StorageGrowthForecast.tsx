/**
 * Storage growth forecast.
 *
 * Takes current usage, capacity and a growth rate (or two dated readings to
 * derive one) and works out when each alert threshold and the full mark
 * are crossed, with an optional capacity expansion at a given month. The
 * chart is plain SVG for the lines, with the axis labels and crossing dots
 * in HTML so they keep the reader's text size and stay round at any width.
 * All arithmetic is in lib/toolkit/storage-growth-forecast.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MAX_COMPOUND_PCT,
  MAX_DATE_MONTHS,
  MAX_HORIZON_MONTHS,
  addMonths,
  annualRate,
  autoHorizon,
  capacityAt,
  crossings,
  dateAtMonths,
  doublingMonths,
  estimateFromTwoPoints,
  formatDate,
  monthTickStep,
  monthsToEmpty,
  niceTicks,
  parseIsoDate,
  parseNumber,
  parseThresholds,
  projection,
  toIso,
  usedAt,
  type Crossing,
  type Expansion,
  type Growth,
  type YMD,
} from "@/lib/toolkit/storage-growth-forecast";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const ERROR_CLASS = "mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-1.5 font-mono-tight text-[0.6875rem] leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const TH_CLASS =
  "py-2 pr-4 text-left font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD_CLASS = "whitespace-nowrap py-2 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]";
const NOTE_CLASS = "break-words rounded-lg border p-3 font-mono-tight text-xs leading-relaxed";
const WARN_NOTE = `${NOTE_CLASS} border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]`;
const INFO_NOTE = `${NOTE_CLASS} border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] text-[hsl(var(--brand-bone-dim))]`;

const UNITS = ["GB", "TB", "PB", "GiB", "TiB", "PiB"] as const;
type Unit = (typeof UNITS)[number];

type Mode = "linear" | "compound" | "two-point";
const MODES: { id: Mode; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "compound", label: "Compound" },
  { id: "two-point", label: "Two readings" },
];

/* SVG plot box. The SVG stretches to its container, so these are only a coordinate system. */
const PW = 1000;
const PH = 400;

function today(): YMD {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "too large to show";
  const a = Math.abs(n);
  if (a >= 1e15) return n.toExponential(3);
  const digits = a < 100 ? 2 : a < 10000 ? 1 : 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtMonths(t: number): string {
  return `${t.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${
    t === 1 ? "month" : "months"
  }`;
}

function fmtPct(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "over 1,000,000%";
  if (ratio * 100 >= 1e6) return "over 1,000,000%";
  return `${(ratio * 100).toLocaleString("en-US", { maximumFractionDigits: digits })}%`;
}

function levelLabel(pct: number): string {
  return pct === 100 ? "Full" : `${pct.toLocaleString("en-US")}%`;
}

/** "4.0 months, Feb 28, 2027", or the reason there is no date. */
function crossingText(asOf: YMD, t: number | null): { main: string; date: string | null } {
  if (t === null) return { main: "Not reached at this rate", date: null };
  if (t === 0) return { main: "Already above", date: null };
  if (t > MAX_DATE_MONTHS) return { main: "More than 100 years away", date: null };
  return { main: fmtMonths(t), date: formatDate(dateAtMonths(asOf, t)) };
}

function CrossingCell({ asOf, t, testId }: { asOf: YMD; t: number | null; testId?: string }) {
  const c = crossingText(asOf, t);
  return (
    <span data-testid={testId}>
      <span className="text-[hsl(var(--brand-bone))]">{c.main}</span>
      {c.date ? <span className="block text-xs text-[hsl(var(--brand-ash))]">{c.date}</span> : null}
    </span>
  );
}

function ExpansionCell({ asOf, c }: { asOf: YMD; c: Crossing }) {
  const e = c.withExpansion;
  if (!e) return null;
  if (!e.beforeExpansion) return <CrossingCell asOf={asOf} t={e.first} />;
  const first = crossingText(asOf, e.first);
  let after: string;
  if (e.stillAbove) after = "before the capacity arrives, and still above once it does";
  else if (e.again === null) after = "before the capacity arrives, then not again at this rate";
  else if (e.again > MAX_DATE_MONTHS) after = "before the capacity arrives, then not again for more than 100 years";
  else after = `before the capacity arrives, then again in ${fmtMonths(e.again)}, ${formatDate(dateAtMonths(asOf, e.again))}`;
  return (
    <span>
      <span className="text-[hsl(var(--brand-amber))]">{first.main}</span>
      {first.date ? <span className="block text-xs text-[hsl(var(--brand-ash))]">{first.date}</span> : null}
      <span className="mt-1 block text-xs text-[hsl(var(--brand-bone-dim))]">{after}</span>
    </span>
  );
}

function RadioRow<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={`flex min-h-[44px] min-w-[7rem] flex-1 cursor-pointer items-center justify-center rounded-lg border px-3 text-center font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
              value === option.id
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
              data-testid={`radio-${name}-${option.id}`}
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  testId?: string;
  inputMode?: "decimal" | "numeric" | "text";
  type?: "text" | "date";
}

function Field({ id, label, value, onChange, error, hint, testId, inputMode = "decimal", type = "text" }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === "date" ? undefined : inputMode}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : false}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        min={type === "date" ? "1900-01-01" : undefined}
        max={type === "date" ? "9000-12-31" : undefined}
        data-testid={testId}
        className={INPUT_CLASS}
      />
      {error ? (
        <p id={`${id}-msg`} className={ERROR_CLASS}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className={HINT_CLASS}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function StorageGrowthForecast() {
  const [initialToday] = useState(today);
  const [unit, setUnit] = useState<Unit>("TB");
  const [usedRaw, setUsedRaw] = useState("42");
  const [totalRaw, setTotalRaw] = useState("60");
  const [asOfRaw, setAsOfRaw] = useState(() => toIso(initialToday));
  const [mode, setMode] = useState<Mode>("linear");
  const [linearRaw, setLinearRaw] = useState("1.5");
  const [compoundRaw, setCompoundRaw] = useState("3");
  const [earlierDateRaw, setEarlierDateRaw] = useState(() => toIso(addMonths(initialToday, -6)));
  const [earlierUsedRaw, setEarlierUsedRaw] = useState("33");
  const [twoPointModel, setTwoPointModel] = useState<"linear" | "compound">("linear");
  const [thresholdsRaw, setThresholdsRaw] = useState("80, 90");
  const [expandOn, setExpandOn] = useState(false);
  const [expandMonthRaw, setExpandMonthRaw] = useState("6");
  const [expandAddRaw, setExpandAddRaw] = useState("40");
  const [horizonRaw, setHorizonRaw] = useState("");

  /* ------------------------------------------------------------ inputs */

  const parsed = useMemo(() => {
    const errors: Record<string, string> = {};
    const notes: string[] = [];

    const used = parseNumber(usedRaw);
    const total = parseNumber(totalRaw);
    let usedV: number | null = null;
    let totalV: number | null = null;
    if (!total.ok) errors.total = total.message;
    else if (total.value === null) errors.total = "Enter the total capacity.";
    else if (total.value <= 0) errors.total = "Total capacity has to be more than 0.";
    else totalV = total.value;
    if (!used.ok) errors.used = used.message;
    else if (used.value === null) errors.used = "Enter the capacity in use now.";
    else if (used.value < 0) errors.used = "Usage cannot be negative.";
    else if (totalV !== null && used.value > totalV)
      errors.used = "Used is larger than the total. Check both are in the same unit.";
    else usedV = used.value;

    const asOf = parseIsoDate(asOfRaw);
    if (!asOf) errors.asOf = "Enter a real date between 1900 and 9000.";

    let growth: Growth | null = null;
    let estimate: ReturnType<typeof estimateFromTwoPoints> | null = null;
    if (mode === "linear") {
      const r = parseNumber(linearRaw);
      if (!r.ok) errors.linear = r.message;
      else if (r.value === null) errors.linear = "Enter how much usage grows per month. Use 0 for flat, or a negative number for shrinking.";
      else growth = { model: "linear", perMonth: r.value, rate: 0 };
    } else if (mode === "compound") {
      const r = parseNumber(compoundRaw);
      if (!r.ok) errors.compound = r.message;
      else if (r.value === null) errors.compound = "Enter the growth per month as a percentage.";
      else if (r.value <= -100) errors.compound = "A shrink of 100% or more a month would leave less than nothing.";
      else if (r.value > MAX_COMPOUND_PCT) errors.compound = `The rate is capped at ${MAX_COMPOUND_PCT}% a month.`;
      else growth = { model: "compound", perMonth: 0, rate: r.value / 100 };
    } else {
      const earlier = parseIsoDate(earlierDateRaw);
      const earlierUsed = parseNumber(earlierUsedRaw);
      if (!earlier) errors.earlierDate = "Enter a real date between 1900 and 9000.";
      if (!earlierUsed.ok) errors.earlierUsed = earlierUsed.message;
      else if (earlierUsed.value === null) errors.earlierUsed = "Enter the usage at the earlier reading.";
      else if (earlierUsed.value < 0) errors.earlierUsed = "Usage cannot be negative.";
      if (earlier && asOf && usedV !== null && earlierUsed.ok && earlierUsed.value !== null && earlierUsed.value >= 0) {
        estimate = estimateFromTwoPoints(earlier, earlierUsed.value, asOf, usedV);
        if (!estimate.ok) errors.earlierDate = estimate.message;
        else {
          const e = estimate.value;
          if (e.days < 28) {
            notes.push(
              `The readings are ${e.days} ${e.days === 1 ? "day" : "days"} apart. A rate from a short window mostly measures whatever happened that week.`,
            );
          }
          if (twoPointModel === "compound" && e.rate !== null) {
            growth = { model: "compound", perMonth: 0, rate: e.rate };
          } else {
            if (twoPointModel === "compound") {
              notes.push("A percentage rate needs both readings above zero, so this projects the linear rate instead.");
            }
            growth = { model: "linear", perMonth: e.perMonth, rate: 0 };
          }
        }
      }
    }

    const thresholds = parseThresholds(thresholdsRaw);
    if (!thresholds.ok) errors.thresholds = thresholds.message;

    let expansion: Expansion | null = null;
    if (expandOn) {
      const m = parseNumber(expandMonthRaw);
      const add = parseNumber(expandAddRaw);
      let month: number | null = null;
      if (!m.ok) errors.expandMonth = m.message;
      else if (m.value === null || !Number.isInteger(m.value) || m.value < 0 || m.value > MAX_DATE_MONTHS)
        errors.expandMonth = `Enter a whole month from 0 (now) to ${MAX_DATE_MONTHS}.`;
      else month = m.value;
      if (!add.ok) errors.expandAdd = add.message;
      else if (add.value === null || add.value <= 0) errors.expandAdd = "Enter how much capacity is added.";
      else if (month !== null) expansion = { atMonth: month, add: add.value };
    }

    let horizon: number | null = null;
    if (horizonRaw.trim() !== "") {
      const h = parseNumber(horizonRaw);
      if (!h.ok) errors.horizon = h.message;
      else if (h.value === null || !Number.isInteger(h.value) || h.value < 1 || h.value > MAX_HORIZON_MONTHS)
        errors.horizon = `Enter a whole number of months from 1 to ${MAX_HORIZON_MONTHS}, or leave it blank.`;
      else horizon = h.value;
    }

    return {
      errors,
      notes,
      used: usedV,
      total: totalV,
      asOf,
      growth,
      estimate: estimate && estimate.ok ? estimate.value : null,
      thresholds: thresholds.ok ? thresholds.value : null,
      expansion,
      expansionBlocked: expandOn && expansion === null,
      horizon,
    };
  }, [
    usedRaw,
    totalRaw,
    asOfRaw,
    mode,
    linearRaw,
    compoundRaw,
    earlierDateRaw,
    earlierUsedRaw,
    twoPointModel,
    thresholdsRaw,
    expandOn,
    expandMonthRaw,
    expandAddRaw,
    horizonRaw,
  ]);

  const { errors } = parsed;
  const ready =
    parsed.used !== null &&
    parsed.total !== null &&
    parsed.asOf !== null &&
    parsed.growth !== null &&
    parsed.thresholds !== null &&
    !parsed.expansionBlocked &&
    !errors.horizon;

  /* ------------------------------------------------------------ forecast */

  const forecast = useMemo(() => {
    if (!ready) return null;
    const used = parsed.used as number;
    const total = parsed.total as number;
    const asOf = parsed.asOf as YMD;
    const growth = parsed.growth as Growth;
    const list = crossings(used, total, growth, parsed.thresholds as number[], parsed.expansion);
    const horizon = parsed.horizon ?? autoHorizon(list);
    const rows = projection(asOf, used, total, growth, parsed.expansion, horizon);
    return { used, total, asOf, growth, list, horizon, rows, expansion: parsed.expansion };
  }, [ready, parsed]);

  /* ---------------------------------------------------------------- chart */

  const chart = useMemo(() => {
    if (!forecast) return null;
    const { used, total, growth, horizon, rows, expansion, list } = forecast;
    const capMax = Math.max(...rows.map((r) => r.capacity));
    const usedMax = Math.max(...rows.map((r) => r.used));
    const top = Math.max(capMax, Math.min(usedMax, capMax * 1.5)) * 1.04;
    const ticks = niceTicks(top);
    const yTop = ticks[ticks.length - 1];
    const x = (t: number) => (t / horizon) * PW;
    const y = (v: number) => PH - (v / yTop) * PH;

    const samples = Math.min(480, horizon * 8);
    const usedPts: string[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = (i / samples) * horizon;
      const v = usedAt(used, growth, t);
      // Points far above the box are pinned just outside it; the SVG clips the rest.
      usedPts.push(`${x(t).toFixed(2)},${Math.max(-PH, y(Math.max(0, v))).toFixed(2)}`);
    }

    const steps = expansion && expansion.atMonth <= horizon;
    const stepPath = (level: number) => {
      const a = y(level * total);
      if (!steps || !expansion) return `M0,${a.toFixed(2)} H${PW}`;
      const b = y(level * (total + expansion.add));
      const xm = x(expansion.atMonth).toFixed(2);
      return `M0,${a.toFixed(2)} H${xm} V${b.toFixed(2)} H${PW}`;
    };

    const dots: { t: number; v: number; pct: number }[] = [];
    for (const c of list) {
      const times = c.withExpansion
        ? [c.withExpansion.first, c.withExpansion.again]
        : [c.base];
      for (const t of times) {
        if (t === null || t <= 0 || t > horizon) continue;
        const v = (c.pct / 100) * capacityAt(total, expansion, t);
        if (v <= yTop) dots.push({ t, v, pct: c.pct });
      }
    }

    const step = monthTickStep(horizon);
    const xTicks: number[] = [];
    for (let m = 0; m <= horizon; m += step) xTicks.push(m);

    return { ticks, yTop, x, y, usedPts: usedPts.join(" "), stepPath, dots, xTicks, steps };
  }, [forecast]);

  /* -------------------------------------------------------------- prose */

  let growthLine = "";
  let growthNote: string | null = null;
  if (forecast) {
    const g = forecast.growth;
    if (g.model === "linear") {
      growthLine = `${fmtNum(g.perMonth)} ${unit} per month, ${fmtNum(annualRate(g))} ${unit} per year`;
      if (g.perMonth === 0) {
        growthNote = "Usage is flat, so a threshold it is not already above is never reached.";
      } else if (g.perMonth < 0) {
        const empty = monthsToEmpty(forecast.used, g);
        growthNote =
          `Usage is shrinking, so a threshold it is not already above is never reached.` +
          (empty !== null && empty <= MAX_DATE_MONTHS
            ? ` At this rate it would be empty in ${fmtMonths(empty)}, around ${formatDate(dateAtMonths(forecast.asOf, empty))}.`
            : "");
      }
    } else {
      const doubling = doublingMonths(g.rate);
      growthLine =
        `${fmtPct(g.rate, 2)} per month, ${fmtPct(annualRate(g), 1)} per year` +
        (doubling !== null ? `, doubling every ${fmtMonths(doubling)}` : "");
      if (forecast.used === 0) {
        growthNote = "Compound growth from 0 stays at 0. Use the linear model, or enter the usage now.";
      } else if (g.rate === 0) {
        growthNote = "Usage is flat, so a threshold it is not already above is never reached.";
      } else if (g.rate < 0) {
        growthNote = `Usage is shrinking, halving every ${fmtMonths(Math.LN2 / -Math.log1p(g.rate))}, so a threshold it is not already above is never reached.`;
      }
    }
  }

  const fullCrossing = forecast?.list[forecast.list.length - 1];
  const summary = forecast
    ? `${fmtNum(forecast.used)} of ${fmtNum(forecast.total)} ${unit} used, ${fmtPct(forecast.used / forecast.total)}. ` +
      forecast.list
        .map((c) => {
          const t = c.withExpansion ? c.withExpansion.first : c.base;
          const text = crossingText(forecast.asOf, t);
          return `${levelLabel(c.pct)}: ${text.main.toLowerCase()}${text.date ? `, ${text.date}` : ""}.`;
        })
        .join(" ")
    : "Fix the highlighted fields to see a forecast.";

  const csv = forecast
    ? [
        `month,date,used_${unit},capacity_${unit},used_percent`,
        ...forecast.rows.map(
          (r) =>
            `${r.month},${toIso(r.date)},${Number(r.used.toPrecision(12))},${r.capacity},${(r.ratio * 100).toFixed(2)}`,
        ),
      ].join("\n")
    : "";

  const levels = forecast ? forecast.list.map((c) => c.pct) : [];
  function stateFor(ratio: number): { text: string; tone: string } {
    if (ratio > 1) return { text: "Over capacity", tone: "text-[hsl(var(--brand-danger))]" };
    if (ratio >= 1) return { text: "Full", tone: "text-[hsl(var(--brand-danger))]" };
    for (let i = levels.length - 2; i >= 0; i -= 1) {
      if (ratio * 100 >= levels[i]) return { text: `Above ${levels[i]}%`, tone: "text-[hsl(var(--brand-amber))]" };
    }
    return { text: "", tone: "" };
  }

  return (
    <ToolShell slug="storage-growth-forecast">
      <p role="status" aria-live="polite" className="sr-only">
        {summary}
      </p>
      <div className="space-y-6">
        <ToolPanel title="Capacity">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              id="sgf-used"
              label={`Used now (${unit})`}
              value={usedRaw}
              onChange={setUsedRaw}
              error={errors.used}
              testId="input-storage-used"
            />
            <Field
              id="sgf-total"
              label={`Total capacity (${unit})`}
              value={totalRaw}
              onChange={setTotalRaw}
              error={errors.total}
              hint="Usable capacity after RAID or replication."
              testId="input-storage-total"
            />
            <div>
              <label htmlFor="sgf-unit" className={LABEL_CLASS}>
                Unit
              </label>
              <select
                id="sgf-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value as Unit)}
                data-testid="select-storage-unit"
                className={INPUT_CLASS}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <p className={HINT_CLASS}>A label only. Every figure uses it.</p>
            </div>
            <Field
              id="sgf-asof"
              label="As of"
              type="date"
              value={asOfRaw}
              onChange={setAsOfRaw}
              error={errors.asOf}
              hint="The date of the usage figure."
              testId="input-storage-asof"
            />
          </div>
        </ToolPanel>

        <ToolPanel title="Growth">
          <RadioRow legend="Model" name="sgf-mode" options={MODES} value={mode} onChange={setMode} />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {mode === "linear" ? (
              <Field
                id="sgf-linear"
                label={`Added per month (${unit})`}
                value={linearRaw}
                onChange={setLinearRaw}
                error={errors.linear}
                hint="A fixed amount each month. 0 is flat; negative is shrinking."
                testId="input-storage-linear"
              />
            ) : mode === "compound" ? (
              <Field
                id="sgf-compound"
                label="Growth per month (%)"
                value={compoundRaw}
                onChange={setCompoundRaw}
                error={errors.compound}
                hint="A percentage of the current size each month."
                testId="input-storage-compound"
              />
            ) : (
              <>
                <Field
                  id="sgf-earlier-date"
                  label="Earlier reading date"
                  type="date"
                  value={earlierDateRaw}
                  onChange={setEarlierDateRaw}
                  error={errors.earlierDate}
                  testId="input-storage-earlier-date"
                />
                <Field
                  id="sgf-earlier-used"
                  label={`Used then (${unit})`}
                  value={earlierUsedRaw}
                  onChange={setEarlierUsedRaw}
                  error={errors.earlierUsed}
                  hint="The later reading is the usage and date above."
                  testId="input-storage-earlier-used"
                />
                <div className="sm:col-span-2">
                  <RadioRow
                    legend="Project the estimate as"
                    name="sgf-two-point"
                    options={[
                      { id: "linear", label: "Linear" },
                      { id: "compound", label: "Compound" },
                    ]}
                    value={twoPointModel}
                    onChange={setTwoPointModel}
                  />
                </div>
              </>
            )}
          </div>
          {mode === "two-point" && parsed.estimate ? (
            <p
              className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="text-storage-estimate"
            >
              {parsed.estimate.days.toLocaleString("en-US")} days ({fmtMonths(parsed.estimate.months)}) between readings.
              That is {fmtNum(parsed.estimate.perMonth)} {unit} per month as a straight line
              {parsed.estimate.rate !== null ? `, or ${fmtPct(parsed.estimate.rate, 2)} per month compounded` : ""}.
            </p>
          ) : null}
          {parsed.notes.length ? (
            <div className="mt-4 space-y-2">
              {parsed.notes.map((note) => (
                <p key={note} className={WARN_NOTE}>
                  {note}
                </p>
              ))}
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Alerts and what-if">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id="sgf-thresholds"
              label="Alert thresholds (%)"
              value={thresholdsRaw}
              onChange={setThresholdsRaw}
              error={errors.thresholds}
              hint="Comma separated. Full (100%) is always included."
              inputMode="text"
              testId="input-storage-thresholds"
            />
            <Field
              id="sgf-horizon"
              label="Chart span (months)"
              value={horizonRaw}
              onChange={setHorizonRaw}
              error={errors.horizon}
              hint={`Blank picks a span that shows the last crossing, up to ${MAX_HORIZON_MONTHS} months.`}
              inputMode="numeric"
              testId="input-storage-horizon"
            />
          </div>
          <label
            className={`mt-5 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-4 font-mono-tight text-[0.6875rem] uppercase tracking-[0.2em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
              expandOn
                ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
            }`}
          >
            <input
              type="checkbox"
              checked={expandOn}
              onChange={(e) => setExpandOn(e.target.checked)}
              className="sr-only"
              data-testid="checkbox-storage-expand"
            />
            <span aria-hidden="true">{expandOn ? "[x]" : "[ ]"}</span>
            Model adding capacity
          </label>
          {expandOn ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="sgf-expand-month"
                label="Arrives at month"
                value={expandMonthRaw}
                onChange={setExpandMonthRaw}
                error={errors.expandMonth}
                hint={
                  parsed.asOf && !errors.expandMonth && /^\d+$/.test(expandMonthRaw.trim())
                    ? `Month ${expandMonthRaw.trim()} is ${formatDate(addMonths(parsed.asOf, Number(expandMonthRaw.trim())))}. 0 means now.`
                    : "Counted from the as-of date. 0 means now."
                }
                inputMode="numeric"
                testId="input-storage-expand-month"
              />
              <Field
                id="sgf-expand-add"
                label={`Capacity added (${unit})`}
                value={expandAddRaw}
                onChange={setExpandAddRaw}
                error={errors.expandAdd}
                hint="Usable capacity, after RAID or replication."
                testId="input-storage-expand-add"
              />
            </div>
          ) : null}
        </ToolPanel>

        {forecast && chart ? (
          <div className="space-y-6" data-testid="output-storage">
            <ToolPanel title="Forecast">
              <ToolResult
                label="In use now"
                value={`${fmtNum(forecast.used)} of ${fmtNum(forecast.total)} ${unit} · ${fmtPct(forecast.used / forecast.total)}`}
                testId="text-storage-utilization"
              />
              <ToolResult label="Growth" value={growthLine} testId="text-storage-growth" />
              {forecast.expansion ? (
                <ToolResult
                  label="After expansion"
                  value={`${fmtNum(forecast.total + forecast.expansion.add)} ${unit} from ${formatDate(
                    addMonths(forecast.asOf, forecast.expansion.atMonth),
                  )}`}
                />
              ) : null}
              {growthNote ? <p className={`${INFO_NOTE} mt-4`}>{growthNote}</p> : null}

              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse" data-testid="table-storage-thresholds">
                  <caption className="sr-only">Time until each threshold is crossed</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Level
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        At
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        {forecast.expansion ? "Without expansion" : "Crossed in"}
                      </th>
                      {forecast.expansion ? (
                        <th scope="col" className={TH_CLASS}>
                          With expansion
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.list.map((c) => (
                      <tr key={c.pct} className="border-b border-[hsl(var(--brand-iron)/0.5)] align-top">
                        <th
                          scope="row"
                          className={`py-2 pr-4 text-left font-mono-tight text-sm font-normal ${
                            c.pct === 100 ? "text-[hsl(var(--brand-danger))]" : "text-[hsl(var(--brand-amber))]"
                          }`}
                        >
                          {levelLabel(c.pct)}
                        </th>
                        <td className={TD_CLASS}>
                          {fmtNum((c.pct / 100) * forecast.total)} {unit}
                        </td>
                        <td className="py-2 pr-4 font-mono-tight text-sm">
                          <CrossingCell asOf={forecast.asOf} t={c.base} testId={`text-storage-cross-${c.pct}`} />
                        </td>
                        {forecast.expansion ? (
                          <td className="max-w-[18rem] py-2 pr-4 font-mono-tight text-sm">
                            <ExpansionCell asOf={forecast.asOf} c={c} />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {forecast.expansion && fullCrossing?.withExpansion?.beforeExpansion && fullCrossing.base !== 0 ? (
                <p className={`${WARN_NOTE} mt-4`}>
                  The volume fills before the new capacity arrives. Either bring the expansion forward to month{" "}
                  {Math.max(0, Math.floor(fullCrossing.base as number))} or earlier, or plan for writes failing in
                  between.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Projection">
              <div
                role="img"
                aria-label={`Chart of projected usage over ${forecast.horizon} months. ${summary}`}
                data-testid="chart-storage"
              >
                <div className="flex gap-2" aria-hidden="true">
                  <div className="relative h-64 w-12 shrink-0 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))] sm:h-72 sm:w-14">
                    {chart.ticks.map((v) => (
                      <span
                        key={v}
                        className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                        style={{ top: `${(1 - v / chart.yTop) * 100}%` }}
                      >
                        {fmtNum(v)}
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="relative h-64 border-b border-l border-[hsl(var(--brand-iron))] sm:h-72">
                      <svg
                        viewBox={`0 0 ${PW} ${PH}`}
                        preserveAspectRatio="none"
                        className="absolute inset-0 block h-full w-full overflow-hidden"
                      >
                        {chart.ticks.map((v) => (
                          <line
                            key={v}
                            x1="0"
                            x2={PW}
                            y1={chart.y(v)}
                            y2={chart.y(v)}
                            stroke="hsl(var(--brand-iron))"
                            strokeWidth="1"
                            opacity="0.6"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                        {chart.steps && forecast.expansion ? (
                          <line
                            x1={chart.x(forecast.expansion.atMonth)}
                            x2={chart.x(forecast.expansion.atMonth)}
                            y1="0"
                            y2={PH}
                            stroke="hsl(var(--brand-cyan))"
                            strokeWidth="1.5"
                            strokeDasharray="2 4"
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null}
                        {forecast.list.slice(0, -1).map((c) => (
                          <path
                            key={c.pct}
                            d={chart.stepPath(c.pct / 100)}
                            fill="none"
                            stroke="hsl(var(--brand-amber))"
                            strokeWidth="1.5"
                            strokeDasharray="6 5"
                            opacity="0.85"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                        <path
                          d={chart.stepPath(1)}
                          fill="none"
                          stroke="hsl(var(--brand-danger))"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                        />
                        <polyline
                          points={chart.usedPts}
                          fill="none"
                          stroke="hsl(var(--brand-signal))"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                      {chart.dots.map((d, i) => (
                        <span
                          key={i}
                          className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[hsl(var(--brand-obsidian))] ${
                            d.pct === 100 ? "bg-[hsl(var(--brand-danger))]" : "bg-[hsl(var(--brand-amber))]"
                          }`}
                          style={{ left: `${(d.t / forecast.horizon) * 100}%`, top: `${(1 - d.v / chart.yTop) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div className="relative mt-2 h-4 font-mono-tight text-[0.625rem] text-[hsl(var(--brand-ash))]">
                      {chart.xTicks.map((m) => (
                        <span
                          key={m}
                          className={`absolute whitespace-nowrap ${
                            m === 0 ? "" : m / forecast.horizon > 0.95 ? "-translate-x-full" : "-translate-x-1/2"
                          }`}
                          style={{ left: `${(m / forecast.horizon) * 100}%` }}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-center font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      Months from {formatDate(forecast.asOf)} · {unit} on the left
                    </p>
                  </div>
                </div>
              </div>
              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono-tight text-[0.6875rem] text-[hsl(var(--brand-bone-dim))]">
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-[3px] w-5 rounded-full bg-[hsl(var(--brand-signal))]" />
                  Projected usage
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block h-[2px] w-5 rounded-full bg-[hsl(var(--brand-danger))]" />
                  Capacity (full)
                </li>
                {forecast.list.length > 1 ? (
                  <li className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-0 w-5 border-t-2 border-dashed border-[hsl(var(--brand-amber))]"
                    />
                    Alert thresholds
                  </li>
                ) : null}
                {chart.steps ? (
                  <li className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-0 w-5 border-t-2 border-dotted border-[hsl(var(--brand-cyan))]"
                    />
                    Capacity arrives
                  </li>
                ) : null}
                {chart.dots.length ? (
                  <li className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-full bg-[hsl(var(--brand-amber))]" />
                    Crossing
                  </li>
                ) : null}
              </ul>
              {forecast.expansion && !chart.steps ? (
                <p className={HINT_CLASS}>
                  The expansion at month {forecast.expansion.atMonth} is past the end of the chart. Lengthen the span to
                  see it.
                </p>
              ) : null}
            </ToolPanel>

            <ToolPanel title="Month by month">
              <div className="max-h-[28rem] overflow-auto">
                <table className="w-full min-w-[520px] border-collapse" data-testid="table-storage-months">
                  <caption className="sr-only">Projected usage at each month</caption>
                  <thead className="sticky top-0 bg-[hsl(var(--brand-graphite))]">
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Month
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Date
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Used
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Capacity
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Used %
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        State
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.rows.map((r) => {
                      const state = stateFor(r.ratio);
                      return (
                        <tr key={r.month} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                          <th scope="row" className={`${TD_CLASS} text-left font-normal text-[hsl(var(--brand-ash))]`}>
                            {r.month}
                          </th>
                          <td className={TD_CLASS}>{formatDate(r.date)}</td>
                          <td className={TD_CLASS}>
                            {fmtNum(r.used)} {unit}
                          </td>
                          <td className={TD_CLASS}>
                            {fmtNum(r.capacity)} {unit}
                          </td>
                          <td className={TD_CLASS}>{fmtPct(r.ratio)}</td>
                          <td className={`whitespace-nowrap py-2 pr-4 font-mono-tight text-xs ${state.tone}`}>
                            {state.text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={`${HINT_CLASS} mt-3`}>
                Projected usage keeps rising past the full mark, which shows how much more would be written if there
                were room for it.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <CopyButton value={csv} label="Copy the projection as CSV" testId="button-copy-storage-csv">
                  <span>Copy as CSV</span>
                </CopyButton>
              </div>
            </ToolPanel>
          </div>
        ) : (
          <p className={INFO_NOTE} data-testid="output-storage">
            Fix the highlighted fields to see a forecast.
          </p>
        )}
      </div>
    </ToolShell>
  );
}
