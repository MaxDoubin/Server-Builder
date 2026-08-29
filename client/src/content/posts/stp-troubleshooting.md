
## STP is everywhere

The network is down, every link light on every switch is blinking in perfect unison, the switch console takes ten seconds to echo a character, and nothing you ping responds. That specific combination has one likely cause, and you need to stop it before you can investigate it.

[Spanning Tree Protocol](/blog/spanning-tree-protocol-deep-dive) runs on every enterprise switch, usually without anyone thinking about it. It prevents Layer 2 loops by blocking redundant paths, and it is absolutely essential for network stability. But when STP goes wrong, it goes wrong fast.

## The broadcast storm

The worst STP failure I experienced in my lab was a broadcast storm caused by a misconfigured port. I had a port set as a trunk that should have been an access port. When I connected a second cable between two switches (creating a physical loop), STP should have blocked one path. Instead, the misconfigured port did not participate in STP correctly, and the loop formed.

The result was immediate. Every device on the VLAN became unreachable. CPU utilization on the switches spiked to 100%. The switches were spending all their resources forwarding broadcast frames in an infinite loop.

## Recognising the symptoms

A layer 2 loop looks different from most outages, and learning the signature saves a lot of time:

- Link lights on many ports flashing in lockstep at the same rhythm, including ports that should be nearly idle.
- Switch CPU at or near 100 percent, with the console noticeably slow to respond.
- Total loss of connectivity for everything in the affected VLAN, while devices in other [VLANs](/blog/vlan-segmentation-guide) are unaffected.
- MAC flapping messages in the log, which are the single most diagnostic clue available.

That last one is worth knowing by sight. Cisco switches log something like this:

```
%SW_MATM-4-MACFLAP_NOTIF: Host 0050.56aa.bb01 in vlan 20 is flapping
between port Gi1/0/1 and port Gi1/0/2
```

That message says the switch is learning the same MAC address from two different ports over and over, which is only possible if a frame from that host is arriving by two paths. It names the VLAN and both ports, which is most of your investigation done for you.

## Stop the bleeding first

Diagnosis on a saturated network is close to impossible, because management traffic is competing with the storm. Break the loop before you analyse it.

If you know what changed, unplug it. If you do not, shut ports administratively from the console, starting with the ones named in the flap messages:

```
LabSwitch(config)# interface GigabitEthernet1/0/2
LabSwitch(config-if)# shutdown
```

The network should recover within seconds of the loop being broken. If the console itself is unusable, physically unplugging inter-switch links one at a time until the lights calm down is a legitimate technique and frequently the fastest one.

## Diagnosis

The first thing I checked was `show spanning-tree`:

```
LabSwitch# show spanning-tree vlan 20
```

This showed me the root bridge, the port roles (root, designated, alternate, blocked), and the port states. The problem was immediately visible: the misconfigured port was not in a blocking state when it should have been.

Here is what a healthy output looks like, so you know what you are comparing against:

```
VLAN0020
  Spanning tree enabled protocol rstp
  Root ID    Priority    4116
             Address     00b1.2c3d.4e5f
             This bridge is the root
             Hello Time  2 sec  Max Age 20 sec  Forward Delay 15 sec

  Bridge ID  Priority    4116  (priority 4096 sys-id-ext 20)
             Address     00b1.2c3d.4e5f
             Aging Time  300 sec

Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- --------------------
Gi1/0/1          Desg FWD 4         128.1    P2p
Gi1/0/2          Desg FWD 4         128.2    P2p
Gi1/0/14         Desg FWD 4         128.14   P2p Edge
```

Read it in this order. First, is the root the switch you intended? Second, on a switch that is not the root, exactly one port should have role `Root`; if none does, this switch is not hearing the root at all. Third, look for an `Altn BLK` port anywhere you have a redundant path. If you have two cables between two switches and both ends show `Desg FWD`, spanning tree is not managing that loop and you have found your problem.

The priority reading 4116 rather than 4096 is normal, not a bug: the VLAN number is carried in the low bits of the priority field, and the parenthetical `(priority 4096 sys-id-ext 20)` spells that out.

Two more commands earn their place. `show spanning-tree interface Gi1/0/2 detail` gives you the BPDU counters for one port, and a port that has sent thousands of BPDUs and received none is either isolated or facing a device that does not speak STP. `show spanning-tree vlan 20 detail` reports the number of topology changes and when the last one occurred, which turns "the network feels unstable" into a number you can watch.

## Capturing BPDUs

When the switch output does not explain the behaviour, look at the frames. BPDUs go to the well-known multicast address 01:80:c2:00:00:00, which makes them easy to filter for:

```bash
sudo tcpdump -i eno1 -e -nn -v 'ether dst 01:80:c2:00:00:00'
```

A single BPDU decodes roughly like this:

```
18:22:41.005112 00:1b:21:aa:bb:cc > 01:80:c2:00:00:00, 802.3, length 60:
  LLC, dsap STP (0x42), ssap STP (0x42), ctrl 0x03: STP 802.1d, Config,
  Flags [none], bridge-id 1014.00:1b:21:aa:bb:cc.8002, length 35
    message-age 0.00s, max-age 20.00s, hello-time 2.00s, forwarding-delay 15.00s
    root-id 1014.00:1b:21:aa:bb:cc, root-pathcost 0
```

The two fields to read are `root-id` and `bridge-id`. If they are equal, the sender believes it is the root. Capture on two ports and compare: if two switches each claim to be root, they are not exchanging BPDUs and you have a segmented spanning tree, which is a loop waiting to happen.

In [Wireshark](/blog/wireshark-packet-analysis), the display filter is simply `stp`. Two patterns are worth recognising in a capture taken during an incident. A storm shows the identical frame, same source MAC and same payload, repeating hundreds of times per second with microsecond gaps. And a topology change flood shows a burst of TCN BPDUs, which tells you something is flapping even after the network appears to have recovered.

Capture from a mirrored port or a host attached to the affected VLAN, not from the switch console, since the console is the thing under load.

## Root bridge election

Every STP instance has a root bridge. The root bridge is the switch with the lowest bridge ID, which is a combination of priority and MAC address. In my lab, I set the priority on my core switch to ensure it is always the root bridge:

```
LabSwitch(config)# spanning-tree vlan 20 priority 4096
```

If you do not explicitly set a root bridge, the election is based on MAC addresses, which means a new switch with a lower MAC could take over as root and change your entire network topology.

Set the backup as well, so a failure of the primary still gives you a topology you chose:

```
LabSwitch(config)# spanning-tree vlan 20 root secondary
```

A root that moved on its own is worth investigating rather than just correcting. Compare the root MAC in `show spanning-tree` against the one you expect. If it belongs to a device you do not recognise, something was plugged into your network that should not have been, and that is a security finding as much as a networking one.

## PortFast and BPDU Guard

For access ports that connect to end devices (workstations, servers), PortFast skips the STP listening and learning states and brings the port to forwarding immediately. BPDU Guard disables the port if it receives a STP BPDU (Bridge Protocol Data Unit), which would indicate that someone plugged a switch into an access port.

```
LabSwitch(config-if)# spanning-tree portfast
LabSwitch(config-if)# spanning-tree bpduguard enable
```

These two features together prevent most common STP issues on access ports.

When BPDU Guard fires, the port goes to err-disabled and stays there until someone intervenes, which is correct behaviour but produces a dead port that nobody explains. Confirm it with:

```
LabSwitch# show interfaces status err-disabled
```

You can have the switch retry on its own after a delay, which turns a permanently dead port into a self-healing one once the offending device is unplugged:

```
LabSwitch(config)# errdisable recovery cause bpduguard
LabSwitch(config)# errdisable recovery interval 300
```

The default recovery interval is 300 seconds. Leave the cause disabled entirely if you would rather a human look at every occurrence, which on a small network is a defensible choice.

## What breaks

**An err-disabled port that nobody investigates.** BPDU Guard did its job, someone finds the port dead, and the fix applied is `shutdown` followed by `no shutdown` without ever asking what sent the BPDU. The unauthorised switch is still there and the port dies again on the next reboot. Always read the log entry that accompanies the err-disable.

**A hypervisor bridging two physical NICs.** A virtual switch with two uplinks into the same VLAN and no loop prevention is a loop, and it is invisible from the physical switch's point of view because the host does not send BPDUs. The MAC flap message will name two switch ports that both lead to the same server, which is the tell.

**Mismatched STP modes between vendors.** Cisco's per-VLAN modes and standard MSTP or RSTP interoperate in specific, limited ways, mostly across the native VLAN. A link between two vendors where each thinks it is managing the topology alone can leave a redundant path forwarding on both ends. When mixing vendors, standardise on MSTP and verify the region configuration matches on both sides.

**BPDU Filter applied where BPDU Guard was intended.** Filter stops the port participating in spanning tree at all, so a switch plugged into that port creates a loop with nothing watching for it. Guard shuts the port down. The names are similar and the outcomes are opposites.

**An unmanaged switch or a looped patch cable under a desk.** The cheapest cause and a common one. Two ports on the same wall plate joined by a short cable produces a loop that PortFast will happily forward into. This is exactly what BPDU Guard on every access port is for, and it is why "every access port" means every one, including the ones nobody uses.

## References

- https://en.wikipedia.org/wiki/Spanning_Tree_Protocol
- https://en.wikipedia.org/wiki/Bridge_Protocol_Data_Unit
- https://en.wikipedia.org/wiki/Broadcast_radiation
- https://man7.org/linux/man-pages/man8/bridge.8.html
- https://wiki.archlinux.org/title/Network_bridge
- https://www.wireshark.org/docs/
