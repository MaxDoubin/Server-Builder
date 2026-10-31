/**
 * Byte order: the same bytes read as big- and little-endian integers and floats.
 *
 * The source of truth is always a byte sequence in memory order, offset 0
 * first. Integer input is turned into bytes most significant first, which is
 * big endian and also network byte order (RFC 791 appendix B, RFC 1700), so
 * "0xDEADBEEF" and the bytes "DE AD BE EF" land on the same thing. Every
 * reading goes through DataView with an explicit littleEndian flag, so the
 * host's own byte order never leaks into a result.
 *
 * Pure functions, no React and no DOM.
 */

import { BINARY32, BINARY64, decode, shortestDecimal } from "./ieee754-inspector";

export type Width = 16 | 32 | 64;
export const WIDTHS: Width[] = [16, 32, 64];
export type Order = "big" | "little";

/** Largest byte sequence accepted. Enough for a header or a struct, small enough to lay out. */
export const MAX_BYTES = 64;
/** Longest raw input looked at, before any parsing. */
export const MAX_INPUT_CHARS = 4000;

/* ------------------------------------------------------------------ bytes */

export type BytesParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; bytes: number[]; note: string | null };

/**
 * Hex bytes in the forms people paste: DEADBEEF, DE AD BE EF, de:ad:be:ef,
 * 0xDE 0xAD, \xde\xad, dead.beef. A lone token with an odd digit count is
 * read as a number and padded on the left; anywhere else it is an error,
 * because there is no way to know which nibble is missing.
 */
export function parseHexBytes(raw: string): BytesParse {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_CHARS) {
    return { kind: "error", message: `That is ${text.length} characters. Paste at most ${MAX_BYTES} bytes.` };
  }
  if (/^[-\u2212]/.test(text)) {
    return {
      kind: "error",
      message: "Bytes have no sign. To see how a negative number is stored, switch to integer input.",
    };
  }
  const cleaned = text
    .replace(/\\x/gi, " ")
    .replace(/(^|[^0-9a-z])0x/gi, "$1 ")
    .replace(/_/g, "");
  const tokens = cleaned.split(/[\s:,.;-]+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "error", message: "No hex digits found." };

  let hex = "";
  let note: string | null = null;
  for (const token of tokens) {
    const bad = /[^0-9a-f]/i.exec(token);
    if (bad) {
      return {
        kind: "error",
        message: `"${bad[0]}" is not a hex digit. A byte is two characters from 0 to 9 and A to F.`,
      };
    }
    if (token.length === 1) {
      hex += `0${token}`;
    } else if (token.length % 2 === 1) {
      if (tokens.length !== 1) {
        return {
          kind: "error",
          message: `"${token}" has an odd number of hex digits, so it does not split into whole bytes. Add the missing leading zero.`,
        };
      }
      hex += `0${token}`;
      note = `Odd number of digits, so it was read as 0${token.toUpperCase()}, padded on the left the way a number would be.`;
    } else {
      hex += token;
    }
  }
  const count = hex.length / 2;
  if (count > MAX_BYTES) {
    return {
      kind: "error",
      message: `That is ${count} bytes. This reads up to ${MAX_BYTES} at a time; paste the part you want to interpret.`,
    };
  }
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return { kind: "ok", bytes, note };
}

/* --------------------------------------------------------------- integers */

export type IntParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: bigint; width: Width; bytes: number[]; note: string | null };

const pow2 = (n: number): bigint => 1n << BigInt(n);

export function unsignedMax(width: Width): bigint {
  return pow2(width) - 1n;
}
export function signedMin(width: Width): bigint {
  return -pow2(width - 1);
}
export function signedMax(width: Width): bigint {
  return pow2(width - 1) - 1n;
}

function fits(value: bigint, width: Width): boolean {
  return value >= signedMin(width) && value <= unsignedMax(width);
}

/** Two's complement bytes, most significant first, written through DataView. */
export function integerToBytes(value: bigint, width: Width): number[] {
  const unsigned = value < 0n ? value + pow2(width) : value;
  const view = new DataView(new ArrayBuffer(width / 8));
  if (width === 16) view.setUint16(0, Number(unsigned), false);
  else if (width === 32) view.setUint32(0, Number(unsigned), false);
  else view.setBigUint64(0, unsigned, false);
  return Array.from(new Uint8Array(view.buffer));
}

/**
 * An integer in decimal, 0x hex, 0b binary or 0o octal, optionally negative,
 * with _ , and spaces allowed as digit separators. "auto" picks the narrowest
 * of 16, 32 and 64 bits that holds it as either signed or unsigned.
 */
export function parseInteger(raw: string, width: Width | "auto"): IntParse {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.length > 200) {
    return { kind: "error", message: "That is longer than any 64-bit integer can be written." };
  }
  const text = trimmed.replace(/−/g, "-").replace(/[\s_,]/g, "");
  const m = /^([+-]?)(0x|0b|0o)?(.*)$/i.exec(text);
  if (!m) return { kind: "error", message: "Not an integer." };
  const neg = m[1] === "-";
  const prefix = (m[2] ?? "").toLowerCase();
  const digits = m[3];
  const base = prefix === "0x" ? 16 : prefix === "0b" ? 2 : prefix === "0o" ? 8 : 10;
  const allowed = { 16: /^[0-9a-f]+$/i, 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/ }[base];
  if (digits === "") return { kind: "error", message: "There are no digits after the prefix." };
  if (!allowed.test(digits)) {
    if (base === 10 && /^[0-9a-f]+$/i.test(digits)) {
      return {
        kind: "error",
        message: "That has hex letters but no 0x prefix. Write 0xDEADBEEF, or switch to hex bytes.",
      };
    }
    if (base === 10 && /[.e]/i.test(digits)) {
      return { kind: "error", message: "Integers only here. For a floating point value, enter its bytes in hex." };
    }
    const names = { 16: "hex", 2: "binary", 8: "octal", 10: "decimal" } as const;
    const bad = digits.split("").find((c) => !allowed.test(c)) ?? digits[0];
    return { kind: "error", message: `"${bad}" is not a ${names[base]} digit.` };
  }
  if (digits.length > 70) {
    return { kind: "error", message: "That is longer than any 64-bit integer can be written." };
  }
  const magnitude = BigInt(prefix ? `${prefix}${digits}` : digits);
  const value = neg ? -magnitude : magnitude;

  if (!fits(value, 64)) {
    return {
      kind: "error",
      message: `Out of range. The widest view here is 64 bits, which holds ${signedMin(64)} to ${unsignedMax(64)}.`,
    };
  }

  let chosen: Width;
  if (width === "auto") {
    chosen = WIDTHS.find((w) => fits(value, w)) ?? 64;
  } else {
    if (!fits(value, width)) {
      return {
        kind: "error",
        message: `${value} does not fit in ${width} bits: unsigned holds 0 to ${unsignedMax(width)}, signed holds ${signedMin(width)} to ${signedMax(width)}.`,
      };
    }
    chosen = width;
  }
  const note =
    base === 10 && /^0\d/.test(digits)
      ? "Read as decimal. A leading zero does not mean octal here; write 0o755 for that."
      : null;
  return { kind: "ok", value, width: chosen, bytes: integerToBytes(value, chosen), note };
}

/* ------------------------------------------------------------------ views */

function viewOf(bytes: number[], offset: number, length: number): DataView | null {
  if (!Number.isInteger(offset) || offset < 0 || offset + length > bytes.length) return null;
  return new DataView(Uint8Array.from(bytes.slice(offset, offset + length)).buffer);
}

export interface IntView {
  width: Width;
  order: Order;
  /** The width/8 bytes in memory order, lowest address first. */
  bytes: number[];
  /** Index into `bytes` of the most significant byte. */
  msbIndex: number;
  /** The value written most significant digit first, for example 0xEFBEADDE. */
  hex: string;
  unsigned: bigint;
  signed: bigint;
}

/** One integer reading, or null when fewer than width/8 bytes remain from the offset. */
export function intView(bytes: number[], offset: number, width: Width, order: Order): IntView | null {
  const size = width / 8;
  const view = viewOf(bytes, offset, size);
  if (!view) return null;
  const little = order === "little";
  let unsigned: bigint;
  let signed: bigint;
  if (width === 16) {
    unsigned = BigInt(view.getUint16(0, little));
    signed = BigInt(view.getInt16(0, little));
  } else if (width === 32) {
    unsigned = BigInt(view.getUint32(0, little));
    signed = BigInt(view.getInt32(0, little));
  } else {
    unsigned = view.getBigUint64(0, little);
    signed = view.getBigInt64(0, little);
  }
  return {
    width,
    order,
    bytes: bytes.slice(offset, offset + size),
    msbIndex: little ? size - 1 : 0,
    hex: hexValue(unsigned, width),
    unsigned,
    signed,
  };
}

export interface FloatView {
  width: 32 | 64;
  order: Order;
  bytes: number[];
  msbIndex: number;
  /** The bit pattern, most significant first. */
  bitsHex: string;
  /** DataView's reading. NaN payloads are not kept by a Number, so see `text`. */
  value: number;
  /** Shortest decimal that reads back to the same float, or a NaN description. */
  text: string;
}

export function floatView(bytes: number[], offset: number, width: 32 | 64, order: Order): FloatView | null {
  const size = width / 8;
  const view = viewOf(bytes, offset, size);
  if (!view) return null;
  const little = order === "little";
  const bits = width === 32 ? BigInt(view.getUint32(0, little)) : view.getBigUint64(0, little);
  const value = width === 32 ? view.getFloat32(0, little) : view.getFloat64(0, little);
  const decoded = decode(bits, width === 32 ? BINARY32 : BINARY64);
  let text = shortestDecimal(decoded);
  if (decoded.cls === "nan") {
    text = `${decoded.sign ? "-" : ""}NaN (${decoded.quiet ? "quiet" : "signaling"}, payload 0x${(decoded.payload ?? 0n).toString(16).toUpperCase()})`;
  } else if (decoded.cls === "subnormal") {
    text = `${text} (subnormal)`;
  }
  return {
    width,
    order,
    bytes: bytes.slice(offset, offset + size),
    msbIndex: little ? size - 1 : 0,
    bitsHex: hexValue(bits, width),
    value,
    text,
  };
}

/* ------------------------------------------------------------------ swaps */

/** Reverses the byte order of an unsigned width-bit value: bswap16/32/64. */
export function bswap(value: bigint, width: Width): bigint {
  const masked = value & unsignedMax(width);
  let out = 0n;
  for (let i = 0; i < width / 8; i++) out = (out << 8n) | ((masked >> BigInt(8 * i)) & 0xffn);
  return out;
}

export function reverseBytes(bytes: number[]): number[] {
  return [...bytes].reverse();
}

/** Reverses each group of `size` bytes in place, or null when the length is not a multiple. */
export function swapWithin(bytes: number[], size: 2 | 4 | 8): number[] | null {
  if (bytes.length === 0 || bytes.length % size !== 0) return null;
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(...bytes.slice(i, i + size).reverse());
  return out;
}

/* ------------------------------------------------------------- formatting */

export function hexByte(b: number): string {
  return b.toString(16).toUpperCase().padStart(2, "0");
}

export function bytesToHex(bytes: number[], sep = " "): string {
  return bytes.map(hexByte).join(sep);
}

/** 0x-prefixed, zero-padded to the full width. */
export function hexValue(value: bigint, width: number): string {
  const masked = value & (pow2(width) - 1n);
  return `0x${masked.toString(16).toUpperCase().padStart(width / 4, "0")}`;
}

/** C-style escaped string, the form an exploit payload or a test fixture uses: \xDE\xAD. */
export function bytesToEscaped(bytes: number[]): string {
  return bytes.map((b) => `\\x${hexByte(b).toLowerCase()}`).join("");
}

/* ---------------------------------------------------------------- network */

/** True on a little-endian host. Typed arrays use the platform's order, DataView does not. */
export function hostIsLittleEndian(): boolean {
  return new Uint8Array(new Uint16Array([0x0102]).buffer)[0] === 0x02;
}

export interface NetworkReading {
  width: Width;
  /** The bytes as they travel: network order is big endian. */
  wire: bigint;
  /** What a plain load on a little-endian CPU puts in the register. */
  littleHostLoad: bigint;
  /** The C helper that converts between the two on that width. */
  fn: string;
}

const NETWORK_FN: Record<Width, string> = { 16: "ntohs", 32: "ntohl", 64: "be64toh" };

/** The wire value and the little-endian register value for each width that fits. */
export function networkReadings(bytes: number[], offset: number): NetworkReading[] {
  const out: NetworkReading[] = [];
  for (const width of WIDTHS) {
    const big = intView(bytes, offset, width, "big");
    const little = intView(bytes, offset, width, "little");
    if (!big || !little) continue;
    out.push({ width, wire: big.unsigned, littleHostLoad: little.unsigned, fn: NETWORK_FN[width] });
  }
  return out;
}
