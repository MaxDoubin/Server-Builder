
## One lookup, one field

Standard IP forwarding is a longest prefix match on the destination address. That is it. Every other property of the packet, where it came from, what interface it arrived on, what port it is headed to, is invisible to the decision.

That works until you have two ways out. The moment a host has two uplinks, or a management interface that must be reachable independently of the default route, or a tunnel that only some traffic should use, destination alone cannot express what you want.

Linux has had the answer for a long time, and most people never turn it on. The kernel does not have one routing table, it has many, and a policy database decides which one to consult. Every lookup walks a list of rules in priority order until one matches and the selected table returns a route.

```bash
ip rule show
# 0:      from all lookup local
# 32766:  from all lookup main
# 32767:  from all lookup default
```

Rule 0 handles addresses belonging to this host. Rule 32766 is the ordinary table everyone knows. Rules you add sit between them, and lower numbers are evaluated first. That is the whole mechanism.

## The dual uplink case

Here is the problem that sends people looking for this feature. A host has two uplinks on two providers. It has a default route out the first. A request arrives on the second interface, the reply is generated with that interface's source address, but routing sends it out the first interface because that is where the default route points. The reply leaves with a source address that does not belong to the link it left from, and it gets dropped by reverse path filtering somewhere upstream, or it arrives and the client rejects it.

The fix is a table per uplink, plus a rule that selects the table by source address.

```bash
# Name the tables so the config is readable
echo "101 wan_a" >> /etc/iproute2/rt_tables
echo "102 wan_b" >> /etc/iproute2/rt_tables

# Each table knows only how to leave via its own link
ip route add 198.51.100.0/24 dev eth0 src 198.51.100.20 table wan_a
ip route add default via 198.51.100.1 dev eth0 table wan_a

ip route add 203.0.113.0/24 dev eth1 src 203.0.113.40 table wan_b
ip route add default via 203.0.113.1 dev eth1 table wan_b

# Select the table by the source address the reply will carry
ip rule add from 198.51.100.20 lookup wan_a priority 1000
ip rule add from 203.0.113.40  lookup wan_b priority 1001
```

Now a reply sourced from the second address leaves through the second link, regardless of what the main table's default route says. The main table still handles locally originated traffic that has not chosen a source yet.

## Selecting on a mark

Source address is only one selector. The more flexible one is the firewall mark, because it lets your firewall classify traffic on anything it can match and hand the routing decision the result.

```nft
table inet mangle {
  chain prerouting {
    type filter hook prerouting priority mangle; policy accept;

    # Send lab subnet web traffic out the second uplink
    ip saddr 10.10.40.0/24 tcp dport { 80, 443 } meta mark set 0x2

    # Keep backup traffic off the primary link entirely
    ip saddr 10.10.50.0/24 tcp dport 873 meta mark set 0x2
  }
}
```

```bash
ip rule add fwmark 0x2 lookup wan_b priority 900
```

The division of labour here is the appealing part. The firewall decides classification, which is what firewalls are good at, and routing decides paths, which is what routing is good at. Neither has to grow a hacky version of the other's job.

Other selectors worth knowing: `iif` matches the incoming interface, `to` matches the destination like an ordinary route but lets you send it to a different table, `ipproto` and `dport` exist in newer kernels, and `suppress_prefixlength` can skip a table's default route while still using its more specific entries, which is the standard trick for VPN split routing.

## The reverse path filter trap

Once you have asymmetric paths, `rp_filter` becomes the thing that breaks you. Strict mode drops a packet if the reply to its source address would not go back out the interface it arrived on. That is a sensible anti spoofing default and it is exactly wrong for a policy routed host, because the whole point is that the return path depends on more than the destination.

```bash
sysctl net.ipv4.conf.all.rp_filter        # 0 off, 1 strict, 2 loose
sysctl -w net.ipv4.conf.all.rp_filter=2
sysctl -w net.ipv4.conf.eth1.rp_filter=2
```

Loose mode still drops packets from source addresses with no route at all, which keeps most of the anti spoofing value, while allowing asymmetry. Note that the effective value is the maximum of the `all` setting and the per interface setting, so setting the interface to 2 while `all` is 1 does nothing.

## Debugging: ask the kernel, do not read the tables

Reading four tables and a rule list and simulating the lookup in your head is a good way to be confidently wrong. The kernel will just tell you:

```bash
# Which route does the kernel pick for this exact packet
ip route get 8.8.8.8 from 203.0.113.40 iif eth1
ip route get 8.8.8.8 mark 0x2

# Show every table at once
ip route show table all | head -40
```

`ip route get` runs the real lookup, rules included, and prints the answer with the table it came from. It is the single most useful command in this whole area, and it turns a theory about your configuration into a fact.

Two habits keep this maintainable. Give tables names in `rt_tables`, because `lookup wan_b` reads and `lookup 102` does not. And leave gaps in your rule priorities, so inserting a rule later does not mean renumbering everything. Policy routing configurations are not complicated, but they are stateful and easy to accumulate, and a rule someone added two years ago that nothing matches is the kind of thing that turns into a very confusing afternoon.

## References

- https://man7.org/linux/man-pages/man8/ip-rule.8.html
- https://man7.org/linux/man-pages/man8/ip-route.8.html
- https://docs.kernel.org/networking/ip-sysctl.html
- https://www.rfc-editor.org/rfc/rfc1812
- https://en.wikipedia.org/wiki/Policy-based_routing
