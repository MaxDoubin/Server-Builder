
## MTU in one paragraph

The maximum transmission unit is the largest payload a link will carry in a single frame. Classic Ethernet is 1500 bytes. Anything larger has to be fragmented by the sender, or dropped with a notification, or dropped silently. Which of those three happens is the entire subject of this post.

Jumbo frames raise that number, commonly to 9000 bytes. The benefit is fewer frames for the same bytes: fewer interrupts, fewer header overheads, less per packet processing. For bulk transfer paths like storage replication and backups, it is a real if modest win. For general user traffic it is close to noise.

## Why it goes wrong

Enabling jumbo frames means every device in the path has to agree. Every switch, every router hop inside the segment, both hosts, and both virtual switches if hypervisors are involved. Miss one and you get the worst possible failure mode: small packets work perfectly, so ping succeeds, SSH succeeds, the web UI loads, and then any large transfer stalls.

That asymmetry is what makes it maddening. Every basic test passes. The thing that fails is a bulk copy that hangs at a random percentage.

## Proving it with ping

The test is a ping with the do-not-fragment bit set and an explicit payload size. On Linux:

```bash
# 8972 payload + 8 ICMP header + 20 IPv4 header = 9000 byte frame payload
ping -M do -s 8972 -c 3 10.20.30.40

# Confirm the standard size works, to prove the host is reachable at all
ping -M do -s 1472 -c 3 10.20.30.40

# Binary search the actual usable size when the above fails
for size in 1472 2972 4472 5972 7972 8972; do
  if ping -M do -s "$size" -c 1 -W 1 10.20.30.40 >/dev/null 2>&1; then
    echo "OK    payload=$size  frame=$((size + 28))"
  else
    echo "FAIL  payload=$size  frame=$((size + 28))"
  fi
done
```

The largest size that succeeds, plus 28, is your real path MTU for IPv4. Remember the arithmetic: the `-s` value is the ICMP payload, and you add 8 bytes of ICMP header and 20 bytes of IPv4 header to get the IP packet size.

Check the interface side too:

```bash
ip -br link show          # MTU column per interface
ip route get 10.20.30.40  # route-specific MTU, if one is pinned
ethtool eth0 | grep -i speed
```

## Path MTU discovery and the ICMP you must not block

When a router receives a packet too large for the next hop with the do-not-fragment bit set, it is supposed to drop the packet and return an ICMP message: destination unreachable, fragmentation needed. The sender learns the smaller MTU and adjusts.

That mechanism only works if the ICMP message gets back. A firewall that blocks ICMP wholesale creates a path MTU discovery black hole. The sender never learns, keeps retransmitting oversized packets, and the connection hangs rather than failing cleanly.

If you take one operational rule from this post: do not blanket block ICMP. Filter deliberately, and always permit fragmentation needed messages inbound. The IPv6 equivalent matters even more, because IPv6 routers do not fragment at all and rely entirely on the packet too big message.

There is also a packetization layer approach that probes for the working size at the transport layer instead of trusting ICMP, which is what saves you on networks you do not control. Good to know it exists, not a reason to keep blocking ICMP on networks you do.

## MSS clamping for tunnels

Any encapsulation, a VPN, a GRE tunnel, an overlay, eats bytes from the payload. Hosts inside do not know. The standard fix is to rewrite the TCP maximum segment size during the handshake so both ends negotiate something that actually fits:

```bash
# On the tunnel endpoint, clamp MSS to whatever the path can carry
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

This only helps TCP. UDP based protocols have to handle it themselves, which is one reason modern UDP transports do their own path probing.

## How I decide whether to bother

I enable jumbo frames on segments where I control every device and the traffic is bulk: storage networks, backup targets, replication links, hypervisor migration networks. Those are isolated [VLANs](/blog/vlan-segmentation-guide) with a known device list, so the "every device must agree" requirement is actually checkable.

I leave general purpose and client VLANs at 1500. The gain is small, the blast radius of one misconfigured device is large, and client devices come and go without asking me.

And whatever I choose, I document the MTU in the VLAN table next to the subnet and the gateway. An undocumented MTU is a trap you set for yourself six months out.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [ping(8) manual page](https://man7.org/linux/man-pages/man8/ping.8.html)
- [Maximum transmission unit on Wikipedia](https://en.wikipedia.org/wiki/Maximum_transmission_unit)
