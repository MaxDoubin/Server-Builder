## The problem

You can define a VLAN, recite the OSI layers, and pass the practice exam, and still freeze the first time a trunk port does not come up. Reading about networking builds vocabulary. It does not build the reflex of knowing what to check first. A homelab is the cheapest way to buy that reflex, and you can start one tonight with no hardware at all.

## Beyond the textbook

Reading about [VLANs](/blog/vlan-segmentation-guide) and [subnetting](/blog/subnetting-practical-guide) is one thing. Configuring them on real hardware, breaking something, and spending two hours figuring out why your trunk port is dropping tagged traffic is a completely different experience. That is why I run a homelab.

My homelab runs multiple Dell enterprise servers with serious compute and storage capacity. It is not a Raspberry Pi cluster or a single tower PC. It is enterprise hardware running enterprise workloads, and that is the point.

## What I actually run

The core of the lab is built around Dell servers. I use them for:

- **Virtualization workloads** to simulate multi-site environments
- **Network segmentation testing** with real VLANs, trunking, and inter-VLAN routing
- **Storage experiments** to understand capacity planning, redundancy, and performance
- **Security testing** with isolated segments for controlled lab exercises

## Why scale matters

A lot of people ask why I need that much hardware at home. The answer is that real environments are messy. When you only have one server and one switch, everything is simple. When you have multiple systems, multiple network segments, and real data moving between them, you start hitting the problems that professionals deal with every day.

That is where the real learning happens: debugging a routing issue across segments, figuring out why a firewall rule is blocking traffic you expected to pass, or tracing a performance problem through layers of infrastructure.

## Starting with no hardware at all

The most common reason people never start is that they think they need a rack. They do not. Every routing concept in the CCNA-level material can be built on one Linux machine using network namespaces, which are the same kernel feature containers use to get their own network stack.

Here is a two-subnet lab with a router in the middle. It takes about a minute and costs nothing.

```bash
# two isolated hosts, each on its own /24
sudo ip netns add lab-a
sudo ip netns add lab-b

# a virtual cable from each namespace to the host
sudo ip link add veth-a type veth peer name veth-a-host
sudo ip link add veth-b type veth peer name veth-b-host
sudo ip link set veth-a netns lab-a
sudo ip link set veth-b netns lab-b

# the host side becomes the gateway for each subnet
sudo ip addr add 10.99.1.1/24 dev veth-a-host
sudo ip addr add 10.99.2.1/24 dev veth-b-host
sudo ip link set veth-a-host up
sudo ip link set veth-b-host up

# configure lab-a
sudo ip netns exec lab-a ip link set lo up
sudo ip netns exec lab-a ip addr add 10.99.1.10/24 dev veth-a
sudo ip netns exec lab-a ip link set veth-a up
sudo ip netns exec lab-a ip route add default via 10.99.1.1

# configure lab-b
sudo ip netns exec lab-b ip link set lo up
sudo ip netns exec lab-b ip addr add 10.99.2.10/24 dev veth-b
sudo ip netns exec lab-b ip link set veth-b up
sudo ip netns exec lab-b ip route add default via 10.99.2.1
```

Try the ping before you enable forwarding:

```bash
sudo ip netns exec lab-a ping -c 2 10.99.2.10
```

It fails. Both namespaces are configured perfectly, both have a default route, and the traffic still does not cross, because the host is not willing to be a router yet. That single fact is worth more than a chapter about it.

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo ip netns exec lab-a ping -c 2 10.99.2.10
```

```
PING 10.99.2.10 (10.99.2.10) 56(84) bytes of data.
64 bytes from 10.99.2.10: icmp_seq=1 ttl=63 time=0.061 ms
64 bytes from 10.99.2.10: icmp_seq=2 ttl=63 time=0.048 ms

--- 10.99.2.10 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1015ms
```

Look at `ttl=63`. The default TTL is 64 and the reply crossed exactly one router, so it arrived with one less. Two hops would show 62. That is a diagnostic you will use for the rest of your career, and here you can see it happen with a value you set yourself.

Prove the routing decision rather than assuming it:

```bash
sudo ip netns exec lab-a ip route get 10.99.2.10
```

```
10.99.2.10 via 10.99.1.1 dev veth-a src 10.99.1.10 uid 0
    cache
```

Clean up when you are done. Deleting the namespace takes its interfaces with it:

```bash
sudo ip netns del lab-a
sudo ip netns del lab-b
sudo sysctl -w net.ipv4.ip_forward=0
```

From here you can add a firewall between the two subnets, run a DHCP server in one namespace, break the return route on purpose and watch what asymmetric routing looks like, or put a packet capture on the host side and read the traffic. None of it needs a switch.

## What to build first

Once you do have hardware, the order matters more than the quantity. Building in this sequence means each step gives you something the next step depends on:

1. **Static addressing and a documented plan.** Write down the subnets before you configure anything.
2. **DHCP and DNS you control.** The moment your own resolver serves your own names, half of "the internet is down" becomes debuggable.
3. **A second subnet and routing between them.** This is where the netns exercise above becomes physical.
4. **VLANs and a trunk.** Now the tag matters and mismatches teach you something.
5. **A firewall with rules you wrote.** Deny by default and add what you need, so every allow is a decision.
6. **Monitoring and logging.** Not because it is exciting, but because it turns "it feels slow" into a graph.

Skipping to step 5 is how people end up with a complicated network they cannot troubleshoot.

## Building good habits

The homelab also taught me documentation habits. When you have complex infrastructure, you cannot rely on memory. I keep diagrams, runbooks, and change logs. Every time I make a change, I document what I did, why I did it, and how to reverse it if something goes wrong.

These habits carry directly into professional environments. The difference between a good administrator and a great one is often just documentation and discipline.

The change log is the part people skip and the part that pays off most. When something breaks a week after you touched it, the only question that matters is what changed, and the only reliable answer is a written one. It does not need tooling. A dated text file in a git repository is enough, as long as every entry says what you did and how to undo it.

## What breaks

**The lab becomes production without anyone deciding.** You set up DNS or DHCP for the whole house because it was convenient, and now rebooting a lab machine to test something takes the household offline. Anything the house depends on needs to be treated as production, with a fallback, or moved off the lab entirely.

**Address space collides with something you did not choose.** ISP routers commonly hand out 192.168.0.0/24 or 192.168.1.0/24, Docker's default bridge sits on 172.17.0.0/16, and plenty of corporate VPNs route all of 10.0.0.0/8. Pick lab subnets that are unlikely to be chosen by anything else, and check before you commit, because a VPN that swallows your whole range makes remote access to the lab impossible in a way that is very hard to diagnose from a coffee shop.

**Enterprise hardware is loud, hot, and hungry.** Rack servers are designed for a datacenter with cold aisles and no neighbours. Fans that are inaudible in a server room are not inaudible in a bedroom, and the power draw shows up on a bill somebody pays. Work out where the machine lives and what it costs to run before it arrives, not after.

**Nothing is backed up, including the configuration.** People back up the VMs and lose the switch config, the firewall rules, and the hypervisor's network setup, which is the part that took the longest. Export configs on a schedule and keep them in version control somewhere that is not the lab.

**A lab service ends up exposed to the internet.** Port forwarding one thing "temporarily" to test it from outside is how a deliberately vulnerable practice box becomes somebody else's foothold. Use a VPN into the lab instead of forwarding ports, and keep anything intentionally insecure on a segment that cannot route anywhere else.

## References

- https://man7.org/linux/man-pages/man8/ip-netns.8.html
- https://man7.org/linux/man-pages/man8/ip-route.8.html
- https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html
- https://wiki.archlinux.org/title/Network_configuration
- https://www.rfc-editor.org/rfc/rfc1918
- https://en.wikipedia.org/wiki/Linux_namespaces
