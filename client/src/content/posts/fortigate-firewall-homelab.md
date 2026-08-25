
## Why Fortinet

You want a real firewall in front of your lab, something that segments VLANs and enforces policy rather than a consumer router with a checkbox labelled "firewall". The used enterprise market makes that affordable, and then you discover the part nobody mentions: which capabilities still work on a secondhand unit and which quietly stop.

I chose a FortiGate firewall for my homelab because Fortinet is widely used in enterprise environments, and learning it on real hardware translates directly to professional skills. The FortiOS interface is intuitive once you learn it, and the documentation is thorough.

I picked up a FortiGate 60F, which is designed for small office deployments but has more than enough throughput for a homelab. It supports hardware-accelerated firewall inspection, VPN, IPS (Intrusion Prevention System), and web filtering.

## What a used unit does and does not give you

This is the thing to understand before you buy anything, because it determines what you are actually getting.

Routing, firewall policy, NAT, VLAN sub-interfaces, VPN, logging and the whole CLI are functions of the operating system on the box. They work regardless of subscription state, and they are the majority of what a lab needs.

The services that depend on Fortinet's threat intelligence are different. IPS signatures, antivirus definitions, web filtering categories and application control all require an active FortiGuard subscription to keep receiving updates. A unit whose contract lapsed two years ago will still let you enable IPS, and the signatures it matches against will be two years old. That is not the same as no protection, but it is not what the feature list implies either, and the box does not shout about it. Check the subscription state on day one under the system dashboard, and be honest with yourself about whether stale signatures are the security control you thought you were getting.

Firmware is the other consideration. Downloading FortiOS images is tied to a registered device and a support entitlement, so a unit still registered to a previous owner is a unit you may not be able to patch. Ask about registration status before money changes hands, not after.

## Initial setup

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

That block is doing more than it looks like. `set interface "internal"` makes this a sub-interface riding on a physical port, and `set vlanid 10` means frames for this network arrive tagged with VLAN ID 10 in the 802.1Q header. This is the router-on-a-stick pattern: one physical link carries every VLAN as tagged traffic, and the firewall terminates each one as a separate logical interface with its own gateway address and its own policies.

The corresponding switch port has to be configured as a trunk carrying those VLAN IDs, or nothing works. This is where most first attempts fail, and the symptom is a VLAN that pings its own gateway but cannot reach anything, or an interface that never sees a single packet.

`set allowaccess ping https ssh` controls which management protocols answer on this interface. Be deliberate about it. This list, not a firewall policy, is what determines whether someone on a given VLAN can reach the firewall's own login page. Management belongs on the management VLAN and nowhere else, and the WAN interface should have an empty or near-empty allowaccess list.

Each VLAN also needs addresses handed out, and letting the FortiGate do it keeps one fewer service in the dependency chain:

```
config system dhcp server
  edit 1
    set interface "VLAN10-Mgmt"
    set default-gateway 10.0.10.1
    set netmask 255.255.255.0
    set dns-service specify
    set dns-server1 10.0.20.10
    config ip-range
      edit 1
        set start-ip 10.0.10.100
        set end-ip 10.0.10.200
      next
    end
  next
end
```

## Confirming it actually came up

`get system interface` is the check, and the fields that matter are the link state and the address:

```
name: VLAN10-Mgmt  mode: static  ip: 10.0.10.1 255.255.255.0  status: up
        vdom: root  type: vlan  interface: internal  vlanid: 10
        allowaccess: ping https ssh
```

`status: up` on a VLAN sub-interface only means the underlying physical port has link. It says nothing about whether the switch is tagging correctly. To prove that, watch for tagged frames arriving:

```
diagnose sniffer packet internal "vlan 10" 4 20 l
```

If that prints nothing while a client on VLAN 10 is generating traffic, the problem is the switch trunk, not the firewall. If it prints packets and the client still cannot pass traffic, the problem is policy or routing, and the debug flow tool will name the rule.

## Firewall policies

FortiGate firewall policies are evaluated top-to-bottom. Each policy specifies source interface, destination interface, source address, destination address, service, and action (accept or deny). I created explicit policies for every allowed traffic flow and have an implicit deny-all at the bottom.

The key policies in my setup allow management traffic to reach all VLANs, server-to-internet traffic for updates and external services, and user-to-server traffic for specific services. Everything else is denied by default.

One mechanism worth knowing early: the firewall is stateful. Allowing users to reach a server on TCP 443 automatically permits the server's replies, because the reply matches an entry in the session table rather than being evaluated against the policy list. You never write a return rule. If you think you need one, something else is wrong, usually routing.

## Logging and monitoring

FortiGate logs every session that matches a firewall policy. I review these logs regularly to understand traffic patterns and catch anything unexpected. The FortiView dashboard gives real-time visibility into what is happening on the network, including top talkers, most-used applications, and threat detections.

Two additions make the logs genuinely useful rather than decorative. Log the denies, because a firewall that silently drops traffic looks identical to a DNS problem or a dead host, and the implicit deny at the bottom of the list is where you learn which service you forgot to write a rule for. And send logs off the box to a syslog collector, because local storage on a small appliance is limited, rotates quickly, and lives on the same device an attacker would want to tidy up.

## What breaks

**Hardware offload hiding your traffic.** This one costs people entire afternoons. Once a session is established, the network processor can take over forwarding it, and offloaded packets never reach the CPU. Your packet sniffer and your debug flow trace go quiet even though traffic is clearly flowing, and it looks like the box has stopped seeing the connection. It has not. Set `auto-asic-offload disable` on the policy you are troubleshooting, do the capture, then set it back. Forgetting to set it back leaves you with a policy that will not accelerate and no memory of why.

**Native VLAN mismatch on the trunk.** The switch's native VLAN is sent untagged. If the FortiGate expects everything tagged and the switch is passing one VLAN untagged, that VLAN silently disappears while every other one works. A partial failure is the tell: when one VLAN out of six is broken, look at tagging before you look at policy.

**Double NAT from the ISP modem.** Leave the ISP device in router mode and you have two layers of NAT, private addressing on the WAN interface of your firewall, and inbound connections that cannot work. Put the ISP device in bridge or modem-only mode so the FortiGate holds the public address, and check by looking at the WAN interface address: an address in the RFC 1918 private ranges means you are behind another router.

**Management access left open on WAN.** `set allowaccess ping https ssh` on the WAN interface publishes your login page to the internet, and it will be found within hours. Nothing warns you. Audit every interface's allowaccess list, and use trusted host restrictions on the admin account so even a correct password from the wrong source address is refused.

**Locking yourself out mid-change.** Reconfigure an interface or a policy that carries your own SSH session and you can cut the connection with the change half applied. Take a config backup first, make interface changes from the console port or from a VLAN the change does not touch, and know that the backup is plain text and diffs cleanly against the next one.

## What I have learned

Working with a FortiGate taught me how enterprise firewall management actually works. Writing policies forces you to think about traffic flows explicitly. You cannot just allow everything and hope for the best. You have to understand what should be allowed, what should be denied, and why.

The IPS features have also caught real threats. Even in a homelab, there is scanning and probing from the internet, and having a device that detects and blocks it gives you visibility into what is actually happening on your perimeter.

The broader lesson is that the value is in the discipline, not the logo on the box. A segmented network with documented flows and logged denials would be worth building on any platform. What the enterprise hardware adds is that it makes you do it properly, because it does not offer a shortcut where everything is allowed by default.

## References

- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc3022
- https://csrc.nist.gov/pubs/sp/800/41/r1/final
- https://en.wikipedia.org/wiki/Unified_threat_management
- https://www.tcpdump.org/manpages/pcap-filter.7.html
