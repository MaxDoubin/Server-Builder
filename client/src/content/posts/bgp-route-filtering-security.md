
## Why BGP Filtering Matters

BGP route leaks and hijacks happen because many networks do not filter what they accept or advertise. A misconfigured router at one AS can accidentally advertise another AS's prefixes, causing traffic to route through unexpected paths. In some cases, this is accidental. In others, it is intentional hijacking.

The internet is more stable when every AS filters aggressively. And your network is more secure when you only accept routes you expect from each peer.

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

## RPKI

RPKI (Resource Public Key Infrastructure) provides cryptographic validation that a prefix is authorized to be advertised by a specific AS. Route Origin Authorizations (ROAs) are published by IP address holders and validated by routers. Invalid prefixes (where the announcing AS does not match the ROA) can be dropped.

RPKI is one of the most effective tools for preventing BGP hijacking. Major ISPs and cloud providers now validate RPKI. If you run BGP, enable RPKI validation.

## AS Path Filtering

Limit the AS path length you accept. An AS path longer than a reasonable maximum (like 10 or 20 hops) is likely bogus or part of a route leak.
