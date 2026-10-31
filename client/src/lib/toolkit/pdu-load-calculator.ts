/**
 * PDU load arithmetic.
 *
 * Every device is turned into a complex current on the line or lines it is
 * wired to, and the lines are summed as phasors. That is what a clamp meter
 * on a line conductor reads, and it is what the breaker sees. Adding the
 * branch currents as plain numbers is only right when every load sits at the
 * same phase angle, which a 208 V load between two lines does not: it is 30
 * degrees away from a line-to-neutral load on either of its lines.
 *
 * Reference relations, all for a balanced three-phase system:
 *   - Wye: line current equals phase current, V_LN = V_LL / sqrt(3).
 *   - Delta: V_phase = V_LL, I_line = sqrt(3) * I_phase.
 *   - Real power P = sqrt(3) * V_LL * I_line * PF (IEEE 1459 definitions).
 *
 * Phase order is ABC (L1 leads L2 leads L3 by 120 degrees). The 80 percent
 * continuous load rule is NEC 210.20(A) and 215.3: a breaker that is not
 * listed for 100 percent continuous duty carries a continuous load of no
 * more than 80 percent of its rating, which is the same thing as sizing the
 * breaker at 125 percent of the load.
 *
 * Pure functions, no React and no DOM, so the arithmetic can be tested on
 * its own.
 */

export type Topology = "single" | "wye" | "delta";
export type Connection = "SINGLE" | "LN1" | "LN2" | "LN3" | "LL12" | "LL23" | "LL31" | "BAL";
export type LoadUnit = "W" | "A";

export const SQRT3 = Math.sqrt(3);

export const TOPOLOGIES: Record<
  Topology,
  { label: string; short: string; voltages: number[]; defaultVoltage: number }
> = {
  single: { label: "Single-phase", short: "single-phase", voltages: [120, 208, 230, 240], defaultVoltage: 120 },
  wye: { label: "Three-phase wye (with neutral)", short: "wye", voltages: [208, 400, 415, 480], defaultVoltage: 208 },
  delta: { label: "Three-phase delta (no neutral)", short: "delta", voltages: [208, 400, 480], defaultVoltage: 208 },
};

/** Common breaker ratings, North American and IEC, offered as shortcuts. */
export const COMMON_BREAKERS = [15, 20, 30, 32, 40, 50, 60, 63];

export const MAX_DEVICE_ROWS = 50;
export const MAX_QUANTITY = 1000;
export const MAX_BREAKER_A = 1000;
export const MAX_WATTS_EACH = 100000;
export const MAX_AMPS_EACH = 1000;
export const MIN_PF = 0.1;
export const DEFAULT_PF = 0.95;
export const DERATE_FACTOR_NUM = 4;
export const DERATE_FACTOR_DEN = 5;
/** Current imbalance above this many percent is flagged. A common operating target, not a standard. */
export const IMBALANCE_LIMIT_PCT = 10;
/** Utilization of the continuous limit above which a line is called close to it. */
export const NEAR_LIMIT_PCT = 90;
/** Imbalance is not flagged until the average line current reaches this share of the limit. */
export const IMBALANCE_MIN_LOAD_PCT = 10;

export const CONNECTION_LABELS: Record<Connection, string> = {
  SINGLE: "The circuit",
  LN1: "L1 to neutral",
  LN2: "L2 to neutral",
  LN3: "L3 to neutral",
  LL12: "L1 to L2",
  LL23: "L2 to L3",
  LL31: "L3 to L1",
  BAL: "All three lines (balanced)",
};

/** Which connections a topology offers, in menu order. */
export function connectionsFor(topology: Topology): Connection[] {
  if (topology === "single") return ["SINGLE"];
  if (topology === "wye") return ["LN1", "LN2", "LN3", "LL12", "LL23", "LL31", "BAL"];
  return ["LL12", "LL23", "LL31", "BAL"];
}

/** Map a stored connection onto one the topology has, so switching topology never strands a row. */
export function effectiveConnection(topology: Topology, conn: Connection): Connection {
  if (topology === "single") return "SINGLE";
  if (conn === "SINGLE") return topology === "wye" ? "LN1" : "LL12";
  if (topology === "delta") {
    if (conn === "LN1") return "LL12";
    if (conn === "LN2") return "LL23";
    if (conn === "LN3") return "LL31";
  }
  return conn;
}

/** Line-to-neutral voltage of a wye system with the given line-to-line voltage. */
export function lineToNeutral(vLL: number): number {
  return vLL / SQRT3;
}

/** Voltage the device sees across its own terminals for a connection. */
export function loadVoltage(topology: Topology, voltage: number, conn: Connection): number {
  if (topology === "wye" && (conn === "LN1" || conn === "LN2" || conn === "LN3")) return lineToNeutral(voltage);
  return voltage;
}

/** Apparent power of a balanced load at a given line current, in VA. */
export function balancedApparentVa(topology: Topology, voltage: number, lineCurrentA: number): number {
  return topology === "single" ? voltage * lineCurrentA : SQRT3 * voltage * lineCurrentA;
}

/** P = sqrt(3) * V_LL * I * PF for three-phase, V * I * PF for single-phase, in watts. */
export function balancedRealW(topology: Topology, voltage: number, lineCurrentA: number, pf: number): number {
  return balancedApparentVa(topology, voltage, lineCurrentA) * pf;
}

/* ---------------------------------------------------------------- parsing */

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const PLAIN = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^[+-]?\.\d+$/;

/** A decimal number, with optional thousands commas. Null for an empty string. */
export function parseDecimal(raw: string): Parsed<number | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > 24) return { ok: false, message: "That is too long to be a number here." };
  if (!PLAIN.test(text)) return { ok: false, message: `"${text}" is not a number. Use digits, such as 30 or 12.5.` };
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { ok: false, message: `"${text}" is not a number.` };
  return { ok: true, value };
}

/** A whole number in a range. */
export function parseCount(
  raw: string,
  opts: { label: string; min: number; max: number; example: number },
): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, message: `Enter the ${opts.label}.` };
  if (text.length > 12 || !/^\d+$/.test(text.replace(/,/g, ""))) {
    return { ok: false, message: `The ${opts.label} is a whole number, such as ${opts.example}.` };
  }
  const n = Number(text.replace(/,/g, ""));
  if (n < opts.min) return { ok: false, message: `The ${opts.label} has to be at least ${opts.min}.` };
  if (n > opts.max) return { ok: false, message: `The ${opts.label} is capped at ${opts.max.toLocaleString("en-US")}.` };
  return { ok: true, value: n };
}

/** The amount for one device, in watts or amps, more than zero and under a cap. */
export function parseAmount(raw: string, unit: LoadUnit): Parsed<number> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) return { ok: false, message: unit === "W" ? "Enter the watts for one unit." : "Enter the amps for one unit." };
  if (p.value <= 0) return { ok: false, message: unit === "W" ? "Watts have to be more than 0." : "Amps have to be more than 0." };
  const cap = unit === "W" ? MAX_WATTS_EACH : MAX_AMPS_EACH;
  if (p.value > cap) {
    return { ok: false, message: `One unit is capped at ${cap.toLocaleString("en-US")} ${unit === "W" ? "W" : "A"}.` };
  }
  return { ok: true, value: p.value };
}

/** A power factor from MIN_PF to 1. Null for an empty string when allowBlank. */
export function parsePf(raw: string, allowBlank: boolean): Parsed<number | null> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) {
    return allowBlank ? { ok: true, value: null } : { ok: false, message: "Enter a power factor, such as 0.95." };
  }
  if (p.value < MIN_PF || p.value > 1) return { ok: false, message: `Power factor runs from ${MIN_PF} to 1.` };
  return { ok: true, value: p.value };
}

/** The breaker rating, in amps. */
export function parseBreaker(raw: string): Parsed<number> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) return { ok: false, message: "Enter the breaker rating in amps." };
  if (p.value < 1) return { ok: false, message: "A breaker rating is at least 1 A." };
  if (p.value > MAX_BREAKER_A) return { ok: false, message: `The breaker rating is capped at ${MAX_BREAKER_A.toLocaleString("en-US")} A.` };
  return { ok: true, value: p.value };
}

/* ----------------------------------------------------------------- phasors */

interface Cx {
  re: number;
  im: number;
}

function polar(mag: number, deg: number): Cx {
  const rad = (deg * Math.PI) / 180;
  return { re: mag * Math.cos(rad), im: mag * Math.sin(rad) };
}

function add(a: Cx, b: Cx): Cx {
  return { re: a.re + b.re, im: a.im + b.im };
}

function neg(a: Cx): Cx {
  return { re: -a.re, im: -a.im };
}

function mag(a: Cx): number {
  return Math.hypot(a.re, a.im);
}

/**
 * Angle of the voltage a connection sits across, ABC sequence, with L1 to
 * neutral as the reference. V12 = V1 - V2 leads V1 by 30 degrees.
 */
const CONN_GEOMETRY: Record<
  Connection,
  { angle: number; kind: "single" | "ln" | "ll" | "bal"; from: number; to: number }
> = {
  SINGLE: { angle: 0, kind: "single", from: 0, to: 0 },
  LN1: { angle: 0, kind: "ln", from: 0, to: 0 },
  LN2: { angle: -120, kind: "ln", from: 1, to: 1 },
  LN3: { angle: 120, kind: "ln", from: 2, to: 2 },
  LL12: { angle: 30, kind: "ll", from: 0, to: 1 },
  LL23: { angle: -90, kind: "ll", from: 1, to: 2 },
  LL31: { angle: 150, kind: "ll", from: 2, to: 0 },
  BAL: { angle: 0, kind: "bal", from: 0, to: 0 },
};

const LINE_ANGLE = [0, -120, 120];

/* --------------------------------------------------------------- analysis */

export interface PduInput {
  topology: Topology;
  /** Line-to-line for three-phase, the circuit voltage for single-phase. */
  voltage: number;
  /** Rating of the feed breaker per line, or null when not known. */
  breakerA: number | null;
  /** Apply the 80 percent continuous load rule. */
  derate: boolean;
  defaultPf: number;
}

export interface DeviceInput {
  name: string;
  qty: number;
  unit: LoadUnit;
  /** Watts or amps for one unit. For a balanced device, amps are per line. */
  amount: number;
  /** Null uses the PDU default. */
  pf: number | null;
  conn: Connection;
}

export interface DeviceResult {
  name: string;
  qty: number;
  conn: Connection;
  volts: number;
  pf: number;
  /** Current of all the units together on their connection, in amps. */
  amps: number;
  kw: number;
  kva: number;
}

export type LineStatus = "ok" | "near" | "over" | "trip" | "unknown";

export interface LineResult {
  label: string;
  /** Phasor sum, which is what the line conductor carries. */
  amps: number;
  /** The branch currents added as plain numbers, for reference. */
  plainSumA: number;
  pctOfLimit: number | null;
  pctOfBreaker: number | null;
  headroomA: number | null;
  status: LineStatus;
}

export interface BranchResult {
  conn: Connection;
  label: string;
  volts: number;
  units: number;
  amps: number;
  kw: number;
  kva: number;
}

export interface Flag {
  level: "danger" | "warn" | "info";
  text: string;
}

export interface Imbalance {
  pct: number;
  avgA: number;
  highest: string;
  lowest: string;
  flagged: boolean;
  /** True when the percentage is above the target but the load is too light to matter. */
  suppressed: boolean;
}

export interface Analysis {
  topology: Topology;
  voltage: number;
  vLN: number | null;
  breakerA: number | null;
  limitA: number | null;
  lines: LineResult[];
  neutralA: number | null;
  branches: BranchResult[];
  devices: DeviceResult[];
  units: number;
  kw: number;
  kvar: number;
  kva: number;
  /** Overall power factor of the load, or null with no load. */
  pf: number | null;
  capacity: { kva: number; kw: number; pf: number } | null;
  imbalance: Imbalance | null;
  flags: Flag[];
}

/** The continuous limit for a breaker, in amps. Exact for whole-number ratings. */
export function continuousLimitA(breakerA: number, derate: boolean): number {
  return derate ? (breakerA * DERATE_FACTOR_NUM) / DERATE_FACTOR_DEN : breakerA;
}

/** Round to the display precision before comparing, so 24.0000000001 A is not "over" 24 A. */
function cmp(a: number): number {
  return Math.round(a * 1000);
}

function amp(n: number): string {
  return `${Number(n.toFixed(n < 10 ? 2 : 1))} A`;
}

export function analyzePdu(pdu: PduInput, input: DeviceInput[]): Analysis {
  const topology = pdu.topology;
  const info = TOPOLOGIES[topology];
  const voltage = info.voltages.includes(pdu.voltage) ? pdu.voltage : info.defaultVoltage;
  const three = topology !== "single";
  const limitA = pdu.breakerA === null ? null : continuousLimitA(pdu.breakerA, pdu.derate);
  const defaultPf = pdu.defaultPf >= MIN_PF && pdu.defaultPf <= 1 ? pdu.defaultPf : DEFAULT_PF;

  const lineCount = three ? 3 : 1;
  const lineSum: Cx[] = Array.from({ length: lineCount }, () => ({ re: 0, im: 0 }));
  const plain: number[] = Array.from({ length: lineCount }, () => 0);
  let neutral: Cx = { re: 0, im: 0 };

  const devices: DeviceResult[] = [];
  const branchMap = new Map<Connection, { cur: Cx; units: number; kw: number; volts: number }>();
  let totalP = 0;
  let totalQ = 0;
  let units = 0;

  for (const d of input) {
    if (!(d.qty > 0) || !(d.amount > 0) || !Number.isFinite(d.qty) || !Number.isFinite(d.amount)) continue;
    const conn = effectiveConnection(topology, d.conn);
    const geo = CONN_GEOMETRY[conn];
    const pf = d.pf !== null && d.pf >= MIN_PF && d.pf <= 1 ? d.pf : defaultPf;
    const sinPhi = Math.sqrt(Math.max(0, 1 - pf * pf));
    const phiDeg = (Math.acos(pf) * 180) / Math.PI;
    const volts = loadVoltage(topology, voltage, conn);
    // A balanced device is three equal loads: its voltage factor is sqrt(3) * V_LL.
    const vFactor = geo.kind === "bal" ? SQRT3 * voltage : volts;

    let realW: number;
    let apparentVa: number;
    let amps: number;
    if (d.unit === "W") {
      realW = d.amount * d.qty;
      apparentVa = realW / pf;
      amps = apparentVa / vFactor;
    } else {
      amps = d.amount * d.qty;
      apparentVa = vFactor * amps;
      realW = apparentVa * pf;
    }
    const reactiveVar = apparentVa * sinPhi;
    totalP += realW;
    totalQ += reactiveVar;
    units += d.qty;

    // Lagging load: the current trails the voltage it sits across by phi.
    if (geo.kind === "single") {
      lineSum[0] = add(lineSum[0], polar(amps, -phiDeg));
      plain[0] += amps;
    } else if (geo.kind === "ln") {
      const i = polar(amps, geo.angle - phiDeg);
      lineSum[geo.from] = add(lineSum[geo.from], i);
      plain[geo.from] += amps;
      neutral = add(neutral, neg(i));
    } else if (geo.kind === "ll") {
      const i = polar(amps, geo.angle - phiDeg);
      lineSum[geo.from] = add(lineSum[geo.from], i);
      lineSum[geo.to] = add(lineSum[geo.to], neg(i));
      plain[geo.from] += amps;
      plain[geo.to] += amps;
    } else {
      for (let k = 0; k < 3; k++) {
        lineSum[k] = add(lineSum[k], polar(amps, LINE_ANGLE[k] - phiDeg));
        plain[k] += amps;
      }
    }

    devices.push({ name: d.name, qty: d.qty, conn, volts: geo.kind === "bal" ? voltage : volts, pf, amps, kw: realW / 1000, kva: apparentVa / 1000 });

    // Loads sharing a connection share a voltage angle, so they add as phasors
    // there too. A balanced device is reported per line, at its own angle.
    const slot = branchMap.get(conn) ?? { cur: { re: 0, im: 0 }, units: 0, kw: 0, volts: geo.kind === "bal" ? voltage : volts };
    slot.cur = add(slot.cur, polar(amps, geo.angle - phiDeg));
    slot.units += d.qty;
    slot.kw += realW / 1000;
    branchMap.set(conn, slot);
  }

  const kva = Math.hypot(totalP, totalQ) / 1000;
  const kw = totalP / 1000;
  const kvar = totalQ / 1000;
  const pf = kva > 0 ? kw / kva : null;

  const labels = three ? ["L1", "L2", "L3"] : ["Feed"];
  const lines: LineResult[] = lineSum.map((c, k) => {
    const amps = mag(c);
    let status: LineStatus = "unknown";
    let pctOfLimit: number | null = null;
    let pctOfBreaker: number | null = null;
    let headroomA: number | null = null;
    if (pdu.breakerA !== null && limitA !== null) {
      pctOfLimit = (amps / limitA) * 100;
      pctOfBreaker = (amps / pdu.breakerA) * 100;
      headroomA = limitA - amps;
      status =
        cmp(amps) > cmp(pdu.breakerA)
          ? "trip"
          : cmp(amps) > cmp(limitA)
            ? "over"
            : pctOfLimit >= NEAR_LIMIT_PCT
              ? "near"
              : "ok";
    }
    return { label: labels[k], amps, plainSumA: plain[k], pctOfLimit, pctOfBreaker, headroomA, status };
  });

  const order: Connection[] = ["SINGLE", "LN1", "LN2", "LN3", "LL12", "LL23", "LL31", "BAL"];
  const branches: BranchResult[] = order.flatMap((conn) => {
    const slot = branchMap.get(conn);
    if (!slot) return [];
    const amps = mag(slot.cur);
    const volts = conn === "BAL" ? voltage : slot.volts;
    const kvaBranch = conn === "BAL" ? (SQRT3 * voltage * amps) / 1000 : (volts * amps) / 1000;
    return [{ conn, label: CONNECTION_LABELS[conn], volts, units: slot.units, amps, kw: slot.kw, kva: kvaBranch }];
  });

  const neutralA = topology === "wye" ? mag(neutral) : null;

  const capacityPf = pf ?? defaultPf;
  const capacity =
    limitA === null
      ? null
      : (() => {
          const capKva = balancedApparentVa(topology, voltage, limitA) / 1000;
          return { kva: capKva, kw: capKva * capacityPf, pf: capacityPf };
        })();

  // Current imbalance, as NEMA MG 1 defines voltage unbalance: the largest
  // departure from the mean, as a percentage of the mean.
  let imbalance: Imbalance | null = null;
  if (three && devices.length > 0) {
    const amps = lines.map((l) => l.amps);
    const avg = amps.reduce((a, b) => a + b, 0) / amps.length;
    if (avg > 0) {
      let maxDev = 0;
      amps.forEach((a) => {
        maxDev = Math.max(maxDev, Math.abs(a - avg));
      });
      const pct = (maxDev / avg) * 100;
      const hi = amps.indexOf(Math.max(...amps));
      const lo = amps.indexOf(Math.min(...amps));
      const light = limitA !== null && avg < (limitA * IMBALANCE_MIN_LOAD_PCT) / 100;
      const over = pct > IMBALANCE_LIMIT_PCT;
      imbalance = { pct, avgA: avg, highest: labels[hi], lowest: labels[lo], flagged: over && !light, suppressed: over && light };
    }
  }

  const flags: Flag[] = [];
  if (pdu.breakerA !== null && limitA !== null) {
    const limitText = pdu.derate
      ? `${amp(limitA)} continuous limit (80% of the ${amp(pdu.breakerA)} breaker)`
      : `${amp(limitA)} breaker rating`;
    for (const line of lines) {
      const who = three ? line.label : "The feed";
      if (line.status === "trip") {
        flags.push({
          level: "danger",
          text: `${who} carries ${amp(line.amps)}, above the ${amp(pdu.breakerA)} breaker rating. Held for long, that trips the breaker.`,
        });
      } else if (line.status === "over") {
        flags.push({
          level: "danger",
          text: `${who} carries ${amp(line.amps)}, above the ${limitText}. ${
            three ? "Move load to a lighter line or use a larger feed." : "Remove load or use a larger feed."
          }`,
        });
      } else if (line.status === "near" && line.pctOfLimit !== null) {
        flags.push({
          level: "warn",
          text: `${who} is at ${Math.round(line.pctOfLimit)}% of the continuous limit, which leaves little room to add anything.`,
        });
      }
    }
    if (neutralA !== null && cmp(neutralA) > cmp(limitA)) {
      flags.push({
        level: "warn",
        text: `Neutral current is ${amp(neutralA)}, above ${amp(limitA)}. Check the neutral rating on the PDU nameplate.`,
      });
    }
  }
  if (imbalance && imbalance.flagged) {
    flags.push({
      level: "warn",
      text: `Line currents differ from their average by up to ${Math.round(imbalance.pct)}%, and ${IMBALANCE_LIMIT_PCT}% or less is the usual target. ${imbalance.highest} is the heaviest and ${imbalance.lowest} the lightest, so move load from ${imbalance.highest} toward ${imbalance.lowest}.`,
    });
  }
  if (devices.length === 0) {
    flags.push({ level: "info", text: "No devices entered yet." });
  }

  return {
    topology,
    voltage,
    vLN: topology === "wye" ? lineToNeutral(voltage) : null,
    breakerA: pdu.breakerA,
    limitA,
    lines,
    neutralA,
    branches,
    devices,
    units,
    kw,
    kvar,
    kva,
    pf,
    capacity,
    imbalance,
    flags,
  };
}
