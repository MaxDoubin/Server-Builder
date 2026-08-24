
## The Problem with VLANs at Scale

Traditional VLANs are limited to 4096 IDs. In a cloud or large multi-tenant datacenter environment, you need isolation for thousands or millions of tenants. You also need to stretch Layer 2 networks across physical boundaries, which traditional VLANs cannot do without complex MPLS configurations.

## What VXLAN Does

VXLAN (Virtual Extensible LAN) encapsulates Layer 2 Ethernet frames inside UDP packets. This allows you to carry a virtual Layer 2 network over a standard Layer 3 (IP) infrastructure. The VXLAN Network Identifier (VNI) supports 16 million unique segments, which eliminates the VLAN scalability problem.

A VXLAN Tunnel Endpoint (VTEP) handles encapsulation and decapsulation. When a VM sends a frame, the VTEP wraps it in a VXLAN UDP packet and sends it to the destination VTEP, which unwraps it and delivers it to the destination VM.

## How VTEPs Work

VTEPs can be physical switches (hardware VTEPs) or software-based (like Open vSwitch). Each hypervisor running VXLAN acts as a VTEP.

```bash
# Create a VXLAN interface on Linux
ip link add vxlan100 type vxlan id 100 dstport 4789 remote 192.168.1.2 local 192.168.1.1 dev eth0
ip link set vxlan100 up
ip addr add 10.100.0.1/24 dev vxlan100
```

## BGP EVPN Control Plane

Early VXLAN implementations used multicast or flood-and-learn for MAC address discovery, which does not scale well. BGP EVPN (Ethernet VPN) provides a control plane for VXLAN, distributing MAC and IP address information via BGP rather than flooding.

BGP EVPN is the standard in modern datacenter fabrics (Cisco ACI, Arista, Juniper). It enables scalable, efficient VXLAN deployments with millisecond failover.

## Where You See VXLAN

AWS VPCs, Azure virtual networks, and most cloud networking platforms are built on VXLAN or similar overlay technologies. Kubernetes networking (Flannel, Calico, Cilium) frequently uses VXLAN for pod-to-pod communication. Understanding VXLAN is increasingly essential for anyone working in modern infrastructure.
