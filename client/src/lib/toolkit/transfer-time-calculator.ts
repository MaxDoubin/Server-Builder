/**
 * Transfer time arithmetic.
 *
 * Sizes are parsed into exact decimals with BigInt, so "1.1 TiB" becomes
 * exactly 1,209,462,790,553.6 bytes rather than whatever a double rounds it
 * to. Rates and durations are ordinary doubles: a time estimate does not
 * need more than fifteen significant digits, and the inputs are capped far
 * below where a double loses whole units.
 *
 * Prefixes follow IEC 80000-13. Kilo, mega, giga and tera are powers of
 * 1000 (SI). Kibi, mebi, gibi and tebi are powers of 1024 (IEC). Link rates
 * are always SI: 1 Gbps is 10^9 bits per second, never 2^30.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ---------------------------------------------------------------- decimals */

/** An exact non-negative decimal: the value is m * 10^e. */
export interface Decimal {
  m: bigint;
  e: number;
}

/** A non-negative rational whose denominator is a power of ten (or 1). */
export interface Rational {
  num: bigint;
  den: bigint;
}

export type Parsed<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & T);

/** Longer than this is not a number anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 40;

/** Exponents beyond this are refused before any BigInt power is taken. */
const MAX_EXPONENT = 400;

const PLAIN = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:[eE][+-]?\d+)?$/;

/**
 * Parses a plain decimal such as 4.7, 1500, .5, 1e9 or 1,500 into an exact
 * value. Spaces and underscores between digits are ignored. Commas are
 * accepted only as thousands separators, because "1,5" is ambiguous between
 * one and a half and fifteen and guessing wrong is worse than asking.
 */
export function parseDecimal(raw: string): Parsed<{ value: Decimal; num: number }> {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return {
      kind: "error",
      message: `That is longer than ${MAX_INPUT_LENGTH} characters. Enter a plain number such as 4.7 or 1e9.`,
    };
  }

  let text = trimmed.replace(/[\s_]/g, "");
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-")) {
    return { kind: "error", message: "Enter a positive number. A negative value has no meaning here." };
  }
  if (text.includes(",")) {
    if (!GROUPED.test(text)) {
      return {
        kind: "error",
        message: "Commas are read as thousands separators, as in 1,500. For a fraction, use a point: 1.5.",
      };
    }
    text = text.replace(/,/g, "");
  }

  const match = PLAIN.exec(text);
  const intPart = match?.[1] ?? "";
  const fracPart = match?.[2] ?? "";
  if (!match || (intPart === "" && fracPart === "")) {
    return { kind: "error", message: "Enter a plain decimal number such as 4.7, 1500 or 1e9." };
  }

  const exp = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isFinite(exp) || Math.abs(exp) > MAX_EXPONENT) {
    return { kind: "error", message: "That exponent is out of range. Write the number with a smaller power of ten." };
  }

  let m = BigInt((intPart + fracPart).replace(/^0+(?=\d)/, "") || "0");
  let e = exp - fracPart.length;
  if (m === 0n) {
    e = 0;
  } else {
    while (m % 10n === 0n) {
      m /= 10n;
      e += 1;
    }
  }
  const num = Number(`${m}e${e}`);
  if (!Number.isFinite(num)) {
    return { kind: "error", message: "That number is too large to work with." };
  }
  return { kind: "ok", value: { m, e }, num };
}

/** value * factor, kept exact. */
export function scaleDecimal(d: Decimal, factor: bigint): Rational {
  if (d.e >= 0) return { num: d.m * factor * 10n ** BigInt(d.e), den: 1n };
  return { num: d.m * factor, den: 10n ** BigInt(-d.e) };
}

export function rationalToNumber(r: Rational): number {
  const whole = r.num / r.den;
  const rest = r.num % r.den;
  return Number(whole) + Number(rest) / Number(r.den);
}

/** Thousands separators for a whole number, without going through a double. */
export function groupDigits(n: bigint): string {
  const digits = n.toString();
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Prints an exact rational with a power-of-ten denominator as a decimal.
 * Fractions longer than maxFraction digits are cut and flagged inexact.
 */
export function formatRational(r: Rational, maxFraction = 6): { text: string; exact: boolean } {
  const whole = r.num / r.den;
  const rest = r.num % r.den;
  if (rest === 0n) return { text: groupDigits(whole), exact: true };
  const places = r.den.toString().length - 1;
  let frac = rest.toString().padStart(places, "0").replace(/0+$/, "");
  let exact = true;
  if (frac.length > maxFraction) {
    frac = frac.slice(0, maxFraction).replace(/0+$/, "");
    exact = false;
  }
  return { text: frac ? `${groupDigits(whole)}.${frac}` : groupDigits(whole), exact };
}

/* ------------------------------------------------------------------- units */

export type SizeUnit = "B" | "KB" | "KiB" | "MB" | "MiB" | "GB" | "GiB" | "TB" | "TiB";

export interface SizeUnitInfo {
  id: SizeUnit;
  name: string;
  bytes: bigint;
  system: "SI" | "IEC" | "none";
  /** How the multiplier is written, for the explanation line. */
  power: string;
  /** The unit with the same prefix letter in the other system. */
  partner: SizeUnit | null;
}

export const SIZE_UNITS: SizeUnitInfo[] = [
  { id: "B", name: "bytes", bytes: 1n, system: "none", power: "1", partner: null },
  { id: "KB", name: "kilobytes", bytes: 1000n, system: "SI", power: "10^3", partner: "KiB" },
  { id: "KiB", name: "kibibytes", bytes: 1024n, system: "IEC", power: "2^10", partner: "KB" },
  { id: "MB", name: "megabytes", bytes: 1000n ** 2n, system: "SI", power: "10^6", partner: "MiB" },
  { id: "MiB", name: "mebibytes", bytes: 1024n ** 2n, system: "IEC", power: "2^20", partner: "MB" },
  { id: "GB", name: "gigabytes", bytes: 1000n ** 3n, system: "SI", power: "10^9", partner: "GiB" },
  { id: "GiB", name: "gibibytes", bytes: 1024n ** 3n, system: "IEC", power: "2^30", partner: "GB" },
  { id: "TB", name: "terabytes", bytes: 1000n ** 4n, system: "SI", power: "10^12", partner: "TiB" },
  { id: "TiB", name: "tebibytes", bytes: 1024n ** 4n, system: "IEC", power: "2^40", partner: "TB" },
];

export function sizeUnit(id: SizeUnit): SizeUnitInfo {
  return SIZE_UNITS.find((u) => u.id === id) ?? SIZE_UNITS[0];
}

export type RateUnit = "bps" | "kbps" | "Mbps" | "Gbps";

export const RATE_UNITS: { id: RateUnit; bitsPerSecond: number; exp: number }[] = [
  { id: "bps", bitsPerSecond: 1, exp: 0 },
  { id: "kbps", bitsPerSecond: 1e3, exp: 3 },
  { id: "Mbps", bitsPerSecond: 1e6, exp: 6 },
  { id: "Gbps", bitsPerSecond: 1e9, exp: 9 },
];

export function rateUnit(id: RateUnit) {
  return RATE_UNITS.find((u) => u.id === id) ?? RATE_UNITS[2];
}

export type DurationUnit = "s" | "min" | "h" | "d";

export const DURATION_UNITS: { id: DurationUnit; label: string; seconds: number }[] = [
  { id: "s", label: "seconds", seconds: 1 },
  { id: "min", label: "minutes", seconds: 60 },
  { id: "h", label: "hours", seconds: 3600 },
  { id: "d", label: "days", seconds: 86400 },
];

/* -------------------------------------------------------------------- caps */

/** 1 EiB. Past this the question is not a transfer time. */
export const MAX_BYTES = 2n ** 60n;
/** 1 Pbps, well past any single link in service. */
export const MAX_RATE_BPS = 1e15;
/** Slower than one bit per second is not a link. */
export const MIN_RATE_BPS = 1;
export const MAX_OVERHEAD_PCT = 99.9;
/** About 317 years. */
export const MAX_DURATION_S = 1e10;
export const MIN_DURATION_S = 1e-6;

/* ------------------------------------------------------------ field parsers */

export function parseSize(
  raw: string,
  unit: SizeUnit,
): Parsed<{ bytes: Rational; bytesNum: number }> {
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const bytes = scaleDecimal(parsed.value, sizeUnit(unit).bytes);
  if (bytes.num > 0n && bytes.num < bytes.den) {
    return { kind: "error", message: "The smallest size accepted is 1 byte. Nothing smaller crosses a link." };
  }
  if (bytes.num > MAX_BYTES * bytes.den) {
    return {
      kind: "error",
      message: "The cap is 1 EiB (2^60 bytes, about 1.15 million TB). Enter a smaller size.",
    };
  }
  return { kind: "ok", bytes, bytesNum: rationalToNumber(bytes) };
}

export function parseRate(raw: string, unit: RateUnit): Parsed<{ bps: number }> {
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const bps = parsed.num * rateUnit(unit).bitsPerSecond;
  if (bps === 0) return { kind: "error", message: "The link speed has to be greater than zero." };
  if (bps < MIN_RATE_BPS) return { kind: "error", message: "The slowest rate accepted is 1 bps." };
  if (bps > MAX_RATE_BPS) {
    return { kind: "error", message: "The cap is 1 Pbps (10^15 bits per second). Enter a slower rate." };
  }
  return { kind: "ok", bps };
}

/** Empty means no overhead, which is a legitimate answer rather than an error. */
export function parseOverhead(raw: string): Parsed<{ pct: number }> {
  if (raw.trim() === "") return { kind: "ok", pct: 0 };
  const parsed = parseDecimal(raw.trim().replace(/%$/, ""));
  if (parsed.kind !== "ok") return parsed;
  if (parsed.num > MAX_OVERHEAD_PCT) {
    return {
      kind: "error",
      message: `Overhead is a percentage from 0 to ${MAX_OVERHEAD_PCT}. At 100 percent nothing but overhead crosses the link.`,
    };
  }
  return { kind: "ok", pct: parsed.num };
}

export function parseDuration(raw: string, unit: DurationUnit): Parsed<{ seconds: number }> {
  const parsed = parseDecimal(raw);
  if (parsed.kind !== "ok") return parsed;
  const per = DURATION_UNITS.find((u) => u.id === unit)?.seconds ?? 1;
  const seconds = parsed.num * per;
  if (seconds === 0) return { kind: "error", message: "The time has to be greater than zero." };
  if (seconds < MIN_DURATION_S) return { kind: "error", message: "The shortest time accepted is 1 microsecond." };
  if (seconds > MAX_DURATION_S) {
    return { kind: "error", message: "The cap is 10^10 seconds, about 317 years. Enter a shorter time." };
  }
  return { kind: "ok", seconds };
}

/* -------------------------------------------------------------------- math */

/** Fraction of the line rate left for payload. */
export function efficiency(overheadPct: number): number {
  return 1 - overheadPct / 100;
}

/** Seconds to move this many bytes over a line rate, after overhead. */
export function transferSeconds(bytes: number, lineBps: number, overheadPct: number): number {
  return (bytes * 8) / (lineBps * efficiency(overheadPct));
}

/** Line rate needed to move this many bytes in this many seconds, after overhead. */
export function requiredLineBps(bytes: number, seconds: number, overheadPct: number): number {
  return (bytes * 8) / seconds / efficiency(overheadPct);
}

/**
 * Wire overhead of TCP over Ethernet, as a percentage of the line rate.
 *
 * IEEE 802.3 spends 38 bytes of wire time per frame outside the IP packet:
 * 7 preamble + 1 start delimiter + 14 MAC header + 4 FCS + 12 interframe
 * gap. headerBytes is what IP and TCP take from the MTU: 40 for IPv4 with
 * a bare TCP header, 52 with the 12 byte timestamp option (RFC 7323), 60
 * for IPv6.
 */
export const ETHERNET_FRAMING_BYTES = 38;

export function ethernetOverheadPct(mtu: number, headerBytes: number): number {
  return (1 - (mtu - headerBytes) / (mtu + ETHERNET_FRAMING_BYTES)) * 100;
}

/** Overhead rounded to two places, as the input field holds it. */
export function overheadString(pct: number): string {
  return String(Math.round(pct * 100) / 100);
}

export const OVERHEAD_CHOICES: { label: string; pct: string; note: string }[] = [
  { label: "None", pct: "0", note: "The raw line rate, or a figure that is already payload." },
  {
    label: "TCP/IPv4, 1500 MTU",
    pct: overheadString(ethernetOverheadPct(1500, 40)),
    note: "1460 bytes of payload per 1538 bytes of wire time.",
  },
  {
    label: "With TCP timestamps",
    pct: overheadString(ethernetOverheadPct(1500, 52)),
    note: "1448 bytes per frame. Linux and macOS send timestamps by default.",
  },
  {
    label: "TCP/IPv6, 1500 MTU",
    pct: overheadString(ethernetOverheadPct(1500, 60)),
    note: "1440 bytes per frame: the IPv6 header is 40 bytes, not 20.",
  },
  {
    label: "TCP/IPv4, 9000 MTU",
    pct: overheadString(ethernetOverheadPct(9000, 40)),
    note: "Jumbo frames spread the same framing cost over six times the payload.",
  },
];

export interface LinkPreset {
  id: string;
  label: string;
  value: string;
  unit: RateUnit;
  overhead: string;
  note: string;
}

export const LINK_PRESETS: LinkPreset[] = [
  {
    id: "fast-ethernet",
    label: "100 Mbps",
    value: "100",
    unit: "Mbps",
    overhead: overheadString(ethernetOverheadPct(1500, 40)),
    note: "Fast Ethernet, TCP over IPv4 with a 1500 byte MTU.",
  },
  {
    id: "gigabit-lan",
    label: "1 Gbps LAN",
    value: "1",
    unit: "Gbps",
    overhead: overheadString(ethernetOverheadPct(1500, 40)),
    note: "Gigabit Ethernet with the same framing.",
  },
  {
    id: "gigabit-fiber",
    label: "Gigabit fiber",
    value: "940",
    unit: "Mbps",
    overhead: "0",
    note: "What a speed test on a gigabit plan typically reports. That figure is already TCP payload, so no overhead is added.",
  },
  {
    id: "10gbe",
    label: "10 GbE",
    value: "10",
    unit: "Gbps",
    overhead: overheadString(ethernetOverheadPct(1500, 40)),
    note: "10 Gigabit Ethernet at a 1500 byte MTU. Jumbo frames cut the overhead below 1 percent.",
  },
  {
    id: "usb3",
    label: "USB 3 (5 Gbps)",
    value: "5",
    unit: "Gbps",
    overhead: "20",
    note: "USB 3.2 Gen 1 signals at 5 Gbit/s with 8b/10b line coding, which alone costs 20 percent. Protocol overhead takes real drives lower again.",
  },
];

/* -------------------------------------------------------------- formatting */

/** A number to a given count of significant digits, with thousands separators. */
export function formatSig(n: number, sig = 4): string {
  if (!Number.isFinite(n)) return "too large to show";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e21 || abs < 1e-6) return n.toExponential(sig - 1);
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: sig }).format(n);
}

/**
 * Scales a value by powers of `base` and picks the unit that leaves one to
 * three digits before the point. The rounding is done before the unit is
 * chosen, so 999.96 kbps prints as 1 Mbps and not as 1,000 kbps.
 */
function scaled(value: number, base: number, units: string[], sig: number): string {
  if (!Number.isFinite(value)) return "too large to show";
  if (value === 0) return `0 ${units[0]}`;
  let i = 0;
  while (i < units.length - 1 && value >= base ** (i + 1)) i += 1;
  let shown = Number((value / base ** i).toPrecision(sig));
  if (shown >= base && i < units.length - 1) {
    i += 1;
    shown = Number((value / base ** i).toPrecision(sig));
  }
  return `${formatSig(shown, sig)} ${units[i]}`;
}

export function formatBitRate(bps: number, sig = 4): string {
  return scaled(bps, 1000, ["bps", "kbps", "Mbps", "Gbps", "Tbps", "Pbps", "Ebps"], sig);
}

export function formatByteRateSI(bps: number, sig = 4): string {
  return scaled(bps / 8, 1000, ["B/s", "kB/s", "MB/s", "GB/s", "TB/s", "PB/s", "EB/s"], sig);
}

export function formatByteRateIEC(bps: number, sig = 4): string {
  return scaled(bps / 8, 1024, ["B/s", "KiB/s", "MiB/s", "GiB/s", "TiB/s", "PiB/s", "EiB/s"], sig);
}

export function formatBytesSI(bytes: number, sig = 4): string {
  return scaled(bytes, 1000, ["B", "kB", "MB", "GB", "TB", "PB", "EB"], sig);
}

export function formatBytesIEC(bytes: number, sig = 4): string {
  return scaled(bytes, 1024, ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"], sig);
}

const YEAR_S = 365.25 * 86400;

/**
 * A duration in the units a person would say it in: 8.59 s, 2 min 5 s,
 * 22 h 13 min 20 s, 3 d 4 h 0 min, 12.5 years.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "longer than can be shown";
  if (seconds === 0) return "0 s";
  if (seconds < 1e-9) return "under 1 ns";
  if (seconds < 1e-6) return `${formatSig(seconds * 1e9, 3)} ns`;
  if (seconds < 1e-3) return `${formatSig(seconds * 1e6, 3)} µs`;
  if (seconds < 1) {
    const ms = Number((seconds * 1e3).toPrecision(3));
    if (ms < 1000) return `${formatSig(ms, 3)} ms`;
  }
  if (seconds < 60) {
    const rounded = Number(seconds.toPrecision(3));
    if (rounded < 60) return `${formatSig(rounded, 3)} s`;
  }
  if (seconds < 86400) {
    const total = Math.round(seconds);
    if (total < 86400) {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return h > 0 ? `${h} h ${m} min ${s} s` : `${m} min ${s} s`;
    }
  }
  if (seconds < YEAR_S) {
    const totalMin = Math.round(seconds / 60);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    return `${d} d ${h} h ${m} min`;
  }
  const years = seconds / YEAR_S;
  return `${formatSig(years, 3)} years`;
}
