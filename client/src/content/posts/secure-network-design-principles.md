
## Defense in depth

You have a firewall at the edge, the rules on it are tight, and everything behind it is one flat network where any host can reach any other host on any port. That design has exactly one control, and the entire security of the network is a bet that the control never fails. It always fails eventually.

No single control is sufficient. A network designed for security has multiple independent layers. If an attacker bypasses the perimeter firewall, they still face internal segmentation. If they compromise a server, they cannot reach other segments without traversing another control point.

Defense in depth means assuming any individual control will fail and designing so that failure does not cascade.

The layers that actually matter in a small or mid-sized network are the boring ones: a perimeter filter, segmentation between internal zones, host-level firewalls on the servers themselves, authentication on every service rather than relying on network position, and logging that records what happened. Each is independently weak. Together they mean that a single mistake is an incident and not a catastrophe.

## Least privilege network access

Every device and every user should only have network access to what they need. A printer should not be able to reach your domain controllers. A guest WiFi network should not be able to reach anything internal. A database server should only accept connections from the application servers that query it.

Enforce this with firewall rules, ACLs, and VLAN segmentation. Document what should be allowed and deny everything else by default.

The order matters. Write the default-deny first, then add the allows, and let the ruleset be uncomfortable for a week while you find what you forgot. The reverse approach, denying specific bad things and permitting the rest, is unbounded work: you have to enumerate every threat, forever, and you will miss one.

Least privilege applies per direction as well. Most rulesets carefully control what can reach a server and say nothing about what the server can reach. That outbound gap is how a compromised host phones home, pulls a second-stage payload, and exfiltrates data. If your database server has no reason to make outbound connections to the internet, it should not be able to.

## Segment along blast radius, not the org chart

Segmentation is not about departments. It is about answering one question for each zone: if everything in here is compromised, what else is now reachable?

Group by trust level and by what an attacker gains. Untrusted devices that phone home to vendors and never get patched belong together and belong nowhere near anything else. Infrastructure that can reconfigure other infrastructure belongs in its own zone with the smallest possible number of ways in. Workloads that hold data you care about belong behind a control point that logs.

The failure most people hit is stopping at VLANs. A VLAN is a broadcast domain, not a security boundary. If two VLANs are routed by the same device with no ACL between them, an attacker on one reaches the other with a single hop and no obstacle. The boundary is the filter you put on the routed interface, not the tag on the frame.

## Separate management plane

Network device management (SSH, HTTPS, SNMP) should never ride on the same network as production traffic. Create a dedicated management VLAN or network. Only devices with a specific need to manage infrastructure can reach the management plane.

This means that even if an attacker compromises a server, they cannot reach your router's management interface because it is on a physically or logically separate network.

Two practical notes. First, reach the management network through a single jump host that requires its own authentication and logs every session, rather than routing to it from anywhere on the trusted network. The moment the management VLAN is reachable from a laptop, it is reachable from whatever compromises that laptop.

Second, baseboard management controllers deserve special paranoia. IPMI, iDRAC, iLO, and their equivalents are full computers with independent power, their own network stack, and complete control over the host, including remote console and virtual media. They have a long history of firmware vulnerabilities and default credentials. A BMC reachable from a general-purpose network is a full compromise of that server waiting to happen. Put them on the management VLAN, change the default credentials, and never expose them to the internet.

## Assume breach

Design the network assuming an attacker will eventually get in. The question is not whether the perimeter will be breached, but what they can do once inside. Micro-segmentation, zero-trust access controls, and comprehensive logging all limit the damage from a successful intrusion.

This is the core of the zero trust model described in NIST SP 800-207: network location is not an authentication factor. Being on the internal network should grant you nothing by itself. Every request gets authenticated and authorised on its own merits, and the network's job is to reduce the set of things a compromised identity can even attempt to reach.

You do not need a product to start. Requiring authentication on internal services that currently have none, and putting a filter between zones that currently route freely, gets you most of the practical benefit.

## Visibility by default

You cannot defend what you cannot see. Every network should have:
- Centralized logging from all devices
- Flow data (NetFlow, sFlow, or IPFIX) for traffic analysis
- DNS query logging
- Authentication event logging

Security without visibility is guesswork. Build observability into the network from day one.

Some specifics for building that out. Syslog as standardised in RFC 5424 traditionally rides UDP port 514, which is unauthenticated and can be dropped silently; use the TLS transport on port 6514 where the gear supports it. IPFIX, the IETF standard descended from NetFlow version 9, is registered on port 4739, while NetFlow v9 exporters conventionally use UDP 2055, a convention rather than a standard, so check what your collector expects.

Two things make logs usable rather than merely voluminous. Synchronise clocks with NTP on every device, because correlating events across systems whose timestamps disagree by minutes is nearly impossible. And ship logs off the device that generated them immediately, since the first thing a competent intruder does on a compromised host is edit its local logs.

Decide retention deliberately. Intrusions are frequently discovered weeks or months after they begin, and flow data from the week before you started looking is what tells you how far it spread.

## A worked example: default-deny between zones

Here is the shape of a default-deny policy on a Linux router with nftables, filtering traffic between the server VLAN and everything else:

```
table inet filter {
  chain forward {
    type filter hook forward priority 0; policy drop;

    ct state established,related accept
    ct state invalid drop

    # Clients may reach the app server on HTTPS only
    ip saddr 10.0.30.0/24 ip daddr 10.0.20.10 tcp dport 443 accept

    # The app server may reach the database, nothing else may
    ip saddr 10.0.20.10 ip daddr 10.0.20.20 tcp dport 5432 accept

    # IoT gets internet, never the inside
    ip saddr 10.0.40.0/24 ip daddr 10.0.0.0/8 drop
    ip saddr 10.0.40.0/24 accept

    log prefix "fw-drop: " limit rate 5/second
  }
}
```

The `policy drop` on the chain is the whole design; every accept below it is an exception you chose. The final `log` rule catches what the policy dropped, rate limited so a scan cannot fill your disk.

Verify with counters rather than assumptions:

```bash
sudo nft list ruleset
sudo nft -a list chain inet filter forward
```

A working ruleset shows non-zero packet counts on the rules you expect traffic to match and a growing count on the drop policy. Then test the negative case explicitly, because a rule that was never exercised has never been tested:

```bash
# From an IoT-VLAN host, this must fail
nc -zv -w 3 10.0.20.20 5432
```

Correct output is a timeout, and a matching `fw-drop:` line in the router's log with the source address of the IoT host. If you get `succeeded`, your rule order is wrong: nftables evaluates rules top to bottom and the first match wins, so a broad accept placed above a specific drop silently defeats it.

## Common mistakes

**Treating a VLAN as a security boundary.** Two VLANs on the same router with no ACL between them are one network with extra configuration. The control is the filter on the routed interface. If you cannot point at the rule, there is no boundary.

**Rules that only filter inbound.** Outbound filtering is what stops a compromised host from fetching its second stage and exfiltrating data. It is also the rule set nobody writes, because everything works without it.

**A management network you can reach from everywhere.** Building a management VLAN and then permitting the entire trusted network to route into it recreates the original problem with more steps. Force it through a jump host and log the sessions.

**Logging to the box you are trying to protect.** Local logs on a compromised host are attacker-controlled. Ship them off immediately, and make the log collector a system that the hosts sending to it cannot log into.

**Unsynchronised clocks.** Every incident timeline is built from timestamps. If your switch, firewall, and servers disagree, you cannot establish what happened before what, and the investigation stalls on a problem that NTP would have solved for free.

## References

- https://csrc.nist.gov/pubs/sp/800/207/final
- https://www.rfc-editor.org/rfc/rfc4949
- https://www.rfc-editor.org/rfc/rfc5424
- https://www.rfc-editor.org/rfc/rfc7011
- https://owasp.org/www-project-top-ten/
- https://en.wikipedia.org/wiki/Defense_in_depth_(computing)
