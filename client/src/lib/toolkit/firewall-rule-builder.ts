/**
 * Host firewall rule builder, as pure functions.
 *
 * One rule specification is translated into four front ends for the same
 * kernel machinery (netfilter): iptables/ip6tables, nftables in an `inet`
 * table, ufw, and firewalld rich rules. The references are the man pages:
 * iptables(8) and iptables-extensions(8) for the conntrack, multiport,
 * comment, LOG and limit matches; nft(8) for rule expressions, anonymous
 * sets and the `th` transport header expression; ufw(8) for the extended
 * rule syntax; and firewalld.richlanguage(5) plus firewalld.policies(5) for
 * rich rules and the policy objects that cover output and forward traffic.
 *
 * Every value that reaches a command is validated first. Addresses are
 * parsed into numbers and printed back, ports are parsed into integers, and
 * names and free text are checked against a strict character set, so no
 * field can smuggle a quote, a shell metacharacter or extra rule syntax
 * into what the reader copies.
 */

/* ------------------------------------------------------------------ types */

export type Direction = "input" | "output" | "forward";
export type Action = "accept" | "drop" | "reject";
export type Protocol = "any" | "tcp" | "udp" | "tcpudp" | "icmp" | "icmpv6";
/** "established" means ESTABLISHED,RELATED, the pair every ruleset uses together. */
export type ConnState = "any" | "new" | "established" | "invalid";
export type Placement = "append" | "top";
export type Family = "ipv4" | "ipv6" | "both";
export type ToolId = "iptables" | "nftables" | "ufw" | "firewalld";

export interface RuleSpec {
  direction: Direction;
  action: Action;
  protocol: Protocol;
  /** Address or CIDR, empty or "any" for no match. */
  source: string;
  destination: string;
  /** Comma separated ports and ranges, for example "80,443,6000-6010". */
  sourcePorts: string;
  destPorts: string;
  /** Inbound interface, used by input and forward. */
  inIface: string;
  /** Outbound interface, used by output and forward. */
  outIface: string;
  state: ConnState;
  log: boolean;
  logPrefix: string;
  /** Rate limit the log lines to LOG_RATE so a flood cannot fill the disk. */
  logLimit: boolean;
  comment: string;
  placement: Placement;
  /** firewalld zone for input rules. */
  zone: string;
  sudo: boolean;
}

export const DEFAULT_RULE: RuleSpec = {
  direction: "input",
  action: "accept",
  protocol: "tcp",
  source: "10.0.10.0/24",
  destination: "",
  sourcePorts: "",
  destPorts: "22",
  inIface: "",
  outIface: "",
  state: "new",
  log: false,
  logPrefix: "",
  logLimit: true,
  comment: "SSH from management",
  placement: "append",
  zone: "public",
  sudo: true,
};

export type Field =
  | "source"
  | "destination"
  | "sourcePorts"
  | "destPorts"
  | "inIface"
  | "outIface"
  | "logPrefix"
  | "comment"
  | "zone"
  | "protocol";

export interface FieldError {
  field: Field;
  message: string;
}

export type Tone = "info" | "warn" | "danger";

export interface Warning {
  tone: Tone;
  text: string;
}

export interface ToolOutput {
  tool: ToolId;
  label: string;
  /** False when this front end cannot express the rule at all. */
  supported: boolean;
  /** Commands that create the rule, in the order they must run. */
  commands: string[];
  /** Commands that make the rule survive a reboot. */
  persist: string[];
  /** Caveats specific to this front end and this rule. */
  notes: string[];
}

export interface BuildResult {
  ok: boolean;
  errors: FieldError[];
  warnings: Warning[];
  family: Family;
  outputs: ToolOutput[];
}

/* ----------------------------------------------------------------- limits */

/** iptables multiport and ufw both stop at 15 ports, with a range counting as two. */
export const MAX_PORT_SLOTS = 15;
/** The kernel LOG target keeps 29 characters of prefix; one is the trailing space. */
export const MAX_LOG_PREFIX = 28;
/** nftables stores at most 128 bytes of comment; iptables allows 256. */
export const MAX_COMMENT = 128;
/** firewalld refuses zone and policy names longer than 17 characters. */
export const MAX_ZONE = 17;
/** Linux IFNAMSIZ is 16 bytes including the terminating NUL. */
export const MAX_IFACE = 15;
/** Upper bound on any single text field, so a pasted novel is rejected early. */
export const MAX_FIELD = 256;
export const LOG_RATE = { iptables: "5/min", nft: "5/minute", firewalld: "5/m" } as const;

/* -------------------------------------------------------------- addresses */

export interface Address {
  family: "ipv4" | "ipv6";
  /** Printed form, network address plus prefix, or a bare host address. */
  text: string;
  prefix: number;
  /** True when the input had host bits set and they were cleared. */
  normalized: boolean;
  /** True for ::ffff:0:0/96, which never appears in a packet on the wire. */
  mapped: boolean;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseV4(text: string): Parsed<number> {
  const parts = text.split(".");
  if (parts.length !== 4) {
    return { ok: false, error: `An IPv4 address has four dot separated numbers; "${text}" has ${parts.length}.` };
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) {
      return { ok: false, error: `"${part}" is not a number from 0 to 255.` };
    }
    if (part.length > 1 && part.startsWith("0")) {
      return { ok: false, error: `"${part}" has a leading zero, which some parsers read as octal. Write it without one.` };
    }
    value = value * 256 + Number(part);
  }
  return { ok: true, value };
}

function formatV4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

const ALL_128 = (1n << 128n) - 1n;

/** RFC 4291 section 2.2 text forms, including :: and a trailing dotted IPv4 part. */
function parseV6(text: string): Parsed<bigint> {
  if (text.includes("%")) {
    return { ok: false, error: "A zone index such as %eth0 is not part of an address. Remove it and use the interface field." };
  }
  if (!/^[0-9a-fA-F:.]+$/.test(text)) {
    return { ok: false, error: "An IPv6 address uses only hex digits, colons and, in a trailing IPv4 part, dots." };
  }
  const halves = text.split("::");
  if (halves.length > 2) return { ok: false, error: "An IPv6 address may contain :: only once." };

  const groupsOf = (part: string, last: boolean): number[] | string => {
    if (part === "") return [];
    const items = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.includes(".")) {
        if (!last || i !== items.length - 1) return "A dotted IPv4 part is only allowed at the end of an IPv6 address.";
        const v4 = parseV4(item);
        if (!v4.ok) return `The IPv4 part is not valid: ${v4.error}`;
        out.push(Math.floor(v4.value / 65536), v4.value % 65536);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(item)) return `"${item}" is not a group of one to four hex digits.`;
        out.push(parseInt(item, 16));
      }
    }
    return out;
  };

  const head = groupsOf(halves[0], halves.length === 1);
  if (typeof head === "string") return { ok: false, error: head };
  let groups: number[];
  if (halves.length === 2) {
    const tail = groupsOf(halves[1], true);
    if (typeof tail === "string") return { ok: false, error: tail };
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return { ok: false, error: "This address has too many groups to also contain ::." };
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) {
    return { ok: false, error: `A full IPv6 address has eight groups; this one has ${groups.length}. Use :: for a run of zeros.` };
  }
  let value = 0n;
  for (const g of groups) value = (value << 16n) | BigInt(g);
  return { ok: true, value };
}

/** RFC 5952: lowercase, no leading zeros, the longest run of two or more zero groups as ::. */
export function formatV6(value: bigint): string {
  const groups: number[] = [];
  for (let i = 7; i >= 0; i -= 1) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn));

  // RFC 5952 section 5: the IPv4-mapped block is written with a dotted tail.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `::ffff:${formatV4(groups[6] * 65536 + groups[7])}`;
  }

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

/** Parses "any", an address, or address/prefix. Host bits are cleared and reported. */
export function parseAddress(raw: string): Parsed<Address | null> {
  const text = raw.trim();
  if (text === "" || text.toLowerCase() === "any") return { ok: true, value: null };
  if (text.length > 64) return { ok: false, error: "That is too long to be an address or CIDR block." };
  if (/\s/.test(text)) return { ok: false, error: "One address or CIDR block per field, with no spaces." };
  if (text.includes(",")) {
    return { ok: false, error: "One address or CIDR block per rule. A list behaves differently in each tool, so write one rule per block." };
  }
  const slash = text.split("/");
  if (slash.length > 2) return { ok: false, error: "Only one / is allowed, between the address and the prefix length." };
  const [addrText, prefixText] = slash;
  const v6 = addrText.includes(":");
  const width = v6 ? 128 : 32;

  let prefix = width;
  if (prefixText !== undefined) {
    if (!/^\d{1,3}$/.test(prefixText) || (prefixText.length > 1 && prefixText.startsWith("0"))) {
      return { ok: false, error: `The prefix length after / must be a whole number from 0 to ${width}.` };
    }
    prefix = Number(prefixText);
    if (prefix > width) return { ok: false, error: `An ${v6 ? "IPv6" : "IPv4"} prefix length runs from 0 to ${width}, not ${prefix}.` };
  }

  if (v6) {
    const parsed = parseV6(addrText);
    if (!parsed.ok) return parsed;
    const mask = prefix === 0 ? 0n : (ALL_128 << BigInt(128 - prefix)) & ALL_128;
    const net = parsed.value & mask;
    const mapped = prefix >= 96 && net >> 32n === 0xffffn;
    return {
      ok: true,
      value: {
        family: "ipv6",
        text: prefix === 128 ? formatV6(net) : `${formatV6(net)}/${prefix}`,
        prefix,
        normalized: net !== parsed.value,
        mapped,
      },
    };
  }

  if (!/^[\d.]+$/.test(addrText)) {
    return { ok: false, error: "Use a numeric address. Host names are resolved once when the rule is loaded, which is rarely what anyone wants." };
  }
  const parsed = parseV4(addrText);
  if (!parsed.ok) return parsed;
  const size = 2 ** (32 - prefix);
  const net = Math.floor(parsed.value / size) * size;
  return {
    ok: true,
    value: {
      family: "ipv4",
      text: prefix === 32 ? formatV4(net) : `${formatV4(net)}/${prefix}`,
      prefix,
      normalized: net !== parsed.value,
      mapped: false,
    },
  };
}

/* ------------------------------------------------------------------ ports */

export interface PortItem {
  lo: number;
  hi: number;
}

export interface PortList {
  items: PortItem[];
  /** Slots in the iptables multiport sense: a single port is one, a range is two. */
  slots: number;
}

/** Parses "22", "80,443", "6000-6010" or "6000:6010" into validated port items. */
export function parsePorts(raw: string): Parsed<PortList | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (text.length > MAX_FIELD) return { ok: false, error: "That port list is too long." };
  const items: PortItem[] = [];
  const seen = new Set<string>();
  for (const piece of text.split(",")) {
    const item = piece.trim();
    if (item === "") return { ok: false, error: "There is an empty entry between two commas." };
    const m = /^(\d{1,5})(?:\s*[-:]\s*(\d{1,5}))?$/.exec(item);
    if (!m) return { ok: false, error: `"${item}" is not a port (443) or a range (6000-6010).` };
    const lo = Number(m[1]);
    const hi = m[2] === undefined ? lo : Number(m[2]);
    for (const n of [lo, hi]) {
      if (n < 1 || n > 65535) {
        return { ok: false, error: `${n} is outside the port range. Ports run from 1 to 65535; 0 is reserved.` };
      }
    }
    if (lo > hi) return { ok: false, error: `The range ${lo}-${hi} runs backwards. Write the lower port first.` };
    const key = `${lo}-${hi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ lo, hi });
  }
  const slots = items.reduce((n, p) => n + (p.lo === p.hi ? 1 : 2), 0);
  if (slots > MAX_PORT_SLOTS) {
    return {
      ok: false,
      error: `That list uses ${slots} slots. iptables multiport and ufw accept ${MAX_PORT_SLOTS} per rule, with a range counting as two. Split it across two rules.`,
    };
  }
  return { ok: true, value: { items, slots } };
}

/* ------------------------------------------------------------ text fields */

export function checkIface(raw: string): Parsed<string | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (/[+*]/.test(text)) {
    return {
      ok: false,
      error: "Wildcards differ between tools (eth+ in iptables, eth* in nftables, none in ufw), so this builder takes one exact interface name.",
    };
  }
  if (text.includes(":")) {
    return { ok: false, error: "An alias such as eth0:1 is a label on an address, not an interface netfilter can match. Use the parent device." };
  }
  if (text.length > MAX_IFACE) return { ok: false, error: `Linux interface names are at most ${MAX_IFACE} characters.` };
  if (!/^[A-Za-z0-9_.-]+$/.test(text) || text === "." || text === "..") {
    return { ok: false, error: "Use letters, digits, dot, hyphen and underscore only, as in eth0, ens3 or wg0." };
  }
  return { ok: true, value: text };
}

/** Printable ASCII without the characters that would need shell or rule escaping. */
const SAFE_TEXT = /^[\x20-\x7e]*$/;
const UNSAFE_CHARS = /["'`$!\\]/;

export function checkComment(raw: string): Parsed<string | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!SAFE_TEXT.test(text)) return { ok: false, error: "Keep the comment to plain ASCII text; some of these tools mangle anything else." };
  if (UNSAFE_CHARS.test(text)) {
    return { ok: false, error: "Leave out quotes, backslashes, backticks, $ and !, which each tool would need escaped differently." };
  }
  if (text.length > MAX_COMMENT) return { ok: false, error: `nftables keeps at most ${MAX_COMMENT} characters of comment; this is ${text.length}.` };
  return { ok: true, value: text };
}

export function checkLogPrefix(raw: string): Parsed<string | null> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^[A-Za-z0-9 _.:/[\]=+-]+$/.test(text)) {
    return { ok: false, error: "Use letters, digits, spaces and _ . : / [ ] = + - in a log prefix." };
  }
  if (text.length > MAX_LOG_PREFIX) {
    return {
      ok: false,
      error: `The kernel LOG target keeps 29 characters of prefix. With the trailing space this builder adds, that leaves ${MAX_LOG_PREFIX}.`,
    };
  }
  return { ok: true, value: text };
}

export function checkZone(raw: string): Parsed<string> {
  const text = raw.trim();
  if (text === "") return { ok: true, value: "public" };
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return { ok: false, error: "A firewalld zone name uses letters, digits, hyphen and underscore." };
  if (text.length > MAX_ZONE) return { ok: false, error: `firewalld limits zone names to ${MAX_ZONE} characters.` };
  return { ok: true, value: text };
}

/* -------------------------------------------------------------- reference */

const CHAIN: Record<Direction, string> = { input: "INPUT", output: "OUTPUT", forward: "FORWARD" };
const IPT_TARGET: Record<Action, string> = { accept: "ACCEPT", drop: "DROP", reject: "REJECT" };
const UFW_ACTION: Record<Action, string> = { accept: "allow", drop: "deny", reject: "reject" };
const IPT_STATE: Record<Exclude<ConnState, "any">, string> = {
  new: "NEW",
  established: "ESTABLISHED,RELATED",
  invalid: "INVALID",
};
const NFT_STATE: Record<Exclude<ConnState, "any">, string> = {
  new: "new",
  established: "established,related",
  invalid: "invalid",
};

/** Ports that should almost never accept connections from every address. */
export const SENSITIVE_PORTS: Record<number, string> = {
  22: "SSH",
  23: "Telnet",
  445: "SMB",
  2375: "the unencrypted Docker API",
  3306: "MySQL",
  3389: "RDP",
  5432: "PostgreSQL",
  5900: "VNC",
  6379: "Redis",
  9200: "Elasticsearch",
  11211: "memcached",
  27017: "MongoDB",
};

/* --------------------------------------------------------------- building */

interface Ready {
  spec: RuleSpec;
  family: Family;
  src: Address | null;
  dst: Address | null;
  sports: PortList | null;
  dports: PortList | null;
  inIface: string | null;
  outIface: string | null;
  comment: string | null;
  prefix: string;
  zone: string;
  sudo: string;
}

function portIptables(items: PortItem[]): string {
  return items.map((p) => (p.lo === p.hi ? `${p.lo}` : `${p.lo}:${p.hi}`)).join(",");
}

function portNft(items: PortItem[]): string {
  const parts = items.map((p) => (p.lo === p.hi ? `${p.lo}` : `${p.lo}-${p.hi}`));
  return parts.length === 1 ? parts[0] : `{ ${parts.join(", ")} }`;
}

function portUfw(items: PortItem[]): string {
  return items.map((p) => (p.lo === p.hi ? `${p.lo}` : `${p.lo}:${p.hi}`)).join(",");
}

function portFirewalld(p: PortItem): string {
  return p.lo === p.hi ? `${p.lo}` : `${p.lo}-${p.hi}`;
}

function l4Protocols(protocol: Protocol): Protocol[] {
  return protocol === "tcpudp" ? ["tcp", "udp"] : [protocol];
}

function usesIn(direction: Direction): boolean {
  return direction === "input" || direction === "forward";
}

function usesOut(direction: Direction): boolean {
  return direction === "output" || direction === "forward";
}

/* ---- iptables */

function buildIptables(r: Ready): ToolOutput {
  const { spec } = r;
  const chain = CHAIN[spec.direction];
  const bins = r.family === "both" ? ["iptables", "ip6tables"] : r.family === "ipv4" ? ["iptables"] : ["ip6tables"];
  const commands: string[] = [];
  const notes: string[] = [];

  for (const bin of bins) {
    let position = 1;
    for (const proto of l4Protocols(spec.protocol)) {
      const match: string[] = [];
      if (usesIn(spec.direction) && r.inIface) match.push(`-i ${r.inIface}`);
      if (usesOut(spec.direction) && r.outIface) match.push(`-o ${r.outIface}`);
      if (r.src) match.push(`-s ${r.src.text}`);
      if (r.dst) match.push(`-d ${r.dst.text}`);
      if (proto !== "any") match.push(`-p ${proto === "icmpv6" ? "ipv6-icmp" : proto}`);
      // -p must come first: it is what loads the tcp or udp match that
      // understands --sport and --dport (iptables-extensions(8)).
      if (r.sports) {
        match.push(
          r.sports.items.length === 1 ? `--sport ${portIptables(r.sports.items)}` : `-m multiport --sports ${portIptables(r.sports.items)}`,
        );
      }
      if (r.dports) {
        match.push(
          r.dports.items.length === 1 ? `--dport ${portIptables(r.dports.items)}` : `-m multiport --dports ${portIptables(r.dports.items)}`,
        );
      }
      if (spec.state !== "any") match.push(`-m conntrack --ctstate ${IPT_STATE[spec.state]}`);
      const where = () => (spec.placement === "top" ? `-I ${chain} ${position++}` : `-A ${chain}`);
      const tail = r.comment ? ` -m comment --comment "${r.comment}"` : "";
      const body = match.length ? ` ${match.join(" ")}` : "";

      if (spec.log) {
        // LOG is a non-terminating target: it records the packet and the
        // chain carries on, so the verdict needs a rule of its own after it.
        const limit = spec.logLimit ? ` -m limit --limit ${LOG_RATE.iptables}` : "";
        commands.push(`${r.sudo}${bin} ${where()}${body}${limit} -j LOG --log-prefix "${r.prefix}"`);
      }
      commands.push(`${r.sudo}${bin} ${where()}${body}${tail} -j ${IPT_TARGET[spec.action]}`);
    }
  }

  const persist = [
    "# Debian and Ubuntu, with the iptables-persistent package:",
    `${r.sudo}netfilter-persistent save`,
    "# RHEL family, with the iptables-services package:",
  ];
  if (r.family !== "ipv6") persist.push(`${r.sudo}service iptables save`);
  if (r.family !== "ipv4") persist.push(`${r.sudo}service ip6tables save`);

  if (r.family === "both") {
    notes.push("iptables and ip6tables keep separate tables. With no address to pin the family, the rule is written once for each.");
  }
  if (spec.protocol === "tcpudp") notes.push("One rule per protocol: an iptables rule names a single -p.");
  if (spec.placement === "top") {
    notes.push(`-I ${chain} 1 puts the rule above everything already in the chain, including any ESTABLISHED,RELATED rule.`);
  }
  if (spec.action === "reject") {
    notes.push("REJECT answers with ICMP port unreachable by default. For TCP, --reject-with tcp-reset looks like a closed port instead.");
  }
  notes.push("On most current distributions the iptables command is iptables-nft, which writes nftables rules into its own ip and ip6 tables.");
  return { tool: "iptables", label: "iptables", supported: true, commands, persist, notes };
}

/* ---- nftables */

function buildNft(r: Ready): ToolOutput {
  const { spec } = r;
  const chain = spec.direction;
  const parts: string[] = [];
  if (usesIn(spec.direction) && r.inIface) parts.push(`iifname "${r.inIface}"`);
  if (usesOut(spec.direction) && r.outIface) parts.push(`oifname "${r.outIface}"`);
  if (r.src) parts.push(`${r.src.family === "ipv4" ? "ip" : "ip6"} saddr ${r.src.text}`);
  if (r.dst) parts.push(`${r.dst.family === "ipv4" ? "ip" : "ip6"} daddr ${r.dst.text}`);

  const hasPorts = r.sports !== null || r.dports !== null;
  if (spec.protocol === "tcp" || spec.protocol === "udp") {
    if (!hasPorts) parts.push(`meta l4proto ${spec.protocol}`);
    if (r.sports) parts.push(`${spec.protocol} sport ${portNft(r.sports.items)}`);
    if (r.dports) parts.push(`${spec.protocol} dport ${portNft(r.dports.items)}`);
  } else if (spec.protocol === "tcpudp") {
    // th is the generic transport header: it reads the port fields that
    // TCP and UDP share, once l4proto has confirmed one of the two (nft(8)).
    parts.push("meta l4proto { tcp, udp }");
    if (r.sports) parts.push(`th sport ${portNft(r.sports.items)}`);
    if (r.dports) parts.push(`th dport ${portNft(r.dports.items)}`);
  } else if (spec.protocol === "icmp") {
    parts.push("meta l4proto icmp");
  } else if (spec.protocol === "icmpv6") {
    parts.push("meta l4proto ipv6-icmp");
  }
  if (spec.state !== "any") parts.push(`ct state ${NFT_STATE[spec.state]}`);

  const match = parts.join(" ");
  const lead = match ? `${match} ` : "";
  const verb = spec.placement === "top" ? "insert" : "add";
  const comment = r.comment ? ` comment "${r.comment}"` : "";
  const rules: string[] = [];
  const notes: string[] = [];

  if (spec.log && spec.logLimit) {
    // A limit placed in the verdict rule would make packets over the rate
    // skip the verdict and fall through, so the limited log gets its own rule.
    rules.push(`${lead}limit rate ${LOG_RATE.nft} log prefix "${r.prefix}"`);
    rules.push(`${lead}counter ${spec.action}${comment}`);
    notes.push(
      "The rate limit sits in a separate log rule. In the same rule as the verdict, packets over the limit would stop matching and fall through to the rules below.",
    );
  } else if (spec.log) {
    rules.push(`${lead}counter log prefix "${r.prefix}" ${spec.action}${comment}`);
  } else {
    rules.push(`${lead}counter ${spec.action}${comment}`);
  }

  // insert puts each rule at the head of the chain, so a pair is inserted in
  // reverse to come out in the right order.
  const ordered = spec.placement === "top" ? [...rules].reverse() : rules;
  const commands = [
    "# Only if the table and chain do not exist yet:",
    `${r.sudo}nft add table inet filter`,
    `${r.sudo}nft 'add chain inet filter ${chain} { type filter hook ${chain} priority 0; }'`,
    "# The rule:",
    ...ordered.map((rule) => `${r.sudo}nft '${verb} rule inet filter ${chain} ${rule}'`),
  ];

  const persist = [
    "# Debian and Ubuntu read /etc/nftables.conf at boot:",
    `${r.sudo}sh -c 'echo "flush ruleset" > /etc/nftables.conf && nft -s list ruleset >> /etc/nftables.conf'`,
    `${r.sudo}systemctl enable nftables`,
    "# RHEL and Fedora read /etc/sysconfig/nftables.conf instead.",
  ];

  if (r.family === "both") notes.push("An inet table sees IPv4 and IPv6, so one rule covers both families.");
  notes.push("nft list ruleset saves every table, including ones Docker, libvirt or iptables-nft created. Trim the file to your own table.");
  if (spec.action === "reject") notes.push("In an inet table, reject picks the ICMP or ICMPv6 port unreachable message to match the packet's family.");
  return { tool: "nftables", label: "nftables (inet)", supported: true, commands, persist, notes };
}

/* ---- ufw */

function buildUfw(r: Ready): ToolOutput {
  const { spec } = r;
  const notes: string[] = [];
  const unsupported = (why: string): ToolOutput => ({
    tool: "ufw",
    label: "ufw",
    supported: false,
    commands: [],
    persist: [],
    notes: [why],
  });

  if (spec.protocol === "icmp" || spec.protocol === "icmpv6") {
    return unsupported(
      "ufw has no ICMP rule syntax. ICMP is handled in /etc/ufw/before.rules (IPv4) and /etc/ufw/before6.rules (IPv6), which accept echo requests and the error types by default.",
    );
  }
  if (spec.state === "established") {
    return unsupported(
      "ufw already accepts ESTABLISHED and RELATED traffic in before.rules, ahead of every user rule, so there is nothing to add.",
    );
  }
  if (spec.state === "invalid") {
    return unsupported("ufw already drops INVALID packets in before.rules, ahead of every user rule.");
  }

  const route = spec.direction === "forward";
  const placement = spec.placement === "top" ? (route ? " insert 1" : " prepend") : "";
  const head = `${r.sudo}ufw${route ? " route" : ""}${placement} ${UFW_ACTION[spec.action]}`;

  const dir: string[] = [];
  if (spec.direction === "input") dir.push(r.inIface ? `in on ${r.inIface}` : "in");
  if (spec.direction === "output") dir.push(r.outIface ? `out on ${r.outIface}` : "out");
  if (route) {
    if (r.inIface) dir.push(`in on ${r.inIface}`);
    if (r.outIface) dir.push(`out on ${r.outIface}`);
  }

  // Without a protocol ufw applies a port to both TCP and UDP, but it insists
  // on a protocol for lists and ranges (ufw(8)), so those split in two.
  const single = (list: PortList | null) => list === null || (list.items.length === 1 && list.items[0].lo === list.items[0].hi);
  const protos: (string | null)[] =
    spec.protocol === "any"
      ? [null]
      : spec.protocol === "tcpudp"
        ? single(r.sports) && single(r.dports)
          ? [null]
          : ["tcp", "udp"]
        : [spec.protocol];

  const commands = protos.map((proto) => {
    const parts = [head, ...dir];
    if (spec.log) parts.push("log");
    if (proto) parts.push(`proto ${proto}`);
    parts.push(`from ${r.src ? r.src.text : "any"}`);
    if (r.sports) parts.push(`port ${portUfw(r.sports.items)}`);
    parts.push(`to ${r.dst ? r.dst.text : "any"}`);
    if (r.dports) parts.push(`port ${portUfw(r.dports.items)}`);
    if (r.comment) parts.push(`comment '${r.comment}'`);
    return parts.join(" ");
  });

  if (spec.protocol === "tcpudp" && protos[0] === null) notes.push("With no proto clause, ufw applies the port to TCP and UDP both.");
  if (spec.protocol === "tcpudp" && protos[0] !== null) notes.push("ufw needs a protocol for port lists and ranges, so TCP and UDP get a rule each.");
  if (spec.state === "new") {
    notes.push("ufw has no state option. Its user rules only see packets that before.rules did not already accept as ESTABLISHED or RELATED.");
  }
  if (spec.log) notes.push("ufw chooses its own log prefix, such as [UFW ALLOW], and rate limits its log rules already.");
  if (spec.placement === "top") {
    notes.push(
      route
        ? "insert 1 fails while the rule list is empty. Add the rule without it in that case."
        : "prepend puts the rule first among the rules of its own IP version.",
    );
  }
  if (route) notes.push("ufw route rules only matter when the kernel forwards packets, with net.ipv4.ip_forward=1 or its IPv6 equivalent.");

  const persist = [
    "# ufw saves each rule as it is added, in /etc/ufw/user.rules and user6.rules.",
    "# Make sure ufw itself starts at boot:",
    `${r.sudo}ufw enable`,
    `${r.sudo}ufw status numbered`,
  ];
  return { tool: "ufw", label: "ufw", supported: true, commands, persist, notes };
}

/* ---- firewalld */

function buildFirewalld(r: Ready): ToolOutput {
  const { spec } = r;
  const notes: string[] = [];
  const unsupported = (why: string): ToolOutput => ({
    tool: "firewalld",
    label: "firewalld (rich rules)",
    supported: false,
    commands: [],
    persist: [],
    notes: [why],
  });

  if (r.sports && r.dports) {
    return unsupported(
      "A rich rule holds one element: a port, a source-port, a protocol or a service, never two. Matching source and destination ports together needs two separate rules that cannot be combined, or nftables directly.",
    );
  }
  if (spec.state === "established") {
    return unsupported("firewalld accepts ESTABLISHED and RELATED traffic in its own base chain before any zone rule runs, so there is nothing to add.");
  }
  if (spec.state === "invalid") {
    return unsupported("firewalld drops INVALID packets in its own base chain before any zone rule runs.");
  }
  const anyMatch = r.src || r.dst || r.sports || r.dports || spec.protocol !== "any";
  if (!anyMatch) {
    return unsupported(
      `A rule that matches everything is a default policy, and firewalld expresses that as the zone target: firewall-cmd --permanent --zone=${r.zone} --set-target=${spec.action === "accept" ? "ACCEPT" : spec.action === "drop" ? "DROP" : "%%REJECT%%"}`,
    );
  }

  const needFamily = r.src !== null || r.dst !== null || spec.protocol === "icmp" || spec.protocol === "icmpv6";
  const family = r.family === "both" ? null : r.family;
  const head = ["rule"];
  if (spec.placement === "top") head.push('priority="-1"');
  if (needFamily && family) head.push(`family="${family}"`);
  if (r.src) head.push(`source address="${r.src.text}"`);
  if (r.dst) head.push(`destination address="${r.dst.text}"`);

  const tail: string[] = [];
  if (spec.log) {
    tail.push(`log prefix="${r.prefix}" level="info"${spec.logLimit ? ` limit value="${LOG_RATE.firewalld}"` : ""}`);
  }
  tail.push(spec.action);

  const elements: string[] = [];
  const portList = r.dports ?? r.sports;
  const portKeyword = r.dports ? "port" : "source-port";
  if (portList) {
    for (const proto of l4Protocols(spec.protocol)) {
      for (const item of portList.items) {
        elements.push(`${portKeyword} port="${portFirewalld(item)}" protocol="${proto}"`);
      }
    }
  } else if (spec.protocol === "tcpudp") {
    elements.push('protocol value="tcp"', 'protocol value="udp"');
  } else if (spec.protocol === "icmp") {
    elements.push('protocol value="icmp"');
  } else if (spec.protocol === "icmpv6") {
    elements.push('protocol value="ipv6-icmp"');
  } else if (spec.protocol !== "any") {
    elements.push(`protocol value="${spec.protocol}"`);
  } else {
    elements.push("");
  }

  const rich = elements.map((el) => [...head, el, ...tail].filter(Boolean).join(" "));
  const commands: string[] = [];
  let target: string;
  if (spec.direction === "input") {
    target = `--zone=${r.zone}`;
  } else {
    const policy = spec.direction === "output" ? "host-egress" : "forward-any";
    target = `--policy=${policy}`;
    commands.push(
      "# Once, to create the policy (firewalld 0.9 or later):",
      `${r.sudo}firewall-cmd --permanent --new-policy=${policy}`,
      `${r.sudo}firewall-cmd --permanent --policy=${policy} --add-ingress-zone=${spec.direction === "output" ? "HOST" : "ANY"}`,
      `${r.sudo}firewall-cmd --permanent --policy=${policy} --add-egress-zone=ANY`,
      "# The rule:",
    );
  }
  if (r.comment) commands.push(`# ${r.comment}`);
  for (const rule of rich) commands.push(`${r.sudo}firewall-cmd --permanent ${target} --add-rich-rule='${rule}'`);

  if (spec.direction === "output") {
    notes.push("Zones only filter traffic arriving at the host. Outbound filtering uses a policy whose ingress zone is HOST.");
  }
  if (spec.direction === "forward") {
    notes.push("ANY to ANY covers traffic forwarded between any two zones. Name real zones instead to narrow it.");
  }
  if (usesIn(spec.direction) && r.inIface) {
    notes.push(
      `Rich rules have no interface match. A rule applies to every interface in its zone, so check that ${r.inIface} is in ${spec.direction === "input" ? r.zone : "the ingress zone"}: firewall-cmd --get-zone-of-interface=${r.inIface}`,
    );
  } else if (usesOut(spec.direction) && r.outIface) {
    notes.push(`Rich rules have no interface match. Put ${r.outIface} in its own zone and use that zone as the policy's egress zone.`);
  }
  if (spec.state === "new") notes.push("Zone rules only ever see new connections, because firewalld accepts established traffic first.");
  if (r.comment) notes.push("Rich rules have no comment field, so the comment is a shell comment above the command.");
  if (rich.length > 1) notes.push("A rich rule holds one port element, so each port, range and protocol gets its own rule.");
  if (spec.placement === "top") {
    notes.push(
      'Rich rules have no position. Within a priority firewalld runs log rules, then deny rules, then allow rules. A negative priority="-1" runs before all of them.',
    );
  } else if (spec.action === "accept") {
    notes.push("Within the same priority firewalld runs every drop and reject rich rule before any accept rule, whatever order they were added in.");
  }

  const persist = [
    "# --permanent writes the zone or policy file; reload applies it:",
    `${r.sudo}firewall-cmd --reload`,
    "# Rules added without --permanent are lost at the next reload unless saved:",
    `${r.sudo}firewall-cmd --runtime-to-permanent`,
  ];
  return { tool: "firewalld", label: "firewalld (rich rules)", supported: true, commands, persist, notes };
}

/* ------------------------------------------------------------- top level */

export function buildRule(spec: RuleSpec): BuildResult {
  const errors: FieldError[] = [];
  const warnings: Warning[] = [];

  const take = <T>(field: Field, parsed: Parsed<T>): T | null => {
    if (parsed.ok) return parsed.value;
    errors.push({ field, message: parsed.error });
    return null;
  };

  const src = take("source", parseAddress(spec.source));
  const dst = take("destination", parseAddress(spec.destination));
  const sports = take("sourcePorts", parsePorts(spec.sourcePorts));
  const dports = take("destPorts", parsePorts(spec.destPorts));
  const inIface = usesIn(spec.direction) ? take("inIface", checkIface(spec.inIface)) : null;
  const outIface = usesOut(spec.direction) ? take("outIface", checkIface(spec.outIface)) : null;
  const comment = take("comment", checkComment(spec.comment));
  const prefixText = spec.log ? take("logPrefix", checkLogPrefix(spec.logPrefix)) : null;
  const zone = take("zone", checkZone(spec.zone)) ?? "public";

  const portsGiven = spec.sourcePorts.trim() !== "" || spec.destPorts.trim() !== "";
  if (portsGiven && !(spec.protocol === "tcp" || spec.protocol === "udp" || spec.protocol === "tcpudp")) {
    errors.push({
      field: spec.destPorts.trim() !== "" ? "destPorts" : "sourcePorts",
      message: "Ports only exist in TCP and UDP. Choose TCP, UDP or both, or clear the ports.",
    });
  }

  let family: Family = "both";
  if (src && dst && src.family !== dst.family) {
    errors.push({
      field: "destination",
      message: "The source is one IP version and the destination the other. A packet is either IPv4 or IPv6, so write one rule for each.",
    });
  } else {
    const addrFamily = src?.family ?? dst?.family ?? null;
    const protoFamily = spec.protocol === "icmp" ? "ipv4" : spec.protocol === "icmpv6" ? "ipv6" : null;
    if (addrFamily && protoFamily && addrFamily !== protoFamily) {
      errors.push({
        field: "protocol",
        message:
          protoFamily === "ipv4"
            ? "ICMP belongs to IPv4. For IPv6 addresses choose ICMPv6."
            : "ICMPv6 belongs to IPv6. For IPv4 addresses choose ICMP.",
      });
    }
    family = addrFamily ?? protoFamily ?? "both";
  }

  if (errors.length) return { ok: false, errors, warnings, family, outputs: [] };

  for (const [label, addr] of [
    ["source", src],
    ["destination", dst],
  ] as const) {
    if (addr?.normalized) {
      warnings.push({
        tone: "info",
        text: `The ${label} had host bits set, so it is written as ${addr.text}: the network that prefix actually selects.`,
      });
    }
    if (addr?.mapped) {
      warnings.push({
        tone: "warn",
        text: `The ${label} is an IPv4-mapped IPv6 address. Those never appear in packets on the wire; match the IPv4 address in an IPv4 rule instead.`,
      });
    }
  }

  const matchesEverything =
    !src && !dst && !sports && !dports && spec.protocol === "any" && spec.state === "any" && !inIface && !outIface;
  if (matchesEverything && spec.action !== "accept") {
    warnings.push({
      tone: "danger",
      text: `This rule matches every packet in ${CHAIN[spec.direction]}${spec.direction === "input" ? ", including your own SSH session" : ""}. Anything after it never runs. A catch-all belongs in the default policy, set after the allow rules exist.`,
    });
  }
  if (spec.direction === "input" && spec.action === "accept" && !src && dports) {
    const exposed = dports.items
      .flatMap((p) => Object.keys(SENSITIVE_PORTS).map(Number).filter((n) => n >= p.lo && n <= p.hi))
      .map((n) => `${SENSITIVE_PORTS[n]} (${n})`);
    if (exposed.length) {
      warnings.push({
        tone: "warn",
        text: `This opens ${exposed.join(", ")} to every address that can reach this host. Set a source network such as a management subnet or VPN range.`,
      });
    }
  }
  if (spec.state === "invalid" && spec.action === "accept") {
    warnings.push({
      tone: "warn",
      text: "Accepting INVALID packets lets through traffic conntrack could not place in any flow, which is what scanners and evasion tricks produce. Drop them instead.",
    });
  }
  if (spec.state === "established" && spec.action === "accept" && spec.direction !== "output") {
    warnings.push({
      tone: "info",
      text: `This is the rule that belongs at the top of ${CHAIN[spec.direction]}: it accepts replies and related ICMP for flows already allowed, with one conntrack lookup.`,
    });
  }
  if (spec.state === "established" && spec.action !== "accept") {
    warnings.push({
      tone: "warn",
      text: "Dropping ESTABLISHED,RELATED traffic breaks every connection the host already allowed, including replies to its own outbound requests.",
    });
  }
  if (spec.log && !spec.logLimit) {
    warnings.push({
      tone: "info",
      text: "Logging without a rate limit lets a flood write one kernel log line per packet. Keep the limit on for drop and reject rules.",
    });
  }
  if (spec.direction === "forward") {
    warnings.push({
      tone: "info",
      text: "FORWARD only sees packets routed through this host, which requires IP forwarding to be enabled (net.ipv4.ip_forward=1).",
    });
  }

  const ready: Ready = {
    spec,
    family,
    src,
    dst,
    sports,
    dports,
    inIface,
    outIface,
    comment,
    prefix: `${prefixText ?? `${CHAIN[spec.direction]} ${IPT_TARGET[spec.action]}:`} `,
    zone,
    sudo: spec.sudo ? "sudo " : "",
  };

  return {
    ok: true,
    errors,
    warnings,
    family,
    outputs: [buildIptables(ready), buildNft(ready), buildUfw(ready), buildFirewalld(ready)],
  };
}

/* --------------------------------------------------------------- baseline */

export interface BaselineSpec {
  /** Management network allowed to reach SSH. */
  mgmt: string;
  sshPort: string;
  allowPing: boolean;
  sudo: boolean;
}

export const DEFAULT_BASELINE: BaselineSpec = { mgmt: "10.0.10.0/24", sshPort: "22", allowPing: true, sudo: true };

export interface BaselineFile {
  path: string;
  content: string;
}

export interface BaselineOutput {
  tool: ToolId;
  label: string;
  files: BaselineFile[];
  commands: string[];
  notes: string[];
}

export interface ChainStep {
  rule: string;
  why: string;
}

export interface BaselineResult {
  ok: boolean;
  errors: { field: "mgmt" | "sshPort"; message: string }[];
  mgmt: Address | null;
  port: number;
  outputs: BaselineOutput[];
  /** The nftables input chain, top to bottom, with what each rule is for. */
  steps: ChainStep[];
}

/**
 * ICMPv6 types a host must accept for IPv6 to keep working, after RFC 4890
 * section 4.4: the error messages (path MTU discovery depends on Packet Too
 * Big), router advertisements, neighbor solicitation and advertisement, and
 * multicast listener queries, which keep MLD snooping switches delivering
 * the solicited-node multicast that neighbor discovery runs on.
 */
const ICMPV6_ESSENTIAL: { nft: string; type: number }[] = [
  { nft: "destination-unreachable", type: 1 },
  { nft: "packet-too-big", type: 2 },
  { nft: "time-exceeded", type: 3 },
  { nft: "parameter-problem", type: 4 },
  { nft: "mld-listener-query", type: 130 },
  { nft: "nd-router-advert", type: 134 },
  { nft: "nd-neighbor-solicit", type: 135 },
  { nft: "nd-neighbor-advert", type: 136 },
];

function restoreFile(family: "ipv4" | "ipv6", mgmt: Address, port: number, allowPing: boolean): string {
  const lines = [
    mgmt.family === family
      ? `# /etc/iptables/rules.${family === "ipv4" ? "v4" : "v6"}: deny inbound, allow SSH from ${mgmt.text}`
      : `# /etc/iptables/rules.${family === "ipv4" ? "v4" : "v6"}: deny inbound, no SSH over ${family === "ipv4" ? "IPv4" : "IPv6"}`,
    "*filter",
    ":INPUT DROP [0:0]",
    ":FORWARD DROP [0:0]",
    ":OUTPUT ACCEPT [0:0]",
    "-A INPUT -i lo -j ACCEPT",
    "-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT",
    "-A INPUT -m conntrack --ctstate INVALID -j DROP",
  ];
  if (family === "ipv4") {
    if (allowPing) lines.push("-A INPUT -p icmp --icmp-type echo-request -j ACCEPT");
  } else {
    lines.push("# ICMPv6 that IPv6 itself depends on (RFC 4890): errors, MLD query, RA, NS, NA");
    for (const t of ICMPV6_ESSENTIAL) lines.push(`-A INPUT -p ipv6-icmp --icmpv6-type ${t.type} -j ACCEPT`);
    if (allowPing) lines.push("-A INPUT -p ipv6-icmp --icmpv6-type 128 -j ACCEPT");
  }
  if (mgmt.family === family) {
    lines.push(`-A INPUT -s ${mgmt.text} -p tcp --dport ${port} -m conntrack --ctstate NEW -j ACCEPT`);
  }
  lines.push("COMMIT", "");
  return lines.join("\n");
}

export function buildBaseline(spec: BaselineSpec): BaselineResult {
  const errors: BaselineResult["errors"] = [];
  const parsedMgmt = parseAddress(spec.mgmt);
  let mgmt: Address | null = null;
  if (!parsedMgmt.ok) errors.push({ field: "mgmt", message: parsedMgmt.error });
  else if (parsedMgmt.value === null) {
    errors.push({ field: "mgmt", message: "Name the management network. An SSH rule open to any address is not a baseline." });
  } else if (parsedMgmt.value.prefix === 0) {
    errors.push({ field: "mgmt", message: "A /0 prefix is every address. Use the management subnet or VPN range." });
  } else mgmt = parsedMgmt.value;

  const portText = spec.sshPort.trim();
  let port = 22;
  if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
    errors.push({ field: "sshPort", message: "The SSH port is one number from 1 to 65535." });
  } else port = Number(portText);

  if (errors.length || !mgmt) return { ok: false, errors, mgmt, port, outputs: [], steps: [] };

  const sudo = spec.sudo ? "sudo " : "";
  const ipSel = mgmt.family === "ipv4" ? "ip" : "ip6";
  const icmpv6Types = [...ICMPV6_ESSENTIAL.map((t) => t.nft), ...(spec.allowPing ? ["echo-request"] : [])];

  const steps: ChainStep[] = [
    { rule: 'iif "lo" accept', why: "Loopback first. Local services talk to each other over lo, and filtering it breaks them for no gain." },
    {
      rule: "ct state established,related accept",
      why: "Most packets belong to a flow that was already allowed. One conntrack lookup accepts them here, so replies to the host's own DNS and package downloads get back in, and every later rule only has to judge new connections.",
    },
    {
      rule: "ct state invalid drop",
      why: "Packets conntrack cannot place in any flow, such as a stray ACK with no connection behind it, are dropped before they can match an allow rule.",
    },
    {
      rule: `icmpv6 type { ${icmpv6Types.join(", ")} } accept`,
      why: "IPv6 runs neighbor discovery and path MTU discovery over ICMPv6. Drop these and IPv6 stops working on the link.",
    },
  ];
  if (spec.allowPing) {
    steps.push({ rule: "icmp type echo-request accept", why: "Ping, so monitoring and people can tell the host is up. Remove it if you prefer, nothing depends on it." });
  }
  steps.push({
    rule: `${ipSel} saddr ${mgmt.text} tcp dport ${port} ct state new accept`,
    why: `New SSH connections from ${mgmt.text} only. Their later packets are already covered by the established rule above.`,
  });
  steps.push({
    rule: "policy drop",
    why: "Not a rule but the chain's default: whatever reached the bottom without a verdict is dropped. Evaluation is first match, top to bottom, so order is the whole design.",
  });

  const nftLines = [
    "#!/usr/sbin/nft -f",
    `# /etc/nftables.conf: deny inbound, allow SSH from ${mgmt.text}`,
    "flush ruleset",
    "",
    "table inet filter {",
    "\tchain input {",
    "\t\ttype filter hook input priority 0; policy drop;",
    '\t\tiif "lo" accept',
    "\t\tct state established,related accept",
    "\t\tct state invalid drop",
    `\t\ticmpv6 type { ${icmpv6Types.join(", ")} } accept`,
    ...(spec.allowPing ? ["\t\ticmp type echo-request accept"] : []),
    `\t\t${ipSel} saddr ${mgmt.text} tcp dport ${port} ct state new counter accept comment "SSH from management"`,
    "\t}",
    "\tchain forward {",
    "\t\ttype filter hook forward priority 0; policy drop;",
    "\t}",
    "\tchain output {",
    "\t\ttype filter hook output priority 0; policy accept;",
    "\t}",
    "}",
    "",
  ];

  const iptables: BaselineOutput = {
    tool: "iptables",
    label: "iptables",
    files: [
      { path: "/etc/iptables/rules.v4", content: restoreFile("ipv4", mgmt, port, spec.allowPing) },
      { path: "/etc/iptables/rules.v6", content: restoreFile("ipv6", mgmt, port, spec.allowPing) },
    ],
    commands: [
      "# Parse both files without applying anything:",
      `${sudo}iptables-restore --test < /etc/iptables/rules.v4`,
      `${sudo}ip6tables-restore --test < /etc/iptables/rules.v6`,
      "# Apply. Each file replaces its table in one atomic step:",
      `${sudo}iptables-restore < /etc/iptables/rules.v4`,
      `${sudo}ip6tables-restore < /etc/iptables/rules.v6`,
      "# Debian and Ubuntu reload these files at boot through iptables-persistent:",
      `${sudo}systemctl enable netfilter-persistent`,
    ],
    notes: [
      "A restore file sets the policy and the rules together, so there is no moment where the policy is DROP and the SSH rule does not exist yet.",
      "iptables-apply applies a file and rolls it back unless you confirm from a new session within the timeout: iptables-apply -t 60 /etc/iptables/rules.v4",
      mgmt.family === "ipv4"
        ? "The IPv6 file allows no SSH at all, only the ICMPv6 that IPv6 needs. Add an IPv6 management range there if you have one."
        : "The IPv4 file allows no SSH at all. Add an IPv4 management range there if you have one.",
    ],
  };

  const nft: BaselineOutput = {
    tool: "nftables",
    label: "nftables (inet)",
    files: [{ path: "/etc/nftables.conf", content: nftLines.join("\n") }],
    commands: [
      "# Check the file without loading it:",
      `${sudo}nft -c -f /etc/nftables.conf`,
      "# Load it. The whole file is one transaction:",
      `${sudo}nft -f /etc/nftables.conf`,
      `${sudo}systemctl enable nftables`,
    ],
    notes: [
      "One inet table covers IPv4 and IPv6, so the same chain carries the ICMPv6 rule and the SSH rule.",
      "flush ruleset also removes tables that Docker, libvirt or iptables-nft created. Restart those services afterwards, or replace it with a flush of this table alone.",
      "RHEL and Fedora load /etc/sysconfig/nftables.conf instead of /etc/nftables.conf.",
    ],
  };

  const ufwCommands = [
    `${sudo}ufw default deny incoming`,
    `${sudo}ufw default allow outgoing`,
    `${sudo}ufw allow proto tcp from ${mgmt.text} to any port ${port} comment 'SSH from management'`,
    "# Add the SSH rule before enabling, or enable cuts the session you are typing in:",
    `${sudo}ufw enable`,
    `${sudo}ufw status verbose`,
  ];
  const ufw: BaselineOutput = {
    tool: "ufw",
    label: "ufw",
    files: [],
    commands: ufwCommands,
    notes: [
      "ufw's own before.rules already accept loopback, ESTABLISHED,RELATED and the ICMP and ICMPv6 types IP needs, and drop INVALID, ahead of these rules.",
      spec.allowPing
        ? "ufw allows ping by default through before.rules."
        : "ufw allows ping by default. To stop it, change the echo-request lines in /etc/ufw/before.rules and before6.rules from ACCEPT to DROP, then ufw reload.",
      "ufw writes the rules as they are added; ufw enable also sets it to start at boot.",
    ],
  };

  const fwCommands = [
    `${sudo}firewall-cmd --permanent --zone=public --add-rich-rule='rule family="${mgmt.family}" source address="${mgmt.text}" port port="${port}" protocol="tcp" accept'`,
    `${sudo}firewall-cmd --permanent --zone=public --remove-service=ssh`,
  ];
  if (!spec.allowPing) fwCommands.push(`${sudo}firewall-cmd --permanent --zone=public --add-icmp-block=echo-request`);
  fwCommands.push(
    "# Both changes take effect together at the reload; your open session survives it:",
    `${sudo}firewall-cmd --reload`,
    `${sudo}firewall-cmd --zone=public --list-all`,
  );
  const firewalld: BaselineOutput = {
    tool: "firewalld",
    label: "firewalld (rich rules)",
    files: [],
    commands: fwCommands,
    notes: [
      "The public zone's default target already rejects anything not allowed, with an ICMP administratively prohibited reply, so the baseline is removing the ssh service that allows SSH from everywhere.",
      "Run --list-all before and after. Many installs also allow dhcpv6-client or cockpit in public; remove what you do not use.",
      ...(port !== 22
        ? [`With SELinux enforcing, sshd can only bind ${port} once the port is labeled: semanage port -a -t ssh_port_t -p tcp ${port}`]
        : []),
    ],
  };

  return { ok: true, errors: [], mgmt, port, outputs: [iptables, nft, ufw, firewalld], steps };
}
