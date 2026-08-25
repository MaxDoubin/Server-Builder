
## What SD-WAN Solves

Traditional WAN routing uses static routes or simple metrics to decide how traffic exits the network. A primary link fails, and you wait for the failover route to take over. Performance degrades silently. You have no visibility into what is actually happening across your WAN links.

SD-WAN adds active performance measurement and policy-based routing. The FortiGate constantly measures latency, jitter, and packet loss on each WAN link and makes routing decisions based on actual conditions.

The word "silently" is the key one. A static route only reacts to the interface going down. A DSL line that is up but dropping 8 percent of packets, or a cable link whose jitter has climbed to 90 ms because the neighbourhood got home from work, looks perfectly healthy to a static route and terrible to anyone on a voice call. Measuring the link rather than the interface is the whole idea.

## Basic SD-WAN Setup

First, create an SD-WAN zone and add your WAN interfaces:

```
config system sdwan
  set status enable
  config zone
    edit "virtual-wan-link"
      set members wan1 wan2
    next
  end
  config members
    edit 1
      set interface wan1
      set gateway 203.0.113.1
    next
    edit 2
      set interface wan2
      set gateway 198.51.100.1
    next
  end
end
```

If you are following an older guide and the CLI rejects this, it is because the command tree was renamed. `config system virtual-wan-link` became `config system sdwan` in FortiOS 6.4.1, and zones did not exist before that. A large fraction of the SD-WAN tutorials on the internet were written for 6.0 and 6.2 and will not paste into a current unit.

The gateway addresses above use RFC 5737 documentation ranges, so substitute your ISP's next hop. On a DHCP or PPPoE WAN you leave `gateway` unset and the member learns it dynamically.

Three ordering constraints will stop you cold:

- The interface must not already be referenced by a firewall policy or a static route. FortiOS returns `Interface is being used` and refuses. Remove the references first, add the member, then rebuild the policies against the zone.
- Once an interface is an SD-WAN member, firewall policies address the **zone**, not the raw interface. A policy with `wan1` as the outgoing interface stops being valid. This is the single most common reason a working firewall loses all internet access thirty seconds after SD-WAN is enabled.
- You still need a route. SD-WAN does not create one. Add a static default via the zone:

```
config router static
  edit 1
    set dst 0.0.0.0 0.0.0.0
    set distance 1
    set sdwan-zone "virtual-wan-link"
  next
end
```

Skip that and every SLA can be green while no traffic moves, because the routing table has nowhere to send it.

## Performance SLAs

Define what acceptable performance looks like for each type of traffic:

```
config system sdwan
  config health-check
    edit "Google_DNS"
      set server "8.8.8.8"
      set protocol ping
      set interval 500
      set failtime 3
      set recoverytime 5
      set latency-threshold 150
      set jitter-threshold 30
      set packetloss-threshold 1
    next
  end
end
```

The Fortinet defaults for the timing values are `interval` 500 ms (range 20 to 3600000), `failtime` 5 (range 1 to 3600), and `recoverytime` 5. The config above sets `failtime 3`, which is deliberately faster than default: detection time is `interval` multiplied by `failtime`, so 500 ms times 3 is 1.5 seconds to declare a member down, versus 2.5 seconds at the default. Recovery stays at 5 because you want a link to prove itself before traffic returns to it. Asymmetric fail and recover values are the standard anti-flap technique.

Tightening `interval` to 100 ms buys you sub-second detection and costs you ten probes per second per member per health check, on the CPU and on the link. On a 4-member SD-WAN with six health checks that is 240 probes per second of pure overhead. Measure before you tune.

The thresholds are the part people misunderstand. `latency-threshold 150` and friends do not cause anything on their own; they define what "meets SLA" means for rules that reference this health check. `0` disables a threshold. And crossing a threshold does not take the member down: the member is still up and usable, it simply stops satisfying the SLA, so rules configured to require the SLA move elsewhere while rules that only care about the member being alive stay put.

`failtime` being exceeded is different. When a member fails the health check outright, the FortiGate withdraws every static route associated with that interface. That is the mechanism by which failover actually happens, and it is also why an unrelated static route out that interface will disappear during a WAN blip.

Now the honest part about `8.8.8.8`. Probing a public DNS resolver tells you whether the general internet is reachable, and nothing about whether your application is. If the SaaS app your users need is having a bad day, the SLA stays green and SD-WAN keeps sending traffic into the problem. Public resolvers also deprioritise ICMP under load, so you can see phantom loss that has nothing to do with your circuit. Better options, in rough order: probe the actual far end of your overlay tunnel with `protocol ping`, probe the application with `protocol http` and `set http-get`, or use `protocol twamp` against a TWAMP responder, which is RFC 5357 and is designed for exactly this measurement rather than borrowed from a diagnostic tool.

## Rules

SD-WAN rules define which traffic uses which links based on the performance SLAs:

```
config system sdwan
  config service
    edit 1
      set name "Business_Apps"
      set dst "critical-servers"
      set priority-members 1 2
      set sla "Google_DNS" 1 2
    next
  end
end
```

`set mode` controls the selection strategy, and the default is `manual`, meaning it simply uses `priority-members` in the order listed. The options that matter:

- `manual` uses the first listed member, period. No SLA awareness.
- `priority` uses the first member that meets the SLA, falling to the next when it does not. This is the classic active/backup behaviour.
- `sla` uses any member meeting the SLA, load balancing across them, and falls back to the best available when none qualify.
- `load-balance` distributes across members regardless of quality.
- `best-quality` picks the single best member by whichever metric `set quality-link` or `sla-compare-method` names.

Rules are evaluated top to bottom by sequence number and the first match wins, exactly like firewall policies. If a rule is never taking effect, check whether a broader rule above it is catching the traffic first. Traffic that matches no rule falls through to the implicit rule, which uses the global `load-balance-mode`, defaulting to `source-ip-based`.

Add `set hold-down-time` to any rule you care about. It defaults to 0 seconds, which means the instant a preferred member recovers, traffic snaps back to it. If that member is marginal, you get sessions bouncing between links every few seconds. Setting `hold-down-time 30` makes a recovered link wait half a minute before it is preferred again.

For visibility, `set sla-fail-log-period 30` and `set sla-pass-log-period 30` on the health check write SLA transitions to the log every thirty seconds. Both default to 0, meaning disabled, which is why a new SD-WAN deployment has no history of why traffic moved last Tuesday.

## The Result

Traffic automatically routes over the best-performing link. When a link degrades below your SLA thresholds, traffic shifts to the healthier link without manual intervention. You get visibility into link performance through the FortiGate dashboard and can build detailed reports on WAN utilization over time.

With one large caveat that catches everybody: **SD-WAN decisions are made per session, at session setup.** An existing session does not move. A user on a two hour SSH session, a 40 GB file transfer, or an active video call stays on the degraded link until that session ends. New sessions go the new way immediately, which is why the dashboard shows the link change while the person complaining sees no improvement at all. If you need existing sessions to move, that is `set snat-route-change enable` in `config system global` for SNAT sessions, and even then it only applies when the route is actually withdrawn.

Useful verification commands:

```
diagnose sys sdwan health-check
diagnose sys sdwan service
diagnose sys sdwan member
```

The first shows current latency, jitter, and loss per member per health check plus the SLA pass or fail state. The second shows which members each rule is currently selecting and why.

## What SD-WAN Cannot Do

It cannot create bandwidth. If both links are saturated, moving traffic between them changes which users are unhappy, not how many. Saturation is a traffic shaping problem, and on FortiGate that is `config firewall shaping-policy`, a separate feature.

It cannot beat physics. A path with 180 ms of latency because it crosses an ocean will not improve because you measured it. SD-WAN picks the best of the paths you have.

It does not load balance a single session across links. Splitting one TCP flow packet-by-packet over paths with different latencies causes reordering, which TCP interprets as loss, which collapses throughput. Per-session distribution is a correctness requirement, not a limitation somebody forgot to fix. The consequence is that one large transfer gets one link's bandwidth, no matter how many links you own.

And it does nothing at a single-WAN site. If there is one circuit, there is no decision to make. What helps there is FEC over an IPsec overlay, which trades bandwidth for resilience against packet loss, and that is a different feature with a different set of tradeoffs.

## References

- https://docs.fortinet.com/document/fortigate/7.6.6/administration-guide/584396/sd-wan-performance-sla
- https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/580649/link-health-monitor
- https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/942095/sd-wan-members-and-zones
- https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/413288/sd-wan-rules-overview
- https://docs.fortinet.com/document/fortigate/7.4.3/administration-guide/256518/configuring-sd-wan-in-the-cli
- https://www.rfc-editor.org/rfc/rfc5357
