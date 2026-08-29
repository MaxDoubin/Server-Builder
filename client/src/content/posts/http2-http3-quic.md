
## What HTTP/2 fixed, and what it could not

HTTP/1.1 made you choose between one request at a time per connection or
opening six connections per origin. HTTP/2 replaced that with a binary framing
layer: one TCP connection carrying many independent streams, each a sequence of
frames tagged with a stream identifier, plus HPACK header compression so
repeated headers stop costing full bytes every request.

That removed head of line blocking at the HTTP layer. It could not remove it
at the transport layer, because TCP delivers a single ordered byte stream. If
one segment is lost, the kernel holds every byte that arrived after it until
the retransmission lands, no matter which HTTP stream those bytes belonged to.
On a clean network you never notice. On a lossy link, multiplexing over one
TCP connection can be worse than the six connections it replaced, since one
loss now stalls everything instead of one sixth of it.

You cannot fix that inside HTTP, because the layer that needs to know about
streams is the layer below.

## QUIC moves the transport into the application

QUIC is a transport built on UDP that knows about streams natively. HTTP/3 is
HTTP mapped onto it. The important pieces:

**Streams are a transport concept.** Loss recovery is per stream. A lost
packet carrying stream 7 delays stream 7 and nothing else.

**[TLS 1.3](/blog/tls-modern-encryption) is not layered on top, it is integrated.** There is no separate TCP
handshake followed by a TLS handshake. The cryptographic handshake and the
transport handshake happen together, which is where most of the connection
setup saving comes from.

**Connections are identified by a connection ID, not the 4-tuple.** A client
that moves from WiFi to cellular keeps the same connection across a change of
source address and port. That is genuinely new, and it is also the thing that
breaks assumptions in your infrastructure.

**Almost everything is encrypted, including transport metadata.** Packet
numbers, acknowledgements, and most header fields are inside the encryption.
A middlebox can see UDP, a few invariant bits, and the size and timing of
packets.

**0-RTT resumption exists and is replayable.** A resumed connection can carry
application data in the first flight, and an attacker who captures that flight
can replay it. Only idempotent requests belong there.

## What actually changes for the people running it

This is the part that gets skipped in protocol summaries, and it is the part
that costs you a weekend.

Your firewall has to permit UDP on 443 in both directions, and plenty of
enterprise and campus networks do not. Discovery happens through the `Alt-Svc`
response header or an HTTPS DNS record, and clients fall back to HTTP/2 when
UDP is blocked or the attempt times out. That fallback is a feature, but it
means you can deploy HTTP/3 and serve almost none of it without noticing.

```
alt-svc: h3=":443"; ma=86400
```

Load balancing changes shape. A layer 4 balancer hashing the 5-tuple will send
a migrated connection to a different backend, which breaks it. Balancing QUIC
correctly means steering on the connection ID, which means the balancer has to
understand the protocol rather than treating it as opaque UDP.

Your visibility gets worse in the ways you might expect. TCP-based monitoring
that inferred round trip time, retransmissions, and connection state from
passively observed headers sees very little in QUIC. Logging moves into the
endpoints, which is where it should have been, but it is a real migration.

CPU cost goes up. TCP runs in the kernel with decades of offload behind it.
QUIC runs in user space, per packet, with encryption on every packet including
the header protection. Segmentation and receive offload for UDP help a lot, as
does raising the UDP socket buffers, since an undersized receive buffer shows
up as loss that the protocol then treats as congestion.

```bash
# Does the origin actually offer and serve h3?
curl -sI --http3 https://example.com/
curl -sI --http2 https://example.com/ | grep -i alt-svc

# Is UDP/443 flowing at all, or is something in the middle eating it?
tcpdump -ni eth0 'udp port 443'

# Receive buffer headroom for a busy QUIC endpoint
sysctl net.core.rmem_max net.core.rmem_default
```

## How I would choose

For a service on a well provisioned wired network with clients that do not
move, HTTP/3 buys you very little. Loss is rare, so head of line blocking is
rare, and you are paying real CPU and operational complexity for it.

For anything serving mobile clients, lossy last miles, or long distance paths,
the argument is much stronger: fewer round trips to first byte, per stream loss
recovery, and connection survival across network changes are exactly what those
clients need.

For an internal service inside one data centre, I would not bother. The
failure modes it solves barely exist there, and the observability you give up
matters more.

The right posture, in my opinion, is to run both. Serve HTTP/2 as the reliable
baseline, advertise HTTP/3 through `Alt-Svc`, and let clients pick. Then check
your logs for the actual protocol version ratio, because that number is the
only honest measure of whether the deployment worked.

## References

- [RFC 9000: QUIC, A UDP-Based Multiplexed and Secure Transport](https://www.rfc-editor.org/rfc/rfc9000)
- [RFC 9001: Using TLS to Secure QUIC](https://www.rfc-editor.org/rfc/rfc9001)
- [RFC 9113: HTTP/2](https://www.rfc-editor.org/rfc/rfc9113)
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114)
- [RFC 9204: QPACK Field Compression for HTTP/3](https://www.rfc-editor.org/rfc/rfc9204)
- [RFC 7838: HTTP Alternative Services](https://www.rfc-editor.org/rfc/rfc7838)
