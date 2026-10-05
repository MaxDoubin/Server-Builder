
## The Symptom That Gives It Away

There is one failure signature that should immediately make you think about MTU: small things work and big things hang.

Ping succeeds. SSH connects and you get a prompt. Then you run a command that produces a lot of output, or you start a file copy, and the session freezes. A web page returns headers and then stalls partway through the body. DNS over UDP is fine until a response gets large.

That pattern is not random packet loss. Random loss degrades everything a little. This degrades only large packets, completely. That is an MTU problem, and the reason it is so confusing is that the thing dropping your traffic is usually not the thing you are logged into.

## What MTU Actually Means

The maximum transmission unit is the largest payload a link will carry in a single frame. Standard Ethernet is 1500 bytes. That is the IP packet size, not counting the Ethernet header: with the 14 byte header and 4 byte frame check sequence, the frame on the wire is 1518 bytes.

TCP does not send 1500 byte segments into that. It negotiates a maximum segment size during the handshake, and MSS is MTU minus the IP header minus the TCP header. On plain IPv4 that is 1500 minus 20 minus 20, which gives 1460.

The negotiation only covers the two endpoints. Neither endpoint knows what the links in between can carry. That job belongs to path MTU discovery, which works like this: the sender marks packets do not fragment, and if a router along the path has a smaller MTU on the outbound interface, it drops the packet and sends back an ICMP message saying fragmentation needed with the MTU it can accept. The sender then lowers its estimate for that destination.

The whole mechanism depends on that ICMP message getting back. When a firewall somewhere blocks ICMP type 3, the sender never learns, keeps sending packets that are too large, and they keep disappearing. This is the single most common cause of the symptom above, and it is why blanket ICMP blocking is a bad idea rather than a security win.

IPv6 raises the stakes. Routers never fragment IPv6 packets, so the ICMPv6 Packet Too Big message (type 2) is the only way a sender learns the path is smaller. Filter ICMPv6 aggressively and you break more than path MTU discovery, because neighbor discovery runs over ICMPv6 too.

## Finding the Real Path MTU

You do not have to guess. Send a packet of a known size with fragmentation forbidden and see whether it survives. A default ping proves nothing here: its few dozen bytes fit through any tunnel, so it shows reachability and nothing about full size packets.

```bash
# Linux. -M do sets do-not-fragment, -s is the ICMP payload size.
# Payload 1472 + 8 ICMP header + 20 IP header = 1500 byte IP packet.
ping -M do -s 1472 -c 2 198.51.100.10

# Walk it down until it succeeds, or let tracepath find it for you.
tracepath -n 198.51.100.10
tracepath -6 -n 2001:db8::10

# macOS and Windows use different flags for do-not-fragment.
ping -D -s 1472 -c 2 198.51.100.10
ping -f -l 1472 198.51.100.10
```

Read how it fails, not just that it failed. A local "message too long" error means your own interface, or an MTU the kernel has already learned for that destination, is the limit. A "frag needed" reply means discovery is working and names the MTU. Silence, while smaller pings get through, is the black hole: something upstream is dropping the packet without saying so.

The largest payload that gets through, plus 28, is the path MTU. If that is 1422, your path MTU is 1450, and 1450 is a number with a story attached. Add the 8 bytes of [VXLAN](/blog/vxlan-network-virtualization) header, 8 bytes of UDP, 20 bytes of outer IP, and the 14 byte Ethernet header of the encapsulated frame, and you have exactly the overhead of VXLAN encapsulation over a 1500 byte underlay. The number tells you what is in the path. `tracepath` usually tells you where, by printing a new `pmtu` value at the hop where the path shrinks, and `ip route get 198.51.100.10` shows any smaller value the kernel has cached for that destination.

A short table of the overheads worth memorizing:

| Encapsulation | Overhead over IP | Resulting inner MTU on a 1500 path |
| --- | --- | --- |
| PPPoE | 8 bytes | 1492 |
| GRE | 24 bytes | 1476 |
| VXLAN | 50 bytes | 1450 |
| WireGuard | 60 bytes | 1440 |
| IPsec ESP tunnel | roughly 50 to 70, cipher dependent | 1430 to 1450 |

## Confirming a Black Hole on the Wire

A capture settles it. On the sender, a black hole is the same full size segment retransmitted over and over, with no ACK and no ICMP. Filtering for the fragmentation needed message makes its absence obvious:

```bash
sudo tcpdump -ni eth0 'host 198.51.100.10 and (tcp or icmp)'
sudo tcpdump -ni eth0 'icmp[icmptype] == 3 and icmp[icmpcode] == 4'
```

If the second capture stays silent while a transfer dies, either nothing is reporting a problem or something upstream is eating the report. If the messages do arrive and the sender keeps sending full size segments anyway, the path is delivering the report and something near the sender is discarding it. Check the sender's own firewall first: tcpdump sees inbound packets before the local ruleset does, so a capture can show ICMP the stack never receives.

## Fixing It Without Guessing

There are two honest fixes and two workarounds.

The first fix is to let path MTU discovery work. Permit ICMP type 3 code 4 inbound on your firewalls, and ICMPv6 Packet Too Big for IPv6. This is not optional infrastructure, it is part of how IP is supposed to function. In nftables, with the same rules in the forward chain on a router:

```bash
nft add rule inet filter input icmp type destination-unreachable icmp code frag-needed accept
nft add rule inet filter input icmpv6 type packet-too-big accept
```

The second fix is to set the correct MTU on the interfaces that are actually encapsulating. If a tunnel interface carries a 1450 byte payload, tell it so rather than hoping discovery figures it out. If only one destination is affected and you do not own the middle, pin the MTU on that route instead. Both are runtime changes that vanish on reboot, so persist the value in your network configuration once it is right.

```bash
# WireGuard's usual 1420, not the table's 1440, also fits an IPv6 underlay.
ip link set dev wg0 mtu 1420
ip link show dev wg0
ip route add 203.0.113.0/24 via 10.10.0.1 mtu 1400
```

The first workaround is MSS clamping, which saves you when the far end is out of your control. The router rewrites the MSS value in the TCP handshake so both endpoints agree to a segment size that fits the path. It is a patch over a broken path rather than a repair, but it is reliable and standard on routers that terminate tunnels.

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

It only helps TCP: QUIC and plenty of VPN payloads ride on UDP and get nothing from it. To confirm the clamp, capture handshakes with `tcpdump -ni eth0 'tcp[tcpflags] & tcp-syn != 0'` and read the `mss` option in each SYN.

The second workaround is to let the endpoints probe. Packetization layer path MTU discovery has the transport find the working size with real data instead of trusting ICMP. On Linux, `net.ipv4.tcp_mtu_probing=1` turns it on for TCP once a black hole is detected, and `2` uses it always. Datagram transports such as QUIC can probe the same way, which is what RFC 8899 describes. It is a good safety net and a bad excuse for leaving a real misconfiguration in place.

## Turning On Jumbo Frames Without Breaking Things

Jumbo frames, usually 9000 bytes, reduce per packet overhead and interrupt load on high throughput paths. Storage traffic and backup networks are where they earn their keep.

The rule is absolute: every device in the layer 2 broadcast domain has to agree. Both hosts, every switch in between, the switch uplinks, and on a hypervisor the virtual switch or bridge as well. One device left at 1500 and you have manufactured exactly the silent failure described at the top of this post, except now you did it on purpose. Check every port rather than assuming the VLAN has one value.

Switch vendors also count differently. Some MTU settings mean the IP packet, others the whole frame including headers, so a switch set to exactly 9000 can still drop a host's 9000 byte packets. When unsure, set the switch ports higher than the hosts.

My sequence is always the same. Enable the larger MTU on the switches first, hop by hop, before touching a single host, because a switch with a small MTU will drop frames a host happily generates. Then set the hosts. Then verify end to end with a do not fragment ping at 8972 bytes of payload, which makes a 9000 byte packet. Then, and only then, believe it works.

I also keep jumbo frames confined to a dedicated [VLAN](/blog/vlan-segmentation-guide) for storage rather than turning them on everywhere. Restricting the blast radius means a misconfigured device breaks one path I can reason about instead of the whole network. The decision rule: jumbo frames go only where I control every device and the traffic is bulk, such as storage, backups, replication and hypervisor migration. Client VLANs stay at 1500, because the gain is small and client devices come and go without asking me. Either way, the MTU goes in the VLAN table next to the subnet and gateway, with each tunnel's overhead beside it, so a host added later with the wrong value takes five minutes to find, not an afternoon.

## Why This Is Worth Knowing Cold

MTU issues waste enormous amounts of time because the symptoms point away from the cause. The application team sees a hung transfer, the server team sees a healthy interface, and the network team sees no errors, because a dropped oversize packet on a distant router does not increment a counter anyone is looking at.

That is why I run a full size do not fragment ping whenever I bring up a tunnel or a link I do not fully control. Thirty seconds then saves a day of blaming the application. And when a firewall rule says drop ICMP, ask which ICMP. The protocol is a control plane, not an attack surface to be swept away wholesale.

In my experience the culprit is almost always one forgotten port or one overly enthusiastic ICMP deny rule. Learn the signature. Small works, large hangs. Then go measure the path instead of restarting things.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 2923: TCP Problems with Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc2923.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [RFC 8899: PLPMTUD for datagram transports](https://www.rfc-editor.org/rfc/rfc8899.html)
- [RFC 7348: Virtual eXtensible Local Area Network (VXLAN)](https://www.rfc-editor.org/rfc/rfc7348.html)
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [tracepath(8) manual page](https://man7.org/linux/man-pages/man8/tracepath.8.html)
- [ping(8) manual page](https://man7.org/linux/man-pages/man8/ping.8.html)
- [iptables-extensions(8) manual page](https://man7.org/linux/man-pages/man8/iptables-extensions.8.html)
- [Maximum transmission unit](https://en.wikipedia.org/wiki/Maximum_transmission_unit)
- [Path MTU Discovery](https://en.wikipedia.org/wiki/Path_MTU_Discovery)
- [Jumbo frame](https://en.wikipedia.org/wiki/Jumbo_frame)
