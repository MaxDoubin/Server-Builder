/**
 * The tools catalog.
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
    slug: "timestamp-converter",
    name: "Unix timestamp converter",
    blurb:
      "Epoch seconds, milliseconds, microseconds and nanoseconds to a date and back, in UTC and local, with ISO 8601 and RFC 2822.",
    category: "encoding",
    keywords: ["unix", "epoch", "timestamp", "iso 8601", "rfc 2822", "utc", "time_t", "2038", "date"],
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
    slug: "jwt-decoder",
    name: "JWT decoder",
    blurb:
      "Read the header, payload and claim times inside a JSON Web Token. Decodes only: the signature is shown and never verified.",
    category: "security",
    keywords: ["jwt", "jws", "bearer", "token", "oauth", "oidc", "claims", "base64url"],
  },
  {
    slug: "password-entropy",
    name: "Password entropy calculator",
    blurb:
      "Search space bits, Shannon entropy and time to crack at five attack rates, with the patterns that make all three optimistic.",
    category: "security",
    keywords: ["password", "entropy", "bits", "crack", "hashcat", "bcrypt", "shannon", "strength", "diceware"],
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
  {
    slug: "data-uri-tool",
    name: "Data URI tool",
    blurb:
      "Encodes files or text as data: URIs in every form, and decodes pasted or scanned data URIs with nested layers, MIME sniffing and previews. Runs in the browser.",
    category: "encoding",
    keywords: ["data uri", "data url", "base64", "percent encoding", "rfc 2397", "mime", "magic bytes", "nested", "ctf", "encoding"],
  },
  {
    slug: "file-identifier",
    name: "File identifier",
    blurb:
      "Identifies a file from 92 magic-byte signatures, flags extension mismatches, reads header fields and carves embedded formats, all in the browser.",
    category: "security",
    keywords: ["file", "magic bytes", "file signature", "carving", "forensics", "ctf", "binwalk", "file type", "hex dump", "extension mismatch"],
  },
  {
    slug: "frequency-analysis",
    name: "Frequency analysis",
    blurb:
      "Substitution solver aid: letter, bigram and trigram counts, index of coincidence, word patterns and a live decode from a letter mapping. Runs in the browser.",
    category: "security",
    keywords: ["frequency analysis", "substitution", "monoalphabetic", "index of coincidence", "bigram", "trigram", "word pattern", "ctf"],
  },
  {
    slug: "hex-viewer",
    name: "Hex viewer",
    blurb:
      "Hex dump of any file or pasted text, hex or base64, with offset in hex and decimal, an ASCII gutter and pattern search. Runs in your browser.",
    category: "systems",
    keywords: ["hex dump", "hexdump", "xxd", "hex editor", "magic bytes", "offset", "ctf", "binary", "entropy", "file type"],
  },
  {
    slug: "image-analyzer",
    name: "Image analyzer",
    blurb:
      "Image forensics on one page: EXIF, IPTC, XMP, GPS, magic-byte format check, data past the end marker, strings, hex header and LSB planes. Runs in your browser.",
    category: "security",
    keywords: ["exif", "stego", "ctf", "forensics", "metadata", "gps", "lsb", "bit planes", "magic bytes", "steganography"],
  },
  {
    slug: "magic-decoder",
    name: "Magic decoder",
    blurb:
      "Peels an encoded blob one layer at a time, scoring Base64, hex, Base32, ROT13, gzip, zlib and more by printable share and English. Runs in the browser.",
    category: "security",
    keywords: ["ctf", "cyberchef", "magic", "base64", "base32", "base58", "hex", "rot13", "rot47", "gzip", "zlib", "zip", "xor", "caesar", "decoder", "forensics"],
  },
  {
    slug: "qr-reader",
    name: "QR reader",
    blurb:
      "Decodes QR codes from uploaded or pasted images with jsQR, classifies payloads (URL, Wi-Fi, vCard, OTP secret), and generates short codes. Runs in the browser.",
    category: "security",
    keywords: ["qr", "qr code", "zbar", "jsqr", "barcode", "wifi", "vcard", "otpauth", "steganography", "ctf"],
  },
  {
    slug: "rsa-tool",
    name: "RSA toy tool",
    blurb:
      "Toy RSA for small CTF numbers: factor n by trial division or Fermat, derive d and CRT values, and encrypt or decrypt with every step shown. Browser only.",
    category: "security",
    keywords: ["rsa", "modular arithmetic", "factoring", "fermat", "trial division", "extended euclid", "ctf", "bigint"],
  },
  {
    slug: "strings-extractor",
    name: "Strings extractor",
    blurb:
      "Extracts printable ASCII and UTF-16LE strings with byte offsets, a length slider and regex filter, and tags URLs, emails, flags and Base64, in the browser.",
    category: "security",
    keywords: ["strings", "ascii", "utf-16", "utf16le", "binary", "ctf", "forensics", "regex", "flag", "base64"],
  },
  {
    slug: "transform-pipeline",
    name: "Transform pipeline",
    blurb:
      "Chain encoders, decoders, ciphers, compression and hashes in any order. Each step shows its output and everything runs in your browser.",
    category: "encoding",
    keywords: ["cyberchef", "base64", "base32", "hex", "binary", "rot13", "rot47", "xor", "gzip", "zlib", "sha256", "morse", "ctf", "decode", "encode", "pipeline"],
  },
  {
    slug: "unicode-inspector",
    name: "Unicode inspector",
    blurb:
      "Lists each code point with its category, script, UTF-8 and UTF-16 bytes, and flags zero-width, bidi, tag, lookalike and non-NFC characters. Runs in the browser.",
    category: "encoding",
    keywords: ["unicode", "homoglyph", "zero-width", "bidi", "trojan source", "utf-8", "utf-16", "nfc", "nfkc", "tag characters", "osint", "phishing"],
  },
  {
    slug: "url-analyzer",
    name: "URL analyzer",
    blurb:
      "Splits a URL as typed and as browsers parse it, decodes percent-encoding layer by layer, reads punycode hosts, and rebuilds it from edits. Runs in the browser.",
    category: "networking",
    keywords: ["url", "uri", "punycode", "idn", "homograph", "percent-encoding", "double-encoding", "open-redirect", "ctf", "web"],
  },
  {
    slug: "vigenere-solver",
    name: "Vigenere solver",
    blurb:
      "Vigenere encrypt and decrypt with a known key, plus a breaker: index of coincidence, Kasiski spacing and per-column chi-squared fit. Runs in the browser.",
    category: "security",
    keywords: ["vigenere", "polyalphabetic", "kasiski", "index of coincidence", "chi-squared", "key length", "ctf", "cryptanalysis"],
  },
  {
    slug: "xor-tool",
    name: "XOR tool",
    blurb:
      "XOR hex or text against a key, score all 256 single-byte keys, and recover a repeating key from a known-plaintext crib. Runs in your browser.",
    category: "security",
    keywords: ["xor", "single byte", "brute force", "crib", "known plaintext", "repeating key", "ctf", "crypto", "hex", "cryptanalysis"],
  },
  {
    slug: "zip-inspector",
    name: "Zip inspector",
    blurb:
      "Lists every zip entry from the central directory, flags zip slip and header mismatches, reads comments, and handles gzip and zlib. Runs in the browser.",
    category: "security",
    keywords: ["zip", "zip slip", "unzip", "zipinfo", "gzip", "zlib", "archive", "central directory", "ctf", "comment"],
  },
];

export function getTool(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function toolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOLS.filter((tool) => tool.category === category);
}
