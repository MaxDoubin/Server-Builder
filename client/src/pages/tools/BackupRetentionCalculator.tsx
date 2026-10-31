/**
 * Backup retention and storage calculator.
 *
 * Every field is held as the string the reader typed and parsed on each
 * render, so a half-typed value shows a precise message instead of snapping
 * to a number. The model in lib/toolkit/backup-retention-calculator runs a
 * day-by-day simulation of a steady-state year for every backup scheme at
 * once, which is what lets the page compare them side by side and show the
 * backups a policy keeps only because something newer depends on them.
 */

import { useDeferredValue, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { pluralise } from "@/lib/plural";
import {
  EVAL_DAYS,
  MAX_COPIES,
  MAX_DAYS,
  MAX_FULL_BYTES,
  MAX_LOCK_DAYS,
  MAX_MONTHLY,
  MAX_RATIO,
  MAX_WEEKLY,
  MAX_YEARLY,
  type Cadence,
  type ModelInput,
  type Parsed,
  type RetentionMode,
  type Scheme,
  type SchemeOk,
  type SchemeResult,
  type StripCell,
  type UnitSystem,
  formatBytes,
  parseNumber,
  policyProblem,
  simulate,
} from "@/lib/toolkit/backup-retention-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------------ styles */

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const SELECT_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border px-4 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_ON =
  "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-signal))]";
const CHIP_OFF =
  "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]";
const ERROR_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_TEXT = "mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";
const TH_CLASS =
  "py-2 pr-4 text-left align-bottom font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";

/* ------------------------------------------------------------------- data */

type SizeUnit = "GB" | "TB" | "GiB" | "TiB";

const SIZE_UNITS: { id: SizeUnit; bytes: number; system: UnitSystem; label: string }[] = [
  { id: "GB", bytes: 1e9, system: "si", label: "GB (SI)" },
  { id: "TB", bytes: 1e12, system: "si", label: "TB (SI)" },
  { id: "GiB", bytes: 1024 ** 3, system: "iec", label: "GiB (IEC)" },
  { id: "TiB", bytes: 1024 ** 4, system: "iec", label: "TiB (IEC)" },
];

const KIND_NAME = { F: "full", I: "incremental", D: "differential" } as const;

/** Colors for the three backup kinds. The letter in each cell carries the same meaning. */
const KIND_STYLE = {
  F: "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.16)] text-[hsl(var(--brand-signal))]",
  I: "border-[hsl(var(--brand-cyan))] bg-[hsl(var(--brand-cyan)/0.14)] text-[hsl(var(--brand-cyan))]",
  D: "border-[hsl(var(--brand-amber))] bg-[hsl(var(--brand-amber)/0.14)] text-[hsl(var(--brand-amber))]",
} as const;

const DAY_HEADS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function schemeLabel(scheme: Scheme, cadence: Cadence): string {
  const every = cadence === "weekly" ? "Weekly" : "Monthly";
  if (scheme === "full") return "Full every day";
  if (scheme === "incremental") return `${every} full + incrementals`;
  if (scheme === "differential") return `${every} full + differentials`;
  return "Incremental forever";
}

const SCHEME_SHORT: Record<Scheme, string> = {
  full: "Full",
  incremental: "Incremental",
  differential: "Differential",
  forever: "Forever",
};

/* ----------------------------------------------------------------- helpers */

function errorOf(parsed: Parsed): string | null {
  return parsed.ok ? null : parsed.message;
}

function range(min: number, max: number): string {
  return min === max ? min.toLocaleString("en-US") : `${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`;
}

function ageText(days: number): string {
  if (days < 60) return `${days} ${pluralise(days, "day")}`;
  if (days < 730) return `${days.toLocaleString("en-US")} days (about ${(days / 30.44).toFixed(0)} months)`;
  return `${days.toLocaleString("en-US")} days (about ${(days / 365.25).toFixed(1)} years)`;
}

function countsText(r: SchemeOk): string {
  const parts: string[] = [];
  if (r.peakCounts.F) parts.push(`${r.peakCounts.F} ${pluralise(r.peakCounts.F, "full")}`);
  if (r.peakCounts.I) parts.push(`${r.peakCounts.I} ${pluralise(r.peakCounts.I, "incremental")}`);
  if (r.peakCounts.D) parts.push(`${r.peakCounts.D} ${pluralise(r.peakCounts.D, "differential")}`);
  return parts.join(", ");
}

function diskText(r: SchemeOk): string {
  if (r.diskMin === r.diskMax) return `${range(r.diskMin, r.diskMax)}, the same every day`;
  return `${range(r.diskMin, r.diskMax)}, largest on a ${r.peakWeekday}`;
}

function chainText(r: SchemeOk): string {
  const n = r.longestChain;
  if (n === 1) return "1 backup, every point is self-contained";
  if (r.scheme === "differential") return "2 backups: the full and one differential";
  return `${n} backups: a full and ${n - 1} ${pluralise(n - 1, "incremental")}`;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  parsed,
  hint,
  testId,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  parsed: Parsed;
  hint?: string;
  testId: string;
  suffix?: string;
}) {
  const error = errorOf(parsed);
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-invalid={error !== null}
          aria-describedby={describedBy}
          data-testid={testId}
          className={INPUT_CLASS}
        />
        {suffix ? (
          <span className="shrink-0 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className={ERROR_TEXT}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={HINT_TEXT}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function stripCellLabel(cell: StripCell): string {
  if (cell.age === null || cell.kind === null) return "";
  const when = cell.age === 0 ? "peak day" : `${cell.age} ${pluralise(cell.age, "day")} before`;
  if (!cell.kept) return `${when}: ${KIND_NAME[cell.kind]}, deleted`;
  const why = cell.policy ? "kept by policy" : "kept as a dependency or by the lock";
  return `${when}: ${KIND_NAME[cell.kind]}, ${why}, restore reads ${cell.chain}`;
}

function Strip({ result }: { result: SchemeOk }) {
  const kept = result.strip.filter((c) => c.kept).length;
  const extra = result.strip.filter((c) => c.kept && !c.policy).length;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1" aria-hidden="true" data-testid="grid-strip">
        {DAY_HEADS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center font-mono-tight text-[0.625rem] uppercase tracking-[0.12em] text-[hsl(var(--brand-ash))]"
          >
            {d}
          </div>
        ))}
        {result.strip.map((cell, i) => {
          if (cell.age === null || cell.kind === null) {
            return <div key={i} className="min-h-[32px] rounded-md" />;
          }
          const base = "flex min-h-[32px] items-center justify-center rounded-md border font-mono-tight text-xs";
          const look = cell.kept
            ? `${KIND_STYLE[cell.kind]} ${cell.policy ? "" : "border-dashed"}`
            : "border-[hsl(var(--brand-iron)/0.6)] text-[hsl(var(--brand-ash))] opacity-60";
          return (
            <div key={i} className={`${base} ${look}`} title={stripCellLabel(cell)}>
              {cell.kept ? cell.kind : "·"}
              {cell.age === 0 ? <span className="sr-only">peak day</span> : null}
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        In the six weeks ending on the peak day, {kept} {pluralise(kept, "backup is", "backups are")} on disk,
        {` ${extra}`} of them only because a newer backup depends on them or a lock still holds them.
      </p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))]">
        <li className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${KIND_STYLE.F}`}>F</span>
          Full
        </li>
        <li className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${KIND_STYLE.I}`}>I</span>
          Incremental
        </li>
        <li className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${KIND_STYLE.D}`}>D</span>
          Differential
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 rounded-md border border-dashed border-[hsl(var(--brand-bone-dim))]" />
          Dashed: kept only as a dependency or by the lock
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[hsl(var(--brand-iron)/0.6)] text-[hsl(var(--brand-ash))]">
            ·
          </span>
          Deleted
        </li>
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- component */

export function BackupRetentionCalculator() {
  const [sizeRaw, setSizeRaw] = useState("2");
  const [sizeUnitId, setSizeUnitId] = useState<SizeUnit>("TB");
  const [changeRaw, setChangeRaw] = useState("3");
  const [mode, setMode] = useState<RetentionMode>("gfs");
  const [daysRaw, setDaysRaw] = useState("30");
  const [dailyRaw, setDailyRaw] = useState("7");
  const [weeklyRaw, setWeeklyRaw] = useState("4");
  const [monthlyRaw, setMonthlyRaw] = useState("12");
  const [yearlyRaw, setYearlyRaw] = useState("3");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [compRaw, setCompRaw] = useState("1.5");
  const [dedupRaw, setDedupRaw] = useState("1");
  const [lockRaw, setLockRaw] = useState("0");
  const [copiesRaw, setCopiesRaw] = useState("2");
  const [selected, setSelected] = useState<Scheme>("incremental");

  const unit = SIZE_UNITS.find((u) => u.id === sizeUnitId) ?? SIZE_UNITS[1];

  const size = parseNumber(sizeRaw, "Full backup size", { min: 0, max: MAX_FULL_BYTES / unit.bytes });
  const sizeParsed: Parsed =
    size.ok && size.value === 0 ? { ok: false, message: "Full backup size must be more than zero." } : size;
  const change = parseNumber(changeRaw, "Daily change", { min: 0, max: 100 });
  const days = parseNumber(daysRaw, "Days kept", { min: 1, max: MAX_DAYS, integer: true });
  const daily = parseNumber(dailyRaw, "Daily", { min: 0, max: MAX_DAYS, integer: true });
  const weekly = parseNumber(weeklyRaw, "Weekly", { min: 0, max: MAX_WEEKLY, integer: true });
  const monthly = parseNumber(monthlyRaw, "Monthly", { min: 0, max: MAX_MONTHLY, integer: true });
  const yearly = parseNumber(yearlyRaw, "Yearly", { min: 0, max: MAX_YEARLY, integer: true });
  const comp = parseNumber(compRaw, "Compression ratio", { min: 1, max: MAX_RATIO });
  const dedup = parseNumber(dedupRaw, "Deduplication ratio", { min: 1, max: MAX_RATIO });
  const lock = parseNumber(lockRaw, "Immutability", { min: 0, max: MAX_LOCK_DAYS, integer: true });
  const copies = parseNumber(copiesRaw, "Copies", { min: 1, max: MAX_COPIES, integer: true });

  const policyFields = mode === "simple" ? [days] : [daily, weekly, monthly, yearly];
  const policy =
    policyFields.every((p) => p.ok)
      ? {
          mode,
          days: days.ok ? days.value : 0,
          daily: daily.ok ? daily.value : 0,
          weekly: weekly.ok ? weekly.value : 0,
          monthly: monthly.ok ? monthly.value : 0,
          yearly: yearly.ok ? yearly.value : 0,
        }
      : null;
  const problem = policy ? policyProblem(policy) : null;

  // The model depends only on these; size and ratios scale its output.
  const modelKey =
    policy && !problem && change.ok && lock.ok
      ? JSON.stringify({ policy, changeFraction: change.value / 100, cadence, lockDays: lock.value })
      : null;
  const deferredKey = useDeferredValue(modelKey);
  const results = useMemo<SchemeResult[] | null>(() => {
    if (!deferredKey) return null;
    try {
      return simulate(JSON.parse(deferredKey) as ModelInput);
    } catch {
      return null;
    }
  }, [deferredKey]);

  const scaleOk = sizeParsed.ok && comp.ok && dedup.ok && copies.ok;
  const fullBytes = sizeParsed.ok ? sizeParsed.value * unit.bytes : 0;
  const reduction = comp.ok && dedup.ok ? comp.value * dedup.value : 1;
  const copyCount = copies.ok ? copies.value : 1;
  const stale = modelKey !== deferredKey;
  const ready = results !== null && scaleOk && modelKey !== null;

  const stored = (units: number) => formatBytes((units * fullBytes) / reduction, unit.system);
  const logical = (units: number) => formatBytes(units * fullBytes, unit.system);

  const current = ready ? results.find((r) => r.scheme === selected) : undefined;

  const summary = ready
    ? [
        `Full backup ${sizeRaw.trim()} ${sizeUnitId}, ${changeRaw.trim()}% daily change, reduction ${reduction.toFixed(2)}:1, ${copyCount} ${pluralise(copyCount, "copy", "copies")}`,
        mode === "simple"
          ? `Retention: last ${days.ok ? days.value : "?"} days`
          : `Retention: GFS ${dailyRaw.trim()} daily, ${weeklyRaw.trim()} weekly, ${monthlyRaw.trim()} monthly, ${yearlyRaw.trim()} yearly`,
        lock.ok && lock.value > 0 ? `Immutability: ${lock.value} days` : "Immutability: none",
        "",
        ...results.map((r) =>
          r.available
            ? `${schemeLabel(r.scheme, cadence).padEnd(32)} points ${range(r.policyMin, r.policyMax).padEnd(9)} on disk ${range(r.diskMin, r.diskMax).padEnd(9)} chain ${String(r.longestChain).padEnd(4)} stored ${stored(r.peakUnits)} per copy, ${stored(r.peakUnits * copyCount)} total`
            : `${schemeLabel(r.scheme, cadence).padEnd(32)} not applicable`,
        ),
      ].join("\n")
    : "";

  const status = ready
    ? current && current.available
      ? `${schemeLabel(current.scheme, cadence)}: ${range(current.diskMin, current.diskMax)} backups on disk, ${stored(current.peakUnits)} stored per copy at the peak.`
      : "This scheme does not apply to the current policy."
    : "Fix the highlighted field to see the storage estimate.";

  return (
    <ToolShell slug="backup-retention-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Data">
            <div>
              <label htmlFor="brc-size" className={LABEL_CLASS}>
                Full backup size
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="brc-size"
                  value={sizeRaw}
                  onChange={(event) => setSizeRaw(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-invalid={!sizeParsed.ok}
                  aria-describedby={sizeParsed.ok ? "brc-size-hint" : "brc-size-error"}
                  data-testid="input-full-size"
                  className={`${INPUT_CLASS} flex-1`}
                />
                <label htmlFor="brc-size-unit" className="sr-only">
                  Size unit
                </label>
                <select
                  id="brc-size-unit"
                  value={sizeUnitId}
                  onChange={(event) => setSizeUnitId(event.target.value as SizeUnit)}
                  data-testid="select-size-unit"
                  className={`${SELECT_CLASS} w-32 shrink-0`}
                >
                  {SIZE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              {sizeParsed.ok ? (
                <p id="brc-size-hint" className={HINT_TEXT}>
                  The protected data as one full backup would read it, before compression.
                </p>
              ) : (
                <p id="brc-size-error" role="alert" className={ERROR_TEXT}>
                  {sizeParsed.message}
                </p>
              )}
            </div>
            <div className="mt-5">
              <NumberField
                id="brc-change"
                label="Daily change rate"
                value={changeRaw}
                onChange={setChangeRaw}
                parsed={change}
                suffix="%"
                testId="input-change-rate"
                hint="Share of the data that changes each day. File servers often run 1 to 5 percent; databases with heavy index rebuilds run more."
              />
            </div>
          </ToolPanel>

          <ToolPanel title="Retention">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Retention style">
              {(
                [
                  ["gfs", "Grandfather-father-son"],
                  ["simple", "Last N days"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  aria-pressed={mode === id}
                  data-testid={`button-mode-${id}`}
                  className={`${CHIP_CLASS} ${mode === id ? CHIP_ON : CHIP_OFF}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "simple" ? (
              <div className="mt-5">
                <NumberField
                  id="brc-days"
                  label="Daily backups kept"
                  value={daysRaw}
                  onChange={setDaysRaw}
                  parsed={days}
                  testId="input-days"
                  hint={`One backup a day, kept for this many days. Up to ${MAX_DAYS.toLocaleString("en-US")}.`}
                />
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-4">
                <NumberField id="brc-daily" label="Daily" value={dailyRaw} onChange={setDailyRaw} parsed={daily} testId="input-daily" />
                <NumberField id="brc-weekly" label="Weekly" value={weeklyRaw} onChange={setWeeklyRaw} parsed={weekly} testId="input-weekly" />
                <NumberField id="brc-monthly" label="Monthly" value={monthlyRaw} onChange={setMonthlyRaw} parsed={monthly} testId="input-monthly" />
                <NumberField id="brc-yearly" label="Yearly" value={yearlyRaw} onChange={setYearlyRaw} parsed={yearly} testId="input-yearly" />
              </div>
            )}
            {mode === "gfs" ? (
              <p className={HINT_TEXT}>
                Weekly points are the Sunday backups, monthly the first Sunday of each month, yearly the first Sunday of
                January. Limits: {MAX_WEEKLY} weekly, {MAX_MONTHLY} monthly, {MAX_YEARLY} yearly.
              </p>
            ) : null}
            {problem ? (
              <p role="alert" className={ERROR_TEXT}>
                {problem}
              </p>
            ) : null}
            <div className="mt-5">
              <NumberField
                id="brc-lock"
                label="Immutability window"
                value={lockRaw}
                onChange={setLockRaw}
                parsed={lock}
                suffix="days"
                testId="input-lock-days"
                hint="Backups younger than this cannot be deleted, along with everything they depend on. 0 for none."
              />
            </div>
          </ToolPanel>
        </div>

        <ToolPanel title="Schedule and data reduction">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label htmlFor="brc-cadence" className={LABEL_CLASS}>
                Full backups for chains
              </label>
              <select
                id="brc-cadence"
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
                data-testid="select-cadence"
                className={`mt-2 ${SELECT_CLASS}`}
              >
                <option value="weekly">Weekly, every Sunday</option>
                <option value="monthly">Monthly, first Sunday</option>
              </select>
              <p className={HINT_TEXT}>Applies to the incremental and differential rows.</p>
            </div>
            <NumberField
              id="brc-comp"
              label="Compression ratio"
              value={compRaw}
              onChange={setCompRaw}
              parsed={comp}
              suffix=": 1"
              testId="input-compression"
              hint="1 for data that does not compress, such as encrypted or media files."
            />
            <NumberField
              id="brc-dedup"
              label="Deduplication ratio"
              value={dedupRaw}
              onChange={setDedupRaw}
              parsed={dedup}
              suffix=": 1"
              testId="input-dedup"
              hint="Applied to the total. A vendor figure that already counts repeated fulls belongs here alone."
            />
            <NumberField
              id="brc-copies"
              label="Backup copies"
              value={copiesRaw}
              onChange={setCopiesRaw}
              parsed={copies}
              testId="input-copies"
              hint="3-2-1 means two copies besides production. Each copy is assumed to keep the same retention."
            />
          </div>
        </ToolPanel>

        <p role="status" aria-live="polite" className="sr-only" data-testid="text-summary">
          {status}
        </p>

        {!ready ? (
          <ToolPanel>
            <p className="font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="output-backup-retention">
              {modelKey !== null && scaleOk ? "Working out the year..." : "Fix the highlighted field to see the storage estimate."}
            </p>
          </ToolPanel>
        ) : (
          <div className={`space-y-6 ${stale ? "opacity-70" : ""}`} data-testid="output-backup-retention">
            <ToolPanel title="Every scheme, same policy">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse" data-testid="table-schemes">
                  <caption className="sr-only">Restore points, backups on disk, restore chain and storage for each scheme</caption>
                  <thead>
                    <tr className="border-b border-[hsl(var(--brand-iron))]">
                      <th scope="col" className={TH_CLASS}>
                        Scheme
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Restore points
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        On disk
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Longest chain
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        Stored per copy
                      </th>
                      <th scope="col" className={TH_CLASS}>
                        All copies
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => {
                      const active = r.scheme === selected;
                      const rowClass = `border-b border-[hsl(var(--brand-iron)/0.5)] ${active ? "bg-[hsl(var(--brand-signal)/0.06)]" : ""}`;
                      const nameCell = (
                        <th scope="row" className="py-3 pr-4 text-left align-top font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                          {schemeLabel(r.scheme, cadence)}
                        </th>
                      );
                      if (!r.available) {
                        return (
                          <tr key={r.scheme} className={rowClass}>
                            {nameCell}
                            <td colSpan={5} className="py-3 align-top font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              Not applicable. {r.reason}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={r.scheme} className={rowClass} data-testid={`row-scheme-${r.scheme}`}>
                          {nameCell}
                          <td className="py-3 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {range(r.policyMin, r.policyMax)}
                          </td>
                          <td className="py-3 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {range(r.diskMin, r.diskMax)}
                          </td>
                          <td className="py-3 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {r.longestChain}
                          </td>
                          <td className="py-3 pr-4 align-top font-mono-tight text-sm text-[hsl(var(--brand-signal))]">
                            {stored(r.peakUnits)}
                          </td>
                          <td className="py-3 align-top font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                            {stored(r.peakUnits * copyCount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className={HINT_TEXT}>
                Storage is the peak over {EVAL_DAYS} simulated days of steady state, after every tier has filled. On disk
                counts the backups the policy keeps plus the older ones it cannot delete yet because a kept backup
                depends on them.
              </p>
            </ToolPanel>

            <ToolPanel title="One scheme in detail">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Scheme to inspect">
                {results.map((r) => (
                  <button
                    key={r.scheme}
                    type="button"
                    onClick={() => setSelected(r.scheme)}
                    aria-pressed={selected === r.scheme}
                    data-testid={`button-scheme-${r.scheme}`}
                    className={`${CHIP_CLASS} ${selected === r.scheme ? CHIP_ON : CHIP_OFF}`}
                  >
                    {SCHEME_SHORT[r.scheme]}
                  </button>
                ))}
              </div>

              {current && current.available ? (
                <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="min-w-0">
                    <ToolResult label="Restore points by policy" value={range(current.policyMin, current.policyMax)} testId="text-policy-points" />
                    <ToolResult label="Backups on disk" value={diskText(current)} testId="text-disk-points" />
                    <ToolResult label="At the peak" value={countsText(current)} />
                    <ToolResult label="Longest restore chain" value={chainText(current)} testId="text-chain" />
                    <ToolResult label="Oldest restore point" value={ageText(current.oldestAge)} />
                    <ToolResult label="Logical size at peak" value={logical(current.peakUnits)} />
                    <ToolResult label="Data reduction" value={`${reduction.toFixed(2)} : 1`} />
                    <ToolResult label="Stored at peak, one copy" value={stored(current.peakUnits)} testId="text-stored" />
                    <ToolResult label="Lowest point of the year" value={stored(current.minUnits)} />
                    <ToolResult
                      label={`Across ${copyCount} ${pluralise(copyCount, "copy", "copies")}`}
                      value={stored(current.peakUnits * copyCount)}
                      testId="text-stored-total"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className={LABEL_CLASS}>Six weeks ending on the peak day</div>
                    <div className="mt-3">
                      <Strip result={current} />
                    </div>
                    {current.olderCount > 0 ? (
                      <p className={HINT_TEXT}>
                        Plus {current.olderCount.toLocaleString("en-US")} older{" "}
                        {pluralise(current.olderCount, "backup")} on disk, {logical(current.olderUnits)} before
                        reduction.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : current && !current.available ? (
                <p className="mt-5 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{current.reason}</p>
              ) : null}
            </ToolPanel>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.06)] p-5">
                <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                  3-2-1
                </div>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  Three copies of the data, on two different kinds of storage, one of them offsite. Production counts as
                  one, so the figure above for {copyCount} {pluralise(copyCount, "copy", "copies")}{" "}
                  {copyCount >= 2 ? "covers the other two" : "falls short: 3-2-1 needs two backup copies"}.
                </p>
              </div>
              <div className="rounded-2xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.06)] p-5">
                <div className="font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                  Immutability
                </div>
                <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {lock.ok && lock.value > 0
                    ? `A ${lock.value} day lock means an attacker with admin rights still cannot delete or encrypt the last ${lock.value} days of backups. Every backup they depend on is held too, which is already counted above.`
                    : "Ransomware operators delete backups before they encrypt production. A copy that cannot be changed or deleted until a lock expires, such as object lock or a hardened repository, is what survives that."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={summary} label="Copy the comparison as text" testId="button-copy-summary">
                <span>Copy comparison</span>
              </CopyButton>
            </div>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
