
## Real topologies without more gear

Before I touch anything other people depend on, I want to have already made the mistake somewhere cheap. Simulators are fine for concepts, but they do not use the same routing table code, the same ARP behavior, or the same firewall. Linux network namespaces do, because they are the same kernel networking stack with a separate instance of everything.

A network namespace gets its own interfaces, routing tables, neighbor tables, netfilter rules, and socket bindings. Two namespaces on one host are as isolated from each other as two machines, and they talk through virtual ethernet pairs that behave like a cable with an interface on each end. Containers use exactly this machinery. Learning it directly makes [container networking](/blog/container-networking-fundamentals) stop being magic.

## A three node routed topology

Here is a lab I build often: two hosts on different subnets and a router in the middle. It exercises routing, forwarding, and default gateways, which is where most beginner confusion lives.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Namespaces: h1 --- r1 --- h2
for ns in h1 r1 h2; do ip netns add "$ns"; done

# Cables
ip link add h1r1 type veth peer name r1h1
ip link add h2r1 type veth peer name r1h2

# Plug each end into its namespace
ip link set h1r1 netns h1
ip link set r1h1 netns r1
ip link set h2r1 netns h2
ip link set r1h2 netns r1

# Left segment 10.0.1.0/24
ip -n h1 addr add 10.0.1.10/24 dev h1r1
ip -n r1 addr add 10.0.1.1/24  dev r1h1

# Right segment 10.0.2.0/24
ip -n h2 addr add 10.0.2.10/24 dev h2r1
ip -n r1 addr add 10.0.2.1/24  dev r1h2

# Bring everything up, loopbacks included
for ns in h1 r1 h2; do ip -n "$ns" link set lo up; done
ip -n h1 link set h1r1 up
ip -n h2 link set h2r1 up
ip -n r1 link set r1h1 up
ip -n r1 link set r1h2 up

# The router must actually route
ip netns exec r1 sysctl -qw net.ipv4.ip_forward=1

# Default gateways on the hosts
ip -n h1 route add default via 10.0.1.1
ip -n h2 route add default via 10.0.2.1

ip netns exec h1 ping -c 3 10.0.2.10
```

Tear it all down with a loop over `ip netns del`. Veth pairs disappear with their namespace, so cleanup is one line. Being able to destroy and rebuild a topology in two seconds is what makes this worth learning, because you stop being precious about breaking it.

## Teaching yourself by breaking it

The lab above is only useful if you take pieces out. My standard sequence when walking someone through it goes like this.

Turn off forwarding on the router. The ping fails. Run a capture on the router interface and show that the packet arrives and simply is not passed along. That distinction, arriving versus being forwarded, is the concept of a router in one observation.

Remove the default route on h2. Now the request reaches h2 and h2 has no idea how to answer. The capture shows a request with no reply, which looks identical to a firewall drop from h1's point of view. That is the most useful troubleshooting lesson in the whole exercise: no reply does not mean not delivered. Check the return path.

Add a firewall rule on the router and watch the counters increment. Everything netfilter does works here, per namespace, so you can practice policy without endangering anything.

```bash
ip netns exec r1 nft add table inet filter
ip netns exec r1 nft add chain inet filter forward \
  '{ type filter hook forward priority 0; policy accept; }'
ip netns exec r1 nft add rule inet filter forward \
  ip saddr 10.0.1.0/24 icmp type echo-request counter drop

ip netns exec r1 nft list ruleset
```

## Bridges, VLANs, and the rest

Once you have veth pairs, add a bridge and you have a switch. Create a bridge in a namespace, attach one end of several veth pairs to it, and you have a broadcast domain with multiple hosts. Add VLAN subinterfaces on the veth and you can practice tagged versus untagged behavior, which is the concept people most often get wrong on real switches.

```bash
ip netns exec sw ip link add br0 type bridge
ip netns exec sw ip link set br0 up
ip netns exec sw ip link add link eth1 name eth1.20 type vlan id 20
```

The important part is that the semantics are real. A frame arriving untagged on a port with a VLAN subinterface goes where the kernel says it goes, and if your mental model is wrong you will see it be wrong here, at no cost, on a Tuesday, instead of during a maintenance window.

## Capturing, which is the actual point

Every interface is a real interface, so tcpdump works normally inside a namespace.

```bash
ip netns exec r1 tcpdump -ni r1h1 -w /tmp/left.pcap &
ip netns exec h1 ping -c 5 10.0.2.10
```

Capture on both sides of the router at once and you can watch the TTL decrement and the layer two addresses change while the layer three addresses stay the same. I have explained that at a whiteboard many times and it never lands as hard as watching it in two capture files taken thirty centimeters apart on the same machine.

## Why I keep coming back to it

Namespaces cost nothing, run on any Linux box including an old laptop, and use the production networking stack. When I am studying for something, prototyping a firewall policy, or trying to explain why a return route matters, this is the first tool I open. Keep the topology scripts in a repo and rebuilding a lab from scratch takes about as long as reading the script.

## References

- [network_namespaces(7)](https://man7.org/linux/man-pages/man7/network_namespaces.7.html)
- [ip-netns(8)](https://man7.org/linux/man-pages/man8/ip-netns.8.html)
- [veth(4)](https://man7.org/linux/man-pages/man4/veth.4.html)
- [nftables wiki](https://wiki.nftables.org/wiki-nftables/index.php/Main_Page)
- [tcpdump manual](https://www.tcpdump.org/manpages/tcpdump.1.html)
