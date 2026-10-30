/**
 * UUID generation and decoding, from RFC 9562 (which obsoletes RFC 4122).
 *
 * Pure functions, no React or DOM. Randomness is passed in as a function
 * that fills a byte array, so the page hands in crypto.getRandomValues and
 * the tests hand in something deterministic.
 *
 * Bit numbering follows the RFC's own field tables: bit 0 is the most
 * significant bit of octet 0 and bit 127 the least significant bit of
 * octet 15. The 128 bits are held as one BigInt so a field at any offset is
 * a shift and a mask, with no 32-bit truncation anywhere.
 */

import { md5Hex } from "./file-hash-checker";

/* --------------------------------------------------------------- constants */

/**
 * 100-nanosecond intervals between the Gregorian epoch of RFC 9562 section
 * 5.1 (1582-10-15T00:00:00Z) and the Unix epoch: 141,427 days.
 */
export const GREGORIAN_OFFSET = 122_192_928_000_000_000n;

/** Largest count a batch will generate. */
export const MAX_BATCH = 1000;
/** Most lines the decoder reads in one go. */
export const MAX_DECODE_LINES = 200;
/** Name-based input cap, in UTF-8 bytes. */
export const MAX_NAME_BYTES = 65_536;

const MASK_128 = (1n << 128n) - 1n;
const MAX_UNIX_MS_48 = (1 << 24) * (1 << 24) - 1; // 2^48 - 1, exact in a double

/** RFC 9562 section 6.6, the four predefined namespace IDs. */
export const NAMESPACES: { key: string; label: string; uuid: string }[] = [
  { key: "dns", label: "DNS", uuid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
  { key: "url", label: "URL", uuid: "6ba7b811-9dad-11d1-80b4-00c04fd430c8" },
  { key: "oid", label: "OID", uuid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8" },
  { key: "x500", label: "X.500 DN", uuid: "6ba7b814-9dad-11d1-80b4-00c04fd430c8" },
];

/* ----------------------------------------------------------------- helpers */

const HEX = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 0x0f];
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

/** Floor division for BigInt, which truncates toward zero on its own. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

/** Sets the version nibble (bits 48-51) and the RFC variant 0b10 (bits 64-65). */
function stamp(bytes: Uint8Array, version: number): Uint8Array {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/* ------------------------------------------------------------------ format */

export type LetterCase = "lower" | "upper";
export type Layout = "hyphens" | "plain" | "braces" | "urn";

export function canonical(hex32: string): string {
  const h = hex32.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * RFC 9562 section 4 says to emit lowercase and accept either case. Braces
 * are the Microsoft registry style; urn:uuid: is the URN namespace from the
 * same section. The prefix stays lowercase in every case.
 */
export function formatUuid(hex32: string, letterCase: LetterCase, layout: Layout): string {
  let body = layout === "plain" ? hex32.toLowerCase() : canonical(hex32);
  if (letterCase === "upper") body = body.toUpperCase();
  if (layout === "braces") return `{${body}}`;
  if (layout === "urn") return `urn:uuid:${body}`;
  return body;
}

/* -------------------------------------------------------------- generation */

export type Fill = (bytes: Uint8Array) => void;

/** RFC 9562 section 5.4: 122 random bits, version 4, variant 10. */
export function uuidV4(fill: Fill): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  return bytesToHex(stamp(bytes, 4));
}

/** Monotonic state carried between v7 calls. */
export interface V7State {
  /** Millisecond timestamp of the last UUID issued. */
  ms: number;
  /** The 74 bits of rand_a and rand_b of the last UUID, as one counter. */
  rand: bigint;
}

const RAND_74 = (1n << 74n) - 1n;

function random74(fill: Fill): bigint {
  const b = new Uint8Array(10); // 80 bits, top 6 discarded
  fill(b);
  return bytesToBigInt(b) & RAND_74;
}

/**
 * RFC 9562 section 5.7 layout: 48-bit unix_ts_ms, version 7, 12-bit rand_a,
 * variant 10, 62-bit rand_b.
 *
 * Ordering within one millisecond uses section 6.2 method 2 ("monotonic
 * random"): the 74 random bits act as a randomly seeded counter that grows
 * by a random step of 1 to 2^32 for each UUID in the same tick. If the clock
 * steps backward, the last timestamp is kept so the sequence still sorts.
 * On counter overflow the timestamp is advanced by one millisecond and the
 * counter reseeded, which the section allows.
 */
export function uuidV7(
  nowMs: number,
  fill: Fill,
  state: V7State | null,
): { ok: true; hex: string; state: V7State } | { ok: false; error: string } {
  if (!Number.isFinite(nowMs) || nowMs < 0 || nowMs > MAX_UNIX_MS_48) {
    return { ok: false, error: "The clock reads outside the 48-bit millisecond range a UUIDv7 can hold (1970 to 10889)." };
  }
  let ms = Math.floor(nowMs);
  let rand: bigint;
  if (state === null || ms > state.ms) {
    rand = random74(fill);
  } else {
    ms = state.ms;
    const step = new Uint8Array(4);
    fill(step);
    rand = state.rand + BigInt(new DataView(step.buffer).getUint32(0)) + 1n;
    if (rand > RAND_74) {
      ms += 1;
      if (ms > MAX_UNIX_MS_48) return { ok: false, error: "The 48-bit timestamp is exhausted." };
      rand = random74(fill);
    }
  }
  const randA = (rand >> 62n) & 0xfffn;
  const randB = rand & ((1n << 62n) - 1n);
  const value =
    (BigInt(ms) << 80n) | (7n << 76n) | (randA << 64n) | (0b10n << 62n) | randB;
  return { ok: true, hex: value.toString(16).padStart(32, "0"), state: { ms, rand } };
}

/** Generates `count` UUIDs of version 4 or 7, capped at MAX_BATCH. */
export function generateBatch(
  version: 4 | 7,
  count: number,
  nowMs: number,
  fill: Fill,
  state: V7State | null,
): { ok: true; list: string[]; state: V7State | null } | { ok: false; error: string } {
  const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(count)));
  const list: string[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    if (version === 4) {
      list.push(uuidV4(fill));
    } else {
      const r = uuidV7(nowMs, fill, s);
      if (!r.ok) return r;
      list.push(r.hex);
      s = r.state;
    }
  }
  return { ok: true, list, state: s };
}

/**
 * SHA-1 from FIPS 180-4 section 6.1. Implemented here so name-based UUIDs
 * are synchronous; Web Crypto's digest is async only.
 */
export function sha1(data: Uint8Array): Uint8Array {
  const len = data.length;
  const total = (((len + 9) + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = BigInt(len) * 8n;
  view.setUint32(total - 8, Number(bits >> 32n));
  view.setUint32(total - 4, Number(bits & 0xffffffffn));

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

/**
 * RFC 9562 sections 5.3 (MD5, version 3) and 5.5 (SHA-1, version 5): hash
 * the namespace ID's 16 bytes followed by the name, keep the first 128 bits,
 * then overwrite the version and variant.
 */
export function uuidNameBased(
  version: 3 | 5,
  namespaceHex32: string,
  name: string,
): { ok: true; hex: string } | { ok: false; error: string } {
  const nameBytes = utf8(name);
  if (nameBytes.length > MAX_NAME_BYTES) {
    return { ok: false, error: `The name is ${nameBytes.length.toLocaleString("en-US")} bytes. The limit here is ${MAX_NAME_BYTES.toLocaleString("en-US")}.` };
  }
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(hexToBytes(namespaceHex32), 0);
  input.set(nameBytes, 16);
  const digest = version === 3 ? hexToBytes(md5Hex(input)) : sha1(input);
  return { ok: true, hex: bytesToHex(stamp(digest.slice(0, 16), version)) };
}

/* ----------------------------------------------------------------- parsing */

export type ParseResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; hex: string };

/** Swaps the first three fields between big-endian text order and the
 * little-endian order Windows uses when a GUID struct is stored as bytes. */
export function swapGuidOrder(hex32: string): string {
  const b = hex32.match(/../g) ?? [];
  const order = [3, 2, 1, 0, 5, 4, 7, 6, 8, 9, 10, 11, 12, 13, 14, 15];
  return order.map((i) => b[i]).join("");
}

function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (ch === " ") return "A space";
  if (cp < 0x20 || cp === 0x7f) return `Control character U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  return `"${ch}"`;
}

/**
 * Accepts the 36-character hyphenated form, 32 bare hex digits, either case,
 * wrapped in braces, quotes or a urn:uuid: prefix. With `guidBytes`, the 32
 * digits are taken as raw bytes in Windows GUID struct order and the first
 * three fields are byte-swapped before decoding.
 */
export function parseUuid(raw: string, guidBytes = false): ParseResult {
  let s = raw.trim();
  if (s === "") return { kind: "empty" };
  if (s.length > 100) {
    return { kind: "error", message: `That is ${s.length} characters. A UUID is 36, so anything over 100 is not one.` };
  }
  s = s.replace(/^["'`]|["'`,;]+$/g, "").trim();
  s = s.replace(/^urn:uuid:/i, "");
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1);
  else if (s.startsWith("{") || s.endsWith("}")) {
    return { kind: "error", message: "An opening or closing brace is missing." };
  }

  const bad = s.match(/[^0-9a-fA-F-]/);
  if (bad) {
    const at = s.indexOf(bad[0]) + 1;
    return {
      kind: "error",
      message: `${describeChar(bad[0])} at position ${at} is not a hex digit. A UUID uses 0 to 9 and a to f only.`,
    };
  }

  const digits = s.replace(/-/g, "");
  if (s.includes("-")) {
    if (s.length !== 36 || s[8] !== "-" || s[13] !== "-" || s[18] !== "-" || s[23] !== "-") {
      return {
        kind: "error",
        message: `Hyphens go after hex digits 8, 12, 16 and 20 (groups of 8-4-4-4-12). This has groups of ${s.split("-").map((g) => g.length).join("-")}.`,
      };
    }
  } else if (digits.length !== 32) {
    return {
      kind: "error",
      message: `That is ${digits.length} hex ${digits.length === 1 ? "digit" : "digits"}. A UUID is exactly 32 (128 bits).`,
    };
  }
  const hex = digits.toLowerCase();
  return { kind: "ok", hex: guidBytes ? swapGuidOrder(hex) : hex };
}

/* ---------------------------------------------------------------- decoding */

export type Variant = "ncs" | "rfc" | "microsoft" | "future";

export const VARIANT_INFO: Record<Variant, { label: string; bits: string }> = {
  ncs: { label: "NCS (reserved, Apollo Network Computing System)", bits: "0xxx" },
  rfc: { label: "RFC 9562 (the OSF DCE variant)", bits: "10xx" },
  microsoft: { label: "Microsoft (reserved, legacy COM GUIDs)", bits: "110x" },
  future: { label: "Reserved for future definition", bits: "111x" },
};

export const VERSION_NAMES: Record<number, string> = {
  1: "Gregorian time and node",
  2: "DCE Security",
  3: "Name-based, MD5",
  4: "Random",
  5: "Name-based, SHA-1",
  6: "Reordered Gregorian time",
  7: "Unix epoch time",
  8: "Custom (vendor-defined)",
};

export type Tone = "ok" | "info" | "warn" | "danger";
export interface Finding {
  tone: Tone;
  text: string;
}

export interface Field {
  /** Name as the RFC's field table spells it. */
  name: string;
  /** First and last bit, inclusive, numbered from 0 at the most significant end. */
  start: number;
  end: number;
  /** Value as hex, zero-padded to the field width. */
  hex: string;
  /** Which color group this field is drawn in. */
  group: "time" | "version" | "variant" | "clock" | "node" | "random" | "hash" | "custom" | "id";
  /** One line on what the field holds. */
  note: string;
}

export interface NodeInfo {
  mac: string;
  /** Individual/group bit: set means multicast, which no NIC address has. */
  multicast: boolean;
  /** Universal/local bit: set means locally administered. */
  local: boolean;
  oui: string;
}

export interface TimeInfo {
  kind: "gregorian" | "unix-ms" | "dce";
  /** Milliseconds since the Unix epoch, floored. */
  unixMs: bigint;
  /** ISO 8601 in UTC, to the resolution the version carries. */
  iso: string;
  /** The raw count, for display. */
  raw: bigint;
  rawLabel: string;
  resolution: string;
  /** False when the instant is outside what a JS Date can show. */
  displayable: boolean;
}

export interface Decoded {
  hex: string;
  canonical: string;
  value: bigint;
  version: number;
  variant: Variant;
  special: "nil" | "max" | null;
  versionLabel: string;
  sortsByTime: boolean | null;
  fields: Field[];
  time: TimeInfo | null;
  clockSeq: number | null;
  node: NodeInfo | null;
  dce: { domain: number; domainName: string; localId: number } | null;
  findings: Finding[];
}

function bits(value: bigint, start: number, end: number): bigint {
  const width = end - start + 1;
  return (value >> BigInt(127 - end)) & ((1n << BigInt(width)) - 1n);
}

function field(value: bigint, name: string, start: number, end: number, group: Field["group"], note: string): Field {
  const width = end - start + 1;
  return { name, start, end, group, note, hex: bits(value, start, end).toString(16).padStart(Math.ceil(width / 4), "0") };
}

/** ISO 8601 for a count of 100 ns ticks since the Unix epoch, 7 fractional digits. */
export function isoFrom100ns(ticks: bigint): { iso: string; unixMs: bigint; displayable: boolean } {
  const ms = floorDiv(ticks, 10_000n);
  const sub = ticks - ms * 10_000n;
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return { iso: "outside the representable date range", unixMs: ms, displayable: false };
  return { iso: d.toISOString().replace(/Z$/, `${sub.toString().padStart(4, "0")}Z`), unixMs: ms, displayable: true };
}

export function isoFromMs(ms: bigint): { iso: string; displayable: boolean } {
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return { iso: "outside the representable date range", displayable: false };
  return { iso: d.toISOString(), displayable: true };
}

function nodeInfo(value: bigint): NodeInfo {
  const n = bits(value, 80, 127);
  const bytes = n.toString(16).padStart(12, "0").match(/../g) ?? [];
  const first = Number((n >> 40n) & 0xffn);
  return {
    mac: bytes.join(":"),
    multicast: (first & 0x01) !== 0,
    local: (first & 0x02) !== 0,
    oui: bytes.slice(0, 3).join(":").toUpperCase(),
  };
}

function gregorianTime(ticks: bigint): TimeInfo {
  const t = isoFrom100ns(ticks - GREGORIAN_OFFSET);
  return {
    kind: "gregorian",
    unixMs: t.unixMs,
    iso: t.iso,
    raw: ticks,
    rawLabel: "100 ns intervals since 1582-10-15",
    resolution: "100 nanoseconds",
    displayable: t.displayable,
  };
}

function nodeFindings(node: NodeInfo, findings: Finding[]): void {
  if (node.multicast) {
    findings.push({
      tone: "ok",
      text: "The node's multicast bit is set, which no network card address has. Per RFC 9562 section 6.10 that marks a random node ID, so it does not identify hardware.",
    });
  } else if (node.local) {
    findings.push({
      tone: "warn",
      text: `The node ${node.mac} is a unicast, locally administered address: assigned by software, a hypervisor or MAC randomization rather than burned in. It is still usually stable per host, so it links every UUID this machine made.`,
    });
  } else {
    findings.push({
      tone: "danger",
      text: `The node ${node.mac} is a universally administered unicast MAC address, the kind burned into a network card. Its first three octets, ${node.oui}, are the manufacturer's OUI, and the whole value ties this UUID to one physical machine.`,
    });
  }
}

function timeFindings(time: TimeInfo, nowMs: number, findings: Finding[]): void {
  if (!time.displayable) return;
  const dayMs = 86_400_000n;
  if (time.unixMs > BigInt(Math.floor(nowMs)) + dayMs) {
    findings.push({
      tone: "warn",
      text: "The timestamp is more than a day in the future. Either the generating clock was wrong, the value was made up, or the bits were never a timestamp.",
    });
  }
}

/**
 * Decodes the 32 hex digits from parseUuid. Field layouts are the tables in
 * RFC 9562 section 5; version 2 follows DCE 1.1 Authentication and Security
 * Services, which RFC 9562 section 5.2 defers to.
 */
export function decodeUuid(hex: string, nowMs: number): Decoded {
  const value = BigInt(`0x${hex}`) & MASK_128;
  const version = Number(bits(value, 48, 51));
  const varBits = Number(bits(value, 64, 67));
  const variant: Variant =
    (varBits & 0b1000) === 0 ? "ncs" : (varBits & 0b0100) === 0 ? "rfc" : (varBits & 0b0010) === 0 ? "microsoft" : "future";

  const out: Decoded = {
    hex,
    canonical: canonical(hex),
    value,
    version,
    variant,
    special: null,
    versionLabel: "",
    sortsByTime: null,
    fields: [],
    time: null,
    clockSeq: null,
    node: null,
    dce: null,
    findings: [],
  };
  const f = out.findings;

  if (value === 0n) {
    out.special = "nil";
    out.versionLabel = "Nil UUID (RFC 9562 section 5.9)";
    out.fields = [field(value, "all bits zero", 0, 127, "custom", "Every bit is 0")];
    f.push({ tone: "info", text: "The Nil UUID, all 128 bits zero. It means no value, the way NULL does, and should never identify a real thing." });
    return out;
  }
  if (value === MASK_128) {
    out.special = "max";
    out.versionLabel = "Max UUID (RFC 9562 section 5.10)";
    out.fields = [field(value, "all bits one", 0, 127, "custom", "Every bit is 1")];
    f.push({ tone: "info", text: "The Max UUID, all 128 bits one. RFC 9562 defines it as a sentinel, for example the upper bound of a range." });
    return out;
  }

  if (variant !== "rfc") {
    out.versionLabel = "Not defined for this variant";
    out.fields = [field(value, "undefined layout", 0, 127, "custom", "No layout is defined outside the RFC variant")];
    const variantNote: Record<Exclude<Variant, "rfc">, string> = {
      ncs: "The top bit of octet 8 is 0, the NCS variant from 1980s Apollo systems. Real NCS UUIDs are rare today; a random 128-bit value lands here half the time, so this is more often a hash or token that is not a UUID at all.",
      microsoft: "Octet 8 starts with 110, the variant reserved for backward compatibility with old Microsoft COM GUIDs. Modern Windows GUIDs are almost always the RFC variant, version 4.",
      future: "Octet 8 starts with 111, reserved for future definition. Nothing should produce this apart from the Max UUID.",
    };
    f.push({ tone: "warn", text: `${variantNote[variant as Exclude<Variant, "rfc">]} The version nibble is only meaningful in the RFC variant, so it is not interpreted.` });
    return out;
  }

  out.versionLabel = VERSION_NAMES[version] ?? "Unassigned";
  const varField = field(value, "var", 64, 65, "variant", "Variant: binary 10 marks the RFC 9562 layout");
  const verField = field(value, "ver", 48, 51, "version", "Version number");

  switch (version) {
    case 1: {
      const ticks = (bits(value, 52, 63) << 48n) | (bits(value, 32, 47) << 32n) | bits(value, 0, 31);
      out.fields = [
        field(value, "time_low", 0, 31, "time", "Low 32 bits of the 60-bit timestamp"),
        field(value, "time_mid", 32, 47, "time", "Middle 16 bits of the timestamp"),
        verField,
        field(value, "time_high", 52, 63, "time", "High 12 bits of the timestamp"),
        varField,
        field(value, "clock_seq", 66, 79, "clock", "Clock sequence: changed when the clock steps back or the node changes"),
        field(value, "node", 80, 127, "node", "Node: a MAC address, or 48 random bits with the multicast bit set"),
      ];
      out.time = gregorianTime(ticks);
      out.clockSeq = Number(bits(value, 66, 79));
      out.node = nodeInfo(value);
      out.sortsByTime = false;
      if (ticks === 0n) f.push({ tone: "warn", text: "The timestamp is zero, which is the Gregorian epoch itself, so the generator did not read a real clock." });
      timeFindings(out.time, nowMs, f);
      nodeFindings(out.node, f);
      f.push({ tone: "info", text: "Version 1 puts the low 32 bits of the time first, so these UUIDs do not sort by creation time as text. Version 6 is the same data reordered so they do." });
      break;
    }
    case 6: {
      const ticks = (bits(value, 0, 31) << 28n) | (bits(value, 32, 47) << 12n) | bits(value, 52, 63);
      out.fields = [
        field(value, "time_high", 0, 31, "time", "High 32 bits of the 60-bit timestamp"),
        field(value, "time_mid", 32, 47, "time", "Middle 16 bits of the timestamp"),
        verField,
        field(value, "time_low", 52, 63, "time", "Low 12 bits of the timestamp"),
        varField,
        field(value, "clock_seq", 66, 79, "clock", "Clock sequence, as in version 1"),
        field(value, "node", 80, 127, "node", "Node, as in version 1; RFC 9562 prefers random bits here"),
      ];
      out.time = gregorianTime(ticks);
      out.clockSeq = Number(bits(value, 66, 79));
      out.node = nodeInfo(value);
      out.sortsByTime = true;
      timeFindings(out.time, nowMs, f);
      nodeFindings(out.node, f);
      break;
    }
    case 7: {
      const ms = bits(value, 0, 47);
      const t = isoFromMs(ms);
      out.fields = [
        field(value, "unix_ts_ms", 0, 47, "time", "Milliseconds since 1970-01-01 UTC, big-endian"),
        verField,
        field(value, "rand_a", 52, 63, "random", "Random, or a counter or extra clock precision"),
        varField,
        field(value, "rand_b", 66, 127, "random", "Random, or partly a counter"),
      ];
      out.time = {
        kind: "unix-ms",
        unixMs: ms,
        iso: t.iso,
        raw: ms,
        rawLabel: "milliseconds since 1970-01-01",
        resolution: "1 millisecond",
        displayable: t.displayable,
      };
      out.sortsByTime = true;
      if (ms === 0n) f.push({ tone: "warn", text: "The timestamp is zero, 1970-01-01, so the generator did not read a real clock." });
      timeFindings(out.time, nowMs, f);
      f.push({ tone: "info", text: "The remaining 74 bits are random, or partly a counter or extra clock precision (RFC 9562 section 6.2). Nothing identifies the machine that made it." });
      break;
    }
    case 2: {
      // DCE 1.1: time_low is replaced by a local identifier (POSIX UID or
      // GID), and clock_seq_low by the local domain. Only the top 28 bits of
      // the 60-bit timestamp survive, so the time is known to a window of
      // 2^32 ticks, about 429.5 seconds.
      const highTicks = (bits(value, 52, 63) << 48n) | (bits(value, 32, 47) << 32n);
      const localId = Number(bits(value, 0, 31));
      const domain = Number(bits(value, 72, 79));
      const domainNames: Record<number, string> = { 0: "person (POSIX UID)", 1: "group (POSIX GID)", 2: "organization" };
      out.fields = [
        field(value, "local_id", 0, 31, "id", "POSIX UID or GID, in place of time_low"),
        field(value, "time_mid", 32, 47, "time", "Middle 16 bits of the timestamp"),
        verField,
        field(value, "time_high", 52, 63, "time", "High 12 bits of the timestamp"),
        varField,
        field(value, "clock_seq_high", 66, 71, "clock", "6-bit clock sequence"),
        field(value, "local_domain", 72, 79, "id", "Domain: 0 person, 1 group, 2 organization"),
        field(value, "node", 80, 127, "node", "Node, as in version 1"),
      ];
      const t = gregorianTime(highTicks);
      out.time = { ...t, kind: "dce", resolution: "about 7 minutes (the low 32 bits of the time are replaced)" };
      out.clockSeq = Number(bits(value, 66, 71));
      out.node = nodeInfo(value);
      out.dce = { domain, domainName: domainNames[domain] ?? "unassigned", localId };
      out.sortsByTime = false;
      f.push({ tone: "info", text: `DCE Security UUID. The first 32 bits are local identifier ${localId} in the ${domainNames[domain] ?? `unassigned domain ${domain}`} domain, so the time is only known to the start of a window of about seven minutes.` });
      nodeFindings(out.node, f);
      break;
    }
    case 3:
    case 5: {
      const g: Field["group"] = "hash";
      const prefix = version === 3 ? "md5" : "sha1";
      out.fields = [
        field(value, `${prefix}_high`, 0, 47, g, "Hash output, bits 0 to 47"),
        verField,
        field(value, `${prefix}_mid`, 52, 63, g, "Hash output, bits 52 to 63"),
        varField,
        field(value, `${prefix}_low`, 66, 127, g, "Hash output, bits 66 to 127"),
      ];
      f.push({
        tone: "info",
        text: `A ${version === 3 ? "MD5" : "SHA-1"} hash of a namespace ID and a name, truncated to 122 bits. The name cannot be read back out, but the same namespace and name always produce this same UUID, so anyone who can guess the name can confirm it by recomputing.`,
      });
      break;
    }
    case 4: {
      out.fields = [
        field(value, "random_a", 0, 47, "random", "Random"),
        verField,
        field(value, "random_b", 52, 63, "random", "Random"),
        varField,
        field(value, "random_c", 66, 127, "random", "Random"),
      ];
      f.push({ tone: "ok", text: "122 random bits. There is no time, machine or sequence to recover: a version 4 UUID says nothing about where or when it was made." });
      break;
    }
    case 8: {
      out.fields = [
        field(value, "custom_a", 0, 47, "custom", "Vendor-defined"),
        verField,
        field(value, "custom_b", 52, 63, "custom", "Vendor-defined"),
        varField,
        field(value, "custom_c", 66, 127, "custom", "Vendor-defined"),
      ];
      f.push({ tone: "info", text: "Version 8 fixes only the version and variant. The other 122 bits mean whatever the vendor that minted it decided, so there is no general way to decode them." });
      break;
    }
    default: {
      out.fields = [
        field(value, "undefined", 0, 47, "custom", "No meaning assigned"),
        verField,
        field(value, "undefined", 52, 63, "custom", "No meaning assigned"),
        varField,
        field(value, "undefined", 66, 127, "custom", "No meaning assigned"),
      ];
      f.push({
        tone: "warn",
        text: `Version ${version} is not assigned. RFC 9562 defines versions 1 to 8; ${version === 0 ? "0 is valid only as part of the Nil UUID" : "9 to 15 are reserved"}. This is probably not a generated UUID.`,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------- many lines at once */

export type LineResult =
  | { line: number; input: string; kind: "error"; message: string }
  | { line: number; input: string; kind: "ok"; decoded: Decoded };

export interface Batch {
  results: LineResult[];
  truncated: number;
  /** Node addresses that appear on more than one time-based UUID. */
  sharedNodes: { mac: string; count: number }[];
  /** Earliest and latest timestamps among the time-based UUIDs. */
  span: { first: string; last: string; count: number } | null;
}

export function decodeMany(text: string, nowMs: number, guidBytes = false): Batch {
  const lines = text.split(/\r?\n/);
  const results: LineResult[] = [];
  let truncated = 0;
  lines.forEach((input, i) => {
    const parsed = parseUuid(input, guidBytes);
    if (parsed.kind === "empty") return;
    if (results.length >= MAX_DECODE_LINES) {
      truncated++;
      return;
    }
    if (parsed.kind === "error") results.push({ line: i + 1, input: input.trim(), kind: "error", message: parsed.message });
    else results.push({ line: i + 1, input: input.trim(), kind: "ok", decoded: decodeUuid(parsed.hex, nowMs) });
  });

  const nodes = new Map<string, number>();
  const times: bigint[] = [];
  for (const r of results) {
    if (r.kind !== "ok") continue;
    if (r.decoded.node) nodes.set(r.decoded.node.mac, (nodes.get(r.decoded.node.mac) ?? 0) + 1);
    if (r.decoded.time?.displayable) times.push(r.decoded.time.unixMs);
  }
  const sharedNodes = [...nodes.entries()].filter(([, c]) => c > 1).map(([mac, count]) => ({ mac, count }));
  let span: Batch["span"] = null;
  if (times.length > 1) {
    const sorted = [...times].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    span = { first: isoFromMs(sorted[0]).iso, last: isoFromMs(sorted[sorted.length - 1]).iso, count: times.length };
  }
  return { results, truncated, sharedNodes, span };
}

/* ------------------------------------------------------------- encoding v1 */

/**
 * Builds a version 1 UUID from its parts. The page does not generate v1
 * (that would mean reading a MAC address, which a browser cannot do), but
 * the tests and the worked examples need one with known contents.
 */
export function buildV1(ticks: bigint, clockSeq: number, nodeHex12: string): string {
  const low = ticks & 0xffffffffn;
  const mid = (ticks >> 32n) & 0xffffn;
  const high = (ticks >> 48n) & 0xfffn;
  const value =
    (low << 96n) | (mid << 80n) | (1n << 76n) | (high << 64n) |
    (0b10n << 62n) | (BigInt(clockSeq & 0x3fff) << 48n) | BigInt(`0x${nodeHex12}`);
  return value.toString(16).padStart(32, "0");
}

/** 100 ns ticks since 1582-10-15 for a Unix millisecond time. */
export function ticksFromUnixMs(ms: number): bigint {
  return BigInt(Math.floor(ms)) * 10_000n + GREGORIAN_OFFSET;
}

/** Human relative time, coarse. */
export function relativeTo(targetMs: bigint, nowMs: number): string {
  const delta = Number(targetMs - BigInt(Math.floor(nowMs))) / 1000;
  const abs = Math.abs(delta);
  const unit = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;
  let text: string;
  if (abs < 60) text = unit(Math.round(abs), "second");
  else if (abs < 3600) text = unit(Math.round(abs / 60), "minute");
  else if (abs < 172_800) text = unit(Math.round(abs / 3600), "hour");
  else if (abs < 86_400 * 60) text = unit(Math.round(abs / 86_400), "day");
  else if (abs < 86_400 * 730) text = unit(Math.round(abs / (86_400 * 30.44)), "month");
  else text = unit(Math.round(abs / (86_400 * 365.25)), "year");
  if (Math.round(abs) === 0) return "right now";
  return delta < 0 ? `${text} ago` : `in ${text}`;
}
