
## The problem

You enable IPv6 on a router, or your ISP quietly turns it on for you, and suddenly half your traffic takes a path you never configured. A host has five addresses instead of one, `ping` works but `ping6` does not, and your firewall rules only cover IPv4 so the new protocol is wide open. None of that is IPv6 being exotic. It is IPv6 doing exactly what it was designed to do while you are still thinking in IPv4.

## Why IPv6 exists

IPv4 has approximately 4.3 billion addresses. The internet has more than 4.3 billion devices connected to it. The math does not work without NAT, and NAT creates its own complexity and problems. IPv6 solves this with a 128-bit address space that provides enough addresses for every device that will ever exist, many times over.

## The address space

An IPv6 address looks like this: `2001:db8:85a3::8a2e:370:7334`. It is 128 bits expressed in eight groups of four hexadecimal digits, separated by colons. Consecutive groups of zeros can be abbreviated with `::`.

A typical IPv6 prefix for a network segment is /64, which gives you 18 quintillion possible addresses on that segment. The idea of running out of addresses on a single subnet is gone.

There are rules for writing an address down, which matter more than they sound like they do because half of address confusion is two people writing the same address two ways. Leading zeros in a group are dropped. `::` replaces the longest run of consecutive zero groups and may appear only once. Hex digits are written lowercase. So `2001:0DB8:0000:0000:0000:0000:0000:0001` is written `2001:db8::1`, and nothing else is correct.

The ranges you will actually meet:

- `2000::/3` is global unicast, the routable internet. Anything starting with a 2 or 3 is a real address.
- `fe80::/10` is link-local. Every interface gets one automatically and it never routes off the link.
- `fc00::/7` is unique local, the rough analogue of RFC 1918 space. In practice you use `fd00::/8` and generate a random 40-bit global ID rather than picking `fd00::1` like everybody does.
- `ff00::/8` is multicast. `ff02::1` is all nodes on the link, `ff02::2` is all routers.
- `2001:db8::/32` is reserved for documentation, which is why it shows up in every example including mine.

There is no broadcast address in IPv6 at all. Everything broadcast used to do is now multicast to a specific group, which is a real efficiency win on a busy segment.

## What changes for network configuration

**No more NAT (mostly):** With enough addresses for every device to have a globally routable address, NAT is no longer necessary. Devices can communicate end-to-end directly.

**Stateless Address Autoconfiguration (SLAAC):** Devices can self-configure IPv6 addresses based on the network prefix advertised by routers. DHCP is still used in many enterprise environments, but SLAAC simplifies device configuration.

**Link-local addresses:** Every IPv6 interface automatically gets a link-local address (`fe80::/10`) that is used for on-link communication without needing global routing.

**Neighbor Discovery Protocol (NDP):** NDP replaces ARP for address resolution on local segments.

NDP is worth understanding properly because it is where most IPv6 weirdness lives. It runs over ICMPv6, not over a separate ethertype like ARP, and uses five message types: router solicitation (133), router advertisement (134), neighbor solicitation (135), neighbor advertisement (136), and redirect (137). A host boots, sends a router solicitation to `ff02::2`, and a router answers with an advertisement carrying the prefix, the default route, and a set of flags.

Those flags decide how the host configures itself. The A flag on a prefix says "build an address from this yourself". The M flag says "use DHCPv6 for addresses". The O flag says "use DHCPv6 for other information such as DNS servers, but build your own address". A network where the router advertises no prefix and no M flag will leave hosts with a link-local address and nothing else, which looks exactly like a broken network.

Address selection also changed. A modern host does not use a stable EUI-64 address derived from its MAC any more, because that leaks the hardware identity across every network it joins. It generates temporary privacy addresses that rotate, plus a stable per-network address. So one interface legitimately having five or six IPv6 addresses is normal and not a misconfiguration.

## What stays the same

Routing, firewall rules, VLANs, and most other networking concepts work the same way. You apply them to IPv6 addresses instead of IPv4 addresses. Your firewall still needs rules. Your switches still handle frames the same way. The mental model transfers directly.

## Seeing it work on a Linux host

```bash
ip -6 addr show dev eth0
```

Expected output on a working dual-stack segment:

```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP qlen 1000
    inet6 2001:db8:1234:1::a1b2:c3d4:e5f6:7890/64 scope global temporary dynamic
       valid_lft 86200sec preferred_lft 14200sec
    inet6 2001:db8:1234:1::1a2b:3c4d:5e6f:7a8b/64 scope global dynamic mngtmpaddr
       valid_lft 86200sec preferred_lft 14200sec
    inet6 fe80::5054:ff:fe12:3456/64 scope link
       valid_lft forever preferred_lft forever
```

Three things to read there. The `scope link` address is the link-local one and it is always present. The `scope global temporary` address is the rotating privacy address used for outbound connections. The lifetimes come straight from the router advertisement, and if `preferred_lft` is counting down toward zero with no router refreshing it, your router advertisements have stopped.

```bash
ip -6 route
```

```
2001:db8:1234:1::/64 dev eth0 proto ra metric 100 pref medium
fe80::/64 dev eth0 proto kernel metric 256 pref medium
default via fe80::1 dev eth0 proto ra metric 100 pref medium
```

Note the default route: `via fe80::1`, a link-local address. That is correct and normal. IPv6 next hops are link-local, which means your default gateway does not need a global address at all.

Then test reachability and look at the neighbor table:

```bash
ping -6 -c 3 2001:4860:4860::8888
ip -6 neigh show
```

A healthy neighbor entry ends in `REACHABLE` or `STALE`. An entry stuck in `INCOMPLETE` means neighbor solicitations are going out and nothing is answering, which is the IPv6 version of an unresolved ARP.

## Firewalling IPv6 correctly

This is the part that bites people who treat IPv6 as "IPv4 with longer addresses". Without NAT there is no accidental inbound protection, so every host with a global address is directly addressable from the internet the moment your ISP routes the prefix. Your stateful firewall policy has to be written twice, once per family, and on Linux that means `ip6tables` or an `nftables` `inet` table rather than assuming `iptables` covers it.

The second trap is blocking ICMPv6. On IPv4 you can filter most ICMP and get away with it. On IPv6 you cannot, because ICMPv6 carries neighbor discovery and path MTU discovery. Drop neighbor solicitations and the link stops resolving addresses. Drop Packet Too Big (type 2) and connections establish fine and then hang the moment anyone sends a full-size packet, because the minimum IPv6 MTU is 1280 bytes and routers do not fragment on your behalf. The source host has to be told to shrink, and Packet Too Big is the only way it finds out.

## What breaks

**A prefix that is not a /64.** SLAAC assumes a 64-bit interface identifier. Hand a segment a /112 or a /120 because it "only needs a few addresses" and autoconfiguration silently stops working while static addressing keeps working, so it looks like a client bug. Use /64 for every LAN segment, always. Point-to-point links between routers are the only common exception.

**Rogue router advertisements.** Any device on the segment can send an RA, and hosts will believe it. One misconfigured virtual machine bridging its host adapter can take over as default gateway for the whole VLAN. Switches have RA Guard for exactly this reason. Turn it on for access ports.

**Half-working dual stack, which is worse than no IPv6.** If AAAA records resolve but IPv6 forwarding is broken, clients try IPv6 first, wait for a timeout, then fall back to IPv4. Everything feels sluggish rather than broken, so nobody reports it as an outage. Happy Eyeballs shortens that stall but does not remove it. Either make IPv6 work end to end or turn it off; do not leave it half configured.

**Firewall rules that only exist for IPv4.** Covered above, and worth repeating because it is the most common real security failure when a network turns IPv6 on. Audit with `ip6tables -L -n -v` or `nft list ruleset` and confirm your default input policy is what you think it is.

**Logging and access lists that break on address format.** An allowlist containing `2001:db8:0:0:0:0:0:1` will not match a log line containing `2001:db8::1` if you are comparing strings. Normalize addresses before comparing them, and store them in a form your tooling parses rather than in whatever the device happened to print.

**Prefix delegation changing under you.** Many residential ISPs delegate a prefix that changes on reconnect. Every static IPv6 address you wrote down inside that prefix becomes wrong at 4 AM. Use ULA addressing for internal, must-not-change references and let the delegated global prefix be the disposable outer layer.

## Getting started

Most enterprise environments now operate dual-stack, running both IPv4 and IPv6 simultaneously. Start by enabling IPv6 on your homelab router, get a prefix delegation from your ISP if available, and experiment with connectivity. The best way to learn IPv6 is to use it.

Concretely: enable it on one VLAN, not all of them. Confirm hosts get a global address and a working default route. Write the firewall rules before you route the prefix, not after. Then break it on purpose, block ICMPv6 type 2 and watch large transfers hang, so that when it happens for real you recognise the symptom in thirty seconds instead of an afternoon.

## References

- https://www.rfc-editor.org/rfc/rfc8200
- https://www.rfc-editor.org/rfc/rfc4291
- https://www.rfc-editor.org/rfc/rfc4861
- https://www.rfc-editor.org/rfc/rfc4862
- https://www.rfc-editor.org/rfc/rfc8981
- https://www.rfc-editor.org/rfc/rfc5952
