## The problem

You brought up a VXLAN interface on two hosts, the tunnel says it is up, and either nothing passes at all or small pings work while any real transfer hangs. Both symptoms have short explanations, and both come from the same place: VXLAN is a tunnel, and a tunnel has a port number and a size budget that the interface state does not tell you about. Here is what the protocol actually does and how to check each piece.

## Where traditional VLANs run out

Traditional VLANs are limited to 4096 IDs. In a cloud or large multi-tenant datacenter environment, you need isolation for thousands or millions of tenants. You also need to stretch Layer 2 networks across physical boundaries, which traditional VLANs cannot do without complex MPLS configurations.

There is a second limit that bites before the ID space does. A stretched Layer 2 domain shares one spanning tree, and spanning tree prevents loops by blocking links. In a fabric with many equal-cost paths, that wastes half of what you paid for. An overlay lets you run the underlay as a routed network where every link forwards.

## What VXLAN does

VXLAN (Virtual Extensible LAN) encapsulates Layer 2 Ethernet frames inside UDP packets. This allows you to carry a virtual Layer 2 network over a standard Layer 3 (IP) infrastructure. The VXLAN Network Identifier (VNI) supports 16 million unique segments, which eliminates the VLAN scalability problem.

A VXLAN Tunnel Endpoint (VTEP) handles encapsulation and decapsulation. When a VM sends a frame, the VTEP wraps it in a VXLAN UDP packet and sends it to the destination VTEP, which unwraps it and delivers it to the destination VM.

The VNI is a 24-bit field, so the exact number of segments is 16,777,216 rather than a round 16 million. VXLAN is specified in RFC 7348.

## The encapsulation, byte by byte

The overhead is the number you have to remember, because it determines your MTU.

An encapsulated frame carries an outer Ethernet header (14 bytes), an outer IPv4 header (20 bytes), a UDP header (8 bytes), and the VXLAN header (8 bytes). That is 50 bytes added to the original frame. Over an IPv6 underlay the outer header is 40 bytes instead of 20, making the total 70. If the outer frame also carries an 802.1Q tag, add 4 more.

So on a standard 1500 byte underlay, the largest inner frame that fits without fragmentation is 1450 bytes. Either raise the underlay MTU to at least 1550 and leave the overlay at 1500, which is what datacenter fabrics do, or drop the overlay MTU to 1450 and accept it.

Two fields in the outer headers do useful work. The UDP destination port identifies the traffic as VXLAN; IANA assigned 4789 for it. The UDP source port is not meaningful as a port at all: the sending VTEP fills it with a hash of the inner frame's headers, purely so that ECMP hashing in the underlay spreads different inner flows across different physical paths. Without it, every tunnelled flow between two VTEPs would look like one conversation and pin to a single link.

## How VTEPs work

VTEPs can be physical switches (hardware VTEPs) or software-based (like Open vSwitch). Each hypervisor running VXLAN acts as a VTEP.

```bash
# Create a VXLAN interface on Linux
ip link add vxlan100 type vxlan id 100 dstport 4789 remote 192.168.1.2 local 192.168.1.1 dev eth0
ip link set vxlan100 up
ip addr add 10.100.0.1/24 dev vxlan100
```

Set the MTU explicitly at the same time, because the kernel will not work it out for you:

```bash
ip link set vxlan100 mtu 1450
```

Then check what you actually built:

```bash
ip -d link show vxlan100
```

```
7: vxlan100: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue state UNKNOWN
    link/ether 6a:1f:2c:44:8d:e0 brd ff:ff:ff:ff:ff:ff
    vxlan id 100 remote 192.168.1.2 local 192.168.1.1 dev eth0 srcport 0 0
    dstport 4789 ttl auto ageing 300 udpcsum noudp6zerocsumtx noudp6zerocsumrx
```

Read three things off that line. `dstport 4789` is the one people get wrong, for reasons covered below. `srcport 0 0` means the kernel picks the source port from the ephemeral range using the inner-flow hash, which is what you want. `ageing 300` is the forwarding database timeout in seconds.

The forwarding database is where the tunnel keeps its remote MAC entries:

```bash
bridge fdb show dev vxlan100
```

```
00:00:00:00:00:00 dst 192.168.1.2 self permanent
```

The all-zeros entry is not a real MAC. It is the default remote, meaning "anything I do not have a specific entry for, send to 192.168.1.2". As traffic flows, real MAC addresses appear alongside it with their own destinations.

Finally, prove encapsulation is happening by watching the underlay interface while you ping across the overlay:

```bash
tcpdump -ni eth0 'udp port 4789'
```

```
12:04:11.512340 IP 192.168.1.1.49876 > 192.168.1.2.4789: VXLAN, flags [I] (0x08), vni 100
IP 10.100.0.1 > 10.100.0.2: ICMP echo request, id 4, seq 1, length 64
```

Two lines per packet: the outer UDP packet, then the inner frame decoded from inside it. `vni 100` confirms the segment. Outer packets leaving with no reply means the problem is between the VTEPs; nothing at all means it is local.

Then test the size budget, which the ping above will not catch:

```bash
ping -M do -s 1422 10.100.0.2
```

1422 bytes of payload plus 8 bytes of ICMP header plus 20 bytes of IP header is exactly 1450, and `-M do` forbids fragmentation. If that succeeds and `-s 1423` fails, your MTU is set correctly. If both fail while a small ping works, your MTU is wrong somewhere in the path.

## Flood-and-learn versus a control plane

A VTEP has to answer one question before it can send anything: which remote VTEP holds the MAC address I am looking for? There are three ways to answer it.

Static configuration, as in the example above, works for two endpoints and no further.

Multicast flood-and-learn maps each VNI to an underlay multicast group. Broadcast, unknown-unicast, and multicast frames go to the group, every VTEP in that VNI receives them, and each one learns source MACs from what arrives. It works, and it requires multicast routing in the underlay, which is the part most people do not have.

Ingress replication, also called head-end replication, avoids multicast: the sending VTEP unicasts a copy of every flooded frame to each remote VTEP, at the cost of duplicating that traffic once per peer.

## BGP EVPN control plane

Early VXLAN implementations used multicast or flood-and-learn for MAC address discovery, which does not scale well. BGP EVPN (Ethernet VPN) provides a control plane for VXLAN, distributing MAC and IP address information via BGP rather than flooding.

BGP EVPN is the standard in modern datacenter fabrics (Cisco ACI, Arista, Juniper). It enables scalable, efficient VXLAN deployments with millisecond failover.

The mechanism is BGP route advertisements carrying Ethernet information. EVPN is defined in RFC 7432 and its use as a VXLAN control plane in RFC 8365. Three route types cover most of what you will see: type 2 advertises a MAC address, optionally with its IP, so every VTEP learns the location of every host without flooding; type 3 tells peers which VTEPs are members of a VNI, which is how ingress replication lists get built automatically; type 5 advertises an IP prefix for routing between segments.

Because every VTEP knows every MAC and IP in the segment, it can answer ARP locally instead of flooding, which removes most of the broadcast traffic that made stretched Layer 2 painful.

## Where you see VXLAN

AWS VPCs, Azure virtual networks, and most cloud networking platforms are built on VXLAN or similar overlay technologies. Kubernetes networking (Flannel, Calico, Cilium) frequently uses VXLAN for pod-to-pod communication. Understanding VXLAN is increasingly essential for anyone working in modern infrastructure.

The Kubernetes case is worth a specific note because the port numbers differ. Flannel's VXLAN backend uses UDP 8472 by default, and Cilium's VXLAN mode does too, while Calico's VXLAN uses 4789. If you write a firewall rule for one and deploy the other, pods come up healthy and cannot talk to pods on other nodes. It is also where you meet the MTU problem, since the CNI subtracts its overhead from an assumed node MTU.

## What breaks

**The port number.** This is the first thing to check and the least obvious. IANA assigned 4789 to VXLAN, but the Linux kernel's VXLAN driver still defaults to 8472, the value Linux used before the number was standardised. Create an interface without `dstport` on one host and with `dstport 4789` on the other and you have two VTEPs shouting past each other. Always specify the port explicitly on both ends.

**MTU.** The 50 byte overhead means an inner packet of full 1500 bytes will not fit in a 1500 byte underlay. Because the tunnel is UDP and the outer packet usually has the do-not-fragment bit set, oversized packets are silently dropped rather than fragmented. The classic symptom is that ping works, DNS works, SSH connects, and then the first large transfer hangs forever. Test with `ping -M do` at the exact size, not with default pings.

**A firewall in the underlay.** UDP 4789 (or 8472) has to be permitted between every pair of VTEP addresses, in both directions. Host firewalls are the usual culprit, and because the tunnel interface still shows UP, nothing looks broken.

**Multicast that is not really there.** A flood-and-learn configuration pointing at a multicast group needs PIM running in the underlay. Without it, the group exists on paper, BUM traffic goes nowhere, ARP never resolves, and every host in the overlay looks like it is offline. Use ingress replication or a control plane instead unless you know the underlay does multicast.

**Loops, with nothing to stop them.** The overlay does not run spanning tree. If you bridge two VTEPs into the same Layer 2 domain that is also connected by a physical path, you have built a loop and there is no protocol that will block a port to save you. Broadcast traffic will saturate the underlay in seconds.

## References

- https://www.rfc-editor.org/rfc/rfc7348
- https://www.rfc-editor.org/rfc/rfc7432
- https://www.rfc-editor.org/rfc/rfc8365
- https://man7.org/linux/man-pages/man8/ip-link.8.html
- https://man7.org/linux/man-pages/man8/bridge.8.html
- https://en.wikipedia.org/wiki/Virtual_Extensible_LAN
