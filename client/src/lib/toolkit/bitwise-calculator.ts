/**
 * Bitwise calculator: parsing, the twelve operations, and formatting.
 *
 * Every value is held as an unsigned BigInt bit pattern that is always masked
 * to the chosen width (8, 16, 32 or 64). Signedness is only a way of reading
 * that pattern, never part of it: two's complement (the representation in
 * ISO C and every current instruction set) maps pattern p to p - 2^w when the
 * top bit is set, so AND, OR, XOR, NOT and rotation give the same bits
 * either way. Signedness changes how decimal input is accepted and displayed,
 * and it decides what an arithmetic right shift copies in at the top.
 *
 * Pure functions, no React and no DOM.
 */

export type Width = 8 | 16 | 32 | 64;
export const WIDTHS: Width[] = [8, 16, 32, 64];

export type Base = "dec" | "hex" | "bin" | "oct";

export const BASES: { id: Base; label: string; name: string; radix: number; prefix: string }[] = [
  { id: "dec", label: "Dec", name: "decimal", radix: 10, prefix: "" },
  { id: "hex", label: "Hex", name: "hexadecimal", radix: 16, prefix: "0x" },
  { id: "bin", label: "Bin", name: "binary", radix: 2, prefix: "0b" },
  { id: "oct", label: "Oct", name: "octal", radix: 8, prefix: "0o" },
];

/** Longest operand text looked at. A 64 bit binary number with separators is well under this. */
export const MAX_INPUT_CHARS = 256;
/** Largest shift or rotate count accepted. Anything past the width already has a settled answer. */
export const MAX_SHIFT_COUNT = 1024;

/* ----------------------------------------------------------------- basics */

export function maskFor(width: Width): bigint {
  return (1n << BigInt(width)) - 1n;
}

/** Reads a width bit pattern as a two's complement integer. */
export function toSigned(bits: bigint, width: Width): bigint {
  return (bits >> BigInt(width - 1)) & 1n ? bits - (1n << BigInt(width)) : bits;
}

export function popcount(bits: bigint): number {
  let n = 0;
  let rest = bits;
  while (rest > 0n) {
    if (rest & 1n) n += 1;
    rest >>= 1n;
  }
  return n;
}

/** Indices of the set bits, highest first. */
export function setBitPositions(bits: bigint, width: Width): number[] {
  const out: number[] = [];
  for (let i = width - 1; i >= 0; i--) if ((bits >> BigInt(i)) & 1n) out.push(i);
  return out;
}

export function bitAt(bits: bigint, index: number): 0 | 1 {
  return ((bits >> BigInt(index)) & 1n) === 1n ? 1 : 0;
}

/** Smallest and largest value of a width, for the chosen reading. */
export function rangeOf(width: Width, signed: boolean): { min: bigint; max: bigint } {
  const w = BigInt(width);
  return signed
    ? { min: -(1n << (w - 1n)), max: (1n << (w - 1n)) - 1n }
    : { min: 0n, max: (1n << w) - 1n };
}

/* ---------------------------------------------------------------- parsing */

export type OperandParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; bits: bigint };

const DIGITS: Record<Base, RegExp> = {
  dec: /^[0-9]+$/,
  hex: /^[0-9a-fA-F]+$/,
  bin: /^[01]+$/,
  oct: /^[0-7]+$/,
};

const BASE_BY_ID: Record<Base, (typeof BASES)[number]> = {
  dec: BASES[0],
  hex: BASES[1],
  bin: BASES[2],
  oct: BASES[3],
};

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * One operand as typed. A sign, underscores, spaces and (in decimal) commas
 * are accepted, and so is the prefix that matches the base. A value outside
 * the width is an error rather than being silently cut down, because
 * truncation is exactly the bug this tool exists to make visible.
 *
 * In signed mode, hex, binary and octal text without a sign is read as a
 * bit pattern, so 0xFF at 8 bits is the pattern 11111111 (which reads as
 * -1), the way it would be written in source. Decimal and anything with a
 * sign must be a real value inside the signed range.
 */
export function parseOperand(raw: string, base: Base, width: Width, signed: boolean): OperandParse {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.length > MAX_INPUT_CHARS) {
    return { kind: "error", message: `That is ${trimmed.length} characters. A ${width} bit value never needs more than ${MAX_INPUT_CHARS}.` };
  }

  const info = BASE_BY_ID[base];
  let body = trimmed;
  let negative = false;
  if (/^[-+−]/.test(body)) {
    negative = body[0] === "-" || body[0] === "−";
    body = body.slice(1);
  }
  body = body.replace(/[\s_]/g, "");
  if (base === "dec") body = body.replace(/,/g, "");

  // A prefix that matches the base is dropped. A prefix for another base is
  // only an error when its letter cannot be a digit here: "0b" is a fine
  // start to a hex number, "0x" never is.
  const lower = body.toLowerCase();
  const prefixes: { text: string; base: Base }[] = [
    { text: "0x", base: "hex" },
    { text: "0b", base: "bin" },
    { text: "0o", base: "oct" },
  ];
  for (const p of prefixes) {
    if (!lower.startsWith(p.text)) continue;
    if (p.base === base) {
      body = body.slice(2);
      break;
    }
    if (base === "hex" && p.base === "bin") break; // 0B... is hex digits
    return {
      kind: "error",
      message: `${body.slice(0, 2)} marks ${BASE_BY_ID[p.base].name}, but this operand is set to ${info.name}. Switch its base to ${BASE_BY_ID[p.base].label} or drop the prefix.`,
    };
  }

  if (body === "") {
    return { kind: "error", message: `There are no digits to read. A ${info.name} number needs at least one.` };
  }
  if (!DIGITS[base].test(body)) {
    const bad = [...body].find((ch) => !DIGITS[base].test(ch)) ?? body[0];
    const hexOnly = base === "dec" && /^[0-9a-fA-F]+$/.test(body);
    const digitsText =
      base === "bin" ? "0 and 1" : base === "oct" ? "0 to 7" : base === "dec" ? "0 to 9" : "0 to 9 and A to F";
    return {
      kind: "error",
      message: hexOnly
        ? `"${bad}" is a hex digit. Switch this operand to Hex, or type the number in decimal.`
        : `"${bad}" is not a ${info.name} digit. ${info.name[0].toUpperCase()}${info.name.slice(1)} uses ${digitsText}.`,
    };
  }

  let magnitude: bigint;
  try {
    magnitude = base === "dec" ? BigInt(body) : BigInt(`${info.prefix}${body}`);
  } catch {
    return { kind: "error", message: "That is not a number this tool can read." };
  }
  const value = negative ? -magnitude : magnitude;

  const w = BigInt(width);
  const unsignedMax = (1n << w) - 1n;
  const signedRange = rangeOf(width, true);
  const rangeText = signed
    ? `${signedRange.min.toLocaleString("en-US")} to ${signedRange.max.toLocaleString("en-US")}`
    : `0 to ${unsignedMax.toLocaleString("en-US")}`;
  const shown = `${negative ? "-" : ""}${groupThousands(magnitude.toString())}`;
  const bitsNeeded = magnitude === 0n ? 1 : magnitude.toString(2).length;

  if (!signed && negative && magnitude !== 0n) {
    return {
      kind: "error",
      message: `${shown} is negative, and unsigned ${width} bit values run ${rangeText}. Switch to Signed, or enter the bit pattern in hex without a sign.`,
    };
  }

  let fits: boolean;
  if (signed && (base === "dec" || negative)) {
    fits = value >= signedRange.min && value <= signedRange.max;
  } else {
    fits = value >= 0n && value <= unsignedMax;
  }
  if (!fits) {
    const readingNote =
      signed && base !== "dec" && !negative
        ? ` Without a sign, ${info.name} is read as a bit pattern, so the most it can be is ${unsignedMax.toLocaleString("en-US")}.`
        : "";
    return {
      kind: "error",
      message: `${shown} does not fit in ${width} bits as ${signed ? "a signed" : "an unsigned"} number: it needs ${bitsNeeded} bit${bitsNeeded === 1 ? "" : "s"} and the range is ${rangeText}.${readingNote} Pick a wider width.`,
    };
  }

  return { kind: "ok", bits: BigInt.asUintN(width, value) };
}

export type CountParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; count: number };

/** A shift or rotate count: plain decimal, 0 up to MAX_SHIFT_COUNT. */
export function parseCount(raw: string): CountParse {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (/^[-−]/.test(text)) {
    return { kind: "error", message: "A count cannot be negative. To move the bits the other way, pick the opposite operation." };
  }
  const cleaned = text.replace(/[_\s]/g, "");
  if (!/^\+?[0-9]+$/.test(cleaned)) {
    return { kind: "error", message: "A count is a whole number in decimal, such as 3." };
  }
  const digits = cleaned.replace(/^\+/, "").replace(/^0+(?=\d)/, "");
  if (digits.length > 5 || Number(digits) > MAX_SHIFT_COUNT) {
    return { kind: "error", message: `Counts above ${MAX_SHIFT_COUNT} are not accepted. Anything past the width has already shifted every bit out.` };
  }
  return { kind: "ok", count: Number(digits) };
}

/* ------------------------------------------------------------- formatting */

export function bitString(bits: bigint, digits: number): string {
  return bits.toString(2).padStart(digits, "0");
}

/** Groups of four, so a 32 bit value reads as eight nibbles. */
export function groupNibbles(binary: string): string {
  return binary.replace(/(.{4})(?=.)/g, "$1 ");
}

export function hexString(bits: bigint, width: Width): string {
  return bits.toString(16).toUpperCase().padStart(width / 4, "0");
}

export function octString(bits: bigint, width: Width): string {
  return bits.toString(8).padStart(Math.ceil(width / 3), "0");
}

/** The pattern as an integer in the chosen reading. */
export function decimalString(bits: bigint, width: Width, signed: boolean): string {
  return (signed ? toSigned(bits, width) : bits).toString();
}

/**
 * The text form used to refill an input after a base change or a bit toggle.
 * Hex, binary and octal keep their prefix and their full width, so the digits
 * line up with the grid.
 */
export function formatOperand(bits: bigint, width: Width, base: Base, signed: boolean): string {
  switch (base) {
    case "dec":
      return decimalString(bits, width, signed);
    case "hex":
      return `0x${hexString(bits, width)}`;
    case "bin":
      return `0b${bitString(bits, width)}`;
    case "oct":
      return `0o${octString(bits, width)}`;
  }
}

/** A 32 bit pattern as the four octets of an IPv4 address. */
export function dottedQuad(bits: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => ((bits >> shift) & 0xffn).toString()).join(".");
}

/* ------------------------------------------------------------- operations */

export type OpId =
  | "and"
  | "or"
  | "xor"
  | "not"
  | "nand"
  | "nor"
  | "andn"
  | "shl"
  | "shr"
  | "sar"
  | "rol"
  | "ror";

export interface OpInfo {
  id: OpId;
  /** Short label for the button. */
  label: string;
  /** How the expression is written between the operands. */
  symbol: string;
  kind: "logic" | "shift";
  /** How many operands the operation reads. A shift reads one plus a count. */
  operands: 1 | 2;
}

export const OPS: OpInfo[] = [
  { id: "and", label: "AND", symbol: "&", kind: "logic", operands: 2 },
  { id: "or", label: "OR", symbol: "|", kind: "logic", operands: 2 },
  { id: "xor", label: "XOR", symbol: "^", kind: "logic", operands: 2 },
  { id: "not", label: "NOT", symbol: "~", kind: "logic", operands: 1 },
  { id: "nand", label: "NAND", symbol: "~(a & b)", kind: "logic", operands: 2 },
  { id: "nor", label: "NOR", symbol: "~(a | b)", kind: "logic", operands: 2 },
  { id: "andn", label: "AND NOT", symbol: "& ~", kind: "logic", operands: 2 },
  { id: "shl", label: "Shift left", symbol: "<<", kind: "shift", operands: 1 },
  { id: "shr", label: "Shift right, logical", symbol: ">>", kind: "shift", operands: 1 },
  { id: "sar", label: "Shift right, arithmetic", symbol: ">>", kind: "shift", operands: 1 },
  { id: "rol", label: "Rotate left", symbol: "rol", kind: "shift", operands: 1 },
  { id: "ror", label: "Rotate right", symbol: "ror", kind: "shift", operands: 1 },
];

export function opInfo(id: OpId): OpInfo {
  return OPS.find((op) => op.id === id) ?? OPS[0];
}

export interface Computation {
  /** The result pattern, already masked to the width. */
  result: bigint;
  /** Shift and rotate: the count the reader asked for. */
  count: number;
  /** The count that actually moved bits. A rotate takes it modulo the width. */
  effective: number;
  /** Shift only: the bits that left the register, as a binary string, or null. */
  lost: string | null;
}

/**
 * Applies one operation. A is always read; B only for the two operand
 * operations; the count only for shifts and rotates.
 *
 * Shift semantics, which are the part people get wrong:
 *   shl  zeros enter at the bottom; the top bits fall off.
 *   shr  zeros enter at the top (logical).
 *   sar  copies of the old top bit enter at the top, so a negative value
 *        stays negative and the result is floor(signed / 2^n).
 *   rol/ror  nothing is lost; the count is taken modulo the width.
 * A shift by the width or more is computed as a mathematical shift (every bit
 * gone, or every bit a copy of the sign), not as the machine-dependent
 * masked count that C leaves undefined.
 */
export function compute(op: OpId, width: Width, a: bigint, b: bigint, count: number): Computation {
  const mask = maskFor(width);
  const w = BigInt(width);
  const A = a & mask;
  const B = b & mask;
  let result: bigint;
  let effective = count;
  let lost: string | null = null;

  switch (op) {
    case "and":
      result = A & B;
      break;
    case "or":
      result = A | B;
      break;
    case "xor":
      result = A ^ B;
      break;
    case "not":
      result = ~A & mask;
      break;
    case "nand":
      result = ~(A & B) & mask;
      break;
    case "nor":
      result = ~(A | B) & mask;
      break;
    case "andn":
      result = A & ~B & mask;
      break;
    case "shl": {
      const moved = Math.min(count, width);
      result = count >= width ? 0n : (A << BigInt(count)) & mask;
      lost = moved === 0 ? null : bitString(A >> (w - BigInt(moved)), moved);
      break;
    }
    case "shr":
    case "sar": {
      const moved = Math.min(count, width);
      if (op === "shr") {
        result = count >= width ? 0n : A >> BigInt(count);
      } else {
        // BigInt >> is an arithmetic shift, so the signed reading floors.
        const shifted = toSigned(A, width) >> BigInt(Math.min(count, width));
        result = BigInt.asUintN(width, shifted);
      }
      lost = moved === 0 ? null : bitString(A & ((1n << BigInt(moved)) - 1n), moved);
      break;
    }
    case "rol":
    case "ror": {
      effective = count % width;
      const c = BigInt(effective);
      if (effective === 0) {
        result = A;
      } else if (op === "rol") {
        result = ((A << c) | (A >> (w - c))) & mask;
      } else {
        result = ((A >> c) | (A << (w - c))) & mask;
      }
      break;
    }
  }
  return { result, count, effective, lost };
}

/* ------------------------------------------------------------ explanation */

function hex(bits: bigint, width: Width): string {
  return `0x${hexString(bits, width)}`;
}

/**
 * Plain sentences about what the chosen operation just did to these values.
 * Every number in them is computed from the operands, never typed in.
 */
export function explain(
  op: OpId,
  width: Width,
  a: bigint,
  b: bigint,
  comp: Computation,
  signed: boolean,
): string[] {
  const out: string[] = [];
  const { result, count, effective, lost } = comp;
  const aSet = popcount(a);
  const rSet = popcount(result);
  const times = (n: number) => (n === 1 ? "1 place" : `${n} places`);
  const pow = count === 1 ? "2" : `2^${count}`;

  switch (op) {
    case "and":
      out.push(
        "A result bit is 1 only where both A and B have a 1. Used with B as a mask, it keeps the bits of A where B is 1 and forces the rest to 0.",
      );
      out.push(
        `${rSet} of the ${aSet} set ${aSet === 1 ? "bit" : "bits"} in A ${rSet === 1 ? "survives" : "survive"} the mask.${result === 0n ? " The result is zero, so no bit that is set in A is also set in B." : result === b ? " The result equals B, so every bit of B is also set in A." : ""}`,
      );
      break;
    case "or":
      out.push(
        "A result bit is 1 where A or B has a 1. Used with B as a mask, it sets every bit that is 1 in B and leaves the other bits of A alone.",
      );
      out.push(
        result === a
          ? "The result equals A, so every bit of B was already set in A."
          : `${rSet - aSet} ${rSet - aSet === 1 ? "bit was" : "bits were"} newly set.`,
      );
      break;
    case "xor":
      out.push(
        "A result bit is 1 where A and B differ. Used with B as a mask, it flips every bit that is 1 in B. Applying the same B a second time returns A, which is why XOR is the toggle.",
      );
      out.push(
        b === 0n
          ? "B is zero, so nothing flipped."
          : `${popcount(b)} ${popcount(b) === 1 ? "bit" : "bits"} of A ${popcount(b) === 1 ? "was" : "were"} flipped.`,
      );
      break;
    case "not":
      out.push(
        `Every bit of A is inverted inside the ${width} bit width. In two's complement that means NOT x equals -x - 1: A reads as ${toSigned(a, width)}, and the result reads as ${toSigned(result, width)}.`,
      );
      break;
    case "nand":
      out.push("AND followed by NOT. A result bit is 0 only where both A and B have a 1, and 1 everywhere else.");
      break;
    case "nor":
      out.push("OR followed by NOT. A result bit is 1 only where both A and B have a 0, and 0 everywhere else.");
      break;
    case "andn":
      out.push(
        "A with every bit that is set in B cleared, written a & ~b. This is how a mask is removed, as in mode & ~umask. Bits where B is 0 pass A through unchanged.",
      );
      out.push(
        `${aSet - rSet} ${aSet - rSet === 1 ? "bit was" : "bits were"} cleared.`,
      );
      break;
    case "shl":
      out.push(
        count === 0
          ? "A shift by zero changes nothing."
          : `Every bit moves ${times(Math.min(count, width))} toward the top and zeros enter at the bottom.${lost !== null ? ` The bits that left the top were ${groupNibbles(lost)}.` : ""}`,
      );
      if (count > 0 && count < width) {
        out.push(
          lost !== null && /1/.test(lost)
            ? `Set bits fell off, so the result is A times ${pow} wrapped to ${width} bits, not the full product.`
            : `Only zeros fell off, so the result is exactly A times ${pow}.`,
        );
      }
      break;
    case "shr":
      out.push(
        count === 0
          ? "A shift by zero changes nothing."
          : `Every bit moves ${times(Math.min(count, width))} toward the bottom and zeros enter at the top.${lost !== null ? ` The bits that left the bottom were ${groupNibbles(lost)}.` : ""} For an unsigned value that is A divided by ${pow}, rounded down.`,
      );
      if (toSigned(a, width) < 0n) {
        out.push("A has its top bit set, so as a signed value it is negative. A logical shift ignores that and the result is positive. Use the arithmetic shift to keep the sign.");
      }
      break;
    case "sar": {
      const sign = bitAt(a, width - 1);
      out.push(
        count === 0
          ? "A shift by zero changes nothing."
          : `Every bit moves ${times(Math.min(count, width))} toward the bottom, and copies of the old top bit (${sign}) enter at the top, so the sign survives.${lost !== null ? ` The bits that left the bottom were ${groupNibbles(lost)}.` : ""}`,
      );
      out.push(
        `Read as signed, that is ${toSigned(a, width)} divided by ${pow}, rounded toward negative infinity, giving ${toSigned(result, width)}.${signed ? "" : " The shift treats the top bit as a sign even when the operands are shown as unsigned."}`,
      );
      break;
    }
    case "rol":
    case "ror":
      out.push(
        effective === 0
          ? `A rotation by ${count === 0 ? "zero" : `${count}, a multiple of ${width},`} brings every bit back to where it started.`
          : `Every bit moves ${times(effective)} ${op === "rol" ? "toward the top" : "toward the bottom"}, and the bits that leave one end re-enter at the other. Nothing is lost, so rotating the other way by the same count undoes it.`,
      );
      if (count >= width && effective !== 0) {
        out.push(`The count ${count} is reduced modulo ${width} to ${effective}.`);
      }
      break;
  }

  if ((op === "shl" || op === "shr" || op === "sar") && count >= width) {
    out.push(
      `The count ${count} is not less than the width ${width}. In C that is undefined behavior, and processors differ on whether they shift every bit out or mask the count first. This page shows the mathematical result: ${op === "sar" ? "every bit is a copy of the sign" : "every bit is gone"}.`,
    );
  }
  if (signed && op === "shl" && count > 0 && count < width && toSigned(a, width) >= 0n && toSigned(result, width) < 0n) {
    out.push(
      `The result has its top bit set, so read as signed it went negative (${toSigned(result, width)}). In C, a left shift that overflows a signed type is undefined behavior; use an unsigned type for bit work.`,
    );
  }
  if (width === 32 && (op === "and" || op === "andn" || op === "or" || op === "xor")) {
    const word = { and: "AND", andn: "AND NOT", or: "OR", xor: "XOR" }[op];
    out.push(`As IPv4 addresses: ${dottedQuad(a)} ${word} ${dottedQuad(b)} = ${dottedQuad(result)}.`);
  }
  if (op === "not" && result === maskFor(width) && a === 0n) {
    out.push(`All ${width} bits are now set, which is ${hex(result, width)}, or -1 as a signed value.`);
  }
  return out;
}

/* ------------------------------------------------------- worked examples */

export interface Recipe {
  id: string;
  /** Which bit idiom this teaches, shown as the card's tag. */
  idiom: string;
  title: string;
  blurb: string;
  op: OpId;
  width: Width;
  signed: boolean;
  a: { base: Base; text: string };
  b?: { base: Base; text: string };
  count?: number;
}

/**
 * Real values for the four bit idioms (test, set, clear, toggle) and for the
 * places they turn up: Unix modes, the x86 flags register, ASCII, subnet
 * masks. The page loads one into the calculator on click.
 */
export const RECIPES: Recipe[] = [
  {
    id: "flag-test",
    idiom: "Test a flag",
    title: "Zero flag in x86 FLAGS",
    blurb:
      "0x0246 has the interrupt, zero and parity flags set. ANDing with a mask for bit 6 leaves 0x0040 when the zero flag is set and 0 when it is clear.",
    op: "and",
    width: 16,
    signed: false,
    a: { base: "hex", text: "0x0246" },
    b: { base: "hex", text: "0x0040" },
  },
  {
    id: "set-bit",
    idiom: "Set bits",
    title: "chmod a+x",
    blurb:
      "Mode 0644 ORed with 0111 sets the execute bit for owner, group and others and leaves the read and write bits alone, giving 0755.",
    op: "or",
    width: 16,
    signed: false,
    a: { base: "oct", text: "0o644" },
    b: { base: "oct", text: "0o111" },
  },
  {
    id: "clear-bit",
    idiom: "Clear bits",
    title: "Apply umask 022",
    blurb:
      "A new file starts from 0666 and the umask is removed with AND NOT. That clears the group and other write bits and gives 0644.",
    op: "andn",
    width: 16,
    signed: false,
    a: { base: "oct", text: "0o666" },
    b: { base: "oct", text: "0o022" },
  },
  {
    id: "toggle-bit",
    idiom: "Toggle bits",
    title: "Flip ASCII case",
    blurb:
      "Upper and lower case letters in ASCII differ only in bit 5, which is 0x20. XOR with 0x20 turns a into A, and applying it again turns A back into a.",
    op: "xor",
    width: 8,
    signed: false,
    a: { base: "hex", text: "0x61" },
    b: { base: "hex", text: "0x20" },
  },
  {
    id: "network",
    idiom: "Subnet mask",
    title: "Network address",
    blurb:
      "10.1.77.201 ANDed with the /20 mask 255.255.240.0 keeps the 20 network bits and zeroes the 12 host bits, giving 10.1.64.0.",
    op: "and",
    width: 32,
    signed: false,
    a: { base: "hex", text: "0x0A014DC9" },
    b: { base: "hex", text: "0xFFFFF000" },
  },
  {
    id: "host-part",
    idiom: "Subnet mask",
    title: "Host part",
    blurb:
      "The same address with AND NOT keeps only the 12 host bits and gives 0.0.13.201. The network part and the host part together are the whole address.",
    op: "andn",
    width: 32,
    signed: false,
    a: { base: "hex", text: "0x0A014DC9" },
    b: { base: "hex", text: "0xFFFFF000" },
  },
  {
    id: "prefix-mask",
    idiom: "Shift left",
    title: "Mask from a prefix length",
    blurb:
      "All ones shifted left by 32 minus the prefix length is the mask. For /20 that is a shift by 12, which leaves 255.255.240.0.",
    op: "shl",
    width: 32,
    signed: false,
    a: { base: "hex", text: "0xFFFFFFFF" },
    count: 12,
  },
  {
    id: "arith-shift",
    idiom: "Shift right",
    title: "Arithmetic shift of a negative",
    blurb:
      "-8 as an 8 bit signed value is 0xF8. An arithmetic shift right by 1 copies the sign bit in at the top and gives -4, which is 0xFC.",
    op: "sar",
    width: 8,
    signed: true,
    a: { base: "dec", text: "-8" },
    count: 1,
  },
  {
    id: "logical-shift",
    idiom: "Shift right",
    title: "Logical shift of the same value",
    blurb:
      "The same 0xF8 shifted right logically brings a zero in at the top and gives 0x7C, which is 124. The value is no longer negative.",
    op: "shr",
    width: 8,
    signed: true,
    a: { base: "dec", text: "-8" },
    count: 1,
  },
  {
    id: "rotate",
    idiom: "Rotate",
    title: "Rotate left by 1",
    blurb:
      "0x81 is 1000 0001. Rotating left by 1 carries the top bit around to the bottom and gives 0x03. A shift would have lost that bit.",
    op: "rol",
    width: 8,
    signed: false,
    a: { base: "hex", text: "0x81" },
    count: 1,
  },
  {
    id: "lowest-bit",
    idiom: "Isolate a bit",
    title: "Lowest set bit",
    blurb:
      "In two's complement, -x flips every bit above the lowest set bit and keeps that bit. So x AND -x isolates it: 88 AND -88 is 8.",
    op: "and",
    width: 8,
    signed: true,
    a: { base: "dec", text: "88" },
    b: { base: "dec", text: "-88" },
  },
];
