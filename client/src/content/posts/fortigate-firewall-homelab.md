
## Why Fortinet

I chose a FortiGate firewall for my homelab because Fortinet is widely used in enterprise environments, and learning it on real hardware translates directly to professional skills. The FortiOS interface is intuitive once you learn it, and the documentation is thorough.

I picked up a FortiGate 60F, which is designed for small office deployments but has more than enough throughput for a homelab. It supports hardware-accelerated firewall inspection, VPN, IPS (Intrusion Prevention System), and web filtering.

The throughput numbers on the datasheet are worth reading carefully, because they explain how the box actually works. Fortinet rates the 60F at 10 Gbps of raw stateful firewall throughput, 1.4 Gbps with IPS enabled, 1 Gbps in NGFW mode, and 700 Mbps with the full threat protection stack turned on. That is not marketing inconsistency. The 60F's SoC4 processor offloads plain firewall sessions to hardware, but **the moment a policy has any security profile attached, that session can no longer be offloaded and the general-purpose CPU handles every packet.** A fourteen-fold drop between line-rate filtering and full inspection is the price of inspection, and every vendor pays some version of it. For a homelab on a residential connection none of this matters. On a gigabit fiber line with deep inspection on every policy, the 60F is at its limit.

There is one honest downside to buying used Fortinet gear, and it is the thing nobody mentions in the "cheap enterprise firewall" videos. IPS signatures, antivirus definitions, web filtering categories, and application control all come from FortiGuard, which is a paid subscription. A 60F with an expired contract still routes, still does stateful firewalling, still does VPN and VLANs and logging, and still runs the IPS engine, but the signature database is frozen at whatever date the contract lapsed. If you want current threat intel you are paying for it annually. Decide that before you buy.

## Initial Setup

The first thing I did was configure the interfaces. The WAN port connects to my ISP modem. The internal ports are configured as a switch group that connects to my core switch. I also created sub-interfaces for each VLAN, so the FortiGate handles inter-VLAN routing and firewall policy enforcement.

```
config system interface
  edit "VLAN10-Mgmt"
    set vdom "root"
    set ip 10.0.10.1 255.255.255.0
    set allowaccess ping https ssh
    set interface "internal"
    set vlanid 10
  next
end
```

The `vlanid` can be anything from 1 to 4094, which is the range 802.1Q allows with its 12-bit VLAN identifier field. Leave VLAN 1 alone as a matter of habit, and remember that the native VLAN on the trunk arrives untagged, so it lands on the parent interface rather than on any sub-interface.

Two things will stop you cold on a 60F specifically. First, the LAN ports ship configured as a hardware switch, and **you cannot create a VLAN sub-interface on a port that is a member of a switch group.** The GUI simply will not offer the port in the dropdown, with no explanation. You have to remove the port from the switch (or build the VLAN on the switch interface itself) before it becomes available. Second, `set allowaccess https ssh` on a WAN interface publishes your admin login to the internet. Anything on the perimeter should have `allowaccess` reduced to nothing, or at most `ping`, and administrative access should be restricted with `set trusthost1 10.0.10.0 255.255.255.0` on the admin account so even a leaked password is unusable from off-net.

## Firewall Policies

FortiGate firewall policies are evaluated top-to-bottom. Each policy specifies source interface, destination interface, source address, destination address, service, and action (accept or deny). I created explicit policies for every allowed traffic flow and have an implicit deny-all at the bottom.

The key policies in my setup allow management traffic to reach all VLANs, server-to-internet traffic for updates and external services, and user-to-server traffic for specific services. Everything else is denied by default.

First match wins, and new policies are appended to the bottom of the list. That is the source of the most common "my rule does not work" ticket in FortiOS: you add a specific deny below an existing broad allow, and it never evaluates. Reorder with `move`, and check your work in **By Sequence** view rather than the default Interface Pair view. Interface Pair view groups policies by the interfaces they connect and hides the true global ordering, so two policies that look adjacent on screen can be separated by twenty others in the real evaluation order.

Three more things beginners get wrong, in rough order of how much time they waste:

**Forgetting to enable NAT on the outbound policy.** Traffic matches the policy, leaves the WAN interface with a private source address from RFC 1918, and never comes back. The session table shows the session, the logs show it as allowed, and nothing works. NAT is a per-policy checkbox in the default configuration, not a global setting.

**Enabling a security profile globally and expecting it to apply.** IPS, antivirus, and web filtering only inspect traffic on policies where you explicitly attached the profile. An IPS profile that exists but is not referenced by any policy inspects exactly zero packets.

**Turning on deep inspection without deploying the CA certificate.** Certificate inspection only reads the SNI and the certificate metadata, which is cheap and breaks nothing. Deep inspection terminates the TLS session, re-encrypts it with the FortiGate's own CA, and requires that CA to be installed and trusted on every client. Skip that step and every browser in the house throws certificate warnings, and anything using certificate pinning (most mobile apps, Windows Update, a lot of package managers) fails outright with errors that look nothing like a firewall problem.

When a flow is not doing what the policy list says it should, stop guessing and trace it:

```
diagnose debug flow filter addr 10.0.20.55
diagnose debug flow show function-name enable
diagnose debug flow trace start 20
diagnose debug enable
```

That prints the policy ID that matched, the route lookup, the NAT decision, and the reason for any drop. One caveat that costs people hours: `diagnose sniffer packet` cannot see traffic that has been offloaded to the SoC, so a sniffer on a fast-path session shows only the first few packets and then silence. Run `set auto-asic-offload disable` on the policy while you are troubleshooting, and remember to put it back.

## Logging and Monitoring

FortiGate logs every session that matches a firewall policy. I review these logs regularly to understand traffic patterns and catch anything unexpected. The FortiView dashboard gives real-time visibility into what is happening on the network, including top talkers, most-used applications, and threat detections.

Two defaults undercut this on a 60F. The first is that each policy's "Log Allowed Traffic" setting defaults to Security Events rather than All Sessions, so a policy that is happily passing traffic and generating no security hits produces no log lines at all. You have to set `logtraffic all` on the policies you actually want visibility into, and accept the extra volume. The second is that the 60F has no internal storage for logs. Logging goes to memory, which on an entry-level unit means a few thousand entries at best, wrapping constantly and lost entirely on reboot.

That makes external logging mandatory rather than optional if you want to investigate anything more than an hour old. FortiAnalyzer is the native answer; a plain syslog server is the free one:

```
config log syslogd setting
  set status enable
  set server "10.0.10.20"
  set port 514
  set facility local7
end
```

FortiOS speaks standard syslog, so anything that ingests RFC 5424 (rsyslog, Graylog, a Loki stack) will take it. While you are in there, confirm that the implicit deny policy at the bottom of the list has its violation logging enabled. Denied traffic is the most interesting traffic on the network, and by default it can pass without leaving a trace, which produces the very confusing situation where something is clearly being blocked and the logs are empty.

## What I Have Learned

Working with a FortiGate taught me how enterprise firewall management actually works. Writing policies forces you to think about traffic flows explicitly. You cannot just allow everything and hope for the best. You have to understand what should be allowed, what should be denied, and why.

The IPS features have also caught real threats. Even in a homelab, there is scanning and probing from the internet, and having a device that detects and blocks it gives you visibility into what is actually happening on your perimeter.

The discipline that transferred best is the one NIST spells out in SP 800-41: a firewall ruleset should be default-deny, every rule should exist for a documented reason, and the ruleset should be reviewed periodically because rules accumulate and nobody ever deletes them. In a homelab that review takes fifteen minutes. In a real environment it is the difference between a firewall and a very expensive router. The other lesson is that most of what looks like a firewall problem is a routing problem, a NAT problem, or a policy-ordering problem, and `diagnose debug flow` will tell you which one in about ten seconds.

## References

- https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-60f-series.pdf
- https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/803637/firewall-policies
- https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/565222/vlans
- https://docs.fortinet.com/document/fortigate/7.4.0/best-practices/598577/ssl-tls-deep-inspection
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc5424
