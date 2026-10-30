/**
 * Cisco wildcard masks, as pure functions.
 *
 * A wildcard mask is 32 bits where 0 means "this bit must equal the
 * reference address" and 1 means "ignore this bit". That is the rule Cisco
 * IOS applies in access lists and in the OSPF and EIGRP network commands.
 * For a block written in CIDR notation (RFC 4632) the wildcard is the
 * bitwise inverse of the subnet mask, but an access list accepts any 32-bit
 * value, including patterns whose 1 bits are not one contiguous run.
 *
 * Every value is an unsigned 32-bit integer held in a JavaScript number.
 * The bitwise operators return a signed int32, so every intermediate whose
 * top bit can be set goes through `>>> 0` before it is compared or printed.
 * Counts use ordinary arithmetic, never shifts, because 2 ** 32 does not fit
 * in an int32 and `1 << 32` is 1.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ALL_ONES = 0xffffffff;
const MAX_FIELD_LENGTH = 64;

/* ----------------------------------------------------------- formatting */

export function ipToString(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

/** 32 binary digits, most significant first. */
export function toBinary(value: number): string {
  return (value >>> 0).toString(2).padStart(32, "0");
}

/** Binary grouped by octet, for display. */
export function toDottedBinary(value: number): string {
  const bits = toBinary(value);
  return [bits.slice(0, 8), bits.slice(8, 16), bits.slice(16, 24), bits.slice(24)].join(".");
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/* ------------------------------------------------------------- bit math */

export function invert(value: number): number {
  return ~value >>> 0;
}

/** Number of 1 bits. */
export function popcount(value: number): number {
  let v = value >>> 0;
  let count = 0;
  while (v !== 0) {
    v = (v & (v - 1)) >>> 0;
    count += 1;
  }
  return count;
}

/** `0xffffffff << 32` is `0xffffffff << 0` in JS (the count is taken mod 32), so /0 is special. */
export function prefixToMask(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return ALL_ONES;
  return (ALL_ONES << (32 - prefix)) >>> 0;
}

/** The prefix length of a contiguous subnet mask (ones then zeros), or null. */
export function maskToPrefix(mask: number): number | null {
  const bits = toBinary(mask);
  if (!/^1*0*$/.test(bits)) return null;
  const firstZero = bits.indexOf("0");
  return firstZero === -1 ? 32 : firstZero;
}

/** The prefix length a contiguous wildcard (zeros then ones) stands for, or null. */
export function wildcardToPrefix(wildcard: number): number | null {
  return maskToPrefix(invert(wildcard));
}

/** How many consecutive 1 bits sit at the low end of the value. */
export function trailingOnes(value: number): number {
  const v = value >>> 0;
  let n = 0;
  while (n < 32 && ((v >>> n) & 1) === 1) n += 1;
  return n;
}

/* -------------------------------------------------------------- parsing */

// Leading zeros are rejected: inet_aton reads "010" as octal 8, so an octet
// written that way means different things to different tools.
const OCTET = /^(0|[1-9][0-9]{0,2})$/;

/** Strict dotted-quad parser. `what` names the field in error messages. */
export function parseIpv4(raw: string, what = "address"): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: `Enter an ${what}.` };
  if (text.length > MAX_FIELD_LENGTH) {
    return { ok: false, error: `That is too long to be an IPv4 ${what}.` };
  }
  const parts = text.split(".");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `An IPv4 ${what} is four numbers separated by dots, for example 192.0.2.0. This has ${parts.length} ${
        parts.length === 1 ? "part" : "parts"
      }.`,
    };
  }
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i];
    if (part === "") {
      return { ok: false, error: `Octet ${i + 1} is empty.` };
    }
    if (!/^[0-9]+$/.test(part)) {
      return { ok: false, error: `Octet ${i + 1} ("${part.slice(0, 12)}") is not a whole number.` };
    }
    if (!OCTET.test(part)) {
      if (part.length > 1 && part.startsWith("0")) {
        return {
          ok: false,
          error: `Octet ${i + 1} ("${part}") has a leading zero. Some parsers read that as octal, so write it without the zero.`,
        };
      }
      return { ok: false, error: `Octet ${i + 1} ("${part.slice(0, 12)}") is out of range. Each octet is 0 to 255.` };
    }
    const n = Number(part);
    if (n > 255) {
      return { ok: false, error: `Octet ${i + 1} (${n}) is out of range. Each octet is 0 to 255.` };
    }
    value = ((value << 8) | n) >>> 0;
  }
  return { ok: true, value: value >>> 0 };
}

export interface MaskValue {
  mask: number;
  prefix: number;
}

/** Accepts "/24", "24" or a dotted subnet mask such as "255.255.255.0". */
export function parseMaskOrPrefix(raw: string): Parsed<MaskValue> {
  const text = raw.trim();
  if (text === "") {
    return { ok: false, error: "Enter a prefix length such as /24 or a subnet mask such as 255.255.255.0." };
  }
  const prefixText = text.startsWith("/") ? text.slice(1).trim() : text;
  if (/^[0-9]+$/.test(prefixText)) {
    if (prefixText.length > 2 || Number(prefixText) > 32) {
      return { ok: false, error: "A prefix length is a whole number from 0 to 32." };
    }
    const prefix = Number(prefixText);
    return { ok: true, value: { mask: prefixToMask(prefix), prefix } };
  }
  if (text.startsWith("/")) {
    return { ok: false, error: "A prefix length is a whole number from 0 to 32." };
  }
  const parsed = parseIpv4(text, "subnet mask");
  if (!parsed.ok) return parsed;
  const prefix = maskToPrefix(parsed.value);
  if (prefix === null) {
    const asWildcard = wildcardToPrefix(parsed.value);
    if (asWildcard !== null) {
      return {
        ok: false,
        error: `${ipToString(parsed.value)} is zeros then ones, which is a wildcard mask, not a subnet mask. Enter it in the wildcard field, or use ${ipToString(
          invert(parsed.value),
        )} here.`,
      };
    }
    return {
      ok: false,
      error: `${ipToString(parsed.value)} is not a subnet mask. A subnet mask is a run of 1 bits followed by a run of 0 bits. A non-contiguous pattern belongs in the wildcard field.`,
    };
  }
  return { ok: true, value: { mask: parsed.value, prefix } };
}

/** Any dotted quad is a legal wildcard, contiguous or not. */
export function parseWildcard(raw: string): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Enter a wildcard mask such as 0.0.0.255." };
  if (/^\/?[0-9]{1,2}$/.test(text)) {
    return {
      ok: false,
      error: "A wildcard is written as four octets, for example 0.0.0.255. Put a prefix length in the subnet mask field instead.",
    };
  }
  return parseIpv4(text, "wildcard mask");
}

/**
 * A wildcard that is also a valid subnet mask of /1 to /31 is almost always
 * a subnet mask typed in the wrong place. It is still legal, so this is a
 * caution rather than an error.
 */
export function looksLikeSubnetMask(wildcard: number): boolean {
  const prefix = maskToPrefix(wildcard);
  return prefix !== null && prefix > 0 && prefix < 32;
}

/* ------------------------------------------------------------- matching */

/** The reference address with every ignored bit cleared. */
export function normalize(reference: number, wildcard: number): number {
  return (reference & ~wildcard) >>> 0;
}

/** Lowest and highest addresses the pattern can match. */
export function lowestMatch(reference: number, wildcard: number): number {
  return normalize(reference, wildcard);
}

export function highestMatch(reference: number, wildcard: number): number {
  return (normalize(reference, wildcard) | wildcard) >>> 0;
}

/** True when every bit the wildcard checks is equal in both addresses. */
export function matches(reference: number, wildcard: number, test: number): boolean {
  return (((reference ^ test) & ~wildcard) >>> 0) === 0;
}

/** 2 to the power of the number of ignored bits, from 1 up to 4,294,967,296. */
export function matchCount(wildcard: number): number {
  return 2 ** popcount(wildcard);
}

export type BitStatus = "ignored" | "match" | "mismatch";

export interface BitCompare {
  /** 0 is the leftmost (most significant) bit. */
  index: number;
  /** 1 to 4. */
  octet: number;
  /** Place value inside its octet: 128, 64, ... 1. */
  weight: number;
  reference: 0 | 1;
  wildcard: 0 | 1;
  test: 0 | 1;
  status: BitStatus;
}

export function compareBits(reference: number, wildcard: number, test: number): BitCompare[] {
  const r = toBinary(reference);
  const w = toBinary(wildcard);
  const t = toBinary(test);
  const out: BitCompare[] = [];
  for (let i = 0; i < 32; i += 1) {
    const ref = r[i] === "1" ? 1 : 0;
    const wild = w[i] === "1" ? 1 : 0;
    const tst = t[i] === "1" ? 1 : 0;
    out.push({
      index: i,
      octet: Math.floor(i / 8) + 1,
      weight: 2 ** (7 - (i % 8)),
      reference: ref,
      wildcard: wild,
      test: tst,
      status: wild === 1 ? "ignored" : ref === tst ? "match" : "mismatch",
    });
  }
  return out;
}

export interface MatchBlocks {
  /** Each matching contiguous block, lowest first, up to the limit. */
  blocks: { base: number; prefix: number }[];
  /** How many blocks the whole pattern breaks into. */
  total: number;
  /** Addresses in each block. */
  blockSize: number;
  /** Prefix length of each block. */
  blockPrefix: number;
}

/**
 * Splits the set of matching addresses into its contiguous blocks.
 *
 * The run of 1 bits at the low end of the wildcard is the size of each
 * block. Every other 1 bit doubles the number of blocks. Counting k from 0
 * and depositing its bits into those higher positions, lowest first, walks
 * the blocks in ascending address order, because the deposit preserves the
 * order of k and every other bit is fixed.
 */
export function matchingBlocks(reference: number, wildcard: number, limit: number): MatchBlocks {
  const w = wildcard >>> 0;
  const low = trailingOnes(w);
  const lowMask = low >= 32 ? ALL_ONES : 2 ** low - 1;
  const high = (w & ~lowMask) >>> 0;
  const positions: number[] = [];
  for (let i = 0; i < 32; i += 1) if (((high >>> i) & 1) === 1) positions.push(i);
  const total = 2 ** positions.length;
  const base = normalize(reference, w);
  const prefix = 32 - low;
  const count = Math.min(Math.max(0, Math.floor(limit)), total);
  const blocks: { base: number; prefix: number }[] = [];
  for (let k = 0; k < count; k += 1) {
    let offset = 0;
    for (let j = 0; j < positions.length; j += 1) {
      if (Math.floor(k / 2 ** j) % 2 === 1) offset += 2 ** positions[j];
    }
    blocks.push({ base: (base + offset) >>> 0, prefix });
  }
  return { blocks, total, blockSize: 2 ** low, blockPrefix: prefix };
}

/* ----------------------------------------------------- IOS configuration */

export type AclKind = "standard" | "extended";
export type AclAction = "permit" | "deny";

/**
 * Numbered IPv4 access lists on IOS: 1 to 99 and 1300 to 1999 are standard
 * (source address only), 100 to 199 and 2000 to 2699 are extended.
 */
export function aclKind(n: number): AclKind | null {
  if ((n >= 1 && n <= 99) || (n >= 1300 && n <= 1999)) return "standard";
  if ((n >= 100 && n <= 199) || (n >= 2000 && n <= 2699)) return "extended";
  return null;
}

export function parseAclNumber(raw: string): Parsed<{ number: number; kind: AclKind }> {
  const text = raw.trim();
  if (!/^[0-9]{1,4}$/.test(text)) {
    return {
      ok: false,
      error: "An IPv4 access list number is 1 to 99 or 1300 to 1999 (standard), or 100 to 199 or 2000 to 2699 (extended).",
    };
  }
  const n = Number(text);
  const kind = aclKind(n);
  if (kind === null) {
    return {
      ok: false,
      error: `${n} is not an IPv4 access list number. Standard lists are 1 to 99 and 1300 to 1999; extended lists are 100 to 199 and 2000 to 2699.`,
    };
  }
  return { ok: true, value: { number: n, kind } };
}

export interface AclLines {
  /** The entry with the wildcard written out. */
  explicit: string;
  /** The same entry using the host or any keyword, when one applies. */
  shorthand: string | null;
}

export function aclLines(
  number: number,
  kind: AclKind,
  action: AclAction,
  reference: number,
  wildcard: number,
): AclLines {
  const w = wildcard >>> 0;
  const addr = ipToString(normalize(reference, w));
  const head = kind === "standard" ? `access-list ${number} ${action}` : `access-list ${number} ${action} ip`;
  const tail = kind === "standard" ? "" : " any";
  const explicit = `${head} ${addr} ${ipToString(w)}${tail}`;
  let shorthand: string | null = null;
  if (w === 0) shorthand = `${head} host ${addr}${tail}`;
  else if (w === ALL_ONES) shorthand = `${head} any${tail}`;
  return { explicit, shorthand };
}

/** OSPF process IDs on IOS are 1 to 65535 and only have local meaning. */
export function parseOspfProcess(raw: string): Parsed<number> {
  const text = raw.trim();
  if (!/^[0-9]{1,5}$/.test(text) || Number(text) < 1 || Number(text) > 65535) {
    return { ok: false, error: "The OSPF process ID is a whole number from 1 to 65535." };
  }
  return { ok: true, value: Number(text) };
}

/** An OSPF area ID is 32 bits (RFC 2328), written as a decimal number or a dotted quad. */
export function parseOspfArea(raw: string): Parsed<string> {
  const text = raw.trim();
  if (/^[0-9]+$/.test(text)) {
    if (text.length > 10 || Number(text) > ALL_ONES || (text.length > 1 && text.startsWith("0"))) {
      return {
        ok: false,
        error: "An area ID is a decimal number from 0 to 4294967295, or a dotted quad such as 0.0.0.1.",
      };
    }
    return { ok: true, value: String(Number(text)) };
  }
  const dotted = parseIpv4(text, "area ID");
  if (!dotted.ok) {
    return {
      ok: false,
      error: "An area ID is a decimal number from 0 to 4294967295, or a dotted quad such as 0.0.0.1.",
    };
  }
  return { ok: true, value: ipToString(dotted.value) };
}

export function ospfLines(processId: number, area: string, reference: number, wildcard: number): string {
  const w = wildcard >>> 0;
  return `router ospf ${processId}\n network ${ipToString(normalize(reference, w))} ${ipToString(w)} area ${area}`;
}
