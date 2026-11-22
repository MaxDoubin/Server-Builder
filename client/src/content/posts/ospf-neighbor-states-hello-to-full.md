## Neighbors are not adjacencies

Two Open Shortest Path First (OSPF) routers on the same link do not simply start trading routes. They move through neighbor states defined in RFC 2328 (Request for Comments 2328, the specification for OSPF version 2), and the climb has two halves. The first half runs on Hello packets: find a neighbor and confirm that both routers can hear each other. The second half is entered only by some neighbors: synchronize the two routers' link-state databases (LSDBs) so both hold the same map of the network.

The existing post on [OSPF fundamentals](/blog/ospf-routing-protocol) covers configuration, timers and a short list of stuck states. This article follows the packets instead: what each one carries, which check can reject it, and how each step explains the state a show command prints. RFC 2328 is the source throughout. The only vendor material used is one Cisco troubleshooting page and the FRRouting (FRR) command reference.

## The five packet types

- **Type 1, Hello:** discovers neighbors, confirms two-way communication, and elects the designated router.
- **Type 2, Database Description (DD):** summarizes the LSDB while an adjacency is built.
- **Type 3, Link State Request (LSR):** asks for specific link-state advertisements (LSAs) the sender lacks.
- **Type 4, Link State Update (LSU):** carries full LSAs and floods changes.
- **Type 5, Link State Acknowledgment (LSAck):** confirms receipt of LSAs.

An LSA is one unit of topology information, such as one router's description of its links. The LSDB is all the LSAs a router holds for an area. Per RFC 2328 section 8.2, every packet type except Hello must come from an active neighbor, and anything else is discarded.

## Step one: Hello

### What a Hello carries

Beyond the standard OSPF header (router ID, area identifier, authentication type and data), the Hello format in appendix A.3.2 holds the sender's network mask, HelloInterval (seconds between Hellos), Options, router priority, RouterDeadInterval (seconds of silence before a neighbor is declared down), and its view of the designated router (DR) and backup designated router (BDR). The DR and BDR fields hold interface IP (Internet Protocol) addresses, not router IDs, and read 0.0.0.0 when unset. The last field is the neighbor list: router IDs heard within the last RouterDeadInterval. Options includes the E-bit, which describes how AS-external LSAs (routes learned from outside the OSPF domain) are flooded.


### Checks that can reject a Hello

Sections 8.2 and 10.5 describe two layers of checks. Failing any one drops the packet.

| Setting | Carried in | Rule |
|---|---|---|
| Area ID | OSPF header | Must match the receiving interface's area. Except on point-to-point links, the source address must also be on the interface's subnet. |
| Authentication | OSPF header | The type must match and the packet must authenticate. |
| Network mask | Hello body | Must match, except on point-to-point and virtual links, where it is ignored. |
| HelloInterval | Hello body | Must match. |
| RouterDeadInterval | Hello body | Must match. |
| E-bit | Hello options | Must agree with the area type: clear for a stub area, set otherwise. |

Two consequences follow. First, the neighbor record is created only after these checks pass. A mismatch therefore normally leaves the other router absent from the neighbor table instead of parked in some low state, so it has to be found by comparing settings, not by reading the state column. Second, network type is not a Hello field. It is a per-interface setting, so a mismatch is not detected directly and shows up only through the fields that do differ. Check it on both ends separately.

### Down, Init and 2-Way

A neighbor record starts in **Down**. The first valid Hello moves it to **Init**. If that Hello already lists the receiver's own router ID, the 2-Way event follows at once, because section 10.5 runs the Hello and 2-Way events in sequence for a single packet. If it does not, the neighbor stays in Init: a Hello was seen, but two-way communication is not yet proven. The first Hello that does list the receiver moves the neighbor to **2-Way**. A later Hello that omits the receiver's ID drops it back to Init.

**Attempt** exists only on nonbroadcast multi-access (NBMA) networks, where some configuration may be needed to find neighbors. A broadcast network such as Ethernet never uses it. From any state, silence for RouterDeadInterval or a link-down report forces the neighbor to Down.

## Step two: deciding who becomes adjacent

On a broadcast segment, 2-Way is also where a decision is made. Section 10.4 says routers on point-to-point links, point-to-multipoint networks and virtual links always become adjacent. On broadcast and NBMA networks, an adjacency forms only if the router itself is the DR or BDR, or the neighbor is. Otherwise the RFC says the conversation stops at 2-Way. That is the specified outcome, not an error.

### How the DR and BDR are elected

The election runs from Hello data, which is why 2-Way comes first: the pool is the calculating router plus its neighbors at 2-Way or higher. Section 9.4 outlines the steps:

1. Routers with priority 0 are removed.
2. The BDR is chosen first, from routers not declaring themselves DR. Those already declaring themselves BDR win, by highest priority and then highest router ID. If none are declaring, the same rule applies to everyone left.
3. The DR is chosen from routers declaring themselves DR, by priority then router ID. If nobody declares, the new BDR is promoted.
4. If the calculating router's own role changed, steps 2 and 3 repeat.

The RFC describes this as hysteresis: no new BDR is chosen until the old backup has accepted its DR duties, which keeps failover orderly. Section 7.3 adds that a router whose interface comes up and finds an existing DR accepts it regardless of priority. The [earlier post](/blog/ospf-routing-protocol) covers the practical effect, that the election does not preempt.

The DR originates the network LSA for the segment and is adjacent to every other router on it.

### Why neighbors sit at 2-Way

Two routers that are neither DR nor BDR (DROther routers) see each other as neighbors and stay at 2-Way. Each is Full with the DR and BDR, so a router needs only two adjacencies on the segment instead of one per peer.

It is a fault only when the pairing makes no sense. A point-to-point neighbor at 2-Way is wrong, since such links always become adjacent. A segment where every router has priority 0 is another case: nobody is eligible, so no DR exists and, by section 10.4, the neighbors stay at 2-Way.

## Step three: from ExStart to Full

Once the answer is yes, the neighbor enters **ExStart**. The RFC calls conversations in ExStart or any higher state adjacencies.

### ExStart: master and slave

Both routers send empty DD packets with the init, more and master bits set, retransmitting every RxmtInterval (the configured retransmission interval). The goal is to pick a master and the first DD sequence number. The router with the higher router ID becomes master. The other becomes slave and adopts the master's sequence number.

### Exchange: describing the database

In **Exchange**, each router lists its LSDB as a series of DD packets. They carry LSA headers only. A header is 20 bytes and identifies an LSA and its current instance. The master sends a DD packet with a sequence number, the slave answers by echoing it, and the master moves to the next number. Only one DD packet may be outstanding, and only the master retransmits. The exchange ends when each side has sent and received a DD packet with the more bit off.

As headers arrive, each router compares them with its own database. An LSA the neighbor has that the router lacks, or holds in a newer instance, goes onto a request list.

The DD packet also carries the Interface MTU, the largest IP datagram the sending interface can send without fragmentation (MTU stands for maximum transmission unit). Hellos have no such field. That matters in the troubleshooting section.

### Loading and Full

When the exchange ends, a router with a non-empty request list enters **Loading** and starts (or continues) sending LSR packets. The RFC notes that requests may be interleaved with the DD packets still arriving, so LSRs can already be going out during Exchange. The neighbor answers with LSUs containing the full LSAs. At most one LSR should be outstanding at a time, and unanswered requests are retransmitted every RxmtInterval. When the list empties, the neighbor reaches **Full**. A router with nothing to request goes straight from Exchange to Full, as the RFC's example shows for the router with the up-to-date database. At Full the adjacency appears in the routers' LSAs.

A simplified version of the RFC's example (section 10.10) for two routers on a broadcast segment. The RFC assumes RT2 is the DR, has the higher router ID, and holds a completely up-to-date database:

```
RT1: Down                      RT2: Down
RT1 -> RT2  Hello (no DR, no neighbors seen)
                               RT2: Init
RT2 -> RT1  Hello (DR = RT2, RT1 seen)
RT1: ExStart
RT1 -> RT2  DD  init, more, master set, empty
RT2 -> RT1  DD  init, more, master set, empty   (RT2 has the higher router ID)
RT1: Exchange (slave)
RT1 -> RT2  DD  echoes sequence, more set
RT2 -> RT1  DD  next sequence ...   (until more is off on both)
                               RT2: Full (nothing to request)
RT1: Loading
RT1 -> RT2  LSR
RT2 -> RT1  LSU
RT1: Full
```

| State | Meaning | Leaves when |
|---|---|---|
| Down | No recent information | A valid Hello arrives |
| Attempt | NBMA only, contacting a configured neighbor | A Hello arrives |
| Init | Hello seen, own ID not in it | Own ID appears in a Hello |
| 2-Way | Bidirectional | Adjacency wanted (ExStart), else stays |
| ExStart | Choosing master and sequence | Roles agreed |
| Exchange | Swapping DD summaries | DD packets finished both ways |
| Loading | Requesting missing LSAs | Request list empty |
| Full | Databases synchronized | Steady state |

## The database and flooding at a high level

An LSA is identified by its LS (link-state) type, Link State ID and advertising router. When a router holds two copies, the RFC picks the newer one by sequence number first. With equal sequence numbers the larger checksum wins. After that, an instance at MaxAge is newer, and an instance whose age is smaller by more than 15 minutes (MaxAgeDiff) is newer. The same comparison runs during the database exchange and during flooding.

RFC 2328 defines five LSA types: router LSAs (type 1, one per router, describing its links to the area), network LSAs (type 2, from the DR, listing a segment's routers), summary LSAs (types 3 and 4, from area border routers, describing inter-area destinations: type 3 for IP networks and type 4 for AS boundary routers), and AS-external LSAs (type 5, from AS boundary routers, describing destinations external to the autonomous system).

Flooding spreads a change across adjacencies. An LSU moves each LSA one hop farther from its origin. For each LSA received, the router validates the checksum and compares it with its copy. A newer LSA is installed, flooded out some of the eligible interfaces and, under the acknowledgment rules, acknowledged. An identical copy can serve as an implied acknowledgment for an LSA the router was retransmitting. If the router's own copy is newer, it normally sends that copy back to the sender and does not acknowledge the older one.

Each LSA is acknowledged separately, though many acknowledgments can share one LSAck packet. Until one arrives, the LSA stays on the adjacency's retransmission list and is resent, which makes flooding reliable. A neighbor below Exchange does not take part. Neighbors in Exchange and Loading do, which the RFC says makes synchronization finish in a predictable time. On broadcast segments, the DR multicasts updates to the AllSPFRouters address instead of repeating them over every adjacency. Other routers send their updates to the AllDRouters address, which only the DR and BDR accept. When an update arrives on a segment where the router is the BDR, the BDR leaves the flooding to the DR, though it ends up retransmitting if the DR fails (section 13.3).


The constants in RFC appendix B set the cadence. A router re-originates its own LSAs at least every 30 minutes (LSRefreshTime) even if nothing changed. An LSA reaching one hour of age (MaxAge) is flooded to flush it and is no longer used for routing. A new instance of the same LSA is originated at most every 5 seconds, and instances arriving within 1 second of the installed one are discarded.

## Why an adjacency sticks: inferences from the RFC

The RFC does not list failure causes. Everything in this section applies its procedure to each state, so it is inference, not quoted finding. The one place vendor documentation backs it up is noted where it comes up.

### Stuck in Init

Hellos arrive from the neighbor, but its Hellos do not list this router. Either this router's Hellos are not reaching it, or it is rejecting them. Because the usual configuration mismatches (timers, mask, area, authentication) are checked by both sides, they tend to cause silence on both sides, not Init. Init points more often at a one-way path: an access control list (ACL) permitting OSPF in one direction only, a unidirectional link fault, or multicast filtered on one side. Check what the neighbor receives, not only what this router receives.

### Stuck in 2-Way

First decide whether it is expected. Two DROther routers at 2-Way is the protocol working. A point-to-point link at 2-Way is a fault. On a broadcast segment, check the DR and BDR fields and the priorities, since all-zero priorities leave every pair at 2-Way.

### Stuck in ExStart or Exchange

The usual cause is an MTU mismatch. Section 10.6 says a router rejects a DD packet whose Interface MTU is larger than the biggest IP datagram it can accept on that interface without fragmentation. Hellos carry no MTU, so the neighbor relationship forms and then stalls at the first DD packet. A larger-MTU router accepts DD packets from a smaller-MTU one but not the reverse, so the failure is one-directional.

Applying the section 10.6 ExStart rules to unequal MTUs gives two outcomes. Call the lower-MTU router L and the higher-MTU router H. L rejects every DD packet from H. If L has the higher router ID, H accepts L's opening DD packet, becomes slave and moves to Exchange, but L rejects H's replies and stays in ExStart. If H has the higher router ID, neither side completes negotiation and both stay in ExStart. This is an application of the rules, not a scenario the RFC describes. Cisco's troubleshooting page works through a case that matches the first outcome: its Router 7 has the lower MTU (1450 against 1500) and the higher router ID, ends up in EXSTART, and its neighbor sits in EXCHANGE. Cisco attributes the problem to mismatched MTU settings on the neighboring interfaces, and the fix is to make the MTU equal on both ends. The post on [MTU and jumbo frames](/blog/mtu-and-jumbo-frames) covers MTU in more depth.

MTU is not the only cause. Cisco's page lists others that stop the DD packets from getting through: unicast delivery that is broken (a wrong virtual circuit mapping, an access list that blocks the unicast packet, or NAT translating it), a path that carries only small packets, and two routers configured with the same router ID. Cisco notes that in ExStart the router sends a unicast packet to the neighbor, except on a point-to-point link, where it sends a multicast packet.

A neighbor that keeps falling back from Exchange to ExStart has a different problem. The RFC returns a neighbor to ExStart on a SeqNumberMismatch event (DD packets out of sequence or with changed options) or a BadLSReq event (a request for an LSA the neighbor does not have).

### Stuck in Loading

The request list is not empty, so requests are going out and complete answers are not arriving. The RFC names no specific cause.

## Reading it on a router

On a Cisco IOS (Internetwork Operating System) router, `show ip ospf neighbor` lists each neighbor with its ID, priority, state, dead time, address and interface. FRR documents the same command and variants such as `show ip ospf neighbor detail`, but its reference page has no sample neighbor output, so that layout is not reproduced here. Cisco's MTU troubleshooting page prints the output below for its two routers, one in EXCHANGE and one in EXSTART (the interfaces reflect the older serial links in that document):

```
router-6#show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
172.16.7.11      1   EXCHANGE/  -    00:00:36    172.16.7.11    Serial2.7

router-7#show ip ospf neighbor
Neighbor ID     Pri   State           Dead Time   Address         Interface
10.170.10.6      1   EXSTART/  -     00:00:33    10.170.10.6    Serial0.6
```

No sample output for Init or 2-Way was available from a source read for this article, so those states are described in words. An Init neighbor shows the state Init, and a 2-Way neighbor shows 2-Way. In both cases watch whether the Dead Time column keeps counting down from the full value again. The RFC restarts a neighbor's inactivity timer on every Hello, so a timer that keeps refreshing means Hellos still arrive and the problem lies in what happens next. The [Cisco IOS fundamentals post](/blog/cisco-ios-fundamentals) covers the basic show commands.

## Study notes

- A neighbor is a router whose Hellos are seen. An adjacency is a neighbor in ExStart or higher.
- Init means one-way: the neighbor's Hello does not list this router yet.
- 2-Way is the normal resting state between two DROther routers.
- Hello checks (mask, timers, area, authentication, E-bit) fail silently, so a mismatch usually leaves no neighbor entry.
- Higher router ID wins master. Higher priority, then router ID, wins DR and BDR.
- Full means the request list is empty, not merely that the exchange finished.
- ExStart or Exchange that never completes: check the MTU on both ends first.

## Sources

- [RFC 2328: OSPF Version 2 (J. Moy, April 1998)](https://www.rfc-editor.org/rfc/rfc2328.txt)
- [Cisco: Troubleshoot OSPF Neighbors Stuck in Exstart/Exchange State](https://www.cisco.com/c/en/us/support/docs/ip/open-shortest-path-first-ospf/13684-12.html)
- [FRRouting documentation: OSPFv2](https://docs.frrouting.org/en/latest/ospfd.html)