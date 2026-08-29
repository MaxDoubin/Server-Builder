
## The Attacks These Prevent

**DHCP Spoofing:** A rogue device on the network runs a DHCP server and responds to DHCP requests faster than the legitimate server. Clients receive IP addresses from the rogue server, with a gateway pointing to the attacker. All traffic flows through the attacker's device.

**ARP Poisoning:** ARP has no authentication. An attacker can send gratuitous ARP replies claiming to own any IP address, including the default gateway. Other hosts update their ARP tables and send traffic through the attacker.

Both attacks enable man-in-the-middle interception of traffic without detection.

Neither is an implementation bug. ARP was published in 1982 as RFC 826 and contains no notion of identity: a host that receives a reply for an address it asked about is expected to believe it. DHCP, specified in RFC 2131, has the same property in the other direction, since a client that has just broadcast a DHCPDISCOVER has no way to distinguish the real server's offer from anyone else's. Both protocols assume the local segment is trustworthy. DHCP snooping and Dynamic ARP Inspection are the switch enforcing that assumption on the protocols' behalf.

## DHCP Snooping

DHCP snooping builds a binding table: which MAC address received which IP address on which port. It marks ports as trusted or untrusted. DHCP server responses from untrusted ports are dropped.

```
ip dhcp snooping
ip dhcp snooping vlan 10,20,30

! Mark the uplink to the real DHCP server as trusted
interface GigabitEthernet1/0/48
  ip dhcp snooping trust

! Access ports are untrusted by default
interface range GigabitEthernet1/0/1-47
  ip dhcp snooping limit rate 15
```

Specifically, an untrusted port is not allowed to source the four server-side message types: DHCPOFFER, DHCPACK, DHCPNAK, and DHCPLEASEQUERY. A client port that sends one is either running a DHCP server or attacking you, and either way the frame does not deserve forwarding. The switch also drops a DHCPRELEASE or DHCPDECLINE whose source MAC does not match the binding for that address, which stops one host from tearing down another host's lease.

The two global commands are both required. `ip dhcp snooping` on its own enables the feature and inspects nothing. Nothing happens until `ip dhcp snooping vlan` names the [VLANs](/blog/vlan-segmentation-guide). This is the single most common reason someone configures snooping, tests it with a rogue server, and finds it does not work.

## The Binding Table Is the Whole Thing

Every entry holds a MAC, an IP, a lease time, a VLAN, and an interface. Verify it with `show ip dhcp snooping binding`. Everything downstream depends on it, which makes one detail important: by default the table lives only in RAM.

Reload the switch and the bindings are gone. If Dynamic ARP Inspection is enabled on the same VLANs, every client that still holds a perfectly valid lease now has no binding, so its ARP is dropped, and the VLAN goes dark until each client happens to renew. That renewal is at 50 percent of the lease by default, so with an eight day lease you can be looking at days of intermittent breakage.

The fix is to persist the table:

```
ip dhcp snooping database flash:/dhcp-snooping.db
ip dhcp snooping database write-delay 300
```

A TFTP or FTP URL works too, and is better on a switch whose flash you do not want to write to every five minutes. The default write delay is 300 seconds, so a reload within five minutes of the last change still loses the newest entries.

## Dynamic ARP Inspection

DAI uses the DHCP snooping binding table to validate ARP packets. If a host claims to be an IP address that DHCP snooping assigned to a different MAC, the ARP is dropped.

```
ip arp inspection vlan 10,20,30

! Uplinks and router ports must be trusted
interface GigabitEthernet1/0/48
  ip arp inspection trust

! Access ports are untrusted by default
interface range GigabitEthernet1/0/1-47
  ip arp inspection limit rate 100
```

DAI works by punting ARP frames on untrusted ports to the switch CPU for inspection, which is exactly why rate limits exist and why the default on an untrusted port is 15 packets per second whether or not you type the command. Exceed it and the port is err-disabled. The trusted side has no limit by default. If you are going to raise the limit on an access port, raise it deliberately, because the number is protecting the control plane rather than the network.

Add the optional consistency checks:

```
ip arp inspection validate src-mac dst-mac ip
```

`src-mac` and `dst-mac` compare the Ethernet header addresses against the ARP payload's sender and target hardware addresses, and `ip` rejects invalid or unexpected sender addresses such as 0.0.0.0 and 255.255.255.255. One trap: this is a single command with a keyword list, not three commands. Entering it again with only one keyword replaces the whole list rather than adding to it.

Hosts with static IP addresses have no DHCP binding, so DAI drops their ARP and they disappear from the network. Servers, printers, and the firewall itself are the usual casualties. Give them an ARP ACL:

```
arp access-list STATIC-HOSTS
  permit ip host 10.20.0.10 mac host 0050.56aa.bb01

ip arp inspection filter STATIC-HOSTS vlan 20
```

## What Breaks When You Turn This On

**Every client stops getting an address, immediately.** This is the Option 82 problem and it catches almost everyone. By default, Cisco switches running DHCP snooping insert the relay agent information option from RFC 3046 into client packets on untrusted ports, but they leave giaddr as 0.0.0.0 because the switch is not the relay. Many DHCP servers, including Windows Server and IOS itself, discard a packet that carries Option 82 with a zero giaddr, because that combination should not exist. Either turn the insertion off with `no ip dhcp snooping information option`, or tell the relay to accept it with `ip dhcp relay information trust-all` on the SVI.

**Ports err-disable after a power outage.** Hundreds of clients booting at once produce a burst of DHCP that trips a 15 pps limit. Configure automatic recovery rather than walking the building:

```
errdisable recovery cause dhcp-rate-limit
errdisable recovery cause arp-inspection
errdisable recovery interval 300
```

**A whole VLAN loses DHCP after adding a second switch.** The link between two snooping switches has to be trusted on both ends. An untrusted interswitch link drops the server's replies as they cross it, and the symptom looks exactly like a dead DHCP server.

**Rate limiting the uplink.** Do not put `ip dhcp snooping limit rate` on the trusted port toward the server. All of the site's DHCP traffic crosses it, and err-disabling that port takes the whole VLAN down.

## What These Do Not Cover

DHCP snooping and DAI protect the VLANs you name, on the switches where they are enabled, for IPv4 only. Three gaps follow from that.

An attacker on a switch that does not run snooping is unaffected, and if the link from that switch is trusted, their rogue server's replies pass straight through. The trust boundary has to be drawn at the real edge of the network, not at the edge of the switch you happened to configure.

IPv6 is untouched. There is no ARP in IPv6; address resolution and default gateway discovery both run over ICMPv6 Neighbor Discovery, and the equivalent attack is a spoofed Router Advertisement. That needs RA Guard, DHCPv6 Guard, and IPv6 Source Guard, which are separate features. A dual-stack network with DAI and no RA Guard is still trivially man-in-the-middled, and the attacker gets preference because hosts favour the IPv6 path.

Neither feature stops a host from simply sending IPv4 packets with a forged source address once it has an address. That is IP Source Guard, the third feature in the set, which uses the same binding table to filter the data plane rather than just the control messages.

## What to Watch

Both features generate logs for violations. Review these periodically. A device frequently triggering DHCP snooping violations might be misconfigured, but it could also be a malicious device. Unexpected ARP inspection violations could indicate an active attack.

`show ip arp inspection statistics vlan 20` gives per-VLAN counters for forwarded, dropped, and each class of failed validation. A steadily climbing DHCP drop count on one access port is usually a home router someone plugged in backwards, with its LAN side facing the network. A burst of ARP drops naming several IP addresses from one port is the shape of an actual poisoning attempt, because a tool sweeping the subnet claims many addresses in quick succession rather than one.

These features are lightweight and should be standard configuration on access layer switches in any environment where you do not fully trust every connected device.

## References

- https://www.rfc-editor.org/rfc/rfc826
- https://www.rfc-editor.org/rfc/rfc2131
- https://www.rfc-editor.org/rfc/rfc3046
- https://www.rfc-editor.org/rfc/rfc7513
- https://en.wikipedia.org/wiki/ARP_spoofing
- https://en.wikipedia.org/wiki/DHCP_snooping
