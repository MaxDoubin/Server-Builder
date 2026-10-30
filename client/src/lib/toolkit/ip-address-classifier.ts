/**
 * IP address parsing and special-purpose classification.
 *
 * The data is the IANA IPv4 and IPv6 Special-Purpose Address Registries,
 * the pair RFC 6890 created and RFC 8190 updated, transcribed with their
 * five attribute columns. A handful of related blocks that live in other
 * IANA registries (multicast, the deprecated IPv6 site-local prefix) are
 * listed separately and flagged as such, so nothing here claims a registry
 * attribute the registry does not publish.
 *
 * Addresses are held as BigInt for both families. IPv4 would fit in a
 * double, but JavaScript's bitwise operators truncate to signed 32 bits,
 * and one representation for both families keeps the prefix arithmetic in
 * one place. No React or DOM in this file, so it can be tested directly.
 */

export type Family = 4 | 6;

export interface IpAddress {
  family: Family;
  /** The address as an unsigned integer, 32 or 128 bits wide. */
  value: bigint;
  /** RFC 4007 zone ID after the %, if one was written. */
  zoneId: string | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** No address text is longer than 45 characters; anything past this is refused unread. */
export const MAX_INPUT_LENGTH = 256;

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

/** Trim a fragment of user input for quoting inside an error message. */
function quote(text: string): string {
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

export function familyBits(family: Family): number {
  return family === 4 ? 32 : 128;
}

/* ------------------------------------------------------------- parsing */

/**
 * Strict dotted-quad: four decimal octets, 0 to 255, no leading zeros.
 *
 * inet_aton also accepts 127.1, 0x7f.0.0.1, 0177.0.0.1 and 2130706433 for
 * the same address. Those forms are how SSRF and ACL checks get bypassed
 * (CVE-2021-29921 was Python's ipaddress reading leading zeros as decimal
 * while the OS read them as octal), so they are rejected with the reason.
 */
export function parseIPv4(text: string): Result<bigint> {
  if (text === "") return fail("The IPv4 address is empty.");
  if (/^\d+$/.test(text)) {
    return fail(
      `"${quote(text)}" is a bare integer. Some parsers read one number as a whole 32-bit address (2130706433 is 127.0.0.1), a classic way around address filters. Write it as four dotted decimal octets.`,
    );
  }
  const parts = text.split(".");
  const empty = parts.indexOf("");
  if (empty !== -1) {
    return fail(`Octet ${empty + 1} is empty: two dots in a row, or a dot at the start or end.`);
  }
  if (parts.length > 4) {
    return fail(`An IPv4 address has four octets, and this has ${parts.length}.`);
  }
  let value = 0n;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const n = i + 1;
    if (/^0x/i.test(part)) {
      return fail(
        `Octet ${n} ("${quote(part)}") is hexadecimal. inet_aton accepts that, but the standard form is decimal, and mixed forms are a known filter bypass.`,
      );
    }
    if (!/^\d+$/.test(part)) {
      return fail(`Octet ${n} ("${quote(part)}") is not a decimal number.`);
    }
    if (part.length > 1 && part.startsWith("0")) {
      return fail(
        `Octet ${n} ("${quote(part)}") has a leading zero. Some parsers read that as octal (010 is 8) and others as decimal (10), so the address is ambiguous. Remove the leading zeros.`,
      );
    }
    const octet = Number(part);
    if (octet > 255) {
      return fail(`Octet ${n} is ${quote(part)}, but an octet holds 0 to 255.`);
    }
    value = (value << 8n) | BigInt(octet);
  }
  if (parts.length < 4) {
    return fail(
      `An IPv4 address has four octets, and this has ${parts.length}. Shorthand such as 127.1 is accepted by inet_aton (it means 127.0.0.1) but is not the standard dotted-quad form.`,
    );
  }
  return { ok: true, value };
}

/** RFC 4291 section 2.2 text forms, including :: and a trailing dotted IPv4. */
export function parseIPv6(text: string): Result<bigint> {
  if (text === "") return fail("The IPv6 address is empty.");
  if (text.includes(":::")) {
    return fail("':::' is not valid. A double colon stands for one or more zero groups and is written once, as '::'.");
  }
  const first = text.indexOf("::");
  if (first !== -1 && text.indexOf("::", first + 1) !== -1) {
    return fail(
      "'::' can appear only once. With two, the number of zero groups each one stands for would be ambiguous (RFC 4291 section 2.2).",
    );
  }
  const compressed = first !== -1;
  const headText = compressed ? text.slice(0, first) : text;
  const tailText = compressed ? text.slice(first + 2) : "";
  const head = headText === "" ? [] : headText.split(":");
  const tail = tailText === "" ? [] : tailText.split(":");
  if (!compressed && head.length === 1) {
    return fail("An IPv6 address needs colons between its groups.");
  }

  // A dotted IPv4 tail may only be the very last 32 bits. With "::" at the
  // end there is no tail, so a dot anywhere is misplaced.
  const lastList = compressed ? tail : head;
  let v4: bigint | null = null;
  if (lastList.length > 0 && lastList[lastList.length - 1].includes(".")) {
    const parsed = parseIPv4(lastList[lastList.length - 1]);
    if (!parsed.ok) return fail(`The embedded IPv4 part is invalid. ${parsed.error}`);
    v4 = parsed.value;
    lastList.pop();
  }
  for (const group of [...head, ...tail]) {
    if (group.includes(".")) {
      return fail("An embedded IPv4 address can only be the last 32 bits, as in ::ffff:192.0.2.1.");
    }
    if (group === "") {
      return fail("There is an empty group: a single colon at the start or end, or a stray colon. Use '::' to skip zero groups.");
    }
    if (!/^[0-9a-fA-F]+$/.test(group)) {
      return fail(`"${quote(group)}" is not a hex group. IPv6 groups use 0 to 9 and a to f.`);
    }
    if (group.length > 4) {
      return fail(`The group "${quote(group)}" has more than four hex digits. Each group is 16 bits.`);
    }
  }

  const explicit = head.length + tail.length + (v4 === null ? 0 : 2);
  if (!compressed && explicit !== 8) {
    return fail(`A full IPv6 address has eight groups, and this has ${explicit}. Use '::' to stand for a run of zero groups.`);
  }
  if (compressed && explicit > 7) {
    return fail(`With '::' there can be at most seven other groups, and this has ${explicit}.`);
  }

  const groups: bigint[] = [
    ...head.map((g) => BigInt(`0x${g}`)),
    ...Array.from({ length: compressed ? 8 - explicit : 0 }, () => 0n),
    ...tail.map((g) => BigInt(`0x${g}`)),
  ];
  if (v4 !== null) groups.push(v4 >> 16n, v4 & 0xffffn);
  const value = groups.reduce((acc, g) => (acc << 16n) | g, 0n);
  return { ok: true, value };
}

/**
 * Parse one IPv4 or IPv6 address as typed by a person. Accepts surrounding
 * whitespace, [brackets] around IPv6, and an RFC 4007 zone ID after %.
 */
export function parseIp(raw: string): Result<IpAddress> {
  let text = raw.trim();
  if (text === "") return fail("Enter an IPv4 or IPv6 address.");
  if (text.length > MAX_INPUT_LENGTH) {
    return fail(
      `That is ${text.length} characters. No IP address is longer than 45, so input past ${MAX_INPUT_LENGTH} characters is not read.`,
    );
  }
  if (text.startsWith("[") || text.endsWith("]")) {
    const m = /^\[([^\][]*)\]$/.exec(text);
    if (!m) return fail("A bracketed address must look like [2001:db8::1], with nothing outside the brackets.");
    text = m[1].trim();
  }
  if (text.includes("/")) {
    return fail("Enter a single address without a prefix length.");
  }
  if (text.includes(":")) {
    let zoneId: string | null = null;
    const pct = text.indexOf("%");
    if (pct !== -1) {
      zoneId = text.slice(pct + 1);
      text = text.slice(0, pct);
      if (!/^[A-Za-z0-9._~-]{1,64}$/.test(zoneId)) {
        return fail("The zone ID after % must be an interface name or number, such as %eth0 or %3 (RFC 4007).");
      }
    }
    const parsed = parseIPv6(text);
    if (!parsed.ok) return parsed;
    return { ok: true, value: { family: 6, value: parsed.value, zoneId } };
  }
  if (text.includes("%")) {
    return fail("A zone ID (the part after %) only applies to IPv6 addresses.");
  }
  const parsed = parseIPv4(text);
  if (!parsed.ok) return parsed;
  return { ok: true, value: { family: 4, value: parsed.value, zoneId: null } };
}

/* ---------------------------------------------------------- formatting */

export function formatIPv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((s) => ((value >> s) & 0xffn).toString()).join(".");
}

export function ipv6Groups(value: bigint): number[] {
  const out: number[] = [];
  for (let i = 7; i >= 0; i--) out.push(Number((value >> BigInt(i * 16)) & 0xffffn));
  return out;
}

/**
 * RFC 5952 canonical text: lowercase, no leading zeros, the longest run of
 * two or more zero groups replaced by :: (the first run on a tie), and a
 * single zero group left as 0. IPv4-mapped addresses use the mixed
 * notation section 5 recommends, ::ffff:192.0.2.1.
 */
export function formatIPv6(value: bigint): string {
  const groups = ipv6Groups(value);
  if (value >> 32n === 0xffffn) {
    return `::ffff:${formatIPv4(value & 0xffffffffn)}`;
  }
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
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

/** Every group written out with four digits, as a packet capture would show it. */
export function formatIPv6Full(value: bigint): string {
  return ipv6Groups(value)
    .map((g) => g.toString(16).padStart(4, "0"))
    .join(":");
}

export function formatIp(family: Family, value: bigint): string {
  return family === 4 ? formatIPv4(value) : formatIPv6(value);
}

/* ------------------------------------------------------------ prefixes */

/** The address with every bit after the first `length` cleared. */
export function networkOf(family: Family, value: bigint, length: number): bigint {
  const bits = BigInt(familyBits(family));
  const host = bits - BigInt(length);
  return (value >> host) << host;
}

export function inBlock(family: Family, value: bigint, network: bigint, length: number): boolean {
  return networkOf(family, value, length) === network;
}

/* ------------------------------------------------------------ registry */

/** true, false, or null where the registry prints N/A or has no column. */
export type Attr = boolean | null;

export interface Attributes {
  source: Attr;
  destination: Attr;
  forwardable: Attr;
  globallyReachable: Attr;
  reservedByProtocol: Attr;
}

export const ATTRIBUTE_KEYS: (keyof Attributes)[] = [
  "source",
  "destination",
  "forwardable",
  "globallyReachable",
  "reservedByProtocol",
];

/** RFC 6890 section 2.2.2, with RFC 8190's rename of Global to Globally Reachable. */
export const ATTRIBUTE_INFO: Record<keyof Attributes, { label: string; short: string; definition: string }> = {
  source: {
    label: "Source",
    short: "Src",
    definition: "Valid as the source address of a datagram that travels from one device to another, rather than staying inside a host.",
  },
  destination: {
    label: "Destination",
    short: "Dst",
    definition: "Valid as the destination address of a datagram that travels from one device to another, rather than staying inside a host.",
  },
  forwardable: {
    label: "Forwardable",
    short: "Fwd",
    definition: "A router may forward a datagram whose destination is in this block.",
  },
  globallyReachable: {
    label: "Globally reachable",
    short: "Global",
    definition: "A datagram to this block may be forwarded beyond the administrative domain it started in.",
  },
  reservedByProtocol: {
    label: "Reserved by protocol",
    short: "Rsvd",
    definition: "The defining RFC requires every compliant IP stack to treat the block specially.",
  },
};

export type RegistrySource = "special" | "multicast" | "address-space";

export interface Block {
  cidr: string;
  network: bigint;
  length: number;
}

export interface SpecialEntry {
  id: string;
  family: Family;
  blocks: Block[];
  name: string;
  rfcs: string[];
  attrs: Attributes;
  /** Which IANA registry the entry comes from. Only "special" carries attributes. */
  registry: RegistrySource;
  deprecated: boolean;
  footnote: string | null;
  summary: string;
}

function parseBlock(family: Family, cidr: string): Block {
  const slash = cidr.indexOf("/");
  const addr = cidr.slice(0, slash);
  const length = Number(cidr.slice(slash + 1));
  const parsed = family === 4 ? parseIPv4(addr) : parseIPv6(addr);
  // Static data, checked by the unit tests. A typo here should fail loudly
  // in development rather than silently drop a registry row.
  if (!parsed.ok) throw new Error(`Bad registry block ${cidr}: ${parsed.error}`);
  return { cidr, network: parsed.value, length };
}

type Row = [Attr, Attr, Attr, Attr, Attr];
const T = true;
const F = false;
const NA = null;
const NONE: Row = [NA, NA, NA, NA, NA];

function entry(
  family: Family,
  id: string,
  cidrs: string[],
  name: string,
  rfcs: string[],
  row: Row,
  summary: string,
  extra: { registry?: RegistrySource; deprecated?: boolean; footnote?: string } = {},
): SpecialEntry {
  const [source, destination, forwardable, globallyReachable, reservedByProtocol] = row;
  return {
    id,
    family,
    blocks: cidrs.map((c) => parseBlock(family, c)),
    name,
    rfcs,
    attrs: { source, destination, forwardable, globallyReachable, reservedByProtocol },
    registry: extra.registry ?? "special",
    deprecated: extra.deprecated ?? false,
    footnote: extra.footnote ?? null,
    summary,
  };
}

const LOOPBACK_FOOTNOTE =
  "The registry marks these false with a footnote: some protocols have been granted exceptions, for example MPLS LSP Ping (RFC 8029) and BFD for MPLS (RFC 5884).";
const MORE_SPECIFIC_FOOTNOTE = "Not usable unless a more specific entry in the registry assigns the address.";

/** IANA IPv4 Special-Purpose Address Registry, in registry order. */
export const IPV4_SPECIAL: SpecialEntry[] = [
  entry(4, "v4-this-network", ["0.0.0.0/8"], "\"This network\"", ["RFC 791 section 3.2"], [T, F, F, F, T],
    "Names a host on this network. RFC 1122 allows it only as a source, while a host is starting up and does not yet know its network number. It is never a valid destination, and routers do not forward it."),
  entry(4, "v4-this-host", ["0.0.0.0/32"], "\"This host on this network\"", ["RFC 1122 section 3.2.1.3"], [T, F, F, F, T],
    "The unspecified address. A host with no address yet sends from it, as in a DHCP DISCOVER. Binding a listening socket to 0.0.0.0 means every local address, which is a sockets API convention rather than an address on the wire."),
  entry(4, "v4-private-10", ["10.0.0.0/8"], "Private-Use", ["RFC 1918"], [T, T, T, F, F],
    "RFC 1918 private space. Any network may use it without asking anyone and route it internally, but it is not globally reachable: it has to be translated by NAT to reach the internet, and the same addresses are reused by countless networks."),
  entry(4, "v4-shared", ["100.64.0.0/10"], "Shared Address Space", ["RFC 6598"], [T, T, T, F, F],
    "Reserved for carrier-grade NAT, between a subscriber's router and the provider's translator. It behaves like private space but belongs to service provider networks, so using it inside an enterprise risks colliding with an upstream provider that already does."),
  entry(4, "v4-loopback", ["127.0.0.0/8"], "Loopback", ["RFC 1122 section 3.2.1.3"], [F, F, F, F, T],
    "Traffic to any address in 127.0.0.0/8 stays inside the host. The whole /8 is loopback, not only 127.0.0.1, and RFC 1122 says these addresses must never appear outside a host.",
    { footnote: LOOPBACK_FOOTNOTE }),
  entry(4, "v4-link-local", ["169.254.0.0/16"], "Link Local", ["RFC 3927"], [T, T, F, F, T],
    "Self-assigned when DHCP fails, and valid only on the local link: routers must not forward it. Major cloud providers also serve instance metadata at 169.254.169.254, which is one reason server-side request filters refuse the whole range."),
  entry(4, "v4-private-172", ["172.16.0.0/12"], "Private-Use", ["RFC 1918"], [T, T, T, F, F],
    "RFC 1918 private space, 172.16.0.0 to 172.31.255.255. The /12 boundary is easy to misremember: 172.32.0.0 is ordinary public space."),
  entry(4, "v4-ietf", ["192.0.0.0/24"], "IETF Protocol Assignments", ["RFC 6890 section 2.1"], [F, F, F, F, F],
    "Held by the IETF for protocol assignments. An address here is not usable unless a more specific entry assigns it.",
    { footnote: MORE_SPECIFIC_FOOTNOTE }),
  entry(4, "v4-service-continuity", ["192.0.0.0/29"], "IPv4 Service Continuity Prefix", ["RFC 7335"], [T, T, T, F, F],
    "First assigned to DS-Lite (RFC 6333) for the link between the subscriber's tunnel endpoint and the provider's AFTR, then generalized by RFC 7335 for other IPv4 continuity mechanisms over IPv6."),
  entry(4, "v4-dummy", ["192.0.0.8/32"], "IPv4 dummy address", ["RFC 7600"], [T, F, F, F, F],
    "A placeholder source for ICMPv4 messages sent by a node that has no IPv4 address of its own. Never valid as a destination."),
  entry(4, "v4-pcp-anycast", ["192.0.0.9/32"], "Port Control Protocol Anycast", ["RFC 7723"], [T, T, T, T, F],
    "Anycast address where a client can reach a Port Control Protocol server without being configured with one."),
  entry(4, "v4-turn-anycast", ["192.0.0.10/32"], "Traversal Using Relays around NAT Anycast", ["RFC 8155"], [T, T, T, T, F],
    "Anycast address for discovering a TURN relay server, the relay used when direct NAT traversal fails."),
  entry(4, "v4-nat64-discovery", ["192.0.0.170/32", "192.0.0.171/32"], "NAT64/DNS64 Discovery", ["RFC 8880", "RFC 7050 section 2.2"], [F, F, F, F, T],
    "The addresses ipv4only.arpa resolves to. A host behind DNS64 asks for the AAAA record of that name, and the synthesized answer reveals the NAT64 prefix in use. They are a marker, not a destination."),
  entry(4, "v4-test-net-1", ["192.0.2.0/24"], "Documentation (TEST-NET-1)", ["RFC 5737"], [F, F, F, F, F],
    "Reserved for examples in documentation. It is never routed, so an example cannot point at someone's real host. Seeing it in live traffic means a sample configuration was copied without being edited."),
  entry(4, "v4-as112-dname", ["192.31.196.0/24"], "AS112-v4", ["RFC 7535"], [T, T, T, T, F],
    "Anycast block for the AS112 DNAME redirection service, which absorbs reverse lookups for private and other non-unique space that leaked out of networks that should have answered them locally."),
  entry(4, "v4-amt", ["192.52.193.0/24"], "AMT", ["RFC 7450"], [T, T, T, T, F],
    "Relay discovery for Automatic Multicast Tunneling, which lets hosts on unicast-only networks receive multicast."),
  entry(4, "v4-6to4-relay", ["192.88.99.0/24"], "Deprecated (6to4 Relay Anycast)", ["RFC 7526"], NONE,
    "Formerly the anycast address of 6to4 relays. RFC 7526 deprecated anycast 6to4 after experience showed it unsuitable for widespread use, and the registry no longer gives this block attributes.",
    { deprecated: true }),
  entry(4, "v4-6a44", ["192.88.99.2/32"], "6a44-relay anycast address", ["RFC 6751"], [T, T, T, F, F],
    "Anycast address of 6a44 relays, a mechanism that gives IPv6 to hosts sitting behind an IPv4 NAT."),
  entry(4, "v4-private-192", ["192.168.0.0/16"], "Private-Use", ["RFC 1918"], [T, T, T, F, F],
    "RFC 1918 private space, and the block most home routers use. Not globally reachable: it reaches the internet only through NAT."),
  entry(4, "v4-as112-direct", ["192.175.48.0/24"], "Direct Delegation AS112 Service", ["RFC 7534"], [T, T, T, T, F],
    "The original AS112 block: anycast name servers that answer reverse lookups for RFC 1918 space with a negative answer, so queries that leak out of private networks are absorbed by a nearby node."),
  entry(4, "v4-benchmarking", ["198.18.0.0/15"], "Benchmarking", ["RFC 2544"], [T, T, T, F, F],
    "For testing network devices in a lab. Not globally reachable. It spans 198.18.0.0 to 198.19.255.255, and it is sometimes borrowed for internal addressing because it rarely collides with anything, which is outside its purpose."),
  entry(4, "v4-test-net-2", ["198.51.100.0/24"], "Documentation (TEST-NET-2)", ["RFC 5737"], [F, F, F, F, F],
    "Reserved for examples in documentation, alongside 192.0.2.0/24 and 203.0.113.0/24. Never routed."),
  entry(4, "v4-test-net-3", ["203.0.113.0/24"], "Documentation (TEST-NET-3)", ["RFC 5737"], [F, F, F, F, F],
    "Reserved for examples in documentation, alongside 192.0.2.0/24 and 198.51.100.0/24. Never routed."),
  entry(4, "v4-reserved", ["240.0.0.0/4"], "Reserved", ["RFC 1112 section 4"], [F, F, F, F, T],
    "The former class E space, reserved for future addressing modes by RFC 1112. Support for using it is inconsistent across operating systems and network equipment, and it has never been reassigned."),
  entry(4, "v4-limited-broadcast", ["255.255.255.255/32"], "Limited Broadcast", ["RFC 8190", "RFC 919 section 7"], [F, T, F, F, T],
    "Delivered to every host on the local link and never forwarded by a router. Valid only as a destination."),
];

/** Related IPv4 blocks from the IPv4 Multicast Address Space registry. No attribute columns there. */
export const IPV4_RELATED: SpecialEntry[] = [
  entry(4, "v4-multicast", ["224.0.0.0/4"], "Multicast", ["RFC 5771"], NONE,
    "Class D. Delivered to every host that has joined the group, and only ever a destination address. Assigned through the separate IPv4 Multicast Address Space registry.",
    { registry: "multicast" }),
  entry(4, "v4-mcast-local", ["224.0.0.0/24"], "Local Network Control Block", ["RFC 5771"], NONE,
    "Link-local multicast for routing and discovery protocols. Routers do not forward it off the link, whatever the TTL.",
    { registry: "multicast" }),
  entry(4, "v4-mcast-ssm", ["232.0.0.0/8"], "Source-Specific Multicast", ["RFC 4607"], NONE,
    "A receiver subscribes to a (source, group) pair rather than to anyone sending to the group.",
    { registry: "multicast" }),
  entry(4, "v4-mcast-test-net", ["233.252.0.0/24"], "MCAST-TEST-NET (documentation)", ["RFC 5771", "RFC 6676"], NONE,
    "Multicast addresses reserved for documentation and example code.",
    { registry: "multicast" }),
  entry(4, "v4-mcast-admin", ["239.0.0.0/8"], "Administratively Scoped", ["RFC 2365"], NONE,
    "The multicast counterpart of private space: used inside an organization and filtered at its boundary.",
    { registry: "multicast" }),
];

/** IANA IPv6 Special-Purpose Address Registry, in registry order. */
export const IPV6_SPECIAL: SpecialEntry[] = [
  entry(6, "v6-loopback", ["::1/128"], "Loopback Address", ["RFC 4291"], [F, F, F, F, T],
    "The single IPv6 loopback address. Unlike IPv4 there is exactly one, not a whole block."),
  entry(6, "v6-unspecified", ["::/128"], "Unspecified Address", ["RFC 4291"], [T, F, F, F, T],
    "All zeros. A host that has no address yet uses it as the source, for example during duplicate address detection. Never a destination, and never assigned to an interface."),
  entry(6, "v6-mapped", ["::ffff:0:0/96"], "IPv4-mapped Address", ["RFC 4291"], [F, F, F, F, T],
    "Represents an IPv4 address inside the IPv6 sockets API, so one dual-stack socket can accept IPv4 connections. The registry marks it invalid as a source or a destination, so it should never appear in a packet. A filter that only checks the IPv4 form can be bypassed by writing ::ffff:127.0.0.1."),
  entry(6, "v6-nat64-wkp", ["64:ff9b::/96"], "IPv4-IPv6 Translation", ["RFC 6052"], [T, T, T, T, F],
    "The well-known NAT64 prefix. An IPv6-only host reaches IPv4 address a.b.c.d at 64:ff9b::a.b.c.d through a NAT64 gateway. RFC 6052 section 3.1 forbids using it to represent non-global IPv4 addresses such as RFC 1918 space."),
  entry(6, "v6-nat64-local", ["64:ff9b:1::/48"], "Local-Use IPv4/IPv6 Translation", ["RFC 8215"], [T, T, T, F, F],
    "Reserved for translation inside one network. Unlike the well-known prefix it is not globally reachable, and an operator can carve sub-prefixes from it for different translation mechanisms."),
  entry(6, "v6-discard", ["100::/64"], "Discard-Only Address Block", ["RFC 6666"], [T, T, T, F, F],
    "For remotely triggered black hole routing: traffic routed here is meant to be dropped, so operators have a prefix that is known to go nowhere."),
  entry(6, "v6-ietf", ["2001::/23"], "IETF Protocol Assignments", ["RFC 2928"], [F, F, F, F, F],
    "Held by the IETF for protocol assignments. Not usable unless a more specific entry assigns the address.",
    { footnote: MORE_SPECIFIC_FOOTNOTE }),
  entry(6, "v6-teredo", ["2001::/32"], "TEREDO", ["RFC 4380", "RFC 8190"], [T, T, T, NA, F],
    "Teredo tunnels IPv6 inside UDP over IPv4 so hosts behind NAT can reach IPv6. The address carries the Teredo server's IPv4 address in the clear, and the client's public IPv4 address and port with every bit inverted.",
    { footnote: "Globally reachable is N/A in the registry; see RFC 4380 section 5." }),
  entry(6, "v6-pcp-anycast", ["2001:1::1/128"], "Port Control Protocol Anycast", ["RFC 7723"], [T, T, T, T, F],
    "Anycast address where a client can reach a Port Control Protocol server without being configured with one."),
  entry(6, "v6-turn-anycast", ["2001:1::2/128"], "Traversal Using Relays around NAT Anycast", ["RFC 8155"], [T, T, T, T, F],
    "Anycast address for discovering a TURN relay server."),
  entry(6, "v6-srp-anycast", ["2001:1::3/128"], "DNS-SD Service Registration Protocol Anycast", ["RFC 9665"], [T, T, T, T, F],
    "Anycast address for reaching a DNS-SD Service Registration Protocol server."),
  entry(6, "v6-benchmarking", ["2001:2::/48"], "Benchmarking", ["RFC 5180"], [T, T, T, F, F],
    "The IPv6 counterpart of 198.18.0.0/15, for testing network devices in a lab."),
  entry(6, "v6-amt", ["2001:3::/32"], "AMT", ["RFC 7450"], [T, T, T, T, F],
    "Relay discovery for Automatic Multicast Tunneling."),
  entry(6, "v6-as112", ["2001:4:112::/48"], "AS112-v6", ["RFC 7535"], [T, T, T, T, F],
    "The IPv6 block of the AS112 DNAME redirection service."),
  entry(6, "v6-orchid", ["2001:10::/28"], "Deprecated (previously ORCHID)", ["RFC 4843"], NONE,
    "The first ORCHID block. Replaced by ORCHIDv2 at 2001:20::/28, and the registry no longer gives it attributes.",
    { deprecated: true }),
  entry(6, "v6-orchidv2", ["2001:20::/28"], "ORCHIDv2", ["RFC 7343"], [T, T, T, T, F],
    "Overlay Routable Cryptographic Hash Identifiers: values derived from a hash of a public key, used by the Host Identity Protocol as stable identifiers in the address format."),
  entry(6, "v6-det", ["2001:30::/28"], "Drone Remote ID Protocol Entity Tags (DETs) Prefix", ["RFC 9374"], [T, T, T, T, F],
    "Identifiers for unmanned aircraft under the Drone Remote ID Protocol, built on the ORCHIDv2 format."),
  entry(6, "v6-documentation", ["2001:db8::/32"], "Documentation", ["RFC 3849"], [F, F, F, F, F],
    "Reserved for examples in documentation. Never routed."),
  entry(6, "v6-6to4", ["2002::/16"], "6to4", ["RFC 3056"], [T, T, T, NA, F],
    "Automatic tunneling of IPv6 over IPv4. The 32 bits after 2002: are the site's public IPv4 address. Its anycast relay mode was deprecated by RFC 7526.",
    { footnote: "Globally reachable is N/A in the registry; see RFC 3056." }),
  entry(6, "v6-as112-direct", ["2620:4f:8000::/48"], "Direct Delegation AS112 Service", ["RFC 7534"], [T, T, T, T, F],
    "The IPv6 block of the original AS112 service, which answers reverse lookups for private space with a negative answer."),
  entry(6, "v6-documentation-3fff", ["3fff::/20"], "Documentation", ["RFC 9637"], [F, F, F, F, F],
    "A second, larger documentation prefix, big enough to show realistic multi-site addressing plans that do not fit in 2001:db8::/32."),
  entry(6, "v6-srv6", ["5f00::/16"], "Segment Routing (SRv6) SIDs", ["RFC 9602"], [T, T, T, F, F],
    "Segment Routing over IPv6 segment identifiers. They look like addresses but name instructions inside one SRv6 domain, and should be filtered at its edge."),
  entry(6, "v6-ula", ["fc00::/7"], "Unique-Local", ["RFC 4193", "RFC 8190"], [T, T, T, F, F],
    "Unique local addresses, the closest IPv6 analog to RFC 1918. In practice only fd00::/8 is used: a site picks a random 40-bit Global ID so two networks that later merge are unlikely to collide.",
    { footnote: "Drawn from the global unicast range but specified as not globally routed; see RFC 4193." }),
  entry(6, "v6-link-local", ["fe80::/10"], "Link-Local Unicast", ["RFC 4291"], [T, T, F, F, T],
    "Every IPv6 interface has one, formed automatically. Valid only on its own link and never forwarded. The same address can exist on every interface, so using one needs a zone ID such as fe80::1%eth0."),
];

/** Related IPv6 blocks from the IPv6 Address Space registry. No attribute columns there. */
export const IPV6_RELATED: SpecialEntry[] = [
  entry(6, "v6-site-local", ["fec0::/10"], "Site-Local (deprecated)", ["RFC 3879"], NONE,
    "The original private IPv6 space. RFC 3879 deprecated it because a site was never well defined; unique local addresses replaced it.",
    { registry: "address-space", deprecated: true }),
  entry(6, "v6-multicast", ["ff00::/8"], "Multicast", ["RFC 4291 section 2.7"], NONE,
    "One-to-many delivery. IPv6 has no broadcast: neighbor discovery and the other jobs broadcast did in IPv4 use multicast groups. The fourth hex digit is the scope.",
    { registry: "address-space" }),
];

export const REGISTRY: Record<Family, { special: SpecialEntry[]; related: SpecialEntry[] }> = {
  4: { special: IPV4_SPECIAL, related: IPV4_RELATED },
  6: { special: IPV6_SPECIAL, related: IPV6_RELATED },
};

/* ------------------------------------------------------- classification */

export interface Match {
  entry: SpecialEntry;
  block: Block;
}

export interface Embedded {
  label: string;
  ipv4: string;
  /** The embedded address's own special-purpose entry, or null for ordinary unicast. */
  classifiedAs: string | null;
  globallyReachable: Attr;
  port: number | null;
}

export interface Classification {
  family: Family;
  canonical: string;
  expanded: string;
  /** Every entry containing the address, most specific first. */
  matches: Match[];
  /** The most specific special-purpose registry entry, if any. */
  primary: Match | null;
  /** The most specific related (non special-purpose) entry, if any. */
  related: Match | null;
  /** What to say when no special-purpose entry applies. */
  fallback: { title: string; text: string } | null;
  wellKnown: string | null;
  embedded: Embedded[];
  details: { label: string; value: string }[];
  notes: string[];
}

function matchesIn(entries: SpecialEntry[], family: Family, value: bigint): Match[] {
  const out: Match[] = [];
  for (const e of entries) {
    for (const block of e.blocks) {
      if (inBlock(family, value, block.network, block.length)) {
        out.push({ entry: e, block });
        break;
      }
    }
  }
  return out.sort((a, b) => b.block.length - a.block.length);
}

/** ff02::1:ff00:0, the solicited-node multicast prefix. */
const SOLICITED_NODE = (0xff02n << 112n) | (0x1ff00n << 16n);

/** Specific IPv4 addresses worth naming: multicast groups from the IANA registry, and two unicast conventions. */
const V4_WELL_KNOWN: Record<string, string> = {
  "224.0.0.1": "All Systems on this subnet",
  "224.0.0.2": "All Routers on this subnet",
  "224.0.0.5": "OSPF AllSPFRouters (RFC 2328)",
  "224.0.0.6": "OSPF AllDRouters (RFC 2328)",
  "224.0.0.9": "RIPv2 routers (RFC 2453)",
  "224.0.0.13": "All PIM routers (RFC 7761)",
  "224.0.0.18": "VRRP (RFC 5798)",
  "224.0.0.22": "IGMPv3 reports (RFC 3376)",
  "224.0.0.251": "Multicast DNS (RFC 6762)",
  "224.0.0.252": "LLMNR (RFC 4795)",
  "169.254.169.254": "Instance metadata service on major cloud platforms",
  "127.0.0.1": "The conventional loopback address, usually named localhost",
};

/** Specific IPv6 multicast groups, from the IANA IPv6 multicast registry. */
const V6_WELL_KNOWN: Record<string, string> = {
  "ff02::1": "All nodes on the link (RFC 4291)",
  "ff02::2": "All routers on the link (RFC 4291)",
  "ff02::5": "OSPFv3 AllSPFRouters (RFC 5340)",
  "ff02::6": "OSPFv3 AllDRouters (RFC 5340)",
  "ff02::9": "RIPng routers (RFC 2080)",
  "ff02::16": "All MLDv2-capable routers (RFC 3810)",
  "ff02::fb": "Multicast DNS (RFC 6762)",
  "ff02::1:2": "All DHCP relay agents and servers (RFC 8415)",
  "ff05::1:3": "All DHCP servers, site scope (RFC 8415)",
};

/** RFC 4291 section 2.7 and RFC 7346 multicast scope values. */
const V6_SCOPES: Record<number, string> = {
  0x0: "reserved",
  0x1: "interface-local",
  0x2: "link-local",
  0x3: "realm-local",
  0x4: "admin-local",
  0x5: "site-local",
  0x8: "organization-local",
  0xe: "global",
  0xf: "reserved",
};

function hex(value: bigint, digits: number): string {
  return value.toString(16).padStart(digits, "0");
}

function embeddedV4(label: string, v4: bigint, port: number | null = null): Embedded {
  const inner = classify({ family: 4, value: v4, zoneId: null });
  return {
    label,
    ipv4: formatIPv4(v4),
    classifiedAs: inner.primary ? inner.primary.entry.name : inner.related ? inner.related.entry.name : null,
    globallyReachable: inner.primary ? inner.primary.entry.attrs.globallyReachable : inner.related ? null : true,
    port,
  };
}

export function classify(ip: IpAddress): Classification {
  const { family, value } = ip;
  const special = matchesIn(REGISTRY[family].special, family, value);
  const related = matchesIn(REGISTRY[family].related, family, value);
  const matches = [...special, ...related].sort((a, b) => b.block.length - a.block.length);
  const canonical = formatIp(family, value);
  const result: Classification = {
    family,
    canonical,
    expanded: family === 4 ? canonical : formatIPv6Full(value),
    matches,
    primary: special[0] ?? null,
    related: related[0] ?? null,
    fallback: null,
    wellKnown: (family === 4 ? V4_WELL_KNOWN : V6_WELL_KNOWN)[canonical] ?? null,
    embedded: [],
    details: [],
    notes: [],
  };

  if (family === 4) {
    // The same address in the forms inet_aton also accepts. A blocklist that
    // compares strings misses these, which is the point of showing them.
    result.details.push({ label: "As one integer", value: value.toString() });
    result.details.push({ label: "As hex", value: `0x${hex(value, 8)}` });
    if (!result.primary && !result.related) {
      result.fallback = {
        title: "Global unicast",
        text: "Not in any special-purpose block. This is ordinary unicast space, and since the IANA free pool ran out in 2011 all of it has been allocated, to the regional internet registries or, historically, directly to organizations. Whether this address is announced and reachable right now is a routing question the registry cannot answer.",
      };
    }
    return result;
  }

  // IPv6 from here on.
  const has = (id: string) => special.some((m) => m.entry.id === id) || related.some((m) => m.entry.id === id);

  if (!result.primary && !result.related) {
    const global = inBlock(6, value, 0x2000n << 112n, 3);
    result.fallback = global
      ? {
          title: "Global unicast (2000::/3)",
          text: "Not in any special-purpose block. IANA allocates 2000::/3 to the regional internet registries; whether this particular address is allocated and routed is not something the registry can tell you.",
        }
      : {
          title: "Reserved by the IETF",
          text: "Not in any special-purpose block, and outside the ranges allocated for use: global unicast 2000::/3, unique local fc00::/7, link-local fe80::/10 and multicast ff00::/8. The IPv6 Address Space registry lists the rest of the space as reserved by the IETF.",
        };
  }

  if (has("v6-mapped")) {
    result.embedded.push(embeddedV4("IPv4-mapped address", value & 0xffffffffn));
  }
  if (has("v6-nat64-wkp")) {
    const e = embeddedV4("Translated IPv4 address (RFC 6052, /96)", value & 0xffffffffn);
    result.embedded.push(e);
    if (e.globallyReachable === false) {
      result.notes.push(
        `The embedded address ${e.ipv4} is ${e.classifiedAs}, which is not globally reachable. RFC 6052 section 3.1 says the well-known prefix must not be used to represent non-global IPv4 addresses.`,
      );
    }
  }
  if (has("v6-6to4")) {
    result.embedded.push(embeddedV4("6to4 site address", (value >> 80n) & 0xffffffffn));
  }
  if (has("v6-teredo")) {
    // RFC 4380 section 4: prefix(32) | server IPv4(32) | flags(16) | ~port(16) | ~client IPv4(32)
    const server = (value >> 64n) & 0xffffffffn;
    const flags = (value >> 48n) & 0xffffn;
    const port = Number(~(value >> 32n) & 0xffffn);
    const client = ~value & 0xffffffffn;
    result.embedded.push(embeddedV4("Teredo server", server));
    result.embedded.push(embeddedV4("Teredo client (public mapping)", client, port));
    result.details.push({ label: "Teredo flags", value: `0x${hex(flags, 4)}${flags & 0x8000n ? " (cone bit set)" : ""}` });
  }
  if (has("v6-ula")) {
    const lBit = (value >> 120n) & 1n;
    if (lBit === 0n) {
      result.notes.push(
        "The L bit is 0, so this is in fc00::/8. RFC 4193 only defines L = 1 (fd00::/8) for locally assigned prefixes and leaves fc00::/8 for a future definition, so addresses here should not be in use.",
      );
    } else {
      result.details.push({ label: "Global ID (40 bits)", value: hex((value >> 80n) & 0xffffffffffn, 10) });
      result.details.push({ label: "Subnet ID (16 bits)", value: hex((value >> 64n) & 0xffffn, 4) });
      result.details.push({ label: "Interface ID (64 bits)", value: hex(value & 0xffffffffffffffffn, 16) });
    }
  }
  if (has("v6-link-local")) {
    // RFC 4291 section 2.5.6: 10 prefix bits, then 54 zero bits, then the interface ID.
    if (((value >> 64n) & ((1n << 54n) - 1n)) !== 0n) {
      result.notes.push(
        "RFC 4291 section 2.5.6 requires the 54 bits after fe80::/10 to be zero, so link-local addresses in use all sit in fe80::/64. This one does not.",
      );
    }
    if (ip.zoneId === null) {
      result.notes.push(
        "No zone ID. On a host with more than one interface a link-local address is ambiguous until you say which link, for example fe80::1%eth0 (RFC 4007).",
      );
    }
  }
  if (ip.zoneId !== null) {
    result.details.push({ label: "Zone ID", value: `%${ip.zoneId}` });
    if (!has("v6-link-local") && !has("v6-multicast")) {
      result.notes.push("A zone ID only means something for non-global scopes such as link-local; it is ignored for this address.");
    }
  }
  if (has("v6-multicast")) {
    const flags = Number((value >> 116n) & 0xfn);
    const scope = Number((value >> 112n) & 0xfn);
    const flagNames: string[] = [];
    if (flags & 0x8) flagNames.push("high bit set (reserved, must be 0)");
    if (flags & 0x4) flagNames.push("R: embedded rendezvous point (RFC 3956)");
    if (flags & 0x2) flagNames.push("P: unicast-prefix-based (RFC 3306)");
    flagNames.push(flags & 0x1 ? "T: transient, not IANA-assigned" : "T clear: permanently assigned by IANA");
    result.details.push({ label: "Scope", value: `${scope.toString(16)} (${V6_SCOPES[scope] ?? "unassigned"})` });
    result.details.push({ label: "Flags", value: flagNames.join("; ") });
    // ff02::1:ff00:0/104, RFC 4291 section 2.7.1
    if (inBlock(6, value, SOLICITED_NODE, 104)) {
      result.wellKnown = `Solicited-node group for any unicast address ending in ${hex((value >> 16n) & 0xffn, 2)}:${hex(value & 0xffffn, 4)} (RFC 4291 section 2.7.1). Neighbor discovery sends address resolution here instead of broadcasting.`;
    }
  }
  return result;
}

/** One sentence per attribute, for the plain-English summary. */
export function attributeSentences(attrs: Attributes): string[] {
  const out: string[] = [];
  const s = (v: Attr, yes: string, no: string) => {
    if (v === true) out.push(yes);
    else if (v === false) out.push(no);
  };
  s(attrs.source, "Valid as a source address.", "Not valid as a source address.");
  s(attrs.destination, "Valid as a destination address.", "Not valid as a destination address.");
  s(attrs.forwardable, "Routers may forward packets addressed to it.", "Routers must not forward packets addressed to it.");
  s(
    attrs.globallyReachable,
    "Globally reachable: packets to it may leave the network they started in.",
    "Not globally reachable: packets to it must stay inside one administrative domain.",
  );
  s(attrs.reservedByProtocol, "Reserved by the protocol itself, so every IP stack must handle it specially.", "");
  return out.filter((x) => x !== "");
}

/**
 * An address whose most specific match is this entry, for the "look it up"
 * links in the table. The first address of an outer block often belongs to a
 * nested one (0.0.0.0 is "this host", not "this network"), so a few
 * positions inside the block are tried in turn and the first that lands on
 * the entry itself wins. Falls back to the network address.
 */
export function sampleAddress(entry: SpecialEntry, block: Block): bigint {
  const host = BigInt(familyBits(entry.family) - block.length);
  const size = 1n << host;
  const candidates = [0n, 1n, size / 4n, (size / 4n) * 3n, size - 1n].filter((c) => c < size);
  for (const offset of candidates) {
    const value = block.network + offset;
    const c = classify({ family: entry.family, value, zoneId: null });
    const top = c.primary ?? c.related;
    if (top && top.entry.id === entry.id) return value;
  }
  return block.network;
}
