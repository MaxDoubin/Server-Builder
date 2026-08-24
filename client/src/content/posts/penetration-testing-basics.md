
## Why Defenders Should Understand Offense

Defense is most effective when you understand what you are defending against. A network engineer who has never run an Nmap scan does not understand what information their open ports reveal. A sysadmin who has never used Mimikatz does not understand why credential hygiene matters.

Understanding attacker methodology helps you prioritize controls, identify gaps, and detect attacks by recognizing their telltale patterns.

## The Penetration Testing Phases

**Reconnaissance:** Gathering information without active exploitation. OSINT, DNS enumeration, certificate transparency logs, LinkedIn scraping. The goal is understanding the target's attack surface before touching it.

**Scanning:** Active discovery of systems, ports, and services. Nmap is the standard tool.

```bash
# Service version detection, OS detection, default scripts
nmap -sV -sC -O 192.168.1.0/24

# Scan specific ports quickly
nmap -p 22,80,443,3389,5985 192.168.1.0/24
```

**Exploitation:** Attempting to exploit discovered vulnerabilities. Metasploit is the standard framework for public exploits. Custom exploits require significantly more skill.

**Post-exploitation:** What can you do once you have a foothold? Enumerate local system, dump credentials, escalate privileges, move laterally to other systems.

**Reporting:** A penetration test without a clear report is useless. The report must describe what was found, how it was found, what the impact is, and how to fix it.

## What This Means for Defense

Every pen test phase has a defensive countermeasure. Limit public information exposure. Minimize exposed ports and services. Patch known vulnerabilities. Monitor for scanning patterns and post-exploitation techniques.

The MITRE ATT&CK framework maps attacker techniques to defensive detections. If you know what techniques pen testers use, you can build detection rules for exactly those techniques.
