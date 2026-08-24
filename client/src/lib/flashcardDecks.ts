/**
 * Flashcard decks for the spaced-repetition trainer.
 *
 * These are study aids, so every answer has to be correct: a wrong card
 * teaches a wrong fact. Port numbers follow the IANA Service Name and
 * Transport Protocol Port Number Registry; protocol behaviour follows the
 * relevant RFCs; the security and crypto cards state only durable,
 * uncontested facts. Where a value has a common misconception attached
 * (AES block size versus key size, MD5 digest length), the card states the
 * exact figure.
 *
 * Card ids are stable strings. The scheduler keys its saved state on them,
 * so renaming an id resets that card's history; adding or removing cards is
 * safe.
 */

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Deck {
  id: string;
  name: string;
  /** One line for the deck picker. */
  description: string;
  cards: Flashcard[];
}

const networking: Deck = {
  id: "networking-fundamentals",
  name: "Networking fundamentals",
  description: "The OSI model, addressing, and how devices move packets.",
  cards: [
    { id: "net-osi-layers", front: "Name the seven OSI layers, 1 to 7.", back: "Physical, Data Link, Network, Transport, Session, Presentation, Application. Mnemonic: Please Do Not Throw Sausage Pizza Away." },
    { id: "net-osi-l3", front: "Which OSI layer does a router operate at?", back: "Layer 3, the Network layer. Routers forward packets between networks using IP addresses." },
    { id: "net-osi-l2", front: "Which OSI layer does a switch operate at?", back: "Layer 2, the Data Link layer. A switch forwards frames using MAC addresses. (Layer 3 switches also route.)" },
    { id: "net-tcpip-model", front: "Name the four layers of the TCP/IP model.", back: "Link (Network Access), Internet, Transport, and Application." },
    { id: "net-mac-length", front: "How long is a MAC address, and at what layer does it live?", back: "48 bits (6 bytes), usually written as 12 hex digits. It is a Layer 2 (Data Link) hardware address." },
    { id: "net-ipv4-length", front: "How many bits is an IPv4 address?", back: "32 bits, written as four dotted-decimal octets, e.g. 192.168.1.10." },
    { id: "net-ipv6-length", front: "How many bits is an IPv6 address?", back: "128 bits, written as eight groups of four hex digits." },
    { id: "net-rfc1918", front: "What are the three RFC 1918 private IPv4 ranges?", back: "10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16. Not routable on the public internet." },
    { id: "net-loopback", front: "What is the IPv4 loopback address and range?", back: "127.0.0.1 is the common loopback; the whole 127.0.0.0/8 block is reserved for loopback." },
    { id: "net-apipa", front: "What is the APIPA / link-local IPv4 range?", back: "169.254.0.0/16. A host self-assigns from this block when DHCP fails." },
    { id: "net-slash24-hosts", front: "How many usable hosts are in a /24?", back: "254. A /24 has 256 addresses; subtract the network and broadcast addresses (2^8 - 2)." },
    { id: "net-mask-24", front: "What is the dotted-decimal mask for /24?", back: "255.255.255.0. Twenty-four network bits, eight host bits." },
    { id: "net-network-addr", front: "What identifies the network address of a subnet?", back: "All host bits set to 0. The broadcast address is all host bits set to 1." },
    { id: "net-dhcp", front: "What does DHCP do, and what are its four steps?", back: "Dynamically assigns IP configuration. The exchange is Discover, Offer, Request, Acknowledge (DORA)." },
    { id: "net-dns", front: "What does DNS do?", back: "Resolves human-readable domain names into IP addresses (and back, plus other record types)." },
    { id: "net-arp", front: "What does ARP do?", back: "Maps a known IPv4 address to its MAC address within a local network. IPv6 uses Neighbor Discovery instead." },
    { id: "net-nat", front: "What does NAT do?", back: "Translates between private and public IP addresses so many internal hosts can share public addressing." },
    { id: "net-tcp-udp", front: "TCP versus UDP in one line each.", back: "TCP is connection-oriented and reliable (ordering, retransmission). UDP is connectionless, best-effort, and lower overhead." },
    { id: "net-handshake", front: "What is the TCP three-way handshake?", back: "SYN from the client, SYN-ACK from the server, ACK from the client. Then the connection is established." },
    { id: "net-vlan", front: "What is a VLAN?", back: "A logical Layer 2 segment that splits one physical switch into separate broadcast domains. Tagged with 802.1Q." },
    { id: "net-gateway", front: "What is a default gateway?", back: "The router address a host sends traffic to when the destination is outside its own subnet." },
    { id: "net-cidr", front: "What does CIDR notation express?", back: "The prefix length: the number of leading bits used for the network portion, e.g. /26 means 26 network bits." },
    { id: "net-icmp", front: "What is ICMP used for?", back: "Diagnostics and error messaging. Ping uses ICMP Echo Request and Echo Reply." },
    { id: "net-traceroute", front: "What field does traceroute manipulate to map a path?", back: "The IP TTL (Time To Live). Each hop that discards an expired packet returns an ICMP Time Exceeded message." },
    { id: "net-mtu", front: "What is the standard Ethernet MTU?", back: "1500 bytes of payload. Frames carrying more are called jumbo frames." },
    { id: "net-hub-switch", front: "How does a hub differ from a switch?", back: "A hub is a Layer 1 repeater that floods every port. A switch learns MAC addresses and forwards frames only to the correct port." },
    { id: "net-collision-broadcast", front: "Collision domain versus broadcast domain?", back: "A switch port is its own collision domain; a VLAN or router boundary defines a broadcast domain. Routers do not forward broadcasts." },
    { id: "net-cast-types", front: "Define unicast, broadcast, and multicast.", back: "Unicast is one-to-one, broadcast is one-to-all on a segment, multicast is one-to-a-subscribed-group." },
    { id: "net-ipv6-linklocal", front: "What is the IPv6 link-local prefix?", back: "fe80::/10. Every IPv6 interface has a link-local address for on-link communication." },
    { id: "net-duplex", front: "Full duplex versus half duplex?", back: "Full duplex sends and receives simultaneously. Half duplex does one direction at a time and is subject to collisions." },
    { id: "net-well-known-ports", front: "What are the three IANA port ranges?", back: "Well-known 0 to 1023, registered 1024 to 49151, and dynamic/ephemeral 49152 to 65535." },
  ],
};

const ports: Deck = {
  id: "ports-and-protocols",
  name: "Ports and protocols",
  description: "The well-known TCP and UDP port numbers worth memorising.",
  cards: [
    { id: "port-ftp", front: "FTP ports and transport?", back: "TCP 21 for control, TCP 20 for active-mode data." },
    { id: "port-ssh", front: "SSH port and transport?", back: "TCP 22. Also used by SFTP and SCP, which run over SSH." },
    { id: "port-telnet", front: "Telnet port?", back: "TCP 23. Cleartext, so it is deprecated in favour of SSH." },
    { id: "port-smtp", front: "SMTP port for server-to-server mail?", back: "TCP 25. Message submission from clients uses 587 (STARTTLS) or 465 (implicit TLS)." },
    { id: "port-dns", front: "DNS port(s)?", back: "53 on both UDP and TCP. UDP for most queries, TCP for zone transfers and large responses." },
    { id: "port-dhcp", front: "DHCP ports?", back: "UDP 67 on the server, UDP 68 on the client." },
    { id: "port-tftp", front: "TFTP port and transport?", back: "UDP 69. Trivial FTP: no authentication, used for things like network boot." },
    { id: "port-http", front: "HTTP port?", back: "TCP 80." },
    { id: "port-https", front: "HTTPS port?", back: "TCP 443. HTTP over TLS." },
    { id: "port-kerberos", front: "Kerberos port?", back: "88 (TCP and UDP)." },
    { id: "port-pop3", front: "POP3 ports?", back: "TCP 110 for cleartext, TCP 995 for POP3 over TLS (POP3S)." },
    { id: "port-ntp", front: "NTP port and transport?", back: "UDP 123. Network Time Protocol." },
    { id: "port-imap", front: "IMAP ports?", back: "TCP 143 for cleartext, TCP 993 for IMAP over TLS (IMAPS)." },
    { id: "port-snmp", front: "SNMP ports?", back: "UDP 161 for agent queries, UDP 162 for traps sent to the manager." },
    { id: "port-ldap", front: "LDAP ports?", back: "389 for LDAP, 636 for LDAPS (LDAP over TLS)." },
    { id: "port-smb", front: "SMB / CIFS port?", back: "TCP 445. Windows file and printer sharing (SMB also historically used 137 to 139)." },
    { id: "port-syslog", front: "Syslog port and transport?", back: "UDP 514." },
    { id: "port-submission", front: "What is TCP 587?", back: "The mail submission port, where clients hand messages to a server, typically with STARTTLS." },
    { id: "port-mssql", front: "Microsoft SQL Server port?", back: "TCP 1433." },
    { id: "port-mysql", front: "MySQL port?", back: "TCP 3306." },
    { id: "port-rdp", front: "RDP port?", back: "TCP 3389. Microsoft Remote Desktop Protocol." },
    { id: "port-postgres", front: "PostgreSQL port?", back: "TCP 5432." },
    { id: "port-radius", front: "RADIUS ports?", back: "UDP 1812 for authentication and UDP 1813 for accounting (older deployments used 1645 and 1646)." },
    { id: "port-vnc", front: "VNC default display :0 port?", back: "TCP 5900. Each additional display increments by one (5901, 5902, ...)." },
    { id: "port-http-alt", front: "What commonly runs on TCP 8080?", back: "An alternate HTTP port, often a proxy or an application server behind a reverse proxy." },
    { id: "port-ftps", front: "FTPS (implicit TLS) ports?", back: "TCP 990 for control and 989 for data. Distinct from SFTP, which is SSH on 22." },
    { id: "port-sip", front: "SIP ports?", back: "5060 for cleartext signalling and 5061 for SIP over TLS." },
    { id: "port-http3", front: "What transport does HTTP/3 use, and on what port?", back: "QUIC over UDP, typically UDP 443." },
    { id: "port-whois", front: "WHOIS port?", back: "TCP 43." },
    { id: "port-smtps", front: "What is TCP 465 used for today?", back: "SMTP submission over implicit TLS (per RFC 8314). Once deprecated, it was reinstated for this purpose." },
    { id: "port-icmp-note", front: "Which port does ICMP use?", back: "None. ICMP is its own IP protocol (protocol number 1); it does not use TCP or UDP ports." },
  ],
};

const security: Deck = {
  id: "security-concepts",
  name: "Security concepts",
  description: "Core vocabulary for defenders and competitors.",
  cards: [
    { id: "sec-cia", front: "What is the CIA triad?", back: "Confidentiality, Integrity, Availability. The three goals most security controls serve." },
    { id: "sec-confidentiality", front: "Define confidentiality.", back: "Ensuring information is accessible only to those authorised to see it. Encryption and access control support it." },
    { id: "sec-integrity", front: "Define integrity.", back: "Ensuring data is not altered without authorisation. Hashes and digital signatures detect tampering." },
    { id: "sec-availability", front: "Define availability.", back: "Ensuring systems and data are accessible when needed. Redundancy and DDoS mitigation support it." },
    { id: "sec-aaa", front: "What does AAA stand for?", back: "Authentication (who are you), Authorization (what may you do), Accounting (what did you do)." },
    { id: "sec-nonrepudiation", front: "What is non-repudiation?", back: "Assurance that an actor cannot deny having performed an action. Digital signatures provide it." },
    { id: "sec-auth-factors", front: "Name the main authentication factor categories.", back: "Something you know (password), something you have (token), something you are (biometric). Location and behaviour are sometimes added." },
    { id: "sec-mfa", front: "What is multi-factor authentication?", back: "Requiring two or more factors from different categories. A password plus a code from your phone qualifies; two passwords do not." },
    { id: "sec-symm-asym", front: "Symmetric versus asymmetric encryption?", back: "Symmetric uses one shared key for both directions. Asymmetric uses a public/private key pair." },
    { id: "sec-hash-vs-enc", front: "How does hashing differ from encryption?", back: "Encryption is reversible with a key. Hashing is a one-way function producing a fixed-length digest with no key to reverse it." },
    { id: "sec-salt", front: "What is a salt and why use it?", back: "A random value added to input before hashing. It makes identical passwords hash differently and defeats precomputed (rainbow table) attacks." },
    { id: "sec-phishing", front: "Phishing versus spear phishing versus whaling?", back: "Phishing is bulk deception; spear phishing targets a specific person; whaling targets high-value executives." },
    { id: "sec-virus-worm", front: "Virus versus worm?", back: "A virus attaches to a file and needs the user to run it. A worm self-propagates across a network with no user action." },
    { id: "sec-trojan", front: "What is a Trojan?", back: "Malware disguised as something legitimate. It does not self-replicate; it relies on the user installing it." },
    { id: "sec-ransomware", front: "What is ransomware?", back: "Malware that encrypts or locks data and demands payment for its release." },
    { id: "sec-dos-ddos", front: "DoS versus DDoS?", back: "Both exhaust a resource to deny service. A DDoS uses many distributed sources at once, which is harder to filter." },
    { id: "sec-mitm", front: "What is a man-in-the-middle attack?", back: "An attacker secretly relays or alters traffic between two parties who believe they talk directly. TLS defends against it." },
    { id: "sec-sqli", front: "What is SQL injection?", back: "Injecting SQL through unsanitised input so the database runs attacker-controlled queries. Parameterised queries prevent it." },
    { id: "sec-xss", front: "What is cross-site scripting (XSS)?", back: "Injecting script that runs in another user's browser in the context of a trusted site. Output encoding and CSP mitigate it." },
    { id: "sec-csrf", front: "What is CSRF?", back: "Cross-site request forgery: tricking a logged-in user's browser into sending an unwanted authenticated request. Anti-CSRF tokens prevent it." },
    { id: "sec-privesc", front: "What is privilege escalation?", back: "Gaining rights beyond those granted. Vertical goes user to admin; horizontal moves to another user's access." },
    { id: "sec-zeroday", front: "What is a zero-day?", back: "A vulnerability with no available patch, often unknown to the vendor, so defenders have had zero days to fix it." },
    { id: "sec-vtre", front: "Distinguish vulnerability, threat, and risk.", back: "A vulnerability is a weakness, a threat is something that could exploit it, and risk is the likelihood and impact of that happening." },
    { id: "sec-least-priv", front: "What is least privilege?", back: "Granting each user or process only the access it needs to do its job, and no more." },
    { id: "sec-defense-depth", front: "What is defense in depth?", back: "Layering multiple independent controls so that if one fails, others still protect the asset." },
    { id: "sec-ids-ips", front: "IDS versus IPS?", back: "An IDS detects and alerts on suspicious activity. An IPS sits inline and can actively block it." },
    { id: "sec-firewall", front: "What does a firewall do?", back: "Filters traffic against a ruleset, allowing or denying by address, port, protocol, or (for next-gen) application." },
    { id: "sec-vpn", front: "What does a VPN provide?", back: "An encrypted tunnel over an untrusted network, protecting confidentiality and integrity of traffic in transit." },
    { id: "sec-brute-dict", front: "Brute-force versus dictionary attack?", back: "Brute force tries every possible combination. A dictionary attack tries a curated list of likely passwords first." },
    { id: "sec-cve", front: "What is a CVE?", back: "A Common Vulnerabilities and Exposures identifier: a unique public ID for a specific known vulnerability." },
    { id: "sec-cvss", front: "What is CVSS?", back: "The Common Vulnerability Scoring System, which rates severity on a 0.0 to 10.0 scale." },
    { id: "sec-social-eng", front: "What is social engineering?", back: "Manipulating people into revealing information or taking actions, rather than attacking technology directly." },
  ],
};

const linux: Deck = {
  id: "linux-commands",
  name: "Linux commands",
  description: "The shell commands you reach for during log analysis and CTFs.",
  cards: [
    { id: "lin-pwd", front: "pwd", back: "Print the current working directory." },
    { id: "lin-ls-la", front: "ls -la", back: "List all files, including hidden dotfiles, in long format with permissions, owner, size, and time." },
    { id: "lin-cd", front: "cd -", back: "Change to the previous working directory. cd with no argument goes to your home directory." },
    { id: "lin-grep", front: "grep", back: "Search input for lines matching a pattern. grep -r recurses, -i ignores case, -v inverts the match." },
    { id: "lin-find", front: "find . -name '*.log'", back: "Search the directory tree from the current directory for files named with a .log extension." },
    { id: "lin-chmod-755", front: "What permissions does chmod 755 set?", back: "rwxr-xr-x: owner read/write/execute, group and others read/execute." },
    { id: "lin-chmod-644", front: "What permissions does chmod 644 set?", back: "rw-r--r--: owner read/write, group and others read only." },
    { id: "lin-chmod-x", front: "chmod +x script.sh", back: "Add the execute bit so the file can be run as a program." },
    { id: "lin-chown", front: "chown user:group file", back: "Change the file's owner to user and its group to group." },
    { id: "lin-ps-aux", front: "ps aux", back: "List all running processes for all users, with CPU and memory usage." },
    { id: "lin-top", front: "top", back: "Show a live, sorted view of running processes and system resource use. htop is a friendlier alternative." },
    { id: "lin-kill-9", front: "kill -9 PID", back: "Send SIGKILL to a process, forcing immediate termination. Prefer the default SIGTERM (kill PID) first." },
    { id: "lin-df-h", front: "df -h", back: "Report filesystem disk space usage in human-readable units." },
    { id: "lin-du-sh", front: "du -sh dir", back: "Show the total size of a directory in human-readable form (-s summarises, -h humanises)." },
    { id: "lin-tar-x", front: "tar -xzvf archive.tar.gz", back: "Extract (x) a gzip-compressed (z) tar archive verbosely (v) from the given file (f)." },
    { id: "lin-tar-c", front: "tar -czvf archive.tar.gz dir/", back: "Create (c) a gzip-compressed tar archive of dir/." },
    { id: "lin-lns", front: "ln -s target linkname", back: "Create a symbolic (soft) link named linkname pointing at target." },
    { id: "lin-passwd-file", front: "What does /etc/passwd contain?", back: "One line per user account: username, UID, GID, home directory, and login shell. Password hashes live in /etc/shadow." },
    { id: "lin-history", front: "history", back: "Show the shell command history for the current user." },
    { id: "lin-which", front: "which command", back: "Show the full path of the executable that would run for a command." },
    { id: "lin-ss", front: "ss -tulpn", back: "List listening TCP and UDP sockets with the owning process. The modern replacement for netstat." },
    { id: "lin-ip-a", front: "ip a", back: "Show network interfaces and their addresses. The modern replacement for ifconfig." },
    { id: "lin-man", front: "man command", back: "Open the manual page for a command. Press q to quit, / to search." },
    { id: "lin-sudo", front: "sudo", back: "Run a command with elevated (typically root) privileges, subject to the sudoers policy." },
    { id: "lin-redirect", front: "What is the difference between > and >> ?", back: "> redirects output to a file, overwriting it. >> appends to the file instead." },
    { id: "lin-pipe", front: "What does the pipe | do?", back: "Sends the standard output of one command to the standard input of the next." },
    { id: "lin-tail-f", front: "tail -f file.log", back: "Print the end of a file and keep following it as new lines are appended. Useful for live logs." },
    { id: "lin-head-n", front: "head -n 20 file", back: "Print the first 20 lines of a file. tail -n 20 prints the last 20." },
    { id: "lin-wc-l", front: "wc -l", back: "Count the number of lines in the input." },
    { id: "lin-sort-uniq", front: "sort | uniq -c", back: "Count occurrences of each unique line. uniq only collapses adjacent duplicates, so sort must come first." },
    { id: "lin-awk", front: "awk '{print $1}'", back: "Print the first whitespace-separated field of each line." },
    { id: "lin-sed", front: "sed 's/foo/bar/g'", back: "Substitute every occurrence of foo with bar on each line (g makes it global per line)." },
    { id: "lin-crontab", front: "crontab -e", back: "Edit the current user's cron table of scheduled jobs." },
  ],
};

const crypto: Deck = {
  id: "cryptography-basics",
  name: "Cryptography basics",
  description: "Ciphers, hashes, keys, and the vocabulary around them.",
  cards: [
    { id: "cry-symmetric", front: "What is symmetric encryption? Name an example.", back: "Encryption where the same key encrypts and decrypts. AES is the standard example." },
    { id: "cry-asymmetric", front: "What is asymmetric encryption? Name an example.", back: "Encryption using a public/private key pair; one key encrypts, the other decrypts. RSA and ECC are examples." },
    { id: "cry-aes", front: "AES: type, key sizes, block size?", back: "A symmetric block cipher. Key sizes are 128, 192, or 256 bits; the block size is always 128 bits." },
    { id: "cry-rsa", front: "What hard problem is RSA based on?", back: "The difficulty of factoring the product of two large prime numbers." },
    { id: "cry-ecc", front: "What hard problem is ECC based on?", back: "The elliptic-curve discrete logarithm problem. ECC gets equivalent strength to RSA with much smaller keys." },
    { id: "cry-dh", front: "What is Diffie-Hellman used for?", back: "Securely agreeing on a shared secret key over an insecure channel. It is key exchange, not bulk encryption." },
    { id: "cry-hash", front: "What is a cryptographic hash function?", back: "A one-way function mapping any input to a fixed-length digest, infeasible to reverse or to find collisions for." },
    { id: "cry-md5", front: "MD5: digest size and status?", back: "128-bit digest (32 hex characters). Considered broken: collisions are easy to produce, so it is unsafe for security." },
    { id: "cry-sha1", front: "SHA-1: digest size and status?", back: "160-bit digest (40 hex characters). Deprecated: practical collision attacks have been demonstrated." },
    { id: "cry-sha256", front: "SHA-256: digest size and family?", back: "256-bit digest (64 hex characters), part of the SHA-2 family. Currently considered secure." },
    { id: "cry-hmac", front: "What does HMAC provide?", back: "Message integrity and authenticity, using a secret key combined with a hash function (e.g. HMAC-SHA256)." },
    { id: "cry-signature", front: "How does a digital signature work?", back: "The signer hashes the message and encrypts the hash with their private key. Anyone can verify with the public key." },
    { id: "cry-symm-tradeoff", front: "Why use both symmetric and asymmetric crypto together?", back: "Asymmetric solves key distribution but is slow. TLS uses it to exchange a symmetric key, then encrypts data symmetrically." },
    { id: "cry-caesar", front: "What is the Caesar cipher?", back: "A substitution cipher that shifts each letter a fixed number of positions in the alphabet." },
    { id: "cry-rot13", front: "What is ROT13?", back: "A Caesar cipher with a shift of 13. Because 13 is half of 26, applying it twice returns the original text." },
    { id: "cry-vigenere", front: "What is the Vigenere cipher?", back: "A polyalphabetic substitution cipher that shifts each letter by a repeating keyword, resisting simple frequency analysis." },
    { id: "cry-xor", front: "What is an XOR cipher?", back: "Combining plaintext with a key using bitwise XOR. Secure only as a one-time pad: truly random key, used once, as long as the message." },
    { id: "cry-base64", front: "Is Base64 encryption?", back: "No. Base64 is an encoding that represents binary as ASCII text. It provides no confidentiality and is trivially reversible." },
    { id: "cry-encoding-vs", front: "Encoding versus encryption versus hashing?", back: "Encoding changes format (reversible, no key). Encryption protects data (reversible with a key). Hashing is one-way (no key, not reversible)." },
    { id: "cry-kerckhoffs", front: "State Kerckhoffs's principle.", back: "A cryptosystem should stay secure even if everything about it except the key is public. Security rests in the key, not secrecy of the algorithm." },
    { id: "cry-nonce", front: "What is a nonce?", back: "A number used once, included to ensure a given operation is not reused or replayed." },
    { id: "cry-iv", front: "What is an initialization vector (IV)?", back: "A non-secret, unique value that randomises a cipher's output so identical plaintexts encrypt differently." },
    { id: "cry-block-stream", front: "Block cipher versus stream cipher?", back: "A block cipher encrypts fixed-size blocks (AES: 128-bit). A stream cipher encrypts one bit or byte at a time (e.g. ChaCha20)." },
    { id: "cry-ecb", front: "Why is ECB mode weak?", back: "Electronic Codebook encrypts identical plaintext blocks to identical ciphertext blocks, leaking patterns. Use CBC, CTR, or GCM instead." },
    { id: "cry-gcm", front: "What does AES-GCM add over plain AES?", back: "Authenticated encryption: it provides both confidentiality and an integrity/authentication tag in one operation." },
    { id: "cry-pki", front: "What is PKI?", back: "Public Key Infrastructure: the system of certificate authorities, certificates, and keys that binds public keys to identities." },
    { id: "cry-cert", front: "What does a digital certificate bind together?", back: "A public key to an identity (such as a domain), vouched for by a Certificate Authority's signature. The X.509 format is standard." },
    { id: "cry-pfs", front: "What is perfect forward secrecy?", back: "A property where compromise of a long-term key does not expose past session keys, because each session uses fresh ephemeral keys." },
    { id: "cry-password-hash", front: "Name password-hashing functions and why they differ from SHA-256.", back: "bcrypt, scrypt, Argon2, and PBKDF2. They are deliberately slow and salted, which resists large-scale cracking." },
    { id: "cry-rainbow", front: "What is a rainbow table?", back: "A precomputed table mapping hashes back to inputs, used to reverse unsalted hashes quickly. Salting defeats it." },
    { id: "cry-collision", front: "What is a hash collision?", back: "Two different inputs producing the same hash output. A secure hash makes finding one computationally infeasible." },
    { id: "cry-entropy", front: "What is entropy in cryptography?", back: "A measure of unpredictability. Keys and passwords with more entropy are exponentially harder to guess or brute-force." },
  ],
};

export const DECKS: Deck[] = [networking, ports, security, linux, crypto];

export function getDeck(id: string): Deck | undefined {
  return DECKS.find((deck) => deck.id === id);
}
