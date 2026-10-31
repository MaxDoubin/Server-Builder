/**
 * SPF record analysis, RFC 7208.
 *
 * A record is parsed against the collected grammar in section 12, each term
 * is explained in the order check_host() would test it (section 4.6), and
 * the terms that cost a DNS query are counted against the limit of 10 in
 * section 4.6.4. Nothing is looked up. Nested include and redirect targets
 * add lookups of their own that cannot be counted without DNS, so every
 * count here is a floor for the whole tree, and is labeled as one.
 *
 * The TXT presentation helpers at the top are shared with the DMARC
 * analyzer, because both read the same pasted dig and zone file output.
 */

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

const TONE_ORDER: Record<Tone, number> = { danger: 0, warn: 1, info: 2, ok: 3 };

/** Most severe first, keeping the original order within a tone. */
export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => TONE_ORDER[a.f.tone] - TONE_ORDER[b.f.tone] || a.i - b.i)
    .map(({ f }) => f);
}

/** Shorten user text before quoting it back in a message. */
export function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Name a character in a message without echoing something invisible. */
export function describeChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  if (ch === "\t") return "a tab";
  if (code === 0xa0) return "a non-breaking space (U+00A0)";
  if (code === 0x200b) return "a zero-width space (U+200B)";
  if (code === 0x201c || code === 0x201d) return "a curly quotation mark";
  const hex = code.toString(16).toUpperCase().padStart(4, "0");
  if (code < 0x20 || code === 0x7f) return `a control character (U+${hex})`;
  if (code > 0x7e) return `the non-ASCII character "${ch}" (U+${hex})`;
  return `"${ch}"`;
}

/* ------------------------------------------------ TXT presentation format */

/** Pasted text beyond this is refused rather than parsed. */
export const MAX_INPUT_CHARS = 16384;
/** At most this many TXT lines are read from one paste. */
export const MAX_TXT_LINES = 40;
/** A DNS character-string is one length octet and at most 255 octets of data (RFC 1035 section 3.3). */
export const TXT_STRING_MAX = 255;

export interface TxtRecord {
  /** 1-based line in the pasted text. */
  line: number;
  /** The record text with the quoted strings joined, as a receiver sees it. */
  text: string;
  /** The individual quoted strings, or null when the line was pasted bare. */
  chunks: string[] | null;
  /** Owner name, when the line was dig or zone file output naming one. */
  owner: string | null;
  error: string | null;
}

export interface TxtExtraction {
  records: TxtRecord[];
  error: string | null;
  /** Lines past MAX_TXT_LINES that were not read. */
  skipped: number;
}

/**
 * One line of presentation format: optional owner, TTL, class and type,
 * then one or more quoted character-strings. Escapes follow RFC 1035
 * section 5.1: a backslash before any character takes it literally, and a
 * backslash before three digits is that decimal octet.
 */
function parseQuotedLine(line: string, lineNo: number): TxtRecord {
  const chunks: string[] = [];
  let before = "";
  let error: string | null = null;
  let sawQuote = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      sawQuote = true;
      let j = i + 1;
      let buf = "";
      let closed = false;
      while (j < line.length) {
        const c = line[j];
        if (c === "\\") {
          const digits = line.slice(j + 1, j + 4);
          if (/^\d{3}$/.test(digits)) {
            const code = Number(digits);
            if (code > 255) error ??= `has the escape \\${digits}, which is larger than one octet`;
            buf += String.fromCharCode(Math.min(code, 255));
            j += 4;
            continue;
          }
          if (j + 1 < line.length) {
            buf += line[j + 1];
            j += 2;
            continue;
          }
          error ??= "ends with a lone backslash inside a quoted string";
          j += 1;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
        buf += c;
        j += 1;
      }
      if (!closed) error ??= "opens a quoted string that is never closed";
      chunks.push(buf);
      i = closed ? j + 1 : line.length;
      continue;
    }
    if (!sawQuote) {
      before += ch;
    } else if (ch === ";") {
      break; // a zone file comment runs to the end of the line
    } else if (!/[\s()]/.test(ch)) {
      const stray = line.slice(i).split('"')[0].trim();
      error ??= `has text outside the quotes ("${clip(stray, 24)}"), which is not part of the record`;
      while (i < line.length && line[i] !== '"') i += 1;
      continue;
    }
    i += 1;
  }

  // An owner name only counts when the line also names the TXT type (dig,
  // zone file) or nslookup's "text =", so stray words are never read as one.
  const tokens = before.trim().split(/\s+/).filter(Boolean);
  const hasType = tokens.some((t) => /^(txt|text)$/i.test(t));
  const first = tokens[0];
  const owner =
    hasType && first && /^[A-Za-z0-9_*][A-Za-z0-9_.*-]*\.?$/.test(first) && /[A-Za-z]/.test(first) && !/^(in|txt|text|ch|hs)$/i.test(first)
      ? first
      : null;

  return { line: lineNo, text: chunks.join(""), chunks, owner, error };
}

/**
 * Split a paste into TXT records, one per line. Bare lines are taken as the
 * record text. Lines with quotes are read as presentation format, and their
 * strings are joined with no separator, which is what section 3.3 of RFC
 * 7208 tells receivers to do. Comment lines (dig's ";;") are skipped.
 */
export function extractTxtRecords(input: string): TxtExtraction {
  if (input.length > MAX_INPUT_CHARS) {
    return {
      records: [],
      error: `That is ${input.length.toLocaleString("en-US")} characters. This page reads at most ${MAX_INPUT_CHARS.toLocaleString("en-US")}, far more than any real record needs.`,
      skipped: 0,
    };
  }
  const records: TxtRecord[] = [];
  let skipped = 0;
  const lines = input.split(/\r\n|\r|\n/);
  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith(";")) return;
    if (records.length >= MAX_TXT_LINES) {
      skipped += 1;
      return;
    }
    if (trimmed.includes('"')) records.push(parseQuotedLine(rawLine, idx + 1));
    else records.push({ line: idx + 1, text: trimmed, chunks: null, owner: null, error: null });
  });
  return { records, error: null, skipped };
}

/** Strip a trailing root dot and lowercase, so names compare as DNS compares them. */
export function normalizeDomain(name: string): string {
  return name.trim().replace(/\.+$/, "").toLowerCase();
}

/** Findings about how a record was split into strings, shared by SPF and DMARC. */
export function chunkFindings(txt: TxtRecord): Finding[] {
  const out: Finding[] = [];
  if (txt.error) {
    out.push({ tone: "danger", text: `Line ${txt.line} ${txt.error}. The record shown below may not be what a receiver reads.` });
  }
  if (txt.chunks) {
    txt.chunks.forEach((chunk, i) => {
      if (chunk.length > TXT_STRING_MAX) {
        out.push({
          tone: "danger",
          text: `Quoted string ${i + 1} is ${chunk.length} characters. One DNS character-string holds at most ${TXT_STRING_MAX} octets, so it has to be split into several quoted strings.`,
        });
      }
    });
    for (let i = 1; i < txt.chunks.length; i += 1) {
      const prev = txt.chunks[i - 1];
      const next = txt.chunks[i];
      if (prev !== "" && next !== "" && !/\s$/.test(prev) && !/^\s/.test(next)) {
        const tail = prev.split(/\s+/).pop() ?? "";
        const head = next.split(/\s+/)[0] ?? "";
        out.push({
          tone: "warn",
          text: `Quoted strings ${i} and ${i + 1} meet with no space between them. Receivers join the strings exactly as written (RFC 7208 section 3.3), so "${clip(tail, 24)}" and "${clip(head, 24)}" become "${clip(tail + head, 48)}". That is fine only if the split was meant to fall inside one term.`,
        });
      }
    }
  } else if (txt.text.length > TXT_STRING_MAX) {
    out.push({
      tone: "info",
      text: `At ${txt.text.length} characters this is longer than one ${TXT_STRING_MAX}-octet DNS string, so it has to be published as two or more quoted strings. Receivers join them with nothing in between, so put each split where the space already is, or keep the space at the end of the earlier string.`,
    });
  }
  return out;
}

/* ---------------------------------------------------------- addressing */

export type IpResult = { ok: true; value: bigint } | { ok: false; error: string };

/**
 * Dotted quad per the qnum rule of RFC 7208 section 12: four decimal octets,
 * no leading zeros. Section 5.6 also forbids shortened forms such as
 * 192.0.2 for 192.0.2.0/24.
 */
export function parseIpv4(text: string): IpResult {
  const parts = text.split(".");
  if (parts.length !== 4) {
    if (parts.length < 4 && parts.every((p) => /^\d+$/.test(p))) {
      return {
        ok: false,
        error: `"${clip(text)}" has only ${parts.length} parts. SPF does not allow shortened addresses (section 5.6): write 192.0.2.0/24, not 192.0.2.`,
      };
    }
    return { ok: false, error: `"${clip(text)}" is not a dotted-quad IPv4 address such as 192.0.2.10.` };
  }
  let value = 0n;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return { ok: false, error: `"${clip(text)}" has the part "${clip(part, 12)}", which is not a decimal number.` };
    }
    if (part.length > 1 && part[0] === "0") {
      return {
        ok: false,
        error: `"${clip(text)}" has a leading zero in "${part}". The grammar forbids it, because some software reads a leading zero as octal.`,
      };
    }
    if (part.length > 3 || Number(part) > 255) {
      return { ok: false, error: `"${clip(text)}" has the octet ${clip(part, 12)}; each octet is 0 to 255.` };
    }
    value = (value << 8n) | BigInt(Number(part));
  }
  return { ok: true, value };
}

/** IPv6 text per RFC 4291 section 2.2, including the embedded IPv4 form. */
export function parseIpv6(text: string): IpResult {
  if (text === "") return { ok: false, error: "The IPv6 address is empty." };
  if (text.includes("%")) {
    return { ok: false, error: `"${clip(text)}" carries a zone index (%...). Zone indexes are local to one host and have no place in DNS.` };
  }
  if (!/^[0-9A-Fa-f:.]+$/.test(text)) {
    const bad = [...text].find((c) => !/[0-9A-Fa-f:.]/.test(c)) ?? "";
    return { ok: false, error: `"${clip(text)}" contains ${describeChar(bad)}, which cannot appear in an IPv6 address.` };
  }
  let body = text;
  const tail: bigint[] = [];
  const lastColon = body.lastIndexOf(":");
  if (body.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(body.slice(lastColon + 1));
    if (!v4.ok) return { ok: false, error: `The embedded IPv4 part of "${clip(text)}" is invalid. ${v4.error}` };
    tail.push(v4.value >> 16n, v4.value & 0xffffn);
    body = body.slice(0, lastColon + 1);
    // "::1.2.3.4" leaves "::", and "64:ff9b::1.2.3.4" leaves "64:ff9b::".
    // A single trailing colon after a group means the IPv4 part follows it.
    if (body.endsWith(":") && !body.endsWith("::")) body = body.slice(0, -1);
  } else if (text.includes(".")) {
    return { ok: false, error: `"${clip(text)}" mixes dots into the address in a place IPv6 does not allow.` };
  }

  const doubles = body.split("::").length - 1;
  if (doubles > 1) return { ok: false, error: `"${clip(text)}" uses "::" more than once, so the zeros it stands for are ambiguous.` };

  const groupsOf = (s: string): string[] => (s === "" ? [] : s.split(":"));
  let head: string[];
  let rest: string[];
  if (doubles === 1) {
    const [h, t] = body.split("::");
    head = groupsOf(h);
    rest = groupsOf(t);
  } else {
    head = groupsOf(body);
    rest = [];
  }
  for (const g of [...head, ...rest]) {
    if (g === "") return { ok: false, error: `"${clip(text)}" has an empty group, usually a single colon at the start or end.` };
    if (!/^[0-9A-Fa-f]{1,4}$/.test(g)) {
      return { ok: false, error: `"${clip(text)}" has the group "${clip(g, 12)}". A group is one to four hex digits.` };
    }
  }
  const explicit = head.length + rest.length + tail.length;
  if (doubles === 1 ? explicit > 7 : explicit !== 8) {
    return {
      ok: false,
      error:
        doubles === 1
          ? `"${clip(text)}" has too many groups to leave room for "::".`
          : `"${clip(text)}" has ${explicit} groups. An IPv6 address has 8, or fewer with "::" standing in for a run of zeros.`,
    };
  }
  const groups = [
    ...head.map((g) => BigInt(parseInt(g, 16))),
    ...Array<bigint>(8 - explicit).fill(0n),
    ...rest.map((g) => BigInt(parseInt(g, 16))),
    ...tail,
  ];
  if (doubles === 0 && groups.length !== 8) return { ok: false, error: `"${clip(text)}" is not a complete IPv6 address.` };
  let value = 0n;
  for (const g of groups) value = (value << 16n) | g;
  return { ok: true, value };
}

export function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => ((value >> s) & 0xffn).toString()).join(".");
}

/** RFC 5952 canonical text: lowercase, no leading zeros, longest zero run of two or more compressed. */
export function formatIpv6(value: bigint): string {
  const groups: number[] = [];
  for (let s = 112n; s >= 0n; s -= 16n) groups.push(Number((value >> s) & 0xffffn));
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j += 1;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLen).join(":");
  return `${left}::${right}`;
}

function maskOf(bits: number, prefix: number): bigint {
  const total = BigInt(bits);
  const p = BigInt(prefix);
  return ((1n << total) - 1n) ^ ((1n << (total - p)) - 1n);
}

/** How many addresses a prefix holds, exactly up to 2^32 and as a power above that. */
export function addressCount(hostBits: number): string {
  if (hostBits <= 32) return (1n << BigInt(hostBits)).toLocaleString("en-US");
  return `2^${hostBits}`;
}

type CidrResult = { ok: true; value: number } | { ok: false; error: string };

/** ip4-cidr-length and ip6-cidr-length: "0", or a number without a leading zero, within range. */
function parseCidr(text: string, max: number, family: "IPv4" | "IPv6"): CidrResult {
  if (text === "") return { ok: false, error: `has a "/" with no ${family} prefix length after it.` };
  if (!/^\d+$/.test(text)) return { ok: false, error: `has the ${family} prefix length "${clip(text, 12)}", which is not a number.` };
  if (text.length > 1 && text[0] === "0") {
    return { ok: false, error: `has the prefix length /${clip(text, 12)} with a leading zero, which the grammar does not allow.` };
  }
  const n = text.length > 3 ? Infinity : Number(text);
  if (n > max) return { ok: false, error: `has the prefix length /${clip(text, 12)}, out of range for ${family}, where the longest is /${max}.` };
  return { ok: true, value: n };
}

interface Range {
  base: bigint;
  prefix: number;
  label: string;
}

function v4(text: string, prefix: number, label: string): Range {
  const r = parseIpv4(text);
  return { base: r.ok ? r.value : 0n, prefix, label };
}
function v6(text: string, prefix: number, label: string): Range {
  const r = parseIpv6(text);
  return { base: r.ok ? r.value : 0n, prefix, label };
}

const V4_SPECIAL: Range[] = [
  v4("10.0.0.0", 8, "private address space (RFC 1918)"),
  v4("172.16.0.0", 12, "private address space (RFC 1918)"),
  v4("192.168.0.0", 16, "private address space (RFC 1918)"),
  v4("127.0.0.0", 8, "loopback space"),
  v4("169.254.0.0", 16, "link-local space"),
  v4("100.64.0.0", 10, "carrier-grade NAT space (RFC 6598)"),
  v4("192.0.2.0", 24, "a documentation range (RFC 5737)"),
  v4("198.51.100.0", 24, "a documentation range (RFC 5737)"),
  v4("203.0.113.0", 24, "a documentation range (RFC 5737)"),
];
const V6_SPECIAL: Range[] = [
  v6("fc00::", 7, "unique local space (RFC 4193)"),
  v6("fe80::", 10, "link-local space"),
  v6("::1", 128, "the loopback address"),
  v6("2001:db8::", 32, "the documentation range (RFC 3849)"),
];

function specialRange(family: 4 | 6, network: bigint, prefix: number): string | null {
  const bits = family === 4 ? 32 : 128;
  for (const r of family === 4 ? V4_SPECIAL : V6_SPECIAL) {
    if (prefix < r.prefix) continue;
    if ((network & maskOf(bits, r.prefix)) === r.base) return r.label;
  }
  return null;
}

/* --------------------------------------------------------- macro strings */

/** Macro letters allowed in a domain-spec (section 7.2). */
const MACRO_LETTERS = "slodiphv";
/** Allowed only in explanation text, never in a domain-spec. */
const EXP_ONLY_LETTERS = "crt";

interface MacroCheck {
  error: string | null;
  warning: string | null;
  hasMacro: boolean;
  letters: string[];
  /** True when the string ends with a macro-expand, which satisfies domain-end. */
  endsWithMacro: boolean;
}

/** macro-string from section 12, plus the domain-end rule when `domain` is set. */
export function checkMacroString(spec: string, domain: boolean): MacroCheck {
  const out: MacroCheck = { error: null, warning: null, hasMacro: false, letters: [], endsWithMacro: false };
  if (domain && spec === "") {
    out.error = "is missing its domain.";
    return out;
  }
  let i = 0;
  while (i < spec.length) {
    const c = spec[i];
    const code = c.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) {
      out.error = `contains ${describeChar(c)}, which is not allowed here.`;
      return out;
    }
    if (c !== "%") {
      out.endsWithMacro = false;
      i += 1;
      continue;
    }
    const n = spec[i + 1];
    if (n === "%" || n === "_" || n === "-") {
      out.hasMacro = true;
      i += 2;
      out.endsWithMacro = true;
      continue;
    }
    if (n !== "{") {
      out.error = "has a % that does not start a macro. Write %% for a literal percent sign, or a macro such as %{i}.";
      return out;
    }
    const close = spec.indexOf("}", i);
    if (close < 0) {
      out.error = "opens a macro with %{ and never closes it with }.";
      return out;
    }
    const inner = spec.slice(i + 2, close);
    // macro-expand = "%{" macro-letter transformers *delimiter "}"
    const m = /^([A-Za-z])(\d*)([rR]?)([.\-+,/_=]*)$/.exec(inner);
    if (!m) {
      out.error = `has the malformed macro %{${clip(inner, 16)}}. A macro is one letter, an optional digit count, an optional r, then optional delimiters, as in %{ir} or %{d2}.`;
      return out;
    }
    const letter = m[1].toLowerCase();
    if (EXP_ONLY_LETTERS.includes(letter)) {
      out.error = `uses %{${m[1]}}, which section 7.2 allows only in explanation text, not in a domain.`;
      return out;
    }
    if (!MACRO_LETTERS.includes(letter)) {
      out.error = `uses %{${m[1]}}, which is not a macro letter. The letters are s, l, o, d, i, p, h and v.`;
      return out;
    }
    if (m[2] !== "" && /^0+$/.test(m[2])) {
      out.error = `uses a digit transformer of zero in %{${inner}}. Section 7.3 requires it to be nonzero.`;
      return out;
    }
    out.hasMacro = true;
    out.letters.push(letter);
    i = close + 1;
    out.endsWithMacro = true;
  }

  if (!domain || out.endsWithMacro) return out;

  // domain-end = ( "." toplabel [ "." ] ) / macro-expand
  const m = /\.([^.]+)\.?$/.exec(spec);
  if (!m) {
    out.error = spec.includes(".")
      ? "does not end in a top-level label, like the com in example.com, or in a macro."
      : "has no dot in it. A domain here has to end in a top-level label, as in example.com, or in a macro.";
    return out;
  }
  const top = m[1];
  if (!/^(?:[A-Za-z0-9]*[A-Za-z][A-Za-z0-9]*|[A-Za-z0-9]+-[A-Za-z0-9-]*[A-Za-z0-9])$/.test(top)) {
    out.error = /^\d+$/.test(top)
      ? `ends in "${clip(top, 16)}", an all-numeric label. That is an IP address or a typo, not a domain; addresses belong in ip4: or ip6:.`
      : `ends in "${clip(top, 16)}", which is not a valid top-level label (letters and digits, with inner hyphens only).`;
    return out;
  }
  if (!out.hasMacro) {
    const labels = spec.replace(/\.$/, "").split(".");
    if (labels.some((l) => l === "")) out.warning = "has an empty label (two dots in a row), so the name cannot resolve.";
    else if (labels.some((l) => l.length > 63)) out.warning = "has a label longer than 63 characters, which DNS does not allow.";
    else if (spec.replace(/\.$/, "").length > 253) out.warning = "is longer than 253 characters, the most a DNS name can be.";
  }
  return out;
}

/* ----------------------------------------------------------------- terms */

export type Qualifier = "+" | "-" | "~" | "?";

export const QUALIFIER_RESULT: Record<Qualifier, string> = {
  "+": "pass",
  "-": "fail",
  "~": "softfail",
  "?": "neutral",
};

export const MECHANISMS = ["all", "include", "a", "mx", "ptr", "ip4", "ip6", "exists"] as const;
export type MechanismName = (typeof MECHANISMS)[number];

/** Section 4.6.4: these terms cause DNS queries and count against the limit. */
export const LOOKUP_TERMS = new Set(["include", "a", "mx", "ptr", "exists", "redirect"]);
export const LOOKUP_LIMIT = 10;
/** Section 4.6.4: void lookups SHOULD be limited to two. */
export const VOID_LOOKUP_LIMIT = 2;
/** Section 3.4: DNS name plus all TXT text under 450 octets keeps the answer inside 512 byte UDP. */
export const RECORD_SIZE_GUIDE = 450;
/** Terms past this many are not analyzed. No real record comes close. */
export const MAX_TERMS = 200;

export type TermStatus = "evaluated" | "unreached" | "ignored" | "deferred" | "error";

export interface SpfTerm {
  /** 1-based position after the version. */
  position: number;
  raw: string;
  kind: "mechanism" | "modifier" | "invalid";
  /** Lowercase mechanism or modifier name. Empty when there was none. */
  name: string;
  qualifier: Qualifier;
  explicitQualifier: boolean;
  /** The domain-spec, or the address text for ip4 and ip6, or a modifier value. */
  target: string | null;
  ip4Cidr: number | null;
  ip6Cidr: number | null;
  /** Canonical network for ip4 and ip6, e.g. "192.0.2.0/24". */
  network: string | null;
  hasMacro: boolean;
  macroLetters: string[];
  /** This kind of term costs a DNS query (section 4.6.4). */
  lookup: boolean;
  status: TermStatus;
  error: string | null;
  /** Term-level advice that is not a syntax error. */
  notes: Finding[];
  /** What the term does, in one or two sentences. */
  summary: string;
}

function blankTerm(raw: string, position: number): SpfTerm {
  return {
    position,
    raw,
    kind: "invalid",
    name: "",
    qualifier: "+",
    explicitQualifier: false,
    target: null,
    ip4Cidr: null,
    ip6Cidr: null,
    network: null,
    hasMacro: false,
    macroLetters: [],
    lookup: false,
    status: "error",
    error: null,
    notes: [],
    summary: "",
  };
}

/** Likely intended mechanism for a misspelled name. */
const SUGGESTIONS: Record<string, string> = {
  ipv4: "ip4:",
  ipv6: "ip6:",
  ip: "ip4: or ip6:",
  inc: "include:",
  includes: "include:",
  incl: "include:",
  exist: "exists:",
  mxs: "mx",
  "a+mx": "a mx",
  any: "all",
};

function applyDomain(t: SpfTerm, spec: string, what: string): void {
  const check = checkMacroString(spec, true);
  t.target = spec;
  t.hasMacro = check.hasMacro;
  t.macroLetters = check.letters;
  if (check.error) t.error = `The domain in ${what} ${check.error}`;
  else if (check.warning) t.notes.push({ tone: "warn", text: `Term ${t.position}: the domain "${clip(spec)}" ${check.warning}` });
}

/** Split a trailing dual-cidr-length ("/24", "//64", "/24//64") off an a or mx argument. */
function splitDualCidr(t: SpfTerm, value: string): string {
  const m = /^(.*?)(?:\/(\d*))?(?:\/\/(\d*))?$/s.exec(value);
  const spec = m ? m[1] : value;
  if (m && m[2] !== undefined) {
    const c = parseCidr(m[2], 32, "IPv4");
    if (c.ok) t.ip4Cidr = c.value;
    else t.error ??= `The term ${c.error}`;
  }
  if (m && m[3] !== undefined) {
    const c = parseCidr(m[3], 128, "IPv6");
    if (c.ok) t.ip6Cidr = c.value;
    else t.error ??= `The term ${c.error}`;
  }
  return spec;
}

function parseIpTerm(t: SpfTerm, family: 4 | 6, value: string): void {
  const slash = value.indexOf("/");
  const addrText = slash < 0 ? value : value.slice(0, slash);
  const cidrText = slash < 0 ? null : value.slice(slash + 1);
  t.target = value;

  if (family === 4 && addrText.includes(":")) {
    t.error = `"${clip(addrText)}" is an IPv6 address. Use ip6:${clip(value)} for it.`;
    return;
  }
  if (family === 6 && !addrText.includes(":") && /^[\d.]+$/.test(addrText)) {
    t.error = `"${clip(addrText)}" is an IPv4 address. Use ip4:${clip(value)} for it.`;
    return;
  }
  const parsed = family === 4 ? parseIpv4(addrText) : parseIpv6(addrText);
  if (!parsed.ok) {
    t.error = parsed.error;
    return;
  }
  const bits = family === 4 ? 32 : 128;
  let prefix = bits;
  if (cidrText !== null) {
    const c = parseCidr(cidrText, bits, family === 4 ? "IPv4" : "IPv6");
    if (!c.ok) {
      t.error = `The term ${c.error}`;
      return;
    }
    prefix = c.value;
  }
  if (family === 4) t.ip4Cidr = prefix;
  else t.ip6Cidr = prefix;

  const mask = maskOf(bits, prefix);
  const network = parsed.value & mask;
  const fmt = family === 4 ? formatIpv4 : formatIpv6;
  t.network = `${fmt(network)}/${prefix}`;

  if ((parsed.value & ~mask & ((1n << BigInt(bits)) - 1n)) !== 0n) {
    t.notes.push({
      tone: "info",
      text: `Term ${t.position}: ${clip(value)} has host bits set past /${prefix}. Receivers compare only the first ${prefix} bits, so it means ${t.network}; writing that is clearer.`,
    });
  }
  const passes = t.qualifier === "+";
  if (prefix === 0 && passes) {
    t.notes.push({
      tone: "danger",
      text: `Term ${t.position}: ${clip(t.raw)} matches every ${family === 4 ? "IPv4" : "IPv6"} address on the internet, the same as +all for those senders.`,
    });
  } else if (passes && ((family === 4 && prefix <= 8) || (family === 6 && prefix < 16))) {
    t.notes.push({
      tone: "danger",
      text: `Term ${t.position}: ${t.network} authorizes ${addressCount(bits - prefix)} addresses. No mail provider needs a block that size, so this is almost certainly a typo in the prefix length.`,
    });
  } else if (passes && family === 4 && prefix < 16) {
    t.notes.push({
      tone: "info",
      text: `Term ${t.position}: ${t.network} authorizes ${addressCount(bits - prefix)} addresses. Large providers do publish blocks this size, but check that every address in it is yours or your provider's.`,
    });
  }
  const special = specialRange(family, network, prefix);
  if (special) {
    t.notes.push({
      tone: "info",
      text: special.includes("documentation")
        ? `Term ${t.position}: ${t.network} is ${special}. Fine in an example; in a published record it matches nothing, because no real mail comes from it.`
        : `Term ${t.position}: ${t.network} is ${special}. Mail from the public internet never arrives from it, so the term matches nothing at a receiver.`,
    });
  }
}

function parseModifier(t: SpfTerm, name: string, value: string): void {
  t.kind = "modifier";
  t.name = name.toLowerCase();
  t.target = value;
  if (t.name === "redirect" || t.name === "exp") {
    applyDomain(t, value, `${t.name}=`);
    t.lookup = t.name === "redirect";
    return;
  }
  const check = checkMacroString(value, false);
  if (check.error) t.error = `The value of the unknown modifier ${name}= ${check.error}`;
  t.hasMacro = check.hasMacro;
  t.macroLetters = check.letters;
}

/** Parse one term. Section 4.6.1: a modifier has "=" right after its name, before any ":" or "/". */
export function parseTerm(raw: string, position: number): SpfTerm {
  const t = blankTerm(raw, position);
  let body = raw;
  if ("+-~?".includes(body[0] ?? "")) {
    t.qualifier = body[0] as Qualifier;
    t.explicitQualifier = true;
    body = body.slice(1);
  }

  const mod = /^([A-Za-z][A-Za-z0-9_.-]*)=([\s\S]*)$/.exec(body);
  if (mod) {
    if (t.explicitQualifier) {
      t.name = mod[1].toLowerCase();
      t.error = `Modifiers such as ${mod[1]}= do not take a qualifier. Remove the "${t.qualifier}".`;
      return t;
    }
    parseModifier(t, mod[1], mod[2]);
    return t;
  }

  const split = /^([^:/=]*)([\s\S]*)$/.exec(body);
  const name = (split?.[1] ?? "").toLowerCase();
  const rest = split?.[2] ?? "";
  t.name = name;

  if (name === "") {
    t.error = t.explicitQualifier ? `A qualifier "${t.qualifier}" with no mechanism after it.` : "A term with no mechanism name.";
    return t;
  }
  if (name === "redirect" || name === "exp") {
    t.error = `${name} is a modifier and takes "=", not a colon: write ${name}=${clip(rest.replace(/^:/, ""))}.`;
    return t;
  }
  if (!(MECHANISMS as readonly string[]).includes(name)) {
    const hint = SUGGESTIONS[name];
    t.error = `"${clip(name, 24)}" is not an SPF mechanism${hint ? `; you probably meant ${hint}` : ""}. Unknown mechanisms are a permerror (section 5). The mechanisms are all, include, a, mx, ptr, ip4, ip6 and exists.`;
    return t;
  }

  t.kind = "mechanism";
  const mech = name as MechanismName;
  t.lookup = LOOKUP_TERMS.has(mech);

  switch (mech) {
    case "all":
      if (rest !== "") t.error = `"all" takes no argument, but it is followed by "${clip(rest, 24)}".`;
      break;
    case "include":
    case "exists": {
      if (!rest.startsWith(":") || rest.length === 1) {
        t.error = `"${mech}" needs a domain after a colon, as in ${mech === "include" ? "include:_spf.example.net" : "exists:%{i}._spf.example.net"}.`;
        break;
      }
      const spec = rest.slice(1);
      if (/\/\d*$/.test(spec)) {
        t.error = `"${mech}" does not take a prefix length; only a, mx, ip4 and ip6 do.`;
        break;
      }
      applyDomain(t, spec, `${mech}:`);
      break;
    }
    case "a":
    case "mx": {
      if (rest === "") break;
      if (rest[0] === ":") {
        if (rest.length === 1) {
          t.error = `"${mech}:" has a colon with no domain after it. Drop the colon to mean the domain being checked.`;
          break;
        }
        const spec = splitDualCidr(t, rest.slice(1));
        if (!t.error) applyDomain(t, spec, `${mech}:`);
      } else if (rest[0] === "/") {
        const spec = splitDualCidr(t, rest);
        if (spec !== "" && !t.error) t.error = `"${clip(rest, 24)}" after ${mech} is not a prefix length.`;
      } else {
        t.error = `"${clip(rest, 24)}" after ${mech} is not valid. Use ${mech}:domain, ${mech}/24, or ${mech} alone.`;
      }
      break;
    }
    case "ptr": {
      if (rest === "") break;
      if (rest[0] !== ":" || rest.length === 1) {
        t.error = rest[0] === "/" ? `"ptr" does not take a prefix length.` : `"${clip(rest, 24)}" after ptr is not valid. Use ptr or ptr:domain.`;
        break;
      }
      applyDomain(t, rest.slice(1), "ptr:");
      break;
    }
    case "ip4":
    case "ip6": {
      if (!rest.startsWith(":") || rest.length === 1) {
        t.error = `"${mech}" needs an address after a colon, as in ${mech === "ip4" ? "ip4:192.0.2.0/24" : "ip6:2001:db8::/32"}.`;
        break;
      }
      parseIpTerm(t, mech === "ip4" ? 4 : 6, rest.slice(1));
      break;
    }
  }
  return t;
}

/* ------------------------------------------------------------- analysis */

export interface NestedTarget {
  position: number;
  kind: "include" | "redirect";
  domain: string;
  hasMacro: boolean;
  /** A command the reader can run, or null when the name holds macros. */
  digCommand: string | null;
}

export interface SpfAnalysis {
  record: string;
  terms: SpfTerm[];
  /** Syntax errors. Any one of them makes check_host() return permerror. */
  errors: string[];
  findings: Finding[];
  /** Lookup terms that check_host() would evaluate in the worst case, this record only. */
  lookupCount: number;
  /** Lookup terms present at all, including ones never reached. */
  lookupTermsPresent: number;
  allTerm: SpfTerm | null;
  redirect: SpfTerm | null;
  exp: SpfTerm | null;
  /** The result for a sender no mechanism matches. */
  defaultResult: string;
  steps: string[];
  nested: NestedTarget[];
  truncated: boolean;
}

function domainWord(t: SpfTerm, domain: string): string {
  if (t.target) return t.target;
  return domain ? domain : "the domain being checked";
}

function cidrPhrase(t: SpfTerm): string {
  const parts: string[] = [];
  if (t.ip4Cidr !== null) parts.push(`the /${t.ip4Cidr} around each IPv4 address`);
  if (t.ip6Cidr !== null) parts.push(`the /${t.ip6Cidr} around each IPv6 address`);
  return parts.length ? `, widened to ${parts.join(" and ")}` : "";
}

function summarize(t: SpfTerm, domain: string, hasAll: boolean): string {
  const result = QUALIFIER_RESULT[t.qualifier];
  if (t.kind === "invalid") return "Not valid, so the whole record is a permerror.";
  if (t.kind === "modifier") {
    if (t.name === "redirect") {
      const base = `If no mechanism matches, the check is rerun against ${t.target} and its result is used as it is, including the result of its own all.`;
      return hasAll ? `${base} Ignored here, because this record has an all mechanism (section 6.1).` : base;
    }
    if (t.name === "exp") {
      return `On a fail, a receiver may fetch the TXT record at ${t.target}, expand its macros, and quote the text in its rejection. Not counted against the lookup limit.`;
    }
    return "Not defined by RFC 7208. Receivers ignore modifiers they do not recognize (section 6).";
  }
  const d = domainWord(t, domain);
  switch (t.name as MechanismName) {
    case "all":
      return `Always matches. Every sender no earlier term matched gets ${result}.`;
    case "include":
      return `Runs a separate SPF check against ${d}. Matches only if that check returns pass; fail, softfail or neutral there just means move on here. A temperror or permerror there, or no SPF record at all, makes this whole check an error.`;
    case "a":
      return `Matches if the sender's IP is an address of ${d}: its A records for an IPv4 sender, its AAAA records for IPv6${cidrPhrase(t)}.`;
    case "mx":
      return `Looks up the MX hosts of ${d}, then their addresses, and matches if the sender is one of them${cidrPhrase(t)}. Addresses are looked up for no more than 10 MX hosts; more is a permerror.`;
    case "ptr":
      return `Reverse-resolves the sender's IP, keeps the names that resolve forward to that same IP, and matches if one is ${d} or a subdomain of it. Deprecated: section 5.5 says not to publish it.`;
    case "ip4":
    case "ip6": {
      const prefix = t.name === "ip4" ? t.ip4Cidr ?? 32 : t.ip6Cidr ?? 128;
      const bits = (t.name === "ip4" ? 32 : 128) - prefix;
      const count = addressCount(bits);
      return `Matches a sender inside ${t.network} (${count} ${count === "1" ? "address" : "addresses"}). No DNS lookup.`;
    }
    case "exists":
      return `Expands ${d} and asks for an A record, even when the sender is on IPv6. Any answer at all is a match; the address returned does not matter.`;
  }
  return "";
}

function digFor(spec: string, hasMacro: boolean): string | null {
  if (hasMacro) return null;
  return `dig +short TXT ${spec.replace(/\.$/, "")}`;
}

/**
 * Analyze one SPF record. `domain` is optional context: the name the record
 * is published at, which is what a bare a or mx means and what an include
 * of itself would loop on.
 */
export function analyzeSpf(record: string, domain = ""): SpfAnalysis {
  const errors: string[] = [];
  const findings: Finding[] = [];
  const self = normalizeDomain(domain);

  const versionOk = /^v=spf1(?: |$)/i.test(record);
  if (!versionOk) errors.push('The record does not start with "v=spf1" followed by a space, so receivers do not treat it as SPF.');
  if (versionOk && !record.startsWith("v=spf1")) {
    findings.push({
      tone: "info",
      text: `The version is written "${record.slice(0, 6)}". The grammar's literals are case-insensitive, but section 4.5 selects records that begin with exactly v=spf1, so lowercase is the spelling every receiver is sure to accept.`,
    });
  }
  const body = versionOk ? record.slice(6) : record;

  // Section 12: terms are separated by SP only. Name the first stray
  // whitespace of each kind, with its position in the record.
  const seen = new Set<string>();
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === " ") continue;
    const code = ch.codePointAt(0) ?? 0;
    if (/\s/.test(ch) || code === 0x200b) {
      const key = describeChar(ch);
      if (seen.has(key)) continue;
      seen.add(key);
      errors.push(
        `There is ${key} at character ${i + (versionOk ? 7 : 1)}. Only plain spaces separate SPF terms; ${
          code === 0xa0 ? "a non-breaking space usually arrives by copying the record out of a web page or document, and " : ""
        }receivers read it as part of a term.`,
      );
    }
  }

  let words = body.split(/[\s​]+/).filter(Boolean);
  const truncated = words.length > MAX_TERMS;
  if (truncated) {
    findings.push({ tone: "warn", text: `The record has ${words.length} terms. Only the first ${MAX_TERMS} are analyzed here.` });
    words = words.slice(0, MAX_TERMS);
  }
  const terms = words.map((w, i) => parseTerm(w, i + 1));

  for (const t of terms) if (t.error) errors.push(`Term ${t.position} "${clip(t.raw)}": ${t.error}`);

  // Modifiers: each of redirect and exp at most once (section 6).
  const redirects = terms.filter((t) => t.kind === "modifier" && t.name === "redirect");
  const exps = terms.filter((t) => t.kind === "modifier" && t.name === "exp");
  if (redirects.length > 1) errors.push(`redirect= appears ${redirects.length} times. Section 6 allows it once; more is a permerror.`);
  if (exps.length > 1) errors.push(`exp= appears ${exps.length} times. Section 6 allows it once; more is a permerror.`);

  const allTerm = terms.find((t) => t.kind === "mechanism" && t.name === "all" && !t.error) ?? null;
  const hasAll = terms.some((t) => t.kind === "mechanism" && t.name === "all");
  const redirect = redirects.find((t) => !t.error) ?? null;
  const exp = exps.find((t) => !t.error) ?? null;

  // Status in evaluation order.
  let pastAll = false;
  for (const t of terms) {
    if (t.error) {
      t.status = "error";
    } else if (t.kind === "mechanism") {
      t.status = pastAll ? "unreached" : "evaluated";
      if (t.name === "all") pastAll = true;
    } else if (t.name === "redirect") {
      t.status = hasAll ? "ignored" : "evaluated";
    } else if (t.name === "exp") {
      t.status = "deferred";
    } else {
      t.status = "ignored";
    }
    t.summary = summarize(t, domain, hasAll);
  }

  const lookupCount = terms.filter((t) => t.lookup && t.status === "evaluated").length;
  const lookupTermsPresent = terms.filter((t) => t.lookup && !t.error).length;

  /* -------- qualifier on all, and what happens to an unmatched sender */
  let defaultResult: string;
  if (allTerm) {
    defaultResult = QUALIFIER_RESULT[allTerm.qualifier];
    const q = allTerm.qualifier;
    if (q === "+") {
      findings.push({
        tone: "danger",
        text: allTerm.explicitQualifier
          ? `+all passes every host on the internet. Anyone can send mail as this domain and get an SPF pass.`
          : `A bare "all" carries the implied + qualifier, so it is +all: every host on the internet passes. You almost certainly meant -all or ~all.`,
      });
    } else if (q === "?") {
      findings.push({
        tone: "warn",
        text: "?all gives every unlisted sender neutral, which receivers treat the same as having no SPF policy. It is useful only while you are still finding your senders.",
      });
    } else if (q === "~") {
      findings.push({
        tone: "info",
        text: "~all gives unlisted senders softfail: accept, but treat with suspicion. Under a DMARC policy that enforces, DMARC makes the final decision, so softfail is a common and reasonable choice.",
      });
    } else {
      findings.push({ tone: "ok", text: "-all fails every sender not listed, the strictest ending." });
    }
  } else if (redirect) {
    defaultResult = `whatever ${redirect.target} returns`;
  } else {
    defaultResult = "neutral";
    if (versionOk && terms.length > 0) {
      findings.push({
        tone: "warn",
        text: "There is no all and no redirect, so a sender that matches nothing gets neutral (section 4.7), exactly as if the record ended in ?all. End it with -all or ~all.",
      });
    }
  }

  const mechanisms = terms.filter((t) => t.kind === "mechanism" && !t.error);
  if (versionOk && terms.length === 0) {
    findings.push({
      tone: "warn",
      text: "The record has no terms at all, so every sender gets neutral. A domain that sends no mail should publish v=spf1 -all.",
    });
  } else if (mechanisms.length === 1 && allTerm && allTerm.qualifier === "-" && terms.length === 1) {
    findings.push({
      tone: "ok",
      text: "This authorizes no sender at all, which is the correct record for a domain that never sends mail.",
    });
  }

  const unreached = terms.filter((t) => t.status === "unreached");
  if (unreached.length) {
    findings.push({
      tone: "warn",
      text: `${unreached.length === 1 ? "One term comes" : `${unreached.length} terms come`} after all and can never match: ${unreached.map((t) => t.raw).join(", ")}. Section 5.1 says mechanisms after all are ignored, so move them before it.`,
    });
  }
  if (redirect && hasAll) {
    findings.push({
      tone: "warn",
      text: `redirect=${redirect.target} is ignored, because section 6.1 drops redirect whenever the record has an all mechanism, wherever the two sit.`,
    });
  } else if (redirect && terms[terms.length - 1] !== redirect) {
    findings.push({
      tone: "info",
      text: "redirect= is not the last term. It still only applies after every mechanism has failed to match, but section 6.1 asks for it to be written last so the record reads in the order it runs.",
    });
  }

  /* -------- per-term advice */
  for (const t of terms) {
    findings.push(...t.notes);
    if (t.kind === "mechanism" && t.name === "ptr" && !t.error) {
      findings.push({
        tone: "warn",
        text: `Term ${t.position} uses ptr. Section 5.5 says it SHOULD NOT be published: it is slow, fails under DNS errors, and loads the reverse zones. Replace it with ip4, ip6 or a.`,
      });
    }
    if (t.macroLetters.includes("p")) {
      findings.push({
        tone: "warn",
        text: `Term ${t.position} uses the %{p} macro, which costs the same reverse lookups as ptr. Section 7.3 says it SHOULD NOT be used.`,
      });
    }
    if (t.kind === "modifier" && !t.error && t.status === "ignored" && t.name !== "redirect") {
      const value = t.target ?? "";
      if ((MECHANISMS as readonly string[]).includes(t.name) && t.name !== "all") {
        findings.push({
          tone: "danger",
          text: `"${clip(t.raw)}" uses = where the ${t.name} mechanism takes a colon, so it is read as an unknown modifier named ${t.name}, and receivers ignore unknown modifiers. Nothing it was meant to authorize is authorized. Write ${t.name}:${clip(value)}.`,
        });
      } else if (t.name === "v") {
        findings.push({
          tone: "warn",
          text: `"${clip(t.raw)}" looks like a second version tag. It is read as an unknown modifier and ignored, which usually means two records were pasted into one.`,
        });
      } else {
        findings.push({
          tone: "info",
          text: `${t.name}= is not defined by RFC 7208, so receivers ignore it (section 6).`,
        });
      }
    }
    if (self && (t.name === "include" || t.name === "redirect") && !t.error && t.target && normalizeDomain(t.target) === self) {
      findings.push({
        tone: "danger",
        text: `Term ${t.position} points back at ${self}, the domain this record is published at. Evaluation loops until it hits the lookup limit, which is a permerror.`,
      });
    }
  }

  // The same term twice can never match anything the first copy did not.
  const counts = new Map<string, number>();
  for (const t of terms) if (!t.error && t.kind === "mechanism") counts.set(t.raw.toLowerCase(), (counts.get(t.raw.toLowerCase()) ?? 0) + 1);
  for (const [raw, n] of counts) {
    if (n > 1) {
      const lookup = LOOKUP_TERMS.has(parseTerm(raw, 0).name);
      findings.push({
        tone: lookup ? "warn" : "info",
        text: `"${clip(raw)}" appears ${n} times. The later copies can never match anything the first did not${lookup ? ", and each still costs a DNS lookup" : ""}.`,
      });
    }
  }

  /* -------- the lookup budget */
  const nested: NestedTarget[] = terms
    .filter((t) => (t.name === "include" || t.name === "redirect") && t.status === "evaluated" && t.target)
    .map((t) => ({
      position: t.position,
      kind: t.name as "include" | "redirect",
      domain: t.target as string,
      hasMacro: t.hasMacro,
      digCommand: digFor(t.target as string, t.hasMacro),
    }));

  if (lookupCount > LOOKUP_LIMIT) {
    findings.push({
      tone: "danger",
      text: `${lookupCount} terms that cost a DNS lookup are evaluated, before anything inside an include is counted. The limit is ${LOOKUP_LIMIT} for the whole evaluation (section 4.6.4), so any sender not matched before the eleventh lookup gets permerror.`,
    });
  } else if (lookupCount === LOOKUP_LIMIT) {
    findings.push({
      tone: "warn",
      text: `${lookupCount} lookups in this record alone, which is the whole budget. Any lookup inside an include or redirect target pushes the evaluation past ${LOOKUP_LIMIT} and into permerror.`,
    });
  } else if (nested.length) {
    findings.push({
      tone: lookupCount >= 8 ? "warn" : "info",
      text: `${lookupCount} of ${LOOKUP_LIMIT} lookups are in this record. Each include and redirect target spends more from the same budget, which can only be counted by querying DNS, and this page makes no network requests. Run the dig commands in the lookup budget and enter what you find.`,
    });
  } else if (versionOk) {
    findings.push({
      tone: "ok",
      text: `${lookupCount} of ${LOOKUP_LIMIT} DNS lookups, and nothing nested, so that is the full count.`,
    });
  }

  // Void lookups: answers with no records, or NXDOMAIN (section 4.6.4).
  const evaluated = terms.filter((t) => t.status === "evaluated");
  const existsCount = evaluated.filter((t) => t.name === "exists").length;
  const voidCapable = evaluated.filter((t) => ["a", "mx", "ptr", "exists"].includes(t.name));
  if (existsCount > VOID_LOOKUP_LIMIT) {
    findings.push({
      tone: "warn",
      text: `${existsCount} exists terms. Each returns no answer for every sender it does not match, and receivers SHOULD stop after ${VOID_LOOKUP_LIMIT} void lookups (section 4.6.4), so a sender that matches none of them gets permerror instead of reaching all.`,
    });
  } else if (voidCapable.length > VOID_LOOKUP_LIMIT) {
    findings.push({
      tone: "info",
      text: `${voidCapable.length} a, mx, ptr or exists terms can each come back empty. Receivers SHOULD stop after ${VOID_LOOKUP_LIMIT} empty or NXDOMAIN answers (section 4.6.4), so names left pointing at retired hosts are not harmless clutter. An a term checked for an IPv6 sender asks for AAAA, so a host with only an A record produces one.`,
    });
  }

  if (record.length > RECORD_SIZE_GUIDE) {
    findings.push({
      tone: "warn",
      text: `The record is ${record.length} characters. Section 3.4 suggests keeping the DNS name plus all the TXT text at that name under ${RECORD_SIZE_GUIDE} octets, so the answer fits a 512-byte UDP response without falling back to TCP.`,
    });
  }

  if (errors.length) {
    findings.push({
      tone: "danger",
      text: `${errors.length === 1 ? "One syntax error" : `${errors.length} syntax errors`}. Any syntax error anywhere makes check_host() stop with permerror before testing a single term (section 4.6), so the record protects nothing until ${errors.length === 1 ? "it is" : "they are"} fixed.`,
    });
  }

  /* -------- evaluation order, as steps */
  const steps: string[] = [];
  if (errors.length) {
    steps.push("As written, the syntax errors make every check return permerror. This is the order once they are fixed.");
  }
  let n = 0;
  for (const t of terms) {
    if (t.kind !== "mechanism" || t.status !== "evaluated") continue;
    n += 1;
    const result = QUALIFIER_RESULT[t.qualifier];
    if (t.name === "all") {
      steps.push(`${n}. ${t.raw} always matches, so every sender still unmatched gets ${result}. Evaluation ends here.`);
    } else {
      steps.push(`${n}. ${t.raw}: if the sender matches, the result is ${result} and evaluation stops${t.lookup ? " (1 DNS lookup)" : ""}.`);
    }
  }
  if (!allTerm) {
    if (redirect) steps.push(`${n + 1}. Nothing matched, so follow redirect=${redirect.target} and use its result (1 DNS lookup, plus whatever that record spends).`);
    else steps.push(`${n + 1}. Nothing matched and there is no all or redirect, so the result is neutral (section 4.7).`);
  }
  if (exp) steps.push(`If the result is fail, exp=${exp.target} supplies the explanation text a receiver may quote.`);
  if (unreached.length) steps.push(`Never tested, because they follow all: ${unreached.map((t) => t.raw).join(", ")}.`);

  return {
    record,
    terms,
    errors,
    findings: sortFindings(findings),
    lookupCount,
    lookupTermsPresent,
    allTerm,
    redirect,
    exp,
    defaultResult: errors.length ? "permerror" : defaultResult,
    steps,
    nested,
    truncated,
  };
}

export interface LookupTotal {
  total: number;
  /** True when every nested target has a count entered. */
  complete: boolean;
  missing: number;
}

/** Direct lookups plus the counts the reader entered for nested targets. */
export function lookupTotal(analysis: SpfAnalysis, nestedCounts: Record<number, number | undefined>): LookupTotal {
  let total = analysis.lookupCount;
  let missing = 0;
  for (const target of analysis.nested) {
    const n = nestedCounts[target.position];
    if (n === undefined || !Number.isFinite(n) || n < 0) missing += 1;
    else total += Math.floor(n);
  }
  return { total, complete: missing === 0, missing };
}

/** Lines that look like SPF but are not selected by section 4.5, with the reason. */
function rejectReason(text: string): string | null {
  if (/^v=spf1\S/i.test(text)) return `starts with "${clip(text, 10)}", but the version must be followed by a space or nothing at all, so receivers skip it.`;
  if (/^\s+v=spf1/i.test(text)) return "starts with a space inside the quotes, so it does not begin with v=spf1 and receivers skip it.";
  if (/^spf2\.0\//i.test(text)) return "is a Sender ID record (spf2.0). Sender ID is an abandoned experiment, and SPF receivers ignore it.";
  return null;
}

export interface SpfInputResult {
  kind: "empty" | "error" | "ok";
  message: string | null;
  txt: TxtRecord[];
  spf: { txt: TxtRecord; analysis: SpfAnalysis }[];
  /** Findings about the paste as a whole: multiple records, ignored lines. */
  findings: Finding[];
  /** An owner name found in pasted dig output, for the domain field. */
  ownerDomain: string | null;
}

/** Analyze a paste: one or more TXT records, one per line. */
export function analyzeSpfInput(input: string, domain = ""): SpfInputResult {
  const base: SpfInputResult = { kind: "empty", message: null, txt: [], spf: [], findings: [], ownerDomain: null };
  if (input.trim() === "") return base;

  const extraction = extractTxtRecords(input);
  if (extraction.error) return { ...base, kind: "error", message: extraction.error };
  const txt = extraction.records;
  const findings: Finding[] = [];
  if (extraction.skipped) {
    findings.push({ tone: "info", text: `Only the first ${MAX_TXT_LINES} lines were read; ${extraction.skipped} more were skipped.` });
  }

  const spfTxt = txt.filter((r) => /^v=spf1(?: |$)/i.test(r.text));
  const owner = spfTxt.find((r) => r.owner)?.owner ?? null;
  const ownerDomain = owner ? normalizeDomain(owner) : null;

  if (spfTxt.length === 0) {
    const reasons = txt.map((r) => ({ r, why: rejectReason(r.text) })).filter((x) => x.why);
    if (reasons.length) {
      return { ...base, kind: "error", txt, message: `Line ${reasons[0].r.line} ${reasons[0].why}` };
    }
    if (txt.some((r) => /^v=DMARC1/i.test(r.text))) {
      return { ...base, kind: "error", txt, message: "That is a DMARC record, not SPF. DMARC lives at _dmarc.<domain>; SPF is a TXT record at the domain itself, starting with v=spf1." };
    }
    const quotedErr = txt.find((r) => r.error);
    return {
      ...base,
      kind: "error",
      txt,
      message: quotedErr
        ? `Line ${quotedErr.line} ${quotedErr.error}.`
        : 'No line starts with "v=spf1". Paste the TXT record from the domain itself, for example the output of dig +short TXT example.com.',
    };
  }

  if (spfTxt.length > 1) {
    findings.push({
      tone: "danger",
      text: `${spfTxt.length} records start with v=spf1. A domain may publish only one; with more, receivers return permerror (section 4.5) and none of them is used. Merge them into a single record.`,
    });
  }
  const others = txt.length - spfTxt.length;
  if (others > 0) {
    findings.push({
      tone: "info",
      text: `${others === 1 ? "One other TXT line was" : `${others} other TXT lines were`} ignored. Receivers discard TXT records that do not start with v=spf1, so verification tokens and the like do not interfere.`,
    });
  }

  const effectiveDomain = domain.trim() !== "" ? domain : ownerDomain ?? "";
  const spf = spfTxt.map((r) => {
    const analysis = analyzeSpf(r.text, effectiveDomain);
    analysis.findings = sortFindings([...chunkFindings(r), ...analysis.findings]);
    return { txt: r, analysis };
  });
  return { kind: "ok", message: null, txt, spf, findings: sortFindings(findings), ownerDomain };
}
