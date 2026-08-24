
## Why a SOC Lab

Security operations work requires practice in a realistic environment. Reading about SIEM correlation rules or log analysis is useful, but actually running the tools and analyzing real (or simulated) attacks is how the skills develop. A home SOC lab gives you that environment.

## Core Components

**SIEM (Wazuh or ELK Stack):** The SIEM collects and correlates logs from across the environment. Wazuh is open source, well-documented, and integrates directly with the ELK stack for visualization.

**Log sources:** Your SIEM is only as good as what it ingests. Configure log forwarding from firewalls, switches, servers, and endpoints. Each source adds visibility.

**Threat simulation:** You need something to detect. Use tools like Atomic Red Team to simulate adversary techniques mapped to MITRE ATT&CK, generating realistic telemetry for your detection rules to catch.

**Packet capture:** A dedicated packet capture setup (like SecurityOnion or a simple tcpdump-based collector) gives you full packet data for investigation.

## Building the Environment

Start small. Set up Wazuh on a dedicated VM. Forward logs from a couple of Linux servers using the Wazuh agent. Configure your FortiGate or pfSense to send syslog to Wazuh.

Once you have basic log collection working, run some Atomic Red Team tests and see what alerts generate. Review the logs manually to understand what the attack looks like in telemetry, then write detection rules to catch it automatically next time.

## Detection Engineering

Detection engineering is the process of writing, testing, and maintaining detection rules. Start with known-bad: impossible login times, logins from multiple geographic locations, command injection patterns in web server logs. As your understanding grows, develop more sophisticated behavioral rules.

Document every detection you build: what it detects, how it works, and what the expected false positive rate is. This discipline makes you a better analyst and better engineer.
