/**
 * Cron to systemd timer converter.
 *
 * Pure logic. The input side follows Vixie cron and cronie, crontab(5): five
 * fields, names, lists, ranges, steps, and the rule that day-of-month and
 * day-of-week are ORed when both are restricted. The output side follows
 * systemd.time(7) calendar events and systemd.timer(5).
 *
 * The schedule is parsed into explicit value sets first, and the OnCalendar
 * text is rendered from those sets. Two independent matchers (one for cron
 * semantics, one for the calendar lines that were generated) let the tests
 * check that the conversion kept the schedule, and `systemd-analyze calendar`
 * is the final oracle for the rendered text.
 */

import {
  MAX_LINE_LENGTH,
  heredocTag,
  isValidAccountName,
  normalizeUnitName,
  parseTimespan,
  type Finding,
  type Level,
} from "./systemd-unit-builder";

export type { Finding };

/* ---------------------------------------------------------------- types */

export interface CronField {
  raw: string;
  /** Sorted, unique values. Day of week is folded to 0 to 6, Sunday 0. */
  values: number[];
  /** Vixie cron decides whether a day field is restricted from its first character. */
  star: boolean;
}

export interface CronSchedule {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

export type CrontabParse =
  | { ok: true; kind: "schedule"; schedule: CronSchedule; macro: string | null; text: string; command: string; notes: string[] }
  | { ok: true; kind: "reboot"; text: string; command: string; notes: string[] }
  | { ok: false; error: string };

/** One OnCalendar line before rendering. null means every value. */
export interface CalendarLine {
  weekdays: number[] | null;
  months: number[] | null;
  days: number[] | null;
  hours: number[];
  minutes: number[];
}

export interface TimerOptions {
  /** A crontab line or a bare expression. A command after the fifth field is used as the command. */
  cron: string;
  name: string;
  /** Overrides the command found in the cron line. */
  command: string;
  user: string;
  workingDirectory: string;
  persistent: boolean;
  randomizedDelaySec: string;
  /** Adds AccuracySec=1s so the timer fires within a second rather than a minute. */
  preciseTiming: boolean;
  /** An optional zone name appended to every OnCalendar line. */
  timezone: string;
}

export interface TimerBuild {
  parsed: boolean;
  isReboot: boolean;
  /** The OnCalendar values, one per line of the timer. */
  calendar: string[];
  /** True when two lines were needed because cron ORs day-of-month and day-of-week. */
  orRule: boolean;
  timerFile: string;
  serviceFile: string;
  timer: string;
  service: string;
  /** systemd-analyze commands that print the normalized form and the next runs. */
  verifyCommands: string;
  installCommands: string;
  script: string;
  findings: Finding[];
  errors: number;
  warnings: number;
  notes: number;
}

/* ------------------------------------------------------------- constants */

export const MAX_INPUT_LENGTH = MAX_LINE_LENGTH;

/** Furthest ahead nextCronRuns looks. Eleven years covers a Feb 29 across a century leap-year gap. */
export const MAX_SEARCH_DAYS = 4400;

interface FieldDef {
  name: string;
  min: number;
  max: number;
  names?: Record<string, number>;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const DAY_NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const DEFS = {
  minute: { name: "minute", min: 0, max: 59 },
  hour: { name: "hour", min: 0, max: 23 },
  dom: { name: "day-of-month", min: 1, max: 31 },
  month: { name: "month", min: 1, max: 12, names: MONTH_NAMES },
  dow: { name: "day-of-week", min: 0, max: 7, names: DAY_NAMES },
} satisfies Record<string, FieldDef>;

/** Macros from crontab(5), as the five field expression each one stands for. */
export const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const QUARTZ =
  "L, W, # and ? are Quartz and Spring scheduler extensions. Vixie cron and cronie, which is the crontab on Linux, do not accept them.";

/** Days in each month, with February at its longest so a leap day counts as possible. */
const MAX_DAYS_IN_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* ---------------------------------------------------------------- parse */

class CronError extends Error {}

function parseAtom(token: string, def: FieldDef): number {
  const lower = token.toLowerCase();
  if (def.names) {
    if (lower in def.names) return def.names[lower];
    if (/^[a-z]+$/.test(lower)) {
      const short = lower.slice(0, 3);
      if (lower.length > 3 && short in def.names) {
        throw new CronError(`"${token}" is too long. Cron takes the three-letter name, ${short}.`);
      }
      throw new CronError(`"${token}" is not a name the ${def.name} field understands.`);
    }
  }
  if (!/^\d+$/.test(token)) {
    throw new CronError(`"${token}" is not a value the ${def.name} field understands.`);
  }
  return Number(token);
}

function parseField(raw: string, def: FieldDef, notes: string[]): CronField {
  if (raw === "") throw new CronError(`The ${def.name} field is empty.`);
  if (/[?#]/.test(raw) || raw.split(",").some((p) => /^\d*[LW]$/i.test(p.split("/")[0] ?? ""))) {
    throw new CronError(QUARTZ);
  }

  const set = new Set<number>();
  for (const part of raw.split(",")) {
    if (part === "") throw new CronError(`The ${def.name} field has an empty item in its list.`);
    const pieces = part.split("/");
    if (pieces.length > 2) throw new CronError(`"${part}" has more than one slash in it.`);

    let step = 1;
    if (pieces.length === 2) {
      if (!/^\d+$/.test(pieces[1])) throw new CronError(`"${pieces[1]}" is not a valid step. A step is a whole number.`);
      step = Number(pieces[1]);
      if (step === 0) throw new CronError("A step of 0 would never advance.");
    }

    const rangePart = pieces[0];
    let lo: number;
    let hi: number;
    if (rangePart === "*") {
      lo = def.min;
      hi = def.max;
    } else if (rangePart.includes("-")) {
      const bounds = rangePart.split("-");
      if (bounds.length !== 2 || bounds[0] === "" || bounds[1] === "") {
        throw new CronError(`"${rangePart}" is not a valid range.`);
      }
      lo = parseAtom(bounds[0], def);
      hi = parseAtom(bounds[1], def);
      if (lo > hi) {
        throw new CronError(
          `"${rangePart}" runs backwards. Cron ranges do not wrap around, so write it as two items, for example 22-23,0-5 rather than 22-5.`,
        );
      }
    } else {
      lo = parseAtom(rangePart, def);
      hi = lo;
      if (pieces.length === 2) {
        // Vixie cron rejects a step on a single value. Quartz and systemd read
        // N/step as a start value that repeats to the end of the range, so
        // that is what it is taken to mean here, and the reader is told.
        hi = def.max;
        notes.push(
          `${part} in the ${def.name} field is read as ${lo}-${def.max}/${step}. Standard cron does not accept a step on a single value, so check your cron implementation accepts it.`,
        );
      }
    }
    if (lo < def.min || hi > def.max) {
      throw new CronError(`The ${def.name} field accepts ${def.min} to ${def.max}, and "${rangePart}" is outside that.`);
    }
    for (let v = lo; v <= hi; v += step) set.add(v);
  }

  let values = Array.from(set);
  // Cron accepts both 0 and 7 for Sunday.
  if (def === DEFS.dow) values = Array.from(new Set(values.map((v) => (v === 7 ? 0 : v))));
  values.sort((a, b) => a - b);
  return { raw, values, star: raw.startsWith("*") };
}

/**
 * Parses a crontab line or a bare expression. A command after the fifth field
 * (or after a macro) is returned separately. Never throws.
 */
export function parseCrontabLine(input: string): CrontabParse {
  try {
    if (input.length > MAX_INPUT_LENGTH) {
      return { ok: false, error: `That is ${input.length} characters. The limit is ${MAX_INPUT_LENGTH}.` };
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input)) {
      return { ok: false, error: "The input contains a control character." };
    }
    const lines = input
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    if (lines.length === 0) return { ok: false, error: "Enter a cron expression." };
    if (lines.length > 1) return { ok: false, error: "Paste one crontab line at a time." };
    const text = lines[0];

    const notes: string[] = [];
    if (text.startsWith("@")) {
      const m = /^(@\S+)(?:\s+([\s\S]*))?$/.exec(text);
      const macro = (m?.[1] ?? text).toLowerCase();
      const command = (m?.[2] ?? "").trim();
      if (macro === "@reboot") return { ok: true, kind: "reboot", text: macro, command, notes };
      const expansion = MACROS[macro];
      if (!expansion) {
        const known = [...Object.keys(MACROS), "@reboot"].join(", ");
        const every = /^@every/.test(macro) ? " @every is a Go cron extension and not part of crontab." : "";
        return { ok: false, error: `${m?.[1] ?? text} is not a crontab macro.${every} The macros are ${known}.` };
      }
      const parsed = parseFiveFields(expansion.split(" "), notes);
      return { ok: true, kind: "schedule", schedule: parsed, macro, text: macro, command, notes };
    }

    const m = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/.exec(text);
    if (!m) {
      const count = text.split(/\s+/).length;
      return {
        ok: false,
        error: `A cron expression has five fields: minute, hour, day of month, month, day of week. This has ${count}.`,
      };
    }
    const rest = (m[6] ?? "").trim();
    const next = rest.split(/\s+/)[0] ?? "";
    if (next !== "" && /^[0-9*,/?-]+$/.test(next)) {
      return {
        ok: false,
        error:
          "This looks like six or seven fields, as in Quartz or Spring, where the first is seconds. Crontab has five. Drop the seconds field, or use a systemd calendar expression directly.",
      };
    }
    const schedule = parseFiveFields([m[1], m[2], m[3], m[4], m[5]], notes);
    return { ok: true, kind: "schedule", schedule, macro: null, text: `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`, command: rest, notes };
  } catch (err) {
    if (err instanceof CronError) return { ok: false, error: err.message };
    return { ok: false, error: "That could not be read as a cron expression." };
  }
}

function parseFiveFields(f: string[], notes: string[]): CronSchedule {
  return {
    minute: parseField(f[0], DEFS.minute, notes),
    hour: parseField(f[1], DEFS.hour, notes),
    dom: parseField(f[2], DEFS.dom, notes),
    month: parseField(f[3], DEFS.month, notes),
    dow: parseField(f[4], DEFS.dow, notes),
  };
}

/* ------------------------------------------------------- cron semantics */

/**
 * Whether cron would run at the given moment. Month, hour and minute must
 * match. For the day, if either day field starts with an asterisk both must
 * match, and if neither does, either one matching is enough. That is the
 * crontab(5) note about the two day fields, as Vixie cron and cronie
 * implement it with a flag set by the first character of each field.
 */
export function cronMatches(s: CronSchedule, month: number, day: number, weekday: number, hour: number, minute: number): boolean {
  if (!s.minute.values.includes(minute) || !s.hour.values.includes(hour)) return false;
  return cronDayMatches(s, month, day, weekday);
}

export function cronDayMatches(s: CronSchedule, month: number, day: number, weekday: number): boolean {
  if (!s.month.values.includes(month)) return false;
  const domHit = s.dom.values.includes(day);
  const dowHit = s.dow.values.includes(weekday);
  return s.dom.star || s.dow.star ? domHit && dowHit : domHit || dowHit;
}

/**
 * The next fire times strictly after `after`, in the machine's local time
 * zone. Walks day by day and expands only the days that match, so a sparse
 * schedule such as Feb 29 stays cheap. Looks MAX_SEARCH_DAYS ahead at most.
 */
export function nextCronRuns(s: CronSchedule, after: Date, count: number, maxDays = MAX_SEARCH_DAYS): Date[] {
  const out: Date[] = [];
  if (Number.isNaN(after.getTime()) || count <= 0) return out;
  const y = after.getFullYear();
  const mo = after.getMonth();
  const d = after.getDate();
  for (let i = 0; i < maxDays && out.length < count; i += 1) {
    const day = new Date(y, mo, d + i);
    if (!cronDayMatches(s, day.getMonth() + 1, day.getDate(), day.getDay())) continue;
    for (const h of s.hour.values) {
      for (const mi of s.minute.values) {
        const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi);
        // A wall-clock time inside a daylight saving gap does not exist.
        if (t.getHours() !== h || t.getMinutes() !== mi) continue;
        if (t.getTime() <= after.getTime()) continue;
        out.push(t);
        if (out.length >= count) return out;
      }
    }
  }
  return out;
}

/* ------------------------------------------------------ calendar output */

const isFull = (values: number[], min: number, max: number): boolean => values.length === max - min + 1;

/** Whether `a/s` reproduces the whole set, stepping from its first value to the top of the range. */
function isRepeat(values: number[], max: number): { start: number; step: number } | null {
  if (values.length < 3) return null;
  const step = values[1] - values[0];
  if (step < 2) return null;
  for (let i = 1; i < values.length; i += 1) if (values[i] - values[i - 1] !== step) return null;
  return values[values.length - 1] + step > max ? { start: values[0], step } : null;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * One numeric component: `*`, a repeat such as 00/15, or a list with .. ranges
 * for runs of three or more. Months are always listed, because a repeat there
 * reads as 01/3-01 once it sits between the dashes of the date.
 */
export function renderNumbers(values: number[], min: number, max: number, allowRepeat = true): string {
  if (isFull(values, min, max)) return "*";
  const repeat = allowRepeat ? isRepeat(values, max) : null;
  if (repeat) return `${pad2(repeat.start)}/${repeat.step}`;
  const parts: string[] = [];
  let i = 0;
  while (i < values.length) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`${pad2(values[i])}..${pad2(values[j])}`);
    else for (let k = i; k <= j; k += 1) parts.push(pad2(values[k]));
    i = j + 1;
  }
  return parts.join(",");
}

/** Weekdays in Monday-first order, which is how systemd numbers them, so Fri..Sun is a valid range. */
export function renderWeekdays(values: number[]): string {
  const order = values.map((v) => (v + 6) % 7).sort((a, b) => a - b);
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const parts: string[] = [];
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1] === order[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`${names[order[i]]}..${names[order[j]]}`);
    else for (let k = i; k <= j; k += 1) parts.push(names[order[k]]);
    i = j + 1;
  }
  return parts.join(",");
}

export function renderCalendarLine(line: CalendarLine, timezone = ""): string {
  const weekday = line.weekdays === null || line.weekdays.length === 7 ? "" : `${renderWeekdays(line.weekdays)} `;
  const month = line.months === null ? "*" : renderNumbers(line.months, 1, 12, false);
  const day = line.days === null ? "*" : renderNumbers(line.days, 1, 31);
  const hour = renderNumbers(line.hours, 0, 23);
  const minute = renderNumbers(line.minutes, 0, 59);
  const zone = timezone === "" ? "" : ` ${timezone}`;
  return `${weekday}*-${month}-${day} ${hour}:${minute}:00${zone}`;
}

/** Whether a calendar line elapses at the given moment. Weekday and date must both match, as in systemd. */
export function calendarLineMatches(line: CalendarLine, month: number, day: number, weekday: number, hour: number, minute: number): boolean {
  return (
    (line.months === null || line.months.includes(month)) &&
    (line.days === null || line.days.includes(day)) &&
    (line.weekdays === null || line.weekdays.includes(weekday)) &&
    line.hours.includes(hour) &&
    line.minutes.includes(minute)
  );
}

/** True when some month in the set has one of the days, counting February as having 29. */
function datePossible(months: number[], days: number[]): boolean {
  return months.some((m) => days.some((d) => d <= MAX_DAYS_IN_MONTH[m]));
}

export interface Conversion {
  lines: CalendarLine[];
  /** Cron ORed the two day fields, so the schedule needs two lines. */
  orRule: boolean;
  findings: Finding[];
}

/**
 * Turns a parsed schedule into calendar lines.
 *
 * The one place the two systems disagree is the day. Cron with both day
 * fields restricted fires when either matches. systemd with a weekday and a
 * date requires both. So the OR case becomes two lines, one for the dates
 * and one for the weekdays, and the timer fires on whichever comes first.
 */
export function convertSchedule(s: CronSchedule): Conversion {
  const findings: Finding[] = [];
  const add = (level: Level, field: string | null, message: string): void => {
    findings.push({ level, field, message });
  };
  const months = isFull(s.month.values, 1, 12) ? null : s.month.values;
  const monthSet = months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const domFull = isFull(s.dom.values, 1, 31);
  const dowFull = isFull(s.dow.values, 0, 6);
  const base = { months, hours: s.hour.values, minutes: s.minute.values };

  let lines: CalendarLine[];
  let orRule = false;

  if (s.dom.star || s.dow.star) {
    lines = [{ ...base, days: domFull ? null : s.dom.values, weekdays: dowFull ? null : s.dow.values }];
    const starred = s.dom.star ? s.dom : s.dow;
    const other = s.dom.star ? s.dow : s.dom;
    if (starred.raw !== "*" && !other.star) {
      add(
        "info",
        "cron",
        `The ${s.dom.star ? "day-of-month" : "day-of-week"} field is ${starred.raw}. Cron decides a day field is unrestricted when it starts with an asterisk, so here both day fields must match, not either. The calendar line is a single one that requires both.`,
      );
    }
  } else if (domFull || dowFull) {
    // Either side covering every day makes the OR cover every day.
    lines = [{ ...base, days: null, weekdays: null }];
    add(
      "info",
      "cron",
      `Both day fields are restricted, which makes cron fire when either matches. ${domFull ? "The day-of-month field lists every day" : "The day-of-week field lists every day"}, so the schedule fires every day.`,
    );
  } else {
    const dateLine: CalendarLine = { ...base, days: s.dom.values, weekdays: null };
    const weekdayLine: CalendarLine = { ...base, days: null, weekdays: s.dow.values };
    if (datePossible(monthSet, s.dom.values)) lines = [dateLine, weekdayLine];
    else {
      lines = [weekdayLine];
      add(
        "warn",
        "cron",
        "The day-of-month part never matches a real date in the chosen months, so only the day-of-week part can fire. The date line was left out.",
      );
    }
    orRule = lines.length === 2;
    if (lines.length === 2) {
      add(
        "warn",
        "cron",
        "Both day-of-month and day-of-week are restricted. Cron runs the job when either one matches. A single OnCalendar line cannot say that, because systemd requires the weekday and the date to match together. Two OnCalendar lines are written instead, and the timer fires on whichever comes first.",
      );
    }
  }

  // A date line that names days no chosen month has fires never.
  const dayLines = lines.filter((l) => l.days !== null);
  if (dayLines.length > 0 && !orRule) {
    const line = dayLines[0];
    if (!datePossible(line.months ?? monthSet, line.days ?? [])) {
      add("error", "cron", "This matches no real date. For example, February has no 30th and April has no 31st, so cron would never run it.");
      lines = [];
    }
  }

  if (lines.length > 0) {
    if (isRepeatGap(s.minute.values, 59)) {
      add(
        "info",
        "cron",
        `A step restarts at the top of each hour. ${s.minute.raw} in the minute field last fires at :${pad2(s.minute.values[s.minute.values.length - 1])} and then again at :00 in the next hour, so that gap is shorter than the others.`,
      );
    }
    if (isRepeatGap(s.hour.values, 23)) {
      add(
        "info",
        "cron",
        `A step restarts at midnight. ${s.hour.raw} in the hour field last fires at ${pad2(s.hour.values[s.hour.values.length - 1])}:00 and then again at 00:00 the next day, so that gap is shorter than the others.`,
      );
    }
    const days = lines.flatMap((l) => l.days ?? []);
    if (days.length > 0) {
      const top = Math.max(...days);
      const shortMonths = monthSet.filter((m) => MAX_DAYS_IN_MONTH[m] < top);
      if (shortMonths.length > 0) {
        add(
          "info",
          "cron",
          `Day ${top} does not exist in every month. Cron and systemd both skip the months that lack it${top === 29 ? ", and February has a 29th only in a leap year" : ""}.`,
        );
      }
    }
  }
  return { lines, orRule, findings };
}

/** A repeat whose step does not divide the range, so the last gap is short. */
function isRepeatGap(values: number[], max: number): boolean {
  const repeat = isRepeat(values, max);
  return repeat !== null && (max + 1) % repeat.step !== 0;
}

/* ------------------------------------------------------ command to unit */

export interface CommandConversion {
  execStart: string | null;
  viaShell: boolean;
  error: string | null;
}

/** Characters a command word may hold and still be passed to exec without a shell. */
const PLAIN_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Turns the command from a crontab line into an ExecStart= value.
 *
 * Cron hands the command to `sh -c`, so pipes, redirects, quotes, globs and
 * variables all work there and mean nothing to systemd. A command made only
 * of plain words is passed through. Anything else is wrapped in /bin/sh -c
 * with the quoting systemd needs: backslash and single quote escaped, % doubled
 * because unit files read specifiers, and $ doubled because systemd substitutes
 * variables before the shell sees the text.
 */
export function cronCommandToExecStart(command: string): CommandConversion {
  const text = command.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return { execStart: null, viaShell: false, error: "The command contains a control character." };
  }
  if (text.length > MAX_LINE_LENGTH) {
    return { execStart: null, viaShell: false, error: `The command is longer than ${MAX_LINE_LENGTH} characters.` };
  }
  let literal = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\" && text[i + 1] === "%") {
      literal += "%";
      i += 1;
    } else if (ch === "%") {
      return {
        execStart: null,
        viaShell: false,
        error:
          "The command has an unescaped %. Cron turns the first one into a newline and sends everything after it to the command as standard input. ExecStart= has no equivalent, so write the command to read a file, or escape a literal percent sign as \\%.",
      };
    } else literal += ch;
  }
  const words = literal.split(/\s+/).filter(Boolean);
  const plain = words.length > 0 && words.every((w) => PLAIN_WORD.test(w)) && !words[0].includes("=");
  if (plain) {
    return { execStart: words.join(" ").replace(/%/g, "%%"), viaShell: false, error: null };
  }
  const quoted = literal
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/%/g, "%%")
    .replace(/\$/g, "$$$$");
  return { execStart: `/bin/sh -c '${quoted}'`, viaShell: true, error: null };
}

/* ----------------------------------------------------------- the build */

const percentEscape = (text: string): string => text.replace(/%/g, "%%");

function shellQuote(text: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(text) ? text : `'${text.replace(/'/g, `'\\''`)}'`;
}

export function defaultTimerOptions(): TimerOptions {
  return {
    cron: "30 2 * * 1-5 /usr/local/bin/nightly-backup",
    name: "nightly-backup",
    command: "",
    user: "",
    workingDirectory: "",
    persistent: true,
    randomizedDelaySec: "",
    preciseTiming: false,
    timezone: "",
  };
}

export function buildTimer(o: TimerOptions): TimerBuild {
  const findings: Finding[] = [];
  const add = (level: Level, field: string | null, message: string): void => {
    findings.push({ level, field, message });
  };
  function finish(partial: Omit<TimerBuild, "findings" | "errors" | "warnings" | "notes">): TimerBuild {
    const errors = findings.filter((f) => f.level === "error").length;
    const warnings = findings.filter((f) => f.level === "warn").length;
    return { ...partial, findings, errors, warnings, notes: findings.length - errors - warnings };
  }

  const parse = parseCrontabLine(o.cron);
  if (!parse.ok) {
    add("error", "cron", parse.error);
    return finish({
      parsed: false,
      isReboot: false,
      calendar: [],
      orRule: false,
      timerFile: "",
      serviceFile: "",
      timer: "",
      service: "",
      verifyCommands: "",
      installCommands: "",
      script: "",
    });
  }
  for (const note of parse.notes) add("warn", "cron", note);

  /* Name. */
  let rawName = o.name.replace(/[\r\n]+/g, " ").trim();
  if (rawName.endsWith(".timer")) rawName = rawName.slice(0, -".timer".length);
  const nameCheck = normalizeUnitName(rawName);
  if (nameCheck.error) add("error", "name", nameCheck.error);
  const name = nameCheck.error ? "" : nameCheck.name;

  /* Command. */
  const typedCommand = o.command.replace(/[\r\n]+/g, " ").trim();
  const source = typedCommand !== "" ? typedCommand : parse.command;
  let execStart: string | null = null;
  if (source === "") {
    execStart = `/usr/local/bin/${name === "" ? "mytask" : name}`;
    add("info", "command", `No command was given, so ExecStart= holds a placeholder, ${execStart}. Replace it with the command cron ran.`);
  } else {
    const conv = cronCommandToExecStart(source);
    if (conv.error) add("error", "command", conv.error);
    else {
      execStart = conv.execStart;
      if (conv.viaShell) {
        add(
          "info",
          "command",
          "The command uses shell syntax such as a pipe, a redirect, a quote, a glob or a variable. Cron runs commands through sh -c and systemd does not, so ExecStart= wraps it in /bin/sh -c with the quoting systemd needs.",
        );
      } else {
        const first = (conv.execStart ?? "").split(" ")[0] ?? "";
        if (!first.startsWith("/")) {
          add("warn", "command", `"${first}" has no directory. Cron searched PATH, and systemd searches a fixed built-in path. Give the full path to be certain which program runs.`);
        }
      }
    }
  }

  /* Service identity. */
  const user = o.user.trim();
  if (user !== "" && !isValidAccountName(user)) {
    add("error", "user", `"${user}" is not a valid account name. Use letters, digits, _ . and -, starting with a letter or underscore, or a numeric UID.`);
  }
  const workdir = o.workingDirectory.replace(/[\r\n]+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (workdir !== "" && (/[\u0000-\u001f\u007f]/.test(workdir) || !/^-?(\/|~)/.test(workdir))) {
    add("error", "workingDirectory", "WorkingDirectory= must be an absolute path, or ~ for the service user's home directory.");
  }
  const workdirOk = workdir !== "" && !/[\u0000-\u001f\u007f]/.test(workdir) && /^-?(\/|~)/.test(workdir);

  /* Timer settings. */
  const timezone = o.timezone.trim();
  if (timezone !== "" && !/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(timezone)) {
    add("error", "timezone", "A time zone is a name such as UTC or Europe/Berlin. timedatectl list-timezones prints the valid ones.");
  }
  const zone = timezone !== "" && /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(timezone) ? timezone : "";

  const delayRaw = o.randomizedDelaySec.replace(/[\r\n]+/g, " ").trim();
  let delaySeconds: number | null = null;
  if (delayRaw !== "") {
    delaySeconds = parseTimespan(delayRaw);
    if (delaySeconds === null) {
      add("error", "randomizedDelaySec", `"${delayRaw}" is not a time span. Use a number of seconds or a value such as 30s, 5min or 1h.`);
    }
  }

  /* Calendar lines. */
  let calendar: string[] = [];
  let orRule = false;
  let isReboot = false;
  let minGapSeconds: number | null = null;
  if (parse.kind === "reboot") {
    isReboot = true;
    add(
      "info",
      "cron",
      "@reboot runs once when the cron daemon starts. The closest timer is OnBootSec=, which counts from kernel boot. If the job only needs to start at boot, a service with WantedBy=multi-user.target and no timer is simpler.",
    );
  } else {
    const conv = convertSchedule(parse.schedule);
    for (const f of conv.findings) findings.push(f);
    orRule = conv.orRule;
    calendar = conv.lines.map((l) => renderCalendarLine(l, zone));
    if (parse.macro === "@weekly") {
      add(
        "info",
        "cron",
        "cron's @weekly is Sunday at midnight. systemd has its own weekly keyword, and it means Monday at midnight. The conversion writes the day out, so it does not pick up the keyword's meaning.",
      );
    }
    if (parse.macro !== null && parse.macro !== "@weekly") {
      add("info", "cron", `${parse.macro} stands for "${MACROS[parse.macro]}". The conversion writes the fields out rather than using the systemd keyword of a similar name.`);
    }
    if (calendar.length > 0) {
      const runs = nextCronRuns(parse.schedule, new Date(2026, 0, 1), 40);
      if (runs.length > 1) {
        let min = Infinity;
        for (let i = 1; i < runs.length; i += 1) min = Math.min(min, (runs[i].getTime() - runs[i - 1].getTime()) / 1000);
        minGapSeconds = min;
      }
    }
  }

  if (delaySeconds !== null && delaySeconds > 0 && minGapSeconds !== null && delaySeconds >= minGapSeconds) {
    add(
      "warn",
      "randomizedDelaySec",
      `RandomizedDelaySec=${delayRaw} is as long as the shortest gap between runs, ${Math.round(minGapSeconds)} seconds. Delayed runs can land on top of each other. Keep the delay well under the interval.`,
    );
  }
  if (o.persistent && isReboot) {
    add("info", "persistent", "Persistent=true applies only to OnCalendar= timers, so it is not written for @reboot.");
  }

  const calendarOk = isReboot || calendar.length > 0;
  const verifyCommands = !calendarOk
    ? ""
    : isReboot
      ? "systemd-analyze timespan 1min"
      : `systemd-analyze calendar --iterations=5 ${calendar.map((c) => `'${c}'`).join(" ")}`;
  const noUnits = {
    parsed: calendarOk,
    isReboot,
    calendar,
    orRule,
    timerFile: "",
    serviceFile: "",
    timer: "",
    service: "",
    verifyCommands,
    installCommands: "",
    script: "",
  };
  if (name === "" || execStart === null || !calendarOk) return finish(noUnits);

  /* Units. */
  const cronText = parse.text;
  const serviceLines = [
    "[Unit]",
    `Description=${percentEscape(name)} (converted from cron: ${percentEscape(cronText)})`,
    "",
    "[Service]",
    "Type=oneshot",
    `ExecStart=${execStart}`,
  ];
  if (user !== "" && isValidAccountName(user)) serviceLines.push(`User=${user}`);
  if (workdirOk) serviceLines.push(`WorkingDirectory=${workdir}`);
  const service = `${serviceLines.join("\n")}\n`;

  const timerLines = ["[Unit]", `Description=Run ${percentEscape(name)} on cron schedule ${percentEscape(cronText)}`, "", "[Timer]"];
  if (isReboot) timerLines.push("OnBootSec=1min");
  else for (const line of calendar) timerLines.push(`OnCalendar=${line}`);
  if (o.preciseTiming) timerLines.push("AccuracySec=1s");
  if (delaySeconds !== null && delayRaw !== "") timerLines.push(`RandomizedDelaySec=${delayRaw}`);
  if (o.persistent && !isReboot) timerLines.push("Persistent=true");
  timerLines.push("", "[Install]", "WantedBy=timers.target");
  const timer = `${timerLines.join("\n")}\n`;

  const serviceFile = `${name}.service`;
  const timerFile = `${name}.timer`;
  const dir = "/etc/systemd/system";

  const install = [
    "# Check the units, load them, and start the timer",
    `systemd-analyze verify ${dir}/${serviceFile} ${dir}/${timerFile}`,
    "sudo systemctl daemon-reload",
    `sudo systemctl enable --now ${shellQuote(timerFile)}`,
    "",
    "# See when it fires next, run the job once by hand, and read its log",
    `systemctl list-timers ${shellQuote(timerFile)}`,
    `sudo systemctl start ${shellQuote(serviceFile)}`,
    `journalctl -u ${shellQuote(serviceFile)} -n 30 --no-pager`,
  ];
  const copy = [
    `# Save the two units as ./${serviceFile} and ./${timerFile}, then install them`,
    `sudo install -m 0644 -o root -g root ${shellQuote(`./${serviceFile}`)} ${shellQuote(`${dir}/${serviceFile}`)}`,
    `sudo install -m 0644 -o root -g root ${shellQuote(`./${timerFile}`)} ${shellQuote(`${dir}/${timerFile}`)}`,
  ];
  const installCommands = [...copy, "", ...install].join("\n");

  const tagA = heredocTag(service);
  const tagB = heredocTag(timer);
  const script = [
    `sudo tee ${shellQuote(`${dir}/${serviceFile}`)} >/dev/null <<'${tagA}'`,
    service.replace(/\n$/, ""),
    tagA,
    "",
    `sudo tee ${shellQuote(`${dir}/${timerFile}`)} >/dev/null <<'${tagB}'`,
    timer.replace(/\n$/, ""),
    tagB,
    "",
    ...install,
  ].join("\n");

  return finish({ ...noUnits, timerFile, serviceFile, timer, service, installCommands, script });
}

/** Formats a fire time for display, in local time with the zone abbreviation. */
export function formatRun(d: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
