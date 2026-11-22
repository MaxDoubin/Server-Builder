## From timers to handshakes

Spanning Tree Protocol (STP) keeps a switched network loop-free by blocking redundant links, but the original version is slow to react. A current Cisco Catalyst 9300 guide lists the default timers: hello time 2 seconds, forward delay 15 seconds, maximum age 20 seconds. Juniper's documentation says the original protocol took up to 50 seconds to respond to a topology change.

The fix came in two steps from the Institute of Electrical and Electronics Engineers (IEEE). The 802.1w supplement defined Rapid Spanning Tree Protocol (RSTP), and IEEE's project page for it records that it was incorporated into 802.1D-2004. The 802.1s supplement defined Multiple Spanning Tree Protocol (MSTP, called MST in much vendor documentation), which IEEE describes as an addition to 802.1Q that lets virtual local area network (VLAN) bridges use multiple spanning trees.

Two existing posts cover the foundations: the [spanning tree deep dive](/blog/spanning-tree-protocol-deep-dive) explains the bridge identifier (ID), root election, path cost and the bridge protocol data unit (BPDU), and [STP troubleshooting](/blog/stp-troubleshooting) covers storms and diagnosis. This article picks up where those stop. It walks through how RSTP converges step by step, then compares per-VLAN spanning tree with MST, and ends with the protections that defend the assumptions RSTP makes.

## Why classic STP waits

A port that has just come up cannot tell whether the switch on the other end has already blocked its own redundant ports. Classic STP handles this by waiting: the port passes through listening and learning, spending the forward delay in each (Cisco puts it at twice the forward delay, 2 x 15 seconds by default), before it forwards. RSTP replaces the wait with a conversation. Neighbors tell each other directly that it is safe to forward, and the timers remain as a fallback.

## RSTP vocabulary in one table

RSTP merges the 802.1D disabled, blocking and listening states into one discarding state, leaving three states: discarding, learning and forwarding. Cisco's RSTP document defines four port roles.

| Role | What it means | Typical state |
| --- | --- | --- |
| Root | Receives the best BPDU on a switch | Forwarding |
| Designated | Sends the best BPDU on its segment | Forwarding |
| Alternate | Receives better BPDUs from another switch, so it is a standby path to the root | Discarding |
| Backup | Receives better BPDUs from the same switch, so it is a redundant link to a segment this switch already serves | Discarding |

RSTP BPDUs also differ on the wire. Cisco describes them as type 2, version 2, using the six flag bits that 802.1D left unused to encode port role and state and to carry the proposal and agreement bits used below. Every switch now sends its own BPDU each hello interval instead of relaying the root's, which matters for failure detection.

## The proposal and agreement handshake

Take a small example. SW1 is the root. A new cable joins SW1 to SW2. SW2 already has a link down to SW3 and a workstation on an edge port. (An edge port faces only an end host and is covered in the next section.)

```
SW1 (root)                               SW2
designated port, discarding
        -------- proposal BPDU ------->  superior BPDU: this port becomes
                                         the root port
                                         sync: block non-edge designated
                                         ports (the one toward SW3)
        <------- agreement BPDU -------  root port forwarding, agreement sent
designated port moves to forwarding
(no timer involved)
```

The steps, following Cisco's description:

1. **Proposal.** A designated port in the discarding or learning state sets the proposal bit in its BPDUs. SW1's new port is exactly that.
2. **New root port.** SW2 sees that the BPDU is better than anything it has and elects the receiving port as its root port.
3. **Sync.** Before it can bless the new root port, SW2 must be sure that nothing behind it can form a loop. A port counts as already in sync if it is blocking or if it is an edge port. SW2's other non-edge designated ports are neither, so SW2 blocks them. The workstation on the edge port keeps working.
4. **Agreement.** SW2 unblocks its root port and replies with a copy of the proposal BPDU with the agreement bit set instead of the proposal bit.
5. **Forwarding.** SW1 receives the agreement and moves its designated port to forwarding. No timer is involved.

The handshake then repeats downstream, which Cisco describes as well: the port that was left in a designated discarding state after the sync is in the same situation the root's port was in at step 1, so it proposes to its own neighbor. Here that is SW2's port toward SW3, and SW3 runs the same sync and answers. Cisco says the final topology is reached in the time the new BPDUs need to travel down the tree, with no timer involved.

Two consequences follow from that description. A loop never forms during the process, because every port that could create one is blocked before the new path opens. And traffic through SW2's non-edge designated ports pauses until SW3 agrees. The result is a brief interruption, not a loop. One caveat from Cisco: its own enhancement to the sync lets a switch put only its former root port in discarding when it syncs, and Cisco says that applies in most common reconvergence cases, so the exact set of ports that pause depends on the implementation.

If no agreement arrives, for example because the neighbor does not speak RSTP, Cisco says the port falls back to the traditional 802.1D listening and learning sequence and forwards slowly.

## When a link fails

For a failure, RSTP leans on the alternate port. Juniper's RSTP documentation says that when a point-to-point link fails, the alternate link can transition to the forwarding state. Cisco describes the same behavior: a bridge that loses its root port can put its best alternate port directly into forwarding, which Cisco compares to its proprietary UplinkFast feature.

Failures that do not drop the link are detected through hellos. Because each switch sends BPDUs every hello time (2 seconds by default), a neighbor that stays silent for three consecutive hellos can have its information aged out immediately, without waiting for the 20-second maximum age. Juniper states the same bound as three hello BPDUs, or 6 seconds.

## Edge ports and link type

Two settings decide whether the handshake can be skipped or used at all.

**Edge ports.** An edge port faces an end host, so no switch sits behind it that could form a loop. Cisco says edge ports (the equivalent of PortFast) go straight to forwarding without listening or learning, and that a link flap on one does not generate a topology change. The assumption is policed simply: if an edge port receives a BPDU, it loses edge status. Juniper's RSTP page agrees, noting that edge ports do not expect to receive BPDUs.

**Link type.** Cisco's document derives link type from duplex: full duplex is treated as point-to-point, half duplex as shared, and either can be overridden by configuration. It then states the key limit: rapid transition to the forwarding state is possible only on edge ports and on point-to-point links. Cisco states the limit without giving a reason. A plausible reading, offered here as inference rather than as Cisco's explanation, is that the handshake is a two-party exchange, so on shared media an agreement from one bridge could not speak for the others. Juniper exposes the same idea as a link mode: p2p for a point-to-point link and shared for shared media. On Cisco's IOS XE operating system, this command forces point-to-point treatment:

```
spanning-tree link-type point-to-point
```

## Topology changes in RSTP

When the network changes shape, switches must forget stale MAC (media access control) address entries, or frames keep flowing toward ports that no longer lead anywhere. RSTP narrows what counts as a change. According to Cisco, only non-edge ports that move to forwarding cause a topology change, and losing connectivity no longer does.

On detecting a change, a switch starts a topology change (TC) While timer, set to twice the hello time, on its non-edge designated ports and root port, and flushes the MAC addresses learned on those ports. A switch that receives a TC clears learned addresses on all ports except the one the notice arrived on, starts its own timer and sends TC-flagged BPDUs. RSTP no longer uses the separate topology change notification (TCN) BPDU of 802.1D unless a legacy bridge needs one.

Because an edge port that toggles does not generate a topology change, a host rebooting on one does not start this flush. Cisco notes that the approach can cause more temporary flooding, which is the cost of clearing stale entries quickly: frames for unknown destinations are flooded until the table refills. Counting fewer events as topology changes limits how often that happens.

## When a legacy bridge joins

RSTP is backward compatible. Juniper states that switches do not all have to run RSTP, and offers a force-version setting to make a bridge behave as classic 802.1D STP. Cisco describes the cost: each port has a three-second migration delay during which its mode is locked, then adapts to the type of the next BPDU received. If a legacy bridge is on the segment, the port drops to 802.1D mode and the fast convergence benefits are lost. If the legacy bridge is removed later, Cisco says that in this rare case the port can stay in STP mode, and user intervention is required to restart protocol detection. One old switch is therefore a quiet way to lose RSTP's benefits on the links that touch it.

## Three assumptions, three protections

RSTP works only if three things hold. Each has a feature that defends it, and each feature is described in Cisco's Catalyst 9300 guide on optional spanning tree features. Framing the features as defenses of assumptions is this article's own; the Behavior column follows Cisco's text.

| Assumption | What breaks it | Feature | Behavior |
| --- | --- | --- | --- |
| Edge ports face only hosts | A switch or bridging device is plugged into an access port | PortFast with BPDU Guard | The port goes to the error-disabled state when a BPDU arrives |
| The root stays where it was designed to be | A switch with a better bridge ID appears behind a port | Root Guard | The port goes to the root-inconsistent (blocked) state instead of accepting the new root |
| BPDUs keep arriving on non-designated ports | A unidirectional link silences the neighbor without dropping the link | Loop Guard | Alternate or root ports are prevented from becoming designated ports |

Two details are worth knowing. BPDU Guard enabled globally applies to ports in the PortFast operational state, while enabled on an interface it also works on a port that does not have PortFast enabled. And Cisco states that Root Guard and Loop Guard cannot both be enabled at the same time.

BPDU Filter is a different tool and easy to confuse with BPDU Guard. The Cisco guide warns that enabling BPDU filtering on an interface is the same as disabling spanning tree on it, which removes the protection above.

## Per-VLAN trees or MST

Everything so far describes one spanning tree. With [VLANs](/blog/vlan-segmentation-guide), the question is how many trees to run.

### Per-VLAN: PVST+ and Rapid PVST+

Cisco's Per-VLAN Spanning Tree Plus (PVST+) runs one spanning tree instance per VLAN and is based on 802.1D. Rapid PVST+ runs the 802.1w behavior described above per VLAN and, according to the Catalyst 9300 guide, is the default mode on that platform. Each VLAN has its own bridge ID: a 4-bit priority plus a 12-bit extended system ID equal to the VLAN number, so priorities move in steps of 4096 with a default of 32768.

The benefit is load balancing: each VLAN can have a different root, so different VLANs can use different uplinks. A Cisco best-practices guide for Catalyst 6500 and 4500 switches, updated in 2015, notes this and the cost, which is more BPDU processing for the central processing unit (CPU) as the VLAN count grows. The Catalyst 9300 guide caps spanning tree instances in these modes at 300 per device or stack.

### MST: instances instead of VLANs

MST maps many VLANs onto a small number of instances. Cisco's MST document gives the motivating case of 1,000 VLANs but only two real logical topologies: per-VLAN spanning tree would compute 1,000 trees, while MST computes two.

Switches share an MST region only if three attributes match exactly: a name (32 bytes), a revision number (two bytes) and a table mapping each of the 4,096 possible VLANs to an instance. BPDUs carry a digest of the table along with the name and revision, not the table itself. A switch that receives a different digest knows the port sits on a region boundary.

Instance 0 is the Internal Spanning Tree (IST), an RSTP instance that extends the Common Spanning Tree (CST) of 802.1Q into the region and represents the whole region to the outside as one bridge. The Multiple Spanning Tree Instances (MSTIs) exist only inside the region. A switch sends one BPDU containing the IST information plus one record per MSTI present on the port, rather than a separate BPDU for every instance.

Instance limits depend on the platform and release. The older Cisco MST document, which still calls 802.1s pre-standard, describes its implementation as 16 instances (the IST plus 15 MSTIs), while the current Catalyst 9300 guide says the device supports up to 65 MST instances and places no limit on how many VLANs map to one instance.

### Where the two meet

MST switches detect PVST+ neighbors at region boundaries automatically, and the region replicates the IST BPDU on all VLANs to look like a PVST+ neighbor. Cisco recommends that the IST root have a higher priority (a numerically lower value) than any other bridge in the network, and warns that if the MST bridge is the root, it must be the root for all VLANs. A conflict puts the boundary port in root-inconsistent state, which keeps the topology loop-free but loses connectivity. Cisco also recommends avoiding mapping any VLANs onto instance 0.

### Choosing

| | Rapid PVST+ | MST |
| --- | --- | --- |
| Basis | 802.1w behavior per VLAN (Cisco's mode) | IEEE 802.1s, a supplement to 802.1Q |
| Trees | One per VLAN | One per instance, with VLANs mapped to instances |
| Root placement | Per VLAN | Per instance |
| Neighbor requirements | None beyond normal RSTP | Name, revision and VLAN mapping must match |
| Cost | More CPU work as VLANs multiply | Computation stays proportional to instances |

The 2015 Cisco guide says a recommendation depends on hardware, software and the number of devices and VLANs. In general, it recommends Rapid PVST+ for new deployments when the number of logical ports stays within the platform guideline, because it gives fast convergence without extra configuration. It recommends MST for a design with VLANs everywhere and a large number of VLANs, where the logical port count can exceed that guideline. For a network with a few dozen VLANs, well inside platform limits, Rapid PVST+ is therefore the simpler default. MST earns its extra configuration discipline when the VLAN count makes per-VLAN trees expensive.

## Limits and common mistakes

**Assuming RSTP is fast everywhere.** Rapid transition needs edge ports or point-to-point links. A half-duplex link, a forced shared link type, or a neighbor that never answers with an agreement returns that segment to slow behavior.

**Marking a switch port as an edge port.** Cisco says an edge port goes straight to forwarding and loses edge status only when it receives a BPDU. By inference from those two facts, a bridge mistakenly attached behind such a port is forwarding from the start, until its first BPDU arrives. Pairing the port with BPDU Guard shuts it down instead.

**Treating an MST region as approximate.** A typo in the region name or a mismatched mapping splits the region in two, and the boundary behavior is rarely what was intended.

**Mixing modes without a plan.** In a mixed MST and PVST+ network, Cisco states that the common spanning tree root must be inside the MST backbone, and that a PVST+ device cannot connect to multiple MST regions.

## Study notes

- Classic STP uses timers to decide when forwarding is safe. RSTP uses a handshake and keeps the timers as a fallback.
- The handshake is proposal, sync, agreement, forwarding. Sync blocks non-edge designated ports so that no loop can form.
- Rapid transition applies only on edge ports and point-to-point links. Duplex decides link type unless it is overridden.
- Only non-edge ports moving to forwarding generate topology changes in RSTP.
- Three missed hellos (6 seconds at the default) age out a silent neighbor, and a failed link promotes the alternate port.
- BPDU Guard defends edge ports, Root Guard defends the root position, Loop Guard defends against unidirectional links.
- Per-VLAN modes give load balancing at the cost of one tree per VLAN. MST trades configuration discipline for fewer trees.

## Sources

- [Cisco: Understand Rapid Spanning Tree Protocol (802.1w)](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/24062-146.html)
- [Cisco: Understand the Multiple Spanning Tree Protocol (802.1s)](https://www.cisco.com/c/en/us/support/docs/lan-switching/spanning-tree-protocol/24248-147.html)
- [Cisco: Layer 2 Configuration Guide, IOS XE 17.17.x (Catalyst 9300), Configuring Spanning Tree Protocol](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-17/configuration_guide/lyr2/b_1717_lyr2_9300_cg/configuring_spanning_tree_protocol.html)
- [Cisco: Layer 2 Configuration Guide, IOS XE 17.16.x (Catalyst 9300), Configuring Optional Spanning-Tree Features](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-16/configuration_guide/lyr2/b_1716_lyr2_9300_cg/configuring_optional_spanning_tree_features.html)
- [Cisco: Best Practices for Catalyst 6500/6000 Series and Catalyst 4500/4000 Series Switches Running Cisco IOS Software (updated 2015)](https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6500-series-switches/24330-185.html)
- [Juniper: Configuring RSTP (Junos OS documentation)](https://networkingdocs.hpe.com/documentation/us/en/software/junos/stp-l2/topics/topic-map/spanning-tree-configuring-rstp.html)
- [IEEE 802.1: 802.1w, Rapid Reconfiguration of Spanning Tree](https://www.ieee802.org/1/pages/802.1w.html)
- [IEEE 802.1: 802.1s, Multiple Spanning Trees](https://www.ieee802.org/1/pages/802.1s.html)