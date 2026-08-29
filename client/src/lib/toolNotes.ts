/**
 * The explanatory notes under every tool.
 *
 * These were JSX inside each tool component, which meant they existed only
 * once React had booted. The prerendered HTML for /tools/subnet-calculator
 * and its fifteen siblings carried a heading and one sentence, so the pages
 * aimed at the highest-traffic queries on this site were the emptiest ones a
 * crawler could fetch. Moving the prose here lets ToolShell render it and the
 * prerenderer emit it, from one copy.
 *
 * A paragraph is a list of spans so that inline code and emphasis survive
 * without either side needing dangerouslySetInnerHTML. Numbers that also
 * govern behaviour are interpolated from the constants themselves rather than
 * retyped, so prose and behaviour cannot disagree.
 */
import { BTU_PER_WATT, IN_ROOM_LOSS_FACTOR } from "./capacity";
import { MAX_LEVELS, MAX_LISTED, TIME_BUDGET_MS } from "./toolLimits";

/** Inline code, emphasised text, or a run of plain prose. */
export type NoteSpan = string | { code: string } | { em: string };

/** One paragraph. */
export type NotePara = NoteSpan[];

export const TOOL_NOTES: Record<string, NotePara[]> = {
  "base-converter": [
    [
      "Binary, octal and hex are all just binary in different sized groups. One hex digit is exactly four bits and one octal digit is exactly three, which is why hex won: four divides evenly into 8, 16, 32 and 64, so a byte is always two hex digits and the boundary between digits never moves. Octal does not divide evenly into a byte, which is why it survives in exactly one place people still meet it every day, Unix file modes, where three bits per digit is precisely what read, write and execute need.",
    ],
    [
      "Two's complement is how every modern machine stores a signed integer. Take the top bit and give it a negative weight: in eight bits the bits are worth -128, 64, 32, 16, 8, 4, 2, 1 instead of 128, 64, 32 and so on. That single change means addition, subtraction and comparison hardware does not need to know or care whether a value is signed. To negate a number you invert every bit and add one, which is the same as subtracting it from 2^n. All ones is -1, not the largest value, and the sign bit alone, 1000 0000, is the most negative value rather than zero.",
    ],
    [
      "The asymmetry is worth internalising because it causes real bugs. An n bit signed range runs from -2^(n-1) to 2^(n-1) - 1, so there is one more negative number than positive: -128 to 127 in a byte, -2147483648 to 2147483647 in a 32 bit int. That means the most negative value has no positive counterpart, so negating it overflows and gives you back itself, and taking its absolute value does the same. That is CWE-191, integer underflow, and it is the mechanism behind a long list of memory corruption bugs where a length check passed because a negative number wrapped around into a very large unsigned one.",
    ],
    [
      "Width matters as much as signedness. Truncating to a narrower type keeps the low bits and throws the rest away, so 300 stored in a byte becomes 44, and a value that passed a bounds check as a 32 bit integer can fail it as a 16 bit one. This page shows the truncation rather than hiding it: type a number too large for the selected width and it keeps the low bits and says so, which is exactly what the C cast would do.",
    ],
  ],
  "chmod-calculator": [
    [
      "A Unix mode is twelve bits, printed as four octal digits. The right three digits are read (4), write (2) and execute (1) for the owner, the group and everyone else, added together: 6 is read plus write, 7 is all three, 5 is read plus execute. The leading digit carries setuid (4), setgid (2) and the sticky bit (1), and it is the digit most people forget exists, which is why ",
      { code: "chmod 755" },
      "  quietly clears a setgid bit that someone set on purpose. Writing the mode as four digits every time makes that intent explicit.",
    ],
    [
      "The three permission bits mean different things on a directory than on a file. On a file they are what you expect. On a directory, read lets you list the names inside, write lets you create and remove entries, and execute (often called the search bit) lets you traverse into it to reach a known path. A directory with read but no execute gives you the file names and nothing else; a directory with execute but no read lets you open ",
      { code: "/srv/app/config.yml" },
      " if you already know that exact name, but ",
      { code: "ls" },
      " returns permission denied. That asymmetry is what makes mode 711 on a home directory a real pattern rather than a mistake.",
    ],
    [
      "setuid on an executable makes the process run with the file owner's identity instead of the caller's, which is how an unprivileged user runs  ",
      { code: "passwd" },
      " and still gets a write to ",
      { code: "/etc/shadow" },
      ". It is also the single richest source of local privilege escalation, so a setuid root binary that shells out, honours ",
      { code: "$PATH" },
      ", or is writable by anyone but root is a finding, not a curiosity. setgid does the same trick for the group, and on a directory it does something different and much more useful: files created inside inherit the directory's group, which is the normal way to keep a shared project tree consistently group-owned.",
    ],
    [
      "The sticky bit only matters on directories now. Without it, write permission on a directory is permission to delete anything in it, including files you do not own, because deletion modifies the directory rather than the file. That is intolerable for a world-writable scratch space, so ",
      { code: "/tmp" },
      " is mode 1777: anyone may create files there, but only a file's owner, the directory's owner, or root may rename or remove a given file. If you ever create a shared drop directory, mode 1777 or 1770 is almost always what you actually meant by 777.",
    ],
  ],
  "cidr-visualizer": [
    [
      "CIDR replaced the old class A, B, and C boundaries in 1993 (RFC 1518 and RFC 1519) with a single idea: a prefix length says how many leading bits are fixed, and everything after them is free. That makes address space a binary tree. Adding one bit to the mask splits a block cleanly into two halves, adding two bits gives four quarters, and no block can ever straddle a boundary, which is why 192.168.8.0/22 is legal and 192.168.9.0/22 is not.",
    ],
    [
      "The same property running in reverse is route aggregation. Two adjacent blocks of the same size that share every bit except the last one of the prefix can be advertised as a single shorter prefix. That is why an ISP hands out 203.0.113.0/24 rather than 256 scattered host routes, and why the global routing table is roughly a million entries instead of billions.",
    ],
    [
      "Reading a block boundary by hand is easier than it looks. Find the octet the prefix ends in, subtract the mask value in that octet from 256, and you have the step between networks: a /26 has 192 in the fourth octet, so blocks appear every 64 addresses. The same trick tells you at a glance whether an address belongs to a block, which is the question an ACL or a firewall rule is really asking.",
    ],
    [
      "The diagram stops after ",
      String(MAX_LEVELS),
      " levels and the list stops at ",
      String(MAX_LISTED),
      " blocks. Deeper splits are still counted correctly, they are just not drawn, because a /8 divided into /24s is 65,536 rectangles and none of them would be a pixel wide.",
    ],
  ],
  "classical-ciphers": [
    [
      "A Caesar cipher shifts every letter by a fixed amount, so there are only 25 keys worth trying and the whole thing falls to a brute force you can read with your eyes. That is what the panel of 25 shifts is for: it is faster than reasoning about the key, and it is exactly what you do first in a competition when a string looks like English with the letters wrong. ROT13 is a Caesar shift of thirteen, and because thirteen is half of twenty six it is its own inverse, which is why it became the convention for hiding spoilers rather than for hiding anything that mattered. Atbash maps A to Z, B to Y and so on, which is a fixed substitution with no key at all.",
    ],
    [
      "When brute force is not available, letter frequency is the next move, and the chart above is the standard first look at an unknown substitution cipher. English text has a very distinctive profile: E at about 12.7 percent, then T, A, O, I and N, with J, Q, X and Z all under a quarter of a percent between them. Any cipher that maps each plaintext letter to one ciphertext letter preserves that shape exactly, it only relabels the bars. So if the tallest bar in a ciphertext is at K, K is probably E, and for a Caesar cipher that single guess gives you the key. This page ranks the 25 candidates by chi-squared distance from English, which is the same reasoning done arithmetically instead of by eye.",
    ],
    [
      "Vigenere is the one that resists that attack, and understanding why is the point of it. The key repeats over the message and each key letter applies its own Caesar shift, so the same plaintext letter becomes different ciphertext letters depending on where it falls. That flattens the frequency chart and defeats naive counting, which is why it was called  ",
      { em: "le chiffre indechiffrable" },
      " for three centuries. It is not indecipherable. Kasiski examination finds repeated ciphertext sequences and takes the distances between them, whose common factors reveal the key length. Once you know the length, the message splits into that many independent Caesar ciphers, one for every key position, and each falls to frequency analysis on its own.",
    ],
    [
      "None of this is security, and it is worth being precise about why. A cipher whose keyspace is 25 is broken by counting, and a repeating key is broken by finding the period. The one classical scheme that is genuinely unbreakable is the one time pad, which is Vigenere with a key as long as the message, used once, and truly random. Break any one of those three conditions and it collapses back into something analysable. These ciphers remain useful for one thing: they show up constantly in capture the flag puzzles, in the National Cyber League, and in beginner forensics challenges, usually stacked on top of Base64 or hex. Recognising them quickly is a real skill even though the ciphers themselves are museum pieces.",
    ],
  ],
  "cron-explainer": [
    [
      "A crontab line is five whitespace separated fields: minute, hour, day of month, month, day of week, then the command. Each field takes an asterisk for \"every\", a number, a range like ",
      { code: "1-5" },
      ", a comma separated list, or a step like  ",
      { code: "*/15" },
      ". Months accept ",
      { code: "JAN" },
      " through ",
      { code: "DEC" },
      " and days accept ",
      { code: "SUN" },
      " through ",
      { code: "SAT" },
      ". Day of week runs 0 to 7 with both 0 and 7 meaning Sunday, which is a small mercy given how often people guess wrong about which end the week starts.",
    ],
    [
      "The rule that catches everyone is how the two day fields combine. When day of month and day of week are both restricted, cron fires if ",
      { em: "either" },
      " one matches, not both. ",
      { code: "0 0 13 * 5" },
      " does not mean \"Friday the 13th\"; it means every 13th of the month ",
      { em: "and" },
      " every Friday. To get the intersection you have to leave one field as an asterisk, or do the check inside the command itself. In the original Vixie implementation the switch is literally whether the field starts with an asterisk, so ",
      { code: "*/2" },
      " in the day-of-month field still counts as unrestricted for the purposes of that test.",
    ],
    [
      "Cron has no timezone of its own. It runs in whatever timezone the daemon's system clock is set to, which on a server is usually UTC and on a laptop usually is not. The times listed above are computed in the timezone your browser reports, so they are what you would see if the machine running the job shared your clock. If it does not, translate first. Daylight saving makes this worse: on the spring transition the skipped hour means jobs scheduled inside it may not run at all, and on the autumn transition the repeated hour means they may run twice. Anything financial, billing related, or ordering sensitive belongs at a time of day that never disappears, or on a UTC clock, or on a systemd timer with  ",
      { code: "Persistent=true" },
      " so a missed run is caught up rather than lost.",
    ],
    [
      "Two smaller habits worth having. Cron runs with a nearly empty environment, so a script that works in your shell frequently fails under cron because  ",
      { code: "$PATH" },
      " is short and your profile was never sourced: use absolute paths and set the variables you need inside the script. And a percent sign in a crontab command is not a percent sign, it is a newline that feeds the rest of the line to the command on standard input, so any date format string with  ",
      { code: "%Y" },
      " in it has to be escaped as ",
      { code: "\\%Y" },
      ".",
    ],
  ],
  "dns-records": [
    [
      "A DNS answer is never a single record, it is a resource record set: every record of the same name, class, and type, returned together and sharing one TTL. That detail explains most of the rules here. It is why all the A records for a name expire at the same moment, why DNSSEC signs a set rather than a record, and why a name holding a CNAME cannot hold anything else, since the alias would have to apply to some sets and not others.",
    ],
    [
      "TTLs are the only cache invalidation DNS has. Whatever value you publish is how long resolvers may keep serving the old answer after you change it, and nothing you do can pull it back early. The working practice is to drop the TTL to sixty seconds a day or two before a planned migration, make the change, confirm it, then raise the TTL again.",
    ],
    [
      "Underscore labels mark names that are protocol data rather than hosts: _dmarc for DMARC policy, _sip._tcp for SRV lookups, _acme-challenge for certificate validation. The underscore is not special to DNS itself, it is a convention that keeps these names from ever colliding with a real hostname, because a hostname is not allowed to contain one.",
    ],
    [
      "When something is broken, query the authoritative server directly with  ",
      { code: "dig +norecurse @ns1.example.net" },
      " before you trust anything a recursive resolver tells you. Half of all DNS problems are a stale cache, and the other half are a change that was made on one nameserver out of four.",
    ],
  ],
  "encoder-decoder": [
    [
      "Every conversion here goes through raw bytes. That sounds like an implementation detail and it is actually the whole point: Base64 encodes bytes, not characters, and the step everyone skips is deciding how the text became bytes in the first place. This page uses UTF-8, because that is what the web uses. The browser's own  ",
      { code: "btoa" },
      " does not: it expects a string where every character fits in one byte, so it throws an InvalidCharacterError the first time it meets a character above U+00FF, and the usual workaround of  ",
      { code: "btoa(unescape(encodeURIComponent(s)))" },
      " works only because it is doing the UTF-8 step by hand. ",
      { code: "TextEncoder" },
      " and ",
      { code: "TextDecoder" },
      " do it properly, and they can also tell you when a byte sequence is not valid UTF-8 at all, which is information you usually want rather than a string full of replacement characters.",
    ],
    [
      "Base64 turns three bytes into four characters, so the output is always about a third larger than the input. The padding at the end exists because the last group may be short: one leftover byte becomes two characters and two equals signs, two leftover bytes become three characters and one equals sign. A length that leaves a remainder of exactly one character is therefore impossible, which is a quick way to spot truncated data. Base64URL is the same encoding with two substitutions, minus for plus and underscore for slash, and usually with the padding stripped, because plus, slash and equals all mean something in a URL or a filename. JWTs use Base64URL, which is why pasting a token into a standard Base64 decoder sometimes works and sometimes does not: it depends on whether the random bytes in that particular token happened to produce a minus or an underscore.",
    ],
    [
      "Percent encoding has a trap worth knowing. In a URL path or query, ",
      { code: "+" },
      "  is a literal plus sign, and this tool treats it that way. In an HTML form submission with the content type  ",
      { code: "application/x-www-form-urlencoded" },
      ", a plus means a space. Same looking string, two different meanings, decided entirely by context, and the reason a search for \"C++\" occasionally comes back as \"C \". Note also that the unreserved set is small: letters, digits, hyphen, period, underscore and tilde. Everything else is safest encoded, and encoding something that did not need it is harmless while the reverse is not.",
    ],
    [
      "ROT13 and hex are here because they are the first two things to try on a capture the flag string, not because either is a security control. ROT13 is a Caesar shift of thirteen, which on a 26 letter alphabet makes it its own inverse: apply it twice and you are back where you started. Encoding is not encryption, and the practical consequence is that a value which is merely Base64 encoded in a cookie, a URL, or a config file is public. If a capture the flag string does not decode cleanly here, check the length: a hex string with an odd number of digits, or a Base64 string whose length leaves a remainder of one, has usually lost a character somewhere in a copy and paste.",
    ],
  ],
  "hash-identifier": [
    [
      "Identifying a hash from the value alone is a matter of shape, not content. A digest is a fixed number of bytes with no header and no metadata, so two algorithms that produce the same length are genuinely indistinguishable. MD5 and NTLM are both 32 hexadecimal characters, and nothing in the string itself will ever tell you which one you are holding.",
    ],
    [
      "That is why context usually decides. A 32-character hex string pulled out of a Windows domain controller is almost certainly NTLM. The same string in a web application database is almost certainly MD5. A 40-character hex string inside a git repository is a commit identifier rather than a password. The value tells you the length; where you found it tells you the algorithm.",
    ],
    [
      "The exception is the modular crypt formats, the ones beginning with a dollar sign. Those were designed to be self-describing: ",
      { code: "$2y$" },
      " is bcrypt, ",
      { code: "$6$" },
      " is sha512crypt, ",
      { code: "$argon2id$" },
      " is Argon2. They also carry their parameters, so you can read the bcrypt cost factor or the PBKDF2 iteration count straight out of the string. Those are the only cases where identification is certain rather than probable.",
    ],
    [
      "One thing worth internalising while studying for competitions: fast hashes are the wrong tool for passwords. MD5, SHA-1 and SHA-256 are designed to be quick, and a modern GPU computes billions of them per second. bcrypt, scrypt, yescrypt and Argon2 are deliberately slow and, in the later ones, deliberately memory-hungry, which is what makes large-scale guessing expensive rather than merely tedious.",
    ],
  ],
  "http-status-codes": [
    [
      "A status code is the only part of a response that every piece of infrastructure between the server and the client understands without parsing anything. Caches decide what to store from it, proxies decide what to retry, load balancers decide whether a backend is healthy, and monitoring decides whether to wake somebody up. That is why choosing one carelessly costs more than it looks like it should: an error hidden inside a 200 body is invisible to all of them, and a 500 returned for a client's malformed input sends an engineer to investigate a server that is working perfectly.",
    ],
    [
      "The class digit carries most of the meaning, and it is what a client should fall back to when it meets a code it does not recognise. RFC 9110 is explicit about this: an unknown 4xx must be treated as a generic 400, an unknown 5xx as a generic 500. That is what makes it safe to introduce a new code. The classes also encode the retry decision. A 4xx will fail the same way if you repeat it unchanged, so retrying is pointless. A 5xx might succeed later, so retrying with exponential backoff and jitter is correct. 429 and 503 are the two that tell you explicitly when to come back, via Retry-After, and honouring that header is the difference between a well behaved client and a participant in an outage.",
    ],
    [
      "Every code on this page is in the IANA HTTP Status Code Registry. Codes you will meet in the wild that are not include nginx's 499, which it logs when the client closes the connection before a response, and Cloudflare's 520 through 530 range for its own edge conditions. AWS load balancers add 460 and 463. These are useful in a log file and wrong in an API: an unregistered code means every client library falls back to guessing from the class digit, and you have gained nothing over the standard code that already describes the situation.",
    ],
    [
      "A last practical point about error bodies. RFC 9457, which replaced RFC 7807, defines a small JSON shape for the detail behind an error: a type URI, a title, a status, a detail string, and an instance. Using it costs nothing and means client code can read your errors without a bespoke parser for your service. Pair it with the right status code and a client can behave correctly on the status alone, then show something useful to a human from the body.",
    ],
  ],
  "mac-lookup": [
    [
      "A MAC address is 48 bits, and it is split in two. The first 24 bits are the Organisationally Unique Identifier, bought from the IEEE by the manufacturer, and the last 24 bits are whatever that manufacturer assigns to the individual interface. Twenty-four bits gives each OUI holder about sixteen million addresses, which is why large vendors own dozens of prefixes rather than one.",
    ],
    [
      "Two bits in the very first octet change the meaning of everything after them. The least significant bit is I/G: zero for a unicast address aimed at one interface, one for a group address. The next bit up is U/L: zero means the address came out of a registered OUI, one means it was made up locally. Both are the low bits of the first octet when the address is written in hex, and both are the first bits on the wire, because Ethernet transmits each octet least significant bit first.",
    ],
    [
      "A locally administered address is almost never a mystery, it is a hint. It usually means a virtual machine (QEMU and KVM use 52:54:00), a container (Docker's bridge hands out 02:42 followed by the container's IP), a bonded or bridged interface that inherited a synthetic address, or a phone doing MAC randomisation. Every modern mobile operating system now generates a fresh locally administered address per Wi-Fi network by default, which is why MAC-based device tracking and MAC-based access control both stopped working reliably.",
    ],
    [
      "The vendor table on this page holds roughly ninety prefixes chosen for how often they turn up, not for coverage. The IEEE Registration Authority publishes the authoritative list of every assignment, and that is what to check before putting a vendor attribution in a report. A lookup here that comes back empty means the prefix is not in this table, not that it is unassigned.",
    ],
  ],
  "packet-headers": [
    [
      "Every one of these diagrams is 32 bits wide because that is how the RFCs draw them, and because both IPv4 and TCP measure their own header length in 32-bit words. That is what IHL and Data Offset are: a count of rows. A value of 5 in either field means five rows, twenty bytes, no options. Anything larger means options are present, and both fields cap at 15, which is why options can never exceed 40 bytes in either protocol.",
    ],
    [
      "The two checksums do not cover the same thing. The IPv4 header checksum covers the header alone, so a router that decrements TTL has to recompute it at every hop. The TCP and UDP checksums cover their header, their payload, and a pseudo-header assembled from the IP source, destination, and protocol number. That pseudo-header is the reason a NAT device has to fix up the transport checksum after it rewrites an address, and it is why UDP's checksum is optional over IPv4 but mandatory over IPv6.",
    ],
    [
      "The flag bits are where most analysis actually happens. A segment with SYN set and ACK clear is a connection attempt, so a burst of them from one source is a scan or a SYN flood. A RST is a refusal, and telling RST apart from no answer at all is what separates a closed port from a filtered one. Nonsense combinations, all flags clear or FIN with PSH and URG together, are scan fingerprints rather than anything a real stack sends.",
    ],
    [
      "Reading the numbers here is a habit worth building, because it is the difference between \"Wireshark says the packet is malformed\" and knowing which byte is wrong. Click any field to see its bit offset, its width, and which byte of the header it starts in.",
    ],
  ],
  "port-reference": [
    [
      "Port numbers come in three ranges. 0 to 1023 are the well-known ports, which on Unix require root to bind, and that privilege requirement is the only real security property the range has. 1024 to 49151 are registered ports, assigned by IANA on request but not enforced by anything. 49152 to 65535 are dynamic or ephemeral, which is where your outbound connections get their source port from.",
    ],
    [
      "None of this is enforced by the protocol. A port number is just a 16-bit field in a TCP or UDP header, and nothing stops SSH from listening on 8080 or a backdoor from listening on 443. That is why service detection matters more than the number: nmap's -sV probes the service rather than trusting the port, and Wireshark will happily decode as HTTP whatever you tell it to.",
    ],
    [
      "The security notes here are the ones worth internalising. A short list of ports should never be reachable from the internet under any circumstances: 445 SMB, 135 MS RPC, 3389 RDP, 23 Telnet, 3306 and 5432 and 27017 for databases, 6379 Redis, 2375 Docker, 623 IPMI, and 11211 Memcached. Several of those had no authentication at all in their default configuration, and every one of them is scanned continuously.",
    ],
    [
      "Ports marked as conventional rather than assigned, 8080, 9000, 4444 and similar, are habits rather than standards. They are still worth knowing, because a scan result is a hypothesis and the conventional meaning is usually the right first guess.",
    ],
  ],
  "rack-budget": [
    [
      "Every figure here comes from the same constants the datacenter simulator on this site runs on, imported rather than copied, so the two cannot disagree. Watts convert to BTU per hour at  ",
      String(BTU_PER_WATT),
      ", a cooling ton is 12,000 BTU per hour, and cooling is sized against IT load times ",
      String(IN_ROOM_LOSS_FACTOR),
      " to cover in-room losses rather than against IT load alone, which is the mistake that leaves a room short on a hot day.",
    ],
    [
      "PUE is modelled, not measured. A small floor spreads fixed plant losses over less IT load, so it starts at 1.12 and worsens with scale up to a 1.40 cap. Real facilities vary widely; treat it as a planning figure and measure your own once there is something to meter.",
    ],
    [
      "The N+1 column adds one spare air handler so a single unit failing is not an outage. That is the minimum most designs assume, and it is why the unit count is usually one higher than the arithmetic alone suggests.",
    ],
  ],
  "regex-tester": [
    [
      "The flags matter more than people expect. Without ",
      { code: "g" },
      " a match is the first one and nothing else, which is why a replace that \"only fixed one line\" was never broken, it was just not global. ",
      { code: "m" },
      " changes  ",
      { code: "^" },
      " and ",
      { code: "$" },
      " from \"start and end of the string\" to \"start and end of every line\", which is what you nearly always want against a log file.  ",
      { code: "s" },
      " lets ",
      { code: "." },
      " cross a newline, and without it a pattern that spans two lines silently matches nothing. ",
      { code: "i" },
      " is case insensitivity, and ",
      { code: "u" },
      " switches the pattern to code point semantics so that an emoji or an astral character counts as one thing rather than two halves.",
    ],
    [
      "Catastrophic backtracking is the reason this page runs the match in a Web Worker. When a pattern contains nested quantifiers over overlapping alternatives, such as  ",
      { code: "(a+)+$" },
      " or ",
      { code: "(\\d+|\\s)*$" },
      ", the engine has an exponential number of ways to divide the input between the inner and outer repetition. On a string that nearly matches but fails at the end it will try all of them. Twenty characters is instant, thirty characters takes seconds, forty takes longer than you will wait. A JavaScript regex cannot be interrupted once it starts, so the only real defence on a web page is to run it somewhere you can kill, and terminating the worker is exactly that. If a pattern here times out at  ",
      String(TIME_BUDGET_MS),
      " ms, that is not a bug in the tool, it is the tool telling you the pattern is dangerous.",
    ],
    [
      "The same problem is a real denial of service class, ReDoS, and it is worth recognising in code review: a user supplied string fed to a regex with nested quantifiers, or an innocent looking validation pattern in a dependency, can take a whole request thread down. The fixes are boring and effective. Anchor the pattern, replace nested quantifiers with a possessive or atomic equivalent where the engine supports it, bound repetition with an explicit maximum such as  ",
      { code: "{1,64}" },
      ", and validate length before you validate shape. Go's RE2 and Rust's regex crate avoid the problem entirely by refusing backreferences and lookaround in exchange for a linear time guarantee.",
    ],
    [
      "A note on the preloaded patterns: the email one is not RFC 5322, and no honest pattern claiming to be will fit in a text box. The full grammar allows quoted local parts, comments, and addresses that no real mail system accepts, so matching it exactly is both hard and useless. The pragmatic pattern above rejects what is obviously wrong and lets a confirmation email decide the rest. That is the usual right answer: use the regex to filter, then verify with the thing that actually knows.",
    ],
  ],
  "subnet-calculator": [
    [
      "A subnet mask is not really a number, it is a boundary. The router ANDs the destination address with the mask, compares the answer to the network address in its table, and forwards on a match. Everything on this page falls out of that one operation: the network address is the address with all host bits cleared, the broadcast address is the same address with all host bits set, and the usable range is whatever sits between them.",
    ],
    [
      "Masks have to be contiguous, a run of 1 bits followed by a run of 0 bits, which is why 255.255.255.192 is legal and 255.255.192.255 is not. The wildcard mask is just the bitwise inverse, and it shows up in Cisco ACLs and OSPF network statements because those match on the bits that are allowed to vary rather than the bits that must agree.",
    ],
    [
      "Two prefixes are special. A /31 has only two addresses, and RFC 3021 says both of them are usable on a point-to-point link, because a link with exactly two ends has no use for a broadcast address. A /32 is a single host: a loopback on a router, a host route, or one line in a firewall rule. Subtracting two for network and broadcast is correct for /30 and shorter, and wrong for both of these.",
    ],
    [
      "The class letter shown here is historical. Classful addressing was replaced by CIDR in 1993 (RFC 1518 and RFC 1519), and no modern router looks at the first octet to guess a mask. It is still worth recognising, because exam questions and older documentation lean on it, and because the class boundaries explain why the RFC 1918 private ranges are the sizes they are.",
    ],
  ],
  "vlsm-practice": [
    [
      "Subnetting questions come in two flavours and it is worth spotting which one you are looking at before you start. If the requirement is a number of ",
      { em: "subnets" },
      ", you borrow bits from the host field until 2 to the power of the borrowed bits covers the count. If the requirement is a number of ",
      { em: "hosts" },
      ", you size the host field first, because 2 to the power of the host bits minus 2 has to cover the count, and the prefix is whatever 32 minus that leaves. Working the wrong way round is the most common way to lose marks on these.",
    ],
    [
      "The minus 2 is the network address and the broadcast address, which no host can use on a /30 or shorter. It does not apply to a /31, where RFC 3021 makes both addresses usable on a point-to-point link, or to a /32, which is a single host route. This drill never generates prefixes longer than /30, so minus 2 is always the right rule here, but the exception is worth carrying into the exam room.",
    ],
    [
      "The fast way to find the Nth subnet by hand is the block size, sometimes taught as the magic number. Take 256 minus the value of the interesting octet in the mask: a /26 has 192 in the fourth octet, 256 minus 192 is 64, so networks appear at .0, .64, .128 and .192. Real VLSM then allocates largest requirement first, so that the big blocks land on their natural boundaries and the small ones fill in behind them without overlapping.",
    ],
    [
      "The worked solution under each question is generated from the same numbers as the answer key, so it always matches. Read it even when you got the question right, because the useful thing to check is whether your method matches, not just your answer.",
    ],
  ],
  "wireshark-filters": [
    [
      "A display filter is a boolean expression over the fields Wireshark has already dissected. Naming a protocol on its own, ",
      { code: "dns" },
      " or ",
      { code: "tls" },
      ", matches any packet the dissector recognised as that protocol. Naming a field on its own, ",
      { code: "http.cookie" },
      ", matches any packet where that field exists at all. Comparing a field to a value narrows it further, and ",
      { code: "&amp;&amp;" },
      ", ",
      { code: "||" },
      " and ",
      { code: "!" },
      " combine the results.",
    ],
    [
      "The one trap worth learning early is negation on fields that can appear more than once in a packet. ",
      { code: "ip.addr != 10.0.0.5" },
      " reads as \"some occurrence of ip.addr is not 10.0.0.5\", and since every IP packet has both a source and a destination, that is true for almost everything. The expression you want is  ",
      { code: "!(ip.addr == 10.0.0.5)" },
      ", which negates the whole match instead of the comparison. The same applies to tcp.port, eth.addr, and any other field with two occurrences.",
    ],
    [
      "The tcp.analysis fields are not in the packets at all. Wireshark computes them by tracking sequence numbers across a stream, then attaches the verdict to the frame. That is why  ",
      { code: "tcp.analysis.retransmission" },
      " can be right about a problem your capture point never directly observed, and also why it can be wrong when you are capturing in the middle of a path and missing one direction.",
    ],
    [
      "Everything on this page is a display filter. Capture filters are a different language with a different job, and the section below covers where they diverge. If a filter you paste in turns the bar red, the usual causes are a capture filter typed into the display box, a protocol name Wireshark renamed between versions (bootp became dhcp, ssl became tls), or a single equals sign where two were needed.",
    ],
  ],
};
