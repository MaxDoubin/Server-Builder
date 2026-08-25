
## Why Cisco

Cisco is still the most widely deployed networking vendor in enterprise environments. Learning Cisco CLI, IOS configuration, and Cisco-specific features is directly transferable to real-world jobs. I run Cisco switches in my lab for exactly this reason.

Keep track of which parts are standards and which are Cisco's. 802.1Q trunking, LACP, and MSTP are standards any vendor speaks. DTP, VTP, PAgP, PVST+, and CDP are Cisco's own. Both are worth knowing, but in a mixed-vendor network the proprietary half quietly stops working, and it is easier to learn the distinction now than during a migration.

## The CLI

Cisco IOS uses a hierarchical CLI with different privilege levels. You start in user EXEC mode, move to privileged EXEC mode with `enable`, and enter configuration mode with `configure terminal`. Every configuration change happens in this global configuration mode or a sub-mode.

```
Switch> enable
Switch# configure terminal
Switch(config)# hostname LabSwitch
LabSwitch(config)# exit
```

The CLI is text-based and powerful. Once you learn the command structure, configuration is fast and repeatable.

The detail that surprises people coming from other systems is that there is no commit step. Every line takes effect the instant you press enter, on the live device, with no confirmation and no staging. That is why `reload in 10` before a risky change is not paranoia.

Underneath all of it, a switch does one simple job: learn which MAC address lives behind which port and forward frames accordingly. Entries age out after 300 seconds of silence by default, which explains a class of "it works after I ping it" behaviour. `show mac address-table` is the first command to reach for when a host cannot be found.

## Spanning Tree Protocol

STP prevents loops in switched networks. Without STP, a single cable plugged into two ports on the same switch would create a broadcast storm that takes down the entire network. I have seen it happen in lab environments, and it is not subtle. The network goes from working to completely dead in seconds.

Understanding STP means knowing which switch is the root bridge, how path costs determine which ports forward and which ports block, and how convergence works when the topology changes.

A loop is catastrophic rather than merely inefficient because Ethernet frames have no TTL field. An IP packet caught in a routing loop dies after 64 hops. A broadcast frame caught in a switching loop circulates forever, gets duplicated at every switch, and saturates every link in the layer 2 domain within seconds.

Root bridge election uses the bridge ID: a 4-bit priority field, a 12-bit VLAN identifier, then the switch's MAC address. The default priority is 32768 everywhere and is only configurable in multiples of 4096, so when every switch shares the default the tiebreaker becomes the lowest MAC address, which usually means the oldest switch in the building wins. That is how a wiring-closet access switch ends up as root for a network whose core is two floors away. Set `spanning-tree vlan 1-4094 root primary` on your core and `root secondary` on the backup, on day one.

The timers explain why classic STP feels so slow. Hello is 2 seconds, forward delay 15, and max age 20. A port coming up walks through listening and learning at 15 seconds each before forwarding, and a port reacting to a lost neighbour waits out max age first, so worst-case convergence is around 50 seconds. Rapid STP, standardised as 802.1w and now folded into 802.1D, cuts that to a couple of seconds on point-to-point links by negotiating with its neighbour instead of waiting on timers. If you find a switch running plain PVST+, `spanning-tree mode rapid-pvst` is one of the highest-value single lines in the config.

Path cost is the other half. In the default short mode the costs are 100 for 10 Mbps, 19 for 100 Mbps, 4 for 1 Gbps, and 2 for 10 Gbps. Notice how little separates 1 G from 10 G, and that anything faster has nowhere left to go. With 25 G or 40 G links, turn on `spanning-tree pathcost method long` so the 32-bit values apply and faster links actually win.

Two protections belong on every access port. `spanning-tree portfast` skips listening and learning so a workstation gets a link immediately, and `spanning-tree bpduguard enable` shuts the port down if a BPDU ever arrives on it. They go together: PortFast without BPDU Guard means that if somebody plugs a switch into a desk port, it forwards straight into a loop.

## Port Security

Port security limits which MAC addresses can use a switch port. In a lab, I use it to prevent unknown devices from connecting to sensitive VLANs. In production environments, it is a basic access control mechanism.

```
LabSwitch(config-if)# switchport port-security
LabSwitch(config-if)# switchport port-security maximum 2
LabSwitch(config-if)# switchport port-security violation restrict
```

Know the defaults before you enable it. The default maximum is 1, the default violation action is `shutdown`, and learned addresses never age out. Turning port security on with no other options therefore means the first device to send a frame owns that port until somebody intervenes.

The three violation modes differ in ways that matter. `protect` silently drops frames from unknown MACs, which is the worst option because nothing is logged and you will never diagnose it. `restrict` drops them, increments a counter, and generates a syslog message. `shutdown` puts the port into the err-disabled state, which is a real outage requiring a manual `shutdown` followed by `no shutdown`, unless you have configured automatic recovery:

```
LabSwitch(config)# errdisable recovery cause psecure-violation
LabSwitch(config)# errdisable recovery interval 300
```

The classic deployment mistake is an IP phone with a PC in its passthrough port. That is two MAC addresses, and the phone's own traffic sits on the voice VLAN, so the naive `maximum 2` is often not enough and the port err-disables during the first call. Count MAC addresses per VLAN, not per port, and test with real hardware before rolling it out to a floor.

Be honest about what this buys you. A MAC address takes three seconds to change with `ip link set dev eth0 address`, so port security stops the intern who plugged a rogue switch into the wrong jack and does not stop anyone who is actually trying. Its more useful role is capping how many addresses a port can learn, which limits CAM table flooding, where a tool like macof fills the MAC table until the switch fails open and floods unknown unicast everywhere, turning it into a hub with a packet capture attached. For real access control the answer is 802.1X.

## EtherChannel

EtherChannel bundles multiple physical links into a single logical link. This provides both increased bandwidth and redundancy. If one physical link fails, the EtherChannel continues working on the remaining links.

I use LACP (Link Aggregation Control Protocol) EtherChannels between my switches to provide 2 Gbps aggregated links with automatic failover.

Say the quiet part out loud, because it is the most misunderstood thing in switching: **two bonded gigabit links do not give any single transfer 2 Gbps.** Load balancing is a hash over frame headers, computed per flow so packets in a conversation never arrive out of order. A single TCP session lands on one member and is capped at that link's speed. Bundles help when there are many conversations and do nothing for one large file copy. Check the hash with `show etherchannel load-balance`, because a default of source MAC alone puts every flow from one router on the same member.

Bundles form with LACP (`active` and `passive`), Cisco's PAgP (`desirable` and `auto`), or statically with mode `on`. Two rules follow. Passive on both ends never forms a bundle because nobody starts the negotiation, so put at least one end in `active`. And mode `on` skips negotiation entirely, so a miscabled or one-sided configuration produces a forwarding loop instead of a clean failure, which is exactly what LACP exists to catch.

Every member port must match on speed, duplex, trunk or access mode, allowed VLAN list, and native VLAN. Any mismatch and the port is suspended rather than bundled. `show etherchannel summary` tells you which: `(P)` is bundled, `(s)` is suspended, `(I)` went individual, and either of the last two on a link you believe is up means go and diff the interface configs.

## Three Failures Worth Knowing Before They Happen

**A desk port negotiates itself into a trunk.** DTP runs by default on many Catalyst ports, in `dynamic auto` or `dynamic desirable`, so the port will happily form an 802.1Q trunk with whatever asks. A laptop speaking DTP can therefore turn an access port into a trunk and reach every VLAN. The related trick is double tagging, where the first switch strips a frame's outer tag and delivers it into a second VLAN, which works when the attacker's access VLAN is also the trunk's native VLAN. Three lines close both: `switchport mode access` on user ports, `switchport nonegotiate`, and a native VLAN on trunks that carries no traffic.

**VTP wipes your VLANs.** VTP propagates the VLAN database across a domain and resolves conflicts by configuration revision number, with the highest number winning. Take a lab switch that has been a VTP server through two hundred edits, plug it into the production domain sitting at revision fifty, and the lab switch's empty VLAN database is now everyone's VLAN database. This has taken down real networks. Run VTP transparent mode, where the revision is always zero and the switch keeps its own VLANs, or VTP version 3 which requires an explicitly designated primary server. Before plugging any used switch into a live network, check `show vtp status`.

**Duplex mismatch.** If one side is hardcoded to `speed 1000 duplex full` and the other is left on autonegotiation, the auto side cannot detect duplex and falls back to half. The link comes up, pings succeed, and throughput collapses under load. The fingerprint is late collisions on the half-duplex side and FCS errors or runts on the other, both visible in `show interfaces`. Either autonegotiate on both ends or hardcode both ends, never one of each.

## Saving Configuration

One of the most common mistakes on Cisco switches is forgetting to save the configuration. The running configuration is in memory and will be lost if the switch reboots. Always save with `copy running-config startup-config` or the shorthand `write memory`.

The mirror-image mistake is saving too early. Before any remote change touching an interface, an ACL, or a management VLAN, type `reload in 10`. If the change locks you out, the switch reboots in ten minutes into the last saved configuration and you get access back. If it works, `reload cancel`, then save. Cisco's archive feature is the fuller version: `archive` with a `path` takes automatic snapshots, and `configure replace` rolls back to one atomically instead of making you reverse each command by hand.

## References

- https://en.wikipedia.org/wiki/Cisco_IOS
- https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/5234-5.html
- https://en.wikipedia.org/wiki/IEEE_802.1AX
- https://en.wikipedia.org/wiki/VLAN_Trunking_Protocol
- https://en.wikipedia.org/wiki/VLAN_hopping
- https://en.wikipedia.org/wiki/MAC_flooding
