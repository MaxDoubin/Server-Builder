
## What Moved, And Where It Moved To

QUIC is often described as "HTTP over UDP," which is true and unhelpful. The
useful description is that a set of responsibilities got picked up and put down
somewhere else.

Reliable ordered delivery, congestion control, and loss recovery used to live in
the kernel's TCP implementation. In QUIC they live in a userspace library
alongside the application. Encryption used to be a layer sitting on top of the
transport, negotiated after the transport connection was established. In QUIC,
[TLS 1.3](/blog/tls-modern-encryption) is integrated into the transport handshake, so there is no unencrypted
transport phase to speak of. And stream multiplexing, which HTTP/2 implemented
on top of a single TCP connection, moved down into the transport itself.

That last move is the one with the biggest engineering consequence.

## Head Of Line Blocking, Precisely

HTTP/2 multiplexes many requests over one TCP connection. TCP guarantees that
bytes arrive in the order they were sent, and it enforces that guarantee for the
whole connection. So if a segment carrying part of request 3 is lost, the kernel
holds back everything that arrived after it, including complete data for
requests 4 through 20, until the retransmission fills the gap. The application
multiplexed, but the transport did not know that, so a loss affecting one stream
stalls all of them.

QUIC gives each stream its own sequence space. A loss on stream 3 delays stream
3 and nothing else. Data for the other streams is delivered as soon as it
arrives.

This is a real improvement, and it is also frequently oversold. On a clean,
low latency path with little loss, the difference is small, because there is not
much blocking to avoid. On a lossy path with many parallel objects, it is
substantial. Knowing which situation you are in tells you whether to care.

The handshake is the other win. TLS 1.3 over TCP costs a TCP handshake plus a
TLS handshake. QUIC combines them, so a fresh connection is one round trip to
first application data, and a resumed one can send data with the first packet.
On a high latency path that is a visible difference.

## Connection IDs And Migration

A TCP connection is identified by the four tuple of addresses and ports. Change
any element, by moving between networks or having a NAT rebind, and the
connection is dead.

QUIC identifies connections by a connection ID carried in the packet header,
independent of the addresses. A client that changes network can keep the same
connection ID and continue, with a path validation exchange to confirm the new
path and prevent an attacker from redirecting traffic. Endpoints also rotate
through multiple connection IDs so an observer cannot trivially follow a device
across networks by watching one identifier.

For anyone running a load balancer, this is the detail that matters most. You
cannot hash on the four tuple to pick a backend, because the four tuple is not
stable. Load balancing QUIC means understanding connection IDs, and typically
means the server encodes routing information into the IDs it issues.

## What Changes For Your Firewall And Your Monitoring

This is where operators feel it.

**It is UDP 443.** Plenty of networks historically treated UDP as suspicious and
rate limited or blocked it outside DNS. Applications handle that by falling back
to TCP, which mostly works, which means the failure is invisible: everything
functions, just on the slower path, and nobody files a ticket. If you want QUIC
to work, allow UDP 443 explicitly and verify it rather than assuming.

**There are no TCP flags.** No SYN, no FIN, no RST. Every tool, dashboard, and
mental model built on connection setup and teardown visibility has nothing to
look at. Flow records still show you five tuples, byte counts, and durations,
but "connection established" and "connection reset" as distinct observable
events are gone.

**Almost the whole header is encrypted.** In TCP plus TLS, an on path observer
sees sequence numbers, window sizes, and the TLS record layer. In QUIC, packet
numbers and nearly all of the header are protected. Passive performance
analysis from a tap is largely over. The information you need has to come from
the endpoints, which means server side telemetry and client side reporting
rather than a span port.

**Middleboxes cannot help, and cannot hurt.** The encryption of transport state
was a deliberate design goal, motivated by decades of middleboxes ossifying TCP
by making assumptions about fields they were not supposed to touch. The upside
is that QUIC can evolve. The downside is that anything you were doing in the
middle of the network, you now do at an endpoint or not at all.

**CPU cost is real.** Userspace transport means per packet processing in the
application rather than the kernel, and UDP historically got less offload
attention than TCP. Generic segmentation and receive offload for UDP help a
great deal, so check that they are enabled before concluding QUIC is expensive
on your hardware.

## Poking At It Yourself

```bash
# Does the path allow UDP 443 at all? Point these at a host you
# know serves HTTP/3 and compare the two.
curl -sv --http3-only https://host-that-serves-h3.example/ -o /dev/null
curl -sv --http1.1     https://host-that-serves-h3.example/ -o /dev/null

# What does the server advertise? Alt-Svc over TCP is how clients
# learn that HTTP/3 is available in the first place.
curl -sI https://www.example.com/ | grep -i '^alt-svc'

# Watch UDP sockets on a host that is serving or consuming QUIC.
ss -u -a -n | head

# Confirm offload is on; UDP segmentation matters for QUIC throughput.
ethtool -k eth0 | grep -Ei 'udp|generic-(segmentation|receive)'

# Minimal allow rule. Do this deliberately rather than discovering
# six months later that everything silently fell back to TCP.
nft add rule inet filter forward udp dport 443 ct state new,established accept
```

My honest summary: QUIC is a better transport for users and a harder transport
for the people who run networks, and both of those are consequences of the same
design decision. The adaptation is to stop expecting the network to tell you
what is happening and to invest in endpoint telemetry instead. That is a shift
worth making anyway, since the trend toward encrypting everything in flight is
not going to reverse.

## References

- [RFC 9000: QUIC, A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000.html)
- [RFC 9001: Using TLS to Secure QUIC](https://www.rfc-editor.org/rfc/rfc9001.html)
- [RFC 9002: QUIC Loss Detection and Congestion Control](https://www.rfc-editor.org/rfc/rfc9002.html)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114.html)
- [RFC 9204: QPACK Field Compression for HTTP/3](https://www.rfc-editor.org/rfc/rfc9204.html)
- [QUIC](https://en.wikipedia.org/wiki/QUIC)
