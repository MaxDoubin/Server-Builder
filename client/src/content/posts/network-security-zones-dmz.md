
## The Zone Model

A security zone is a group of systems with similar trust levels and security requirements. Traffic between zones is controlled by firewall policies. Traffic within a zone may or may not be inspected, depending on your requirements.

The classic zone model has three zones:
- **Inside (LAN):** Trusted internal network
- **Outside (WAN/Internet):** Untrusted external network
- **DMZ:** Semi-trusted zone for systems that must be accessible from outside

The word "zone" does two jobs at once and it helps to separate them. On the firewall, a zone is a named container that one or more interfaces or VLANs get assigned to, so you can write policy against a name instead of against interface numbers. In the design, a zone is an assertion about trust: everything in here may talk to everything else in here without inspection. The second meaning is the one that causes problems, because a zone is only as strong as the assumption that nothing inside it is hostile.

Some platforms encode trust as a number. On a Cisco ASA, every interface carries a security level from 0 to 100, conventionally 0 for outside, 100 for inside, and something in between such as 50 for the DMZ. Traffic from a higher security level to a lower one is permitted by default and the return traffic is allowed by the state table, while traffic from lower to higher is dropped unless an access list says otherwise. Zone-based policy on IOS, on FortiGate, and on pfSense expresses the same idea without the number: no policy, no traffic.

## Why Zones Matter

Without zones, a compromised internal host can reach any other internal system directly. Zones limit blast radius. If a web server in the DMZ is compromised, the attacker is stuck in the DMZ. They cannot reach your database servers on the internal network because the firewall blocks DMZ-to-LAN traffic.

Concretely, the chain an attacker wants is: exploit the public web app, land a shell on the web server, scan the local subnet, find a file server or a domain controller, reuse credentials, move laterally. Zones break that chain at step three. The scan comes back empty because the internal ranges are not routable from the DMZ, or they are routable but the firewall drops every SYN. What was going to be a full-network incident becomes one rebuilt web server.

## Designing a DMZ

The DMZ sits between the inside and outside zones. Systems in the DMZ need to be reachable from the internet (like web servers or email servers) but should not have access to internal systems.

Key firewall rules:
- **Outside to DMZ:** Allow specific inbound traffic (HTTP/443 to web servers, 25 to mail servers)
- **DMZ to Inside:** Deny by default. Allow specific exceptions only (like a web server querying a database on a dedicated database VLAN)
- **Inside to DMZ:** Allow for administration, deny for general browsing
- **Inside to Outside:** Allow with inspection

There are two physical shapes for this. The three-legged design uses one firewall with three interfaces, one per zone. It is cheaper, simpler to reason about, and it is what almost every homelab and small business runs. The screened subnet design uses two firewalls in series, ideally from different vendors, with the DMZ in the gap between them. It costs twice as much and doubles the change management, and it buys you exactly one thing: a single firewall bug or misconfiguration no longer exposes the internal network. Unless you have a specific reason to distrust one vendor's code, the three-legged design plus real rule hygiene is the better use of your time.

The rule set that matters most is the one nobody writes: **DMZ to Outside**. Leaving that open is how an implant reaches its command-and-control server and how data leaves the building. A web server needs to resolve DNS against one specific resolver, sync time against one specific NTP source, and pull packages through a proxy or a local mirror. That is three rules. Everything else outbound should be denied and logged. The moment your DMZ egress policy is `any any allow`, the DMZ has stopped being a containment boundary and become a staging area with a nice name.

Add anti-spoofing while you are in there. Ingress filtering, described in BCP 38 (RFC 2827) and extended for multihomed networks in RFC 3704, means dropping packets whose source address could not legitimately have arrived on that interface. A packet claiming a 10.0.0.0/8 source arriving on the outside interface is forged, and there is no reason to let it into the state table.

## What Actually Goes Wrong

**The DMZ host gets joined to the internal domain.** Somebody wants single sign-on for the web server, so the ticket asks for the DMZ host to join Active Directory. Doing that means opening Kerberos on 88, LDAP on 389 and 636, SMB on 445, the RPC endpoint mapper on 135, and then a dynamic high port range back to the domain controllers, which on modern Windows is 49152 to 65535. You have just written a rule that lets a compromised DMZ box talk to your domain controllers on almost every port. The symptom is that nobody notices, because everything works. The fix is a read-only domain controller placed in the DMZ, or local accounts on the DMZ host, or terminating authentication at a reverse proxy in the DMZ so the app never needs to see the domain at all.

**Somebody writes rules in both directions.** A stateful firewall tracks flows. When the rule permitting outside to DMZ on 443 lets a SYN through, the return packets are matched against the state table, not against the rule base. Adding a matching DMZ to outside rule "so the replies work" does nothing for the replies and everything for the attacker, because it permits new connections originating from the DMZ. If you find symmetric rule pairs in a policy, that is a strong sign the person who wrote it did not understand stateful inspection.

**A second NIC bypasses the firewall.** A DMZ server with one interface in the DMZ and a second interface on the management VLAN for backups is a bridge between two zones that the firewall never sees. From the firewall's point of view the policy is perfect. From the attacker's point of view there is a route around it. Backups from the DMZ should be pulled through the firewall on a specific port to a specific host, or written to a target that lives in the DMZ and gets replicated inward, never done by giving the box a foot in both zones.

**A VLAN is treated as a zone when nothing enforces it.** Two VLANs on the same layer 3 switch with SVIs configured will route between each other at line rate, inside the switch, without the packets ever reaching the firewall. Putting cameras on VLAN 40 and calling it an isolated zone means nothing until either the SVI carries an ACL or the inter-VLAN routing happens on the firewall. Test this by pinging across from a host, not by reading the VLAN table.

**Private addressing is mistaken for trust.** The RFC 1918 ranges, 10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16, are not routable on the internet, which is a reachability property and not a security property. A DMZ host on 10.20.0.0/24 is exactly as compromised as it would be on a public address.

## Beyond the Basic DMZ

More mature environments add additional zones:
- **Server VLAN:** Isolated from user workstations but trusted more than the DMZ
- **Management VLAN:** For out-of-band device management (iDRAC, switch management)
- **Guest WiFi:** Fully isolated from everything internal
- **IoT:** Isolated from trusted systems

Each additional zone adds security but also adds management complexity. Start with the basics and add complexity only when you have a clear reason for it.

The management zone deserves particular care because it is the one that ignores your other boundaries. A BMC can power cycle a server, mount virtual media, and give console access below the operating system, so reaching the management VLAN is close to physical access. It should be reachable only from a jump host, never from a user VLAN, and never from the DMZ.

Where zones stop working is worth stating plainly. Zones are a network-layer control, and they only see addresses and ports. They do not stop an attacker who abuses a flow you deliberately permitted: SQL injection arriving over the allowed 443 to the app server, then reaching the database over the allowed 1433, is a textbook incident that a perfect zone policy does nothing about. They do not help with stolen credentials, they do not inspect encrypted payloads without a decryption point you have to build and maintain, and they do nothing about east-west traffic inside a zone. When those are your real risks, the answer is not another VLAN. It is per-workload identity, mutual TLS, application-layer authorization, and host firewalls, which is broadly what NIST SP 800-207 describes as zero trust architecture. Zones remain useful underneath all of that, as the cheap coarse filter that keeps the expensive controls from having to handle internet background noise.

Finally, verify from inside the zone rather than from the rule table. Put a laptop or a container in the DMZ and run a scan toward your internal ranges. If anything answers that should not, you have found a rule you forgot. Turn on logging for the default deny in every direction, then actually read those logs for a week after any change, because a rule that is silently blocking something legitimate and a rule that is silently permitting something dangerous look identical until you look.

## References

- https://en.wikipedia.org/wiki/DMZ_(computing)
- https://en.wikipedia.org/wiki/Screened_subnet
- https://csrc.nist.gov/pubs/sp/800/41/r1/final
- https://csrc.nist.gov/pubs/sp/800/207/final
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc2827
