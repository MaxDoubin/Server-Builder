
## Start with the network

The lab worked fine with one server. Now there are five, two of them need isolated networks, you cannot remember which port on the switch goes where, and the breaker tripped once last month for reasons nobody established. Nothing here is broken exactly, but nothing is trustworthy either.

The biggest mistake in homelab growth is treating the network as an afterthought. When you add your fifth server and third VLAN, suddenly the flat network you started with is a mess. Traffic that should stay local hops through random paths. Troubleshooting is painful.

Plan for segmentation from the beginning, even if you only have one server. A managed switch, a few [VLANs](/blog/vlan-segmentation-guide), and a firewall cost relatively little and provide the structure you need to grow cleanly.

## An addressing plan you will not regret

Pick the plan before you need it, because renumbering a live lab is miserable. RFC 1918 gives you three private ranges to work with: 10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16. Use 10.x, and make the second octet mean something.

The scheme that has held up for me is one /24 per VLAN with the VLAN ID encoded in the third octet, so you can read an address and know instantly where it lives:

| VLAN | Purpose | Subnet | Gateway |
|---|---|---|---|
| 10 | Management (switches, [IPMI](/blog/ipmi-remote-management), hypervisor) | 10.0.10.0/24 | 10.0.10.1 |
| 20 | Servers and VMs | 10.0.20.0/24 | 10.0.20.1 |
| 30 | Trusted clients | 10.0.30.0/24 | 10.0.30.1 |
| 40 | IoT and untrusted devices | 10.0.40.0/24 | 10.0.40.1 |
| 50 | Lab and detonation | 10.0.50.0/24 | 10.0.50.1 |

Two conventions inside each /24 save real time later: static addresses in the low range (.2 to .49) for anything that must never move, DHCP pool in the middle, and reservations for anything you want to find by name. A /24 gives you 254 usable hosts, which is far more than a lab needs, and that headroom is the point.

Avoid 192.168.0.0/24 and 192.168.1.0/24 entirely. Every consumer router in the world ships with one of them, so the day you VPN into the lab from a friend's house or a hotel, the routes collide and nothing works. Picking an unusual range costs nothing and removes an entire category of confusing failure.

## Document before you forget

Documentation is easiest when you are setting something up the first time. A week later, you will not remember which port on which switch connects to which server, or which IP address you assigned to which management interface.

I keep a simple network diagram (updated whenever something changes) and a spreadsheet with IP assignments. It takes ten minutes to update and saves hours of confusion later.

Keep the documentation somewhere that survives the lab being down. A wiki hosted on a VM inside the lab is useless during the outage you most need it for. Plain text or markdown in a git repository, synced off the lab, works and costs nothing.

The other kind of documentation is the kind the network generates for itself. If your switches speak LLDP, you can ask the network what is plugged in instead of trusting a spreadsheet:

```bash
sudo apt install lldpd
sudo lldpctl
```

Correct output names the switch and the exact port on the other end of the cable:

```
Interface:    eno1, via: LLDP
  Chassis:
    ChassisID:    mac 00:1b:21:aa:bb:cc
    SysName:      core-sw
  Port:
    PortID:       ifname GigabitEthernet1/0/14
    PortDescr:    hv01-mgmt
```

When `lldpctl` and your spreadsheet disagree, the spreadsheet is wrong. That is worth checking every few months.

## Power planning

Power is often the binding constraint in a homelab. A single R740 under load pulls 400-600W. Add another server, a UPS, and a few switches, and you are approaching the capacity of a typical residential circuit.

Calculate your power draw before buying hardware. Know which circuits you have available, what their capacity is, and how you will distribute load across them. A UPS gives you clean power and runtime for graceful shutdowns.

The numbers you need are simple. A 15 A branch circuit at 120 V is 1800 VA, but electrical code treats anything running for three hours or more as a continuous load and limits it to 80 percent of the breaker rating. That is 1440 W of usable continuous draw on a 15 A circuit, and 1920 W on a 20 A circuit. Two loaded servers and the supporting gear will reach that.

Watch the VA and watt ratings on a UPS separately. They are not the same number: a unit advertised at 1500 VA is frequently rated for something closer to 900 W, and it is the watt figure that decides whether your gear stays up. Size for the load you actually measure at the wall, not the sum of the power supply labels, which are maximums nobody reaches.

Runtime is the other half. A UPS in a lab is not there to ride out a long outage, it is there to buy the two or three minutes your hypervisors need to shut down cleanly. Wire the UPS to talk to the servers so that shutdown actually happens, and test it by pulling the plug on purpose while you are standing there, not by hoping.

## Cables and cable management

Cable management that seems like excessive effort when you have three devices becomes essential when you have thirty. Spend time on it early. Label everything: patch cables, power cables, fiber. A label maker is one of the best investments in a growing lab.

A few rules that pay for themselves. Label both ends of every cable with the same identifier, because a label you can only read from the back of the rack is not a label. Use colour to encode function, so management, storage, and uplinks are visually distinct before you read anything. Buy the length you need rather than coiling three metres of slack behind every server, since slack is what turns a rack into a nest.

Fiber has one extra rule: respect the minimum bend radius. Kinking a patch cable around a rack post will not snap it visibly, it will just raise the loss until the link flaps intermittently at 3 a.m. and you spend a weekend blaming the transceiver.

## Test everything

Each time you add something to the lab, test it thoroughly before relying on it. A new switch, a new server, a new cable: verify it works under load before you depend on it for anything important.

Here is what "test it" concretely means for a new link. First confirm the negotiated speed rather than the speed you assume:

```bash
ethtool eno1 | grep -E "Speed|Duplex|Link detected"
```

```
	Speed: 10000Mb/s
	Duplex: Full
	Link detected: yes
```

Then push real traffic across it for long enough to matter:

```bash
# on the far end
iperf3 -s
# on the near end, 60 seconds, four parallel streams
iperf3 -c 10.0.20.5 -t 60 -P 4
```

A healthy 10 Gbps link reports a summed throughput in the 9.3 to 9.9 Gbits/sec range and zero retransmits. Retransmits climbing steadily, or throughput that starts high and collapses after ten seconds, points at a bad cable, a dirty fiber connector, or a switch buffer problem, and it is far better to find that now than during a migration.

Finally, check the error counters after the test, because a link can pass a throughput test while quietly corrupting frames:

```bash
ip -s link show eno1
```

The RX and TX error and dropped columns should be zero. Any non-zero value on a brand new link is a defect, not a rounding error.

The lab is a place to practice and learn. Let it teach you through failures in controlled conditions, not through production outages.

## What breaks

**Everything on one VLAN because segmentation was going to be phase two.** Phase two never arrives on its own. Retrofitting VLANs means renumbering hosts, rewriting firewall rules, and reconfiguring every service that hard-coded an IP. Segment early, when there are three things to move instead of thirty.

**Management on the same network as workloads.** When a VM chews the link or a broadcast storm starts, you lose the ability to log in and fix it at exactly the moment you need it. Keep switch management, IPMI, and hypervisor management on their own VLAN, and make sure you can reach that VLAN from a machine that is not itself inside the lab.

**One circuit, two servers, and a heater on the same wall.** Breakers trip from total load, not from the load you were thinking about. Map which outlets share a breaker before you distribute equipment, because outlets in different rooms are frequently on the same circuit and the panel labels are often wrong.

**DHCP handing out addresses that collide with statics.** If the DHCP pool covers the whole subnet and you assign statics by hand from the same range, you will eventually get a duplicate. Carve the pool explicitly, keep statics outside it, and write the split down in the same place as the subnet table.

**Trusting a cable because it passed link.** A cable can negotiate 1 Gbps and still be marginal, and a fiber connector with dust on it will link up and then error under load. Link lights mean the physical layer found a peer, nothing more. Test throughput and check error counters before you build anything on top of it.

## References

- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc2131
- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://en.wikipedia.org/wiki/19-inch_rack
- https://en.wikipedia.org/wiki/National_Electrical_Code
- https://wiki.archlinux.org/title/Network_configuration
