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
 * govern behavior are interpolated from the constants themselves rather than
 * retyped, so prose and behavior cannot disagree.
 */
import { BTU_PER_WATT, IN_ROOM_LOSS_FACTOR } from "./capacity";
import {
  FAST_HASH_GUESSES_PER_SECOND,
  MAX_LEVELS,
  MAX_LISTED,
  SLOW_HASH_GUESSES_PER_SECOND,
  TIME_BUDGET_MS,
} from "./toolLimits";

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
      "The asymmetry is worth internalizing because it causes real bugs. An n bit signed range runs from -2^(n-1) to 2^(n-1) - 1, so there is one more negative number than positive: -128 to 127 in a byte, -2147483648 to 2147483647 in a 32 bit int. That means the most negative value has no positive counterpart, so negating it overflows and gives you back itself, and taking its absolute value does the same. That is CWE-191, integer underflow, and it is the mechanism behind a long list of memory corruption bugs where a length check passed because a negative number wrapped around into a very large unsigned one.",
    ],
    [
      "Width matters as much as signedness. Truncating to a narrower type keeps the low bits and throws the rest away, so 300 stored in a byte becomes 44, and a value that passed a bounds check as a 32 bit integer can fail it as a 16 bit one. Type a number too large for the selected width and it keeps the low bits and says so, which is exactly what the C cast would do.",
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
      ". It is also the single richest source of local privilege escalation, so a setuid root binary that shells out, honors ",
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
      "None of this is security, and it is worth being precise about why. A cipher whose keyspace is 25 is broken by counting, and a repeating key is broken by finding the period. The one classical scheme that is genuinely unbreakable is the one time pad, which is Vigenere with a key as long as the message, used once, and truly random. Break any one of those three conditions and it collapses back into something analysable. These ciphers remain useful for one thing: they show up constantly in capture the flag puzzles, in the National Cyber League, and in beginner forensics challenges, usually stacked on top of Base64 or hex. Recognizing them quickly is a real skill even though the ciphers themselves are museum pieces.",
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
      "One thing worth internalizing while studying for competitions: fast hashes are the wrong tool for passwords. MD5, SHA-1 and SHA-256 are designed to be quick, and a modern GPU computes billions of them per second. bcrypt, scrypt, yescrypt and Argon2 are deliberately slow and, in the later ones, deliberately memory-hungry, which is what makes large-scale guessing expensive rather than merely tedious.",
    ],
  ],
  "http-status-codes": [
    [
      "A status code is the only part of a response that every piece of infrastructure between the server and the client understands without parsing anything. Caches decide what to store from it, proxies decide what to retry, load balancers decide whether a backend is healthy, and monitoring decides whether to wake somebody up. That is why choosing one carelessly costs more than it looks like it should: an error hidden inside a 200 body is invisible to all of them, and a 500 returned for a client's malformed input sends an engineer to investigate a server that is working perfectly.",
    ],
    [
      "The class digit carries most of the meaning, and it is what a client should fall back to when it meets a code it does not recognize. RFC 9110 is explicit about this: an unknown 4xx must be treated as a generic 400, an unknown 5xx as a generic 500. That is what makes it safe to introduce a new code. The classes also encode the retry decision. A 4xx will fail the same way if you repeat it unchanged, so retrying is pointless. A 5xx might succeed later, so retrying with exponential backoff and jitter is correct. 429 and 503 are the two that tell you explicitly when to come back, via Retry-After, and honoring that header is the difference between a well behaved client and a participant in an outage.",
    ],
    [
      "Every code on this page is in the IANA HTTP Status Code Registry. Codes you will meet in the wild that are not include nginx's 499, which it logs when the client closes the connection before a response, and Cloudflare's 520 through 530 range for its own edge conditions. AWS load balancers add 460 and 463. These are useful in a log file and wrong in an API: an unregistered code means every client library falls back to guessing from the class digit, and you have gained nothing over the standard code that already describes the situation.",
    ],
    [
      "A last practical point about error bodies. RFC 9457, which replaced RFC 7807, defines a small JSON shape for the detail behind an error: a type URI, a title, a status, a detail string, and an instance. Using it costs nothing and means client code can read your errors without a bespoke parser for your service. Pair it with the right status code and a client can behave correctly on the status alone, then show something useful to a human from the body.",
    ],
  ],
  "jwt-decoder": [
    [
      "A JWT is three Base64URL segments with dots between them, and what the issuer actually signed is the text of the first two joined by that dot, not the JSON inside them. Almost every confusing JWT bug comes back to that. Pretty print the payload, reorder its keys, re-serialize it with a different library, and the bytes change while every claim stays identical, so verification fails on a token nobody tampered with. The same detail explains why every token you have ever seen starts with ",
      { code: "eyJ" },
      ": that is what an opening brace and a quote encode to. Base64URL is an encoding, not encryption, so the header and the payload are public to anyone holding the token.",
    ],
    [
      { em: "Verifying" },
      " is a different operation from decoding and it needs a key, which is why this page does not attempt it. The classic failures all share one shape: a verifier that lets the token decide how it will be checked. ",
      { code: "alg: none" },
      " was a legal value in the original specification and real libraries honored it, so a token with an empty signature verified. Algorithm confusion is the subtler cousin: hand an ",
      { code: "HS256" },
      " token to a service expecting ",
      { code: "RS256" },
      " and a naive library HMACs it with the RSA public key that the service publishes, which the attacker also has. Then there are the header parameters that point outward, ",
      { code: "jku" },
      ", ",
      { code: "jwk" },
      " and ",
      { code: "kid" },
      ". A verifier that fetches a key from a URL inside the token, or drops kid into a file path or a query, is taking instructions from the thing it is meant to be checking. The fix is the same every time: the verifier chooses the algorithm and the key from its own configuration and treats the header as a hint at most.",
    ],
    [
      { code: "exp" },
      ", ",
      { code: "nbf" },
      " and ",
      { code: "iat" },
      " are NumericDate values, seconds since the Unix epoch in UTC, and the most common mistake is writing milliseconds into them. A token stamped ",
      { code: "1756483200000" },
      " expires in the year 57,000 and will pass an expiry check for the rest of your career. Expiry is measured against the verifier's own clock, so a minute or two of leeway is normal and an hour is a way of never noticing that a machine's time sync has been broken for a month. Expiry is also the entire revocation story for a stateless token: until exp passes, the token is good everywhere it is accepted, and deleting a row on the server changes nothing. That, rather than fashion, is why access tokens are minted for minutes and paired with a refresh token that lives somewhere revocable.",
    ],
    [
      "Treat the token as the credential it is. Whatever can read it becomes that user for as long as it lasts, so a JWT in ",
      { code: "localStorage" },
      " is worth exactly as much to a cross-site scripting bug as the password would be, and an ",
      { code: "HttpOnly" },
      " cookie with a CSRF defense is usually the better trade. Because the payload is readable, nothing sensitive belongs in it: internal identifiers, email addresses and role names all travel to the browser in clear text. And because every claim is signed, every claim is also sent on every request, so a token that accumulates group memberships grows until it meets an 8KB header limit on some proxy and fails in a way nobody enjoys debugging.",
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
      "A locally administered address is almost never a mystery, it is a hint. It usually means a virtual machine (QEMU and KVM use 52:54:00), a container (Docker's bridge hands out 02:42 followed by the container's IP), a bonded or bridged interface that inherited a synthetic address, or a phone doing MAC randomization. Every modern mobile operating system now generates a fresh locally administered address per Wi-Fi network by default, which is why MAC-based device tracking and MAC-based access control both stopped working reliably.",
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
  "password-entropy": [
    [
      "Two different numbers get called entropy and they answer different questions. Search space entropy is the length times the base two logarithm of the pool, so twelve characters drawn from the 95 printable ASCII characters is about 79 bits. That is a claim about the ",
      { em: "process" },
      " that produced the password, and it holds only if the process really did pick every character uniformly and independently. Shannon entropy is computed from the characters that are actually there, and it measures variety inside this one string: ",
      { code: "abababab" },
      " scores one bit per character, and so does a genuinely random string of nothing but a and b. Neither number can tell whether a human chose the password, which is the only question an attacker cares about.",
    ],
    [
      "Real guessing does not start at aaaaaaaa and count upward. It starts with passwords people have already used, tens of billions of them out of breach corpora, and applies rules to each one: capitalise the first letter, append a year, swap a for @, add an exclamation mark. The ",
      { code: "best64" },
      " rule set that ships with hashcat is 64 such transformations and the popular community rule files run to tens of thousands. Only after the wordlists come masks, patterns like ",
      { code: "?u?l?l?l?l?l?d?d?s" },
      " that fix the shape and search only inside it. That is why the mask figure on this page deserves more attention than the raw bit count: a policy demanding one capital, one digit and one symbol pushes nearly everybody onto the same few shapes, and searching one shape is thousands of times cheaper than searching the alphabet.",
    ],
    [
      "The attacker's rate is set by your hash, not by their password guessing. A rig of current GPUs clears something like 10^",
      String(Math.log10(FAST_HASH_GUESSES_PER_SECOND)),
      " guesses a second against MD5 or NTLM and around 10^",
      String(Math.log10(SLOW_HASH_GUESSES_PER_SECOND)),
      " against bcrypt at cost 12. That is eight orders of magnitude for the same password, decided entirely by a choice made in your code. It is the whole purpose of a password hashing function: bcrypt, scrypt, yescrypt and Argon2id are slow deliberately, and the memory hard ones are also awkward to parallelize, which is what removes the GPU's advantage rather than merely taxing it. A salt is a different control and solves a different problem: unique salts stop one precomputed table from covering every account, and they do nothing whatsoever to slow a targeted guess.",
    ],
    [
      "NIST SP 800-63B settled the practical argument years ago and most policies still have not caught up. Length is the control that works, because each extra character multiplies the space while each extra composition rule narrows it. Forced periodic rotation and composition rules are both discouraged now, for the same reason: they push people into predictable transformations of one base they can remember. Screen new passwords against a breach corpus instead, because a password that has already leaked sits at the front of every wordlist no matter how many bits it scores here. And if you want a number you can defend, ",
      { em: "generate" },
      " it: five words drawn from a 7,776 word list is about 64 bits.",
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
      "The security notes here are the ones worth internalizing. A short list of ports should never be reachable from the internet under any circumstances: 445 SMB, 135 MS RPC, 3389 RDP, 23 Telnet, 3306 and 5432 and 27017 for databases, 6379 Redis, 2375 Docker, 623 IPMI, and 11211 Memcached. Several of those had no authentication at all in their default configuration, and every one of them is scanned continuously.",
    ],
    [
      "Ports marked as conventional rather than assigned, 8080, 9000, 4444 and similar, are habits rather than standards. They are still worth knowing, because a scan result is a hypothesis and the conventional meaning is usually the right first guess.",
    ],
  ],
  "rack-budget": [
    [
      "Watts convert to BTU per hour at  ",
      String(BTU_PER_WATT),
      ", a cooling ton is 12,000 BTU per hour, and cooling is sized against IT load times ",
      String(IN_ROOM_LOSS_FACTOR),
      " to cover in-room losses rather than against IT load alone, which is the mistake that leaves a room short on a hot day.",
    ],
    [
      "PUE is modeled, not measured. A small floor spreads fixed plant losses over less IT load, so it starts at 1.12 and worsens with scale up to a 1.40 cap. Real facilities vary widely; treat it as a planning figure and measure your own once there is something to meter.",
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
      ", the engine has an exponential number of ways to divide the input between the inner and outer repetition. On a string that nearly matches but fails at the end it will try all of them. Twenty characters is instant, thirty characters takes seconds, forty takes longer than you will wait. A JavaScript regex cannot be interrupted once it starts, so the only real defense on a web page is to run it somewhere you can kill, and terminating the worker is exactly that. If a pattern here times out at  ",
      String(TIME_BUDGET_MS),
      " ms, that is not a bug in the tool, it is the tool telling you the pattern is dangerous.",
    ],
    [
      "The same problem is a real denial of service class, ReDoS, and it is worth recognizing in code review: a user supplied string fed to a regex with nested quantifiers, or an innocent looking validation pattern in a dependency, can take a whole request thread down. The fixes are boring and effective. Anchor the pattern, replace nested quantifiers with a possessive or atomic equivalent where the engine supports it, bound repetition with an explicit maximum such as  ",
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
      "The class letter shown here is historical. Classful addressing was replaced by CIDR in 1993 (RFC 1518 and RFC 1519), and no modern router looks at the first octet to guess a mask. It is still worth recognizing, because exam questions and older documentation lean on it, and because the class boundaries explain why the RFC 1918 private ranges are the sizes they are.",
    ],
  ],
  "timestamp-converter": [
    [
      "Unix time counts seconds from 1970-01-01T00:00:00Z, and it carries no zone, no offset and no daylight saving, which is exactly why it is the right thing to store. What it also fails to carry is leap seconds. POSIX defines a day as exactly 86,400 seconds, so when a leap second is inserted the counter either repeats a value or a smear spreads the extra second across a whole day, and the 27 leap seconds added since 1972 are simply not in the number. Unix time is therefore not the count of SI seconds since 1970, it is a calendar formula: correct for timestamping an event, wrong for measuring an interval that crosses one of those moments. For a duration, read a monotonic clock instead.",
    ],
    [
      "The units are where the bugs live. Ten digits is seconds and stays that way until 2286, thirteen is milliseconds, sixteen is microseconds and nineteen is nanoseconds, which is enough to tell them apart by digit count alone. Getting it wrong is loud in one direction and silent in the other: milliseconds read as seconds land in the year 57,000 and somebody notices immediately, while seconds read as milliseconds land on 20 January 1970 and look like an old record nobody cleaned up. ",
      { code: "Date.now()" },
      " hands you milliseconds, Go's ",
      { code: "UnixNano" },
      " and most tracing systems use nanoseconds, and Python's ",
      { code: "time.time()" },
      " returns a float of seconds, so this conversion sits at the boundary of nearly every system you integrate with.",
    ],
    [
      "The 2038 problem is the same arithmetic in a smaller box. A signed 32 bit ",
      { code: "time_t" },
      " runs out at ",
      { code: "2147483647" },
      ", which is 03:14:07 UTC on 19 January 2038, and the following second wraps to December 1901. 64 bit platforms fixed the type long ago, so what is left is everything that stored the value rather than computed it: file formats with a 32 bit field, embedded firmware nobody intends to update, and column types such as MySQL's TIMESTAMP, which is 32 bit while DATETIME is not. Anything that computes a date decades ahead, a certificate expiry or a mortgage schedule, reaches the boundary years before the boundary reaches us.",
    ],
    [
      "The other half of the job is the difference between an ",
      { em: "instant" },
      " and a wall clock reading. ",
      { code: "2026-08-29T14:30:00Z" },
      " is an instant, and so is the same string ending ",
      { code: "+02:00" },
      ". ",
      { code: "2026-08-29T14:30:00" },
      " is not: it describes a clock face, and it names a different instant in every zone on earth. JavaScript's own parser is inconsistent about exactly this, reading a date-only string as UTC and a date-time without an offset as local, which is why this page asks instead of guessing. The rule that follows is worth keeping: store a past event as an instant in UTC, store a future appointment as a local time plus a zone name such as ",
      { code: "Europe/Berlin" },
      ", because governments move offsets and only the zone name survives the change. An offset is not a zone. ",
      { code: "+01:00" },
      " tells you nothing about what that clock will read in July.",
    ],
  ],
  "vlsm-practice": [
    [
      "Subnetting questions come in two flavors and it is worth spotting which one you are looking at before you start. If the requirement is a number of ",
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
      "Read it even when you got the question right, because the useful thing to check is whether your method matches, not just your answer.",
    ],
  ],
  "wireshark-filters": [
    [
      "A display filter is a boolean expression over the fields Wireshark has already dissected. Naming a protocol on its own, ",
      { code: "dns" },
      " or ",
      { code: "tls" },
      ", matches any packet the dissector recognized as that protocol. Naming a field on its own, ",
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
      "The one trap worth knowing about is negation on fields that can appear more than once in a packet, because its meaning changed. Before Wireshark 3.6, ",
      { code: "ip.addr != 10.0.0.5" },
      " read as \"some occurrence of ip.addr is not 10.0.0.5\", and since every IP packet has both a source and a destination, that was true for almost everything. Since 3.6 it means no occurrence is 10.0.0.5, which is what it looks like, and the old any-occurrence test is spelled ",
      { code: "!==" },
      ". Writing ",
      { code: "!(ip.addr == 10.0.0.5)" },
      " means the same thing on every version, which makes it the habit worth keeping. The same applies to tcp.port, eth.addr, and any other field with two occurrences.",
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
  "data-uri-tool": [
    [
      "A data: URI (RFC 2397) carries a MIME type, optional parameters and a payload in one string. The payload is Base64 when ",
      { code: ";base64" },
      " appears in the header, and percent-escaped bytes otherwise. The encoder shows, at once, the Base64 data URI, the percent-encoded data URI for sources up to 1 MB, the bare Base64 payload, an HTML img tag and a CSS declaration, plus byte counts, the Base64 overhead of about 33 percent and a SHA-256 of the raw bytes.",
    ],
    [
      "The decoder accepts standard, URL-safe and unpadded Base64, and the percent escapes that HTML and CSS writers often apply to the payload. It finds every data URI in pasted text or a scanned file, then peels nested layers, where a payload decodes to another data URI, up to eight deep. The innermost layer is identified from its magic bytes, and the declared MIME sits beside the sniffed type, so a PNG labeled as text stands out.",
    ],
    [
      "Decoded content is displayed and never rendered. HTML is shown as text, and SVG and raster images appear only through an img element, which runs no scripts. Next-layer candidates catch Base64 and hex text inside the decoded payload. When scanning text, a payload ends at whitespace, quotes, angle brackets or parentheses; a single URI pasted on its own is decoded whole.",
    ],
    [
      "Limits: 25 MB per input file, image previews up to 5 MB, and percent-encoded output skipped above 1 MB. Some browsers and mail clients cap URL length near 2 MB, and the tool flags anything longer. Sniffing recognizes PNG, JPEG, GIF, WebP, PDF, ZIP, gzip, 7z, RAR, ELF, MZ, SQLite, SVG and HTML signatures. It is not exhaustive.",
    ],
  ],
  "file-identifier": [
    [
      "Reads the leading bytes of a file and compares them with a built-in table of 92 magic-byte signatures, the same approach as ",
      { code: "file" },
      " and libmagic. Each match shows the signature bytes, the offset they were found at, the MIME type and the extensions the format normally uses. Refinements read a few header fields to name the subtype, such as PE32 or PE32+, the ELF machine type, or a ZIP that is really a Word document.",
    ],
    [
      "The extension is treated as a claim. A mismatch means the name and the bytes disagree, which is a lead to follow, not a verdict. Trailer checks look for bytes after a format's end marker, such as data after a PNG ",
      { code: "IEND" },
      " chunk or after a ZIP end-of-central-directory record. Embedded signatures list every other offset where a table entry matches, which exposes concatenated files and appended archives. Hits marked weak use three bytes and are common in compressed data.",
    ],
    [
      "Signatures follow the published specifications where one exists, including the PNG specification (ISO/IEC 15948), RFC 1952 for gzip and the PKWARE ZIP application note. Byte values are hexadecimal. Offsets are decimal with hexadecimal in parentheses.",
    ],
    [
      "A signature table is never complete. A file that matches nothing is described by its content class and entropy instead of a format name, and encrypted or compressed data reads close to 8 bits per byte with no internal structure. Analysis covers files up to 25 MiB and runs entirely on the device.",
    ],
  ],
  "frequency-analysis": [
    [
      "Counts each letter A to Z in the pasted text, case folded, with its share of all letters beside the English share. Bigrams and trigrams are overlapping counts over the letter stream with non-letters removed, so a pair can span a word break. Words are ranked by frequency with a pattern that labels each letter by first appearance: ",
      { code: "THE" },
      " is ",
      { code: "ABC" },
      ", ",
      { code: "ETHER" },
      " is ",
      { code: "ABCAD" },
      ".",
    ],
    [
      "The index of coincidence is the chance that two letters drawn from the text match, computed as the sum of ",
      { code: "n(n-1)" },
      " over ",
      { code: "N(N-1)" },
      ". English is near 0.0667 and uniform letters are near 0.0385, or 1/26. Entropy is in bits per letter, about 4.18 for English and 4.70 for uniform letters. A transposition keeps the plaintext values, so a value near English fits plaintext or a monoalphabetic cipher but does not prove one.",
    ],
    [
      "The substitution workspace holds one mapping from cipher letters to plaintext letters. Mapped letters decode in uppercase and unmapped letters stay lowercase. Fill unmapped by rank assigns the most common unused English letters to the remaining cipher letters in frequency order. Duplicate plaintext letters are flagged, because a substitution key is one-to-one.",
    ],
    [
      "Limits: a monoalphabetic solve needs roughly 100 letters or more before the frequency bars settle. Polyalphabetic ciphers such as Vigenere flatten these statistics, so use the Vigenere solver for keyed ciphers. Input is capped at 200,000 characters.",
    ],
  ],
  "hex-viewer": [
    [
      "Renders any file, or pasted text (UTF-8), hex or base64, as a hex dump. Each row shows the offset in hex and decimal, the bytes, and an ASCII gutter. Printable ASCII, NUL bytes, whitespace and other non-printable bytes are colored apart, and the selected byte and every match are highlighted in place.",
    ],
    [
      "Search takes an ASCII string, optionally case-folded for ASCII letters, or a hex pattern where ",
      { code: "??" },
      " matches any single byte. Matches are listed in offset order, and the view jumps to each one. The byte inspector reads the selected offset as unsigned and signed integers, 32- and 64-bit floats, and Unix time, in both little-endian and big-endian order.",
    ],
    [
      "The file type comes from a table of magic bytes at the start of the data, with a UTF-8 text check when no signature matches. SHA-1 and SHA-256 come from ",
      { code: "crypto.subtle" },
      ". Entropy is Shannon entropy over byte values in bits per byte, so data near 8 is usually compressed or encrypted, and the histogram shows how the byte values are distributed.",
    ],
    [
      "Limits: the whole input is held in memory and capped at 25 MB, and the dump is paged 4 KiB at a time. Pasted hex accepts spaces, commas, colons and 0x prefixes, and anything else is reported as an error. Digests need a secure context, which HTTPS provides. Nothing is uploaded.",
    ],
  ],
  "image-analyzer": [
    [
      "Reads one image in the browser and shows every layer at once. EXIF, IPTC, XMP, ICC and GPS tags come from ",
      { code: "exifr" },
      " (MIT). GPS values are converted from degree, minute and second triples to signed decimal degrees, and the copyable ",
      { code: "lat,long" },
      " line carries six decimal places. The magic-byte table identifies the format from the leading bytes, and that result is set against the declared extension and MIME type.",
    ],
    [
      "The pixel views come from a canvas decode, so they show what the browser sees. A bit-plane view draws the chosen bit of each channel, with a set bit shown as white. The z row is a pair test from Westfeld and Pfitzmann: values near zero or below 3 mean the (2k, 2k+1) value pairs have been equalized, which full-capacity LSB replacement produces. Unmodified photographs score far higher.",
    ],
    [
      "The end-of-file checks look for data past the JPEG ",
      { code: "FF D9" },
      " marker, the PNG ",
      { code: "IEND" },
      " chunk, the GIF trailer, and the BMP and RIFF size fields. PNG chunks are checked against their CRC-32 values, and tEXt, zTXt and iTXt text is read directly or inflated with ",
      { code: "fflate" },
      ". The embedded-signature scan looks for PNG, JPEG, GIF, ZIP, gzip, RAR, 7z, PDF and ELF headers at every offset, so an EXIF thumbnail appears as a second JPEG hit.",
    ],
    [
      "Limits: lossy formats rewrite the low bits, so bit planes from JPEG are weak evidence, and color-managed decodes can shift values. Pixel views are skipped above 25 MP, and files over 25 MB are refused. Nothing is uploaded, and the page makes no network request.",
    ],
  ],
  "magic-decoder": [
    [
      "Each layer is tried against text decoders (Base64 and URL-safe Base64 per RFC 4648, Base32 per RFC 4648, Base58 with the Bitcoin alphabet, hex, percent-encoding, form encoding, 8-bit binary groups, decimal byte lists, ROT13 and ROT47) and byte decoders (gzip per RFC 1952, zlib per RFC 1950, and zip through ",
      { code: "fflate" },
      "). Every result is scored from 0 to 100 on its printable share (printable ASCII, or printable code points in UTF-8 text), English-likeness, a flag-shaped token, and whether it is another encoding or a recognized file. The list is sorted best first.",
    ],
    [
      "A recognized file type scores 80. An encoding scores 84 to 88 only when its decoder yields a recognized file or printable text; when it decodes to binary noise it drops to at most 60, which keeps ROT13 output that happens to look like Base64 out of the top spot. Readable text scores 30 plus up to 40 for printable share and up to 30 for English, with a bonus of 25 for a known flag prefix such as ",
      { code: "flag{" },
      " or ",
      { code: "picoCTF{" },
      " and 8 for any other flag shape. Binary scores at most 20.",
    ],
    [
      "Auto-peel follows the best unseen candidate, preferring one with a known flag prefix. It continues from encodings and files, and from readable text only when the next result is clearly more English or flagged, so random text is not peeled. It stops after 8 layers, when nothing scores at least 45, or when the text reads as English or carries a flag. Single-byte XOR (255 keys, on the first 1,024 bytes) and Caesar (25 shifts, on the first 2,048 characters) are ranked separately so they do not crowd the list.",
    ],
    [
      "Input is capped at 262,144 characters, and any layer above 4 MB is discarded. Gzip is refused when its trailer declares more than 4 MB. Zlib has no size trailer, so it is only attempted on inputs up to 64 KB. The English measure counts common words and is a heuristic, not a dictionary, so leetspeak or unusual flags can score low; a known flag prefix still ranks them high.",
    ],
  ],
  "qr-reader": [
    [
      "The decoder draws the image onto a canvas and scans it with jsQR at the original size, with a white margin of 48 to 64 pixels, at half and quarter scale, and at double scale for small images. The margin and rescaling recover codes that touch the edge or are too fine for the first pass. Each payload is shown as decoded text, as hex and Base64 bytes, with the QR version and the four corner coordinates so the geometry can be checked against the image.",
    ],
    [
      "The classifier recognizes Wi-Fi strings (escaped SSID and password), vCard and iCalendar (unfolded properties), MECARD, otpauth one-time password secrets, mailto, tel and sms, geo, payment URIs, URLs and other schemes. URLs are shown as text and never turned into links. Alternative readings (Base64, hex, percent-decoding, ROT13 and reversed text) appear only when the text supports them, and invisible or bidirectional control characters are counted, because they can make the visible text differ from the data.",
    ],
    [
      "The generator follows the ISO/IEC 18004 layout: byte mode, Reed-Solomon error correction over GF(256) with polynomial 0x11D, format information, the eight masks, and the penalty score that picks the mask. Every generated code is decoded again with jsQR and reported as a round trip. Numeric, alphanumeric and kanji modes, and versions above 6, are not implemented. Level L holds up to 134 bytes, M 106, Q 74 and H 58.",
    ],
    [
      "Each image is capped at 25 MB and yields one code. jsQR does not report a code's error-correction level, so the reader shows the version but not the level. Images are decoded in the page, and nothing is uploaded.",
    ],
  ],
  "rsa-tool": [
    [
      "Derives every value of textbook RSA from p and q: ",
      { code: "n = p q" },
      ", ",
      { code: "phi = (p - 1)(q - 1)" },
      ", d as the inverse of e modulo phi by extended Euclid, and lambda, dp, dq and qInv for reference and for CRT decryption. Each value shows decimal, hex and bit length, and the encryption and decryption panels list each square-and-multiply step.",
    ],
    [
      "Factoring tries odd divisors up to the trial bound, which can be set as high as 2000000. If that fails, Fermat's method tests ",
      { code: "a" },
      ", ",
      { code: "a+1" },
      " and so on until ",
      { code: "a^2 - n" },
      " is a perfect square, which succeeds quickly when p and q are close together. Both methods run locally, with no factor database and no network lookup.",
    ],
    [
      "Encryption is ",
      { code: "c = m^e mod n" },
      " and decryption is ",
      { code: "m = c^d mod n" },
      ". Text mode packs bytes into blocks of the largest size b with 256^b at or below n, so text needs n of at least 256. Textbook RSA is deterministic and malleable, so it is for learning and CTF arithmetic only.",
    ],
    [
      "Limits: moduli up to 1024 bits. Real keys are 2048 bits or more, use OAEP padding, and come from a vetted library. Text decryption drops trailing zero bytes, so data that ends in zero bytes does not round trip exactly.",
    ],
  ],
  "strings-extractor": [
    [
      "The browser counterpart of ",
      { code: "strings" },
      ". Every byte offset is scanned for runs of printable ASCII (0x20 to 0x7E) and for UTF-16LE text, which is ASCII code units each followed by a zero high byte. Each run is listed with its decimal and hexadecimal offset, its encoding, its length and its bytes in hex.",
    ],
    [
      "Runs are extracted once at four characters and filtered in memory, so the minimum length slider and the regex respond at once. Runs that look like URLs, email addresses, flag-style braces such as ",
      { code: "flag{...}" },
      ", Base64 blobs, file paths or IPv4 addresses are tagged, and each tag shows the text it matched. A Base64 token that decodes to mostly printable text shows the decoded preview.",
    ],
    [
      "The four-character minimum matches the default of GNU ",
      { code: "strings" },
      ", and the UTF-16LE mode follows ",
      { code: "strings -e l" },
      ", which reads two-byte units with a zero high byte. Flag and Base64 tags are heuristics: a brace pair or a mixed-case token whose length is divisible by four is a lead, not a decoded secret.",
    ],
    [
      "Runs longer than 1024 characters are split, and classification reads the first 1024 characters of each run. Storage is capped at 300,000 strings, and the cap is reported when it is reached. Analysis covers files up to 25 MiB and runs entirely on the device.",
    ],
  ],
  "transform-pipeline": [
    [
      "The chain runs top to bottom. Each step receives the bytes its predecessor produced, so an encoding can feed a cipher and then a digest. Text steps decode their input as UTF-8 first. When that decode is lossy, the step is flagged instead of changing the data without notice. The first step reads the pasted text as UTF-8 bytes.",
    ],
    [
      "Read each step's output to find the link that breaks. Base64 decoding accepts the standard and URL-safe alphabets from RFC 4648, with or without padding. Base32 follows RFC 4648 with padding. Gzip, zlib and raw inflate return the decompressed bytes, and a stream that is not valid compressed data stops the chain at that step. ",
      { code: "crypto.subtle" },
      " computes SHA-1 through SHA-512, ",
      { code: "js-sha3" },
      " computes SHA3-256 and ",
      { code: "spark-md5" },
      " computes MD5. Digests are output as lowercase hex, which the next step can decode.",
    ],
    [
      "Limits. The HTML entity decoder covers numeric references and a common subset of named references, not the full HTML5 table. Inflate output is not capped, so a decompression bomb can exhaust memory in the tab. Input past 1,000,000 characters is ignored. Digests need HTTPS or localhost. The result panel previews the first 2,048 bytes of each representation, and its copy buttons take the full text or hex.",
    ],
  ],
  "unicode-inspector": [
    [
      "Each code point is listed with its general category and script, read from Unicode property escapes in the regular expression engine, plus its UTF-8 bytes and UTF-16BE code units. Full character names live in the Unicode Character Database, which is too large to bundle, so the category and script stand in for them except for the characters that matter most here.",
    ],
    [
      "Bidirectional controls (UAX #9) reorder displayed text and underpin the Trojan Source attack (CVE-2021-42574). Tag characters in U+E0020 to U+E007E carry hidden ASCII, which is decoded onto its own line. Zero-width, control, private-use and unassigned code points are reported as invisible or unexpected. Lookalikes follow the spirit of the Unicode confusables data (UTS #39), using a subset table rather than the full list.",
    ],
    [
      "Mixed-script words are flagged when Latin letters share a word with Cyrillic, Greek or another script, and the ASCII skeleton shows what the word imitates. The NFC and NFKC forms come from the String normalize method (UAX #15). Input is capped at 20,000 UTF-16 code units, and the code point list shows 500 rows at a time.",
    ],
  ],
  "url-analyzer": [
    [
      "The analyzer reads the URL two ways. ",
      { code: "As typed" },
      " follows the RFC 3986 grammar and shows the text exactly as written. ",
      { code: "Parsed" },
      " is what the WHATWG URL parser produces in browsers: it lowercases hosts, converts IDN labels to punycode, strips tabs and newlines, reads backslashes as slashes and resolves dot segments. Where the two views disagree, the browser is going somewhere the text does not show.",
    ],
    [
      "Percent-decoding runs one layer at a time, so ",
      { code: "%25252e" },
      " shows as ",
      { code: "%252e" },
      ", then ",
      { code: "%2e" },
      ", then ",
      { code: "." },
      ". Each extra layer marks a double or triple encoding, a common way to slip a traversal or a filter past a server that decodes once (RFC 3986, section 2.1). Punycode labels with the ",
      { code: "xn--" },
      " prefix are decoded per RFC 3492 and checked for mixed scripts and for characters that imitate ASCII.",
    ],
    [
      "Query parameters split on ",
      { code: "&" },
      " and the first ",
      { code: "=" },
      ", with ",
      { code: "+" },
      " read as a space the way form encoding does. Editing a key or value rebuilds the URL, and untouched parts keep their original encoding. The fragment is shown decoded but is never sent to a server. The registrable domain is an estimate, since no public suffix list is applied. Nothing is requested; the URL constructor only parses text.",
    ],
  ],
  "vigenere-solver": [
    [
      "Encrypt and decrypt take a key of letters. Non-letters pass through unchanged and do not advance the key, so the key lines up with letters only. The alignment rows show the input, the repeating key and the output for the first 64 letters, and the inverse check confirms that the opposite direction returns the input.",
    ],
    [
      "Step 1 averages the index of coincidence over the ",
      { code: "k" },
      " columns for each candidate length. Each column of a true length-",
      { code: "k" },
      " key is a single Caesar shift of English, so its index sits near 0.0667, while random letters sit near 0.0385. Multiples of the true length also score high, so the suggestion is the smallest length within 0.005 of the best average. Step 2 finds repeated trigrams and the gaps between them. A gap is a multiple of the key length when the same plaintext trigram lines up under the same key letters, and the divisor table counts how many gaps each length divides.",
    ],
    [
      "Step 3 tests each column against all 26 shifts. The chi-squared statistic compares the shifted letter counts with English letter shares. With 25 degrees of freedom, a correct shift scores near 25 per column and a wrong shift scores far higher. Step 4 joins the best shift from each column into a key and scores the decrypt by the share of words found in a short list of common English words.",
    ],
    [
      "Limits: the breaker works best with several hundred letters of English prose. Very short texts, or keys longer than the text, cannot be recovered this way. Vigenere is a historical cipher and offers no real security. Input is capped at 200,000 characters and the key length at 30.",
    ],
  ],
  "xor-tool": [
    [
      "XOR is its own inverse, so applying the key to ciphertext gives the plaintext, and applying it to plaintext gives the ciphertext. The key repeats across the data: data byte ",
      { code: "i" },
      " pairs with key byte ",
      { code: "i mod length" },
      ". The output panel shows UTF-8 text, hex and Base64 together, and flags output that is not valid UTF-8.",
    ],
    [
      "The single-byte table applies all 256 keys to the first 4,096 bytes. Printable is the share of bytes in printable ASCII, tab, newline or carriage return. English is the average letter-frequency weight per byte, with space weighted as a letter. Rank averages the printable ratio with the English weight, so ordinary English reaches the top. A high rank is evidence for a key, not proof, so read the preview before trusting one.",
    ],
    [
      "The crib tests each key length from 1 to the chosen maximum. The crib is placed at a byte offset, which fixes the key byte for every slot it covers. A length is kept only when every repeated slot implies the same byte. Complete keys are listed first, and ",
      { code: "Use key" },
      " copies a recovered key into the key field. A question mark marks a plaintext byte whose key byte is still unknown.",
    ],
    [
      "Limits. Data and key are capped at 1,000,000 bytes, and the crib search reads the first 4,096 bytes. Key length cannot be guessed from ciphertext alone here. Index of coincidence and Hamming distance estimates are not included, so supply a crib or try lengths by hand.",
    ],
  ],
  "zip-inspector": [
    [
      "The inspector reads the end-of-central-directory record, follows it to the central directory, and parses every entry header directly rather than trusting one extractor. For each entry it shows the name as stored, the compressed and uncompressed sizes, the method, the CRC-32, the DOS timestamp, the host system, any unix mode, the entry comment and the extra fields. Bytes before the archive and after the end record are reported separately, because self-extractors and appended payloads hide there.",
    ],
    [
      "Findings are ranked by severity. A name containing a ",
      { code: ".." },
      " segment, an absolute path or a drive letter is flagged as zip slip. A local header whose name or method disagrees with the central directory is flagged, as are duplicate names, unknown extra fields, symbolic links and high compression ratios. Loading an entry inflates deflate or stored data in the browser and compares the recomputed CRC-32 with the stored one. Downloads use a sanitized basename, so a traversal name never becomes a file path.",
    ],
    [
      "The layouts follow PKWARE APPNOTE.TXT for zip, RFC 1952 for gzip and RFC 1950 for zlib, including the Adler-32 trailer. gzip and zlib inputs are decoded as streams, with the header fields, the trailer checksum and the output shown together. Encrypted entries, bzip2, LZMA and other methods are identified but not decoded, and password recovery is not attempted.",
    ],
    [
      "Input is capped at 25 MB, and entries whose declared sizes exceed that cap are not decoded. ZIP64 records are read, but split and multi-disk archives are not. Offsets are treated as absolute from the start of the input, so a self-extractor whose offsets were never adjusted reports a central directory error and no entries.",
    ],
  ],
};
