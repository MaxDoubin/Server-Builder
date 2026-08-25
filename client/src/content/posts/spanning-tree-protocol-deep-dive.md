
## The problem STP solves

You patch in a second cable between two switches for redundancy and the entire network dies within seconds. Every light on every switch goes solid, nothing responds, and unplugging the cable you just added fixes it instantly. That is a layer 2 loop, and understanding why it is so catastrophic is the beginning of understanding spanning tree.

Ethernet switches forward frames by MAC address. If you have two switches connected by two cables (creating a physical loop), a broadcast frame will loop forever, duplicating with each pass until the network is completely saturated. This is a broadcast storm, and it will take down your entire network in seconds.

The reason it never stops is that an Ethernet frame has no TTL. An IP packet caught in a routing loop dies when its TTL counts down; the Ethernet header has no equivalent field, so a frame that finds a loop circulates until the hardware carrying it fails. Worse, each switch floods the broadcast out every port except the one it arrived on, so a single frame multiplies at every hop.

STP (Spanning Tree Protocol) prevents this by detecting loops and blocking redundant paths at the logical level. Only one active path exists between any two network nodes, but the blocked paths are available as backups if the active path fails.

## How it works

STP elects a root bridge based on bridge priority and MAC address. Every other switch calculates the lowest-cost path to the root bridge and designates one port as the root port. Redundant ports that would create loops are put in a blocking state.

When topology changes, STP reconverges. This can take 30 to 50 seconds with classic STP (802.1D), which is why RSTP (Rapid STP, 802.1w) was developed. RSTP reconverges in seconds using negotiation between switches rather than timers.

## The bridge ID, and why priority is a strange number

The bridge ID is 8 bytes: a 2-byte priority followed by the 6-byte MAC address. Lowest wins. The default priority is 32768, which is the midpoint of the 16-bit range, chosen so administrators can move a switch in either direction.

Priority is configurable only in increments of 4096, because the low 12 bits of the field were repurposed to carry the VLAN ID. That addition, the extended system ID, lets one switch run a separate spanning tree per VLAN without a separate MAC address for each. So configure priority 4096 on VLAN 20 and the switch advertises 4116: 4096 plus the VLAN number. Seeing 4116 in `show spanning-tree` and thinking your configuration did not take is a rite of passage.

## Port roles, states, and the timers behind them

Classic STP has five port states: disabled, blocking (receives BPDUs, forwards nothing), listening (participates in the election, forwards nothing, learns nothing), learning (populates the MAC table but does not forward), and forwarding. Three timers drive the transitions, all advertised by the root so every switch uses the same values:

- **Hello time: 2 seconds.** How often the root emits a configuration BPDU.
- **Max age: 20 seconds.** How long a switch keeps believing stored BPDU information after it stops hearing from the root.
- **Forward delay: 15 seconds.** Time spent in listening, and again in learning.

That arithmetic is where the convergence figures come from. A port coming up goes 15 seconds in listening plus 15 in learning, so 30 seconds before it forwards. A failure that a switch learns about only by BPDU timeout adds max age first: 20 plus 15 plus 15 gives the 50 second worst case.

RSTP rebuilt this around explicit port roles and a proposal/agreement handshake instead of timers. It keeps root and designated, adds alternate (a backup path to the root, the RSTP equivalent of a blocked port) and backup (a redundant link to the same segment), and collapses the states to discarding, learning, and forwarding. Because a switch negotiates directly with its neighbour rather than waiting out max age, convergence on a point-to-point link is typically under a second.

## Path cost, and the two cost tables

Root port selection is by lowest cumulative path cost to the root, and cost is derived from link speed. There are two tables, and mixing them is a real source of bad topologies.

The original short (16-bit) costs from 802.1D-1998: 10 Mbit is 100, 100 Mbit is 19, 1 Gbit is 4, 10 Gbit is 2. The problem is obvious at the top end, where anything faster compresses toward 1 and the protocol loses the ability to tell links apart. The long (32-bit) costs from 802.1t give plenty of resolution: 100 Mbit is 200,000, 1 Gbit is 20,000, 10 Gbit is 2,000. Both ends of a network must agree on which table is in use, because a switch computing in the short table and a neighbour computing in the long table will disagree about which path is cheaper.

If costs tie, the tiebreakers run in order: lowest sender bridge ID, then lowest sender port ID, then lowest receiving port ID.

## What a BPDU actually is

Bridge Protocol Data Units go to the multicast destination MAC 01:80:C2:00:00:00 inside an 802.3 LLC frame. They carry the root bridge ID, the sender's bridge ID, the sender's cost to the root, the port ID, and the three timers. In classic STP only the root originates configuration BPDUs and other switches relay them; in RSTP every switch generates its own each hello interval, which is what lets a neighbour detect a dead link after three missed hellos instead of waiting out max age.

Topology Change Notifications are a separate, smaller BPDU that travels toward the root when a port changes state. The root then flags everyone to age out their MAC tables quickly. That flush is the point, and it is also why unnecessary topology changes hurt: an emptied MAC table means unknown-unicast flooding until it refills.

## A worked example you can run on a Linux box

You do not need switch hardware to watch this work. The Linux bridge implements STP:

```bash
sudo ip link add name br0 type bridge stp_state 1 priority 4096
sudo ip link set br0 up
sudo ip link set enp2s0 master br0
sudo ip link set enp3s0 master br0
```

Check who won the election and what each port decided:

```bash
cat /sys/class/net/br0/bridge/bridge_id
cat /sys/class/net/br0/bridge/root_id
bridge link show
```

If this bridge is the root, `bridge_id` and `root_id` are identical. Port states appear in the `bridge link` output:

```
3: enp2s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br0 state forwarding priority 32 cost 4
4: enp3s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 master br0 state blocking priority 32 cost 4
```

One forwarding and one blocking on a pair of ports facing the same neighbour is exactly right: the loop is broken logically while the cable stays in place. Pull the forwarding link and the blocking port should transition to forwarding on its own. The timer files in that sysfs directory (`forward_delay`, `max_age`, `hello_time`) are in hundredths of a second, so 1500 means 15 seconds.

## Common STP problems

**Suboptimal root bridge election:** If you do not manually configure bridge priorities, the switch with the lowest MAC address becomes root. This might not be the most centrally connected or highest-capacity switch. Always set bridge priority explicitly.

```
spanning-tree vlan 1 priority 4096
```

Older switches frequently have lower MAC addresses than new ones, because address blocks are assigned over time. The practical effect is that the oldest, slowest box in the rack tends to win an unmanaged election and pull every path through itself.

**TCN (Topology Change Notifications) flooding:** Every time a port changes state, STP flushes MAC tables. In a large network with frequently changing ports (like access ports with PCs), this can cause excessive flooding. PortFast and BPDU Guard on access ports solve this.

**Inferior paths surviving:** With complex topologies, STP may choose a slower path as the root port if costs are not tuned properly.

## Best practices

Enable Rapid PVST+ (or MSTP in larger environments). Set explicit bridge priorities so your core switches are root. Enable PortFast on all access ports and BPDU Guard to protect against unauthorized switches. Document your STP topology so you understand which paths are active and which are blocking.

Two additions worth the time. Set the secondary root explicitly too, so a failure of the primary gives a topology you chose rather than one the MAC addresses chose. And enable Root Guard on ports facing switches you do not control: it puts the port into a root-inconsistent state if a superior BPDU arrives, which stops a switch someone plugged in under a desk from becoming root.

## What breaks

**Unidirectional links.** Fiber where transmit works and receive does not is the nightmare case: the blocking side stops hearing BPDUs, concludes the path is gone, and starts forwarding into a loop the other side is still transmitting on. STP cannot detect this alone. Loop Guard, which holds a port blocking when expected BPDUs stop arriving without the link dropping, and UDLD, which verifies bidirectionality directly, exist for this failure.

**BPDU Filter confused with BPDU Guard.** They sound similar and do opposite things. BPDU Guard shuts a port down when a BPDU arrives, which is what you want on an access port. BPDU Filter stops the port from sending or processing BPDUs at all, which makes the port invisible to spanning tree and is a loop generator if anything but an end host is on the other end.

**PortFast on a port that is not an edge port.** PortFast skips listening and learning and goes straight to forwarding. On a port with a switch or a bridging hypervisor behind it, that means forwarding for 30 seconds before spanning tree gets around to blocking, which is 30 seconds of storm. Always pair PortFast with BPDU Guard.

**MST region mismatch.** MSTP switches share a region only when their configuration name, revision number, and complete VLAN-to-instance mapping match exactly. One typo in the region name and the switch becomes its own region, its internal topology is hidden, and the boundary behaviour rarely matches what anyone expected.

**Adding a VLAN and forgetting it has its own tree.** With per-VLAN spanning tree, every new VLAN is a new election. Configure priorities across the VLAN range, not on the individual VLANs you happen to remember, or the new one elects a root by MAC address and its traffic takes a completely different physical path than the rest.

## References

- https://en.wikipedia.org/wiki/Spanning_Tree_Protocol
- https://en.wikipedia.org/wiki/Multiple_Spanning_Tree_Protocol
- https://en.wikipedia.org/wiki/Broadcast_radiation
- https://www.kernel.org/doc/html/latest/networking/bridge.html
- https://man7.org/linux/man-pages/man8/bridge.8.html
- https://wiki.archlinux.org/title/Network_bridge
