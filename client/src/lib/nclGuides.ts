/**
 * Structured teaching content for the seven National Cyber League category
 * guides.
 *
 * These are the real NCL categories. The walkthroughs are representative
 * examples invented for this site: NCL challenges are covered by an honour
 * code, so no actual competition question is reproduced here. Every
 * technical claim is meant to be correct and, where useful, tied to a
 * canonical reference (an RFC, tool documentation, OWASP, or NIST).
 *
 * One page component renders whichever guide matches the /ncl/:slug route.
 * The quiz for each guide lives here alongside its prose so the two stay in
 * one place.
 */

import type { QuizQuestion } from "@/components/study/Quiz";

export interface WalkthroughStep {
  /** Short label for the step. */
  label: string;
  /** The reasoning. */
  detail: string;
  /** Optional command or output shown in a monospace block. */
  code?: string;
}

export interface GuideResource {
  label: string;
  detail: string;
  url: string;
}

export interface GuideTool {
  name: string;
  use: string;
}

export interface NclGuide {
  slug: string;
  /** Display name of the category. */
  category: string;
  /** Sort order on the index. */
  order: number;
  /** One-line summary. */
  tagline: string;
  /** Short meta description for the page head. */
  seoDescription: string;
  whatItTests: string[];
  mentalModel: string[];
  tools: GuideTool[];
  walkthrough: {
    scenario: string;
    steps: WalkthroughStep[];
    answer: string;
  };
  mistakes: string[];
  resources: GuideResource[];
  quiz: QuizQuestion[];
}

const osint: NclGuide = {
  slug: "open-source-intelligence",
  category: "Open Source Intelligence",
  order: 1,
  tagline: "Turning a small public clue into a specific, verified fact.",
  seoDescription:
    "How the NCL Open Source Intelligence category works: pivoting from a clue, metadata and GPS extraction, DNS and certificate recon, and a worked example.",
  whatItTests: [
    "Open Source Intelligence, usually shortened to OSINT, tests whether you can find information that is already public and assemble it into an answer. Nothing here involves breaking into a system. The whole discipline is search, read, and correlate: search engines and their advanced operators, file and image metadata, geolocation, social media, public DNS and WHOIS records, certificate transparency logs, and archived copies of pages that have since changed.",
    "The difficulty is rarely that the information is hidden. It is that you start with almost nothing, a username, a photo, a domain, and you have to expand that seed into something concrete: a full name, a city, an email address, the server behind a site. A single wrong assumption early on sends you down a path that wastes the whole time budget, so the skill being tested is disciplined, verifiable investigation as much as raw searching.",
  ],
  mentalModel: [
    "Think in pivots. Every fact you find is a handle you can turn to reach the next fact. A username pivots to the accounts that use it; an account pivots to a posted photo; a photo pivots, through its metadata, to a location. Write down every pivot and where it came from, because you will need to retrace the chain and because an unsourced fact is not evidence, it is a guess.",
    "Separate what you were given from what you derived, and confirm derived facts with a second independent source before you trust them. Two accounts sharing a username do not prove they are the same person. Absence of metadata is not proof of anything either, because most social platforms strip EXIF data on upload. Stay inside the scope of the challenge: OSINT practice is about public data on the stated target, not probing systems you were not asked about.",
  ],
  tools: [
    { name: "Search operators", use: "site:, filetype:, intitle:, and inurl: narrow a search engine to exactly the pages that can carry the answer. This is often called Google dorking." },
    { name: "exiftool", use: "Reads EXIF and other embedded metadata from images and documents, including GPS coordinates, camera model, author, and software fields." },
    { name: "whois / dig", use: "WHOIS returns domain registration data (often redacted now); dig and nslookup return DNS records that map names to infrastructure." },
    { name: "crt.sh", use: "Searches Certificate Transparency logs, which record every issued TLS certificate and so expose subdomains an organisation may not advertise." },
    { name: "Wayback Machine", use: "archive.org keeps historical snapshots of pages, so information removed from the live site may still be readable." },
    { name: "Reverse image search", use: "Finds other places a photo appears, which can name a location, an event, or a person." },
  ],
  walkthrough: {
    scenario:
      "You are given a single JPEG that was posted publicly and asked to name the city where the photo was taken. Nothing in the picture itself is a landmark.",
    steps: [
      {
        label: "Read the metadata, not the picture",
        detail:
          "The pixels may show nothing recognisable, but a camera or phone often writes GPS coordinates into the file's EXIF block. exiftool is the standard tool for reading it.",
        code: "exiftool photo.jpg",
      },
      {
        label: "Find the GPS tags",
        detail:
          "Among the output are the location fields. They are written in degrees, minutes, and seconds, with a reference letter for the hemisphere.",
        code: "GPS Latitude  : 36 deg 6' 54.00\" N\nGPS Longitude : 115 deg 10' 22.00\" W",
      },
      {
        label: "Convert to decimal degrees",
        detail:
          "Maps want decimal degrees. The formula is degrees + minutes/60 + seconds/3600, made negative for a South or West reference. Latitude: 36 + 6/60 + 54/3600 = 36.115. Longitude: 115 + 10/60 + 22/3600 = 115.1728, and West makes it negative.",
        code: "36.115, -115.1728",
      },
      {
        label: "Resolve the coordinates to a place",
        detail:
          "Plug the decimal pair into any mapping service. These coordinates fall in the Las Vegas area of Nevada, which is the answer the question is looking for.",
      },
    ],
    answer:
      "The photo was taken in the Las Vegas, Nevada area, read from the GPS coordinates 36.115, -115.1728 that exiftool recovered from the file's EXIF metadata.",
  },
  mistakes: [
    "Not recording where each fact came from, so you cannot retrace or justify the chain when the answer needs to be exact.",
    "Treating a shared username or a lookalike profile as proof of identity without a second corroborating source.",
    "Assuming a photo has no location data. Many platforms strip EXIF on upload, so try the original file, not a re-shared copy.",
    "Converting GPS wrong: forgetting the negative sign for South and West, or mixing up minutes and seconds.",
    "Straying outside the target scope into active probing, which is neither OSINT nor within the honour code of practice challenges.",
  ],
  resources: [
    { label: "OSINT Framework", detail: "A categorised directory of OSINT tools and sources.", url: "https://osintframework.com/" },
    { label: "ExifTool documentation", detail: "The full tag reference for Phil Harvey's exiftool.", url: "https://exiftool.org/" },
    { label: "crt.sh", detail: "Certificate Transparency log search for subdomain discovery.", url: "https://crt.sh/" },
    { label: "Wayback Machine", detail: "The Internet Archive's historical page snapshots.", url: "https://web.archive.org/" },
    { label: "Google search operators", detail: "Google's own reference for refining searches.", url: "https://support.google.com/websearch/answer/2466433" },
    { label: "Bellingcat's Online Toolkit", detail: "A well-maintained investigator's toolkit.", url: "https://www.bellingcat.com/resources/" },
    { label: "Shodan", detail: "A search engine for internet-connected hosts and services.", url: "https://www.shodan.io/" },
  ],
  quiz: [
    {
      id: "osint-q1",
      question: "Which tool reads GPS coordinates embedded in a JPEG's metadata?",
      choices: ["exiftool", "nmap", "hashcat", "netcat"],
      correctIndex: 0,
      explanation:
        "exiftool reads EXIF metadata, including GPS tags. nmap scans hosts, hashcat cracks hashes, and netcat opens raw connections.",
    },
    {
      id: "osint-q2",
      question: "A photo's latitude reads 36 deg 6' 54\" N. What is that in decimal degrees?",
      choices: ["36.654", "36.115", "36.0654", "36.690"],
      correctIndex: 1,
      explanation:
        "Degrees + minutes/60 + seconds/3600 = 36 + 0.1 + 0.015 = 36.115. North keeps the value positive.",
    },
    {
      id: "osint-q3",
      question: "Certificate Transparency logs (such as crt.sh) help OSINT because they can:",
      choices: [
        "crack password hashes",
        "reveal subdomains from issued TLS certificates",
        "decode Base64 strings",
        "capture network packets",
      ],
      correctIndex: 1,
      explanation:
        "CT logs record every issued certificate, so the hostnames inside them expose subdomains an organisation may not otherwise publish.",
    },
  ],
};

const cryptography: NclGuide = {
  slug: "cryptography",
  category: "Cryptography",
  order: 2,
  tagline: "Recognise the scheme, peel the layers, recover the plaintext.",
  seoDescription:
    "How the NCL Cryptography category works: telling encoding from ciphers from modern crypto, classical cipher techniques, RSA weaknesses, and a worked example.",
  whatItTests: [
    "The Cryptography category tests whether you can recognise how a message has been transformed and then reverse it. That spans three quite different things that beginners often blur together: encodings such as Base64 and hex, which carry no secret and are trivially reversible; classical ciphers such as Caesar, Vigenere, and simple substitution, which do carry a key but leak the structure of the underlying language; and modern cryptography such as RSA, where the challenge is usually a weak parameter rather than breaking the algorithm itself.",
    "Challenges are frequently layered. A token might be Base64 that decodes to a hex string that decodes to a rotated message. The skill is identifying each layer in turn and applying the right transformation, rather than guessing wildly.",
  ],
  mentalModel: [
    "First classify what you are looking at. Base64 uses only A to Z, a to z, 0 to 9, plus, and slash, and is often padded with equals signs (RFC 4648). Hex uses only 0 to 9 and a to f. Text that keeps word lengths and normal letter frequencies is probably a classical cipher, not an encoding. A block of high-entropy bytes with no structure is likely modern encryption, where you should look for the mistake in how it was used.",
    "For classical ciphers, lean on the structure the cipher failed to hide. Caesar has only 25 shifts, so brute force all of them. Substitution yields to frequency analysis, since E, T, and A dominate English. Vigenere needs the key length first, found with the Kasiski examination or the index of coincidence, after which each position becomes a separate Caesar. For RSA challenges, check whether the modulus is small enough to factor, whether the public exponent is tiny, or whether two keys share a factor; a service like factordb often already holds the factorisation.",
  ],
  tools: [
    { name: "CyberChef", use: "GCHQ's browser tool for chaining operations. Build a recipe like From Base64 then ROT13 and watch the output update. Its Magic operation guesses likely encodings." },
    { name: "dcode.fr", use: "Identifies and solves a large catalogue of classical ciphers and codes." },
    { name: "Python + PyCryptodome", use: "For scripting attacks and RSA maths when a tool does not fit the exact case." },
    { name: "factordb.com", use: "A database of known integer factorisations, the first stop for a small or reused RSA modulus." },
    { name: "xortool", use: "Recovers the key length and key of a repeating-key XOR cipher." },
    { name: "RsaCtfTool", use: "Automates common RSA attacks (small e, close primes, shared factors) given a public key." },
  ],
  walkthrough: {
    scenario:
      "You are handed a token and told it hides a short phrase. It looks like this: R3VyIEtybCBWZiBHdWlyZ3JyYQ== (the exact characters are not important; the shape is).",
    steps: [
      {
        label: "Classify the outer layer",
        detail:
          "The string uses only Base64's alphabet and ends in equals padding. That is the signature of Base64, an encoding, so decode it first rather than treating it as a cipher.",
        code: "echo 'R3VyIEtybCBWZiBHdWlyZ3JyYQ==' | base64 -d",
      },
      {
        label: "Read the decoded text",
        detail:
          "Decoding gives readable-looking but scrambled words. The word lengths (3, 3, 2, 8) and letter spread look like English run through a rotation, not random bytes.",
        code: "gur xrl vf guvegrra",
      },
      {
        label: "Try the obvious rotation",
        detail:
          "Rotations are cheap to test. ROT13 is the most common in these puzzles, and applying it maps g to t, u to h, r to e, and so on.",
        code: "echo 'gur xrl vf guvegrra' | tr 'A-Za-z' 'N-ZA-Mn-za-m'",
      },
      {
        label: "Confirm the plaintext",
        detail:
          "The result reads as a clean English sentence, which confirms the layers were Base64 then ROT13. If it had not, the next step would be to brute-force all 25 Caesar shifts.",
        code: "the key is thirteen",
      },
    ],
    answer:
      "The hidden phrase is 'the key is thirteen'. The token was Base64 (an encoding) wrapping a ROT13 (a Caesar cipher with shift 13, which is its own inverse).",
  },
  mistakes: [
    "Treating an encoding as if it were encryption. Base64 and hex hide nothing; decode them and move on.",
    "Skipping the cheap attacks. Caesar has 25 shifts and ROT13 is a single guess, so always try them before anything elaborate.",
    "Attacking Vigenere without first finding the key length; each key position is only a Caesar once you know the period.",
    "Doing bit-level work by hand instead of chaining operations in CyberChef, which is faster and less error-prone.",
    "For RSA, ignoring the free wins: check factordb, check for a tiny exponent, check for a shared prime between keys.",
  ],
  resources: [
    { label: "CyberChef", detail: "The chain-of-operations tool for encodings and ciphers.", url: "https://gchq.github.io/CyberChef/" },
    { label: "dcode.fr", detail: "Cipher identifier and solver for classical schemes.", url: "https://www.dcode.fr/en" },
    { label: "factordb", detail: "Known factorisations for RSA moduli.", url: "http://factordb.com/" },
    { label: "Cryptopals", detail: "A progression of hands-on cryptography attack challenges.", url: "https://cryptopals.com/" },
    { label: "RsaCtfTool", detail: "Automated RSA attacks for CTF-style keys.", url: "https://github.com/RsaCtfTool/RsaCtfTool" },
    { label: "NIST FIPS 197", detail: "The official AES specification.", url: "https://csrc.nist.gov/pubs/fips/197/final" },
    { label: "RFC 4648", detail: "The Base16, Base32, and Base64 encoding standard.", url: "https://www.rfc-editor.org/rfc/rfc4648" },
  ],
  quiz: [
    {
      id: "crypto-q1",
      question: "A string using only A-Z, a-z, 0-9, +, / and ending in = is most likely:",
      choices: ["An MD5 hash", "A bcrypt hash", "Base64", "ROT13 ciphertext"],
      correctIndex: 2,
      explanation:
        "That alphabet with equals padding is Base64 (RFC 4648). It is an encoding, not encryption, so it can be decoded with no key.",
    },
    {
      id: "crypto-q2",
      question: "Applying ROT13 to text twice produces:",
      choices: ["The original text", "A stronger cipher", "Base64", "An MD5 hash"],
      correctIndex: 0,
      explanation:
        "ROT13 shifts by 13, and 13 + 13 = 26 is a full rotation, so ROT13 is its own inverse.",
    },
    {
      id: "crypto-q3",
      question: "For an RSA challenge with a suspiciously small modulus, a good first step is to:",
      choices: [
        "Run hashcat against it",
        "Check factordb.com for known factors",
        "Follow the TCP stream",
        "Run exiftool on it",
      ],
      correctIndex: 1,
      explanation:
        "If the modulus n factors into p and q, the private key is recoverable. factordb stores known factorisations, so it is the fastest check.",
    },
  ],
};

const passwordCracking: NclGuide = {
  slug: "password-cracking",
  category: "Password Cracking",
  order: 3,
  tagline: "Identify the hash, choose the attack, guess efficiently.",
  seoDescription:
    "How the NCL Password Cracking category works: identifying hash types, hashcat and John modes, wordlists, rules and masks, plus a worked MD5 example.",
  whatItTests: [
    "Password Cracking tests whether you can recover plaintext passwords from the hashes that represent them, and from password-protected files. That means identifying what kind of hash you have, extracting a crackable form from a file when needed, and choosing an attack strategy that fits the time you have. It is important to be clear about what cracking is: a hash is a one-way function, so you are never reversing it. You are hashing candidate guesses and comparing the result, just doing it very fast and very cleverly.",
    "You will meet raw hashes like MD5 and SHA family digests, operating-system formats such as the entries in a Unix shadow file, Windows NTLM hashes, and hashes extracted from ZIP archives, PDFs, and Office documents.",
  ],
  mentalModel: [
    "Identify before you attack. Length and prefix are the biggest clues. A 32-character hex string is MD5 or NTLM; 40 hex is SHA-1; 64 hex is SHA-256. Prefixes are decisive for the crypt formats: $1$ is md5crypt, $5$ is sha256crypt, $6$ is sha512crypt, and $2a$, $2b$, or $2y$ mark bcrypt. Salted formats must be fed to the cracker complete, with their salt, exactly as stored.",
    "Then escalate your attack from cheap to expensive. Start with a plain wordlist such as rockyou. If that misses, apply rule sets that mutate each word (capitalising, appending digits, leetspeak). If you know the structure, use a mask attack that brute-forces a specific pattern, for example an uppercase letter, three lowercase, and four digits. Pure brute force is the last resort because its cost grows exponentially with length.",
  ],
  tools: [
    { name: "hashcat", use: "The GPU-accelerated cracker. You pick the algorithm with -m (for example -m 0 for MD5) and the attack mode with -a (0 for wordlist, 3 for mask)." },
    { name: "John the Ripper", use: "The jumbo build auto-detects many formats and ships the *2john helpers that extract hashes from files." },
    { name: "zip2john / pdf2john", use: "Convert a protected ZIP or PDF into a hash line that John or hashcat can attack." },
    { name: "hashid", use: "Suggests which algorithms match the shape of a given hash." },
    { name: "rockyou.txt", use: "The classic wordlist of real leaked passwords, the standard first dictionary." },
    { name: "hashcat rules", use: "Rule files such as best64 transform each candidate word to cover common human variations." },
  ],
  walkthrough: {
    scenario:
      "A challenge gives you a file, hashes.txt, whose single line is the 32-character hex string 5f4dcc3b5aa765d61d8327deb882cf99, pulled from an application's user table.",
    steps: [
      {
        label: "Identify the hash",
        detail:
          "Thirty-two hex characters with no prefix is MD5 or NTLM. The context, an application user table rather than a Windows domain, points to MD5, which is hashcat mode 0.",
        code: "hashid 5f4dcc3b5aa765d61d8327deb882cf99",
      },
      {
        label: "Run a wordlist attack",
        detail:
          "Start with the cheapest attack: hash every word in rockyou and compare. -m 0 selects MD5 and -a 0 selects the straight wordlist mode.",
        code: "hashcat -m 0 -a 0 hashes.txt rockyou.txt",
      },
      {
        label: "Escalate only if needed",
        detail:
          "If the plain wordlist misses, add a rule set to cover mutations before resorting to a mask or brute force.",
        code: "hashcat -m 0 -a 0 hashes.txt rockyou.txt -r rules/best64.rule",
      },
      {
        label: "Read the cracked result",
        detail:
          "hashcat prints the recovered value next to the hash. This particular digest is the well-known MD5 of the word password.",
        code: "5f4dcc3b5aa765d61d8327deb882cf99:password",
      },
    ],
    answer:
      "The password is 'password'. It was found by an MD5 wordlist attack (hashcat -m 0), which recovers the input by guessing, not by reversing the hash.",
  },
  mistakes: [
    "Choosing the wrong mode, most often confusing MD5 and NTLM because both are 32 hex characters. Let context decide.",
    "Stopping after a plain wordlist. Rules and masks crack a large share of what the raw list misses.",
    "Feeding a salted hash without its salt. Formats like bcrypt and sha512crypt must be supplied complete.",
    "Trying to decrypt a hash. There is no key and no inverse; you can only guess and compare.",
    "Forgetting the *2john extractors for protected ZIP, PDF, and Office files, then wondering why there is nothing to crack.",
  ],
  resources: [
    { label: "hashcat wiki", detail: "Modes, attack types, and example hashes for every format.", url: "https://hashcat.net/wiki/" },
    { label: "hashcat example hashes", detail: "A reference line for every -m mode number.", url: "https://hashcat.net/wiki/doku.php?id=example_hashes" },
    { label: "John the Ripper", detail: "Openwall's documentation for the jumbo cracker and its helpers.", url: "https://www.openwall.com/john/" },
    { label: "SecLists", detail: "A large collection of wordlists including passwords and rules.", url: "https://github.com/danielmiessler/SecLists" },
    { label: "Name-That-Hash", detail: "A modern hash identifier that suggests likely algorithms.", url: "https://github.com/HashPals/Name-That-Hash" },
    { label: "hashcat mask attack docs", detail: "How to build pattern-based (mask) attacks.", url: "https://hashcat.net/wiki/doku.php?id=mask_attack" },
  ],
  quiz: [
    {
      id: "crack-q1",
      question: "A hash beginning with $2b$ is:",
      choices: ["MD5", "bcrypt", "SHA-256", "NTLM"],
      correctIndex: 1,
      explanation:
        "The prefixes $2a$, $2b$, and $2y$ denote bcrypt. MD5 and NTLM have no prefix; SHA-256 is raw hex.",
    },
    {
      id: "crack-q2",
      question: "In hashcat, which mode number selects plain MD5?",
      choices: ["0", "100", "1000", "1400"],
      correctIndex: 0,
      explanation:
        "-m 0 is MD5. For reference, 100 is SHA-1, 1000 is NTLM, and 1400 is SHA-256.",
    },
    {
      id: "crack-q3",
      question: "The rockyou.txt wordlist is used to:",
      choices: [
        "Reverse a hash mathematically",
        "Try likely passwords in a dictionary attack",
        "Encode data as Base64",
        "Scan a host for open ports",
      ],
      correctIndex: 1,
      explanation:
        "Cracking hashes each candidate word and compares it to the target. You never reverse the hash; you guess efficiently.",
    },
  ],
};

const logAnalysis: NclGuide = {
  slug: "log-analysis",
  category: "Log Analysis",
  order: 4,
  tagline: "Know the format, reduce the noise, aggregate the signal.",
  seoDescription:
    "How the NCL Log Analysis category works: reading web and auth log formats, grep/awk/sort/uniq aggregation, spotting brute force, and a worked example.",
  whatItTests: [
    "Log Analysis tests whether you can pull a specific answer out of a large, noisy log file. Which address sent the most requests, which user agent was scripted, when did a brute-force attempt finally succeed, what file did an attacker fetch. The data is almost always more than you can read line by line, so the category rewards fluency with command-line text processing over any graphical tool.",
    "The logs are usually familiar formats: web server access logs in the Apache or Nginx combined style, Linux authentication logs, and general syslog. Knowing the exact shape of these formats is half the battle, because every filter and count depends on which field is which.",
  ],
  mentalModel: [
    "Learn the format before you touch the data. The Apache combined log format is host, identity, user, timestamp, the quoted request line, status code, bytes, referer, and user agent, in that order (documented in Apache's mod_log_config). Once you know that the client address is field one and the status is field nine, every question becomes a matter of selecting and counting the right field.",
    "Then work in three moves: filter to the relevant lines, aggregate, and rank. The idiom sort then uniq -c then sort -rn counts occurrences and puts the most frequent first, which answers a huge fraction of log questions directly. Beyond frequency, hunt anomalies: a burst of 401 responses followed by a 302 or 200, unusual status codes, a scripted user agent, or activity at an odd hour. Always confirm which timezone the timestamps are in before you quote a time.",
  ],
  tools: [
    { name: "grep", use: "Filters lines by pattern. -i ignores case, -v inverts, -E enables extended regular expressions, -c counts matches." },
    { name: "awk", use: "Selects and computes on fields. awk '{print $1}' prints the first whitespace-separated column." },
    { name: "sort / uniq", use: "sort orders lines; uniq -c collapses and counts adjacent duplicates, so the two are almost always paired." },
    { name: "cut / sed", use: "cut slices by delimiter; sed edits and substitutes with regular expressions." },
    { name: "wc", use: "Counts lines, words, or bytes. wc -l is the line counter." },
    { name: "jq", use: "Queries and filters structured JSON logs the way awk handles columnar text." },
  ],
  walkthrough: {
    scenario:
      "You are given an Apache access log and asked which client was brute-forcing the login and whether it succeeded.",
    steps: [
      {
        label: "Rank clients by request volume",
        detail:
          "Field one is the client address. Count per address and sort descending to surface the noisiest client, a common brute-force signature.",
        code: "awk '{print $1}' access.log | sort | uniq -c | sort -rn | head",
      },
      {
        label: "Isolate that client's login attempts",
        detail:
          "Filter the top address down to its POST requests against the login endpoint. A long run of failures is the attack.",
        code: "grep '10.10.10.5' access.log | grep 'POST /login'",
      },
      {
        label: "Read the status codes over time",
        detail:
          "Repeated 401 Unauthorized responses are failed logins. A scripted user agent confirms automation. Then the status changes.",
        code: "10.10.10.5 ... \"POST /login HTTP/1.1\" 401 512 \"-\" \"python-requests/2.31.0\"\n10.10.10.5 ... \"POST /login HTTP/1.1\" 401 512 \"-\" \"python-requests/2.31.0\"\n10.10.10.5 ... \"POST /login HTTP/1.1\" 302 0   \"-\" \"python-requests/2.31.0\"",
      },
      {
        label: "Interpret the change",
        detail:
          "The 302 redirect after a wall of 401s is the successful login: the application accepted the credentials and redirected the client onward. The timestamp of that line is when the account was compromised.",
      },
    ],
    answer:
      "The client 10.10.10.5, using the scripted user agent python-requests, brute-forced the login and succeeded at the moment its request status changed from repeated 401 responses to a 302 redirect.",
  },
  mistakes: [
    "Not knowing the log format, so an awk field number points at the wrong column and every count is wrong.",
    "Quoting a time without checking the timezone offset recorded in the timestamp.",
    "Counting raw lines when the question asks for unique values, or the reverse.",
    "Trusting client-supplied fields such as the user agent or an X-Forwarded-For header as if they were ground truth.",
    "Misreading which status means success. A 302 redirect or a 200 after failures is the tell, not another 401.",
  ],
  resources: [
    { label: "Apache mod_log_config", detail: "The authoritative definition of the common and combined log formats.", url: "https://httpd.apache.org/docs/current/mod/mod_log_config.html" },
    { label: "Nginx log_format", detail: "How Nginx access logs are structured and customised.", url: "https://nginx.org/en/docs/http/ngx_http_log_module.html" },
    { label: "GNU Grep manual", detail: "Every flag for pattern filtering.", url: "https://www.gnu.org/software/grep/manual/grep.html" },
    { label: "GNU Awk manual", detail: "Field processing and aggregation.", url: "https://www.gnu.org/software/gawk/manual/gawk.html" },
    { label: "jq manual", detail: "Filtering and querying JSON logs.", url: "https://jqlang.github.io/jq/manual/" },
    { label: "regex101", detail: "An interactive regular-expression builder and explainer.", url: "https://regex101.com/" },
  ],
  quiz: [
    {
      id: "log-q1",
      question: "In the Apache combined log format, the first field is:",
      choices: ["The HTTP status code", "The client address", "The user agent", "The timestamp"],
      correctIndex: 1,
      explanation:
        "The format begins with %h, the remote host or client address. The status code is later, at field nine.",
    },
    {
      id: "log-q2",
      question: "What does `awk '{print $1}' access.log | sort | uniq -c | sort -rn` produce?",
      choices: [
        "Request counts per client, most frequent first",
        "A list of requested URLs",
        "The file's total line count",
        "Decoded Base64 output",
      ],
      correctIndex: 0,
      explanation:
        "Field one is the client address; sort groups them, uniq -c counts each, and sort -rn orders the counts descending.",
    },
    {
      id: "log-q3",
      question: "After many 401 responses to POST /login from one client, a 302 response most likely means:",
      choices: [
        "The server crashed",
        "A DNS lookup happened",
        "A successful login redirect",
        "The payload was encrypted",
      ],
      correctIndex: 2,
      explanation:
        "A 302 redirect following repeated 401 failures indicates the credentials were finally accepted and the app redirected the client.",
    },
  ],
};

const trafficAnalysis: NclGuide = {
  slug: "network-traffic-analysis",
  category: "Network Traffic Analysis",
  order: 5,
  tagline: "Survey the capture, follow the stream, extract the payload.",
  seoDescription:
    "How the NCL Network Traffic Analysis category works: reading pcaps in Wireshark, display versus capture filters, following streams, scan signatures, and an example.",
  whatItTests: [
    "Network Traffic Analysis tests whether you can read a packet capture and pull information out of it: credentials sent in cleartext, a file that was transferred, the names a host looked up in DNS, or the behaviour of a protocol. This is also where scanning and enumeration show up, because a port scan leaves an unmistakable pattern in a capture and recognising it is part of the skill.",
    "You are given pcap files and expected to navigate them efficiently. Captures can hold tens of thousands of packets, so the work is about narrowing quickly to the conversation that matters and then reassembling it into something readable.",
  ],
  mentalModel: [
    "Survey before you dig. In Wireshark, the Statistics menu gives you Protocol Hierarchy, Conversations, and Endpoints, which tell you at a glance what protocols are present and which hosts did the talking. That points you at the interesting traffic instead of scrolling packet by packet.",
    "Then narrow and reassemble. Display filters cut the view to what you care about, and Follow Stream stitches a conversation's bytes back together across every packet it spans. Keep one distinction firmly in mind: capture filters use Berkeley Packet Filter syntax like tcp port 80, while display filters use Wireshark's own syntax like tcp.port == 80. Cleartext protocols leak freely, so HTTP, FTP, Telnet, and DNS are always worth a look. A port scan appears as one source sending SYN packets to many destination ports, with closed ports answering RST, which is the classic nmap SYN-scan signature.",
  ],
  tools: [
    { name: "Wireshark", use: "The graphical analyzer. Statistics to survey, display filters to narrow, Follow Stream to reassemble, and Export Objects to pull files out of HTTP." },
    { name: "tshark", use: "Wireshark's command-line form, for scripting extractions and filtering large captures." },
    { name: "tcpdump", use: "Captures and reads traffic on the command line using BPF capture filters." },
    { name: "NetworkMiner", use: "Automatically carves files, credentials, and images out of a capture." },
    { name: "nmap", use: "The scanner whose traffic you learn to recognise; -sV adds service and version detection to a scan." },
    { name: "Zeek", use: "Turns raw traffic into structured connection and protocol logs for higher-level analysis." },
  ],
  walkthrough: {
    scenario:
      "You are given a pcap and asked to recover the credentials used in an FTP session and identify what was downloaded.",
    steps: [
      {
        label: "Survey the capture",
        detail:
          "Statistics then Protocol Hierarchy shows the capture contains FTP control traffic and FTP-DATA. FTP is a cleartext protocol (RFC 959), which is promising.",
      },
      {
        label: "Filter to the control channel",
        detail:
          "A display filter of ftp isolates the command channel, where the client's login is sent in the clear as USER and PASS commands.",
        code: "ftp",
      },
      {
        label: "Read the credentials",
        detail:
          "The USER and PASS commands appear as plain text in the packet list, so the username and password are read directly.",
        code: "Request: USER analyst\nRequest: PASS S3cure!Transfer",
      },
      {
        label: "Reassemble the transferred file",
        detail:
          "FTP moves file contents over a separate data connection. Right-click a data packet and Follow TCP Stream to reassemble the bytes, then save them to recover the downloaded file.",
        code: "ftp-data",
      },
    ],
    answer:
      "The session logged in as user 'analyst' with password 'S3cure!Transfer', both readable because FTP sends them in cleartext, and the transferred file is recovered by following and saving the FTP-DATA stream.",
  },
  mistakes: [
    "Confusing capture filters (BPF, like tcp port 21) with display filters (Wireshark syntax, like tcp.port == 21).",
    "Diving into individual packets before checking Protocol Hierarchy and Conversations to see what is even there.",
    "Forgetting to Follow Stream, so you read fragments of a conversation instead of the reassembled whole.",
    "Assuming everything is encrypted. Cleartext protocols remain common, and they hand you credentials and files.",
    "Overlooking that FTP uses a second data connection, so the file is not in the control channel you first filtered to.",
  ],
  resources: [
    { label: "Wireshark User's Guide", detail: "Statistics, Follow Stream, and Export Objects explained.", url: "https://www.wireshark.org/docs/wsug_html_chunked/" },
    { label: "Wireshark display filters", detail: "The full display-filter reference.", url: "https://www.wireshark.org/docs/dfref/" },
    { label: "tcpdump manual", detail: "Command-line capture with BPF filters.", url: "https://www.tcpdump.org/manpages/tcpdump.1.html" },
    { label: "RFC 959", detail: "The File Transfer Protocol specification.", url: "https://www.rfc-editor.org/rfc/rfc959" },
    { label: "Nmap reference guide", detail: "How scans work and what they look like on the wire.", url: "https://nmap.org/book/man.html" },
    { label: "Malware-Traffic-Analysis.net", detail: "Practice pcaps with guided exercises.", url: "https://www.malware-traffic-analysis.net/" },
  ],
  quiz: [
    {
      id: "traffic-q1",
      question: "In Wireshark, `tcp.port == 80` is a:",
      choices: ["Capture filter", "Display filter", "BPF expression", "An nmap flag"],
      correctIndex: 1,
      explanation:
        "That is Wireshark display-filter syntax. The equivalent capture (BPF) filter would be written 'tcp port 80'.",
    },
    {
      id: "traffic-q2",
      question: "FTP transmits its username and password:",
      choices: ["Encrypted with AES", "In cleartext", "Hashed with bcrypt", "Never over the network"],
      correctIndex: 1,
      explanation:
        "FTP (RFC 959) sends USER and PASS in cleartext, so a packet capture reveals them directly.",
    },
    {
      id: "traffic-q3",
      question: "To reassemble a full conversation from a capture in Wireshark you would:",
      choices: [
        "Run hashcat on it",
        "Use Follow > TCP Stream",
        "Open it in exiftool",
        "Edit /etc/passwd",
      ],
      correctIndex: 1,
      explanation:
        "Follow Stream stitches together the bytes of a conversation that are otherwise spread across many packets.",
    },
  ],
};

const forensics: NclGuide = {
  slug: "forensics",
  category: "Forensics",
  order: 6,
  tagline: "Never trust the extension. Look at what the bytes actually are.",
  seoDescription:
    "How the NCL Forensics category works: file signatures and magic bytes, strings and binwalk, steganography, metadata, memory analysis, and a worked example.",
  whatItTests: [
    "Forensics tests whether you can examine a file or a disk or memory artifact and recover what is hidden in it. That includes identifying a file's real type when the extension lies, finding data appended or embedded inside another file, extracting metadata, pulling readable strings out of a binary, defeating simple steganography, and sometimes analysing a memory dump.",
    "The recurring theme is that appearances deceive. A file named image.png may not be a PNG, or it may be a valid PNG with a ZIP archive stapled onto the end. The category rewards a habit of checking what something actually is rather than what it claims to be.",
  ],
  mentalModel: [
    "Start with identity and content, not the name. Run the file command, which reads the leading magic bytes to determine the real type. Learn the common signatures: a PNG begins with the bytes 89 50 4E 47, a JPEG with FF D8 FF, a PDF with 25 50 44 46 (the ASCII %PDF), and a ZIP or any format built on it, such as a docx, with 50 4B 03 04 (the ASCII PK). When the magic bytes and the extension disagree, believe the bytes.",
    "Then look inside. Run strings first, because flags are often sitting in plain text. Run binwalk to detect files embedded or appended inside the target, since a valid file can carry another one past its own end marker. Check metadata with exiftool, whose comment fields are a favourite hiding place. For images with real steganography, try steghide or stegseek with a wordlist; for memory dumps, use the Volatility framework with the correct profile.",
  ],
  tools: [
    { name: "file", use: "Reports the true file type from its magic bytes, regardless of the extension." },
    { name: "xxd / hexdump", use: "Shows the raw bytes so you can inspect headers and footers by hand." },
    { name: "strings", use: "Prints runs of printable characters from a binary, where plaintext flags often hide." },
    { name: "binwalk", use: "Scans for embedded file signatures and, with -e, extracts what it finds." },
    { name: "exiftool", use: "Reads metadata fields, including comment and author fields used to conceal data." },
    { name: "Volatility", use: "Analyses memory dumps to recover processes, network connections, and secrets." },
  ],
  walkthrough: {
    scenario:
      "You are given a file called puzzle.png that opens as a normal image but is suspiciously large for what it shows.",
    steps: [
      {
        label: "Confirm the real type",
        detail:
          "file reports a valid PNG, so the header is genuine. That does not rule out extra data hidden after the image payload.",
        code: "file puzzle.png",
      },
      {
        label: "Scan for embedded files",
        detail:
          "binwalk reads through the file looking for known signatures. Here it finds a ZIP archive beginning well past the PNG data, which explains the size.",
        code: "binwalk puzzle.png",
      },
      {
        label: "Read the binwalk output",
        detail:
          "The scan lists the PNG at offset zero and a Zip archive at a later offset, naming a file inside it. The image is a carrier; the real content is the appended archive.",
        code: "DECIMAL   HEX       DESCRIPTION\n0         0x0       PNG image data\n41235     0xA113    Zip archive data, name: secret.txt",
      },
      {
        label: "Extract and open",
        detail:
          "binwalk -e carves the embedded archive out to disk. Unzipping it yields secret.txt, which holds the answer. If it had been true steganography instead, the next move would be steghide or stegseek with a wordlist.",
        code: "binwalk -e puzzle.png",
      },
    ],
    answer:
      "The image is a carrier with a ZIP archive appended after the valid PNG data. binwalk detects and extracts it, and the archived secret.txt contains the answer.",
  },
  mistakes: [
    "Trusting the file extension. Always confirm the real type with the file command's reading of the magic bytes.",
    "Not running strings first, when the flag is frequently sitting in plaintext inside the file.",
    "Forgetting that data can be appended after a valid file's end marker, which is exactly what binwalk finds.",
    "Giving up on steghide without a passphrase; try a wordlist or use stegseek to brute-force it.",
    "Skipping metadata. exiftool comment and author fields are a common and easy hiding place.",
  ],
  resources: [
    { label: "File Signatures table", detail: "Gary Kessler's reference of magic bytes by file type.", url: "https://www.garykessler.net/library/file_sigs.html" },
    { label: "binwalk", detail: "Firmware and embedded-file analysis tool documentation.", url: "https://github.com/ReFirmLabs/binwalk" },
    { label: "The Sleuth Kit & Autopsy", detail: "Disk-image forensic analysis tools.", url: "https://www.sleuthkit.org/" },
    { label: "Volatility Foundation", detail: "The memory-forensics framework and its documentation.", url: "https://volatilityfoundation.org/" },
    { label: "stegseek", detail: "A fast brute-forcer for steghide-protected files.", url: "https://github.com/RickdeJager/stegseek" },
    { label: "NIST SP 800-86", detail: "NIST's guide to integrating forensic techniques into incident response.", url: "https://csrc.nist.gov/pubs/sp/800/86/final" },
    { label: "CyberChef", detail: "Its Magic and file-type operations help identify unknown data.", url: "https://gchq.github.io/CyberChef/" },
  ],
  quiz: [
    {
      id: "forensics-q1",
      question: "The leading bytes 89 50 4E 47 identify a:",
      choices: ["ZIP archive", "PNG image", "PDF document", "ELF binary"],
      correctIndex: 1,
      explanation:
        "PNG files begin with 89 50 4E 47 (the 50 4E 47 spells PNG in ASCII). ZIP is 50 4B, PDF is 25 50 44 46, ELF is 7F 45 4C 46.",
    },
    {
      id: "forensics-q2",
      question: "binwalk is used to:",
      choices: [
        "Crack password hashes",
        "Find and extract files embedded in another file",
        "Scan a host for open ports",
        "Read web server logs",
      ],
      correctIndex: 1,
      explanation:
        "binwalk scans for known file signatures inside a target, revealing appended or embedded data and extracting it with -e.",
    },
    {
      id: "forensics-q3",
      question: "Why run `file` on an artifact before analysing it?",
      choices: [
        "To identify the true type from its content, since the extension can lie",
        "To securely delete it",
        "To encrypt it",
        "To open a network port",
      ],
      correctIndex: 0,
      explanation:
        "file reads the magic bytes to report the real type. Extensions are attacker-controlled and cannot be trusted.",
    },
  ],
};

const webExploitation: NclGuide = {
  slug: "web-application-exploitation",
  category: "Web Application Exploitation",
  order: 7,
  tagline: "Map the app, distrust every input, exploit the trust boundary.",
  seoDescription:
    "How the NCL Web Application Exploitation category works: recon and enumeration, SQL injection, XSS and more, OWASP references, and a worked auth-bypass example.",
  whatItTests: [
    "Web Application Exploitation tests whether you can find and exploit flaws in a web application. The common families are SQL injection, cross-site scripting, command injection, path traversal, insecure direct object references, and broken authentication or authorisation, along with information disclosure through exposed files. It also rewards thorough enumeration, because finding the vulnerable endpoint is often harder than exploiting it once found.",
    "The unifying idea is the trust boundary. Everything that arrives from the client, form fields, URL parameters, headers, and cookies, is attacker-controlled and must be treated as hostile. Vulnerabilities are where the application forgets that.",
  ],
  mentalModel: [
    "Map before you attack. Read the page source, the linked JavaScript, and any HTML comments. Check robots.txt and common paths, since disallowed entries and files like a backup or an exposed .git directory are handed to you as leads. Enumerate directories and parameters with a fuzzer. Only once you know the app's shape do you know where its inputs are.",
    "Then test each input against the OWASP Top 10 families, reasoning about how the server uses your data. For injection, picture the query or command your input becomes part of and craft input that changes its meaning. Use an intercepting proxy to read and modify the exact requests, because the browser hides much of what is really sent. The defence to keep in mind, because it tells you what the developer may have skipped, is that user data must be kept separate from code, through parameterised queries for SQL and output encoding for HTML.",
  ],
  tools: [
    { name: "Burp Suite", use: "An intercepting proxy to read, modify, and replay every request between browser and server." },
    { name: "Browser dev tools", use: "Inspect the DOM, network requests, cookies, and JavaScript that reveal how the app works." },
    { name: "curl", use: "Sends precise, scriptable requests with chosen methods, headers, and bodies." },
    { name: "ffuf / gobuster", use: "Brute-force directories, files, and parameters to enumerate hidden endpoints." },
    { name: "sqlmap", use: "Automates detection and exploitation of SQL injection once you have found a candidate parameter." },
    { name: "jwt_tool", use: "Inspects and tampers with JSON Web Tokens to test authentication handling." },
  ],
  walkthrough: {
    scenario:
      "A login form seems to build its SQL query directly from the username and password fields. You want to log in as admin without knowing the password.",
    steps: [
      {
        label: "Probe for injection",
        detail:
          "Enter a single quote in the username. If the app returns a database error or behaves oddly, your input is reaching the SQL query unescaped, which is the injection signal.",
        code: "username: '",
      },
      {
        label: "Picture the query",
        detail:
          "A vulnerable login typically builds something like the statement below, dropping your input straight between quotes.",
        code: "SELECT id FROM users WHERE username='INPUT' AND password='INPUT'",
      },
      {
        label: "Craft the payload",
        detail:
          "Supply a username that closes the string and comments out the rest. In MySQL the comment marker is two hyphens followed by a space. The password field then becomes irrelevant.",
        code: "username: admin' -- ",
      },
      {
        label: "Read the resulting query",
        detail:
          "Your input turns the statement into the line below. Everything after the comment marker is ignored, so the password check disappears and the app authenticates you as admin.",
        code: "SELECT id FROM users WHERE username='admin' -- ' AND password='x'",
      },
    ],
    answer:
      "Submitting the username admin' followed by a comment marker turns the query into a lookup of admin alone, ignoring the password clause and logging you in as admin. The fix is parameterised queries, which keep input as data rather than executable SQL (OWASP).",
  },
  mistakes: [
    "Skipping recon. The page source, JavaScript, HTML comments, and robots.txt routinely hand over the vulnerable endpoint.",
    "Testing only the obvious field. Parameters, headers, and cookies are inputs too, and often the unguarded ones.",
    "Getting the syntax detail wrong, such as forgetting that a MySQL inline comment needs a space after the two hyphens.",
    "Trusting client-side validation as a control. It is a convenience for users, not a security boundary.",
    "Not using an intercepting proxy, so you never see or can modify the real requests the browser sends.",
  ],
  resources: [
    { label: "OWASP Top 10", detail: "The reference list of the most critical web application risks.", url: "https://owasp.org/www-project-top-ten/" },
    { label: "OWASP Web Security Testing Guide", detail: "A structured methodology for testing web apps.", url: "https://owasp.org/www-project-web-security-testing-guide/" },
    { label: "OWASP Cheat Sheet Series", detail: "Concise prevention guidance, including SQL injection and XSS.", url: "https://cheatsheetseries.owasp.org/" },
    { label: "PortSwigger Web Security Academy", detail: "Free, high-quality labs for every web vulnerability class.", url: "https://portswigger.net/web-security" },
    { label: "sqlmap", detail: "Documentation for the automated SQL injection tool.", url: "https://sqlmap.org/" },
    { label: "PayloadsAllTheThings", detail: "A large collection of exploitation payloads and techniques.", url: "https://github.com/swisskyrepo/PayloadsAllTheThings" },
    { label: "ffuf", detail: "The fast web fuzzer for directory and parameter discovery.", url: "https://github.com/ffuf/ffuf" },
  ],
  quiz: [
    {
      id: "web-q1",
      question: "Entering `admin' -- ` in a login username can bypass authentication because it:",
      choices: [
        "Encodes the password",
        "Comments out the password check in the SQL query",
        "Scans the server for ports",
        "Crashes the browser",
      ],
      correctIndex: 1,
      explanation:
        "The two-hyphen marker starts a SQL comment, so the AND password clause is ignored and the query matches admin alone.",
    },
    {
      id: "web-q2",
      question: "The primary defence against SQL injection is:",
      choices: [
        "Parameterised (prepared) queries",
        "Hiding the login page",
        "Using a longer password",
        "Serving the site over HTTPS",
      ],
      correctIndex: 0,
      explanation:
        "Parameterised queries keep user input as data separate from the SQL code, so input cannot change the query's meaning (OWASP).",
    },
    {
      id: "web-q3",
      question: "Checking robots.txt during web recon can:",
      choices: [
        "Crack a password hash",
        "Reveal hidden or disallowed paths",
        "Decode Base64",
        "Capture packets",
      ],
      correctIndex: 1,
      explanation:
        "robots.txt often lists directories the owner wants kept out of search results, which is a useful lead for an attacker.",
    },
  ],
};

export const NCL_GUIDES: NclGuide[] = [
  osint,
  cryptography,
  passwordCracking,
  logAnalysis,
  trafficAnalysis,
  forensics,
  webExploitation,
];

export function getGuide(slug: string): NclGuide | undefined {
  return NCL_GUIDES.find((guide) => guide.slug === slug);
}
