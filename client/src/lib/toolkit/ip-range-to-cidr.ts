/**
 * IPv4 ranges and CIDR blocks, as pure functions.
 *
 * A CIDR block (RFC 4632, section 3.1) is 2^n addresses whose first address
 * is a multiple of 2^n. Turning an arbitrary inclusive range into blocks is
 * the greedy walk below; turning a list of blocks back into ranges is a sort
 * and a single merge pass.
 *
 * Addresses are unsigned 32-bit integers held in ordinary numbers. Bitwise
 * operators return a signed int32, so anything that can have the top bit set
 * goes through `>>> 0`. Sizes, sums and "end + 1" use plain arithmetic, never
 * shifts: 2 ** 32 is exact in a double, while `1 << 32` is 1 and
 * `0xffffffff + 1 | 0` is 0.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Longest list the merge accepts, in characters. */
export const MAX_LIST_CHARS = 1_000_000;
/** Most entries the merge reads; later entries are skipped and reported. */
export const MAX_ENTRIES = 50_000;
/** Most problems listed back to the reader. */
export const MAX_REPORTED = 20;

const MAX_FIELD_LENGTH = 64;

/* ----------------------------------------------------------- formatting */

export function ipToString(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/* -------------------------------------------------------------- parsing */

// Leading zeros are rejected: inet_aton reads "010" as octal 8, so an octet
// written that way means different things to different tools.
const OCTET = /^(0|[1-9][0-9]{0,2})$/;

export function parseIpv4(raw: string, what = "address"): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: `Enter the ${what}.` };
  if (text.length > MAX_FIELD_LENGTH) return { ok: false, error: `That is too long to be an IPv4 address.` };
  const parts = text.split(".");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `"${text.slice(0, 40)}" is not an IPv4 address: it needs four numbers separated by dots, for example 192.0.2.10.`,
    };
  }
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i];
    if (!/^[0-9]+$/.test(part)) {
      return {
        ok: false,
        error: part === "" ? `Octet ${i + 1} of "${text.slice(0, 40)}" is empty.` : `Octet ${i + 1} ("${part.slice(0, 12)}") is not a whole number.`,
      };
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
    if (n > 255) return { ok: false, error: `Octet ${i + 1} (${n}) is out of range. Each octet is 0 to 255.` };
    value = ((value << 8) | n) >>> 0;
  }
  return { ok: true, value: value >>> 0 };
}

/* ------------------------------------------------------- range to blocks */

export interface CidrBlock {
  network: number;
  prefix: number;
  /** Number of addresses, 1 to 2^32. */
  size: number;
  first: number;
  last: number;
}

export function blockToString(block: { network: number; prefix: number }): string {
  return `${ipToString(block.network)}/${block.prefix}`;
}

/**
 * Count of trailing zero bits, 32 for zero. `x & -x` isolates the lowest set
 * bit (for 0x80000000 both sides are -2^31 as int32, which still works), and
 * Math.clz32 reads its argument as unsigned.
 */
export function trailingZeros(value: number): number {
  const v = value >>> 0;
  if (v === 0) return 32;
  return 31 - Math.clz32(v & -v);
}

/**
 * Minimal CIDR cover of the inclusive range [start, end].
 *
 * At each step the largest block that may begin at `start` is bounded by
 * alignment: a /p block must start on a multiple of 2^(32 - p), so the
 * trailing zero bits of `start` cap its size. Halve it until it no longer
 * runs past `end`, emit it, and continue from the address after it. Taking
 * the largest legal block every time yields the fewest blocks, and no IPv4
 * range needs more than 62 (at most 31 on each side of the largest aligned
 * boundary inside it).
 */
export function rangeToCidrs(start: number, end: number): CidrBlock[] {
  let cur = start >>> 0;
  const stop = end >>> 0;
  const out: CidrBlock[] = [];
  if (cur > stop) return out;
  // `cur` is a plain number and may reach 2^32 after the last block, which
  // is exactly what ends the loop; it is never pushed through `>>> 0` there.
  while (cur <= stop && out.length < 64) {
    let bits = trailingZeros(cur);
    while (bits > 0 && cur + 2 ** bits - 1 > stop) bits -= 1;
    const size = 2 ** bits;
    out.push({ network: cur, prefix: 32 - bits, size, first: cur, last: cur + size - 1 });
    cur += size;
  }
  return out;
}

/* ------------------------------------------------------- blocks to ranges */

export interface Range {
  start: number;
  end: number;
}

export function rangeSize(range: Range): number {
  return range.end - range.start + 1;
}

/**
 * Sorts by start and merges anything that overlaps or touches. Two ranges
 * touch when the next one starts at the address right after the current one
 * ends. The comparison uses `end + 1` in plain arithmetic, so a range ending
 * at 255.255.255.255 compares against 2^32 rather than wrapping to 0.
 */
export function mergeRanges(ranges: Range[]): Range[] {
  const sorted = ranges
    .map((r) => ({ start: r.start >>> 0, end: r.end >>> 0 }))
    .filter((r) => r.start <= r.end)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

export interface ListEntry {
  /** 1-based line number in the pasted text. */
  line: number;
  /** The token as written. */
  text: string;
  range: Range;
}

export interface ListProblem {
  line: number;
  text: string;
  message: string;
}

export interface ParsedList {
  entries: ListEntry[];
  errors: ListProblem[];
  /** Accepted, but read differently from how it was written. */
  warnings: ListProblem[];
  /** Total problems, including those beyond MAX_REPORTED. */
  errorCount: number;
  warningCount: number;
  /** True when the entry cap was reached and the rest was not read. */
  truncated: boolean;
}

function clip(text: string): string {
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

/** Parses one CIDR block or bare address. Bare addresses are /32. */
export function parseCidr(token: string): Parsed<{ range: Range; hostBitsSet: boolean; network: number; prefix: number }> {
  const slash = token.indexOf("/");
  const addrText = slash === -1 ? token : token.slice(0, slash);
  const prefixText = slash === -1 ? "32" : token.slice(slash + 1);
  const addr = parseIpv4(addrText);
  if (!addr.ok) return addr;
  if (!/^[0-9]{1,2}$/.test(prefixText) || Number(prefixText) > 32) {
    return { ok: false, error: `"/${clip(prefixText)}" is not a prefix length. It must be a whole number from 0 to 32.` };
  }
  const prefix = Number(prefixText);
  const size = 2 ** (32 - prefix);
  // Integer division keeps this exact without any shift: network is addr
  // rounded down to a multiple of the block size.
  const network = Math.floor(addr.value / size) * size;
  return {
    ok: true,
    value: {
      range: { start: network, end: network + size - 1 },
      hostBitsSet: network !== addr.value,
      network,
      prefix,
    },
  };
}

/**
 * Reads a pasted list. Each line holds CIDR blocks or bare addresses
 * separated by spaces or commas, or one range written "start - end".
 * Text after # is a comment. Blocks with host bits set are read as their
 * network and reported, the way Python's ipaddress does with strict=False.
 */
export function parseCidrList(text: string): ParsedList {
  const result: ParsedList = {
    entries: [],
    errors: [],
    warnings: [],
    errorCount: 0,
    warningCount: 0,
    truncated: false,
  };
  const addError = (line: number, token: string, message: string) => {
    result.errorCount += 1;
    if (result.errors.length < MAX_REPORTED) result.errors.push({ line, text: clip(token), message });
  };
  const addWarning = (line: number, token: string, message: string) => {
    result.warningCount += 1;
    if (result.warnings.length < MAX_REPORTED) result.warnings.push({ line, text: clip(token), message });
  };

  if (text.length > MAX_LIST_CHARS) {
    addError(0, "", `The list is ${formatCount(text.length)} characters long. The limit is ${formatCount(MAX_LIST_CHARS)}, so split it and merge the parts.`);
    return result;
  }

  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const body = lines[i].replace(/#.*$/, "").trim();
    if (body === "") continue;
    if (result.entries.length >= MAX_ENTRIES) {
      result.truncated = true;
      break;
    }

    const rangeMatch = /^([0-9.]+)\s*-\s*([0-9.]+)$/.exec(body);
    if (rangeMatch) {
      const a = parseIpv4(rangeMatch[1]);
      const b = parseIpv4(rangeMatch[2]);
      if (!a.ok) addError(lineNo, body, a.error);
      else if (!b.ok) addError(lineNo, body, b.error);
      else if (a.value > b.value) addError(lineNo, body, "The range starts after it ends. Write the lower address first.");
      else result.entries.push({ line: lineNo, text: clip(body), range: { start: a.value, end: b.value } });
      continue;
    }

    for (const token of body.split(/[\s,;]+/)) {
      if (token === "") continue;
      if (result.entries.length >= MAX_ENTRIES) {
        result.truncated = true;
        break;
      }
      const parsed = parseCidr(token);
      if (!parsed.ok) {
        addError(lineNo, token, parsed.error);
        continue;
      }
      if (parsed.value.hostBitsSet) {
        addWarning(
          lineNo,
          token,
          `Host bits are set, so this was read as ${blockToString(parsed.value)}.`,
        );
      }
      result.entries.push({ line: lineNo, text: clip(token), range: parsed.value.range });
    }
    if (result.truncated) break;
  }
  return result;
}

export interface MergeSummary {
  merged: Range[];
  /** Sum of the input sizes, counting overlaps more than once. */
  inputAddresses: number;
  /** Distinct addresses covered. */
  uniqueAddresses: number;
  /** The minimal CIDR cover of the merged set, all ranges together. */
  aggregated: CidrBlock[];
}

export function summarizeMerge(entries: { range: Range }[]): MergeSummary {
  const merged = mergeRanges(entries.map((e) => e.range));
  let inputAddresses = 0;
  for (const e of entries) inputAddresses += rangeSize(e.range);
  let uniqueAddresses = 0;
  const aggregated: CidrBlock[] = [];
  for (const r of merged) {
    uniqueAddresses += rangeSize(r);
    for (const b of rangeToCidrs(r.start, r.end)) aggregated.push(b);
  }
  return { merged, inputAddresses, uniqueAddresses, aggregated };
}
