## It works on mobile data and not on the wifi

The port forward is right. You can prove it is right: turn the wifi off on
your phone, load the site over mobile data, and it works. Turn the wifi back
on and it hangs until the browser gives up.

Nothing about the rule changed between those two attempts. What changed is
where the reply went.

## The rule runs once, and not on the reply

The first thing to be exact about is when a NAT rule is consulted. From the
nftables manual, on the `nat` chain type:

> The first packet of a flow is used to look up for a matching rule which sets
> up the NAT binding for this flow. This also manipulates this first packet
> accordingly. No rule lookup happens for follow up packets in the flow: the
> NAT engine uses the NAT binding information already set up by the first
> packet.

So a port forward is not a rule that rewrites packets. It is a rule that
creates a binding, once, and the binding rewrites everything after it in both
directions. You never write a reverse rule, and people who add one are
describing a mechanism that does not exist.

The consequence is the whole of this article: the reply is translated by the
binding, and the binding lives on one particular box. If the reply does not
pass through that box, nothing translates it, and there is no rule anywhere
that could have.

## What the LAN client actually gets back

Take a router at 203.0.113.7 outside and 192.168.1.1 inside, a web server at
192.168.1.10, and a laptop at 192.168.1.50. One rule:

```
table ip nat {
  chain prerouting { tcp dport 443 dnat to 192.168.1.10 }
}
```

From the internet this is flawless. A visitor at 198.51.100.9 sends to
203.0.113.7:443, the router rewrites the destination, the server replies to
198.51.100.9, that is off the server's network so it goes to its default
gateway, which is the router, and the router reverses the binding. The visitor
gets a reply from 203.0.113.7 and is happy.

From the laptop, everything up to the server is identical:

```
laptop sends       192.168.1.50:52000 -> 203.0.113.7:443
gw prerouting      192.168.1.50:52000 -> 192.168.1.10:443    dnat
gw routing         192.168.1.50:52000 -> 192.168.1.10:443    leaves by eth1
web receives       192.168.1.50:52000 -> 192.168.1.10:443
```

The rule matched. The request arrived. The application answered. Then the
server looked at 192.168.1.50, saw an address on its own network, and put the
reply straight on the wire:

```
web replies        192.168.1.10:443 -> 192.168.1.50:52000
laptop receives    192.168.1.10:443 -> 192.168.1.50:52000
```

The laptop has no connection to 192.168.1.10. It opened one to 203.0.113.7. A
TCP stack receiving a segment for a connection it does not have does not
puzzle over it; it discards it, or answers with a reset. So the browser waits,
and the server's access log shows a perfectly served request, and both halves
of the system are telling the truth.

This is the hairpin, or NAT loopback, or NAT reflection, depending on whose
documentation you are reading. All three names describe the same missing
thing: the reply never came back through the box holding the binding.

## Two fixes, and what each one costs

**Split horizon DNS.** Answer the site's name with 192.168.1.10 for clients on
the LAN. Then the laptop connects directly, the router is not involved in
either direction, there is no translation because there is nothing to
translate, and the access log shows 192.168.1.50. This is the better fix when
you run a resolver, which most homelabs do. The cost is a second answer for
one name that has to be maintained, and a laptop that cached the public
address before joining the wifi will hairpin until the TTL expires. Keep that
record's TTL short.

**Hairpin NAT.** Rewrite the source as well, on that path only, so the reply
has to come back:

```
chain postrouting {
  oifname eth1 ip saddr 192.168.1.0/24 ip daddr 192.168.1.10 tcp dport 443 masquerade
}
```

Now the server sees the request coming from 192.168.1.1, replies to
192.168.1.1, and the router reverses both halves of the binding. It works. And
every LAN client is now the gateway in the access log, so rate limits,
fail2ban and any audit trail on that server can no longer tell one machine
from another. That is not a reason to avoid it. It is a reason to know you
have done it.

Note how narrow the rule is: one output interface, one source network, one
destination, one port. The version people reach for first is `oifname eth1
masquerade`, which rewrites the source of ordinary LAN to LAN traffic that has
no business being touched.

## The careful version of the rule is also a bug

Somebody who has read about this writes the forward with an input interface,
so that it only applies to traffic from outside:

```
chain prerouting { iifname eth0 tcp dport 443 dnat to 192.168.1.10 }
```

That does exactly what it says, and what it says turns out to be the problem.
From the LAN the packet arrives on eth1, the rule does not match, the
destination is never rewritten, and 203.0.113.7 is the router's own address,
so the packet is delivered to the router locally rather than forwarded.

The upside is that this failure is honest: connection refused, immediately,
rather than a timeout. The `iifname` was not wrong, it was incomplete, and the
missing piece is either the hairpin rule or the DNS answer.

## The reply that leaves by another door

Same topology, and this time the request is from the internet and it still
does not work. The server's default gateway was pointed at a VPN appliance
during a migration and nobody changed it back.

The request arrives fine. The reply is addressed to 198.51.100.9, which is off
the server's network, so it goes to the server's gateway, which is not the
router, which has never heard of this connection. Nothing reverses the
translation, and the packet either dies there or arrives at the client from an
address it never contacted.

This one is invisible from either end alone. The application logs a served
request. The router's ruleset is correct. The tell is one command:

```
conntrack -L -d 203.0.113.7
```

A connection whose packet counter climbs in one direction and sits at zero in
the other is an asymmetric return path, and that is the entire diagnosis. Then
on the server:

```
ip route get 198.51.100.9
```

If the answer is not the box holding the binding, no rule on that box will
help.

## Where the rewrites happen, and why your filter rule matches nothing

The two translation points are on opposite sides of the routing decision:

```
prerouting    dstnat, priority -100      the destination is rewritten
routing       which interface it leaves by, decided on the NEW destination
forward       filter, priority 0         the translated destination, the original source
postrouting   srcnat, priority +100      the source is rewritten
```

Read that table twice, because it answers two questions people get wrong in
opposite directions.

A forward filter rule written against 203.0.113.7 never matches, because by
the time the packet reaches that hook its destination is already 192.168.1.10.
The rule sits in the ruleset looking correct and allowing everything the
default policy allows.

And a forward filter rule written against the translated source never matches
either, because the source is not rewritten until one hook later. What that
chain sees is a translated destination and an original source, which is a
combination that appears nowhere in the unit of thinking most people bring to
it.

If you want the original destination there anyway, `ct status dnat` and
`ct original daddr` will give it to you, and they say to the next reader that
you meant it.

The routing decision being made after the rewrite has one more consequence
worth knowing. If the forward names an address that has moved, the packet is
routed towards the new address, which the router has no path to, so the
default route takes it and a private address leaves out of the WAN interface
towards an ISP that drops it. Nothing logs an error. A counter on private
source or destination addresses leaving the WAN is worth having for this and
several worse things.

## The one no rule can fix

If the address on the WAN interface is inside 100.64.0.0/10, stop looking at
the ruleset. That is the shared address space from RFC 6598, handed out by an
ISP doing carrier grade NAT, and it is neither private nor public: it is an
address inside the ISP's own translation layer, and nothing on the internet
can send a packet to it.

Every check you can make from inside the network passes. The rule is there,
the service is up, the interface has an address. Compare what the router
thinks its address is against what an outside service reports it as, and if
they differ and the first is in that range, the answers are a static address
from the ISP, IPv6, which usually is not translated, or a tunnel to somewhere
that has a routable address.

## The order to check things in

1. Is the address the world has to reach one the world can route to? One
   comparison, and it rules out the case no rule can fix.
2. `conntrack -L` on the router. No entry means the request is not arriving.
   An entry with zero reply packets means the return path is wrong, and the
   ruleset is not the problem.
3. `ip route get <client>` on the server. This is where the reply is going,
   and it has to be the box in step 2.
4. Only now, `nft list ruleset`, and read which chain each rule is in.

Three of those four are about the reply. The rule is the last thing to look at
and the first thing everybody looks at, which is why the port forward that
works from outside is such a durable way to lose an afternoon.

You can trace ten of these, including the ones where every rule is correct, at
[it works from outside](/nat).

## References

- [nftables wiki, on NAT and the binding set up by the first packet](https://wiki.nftables.org/wiki-nftables/index.php/Performing_Network_Address_Translation_(NAT))
- [nftables wiki, on netfilter hooks and chain priorities](https://wiki.nftables.org/wiki-nftables/index.php/Netfilter_hooks)
- [RFC 6598, on the 100.64.0.0/10 shared address space](https://www.rfc-editor.org/rfc/rfc6598.html)
- [RFC 5737, on the documentation address ranges used here](https://www.rfc-editor.org/rfc/rfc5737.html)
- [conntrack-tools, for reading the connection table](https://conntrack-tools.netfilter.org/manual.html)
