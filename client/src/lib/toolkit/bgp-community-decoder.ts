/**
 * BGP community decoding.
 *
 * Three attributes, three encodings:
 *   - COMMUNITIES (type 8, RFC 1997): 32 bits, written ASN:value with the
 *     ASN in the high 16 bits.
 *   - EXTENDED COMMUNITIES (type 16, RFC 4360): 64 bits, a type octet, a
 *     sub-type octet and six octets whose layout depends on the type.
 *     RFC 5668 adds the four-octet AS specific type.
 *   - LARGE_COMMUNITY (type 32, RFC 8092): 96 bits, three 32-bit fields,
 *     written ASN:data1:data2.
 *
 * Pure functions, no React and no DOM. Nothing here throws on bad input:
 * every entry point returns either a decoded value or an error string.
 */

import { AS16_MAX, ASN_MAX, describeAsn, parseAsn, toAsdot, type AsnInfo } from "./asn-converter";

export const MAX_COMMUNITIES = 500;
export const MAX_COMMUNITY_INPUT = 100_000;
const MAX_TOKEN = 80;

export type CommunityKind = "standard" | "extended" | "large";
export type Tone = "ok" | "info" | "warn" | "danger";

export interface Flag {
  tone: Tone;
  text: string;
}

export interface Field {
  label: string;
  value: string;
}

export interface DecodedCommunity {
  input: string;
  kind: CommunityKind;
  /** The form a router config would accept, such as 65535:65281 or rt:64496:100. */
  canonical: string;
  /** Well-known name or extended community sub-type, when there is one. */
  name: string | null;
  /** Wire bytes, space separated, upper case. */
  bytes: string;
  fields: Field[];
  flags: Flag[];
}

export type CommunityResult =
  | { ok: true; input: string; value: DecodedCommunity }
  | { ok: false; input: string; error: string };

/* ------------------------------------------------------------ well-known */

export interface WellKnown {
  value: number;
  name: string;
  source: string;
  meaning: string;
  /** Lower case, separators removed. Router keywords that name it. */
  aliases: string[];
}

/** IANA "BGP Well-known Communities" entries that are in an RFC. */
export const WELL_KNOWN: WellKnown[] = [
  {
    value: 0xffff0000,
    name: "GRACEFUL_SHUTDOWN",
    source: "RFC 8326",
    meaning:
      "The sender is about to take this path down for maintenance. A receiver that honors it lowers the path's LOCAL_PREF, typically to 0, so traffic moves to another path before the session drops.",
    aliases: ["gracefulshutdown", "gshut"],
  },
  {
    value: 0xffff0001,
    name: "ACCEPT_OWN",
    source: "RFC 7611",
    meaning:
      "Lets a route reflector hand a VPN route back to the PE that originated it, which then accepts its own route into a different VRF. Used for extranet and shared services designs.",
    aliases: ["acceptown"],
  },
  {
    value: 0xffff0006,
    name: "LLGR_STALE",
    source: "RFC 9494",
    meaning:
      "Marks a route being kept after its session failed, under long-lived graceful restart. Such a route is treated as least preferred.",
    aliases: ["llgrstale"],
  },
  {
    value: 0xffff0007,
    name: "NO_LLGR",
    source: "RFC 9494",
    meaning: "Asks peers not to retain this route under long-lived graceful restart when the session fails.",
    aliases: ["nollgr"],
  },
  {
    value: 0xffff029a,
    name: "BLACKHOLE",
    source: "RFC 7999",
    meaning:
      "Asks the receiving network to drop all traffic to this prefix, usually a /32 or /128 under a DDoS attack. RFC 7999 says to honor it only when the neighbor is authorized to announce a covering prefix, and to add NO_EXPORT or NO_ADVERTISE so the route travels no further.",
    aliases: ["blackhole"],
  },
  {
    value: 0xffffff01,
    name: "NO_EXPORT",
    source: "RFC 1997",
    meaning:
      "Do not advertise outside this AS. Inside a confederation the whole confederation counts as the boundary.",
    aliases: ["noexport"],
  },
  {
    value: 0xffffff02,
    name: "NO_ADVERTISE",
    source: "RFC 1997",
    meaning: "Do not advertise to any BGP peer at all, internal or external.",
    aliases: ["noadvertise"],
  },
  {
    value: 0xffffff03,
    name: "NO_EXPORT_SUBCONFED",
    source: "RFC 1997",
    meaning:
      "Do not advertise to any external peer, including peers in other member ASes of the same confederation. Cisco calls it local-AS.",
    aliases: ["noexportsubconfed", "localas"],
  },
  {
    value: 0xffffff04,
    name: "NOPEER",
    source: "RFC 3765",
    meaning:
      "Asks that the route not be sent across bilateral peering links. It may still go to customers and transit providers, and honoring it is optional.",
    aliases: ["nopeer"],
  },
];

const BY_VALUE = new Map(WELL_KNOWN.map((w) => [w.value, w]));
const BY_ALIAS = new Map<string, WellKnown>();
for (const w of WELL_KNOWN) {
  BY_ALIAS.set(w.name.toLowerCase().replace(/_/g, ""), w);
  for (const a of w.aliases) BY_ALIAS.set(a, w);
}

/* --------------------------------------------------------------- helpers */

function hexBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

/** Big-endian bytes of an unsigned value that fits in `octets` bytes. */
function toBytes(n: number, octets: number): Uint8Array {
  const out = new Uint8Array(octets);
  let rest = n;
  for (let i = octets - 1; i >= 0; i--) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  return out;
}

function readUint(bytes: Uint8Array, start: number, length: number): number {
  let n = 0;
  for (let i = start; i < start + length; i++) n = n * 256 + bytes[i];
  return n;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function bigFromBytes(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/** Reads up to 18 decimal digits without losing precision. */
function decimal(text: string): bigint | null {
  if (!/^\d+$/.test(text) || text.length > 30) return null;
  return BigInt(text);
}

function shortNumber(text: string): string {
  return text.length > 14 ? `${text.slice(0, 12)}...` : text;
}

/**
 * What the ASN inside a community says about it. `role` names the field,
 * for example "The ASN half" or "The global administrator".
 */
export function asnFlags(asn: number, role: string): Flag[] {
  const info: AsnInfo = describeAsn(asn);
  const name = `${role} (${info.asplain}${info.bits === 32 ? `, asdot ${info.asdot}` : ""})`;
  switch (info.kind) {
    case "private":
      return [
        {
          tone: "info",
          text: `${name} is a private ASN (${info.source}). Common for internal tagging, but the meaning is local to whoever set it, and a community carrying it should normally be scrubbed at the edge.`,
        },
      ];
    case "documentation":
      return [
        {
          tone: "warn",
          text: `${name} is reserved for documentation (${info.source}). It belongs in examples, not in live routing.`,
        },
      ];
    case "as-trans":
      return [
        {
          tone: "warn",
          text: `${name} is AS_TRANS (RFC 6793), the placeholder for a 4-byte ASN. It identifies no network, so nobody can define what this community means.`,
        },
      ];
    case "reserved":
      return [
        {
          tone: "warn",
          text: `${name} is reserved (${info.source}). No network holds it, so it identifies no operator.`,
        },
      ];
    default:
      return [
        {
          tone: "ok",
          text: `${name} is in the public range. By convention the network holding that ASN defines what its communities mean, usually in a published policy or its routing registry object.`,
        },
      ];
  }
}

/* -------------------------------------------------------------- standard */

export function decodeStandard(value: number, input: string, note: string | null = null): DecodedCommunity {
  const high = Math.floor(value / 65536);
  const low = value % 65536;
  const canonical = `${high}:${low}`;
  const known = BY_VALUE.get(value) ?? null;
  const bytes = toBytes(value, 4);
  const flags: Flag[] = [];
  if (note) flags.push({ tone: "info", text: note });

  if (known) {
    flags.push({ tone: "info", text: `${known.name} (${known.source}). ${known.meaning}` });
  } else if (high === 0xffff) {
    flags.push({
      tone: "warn",
      text: "Inside 65535:0 to 65535:65535 (0xFFFF0000 to 0xFFFFFFFF), the range RFC 1997 reserves for well-known communities. This value is not one of the RFC assignments listed here, so check the IANA well-known communities registry before relying on it.",
    });
  } else if (high === 0) {
    flags.push({
      tone: "warn",
      text: "Inside 0:0 to 0:65535 (0x00000000 to 0x0000FFFF), which RFC 1997 reserves. Many IXP route servers still use 0:peer-as to mean do not announce to that peer, so check the route server's documentation.",
    });
  } else {
    flags.push(...asnFlags(high, "The ASN half"));
  }

  if (low === 666 && high !== 0xffff && high !== 0) {
    flags.push({
      tone: "info",
      text: "Many providers use their own ASN:666 as a blackhole request. RFC 7999 standardized the same idea as 65535:666. Confirm against the provider's community list.",
    });
  }

  return {
    input,
    kind: "standard",
    canonical,
    name: known?.name ?? null,
    bytes: hexBytes(bytes),
    fields: [
      { label: "ASN:value (new format)", value: canonical },
      { label: "32-bit integer (old format)", value: String(value) },
      { label: "Hex", value: `0x${value.toString(16).toUpperCase().padStart(8, "0")}` },
      { label: "High 16 bits, ASN", value: String(high) },
      { label: "Low 16 bits, value", value: String(low) },
    ],
    flags,
  };
}

/* ----------------------------------------------------------------- large */

export function decodeLarge(
  global: number,
  data1: number,
  data2: number,
  input: string,
  note: string | null = null,
): DecodedCommunity {
  const bytes = concat(toBytes(global, 4), toBytes(data1, 4), toBytes(data2, 4));
  const canonical = `${global}:${data1}:${data2}`;
  const flags: Flag[] = [];
  if (note) flags.push({ tone: "info", text: note });
  flags.push(...asnFlags(global, "The global administrator"));
  return {
    input,
    kind: "large",
    canonical,
    name: null,
    bytes: hexBytes(bytes),
    fields: [
      { label: "Global administrator", value: `${global}${global > AS16_MAX ? ` (asdot ${toAsdot(global)})` : ""}` },
      { label: "Local data part 1", value: String(data1) },
      { label: "Local data part 2", value: String(data2) },
      { label: "Junos form", value: `large:${canonical}` },
    ],
    flags,
  };
}

/* -------------------------------------------------------------- extended */

interface TypeInfo {
  name: string;
  /** Six-octet value layout. */
  layout: "as2" | "ipv4" | "as4" | "opaque";
}

/** Type octet, from the IANA BGP Extended Communities registry. */
const EXT_TYPES: Record<number, TypeInfo> = {
  0x00: { name: "Transitive Two-Octet AS-Specific", layout: "as2" },
  0x01: { name: "Transitive IPv4-Address-Specific", layout: "ipv4" },
  0x02: { name: "Transitive Four-Octet AS-Specific", layout: "as4" },
  0x03: { name: "Transitive Opaque", layout: "opaque" },
  0x06: { name: "EVPN", layout: "opaque" },
  0x40: { name: "Non-Transitive Two-Octet AS-Specific", layout: "as2" },
  0x41: { name: "Non-Transitive IPv4-Address-Specific", layout: "ipv4" },
  0x42: { name: "Non-Transitive Four-Octet AS-Specific", layout: "as4" },
  0x43: { name: "Non-Transitive Opaque", layout: "opaque" },
  0x80: { name: "Generic Transitive Experimental Use", layout: "opaque" },
  0x81: { name: "Generic Transitive Experimental Use Part 2", layout: "opaque" },
  0x82: { name: "Generic Transitive Experimental Use Part 3", layout: "opaque" },
};

/** Sub-types keyed by (type << 8) | sub-type. */
const EXT_SUBTYPES: Record<number, { name: string; source: string; layout?: TypeInfo["layout"] }> = {
  0x0002: { name: "Route Target", source: "RFC 4360" },
  0x0003: { name: "Route Origin", source: "RFC 4360" },
  0x0005: { name: "OSPF Domain Identifier", source: "RFC 4577" },
  0x0008: { name: "BGP Data Collection", source: "RFC 4384" },
  0x0009: { name: "Source AS", source: "RFC 6514" },
  0x000a: { name: "L2VPN Identifier", source: "RFC 6074" },
  0x0102: { name: "Route Target", source: "RFC 4360" },
  0x0103: { name: "Route Origin", source: "RFC 4360" },
  0x0105: { name: "OSPF Domain Identifier", source: "RFC 4577" },
  0x0107: { name: "OSPF Router ID", source: "RFC 4577" },
  0x010a: { name: "L2VPN Identifier", source: "RFC 6074" },
  0x010b: { name: "VRF Route Import", source: "RFC 6514" },
  0x0202: { name: "Route Target", source: "RFC 5668" },
  0x0203: { name: "Route Origin", source: "RFC 5668" },
  0x0205: { name: "OSPF Domain Identifier", source: "RFC 4577" },
  0x0208: { name: "BGP Data Collection", source: "RFC 4384" },
  0x0209: { name: "Source AS", source: "RFC 6514" },
  0x0306: { name: "OSPF Route Type", source: "RFC 4577" },
  0x030b: { name: "Color", source: "RFC 9012" },
  0x030c: { name: "Encapsulation", source: "RFC 9012" },
  0x0600: { name: "MAC Mobility", source: "RFC 7432" },
  0x0601: { name: "ESI Label", source: "RFC 7432" },
  0x0602: { name: "ES-Import Route Target", source: "RFC 7432" },
  0x4004: { name: "Link Bandwidth", source: "draft-ietf-idr-link-bandwidth" },
  0x4300: { name: "BGP Origin Validation State", source: "RFC 8097" },
  0x8006: { name: "Flow spec traffic-rate-bytes", source: "RFC 8955", layout: "as2" },
  0x8007: { name: "Flow spec traffic-action", source: "RFC 8955" },
  0x8008: { name: "Flow spec redirect to VRF (2-octet AS)", source: "RFC 8955", layout: "as2" },
  0x8009: { name: "Flow spec traffic-marking", source: "RFC 8955" },
  0x800c: { name: "Flow spec traffic-rate-packets", source: "RFC 8955", layout: "as2" },
  0x8108: { name: "Flow spec redirect to VRF (IPv4)", source: "RFC 7674", layout: "ipv4" },
  0x8208: { name: "Flow spec redirect to VRF (4-octet AS)", source: "RFC 7674", layout: "as4" },
};

const RT_PREFIX: Record<number, string> = { 0x02: "rt", 0x03: "soo" };

export function decodeExtended(bytes: Uint8Array, input: string, note: string | null = null): DecodedCommunity {
  const type = bytes[0];
  const sub = bytes[1];
  const typeInfo = EXT_TYPES[type] ?? null;
  const subInfo = EXT_SUBTYPES[(type << 8) | sub] ?? null;
  const layout = subInfo?.layout ?? typeInfo?.layout ?? "opaque";
  const flags: Flag[] = [];
  if (note) flags.push({ tone: "info", text: note });

  const iBit = (type & 0x80) !== 0;
  const transitive = (type & 0x40) === 0;
  const typeHex = `0x${type.toString(16).toUpperCase().padStart(2, "0")}`;
  const subHex = `0x${sub.toString(16).toUpperCase().padStart(2, "0")}`;
  const raw = `0x${hexBytes(bytes).replace(/ /g, "")}`;

  const fields: Field[] = [
    { label: "Type", value: `${typeHex} ${typeInfo ? typeInfo.name : "(not in the table here)"}` },
    { label: "Sub-type", value: `${subHex} ${subInfo ? `${subInfo.name} (${subInfo.source})` : "(not in the table here)"}` },
    {
      label: "Type bits",
      value: `I=${iBit ? 1 : 0} (${iBit ? "standards action or experimental" : "first come first served"}), T=${transitive ? 0 : 1} (${transitive ? "transitive" : "non-transitive"})`,
    },
  ];

  let canonical = raw;
  // Route Target and Route Origin are defined for the three transitive
  // AS and IPv4 specific types only (RFC 4360 sections 4 and 5, RFC 5668).
  const prefix = type <= 0x02 ? RT_PREFIX[sub] : undefined;

  if (type === 0x80 && (sub === 0x06 || sub === 0x0c)) {
    // Flow spec rate limit (RFC 8955 section 7): two leading octets, then
    // the rate as a big-endian IEEE 754 single precision float.
    const rate = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getFloat32(0, false);
    const unit = sub === 0x06 ? "bytes per second" : "packets per second";
    fields.push({ label: "Leading 2 octets", value: String(readUint(bytes, 2, 2)) });
    fields.push({ label: "Rate (IEEE 754 float)", value: Number.isFinite(rate) ? `${rate} ${unit}` : String(rate) });
    if (rate === 0) flags.push({ tone: "info", text: "A rate of 0 tells the receiver to drop all matching traffic." });
  } else if (layout === "as2") {
    const ga = readUint(bytes, 2, 2);
    const la = readUint(bytes, 4, 4);
    fields.push({ label: "Global admin, 2-octet ASN", value: String(ga) });
    fields.push({ label: "Local admin, 32 bits", value: String(la) });
    if (prefix) canonical = `${prefix}:${ga}:${la}`;
    flags.push(...asnFlags(ga, "The global administrator"));
  } else if (layout === "as4") {
    const ga = readUint(bytes, 2, 4);
    const la = readUint(bytes, 6, 2);
    fields.push({ label: "Global admin, 4-octet ASN", value: `${ga}${ga > AS16_MAX ? ` (asdot ${toAsdot(ga)})` : ""}` });
    fields.push({ label: "Local admin, 16 bits", value: String(la) });
    if (prefix) canonical = `${prefix}:${ga}${ga <= AS16_MAX ? "L" : ""}:${la}`;
    if (ga <= AS16_MAX) {
      flags.push({
        tone: "info",
        text: `Encoded as four-octet AS-specific although ${ga} fits in 16 bits. It is a different community from the two-octet encoding of the same numbers and will not match it. Junos writes this form with an L suffix, ${ga}L.`,
      });
    }
    flags.push(...asnFlags(ga, "The global administrator"));
  } else if (layout === "ipv4") {
    const ip = `${bytes[2]}.${bytes[3]}.${bytes[4]}.${bytes[5]}`;
    const la = readUint(bytes, 6, 2);
    fields.push({ label: "Global admin, IPv4 address", value: ip });
    fields.push({ label: "Local admin, 16 bits", value: String(la) });
    if (prefix) canonical = `${prefix}:${ip}:${la}`;
  } else {
    fields.push({ label: "Value, 6 octets", value: hexBytes(bytes.subarray(2)) });
    if (type === 0x43 && sub === 0x00) {
      const state = bytes[7];
      const names: Record<number, string> = { 0: "Valid", 1: "NotFound", 2: "Invalid" };
      fields.push({ label: "Validation state", value: `${state} ${names[state] ?? "(undefined value)"}` });
    }
  }

  if (subInfo?.name === "Route Target" && prefix) {
    flags.push({
      tone: "info",
      text: "Route Target: a VRF imports a VPN route when any of the route's targets matches one of its import targets. Exporting from a VRF attaches its export targets.",
    });
  } else if (subInfo?.name === "Route Origin" && prefix) {
    flags.push({
      tone: "info",
      text: "Route Origin, also called Site of Origin: identifies the site a route was learned from, so a PE does not advertise it back into another link of the same multihomed site.",
    });
  }

  if (!transitive) {
    flags.push({
      tone: "info",
      text: "Non-transitive: RFC 4360 says it should be removed before the route is advertised across an AS boundary.",
    });
  }
  if (!typeInfo) {
    flags.push({ tone: "warn", text: `Type ${typeHex} is not in the table here, so only the raw value is shown.` });
  }

  fields.push({ label: "64-bit integer", value: bigFromBytes(bytes).toString() });
  if (canonical !== raw) fields.push({ label: "Hex", value: raw });

  return {
    input,
    kind: "extended",
    canonical,
    name: subInfo?.name ?? typeInfo?.name ?? null,
    bytes: hexBytes(bytes),
    fields,
    flags,
  };
}

/* ---------------------------------------------------------- text parsing */

function err(input: string, error: string): CommunityResult {
  return { ok: false, input, error };
}

function ok(input: string, value: DecodedCommunity): CommunityResult {
  return { ok: true, input, value };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function fromHex(hex: string, input: string, note: string | null): CommunityResult {
  if (hex.length === 16) return ok(input, decodeExtended(hexToBytes(hex), input, note));
  if (hex.length === 24) {
    const b = hexToBytes(hex);
    return ok(input, decodeLarge(readUint(b, 0, 4), readUint(b, 4, 4), readUint(b, 8, 4), input, note));
  }
  const trimmed = hex.replace(/^0+(?=.)/, "");
  if (trimmed.length <= 8) return ok(input, decodeStandard(parseInt(trimmed, 16), input, note));
  return err(
    input,
    `${hex.length} hex digits does not match any community. A standard community is up to 8 (4 bytes), an extended one exactly 16 (8 bytes) and a large one exactly 24 (12 bytes).`,
  );
}

const EXT_KEYWORDS: Record<string, 0x02 | 0x03> = {
  rt: 0x02,
  target: 0x02,
  routetarget: 0x02,
  soo: 0x03,
  ro: 0x03,
  origin: 0x03,
  routeorigin: 0x03,
  siteoforigin: 0x03,
};

function parseExtendedText(keyword: string, gaText: string, laText: string, input: string): CommunityResult {
  const sub = EXT_KEYWORDS[keyword];
  const what = sub === 0x02 ? "route target" : "route origin";
  const laBig = decimal(laText);
  if (laBig === null) return err(input, `The local administrator part, ${shortNumber(laText)}, must be a whole number.`);

  // IPv4-address-specific: a.b.c.d:nn (RFC 4360 section 4).
  if (/^\d+\.\d+\.\d+\.\d+$/.test(gaText)) {
    const octets = gaText.split(".").map((o) => (o.length > 3 ? 999 : Number(o)));
    if (octets.some((o) => o > 255)) return err(input, `${gaText} is not a valid IPv4 address. Each octet runs 0 to 255.`);
    if (laBig > 65535n) {
      return err(input, `An IPv4-address-specific ${what} leaves 16 bits for the local value, so it runs 0 to 65535. ${shortNumber(laText)} does not fit.`);
    }
    const bytes = concat(new Uint8Array([0x01, sub]), new Uint8Array(octets), toBytes(Number(laBig), 2));
    return ok(input, decodeExtended(bytes, input));
  }

  const forceFour = /[lL]$/.test(gaText);
  const asnText = forceFour ? gaText.slice(0, -1) : gaText;
  const asn = parseAsn(asnText);
  if (!asn.ok) return err(input, `The global administrator, ${shortNumber(gaText)}: ${asn.error}`);
  const ga = asn.value;
  const note = asn.note ? `Global administrator: ${asn.note}` : null;

  if (forceFour || ga > AS16_MAX) {
    // Four-octet AS-specific: 4-octet ASN, 16-bit local value (RFC 5668).
    if (laBig > 65535n) {
      return err(
        input,
        `A four-octet AS ${what} leaves only 16 bits for the local value, so it runs 0 to 65535. ${shortNumber(laText)} does not fit. That trade is why ${what}s for a 4-byte ASN often use a small local number scheme.`,
      );
    }
    const bytes = concat(new Uint8Array([0x02, sub]), toBytes(ga, 4), toBytes(Number(laBig), 2));
    return ok(input, decodeExtended(bytes, input, note));
  }

  // Two-octet AS-specific: 2-octet ASN, 32-bit local value (RFC 4360 section 3).
  if (laBig > BigInt(ASN_MAX)) {
    return err(input, `A two-octet AS ${what} has 32 bits for the local value, so it runs 0 to 4294967295. ${shortNumber(laText)} does not fit.`);
  }
  const bytes = concat(new Uint8Array([0x00, sub]), toBytes(ga, 2), toBytes(Number(laBig), 4));
  return ok(input, decodeExtended(bytes, input, note));
}

/** One community in any of the supported text forms. Never throws. */
export function parseCommunity(raw: string): CommunityResult {
  const input = raw.trim();
  if (input === "") return err(input, "Empty entry.");
  if (input.length > MAX_TOKEN) {
    return err(input, `That entry is ${input.length} characters. The longest community form needs well under ${MAX_TOKEN}.`);
  }

  const alias = BY_ALIAS.get(input.toLowerCase().replace(/[-_\s]/g, ""));
  if (alias) return ok(input, decodeStandard(alias.value, input));

  // 0x prefixed hex, any community size.
  if (/^0x[0-9a-f]+$/i.test(input)) return fromHex(input.slice(2), input, null);

  // Colon separated bytes, as copied from a packet capture: ff:ff:ff:01.
  if (/^[0-9a-f]{2}(?::[0-9a-f]{2}){3,}$/i.test(input)) {
    const hex = input.replace(/:/g, "");
    if (hex.length === 8 || hex.length === 16 || hex.length === 24) {
      return fromHex(hex, input, "Read as colon separated hex bytes.");
    }
    return err(input, `${hex.length / 2} hex bytes. A community is 4, 8 or 12 bytes.`);
  }

  // A plain decimal is the 32-bit (old format) standard community.
  if (/^\d+$/.test(input)) {
    const n = decimal(input);
    if (n !== null && n <= BigInt(ASN_MAX)) return ok(input, decodeStandard(Number(n), input));
    if (input.length === 16 || input.length === 24) {
      return fromHex(input, input, "Read as hex, because as a decimal it is wider than 32 bits.");
    }
    return err(input, `${shortNumber(input)} is wider than 32 bits. As an integer, a standard community runs 0 to 4294967295.`);
  }

  // Bare hex with at least one letter: deadbeef, 0002fde800000064.
  if (/^[0-9a-f]+$/i.test(input) && /[a-f]/i.test(input)) return fromHex(input, input, "Read as hexadecimal.");

  // Extended: rt:64496:100, target:192.0.2.1:7, soo:4200000000:1, rt:65000L:5.
  const ext = input.match(/^([a-z-]+):(.+):([^:]+)$/i);
  if (ext) {
    const keyword = ext[1].toLowerCase().replace(/-/g, "");
    if (keyword in EXT_KEYWORDS) return parseExtendedText(keyword, ext[2], ext[3], input);
    if (keyword !== "large") {
      return err(input, `Unknown prefix "${ext[1]}". Extended communities here start with rt, target, soo or origin, and large ones may start with large.`);
    }
  }

  // Large: 64496:1:2 or large:64496:1:2 (RFC 8092).
  const large = input.match(/^(?:large:)?([^:]+):([^:]+):([^:]+)$/i);
  if (large) {
    const ga = parseAsn(large[1]);
    if (!ga.ok) return err(input, `The global administrator of a large community, ${shortNumber(large[1])}: ${ga.error}`);
    const d1 = decimal(large[2]);
    const d2 = decimal(large[3]);
    if (d1 === null || d2 === null) return err(input, "Both local data parts of a large community must be whole numbers.");
    if (d1 > BigInt(ASN_MAX) || d2 > BigInt(ASN_MAX)) {
      return err(input, "Each local data part of a large community is 32 bits, so it runs 0 to 4294967295.");
    }
    return ok(input, decodeLarge(ga.value, Number(d1), Number(d2), input, ga.note ? `Global administrator: ${ga.note}` : null));
  }

  // Standard: ASN:value.
  const std = input.match(/^([^:]+):([^:]+)$/);
  if (std) {
    const [, left, right] = std;
    if (/^\d+\.\d+$/.test(left)) {
      return err(
        input,
        `${left} is an asdot ASN, which means it is above 65535 and cannot fit in the 16-bit half of a standard community. Use a large community instead, such as ${left}:${right}:0.`,
      );
    }
    const hi = decimal(left);
    const lo = decimal(right);
    if (hi === null || lo === null) {
      return err(input, "A standard community is two whole numbers separated by a colon, such as 64496:100.");
    }
    if (hi > 65535n) {
      const fits = hi <= BigInt(ASN_MAX) && lo <= BigInt(ASN_MAX);
      return err(
        input,
        `The first half of a standard community is 16 bits, 0 to 65535. ${shortNumber(left)} needs more.${fits ? ` A 4-byte ASN needs a large community, such as ${left}:${right}:0, or an extended one, such as rt:${left}:${right}.` : ""}`,
      );
    }
    if (lo > 65535n) {
      return err(input, `The second half of a standard community is 16 bits, 0 to 65535. ${shortNumber(right)} does not fit.`);
    }
    return ok(input, decodeStandard(Number(hi) * 65536 + Number(lo), input));
  }

  if (input.split(":").length > 4) {
    return err(input, "Too many colons. Standard is ASN:value, large is ASN:data1:data2, extended is rt:ASN:value.");
  }
  return err(
    input,
    "Not a recognized community. Try 64496:100, 4294967041, no-export, 64496:1:2 or rt:64496:100.",
  );
}

/* ------------------------------------------------------------------ batch */

export interface CommunityBatch {
  results: CommunityResult[];
  dropped: number;
  clipped: boolean;
}

const SPACED_KEYWORD = /\b(rt|target|soo|origin|large|route-target|route-origin|site-of-origin)\s+(?=\d)/gi;

/**
 * Splits pasted text into entries. Newlines, commas and semicolons always
 * separate. Spaces separate too, except after a keyword such as "rt", so a
 * line copied from a config ("rt 64496:100") stays one entry.
 */
export function splitCommunities(text: string): { tokens: string[]; dropped: number; clipped: boolean } {
  const clipped = text.length > MAX_COMMUNITY_INPUT;
  const source = clipped ? text.slice(0, MAX_COMMUNITY_INPUT) : text;
  const all = source
    .replace(SPACED_KEYWORD, "$1:")
    .split(/[\s,;]+/)
    .filter((t) => t !== "");
  const tokens = all.slice(0, MAX_COMMUNITIES);
  return { tokens, dropped: all.length - tokens.length, clipped };
}

export function decodeCommunities(text: string): CommunityBatch {
  const { tokens, dropped, clipped } = splitCommunities(text);
  return { results: tokens.map(parseCommunity), dropped, clipped };
}
