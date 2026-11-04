/**
 * Snowflake ID decoding and construction.
 *
 * A snowflake is a 64 bit integer whose high bits are a millisecond
 * timestamp, so the ID alone says when it was minted. The layout comes from
 * Twitter's Snowflake service (2010) and Discord's developer documentation
 * ("Snowflakes"), which reuses it with its own epoch:
 *
 *   bit 63        X: unused sign bit, always 0. Discord: top timestamp bit.
 *   bits 62..22   milliseconds since the platform epoch (41 bits on X;
 *                 Discord documents 42 bits, 63..22)
 *   bits 21..17   X: datacenter ID.   Discord: internal worker ID.
 *   bits 16..12   X: worker ID.       Discord: internal process ID.
 *   bits 11..0    X: sequence.        Discord: increment.
 *
 * Every ID is a BigInt here. A JavaScript number holds 53 bits of integer
 * precision and a current snowflake needs 61, so Number(id) silently rounds
 * away the machine and sequence fields and shifts the timestamp.
 *
 * Pure functions, no DOM, so the bit arithmetic can be tested directly.
 */

/** Twitter Snowflake's twepoch: 2010-11-04T01:42:54.657Z. */
export const X_EPOCH_MS = 1288834974657;
/** Discord epoch: 2015-01-01T00:00:00.000Z. */
export const DISCORD_EPOCH_MS = 1420070400000;

/** The timestamp starts at bit 22: 10 machine bits plus 12 sequence bits. */
export const TIMESTAMP_SHIFT = 22n;
const LOW_MASK = (1n << TIMESTAMP_SHIFT) - 1n;

/** Longest input accepted, in characters. */
export const MAX_INPUT_CHARS = 100_000;
/** Most IDs decoded in one batch. */
export const MAX_BATCH = 1000;
/** 2^64 - 1 is 20 digits, so anything longer cannot be a snowflake. */
export const MAX_ID_DIGITS = 20;
/** A numeric path segment shorter than this in a link is skipped (the 1 in /photo/1). */
export const MIN_LINK_DIGITS = 6;
/** Decoded times this close to the epoch are flagged as probably not real snowflakes. */
export const NEAR_EPOCH_MS = 60_000;
/** Latest custom epoch accepted: 2100-01-01T00:00:00Z. */
export const MAX_CUSTOM_EPOCH_MS = 4102444800000;

export type PlatformId = "x" | "discord" | "custom";

export interface Platform {
  id: PlatformId;
  label: string;
  /** How many bits the whole ID may use. 63 keeps the sign bit clear. */
  idBits: 63 | 64;
  /** Names for bits 21..17, 16..12 and 11..0. */
  fieldA: string;
  fieldB: string;
  sequence: string;
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  x: {
    id: "x",
    label: "X / Twitter",
    idBits: 63,
    fieldA: "Datacenter ID",
    fieldB: "Worker ID",
    sequence: "Sequence",
  },
  discord: {
    id: "discord",
    label: "Discord",
    idBits: 64,
    fieldA: "Internal worker ID",
    fieldB: "Internal process ID",
    sequence: "Increment",
  },
  custom: {
    id: "custom",
    label: "Custom epoch",
    idBits: 64,
    fieldA: "Machine bits 21 to 17",
    fieldB: "Machine bits 16 to 12",
    sequence: "Sequence",
  },
};

export function platformEpoch(id: PlatformId, customEpochMs: number): number {
  if (id === "x") return X_EPOCH_MS;
  if (id === "discord") return DISCORD_EPOCH_MS;
  return customEpochMs;
}

/** Largest timestamp field value a layout can hold. */
export function maxOffsetMs(idBits: 63 | 64): number {
  return Number((1n << BigInt(idBits - 22)) - 1n);
}

/* ------------------------------------------------------------ formatting */

function pad(value: number, width = 2): string {
  return String(Math.abs(value)).padStart(width, "0");
}

/** ISO 8601 in UTC with milliseconds, the resolution a snowflake carries. */
export function formatUtc(ms: number): string {
  return new Date(ms).toISOString();
}

/** ISO 8601 style in the runtime's local zone, with the offset spelled out. */
export function formatLocal(ms: number): string {
  const d = new Date(ms);
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)} ` +
    `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Coarse distance between two instants, for "3 years ago". */
export function relativeTime(targetMs: number, nowMs: number): string {
  const delta = Math.round((targetMs - nowMs) / 1000);
  if (delta === 0) return "right now";
  const s = Math.abs(delta);
  let text: string;
  if (s < 60) text = plural(s, "second");
  else if (s < 3600) text = plural(Math.round(s / 60), "minute");
  else if (s < 172800) text = plural(Math.round(s / 3600), "hour");
  else if (s < 86400 * 60) text = plural(Math.round(s / 86400), "day");
  else if (s < 86400 * 730) text = plural(Math.round(s / (86400 * 30.44)), "month");
  else text = plural(Math.round(s / (86400 * 365.25)), "year");
  return delta < 0 ? `${text} ago` : `in ${text}`;
}

/** Exact gap between two IDs, readable at any scale: +850 ms, +4 min 5.120 s, +2 d 3 h. */
export function formatDelta(ms: number): string {
  if (ms < 1000) return `+${ms} ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(3)} s`;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = (ms % 60_000) / 1000;
  if (days > 0) return `+${days} d ${hours} h ${minutes} min`;
  if (hours > 0) return `+${hours} h ${minutes} min ${Math.floor(seconds)} s`;
  return `+${minutes} min ${seconds.toFixed(3)} s`;
}

/* --------------------------------------------------------------- parsing */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * An ISO 8601 date or date-time (RFC 3339 profile, plus a space for the T
 * and a missing seconds field). A trailing Z or offset fixes the instant;
 * without one the wall clock is read in the zone the caller picks. Digits
 * past the millisecond are truncated, because a snowflake cannot hold them.
 */
export function parseInstant(raw: string, zone: "utc" | "local"): Result<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Enter a date, for example 2024-03-01 or 2024-03-01T14:30:00Z." };
  const m = ISO.exec(text);
  if (!m) {
    return {
      ok: false,
      error: "Use ISO 8601: 2024-03-01, 2024-03-01 14:30, or 2024-03-01T14:30:05.250Z. An offset such as +02:00 is allowed.",
    };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] ? Number(m[4]) : 0;
  const minute = m[5] ? Number(m[5]) : 0;
  const second = m[6] ? Number(m[6]) : 0;
  const milli = m[7] ? Number(m[7].slice(0, 3).padEnd(3, "0")) : 0;

  if (year < 1970 || year > 9999) return { ok: false, error: "Years from 1970 to 9999 only." };
  if (month < 1 || month > 12) return { ok: false, error: `There is no month ${month}. Months run 01 to 12.` };
  const dim = daysInMonth(year, month);
  if (day < 1 || day > dim) return { ok: false, error: `${m[1]}-${m[2]} has ${dim} days, so day ${m[3]} does not exist.` };
  if (hour > 23) return { ok: false, error: "Hours run 00 to 23." };
  if (minute > 59) return { ok: false, error: "Minutes run 00 to 59." };
  if (second > 59) {
    return { ok: false, error: "Seconds run 00 to 59. Unix time, and so every snowflake, has no leap second 60." };
  }

  const zoneText = m[8];
  if (zoneText && zoneText.toUpperCase() !== "Z") {
    const sign = zoneText[0] === "-" ? -1 : 1;
    const digits = zoneText.slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (oh > 23 || om > 59) return { ok: false, error: `The offset ${zoneText} is out of range.` };
    const utc = Date.UTC(year, month - 1, day, hour, minute, second, milli);
    return { ok: true, value: utc - sign * (oh * 60 + om) * 60_000 };
  }
  if (zoneText || zone === "utc") {
    return { ok: true, value: Date.UTC(year, month - 1, day, hour, minute, second, milli) };
  }
  return { ok: true, value: new Date(year, month - 1, day, hour, minute, second, milli).getTime() };
}

/** A custom epoch: an integer count of Unix milliseconds, or an ISO date (read as UTC). */
export function parseEpoch(raw: string): Result<number> {
  const text = raw.trim().replace(/_/g, "");
  if (text === "") return { ok: false, error: "Enter the epoch as Unix milliseconds (1288834974657) or a UTC date (2010-11-04T01:42:54.657Z)." };
  if (/^-/.test(text)) return { ok: false, error: "The epoch cannot be before 1970-01-01." };
  if (/^\d+$/.test(text)) {
    if (text.length > 16) return { ok: false, error: "That epoch is far too large to be milliseconds." };
    const ms = Number(text);
    if (ms > MAX_CUSTOM_EPOCH_MS) {
      return {
        ok: false,
        error: `${text} ms is after 2100-01-01. If that number is in seconds or microseconds, convert it to milliseconds first.`,
      };
    }
    return { ok: true, value: ms };
  }
  const parsed = parseInstant(text, "utc");
  if (!parsed.ok) return parsed;
  if (parsed.value > MAX_CUSTOM_EPOCH_MS) return { ok: false, error: "Epochs up to 2100-01-01 only." };
  return parsed;
}

/** One candidate pulled out of the input, before range checking. */
export type Candidate = { source: string; digits: string } | { source: string; error: string };

const MENTION = /^<(?:@!?|@&|#)(\d+)>$/;
const EMOJI = /^<a?:[^:>]+:(\d+)>$/;
const FLOAT_ID = /^\d(?:\.\d+)?e\+?\d+$/i;

function shorten(token: string): string {
  return token.length > 48 ? `${token.slice(0, 45)}...` : token;
}

const LEADING_WRAP = new Set(['"', "'", "(", "["]);
const TRAILING_WRAP = new Set(['"', "'", ")", "]", "."]);

/**
 * Drop quotes, brackets and a trailing period around a token. A plain loop
 * rather than a regex: an alternation such as /["')\].]+$/g retries from
 * every position in a long run of those characters, which is quadratic and
 * froze the page for seconds on 100,000 periods.
 */
function stripWrapping(raw: string): string {
  let start = 0;
  let end = raw.length;
  while (start < end && LEADING_WRAP.has(raw[start])) start++;
  while (end > start && TRAILING_WRAP.has(raw[end - 1])) end--;
  return raw.slice(start, end);
}

/**
 * Pull every ID out of free text. Tokens split on whitespace, commas and
 * semicolons. A token is a bare number, a Discord mention or custom emoji
 * (<@id>, <#id>, <@&id>, <:name:id>), or a link, in which case every numeric
 * path segment of MIN_LINK_DIGITS or more is taken and the query string and
 * fragment are ignored. A Discord message link therefore yields its guild,
 * channel and message IDs.
 */
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    if (raw === "") continue;
    const token = stripWrapping(raw);
    if (token === "") continue;

    if (/^\d+$/.test(token)) {
      out.push({ source: token, digits: token });
      continue;
    }
    const mention = MENTION.exec(token) ?? EMOJI.exec(token);
    if (mention) {
      out.push({ source: token, digits: mention[1] });
      continue;
    }
    if (/^<t:-?\d+(?::[a-zA-Z])?>$/.test(token)) {
      out.push({
        source: shorten(token),
        error: "is a Discord timestamp tag, which holds Unix seconds rather than a snowflake.",
      });
      continue;
    }
    if (FLOAT_ID.test(token)) {
      out.push({
        source: token,
        error:
          "is in scientific notation, which means it passed through floating point (a spreadsheet or JavaScript). Only the first 15 to 17 digits survived, so the decoded time would be wrong. Copy the ID as text instead.",
      });
      continue;
    }
    if (token.includes("/")) {
      // Discord users wrap links in <...> to suppress the embed; without
      // dropping the > the last path segment, the message ID, is lost.
      const link = token.startsWith("<") && token.endsWith(">") ? token.slice(1, -1) : token;
      const path = link.split(/[?#]/)[0];
      const found = path.split("/").filter((seg) => /^\d+$/.test(seg) && seg.length >= MIN_LINK_DIGITS);
      if (found.length === 0) {
        out.push({ source: shorten(token), error: "is a link with no numeric ID in its path." });
      } else {
        for (const digits of found) out.push({ source: shorten(token), digits });
      }
      continue;
    }
    if (/^-\d+$/.test(token)) {
      out.push({
        source: token,
        error: "is negative. Snowflakes are positive, so a minus sign means the value was read as a signed integer somewhere, or it is not an ID.",
      });
      continue;
    }
    out.push({ source: shorten(token), error: "is not a number, a link, or a Discord mention." });
  }
  return out;
}

/** Range check one run of digits against the layout's width. */
export function parseIdDigits(digits: string, idBits: 63 | 64): Result<bigint> {
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  if (trimmed.length > MAX_ID_DIGITS) {
    return { ok: false, error: `has ${trimmed.length} digits. The largest 64 bit value has 20.` };
  }
  const id = BigInt(trimmed);
  const limit = 1n << BigInt(idBits);
  if (id >= limit) {
    return {
      ok: false,
      error:
        idBits === 63
          ? "is larger than 2^63 - 1. An X ID is a positive signed 64 bit integer, so its top bit is always zero."
          : "is larger than 2^64 - 1, so it does not fit in 64 bits.",
    };
  }
  return { ok: true, value: id };
}

/* -------------------------------------------------------------- decoding */

export interface Decoded {
  id: bigint;
  /** The timestamp field: milliseconds since the platform epoch. */
  offsetMs: number;
  /** offsetMs plus the epoch: Unix milliseconds. */
  unixMs: number;
  fieldA: number;
  fieldB: number;
  /** fieldA and fieldB together, the 10 bit machine ID. */
  machine: number;
  sequence: number;
}

export function decodeSnowflake(id: bigint, epochMs: number): Decoded {
  const offsetMs = Number(id >> TIMESTAMP_SHIFT);
  return {
    id,
    offsetMs,
    unixMs: epochMs + offsetMs,
    fieldA: Number((id >> 17n) & 0x1fn),
    fieldB: Number((id >> 12n) & 0x1fn),
    machine: Number((id >> 12n) & 0x3ffn),
    sequence: Number(id & 0xfffn),
  };
}

export interface BitField {
  key: "sign" | "time" | "a" | "b" | "seq";
  /** Highest and lowest bit numbers, inclusive. */
  high: number;
  low: number;
  bits: string;
}

/** The 64 bits split into the layout's fields, most significant first. */
export function bitFields(id: bigint, idBits: 63 | 64): BitField[] {
  const bin = id.toString(2).padStart(64, "0");
  const field = (key: BitField["key"], high: number, low: number): BitField => ({
    key,
    high,
    low,
    bits: bin.slice(63 - high, 64 - low),
  });
  const time = idBits === 63 ? [field("sign", 63, 63), field("time", 62, 22)] : [field("time", 63, 22)];
  return [...time, field("a", 21, 17), field("b", 16, 12), field("seq", 11, 0)];
}

export type Tone = "info" | "warn";

export interface Finding {
  tone: Tone;
  text: string;
}

/** Plausibility checks. None of them stop the decode; they say how far to trust it. */
export function reviewDecoded(d: Decoded, platform: PlatformId, nowMs: number): Finding[] {
  const findings: Finding[] = [];
  if (d.offsetMs < NEAR_EPOCH_MS) {
    findings.push({
      tone: "warn",
      text:
        platform === "x"
          ? "This decodes to less than a minute after the X epoch. That is the signature of a sequential ID from before Snowflake: posts from before November 2010 and accounts from the early years have small counter IDs that carry no timestamp at all."
          : "This decodes to less than a minute after the epoch. Real IDs are almost never this small, so check the epoch, or whether this is a plain counter rather than a snowflake.",
    });
  }
  if (d.unixMs > nowMs + 60_000) {
    findings.push({
      tone: "warn",
      text: `This decodes to a time in the future (${formatUtc(d.unixMs)}). Either the ID belongs to a different platform or epoch, or it is not a snowflake.`,
    });
  }
  if (platform === "custom" && d.id >> 63n === 1n) {
    findings.push({
      tone: "info",
      text: "The top bit is set. Twitter's original layout keeps it zero so the ID stays positive as a signed 64 bit integer; this decode reads it as the top timestamp bit, as Discord's documentation does.",
    });
  }
  return findings;
}

/* ----------------------------------------------------------------- batch */

export interface BatchRow {
  source: string;
  decoded: Decoded;
  /** Milliseconds since the previous row in time order; null for the first. */
  deltaMs: number | null;
  /** True when the same ID already appeared earlier in the sorted list. */
  duplicate: boolean;
}

export interface BatchError {
  source: string;
  error: string;
}

export type BatchOutcome =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; rows: BatchRow[]; errors: BatchError[]; truncated: number };

/**
 * Decode every ID in the input and sort by value. Because the timestamp is
 * the high bits, sorting the integers sorts by creation time, with ties in
 * the same millisecond broken by machine and then sequence.
 */
export function decodeBatch(text: string, idBits: 63 | 64, epochMs: number): BatchOutcome {
  if (text.length > MAX_INPUT_CHARS) {
    return {
      kind: "error",
      message: `The input is ${text.length.toLocaleString("en-US")} characters. The cap is ${MAX_INPUT_CHARS.toLocaleString("en-US")}, about ${MAX_BATCH.toLocaleString("en-US")} IDs with room for links.`,
    };
  }
  const candidates = extractCandidates(text);
  if (candidates.length === 0) return { kind: "empty" };

  const truncated = Math.max(0, candidates.length - MAX_BATCH);
  const decoded: { source: string; decoded: Decoded }[] = [];
  const errors: BatchError[] = [];
  for (const c of candidates.slice(0, MAX_BATCH)) {
    if ("error" in c) {
      errors.push(c);
      continue;
    }
    const parsed = parseIdDigits(c.digits, idBits);
    if (!parsed.ok) {
      errors.push({ source: c.source === c.digits ? shorten(c.digits) : `${shorten(c.digits)} in ${c.source}`, error: parsed.error });
      continue;
    }
    decoded.push({ source: c.source, decoded: decodeSnowflake(parsed.value, epochMs) });
  }

  decoded.sort((p, q) => (p.decoded.id < q.decoded.id ? -1 : p.decoded.id > q.decoded.id ? 1 : 0));
  const rows: BatchRow[] = decoded.map((entry, i) => {
    const prev = i > 0 ? decoded[i - 1].decoded : null;
    return {
      source: entry.source,
      decoded: entry.decoded,
      deltaMs: prev ? entry.decoded.unixMs - prev.unixMs : null,
      duplicate: prev !== null && prev.id === entry.decoded.id,
    };
  });
  return { kind: "ok", rows, errors, truncated };
}

/** RFC 4180 field quoting, plus a leading apostrophe on anything a spreadsheet would run as a formula. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function batchCsv(rows: BatchRow[], platform: Platform): string {
  const header = ["id", "utc", "unix_ms", "delta_ms", platform.fieldA, platform.fieldB, platform.sequence, "source"];
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) {
    const d = row.decoded;
    lines.push(
      [
        d.id.toString(),
        formatUtc(d.unixMs),
        String(d.unixMs),
        row.deltaMs === null ? "" : String(row.deltaMs),
        String(d.fieldA),
        String(d.fieldB),
        String(d.sequence),
        row.source,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\n");
}

/* --------------------------------------------------------------- reverse */

export interface IdRange {
  /** Smallest ID minted in the first millisecond: machine and sequence all zero. */
  min: bigint;
  /** Largest ID minted in the last millisecond: machine and sequence all ones. */
  max: bigint;
}

/**
 * The span of IDs a layout can mint between two instants, inclusive. The
 * smallest is (t - epoch) << 22 and the largest sets all 22 low bits.
 */
export function idRange(fromMs: number, toMs: number, epochMs: number, idBits: 63 | 64): Result<IdRange> {
  if (toMs < fromMs) return { ok: false, error: "The end is earlier than the start." };
  const limit = maxOffsetMs(idBits);
  if (fromMs < epochMs) {
    return { ok: false, error: `That is before the epoch, ${formatUtc(epochMs)}, so no ID can encode it.` };
  }
  if (toMs - epochMs > limit) {
    return {
      ok: false,
      error: `That is after ${formatUtc(epochMs + limit)}, the last millisecond a ${idBits - 22} bit timestamp field can hold.`,
    };
  }
  const min = BigInt(fromMs - epochMs) << TIMESTAMP_SHIFT;
  const max = (BigInt(toMs - epochMs) << TIMESTAMP_SHIFT) | LOW_MASK;
  return { ok: true, value: { min, max } };
}
