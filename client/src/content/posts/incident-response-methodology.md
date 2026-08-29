
## Incidents Will Happen

No matter how well you design and maintain your infrastructure, things will break. Hardware fails. Software has bugs. Configuration changes have unintended consequences. The question is not whether incidents will happen, but how effectively you respond when they do.

## My Framework

I follow a structured approach based on established incident response frameworks:

### 0. Prepare

This step comes before the pager goes off, which is exactly why it gets skipped. NIST SP 800-61 Rev 2 puts Preparation first in its four-phase lifecycle (Preparation; Detection and Analysis; Containment, Eradication, and Recovery; Post-Incident Activity) and it is first for a reason. Almost everything that determines how badly an incident goes is decided beforehand: whether you have logs from the affected host, whether you know what "normal" looks like, whether your backups restore, and whether the credentials you need are stored somewhere that is still reachable when the thing that broke is your identity provider.

Concretely, preparation is a short list: centralized logs with enough retention to cover the gap between an incident starting and someone noticing, an out-of-band path to every device (iDRAC, a console server, a cellular hotspot), a current network diagram, and a restore that you have actually tested this quarter. Revision 3 of SP 800-61 restructures the guidance around the CSF 2.0 functions rather than a linear lifecycle, and one of the reasons is that preparation is continuous rather than a phase you complete.

### 1. Detect and Identify

The first step is knowing that something is wrong and understanding what is affected. Monitoring and alerting handle detection. Identification means determining the scope: what service is down, who is affected, and what is the business impact.

Two disciplines make this step fast rather than frantic. First, classify by impact, not by cause. "Database is slow" is not a severity; "checkout fails for all users" is. You do not know the cause yet, and waiting to know it before deciding how hard to push is how thirty minutes disappear. Second, get the clock right immediately. Note the time you were paged and the time the first symptom appears in the logs, and record both in UTC with an explicit offset (RFC 3339 format). Correlating four systems with three different local timezones is a genuinely common way to lose an hour, and it is entirely avoidable if your hosts run NTP and your notes are in one zone.

### 2. Contain

Stop the problem from getting worse. If a server is compromised, isolate it from the network. If a configuration change broke connectivity, roll it back. If a process is consuming all system resources, kill it. Containment is about limiting damage while you figure out the root cause.

Containment is a decision, not a reflex, and NIST frames it as one: choose a strategy by weighing potential damage, the need to preserve evidence, service availability, the resources the strategy costs, and how long it will hold. Pulling a compromised host off the network stops the bleeding and also tells the attacker you noticed, destroys any chance of observing live command and control, and takes the service down. Sometimes that is right. Sometimes moving the host to an isolated VLAN where you can watch it is better.

The mistake to avoid here is rebooting. Rebooting a suspicious host is the single most destructive thing an inexperienced responder does, because it erases exactly the evidence that identifies the problem. RFC 3227 lays out the order of volatility, and the top of the list is everything a reboot destroys: CPU registers and cache, then the routing table, ARP cache, process table, kernel statistics, and memory, then temporary filesystems, and only then disk. If there is any chance this is a security incident, capture the volatile layers first. In practice that means `ps auxf`, `ss -tanp`, `lsof -n`, `ip neigh`, and a memory image if you have the tooling, saved somewhere off the host, before you touch anything else.

### 3. Diagnose

Find the root cause. This is where log analysis, packet captures, and systematic troubleshooting come in. Start with what changed recently. Most incidents are caused by recent changes, even if the relationship is not immediately obvious.

"What changed" is the right first question, and if you cannot answer it in under a minute, that is your actual finding. Package upgrade logs, `git log` on your config repository, and your firewall's change history are all cheap sources.

When nothing changed, bisect the problem along dimensions rather than guessing:

- Is it one host or every host? One VLAN or all of them? One user or all users?
- Did it start at a specific timestamp? Round timestamps point at scheduled work. A failure at exactly midnight UTC is log rotation or a cron job. A failure that starts and never recovers, on a service that was fine for months, is very often a certificate expiring. Public TLS certificates are capped at 398 days by the CA/Browser Forum baseline requirements, and Let's Encrypt issues 90-day certificates, so "it worked for exactly 90 days" is a diagnosis.
- Does it fail the same way every time, or intermittently? Intermittent points at load, at one member of a pool, or at something with a timeout.

A few symptom-to-cause pairs worth memorizing because they mislead beginners:

- "No space left on device" with `df -h` showing free space is inode exhaustion. Check `df -i`. Millions of tiny session or cache files will do it.
- A service that vanished with no error in its own log was probably killed by the kernel. `dmesg -T | grep -i 'killed process'` confirms the OOM killer. The application never gets to write a crash log because it was sent SIGKILL.
- Small requests succeed and large transfers hang forever is an MTU black hole, not a bandwidth problem, and it is usually ICMP being filtered somewhere in the path.

### 4. Resolve

Fix the problem. Apply the patch, replace the hardware, correct the configuration, or restore from backup. Verify that the fix actually works and that the service is fully restored.

It is worth separating two things the word "resolve" hides. Eradication removes the cause: the attacker's persistence mechanism, the bad config, the failing disk. Recovery restores service and then watches it. Those are different jobs and skipping the first produces the incident that comes back in three days. If the host was compromised, eradication realistically means rebuilding it from a known-good image rather than cleaning it, because you cannot prove you found everything.

Verification means checking from the user's position, not from the server. A service that responds to `curl localhost` and nothing else is not restored. And keep monitoring after you declare it fixed; the window right after recovery is when a partial fix reveals itself.

### 5. Document

Write down what happened, when it happened, what caused it, how it was fixed, and what will prevent it from happening again. This is the step most people skip, and it is arguably the most important one. Good incident documentation prevents recurring problems and helps you respond faster next time.

A postmortem that is worth writing has six parts: impact (who was affected and for how long), a timeline in absolute timestamps, the trigger (what set it off), the root cause (why the trigger had that effect), how it was detected, and action items. Separating trigger from root cause matters. "A switch reboot" is a trigger. "[Spanning tree](/blog/spanning-tree-protocol-deep-dive) had no redundant path because both uplinks were on the same switch" is a root cause, and only the second one generates useful work.

Action items need an owner and a date or they are not action items, they are regrets. The Google SRE book's chapter on postmortem culture makes the other essential point: the document is blameless. The moment a postmortem can be used against someone, people stop writing down the parts that matter, and you lose the only mechanism you had for finding systemic problems.

## Communication

During an incident, clear communication matters. Even in a homelab where I am the only user, I keep a running log of what I have tried, what I have found, and what I plan to do next. This prevents going in circles and provides a record for the post-incident review.

With more than one person involved, the thing that scales is separating roles. Google's incident management model splits the incident commander (who decides and delegates, and does not debug), the operations lead (who actually touches systems), and communications. The failure mode without that split is three people independently changing things on the same host, which makes the system state unknowable and turns one incident into two.

Update on a cadence even when there is nothing new. Silence reads as "nobody is working on it," and it generates interruptions that slow down the people who are.

## What This Framework Will Not Do

It will not help if you have no telemetry. A methodology for analyzing logs is worthless against a host that never shipped any, which is why preparation is phase zero rather than an afterthought.

It also does not solve the real constraint in a one-person lab, which is that you will be tired and you will be the person who caused the problem. Knowing the framework does not make you follow it at 2 AM. What actually works is writing the runbook while calm, so the tired version of you is reading a checklist instead of improvising. Every incident you handle should end with a slightly better checklist for that class of failure.

## Practice

I occasionally create intentional incidents in my lab environment to practice response procedures. Breaking something on purpose and then fixing it under time pressure is the closest thing to real-world incident response training you can get without actual production incidents.

The exercises with the best return are the boring ones. Fill a disk to 100 percent and see what breaks first, which is usually logging, and then everything that logs. Pull one power supply. Revoke a certificate. Kill the DNS server and time how long until the failures look like something unrelated. Restore a backup to a scratch VM and diff it against production, because a backup you have never restored is a hypothesis, not a backup.

## References

- https://csrc.nist.gov/pubs/sp/800/61/r2/final
- https://csrc.nist.gov/pubs/sp/800/61/r3/final
- https://www.rfc-editor.org/rfc/rfc3227
- https://csrc.nist.gov/pubs/sp/800/86/final
- https://sre.google/sre-book/managing-incidents/
- https://sre.google/sre-book/postmortem-culture/
