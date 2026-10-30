/**
 * tcpdump capture filter builder, as pure functions.
 *
 * The output language is the libpcap filter syntax documented in
 * pcap-filter(7). Two of its rules shape everything here:
 *
 *   - "Negation has highest precedence. Alternation and concatenation have
 *     equal precedence and associate left to right." So `a or b and c` means
 *     `(a or b) and c`, which is not how most languages, Wireshark's display
 *     filters included, read the same words. The builder emits explicit
 *     parentheses wherever the joiner changes, so both outputs group
 *     identically and neither depends on a precedence rule.
 *   - Byte offsets such as tcp[13] are only valid for IPv4 in libpcap, and
 *     the first `vlan` keyword shifts every later offset by four bytes.
 *
 * Every value that reaches a filter string is validated first, so nothing
 * typed into a field can inject syntax, a quote or a shell metacharacter.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_CLAUSES = 20;
/** tcpdump's default and maximum snapshot length. */
export const MAX_SNAPLEN = 262144;
/** Largest value accepted for -c and for packet length tests. */
export const MAX_COUNT = 2147483647;

/* ------------------------------------------------------------ addresses */

export function parseIPv4(text: string): Parsed<number> {
  const s = text.trim();
  const parts = s.split(".");
  if (parts.length !== 4) return { ok: false, error: `An IPv4 address has four dot separated parts; "${s}" has ${parts.length}.` };
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) {
      return { ok: false, error: `"${part}" is not a number from 0 to 255.` };
    }
    if (part.length > 1 && part[0] === "0") {
      return { ok: false, error: `"${part}" has a leading zero, which some parsers read as octal. Write it without one.` };
    }
    value = value * 256 + Number(part);
  }
  return { ok: true, value: value >>> 0 };
}

export function formatIPv4(value: number): string {
  const v = value >>> 0;
  return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].join(".");
}

function maskV4(prefix: number): number {
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

const ALL_128 = (1n << 128n) - 1n;

/** RFC 4291 section 2.2 text forms, including :: and a dotted IPv4 tail. */
export function parseIPv6(text: string): Parsed<bigint> {
  const s = text.trim();
  if (s.includes("%")) {
    return { ok: false, error: "A zone index such as %eth0 is not part of the address. Remove it; the interface comes from -i." };
  }
  if (s.length > 45) return { ok: false, error: "That is too long to be an IPv6 address." };
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return { ok: false, error: "An IPv6 address uses only hex digits, colons and, in a trailing IPv4 part, dots." };
  const halves = s.split("::");
  if (halves.length > 2) return { ok: false, error: "An IPv6 address may contain :: only once." };

  const toGroups = (part: string, allowV4Tail: boolean): number[] | string => {
    if (part === "") return [];
    const items = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.includes(".")) {
        if (!allowV4Tail || i !== items.length - 1) return "A dotted IPv4 part is only allowed at the end of an IPv6 address.";
        const v4 = parseIPv4(item);
        if (!v4.ok) return `The IPv4 tail is not valid: ${v4.error}`;
        out.push(v4.value >>> 16, v4.value & 0xffff);
      } else if (/^[0-9a-fA-F]{1,4}$/.test(item)) {
        out.push(parseInt(item, 16));
      } else {
        return item === "" ? "There is an empty group between colons. Use :: once to compress zeros." : `"${item}" is not a group of one to four hex digits.`;
      }
    }
    return out;
  };

  const head = toGroups(halves[0], halves.length === 1);
  if (typeof head === "string") return { ok: false, error: head };
  const tail = halves.length === 2 ? toGroups(halves[1], true) : [];
  if (typeof tail === "string") return { ok: false, error: tail };

  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return { ok: false, error: "With :: present there must be fewer than eight groups." };
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    if (head.length !== 8) return { ok: false, error: `A full IPv6 address has eight groups; this has ${head.length}. Use :: to compress zeros.` };
    groups = head;
  }
  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(g);
  return { ok: true, value };
}

/** RFC 5952 canonical text: lowercase, no leading zeros, longest zero run as ::. */
export function formatIPv6(value: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i -= 1) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));
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

function maskV6(prefix: number): bigint {
  if (prefix <= 0) return 0n;
  return ALL_128 ^ ((1n << BigInt(128 - prefix)) - 1n);
}

type Address =
  | { family: 4; text: string }
  | { family: 6; text: string }
  | { family: "name"; text: string };

/** Words the pcap lexer reads as syntax, so they cannot stand as a hostname. */
const PCAP_KEYWORDS = new Set([
  "and", "or", "not", "host", "net", "port", "portrange", "src", "dst", "ether", "ip", "ip6", "arp", "rarp",
  "tcp", "udp", "sctp", "icmp", "icmp6", "proto", "vlan", "mpls", "less", "greater", "len", "broadcast",
  "multicast", "gateway", "mask", "inbound", "outbound", "link", "igmp", "pim",
]);

export function parseAddress(text: string): Parsed<Address> {
  const s = text.trim();
  if (s === "") return { ok: false, error: "Enter an IPv4 address, an IPv6 address or a hostname." };
  if (s.includes(":")) {
    const v6 = parseIPv6(s);
    return v6.ok ? { ok: true, value: { family: 6, text: formatIPv6(v6.value) } } : v6;
  }
  if (/^[\d.]+$/.test(s)) {
    const v4 = parseIPv4(s);
    return v4.ok ? { ok: true, value: { family: 4, text: formatIPv4(v4.value) } } : v4;
  }
  const name = s.replace(/\.$/, "").toLowerCase();
  if (name.length > 253) return { ok: false, error: "A hostname is at most 253 characters." };
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  const labels = name.split(".");
  for (const l of labels) {
    if (!label.test(l)) {
      return {
        ok: false,
        error: `"${l || "(empty)"}" is not a valid hostname label: letters, digits and inner hyphens only, 1 to 63 characters.`,
      };
    }
  }
  if (PCAP_KEYWORDS.has(name)) {
    return { ok: false, error: `"${name}" is a filter keyword, so tcpdump would read it as syntax rather than a hostname.` };
  }
  return { ok: true, value: { family: "name", text: name } };
}

interface Network {
  family: 4 | 6;
  text: string;
  prefix: number;
  /** Size of the block, as a readable string. */
  size: string;
}

export function parseNetwork(text: string): Parsed<Network> {
  const s = text.trim();
  if (s === "") return { ok: false, error: "Enter a network in CIDR form, such as 10.0.0.0/8 or 2001:db8::/32." };
  const slash = s.indexOf("/");
  if (slash === -1) {
    return { ok: false, error: `Add a prefix length, for example ${s}/24. A single address belongs in a host clause.` };
  }
  const addrText = s.slice(0, slash);
  const prefixText = s.slice(slash + 1).trim();
  if (!/^\d{1,3}$/.test(prefixText)) return { ok: false, error: `"/${prefixText}" is not a prefix length.` };
  const prefix = Number(prefixText);
  if (addrText.includes(":")) {
    const v6 = parseIPv6(addrText);
    if (!v6.ok) return v6;
    if (prefix > 128) return { ok: false, error: `/${prefix} is not a valid IPv6 prefix length. It runs from /0 to /128.` };
    const network = v6.value & maskV6(prefix);
    if (network !== v6.value) {
      return {
        ok: false,
        error: `libpcap refuses a network with bits set past the prefix ("non-network bits set"). Did you mean ${formatIPv6(network)}/${prefix}?`,
      };
    }
    return { ok: true, value: { family: 6, text: `${formatIPv6(network)}/${prefix}`, prefix, size: `2^${128 - prefix} addresses` } };
  }
  const v4 = parseIPv4(addrText);
  if (!v4.ok) return v4;
  if (prefix > 32) return { ok: false, error: `/${prefix} is not a valid IPv4 prefix length. It runs from /0 to /32.` };
  const network = (v4.value & maskV4(prefix)) >>> 0;
  if (network !== v4.value) {
    return {
      ok: false,
      error: `libpcap refuses a network with bits set past the prefix ("non-network bits set"). Did you mean ${formatIPv4(network)}/${prefix}?`,
    };
  }
  const count = 2 ** (32 - prefix);
  return {
    ok: true,
    value: { family: 4, text: `${formatIPv4(network)}/${prefix}`, prefix, size: `${count.toLocaleString("en-US")} ${count === 1 ? "address" : "addresses"}` },
  };
}

function parseInteger(text: string, min: number, max: number, what: string): Parsed<number> {
  const s = text.trim();
  if (s === "") return { ok: false, error: `Enter ${what}.` };
  if (!/^\d+$/.test(s)) return { ok: false, error: `"${s}" is not a whole number.` };
  if (s.length > 10 || Number(s) > max || Number(s) < min) {
    return { ok: false, error: `${what[0].toUpperCase()}${what.slice(1)} runs from ${min} to ${max.toLocaleString("en-US")}.` };
  }
  return { ok: true, value: Number(s) };
}

function parsePort(text: string): Parsed<number> {
  if (/^\s*[a-z]/i.test(text)) {
    return {
      ok: false,
      error: "Use the port number. A name such as http is looked up in the services file of the capture host, and the display filter has no equivalent.",
    };
  }
  return parseInteger(text, 0, 65535, "a port number");
}

/* -------------------------------------------------------------- clauses */

export type ClauseKind = "host" | "net" | "port" | "portrange" | "proto" | "flags" | "length";
export type Direction = "any" | "src" | "dst";
export type Transport = "any" | "tcp" | "udp";
export type Proto = "tcp" | "udp" | "icmp" | "icmp6" | "arp" | "ip" | "ip6" | "vlan";
export type FlagKey = "syn" | "ack" | "fin" | "rst" | "psh" | "urg";
export type FlagState = "set" | "clear";

export const CLAUSE_KINDS: { id: ClauseKind; label: string }[] = [
  { id: "host", label: "Host" },
  { id: "net", label: "Network" },
  { id: "port", label: "Port" },
  { id: "portrange", label: "Port range" },
  { id: "proto", label: "Protocol" },
  { id: "flags", label: "TCP flags" },
  { id: "length", label: "Packet length" },
];

export const PROTOCOLS: { id: Proto; label: string; ws: string; phrase: string }[] = [
  { id: "tcp", label: "tcp", ws: "tcp", phrase: "TCP segments, over IPv4 or IPv6" },
  { id: "udp", label: "udp", ws: "udp", phrase: "UDP datagrams, over IPv4 or IPv6" },
  { id: "icmp", label: "icmp", ws: "icmp", phrase: "ICMP over IPv4 (ping, unreachable, time exceeded); IPv6 uses icmp6" },
  { id: "icmp6", label: "icmp6", ws: "icmpv6", phrase: "ICMPv6, which carries IPv6 ping as well as neighbor discovery and router advertisements" },
  { id: "arp", label: "arp", ws: "arp", phrase: "ARP frames, the IPv4 address to MAC lookups on a LAN" },
  { id: "ip", label: "ip", ws: "ip", phrase: "IPv4 packets (EtherType 0x0800)" },
  { id: "ip6", label: "ip6", ws: "ipv6", phrase: "IPv6 packets (EtherType 0x86DD)" },
  { id: "vlan", label: "vlan", ws: "vlan", phrase: "802.1Q VLAN tagged frames" },
];

/** RFC 9293 section 3.1: the flag bits of TCP header byte 13. */
export const TCP_FLAGS: { key: FlagKey; label: string; bpf: string; ws: string; bit: number }[] = [
  { key: "syn", label: "SYN", bpf: "tcp-syn", ws: "tcp.flags.syn", bit: 0x02 },
  { key: "ack", label: "ACK", bpf: "tcp-ack", ws: "tcp.flags.ack", bit: 0x10 },
  { key: "fin", label: "FIN", bpf: "tcp-fin", ws: "tcp.flags.fin", bit: 0x01 },
  { key: "rst", label: "RST", bpf: "tcp-rst", ws: "tcp.flags.reset", bit: 0x04 },
  { key: "psh", label: "PSH", bpf: "tcp-push", ws: "tcp.flags.push", bit: 0x08 },
  { key: "urg", label: "URG", bpf: "tcp-urg", ws: "tcp.flags.urg", bit: 0x20 },
];

export interface Clause {
  kind: ClauseKind;
  /** How this clause joins the expression before it. Ignored on the first. */
  join: "and" | "or";
  negate: boolean;
  dir: Direction;
  /** Address, network, port, range, VLAN id or length, depending on kind. */
  value: string;
  transport: Transport;
  proto: Proto;
  flags: Partial<Record<FlagKey, FlagState>>;
  lenOp: "ge" | "le";
}

export function newClause(kind: ClauseKind, patch: Partial<Clause> = {}): Clause {
  return {
    kind,
    join: "and",
    negate: false,
    dir: "any",
    value: "",
    transport: "any",
    proto: "tcp",
    flags: {},
    lenOp: "ge",
    ...patch,
  };
}

export interface Compiled {
  bpf: string;
  ws: string;
  /** The display filter needs parentheses when it sits next to another clause. */
  wsCompound: boolean;
  /** A relational test, which reads more clearly in parentheses after not. */
  relational: boolean;
  /** One sentence saying what the primitive matches. */
  text: string;
  /** Where the tcpdump primitive and the display filter disagree. */
  caveats: string[];
}

const DIR_WORDS: Record<Direction, string> = { any: "source or destination", src: "source", dst: "destination" };
const dirPrefix = (d: Direction) => (d === "any" ? "" : `${d} `);

function hexByte(n: number): string {
  return `0x${n.toString(16).padStart(2, "0")}`;
}

/** One clause, without negation or joining. */
function compileBare(c: Clause): Parsed<Omit<Compiled, "text"> & { phrase: string; detail: string }> {
  switch (c.kind) {
    case "host": {
      const a = parseAddress(c.value);
      if (!a.ok) return a;
      const { family, text } = a.value;
      const wsField = family === 6 ? "ipv6" : "ip";
      const wsName = c.dir === "any" ? "addr" : c.dir;
      const phrase =
        c.dir === "any" ? `packets to or from ${text}` : c.dir === "src" ? `packets sent from ${text}` : `packets sent to ${text}`;
      const caveats: string[] = [];
      let detail = "";
      if (family === 4) {
        detail = "For an IPv4 address tcpdump also matches ARP and RARP packets that carry it.";
        caveats.push(`tcpdump's host ${text} also matches ARP and RARP; ${wsField}.${wsName} only reads IPv4 headers.`);
      } else if (family === "name") {
        detail = "tcpdump resolves the name once, when it compiles the filter, and matches every address returned. -nn does not change that.";
        caveats.push(
          `Wireshark resolves ${text} when the display filter is applied and ip.${wsName} compares IPv4 only. For IPv6, use ipv6.${wsName}.`,
        );
      }
      return {
        ok: true,
        value: { bpf: `${dirPrefix(c.dir)}host ${text}`, ws: `${wsField}.${wsName} == ${text}`, wsCompound: false, relational: false, phrase, detail, caveats },
      };
    }
    case "net": {
      const n = parseNetwork(c.value);
      if (!n.ok) return n;
      const wsField = n.value.family === 6 ? "ipv6" : "ip";
      const wsName = c.dir === "any" ? "addr" : c.dir;
      const caveats =
        n.value.family === 4 ? [`tcpdump's net also matches ARP and RARP packets inside ${n.value.text}; ${wsField}.${wsName} does not.`] : [];
      return {
        ok: true,
        value: {
          bpf: `${dirPrefix(c.dir)}net ${n.value.text}`,
          ws: `${wsField}.${wsName} == ${n.value.text}`,
          wsCompound: false,
          relational: false,
          phrase: `packets whose ${DIR_WORDS[c.dir]} address is inside ${n.value.text}`,
          detail: `The block holds ${n.value.size}.`,
          caveats,
        },
      };
    }
    case "port":
    case "portrange": {
      let lo: number;
      let hi: number;
      if (c.kind === "port") {
        const p = parsePort(c.value);
        if (!p.ok) return p;
        lo = hi = p.value;
      } else {
        const m = c.value.trim().match(/^(\d{1,5})\s*-\s*(\d{1,5})$/);
        if (!m) return { ok: false, error: "Write the range as low-high, for example 6000-6010." };
        lo = Number(m[1]);
        hi = Number(m[2]);
        if (lo > 65535 || hi > 65535) return { ok: false, error: "Ports run from 0 to 65535." };
        if (lo > hi) return { ok: false, error: `The range starts at ${lo} and ends at ${hi}. Put the lower port first.` };
      }
      const keyword = c.kind === "port" ? `port ${lo}` : `portrange ${lo}-${hi}`;
      const bpf = `${c.transport === "any" ? "" : `${c.transport} `}${dirPrefix(c.dir)}${keyword}`;
      const field = c.dir === "any" ? "port" : c.dir === "src" ? "srcport" : "dstport";
      const test = c.kind === "port" ? `== ${lo}` : `in {${lo}..${hi}}`;
      const protos = c.transport === "any" ? ["tcp", "udp", "sctp"] : [c.transport];
      const ws = protos.map((p) => `${p}.${field} ${test}`).join(" || ");
      const who = c.transport === "any" ? "TCP, UDP or SCTP packets" : `${c.transport.toUpperCase()} packets`;
      const what = c.kind === "port" ? `port ${lo}` : `a port from ${lo} to ${hi} inclusive`;
      const detail =
        c.transport === "any"
          ? "Without a tcp or udp qualifier, tcpdump checks all three transports, so the display filter lists all three."
          : "";
      return {
        ok: true,
        value: {
          bpf,
          ws,
          wsCompound: protos.length > 1,
          relational: false,
          phrase: `${who} with ${DIR_WORDS[c.dir]} ${what}`,
          detail,
          caveats: [],
        },
      };
    }
    case "proto": {
      const meta = PROTOCOLS.find((p) => p.id === c.proto) ?? PROTOCOLS[0];
      const caveats: string[] = [];
      if (c.proto === "vlan") {
        const id = c.value.trim();
        const detail = "libpcap shifts its offsets by four bytes for everything after the first vlan keyword, so keep vlan at the start.";
        if (id === "") {
          return { ok: true, value: { bpf: "vlan", ws: "vlan", wsCompound: false, relational: false, phrase: meta.phrase, detail, caveats } };
        }
        const v = parseInteger(id, 0, 4095, "a VLAN id");
        if (!v.ok) return v;
        return {
          ok: true,
          value: {
            bpf: `vlan ${v.value}`,
            ws: `vlan.id == ${v.value}`,
            wsCompound: false,
            relational: false,
            phrase: `frames tagged with VLAN ${v.value}`,
            detail,
            caveats,
          },
        };
      }
      if (c.proto === "tcp" || c.proto === "udp") {
        caveats.push(
          `Wireshark's ${meta.ws} also matches the ${c.proto.toUpperCase()} header quoted inside an ICMP error message; tcpdump checks only the packet's own protocol field.`,
        );
      }
      return { ok: true, value: { bpf: c.proto, ws: meta.ws, wsCompound: false, relational: false, phrase: meta.phrase, detail: "", caveats } };
    }
    case "flags": {
      const set = TCP_FLAGS.filter((f) => c.flags[f.key] === "set");
      const clear = TCP_FLAGS.filter((f) => c.flags[f.key] === "clear");
      if (set.length === 0 && clear.length === 0) {
        return { ok: false, error: "Mark at least one flag as set or clear." };
      }
      const group = (fs: typeof TCP_FLAGS) => (fs.length === 1 ? fs[0].bpf : `(${fs.map((f) => f.bpf).join("|")})`);
      const all = [...set, ...clear];
      const mask = all.reduce((m, f) => m | f.bit, 0);
      const want = set.reduce((m, f) => m | f.bit, 0);
      let bpf: string;
      if (clear.length === 0 && set.length === 1) bpf = `tcp[tcpflags] & ${set[0].bpf} != 0`;
      else if (set.length === 0) bpf = `tcp[tcpflags] & ${group(clear)} == 0`;
      else bpf = `tcp[tcpflags] & ${group(all)} == ${group(set)}`;
      const ws = [...set.map((f) => `${f.ws} == 1`), ...clear.map((f) => `${f.ws} == 0`)].join(" && ");
      const parts: string[] = [];
      if (set.length) parts.push(`${set.map((f) => f.label).join(" and ")} set`);
      if (clear.length) parts.push(`${clear.map((f) => f.label).join(" and ")} clear`);
      return {
        ok: true,
        value: {
          bpf,
          ws,
          wsCompound: all.length > 1,
          relational: true,
          phrase: `TCP segments with ${parts.join(", ")}`,
          detail: `Reads the flags byte, offset 13 of the TCP header (tcp[13]), masks it with ${hexByte(mask)} and requires ${hexByte(want)}. Flags not mentioned can be anything.`,
          caveats: ["libpcap's tcp[] offsets only work for TCP over IPv4, so this primitive never matches IPv6. The Wireshark fields match both."],
        },
      };
    }
    case "length": {
      const n = parseInteger(c.value, 0, MAX_SNAPLEN, "a length in bytes");
      if (!n.ok) return n;
      const ge = c.lenOp === "ge";
      return {
        ok: true,
        value: {
          bpf: `${ge ? "greater" : "less"} ${n.value}`,
          ws: `frame.len ${ge ? ">=" : "<="} ${n.value}`,
          wsCompound: false,
          relational: false,
          phrase: `frames ${ge ? "of at least" : "of at most"} ${n.value} bytes on the wire`,
          detail: `${ge ? "greater" : "less"} is shorthand for len ${ge ? ">=" : "<="} ${n.value}. The length includes the link-layer header, 14 bytes on Ethernet.`,
          caveats: [],
        },
      };
    }
    default:
      return { ok: false, error: "Unknown clause type." };
  }
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function compileClause(c: Clause): Parsed<Compiled> {
  const bare = compileBare(c);
  if (!bare.ok) return bare;
  const b = bare.value;
  const sentence = c.negate ? `Everything except ${b.phrase}.` : `${upperFirst(b.phrase)}.`;
  const text = b.detail ? `${sentence} ${b.detail}` : sentence;
  if (!c.negate) return { ok: true, value: { bpf: b.bpf, ws: b.ws, wsCompound: b.wsCompound, relational: b.relational, text, caveats: b.caveats } };
  return {
    ok: true,
    value: {
      bpf: b.relational ? `not (${b.bpf})` : `not ${b.bpf}`,
      // !(x) rather than x != y: before Wireshark 3.6, ip.addr != a matched
      // any packet with some other address in either field.
      ws: `!(${b.ws})`,
      wsCompound: false,
      relational: false,
      text,
      caveats: b.caveats,
    },
  };
}

/* ---------------------------------------------------------------- build */

export interface BuiltItem {
  index: number;
  bpf: string;
  ws: string;
  text: string;
  caveats: string[];
}

export interface BuildResult {
  ok: boolean;
  bpf: string;
  wireshark: string;
  items: BuiltItem[];
  errors: { index: number; message: string }[];
  warnings: string[];
  /** True when parentheses were added to fix left to right grouping. */
  grouped: boolean;
  /** Input positions of clauses left out because their value is empty. */
  skipped: number[];
}

/** The protocol a clause pins the packet to, for contradiction checks. */
function impliedProtocol(c: Clause): string | null {
  if (c.negate) return null;
  if (c.kind === "flags") return "tcp";
  if ((c.kind === "port" || c.kind === "portrange") && c.transport !== "any") return c.transport;
  if (c.kind === "proto" && ["tcp", "udp", "icmp", "icmp6", "arp"].includes(c.proto)) return c.proto;
  return null;
}

/**
 * A clause whose value field is still empty. It is skipped rather than
 * reported, so adding a clause does not blank every output until it is
 * filled in. A protocol clause (whose VLAN id is optional) and a flags
 * clause have no free text value, so they are never blank.
 */
export function isBlankClause(c: Clause): boolean {
  return c.kind !== "proto" && c.kind !== "flags" && c.value.trim() === "";
}

export function buildFilter(clauses: Clause[]): BuildResult {
  const capped = clauses.slice(0, MAX_CLAUSES);
  const errors: { index: number; message: string }[] = [];
  const items: BuiltItem[] = [];
  const skipped: number[] = [];
  /** The clauses that take part, each with its position in the input. */
  const active: { c: Clause; index: number; x: Compiled }[] = [];
  capped.forEach((c, index) => {
    if (isBlankClause(c)) {
      skipped.push(index);
      return;
    }
    const r = compileClause(c);
    if (r.ok) {
      active.push({ c, index, x: r.value });
      items.push({ index, bpf: r.value.bpf, ws: r.value.ws, text: r.value.text, caveats: r.value.caveats });
    } else errors.push({ index, message: r.error });
  });
  const warnings: string[] = [];
  if (clauses.length > MAX_CLAUSES) warnings.push(`Only the first ${MAX_CLAUSES} clauses are used.`);
  if (errors.length) return { ok: false, bpf: "", wireshark: "", items, errors, warnings, grouped: false, skipped };

  let bpf = "";
  let ws = "";
  let prevJoin: "and" | "or" | null = null;
  let grouped = false;
  const wrap = (x: Compiled) => (x.wsCompound && active.length > 1 ? `(${x.ws})` : x.ws);
  active.forEach(({ c, x }, i) => {
    if (i === 0) {
      bpf = x.bpf;
      ws = wrap(x);
      return;
    }
    const join = c.join;
    if (prevJoin !== null && join !== prevJoin) {
      bpf = `(${bpf})`;
      ws = `(${ws})`;
      grouped = true;
    }
    bpf = `${bpf} ${join} ${x.bpf}`;
    ws = `${ws} ${join === "and" ? "&&" : "||"} ${wrap(x)}`;
    prevJoin = join;
  });

  const vlanAt = active.map(({ c }, i) => (c.kind === "proto" && c.proto === "vlan" ? i : -1)).filter((i) => i >= 0);
  if (vlanAt.length && vlanAt[0] !== 0) {
    warnings.push(
      "vlan is not the first clause. libpcap reads everything before it at untagged offsets and everything after it four bytes later, so put the vlan clause first.",
    );
  }
  if (vlanAt.length > 1) {
    warnings.push(
      "Each further vlan keyword matches one tag deeper (stacked QinQ tags), so vlan 10 or vlan 20 does not mean either VLAN. Capture with vlan alone and narrow in Wireshark, or run one capture per VLAN.",
    );
  }
  for (let i = 1; i < active.length; i += 1) {
    if (active[i].c.join === "or" && active[i].c.negate && active[i - 1].c.negate) {
      warnings.push(
        `Clauses ${active[i - 1].index + 1} and ${active[i].index + 1} are two exclusions joined by or, which matches almost everything: a packet only has to escape one of them. To exclude both, join them with and.`,
      );
    }
  }
  if (active.length > 1 && active.slice(1).every(({ c }) => c.join === "and")) {
    const protos = new Set(active.map(({ c }) => impliedProtocol(c)).filter((p): p is string => p !== null));
    if (protos.size > 1) {
      warnings.push(`No packet is both ${[...protos].join(" and ")}, so a filter that requires all of them captures nothing.`);
    }
  }
  return { ok: true, bpf, wireshark: ws, items, errors, warnings, grouped, skipped };
}

/* -------------------------------------------------------------- command */

export interface CommandOptions {
  sudo: boolean;
  iface: string;
  numeric: boolean;
  snaplen: string;
  count: string;
  file: string;
}

export interface CommandResult {
  command: string;
  parts: { token: string; text: string }[];
  errors: { field: keyof CommandOptions; message: string }[];
  warnings: string[];
}

/** Single quotes pass everything through a POSIX shell untouched. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function buildCommand(o: CommandOptions, filter: string): CommandResult {
  const errors: CommandResult["errors"] = [];
  const warnings: string[] = [];
  const tokens: string[] = [];
  const parts: CommandResult["parts"] = [];

  if (o.sudo) {
    tokens.push("sudo");
    parts.push({ token: "sudo", text: "Capturing needs root, or on Linux the CAP_NET_RAW and CAP_NET_ADMIN capabilities." });
  }
  tokens.push("tcpdump");

  const iface = o.iface.trim();
  if (iface !== "") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,63}$/.test(iface)) {
      errors.push({ field: "iface", message: "Interface names here may use letters, digits and . _ : @ - (run tcpdump -D to list them)." });
    } else {
      tokens.push("-i", iface);
      parts.push({
        token: `-i ${iface}`,
        text:
          iface === "any"
            ? "Capture on every interface at once (Linux). The any device uses a cooked link-layer header and does not put interfaces in promiscuous mode."
            : `Capture on ${iface}. tcpdump -D lists the interface names this host accepts.`,
      });
    }
  } else {
    parts.push({ token: "(no -i)", text: "Without -i, tcpdump picks the first interface that is up, skipping loopback." });
  }

  if (o.numeric) {
    tokens.push("-nn");
    parts.push({
      token: "-nn",
      text: "Print addresses and ports as numbers. Name lookups slow the output and their DNS queries can show up in the capture itself.",
    });
  }

  const snap = o.snaplen.trim();
  if (snap !== "") {
    const n = parseInteger(snap, 0, MAX_SNAPLEN, "the snapshot length");
    if (!n.ok) errors.push({ field: "snaplen", message: n.error });
    else {
      tokens.push("-s", String(n.value));
      parts.push({
        token: `-s ${n.value}`,
        text:
          n.value === 0
            ? `Snapshot length 0 means the default, ${MAX_SNAPLEN} bytes, which keeps whole packets.`
            : `Keep at most ${n.value} bytes of each packet. Small values keep the headers and drop payload, which shrinks files and avoids storing content you do not need.`,
      });
    }
  }

  const count = o.count.trim();
  if (count !== "") {
    const n = parseInteger(count, 1, MAX_COUNT, "the packet count");
    if (!n.ok) errors.push({ field: "count", message: n.error });
    else {
      tokens.push("-c", String(n.value));
      parts.push({ token: `-c ${n.value}`, text: `Exit after ${n.value} ${n.value === 1 ? "packet" : "packets"} that pass the filter.` });
    }
  }

  const file = o.file.trim();
  if (file !== "") {
    if (!/^[A-Za-z0-9._~/-]{1,255}$/.test(file) || file.startsWith("-")) {
      errors.push({ field: "file", message: "Use a plain file name or path: letters, digits and . _ ~ / -, not starting with a hyphen." });
    } else {
      tokens.push("-w", file);
      parts.push({
        token: `-w ${file}`,
        text: "Write raw packets to this file instead of decoding them on screen. Read it back with tcpdump -r or open it in Wireshark.",
      });
      if (/\.pcapng$/i.test(file)) {
        warnings.push("tcpdump writes the classic pcap format whatever the extension, so .pcap describes the file more accurately.");
      }
    }
  }

  if (filter !== "") {
    tokens.push(shellQuote(filter));
    parts.push({ token: "'filter'", text: "The capture filter, in single quotes so the shell passes parentheses and spaces through untouched." });
  } else {
    parts.push({ token: "(no filter)", text: "With no filter expression tcpdump captures every packet on the interface." });
  }

  return { command: errors.length ? "" : tokens.join(" "), parts, errors, warnings };
}

/* -------------------------------------------------------------- recipes */

export interface Recipe {
  id: string;
  label: string;
  clauses: Clause[];
}

export const RECIPES: Recipe[] = [
  {
    id: "dns",
    label: "DNS only",
    clauses: [newClause("port", { transport: "udp", value: "53" }), newClause("port", { transport: "tcp", value: "53", join: "or" })],
  },
  { id: "handshakes", label: "Handshakes (SYN, SYN-ACK)", clauses: [newClause("flags", { flags: { syn: "set" } })] },
  { id: "new-connections", label: "New connections (SYN only)", clauses: [newClause("flags", { flags: { syn: "set", ack: "clear" } })] },
  { id: "exclude-ssh", label: "Exclude SSH", clauses: [newClause("port", { transport: "tcp", value: "22", negate: true })] },
  { id: "resets", label: "Resets", clauses: [newClause("flags", { flags: { rst: "set" } })] },
  { id: "dhcp", label: "DHCP", clauses: [newClause("portrange", { transport: "udp", value: "67-68" })] },
  {
    id: "web-host",
    label: "Web traffic for one host",
    clauses: [
      newClause("port", { transport: "tcp", value: "80" }),
      newClause("port", { transport: "tcp", value: "443", join: "or" }),
      newClause("host", { value: "192.0.2.10", join: "and" }),
    ],
  },
  {
    id: "icmp",
    label: "ICMP and ICMPv6",
    clauses: [newClause("proto", { proto: "icmp" }), newClause("proto", { proto: "icmp6", join: "or" })],
  },
  { id: "arp", label: "ARP only", clauses: [newClause("proto", { proto: "arp" })] },
  { id: "large", label: "Large frames", clauses: [newClause("length", { value: "1400", lenOp: "ge" })] },
  {
    id: "vlan-host",
    label: "One VLAN, one host",
    clauses: [newClause("proto", { proto: "vlan", value: "20" }), newClause("host", { value: "192.0.2.10", join: "and" })],
  },
];
