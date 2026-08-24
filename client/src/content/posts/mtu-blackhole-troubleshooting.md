
## The symptom that should make you think MTU

There is a specific shape of network failure worth memorizing, because once
you know it you can diagnose it in about ninety seconds.

The signs: ping works perfectly. DNS resolves. TCP connections establish. Then
the moment real data flows, everything stalls. SSH logs you in and hangs at
the banner or the first big directory listing. A web page returns headers and
half the body. Small API calls succeed and large ones time out. A file
transfer starts and dies at some consistent point.

Anything that works small and fails big is a size problem, and on a network a
size problem means MTU.

## Why ping lies to you

Default ping sends a tiny payload. A 64 byte ICMP echo fits through absolutely
everything, including a tunnel that has stolen 60 bytes of header space from
you. So ping proves reachability and proves nothing at all about whether a
full sized frame survives the path.

The useful version of ping sets the do not fragment bit and forces a payload
size:

```bash
# 1472 payload + 8 ICMP header + 20 IP header = 1500 byte packet
ping -M do -s 1472 -c 3 10.20.0.10

# walk it down until it succeeds
for s in 1472 1440 1400 1372 1300; do
  printf '%s: ' "$s"
  ping -M do -s "$s" -c 1 -W 1 10.20.0.10 >/dev/null 2>&1     && echo ok || echo fail
done
```

The largest size that succeeds, plus 28, is your real path MTU. On macOS the
flags differ (`ping -D -s 1472`), and on Windows it is `ping -f -l 1472`.

## Path MTU discovery and the exact way it breaks

IPv4 hosts are supposed to learn the path MTU dynamically. A router that
receives a packet too large for its next hop, with the do not fragment bit
set, drops it and returns ICMP type 3 code 4, "fragmentation needed." The
sender shrinks its packets and life continues. IPv6 removes router
fragmentation entirely and leans on ICMPv6 Packet Too Big for the same job.

The failure is that somebody blocks ICMP. It is one of the most common bad
firewall habits in the industry: a rule that drops all ICMP because "ICMP is
a security risk." Now the too big packets are silently discarded and the
notification that would fix it is also discarded. The sender keeps
retransmitting the same oversized segment forever. That is a black hole, and
it is why the connection establishes (small packets) and then dies (big
ones).

Where the smaller MTU usually comes from:

- any tunnel: IPsec, WireGuard, GRE, VXLAN, PPPoE. Every encapsulation eats
  header bytes from the payload budget.
- a mismatched jumbo frame configuration, where one switch port or one host
  interface believes in 9000 and its neighbor does not.
- a provider link that is simply not 1500.

## Finding it properly

`tracepath` does the MTU walk for you and shows where it changes:

```bash
tracepath -n 10.20.0.10
# 1?: [LOCALHOST]      pmtu 1500
# 1:  10.20.0.1        0.412ms
# 2:  10.20.0.9        1.031ms pmtu 1420
# 3:  10.20.0.10       1.288ms reached
```

To confirm the black hole from a capture, look for the same TCP segment being
retransmitted at full size with no ICMP reply coming back:

```bash
sudo tcpdump -ni eth0 'icmp[icmptype] == 3 and icmp[icmpcode] == 4'
sudo tcpdump -ni eth0 'tcp[tcpflags] & tcp-syn != 0' -c 20
```

If the first command prints nothing while a transfer is dying, either there is
nothing to report or something upstream is eating the report. Both are worth
knowing.

## Fixes, best first

**Stop blocking ICMP unreachable.** This is the actual fix. You do not need to
permit all of ICMP to permit the messages the protocol requires. Allow type 3
code 4 on IPv4 and Packet Too Big on IPv6, inbound and outbound.

```bash
# nftables, allow the messages PMTUD depends on
nft add rule inet filter input icmp type destination-unreachable accept
nft add rule inet filter input icmpv6 type packet-too-big accept
```

**Set the interface MTU correctly** where you control both ends, especially
across tunnels:

```bash
ip link set dev wg0 mtu 1420
ip -d link show wg0 | head -2
```

**Clamp MSS as a last resort.** MSS clamping rewrites the maximum segment size
in the TCP handshake so the endpoints negotiate something that fits. It works,
it is widely deployed on tunnel routers, and it is a workaround rather than a
fix, because it only helps TCP. UDP based traffic, including QUIC and plenty
of VPN payloads, gets nothing from it.

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN   -j TCPMSS --clamp-mss-to-pmtu
```

## The habit worth building

When I bring up any tunnel or any link I do not fully control, I run the do
not fragment ping test before I declare it working. Thirty seconds then saves
an afternoon of blaming an application later, because the thing about MTU
black holes is that they never look like network problems. They look like a
broken app, a bad server, a flaky client. Everyone spends a day on the wrong
layer.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [tracepath(8) manual page](https://man7.org/linux/man-pages/man8/tracepath.8.html)
- [ping(8) manual page](https://man7.org/linux/man-pages/man8/ping.8.html)
