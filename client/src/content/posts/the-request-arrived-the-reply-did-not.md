## A ticket that makes no sense

The ticket says the file server in VLAN 30 stopped answering. The person who
raised it has been thorough: they have tcpdump running on the file server, and
they can see the ICMP echo requests arriving. They just never see a reply come
back. They have checked the firewall, which has no rules for that path. They
have checked the routing table, which has no route because both hosts are in
the same VLAN and should not need one.

Everything they have checked is fine. The problem is four bytes that are not
there, on a cable neither of them has looked at.

## Two switches, two configurations, both correct

```
acc-01# show running-config interface Gi1/0/48
interface Gi1/0/48
 switchport mode trunk
 switchport trunk native vlan 30
 switchport trunk allowed vlan 10,20,30,99
```

```
dist-01# show running-config interface Te1/1/1
interface Te1/1/1
 switchport mode trunk
 switchport trunk native vlan 1
 switchport trunk allowed vlan 1,10,20,30,99
```

The access switch was hardened last year by somebody moving the native VLAN
off 1, which is standard advice. The distribution switch arrived with the
factory default and nobody touched the trunk, because the trunk came up and
the [VLANs](/blog/vlan-segmentation-guide) passed. Each configuration is defensible on its own and each would
pass a review on its own.

A trunk sends its native VLAN with no tag at all. That is not a bug or an
optimisation, it is the entire purpose of having a native VLAN: a device on
the other end that knows nothing about tagging still gets traffic. So a frame
in VLAN 30 leaves acc-01 as plain Ethernet, and dist-01, receiving an untagged
frame on a trunk, does the only thing it can and puts it in its own native
VLAN, which is 1.

## The part that makes the ticket sensible

I expected this to be described accurately everywhere as "two VLANs get
bridged", and to be able to move on. Then I built a model of 802.1Q for the
practice page and asked it which VLANs actually reach which, in each
direction. The answer is stranger than the summary.

```
A's trunk calls 30 native; B's trunk calls 1 native.

VLAN  1   A to B: lands in 1    B to A: lands in 30
VLAN 10   A to B: lands in 10   B to A: lands in 10
VLAN 20   A to B: lands in 20   B to A: lands in 20
VLAN 30   A to B: lands in 1    B to A: lands in 30
```

Read the VLAN 30 row twice. From B to A it works. From A to B it does not.

The rule is simple once you see it: **each switch's own native VLAN leaks
outbound and works inbound.** A frame in VLAN 30 on acc-01 is in acc-01's
native VLAN, so it leaves untagged and lands wherever dist-01 keeps untagged
frames. A frame in VLAN 30 on dist-01 is not in dist-01's native VLAN, so it
leaves with a tag saying 30, and a tag is unambiguous.

So the echo request from the file server's neighbour on dist-01 crosses
correctly, tagged 30, and arrives. The echo reply leaves acc-01 untagged and
lands in VLAN 1. The request arrives and the reply does not. tcpdump on the
target is telling the truth, the person reading it is drawing the only
reasonable conclusion, and the conclusion is wrong.

The same mismatch does the same thing to VLAN 1 in the other direction, which
is why the management network on dist-01 quietly receives every broadcast the
printers in VLAN 30 send.

## Nothing is dropped

I ran it over every ordered pair of different native VLANs across four VLANs,
which is forty-eight one-way deliveries.

```
36  arrive in the VLAN they were sent from   75.0%
12  arrive in a different VLAN               25.0%
 0  are dropped                               0.0%
```

Zero. A native VLAN mismatch never discards a frame. Every single one is
delivered, and a quarter of them are delivered into a VLAN nobody sent them
to. There is no counter to look at, because a counter counts drops, and
nothing dropped.

That is the difference between this and every other VLAN fault. A pruned
allowed list drops frames, and a drop is a ticket, and a ticket gets fixed.
The mismatch delivers everything, half of it to the wrong place, and produces
a ticket about something else entirely.

## What it actually costs

Two things, and the second is worse.

The visible cost is the half conversation, which will eventually be found
because somebody cannot do their job. It costs a day and the wrong three
people.

The invisible cost is that two broadcast domains are now one, in a direction.
Whatever segmentation reason there was for having VLAN 30 separate from VLAN 1
is gone for all traffic originating in VLAN 30. If VLAN 1 is the management
network, and it usually is, because VLAN 1 is where switches put their own
interfaces by default, then every host in the printer VLAN can send frames
into it. Not because anybody made a firewall mistake. Because two people
picked different sensible numbers eight months apart.

## Do not match the natives

The obvious fix is to make both ends say 30, and it works, and it is not the
fix.

The fix is to make the native VLAN a VLAN with nothing in it. Create 999, put
no access port in it, allow it on the trunks, and set it native at both ends.
Then the two ends agreeing is no longer load bearing: if somebody changes one
end next year, the traffic that lands in the wrong place is the traffic in
VLAN 999, and there is none.

It closes the other half of the problem at the same time. A host in the native
VLAN can write its own 802.1Q tag, and because its switch adds nothing on the
way out, that tag is the outermost one when the frame reaches the next switch,
which reads it and honours it. That is VLAN hopping, and it needs the
attacker's access VLAN to be the trunk's native VLAN. A native VLAN with no
hosts in it has no attacker in it either.

So: native VLAN that carries nothing, allowed lists checked at both ends of
every trunk rather than the end you happen to be logged into, and tagged
frames dropped on access ports. Three habits, and the first one is one line.

You can [follow nine of these frames](/vlan), with the tags on each wire and
the VLAN inside each switch drawn.

## References

- [IEEE 802.1Q, the VLAN bridging standard](https://standards.ieee.org/ieee/802.1Q/6844/)
- [Cisco: configuring VLAN trunks, on the native VLAN and the allowed list](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-6/configuration_guide/vlan/b_176_vlan_9300_cg/configuring_vlan_trunks.html)
- [VLAN hopping, including the double tagging variant](https://en.wikipedia.org/wiki/VLAN_hopping)
- [NIST SP 800-125B, on securing virtual network configurations](https://csrc.nist.gov/pubs/sp/800/125/b/final)
- [RFC 5517, on private VLANs and their scope](https://www.rfc-editor.org/rfc/rfc5517)
