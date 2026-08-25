
## The problem

You have two Macs sitting a metre apart, each with a port rated at 40 Gbps, and moving a project folder between them is crawling over Wi-Fi or a gigabit switch. Or you already plugged in the cable, macOS created something called Thunderbolt Bridge, and now you have an interface with a 169.254 address that cannot reach anything and possibly broke your internet. This post covers what Thunderbolt networking actually is underneath, how to set it up and prove it is carrying traffic, and the specific places it stops being the right tool.

## What Thunderbolt networking is

Thunderbolt supports native IP networking when you connect two Macs with a Thunderbolt cable. The connection appears as a standard network interface, and you get speeds up to 10 Gbps (Thunderbolt 3/4) with extremely low latency. No switches, no transceivers, no configuration beyond plugging in a cable.

For direct Mac-to-Mac file transfers, it is the fastest option available. Thunderbolt Bridge in macOS makes it completely transparent to applications. Finder copies, `rsync`, SMB, NFS, `scp`, Screen Sharing, and anything else that speaks IP will use it the moment the routing table points that way.

## How it works underneath

Thunderbolt is a tunnelling protocol, not a network protocol. The physical link carries PCIe packets, DisplayPort packets, and since Thunderbolt 3 also USB packets, each in its own tunnel over the same wire. That design is why a single port can drive a monitor, an SSD, and a keyboard at the same time.

Host-to-host is the awkward case. Normally one side is a host and the other is a PCIe endpoint, but when you join two Macs neither one is willing to be a peripheral. Instead the two Thunderbolt controllers negotiate a direct DMA path between host memory on each side, and each operating system presents that path to its network stack as an ordinary Ethernet NIC. Apple's protocol for this is called ThunderboltIP, and it is the reason the link shows up with a MAC address and an MTU like any other interface.

macOS wraps that in something slightly different again. "Thunderbolt Bridge" is a real layer 2 bridge, `bridge0`, whose members are all of the machine's Thunderbolt ports. That detail matters later.

The headline speeds, in order: Thunderbolt 1 in 2011 at 10 Gbps per channel, Thunderbolt 2 in 2013 aggregating two channels to 20 Gbps, Thunderbolt 3 in 2015 at 40 Gbps on a USB-C connector, Thunderbolt 4 in 2020 at the same 40 Gbps with stricter mandatory minimums, and Thunderbolt 5 raising the link to 80 Gbps bidirectional with an asymmetric mode that pushes 120 Gbps in one direction. Do not expect the link rate to be your file transfer rate. That 40 Gbps is the entire link, shared with display and USB tunnels, and IP traffic has to cross the ThunderboltIP path with the host CPU in the loop on both ends. Real single-stream throughput lands well below the number printed on the box.

## Setting it up, with commands

Plug a Thunderbolt cable between two powered-on Macs. Both should show the interface immediately.

```bash
networksetup -listallhardwareports
```

You are looking for this block in the output:

```
Hardware Port: Thunderbolt Bridge
Device: bridge0
Ethernet Address: 36:1a:4c:2f:88:01
```

If `bridge0` is missing entirely, the Thunderbolt Bridge service was deleted from Network settings and you need to add it back. If it is present but the cable is not seen, check the members:

```bash
ifconfig bridge0
```

Correct output includes a `member:` line for each Thunderbolt port, a `status: active` line, and an inet address:

```
bridge0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	member: en5 flags=3<LEARNING,DISCOVER>
	member: en6 flags=3<LEARNING,DISCOVER>
	inet 169.254.212.44 netmask 0xffff0000 broadcast 169.254.255.255
	status: active
```

That 169.254 address is not an error. With no DHCP server on a two-node link, both sides self-assign an IPv4 link-local address out of 169.254.0.0/16 as described in RFC 3927, and they will happily talk to each other on it. Combined with multicast DNS (RFC 6762), `ping othermac.local` usually just works with zero configuration.

I still prefer static addresses on a lab link, because link-local addresses change and I want the same target every time:

```bash
# On Mac A
sudo networksetup -setmanual "Thunderbolt Bridge" 10.99.0.1 255.255.255.0
# On Mac B
sudo networksetup -setmanual "Thunderbolt Bridge" 10.99.0.2 255.255.255.0
```

Note that there is no router argument. Leave the gateway empty. This link is a private segment between two machines and should never be a default route.

## Proving it is actually working

Three checks, in order of how much they tell you.

First, confirm the kernel will route to the peer over the bridge rather than over Wi-Fi:

```bash
route get 10.99.0.2
```

The `interface:` line in the output must say `bridge0`. If it says `en0`, your traffic is going out the wrong door and everything below will be measuring your switch.

Second, watch the byte counters move while you copy something:

```bash
netstat -ib | grep -E '^bridge0'
```

Run it before and after a transfer. The Ibytes and Obytes columns should climb by roughly the size of what you moved. This is the single most useful check, because it is the only one that cannot be faked by a friendly-looking `ping`.

Third, measure. `iperf3` is not part of macOS, so install it with Homebrew or MacPorts, then run a server on one side and a client on the other:

```bash
# Mac A
iperf3 -s
# Mac B
iperf3 -c 10.99.0.1 -P 4 -t 20
```

Use `-P 4` rather than a single stream. One TCP stream on this path is usually CPU bound on one core, and four parallel streams give you a much more honest picture of the link. Compare a `ping -c 20 10.99.0.1` over the bridge against the same ping to that machine over Wi-Fi. The Thunderbolt figures should be smaller and, more importantly, far less variable. Consistency is the real win here, not the peak number.

## Where it works

Thunderbolt networking is fantastic for specific scenarios: editing teams working with shared storage, direct transfers between workstations, and high-speed connections between a Mac Pro and a NAS. In a creative studio environment, it solves a real problem elegantly.

In my lab, I have used Thunderbolt networking between my Mac Pro and a Mac Mini for fast data transfers during media processing workflows. The speed is impressive and the latency is nearly zero. Other cases where I reach for it: seeding a new machine's disk image, running a backup that would otherwise saturate the switch for an hour, and giving a headless Mac a management link that survives me breaking its Wi-Fi config.

## Where it falls short

Thunderbolt networking is point-to-point. You cannot build a network fabric with Thunderbolt. There are no Thunderbolt switches. If you need to connect more than two devices, you need to use standard Ethernet.

There is one partial exception worth knowing, because `bridge0` really is a bridge. A Mac with two Thunderbolt ports connected to two other Macs will forward frames between them at layer 2, which makes a three-node chain technically possible. I do not build anything on that. The middle machine becomes a single point of failure, it burns CPU forwarding traffic that has nothing to do with it, and if you ever close the loop by cabling the third machine back to the first you get a broadcast storm unless spanning tree is enabled on the bridge. A real switch costs less than the afternoon you will spend debugging that.

Distance is the other hard limit. Passive Thunderbolt 3 cables run at the full 40 Gbps only up to about half a metre; longer passive cables drop to 20 Gbps. Thunderbolt 4 tightened this by requiring 40 Gbps support on cables up to 2 m. Optical Thunderbolt cables reach much further but cost real money and do not carry bus power. Ethernet over copper does 100 m for the price of a sandwich.

## Apple-first, not quite Apple-only

Thunderbolt started as an Intel and Apple collaboration and is now folded into USB4, but the networking feature grew up on Apple's side and it shows. On macOS it configures itself. Everywhere else you are doing work.

To be accurate about the Linux case, since this comes up every time I mention it: the Linux kernel does ship a `thunderbolt-net` driver that implements Apple's ThunderboltIP protocol. The kernel's own documentation says that if the other host runs macOS or Windows, connecting the cable is enough and the driver loads automatically, and that it creates one virtual interface per port named `thunderbolt0` and so on, which you configure with `ip` like any other NIC. So Mac-to-Linux host-to-host networking is a real, supported thing on a Linux box that has a Thunderbolt or USB4 controller and a kernel with `CONFIG_USB4_NET`.

What it is not is a general solution for a rack. My Linux servers do not have Thunderbolt ports, and neither do most people's. Thunderbolt controllers live in laptops and small desktops, not in 1U machines with redundant power supplies. So the practical rule holds: treat it as a link between two nearby Apple machines, and reach for Ethernet the moment a third device or a switch enters the picture.

## It is PCIe on a cable, so treat it that way

This is the part people skip. Thunderbolt tunnels PCIe, and PCIe means direct memory access. A malicious device on the other end of that cable is, at the hardware level, asking to read and write your RAM. This class of attack has a name and a history: DMA attacks generally, and Thunderspy in 2020 specifically, which demonstrated firmware-level bypasses of Thunderbolt's own device authorization.

The mitigations are real but they are mitigations. Modern Macs put the Thunderbolt controller behind an IOMMU so a device only sees memory it was granted, and macOS on Apple silicon and T2 Macs prompts before allowing a new accessory to connect. Linux exposes security levels (`none`, `dponly`, `user`, `secure`) and an `authorized` attribute per device in sysfs. None of that helps if you click Allow on whatever someone hands you. My rule is simple: I do not plug unknown Thunderbolt devices into anything I care about, and a locked screen is not protection against a cable.

## What breaks

**Thunderbolt Bridge sitting above your real network in the service order.** If the bridge has a manually configured router, macOS can promote it to the primary service and send your default route into a dead two-node link. Symptom: DNS and internet die the moment you plug the cable in. Fix: never set a router on the bridge, and in Network settings drag Thunderbolt Bridge below Wi-Fi and Ethernet in Set Service Order.

**A USB-C cable that is not a Thunderbolt cable.** They are the same connector, and a charge-only or USB 2.0 cable will link the ports electrically without ever bringing up a Thunderbolt tunnel. Symptom: no `member:` line, `status: inactive`, no bridge interface. Fix: use a cable that says Thunderbolt on it, with the lightning bolt and, on Thunderbolt 4 cables, the number 4.

**An MTU mismatch after enabling jumbo frames.** Raising the MTU on one end only produces the classic black hole: small packets like `ping` and DNS work fine, and any large transfer hangs partway through and eventually times out. Fix: set the same MTU on both ends, or set neither. Change it in the Hardware tab of the interface configuration, and verify with `ifconfig bridge0` on both machines before you trust it.

**Testing with a single TCP stream and concluding the link is slow.** One stream is bounded by one core's ability to shovel packets through the ThunderboltIP path. Fix: test with `iperf3 -P 4` or more, and if a single-stream application really is your workload, accept that number as the honest answer for that application rather than blaming the cable.

**Assuming the interface survives sleep.** Put either Mac to sleep and the tunnel drops; on wake the interface comes back but long-lived TCP sessions, mounted SMB shares, and `ssh` connections do not. Fix: for a machine that must hold a session, disable sleep on the servers involved and remount shares on wake rather than assuming a stale mount is still valid.

## My take

Thunderbolt networking is a great tool for specific problems, and a terrible general-purpose networking solution. I use it when I need fast direct connections between Apple devices, and I use 10GbE for everything else.

The ideal setup, which is what I have, is both. My Mac Pro has a Mellanox 10GbE card for connecting to the general network and a Thunderbolt port for direct connections when I need the extra speed. The Ethernet side is the network. The Thunderbolt side is a very fast piece of string between two specific machines, and understanding it that way keeps me from asking it to be something it is not.

## References

- https://en.wikipedia.org/wiki/Thunderbolt_(interface)
- https://en.wikipedia.org/wiki/USB4
- https://www.kernel.org/doc/html/latest/admin-guide/thunderbolt.html
- https://www.rfc-editor.org/rfc/rfc3927
- https://www.rfc-editor.org/rfc/rfc6762
- https://en.wikipedia.org/wiki/DMA_attack
