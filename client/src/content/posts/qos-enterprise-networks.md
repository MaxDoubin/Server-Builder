
## When QoS matters

Someone starts a large file copy and the phone call breaks up. A backup job kicks off at 5 p.m. and the video meeting turns into slideshow. Both of those are the same problem: a link with more traffic offered to it than it can carry, and no rule about which packet goes first.

QoS is about managing contention. On an uncongested link, every packet gets through immediately regardless of its type. When a link is congested (more traffic than bandwidth), some packets get delayed or dropped. QoS controls which packets get priority in that situation.

The main use cases: ensuring voice (VoIP) stays clear even when the network is busy, prioritizing business-critical applications over bulk transfers, and limiting the impact of backup traffic on interactive workloads.

## What QoS cannot do

QoS does not create bandwidth. If a link is saturated for hours, QoS decides who suffers, not whether anyone suffers. It buys you good behaviour through bursts of congestion measured in milliseconds and seconds. If your 1 Gbps uplink is pinned at 100 percent all afternoon, the answer is a bigger uplink, not a cleverer policy.

QoS also only applies where you control the queue. Marking a packet does nothing once it leaves your network: the internet at large has no obligation to honour your DSCP values, and most providers rewrite or ignore them. QoS is for links you own.

## The QoS model

**Classification:** Mark traffic with a DSCP (Differentiated Services Code Point) value that indicates its priority. This is done as close to the source as possible.

**Queuing:** Network devices place packets into queues based on DSCP values. High-priority queues are served first.

**Policing and shaping:** Limit the bandwidth available to specific traffic classes. Shaping buffers excess traffic and sends it later; policing drops it.

The piece people skip is the trust boundary. Every host can set its own DSCP values, and an application that marks its own traffic as expedited forwarding will happily starve your phones. Decide which ports you trust (an IP phone, a known server) and rewrite the DSCP to zero on everything else at the access port. Classification you did not authorise is not classification, it is a request from an untrusted device.

## Where the bits actually live

DSCP is the top 6 bits of the 8-bit DS field in the IP header, which is the byte that used to be called Type of Service in IPv4 and is Traffic Class in IPv6. Six bits gives 64 possible code points, 0 through 63. The remaining 2 bits of that byte are ECN, which is a separate mechanism and not yours to overwrite.

At layer 2, an 802.1Q VLAN tag carries a 3-bit Priority Code Point field, commonly called CoS or 802.1p, so 8 values instead of 64. Switches map between the two, and the mapping is where markings quietly disappear: an untagged access port has nowhere to put a CoS value, so layer 2 priority is lost the moment the frame leaves a trunk. DSCP is what survives across routers, so mark with DSCP and let the switch derive CoS from it.

## DSCP values

The standard markings used in most enterprise environments:

| Traffic Type | DSCP Value | Per-Hop Behavior |
|---|---|---|
| VoIP | 46 | Expedited Forwarding |
| Video conferencing | 34 | Assured Forwarding 4 |
| Business critical | 26 | Assured Forwarding 3 |
| Best effort | 0 | Default |
| Scavenger (backups) | 8 | CS1 |

Those numbers are not arbitrary. Expedited Forwarding is defined in RFC 3246, recommended code point 46. The Assured Forwarding group in RFC 2597 defines four classes with three drop precedences each, which is where 34 (AF41) and 26 (AF31) come from. RFC 4594 has the reasoning behind a full class map. One update worth knowing: the modern marking for deliberately-lower-than-best-effort traffic is the Lower Effort PHB of RFC 8622, code point 1, rather than the older CS1 value of 8. Plenty of designs still use CS1, and that is fine as long as everyone on the path agrees.

## Cisco configuration

```
! Mark VoIP traffic from IP phones
class-map match-all VOIP
  match ip dscp ef

policy-map QOS-POLICY
  class VOIP
    priority percent 20  ! Strict priority, capped at 20% of the link
  class BUSINESS-APPS
    bandwidth percent 40
  class class-default
    fair-queue

interface GigabitEthernet0/1
  service-policy output QOS-POLICY
```

Write the units you mean. In the Cisco MQC, `priority percent 20` is a percentage of the interface rate, while a bare `priority 20` is 20 kilobits per second, which is not a policy, it is a punishment. The same applies to `bandwidth`.

Note also that `priority` is a strict-priority queue with an implicit policer. Traffic in that class is served ahead of everything else, but only up to the configured rate; above it, packets are dropped rather than allowed to starve the other classes. That policer is a feature. Without it, one misbehaving flow marked EF can consume the entire link.

QoS policies apply in the outbound direction on the interface where congestion happens. Applying a shaping policy inbound on the interface where traffic arrives does very little, because by then the packets have already crossed the constrained link.

## A worked example on Linux

You do not need enterprise switches to see this work. Linux `tc` will shape an interface and let you watch the counters. This caps eth0 at 100 Mbit and gives a priority band to DSCP EF traffic:

```bash
# Shape eth0 to 100 Mbit with a two-band priority scheme
sudo tc qdisc add dev eth0 root handle 1: htb default 20
sudo tc class add dev eth0 parent 1: classid 1:1 htb rate 100mbit
sudo tc class add dev eth0 parent 1:1 classid 1:10 htb rate 20mbit ceil 20mbit prio 0
sudo tc class add dev eth0 parent 1:1 classid 1:20 htb rate 80mbit ceil 100mbit prio 1

# Send DSCP EF (46, which is 0xb8 in the full TOS byte) to the priority class
sudo tc filter add dev eth0 protocol ip parent 1: prio 1 u32 \
    match ip tos 0xb8 0xfc flowid 1:10
```

The `0xfc` mask matters: it masks off the two ECN bits so you match the 6 DSCP bits and not a specific ECN state. Matching `0xb8` with no mask will silently miss most of your EF traffic.

Check it with:

```bash
sudo tc -s class show dev eth0
```

Correct output shows non-zero `Sent` bytes on both classes and, under load, a growing `dropped` or `overlimits` count on the bulk class while the priority class stays clean:

```
class htb 1:10 parent 1:1 prio 0 rate 20Mbit ceil 20Mbit
 Sent 41203984 bytes 28617 pkt (dropped 0, overlimits 0 requeues 0)
class htb 1:20 parent 1:1 prio 1 rate 80Mbit ceil 100Mbit
 Sent 918440221 bytes 623115 pkt (dropped 4471, overlimits 20933 requeues 0)
```

Drops on the bulk class with zero drops on the priority class is the policy working. Zero drops everywhere means you never actually congested the link and have not tested anything.

## Testing your QoS policy

Use iPerf to generate test traffic and verify that QoS is working as expected. Generate competing flows of different traffic types and measure whether the priority traffic maintains its performance while lower-priority traffic degrades.

Concretely: start a long TCP flow to saturate the link, then run a small UDP flow marked EF alongside it and watch jitter and loss on the UDP stream. iPerf3 will set the DSCP for you with `-S`, which takes the full TOS byte, so EF is `-S 0xb8`:

```bash
# Saturate the link with unmarked bulk traffic
iperf3 -c 10.0.20.5 -t 60 -P 4

# In another terminal, the "voice" flow
iperf3 -c 10.0.20.5 -u -b 1M -l 200 -S 0xb8 -t 60
```

A passing test is the UDP flow reporting jitter in the low single-digit milliseconds and loss under about 1 percent while the TCP flows are eating the rest of the link. If the UDP flow shows tens of milliseconds of jitter, your marking is not surviving the path or your priority queue is not being applied where the congestion is.

On the switch itself, `show policy-map interface GigabitEthernet0/1` gives you per-class packet and drop counters. Those counters are the ground truth. If the class you expect to match shows zero packets, your classification is wrong, and no amount of queue tuning will help.

## Common mistakes

**Marking traffic but never queuing it.** Setting DSCP values does nothing on its own. The mark is only an instruction to a device that has a policy configured. A network where every packet is beautifully classified and no interface has a service policy behaves exactly like a network with no QoS.

**Applying the policy in the wrong direction or the wrong place.** Congestion happens at the point where a fast link feeds a slow one. That is the interface that needs an output policy. Policing inbound at the far end of an already-congested circuit does not help, because the damage was done upstream.

**Trusting DSCP from end hosts.** Anything can set DSCP 46. If your access ports trust incoming markings, one workstation running a marked bulk transfer sits in the voice queue. Rewrite DSCP to 0 at untrusted access ports and mark it yourself based on what you know about the traffic.

**Putting too much in the priority queue.** A strict-priority queue sized at 50 percent of the link is not a priority queue, it is a second best-effort queue with extra steps. Keep the sum of your priority classes small, conventionally around a third of the link at most, so the queue is genuinely empty most of the time. Latency in a priority queue only stays low while it stays short.

**Confusing shaping with policing.** Shaping buffers and delays; policing drops. Policing TCP hard produces retransmits and sawtooth throughput far worse than the raw rate limit suggests. Where the provider polices you, shaping slightly below the contracted rate beats letting their policer do the dropping. And remember that a deep buffer does not prevent loss, it converts loss into delay: on a lab router, switching the WAN interface to fq_codel often does more for real latency than a hand-built DSCP scheme.

## References

- https://www.rfc-editor.org/rfc/rfc2474
- https://www.rfc-editor.org/rfc/rfc2475
- https://www.rfc-editor.org/rfc/rfc2597
- https://www.rfc-editor.org/rfc/rfc3246
- https://www.rfc-editor.org/rfc/rfc4594
- https://man7.org/linux/man-pages/man8/tc.8.html
