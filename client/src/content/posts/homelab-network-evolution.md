
## Stage 1: Consumer Router

Like most people, I started with the router my ISP provided. A single device handled routing, switching, WiFi, DHCP, DNS, and firewall. It worked fine for basic internet access, but it was a black box. I could not configure VLANs, could not see detailed traffic logs, and had no visibility into what was happening on my network.

## Stage 2: Managed Switch and Separate Router

The first upgrade was adding a managed switch and replacing the ISP router with a dedicated device. Suddenly I could create VLANs, monitor port statistics, and configure trunks. This was the moment I went from using a network to understanding how networks work.

The managed switch taught me more about networking in a month than I had learned in the previous year. Being able to see MAC address tables, VLAN assignments, and port counters in real time made abstract concepts concrete.

## Stage 3: Enterprise Hardware

Adding Dell PowerEdge servers was the next step. This required proper network infrastructure: more switch ports, 10GbE for storage traffic, and a firewall with real policy enforcement. I added a FortiGate for routing and security, a Cisco switch for my learning goals, and Mellanox NICs for 10GbE.

This is also when I started treating the network as infrastructure rather than an accessory. Documentation, change management, monitoring, and backups all became necessary.

## Stage 4: Full Lab Environment

The current state includes multiple Dell servers, a Mac Pro, enterprise networking, segmented VLANs, centralized monitoring, automated backups, and proper documentation. It is closer to a small enterprise network than a home network.

## Mistakes I Made

- **Not labeling cables early.** I had to trace and label everything retroactively. Do it from the start.
- **Skipping documentation.** Same problem. Document as you build, not after.
- **Buying consumer-grade equipment.** I replaced cheap switches and routers multiple times before investing in enterprise hardware that did what I needed. Buy right once.
- **Not planning for power.** Adding servers without considering power draw and circuit capacity caused breaker trips. Measure before you install.

## What I Would Do Differently

Start with a managed switch and a firewall from the beginning. The consumer router phase taught me nothing. As soon as you have managed infrastructure, every addition builds on a solid foundation.
