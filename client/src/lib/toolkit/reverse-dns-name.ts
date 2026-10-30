/**
 * Reverse DNS names, in both directions.
 *
 * IPv4 follows RFC 1035 section 3.5: the four octets reversed under
 * in-addr.arpa. IPv6 follows RFC 3596 section 2.5: all 32 nibbles reversed,
 * one per label, under ip6.arpa. Classless delegation inside an IPv4 /24 is
 * RFC 2317. Address parsing is shared with the special-purpose classifier
 * so both tools accept and refuse exactly the same text.
 */

import {
  MAX_INPUT_LENGTH,
  familyBits,
  formatIp,
  networkOf,
  parseIp,
  type Family,
  type Result,
} from "./ip-address-classifier";

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function quote(text: string): string {
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

/** At most this many zones are listed when a prefix splits across zone cuts. */
export const ZONE_LIST_CAP = 16;

/** Smallest RFC 2317 block handled; a /24 or shorter needs no classless trick. */
export const CLASSLESS_MIN = 25;

export const MAX_NAMESERVERS = 6;

/* --------------------------------------------------------- forward way */

function octetsOf(value: bigint): number[] {
  return [24n, 16n, 8n, 0n].map((s) => Number((value >> s) & 0xffn));
}

function nibblesOf(value: bigint): string[] {
  return value.toString(16).padStart(32, "0").split("");
}

/** The PTR owner name for one address. */
export function ptrName(family: Family, value: bigint): string {
  if (family === 4) return `${octetsOf(value).reverse().join(".")}.in-addr.arpa`;
  return `${nibblesOf(value).reverse().join(".")}.ip6.arpa`;
}

/**
 * The reverse zone holding the first `bits` bits of the address. `bits`
 * must sit on a label boundary: a multiple of 8 for IPv4, of 4 for IPv6.
 */
export function zoneName(family: Family, value: bigint, bits: number): string {
  if (family === 4) {
    const labels = octetsOf(value).slice(0, bits / 8).reverse();
    return [...labels, "in-addr.arpa"].join(".");
  }
  const labels = nibblesOf(value).slice(0, bits / 4).reverse();
  return [...labels, "ip6.arpa"].join(".");
}

/** The conventional delegation points shown for every address. */
export function standardZones(family: Family, value: bigint): { prefix: number; zone: string; labels: number }[] {
  const prefixes = family === 4 ? [8, 16, 24] : [32, 48, 56, 64];
  return prefixes.map((prefix) => ({
    prefix,
    zone: zoneName(family, value, prefix),
    labels: family === 4 ? prefix / 8 : prefix / 4,
  }));
}

/* ----------------------------------------------------------- delegation */

export interface Classless {
  /** The /24 zone that owns the PTR names and holds the CNAMEs. */
  parentZone: string;
  start: number;
  end: number;
  prefix: number;
  /** The child zone's first label, such as 64/26 or 64-26. */
  label: string;
  childZone: string;
}

export interface Delegation {
  family: Family;
  prefix: number;
  network: bigint;
  networkText: string;
  /** exact: one zone. split: several zones at the next label boundary. classless: RFC 2317. */
  kind: "exact" | "split" | "classless";
  boundary: number;
  zones: string[];
  zoneCount: number;
  classless: Classless | null;
}

export type LabelStyle = "/" | "-";

export function classlessFor(value: bigint, prefix: number, style: LabelStyle): Classless {
  const network = networkOf(4, value, prefix);
  const start = Number(network & 0xffn);
  const size = 2 ** (32 - prefix);
  const parentZone = zoneName(4, network, 24);
  const label = `${start}${style}${prefix}`;
  return { parentZone, start, end: start + size - 1, prefix, label, childZone: `${label}.${parentZone}` };
}

export function delegationFor(family: Family, value: bigint, prefix: number, style: LabelStyle = "/"): Delegation {
  const bits = familyBits(family);
  const unit = family === 4 ? 8 : 4;
  const network = networkOf(family, value, prefix);
  const base = { family, prefix, network, networkText: `${formatIp(family, network)}/${prefix}` };

  if (family === 4 && prefix > 24) {
    return {
      ...base,
      kind: "classless",
      boundary: 24,
      zones: [zoneName(4, network, 24)],
      zoneCount: 1,
      classless: classlessFor(value, prefix, style),
    };
  }

  const boundary = Math.ceil(prefix / unit) * unit;
  const zoneCount = 2 ** (boundary - prefix);
  const step = 1n << BigInt(bits - boundary);
  const zones: string[] = [];
  for (let i = 0; i < Math.min(zoneCount, ZONE_LIST_CAP); i++) {
    zones.push(zoneName(family, network + BigInt(i) * step, boundary));
  }
  return { ...base, kind: zoneCount === 1 ? "exact" : "split", boundary, zones, zoneCount, classless: null };
}

/** Validate a list of name server host names, returned fully qualified. */
export function parseNameservers(text: string): Result<string[]> {
  if (text.length > MAX_INPUT_LENGTH * 4) return fail("That is too long for a list of name servers.");
  const items = text.split(/[\s,]+/).filter((x) => x !== "");
  if (items.length === 0) return fail("Enter at least one name server host name, such as ns1.customer.example.");
  if (items.length > MAX_NAMESERVERS) return fail(`Enter at most ${MAX_NAMESERVERS} name servers.`);
  const out: string[] = [];
  for (const item of items) {
    const name = item.toLowerCase().replace(/\.$/, "");
    if (name.length > 253) return fail(`"${quote(item)}" is longer than the 253 characters a DNS name allows.`);
    const labels = name.split(".");
    if (labels.length < 2) {
      return fail(`"${quote(item)}" is a single label. A name server needs a fully qualified name, such as ns1.customer.example.`);
    }
    for (const label of labels) {
      // RFC 1123 section 2.1 host name syntax: letters, digits, hyphens, no hyphen at either end.
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
        return fail(
          `"${quote(item)}" is not a valid host name. Each label is 1 to 63 letters, digits or hyphens, and cannot start or end with a hyphen.`,
        );
      }
    }
    out.push(`${name}.`);
  }
  return { ok: true, value: out };
}

export interface ZoneFiles {
  parent: string;
  child: string;
  generate: string;
}

/** RFC 2317 section 4, generated for one block: the parent's NS and CNAMEs, and the child zone. */
export function classlessZoneFiles(info: Classless, hostOctet: number, nameservers: string[]): ZoneFiles {
  const width = Math.max(info.label.length, 3) + 2;
  const pad = (s: string) => s.padEnd(width);
  const parent: string[] = [
    `$ORIGIN ${info.parentZone}.`,
    `; In the /24 zone, run by whoever holds ${info.parentZone.split(".").slice(0, 3).reverse().join(".")}.0/24.`,
    `; 1. Delegate the child zone to the customer's name servers.`,
    ...nameservers.map((ns) => `${pad(info.label)}IN NS     ${ns}`),
    `; 2. Point every address in ${info.start} to ${info.end} into the child zone.`,
  ];
  for (let h = info.start; h <= info.end; h++) {
    parent.push(`${pad(String(h))}IN CNAME  ${h}.${info.childZone}.`);
  }

  const first = nameservers[0];
  const firstLabels = first.replace(/\.$/, "").split(".");
  const domain = (firstLabels.length > 2 ? firstLabels.slice(1) : firstLabels).join(".");
  const child: string[] = [
    `$ORIGIN ${info.childZone}.`,
    `; The customer's own zone, served by the name servers above.`,
    `$TTL 3600`,
    `${pad("@")}IN SOA    ${first} hostmaster.${domain}. 1 3600 900 1209600 3600`,
    ...nameservers.map((ns) => `${pad("@")}IN NS     ${ns}`),
    `${pad(String(hostOctet))}IN PTR    host${hostOctet}.${domain}.`,
  ];

  // BIND's $GENERATE writes the same CNAME run in one line. It is a BIND
  // extension (also read by some other servers), not RFC 1035 syntax.
  const generate = `$GENERATE ${info.start}-${info.end} $ IN CNAME $.${info.childZone}.`;
  return { parent: parent.join("\n"), child: child.join("\n"), generate };
}

/* --------------------------------------------------------- reverse way */

export type ReverseInput =
  | {
      kind: "address";
      family: Family;
      value: bigint;
      /** A prefix length typed after a slash, if any. */
      prefix: number | null;
      zoneId: string | null;
    }
  | {
      kind: "ptr";
      family: Family;
      /** The address, or the first address of the zone's block. */
      value: bigint;
      /** How many leading bits the name pins down. 32 or 128 means a single address. */
      prefix: number;
      name: string;
      /** Set when the name used an RFC 2317 classless label. */
      classless: { start: number; prefix: number; label: string } | null;
      note: string | null;
    };

const CLASSLESS_LABEL = /^(\d{1,3})([-/])(\d{1,3})$/;

function decimalOctet(label: string, index: number): Result<number> {
  if (!/^\d+$/.test(label)) {
    return fail(`Label ${index} ("${quote(label)}") is not a decimal octet. An in-addr.arpa name is made of octets 0 to 255.`);
  }
  if (label.length > 1 && label.startsWith("0")) {
    return fail(`Label ${index} ("${quote(label)}") has a leading zero. PTR names write each octet in plain decimal, so it would never match a query.`);
  }
  const n = Number(label);
  if (n > 255) return fail(`Label ${index} is ${quote(label)}, but an octet holds 0 to 255.`);
  return { ok: true, value: n };
}

/**
 * Read an RFC 2317 child label. The RFC leaves the format to the operator;
 * start/prefix (its examples) and start-prefix are read, plus a dash range
 * such as 64-127 when the numbers can only mean that.
 */
function readClassless(label: string): Result<{ start: number; prefix: number; note: string | null }> {
  const m = CLASSLESS_LABEL.exec(label);
  if (!m) return fail(`"${quote(label)}" is not a classless label.`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (a > 255) return fail(`The classless label ${label} starts at ${a}, but an octet holds 0 to 255.`);
  const aligned = (prefix: number) => a % 2 ** (32 - prefix) === 0;
  const asPrefix = b >= CLASSLESS_MIN && b <= 32 && aligned(b) ? b : null;
  let asRange: number | null = null;
  if (m[2] === "-" && b > a && b <= 255) {
    const size = b - a + 1;
    const log = Math.log2(size);
    if (Number.isInteger(log) && log <= 7 && a % size === 0) asRange = 32 - log;
  }
  if (m[2] === "/" || asRange === null) {
    if (asPrefix === null) {
      if (b < CLASSLESS_MIN || b > 32) {
        return fail(`In ${label} the prefix length is ${b}. RFC 2317 labels name blocks inside one /24, so it must be /${CLASSLESS_MIN} to /32.`);
      }
      return fail(`${label} is not aligned: a /${b} block starts on a multiple of ${2 ** (32 - b)}, and ${a} is not one.`);
    }
    return { ok: true, value: { start: a, prefix: asPrefix, note: null } };
  }
  if (asPrefix !== null) {
    return {
      ok: true,
      value: {
        start: a,
        prefix: asPrefix,
        note: `Read ${label} as start ${a} with prefix length /${asPrefix}. RFC 2317 leaves the label format to the operator, and some write a range instead, which here would mean ${a} to ${b} (/${asRange}).`,
      },
    };
  }
  return { ok: true, value: { start: a, prefix: asRange, note: `Read ${label} as the range ${a} to ${b}, a /${asRange}.` } };
}

function parseInAddr(labels: string[], name: string): Result<ReverseInput> {
  const classlessAt = labels.findIndex((l) => CLASSLESS_LABEL.test(l));
  if (classlessAt !== -1) {
    const octetLabels = labels.slice(classlessAt + 1);
    if (classlessAt > 1 || octetLabels.length !== 3) {
      return fail("A classless (RFC 2317) label sits directly under a /24 zone, as in 64/26.2.0.192.in-addr.arpa, optionally with one host label in front.");
    }
    const octets: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = decimalOctet(octetLabels[i], classlessAt + 2 + i);
      if (!r.ok) return r;
      octets.push(r.value);
    }
    const c = readClassless(labels[classlessAt]);
    if (!c.ok) return c;
    const { start, prefix, note } = c.value;
    const end = start + 2 ** (32 - prefix) - 1;
    let host: number | null = null;
    if (classlessAt === 1) {
      const r = decimalOctet(labels[0], 1);
      if (!r.ok) return r;
      host = r.value;
      if (host < start || host > end) {
        return fail(`Host ${host} is outside the block ${labels[1]}, which covers ${start} to ${end}.`);
      }
    }
    const [c3, c2, c1] = octets;
    const value = (BigInt(c1) << 24n) | (BigInt(c2) << 16n) | (BigInt(c3) << 8n) | BigInt(host ?? start);
    return {
      ok: true,
      value: {
        kind: "ptr",
        family: 4,
        value,
        prefix: host === null ? prefix : 32,
        name,
        classless: { start, prefix, label: labels[classlessAt] },
        note,
      },
    };
  }

  if (labels.length > 4) {
    return fail(`An in-addr.arpa name has at most four octet labels, and this has ${labels.length}.`);
  }
  const octets: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    const r = decimalOctet(labels[i], i + 1);
    if (!r.ok) return r;
    octets.push(r.value);
  }
  const forward = octets.reverse();
  let value = 0n;
  for (let i = 0; i < 4; i++) value = (value << 8n) | BigInt(forward[i] ?? 0);
  return { ok: true, value: { kind: "ptr", family: 4, value, prefix: labels.length * 8, name, classless: null, note: null } };
}

function parseIp6Arpa(labels: string[], name: string): Result<ReverseInput> {
  if (labels.length > 32) {
    return fail(`An ip6.arpa name has at most 32 nibble labels, and this has ${labels.length}.`);
  }
  for (let i = 0; i < labels.length; i++) {
    if (!/^[0-9a-f]$/.test(labels[i])) {
      return fail(
        `Label ${i + 1} ("${quote(labels[i])}") is not a single hex digit. ip6.arpa writes one nibble per label, zeros included, so 2001:db8:: starts 0.0.0.0... and ends 8.b.d.0.1.0.0.2.ip6.arpa.`,
      );
    }
  }
  const forward = [...labels].reverse().join("").padEnd(32, "0");
  const value = BigInt(`0x${forward}`);
  return { ok: true, value: { kind: "ptr", family: 6, value, prefix: labels.length * 4, name, classless: null, note: null } };
}

function parsePtrName(text: string): Result<ReverseInput> {
  const name = text.toLowerCase().replace(/\.$/, "");
  if (name.length > 253) return fail("That name is longer than the 253 characters DNS allows.");
  if (name.endsWith("ip6.int")) {
    return fail("ip6.int was retired in 2005 (RFC 4159). IPv6 reverse names live under ip6.arpa.");
  }
  let suffix: string;
  if (name === "in-addr.arpa" || name.endsWith(".in-addr.arpa")) suffix = "in-addr.arpa";
  else if (name === "ip6.arpa" || name.endsWith(".ip6.arpa")) suffix = "ip6.arpa";
  else return fail("A reverse name ends in in-addr.arpa (IPv4) or ip6.arpa (IPv6).");

  const head = name.slice(0, Math.max(0, name.length - suffix.length - 1));
  const labels = head === "" ? [] : head.split(".");
  if (labels.some((l) => l === "")) return fail("There is an empty label: two dots in a row, or a dot at the start.");
  return suffix === "in-addr.arpa" ? parseInAddr(labels, `${name}.`) : parseIp6Arpa(labels, `${name}.`);
}

/** Accepts an address (optionally with /prefix) or a PTR or zone name. */
export function parseReverseInput(raw: string): Result<ReverseInput> {
  const text = raw.trim();
  if (text === "") return fail("Enter an IP address or a name ending in in-addr.arpa or ip6.arpa.");
  if (text.length > MAX_INPUT_LENGTH) {
    return fail(`That is ${text.length} characters. The longest reverse name is 73, so input past ${MAX_INPUT_LENGTH} characters is not read.`);
  }
  if (/arpa\.?$/i.test(text) || /ip6\.int\.?$/i.test(text)) return parsePtrName(text);

  let addressText = text;
  let prefix: number | null = null;
  const slash = text.lastIndexOf("/");
  if (slash !== -1) {
    addressText = text.slice(0, slash);
    const p = text.slice(slash + 1).trim();
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p.startsWith("0"))) {
      return fail(`The prefix length after the slash ("${quote(p)}") must be a plain number.`);
    }
    prefix = Number(p);
  }
  const parsed = parseIp(addressText);
  if (!parsed.ok) {
    if (/[g-z]/i.test(addressText) && !addressText.includes(":")) {
      return fail("That looks like a host name. Enter an IP address, or a reverse name ending in in-addr.arpa or ip6.arpa.");
    }
    return parsed;
  }
  const { family, value, zoneId } = parsed.value;
  if (prefix !== null && prefix > familyBits(family)) {
    return fail(`An IPv${family} prefix length is 0 to ${familyBits(family)}, not ${prefix}.`);
  }
  return { ok: true, value: { kind: "address", family, value, prefix, zoneId } };
}

/** The dig commands that answer the question for this input. */
export function digCommands(family: Family, value: bigint, isAddress: boolean, zone: string): string[] {
  if (!isAddress) return [`dig NS ${zone}`, `dig SOA ${zone}`];
  const text = formatIp(family, value);
  return [`dig -x ${text}`, `dig +short PTR ${ptrName(family, value)}`, `dig +trace -x ${text}`];
}
