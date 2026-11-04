
## The short answer

On RouterOS 7, VLANs belong on one bridge with `vlan-filtering=yes`. Set `pvid` and `frame-types` on every bridge port, list each VLAN in `/interface bridge vlan` with trunk ports under `tagged` and that VLAN's access ports under `untagged` (one VLAN ID per access entry), and add the bridge itself to every VLAN the router must reach, such as a management VLAN. Enable `vlan-filtering` last, because MikroTik warns that [enabling it filters out traffic destined for the CPU](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/layer2-misconfiguration) and that changing it can [temporarily disable all ports](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/). Do it from a serial console, a port outside the bridge, or [Safe Mode](https://manual.mikrotik.com/docs/7.25/management-tools/console) (Control+X), which undoes changes if the session dies, after a 9 minute TCP timeout. `ingress-filtering` has defaulted to yes [since RouterOS v7](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/). The `H` flag in `/interface bridge port print` shows whether a bridge port is [hardware offloaded](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/). Marvell Prestera (CRS3xx) chips offload VLAN filtering [since 6.41](https://download.mikrotik.com/routeros/6.41/CHANGELOG), RTL8367 since [7.1rc1](https://download.mikrotik.com/routeros/7.1rc1/CHANGELOG), MT7621 since [7.1rc5](https://download.mikrotik.com/routeros/7.1rc5/CHANGELOG), and the 88E6393X, 88E6191X, 88E6190, MT7531 and EN7523 [in v7](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/). Atheros-based models such as the RB3011 [cannot](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/).

## Why is one bridge with vlan-filtering the supported way to do VLANs on RouterOS 7?

MikroTik's [Bridge VLAN Table guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/bridge-vlan-table) says bridge VLAN filtering "should be used instead of many known VLAN misconfigurations that are most likely causing you either performance issues or connectivity issues." The feature arrived in RouterOS 6.41 on 2017-Dec-22, whose [changelog](https://download.mikrotik.com/routeros/6.41/CHANGELOG) lists "implemented software based vlan-aware bridges" and, for the CRS3xx, VLAN configuration "integrated within bridge VLAN configuration with hw-offload".

Three reasons are documented. First, a VLAN interface used as a bridge port sends tagged spanning tree BPDUs, which the [Layer2 misconfiguration page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/layer2-misconfiguration) says "violates the IEEE 802.1W standard when (R/M)STP is used." The [Bridging and Switching page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/) calls VLAN filtering "highly recommended" for STP and RSTP compliance and "mandatory" for MSTP (the [spanning tree article](/blog/spanning-tree-protocol-deep-dive) covers how BPDUs work). Second, the same page says a VLAN interface created on a bridge port "will never capture any traffic at all," because the bridge claims the frames first. Third, on most modern chips there is no alternative: for the 88E6393X, 88E6191X, 88E6190, MT7621, MT7531, EN7523 and RTL8367, the [Switch Chip Features page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/switch-chip-features) says the VLAN table "is configured through bridge HW vlan-filtering" and that "VLAN-related configuration on the /interface/ethernet/switch menu is not available."

| `vlan-filtering` | Tag handling | MAC learning |
|---|---|---|
| `no` (default) | Bridge ignores VLAN tags and cannot modify them | Shared VLAN learning (SVL) |
| `yes` | All bridge VLAN functions active | Independent VLAN learning (IVL) |

The table paraphrases the [Bridging and Switching page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/). For VLAN theory and Cisco and FortiGate syntax, the [VLAN segmentation guide](/blog/vlan-segmentation-guide) is the general companion.

## What do pvid, tagged, untagged, frame-types and ingress-filtering mean on a bridge port?

The defaults come from the [Bridging and Switching page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/):

| Property | Where | Default | Effect |
|---|---|---|---|
| `frame-types` | bridge, bridge port | `admit-all` | Also `admit-only-vlan-tagged` and `admit-only-untagged-and-priority-tagged` |
| `ingress-filtering` | bridge, bridge port | `yes` | Drops a frame on receipt if the ingress port is not in the table for its VLAN |
| `pvid` | bridge, bridge port | `1` | VLAN given to untagged ingress frames |
| `ether-type` | bridge | `0x8100` | Which tag type counts as a VLAN tag |
| `tagged`, `untagged` | `/interface bridge vlan` | none | Tag added or removed on egress |

The [Bridge VLAN Table guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/bridge-vlan-table) explains how they interact:

- **Tagged and untagged are egress actions.** The VLAN ID is checked on the egress port, and a frame whose VLAN is missing from the table for that port is dropped before it is sent.
- **PVID touches only untagged frames.** If a VLAN40 frame arrives on a port with `pvid=20`, the tag "is NOT changed" and the table decides forwarding.
- **`frame-types` works in both directions, `ingress-filtering` only on ingress.** For `frame-types` to take effect, `ingress-filtering` must be enabled.
- **The bridge is a port.** It has its own `pvid` (the CPU port) and, with the default of 1, can be added to the untagged side of VLAN 1 automatically.

That last point explains a common surprise. The guide shows a trunk and a bridge both at `pvid=1` producing a dynamic VLAN 1 entry with the bridge and the trunk untagged, and captions its diagram "Unintentionally allowed management access using untagged traffic through the trunk port." The guide offers two fixes: give the trunk a `pvid` different from the bridge's, or, the option it calls more intuitive and recommended, set `frame-types=admit-only-vlan-tagged` with `ingress-filtering=yes` on the bridge itself and on the trunk. A port with `admit-only-vlan-tagged` is not added as an untagged port for its PVID, and RouterOS 6.46 ([changelog](https://download.mikrotik.com/routeros/6.46/CHANGELOG)) stopped adding the bridge as an untagged member in that case.

| Port role | `frame-types` | `pvid` | Table entry |
|---|---|---|---|
| Trunk | `admit-only-vlan-tagged` | unused | `tagged` for every VLAN carried |
| Access | `admit-only-untagged-and-priority-tagged` | the VLAN ID | `untagged`, one VLAN per entry |
| Hybrid | `admit-all` | native VLAN | `untagged` for one VLAN, `tagged` for others |

MikroTik's [VLAN page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/vlan) says IDs 0, 1 and 4095 "should not be used in generic VLAN setups." A [native VLAN mismatch](/blog/the-request-arrived-the-reply-did-not) is the classic way a hybrid port goes wrong.

## How do you build trunk and access ports in /interface bridge vlan, and why one entry per access VLAN?

This adapts the trunk and access example from MikroTik's [Basic VLAN switching guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/basic-vlan-switching), renaming the ports: ether2 is the trunk, ether3 and ether4 are access ports for VLANs 20 and 30. Listing `bridge1` under `tagged` gives the router access to those VLANs, which inter-VLAN routing needs.

```
/interface bridge
add name=bridge1 vlan-filtering=no frame-types=admit-only-vlan-tagged

/interface bridge port
add bridge=bridge1 interface=ether2 frame-types=admit-only-vlan-tagged
add bridge=bridge1 interface=ether3 pvid=20 ingress-filtering=yes frame-types=admit-only-untagged-and-priority-tagged
add bridge=bridge1 interface=ether4 pvid=30 ingress-filtering=yes frame-types=admit-only-untagged-and-priority-tagged

/interface bridge vlan
add bridge=bridge1 tagged=bridge1,ether2 untagged=ether3 vlan-ids=20
add bridge=bridge1 tagged=bridge1,ether2 untagged=ether4 vlan-ids=30
```

The [Bridge VLAN Table guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/bridge-vlan-table) adds that access ports need no `untagged=` entry, because each "is added as an untagged port dynamically with a VLAN ID that is specified in the PVID property." Explicit entries state the intent in the configuration, and the dynamic ones appear in the print output with a `D` flag.

The temptation is to merge the two entries into `untagged=ether3,ether4 vlan-ids=20,30`. Its instruction is blunt: "Do NOT use multiple VLAN IDs on access ports." The table only decides which VLANs may leave a port, so the merged entry lets VLAN 20 and 30 leave both ports untagged. The [Bridging and Switching page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/) says the same in its danger notice: a multi-VLAN entry "should only be used for tagged ports configurations," and when several VLANs are specified for access ports, "tagged packets may be sent as untagged packets through the wrong access port, regardless of the PVID value."

The [Layer2 page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/layer2-misconfiguration) documents a related leak that needs no mistake in the access entries. A single trunk entry such as `tagged=ether2 vlan-ids=10,20` pulled the dynamic untagged entries of the `pvid=10` and `pvid=20` access ports into one group, so broadcast and multicast traffic flooded between them and the print output showed "port with pvid added to untagged group which might cause problems, consider adding a separate VLAN entry." The page marks this resolved since RouterOS 7.15: "Dynamic VLANs are now always created as separate entries and no longer merge with statically configured ones" (the 7.15 [changelog](https://download.mikrotik.com/routeros/7.15/CHANGELOG) lists "reworked dynamic VLAN creation"). On older releases, give each VLAN its own entry whenever an access port uses one of the IDs. On any release, use ranges only for trunks, such as `tagged=ether2 vlan-ids=100-115`.

Read back the result with `/interface bridge vlan print`. The Bridge VLAN Table guide's example shows each VLAN with its `CURRENT-TAGGED` and `CURRENT-UNTAGGED` ports. Check that no port or VLAN appears that should not, "especially the CPU port (bridge)." The [VLAN tag decoder](/tools/vlan-tag-decoder) reads raw tags from a capture, such as the guide's example `8100 6063` (priority 3, VLAN 99).

## How do you keep management access when you turn on vlan-filtering?

The [Bridge VLAN Table guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/bridge-vlan-table) recommends creating the bridge with `vlan-filtering=no`, adding ports and table entries, and enabling filtering last, preferably on a serial console or through a port that is not in the bridge: "It is always recommended to configure VLAN filtering while using a serial console." The bridge may also reset, "which will force you to reconnect."

A tagged management VLAN is the pattern the [Basic VLAN switching guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/basic-vlan-switching) uses. The bridge and the trunk are tagged members of VLAN 99, and a VLAN interface on the bridge carries the address:

```
/interface bridge vlan
add bridge=bridge1 tagged=bridge1,ether2 vlan-ids=99

/interface vlan
add interface=bridge1 name=MGMT vlan-id=99

/ip address
add address=192.168.99.1/24 interface=MGMT
```

Enable filtering inside Safe Mode. The [Console page](https://manual.mikrotik.com/docs/7.25/management-tools/console) says F4 or Control+X toggles it. Changes made while it is active "are automatically undone if the safe mode session terminates abnormally," after a TCP timeout of 9 minutes. Control+D leaves and undoes the changes, while `/quit` does not. Safe Mode holds the 100 most recent actions, after which the session leaves it and nothing is undone, and it is ignored for commands that need a reboot.

```
# Press Control+X: "[Safe Mode taken]"
/interface bridge set bridge1 vlan-filtering=yes
# Session survived: press Control+X again to keep the change.
# Session dropped: reconnect over VLAN 99 within 9 minutes, press Control+X, answer r at
# "Hijacking Safe Mode from someone - unroll/release/don't take it [u/r/d]", then Control+X again.
```

The Console page describes that prompt for another user taking Safe Mode (`r` keeps the changes, `u` undoes them) and does not cover the same account reconnecting, so rehearse the recovery on a spare router. If nobody reconnects, the change rolls back when the old session times out.

Four details matter:

- **Untagged management.** The Bridge VLAN Table guide shows it (the same PVID on the bridge and an access port) but says untagged access "is not considered a good security practice," and that access through access ports is "never a good security practice" because an attacker could sniff the management VLAN ID. Manage through the trunk, since "trunk ports usually have better physical security."
- **MAC access is a stopgap.** In the Bridging page's untagged management example, Layer 2 access such as MAC-telnet "will be working either way," and the Bridge VLAN Table guide says the bridge reset is "mostly relevant when using MAC-telnet." The [Securing your router guide](https://manual.mikrotik.com/docs/7.25/getting-started/securing-your-router) says MAC-Telnet, MAC-WinBox and MAC-Ping "should be disabled in production networks," so use them only while building the configuration.
- **Firewall the CPU.** When CPU access is allowed from a VLAN and port, the Bridging page says to "implement proper firewall filter rules" and to allow only the services that are required.
- **Recovery.** Holding the reset button during power-up [restores the default configuration](https://manual.mikrotik.com/docs/7.25/getting-started/configuration-management/routeros-configuration-reset), which discards the VLAN setup, the rest of the configuration and the password. Keep a [backup](https://manual.mikrotik.com/docs/7.25/getting-started/configuration-management/backup) first.

## Which switch chips hardware-offload bridge VLAN filtering, and how does the H flag show it?

Device examples and host table sizes come from the [Switch Chip Features page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/switch-chip-features), the Prestera table sizes from the [Marvell Prestera page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/marvell-prestera-switch-chip-features), and the offload verdicts from the [Bridging and Switching page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/):

| Chip | Example devices | VLAN filtering offload | Host (MAC) table |
|---|---|---|---|
| Marvell Prestera | CRS3xx | Yes, since 6.41 | 16K to 256K by model (CRS309: 32K) |
| 88E6393X | RB5009 | Yes, v7 | up to 16K |
| 88E6191X, 88E6190 | CCR2004-16G-2S+, L009 | Yes, v7 | up to 16K |
| RTL8367 | RB4011iGS+, RB1100AHx4 | Yes, since 7.1rc1 | up to 2K |
| MT7621 | hEX S, RBM33G | Yes, since 7.1rc5 | up to 2K |
| MT7531 | hAP ax lite | Yes, v7 | up to 2K |
| EN7523 | hEX Refresh | Yes, v7 | up to 1K |
| CRS1xx, CRS2xx | CRS109, CRS212 | No, switch menu | not in that table |
| QCA8337, Atheros8327 | RB3011, RB2011 | No | up to 2K |
| IPQ-PPE | hAP ax², hAP ax³, Chateau ax | No | up to 2K |

Each non-Prestera chip that offloads VLAN filtering lists a VLAN table of up to 4K entries. The 7.1rc5 changelog is dated 2021-Oct-25 and names "hEX, hEX S, RBM33G, RBM11G, LtAP." CRS3xx units such as the CRS309 in the [10GbE homelab build](/blog/10gbe-networking-homelab) are Prestera devices, whose page says "VLAN filtering settings don't affect hardware offloading."

Host table size matters when many devices share one chip. The Switch Chip Features page says a full table is handled differently by family: the RTL8367 ignores new MAC addresses until entries time out, the MT7621, MT7531 and EN7523 let only a certain number of entries renew, and the QCA8337 and Atheros8327 remove older entries.

Run `/interface bridge port print` and look for `H`. The [documentation](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/) says "certain bridge or port functions can automatically disable HW offloading," and its tables list them:

- **EtherType and stacking.** On the 88E6393X family, MT7621 family and RTL8367, `ether-type=0x88a8`, `0x9100` and `tag-stacking=yes` fall under the footnote "Using these features disables HW offload." Prestera chips are the exception: their [page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/marvell-prestera-switch-chip-features) says a provider bridge (IEEE 802.1ad) and tag stacking can be offloaded since RouterOS v6.43.
- **Horizon.** "Split horizon is a software feature that disables hardware offloading."
- **Other bridge features.** On the MT7621 family and RTL8367, IGMP snooping, DHCP snooping and bonding disable offload. On the 88E6393X family, ARP inspection, IP source guard, MLAG and the IPv6 snooping features do ([DHCP snooping](/blog/dhcp-snooping-arp-inspection) is covered separately).
- **A second bridge.** CRS1xx/2xx units support several offloaded bridges per chip. "All other devices support only one," and `hw=yes` on a port picks which bridge gets it.

Chips without VLAN filtering offload still accept the configuration. The Layer2 page says "All devices are able to be configured with bridge VLAN filtering, but only a few of them will be able to offload the traffic to the switch chip," and lists the symptoms on the others: a missing `H` flag, low throughput and high CPU usage. The Bridging page sends those devices to the [Basic VLAN switching guide](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/basic-vlan-switching), whose `/interface ethernet switch` examples are the hardware method for them.

The Bridging page also warns that changing properties such as VLAN filtering "can trigger a switch chip reset, temporarily disabling all Ethernet ports." Devices with several chips complicate VLAN spans: the RB4011 has two RTL8367 chips, the RB1100AHx4 three, and the CCR2004-16G-2S+ two 88E6191X chips. The Layer2 page says, in its RB2011 and RB3011 switch-menu example, that packets forwarded between ports on different chips "are also processed by the CPU." RouterOS 7.10 [fixed](https://download.mikrotik.com/routeros/7.10/CHANGELOG) "HW offloading for vlan-filtered bridge on devices with multiple switches" (a problem introduced in 7.8), and 7.20 [added](https://download.mikrotik.com/routeros/7.20/CHANGELOG) a dynamic "switch-cpu" entry when a VLAN spans chips.

## How do you route between VLANs on the same router with VLAN interfaces, DHCP servers and firewall rules?

Routing needs a VLAN interface on the bridge, not on a port. The bridge must be a tagged member of each routed VLAN, which the trunk and access entries above already do. Since RouterOS 7.16 ([changelog](https://download.mikrotik.com/routeros/7.16/CHANGELOG), 2024-Sep-20), adding a VLAN interface to a bridge with VLAN filtering enabled creates a dynamic entry commented "added by vlan on bridge," so older releases need the manual entry. The explicit `tagged=bridge1,...` entries shown above work on every release.

```
/interface vlan
add interface=bridge1 name=VLAN20 vlan-id=20
add interface=bridge1 name=VLAN30 vlan-id=30

/ip address
add address=192.168.20.1/24 interface=VLAN20
add address=192.168.30.1/24 interface=VLAN30

/ip pool
add name=pool20 ranges=192.168.20.10-192.168.20.200
add name=pool30 ranges=192.168.30.10-192.168.30.200

/ip dhcp-server
add name=dhcp20 interface=VLAN20 address-pool=pool20 disabled=no
add name=dhcp30 interface=VLAN30 address-pool=pool30 disabled=no

/ip dhcp-server network
add address=192.168.20.0/24 gateway=192.168.20.1
add address=192.168.30.0/24 gateway=192.168.30.1
```

The [DHCP Server page](https://manual.mikrotik.com/docs/7.25/network-management/dhcp/server) lists the requirements: an address on the server interface, a pool that does not include the router's own address, a network entry and the server. When `dns-server` or `ntp-server` is unset, the server sends "the DNS or NTP servers the router itself uses."

Inter-VLAN traffic crosses the `forward` chain, "used to process packets passing through the router," while traffic to the router itself uses `input`. The [Filter page](https://manual.mikrotik.com/docs/7.25/firewall-and-quality-of-service/firewall/filter) starts with established and related connections, and the order matters ([first match wins](/blog/first-match-wins)):

```
/ip firewall filter
add chain=forward action=accept connection-state=established,related comment="replies"
add chain=forward action=drop connection-state=invalid comment="invalid"
add chain=forward action=drop in-interface=VLAN30 out-interface=VLAN20 comment="VLAN 30 cannot start connections into VLAN 20"
add chain=input action=accept in-interface=MGMT protocol=tcp dst-port=22,8291 \
    place-before=[find comment="defconf: drop all not coming from LAN"]
```

The last rule suits a router with the default configuration: the Securing guide places added accepts in front of "defconf: drop all not coming from LAN," so a new VLAN interface needs an accept there or a place in the LAN interface list.

FastTrack does not bypass these rules for new connections. The [Packet Flow page](https://manual.mikrotik.com/docs/7.25/firewall-and-quality-of-service/packet-flow-in-routeros) says FastTrack packets "bypass firewall, connection tracking, simple queues" and more, but the Filter page's example fast-tracks only established and related traffic, so "the firewall will work with new connections only."

L3 hardware offloading, which the [Prestera page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/marvell-prestera-switch-chip-features) says is possible "on supported hardware" since RouterOS v7, is a separate risk for inter-VLAN firewall rules. The [L3 Hardware Offloading page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/l3-hardware-offloading) says packets "are routed by hardware when both the ingress and egress ports have l3-hw-offloading=yes," and that when both are `no`, packets "go through the CPU/Firewall." Its example says inter-VLAN traffic "is fully routed by the hardware, not entering the CPU/Firewall," so a `forward` rule between two hardware-routed VLANs never sees that traffic. The page also says VLAN interfaces belong on the bridge, and recommends turning L3HW off while changing bridge or VLAN settings. The VLAN interface MTU defaults to 1500, but the [VLAN page](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/vlan) says some NICs cannot receive 1500 bytes plus the 4 byte tag and 14 byte header. MTU 1496 works around that and fragments larger packets (see [MTU and jumbo frames](/blog/mtu-and-jumbo-frames)).

## What breaks after an upgrade, and how do you spot it?

**Tagged traffic that RouterOS 6 forwarded can be dropped on 7.** The Bridging page says `ingress-filtering` "is enabled by default since RouterOS v7," and a frame is dropped on receipt if its ingress port is not a member of the VLAN in the table. The Ansible `community.routeros` [changelog](https://github.com/ansible-collections/community.routeros/blob/main/CHANGELOG.rst) shows how the defaults diverge: version 2.18.0 changed the module's `ingress-filtering` default back to false "for RouterOS before version 7." Fix: add the port to the VLAN entry, or set the property deliberately.

**VLANs leak between access ports.** There are two documented causes. A merged entry that lists several VLAN IDs with access ports under `untagged` leaks on every release. Before 7.15, a multi-VLAN trunk entry could also absorb the dynamic untagged entries of access ports. Fix: one VLAN per access entry, RouterOS 7.15 or later, and a check of the table for the `port with pvid added to untagged group` warning.

**The same configuration behaves differently on a hEX after 7.1rc5.** The 7.1rc5 changelog added offload for MT7621 devices. A [MikroTik forum poster](https://forum.mikrotik.com/t/routeros-7-bridge-vlan-dhcp-client-issue-after-upgrade/156119/7) wrote in March 2022 that before that release "bridge vlan filtering was done by the CPU," so "the same config might not work anymore." This is a forum report, but it fits the documentation, since the CPU port must be a table member. Fix: add the bridge as a tagged member of every VLAN the router uses.

**A VLAN interface on the bridge gets no traffic.** The bridge is not in the VLAN. Fix: add `bridge1` to `tagged=`. On 7.16 and later, a VLAN interface added while filtering is enabled gets the dynamic entry itself.

**Untagged traffic reaches the router through the trunk.** The trunk and the bridge share `pvid=1`. Fix: `frame-types=admit-only-vlan-tagged` on the bridge and the trunk, as in the trunk and access example.

**CPU usage is high and no port shows H.** The chip cannot offload, or a feature such as horizon, IGMP snooping or a non-default EtherType disabled it. Fix: check the table and move unsupported chips to the switch-menu method.
## Sources

- [MikroTik: RouterOS Manual, Bridging and Switching](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/)
- [MikroTik: Bridge VLAN Table](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/bridge-vlan-table)
- [MikroTik: Basic VLAN switching](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/basic-vlan-switching)
- [MikroTik: Layer2 misconfiguration](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/user-guides/layer2-misconfiguration)
- [MikroTik: Switch Chip Features](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/switch-chip-features)
- [MikroTik: Marvell Prestera switch chip features](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/marvell-prestera-switch-chip-features)
- [MikroTik: L3 Hardware Offloading](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/l3-hardware-offloading)
- [MikroTik: VLAN](https://manual.mikrotik.com/docs/7.25/bridging-and-switching/vlan)
- [MikroTik: Console, Safe Mode](https://manual.mikrotik.com/docs/7.25/management-tools/console)
- [MikroTik: Securing your router](https://manual.mikrotik.com/docs/7.25/getting-started/securing-your-router)
- [MikroTik: RouterOS configuration reset](https://manual.mikrotik.com/docs/7.25/getting-started/configuration-management/routeros-configuration-reset)
- [MikroTik: Backup](https://manual.mikrotik.com/docs/7.25/getting-started/configuration-management/backup)
- [MikroTik: DHCP Server](https://manual.mikrotik.com/docs/7.25/network-management/dhcp/server)
- [MikroTik: Firewall Filter](https://manual.mikrotik.com/docs/7.25/firewall-and-quality-of-service/firewall/filter)
- [MikroTik: Packet Flow in RouterOS](https://manual.mikrotik.com/docs/7.25/firewall-and-quality-of-service/packet-flow-in-routeros)
- [MikroTik: RouterOS 6.41 changelog](https://download.mikrotik.com/routeros/6.41/CHANGELOG)
- [MikroTik: RouterOS 6.46 changelog](https://download.mikrotik.com/routeros/6.46/CHANGELOG)
- [MikroTik: RouterOS 7.1rc1 changelog](https://download.mikrotik.com/routeros/7.1rc1/CHANGELOG)
- [MikroTik: RouterOS 7.1rc5 changelog](https://download.mikrotik.com/routeros/7.1rc5/CHANGELOG)
- [MikroTik: RouterOS 7.10 changelog](https://download.mikrotik.com/routeros/7.10/CHANGELOG)
- [MikroTik: RouterOS 7.15 changelog](https://download.mikrotik.com/routeros/7.15/CHANGELOG)
- [MikroTik: RouterOS 7.16 changelog](https://download.mikrotik.com/routeros/7.16/CHANGELOG)
- [MikroTik: RouterOS 7.20 changelog](https://download.mikrotik.com/routeros/7.20/CHANGELOG)
- [MikroTik forum: RouterOS 7 Bridge VLAN/DHCP client issue after upgrade](https://forum.mikrotik.com/t/routeros-7-bridge-vlan-dhcp-client-issue-after-upgrade/156119/7)
- [GitHub: ansible-collections community.routeros changelog](https://github.com/ansible-collections/community.routeros/blob/main/CHANGELOG.rst)
