/**
 * IPv4 notation conversion, and the parsers that disagree about notation.
 *
 * An IPv4 address is one unsigned 32-bit integer. Everything here reads a
 * string into that integer, or writes the integer back out in another
 * notation. Parsing is modeled on four real behaviors, because the same
 * string can mean different addresses (or nothing) depending on which one
 * reads it:
 *
 *   strict      inet_pton (POSIX), modern Python ipaddress and Go net.ParseIP
 *   inet_aton   the 4.2BSD form kept by glibc and the BSDs
 *   whatwg      the URL Standard's host parser, used by browsers and Node URL
 *   naive       four decimal parts with leading zeros ignored
 *
 * Part values go through BigInt so a part like 0xFFFFFFFFFFFF is rejected
 * for its true size rather than after a lossy conversion to a double.
 */

/** Longest input read, in characters. A real address in any notation is far shorter. */
export const MAX_INPUT_CHARS = 256;

export type Radix = 8 | 10 | 16;

export interface Part {
  /** The part exactly as typed. */
  text: string;
  radix: Radix;
  value: bigint;
  /** How many bits of the address this part fills. */
  bits: number;
}

/**
 * invalid: the parser refuses the string. domain: the URL parser would treat
 * it as a host name and ask DNS. unmodeled: the result depends on a step this
 * page does not implement (IDNA mapping of non-ASCII text).
 */
export type FailKind = "invalid" | "domain" | "unmodeled";

export type ParseOutcome =
  | { ok: true; value: number; parts: Part[]; note?: string }
  | { ok: false; kind: FailKind; reason: string };

const C_SPACE = /[ \t\n\v\f\r]/;

function fail(reason: string, kind: FailKind = "invalid"): ParseOutcome {
  return { ok: false, kind, reason };
}

/** Widths the parts fill: every part but the last is one byte, the last takes the rest. */
function partWidths(count: number): number[] {
  const widths = new Array<number>(count).fill(8);
  widths[count - 1] = 32 - 8 * (count - 1);
  return widths;
}

function combine(values: bigint[]): number {
  let total = 0n;
  const widths = partWidths(values.length);
  let shift = 32;
  for (let i = 0; i < values.length; i += 1) {
    shift -= widths[i];
    total += values[i] << BigInt(shift);
  }
  return Number(total);
}

function radixName(radix: Radix): string {
  return radix === 16 ? "hex" : radix === 8 ? "octal" : "decimal";
}

/* ------------------------------------------------------------- strict */

/**
 * inet_pton for AF_INET: exactly four decimal parts, each 0 to 255. glibc,
 * Python 3.9.5 and later (CVE-2021-29921) and Go 1.17 and later
 * (CVE-2021-29923) also refuse a leading zero, so 010 is an error rather
 * than a guess between ten and eight.
 */
export function parseStrict(text: string): ParseOutcome {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return fail(`Needs exactly four parts separated by dots. This has ${parts.length}.`);
  }
  const values: bigint[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) {
      return fail(`"${part}" is not a decimal number. Only the digits 0 to 9 are allowed.`);
    }
    if (part.length > 1 && part.startsWith("0")) {
      return fail(`"${part}" has a leading zero, which strict parsers reject because it is ambiguous.`);
    }
    if (part.length > 3 || Number(part) > 255) return fail(`"${part}" is above 255.`);
    values.push(BigInt(part));
  }
  return {
    ok: true,
    value: combine(values),
    parts: parts.map((p, i) => ({ text: p, radix: 10, value: values[i], bits: 8 })),
  };
}

/* ---------------------------------------------------------- inet_aton */

/**
 * One part as C's strtoul(s, &end, 0) reads it, which is what glibc's
 * inet_aton calls: 0x or 0X then hex, a leading 0 then octal, otherwise
 * decimal. Returns the value and how many characters were consumed.
 */
function cNumber(text: string): { value: bigint; radix: Radix; used: number } | null {
  if (!/^[0-9]/.test(text)) return null;
  if (/^0[xX][0-9a-fA-F]/.test(text)) {
    const digits = /^0[xX]([0-9a-fA-F]+)/.exec(text)![1];
    return { value: BigInt(`0x${digits}`), radix: 16, used: 2 + digits.length };
  }
  if (text.startsWith("0")) {
    const digits = /^0([0-7]*)/.exec(text)![1];
    return { value: digits === "" ? 0n : BigInt(`0o${digits}`), radix: 8, used: 1 + digits.length };
  }
  const digits = /^[0-9]+/.exec(text)![0];
  return { value: BigInt(digits), radix: 10, used: digits.length };
}

/**
 * inet_aton as implemented in glibc (resolv/inet_addr.c) and inherited from
 * 4.2BSD. One to four parts: a (32 bits), a.b (8 and 24), a.b.c (8, 8 and
 * 16), a.b.c.d (8 each). The classic implementation stops at the first
 * whitespace and ignores whatever follows it.
 */
export function parseInetAton(text: string): ParseOutcome {
  let body = text;
  let note: string | undefined;
  const space = text.search(C_SPACE);
  if (space !== -1) {
    body = text.slice(0, space);
    note = `inet_aton stops at the first whitespace and ignores "${text.slice(space).trim()}". glibc's getaddrinfo did the same until CVE-2016-10739.`;
  }

  const parts: Part[] = [];
  let rest = body;
  for (;;) {
    const n = cNumber(rest);
    if (n === null) {
      if (rest === "") return fail("A part is empty. Every dot must have a number on both sides.");
      return fail(`"${rest}" does not start with a digit, so it is not a number.`);
    }
    if (n.value > 0xffffffffn) return fail(`"${rest.slice(0, n.used)}" is larger than 32 bits.`);
    parts.push({ text: rest.slice(0, n.used), radix: n.radix, value: n.value, bits: 0 });
    rest = rest.slice(n.used);
    if (rest.startsWith(".")) {
      if (parts.length === 4) return fail("More than four parts. inet_aton accepts one to four.");
      if (n.value > 255n) {
        return fail(`"${parts[parts.length - 1].text}" is above 255, and only the last part may be wider than a byte.`);
      }
      rest = rest.slice(1);
      continue;
    }
    if (rest !== "") {
      const last = parts[parts.length - 1];
      if (last.radix === 8 && /^[89]/.test(rest)) {
        return fail(`"${last.text}${rest[0]}" starts with 0, so it is octal, and 8 and 9 are not octal digits.`);
      }
      if (/^[xX]/.test(rest) && last.text === "0") {
        return fail("0x with no hex digits after it. strtoul reads the 0 and leaves the x as trailing garbage.");
      }
      return fail(`Unexpected "${rest[0]}" after "${last.text}".`);
    }
    break;
  }

  const widths = partWidths(parts.length);
  parts.forEach((p, i) => {
    p.bits = widths[i];
  });
  const last = parts[parts.length - 1];
  if (last.value >= 1n << BigInt(last.bits)) {
    return fail(
      `With ${parts.length} ${parts.length === 1 ? "part" : "parts"} the last one fills ${last.bits} bits, and ${last.text} does not fit.`,
    );
  }
  return { ok: true, value: combine(parts.map((p) => p.value)), parts, note };
}

/* -------------------------------------------------------------- WHATWG */

/** The URL Standard's "IPv4 number parser". Returns null on failure. */
function whatwgNumber(text: string): { value: bigint; radix: Radix } | null {
  if (text === "") return null;
  let input = text;
  let radix: Radix = 10;
  if (/^0[xX]/.test(input)) {
    input = input.slice(2);
    radix = 16;
  } else if (input.length >= 2 && input.startsWith("0")) {
    input = input.slice(1);
    radix = 8;
  }
  if (input === "") return { value: 0n, radix };
  const pattern = radix === 16 ? /^[0-9a-fA-F]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9]+$/;
  if (!pattern.test(input)) return null;
  const prefix = radix === 16 ? "0x" : radix === 8 ? "0o" : "";
  return { value: BigInt(prefix + input), radix };
}

/** The URL Standard's "ends in a number" check, which decides address versus domain. */
export function whatwgEndsInNumber(text: string): boolean {
  const parts = text.split(".");
  if (parts[parts.length - 1] === "") {
    if (parts.length === 1) return false;
    parts.pop();
  }
  const last = parts[parts.length - 1];
  if (last !== "" && /^[0-9]+$/.test(last)) return true;
  return whatwgNumber(last) !== null;
}

/**
 * Percent-decode as the URL Standard does: %XX with two hex digits becomes
 * that byte, and a % not followed by two hex digits stays as it is. Returns
 * null when a decoded byte is outside ASCII, since the standard would then
 * UTF-8 decode and IDNA-map the result, which this page does not model.
 */
export function whatwgPercentDecode(text: string): string | null {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const hex = text.slice(i + 1, i + 3);
    if (text[i] === "%" && /^[0-9a-fA-F]{2}$/.test(hex)) {
      const byte = parseInt(hex, 16);
      if (byte > 0x7f) return null;
      out += String.fromCharCode(byte);
      i += 2;
    } else {
      out += text[i];
    }
  }
  return out;
}

/** The URL Standard's forbidden domain code points: C0 controls, space, DEL and URL delimiters. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_DOMAIN = /[\x00-\x20#%/:<>?@[\\\]^|\x7f]/;

/**
 * The host parser of the WHATWG URL Standard for http and https URLs. The
 * URL parser first deletes every tab and newline in the URL, then the host
 * parser percent-decodes the host, lowercases it (the ASCII part of "domain
 * to ASCII"), refuses forbidden domain code points, and runs "ends in a
 * number" and the "IPv4 parser". The radix rules match inet_aton, with two
 * differences: one trailing dot is allowed, and a bare 0x is zero. If the
 * last label is not numeric the host is a domain name, and if it is numeric
 * but the rest does not parse, the whole URL fails.
 */
export function parseWhatwg(text: string): ParseOutcome {
  const notes: string[] = [];
  const stripped = text.replace(/[\t\n\r]/g, "");
  if (stripped !== text) {
    notes.push("The URL parser deletes tabs and newlines anywhere in a URL before reading it.");
  }
  const decoded = whatwgPercentDecode(stripped);
  if (decoded === null) {
    return fail(
      "Percent-decodes to non-ASCII bytes, which a browser would UTF-8 decode and map through IDNA before reading the host. That mapping is not modeled here.",
      "unmodeled",
    );
  }
  if (decoded !== stripped) {
    notes.push(`The host is percent-decoded first, so this reads as ${decoded}.`);
  }
  const host = decoded.toLowerCase();
  const forbidden = FORBIDDEN_DOMAIN.exec(host);
  if (forbidden) {
    const ch = forbidden[0];
    const shown = ch === " " ? "A space" : ch.charCodeAt(0) < 0x20 || ch === "\x7f" ? "A control character" : `"${ch}"`;
    return fail(`${shown} is a forbidden domain code point, so a URL with this host fails to parse.`);
  }
  if (!whatwgEndsInNumber(host)) {
    return fail(
      "The last label is not a number, so a URL parser treats this as a domain name and asks DNS, rather than reading it as an address.",
      "domain",
    );
  }
  let texts = host.split(".");
  if (texts[texts.length - 1] === "" && texts.length > 1) {
    texts = texts.slice(0, -1);
    notes.push("One trailing dot is allowed and dropped. inet_aton would reject it.");
  }
  if (texts.length > 4) return fail("More than four parts, so the URL fails to parse.");

  const parts: Part[] = [];
  for (const t of texts) {
    const n = whatwgNumber(t);
    if (n === null) {
      return fail(
        t === ""
          ? "A part is empty, so the URL fails to parse."
          : `"${t}" is not a decimal, octal or hex number, so the URL fails to parse.`,
      );
    }
    parts.push({ text: t, radix: n.radix, value: n.value, bits: 0 });
  }
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (parts[i].value > 255n) {
      return fail(`"${parts[i].text}" is above 255 and is not the last part, so the URL fails to parse.`);
    }
  }
  const widths = partWidths(parts.length);
  parts.forEach((p, i) => {
    p.bits = widths[i];
  });
  const last = parts[parts.length - 1];
  if (last.value >= 1n << BigInt(last.bits)) {
    return fail(`The last part has to fit in ${last.bits} bits and ${last.text} does not, so the URL fails to parse.`);
  }
  if (parts.some((p) => p.text === "0x")) {
    notes.push("A bare 0x counts as zero here. glibc's inet_aton rejects it.");
  }
  return {
    ok: true,
    value: combine(parts.map((p) => p.value)),
    parts,
    note: notes.length > 0 ? notes.join(" ") : undefined,
  };
}

/* --------------------------------------------------------------- naive */

/**
 * Four decimal parts with leading zeros ignored. This is how Go before 1.17
 * read addresses, and how a hand-written check that splits on dots and calls
 * parseInt(part, 10) reads them.
 */
export function parseNaiveDecimal(text: string): ParseOutcome {
  const parts = text.split(".");
  if (parts.length !== 4) return fail(`Needs exactly four parts. This has ${parts.length}.`);
  const values: bigint[] = [];
  for (const part of parts) {
    if (!/^[0-9]+$/.test(part)) return fail(`"${part}" is not a decimal number.`);
    const v = BigInt(part);
    if (v > 255n) return fail(`"${part}" is above 255.`);
    values.push(v);
  }
  return {
    ok: true,
    value: combine(values),
    parts: parts.map((p, i) => ({ text: p, radix: 10, value: values[i], bits: 8 })),
  };
}

/* -------------------------------------------------------------- binary */

/**
 * Binary is a display notation. No system parser reads it, so it is only
 * recognized when it cannot be mistaken for anything else: a 0b prefix, or
 * four groups of exactly eight binary digits.
 */
export function parseBinary(text: string): number | null {
  const prefixed = /^0[bB]([01]{8})[._ ]?([01]{8})[._ ]?([01]{8})[._ ]?([01]{8})$/.exec(text);
  const dotted = /^([01]{8})\.([01]{8})\.([01]{8})\.([01]{8})$/.exec(text);
  const m = prefixed ?? dotted;
  if (!m) return null;
  return Number(BigInt(`0b${m[1]}${m[2]}${m[3]}${m[4]}`));
}

/* ---------------------------------------------------------- formatting */

function octets(value: number): number[] {
  return [Math.floor(value / 16777216) % 256, Math.floor(value / 65536) % 256, Math.floor(value / 256) % 256, value % 256];
}

export function toDottedDecimal(value: number): string {
  return octets(value).join(".");
}

export function toInteger(value: number): string {
  return String(value);
}

export function toHex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(8, "0")}`;
}

export function toDottedHex(value: number): string {
  return octets(value)
    .map((o) => `0x${o.toString(16).toUpperCase().padStart(2, "0")}`)
    .join(".");
}

/** Each octet as 0 followed by three octal digits, so every part reads as octal. */
export function toDottedOctal(value: number): string {
  return octets(value)
    .map((o) => `0${o.toString(8).padStart(3, "0")}`)
    .join(".");
}

export function toBinary(value: number): string {
  return octets(value)
    .map((o) => o.toString(2).padStart(8, "0"))
    .join(".");
}

/** RFC 4291 section 2.5.5.2, in the mixed notation RFC 5952 section 5 recommends. */
export function toMappedIpv6(value: number): string {
  return `::ffff:${toDottedDecimal(value)}`;
}

export function describePart(part: Part): string {
  return `${part.text} is ${radixName(part.radix)} ${part.value.toString()}, filling ${part.bits} bits`;
}

/* ----------------------------------------------------- special ranges */

export interface SpecialRange {
  cidr: string;
  name: string;
  rfc: string;
  /** Extra context, when the name alone undersells it. */
  detail?: string;
  /** True when a server-side fetcher should normally refuse to connect here. */
  internal: boolean;
}

/**
 * IANA IPv4 Special-Purpose Address Registry (RFC 6890) plus the blocks it
 * leaves to other registries. Most specific first, so the first match wins.
 */
export const SPECIAL_RANGES: SpecialRange[] = [
  { cidr: "169.254.169.254/32", name: "Cloud instance metadata service", rfc: "RFC 3927 block", detail: "AWS, Azure and Google Cloud all serve instance metadata, often including credentials, at this address.", internal: true },
  { cidr: "255.255.255.255/32", name: "Limited broadcast", rfc: "RFC 919", internal: true },
  { cidr: "0.0.0.0/8", name: "This network", rfc: "RFC 1122", detail: "On Linux and macOS a connection to 0.0.0.0 reaches the local machine.", internal: true },
  { cidr: "10.0.0.0/8", name: "Private use", rfc: "RFC 1918", internal: true },
  { cidr: "100.64.0.0/10", name: "Shared address space (carrier-grade NAT)", rfc: "RFC 6598", internal: true },
  { cidr: "127.0.0.0/8", name: "Loopback", rfc: "RFC 1122", internal: true },
  { cidr: "169.254.0.0/16", name: "Link-local", rfc: "RFC 3927", internal: true },
  { cidr: "172.16.0.0/12", name: "Private use", rfc: "RFC 1918", internal: true },
  { cidr: "192.0.0.0/24", name: "IETF protocol assignments", rfc: "RFC 6890", internal: true },
  { cidr: "192.0.2.0/24", name: "Documentation (TEST-NET-1)", rfc: "RFC 5737", internal: false },
  { cidr: "192.31.196.0/24", name: "AS112-v4", rfc: "RFC 7535", internal: false },
  { cidr: "192.52.193.0/24", name: "AMT relay anycast", rfc: "RFC 7450", internal: false },
  { cidr: "192.88.99.0/24", name: "Deprecated 6to4 relay anycast", rfc: "RFC 7526", internal: false },
  { cidr: "192.168.0.0/16", name: "Private use", rfc: "RFC 1918", internal: true },
  { cidr: "192.175.48.0/24", name: "Direct Delegation AS112 service", rfc: "RFC 7534", internal: false },
  { cidr: "198.18.0.0/15", name: "Benchmarking", rfc: "RFC 2544", internal: true },
  { cidr: "198.51.100.0/24", name: "Documentation (TEST-NET-2)", rfc: "RFC 5737", internal: false },
  { cidr: "203.0.113.0/24", name: "Documentation (TEST-NET-3)", rfc: "RFC 5737", internal: false },
  { cidr: "224.0.0.0/4", name: "Multicast", rfc: "RFC 5771", internal: false },
  { cidr: "240.0.0.0/4", name: "Reserved for future use", rfc: "RFC 1112", internal: false },
];

function inCidr(value: number, cidr: string): boolean {
  const [addr, len] = cidr.split("/");
  const base = parseStrict(addr);
  if (!base.ok) return false;
  const size = 2 ** (32 - Number(len));
  return Math.floor(value / size) === Math.floor(base.value / size);
}

export function classify(value: number): SpecialRange | null {
  return SPECIAL_RANGES.find((r) => inCidr(value, r.cidr)) ?? null;
}

/* ------------------------------------------------------------- analysis */

export interface ParserRow {
  id: "strict" | "inet_aton" | "whatwg" | "naive";
  outcome: ParseOutcome;
}

export type Analysis =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      input: string;
      /** The address used for conversions, or null when no parser produced one. */
      value: number | null;
      /** Where value came from. */
      via: "binary" | "inet_aton" | "whatwg" | null;
      rows: ParserRow[];
      /** Accepted by inet_aton or the URL parser, rejected by strict parsing. */
      legacy: boolean;
      /** Two parsers accepted the string and produced different addresses. */
      conflict: boolean;
    };

export function analyze(raw: string): Analysis {
  const input = raw.trim();
  if (input === "") return { kind: "empty" };
  if (input.length > MAX_INPUT_CHARS) {
    return { kind: "error", message: `That is ${input.length} characters. The limit is ${MAX_INPUT_CHARS}, and no real address comes close.` };
  }
  // Checked before the character list, so fullwidth digits get this message.
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7f]/.test(input)) {
    return {
      kind: "error",
      message:
        "Only ASCII is parsed here. A browser maps some Unicode, such as fullwidth digits and dots, to ASCII before it reads a host, which is one more reason to compare parsed addresses rather than strings.",
    };
  }
  // Letters, hyphens and underscores can be part of a host name, and % is
  // percent-encoding, which the URL parser decodes, so those go through to
  // the parsers and each says what it makes of them.
  const bad = /[^0-9A-Za-z.%_\-\s]/.exec(input);
  if (bad) {
    const ch = bad[0];
    let message: string;
    if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(input)) {
      message = "Enter only the host, without the scheme (http://) or anything after the host. For http://127.1:8080/x, enter 127.1.";
    } else if (ch === ":" || ch === "[" || ch === "]") {
      message = `"${ch}" belongs to a port number or an IPv6 address. Enter only an IPv4 host, without a port.`;
    } else if ("/?#@\\".includes(ch)) {
      message = `Enter only the host, without a scheme, path, query or user name. "${ch}" belongs to the URL around the host, not to the host.`;
    } else {
      message = `"${ch}" is not part of any IPv4 notation.`;
    }
    return { kind: "error", message };
  }

  const rows: ParserRow[] = [
    { id: "strict", outcome: parseStrict(input) },
    { id: "inet_aton", outcome: parseInetAton(input) },
    { id: "whatwg", outcome: parseWhatwg(input) },
    { id: "naive", outcome: parseNaiveDecimal(input) },
  ];
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.outcome])) as Record<ParserRow["id"], ParseOutcome>;

  const binary = parseBinary(input);
  let value: number | null = null;
  let via: "binary" | "inet_aton" | "whatwg" | null = null;
  if (binary !== null) {
    value = binary;
    via = "binary";
  } else if (byId.inet_aton.ok) {
    value = byId.inet_aton.value;
    via = "inet_aton";
  } else if (byId.whatwg.ok) {
    value = byId.whatwg.value;
    via = "whatwg";
  }

  const accepted = rows.filter((r) => r.outcome.ok).map((r) => (r.outcome as { value: number }).value);
  const conflict = new Set(accepted).size > 1;
  const legacy = !byId.strict.ok && (byId.inet_aton.ok || byId.whatwg.ok);

  return { kind: "ok", input, value, via, rows, legacy, conflict };
}
