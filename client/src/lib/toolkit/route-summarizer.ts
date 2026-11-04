/**
 * Route summarization, as pure functions.
 *
 * Addresses are plain numbers from 0 to 2^32 - 1. Every address and every
 * block size up to 2^32 is an exact integer in a double, so the arithmetic
 * here is + - * and Math.floor. The 32-bit bitwise operators are avoided for
 * anything but counting leading zeros, because they are signed and turn
 * 128.0.0.0 and above into negative numbers. Prefix notation is CIDR, as
 * defined in RFC 4632.
 */

/** Most prefixes read from one paste. Anything past this is reported, not parsed. */
export const MAX_PREFIXES = 4096;
/** Longest paste accepted at all, in characters. */
export const MAX_INPUT_CHARS = 200_000;
/** Most prefixes listed for the addresses a summary adds. The total is still counted. */
export const MAX_GAP_PREFIXES = 256;
/** Most rows drawn in the binary alignment view. */
export const MAX_ALIGNMENT_ROWS = 64;

const TWO_32 = 4294967296;

export interface Cidr {
  network: number;
  length: number;
}

export interface InputPrefix extends Cidr {
  /** The token as it was typed. */
  source: string;
  /** 1-based line number in the paste. */
  line: number;
  /** True when the address had host bits set and was moved down to its network. */
  hostBitsCleared: boolean;
  /**
   * Set when the entry was written router-config style, as an address and
   * then a separate mask token ("10.1.0.0 255.255.255.0" or the wildcard
   * form "10.1.0.0 0.0.0.255"), and the two tokens were read as one prefix.
   */
  pairedMask: "netmask" | "wildcard" | null;
}

export interface InputProblem {
  line: number;
  text: string;
  message: string;
}

export interface ParsedList {
  prefixes: InputPrefix[];
  problems: InputProblem[];
  /** True when more than MAX_PREFIXES tokens were present and the rest were skipped. */
  truncated: boolean;
  /** True when the paste exceeded MAX_INPUT_CHARS and was not read at all. */
  tooLong: boolean;
}

export interface Range {
  start: number;
  end: number;
}

/* ------------------------------------------------------------ addresses */

const OCTET = /^(0|[1-9][0-9]{0,2})$/;

/** Strict dotted decimal: four octets, 0 to 255, no leading zeros. */
export function parseIpv4(text: string): number | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

export function formatIpv4(value: number): string {
  const out: number[] = [];
  let rest = value;
  for (let i = 0; i < 4; i += 1) {
    out.unshift(rest % 256);
    rest = Math.floor(rest / 256);
  }
  return out.join(".");
}

/** Number of addresses in a block of the given prefix length. */
export function blockSize(length: number): number {
  return 2 ** (32 - length);
}

/** The netmask as a number: /24 is 0xFFFFFF00, /0 is 0. */
export function maskOf(length: number): number {
  return TWO_32 - blockSize(length);
}

/** The first address of the block of this length that contains addr. */
export function networkOf(addr: number, length: number): number {
  const size = blockSize(length);
  return Math.floor(addr / size) * size;
}

export function lastAddress(cidr: Cidr): number {
  return cidr.network + blockSize(cidr.length) - 1;
}

export function formatCidr(cidr: Cidr): string {
  return `${formatIpv4(cidr.network)}/${cidr.length}`;
}

/** The prefix length a netmask stands for, or -1 when its one bits are not contiguous from the left. */
export function maskLength(mask: number): number {
  for (let l = 0; l <= 32; l += 1) if (maskOf(l) === mask) return l;
  return -1;
}

/**
 * The prefix length a wildcard (inverse) mask stands for, as used in ACLs and
 * OSPF network statements: 0.0.0.255 is /24. Returns -1 when the zero bits
 * are not contiguous from the left.
 */
export function wildcardLength(wildcard: number): number {
  return maskLength(TWO_32 - 1 - wildcard);
}

/** Number of leading bits on which two addresses agree, 0 to 32. */
export function commonPrefixLength(a: number, b: number): number {
  // XOR leaves a 1 at the first differing bit. Math.clz32 reads its operand
  // as an unsigned 32-bit value, so a negative XOR result is still correct.
  return Math.clz32(a ^ b);
}

/** How many low bits of addr are zero, which bounds the largest block starting there. */
export function alignmentBits(addr: number): number {
  if (addr === 0) return 32;
  let bits = 0;
  while (bits < 32 && addr % 2 ** (bits + 1) === 0) bits += 1;
  return bits;
}

/* ----------------------------------------------------------------- input */

/** Parse one token: a.b.c.d, a.b.c.d/len, or a.b.c.d/m.m.m.m. */
export function parsePrefix(
  token: string,
): { ok: true; cidr: Cidr; hostBitsCleared: boolean } | { ok: false; message: string } {
  const slash = token.indexOf("/");
  const addrText = slash === -1 ? token : token.slice(0, slash);
  const lenText = slash === -1 ? null : token.slice(slash + 1);

  const addr = parseIpv4(addrText);
  if (addr === null) {
    const parts = addrText.split(".");
    if (parts.length === 4 && parts.every((p) => /^[0-9]+$/.test(p)) && parts.some((p) => /^0[0-9]/.test(p))) {
      return {
        ok: false,
        message:
          "has an octet with a leading zero. Some parsers read that as octal, so write it without the zero.",
      };
    }
    if (parts.length === 4 && parts.every((p) => /^[0-9]+$/.test(p))) {
      return { ok: false, message: "has an octet above 255." };
    }
    return {
      ok: false,
      message: "is not an IPv4 address. Use four decimal octets from 0 to 255, for example 10.1.0.0/24.",
    };
  }

  let length = 32;
  if (lenText !== null) {
    if (lenText === "") return { ok: false, message: "has a slash but no prefix length after it." };
    if (/^[0-9]{1,2}$/.test(lenText)) {
      length = Number(lenText);
      if (length > 32) {
        return { ok: false, message: `has prefix length /${length}. IPv4 prefixes run from /0 to /32.` };
      }
    } else {
      const mask = parseIpv4(lenText);
      if (mask === null) {
        return {
          ok: false,
          message: "has something after the slash that is neither a prefix length (0 to 32) nor a netmask.",
        };
      }
      const found = maskLength(mask);
      if (found === -1) {
        const wild = wildcardLength(mask);
        if (wild !== -1) {
          return {
            ok: false,
            message: `has ${lenText} after the slash, which is a wildcard (inverse) mask, not a netmask. The netmask for that is ${formatIpv4(maskOf(wild))}, or /${wild}.`,
          };
        }
        return {
          ok: false,
          message:
            "has a netmask whose one bits do not run unbroken from the left, so it does not describe a prefix.",
        };
      }
      length = found;
    }
  }

  const network = networkOf(addr, length);
  return { ok: true, cidr: { network, length }, hostBitsCleared: network !== addr };
}

/** Longest token echoed back in an error message. */
const MAX_ECHO_CHARS = 60;

function echo(token: string): string {
  return token.length > MAX_ECHO_CHARS ? `${token.slice(0, MAX_ECHO_CHARS)}...` : token;
}

/**
 * When a bare address is followed on the same line by a bare token that can
 * only be a mask, the two are one entry, the way router configurations write
 * them ("ip route 10.1.0.0 255.255.255.0 ..." or "network 10.1.0.0 0.0.0.255
 * area 0"). Only unambiguous tokens count: a netmask starts with 255 (/8 or
 * longer; 255.0.0.0/8 is reserved space, never a route), and a wildcard mask
 * starts with 0 and is not 0.0.0.0 (0.0.0.0/8 is "this network", never a
 * route). Anything else stays an address of its own.
 */
function maskKind(addrToken: string, maskToken: string | undefined): "netmask" | "wildcard" | null {
  if (maskToken === undefined || addrToken.includes("/") || maskToken.includes("/")) return null;
  if (parseIpv4(addrToken) === null) return null;
  const value = parseIpv4(maskToken);
  if (value === null) return null;
  if (value >= 0xff000000) return "netmask";
  if (value !== 0 && value < 0x01000000 && wildcardLength(value) !== -1) return "wildcard";
  return null;
}

/**
 * Read a pasted list. Tokens are separated by whitespace, commas or
 * semicolons, and anything after a # on a line is a comment.
 */
export function parsePrefixList(input: string): ParsedList {
  const result: ParsedList = { prefixes: [], problems: [], truncated: false, tooLong: false };
  if (input.length > MAX_INPUT_CHARS) {
    result.tooLong = true;
    return result;
  }
  const lines = input.split(/\r\n|\r|\n/);
  let seen = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const hash = lines[i].indexOf("#");
    const body = hash === -1 ? lines[i] : lines[i].slice(0, hash);
    const tokens = body.split(/[\s,;]+/).filter((t) => t !== "");
    for (let k = 0; k < tokens.length; k += 1) {
      seen += 1;
      if (seen > MAX_PREFIXES) {
        result.truncated = true;
        return result;
      }
      const token = tokens[k];
      const pair = maskKind(token, tokens[k + 1]);
      let text = token;
      let parsed: ReturnType<typeof parsePrefix>;
      if (pair === null) {
        parsed = parsePrefix(token);
      } else {
        const maskToken = tokens[k + 1];
        k += 1;
        text = `${token} ${maskToken}`;
        if (pair === "netmask") {
          parsed = parsePrefix(`${token}/${maskToken}`);
        } else {
          const len = wildcardLength(parseIpv4(maskToken) as number);
          parsed = parsePrefix(`${token}/${len}`);
        }
      }
      if (parsed.ok) {
        result.prefixes.push({
          ...parsed.cidr,
          source: text,
          line: i + 1,
          hostBitsCleared: parsed.hostBitsCleared,
          pairedMask: pair,
        });
      } else {
        result.problems.push({ line: i + 1, text: echo(text), message: parsed.message });
      }
    }
  }
  return result;
}

/* ------------------------------------------------------------ aggregation */

/** Sort ranges and merge any that overlap or touch. */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

export function toRanges(prefixes: Cidr[]): Range[] {
  return mergeRanges(prefixes.map((p) => ({ start: p.network, end: lastAddress(p) })));
}

/**
 * The fewest CIDR blocks that cover exactly start..end. At each step take
 * the largest block that is aligned at the current address and does not
 * run past the end. Greedy is optimal here because a block can never start
 * before an address it does not align with.
 */
export function rangeToCidrs(start: number, end: number, limit = Infinity): Cidr[] {
  const out: Cidr[] = [];
  let cur = start;
  while (cur <= end && out.length < limit) {
    let bits = alignmentBits(cur);
    while (2 ** bits > end - cur + 1) bits -= 1;
    out.push({ network: cur, length: 32 - bits });
    cur += 2 ** bits;
  }
  return out;
}

/** How many CIDR blocks rangeToCidrs would return, without building them. */
export function countRangeCidrs(start: number, end: number): number {
  let count = 0;
  let cur = start;
  while (cur <= end) {
    let bits = alignmentBits(cur);
    while (2 ** bits > end - cur + 1) bits -= 1;
    count += 1;
    cur += 2 ** bits;
  }
  return count;
}

/** The smallest set of prefixes covering exactly the same addresses as the input. */
export function aggregate(prefixes: Cidr[]): Cidr[] {
  const out: Cidr[] = [];
  for (const r of toRanges(prefixes)) out.push(...rangeToCidrs(r.start, r.end));
  return out;
}

export function addressCount(ranges: Range[]): number {
  let total = 0;
  for (const r of ranges) total += r.end - r.start + 1;
  return total;
}

/**
 * Input prefixes that are already covered by another entry (duplicates and
 * blocks nested inside a larger one). CIDR blocks either nest or are
 * disjoint, so after sorting by start and then by size, largest first, an
 * entry is redundant exactly when it ends at or before the furthest end seen
 * so far.
 */
export function redundantPrefixes<T extends Cidr>(prefixes: T[]): T[] {
  const sorted = [...prefixes].sort((a, b) => a.network - b.network || a.length - b.length);
  const out: T[] = [];
  let furthest = -1;
  for (const p of sorted) {
    const end = lastAddress(p);
    if (end <= furthest) out.push(p);
    else furthest = end;
  }
  return out;
}

/* --------------------------------------------------------------- summary */

export interface Summary extends Cidr {
  /** Addresses inside the summary. */
  size: number;
  /** Distinct addresses the input actually covers. */
  covered: number;
  /** Addresses the summary claims that the input did not list. */
  extra: number;
  /** The extra addresses, as ranges. */
  gapRanges: Range[];
  /** The extra addresses as CIDR blocks, at most MAX_GAP_PREFIXES of them. */
  gapCidrs: Cidr[];
  /** How many CIDR blocks the extra addresses take in total. */
  gapCidrTotal: number;
}

/**
 * The single most specific prefix that covers every input address. A prefix
 * covers a set exactly when it covers both its lowest and highest address,
 * so its length is the number of leading bits those two share.
 */
export function summarize(prefixes: Cidr[]): Summary | null {
  const ranges = toRanges(prefixes);
  if (ranges.length === 0) return null;
  const low = ranges[0].start;
  const high = ranges[ranges.length - 1].end;
  const length = commonPrefixLength(low, high);
  const network = networkOf(low, length);
  const size = blockSize(length);
  const covered = addressCount(ranges);

  const gapRanges: Range[] = [];
  let cursor = network;
  for (const r of ranges) {
    if (r.start > cursor) gapRanges.push({ start: cursor, end: r.start - 1 });
    cursor = r.end + 1;
  }
  const summaryEnd = network + size - 1;
  if (cursor <= summaryEnd) gapRanges.push({ start: cursor, end: summaryEnd });

  const gapCidrs: Cidr[] = [];
  let gapCidrTotal = 0;
  for (const g of gapRanges) {
    gapCidrTotal += countRangeCidrs(g.start, g.end);
    if (gapCidrs.length < MAX_GAP_PREFIXES) {
      gapCidrs.push(...rangeToCidrs(g.start, g.end, MAX_GAP_PREFIXES - gapCidrs.length));
    }
  }

  return { network, length, size, covered, extra: size - covered, gapRanges, gapCidrs, gapCidrTotal };
}

/* ---------------------------------------------------------------- binary */

/** 32 bits in four dotted groups of eight. */
export function binaryOctets(value: number): string {
  const bits = value.toString(2).padStart(32, "0");
  return `${bits.slice(0, 8)}.${bits.slice(8, 16)}.${bits.slice(16, 24)}.${bits.slice(24, 32)}`;
}

export type BitKind = "common" | "network" | "host";

export interface BitSegment {
  text: string;
  kind: BitKind;
}

/**
 * Split an address's dotted binary into runs: the bits every input shares
 * (common), the rest of this prefix's own network bits (network), and its
 * host bits (host). Dots stay attached to the run they fall inside.
 */
export function alignmentSegments(value: number, common: number, own: number): BitSegment[] {
  const bits = value.toString(2).padStart(32, "0");
  const segments: BitSegment[] = [];
  for (let i = 0; i < 32; i += 1) {
    const kind: BitKind = i < common ? "common" : i < own ? "network" : "host";
    const ch = (i > 0 && i % 8 === 0 ? "." : "") + bits[i];
    const last = segments[segments.length - 1];
    if (last && last.kind === kind) last.text += ch;
    else if (last && ch.startsWith(".")) {
      last.text += ".";
      segments.push({ text: bits[i], kind });
    } else segments.push({ text: ch, kind });
  }
  return segments;
}
