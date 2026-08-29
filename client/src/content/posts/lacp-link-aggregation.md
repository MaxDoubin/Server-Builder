
## What Link Aggregation Does

Link Aggregation (also called bonding on Linux, or an EtherChannel on Cisco) combines multiple physical Ethernet links into a single logical interface. The benefits are increased bandwidth and redundancy. If one physical link fails, traffic automatically flows through the remaining links.

LACP (Link Aggregation Control Protocol, IEEE 802.3ad) is the standard protocol for negotiating link aggregation between two devices. Both ends send LACP PDUs to establish and maintain the aggregate. The specification moved out of 802.3 and into its own document in 2008, so modern datasheets often say 802.1AX instead. They mean the same protocol, and a switch advertising either will interoperate with the other.

The upper limit is 8 active member links in a single aggregation group. Cisco platforms let you configure up to 16 interfaces in a channel group, but only 8 of them bundle at any moment; the rest sit in hot standby and take over when an active member drops.

## How LACP Negotiates

LACPDUs are sent to the multicast address 01:80:C2:00:00:02 with EtherType 0x8809, the Slow Protocols EtherType. That address is in the reserved range that switches never forward, which is deliberate: an LACPDU is only ever meaningful to the device on the other end of the wire.

Each side describes itself as the actor and describes what it hears as the partner. The fields that matter are the system ID (a priority plus the device MAC), the operational key (which member ports on the same device are allowed to bundle together), and the port ID. Two links join the same aggregator only when both ends agree on all of it. This is why the protocol is safe: a cable moved to the wrong switch produces a mismatched partner system ID, the link drops out of the bundle, and nothing loops.

There are exactly two timer rates. Slow rate sends an LACPDU every 30 seconds; fast rate sends one every second. The timeout in both cases is three missed PDUs, so a dead partner is detected in 90 seconds on slow and 3 seconds on fast. Slow is the default nearly everywhere. Set fast when you want fast failover, but understand what you are asking for: the switch now processes an extra control-plane packet per second per member, and a supervisor failover or a control-plane policing drop that stalls LACPDUs for three seconds will tear the bundle down on a link that was physically fine.

## How Hashing Works

Link aggregation does not actually bond the links into a single higher-speed pipe for individual flows. Instead, traffic is distributed across links using a hashing algorithm. Common hash inputs:

- **Layer 2 (src/dst MAC):** Distributes based on source and destination MAC
- **Layer 3 (src/dst IP):** Better distribution for multi-host environments
- **Layer 4 (src/dst IP + port):** Best distribution for high-traffic flows between few hosts

A single TCP connection always flows over a single physical link. You cannot exceed the speed of one link for a single stream. The benefit is total throughput across many flows.

Two properties of the hash surprise people. First, each end hashes independently, so traffic from A to B can ride a different physical link than the return traffic from B to A. That is normal behaviour, not a fault, and it means a one-sided packet capture on a member link often shows only half a conversation. Second, the hash result is reduced modulo the number of active members. With 2, 4, or 8 members the buckets divide evenly. With 3, 5, 6, or 7 members some links receive measurably more buckets than others, and a heavily loaded 3-member bundle can sit at 60 percent on one link and 20 percent on the others while the aggregate reports plenty of headroom.

Layer 3+4 hashing has a caveat the Linux bonding documentation states directly: it is not fully 802.3ad compliant, because IP fragments after the first carry no port numbers. Those fragments hash differently from the head fragment and can arrive out of order. For normal TCP traffic that never happens, since TCP avoids fragmentation. For UDP applications that send large datagrams, it can.

## Cisco Configuration

```
interface Port-channel1
  description TRUNK_TO_SERVER
  switchport mode trunk

interface GigabitEthernet1/0/1
  channel-group 1 mode active
  
interface GigabitEthernet1/0/2
  channel-group 1 mode active
```

`mode active` sends LACPDUs; `mode passive` only answers them. `mode on` is different in kind: it forces the ports into a static bundle with no protocol at all. Static bundling is the one configuration that can genuinely loop a network, because a miscabled member gets forwarded onto rather than removed from the group. Use `active` unless you have a specific device that cannot speak LACP.

Verify with `show etherchannel summary` and read the flag letters next to each port. `P` means bundled in the port channel, which is what you want. `s` means suspended (the port is a member but is not passing traffic), `I` means stand-alone, and `D` means down. A member showing `s` on a channel where everything else is `P` is nearly always a configuration mismatch on that one interface. `show lacp neighbor` tells you whether the partner is answering at all, and at what timer rate.

## Linux Configuration (systemd-networkd)

```ini
# /etc/systemd/network/bond0.netdev
[NetDev]
Name=bond0
Kind=bond

[Bond]
Mode=802.3ad
LACPTransmitRate=fast
TransmitHashPolicy=layer3+4

# /etc/systemd/network/bond0.network
[Match]
Name=bond0

[Network]
Address=192.168.1.100/24
Gateway=192.168.1.1
```

Each member interface needs its own `.network` file with `Bond=bond0` and no address of its own. Giving a member an IP is a common first mistake and produces a bond that comes up but carries almost nothing.

The file to read when something is wrong is `/proc/net/bonding/bond0`. It prints the aggregator ID, the actor and partner state bytes, and the churn counters for every member. Two lines matter most. `Aggregator ID` should be identical for every member: if two members show different aggregator IDs, only one aggregator is active and the other members are silently idle. `Partner Mac Address` of 00:00:00:00:00:00 means no LACPDUs are being received at all, which points at the switch side or at a port that was never added to the channel group.

Note that `Mode=802.3ad` is the only bonding mode that requires switch configuration. Round-robin (mode 0) needs none, which is why tutorials reach for it, but it deliberately sprays consecutive frames of one flow across links and produces out-of-order TCP segments and duplicate ACKs. `active-backup` (mode 1) also needs nothing from the switch and is the correct choice when you want redundancy and cannot configure the switch.

## What LACP Cannot Do

It cannot make one flow faster. A single iSCSI session, a single SMB copy, or a single backup stream between two hosts uses one member link and one member link only. If that is your workload, the answer is not a bigger bundle; it is multipath at a higher layer (MPIO for iSCSI, SMB Multichannel for SMB) or a faster single link.

It cannot span two independent switches. A standard 802.3ax aggregation is point to point. Splitting members across two switches requires those switches to present one system ID, which means stacking, vPC, MC-LAG, or an equivalent. Without it, the far end sees two different partner system IDs, drops half the members, and you have built a loop that [spanning tree](/blog/spanning-tree-protocol-deep-dive) will have to block.

It cannot merge links of different speeds usefully. A 1 Gbps and a 10 Gbps member get different operational keys and land in different aggregators, and only one aggregator forwards. You do not get 11 Gbps, you get whichever aggregator won.

## Troubleshooting

Check that both sides are in the same LACP mode (active/active or active/passive, not passive/passive which will not negotiate). Verify speed and duplex match on all member links. Check that the switch port channel is up and members are showing as bundled.

Beyond that, the failures that actually recur:

**Mismatched trunk configuration on one member.** The allowed VLAN list, native VLAN, and switchport mode must be identical across every port in the group. Cisco's EtherChannel misconfig guard will err-disable the port rather than bundle it. The tell is one port in `s` or `err-disabled` while the rest are `P`.

**MTU mismatch.** The bond and every member need the same MTU. A member at 1500 in a jumbo bundle passes small packets perfectly and drops large ones, which looks like an application bug rather than a network one until you test with `ping -M do -s 8972`.

**One end configured as static `on`, the other as LACP.** The LACP side never receives PDUs, refuses to bundle, and leaves its ports individual; the static side forwards on all of them regardless. The result is duplicate frames and MAC flapping, not a clean failure.

**Traffic arriving on a member the capture is not on.** Before concluding a link is dead, confirm with per-interface counters rather than a capture. `ethtool -S enp1s0f0` gives the driver's own transmit and receive counts, and comparing those across members tells you immediately whether the hash is distributing or one link is doing all the work.

**A bundle that works until you reboot the switch.** If the Linux side is set to fast rate and the switch is set to slow, the negotiated rate follows what each side asks its partner for, and marginal setups survive at slow but tear down at fast during control-plane churn. When a bundle flaps only during maintenance windows, drop back to the 30 second rate and see if the flapping stops.

## References

- https://en.wikipedia.org/wiki/Link_aggregation
- https://en.wikipedia.org/wiki/IEEE_802.1AX
- https://www.kernel.org/doc/html/latest/networking/bonding.html
- https://man7.org/linux/man-pages/man5/systemd.netdev.5.html
- https://man7.org/linux/man-pages/man8/ethtool.8.html
- https://www.rfc-editor.org/rfc/rfc7424
