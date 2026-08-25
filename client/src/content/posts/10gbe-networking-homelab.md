
## Why 10GbE

Gigabit Ethernet was fine for a while. But once you start moving large VM images, running iSCSI or NFS storage, or doing bulk data transfers between servers, 1 Gbps becomes a real bottleneck. I was regularly saturating my gigabit links during backup windows and VM migrations.

10GbE gives you ten times the bandwidth, obviously, but the practical improvement is even bigger than that sounds. Operations that used to take minutes now take seconds. VM live migrations that were unreliable over gigabit become smooth and fast.

Here is the arithmetic that makes the difference concrete. A gigabit link carries 1,000,000,000 bits per second on the wire. After Ethernet framing, IP headers, and TCP headers, real application throughput tops out around 118 MB/s. A 40 GB VM disk image therefore takes about 5 minutes and 40 seconds at best, and that assumes nothing else is using the link. On 10GbE the same transfer has a floor around 34 seconds. The reason the improvement feels larger than 10x is that at gigabit speeds you were queueing: two transfers at once meant each got half the pipe. At 10GbE you usually stop hitting the ceiling at all, so the wait time collapses instead of just shrinking.

## The Hardware

For the network side, I picked up a used Mellanox ConnectX-3 SFP+ card for each server. These are dual-port 10GbE cards that you can find for very little money on the used market. They are well-supported in Linux with the mlx4 driver and work out of the box on most distributions.

Two things about ConnectX-3 that nobody tells you before you buy. First, many of these cards are VPI models, meaning each port can run either InfiniBand or Ethernet, and a lot of used cards arrive configured for InfiniBand. The symptom is that `lspci` shows the card, the driver loads, and no Ethernet interface ever appears. The fix is to set the port type to Ethernet in firmware with the Mellanox tooling, or to set `mlx4_core` module parameters, and then reboot. Second, ConnectX-3 was removed from the supported hardware list in VMware ESXi 7.0. If you are running ESXi on modern versions, this card is a dead end and you want ConnectX-4 or later. On Linux it remains fine.

Also check the slot. A dual-port ConnectX-3 wants a PCIe 3.0 x8 slot. In a PCIe 2.0 x4 slot you have roughly 2 GB/s of bus bandwidth against 2.5 GB/s of card, so you will never see both ports at line rate simultaneously and you will spend an evening blaming the switch.

For switching, I am using a Mikrotik CRS309-1G-8S+IN. It has eight SFP+ ports and one gigabit copper port for management. It is not a full L3 switch, but for a homelab it handles 10GbE switching at wire speed and costs a fraction of what Cisco or Arista would charge.

The important caveat on cheap 10GbE switches is where the packets actually go. These boxes do layer 2 forwarding in a dedicated switch chip at wire speed, but anything the chip cannot handle falls back to a comparatively slow ARM CPU. Inter-VLAN routing done on the CPU, or a bandwidth test terminated on the switch itself, will read a few hundred megabits and look like a broken link. It is not broken. You have just left the fast path. Keep routing on a real router and let the switch switch.

I am using DAC (Direct Attach Copper) cables between the switch and servers. DACs are cheaper than optical transceivers for short runs and work perfectly in a single-rack setup.

Passive DAC is specified out to about 7 meters, which covers any single rack with room to spare. Past that you want active DAC or optics. The other gotcha is vendor coding: the EEPROM in an SFP+ module carries a vendor string, and some switches refuse modules that do not match. MikroTik does not care. Cisco does by default and needs `service unsupported-transceiver` to accept third-party optics. Buy DACs coded for whatever is at each end, or buy from a seller who will code them for you.

## Configuration

The nice thing about 10GbE with SFP+ is that it works exactly like gigabit Ethernet at the OS level. Assign an IP, set up your routes, and go. There is no special configuration needed beyond installing the NIC and connecting the cables.

I did set up jumbo frames (MTU 9000) across the 10GbE network to reduce overhead for large transfers. This requires consistent MTU settings on every device in the path, including the switch, or you will get fragmentation issues that are painful to debug.

The reason jumbo frames matter at 10 Gbps and barely mattered at 1 Gbps is packet rate. At 1500 byte MTU, saturating a 10GbE link takes roughly 812,000 packets per second in each direction. Every one of those needs header processing. At MTU 9000 the same throughput needs about 138,000 packets per second, so you cut per-packet CPU work by a factor of six.

Here is the detail almost everyone gets wrong the first time. Hosts configure MTU, which is the IP payload size, so you set 9000. Switches configure maximum frame size, which includes the 14 byte Ethernet header and the 4 byte frame check sequence, so the switch needs at least 9018, and 9022 if the port carries a VLAN tag. That is why switch vendors quote numbers like 9216 while your servers say 9000, and why setting the switch to exactly 9000 silently breaks full size frames. RouterOS makes this explicit by exposing both an L2 MTU and an MTU per interface. Set L2 MTU high on every port in the path, then set host MTU.

```bash
# Check what the link actually negotiated and which offloads are on.
ethtool enp1s0f0 | grep -E 'Speed|Duplex|Link detected'
ethtool -k enp1s0f0 | grep -E 'tcp-segmentation|generic-receive|scatter-gather'

# Set the MTU on the host side.
sudo ip link set dev enp1s0f0 mtu 9000

# Prove the whole path carries a full size frame. 8972 payload
# plus 8 bytes ICMP header plus 20 bytes IP header equals 9000.
ping -M do -s 8972 -c 3 10.0.30.20
```

Set the switch first, then the hosts. A switch still at 1500 will drop the oversize frames your host happily generates, and the resulting failure looks like an application bug rather than a network one.

## The Failure Modes

**Small things work, large transfers hang.** SSH connects, ping succeeds, then a file copy freezes at a few hundred kilobytes. This is an MTU mismatch every time. One device in the path is still at 1500 and the do-not-fragment ping above will tell you which side. Run it from both ends.

**Single stream tops out around 3 to 4 Gbps.** This is almost never the wire. A single TCP flow is handled by a single receive queue and therefore a single CPU core, and at 10 Gbps that core runs out of headroom. Confirm it by running `iperf3 -c <host> -P 4` and seeing the aggregate jump. If four streams reach line rate and one does not, the network is fine and the fix is offloads, receive side scaling, or simply accepting that most real workloads use more than one connection.

**Throughput is fine but the storage is not.** A single 7200 RPM SATA drive sustains roughly 150 to 200 MB/s sequential, which is about 1.6 Gbps. You cannot pull 10 Gbps out of one spinning disk no matter what the NIC does. Benchmark the array locally before blaming the network. This is the most common disappointment after a 10GbE upgrade.

**The card overheats.** ConnectX-3 and similar server NICs assume forced airflow from chassis fans. In a quiet tower with a slow front fan the ASIC throttles or the link drops intermittently under load. Check `sensors` or the card temperature via `ethtool -m`. A small fan aimed at the heatsink genuinely fixes this.

**Pause frames cause weird stalls.** Ethernet flow control lets a congested receiver tell the sender to stop, which sounds helpful and in practice causes head of line blocking that stalls unrelated traffic on the same port. If you see periodic multi-second freezes, check pause frame counters in `ethtool -S` and consider turning flow control off.

## What 10GbE Does Not Fix

Bandwidth is not latency. Round trip time on a 10GbE link is not meaningfully better than gigabit for small requests, because the time is dominated by switching, driver, and kernel path, not serialization. A workload that makes thousands of small synchronous requests, such as a database doing single row lookups or `rsync` over a tree of tiny files, will be almost exactly as slow as it was before. If that is your problem, you need fewer round trips or faster storage, not a faster NIC.

10GbE also does nothing for random IOPS, nothing for single-threaded application performance, and nothing for anything crossing your internet connection. And if your bottleneck was a consumer NAS with a weak CPU, you will find the CPU is now the limit.

Be honest about whether you need it. If your largest regular transfer is a few gigabytes overnight, gigabit is already sufficient and the money is better spent on SSDs. I upgraded because backup windows and live migration were measurably painful, not because the number was bigger.

## What Changed

The biggest quality-of-life improvement is VM storage. I run NFS datastores for some of my virtualization hosts, and going from gigabit to 10GbE made NFS feel local. Boot times dropped, snapshot operations got faster, and I stopped worrying about storage I/O being a bottleneck.

Backup windows also shrank significantly. A full backup that took 45 minutes over gigabit now finishes in about 5 minutes. That means I can take more frequent backups without impacting other workloads.

The unexpected benefit was diagnostic. When the network stopped being the obvious bottleneck, every remaining slow operation had a real cause I could go find, and several of them turned out to be a badly configured NFS mount and a drive that was quietly failing.

## References

- https://en.wikipedia.org/wiki/10_Gigabit_Ethernet
- https://en.wikipedia.org/wiki/Small_Form-factor_Pluggable
- https://man7.org/linux/man-pages/man8/ethtool.8.html
- https://man7.org/linux/man-pages/man8/ip-link.8.html
- https://www.kernel.org/doc/html/latest/networking/segmentation-offloads.html
- https://help.mikrotik.com/docs/spaces/ROS/pages/103841822/CRS3xx+CRS5xx+CCR2116+CCR2216+switch+chip+features
