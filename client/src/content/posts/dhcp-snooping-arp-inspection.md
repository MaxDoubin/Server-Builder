
## The Attacks These Prevent

**DHCP Spoofing:** A rogue device on the network runs a DHCP server and responds to DHCP requests faster than the legitimate server. Clients receive IP addresses from the rogue server, with a gateway pointing to the attacker. All traffic flows through the attacker's device.

**ARP Poisoning:** ARP has no authentication. An attacker can send gratuitous ARP replies claiming to own any IP address, including the default gateway. Other hosts update their ARP tables and send traffic through the attacker.

Both attacks enable man-in-the-middle interception of traffic without detection.

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

## What to Watch

Both features generate logs for violations. Review these periodically. A device frequently triggering DHCP snooping violations might be misconfigured, but it could also be a malicious device. Unexpected ARP inspection violations could indicate an active attack.

These features are lightweight and should be standard configuration on access layer switches in any environment where you do not fully trust every connected device.
