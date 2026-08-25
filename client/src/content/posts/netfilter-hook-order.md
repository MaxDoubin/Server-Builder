
## The packet path is a pipeline, not a list

When people picture a Linux firewall they picture a list of rules read top to bottom. That is half right. Inside a chain, evaluation is top to bottom. But the chains themselves hang off fixed points in the kernel network stack, and which point you attached to decides what the packet even looks like when your rule sees it.

Netfilter defines five hooks for IP traffic:

- `prerouting`: every packet that arrives, before the routing decision.
- `input`: packets the routing decision said are for this host.
- `forward`: packets routed through this host to somewhere else.
- `output`: packets generated locally, before routing them out.
- `postrouting`: everything on its way out the door, after routing.

Two facts follow immediately. A packet destined for a container or a VM behind this box never touches `input`, so an input rule will never block it. And a packet leaving the box does not pass `forward` if this box created it, so a forward rule will never see your own health check traffic. Half the "my rule does nothing" reports I have looked at are one of those two.

## Priorities decide who goes first

Multiple base chains can register on the same hook. nftables resolves the tie with a signed priority number, lower runs first. The named constants map to the classic behaviour:

| Name | Value | Typical use |
| --- | --- | --- |
| raw | -300 | notrack, before connection tracking |
| mangle | -150 | packet mark, TTL, DSCP |
| dstnat | -100 | destination NAT, prerouting |
| filter | 0 | accept and drop decisions |
| srcnat | 100 | source NAT and masquerade, postrouting |

The consequence that bites people: destination NAT happens at priority -100 in prerouting, before the routing decision and before your filter chain. So by the time a forwarded packet reaches your filter rules, the destination address is already the internal one. You write your allow rule against `10.10.5.20:8080`, not against the public address you published. Source NAT is the mirror image: it happens in postrouting after filtering, so filter rules still see the original internal source address.

## A ruleset that says what it means

```nft
table inet fw {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
    iifname "wan0" tcp dport 443 dnat ip to 10.10.5.20:8443
  }

  chain input {
    type filter hook input priority filter; policy drop;

    ct state established,related accept
    ct state invalid drop
    iifname "lo" accept

    ip protocol icmp icmp type { echo-request, destination-unreachable, time-exceeded } accept
    iifname "mgmt0" tcp dport 22 accept

    limit rate 5/minute log prefix "fw-input-drop: "
  }

  chain forward {
    type filter hook forward priority filter; policy drop;

    ct state established,related accept
    iifname "lan0" oifname "wan0" accept
    iifname "wan0" oifname "lan0" ip daddr 10.10.5.20 tcp dport 8443 accept
  }

  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    oifname "wan0" masquerade
  }
}
```

Read the forward chain against the prerouting chain. The DNAT rule rewrote the destination to `10.10.5.20:8443`, and the forward rule matches that rewritten value. Writing `tcp dport 443` there would silently never match.

Notice also that the nat hooks have `policy accept`. A nat chain is not a filtering chain. Under the modern nf_tables NAT implementation only the first packet of a connection traverses the nat chain at all, and the rest of the flow is translated by connection tracking. Putting a drop policy on a nat chain is a way to break traffic in a way that is very hard to read from the ruleset.

## Connection tracking runs earlier than you think

`ct state` is available in your filter rules because conntrack registered its own hooks at a much lower priority, ahead of everything above. That has two operational consequences.

First, the `raw` priority exists so you can opt traffic out of tracking with `notrack` before the tracker sees it. On a box forwarding a large volume of short lived flows, the conntrack table is a finite resource and entries have timeouts measured in minutes for established TCP. When it fills, new flows are dropped and the kernel logs a table full message. Checking `nf_conntrack_count` against `nf_conntrack_max` is the first thing I do on a router that "randomly" refuses new connections.

Second, the `invalid` state is not noise. It usually means the tracker saw a packet that does not fit any flow it knows about, which happens with asymmetric routing, after a conntrack flush, or with out of window TCP segments. Dropping invalid early is right, but if you are dropping a lot of it, the interesting question is why the path is asymmetric.

## Debugging without guessing

Two commands answer most questions. `nft monitor trace` shows a packet walking the ruleset, rule by rule, once you flag the traffic:

```bash
nft add rule inet fw prerouting meta nftrace set 1 ip saddr 10.10.5.77
nft monitor trace
```

And counters tell you whether a rule is dead code:

```bash
nft --handle list ruleset | grep -n "counter packets 0"
```

A rule with zero packets after a day of traffic is either wrong or unnecessary, and both are worth knowing. I would rather delete a rule than keep a line that has never matched anything, because every line in a ruleset is something a future me has to reason about at two in the morning.

## References

- https://www.netfilter.org/
- https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks
- https://wiki.nftables.org/wiki-nftables/index.php/Main_Page
- https://man.archlinux.org/man/nft.8
- https://www.kernel.org/doc/html/latest/networking/nf_conntrack-sysctl.html
