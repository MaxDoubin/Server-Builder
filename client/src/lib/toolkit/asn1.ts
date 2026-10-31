/**
 * A small DER parser and the X.509 building blocks shared by the
 * certificate decoder and the CSR decoder.
 *
 * Written from ITU-T X.690 (the encoding rules) and RFC 5280 (the X.509
 * profile), with RFC 2986 for PKCS#10, RFC 7468 for the PEM armor, RFC 8017
 * and RFC 4055 for RSA, RFC 5480 for elliptic curve keys and RFC 8410 for
 * Ed25519. It is deliberately narrow: definite lengths only, because DER
 * forbids anything else, and decoders only for the structures the two tools
 * display.
 *
 * Every parse is bounded by the caps below and every failure becomes a
 * DerError carrying the byte offset where it happened. The public entry
 * points in the two decoders catch those, so hostile input produces a
 * message rather than an exception. Pure data in, data out: no React and no
 * DOM, so all of it can be unit tested. The one asynchronous function,
 * verifySignature, uses the Web Crypto API that both browsers and Node
 * provide.
 */

/* ------------------------------------------------------------------ caps */

/** Largest pasted text the decoders read: 1 MiB. */
export const MAX_TEXT_CHARS = 1_048_576;
/** Largest uploaded file: 1 MiB. */
export const MAX_FILE_BYTES = 1_048_576;
/** Largest single DER object parsed: 256 KiB. Real certificates are 1 to 3 KiB. */
export const MAX_DER_BYTES = 262_144;
/** PEM blocks or bundle entries processed from one input. */
export const MAX_OBJECTS = 20;
/** Nesting depth the parser descends to. X.509 needs about 10. */
export const MAX_DEPTH = 32;
/** Elements parsed per object before the parser stops. */
export const MAX_NODES = 20_000;
/** Entries listed per extension before the rest are summarized. */
export const MAX_LISTED_ENTRIES = 500;

/* ---------------------------------------------------------------- errors */

export class DerError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.name = "DerError";
    this.offset = offset;
  }
}

/** Turns anything thrown during a parse into one readable sentence. */
export function errorText(err: unknown): string {
  if (err instanceof DerError) return `${err.message} (at byte ${err.offset}).`;
  if (err instanceof RangeError) return "The structure is too large or too deeply nested to decode safely.";
  return "The data could not be decoded.";
}

/* ------------------------------------------------------------ the parser */

export interface DerNode {
  /** 0 universal, 1 application, 2 context-specific, 3 private. */
  cls: number;
  constructed: boolean;
  tag: number;
  /** Offset of the identifier octet. */
  start: number;
  /** Offset of the first content octet. */
  contentStart: number;
  /** Offset one past the last content octet. */
  end: number;
  /** Parsed children. Empty for a primitive element. */
  children: DerNode[];
}

export const TAG = {
  BOOLEAN: 1,
  INTEGER: 2,
  BIT_STRING: 3,
  OCTET_STRING: 4,
  NULL: 5,
  OID: 6,
  UTF8_STRING: 12,
  SEQUENCE: 16,
  SET: 17,
  NUMERIC_STRING: 18,
  PRINTABLE_STRING: 19,
  T61_STRING: 20,
  IA5_STRING: 22,
  UTC_TIME: 23,
  GENERALIZED_TIME: 24,
  VISIBLE_STRING: 26,
  UNIVERSAL_STRING: 28,
  BMP_STRING: 30,
} as const;

const UNIVERSAL_NAMES: Record<number, string> = {
  1: "BOOLEAN",
  2: "INTEGER",
  3: "BIT STRING",
  4: "OCTET STRING",
  5: "NULL",
  6: "OBJECT IDENTIFIER",
  10: "ENUMERATED",
  12: "UTF8String",
  16: "SEQUENCE",
  17: "SET",
  18: "NumericString",
  19: "PrintableString",
  20: "TeletexString",
  22: "IA5String",
  23: "UTCTime",
  24: "GeneralizedTime",
  26: "VisibleString",
  28: "UniversalString",
  30: "BMPString",
};

/** SEQUENCE, INTEGER, [0], [APPLICATION 3]: for error messages. */
export function describeTag(node: DerNode): string {
  if (node.cls === 0) return UNIVERSAL_NAMES[node.tag] ?? `universal tag ${node.tag}`;
  if (node.cls === 2) return `[${node.tag}]`;
  return `[${node.cls === 1 ? "APPLICATION" : "PRIVATE"} ${node.tag}]`;
}

interface Budget {
  nodes: number;
}

/**
 * Parses exactly one element starting at `start`, with every child of every
 * constructed element, and never reads past `end`. Primitive contents such
 * as an OCTET STRING are left alone: extension values are parsed on demand
 * with a second call over the content range.
 */
export function parseDer(buf: Uint8Array, start = 0, end = buf.length): DerNode {
  if (end - start > MAX_DER_BYTES) {
    throw new DerError(`The object is larger than the ${MAX_DER_BYTES / 1024} KiB this tool parses`, start);
  }
  return parseElement(buf, start, end, 0, { nodes: 0 });
}

/** Parses a range that must hold one element and nothing after it. */
export function parseExactly(buf: Uint8Array, start: number, end: number, what: string): DerNode {
  const node = parseDer(buf, start, end);
  if (node.end !== end) {
    throw new DerError(`${end - node.end} unexpected bytes follow the ${what}`, node.end);
  }
  return node;
}

function parseElement(buf: Uint8Array, pos: number, limit: number, depth: number, budget: Budget): DerNode {
  if (depth > MAX_DEPTH) throw new DerError(`Nesting is deeper than ${MAX_DEPTH} levels`, pos);
  if (++budget.nodes > MAX_NODES) throw new DerError(`More than ${MAX_NODES} elements`, pos);
  if (pos >= limit) throw new DerError("The data ends where an element should start", pos);

  const start = pos;
  const id = buf[pos++];
  const cls = id >> 6;
  const constructed = (id & 0x20) !== 0;
  let tag = id & 0x1f;

  // X.690 8.1.2.4: tag numbers of 31 and above continue in base 128.
  if (tag === 0x1f) {
    tag = 0;
    let count = 0;
    for (;;) {
      if (pos >= limit) throw new DerError("The data ends inside a tag number", pos);
      const b = buf[pos++];
      if (count === 0 && b === 0x80) throw new DerError("A tag number is padded with a leading zero group", pos - 1);
      tag = tag * 128 + (b & 0x7f);
      if (++count > 4) throw new DerError("A tag number is too large", start);
      if ((b & 0x80) === 0) break;
    }
  }

  if (pos >= limit) throw new DerError("The data ends before a length", pos);
  const first = buf[pos++];
  let length: number;
  if (first < 0x80) {
    length = first;
  } else if (first === 0x80) {
    // X.690 10.1: DER always uses the definite form.
    throw new DerError("An indefinite length appears, which BER allows and DER forbids", start);
  } else if (first === 0xff) {
    throw new DerError("A length uses the reserved value 0xFF", pos - 1);
  } else {
    const count = first & 0x7f;
    if (count > 4) throw new DerError(`A length field is ${count} bytes long, too large to be real`, pos - 1);
    if (pos + count > limit) throw new DerError("The data ends inside a length field", pos);
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + buf[pos++];
  }

  const contentStart = pos;
  if (length > limit - contentStart) {
    throw new DerError(
      `A ${describeTag({ cls, constructed, tag, start, contentStart, end: 0, children: [] })} claims ${length} bytes but only ${limit - contentStart} remain, so the data is truncated or corrupted`,
      start,
    );
  }
  const end = contentStart + length;
  const children: DerNode[] = [];
  if (constructed) {
    let p = contentStart;
    while (p < end) {
      const child = parseElement(buf, p, end, depth + 1, budget);
      children.push(child);
      p = child.end;
    }
  }
  return { cls, constructed, tag, start, contentStart, end, children };
}

/* ----------------------------------------------------------- accessors */

/*
  Overloaded so that a node already known to exist is not narrowed away in
  the false branch (a tag test is not a type distinction), while a possibly
  missing node is narrowed to DerNode in the true branch.
*/
export function isUniversal(node: DerNode, tag: number): boolean;
export function isUniversal(node: DerNode | undefined, tag: number): node is DerNode;
export function isUniversal(node: DerNode | undefined, tag: number): boolean {
  return node !== undefined && node.cls === 0 && node.tag === tag;
}

export function isContext(node: DerNode, tag: number): boolean;
export function isContext(node: DerNode | undefined, tag: number): node is DerNode;
export function isContext(node: DerNode | undefined, tag: number): boolean {
  return node !== undefined && node.cls === 2 && node.tag === tag;
}

/** Requires a universal element of one type, or explains what was there instead. */
export function expectTag(node: DerNode | undefined, tag: number, what: string, at: number): DerNode {
  if (!node) throw new DerError(`The ${what} is missing`, at);
  if (!isUniversal(node, tag)) {
    throw new DerError(`Expected ${UNIVERSAL_NAMES[tag] ?? `tag ${tag}`} for the ${what}, found ${describeTag(node)}`, node.start);
  }
  return node;
}

export function contentOf(buf: Uint8Array, node: DerNode): Uint8Array {
  return buf.subarray(node.contentStart, node.end);
}

export function bytesOf(buf: Uint8Array, node: DerNode): Uint8Array {
  return buf.subarray(node.start, node.end);
}

/** X.690 8.19: an OBJECT IDENTIFIER in dotted decimal. BigInt keeps long arcs such as 2.25 UUIDs exact. */
export function decodeOid(bytes: Uint8Array, at = 0): string {
  if (bytes.length === 0) throw new DerError("An OBJECT IDENTIFIER is empty", at);
  if (bytes.length > 256) throw new DerError("An OBJECT IDENTIFIER is unreasonably long", at);
  const subs: bigint[] = [];
  let value = 0n;
  let inSub = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (!inSub && b === 0x80) {
      throw new DerError("An OBJECT IDENTIFIER arc is padded with a leading 0x80, which X.690 8.19.2 forbids", at + i);
    }
    inSub = true;
    value = (value << 7n) | BigInt(b & 0x7f);
    if ((b & 0x80) === 0) {
      subs.push(value);
      value = 0n;
      inSub = false;
    }
  }
  if (inSub) throw new DerError("An OBJECT IDENTIFIER ends in the middle of an arc", at + bytes.length - 1);
  // X.690 8.19.4: the first subidentifier packs the first two arcs as 40 * X + Y.
  const head = subs[0];
  const arcs: bigint[] = head < 40n ? [0n, head] : head < 80n ? [1n, head - 40n] : [2n, head - 80n];
  return arcs.concat(subs.slice(1)).join(".");
}

export function readOid(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): string {
  const n = expectTag(node, TAG.OID, what, at);
  return decodeOid(contentOf(buf, n), n.contentStart);
}

/** Largest INTEGER decoded: 8 KiB, enough for a 65536 bit RSA modulus. */
const MAX_INTEGER_BYTES = 8_192;

/** X.690 8.3: a two's complement big-endian INTEGER. */
export function decodeInteger(bytes: Uint8Array, at = 0): bigint {
  if (bytes.length === 0) throw new DerError("An INTEGER has no content bytes", at);
  if (bytes.length > MAX_INTEGER_BYTES) throw new DerError("An INTEGER is too large to decode", at);
  let value = 0n;
  for (let i = 0; i < bytes.length; i++) value = (value << 8n) | BigInt(bytes[i]);
  if (bytes[0] & 0x80) value -= 1n << BigInt(bytes.length * 8);
  return value;
}

export function readInteger(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): bigint {
  const n = expectTag(node, TAG.INTEGER, what, at);
  return decodeInteger(contentOf(buf, n), n.contentStart);
}

/** An INTEGER that must be a small non-negative number, such as a version or a path length. */
export function readSmallInt(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): number {
  const value = readInteger(buf, node, what, at);
  if (value < 0n || value > 1_000_000n) {
    throw new DerError(`The ${what} is ${value}, outside any sensible range`, node?.start ?? at);
  }
  return Number(value);
}

/** A small INTEGER read from content bytes directly, for IMPLICIT tagged integers. */
export function smallIntFromContent(buf: Uint8Array, node: DerNode, what: string): number {
  const value = decodeInteger(contentOf(buf, node), node.contentStart);
  if (value < 0n || value > 1_000_000n) throw new DerError(`The ${what} is out of range`, node.start);
  return Number(value);
}

export function readBoolean(buf: Uint8Array, node: DerNode): boolean {
  if (node.end - node.contentStart !== 1) throw new DerError("A BOOLEAN is not exactly one byte", node.start);
  return buf[node.contentStart] !== 0;
}

export interface BitString {
  unused: number;
  bytes: Uint8Array;
}

/** X.690 8.6: the first content octet counts the unused bits in the last octet. */
export function readBitString(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): BitString {
  const n = expectTag(node, TAG.BIT_STRING, what, at);
  return bitStringFromContent(buf, n, what);
}

export function bitStringFromContent(buf: Uint8Array, node: DerNode, what: string): BitString {
  if (node.constructed) throw new DerError(`The ${what} uses the constructed form, which DER forbids`, node.start);
  const content = contentOf(buf, node);
  if (content.length === 0) throw new DerError(`The ${what} has no content bytes`, node.start);
  const unused = content[0];
  if (unused > 7 || (content.length === 1 && unused !== 0)) {
    throw new DerError(`The ${what} declares ${unused} unused bits, which is impossible`, node.contentStart);
  }
  return { unused, bytes: content.subarray(1) };
}

/** Bit i counts from the most significant bit of the first octet, as X.690 8.6.2 numbers them. */
export function bitIsSet(bits: BitString, index: number): boolean {
  const byte = index >> 3;
  if (byte >= bits.bytes.length) return false;
  if (byte === bits.bytes.length - 1 && (index & 7) >= 8 - bits.unused) return false;
  return ((bits.bytes[byte] >> (7 - (index & 7))) & 1) === 1;
}

/* --------------------------------------------------------------- strings */

const STRING_TAGS = new Set<number>([
  TAG.UTF8_STRING,
  TAG.NUMERIC_STRING,
  TAG.PRINTABLE_STRING,
  TAG.T61_STRING,
  TAG.IA5_STRING,
  TAG.VISIBLE_STRING,
  TAG.UNIVERSAL_STRING,
  TAG.BMP_STRING,
]);

export function isStringNode(node: DerNode): boolean {
  return node.cls === 0 && !node.constructed && STRING_TAGS.has(node.tag);
}

function fromCodes(codes: number[]): string {
  let out = "";
  for (let i = 0; i < codes.length; i += 4096) out += String.fromCodePoint(...codes.slice(i, i + 4096));
  return out;
}

export interface DecodedString {
  text: string;
  /** Set when the bytes break the rules of the declared string type. */
  issue: string | null;
}

/** Decodes the character string types X.509 uses, never throwing on bad bytes. */
export function decodeStringBytes(tag: number, bytes: Uint8Array): DecodedString {
  if (tag === TAG.UTF8_STRING) {
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), issue: null };
    } catch {
      return { text: new TextDecoder("utf-8").decode(bytes), issue: "The UTF8String holds bytes that are not valid UTF-8." };
    }
  }
  if (tag === TAG.BMP_STRING) {
    // UCS-2 big-endian, two bytes per character.
    const codes: number[] = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) codes.push((bytes[i] << 8) | bytes[i + 1]);
    let text = "";
    for (let i = 0; i < codes.length; i += 4096) text += String.fromCharCode(...codes.slice(i, i + 4096));
    return { text, issue: bytes.length % 2 ? "The BMPString has an odd number of bytes." : null };
  }
  if (tag === TAG.UNIVERSAL_STRING) {
    // UCS-4 big-endian, four bytes per character.
    const codes: number[] = [];
    let bad = bytes.length % 4 !== 0;
    for (let i = 0; i + 3 < bytes.length; i += 4) {
      const cp = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        bad = true;
        codes.push(0xfffd);
      } else codes.push(cp);
    }
    return { text: fromCodes(codes), issue: bad ? "The UniversalString holds invalid code points." : null };
  }
  // PrintableString, IA5String, VisibleString and NumericString are ASCII.
  // TeletexString is formally T.61; in practice it carries Latin-1, which is
  // how every common library reads it.
  const codes = Array.from(bytes);
  const highBit = tag !== TAG.T61_STRING && codes.some((c) => c > 0x7f);
  return {
    text: fromCodes(codes),
    issue: highBit ? `The ${UNIVERSAL_NAMES[tag]} holds bytes above 0x7F, outside its character set.` : null,
  };
}

/** Control, bidirectional override and zero width characters, which can make two names look identical. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Makes invisible characters visible as \xNN or \u{NNNN}, so a NUL inside a name cannot hide. */
export function visible(text: string): { text: string; hidden: boolean } {
  let hidden = false;
  const out = text.replace(INVISIBLE, (ch) => {
    hidden = true;
    const code = ch.charCodeAt(0);
    return code <= 0xff ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u{${code.toString(16)}}`;
  });
  return { text: out, hidden };
}

export function readString(buf: Uint8Array, node: DerNode): DecodedString {
  if (!isStringNode(node)) throw new DerError(`Expected a character string, found ${describeTag(node)}`, node.start);
  return decodeStringBytes(node.tag, contentOf(buf, node));
}

/** Reads a context tagged IA5String, as GeneralName uses for DNS names, email and URIs. */
export function ia5FromContent(buf: Uint8Array, node: DerNode): DecodedString {
  return decodeStringBytes(TAG.IA5_STRING, contentOf(buf, node));
}

/* ----------------------------------------------------------------- times */

export interface DecodedTime {
  /** Milliseconds since the epoch, or null when the value cannot be read. */
  ms: number | null;
  raw: string;
  type: "UTCTime" | "GeneralizedTime";
  issue: string | null;
}

const MS_PER_DAY = 86_400_000;

function buildUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, ms: number): number | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 60) return null;
  const date = new Date(Date.UTC(2000, mo - 1, d, h, mi, Math.min(s, 59), ms));
  date.setUTCFullYear(y);
  // A day that does not exist in that month rolls over; catch it.
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.getTime();
}

/**
 * RFC 5280 4.1.2.5: UTCTime is YYMMDDHHMMSSZ, with YY of 50 or more meaning
 * 19YY and less than 50 meaning 20YY. GeneralizedTime is YYYYMMDDHHMMSSZ.
 * Dates through 2049 must use UTCTime and 2050 onward GeneralizedTime. Other
 * forms X.680 allows (no seconds, an offset, fractions) are read but flagged.
 */
export function readTime(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): DecodedTime {
  if (!node) throw new DerError(`The ${what} is missing`, at);
  const isUtc = isUniversal(node, TAG.UTC_TIME);
  if (!isUtc && !isUniversal(node, TAG.GENERALIZED_TIME)) {
    throw new DerError(`Expected UTCTime or GeneralizedTime for the ${what}, found ${describeTag(node)}`, node.start);
  }
  const raw = decodeStringBytes(TAG.IA5_STRING, contentOf(buf, node)).text;
  const type = isUtc ? "UTCTime" : "GeneralizedTime";
  const strict = isUtc ? /^\d{12}Z$/ : /^\d{14}Z$/;
  const loose = isUtc
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(?:[.,](\d{1,9}))?(Z|[+-]\d{4})?$/;
  const m = loose.exec(raw);
  if (!m) return { ms: null, raw, type, issue: `The ${what} "${visible(raw).text}" is not a valid ${type}.` };

  let year: number;
  let offsetText: string | undefined;
  let frac = 0;
  if (isUtc) {
    const yy = Number(m[1]);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
    offsetText = m[7];
  } else {
    year = Number(m[1]);
    if (m[7]) frac = Math.round(Number(`0.${m[7]}`) * 1000);
    offsetText = m[8];
  }
  const base = buildUtc(year, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5] ?? 0), Number(m[6] ?? 0), frac);
  if (base === null) return { ms: null, raw, type, issue: `The ${what} "${raw}" names a date or time that does not exist.` };

  let ms = base;
  if (offsetText && offsetText !== "Z") {
    const sign = offsetText[0] === "-" ? -1 : 1;
    const minutes = Number(offsetText.slice(1, 3)) * 60 + Number(offsetText.slice(3, 5));
    ms -= sign * minutes * 60_000;
  }

  let issue: string | null = null;
  if (!strict.test(raw)) {
    issue = `The ${what} is not in the ${isUtc ? "YYMMDDHHMMSSZ" : "YYYYMMDDHHMMSSZ"} form RFC 5280 requires${offsetText ? "" : ", and with no Z it has no stated time zone, so it was read as UTC"}.`;
  } else if (!isUtc && year >= 1950 && year < 2050) {
    issue = `The ${what} uses GeneralizedTime for a year before 2050, where RFC 5280 says to use UTCTime.`;
  }
  return { ms, raw, type, issue };
}

/** 2027-11-01 00:00:00 UTC */
export function formatUtc(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** Whole days between two instants, rounded toward zero. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.trunc((toMs - fromMs) / MS_PER_DAY);
}

/* ------------------------------------------------------------ hex, base64 */

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
  return out;
}

/** AB:CD:EF, the way OpenSSL prints fingerprints and key identifiers. */
export function colonHex(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i++) parts.push((HEX[bytes[i] >> 4] + HEX[bytes[i] & 15]).toUpperCase());
  return parts.join(":");
}

/** Hex for display, cut after `max` bytes with a count of what was left out. */
export function previewHex(bytes: Uint8Array, max = 64): string {
  if (bytes.length <= max) return colonHex(bytes);
  return `${colonHex(bytes.subarray(0, max))} (${bytes.length - max} more bytes)`;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[c & 63] : "=";
  }
  return out;
}

const B64_VALUE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) table[B64.charCodeAt(i)] = i;
  return table;
})();

/** RFC 4648 Base64 with whitespace already removed. Returns null on any invalid character or length. */
export function decodeBase64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const body = text.replace(/=+$/, "");
  if (body.length % 4 === 1) return null;
  if (text.length % 4 !== 0 && text.length !== body.length) return null;
  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < body.length; i++) {
    acc = (acc << 6) | B64_VALUE[body.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* -------------------------------------------------------------- digests */

/*
  SHA-1 and SHA-256 from FIPS 180-4, sections 6.1 and 6.2. They live here,
  synchronous and dependency free, because fingerprints and key pins are
  computed for every certificate on every keystroke, and SubtleCrypto.digest
  is asynchronous and missing outside secure contexts. Inputs are capped at
  MAX_FILE_BYTES upstream, so a single buffer is fine.
*/

function padForDigest(msg: Uint8Array): Uint8Array {
  const total = Math.ceil((msg.length + 9) / 64) * 64;
  const out = new Uint8Array(total);
  out.set(msg);
  out[msg.length] = 0x80;
  const view = new DataView(out.buffer);
  const bitLength = msg.length * 8;
  view.setUint32(total - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(total - 4, bitLength >>> 0);
  return out;
}

export function sha1(msg: Uint8Array): Uint8Array {
  const data = padForDigest(msg);
  const view = new DataView(data.buffer);
  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let off = 0; off < data.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = h;
    for (let t = 0; t < 80; t++) {
      let f: number;
      let k: number;
      if (t < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = temp;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  h.forEach((v, i) => ov.setUint32(i * 4, v));
  return out;
}

// prettier-ignore
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(msg: Uint8Array): Uint8Array {
  const data = padForDigest(msg);
  const view = new DataView(data.buffer);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < data.length; off += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(off + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

/* ------------------------------------------------------------- PEM input */

export interface InputObject {
  /** PEM label, or DER, BASE64 or HEX for unarmored input. */
  label: string;
  der: Uint8Array;
}

export type NoticeTone = "info" | "warn" | "danger";

export interface InputNotice {
  tone: NoticeTone;
  text: string;
}

export interface ReadResult {
  objects: InputObject[];
  notices: InputNotice[];
  /** Set when nothing at all could be read. */
  error: string | null;
}

const PEM_BEGIN = /-----BEGIN ([\x21-\x2c\x2e-\x7e](?:[\x20-\x2c\x2e-\x7e]*[\x21-\x2c\x2e-\x7e])?)-----/g;

/**
 * Reads pasted text: any number of RFC 7468 PEM blocks, or a single bare
 * Base64 or hex DER object. Private key blocks are recognized by label and
 * never decoded.
 */
export function readPemText(input: string): ReadResult {
  const notices: InputNotice[] = [];
  const objects: InputObject[] = [];
  if (input.length > MAX_TEXT_CHARS) {
    return { objects, notices, error: `The text is longer than ${MAX_TEXT_CHARS / 1_048_576} MiB, which is far more than any certificate bundle needs.` };
  }
  const text = input.replace(/^﻿/, "");
  if (text.trim() === "") return { objects, notices, error: null };

  PEM_BEGIN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let blocks = 0;
  let privateKeys = 0;
  while ((match = PEM_BEGIN.exec(text)) !== null) {
    const label = match[1];
    const bodyStart = match.index + match[0].length;
    const endMarker = text.indexOf("-----END ", bodyStart);
    if (endMarker < 0) {
      notices.push({ tone: "danger", text: `The "${label}" block has a BEGIN line but no END line, so it was cut off.` });
      break;
    }
    const endClose = text.indexOf("-----", endMarker + 9);
    const endLabel = endClose < 0 ? "" : text.slice(endMarker + 9, endClose);
    PEM_BEGIN.lastIndex = endClose < 0 ? text.length : endClose + 5;
    blocks++;

    if (/PRIVATE KEY/.test(label)) {
      privateKeys++;
      continue;
    }
    if (endLabel !== label) {
      notices.push({ tone: "danger", text: `A block begins with "${label}" but ends with "${endLabel}". The two labels must match.` });
      continue;
    }
    if (objects.length >= MAX_OBJECTS) {
      notices.push({ tone: "warn", text: `Only the first ${MAX_OBJECTS} blocks were decoded.` });
      break;
    }
    // RFC 1421 style headers (Proc-Type, DEK-Info) sit before a blank line in
    // legacy encrypted keys. Drop any line holding a colon.
    const body = text
      .slice(bodyStart, endMarker)
      .split(/\r?\n/)
      .filter((line) => !line.includes(":"))
      .join("")
      .replace(/\s+/g, "");
    const der = decodeBase64(body);
    if (!der || der.length === 0) {
      notices.push({
        tone: "danger",
        text: `Block ${blocks} ("${label}") is not valid Base64. A character may have been lost when it was copied.`,
      });
      continue;
    }
    objects.push({ label, der });
  }

  if (privateKeys > 0) {
    notices.push({
      tone: "danger",
      text: `${privateKeys === 1 ? "A private key block was" : `${privateKeys} private key blocks were`} found and skipped without being decoded. It never left this tab, but a private key pasted anywhere else should be treated as exposed and replaced.`,
    });
  }
  if (blocks > 0) return { objects, notices, error: null };

  // No armor. Try a single bare object, hex first because every hex string
  // is also valid Base64 and a DER object in hex starts with 30.
  const compact = text.replace(/\s+/g, "");
  if (/^(0x)?[0-9a-fA-F:]+$/.test(compact)) {
    const hex = compact.replace(/^0x/, "").replace(/:/g, "");
    if (hex.length % 2 === 0 && hex.slice(0, 2) === "30") {
      const der = new Uint8Array(hex.length / 2);
      for (let i = 0; i < der.length; i++) der[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      return { objects: [{ label: "HEX", der }], notices, error: null };
    }
  }
  const der = decodeBase64(compact);
  if (der && der.length > 0 && der[0] === 0x30) {
    return { objects: [{ label: "BASE64", der }], notices, error: null };
  }
  return {
    objects,
    notices,
    error: "No PEM block was found. A PEM object starts with a line such as -----BEGIN CERTIFICATE----- and ends with the matching END line.",
  };
}

/**
 * Reads an uploaded file: binary DER, or text in UTF-8, Latin-1 or UTF-16
 * (some Windows tools save PEM as UTF-16).
 */
export function readBinary(bytes: Uint8Array): ReadResult {
  if (bytes.length > MAX_FILE_BYTES) {
    return { objects: [], notices: [], error: `The file is larger than ${MAX_FILE_BYTES / 1_048_576} MiB. Certificates and requests are a few KiB.` };
  }
  if (bytes.length === 0) return { objects: [], notices: [], error: "The file is empty." };
  if (bytes[0] === 0x30) {
    try {
      const node = parseDer(bytes, 0, bytes.length);
      if (node.end === bytes.length) return { objects: [{ label: "DER", der: bytes }], notices: [], error: null };
    } catch {
      // Not DER; fall through to text.
    }
  }
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes.subarray(2));
  else text = new TextDecoder("utf-8").decode(bytes);
  const result = readPemText(text);
  if (result.error && result.objects.length === 0) {
    return { ...result, error: "The file is neither DER nor PEM. It may be a PKCS#12 (.pfx or .p12) bundle, which is encrypted and needs its password." };
  }
  return result;
}

/**
 * RFC 5652 5.1: pulls the certificates out of a PKCS#7 SignedData, the
 * .p7b bundle Windows tools export. Returns null when the object is not one.
 */
export function pkcs7Certificates(der: Uint8Array): Uint8Array[] | null {
  let root: DerNode;
  try {
    root = parseExactly(der, 0, der.length, "PKCS#7 object");
  } catch {
    return null;
  }
  const [typeNode, wrapper] = root.children;
  if (!isUniversal(typeNode, TAG.OID) || decodeOid(contentOf(der, typeNode)) !== "1.2.840.113549.1.7.2") return null;
  const signedData = wrapper?.children[0];
  if (!isContext(wrapper, 0) || !isUniversal(signedData, TAG.SEQUENCE)) return [];
  const certSet = signedData.children.find((c) => isContext(c, 0) && c.constructed);
  if (!certSet) return [];
  return certSet.children.filter((c) => isUniversal(c, TAG.SEQUENCE)).map((c) => der.subarray(c.start, c.end));
}

/* ---------------------------------------------------------- OID registry */

export const OID_NAMES: Record<string, string> = {
  // Signature and key algorithms
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.113549.1.1.2": "md2WithRSAEncryption",
  "1.2.840.113549.1.1.4": "md5WithRSAEncryption",
  "1.2.840.113549.1.1.5": "sha1WithRSAEncryption",
  "1.2.840.113549.1.1.8": "mgf1",
  "1.2.840.113549.1.1.10": "RSASSA-PSS",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.14": "sha224WithRSAEncryption",
  "1.2.840.10045.2.1": "id-ecPublicKey",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.1": "ecdsa-with-SHA224",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
  "1.2.840.10040.4.1": "dsa",
  "1.2.840.10040.4.3": "dsa-with-SHA1",
  "2.16.840.1.101.3.4.3.2": "dsa-with-SHA256",
  "1.3.101.110": "X25519",
  "1.3.101.111": "X448",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
  "2.16.840.1.101.3.4.3.17": "ML-DSA-44",
  "2.16.840.1.101.3.4.3.18": "ML-DSA-65",
  "2.16.840.1.101.3.4.3.19": "ML-DSA-87",
  "1.3.14.3.2.26": "sha1",
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
  "2.16.840.1.101.3.4.2.4": "sha224",
  "1.2.840.113549.2.5": "md5",
  // Named curves
  "1.2.840.10045.3.1.7": "P-256 (prime256v1, secp256r1)",
  "1.3.132.0.34": "P-384 (secp384r1)",
  "1.3.132.0.35": "P-521 (secp521r1)",
  "1.3.132.0.10": "secp256k1",
  "1.2.840.10045.3.1.1": "P-192 (prime192v1)",
  "1.3.132.0.33": "P-224 (secp224r1)",
  "1.3.36.3.3.2.8.1.1.7": "brainpoolP256r1",
  "1.3.36.3.3.2.8.1.1.11": "brainpoolP384r1",
  "1.3.36.3.3.2.8.1.1.13": "brainpoolP512r1",
  // Extensions
  "2.5.29.9": "subjectDirectoryAttributes",
  "2.5.29.14": "subjectKeyIdentifier",
  "2.5.29.15": "keyUsage",
  "2.5.29.16": "privateKeyUsagePeriod",
  "2.5.29.17": "subjectAltName",
  "2.5.29.18": "issuerAltName",
  "2.5.29.19": "basicConstraints",
  "2.5.29.30": "nameConstraints",
  "2.5.29.31": "cRLDistributionPoints",
  "2.5.29.32": "certificatePolicies",
  "2.5.29.33": "policyMappings",
  "2.5.29.35": "authorityKeyIdentifier",
  "2.5.29.36": "policyConstraints",
  "2.5.29.37": "extKeyUsage",
  "2.5.29.46": "freshestCRL",
  "2.5.29.54": "inhibitAnyPolicy",
  "1.3.6.1.5.5.7.1.1": "authorityInfoAccess",
  "1.3.6.1.5.5.7.1.11": "subjectInfoAccess",
  "1.3.6.1.5.5.7.1.24": "tlsFeature",
  "1.3.6.1.5.5.7.48.1.5": "ocspNoCheck",
  "1.3.6.1.4.1.11129.2.4.2": "Signed certificate timestamps",
  "1.3.6.1.4.1.11129.2.4.3": "Precertificate poison",
  "2.16.840.1.113730.1.1": "Netscape certificate type",
  "2.16.840.1.113730.1.13": "Netscape comment",
  "1.3.6.1.4.1.311.20.2": "Microsoft certificate template name",
  "1.3.6.1.4.1.311.21.7": "Microsoft certificate template",
  "1.3.6.1.4.1.311.21.10": "Microsoft application policies",
  "1.3.6.1.4.1.311.21.1": "Microsoft CA version",
  "1.3.6.1.4.1.311.21.2": "Microsoft previous CA certificate hash",
  // Extended key usages
  "2.5.29.37.0": "anyExtendedKeyUsage",
  "1.3.6.1.5.5.7.3.1": "serverAuth (TLS server)",
  "1.3.6.1.5.5.7.3.2": "clientAuth (TLS client)",
  "1.3.6.1.5.5.7.3.3": "codeSigning",
  "1.3.6.1.5.5.7.3.4": "emailProtection (S/MIME)",
  "1.3.6.1.5.5.7.3.5": "ipsecEndSystem",
  "1.3.6.1.5.5.7.3.6": "ipsecTunnel",
  "1.3.6.1.5.5.7.3.7": "ipsecUser",
  "1.3.6.1.5.5.7.3.8": "timeStamping",
  "1.3.6.1.5.5.7.3.9": "OCSPSigning",
  "1.3.6.1.5.5.7.3.17": "ipsecIKE",
  "1.3.6.1.5.5.7.3.36": "documentSigning",
  "1.3.6.1.5.2.3.4": "Kerberos PKINIT client",
  "1.3.6.1.5.2.3.5": "Kerberos PKINIT KDC",
  "1.3.6.1.4.1.311.20.2.2": "Microsoft smart card logon",
  "1.3.6.1.4.1.311.10.3.4": "Microsoft encrypting file system",
  "1.3.6.1.4.1.311.10.3.12": "Microsoft document signing",
  // Access methods and policy qualifiers
  "1.3.6.1.5.5.7.48.1": "OCSP",
  "1.3.6.1.5.5.7.48.2": "caIssuers",
  "1.3.6.1.5.5.7.48.3": "timeStamping",
  "1.3.6.1.5.5.7.48.5": "caRepository",
  "1.3.6.1.5.5.7.2.1": "CPS",
  "1.3.6.1.5.5.7.2.2": "User notice",
  // Certificate policies
  "2.5.29.32.0": "anyPolicy",
  "2.23.140.1.1": "Extended Validation (CA/Browser Forum)",
  "2.23.140.1.2.1": "Domain Validated (CA/Browser Forum)",
  "2.23.140.1.2.2": "Organization Validated (CA/Browser Forum)",
  "2.23.140.1.2.3": "Individual Validated (CA/Browser Forum)",
  // otherName types
  "1.3.6.1.4.1.311.20.2.3": "User principal name",
  "1.3.6.1.5.5.7.8.9": "SmtpUTF8Mailbox",
  // PKCS#9 attributes
  "1.2.840.113549.1.9.1": "emailAddress",
  "1.2.840.113549.1.9.2": "unstructuredName",
  "1.2.840.113549.1.9.7": "challengePassword",
  "1.2.840.113549.1.9.14": "extensionRequest",
  "1.2.840.113549.1.9.15": "smimeCapabilities",
  "1.3.6.1.4.1.311.13.2.3": "Microsoft OS version",
  "1.3.6.1.4.1.311.21.20": "Microsoft client information",
  "1.3.6.1.4.1.311.13.2.2": "Microsoft enrollment CSP",
};

export function oidName(oid: string): string {
  return OID_NAMES[oid] ?? oid;
}

/** "keyUsage (2.5.29.15)" or just the OID when unknown. */
export function oidLabel(oid: string): string {
  const name = OID_NAMES[oid];
  return name ? `${name} (${oid})` : oid;
}

/* ------------------------------------------------------------------ names */

interface AttrInfo {
  /** OpenSSL short name, which -subj accepts. */
  short: string;
  label: string;
  /** RFC 4514 descriptor, or undefined to print the dotted OID. */
  ldap?: string;
}

const NAME_ATTRS: Record<string, AttrInfo> = {
  "2.5.4.3": { short: "CN", label: "Common name", ldap: "CN" },
  "2.5.4.4": { short: "SN", label: "Surname", ldap: "SN" },
  "2.5.4.5": { short: "serialNumber", label: "Serial number", ldap: "serialNumber" },
  "2.5.4.6": { short: "C", label: "Country", ldap: "C" },
  "2.5.4.7": { short: "L", label: "Locality", ldap: "L" },
  "2.5.4.8": { short: "ST", label: "State or province", ldap: "ST" },
  "2.5.4.9": { short: "street", label: "Street address", ldap: "STREET" },
  "2.5.4.10": { short: "O", label: "Organization", ldap: "O" },
  "2.5.4.11": { short: "OU", label: "Organizational unit", ldap: "OU" },
  "2.5.4.12": { short: "title", label: "Title", ldap: "title" },
  "2.5.4.13": { short: "description", label: "Description", ldap: "description" },
  "2.5.4.15": { short: "businessCategory", label: "Business category", ldap: "businessCategory" },
  "2.5.4.17": { short: "postalCode", label: "Postal code", ldap: "postalCode" },
  "2.5.4.41": { short: "name", label: "Name", ldap: "name" },
  "2.5.4.42": { short: "GN", label: "Given name", ldap: "givenName" },
  "2.5.4.43": { short: "initials", label: "Initials", ldap: "initials" },
  "2.5.4.44": { short: "generationQualifier", label: "Generation qualifier", ldap: "generationQualifier" },
  "2.5.4.46": { short: "dnQualifier", label: "DN qualifier", ldap: "dnQualifier" },
  "2.5.4.65": { short: "pseudonym", label: "Pseudonym" },
  "2.5.4.97": { short: "organizationIdentifier", label: "Organization identifier" },
  "0.9.2342.19200300.100.1.25": { short: "DC", label: "Domain component", ldap: "DC" },
  "0.9.2342.19200300.100.1.1": { short: "UID", label: "User ID", ldap: "UID" },
  "1.2.840.113549.1.9.1": { short: "emailAddress", label: "Email address", ldap: "emailAddress" },
  "1.3.6.1.4.1.311.60.2.1.1": { short: "jurisdictionL", label: "Jurisdiction locality" },
  "1.3.6.1.4.1.311.60.2.1.2": { short: "jurisdictionST", label: "Jurisdiction state or province" },
  "1.3.6.1.4.1.311.60.2.1.3": { short: "jurisdictionC", label: "Jurisdiction country" },
};

export interface NameAttribute {
  oid: string;
  /** CN, O, emailAddress, or the dotted OID. */
  short: string;
  label: string;
  /** The decoded value, or #hex for a value that is not a string. */
  value: string;
  /** The value with invisible characters made visible. */
  display: string;
  /** UTF8String, PrintableString and so on. */
  valueType: string;
  /** Problems with this one value: invisible characters, bad bytes. */
  issues: string[];
  isString: boolean;
}

export interface DistinguishedName {
  /** RDNs in encoded order, most significant first. Usually one attribute each. */
  rdns: NameAttribute[][];
  /** The exact encoded bytes, for comparison. */
  der: Uint8Array;
  /** RFC 4514 string: reversed order, comma separated, escaped. */
  rfc4514: string;
  /** OpenSSL -subj form: /C=US/O=Example/CN=example.com */
  openssl: string;
  /** Every common name value, in order. */
  commonNames: string[];
}

/** RFC 4514 section 2.4 escaping for one string value. */
export function escapeRfc4514(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\u0000") out += "\\00";
    else if (',+"\\<>;'.includes(ch)) out += `\\${ch}`;
    else if ((i === 0 && (ch === " " || ch === "#")) || (i === value.length - 1 && ch === " ")) out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

/** OpenSSL -subj escaping: a backslash before / and \ (and + for multi-valued RDNs). */
function escapeOpenSsl(value: string): string {
  return value.replace(/[\\/+]/g, (ch) => `\\${ch}`);
}

/**
 * RFC 5280 4.1.2.4: Name ::= SEQUENCE OF RelativeDistinguishedName, each a
 * SET OF AttributeTypeAndValue.
 */
export function parseName(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): DistinguishedName {
  const seq = expectTag(node, TAG.SEQUENCE, what, at);
  const rdns: NameAttribute[][] = [];
  for (const set of seq.children) {
    expectTag(set, TAG.SET, `RDN in the ${what}`, set.start);
    if (set.children.length === 0) throw new DerError(`An RDN in the ${what} is empty`, set.start);
    const rdn: NameAttribute[] = [];
    for (const atv of set.children) {
      expectTag(atv, TAG.SEQUENCE, `attribute in the ${what}`, atv.start);
      if (atv.children.length !== 2) throw new DerError(`An attribute in the ${what} does not have exactly a type and a value`, atv.start);
      const oid = readOid(buf, atv.children[0], `attribute type in the ${what}`, atv.start);
      const valueNode = atv.children[1];
      const info = NAME_ATTRS[oid];
      const issues: string[] = [];
      let value: string;
      let isString = false;
      let valueType: string;
      if (isStringNode(valueNode)) {
        const decoded = readString(buf, valueNode);
        value = decoded.text;
        isString = true;
        valueType = UNIVERSAL_NAMES[valueNode.tag];
        if (decoded.issue) issues.push(decoded.issue);
      } else {
        value = `#${toHex(bytesOf(buf, valueNode))}`;
        valueType = describeTag(valueNode);
      }
      const vis = visible(value);
      if (vis.hidden) {
        issues.push("The value contains control, zero width or bidirectional characters, shown escaped. These are a known way to make one name look like another.");
      }
      rdn.push({
        oid,
        short: info?.short ?? oid,
        label: info?.label ?? oidName(oid),
        value,
        display: vis.text,
        valueType,
        issues,
        isString,
      });
    }
    rdns.push(rdn);
  }

  const rfc4514 = rdns
    .slice()
    .reverse()
    .map((rdn) =>
      rdn
        .map((a) => `${NAME_ATTRS[a.oid]?.ldap ?? a.oid}=${a.isString ? escapeRfc4514(a.value) : a.value}`)
        .join("+"),
    )
    .join(",");
  const openssl = rdns.map((rdn) => "/" + rdn.map((a) => `${a.short}=${escapeOpenSsl(a.value)}`).join("+")).join("");
  const commonNames = rdns.flat().filter((a) => a.oid === "2.5.4.3").map((a) => a.value);
  return { rdns, der: bytesOf(buf, seq), rfc4514: visible(rfc4514).text, openssl, commonNames };
}

/** RFC 5280 7.1 compares names after case folding and whitespace compression; this approximates that. */
function normalizeValue(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export type NameMatch = "exact" | "normalized" | "different";

export function compareNames(a: DistinguishedName, b: DistinguishedName): NameMatch {
  if (bytesEqual(a.der, b.der)) return "exact";
  if (a.rdns.length !== b.rdns.length) return "different";
  for (let i = 0; i < a.rdns.length; i++) {
    const x = a.rdns[i];
    const y = b.rdns[i];
    if (x.length !== y.length) return "different";
    const key = (attr: NameAttribute) => `${attr.oid}=${attr.isString ? normalizeValue(attr.value) : attr.value}`;
    const ys = new Set(y.map(key));
    if (!x.every((attr) => ys.has(key(attr)))) return "different";
  }
  return "normalized";
}

/* ------------------------------------------------------------- algorithms */

export type SignatureFamily = "RSA" | "RSA-PSS" | "ECDSA" | "EdDSA" | "DSA" | "ML-DSA" | "unknown";

export interface AlgorithmInfo {
  oid: string;
  name: string;
  family: SignatureFamily;
  /** SHA-256 and so on, in Web Crypto spelling, or null for EdDSA and unknowns. */
  hash: string | null;
  /** MD2, MD5 or SHA-1, which no longer resist collisions. */
  weak: boolean;
  /** RSASSA-PSS parameters (RFC 4055 section 3.1). */
  pss: { hash: string; mgfHash: string; saltLength: number; trailer: number } | null;
  /** The whole AlgorithmIdentifier, for comparing the inner and outer copies. */
  der: Uint8Array;
}

const SIGNATURE_ALGS: Record<string, { family: SignatureFamily; hash: string | null; weak?: boolean }> = {
  "1.2.840.113549.1.1.2": { family: "RSA", hash: "MD2", weak: true },
  "1.2.840.113549.1.1.4": { family: "RSA", hash: "MD5", weak: true },
  "1.2.840.113549.1.1.5": { family: "RSA", hash: "SHA-1", weak: true },
  "1.2.840.113549.1.1.14": { family: "RSA", hash: "SHA-224" },
  "1.2.840.113549.1.1.11": { family: "RSA", hash: "SHA-256" },
  "1.2.840.113549.1.1.12": { family: "RSA", hash: "SHA-384" },
  "1.2.840.113549.1.1.13": { family: "RSA", hash: "SHA-512" },
  "1.2.840.113549.1.1.10": { family: "RSA-PSS", hash: null },
  "1.2.840.10045.4.1": { family: "ECDSA", hash: "SHA-1", weak: true },
  "1.2.840.10045.4.3.1": { family: "ECDSA", hash: "SHA-224" },
  "1.2.840.10045.4.3.2": { family: "ECDSA", hash: "SHA-256" },
  "1.2.840.10045.4.3.3": { family: "ECDSA", hash: "SHA-384" },
  "1.2.840.10045.4.3.4": { family: "ECDSA", hash: "SHA-512" },
  "1.2.840.10040.4.3": { family: "DSA", hash: "SHA-1", weak: true },
  "2.16.840.1.101.3.4.3.2": { family: "DSA", hash: "SHA-256" },
  "1.3.101.112": { family: "EdDSA", hash: null },
  "1.3.101.113": { family: "EdDSA", hash: null },
  "2.16.840.1.101.3.4.3.17": { family: "ML-DSA", hash: null },
  "2.16.840.1.101.3.4.3.18": { family: "ML-DSA", hash: null },
  "2.16.840.1.101.3.4.3.19": { family: "ML-DSA", hash: null },
};

const HASH_OIDS: Record<string, string> = {
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.4": "SHA-224",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  "1.2.840.113549.2.5": "MD5",
};

function hashFromAlgId(buf: Uint8Array, node: DerNode, what: string): string {
  const seq = expectTag(node, TAG.SEQUENCE, what, node.start);
  const oid = readOid(buf, seq.children[0], what, seq.start);
  return HASH_OIDS[oid] ?? oid;
}

/** RFC 4055 3.1: every field of RSASSA-PSS-params has a default, and the defaults are SHA-1. */
function parsePssParams(buf: Uint8Array, node: DerNode | undefined): AlgorithmInfo["pss"] {
  const pss = { hash: "SHA-1", mgfHash: "SHA-1", saltLength: 20, trailer: 1 };
  if (!node || isUniversal(node, TAG.NULL)) return pss;
  const seq = expectTag(node, TAG.SEQUENCE, "RSASSA-PSS parameters", node.start);
  for (const field of seq.children) {
    if (isContext(field, 0) && field.children[0]) pss.hash = hashFromAlgId(buf, field.children[0], "PSS hash algorithm");
    else if (isContext(field, 1) && field.children[0]) {
      const mgf = expectTag(field.children[0], TAG.SEQUENCE, "PSS mask generation function", field.start);
      const mgfOid = readOid(buf, mgf.children[0], "PSS mask generation function", mgf.start);
      if (mgfOid !== "1.2.840.113549.1.1.8") pss.mgfHash = `unknown MGF ${mgfOid}`;
      else if (mgf.children[1]) pss.mgfHash = hashFromAlgId(buf, mgf.children[1], "MGF1 hash");
    } else if (isContext(field, 2) && field.children[0]) pss.saltLength = readSmallInt(buf, field.children[0], "PSS salt length", field.start);
    else if (isContext(field, 3) && field.children[0]) pss.trailer = readSmallInt(buf, field.children[0], "PSS trailer field", field.start);
  }
  return pss;
}

/** RFC 5280 4.1.1.2: AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters ANY OPTIONAL }. */
export function parseAlgorithm(buf: Uint8Array, node: DerNode | undefined, what: string, at: number): AlgorithmInfo {
  const seq = expectTag(node, TAG.SEQUENCE, what, at);
  const oid = readOid(buf, seq.children[0], what, seq.start);
  const known = SIGNATURE_ALGS[oid];
  const info: AlgorithmInfo = {
    oid,
    name: oidName(oid),
    family: known?.family ?? "unknown",
    hash: known?.hash ?? null,
    weak: known?.weak ?? false,
    pss: null,
    der: bytesOf(buf, seq),
  };
  if (info.family === "RSA-PSS") {
    info.pss = parsePssParams(buf, seq.children[1]);
    info.hash = info.pss?.hash ?? null;
    info.weak = info.hash === "SHA-1" || info.hash === "MD5";
    info.name = `RSASSA-PSS with ${info.hash}`;
  }
  return info;
}

/* ------------------------------------------------------------- public key */

export type KeyType = "RSA" | "RSA-PSS" | "EC" | "Ed25519" | "Ed448" | "X25519" | "X448" | "DSA" | "ML-DSA" | "unknown";

export interface Field {
  label: string;
  value: string;
}

export interface PublicKeyInfo {
  algorithmOid: string;
  algorithmName: string;
  keyType: KeyType;
  /** Key size in bits: modulus length for RSA, curve size for EC. */
  bits: number | null;
  /** "RSA 2048 bit", "ECDSA P-256". */
  summary: string;
  rows: Field[];
  rsa: { bits: number; modulusHex: string; exponent: bigint } | null;
  curve: { oid: string; name: string; webCrypto: "P-256" | "P-384" | "P-521" | null } | null;
  /** The whole SubjectPublicKeyInfo, which is what key pins hash. */
  spki: Uint8Array;
  /** Base64 SHA-256 of the SubjectPublicKeyInfo (RFC 7469 pin format). */
  pinSha256: string;
  issues: string[];
}

const CURVES: Record<string, { bits: number; webCrypto: "P-256" | "P-384" | "P-521" | null }> = {
  "1.2.840.10045.3.1.7": { bits: 256, webCrypto: "P-256" },
  "1.3.132.0.34": { bits: 384, webCrypto: "P-384" },
  "1.3.132.0.35": { bits: 521, webCrypto: "P-521" },
  "1.3.132.0.10": { bits: 256, webCrypto: null },
  "1.2.840.10045.3.1.1": { bits: 192, webCrypto: null },
  "1.3.132.0.33": { bits: 224, webCrypto: null },
  "1.3.36.3.3.2.8.1.1.7": { bits: 256, webCrypto: null },
  "1.3.36.3.3.2.8.1.1.11": { bits: 384, webCrypto: null },
  "1.3.36.3.3.2.8.1.1.13": { bits: 512, webCrypto: null },
};

/** Bit length of an unsigned big-endian magnitude, ignoring leading zero bytes. */
export function bitLength(bytes: Uint8Array): number {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  if (i === bytes.length) return 0;
  return (bytes.length - i - 1) * 8 + (32 - Math.clz32(bytes[i]));
}

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

/** RFC 5280 4.1.2.7: SubjectPublicKeyInfo ::= SEQUENCE { algorithm, subjectPublicKey BIT STRING }. */
export function parsePublicKey(buf: Uint8Array, node: DerNode | undefined, at: number): PublicKeyInfo {
  const seq = expectTag(node, TAG.SEQUENCE, "subject public key info", at);
  const algSeq = expectTag(seq.children[0], TAG.SEQUENCE, "public key algorithm", seq.start);
  const oid = readOid(buf, algSeq.children[0], "public key algorithm", algSeq.start);
  const params = algSeq.children[1];
  const bits = readBitString(buf, seq.children[1], "public key", seq.start);
  const spki = bytesOf(buf, seq);
  const info: PublicKeyInfo = {
    algorithmOid: oid,
    algorithmName: oidName(oid),
    keyType: "unknown",
    bits: null,
    summary: oidName(oid),
    rows: [{ label: "Algorithm", value: oidLabel(oid) }],
    rsa: null,
    curve: null,
    spki,
    pinSha256: toBase64(sha256(spki)),
    issues: [],
  };
  const key = bits.bytes;

  if (oid === "1.2.840.113549.1.1.1" || oid === "1.2.840.113549.1.1.10") {
    // RFC 8017 A.1.1: RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }.
    const keyNode = parseExactly(key, 0, key.length, "RSA public key");
    expectTag(keyNode, TAG.SEQUENCE, "RSA public key", 0);
    const modNode = expectTag(keyNode.children[0], TAG.INTEGER, "RSA modulus", keyNode.start);
    const modulus = contentOf(key, modNode);
    if (modulus[0] & 0x80) info.issues.push("The RSA modulus is encoded as a negative number.");
    const exponent = readInteger(key, keyNode.children[1], "RSA public exponent", keyNode.start);
    const n = bitLength(modulus);
    info.keyType = oid === "1.2.840.113549.1.1.1" ? "RSA" : "RSA-PSS";
    info.bits = n;
    info.summary = `RSA ${n} bit`;
    info.rsa = { bits: n, modulusHex: colonHex(stripLeadingZeros(modulus)), exponent };
    info.rows.push({ label: "Modulus size", value: `${n} bits` });
    info.rows.push({ label: "Public exponent", value: `${exponent} (0x${exponent.toString(16)})` });
    if (exponent < 3n || exponent % 2n === 0n) info.issues.push("The public exponent is even or below 3, so this is not a working RSA key.");
    else if (exponent < 65537n) info.issues.push(`The public exponent is ${exponent}. Small exponents are legal but fragile: they have enabled attacks against implementations with weak padding checks, and 65537 is the standard choice.`);
    if (oid === "1.2.840.113549.1.1.10") info.rows.push({ label: "Restriction", value: "Key restricted to RSASSA-PSS signatures (RFC 4055)" });
  } else if (oid === "1.2.840.10045.2.1") {
    // RFC 5480 2.1.1: the parameters carry the named curve.
    info.keyType = "EC";
    if (isUniversal(params, TAG.OID)) {
      const curveOid = decodeOid(contentOf(buf, params), params.contentStart);
      const curve = CURVES[curveOid];
      const name = oidName(curveOid);
      info.curve = { oid: curveOid, name, webCrypto: curve?.webCrypto ?? null };
      info.bits = curve?.bits ?? null;
      const short = name.split(" ")[0];
      info.summary = `ECDSA ${short}`;
      info.rows.push({ label: "Curve", value: oidLabel(curveOid) });
      if (curve) {
        const size = Math.ceil(curve.bits / 8);
        const form = key[0] === 4 ? "uncompressed" : key[0] === 2 || key[0] === 3 ? "compressed" : "unknown";
        info.rows.push({ label: "Point", value: `${form}, ${key.length} bytes` });
        const expected = form === "uncompressed" ? 1 + 2 * size : 1 + size;
        if (form === "unknown" || key.length !== expected) info.issues.push(`The public point is ${key.length} bytes, which does not fit ${short}.`);
      }
    } else if (isUniversal(params, TAG.SEQUENCE)) {
      info.summary = "ECDSA with explicit curve parameters";
      info.rows.push({ label: "Curve", value: "Explicit parameters" });
      info.issues.push("The curve is spelled out as explicit parameters instead of named. RFC 5480 says CAs must use named curves, and explicit parameters were the basis of CVE-2020-0601, where Windows accepted a forged curve.");
    } else {
      info.summary = "ECDSA with no named curve";
      info.issues.push("The EC key does not name its curve.");
    }
  } else if (oid === "1.3.101.112" || oid === "1.3.101.113" || oid === "1.3.101.110" || oid === "1.3.101.111") {
    // RFC 8410: the key is the raw encoded point, with no parameters.
    const table: Record<string, [KeyType, number, number]> = {
      "1.3.101.112": ["Ed25519", 32, 256],
      "1.3.101.113": ["Ed448", 57, 456],
      "1.3.101.110": ["X25519", 32, 256],
      "1.3.101.111": ["X448", 56, 448],
    };
    const [type, length, size] = table[oid];
    info.keyType = type;
    info.bits = size;
    info.summary = type;
    info.rows.push({ label: "Key", value: `${key.length} bytes${key.length === length ? "" : `, expected ${length}`}` });
    if (key.length !== length) info.issues.push(`An ${type} key is ${length} bytes; this one is ${key.length}.`);
  } else if (oid === "1.2.840.10040.4.1") {
    info.keyType = "DSA";
    if (isUniversal(params, TAG.SEQUENCE) && isUniversal(params.children[0], TAG.INTEGER)) {
      const p = contentOf(buf, params.children[0]);
      info.bits = bitLength(p);
      info.summary = `DSA ${info.bits} bit`;
      info.rows.push({ label: "Prime size", value: `${info.bits} bits` });
    } else info.summary = "DSA";
  } else if (oid.startsWith("2.16.840.1.101.3.4.3.1")) {
    info.keyType = "ML-DSA";
    info.summary = oidName(oid);
    info.rows.push({ label: "Key", value: `${key.length} bytes` });
  }

  info.rows.push({ label: "SPKI SHA-256 pin", value: info.pinSha256 });
  return info;
}

/* -------------------------------------------------------------- IP format */

/** RFC 5952: lowercase, no leading zeros, the longest run of two or more zero groups compressed. */
export function formatIpv6(bytes: Uint8Array): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen && j - i >= 2) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestStart < 0) return hex.join(":");
  return `${hex.slice(0, bestStart).join(":")}::${hex.slice(bestStart + bestLen).join(":")}`;
}

function maskToPrefix(mask: Uint8Array): number | null {
  let prefix = 0;
  let ended = false;
  for (const byte of mask) {
    for (let bit = 7; bit >= 0; bit--) {
      const on = (byte >> bit) & 1;
      if (on && ended) return null;
      if (on) prefix++;
      else ended = true;
    }
  }
  return prefix;
}

/** An iPAddress GeneralName: 4 or 16 bytes, or 8 or 32 (address and mask) inside name constraints. */
export function formatIpBytes(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) return formatIpv6(bytes);
  if (bytes.length === 8 || bytes.length === 32) {
    const half = bytes.length / 2;
    const addr = formatIpBytes(bytes.subarray(0, half));
    const mask = bytes.subarray(half);
    const prefix = maskToPrefix(mask);
    return prefix === null ? `${addr} mask ${formatIpBytes(mask)}` : `${addr}/${prefix}`;
  }
  return `invalid ${bytes.length} byte address ${colonHex(bytes)}`;
}

/* ---------------------------------------------------------- GeneralName */

export type GeneralNameType = "DNS" | "IP" | "email" | "URI" | "DirName" | "otherName" | "RID" | "X400" | "EDIParty" | "unknown";

export interface GeneralName {
  type: GeneralNameType;
  /** Display value, with invisible characters escaped. */
  value: string;
  /** The raw decoded text for DNS, email and URI, for comparisons. */
  raw: string;
  hidden: boolean;
}

/** RFC 5280 4.2.1.6. The module uses IMPLICIT tags, except [4] directoryName, which wraps a CHOICE. */
export function parseGeneralName(buf: Uint8Array, node: DerNode): GeneralName {
  const mk = (type: GeneralNameType, raw: string): GeneralName => {
    const vis = visible(raw);
    return { type, value: vis.text, raw, hidden: vis.hidden };
  };
  if (node.cls !== 2) return mk("unknown", `${describeTag(node)} ${previewHex(contentOf(buf, node))}`);
  switch (node.tag) {
    case 0: {
      const oid = readOid(buf, node.children[0], "otherName type", node.start);
      const wrapped = node.children[1]?.children[0];
      let value = wrapped ? previewHex(bytesOf(buf, wrapped)) : "";
      if (wrapped && isStringNode(wrapped)) value = readString(buf, wrapped).text;
      return mk("otherName", `${oidName(oid)}: ${value}`);
    }
    case 1:
      return mk("email", ia5FromContent(buf, node).text);
    case 2:
      return mk("DNS", ia5FromContent(buf, node).text);
    case 3:
      return mk("X400", previewHex(contentOf(buf, node)));
    case 4:
      return mk("DirName", parseName(buf, node.children[0], "directory name", node.start).rfc4514);
    case 5:
      return mk("EDIParty", previewHex(contentOf(buf, node)));
    case 6:
      return mk("URI", ia5FromContent(buf, node).text);
    case 7:
      return mk("IP", formatIpBytes(contentOf(buf, node)));
    case 8:
      return mk("RID", decodeOid(contentOf(buf, node), node.contentStart));
    default:
      return mk("unknown", `[${node.tag}] ${previewHex(contentOf(buf, node))}`);
  }
}

export function generalNameText(name: GeneralName): string {
  return `${name.type}: ${name.value}`;
}

function parseGeneralNames(buf: Uint8Array, node: DerNode): GeneralName[] {
  return node.children.map((child) => parseGeneralName(buf, child));
}

/* ------------------------------------------------------------ extensions */

export interface ExtensionView {
  oid: string;
  name: string;
  critical: boolean;
  known: boolean;
  rows: Field[];
  error: string | null;
}

export interface ExtensionSet {
  list: ExtensionView[];
  san: GeneralName[] | null;
  keyUsage: string[] | null;
  extKeyUsage: string[] | null;
  basicConstraints: { ca: boolean; pathLen: number | null } | null;
  subjectKeyId: string | null;
  authorityKeyId: string | null;
  /** Names of extensions that appear more than once (RFC 5280 4.2 forbids it). */
  duplicates: string[];
  /** Critical extensions this decoder does not understand. */
  unknownCritical: string[];
  /** True when the precertificate poison extension is present. */
  precertificate: boolean;
  /** Number of embedded signed certificate timestamps, or null. */
  sctCount: number | null;
}

/** RFC 5280 4.2.1.3 bit names, in bit order. */
export const KEY_USAGE_NAMES = [
  "digitalSignature",
  "nonRepudiation (contentCommitment)",
  "keyEncipherment",
  "dataEncipherment",
  "keyAgreement",
  "keyCertSign",
  "cRLSign",
  "encipherOnly",
  "decipherOnly",
];

const REASON_NAMES = [
  "unused",
  "keyCompromise",
  "cACompromise",
  "affiliationChanged",
  "superseded",
  "cessationOfOperation",
  "certificateHold",
  "privilegeWithdrawn",
  "aACompromise",
];

const NETSCAPE_TYPES = ["SSL client", "SSL server", "S/MIME", "Object signing", "Reserved", "SSL CA", "S/MIME CA", "Object signing CA"];

function listBits(bits: BitString, names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < names.length; i++) if (bitIsSet(bits, i)) out.push(names[i]);
  return out;
}

function capRows(rows: Field[], label: string): Field[] {
  if (rows.length <= MAX_LISTED_ENTRIES) return rows;
  return [...rows.slice(0, MAX_LISTED_ENTRIES), { label, value: `${rows.length - MAX_LISTED_ENTRIES} more not listed` }];
}

function seqChildren(buf: Uint8Array, node: DerNode, what: string): DerNode[] {
  return expectTag(node, TAG.SEQUENCE, what, node.start).children;
}

/** RFC 6962 3.3: a TLS-encoded SignedCertificateTimestampList inside an OCTET STRING. */
function parseSctList(bytes: Uint8Array): Field[] {
  const rows: Field[] = [];
  const u16 = (p: number) => (bytes[p] << 8) | bytes[p + 1];
  if (bytes.length < 2) throw new DerError("The SCT list is too short", 0);
  const listLen = u16(0);
  if (listLen + 2 !== bytes.length) throw new DerError("The SCT list length does not match its contents", 0);
  let p = 2;
  let index = 0;
  const hashes: Record<number, string> = { 4: "SHA-256", 5: "SHA-384", 6: "SHA-512" };
  const sigs: Record<number, string> = { 1: "RSA", 3: "ECDSA" };
  while (p < bytes.length) {
    if (p + 2 > bytes.length) throw new DerError("An SCT length is cut off", p);
    const sctLen = u16(p);
    const start = p + 2;
    const end = start + sctLen;
    if (end > bytes.length || sctLen < 47) throw new DerError("An SCT is truncated", p);
    index++;
    const version = bytes[start];
    const logId = bytes.subarray(start + 1, start + 33);
    let ts = 0n;
    for (let i = 0; i < 8; i++) ts = (ts << 8n) | BigInt(bytes[start + 33 + i]);
    const extLen = u16(start + 41);
    const sigAt = start + 43 + extLen;
    const alg = sigAt + 1 < end ? `${sigs[bytes[sigAt + 1]] ?? `sig ${bytes[sigAt + 1]}`} with ${hashes[bytes[sigAt]] ?? `hash ${bytes[sigAt]}`}` : "missing";
    const when = ts < 8_640_000_000_000_000n ? formatUtc(Number(ts)) : `${ts} ms`;
    rows.push({
      label: `SCT ${index}`,
      value: `v${version + 1}, log ${toBase64(logId)}, ${when}, ${alg}`,
    });
    p = end;
  }
  return rows;
}

/** One extension's value, already parsed out of its OCTET STRING. Returns display rows and fills `set`. */
function decodeExtension(buf: Uint8Array, oid: string, value: DerNode, set: ExtensionSet): Field[] {
  switch (oid) {
    case "2.5.29.17":
    case "2.5.29.18": {
      const names = parseGeneralNames(buf, expectTag(value, TAG.SEQUENCE, "GeneralNames", value.start));
      if (oid === "2.5.29.17") set.san = names;
      return capRows(names.map((n) => ({ label: n.type, value: n.value })), "Names");
    }
    case "2.5.29.15": {
      const bits = readBitString(buf, value, "key usage", value.start);
      const names = listBits(bits, KEY_USAGE_NAMES);
      set.keyUsage = names;
      return [{ label: "Usages", value: names.length ? names.join(", ") : "none set" }];
    }
    case "2.5.29.37": {
      const oids = seqChildren(buf, value, "extended key usage").map((n) => readOid(buf, n, "key purpose", value.start));
      set.extKeyUsage = oids;
      return oids.map((o) => ({ label: "Purpose", value: oidLabel(o) }));
    }
    case "2.5.29.19": {
      const kids = seqChildren(buf, value, "basic constraints");
      let ca = false;
      let pathLen: number | null = null;
      for (const kid of kids) {
        if (isUniversal(kid, TAG.BOOLEAN)) ca = readBoolean(buf, kid);
        else if (isUniversal(kid, TAG.INTEGER)) pathLen = readSmallInt(buf, kid, "path length", kid.start);
      }
      set.basicConstraints = { ca, pathLen };
      const rows: Field[] = [{ label: "CA", value: ca ? "TRUE" : "FALSE" }];
      if (ca) rows.push({ label: "Path length", value: pathLen === null ? "no limit" : String(pathLen) });
      else if (pathLen !== null) rows.push({ label: "Path length", value: `${pathLen} (meaningless without CA:TRUE)` });
      return rows;
    }
    case "2.5.29.14": {
      const id = contentOf(buf, expectTag(value, TAG.OCTET_STRING, "subject key identifier", value.start));
      set.subjectKeyId = colonHex(id);
      return [{ label: "Key ID", value: colonHex(id) }];
    }
    case "2.5.29.35": {
      const rows: Field[] = [];
      for (const kid of seqChildren(buf, value, "authority key identifier")) {
        if (isContext(kid, 0)) {
          set.authorityKeyId = colonHex(contentOf(buf, kid));
          rows.push({ label: "Key ID", value: set.authorityKeyId });
        } else if (isContext(kid, 1)) {
          for (const n of parseGeneralNames(buf, kid)) rows.push({ label: "Issuer", value: generalNameText(n) });
        } else if (isContext(kid, 2)) {
          rows.push({ label: "Issuer serial", value: colonHex(stripLeadingZeros(contentOf(buf, kid))) });
        }
      }
      return rows;
    }
    case "2.5.29.31":
    case "2.5.29.46": {
      const rows: Field[] = [];
      seqChildren(buf, value, "CRL distribution points").forEach((dp, i) => {
        const label = `Point ${i + 1}`;
        for (const part of seqChildren(buf, dp, "distribution point")) {
          if (isContext(part, 0)) {
            const choice = part.children[0];
            if (isContext(choice, 0)) parseGeneralNames(buf, choice).forEach((n) => rows.push({ label, value: generalNameText(n) }));
            else if (isContext(choice, 1)) rows.push({ label, value: `Relative to CRL issuer: ${choice.children.length} attribute(s)` });
          } else if (isContext(part, 1)) {
            rows.push({ label: `${label} reasons`, value: listBits(bitStringFromContent(buf, part, "reason flags"), REASON_NAMES).join(", ") || "none" });
          } else if (isContext(part, 2)) {
            parseGeneralNames(buf, part).forEach((n) => rows.push({ label: `${label} CRL issuer`, value: generalNameText(n) }));
          }
        }
      });
      return capRows(rows, "Points");
    }
    case "1.3.6.1.5.5.7.1.1":
    case "1.3.6.1.5.5.7.1.11": {
      return capRows(
        seqChildren(buf, value, "access descriptions").map((ad) => {
          const method = readOid(buf, ad.children[0], "access method", ad.start);
          if (!ad.children[1]) throw new DerError("An access description has no location", ad.start);
          return { label: oidName(method), value: generalNameText(parseGeneralName(buf, ad.children[1])) };
        }),
        "Locations",
      );
    }
    case "2.5.29.32": {
      const rows: Field[] = [];
      for (const pi of seqChildren(buf, value, "certificate policies")) {
        const policy = readOid(buf, pi.children[0], "policy identifier", pi.start);
        rows.push({ label: "Policy", value: oidLabel(policy) });
        const quals = pi.children[1];
        if (!quals) continue;
        for (const q of seqChildren(buf, quals, "policy qualifiers")) {
          const qid = readOid(buf, q.children[0], "policy qualifier", q.start);
          const body = q.children[1];
          if (qid === "1.3.6.1.5.5.7.2.1" && body && isStringNode(body)) {
            rows.push({ label: "CPS", value: visible(readString(buf, body).text).text });
          } else if (qid === "1.3.6.1.5.5.7.2.2" && isUniversal(body, TAG.SEQUENCE)) {
            for (const part of body.children) {
              if (isStringNode(part)) rows.push({ label: "User notice", value: visible(readString(buf, part).text).text });
              else if (isUniversal(part, TAG.SEQUENCE) && part.children[0] && isStringNode(part.children[0])) {
                const org = readString(buf, part.children[0]).text;
                const nums = part.children[1]?.children.map((n) => readInteger(buf, n, "notice number", part.start).toString()) ?? [];
                rows.push({ label: "Notice reference", value: `${visible(org).text}, notice ${nums.join(", ")}` });
              }
            }
          } else rows.push({ label: oidName(qid), value: body ? previewHex(bytesOf(buf, body)) : "" });
        }
      }
      return capRows(rows, "Policies");
    }
    case "2.5.29.30": {
      const rows: Field[] = [];
      for (const subtrees of seqChildren(buf, value, "name constraints")) {
        const label = isContext(subtrees, 0) ? "Permitted" : isContext(subtrees, 1) ? "Excluded" : describeTag(subtrees);
        for (const st of subtrees.children) {
          const base = expectTag(st, TAG.SEQUENCE, "general subtree", st.start).children[0];
          if (!base) throw new DerError("A name constraint subtree is empty", st.start);
          rows.push({ label, value: generalNameText(parseGeneralName(buf, base)) });
        }
      }
      return capRows(rows, "Constraints");
    }
    case "2.5.29.36": {
      return seqChildren(buf, value, "policy constraints").map((kid) => ({
        label: isContext(kid, 0) ? "Require explicit policy" : "Inhibit policy mapping",
        value: `after ${smallIntFromContent(buf, kid, "skip count")} certificate(s)`,
      }));
    }
    case "2.5.29.54":
      return [{ label: "Skip certs", value: String(readSmallInt(buf, value, "inhibit anyPolicy", value.start)) }];
    case "2.5.29.33":
      return seqChildren(buf, value, "policy mappings").map((m) => ({
        label: "Mapping",
        value: `${oidName(readOid(buf, m.children[0], "issuer policy", m.start))} to ${oidName(readOid(buf, m.children[1], "subject policy", m.start))}`,
      }));
    case "1.3.6.1.5.5.7.1.24": {
      const features: Record<string, string> = { "5": "status_request (OCSP Must-Staple)", "17": "status_request_v2" };
      return seqChildren(buf, value, "TLS feature").map((n) => {
        const v = readInteger(buf, n, "TLS feature", value.start).toString();
        return { label: "Feature", value: features[v] ?? v };
      });
    }
    case "1.3.6.1.5.5.7.48.1.5":
      return [{ label: "Meaning", value: "Clients should not check revocation for this OCSP responder certificate" }];
    case "1.3.6.1.4.1.11129.2.4.3":
      set.precertificate = true;
      return [{ label: "Meaning", value: "This is a precertificate (RFC 6962 section 3.1), logged to obtain timestamps. It is not valid for use" }];
    case "1.3.6.1.4.1.11129.2.4.2": {
      const inner = contentOf(buf, expectTag(value, TAG.OCTET_STRING, "SCT list", value.start));
      const rows = parseSctList(inner);
      set.sctCount = rows.length;
      return capRows(rows, "Timestamps");
    }
    case "2.16.840.1.113730.1.1":
      return [{ label: "Types", value: listBits(readBitString(buf, value, "Netscape type", value.start), NETSCAPE_TYPES).join(", ") || "none" }];
    case "2.16.840.1.113730.1.13":
    case "1.3.6.1.4.1.311.20.2":
      return [{ label: "Value", value: visible(readString(buf, value).text).text }];
    case "1.3.6.1.4.1.311.21.7": {
      const kids = seqChildren(buf, value, "certificate template");
      const rows: Field[] = [{ label: "Template", value: readOid(buf, kids[0], "template id", value.start) }];
      if (kids[1]) rows.push({ label: "Version", value: `${readInteger(buf, kids[1], "major version", value.start)}${kids[2] ? `.${readInteger(buf, kids[2], "minor version", value.start)}` : ""}` });
      return rows;
    }
    default:
      return [{ label: "Value", value: previewHex(bytesOf(buf, value)) }];
  }
}

const DECODED_EXTENSIONS = new Set([
  "2.5.29.17", "2.5.29.18", "2.5.29.15", "2.5.29.37", "2.5.29.19", "2.5.29.14", "2.5.29.35", "2.5.29.31", "2.5.29.46",
  "1.3.6.1.5.5.7.1.1", "1.3.6.1.5.5.7.1.11", "2.5.29.32", "2.5.29.30", "2.5.29.36", "2.5.29.54", "2.5.29.33",
  "1.3.6.1.5.5.7.1.24", "1.3.6.1.5.5.7.48.1.5", "1.3.6.1.4.1.11129.2.4.3", "1.3.6.1.4.1.11129.2.4.2",
  "2.16.840.1.113730.1.1", "2.16.840.1.113730.1.13", "1.3.6.1.4.1.311.20.2", "1.3.6.1.4.1.311.21.7",
]);

export function emptyExtensionSet(): ExtensionSet {
  return {
    list: [],
    san: null,
    keyUsage: null,
    extKeyUsage: null,
    basicConstraints: null,
    subjectKeyId: null,
    authorityKeyId: null,
    duplicates: [],
    unknownCritical: [],
    precertificate: false,
    sctCount: null,
  };
}

/**
 * RFC 5280 4.1: Extensions ::= SEQUENCE OF Extension, where
 * Extension ::= SEQUENCE { extnID OID, critical BOOLEAN DEFAULT FALSE, extnValue OCTET STRING }.
 * A malformed extension gets its own error row; the rest still decode.
 */
export function parseExtensions(buf: Uint8Array, node: DerNode): ExtensionSet {
  const set = emptyExtensionSet();
  const seen = new Set<string>();
  for (const ext of expectTag(node, TAG.SEQUENCE, "extensions", node.start).children) {
    let oid = "unknown";
    let critical = false;
    try {
      expectTag(ext, TAG.SEQUENCE, "extension", ext.start);
      oid = readOid(buf, ext.children[0], "extension id", ext.start);
      let i = 1;
      if (isUniversal(ext.children[1], TAG.BOOLEAN)) {
        critical = readBoolean(buf, ext.children[1]);
        i = 2;
      }
      const octets = expectTag(ext.children[i], TAG.OCTET_STRING, "extension value", ext.start);
      if (seen.has(oid)) set.duplicates.push(oidName(oid));
      seen.add(oid);
      const known = DECODED_EXTENSIONS.has(oid);
      if (critical && !known) set.unknownCritical.push(oidLabel(oid));
      const inner = parseExactly(buf, octets.contentStart, octets.end, `${oidName(oid)} value`);
      const rows = decodeExtension(buf, oid, inner, set);
      set.list.push({ oid, name: oidName(oid), critical, known, rows, error: null });
    } catch (err) {
      set.list.push({ oid, name: oidName(oid), critical, known: false, rows: [], error: errorText(err) });
    }
  }
  return set;
}

/* -------------------------------------------------- signature verification */

export type VerifyStatus = "valid" | "invalid" | "unsupported" | "error";

export interface VerifyResult {
  status: VerifyStatus;
  detail: string;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.length);
  new Uint8Array(out).set(bytes);
  return out;
}

/** RFC 3279 2.2.3: Ecdsa-Sig-Value ::= SEQUENCE { r INTEGER, s INTEGER }. Web Crypto wants r || s. */
export function ecdsaDerToRaw(sig: Uint8Array, size: number): Uint8Array | null {
  try {
    const seq = parseExactly(sig, 0, sig.length, "ECDSA signature");
    if (!isUniversal(seq, TAG.SEQUENCE) || seq.children.length !== 2) return null;
    const out = new Uint8Array(size * 2);
    for (let k = 0; k < 2; k++) {
      const n = seq.children[k];
      if (!isUniversal(n, TAG.INTEGER)) return null;
      const v = stripLeadingZeros(contentOf(sig, n));
      if (v.length > size) return null;
      out.set(v, k * size + (size - v.length));
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Checks `signature` over `signed` with the key in `key`, through Web
 * Crypto. Covers RSA PKCS#1 v1.5, RSASSA-PSS, ECDSA on P-256, P-384 and
 * P-521, and Ed25519 where the browser supports it. Anything else, MD5 and
 * MD2 included, comes back as unsupported rather than as a verdict.
 */
export async function verifySignature(
  alg: AlgorithmInfo,
  key: PublicKeyInfo,
  signed: Uint8Array,
  signature: Uint8Array,
): Promise<VerifyResult> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return { status: "unsupported", detail: "This browser exposes no Web Crypto API here, which needs a secure (https) page." };
  const webHashes = new Set(["SHA-1", "SHA-256", "SHA-384", "SHA-512"]);
  const data = toArrayBuffer(signed);
  try {
    if (alg.family === "RSA" || alg.family === "RSA-PSS") {
      if (key.keyType !== "RSA") return { status: "invalid", detail: `An RSA signature cannot come from a ${key.summary} key.` };
      if (!alg.hash || !webHashes.has(alg.hash)) return { status: "unsupported", detail: `Web Crypto cannot check RSA with ${alg.hash ?? "this hash"}.` };
      if (alg.family === "RSA") {
        const k = await subtle.importKey("spki", toArrayBuffer(key.spki), { name: "RSASSA-PKCS1-v1_5", hash: alg.hash }, false, ["verify"]);
        const ok = await subtle.verify("RSASSA-PKCS1-v1_5", k, toArrayBuffer(signature), data);
        return ok ? { status: "valid", detail: "The RSA signature verifies." } : { status: "invalid", detail: "The RSA signature does not verify with this key." };
      }
      const pss = alg.pss;
      if (!pss || pss.mgfHash !== pss.hash || pss.trailer !== 1) {
        return { status: "unsupported", detail: "These PSS parameters (a different MGF1 hash or trailer) are outside what Web Crypto supports." };
      }
      const k = await subtle.importKey("spki", toArrayBuffer(key.spki), { name: "RSA-PSS", hash: pss.hash }, false, ["verify"]);
      const ok = await subtle.verify({ name: "RSA-PSS", saltLength: pss.saltLength }, k, toArrayBuffer(signature), data);
      return ok ? { status: "valid", detail: "The RSA-PSS signature verifies." } : { status: "invalid", detail: "The RSA-PSS signature does not verify with this key." };
    }
    if (alg.family === "ECDSA") {
      if (key.keyType !== "EC") return { status: "invalid", detail: `An ECDSA signature cannot come from a ${key.summary} key.` };
      const curve = key.curve?.webCrypto;
      if (!curve) return { status: "unsupported", detail: `Web Crypto supports P-256, P-384 and P-521, not ${key.curve?.name ?? "this curve"}.` };
      if (!alg.hash || !webHashes.has(alg.hash)) return { status: "unsupported", detail: `Web Crypto cannot check ECDSA with ${alg.hash ?? "this hash"}.` };
      const size = Math.ceil((key.bits ?? 0) / 8);
      const raw = ecdsaDerToRaw(signature, size);
      if (!raw) return { status: "invalid", detail: "The ECDSA signature is not a well formed (r, s) pair for this curve." };
      const k = await subtle.importKey("spki", toArrayBuffer(key.spki), { name: "ECDSA", namedCurve: curve }, false, ["verify"]);
      const ok = await subtle.verify({ name: "ECDSA", hash: alg.hash }, k, toArrayBuffer(raw), data);
      return ok ? { status: "valid", detail: "The ECDSA signature verifies." } : { status: "invalid", detail: "The ECDSA signature does not verify with this key." };
    }
    if (alg.family === "EdDSA" && alg.oid === "1.3.101.112") {
      if (key.keyType !== "Ed25519") return { status: "invalid", detail: `An Ed25519 signature cannot come from a ${key.summary} key.` };
      let k: CryptoKey;
      try {
        k = await subtle.importKey("spki", toArrayBuffer(key.spki), { name: "Ed25519" }, false, ["verify"]);
      } catch {
        return { status: "unsupported", detail: "This browser's Web Crypto does not support Ed25519 yet." };
      }
      const ok = await subtle.verify({ name: "Ed25519" }, k, toArrayBuffer(signature), data);
      return ok ? { status: "valid", detail: "The Ed25519 signature verifies." } : { status: "invalid", detail: "The Ed25519 signature does not verify with this key." };
    }
    return { status: "unsupported", detail: `Web Crypto cannot check ${alg.name} signatures.` };
  } catch {
    return { status: "error", detail: "The browser refused to import the key or run the check, so no verdict was reached." };
  }
}

/* --------------------------------------------------------------- sniffing */

export type DerKind = "certificate" | "csr" | "pkcs7" | "unknown";

/**
 * Guesses what a DER object is from its shape alone, so each decoder can
 * point a reader at the right tool. A TBSCertificate has at least six
 * fields; a CertificationRequestInfo has exactly four, ending in [0].
 */
export function sniffDer(der: Uint8Array): DerKind {
  try {
    const root = parseDer(der, 0, der.length);
    if (!isUniversal(root, TAG.SEQUENCE)) return "unknown";
    const [first, second] = root.children;
    if (isUniversal(first, TAG.OID) && isContext(second, 0)) return pkcs7Certificates(der) ? "pkcs7" : "unknown";
    if (root.children.length !== 3 || !isUniversal(first, TAG.SEQUENCE)) return "unknown";
    const fields = first.children;
    if (fields.length === 4 && isUniversal(fields[0], TAG.INTEGER) && isContext(fields[3], 0)) return "csr";
    if (fields.length >= 6) return "certificate";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** RFC 7468 PEM armor with 64 character lines. */
export function toPem(der: Uint8Array, label: string): string {
  const lines = toBase64(der).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}
