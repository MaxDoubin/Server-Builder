## Five acronyms, three kinds of data

Security operations job postings tend to list the same set of tools: a security information and event management (SIEM) platform, security orchestration, automation, and response (SOAR), endpoint detection and response (EDR), network detection and response (NDR), and extended detection and response (XDR). They are often presented as five competing products. They are better understood as answers to three separate questions:

- What happened, according to the logs that systems already write? That is the SIEM's territory.
- What happened on this particular computer, process by process? That is EDR.
- What crossed the wire, and between whom? That is NDR.

SOAR automates what analysts do with the answers. XDR is a label for products that merge several detection layers into one. This post covers each, the data it ingests, how detections are written, and how these systems fail.

## SIEM: centralized logs plus correlation

The National Institute of Standards and Technology (NIST) glossary defines a SIEM in one line, taken from NIST Special Publication (SP) 800-92: a program that provides centralized logging capabilities for a variety of log types. SP 800-92, the *Guide to Computer Security Log Management*, dates from September 2006, and its section on SIEM software is still one of the clearest neutral descriptions available. A revision, SP 800-92 Rev. 1 (*Cybersecurity Log Management Planning Guide*), was released as an initial public draft in October 2023 and was still listed as a draft when this was written.

According to SP 800-92, a SIEM has one or more log servers that analyze logs and one or more database servers that store them. It collects logs in one of two ways:

- **Agentless.** The SIEM server pulls logs from each host after authenticating to it, or the hosts push logs to the server. Filtering and normalization happen on the server.
- **Agent-based.** A small program on each host filters, aggregates and normalizes one type of log, then forwards it in near real time.

The tradeoff the guide describes is practical. Agentless collection means nothing to install and maintain on every machine, but without filtering at the host, far more data crosses the network, and the server may need credentials for every host it reads from.

Once logs arrive, the SIEM does two things that a plain log archive does not. The first is **normalization**: converting each field to one consistent representation, so that a timestamp written as a twelve-hour clock with a named time zone in one product and a twenty-four-hour clock with a numeric offset in another become the same field. The second is **correlation**, which SP 800-92 defines as finding relationships between two or more log entries. The most common form is rule-based correlation, matching entries on values such as timestamps, IP addresses and event types; statistical methods are another option. When automated correlation succeeds, the result is usually a new event that brings the pieces together and may raise an alert.

SP 800-92 also notes older names for parts of this market: security event management (SEM), focused on incident response, and security information management (SIM), focused on auditing.

### What a SIEM ingests

Almost anything that writes a log: operating systems, firewalls, authentication services, web and email servers, cloud audit trails, and, as SP 800-92 points out, even physical security devices such as badge readers. Most of that arrives as text over syslog or through vendor application programming interfaces (APIs). For the transport side, see [the syslog and centralized logging post](/blog/syslog-centralized-logging); for reading the results by hand, see [log analysis methodology](/blog/log-analysis-methodology).

The key limit is that this kind of platform only knows what something else chose to log. If a workstation never records which process opened a network connection, there is nothing to correlate on.

## EDR: telemetry from inside the host

The term is usually credited to Gartner analyst Anton Chuvakin, who in 2013 named the category endpoint threat detection and response (ETDR). His original blog post on Gartner's site could not be retrieved for this article, but a Kaspersky white paper quotes his definition: tools primarily focused on detecting and investigating suspicious activities (and traces of) other problems on hosts and endpoints. The word "threat" was later dropped.

The difference from a SIEM is the source of the data. An EDR product runs a sensor on each endpoint that records low-level activity directly, rather than relying on whatever the operating system or applications happened to log. The kinds of activity that matter are visible in MITRE ATT&CK's data source catalog, which lists, among others, Process (DS0009), Command (DS0017), File (DS0022), Logon Session (DS0028) and Network Traffic (DS0029). An EDR sensor collects host-side versions of these: which process started which child process, with what command line, which files it wrote, and which connections it opened.

The "response" half matters as much as detection. EDR agents can typically isolate a host from the network or stop a process, which is why they appear in incident response guidance. NIST SP 800-61 Rev. 3 (April 2025) suggests organizations consider configuring security technologies to automatically perform some containment actions, giving as examples quarantining malware and moving a compromised endpoint to an isolated remediation network.

The limit is coverage. EDR sees only machines where its agent runs. Network appliances, printers, many Internet of Things (IoT) devices, unmanaged laptops and plenty of servers cannot or do not run one.

## NDR: watching the network itself

NDR products analyze network traffic rather than host activity. In 2019 Gartner called this market network traffic analysis (NTA). In its 2020 Market Guide for Network Detection and Response, as quoted by Cisco, Gartner said it had renamed the market that year because the new term more accurately reflected what the products do. The guide itself could not be read directly for this article.

The data is network metadata, and sometimes full packets. Open-source tools show what that metadata looks like. Zeek, a widely used network monitor, turns traffic into structured logs such as conn.log for connections, dns.log, http.log and ssl.log for Transport Layer Security (TLS) sessions. Each record captures who talked to whom, when, for how long, over which protocol, and protocol details such as the DNS query or the certificate presented. SP 800-61 Rev. 3 lists the same territory when it says monitoring should include wired and wireless networks, network flows, and network services such as DNS and the Border Gateway Protocol (BGP).

Detection here is largely behavioral: unusual volumes, new destinations, periodic "beaconing" to the same external host, or lateral connections between internal machines that do not normally talk. NDR's strength is that it needs no agent and sees every device on a monitored segment, including the ones EDR cannot cover. Its weakness is encryption. When traffic is encrypted, the sensor sees the handshake and metadata, not the content.

## How detections are actually written

Across all three detection layers there are roughly three approaches, and most products mix them.

**Rules and signatures.** A rule says "if a log entry matches these fields, alert." Sigma is a useful example because it is vendor-neutral: its documentation describes Sigma rules as YAML files containing the information needed to detect odd or malicious behavior in log files, usually within a SIEM. A Sigma rule is converted into the query language of whatever SIEM is in use. Rules are precise and explainable, but they only catch what someone anticipated.

**Correlation.** Correlation joins events that are harmless alone. A single failed login means little; many failures across many accounts followed by one success from the same source is a pattern. SP 800-92's description of rule-based correlation, matching on timestamps, addresses and event types across sources, is exactly this. SP 800-61 Rev. 3 recommends using event correlation technology, naming SIEM and SOAR as examples, to gather related data captured by multiple sources, and using cyber threat intelligence (CTI) to help.

**Behavioral and statistical detection.** Instead of a fixed pattern, the system learns a baseline and flags deviations: a user logging in at an unusual hour, a process that has never made outbound connections suddenly doing so. This catches novel activity but produces more ambiguous alerts that need human judgment.

A practical way to organize detections is by adversary behavior. MITRE ATT&CK maps techniques to the data needed to see them, which is why home lab guides often pair ATT&CK with simulated attacks (the [SOC home lab build](/blog/soc-home-lab-build) does this). One current detail: ATT&CK's data source pages now carry a notice that data sources were deprecated in the v18 release in October 2025, with the pages kept for reference. Study material written before then may describe the older structure.

## SOAR: automating the response workflow

SOAR does not detect much on its own. It takes alerts from the SIEM and other tools and runs workflows on them. Carnegie Mellon's Software Engineering Institute (SEI), in a March 2021 blog post, quotes Gartner's definition: technologies that let organizations collect inputs monitored by the security operations team, with SIEM alerts as the example, and define incident analysis and response procedures in a digital workflow format. The SEI post says Gartner coined the term in 2015 and describes SOAR as combining security orchestration and automation, security incident response platforms, and threat intelligence platforms.

The core object is the **playbook**. SP 800-61 Rev. 3 describes playbooks as actionable steps or tasks for people to perform in various scenarios. In a SOAR platform, many of those steps become automated actions. A typical phishing playbook might:

1. Pull the reported email's headers, links and attachments.
2. Look up the sender domain, URLs and file hashes against threat intelligence sources.
3. Search mail logs for other recipients of the same message.
4. Open a case with everything attached and assign it a priority.
5. Offer an analyst buttons to delete the message from all mailboxes or block the sender.

Steps 1 to 4 are enrichment: gathering facts no analyst should have to copy and paste. Step 5 is a decision.

### Where automation should stop

The line most guidance draws is between gathering information and taking disruptive action. SP 800-61 Rev. 3 is explicit on this: alongside its suggestion to consider automatic containment and eradication, it recommends allowing incident handlers to manually select and perform containment and eradication actions instead of, or in addition to, automated measures. It also recommends manual review of logs for technologies that cannot be monitored well through automation.

Enrichment that runs on a false positive wastes some API calls. Automatic containment on a false positive can disable an executive's account or isolate a production database server. Common patterns are to fully automate low-impact, reversible actions on high-confidence alerts, and to require a human approval step for anything that disrupts users or systems.

The SEI post also warns that the biggest misperception about SOAR is that it can replace security professionals. It calls SOAR a force multiplier that does not replace the human component, and notes that deploying, connecting and maintaining it is complex, requiring integrations with every tool it orchestrates.

## XDR: an umbrella without a standard

XDR is the easiest of the five to describe and the hardest to define. Palo Alto Networks says its chief technology officer, Nir Zuk, coined the category in 2018. A December 2019 company blog post says the "X" in XDR is a variable that stands for "anything," and describes XDR products as platforms that take data from network, endpoint and cloud sensors and analyze it centrally.

There is no standards-body definition comparable to NIST's glossary entry for SIEM. Even the analyst definitions vary depending on who is quoting them:

| Source | How it attributes XDR to Gartner |
|---|---|
| Google Cloud explainer | A SaaS-based, vendor-specific detection and incident response tool that natively integrates multiple security products |
| CrowdStrike explainer | A unified incident detection and response platform that automatically collects and correlates data from multiple proprietary security components |

Both definitions stress one vendor's own components, which is the "native" view of XDR. Other vendors market "open" or "hybrid" XDR that ingests third-party tools, which overlaps heavily with what a SIEM already does. The originating vendor's own description ("anything") and the differing analyst wording quoted by two large vendors are reasonable evidence that the term describes a product strategy, the consolidation of EDR, NDR, cloud and identity data into one console, rather than a defined technology.

For study purposes, a useful working description: XDR is usually EDR extended with other telemetry sources and built-in correlation and response, sold as one platform. When a job posting asks for XDR experience, it is worth checking which product it means.

## Where they overlap

The boundaries blur in practice:

- **SIEM and XDR** both centralize and correlate data from multiple sources. The difference is mostly scope and openness: SIEMs are built to accept logs from many vendors and keep them for search and compliance; native XDR focuses on one vendor's sensors and on detection and response.
- **SIEM and SOAR** are often sold together, and SP 800-61 Rev. 3 names both as examples of monitoring and correlation tools.
- **EDR and NDR** both see network connections. EDR knows which process opened one; NDR sees devices that have no agent.
- **EDR and SOAR** both take response actions. A SOAR playbook can call the EDR's API to isolate a host as one step in a larger workflow.

## Failure modes

**Alert fatigue.** Every rule that fires too often trains analysts to ignore it. The SEI post cites reports of false positive rates as high as 80 percent and of fewer than 10 percent of alerts being actively investigated. SP 800-61 Rev. 3 recommends tuning monitoring to reduce false positives and false negatives to acceptable levels, which in practice means retiring or rewriting noisy rules rather than adding more.

**Log gaps.** Detection is limited by collection. SP 800-92 identifies a high number of log sources, inconsistent content and formats, and growing volume as the core difficulties of log management. A source that stops sending, a logging policy that never enabled command-line capture, or a cloud service whose audit log was never connected all create blind spots that produce no alert at all. Monitoring for silence, sources that stopped reporting, is as important as monitoring for events.

**Retention cost.** Storage scales with event volume multiplied by retention time, and SP 800-92 frames the basic problem as balancing limited log management resources against a continuous supply of log data. Long retention helps investigations that start weeks after a compromise and may be required by regulation, but every extra day multiplies storage and, for products priced by volume, licensing. Typical responses include filtering low-value events before ingestion, moving older data to cheaper storage tiers, and keeping searchable indexes for a shorter period than raw archives.

**Parsing and normalization drift.** SP 800-92 notes there are no standards specific to SIEM, so each product stores data in its own format, and SIEMs rely on knowing which field in each source's log holds which value. When a vendor changes its log format in an update, a parser can quietly stop extracting a field. Rules that depend on that field stop matching, and nothing announces the failure. SP 800-92 also flags timestamps specifically: clocks out of sync across hosts can make events appear in the wrong order, which is why it recommends Network Time Protocol (NTP) synchronization.

**Coverage assumptions.** Each tool has a blind spot: logs show only what is logged, EDR only hosts with agents, NDR only monitored segments and unencrypted content. More products do not close these gaps unless someone maps which data covers which technique.

## Study notes

- SIEM: centralized logs, normalization, correlation (NIST SP 800-92).
- EDR: endpoint sensor telemetry plus host response (Gartner, 2013).
- NDR: network metadata analysis, agentless (renamed from NTA, 2020).
- SOAR: playbook automation over other tools' alerts (Gartner, 2015).
- XDR: vendor-era umbrella (Palo Alto Networks, 2018), no standard definition.
- SP 800-61 Rev. 3 allows automated containment but keeps manual options for responders.

## Sources

- [NIST CSRC glossary: Security Information and Event Management](https://csrc.nist.gov/glossary/term/security_information_and_event_management)
- [NIST SP 800-92, Guide to Computer Security Log Management (September 2006), publication page](https://csrc.nist.gov/pubs/sp/800/92/final)
- [NIST SP 800-92 full text (PDF)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-92.pdf)
- [NIST SP 800-92 Rev. 1 initial public draft (October 2023)](https://csrc.nist.gov/pubs/sp/800/92/r1/ipd)
- [NIST SP 800-61 Rev. 3, Incident Response Recommendations and Considerations for Cybersecurity Risk Management (April 2025), publication page](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- [NIST SP 800-61 Rev. 3 full text (PDF)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r3.pdf)
- [MITRE ATT&CK: Data Sources](https://attack.mitre.org/datasources/)
- [MITRE ATT&CK: Process (DS0009)](https://attack.mitre.org/datasources/DS0009/)
- [Kaspersky white paper quoting the 2013 Gartner ETDR definition (PDF)](https://media.kaspersky.com/en/business-security/enterprise/endpoint-detection-and-response-optimum-whitepaper.pdf)
- [Cisco blog quoting the 2020 Gartner Market Guide for NDR](https://blogs.cisco.com/security/cisco-named-a-representative-vendor-in-the-gartner-market-guide-for-ndr)
- [Carnegie Mellon SEI: Benefits and Challenges of SOAR Platforms (March 2021)](https://www.sei.cmu.edu/blog/benefits-and-challenges-of-soar-platforms/)
- [Palo Alto Networks: What Is XDR? (December 2019)](https://www.paloaltonetworks.com/blog/2019/12/cortex-what-is-xdr)
- [Google Cloud: What is XDR?](https://cloud.google.com/security/resources/insights/what-xdr)
- [CrowdStrike: What is XDR?](https://www.crowdstrike.com/en-us/cybersecurity-101/what-is-xdr/)
- [SigmaHQ documentation: Sigma Rules](https://sigmahq.io/docs/basics/rules.html)
- [Zeek documentation: conn.log](https://docs.zeek.org/en/master/logs/conn.html)
