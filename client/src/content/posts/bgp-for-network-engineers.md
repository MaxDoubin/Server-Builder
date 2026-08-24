
## What BGP Actually Is

BGP (Border Gateway Protocol) is the routing protocol that connects autonomous systems on the internet. Unlike interior routing protocols like OSPF or EIGRP, BGP is designed for policy-based routing between organizations. It is not just about finding the shortest path. It is about controlling which paths are preferred, which ones are advertised, and which ones are filtered entirely.

If you have ever wondered how traffic flows between your ISP and the rest of the internet, the answer is BGP.

## Key Concepts

**Autonomous Systems (AS):** Every network that participates in BGP has an AS number (ASN). This is how BGP identifies routing domains. Large ISPs, cloud providers, and universities all have their own ASNs.

**eBGP vs iBGP:** External BGP (eBGP) runs between different autonomous systems. Internal BGP (iBGP) runs within the same AS, typically to distribute routes learned from eBGP peers throughout the network.

**BGP Attributes:** BGP uses path attributes to make routing decisions. The most important ones are:
- **AS Path:** The list of AS numbers a route has traversed. Shorter is generally preferred.
- **Local Preference:** Used internally to prefer one exit point over another.
- **MED:** Multi-Exit Discriminator, used to suggest preferred ingress points to external peers.
- **Next Hop:** The next-hop IP for reaching a destination.

## Basic Configuration

```
router bgp 65001
  neighbor 192.168.1.2 remote-as 65002
  neighbor 192.168.1.2 description UPSTREAM_ISP
  network 10.0.0.0 mask 255.255.255.0
```

## Why It Matters in the Real World

Even if you work in enterprise networking rather than ISP networking, BGP comes up constantly. Cloud providers use it for connecting on-premises networks to AWS, Azure, or GCP via Direct Connect or ExpressRoute. SD-WAN solutions often use BGP internally. Understanding BGP makes you a much more effective network engineer.

## Where to Practice

You can run BGP labs in GNS3 or EVE-NG using virtual Cisco or FRR routers. Start with a simple two-AS topology, peer them, and watch the route tables populate. Then add filters and attributes to see how routing decisions change.
