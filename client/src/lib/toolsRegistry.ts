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
  {
    slug: "eui64-generator",
    name: "EUI-64 generator",
    blurb:
      "Builds the modified EUI-64 interface ID, link-local and SLAAC address from a MAC step by step, and recovers the MAC from an address. Runs in your browser.",
    category: "networking",
    keywords: ["eui-64", "slaac", "mac address", "interface identifier", "link-local", "ipv6", "privacy address", "rfc 4291", "ff:fe"],
  },
  {
    slug: "ipv6-calculator",
    name: "IPv6 calculator",
    blurb:
      "Expands, compresses and classifies an IPv6 address, and gives the network, first and last address, and /64 count for its prefix. Runs in your browser.",
    category: "networking",
    keywords: ["ipv6", "prefix", "rfc 5952", "compress", "expand", "subnet", "link-local", "ula", "multicast", "reverse dns"],
  },
  {
    slug: "asn-converter",
    name: "AS number converter",
    blurb:
      "Convert 32-bit AS numbers between asplain and asdot, classify private, documentation and reserved ranges, and paste a whole list at once.",
    category: "networking",
    keywords: ["asn", "autonomous system", "asdot", "asplain", "bgp", "4-byte asn", "as_trans", "private asn", "rfc 5396", "rfc 6793"],
  },
  {
    slug: "bandwidth-delay-product",
    name: "Bandwidth-delay product",
    blurb:
      "Computes the bandwidth-delay product, the TCP window and scale factor a path needs, window-limited throughput and a Mathis loss estimate. Runs in your browser.",
    category: "networking",
    keywords: ["bdp", "tcp window", "window scaling", "rfc 7323", "rtt", "latency", "throughput", "mathis", "long fat network", "rwnd"],
  },
  {
    slug: "bgp-community-decoder",
    name: "BGP community decoder",
    blurb:
      "Decode standard, large and extended BGP communities, convert ASN:value to the 32-bit integer and back, and flag well-known values and private ASNs.",
    category: "networking",
    keywords: ["bgp", "community", "no-export", "blackhole", "large community", "extended community", "route target", "rfc 1997", "rfc 8092", "rfc 4360"],
  },
  {
    slug: "ip-range-to-cidr",
    name: "IP range to CIDR",
    blurb:
      "Turn a start and end IPv4 address into the fewest CIDR blocks that cover it exactly, or merge a list of blocks into sorted ranges. Runs in your browser.",
    category: "networking",
    keywords: ["cidr", "ip range", "ipv4", "aggregation", "summarize", "merge", "prefix", "supernet", "allowlist"],
  },
  {
    slug: "iperf3-command-builder",
    name: "iperf3 command builder",
    blurb:
      "Builds iperf3 TCP and UDP throughput commands for server and client, and reads bitrate and retransmits from a pasted result. Runs in your browser.",
    category: "networking",
    keywords: ["iperf3", "throughput", "bandwidth", "tcp", "udp", "network test", "jitter", "retransmits"],
  },
  {
    slug: "ip-address-converter",
    name: "IPv4 address converter",
    blurb:
      "Converts an IPv4 address between dotted decimal, integer, hex, octal and binary, and shows how inet_aton and browsers read forms like 127.1.",
    category: "networking",
    keywords: ["ipv4", "integer", "hex", "octal", "binary", "dotted decimal", "inet_aton", "ssrf", "url parsing"],
  },
  {
    slug: "mtu-mss-calculator",
    name: "MTU and MSS calculator",
    blurb:
      "Stack PPPoE, GRE, VXLAN, WireGuard, IPsec and VLAN headers on a link MTU to get the inner MTU, TCP MSS and clamp commands. Runs in your browser.",
    category: "networking",
    keywords: ["mtu", "mss", "mss clamping", "tunnel overhead", "pppoe", "wireguard", "ipsec", "vxlan", "gre", "path mtu"],
  },
  {
    slug: "multicast-mac-mapper",
    name: "Multicast MAC mapper",
    blurb:
      "Maps IPv4 and IPv6 multicast groups to Ethernet MAC addresses and back, and lists the 32 IPv4 groups that share each MAC. Runs in your browser.",
    category: "networking",
    keywords: ["multicast", "mac address", "igmp", "01:00:5e", "33:33", "ipv6", "solicited-node", "ospf", "mdns", "rfc 1112"],
  },
  {
    slug: "ospf-cost-calculator",
    name: "OSPF cost calculator",
    blurb:
      "Computes OSPF interface costs from a reference bandwidth, compares two paths hop by hop, and writes the IOS and FRR configuration. Runs in your browser.",
    category: "networking",
    keywords: ["ospf", "cost", "reference bandwidth", "auto-cost", "routing", "metric", "spf", "ccna", "frr", "cisco ios"],
  },
  {
    slug: "propagation-delay-calculator",
    name: "Propagation delay calculator",
    blurb:
      "One-way and round-trip propagation delay over fiber, copper, radio or a satellite hop, with city distances and serialization delay. Runs in your browser.",
    category: "networking",
    keywords: ["latency", "propagation delay", "rtt", "speed of light", "fiber", "serialization delay", "haversine", "great circle", "satellite", "bandwidth-delay product"],
  },
  {
    slug: "route-summarizer",
    name: "Route summarizer",
    blurb:
      "Paste IPv4 prefixes to get the exact aggregate and the tightest single summary route, with the extra addresses that summary would claim.",
    category: "networking",
    keywords: ["route summarization", "aggregation", "supernet", "cidr", "ospf", "eigrp", "bgp", "prefix list", "ipv4"],
  },
  {
    slug: "transfer-time-calculator",
    name: "Transfer time calculator",
    blurb:
      "Works out how long data takes to cross a link, or the speed needed to meet a deadline, keeping bits, bytes, SI and IEC units apart. Runs in your browser.",
    category: "networking",
    keywords: ["transfer time", "download time", "bandwidth", "mbps", "throughput", "gib vs gb", "bits vs bytes", "file transfer", "goodput"],
  },
  {
    slug: "vlan-tag-decoder",
    name: "VLAN tag decoder",
    blurb:
      "Decode or build 802.1Q and QinQ tags: TPID, priority code point, DEI and VLAN ID, with reserved VIDs and unusual tag stacks flagged. Runs in your browser.",
    category: "networking",
    keywords: ["802.1q", "vlan", "qinq", "802.1ad", "pcp", "dei", "vlan id", "tpid", "class of service", "trunk"],
  },
  {
    slug: "wifi-channel-reference",
    name: "Wi-Fi channel reference",
    blurb:
      "Interactive 2.4, 5 and 6 GHz channel chart with center frequencies, overlap, DFS and bonding groups, and US regulatory notes. Runs in your browser.",
    category: "networking",
    keywords: ["wifi", "wireless", "802.11", "dfs", "unii", "6 ghz", "channel width", "psc", "frequency", "wlan"],
  },
  {
    slug: "wildcard-mask-calculator",
    name: "Wildcard mask calculator",
    blurb:
      "Convert subnet masks and prefixes to Cisco wildcard masks and back, build ACL and OSPF lines, and test an address against a pattern bit by bit.",
    category: "networking",
    keywords: ["wildcard", "cisco", "acl", "access-list", "ospf", "inverse mask", "ios", "ccna", "netmask"],
  },
  {
    slug: "cvss-calculator",
    name: "CVSS calculator",
    blurb:
      "Scores CVSS v3.1 base, temporal and environmental metrics to the FIRST specification, parses vector strings and shows the arithmetic. Runs in your browser.",
    category: "security",
    keywords: ["cvss", "vulnerability", "severity", "cve", "nvd", "vector string", "base score", "first", "risk"],
  },
  {
    slug: "dmarc-record-analyzer",
    name: "DMARC record analyzer",
    blurb:
      "Parses a v=DMARC1 record, explains its policy and alignment, checks report destinations, and builds a valid record from a form. Runs in your browser.",
    category: "security",
    keywords: ["dmarc", "rfc 7489", "rfc 9989", "email authentication", "alignment", "rua", "dkim", "spf", "dmarc policy", "email spoofing"],
  },
  {
    slug: "file-hash-checker",
    name: "File hash checker",
    blurb:
      "Compute MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of a file or text and check them against a pasted checksum or checksum file. Runs in your browser.",
    category: "security",
    keywords: ["md5", "sha-256", "checksum", "hash", "sha-1", "integrity", "sha-512", "sha256sum"],
  },
  {
    slug: "nmap-command-builder",
    name: "Nmap command builder",
    blurb:
      "Builds an Nmap command from scan type, ports, timing and scripts, flags which options need root, and explains what it does. Runs in your browser.",
    category: "security",
    keywords: ["nmap", "port scan", "syn scan", "nse", "service detection", "os detection", "reconnaissance", "security"],
  },
  {
    slug: "ntlm-hash-generator",
    name: "NTLM hash generator",
    blurb:
      "Generate the NT hash (MD4 of the UTF-16LE password) with the hashcat, John and pwdump line formats. Runs in your browser.",
    category: "security",
    keywords: ["ntlm", "nt hash", "md4", "hashcat", "john", "pass-the-hash", "windows", "password"],
  },
  {
    slug: "password-generator",
    name: "Password generator",
    blurb:
      "Generates passwords and grouped PIN codes with crypto.getRandomValues and rejection sampling, and shows the exact entropy. Runs in your browser.",
    category: "security",
    keywords: ["password", "random", "csprng", "entropy", "pin", "modulo bias", "rejection sampling", "getrandomvalues", "crockford"],
  },
  {
    slug: "spf-record-analyzer",
    name: "SPF record analyzer",
    blurb:
      "Parses a v=spf1 record, explains each term in evaluation order, counts DNS lookups against the limit of 10, and flags risky settings. Runs in your browser.",
    category: "security",
    keywords: ["spf", "rfc 7208", "email authentication", "dns lookup limit", "txt record", "include", "softfail", "permerror", "email spoofing", "mail server"],
  },
  {
    slug: "user-agent-parser",
    name: "User-Agent parser",
    blurb:
      "Identifies the browser, engine, OS, device type and known bots or scanners in User-Agent strings, header blocks or access log lines. Runs in your browser.",
    category: "security",
    keywords: ["user agent", "ua string", "browser detection", "client hints", "sec-ch-ua", "bot detection", "googlebot", "access log", "spoofing", "fingerprinting"],
  },
  {
    slug: "luhn-checker",
    name: "Luhn checker",
    blurb:
      "Validate a Luhn check digit or compute one step by step, with card brand detection from IIN ranges and IMEI support. Runs in your browser.",
    category: "encoding",
    keywords: ["luhn", "mod 10", "check digit", "credit card", "card validation", "iin", "bin", "imei", "checksum"],
  },
  {
    slug: "snowflake-decoder",
    name: "Snowflake ID decoder",
    blurb:
      "Decode X/Twitter and Discord snowflake IDs into creation time and machine fields, sort a batch by time, or build the ID range for a date. Runs in your browser.",
    category: "encoding",
    keywords: ["snowflake", "twitter id", "discord id", "osint", "tweet date", "account creation", "timestamp", "epoch", "bigint"],
  },
  {
    slug: "uuid-tool",
    name: "UUID generator and decoder",
    blurb:
      "Generates v4 and v7 UUIDs in bulk or v3 and v5 from a name, and decodes any UUID's version, variant, timestamp, clock sequence and node. Runs in your browser.",
    category: "encoding",
    keywords: ["uuid", "guid", "uuidv7", "uuidv4", "uuidv1", "rfc 9562", "mac address", "timestamp", "forensics", "osint"],
  },
  {
    slug: "access-log-analyzer",
    name: "Access log analyzer",
    blurb:
      "Parses Apache and nginx access logs, summarizes traffic by IP, path, status and time, and flags scanners, injection attempts and probes. Runs in your browser.",
    category: "security",
    keywords: ["apache", "nginx", "access log", "combined log format", "web server logs", "sqlmap", "log4shell", "incident response", "threat hunting"],
  },
  {
    slug: "affine-cipher",
    name: "Affine cipher",
    blurb:
      "Encrypt and decrypt with E(x) = (ax + b) mod 26, rank all 312 keys by English letter frequency, or solve for the key from two known letter pairs.",
    category: "security",
    keywords: ["affine", "modular inverse", "caesar", "atbash", "brute force", "chi-squared", "known plaintext", "cipher", "ctf"],
  },
  {
    slug: "bacon-cipher",
    name: "Bacon cipher",
    blurb:
      "Encode and decode Bacon's cipher in groups of five with the 24 or 26 letter table, or hide a message in a cover text's case or typeface. Runs in your browser.",
    category: "security",
    keywords: ["bacon", "baconian", "biliteral", "steganography", "letter case", "francis bacon", "ctf", "cipher"],
  },
  {
    slug: "csp-analyzer",
    name: "CSP analyzer",
    blurb:
      "Parses a Content-Security-Policy, shows which directive governs each request type after fallback, and grades each weakness by severity. Runs in your browser.",
    category: "security",
    keywords: ["content security policy", "csp", "xss", "nonce", "strict-dynamic", "unsafe-inline", "default-src", "frame-ancestors", "csp evaluator"],
  },
  {
    slug: "entropy-analyzer",
    name: "Entropy analyzer",
    blurb:
      "Measures Shannon entropy in bits per byte, plots it across a file with a sliding window, and lists high-entropy regions by offset. Runs in your browser.",
    category: "security",
    keywords: ["shannon entropy", "bits per byte", "packed malware", "encryption", "compression", "byte histogram", "chi-square", "firmware", "binwalk", "forensics"],
  },
  {
    slug: "security-headers-analyzer",
    name: "Security headers analyzer",
    blurb:
      "Audits pasted response headers: HSTS, CSP, framing, nosniff, cookies and version leaks, then suggests a header block. Runs in your browser.",
    category: "security",
    keywords: ["security headers", "hsts", "http headers", "x-frame-options", "referrer-policy", "permissions-policy", "set-cookie", "clickjacking", "curl", "coop"],
  },
  {
    slug: "dhcp-option-121-encoder",
    name: "DHCP option 121 encoder",
    blurb:
      "Encode classless static routes for DHCP option 121 or 249 as hex, ISC dhcpd, Kea and dnsmasq config, or decode a pasted option back to routes.",
    category: "networking",
    keywords: ["dhcp", "option 121", "option 249", "rfc 3442", "classless static routes", "static route", "dnsmasq", "kea", "isc dhcpd"],
  },
  {
    slug: "tcpdump-filter-builder",
    name: "tcpdump filter builder",
    blurb:
      "Build a tcpdump capture filter from hosts, ports, protocols and TCP flags, with each primitive explained, the full command and the closest Wireshark filter.",
    category: "networking",
    keywords: ["tcpdump", "bpf", "capture filter", "pcap", "libpcap", "wireshark", "display filter", "tcp flags", "packet capture"],
  },
  {
    slug: "hmac-generator",
    name: "HMAC generator",
    blurb:
      "Computes and verifies HMAC-SHA-1, SHA-256, SHA-384 and SHA-512 over text, hex or Base64 input, using a constant-time comparison. Runs in your browser.",
    category: "security",
    keywords: ["hmac", "sha256", "sha-1", "sha512", "timing attack", "signature", "webhook", "verify", "rfc 2104", "rfc 4231"],
  },
  {
    slug: "playfair-cipher",
    name: "Playfair cipher",
    blurb:
      "Build the 5x5 key square, split text into digraphs with X fillers, and encrypt or decrypt pair by pair with each rule shown. Runs in your browser.",
    category: "security",
    keywords: ["playfair", "digraph", "key square", "wheatstone", "classical cipher", "polygraphic substitution", "ctf", "5x5 grid", "decrypt"],
  },
  {
    slug: "rail-fence-cipher",
    name: "Rail fence cipher",
    blurb:
      "Encrypt and decrypt with a chosen rail count and offset, see the zigzag, and brute force an unknown key ranked by English score. Runs in your browser.",
    category: "security",
    keywords: ["rail fence", "zigzag cipher", "transposition", "brute force", "ctf", "classical cipher", "cyberchef", "quadgram", "decrypt"],
  },
  {
    slug: "totp-generator",
    name: "TOTP generator",
    blurb:
      "Generates TOTP and HOTP codes from a Base32 secret or otpauth URI, shows every truncation step, and checks codes against a drift window. Runs in your browser.",
    category: "security",
    keywords: ["totp", "hotp", "2fa", "mfa", "otp", "otpauth", "authenticator", "rfc 6238", "rfc 4226", "one-time password"],
  },
  {
    slug: "endianness-converter",
    name: "Endianness converter",
    blurb:
      "Reads hex bytes or an integer as 16, 32 and 64-bit integers and floats in both byte orders, with byte swaps and htonl notes. Runs in your browser.",
    category: "encoding",
    keywords: ["endianness", "byte order", "big endian", "little endian", "htonl", "ntohs", "byte swap", "network byte order", "dataview", "bswap"],
  },
  {
    slug: "ieee754-inspector",
    name: "IEEE 754 inspector",
    blurb:
      "Shows the float32 and float64 bits of a number, its exact stored value and rounding error, and lets you toggle each bit. Runs in your browser.",
    category: "encoding",
    keywords: ["ieee 754", "floating point", "float32", "float64", "binary64", "nan", "subnormal", "rounding error", "ulp", "0.1 + 0.2"],
  },
  {
    slug: "raid-rebuild-risk",
    name: "RAID rebuild risk",
    blurb:
      "Estimate rebuild time and the chance of an unrecoverable read error during a RAID 5 or RAID 6 rebuild, from disk size and URE rating. Runs in your browser.",
    category: "infrastructure",
    keywords: ["raid", "raid 5", "raid 6", "ure", "rebuild", "unrecoverable read error", "storage", "parity", "disk failure", "scrub"],
  },
  {
    slug: "ups-runtime-calculator",
    name: "UPS runtime calculator",
    blurb:
      "Estimate UPS battery runtime with inverter efficiency, depth of discharge and Peukert's law, and check the load against both VA and watt ratings.",
    category: "infrastructure",
    keywords: ["ups", "battery", "runtime", "peukert", "va", "watts", "power factor", "lead-acid", "inverter", "backup power"],
  },
  {
    slug: "ssh-config-builder",
    name: "SSH config builder",
    blurb:
      "Build ~/.ssh/config Host blocks with jumps, forwards, and multiplexing, and see the equivalent ssh command. Runs in your browser.",
    category: "systems",
    keywords: ["ssh", "ssh config", "proxyjump", "bastion", "port forwarding", "controlmaster", "identityfile", "openssh"],
  },
  {
    slug: "sudoers-explainer",
    name: "Sudoers explainer",
    blurb:
      "Paste sudoers lines and read each rule in plain language, with risky grants like NOPASSWD and shell escapes flagged. Runs in your browser.",
    category: "systems",
    keywords: ["sudo", "sudoers", "visudo", "nopasswd", "privilege escalation", "linux", "shell escape", "cmnd_alias"],
  },
];

export function getTool(slug: string): ToolEntry | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}

export function toolsByCategory(category: ToolCategory): ToolEntry[] {
  return TOOLS.filter((tool) => tool.category === category);
}
