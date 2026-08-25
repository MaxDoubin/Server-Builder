
## What BGP Actually Is

BGP (Border Gateway Protocol) is the routing protocol that connects autonomous systems on the internet. Unlike interior routing protocols like OSPF or EIGRP, BGP is designed for policy-based routing between organizations. It is not just about finding the shortest path. It is about controlling which paths are preferred, which ones are advertised, and which ones are filtered entirely.

If you have ever wondered how traffic flows between your ISP and the rest of the internet, the answer is BGP.

The current version is BGP-4, specified in RFC 4271. Two structural facts explain most of its behaviour. First, it runs over TCP on port 179, so peers must already reach each other at layer 3 before BGP can start, and a session that will not come up is very often a firewall or an ACL rather than a BGP problem. Second, it is a path-vector protocol: it builds no map of the network the way OSPF does. Each speaker advertises the paths it has chosen, along with the autonomous systems those paths cross, and loop prevention is nothing cleverer than a router refusing a route that already contains its own AS number.

## Key Concepts

**Autonomous Systems (AS):** Every network that participates in BGP has an AS number (ASN). This is how BGP identifies routing domains. Large ISPs, cloud providers, and universities all have their own ASNs.

ASNs were originally 16 bits, giving 0 through 65535, and that space ran out. RFC 6793 extended them to 32 bits. For labs and internal use, RFC 6996 reserves 64512 through 65534 as private, which is what the configuration below uses.

**eBGP vs iBGP:** External BGP (eBGP) runs between different autonomous systems. Internal BGP (iBGP) runs within the same AS, typically to distribute routes learned from eBGP peers throughout the network.

The difference is not cosmetic and it is where most beginners lose a weekend. Because AS_PATH does not change inside an AS, iBGP cannot use it for loop prevention, so the rule is: **a route learned from one iBGP peer is never advertised to another iBGP peer.** That is why classic iBGP needs a full mesh, and why session count grows as n(n-1)/2, or 45 sessions for ten routers. Route reflectors (RFC 4456) and confederations (RFC 5065) break that scaling wall.

The second iBGP trap is the next hop. A route learned over eBGP keeps the external peer's address as its next hop when passed to iBGP peers, and your interior routers usually have no route to it. The prefix shows up in the table marked inaccessible and nothing works. The fix is one line, `neighbor x.x.x.x next-hop-self`.

**BGP Attributes:** BGP uses path attributes to make routing decisions. The most important ones are:
- **AS Path:** The list of AS numbers a route has traversed. Shorter is generally preferred.
- **Local Preference:** Used internally to prefer one exit point over another.
- **MED:** Multi-Exit Discriminator, used to suggest preferred ingress points to external peers.
- **Next Hop:** The next-hop IP for reaching a destination.

Those attributes are consulted in a fixed order, and knowing that order is the difference between predicting what BGP will do and guessing. On Cisco the sequence is: highest weight (a Cisco-only local value, default 32768 for routes you originate), then highest local preference (default 100), then locally originated routes, then shortest AS path, then lowest origin type, then lowest MED, then eBGP over iBGP, then lowest IGP metric to the next hop, and finally tiebreakers on age, router ID, and peer address. Notice that AS path is fourth. Local preference beats it every time, which is exactly why local preference is the knob you use to steer outbound traffic.

Steering inbound traffic is much harder, and this is the honest limitation nobody mentions up front. Local preference never leaves your AS. MED is a hint to a directly connected neighbour that many providers ignore outright. The blunt tool that works is AS path prepending, adding your own ASN two or three times so the path looks longer to everyone else running the algorithm above. You cannot make the internet send traffic where you want it. You can only make one path look worse and hope.

One more attribute matters in practice. **Communities** (RFC 1997) are 32-bit tags, conventionally written as `ASN:value`, that carry no meaning of their own; providers publish a list of communities you can tag your announcements with to request behaviours like "do not export to peers" or "prepend twice in Europe". RFC 8092 added large communities so that 32-bit ASNs fit.

## Basic Configuration

```
router bgp 65001
  neighbor 192.168.1.2 remote-as 65002
  neighbor 192.168.1.2 description UPSTREAM_ISP
  network 10.0.0.0 mask 255.255.255.0
```

Read that `network` statement carefully, because it does not do what it looks like. It does not announce a range you would like to advertise; it says "if an exactly matching route for 10.0.0.0/24 is already in the routing table, put it into BGP". Get the mask wrong by one bit, or have no matching route yet, and BGP silently announces nothing. The standard trick is a static route to Null0 so the prefix always exists.

## Reading a Session That Will Not Come Up

BGP's state machine has six states, and the useful thing is that each one points at a different layer. **Idle** means BGP is not even trying, usually because there is no route to the peer. **Connect** and **Active** are both TCP problems: Active in particular sounds positive and is not, it means the router keeps trying to open a TCP session and keeps failing, which is almost always a firewall blocking 179 or a wrong peer address. **OpenSent** and **OpenConfirm** mean TCP worked and the peers are arguing about parameters, so check for an AS number mismatch or an authentication mismatch. **Established** is the only good state.

Once established, the session is kept alive by KEEPALIVE messages. The RFC 4271 default hold time is 180 seconds with keepalives every 60, and peers negotiate down to the lower of their two values. So the default time to notice a dead peer whose link stayed up is three minutes. Bidirectional Forwarding Detection (RFC 5880) drops that into the sub-second range by running a lightweight hello outside BGP itself.

## What Actually Goes Wrong

**The session is up and no routes appear.** On any implementation that follows RFC 8212, and FRR does by default, an eBGP peer with no configured import and export policy exchanges nothing at all. This is deliberate: the old default of announcing everything was how accidental leaks happened. If you have configured a peer and both sides show Established with zero prefixes, you are missing a route-map or a prefix-list, not a neighbor statement.

**Somebody sends you the whole internet.** The global IPv4 table is now around a million prefixes. If a customer or a lab peer re-announces the full table to you, a software router runs out of memory and a hardware router runs out of FIB space, which is the worse failure because forwarding breaks while the control plane looks healthy. In 2014 the table crossed 512,000 routes and knocked over a generation of Cisco 6500 and 7600 platforms whose TCAM was partitioned for exactly that many. Set `neighbor x maximum-prefix` on every peer, sized to what that peer should legitimately send.

**A route leak.** Taking routes from one provider and announcing them to another makes you a transit provider for traffic you cannot carry. RFC 7908 catalogues the shapes this takes, and the examples are famous: Pakistan Telecom taking YouTube off the internet in 2008, and AS7007 in 1997. The defence is filtering in both directions with prefix lists and AS path filters. RFC 9234 adds BGP roles and the Only-To-Customer attribute so routers can spot the leak themselves rather than trusting everyone's filters.

**Origin hijacking.** BGP has no built-in way to know whether an AS is entitled to announce a prefix. RPKI route origin validation (RFC 6811) is the deployed partial answer: prefix holders publish signed objects, and your router marks routes Valid, Invalid, or NotFound so you can drop the Invalids. It validates the *origin* AS only and not the rest of the path, so an attacker who prepends the legitimate origin still passes. RFC 7454, published as BCP 194, is the practical checklist and the most useful thing to read after RFC 4271.

**Slow convergence that looks like a broken config.** BGP is deliberately not fast. Cisco's default minimum route advertisement interval is 30 seconds for eBGP, so a prefix that changes repeatedly is not re-announced immediately. That damping is a feature at global scale and a nuisance in a lab, where it looks like your change did not take effect.

## Why It Matters in the Real World

Even if you work in enterprise networking rather than ISP networking, BGP comes up constantly. Cloud providers use it for connecting on-premises networks to AWS, Azure, or GCP via Direct Connect or ExpressRoute. SD-WAN solutions often use BGP internally. Understanding BGP makes you a much more effective network engineer.

It has also moved inside the data centre. RFC 7938 describes using eBGP as the only routing protocol in a large Clos fabric, giving every switch its own private ASN, and that design is now common enough that plenty of engineers meet BGP on a top-of-rack switch before they ever meet it on a border router.

## Where BGP Is The Wrong Tool

BGP knows about reachability and policy. It knows nothing about latency, bandwidth, jitter, or load. AS path length counts networks crossed, not distance or speed, so a two-AS path over a congested transatlantic link beats a three-AS path over an idle domestic one every time. If your problem is "pick the fastest path right now", the answer is SD-WAN or performance-based routing that measures paths and manipulates BGP from outside.

Do not reach for it inside a small network either. In a campus, OSPF converges in seconds where BGP takes minutes and needs far less configuration to do the right thing. BGP earns its complexity when you have policy to express between organisations, or a fabric large enough that link-state flooding becomes the problem.

## Where to Practice

You can run BGP labs in GNS3 or EVE-NG using virtual Cisco or FRR routers. Start with a simple two-AS topology, peer them, and watch the route tables populate. Then add filters and attributes to see how routing decisions change.

Containerlab with FRR is the lightest way in now: a multi-AS topology defined in a YAML file, running as containers on a laptop, up in seconds. Build the lab, break it deliberately, and read `show bgp summary` and `show bgp ipv4 unicast <prefix>` until best-path selection stops being a list you memorised and becomes something you can see in the output.

## References

- https://www.rfc-editor.org/rfc/rfc4271
- https://www.rfc-editor.org/rfc/rfc4456
- https://www.rfc-editor.org/rfc/rfc8212
- https://www.rfc-editor.org/rfc/rfc7454
- https://www.rfc-editor.org/rfc/rfc6811
- https://docs.frrouting.org/en/latest/bgp.html
