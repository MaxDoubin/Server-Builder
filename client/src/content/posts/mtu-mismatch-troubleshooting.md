
## Symptom: the login works, the transfer does not

The report that starts this is always some version of "the network is broken
but only sometimes." You can ping the host. You can open an SSH session and
type commands. Then you copy a file and it hangs at zero bytes, or a web page
returns headers and then stalls forever. Small things work, big things do not.

That pattern is close to diagnostic on its own. It means packets below some
size get through and packets above it disappear. Nine times out of ten that
is an MTU problem, and the tenth time it is an MTU problem somewhere you have
not looked yet.

## Why the small stuff always works

Every link has a maximum transmission unit, the largest frame payload it will
carry. Classic Ethernet is 1500 bytes. Tunnels subtract from that, because
the encapsulation header has to live somewhere: a VPN, VXLAN, PPPoE, or a
GRE tunnel all leave less room for your data.

A TCP handshake is tiny. So is an interactive SSH keystroke. Those fit under
any plausible MTU on the path, which is why the session comes up and feels
fine. A bulk transfer immediately fills segments to the maximum size the
sender thinks it can use, and if that is larger than the smallest link on the
path, those packets need to be fragmented or dropped.

For IPv4, senders normally set the "don't fragment" bit, so routers do not
fragment: they drop the packet and send back an ICMP "fragmentation needed"
message with the correct MTU. IPv6 removed router fragmentation entirely and
relies on ICMPv6 "packet too big." Either way the sender is supposed to learn
the real path MTU and shrink its segments. That mechanism is path MTU
discovery.

## The failure mode: somebody dropped the ICMP

Path MTU discovery only works if the ICMP error gets back to the sender.
Plenty of firewalls are configured to "block ICMP" as a blanket rule, usually
by someone who was thinking about ping sweeps. When that happens, the sender
never learns anything. It keeps retransmitting full size segments into a link
that will not carry them, and the connection stalls instead of failing
cleanly. This is a PMTUD black hole, and it has been a known operational
problem for decades.

## Reproducing it on purpose

The fastest confirmation is a ping with fragmentation forbidden and a payload
you choose. Subtract 28 bytes from the MTU you are testing: 20 for the IPv4
header and 8 for the ICMP header.

```bash
# Does a full 1500 byte path work? 1500 - 28 = 1472
ping -M do -s 1472 10.20.30.40

# Walk it down until it succeeds
ping -M do -s 1400 10.20.30.40
ping -M do -s 1372 10.20.30.40

# Testing a 9000 byte jumbo path: 9000 - 28 = 8972
ping -M do -s 8972 10.20.30.40

# Ask the kernel to probe the path for you
tracepath 10.20.30.40
tracepath -6 2001:db8::40
```

If 1472 fails and 1372 succeeds, you have found your ceiling and roughly
where it sits. `tracepath` will often name the hop that shrinks it. On a
capture, the tell is a stream of full size segments being retransmitted with
no ACK and no ICMP coming back.

Confirm what the interfaces themselves claim:

```bash
ip link show dev eno1
ip -6 route get 2001:db8::40
ip route get 10.20.30.40
```

## Fixes, in the order I like them

**1. Fix the actual MTU mismatch.** If two switch ports in the same path
disagree, that is the bug. Jumbo frames are all or nothing across a broadcast
domain: every host, every switch port, and every router interface on that
segment needs the same value, or you get exactly this behaviour under load.

```bash
ip link set dev eno1 mtu 9000          # runtime, lost on reboot
```

**2. Stop dropping the ICMP you need.** Permit ICMPv4 type 3 code 4 and
ICMPv6 type 2 through the firewall. This is not "opening up ICMP," it is
allowing the control messages the protocol requires. On IPv6 in particular,
filtering ICMPv6 too aggressively breaks more than PMTUD.

**3. Clamp MSS at the tunnel edge.** When you do not control the far end,
rewrite the maximum segment size in the handshake so both sides negotiate
something that fits:

```bash
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
```

This is standard on any router terminating tunnels. It only helps TCP, which
is worth remembering when the thing that breaks is UDP based.

**4. Pin a lower MTU on a specific route.** A blunt instrument, but useful
when one destination is the problem and you do not own the middle:

```bash
ip route add 10.20.30.0/24 via 10.10.0.1 mtu 1400
```

**5. Let the endpoints probe.** Packetization layer PMTUD lets TCP discover
the working size by probing rather than by trusting ICMP. On Linux this is
controlled by `net.ipv4.tcp_mtu_probing`. It is a good safety net and a bad
excuse for leaving a real misconfiguration in place.

## What I write down afterwards

MTU bugs are miserable specifically because they are intermittent and
size dependent, so the fix belongs in documentation, not just in a running
config. In my own notes, every segment has a recorded MTU and every tunnel
records its overhead. When someone later adds a host with the wrong value,
the mismatch is a five minute lookup instead of an afternoon of guessing.

## References

- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 2923: TCP Problems with Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc2923.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [RFC 8201: Path MTU Discovery for IPv6](https://www.rfc-editor.org/rfc/rfc8201.html)
- [Maximum transmission unit](https://en.wikipedia.org/wiki/Maximum_transmission_unit)
- [Jumbo frame](https://en.wikipedia.org/wiki/Jumbo_frame)
