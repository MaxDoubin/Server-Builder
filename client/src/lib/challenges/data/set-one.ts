import type { Challenge } from "../types";

/**
 * The first six challenges.
 *
 * Every artefact is real: the encodings decode, the hex is a genuine file
 * header, the log arithmetic adds up, and the hash is a real NTLM digest of a
 * real password. A challenge whose artefact does not survive being worked on
 * with actual tools is a quiz wearing a costume.
 */

export const base64InAUserAgent: Challenge = {
  slug: "base64-in-a-user-agent",
  title: "Base64 in a User Agent",
  category: "Encoding",
  difficulty: "easy",
  tagline: "Something is stuffing data into a header nobody reads.",
  brief: [
    "A web server log has one client whose User-Agent is not a User-Agent. It is the same length every time and it is not any browser.",
    "Get the flag out of it.",
  ],
  artefacts: [
    {
      kind: "log",
      title: "access.log, the interesting line",
      lines: [
        '10.4.2.9 - - [08/Sep/2026:03:14:02 +0000] "GET /favicon.ico HTTP/1.1" 200 318',
        '  "-" "TEpBZ01LZ21xVFN3bjJJeEsySWhMMjl4bko1YXAxOXVweklzcDNFY29Ua3NNSjV3bzJFY296cW1zRD09"',
        "",
        "For contrast, the line above it:",
        '10.4.2.11 - - [08/Sep/2026:03:13:58 +0000] "GET / HTTP/1.1" 200 4102',
        '  "-" "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"',
      ],
    },
  ],
  flagHash: "8753dfb16cf087adf3d3d307709aa6a71f6177be110e3695f88a4364c730836a",
  flagShape: "acme{...}",
  hints: [
    "The trailing == is the giveaway for one particular encoding.",
    "Decoding it once gives you something that is still not readable, and still ends in ==.",
    "The middle layer is not an encoding at all. Look at the letters: they are shifted.",
  ],
  walkthrough: [
    "Three layers, which is the whole point: people stop after one.",
    "Base64 decode the header value and you get LJAgMKgmqTSwn2IxK2IhL29xnJ5ap19upzIsp3EcoTksMJ5wo2EcozqmsD==, which is not readable and still ends in ==, so something is still encoded.",
    "That middle string is ROT13. Applying it gives YWNtZXtzdGFja2VkX2VuY29kaW5nc19hcmVfc3RpbGxfZW5jb2RpbmdzfQ==, which is recognisably base64 again: YWNtZ is what acme{ encodes to, and once you have seen that prefix once you will always spot it.",
    "Base64 decode that and you have the flag.",
    "The practical lesson is the detection one. A User-Agent of a fixed length that is not a browser string, on a request for a favicon, is exfiltration or command and control. The content does not matter for spotting it; the shape does.",
  ],
  reading: [
    { label: "Encoder and decoder", href: "/tools/encoder-decoder" },
    { label: "Classical ciphers, including ROT13", href: "/tools/classical-ciphers" },
  ],
};

export const theKeyWasTheYear: Challenge = {
  slug: "the-key-was-the-year",
  title: "The Key Was the Year",
  category: "Cryptography",
  difficulty: "medium",
  tagline: "A repeating-key XOR with a four-character key, and a crib.",
  brief: [
    "This ciphertext came out of a piece of malware's configuration blob. It was XORed with a short repeating key.",
    "You know one thing about the plaintext: it starts with acme{. Recover the key, then the flag.",
  ],
  artefacts: [
    {
      kind: "hex",
      title: "config.bin, offset 0x40",
      lines: [
        "50 5e 5d 55 4a 5f 5c 56 55 42 5b 5c 5f 5a 44 42",
        "5f 5c 5a 5a 42 51 5f 55 4a 46 51 5f 55 4a 42 42",
        "55 44 43 5a 5c 42 5e 55",
      ],
    },
    {
      kind: "note",
      title: "What you know",
      lines: [
        "Plaintext begins:  acme{",
        "Cipher begins:     50 5e 5d 55 4a",
        "",
        "XOR is its own inverse: plaintext ^ ciphertext = key.",
      ],
    },
  ],
  flagHash: "2199bd070a0a706bb64c694d8e0c9c1b83eca2094f06f0424e08ec8cabb6a645",
  flagShape: "acme{...}",
  hints: [
    "XOR the known plaintext against the first bytes of the ciphertext. That gives you the key, repeated.",
    "'a' is 0x61. 0x61 XOR 0x50 is 0x31, which is the character '1'.",
    "Keep going and the key is four digits, and it looks like a year.",
  ],
  walkthrough: [
    "XOR the crib against the ciphertext, byte by byte. 0x61 ('a') ^ 0x50 = 0x31 ('1'). 0x63 ('c') ^ 0x5e = 0x3d, which is not a digit, so the key is not one character.",
    "Try it as a repeating key of length 4 and the first four bytes give 1, 9, 9, 8. The key is the ASCII string 1998, and it repeats.",
    "XOR the whole blob against 1998 repeating and the plaintext falls out.",
    "Two real lessons in this one. Repeating-key XOR is not encryption: any known plaintext, and 'the flag starts with acme{' is a known plaintext, hands you the key immediately. And a four-digit key that is a year is a key somebody chose because it was memorable, which is the reason key material should never be chosen by a person.",
  ],
  reading: [
    { label: "Encoder and decoder", href: "/tools/encoder-decoder" },
    { label: "TLS, and what real encryption looks like", href: "/blog/tls-modern-encryption" },
  ],
};

export const countTheFailures: Challenge = {
  slug: "count-the-failures",
  title: "Count the Failures",
  category: "Log analysis",
  difficulty: "easy",
  tagline: "Six addresses tried. One got in. Name it.",
  brief: [
    "A summary from an SSH log. Several addresses attempted authentication overnight.",
    "One of them succeeded. Give its IPv4 address.",
  ],
  artefacts: [
    {
      kind: "table",
      title: "auth.log, summarized",
      lines: [
        "SOURCE            FAILED   ACCEPTED   USERS TRIED         METHOD",
        "203.0.113.7           41          0   root                password",
        "198.51.100.22          8          0   admin, ubuntu       password",
        "185.220.101.44       214          1   8 distinct          password",
        "192.0.2.180            3          0   root                password",
        "10.30.2.9              0          4   student             publickey",
        "45.63.11.208          61          0   root, oracle, git   password",
      ],
    },
    {
      kind: "note",
      title: "Worth noticing",
      lines: [
        "One row has both a very large failure count and a success.",
        "One row has successes and no failures at all, by a different method,",
        "from an address in a private range.",
      ],
    },
  ],
  flagHash: "992803d029131de7676d22e765ee950c892f04cb5895118eb13298d824c7114c",
  flagShape: "an IPv4 address",
  answerIsInTheData: true,
  hints: [
    "Two rows have an accepted authentication. Only one of them is a problem.",
    "10.30.2.9 is a private address using a public key. That is what a legitimate login looks like.",
    "The other one tried eight usernames 214 times and then got in once.",
  ],
  walkthrough: [
    "185.220.101.44. Two hundred and fourteen password failures across eight usernames, then one acceptance.",
    "The row that is easy to misread is 10.30.2.9: four accepted logins and zero failures. That is not an attack, it is somebody with a working key. Successes with no failures, by public key, from a private range, is exactly the shape of legitimate access, and treating every acceptance as suspicious is how a real alert gets lost.",
    "The rows with high failure counts and no successes (203.0.113.7, 45.63.11.208) are internet background noise. Every host with port 22 open sees them, all day, forever. They are worth rate limiting and not worth investigating.",
    "The combination that matters is high failures AND a success from the same source. That is the query to write.",
  ],
  reading: [
    { label: "Log analysis when you do not know what you are looking for", href: "/blog/log-analysis-methodology" },
    { label: "SSH key based authentication", href: "/blog/ssh-key-based-authentication" },
  ],
};

export const whatIsInTheHex: Challenge = {
  slug: "what-is-in-the-hex",
  title: "What Is in the Hex",
  category: "Forensics",
  difficulty: "medium",
  tagline: "A file called invoice.pdf that is not a PDF.",
  brief: [
    "An attachment came through named invoice.pdf. Here are its first bytes and a string found later in the file.",
    "Work out what it actually is, then read the flag out of the strings.",
  ],
  artefacts: [
    {
      kind: "hex",
      title: "invoice.pdf, offset 0",
      lines: [
        "00000000  4d 5a 90 00 03 00 00 00  04 00 00 00 ff ff 00 00  |MZ..............|",
        "00000010  b8 00 00 00 00 00 00 00  40 00 00 00 00 00 00 00  |........@.......|",
        "00000020  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  |................|",
        "00000030  00 00 00 00 00 00 00 00  00 00 00 00 f0 00 00 00  |................|",
        "00000040  0e 1f ba 0e 00 b4 09 cd  21 b8 01 4c cd 21 54 68  |........!..L..Th|",
        "00000050  69 73 20 70 72 6f 67 72  61 6d 20 63 61 6e 6e 6f  |is program canno|",
        "00000060  74 20 62 65 20 72 75 6e  20 69 6e 20 44 4f 53 20  |t be run in DOS |",
        "00000070  6d 6f 64 65 2e 0d 0d 0a  24 00 00 00 00 00 00 00  |mode............|",
      ],
    },
    {
      kind: "text",
      title: "strings invoice.pdf | tail -6",
      lines: [
        "KERNEL32.dll",
        "VirtualAlloc",
        "CreateRemoteThread",
        "C:\\Users\\Public\\svc.dat",
        "YWNtZXttYWdpY19ieXRlc19iZWF0X2ZpbGVfZXh0ZW5zaW9uc30=",
        "http://45.63.11.208/gate.php",
      ],
    },
  ],
  flagHash: "022075cbff4ccee9c0e77bbe7762ce6999d5b95349817d66c0a9fedbe453fdaf",
  flagShape: "acme{...}",
  hints: [
    "The first two bytes are the file's real type. 0x4d 0x5a is two ASCII letters.",
    "A PDF starts with %PDF, which is 25 50 44 46. This does not.",
    "The flag is in the strings output, and it is base64.",
  ],
  walkthrough: [
    "4d 5a is MZ, the DOS header signature that begins every Windows PE executable. The 'This program cannot be run in DOS mode' string at offset 0x4e is the DOS stub, which is present in essentially every Windows binary and is the second confirmation.",
    "A real PDF begins 25 50 44 46, which is %PDF. The extension is a claim; the magic bytes are the evidence, and this is why `file` exists and why mail gateways look at content rather than filenames.",
    "The last string is base64. Decode YWNtZXttYWdpY19ieXRlc19iZWF0X2ZpbGVfZXh0ZW5zaW9uc30= and you have the flag.",
    "The other strings are worth reading even though they are not the answer. VirtualAlloc and CreateRemoteThread together are process injection. C:\\Users\\Public is a world-writable path used because it needs no privileges. The URL is where it reports in.",
  ],
  reading: [
    { label: "Hash identifier", href: "/tools/hash-identifier" },
    { label: "Encoder and decoder", href: "/tools/encoder-decoder" },
    { label: "Base converter", href: "/tools/base-converter" },
  ],
};

export const thePortNobodyOpened: Challenge = {
  slug: "the-port-nobody-opened",
  title: "The Port Nobody Opened",
  category: "Enumeration",
  difficulty: "easy",
  tagline: "Six services are documented. Seven are listening.",
  brief: [
    "Here is the documented service list for a host, and the output of a port scan against it.",
    "One listening port is not in the documentation. Give its number.",
  ],
  artefacts: [
    {
      kind: "table",
      title: "The documented services",
      lines: [
        "PORT   SERVICE        OWNER",
        "22     ssh            platform",
        "80     nginx          web",
        "443    nginx          web",
        "3306   mysql          data",
        "6379   redis          data",
        "9100   node_exporter  platform",
      ],
    },
    {
      kind: "log",
      title: "nmap -sS -p- 10.30.2.14",
      lines: [
        "PORT      STATE  SERVICE",
        "22/tcp    open   ssh",
        "80/tcp    open   http",
        "443/tcp   open   https",
        "3306/tcp  open   mysql",
        "6379/tcp  open   redis",
        "9100/tcp  open   jetdirect",
        "31337/tcp open   Elite",
        "",
        "Nmap done: 1 IP address (1 host up) scanned in 41.02 seconds",
      ],
    },
  ],
  flagHash: "1483099c89000a68c3d88446a6a7669b765f09900cbfb0898ccd784b2a6bfe2d",
  flagShape: "a port number",
  answerIsInTheData: true,
  hints: [
    "Compare the two lists. Six documented, seven open.",
    "nmap names a port from /etc/services, which is a lookup table, not an observation.",
    "9100 is documented as node_exporter and nmap calls it jetdirect. That is the same lookup table being wrong, and it is not the answer.",
  ],
  walkthrough: [
    "31337. Everything else appears in both lists.",
    "The trap is 9100, which nmap labels 'jetdirect'. nmap's SERVICE column is a lookup in /etc/services keyed on the port number: it is a guess about what usually runs there, not a statement about what is running there. On this host 9100 is Prometheus node_exporter and the documentation is right.",
    "The same mechanism names 31337 'Elite', which is equally a guess. To find out what is actually listening you need a banner grab or service detection, which is what `nmap -sV` does.",
    "The general point is that a port scan tells you a socket is accepting connections. It does not tell you what is on the other end, and reading the SERVICE column as though it does is one of the most common mistakes in enumeration.",
  ],
  reading: [
    { label: "Port reference", href: "/tools/port-reference" },
    { label: "Hardening a Linux server", href: "/blog/linux-server-hardening" },
  ],
};

export const aHashWithAName: Challenge = {
  slug: "a-hash-with-a-name",
  title: "A Hash With a Name",
  category: "Password cracking",
  difficulty: "medium",
  tagline: "Identify the algorithm from the digest alone, then say why it is the problem.",
  brief: [
    "Four digests, recovered from four different systems. Identify what each one is from its shape.",
    "The flag is in the note once you have worked out which of the four is unsalted, fast, and still in production use for Windows local accounts.",
  ],
  artefacts: [
    {
      kind: "table",
      title: "Four digests",
      lines: [
        "A  32 hex chars   8846f7eaee8fb117ad06bdd830b7586c",
        "B  60 chars       $2b$12$K4Xy1S8kQ0mZ9vJ7hR2wUeVw3TqO1nB6xL8pC5dF2gH4jK7mN9oPq",
        "C  64 hex chars   e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "D  starts $6$     $6$rounds=656000$Xk2p9Lq1$8fJ3nR7vB2mQ...",
      ],
    },
    {
      kind: "note",
      title: "The note",
      lines: [
        "Whichever of these is the unsalted, fast one that Windows still uses",
        "for local account storage, its name is the answer to this:",
        "",
        "  acme{<lowercase algorithm name>_is_not_a_hash_function_choice}",
      ],
    },
  ],
  flagHash: "0fc80c3c7a18ac2b1c543498a960c80dd0987897e810fcace52e79dfe53d64e5",
  flagShape: "acme{..._is_not_a_hash_function_choice}",
  hints: [
    "Length is the first signal. 32 hex characters is 128 bits; 64 hex characters is 256 bits.",
    "$2b$ and $6$ are modular crypt format prefixes, which name the algorithm outright.",
    "One of the four has no salt at all, which you can tell because there is nowhere in its format to put one.",
  ],
  walkthrough: [
    "A is NTLM: 32 hex characters, MD4 of the UTF-16LE password, no salt, no iteration count, nowhere in the format to put either. 8846f7eaee8fb117ad06bdd830b7586c is the NTLM hash of the password 'password', which is why you may recognize it.",
    "B is bcrypt. The $2b$ prefix names it and the 12 is the cost factor, so the salt and the work factor are both carried in the digest.",
    "C is a bare SHA-256, and this particular value is the digest of the empty string, which is worth memorising because it turns up constantly in logs where something hashed nothing by mistake.",
    "D is sha512crypt, $6$, with an explicit rounds parameter.",
    "So the answer is NTLM. The reason it matters is not that MD4 is broken, though it is. It is that being unsalted means one rainbow table covers every Windows machine in the world, and being fast means a modern GPU tries billions of candidates a second. Both properties are the opposite of what a password hash needs, and neither is fixable without changing the algorithm.",
    "That is also why pass-the-hash works: the NTLM hash is password-equivalent for authentication, so cracking it is often unnecessary.",
  ],
  reading: [
    { label: "Hash identifier", href: "/tools/hash-identifier" },
    { label: "Password entropy", href: "/tools/password-entropy" },
  ],
};

export const SET_ONE: Challenge[] = [
  countTheFailures,
  base64InAUserAgent,
  thePortNobodyOpened,
  theKeyWasTheYear,
  whatIsInTheHex,
  aHashWithAName,
];
