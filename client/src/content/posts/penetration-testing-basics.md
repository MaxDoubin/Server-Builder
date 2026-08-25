
## Why Defenders Should Understand Offense

Defense is most effective when you understand what you are defending against. A network engineer who has never run an Nmap scan does not understand what information their open ports reveal. A sysadmin who has never used Mimikatz does not understand why credential hygiene matters.

Understanding attacker methodology helps you prioritize controls, identify gaps, and detect attacks by recognizing their telltale patterns.

## Authorization Comes First

Everything below is legal in exactly one circumstance: you have written permission from the owner of the system. Not verbal, not implied, not "it is my school's network and I am on the IT club." Unauthorized scanning and access are prosecutable under the Computer Fraud and Abuse Act in the United States and equivalent laws elsewhere, and intent to be helpful is not a defense.

For practice, that means your own lab, a deliberately vulnerable target you installed yourself, or a service that publishes an explicit invitation. `scanme.nmap.org` exists for exactly this and says so on the page. Public bug bounty programs publish scope. Everything else is off limits.

A real engagement is governed by a rules of engagement document, and NIST SP 800-115 describes what belongs in one. At minimum: the exact CIDR ranges and hostnames in scope, the hosts explicitly excluded, the testing window, whether social engineering and denial of service are permitted, a named technical contact who can be woken up, and the stop condition that ends the test early. Write down how you will store and destroy any credentials or data you recover, because you will recover some.

## The Penetration Testing Phases

**Reconnaissance:** Gathering information without active exploitation. OSINT, DNS enumeration, certificate transparency logs, LinkedIn scraping. The goal is understanding the target's attack surface before touching it.

Certificate transparency is the underrated one. Every publicly trusted TLS certificate is logged, so querying CT logs for an organization's domain returns internal hostnames that were never meant to be discoverable: `vpn-test`, `jira-staging`, `old-mail`. Nobody has to misconfigure anything for this to work. It is a consequence of how the Web PKI is designed, which is why the defensive answer is wildcard certificates for internal names rather than trying to hide.

**Scanning:** Active discovery of systems, ports, and services. Nmap is the standard tool.

```bash
# Service version detection, OS detection, default scripts
nmap -sV -sC -O 192.168.1.0/24

# Scan specific ports quickly
nmap -p 22,80,443,3389,5985 192.168.1.0/24
```

Know what those flags actually do before you run them anywhere that matters.

Nmap does not scan all 65535 ports by default. It scans the top 1000 by frequency, drawn from its own `nmap-services` data. If you need everything, `-p-` is the flag, and it will take considerably longer. When run with root privileges Nmap defaults to a SYN scan (`-sS`), which sends a SYN and tears the connection down on the SYN/ACK; without privileges it falls back to a full TCP connect (`-sT`), which is slower and lands in the target's application logs.

Host discovery runs first and can silently discard hosts. The default probe set on a privileged local scan is an ICMP echo request, a TCP SYN to 443, a TCP ACK to 80, and an ICMP timestamp request. A host that filters all four is treated as down and never scanned, which is why the results on a firewalled network look implausibly clean. `-Pn` skips discovery and scans everything you named, at the cost of a much longer run.

UDP is the part beginners abandon. `-sU` infers a closed port from an ICMP port unreachable, and Linux rate limits those to roughly one per second by default. A full 65535 port UDP scan against one Linux host can therefore take upwards of 18 hours. Scan the UDP ports you care about (53, 123, 161, 500, 1900) and accept that a comprehensive UDP picture is expensive.

Save everything. `-oA basename` writes normal, greppable, and XML output at once, and the XML is what you will want three weeks later when you are writing up a finding and cannot remember which host had the old OpenSSH.

**Exploitation:** Attempting to exploit discovered vulnerabilities. Metasploit is the standard framework for public exploits. Custom exploits require significantly more skill.

The honest picture is less cinematic than the framework suggests. In real intrusions the dominant initial access techniques are valid accounts and exploitation of internet-facing applications, catalogued in MITRE ATT&CK as T1078 and T1190. Memory corruption exploits against hardened modern targets are rare and expensive. A reused password from a breach dump, an exposed management interface, and a service six months behind on patches will get you further than any exploit you write.

**Post-exploitation:** What can you do once you have a foothold? Enumerate local system, dump credentials, escalate privileges, move laterally to other systems.

This phase is where a test proves impact, and impact is what turns a finding into a fixed finding. "Port 445 is open" changes nothing. "Port 445 is open, the local administrator password is identical on 340 workstations, and from any one of them I reach the domain controller" gets budget approved.

**Reporting:** A penetration test without a clear report is useless. The report must describe what was found, how it was found, what the impact is, and how to fix it.

## Scoring and Reporting Honestly

Most reports attach a CVSS score. The v3.1 base score runs 0.0 to 10.0 and the standard qualitative bands are Low at 0.1 to 3.9, Medium at 4.0 to 6.9, High at 7.0 to 8.9, and Critical at 9.0 to 10.0. Those bands come from the FIRST specification, not from any individual vendor.

What the base score deliberately does not include is your environment. It says nothing about whether the host is internet-facing, whether a compensating control blocks the attack path, or what the machine is worth. A 9.8 on an isolated lab VM matters less than a 5.3 on the box holding the student records, and a report that sorts purely by base score will send the remediation team at the wrong thing first. Use the score as one input and rank by exploitability in this network plus what is behind the host.

Two habits make a report usable. Include the exact command and its output for every finding, so the reader can reproduce it and can verify the fix afterwards. And write the remediation as a specific action on a specific system, not as "apply security best practices."

## What a Pen Test Cannot Tell You

It cannot tell you that you are secure. A test finds what one person found in the time available against the systems in scope on the day it ran. Absence of a finding is not evidence of absence.

It is not vulnerability management. A scanner enumerating known CVEs across every host, continuously, catches far more of the routine exposure than an annual test does, and it is much cheaper. NIST SP 800-115 treats scanning and penetration testing as different activities for a reason. If you can only afford one, patch management and continuous scanning beat one week of manual testing.

It is not a red team exercise. A pen test measures whether vulnerabilities exist. A red team exercise measures whether your detection and response actually work, which means the defenders are not told it is happening. Those answer different questions, and buying one when you needed the other is a common and expensive mistake.

Finally, the practical warnings. Port scans crash things. Printers, IP cameras, building management controllers, and older industrial equipment have TCP stacks that do not survive an aggressive scan, and `-T5` across a WAN will hand you false results from timeouts even when it does not break anything. Start slow, exclude fragile hosts by IP in the rules of engagement, and treat `-T4` as the fastest setting that is still honest on most networks.

## What This Means for Defense

Every pen test phase has a defensive countermeasure. Limit public information exposure. Minimize exposed ports and services. Patch known vulnerabilities. Monitor for scanning patterns and post-exploitation techniques.

Each phase also has a signature. Reconnaissance shows up as certificate transparency lookups and DNS zone-walk attempts. Scanning shows up as SYN packets to hundreds of ports from one source inside a few seconds, connections that open and immediately reset, and a spike in ICMP port unreachable messages leaving the host. Post-exploitation shows up as processes reading LSASS memory, new services created remotely, and one workstation authenticating to dozens of others in a short window. Those last two are far more valuable to alert on than the scan, because scanning is constant background noise on the internet and lateral movement inside your own network is not.

The MITRE ATT&CK framework maps attacker techniques to defensive detections. If you know what techniques pen testers use, you can build detection rules for exactly those techniques.

## References

- https://csrc.nist.gov/pubs/sp/800/115/final
- https://nmap.org/book/man.html
- https://nmap.org/book/host-discovery.html
- https://attack.mitre.org/
- https://www.first.org/cvss/v3-1/specification-document
- https://owasp.org/www-project-web-security-testing-guide/
