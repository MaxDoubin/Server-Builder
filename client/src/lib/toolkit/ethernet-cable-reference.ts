/**
 * Twisted-pair Ethernet cabling: categories, speed and distance limits,
 * T568A/T568B pinouts, crossover mapping, a crimp-order checker, PoE pair
 * usage and ISO/IEC 11801 shielding codes.
 *
 * Sources:
 *   Pin and pair assignments   ANSI/TIA-568 (T568A and T568B)
 *   Pin signals                IEEE 802.3 clause 14 (10BASE-T), 25 (100BASE-TX),
 *                              40 (1000BASE-T, Table 40-12 MDI/MDI-X)
 *   Speed and distance         802.3i, 802.3u, 802.3ab, 802.3bz, 802.3an, 802.3bq
 *   10GBASE-T on Cat6          802.3an (55 m on Class E), TIA TSB-155
 *   PoE                        802.3af, 802.3at, 802.3bt
 *   Shielding codes            ISO/IEC 11801 (overall screen / pair screen, then TP)
 *
 * Pure data and functions, no React and no DOM.
 */

/* ------------------------------------------------------------ categories */

export type CategoryId = "cat5" | "cat5e" | "cat6" | "cat6a" | "cat7" | "cat8";

export interface Category {
  id: CategoryId;
  name: string;
  mhz: number;
  tia: string;
  iso: string;
  construction: string;
  connector: string;
  fastest: string;
  notes: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "cat5",
    name: "Cat5",
    mhz: 100,
    tia: "TIA/EIA-568-A (1995), dropped from 568-B in 2001",
    iso: "Class D (1995 edition)",
    construction: "U/UTP",
    connector: "RJ45",
    fastest: "100BASE-TX; 1000BASE-T only if tested to TSB-95",
    notes: "No longer a recognized TIA category. Installed Cat5 carries 1000BASE-T only if it passes the extra return loss and crosstalk tests in TSB-95.",
  },
  {
    id: "cat5e",
    name: "Cat5e",
    mhz: 100,
    tia: "TIA-568-B.2 (2001)",
    iso: "Class D (2002 edition)",
    construction: "U/UTP, sometimes F/UTP",
    connector: "RJ45",
    fastest: "2.5GBASE-T to 100 m",
    notes: "Tightened the crosstalk and return loss limits that 1000BASE-T depends on. The lowest category TIA-568 still recognizes.",
  },
  {
    id: "cat6",
    name: "Cat6",
    mhz: 250,
    tia: "TIA-568-B.2-1 (2002)",
    iso: "Class E",
    construction: "U/UTP, F/UTP or U/FTP",
    connector: "RJ45",
    fastest: "10GBASE-T to 55 m",
    notes: "What limits 10GBASE-T here is alien crosstalk between neighboring cables in a bundle, which Cat6 does not specify.",
  },
  {
    id: "cat6a",
    name: "Cat6A",
    mhz: 500,
    tia: "TIA-568-B.2-10 (2008)",
    iso: "Class EA",
    construction: "U/UTP, F/UTP or U/FTP",
    connector: "RJ45",
    fastest: "10GBASE-T to 100 m",
    notes: "Specifies alien crosstalk, so 10GBASE-T reaches the full 100 m in a bundle. U/UTP Cat6A is noticeably thicker than Cat6.",
  },
  {
    id: "cat7",
    name: "Cat7",
    mhz: 600,
    tia: "Not a TIA category",
    iso: "Class F (ISO/IEC 11801:2002)",
    construction: "S/FTP required",
    connector: "GG45, TERA or ARJ45",
    fastest: "10GBASE-T to 100 m",
    notes: "With RJ45 plugs the channel cannot be certified above Class EA, so Cat7 cords with RJ45 ends perform as Cat6A at best. Cat7A (Class FA) raises the limit to 1000 MHz.",
  },
  {
    id: "cat8",
    name: "Cat8",
    mhz: 2000,
    tia: "TIA-568-C.2-1 (2016)",
    iso: "Class I (Cat8.1) and Class II (Cat8.2)",
    construction: "Shielded only: F/UTP or U/FTP (8.1), S/FTP or F/FTP (8.2)",
    connector: "RJ45 (8.1); TERA or GG45 (8.2)",
    fastest: "25GBASE-T and 40GBASE-T to 30 m",
    notes: "Defined only as a channel of up to 30 m with two connectors, for server to top-of-rack links. A longer run is outside the Cat8 specification.",
  },
];

/* ---------------------------------------------------------------- speeds */

export type SpeedId =
  | "10base-t"
  | "100base-tx"
  | "1000base-t"
  | "2.5gbase-t"
  | "5gbase-t"
  | "10gbase-t"
  | "25gbase-t"
  | "40gbase-t";

export interface EthSpeed {
  id: SpeedId;
  name: string;
  ieee: string;
  pairs: string;
  coding: string;
}

export const ETH_SPEEDS: EthSpeed[] = [
  { id: "10base-t", name: "10BASE-T", ieee: "802.3i (1990)", pairs: "2 pairs: 1-2, 3-6", coding: "Manchester, 10 MHz fundamental" },
  { id: "100base-tx", name: "100BASE-TX", ieee: "802.3u (1995)", pairs: "2 pairs: 1-2, 3-6", coding: "4B5B and MLT-3, 125 MBd" },
  { id: "1000base-t", name: "1000BASE-T", ieee: "802.3ab (1999)", pairs: "4 pairs, both directions", coding: "PAM-5, 125 MBd per pair" },
  { id: "2.5gbase-t", name: "2.5GBASE-T", ieee: "802.3bz (2016)", pairs: "4 pairs, both directions", coding: "PAM-16 (DSQ128), 200 MBd" },
  { id: "5gbase-t", name: "5GBASE-T", ieee: "802.3bz (2016)", pairs: "4 pairs, both directions", coding: "PAM-16 (DSQ128), 400 MBd" },
  { id: "10gbase-t", name: "10GBASE-T", ieee: "802.3an (2006)", pairs: "4 pairs, both directions", coding: "PAM-16 (DSQ128), 800 MBd" },
  { id: "25gbase-t", name: "25GBASE-T", ieee: "802.3bq (2016)", pairs: "4 pairs, both directions", coding: "PAM-16 (DSQ128), 2000 MBd" },
  { id: "40gbase-t", name: "40GBASE-T", ieee: "802.3bq (2016)", pairs: "4 pairs, both directions", coding: "PAM-16 (DSQ128), 3200 MBd" },
];

export type Level = "yes" | "conditional" | "no";

export interface Support {
  level: Level;
  /** Maximum channel length in meters; 0 when unsupported. */
  meters: number;
  note?: string;
}

const CAT8_NOTE =
  "Cat8 is specified only as a 30 m channel. A longer run is outside that specification and has to be tested against a lower class, such as Cat6A, for the speed it carries.";

const Y = (meters: number, note?: string): Support => ({ level: "yes", meters, note });
const C = (meters: number, note: string): Support => ({ level: "conditional", meters, note });
const N = (note: string): Support => ({ level: "no", meters: 0, note });

const ALL_100 = (cat5?: Support): Record<CategoryId, Support> => ({
  cat5: cat5 ?? Y(100),
  cat5e: Y(100),
  cat6: Y(100),
  cat6a: Y(100),
  cat7: Y(100),
  cat8: Y(100, CAT8_NOTE),
});

export const SUPPORT: Record<SpeedId, Record<CategoryId, Support>> = {
  "10base-t": ALL_100(),
  "100base-tx": ALL_100(),
  "1000base-t": ALL_100(
    C(
      100,
      "1000BASE-T was specified on Cat5, but installed Cat5 has to pass the added return loss and far-end crosstalk tests in TIA TSB-95. Cat5e builds them in.",
    ),
  ),
  "2.5gbase-t": { ...ALL_100(N("2.5GBASE-T is specified on Cat5e and better, not Cat5.")) },
  "5gbase-t": {
    ...ALL_100(N("5GBASE-T is not specified on Cat5.")),
    cat5e: C(
      100,
      "5GBASE-T was specified with Cat6 in mind. Cat5e is characterized only to 100 MHz, so it often works at 100 m but needs testing, mostly for alien crosstalk in bundles.",
    ),
  },
  "10gbase-t": {
    cat5: N("10GBASE-T is not specified on Cat5."),
    cat5e: N("10GBASE-T is not specified on Cat5e. It needs cabling characterized to 500 MHz."),
    cat6: C(
      55,
      "IEEE 802.3an allows up to 55 m on Cat6. TIA TSB-155 treats 37 m as the safe figure and 37 to 55 m as needing alien crosstalk testing or mitigation.",
    ),
    cat6a: Y(100),
    cat7: Y(100),
    cat8: Y(100, CAT8_NOTE),
  },
  "25gbase-t": {
    cat5: N("25GBASE-T needs Cat8 (Class I or II) cabling."),
    cat5e: N("25GBASE-T needs Cat8 (Class I or II) cabling."),
    cat6: N("25GBASE-T needs Cat8 (Class I or II) cabling."),
    cat6a: N("25GBASE-T needs Cat8 (Class I or II) cabling."),
    cat7: N("Cat7 is specified to 600 MHz; 25GBASE-T needs the 2000 MHz Cat8 classes."),
    cat8: Y(30),
  },
  "40gbase-t": {
    cat5: N("40GBASE-T needs Cat8 (Class I or II) cabling."),
    cat5e: N("40GBASE-T needs Cat8 (Class I or II) cabling."),
    cat6: N("40GBASE-T needs Cat8 (Class I or II) cabling."),
    cat6a: N("40GBASE-T needs Cat8 (Class I or II) cabling."),
    cat7: N("Cat7 is specified to 600 MHz; 40GBASE-T needs the 2000 MHz Cat8 classes."),
    cat8: Y(30),
  },
};

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

export function getSpeed(id: SpeedId): EthSpeed {
  return ETH_SPEEDS.find((s) => s.id === id) ?? ETH_SPEEDS[0];
}

/* --------------------------------------------------------------- lengths */

export const MAX_RUN_M = 100_000;
export const MAX_RUN_CHARS = 40;

export type MetersResult = { ok: true; meters: number } | { ok: false; message: string };

/** "90", "90 m", "300 ft", "300'". A bare number is meters. Null for blank. */
export function parseMeters(raw: string): MetersResult | null {
  const input = raw.trim();
  if (input === "") return null;
  if (input.length > MAX_RUN_CHARS) return { ok: false, message: "Enter a length such as 90 m or 250 ft." };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|\.\d+)\s*(m|meters?|metres?|ft|feet|foot|')?$/i.exec(input);
  if (!m) {
    if (/^-/.test(input)) return { ok: false, message: "A length cannot be negative." };
    return { ok: false, message: "Enter a length such as 90 m or 250 ft." };
  }
  const value = Number(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "m").toLowerCase();
  const meters = unit === "ft" || unit === "feet" || unit === "foot" || unit === "'" ? value * 0.3048 : value;
  if (!Number.isFinite(meters)) return { ok: false, message: "Enter a length such as 90 m or 250 ft." };
  if (meters <= 0) return { ok: false, message: "Enter a length greater than zero." };
  if (meters > MAX_RUN_M) return { ok: false, message: "Enter 100,000 m or less." };
  return { ok: true, meters };
}

export function formatRun(meters: number): string {
  if (meters >= 100) return `${Math.round(meters)} m`;
  return `${Number(meters.toFixed(1))} m`;
}

export type Verdict = "ok" | "conditional" | "too-long" | "unsupported";

export interface RunVerdict {
  verdict: Verdict;
  limitM: number;
  message: string;
}

/** Can this category carry this speed over this channel length? */
export function checkRun(speed: SpeedId, cat: CategoryId, meters: number): RunVerdict {
  const s = SUPPORT[speed][cat];
  const sp = getSpeed(speed).name;
  const c = getCategory(cat).name;
  if (s.level === "no") return { verdict: "unsupported", limitM: 0, message: s.note ?? `${sp} is not specified on ${c}.` };
  if (meters > s.meters) {
    return {
      verdict: "too-long",
      limitM: s.meters,
      message: `${formatRun(meters)} is over the ${s.meters} m limit for ${sp} on ${c}.`,
    };
  }
  if (s.level === "conditional") return { verdict: "conditional", limitM: s.meters, message: s.note ?? "" };
  return { verdict: "ok", limitM: s.meters, message: s.note ?? `Within the ${s.meters} m channel limit.` };
}

/** A caution that applies to the length itself, whatever the category. */
export function lengthAdvice(meters: number): string | null {
  if (meters > 100) {
    return "No twisted-pair Ethernet speed is specified past 100 m. Put a switch in the middle or use fiber.";
  }
  if (meters > 90) {
    return "Over 90 m only works if that is the whole channel, patch cords included. TIA-568 limits the permanent link to 90 m and leaves 10 m for cords.";
  }
  return null;
}

/* --------------------------------------------------------------- pinouts */

export type Base = "orange" | "green" | "blue" | "brown";
export type WireId =
  | "white-orange"
  | "orange"
  | "white-green"
  | "green"
  | "white-blue"
  | "blue"
  | "white-brown"
  | "brown";
export type Standard = "T568A" | "T568B";

export const WIRE_IDS: WireId[] = [
  "white-orange",
  "orange",
  "white-green",
  "green",
  "white-blue",
  "blue",
  "white-brown",
  "brown",
];

/** TIA-568 pair numbers. */
export const PAIR_NUMBER: Record<Base, number> = { blue: 1, orange: 2, green: 3, brown: 4 };

/** Index 0 is pin 1. */
export const PINOUTS: Record<Standard, WireId[]> = {
  T568A: ["white-green", "green", "white-orange", "blue", "white-blue", "orange", "white-brown", "brown"],
  T568B: ["white-orange", "orange", "white-green", "blue", "white-blue", "green", "white-brown", "brown"],
};

/** Pins that form one twisted pair in both standards. */
export const PIN_PAIRS: [number, number][] = [
  [1, 2],
  [3, 6],
  [4, 5],
  [7, 8],
];

/** In both standards the striped wire sits on pins 1, 3, 5 and 7. */
const STRIPED_PINS = new Set([1, 3, 5, 7]);

export function wireBase(w: WireId): Base {
  return w.replace("white-", "") as Base;
}

export function wireStriped(w: WireId): boolean {
  return w.startsWith("white-");
}

export function wireLabel(w: WireId): string {
  const base = wireBase(w);
  return wireStriped(w) ? `White/${base}` : base.charAt(0).toUpperCase() + base.slice(1);
}

export function pairPartner(pin: number): number {
  const pair = PIN_PAIRS.find(([a, b]) => a === pin || b === pin);
  if (!pair) return pin;
  return pair[0] === pin ? pair[1] : pair[0];
}

/* --------------------------------------------------------------- signals */

export type Overlay = "pairs" | "fast" | "gigabit" | "poe-a" | "poe-b" | "poe-4";
export type Side = "mdi" | "mdix";

export interface PinRole {
  short: string;
  long: string;
  active: boolean;
}

const FAST_MDI: Record<number, string> = { 1: "TX+", 2: "TX-", 3: "RX+", 6: "RX-" };
const FAST_MDIX: Record<number, string> = { 1: "RX+", 2: "RX-", 3: "TX+", 6: "TX-" };
const GIG_MDI: Record<number, string> = { 1: "DA+", 2: "DA-", 3: "DB+", 6: "DB-", 4: "DC+", 5: "DC-", 7: "DD+", 8: "DD-" };
const GIG_MDIX: Record<number, string> = { 1: "DB+", 2: "DB-", 3: "DA+", 6: "DA-", 4: "DD+", 5: "DD-", 7: "DC+", 8: "DC-" };

/** What a pin does under a given overlay. Pins are 1 to 8. */
export function pinRole(overlay: Overlay, pin: number, side: Side, std: Standard): PinRole {
  const wire = PINOUTS[std][pin - 1];
  switch (overlay) {
    case "pairs": {
      const base = wireBase(wire);
      return { short: `P${PAIR_NUMBER[base]}`, long: `Pair ${PAIR_NUMBER[base]} (${base}), with pin ${pairPartner(pin)}`, active: true };
    }
    case "fast": {
      const map = side === "mdi" ? FAST_MDI : FAST_MDIX;
      const sig = map[pin];
      if (!sig) return { short: "·", long: "Unused by 10BASE-T and 100BASE-TX", active: false };
      const dir = sig.startsWith("TX") ? "transmit" : "receive";
      return { short: sig, long: `${sig}: ${dir}, ${sig.endsWith("+") ? "positive" : "negative"} side of the pair`, active: true };
    }
    case "gigabit": {
      const map = side === "mdi" ? GIG_MDI : GIG_MDIX;
      const sig = map[pin];
      return {
        short: sig,
        long: `BI_${sig}: bidirectional pair ${sig.charAt(1)}, ${sig.endsWith("+") ? "positive" : "negative"} side`,
        active: true,
      };
    }
    case "poe-a":
      return [1, 2, 3, 6].includes(pin)
        ? { short: "DC", long: "Power and data on the same pair in Mode A (phantom power)", active: true }
        : { short: "·", long: "No power in Mode A", active: false };
    case "poe-b":
      return [4, 5, 7, 8].includes(pin)
        ? { short: "DC", long: "Power in Mode B; on 10/100 these pairs carry no data", active: true }
        : { short: "·", long: "No power in Mode B", active: false };
    case "poe-4":
      return { short: "DC", long: "Power on all four pairs (802.3bt 4-pair)", active: true };
  }
}

/* ----------------------------------------------------- end to end wiring */

/**
 * For each pin at end A (index 0 is pin 1), the pin at end B that the same
 * colored wire reaches, or null if that color is missing at end B.
 */
export function mapEnds(a: WireId[], b: WireId[]): (number | null)[] {
  return a.map((w) => {
    const i = b.indexOf(w);
    return i === -1 ? null : i + 1;
  });
}

export type CableKind = "straight" | "crossover" | "gigabit-crossover" | "other";

const CROSS_10_100 = [3, 6, 1, 4, 5, 2, 7, 8];
const CROSS_GIGABIT = [3, 6, 1, 7, 8, 2, 4, 5];

export function classifyCable(map: (number | null)[]): CableKind {
  if (map.length !== 8 || map.some((p) => p === null)) return "other";
  if (map.every((p, i) => p === i + 1)) return "straight";
  if (map.every((p, i) => p === CROSS_10_100[i])) return "crossover";
  if (map.every((p, i) => p === CROSS_GIGABIT[i])) return "gigabit-crossover";
  return "other";
}

/* ----------------------------------------------------------- crimp check */

export type CrimpLevel = "ok" | "warn" | "error" | "incomplete";

export interface CrimpAnalysis {
  level: CrimpLevel;
  standard: Standard | null;
  summary: string;
  problems: string[];
  duplicates: WireId[];
  missing: WireId[];
}

function sameOrder(a: (WireId | null)[], b: WireId[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/** Check the color order of one crimped plug, pin 1 first. */
export function analyzeOrder(order: (WireId | null)[]): CrimpAnalysis {
  const pins = order.slice(0, 8);
  while (pins.length < 8) pins.push(null);
  const counts = new Map<WireId, number>();
  for (const w of pins) if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  const duplicates = WIRE_IDS.filter((w) => (counts.get(w) ?? 0) > 1);
  const missing = WIRE_IDS.filter((w) => !counts.has(w));
  const blanks = pins.filter((w) => w === null).length;

  if (duplicates.length > 0) {
    return {
      level: "error",
      standard: null,
      summary: `${duplicates.map(wireLabel).join(", ")} ${duplicates.length === 1 ? "is" : "are"} on more than one pin.`,
      problems: ["Each of the eight colors appears exactly once in a correctly made plug."],
      duplicates,
      missing,
    };
  }
  if (blanks > 0) {
    return {
      level: "incomplete",
      standard: null,
      summary: `Choose a color for ${blanks === 1 ? "the last pin" : `the remaining ${blanks} pins`}.`,
      problems: [],
      duplicates,
      missing,
    };
  }

  const full = pins as WireId[];
  for (const std of ["T568A", "T568B"] as Standard[]) {
    if (sameOrder(full, PINOUTS[std])) {
      return { level: "ok", standard: std, summary: `Matches ${std}.`, problems: [], duplicates, missing };
    }
  }
  for (const std of ["T568A", "T568B"] as Standard[]) {
    if (sameOrder([...full].reverse(), PINOUTS[std])) {
      return {
        level: "error",
        standard: null,
        summary: `This is ${std} in reverse order.`,
        problems: [
          `The pairs are intact but sit on the wrong pins, so pin 1 here reaches pin 8 on a correctly made end. It usually means the plug was flipped, contacts facing away, while the wires were set.`,
        ],
        duplicates,
        missing,
      };
    }
  }

  const problems: string[] = [];
  let splits = 0;
  for (const [p, q] of PIN_PAIRS) {
    const a = full[p - 1];
    const b = full[q - 1];
    if (wireBase(a) !== wireBase(b)) {
      splits += 1;
      problems.push(
        `Pins ${p} and ${q} hold ${wireLabel(a).toLowerCase()} and ${wireLabel(b).toLowerCase()}, which come from different pairs. A continuity tester passes this, but the signal on ${p} and ${q} no longer travels on one twisted pair, so crosstalk rises and the link fails or drops to a lower speed.`,
      );
    } else if (wireStriped(a) !== STRIPED_PINS.has(p)) {
      problems.push(
        `Pins ${p} and ${q} have the striped and solid ${wireBase(a)} wires swapped. Many PHYs correct the polarity, but the plug is out of standard and a certifier fails it.`,
      );
    }
  }

  if (splits > 0) {
    return {
      level: "error",
      standard: null,
      summary: `Split ${splits === 1 ? "pair" : "pairs"}: ${splits} of the four pin pairs ${splits === 1 ? "mixes" : "mix"} two different wire pairs.`,
      problems,
      duplicates,
      missing,
    };
  }

  const layout = PIN_PAIRS.map(([p]) => wireBase(full[p - 1])).join(",");
  const aLayout = PIN_PAIRS.map(([p]) => wireBase(PINOUTS.T568A[p - 1])).join(",");
  const bLayout = PIN_PAIRS.map(([p]) => wireBase(PINOUTS.T568B[p - 1])).join(",");
  const std: Standard | null = layout === aLayout ? "T568A" : layout === bLayout ? "T568B" : null;
  if (std === null) {
    problems.push(
      "All four pairs are intact, but they are not on the pins T568A or T568B assigns. A cable wired this way at both ends passes signals, yet it fails certification and does not match a jack punched down to either standard.",
    );
  }
  return {
    level: "warn",
    standard: std,
    summary: std ? `${std} pair layout, with polarity swapped inside a pair.` : "Pairs intact, but in a nonstandard order.",
    problems,
    duplicates,
    missing,
  };
}

/* ------------------------------------------------------------------- PoE */

export interface PoeType {
  ieee: string;
  name: string;
  type: string;
  pairs: string;
  pseW: number;
  pdW: number;
  current: string;
}

export const POE_TYPES: PoeType[] = [
  { ieee: "802.3af (2003)", name: "PoE", type: "Type 1", pairs: "2", pseW: 15.4, pdW: 12.95, current: "350 mA" },
  { ieee: "802.3at (2009)", name: "PoE+", type: "Type 2", pairs: "2", pseW: 30, pdW: 25.5, current: "600 mA" },
  { ieee: "802.3bt (2018)", name: "4PPoE", type: "Type 3", pairs: "2 or 4", pseW: 60, pdW: 51, current: "600 mA per pair set" },
  { ieee: "802.3bt (2018)", name: "4PPoE", type: "Type 4", pairs: "4", pseW: 90, pdW: 71.3, current: "960 mA per pair set" },
];

/* ------------------------------------------------------------- shielding */

export type OverallScreen = "braid" | "foil";

export interface ShieldInfo {
  code: string;
  overall: OverallScreen[];
  pairFoil: boolean;
  description: string;
  /** Set when the input was a legacy name rather than an ISO code. */
  legacy: string | null;
}

export type ShieldResult = { ok: true; info: ShieldInfo } | { ok: false; message: string };

export const COMMON_SHIELDS = ["U/UTP", "F/UTP", "U/FTP", "S/FTP", "SF/UTP", "F/FTP"];

const LEGACY: Record<string, { code: string; note: string } | { ambiguous: string }> = {
  UTP: { code: "U/UTP", note: "UTP is the informal name; the ISO/IEC 11801 code is U/UTP." },
  SCTP: { code: "F/UTP", note: "ScTP (screened twisted pair) is an older North American name for F/UTP." },
  FTP: { code: "F/UTP", note: "FTP has been used for both F/UTP and U/FTP. It is read here as F/UTP; check the cable's own marking." },
  "S/STP": { code: "S/FTP", note: "S/STP is an older name for S/FTP." },
  SSTP: { code: "S/FTP", note: "S-STP is an older name for S/FTP." },
  STP: { ambiguous: "STP is used loosely for any shielded cable. Ask for the ISO code, such as F/UTP, U/FTP or S/FTP." },
  SFTP: { ambiguous: "SFTP has meant both SF/UTP and S/FTP. Ask for the ISO code to know which." },
};

function describeShield(overall: OverallScreen[], pairFoil: boolean): string {
  const outer =
    overall.length === 0
      ? "No overall screen"
      : overall.length === 2
        ? "A braid and a foil around all four pairs"
        : overall[0] === "braid"
          ? "A braid around all four pairs"
          : "One foil around all four pairs";
  const inner = pairFoil ? "each pair in its own foil" : "pairs not individually screened";
  return `${outer}; ${inner}.`;
}

/** Parse an ISO/IEC 11801 code such as U/UTP or SF/FTP, or a legacy name. */
export function parseShield(raw: string): ShieldResult | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (s === "") return null;
  if (s.length > 12) return { ok: false, message: "Write the code as overall screen / pair screen, then TP, for example U/UTP or S/FTP." };
  let code = s;
  let legacy: string | null = null;
  const old = LEGACY[s];
  if (old) {
    if ("ambiguous" in old) return { ok: false, message: old.ambiguous };
    code = old.code;
    legacy = old.note;
  }
  const m = /^(U|F|S|SF)\/(U|F)TP$/.exec(code);
  if (!m) {
    if (/^FS\//.test(code)) return { ok: false, message: "The braid is written first: SF, not FS." };
    if (/^(U|F|S|SF)\/S/.test(code)) {
      return { ok: false, message: "In the ISO code the pair screen is U (none) or F (foil). A braid goes only in the overall position." };
    }
    return {
      ok: false,
      message: "Write the code as overall screen / pair screen, then TP. Overall is U, F, S or SF; the pair part is U or F. For example U/UTP, F/UTP or S/FTP.",
    };
  }
  const overall: OverallScreen[] = m[1] === "U" ? [] : m[1] === "F" ? ["foil"] : m[1] === "S" ? ["braid"] : ["braid", "foil"];
  const pairFoil = m[2] === "F";
  return { ok: true, info: { code, overall, pairFoil, description: describeShield(overall, pairFoil), legacy } };
}
