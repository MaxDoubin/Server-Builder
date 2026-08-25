
## The problem

You have two Macs sitting a metre apart, each with a port rated at 40 Gbps, and moving a project folder between them is crawling over Wi-Fi or a gigabit switch. Or you plugged the cable in, macOS created something called Thunderbolt Bridge, and now you have an interface with a 169.254 address that cannot reach anything and may have broken your internet. Here is what Thunderbolt networking is underneath, how to prove it is carrying traffic, and where it stops being the right tool.

## What Thunderbolt networking is

Thunderbolt supports native IP networking when you connect two Macs with a Thunderbolt cable. The connection appears as a standard network interface, and you get speeds up to 10 Gbps (Thunderbolt 3/4) with extremely low latency. No switches, no transceivers, no configuration beyond plugging in a cable.

For direct Mac-to-Mac file transfers, it is the fastest option available. Thunderbolt Bridge in macOS makes it completely transparent to applications. Finder copies, `rsync`, SMB, NFS, `scp`, and Screen Sharing all use it the moment the routing table points that way.

## How it works underneath

Thunderbolt is a tunnelling protocol, not a network protocol. The link carries PCIe, DisplayPort, and since Thunderbolt 3 also USB packets, each in its own tunnel over the same wire. Host-to-host is the awkward case. Normally one side is a host and the other is a PCIe endpoint, but when you join two Macs neither is willing to be the peripheral. Instead the two controllers negotiate a direct DMA path between host memory on each side, and each operating system presents that path to its network stack as an ordinary Ethernet NIC. Apple's protocol for this is called ThunderboltIP, which is why the link shows up with a MAC address and an MTU like any other interface. macOS then wraps it in a real layer 2 bridge, `bridge0`, whose members are the machine's Thunderbolt ports. That detail matters later.

The link rates, in order: Thunderbolt 1 in 2011 at 10 Gbps per channel, Thunderbolt 2 in 2013 aggregating two channels to 20 Gbps, Thunderbolt 3 in 2015 at 40 Gbps on USB-C, Thunderbolt 4 in 2020 at the same 40 Gbps with stricter mandatory minimums, and Thunderbolt 5 raising it to 80 Gbps bidirectional with an asymmetric mode reaching 120 Gbps in one direction. Do not expect the link rate to be your transfer rate. That 40 Gbps is the whole link, shared with display and USB tunnels, and IP traffic crosses the ThunderboltIP path with the host CPU in the loop on both ends.

## Setting it up, with commands

Plug a Thunderbolt cable between two powered-on Macs, then look for the interface.

```bash
networksetup -listallhardwareports
```

You want this block in the output:

```
Hardware Port: Thunderbolt Bridge
Device: bridge0
Ethernet Address: 36:1a:4c:2f:88:01
```

If it is missing, the Thunderbolt Bridge service was deleted from Network settings and has to be added back. If it is present, check that the cable actually came up:

```bash
ifconfig bridge0
```

Correct output has a `member:` line per Thunderbolt port, `status: active`, and an address:

```
bridge0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST> mtu 1500
	member: en5 flags=3<LEARNING,DISCOVER>
	member: en6 flags=3<LEARNING,DISCOVER>
	inet 169.254.212.44 netmask 0xffff0000 broadcast 169.254.255.255
	status: active
```

The 169.254 address is not an error. With no DHCP on a two-node link, each side self-assigns an IPv4 link-local address out of 169.254.0.0/16 as described in RFC 3927, and the two will talk happily on it. Add multicast DNS (RFC 6762) and `ping othermac.local` works with zero configuration.

I still prefer static addresses on a lab link, because link-local addresses move and I want the same target every time:

```bash
# On Mac A
sudo networksetup -setmanual "Thunderbolt Bridge" 10.99.0.1 255.255.255.0
# On Mac B
sudo networksetup -setmanual "Thunderbolt Bridge" 10.99.0.2 255.255.255.0
```

There is no router argument, deliberately. Leave the gateway empty. This is a private segment between two machines and should never carry a default route.

## Proving it is actually working

```bash
route get 10.99.0.2
netstat -ib | grep -E '^bridge0'
```

The `interface:` line from `route get` must say `bridge0`. If it says `en0`, traffic is going out the wrong door and anything you measure afterwards is a test of your switch. The `netstat -ib` counters are the check a friendly-looking `ping` cannot fake: run it before and after a copy, and Ibytes and Obytes should climb by roughly what you moved.

For throughput, `iperf3` is not part of macOS, so install it with Homebrew or MacPorts:

```bash
# Mac A
iperf3 -s
# Mac B
iperf3 -c 10.99.0.1 -P 4 -t 20
```

Use `-P 4` rather than a single stream. One TCP stream here is usually bounded by one core, and parallel streams give a more honest picture of the link. Then compare `ping -c 20 10.99.0.1` over the bridge against the same host over Wi-Fi. The Thunderbolt figures should be smaller and, more importantly, far less variable. Consistency is the real win, not the peak number.

## Where it works

Thunderbolt networking is fantastic for specific scenarios: editing teams working with shared storage, direct transfers between workstations, and high-speed connections between a Mac Pro and a NAS. In a creative studio environment, it solves a real problem elegantly.

In my lab, I have used Thunderbolt networking between my Mac Pro and a Mac Mini for fast data transfers during media processing workflows. The speed is impressive and the latency is nearly zero. It also earns its place for seeding a new machine's disk image and for giving a headless Mac a management link that survives me breaking its Wi-Fi config.

## Where it falls short

Thunderbolt networking is point-to-point. You cannot build a network fabric with Thunderbolt. There are no Thunderbolt switches. If you need to connect more than two devices, you need to use standard Ethernet.

One partial exception is worth knowing, because `bridge0` really is a bridge. A Mac with two Thunderbolt ports connected to two other Macs will forward frames between them at layer 2, so a three-node chain is technically possible. I do not build anything on it. The middle machine becomes a single point of failure, it burns CPU forwarding traffic that is none of its business, and closing the loop by cabling the third machine back to the first gives you a broadcast storm unless spanning tree is enabled on the bridge.

Distance is the other hard limit. Passive Thunderbolt 3 cables carry the full 40 Gbps only up to about half a metre, and longer passive cables drop to 20 Gbps; Thunderbolt 4 tightened this by requiring 40 Gbps on cables up to 2 m. Optical Thunderbolt cables go much further but cost real money and carry no bus power. Ethernet over copper does 100 m for the price of a sandwich.

## Apple-first, not quite Apple-only

Thunderbolt began as an Intel and Apple collaboration and is now folded into USB4, but the networking feature grew up on Apple's side and it shows. On macOS it configures itself. Everywhere else you are doing work.

To be accurate about Linux, since this comes up every time: the kernel ships a `thunderbolt-net` driver implementing Apple's ThunderboltIP. The kernel documentation states that if the other host runs macOS or Windows, connecting the cable is enough and the driver loads automatically, and that it creates one virtual interface per port named `thunderbolt0` and so on, configured with `ip` like any other NIC. So Mac to Linux does work, on a Linux box that has a Thunderbolt or USB4 controller and `CONFIG_USB4_NET`.

What it is not is a solution for a rack. Thunderbolt controllers live in laptops and small desktops, not in 1U machines with redundant power supplies, and my Linux servers have no Thunderbolt ports at all. The practical rule holds: two nearby Apple machines, and Ethernet the moment a third device enters the picture.

## It is PCIe on a cable

Thunderbolt tunnels PCIe, and PCIe means direct memory access. A device on the far end of that cable is, at the hardware level, asking to read and write your RAM. That is the DMA attack class, and Thunderspy in 2020 demonstrated firmware-level bypasses of Thunderbolt's own device authorization.

The mitigations are real but they are mitigations. Modern Macs sit the controller behind an IOMMU so a device only reaches memory it was granted, and macOS prompts before allowing a new accessory. Linux exposes security levels (`none`, `dponly`, `user`, `secure`) and a per-device `authorized` attribute in sysfs. None of it helps if you click Allow on whatever someone hands you.

## What breaks

**Thunderbolt Bridge above your real network in the service order.** Give the bridge a manually configured router and macOS can promote it to the primary service, sending your default route into a dead two-node link. Symptom: DNS and internet die the moment the cable goes in. Fix: never set a router on the bridge, and drag Thunderbolt Bridge below Wi-Fi and Ethernet in Set Service Order.

**A USB-C cable that is not a Thunderbolt cable.** Same connector, and a charge-only or USB 2.0 cable links the ports electrically without ever bringing up a tunnel. Symptom: no `member:` line, `status: inactive`. Fix: use a cable marked with the lightning bolt, and on Thunderbolt 4 cables the number 4.

**An MTU mismatch after enabling jumbo frames.** Raising the MTU on one end only gives you the classic black hole: `ping` and DNS work, large transfers hang partway and time out. Fix: set the same MTU on both ends or neither, and confirm with `ifconfig bridge0` on both machines before trusting it.

**Judging the link on a single TCP stream.** One stream is limited by one core pushing packets through the ThunderboltIP path. Fix: test with `iperf3 -P 4` or more. If single-stream really is your workload, take that number as the honest answer for that application rather than blaming the cable.

**Assuming the interface survives sleep.** Sleep either Mac and the tunnel drops. On wake the interface returns, but long-lived TCP sessions, mounted SMB shares, and `ssh` connections do not. Fix: disable sleep on machines that must hold a session, and remount shares on wake instead of trusting a stale mount.

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
