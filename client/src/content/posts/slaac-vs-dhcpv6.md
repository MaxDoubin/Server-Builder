
## The client is not in charge

On IPv4 a host boots, broadcasts a DHCPDISCOVER, and takes whatever a server
offers. Plenty of people assume IPv6 works the same way with a DHCPv6 server
swapped in. It does not. On IPv6 the first useful thing a host does is listen
for a Router Advertisement, and the RA tells the host which method it is
allowed to use. The router is in charge. If you configure a DHCPv6 server and
never look at what your router is advertising, nothing you configured gets
used, and you will spend an evening reading server logs that contain no
requests.

Before any of that, every IPv6 interface builds a link local address in
fe80::/10 and runs Duplicate Address Detection on it. That address exists
whether or not a router, a DHCPv6 server, or any global prefix is present on
the segment. It is why this works on a completely unconfigured lab VLAN:

```bash
ping -6 -I eth0 ff02::1        # all IPv6 nodes on this link answer
ip -6 neigh show dev eth0      # everything that answered
```

That single fact makes IPv6 easier to troubleshoot than IPv4 on a dead
network, because you can talk to neighbours before addressing works.

## Reading the flags

Router Advertisements carry two bits that answer the whole question, plus per
prefix bits inside each Prefix Information Option.

| Flag | Where | Meaning |
| --- | --- | --- |
| M (Managed) | RA header | Get your address from DHCPv6 |
| O (Other) | RA header | Get other config (DNS, NTP) from DHCPv6 |
| A (Autonomous) | Prefix option | Build your own address from this prefix |
| L (On link) | Prefix option | This prefix is directly reachable on this link |

The common combinations are: A set and M clear, which is pure SLAAC; A set,
M clear, O set, which is SLAAC for addresses and DHCPv6 only for DNS servers
and search domains; and M set with A clear, which is stateful DHCPv6. The
default gateway never comes from DHCPv6 in any of them. There is no DHCPv6
router option. The router is learned from the RA, always.

Here is a radvd configuration for the SLAAC plus stateless DHCPv6 case, which
is what I reach for on a lab segment:

```ini
interface lab0
{
    AdvSendAdvert on;
    MinRtrAdvInterval 30;
    MaxRtrAdvInterval 100;
    AdvManagedFlag off;
    AdvOtherConfigFlag on;

    prefix 2001:db8:10:20::/64
    {
        AdvOnLink on;
        AdvAutonomous on;
        AdvValidLifetime 2592000;
        AdvPreferredLifetime 604800;
    };

    RDNSS 2001:db8:10:20::53
    {
        AdvRDNSSLifetime 900;
    };
};
```

Note the two lifetimes. Preferred lifetime is how long the address is used
for new connections. Valid lifetime is how long it stays usable at all. When
an upstream prefix changes, hosts keep the old address for the remaining
valid lifetime, which is why a month long valid lifetime on a prefix your ISP
can rotate is a bad idea.

## Why one interface has four addresses

Original SLAAC derived the interface identifier from the MAC address using
modified EUI-64, which stamped the hardware address into every packet the
host sent. RFC 7217 replaced that with a stable opaque identifier that is
different per prefix, so moving networks does not carry an identifier with
you. RFC 8981 adds temporary addresses that rotate on a timer and are used
for outbound connections. Add the link local address and you legitimately
have several addresses on one NIC.

Linux exposes the behaviour per interface:

```bash
sysctl net.ipv6.conf.eth0.addr_gen_mode     # 0 EUI64, 3 stable privacy
sysctl net.ipv6.conf.eth0.use_tempaddr      # 0 off, 2 prefer temporary
sysctl net.ipv6.conf.eth0.accept_ra         # 0 off, 1 on, 2 on even if forwarding
ip -6 addr show dev eth0
ip -6 route show
```

The practical consequence for operations is that source address selection is
a real algorithm, not an accident, and any firewall rule or allowlist keyed
to a single host address will break the first time a temporary address
rotates. Key rules to prefixes, or turn temporary addresses off on servers
and leave them on for clients.

## What DHCPv6 gives you that SLAAC does not

Stateful DHCPv6 identifies clients by DUID rather than MAC address, which
means reservations survive a NIC swap but not an OS reinstall that regenerates
the DUID. You get leases you can audit, address assignment you can log, and
prefix delegation, which is how a downstream router gets its own /64s to hand
out. If you run a router inside your lab that needs its own subnets, prefix
delegation is the mechanism.

The one thing to know before you build a stateful only network: some client
platforms have never implemented DHCPv6 address assignment. Android is the
well known example. A segment advertising M with A cleared leaves those
devices with a link local address and nothing else. If you need auditable
addressing and you also need phones to work, run SLAAC with the O flag and
get your auditability from neighbour table logging instead.

## Where lab networks actually break

Filtering ICMPv6 like it is ICMPv4. Neighbour Discovery, Router Discovery,
Path MTU Discovery, and DAD all ride on ICMPv6. Blanket dropping it breaks
the protocol, and RFC 4890 exists specifically to tell you which types you
can safely filter.

A second router advertising on the same segment. Any host can send an RA, so
an accidentally bridged VM or a plugged in consumer router will hand your
clients a default gateway. RA Guard on the access switch is the fix, and it
belongs on every port that should never see a router.

Duplicate configuration. If both radvd and your DHCPv6 server think they own
DNS, hosts get two answers and pick unpredictably. Decide which one is
authoritative per segment and write it in the network documentation.

## References

- [RFC 4861: Neighbor Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc4861)
- [RFC 4862: IPv6 Stateless Address Autoconfiguration](https://www.rfc-editor.org/rfc/rfc4862)
- [RFC 8415: Dynamic Host Configuration Protocol for IPv6](https://www.rfc-editor.org/rfc/rfc8415)
- [RFC 7217: A Method for Generating Semantically Opaque Interface Identifiers](https://www.rfc-editor.org/rfc/rfc7217)
- [RFC 8981: Temporary Address Extensions for SLAAC](https://www.rfc-editor.org/rfc/rfc8981)
- [RFC 4890: Recommendations for Filtering ICMPv6 Messages in Firewalls](https://www.rfc-editor.org/rfc/rfc4890)
