/**
 * PoE power budget arithmetic.
 *
 * Class and type figures come from IEEE 802.3: Clause 33 for Type 1
 * (802.3af) and Type 2 (802.3at), Clause 145 for Type 3 and Type 4
 * (802.3bt). Power is held in integer milliwatts throughout so that
 * adding up 0.1 W class figures cannot drift by a float rounding error and
 * report a budget as exceeded by 0.0000000001 W.
 *
 * Pure functions, no React and no DOM, so the arithmetic can be tested on
 * its own.
 */

export type PseType = 1 | 2 | 3 | 4;

export interface PoeClass {
  /** Physical layer class, 0 to 8. */
  cls: number;
  /** PClass: the most the PSE outputs on a port for this class, in mW. */
  pseMw: number;
  /** PClass_PD: the most the PD may draw at its input, in mW. */
  pdMw: number;
  /** The lowest PSE type that can deliver this class. */
  type: PseType;
  /** Pairs carrying power in the worst case the class figures assume. */
  pairs: 2 | 4;
}

/** Class power at the PSE and at the PD, from IEEE 802.3 Clause 33 (classes 0 to 4) and Clause 145 (5 to 8). */
export const POE_CLASSES: readonly PoeClass[] = [
  { cls: 0, pseMw: 15400, pdMw: 12950, type: 1, pairs: 2 },
  { cls: 1, pseMw: 4000, pdMw: 3840, type: 1, pairs: 2 },
  { cls: 2, pseMw: 7000, pdMw: 6490, type: 1, pairs: 2 },
  { cls: 3, pseMw: 15400, pdMw: 12950, type: 1, pairs: 2 },
  { cls: 4, pseMw: 30000, pdMw: 25500, type: 2, pairs: 2 },
  { cls: 5, pseMw: 45000, pdMw: 40000, type: 3, pairs: 4 },
  { cls: 6, pseMw: 60000, pdMw: 51000, type: 3, pairs: 4 },
  { cls: 7, pseMw: 75000, pdMw: 62000, type: 4, pairs: 4 },
  { cls: 8, pseMw: 90000, pdMw: 71300, type: 4, pairs: 4 },
];

export interface PseTypeInfo {
  type: PseType;
  standard: string;
  label: string;
  /** Highest class this type of PSE can assign. */
  maxClass: number;
  /** Most power one port can output, in mW. */
  portMw: number;
  /** Lowest output voltage the PSE may use at that power, in volts. */
  vMin: number;
  /** Worst case channel DC loop resistance per pair set at 100 m, in ohms. */
  loopOhms: number;
  pairs: 2 | 4;
}

export const PSE_TYPES: Record<PseType, PseTypeInfo> = {
  1: { type: 1, standard: "802.3af", label: "Type 1, 802.3af (15.4 W)", maxClass: 3, portMw: 15400, vMin: 44, loopOhms: 20, pairs: 2 },
  2: { type: 2, standard: "802.3at", label: "Type 2, 802.3at (30 W)", maxClass: 4, portMw: 30000, vMin: 50, loopOhms: 12.5, pairs: 2 },
  3: { type: 3, standard: "802.3bt", label: "Type 3, 802.3bt (60 W)", maxClass: 6, portMw: 60000, vMin: 50, loopOhms: 12.5, pairs: 4 },
  4: { type: 4, standard: "802.3bt", label: "Type 4, 802.3bt (90 W)", maxClass: 8, portMw: 90000, vMin: 52, loopOhms: 12.5, pairs: 4 },
};

/** Highest PSE output voltage any type may use. */
export const PSE_VMAX = 57;

export const MAX_DEVICE_ROWS = 50;
export const MAX_QUANTITY = 1000;
export const MAX_PORTS = 1000;
export const MAX_BUDGET_W = 100000;
/** No 802.3 port outputs more than 90 W, so anything over this is a typo. */
export const MAX_MEASURED_W = 100;
export const MAX_CABLE_M = 100;

export function poeClass(cls: number): PoeClass {
  return POE_CLASSES[Math.min(8, Math.max(0, Math.trunc(cls)))] ?? POE_CLASSES[0];
}

/* ---------------------------------------------------------------- parsing */

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const PLAIN = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^[+-]?\.\d+$/;

/** A decimal number, with optional thousands commas. Null for an empty string. */
export function parseDecimal(raw: string): Parsed<number | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > 24) return { ok: false, message: "That is too long to be a number here." };
  if (!PLAIN.test(text)) return { ok: false, message: `"${text}" is not a number. Use digits, such as 370 or 12.5.` };
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { ok: false, message: `"${text}" is not a number.` };
  return { ok: true, value };
}

/** Watts, converted to integer milliwatts and range checked. */
export function parseWattsMw(
  raw: string,
  opts: { label: string; min?: number; max: number; required: boolean; allowZero?: boolean },
): Parsed<number | null> {
  const parsed = parseDecimal(raw);
  if (!parsed.ok) return parsed;
  if (parsed.value === null) {
    return opts.required ? { ok: false, message: `Enter the ${opts.label}.` } : { ok: true, value: null };
  }
  const w = parsed.value;
  if (w < 0) return { ok: false, message: `The ${opts.label} cannot be negative.` };
  if (w === 0 && !opts.allowZero) return { ok: false, message: `The ${opts.label} has to be more than 0 W.` };
  if (w > opts.max) return { ok: false, message: `The ${opts.label} is capped at ${opts.max.toLocaleString("en-US")} W.` };
  return { ok: true, value: Math.round(w * 1000) };
}

/** A whole number in a range. Null for an empty string when not required. */
export function parseCount(
  raw: string,
  opts: { label: string; min: number; max: number; required: boolean; example: number },
): Parsed<number | null> {
  const text = raw.trim();
  if (text === "") {
    return opts.required ? { ok: false, message: `Enter the ${opts.label}.` } : { ok: true, value: null };
  }
  if (text.length > 12 || !/^\d+$/.test(text.replace(/,/g, ""))) {
    return { ok: false, message: `The ${opts.label} is a whole number, such as ${opts.example}.` };
  }
  const n = Number(text.replace(/,/g, ""));
  if (n < opts.min) return { ok: false, message: `The ${opts.label} has to be at least ${opts.min}.` };
  if (n > opts.max) return { ok: false, message: `The ${opts.label} is capped at ${opts.max.toLocaleString("en-US")}.` };
  return { ok: true, value: n };
}

/* ----------------------------------------------------------------- budget */

export interface DeviceLineInput {
  name: string;
  qty: number;
  cls: number;
  /** What the switch reports the port drawing, in mW, or null if unknown. */
  measuredMw: number | null;
}

export type FlagLevel = "danger" | "warn" | "info";

export interface Flag {
  level: FlagLevel;
  text: string;
}

export interface DeviceLineResult {
  name: string;
  qty: number;
  cls: number;
  /** The class the PSE actually assigns, after any demotion. */
  assignedClass: number;
  demoted: boolean;
  /** Reserved per device by class, at the PSE, in mW. */
  allocEachMw: number;
  /** Measured per device, or the allocation when nothing was measured. */
  actualEachMw: number;
  measured: boolean;
  allocMw: number;
  actualMw: number;
  flags: Flag[];
}

export interface SwitchInput {
  budgetMw: number | null;
  ports: number | null;
  pseType: PseType;
}

export interface BudgetResult {
  lines: DeviceLineResult[];
  devices: number;
  measuredDevices: number;
  allocMw: number;
  actualMw: number;
  /** Budget minus allocation; negative when over. Null with no budget. */
  allocHeadroomMw: number | null;
  actualHeadroomMw: number | null;
  allocOver: boolean;
  actualOver: boolean;
  portsOver: boolean;
  /** Ports the budget could run at full port power at once. */
  fullPowerPorts: number | null;
  /** More devices at the port maximum that would still fit by class. */
  moreAtPortMax: number | null;
  flags: Flag[];
}

export function wattsText(mw: number, digits = 1): string {
  return `${(mw / 1000).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} W`;
}

function deviceWord(n: number): string {
  return n === 1 ? "device" : "devices";
}

export function analyzeLine(line: DeviceLineInput, pseType: PseType): DeviceLineResult {
  const port = PSE_TYPES[pseType];
  const requested = poeClass(line.cls);
  const demoted = requested.cls > port.maxClass;
  // A PSE that cannot supply the requested class assigns the highest class it
  // has (802.3bt power demotion; an 802.3af PSE reads class 4 as class 0).
  // Either way the port reserves its own maximum.
  const assigned = demoted ? poeClass(port.maxClass) : requested;
  const allocEachMw = assigned.pseMw;
  const measured = line.measuredMw !== null;
  const actualEachMw = measured ? (line.measuredMw as number) : allocEachMw;
  const flags: Flag[] = [];

  if (demoted) {
    flags.push({
      level: "warn",
      text:
        `Class ${requested.cls} needs a Type ${requested.type} PSE. A Type ${pseType} port assigns at most class ${port.maxClass}, ` +
        `so it reserves ${wattsText(assigned.pseMw)} and the device gets ${wattsText(assigned.pdMw, 2)} at worst case. ` +
        `It has to run within that, in a reduced power mode if it has one, or it will not come up.`,
    });
  }
  if (measured) {
    const m = line.measuredMw as number;
    if (m > port.portMw) {
      flags.push({
        level: "danger",
        text: `Measured ${wattsText(m)} is more than a Type ${pseType} port can output (${wattsText(port.portMw)}). Check the reading and the port type.`,
      });
    } else if (m > assigned.pseMw) {
      flags.push({
        level: "danger",
        text:
          `Measured ${wattsText(m)} is above the ${wattsText(assigned.pseMw)} that class ${assigned.cls} allows at the port. ` +
          `A PSE removes power from a port that overloads its assigned class for too long.`,
      });
    }
  }

  return {
    name: line.name,
    qty: line.qty,
    cls: requested.cls,
    assignedClass: assigned.cls,
    demoted,
    allocEachMw,
    actualEachMw,
    measured,
    allocMw: allocEachMw * line.qty,
    actualMw: actualEachMw * line.qty,
    flags,
  };
}

export function analyzeBudget(sw: SwitchInput, input: DeviceLineInput[]): BudgetResult {
  const lines = input.slice(0, MAX_DEVICE_ROWS).map((line) => analyzeLine(line, sw.pseType));
  let devices = 0;
  let measuredDevices = 0;
  let allocMw = 0;
  let actualMw = 0;
  for (const line of lines) {
    devices += line.qty;
    if (line.measured) measuredDevices += line.qty;
    allocMw += line.allocMw;
    actualMw += line.actualMw;
  }

  const port = PSE_TYPES[sw.pseType];
  const budget = sw.budgetMw;
  const allocHeadroomMw = budget === null ? null : budget - allocMw;
  const actualHeadroomMw = budget === null ? null : budget - actualMw;
  const allocOver = allocHeadroomMw !== null && allocHeadroomMw < 0;
  const actualOver = actualHeadroomMw !== null && actualHeadroomMw < 0;
  const portsOver = sw.ports !== null && devices > sw.ports;
  const fullPowerPorts = budget === null ? null : Math.floor(budget / port.portMw);
  const moreAtPortMax =
    allocHeadroomMw === null ? null : allocHeadroomMw <= 0 ? 0 : Math.floor(allocHeadroomMw / port.portMw);

  const flags: Flag[] = [];
  if (budget !== null && devices > 0) {
    if (actualOver) {
      flags.push({
        level: "danger",
        text:
          `Even the measured draw, ${wattsText(actualMw)}, is ${wattsText(-(actualHeadroomMw as number))} over the ` +
          `${wattsText(budget)} budget. The switch will shed ports, lowest priority first.`,
      });
    } else if (allocOver) {
      flags.push({
        level: "warn",
        text:
          `Reserved by class, these devices need ${wattsText(allocMw)}, ${wattsText(-(allocHeadroomMw as number))} over the ` +
          `${wattsText(budget)} budget. A switch that allocates by class will refuse power to the ports that do not fit, ` +
          `even though the ${measuredDevices > 0 ? "measured" : "estimated"} draw of ${wattsText(actualMw)} would fit.`,
      });
    }
  }
  if (portsOver && sw.ports !== null) {
    flags.push({
      level: "danger",
      text: `${devices.toLocaleString("en-US")} ${deviceWord(devices)} but only ${sw.ports.toLocaleString("en-US")} PoE ${sw.ports === 1 ? "port" : "ports"}.`,
    });
  }

  return {
    lines,
    devices,
    measuredDevices,
    allocMw,
    actualMw,
    allocHeadroomMw,
    actualHeadroomMw,
    allocOver,
    actualOver,
    portsOver,
    fullPowerPorts,
    moreAtPortMax,
    flags,
  };
}

/* ------------------------------------------------------------- cable loss */

export interface CableInput {
  /** Power the PD draws at its input, in watts. */
  pdW: number;
  /** Channel length in meters, 0 to 100. */
  lengthM: number;
  /** PSE output voltage, in volts. */
  voltage: number;
  /** DC loop resistance of one pair set over 100 m, in ohms. */
  loopOhmsPer100m: number;
  /** 2 for two-pair powering, 4 for four-pair. */
  pairs: 2 | 4;
}

export interface CableResult {
  /** Total current out of the PSE, in amps. */
  currentA: number;
  /** Current in each pair set, in amps. */
  perPairSetA: number;
  /** Loop resistance of one pair set at this length, in ohms. */
  loopOhms: number;
  lossW: number;
  pseW: number;
  /** PD power over PSE power. */
  efficiency: number;
  /** Most the PD could receive at this voltage and resistance. */
  maxPdW: number;
}

/**
 * Power the PSE must output for a PD drawing pdW at the far end.
 *
 * The PD sees P_PD = V*I - I^2 * R_eff, where R_eff is the loop resistance
 * of one pair set divided by the number of pair sets sharing the current
 * (two for four-pair powering). Solving that quadratic for I and taking the
 * smaller root gives the operating point. With 802.3's worst case inputs
 * (44 V and 20 ohm for Type 1, 50 V and 12.5 ohm for Type 2 and 3, 52 V for
 * Type 4) it returns the PClass figures exactly: 12.95 W at the PD needs
 * 15.4 W at the PSE, 25.5 W needs 30 W, 71.3 W needs 90 W.
 */
export function cableLoss(input: CableInput): Parsed<CableResult> {
  const { pdW, lengthM, voltage, loopOhmsPer100m, pairs } = input;
  if (![pdW, lengthM, voltage, loopOhmsPer100m].every(Number.isFinite)) {
    return { ok: false, message: "Every field needs a number." };
  }
  if (pdW <= 0) return { ok: false, message: "The device draw has to be more than 0 W." };
  if (voltage <= 0) return { ok: false, message: "The voltage has to be more than 0 V." };
  if (lengthM < 0 || loopOhmsPer100m < 0) return { ok: false, message: "Length and resistance cannot be negative." };

  const pairSets = pairs === 4 ? 2 : 1;
  const loopOhms = (loopOhmsPer100m * lengthM) / 100;
  const rEff = loopOhms / pairSets;
  const maxPdW = rEff === 0 ? Number.POSITIVE_INFINITY : (voltage * voltage) / (4 * rEff);

  let currentA: number;
  if (rEff === 0) {
    currentA = pdW / voltage;
  } else {
    const disc = voltage * voltage - 4 * rEff * pdW;
    if (disc < 0) {
      return {
        ok: false,
        message:
          `${pdW} W cannot reach the device at ${voltage} V through ${loopOhms.toFixed(2)} ohm of loop resistance. ` +
          `The most that circuit can deliver is ${maxPdW.toFixed(1)} W, and only by wasting as much again in the cable.`,
      };
    }
    // The smaller root: the other one is the same power delivered at a
    // current so high that more is lost in the cable than reaches the PD.
    currentA = (voltage - Math.sqrt(disc)) / (2 * rEff);
  }
  const pseW = voltage * currentA;
  const lossW = pseW - pdW;
  return {
    ok: true,
    value: {
      currentA,
      perPairSetA: currentA / pairSets,
      loopOhms,
      lossW,
      pseW,
      efficiency: pdW / pseW,
      maxPdW,
    },
  };
}

/** The worst case parameters 802.3 assumes for a class. */
export function worstCaseFor(cls: number): { voltage: number; loopOhmsPer100m: number; pairs: 2 | 4; type: PseType } {
  const c = poeClass(cls);
  const t = PSE_TYPES[c.type];
  return { voltage: t.vMin, loopOhmsPer100m: t.loopOhms, pairs: c.pairs, type: c.type };
}
