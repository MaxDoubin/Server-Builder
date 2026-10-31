/**
 * IEEE 754 binary32 and binary64, decoded and rounded exactly.
 *
 * Every value in this file is held either as a bit pattern (a BigInt) or as
 * an exact rational (BigInt numerator over BigInt denominator), never as a
 * JavaScript number. Nothing is rounded except where the standard rounds, so
 * the stored value of 0.1 prints to its last digit, the rounding error is the
 * true difference rather than a difference of two approximations, and a NaN
 * payload survives even though a Number would be free to discard it.
 *
 * References (IEEE 754-2019):
 *   3.4    binary interchange encoding: sign, biased exponent, trailing
 *          significand, with exponent fields 0 and all-ones reserved.
 *   4.3.1  roundTiesToEven, the default rounding-direction attribute.
 *   6.2.1  NaN encodings: the first bit of the trailing significand is the
 *          quiet bit (1 quiet, 0 signaling); the rest is the payload.
 *   5.3.1  nextUp and nextDown.
 *   5.5.1  negate flips the sign bit only, NaN included.
 *   6.3    an exact zero sum of opposite-signed operands is +0.
 *   7.4    overflow: a result at or past the midpoint above the largest
 *          finite value rounds to infinity under roundTiesToEven.
 *
 * Pure functions, no React and no DOM.
 */

/* ---------------------------------------------------------------- formats */

export interface Format {
  key: "binary32" | "binary64";
  /** The everyday name. */
  label: "float32" | "float64";
  /** The C type. */
  cName: "float" | "double";
  width: 32 | 64;
  expBits: number;
  fracBits: number;
  bias: number;
  hexDigits: number;
}

export const BINARY32: Format = {
  key: "binary32",
  label: "float32",
  cName: "float",
  width: 32,
  expBits: 8,
  fracBits: 23,
  bias: 127,
  hexDigits: 8,
};

export const BINARY64: Format = {
  key: "binary64",
  label: "float64",
  cName: "double",
  width: 64,
  expBits: 11,
  fracBits: 52,
  bias: 1023,
  hexDigits: 16,
};

export const FORMATS: Format[] = [BINARY32, BINARY64];

/** Longest input accepted. A binary64 halfway case never needs more digits than this. */
export const MAX_INPUT_CHARS = 1100;

/*
  A decimal input whose magnitude is at least 1e310 is past the largest
  binary64 value (about 1.798e308), and one below 1e-330 is under half the
  smallest subnormal (about 2.47e-324). Both are decided without building
  10^exponent, which is what keeps "1e999999999" from allocating a number
  with a billion digits.
*/
const HUGE_DECIMAL_EXP = 310;
const TINY_DECIMAL_EXP = -330;

const big = (n: number): bigint => BigInt(n);
const pow2 = (n: number): bigint => 1n << big(n);

function signBit(f: Format): bigint {
  return pow2(f.width - 1);
}
function expAllOnes(f: Format): bigint {
  return (pow2(f.expBits) - 1n) << big(f.fracBits);
}
function fracMask(f: Format): bigint {
  return pow2(f.fracBits) - 1n;
}
function quietBit(f: Format): bigint {
  return pow2(f.fracBits - 1);
}

/** Number of bits in a non-negative BigInt; 0 for 0. */
export function bitLength(n: bigint): number {
  return n === 0n ? 0 : n.toString(2).length;
}

/* ------------------------------------------------------------------ values */

/** An exact value, before or after rounding. */
export type Value =
  /** Magnitude num/den (num >= 0, den > 0). The sign is separate so -0 exists. */
  | { kind: "finite"; neg: boolean; num: bigint; den: bigint }
  | { kind: "infinity"; neg: boolean }
  /** A NaN. `from` is the format its fraction field belongs to, or null for the default quiet NaN. */
  | { kind: "nan"; neg: boolean; from: Format | null; frac: bigint }
  /** A decimal of magnitude at least 1e310: past every finite value in either format. */
  | { kind: "huge"; neg: boolean }
  /** A nonzero decimal below 1e-330: rounds to zero in either format. */
  | { kind: "tiny"; neg: boolean };

/* ------------------------------------------------------------------ parse */

export type Parsed =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "value"; value: Value; source: string }
  | { kind: "bits"; format: Format; bits: bigint };

const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;
const HEX_FLOAT = /^([+-]?)0x([0-9a-f]*)(?:\.([0-9a-f]*))?p([+-]?\d+)$/i;

/** A signed exponent string, clamped so that parsing it never produces a giant number. */
function clampExponent(text: string): number {
  const negative = text.startsWith("-");
  const digits = text.replace(/^[+-]/, "").replace(/^0+/, "");
  if (digits.length > 9) return negative ? -1e9 : 1e9;
  const n = digits === "" ? 0 : parseInt(digits, 10);
  return negative ? -n : n;
}

/**
 * Reads a decimal number, a special value, raw bits (0x with 8 or 16 hex
 * digits, or 0b with 32 or 64 binary digits), or a C99 hex float (0x1.8p3).
 */
export function parseInput(raw: string): Parsed {
  let text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_CHARS) {
    return {
      kind: "error",
      message: `That is ${text.length} characters. Input is capped at ${MAX_INPUT_CHARS}, which is more than any float64 value needs.`,
    };
  }
  text = text.replace(/−/g, "-").replace(/_/g, "");
  if (text.includes(",")) {
    return {
      kind: "error",
      message: "Write the decimal point as a period and leave out thousands separators, for example 1234.5.",
    };
  }

  const special = /^([+-]?)(inf|infinity|nan|\u221e)$/i.exec(text);
  if (special) {
    const neg = special[1] === "-";
    if (special[2].toLowerCase() === "nan") {
      return { kind: "value", value: { kind: "nan", neg, from: null, frac: 0n }, source: `${neg ? "-" : ""}NaN` };
    }
    return { kind: "value", value: { kind: "infinity", neg }, source: `${neg ? "-" : ""}Infinity` };
  }

  // C99 hex float: the p exponent is what tells it apart from raw bits.
  if (/^[+-]?0x/i.test(text) && /p/i.test(text)) {
    const compact = text.replace(/\s+/g, "");
    const m = HEX_FLOAT.exec(compact);
    if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
      return {
        kind: "error",
        message: "A hex float looks like 0x1.8p3: hex digits, an optional point, then p and a power of two.",
      };
    }
    const neg = m[1] === "-";
    const fracDigits = m[3] ?? "";
    const mant = BigInt(`0x${m[2] + fracDigits || "0"}`);
    const exp2 = clampExponent(m[4]) - 4 * fracDigits.length;
    const source = `hex float ${compact}`;
    if (mant === 0n) return { kind: "value", value: { kind: "finite", neg, num: 0n, den: 1n }, source };
    const magnitude = bitLength(mant) + exp2;
    if (magnitude > 1100) return { kind: "value", value: { kind: "huge", neg }, source };
    if (magnitude < -1200) return { kind: "value", value: { kind: "tiny", neg }, source };
    const value: Value =
      exp2 >= 0
        ? { kind: "finite", neg, num: mant << big(exp2), den: 1n }
        : { kind: "finite", neg, num: mant, den: pow2(-exp2) };
    return { kind: "value", value, source };
  }

  // Raw bit patterns.
  if (/^[+-]?0x/i.test(text)) {
    if (/^[+-]/.test(text)) {
      return {
        kind: "error",
        message: "Hex here is a raw bit pattern, which has no sign of its own. Set the top bit instead, or write a hex float such as -0x1p-3.",
      };
    }
    const digits = text.slice(2).replace(/\s+/g, "");
    const bad = /[^0-9a-f]/i.exec(digits);
    if (bad) return { kind: "error", message: `"${bad[0]}" is not a hex digit.` };
    if (digits.length === 8) return { kind: "bits", format: BINARY32, bits: BigInt(`0x${digits}`) };
    if (digits.length === 16) return { kind: "bits", format: BINARY64, bits: BigInt(`0x${digits}`) };
    return {
      kind: "error",
      message: `Raw bits need exactly 8 hex digits (float32) or 16 (float64), with leading zeros. This has ${digits.length}. For a value written in hex, use a hex float such as 0x1.8p3.`,
    };
  }
  if (/^0b/i.test(text)) {
    const digits = text.slice(2).replace(/\s+/g, "");
    const bad = /[^01]/.exec(digits);
    if (bad) return { kind: "error", message: `"${bad[0]}" is not a binary digit.` };
    if (digits.length === 32) return { kind: "bits", format: BINARY32, bits: BigInt(`0b${digits}`) };
    if (digits.length === 64) return { kind: "bits", format: BINARY64, bits: BigInt(`0b${digits}`) };
    return {
      kind: "error",
      message: `Raw bits in binary need exactly 32 digits (float32) or 64 (float64). This has ${digits.length}.`,
    };
  }

  const m = DECIMAL.exec(text);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    return {
      kind: "error",
      message: "Not a number this can read. Try 0.1, -2.5e-8, inf, nan, raw bits such as 0x3DCCCCCD, or a hex float such as 0x1.8p3.",
    };
  }
  const neg = m[1] === "-";
  const intDigits = m[2];
  const fracDigits = m[3] ?? "";
  let exp10 = (m[4] === undefined ? 0 : clampExponent(m[4])) - fracDigits.length;
  let digits = (intDigits + fracDigits).replace(/^0+/, "");
  const source = `decimal ${text}`;
  if (digits === "") return { kind: "value", value: { kind: "finite", neg, num: 0n, den: 1n }, source };
  const trailing = /0+$/.exec(digits);
  if (trailing) {
    digits = digits.slice(0, -trailing[0].length);
    exp10 += trailing[0].length;
  }
  // The value lies in [10^(mag-1), 10^mag).
  const mag = digits.length + exp10;
  if (mag - 1 >= HUGE_DECIMAL_EXP) return { kind: "value", value: { kind: "huge", neg }, source };
  if (mag <= TINY_DECIMAL_EXP) return { kind: "value", value: { kind: "tiny", neg }, source };
  const d = BigInt(digits);
  const value: Value =
    exp10 >= 0
      ? { kind: "finite", neg, num: d * 10n ** big(exp10), den: 1n }
      : { kind: "finite", neg, num: d, den: 10n ** big(-exp10) };
  return { kind: "value", value, source };
}

/* --------------------------------------------------------------- rounding */

/**
 * Rounds an exact rational to the nearest value of the format, ties to even
 * (IEEE 754 section 4.3.1), and returns the bit pattern. Handles subnormals,
 * the carry from 1.111...1 up to the next binade, and overflow to infinity.
 */
function roundRational(neg: boolean, num: bigint, den: bigint, f: Format): bigint {
  const sign = neg ? signBit(f) : 0n;
  if (num === 0n) return sign;

  const p = f.fracBits + 1; // precision, counting the implicit bit
  const emin = 1 - f.bias;
  const emax = f.bias;

  // e = floor(log2(num/den)). Bit lengths pin it to one of two candidates.
  let e = bitLength(num) - bitLength(den);
  const atLeast = (k: number) => (k >= 0 ? num >= den << big(k) : num << big(-k) >= den);
  if (!atLeast(e)) e -= 1;
  if (e > emax + 1) return sign | expAllOnes(f);

  // q is the exponent of the last significand bit: the ULP.
  let q = Math.max(e, emin) - (p - 1);
  let n = num;
  let d = den;
  if (q >= 0) d = den << big(q);
  else n = num << big(-q);
  let m = n / d;
  const twiceRem = (n - m * d) * 2n;
  if (twiceRem > d || (twiceRem === d && (m & 1n) === 1n)) m += 1n;
  if (m === pow2(p)) {
    m >>= 1n;
    q += 1;
  }

  if (m >= pow2(p - 1)) {
    const exponent = q + (p - 1);
    if (exponent > emax) return sign | expAllOnes(f);
    return sign | (big(exponent + f.bias) << big(f.fracBits)) | (m - pow2(p - 1));
  }
  // Subnormal or zero: q is pinned at emin - (p - 1) here, exponent field 0.
  return sign | m;
}

/** The bits a NaN takes in format f, carrying its payload the way x86 conversions do. */
function nanBits(v: Extract<Value, { kind: "nan" }>, f: Format): bigint {
  const sign = v.neg ? signBit(f) : 0n;
  if (v.from === null) return sign | expAllOnes(f) | quietBit(f);
  if (v.from.key === f.key) return sign | expAllOnes(f) | (v.frac & fracMask(f));
  // Converting keeps the top fraction bits (shifted, or truncated when
  // narrowing) and sets the quiet bit, so a signaling NaN comes out quiet.
  const shift = f.fracBits - v.from.fracBits;
  const frac = shift > 0 ? v.frac << big(shift) : v.frac >> big(-shift);
  return sign | expAllOnes(f) | (frac & fracMask(f)) | quietBit(f);
}

/** The bit pattern format f stores for an exact value. */
export function roundToFormat(v: Value, f: Format): bigint {
  switch (v.kind) {
    case "finite":
      return roundRational(v.neg, v.num, v.den, f);
    case "infinity":
    case "huge":
      return (v.neg ? signBit(f) : 0n) | expAllOnes(f);
    case "tiny":
      return v.neg ? signBit(f) : 0n;
    case "nan":
      return nanBits(v, f);
  }
}

/* ----------------------------------------------------------------- decode */

export type FloatClass = "zero" | "subnormal" | "normal" | "infinity" | "nan";

export interface Decoded {
  format: Format;
  bits: bigint;
  sign: 0 | 1;
  /** The biased exponent field as stored. */
  expField: number;
  /** The trailing significand field as stored. */
  frac: bigint;
  cls: FloatClass;
  /** 1 for normal numbers, 0 for zero and subnormals (and for infinity and NaN, where it is moot). */
  implicitBit: 0 | 1;
  /** Integer significand including the implicit bit. Value = significand x 2^exp2. */
  significand: bigint;
  /** Power of two applied to the integer significand; also the exponent of one ULP. */
  exp2: number;
  /** expField - bias for normal numbers, 1 - bias for subnormals, null otherwise. */
  unbiased: number | null;
  /** NaN only: the quiet bit. */
  quiet: boolean | null;
  /** NaN only: the fraction bits below the quiet bit. */
  payload: bigint | null;
}

export function decode(bitsIn: bigint, f: Format): Decoded {
  const bits = bitsIn & (pow2(f.width) - 1n);
  const sign = (bits >> big(f.width - 1)) & 1n ? 1 : 0;
  const expField = Number((bits >> big(f.fracBits)) & (pow2(f.expBits) - 1n));
  const frac = bits & fracMask(f);
  const expMax = 2 ** f.expBits - 1;
  const base = { format: f, bits, sign: sign as 0 | 1, expField, frac };

  if (expField === expMax) {
    const isNan = frac !== 0n;
    return {
      ...base,
      cls: isNan ? "nan" : "infinity",
      implicitBit: 1,
      significand: 0n,
      exp2: 0,
      unbiased: null,
      quiet: isNan ? (frac & quietBit(f)) !== 0n : null,
      payload: isNan ? frac & (quietBit(f) - 1n) : null,
    };
  }
  if (expField === 0) {
    return {
      ...base,
      cls: frac === 0n ? "zero" : "subnormal",
      implicitBit: 0,
      significand: frac,
      exp2: 1 - f.bias - f.fracBits,
      unbiased: frac === 0n ? null : 1 - f.bias,
      quiet: null,
      payload: null,
    };
  }
  return {
    ...base,
    cls: "normal",
    implicitBit: 1,
    significand: pow2(f.fracBits) | frac,
    exp2: expField - f.bias - f.fracBits,
    unbiased: expField - f.bias,
    quiet: null,
    payload: null,
  };
}

/** The exact value a decoded pattern stands for. */
export function valueOf(d: Decoded): Value {
  const neg = d.sign === 1;
  if (d.cls === "infinity") return { kind: "infinity", neg };
  if (d.cls === "nan") return { kind: "nan", neg, from: d.format, frac: d.frac };
  return d.exp2 >= 0
    ? { kind: "finite", neg, num: d.significand << big(d.exp2), den: 1n }
    : { kind: "finite", neg, num: d.significand, den: pow2(-d.exp2) };
}

/* ---------------------------------------------------------------- decimal */

/** An exact terminating decimal: (neg ? -1 : 1) x digits x 10^-scale. */
export interface Decimal {
  neg: boolean;
  digits: bigint;
  scale: number;
}

/**
 * num/den as an exact decimal. Every value here has a denominator of the
 * form 2^a x 5^b, so the expansion always terminates; anything else returns
 * null rather than a truncated answer.
 */
export function rationalToDecimal(neg: boolean, num: bigint, den: bigint): Decimal | null {
  if (den <= 0n) return null;
  let rest = den;
  let twos = 0;
  let fives = 0;
  const lowZeros = bitLength(rest & -rest) - 1;
  if (lowZeros > 0) {
    rest >>= big(lowZeros);
    twos = lowZeros;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  if (rest !== 1n) return null;
  const scale = Math.max(twos, fives);
  let digits = num * 2n ** big(scale - twos) * 5n ** big(scale - fives);
  let s = scale;
  if (digits === 0n) return { neg, digits: 0n, scale: 0 };
  while (s > 0 && digits % 10n === 0n) {
    digits /= 10n;
    s -= 1;
  }
  return { neg, digits, scale: s };
}

/** Plain positional form, every digit: 0.1000000000000000055511151231257827021181583404541015625. */
export function decimalPlain(d: Decimal): string {
  const sign = d.neg ? "-" : "";
  const s = d.digits.toString();
  if (d.scale === 0) return sign + s;
  if (s.length > d.scale) return `${sign}${s.slice(0, s.length - d.scale)}.${s.slice(s.length - d.scale)}`;
  return `${sign}0.${"0".repeat(d.scale - s.length)}${s}`;
}

/** Scientific form, every digit: 5.5511151231257827021181583404541015625e-18. */
export function decimalScientific(d: Decimal): string {
  const sign = d.neg ? "-" : "";
  if (d.digits === 0n) return `${sign}0`;
  const full = d.digits.toString();
  const exp = full.length - 1 - d.scale;
  // An integer keeps its trailing zeros in `digits`; the mantissa does not need them.
  const s = full.replace(/0+$/, "");
  const mantissa = s.length > 1 ? `${s[0]}.${s.slice(1)}` : s;
  return `${sign}${mantissa}e${exp < 0 ? "-" : "+"}${Math.abs(exp)}`;
}

/** Count of significant digits in an exact decimal. */
export function significantDigits(d: Decimal): number {
  return d.digits === 0n ? 1 : d.digits.toString().length;
}

/** The exact decimal of a finite decoded value, or null for infinity and NaN. */
export function exactDecimal(d: Decoded): Decimal | null {
  const v = valueOf(d);
  if (v.kind !== "finite") return null;
  return rationalToDecimal(v.neg, v.num, v.den);
}

/* ------------------------------------------------------ shortest printing */

function ceilDiv(a: bigint, b: bigint): bigint {
  return a >= 0n ? (a + b - 1n) / b : -(-a / b);
}

/** Digits c and exponent k (value c x 10^k) laid out the way Number#toString does. */
function formatLikeJs(neg: boolean, cIn: bigint, kIn: number): string {
  let c = cIn;
  let k = kIn;
  while (c !== 0n && c % 10n === 0n) {
    c /= 10n;
    k += 1;
  }
  const s = c.toString();
  const len = s.length;
  const n = k + len; // value = 0.s x 10^n
  const sign = neg ? "-" : "";
  if (len <= n && n <= 21) return sign + s + "0".repeat(n - len);
  if (0 < n && n <= 21) return `${sign}${s.slice(0, n)}.${s.slice(n)}`;
  if (-6 < n && n <= 0) return `${sign}0.${"0".repeat(-n)}${s}`;
  const e = n - 1;
  const mantissa = len === 1 ? s : `${s[0]}.${s.slice(1)}`;
  return `${sign}${mantissa}e${e < 0 ? "-" : "+"}${Math.abs(e)}`;
}

/**
 * The shortest decimal that reads back to exactly this value in its own
 * format, choosing the closest when several of that length qualify and the
 * even one on a tie. This is the rule ECMAScript Number::toString uses for
 * binary64, applied here to binary32 as well, and it is computed exactly
 * from the rounding interval rather than by trial and error.
 */
export function shortestDecimal(d: Decoded): string {
  if (d.cls === "nan") return "NaN";
  if (d.cls === "infinity") return d.sign ? "-Infinity" : "Infinity";
  if (d.cls === "zero") return d.sign ? "-0" : "0";

  const f = d.format;
  const p = f.fracBits + 1;
  const m = d.significand;
  // At the bottom of a binade the gap below is half the gap above.
  const lowerIsHalf = m === pow2(p - 1) && d.expField > 1;
  // Ties round to the even significand, so the interval is closed when m is even.
  const inclusive = (m & 1n) === 0n;

  // Work in units of 2^(exp2 - 2) so both half gaps are whole numbers.
  const s = d.exp2 - 2;
  const mul = s >= 0 ? pow2(s) : 1n;
  const den = s >= 0 ? 1n : pow2(-s);
  const V = 4n * m * mul;
  const L = (4n * m - (lowerIsHalf ? 1n : 2n)) * mul;
  const H = (4n * m + 2n) * mul;

  // d10 = floor(log10(value)), estimated from bit lengths then corrected exactly.
  const geqPow10 = (k: number) => (k >= 0 ? V >= den * 10n ** big(k) : V * 10n ** big(-k) >= den);
  let d10 = Math.floor((bitLength(V) - bitLength(den)) * Math.LOG10E * Math.LN2);
  while (geqPow10(d10 + 1)) d10 += 1;
  while (!geqPow10(d10)) d10 -= 1;

  for (let count = 1; count <= 40; count++) {
    const k = d10 - count + 1;
    const numScale = k >= 0 ? 1n : 10n ** big(-k);
    const denScale = k >= 0 ? den * 10n ** big(k) : den;
    const lo = L * numScale;
    const hi = H * numScale;
    const v = V * numScale;
    let cmin = ceilDiv(lo, denScale);
    if (!inclusive && cmin * denScale === lo) cmin += 1n;
    let cmax = hi / denScale;
    if (!inclusive && cmax * denScale === hi) cmax -= 1n;
    if (cmin <= cmax) {
      let c = v / denScale;
      const twiceRem = (v - c * denScale) * 2n;
      if (twiceRem > denScale || (twiceRem === denScale && (c & 1n) === 1n)) c += 1n;
      if (c < cmin) c = cmin;
      if (c > cmax) c = cmax;
      return formatLikeJs(d.sign === 1, c, k);
    }
  }
  // Unreachable: count = 40 always lands inside the interval.
  return decimalScientific(exactDecimal(d) ?? { neg: false, digits: 0n, scale: 0 });
}

/* -------------------------------------------------------------- notations */

export function bitsHex(bits: bigint, f: Format): string {
  return `0x${bits.toString(16).toUpperCase().padStart(f.hexDigits, "0")}`;
}

export function bitsBinary(bits: bigint, f: Format): string {
  return bits.toString(2).padStart(f.width, "0");
}

/** C99 hex float, the form printf %a writes and strtod reads: 0x1.999999999999ap-4. */
export function hexFloat(d: Decoded): string {
  const sign = d.sign ? "-" : "";
  if (d.cls === "nan") return `${sign}nan`;
  if (d.cls === "infinity") return `${sign}inf`;
  if (d.cls === "zero") return `${sign}0x0p+0`;
  const f = d.format;
  const nibbles = Math.ceil(f.fracBits / 4);
  const padded = d.frac << big(nibbles * 4 - f.fracBits);
  const hex = padded.toString(16).padStart(nibbles, "0").replace(/0+$/, "");
  const exp = d.cls === "normal" ? d.expField - f.bias : 1 - f.bias;
  const lead = d.cls === "normal" ? "1" : "0";
  return `${sign}0x${lead}${hex ? `.${hex}` : ""}p${exp >= 0 ? "+" : "-"}${Math.abs(exp)}`;
}

/** The significand in binary with its leading bit and point: 1.10011001100110011001101. */
export function significandBinary(d: Decoded): string {
  return `${d.implicitBit}.${d.frac.toString(2).padStart(d.format.fracBits, "0")}`;
}

/** The significand as an exact decimal: 1.60000002384185791015625. */
export function significandDecimal(d: Decoded): string {
  const dec = rationalToDecimal(false, d.significand, pow2(d.format.fracBits));
  return dec ? decimalPlain(dec) : "";
}

/* ---------------------------------------------------------- approximations */

/** num/den as the nearest-ish JavaScript number, for display of ratios only. */
export function ratioToNumber(num: bigint, den: bigint): number {
  if (num === 0n) return 0;
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const shift = bitLength(d) - bitLength(n) + 64;
  const q = shift >= 0 ? (n << big(shift)) / d : n / (d << big(-shift));
  // Split the scaling so 2^-shift cannot underflow or overflow on its own.
  const half = Math.trunc(shift / 2);
  const value = Number(q) * 2 ** -half * 2 ** -(shift - half);
  return neg ? -value : value;
}

/** Four significant figures for a ratio, switching to exponent form when tiny or huge. */
export function approx(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e6) return String(Number(x.toPrecision(4)));
  return x.toExponential(3).replace(/\.?0+e/, "e");
}

/* ----------------------------------------------------------------- errors */

export type ReportKind = "exact" | "rounded" | "underflow" | "overflow" | "infinity" | "nan" | "tiny";

export interface RoundingReport {
  kind: ReportKind;
  /** stored - input, exactly. Null when it is unbounded or undefined. */
  error: Decimal | null;
  /** error / ULP of the stored value. */
  ulps: number | null;
  /** |error| / |input|. */
  relative: number | null;
  /**
   * The input sat exactly halfway between two neighbors, so ties-to-even
   * picked the stored value. Measured against the gap on the input's side,
   * which at the bottom of a binade is half the ULP above.
   */
  tie: boolean;
}

/** How far the stored value is from the exact input, and in which units. */
export function roundingReport(input: Value, d: Decoded): RoundingReport {
  const none = { error: null, ulps: null, relative: null, tie: false };
  if (input.kind === "nan") return { kind: "nan", ...none };
  if (input.kind === "infinity") return { kind: "infinity", ...none };
  if (input.kind === "huge") return { kind: "overflow", ...none };
  if (input.kind === "tiny") return { kind: "tiny", ...none };
  if (d.cls === "infinity") return { kind: "overflow", ...none };
  if (d.cls === "nan") return { kind: "nan", ...none };

  const q = d.exp2;
  const sNum = (d.sign ? -1n : 1n) * d.significand * (q >= 0 ? pow2(q) : 1n);
  const sDen = q < 0 ? pow2(-q) : 1n;
  const xNum = (input.neg ? -1n : 1n) * input.num;
  const errNum = sNum * input.den - xNum * sDen;
  const errDen = sDen * input.den;
  if (errNum === 0n) {
    return { kind: "exact", error: { neg: false, digits: 0n, scale: 0 }, ulps: 0, relative: 0, tie: false };
  }

  const error = rationalToDecimal(errNum < 0n, errNum < 0n ? -errNum : errNum, errDen);
  const ulps = ratioToNumber(errNum * (q < 0 ? pow2(-q) : 1n), errDen * (q >= 0 ? pow2(q) : 1n));
  const absErr = errNum < 0n ? -errNum : errNum;
  const relative = input.num === 0n ? null : ratioToNumber(absErr * input.den, errDen * input.num);

  // Which side of the stored value the input is on, in magnitude: the error
  // points away from zero when the stored value is the smaller of the two.
  const storedSmaller = d.sign ? errNum > 0n : errNum < 0n;
  const p = d.format.fracBits + 1;
  const binadeBottom = d.cls === "normal" && d.significand === pow2(p - 1) && d.expField > 1;
  // Gap to the neighbor on the input's side is 2^gapExp.
  const gapExp = !storedSmaller && binadeBottom ? q - 1 : q;
  // Tie when 2 x |error| equals the gap: 2|errNum| / errDen == 2^gapExp.
  const twice = 2n * absErr;
  const tie = gapExp >= 0 ? twice === errDen << big(gapExp) : twice << big(-gapExp) === errDen;

  return { kind: d.cls === "zero" ? "underflow" : "rounded", error, ulps, relative, tie };
}

/** One ULP at this value, exactly, or null for infinity and NaN. */
export function ulpDecimal(d: Decoded): Decimal | null {
  if (d.cls === "nan" || d.cls === "infinity") return null;
  return d.exp2 >= 0
    ? { neg: false, digits: pow2(d.exp2), scale: 0 }
    : rationalToDecimal(false, 1n, pow2(-d.exp2));
}

/**
 * An exact decimal rounded to `sig` significant digits (ties to even) in
 * scientific form, for a short label next to the full expansion.
 */
export function decimalShort(d: Decimal, sig = 4): string {
  if (d.digits === 0n) return "0";
  const s = d.digits.toString();
  let exp = s.length - 1 - d.scale;
  let lead = d.digits;
  if (s.length > sig) {
    const p = 10n ** big(s.length - sig);
    lead = d.digits / p;
    const twiceRem = (d.digits % p) * 2n;
    if (twiceRem > p || (twiceRem === p && (lead & 1n) === 1n)) lead += 1n;
    if (lead.toString().length > sig) {
      lead /= 10n;
      exp += 1;
    }
  }
  const ls = lead.toString().replace(/0+$/, "") || "0";
  const mantissa = ls.length > 1 ? `${ls[0]}.${ls.slice(1)}` : ls;
  return `${d.neg ? "-" : ""}${mantissa}e${exp < 0 ? "-" : "+"}${Math.abs(exp)}`;
}

/* ------------------------------------------------------------- stepping */

/** Flips the sign bit and nothing else (section 5.5.1), NaN included. */
export function negateBits(bits: bigint, f: Format): bigint {
  return (bits & (pow2(f.width) - 1n)) ^ signBit(f);
}

/**
 * The least value that compares greater (section 5.3.1). Zeros step to the
 * smallest positive subnormal, the largest finite steps to infinity, the
 * negative value of least magnitude steps to -0, and +infinity stays put.
 * A NaN comes back quiet with its payload.
 */
export function nextUp(bitsIn: bigint, f: Format): bigint {
  const d = decode(bitsIn, f);
  if (d.cls === "nan") return d.bits | quietBit(f);
  if (d.cls === "zero") return 1n;
  if (d.sign === 0) return d.cls === "infinity" ? d.bits : d.bits + 1n;
  // Negative, including -infinity: one step toward zero in magnitude.
  return d.bits - 1n;
}

/** The greatest value that compares less: nextDown(x) is -nextUp(-x). */
export function nextDown(bits: bigint, f: Format): bigint {
  const d = decode(bits, f);
  if (d.cls === "nan") return d.bits | quietBit(f);
  return negateBits(nextUp(negateBits(d.bits, f), f), f);
}

/** The largest finite value of a format, decoded. */
export function largestFinite(f: Format): Decoded {
  return decode(expAllOnes(f) - pow2(f.fracBits) + fracMask(f), f);
}

/* -------------------------------------------------------------- addition */

/** Exact sum of two values, with the IEEE sign rules for zeros and infinities. */
export function addValues(a: Value, b: Value): Value {
  if (a.kind === "nan" || b.kind === "nan") return { kind: "nan", neg: false, from: null, frac: 0n };
  if (a.kind === "huge" || a.kind === "tiny" || b.kind === "huge" || b.kind === "tiny") {
    // Callers keep these out; treat them as their rounded selves would be.
    return { kind: "nan", neg: false, from: null, frac: 0n };
  }
  if (a.kind === "infinity" && b.kind === "infinity") {
    return a.neg === b.neg ? a : { kind: "nan", neg: false, from: null, frac: 0n };
  }
  if (a.kind === "infinity") return a;
  if (b.kind === "infinity") return b;
  const an = (a.neg ? -1n : 1n) * a.num * b.den;
  const bn = (b.neg ? -1n : 1n) * b.num * a.den;
  const sum = an + bn;
  const den = a.den * b.den;
  if (sum === 0n) {
    // Section 6.3: -0 only when both operands are -0; x + (-x) is +0.
    const bothNegZero = a.num === 0n && b.num === 0n && a.neg && b.neg;
    return { kind: "finite", neg: bothNegZero, num: 0n, den: 1n };
  }
  return { kind: "finite", neg: sum < 0n, num: sum < 0n ? -sum : sum, den };
}

/** A pattern mapped onto a line where adjacent finite values differ by 1. */
function ordinal(d: Decoded): bigint {
  const magnitude = d.bits & (signBit(d.format) - 1n);
  return d.sign ? -magnitude : magnitude;
}

/** IEEE equality: NaN equals nothing, +0 equals -0. */
export function ieeeEqual(a: Decoded, b: Decoded): boolean {
  if (a.cls === "nan" || b.cls === "nan") return false;
  if (a.cls === "zero" && b.cls === "zero") return true;
  return a.bits === b.bits;
}

/** How many representable steps apart two values are, or null if either is NaN or infinite. */
export function ulpsApart(a: Decoded, b: Decoded): bigint | null {
  if (a.cls === "nan" || b.cls === "nan" || a.cls === "infinity" || b.cls === "infinity") return null;
  const diff = ordinal(a) - ordinal(b);
  return diff < 0n ? -diff : diff;
}

export interface SumReport {
  format: Format;
  a: Decoded;
  b: Decoded;
  /** The exact sum of the two stored operands, before rounding. */
  exactSum: Value;
  /** What a + b gives in this format: the exact sum, rounded once. */
  sum: Decoded;
  /** The exact decimal sum of the inputs, rounded once: what a literal of that value stores. */
  direct: Decoded;
  equal: boolean;
  apart: bigint | null;
}

/**
 * a + b the way the hardware does it (round each operand, add exactly, round
 * once, which is what correctly rounded addition means) next to the sum of
 * the decimal inputs rounded directly.
 */
export function addInFormat(aIn: Value, bIn: Value, f: Format): SumReport {
  const a = decode(roundToFormat(aIn, f), f);
  const b = decode(roundToFormat(bIn, f), f);
  const exactSum = addValues(valueOf(a), valueOf(b));
  const sum = decode(roundToFormat(exactSum, f), f);
  const direct = decode(roundToFormat(addValues(aIn, bIn), f), f);
  return { format: f, a, b, exactSum, sum, direct, equal: ieeeEqual(sum, direct), apart: ulpsApart(sum, direct) };
}

/** The exact decimal of a finite Value, or null. */
export function valueDecimal(v: Value): Decimal | null {
  return v.kind === "finite" ? rationalToDecimal(v.neg, v.num, v.den) : null;
}
