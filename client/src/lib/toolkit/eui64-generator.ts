/**
 * Modified EUI-64 interface identifiers.
 *
 * Pure functions, no React or DOM. The procedure is RFC 4291 Appendix A,
 * with the worked example from RFC 2464 section 4 as the reference value:
 *
 *   1. split the 48-bit MAC into the 24-bit company ID and the 24-bit
 *      extension identifier,
 *   2. insert the two octets 0xFF 0xFE between them,
 *   3. invert the universal/local bit, which is the 7th bit from the most
 *      significant end of the first octet (mask 0x02).
 *
 * An IEEE EUI-64 that is already 64 bits only needs step 3.
 */

import { ALL_ONES, clip, compress, describeChar, interfaceIdString, maskOf, parsePrefixed } from "./ipv6-calculator";

/** Mask of the universal/local bit in the first octet. */
export const UL_BIT = 0x02;
/** Mask of the individual/group (multicast) bit in the first octet. */
export const IG_BIT = 0x01;

const LOW64 = (1n << 64n) - 1n;
const LINK_LOCAL_PREFIX = 0xfe80n << 112n;
const MAX_INPUT_LENGTH = 100;

/* ------------------------------------------------------------- MAC input */

export type MacParse =
  | { kind: "empty" }
  | { kind: "hint"; message: string }
  | { kind: "error"; message: string }
  | { kind: "ok"; bytes: number[] };

function hexBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

/**
 * Accepts 48-bit MACs as 00:1a:2b:3c:4d:5e, 00-1A-2B-3C-4D-5E,
 * 001a.2b3c.4d5e (Cisco), 001a2b3c4d5e, or with single-digit octets as
 * macOS prints them (0:1a:2b:3c:4d:5e). A 64-bit EUI-64 in the same styles
 * is accepted too. Returns 6 or 8 bytes.
 */
export function parseMac(raw: string): MacParse {
  const original = raw.trim();
  const text = original.toLowerCase();
  if (text === "") return { kind: "empty" };
  if (text.length > MAX_INPUT_LENGTH) {
    return {
      kind: "error",
      message: `That is ${text.length} characters. A MAC address with separators is 17 and an EUI-64 is 23, so the limit here is ${MAX_INPUT_LENGTH}.`,
    };
  }
  // Searched in the original text so the message quotes the character the
  // reader typed, not its lowercase form.
  const bad = original.match(/[^0-9A-Fa-f:.\- ]/u);
  if (bad) {
    return {
      kind: "error",
      message: `${describeChar(bad[0])} is not a hex digit or a separator. A MAC uses 0 to 9 and a to f, separated by colons, hyphens, dots or nothing.`,
    };
  }

  const seps = new Set(text.replace(/[0-9a-f]/g, "").split(""));
  if (seps.size > 1) {
    return { kind: "error", message: "Mixed separators. Use one style throughout: colons, hyphens, spaces or Cisco dots." };
  }
  const sep = seps.size === 1 ? [...seps][0] : "";

  if (sep === "") {
    if (text.length === 12 || text.length === 16) return { kind: "ok", bytes: hexBytes(text) };
    if (text.length < 12) {
      return { kind: "hint", message: `${text.length} of 12 hex digits so far.` };
    }
    return {
      kind: "error",
      message: `That is ${text.length} hex digits. A MAC address is 12 (48 bits); an EUI-64 is 16.`,
    };
  }

  const parts = text.split(sep);
  if (parts.slice(0, -1).some((p) => p === "")) {
    return { kind: "error", message: "There is an empty octet: two separators in a row, or one at the start." };
  }
  if (sep === ".") {
    // Cisco style: groups of four hex digits, so progress is counted in
    // groups rather than octets.
    const trailing = parts[parts.length - 1] === "";
    const groups = trailing ? parts.slice(0, -1) : parts;
    const longGroup = groups.find((p) => p.length > 4);
    if (longGroup) {
      return { kind: "error", message: `"${clip(longGroup, 12)}" has ${longGroup.length} hex digits. Each dotted group is four.` };
    }
    if (groups.every((p) => p.length === 4) && (groups.length === 3 || groups.length === 4)) {
      if (trailing) {
        return {
          kind: "error",
          message: groups.length === 3 ? "Remove the dot at the end, or add a fourth group for a 64-bit EUI-64." : "Remove the dot at the end.",
        };
      }
      return { kind: "ok", bytes: hexBytes(groups.join("")) };
    }
    // Still typing: every group but the last is complete, and fewer than 3 are done.
    const complete = trailing ? groups : groups.slice(0, -1);
    if (groups.length <= 3 && complete.every((p) => p.length === 4) && !(trailing && groups.length === 3)) {
      const done = groups.filter((p) => p.length === 4).length;
      return { kind: "hint", message: `${done} of 3 dotted groups so far.` };
    }
    return {
      kind: "error",
      message: "The dotted form is three groups of four hex digits, as Cisco prints it: 001a.2b3c.4d5e.",
    };
  }

  if (parts[parts.length - 1] === "") {
    const done = parts.length - 1;
    if (done < 6) return { kind: "hint", message: `${done} of 6 octets so far.` };
    if (done === 6) {
      return { kind: "error", message: "Remove the separator at the end, or add two more octets for a 64-bit EUI-64." };
    }
    return { kind: "error", message: "Remove the separator at the end." };
  }

  // Three groups of four with colons or hyphens is uncommon but unambiguous.
  if (parts.length === 3 && parts.every((p) => p.length === 4)) {
    return { kind: "ok", bytes: hexBytes(parts.join("")) };
  }

  const long = parts.find((p) => p.length > 2);
  if (long) {
    return { kind: "error", message: `"${clip(long, 12)}" has ${long.length} hex digits. Each octet is at most two.` };
  }
  if (parts.length === 6 || parts.length === 8) {
    return { kind: "ok", bytes: parts.map((p) => parseInt(p, 16)) };
  }
  if (parts.length < 6) {
    return { kind: "hint", message: `${parts.length} of 6 octets so far.` };
  }
  return { kind: "error", message: `That is ${parts.length} octets. A MAC address has 6; an EUI-64 has 8.` };
}

/* ------------------------------------------------------------ conversion */

export interface Eui64Result {
  source: "mac48" | "eui64";
  /** The bytes as entered. */
  input: number[];
  /** After FF:FE insertion (same as input for a 64-bit EUI-64). */
  inserted: number[];
  firstBefore: number;
  firstAfter: number;
  /** The final interface identifier, as 8 bytes. */
  iidBytes: number[];
  /** The same, as a 64-bit value. */
  iid: bigint;
  /** The MAC's U/L bit was 0: a globally unique, vendor-assigned address. */
  universal: boolean;
  /** The MAC's I/G bit was 1: a group (multicast) address, not an interface. */
  group: boolean;
}

export function bytesToBig(bytes: number[]): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b & 0xff);
  return v;
}

/** Modified EUI-64 from a 48-bit MAC or a 64-bit IEEE EUI-64 (RFC 4291 Appendix A). */
export function toModifiedEui64(bytes: number[]): Eui64Result {
  const source = bytes.length === 8 ? "eui64" : "mac48";
  const inserted = source === "mac48" ? [bytes[0], bytes[1], bytes[2], 0xff, 0xfe, bytes[3], bytes[4], bytes[5]] : [...bytes];
  const firstBefore = inserted[0];
  const firstAfter = firstBefore ^ UL_BIT;
  const iidBytes = [firstAfter, ...inserted.slice(1)];
  return {
    source,
    input: [...bytes],
    inserted,
    firstBefore,
    firstAfter,
    iidBytes,
    iid: bytesToBig(iidBytes),
    universal: (firstBefore & UL_BIT) === 0,
    group: (firstBefore & IG_BIT) !== 0,
  };
}

/** fe80::/64 plus the interface identifier (RFC 4291 section 2.5.6). */
export function linkLocal(iid: bigint): bigint {
  return LINK_LOCAL_PREFIX | (iid & LOW64);
}

/** A /64 prefix plus the interface identifier, as SLAAC forms it (RFC 4862 section 5.5.3). */
export function slaacAddress(prefix: bigint, iid: bigint): bigint {
  return (prefix & maskOf(64)) | (iid & LOW64);
}

/* ----------------------------------------------------------- SLAAC prefix */

export type PrefixParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; network: bigint; notes: string[] };

export function parseSlaacPrefix(raw: string): PrefixParse {
  if (raw.trim() === "") return { kind: "empty" };
  const parsed = parsePrefixed(raw, 64);
  if (!parsed.ok) return { kind: "error", message: parsed.message };
  if (parsed.prefix !== 64) {
    return {
      kind: "error",
      message: `A /${parsed.prefix} cannot be used. SLAAC appends a 64-bit interface ID, and RFC 4862 section 5.5.3 ignores any prefix whose length plus the ID length is not 128, so the prefix must be a /64.`,
    };
  }
  const v = parsed.value;
  if (v >> 120n === 0xffn) {
    return { kind: "error", message: "That is a multicast prefix (ff00::/8). SLAAC only forms unicast addresses." };
  }
  if (v >> 118n === 0xfe80n >> 6n) {
    return {
      kind: "error",
      message: "That is the link-local prefix. RFC 4862 section 5.5.3 tells hosts to ignore it in a router advertisement; the link-local address is formed separately, shown above.",
    };
  }
  const notes: string[] = [];
  if (!parsed.prefixGiven) notes.push("No prefix length given, so /64 was assumed.");
  if (parsed.zone !== null) notes.push(`The zone %${parsed.zone} was ignored. Zones only apply to link-local and other scoped addresses.`);
  const network = v & maskOf(64);
  if (network !== v) notes.push("The prefix had bits set in its last 64 bits. Those were dropped, since the interface ID replaces them.");
  return { kind: "ok", network, notes };
}

/* ---------------------------------------------------------------- reverse */

export type ReverseParse =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; value: bigint; iid: bigint; bareIid: boolean };

/**
 * Accepts a full IPv6 address (with optional prefix length or zone) or a
 * bare 64-bit interface ID written as four groups, such as 021a:2bff:fe3c:4d5e.
 */
export function parseReverseInput(raw: string): ReverseParse {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  if (/^[0-9a-f]{1,4}(:[0-9a-f]{1,4}){3}$/i.test(text)) {
    const groups = text.split(":").map((g) => BigInt(parseInt(g, 16)));
    const iid = groups.reduce((acc, g) => (acc << 16n) | g, 0n);
    return { kind: "ok", value: iid, iid, bareIid: true };
  }
  const parsed = parsePrefixed(text, 128);
  if (!parsed.ok) {
    // parseIpv6 already words the message; this keeps one source of truth.
    return { kind: "error", message: parsed.message };
  }
  return { kind: "ok", value: parsed.value & ALL_ONES, iid: parsed.value & LOW64, bareIid: false };
}

export interface MacRecovery {
  /** The interface ID has 0xFFFE in octets 4 and 5. */
  eui64: boolean;
  iidBytes: number[];
  /** The recovered 48-bit MAC, when eui64 is true. */
  mac: number[] | null;
  /** The recovered MAC is universally administered (vendor assigned). */
  universal: boolean | null;
}

/** Undo modified EUI-64: drop FF:FE and invert the U/L bit back. */
export function macFromInterfaceId(iid: bigint): MacRecovery {
  const iidBytes: number[] = [];
  for (let i = 7; i >= 0; i--) iidBytes.push(Number((iid >> BigInt(i * 8)) & 0xffn));
  const eui64 = iidBytes[3] === 0xff && iidBytes[4] === 0xfe;
  if (!eui64) return { eui64, iidBytes, mac: null, universal: null };
  const mac = [iidBytes[0] ^ UL_BIT, iidBytes[1], iidBytes[2], iidBytes[5], iidBytes[6], iidBytes[7]];
  return { eui64, iidBytes, mac, universal: (mac[0] & UL_BIT) === 0 };
}

/* ------------------------------------------------------------- formatting */

export function hex2(b: number): string {
  return (b & 0xff).toString(16).padStart(2, "0");
}

export function macString(bytes: number[], sep = ":"): string {
  return bytes.map(hex2).join(sep);
}

export function bin8(b: number): string {
  return (b & 0xff).toString(2).padStart(8, "0");
}

/** The interface ID as four 4-digit groups, 021a:2bff:fe3c:4d5e. */
export function iidString(iid: bigint): string {
  return interfaceIdString(iid);
}

/** Canonical RFC 5952 text for a 128-bit value. */
export function addressString(value: bigint): string {
  return compress(value);
}
