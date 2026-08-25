
## Stage 1: Consumer Router

Like most people, I started with the router my ISP provided. A single device handled routing, switching, WiFi, DHCP, DNS, and firewall. It worked fine for basic internet access, but it was a black box. I could not configure VLANs, could not see detailed traffic logs, and had no visibility into what was happening on my network.

Two things about that box are worth spelling out, because they explain why the upgrade path goes the way it does.

The first is that "no visibility" is a hard wall, not an inconvenience. When something is slow, the diagnostic questions are which interface is dropping frames, how full the NAT table is, and what the CPU is doing. A consumer router answers none of them.

The second is CGNAT, and it is the one that surprises people who think the problem is only their side of the wire. A growing number of ISPs no longer hand out a public IPv4 address at all. They give you an address from 100.64.0.0/10, the shared address space RFC 6598 set aside for carrier-grade NAT, and translate again on their side. If your WAN interface shows a 100.64.x.x address, port forwarding will never work regardless of what you configure, because the public address is not yours and thousands of subscribers share it. There is no fix at your end. The options are asking the ISP for a public address, using IPv6 (which usually is delegated properly), or terminating an outbound tunnel such as WireGuard or Tailscale on something you control. Check this before you spend a weekend debugging your own firewall rules.

If you put your own router behind the ISP box without putting the ISP box in bridge or passthrough mode, you get double NAT: two layers of translation, two private ranges from RFC 1918, and inbound connections that die at the outer box. It works for browsing and breaks everything else. Bridge mode first, then build.

## Stage 2: Managed Switch and Separate Router

The first upgrade was adding a managed switch and replacing the ISP router with a dedicated device. Suddenly I could create VLANs, monitor port statistics, and configure trunks. This was the moment I went from using a network to understanding how networks work.

The managed switch taught me more about networking in a month than I had learned in the previous year. Being able to see MAC address tables, VLAN assignments, and port counters in real time made abstract concepts concrete.

The mechanism underneath all of that is IEEE 802.1Q, which inserts a 4-byte tag into the Ethernet header. Twelve of those bits are the VLAN ID, and since 0 and 4095 are reserved, you get 4094 usable VLANs. The tag also pushes the maximum frame from 1518 to 1522 bytes, which is why some older equipment chokes on tagged traffic and calls the result a giant frame error.

Three things go wrong here, in roughly this order:

**Native VLAN mismatch.** A trunk carries one VLAN untagged, the native VLAN. If switch A calls it VLAN 1 and switch B calls it VLAN 99, traffic from those two VLANs silently merges. Nothing errors. Two networks you believe are separate are now one, and you find out months later. Set the native VLAN explicitly on both ends of every trunk, make it an unused VLAN, and never leave it as VLAN 1. That last part is also the defense against double-tagging VLAN hopping, where a crafted frame with two tags escapes into another VLAN when the switch strips the outer one.

**DHCP stops working the moment you add a VLAN.** A `DHCPDISCOVER` is a broadcast, and broadcasts do not cross a layer 3 boundary. A client in the new VLAN sits there with an APIPA address while the DHCP server two VLANs away never hears it. The answer is a DHCP relay, configured on the router or the SVI as `ip helper-address`, which unicasts the request to the server and populates the giaddr field so the server knows which scope to answer from. RFC 2131 describes the whole exchange, and reading it once saves you from the guesswork.

**Router on a stick has a real ceiling.** If all your VLANs trunk to the router over one 1 Gbps link, every inter-VLAN packet crosses that link twice, in and back out. Effective inter-VLAN throughput is roughly 500 Mbps total, shared by every VLAN pair. On a network where clients and servers live in different VLANs, that is your file transfer speed, and no amount of switch tuning changes it. The fix is either a layer 3 switch doing inter-VLAN routing in hardware, or a faster uplink to the router.

Once you have two switches, spanning tree stops being a diagram in a textbook. Default bridge priority is 32768, and the bridge ID is priority plus MAC address, so with everything at defaults the switch with the lowest MAC becomes root. That is usually the oldest, slowest device in the building, and now all your traffic routes through it. Set the priority explicitly on the switch you want as root. Also know the timers: classic 802.1D takes 30 seconds to move a port to forwarding (15 seconds listening plus 15 learning) and up to 50 seconds to recover from an indirect link failure once the 20 second max age expires. RSTP does the same job in a few seconds. If a link flap takes your network down for the better part of a minute, you are running 802.1D and should not be.

## Stage 3: Enterprise Hardware

Adding Dell PowerEdge servers was the next step. This required proper network infrastructure: more switch ports, 10GbE for storage traffic, and a firewall with real policy enforcement. I added a FortiGate for routing and security, a Cisco switch for my learning goals, and Mellanox NICs for 10GbE.

This is also when I started treating the network as infrastructure rather than an accessory. Documentation, change management, monitoring, and backups all became necessary.

The 10GbE decision has more edges than it looks. If you go with 10GBASE-T over copper, Category 6 only carries 10 Gbps for 55 metres, while Category 6A is rated for the full 100 metres because of its improved alien crosstalk performance. Inside one rack that limit never bites, but "I already have Cat6 in the walls" is not the same as "I have 10GbE in the walls." 10GBASE-T also burns noticeably more power per port than SFP+ and adds latency in the PHY, which is why storage and cluster interconnects tend to use SFP+ with direct attach copper. Passive DAC is good to about 5 metres, and beyond that you are buying active cable or optics.

The used-gear trap here is transceiver vendor locking. Many switches check the vendor ID in an SFP+ module's EEPROM and refuse anything that is not their own brand, and server NICs sometimes do the same. A perfectly good Dell-coded transceiver will be rejected by a Cisco switch and vice versa. Most platforms have an unsupported-transceiver override command, but find out whether yours does before the parts arrive.

Also budget for what nobody photographs: noise and heat. A 1U server with 40mm fans spinning up is loud enough that it cannot share a room with people. A 2U chassis with 60mm fans is dramatically quieter for the same compute.

## Stage 4: Full Lab Environment

The current state includes multiple Dell servers, a Mac Pro, enterprise networking, segmented VLANs, centralized monitoring, automated backups, and proper documentation. It is closer to a small enterprise network than a home network.

What changes at this stage is what you monitor. Up/down status is the least useful metric a switch produces. The signals that predict problems are interface error counters: CRC errors on a port mean a bad cable, a bad transceiver, or a duplex mismatch, and they appear long before the link actually fails. Input discards mean the port is congested and buffers are overflowing. Both are invisible unless you are graphing them.

The other change is that configuration becomes something you version rather than something you remember. Every device config gets exported into a git repository, and every change is a commit with a message explaining why. When something breaks after a change, `git diff` answers in seconds what would otherwise take an hour of staring at a running config.

## Mistakes I Made

- **Not labeling cables early.** I had to trace and label everything retroactively. Do it from the start.
- **Skipping documentation.** Same problem. Document as you build, not after.
- **Buying consumer-grade equipment.** I replaced cheap switches and routers multiple times before investing in enterprise hardware that did what I needed. Buy right once.
- **Not planning for power.** Adding servers without considering power draw and circuit capacity caused breaker trips. Measure before you install.

Each of those has a specific version worth stating.

Retroactive cable labeling is not just tedious, it is unreliable. Tracing a cable in a populated rack usually means unplugging one end and watching for a link light to go out, which means taking something down to learn something you should have written on a label. Label both ends at install with source device, source port, destination device, destination port.

The consumer gear problem is not that the switches were slow. It is that they had no per-port statistics, so when one link was corrupting frames there was no counter to look at. The failure presented as "the network is flaky sometimes," which is unsolvable without instrumentation. That is the real argument for managed hardware, ahead of VLANs.

On power, the number that matters is the National Electrical Code's continuous load rule: a circuit supplying a load that runs three hours or more may be loaded to only 80 percent of its rating. A 20 A 120 V circuit is 2400 VA on paper and 1920 VA in practice. Breakers also trip on inrush, so eight servers restarting simultaneously after an outage can trip a circuit that carries them all day at steady state. Stagger the power-on delays.

## What I Would Do Differently

Start with a managed switch and a firewall from the beginning. The consumer router phase taught me nothing. As soon as you have managed infrastructure, every addition builds on a solid foundation.

The honest caveat is that "managed" and "enterprise rack-mount" are not the same purchase, and conflating them costs a lot of money for no extra learning. A used 8-port managed switch and a small x86 box running pfSense or OPNsense teaches VLANs, trunking, routing, DHCP relay, firewall policy, and spanning tree just as thoroughly as a Catalyst and a FortiGate do, at a fraction of the power draw and none of the noise. If your lab lives in a bedroom, that is the correct build, not a compromise.

Buy the rack-mount servers when you have a workload that needs them: many VMs at once, real RAM capacity, out-of-band management, hot-swap drives. Buying them to learn networking is buying the wrong thing. The network skills come from the switch and the firewall, and those are the cheap parts.

## References

- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://www.rfc-editor.org/rfc/rfc6598
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc2131
- https://en.wikipedia.org/wiki/Spanning_Tree_Protocol
- https://en.wikipedia.org/wiki/Category_6_cable
