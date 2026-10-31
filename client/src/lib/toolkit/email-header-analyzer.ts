/**
 * Raw email header analysis.
 *
 * Field syntax and unfolding follow RFC 5322 sections 2.2 and 2.2.3, dates
 * section 3.3 with the obsolete forms of section 4.3, and Received lines the
 * trace grammar of RFC 5321 section 4.4. Authentication-Results is RFC 8601,
 * encoded-words are RFC 2047, and the alignment checks follow DMARC (RFC
 * 7489 section 3.1). Received lines in the wild only loosely follow their
 * grammar, so that parser reads keywords outside comments and pulls
 * addresses and host names out of whatever text sits between them.
 *
 * Everything here is pure: no DOM, no network, no clock.
 */

import { keyQueryName, parseTagList } from "./dkim-record-analyzer";

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type Outcome<T> =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: T };

/** Longest paste read, in characters. Real header sections are a few to a few tens of KB. */
export const MAX_HEADER_INPUT = 262_144;
/** Most header fields read. */
export const MAX_FIELDS = 1000;
/** Most Received hops analyzed. */
export const MAX_HOPS = 100;
/** Comment nesting deeper than this is treated as flat. */
export const MAX_COMMENT_DEPTH = 32;
/** A gap between consecutive hops longer than this is reported. */
export const LONG_DELAY_SECONDS = 300;
/** A hop stamped earlier than its predecessor by more than this is reported. */
export const CLOCK_SKEW_SECONDS = 60;
/** How far the Date field may run ahead of the first Received stamp before it is reported. */
export const DATE_AHEAD_SECONDS = 15 * 60;
/** How far the Date field may trail the first Received stamp before it is reported. */
export const DATE_BEHIND_SECONDS = 24 * 3600;

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/* ------------------------------------------------------------- splitting */

export interface HeaderField {
  name: string;
  /** Unfolded value with surrounding whitespace trimmed. */
  value: string;
  /** 1-based line where the field starts. */
  line: number;
}

export interface SplitHeaders {
  fields: HeaderField[];
  /** Lines after the blank line that ends the header section. */
  bodyLinesIgnored: number;
  /** Lines that had no field name and no leading whitespace. */
  strays: { line: number; attachedTo: string | null }[];
  truncated: boolean;
  mboxLine: string | null;
}

const FIELD_LINE = /^([\x21-\x39\x3b-\x7e]+)[ \t]*:(.*)$/;

/**
 * RFC 5322 section 2.2.3: unfolding removes each CRLF that is immediately
 * followed by whitespace, and keeps the whitespace. The header section ends
 * at the first empty line (section 2.1).
 */
export function splitHeaders(raw: string): SplitHeaders {
  let text = raw;
  let truncated = false;
  if (text.length > MAX_HEADER_INPUT) {
    text = text.slice(0, MAX_HEADER_INPUT);
    truncated = true;
  }
  let lines = text.replace(/\r\n|\r/g, "\n").split("\n");

  // A paste copied out of an indented block arrives with every line shifted
  // right. Remove the indent all non-empty lines share, keeping folds relative.
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length && nonEmpty.every((l) => /^[ \t]/.test(l))) {
    const indent = Math.min(...nonEmpty.map((l) => (/^[ \t]*/.exec(l) as RegExpExecArray)[0].length));
    lines = lines.map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)));
  }

  const fields: HeaderField[] = [];
  const strays: SplitHeaders["strays"] = [];
  let mboxLine: string | null = null;
  let bodyLinesIgnored = 0;
  let started = false;
  const cur = { name: null as string | null, parts: [] as string[], line: 0 };

  const flush = () => {
    if (cur.name === null) return;
    fields.push({ name: cur.name, value: cur.parts.join("").trim(), line: cur.line });
    cur.name = null;
    cur.parts = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!started) {
      if (line.trim() === "") continue;
      started = true;
      // An mbox separator line, "From sender date", has no colon after From.
      if (/^From /.test(line) && !FIELD_LINE.test(line)) {
        mboxLine = line;
        continue;
      }
    }
    if (line.trim() === "") {
      bodyLinesIgnored = lines.slice(i + 1).filter((l) => l.trim() !== "").length;
      break;
    }
    if (/^[ \t]/.test(line)) {
      if (cur.name !== null) cur.parts.push(line);
      else strays.push({ line: i + 1, attachedTo: null });
      continue;
    }
    const m = FIELD_LINE.exec(line);
    if (m) {
      flush();
      if (fields.length >= MAX_FIELDS) {
        truncated = true;
        break;
      }
      cur.name = m[1];
      cur.parts = [m[2]];
      cur.line = i + 1;
      continue;
    }
    // A line with neither a name nor leading whitespace is most often a fold
    // whose indent was lost in the copy. Keep it with the field above.
    strays.push({ line: i + 1, attachedTo: cur.name });
    if (cur.name !== null) cur.parts.push(" " + line);
  }
  flush();
  return { fields, bodyLinesIgnored, strays, truncated, mboxLine };
}

/* -------------------------------------------------------------- comments */

/**
 * Removes RFC 5322 comments (parenthesized, nestable, with backslash
 * escapes) from structured text, leaving quoted strings alone.
 */
export function stripComments(text: string): { text: string; comments: string[] } {
  let out = "";
  const comments: string[] = [];
  let depth = 0;
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (depth === 0) {
      if (inQuote) {
        out += c;
        if (c === "\\" && i + 1 < text.length) out += text[++i];
        else if (c === '"') inQuote = false;
        continue;
      }
      if (c === '"') {
        inQuote = true;
        out += c;
        continue;
      }
      if (c === "(") {
        depth = 1;
        buf = "";
        out += " ";
        continue;
      }
      out += c;
      continue;
    }
    if (c === "\\" && i + 1 < text.length) {
      buf += text[++i];
      continue;
    }
    if (c === "(") {
      if (depth < MAX_COMMENT_DEPTH) depth++;
      buf += c;
      continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) comments.push(buf.trim());
      else buf += c;
      continue;
    }
    buf += c;
  }
  if (depth > 0 && buf.trim() !== "") comments.push(buf.trim());
  return { text: out.replace(/\s+/g, " ").trim(), comments };
}

/* ----------------------------------------------------------------- dates */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** RFC 5322 section 4.3 obsolete zone names. Military letters mean nothing reliable. */
const NAMED_ZONES: Record<string, number> = {
  ut: 0,
  utc: 0,
  gmt: 0,
  z: 0,
  est: -300,
  edt: -240,
  cst: -360,
  cdt: -300,
  mst: -420,
  mdt: -360,
  pst: -480,
  pdt: -420,
};

export interface ParsedDate {
  /** Milliseconds since the epoch, UTC. */
  ms: number;
  /** Offset from UTC in minutes, as written. */
  offsetMinutes: number;
  /** False for -0000, a military letter, or no zone at all. */
  zoneKnown: boolean;
  /** Problems that did not stop the parse. */
  notes: string[];
}

/**
 * Parses an RFC 5322 date-time, including the obsolete two and three digit
 * years and named zones of section 4.3, without Date.parse, whose handling
 * of these forms differs between browsers.
 */
export function parseRfc5322Date(input: string): Result<ParsedDate> {
  let s = stripComments(input).text.replace(/\s+/g, " ").trim();
  if (s === "") return fail("there is no date");
  if (s.length > 200) return fail("the date text is implausibly long");
  const notes: string[] = [];

  let dow: number | null = null;
  const dowMatch = /^([A-Za-z]{3})[A-Za-z]*\s*,?\s*/.exec(s);
  if (dowMatch && DAYS.includes(dowMatch[1].toLowerCase())) {
    dow = DAYS.indexOf(dowMatch[1].toLowerCase());
    s = s.slice(dowMatch[0].length);
  }

  const m = /^(\d{1,2})\s*[ -]\s*([A-Za-z]{3,9})\s*[ -]\s*(\d{2,4})\s+(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?\s*(.*)$/.exec(s);
  if (!m) return fail(`"${clip(input.trim(), 40)}" is not in the day month year hh:mm:ss zone form`);

  const day = Number(m[1]);
  const monthName = m[2].toLowerCase();
  const month = MONTHS.indexOf(monthName.slice(0, 3));
  if (month < 0 || (monthName.length > 3 && !"january february march april may june july august september october november december".split(" ").includes(monthName))) {
    return fail(`"${m[2]}" is not a month`);
  }
  let year = Number(m[3]);
  if (m[3].length === 2) {
    year += year < 50 ? 2000 : 1900;
    notes.push("two digit year, read as RFC 5322 section 4.3 directs");
  } else if (m[3].length === 3) {
    year += 1900;
    notes.push("three digit year, read as RFC 5322 section 4.3 directs");
  }
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = m[6] === undefined ? 0 : Number(m[6]);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return fail(`day ${day} does not exist in ${MONTHS[month]} ${year}`);
  if (hour > 23 || minute > 59 || second > 60) return fail(`${m[4]}:${m[5]}${m[6] ? ":" + m[6] : ""} is not a valid time`);

  const zone = m[7].trim();
  let offset = 0;
  let zoneKnown = true;
  const numeric = /^([+-])(\d{2})(\d{2})$/.exec(zone);
  if (numeric) {
    const mins = Number(numeric[2]) * 60 + Number(numeric[3]);
    if (Number(numeric[3]) > 59) return fail(`zone ${zone} has more than 59 minutes`);
    offset = numeric[1] === "-" ? -mins : mins;
    // RFC 5322 section 3.3: -0000 says the time is UTC and the local zone is unknown.
    if (zone === "-0000") zoneKnown = false;
  } else if (zone === "") {
    zoneKnown = false;
    notes.push("no time zone, read as UTC");
  } else if (NAMED_ZONES[zone.toLowerCase()] !== undefined) {
    offset = NAMED_ZONES[zone.toLowerCase()];
  } else if (/^[A-IK-Za-ik-z]$/.test(zone)) {
    zoneKnown = false;
    notes.push(`military zone ${zone}, treated as -0000 per RFC 5322 section 4.3`);
  } else {
    return fail(`"${clip(zone, 16)}" is not a time zone`);
  }

  const ms = Date.UTC(year, month, day, hour, minute, second) - offset * 60_000;
  if (dow !== null) {
    const actual = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (actual !== dow) notes.push(`the day name says ${DAYS[dow]}, but that date was a ${DAYS[actual]}`);
  }
  return ok({ ms, offsetMinutes: offset, zoneKnown, notes });
}

/* ------------------------------------------------------------ addresses */

export type IpKind =
  | "public"
  | "private"
  | "shared"
  | "unique-local"
  | "loopback"
  | "link-local"
  | "documentation"
  | "multicast"
  | "unspecified"
  | "reserved";

export interface IpInfo {
  address: string;
  version: 4 | 6;
  kind: IpKind;
}

export function parseIPv4(text: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (!m) return null;
  let v = 0;
  for (let i = 1; i <= 4; i++) {
    const part = m[i];
    if (part.length > 1 && part[0] === "0") return null;
    const n = Number(part);
    if (n > 255) return null;
    v = v * 256 + n;
  }
  return v;
}

/** RFC 4291 section 2.2 text forms, including :: and a trailing dotted quad. */
export function parseIPv6(text: string): bigint | null {
  let s = text.replace(/^\[|\]$/g, "").replace(/^IPv6:/i, "");
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct);
  if (s.length < 2 || s.length > 45 || !/^[0-9A-Fa-f:.]+$/.test(s)) return null;
  if (s.includes(".")) {
    const last = s.lastIndexOf(":");
    const v4 = parseIPv4(s.slice(last + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, last + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  const count = head.length + tail.length;
  if (halves.length === 1 && count !== 8) return null;
  if (halves.length === 2 && count > 7) return null;
  const groups = [...head, ...Array<string>(8 - count).fill("0"), ...tail];
  let v = 0n;
  for (const g of groups) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) return null;
    v = (v << 16n) | BigInt(parseInt(g, 16));
  }
  return v;
}

function inV4(v: number, base: string, prefix: number): boolean {
  const b = parseIPv4(base) as number;
  const size = 2 ** (32 - prefix);
  return Math.floor(v / size) === Math.floor(b / size);
}

/** IANA special-purpose registries (RFC 6890 and successors), the ranges that matter in a mail path. */
export function classifyIPv4(v: number): IpKind {
  if (v === 0) return "unspecified";
  if (inV4(v, "0.0.0.0", 8)) return "reserved";
  if (inV4(v, "10.0.0.0", 8) || inV4(v, "172.16.0.0", 12) || inV4(v, "192.168.0.0", 16)) return "private";
  if (inV4(v, "100.64.0.0", 10)) return "shared";
  if (inV4(v, "127.0.0.0", 8)) return "loopback";
  if (inV4(v, "169.254.0.0", 16)) return "link-local";
  if (inV4(v, "192.0.2.0", 24) || inV4(v, "198.51.100.0", 24) || inV4(v, "203.0.113.0", 24)) return "documentation";
  if (inV4(v, "192.0.0.0", 24) || inV4(v, "198.18.0.0", 15) || inV4(v, "240.0.0.0", 4)) return "reserved";
  if (inV4(v, "224.0.0.0", 4)) return "multicast";
  return "public";
}

function inV6(v: bigint, base: string, prefix: number): boolean {
  const b = parseIPv6(base) as bigint;
  const shift = BigInt(128 - prefix);
  return v >> shift === b >> shift;
}

export function classifyIPv6(v: bigint): IpKind {
  if (v === 0n) return "unspecified";
  if (v === 1n) return "loopback";
  if (inV6(v, "::ffff:0:0", 96)) return classifyIPv4(Number(v & 0xffffffffn));
  if (inV6(v, "fe80::", 10)) return "link-local";
  if (inV6(v, "fc00::", 7)) return "unique-local";
  if (inV6(v, "ff00::", 8)) return "multicast";
  if (inV6(v, "2001:db8::", 32) || inV6(v, "3fff::", 20)) return "documentation";
  if (inV6(v, "100::", 64)) return "reserved";
  if (inV6(v, "2000::", 3)) return "public";
  return "reserved";
}

export function classifyIp(text: string): IpInfo | null {
  const t = text.trim().replace(/^\[|\]$/g, "");
  const v4 = parseIPv4(t);
  if (v4 !== null) return { address: t, version: 4, kind: classifyIPv4(v4) };
  const v6 = parseIPv6(t);
  if (v6 !== null) return { address: t.replace(/^IPv6:/i, "").toLowerCase(), version: 6, kind: classifyIPv6(v6) };
  return null;
}

/** Private, carrier-grade shared, or IPv6 unique local: addresses that never route on the internet. */
export function isInternal(kind: IpKind): boolean {
  return kind === "private" || kind === "shared" || kind === "unique-local";
}

/**
 * Every IPv4 and IPv6 address in a stretch of text. Candidate runs are found
 * in one linear pass and then validated, so no regular expression can
 * backtrack over a long hostile line.
 */
export function extractIps(text: string): IpInfo[] {
  const src = text.replace(/IPv6:/gi, "IPv6 ");
  const found: IpInfo[] = [];
  const seen = new Set<string>();
  const run = /[0-9A-Fa-f:.]+/g;
  let m: RegExpExecArray | null;
  while ((m = run.exec(src)) !== null) {
    let token = m[0];
    const before = src[m.index - 1] ?? " ";
    const after = src[m.index + token.length] ?? " ";
    if (/[G-Zg-z_-]/.test(before) || /[G-Zg-z_-]/.test(after)) continue;
    token = token.replace(/\.+$/, "").replace(/^:(?!:)/, "");
    if (token.length < 3) continue;
    const colons = (token.match(/:/g) ?? []).length;
    let info: IpInfo | null = null;
    if (colons >= 2) info = classifyIp(token);
    else if (colons === 0 && /^\d+\.\d+\.\d+\.\d+$/.test(token)) info = classifyIp(token);
    else if (colons === 1 && /^\d+\.\d+\.\d+\.\d+:\d{1,5}$/.test(token)) info = classifyIp(token.split(":")[0]);
    if (info && !seen.has(info.address)) {
      seen.add(info.address);
      found.push(info);
    }
  }
  return found;
}

const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** Host names (two or more labels with an alphabetic top label) in a stretch of text. */
export function extractHostnames(text: string): string[] {
  const out: string[] = [];
  const run = /[A-Za-z0-9.-]+/g;
  let m: RegExpExecArray | null;
  while ((m = run.exec(text)) !== null) {
    const before = text[m.index - 1] ?? " ";
    const after = text[m.index + m[0].length] ?? " ";
    // Either side of an @ is a mailbox, not a host on the path.
    if (before === "@" || before === "_" || after === "@" || after === "_") continue;
    const name = m[0].replace(/^[.-]+|[.-]+$/g, "").toLowerCase();
    if (name === "localhost" && !out.includes(name)) {
      out.push(name);
      continue;
    }
    const labels = name.split(".");
    if (labels.length < 2 || name.length > 253) continue;
    if (!labels.every((l) => LABEL.test(l))) continue;
    const top = labels[labels.length - 1];
    if (!/^[a-z][a-z0-9-]*$/.test(top) || top.length < 2) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/* -------------------------------------------------------------- Received */

export interface ReceivedHop {
  /** 1 is the first server, the bottom Received line. */
  index: number;
  raw: string;
  fromName: string | null;
  fromComment: string | null;
  byName: string | null;
  protocol: string | null;
  id: string | null;
  recipient: string | null;
  fromIps: IpInfo[];
  byIps: IpInfo[];
  fromHosts: string[];
  tls: boolean | null;
  dateText: string | null;
  time: number | null;
  dateError: string | null;
  /** Seconds since the nearest earlier hop with a timestamp. */
  delay: number | null;
}

const RECEIVED_KEYWORDS = new Set(["from", "by", "via", "with", "id", "for"]);

/** Index of the last semicolon outside comments and quotes, or -1. */
export function lastTopLevelSemicolon(text: string): number {
  let depth = 0;
  let inQuote = false;
  let last = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inQuote) {
      if (c === '"') inQuote = false;
      continue;
    }
    if (c === '"' && depth === 0) inQuote = true;
    else if (c === "(") depth = Math.min(depth + 1, MAX_COMMENT_DEPTH);
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) last = i;
  }
  return last;
}

/** Splits the part of a Received value before the date into its keyword clauses. */
export function receivedClauses(text: string): Map<string, string> {
  const marks: { key: string; start: number; valueStart: number }[] = [];
  let depth = 0;
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "(") {
      depth = Math.min(depth + 1, MAX_COMMENT_DEPTH);
      i++;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (depth === 0 && /[A-Za-z]/.test(c) && (i === 0 || /[\s)]/.test(text[i - 1]))) {
      let j = i;
      while (j < text.length && /[A-Za-z]/.test(text[j])) j++;
      const word = text.slice(i, j).toLowerCase();
      if (RECEIVED_KEYWORDS.has(word) && (j === text.length || /[\s(]/.test(text[j]))) {
        marks.push({ key: word, start: i, valueStart: j });
      }
      i = j;
      continue;
    }
    i++;
  }
  const clauses = new Map<string, string>();
  marks.forEach((mark, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].start : text.length;
    if (!clauses.has(mark.key)) clauses.set(mark.key, text.slice(mark.valueStart, end).trim());
  });
  return clauses;
}

function firstToken(clause: string): string | null {
  const bare = stripComments(clause).text;
  const token = bare.split(/\s+/)[0];
  return token ? token : null;
}

/**
 * Whether a hop used TLS. RFC 3848 and RFC 6531 protocol names carry an S
 * for STARTTLS and an A for SMTP AUTH (ESMTPS, ESMTPSA, UTF8SMTPS), and
 * many servers also note the TLS version or cipher in a comment.
 */
export function hopUsedTls(protocol: string | null, text: string): boolean | null {
  if (/\bTLS(?:v?1[._]?\d)?\b|version=TLS|using TLS|cipher=/i.test(text)) return true;
  if (!protocol) return null;
  const p = protocol.toUpperCase();
  const m = /^(?:UTF8)?(?:E?SMTP|LMTP)(S?)(A?)$/.exec(p);
  if (m) return m[1] === "S";
  if (p === "HTTPS") return true;
  if (p === "HTTP") return false;
  return null;
}

/** Parses one Received field value (without the field name). */
export function parseReceived(value: string): Omit<ReceivedHop, "index" | "delay"> {
  const semi = lastTopLevelSemicolon(value);
  const head = semi >= 0 ? value.slice(0, semi) : value;
  const dateText = semi >= 0 ? value.slice(semi + 1).trim() || null : null;
  const clauses = receivedClauses(head);
  const from = clauses.get("from") ?? null;
  const by = clauses.get("by") ?? null;
  const withClause = clauses.get("with") ?? null;

  let time: number | null = null;
  let dateError: string | null = null;
  if (dateText) {
    const parsed = parseRfc5322Date(dateText);
    if (parsed.ok) time = parsed.value.ms;
    else dateError = parsed.error;
  } else {
    dateError = "there is no semicolon and date at the end of the line";
  }

  const fromComment = from ? stripComments(from).comments.join("; ") || null : null;
  const fromName = from ? firstToken(from) : null;
  const fromHosts = from ? extractHostnames(from) : [];
  const protocol = withClause ? firstToken(withClause) : null;
  const idClause = clauses.get("id");
  const forClause = clauses.get("for");

  return {
    raw: value,
    fromName,
    fromComment,
    byName: by ? firstToken(by) : null,
    protocol,
    id: idClause ? firstToken(idClause) : null,
    recipient: forClause ? stripComments(forClause).text || null : null,
    fromIps: from ? extractIps(from) : [],
    byIps: by ? extractIps(by) : [],
    fromHosts,
    tls: hopUsedTls(protocol, `${from ?? ""} ${withClause ?? ""}`),
    dateText,
    time,
    dateError,
  };
}

/** Received fields are prepended, so the chronological order is bottom to top. */
export function buildHops(values: string[]): ReceivedHop[] {
  const ordered = [...values].reverse().slice(0, MAX_HOPS);
  const hops: ReceivedHop[] = [];
  let lastTime: number | null = null;
  ordered.forEach((v, i) => {
    const parsed = parseReceived(v);
    const delay = parsed.time !== null && lastTime !== null ? Math.round((parsed.time - lastTime) / 1000) : null;
    if (parsed.time !== null) lastTime = parsed.time;
    hops.push({ ...parsed, index: i + 1, delay });
  });
  return hops;
}

/* ----------------------------------------------- Authentication-Results */

export interface AuthResult {
  method: string;
  result: string;
  reason: string | null;
  props: { key: string; value: string }[];
  comments: string[];
}

export interface AuthResultsField {
  field: string;
  authservId: string | null;
  results: AuthResult[];
  /** True for the explicit "none" result: nothing was checked. */
  none: boolean;
  arcInstance: number | null;
}

type AuthToken = { t: "word" | "quoted" | "eq"; v: string };

function tokenizeAuth(value: string): { segments: AuthToken[][]; comments: string[][] } {
  const segments: AuthToken[][] = [[]];
  const comments: string[][] = [[]];
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    const seg = segments.length - 1;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === ";") {
      segments.push([]);
      comments.push([]);
      i++;
      continue;
    }
    if (c === "=") {
      segments[seg].push({ t: "eq", v: "=" });
      i++;
      continue;
    }
    if (c === "(") {
      let depth = 0;
      let buf = "";
      for (; i < value.length; i++) {
        const d = value[i];
        if (d === "\\" && i + 1 < value.length) {
          buf += value[++i];
          continue;
        }
        if (d === "(") {
          depth = Math.min(depth + 1, MAX_COMMENT_DEPTH);
          if (depth === 1) continue;
        } else if (d === ")") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        buf += d;
      }
      comments[seg].push(buf.trim());
      continue;
    }
    if (c === '"') {
      let buf = "";
      i++;
      while (i < value.length && value[i] !== '"') {
        if (value[i] === "\\" && i + 1 < value.length) i++;
        buf += value[i++];
      }
      i++;
      segments[seg].push({ t: "quoted", v: buf });
      continue;
    }
    let j = i;
    while (j < value.length && !/[\s=;"()]/.test(value[j])) j++;
    segments[seg].push({ t: "word", v: value.slice(i, j) });
    i = j;
  }
  return { segments, comments };
}

/** RFC 8601 section 2.2. Also reads Microsoft's form, which omits the authserv-id. */
export function parseAuthResults(value: string, field = "Authentication-Results"): AuthResultsField {
  const { segments, comments } = tokenizeAuth(value);
  let start = 0;
  let arcInstance: number | null = null;
  if (/^arc-/i.test(field) && segments[0]?.length === 3 && segments[0][0].v.toLowerCase() === "i" && segments[0][1].t === "eq") {
    arcInstance = Number(segments[0][2].v) || null;
    start = 1;
  }
  let authservId: string | null = null;
  const first = segments[start] ?? [];
  if (!first.some((t) => t.t === "eq")) {
    authservId = first[0]?.v ?? null;
    start += 1;
  }

  const results: AuthResult[] = [];
  let none = false;
  for (let s = start; s < segments.length; s++) {
    const toks = segments[s];
    if (toks.length === 0) continue;
    if (toks.length === 1 && toks[0].v.toLowerCase() === "none") {
      none = true;
      continue;
    }
    if (toks.length < 3 || toks[1].t !== "eq") continue;
    const method = toks[0].v.toLowerCase().replace(/\/\d+$/, "");
    const result = toks[2].v.toLowerCase();
    const props: AuthResult["props"] = [];
    let reason: string | null = null;
    let k = 3;
    while (k + 2 < toks.length) {
      const key = toks[k];
      const eq = toks[k + 1];
      const val = toks[k + 2];
      if (key.t !== "word" || eq.t !== "eq" || val.t === "eq") {
        k += 1;
        continue;
      }
      if (key.v.toLowerCase() === "reason") reason = val.v;
      else props.push({ key: key.v.toLowerCase(), value: val.v });
      k += 3;
    }
    results.push({ method, result, reason, props, comments: comments[s] ?? [] });
  }
  return { field, authservId, results, none, arcInstance };
}

export function prop(result: AuthResult, key: string): string | null {
  return result.props.find((p) => p.key === key)?.value ?? null;
}

/** The identity a result speaks for, as a reader would want to see it. */
export function authIdentity(r: AuthResult): string | null {
  if (r.method === "spf") return prop(r, "smtp.mailfrom") ?? prop(r, "smtp.helo");
  if (r.method === "dkim") return prop(r, "header.d") ?? prop(r, "header.i");
  if (r.method === "dmarc") return prop(r, "header.from");
  return r.props[0] ? `${r.props[0].key}=${r.props[0].value}` : null;
}

export function domainOf(identity: string | null): string | null {
  if (!identity) return null;
  const at = identity.lastIndexOf("@");
  const d = (at >= 0 ? identity.slice(at + 1) : identity).trim().replace(/[>.\s]+$/, "").toLowerCase();
  return d === "" ? null : d;
}

export interface ReceivedSpf {
  result: string;
  comment: string | null;
  pairs: Record<string, string>;
}

/** RFC 7208 section 9.1. */
export function parseReceivedSpf(value: string): ReceivedSpf {
  const { text, comments } = stripComments(value);
  const result = (text.split(/\s+/)[0] ?? "").toLowerCase();
  const pairs: Record<string, string> = {};
  const re = /([A-Za-z-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) pairs[m[1].toLowerCase()] = m[2].replace(/^"|"$/g, "");
  return { result, comment: comments[0] ?? null, pairs };
}

/* ------------------------------------------------------- encoded-words */

export interface DecodedText {
  text: string;
  hadEncodedWords: boolean;
  errors: string[];
  charsets: string[];
}

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
/** Most encoded-words decoded in one value. */
export const MAX_ENCODED_WORDS = 500;

function b64Bytes(text: string): number[] | null {
  const body = text.replace(/=+$/, "");
  if (!/^[A-Za-z0-9+/]*$/.test(body) || body.length % 4 === 1) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of body) {
    acc = (acc << 6) | alphabet.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

/** RFC 2047 section 4.2: underscore is a space, =XX is a byte. */
function qBytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "_") out.push(0x20);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      out.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(c.charCodeAt(0) & 0xff);
  }
  return out;
}

function decodeBytes(bytes: number[], charset: string): Result<string> {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    return fail(`the charset ${charset} is not one this browser can decode`);
  }
  try {
    return ok(new TextDecoder(charset, { fatal: true }).decode(new Uint8Array(bytes)));
  } catch {
    return ok(decoder.decode(new Uint8Array(bytes)));
  }
}

/**
 * Decodes RFC 2047 encoded-words. Whitespace between two adjacent words is
 * dropped (section 6.2), and consecutive words in one charset are joined at
 * the byte level first, because senders routinely split a multibyte
 * character across two words even though section 5 forbids it.
 */
export function decodeEncodedWords(value: string): DecodedText {
  const errors: string[] = [];
  const charsets: string[] = [];
  const matches = [...value.matchAll(ENCODED_WORD)].slice(0, MAX_ENCODED_WORDS);
  if (matches.length === 0) return { text: value, hadEncodedWords: false, errors, charsets };

  let out = "";
  let cursor = 0;
  let pending: { charset: string; bytes: number[]; raw: string } | null = null;

  const flush = () => {
    if (!pending) return;
    const decoded = decodeBytes(pending.bytes, pending.charset);
    if (decoded.ok) out += decoded.value;
    else {
      errors.push(decoded.error);
      out += pending.raw;
    }
    pending = null;
  };

  for (const m of matches) {
    const start = m.index ?? 0;
    const gap = value.slice(cursor, start);
    const adjacent = pending !== null && /^[ \t\r\n]*$/.test(gap);
    if (!adjacent) {
      flush();
      out += gap;
    }
    const charset = m[1].split("*")[0].toLowerCase();
    if (!charsets.includes(charset)) charsets.push(charset);
    const encoding = m[2].toUpperCase();
    const bytes = encoding === "B" ? b64Bytes(m[3]) : qBytes(m[3]);
    if (bytes === null) {
      flush();
      errors.push(`"${clip(m[0], 32)}" is not valid base64, so it was left as is`);
      out += m[0];
    } else if (pending && (pending as { charset: string }).charset === charset) {
      (pending as { bytes: number[]; raw: string }).bytes.push(...bytes);
      (pending as { raw: string }).raw += m[0];
    } else {
      flush();
      pending = { charset, bytes, raw: m[0] };
    }
    cursor = start + m[0].length;
  }
  flush();
  out += value.slice(cursor);
  return { text: out, hadEncodedWords: true, errors, charsets };
}

/* --------------------------------------------------------------- mailboxes */

export interface Mailbox {
  display: string | null;
  address: string | null;
  domain: string | null;
  /** True for Return-Path: <>, the null reverse path. */
  nullPath: boolean;
}

function splitTopLevel(value: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let angle = false;
  let inQuote = false;
  let buf = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && i + 1 < value.length) {
      buf += c + value[++i];
      continue;
    }
    if (inQuote) {
      if (c === '"') inQuote = false;
      buf += c;
      continue;
    }
    if (c === '"' && depth === 0) inQuote = true;
    else if (c === "(") depth = Math.min(depth + 1, MAX_COMMENT_DEPTH);
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "<" && depth === 0) angle = true;
    else if (c === ">" && depth === 0) angle = false;
    else if (c === sep && depth === 0 && !angle) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(.)/g, "$1");
  return t;
}

/** RFC 5322 section 3.4 address lists, including group syntax and the obsolete route. */
export function parseAddressList(value: string): Mailbox[] {
  const out: Mailbox[] = [];
  let body = value.trim();
  if (body === "<>") return [{ display: null, address: "", domain: null, nullPath: true }];
  // group = display-name ":" [group-list] ";" (RFC 5322 section 3.4), as in undisclosed-recipients:;
  const group = /^[^"<>@,:;()]*:([\s\S]*?);?\s*$/.exec(body);
  if (group) body = group[1];
  for (let part of splitTopLevel(body, ",").slice(0, 200)) {
    part = part.trim();
    if (part === "") continue;
    const lt = part.lastIndexOf("<");
    const gt = part.lastIndexOf(">");
    let address: string;
    let display: string | null;
    if (lt >= 0 && gt > lt) {
      address = part.slice(lt + 1, gt).trim().replace(/^(?:@[^,:]+,?)+:/, "");
      display = stripComments(part.slice(0, lt)).text;
      display = display ? unquote(display) : null;
      if (address === "") {
        out.push({ display, address: "", domain: null, nullPath: true });
        continue;
      }
    } else {
      const stripped = stripComments(part);
      address = stripped.text;
      display = stripped.comments[0] ? stripped.comments[0] : null;
    }
    const at = address.lastIndexOf("@");
    const domain = at >= 0 ? address.slice(at + 1).replace(/\.$/, "").toLowerCase() || null : null;
    out.push({ display: display ? decodeEncodedWords(display).text : null, address, domain, nullPath: false });
  }
  return out;
}

/**
 * Common multi-label public suffixes. DMARC's organizational domain needs
 * the full Public Suffix List; this short list covers the suffixes seen
 * most in mail and is a stated approximation, not the real thing.
 */
const MULTI_LABEL_SUFFIXES = new Set(
  (
    "co.uk org.uk ac.uk gov.uk ltd.uk plc.uk me.uk net.uk sch.uk nhs.uk " +
    "com.au net.au org.au edu.au gov.au asn.au id.au co.nz org.nz net.nz govt.nz ac.nz " +
    "co.jp ne.jp or.jp ac.jp go.jp ad.jp co.kr or.kr ac.kr go.kr " +
    "com.br net.br org.br gov.br com.mx org.mx gob.mx com.ar com.co com.pe com.ve " +
    "co.in net.in org.in gov.in ac.in co.za org.za gov.za ac.za " +
    "com.cn net.cn org.cn gov.cn edu.cn com.hk org.hk com.tw org.tw com.sg org.sg edu.sg " +
    "com.my com.ph com.vn co.id co.th ac.th com.tr gov.tr com.ua com.pl co.il ac.il org.il " +
    "com.eg com.sa com.pk com.ng com.bd"
  ).split(" "),
);

export function organizationalDomain(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/** DMARC relaxed alignment: the organizational domains match (RFC 7489 section 3.1). */
export function relaxedAligned(a: string | null, b: string | null): boolean {
  return !!a && !!b && organizationalDomain(a) === organizationalDomain(b);
}

/* -------------------------------------------------------- suspicious text */

const BIDI = /[‎‏‪-‮⁦-⁩]/;
const INVISIBLE = /[­​-‍⁠﻿]/;

/** A word that mixes Latin letters with Cyrillic or Greek ones, the usual homoglyph trick. */
export function mixedScriptWord(text: string): string | null {
  for (const word of text.split(/[\s,.;:!?"'()<>@[\]/\\|]+/)) {
    if (word.length < 2) continue;
    if (/\p{Script=Latin}/u.test(word) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word)) return word;
  }
  return null;
}

export function hiddenCharacters(text: string): string[] {
  const found: string[] = [];
  if (BIDI.test(text)) found.push("bidirectional control characters");
  if (INVISIBLE.test(text)) found.push("zero width or invisible characters");
  return found;
}

/* ---------------------------------------------------------- X- headers */

const X_HEADER_NOTES: Record<string, string> = {
  "x-mailer": "Software the sender says composed the message. Set by the client and trivially changed.",
  "user-agent": "Software the sender says composed the message. Set by the client and trivially changed.",
  "x-originating-ip": "Client address recorded by some webmail and Exchange servers, often the sender's own public address.",
  "x-spam-status": "SpamAssassin verdict: Yes or No, the score, the threshold and the rules that fired.",
  "x-spam-score": "Numeric spam score from a receiving filter. The scale depends on the filter.",
  "x-spam-flag": "YES when a SpamAssassin style filter classed the message as spam.",
  "x-spam-level": "The spam score drawn as a row of asterisks, one per point.",
  "x-ms-exchange-organization-scl": "Microsoft spam confidence level: -1 skipped filtering, 0 or 1 not spam, 5 and above spam.",
  "x-forefront-antispam-report": "Microsoft 365 filter results as KEY:value pairs. CIP is the connecting IP, CTRY its country, SCL the spam confidence level, SFV the verdict.",
  "x-microsoft-antispam": "Microsoft filter data, including the bulk complaint level (BCL).",
  "x-ms-exchange-organization-authas": "How Exchange classed the sender: Anonymous for unauthenticated mail from outside, Internal for an authenticated sender in the organization.",
  "x-google-smtp-source": "Opaque token added by Gmail's outbound servers.",
  "x-gm-message-state": "Opaque Gmail state value.",
  "x-received": "A trace line in Received format that Google writes under another name. It is not counted as a hop here.",
  "x-ses-outgoing": "Marker added by Amazon SES outbound servers.",
  "x-priority": "Client priority hint, 1 (highest) to 5 (lowest). Urgency is a common social engineering lever.",
  "x-msmail-priority": "Outlook's priority hint: High, Normal or Low.",
  "x-php-originating-script": "Added by PHP's mail() function: the user ID and script that sent the message.",
  "x-virus-scanned": "A content scanner looked at the message. It does not say what it found.",
  "x-envelope-from": "The envelope sender as one server recorded it.",
  "x-sender": "The sender as one server recorded it. Not standardized.",
  "x-apparently-to": "The envelope recipient, added by some providers when To does not name the recipient.",
  "x-ms-has-attach": "Exchange's note of whether the message has attachments.",
  "x-ms-exchange-crosstenant-originalarrivaltime": "When Microsoft 365 first accepted the message.",
};

export function xHeaderNote(name: string): string {
  return X_HEADER_NOTES[name.toLowerCase()] ?? "Nonstandard field. It means whatever the software that added it intended.";
}

const SFV_NOTES: Record<string, string> = {
  BLK: "blocked: the sender is on the recipient's blocked senders list",
  NSPM: "not spam",
  SPM: "spam",
  SFE: "allowed: the sender is on the recipient's safe senders list",
  SKA: "skipped filtering: allowed sender or domain in an anti-spam policy",
  SKB: "marked spam: blocked sender or domain in an anti-spam policy",
  SKI: "skipped filtering, for example mail inside the tenant",
  SKN: "marked not spam before filtering, for example by a mail flow rule",
  SKQ: "released from quarantine",
  SKS: "marked spam before filtering, for example by a mail flow rule",
};

/* ------------------------------------------------------------- analysis */

export interface DomainRow {
  role: string;
  value: string;
  domain: string | null;
  aligned: boolean | null;
  strict: boolean | null;
}

export interface AuthRow {
  method: string;
  result: string;
  identity: string | null;
  authservId: string | null;
  reason: string | null;
  comment: string | null;
  /** True when the field came from the topmost authserv-id. */
  primary: boolean;
}

export interface XHeader {
  name: string;
  value: string;
  note: string;
  detail: string | null;
}

export interface EncodedRow {
  name: string;
  raw: string;
  decoded: string;
  errors: string[];
}

export interface DkimSignatureSummary {
  domain: string | null;
  selector: string | null;
  algorithm: string | null;
  dnsName: string | null;
}

export interface EmailAnalysis {
  fields: HeaderField[];
  bodyLinesIgnored: number;
  strays: SplitHeaders["strays"];
  truncated: boolean;
  mboxLine: string | null;
  hops: ReceivedHop[];
  hopsTruncated: boolean;
  transitSeconds: number | null;
  auth: AuthRow[];
  authFields: number;
  receivedSpf: ReceivedSpf[];
  dkimSignatures: DkimSignatureSummary[];
  from: Mailbox | null;
  fromCount: number;
  replyTo: Mailbox[];
  returnPath: Mailbox | null;
  sender: Mailbox | null;
  to: Mailbox[];
  subject: string | null;
  date: { text: string; ms: number | null; error: string | null } | null;
  messageId: { value: string; domain: string | null } | null;
  originatingIp: IpInfo | null;
  domains: DomainRow[];
  xHeaders: XHeader[];
  encoded: EncodedRow[];
  findings: Finding[];
}

const SEVERITY: Record<Tone, number> = { danger: 0, warn: 1, info: 2, ok: 3 };

export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  let s = Math.abs(Math.round(seconds));
  if (s < 60) return `${sign}${s} s`;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return `${sign}${d} d ${h} h`;
  if (h > 0) return `${sign}${h} h ${m} min`;
  return `${sign}${m} min${s ? ` ${s} s` : ""}`;
}

function describeMailbox(m: Mailbox | null): string {
  if (!m) return "";
  if (m.nullPath) return "<> (null)";
  return m.display ? `${m.display} <${m.address}>` : m.address ?? "";
}

/** Analyzes a pasted header section. */
export function analyzeHeaders(raw: string): Outcome<EmailAnalysis> {
  if (raw.trim() === "") return { kind: "empty" };
  const split = splitHeaders(raw);
  if (split.fields.length === 0) {
    return {
      kind: "error",
      message:
        "No header fields were found. Headers are lines of the form Name: value, such as Received: or From:. In most mail clients they are under Show original, View source, or Message details.",
    };
  }
  const fields = split.fields;
  const lower = (n: string) => fields.filter((f) => f.name.toLowerCase() === n);
  const firstValue = (n: string) => lower(n)[0]?.value ?? null;
  const findings: Finding[] = [];
  const add = (tone: Tone, text: string) => findings.push({ tone, text });

  if (split.truncated) {
    add("info", `Only the first ${MAX_FIELDS.toLocaleString("en-US")} fields or ${Math.round(MAX_HEADER_INPUT / 1024)} KB were read.`);
  }
  if (split.bodyLinesIgnored > 0) {
    add(
      "info",
      `Reading stopped at the first blank line, which ends the header section (RFC 5322 section 2.1). ${split.bodyLinesIgnored} non-empty ${split.bodyLinesIgnored === 1 ? "line" : "lines"} after it were not read.`,
    );
  }
  const attached = split.strays.filter((s) => s.attachedTo);
  if (attached.length) {
    add(
      "info",
      `${attached.length} ${attached.length === 1 ? "line has" : "lines have"} no field name and no leading space (first at line ${attached[0].line}). Each was read as a continuation of the field above it, the usual result of a copy that dropped the indentation.`,
    );
  }

  /* Route. */
  const receivedValues = lower("received").map((f) => f.value);
  const hops = buildHops(receivedValues);
  const timed = hops.filter((h) => h.time !== null);
  const transitSeconds = timed.length >= 2 ? Math.round(((timed[timed.length - 1].time as number) - (timed[0].time as number)) / 1000) : null;
  if (hops.length === 0) {
    add("info", "There are no Received fields. The message never crossed a server, or the trace lines were cut from the copy.");
  }
  if (receivedValues.length > MAX_HOPS) add("info", `Only the first ${MAX_HOPS} of ${receivedValues.length} Received fields were analyzed.`);

  let seenPublic = false;
  hops.forEach((hop, i) => {
    if (hop.time === null) add("info", `Hop ${hop.index} has no readable timestamp: ${hop.dateError}.`);
    if (hop.delay !== null) {
      if (hop.delay > LONG_DELAY_SECONDS) {
        add(
          "warn",
          `Hop ${hop.index} is stamped ${formatDuration(hop.delay)} after the hop before it. Minutes usually mean greylisting, a queue backlog or a retry after a temporary failure; hours or days can also mean a forged or backdated line.`,
        );
      } else if (hop.delay < -CLOCK_SKEW_SECONDS) {
        add(
          "warn",
          `Hop ${hop.index} is stamped ${formatDuration(-hop.delay)} earlier than the hop before it. A server clock is wrong, or the Received lines were reordered or forged.`,
        );
      }
    }
    for (const ip of hop.fromIps.slice(0, 1)) {
      if (isInternal(ip.kind)) {
        if (i === 0) {
          add(
            "info",
            `Hop 1 came from ${ip.address}, a ${ip.kind} address: the sender's own machine submitting through its server. It reveals a little about the sender's internal network.`,
          );
        } else if (seenPublic) {
          add(
            "warn",
            `Hop ${hop.index} was handed over from ${ip.address}, a ${ip.kind} address, after the message had already crossed a public one. That is normal inside a receiving organization's own relays, and suspicious when the servers on either side belong to unrelated organizations, because a sender can write fake Received lines of its own.`,
          );
        }
      }
    }
    // Documentation ranges stand in for public addresses in samples and in
    // sanitized headers, so they count as having left a private network.
    if (hop.fromIps.some((ip) => ip.kind === "public" || ip.kind === "documentation")) seenPublic = true;
  });

  /* Authentication-Results. */
  const authFieldsAll = fields
    .filter((f) => /^(arc-)?authentication-results$/i.test(f.name))
    .map((f) => parseAuthResults(f.value, f.name));
  const plain = authFieldsAll.filter((f) => f.field.toLowerCase() === "authentication-results");
  const primaryId = plain[0]?.authservId ?? null;
  const auth: AuthRow[] = [];
  for (const f of authFieldsAll) {
    const primary = f.field.toLowerCase() === "authentication-results" && f.authservId === primaryId;
    for (const r of f.results) {
      auth.push({
        method: r.method,
        result: r.result,
        identity: authIdentity(r),
        authservId: f.arcInstance ? `${f.authservId ?? "?"} (ARC i=${f.arcInstance})` : f.authservId,
        reason: r.reason,
        comment: r.comments.join("; ") || null,
        primary,
      });
    }
  }
  const primaryResults = auth.filter((a) => a.primary);
  const otherIds = new Set(plain.filter((f) => f.authservId !== primaryId).map((f) => f.authservId ?? "(none)"));
  if (plain.length === 0) {
    add(
      "info",
      "There is no Authentication-Results field, so no SPF, DKIM or DMARC verdict was recorded, or it was cut from the copy.",
    );
  } else if (otherIds.size > 0) {
    add(
      "info",
      `Authentication-Results fields come from more than one authserv-id (${[primaryId ?? "(none)", ...otherIds].join(", ")}). The findings use the topmost one, ${primaryId ?? "which names none"}. Fields from other authserv-ids were added upstream, possibly by the sender, so trust them only as far as you trust whoever wrote them (RFC 8601 section 5).`,
    );
  }

  const receivedSpf = lower("received-spf").map((f) => parseReceivedSpf(f.value));

  const spfText: Record<string, [Tone, string]> = {
    pass: ["ok", "the sending server is authorized for that domain"],
    fail: ["danger", "an explicit statement from the domain that this server may not send for it (RFC 7208 section 2.6.4)"],
    softfail: ["warn", "the domain says this server is probably not authorized, a weaker statement than fail (RFC 7208 section 2.6.5)"],
    neutral: ["warn", "the domain declines to say whether this server is authorized (RFC 7208 section 2.6.3)"],
    none: ["warn", "the domain publishes no SPF record, or no domain could be checked (RFC 7208 section 2.6.1)"],
    temperror: ["warn", "a transient DNS error stopped the check (RFC 7208 section 2.6.6)"],
    permerror: ["warn", "the domain's SPF record is broken and could not be evaluated (RFC 7208 section 2.6.7)"],
  };
  const dmarcPassed = primaryResults.some((r) => r.method === "dmarc" && r.result === "pass");
  for (const r of primaryResults) {
    const who = r.identity ? ` for ${r.identity}` : "";
    if (r.method === "spf") {
      const [tone, text] = spfText[r.result] ?? ["warn", "an unrecognized result"];
      if (dmarcPassed && (r.result === "fail" || r.result === "softfail")) {
        add("info", `SPF ${r.result}${who}: ${text}. DMARC still passed through an aligned DKIM signature, the usual pattern for forwarded or list mail.`);
      } else {
        add(tone, `SPF ${r.result}${who}: ${text}.`);
      }
    } else if (r.method === "dkim") {
      const signer = domainOf(r.identity);
      if (r.result === "pass") add("ok", `DKIM pass${signer ? ` for ${signer}` : ""}.`);
      else if (r.result === "fail") {
        add("danger", `DKIM fail${who}: a signature was present but did not verify, so the signed content changed after signing or the signature is forged.`);
      } else if (r.result === "none") add("warn", "DKIM none: the message carried no signature that was checked.");
      else add("warn", `DKIM ${r.result}${who}: the signature could not be evaluated cleanly.`);
    } else if (r.method === "dmarc") {
      const policy = /\bp=(\w+)/i.exec(r.comment ?? "")?.[1] ?? null;
      const policyText = policy ? ` The published policy is p=${policy.toLowerCase()}.` : "";
      if (r.result === "pass") add("ok", `DMARC pass${who}.`);
      else if (r.result === "fail") {
        add("danger", `DMARC fail${who}: neither SPF nor DKIM passed for a domain aligned with the From address.${policyText}`);
      } else if (r.result === "none") {
        add("warn", `DMARC none${who}: the From domain publishes no DMARC policy, so nothing tells receivers to reject mail that spoofs it.`);
      } else add("warn", `DMARC ${r.result}${who}: the check did not complete.`);
    } else if (r.method === "arc") {
      if (r.result === "fail") add("warn", "ARC fail: the chain of authentication results recorded by intermediaries did not validate.");
      else if (r.result === "pass") {
        add("info", "ARC pass: an intermediary such as a mailing list recorded the results it saw and the chain validated. How much that counts depends on trusting the intermediary.");
      }
    } else if (r.method === "compauth") {
      if (r.result === "fail") add("danger", `Microsoft composite authentication failed (compauth=fail${r.reason ? `, reason ${r.reason}` : ""}).`);
      else if (r.result === "softfail") add("warn", `Microsoft composite authentication soft failed (compauth=softfail${r.reason ? `, reason ${r.reason}` : ""}).`);
      else if (r.result === "pass") add("ok", "Microsoft composite authentication passed.");
    } else if (r.method === "iprev" && r.result === "fail") {
      add("warn", "iprev fail: the connecting address's reverse DNS name does not resolve back to the same address.");
    }
  }

  /* Addresses. */
  const fromFields = lower("from");
  const fromList = fromFields[0] ? parseAddressList(fromFields[0].value) : [];
  const from = fromList[0] ?? null;
  const replyTo = firstValue("reply-to") ? parseAddressList(firstValue("reply-to") as string) : [];
  const returnPath = firstValue("return-path") ? parseAddressList(firstValue("return-path") as string)[0] ?? null : null;
  const sender = firstValue("sender") ? parseAddressList(firstValue("sender") as string)[0] ?? null : null;
  const to = firstValue("to") ? parseAddressList(firstValue("to") as string) : [];
  const fromDomain = from?.domain ?? null;

  if (fromFields.length === 0) add("warn", "There is no From field. RFC 5322 section 3.6 requires one.");
  if (fromFields.length > 1) {
    add(
      "danger",
      `There are ${fromFields.length} From fields. RFC 5322 allows exactly one, and DMARC receivers usually reject such messages, because which one a mail client shows is anybody's guess (RFC 7489 section 6.6.1).`,
    );
  }
  if (fromList.length > 1) add("info", "From names more than one mailbox, which RFC 5322 allows only together with a Sender field.");

  if (from?.display && from.domain) {
    const inner = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/.exec(from.display);
    if (inner && !relaxedAligned(inner[1], from.domain)) {
      add(
        "danger",
        `The From display name contains the address ${inner[0]}, but the message is actually from ${from.address}. A mail client that shows only the display name makes it look as if it came from ${inner[1].toLowerCase()}.`,
      );
    }
  }
  for (const [label, text] of [
    ["From display name", from?.display ?? ""],
    ["Reply-To display name", replyTo[0]?.display ?? ""],
    ["Subject", decodeEncodedWords(firstValue("subject") ?? "").text],
  ] as const) {
    const hidden = hiddenCharacters(text);
    if (hidden.length) add("warn", `The ${label} contains ${hidden.join(" and ")}, which can disguise what a reader sees.`);
    const mixed = mixedScriptWord(text);
    if (mixed) add("warn", `The ${label} has a word, "${clip(mixed, 24)}", that mixes Latin letters with Cyrillic or Greek ones. Lookalike letters are a standard way to imitate a brand name.`);
  }

  for (const r of replyTo) {
    if (fromDomain && r.domain && !relaxedAligned(r.domain, fromDomain)) {
      add(
        "warn",
        `Reply-To sends answers to ${r.domain}, not to the From domain ${fromDomain}. Newsletters and help desks do this legitimately; it is also a standard phishing technique, because the reader believes they are replying to the sender.`,
      );
      break;
    }
  }
  if (returnPath?.nullPath) {
    add("info", "The Return-Path is <>, the null reverse path used by bounces and automatic notifications (RFC 5321 section 4.5.5).");
  } else if (fromDomain && returnPath?.domain && !relaxedAligned(returnPath.domain, fromDomain)) {
    add(
      "info",
      `The Return-Path (envelope sender) domain ${returnPath.domain} differs from the From domain ${fromDomain}. That is normal for mail sent through a bulk sender or forwarded, and it means SPF cannot be what aligns with From, so DMARC rests on DKIM.`,
    );
  }
  if (sender?.domain && fromDomain && !relaxedAligned(sender.domain, fromDomain)) {
    add("info", `The Sender field names ${sender.address}, a different domain from From. Some clients show this as "on behalf of".`);
  }

  // Alignment from the topmost results, when DMARC itself is not reported.
  const spfPrimary = primaryResults.find((r) => r.method === "spf");
  const spfDomain = domainOf(spfPrimary?.identity ?? null) ?? returnPath?.domain ?? null;
  const dkimPassDomains = primaryResults.filter((r) => r.method === "dkim" && r.result === "pass").map((r) => domainOf(r.identity)).filter((d): d is string => !!d);
  const dmarcPrimary = primaryResults.find((r) => r.method === "dmarc");
  if (fromDomain && primaryResults.length && !dmarcPrimary) {
    const spfAligned = spfPrimary?.result === "pass" && relaxedAligned(spfDomain, fromDomain);
    const dkimAligned = dkimPassDomains.some((d) => relaxedAligned(d, fromDomain));
    if (!spfAligned && !dkimAligned) {
      add(
        "warn",
        `No DMARC result is recorded, and neither SPF nor DKIM passed for a domain aligned with ${fromDomain}, so this message would fail DMARC (RFC 7489 section 3.1).`,
      );
    }
  }

  /* Subject, date, message id. */
  const subjectRaw = firstValue("subject");
  const subject = subjectRaw === null ? null : decodeEncodedWords(subjectRaw).text;
  const dateRaw = firstValue("date");
  let date: EmailAnalysis["date"] = null;
  if (dateRaw === null) {
    add("warn", "There is no Date field. RFC 5322 section 3.6 requires one.");
  } else {
    const parsed = parseRfc5322Date(dateRaw);
    date = { text: dateRaw, ms: parsed.ok ? parsed.value.ms : null, error: parsed.ok ? null : parsed.error };
    if (!parsed.ok) add("warn", `The Date field could not be read: ${parsed.error}.`);
    else if (timed.length) {
      const first = timed[0].time as number;
      const diff = Math.round((parsed.value.ms - first) / 1000);
      if (diff > DATE_AHEAD_SECONDS) {
        add("warn", `The Date field is ${formatDuration(diff)} later than the first server's stamp. The sender's clock is wrong, or the date was set by hand.`);
      } else if (-diff > DATE_BEHIND_SECONDS) {
        add("info", `The Date field is ${formatDuration(-diff)} earlier than the first server's stamp: a message that sat in an outbox, a wrong clock, or a backdated message.`);
      }
    }
  }
  for (const name of ["subject", "date", "message-id", "to", "reply-to", "sender"]) {
    const n = lower(name).length;
    if (n > 1) add("warn", `There are ${n} ${fields.find((f) => f.name.toLowerCase() === name)?.name} fields. RFC 5322 section 3.6 allows at most one.`);
  }

  const midRaw = firstValue("message-id");
  let messageId: EmailAnalysis["messageId"] = null;
  if (midRaw === null) {
    add("warn", "There is no Message-ID. RFC 5322 section 3.6.4 says every message should carry one, and its absence is a common spam filter signal.");
  } else {
    const m = /<([^<>]*)>/.exec(midRaw);
    const id = m ? m[1] : midRaw.trim();
    messageId = { value: midRaw, domain: domainOf(id.includes("@") ? id : null)?.replace(/[\]>]/g, "") ?? null };
  }

  const xoip = firstValue("x-originating-ip");
  const originatingIp = xoip ? extractIps(xoip)[0] ?? null : null;
  if (originatingIp) add("info", `X-Originating-IP reveals the client address ${originatingIp.address} (${originatingIp.kind}).`);

  /* X- headers. */
  const xHeaders: XHeader[] = [];
  for (const f of fields) {
    const n = f.name.toLowerCase();
    if (!n.startsWith("x-") && n !== "user-agent") continue;
    if (xHeaders.length >= 200) break;
    let detail: string | null = null;
    if (n === "x-forefront-antispam-report") {
      const pairs = Object.fromEntries(
        f.value
          .split(";")
          .map((p) => p.split(":"))
          .filter((p) => p.length >= 2)
          .map(([k, ...v]) => [k.trim().toUpperCase(), v.join(":").trim()]),
      ) as Record<string, string>;
      const bits: string[] = [];
      if (pairs.CIP) bits.push(`connecting IP ${pairs.CIP}`);
      if (pairs.CTRY) bits.push(`country ${pairs.CTRY}`);
      if (pairs.SCL) bits.push(`SCL ${pairs.SCL}`);
      if (pairs.SFV) bits.push(`SFV ${pairs.SFV}${SFV_NOTES[pairs.SFV.toUpperCase()] ? ` (${SFV_NOTES[pairs.SFV.toUpperCase()]})` : ""}`);
      if (pairs.PTR) bits.push(`reverse DNS ${pairs.PTR}`);
      detail = bits.join(", ") || null;
      const scl = Number(pairs.SCL);
      if (Number.isFinite(scl) && scl >= 5) add("warn", `Microsoft 365 rated this message spam (SCL ${scl}).`);
    } else if (n === "x-ms-exchange-organization-scl") {
      const scl = Number(f.value.trim());
      if (Number.isFinite(scl) && scl >= 5 && !lower("x-forefront-antispam-report").length) add("warn", `Exchange rated this message spam (SCL ${scl}).`);
    } else if (n === "x-spam-status") {
      const m = /^(yes|no)\b.*?\bscore=(-?[\d.]+)(?:.*?\brequired=(-?[\d.]+))?/is.exec(f.value);
      if (m) {
        detail = `${m[1].toLowerCase() === "yes" ? "Spam" : "Not spam"}, score ${m[2]}${m[3] ? ` of ${m[3]} required` : ""}`;
        if (m[1].toLowerCase() === "yes") add("warn", `A SpamAssassin filter upstream classed this as spam (score ${m[2]}).`);
      }
    } else if (n === "x-spam-flag" && /^yes\b/i.test(f.value.trim()) && !lower("x-spam-status").some((s) => /^yes/i.test(s.value))) {
      add("warn", "A spam filter upstream flagged this message (X-Spam-Flag: YES).");
    } else if (n === "x-php-originating-script") {
      add(
        "info",
        `Sent through PHP's mail() function by ${clip(f.value, 60)}. Expected for a web application's own notifications; unexpected mail carrying it often comes from a compromised website.`,
      );
    } else if (n === "x-originating-ip" && originatingIp) {
      detail = `${originatingIp.address}, ${originatingIp.kind}`;
    }
    xHeaders.push({ name: f.name, value: f.value, note: xHeaderNote(f.name), detail });
  }

  /* Encoded-words anywhere. */
  const encoded: EncodedRow[] = [];
  for (const f of fields) {
    if (encoded.length >= 50) break;
    if (!f.value.includes("=?")) continue;
    const d = decodeEncodedWords(f.value);
    if (d.hadEncodedWords) encoded.push({ name: f.name, raw: f.value, decoded: d.text, errors: d.errors });
  }

  /* DKIM signatures present. */
  const dkimSignatures: DkimSignatureSummary[] = lower("dkim-signature")
    .slice(0, 20)
    .map((f) => {
      const tags = parseTagList(f.value.replace(/\r\n|\r|\n/g, "")).tags;
      const get = (n: string) => tags.find((t) => t.name === n)?.value.trim() ?? null;
      const d = get("d")?.toLowerCase() ?? null;
      const s = get("s")?.toLowerCase() ?? null;
      return { domain: d, selector: s, algorithm: get("a"), dnsName: d && s ? keyQueryName(s, d) : null };
    });

  /* Domain comparison. */
  const domains: DomainRow[] = [];
  const row = (role: string, value: string, domain: string | null) => {
    domains.push({
      role,
      value,
      domain,
      aligned: domain && fromDomain ? relaxedAligned(domain, fromDomain) : null,
      strict: domain && fromDomain ? domain === fromDomain : null,
    });
  };
  if (from) row("From", describeMailbox(from), from.domain);
  if (returnPath) row("Return-Path", describeMailbox(returnPath), returnPath.domain);
  replyTo.forEach((r) => row("Reply-To", describeMailbox(r), r.domain));
  if (sender) row("Sender", describeMailbox(sender), sender.domain);
  if (spfPrimary?.identity) row(`SPF (${spfPrimary.result})`, spfPrimary.identity, domainOf(spfPrimary.identity));
  primaryResults
    .filter((r) => r.method === "dkim" && r.identity)
    .forEach((r) => row(`DKIM (${r.result})`, r.identity as string, domainOf(r.identity)));
  dkimSignatures.forEach((s) => {
    if (s.domain) row("DKIM-Signature d=", s.domain, s.domain);
  });
  if (messageId?.domain) row("Message-ID", messageId.value, messageId.domain);

  const sorted = findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY[a.f.tone] - SEVERITY[b.f.tone] || a.i - b.i)
    .map(({ f }) => f);

  return {
    kind: "ok",
    value: {
      fields,
      bodyLinesIgnored: split.bodyLinesIgnored,
      strays: split.strays,
      truncated: split.truncated,
      mboxLine: split.mboxLine,
      hops,
      hopsTruncated: receivedValues.length > MAX_HOPS,
      transitSeconds,
      auth,
      authFields: authFieldsAll.length,
      receivedSpf,
      dkimSignatures,
      from,
      fromCount: fromFields.length,
      replyTo,
      returnPath,
      sender,
      to,
      subject,
      date,
      messageId,
      originatingIp,
      domains,
      xHeaders,
      encoded,
      findings: sorted,
    },
  };
}

/* ------------------------------------------------------------- examples */

/**
 * Sample header sections. Every name and address is a documentation value
 * (RFC 2606 domains, RFC 5737 and RFC 3849 addresses). The first carries a
 * real DKIM signature made with a throwaway key, the same one the DKIM
 * record analyzer's example record publishes.
 */
export const EXAMPLE_HEADERS: { label: string; text: string }[] = [
  {
    label: "Clean",
    text: `Delivered-To: bob@example.net
Received: by 2001:db8:a0d1::1 with SMTP id k12csp884211pxb;
        Tue, 13 Oct 2026 09:14:07 -0700 (PDT)
Return-Path: <alice@example.com>
Received: from mail.example.com (mail.example.com. [203.0.113.25])
        by mx.example.net with ESMTPS id a7si1029384qkb.212.2026.10.13.09.14.06
        for <bob@example.net>
        (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
        Tue, 13 Oct 2026 09:14:06 -0700 (PDT)
Received-SPF: pass (mx.example.net: domain of alice@example.com designates 203.0.113.25 as permitted sender) client-ip=203.0.113.25;
Authentication-Results: mx.example.net;
       dkim=pass header.i=@example.com header.s=s2026 header.b=N8KqlcKd;
       spf=pass (mx.example.net: domain of alice@example.com designates 203.0.113.25 as permitted sender) smtp.mailfrom=alice@example.com;
       dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com
Received: from [192.168.1.20] (unknown [198.51.100.7])
        (Authenticated sender: alice@example.com)
        by mail.example.com (Postfix) with ESMTPSA id 4F2A1C0123
        for <bob@example.net>; Tue, 13 Oct 2026 16:14:03 +0000 (UTC)
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=s2026;
        t=1791908043; h=from:to:subject:date:message-id:from;
        bh=SoxCEfhuTtVzZJ1GLYaoau2VLtGWqggh/mlmLvF2LRc=;
        b=N8KqlcKdbMRosuDErJnhP3GglQSW6VBART89quJcTmlzXrquIoCiEAKlBXcqwNbvk327J+AQ
         vgZsOIzWHjFvgzSOk92h+uqS0Pn8NCkXHwHjSHGYccZ0cXt01mnp0OExnRcBvmV8JcOLl3n0d4XR
         g+wyE+hUniBfaty9muX4jnyx8KbobwgmhOvn25vPFWWpL07qSEladUAqilBPmhlZzl6RuniNZbnm
         44VJRJgHnzVtSlCPjKf1T9OAC4zQXVVK9YsxB+3gnWGWINI2Lw9JeoVblleNjy10zNZpyJuOytcp
         GH1/GCjH4uBxH6IvMdpGgBKgOuZ/cP86u5Cb9BC2tQ==
From: Alice Example <alice@example.com>
To: Bob <bob@example.net>
Subject: Quarterly report
Date: Tue, 13 Oct 2026 09:14:02 -0700
Message-ID: <20261013161402.4F2A1@mail.example.com>
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
X-Mailer: Example Mail 4.2`,
  },
  {
    label: "Phishing",
    text: `Received: from mx2.mailhost.test (mx2.mailhost.test [198.51.100.40])
        by mx.example.net with ESMTP id 5D1E2A0044
        for <bob@example.net>; Mon, 12 Oct 2026 03:52:18 +0000
Authentication-Results: mx.example.net;
       spf=softfail (mx.example.net: domain of transitioning bounce@bulk-mailer.test does not designate 198.51.100.40 as permitted sender) smtp.mailfrom=bounce@bulk-mailer.test;
       dkim=none;
       dmarc=none header.from=secure-verify.test
Received: from relay.internal (unknown [10.20.30.40])
        by mx2.mailhost.test (Postfix) with ESMTP id 9A7B6C5D4E
        for <bob@example.net>; Mon, 12 Oct 2026 03:11:42 +0000
Received: from webhost-07.hosting.test (webhost-07.hosting.test [203.0.113.77])
        by relay.internal (Postfix) with SMTP id 1122334455;
        Mon, 12 Oct 2026 03:11:40 +0000
Return-Path: <bounce@bulk-mailer.test>
From: "security@bank.example" <alerts@secure-verify.test>
Reply-To: =?UTF-8?Q?Account_Rec=D0=BEvery?= <recovery@mailbox.test>
To: bob@example.net
Subject: =?UTF-8?B?VXJnZW50OiB2ZXJpZnkgeW91ciBhY2NvdW50IHdpdGhpbiAyNCBob3Vycw==?=
Date: Mon, 12 Oct 2026 05:58:00 +0200
Message-ID: <a81f2c9e0d7b4e6f@webhost-07.hosting.test>
X-Mailer: PHPMailer 6.9.1
X-PHP-Originating-Script: 1004:mailer.php
X-Priority: 1 (Highest)
X-Spam-Status: Yes, score=7.4 required=5.0 tests=FREEMAIL_FORGED_REPLYTO,
        SPF_SOFTFAIL,URIBL_BLOCKED autolearn=no`,
  },
  {
    label: "Exchange style, forwarded",
    text: `Received: from MW4PR04MB7412.prod.mailhost.example (2001:db8:303:c3::18) by
 SA1PR04MB8810.prod.mailhost.example with HTTPS; Wed, 14 Oct 2026 18:02:51 +0000
Received: from DM6PR04CA0011.prod.mailhost.example (2001:db8:5:127::22) by
 MW4PR04MB7412.prod.mailhost.example (2001:db8:303:c3::18) with Microsoft SMTP Server
 (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.6838.29;
 Wed, 14 Oct 2026 18:02:50 +0000
Received: from lists.example.org (198.51.100.88) by
 DM6PR04CA0011.protection.mailhost.example (10.167.240.9) with Microsoft SMTP Server
 (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id 15.20.6838.29
 via Frontend Transport; Wed, 14 Oct 2026 18:02:49 +0000
Authentication-Results: spf=fail (sender IP is 198.51.100.88)
 smtp.mailfrom=example.org; dkim=pass (signature was verified)
 header.d=example.org;dmarc=pass action=none header.from=example.org;compauth=pass
 reason=100
Received-SPF: Fail (protection.mailhost.example: domain of example.org does not
 designate 198.51.100.88 as permitted sender) receiver=protection.mailhost.example;
 client-ip=198.51.100.88; helo=lists.example.org;
X-MS-Exchange-Organization-AuthAs: Anonymous
X-Forefront-Antispam-Report: CIP:198.51.100.88;CTRY:US;LANG:en;SCL:1;SRV:;IPV:NLI;SFV:NSPM;H:lists.example.org;PTR:lists.example.org;CAT:NONE;SFS:;DIR:INB;
From: =?UTF-8?Q?Jos=C3=A9_Mart=C3=ADnez?= <jose@example.org>
To: "Ops team" <ops@example.com>
Subject: =?UTF-8?Q?Re:_Caf=C3=A9_network_cutover,_Saturday_window?=
Date: Wed, 14 Oct 2026 11:02:44 -0700
Message-ID: <CAF3x9qZt4e1@mail.example.org>
List-Id: <netops.lists.example.org>
MIME-Version: 1.0`,
  },
];
