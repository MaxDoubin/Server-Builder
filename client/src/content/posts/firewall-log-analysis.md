
## The volume problem

Your firewall has been logging for months and you have never read any of it. You suspect that if something bad happened the evidence is in there, but opening the file gives you a wall of key-value pairs scrolling past faster than you can read. That is the actual problem: not a lack of data, an inability to reduce it.

A firewall in a medium-sized network generates millions of log entries per day. Looking at raw logs is not practical. Effective log analysis means knowing what to look for, reducing noise, and using tools to surface anomalies automatically.

## What is actually in a log line

Before you can filter, you need to know what fields you have. Almost every firewall logs some version of the same core record:

- The five tuple: source IP, source port, destination IP, destination port, protocol.
- The action taken: accept, deny, drop, reset, timeout.
- Which rule or policy matched, usually by ID or name.
- Ingress and egress interface, which tells you the direction through the box.
- Session bytes and packets in each direction, and how long the session lasted.
- The translated addresses, if NAT applied.

Different vendors name these differently. FortiGate writes key-value pairs like `srcip=10.0.10.5 dstport=443 action=deny policyid=17`. iptables writes a kernel message with `SRC=` and `DPT=`. pfSense writes comma separated fields. The shape of the analysis is the same either way, and the first hour with any new log source should be spent identifying which field holds which value, so you are not grepping blind.

## Start with denies

Allowed traffic is mostly expected. Denied traffic is interesting. Start your analysis there. What is being blocked, and why? Is something trying to reach a destination it should not? Is internal traffic trying to reach an external IP that looks suspicious?

```bash
# Extract denied connections from FortiGate syslog
grep "action=deny" /var/log/fortigate/traffic.log |   awk '{print $6, $7, $8}' | sort | uniq -c | sort -rn | head -50
```

There is a caveat that took me a while to internalise. Denies tell you what did not happen. A compromised host does not generate denies, it generates perfectly ordinary allowed sessions to a destination you never thought to question. Denies are where you start because they are cheap and high signal. Egress allow logs are where you find the thing that actually got in.

## Reducing a day of logs to something readable

Here is a worked example against an inbound deny log, ranking sources by how many distinct internal addresses they touched. That distinct count is the useful number, not the raw hit count, because one noisy source hammering a single port on a single host is boring and one source touching forty hosts is a scan.

```bash
grep 'action=deny' /var/log/fortigate/traffic.log \
  | grep -o 'srcip=[0-9.]* dstip=[0-9.]*' \
  | sort -u \
  | awk '{print $1}' \
  | uniq -c \
  | sort -rn \
  | head -10
```

Reading that pipeline in order: pull the denied lines, extract just the source and destination address fields, deduplicate so a thousand attempts against one host count once, then count how many distinct destinations remain per source. Correct output looks like this:

```
     47 srcip=45.155.205.233
     44 srcip=193.32.162.7
      2 srcip=10.0.20.31
      1 srcip=10.0.10.5
```

Two external sources touching forty plus internal addresses each is a horizontal scan, which is what MITRE ATT&CK tracks as network service discovery. From the internet it is also completely routine background noise. The line that should stop you is the third one: an internal host generating denies at all. Internal hosts are supposed to know where they are going. When one starts probing addresses it has no business touching, that is either a misconfiguration or a foothold, and both are worth ten minutes.

To verify the pipeline works before you trust it, generate the event yourself. From a host you control, scan a segment the firewall protects:

```bash
sudo nmap -sS -p 22,445,3389 10.0.30.0/24
```

Then rerun the pipeline. Your scanning host should appear at the top with a distinct destination count close to the size of the subnet. If it does not appear at all, the problem is not your analysis, it is that the rule which dropped the traffic has logging disabled.

## Identify traffic patterns

Look for traffic patterns that do not match business activity:

- **After-hours traffic:** A server initiating many connections to external IPs at 3 AM is suspicious
- **Port scanning:** A source hitting many different destination ports in a short time
- **Repeated authentication failures:** Brute force attempts against exposed services
- **DNS tunneling indicators:** Unusually long DNS queries or high query volumes to a single domain

Two more are worth adding once the basics are in place. **Beaconing** is a host connecting to the same external destination at a very regular interval, often with small and consistent session sizes. Humans and normal software produce irregular timing; a scheduled callback does not. **Asymmetric egress** is a session where the bytes sent out are far larger than the bytes received, on a host whose job does not involve uploading anything. Both of those live entirely in the allowed traffic, which is why you eventually have to log it.

## Baseline normal

You cannot identify anomalies without knowing what normal looks like. Spend time understanding your baseline: which servers connect to the internet, on which ports, at what volumes. When something deviates from baseline, investigate.

The cheapest way to build a baseline is to write down the answers to a few questions per server and then check them against the logs: which destinations should this host talk to, on which ports, and at roughly what volume. A file server that suddenly opens outbound sessions on port 443 to an address in a country you do not do business with is only obviously wrong if you previously wrote down that it should never open outbound sessions at all.

## Getting the logs off the box intact

Analysis is worthless if the transport loses records. Classic syslog runs over UDP port 514, described in RFC 3164 and standardised in RFC 5424. UDP has no retransmission and no flow control, so under a burst the collector silently drops messages, and the burst is the moment you care about. Use TCP where the device supports it, or TLS on port 6514 as defined in RFC 5425 if the logs cross an untrusted segment.

Clock sync matters just as much. Correlating a firewall log against a server auth log is impossible if the two disagree about what time it is, and firewalls in particular love to log in local time with no offset while everything else logs UTC. Point every device at the same NTP source and configure timestamps with an explicit offset. The RFC 5424 format carries an RFC 3339 timestamp, which solves this; the older BSD format in RFC 3164 has no year and no timezone, which is a good reason to move off it.

## Automation with SIEM

Manual log analysis does not scale. Feed firewall logs into a SIEM (Wazuh, Splunk, or Elastic). Write correlation rules that alert when patterns suggesting attacks occur:

- Same source hitting 20+ different internal IPs in five minutes
- Any traffic from an internal server to a known-malicious IP
- Multiple failed authentications followed by a successful one

Write each rule with an explicit threshold, an explicit time window, and an explicit exclusion list, and record why each number was chosen. A rule with no documented rationale gets loosened every time it fires until it never fires at all.

## What breaks

**Logging only denies.** The deny log is cheap and gives you the illusion of coverage. When a host is actually compromised, the investigation needs the allowed egress sessions, and they were never recorded. Log accepts on the internet-facing policies at minimum, and accept the storage cost.

**Syslog over UDP under load.** Records vanish exactly during the event you are investigating, and nothing anywhere reports an error. Switch to TCP or TLS, and monitor the collector for gaps.

**No logging on the implicit deny.** Most firewalls have a final catch-all rule, and on many platforms it does not log by default. If that rule is silent, "there were no denies" is not evidence of anything. Enable logging on it and confirm by generating a deny you can predict.

**Reading the post-NAT address as the host.** Outbound logs frequently record the translated source, so every internal host looks like the firewall's external address. You will spend an hour attributing an alert to the wrong machine. Make sure the log includes both the original and translated addresses, and check which field your parser is using.

**Alerting on raw counts.** A threshold like "500 denies from one source" pages you every night for the backup job hitting a decommissioned target. Count distinct destinations or distinct ports instead, and always exclude the sources you have already explained.

**Timestamps in local time with no offset.** Two devices, two timezones, one incident timeline that makes no sense. Normalise to UTC at ingest and verify by comparing a known event across two sources.

## The follow-through

An alert is only valuable if someone acts on it. Build a workflow: alerts generate tickets, tickets get investigated, findings get documented. Close the loop on every alert, even if the finding is "false positive, tuned rule."

The documentation is not bureaucracy. Six months from now, when the same alert fires, the note explaining that it was the vulnerability scanner is what saves you the second investigation. A detection rule with no written rationale and no history of dispositions is a rule nobody trusts, and rules nobody trusts get ignored, which is the same as not having them.

## References

- https://www.rfc-editor.org/rfc/rfc5424
- https://www.rfc-editor.org/rfc/rfc3164
- https://www.rfc-editor.org/rfc/rfc5425
- https://man7.org/linux/man-pages/man1/grep.1.html
- https://attack.mitre.org/techniques/T1046/
- https://en.wikipedia.org/wiki/Security_information_and_event_management
