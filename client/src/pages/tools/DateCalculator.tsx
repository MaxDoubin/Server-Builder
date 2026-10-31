/**
 * Date calculator.
 *
 * Two jobs share one set of helpers: the gap between two dates, and a date
 * moved by a duration. Both run on calendar values (year, month, day, time of
 * day) rather than on Date objects, so the answers do not shift with the
 * visitor's own zone. A zone enters only where it has to: a Unix timestamp
 * names one instant, and elapsed hours across a daylight saving change are not
 * the difference between two clock readings. The calendar rules, ISO 8601
 * week numbering and business-day counting live in lib/toolkit/date-calculator
 * so they can be tested without React; zone handling is in
 * lib/toolkit/timezone-converter.
 */

import { useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DURATION_FIELDS,
  MAX_AMOUNT,
  MAX_HOLIDAYS,
  MAX_YEAR,
  MIN_YEAR,
  MONTH_NAMES,
  addMonths,
  calendarDifference,
  countBusinessDays,
  daysFromCivil,
  describeDifference,
  formatCivil,
  isoWeek,
  isoWeekDateString,
  parseAmount,
  parseCivil,
  parseHolidays,
  plural,
  toInputValue,
  trimDecimal,
  weekdayName,
  dayOfYear,
  ymdString,
  type Civil,
  type Duration,
  type IsoWeekInfo,
} from "@/lib/toolkit/date-calculator";
import {
  DEFAULT_ZONES,
  MAX_ZONE_YEAR,
  MIN_ZONE_YEAR,
  addInZone,
  deviceZone,
  formatOffset,
  instantOf,
  zoneName,
  zoneRangeMessage,
  type WallKind,
} from "@/lib/toolkit/timezone-converter";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none [color-scheme:dark] [.light_&]:[color-scheme:light]";
const SELECT_CLASS =
  "mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]";
const NOTE_CLASS =
  "break-words rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]";
const ERROR_CLASS =
  "mt-2 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const ERROR_ITEM_CLASS = "flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]";
const HINT_CLASS = "mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]";

type Amounts = Record<keyof Duration, string>;

const EMPTY_AMOUNTS: Amounts = { years: "", months: "", weeks: "", days: "", hours: "", minutes: "", seconds: "" };

/** Today's date on the visitor's own calendar, at midnight, in the value format a datetime-local input uses. */
function todayInput(): string {
  const now = new Date();
  return toInputValue({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: 0, minute: 0, second: 0 });
}

function yearStartInput(): string {
  return `${String(new Date().getFullYear()).padStart(4, "0")}-01-01T00:00`;
}

interface Field {
  civil: Civil | null;
  error: string | null;
}

/** Reads one date field. A blank field is not an error, only an absence. */
function readField(text: string, zone: string, label: string): Field {
  if (text.trim() === "") return { civil: null, error: null };
  const parsed = parseCivil(text);
  if (!parsed.ok) return { civil: null, error: `${label}: ${parsed.message}` };
  if (zone !== "UTC" && (parsed.value.year < MIN_ZONE_YEAR || parsed.value.year > MAX_ZONE_YEAR)) {
    return { civil: null, error: `${label}: ${zoneRangeMessage()}` };
  }
  return { civil: parsed.value, error: null };
}

function seconds(value: number): string {
  return value.toLocaleString("en-US");
}

/** Sum of whole days and the leftover, written as weeks and days. */
function weeksAndDays(totalDays: number): string {
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays - weeks * 7;
  return `${plural(weeks, "week")}, ${plural(days, "day")}`;
}

function kindNote(kind: WallKind, label: string, zone: string): string | null {
  if (kind === "gap") {
    return `${label} falls in an hour that is skipped when clocks jump forward in ${zone}. It is read as the instant just after the jump.`;
  }
  if (kind === "ambiguous") {
    return `${label} falls in an hour that happens twice when clocks fall back in ${zone}. It is read as the first of the two.`;
  }
  return null;
}

interface FactRow {
  label: string;
  civil: Civil;
  unix: number;
  info: IsoWeekInfo;
}

function factRow(label: string, civil: Civil, unix: number): FactRow {
  return { label, civil, unix, info: isoWeek(civil.year, civil.month, civil.day) };
}

const DIFF_EXAMPLES: { label: string; start: string; end: string; zone?: string }[] = [
  { label: "Jan 31 to Mar 1", start: "2026-01-31T00:00", end: "2026-03-01T00:00" },
  { label: "Leap day to leap day", start: "2024-02-29T00:00", end: "2028-02-29T00:00" },
  { label: "Across spring forward", start: "2026-03-07T12:00", end: "2026-03-08T12:00", zone: "America/New_York" },
  { label: "Week 53", start: "2026-12-28T00:00", end: "2027-01-04T00:00" },
];

const ADD_EXAMPLES: { label: string; base: string; sign: 1 | -1; amounts: Partial<Amounts> }[] = [
  { label: "Jan 31 plus 1 month", base: "2026-01-31T09:00", sign: 1, amounts: { months: "1" } },
  { label: "Mar 31 minus 1 month", base: "2026-03-31T09:00", sign: -1, amounts: { months: "1" } },
  { label: "Leap day plus 1 year", base: "2024-02-29T09:00", sign: 1, amounts: { years: "1" } },
  { label: "90 days from now", base: "", sign: 1, amounts: { days: "90" } },
];

export function DateCalculator() {
  const zoneOptions = useMemo(() => {
    const device = deviceZone();
    return [...new Set(["UTC", device, ...DEFAULT_ZONES])];
  }, []);

  const [zone, setZone] = useState("UTC");
  const [startText, setStartText] = useState(yearStartInput);
  const [endText, setEndText] = useState(todayInput);
  const [includeEnd, setIncludeEnd] = useState(false);
  const [holidayText, setHolidayText] = useState("");

  const [baseText, setBaseText] = useState(todayInput);
  const [sign, setSign] = useState<1 | -1>(1);
  const [amounts, setAmounts] = useState<Amounts>({ ...EMPTY_AMOUNTS, months: "1" });
  const [explain, setExplain] = useState<"start" | "end" | "result">("start");

  /* ---------------------------------------------------------- difference */

  const startField = useMemo(() => readField(startText, zone, "Start"), [startText, zone]);
  const endField = useMemo(() => readField(endText, zone, "End"), [endText, zone]);
  const holidays = useMemo(() => parseHolidays(holidayText), [holidayText]);

  const diff = useMemo(() => {
    const a = startField.civil;
    const b = endField.civil;
    if (!a || !b) return null;
    const calendar = calendarDifference(a, b);
    const first = instantOf(zone, a);
    const second = instantOf(zone, b);
    const business = countBusinessDays(
      daysFromCivil(a.year, a.month, a.day),
      daysFromCivil(b.year, b.month, b.day),
      holidays.days,
      includeEnd,
    );
    return {
      a,
      b,
      calendar,
      first,
      second,
      business,
      /** Exact time between the two instants, which is not the clock difference across a DST change. */
      elapsed: Math.abs(second.epoch - first.epoch),
      clockSeconds: calendar.wallSeconds,
    };
  }, [startField.civil, endField.civil, zone, holidays.days, includeEnd]);

  /* ------------------------------------------------------ add / subtract */

  const baseField = useMemo(() => readField(baseText, zone, "Starting date"), [baseText, zone]);

  const amountResults = useMemo(
    () => DURATION_FIELDS.map(({ key, label }) => ({ key, label, result: parseAmount(amounts[key], label) })),
    [amounts],
  );
  const amountErrors = amountResults.flatMap((entry) => (entry.result.ok ? [] : [entry.result.message]));

  const added = useMemo(() => {
    if (!baseField.civil || amountErrors.length > 0) return null;
    const duration = {} as Duration;
    for (const entry of amountResults) duration[entry.key] = entry.result.ok ? entry.result.value : 0;
    const result = addInZone(zone, baseField.civil, sign, duration);
    return { duration, result };
  }, [baseField.civil, amountResults, amountErrors.length, zone, sign]);

  const clampNote = useMemo(() => {
    if (!added || !added.result.ok || !added.result.value.clamped || !baseField.civil) return null;
    const stepped = addMonths(baseField.civil, sign * (added.duration.years * 12 + added.duration.months)).civil;
    return `${MONTH_NAMES[stepped.month - 1]} ${stepped.year} has only ${stepped.day} days, so day ${added.result.value.requestedDay} became day ${stepped.day}.`;
  }, [added, baseField.civil, sign]);

  const addedWall = added && added.result.ok ? added.result.value : null;

  /* ---------------------------------------------------------------- facts */

  const facts: FactRow[] = [];
  if (diff) {
    facts.push(factRow("Start", diff.a, diff.first.epoch));
    facts.push(factRow("End", diff.b, diff.second.epoch));
  }
  if (addedWall) facts.push(factRow("Result", addedWall.wall, addedWall.epoch));

  const explainKey = explain === "result" && !addedWall ? "start" : explain;
  const explainTarget =
    (explainKey === "result" ? addedWall?.wall : explainKey === "end" ? diff?.b : diff?.a) ??
    diff?.a ??
    diff?.b ??
    addedWall?.wall ??
    null;
  const explainInfo = explainTarget ? isoWeek(explainTarget.year, explainTarget.month, explainTarget.day) : null;

  /* ---------------------------------------------------------------- copy */

  const diffSummary = diff
    ? [
        `Start            ${formatCivil(diff.a)}`,
        `End              ${formatCivil(diff.b)}`,
        `Zone             ${zone}`,
        `Calendar gap     ${describeDifference(diff.calendar)}`,
        `Elapsed seconds  ${diff.elapsed}`,
        `Business days    ${diff.business.businessDays}`,
      ].join("\n")
    : "";

  function applyExample(example: (typeof DIFF_EXAMPLES)[number]) {
    setStartText(example.start);
    setEndText(example.end);
    if (example.zone) setZone(example.zone);
  }

  function applyAddExample(example: (typeof ADD_EXAMPLES)[number]) {
    setBaseText(example.base === "" ? todayInput() : example.base);
    setSign(example.sign);
    setAmounts({ ...EMPTY_AMOUNTS, ...example.amounts });
  }

  const startKind = diff ? kindNote(diff.first.kind, "Start", zone) : null;
  const endKind = diff ? kindNote(diff.second.kind, "End", zone) : null;
  const dstDiffers = diff !== null && diff.elapsed !== diff.clockSeconds;

  return (
    <ToolShell slug="date-calculator">
      <div className="space-y-6">
        <ToolPanel title="Time zone">
          <label htmlFor="dc-zone" className={LABEL_CLASS}>
            Zone for Unix timestamps and elapsed time
          </label>
          <select
            id="dc-zone"
            value={zone}
            onChange={(event) => setZone(event.target.value)}
            data-testid="select-zone"
            className={`${SELECT_CLASS} md:max-w-[360px]`}
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
          <p className={HINT_CLASS}>
            Calendar answers do not depend on a zone. The zone matters for Unix timestamps and for the hours between two
            times when daylight saving time changes in between. UTC never changes, and it covers years {MIN_YEAR} to{" "}
            {MAX_YEAR}. Other zones cover {MIN_ZONE_YEAR} to {MAX_ZONE_YEAR}.
          </p>
        </ToolPanel>

        <ToolPanel title="Difference between two dates">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="dc-start" className={LABEL_CLASS}>
                Start
              </label>
              <input
                id="dc-start"
                type="datetime-local"
                step={1}
                value={startText}
                onChange={(event) => setStartText(event.target.value)}
                aria-invalid={startField.error !== null}
                aria-describedby="dc-start-error"
                data-testid="input-start"
                className={INPUT_CLASS}
              />
              {startField.error ? (
                <p id="dc-start-error" role="alert" className={ERROR_CLASS}>
                  <span aria-hidden="true">✕</span>
                  <span className="min-w-0 break-words">{startField.error}</span>
                </p>
              ) : (
                <span id="dc-start-error" />
              )}
            </div>
            <div className="min-w-0">
              <label htmlFor="dc-end" className={LABEL_CLASS}>
                End
              </label>
              <input
                id="dc-end"
                type="datetime-local"
                step={1}
                value={endText}
                onChange={(event) => setEndText(event.target.value)}
                aria-invalid={endField.error !== null}
                aria-describedby="dc-end-error"
                data-testid="input-end"
                className={INPUT_CLASS}
              />
              {endField.error ? (
                <p id="dc-end-error" role="alert" className={ERROR_CLASS}>
                  <span aria-hidden="true">✕</span>
                  <span className="min-w-0 break-words">{endField.error}</span>
                </p>
              ) : (
                <span id="dc-end-error" />
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {DIFF_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => applyExample(example)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>

          {!diff && !startField.error && !endField.error ? (
            <p className={HINT_CLASS}>Enter a start and an end to see the difference.</p>
          ) : null}
        </ToolPanel>

        {diff ? (
          <div className="space-y-6" data-testid="output-difference">
            {diff.calendar.reversed ? (
              <p role="status" className={NOTE_CLASS}>
                The end is before the start. Every figure below is the size of the gap, counted forward from the earlier
                of the two.
              </p>
            ) : null}
            {startKind || endKind || dstDiffers ? (
              <div role="status" className={`${NOTE_CLASS} space-y-2`} data-testid="note-zone">
                {startKind ? <p>{startKind}</p> : null}
                {endKind ? <p>{endKind}</p> : null}
                {dstDiffers ? (
                  <p>
                    Clocks in {zone} change between these two times, so the readings differ by{" "}
                    {describeSpan(diff.clockSeconds)} while {describeSpan(diff.elapsed)} actually pass. The calendar
                    breakdown follows the clock readings. The totals follow elapsed time.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ToolPanel title="Calendar difference">
                <p
                  className="break-words font-display text-xl font-medium text-[hsl(var(--brand-bone))]"
                  data-testid="text-difference"
                >
                  {describeDifference(diff.calendar)}
                </p>
                <div className="mt-3">
                  <ToolResult label="Years" value={seconds(diff.calendar.years)} />
                  <ToolResult label="Months" value={seconds(diff.calendar.months)} />
                  <ToolResult label="Days" value={seconds(diff.calendar.days)} />
                  <ToolResult
                    label="Time of day"
                    value={`${String(diff.calendar.hours).padStart(2, "0")}:${String(diff.calendar.minutes).padStart(2, "0")}:${String(diff.calendar.seconds).padStart(2, "0")}`}
                  />
                  <ToolResult label="Whole months in total" value={seconds(diff.calendar.totalMonths)} />
                </div>
                <p className={HINT_CLASS}>
                  Whole months are added to the earlier date first, clamping to the end of a short month, until the next
                  one would pass the later date. Whatever is left is days and time. Jan 31 to Mar 1 is 1 month and 1 day
                  because Jan 31 plus one month is Feb 28.
                </p>
              </ToolPanel>

              <ToolPanel title="Elapsed totals">
                <ToolResult label="Days" value={trimDecimal(diff.elapsed / 86400)} testId="text-total-days" />
                <ToolResult label="Whole weeks and days" value={weeksAndDays(Math.floor(diff.elapsed / 86400))} />
                <ToolResult label="Hours" value={trimDecimal(diff.elapsed / 3600)} />
                <ToolResult label="Minutes" value={trimDecimal(diff.elapsed / 60)} />
                <ToolResult label="Seconds" value={seconds(diff.elapsed)} testId="text-total-seconds" />
                <p className={HINT_CLASS}>
                  Totals are exact elapsed time in {zone}
                  {zone === "UTC" ? "" : `, using ${formatOffset(diff.first.offset)} at the start and ${formatOffset(diff.second.offset)} at the end`}
                  . Hours and minutes keep their fractions to four places.
                </p>
              </ToolPanel>
            </div>

            <ToolPanel title="Business days">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="min-w-0">
                  <p
                    className="font-display text-xl font-medium text-[hsl(var(--brand-bone))]"
                    data-testid="text-business-days"
                  >
                    {plural(diff.business.businessDays, "business day")}
                  </p>
                  <div className="mt-3">
                    <ToolResult label="Calendar days counted" value={seconds(diff.business.calendarDays)} />
                    <ToolResult label="Monday to Friday" value={seconds(diff.business.weekdays)} />
                    <ToolResult label="Weekend days" value={seconds(diff.business.weekendDays)} />
                    <ToolResult label="Holidays removed" value={seconds(diff.business.holidaysUsed)} />
                  </div>
                  {holidays.days.length > 0 && diff.business.holidaysOnWeekends > 0 ? (
                    <p className={HINT_CLASS}>
                      {plural(diff.business.holidaysOnWeekends, "listed holiday")} already fall
                      {diff.business.holidaysOnWeekends === 1 ? "s" : ""} on a weekend and{" "}
                      {diff.business.holidaysOnWeekends === 1 ? "is" : "are"} not subtracted twice.
                    </p>
                  ) : null}
                  {holidays.days.length > 0 && diff.business.holidaysOutside > 0 ? (
                    <p className={HINT_CLASS}>
                      {plural(diff.business.holidaysOutside, "listed holiday")} fall
                      {diff.business.holidaysOutside === 1 ? "s" : ""} outside the range and{" "}
                      {diff.business.holidaysOutside === 1 ? "is" : "are"} ignored.
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <label htmlFor="dc-holidays" className={LABEL_CLASS}>
                    Holidays to skip, optional
                  </label>
                  <textarea
                    id="dc-holidays"
                    value={holidayText}
                    onChange={(event) => setHolidayText(event.target.value)}
                    rows={4}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={"2026-11-26\n2026-12-25"}
                    aria-describedby="dc-holidays-hint"
                    data-testid="input-holidays"
                    className="mt-2 w-full resize-y rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
                  />
                  <p id="dc-holidays-hint" className={HINT_CLASS}>
                    One YYYY-MM-DD date per line, or separated by commas. Up to {seconds(MAX_HOLIDAYS)} are read.
                  </p>
                  {holidays.problems.length > 0 || holidays.truncated ? (
                    <ul
                      role="alert"
                      data-testid="list-holiday-problems"
                      className="mt-2 space-y-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
                    >
                      {holidays.problems.map((problem) => (
                        <li key={problem} className="break-words">
                          Skipped: {problem}.
                        </li>
                      ))}
                      {holidays.truncated ? <li>Only the first {seconds(MAX_HOLIDAYS)} dates were used.</li> : null}
                    </ul>
                  ) : null}
                  <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    <input
                      type="checkbox"
                      checked={includeEnd}
                      onChange={(event) => setIncludeEnd(event.target.checked)}
                      data-testid="checkbox-include-end"
                      className="h-5 w-5 shrink-0 accent-[hsl(var(--brand-signal))]"
                    />
                    <span>Count the end date too, as Excel's NETWORKDAYS does</span>
                  </label>
                </div>
              </div>
              <p className={HINT_CLASS}>
                Saturday and Sunday are the weekend. Counting runs from the start date up to, but not including, the end
                date, so Monday to the next Monday is 5. The time of day is ignored.
              </p>
            </ToolPanel>

            <div className="flex flex-wrap items-start gap-3">
              <CopyButton value={diffSummary} label="Copy the difference summary" testId="button-copy-difference">
                <span>Copy summary</span>
              </CopyButton>
            </div>
          </div>
        ) : null}

        <ToolPanel title="Add or subtract">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="dc-base" className={LABEL_CLASS}>
                Starting date
              </label>
              <input
                id="dc-base"
                type="datetime-local"
                step={1}
                value={baseText}
                onChange={(event) => setBaseText(event.target.value)}
                aria-invalid={baseField.error !== null}
                aria-describedby="dc-base-error"
                data-testid="input-base"
                className={INPUT_CLASS}
              />
              {baseField.error ? (
                <p id="dc-base-error" role="alert" className={ERROR_CLASS}>
                  <span aria-hidden="true">✕</span>
                  <span className="min-w-0 break-words">{baseField.error}</span>
                </p>
              ) : (
                <span id="dc-base-error" />
              )}
            </div>
            <div className="min-w-0">
              <label htmlFor="dc-sign" className={LABEL_CLASS}>
                Direction
              </label>
              <select
                id="dc-sign"
                value={sign}
                onChange={(event) => setSign(Number(event.target.value) === -1 ? -1 : 1)}
                data-testid="select-direction"
                className={SELECT_CLASS}
              >
                <option value={1}>Add</option>
                <option value={-1}>Subtract</option>
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {amountResults.map(({ key, label, result }) => (
              <div key={key} className="min-w-0">
                <label htmlFor={`dc-amount-${key}`} className={LABEL_CLASS}>
                  {label}
                </label>
                <input
                  id={`dc-amount-${key}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amounts[key]}
                  onChange={(event) => setAmounts({ ...amounts, [key]: event.target.value })}
                  aria-invalid={!result.ok}
                  placeholder="0"
                  data-testid={`input-amount-${key}`}
                  className={INPUT_CLASS}
                />
              </div>
            ))}
          </div>

          {amountErrors.length > 0 ? (
            <ul role="alert" data-testid="list-amount-errors" className="mt-3 space-y-1">
              {amountErrors.map((message) => (
                <li key={message} className={ERROR_ITEM_CLASS}>
                  <span aria-hidden="true">✕</span>
                  <span className="min-w-0 break-words">{message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Try
            </span>
            {ADD_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => applyAddExample(example)}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
          <p className={HINT_CLASS}>
            Years and months move first and clamp to the end of a short month. Weeks and days then move on the calendar.
            {zone === "UTC"
              ? " Hours, minutes and seconds are added last."
              : ` Hours, minutes and seconds are exact elapsed time in ${zone}, so 24 hours is not always one calendar day.`}{" "}
            Subtracting applies the same steps with every amount negated. Each amount can be up to{" "}
            {seconds(MAX_AMOUNT)}.
          </p>

          {added && !added.result.ok ? (
            <p role="alert" data-testid="text-add-error" className={ERROR_CLASS}>
              <span aria-hidden="true">✕</span>
              <span className="min-w-0 break-words">{added.result.message}</span>
            </p>
          ) : null}

          {addedWall ? (
            <div className="mt-5 rounded-2xl border border-[hsl(var(--brand-iron))] p-5" data-testid="output-add">
              <div className={LABEL_CLASS}>Result</div>
              <p
                className="mt-2 break-words font-display text-xl font-medium text-[hsl(var(--brand-bone))]"
                data-testid="text-add-result"
              >
                {formatCivil(addedWall.wall)}
              </p>
              <p className="mt-1 break-words font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                {weekdayName(addedWall.wall.year, addedWall.wall.month, addedWall.wall.day)} ·{" "}
                {zone === "UTC" ? "UTC" : `${zone} ${zoneName(zone, addedWall.epoch, "short")}, ${formatOffset(addedWall.offset)}`}
              </p>
              <div className="mt-3 space-y-2">
                {clampNote ? (
                  <p className={NOTE_CLASS} data-testid="note-clamp">
                    {clampNote}
                  </p>
                ) : null}
                {addedWall.kind !== "normal" && baseField.civil ? (
                  <p className={NOTE_CLASS}>
                    {addedWall.kind === "gap"
                      ? `The calendar step landed on a time that is skipped in ${zone}, so it moved forward past the clock change.`
                      : `The calendar step landed on a time that happens twice in ${zone}. The first of the two was used.`}
                  </p>
                ) : null}
              </div>
              <div className="mt-4">
                <CopyButton value={formatCivil(addedWall.wall)} label="Copy the result" testId="button-copy-result">
                  <span>Copy result</span>
                </CopyButton>
              </div>
            </div>
          ) : null}
        </ToolPanel>

        {facts.length > 0 ? (
          <ToolPanel title="Dates at a glance">
            <div className="relative overflow-x-auto" data-testid="output-facts">
              <table className="w-full min-w-[760px] border-collapse text-left" data-testid="table-facts">
                <caption className="sr-only">Weekday, day of year, ISO 8601 week and Unix timestamp for each date</caption>
                <thead>
                  <tr className="border-b border-[hsl(var(--brand-iron))]">
                    <th scope="col" className={TH_CLASS}>
                      Date
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Weekday
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Day of year
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      ISO week
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      Week-year
                    </th>
                    <th scope="col" className={TH_CLASS}>
                      ISO week date
                    </th>
                    <th scope="col" className="py-2 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      Unix seconds
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {facts.map((row) => (
                    <tr key={row.label} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                      <th scope="row" className="py-3 pr-4 text-left font-mono-tight text-sm font-normal text-[hsl(var(--brand-bone))]">
                        <span className="block text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {row.label}
                        </span>
                        <span className="whitespace-nowrap">{formatCivil(row.civil)}</span>
                      </th>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {weekdayName(row.civil.year, row.civil.month, row.civil.day)}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {dayOfYear(row.civil.year, row.civil.month, row.civil.day)}
                      </td>
                      <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.info.week}</td>
                      <td className="py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">{row.info.weekYear}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                        {isoWeekDateString(row.info)}
                      </td>
                      <td className="whitespace-nowrap py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))]" data-testid={`text-unix-${row.label.toLowerCase()}`}>
                        {seconds(row.unix)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={HINT_CLASS}>
              Unix seconds count from 1970-01-01 00:00:00 UTC and ignore leap seconds. The week-year can differ from the
              calendar year near January 1.
            </p>
          </ToolPanel>
        ) : null}

        <ToolPanel title="How ISO 8601 weeks work">
          <div className="max-w-3xl space-y-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            <p>
              ISO 8601 weeks start on Monday. Week 1 of a year is the week that contains that year's first Thursday,
              which is the same as the week that contains January 4. Every week belongs to the year its Thursday falls
              in, so a date in late December can be in week 1 of the next year, and a date in early January can be in
              week 52 or 53 of the one before. A year has 53 weeks when January 1 is a Thursday, or when it is a leap
              year and January 1 is a Wednesday.
            </p>
          </div>

          {explainInfo && explainTarget ? (
            <div className="mt-5" data-testid="output-iso-week">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[200px]">
                  <label htmlFor="dc-explain" className={LABEL_CLASS}>
                    Explain the week of
                  </label>
                  <select
                    id="dc-explain"
                    value={explainKey}
                    onChange={(event) => setExplain(event.target.value as "start" | "end" | "result")}
                    data-testid="select-explain"
                    className={SELECT_CLASS}
                  >
                    <option value="start">Start date</option>
                    <option value="end">End date</option>
                    <option value="result" disabled={!addedWall}>
                      Add or subtract result
                    </option>
                  </select>
                </div>
              </div>

              <p className="mt-4 max-w-3xl break-words font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {ymdString(explainTarget)} is a {weekdayName(explainTarget.year, explainTarget.month, explainTarget.day)}.
                Its week runs {ymdString(explainInfo.monday)} to {ymdString(explainInfo.sunday)}, and the Thursday of
                that week is {ymdString(explainInfo.thursday)}, which is in {explainInfo.weekYear}. So it is week{" "}
                {explainInfo.week} of {explainInfo.weekYear}, written{" "}
                <code className="text-[hsl(var(--brand-cyan))]">{isoWeekDateString(explainInfo)}</code>. Week 1 of{" "}
                {explainInfo.weekYear} starts on {ymdString(explainInfo.week1Monday)}, and {explainInfo.weekYear} has{" "}
                {explainInfo.weeksInWeekYear} weeks.
              </p>

              <div className="relative mt-4 overflow-x-auto pb-1">
                <ol className="flex w-max min-w-full gap-2" aria-label="The seven days of that week">
                  {explainInfo.days.map((day) => {
                    const isTarget = day.year === explainTarget.year && day.month === explainTarget.month && day.day === explainTarget.day;
                    const isThursday = day.weekday === 4;
                    return (
                      <li
                        key={day.weekday}
                        className={`min-w-[84px] flex-1 rounded-lg border px-3 py-2 font-mono-tight ${
                          isThursday
                            ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.12)]"
                            : "border-[hsl(var(--brand-iron))]"
                        }`}
                      >
                        <div className="text-[0.625rem] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                          {day.name.slice(0, 3)}
                          {isThursday ? " · decides" : ""}
                        </div>
                        <div className="mt-1 text-sm text-[hsl(var(--brand-bone))]">
                          {String(day.month).padStart(2, "0")}-{String(day.day).padStart(2, "0")}
                        </div>
                        <div className="text-[0.625rem] text-[hsl(var(--brand-ash))]">
                          {day.year}
                          {isTarget ? " · your date" : ""}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          ) : (
            <p className={HINT_CLASS}>Enter a date above to see which ISO week it falls in and why.</p>
          )}
        </ToolPanel>
      </div>
    </ToolShell>
  );
}

function describeSpan(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const rest = totalSeconds % 60;
  const parts: string[] = [];
  if (hours) parts.push(plural(hours, "hour"));
  if (minutes) parts.push(plural(minutes, "minute"));
  if (rest || parts.length === 0) parts.push(plural(rest, "second"));
  return parts.join(" ");
}
