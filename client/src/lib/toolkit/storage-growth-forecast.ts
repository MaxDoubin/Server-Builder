/**
 * Storage capacity forecast.
 *
 * Two growth models: linear, a fixed amount added each month, and compound,
 * a fixed percentage of the current size added each month. Time is measured
 * in calendar months from an as-of date, and a fractional month is mapped
 * onto the real length of the month it falls in, so a crossing at month 3.5
 * lands halfway through the fourth calendar month and agrees with the
 * month-by-month table. All dates are proleptic Gregorian, handled in UTC so
 * the reader's time zone cannot shift a day.
 *
 * Pure functions, no React and no DOM.
 */

export type GrowthModel = "linear" | "compound";

/** Longest projection drawn or tabulated, in months. */
export const MAX_HORIZON_MONTHS = 240;
/** Beyond this a crossing is reported as "more than 100 years" with no date. */
export const MAX_DATE_MONTHS = 1200;
export const MAX_THRESHOLDS = 6;
export const MAX_VALUE = 1e15;
/** A compound rate above this per month is almost certainly a typo. */
export const MAX_COMPOUND_PCT = 1000;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400000;

/* ------------------------------------------------------------------ dates */

export interface YMD {
  y: number;
  m: number; // 1 to 12
  d: number; // 1 to 31
}

export function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** "2026-10-31" to a date, or null when it is not a real calendar date. */
export function parseIsoDate(raw: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 9000 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function toIso(date: YMD): string {
  return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

export function dayNumber(date: YMD): number {
  return Math.round(Date.UTC(date.y, date.m - 1, date.d) / DAY_MS);
}

export function fromDayNumber(n: number): YMD {
  const dt = new Date(n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/**
 * The same day of the month k months later, clamped to the end of a shorter
 * month. Always computed from the anchor, never chained, so Jan 31 plus two
 * months is Mar 31 and not Mar 28.
 */
export function addMonths(anchor: YMD, k: number): YMD {
  const index = anchor.y * 12 + (anchor.m - 1) + k;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return { y, m, d: Math.min(anchor.d, daysInMonth(y, m)) };
}

/** The day during which fractional month t (t >= 0) falls. */
export function dateAtMonths(anchor: YMD, t: number): YMD {
  const k = Math.floor(t);
  const start = dayNumber(addMonths(anchor, k));
  const end = dayNumber(addMonths(anchor, k + 1));
  return fromDayNumber(start + Math.floor((t - k) * (end - start)));
}

/** Calendar months from a to b as a fraction, the inverse of dateAtMonths. Negative when b is before a. */
export function monthsBetween(a: YMD, b: YMD): number {
  const target = dayNumber(b);
  if (target < dayNumber(a)) return -monthsBetween(b, a);
  let k = (b.y - a.y) * 12 + (b.m - a.m);
  while (k > 0 && dayNumber(addMonths(a, k)) > target) k -= 1;
  while (dayNumber(addMonths(a, k + 1)) <= target) k += 1;
  const start = dayNumber(addMonths(a, k));
  const end = dayNumber(addMonths(a, k + 1));
  return k + (target - start) / (end - start);
}

export function formatDate(date: YMD): string {
  return `${MONTH_NAMES[date.m - 1]} ${date.d}, ${date.y}`;
}

export function formatMonthYear(date: YMD): string {
  return `${MONTH_NAMES[date.m - 1]} ${date.y}`;
}

/* ---------------------------------------------------------------- parsing */

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const PLAIN = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^[+-]?\.\d+$/;

/** A decimal number with optional thousands commas. Null for an empty field. */
export function parseNumber(raw: string): Parsed<number | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > 24) return { ok: false, message: "That is too long to be a number here." };
  if (!PLAIN.test(text)) return { ok: false, message: `"${text}" is not a number. Use digits, such as 42 or 1.5.` };
  const n = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(n)) return { ok: false, message: `"${text}" is not a number.` };
  if (Math.abs(n) > MAX_VALUE) return { ok: false, message: "Values are capped at 10^15." };
  // "-0" is 0; otherwise it prints as "-0" in every figure derived from it.
  return { ok: true, value: n === 0 ? 0 : n };
}

/** "80, 90" to [80, 90]: sorted, deduplicated, each above 0 and below 100. */
export function parseThresholds(raw: string): Parsed<number[]> {
  const parts = raw
    .split(/[,\s;]+/)
    .map((p) => p.trim().replace(/%$/, ""))
    .filter((p) => p !== "");
  if (parts.length > 20) return { ok: false, message: `Enter at most ${MAX_THRESHOLDS} thresholds.` };
  const out = new Set<number>();
  for (const part of parts) {
    if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(part) || part.length > 8) {
      return { ok: false, message: `"${part}" is not a percentage. List them like 80, 90.` };
    }
    const n = Number(part);
    if (n <= 0 || n > 100) return { ok: false, message: `${part}% is not a usable threshold. Each one has to be above 0 and at most 100.` };
    // 100 is "full", which is always reported.
    if (n < 100) out.add(n);
  }
  if (out.size > MAX_THRESHOLDS) return { ok: false, message: `Enter at most ${MAX_THRESHOLDS} thresholds.` };
  return { ok: true, value: [...out].sort((a, b) => a - b) };
}

/* ----------------------------------------------------------------- models */

export interface Growth {
  model: GrowthModel;
  /** Linear: capacity units per month. */
  perMonth: number;
  /** Compound: fractional growth per month, 0.05 for 5%. */
  rate: number;
}

/** Projected usage t months from now. */
export function usedAt(used: number, growth: Growth, t: number): number {
  if (growth.model === "linear") return used + growth.perMonth * t;
  return used * Math.pow(1 + growth.rate, t);
}

/**
 * Months until usage first reaches target. 0 when it already has, null when
 * it never will at this rate (flat or shrinking, or compound growth from 0).
 */
export function monthsToReach(used: number, growth: Growth, target: number): number | null {
  if (used >= target) return 0;
  if (growth.model === "linear") {
    if (!(growth.perMonth > 0)) return null;
    return (target - used) / growth.perMonth;
  }
  if (!(growth.rate > 0) || used <= 0) return null;
  // used * (1 + g)^t = target  =>  t = ln(target / used) / ln(1 + g)
  return Math.log(target / used) / Math.log1p(growth.rate);
}

export interface TwoPointEstimate {
  months: number;
  days: number;
  perMonth: number;
  /** Null when the earlier reading was 0, where a percentage has no meaning. */
  rate: number | null;
}

/** Growth implied by an earlier reading and the current one. */
export function estimateFromTwoPoints(
  earlier: YMD,
  earlierUsed: number,
  asOf: YMD,
  currentUsed: number,
): Parsed<TwoPointEstimate> {
  const days = dayNumber(asOf) - dayNumber(earlier);
  if (days === 0) return { ok: false, message: "The two readings are on the same day, so they give no rate." };
  if (days < 0) return { ok: false, message: "The earlier reading has to be dated before the as-of date." };
  const months = monthsBetween(earlier, asOf);
  const perMonth = (currentUsed - earlierUsed) / months;
  const rate = earlierUsed > 0 && currentUsed > 0 ? Math.pow(currentUsed / earlierUsed, 1 / months) - 1 : null;
  return { ok: true, value: { months, days, perMonth, rate } };
}

export interface Expansion {
  /** Month the capacity arrives, counted from the as-of date. */
  atMonth: number;
  add: number;
}

export interface Crossing {
  /** Percentage of capacity, 100 for full. */
  pct: number;
  /** Months until crossed with today's capacity; 0 if already, null if never. */
  base: number | null;
  /** With the expansion, when one is modeled. */
  withExpansion?: {
    /** First crossing: before the expansion, or against the larger capacity. */
    first: number | null;
    beforeExpansion: boolean;
    /** Crossed before the expansion and still above the line once it lands. */
    stillAbove: boolean;
    /** Crossed before, dropped below, and crosses again at this month. */
    again: number | null;
  };
}

/** True when usage grows over time, so a level above it is eventually reached. */
export function isGrowing(used: number, growth: Growth): boolean {
  return growth.model === "linear" ? growth.perMonth > 0 : growth.rate > 0 && used > 0;
}

/**
 * Whether usage is at or above pct percent of capacity. The same comparison
 * monthsToReach makes, so the table and the crossing times agree exactly.
 */
export function levelReached(used: number, capacity: number, pct: number): boolean {
  return used >= (pct / 100) * capacity;
}

export function crossings(
  used: number,
  total: number,
  growth: Growth,
  thresholds: number[],
  expansion: Expansion | null,
): Crossing[] {
  const levels = [...thresholds.filter((p) => p > 0 && p < 100), 100];
  const growing = isGrowing(used, growth);
  return levels.map((pct) => {
    const base = monthsToReach(used, growth, (pct / 100) * total);
    const out: Crossing = { pct, base };
    if (expansion) {
      const biggerTarget = (pct / 100) * (total + expansion.add);
      const bigger = monthsToReach(used, growth, biggerTarget);
      if (base !== null && base < expansion.atMonth) {
        // Growing usage only rises, so it is still above the new line exactly
        // when it reaches that line by the expansion month. Flat or shrinking
        // usage is above the line now (base is 0) and may have fallen below
        // it by then, so check the usage at that month directly.
        const stillAbove = growing
          ? bigger !== null && bigger <= expansion.atMonth
          : levelReached(Math.max(0, usedAt(used, growth, expansion.atMonth)), total + expansion.add, pct);
        out.withExpansion = {
          first: base,
          beforeExpansion: true,
          stillAbove,
          again: stillAbove || !growing ? null : bigger,
        };
      } else {
        out.withExpansion = { first: bigger, beforeExpansion: false, stillAbove: false, again: null };
      }
    }
    return out;
  });
}

/** Capacity in force at month t. The expansion counts from its month on. */
export function capacityAt(total: number, expansion: Expansion | null, t: number): number {
  return expansion && t >= expansion.atMonth ? total + expansion.add : total;
}

/**
 * How far to draw: a little past the last crossing that will happen, at
 * least a year, at most MAX_HORIZON_MONTHS.
 */
export function autoHorizon(list: Crossing[]): number {
  let latest = 0;
  for (const c of list) {
    const t = c.withExpansion ? (c.withExpansion.again ?? c.withExpansion.first) : c.base;
    if (t !== null && t > latest) latest = t;
  }
  if (latest === 0) {
    const anyFuture = list.some((c) => (c.withExpansion ? c.withExpansion.first : c.base) !== null);
    return anyFuture ? 12 : 36;
  }
  return Math.min(MAX_HORIZON_MONTHS, Math.max(12, Math.ceil(latest * 1.2) + 1));
}

export interface ProjectionRow {
  month: number;
  date: YMD;
  used: number;
  capacity: number;
  /** used / capacity, unbounded above. */
  ratio: number;
}

export function projection(
  asOf: YMD,
  used: number,
  total: number,
  growth: Growth,
  expansion: Expansion | null,
  horizon: number,
): ProjectionRow[] {
  const h = Math.max(1, Math.min(MAX_HORIZON_MONTHS, Math.floor(horizon)));
  const rows: ProjectionRow[] = [];
  for (let k = 0; k <= h; k += 1) {
    // Usage cannot go below empty, however long a shrinking line is extended.
    const u = Math.max(0, usedAt(used, growth, k));
    const cap = capacityAt(total, expansion, k);
    rows.push({ month: k, date: addMonths(asOf, k), used: u, capacity: cap, ratio: cap > 0 ? u / cap : 0 });
  }
  return rows;
}

/** Equivalent annual figure: 12 times linear, or (1 + g)^12 - 1 compound. */
export function annualRate(growth: Growth): number {
  return growth.model === "linear" ? growth.perMonth * 12 : Math.pow(1 + growth.rate, 12) - 1;
}

/** Months for compound growth to double usage, or null if it never does. */
export function doublingMonths(rate: number): number | null {
  return rate > 0 ? Math.LN2 / Math.log1p(rate) : null;
}

/** Linear only: months until a shrinking volume reaches empty. */
export function monthsToEmpty(used: number, growth: Growth): number | null {
  if (growth.model !== "linear" || !(growth.perMonth < 0) || used <= 0) return null;
  return used / -growth.perMonth;
}

/** Up to five round tick values from 0 to at least max. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 1e-9 && ticks.length < 12; v += step) ticks.push(Number(v.toPrecision(12)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return ticks;
}

/** Month tick spacing that keeps the axis to about six labels. */
export function monthTickStep(horizon: number): number {
  for (const step of [1, 2, 3, 6, 12, 24, 36, 60]) if (horizon / step <= 6) return step;
  return 120;
}
