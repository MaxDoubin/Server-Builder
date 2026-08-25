
## The Symptom That Gives It Away

There is one failure signature that should immediately make you think about MTU: small things work and big things hang.

Ping succeeds. SSH connects and you get a prompt. Then you run a command that produces a lot of output, or you start a file copy, and the session freezes. A web page returns headers and then stalls partway through the body. DNS over UDP is fine until a response gets large.

That pattern is not random packet loss. Random loss degrades everything a little. This degrades only large packets, completely. That is an MTU problem, and the reason it is so confusing is that the thing dropping your traffic is usually not the thing you are logged into.

## What MTU Actually Means

The maximum transmission unit is the largest payload a link will carry in a single frame. Standard Ethernet is 1500 bytes. That is the IP packet size, not counting the Ethernet header.

TCP does not send 1500 byte segments into that. It negotiates a maximum segment size during the handshake, and MSS is MTU minus the IP header minus the TCP header. On plain IPv4 that is 1500 minus 20 minus 20, which gives 1460.

The negotiation only covers the two endpoints. Neither endpoint knows what the links in between can carry. That job belongs to path MTU discovery, which works like this: the sender marks packets do not fragment, and if a router along the path has a smaller MTU on the outbound interface, it drops the packet and sends back an ICMP message saying fragmentation needed with the MTU it can accept. The sender then lowers its estimate for that destination.

The whole mechanism depends on that ICMP message getting back. When a firewall somewhere blocks ICMP type 3, the sender never learns, keeps sending packets that are too large, and they keep disappearing. This is the single most common cause of the symptom above, and it is why blanket ICMP blocking is a bad idea rather than a security win.

## Finding the Real Path MTU

You do not have to guess. Send a packet of a known size with fragmentation forbidden and see whether it survives.

```bash
# Linux. -M do sets do-not-fragment, -s is the ICMP payload size.
# Payload 1472 + 8 ICMP header + 20 IP header = 1500 bytes on the wire.
ping -M do -s 1472 -c 2 198.51.100.10

# Walk it down until it succeeds, or let tracepath find it for you.
tracepath -n 198.51.100.10

# macOS uses a different flag for do-not-fragment.
ping -D -s 1472 -c 2 198.51.100.10
```

If 1472 fails and 1422 succeeds, your path MTU is 1450, and 1450 is a number with a story attached. Add the 8 bytes of VXLAN header, 8 bytes of UDP, 20 bytes of outer IP, and 14 bytes of outer Ethernet, and you have exactly the overhead of VXLAN encapsulation over a 1500 byte underlay. The number tells you what is in the path.

A short table of the overheads worth memorizing:

| Encapsulation | Overhead over IP | Resulting inner MTU on a 1500 path |
| --- | --- | --- |
| PPPoE | 8 bytes | 1492 |
| GRE | 24 bytes | 1476 |
| VXLAN | 50 bytes | 1450 |
| WireGuard | 60 bytes | 1440 |
| IPsec ESP tunnel | roughly 50 to 70, cipher dependent | 1430 to 1450 |

## Fixing It Without Guessing

There are three honest fixes and one workaround.

The first fix is to let path MTU discovery work. Permit ICMP type 3 code 4 inbound on your firewalls. This is not optional infrastructure, it is part of how IP is supposed to function.

The second is to set the correct MTU on the interfaces that are actually encapsulating. If a tunnel interface carries a 1450 byte payload, tell it so rather than hoping discovery figures it out.

```bash
ip link set dev wg0 mtu 1420
ip link show dev wg0
```

The third is MSS clamping, which is the workaround that saves you when the far end is out of your control. The router rewrites the MSS value in the TCP handshake so both endpoints agree to a segment size that fits the path. It only helps TCP, and it is a patch over a broken path rather than a repair, but it is reliable.

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

## Turning On Jumbo Frames Without Breaking Things

Jumbo frames, usually 9000 bytes, reduce per packet overhead and interrupt load on high throughput paths. Storage traffic and backup networks are where they earn their keep.

The rule is absolute: every device in the layer 2 broadcast domain has to agree. Both hosts, every switch in between, and the switch uplinks. One device left at 1500 and you have manufactured exactly the silent failure described at the top of this post, except now you did it on purpose.

My sequence is always the same. Enable the larger MTU on the switches first, hop by hop, before touching a single host, because a switch with a small MTU will drop frames a host happily generates. Then set the hosts. Then verify end to end with a do not fragment ping at 8972 bytes of payload, which is 9000 on the wire. Then, and only then, believe it works.

I also keep jumbo frames confined to a dedicated VLAN for storage rather than turning them on everywhere. Restricting the blast radius means a misconfigured device breaks one path I can reason about instead of the whole network.

## Why This Is Worth Knowing Cold

MTU issues waste enormous amounts of time because the symptoms point away from the cause. The application team sees a hung transfer, the server team sees a healthy interface, and the network team sees no errors, because a dropped oversize packet on a distant router does not increment a counter anyone is looking at.

Learn the signature. Small works, large hangs. Then go measure the path instead of restarting things.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [RFC 7348: Virtual eXtensible Local Area Network (VXLAN)](https://www.rfc-editor.org/rfc/rfc7348.html)
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [Maximum transmission unit](https://en.wikipedia.org/wiki/Maximum_transmission_unit)
