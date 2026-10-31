/**
 * Schema-less Protocol Buffers decoder.
 *
 * Written from the wire format in the Protocol Buffers encoding guide
 * (protobuf.dev/programming-guides/encoding). A message is a sequence of
 * records; each starts with a varint tag whose low three bits are the wire
 * type and whose remaining bits are the field number. Without the .proto
 * file the bytes do not say which scalar type a field is, so every
 * interpretation the wire type allows is computed and the reader chooses.
 *
 * A length-delimited payload is tried as a nested message, and that guess is
 * kept only if the whole payload parses with no error. Speculative parsing
 * is what makes a hostile input expensive, so depth and the total number of
 * records examined are both capped, and every failure becomes a message
 * with the offset where it happened. Nothing here throws.
 *
 * Pure data in, data out. No DOM, no React.
 */

/* ------------------------------------------------------------------ caps */

/** Largest decoded input: 1 MiB. */
export const MAX_INPUT_BYTES = 1_048_576;
/** Largest pasted text: 3 MiB, room for 1 MiB of spaced hex. */
export const MAX_TEXT_CHARS = 3_145_728;
/** Nesting levels of messages and groups the decoder descends into. */
export const MAX_DEPTH = 32;
/** Records examined in total, speculative attempts included, before the decoder stops. */
export const MAX_FIELDS = 50_000;
/** Values listed for a packed repeated interpretation. */
export const MAX_PACKED_SHOWN = 64;

/* ----------------------------------------------------------------- types */

export const WIRE_TYPE_NAMES = ["VARINT", "I64", "LEN", "SGROUP", "EGROUP", "I32"] as const;

export type WireType = 0 | 1 | 2 | 3 | 4 | 5;

/** How a length-delimited payload is shown. */
export type LenView = "message" | "string" | "bytes" | "packed-varint" | "packed-fixed32" | "packed-fixed64";

export interface VarintValue {
  value: bigint;
  /** Bytes the varint occupies. */
  length: number;
  /** True when the encoding is longer than needed (ends in a 0x00 continuation byte). */
  overlong: boolean;
}

export interface LenInfo {
  length: number;
  /** Bytes the length prefix occupies. */
  prefixLength: number;
  prefixOverlong: boolean;
  /** Payload is valid UTF-8. */
  utf8: boolean;
  /** Valid UTF-8 with no control characters at all. */
  printable: boolean;
  /** Valid UTF-8 whose only control characters are tab, LF and CR. */
  text: boolean;
  /** Fields of the payload parsed as a message, when it parses completely. */
  message: PbField[] | null;
  /** Why a message parse was not attempted. */
  skipped: "depth" | "budget" | null;
  /** The interpretation the decoder thinks most likely. */
  guess: LenView;
}

export interface PbField {
  /** Path of indices, unique within one decode: "2", "2.0", "2.0.4". */
  id: string;
  depth: number;
  /** Offset of the tag's first byte. */
  offset: number;
  tagLength: number;
  tagOverlong: boolean;
  fieldNumber: number;
  wireType: WireType;
  /** First byte of the value, after the tag and any length prefix. */
  valueOffset: number;
  /** One past the last byte of the record, end-group tag included. */
  end: number;
  varint?: VarintValue;
  len?: LenInfo;
  /** Children of a group (wire type 3). */
  group?: PbField[];
  /** Offset of the matching end-group tag. */
  groupEndOffset?: number;
}

export interface PbError {
  offset: number;
  message: string;
}

export interface DecodeResult {
  fields: PbField[];
  /** The fatal error that stopped top-level decoding, if any. */
  error: PbError | null;
  /** Records examined, speculative attempts included. */
  examined: number;
  depthCapHit: boolean;
  budgetHit: boolean;
  /** Top-level decoding stopped because the record budget ran out. */
  stoppedAt: number | null;
  start: number;
  end: number;
}

/* ----------------------------------------------------------------- input */

export type InputFormat = "auto" | "hex" | "base64";

export type InputResult =
  | { ok: true; bytes: Uint8Array; format: "hex" | "base64"; alsoValid: boolean }
  | { ok: false; error: string };

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_VALUE = new Map<string, number>(Array.from(B64, (c, i) => [c, i]));

type Attempt = { ok: true; bytes: Uint8Array } | { ok: false; error: string };

function parseHex(text: string): Attempt {
  const cleaned = text
    .replace(/\\x/gi, " ")
    .replace(/\b0x/gi, " ")
    .replace(/[\s:,;{}[\]()]/g, "");
  const bad = cleaned.search(/[^0-9a-fA-F]/);
  if (bad >= 0) {
    return { ok: false, error: `"${cleaned[bad]}" is not a hex digit.` };
  }
  if (cleaned.length % 2 === 1) {
    return { ok: false, error: `There are ${cleaned.length} hex digits, an odd number, so the last byte is incomplete.` };
  }
  if (cleaned.length / 2 > MAX_INPUT_BYTES) {
    return { ok: false, error: `That is ${(cleaned.length / 2).toLocaleString("en-US")} bytes. The decoder reads up to ${MAX_INPUT_BYTES.toLocaleString("en-US")}.` };
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  return { ok: true, bytes: out };
}

function parseBase64(text: string): Attempt {
  const cleaned = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const body = cleaned.replace(/=+$/, "");
  if (cleaned.length - body.length > 2) return { ok: false, error: "Base64 has at most two padding characters." };
  for (let i = 0; i < body.length; i++) {
    if (!B64_VALUE.has(body[i])) return { ok: false, error: `"${body[i]}" is not a Base64 character.` };
  }
  if (body.length % 4 === 1) return { ok: false, error: "The Base64 text is one character short of a whole byte." };
  const size = Math.floor((body.length * 3) / 4);
  if (size > MAX_INPUT_BYTES) {
    return { ok: false, error: `That is ${size.toLocaleString("en-US")} bytes. The decoder reads up to ${MAX_INPUT_BYTES.toLocaleString("en-US")}.` };
  }
  const out = new Uint8Array(size);
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < body.length; i++) {
    acc = ((acc << 6) | (B64_VALUE.get(body[i]) as number)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 0xff;
    }
  }
  return { ok: true, bytes: out.slice(0, n) };
}

/**
 * Reads pasted hex or Base64. Hex may carry spaces, colons, commas, 0x
 * prefixes or \x escapes. Base64 may be standard or URL-safe, with or
 * without padding. Auto picks hex when the text is valid hex, because a
 * short hex string is almost always also valid Base64 and the reverse is
 * rare; alsoValid says when the other reading would have worked too.
 */
export function parseInput(text: string, format: InputFormat): InputResult | null {
  if (text.trim() === "") return null;
  if (text.length > MAX_TEXT_CHARS) {
    return { ok: false, error: `The input is ${text.length.toLocaleString("en-US")} characters. The limit is ${MAX_TEXT_CHARS.toLocaleString("en-US")}.` };
  }
  if (format === "hex") {
    const r = parseHex(text);
    return r.ok ? { ok: true, bytes: r.bytes, format: "hex", alsoValid: false } : { ok: false, error: `Not valid hex: ${r.error}` };
  }
  if (format === "base64") {
    const r = parseBase64(text);
    return r.ok ? { ok: true, bytes: r.bytes, format: "base64", alsoValid: false } : { ok: false, error: `Not valid Base64: ${r.error}` };
  }
  const hex = parseHex(text);
  const b64 = parseBase64(text);
  if (hex.ok) return { ok: true, bytes: hex.bytes, format: "hex", alsoValid: b64.ok && b64.bytes.length > 0 };
  if (b64.ok) return { ok: true, bytes: b64.bytes, format: "base64", alsoValid: false };
  return { ok: false, error: `Not valid hex (${hex.error}) or Base64 (${b64.error})` };
}

/* ---------------------------------------------------------------- varints */

type VarintRead = VarintValue | PbError;

function isError(x: object): x is PbError {
  return "message" in x;
}

/**
 * Base 128 varint, least significant group first, at most ten bytes for a
 * 64-bit value. The tenth byte may only carry the single remaining bit.
 */
export function readVarint(bytes: Uint8Array, pos: number, end: number): VarintRead {
  let small = 0;
  let big = 0n;
  for (let i = 0; i < 10; i++) {
    const p = pos + i;
    if (p >= end) {
      return {
        offset: pos,
        message: `The varint at offset ${pos} is cut off: byte ${i + 1} should follow, but the data ends.`,
      };
    }
    const b = bytes[p];
    if (i === 9 && b > 1) {
      return {
        offset: pos,
        message:
          b & 0x80
            ? `The varint at offset ${pos} runs past ten bytes, the most a 64-bit value can take.`
            : `The varint at offset ${pos} is larger than 64 bits.`,
      };
    }
    if (i < 7) small += (b & 0x7f) * 2 ** (7 * i);
    else big |= BigInt(b & 0x7f) << BigInt(7 * i);
    if ((b & 0x80) === 0) {
      return { value: BigInt(small) + big, length: i + 1, overlong: i > 0 && b === 0 };
    }
  }
  // Unreachable: the tenth byte either ends the varint or fails above.
  return { offset: pos, message: `The varint at offset ${pos} is malformed.` };
}

/* ---------------------------------------------------------------- parsing */

interface Ctx {
  bytes: Uint8Array;
  examined: number;
  depthCapHit: boolean;
  budgetHit: boolean;
}

type ParseOutcome =
  | { ok: true; fields: PbField[]; end: number; endGroup?: { offset: number; length: number } }
  | { ok: false; fields: PbField[]; error: PbError; budget?: boolean };

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const ANY_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

let utf8Decoder: TextDecoder | null = null;

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    utf8Decoder ??= new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
    return utf8Decoder.decode(bytes);
  } catch {
    return null;
  }
}

function analyzeLen(ctx: Ctx, start: number, end: number, depth: number, id: string): Omit<LenInfo, "prefixLength" | "prefixOverlong"> {
  const length = end - start;
  const str = length > 0 ? decodeUtf8(ctx.bytes.subarray(start, end)) : "";
  const utf8 = str !== null;
  const printable = utf8 && !ANY_CONTROL.test(str);
  const text = utf8 && !CONTROL.test(str);

  let message: PbField[] | null = null;
  let skipped: LenInfo["skipped"] = null;
  if (length > 0) {
    if (depth + 1 > MAX_DEPTH) {
      skipped = "depth";
      ctx.depthCapHit = true;
    } else if (ctx.examined >= MAX_FIELDS) {
      skipped = "budget";
      ctx.budgetHit = true;
    } else {
      const r = parseFields(ctx, start, end, depth + 1, id, true, null);
      if (r.ok) message = r.fields;
      else if (r.budget) skipped = "budget";
    }
  }

  // Bytes that are all printable text are text: every byte of such a
  // payload is at least 0x20, so as a message every field number would be 4
  // or more, which real messages rarely start with. Otherwise a complete
  // message parse wins, then text with ordinary line breaks, then raw bytes.
  let guess: LenView;
  if (length === 0) guess = "string";
  else if (printable) guess = "string";
  else if (message) guess = "message";
  else if (text) guess = "string";
  else guess = "bytes";

  return { length, utf8, printable, text, message, skipped, guess };
}

function childId(prefix: string | null, index: number): string {
  return prefix === null ? String(index) : `${prefix}.${index}`;
}

/**
 * Parses records from start to end. In strict mode (a speculative nested
 * attempt) the first problem abandons the attempt; at the top level the
 * records before the problem are kept and the problem is reported. When
 * group is set, the run ends at the matching end-group tag.
 */
function parseFields(
  ctx: Ctx,
  start: number,
  end: number,
  depth: number,
  prefix: string | null,
  strict: boolean,
  group: number | null,
): ParseOutcome {
  const { bytes } = ctx;
  const fields: PbField[] = [];
  let pos = start;
  const fail = (offset: number, message: string, budget = false): ParseOutcome => ({
    ok: false,
    fields,
    error: { offset, message },
    budget,
  });

  while (pos < end) {
    if (ctx.examined >= MAX_FIELDS) {
      ctx.budgetHit = true;
      return fail(pos, `Stopped after examining ${MAX_FIELDS.toLocaleString("en-US")} fields.`, true);
    }
    ctx.examined++;
    const tagAt = pos;
    const tag = readVarint(bytes, pos, end);
    if (isError(tag)) return fail(tagAt, `Field tag at offset ${tagAt} is cut off. ${tag.message}`);
    if (tag.value > 0xffffffffn) {
      return fail(tagAt, `The tag at offset ${tagAt} is larger than 32 bits, so it cannot hold a field number of 29 bits and a wire type.`);
    }
    const tagValue = Number(tag.value);
    const wireType = tagValue & 7;
    const fieldNumber = Math.floor(tagValue / 8);
    pos += tag.length;

    if (wireType > 5) {
      return fail(
        tagAt,
        `Offset ${tagAt}: wire type ${wireType} does not exist (tag byte 0x${bytes[tagAt].toString(16).padStart(2, "0")}). Valid wire types are 0 to 5, so this is probably not the start of a field: the data may not be protobuf, may start at the wrong offset, or may have a length prefix in front.`,
      );
    }
    if (fieldNumber === 0) {
      return fail(
        tagAt,
        `Offset ${tagAt}: field number 0 is not allowed.${
          tagValue === 0 ? " A zero byte where a tag should be often means padding, a framing header, or the end of the real data." : ""
        }`,
      );
    }

    const base = {
      id: childId(prefix, fields.length),
      depth,
      offset: tagAt,
      tagLength: tag.length,
      tagOverlong: tag.overlong,
      fieldNumber,
    };

    if (wireType === 0) {
      const v = readVarint(bytes, pos, end);
      if (isError(v)) return fail(pos, `Field ${fieldNumber} (VARINT) at offset ${tagAt}: ${v.message}`);
      fields.push({ ...base, wireType: 0, valueOffset: pos, end: pos + v.length, varint: v });
      pos += v.length;
    } else if (wireType === 1 || wireType === 5) {
      const size = wireType === 1 ? 8 : 4;
      if (end - pos < size) {
        return fail(
          tagAt,
          `Field ${fieldNumber} (${wireType === 1 ? "I64" : "I32"}) at offset ${tagAt} needs ${size} bytes, but only ${end - pos} remain.`,
        );
      }
      fields.push({ ...base, wireType: wireType as WireType, valueOffset: pos, end: pos + size });
      pos += size;
    } else if (wireType === 2) {
      const lenAt = pos;
      const lv = readVarint(bytes, pos, end);
      if (isError(lv)) return fail(lenAt, `Field ${fieldNumber} (LEN) at offset ${tagAt}: the length ${lv.message.replace(/^The varint/, "varint")}`);
      if (lv.value > 0x7fffffffn) {
        return fail(lenAt, `Field ${fieldNumber} (LEN) at offset ${tagAt} declares ${lv.value} bytes, more than the 2 GiB protobuf allows.`);
      }
      const length = Number(lv.value);
      const dataAt = lenAt + lv.length;
      if (length > end - dataAt) {
        return fail(
          tagAt,
          `Field ${fieldNumber} (LEN) at offset ${tagAt} declares ${length.toLocaleString("en-US")} ${length === 1 ? "byte" : "bytes"}, but only ${(end - dataAt).toLocaleString("en-US")} remain${
            group !== null || prefix !== null ? " in the enclosing field" : ""
          }. The data is truncated or this is not a length.`,
        );
      }
      const id = base.id;
      const info = analyzeLen(ctx, dataAt, dataAt + length, depth, id);
      fields.push({
        ...base,
        wireType: 2,
        valueOffset: dataAt,
        end: dataAt + length,
        len: { ...info, prefixLength: lv.length, prefixOverlong: lv.overlong },
      });
      pos = dataAt + length;
    } else if (wireType === 3) {
      if (depth + 1 > MAX_DEPTH) {
        ctx.depthCapHit = true;
        return fail(tagAt, `Groups nest deeper than ${MAX_DEPTH} levels at offset ${tagAt}.`);
      }
      const inner = parseFields(ctx, pos, end, depth + 1, base.id, strict, fieldNumber);
      if (!inner.ok) {
        if (strict || inner.budget) return { ok: false, fields, error: inner.error, budget: inner.budget };
        // Keep what the group held up to the problem so the reader sees it.
        fields.push({ ...base, wireType: 3, valueOffset: pos, end: inner.error.offset, group: inner.fields });
        return { ok: false, fields, error: inner.error };
      }
      const eg = inner.endGroup as { offset: number; length: number };
      fields.push({
        ...base,
        wireType: 3,
        valueOffset: pos,
        end: eg.offset + eg.length,
        group: inner.fields,
        groupEndOffset: eg.offset,
      });
      pos = eg.offset + eg.length;
    } else {
      // wireType 4: end of group.
      if (group === null) {
        return fail(tagAt, `Offset ${tagAt}: end-group tag for field ${fieldNumber} with no start-group before it.`);
      }
      if (fieldNumber !== group) {
        return fail(tagAt, `Offset ${tagAt}: end-group tag for field ${fieldNumber} inside the group started by field ${group}.`);
      }
      return { ok: true, fields, end: pos, endGroup: { offset: tagAt, length: tag.length } };
    }
  }

  if (group !== null) {
    return fail(end, `The group for field ${group} has no end-group tag before offset ${end}.`);
  }
  return { ok: true, fields, end: pos };
}

/** Decodes bytes[start..end) as a top-level message. */
export function decodeMessage(bytes: Uint8Array, start = 0, end = bytes.length): DecodeResult {
  const ctx: Ctx = { bytes, examined: 0, depthCapHit: false, budgetHit: false };
  const s = Math.max(0, Math.min(start, bytes.length));
  const e = Math.max(s, Math.min(end, bytes.length));
  const r = parseFields(ctx, s, e, 0, null, false, null);
  const stoppedAt = !r.ok && r.budget ? r.error.offset : null;
  return {
    fields: r.fields,
    error: r.ok || r.budget ? null : r.error,
    examined: ctx.examined,
    depthCapHit: ctx.depthCapHit,
    budgetHit: ctx.budgetHit,
    stoppedAt,
    start: s,
    end: e,
  };
}

/* --------------------------------------------------------------- framing */

export interface FrameHint {
  kind: "grpc" | "delimited";
  /** Bytes to skip to reach the message. */
  skip: number;
  text: string;
}

/**
 * Two wrappers people paste by accident. A gRPC message on the wire is a
 * one-byte compressed flag and a four-byte big-endian length before the
 * protobuf bytes. writeDelimitedTo and similar helpers put a varint length
 * in front. Both make a top-level parse fail or mislead, so they are
 * detected when the declared length matches the rest of the data exactly.
 */
export function detectFraming(bytes: Uint8Array): FrameHint | null {
  if (bytes.length >= 5 && (bytes[0] === 0 || bytes[0] === 1)) {
    const length = ((bytes[1] << 24) >>> 0) + (bytes[2] << 16) + (bytes[3] << 8) + bytes[4];
    if (length === bytes.length - 5) {
      return {
        kind: "grpc",
        skip: 5,
        text:
          bytes[0] === 1
            ? `This looks like a gRPC frame: compressed flag 1 and a length of ${length}. The message after the 5-byte header is compressed (usually gzip), so it will not decode as protobuf until it is decompressed.`
            : `This looks like a gRPC frame: compressed flag 0 and a 4-byte length of ${length}, which matches the rest of the data. The protobuf message starts at offset 5.`,
      };
    }
  }
  const v = readVarint(bytes, 0, bytes.length);
  if (!isError(v) && v.value > 0n && v.value === BigInt(bytes.length - v.length)) {
    // A real first tag can equal the remaining length by coincidence, so
    // this is offered only as a possibility.
    return {
      kind: "delimited",
      skip: v.length,
      text: `The first varint is ${v.value}, exactly the number of bytes after it. That is how a length-delimited stream (writeDelimitedTo) frames a message, so the message may start at offset ${v.length}.`,
    };
  }
  return null;
}

/* ------------------------------------------------------------- formatting */

const TWO_64 = 1n << 64n;
const TWO_63 = 1n << 63n;

export interface VarintViews {
  uint64: string;
  int64: string;
  /** ZigZag decoding, as sint32 and sint64 use. */
  sint: string;
  /** int32 reading, when the value is a valid int32 encoding. */
  int32: string | null;
  uint32: string | null;
  bool: string | null;
  hex: string;
}

/** Every scalar a varint can be (encoding guide, "More Integer Types"). */
export function varintViews(v: bigint): VarintViews {
  const int64 = v >= TWO_63 ? v - TWO_64 : v;
  // ZigZag: (n >>> 1) ^ -(n & 1).
  const sint = (v >> 1n) ^ -(v & 1n);
  // A negative int32 is sign-extended to 64 bits before encoding, so a
  // valid int32 is either below 2^31 or in the top 2^31 values of 64 bits.
  const int32 = v < 0x80000000n ? v.toString() : v >= TWO_64 - 0x80000000n ? (v - TWO_64).toString() : null;
  return {
    uint64: v.toString(),
    int64: int64.toString(),
    sint: sint.toString(),
    int32,
    uint32: v <= 0xffffffffn ? v.toString() : null,
    bool: v === 0n ? "false" : v === 1n ? "true" : null,
    hex: `0x${v.toString(16)}`,
  };
}

/** Shortest decimal that reads back as the same 32-bit float. */
export function formatFloat32(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  for (let p = 1; p <= 9; p++) {
    const s = x.toPrecision(p);
    if (Math.fround(Number(s)) === x) return String(Number(s));
  }
  return String(x);
}

export function formatFloat64(x: number): string {
  if (Number.isNaN(x)) return "NaN";
  if (!Number.isFinite(x)) return x > 0 ? "Infinity" : "-Infinity";
  if (x === 0) return Object.is(x, -0) ? "-0" : "0";
  return String(x);
}

export interface FixedViews {
  unsigned: string;
  signed: string;
  float: string;
  hex: string;
}

/** fixed32, sfixed32 and float: four bytes, little-endian. */
export function fixed32Views(bytes: Uint8Array, offset: number): FixedViews {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  const u = view.getUint32(0, true);
  return {
    unsigned: String(u),
    signed: String(view.getInt32(0, true)),
    float: formatFloat32(view.getFloat32(0, true)),
    hex: `0x${u.toString(16).padStart(8, "0")}`,
  };
}

/** fixed64, sfixed64 and double: eight bytes, little-endian. */
export function fixed64Views(bytes: Uint8Array, offset: number): FixedViews {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  const u = view.getBigUint64(0, true);
  return {
    unsigned: u.toString(),
    signed: view.getBigInt64(0, true).toString(),
    float: formatFloat64(view.getFloat64(0, true)),
    hex: `0x${u.toString(16).padStart(16, "0")}`,
  };
}

export interface PackedResult {
  ok: boolean;
  count: number;
  values: string[];
}

/** A packed repeated varint field: varints back to back with no tags. */
export function packedVarints(bytes: Uint8Array, start: number, end: number, mode: "uint" | "sint" = "uint"): PackedResult {
  const values: string[] = [];
  let count = 0;
  let pos = start;
  while (pos < end) {
    const v = readVarint(bytes, pos, end);
    if (isError(v)) return { ok: false, count, values };
    count++;
    if (values.length < MAX_PACKED_SHOWN) values.push(mode === "sint" ? varintViews(v.value).sint : v.value.toString());
    pos += v.length;
  }
  return { ok: count > 0, count, values };
}

/** A packed repeated fixed-width field. */
export function packedFixed(bytes: Uint8Array, start: number, end: number, width: 4 | 8): PackedResult & { floats: string[] } {
  const length = end - start;
  if (length === 0 || length % width !== 0) return { ok: false, count: 0, values: [], floats: [] };
  const values: string[] = [];
  const floats: string[] = [];
  const count = length / width;
  for (let i = 0; i < Math.min(count, MAX_PACKED_SHOWN); i++) {
    const v = width === 4 ? fixed32Views(bytes, start + i * 4) : fixed64Views(bytes, start + i * 8);
    values.push(v.unsigned);
    floats.push(v.float);
  }
  return { ok: true, count, values, floats };
}

/** Seconds or milliseconds since 1970 that land between 2001 and 2100, as an ISO time. */
export function plausibleTimestamp(v: bigint): string | null {
  const SEC_MIN = 1_000_000_000n;
  const SEC_MAX = 4_102_444_800n;
  if (v >= SEC_MIN && v < SEC_MAX) return `${new Date(Number(v) * 1000).toISOString().replace(".000Z", "Z")} if Unix seconds`;
  if (v >= SEC_MIN * 1000n && v < SEC_MAX * 1000n) return `${new Date(Number(v)).toISOString()} if Unix milliseconds`;
  return null;
}

/**
 * C-style escaping in the manner of protoc --decode_raw, except that valid
 * UTF-8 is left readable instead of being written as octal escapes.
 */
export function escapeBytes(bytes: Uint8Array, start: number, end: number): string {
  const slice = bytes.subarray(start, end);
  const str = decodeUtf8(slice);
  let out = "";
  if (str !== null) {
    for (const ch of str) {
      const cp = ch.codePointAt(0) as number;
      if (ch === "\\") out += "\\\\";
      else if (ch === '"') out += '\\"';
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (cp < 0x20 || cp === 0x7f) out += `\\${cp.toString(8).padStart(3, "0")}`;
      else if (cp >= 0x80 && cp <= 0x9f) out += `\\u${cp.toString(16).padStart(4, "0")}`;
      else out += ch;
    }
    return out;
  }
  for (const b of slice) {
    if (b === 0x5c) out += "\\\\";
    else if (b === 0x22) out += '\\"';
    else if (b === 0x0a) out += "\\n";
    else if (b === 0x0d) out += "\\r";
    else if (b === 0x09) out += "\\t";
    else if (b < 0x20 || b >= 0x7f) out += `\\${b.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(b);
  }
  return out;
}

export function hexBytes(bytes: Uint8Array, start: number, end: number, sep = " "): string {
  const parts: string[] = [];
  for (let i = start; i < end; i++) parts.push(bytes[i].toString(16).padStart(2, "0"));
  return parts.join(sep);
}

/** The view a field is shown in: the reader's choice if it applies, else the guess. */
export function effectiveView(field: PbField, overrides: ReadonlyMap<string, LenView>): LenView | null {
  if (!field.len) return null;
  const chosen = overrides.get(field.id);
  if (chosen === "message" && !field.len.message) return field.len.guess;
  return chosen ?? field.len.guess;
}

/** Records under a field in the current view: a group's, or a payload's shown as a message. */
export function childrenOf(field: PbField, overrides: ReadonlyMap<string, LenView>): PbField[] {
  if (field.group) return field.group;
  if (field.len?.message && effectiveView(field, overrides) === "message") return field.len.message;
  return [];
}

const MAX_TEXT_LINES = 20_000;

/**
 * The decode as text, in the shape protoc --decode_raw prints: varints as
 * unsigned decimal, fixed32 and fixed64 as zero-padded hex, nested messages
 * and groups in braces, and other payloads as quoted escaped strings.
 */
export function toText(bytes: Uint8Array, fields: PbField[], overrides: ReadonlyMap<string, LenView> = new Map()): string {
  const lines: string[] = [];
  const walk = (list: PbField[], indent: string) => {
    for (const f of list) {
      if (lines.length >= MAX_TEXT_LINES) return;
      if (f.wireType === 0 && f.varint) lines.push(`${indent}${f.fieldNumber}: ${f.varint.value}`);
      else if (f.wireType === 1) lines.push(`${indent}${f.fieldNumber}: ${fixed64Views(bytes, f.valueOffset).hex}`);
      else if (f.wireType === 5) lines.push(`${indent}${f.fieldNumber}: ${fixed32Views(bytes, f.valueOffset).hex}`);
      else if (f.group || (f.len && effectiveView(f, overrides) === "message")) {
        lines.push(`${indent}${f.fieldNumber} {`);
        walk(childrenOf(f, overrides), `${indent}  `);
        lines.push(`${indent}}`);
      } else if (f.len) {
        lines.push(`${indent}${f.fieldNumber}: "${escapeBytes(bytes, f.valueOffset, f.end)}"`);
      }
    }
  };
  walk(fields, "");
  if (lines.length >= MAX_TEXT_LINES) lines.push(`# stopped after ${MAX_TEXT_LINES.toLocaleString("en-US")} lines`);
  return lines.join("\n");
}
