
## What NCL Actually Tests

The National Cyber League is not about memorizing textbook definitions. It tests practical skills across categories like network traffic analysis, log investigation, scanning and reconnaissance, password cracking, web application security, and cryptography. Every challenge requires you to actually do the work, not just know the theory.

The season has a shape worth knowing before you sign up. There is a Gymnasium for untimed practice, a Preseason Game that calibrates you into a bracket, then the Individual Game and the Team Game. Everything runs on the Cyber Skyline platform, and afterward you get a Scouting Report that breaks your performance down by category with both a completion percentage and an accuracy percentage. Those are two different numbers on purpose. Accuracy is what exposes guessing.

The published category list covers Open Source Intelligence, Cryptography, Password Cracking, Log Analysis, Network Traffic Analysis, Forensics, Scanning and Reconnaissance, Web Application Exploitation, and Enumeration and Exploitation. Nobody is strong in all nine. Knowing which two you are weakest in is more useful than a general study plan.

## How I Approach Challenges

My process for each challenge follows a consistent pattern:

1. **Read the problem carefully.** Most mistakes come from rushing past the details.
2. **Identify what tools and techniques apply.** Is this a packet capture? A log file? A web vulnerability?
3. **Work methodically.** Try the most likely explanation first, verify it, and move on.
4. **Document what you find.** Even during a timed competition, noting your process helps you avoid repeating dead ends.

Step one carries more weight than it looks. The answer format is usually specified in the last sentence of the prompt, and it is specified because it matters. Uppercase or lowercase hex. With or without the `flag{}` wrapper. The count as a bare integer or spelled out. A correct answer in the wrong format scores zero, and since accuracy is reported separately from completion, a burst of format guesses shows up permanently in your report.

## Tools I Use Most

- **Wireshark** for packet analysis challenges. Understanding TCP flows, DNS queries, and HTTP headers at the packet level is essential.
- **Nmap** for scanning and reconnaissance. Knowing how to interpret scan results tells you a lot about a target's configuration.
- **Python** for quick scripting when a challenge requires processing data or automating repetitive tasks.
- **Linux command line** for log analysis, file manipulation, and general problem solving.

## Wireshark Has Two Filter Languages

This is the beginner trap that costs the most time, and it is worth stating plainly: Wireshark has two completely separate filter syntaxes and they are not interchangeable.

Capture filters use BPF syntax and are set before you start capturing: `tcp port 80`, `host 10.0.0.1`, `net 192.168.1.0/24`. Display filters use Wireshark's own syntax and are typed into the bar above the packet list: `tcp.port == 80`, `ip.addr == 10.0.0.1`, `http.request.method == "POST"`. Type a capture filter into the display bar and the bar turns red, which at least tells you something is wrong.

The worse case is when the bar turns yellow. That is Wireshark warning that your filter is valid but probably not what you meant, and the classic example is `ip.addr != 10.0.0.5`. A packet has two address fields, so that expression is true whenever *either* address differs, which is nearly every packet including the ones you were trying to exclude. The correct form is `!(ip.addr == 10.0.0.5)`. Yellow bar means read your filter again.

Three menu items solve most capture challenges faster than any filter. Statistics then Protocol Hierarchy shows you what is actually in the file in one screen. Statistics then Conversations sorted by bytes finds the interesting flow immediately. And File then Export Objects then HTTP pulls every transferred file out of the capture as an actual file, which beats hand-carving bytes out of the hex pane. Right-clicking a packet and choosing Follow then TCP Stream sets `tcp.stream eq N` for you and shows the reassembled conversation.

For anything repetitive, drop to the command line version:

```bash
tshark -r capture.pcapng -Y 'http.request' \
  -T fields -e ip.src -e http.host -e http.request.uri
```

## Nmap Defaults Are Not What You Assume

Four defaults account for most misread scans.

Nmap does not scan all 65,535 ports. It scans the top 1,000 most common TCP ports from its `nmap-services` frequency data. If the challenge hid a service on a high port, you need `-p-` and the patience that comes with it.

Nmap does not scan UDP unless you ask with `-sU`, and UDP scanning is genuinely slow for a structural reason: an open-or-filtered determination depends on ICMP port unreachable replies, and Linux rate limits those to roughly one per second by default. A full 65,535 port UDP sweep against a Linux host can take more than 18 hours. Scan the UDP ports you care about, not all of them.

Nmap picks its scan type based on privilege. As root you get `-sS`, a raw-socket SYN scan. Unprivileged, it silently falls back to `-sT`, a full connect scan that is slower and much noisier in the target's logs.

Finally, if host discovery fails, the host is reported down and never scanned at all. A firewall that drops ICMP produces "Note: Host seems down" on a machine that is running fine. `-Pn` skips discovery and scans anyway. When a scan comes back suspiciously empty, `-Pn` is the first thing to try.

## Read the Hash Before You Crack It

Password cracking challenges are half identification. The prefix tells you almost everything: `$1$` is md5crypt, `$5$` is sha256crypt, `$6$` is sha512crypt, `$2a$` or `$2b$` or `$2y$` is bcrypt, and a bare 32 hex characters is probably MD5 while 32 hex characters in a Windows context is probably NTLM.

That identification picks the hashcat mode, and the mode numbers are in hashcat's example hashes table: `-m 0` for MD5, `-m 100` for SHA1, `-m 1000` for NTLM, `-m 1800` for sha512crypt, `-m 3200` for bcrypt, `-m 22000` for WPA. Getting the mode wrong means hashcat runs happily and finds nothing.

It also tells you whether the challenge is winnable in the time available. MD5 and NTLM are unsalted and fast, and a modern GPU does them in the billions per second. bcrypt is deliberately slow, with a work factor baked into the hash, and the same GPU manages tens of thousands per second. That is six orders of magnitude. A bcrypt challenge is never a brute force challenge. It is a hint that the password is in `rockyou.txt`, which holds roughly 14 million real passwords, or that it is reachable with a small rule set like `best64.rule` applied to a targeted wordlist.

For encoding puzzles, learn to recognize formats on sight. Base64 output is a multiple of four characters and may end in `=` padding. A base64 string starting `eyJ` is almost always a JSON Web Token, because the bytes `{"a` encode to exactly `eyJh`. CyberChef handles the long tail of encodings faster than writing a script, and its Magic operation will often identify the chain for you.

## The Mistakes That Cost Me Points

Starting with the hardest challenge because it is worth the most, and finishing the game with three easy ones untouched. Sort by points per minute, not by points.

Not saving intermediate output. You extract a file from a capture, close the tab, and forty minutes later need it again.

Trusting a timestamp without checking its timezone. Log analysis questions about ordering and correlation are frequently timezone questions wearing a disguise.

Skipping the obvious command. A surprising number of forensics challenges are answered by `file`, `strings`, and `exiftool` before anything clever is required.

## What Competitions Teach You

The ranking is nice, but the real value is in the habits you build. Competitions force you to stay calm under pressure, verify your work, and think logically when nothing is working the way you expect.

Those habits translate directly to real-world troubleshooting. When a network goes down at 2 AM, the person who stays methodical and follows evidence is the one who finds the problem.

## What Competitions Do Not Teach

Every CTF challenge is solvable by construction. Someone built it, tested it, and confirmed there is an answer. That single fact makes competition problems fundamentally unlike production problems, where the answer is sometimes "the vendor shipped a bug" and sometimes there is no clean answer at all. Competitions train you to keep pushing because the flag exists. Operations also requires knowing when to stop pushing and escalate.

They also teach nothing about the parts of the job that happen over months: change management, capacity planning, keeping a system healthy when nobody is looking, and writing down what you did so the next person can follow it.

The habit that is actively dangerous to carry out of a competition is scope. In a CTF you attack anything you can reach and destructive testing costs nothing. On a real network, scanning a host you were not authorized to scan is at best a policy violation and can be a crime depending on where you live. The rule is simple and it does not bend: written authorization, defined scope, in that order, every time. The technical skills transfer directly. The permission model does not transfer at all.

## References

- https://nationalcyberleague.org/
- https://cyberskyline.com/
- https://nmap.org/book/man.html
- https://www.wireshark.org/docs/wsug_html_chunked/
- https://hashcat.net/wiki/doku.php?id=example_hashes
- https://gchq.github.io/CyberChef/
