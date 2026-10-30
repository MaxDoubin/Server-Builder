/**
 * Multicast IP group to Ethernet MAC address mapping, in both directions.
 *
 * IPv4, RFC 1112 section 6.4: "An IP host group address is mapped to an
 * Ethernet multicast address by placing the low-order 23-bits of the IP
 * address into the low-order 23 bits of the Ethernet multicast address
 * 01-00-5E-00-00-00." The four leading bits of every IPv4 group are 1110,
 * so 28 bits identify a group and the 5 between the prefix and the copied
 * 23 are dropped. 2^5 = 32 groups therefore share each MAC.
 *
 * IPv6, RFC 2464 section 7: the destination MAC is 33:33 followed by the
 * last four octets of the group. The high 96 bits never reach the wire.
 *
 * Pure functions only, no React and no DOM, so the mapping can be tested
 * against the RFCs directly. IPv4 arithmetic stays in unsigned 32-bit range
 * with `>>> 0`; IPv6 uses BigInt for all 128 bits.
 */

/* ------------------------------------------------------------------ types */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Six octets, most significant first. */
export type MacBytes = number[];

export interface V4Collision {
  address: string;
  value: number;
  /** The five discarded bits for this member, 0 to 31. */
  lostBits: number;
  name: string | null;
}

export interface V6Candidate {
  address: string;
  name: string | null;
}

export type MapResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ipv4";
      address: string;
      value: number;
      mac: MacBytes;
      name: string | null;
      block: string;
      /** The five bits the MAC cannot carry, 0 to 31. */
      lostBits: number;
      collisions: V4Collision[];
      /** The MAC is one a 224.0.0.0/24 control group also uses. */
      sharesControlBlockMac: boolean;
      inControlBlock: boolean;
    }
  | {
      kind: "ipv6";
      address: string;
      value: bigint;
      mac: MacBytes;
      name: string | null;
      flags: number;
      scope: number;
      scopeName: string;
      flagNotes: string[];
      zoneIgnored: string | null;
    }
  | {
      kind: "ipv6-unicast";
      address: string;
      solicited: string;
      solicitedValue: bigint;
      mac: MacBytes;
    }
  | {
      kind: "mac";
      mac: MacBytes;
      multicast: boolean;
      family: "ipv4" | "ipv6" | "other";
      summary: string;
      ipv4Candidates: V4Collision[];
      ipv6Candidates: V6Candidate[];
      l2Name: string | null;
    };

/* ------------------------------------------------------------- constants */

/** Longest input accepted. A bracketed, zoned IPv6 address is under 64. */
export const MAX_INPUT_LENGTH = 100;

/** RFC 1112: the low 23 bits survive. */
export const LOW23 = 0x7fffff;

/** 01:00:5e, IANA's OUI 00:00:5e with the group bit set (RFC 7042). */
export const IPV4_MAC_PREFIX: MacBytes = [0x01, 0x00, 0x5e];

/** 33:33, RFC 2464 section 7. */
export const IPV6_MAC_PREFIX: MacBytes = [0x33, 0x33];

const MASK128 = (1n << 128n) - 1n;

/* ------------------------------------------------------------------- IPv4 */

/**
 * Strict dotted quad. Leading zeros are refused rather than guessed, because
 * inet_aton reads 010 as octal 8 while most other parsers read it as ten.
 */
export function parseIPv4(text: string): Parsed<number> {
  const s = text.trim();
  if (s === "") return { ok: false, error: "Enter an IPv4 address." };
  if (!/^[0-9.]+$/.test(s)) {
    return { ok: false, error: "An IPv4 address is four decimal numbers separated by dots." };
  }
  const parts = s.split(".");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `An IPv4 address has four octets separated by dots. This has ${parts.length}.`,
    };
  }
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i];
    if (part === "") return { ok: false, error: `Octet ${i + 1} is empty.` };
    if (part.length > 1 && part.startsWith("0")) {
      return {
        ok: false,
        error: `Octet ${i + 1} ("${part}") has a leading zero. Some parsers read that as octal, so it is refused rather than guessed.`,
      };
    }
    if (part.length > 3 || Number(part) > 255) {
      return { ok: false, error: `Octet ${i + 1} is ${part}. Each octet is 0 to 255.` };
    }
    value = value * 256 + Number(part);
  }
  return { ok: true, value: value >>> 0 };
}

export function formatIPv4(value: number): string {
  const v = value >>> 0;
  return [v >>> 24, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff].join(".");
}

/** 224.0.0.0/4: the top four bits are 1110. */
export function isIPv4Multicast(value: number): boolean {
  return value >>> 28 === 0xe;
}

/** RFC 1112 section 6.4. */
export function ipv4GroupToMac(value: number): MacBytes {
  const v = value >>> 0;
  return [0x01, 0x00, 0x5e, (v >>> 16) & 0x7f, (v >>> 8) & 0xff, v & 0xff];
}

/** Bits 27 to 23: the low nibble of the first octet and the top bit of the second. */
export function ipv4LostBits(value: number): number {
  return (value >>> 23) & 0x1f;
}

/** All 32 groups whose low 23 bits match, in ascending order. */
export function ipv4Collisions(value: number): V4Collision[] {
  const low = value & LOW23;
  const out: V4Collision[] = [];
  for (let k = 0; k < 32; k += 1) {
    const member = (0xe0000000 | (k << 23) | low) >>> 0;
    const address = formatIPv4(member);
    out.push({ address, value: member, lostBits: k, name: IPV4_NAMES[address] ?? null });
  }
  return out;
}

/** Well-known groups from the IANA multicast registry and the RFCs named. */
export const IPV4_NAMES: Record<string, string> = {
  "224.0.0.0": "Base address, reserved",
  "224.0.0.1": "All systems on this subnet (every multicast-capable host)",
  "224.0.0.2": "All routers on this subnet (HSRP version 1 also uses it)",
  "224.0.0.4": "DVMRP routers",
  "224.0.0.5": "OSPF AllSPFRouters (RFC 2328)",
  "224.0.0.6": "OSPF AllDRouters: the DR and BDR (RFC 2328)",
  "224.0.0.9": "RIPv2 routers (RFC 2453)",
  "224.0.0.10": "EIGRP routers",
  "224.0.0.13": "All PIM routers",
  "224.0.0.18": "VRRP (RFC 5798)",
  "224.0.0.22": "IGMPv3 membership reports (RFC 3376)",
  "224.0.0.102": "HSRP version 2 and GLBP",
  "224.0.0.251": "mDNS, multicast DNS (RFC 6762)",
  "224.0.0.252": "LLMNR (RFC 4795)",
  "224.0.1.1": "NTP",
  "224.0.1.129": "PTP, IEEE 1588 primary",
  "239.255.255.250": "SSDP, UPnP discovery",
  "239.255.255.253": "SLP, Service Location Protocol (RFC 2608)",
};

const v4 = (a: number, b: number, c: number, d: number) => (((a * 256 + b) * 256 + c) * 256 + d) >>> 0;

/** RFC 5771 section 3, refined by RFC 2365 for 239/8 and RFC 6034 for 234/8. */
const IPV4_BLOCKS: { lo: number; hi: number; label: string }[] = [
  { lo: v4(224, 0, 0, 0), hi: v4(224, 0, 0, 255), label: "Local Network Control Block (RFC 5771). Link-local: routers never forward it." },
  { lo: v4(224, 0, 1, 0), hi: v4(224, 0, 1, 255), label: "Internetwork Control Block (RFC 5771)" },
  { lo: v4(224, 0, 2, 0), hi: v4(224, 0, 255, 255), label: "AD-HOC Block I (RFC 5771)" },
  { lo: v4(224, 1, 0, 0), hi: v4(224, 1, 255, 255), label: "Reserved (RFC 5771)" },
  { lo: v4(224, 2, 0, 0), hi: v4(224, 2, 255, 255), label: "SDP/SAP Block (RFC 5771)" },
  { lo: v4(224, 3, 0, 0), hi: v4(224, 4, 255, 255), label: "AD-HOC Block II (RFC 5771)" },
  { lo: v4(224, 5, 0, 0), hi: v4(231, 255, 255, 255), label: "Reserved (RFC 5771)" },
  { lo: v4(232, 0, 0, 0), hi: v4(232, 255, 255, 255), label: "Source-Specific Multicast Block (RFC 4607)" },
  { lo: v4(233, 0, 0, 0), hi: v4(233, 251, 255, 255), label: "GLOP Block (RFC 3180): the middle two octets are a 16-bit AS number" },
  { lo: v4(233, 252, 0, 0), hi: v4(233, 252, 0, 255), label: "MCAST-TEST-NET, reserved for documentation (RFC 5771)" },
  { lo: v4(233, 252, 1, 0), hi: v4(233, 255, 255, 255), label: "AD-HOC Block III (RFC 5771)" },
  { lo: v4(234, 0, 0, 0), hi: v4(234, 255, 255, 255), label: "Unicast-prefix-based multicast (RFC 6034)" },
  { lo: v4(235, 0, 0, 0), hi: v4(238, 255, 255, 255), label: "Reserved (RFC 5771)" },
  { lo: v4(239, 192, 0, 0), hi: v4(239, 195, 255, 255), label: "Organization Local Scope, administratively scoped (RFC 2365)" },
  { lo: v4(239, 255, 0, 0), hi: v4(239, 255, 255, 255), label: "IPv4 Local Scope, administratively scoped (RFC 2365)" },
  { lo: v4(239, 0, 0, 0), hi: v4(239, 255, 255, 255), label: "Administratively Scoped Block (RFC 2365)" },
];

export function ipv4Block(value: number): string {
  const v = value >>> 0;
  for (const block of IPV4_BLOCKS) {
    if (v >= block.lo && v <= block.hi) return block.label;
  }
  return "Not multicast";
}

/** The MAC a 224.0.0.0/24 group would use: 01:00:5e:00:00:xx. */
function macIsControlBlock(mac: MacBytes): boolean {
  return mac[0] === 0x01 && mac[1] === 0x00 && mac[2] === 0x5e && mac[3] === 0x00 && mac[4] === 0x00;
}

/* ------------------------------------------------------------------- IPv6 */

function groupsToBigInt(groups: number[]): bigint {
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(g & 0xffff), 0n);
}

export function bigIntToGroups(value: bigint): number[] {
  const v = value & MASK128;
  const out: number[] = [];
  for (let i = 7; i >= 0; i -= 1) out.push(Number((v >> BigInt(i * 16)) & 0xffffn));
  return out;
}

export interface ParsedV6 {
  value: bigint;
  zone: string | null;
}

/** RFC 4291 section 2.2 text forms, including "::" and a dotted IPv4 tail. */
export function parseIPv6(text: string): Parsed<ParsedV6> {
  let s = text.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  let zone: string | null = null;
  const pct = s.indexOf("%");
  if (pct >= 0) {
    zone = s.slice(pct + 1);
    s = s.slice(0, pct);
    if (zone === "") return { ok: false, error: "A % must be followed by a zone, for example %eth0." };
  }
  if (s === "") return { ok: false, error: "Enter an IPv6 address." };
  if (!/^[0-9a-fA-F:.]+$/.test(s)) {
    return {
      ok: false,
      error: "An IPv6 address is hex digits and colons, with an optional dotted IPv4 tail in the last 32 bits.",
    };
  }

  let tail: number[] = [];
  if (s.includes(".")) {
    const lastColon = s.lastIndexOf(":");
    const dotted = s.slice(lastColon + 1);
    const parsed = parseIPv4(dotted);
    if (!parsed.ok) {
      return { ok: false, error: `The dotted tail "${dotted}" is not a valid IPv4 address. ${parsed.error}` };
    }
    tail = [parsed.value >>> 16, parsed.value & 0xffff];
    s = s.slice(0, lastColon + 1);
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }

  const first = s.indexOf("::");
  if (first !== -1 && first !== s.lastIndexOf("::")) {
    return { ok: false, error: '"::" may appear only once, otherwise the length of each gap is ambiguous.' };
  }

  const split = (part: string) => (part === "" ? [] : part.split(":"));
  const head = first === -1 ? split(s) : split(s.slice(0, first));
  const rest = first === -1 ? [] : split(s.slice(first + 2));

  const groups: number[] = [];
  for (const g of [...head, ...rest]) {
    if (g === "") return { ok: false, error: 'There is an empty group: a single colon where a value or "::" belongs.' };
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      return { ok: false, error: `"${g}" is not a group. Each group is one to four hex digits.` };
    }
  }
  const total = head.length + rest.length + tail.length;
  if (first === -1) {
    if (total !== 8) {
      return { ok: false, error: `An IPv6 address has eight 16-bit groups. This has ${total}, and no "::" to fill the gap.` };
    }
    groups.push(...head.map((g) => parseInt(g, 16)), ...tail);
  } else {
    if (total > 7) {
      return { ok: false, error: `With "::" there must be at most seven explicit groups. This has ${total}.` };
    }
    groups.push(
      ...head.map((g) => parseInt(g, 16)),
      ...new Array<number>(8 - total).fill(0),
      ...rest.map((g) => parseInt(g, 16)),
      ...tail,
    );
  }
  return { ok: true, value: { value: groupsToBigInt(groups), zone } };
}

/** RFC 5952 section 4: lowercase, no leading zeros, longest zero run of two or more as "::", first on a tie. */
export function formatIPv6(value: bigint): string {
  const groups = bigIntToGroups(value);
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

export function isIPv6Multicast(value: bigint): boolean {
  return ((value >> 120n) & 0xffn) === 0xffn;
}

/** RFC 2464 section 7. */
export function ipv6GroupToMac(value: bigint): MacBytes {
  const low = Number(value & 0xffffffffn);
  return [0x33, 0x33, (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff];
}

/** RFC 4291 section 2.7.1: ff02::1:ff00:0/104 plus the low 24 bits. */
export const SOLICITED_NODE_PREFIX = groupsToBigInt([0xff02, 0, 0, 0, 0, 1, 0xff00, 0]);

export function solicitedNodeGroup(unicast: bigint): bigint {
  return SOLICITED_NODE_PREFIX | (unicast & 0xffffffn);
}

export function isSolicitedNode(value: bigint): boolean {
  return (value & ~0xffffffn & MASK128) === SOLICITED_NODE_PREFIX;
}

/** RFC 4291 section 2.7 and RFC 7346 (realm-local). */
export function ipv6ScopeName(scope: number): string {
  switch (scope) {
    case 0x1:
      return "interface-local";
    case 0x2:
      return "link-local";
    case 0x3:
      return "realm-local";
    case 0x4:
      return "admin-local";
    case 0x5:
      return "site-local";
    case 0x8:
      return "organization-local";
    case 0xe:
      return "global";
    case 0x0:
    case 0xf:
      return "reserved";
    default:
      return "unassigned";
  }
}

/** Flags are 0RPT: RFC 4291 (T), RFC 3306 (P), RFC 3956 (R). */
export function ipv6FlagNotes(flags: number): string[] {
  const notes: string[] = [];
  if (flags & 0x8) notes.push("The high flag bit is reserved and should be 0.");
  if (flags & 0x4) notes.push("R = 1: the address embeds its rendezvous point (RFC 3956).");
  if (flags & 0x2) notes.push("P = 1: the group is based on a unicast prefix (RFC 3306).");
  notes.push(
    flags & 0x1
      ? "T = 1: a transient, dynamically assigned group."
      : "T = 0: a permanently assigned, well-known group.",
  );
  return notes;
}

/** Well-known IPv6 groups from RFC 4291 and the protocol RFCs named. */
const IPV6_NAME_LIST: [string, string][] = [
  ["ff01::1", "All nodes, interface-local (RFC 4291)"],
  ["ff02::1", "All nodes, link-local (RFC 4291)"],
  ["ff01::2", "All routers, interface-local (RFC 4291)"],
  ["ff02::2", "All routers, link-local (RFC 4291)"],
  ["ff05::2", "All routers, site-local (RFC 4291)"],
  ["ff02::5", "OSPFv3 AllSPFRouters (RFC 5340)"],
  ["ff02::6", "OSPFv3 AllDRouters (RFC 5340)"],
  ["ff02::9", "RIPng routers (RFC 2080)"],
  ["ff02::a", "EIGRP routers"],
  ["ff02::c", "SSDP, UPnP discovery"],
  ["ff02::d", "All PIM routers"],
  ["ff02::12", "VRRP (RFC 5798)"],
  ["ff02::16", "MLDv2-capable routers, where MLDv2 reports go (RFC 3810)"],
  ["ff02::fb", "mDNS, multicast DNS (RFC 6762)"],
  ["ff02::1:2", "All DHCP relay agents and servers (RFC 8415)"],
  ["ff02::1:3", "LLMNR (RFC 4795)"],
  ["ff05::1:3", "All DHCP servers, site-local (RFC 8415)"],
];

const IPV6_NAMES = new Map<bigint, string>();
for (const [text, name] of IPV6_NAME_LIST) {
  const parsed = parseIPv6(text);
  if (parsed.ok) IPV6_NAMES.set(parsed.value.value, name);
}

export function ipv6Name(value: bigint): string | null {
  const exact = IPV6_NAMES.get(value);
  if (exact) return exact;
  if (isSolicitedNode(value)) {
    const low = Number(value & 0xffffffn).toString(16).padStart(6, "0");
    return `Solicited-node group for unicast addresses ending in ${low.slice(0, 2)}:${low.slice(2)} (RFC 4291)`;
  }
  // RFC 6676: ff0X::db8:0:0/96 is reserved for documentation.
  const groups = bigIntToGroups(value);
  if ((groups[0] & 0xfff0) === 0xff00 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0x0db8) {
    return "Documentation range, ff0X::db8:0:0/96 (RFC 6676)";
  }
  return null;
}

/* -------------------------------------------------------------------- MAC */

/**
 * Colon or hyphen separated (one or two hex digits per octet), Cisco dotted
 * (0100.5e00.0001), or twelve bare hex digits.
 */
export function parseMac(text: string): Parsed<MacBytes> {
  const s = text.trim();
  let hex: string | null = null;
  const sep = /^([0-9a-fA-F]{1,2})([:-])([0-9a-fA-F]{1,2})\2([0-9a-fA-F]{1,2})\2([0-9a-fA-F]{1,2})\2([0-9a-fA-F]{1,2})\2([0-9a-fA-F]{1,2})$/.exec(s);
  if (sep) {
    hex = [sep[1], sep[3], sep[4], sep[5], sep[6], sep[7]].map((o) => o.padStart(2, "0")).join("");
  } else if (/^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/.test(s)) {
    hex = s.replace(/\./g, "");
  } else if (/^[0-9a-fA-F]{12}$/.test(s)) {
    hex = s;
  }
  if (hex === null) {
    return {
      ok: false,
      error: "A MAC address is six octets: 01:00:5e:00:00:fb, 01-00-5E-00-00-FB, 0100.5e00.00fb or 01005e0000fb.",
    };
  }
  const bytes: MacBytes = [];
  for (let i = 0; i < 12; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return { ok: true, value: bytes };
}

export type MacStyle = "colon" | "hyphen" | "cisco" | "bare";

export function formatMac(mac: MacBytes, style: MacStyle = "colon"): string {
  const h = mac.map((b) => b.toString(16).padStart(2, "0"));
  switch (style) {
    case "hyphen":
      return h.join("-").toUpperCase();
    case "cisco":
      return `${h[0]}${h[1]}.${h[2]}${h[3]}.${h[4]}${h[5]}`;
    case "bare":
      return h.join("");
    default:
      return h.join(":");
  }
}

/** Layer 2 multicast addresses seen on almost every switched network. */
const L2_NAMES: Record<string, string> = {
  "01:80:c2:00:00:00": "IEEE 802.1D bridge group address: STP, RSTP and MSTP BPDUs",
  "01:80:c2:00:00:01": "IEEE 802.3 MAC Control: Ethernet PAUSE frames",
  "01:80:c2:00:00:02": "IEEE 802.3 Slow Protocols: LACP and link OAM",
  "01:80:c2:00:00:03": "IEEE 802.1X port access entity (EAPOL)",
  "01:80:c2:00:00:0e": "LLDP, nearest bridge (IEEE 802.1AB)",
  "01:00:0c:cc:cc:cc": "Cisco CDP, VTP, DTP, PAgP and UDLD",
  "01:00:0c:cc:cc:cd": "Cisco PVST+ (Shared Spanning Tree Protocol)",
  "ff:ff:ff:ff:ff:ff": "Broadcast",
};

/** The scopes listed when a 33:33 MAC is reversed, most common first. */
const REVERSE_SCOPES = [0x2, 0x1, 0x5, 0x8, 0xe];

export function macToCandidates(mac: MacBytes): MapResult {
  const multicast = (mac[0] & 1) === 1;
  const colon = formatMac(mac);
  const base = { kind: "mac" as const, mac, multicast, ipv4Candidates: [], ipv6Candidates: [], l2Name: L2_NAMES[colon] ?? null };

  if (!multicast) {
    return {
      ...base,
      family: "other",
      summary:
        "This is a unicast MAC: the I/G bit, the lowest bit of the first octet, is 0. No multicast group maps to it.",
    };
  }

  if (mac[0] === 0x01 && mac[1] === 0x00 && mac[2] === 0x5e) {
    if (mac[3] & 0x80) {
      const mpls = (mac[3] & 0xf0) === 0x80;
      return {
        ...base,
        family: "other",
        summary: mpls
          ? "In the upper half of 01:00:5e, which RFC 1112 does not use. 01:00:5e:80:00:00 to 01:00:5e:8f:ff:ff is MPLS multicast (RFC 5332), carrying the low 20 bits of an MPLS label. No IPv4 group maps here."
          : "In the upper half of 01:00:5e, which RFC 1112 does not use: IPv4 groups only ever map to 01:00:5e:00:00:00 through 01:00:5e:7f:ff:ff. No IPv4 group maps here.",
      };
    }
    const low = ((mac[3] << 16) | (mac[4] << 8) | mac[5]) & LOW23;
    return {
      ...base,
      family: "ipv4",
      summary:
        "An IPv4 multicast MAC. It carries the low 23 bits of the group, so these 32 groups are all equally possible; only the IP header says which one a frame is for.",
      ipv4Candidates: ipv4Collisions((0xe0000000 | low) >>> 0),
    };
  }

  if (mac[0] === 0x33 && mac[1] === 0x33) {
    const low = BigInt(((mac[2] << 24) | (mac[3] << 16) | (mac[4] << 8) | mac[5]) >>> 0);
    const candidates: V6Candidate[] = [];
    const seen = new Set<bigint>();
    const add = (value: bigint) => {
      if (seen.has(value)) return;
      seen.add(value);
      candidates.push({ address: formatIPv6(value), name: ipv6Name(value) });
    };
    if (mac[2] === 0xff) add(SOLICITED_NODE_PREFIX | (low & 0xffffffn));
    for (const scope of REVERSE_SCOPES) add((BigInt(0xff00 | scope) << 112n) | low);
    return {
      ...base,
      family: "ipv6",
      summary:
        "An IPv6 multicast MAC. It carries only the low 32 bits of the group, so any of 2^96 groups (about 7.9 × 10^28) with those low bits maps here. The likeliest ones are listed.",
      ipv6Candidates: candidates,
    };
  }

  const reserved = mac[0] === 0x01 && mac[1] === 0x80 && mac[2] === 0xc2 && mac[3] === 0 && mac[4] === 0 && mac[5] <= 0x0f;
  return {
    ...base,
    family: "other",
    summary: reserved
      ? "A multicast MAC in the IEEE 802.1 reserved block, 01:80:c2:00:00:00 to 01:80:c2:00:00:0f. Bridges consume these rather than forward them. No IP group maps here."
      : "A multicast MAC (the I/G bit is 1), but not in 01:00:5e or 33:33, so no IP multicast group maps to it.",
  };
}

/* ------------------------------------------------------------ entry point */

const CISCO_MAC = /^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/;
const SEP_MAC = /^[0-9a-fA-F]{1,2}([:-])[0-9a-fA-F]{1,2}(\1[0-9a-fA-F]{1,2}){4}$/;
const BARE_MAC = /^[0-9a-fA-F]{12}$/;

function mapIPv4(text: string): MapResult {
  const parsed = parseIPv4(text);
  if (!parsed.ok) return { kind: "error", message: parsed.error };
  const value = parsed.value;
  if (!isIPv4Multicast(value)) {
    return {
      kind: "error",
      message: `${formatIPv4(value)} is not a multicast address. IPv4 multicast is 224.0.0.0/4, which is 224.0.0.0 through 239.255.255.255.`,
    };
  }
  const address = formatIPv4(value);
  const mac = ipv4GroupToMac(value);
  const inControlBlock = value >>> 8 === 0xe00000;
  return {
    kind: "ipv4",
    address,
    value,
    mac,
    name: IPV4_NAMES[address] ?? null,
    block: ipv4Block(value),
    lostBits: ipv4LostBits(value),
    collisions: ipv4Collisions(value),
    sharesControlBlockMac: macIsControlBlock(mac),
    inControlBlock,
  };
}

function mapIPv6(text: string): MapResult {
  const parsed = parseIPv6(text);
  if (!parsed.ok) return { kind: "error", message: parsed.error };
  const { value, zone } = parsed.value;
  if (!isIPv6Multicast(value)) {
    if (value === 0n || value === 1n) {
      return {
        kind: "error",
        message: `${formatIPv6(value)} is the ${value === 0n ? "unspecified" : "loopback"} address, not a multicast group. IPv6 multicast is ff00::/8.`,
      };
    }
    const solicited = solicitedNodeGroup(value);
    return {
      kind: "ipv6-unicast",
      address: formatIPv6(value),
      solicited: formatIPv6(solicited),
      solicitedValue: solicited,
      mac: ipv6GroupToMac(solicited),
    };
  }
  const groups = bigIntToGroups(value);
  const flags = (groups[0] >> 4) & 0xf;
  const scope = groups[0] & 0xf;
  return {
    kind: "ipv6",
    address: formatIPv6(value),
    value,
    mac: ipv6GroupToMac(value),
    name: ipv6Name(value),
    flags,
    scope,
    scopeName: ipv6ScopeName(scope),
    flagNotes: ipv6FlagNotes(flags),
    zoneIgnored: zone,
  };
}

/** Detects IPv4, IPv6 or MAC input and maps it. Never throws. */
export function mapInput(raw: string): MapResult {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_LENGTH) {
    return { kind: "error", message: `That is longer than any address. Input is capped at ${MAX_INPUT_LENGTH} characters.` };
  }
  if (text.includes("/")) {
    return { kind: "error", message: "Enter one address without a /prefix length." };
  }
  if (CISCO_MAC.test(text) || SEP_MAC.test(text) || BARE_MAC.test(text)) {
    const parsed = parseMac(text);
    return parsed.ok ? macToCandidates(parsed.value) : { kind: "error", message: parsed.error };
  }
  if (/^[0-9.]+$/.test(text)) return mapIPv4(text);
  if (text.includes(":")) return mapIPv6(text);
  return {
    kind: "error",
    message: "Not recognized. Enter an IPv4 group such as 224.0.0.5, an IPv6 group such as ff02::1, or a MAC such as 01:00:5e:00:00:05.",
  };
}

/* ------------------------------------------------------------ bit strings */

export function toBits(value: number, width: number): string {
  return (value >>> 0).toString(2).padStart(32, "0").slice(32 - width);
}
