
## What OSPF Does

OSPF (Open Shortest Path First) is a link-state routing protocol. Every router running OSPF builds a complete map of the network topology (the Link State Database) and uses Dijkstra's algorithm to calculate the shortest path to every destination. This is different from distance-vector protocols like RIP, where routers only know what their neighbors tell them.

OSPFv2 is defined in RFC 2328 and runs directly over IP as protocol number 89, not over TCP or UDP. Packets go to the multicast addresses 224.0.0.5 (all OSPF routers) and 224.0.0.6 (the designated routers), both of which are link-local and never forwarded. That is worth knowing when you write an ACL on a transit interface: filtering protocol 89 kills the adjacency, and filtering it in one direction only produces a much more confusing failure than filtering it in both.

## Key Concepts

**Areas:** OSPF divides networks into areas to limit the scope of topology information. Area 0 is the backbone. All other areas must connect to Area 0. This design keeps routing databases from growing too large in big networks.

**DR and BDR:** On multi-access networks like Ethernet, OSPF elects a Designated Router (DR) and Backup DR (BDR). These routers reduce OSPF traffic by acting as a hub for LSA flooding. Routers form adjacencies with the DR/BDR rather than with every other router.

The election takes the highest OSPF interface priority, default 1, and breaks ties on the highest router ID. A priority of 0 makes a router ineligible. The part that catches people is that the election is not preemptive: bring up a router with priority 255 on a segment that already has a DR and it will not take over, it waits until the current DR disappears. If you want a specific DR, set the priorities before the segment comes up, or clear the process afterwards.

**Metric (Cost):** OSPF uses cost as its metric, calculated as a reference bandwidth divided by interface bandwidth. By default, the reference bandwidth is 100 Mbps, which means gigabit and faster interfaces all get cost 1. Always configure the reference bandwidth to match your fastest links.

The default comes straight from Cisco's implementation of RFC 2328's guidance that cost should be inversely proportional to bandwidth, with 10^8 bits per second as the numerator. That was a reasonable choice in 1998. Today it means a 1 Gbps link, a 10 Gbps link, and a 100 Gbps link all have cost 1, and OSPF load balances across them equally.

**Router ID:** A 32-bit value written like an IPv4 address, chosen in a fixed order: an explicit `router-id` statement, else the highest IP on a loopback, else the highest IP on an active physical interface. Always set it explicitly, because the fallback means a router picks a new identity when an interface changes. Changing it later needs `clear ip ospf process`, which is disruptive, so set it on day one. Two routers sharing a router ID produce adjacencies that form and immediately drop, over and over.

## Basic Configuration (Cisco)

```
router ospf 1
  router-id 1.1.1.1
  auto-cost reference-bandwidth 10000  ! Reference 10Gbps
  network 10.0.0.0 0.255.255.255 area 0
  passive-interface GigabitEthernet0/1  ! Don't send hellos on this interface
```

The reference bandwidth has to be identical on every router in the domain. Set it on some routers and not others and the two groups compute different costs for the same links, which produces asymmetric routing and occasionally loops during convergence. It is a domain-wide constant, not a per-router tuning knob.

`passive-interface` stops hellos on an interface but still advertises that interface's network. That is exactly what you want facing servers and users. The safer idiom in a real network is to invert it:

```
router ospf 1
  passive-interface default
  no passive-interface GigabitEthernet0/0
```

Now a new interface is passive until someone deliberately enables OSPF on it, rather than shouting hellos at whatever is plugged in.

One more line worth adding on every router-to-router link that is genuinely point to point:

```
interface GigabitEthernet0/0
  ip ospf network point-to-point
```

Ethernet defaults to the broadcast network type even on a /30 between two routers, which means a pointless DR election, a type 2 network LSA nobody needs, and a slower recovery when the link comes back. Declaring it point to point removes all three.

## Tuning Hello and Dead Intervals

OSPF uses hello packets to detect neighbor failures. The default hello interval is 10 seconds, dead interval 40 seconds. In a lab or point-to-point environment, you can reduce these for faster convergence:

```
interface GigabitEthernet0/0
  ip ospf hello-interval 5
  ip ospf dead-interval 15
```

Both values must match on both ends of the link or the adjacency never forms, and changing the hello interval on Cisco silently changes the dead interval to four times the new value unless you set it yourself. On NBMA network types the defaults are different again, 30 and 120 seconds.

There is a limit to how far this scales. Hellos are processed by the control plane, so aggressive timers turn a brief CPU spike, a software upgrade, or a burst of punted traffic into a false neighbor loss and a full reconvergence. When you need sub-second detection, use BFD instead. BFD (RFC 5880) runs a lightweight dedicated session, often offloaded to hardware, and tells OSPF to tear the adjacency down the moment the path fails:

```
interface GigabitEthernet0/0
  bfd interval 300 min_rx 300 multiplier 3
  ip ospf bfd
```

## The Neighbor State Machine Is Your Debugger

`show ip ospf neighbor` prints a state, and each stuck state means something specific. This is the fastest diagnostic path in the protocol.

**Stuck in INIT.** This router hears the neighbor's hellos, but the neighbor is not listing this router's ID in its own hellos. Communication is one-way. Look for an ACL applied in one direction, a unidirectional fiber fault, or multicast being filtered on one side.

**Stuck in 2-WAY.** Usually not a problem at all. On a broadcast segment, routers that are neither DR nor BDR deliberately stay at 2-WAY with each other and only go Full with the DR and BDR. If you see two DROther routers at 2-WAY, that is the protocol working. If you see 2-WAY on a point-to-point link, that is a real fault.

**Stuck in EXSTART or EXCHANGE.** This is an MTU mismatch, nearly every time. Database Description packets carry the sending interface's MTU, and RFC 2328 says a router must reject a DD packet whose MTU exceeds its own. So a 1500-byte side and a 9000-byte side exchange hellos happily, form a neighbor relationship, and then hang forever at ExStart. Fix the MTU on both interfaces. `ip ospf mtu-ignore` will paper over it, and then large LSAs get dropped and you get a much worse intermittent problem later.

**Adjacency never forms at all.** Area ID, hello and dead intervals, authentication type and key, stub or NSSA flags, and (on broadcast networks) [subnet mask](/blog/subnetting-practical-guide) must all match. `debug ip ospf adj` names the specific mismatch, which is faster than comparing configs by eye.

## OSPF Authentication

Always configure OSPF authentication in production to prevent unauthorized routers from injecting routes:

```
interface GigabitEthernet0/0
  ip ospf authentication message-digest
  ip ospf message-digest-key 1 md5 secretpassword
```

Be aware of what that gives you. OSPFv2's cryptographic authentication as originally specified is keyed MD5 from RFC 2328 Appendix D, not HMAC, and MD5 is no longer considered strong. RFC 5709 adds HMAC-SHA-1 through HMAC-SHA-512 to OSPFv2, and where the platform supports it you should use SHA. This authenticates the packets on the wire; it does not authorize what a legitimately keyed router says. A neighbor with the key can still inject anything into the area.

OSPFv3 is a different story. As originally published in RFC 5340 it dropped its own authentication fields entirely and relied on IPsec (RFC 4552), which is painful to deploy. RFC 7166 later added an authentication trailer that works much like OSPFv2's, and that is what you want on modern kit.

## What OSPF Cannot Do

**It cannot filter routes inside an area.** Every router in an area must hold an identical link state database, or SPF produces inconsistent results and loops. That is not a limitation of any implementation, it is the definition of link state. So there is no way to stop one router in area 10 from learning a prefix another router in area 10 advertises. Filtering only exists at boundaries: `area X range` and `area X filter-list` at an ABR for type 3 summaries, and `distribute-list`/route maps on redistribution at an ASBR. When someone asks you to hide a subnet from one router in the same area, the honest answer is to change the area design.

**It cannot do policy.** There is no equivalent of [BGP](/blog/bgp-for-network-engineers) communities, local preference, or AS path manipulation. Cost is the only lever, and cost is a single 16-bit number per interface. If your requirement is "prefer this path for this customer's traffic," OSPF is not the protocol, and bending costs until it works produces a topology nobody can reason about.

**It cannot do unequal cost load balancing.** OSPF installs equal-cost paths only. EIGRP's variance has no OSPF analogue, and neither does anything resembling traffic engineering without adding MPLS-TE on top.

**It cannot carry IPv6 in v2 form.** OSPFv2 is IPv4 only. IPv6 needs OSPFv3, which is a separate protocol instance with its own database and its own adjacencies, even though RFC 5838 lets one OSPFv3 process carry both address families.

**It does not scale by adding routers to area 0.** The practical constraint is not a router count, it is the rate of change: every link flap floods LSAs to every router in the area and triggers SPF on all of them. A quiet area with a hundred routers is fine. A noisy area with thirty flapping DSL links is not. When SPF run counts climb, look for the unstable interface before redesigning the areas, and put `ip ospf dead-interval` and flap damping on the offender.

## References

- https://www.rfc-editor.org/rfc/rfc2328
- https://www.rfc-editor.org/rfc/rfc5340
- https://www.rfc-editor.org/rfc/rfc5709
- https://www.rfc-editor.org/rfc/rfc7166
- https://www.rfc-editor.org/rfc/rfc5880
- https://docs.frrouting.org/en/latest/ospfd.html
