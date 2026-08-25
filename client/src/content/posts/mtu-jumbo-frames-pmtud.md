
## What MTU actually is

The maximum transmission unit is the largest payload a link will carry in one frame. On classic Ethernet that is 1500 bytes of IP packet, which becomes 1518 bytes on the wire once you add the Ethernet header and frame check sequence.

Two things about MTU cause most of the confusion. It is a property of a link, not of a network, so every hop can have a different one. And it is enforced by dropping, not by asking: a device that receives a frame too large for the next link either fragments it or discards it.

## Jumbo frames, and the condition attached

Jumbo frames raise the IP MTU to something like 9000 bytes. The benefit is fewer packets for the same data, which means fewer interrupts, less per packet header overhead, and lower CPU cost per gigabit. For storage traffic, backups, and replication on a dedicated segment it is a genuine win.

The condition is that every device in the path has to agree. Every host, every switch, every router interface. One access port left at 1500 in the middle of a jumbo enabled VLAN produces the worst possible symptom: small packets pass, large ones disappear, and nothing logs an error you will find.

Because of that, I only enable jumbo frames on segments I fully control end to end, typically a dedicated storage or backup VLAN. I leave general purpose and internet facing paths at 1500. The performance difference on mixed traffic is not worth the debugging.

Note also that switch vendors count differently. Some MTU settings refer to the IP payload, others to the whole frame including headers. Always set the switch value higher than the host value if you are unsure.

## Path MTU discovery, and how it breaks

IPv4 hosts set the Don't Fragment bit and rely on routers to report a problem. When a router cannot forward a packet because it is too big for the next link, it drops it and sends back an ICMP "fragmentation needed" message carrying the correct MTU. The sender caches that and shrinks. IPv6 removed router fragmentation entirely, so this mechanism is not optional there.

The break is that some networks block all ICMP. Now the oversized packet is dropped and the message that would have explained it never arrives. The connection completes its handshake, because SYN packets are small, and then hangs the moment real data flows. That is a PMTU black hole, and it is why "ping works but the transfer stalls" is a classic.

If you administer a firewall, do not block ICMP wholesale. Permit type 3 code 4 on IPv4 and packet too big on IPv6. Blocking them breaks the protocol on purpose.

## Finding the real MTU

Send progressively larger packets with fragmentation disabled and find where they stop getting through:

```bash
# 1472 payload + 8 ICMP header + 20 IP header = 1500
ping -M do -s 1472 -c 2 10.20.0.10

# too big for a 1500 path, should fail cleanly
ping -M do -s 1473 -c 2 10.20.0.10

# jumbo check on a segment you configured for 9000
ping -M do -s 8972 -c 2 10.20.0.10
```

Add 28 to the `-s` value to get the IP MTU. If 1472 succeeds and 1473 gives you "message too long" locally, your own interface is the limit. If 1473 just times out with no error, something upstream is dropping silently and you are in black hole territory.

`tracepath` walks the path and reports where the MTU changes, which is faster than bisecting by hand.

Set an interface MTU on Linux with:

```bash
sudo ip link set dev eth1 mtu 9000
ip link show eth1 | head -1
```

## Clamping MSS for tunnels

Any tunnel adds encapsulation overhead, so the usable MTU inside it is smaller than the underlying link. If PMTU discovery is unreliable across that path, and it usually is, clamp the TCP maximum segment size on the router so endpoints negotiate a size that fits:

```bash
sudo iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

This rewrites the MSS option in the handshake so both sides agree on segments that will fit. It only helps TCP, but TCP is where the visible pain usually is.

## A short checklist

When something works small and fails big: confirm the interface MTU on both endpoints, walk the path with `tracepath`, check every switch port in the VLAN rather than assuming the VLAN has one value, verify ICMP unreachables are permitted through every firewall in the path, and clamp MSS if a tunnel is involved. In my experience it is almost always one forgotten port or one overly enthusiastic ICMP deny rule.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [tracepath(8) manual page](https://man7.org/linux/man-pages/man8/tracepath.8.html)
- [iptables-extensions(8) manual page](https://man7.org/linux/man-pages/man8/iptables-extensions.8.html)
- [Jumbo frame](https://en.wikipedia.org/wiki/Jumbo_frame)
