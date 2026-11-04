/**
 * Fiber optic loss budget arithmetic.
 *
 * Link loss is fiber attenuation times length, plus a fixed loss for every
 * mated connector pair and every splice. The budget it is held against is
 * the gap between what the transmitter is guaranteed to launch and what the
 * receiver is guaranteed to work at, less an allowance for the dispersion and
 * noise penalties that the standard reserves out of that gap.
 *
 * Reference figures, all maxima used for planning:
 *   - Multimode attenuation, 3.5 dB/km at 850 nm: ANSI/TIA-568.3-D and
 *     ISO/IEC 11801 for cabled OM3, OM4 and OM5.
 *   - Mated connector pair, 0.75 dB: the TIA-568.3-D component maximum.
 *   - Fusion splice, 0.1 dB: a typical figure, well inside the 0.3 dB the
 *     TIA allows.
 *   - Optic power figures: IEEE 802.3 Clause 38 (1000BASE-X), Clause 52
 *     (10GBASE-SR and LR), Clause 95 (100GBASE-SR4), Clause 88 (100GBASE-LR4)
 *     and Clause 112 (25GBASE-SR).
 *
 * All dB arithmetic is done in integer milli-dB so that 0.1 dB steps add up
 * exactly and a link that is 0.05 dB under budget is not reported as 0.05000
 * dB over it by a float rounding error.
 *
 * Pure functions, no React and no DOM, so the arithmetic can be tested on
 * its own.
 */

export type FiberId = "OM3" | "OM4" | "OM5" | "OS2-1310" | "OS2-1550";
export type MultimodeGrade = "OM3" | "OM4" | "OM5";
export type Media = "mmf" | "smf";

export interface FiberType {
  id: FiberId;
  label: string;
  media: Media;
  wavelengthNm: number;
  /** Planning attenuation of the cabled fiber, in dB per km. */
  attenDbPerKm: number;
  note: string;
}

export const FIBER_TYPES: FiberType[] = [
  {
    id: "OM3",
    label: "OM3 multimode, 850 nm",
    media: "mmf",
    wavelengthNm: 850,
    attenDbPerKm: 3.5,
    note: "50/125 µm, laser optimized. 3.5 dB/km is the cabled maximum at 850 nm in TIA-568.3-D and ISO/IEC 11801.",
  },
  {
    id: "OM4",
    label: "OM4 multimode, 850 nm",
    media: "mmf",
    wavelengthNm: 850,
    attenDbPerKm: 3.5,
    note: "50/125 µm, higher bandwidth than OM3. The same 3.5 dB/km maximum at 850 nm.",
  },
  {
    id: "OM5",
    label: "OM5 multimode, 850 nm",
    media: "mmf",
    wavelengthNm: 850,
    attenDbPerKm: 3.5,
    note: "50/125 µm, wideband. At 850 nm it has the same 3.5 dB/km maximum as OM3 and OM4.",
  },
  {
    id: "OS2-1310",
    label: "OS2 single-mode, 1310 nm",
    media: "smf",
    wavelengthNm: 1310,
    attenDbPerKm: 0.4,
    note: "9/125 µm. 0.4 dB/km is the cabled maximum ISO/IEC 11801 gives for OS2. Installed cable is usually better.",
  },
  {
    id: "OS2-1550",
    label: "OS2 single-mode, 1550 nm",
    media: "smf",
    wavelengthNm: 1550,
    attenDbPerKm: 0.3,
    note: "Single-mode loses less per kilometer at 1550 nm than at 1310 nm. 0.3 dB/km is a planning value.",
  },
];

export function fiberType(id: FiberId): FiberType {
  return FIBER_TYPES.find((f) => f.id === id) ?? FIBER_TYPES[1];
}

export function gradeOf(id: FiberId): MultimodeGrade | null {
  return id === "OM3" || id === "OM4" || id === "OM5" ? id : null;
}

export interface Transceiver {
  id: string;
  name: string;
  speed: string;
  media: Media;
  /** Nominal wavelength, in nm. For 100GBASE-LR4 the four lanes sit near 1310 nm. */
  wavelengthNm: number;
  /** Minimum average launch power, in dBm. */
  txMinDbm: number;
  /**
   * The weakest average power the receiver is specified for, in dBm. For the
   * 10G, 25G and 100G rows this is the standard's minimum average receive
   * power, which is the transmit minimum less the channel insertion loss.
   */
  rxSensDbm: number;
  /**
   * Dispersion and noise penalties reserved out of the gap, in dB. For the
   * 1000BASE-X rows this is the standard's penalty allocation plus its
   * unallocated margin, so that the budget equals the channel loss limit.
   */
  penaltyDb: number;
  /** The standard's channel insertion loss limit, in dB. */
  channelLossDb: number;
  /** Where that channel insertion loss limit applies. */
  channelLossNote: string;
  /** Multimode only: standard reach per grade, in meters. */
  mmfReachM?: Record<MultimodeGrade, number>;
  /** Single-mode only: standard reach, in meters. */
  smfReachM?: number;
  clause: string;
  note: string;
}

/**
 * Power figures from the clauses named in each row. The penalty is the gap
 * between TX minimum and RX sensitivity that is not channel loss. The 10G,
 * 25G and 100G rows already quote the receive minimum after that allowance,
 * so their penalty is zero.
 */
export const TRANSCEIVERS: Transceiver[] = [
  {
    id: "1000base-sx",
    name: "1000BASE-SX",
    speed: "1 Gb/s",
    media: "mmf",
    wavelengthNm: 850,
    txMinDbm: -9.5,
    rxSensDbm: -17,
    penaltyDb: 3.94,
    channelLossDb: 3.56,
    channelLossNote: "550 m of 50 µm multimode",
    mmfReachM: { OM3: 550, OM4: 550, OM5: 550 },
    clause: "IEEE 802.3 Clause 38",
    note: "Link power budget 7.5 dB. At 550 m the standard allocates 3.57 dB to penalties such as modal noise and dispersion and leaves 0.37 dB unallocated, so planning against the 3.56 dB channel loss limit holds back 3.94 dB.",
  },
  {
    id: "1000base-lx",
    name: "1000BASE-LX",
    speed: "1 Gb/s",
    media: "smf",
    wavelengthNm: 1310,
    txMinDbm: -11,
    rxSensDbm: -19,
    penaltyDb: 3.43,
    channelLossDb: 4.57,
    channelLossNote: "5 km of single-mode",
    smfReachM: 5000,
    clause: "IEEE 802.3 Clause 38",
    note: "Link power budget 8 dB. Planning against the 4.57 dB channel loss limit holds back 3.43 dB for penalties and unallocated margin. Many LX modules are sold as 10 km parts, which is the later 1000BASE-LX10.",
  },
  {
    id: "10gbase-sr",
    name: "10GBASE-SR",
    speed: "10 Gb/s",
    media: "mmf",
    wavelengthNm: 850,
    txMinDbm: -7.3,
    rxSensDbm: -9.9,
    penaltyDb: 0,
    channelLossDb: 2.6,
    channelLossNote: "300 m of OM3",
    mmfReachM: { OM3: 300, OM4: 400, OM5: 400 },
    clause: "IEEE 802.3 Clause 52",
    note: "Very little budget. 2.6 dB is roughly two connector pairs at 0.75 dB plus 300 m of fiber.",
  },
  {
    id: "10gbase-lr",
    name: "10GBASE-LR",
    speed: "10 Gb/s",
    media: "smf",
    wavelengthNm: 1310,
    txMinDbm: -8.2,
    rxSensDbm: -14.4,
    penaltyDb: 0,
    channelLossDb: 6.2,
    channelLossNote: "10 km of single-mode",
    smfReachM: 10000,
    clause: "IEEE 802.3 Clause 52",
    note: "Meant for 10 km. The budget leaves little room for extra connectors or splices at full reach.",
  },
  {
    id: "25gbase-sr",
    name: "25GBASE-SR",
    speed: "25 Gb/s",
    media: "mmf",
    wavelengthNm: 850,
    txMinDbm: -8.4,
    rxSensDbm: -10.3,
    penaltyDb: 0,
    channelLossDb: 1.9,
    channelLossNote: "100 m of OM4",
    mmfReachM: { OM3: 70, OM4: 100, OM5: 100 },
    clause: "IEEE 802.3by Clause 112",
    note: "The tightest budget here: 1.9 dB is two connector pairs at 0.75 dB plus a little fiber.",
  },
  {
    id: "100gbase-sr4",
    name: "100GBASE-SR4",
    speed: "100 Gb/s",
    media: "mmf",
    wavelengthNm: 850,
    txMinDbm: -8.4,
    rxSensDbm: -10.3,
    penaltyDb: 0,
    channelLossDb: 1.9,
    channelLossNote: "100 m of OM4",
    mmfReachM: { OM3: 70, OM4: 100, OM5: 100 },
    clause: "IEEE 802.3bm Clause 95",
    note: "Figures are per lane. Four lanes on separate fibers share an MPO connector, so check the MPO loss on the datasheet.",
  },
  {
    id: "100gbase-lr4",
    name: "100GBASE-LR4",
    speed: "100 Gb/s",
    media: "smf",
    wavelengthNm: 1310,
    txMinDbm: -4.3,
    rxSensDbm: -10.6,
    penaltyDb: 0,
    channelLossDb: 6.3,
    channelLossNote: "10 km of single-mode",
    smfReachM: 10000,
    clause: "IEEE 802.3ba Clause 88",
    note: "Figures are per lane. Four wavelengths near 1310 nm share one fiber pair.",
  },
];

export function transceiver(id: string): Transceiver | null {
  return TRANSCEIVERS.find((t) => t.id === id) ?? null;
}

/** The fiber to switch to when a preset's media does not match the one selected. */
export function defaultFiberFor(t: Transceiver): FiberId {
  return t.media === "mmf" ? "OM4" : "OS2-1310";
}

export const CONNECTOR_LOSS_TIA_DB = 0.75;
export const CONNECTOR_LOSS_LOW_DB = 0.5;
export const SPLICE_LOSS_FUSION_DB = 0.1;
export const DEFAULT_MARGIN_DB = 0.5;

export const MAX_LENGTH_M = 200_000;
export const MAX_CONNECTORS = 100;
export const MAX_SPLICES = 1000;
export const MAX_CONNECTOR_LOSS_DB = 5;
export const MAX_SPLICE_LOSS_DB = 5;
export const MAX_ATTEN_DB_PER_KM = 20;
export const MAX_MARGIN_DB = 30;
export const MAX_PENALTY_DB = 20;
export const TX_RANGE_DBM = { min: -40, max: 30 };
export const RX_RANGE_DBM = { min: -50, max: 10 };

/* ---------------------------------------------------------------- parsing */

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const PLAIN = /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^[+-]?\.\d+$/;

/** A decimal number, with optional thousands commas. Null for an empty string. */
export function parseDecimal(raw: string): Parsed<number | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > 24) return { ok: false, message: "That is too long to be a number here." };
  if (!PLAIN.test(text)) return { ok: false, message: `"${text}" is not a number. Use digits, such as 0.75 or -9.5.` };
  const value = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(value)) return { ok: false, message: `"${text}" is not a number.` };
  return { ok: true, value };
}

/** A required decimal in a range, with a label for the message. */
export function parseBounded(
  raw: string,
  opts: { label: string; min: number; max: number; unit: string; minExclusive?: boolean },
): Parsed<number> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) return { ok: false, message: `Enter the ${opts.label}.` };
  const v = p.value;
  if (opts.minExclusive ? v <= opts.min : v < opts.min) {
    return {
      ok: false,
      message: opts.minExclusive
        ? `The ${opts.label} has to be more than ${opts.min} ${opts.unit}.`
        : `The ${opts.label} cannot be below ${opts.min} ${opts.unit}.`,
    };
  }
  if (v > opts.max) return { ok: false, message: `The ${opts.label} is capped at ${opts.max} ${opts.unit}.` };
  return { ok: true, value: v };
}

/** A whole number in a range. */
export function parseCount(raw: string, opts: { label: string; max: number }): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, message: `Enter the ${opts.label}, or 0.` };
  if (text.length > 8 || !/^\d+$/.test(text)) return { ok: false, message: `The ${opts.label} is a whole number, such as 2.` };
  const n = Number(text);
  if (n > opts.max) return { ok: false, message: `The ${opts.label} is capped at ${opts.max}.` };
  return { ok: true, value: n };
}

export type LengthUnit = "m" | "km";

/** Link length in meters, from a number and a unit. Zero is allowed: a link of patch cords only. */
export function parseLength(raw: string, unit: LengthUnit): Parsed<number> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) return { ok: false, message: "Enter the link length." };
  if (p.value < 0) return { ok: false, message: "A length cannot be negative." };
  const m = unit === "km" ? p.value * 1000 : p.value;
  if (m > MAX_LENGTH_M) return { ok: false, message: `The length is capped at ${MAX_LENGTH_M / 1000} km.` };
  return { ok: true, value: m };
}

/** Attenuation override. Blank means use the fiber's planning value. */
export function parseAtten(raw: string): Parsed<number | null> {
  const p = parseDecimal(raw);
  if (!p.ok) return p;
  if (p.value === null) return { ok: true, value: null };
  if (p.value <= 0) return { ok: false, message: "Attenuation has to be more than 0 dB/km." };
  if (p.value > MAX_ATTEN_DB_PER_KM) return { ok: false, message: `Attenuation is capped at ${MAX_ATTEN_DB_PER_KM} dB/km.` };
  return { ok: true, value: p.value };
}

/* --------------------------------------------------------------- analysis */

export function toMdb(db: number): number {
  return Math.round(db * 1000);
}

export interface LinkInput {
  fiber: FiberId;
  lengthM: number;
  attenDbPerKm: number;
  connectors: number;
  connectorLossDb: number;
  splices: number;
  spliceLossDb: number;
  marginDb: number;
  txMinDbm: number;
  rxSensDbm: number;
  penaltyDb: number;
  /** The optic being checked, for media, wavelength and reach warnings. Null for a custom optic. */
  optic: Transceiver | null;
}

export type Verdict = "pass" | "tight" | "fail";

export interface Flag {
  level: "danger" | "warn" | "info";
  text: string;
}

export interface LinkResult {
  fiberMdb: number;
  connectorMdb: number;
  spliceMdb: number;
  totalMdb: number;
  /** TX minimum less RX sensitivity. */
  gapMdb: number;
  penaltyMdb: number;
  /** What the link may lose: the gap less penalties. */
  budgetMdb: number;
  /** Budget less link loss, before the safety margin. */
  remainingMdb: number;
  marginMdb: number;
  /** Budget less link loss less safety margin. */
  spareMdb: number;
  verdict: Verdict;
  /** Longest fiber run the budget allows after connectors, splices and margin. Null when attenuation is zero. */
  lossLimitedM: number | null;
  /** Length of this fiber that costs as much as one mated connector pair. Null when attenuation is zero. */
  connectorEquivM: number | null;
  /** Standard reach for the optic on this fiber, in meters, if it has one. */
  standardReachM: number | null;
  exceedsReach: boolean;
  wrongMedia: boolean;
  flags: Flag[];
}

/** dB text from milli-dB, always two decimals: "2.55 dB". */
export function dbText(mdb: number): string {
  const v = mdb / 1000;
  return `${v.toFixed(2)} dB`;
}

/** Length text: "300 m", "10 km", "2.5 km". */
export function lengthText(m: number): string {
  if (m >= 1000) {
    const km = m / 1000;
    return `${Number(km.toFixed(km < 10 ? 2 : 1))} km`;
  }
  return `${Number(m.toFixed(m < 10 ? 1 : 0))} m`;
}

export function analyzeLink(input: LinkInput): LinkResult {
  const ft = fiberType(input.fiber);
  const optic = input.optic;

  const fiberMdb = Math.round(input.lengthM * input.attenDbPerKm);
  const connectorMdb = input.connectors * toMdb(input.connectorLossDb);
  const spliceMdb = input.splices * toMdb(input.spliceLossDb);
  const totalMdb = fiberMdb + connectorMdb + spliceMdb;

  const gapMdb = toMdb(input.txMinDbm) - toMdb(input.rxSensDbm);
  const penaltyMdb = toMdb(input.penaltyDb);
  const budgetMdb = gapMdb - penaltyMdb;
  const marginMdb = toMdb(input.marginDb);
  const remainingMdb = budgetMdb - totalMdb;
  const spareMdb = remainingMdb - marginMdb;
  const verdict: Verdict = remainingMdb < 0 ? "fail" : spareMdb < 0 ? "tight" : "pass";

  // Longest fiber the budget leaves room for once everything else is paid.
  // Milli-dB per meter is numerically dB per km.
  const fixedMdb = connectorMdb + spliceMdb + marginMdb;
  const lossLimitedM =
    input.attenDbPerKm > 0 ? Math.max(0, Math.floor((budgetMdb - fixedMdb) / input.attenDbPerKm)) : null;
  const connectorEquivM =
    input.attenDbPerKm > 0 ? Math.round(toMdb(input.connectorLossDb) / input.attenDbPerKm) : null;

  const flags: Flag[] = [];
  let standardReachM: number | null = null;
  let exceedsReach = false;
  let wrongMedia = false;

  if (optic) {
    if (optic.media === "mmf" && ft.media === "smf") {
      wrongMedia = true;
      flags.push({
        level: "danger",
        text: `${optic.name} is a multimode optic at ${optic.wavelengthNm} nm. It is not specified for single-mode fiber, so the numbers below do not describe a supported link.`,
      });
    } else if (optic.media === "smf" && ft.media === "mmf") {
      wrongMedia = true;
      flags.push({
        level: "danger",
        text:
          optic.id === "1000base-lx"
            ? `${optic.name} is a single-mode optic. IEEE defines it on multimode fiber only with a mode-conditioning patch cord, and the numbers below assume neither.`
            : `${optic.name} is a single-mode optic at ${optic.wavelengthNm} nm. It is not specified for multimode fiber, so the numbers below do not describe a supported link.`,
      });
    } else if (optic.media === "smf" && ft.wavelengthNm !== optic.wavelengthNm) {
      flags.push({
        level: "warn",
        text: `${optic.name} transmits near ${optic.wavelengthNm} nm, so the ${ft.wavelengthNm} nm attenuation does not apply to it. Choose OS2 at ${optic.wavelengthNm} nm.`,
      });
    }

    if (!wrongMedia) {
      const grade = gradeOf(input.fiber);
      standardReachM = optic.media === "mmf" ? (grade && optic.mmfReachM ? optic.mmfReachM[grade] : null) : (optic.smfReachM ?? null);
      if (standardReachM !== null && input.lengthM > standardReachM) {
        exceedsReach = true;
        flags.push(
          optic.media === "mmf"
            ? {
                level: "warn",
                text: `${lengthText(input.lengthM)} is longer than the ${lengthText(standardReachM)} that ${optic.name} is specified for on ${input.fiber}. Multimode reach is limited by modal bandwidth, not by loss, so a link can pass the loss budget and still fail.`,
              }
            : {
                level: "warn",
                text: `${lengthText(input.lengthM)} is longer than the ${lengthText(standardReachM)} the standard specifies for ${optic.name}. Loss may allow it, but dispersion and the optic's other limits are only guaranteed to ${lengthText(standardReachM)}.`,
              },
        );
      }
    }
  }

  if (gapMdb <= 0) {
    flags.push({
      level: "danger",
      text: "The receiver sensitivity is not below the minimum transmit power, so there is no power budget. Check the two figures and their signs.",
    });
  } else if (budgetMdb <= 0) {
    flags.push({
      level: "danger",
      text: `The penalty allowance uses the whole ${dbText(gapMdb)} between transmit power and receiver sensitivity, which leaves nothing for the link.`,
    });
  }

  if (verdict === "fail") {
    const over = -remainingMdb;
    const parts = [
      `Link loss of ${dbText(totalMdb)} is ${dbText(over)} more than the ${dbText(Math.max(0, budgetMdb))} the optic allows.`,
    ];
    if (input.connectors > 2 && connectorMdb > 0) {
      parts.push(
        `Connectors account for ${dbText(connectorMdb)} of it, and each mated pair costs ${dbText(toMdb(input.connectorLossDb))}${
          connectorEquivM !== null ? `, as much as ${lengthText(connectorEquivM)} of this fiber` : ""
        }.`,
      );
    }
    parts.push("Remove a connector pair or a splice, shorten the run, use lower-loss parts, or choose an optic with more budget.");
    flags.push({ level: "danger", text: parts.join(" ") });
  } else if (verdict === "tight") {
    flags.push({
      level: "warn",
      text: `${dbText(remainingMdb)} is left, which is less than the ${dbText(marginMdb)} safety margin. The link should work today but has little room for a repair splice, a dirty connector or aging.`,
    });
  }

  return {
    fiberMdb,
    connectorMdb,
    spliceMdb,
    totalMdb,
    gapMdb,
    penaltyMdb,
    budgetMdb,
    remainingMdb,
    marginMdb,
    spareMdb,
    verdict,
    lossLimitedM,
    connectorEquivM,
    standardReachM,
    exceedsReach,
    wrongMedia,
    flags,
  };
}
