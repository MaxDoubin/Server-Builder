/**
 * Decibel arithmetic for sound levels and radio links.
 *
 * A decibel value is 10 log10 of a power ratio, so sources that do not share
 * a phase relationship (fans, drives, separate machines) add as powers:
 * L = 10 log10(sum 10^(Li/10)). Every sum here factors out the largest term
 * first, so a level of 250 dB or a list of a thousand sources never
 * overflows or loses the small contributions to rounding.
 *
 * Distance follows the inverse square law in a free field: a point source
 * spreads over a sphere, 20 log10(r2/r1), and a long line source over a
 * cylinder, 10 log10(r2/r1).
 *
 * A and C frequency weightings use the analytic expressions in IEC 61672-1
 * (Annex E). Free-space path loss is the Friis result as written in
 * ITU-R P.525: 20 log10(4 pi d / lambda).
 *
 * Pure functions only: no React, no DOM.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Exact by definition of the meter (CGPM 1983), in m/s. */
export const SPEED_OF_LIGHT_M_S = 299_792_458;

/** Inputs past these are rejected with a message, so every output stays finite and meaningful. */
export const MAX_ABS_DB = 300;
/** Distinct entries in a source list. Each entry can carry a count, such as 12 x 55. */
export const MAX_ENTRIES = 200;
/** Largest count on one entry. */
export const MAX_COUNT = 1_000_000;
/** Longest source list read, in characters. */
export const MAX_LIST_CHARS = 20_000;

/* ------------------------------------------------------------ parsing */

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Trims and shortens user text for quoting back in an error. */
function quote(text: string): string {
  const t = text.trim();
  return t.length > 24 ? `${t.slice(0, 24)}...` : t;
}

export interface NumberRule {
  min?: number;
  max?: number;
  /** When true, the value must be strictly greater than min. */
  minExclusive?: boolean;
  /** Appended to numbers in range messages, such as " dB". */
  unit?: string;
}

function show(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/**
 * A finite decimal, optionally signed, with exponent notation allowed.
 * Thousands separators are accepted only in the exact 1,000,000 form, so a
 * decimal comma such as 3,5 is reported instead of being read as 35.
 */
export function parseNumber(text: string, what: string, rule: NumberRule = {}): Parsed<number> {
  const raw = text.trim();
  if (raw === "") return { ok: false, error: `Enter ${what}.` };
  if (raw.length > 40) return { ok: false, error: `That is too long to be ${what}.` };
  let cleaned = raw.replace(/[\s_]/g, "").replace(/−/g, "-");
  if (cleaned.includes(",")) {
    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(cleaned)) cleaned = cleaned.replace(/,/g, "");
    else return { ok: false, error: `Use a period as the decimal point in ${what}, not a comma.` };
  }
  if (!NUMBER_RE.test(cleaned)) {
    return { ok: false, error: `"${quote(raw)}" is not a number. Use digits, an optional sign and one decimal point.` };
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return { ok: false, error: `${capitalize(what)} is too large.` };
  const unit = rule.unit ?? "";
  if (rule.min !== undefined) {
    if (rule.minExclusive && value <= rule.min) {
      return { ok: false, error: `${capitalize(what)} must be greater than ${show(rule.min)}${unit}.` };
    }
    if (!rule.minExclusive && value < rule.min) {
      return { ok: false, error: `${capitalize(what)} must be at least ${show(rule.min)}${unit}.` };
    }
  }
  if (rule.max !== undefined && value > rule.max) {
    return { ok: false, error: `${capitalize(what)} must be at most ${show(rule.max)}${unit}.` };
  }
  return { ok: true, value: value === 0 ? 0 : value };
}

/** A level or gain in decibels, within plus or minus MAX_ABS_DB. */
export function parseDb(text: string, what: string): Parsed<number> {
  return parseNumber(text, what, { min: -MAX_ABS_DB, max: MAX_ABS_DB, unit: " dB" });
}

/** A loss in decibels. Negative losses are refused because they are gains. */
export function parseLoss(text: string, what: string): Parsed<number> {
  const parsed = parseNumber(text, what, { max: MAX_ABS_DB, unit: " dB" });
  if (parsed.ok && parsed.value < 0) {
    return {
      ok: false,
      error: `Enter ${what} as a positive number of dB. A negative loss would be a gain.`,
    };
  }
  return parsed;
}

export interface LevelEntry {
  level: number;
  count: number;
  /** The text this entry came from, for display. */
  label: string;
}

/**
 * A list of levels. Entries are separated by new lines, commas or
 * semicolons, and plain spaces also separate bare numbers. A unit suffix
 * such as dB or dBA is ignored, and "12 x 55" means twelve sources at 55 dB.
 */
export function parseLevelList(text: string): Parsed<LevelEntry[]> {
  if (text.length > MAX_LIST_CHARS) {
    return {
      ok: false,
      error: `The list is longer than ${MAX_LIST_CHARS.toLocaleString("en-US")} characters. Use the 12 x 55 form for repeated sources.`,
    };
  }
  const entries: LevelEntry[] = [];
  const pieces = text.split(/[\n\r,;]+/);
  for (const piece of pieces) {
    const stripped = piece
      .replace(/(\d)db[a-z]*\b/gi, "$1 ")
      .replace(/\bdb[a-z]*\b/gi, " ")
      .trim();
    if (stripped === "") continue;
    const counted = /^(\d+)\s*[x×*]\s*(\S+)$/i.exec(stripped);
    const parts: { count: number; text: string; label: string }[] = [];
    if (counted) {
      const count = Number(counted[1]);
      if (!Number.isSafeInteger(count) || count < 1) {
        return { ok: false, error: `"${quote(piece)}": the count before x must be a whole number of at least 1.` };
      }
      if (count > MAX_COUNT) {
        return {
          ok: false,
          error: `"${quote(piece)}": at most ${MAX_COUNT.toLocaleString("en-US")} identical sources per entry.`,
        };
      }
      parts.push({ count, text: counted[2], label: `${count} x ${counted[2]}` });
    } else {
      for (const token of stripped.split(/\s+/)) parts.push({ count: 1, text: token, label: token });
    }
    for (const part of parts) {
      const parsed = parseNumber(part.text, "each level", { min: -MAX_ABS_DB, max: MAX_ABS_DB, unit: " dB" });
      if (!parsed.ok) {
        return {
          ok: false,
          error: NUMBER_RE.test(part.text.replace(/−/g, "-"))
            ? parsed.error
            : `"${quote(part.text)}" is not a level. Write numbers such as 45, 52.5 or 4 x 48.`,
        };
      }
      entries.push({ level: parsed.value, count: part.count, label: part.label });
      if (entries.length > MAX_ENTRIES) {
        return {
          ok: false,
          error: `At most ${MAX_ENTRIES} entries. Combine identical sources with the 12 x 55 form.`,
        };
      }
    }
  }
  if (entries.length === 0) return { ok: false, error: "Enter at least one level." };
  return { ok: true, value: entries };
}

/* ------------------------------------------------------------ incoherent sums */

/**
 * The power sum of levels, 10 log10(sum ni 10^(Li/10)), computed with the
 * largest level factored out so nothing overflows or underflows.
 */
export function sumLevels(entries: { level: number; count: number }[]): number {
  if (entries.length === 0) return -Infinity;
  let max = -Infinity;
  for (const e of entries) if (e.level > max) max = e.level;
  let s = 0;
  for (const e of entries) s += e.count * Math.pow(10, (e.level - max) / 10);
  return max + 10 * Math.log10(s);
}

/** n identical sources at level L: L + 10 log10(n). */
export function identicalSources(level: number, count: number): number {
  return level + 10 * Math.log10(count);
}

export interface Contribution {
  entry: LevelEntry;
  /** Fraction of the total power from this entry, 0 to 1. */
  share: number;
  /** The total with this entry removed, or null when nothing else is left. */
  without: number | null;
  /** How far the total falls when this entry is removed, or null when nothing else is left. */
  drop: number | null;
}

export interface SumResult {
  total: number;
  sources: number;
  contributions: Contribution[];
}

export function analyzeSum(entries: LevelEntry[]): SumResult {
  const total = sumLevels(entries);
  const contributions = entries.map((entry, i) => {
    const share = Math.min(1, entry.count * Math.pow(10, (entry.level - total) / 10));
    // Sum the others directly rather than subtracting this one from the
    // total, which would lose every digit when one entry dominates.
    const others = entries.filter((_, j) => j !== i);
    const without = others.length ? sumLevels(others) : null;
    return { entry, share, without, drop: without === null ? null : total - without };
  });
  const sources = entries.reduce((n, e) => n + e.count, 0);
  return { total, sources, contributions };
}

export interface Difference {
  /** The level left after taking the known part away. */
  remaining: number;
  /** total minus part, the margin the result depends on. */
  margin: number;
  /**
   * d(remaining)/d(total): how many dB the result moves for each dB of
   * error in the measured total. 1 when the part is negligible, and it
   * grows without bound as the part approaches the total.
   */
  sensitivity: number;
}

/**
 * Removes one incoherent contribution from a measured total:
 * 10 log10(10^(T/10) - 10^(P/10)), written as T + 10 log10(1 - 10^(-(T-P)/10))
 * with expm1 so a small margin keeps its precision.
 */
export function subtractLevel(total: number, part: number): Parsed<Difference> {
  const margin = total - part;
  if (!(margin > 0)) {
    return {
      ok: false,
      error:
        margin === 0
          ? "The part equals the total, so nothing is left. Levels add as powers, so a part can only be smaller than the total it belongs to."
          : "The part is louder than the total. Levels add as powers, so a part can only be smaller than the total it belongs to.",
    };
  }
  const fraction = -Math.expm1((-margin / 10) * Math.LN10); // 1 - 10^(-margin/10)
  return {
    ok: true,
    value: { remaining: total + 10 * Math.log10(fraction), margin, sensitivity: 1 / fraction },
  };
}

/* ------------------------------------------------------------ distance */

export type SpreadingModel = "point" | "line";

/** dB per decade of distance: spherical spreading 20, cylindrical 10. */
export function spreadingSlope(model: SpreadingModel): number {
  return model === "point" ? 20 : 10;
}

export interface DistanceResult {
  level: number;
  change: number;
  doublings: number;
  perDoubling: number;
}

/** Free-field level at r2 from a known level at r1 (same unit for both). */
export function levelAtDistance(level: number, r1: number, r2: number, model: SpreadingModel): DistanceResult {
  const slope = spreadingSlope(model);
  const change = -slope * Math.log10(r2 / r1);
  return {
    level: level + change,
    change: change === 0 ? 0 : change,
    doublings: Math.log2(r2 / r1),
    perDoubling: slope * Math.log10(2),
  };
}

/* ------------------------------------------------------------ frequency weighting */

// IEC 61672-1:2013 Annex E pole frequencies, in Hz, and the normalization
// constants that make each weighting exactly 0 dB at 1 kHz.
const F1 = 20.598997;
const F2 = 107.65265;
const F3 = 737.86223;
const F4 = 12194.217;
const A1000 = -2.0;
const C1000 = -0.062;

/** A-weighting in dB at frequency f in Hz (IEC 61672-1, equation E.6). */
export function aWeighting(f: number): number {
  const f2 = f * f;
  const num = F4 * F4 * f2 * f2;
  const den = (f2 + F1 * F1) * Math.sqrt((f2 + F2 * F2) * (f2 + F3 * F3)) * (f2 + F4 * F4);
  return 20 * Math.log10(num / den) - A1000;
}

/** C-weighting in dB at frequency f in Hz (IEC 61672-1, equation E.1). */
export function cWeighting(f: number): number {
  const f2 = f * f;
  const num = F4 * F4 * f2;
  const den = (f2 + F1 * F1) * (f2 + F4 * F4);
  return 20 * Math.log10(num / den) - C1000;
}

export interface OctaveBand {
  /** Nominal label, as printed on data sheets. */
  label: string;
  /** Exact base-ten midband frequency, 1000 x 10^(3k/10) Hz (IEC 61260-1). */
  hz: number;
}

export const OCTAVE_BANDS: OctaveBand[] = [
  { label: "63", k: -4 },
  { label: "125", k: -3 },
  { label: "250", k: -2 },
  { label: "500", k: -1 },
  { label: "1k", k: 0 },
  { label: "2k", k: 1 },
  { label: "4k", k: 2 },
  { label: "8k", k: 3 },
].map(({ label, k }) => ({ label, hz: 1000 * Math.pow(10, (3 * k) / 10) }));

export interface WeightedBand {
  band: OctaveBand;
  level: number;
  a: number;
  c: number;
}

export interface WeightedTotals {
  bands: WeightedBand[];
  z: number;
  a: number;
  c: number;
}

/** Overall unweighted, A-weighted and C-weighted levels from octave band levels. */
export function weightOctaveBands(levels: (number | null)[]): WeightedTotals | null {
  const bands: WeightedBand[] = [];
  OCTAVE_BANDS.forEach((band, i) => {
    const level = levels[i];
    if (level === null || level === undefined) return;
    bands.push({ band, level, a: level + aWeighting(band.hz), c: level + cWeighting(band.hz) });
  });
  if (bands.length === 0) return null;
  return {
    bands,
    z: sumLevels(bands.map((b) => ({ level: b.level, count: 1 }))),
    a: sumLevels(bands.map((b) => ({ level: b.a, count: 1 }))),
    c: sumLevels(bands.map((b) => ({ level: b.c, count: 1 }))),
  };
}

/* ------------------------------------------------------------ ratios */

export type RatioKind = "db" | "power" | "amplitude";

export interface RatioResult {
  db: number;
  power: number;
  amplitude: number;
}

/**
 * Decibels from a power ratio are 10 log10, from an amplitude (voltage,
 * current, sound pressure) ratio 20 log10, because power goes as the
 * square of amplitude.
 */
export function convertRatio(value: number, kind: RatioKind): Parsed<RatioResult> {
  if (kind !== "db" && !(value > 0)) {
    return { ok: false, error: "A ratio must be greater than zero. Zero power is minus infinity decibels." };
  }
  const db = kind === "db" ? value : kind === "power" ? 10 * Math.log10(value) : 20 * Math.log10(value);
  if (!Number.isFinite(db) || Math.abs(db) > MAX_ABS_DB) {
    return { ok: false, error: `That is beyond plus or minus ${MAX_ABS_DB} dB.` };
  }
  return { ok: true, value: { db, power: Math.pow(10, db / 10), amplitude: Math.pow(10, db / 20) } };
}

/* ------------------------------------------------------------ RF power */

export type PowerUnit = "dBm" | "dBW" | "W" | "mW" | "uW";

export const POWER_UNITS: { value: PowerUnit; label: string }[] = [
  { value: "dBm", label: "dBm" },
  { value: "dBW", label: "dBW" },
  { value: "W", label: "W" },
  { value: "mW", label: "mW" },
  { value: "uW", label: "µW" },
];

export interface PowerResult {
  dbm: number;
  dbw: number;
  watts: number;
}

/** dBm is decibels relative to 1 mW, dBW relative to 1 W, so dBW = dBm - 30. */
export function convertPower(value: number, unit: PowerUnit): Parsed<PowerResult> {
  let dbm: number;
  if (unit === "dBm") dbm = value;
  else if (unit === "dBW") dbm = value + 30;
  else {
    if (!(value > 0)) {
      return { ok: false, error: "Power in watts must be greater than zero. Zero watts is minus infinity dBm." };
    }
    const mw = unit === "W" ? value * 1e3 : unit === "mW" ? value : value * 1e-3;
    dbm = 10 * Math.log10(mw);
  }
  if (!Number.isFinite(dbm) || Math.abs(dbm) > MAX_ABS_DB) {
    return { ok: false, error: `That power is beyond plus or minus ${MAX_ABS_DB} dBm.` };
  }
  return { ok: true, value: { dbm, dbw: dbm - 30, watts: Math.pow(10, dbm / 10) / 1e3 } };
}

export function dbmToMw(dbm: number): number {
  return Math.pow(10, dbm / 10);
}

export function mwToDbm(mw: number): number {
  return 10 * Math.log10(mw);
}

/* ------------------------------------------------------------ free-space path loss */

export type FrequencyUnit = "kHz" | "MHz" | "GHz";
export type DistanceUnit = "m" | "km" | "ft" | "mi";

export const FREQUENCY_FACTOR: Record<FrequencyUnit, number> = { kHz: 1e3, MHz: 1e6, GHz: 1e9 };
/** International foot and statute mile, exact in meters. */
export const DISTANCE_FACTOR: Record<DistanceUnit, number> = { m: 1, km: 1e3, ft: 0.3048, mi: 1609.344 };

/** Frequencies outside this band are refused, in Hz. */
export const MIN_FREQUENCY_HZ = 1e3;
export const MAX_FREQUENCY_HZ = 3e12;
/** Distances past this are refused, in meters (1e15 m is about a tenth of a light-year). */
export const MAX_DISTANCE_M = 1e15;

export interface PathLoss {
  /** Free-space path loss in dB between isotropic antennas. */
  fspl: number;
  wavelength: number;
  /** Distance in wavelengths. */
  wavelengths: number;
  /** First Fresnel zone radius at the midpoint, in meters. */
  fresnelMid: number;
}

/**
 * FSPL = 20 log10(4 pi d f / c) for d in meters and f in hertz
 * (ITU-R P.525, eq. 4; equivalently 32.45 + 20 log10 f[MHz] + 20 log10 d[km]).
 */
export function freeSpacePathLoss(distanceM: number, frequencyHz: number): PathLoss {
  const wavelength = SPEED_OF_LIGHT_M_S / frequencyHz;
  const fspl = 20 * Math.log10((4 * Math.PI * distanceM) / wavelength);
  // r1 = sqrt(lambda d1 d2 / (d1 + d2)), which is sqrt(lambda d) / 2 at the midpoint.
  const fresnelMid = Math.sqrt(wavelength * distanceM) / 2;
  return { fspl, wavelength, wavelengths: distanceM / wavelength, fresnelMid };
}

/* ------------------------------------------------------------ link budget */

export interface LinkInput {
  txDbm: number;
  txLossDb: number;
  txGainDbi: number;
  pathLossDb: number;
  otherLossDb: number;
  rxGainDbi: number;
  rxLossDb: number;
  sensitivityDbm: number | null;
}

export interface LinkResult {
  eirpDbm: number;
  rxDbm: number;
  marginDb: number | null;
}

/** Received power is the transmit power plus every gain minus every loss, all in dB. */
export function linkBudget(input: LinkInput): LinkResult {
  const eirpDbm = input.txDbm - input.txLossDb + input.txGainDbi;
  const rxDbm = eirpDbm - input.pathLossDb - input.otherLossDb + input.rxGainDbi - input.rxLossDb;
  return {
    eirpDbm,
    rxDbm,
    marginDb: input.sensitivityDbm === null ? null : rxDbm - input.sensitivityDbm,
  };
}

/* ------------------------------------------------------------ formatting */

/** Fixed decimals, with negative zero and -0.00 shown as 0. */
export function formatDb(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? "infinite" : "minus infinity";
  const rounded = Number(value.toFixed(digits));
  const v = rounded === 0 ? 0 : rounded;
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A signed dB change, such as +3.01 or -6.02. */
export function formatSignedDb(value: number, digits = 2): string {
  const text = formatDb(value, digits);
  return value > 0 && text !== formatDb(0, digits) ? `+${text}` : text;
}

const SI_PREFIXES: { exp: number; symbol: string }[] = [
  { exp: -18, symbol: "a" },
  { exp: -15, symbol: "f" },
  { exp: -12, symbol: "p" },
  { exp: -9, symbol: "n" },
  { exp: -6, symbol: "µ" },
  { exp: -3, symbol: "m" },
  { exp: 0, symbol: "" },
  { exp: 3, symbol: "k" },
  { exp: 6, symbol: "M" },
  { exp: 9, symbol: "G" },
  { exp: 12, symbol: "T" },
];

/** Drops trailing zeros after a decimal point, in plain or exponent form. */
function trimZeros(text: string): string {
  const [mantissa, exponent] = text.split("e");
  const m = mantissa.includes(".") ? mantissa.replace(/\.?0+$/, "") : mantissa;
  return exponent === undefined ? m : `${m}e${exponent}`;
}

/** A quantity with an SI prefix and four significant digits, such as 125.9 mW. */
export function formatSi(value: number, unit: string): string {
  if (value === 0) return `0 ${unit}`;
  if (!Number.isFinite(value)) return "out of range";
  const abs = Math.abs(value);
  let exp = Math.floor(Math.log10(abs) / 3) * 3;
  if (exp < -18 || exp > 12) return `${trimZeros(value.toExponential(3))} ${unit}`;
  let scaled = value / Math.pow(10, exp);
  let text = scaled.toPrecision(4);
  if (Math.abs(Number(text)) >= 1000 && exp < 12) {
    exp += 3;
    scaled = value / Math.pow(10, exp);
    text = scaled.toPrecision(4);
  }
  const prefix = SI_PREFIXES.find((p) => p.exp === exp)?.symbol ?? "";
  return `${trimZeros(text)} ${prefix}${unit}`;
}

/** Plain decimal with up to the given significant digits, grouped. */
export function formatNumber(value: number, significant = 4): string {
  if (!Number.isFinite(value)) return "out of range";
  if (value !== 0 && (Math.abs(value) >= 1e15 || Math.abs(value) < 1e-6)) {
    return trimZeros(value.toExponential(significant - 1));
  }
  return value.toLocaleString("en-US", { maximumSignificantDigits: significant });
}

/** A length in meters, shown in m, km or mm as it reads best. */
export function formatMeters(m: number): string {
  if (m >= 1000) return `${formatNumber(m / 1000)} km`;
  if (m >= 1) return `${formatNumber(m)} m`;
  if (m >= 0.001) return `${formatNumber(m * 1000)} mm`;
  return formatSi(m, "m");
}
