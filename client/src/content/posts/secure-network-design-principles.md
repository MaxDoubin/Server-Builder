
## Defense in depth

You have a firewall at the edge, the rules on it are tight, and everything behind it is one flat network where any host can reach any other host on any port. That design has exactly one control, and the entire security of the network is a bet that the control never fails. It always fails eventually.

Defense in depth means assuming any individual control will fail and designing so that the failure does not cascade.

The layers that actually matter in a small or mid-sized network are the boring ones: a perimeter filter, segmentation between internal zones, host-level firewalls on the servers themselves, authentication on every service rather than relying on network position, and logging that records what happened. Each is independently weak. Together they mean that a single mistake is an incident and not a catastrophe.

## Least privilege network access

Every device and every user should only have network access to what they need. A printer should not be able to reach your domain controllers. A guest WiFi network should not be able to reach anything internal. A database server should only accept connections from the application servers that query it.

Enforce this with firewall rules, ACLs, and [VLAN segmentation](/blog/vlan-segmentation-guide). Document what should be allowed and deny everything else by default.

The order matters. Write the default-deny first, then add the allows, and let the ruleset be uncomfortable for a week while you find what you forgot. The reverse approach, denying specific bad things and permitting the rest, is unbounded work: you have to enumerate every threat, forever, and you will miss one.

Least privilege applies per direction as well. Most rulesets carefully control what can reach a server and say nothing about what the server can reach. That outbound gap is how a compromised host phones home, pulls a second-stage payload, and exfiltrates data. If your database server has no reason to make outbound connections to the internet, it should not be able to.

## Segment along blast radius, not the org chart

Segmentation is not about departments. It is about answering one question for each zone: if everything in here is compromised, what else is now reachable?

Group by trust level and by what an attacker gains. Untrusted devices that phone home to vendors and never get patched belong together and belong nowhere near anything else. Infrastructure that can reconfigure other infrastructure belongs in its own zone with the smallest possible number of ways in. Workloads that hold data you care about belong behind a control point that logs.

The word "zone" does two jobs. On the firewall it is a named group of interfaces or VLANs that you write policy against. In the design it is a claim that everything inside may talk to everything else without inspection, so a zone is only as strong as the assumption that nothing in it is hostile. A Cisco ASA encodes trust as a security level on each interface, conventionally 0 for outside and 100 for inside: higher to lower is permitted by default, lower to higher is dropped unless an access list permits it, and so outbound is default-allow until you write one. Zone-based policy on IOS and FortiGate drops the number: no policy, no traffic.

The failure most people hit is stopping at [VLANs](/blog/vlan-segmentation-guide). A VLAN is a broadcast domain, not a security boundary. If two VLANs are routed by the same device with no ACL between them, an attacker on one reaches the other with a single hop and no obstacle. A layer 3 switch with an SVI on each VLAN does exactly that at line rate, inside the switch, and the packets never reach the firewall. The boundary is the filter you put on the routed interface, not the tag on the frame.

## Designing the DMZ

The DMZ is the zone for systems that must be reachable from the internet and must not reach anything else. The chain an attacker wants runs: exploit the public web app, land a shell, scan the local subnet, find a file server or domain controller, reuse credentials, move laterally. A DMZ breaks it at the scan: the internal ranges are unroutable from the DMZ or the firewall drops every SYN, and a full-network incident becomes one rebuilt web server.

Write the policy as five directions:

- **Outside to DMZ:** only the published services, such as HTTPS on 443 to the web server and SMTP on 25 to the mail server.
- **DMZ to inside:** deny, with narrow exceptions such as the web server querying a database on its own VLAN.
- **Inside to DMZ:** administration only, not general browsing.
- **Inside to outside:** allowed, with inspection.
- **DMZ to outside:** the direction most policies leave open. A web server needs DNS from one resolver, time from one NTP source, and packages through a proxy or a local mirror. That is three rules. Deny and log everything else. With `any any allow` outbound, the DMZ has stopped being a containment boundary and become a staging area with a nice name.

There are two physical shapes. The three-legged design uses one firewall with an interface per zone, and it is what almost every homelab and small business runs. The screened subnet puts the DMZ between two firewalls in series, ideally from different vendors, which doubles the cost and the change management to buy exactly one thing: a single firewall bug or misconfiguration no longer exposes the inside. Unless you have a specific reason to distrust one vendor's code, one firewall plus real rule hygiene is the better use of your time.

Add anti-spoofing on the outside interface. Ingress filtering, described in BCP 38 (RFC 2827) and extended for multihomed networks in RFC 3704, drops packets whose source address could not legitimately have arrived on that interface. A packet from 10.0.0.0/8 arriving from the internet is forged, and there is no reason to let it into the state table.

Two routine requests quietly defeat a correct DMZ policy. The first is joining a DMZ host to Active Directory for single sign-on, which takes Kerberos on 88, LDAP on 389 and 636, SMB on 445, the RPC endpoint mapper on 135, and the dynamic RPC range, 49152 to 65535 on modern Windows, back to the domain controllers. A compromised DMZ box can now reach them on more than 16,000 ports, and nobody notices because everything works. Use a read-only domain controller in the DMZ, local accounts, or authentication terminated at a reverse proxy so the app never sees the domain. The second is a DMZ host with a second NIC on the management VLAN for backups: a bridge the firewall never sees, so the policy looks perfect and there is a route around it. Pull backups through the firewall on a specific port to a specific host, or write them to a target inside the DMZ that replicates inward.

## Separate management plane

Network device management (SSH, HTTPS, SNMP) should never ride on the same network as production traffic. Create a dedicated management VLAN or network. Only devices with a specific need to manage infrastructure can reach the management plane, so even an attacker who compromises a server cannot reach your router's management interface.

Two practical notes. First, reach the management network through a single jump host that requires its own authentication and logs every session, rather than routing to it from anywhere on the trusted network. The moment the management VLAN is reachable from a laptop, it is reachable from whatever compromises that laptop.

Second, baseboard management controllers deserve special paranoia. [IPMI](/blog/ipmi-remote-management), iDRAC, iLO, and their equivalents are full computers with independent power, their own network stack, and complete control over the host, including remote console and virtual media. They have a long history of firmware vulnerabilities and default credentials. A BMC reachable from a general-purpose network is a full compromise of that server waiting to happen. Put them on the management VLAN, change the default credentials, and never expose them to the internet.

## Assume breach

Design the network assuming an attacker will eventually get in, and ask what they can do once inside. That is the core of the zero trust model described in NIST SP 800-207: network location is not an authentication factor. Being on the internal network should grant you nothing by itself. Every request gets authenticated and authorized on its own merits, and the network's job is to reduce the set of things a compromised identity can even attempt to reach.

Be clear about where segmentation stops, because it sees only addresses and ports. SQL injection arriving over the permitted 443 to the app server, then reaching the database over the permitted 5432, is a textbook incident that the worked example below allows at every hop. Segmentation also does nothing about stolen credentials, cannot inspect encrypted payloads without a decryption point you build and maintain, and never sees traffic between two hosts in the same zone. Those risks call for per-workload identity, mutual TLS, application-layer authorization, and host firewalls, with zones underneath as the cheap coarse filter that keeps internet background noise off the expensive controls. Private addressing is not a control either: RFC 1918 space is unroutable on the internet, which is a reachability property, not a security property.

You do not need a product to start. Requiring authentication on internal services that currently have none, and putting a filter between zones that currently route freely, gets you most of the practical benefit.

## Visibility by default

You cannot defend what you cannot see. Every network should have:
- Centralized logging from all devices
- Flow data (NetFlow, sFlow, or IPFIX) for traffic analysis
- DNS query logging
- Authentication event logging

Syslog as standardized in RFC 5424 traditionally rides UDP port 514, which is unauthenticated and can be dropped silently; use the TLS transport on port 6514 where the gear supports it. IPFIX, the IETF standard descended from NetFlow version 9, is registered on port 4739, while NetFlow v9 exporters conventionally use UDP 2055, a convention rather than a standard, so check what your collector expects.

Two things make logs usable rather than merely voluminous. Synchronize clocks with NTP on every device, because correlating events across systems whose timestamps disagree by minutes is nearly impossible. And ship logs off the device that generated them immediately, since the first thing a competent intruder does on a compromised host is edit its local logs.

Decide retention deliberately. Intrusions are frequently discovered weeks or months after they begin, and flow data from the week before you started looking is what tells you how far it spread.

## A worked example: default-deny between zones

Here is the shape of a default-deny policy on a Linux router with nftables, filtering traffic between VLANs:

```
table inet filter {
  chain forward {
    type filter hook forward priority 0; policy drop;

    ct state established,related accept
    ct state invalid drop

    # Clients may reach the app server on HTTPS only
    ip saddr 10.0.30.0/24 ip daddr 10.0.20.10 tcp dport 443 counter accept

    # The app server may reach the database VLAN, nothing else may
    ip saddr 10.0.20.10 ip daddr 10.0.21.20 tcp dport 5432 counter accept

    # IoT gets internet, never the inside
    ip saddr 10.0.40.0/24 oifname "wan0" counter accept

    counter limit rate 5/second log prefix "fw-drop: "
  }
}
```

The `policy drop` on the chain is the whole design; every accept below it is an exception you chose. The IoT rule accepts only traffic leaving through the WAN interface, so anything aimed inside falls through to the last rule, which counts and logs what the policy is about to drop. `limit` comes before `log` because nftables runs a rule's statements left to right; the other order logs every packet, and a scan can fill your disk. The database has its own VLAN because a router only filters what it routes: on the app server's subnet the two would talk directly at layer 2, that rule would never match, and every neighbor would reach port 5432 unfiltered.

Verify with counters rather than assumptions. nftables only counts on rules that carry a `counter` statement, which is why the rules above have one:

```bash
sudo nft list ruleset
sudo nft -a list chain inet filter forward
```

A working ruleset shows non-zero packet counts on the rules you expect traffic to match and a growing count on the final rule. Then test the negative case explicitly, because a rule that was never exercised has never been tested:

```bash
# From an IoT-VLAN host, this must fail
nc -zv -w 3 10.0.21.20 5432
```

Correct output is a timeout, and a matching `fw-drop:` line in the router's log with the source address of the IoT host. If you get `succeeded`, your rule order or scope is wrong: nftables evaluates rules top to bottom and the first match wins, so a broad accept placed above a narrower rule silently defeats it.

Then repeat the test at scale. From a host inside each zone, scan the ranges that zone should never reach, such as `nmap -Pn` against the server subnet from the IoT VLAN, and expect every port to come back filtered.

## Common mistakes

**Treating a VLAN as a security boundary.** Two VLANs on the same router with no ACL between them are one network with extra configuration. The control is the filter on the routed interface. If you cannot point at the rule, there is no boundary, and the way to find out is to ping across from a host, not to read the VLAN table.

**Rules written in both directions.** A stateful firewall matches replies against the state table, which is what the `ct state established,related accept` line above does, so the return packets for an allowed connection never consult the rule base. A mirror-image rule from the DMZ "so the replies work" does nothing for the replies and permits new connections originating from the DMZ. Symmetric rule pairs are a strong sign that whoever wrote the policy did not understand stateful inspection.

**A management network you can reach from everywhere.** Building a management VLAN and then permitting the entire trusted network to route into it recreates the original problem with more steps. Force it through a jump host and log the sessions.

**Logging to the box you are trying to protect.** Local logs on a compromised host are attacker-controlled. Ship them off immediately, and make the log collector a system that the hosts sending to it cannot log into.

**Unsynchronized clocks.** Every incident timeline is built from timestamps. If your switch, firewall, and servers disagree, you cannot establish what happened before what, and the investigation stalls on a problem that NTP would have solved for free.

## References

- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [RFC 4949: Internet Security Glossary, Version 2](https://www.rfc-editor.org/rfc/rfc4949)
- [RFC 5424: The Syslog Protocol](https://www.rfc-editor.org/rfc/rfc5424)
- [RFC 7011: the IPFIX protocol for exchanging flow information](https://www.rfc-editor.org/rfc/rfc7011)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
- [Defense in depth (computing)](https://en.wikipedia.org/wiki/Defense_in_depth_(computing))
- [DMZ (computing)](https://en.wikipedia.org/wiki/DMZ_(computing))
- [Screened subnet](https://en.wikipedia.org/wiki/Screened_subnet)
- [NIST SP 800-41 Rev. 1: Guidelines on Firewalls and Firewall Policy](https://csrc.nist.gov/pubs/sp/800/41/r1/final)
- [RFC 1918: Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
- [RFC 2827 (BCP 38): Network Ingress Filtering](https://www.rfc-editor.org/rfc/rfc2827)
