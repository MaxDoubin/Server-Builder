/**
 * Calendar arithmetic with no time zone and no Date object.
 *
 * Everything here works on "civil" values: a year, month, day and a time of
 * day as a person would read them off a wall clock. Converting a civil value
 * to a day count uses the proleptic Gregorian calendar algorithms from Howard
 * Hinnant's "chrono-Compatible Low-Level Date Algorithms", which are exact for
 * every year and do not depend on the browser's zone or on Date's parsing
 * quirks (a two digit year in Date.UTC means 19xx, for example).
 *
 * ISO 8601 weeks follow ISO 8601-1:2019 section 5.2.4.2: weeks start on
 * Monday, and week 1 of a year is the week that contains that year's first
 * Thursday, which is the same as the week that contains January 4.
 *
 * The zone-aware parts (Unix timestamps, elapsed time across a DST change)
 * live in timezone-converter.ts and build on the functions here.
 */

export interface Civil {
  year: number;
  /** 1 to 12. */
  month: number;
  /** 1 to the length of the month. */
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const MIN_YEAR = 1;
export const MAX_YEAR = 9999;
/** The most any one duration field may hold. Keeps every sum below 2^53. */
export const MAX_AMOUNT = 100_000_000;
/** The most holiday dates read from the list. */
export const MAX_HOLIDAYS = 2000;

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SECONDS_PER_DAY = 86400;

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.floor(a / b) * b;
}

export function pad(value: number, width = 2): string {
  const text = String(Math.abs(Math.trunc(value))).padStart(width, "0");
  return value < 0 ? `-${text}` : text;
}

/* ------------------------------------------------------------ calendar */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. Hinnant, days_from_civil. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const doy = floorDiv(153 * (month + (month > 2 ? -3 : 9)) + 2, 5) + day - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** The inverse of daysFromCivil. Hinnant, civil_from_days. */
export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const day = doy - floorDiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** Seconds since 1970-01-01 00:00:00 reading the civil value as UTC. */
export function civilToSeconds(c: Civil): number {
  return daysFromCivil(c.year, c.month, c.day) * SECONDS_PER_DAY + c.hour * 3600 + c.minute * 60 + c.second;
}

export function secondsToCivil(seconds: number): Civil {
  const days = floorDiv(seconds, SECONDS_PER_DAY);
  const rest = seconds - days * SECONDS_PER_DAY;
  return {
    ...civilFromDays(days),
    hour: floorDiv(rest, 3600),
    minute: floorDiv(rest % 3600, 60),
    second: rest % 60,
  };
}

/** 1 for Monday through 7 for Sunday. 1970-01-01 was a Thursday. */
export function isoWeekdayFromDays(days: number): number {
  return mod(days + 3, 7) + 1;
}

export function isoWeekday(year: number, month: number, day: number): number {
  return isoWeekdayFromDays(daysFromCivil(year, month, day));
}

export function dayOfYear(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) - daysFromCivil(year, 1, 1) + 1;
}

export interface YMD {
  year: number;
  month: number;
  day: number;
}

export interface IsoWeekInfo {
  /** The year the week belongs to, which can differ from the calendar year in late December and early January. */
  weekYear: number;
  week: number;
  /** 1 (Monday) to 7 (Sunday). */
  weekday: number;
  /** 52 or 53. */
  weeksInWeekYear: number;
  monday: YMD;
  thursday: YMD;
  sunday: YMD;
  week1Monday: YMD;
  /** Mon to Sun of this date's week. */
  days: (YMD & { weekday: number; name: string })[];
}

function ymdFromDays(days: number): YMD {
  return civilFromDays(days);
}

/** Number of ISO weeks in a week-year: the week number of December 28, which is always in the last one. */
export function isoWeeksInYear(weekYear: number): number {
  const dec28 = daysFromCivil(weekYear, 12, 28);
  const thursday = dec28 + (4 - isoWeekdayFromDays(dec28));
  return floorDiv(thursday - daysFromCivil(weekYear, 1, 1), 7) + 1;
}

/**
 * ISO 8601 week date for a calendar date. The Thursday of the date's week
 * decides the week-year, and the week number counts weeks from the week that
 * holds January 4.
 */
export function isoWeek(year: number, month: number, day: number): IsoWeekInfo {
  const days = daysFromCivil(year, month, day);
  const weekday = isoWeekdayFromDays(days);
  const mondayDays = days - (weekday - 1);
  const thursdayDays = mondayDays + 3;
  const thursday = ymdFromDays(thursdayDays);
  const weekYear = thursday.year;
  const week = floorDiv(thursdayDays - daysFromCivil(weekYear, 1, 1), 7) + 1;

  const jan4 = daysFromCivil(weekYear, 1, 4);
  const week1MondayDays = jan4 - (isoWeekdayFromDays(jan4) - 1);

  return {
    weekYear,
    week,
    weekday,
    weeksInWeekYear: isoWeeksInYear(weekYear),
    monday: ymdFromDays(mondayDays),
    thursday,
    sunday: ymdFromDays(mondayDays + 6),
    week1Monday: ymdFromDays(week1MondayDays),
    days: Array.from({ length: 7 }, (_, i) => ({
      ...ymdFromDays(mondayDays + i),
      weekday: i + 1,
      name: WEEKDAY_NAMES[i],
    })),
  };
}

/** The ISO 8601 week date, such as 2026-W53-5. */
export function isoWeekDateString(info: IsoWeekInfo): string {
  return `${pad(info.weekYear, 4)}-W${pad(info.week)}-${info.weekday}`;
}

export function ymdString(value: YMD): string {
  return `${pad(value.year, 4)}-${pad(value.month)}-${pad(value.day)}`;
}

/* ------------------------------------------------------------- parsing */

const CIVIL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const FORM_HELP = "Use the form YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS, for example 2026-10-31T14:30.";

/** A date, optionally with a time. A date alone means 00:00:00. */
export function parseCivil(text: string): ParseResult<Civil> {
  const input = text.trim();
  if (input === "") return { ok: false, message: "Enter a date." };
  if (/^[+-]?\d{5,}-\d{2}-\d{2}/.test(input) || /^-\d/.test(input)) {
    return { ok: false, message: `Years run from ${pad(MIN_YEAR, 4)} to ${MAX_YEAR}.` };
  }
  const match = CIVIL_PATTERN.exec(input);
  if (!match) return { ok: false, message: FORM_HELP };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (year < MIN_YEAR) return { ok: false, message: `Years run from ${pad(MIN_YEAR, 4)} to ${MAX_YEAR}.` };
  if (month < 1 || month > 12) return { ok: false, message: "The month runs from 01 to 12." };
  const length = daysInMonth(year, month);
  if (day < 1 || day > length) {
    return {
      ok: false,
      message: `${MONTH_NAMES[month - 1]} ${year} has ${length} days, so ${pad(day)} is not a valid day.`,
    };
  }
  if (hour > 23) return { ok: false, message: "The hour runs from 00 to 23." };
  if (minute > 59) return { ok: false, message: "The minute runs from 00 to 59." };
  if (second > 59) {
    return { ok: false, message: "The second runs from 00 to 59. Unix time has no leap seconds, so 60 is not accepted." };
  }
  return { ok: true, value: { year, month, day, hour, minute, second } };
}

/** `YYYY-MM-DD HH:MM:SS`, or without the seconds. */
export function formatCivil(c: Civil, withSeconds = true): string {
  const base = `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)} ${pad(c.hour)}:${pad(c.minute)}`;
  return withSeconds ? `${base}:${pad(c.second)}` : base;
}

/** The value format a datetime-local input uses: seconds appear only when they are not zero. */
export function toInputValue(c: Civil): string {
  const base = `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
  return c.second === 0 ? base : `${base}:${pad(c.second)}`;
}

export function weekdayName(year: number, month: number, day: number): string {
  return WEEKDAY_NAMES[isoWeekday(year, month, day) - 1];
}

export function inYearRange(c: { year: number }): boolean {
  return c.year >= MIN_YEAR && c.year <= MAX_YEAR;
}

/* ------------------------------------------------------------ durations */

export interface Duration {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const DURATION_FIELDS: { key: keyof Duration; label: string }[] = [
  { key: "years", label: "Years" },
  { key: "months", label: "Months" },
  { key: "weeks", label: "Weeks" },
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Minutes" },
  { key: "seconds", label: "Seconds" },
];

/** A blank field means zero. Only whole, non-negative numbers are accepted. */
export function parseAmount(text: string, label: string): ParseResult<number> {
  const input = text.trim();
  if (input === "") return { ok: true, value: 0 };
  if (/^-/.test(input)) {
    return { ok: false, message: `${label}: amounts are not negative. Choose Subtract to move backward in time.` };
  }
  if (/^\d*\.\d+$/.test(input)) {
    return {
      ok: false,
      message: `${label}: use whole numbers. Express a fraction in a smaller unit, such as 90 minutes rather than 1.5 hours.`,
    };
  }
  if (!/^\d+$/.test(input)) {
    return { ok: false, message: `${label}: enter a whole number such as 3, with no commas or units.` };
  }
  const value = Number(input);
  if (value > MAX_AMOUNT) {
    return { ok: false, message: `${label}: the largest amount accepted is ${MAX_AMOUNT.toLocaleString("en-US")}.` };
  }
  return { ok: true, value };
}

/**
 * Adds whole calendar months. When the target month is shorter than the
 * starting day number, the day clamps to the last day of that month, so
 * January 31 plus one month is February 28 (or 29). The time of day is kept.
 */
export function addMonths(c: Civil, months: number): { civil: Civil; clamped: boolean } {
  const total = c.year * 12 + (c.month - 1) + months;
  const year = floorDiv(total, 12);
  const month = total - year * 12 + 1;
  const length = daysInMonth(year, month);
  return {
    civil: { ...c, year, month, day: Math.min(c.day, length) },
    clamped: c.day > length,
  };
}

/** Moves a civil value by a number of seconds on the wall clock, ignoring any zone. */
export function addSeconds(c: Civil, seconds: number): Civil {
  return secondsToCivil(civilToSeconds(c) + seconds);
}

export interface CalendarStep {
  civil: Civil;
  /** True when the day number had to clamp to a shorter month. */
  clamped: boolean;
  /** The day number asked for before it clamped. */
  requestedDay: number;
}

/**
 * The calendar part of a duration: years and months first (clamping), then
 * weeks and days on the calendar. Subtracting runs the same steps with every
 * amount negated, so March 31 minus one month is February 28, not a count
 * of 30 days.
 */
export function addCalendarPart(c: Civil, sign: 1 | -1, d: Duration): CalendarStep {
  const stepped = addMonths(c, sign * (d.years * 12 + d.months));
  const dayShift = sign * (d.weeks * 7 + d.days);
  const civil = dayShift === 0 ? stepped.civil : addSeconds(stepped.civil, dayShift * SECONDS_PER_DAY);
  return { civil, clamped: stepped.clamped, requestedDay: c.day };
}

/** Hours, minutes and seconds of a duration as exact seconds. */
export function clockSeconds(d: Duration): number {
  return d.hours * 3600 + d.minutes * 60 + d.seconds;
}

export interface AddResult {
  civil: Civil;
  clamped: boolean;
  requestedDay: number;
}

/** Add or subtract a duration on the wall clock with no zone. Fails if the result leaves years 1 to 9999. */
export function addDuration(c: Civil, sign: 1 | -1, d: Duration): ParseResult<AddResult> {
  const step = addCalendarPart(c, sign, d);
  const civil = addSeconds(step.civil, sign * clockSeconds(d));
  if (!inYearRange(civil)) {
    return { ok: false, message: `The result would fall in year ${civil.year}. This tool covers years ${MIN_YEAR} to ${MAX_YEAR}.` };
  }
  return { ok: true, value: { civil, clamped: step.clamped, requestedDay: step.requestedDay } };
}

/* ----------------------------------------------------------- difference */

export interface CalendarDifference {
  /** True when the second value is earlier than the first. The numbers below are always the size of the gap. */
  reversed: boolean;
  years: number;
  months: number;
  /** Days left over after whole years and months. */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Whole months in the gap, which is years * 12 + months. */
  totalMonths: number;
  /** The gap between the two wall clock readings in seconds. */
  wallSeconds: number;
}

/**
 * Calendar-aware difference. From the earlier value, add as many whole months
 * as fit without passing the later one (clamping to the end of a short
 * month, as addMonths does), then count the days and time of day that remain.
 * Jan 31 to Mar 1 is therefore 1 month and 1 day in a common year: Jan 31
 * plus one month is Feb 28, and one more day reaches Mar 1.
 */
export function calendarDifference(a: Civil, b: Civil): CalendarDifference {
  const aSeconds = civilToSeconds(a);
  const bSeconds = civilToSeconds(b);
  const reversed = bSeconds < aSeconds;
  const lo = reversed ? b : a;
  const hi = reversed ? a : b;
  const loSeconds = reversed ? bSeconds : aSeconds;
  const hiSeconds = reversed ? aSeconds : bSeconds;

  let months = (hi.year - lo.year) * 12 + (hi.month - lo.month);
  let anchor = civilToSeconds(addMonths(lo, months).civil);
  if (anchor > hiSeconds) {
    months -= 1;
    anchor = civilToSeconds(addMonths(lo, months).civil);
  }

  const rest = hiSeconds - anchor;
  const days = floorDiv(rest, SECONDS_PER_DAY);
  const clock = rest - days * SECONDS_PER_DAY;
  return {
    reversed,
    years: floorDiv(months, 12),
    months: months % 12,
    days,
    hours: floorDiv(clock, 3600),
    minutes: floorDiv(clock % 3600, 60),
    seconds: clock % 60,
    totalMonths: months,
    wallSeconds: hiSeconds - loSeconds,
  };
}

/* ------------------------------------------------------- business days */

/**
 * Monday to Friday days among all days before epoch day n. Epoch day 0 is a
 * Thursday, so within each block of seven starting at a multiple of seven the
 * positions 2 and 3 are Saturday and Sunday.
 */
export function weekdaysBefore(n: number): number {
  const weeks = floorDiv(n, 7);
  const rest = n - weeks * 7;
  let count = weeks * 5;
  for (let position = 0; position < rest; position++) {
    if (position !== 2 && position !== 3) count += 1;
  }
  return count;
}

export interface BusinessDayCount {
  /** Weekdays in the range that are not listed holidays. */
  businessDays: number;
  /** Days in the range, counting the end day only when asked. */
  calendarDays: number;
  weekdays: number;
  weekendDays: number;
  /** Listed holidays that fall on a weekday inside the range and were taken out. */
  holidaysUsed: number;
  /** Listed holidays inside the range that already fall on a weekend. */
  holidaysOnWeekends: number;
  /** Listed holidays outside the range. */
  holidaysOutside: number;
}

/**
 * Counts Monday to Friday days from one date up to, but not including, the
 * other, or including both when includeEnd is set (which is how Excel's
 * NETWORKDAYS counts). Arguments are epoch day numbers and may be in either
 * order. Holidays are deduplicated, and a holiday on a weekend is not
 * subtracted twice.
 */
export function countBusinessDays(
  firstDay: number,
  secondDay: number,
  holidayDays: number[],
  includeEnd: boolean,
): BusinessDayCount {
  const start = Math.min(firstDay, secondDay);
  const end = Math.max(firstDay, secondDay) + (includeEnd ? 1 : 0);

  const calendarDays = end - start;
  const weekdays = weekdaysBefore(end) - weekdaysBefore(start);

  let used = 0;
  let onWeekend = 0;
  let outside = 0;
  for (const day of new Set(holidayDays)) {
    if (day < start || day >= end) outside += 1;
    else if (isoWeekdayFromDays(day) >= 6) onWeekend += 1;
    else used += 1;
  }
  return {
    businessDays: weekdays - used,
    calendarDays,
    weekdays,
    weekendDays: calendarDays - weekdays,
    holidaysUsed: used,
    holidaysOnWeekends: onWeekend,
    holidaysOutside: outside,
  };
}

export interface HolidayList {
  /** Epoch day numbers, in the order given, without duplicates. */
  days: number[];
  /** Entries that were not read, each with the reason. */
  problems: string[];
  truncated: boolean;
}

/** One YYYY-MM-DD date per entry, separated by commas, semicolons, spaces or new lines. */
export function parseHolidays(text: string): HolidayList {
  const days: number[] = [];
  const seen = new Set<number>();
  const problems: string[] = [];
  let truncated = false;

  const entries = text.split(/[\s,;]+/).filter((entry) => entry !== "");
  for (const entry of entries) {
    if (days.length >= MAX_HOLIDAYS) {
      truncated = true;
      break;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      if (problems.length < 5) problems.push(`"${entry.slice(0, 24)}" is not a YYYY-MM-DD date`);
      continue;
    }
    const parsed = parseCivil(entry);
    if (!parsed.ok) {
      if (problems.length < 5) problems.push(`"${entry}": ${parsed.message}`);
      continue;
    }
    const day = daysFromCivil(parsed.value.year, parsed.value.month, parsed.value.day);
    if (!seen.has(day)) {
      seen.add(day);
      days.push(day);
    }
  }
  return { days, problems, truncated };
}

/* --------------------------------------------------------- presentation */

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** "1 year, 2 months, 3 days, 4 hours, 5 minutes, 6 seconds", leaving out zero units. */
export function describeDifference(d: CalendarDifference): string {
  const parts: string[] = [];
  if (d.years) parts.push(plural(d.years, "year"));
  if (d.months) parts.push(plural(d.months, "month"));
  if (d.days) parts.push(plural(d.days, "day"));
  if (d.hours) parts.push(plural(d.hours, "hour"));
  if (d.minutes) parts.push(plural(d.minutes, "minute"));
  if (d.seconds) parts.push(plural(d.seconds, "second"));
  return parts.length === 0 ? "0 seconds" : parts.join(", ");
}

/** A decimal with at most four places and no trailing zeros. */
export function trimDecimal(value: number, places = 4): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: places, minimumFractionDigits: 0 });
}
