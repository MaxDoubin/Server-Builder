/**
 * Byte and bit unit conversion with exact arithmetic.
 *
 * Every quantity is held as a rational number of bits, num / den, in BigInt.
 * The input is a decimal, so den starts as a power of ten, and every unit is
 * a power of 1000 or 1024 times 1 or 8 bits, so every denominator that can
 * appear has only 2 and 5 as prime factors. That means every result has a
 * terminating decimal expansion, and it is printed exactly, digit for digit,
 * with no floating point anywhere on the path.
 *
 * Prefixes follow IEC 80000-13 and the SI Brochure: kilo, mega, giga, tera,
 * peta and exa are powers of 1000; kibi, mebi, gibi, tebi, pebi and exbi are
 * powers of 1024. A byte is eight bits. A lowercase b is a bit and an
 * uppercase B is a byte, as in IEEE 1541.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ---------------------------------------------------------------- numbers */

/** A non-negative rational. den is always positive. */
export interface Rational {
  num: bigint;
  den: bigint;
}

export type Parsed<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | ({ kind: "ok" } & T);

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function reduce(r: Rational): Rational {
  if (r.num === 0n) return { num: 0n, den: 1n };
  const g = gcd(r.num, r.den);
  return { num: r.num / g, den: r.den / g };
}

/** Thousands separators for a whole number, without going through a double. */
export function groupDigits(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Longest fractional expansion this module will ever print. */
const MAX_FRACTION_DIGITS = 400;

/**
 * The exact decimal expansion of r. The fraction is empty for a whole number
 * and never has trailing zeros. `terminates` is false only if the
 * denominator has a prime factor other than 2 or 5, which no unit here
 * produces; the expansion is then cut at MAX_FRACTION_DIGITS.
 */
export function exactDecimal(input: Rational): { int: bigint; frac: string; terminates: boolean } {
  const r = reduce(input);
  let rest = r.den;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos += 1;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  const terminates = rest === 1n;
  const places = terminates ? Math.max(twos, fives) : MAX_FRACTION_DIGITS;
  const scale = 10n ** BigInt(places);
  const scaled = (r.num * scale) / r.den;
  const int = scaled / scale;
  const frac = places === 0 ? "" : (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return { int, frac, terminates };
}

/** The plain exact value with no grouping, for copying into another program. */
export function plainDecimal(r: Rational): string {
  const { int, frac } = exactDecimal(r);
  return frac ? `${int}.${frac}` : int.toString();
}

export type Precision = number | "exact";

export interface Formatted {
  /** Grouped for reading, with commas between thousands. */
  text: string;
  /** False when the shown digits are a rounding of a longer exact value. */
  exact: boolean;
  /** The exact value with no grouping. */
  plain: string;
}

/**
 * Formats r for reading. With a number of significant digits, the whole part
 * is always shown in full, and the fraction is rounded half up so that the
 * total reaches that many significant digits. "exact" prints every digit.
 */
export function formatRational(input: Rational, precision: Precision): Formatted {
  const r = reduce(input);
  const { int, frac } = exactDecimal(r);
  const plain = frac ? `${int}.${frac}` : int.toString();
  const exactText = frac ? `${groupDigits(int)}.${frac}` : groupDigits(int);
  if (precision === "exact" || frac === "") return { text: exactText, exact: true, plain };

  const sig = Math.max(1, Math.floor(precision));
  let places: number;
  if (int > 0n) {
    places = Math.max(0, sig - int.toString().length);
  } else {
    const leadingZeros = frac.length - frac.replace(/^0+/, "").length;
    places = leadingZeros + sig;
  }
  if (frac.length <= places) return { text: exactText, exact: true, plain };

  const scale = 10n ** BigInt(places);
  const scaled = r.num * scale;
  let q = scaled / r.den;
  if ((scaled % r.den) * 2n >= r.den) q += 1n;
  const whole = q / scale;
  const part = places === 0 ? "" : (q % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return { text: part ? `${groupDigits(whole)}.${part}` : groupDigits(whole), exact: false, plain };
}

/** r rounded half up to a fixed number of decimals, for short labels. */
export function fixed(input: Rational, places: number): string {
  const r = reduce(input);
  const scale = 10n ** BigInt(places);
  const scaled = r.num * scale;
  let q = scaled / r.den;
  if ((scaled % r.den) * 2n >= r.den) q += 1n;
  const whole = q / scale;
  if (places === 0) return groupDigits(whole);
  return `${groupDigits(whole)}.${(q % scale).toString().padStart(places, "0")}`;
}

/** r rounded toward zero to a fixed number of decimals, the way Windows Explorer shortens a size. */
export function truncatedFixed(input: Rational, places: number): string {
  const r = reduce(input);
  const scale = 10n ** BigInt(places);
  const q = (r.num * scale) / r.den;
  const whole = q / scale;
  if (places === 0) return groupDigits(whole);
  return `${groupDigits(whole)}.${(q % scale).toString().padStart(places, "0")}`;
}

/* ------------------------------------------------------------------ units */

export type UnitGroup = "base" | "si-bytes" | "iec-bytes" | "si-bits" | "iec-bits";

export interface Unit {
  /** The symbol this page prints. */
  symbol: string;
  name: string;
  /** Size of one of these in bits. */
  bits: bigint;
  group: UnitGroup;
  /** The multiplier, written out for the table. */
  power: string;
}

const SI_PREFIXES = [
  { letter: "k", name: "kilo" },
  { letter: "M", name: "mega" },
  { letter: "G", name: "giga" },
  { letter: "T", name: "tera" },
  { letter: "P", name: "peta" },
  { letter: "E", name: "exa" },
];

const IEC_PREFIXES = [
  { letter: "Ki", name: "kibi" },
  { letter: "Mi", name: "mebi" },
  { letter: "Gi", name: "gibi" },
  { letter: "Ti", name: "tebi" },
  { letter: "Pi", name: "pebi" },
  { letter: "Ei", name: "exbi" },
];

function buildUnits(): Unit[] {
  const units: Unit[] = [
    { symbol: "b", name: "bit", bits: 1n, group: "base", power: "1 bit" },
    { symbol: "B", name: "byte", bits: 8n, group: "base", power: "8 bits" },
  ];
  SI_PREFIXES.forEach((p, i) => {
    const n = i + 1;
    units.push({ symbol: `${p.letter}B`, name: `${p.name}byte`, bits: 8n * 1000n ** BigInt(n), group: "si-bytes", power: `10^${3 * n} bytes` });
  });
  IEC_PREFIXES.forEach((p, i) => {
    const n = i + 1;
    units.push({ symbol: `${p.letter}B`, name: `${p.name}byte`, bits: 8n * 1024n ** BigInt(n), group: "iec-bytes", power: `2^${10 * n} bytes` });
  });
  SI_PREFIXES.forEach((p, i) => {
    const n = i + 1;
    units.push({ symbol: `${p.letter}bit`, name: `${p.name}bit`, bits: 1000n ** BigInt(n), group: "si-bits", power: `10^${3 * n} bits` });
  });
  IEC_PREFIXES.forEach((p, i) => {
    const n = i + 1;
    units.push({ symbol: `${p.letter}bit`, name: `${p.name}bit`, bits: 1024n ** BigInt(n), group: "iec-bits", power: `2^${10 * n} bits` });
  });
  return units;
}

export const UNITS: Unit[] = buildUnits();

export const UNIT_GROUPS: { id: UnitGroup; label: string }[] = [
  { id: "base", label: "Bits and bytes" },
  { id: "si-bytes", label: "Bytes, SI (powers of 1000)" },
  { id: "iec-bytes", label: "Bytes, IEC (powers of 1024)" },
  { id: "si-bits", label: "Bits, SI (powers of 1000)" },
  { id: "iec-bits", label: "Bits, IEC (powers of 1024)" },
];

export function unitBySymbol(symbol: string): Unit | undefined {
  return UNITS.find((u) => u.symbol === symbol);
}

/** value / unit, in that unit. */
export function inUnit(bits: Rational, unit: Unit): Rational {
  return reduce({ num: bits.num, den: bits.den * unit.bits });
}

/* ---------------------------------------------------------------- parsing */

/** Longer than this is not a size anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 64;

/** Powers of ten beyond this in the exponent are refused before any BigInt power is taken. */
export const MAX_EXPONENT = 30;

/** The largest quantity accepted: 2^80 bytes, one yobibyte. */
export const MAX_BITS = 8n * 2n ** 80n;

export interface Quantity {
  /** The value in bits, exact. */
  bits: Rational;
  /** The unit the input was read in. */
  unit: Unit;
  /** True when the input was a rate such as Mbps or MB/s. */
  perSecond: boolean;
  /** Plain sentences about how the input was read. */
  notes: string[];
}

const NUMBER = /^(\d[\d,_]*)?(?:\.(\d*))?(?:[eE]([+-]?\d+))?/;
const GROUPED = /^\d{1,3}(?:,\d{3})+$/;

const SI_WORD: Record<string, number> = { kilo: 1, mega: 2, giga: 3, tera: 4, peta: 5, exa: 6 };
const IEC_WORD: Record<string, number> = { kibi: 1, mebi: 2, gibi: 3, tebi: 4, pebi: 5, exbi: 6 };
const LETTER_POWER: Record<string, number> = { k: 1, m: 2, g: 3, t: 4, p: 5, e: 6 };

function error(message: string): { kind: "error"; message: string } {
  return { kind: "error", message };
}

function pick(group: UnitGroup, power: number): Unit {
  const unit = UNITS.filter((u) => u.group === group)[power - 1];
  return unit ?? UNITS[1];
}

type UnitRead = { unit: Unit; notes: string[] } | { error: string };

/**
 * Reads a unit token such as GiB, MB, kbit, Gb, megabytes or b. The token has
 * already had any per-second suffix removed.
 */
function readUnit(token: string, rate: boolean): UnitRead {
  const notes: string[] = [];
  if (token === "") {
    return { unit: UNITS[1], notes: ["No unit was given, so the number is read as bytes."] };
  }

  const lower = token.toLowerCase();

  // Spelled out: bits, bytes, gigabytes, mebibits, octets.
  const word = /^(kilo|mega|giga|tera|peta|exa|kibi|mebi|gibi|tebi|pebi|exbi)?(bit|byte|octet)s?$/.exec(lower);
  if (word) {
    const isBit = word[2] === "bit";
    const prefix = word[1];
    if (!prefix) return { unit: isBit ? UNITS[0] : UNITS[1], notes };
    if (prefix in SI_WORD) return { unit: pick(isBit ? "si-bits" : "si-bytes", SI_WORD[prefix]), notes };
    return { unit: pick(isBit ? "iec-bits" : "iec-bytes", IEC_WORD[prefix]), notes };
  }

  // Symbols: B, b, bit, KiB, kB, KB, Mbit, Gb, GiB, MiBit.
  const symbol = /^([kKmMgGtTpPeE])?([iI])?(B|b|bit|bits|Bit|Bits|BIT|BITS|byte|bytes|Byte|Bytes|BYTE|BYTES)$/.exec(token);
  if (!symbol) {
    if (/^[ZYRQ]i?(B|b|bit|bits|byte|bytes)$/i.test(token)) {
      return {
        error: `"${token}" uses a prefix above exa, which this page does not list. Enter the value in EB or EiB instead (1 ZB is 1,000 EB).`,
      };
    }
    return {
      error: `"${token}" is not a unit this page knows. Use b or B, an SI unit (kB, MB, GB, TB, PB, EB), an IEC unit (KiB, MiB, GiB, TiB, PiB, EiB), or a bit unit such as Mbit or Gb.`,
    };
  }

  const [, letter, binary, suffix] = symbol;
  const suffixLower = suffix.toLowerCase();
  const isBit = suffix === "b" || suffixLower.startsWith("bit");
  const spelled = suffix.length > 1;

  if (!letter) {
    if (binary) return { error: `"${token}" has an i with no prefix letter before it. Write KiB, MiB, GiB and so on.` };
    return { unit: isBit ? UNITS[0] : UNITS[1], notes };
  }

  const power = LETTER_POWER[letter.toLowerCase()];

  if (binary) {
    const up = letter.toUpperCase();
    const iecName = IEC_PREFIXES[power - 1].name;
    if (letter === letter.toLowerCase() && suffix === "b" && !rate) {
      return {
        error: `"${token}" is ambiguous. Write ${up}iB for ${iecName}bytes or ${up}ibit for ${iecName}bits. Case matters here: B is a byte and b is a bit.`,
      };
    }
    if (letter === "k") notes.push(`The IEC prefix is written Ki with a capital K. ${token} was read as Ki${isBit ? "bit" : "B"}.`);
    if (isBit && suffix === "b") notes.push("A lowercase b is a bit. For bytes, write an uppercase B.");
    return { unit: pick(isBit ? "iec-bits" : "iec-bytes", power), notes };
  }

  // A lowercase m, g, t, p or e is not an SI prefix for these (m is milli),
  // and "gb" is as likely to mean gigabytes as gigabits. Only accept it where
  // the reading is not in doubt: a spelled-out bit or byte, or the lowercase
  // rate "mbps", which is universally megabits per second.
  if (letter !== "k" && letter === letter.toLowerCase() && !spelled && !(rate && suffix === "b")) {
    const up = letter.toUpperCase();
    return {
      error: `"${token}" is ambiguous. Write ${up}B for ${SI_PREFIXES[power - 1].name}bytes or ${up}b (${up}bit) for ${SI_PREFIXES[power - 1].name}bits. Case matters here: B is a byte, b is a bit, and a lowercase m means milli.`,
    };
  }

  if (letter === "K") {
    notes.push(
      isBit
        ? "Kb is read as 1000 bits, since the SI kilo is a lowercase k. For 1024 bits, write Kibit."
        : "KB is read as 1000 bytes, since the SI kilo is a lowercase k. Windows and JEDEC memory specs use KB for 1024 bytes; write KiB for that.",
    );
  }
  if (isBit && suffix === "b") {
    notes.push("A lowercase b is a bit. For bytes, write an uppercase B.");
  }
  return { unit: pick(isBit ? "si-bits" : "si-bytes", power), notes };
}

/**
 * Parses a size such as "1.5 GiB", "500GB", "1,000,000 B", "1e9 b",
 * "100 Mbps" or "12.5 MB/s". Rates are read as the same quantity per second.
 */
export function parseQuantity(raw: string): Parsed<Quantity> {
  const input = raw.trim();
  if (input === "") return { kind: "empty" };
  if (input.length > MAX_INPUT_LENGTH) {
    return error(`That is longer than ${MAX_INPUT_LENGTH} characters. Enter a number and a unit, such as 1.5 GiB.`);
  }
  if (input.startsWith("-")) {
    return error("Enter a size of zero or more. A negative number of bytes has no meaning.");
  }

  const body = input.replace(/^\+/, "");
  const match = NUMBER.exec(body);
  const intText = match?.[1] ?? "";
  const fracText = match?.[2] ?? "";
  if (!match || (intText === "" && fracText === "")) {
    return error("Start with a number, such as 1.5 GiB, 500GB or 100 Mbps.");
  }

  let digits = intText.replace(/_/g, "");
  if (digits.includes(",")) {
    if (!GROUPED.test(digits)) {
      return error("Commas are read as thousands separators, as in 1,500 MB. For a fraction, use a point: 1.5 MB.");
    }
    digits = digits.replace(/,/g, "");
  }

  const exponent = match[3] === undefined ? 0 : Number(match[3]);
  if (!Number.isFinite(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
    return error(`The exponent is limited to plus or minus ${MAX_EXPONENT}. Pick a larger unit instead of a larger power of ten.`);
  }

  let token = body.slice(match[0].length).trim();
  let perSecond = false;
  const rate = /^(.*?)(?:\/s|\/sec|\s*per\s*second)$/i.exec(token) ?? /^(.*[bB])ps$/i.exec(token);
  if (rate) {
    token = rate[1].trim();
    perSecond = true;
  }

  const read = readUnit(token, perSecond);
  if ("error" in read) return error(read.error);

  const mantissa = BigInt((digits + fracText).replace(/^0+(?=\d)/, "") || "0");
  const shift = exponent - fracText.length;
  const value: Rational =
    shift >= 0
      ? { num: mantissa * 10n ** BigInt(shift) * read.unit.bits, den: 1n }
      : { num: mantissa * read.unit.bits, den: 10n ** BigInt(-shift) };
  const bits = reduce(value);

  if (bits.num > MAX_BITS * bits.den) {
    return error("The cap is 2^80 bytes (1 YiB, about 1.2 million EB). Enter a smaller size.");
  }

  const notes = [...read.notes];
  if (bits.num > 0n && bits.num < bits.den) {
    notes.push("That is less than one bit, which no storage can hold. The arithmetic is still exact.");
  }
  return { kind: "ok", bits, unit: read.unit, perSecond, notes };
}

/* --------------------------------------------------------------- readings */

/** If the value is a whole number of bytes that is a power of two, its exponent. */
export function powerOfTwoBytes(bits: Rational): number | null {
  const r = reduce(bits);
  if (r.den !== 1n || r.num === 0n || r.num % 8n !== 0n) return null;
  const bytes = r.num / 8n;
  if ((bytes & (bytes - 1n)) !== 0n) return null;
  return bytes.toString(2).length - 1;
}

/**
 * The largest byte unit in one system that the value reaches, so the reading
 * starts with a whole number: 931.32 GiB rather than 0.91 TiB.
 */
export function largestUnit(bits: Rational, system: "si" | "iec"): Unit {
  const group: UnitGroup = system === "si" ? "si-bytes" : "iec-bytes";
  const candidates = UNITS.filter((u) => u.group === group);
  let best = UNITS[1];
  for (const unit of candidates) {
    if (bits.num >= unit.bits * bits.den) best = unit;
  }
  return best;
}

export interface PrefixGap {
  power: number;
  si: string;
  iec: string;
  /** 1024^n / 1000^n: how much larger the IEC unit is. */
  ratio: Rational;
  /** 1 - 1000^n / 1024^n: how much smaller an SI quantity looks in IEC units. */
  shortfall: Rational;
}

/** How far apart the two systems are at each prefix. */
export function prefixGaps(): PrefixGap[] {
  return SI_PREFIXES.map((p, i) => {
    const n = BigInt(i + 1);
    const si = 1000n ** n;
    const iec = 1024n ** n;
    return {
      power: i + 1,
      si: `${p.letter}B`,
      iec: `${IEC_PREFIXES[i].letter}B`,
      ratio: reduce({ num: iec, den: si }),
      shortfall: reduce({ num: iec - si, den: iec }),
    };
  });
}

/** A rational as a percentage, rounded half up to the given decimals. */
export function percent(r: Rational, places = 2): string {
  return fixed({ num: r.num * 100n, den: r.den }, places);
}

/* ----------------------------------------------------------------- drives */

export interface DriveLabel {
  label: string;
  bytes: bigint;
}

export const DRIVE_LABELS: DriveLabel[] = [
  { label: "256 GB", bytes: 256n * 10n ** 9n },
  { label: "500 GB", bytes: 500n * 10n ** 9n },
  { label: "1 TB", bytes: 10n ** 12n },
  { label: "2 TB", bytes: 2n * 10n ** 12n },
  { label: "4 TB", bytes: 4n * 10n ** 12n },
  { label: "8 TB", bytes: 8n * 10n ** 12n },
];

/**
 * IDEMA LBA1-03: the sector count a drive of a given decimal capacity in GB
 * should report, in 512-byte sectors, for capacities of 50 GB and up.
 * LBA = 97,696,368 + 1,953,504 * (GB - 50).
 */
export function idemaSectors(gigabytes: bigint): bigint {
  return 97_696_368n + 1_953_504n * (gigabytes - 50n);
}

/* ------------------------------------------------------------------ links */

export interface LinkSpeed {
  label: string;
  /** Line rate in bits per second. Network rates use SI prefixes. */
  bitsPerSecond: bigint;
}

export const LINK_SPEEDS: LinkSpeed[] = [
  { label: "100 Mbit/s", bitsPerSecond: 100n * 10n ** 6n },
  { label: "1 Gbit/s", bitsPerSecond: 10n ** 9n },
  { label: "2.5 Gbit/s", bitsPerSecond: 25n * 10n ** 8n },
  { label: "10 Gbit/s", bitsPerSecond: 10n ** 10n },
];

/**
 * Wire time for one full-size packet on Ethernet (IEEE 802.3): a 1500-byte IP
 * packet, plus 14 bytes of MAC header, 4 of frame check sequence, 8 of
 * preamble and start delimiter, and a 12-byte interframe gap.
 */
export const WIRE_BYTES_PER_PACKET = 1500n + 14n + 4n + 8n + 12n;

/** TCP payload in that packet with no IP or TCP options: 1500 - 20 - 20 (RFC 791, RFC 9293). */
export const TCP_PAYLOAD_PER_PACKET = 1460n;

/** Bulk TCP payload rate on a link, in bits per second, for full-size packets with no options. */
export function tcpPayloadRate(bitsPerSecond: Rational): Rational {
  return reduce({
    num: bitsPerSecond.num * TCP_PAYLOAD_PER_PACKET,
    den: bitsPerSecond.den * WIRE_BYTES_PER_PACKET,
  });
}

/* ------------------------------------------------------------------ tools */

export interface ToolUnits {
  tool: string;
  base: "1000" | "1024" | "both";
  detail: string;
}

/** Which programs count in which system. */
export const TOOL_UNITS: ToolUnits[] = [
  { tool: "Drive and SSD makers", base: "1000", detail: "1 TB on the label is 10^12 bytes." },
  { tool: "macOS Finder (10.6 and later)", base: "1000", detail: "Matches the label, so a 1 TB drive reads as about 1 TB." },
  { tool: "Windows Explorer", base: "1024", detail: "Divides by 1024 but prints KB, MB, GB, so 1 TB reads as 931 GB." },
  { tool: "df -h, du -h, ls -lh", base: "1024", detail: "GNU coreutils. Prints K, M, G, T with no i." },
  { tool: "df -H, du --si, ls -l --si", base: "1000", detail: "The same tools with SI units, same single letters." },
  { tool: "lsblk", base: "1024", detail: "A 1,000,204,886,016 byte disk shows as 931.5G." },
  { tool: "free -h", base: "1024", detail: "procps-ng prints Mi and Gi, so the unit is unambiguous." },
  { tool: "dd bs=", base: "both", detail: "GNU dd: 1M and 1MiB are 1,048,576 bytes, 1MB is 1,000,000." },
  { tool: "Kubernetes quantities", base: "both", detail: "512Mi is 512 × 2^20 bytes; 512M is 512 × 10^6." },
  { tool: "RAM modules", base: "1024", detail: "16 GB of memory is 16 GiB, by JEDEC convention." },
  { tool: "Network links and ISPs", base: "1000", detail: "Bits per second: 1 Gbps is 10^9 bits per second, 125 MB/s." },
];
