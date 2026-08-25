## The problem

Everything on your network can reach everything else. The smart TV can scan your NAS, a guest's laptop lands on the same broadcast domain as your servers, and there is no place to put a rule that says otherwise. VLANs are how you fix that with the switch you already own, and the configuration is small. Getting it right the first time is mostly about understanding what a tag is and where it gets added and removed.

## What VLANs actually do

A VLAN (Virtual Local Area Network) lets you split a single physical switch into multiple logical networks. Devices on different VLANs cannot communicate directly, even if they are plugged into the same switch. Traffic between VLANs has to go through a router or layer-3 switch, where you can apply firewall rules and access controls.

This is the foundation of network segmentation, and it is how every serious network separates different types of traffic.

## What the tag actually is

A VLAN is a number carried in the Ethernet frame. The 802.1Q tag is four bytes inserted after the source MAC address: two bytes of tag protocol identifier, always 0x8100, then three bits of priority, one drop-eligible bit, and twelve bits of VLAN ID.

Twelve bits is where the familiar numbers come from. VLAN 0 means "priority information only, no VLAN", and 4095 is reserved, which leaves 1 through 4094 as usable IDs. Those four extra bytes also push the maximum tagged frame to 1522 bytes, which is why some older switches need a "baby giant" setting before trunking works at full MTU.

A VLAN therefore only exists where something is reading that number. Two switches connected by a link that is not carrying tags share no VLANs, whatever their VLAN databases say.

## My VLAN layout

I run six VLANs in my homelab:

- **VLAN 10: Management.** iDRAC interfaces, switch management, UPS monitoring. Only accessible from my admin workstation.
- **VLAN 20: Servers.** Production server traffic. VMs, storage, and inter-server communication.
- **VLAN 30: User devices.** My workstations, laptops, and phones.
- **VLAN 40: IoT.** Smart home devices that have no business talking to my servers.
- **VLAN 50: Lab/Testing.** Isolated segment for experiments. Deliberately separated so a broken lab config cannot affect the rest of the network.
- **VLAN 99: Guest.** Internet-only access for visitors. No access to any internal resources.

Matching each VLAN ID to the third octet of its subnet means I can read an IP address and know which segment it belongs to without looking anything up.

## Trunk ports and access ports

The key to VLANs working is the difference between trunk ports and access ports. An access port belongs to a single VLAN and sends untagged traffic. A trunk port carries traffic from multiple VLANs, with each frame tagged with its VLAN ID.

Between my switches and router, I use trunk ports that carry all VLANs. Server ports are access ports assigned to VLAN 20. User device ports are access ports on VLAN 30. This keeps the configuration clean and predictable.

A trunk has one more property that causes more trouble than the rest of VLAN configuration combined: the native VLAN. Frames in the native VLAN cross a trunk without a tag. Both ends must agree on which VLAN that is. If one switch calls it VLAN 1 and the other calls it VLAN 10, untagged frames silently move between two segments you believed were separate, and nothing logs an error unless the switches happen to run a discovery protocol that notices.

## Configuring it

Here is the whole thing on a Cisco-style switch: one access port, one trunk to the firewall, and the VLAN definitions.

```
vlan 20
 name SERVERS
vlan 40
 name IOT
vlan 999
 name NATIVE-UNUSED

interface GigabitEthernet1/0/5
 description SERVER-01
 switchport mode access
 switchport access vlan 20
 switchport nonegotiate
 spanning-tree portfast

interface GigabitEthernet1/0/24
 description TRUNK-TO-FIREWALL
 switchport trunk encapsulation dot1q
 switchport mode trunk
 switchport trunk native vlan 999
 switchport trunk allowed vlan 10,20,30,40,50,99
 switchport nonegotiate
```

Two choices there are the security-relevant ones. The native VLAN is 999, which carries no hosts, so no untagged traffic on the trunk means anything. And `switchport nonegotiate` turns off dynamic trunk negotiation, so nothing plugged into an access port can talk the switch into making it a trunk.

Verify the access port landed where you think:

```
show vlan brief
```

```
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Gi1/0/1, Gi1/0/2
20   SERVERS                          active    Gi1/0/5, Gi1/0/6
40   IOT                              active    Gi1/0/12
999  NATIVE-UNUSED                    active
```

And that the trunk is really a trunk:

```
show interfaces GigabitEthernet1/0/24 trunk
```

```
Port        Mode  Encapsulation  Status        Native vlan
Gi1/0/24    on    802.1q         trunking      999

Port        Vlans allowed and active in management domain
Gi1/0/24    10,20,30,40,50,99
```

`trunking`, the native VLAN you configured, and your list of VLANs under "allowed and active". If the status says `not-trunking`, the port is an access port right now regardless of what the config says, and every tagged frame arriving on it is being dropped.

On a Linux host that needs to sit on a tagged VLAN directly, the equivalent is a VLAN sub-interface:

```bash
ip link add link enp1s0 name enp1s0.20 type vlan id 20
ip addr add 10.0.20.5/24 dev enp1s0.20
ip link set enp1s0.20 up
```

```bash
ip -d link show enp1s0.20 | grep vlan
```

```
    vlan protocol 802.1Q id 20 <REORDER_HDR>
```

If that line is missing, the interface exists but is not a VLAN interface and the frames are going out untagged.

## Inter-VLAN routing

Traffic between VLANs goes through my FortiGate firewall. This lets me control exactly what crosses VLAN boundaries. My management VLAN can reach everything. My server VLAN can reach the internet. My IoT VLAN can reach the internet but nothing internal. My guest VLAN is completely isolated except for internet access.

There are two shapes this takes. Router-on-a-stick puts one trunk into a router or firewall, which has a sub-interface and a gateway address per VLAN. Every packet between two VLANs travels up the trunk and back down it, so the trunk carries the traffic twice. That is fine at homelab volumes and it is what a firewall-based design like mine looks like.

The alternative is a switched virtual interface on a Layer 3 switch, where the switch itself holds the gateway address for each VLAN and routes between them in hardware at line rate. Much faster, and the tradeoff is that traffic routed inside the switch never reaches your firewall, so any rules you wanted to apply between those VLANs have to live in switch access lists instead. Pick based on where you want the policy, not on which is faster.

One thing you will need either way: a DHCP relay. A DHCP client broadcasts, and broadcasts do not leave the VLAN, so one DHCP server cannot serve six VLANs on its own. Each VLAN's router interface has to forward those requests, which is `ip helper-address` on a Cisco SVI and a per-interface relay setting on most firewalls. Without it, every VLAN except the server's own hands out nothing and clients fall back to 169.254 link-local addresses.

## Why this matters

Without VLANs, every device on your network can potentially reach every other device. A compromised IoT camera could scan your servers. A guest's infected laptop could reach your NAS. VLANs prevent this by creating boundaries that require explicit permission to cross.

It takes some effort to set up, but once it is running, you have a network that is structured, secure, and much easier to troubleshoot because traffic flows are predictable.

It is worth being honest about the limit of that protection. A VLAN is a boundary enforced by the switch, and it stops a device from reaching another segment directly. It does nothing about a device attacking others in its own VLAN, and it is not a substitute for the firewall rules at the boundary. Segmentation limits blast radius; it does not remove it.

## What breaks

**VLAN hopping through double tagging.** An attacker on an access port whose VLAN happens to be the trunk's native VLAN can send a frame with two tags. The first switch strips the outer tag, because that VLAN is native and untagged on the trunk, and forwards the frame with the inner tag still on it, landing it in a VLAN the attacker was never allowed into. This is exactly why the native VLAN should be an unused VLAN with no ports in it, as in the config above.

**Dynamic trunking left enabled.** A port with trunk negotiation on will happily become a trunk if something plugged into it asks. That turns one compromised laptop into a device with access to every VLAN on the switch. `switchport nonegotiate` on every access port, and explicit `switchport mode access` rather than leaving it on the default.

**A new switch wiping the VLAN database.** On Cisco gear running VLAN Trunking Protocol in server or client mode, a switch joining the domain with a higher configuration revision number overwrites the VLANs on every other switch. Plugging in a lab switch that once had a large VLAN database can delete production VLANs across the whole network in seconds. Set VTP to transparent mode unless you specifically want the propagation.

**Allowing every VLAN on every trunk.** The default trunk allows 1 through 4094, so a broadcast storm in the lab VLAN is carried to every switch that has a trunk. Prune each trunk to the VLANs that actually need to cross it.

**IoT devices that stop being discoverable.** This is the one that makes people give up on segmentation. Chromecasts, printers, and speakers are found by mDNS and SSDP, which are multicast and do not cross VLAN boundaries. Put the phone on VLAN 30 and the speaker on VLAN 40 and the app simply never sees the device, with no error message. The fix is an mDNS repeater or reflector on the router between exactly those two VLANs, plus the firewall rule that lets the resulting unicast traffic through.

## References

- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://en.wikipedia.org/wiki/VLAN_hopping
- https://www.rfc-editor.org/rfc/rfc5517
- https://www.rfc-editor.org/rfc/rfc2131
- https://man7.org/linux/man-pages/man8/ip-link.8.html
- https://wiki.archlinux.org/title/VLAN
