/**
 * CIDR overlap and containment.
 *
 * Reads a pasted list of IPv4 and IPv6 blocks and answers the two questions
 * that come up when address plans meet: which of these blocks overlap, and
 * which of them hold a given address. Two CIDR blocks are either disjoint,
 * identical, or one sits wholly inside the other. They can never overlap
 * partially, so the answer for any pair is one of four words, and a sort by
 * start address then prefix length turns the whole list into a nesting that
 * one pass with a stack can walk.
 *
 * Addresses are BigInt for both families, as in ip-address-classifier, whose
 * strict parsers are reused so this tool refuses the same inputs the rest of
 * the site does (leading zeros, inet_aton shorthand, bare integers). No React
 * or DOM in this file, so it can be tested directly.
 */

import {
  familyBits,
  formatIp,
  networkOf,
  parseIp,
  type Family,
} from "./ip-address-classifier";

/** Longest list accepted, in characters. Past this the input is not read. */
export const MAX_INPUT_CHARS = 200_000;

/** Most blocks read from one list. Anything after is dropped and flagged. */
export const MAX_ENTRIES = 5000;

/** Overlapping pairs the result carries. The count is always exact. */
export const MAX_PAIRS_LISTED = 200;

/** Problems and notes kept with their line numbers. The counts are exact. */
export const MAX_MESSAGES = 20;

export interface Block {
  /** 1-based position in the list, counting only blocks that were read. */
  index: number;
  /** 1-based line of the input the block came from. */
  line: number;
  /** The token as typed, shortened for display. */
  text: string;
  family: Family;
  /** First address, an unsigned integer 32 or 128 bits wide. */
  network: bigint;
  prefix: number;
  /** Last address of the block. */
  last: bigint;
  /** Number of addresses in the block. */
  size: bigint;
  /** The input had bits set after the prefix, so the block starts earlier than the typed address. */
  hostBitsCleared: boolean;
  /** Written as a bare address with no slash. */
  bare: boolean;
}

export interface Message {
  line: number;
  text: string;
  message: string;
}

export interface ParsedBlocks {
  blocks: Block[];
  problems: Message[];
  problemCount: number;
  notes: Message[];
  noteCount: number;
  /** The entry cap was reached and the rest of the list was not read. */
  truncated: boolean;
}

function clip(text: string): string {
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

/** Digits with thousands separators, for any size of integer. */
export function formatCount(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * A count of addresses for display. An exact power of two past 2^40 reads
 * better as an exponent than as thirteen or more digits, and every block size
 * is one. Anything else, such as the union of several blocks, is written out
 * in full so it is never rounded to a power it is not.
 */
export function formatSize(size: bigint): string {
  const bits = size.toString(2).length - 1;
  const power = size > 0n && (size & (size - 1n)) === 0n;
  return power && bits >= 40 ? `2^${bits}` : formatCount(size);
}

export function blockText(block: Pick<Block, "family" | "network" | "prefix">): string {
  return `${formatIp(block.family, block.network)}/${block.prefix}`;
}

export type TokenResult = { ok: true; value: Omit<Block, "index" | "line" | "text"> } | { ok: false; error: string };

/**
 * One CIDR block or bare address. A bare address is a /32 or a /128. Bits
 * after the prefix are cleared and reported, which is what Python's
 * ipaddress does with strict=False and what a router does with a route
 * written that way.
 */
export function parseBlock(token: string): TokenResult {
  const slashes = token.split("/").length - 1;
  if (slashes > 1) return { ok: false, error: "There is more than one slash. A block is an address, a slash and a prefix length." };
  const slash = token.indexOf("/");
  const addrText = slash === -1 ? token : token.slice(0, slash);
  const prefixText = slash === -1 ? null : token.slice(slash + 1);
  if (addrText === "") return { ok: false, error: "There is no address before the slash." };

  const addr = parseIp(addrText);
  if (!addr.ok) return { ok: false, error: addr.error };
  if (addr.value.zoneId !== null) {
    return { ok: false, error: "A zone ID names an interface on one host. It has no place in a block, so remove the part after the %." };
  }
  const { family, value } = addr.value;
  const bits = familyBits(family);

  let prefix = bits;
  if (prefixText !== null) {
    if (/[.:]/.test(prefixText)) {
      return { ok: false, error: `"/${clip(prefixText)}" looks like a netmask. Write the prefix length instead, such as /24.` };
    }
    if (!/^[0-9]{1,3}$/.test(prefixText) || Number(prefixText) > bits) {
      return {
        ok: false,
        error: `"/${clip(prefixText)}" is not a prefix length. For ${family === 4 ? "IPv4" : "IPv6"} it must be a whole number from 0 to ${bits}.`,
      };
    }
    prefix = Number(prefixText);
  }

  const network = networkOf(family, value, prefix);
  const size = 1n << BigInt(bits - prefix);
  return {
    ok: true,
    value: {
      family,
      network,
      prefix,
      last: network + size - 1n,
      size,
      hostBitsCleared: network !== value,
      bare: prefixText === null,
    },
  };
}

/**
 * Reads a pasted list. Blocks are separated by spaces, commas, semicolons or
 * new lines, and text after # is a comment. Anything that cannot be read is
 * reported with its line and skipped, so one typo does not hide the rest.
 */
export function parseBlocks(text: string): ParsedBlocks {
  const result: ParsedBlocks = {
    blocks: [],
    problems: [],
    problemCount: 0,
    notes: [],
    noteCount: 0,
    truncated: false,
  };
  const problem = (line: number, token: string, message: string) => {
    result.problemCount += 1;
    if (result.problems.length < MAX_MESSAGES) result.problems.push({ line, text: clip(token), message });
  };
  const note = (line: number, token: string, message: string) => {
    result.noteCount += 1;
    if (result.notes.length < MAX_MESSAGES) result.notes.push({ line, text: clip(token), message });
  };

  if (text.length > MAX_INPUT_CHARS) {
    problem(
      0,
      "",
      `The list is ${formatCount(BigInt(text.length))} characters long. The limit is ${formatCount(BigInt(MAX_INPUT_CHARS))}, so check it in parts.`,
    );
    return result;
  }

  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const body = lines[i].replace(/#.*$/, "").trim();
    if (body === "") continue;
    for (const token of body.split(/[\s,;]+/)) {
      if (token === "") continue;
      if (result.blocks.length >= MAX_ENTRIES) {
        result.truncated = true;
        return result;
      }
      const parsed = parseBlock(token);
      if (!parsed.ok) {
        problem(lineNo, token, parsed.error);
        continue;
      }
      const block: Block = {
        index: result.blocks.length + 1,
        line: lineNo,
        text: clip(token),
        ...parsed.value,
      };
      if (block.hostBitsCleared) {
        note(lineNo, token, `Bits after the prefix are set, so this was read as ${blockText(block)}.`);
      }
      result.blocks.push(block);
    }
  }
  return result;
}

/* ------------------------------------------------------------- overlap */

export type Relation = "identical" | "inside";

export interface Overlap {
  /** The larger block, or the earlier one when the two are identical. */
  outer: Block;
  /** The smaller block, or the later one when the two are identical. */
  inner: Block;
  relation: Relation;
  /** Addresses the two share, which is always the inner block's whole size. */
  shared: bigint;
}

export interface FamilyStats {
  /** Entries read in this family, counting repeats. */
  blocks: number;
  /** Entries left after identical ones are counted once. */
  distinct: number;
  /** Addresses covered once each, however many blocks cover them. */
  covered: bigint;
}

export interface Analysis {
  v4: FamilyStats;
  v6: FamilyStats;
  /** Every pair of blocks that share addresses. Exact. */
  overlapPairs: number;
  /** Pairs where one block is strictly inside the other. Exact. */
  insidePairs: number;
  /** Pairs written the same after the prefix is applied. Exact. */
  identicalPairs: number;
  /** The first MAX_PAIRS_LISTED pairs in address order, widest outer block first. */
  overlaps: Overlap[];
}

interface Group {
  network: bigint;
  prefix: number;
  last: bigint;
  members: Block[];
}

/**
 * Walks the blocks in address order with a stack of the blocks that are
 * still open. After sorting by family, start address and then prefix length,
 * every block on the stack at the moment a new block arrives either holds
 * that block or is the same block, because CIDR blocks cannot straddle. So
 * the stack depth is the number of blocks the newcomer overlaps among those
 * already seen, and summing it over the list counts every overlapping pair
 * exactly once without comparing every pair.
 *
 * Identical blocks arrive together and share a stack entry. The count of
 * identical pairs is then the number of earlier members of that entry, and
 * the pairs it nests inside are the members of the entries beneath it.
 */
export function analyze(blocks: Block[], listLimit = MAX_PAIRS_LISTED): Analysis {
  const empty = (): FamilyStats => ({ blocks: 0, distinct: 0, covered: 0n });
  const out: Analysis = {
    v4: empty(),
    v6: empty(),
    overlapPairs: 0,
    insidePairs: 0,
    identicalPairs: 0,
    overlaps: [],
  };

  const ordered = [...blocks].sort((a, b) => {
    if (a.family !== b.family) return a.family - b.family;
    if (a.network !== b.network) return a.network < b.network ? -1 : 1;
    if (a.prefix !== b.prefix) return a.prefix - b.prefix;
    return a.index - b.index;
  });

  let stack: Group[] = [];
  /** Blocks currently on the stack, counting every member of every group. */
  let open = 0;
  let family: Family | null = null;

  for (const block of ordered) {
    const stats = block.family === 4 ? out.v4 : out.v6;
    if (family !== block.family) {
      stack = [];
      open = 0;
      family = block.family;
    }
    while (stack.length > 0 && stack[stack.length - 1].last < block.network) {
      open -= stack.pop()!.members.length;
    }

    stats.blocks += 1;
    const top = stack[stack.length - 1];
    const same = top !== undefined && top.network === block.network && top.prefix === block.prefix;
    const identical = same ? top.members.length : 0;
    const containing = open - identical;

    if (!same && open === 0) stats.covered += block.size;
    if (!same) stats.distinct += 1;

    out.identicalPairs += identical;
    out.insidePairs += containing;
    out.overlapPairs += open;

    // Listing is bounded by the limit, not by the depth of the stack.
    if (out.overlaps.length < listLimit && open > 0) {
      for (const group of stack) {
        for (const member of group.members) {
          if (out.overlaps.length >= listLimit) break;
          out.overlaps.push({
            outer: member,
            inner: block,
            relation: member.prefix === block.prefix ? "identical" : "inside",
            shared: block.size,
          });
        }
        if (out.overlaps.length >= listLimit) break;
      }
    }

    if (same) {
      top.members.push(block);
    } else {
      stack.push({ network: block.network, prefix: block.prefix, last: block.last, members: [block] });
    }
    open += 1;
  }
  return out;
}

/* -------------------------------------------------------------- lookup */

/**
 * The blocks that hold an address, most specific first. The first one is the
 * block a longest-prefix-match lookup would pick; with several identical
 * blocks at that length the earliest in the list comes first.
 */
export function blocksHolding(blocks: Block[], family: Family, value: bigint): Block[] {
  return blocks
    .filter((b) => b.family === family && value >= b.network && value <= b.last)
    .sort((a, b) => b.prefix - a.prefix || a.index - b.index);
}
