/**
 * Server power supply sizing.
 *
 * Totals the DC load of a parts list, sizes each supply so the survivors of
 * a failure still carry peak load plus a margin, and reads efficiency off
 * the 80 PLUS certification points to turn DC load into wall power.
 *
 * Efficiency figures are the program's minimum requirements at 10, 20, 50
 * and 100 percent of rated load, from the 80 PLUS (CLEAResult) tables for
 * 115 V internal, 230 V EU internal and 230 V internal redundant supplies.
 * Between certified points this interpolates linearly. Below the lowest
 * point the program sets no requirement, so the result is flagged rather
 * than extrapolated.
 *
 * No React or DOM here, so the arithmetic is unit tested on its own.
 */

import { HOURS_PER_YEAR } from "../buildCosts";
import { BTU_PER_WATT } from "../capacity";

export { BTU_PER_WATT, HOURS_PER_YEAR };

/* -------------------------------------------------------------- efficiency */

export type Standard = "115v" | "230v-eu" | "230v-redundant";
export type Tier = "standard" | "bronze" | "silver" | "gold" | "platinum" | "titanium";

export const STANDARDS: { id: Standard; label: string; note: string }[] = [
  { id: "115v", label: "115 V internal", note: "North American line voltage, non-redundant supplies." },
  { id: "230v-eu", label: "230 V EU internal", note: "230 V line, non-redundant supplies." },
  {
    id: "230v-redundant",
    label: "230 V internal redundant",
    note: "Hot-swap data center supplies. There is no base 80 PLUS level in this program.",
  },
];

export const TIERS: { id: Tier; label: string }[] = [
  { id: "standard", label: "80 PLUS" },
  { id: "bronze", label: "80 PLUS Bronze" },
  { id: "silver", label: "80 PLUS Silver" },
  { id: "gold", label: "80 PLUS Gold" },
  { id: "platinum", label: "80 PLUS Platinum" },
  { id: "titanium", label: "80 PLUS Titanium" },
];

/** Load fractions the program certifies. Only Titanium is tested at 10 percent. */
export const LOAD_POINTS = [0.1, 0.2, 0.5, 1] as const;

type Row = [number | null, number, number, number];

/** Minimum efficiency in percent at 10, 20, 50 and 100 percent load. */
export const EFFICIENCY_TABLE: Record<Standard, Partial<Record<Tier, Row>>> = {
  "115v": {
    standard: [null, 80, 80, 80],
    bronze: [null, 82, 85, 82],
    silver: [null, 85, 88, 85],
    gold: [null, 87, 90, 87],
    platinum: [null, 90, 92, 89],
    titanium: [90, 92, 94, 90],
  },
  "230v-eu": {
    standard: [null, 82, 85, 82],
    bronze: [null, 85, 88, 85],
    silver: [null, 87, 90, 87],
    gold: [null, 90, 92, 89],
    platinum: [null, 92, 94, 90],
    titanium: [90, 94, 96, 94],
  },
  "230v-redundant": {
    bronze: [null, 81, 85, 81],
    silver: [null, 85, 89, 85],
    gold: [null, 88, 92, 88],
    platinum: [null, 90, 94, 91],
    titanium: [90, 94, 96, 91],
  },
};

export function tierAvailable(standard: Standard, tier: Tier): boolean {
  return EFFICIENCY_TABLE[standard][tier] !== undefined;
}

export interface CurvePoint {
  load: number;
  efficiency: number;
}

/** The certified points for a tier as fractions, lowest load first. */
export function curve(standard: Standard, tier: Tier): CurvePoint[] {
  const row = EFFICIENCY_TABLE[standard][tier];
  if (!row) return [];
  const out: CurvePoint[] = [];
  row.forEach((pct, i) => {
    if (pct !== null) out.push({ load: LOAD_POINTS[i], efficiency: pct / 100 });
  });
  return out;
}

export type Region = "below" | "certified" | "over";

export interface EfficiencyReading {
  efficiency: number;
  region: Region;
}

/**
 * Efficiency at a load fraction. Linear between certified points; below the
 * lowest one it returns that point's figure and says so, because the real
 * curve keeps falling there and the program does not say how far.
 */
export function efficiencyAt(points: CurvePoint[], load: number): EfficiencyReading {
  if (points.length === 0 || !Number.isFinite(load)) return { efficiency: NaN, region: "certified" };
  const first = points[0];
  const last = points[points.length - 1];
  if (load < first.load) return { efficiency: first.efficiency, region: "below" };
  if (load > last.load) return { efficiency: last.efficiency, region: "over" };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (load <= b.load) {
      const t = (load - a.load) / (b.load - a.load);
      return { efficiency: a.efficiency + t * (b.efficiency - a.efficiency), region: "certified" };
    }
  }
  return { efficiency: last.efficiency, region: "certified" };
}

/* -------------------------------------------------------------- components */

export type ComponentKind = "cpu" | "gpu" | "ram" | "nvme" | "ssd" | "hdd" | "fan" | "nic" | "board" | "other";

export interface ComponentPreset {
  kind: ComponentKind;
  label: string;
  /** Watts per unit. */
  typical: number;
  peak: number;
  /** For CPUs and GPUs: the rating the typical and peak figures derive from. */
  rated?: number;
  hint: string;
}

/** Typical and peak as multiples of a CPU's TDP or a GPU's board power. */
export const RATED_FACTORS: Partial<Record<ComponentKind, { typical: number; peak: number; ratingName: string }>> = {
  cpu: { typical: 0.6, peak: 1.2, ratingName: "TDP" },
  gpu: { typical: 0.8, peak: 1, ratingName: "Board power" },
};

export const PRESETS: Record<ComponentKind, ComponentPreset> = {
  cpu: {
    kind: "cpu",
    label: "CPU",
    rated: 205,
    typical: 123,
    peak: 246,
    hint: "Typical is 60 percent of TDP, a busy server that is not saturated. Peak is 1.2 times TDP to allow for short turbo excursions above the sustained limit; check the platform's configured power limits.",
  },
  gpu: {
    kind: "gpu",
    label: "GPU",
    rated: 300,
    typical: 240,
    peak: 300,
    hint: "Typical is 80 percent of board power. Training jobs hold a GPU near full board power for hours, so raise it for that. Millisecond spikes are handled separately below.",
  },
  ram: { kind: "ram", label: "DDR5 RDIMM", typical: 6, peak: 12, hint: "Per module. Larger and faster modules draw more." },
  nvme: { kind: "nvme", label: "NVMe U.2 SSD", typical: 12, peak: 25, hint: "Enterprise U.2 drives commonly allow up to 25 W in their highest power state." },
  ssd: { kind: "ssd", label: "SATA SSD", typical: 3, peak: 6, hint: "Per drive." },
  hdd: {
    kind: "hdd",
    label: "3.5 in HDD",
    typical: 8,
    peak: 25,
    hint: "Peak is the spin-up surge, mostly on the 12 V rail. Staggered spin-up lets a controller start drives in groups so the surges do not coincide.",
  },
  fan: { kind: "fan", label: "Fan", typical: 5, peak: 18, hint: "High static pressure server fans draw several times more at full speed than at idle." },
  nic: { kind: "nic", label: "NIC, 2 x 25 GbE", typical: 12, peak: 18, hint: "Optics or active cables add a few watts per port." },
  board: { kind: "board", label: "Motherboard and BMC", typical: 40, peak: 60, hint: "Chipset, BMC, voltage regulators and the board's own losses." },
  other: { kind: "other", label: "Other", typical: 10, peak: 15, hint: "RAID or HBA card, riser, anything else." },
};

export const KIND_ORDER: ComponentKind[] = ["cpu", "gpu", "ram", "nvme", "ssd", "hdd", "fan", "nic", "board", "other"];

export interface ComponentLoad {
  kind: ComponentKind;
  qty: number;
  typical: number;
  peak: number;
}

export interface Totals {
  typical: number;
  peak: number;
  gpuPeak: number;
}

export function totals(rows: ComponentLoad[]): Totals {
  let typical = 0;
  let peak = 0;
  let gpuPeak = 0;
  for (const r of rows) {
    typical += r.qty * r.typical;
    peak += r.qty * r.peak;
    if (r.kind === "gpu") gpuPeak += r.qty * r.peak;
  }
  return { typical, peak, gpuPeak };
}

/** Typical and peak watts derived from a CPU TDP or GPU board power, rounded to whole watts. */
export function fromRating(kind: ComponentKind, rated: number): { typical: number; peak: number } | null {
  const f = RATED_FACTORS[kind];
  if (!f) return null;
  return { typical: Math.round(rated * f.typical), peak: Math.round(rated * f.peak) };
}

/* ----------------------------------------------------------------- sizing */

export type Redundancy = "none" | "1+1" | "n+1" | "n+n";

/** Ratings in common use for server and workstation supplies, in watts. */
export const COMMON_RATINGS = [
  300, 400, 450, 500, 550, 650, 750, 800, 850, 1000, 1100, 1200, 1300, 1400, 1600, 1800, 2000, 2200, 2400, 2600, 2700,
  2800, 3000, 3200, 3600,
];

export const MAX_N = 8;

/** Supplies installed, and supplies left to carry the load after the failure the scheme tolerates. */
export function supplyCounts(redundancy: Redundancy, n: number): { installed: number; carrying: number } {
  if (redundancy === "1+1") return { installed: 2, carrying: 1 };
  if (redundancy === "n+1") return { installed: n + 1, carrying: n };
  if (redundancy === "n+n") return { installed: 2 * n, carrying: n };
  return { installed: n, carrying: n };
}

export interface SizingInput {
  typicalW: number;
  peakW: number;
  gpuPeakW: number;
  /** Headroom above peak, percent. */
  marginPct: number;
  redundancy: Redundancy;
  n: number;
  standard: Standard;
  tier: Tier;
  /** A specific rating to evaluate instead of the recommendation. */
  ratingW: number | null;
  /** Multiple of GPU peak reached by millisecond transients. 1 ignores them. */
  transientFactor: number;
  pricePerKwh: number;
}

export interface OperatingPoint {
  /** Total DC load across all supplies. */
  dcW: number;
  perPsuW: number;
  loadFraction: number;
  efficiency: number;
  region: Region;
  /** What the supplies draw from the wall, together. */
  wallW: number;
  lossW: number;
}

export interface SizingResult {
  installed: number;
  carrying: number;
  /** Continuous rating each supply needs. */
  requiredPerPsuW: number;
  /** Smallest common rating at or above the requirement, or null if none is large enough. */
  recommendedW: number | null;
  /** The rating the operating points are computed for. */
  evaluatedW: number;
  typical: OperatingPoint;
  peak: OperatingPoint;
  /** Load on each survivor at peak after the tolerated failure, or null with no redundancy. */
  afterFailure: { perPsuW: number; loadFraction: number } | null;
  /** Capacity left after the tolerated failure, over peak load, minus one. */
  headroomFraction: number;
  annualKwh: number;
  annualCost: number;
  btuPerHourTypical: number;
  btuPerHourPeak: number;
  transient: { watts: number; capacityW: number; ratio: number } | null;
}

function operatingPoint(dcW: number, installed: number, ratingW: number, points: CurvePoint[]): OperatingPoint {
  const perPsuW = dcW / installed;
  const loadFraction = ratingW > 0 ? perPsuW / ratingW : Infinity;
  const reading = efficiencyAt(points, loadFraction);
  // Each supply carries an equal share at the same efficiency, so the total
  // wall draw is the total DC load over that efficiency.
  const wallW = dcW > 0 ? dcW / reading.efficiency : 0;
  return { dcW, perPsuW, loadFraction, efficiency: reading.efficiency, region: reading.region, wallW, lossW: wallW - dcW };
}

/** Inputs are assumed validated: peak above zero, a tier that exists for the standard. */
export function size(input: SizingInput): SizingResult {
  const { installed, carrying } = supplyCounts(input.redundancy, input.n);
  const requiredPerPsuW = (input.peakW * (1 + input.marginPct / 100)) / carrying;
  const recommendedW = COMMON_RATINGS.find((r) => r >= requiredPerPsuW - 1e-9) ?? null;
  const evaluatedW = input.ratingW ?? recommendedW ?? Math.ceil(requiredPerPsuW / 100) * 100;
  const points = curve(input.standard, input.tier);
  const typical = operatingPoint(input.typicalW, installed, evaluatedW, points);
  const peak = operatingPoint(input.peakW, installed, evaluatedW, points);
  const afterFailure =
    installed > carrying
      ? { perPsuW: input.peakW / carrying, loadFraction: input.peakW / carrying / evaluatedW }
      : null;
  const capacity = carrying * evaluatedW;
  const annualKwh = (typical.wallW * HOURS_PER_YEAR) / 1000;
  const transientW = input.peakW + (input.transientFactor - 1) * input.gpuPeakW;
  return {
    installed,
    carrying,
    requiredPerPsuW,
    recommendedW,
    evaluatedW,
    typical,
    peak,
    afterFailure,
    headroomFraction: input.peakW > 0 ? capacity / input.peakW - 1 : Infinity,
    annualKwh,
    annualCost: annualKwh * input.pricePerKwh,
    btuPerHourTypical: typical.wallW * BTU_PER_WATT,
    btuPerHourPeak: peak.wallW * BTU_PER_WATT,
    transient:
      input.gpuPeakW > 0 && input.transientFactor > 1
        ? { watts: transientW, capacityW: capacity, ratio: transientW / capacity }
        : null,
  };
}

/* ----------------------------------------------------------------- parsing */

export type Parsed = { ok: true; value: number } | { ok: false; message: string };

const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parse a non-negative decimal typed by a person, with a message naming the field. */
export function parseNumber(
  raw: string,
  label: string,
  opts: { min: number; max: number; integer?: boolean },
): Parsed {
  const text = raw.trim();
  if (text === "") return { ok: false, message: `${label} is empty.` };
  if (text.startsWith("-")) return { ok: false, message: `${label} cannot be negative.` };
  if (!DECIMAL.test(text)) {
    return { ok: false, message: `${label} should be a plain number, such as ${opts.integer ? "2" : "0.12"}.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: `${label} is too large.` };
  if (opts.integer && !Number.isInteger(value)) return { ok: false, message: `${label} should be a whole number.` };
  if (value < opts.min) return { ok: false, message: `${label} must be at least ${opts.min.toLocaleString("en-US")}.` };
  if (value > opts.max) return { ok: false, message: `${label} can be at most ${opts.max.toLocaleString("en-US")}.` };
  return { ok: true, value };
}
