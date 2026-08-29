## The problem

You built a VM, gave it an IP on the right subnet, and it cannot reach anything. The host itself is fine. Nothing in the guest looks wrong. The problem is almost always in the layer between the guest's virtual NIC and the physical switch port, and that layer has three places to configure a VLAN and only one correct combination. This is how that layer works and how to check each piece.

## Virtual switches

When you create a VM, it needs network access. The hypervisor provides this through virtual switches (vSwitches), which work like physical switches but exist entirely in software. VMs connect their virtual NICs to a vSwitch, and the vSwitch connects to a physical NIC on the host.

In Proxmox, the default virtual bridge is called vmbr0. In ESXi, it is a vSwitch or Distributed Switch. The concept is the same: a software-defined Layer 2 switch inside the hypervisor.

There is one behavioural difference between the software switch and the physical one that catches people out. A Linux bridge learns MAC addresses the same way a physical switch does, but a hypervisor vSwitch generally does not need to: it already knows which MAC belongs to which virtual port because it handed the address out. That means unknown-unicast flooding, the thing that lets you snoop traffic on a hub, mostly does not happen, and it is why you cannot simply run a capture inside one VM and see another VM's traffic.

## Connecting to physical networks

The virtual switch connects to the physical network through one or more physical NICs (called uplinks). Traffic from VMs travels through the vSwitch, out the uplink NIC, and onto the physical network. From the physical switch's perspective, all VM traffic comes from the host's NIC.

That last sentence is not quite true and the difference matters. The physical switch sees the host's NIC as one port, but it sees many different source MAC addresses arriving on it, one per virtual NIC. The switch's MAC address table therefore has an entry per VM pointing at the same port. If your switch has port security configured with a maximum of one MAC per port, it will shut the port down the moment the second VM sends a frame. This is the single most confusing "the whole host went offline when I powered on a VM" failure.

## VLAN tagging

To put VMs on different [VLANs](/blog/vlan-segmentation-guide), you configure VLAN tagging on the virtual switch. The hypervisor adds VLAN tags to traffic leaving the vSwitch, and the physical switch must be configured with a trunk port that accepts those VLAN tags.

In Proxmox, you create VLAN-aware bridges or separate bridge interfaces for each VLAN. In ESXi, you create port groups with VLAN IDs. Either way, the result is the same: VMs can be placed on different VLANs without dedicated physical NICs for each VLAN.

There are three places the tag can be applied, and they have names worth knowing because documentation uses them:

- **External switch tagging.** The physical switch port is an access port. The hypervisor never sees a tag, and the whole host is on one VLAN. Simple, and no good if you want more than one VLAN.
- **Virtual switch tagging.** The hypervisor applies and strips the tag. The guest sees plain untagged Ethernet and has no idea a VLAN exists. This is the normal choice and what a Proxmox VLAN tag on the NIC or an ESXi port group with a VLAN ID does.
- **Virtual guest tagging.** The tag is passed through to the guest, which does its own 802.1Q handling. On ESXi this is port group VLAN ID 4095. On a VLAN-aware Linux bridge you get it by leaving the guest's tag unset and allowing the VLANs on the port. Use this only when the guest is itself a router or firewall that needs multiple VLANs on one interface.

The VLAN ID field in an 802.1Q tag is 12 bits, giving 1 to 4094 as usable IDs (0 and 4095 are reserved), and the tag adds 4 bytes to the frame.

## A worked example on Proxmox

A VLAN-aware bridge is one bridge that carries every VLAN, with the per-VM tag set on the virtual NIC. This is much easier to manage than a separate bridge per VLAN.

```
# /etc/network/interfaces
auto lo
iface lo inet loopback

iface enp1s0 inet manual

auto vmbr0
iface vmbr0 inet static
    address 10.0.10.5/24
    gateway 10.0.10.1
    bridge-ports enp1s0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
```

Confirm the bridge actually came up in filtering mode:

```bash
ip -d link show vmbr0 | grep -o 'vlan_filtering [01]'
```

```
vlan_filtering 1
```

If that prints `vlan_filtering 0`, the bridge is a plain bridge and every per-VM VLAN tag you set is being ignored, which means all your VMs are sitting on the untagged VLAN together. That is a security problem, not just a connectivity one.

Then look at the per-port VLAN membership:

```bash
bridge vlan show
```

```
port              vlan-id
enp1s0            1 PVID Egress Untagged
                  2-4094
vmbr0             1 PVID Egress Untagged
tap100i0          20 PVID Egress Untagged
tap101i0          40 PVID Egress Untagged
```

Read it like this. The uplink `enp1s0` carries VLAN 1 untagged and 2 through 4094 tagged, so it is a trunk. `tap100i0` is VM 100's virtual NIC and it is an untagged member of VLAN 20 only, which is virtual switch tagging: the VM sends untagged frames, the bridge tags them 20 on the way to the uplink and strips the tag on the way back. VM 101 is on VLAN 40 the same way.

The matching physical switch port has to be a trunk:

```
interface GigabitEthernet1/0/10
 description PROXMOX-NODE1
 switchport trunk encapsulation dot1q
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30,40,50,99
 switchport trunk native vlan 10
 spanning-tree portfast trunk
```

```
show interfaces GigabitEthernet1/0/10 trunk
```

```
Port        Mode         Encapsulation  Status        Native vlan
Gi1/0/10    on           802.1q         trunking      10

Port        Vlans allowed and active in management domain
Gi1/0/10    10,20,30,40,50,99
```

`Status: trunking` and your VLANs listed as allowed and active is the confirmation. `not-trunking` means the negotiation failed and the port fell back to access mode, which is the most common cause of a VM that cannot reach its gateway.

## What breaks

The most frequent issue I troubleshoot is mismatched VLAN configuration. If the hypervisor is tagging traffic with VLAN 20 but the physical switch port is configured as an access port on VLAN 10, the traffic gets dropped. Always verify that the physical switch port is configured as a trunk and allows the VLANs you need.

Beyond that, four failure modes cover most of what I have hit.

**Double tagging.** The guest OS has a VLAN sub-interface configured, and the port group or the virtual NIC also applies a tag. The frame goes out with two tags, the physical switch reads the outer one, and the traffic lands somewhere nobody expected or gets dropped. Tag in exactly one place. If the guest is doing the tagging, the hypervisor port must be in guest-tagging mode with no tag of its own.

**Native VLAN mismatch.** The switch port's native VLAN is 10, the bridge's PVID is 1. Untagged frames from the host management interface arrive in VLAN 10 while the host thinks they are VLAN 1. Cisco Discovery Protocol logs a native VLAN mismatch for exactly this reason; do not ignore that message.

**MTU set in one place only.** Jumbo frames need the MTU raised on the physical NIC, the bridge, the virtual NIC, and the guest, and on every switch in the path. Set it on three of the five and small packets work perfectly while anything large disappears. The symptom is a TCP handshake that completes and a transfer that immediately stalls.

**Nested workloads with unknown source MACs.** Run containers or nested VMs inside a guest and their frames leave with source MAC addresses the vSwitch never handed out. A Linux bridge will learn them. ESXi drops them unless the port group allows forged transmits, and needs promiscuous mode before a guest can see traffic addressed to anyone else. If you are building a lab firewall or an IDS VM, these two settings are usually why it sees nothing.

## Performance considerations

Virtual networking adds a small amount of overhead compared to physical networking. For most workloads, the overhead is negligible. For high-throughput workloads (10GbE storage traffic, for example), techniques like SR-IOV (Single Root I/O Virtualization) can bypass the virtual switch entirely and give VMs near-native network performance.

I use SR-IOV for my NFS storage VMs that need maximum throughput, and standard vSwitch connectivity for everything else. The configuration complexity of SR-IOV is only worth it when you actually need the performance.

The mechanism is worth understanding before you reach for it. An SR-IOV capable NIC presents one physical function and a number of virtual functions, each of which looks to the PCI bus like its own NIC. A virtual function is passed straight through to the guest, so packets move by DMA between the NIC and guest memory without the host CPU building and copying frames. It requires IOMMU support enabled in firmware and in the kernel.

The costs are real. Traffic on a virtual function does not traverse the host bridge, so the host cannot filter it, mirror it, or count it, and none of your `tcpdump` on the bridge will show it. Live migration is difficult or impossible because the guest is bound to a specific piece of hardware. And the VLAN for a VF is set on the physical function rather than in your bridge config, so it is one more place to keep in sync.

For everything short of that, use the paravirtualised driver rather than an emulated one. A `virtio-net` NIC and an emulated `e1000` NIC both work, but the emulated card makes the host simulate a real chipset register by register, and the throughput difference is large. Pick emulation only when the guest is too old to have virtio drivers.

## References

- https://www.kernel.org/doc/html/latest/networking/bridge.html
- https://man7.org/linux/man-pages/man8/bridge.8.html
- https://man7.org/linux/man-pages/man8/ip-link.8.html
- https://wiki.archlinux.org/title/Network_bridge
- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://www.kernel.org/doc/html/latest/PCI/pci-iov-howto.html
