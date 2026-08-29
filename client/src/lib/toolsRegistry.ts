/**
 * The tools catalogue.
 *
 * One entry per interactive utility. The registry is plain data with no
 * component imports, so the tools index page can list every tool, and the
 * router can build its routes, without pulling any tool's code into the
 * bundle. Each tool is lazily loaded by its own route.
 *
 * Adding a tool: add an entry here, add the lazy route in App.tsx, and add
 * the prerender entry in script/prerender.ts.
 */

export type ToolCategory =
  | "networking"
  | "security"
  | "systems"
  | "encoding"
  | "infrastructure";

export interface ToolEntry {
  /** URL segment under /tools. */
  slug: string;
  /** Short name, used in cards and nav. */
  name: string;
  /** One line, shown on the index card and used as the meta description seed. */
  blurb: string;
  category: ToolCategory;
  /** Search terms beyond the name, for the index filter. */
  keywords: string[];
}

export const TOOL_CATEGORIES: Record<ToolCategory, { label: string; blurb: string }> = {
  networking: {
    label: "Networking",
    blurb: "Addressing, routing, and the protocols underneath them.",
  },
  security: {
    label: "Security",
    blurb: "Analysis and competition utilities.",
  },
  systems: {
    label: "Systems",
    blurb: "Linux, scheduling, and operations.",
  },
  encoding: {
    label: "Encoding",
    blurb: "Converting between representations.",
  },
  infrastructure: {
    label: "Infrastructure",
    blurb: "Data center power, cooling, and capacity.",
  },
};

export const TOOLS: ToolEntry[] = [
  {
    slug: "subnet-calculator",
    name: "Subnet calculator",
    blurb:
      "Enter an address in CIDR notation and get the network address, broadcast address, usable host range, and mask.",
    category: "networking",
    keywords: ["cidr", "netmask", "ipv4", "subnetting", "wildcard", "prefix"],
  },
  {
    slug: "vlsm-practice",
    name: "VLSM practice",
    blurb:
      "Generates subnetting problems and grades your answers, so you can drill the arithmetic before an exam.",
    category: "networking",
    keywords: ["subnetting", "practice", "quiz", "ccna", "network+", "drill"],
  },
  {
    slug: "cidr-visualizer",
    name: "CIDR visualizer",
    blurb:
      "Shows how a prefix divides into smaller blocks, and how those blocks nest inside each other.",
    category: "networking",
    keywords: ["cidr", "supernet", "aggregation", "prefix", "block", "visual"],
  },
  {
    slug: "packet-headers",
    name: "Packet header reference",
    blurb:
      "Interactive IPv4, TCP, and UDP header diagrams. Click any field for what it carries and why.",
    category: "networking",
    keywords: ["tcp", "udp", "ipv4", "header", "protocol", "offset", "flags"],
  },
  {
    slug: "port-reference",
    name: "Port reference",
    blurb:
      "Searchable list of well-known and registered TCP and UDP ports with the service on each.",
    category: "networking",
    keywords: ["ports", "services", "tcp", "udp", "iana", "well-known"],
  },
  {
    slug: "wireshark-filters",
    name: "Wireshark filters",
    blurb:
      "Display filter recipes for common analysis tasks, each one copyable in a click.",
    category: "networking",
    keywords: ["wireshark", "tshark", "pcap", "display filter", "capture"],
  },
  {
    slug: "dns-records",
    name: "DNS record reference",
    blurb:
      "What each record type is for, with the shape of a real answer and the dig command to get it.",
    category: "networking",
    keywords: ["dns", "dig", "record", "mx", "txt", "cname", "soa", "dnssec"],
  },
  {
    slug: "chmod-calculator",
    name: "Permissions calculator",
    blurb:
      "Toggle Unix permission bits and read the octal, the symbolic form, and the chmod command together.",
    category: "systems",
    keywords: ["chmod", "permissions", "octal", "unix", "linux", "setuid", "sticky"],
  },
  {
    slug: "cron-explainer",
    name: "Cron explainer",
    blurb:
      "Translates a cron expression into plain English and lists the next times it would fire.",
    category: "systems",
    keywords: ["cron", "crontab", "schedule", "systemd", "timer"],
  },
  {
    slug: "regex-tester",
    name: "Regex tester",
    blurb:
      "Test a pattern against sample text with live match highlighting, preloaded with log-analysis patterns.",
    category: "systems",
    keywords: ["regex", "regular expression", "grep", "pattern", "log", "match"],
  },
  {
    slug: "http-status-codes",
    name: "HTTP status codes",
    blurb:
      "Every status code, what it actually means, and when you would legitimately send it.",
    category: "systems",
    keywords: ["http", "status", "response", "404", "500", "rest", "api"],
  },
  {
    slug: "encoder-decoder",
    name: "Encoder and decoder",
    blurb:
      "Convert between text, Base64, hex, URL encoding, and binary, in either direction.",
    category: "encoding",
    keywords: ["base64", "hex", "url encode", "percent", "binary", "ascii", "ctf"],
  },
  {
    slug: "base-converter",
    name: "Base converter",
    blurb:
      "Binary, octal, decimal, and hex side by side, with two's complement for signed widths.",
    category: "encoding",
    keywords: ["binary", "hex", "octal", "decimal", "twos complement", "bitwise"],
  },
  {
    slug: "classical-ciphers",
    name: "Classical ciphers",
    blurb:
      "Caesar, ROT13, Vigenere, and Atbash, including a brute-force view of all 25 Caesar shifts.",
    category: "security",
    keywords: ["caesar", "rot13", "vigenere", "atbash", "cipher", "crypto", "ctf", "ncl"],
  },
  {
    slug: "hash-identifier",
    name: "Hash identifier",
    blurb:
      "Paste a hash and see which algorithms produce that shape, ranked by how likely each is.",
    category: "security",
    keywords: ["hash", "md5", "sha", "bcrypt", "ntlm", "identify", "cracking", "hashcat"],
  },
  {
    slug: "mac-lookup",
    name: "MAC address lookup",
    blurb:
      "Resolve the vendor behind a MAC address prefix, and read the address type from its bits.",
    category: "networking",
    keywords: ["mac", "oui", "vendor", "ethernet", "multicast", "locally administered"],
  },
  {
    slug: "rack-budget",
    name: "Rack power and cooling budget",
    blurb:
      "Size a data center floor: IT load, PUE, facility power, heat in BTU and tons, how many CRAH units, and what the electricity costs per year.",
    category: "infrastructure",
    keywords: ["power", "cooling", "pue", "btu", "crah", "capacity", "datacenter", "rack", "kw", "tons", "budget"],
  },
];

export function getTool(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function toolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOLS.filter((tool) => tool.category === category);
}
