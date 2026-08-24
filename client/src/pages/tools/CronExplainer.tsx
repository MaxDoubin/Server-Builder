/**
 * Cron expression explainer.
 *
 * Parses the five standard crontab fields, renders them as a sentence, and
 * walks the calendar forward to find the next fire times. Everything is
 * computed with the browser's local Date, because that is the honest answer
 * to "when would this run": cron has no timezone of its own.
 */

import { useMemo, useState } from "react";
import { ToolShell, ToolPanel } from "./ToolShell";
import { CopyButton } from "@/components/ui/copy-button";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const MONTH_ALIASES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DAY_ALIASES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

const SHORTHANDS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

interface FieldDef {
  name: string;
  unit: string;
  plural: string;
  min: number;
  max: number;
  aliases?: Record<string, number>;
}

const FIELDS: FieldDef[] = [
  { name: "minute", unit: "minute", plural: "minutes", min: 0, max: 59 },
  { name: "hour", unit: "hour", plural: "hours", min: 0, max: 23 },
  { name: "day of month", unit: "day", plural: "days", min: 1, max: 31 },
  { name: "month", unit: "month", plural: "months", min: 1, max: 12, aliases: MONTH_ALIASES },
  { name: "day of week", unit: "day", plural: "days", min: 0, max: 7, aliases: DAY_ALIASES },
];

interface Field {
  def: FieldDef;
  raw: string;
  values: number[];
  /** Vixie cron keys its day-of-month / day-of-week rule off a leading asterisk. */
  star: boolean;
}

interface Spec {
  fields: [Field, Field, Field, Field, Field];
  normalized: string;
}

const QUARTZ_MESSAGE =
  "L, W, # and ? are Quartz and Spring scheduler extensions. Vixie cron, which is the crontab on Linux and BSD, does not accept them.";

function parseAtom(token: string, def: FieldDef): number {
  const upper = token.toUpperCase();
  if (def.aliases && upper in def.aliases) return def.aliases[upper];
  if (/^\d*[LW]$/i.test(token) || token.includes("#")) throw new Error(QUARTZ_MESSAGE);
  if (!/^\d+$/.test(token)) throw new Error(`"${token}" is not a value the ${def.name} field understands.`);
  return Number(token);
}

function parseField(raw: string, def: FieldDef): Field {
  if (raw === "") throw new Error(`The ${def.name} field is empty.`);
  if (raw.includes("#") || raw.includes("?")) throw new Error(QUARTZ_MESSAGE);

  const set = new Set<number>();
  for (const part of raw.split(",")) {
    if (part === "") throw new Error(`The ${def.name} field has an empty item in its list.`);
    const slash = part.split("/");
    if (slash.length > 2) throw new Error(`"${part}" has more than one / in it.`);

    let step = 1;
    if (slash.length === 2) {
      if (!/^\d+$/.test(slash[1])) throw new Error(`"${slash[1]}" is not a valid step.`);
      step = Number(slash[1]);
      if (step === 0) throw new Error("A step of 0 would never advance.");
    }

    const rangePart = slash[0];
    let lo: number;
    let hi: number;

    if (rangePart === "*") {
      lo = def.min;
      hi = def.max;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-");
      if (bounds.length !== 2) throw new Error(`"${rangePart}" is not a valid range.`);
      lo = parseAtom(bounds[0], def);
      hi = parseAtom(bounds[1], def);
      if (lo > hi) {
        throw new Error(
          `"${rangePart}" runs backwards. Cron ranges do not wrap around, so write it as two items, for example 6,0 rather than 6-0.`,
        );
      }
    } else {
      lo = parseAtom(rangePart, def);
      hi = lo;
      if (slash.length === 2) {
        throw new Error(
          `"${part}" applies a step to a single value. A step needs a range or an asterisk, for example ${lo}-${def.max}/${step}.`,
        );
      }
    }

    if (lo < def.min || hi > def.max) {
      throw new Error(`The ${def.name} field accepts ${def.min} to ${def.max}, and "${rangePart}" is outside that.`);
    }
    for (let v = lo; v <= hi; v += step) set.add(v);
  }

  // Cron accepts both 0 and 7 for Sunday.
  let values = Array.from(set);
  if (def.name === "day of week") values = Array.from(new Set(values.map((v) => (v === 7 ? 0 : v))));
  values.sort((a, b) => a - b);

  return { def, raw, values, star: raw.startsWith("*") };
}

function parseCron(input: string): Spec {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("Enter a cron expression.");

  if (trimmed.toLowerCase() === "@reboot") {
    throw new Error(
      "@reboot runs once when cron starts after a boot. It has no schedule, so there are no future fire times to list.",
    );
  }

  let expression = trimmed;
  const shorthand = SHORTHANDS[trimmed.toLowerCase()];
  if (shorthand) expression = shorthand;
  else if (trimmed.startsWith("@")) {
    throw new Error(
      `"${trimmed}" is not a recognised shorthand. Cron understands @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly and @reboot.`,
    );
  }

  const parts = expression.split(/\s+/);
  if (parts.length === 6 || parts.length === 7) {
    throw new Error(
      `This has ${parts.length} fields. Standard crontab takes 5 (minute hour day-of-month month day-of-week). Six or seven fields is Quartz or systemd style, where the extra leading field is seconds.`,
    );
  }
  if (parts.length !== 5) {
    throw new Error(`This has ${parts.length} field${parts.length === 1 ? "" : "s"}. A crontab line takes 5.`);
  }

  const fields = parts.map((part, i) => parseField(part, FIELDS[i])) as Spec["fields"];
  return { fields, normalized: expression };
}

// ── description ──────────────────────────────────────────────────────────────

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function uniformStep(values: number[]): number | null {
  if (values.length < 2) return null;
  const d = values[1] - values[0];
  for (let i = 2; i < values.length; i += 1) {
    if (values[i] - values[i - 1] !== d) return null;
  }
  return d;
}

function isFull(f: Field): boolean {
  const span = f.def.name === "day of week" ? 7 : f.def.max - f.def.min + 1;
  return f.values.length === span;
}

/**
 * Vixie cron: when both day fields are restricted the match is a union, not
 * an intersection. A leading asterisk in either field switches it back to an
 * intersection, and it really is the leading asterisk that is tested, so
 * "* / 2" in day of month still counts as unrestricted here.
 */
function isUnion(dom: Field, dow: Field): boolean {
  return !dom.star && !dow.star;
}

/** "every 5 minutes" style shorthand, only when the step covers the whole field. */
function everyN(f: Field): number | null {
  if (isFull(f)) return null;
  const d = uniformStep(f.values);
  if (d === null || d < 2) return null;
  const first = f.values[0];
  const last = f.values[f.values.length - 1];
  if (first !== f.def.min || last + d <= f.def.max) return null;
  return d;
}

function clause(f: Field): string {
  const { unit, plural } = f.def;
  if (isFull(f)) return `every ${unit}`;
  if (f.values.length === 1) return `${unit} ${f.values[0]}`;
  const n = everyN(f);
  if (n) return `every ${n} ${plural}`;
  const d = uniformStep(f.values);
  const first = f.values[0];
  const last = f.values[f.values.length - 1];
  if (d === 1) return `${plural} ${first} to ${last}`;
  if (d !== null) return `every ${ordinal(d)} ${unit} from ${first} to ${last}`;
  return `${plural} ${joinList(f.values.map(String))}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function timePhrase(minute: Field, hour: Field): string {
  const hourClause = clause(hour);
  if (isFull(minute) && isFull(hour)) return "Every minute";
  if (isFull(minute)) return `Every minute during ${hourClause}`;

  const mStep = everyN(minute);
  if (mStep && isFull(hour)) return `Every ${mStep} minutes`;
  if (mStep) return `Every ${mStep} minutes during ${hourClause}`;

  // Listing the clock times reads better than describing the fields, but only
  // while the list is short. Past that the field description is clearer.
  if (!isFull(hour) && minute.values.length * hour.values.length <= 8) {
    const times: string[] = [];
    hour.values.forEach((h) => minute.values.forEach((m) => times.push(`${pad(h)}:${pad(m)}`)));
    times.sort();
    return `At ${joinList(times)}`;
  }

  const minuteClause =
    minute.values.length === 1 ? `minute ${minute.values[0]}` : `minutes ${joinList(minute.values.map(String))}`;
  if (isFull(hour)) return `At ${minuteClause} of every hour`;
  return `At ${minuteClause} past ${hourClause}`;
}

function dayPhrase(dom: Field, dow: Field): string {
  const domFull = isFull(dom);
  const dowFull = isFull(dow);
  const union = isUnion(dom, dow);
  if (domFull && dowFull) return "every day";
  // A union with one unrestricted side already covers the whole week, so
  // "0 0 1 * 0-6" fires daily rather than on the first of the month.
  if (union && (domFull || dowFull)) return "every day";

  const domText = (() => {
    if (dom.values.length === 1) return `on the ${ordinal(dom.values[0])} of the month`;
    const n = everyN(dom);
    if (n) return `on every ${ordinal(n)} day of the month`;
    const d = uniformStep(dom.values);
    if (d === 1) return `on days ${dom.values[0]} to ${dom.values[dom.values.length - 1]} of the month`;
    return `on days ${joinList(dom.values.map(String))} of the month`;
  })();

  const dowText = (() => {
    const names = dow.values.map((v) => DAY_NAMES[v]);
    const d = uniformStep(dow.values);
    if (d === 1 && dow.values.length > 2) return `on ${names[0]} to ${names[names.length - 1]}`;
    return `on ${joinList(names)}`;
  })();

  if (dowFull) return domText;
  if (domFull) return dowText;
  return union ? `${domText}, and also ${dowText}` : `${domText}, but only ${dowText}`;
}

function monthPhrase(month: Field): string {
  if (isFull(month)) return "";
  const names = month.values.map((v) => MONTH_NAMES[v - 1]);
  if (uniformStep(month.values) === 1 && names.length > 2) {
    return `from ${names[0]} to ${names[names.length - 1]}`;
  }
  return `in ${joinList(names)}`;
}

function describe(spec: Spec): string {
  const [minute, hour, dom, month, dow] = spec.fields;
  const time = timePhrase(minute, hour);
  let day = dayPhrase(dom, dow);
  // "Every minute every day" says the same thing twice.
  if (day === "every day" && /\bevery\b/i.test(time)) day = "";
  const month_ = monthPhrase(month);

  let out = time;
  if (day) out += ` ${day}`;
  if (month_) out += `${day.includes(",") ? "," : ""} ${month_}`;
  return `${out}.`;
}

// ── next fire times ──────────────────────────────────────────────────────────

function matchesDay(spec: Spec, date: Date): boolean {
  const [, , dom, , dow] = spec.fields;
  const domHit = dom.values.includes(date.getDate());
  const dowHit = dow.values.includes(date.getDay());
  // "0 0 13 * 5" fires on every 13th and on every Friday, not on Friday the
  // 13th, which is the single most misread thing in a crontab.
  return isUnion(dom, dow) ? domHit || dowHit : domHit && dowHit;
}

function nextFires(spec: Spec, from: Date, count: number): Date[] {
  const [minute, hour, , month] = spec.fields;
  const out: Date[] = [];
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const horizon = new Date(from.getTime());
  horizon.setFullYear(horizon.getFullYear() + 5);

  let guard = 0;
  while (out.length < count && cursor <= horizon && guard < 300000) {
    guard += 1;
    if (!month.values.includes(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!matchesDay(spec, cursor)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!hour.values.includes(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!minute.values.includes(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }
    out.push(new Date(cursor.getTime()));
    cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
  }
  return out;
}

function formatFire(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function relative(from: Date, to: Date): string {
  const mins = Math.round((to.getTime() - from.getTime()) / 60000);
  if (mins < 1) return "in under a minute";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `in ${hours} h ${mins % 60} min`;
  const days = Math.floor(hours / 24);
  return `in ${days} days`;
}

const PRESETS: { expr: string; label: string }[] = [
  { expr: "* * * * *", label: "Every minute" },
  { expr: "*/15 * * * *", label: "Every 15 minutes" },
  { expr: "0 * * * *", label: "Every hour on the hour (@hourly)" },
  { expr: "0 0 * * *", label: "Every day at midnight (@daily)" },
  { expr: "0 9 * * 1-5", label: "Weekdays at 09:00" },
  { expr: "30 2 * * 0", label: "Sundays at 02:30 (@weekly slot)" },
  { expr: "0 0 1 * *", label: "First of the month at midnight (@monthly)" },
  { expr: "0 0 1 1 *", label: "New Year's Day at midnight (@yearly)" },
  { expr: "*/5 9-17 * * 1-5", label: "Every 5 minutes, business hours, weekdays" },
  { expr: "0 3 * * 6", label: "Saturdays at 03:00, a maintenance window" },
];

export function CronExplainer() {
  const [input, setInput] = useState("30 9 * * 1,5");
  const [nowTick, setNowTick] = useState(() => Date.now());

  const parsed = useMemo(() => {
    try {
      return { spec: parseCron(input), error: null as string | null };
    } catch (err) {
      return { spec: null, error: err instanceof Error ? err.message : "Could not parse that expression." };
    }
  }, [input]);

  const now = useMemo(() => new Date(nowTick), [nowTick]);
  const fires = useMemo(
    () => (parsed.spec ? nextFires(parsed.spec, now, 8) : []),
    [parsed.spec, now],
  );

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "your local timezone";
    } catch {
      return "your local timezone";
    }
  }, []);

  const offsetLabel = useMemo(() => {
    const mins = -now.getTimezoneOffset();
    const sign = mins < 0 ? "-" : "+";
    const abs = Math.abs(mins);
    return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }, [now]);

  const unionWarning =
    parsed.spec !== null &&
    isUnion(parsed.spec.fields[2], parsed.spec.fields[4]) &&
    !(isFull(parsed.spec.fields[2]) && isFull(parsed.spec.fields[4]));

  return (
    <ToolShell
      slug="cron-explainer"
      notes={
        <>
          <p>
            A crontab line is five whitespace separated fields: minute, hour, day of month,
            month, day of week, then the command. Each field takes an asterisk for "every",
            a number, a range like <code>1-5</code>, a comma separated list, or a step like{" "}
            <code>*/15</code>. Months accept <code>JAN</code> through <code>DEC</code> and
            days accept <code>SUN</code> through <code>SAT</code>. Day of week runs 0 to 7
            with both 0 and 7 meaning Sunday, which is a small mercy given how often people
            guess wrong about which end the week starts.
          </p>
          <p>
            The rule that catches everyone is how the two day fields combine. When day of
            month and day of week are both restricted, cron fires if <em>either</em> one
            matches, not both. <code>0 0 13 * 5</code> does not mean "Friday the 13th"; it
            means every 13th of the month <em>and</em> every Friday. To get the intersection
            you have to leave one field as an asterisk, or do the check inside the command
            itself. In the original Vixie implementation the switch is literally whether the
            field starts with an asterisk, so <code>*/2</code> in the day-of-month field
            still counts as unrestricted for the purposes of that test.
          </p>
          <p>
            Cron has no timezone of its own. It runs in whatever timezone the daemon's system
            clock is set to, which on a server is usually UTC and on a laptop usually is not.
            The times listed above are computed in {timeZone}, so they are what you would see
            if the machine running the job shared your clock. If it does not, translate
            first. Daylight saving makes this worse: on the spring transition the skipped
            hour means jobs scheduled inside it may not run at all, and on the autumn
            transition the repeated hour means they may run twice. Anything financial,
            billing related, or ordering sensitive belongs at a time of day that never
            disappears, or on a UTC clock, or on a systemd timer with{" "}
            <code>Persistent=true</code> so a missed run is caught up rather than lost.
          </p>
          <p>
            Two smaller habits worth having. Cron runs with a nearly empty environment, so a
            script that works in your shell frequently fails under cron because{" "}
            <code>$PATH</code> is short and your profile was never sourced: use absolute
            paths and set the variables you need inside the script. And a percent sign in a
            crontab command is not a percent sign, it is a newline that feeds the rest of the
            line to the command on standard input, so any date format string with{" "}
            <code>%Y</code> in it has to be escaped as <code>\%Y</code>.
          </p>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <ToolPanel title="Expression">
            <label htmlFor="cron-input" className="sr-only">
              Cron expression
            </label>
            <input
              id="cron-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-invalid={parsed.error !== null}
              aria-describedby={parsed.error ? "cron-error" : "cron-description"}
              data-testid="input-cron"
              placeholder="*/5 9-17 * * 1-5"
              className="w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-base text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none"
            />

            <div className="mt-3 grid grid-cols-5 gap-1 text-center">
              {FIELDS.map((f, i) => (
                <div
                  key={f.name}
                  className="rounded border border-[hsl(var(--brand-iron)/0.6)] px-1 py-1.5 font-mono-tight text-[9px] uppercase leading-tight tracking-[0.1em] text-[hsl(var(--brand-ash))]"
                >
                  {f.name}
                  <div className="mt-0.5 text-[hsl(var(--brand-bone-dim))]">
                    {f.min}-{f.max}
                  </div>
                  <div className="mt-0.5 break-all text-[hsl(var(--brand-signal))]">
                    {parsed.spec ? parsed.spec.fields[i].raw : "?"}
                  </div>
                </div>
              ))}
            </div>

            {parsed.error ? (
              <p
                id="cron-error"
                role="alert"
                data-testid="text-cron-error"
                className="mt-4 rounded-lg border border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]"
              >
                <strong className="font-normal uppercase tracking-[0.2em]">Invalid: </strong>
                {parsed.error}
              </p>
            ) : (
              <div id="cron-description" className="mt-4">
                <p
                  data-testid="text-cron-description"
                  className="font-display text-lg leading-snug text-[hsl(var(--brand-bone))]"
                >
                  {parsed.spec ? describe(parsed.spec) : ""}
                </p>
                {parsed.spec && parsed.spec.normalized !== input.trim() ? (
                  <p className="mt-2 font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                    {input.trim()} expands to <code>{parsed.spec.normalized}</code>
                  </p>
                ) : null}
                {unionWarning ? (
                  <p className="mt-3 rounded-lg border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] p-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                    <strong className="font-normal uppercase tracking-[0.2em]">Note: </strong>
                    both day fields are restricted, so this is a union. The job fires when the
                    day of month matches or the day of week matches, not only when both do.
                  </p>
                ) : null}
              </div>
            )}
          </ToolPanel>

          <ToolPanel title="Next 8 fire times">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                {timeZone} · {offsetLabel}
              </p>
              <button
                type="button"
                onClick={() => setNowTick(Date.now())}
                data-testid="button-recalculate"
                className="inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                Recalculate
              </button>
            </div>

            {parsed.spec === null ? (
              <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-ash))]">
                Fix the expression to see fire times.
              </p>
            ) : fires.length === 0 ? (
              <p
                role="alert"
                data-testid="text-no-fires"
                className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-amber))]"
              >
                This expression has no fire time in the next five years. A date that does not
                exist, such as 30 February or 31 April, parses cleanly and then never matches.
              </p>
            ) : (
              <ol className="mt-3" data-testid="list-fire-times">
                {fires.map((fire, i) => (
                  <li
                    key={fire.getTime()}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.5)] py-2.5 last:border-b-0"
                  >
                    <span className="font-mono-tight text-sm text-[hsl(var(--brand-bone))]">
                      <span className="mr-3 text-[hsl(var(--brand-ash))]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {formatFire(fire)}
                    </span>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-signal))]">
                      {relative(now, fire)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Presets">
          <ul className="space-y-2">
            {PRESETS.map((preset) => (
              <li key={preset.expr} className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInput(preset.expr)}
                  data-testid={`button-preset-${preset.expr.replace(/[^a-z0-9]+/gi, "-")}`}
                  className="min-h-[36px] min-w-[7.5rem] shrink-0 rounded-md border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-1.5 text-left font-mono-tight text-xs text-[hsl(var(--brand-signal))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {preset.expr}
                </button>
                <span className="min-w-0 flex-1 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {preset.label}
                </span>
                <CopyButton value={preset.expr} label={`Copy ${preset.expr}`} />
              </li>
            ))}
          </ul>
          <p className="mt-5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            The shorthands work here too: <code>@hourly</code>, <code>@daily</code>,{" "}
            <code>@midnight</code>, <code>@weekly</code>, <code>@monthly</code>,{" "}
            <code>@yearly</code>. They expand to the five field forms above.
          </p>
        </ToolPanel>
      </div>
    </ToolShell>
  );
}
