
## The Problem STP Solves

Ethernet switches forward frames by MAC address. If you have two switches connected by two cables (creating a physical loop), a broadcast frame will loop forever, duplicating with each pass until the network is completely saturated. This is a broadcast storm, and it will take down your entire network in seconds.

STP (Spanning Tree Protocol) prevents this by detecting loops and blocking redundant paths at the logical level. Only one active path exists between any two network nodes, but the blocked paths are available as backups if the active path fails.

## How It Works

STP elects a root bridge based on bridge priority and MAC address. Every other switch calculates the lowest-cost path to the root bridge and designates one port as the root port. Redundant ports that would create loops are put in a blocking state.

When topology changes, STP reconverges. This can take 30 to 50 seconds with classic STP (802.1D), which is why RSTP (Rapid STP, 802.1w) was developed. RSTP reconverges in seconds using negotiation between switches rather than timers.

## Common STP Problems

**Suboptimal root bridge election:** If you do not manually configure bridge priorities, the switch with the lowest MAC address becomes root. This might not be the most centrally connected or highest-capacity switch. Always set bridge priority explicitly.

```
spanning-tree vlan 1 priority 4096
```

**TCN (Topology Change Notifications) flooding:** Every time a port changes state, STP flushes MAC tables. In a large network with frequently changing ports (like access ports with PCs), this can cause excessive flooding. PortFast and BPDU Guard on access ports solve this.

**Inferior paths surviving:** With complex topologies, STP may choose a slower path as the root port if costs are not tuned properly.

## Best Practices

Enable Rapid PVST+ (or MSTP in larger environments). Set explicit bridge priorities so your core switches are root. Enable PortFast on all access ports and BPDU Guard to protect against unauthorized switches. Document your STP topology so you understand which paths are active and which are blocking.
