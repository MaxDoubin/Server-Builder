/**
 * IEEE 802.1Q tag decoding and building.
 *
 * A tag is 4 bytes inserted after the source MAC: a 16 bit TPID (0x8100 for
 * an 802.1Q C-tag, 0x88a8 for an 802.1ad S-tag) and a 16 bit TCI. The TCI is
 * PCP (3 bits, priority code point), DEI (1 bit, drop eligible indicator)
 * and VID (12 bits, VLAN identifier), most significant bit first.
 *
 * Accepts one tag (4 bytes), a stacked pair (8 bytes), a bare TCI (2 bytes),
 * or a frame starting at the destination MAC (14 bytes or more), in which
 * case the tags are walked from offset 12.
 *
 * Pure functions, no DOM, so the bit arithmetic can be tested directly.
 */

export const TPID_CTAG = 0x8100;
export const TPID_STAG = 0x88a8;
/** Pre-standard QinQ outer tag some vendors used before 802.1ad. Not an IEEE value. */
export const TPID_LEGACY_QINQ = 0x9100;

export const VID_NULL = 0;
export const VID_RESERVED = 0xfff;
export const VID_MAX = 0xfff;

/** Longest input accepted. A frame header needs fewer than 40 bytes. */
export const MAX_INPUT_CHARS = 4096;
/** Most tags walked in frame mode. 802.1ad defines two; three is already unusual. */
export const MAX_FRAME_TAGS = 4;

export interface TpidInfo {
  short: string;
  name: string;
}

export const TPIDS: Record<number, TpidInfo> = {
  [TPID_CTAG]: { short: "C-tag", name: "IEEE 802.1Q customer VLAN tag" },
  [TPID_STAG]: { short: "S-tag", name: "IEEE 802.1ad service VLAN tag (QinQ outer)" },
  [TPID_LEGACY_QINQ]: { short: "Legacy QinQ", name: "Pre-standard QinQ outer tag (vendor value, not IEEE)" },
};

export function isVlanTpid(value: number): boolean {
  return value === TPID_CTAG || value === TPID_STAG || value === TPID_LEGACY_QINQ;
}

export interface PcpInfo {
  value: number;
  code: string;
  name: string;
  note: string;
}

/**
 * Traffic types from IEEE 802.1Q Annex I (traffic type acronyms and their
 * default PCP values, unchanged since 802.1D-2004). In priority order from
 * lowest the values run 1, 0, 2, 3, 4, 5, 6, 7: background sits below best
 * effort.
 */
export const PCP_TABLE: PcpInfo[] = [
  { value: 0, code: "BE", name: "Best effort", note: "The default for unmarked traffic. Ranks above background." },
  { value: 1, code: "BK", name: "Background", note: "The lowest priority: bulk traffic that should yield to everything else." },
  { value: 2, code: "EE", name: "Excellent effort", note: "Best effort for traffic that matters more than the default." },
  { value: 3, code: "CA", name: "Critical applications", note: "Business critical traffic with a guaranteed minimum bandwidth." },
  { value: 4, code: "VI", name: "Video", note: "Latency and jitter under 100 ms." },
  { value: 5, code: "VO", name: "Voice", note: "Latency and jitter under 10 ms." },
  { value: 6, code: "IC", name: "Internetwork control", note: "Control traffic between administrative domains." },
  { value: 7, code: "NC", name: "Network control", note: "Traffic that maintains the network infrastructure itself." },
];

/** EtherTypes a reader is likely to meet where a TPID was expected. */
export const ETHERTYPES: Record<number, string> = {
  0x0800: "IPv4",
  0x0806: "ARP",
  0x0842: "Wake-on-LAN",
  0x8035: "RARP",
  0x86dd: "IPv6",
  0x8100: "802.1Q C-tag",
  0x8809: "Slow protocols (LACP, OAM)",
  0x8847: "MPLS unicast",
  0x8848: "MPLS multicast",
  0x8863: "PPPoE discovery",
  0x8864: "PPPoE session",
  0x888e: "EAPOL (802.1X)",
  0x88a8: "802.1ad S-tag",
  0x88cc: "LLDP",
  0x88e5: "MACsec",
  0x88e7: "802.1ah PBB I-tag",
  0x88f7: "PTP",
  0x9100: "Legacy QinQ tag",
};

/** What a 16 bit value means when it sits where an EtherType or TPID goes. */
export function describeType(value: number): string {
  // IEEE 802.3 clause 3.2.6: 1500 and below is a length, 0x0600 and up an EtherType.
  if (value <= 0x05dc) return `an 802.3 length field (${value} bytes)`;
  if (value < 0x0600) return "an undefined value: neither a length (at most 1500) nor an EtherType (0x0600 and up)";
  const known = ETHERTYPES[value];
  return known ? `the ${known} EtherType` : "an EtherType this tool does not name";
}

export function hex16(value: number): string {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

export function bytesToHex(bytes: number[], sep = " "): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(sep);
}

/* ---------------------------------------------------------------- input */

export type HexParse = { kind: "empty" } | { kind: "error"; message: string } | { kind: "ok"; bytes: number[] };

/**
 * Hex in the shapes people paste: "81 00 a0 64", "8100a064", "0x8100a064",
 * "81:00:a0:64", "8100.a064", "\x81\x00\xa0\x64". When every token is one or
 * two digits each token is a byte, so "81 0 a0 64" works as written.
 */
export function parseHexBytes(raw: string): HexParse {
  if (raw.length > MAX_INPUT_CHARS) {
    return {
      kind: "error",
      message: `That is ${raw.length.toLocaleString("en-US")} characters. The decoder reads at most ${MAX_INPUT_CHARS.toLocaleString("en-US")}, which is far more than a frame header needs.`,
    };
  }
  const text = raw.replace(/\\x/gi, " ").trim();
  if (text === "") return { kind: "empty" };

  const tokens = text
    .split(/[\s:,.;_-]+/)
    .filter((tok) => tok !== "")
    .map((tok) => tok.replace(/^0x/i, ""));
  if (tokens.length === 0 || tokens.every((tok) => tok === "")) {
    return { kind: "error", message: "There are no hex digits in that." };
  }
  for (const tok of tokens) {
    // The u flag keeps an emoji or other astral character whole in the message.
    const bad = tok.match(/[^0-9a-f]/iu);
    if (bad) {
      return { kind: "error", message: `"${bad[0]}" is not a hex digit. Use 0 to 9 and a to f.` };
    }
  }

  if (tokens.length > 1 && tokens.every((tok) => tok.length >= 1 && tok.length <= 2)) {
    return { kind: "ok", bytes: tokens.map((tok) => parseInt(tok, 16)) };
  }
  const digits = tokens.join("");
  if (digits.length === 0) return { kind: "error", message: "There are no hex digits in that." };
  if (digits.length % 2 === 1) {
    return {
      kind: "error",
      message: `That is ${digits.length} hex digits, an odd number. Each byte is exactly two digits, so one is missing or extra.`,
    };
  }
  const bytes: number[] = [];
  for (let i = 0; i < digits.length; i += 2) bytes.push(parseInt(digits.slice(i, i + 2), 16));
  return { kind: "ok", bytes };
}

/* --------------------------------------------------------------- decode */

export type Tone = "ok" | "info" | "warn" | "danger";

export interface Finding {
  tone: Tone;
  text: string;
}

export interface TciFields {
  tci: number;
  pcp: number;
  dei: number;
  vid: number;
  pcpInfo: PcpInfo;
}

export function splitTci(tci: number): TciFields {
  const value = tci & 0xffff;
  const pcp = (value >> 13) & 0x7;
  const dei = (value >> 12) & 0x1;
  const vid = value & 0xfff;
  return { tci: value, pcp, dei, vid, pcpInfo: PCP_TABLE[pcp] };
}

/** What a VID means, independent of the tag it sits in. */
export function vidFindings(vid: number): Finding[] {
  if (vid === VID_NULL) {
    return [
      {
        tone: "warn",
        text: "VID 0 is the null VLAN ID: a priority tagged frame. It carries a PCP value and no VLAN, and the receiving port places it in its own port VLAN (PVID).",
      },
    ];
  }
  if (vid === VID_RESERVED) {
    return [
      {
        tone: "danger",
        text: "VID 4095 (0xFFF) is reserved by 802.1Q. It must not be configured as a port VLAN or sent in a tag, so a frame carrying it is malformed or crafted.",
      },
    ];
  }
  if (vid === 1) {
    return [
      {
        tone: "info",
        text: "VID 1 is the default VLAN on most switches, and the default native VLAN on Cisco trunks. User traffic left in VLAN 1 is a routine audit finding.",
      },
    ];
  }
  if (vid >= 1002 && vid <= 1005) {
    return [
      {
        tone: "info",
        text: "Cisco IOS creates VLANs 1002 to 1005 for legacy FDDI and Token Ring use and will not let you delete them, so they are unavailable for ordinary Ethernet VLANs on that platform.",
      },
    ];
  }
  return [{ tone: "ok", text: `VID ${vid} is an ordinary VLAN ID (1 to 4094 are usable).` }];
}

export interface DecodedTag {
  /** Offset of the tag in the input, in bytes. */
  offset: number;
  bytes: number[];
  /** Null for a bare TCI, which has no TPID. */
  tpid: number | null;
  tpidInfo: TpidInfo | null;
  fields: TciFields;
  findings: Finding[];
}

function decodeTagAt(bytes: number[], offset: number): DecodedTag {
  const tpid = (bytes[offset] << 8) | bytes[offset + 1];
  const tci = (bytes[offset + 2] << 8) | bytes[offset + 3];
  const fields = splitTci(tci);
  const tpidInfo = TPIDS[tpid] ?? null;
  const findings: Finding[] = [];
  if (!tpidInfo) {
    findings.push({
      tone: "danger",
      text: `${hex16(tpid)} is not a VLAN TPID. It is ${describeType(tpid)}. The TCI below is what those bytes would mean if they were a tag.`,
    });
  } else if (tpid === TPID_LEGACY_QINQ) {
    findings.push({
      tone: "warn",
      text: "0x9100 predates 802.1ad. Some vendors used it for the QinQ outer tag; standard gear expects 0x88a8.",
    });
  }
  if (fields.dei === 1) {
    findings.push({
      tone: "info",
      text: "DEI is set: under congestion this frame may be dropped before frames of the same priority without it. In C-tags before 802.1Q-2011 this bit was CFI.",
    });
  }
  findings.push(...vidFindings(fields.vid));
  return { offset, bytes: bytes.slice(offset, offset + 4), tpid, tpidInfo, fields, findings };
}

export interface FrameInfo {
  dst: string;
  src: string;
  /** The 16 bit value after the last tag, if the input reaches it. */
  etherType: number | null;
  etherTypeName: string | null;
}

export type Decoded =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | {
      kind: "ok";
      mode: "tci" | "tag" | "pair" | "frame";
      byteCount: number;
      tags: DecodedTag[];
      frame: FrameInfo | null;
      /** Findings about the stack as a whole: order, double tagging. */
      stack: Finding[];
    };

function macString(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
}

function stackFindings(tags: DecodedTag[]): Finding[] {
  if (tags.length < 2) return [];
  const out: Finding[] = [];
  const outer = tags[0].tpid;
  const inner = tags[1].tpid;
  if ((outer === TPID_STAG || outer === TPID_LEGACY_QINQ) && inner === TPID_CTAG) {
    out.push({
      tone: "ok",
      text:
        outer === TPID_STAG
          ? "Standard 802.1ad stacking: the provider's S-tag outside, the customer's C-tag inside."
          : "Pre-standard QinQ: a 0x9100 outer tag over a customer C-tag.",
    });
  } else if (outer === TPID_CTAG && inner === TPID_CTAG) {
    out.push({
      tone: "warn",
      text: "Two 0x8100 tags. Some gear stacks 802.1Q on 802.1Q, but this is also the shape of the double tagging VLAN hopping attack: a switch that strips the outer tag because it matches the native VLAN forwards the frame across a trunk with the inner tag still on.",
    });
  } else if (outer === TPID_CTAG && (inner === TPID_STAG || inner === TPID_LEGACY_QINQ)) {
    out.push({
      tone: "warn",
      text: "A service tag inside a customer tag is backwards. 802.1ad puts the S-tag outermost, first on the wire.",
    });
  } else if (outer === TPID_STAG && inner === TPID_STAG) {
    out.push({ tone: "warn", text: "Two S-tags. 802.1ad stacks one S-tag over one C-tag; two S-tags is vendor specific." });
  }
  if (tags.length > 2) {
    out.push({ tone: "info", text: `${tags.length} stacked tags. 802.1ad defines two; more is vendor specific.` });
  }
  return out;
}

export function decodeInput(raw: string): Decoded {
  const parsed = parseHexBytes(raw);
  if (parsed.kind !== "ok") return parsed;
  const bytes = parsed.bytes;
  const n = bytes.length;

  if (n === 2) {
    const fields = splitTci((bytes[0] << 8) | bytes[1]);
    const findings: Finding[] = [
      { tone: "info", text: "Two bytes are read as a bare TCI, with no TPID in front of it." },
    ];
    if (fields.dei === 1) {
      findings.push({ tone: "info", text: "DEI is set: this frame may be dropped first under congestion." });
    }
    findings.push(...vidFindings(fields.vid));
    return {
      kind: "ok",
      mode: "tci",
      byteCount: n,
      tags: [{ offset: 0, bytes: bytes.slice(0, 2), tpid: null, tpidInfo: null, fields, findings }],
      frame: null,
      stack: [],
    };
  }

  if (n === 4) {
    return { kind: "ok", mode: "tag", byteCount: n, tags: [decodeTagAt(bytes, 0)], frame: null, stack: [] };
  }

  if (n === 8) {
    const first = decodeTagAt(bytes, 0);
    const secondTpid = (bytes[4] << 8) | bytes[5];
    if (first.tpidInfo && !isVlanTpid(secondTpid)) {
      // One tag, then the payload's EtherType. Say so rather than inventing a second tag.
      return {
        kind: "ok",
        mode: "tag",
        byteCount: n,
        tags: [first],
        frame: null,
        stack: [
          {
            tone: "info",
            text: `Bytes 5 and 6 are ${hex16(secondTpid)}, ${describeType(secondTpid)}, not a TPID. So this is one tag followed by the payload type, and only the first 4 bytes are decoded as a tag.`,
          },
        ],
      };
    }
    const tags = [first, decodeTagAt(bytes, 4)];
    return { kind: "ok", mode: "pair", byteCount: n, tags, frame: null, stack: stackFindings(tags) };
  }

  if (n >= 14) {
    const tags: DecodedTag[] = [];
    let offset = 12;
    while (offset + 4 <= n && tags.length < MAX_FRAME_TAGS && isVlanTpid((bytes[offset] << 8) | bytes[offset + 1])) {
      tags.push(decodeTagAt(bytes, offset));
      offset += 4;
    }
    const etherType = offset + 2 <= n ? (bytes[offset] << 8) | bytes[offset + 1] : null;
    // A TPID with fewer than 2 bytes after it is a tag cut off mid TCI, not an EtherType.
    const cutTag = etherType !== null && isVlanTpid(etherType) && tags.length < MAX_FRAME_TAGS && offset + 4 > n;
    const frame: FrameInfo = {
      dst: macString(bytes.slice(0, 6)),
      src: macString(bytes.slice(6, 12)),
      // A cut-off tag is reported as a finding, not shown as the payload type.
      etherType: cutTag ? null : etherType,
      etherTypeName: cutTag || etherType === null ? null : describeType(etherType),
    };
    if (tags.length === 0 && cutTag && etherType !== null) {
      return {
        kind: "error",
        message: `Bytes 13 and 14 are ${hex16(etherType)}, a VLAN TPID, but the input ends before the 2 byte TCI that follows it. Paste at least 16 bytes to decode the tag.`,
      };
    }
    if (tags.length === 0) {
      return {
        kind: "error",
        message: `Read as a frame starting at the destination MAC, bytes 13 and 14 are ${hex16(etherType ?? 0)}, ${describeType(etherType ?? 0)}. There is no VLAN tag in this frame.`,
      };
    }
    const stack = stackFindings(tags);
    if (tags.length === MAX_FRAME_TAGS && etherType !== null && isVlanTpid(etherType)) {
      stack.push({ tone: "warn", text: `Stopped after ${MAX_FRAME_TAGS} tags; there are more.` });
    }
    if (cutTag && etherType !== null) {
      stack.push({
        tone: "warn",
        text: `Another tag starts at byte ${offset + 1} (TPID ${hex16(etherType)}), but the input ends before its TCI, so it is not decoded.`,
      });
    } else if (etherType === null) {
      stack.push({ tone: "info", text: "The input ends before the EtherType that follows the last tag." });
    }
    return { kind: "ok", mode: "frame", byteCount: n, tags, frame, stack };
  }

  return {
    kind: "error",
    message: `That is ${n} ${n === 1 ? "byte" : "bytes"}. Paste 4 bytes for one tag, 8 for a stacked S-tag and C-tag, 2 for a bare TCI, or a frame from the destination MAC onward (14 bytes or more).`,
  };
}

/* ---------------------------------------------------------------- build */

export interface TagSpec {
  tpid: number;
  pcp: number;
  dei: boolean;
  vid: number;
}

export function buildTci(pcp: number, dei: boolean, vid: number): number {
  return ((pcp & 0x7) << 13) | ((dei ? 1 : 0) << 12) | (vid & 0xfff);
}

export function buildTag(spec: TagSpec): number[] {
  const tci = buildTci(spec.pcp, spec.dei, spec.vid);
  return [(spec.tpid >> 8) & 0xff, spec.tpid & 0xff, (tci >> 8) & 0xff, tci & 0xff];
}

export type VidParse = { ok: true; vid: number } | { ok: false; error: string };

export function parseVid(raw: string): VidParse {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Enter a VLAN ID from 0 to 4095." };
  if (!/^\d+$/.test(text)) return { ok: false, error: "A VLAN ID is a whole number in decimal, 0 to 4095." };
  const vid = text.length > 5 ? Number.POSITIVE_INFINITY : Number(text);
  if (vid > VID_MAX) return { ok: false, error: "A VLAN ID is 12 bits, so the largest is 4095." };
  return { ok: true, vid };
}

/** 16 bits as text, grouped the way the TCI divides: PCP DEI VID. */
export function tciBits(tci: number): { pcp: string; dei: string; vid: string } {
  const bits = (tci & 0xffff).toString(2).padStart(16, "0");
  return { pcp: bits.slice(0, 3), dei: bits.slice(3, 4), vid: bits.slice(4) };
}

export function tpidBits(tpid: number): string {
  return (tpid & 0xffff).toString(2).padStart(16, "0");
}

/**
 * Why ip-link cannot produce the built stack, or null when it can. ip-link
 * sets only 0x8100 and 0x88a8, and the kernel's VLAN driver refuses VID
 * 4095 (vlan_validate rejects any id >= VLAN_VID_MASK, 0xfff).
 */
export function linuxCommandBlocker(outer: TagSpec, inner: TagSpec | null): string | null {
  const tags = inner ? [outer, inner] : [outer];
  if (tags.some((t) => t.tpid !== TPID_CTAG && t.tpid !== TPID_STAG)) {
    return "ip link sets only 802.1Q (0x8100) and 802.1ad (0x88a8) tags, so there is no command for a 0x9100 tag.";
  }
  if (tags.some((t) => t.vid === VID_RESERVED)) {
    return "The Linux VLAN driver rejects VID 4095, so there is no ip link command for it.";
  }
  return null;
}

/**
 * Linux ip-link commands for the built stack, or null when linuxCommandBlocker
 * gives a reason. Each device maps skb priority 0 to its tag's PCP, and both
 * maps apply on a stacked pair because the inner device leaves skb->priority
 * unchanged for the outer one.
 */
export function linuxCommands(parent: string, outer: TagSpec, inner: TagSpec | null): string | null {
  if (linuxCommandBlocker(outer, inner) !== null) return null;
  const proto = (tpid: number) => (tpid === TPID_STAG ? " protocol 802.1ad" : "");
  const qos = (pcp: number) => (pcp > 0 ? ` egress-qos-map 0:${pcp}` : "");
  const p1 = proto(outer.tpid);
  // Interface names are capped at 15 characters (IFNAMSIZ 16 with the NUL),
  // so a long parent falls back to vlanN, which always fits.
  const first = fitName(`${parent}.${outer.vid}`, `vlan${outer.vid}`);
  const lines = [`ip link add link ${parent} name ${first} type vlan${p1} id ${outer.vid}${qos(outer.pcp)}`];
  if (inner) {
    const p2 = proto(inner.tpid);
    const second = fitName(`${first}.${inner.vid}`, `vlan${outer.vid}.${inner.vid}`);
    lines.push(`ip link add link ${first} name ${second} type vlan${p2} id ${inner.vid}${qos(inner.pcp)}`);
  }
  return lines.join("\n");
}

function fitName(preferred: string, fallback: string): string {
  return preferred.length <= LINUX_IFNAME_MAX ? preferred : fallback;
}

export const LINUX_IFNAME_MAX = 15;

/** Linux refuses '/', ':' and whitespace in interface names, and caps them at 15 characters. */
export function validLinuxIface(name: string): boolean {
  return /^[A-Za-z0-9_.-]{1,15}$/.test(name) && name !== "." && name !== "..";
}

/** tcpdump/libpcap filter. The vlan keyword matches 0x8100, 0x88a8 and 0x9100, and each use steps one tag in. */
export function tcpdumpFilter(outer: TagSpec, inner: TagSpec | null): string {
  return inner ? `vlan ${outer.vid} and vlan ${inner.vid}` : `vlan ${outer.vid}`;
}
