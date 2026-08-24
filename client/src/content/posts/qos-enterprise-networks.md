
## When QoS Matters

QoS is about managing contention. On an uncongested link, every packet gets through immediately regardless of its type. When a link is congested (more traffic than bandwidth), some packets get delayed or dropped. QoS controls which packets get priority in that situation.

The main use cases: ensuring voice (VoIP) stays clear even when the network is busy, prioritizing business-critical applications over bulk transfers, and limiting the impact of backup traffic on interactive workloads.

## The QoS Model

**Classification:** Mark traffic with a DSCP (Differentiated Services Code Point) value that indicates its priority. This is done as close to the source as possible.

**Queuing:** Network devices place packets into queues based on DSCP values. High-priority queues are served first.

**Policing and shaping:** Limit the bandwidth available to specific traffic classes. Shaping buffers excess traffic and sends it later; policing drops it.

## DSCP Values

The standard markings used in most enterprise environments:

| Traffic Type | DSCP Value | Per-Hop Behavior |
|---|---|---|
| VoIP | 46 | Expedited Forwarding |
| Video conferencing | 34 | Assured Forwarding 4 |
| Business critical | 26 | Assured Forwarding 3 |
| Best effort | 0 | Default |
| Scavenger (backups) | 8 | CS1 |

## Cisco Configuration

```
! Mark VoIP traffic from IP phones
class-map match-all VOIP
  match ip dscp ef

policy-map QOS-POLICY
  class VOIP
    priority 20  ! Guaranteed 20% bandwidth with strict priority
  class BUSINESS-APPS
    bandwidth percent 40
  class class-default
    fair-queue

interface GigabitEthernet0/1
  service-policy output QOS-POLICY
```

## Testing Your QoS Policy

Use iPerf to generate test traffic and verify that QoS is working as expected. Generate competing flows of different traffic types and measure whether the priority traffic maintains its performance while lower-priority traffic degrades.
