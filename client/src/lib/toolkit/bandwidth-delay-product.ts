/**
 * Bandwidth-delay product and TCP window arithmetic.
 *
 * The BDP is bandwidth times round trip time: the number of bits that have
 * to be in flight, sent but not yet acknowledged, for a sender to keep a
 * path busy. RFC 7323 section 1.1 calls a path whose BDP is large a "long,
 * fat network" and is the reason window scaling exists.
 *
 * The product is computed exactly with BigInt from the decimal inputs, so
 * the window a path needs is rounded up from the true value rather than from
 * a double that came out a hair over or under. Throughputs are doubles.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

import {
  type Decimal,
  type Parsed,
  type RateUnit,
  type SizeUnit,
  parseDecimal,
  rateUnit,
  scaleDecimal,
  sizeUnit,
} from "./transfer-time-calculator";

/* ------------------------------------------------------------- TCP limits */

/** RFC 9293 section 3.1: the window field is 16 bits. */
export const MAX_UNSCALED_WINDOW = 65535;

/** RFC 7323 section 2.3: a shift count above 14 is treated as 14. */
export const MAX_WINDOW_SHIFT = 14;

/** 65,535 * 2^14 = 1,073,725,440 bytes, which is 2^30 - 2^14: 16 KiB short of 1 GiB. */
export const MAX_SCALED_WINDOW = MAX_UNSCALED_WINDOW * 2 ** MAX_WINDOW_SHIFT;

/** IPv4 total length is 16 bits, less 20 bytes of IP header and 20 of TCP. */
export const MAX_MSS = 65495;

/**
 * Mathis, Semke, Mahdavi and Ott, "The Macroscopic Behavior of the TCP
 * Congestion Avoidance Algorithm", ACM CCR 27(3), 1997. With every segment
 * acknowledged, C = sqrt(3/2), about 1.22. With delayed ACKs (one ACK per
 * two segments) C = sqrt(3/4), about 0.87.
 */
export const MATHIS_C_EVERY_SEGMENT = Math.sqrt(3 / 2);
export const MATHIS_C_DELAYED_ACK = Math.sqrt(3 / 4);

/* ------------------------------------------------------------------- units */

export type RttUnit = "us" | "ms" | "s";

export const RTT_UNITS: { id: RttUnit; label: string; exp: number }[] = [
  { id: "us", label: "µs", exp: -6 },
  { id: "ms", label: "ms", exp: -3 },
  { id: "s", label: "s", exp: 0 },
];

export const WINDOW_UNITS: SizeUnit[] = ["B", "KB", "KiB", "MB", "MiB"];

/* -------------------------------------------------------------------- caps */

export const MAX_BANDWIDTH_BPS = 1e15;
export const MIN_RTT_S = 1e-6;
export const MAX_RTT_S = 60;

/* ------------------------------------------------------------ field parsers */

export function parseBandwidth(
  raw: string,
  unit: RateUnit,
): Parsed<{ bps: number; exact: Decimal }> {
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const exact: Decimal = { m: parsed.value.m, e: parsed.value.e + rateUnit(unit).exp };
  const bps = parsed.num * rateUnit(unit).bitsPerSecond;
  // Zero is tested on the exact mantissa, so an underflowing 1e-400 gets the
  // minimum-rate message rather than "greater than zero".
  if (parsed.value.m === 0n) return { kind: "error", message: "The bandwidth has to be greater than zero." };
  if (bps < 1) return { kind: "error", message: "The slowest rate accepted is 1 bps." };
  if (bps > MAX_BANDWIDTH_BPS) {
    return { kind: "error", message: "The cap is 1 Pbps (10^15 bits per second). Enter a slower rate." };
  }
  return { kind: "ok", bps, exact };
}

export function parseRtt(raw: string, unit: RttUnit): Parsed<{ seconds: number; exact: Decimal }> {
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const exp = RTT_UNITS.find((u) => u.id === unit)?.exp ?? -3;
  const exact: Decimal = { m: parsed.value.m, e: parsed.value.e + exp };
  const seconds = parsed.num * 10 ** exp;
  if (parsed.value.m === 0n) return { kind: "error", message: "The round trip time has to be greater than zero." };
  if (seconds < MIN_RTT_S) return { kind: "error", message: "The shortest round trip accepted is 1 µs." };
  if (seconds > MAX_RTT_S) return { kind: "error", message: "The cap is 60 seconds of round trip time." };
  return { kind: "ok", seconds, exact };
}

/**
 * A window in whole bytes. Fractions are dropped, since TCP counts in
 * octets, and anything above what TCP can advertise is clamped to it with
 * a flag, so the page can say so instead of reporting an impossible window.
 */
export function parseWindow(
  raw: string,
  unit: SizeUnit,
): Parsed<{ bytes: number; clamped: boolean; truncated: boolean }> {
  // Not parseSize: its 1 EiB cap is about transfer sizes, and a window past
  // TCP's own limit is clamped below rather than refused.
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const bytes = scaleDecimal(parsed.value, sizeUnit(unit).bytes);
  const whole = bytes.num / bytes.den;
  const truncated = bytes.num % bytes.den !== 0n;
  if (whole === 0n) {
    return { kind: "error", message: "A window under one byte lets nothing through. Enter at least 1 byte." };
  }
  if (whole > BigInt(MAX_SCALED_WINDOW)) {
    return { kind: "ok", bytes: MAX_SCALED_WINDOW, clamped: true, truncated };
  }
  return { kind: "ok", bytes: Number(whole), clamped: false, truncated };
}

export function parseMss(raw: string): Parsed<{ bytes: number }> {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (!/^\d{1,6}$/.test(text)) {
    return { kind: "error", message: "The MSS is a whole number of bytes, such as 1460." };
  }
  const bytes = Number(text);
  if (bytes < 1 || bytes > MAX_MSS) {
    return { kind: "error", message: `The MSS runs from 1 to ${MAX_MSS} bytes. Ethernet with IPv4 is usually 1460.` };
  }
  return { kind: "ok", bytes };
}

/** Loss as a percentage. Empty means "skip the estimate", not zero. */
export function parseLossPct(raw: string): Parsed<{ fraction: number }> {
  if (raw.trim() === "") return { kind: "empty" };
  const parsed = parseDecimal(raw.trim().replace(/%$/, ""));
  if (parsed.kind === "empty") {
    return { kind: "error", message: "Enter a number before the percent sign, or clear the field to skip the estimate." };
  }
  if (parsed.kind !== "ok") return parsed;
  if (parsed.num >= 100) {
    return { kind: "error", message: "Loss is a percentage below 100. At 100 percent nothing arrives." };
  }
  return { kind: "ok", fraction: parsed.num / 100 };
}

/* -------------------------------------------------------------------- math */

/** Bandwidth (bits per second) times RTT (seconds), exactly, in bits. */
export function bdpBits(bandwidth: Decimal, rtt: Decimal): Decimal {
  return { m: bandwidth.m * rtt.m, e: bandwidth.e + rtt.e };
}

export function decimalToNumber(d: Decimal): number {
  return Number(`${d.m}e${d.e}`);
}

/** ceil(bits / 8): the whole bytes a window must hold to cover the product. */
export function ceilBytes(bits: Decimal): bigint {
  if (bits.e >= 0) return (bits.m * 10n ** BigInt(bits.e) + 7n) / 8n;
  const den = 8n * 10n ** BigInt(-bits.e);
  return (bits.m + den - 1n) / den;
}

/**
 * RFC 7323 section 2: the advertised window is the 16 bit field shifted
 * left by the negotiated count. Returns the smallest shift whose largest
 * window covers `bytes`, or null when even a shift of 14 cannot.
 */
export function requiredWindowShift(bytes: bigint): number | null {
  for (let shift = 0; shift <= MAX_WINDOW_SHIFT; shift += 1) {
    if (BigInt(MAX_UNSCALED_WINDOW) << BigInt(shift) >= bytes) return shift;
  }
  return null;
}

/** The value the 16 bit field must carry, rounded up, at a given shift. */
export function windowFieldFor(bytes: bigint, shift: number): bigint {
  const unit = 1n << BigInt(shift);
  return (bytes + unit - 1n) / unit;
}

/** The most a window of this size can deliver per round trip, in bits per second. */
export function windowThroughputBps(windowBytes: number, rttSeconds: number): number {
  return (windowBytes * 8) / rttSeconds;
}

/**
 * The Mathis estimate, (MSS / RTT) * (C / sqrt(p)), in bits per second.
 * Null when p is zero, where the model has no loss ceiling to report.
 * It is an approximation of Reno-style congestion avoidance under light,
 * steady loss: it ignores timeouts, slow start and the receive window.
 */
export function mathisThroughputBps(
  mssBytes: number,
  rttSeconds: number,
  lossFraction: number,
  c: number = MATHIS_C_EVERY_SEGMENT,
): number | null {
  if (lossFraction <= 0 || rttSeconds <= 0) return null;
  return ((mssBytes * 8) / rttSeconds) * (c / Math.sqrt(lossFraction));
}

/**
 * Whether a window of whole bytes covers the product, decided exactly.
 * A window W fills the link when W * 8 >= bandwidth * RTT, and since W is
 * an integer that is the same as W >= ceil(bits / 8). Comparing the doubles
 * W * 8 / RTT and bandwidth instead gets this wrong at the boundary: with
 * 1 Gbps and 70 ms, 8,750,000 * 8 / 0.07 comes out as 999,999,999.9999999.
 */
export function windowCoversBdp(windowBytes: number, neededBytes: bigint): boolean {
  if (!Number.isFinite(windowBytes) || windowBytes < 0) return false;
  return BigInt(Math.floor(windowBytes)) >= neededBytes;
}

export type Ceiling = "link" | "window" | "loss";

/**
 * Which of the three limits binds a single stream, and at what rate.
 * `windowCovers` is the exact answer from windowCoversBdp: when it is true
 * the window cannot be the bottleneck, whatever the doubles say, and when
 * it is false the window rate is below the link rate by definition.
 */
export function bindingCeiling(
  linkBps: number,
  windowBps: number,
  lossBps: number | null,
  windowCovers: boolean = windowBps >= linkBps,
): { ceiling: Ceiling; bps: number } {
  let best: { ceiling: Ceiling; bps: number } = { ceiling: "link", bps: linkBps };
  if (!windowCovers) best = { ceiling: "window", bps: Math.min(windowBps, linkBps) };
  if (lossBps !== null && lossBps < best.bps) best = { ceiling: "loss", bps: lossBps };
  return best;
}

export interface PathPreset {
  id: string;
  label: string;
  bandwidth: string;
  bandwidthUnit: RateUnit;
  rtt: string;
  rttUnit: RttUnit;
  note: string;
}

export const PATH_PRESETS: PathPreset[] = [
  {
    id: "lan",
    label: "LAN",
    bandwidth: "1",
    bandwidthUnit: "Gbps",
    rtt: "0.5",
    rttUnit: "ms",
    note: "Gigabit inside one building.",
  },
  {
    id: "regional",
    label: "Regional",
    bandwidth: "1",
    bandwidthUnit: "Gbps",
    rtt: "20",
    rttUnit: "ms",
    note: "Light in fiber covers about 200 km per ms, so this allows at most about 2,000 km each way, less on real routes.",
  },
  {
    id: "coast",
    label: "US coast to coast",
    bandwidth: "1",
    bandwidthUnit: "Gbps",
    rtt: "70",
    rttUnit: "ms",
    note: "Roughly the round trip between New York and Los Angeles.",
  },
  {
    id: "atlantic",
    label: "Transatlantic",
    bandwidth: "10",
    bandwidthUnit: "Gbps",
    rtt: "75",
    rttUnit: "ms",
    note: "Roughly New York to London.",
  },
  {
    id: "geo",
    label: "GEO satellite",
    bandwidth: "100",
    bandwidthUnit: "Mbps",
    rtt: "600",
    rttUnit: "ms",
    note: "The signal climbs to geostationary orbit and back twice per round trip: about half a second of propagation delay.",
  },
  {
    id: "research",
    label: "100G research link",
    bandwidth: "100",
    bandwidthUnit: "Gbps",
    rtt: "150",
    rttUnit: "ms",
    note: "Intercontinental. The product is larger than any TCP window.",
  },
];
