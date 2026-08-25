## The problem

You have a flat home network where everything sits on 192.168.1.0/24, you want to split it into segments, and every guide you open asks you to convert octets to binary and fill in a worksheet. That is not what you need. You need to know how to pick ranges that will not collide, how to write them down so future you can read them, and how to tell quickly when you got one wrong.

## Why subnetting matters

Subnetting divides a large network into smaller, more manageable segments. Each subnet is its own broadcast domain, which means broadcast traffic stays within the subnet instead of flooding the entire network. This improves performance, security, and manageability.

In my lab, subnetting is how I give each VLAN its own address space and control routing between them. A VLAN gives you the Layer 2 boundary. The subnet gives you the Layer 3 boundary that sits on top of it. The two are separate ideas that almost always get configured together, and confusing them is where a lot of early trouble comes from.

## CIDR notation

CIDR (Classless Inter-Domain Routing) notation uses a slash followed by the number of bits in the network portion of the address. A /24 network has 256 addresses (254 usable). A /25 has 128 (126 usable). A /28 has 16 (14 usable).

The quick mental math: start with 32, subtract the CIDR number, raise 2 to that power. That is your total addresses. Subtract 2 for network and broadcast.

The two addresses you subtract are not arbitrary. The address with all host bits set to zero identifies the subnet itself, and the address with all host bits set to one is the directed broadcast for that subnet. Neither can be assigned to an interface.

Two prefix lengths are exceptions worth knowing. A /32 is a single host route, used for loopbacks and for pinning a route to one address. A /31 has only two addresses and no room for a network and broadcast pair, and RFC 3021 defines it specifically so both addresses are usable on a point-to-point link. Older gear does not always support /31, which is why you still see /30 links wasting two addresses each.

## Reading a mask without binary

You only ever need the last non-255 octet, and there are only eight values it can take:

- /25 is 255.255.255.128
- /26 is 255.255.255.192
- /27 is 255.255.255.224
- /28 is 255.255.255.240
- /29 is 255.255.255.248
- /30 is 255.255.255.252
- /31 is 255.255.255.254
- /32 is 255.255.255.255

The trick that makes this fast is block size. Subtract that octet value from 256 and you get the spacing between consecutive subnets. For a /26, 256 minus 192 is 64, so the subnets are x.x.x.0, x.x.x.64, x.x.x.128, and x.x.x.192. For a /28, the block size is 16, so subnets start at 0, 16, 32, 48, and so on. Once you can produce block size in your head, you can name the network address, the first host, the last host, and the broadcast for any prefix without writing anything down.

## My network layout

I use 10.0.0.0/8 as my overall private address space, divided into /24 subnets for each VLAN:

- 10.0.10.0/24 for management (254 usable addresses, way more than I need, but clean)
- 10.0.20.0/24 for servers
- 10.0.30.0/24 for user devices
- 10.0.40.0/24 for IoT
- 10.0.50.0/24 for lab/testing
- 10.0.99.0/24 for guests

Using the third octet to match the VLAN ID makes the addressing scheme intuitive. If I see an IP starting with 10.0.40, I immediately know it is an IoT device.

The one limit of that scheme, and it is worth knowing before you commit to it: VLAN IDs are 12 bits and run from 1 to 4094, while an octet only runs from 0 to 255. The mapping is clean right up until you want VLAN 300. If you think you will ever go past VLAN 255, encode the VLAN across the second and third octets instead, or accept that the mapping is a convention that stops at 255.

10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16 are the three private ranges reserved by RFC 1918. Anything you assign should come out of one of them. 169.254.0.0/16 is link-local and is what an interface gives itself when DHCP fails, so seeing a 169.254 address on a host is a diagnosis, not a configuration.

## VLSM in practice

Variable Length Subnet Masking (VLSM) lets you use different subnet sizes within the same network. My management VLAN only has about 15 devices, so a /24 is wasteful. I could use a /28 (14 usable) and conserve address space.

In practice, I keep everything at /24 because simplicity matters more than address conservation in a private network. If I were designing a public-facing network with limited IP space, VLSM would be essential.

The other reason to keep uniform /24s in a lab is that a subnet is very hard to grow after the fact. Widening 10.0.10.0/28 to a /27 means every host, every DHCP scope, and every firewall rule that referenced the old mask has to change at the same time, and the ones you miss fail in ways that only show up for some pairs of hosts. Allocating generously up front costs nothing when the addresses are free.

## Working it out with Python

I do not do subnet arithmetic by hand any more. The `ipaddress` module in the Python standard library is the fastest way to get an authoritative answer, and it ships with every Python 3 install.

```bash
python3 -c "
import ipaddress
net = ipaddress.ip_network('10.0.40.0/24')
print('network  ', net.network_address)
print('broadcast', net.broadcast_address)
print('total    ', net.num_addresses)
hosts = list(net.hosts())
print('first    ', hosts[0])
print('last     ', hosts[-1])
"
```

Correct output:

```
network   10.0.40.0
broadcast 10.0.40.255
total     256
first     10.0.40.1
last      10.0.40.254
```

The check I actually care about is overlap. Before I add a subnet to the plan, I run every pair through `overlaps()`:

```bash
python3 -c "
import ipaddress
plan = ['10.0.10.0/24','10.0.20.0/24','10.0.30.0/24',
        '10.0.40.0/24','10.0.50.0/24','10.0.99.0/24',
        '172.17.0.0/16']
nets = [ipaddress.ip_network(s) for s in plan]
bad = 0
for i, a in enumerate(nets):
    for b in nets[i+1:]:
        if a.overlaps(b):
            print('OVERLAP', a, b)
            bad += 1
print('checked', len(nets), 'subnets,', bad, 'conflicts')
"
```

A clean plan prints:

```
checked 7 subnets, 0 conflicts
```

If you want to carve a /24 into smaller pieces, `subnets()` does the arithmetic:

```bash
python3 -c "
import ipaddress
for s in ipaddress.ip_network('10.0.10.0/24').subnets(new_prefix=28):
    print(s, list(s.hosts())[0], list(s.hosts())[-1])
" | head -3
```

```
10.0.10.0/28 10.0.10.1 10.0.10.14
10.0.10.16/28 10.0.10.17 10.0.10.30
10.0.10.32/28 10.0.10.33 10.0.10.46
```

## Confirming it on the host

Once it is configured, two commands tell you whether the host agrees with your plan.

```bash
ip -brief address show
```

```
lo     UNKNOWN  127.0.0.1/8 ::1/128
ens18  UP       10.0.20.5/24 fe80::5054:ff:fe12:3456/64
```

The prefix printed after the address is the mask the host is actually using, not the one you meant to set. Then confirm which way traffic will leave:

```bash
ip route get 10.0.30.15
```

```
10.0.30.15 via 10.0.20.1 dev ens18 src 10.0.20.5 uid 1000
    cache
```

`via 10.0.20.1` means the host correctly decided the destination is off-subnet and handed it to the gateway. If you expected a gateway and instead see `dev ens18 src ...` with no `via`, the host thinks the destination is on its own wire, which means your mask is wider than you intended.

## Common mistakes

**Overlapping subnets.** The most common subnetting mistake I see. If two VLANs have overlapping address ranges, routing breaks in confusing ways. Always plan your subnet layout on paper before configuring anything, and make sure every subnet uses a non-overlapping range. The overlaps that catch people are the ones they did not choose: Docker's default bridge sits on 172.17.0.0/16, and plenty of corporate VPNs hand out 10.x space. If your lab uses 10.0.x, a VPN route for 10.0.0.0/8 will swallow your whole network the moment you connect.

**Forgetting the gateway.** Every subnet needs a gateway address (usually .1) configured on the router or L3 switch for inter-subnet traffic to work. A host with a correct address and no reachable gateway can talk to its neighbours perfectly and nothing else, which reads like a firewall problem and is not.

**Mask mismatch between hosts on the same wire.** Host A is 10.0.20.5/24 and host B is 10.0.20.200/25. B thinks A is off-subnet and sends to the gateway, A thinks B is local and sends directly. Traffic works in one direction and fails in the other, or works until a router stops proxying. Always check the prefix on both ends, not just the addresses.

**DHCP pool overlapping the static range.** The DHCP server does not know which addresses you typed into a server by hand. Reserve an explicit block, for example .1 to .49 for infrastructure and statics, .100 to .199 for the pool, and keep the rest empty. Duplicate address detection will eventually tell you, but only after something has already gone offline.

**Assigning the network or broadcast address.** In a /24 the .0 and .255 are not usable, and in a /26 the unusable pair moves to every block boundary: .0 and .63, .64 and .127, and so on. Handing out 10.0.20.63 in a /26 gives you a host that half the network can reach and nothing can broadcast past.

## References

- https://www.rfc-editor.org/rfc/rfc4632
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc3021
- https://www.rfc-editor.org/rfc/rfc6890
- https://docs.python.org/3/library/ipaddress.html
- https://man7.org/linux/man-pages/man8/ip-address.8.html
