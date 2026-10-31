/**
 * UPS runtime arithmetic.
 *
 * The linear estimate is energy over power:
 *
 *     hours = nameplate Wh * health * depth of discharge * inverter efficiency / load W
 *
 * The Peukert estimate (W. Peukert, 1897) corrects for the capacity a
 * lead-acid battery loses at high discharge current:
 *
 *     t = H * (C / (I * H))^k
 *
 * where C is the capacity rated at the H-hour rate, I is the discharge
 * current and k is the exponent. Treating the battery voltage V as constant,
 * C / (I * H) equals E / (P * H) for energy E = V * C and DC power P = V * I,
 * so the law applies to watt-hours and watts directly, and whether the
 * batteries are wired in series or parallel drops out of the ratio.
 *
 * Discharging more slowly than the rated rate (C / (I * H) > 1) is where the
 * law is known to overstate capacity, so the estimate is held at the rated
 * capacity there, which is the same as the linear figure.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ----------------------------------------------------------------- parsing */

export type Parsed = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "error"; message: string };

/** Longer than this is not a number anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 40;

const PLAIN = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;

interface NumberRule {
  label: string;
  min: number;
  max: number;
  /** When false, the minimum itself is refused (a strict greater-than). */
  minInclusive?: boolean;
  integer?: boolean;
  unit?: string;
  example: string;
  /** A message for values above max that says why, instead of only the limit. */
  overMax?: string;
  /** A message for values below min that says why. */
  underMin?: string;
}

function fmtLimit(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/**
 * Parses a plain positive number: 12, 2.5, .5, 1e3 or 1,000. Commas count
 * only as thousands separators, because "1,5" could mean either one and a
 * half or fifteen and guessing wrong is worse than asking.
 */
export function parseNumber(raw: string, rule: NumberRule): Parsed {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { kind: "error", message: `${rule.label} is longer than ${MAX_INPUT_LENGTH} characters. Enter a plain number such as ${rule.example}.` };
  }
  let text = trimmed.replace(/[\s_]/g, "");
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-")) return { kind: "error", message: `${rule.label} cannot be negative.` };
  if (text.includes(",")) {
    if (!GROUPED.test(text)) {
      return { kind: "error", message: "Commas are read as thousands separators, as in 1,500. For a fraction, use a point: 0.95." };
    }
    text = text.replace(/,/g, "");
  }
  if (!PLAIN.test(text)) return { kind: "error", message: `${rule.label} must be a plain number, such as ${rule.example}.` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "error", message: `${rule.label} is too large.` };
  if (rule.integer && !Number.isInteger(value)) return { kind: "error", message: `${rule.label} must be a whole number.` };
  const unit = rule.unit ?? "";
  if (rule.minInclusive === false ? value <= rule.min : value < rule.min) {
    if (rule.underMin) return { kind: "error", message: rule.underMin };
    return {
      kind: "error",
      message:
        rule.minInclusive === false
          ? `${rule.label} must be greater than ${fmtLimit(rule.min)}${unit}.`
          : `${rule.label} must be at least ${fmtLimit(rule.min)}${unit}.`,
    };
  }
  if (value > rule.max) {
    return { kind: "error", message: rule.overMax ?? `${rule.label} can be at most ${fmtLimit(rule.max)}${unit}.` };
  }
  return { kind: "ok", value };
}

/* ----------------------------------------------------------------- limits */

/** 10 MWh: well past the largest single UPS battery plant. */
export const MAX_WH = 10_000_000;
/** 10 MW of load. */
export const MAX_LOAD = 10_000_000;
/** The replacement point IEEE 1188 (VRLA) and IEEE 450 (vented) recommend: 80 percent of rated capacity. */
export const END_OF_LIFE_HEALTH = 0.8;
/** Load multiples for the runtime table. */
export const LOAD_STEPS = [0.25, 0.5, 1, 1.5, 2];

/** Typical exponents. Real values come from the battery data sheet or a discharge test. */
export const PEUKERT_PRESETS: { value: string; label: string; note: string }[] = [
  { value: "", label: "Off", note: "Linear only. Lithium cells are close to linear." },
  { value: "1.1", label: "1.1 AGM", note: "Typical for the sealed AGM batteries in small UPS units." },
  { value: "1.2", label: "1.2 Gel", note: "Gel cells lose more capacity at high current." },
  { value: "1.3", label: "1.3 Flooded", note: "Flooded lead-acid, toward the high end." },
];

export const parse = {
  wh: (raw: string) =>
    parseNumber(raw, { label: "Battery capacity", min: 0, minInclusive: false, max: MAX_WH, unit: " Wh", example: "216" }),
  volts: (raw: string) =>
    parseNumber(raw, { label: "Battery voltage", min: 0, minInclusive: false, max: 1000, unit: " V", example: "12" }),
  ah: (raw: string) =>
    parseNumber(raw, { label: "Amp-hour rating", min: 0, minInclusive: false, max: 100_000, unit: " Ah", example: "9" }),
  count: (raw: string) =>
    parseNumber(raw, { label: "Battery count", min: 1, max: 1000, integer: true, example: "2" }),
  percent: (raw: string, label: string, example: string) =>
    parseNumber(raw, { label, min: 0, minInclusive: false, max: 100, unit: " percent", example }),
  load: (raw: string, unit: "W" | "VA") =>
    parseNumber(raw, { label: "Load", min: 0, minInclusive: false, max: MAX_LOAD, unit: ` ${unit}`, example: "500" }),
  rating: (raw: string, unit: "W" | "VA") =>
    parseNumber(raw, {
      label: unit === "W" ? "Watt rating" : "VA rating",
      min: 0,
      minInclusive: false,
      max: MAX_LOAD,
      unit: ` ${unit}`,
      example: unit === "W" ? "1000" : "1500",
    }),
  powerFactor: (raw: string) =>
    parseNumber(raw, {
      label: "Power factor",
      min: 0,
      minInclusive: false,
      max: 1,
      example: "0.9",
      overMax: "A power factor cannot exceed 1: real power is at most the apparent power.",
    }),
  peukert: (raw: string) =>
    parseNumber(raw, {
      label: "Peukert exponent",
      min: 1,
      max: 2,
      example: "1.1",
      underMin: "A Peukert exponent below 1 would mean a battery gives more at higher current, which lead-acid cells do not.",
      overMax: "Exponents above 2 are outside what Peukert's law describes for real cells. Lead-acid is usually 1.05 to 1.4.",
    }),
  ratedHours: (raw: string) =>
    parseNumber(raw, { label: "Rating period", min: 0, minInclusive: false, max: 1000, unit: " hours", example: "20" }),
};

/** Total nameplate energy of identical batteries, however they are wired. */
export function batteryWh(volts: number, ah: number, count: number): number {
  return volts * ah * count;
}

/* ---------------------------------------------------------------- runtime */

export interface RuntimeInput {
  /** Nameplate energy of the whole battery, Wh. */
  capacityWh: number;
  /** Inverter efficiency as a fraction, 0 to 1. */
  efficiency: number;
  /** Real power drawn by the load, W. */
  loadW: number;
  /** Usable depth of discharge as a fraction, 0 to 1. */
  dod: number;
  /** State of health: remaining capacity as a fraction of nameplate. */
  health: number;
  /** Peukert exponent, or null for the linear estimate only. */
  peukert: number | null;
  /** The discharge period the capacity is rated at, hours (20 for a C20 rating). */
  ratedHours: number;
}

export interface RuntimeResult {
  /** Power drawn from the battery: load over inverter efficiency. */
  dcWatts: number;
  /** Energy the battery is allowed to give, Wh. */
  usableWh: number;
  linearHours: number;
  peukertHours: number | null;
  /** True when the discharge is slower than the rated rate and Peukert was held at the linear figure. */
  clamped: boolean;
  /** Share of rated capacity available at this discharge rate, under Peukert. */
  capacityFraction: number | null;
  /** C / (I * H): below 1 means discharging faster than the rated rate. */
  rateRatio: number;
}

export function estimateRuntime(input: RuntimeInput): RuntimeResult {
  const { capacityWh, efficiency, loadW, dod, health, peukert, ratedHours } = input;
  const dcWatts = loadW / efficiency;
  const agedWh = capacityWh * health;
  const usableWh = agedWh * dod;
  const linearHours = usableWh / dcWatts;
  const rateRatio = agedWh / (dcWatts * ratedHours);

  if (peukert === null) {
    return { dcWatts, usableWh, linearHours, peukertHours: null, clamped: false, capacityFraction: null, rateRatio };
  }
  if (rateRatio >= 1) {
    return { dcWatts, usableWh, linearHours, peukertHours: linearHours, clamped: true, capacityFraction: 1, rateRatio };
  }
  // t = H * (C / (I H))^k for a full discharge, then scaled by the usable share.
  const fullHours = ratedHours * Math.pow(rateRatio, peukert);
  return {
    dcWatts,
    usableWh,
    linearHours,
    peukertHours: fullHours * dod,
    clamped: false,
    capacityFraction: Math.pow(rateRatio, peukert - 1),
    rateRatio,
  };
}

/* ---------------------------------------------------------------- ratings */

export interface RatingCheck {
  wFraction: number | null;
  vaFraction: number | null;
  fitsW: boolean | null;
  fitsVA: boolean | null;
  /** Both given ratings hold the load. Null when no rating was given. */
  fits: boolean | null;
  /** The rating closest to its limit. */
  limiting: "W" | "VA" | null;
}

/** A UPS has two limits, real power (W) and apparent power (VA), and the load has to fit under both. */
export function ratingCheck(loadW: number, loadVA: number, ratedW: number | null, ratedVA: number | null): RatingCheck {
  const wFraction = ratedW ? loadW / ratedW : null;
  const vaFraction = ratedVA ? loadVA / ratedVA : null;
  const fitsW = wFraction === null ? null : wFraction <= 1;
  const fitsVA = vaFraction === null ? null : vaFraction <= 1;
  const fits = fitsW === null && fitsVA === null ? null : fitsW !== false && fitsVA !== false;
  let limiting: "W" | "VA" | null = null;
  if (wFraction !== null && vaFraction !== null) limiting = wFraction >= vaFraction ? "W" : "VA";
  else if (wFraction !== null) limiting = "W";
  else if (vaFraction !== null) limiting = "VA";
  return { wFraction, vaFraction, fitsW, fitsVA, fits, limiting };
}

/* -------------------------------------------------------------- formatting */

/** "18 min 40 s", "3 h 12 min", "2 days 4 h". Each branch rounds to its own resolution first. */
export function formatHours(hours: number): string {
  const seconds = hours * 3600;
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 0.5) return "under 1 s";
  if (seconds < 59.5) return `${Math.round(seconds)} s`;
  if (seconds < 3599.5) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  if (seconds < 86370) {
    const total = Math.round(seconds / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  if (hours > 24 * 365.25 * 100) return "more than 100 years";
  const total = Math.round(seconds / 3600);
  const d = Math.floor(total / 24);
  const h = total % 24;
  const days = `${d} ${d === 1 ? "day" : "days"}`;
  return h ? `${days} ${h} h` : days;
}

/** Three significant digits with thousands separators: 556, 1,500, 0.311. */
export function formatNum(x: number): string {
  if (!Number.isFinite(x)) return "--";
  if (x === 0) return "0";
  if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("en-US");
  return Number(x.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** A fraction as a percent with no more precision than it has: 55%, 0.4%, 133%. */
export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "--";
  const pct = fraction * 100;
  if (pct >= 10 || pct === 0) return `${Math.round(pct).toLocaleString("en-US")}%`;
  return `${Number(pct.toPrecision(2))}%`;
}
