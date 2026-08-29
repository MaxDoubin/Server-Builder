/**
 * Unix timestamp converter.
 *
 * One instant is held in state as milliseconds since the epoch and every
 * field on the page is a view of it, so the two inputs cannot drift apart:
 * typing an epoch value rewrites the date box, typing a date rewrites the
 * epoch box, and both render the same formats underneath. The awkward part
 * of the job is the wall clock string with no offset on it, which is a
 * different instant in every time zone, so the interpretation is an explicit
 * choice here rather than a silent default.
 */

import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { ToolPanel, ToolShell } from "./ToolShell";

/* ------------------------------------------------------------- formatting */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Widest a Date can go: 100,000,000 days either side of the epoch. */
const MAX_MS = 8.64e15;

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, "0");
}

function offsetLabel(minutes: number, colon: boolean): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ":" : ""}${pad(abs % 60)}`;
}

function isoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

/** ISO 8601 in the reader's own zone, with the offset spelled out. */
function isoLocal(ms: number): string {
  const date = new Date(ms);
  const offset = -date.getTimezoneOffset();
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    offsetLabel(offset, true)
  );
}

/** RFC 2822 date-time, the shape an email Date header carries. */
function rfc2822(ms: number, utc: boolean): string {
  const date = new Date(ms);
  const weekday = WEEKDAYS[utc ? date.getUTCDay() : date.getDay()];
  const day = utc ? date.getUTCDate() : date.getDate();
  const month = MONTHS[utc ? date.getUTCMonth() : date.getMonth()];
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  const offset = utc ? 0 : -date.getTimezoneOffset();
  return (
    `${weekday}, ${pad(day)} ${month} ${pad(year, 4)} ` +
    `${pad(hours)}:${pad(minutes)}:${pad(seconds)} ${offsetLabel(offset, false)}`
  );
}

function readable(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone,
  });
}

function span(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return plural(hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 60) return plural(days, "day");
  const months = Math.round(days / 30.44);
  if (months < 24) return plural(months, "month");
  return plural(Math.round(days / 365.25), "year");
}

function relative(targetMs: number, nowMs: number): string {
  const delta = Math.round((targetMs - nowMs) / 1000);
  if (delta === 0) return "right now";
  return delta < 0 ? `${span(-delta)} ago` : `in ${span(delta)}`;
}

/**
 * ISO 8601 week number. The week belongs to whichever year holds its
 * Thursday, which is why the first days of January can land in week 52 of
 * the year before.
 */
function isoWeek(ms: number): { year: number; week: number } {
  const target = new Date(ms);
  target.setUTCHours(0, 0, 0, 0);
  const mondayIndex = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - mondayIndex + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { year: target.getUTCFullYear(), week };
}

function dayOfYear(ms: number): number {
  const date = new Date(ms);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

/* ---------------------------------------------------------------- parsing */

type Unit = "auto" | "s" | "ms" | "us" | "ns";

const UNIT_LABEL: Record<Exclude<Unit, "auto">, string> = {
  s: "seconds",
  ms: "milliseconds",
  us: "microseconds",
  ns: "nanoseconds",
};

/** Multiplier from each unit into milliseconds. */
const UNIT_TO_MS: Record<Exclude<Unit, "auto">, number> = {
  s: 1000,
  ms: 1,
  us: 1e-3,
  ns: 1e-6,
};

/**
 * Digit count is the only signal a bare integer carries. Seconds stay at ten
 * digits until the year 2286, milliseconds are thirteen, microseconds sixteen
 * and nanoseconds nineteen, so the boundaries sit in the gaps between them.
 */
function detectUnit(digits: number): Exclude<Unit, "auto"> {
  if (digits <= 11) return "s";
  if (digits <= 14) return "ms";
  if (digits <= 17) return "us";
  return "ns";
}

type Parsed = { ok: true; ms: number; unit: Exclude<Unit, "auto"> } | { ok: false; message: string };

function parseEpoch(raw: string, unit: Unit): Parsed {
  // Values arrive pasted out of logs and spreadsheets, so grouping marks come
  // off before anything else looks at the string.
  const text = raw.trim().replace(/[\s_,]/g, "");
  if (!text) return { ok: false, message: "" };
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return {
      ok: false,
      message: "An epoch value is a whole number of time units since 1970-01-01T00:00:00Z, optionally negative for a date before it.",
    };
  }

  const digits = text.replace(/^[+-]/, "").split(".")[0].length;
  const resolved = unit === "auto" ? detectUnit(digits) : unit;
  const ms = Number(text) * UNIT_TO_MS[resolved];
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) {
    return {
      ok: false,
      message: `Read as ${UNIT_LABEL[resolved]} that lands outside the range a date can hold, which is 8.64e15 ms either side of the epoch, roughly 273,790 years.`,
    };
  }
  return { ok: true, ms, unit: resolved };
}

/** A date with no offset on it, which needs a zone before it means anything. */
const BARE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

type Zone = "local" | "utc";

/** Two digit years map to 1900 in both Date constructors, so year 0 to 99 is set again. */
function withYear(ms: number, year: number, utc: boolean): number {
  if (year >= 100) return ms;
  const date = new Date(ms);
  if (utc) date.setUTCFullYear(year);
  else date.setFullYear(year);
  return date.getTime();
}

function parseDate(raw: string, zone: Zone): { ok: true; ms: number } | { ok: false; message: string } {
  const text = raw.trim();
  if (!text) return { ok: false, message: "" };

  const bare = BARE.exec(text);
  if (bare) {
    const year = Number(bare[1]);
    const month = Number(bare[2]);
    const day = Number(bare[3]);
    const hours = Number(bare[4] ?? "0");
    const minutes = Number(bare[5] ?? "0");
    const seconds = Number(bare[6] ?? "0");
    const millis = Number((bare[7] ?? "0").padEnd(3, "0"));
    const utc = zone === "utc";

    const raw_ms = utc
      ? Date.UTC(year, month - 1, day, hours, minutes, seconds, millis)
      : new Date(year, month - 1, day, hours, minutes, seconds, millis).getTime();
    const ms = withYear(raw_ms, year, utc);

    // Both constructors roll an impossible date forward rather than refusing
    // it, so 2025-02-30 quietly becomes 2 March. Catch that by reading the
    // components back out.
    const check = new Date(ms);
    const sameDay = utc
      ? check.getUTCMonth() === month - 1 && check.getUTCDate() === day
      : check.getMonth() === month - 1 && check.getDate() === day;
    if (!Number.isFinite(ms) || !sameDay) {
      return {
        ok: false,
        message: `${bare[1]}-${bare[2]}-${bare[3]} is not a real date. A month length or a leap day is wrong, and both constructors would silently roll it forward.`,
      };
    }
    return { ok: true, ms };
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return {
      ok: false,
      message: "Could not read that. Use ISO 8601 (2026-08-29T14:30:00Z), a date on its own (2026-08-29), or an RFC 2822 string.",
    };
  }
  if (Math.abs(parsed) > MAX_MS) {
    return { ok: false, message: "That date is outside the range a JavaScript date can hold." };
  }
  return { ok: true, ms: parsed };
}

/* -------------------------------------------------------------- reference */

const REFERENCES: { label: string; seconds: number; note: string }[] = [
  { label: "Epoch zero", seconds: 0, note: "1970-01-01T00:00:00Z, where counting starts." },
  { label: "1 000 000 000", seconds: 1_000_000_000, note: "9 September 2001, the first billion." },
  { label: "1234567890", seconds: 1_234_567_890, note: "13 February 2009, the joke timestamp." },
  { label: "2^31 - 1", seconds: 2_147_483_647, note: "19 January 2038, where a signed 32 bit time_t stops." },
  { label: "Before the epoch", seconds: -1_000_000_000, note: "April 1938, from a negative value." },
];

/* ------------------------------------------------------------------- view */

/** One format, with the value on the clipboard in a click. */
function FormatRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0">
      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
        {label}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          data-testid={testId}
          className="break-all font-mono-tight text-sm text-[hsl(var(--brand-bone))]"
        >
          {value}
        </span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </span>
    </div>
  );
}

export function TimestampConverter() {
  const [instant, setInstant] = useState(() => Math.floor(Date.now() / 1000) * 1000);
  const [unit, setUnit] = useState<Unit>("auto");
  const [zone, setZone] = useState<Zone>("local");
  const [epochDraft, setEpochDraft] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [dateDraft, setDateDraft] = useState(() => isoLocal(Date.now()));
  const [epochError, setEpochError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // The relative line and the live clock are the only things on the page that
  // move on their own, and a stale "in 3 minutes" is worse than none.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  function epochText(ms: number, forUnit: Unit): string {
    const resolved = forUnit === "auto" ? "s" : forUnit;
    const value = ms / UNIT_TO_MS[resolved];
    return Number.isInteger(value) ? String(value) : value.toFixed(0);
  }

  /** Move the instant and rewrite whichever draft the reader is not typing in. */
  function commit(ms: number, source: "epoch" | "date" | "both") {
    setInstant(ms);
    if (source !== "epoch") {
      setEpochDraft(epochText(ms, unit));
      setEpochError(null);
    }
    if (source !== "date") {
      setDateDraft(zone === "utc" ? isoUtc(ms) : isoLocal(ms));
      setDateError(null);
    }
  }

  function onEpochChange(value: string) {
    setEpochDraft(value);
    const parsed = parseEpoch(value, unit);
    if (parsed.ok) {
      setInstant(parsed.ms);
      setEpochError(null);
      setDateDraft(zone === "utc" ? isoUtc(parsed.ms) : isoLocal(parsed.ms));
      setDateError(null);
    } else {
      setEpochError(parsed.message || null);
    }
  }

  function onUnitChange(next: Unit) {
    setUnit(next);
    const parsed = parseEpoch(epochDraft, next);
    if (parsed.ok) {
      setInstant(parsed.ms);
      setEpochError(null);
      setDateDraft(zone === "utc" ? isoUtc(parsed.ms) : isoLocal(parsed.ms));
      setDateError(null);
    } else {
      setEpochError(parsed.message || null);
    }
  }

  function onDateChange(value: string) {
    setDateDraft(value);
    const parsed = parseDate(value, zone);
    if (parsed.ok) {
      setInstant(parsed.ms);
      setDateError(null);
      setEpochDraft(epochText(parsed.ms, unit));
      setEpochError(null);
    } else {
      setDateError(parsed.message || null);
    }
  }

  function onZoneChange(next: Zone) {
    setZone(next);
    setDateDraft(next === "utc" ? isoUtc(instant) : isoLocal(instant));
    setDateError(null);
  }

  const detected = useMemo(() => parseEpoch(epochDraft, unit), [epochDraft, unit]);
  const week = isoWeek(instant);
  const localZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local zone";
    } catch {
      return "your local zone";
    }
  }, []);

  const seconds = Math.floor(instant / 1000);
  const summary = `${isoUtc(instant)} is ${seconds} in epoch seconds, ${relative(instant, nowTick)}.`;

  return (
    <ToolShell slug="timestamp-converter">
      <div className="space-y-6">
        <ToolPanel title="Right now">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div
                className="font-mono-tight text-2xl text-[hsl(var(--brand-signal))]"
                data-testid="text-now-seconds"
              >
                {Math.floor(nowTick / 1000)}
              </div>
              <p className="mt-1 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                {isoUtc(nowTick).replace(/\.\d{3}Z$/, "Z")} · {Math.floor(nowTick)} ms
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CopyButton
                value={String(Math.floor(nowTick / 1000))}
                label="Copy the current epoch seconds"
                testId="button-copy-now"
              >
                <span>Copy seconds</span>
              </CopyButton>
              <button
                type="button"
                onClick={() => commit(Math.floor(Date.now() / 1000) * 1000, "both")}
                data-testid="button-use-now"
                className="inline-flex min-h-[44px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Convert now
              </button>
            </div>
          </div>
        </ToolPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <ToolPanel title="From an epoch value">
            <label
              htmlFor="epoch-input"
              className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
            >
              Seconds, milliseconds, microseconds or nanoseconds since 1970
            </label>
            <input
              id="epoch-input"
              type="text"
              inputMode="numeric"
              value={epochDraft}
              onChange={(event) => onEpochChange(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={epochError !== null}
              aria-describedby={epochError ? "epoch-error" : "epoch-hint"}
              placeholder="1756483200"
              data-testid="input-epoch"
              className="mt-3 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />

            <label
              htmlFor="epoch-unit"
              className="mt-4 block font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]"
            >
              Unit
            </label>
            <select
              id="epoch-unit"
              value={unit}
              onChange={(event) => onUnitChange(event.target.value as Unit)}
              data-testid="select-unit"
              className="mt-2 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            >
              <option value="auto">Auto detect from the digit count</option>
              <option value="s">Seconds</option>
              <option value="ms">Milliseconds</option>
              <option value="us">Microseconds</option>
              <option value="ns">Nanoseconds</option>
            </select>

            {epochError ? (
              <p
                id="epoch-error"
                role="alert"
                data-testid="text-epoch-error"
                className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {epochError}
              </p>
            ) : (
              <p id="epoch-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                {unit === "auto" && detected.ok
                  ? `Read as ${UNIT_LABEL[detected.unit]}, from ${epochDraft.trim().replace(/^[+-]/, "").split(".")[0].length} digits.`
                  : "Spaces, commas and underscores are ignored, so a value pasted out of a log or a spreadsheet works."}
              </p>
            )}
          </ToolPanel>

          <ToolPanel title="From a date">
            <label
              htmlFor="date-input"
              className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]"
            >
              ISO 8601, a bare date, or an RFC 2822 string
            </label>
            <input
              id="date-input"
              type="text"
              value={dateDraft}
              onChange={(event) => onDateChange(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={dateError !== null}
              aria-describedby={dateError ? "date-error" : "date-hint"}
              placeholder="2026-08-29T14:30:00"
              data-testid="input-date"
              className="mt-3 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />

            <fieldset className="mt-4">
              <legend className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
                Read a time with no offset as
              </legend>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    { id: "local" as Zone, label: "Local" },
                    { id: "utc" as Zone, label: "UTC" },
                  ]
                ).map((option) => (
                  <label
                    key={option.id}
                    className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-lg border font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))] ${
                      zone === option.id
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-signal))]"
                        : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="timestamp-zone"
                      value={option.id}
                      checked={zone === option.id}
                      onChange={() => onZoneChange(option.id)}
                      className="sr-only"
                      data-testid={`radio-zone-${option.id}`}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {dateError ? (
              <p
                id="date-error"
                role="alert"
                data-testid="text-date-error"
                className="mt-3 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                {dateError}
              </p>
            ) : (
              <p id="date-hint" className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                A string carrying its own offset, ending in Z or +02:00, ignores this choice and
                keeps the offset it came with.
              </p>
            )}
          </ToolPanel>
        </div>

        <p
          role="status"
          aria-live="polite"
          data-testid="text-summary"
          className="font-mono-tight text-xs uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
        >
          {summary}
        </p>

        <div className="grid gap-6 lg:grid-cols-2">
          <ToolPanel title="Epoch">
            <FormatRow label="Seconds" value={String(seconds)} testId="text-epoch-seconds" />
            <FormatRow label="Milliseconds" value={String(instant)} testId="text-epoch-ms" />
            <FormatRow label="Microseconds" value={String(instant * 1000)} />
            <FormatRow label="Nanoseconds" value={`${instant}000000`} />
          </ToolPanel>

          <ToolPanel title="Formats">
            <FormatRow label="ISO 8601 UTC" value={isoUtc(instant)} testId="text-iso-utc" />
            <FormatRow label="ISO 8601 local" value={isoLocal(instant)} testId="text-iso-local" />
            <FormatRow label="RFC 2822 local" value={rfc2822(instant, false)} testId="text-rfc2822" />
            <FormatRow label="RFC 2822 UTC" value={rfc2822(instant, true)} />
            <FormatRow label="HTTP date" value={new Date(instant).toUTCString()} />
          </ToolPanel>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ToolPanel title="In words">
            <FormatRow label="UTC" value={readable(instant, "UTC")} testId="text-readable-utc" />
            <FormatRow label={`Local (${localZone})`} value={readable(instant)} testId="text-readable-local" />
            <FormatRow
              label="UTC offset here"
              value={offsetLabel(-new Date(instant).getTimezoneOffset(), true)}
            />
            <FormatRow label="Relative to now" value={relative(instant, nowTick)} testId="text-relative" />
          </ToolPanel>

          <ToolPanel title="Calendar position">
            <FormatRow
              label="Weekday, UTC"
              value={new Date(instant).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })}
            />
            <FormatRow label="Day of year, UTC" value={`${dayOfYear(instant)}`} />
            <FormatRow label="ISO week" value={`${week.year}-W${pad(week.week)}`} testId="text-iso-week" />
            <FormatRow
              label="Quarter, UTC"
              value={`Q${Math.floor(new Date(instant).getUTCMonth() / 3) + 1}`}
            />
          </ToolPanel>
        </div>

        <ToolPanel title="Reference points">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {REFERENCES.map((reference) => (
              <button
                key={reference.label}
                type="button"
                onClick={() => commit(reference.seconds * 1000, "both")}
                data-testid={`button-reference-${reference.seconds}`}
                className={`flex min-h-[44px] flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] ${
                  seconds === reference.seconds
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.1)]"
                    : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.4)] hover:border-[hsl(var(--brand-signal)/0.5)]"
                }`}
              >
                <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                  {reference.label}
                </span>
                <span className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {reference.note}
                </span>
              </button>
            ))}
          </div>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
