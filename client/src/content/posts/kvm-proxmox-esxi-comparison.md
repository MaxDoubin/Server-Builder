
## The Core Question

All three of these platforms run virtual machines. The differences are in management, ecosystem, licensing, and how well they fit specific use cases. Choosing the right one depends on what you are trying to do.

It helps to be precise about what "these three" even are, because they are not the same kind of thing. KVM is a kernel module. Proxmox VE is a Debian distribution that packages KVM with a management layer. ESXi is a complete proprietary hypervisor product. Comparing them is a bit like comparing an engine, a car, and a car with a dealer network, and most of the real differences follow from that.

## Bare-Metal KVM

KVM (Kernel-based Virtual Machine) is built into the Linux kernel. If you install Ubuntu or RHEL on a server, you already have a hypervisor. Add QEMU for machine emulation and libvirt for management, and you have a complete virtualization stack.

**Best for:** Developers who want full control, cloud infrastructure builders, or situations where you need to integrate virtualization into a custom system.

**Trade-offs:** No built-in management UI. You manage everything through the command line or third-party tools like Cockpit or virt-manager. More flexible but more work to set up and operate.

KVM has been in mainline Linux since kernel 2.6.20 in February 2007, which is why it is everywhere: AWS Nitro, Google Compute Engine, and most of OpenStack are KVM underneath. What it needs from the hardware is CPU virtualization extensions, Intel VT-x or AMD-V. Confirm you have them before you plan anything:

```bash
grep -c -E '(vmx|svm)' /proc/cpuinfo   # non-zero means the CPU supports it
lscpu | grep -i virtualization         # shows VT-x or AMD-V
```

A zero from the first command on a machine that should support it almost always means virtualization is disabled in BIOS, not that the CPU lacks it.

The division of labor is worth understanding because error messages come from different layers. KVM handles CPU and memory virtualization only. QEMU emulates the devices: disks, NICs, USB, the whole virtual motherboard. libvirt is the management API and XML definition format that `virsh`, `virt-manager`, Cockpit, and Proxmox all sit on top of.

The performance mistake everyone makes once is not using virtio. QEMU will happily emulate an Intel e1000 NIC and an IDE controller, and that emulation is honest, complete, and slow, because every register access traps to the hypervisor. The paravirtualized virtio drivers replace that with a shared ring buffer and are several times faster for both disk and network. Linux guests have virtio built into the kernel. **Windows guests do not**, which produces the single most common "I cannot install Windows on KVM" problem: the installer reaches disk selection and reports no drives found. The disk is there, Windows just has no driver for the virtio-scsi controller. Attach the virtio-win ISO as a second CD drive and load the driver from it during setup.

The other capability worth knowing about is PCIe passthrough, which hands a real GPU or HBA directly to a guest. It needs IOMMU enabled in BIOS and on the kernel command line (`intel_iommu=on` or `amd_iommu=on`), and it comes with a rule people fight for hours: **you pass through an entire IOMMU group, not a single device.** If your GPU shares a group with the USB controller and a SATA controller, all three leave the host together. Check the groups before you buy the card, because the grouping is a property of the motherboard's PCIe topology and no amount of configuration changes it safely.

## Proxmox VE

Proxmox is built on Debian Linux and KVM, with a polished web UI and built-in features for clustering, high availability, and both VM and container (LXC) management. It is free and open source, with paid support subscriptions available.

**Best for:** Homelabs, small datacenters, anyone who wants KVM's power with a proper management interface. This is what I run in my homelab.

**Trade-offs:** The community version works great but shows nag messages about subscriptions. The clustering features require some networking configuration to get right.

The web UI is on port 8006 over HTTPS, which catches people who expect 443. And the first thing that goes wrong on a fresh install is `apt update` failing with a 401: the installer points at the `pve-enterprise` repository, which requires a subscription key. Switch to `pve-no-subscription` and updates work again. That is the same thing behind the nag dialog, and it is not a crippled build, it is the same packages from a different repo.

"Some networking configuration" is doing a lot of work in that trade-offs line, so here is the specific version. Proxmox clustering uses corosync, which is a totem-ring protocol that is extremely sensitive to latency and jitter, not to bandwidth. Proxmox's own documentation recommends a physically separate network for corosync, because a backup job or a VM migration saturating a shared link will make nodes miss heartbeats and drop out of the cluster while everything looks fine from the outside.

Quorum is the part that bites homelabs. A cluster needs more than half its votes to operate, so a **two node cluster loses quorum the moment either node goes down**, and the survivor drops to read-only: you cannot start a VM, cannot edit configuration, cannot do the recovery you built the cluster for. The fix is a QDevice, a tiny `corosync-qnetd` daemon on a third machine (a Raspberry Pi is plenty) that holds a tiebreaker vote. Set that up on day one or run standalone nodes; a two node cluster without a QDevice is worse than no cluster.

If you also enable HA, know that fencing is real. A node that loses quorum with HA-managed guests on it self-fences by hard resetting through a watchdog, on the order of a minute after losing contact. That is correct behavior, it prevents two nodes writing the same disk, and it will still surprise you the first time a network mistake reboots a server.

One storage detail that catches people: snapshots depend on the backing storage, not on Proxmox. ZFS, LVM-thin, Ceph RBD, and qcow2 files on a directory support snapshots. A raw volume on thick LVM does not, and the snapshot button is simply greyed out with no hint as to why. If you go with ZFS, cap the ARC. ZFS treats free RAM as cache by default, and a host that "has no memory left" for VMs is usually just ZFS doing its job.

## VMware ESXi

ESXi is the industry standard in enterprise environments. If you work in a large organization, you almost certainly have ESXi somewhere. It runs as a bare-metal hypervisor with a very thin footprint, and the VMware ecosystem (vCenter, vSAN, NSX) is extremely mature.

**Best for:** Enterprise environments, organizations that need vendor support, situations where vCenter is already deployed.

**Trade-offs:** Licensing costs are significant. Since Broadcom's acquisition of VMware, the pricing and licensing model has become much less friendly for small organizations and homelabs.

On the free edition specifically, the situation has changed twice. Broadcom removed the free vSphere Hypervisor in February 2024, then quietly reinstated it in April 2025 with ESXi 8.0 Update 3e, available from the Broadcom support portal to anyone with a registered account, with the license embedded in the download. It is a standalone host and nothing more: no vCenter, no vMotion, no HA, no supported backup API, and no support. For learning the ESXi interface that is genuinely fine. For anything that needs the features people actually buy VMware for, it is not.

The bigger obstacle in a homelab is not licensing, it is the hardware compatibility list, and this is where ESXi differs most sharply from the Linux-based options. ESXi ships a curated set of drivers and will refuse to install rather than fall back to something generic. Realtek NICs, which are on most consumer motherboards, are not supported. Whole generations of [RAID](/blog/raid-levels-comparison) controllers were dropped between major versions. ESXi 7.0 also raised the boot device requirement to 8 GB minimum with 32 GB recommended, and deprecated SD cards and USB sticks as standalone boot media because the new ESX-OSData partition writes constantly and wears them out. A perfectly good server that Proxmox installs on in ten minutes can be flatly incompatible with ESXi, and there is no fixing it from the installer.

Then there is vCenter. Without it, an ESXi host is a single box with a local web UI: no vMotion, no DRS, no cluster HA, no central management. With it, you are running an appliance whose smallest deployment size wants roughly 2 vCPUs, 14 GB of RAM, and several hundred gigabytes of disk before it manages anything. That is a substantial slice of a homelab dedicated to management overhead, and it is the resource comparison people forget when they say ESXi has a thin footprint. The hypervisor does. The platform does not.

## My Take

For a homelab or small lab environment, Proxmox is the clear winner. You get all the power of KVM with a proper UI, no licensing costs, and excellent documentation. For enterprise, ESXi remains dominant simply because the tooling and ecosystem are unmatched, even if the cost has increased substantially.

The honest counterargument, and the reason to keep one ESXi host around: if you want a job administering virtualization, the interface you will be sitting in front of is vCenter, and time in it is worth something that a Proxmox cluster cannot substitute for. Run Proxmox for everything real and keep a spare box on free ESXi to stay fluent in the vocabulary. That combination costs nothing and covers both.

Where I would reach for bare KVM instead of Proxmox: when the virtualization is a component of something else rather than the point of the machine. A CI runner spinning up short-lived VMs, or a developer box that needs two test guests, does not need clustering, HA, or a web UI, and `virsh` plus a few libvirt XML files is less to maintain than a whole hypervisor distribution.

## References

- https://www.linux-kvm.org/page/Main_Page
- https://www.kernel.org/doc/html/latest/virt/kvm/api.html
- https://libvirt.org/
- https://pve.proxmox.com/pve-docs/chapter-pvecm.html
- https://pve.proxmox.com/pve-docs/chapter-ha-manager.html
- https://knowledge.broadcom.com/external/article/399823/vmware-esxi-80-update-3e-now-available-a.html
