
## The Principle of Least Privilege

Every firewall policy should allow exactly what is needed and nothing more. This is the principle of least privilege applied to network traffic. The default posture should be deny-all, with explicit allow rules for each legitimate traffic flow.

In practice, this means starting with a policy that blocks everything, then adding rules one at a time as you identify what needs to be allowed. It is more work upfront, but it is dramatically more secure than starting with allow-all and trying to block bad traffic.

NIST SP 800-41 Rev 1 says the same thing more formally: firewall policy should block all inbound and outbound traffic, with exceptions made for desired traffic. Worth restating, because "deny by default" produces a specific kind of outage. You enable it and something nobody documented stops working. The way to avoid that is to run the deny rule in a logging-only posture first and read what it would have dropped. In a homelab a week catches most of it, but the things that break are monthly cron jobs, certificate renewals, and quarterly backup verification, so a month is safer.

The other half of least privilege is what "nothing more" means at the field level. A policy has at least four dimensions: source, destination, service, and time or user. Tightening three of them and leaving the fourth as `any` is not least privilege. The field people leave open is service. A rule that says "Users zone to Servers zone, service ALL" is a wide open door with a narrow-looking name.

## My Methodology

Before writing any policies, I map out every traffic flow I need to support:

1. What source zone needs to reach what destination zone?
2. What protocol and port does the traffic use?
3. Is the traffic bidirectional or one-way?
4. Does it need deep packet inspection?

I document each flow in a table, then translate each row into a firewall policy.

A fifth question earns its place after you have been burned once: is this a long-lived connection that will sit idle? That determines whether the flow needs session timeout handling, which is covered below.

The table is the artifact that matters; the ruleset is a compilation target. Reviewing policy six months later means reading the table and asking whether each row is still true, not reverse-engineering intent from a list of address objects. A row looks like this:

| Source | Destination | Service | Direction | Why |
| --- | --- | --- | --- | --- |
| Users | Servers | TCP/445 | one-way | File shares |
| Servers | Internet | TCP/443 | one-way | Package updates |
| Management | All | TCP/22, TCP/443 | one-way | Admin access |

Object naming pays for itself here. `SRV-FILE01` and `SVC-SMB` read the same way in the policy list and in the table. Raw IP addresses in policies are how you end up with rules nobody dares to touch.

## Zone-Based Design

I organize my firewall policies by zone. Each VLAN maps to a zone, and policies control traffic between zones. This is cleaner than per-interface policies because it abstracts the physical topology.

Example zones in my FortiGate:
- Management
- Servers
- Users
- IoT
- Guest
- Internet

Check the intra-zone setting on every zone you create. When two interfaces belong to the same zone, whether traffic between them is permitted is a per-zone toggle, and it is not always set to deny. The symptom of getting this wrong is genuinely confusing: two VLANs you believe are isolated can reach each other, and no policy in the list explains why, because the traffic never gets evaluated against a policy at all.

Zones also have a hard limit: they enforce at the boundary and can do nothing about traffic that never crosses it. If a switch access port is misconfigured and drops an IoT device into the Servers VLAN, that device is inside the segment and the firewall never sees its traffic. Policy design assumes the segmentation underneath it is correct. Port security, private VLANs, and 802.1X are what make that assumption true, and none of them live on the firewall.

## Stateful Means You Only Write Half the Rules

A stateful firewall keeps a session table. When you allow the initial SYN from client to server, the reply traffic is matched against that session entry and permitted automatically. You do not write a return rule.

The beginner mistake is writing one anyway. A mirrored reverse policy doubles the size of your ruleset and, worse, actually opens a hole, because that reverse rule permits unsolicited inbound connections, not just replies.

The corollary is that sessions expire, and the timeouts are where the real failures come from. Linux netfilter defaults, documented in the kernel's conntrack sysctl reference, are 432,000 seconds (5 days) for an established TCP connection, 30 seconds for UDP, 120 seconds for a detected UDP stream, and 600 seconds for unknown layer 4 protocols. Most commercial firewalls are far more aggressive on TCP, commonly reaping idle sessions after about an hour.

Here is the failure that costs people an afternoon. An SSH session or a database connection pool sits idle longer than the firewall's TCP idle timeout, so the firewall silently deletes the session entry and tells neither endpoint. The next packet either vanishes or draws an RST, and the application reports a hang or a "connection reset by peer" that looks random because it only happens after lunch. Linux does not send its first TCP keepalive until `net.ipv4.tcp_keepalive_time`, which defaults to 7200 seconds, two hours. If the firewall reaps at one hour, the keepalive never gets a chance. Fix it with an application-level keepalive shorter than the firewall's timeout, or lower `tcp_keepalive_time` below it.

Session tables are also finite. When a Linux box exhausts `nf_conntrack_max`, the kernel logs `nf_conntrack: table full, dropping packet` and new connections fail while existing ones keep working perfectly. The symptom is a server that serves current users fine and refuses everyone new.

## Policy Order

FortiGate (and most firewalls) evaluates policies top to bottom and applies the first match. This means specific rules must come before general rules. A common mistake is putting a broad allow rule above a specific deny rule, which effectively makes the deny rule useless.

I organize my policies in groups: inter-zone allow rules first, then zone-to-internet rules, then the implicit deny-all at the bottom.

The name for the mistake above is a shadowed rule: one that can never match because something broader above it always matches first. Nothing warns you. It is not a syntax error, and the GUI renders it exactly like a working rule. You find shadowed rules two ways: a policy shows a zero hit counter when it should be busy, or you check before you deploy. FortiGate exposes Policy Lookup in the GUI and `diagnose firewall iprope lookup` in the CLI. Give it a source address, destination address, port, and protocol, and it returns the policy ID that will actually handle that traffic.

One field to leave alone: source port. The client picks its source port from the ephemeral range, which on Linux defaults to 32768 through 60999 (`net.ipv4.ip_local_port_range`). A policy that pins a source port is either wrong today or will be wrong after a kernel upgrade.

## Logging

Every policy should log traffic, at minimum for session start. Logging lets you verify that policies are working as intended and provides forensic data for security investigations. I enable full logging on security policies and session-start logging on routine traffic policies.

The most valuable log is the one that is off by default. On FortiGate the implicit deny is policy ID 0, and logging for it is disabled out of the box. That means the record of everything the firewall blocked, which is exactly the data you need when someone reports that X cannot reach Y, does not exist until you enable it. Turn it on first, before you need it.

Budget for the volume. A syslog record for one session runs roughly 300 to 500 bytes. At a sustained 100 sessions per second that is 30 to 50 KB/s, or 2.6 to 4.3 GB per day, before compression. Either size retention for that or accept that your logs roll over before you go looking.

Session-start and session-end records answer different questions. End records carry byte counts, which is what you want for capacity planning and for spotting a host suddenly uploading gigabytes. Start records prove an attempt happened even when the session never established, which is why deny rules log on start: there is no session to end. For transport, RFC 5424 defines the modern syslog format and RFC 3164 the older BSD format a lot of gear still emits. Plain syslog over UDP 514 offers no delivery guarantee and no authentication, which is tolerable on a dedicated management VLAN and nowhere else.

## What Firewall Policy Cannot Do

Blocking all ICMP is the most common self-inflicted wound in this whole discipline. Path MTU Discovery depends on ICMP type 3 code 4, "fragmentation needed and DF set." Drop it and you create an MTU black hole: the TCP handshake succeeds, small requests work, and any response large enough to need fragmenting hangs forever. The signature symptom is "SSH connects fine but listing a large directory freezes." RFC 4821 describes the packetization-layer workaround that exists precisely because so many networks broke this. On IPv6 there is no workaround worth relying on: block Packet Too Big (type 2) or Neighbor Discovery (types 133 through 136) and IPv6 simply stops working. RFC 4890 lists which ICMPv6 messages must be permitted.

A firewall policy is also just a decision about a 5-tuple. It cannot distinguish an authorized user from a compromised account using the same credentials from the same host, it sees nothing inside TLS unless you deliberately configured inspection, and it does not constrain lateral movement within a segment at all. That gap is the argument NIST SP 800-207 makes for zero trust architectures. Separately, RFC 2827 ingress filtering is cheap and worth doing: drop packets arriving on an interface whose source address could not legitimately originate there.

## Regular Review

Firewall policies are not set-and-forget. I review my policies monthly to remove stale rules, tighten overly broad rules, and verify that the policy set matches the current network design. This discipline prevents policy bloat, where rules accumulate over time and nobody knows what half of them do.

Hit counters are the evidence that makes review possible rather than theoretical. A policy with zero matching sessions across a full cycle is a removal candidate. The trap is that a full cycle is longer than a month. Quarterly reporting jobs, annual certificate renewals, and the disaster recovery test somebody runs once a year all look like dead rules until you delete them.

So the sequence is: enable logging on the suspect rule, watch it for a cycle, disable it, wait another cycle, then delete. Disabling is reversible in seconds. Reconstructing a deleted rule from memory at 2 AM is not. And back up the configuration before every change, because the fastest rollback is always restoring a known-good config rather than undoing edits one at a time.

## References

- https://csrc.nist.gov/pubs/sp/800/41/r1/final
- https://www.rfc-editor.org/rfc/rfc2827
- https://www.rfc-editor.org/rfc/rfc4890
- https://www.kernel.org/doc/html/latest/networking/nf_conntrack-sysctl.html
- https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html
- https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/163385/policy-views-and-policy-lookup
