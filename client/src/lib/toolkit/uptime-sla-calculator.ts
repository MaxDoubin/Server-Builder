/**
 * Availability and SLA arithmetic.
 *
 * A percentage such as 99.999 is parsed into an exact decimal with BigInt,
 * so the unavailable fraction is exactly 1/100000 rather than the double
 * 1 - 0.99999, which is 1.0000000000065512e-5. That difference is invisible
 * at a glance and shows up as a downtime of 315.57600000020674 seconds a
 * year instead of 315.576. Composite availability uses doubles, computed in
 * terms of the unavailable fraction with log1p and expm1 so that a chain of
 * very reliable parts does not lose its digits to cancellation.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ---------------------------------------------------------------- rationals */

/** An exact non-negative rational, num / den, with den > 0. */
export interface Exact {
  num: bigint;
  den: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function reduce(e: Exact): Exact {
  const g = gcd(e.num, e.den);
  return { num: e.num / g, den: e.den / g };
}

export function toNumber(e: Exact): number {
  // Both parts stay far below 2^53 for every input this module accepts, but
  // dividing after reducing keeps the conversion exact for longer anyway.
  const r = reduce(e);
  return Number(r.num) / Number(r.den);
}

/** Compares a and b: negative, zero or positive. */
export function compareExact(a: Exact, b: Exact): number {
  const left = a.num * b.den;
  const right = b.num * a.den;
  return left < right ? -1 : left > right ? 1 : 0;
}

const TEN = 10n;

/**
 * Formats an exact value with at most `decimals` places. "floor" truncates,
 * so an availability figure is never rounded up past what was achieved;
 * "round" rounds half up. Trailing zeros are dropped, and digits are grouped
 * in threes with commas in the integer part.
 */
export function formatExact(e: Exact, decimals: number, mode: "floor" | "round" = "round"): string {
  const negative = e.num < 0n !== e.den < 0n && e.num !== 0n;
  const num = e.num < 0n ? -e.num : e.num;
  const den = e.den < 0n ? -e.den : e.den;
  const scale = TEN ** BigInt(decimals);
  let scaled = (num * scale) / den;
  if (mode === "round") {
    const remainder = (num * scale) % den;
    if (remainder * 2n >= den) scaled += 1n;
  }
  const whole = scaled / scale;
  let frac = decimals > 0 ? (scaled % scale).toString().padStart(decimals, "0") : "";
  frac = frac.replace(/0+$/, "");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/* ------------------------------------------------------------------ parsing */

export type Parsed<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & T);

/** Longer than this is not a percentage anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 40;
/** Decimal places accepted in a percentage. Twelve is already far past any SLA. */
export const MAX_DECIMALS = 12;

const DECIMAL = /^(\d*)(?:\.(\d*))?$/;

/** Parses a plain non-negative decimal into an exact value. */
export function parseDecimal(raw: string): Parsed<{ value: Exact }> {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_LENGTH) {
    return { kind: "error", message: `That is ${text.length} characters. Enter a number of at most ${MAX_INPUT_LENGTH}.` };
  }
  if (/^\d+,\d+$/.test(text)) {
    return { kind: "error", message: "Use a period for the decimal point, for example 99.95." };
  }
  if (text.startsWith("-")) {
    return { kind: "error", message: "A negative value has no meaning here." };
  }
  const m = DECIMAL.exec(text);
  if (!m || (m[1] === "" && (m[2] === undefined || m[2] === ""))) {
    return { kind: "error", message: `"${text}" is not a number. Use digits and an optional decimal point, such as 99.95.` };
  }
  const intPart = m[1] || "0";
  const fracPart = m[2] ?? "";
  if (fracPart.length > MAX_DECIMALS) {
    return { kind: "error", message: `Use at most ${MAX_DECIMALS} decimal places.` };
  }
  const den = TEN ** BigInt(fracPart.length);
  const num = BigInt(intPart) * den + BigInt(fracPart === "" ? "0" : fracPart);
  return { kind: "ok", value: { num, den } };
}

export interface Availability {
  /** The percentage as typed, exactly. */
  percent: Exact;
  /** The unavailable fraction, (100 - percent) / 100, exactly. */
  unavailability: Exact;
}

/** Parses "99.95", "99.95%" or " 99.95 % " into an exact availability. */
export function parseAvailability(raw: string): Parsed<Availability> {
  const text = raw.trim().replace(/\s*%$/, "");
  const parsed = parseDecimal(text);
  if (parsed.kind !== "ok") return parsed;
  const p = parsed.value;
  const hundred: Exact = { num: 100n, den: 1n };
  if (compareExact(p, hundred) > 0) {
    return { kind: "error", message: "Availability cannot be more than 100 percent." };
  }
  const unavailability = reduce({ num: 100n * p.den - p.num, den: 100n * p.den });
  return { kind: "ok", percent: reduce(p), unavailability };
}

/* ------------------------------------------------------------------ windows */

export interface Window {
  key: string;
  label: string;
  /** Length in whole seconds. Every window here is a whole number of seconds. */
  seconds: number;
  length: string;
}

export const DAY = 86_400;

/**
 * The standard reporting windows. A month is 30.44 days, the average month
 * rounded to two decimals; a year is 365.25 days so that leap years average
 * in; a quarter is a quarter of that year. Contracts define their own
 * window, usually the calendar month, which is why those are listed too.
 */
export const WINDOWS: Window[] = [
  { key: "day", label: "Day", seconds: DAY, length: "24 hours" },
  { key: "week", label: "Week", seconds: 7 * DAY, length: "7 days" },
  { key: "month", label: "Month", seconds: 2_630_016, length: "30.44 days" },
  { key: "quarter", label: "Quarter", seconds: 7_889_400, length: "91.3125 days" },
  { key: "year", label: "Year", seconds: 31_557_600, length: "365.25 days" },
];

export const CALENDAR_MONTHS: Window[] = [28, 29, 30, 31].map((days) => ({
  key: `month-${days}`,
  label: `${days}-day month`,
  seconds: days * DAY,
  length: `${days} days`,
}));

export const ALL_WINDOWS: Window[] = [...WINDOWS, ...CALENDAR_MONTHS];

export function windowByKey(key: string): Window {
  return ALL_WINDOWS.find((w) => w.key === key) ?? WINDOWS[2];
}

export const PRESETS = ["99", "99.5", "99.9", "99.95", "99.99", "99.999"];

/** Allowed downtime, exactly, in seconds: window * unavailability. */
export function downtimeSeconds(unavailability: Exact, windowSeconds: number): Exact {
  return reduce({ num: unavailability.num * BigInt(windowSeconds), den: unavailability.den });
}

/* --------------------------------------------------------------- formatting */

function trimFixed(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

/**
 * A duration in the largest sensible units: "864 ms", "6.05 s",
 * "43m 50s", "3d 15h 39m 36s". Seconds are rounded to a tenth once the
 * duration passes a minute.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "not defined";
  if (seconds === 0) return "0 s";
  if (seconds < 1e-6) return "under 0.001 ms";
  if (seconds < 1e-3) return `${trimFixed(seconds * 1000, 3)} ms`;
  if (seconds < 1) return `${trimFixed(seconds * 1000, 1)} ms`;
  if (seconds < 60) {
    const s = trimFixed(seconds, 2);
    if (s !== "60") return `${s} s`;
  }
  // Integer tenths, so a carry from 59.96 seconds lands in the minutes.
  let tenths = Math.round(seconds * 10);
  const tenthsPer = { d: 864_000, h: 36_000, m: 600 };
  const d = Math.floor(tenths / tenthsPer.d);
  tenths -= d * tenthsPer.d;
  const h = Math.floor(tenths / tenthsPer.h);
  tenths -= h * tenthsPer.h;
  const m = Math.floor(tenths / tenthsPer.m);
  tenths -= m * tenthsPer.m;
  const s = tenths / 10;
  const parts: [number, string][] = [
    [d, "d"],
    [h, "h"],
    [m, "m"],
    [s, "s"],
  ];
  let first = parts.findIndex(([v]) => v !== 0);
  let last = parts.length - 1;
  while (last > first && parts[last][0] === 0) last -= 1;
  if (first < 0) first = last = 3;
  return parts
    .slice(first, last + 1)
    .map(([v, unit]) => `${unit === "s" ? trimFixed(v, 1) : v}${unit}`)
    .join(" ");
}

/** -log10 of the unavailable fraction: 99.9 is 3 nines, 99.95 is about 3.3. */
export function nines(unavailability: number): number {
  if (unavailability <= 0) return Infinity;
  if (unavailability >= 1) return 0;
  return -Math.log10(unavailability);
}

export function formatNines(unavailability: number): string {
  const n = nines(unavailability);
  if (n === Infinity) return "unbounded";
  return trimFixed(n, 2);
}

/**
 * An availability percentage from an unavailable fraction, with at least
 * four decimals and enough to show the first two or three significant
 * digits of what is missing, so that 1 - 5e-7 prints as 99.99995 and never
 * rounds up to 100. Trailing zeros are dropped.
 */
export function formatAvailability(unavailability: number): string {
  if (!(unavailability >= 0)) return "not defined";
  if (unavailability === 0) return "100";
  if (unavailability >= 1) return "0";
  const missingPct = unavailability * 100;
  if (missingPct < 1e-10) return "99.9999999999+";
  const decimals = Math.min(12, Math.max(4, Math.ceil(-Math.log10(missingPct)) + 2));
  const text = (100 - missingPct).toFixed(decimals);
  return text.replace(/\.?0+$/, "");
}

/** Scientific form of a small fraction: 5.0e-4. */
export function formatFraction(f: number): string {
  if (f === 0) return "0";
  if (f >= 0.01) return trimFixed(f, 4);
  return f.toExponential(1);
}

/* ----------------------------------------------------------------- duration */

const UNIT_SECONDS: Record<string, Exact> = {};
function unit(names: string[], num: bigint, den: bigint = 1n) {
  for (const n of names) UNIT_SECONDS[n] = { num, den };
}
unit(["ms", "msec", "msecs", "millisecond", "milliseconds"], 1n, 1000n);
unit(["s", "sec", "secs", "second", "seconds"], 1n);
unit(["m", "min", "mins", "minute", "minutes"], 60n);
unit(["h", "hr", "hrs", "hour", "hours"], 3600n);
unit(["d", "day", "days"], 86_400n);
unit(["w", "wk", "wks", "week", "weeks"], 604_800n);

/** Durations beyond this are refused before any arithmetic: ten years. */
export const MAX_DURATION_SECONDS = 10 * 31_557_600;

function decimalToExact(text: string): Exact | null {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[1] === "" && !m[2])) return null;
  const frac = (m[2] ?? "").slice(0, 9);
  const den = TEN ** BigInt(frac.length);
  return { num: BigInt(m[1] || "0") * den + BigInt(frac || "0"), den };
}

function addExact(a: Exact, b: Exact): Exact {
  return reduce({ num: a.num * b.den + b.num * a.den, den: a.den * b.den });
}

function mulExact(a: Exact, b: Exact): Exact {
  return reduce({ num: a.num * b.num, den: a.den * b.den });
}

/**
 * Parses a downtime such as "43m 50s", "1h30m", "2.5 hours", "90 sec" or
 * the clock form "1:02:03". The result is exact, in seconds.
 */
export function parseDuration(raw: string): Parsed<{ seconds: Exact }> {
  const text = raw.trim().toLowerCase();
  if (text === "") return { kind: "empty" };
  if (text.length > 80) return { kind: "error", message: "That is too long to be a duration. Try something like 43m 50s." };
  if (text.startsWith("-")) return { kind: "error", message: "Downtime cannot be negative." };

  const clock = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(text);
  if (clock) {
    const s = decimalToExact(clock[3]);
    if (!s) return { kind: "error", message: "The seconds field is not a number." };
    const total = addExact({ num: BigInt(clock[1]) * 3600n + BigInt(clock[2]) * 60n, den: 1n }, s);
    if (toNumber(total) > MAX_DURATION_SECONDS) {
      return { kind: "error", message: "That is more than ten years of downtime." };
    }
    return { kind: "ok", seconds: total };
  }
  if (/^\d+:\d+$/.test(text)) {
    return { kind: "error", message: "Two-part clock times are ambiguous. Write h:mm:ss, such as 0:43:50, or use units like 43m 50s." };
  }
  if (/^\d+:\d+:\d+/.test(text)) {
    return { kind: "error", message: "In h:mm:ss the minutes and seconds must each be below 60." };
  }

  const token = /(\d+(?:\.\d*)?|\.\d+)\s*([a-z]*)/g;
  let total: Exact = { num: 0n, den: 1n };
  let count = 0;
  for (let m = token.exec(text); m !== null; m = token.exec(text)) {
    count += 1;
    const [, numText, unitText] = m;
    if (unitText === "") {
      return { kind: "error", message: `Add a unit to ${numText}, for example ${numText}m or ${numText}s.` };
    }
    const factor = UNIT_SECONDS[unitText];
    if (!factor) {
      return { kind: "error", message: `"${unitText}" is not a unit this understands. Use ms, s, m, h, d or w.` };
    }
    const value = decimalToExact(numText);
    if (!value) return { kind: "error", message: `"${numText}" is not a number.` };
    total = addExact(total, mulExact(value, factor));
    if (count > 12) return { kind: "error", message: "Use at most a dozen parts, such as 1d 2h 3m 4s." };
  }
  const leftover = text.replace(token, " ").replace(/[\s,]+|\band\b/g, "");
  if (count === 0 || leftover !== "") {
    const shown = leftover || text;
    return {
      kind: "error",
      message: `Could not read "${shown.slice(0, 24)}". Write a duration such as 43m 50s, 1.5h or 0:43:50.`,
    };
  }
  if (toNumber(total) > MAX_DURATION_SECONDS) {
    return { kind: "error", message: "That is more than ten years of downtime." };
  }
  return { kind: "ok", seconds: total };
}

/**
 * The availability that a given downtime leaves in a window, exactly, as a
 * percentage: 100 * (window - downtime) / window. Null when the downtime is
 * longer than the window.
 */
export function availabilityFromDowntime(down: Exact, windowSeconds: number): Exact | null {
  const w = BigInt(windowSeconds);
  if (down.num > w * down.den) return null;
  return reduce({ num: 100n * (w * down.den - down.num), den: w * down.den });
}

/** Subtracts b from a, which may go negative. */
export function subtractExact(a: Exact, b: Exact): Exact {
  return reduce({ num: a.num * b.den - b.num * a.den, den: a.den * b.den });
}

/* ---------------------------------------------------------------- composite */

/** Most tiers in one chain, and most redundant copies in one tier. */
export const MAX_TIERS = 10;
export const MAX_COPIES = 9;

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/**
 * Unavailability of a tier of n identical, independent copies that needs at
 * least k of them up: the probability that fewer than k are up,
 * sum over i < k of C(n, i) a^i u^(n - i). With k = 1 this is u^n, the
 * familiar parallel formula 1 - product of unavailability.
 */
export function tierUnavailability(u: number, copies: number, need: number): number {
  const n = Math.max(1, Math.min(MAX_COPIES, Math.floor(copies)));
  const k = Math.max(1, Math.min(n, Math.floor(need)));
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const a = 1 - u;
  let total = 0;
  for (let i = 0; i < k; i += 1) total += choose(n, i) * a ** i * u ** (n - i);
  return Math.min(1, total);
}

/**
 * Unavailability of independent parts in series, where every part must be
 * up: 1 - product of (1 - u_i), computed as -expm1(sum log1p(-u_i)) so that
 * small fractions keep their precision.
 */
export function seriesUnavailability(us: number[]): number {
  let logA = 0;
  for (const u of us) {
    if (u >= 1) return 1;
    logA += Math.log1p(-Math.max(0, u));
  }
  const u = -Math.expm1(logA);
  // expm1(0) is 0, and its negation is -0, which prints and compares oddly.
  return u > 0 ? Math.min(1, u) : 0;
}

export interface TierInput {
  name: string;
  availability: string;
  copies: number;
  need: number;
}

export interface TierResult {
  name: string;
  error: string | null;
  /** Unavailability of one copy. */
  u: number;
  copies: number;
  need: number;
  /** Unavailability of the whole tier after redundancy. */
  tierU: number;
  /** Share of the chain's summed unavailability, 0 to 1. */
  share: number;
}

export interface CompositeResult {
  tiers: TierResult[];
  /** False when any tier failed to parse; the totals are then not shown. */
  ok: boolean;
  /** Unavailability of the whole chain. */
  u: number;
  /** The same chain with every tier reduced to a single copy. */
  uSingle: number;
  /** Index of the tier contributing most unavailability, or -1. */
  weakest: number;
}

export function composite(inputs: TierInput[]): CompositeResult {
  const tiers: TierResult[] = inputs.slice(0, MAX_TIERS).map((t, i) => {
    const copies = Math.max(1, Math.min(MAX_COPIES, Math.floor(t.copies) || 1));
    const need = Math.max(1, Math.min(copies, Math.floor(t.need) || 1));
    const name = t.name.trim() || `Tier ${i + 1}`;
    const parsed = parseAvailability(t.availability);
    if (parsed.kind !== "ok") {
      return {
        name,
        error: parsed.kind === "empty" ? "Enter an availability, such as 99.9." : parsed.message,
        u: NaN,
        copies,
        need,
        tierU: NaN,
        share: 0,
      };
    }
    const u = toNumber(parsed.unavailability);
    return { name, error: null, u, copies, need, tierU: tierUnavailability(u, copies, need), share: 0 };
  });
  const ok = tiers.length > 0 && tiers.every((t) => t.error === null);
  if (!ok) return { tiers, ok, u: NaN, uSingle: NaN, weakest: -1 };
  const sum = tiers.reduce((acc, t) => acc + t.tierU, 0);
  let weakest = -1;
  tiers.forEach((t, i) => {
    t.share = sum > 0 ? t.tierU / sum : 0;
    if (t.tierU > 0 && (weakest < 0 || t.tierU > tiers[weakest].tierU)) weakest = i;
  });
  return {
    tiers,
    ok,
    u: seriesUnavailability(tiers.map((t) => t.tierU)),
    uSingle: seriesUnavailability(tiers.map((t) => t.u)),
    weakest,
  };
}
