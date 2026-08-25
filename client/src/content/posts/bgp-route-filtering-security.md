
## Why BGP Filtering Matters

BGP route leaks and hijacks happen because many networks do not filter what they accept or advertise. A misconfigured router at one AS can accidentally advertise another AS's prefixes, causing traffic to route through unexpected paths. In some cases, this is accidental. In others, it is intentional hijacking.

The internet is more stable when every AS filters aggressively. And your network is more secure when you only accept routes you expect from each peer.

RFC 4271 is worth knowing here for what it does not say. BGP as specified has no mechanism for verifying that the AS originating a prefix is entitled to it, and no mechanism for verifying that an AS path was actually traversed. Every protection described below is bolted on top. RFC 7454 collects the operational practices into a BCP, and RFC 7908 gives route leaks a formal taxonomy, which is useful because "leak" gets used for at least six structurally different failures.

## Prefix Lists

Prefix lists filter routes based on the network prefix and prefix length. Use them to whitelist specific prefixes from peers and to control what you advertise:

```
ip prefix-list PEER-IN permit 192.0.2.0/24
ip prefix-list PEER-IN permit 198.51.100.0/24
ip prefix-list PEER-IN deny 0.0.0.0/0 le 32  ! Deny everything else

ip prefix-list MY-PREFIXES permit 203.0.113.0/24

router bgp 65001
  neighbor 10.0.0.2 prefix-list PEER-IN in
  neighbor 10.0.0.2 prefix-list MY-PREFIXES out
```

The `ge` and `le` keywords are where most people go wrong, so be precise about them. A bare `permit 192.0.2.0/24` matches that prefix and that prefix only. It does not match 192.0.2.0/25 or 192.0.2.128/25. Adding `le 32` widens the match to the /24 and everything more specific inside it, and `ge 25 le 32` matches only the more specifics without the /24 itself. Which one you want depends entirely on whether your customer deaggregates, and getting it backwards produces either a dropped legitimate announcement or an accepted hijack of a more specific.

Entries are evaluated in sequence order with an implicit deny at the end, so the explicit `deny 0.0.0.0/0 le 32` above is documentation rather than function. Keep it anyway; the person reading the config at 2am benefits.

Two operational notes. On IOS the filter does not apply to routes already in the table, so a policy change needs `clear ip bgp 10.0.0.2 soft in`, which uses the route refresh capability from RFC 2918 rather than tearing the session down. And default behaviour differs by vendor in a way that has caused real incidents: IOS with no export policy advertises everything it knows, while Junos with no export policy advertises nothing. Never assume the safe default is the one you are used to.

## The Filter That Saves You When the Others Fail

```
router bgp 65001
  neighbor 10.0.0.2 maximum-prefix 100 90 restart 15
```

A maximum prefix limit is the cheapest protection in BGP. It warns at 90 percent of the limit and shuts the session down when the limit is crossed, so a peer that suddenly starts announcing the full table hits a wall instead of blackholing your traffic. Size it from what the peer actually sends, with headroom, and revisit it. For context on scale: the global IPv4 routing table is on the order of a million prefixes and IPv6 is a couple hundred thousand, so a peer that should be sending you twelve prefixes and starts sending 400,000 is unambiguous.

## Bogon Filtering

Never accept or advertise bogon prefixes: RFC 1918 private addresses, loopback addresses, documentation ranges, or prefixes shorter than /8 or longer than /24.

```
ip prefix-list BOGONS deny 10.0.0.0/8 le 32
ip prefix-list BOGONS deny 172.16.0.0/12 le 32
ip prefix-list BOGONS deny 192.168.0.0/16 le 32
ip prefix-list BOGONS deny 127.0.0.0/8 le 32
ip prefix-list BOGONS deny 0.0.0.0/8 le 32
ip prefix-list BOGONS permit 0.0.0.0/0 le 32
```

That list is incomplete in a way worth fixing. RFC 6890 maintains the authoritative registry of IPv4 special-purpose addresses, and the ones missing above show up in the wild: 100.64.0.0/10 (carrier-grade NAT), 169.254.0.0/16 (link-local), 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24 (documentation), 198.18.0.0/15 (benchmarking), 224.0.0.0/4 (multicast), and 240.0.0.0/4 (reserved). Add `deny 0.0.0.0/0 ge 25` to catch prefixes longer than /24, which the DFZ generally will not carry anyway.

Be honest about the distinction between two things that both get called bogons. Special-purpose ranges like the above are static and safe to hardcode. Unallocated address space is not: it changes as the RIRs issue blocks, and a hand-maintained "full bogon" list becomes a filter that blackholes legitimate new allocations. Either subscribe to a maintained feed or restrict your static filter to the special-purpose registry and let RPKI handle the rest.

## RPKI

RPKI (Resource Public Key Infrastructure) provides cryptographic validation that a prefix is authorized to be advertised by a specific AS. Route Origin Authorizations (ROAs) are published by IP address holders and validated by routers. Invalid prefixes (where the announcing AS does not match the ROA) can be dropped.

RPKI is one of the most effective tools for preventing BGP hijacking. Major ISPs and cloud providers now validate RPKI. If you run BGP, enable RPKI validation.

Mechanically, the router does no cryptography. A separate relying-party validator fetches and verifies the ROA set, then feeds the router a list of validated prefix-to-origin pairs over the RTR protocol from RFC 6810 and RFC 8210. RFC 6811 defines the three outcomes the router then computes for each announcement: **Valid** (a ROA covers the prefix and the origin AS matches), **Invalid** (a ROA covers the prefix and the origin does not match, or the prefix is longer than the ROA's maxLength), and **NotFound** (no ROA covers it at all).

Drop Invalid. Do not drop NotFound. A large share of the table still has no ROA, and more importantly, if your validator becomes unreachable every route in the world degrades to NotFound. A policy that drops NotFound turns a dead validator into a total outage.

The mistake that undoes the whole exercise is maxLength. A ROA covers a prefix plus a maximum length, and setting maxLength to /24 on a /20 you announce as a single /20 means a hijacker announcing your 203.0.113.0/24 with your AS number produces an announcement that is RPKI Valid and more specific than yours, so it wins. RFC 9319 is explicit: set maxLength equal to the prefix length unless you genuinely announce the more specifics yourself.

And be clear on the boundary. RPKI origin validation validates the origin, nothing else. An attacker who prepends your AS at the end of a forged path produces an announcement that validates cleanly. Path validation is what BGPsec (RFC 8205) was designed for, and BGPsec is essentially undeployed. The practical partial answer today is RFC 9234, which adds a peering role to the OPEN message and an Only-to-Customer attribute that lets a leak be detected automatically rather than filtered by hand.

## AS Path Filtering

Limit the AS path length you accept. An AS path longer than a reasonable maximum (like 10 or 20 hops) is likely bogus or part of a route leak.

Pick that maximum carefully, because AS path prepending is a normal traffic engineering technique and a legitimate route from a multihomed network prepending itself five times can genuinely exceed 15 hops. Typical paths in the DFZ are four or five ASes long, and Cisco's `bgp maxas-limit` is conventionally set around 50 to 75. That catches the pathological announcements, some of which carry hundreds of ASes and have historically crashed router software, without discarding a customer who is prepending to steer traffic.

Two other path filters earn their place. Reject any path containing a private AS number, since 64512 to 65534 and the 32-bit range 4200000000 to 4294967294 defined in RFC 6996 should never appear in the DFZ, and neither should 23456, the AS_TRANS placeholder from RFC 6793. And reject any path containing your own AS number on inbound from a peer, which is a loop you did not create.

```
ip as-path access-list 10 deny _(6451[2-9]|645[2-9][0-9]|64[6-9][0-9][0-9]|65[0-9][0-9][0-9])_
ip as-path access-list 10 permit .*
```

## What Filtering Cannot Fix

None of this authenticates the data plane. Every mechanism here constrains what routes are accepted; none of it verifies that traffic actually followed the path the routes described. A transit provider that accepts your announcement correctly can still route your packets wherever it likes.

Filtering also cannot protect you from your own upstream. If your transit provider accepts a hijack of your prefix from someone else, your inbound traffic is diverted before it ever reaches a router you control. That is why the useful framing is not "protect my network" but "everyone filters their customers." The MANRS actions codify this: filter customer announcements, prevent source address spoofing, keep routing data in the IRR and RPKI current, and be reachable when someone needs to tell you about a leak. Publishing accurate ROAs is the single highest-value thing a small network can do, because it lets everyone else's filters protect you.

## References

- https://www.rfc-editor.org/rfc/rfc4271
- https://www.rfc-editor.org/rfc/rfc7454
- https://www.rfc-editor.org/rfc/rfc7908
- https://www.rfc-editor.org/rfc/rfc6811
- https://www.rfc-editor.org/rfc/rfc9319
- https://www.rfc-editor.org/rfc/rfc6890
