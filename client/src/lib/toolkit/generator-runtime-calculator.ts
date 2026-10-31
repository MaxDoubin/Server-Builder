/**
 * Standby generator fuel use and runtime.
 *
 * A generator data sheet gives fuel consumption at 25, 50, 75 and 100
 * percent of the standby rating. Between those points this interpolates
 * linearly. Below 25 percent it extends the 25 to 50 percent segment, which
 * is the usual straight-line (Willans line) approximation of an engine's
 * fuel map: consumption falls with load but does not reach zero, because an
 * idling engine still burns fuel to turn itself over.
 *
 * Canonical units are US gallons per hour for liquid fuels and cubic feet
 * per hour for natural gas. Metric display converts with the exact
 * definitions of the gallon (231 cubic inches) and the foot (0.3048 m).
 *
 * Pure functions only: no React, no DOM.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type FuelId = "diesel" | "natural-gas" | "propane";
export type UnitSystem = "us" | "metric";
export type LoadMode = "kw" | "percent";

/** The load points every generator data sheet tabulates, as fractions of the standby rating. */
export const LOAD_POINTS = [0.25, 0.5, 0.75, 1] as const;

/** US liquid gallon in liters, exact (231 cubic inches). */
export const LITERS_PER_GALLON = 3.785411784;
/** Cubic foot in cubic meters, exact (0.3048 m cubed). */
export const CUBIC_METERS_PER_CUBIC_FOOT = 0.028316846592;
/** Propane vapor from one gallon of liquid, at 60 F and atmospheric pressure. */
export const PROPANE_FT3_PER_GALLON = 36.39;
/**
 * Below this fraction of the rating a diesel risks wet stacking. It is the
 * load NFPA 110 names for the monthly diesel exercise, and the floor most
 * engine manufacturers give for extended running.
 */
export const WET_STACKING_FRACTION = 0.3;

/** Inputs past these are refused with a message, so every output stays finite. */
export const MAX_RATING_KW = 20_000;
export const MAX_TANK = 10_000_000;
export const MAX_TARGET_HOURS = 10_000;
export const MAX_CURVE_VALUE = 10_000_000;

export interface Fuel {
  id: FuelId;
  label: string;
  state: "liquid" | "gas";
  /**
   * Typical consumption per kW of standby rating, per hour, at 25, 50, 75
   * and 100 percent load: US gallons for liquids, cubic feet for gas.
   * Representative of mid-size standby sets of roughly 100 to 1,000 kW;
   * small residential sets burn noticeably more per kWh.
   */
  typicalPerKw: readonly [number, number, number, number];
  /** Default usable share of the nominal tank, in percent, or null when there is no tank. */
  usableDefault: number | null;
  /** Why the default usable share is what it is. */
  usableNote: string;
}

export const FUELS: Fuel[] = [
  {
    id: "diesel",
    label: "Diesel",
    state: "liquid",
    // About 0.072 gal per kWh at full load, roughly 14 kWh per gallon.
    typicalPerKw: [0.023, 0.038, 0.054, 0.072],
    usableDefault: 95,
    usableNote:
      "Allows for the fuel below the pickup tube and the water and sediment at the bottom of the tank. Lower it to hold a reserve.",
  },
  {
    id: "natural-gas",
    label: "Natural gas",
    state: "gas",
    // Spark-ignited engines are less efficient than diesels: about 13 cubic
    // feet per kWh at full load, rising steeply at light load.
    typicalPerKw: [4.6, 7.6, 10.4, 13.0],
    usableDefault: null,
    usableNote: "",
  },
  {
    id: "propane",
    label: "Propane",
    state: "liquid",
    // The natural gas curve converted at equal energy: about 0.147 gallons
    // of liquid propane per kWh at full load.
    typicalPerKw: [0.052, 0.086, 0.118, 0.147],
    usableDefault: 80,
    usableNote:
      "Propane tanks are filled to about 80 percent of their water capacity, leaving room for the liquid to expand, so a 500 gallon tank holds about 400. In cold weather a nearly empty tank may not vaporize fast enough for a large set, so plan on less.",
  },
];

export function fuelById(id: FuelId): Fuel {
  return FUELS.find((f) => f.id === id) ?? FUELS[0];
}

/* ------------------------------------------------------------ units */

/** The volume unit for a fuel in a unit system. */
export function volumeUnit(fuel: Fuel, system: UnitSystem): string {
  if (fuel.state === "liquid") return system === "us" ? "gal" : "L";
  return system === "us" ? "ft³" : "m³";
}

/** Display units per canonical unit (1 for US). */
export function unitFactor(fuel: Fuel, system: UnitSystem): number {
  if (system === "us") return 1;
  return fuel.state === "liquid" ? LITERS_PER_GALLON : CUBIC_METERS_PER_CUBIC_FOOT;
}

/** Converts a volume shown in one unit system to the other. */
export function convertVolume(value: number, fuel: Fuel, from: UnitSystem, to: UnitSystem): number {
  if (from === to) return value;
  const factor = fuel.state === "liquid" ? LITERS_PER_GALLON : CUBIC_METERS_PER_CUBIC_FOOT;
  return from === "us" ? value * factor : value / factor;
}

/** Propane vapor volume for a liquid volume, in ft3 per gal (US) or m3 per L (metric). */
export function propaneVapor(liquid: number, system: UnitSystem): number {
  if (system === "us") return liquid * PROPANE_FT3_PER_GALLON;
  return (liquid * PROPANE_FT3_PER_GALLON * CUBIC_METERS_PER_CUBIC_FOOT) / LITERS_PER_GALLON;
}

/** Rounds to three significant figures, the precision a data sheet prints. */
export function roundSignificant(value: number, digits = 3): number {
  if (value === 0 || !Number.isFinite(value)) return value;
  return Number(value.toPrecision(digits));
}

/** Typical consumption per hour at the four load points, in display units, rounded to three figures. */
export function typicalCurve(fuel: Fuel, ratingKw: number, system: UnitSystem): number[] {
  const factor = unitFactor(fuel, system);
  return fuel.typicalPerKw.map((perKw) => roundSignificant(perKw * ratingKw * factor));
}

/* ------------------------------------------------------------ parsing */

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function show(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export interface NumberRule {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  unit?: string;
}

/**
 * A finite decimal. Thousands separators are accepted only in the exact
 * 1,000,000 form, so a decimal comma such as 3,5 is reported, not read as 35.
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
    const shown = raw.length > 24 ? `${raw.slice(0, 24)}...` : raw;
    return { ok: false, error: `"${shown}" is not a number. Use digits and at most one decimal point.` };
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

export function parseRating(text: string): Parsed<number> {
  return parseNumber(text, "the generator rating", {
    min: 0,
    minExclusive: true,
    max: MAX_RATING_KW,
    unit: " kW",
  });
}

/** The load as a fraction of the rating, from kW or percent. */
export function parseLoad(text: string, mode: LoadMode, ratingKw: number | null): Parsed<number> {
  if (mode === "percent") {
    const n = parseNumber(text, "the load", { min: 0, unit: " percent" });
    if (!n.ok) return n;
    if (n.value > 100) {
      return {
        ok: false,
        error:
          "The load is above 100 percent of the rating. A standby rating is the most the set can deliver, with no overload allowance.",
      };
    }
    return { ok: true, value: n.value / 100 };
  }
  const n = parseNumber(text, "the load", { min: 0, unit: " kW" });
  if (!n.ok) return n;
  if (ratingKw === null) return { ok: false, error: "Enter a valid generator rating first." };
  if (n.value > ratingKw) {
    return {
      ok: false,
      error: `The load is above the ${show(ratingKw)} kW rating. A standby rating is the most the set can deliver, with no overload allowance.`,
    };
  }
  return { ok: true, value: n.value / ratingKw };
}

/** Four positive consumption figures, with a warning when they do not rise with load. */
export function parseCurve(texts: string[], unitLabel: string): Parsed<{ values: number[]; warning: string | null }> {
  const values: number[] = [];
  for (let i = 0; i < LOAD_POINTS.length; i++) {
    const pct = LOAD_POINTS[i] * 100;
    const n = parseNumber(texts[i] ?? "", `the fuel use at ${pct} percent load`, {
      min: 0,
      minExclusive: true,
      max: MAX_CURVE_VALUE,
      unit: ` ${unitLabel}/h`,
    });
    if (!n.ok) return n;
    values.push(n.value);
  }
  let warning: string | null = null;
  for (let i = 1; i < values.length; i++) {
    if (values[i] <= values[i - 1]) {
      warning = `Fuel use at ${LOAD_POINTS[i] * 100} percent load is not higher than at ${LOAD_POINTS[i - 1] * 100} percent. An engine burns more fuel as load rises, so check those figures against the data sheet.`;
      break;
    }
  }
  return { ok: true, value: { values, warning } };
}

/* ------------------------------------------------------------ fuel curve */

/**
 * Fuel per hour at a load fraction from the four-point curve: linear between
 * points, and the 25 to 50 percent segment extended below 25 percent.
 */
export function interpolateCurve(curve: number[], fraction: number): Parsed<number> {
  if (curve.length !== LOAD_POINTS.length || curve.some((v) => !(v > 0) || !Number.isFinite(v))) {
    return { ok: false, error: "The fuel curve needs four positive values." };
  }
  if (!(fraction >= 0) || fraction > 1) {
    return { ok: false, error: "The load must be between 0 and 100 percent of the rating." };
  }
  let i = 0;
  if (fraction >= LOAD_POINTS[0]) {
    while (i < LOAD_POINTS.length - 2 && fraction > LOAD_POINTS[i + 1]) i++;
  }
  const x0 = LOAD_POINTS[i];
  const x1 = LOAD_POINTS[i + 1];
  const y0 = curve[i];
  const y1 = curve[i + 1];
  const value = y0 + ((fraction - x0) * (y1 - y0)) / (x1 - x0);
  if (!(value > 0)) {
    return {
      ok: false,
      error:
        "Extending the 25 and 50 percent figures down to this load gives zero fuel or less, which no running engine does. Check those two values, or enter the idle consumption from the data sheet as a higher load.",
    };
  }
  return { ok: true, value };
}

/* ------------------------------------------------------------ runtime */

export interface RuntimeInput {
  ratingKw: number;
  loadFraction: number;
  /** Fuel per hour at the four load points, display units. */
  curve: number[];
  /** Nominal tank volume in display units, or null when there is no tank. */
  tank: number | null;
  /** Usable share of the tank, 0 to 1. */
  usableFraction: number;
}

export interface RuntimeResult {
  loadKw: number;
  loadFraction: number;
  /** Fuel per hour, display units. */
  perHour: number;
  perDay: number;
  /** Electrical output per unit of fuel at this load, or null at zero load. */
  kwhPerUnit: number | null;
  /** Usable fuel in display units, or null with no tank. */
  usable: number | null;
  /** Hours on the usable fuel, or null with no tank. */
  hours: number | null;
}

export function computeRuntime(input: RuntimeInput): Parsed<RuntimeResult> {
  const perHour = interpolateCurve(input.curve, input.loadFraction);
  if (!perHour.ok) return perHour;
  const loadKw = input.ratingKw * input.loadFraction;
  const usable = input.tank === null ? null : input.tank * input.usableFraction;
  return {
    ok: true,
    value: {
      loadKw,
      loadFraction: input.loadFraction,
      perHour: perHour.value,
      perDay: perHour.value * 24,
      kwhPerUnit: loadKw > 0 ? loadKw / perHour.value : null,
      usable,
      hours: usable === null ? null : usable / perHour.value,
    },
  };
}

export interface TankSizing {
  /** Fuel burned over the target runtime, display units. */
  fuel: number;
  /** Nominal tank needed once the usable share is allowed for. */
  tank: number;
}

/** Fuel for a runtime, and the nominal tank that holds it given the usable share. */
export function tankForRuntime(perHour: number, hours: number, usableFraction: number): TankSizing {
  const fuel = perHour * hours;
  return { fuel, tank: fuel / usableFraction };
}

/* ------------------------------------------------------------ formatting */

/** A volume or rate: three significant figures below 1,000, whole and grouped above. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return "out of range";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString("en-US");
  if (value === 0) return "0";
  return value.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

/** The plain text a curve input starts with: three figures, no grouping. */
export function draftNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = roundSignificant(value);
  const text = String(rounded);
  return /e/i.test(text) ? rounded.toFixed(8).replace(/\.?0+$/, "") : text;
}

/** Hours as "53.5 h", and a days, hours, minutes reading when it is a day or more. */
export function formatHours(hours: number): { short: string; long: string | null } {
  if (!Number.isFinite(hours)) return { short: "out of range", long: null };
  const short =
    hours >= 1000
      ? `${Math.round(hours).toLocaleString("en-US")} h`
      : `${hours.toLocaleString("en-US", { maximumSignificantDigits: 3 })} h`;
  const totalMinutes = Math.round(hours * 60);
  const days = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  if (days === 0) {
    if (hours >= 1) return { short, long: `${h} h ${m} min` };
    return { short, long: `${m} min` };
  }
  return { short, long: `${days.toLocaleString("en-US")} d ${h} h ${m} min` };
}
