
## The symptom that gives it away

The signature is specific enough that I can usually guess the cause before
touching anything. Small requests work. `ping` works. The TCP handshake
completes. Then the first response with real payload in it hangs forever, or a
file transfer stalls at a few kilobytes, or a web page loads its HTML and never
finishes the images.

Everything small works, everything large dies. That is a path MTU black hole,
and it happens because something on the path cannot forward a packet that big
and the message saying so never made it back to the sender.

## Why it happens at all

Every link has a maximum transmission unit, the largest frame it will carry.
Standard Ethernet is 1500 bytes of payload. A tunnel of any kind, a VPN, an
encapsulation like [VXLAN](/blog/vxlan-network-virtualization) or GRE, or a PPPoE connection, wraps your packet in
extra headers and therefore has a smaller effective MTU than the link it rides
on.

IPv4 hosts set the Don't Fragment bit on TCP segments and rely on path MTU
discovery: when a router cannot forward a packet, it drops it and returns an
ICMP "fragmentation needed" message that includes the MTU it could handle. The
sender caches that value and sends smaller segments. In IPv6 routers never
fragment at all, so the equivalent "packet too big" message is mandatory for
correctness.

The whole mechanism depends on that ICMP message getting back to the sender. It
frequently does not, because somebody along the way configured a firewall to
drop all ICMP as a security measure. That is the black hole: the sender keeps
retransmitting a segment that will never fit, and never learns why.

## Isolating it

Three commands get me an answer most of the time.

```bash
# Binary search the working payload size with DF set.
# 1472 payload + 8 ICMP + 20 IP = 1500
ping -M do -s 1472 -c 2 198.51.100.10   # fails if path MTU < 1500
ping -M do -s 1400 -c 2 198.51.100.10   # try smaller
ping -M do -s 1372 -c 2 198.51.100.10   # 1400 total, typical tunnel size

# tracepath finds the MTU and where it changes, no root needed
tracepath 198.51.100.10

# what the kernel has cached for that destination
ip route get 198.51.100.10
```

If `ping -M do -s 1472` fails while `-s 1372` succeeds, the path MTU is below
1500 and you now know roughly where. `tracepath` will usually name the hop.

On the wire the confirmation is unmistakable. Capture on the sender and look
for the same segment going out over and over at full size with no ACK, and no
ICMP coming back:

```bash
sudo tcpdump -ni eth0 'host 198.51.100.10 and (tcp or icmp)' -vv
```

If you do see the ICMP fragmentation needed message arriving and the sender
ignores it, that is a different bug: something is rewriting or the socket is
using a policy that pins the MSS.

## Fixes, in the order I prefer them

**Fix the ICMP filtering.** This is the correct answer and the one people skip.
Blanket dropping ICMP is a misconfiguration, not a hardening step. You need
type 3 code 4 on IPv4 and packet too big on IPv6 to pass. If you inherited a
firewall policy that drops all ICMP, this is the thing to change.

**Fix the MTU on the interface.** If a link genuinely has a smaller MTU, set it
so the local stack knows:

```bash
ip link set dev wg0 mtu 1420
ip route add 203.0.113.0/24 dev eth0 mtu 1400
```

**Clamp MSS as a last resort.** On a router terminating tunnels, clamping the
TCP maximum segment size in the SYN forces both endpoints to negotiate segments
that fit, without depending on ICMP at all:

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
```

I call this a last resort because it only helps TCP. UDP based protocols,
including QUIC and most tunnels, get nothing from MSS clamping. They have to do
their own probing, which is what packetization layer path MTU discovery is for:
the transport itself probes upward with real data and backs off, rather than
trusting ICMP.

## Jumbo frames deserve the same suspicion

The mirror image of this bug is enabling jumbo frames on some devices and not
others. If you set 9000 byte MTU on two hosts and the switch between them is
still at 1500, you have built a black hole on purpose. Jumbo frames are an all
or nothing property of a layer 2 domain: every host, every switch port, every
router interface in that broadcast domain has to agree, and the switch usually
needs a slightly larger value than the hosts to account for its own headers.

The payoff for jumbo frames is real but narrow. Storage traffic and backup
traffic on a dedicated segment benefit from fewer, larger frames. Mixed general
purpose networks usually do not benefit enough to be worth the operational
risk, and a jumbo frame misconfiguration is exactly the kind of failure that
shows up weeks later in an unrelated service.

## The habit worth building

Whenever I stand up anything with encapsulation, a VPN, an overlay, a tunnel to
another site, I test large packet delivery on purpose before declaring it done.
One `ping -M do` at full size, one real file transfer. It takes thirty seconds
and it moves the discovery of an MTU problem from "a user reports a weird bug in
three weeks" to "I found it while I was already in the config."

The other habit: when a firewall rule says drop ICMP, ask which ICMP. The
protocol is a control plane, not an attack surface to be swept away wholesale.
Path MTU discovery is the most common thing people break with that rule, and it
is one of the most annoying failures to diagnose from the other end.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 8201: Path MTU Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [RFC 8899: PLPMTUD for datagram transports](https://www.rfc-editor.org/rfc/rfc8899.html)
- [tracepath(8) manual page](https://man7.org/linux/man-pages/man8/tracepath.8.html)
- [Path MTU Discovery](https://en.wikipedia.org/wiki/Path_MTU_Discovery)
