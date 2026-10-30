/**
 * IPv6 parsing, formatting, prefix arithmetic and classification.
 *
 * Pure functions with no React or DOM, so they can be unit tested. An
 * address is held as a single 128-bit BigInt: a JavaScript number is exact
 * only to 2^53, which is not even half of one interface identifier.
 *
 * Standards followed:
 *   - RFC 4291 section 2.2: the text forms an address may be written in.
 *   - RFC 5952: the one canonical form an address should be printed in.
 *   - RFC 4291 section 2.7 and RFC 7346: multicast flags and scope.
 *   - IANA IPv6 Special-Purpose Address Registry and IPv6 Address Space
 *     registry: what each block is for.
 */

export const BITS = 128;
export const ALL_ONES = (1n << 128n) - 1n;
const LOW64 = (1n << 64n) - 1n;

/** Longest input the parser will look at. A full address with a zone is far shorter. */
export const MAX_INPUT_LENGTH = 200;

/** Subnets listed by subdivide() before it stops and reports the total instead. */
export const SUBDIVIDE_LIST_LIMIT = 16;

/* ---------------------------------------------------------------- parsing */

export type ParseResult =
  | { ok: true; value: bigint; zone: string | null }
  | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

/** Shorten a piece of the reader's input before quoting it back in a message. */
export function clip(text: string, max = 24): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max).join("")}...`;
}

/** A character as it should appear in a message: quoted if visible, as U+XXXX if not. */
export function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (/^[\p{L}\p{N}\p{P}\p{S}]$/u.test(ch)) return `"${ch}"`;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/** A dotted quad in the last 32 bits (RFC 4291 section 2.2, form 3). */
function parseDottedQuad(text: string): { ok: true; value: number } | { ok: false; message: string } {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return fail(`"${clip(text)}" is not a dotted IPv4 address. The embedded form needs exactly four decimal parts.`);
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return fail(`"${clip(part)}" in "${clip(text)}" is not a decimal number from 0 to 255.`);
    }
    if (part.length > 1 && part.startsWith("0")) {
      // Some parsers read a leading zero as octal, so 010 is 8 to one tool
      // and 10 to another. Refusing it is the only answer that is never wrong.
      return fail(`"${part}" in "${clip(text)}" has a leading zero, which some software reads as octal. Write it without the zero.`);
    }
    const n = Number(part);
    if (n > 255) return fail(`"${part}" in "${clip(text)}" is over 255, the largest value one octet can hold.`);
    value = value * 256 + n;
  }
  return { ok: true, value };
}

/**
 * Parse one IPv6 address in any RFC 4291 text form: full, with leading
 * zeros dropped, with one "::", or with a dotted IPv4 tail. Square brackets
 * (as in a URL) and a zone index after "%" (RFC 4007) are accepted and set
 * aside. Never throws.
 */
export function parseIpv6(raw: string): ParseResult {
  let text = raw.trim();
  if (text === "") return fail("Enter an IPv6 address.");
  if (text.length > MAX_INPUT_LENGTH) {
    return fail(`That is ${text.length} characters. The longest legal address with a zone is far shorter, so the limit here is ${MAX_INPUT_LENGTH}.`);
  }

  if (text.startsWith("[") || text.endsWith("]")) {
    const close = text.indexOf("]");
    if (text.startsWith("[") && close !== -1 && close !== text.length - 1) {
      // "[2001:db8::1]:443" (a URL with a port) or "[fe80::1]%eth0".
      return fail(
        `"${clip(text.slice(close + 1), 12)}" after the closing bracket is not part of the address. Remove it; a zone, if needed, goes inside the brackets.`,
      );
    }
    if (!(text.startsWith("[") && text.endsWith("]"))) {
      return fail("Unbalanced square brackets. Brackets go around the whole address, as in [2001:db8::1].");
    }
    text = text.slice(1, -1).trim();
  }

  let zone: string | null = null;
  const pct = text.indexOf("%");
  if (pct !== -1) {
    zone = text.slice(pct + 1);
    text = text.slice(0, pct);
    if (zone === "") return fail("A \"%\" must be followed by a zone, such as %eth0 or %12.");
    if (!/^[A-Za-z0-9._~-]{1,64}$/.test(zone)) {
      return fail(`"%${clip(zone)}" is not a usable zone index. Use an interface name or number such as %eth0 or %12.`);
    }
  }

  if (text === "") return fail("Enter an IPv6 address.");

  if (/\s/.test(text)) return fail("Remove the spaces or line breaks. An IPv6 address is written without any.");

  const bad = text.match(/[^0-9A-Fa-f:.]/u);
  if (bad) {
    if (bad[0] === "/") return fail("Only one \"/\" is allowed, between the address and the prefix length.");
    return fail(`${describeChar(bad[0])} is not allowed. An IPv6 address uses hex digits (0 to 9, a to f), colons, and optionally a dotted IPv4 tail.`);
  }

  if (!text.includes(":")) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
      const quad = parseDottedQuad(text);
      if (!quad.ok) return fail(`That looks like an IPv4 address, but ${quad.message.charAt(0).toLowerCase()}${quad.message.slice(1)}`);
      return fail(`That is an IPv4 address. Its IPv4-mapped IPv6 form is ::ffff:${text}.`);
    }
    return fail("An IPv6 address needs colons between its groups, as in 2001:db8::1.");
  }

  if (text.includes(":::")) {
    return fail("Three colons in a row is never valid. \"::\" stands for the zero groups, and a third colon leaves a group with nothing in it.");
  }

  const first = text.indexOf("::");
  if (first !== -1 && text.indexOf("::", first + 1) !== -1) {
    return fail("\"::\" may appear only once. With two, there is no way to tell how many zero groups each one stands for (RFC 4291 section 2.2).");
  }

  const hasGap = first !== -1;
  let head: string[];
  let tail: string[];
  if (hasGap) {
    const left = text.slice(0, first);
    const right = text.slice(first + 2);
    head = left === "" ? [] : left.split(":");
    tail = right === "" ? [] : right.split(":");
  } else {
    head = text.split(":");
    tail = [];
  }

  const all = [...head, ...tail];
  if (all.some((g) => g === "")) {
    if (!hasGap && text.startsWith(":")) {
      return fail("The address starts with a single colon. Use \"::\" to stand for leading zero groups, or remove the colon.");
    }
    if (!hasGap && text.endsWith(":")) {
      return fail("The address ends with a single colon. Use \"::\" to stand for trailing zero groups, or remove the colon.");
    }
    if (hasGap && head[0] === "") {
      return fail("The address starts with a single colon. Use \"::\" to stand for leading zero groups, or remove the colon.");
    }
    if (hasGap && tail[tail.length - 1] === "") {
      return fail("The address ends with a single colon. Use \"::\" to stand for trailing zero groups, or remove the colon.");
    }
    return fail("There is an empty group between two colons. Every group needs one to four hex digits.");
  }

  // Only the very last group may be a dotted quad, and it counts as two.
  // RFC 4291 section 2.2, form 3: the IPv4 part is the low-order 32 bits,
  // so it must end the text. "1.2.3.4::" puts it before the zero run and is
  // rejected, as inet_pton and Python's ipaddress also reject it.
  const words: number[] = [];
  const headWords: number[] = [];
  const tailWords: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const g = all[i];
    const target = i < head.length ? headWords : tailWords;
    if (g.includes(".")) {
      if (i !== all.length - 1) {
        return fail(`"${clip(g)}": dotted IPv4 notation is only allowed in the last 32 bits of the address.`);
      }
      if (hasGap && tail.length === 0) {
        return fail(`"${clip(g)}" is followed by "::". Dotted IPv4 notation is only allowed in the last 32 bits, so it must come at the very end.`);
      }
      const quad = parseDottedQuad(g);
      if (!quad.ok) return quad;
      target.push(Math.floor(quad.value / 65536), quad.value % 65536);
      continue;
    }
    if (g.length > 4) {
      return fail(`Group "${clip(g, 12)}" has ${g.length} hex digits. Each group is 16 bits, so it holds at most 4.`);
    }
    target.push(parseInt(g, 16));
  }

  const explicit = headWords.length + tailWords.length;
  if (hasGap) {
    if (explicit > 7) {
      return fail(`Too many groups: ${explicit} are written out, and "::" must stand for at least one more. With "::" there can be at most 7.`);
    }
    words.push(...headWords, ...new Array<number>(8 - explicit).fill(0), ...tailWords);
  } else {
    if (explicit > 8) {
      return fail(`Too many groups: ${explicit}. An IPv6 address is exactly 8 groups of 16 bits.`);
    }
    if (explicit < 8) {
      return fail(`Only ${explicit} groups. A full address has 8; write "::" where a run of zero groups was left out.`);
    }
    words.push(...headWords);
  }

  let value = 0n;
  for (const w of words) value = (value << 16n) | BigInt(w);
  return { ok: true, value, zone };
}

export type PrefixedResult =
  | { ok: true; value: bigint; prefix: number; prefixGiven: boolean; zone: string | null }
  | { ok: false; message: string };

/**
 * Parse "address/prefix". When the prefix is missing, defaultPrefix is used
 * and prefixGiven is false so the caller can say so.
 */
export function parsePrefixed(raw: string, defaultPrefix = 128): PrefixedResult {
  const text = raw.trim();
  if (text === "") return fail("Enter an IPv6 address.");
  if (text.length > MAX_INPUT_LENGTH) {
    return fail(`That is ${text.length} characters. The limit here is ${MAX_INPUT_LENGTH}.`);
  }
  const slash = text.indexOf("/");
  if (slash !== -1 && text.indexOf("/", slash + 1) !== -1) {
    return fail("Only one \"/\" is allowed, between the address and the prefix length.");
  }
  const addrPart = slash === -1 ? text : text.slice(0, slash);
  // The address is checked first: when both halves are wrong, the address
  // is the more fundamental problem and the one worth reporting.
  const parsed = parseIpv6(addrPart);
  if (!parsed.ok) return parsed;
  let prefix = defaultPrefix;
  let prefixGiven = false;
  if (slash !== -1) {
    const p = text.slice(slash + 1).trim();
    if (p === "") return fail("Add a prefix length after the \"/\", a whole number from 0 to 128.");
    if (!/^\d{1,3}$/.test(p) || Number(p) > 128) {
      return fail(`"/${clip(p, 12)}" is not a prefix length. It must be a whole number from 0 to 128.`);
    }
    prefix = Number(p);
    prefixGiven = true;
  }
  return { ok: true, value: parsed.value, prefix, prefixGiven, zone: parsed.zone };
}

/* ------------------------------------------------------------- formatting */

/** The eight 16-bit groups, most significant first. */
export function toGroups(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 7; i >= 0; i--) out.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return out;
}

/** Every group as four lowercase hex digits. */
export function expand(value: bigint): string {
  return toGroups(value)
    .map((g) => g.toString(16).padStart(4, "0"))
    .join(":");
}

/** The 32 hex digits with no separators. */
export function toNibbles(value: bigint): string {
  return value.toString(16).padStart(32, "0");
}

/** Dotted quad for a 32-bit number. */
export function ipv4String(v: number | bigint): string {
  const n = Number(BigInt(v) & 0xffffffffn);
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

/**
 * RFC 5952 section 4 compression of a list of groups: lowercase, leading
 * zeros dropped (4.1), "::" over the longest run of two or more zero groups
 * (4.2.1 to 4.2.3, leftmost on a tie), never over a single zero group.
 */
function compressGroups(groups: number[]): string {
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i < groups.length) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < groups.length && groups[j] === 0) j++;
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

/** True for ::ffff:0:0/96, the IPv4-mapped block. */
export function isIpv4Mapped(value: bigint): boolean {
  return value >> 32n === 0xffffn;
}

/**
 * The canonical text form. RFC 5952 section 5 recommends mixed notation
 * (::ffff:192.0.2.1) for IPv4-mapped addresses, whose prefix alone says the
 * low 32 bits are an IPv4 address, so that is applied unless hexOnly is set.
 */
export function compress(value: bigint, hexOnly = false): string {
  const groups = toGroups(value);
  if (!hexOnly && isIpv4Mapped(value)) {
    const head = compressGroups(groups.slice(0, 6));
    const v4 = ipv4String(value & 0xffffffffn);
    return head.endsWith(":") ? `${head}${v4}` : `${head}:${v4}`;
  }
  return compressGroups(groups);
}

/** The PTR name for one address (RFC 3596 section 2.5): 32 nibbles, reversed. */
export function reversePointer(value: bigint): string {
  return `${toNibbles(value).split("").reverse().join(".")}.ip6.arpa`;
}

/**
 * The reverse DNS zone(s) for a prefix. ip6.arpa delegates on nibble (4 bit)
 * boundaries, so a prefix that is not a multiple of 4 needs one zone per
 * value of the partly covered hex digit: 2, 4 or 8 zones.
 */
export function reverseZones(network: bigint, prefix: number): string[] {
  const nibbles = toNibbles(network);
  const whole = Math.floor(prefix / 4);
  const spare = prefix % 4;
  const fixed = nibbles.slice(0, whole).split("").reverse();
  if (spare === 0) {
    return [[...fixed, "ip6.arpa"].join(".")];
  }
  const partial = parseInt(nibbles[whole], 16);
  const free = 4 - spare;
  const base = (partial >> free) << free;
  const zones: string[] = [];
  for (let k = 0; k < 1 << free; k++) {
    zones.push([(base | k).toString(16), ...fixed, "ip6.arpa"].join("."));
  }
  return zones;
}

/** A BigInt with thousands separators. */
export function formatBig(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ------------------------------------------------------- prefix arithmetic */

/** The netmask for a prefix length, as a 128-bit value. */
export function maskOf(prefix: number): bigint {
  const p = Math.max(0, Math.min(128, Math.trunc(prefix)));
  return ALL_ONES ^ ((1n << BigInt(128 - p)) - 1n);
}

export interface PrefixInfo {
  network: bigint;
  last: bigint;
  /** True when the address typed had bits set past the prefix. */
  hostBitsSet: boolean;
  total: bigint;
  /** How many /64s fit, or null when the prefix is longer than /64. */
  count64: bigint | null;
  count56: bigint | null;
  count48: bigint | null;
}

/** Number of /target blocks in a /prefix, or null if the prefix is smaller than one. */
export function blocksOf(prefix: number, target: number): bigint | null {
  return prefix <= target ? 1n << BigInt(target - prefix) : null;
}

export function prefixInfo(value: bigint, prefix: number): PrefixInfo {
  const mask = maskOf(prefix);
  const network = value & mask;
  const last = network | (ALL_ONES ^ mask);
  return {
    network,
    last,
    hostBitsSet: network !== value,
    total: 1n << BigInt(128 - prefix),
    count64: blocksOf(prefix, 64),
    count56: blocksOf(prefix, 56),
    count48: blocksOf(prefix, 48),
  };
}

export interface Subdivision {
  newPrefix: number;
  count: bigint;
  /** The first few subnets, at most SUBDIVIDE_LIST_LIMIT. */
  first: bigint[];
  /** The final subnet, when it is not already in `first`. */
  lastSubnet: bigint | null;
}

/** Split network/prefix into /newPrefix blocks and list the first few. */
export function subdivide(network: bigint, prefix: number, newPrefix: number, limit = SUBDIVIDE_LIST_LIMIT): Subdivision | null {
  if (!Number.isInteger(newPrefix) || newPrefix <= prefix || newPrefix > 128) return null;
  const count = 1n << BigInt(newPrefix - prefix);
  const step = 1n << BigInt(128 - newPrefix);
  const listed = count < BigInt(limit) ? Number(count) : limit;
  const first: bigint[] = [];
  for (let i = 0; i < listed; i++) first.push(network + BigInt(i) * step);
  const lastSubnet = count > BigInt(listed) ? network + (count - 1n) * step : null;
  return { newPrefix, count, first, lastSubnet };
}

/* ---------------------------------------------------------- classification */

interface Block {
  cidr: string;
  label: string;
  rfc: string;
  detail: string;
}

/*
 * IANA IPv6 Special-Purpose Address Registry, plus the top-level blocks of
 * the IPv6 Address Space registry (global unicast, ULA, link-local,
 * multicast). Matching is longest prefix first, the same rule a router uses.
 */
const BLOCKS: Block[] = [
  {
    cidr: "::/128",
    label: "Unspecified",
    rfc: "RFC 4291 section 2.5.2",
    detail: "The all-zeros address. A host uses it as a source address before it has one of its own, for example during duplicate address detection. It is never a valid destination and is never forwarded.",
  },
  {
    cidr: "::1/128",
    label: "Loopback",
    rfc: "RFC 4291 section 2.5.3",
    detail: "The equivalent of 127.0.0.1, but a single address rather than a whole /8. Packets sent to it never leave the host.",
  },
  {
    cidr: "::ffff:0:0/96",
    label: "IPv4-mapped",
    rfc: "RFC 4291 section 2.5.5.2",
    detail: "An IPv4 address carried in the IPv6 socket API. Dual-stack servers log IPv4 clients this way. The IANA registry marks these as valid neither as the source nor as the destination of a packet on the wire.",
  },
  {
    cidr: "::/96",
    label: "IPv4-compatible (deprecated)",
    rfc: "RFC 4291 section 2.5.5.1",
    detail: "An early transition format with an IPv4 address in the low 32 bits. It is deprecated, and new or updated implementations are not required to support it.",
  },
  {
    cidr: "64:ff9b::/96",
    label: "NAT64 well-known prefix",
    rfc: "RFC 6052",
    detail: "An IPv4 address embedded in the low 32 bits for NAT64 translation. A DNS64 resolver synthesizes addresses like this so IPv6-only clients can reach IPv4-only servers.",
  },
  {
    cidr: "64:ff9b:1::/48",
    label: "Local-use IPv4/IPv6 translation",
    rfc: "RFC 8215",
    detail: "Reserved for translation mechanisms inside a single network. It is not globally reachable.",
  },
  {
    cidr: "100::/64",
    label: "Discard-only",
    rfc: "RFC 6666",
    detail: "A prefix to send unwanted traffic into, for example for remotely triggered black hole filtering. It is not globally reachable.",
  },
  {
    cidr: "100:0:0:1::/64",
    label: "Dummy IPv6 prefix",
    rfc: "RFC 9780",
    detail: "Used as the IP destination of MPLS echo requests (LSP ping) and similar maintenance packets. No router forwards it, so the router at the end of the path handles the packet itself and replies. Not globally reachable.",
  },
  {
    cidr: "2001::/23",
    label: "IETF protocol assignments",
    rfc: "RFC 2928",
    detail: "A block IANA holds for addresses that specific protocols need. Individual assignments inside it are listed separately in the registry.",
  },
  {
    cidr: "2001::/32",
    label: "Teredo",
    rfc: "RFC 4380",
    detail: "IPv6 tunneled over UDP through IPv4 NAT. The server address, the client's public IPv4 address and its UDP port are encoded in the address, the last two obfuscated by inverting every bit.",
  },
  {
    cidr: "2001:1::1/128",
    label: "Port Control Protocol anycast",
    rfc: "RFC 7723",
    detail: "The anycast address a PCP client can use to reach a PCP server without configuration.",
  },
  {
    cidr: "2001:1::2/128",
    label: "TURN anycast",
    rfc: "RFC 8155",
    detail: "The anycast address for discovering a TURN relay server.",
  },
  {
    cidr: "2001:1::3/128",
    label: "DNS-SD Service Registration Protocol anycast",
    rfc: "RFC 9665",
    detail: "A fixed anycast address a device can send Service Registration Protocol updates to when no registrar has been configured.",
  },
  {
    cidr: "2001:2::/48",
    label: "Benchmarking",
    rfc: "RFC 5180",
    detail: "Reserved for lab benchmarking of network devices, so test traffic cannot collide with real addresses. Not globally reachable.",
  },
  {
    cidr: "2001:3::/32",
    label: "AMT",
    rfc: "RFC 7450",
    detail: "Automatic Multicast Tunneling, which carries multicast across networks that do not route it natively.",
  },
  {
    cidr: "2001:4:112::/48",
    label: "AS112-v6",
    rfc: "RFC 7535",
    detail: "Used by the AS112 project, which absorbs reverse DNS queries for private address space that should never have left the local network.",
  },
  {
    cidr: "2001:10::/28",
    label: "ORCHID (deprecated)",
    rfc: "RFC 4843",
    detail: "The original block for cryptographic hash identifiers. It has been replaced by ORCHIDv2.",
  },
  {
    cidr: "2001:20::/28",
    label: "ORCHIDv2",
    rfc: "RFC 7343",
    detail: "Overlay Routable Cryptographic Hash Identifiers. They look like addresses but name a cryptographic identity and are not routable on the IPv6 internet.",
  },
  {
    cidr: "2001:30::/28",
    label: "Drone Remote ID entity tags",
    rfc: "RFC 9374",
    detail: "DRIP Entity Tags, identifiers for unmanned aircraft built in the same hash-based style as ORCHIDv2.",
  },
  {
    cidr: "2001:db8::/32",
    label: "Documentation",
    rfc: "RFC 3849",
    detail: "Reserved for examples in books, RFCs and configuration guides. It should never appear on a real network, and seeing it in production usually means a pasted example that was never edited.",
  },
  {
    cidr: "2002::/16",
    label: "6to4",
    rfc: "RFC 3056",
    detail: "An automatic tunnel format. The 32 bits after 2002 are the IPv4 address of the site's 6to4 router, which gives every public IPv4 address its own /48.",
  },
  {
    cidr: "2620:4f:8000::/48",
    label: "AS112 direct delegation",
    rfc: "RFC 7534",
    detail: "Address space for the AS112 name servers that answer reverse queries for private ranges.",
  },
  {
    cidr: "3fff::/20",
    label: "Documentation",
    rfc: "RFC 9637",
    detail: "A second, much larger documentation block, added so examples can show realistic multi-site allocations. Like 2001:db8::/32, it should never appear on a real network.",
  },
  {
    cidr: "5f00::/16",
    label: "SRv6 segment identifiers",
    rfc: "RFC 9602",
    detail: "Reserved for Segment Routing over IPv6 SIDs inside an operator's own domain. Not globally reachable.",
  },
  {
    cidr: "2000::/3",
    label: "Global unicast",
    rfc: "RFC 4291 section 2.5.4",
    detail: "Public, routable address space. IANA hands it to the regional registries, which hand it to providers and organizations.",
  },
  {
    cidr: "fc00::/7",
    label: "Unique local (ULA)",
    rfc: "RFC 4193",
    detail: "Private addressing for use inside a site, routable between your own networks but not on the internet. The 40-bit Global ID is meant to be random so two merged networks are unlikely to collide.",
  },
  {
    cidr: "fe80::/10",
    label: "Link-local unicast",
    rfc: "RFC 4291 section 2.5.6",
    detail: "Every IPv6 interface has one. Routers never forward these, and because every link uses the same prefix, the address needs a zone index (fe80::1%eth0) to say which interface it belongs to.",
  },
  {
    cidr: "fec0::/10",
    label: "Site-local (deprecated)",
    rfc: "RFC 3879",
    detail: "The original private-address block. It was deprecated because \"site\" was never well defined. New networks use unique local addresses (fc00::/7) instead.",
  },
  {
    cidr: "ff00::/8",
    label: "Multicast",
    rfc: "RFC 4291 section 2.7",
    detail: "One-to-many delivery. IPv6 has no broadcast; multicast groups such as all-nodes do that job, and the scope field limits how far a packet may travel.",
  },
];

interface CompiledBlock extends Block {
  network: bigint;
  prefix: number;
}

const COMPILED: CompiledBlock[] = BLOCKS.flatMap((b) => {
  const parsed = parsePrefixed(b.cidr);
  return parsed.ok ? [{ ...b, network: parsed.value, prefix: parsed.prefix }] : [];
}).sort((a, b) => b.prefix - a.prefix);

/** Exposed for tests: every block in the table must parse. */
export const BLOCK_COUNT = { declared: BLOCKS.length, compiled: COMPILED.length };

export interface Field {
  label: string;
  value: string;
}

export interface AddressClass {
  label: string;
  block: string;
  rfc: string;
  detail: string;
  /** Decoded sub-fields specific to this kind of address. */
  fields: Field[];
  /** Extra caveats worth showing next to the result. */
  notes: string[];
}

/** RFC 4291 section 2.7 and RFC 7346 section 2. */
export const MULTICAST_SCOPES: Record<number, string> = {
  0x0: "Reserved",
  0x1: "Interface-local",
  0x2: "Link-local",
  0x3: "Realm-local",
  0x4: "Admin-local",
  0x5: "Site-local",
  0x8: "Organization-local",
  0xe: "Global",
  0xf: "Reserved",
};

/** Well-known groups from the IANA IPv6 Multicast Address Space registry. */
const WELL_KNOWN_GROUPS: Record<string, string> = {
  "ff01::1": "All nodes, interface-local",
  "ff01::2": "All routers, interface-local",
  "ff02::1": "All nodes on the link",
  "ff02::2": "All routers on the link",
  "ff02::5": "OSPFv3, all SPF routers",
  "ff02::6": "OSPFv3, designated routers",
  "ff02::9": "RIPng routers",
  "ff02::a": "EIGRP routers",
  "ff02::d": "All PIM routers",
  "ff02::12": "VRRP",
  "ff02::16": "All MLDv2-capable routers",
  "ff02::fb": "mDNS",
  "ff02::1:2": "All DHCPv6 relay agents and servers",
  "ff02::1:3": "LLMNR",
  "ff05::2": "All routers, site-local",
  "ff05::1:3": "All DHCPv6 servers, site-local",
};

function hex16(v: bigint): string {
  return Number(v & 0xffffn).toString(16).padStart(4, "0");
}

/** The low 64 bits as four 4-digit groups. */
export function interfaceIdString(value: bigint): string {
  const iid = value & LOW64;
  return [48n, 32n, 16n, 0n].map((s) => hex16(iid >> s)).join(":");
}

/** ff02::1:ff00:0, the base of the solicited-node /104 (RFC 4291 section 2.7.1). */
export const SOLICITED_NODE_BASE = 0xff02n << 112n | 0x1ff000000n;

/** The solicited-node group an address joins: ff02::1:ff plus its low 24 bits. */
export function solicitedNode(value: bigint): bigint {
  return SOLICITED_NODE_BASE | (value & 0xffffffn);
}

function classifyMulticast(value: bigint, base: CompiledBlock): AddressClass {
  const flags = Number((value >> 116n) & 0xfn);
  const scope = Number((value >> 112n) & 0xfn);
  const scopeName = MULTICAST_SCOPES[scope] ?? "Unassigned";
  const flagWords: string[] = [];
  if (flags & 0x8) flagWords.push("reserved high bit set (should be 0)");
  if (flags & 0x4) flagWords.push("R: embedded rendezvous point (RFC 3956)");
  if (flags & 0x2) flagWords.push("P: based on a unicast prefix (RFC 3306)");
  flagWords.push(flags & 0x1 ? "T: transient, assigned dynamically" : "T clear: permanent, assigned by IANA");

  const fields: Field[] = [
    { label: "Flags", value: `0x${flags.toString(16)} · ${flagWords.join("; ")}` },
    { label: "Scope", value: `0x${scope.toString(16)} · ${scopeName}` },
    { label: "Group ID", value: (value & ((1n << 112n) - 1n)).toString(16) },
  ];

  const notes: string[] = [];
  const known = WELL_KNOWN_GROUPS[compress(value)];
  let label = `${base.label}, ${scopeName.toLowerCase()} scope`;

  // Solicited-node: ff02::1:ff00:0/104 plus the low 24 bits of a unicast
  // address (RFC 4291 section 2.7.1). Neighbor discovery sends here instead
  // of to every node.
  if (value >> 24n === SOLICITED_NODE_BASE >> 24n) {
    label = "Solicited-node multicast";
    fields.push({ label: "Low 24 bits", value: (value & 0xffffffn).toString(16).padStart(6, "0") });
    notes.push(
      "Neighbor discovery sends address resolution here rather than to all nodes. Every unicast address whose last 24 bits match joins this group, so on most links only one host receives it.",
    );
  } else if (known) {
    fields.push({ label: "Well-known group", value: known });
  }
  if (scope === 0 || scope === 0xf) {
    notes.push("Scope values 0 and F are reserved. Packets with these scopes should not be sent.");
  }
  // RFC 3306 section 4: P = 1 requires T = 1. RFC 3956 section 3: R = 1
  // requires P = 1 (and so T = 1).
  if (flags & 0x4 && (flags & 0x3) !== 0x3) {
    notes.push("The R flag is set without both P and T. RFC 3956 requires P = 1 and T = 1 whenever R = 1, so this flag combination is invalid.");
  } else if (flags & 0x2 && !(flags & 0x1)) {
    notes.push("The P flag is set without T. RFC 3306 requires T = 1 whenever P = 1, so this flag combination is invalid.");
  }
  return { label, block: base.cidr, rfc: base.rfc, detail: base.detail, fields, notes };
}

/** Classify an address against the IANA registries, longest match first. */
export function classify(value: bigint): AddressClass {
  const v = value & ALL_ONES;
  const hit = COMPILED.find((b) => (v & maskOf(b.prefix)) === b.network);
  if (!hit) {
    return {
      label: "Reserved by IETF",
      block: "outside every allocated block",
      rfc: "IANA IPv6 Address Space registry",
      detail: "This falls in space IANA has not allocated for any use. It should not appear on a working network.",
      fields: [],
      notes: [],
    };
  }

  if (hit.cidr === "ff00::/8") return classifyMulticast(v, hit);

  const fields: Field[] = [];
  const notes: string[] = [];
  const low32 = v & 0xffffffffn;

  switch (hit.cidr) {
    case "::ffff:0:0/96":
    case "64:ff9b::/96":
    case "::/96":
      fields.push({ label: "Embedded IPv4", value: ipv4String(low32) });
      if (hit.cidr === "::ffff:0:0/96") {
        notes.push(
          `A filter written for ${ipv4String(low32)} will not match the string ${compress(v)}. Check that access rules and log searches normalize mapped addresses first.`,
        );
      }
      break;
    case "2002::/16":
      fields.push({ label: "6to4 router IPv4", value: ipv4String((v >> 80n) & 0xffffffffn) });
      fields.push({ label: "Site /48", value: `${compress(v & maskOf(48))}/48` });
      break;
    case "2001::/32": {
      // RFC 4380 section 4: prefix(32) server(32) flags(16) port(16) client(32),
      // with the port and the client address stored bit-inverted.
      const server = (v >> 64n) & 0xffffffffn;
      const flags = Number((v >> 48n) & 0xffffn);
      const port = Number(((v >> 32n) & 0xffffn) ^ 0xffffn);
      const client = low32 ^ 0xffffffffn;
      fields.push({ label: "Teredo server", value: ipv4String(server) });
      fields.push({ label: "Client public IPv4", value: ipv4String(client) });
      fields.push({ label: "Client UDP port", value: String(port) });
      fields.push({
        label: "Flags",
        value: `0x${flags.toString(16).padStart(4, "0")}${flags & 0x8000 ? " · high bit set (the cone flag in RFC 4380)" : ""}`,
      });
      break;
    }
    case "fc00::/7": {
      const l = Number((v >> 120n) & 0x1n);
      if (l === 1) {
        fields.push({ label: "L bit", value: "1 · locally assigned (fd00::/8)" });
        fields.push({ label: "Global ID", value: ((v >> 80n) & 0xffffffffffn).toString(16).padStart(10, "0") });
        fields.push({ label: "Subnet ID", value: hex16(v >> 64n) });
      } else {
        fields.push({ label: "L bit", value: "0 · fc00::/8" });
        notes.push(
          "fc00::/8 (L bit 0) was set aside for a centrally assigned scheme that was never defined. Unique local prefixes in use are all in fd00::/8 with a random Global ID.",
        );
      }
      fields.push({ label: "Interface ID", value: interfaceIdString(v) });
      break;
    }
    case "fe80::/10": {
      const middle = (v >> 64n) & ((1n << 54n) - 1n);
      fields.push({ label: "Interface ID", value: interfaceIdString(v) });
      if (middle !== 0n) {
        notes.push(
          "This is inside fe80::/10 but not in the form RFC 4291 defines, which requires the 54 bits after fe80 to be zero (fe80::/64). Most systems will not generate it.",
        );
      }
      break;
    }
    case "2000::/3":
      fields.push({ label: "Containing /64", value: `${compress(v & maskOf(64))}/64` });
      fields.push({ label: "Interface ID", value: interfaceIdString(v) });
      break;
    default:
      break;
  }

  return { label: hit.label, block: hit.cidr, rfc: hit.rfc, detail: hit.detail, fields, notes };
}

/** True when the low 64 bits look like modified EUI-64 (ff:fe in the middle). */
export function looksLikeEui64(value: bigint): boolean {
  return ((value >> 24n) & 0xffffn) === 0xfffen;
}
