
## Why a SOC lab

Every entry level security operations job description asks for experience with a SIEM, and there is no legal way to get that experience on somebody else's production network. So you build a small one where you own every packet and can break anything, and you generate the attacks yourself.

Security operations work requires practice in a realistic environment. Reading about SIEM correlation rules or log analysis is useful, but actually running the tools and analyzing real (or simulated) attacks is how the skills develop. A home SOC lab gives you that environment.

## Core components

**SIEM (Wazuh or ELK Stack):** The SIEM collects and correlates logs from across the environment. Wazuh is open source, well-documented, and integrates directly with the ELK stack for visualization.

**Log sources:** Your SIEM is only as good as what it ingests. Configure log forwarding from firewalls, switches, servers, and endpoints. Each source adds visibility.

**Threat simulation:** You need something to detect. Use tools like Atomic Red Team to simulate adversary techniques mapped to MITRE ATT&CK, generating realistic telemetry for your detection rules to catch.

**Packet capture:** A dedicated packet capture setup (like SecurityOnion or a simple tcpdump-based collector) gives you full packet data for investigation.

Four roles, and in a small lab they can be four virtual machines. The one to size generously is the search and storage layer, because it is an OpenSearch or Elasticsearch node underneath and those are memory hungry by design. The rule of thumb from that world is to give the JVM about half the host's memory as heap and never to cross roughly 32 GB of heap, above which the JVM loses compressed object pointers and you get less usable memory per gigabyte, not more. In a lab you are nowhere near that ceiling; the practical consequence is simply that an indexer with 2 GB of RAM will spend its life in garbage collection and you will blame the software.

Storage you can estimate rather than guess. Count your events per second, multiply by the average size of an indexed event, and multiply by your retention in seconds. Measure the first two numbers on your own lab instead of taking a figure from a vendor page, because the answer depends entirely on which sources you turned on.

## Network design comes first

Before installing anything, decide where the lab lives. A SOC lab exists to generate malicious-looking traffic, and some of the tooling generates genuinely malicious traffic. That needs to be on its own segment with no route to the network your family uses, and any target VM you deliberately compromise needs to be on an isolated segment even within the lab.

The minimum sane layout is three zones: a management zone with the SIEM and your workstation, a victim zone with the machines you attack, and a detonation zone with no outbound path at all. Enforce it on the firewall, not in your head, and verify with a ping from the detonation VM that fails.

## Building the environment

Start small. Set up Wazuh on a dedicated VM. Forward logs from a couple of Linux servers using the Wazuh agent. Configure your FortiGate or pfSense to send syslog to Wazuh.

Once you have basic log collection working, run some Atomic Red Team tests and see what alerts generate. Review the logs manually to understand what the attack looks like in telemetry, then write detection rules to catch it automatically next time.

The ports you will be opening between zones, for a stock Wazuh deployment:

- **1514/TCP:** agents to manager, the channel that carries events.
- **1515/TCP:** agent enrollment, used once per agent to register it.
- **55000/TCP:** the manager's REST API.
- **9200/TCP:** the indexer.
- **443/TCP:** the dashboard.
- **514/UDP:** the syslog listener, which is not enabled by default. You configure it explicitly on the manager for network devices that cannot run an agent.

Write those into the firewall as specific rules from specific sources. A lab where the SIEM VM has a blanket allow is a lab that teaches you nothing about segmentation.

## A worked example, end to end

Install the agent on a Linux host, register it, and confirm the manager sees it. On the agent:

```bash
/var/ossec/bin/agent-auth -m 10.0.50.10
systemctl restart wazuh-agent
```

On the manager, list what has connected:

```bash
/var/ossec/bin/agent_control -l
```

Correct output names each agent with an ID and a state:

```
Wazuh agent_control. List of available agents:
   ID: 000, Name: wazuh-manager (server), IP: 127.0.0.1, Active/Local
   ID: 001, Name: lab-web01, IP: 10.0.60.21, Active
```

`Active` is what you want. `Never connected` means the enrollment worked but events are not flowing, which is almost always 1514 being blocked between the zones. `Disconnected` means it connected once and stopped.

Now generate something to detect. Failed SSH authentication is the easiest honest test, and it maps to a real technique, brute force, which ATT&CK tracks as T1110. From another lab host, fail to log in half a dozen times:

```bash
for i in $(seq 1 8); do ssh -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no nosuchuser@10.0.60.21; done
```

Watch the manager's alert stream while it runs:

```bash
tail -f /var/ossec/logs/alerts/alerts.json | jq -r '[.rule.id, .rule.level, .rule.description] | @tsv'
```

Correct output is a run of individual failure alerts followed by the composite rule that fires when enough of them arrive in a window:

```
5710	5	Attempt to login using a non-existent user
5710	5	Attempt to login using a non-existent user
5712	10	sshd: brute force trying to get access to the system
```

Two things to take from that. The individual events and the correlated event are different rules, and the correlated one is the alert a human should see. And Wazuh writes alerts from level 3 upward by default, so anything you build below that threshold exists in the logs but will never reach you.

If nothing appears at all, work backwards through the chain before touching any rule: is the agent Active, is sshd actually logging to the file the agent is watching, and is the manager receiving anything from that agent at all.

## Detection engineering

Detection engineering is the process of writing, testing, and maintaining detection rules. Start with known-bad: impossible login times, logins from multiple geographic locations, command injection patterns in web server logs. As your understanding grows, develop more sophisticated behavioral rules.

Document every detection you build: what it detects, how it works, and what the expected false positive rate is. This discipline makes you a better analyst and better engineer.

A structure that keeps this honest, one entry per rule:

- The technique it covers, by ATT&CK ID, so you can see your coverage and your gaps.
- The exact log source and field it reads. If you cannot name the field, the rule is a guess.
- The threshold and window, with the reason for those numbers.
- The test that proves it fires, written as a command you can rerun.
- Known benign triggers and how they are excluded.

That last line is the difference between tuning and disabling. When a rule is noisy the temptation is to switch it off. The right move is to narrow it: exclude the vulnerability scanner by source address, exclude the backup account by name, and write down that you did.

## Packet capture without drowning

Full packet capture in a lab is affordable in a way it is not at work, and it is worth having for the moments when the logs disagree with each other. A single collector with tcpdump on a mirror port is enough to start:

```bash
sudo tcpdump -i eth1 -s 0 -w /captures/lab-%Y%m%d-%H%M.pcap -G 3600 -W 24 'not port 22'
```

That rotates a new file every 3600 seconds, keeps 24 of them, and excludes your own SSH session so you are not capturing your investigation. Confirm it is working with `tcpdump -r` against the newest file and check that the packet count is not zero, which is the usual sign that the mirror port is configured on the wrong interface.

## What breaks

**The indexer fills the disk and everything stops.** Ingest grows quietly, retention is unlimited by default in a hand-rolled setup, and one day the dashboard is blank. Set an index lifecycle policy on day one and alert on free disk on the SIEM VM itself.

**Agents that never connect.** Enrollment on 1515 succeeds, events on 1514 do not, because those are two separate ports and you only opened one. `agent_control -l` showing `Never connected` is the tell.

**Clocks that disagree.** Correlation across sources is the whole product, and it is worthless if the firewall is twenty minutes off. Point every device in the lab at the same NTP server and check it after every VM restore, because a restored snapshot comes back with a stale clock.

**Writing rules against a source you never confirmed.** You spend an evening on a beautiful detection for Windows process creation events and the endpoint was never sending them, so it will never fire and you will never know. Prove the raw event arrives first, then write the rule.

**Detonating something with a route out.** A malware sample in a lab that can reach the internet or the home LAN is not a lab, it is an incident. Test the isolation before you need it.

**Turning off a noisy rule instead of scoping it.** Six months later you have a SIEM with no false positives and no detections either. Exclude the specific benign cause and record why.

## Where this pays off

The habits transfer directly. Narrowing a time window, aggregating before reading, proving a data source exists before trusting a conclusion, and documenting a disposition so the next person does not redo the work are the same skills whether you are answering a National Cyber League log analysis question or handling a real alert. The lab is just the place where getting it wrong costs you an evening instead of an incident.

## References

- https://attack.mitre.org/
- https://attack.mitre.org/techniques/T1110/
- https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final
- https://csrc.nist.gov/publications/detail/sp/800-92/final
- https://www.tcpdump.org/manpages/tcpdump.1.html
- https://www.rfc-editor.org/rfc/rfc5424
