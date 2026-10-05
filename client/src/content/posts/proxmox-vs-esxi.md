
## The Two Contenders

VMware ESXi has been the gold standard for enterprise virtualization for years. Proxmox VE is the open-source alternative that has been gaining traction, especially in the homelab community. I have run both extensively, and the choice between them depends on what you are optimizing for.

## What each one actually is

ESXi is a type 1 hypervisor with its own purpose-built kernel, the VMkernel. There is no general purpose operating system underneath it. That is the source of both its strengths, a small attack surface and predictable behavior, and its limits: you get exactly the features VMware ships, through the interfaces VMware provides.

Proxmox VE is Debian with KVM and LXC on top. KVM turns the Linux kernel itself into the hypervisor, so this is also type 1 in the sense that matters for performance, with the guest running on hardware virtualization extensions rather than being emulated. What sits alongside it is a complete Linux system.

That is the real fork in the road. Proxmox gives you a hypervisor and a Linux box; ESXi gives you a hypervisor and an API.

The Linux stack has layers, and error messages come from different ones. KVM, which also underpins AWS Nitro and Google Compute Engine, virtualizes only the CPU and memory. QEMU emulates the devices, the whole virtual motherboard. libvirt is the management API that `virsh`, virt-manager and Cockpit sit on; Proxmox skips it and drives QEMU with its own `qm` tooling. KVM needs the CPU's virtualization extensions, Intel VT-x or AMD-V (ESXi needs them too for 64-bit guests), so confirm them first:

```bash
grep -c -E '(vmx|svm)' /proc/cpuinfo   # non-zero means the CPU supports it
lscpu | grep -i virtualization         # shows VT-x or AMD-V
```

A zero from the first command on a machine that should support it almost always means virtualization is disabled in the BIOS, not that the CPU lacks it.

## Containers, which the comparison usually skips

Proxmox runs two kinds of guest. KVM virtual machines get their own kernel and can run anything. LXC containers share the host kernel, so they start in about a second, and idle at tens of megabytes instead of the gigabyte a VM reserves before it has done anything.

For a homelab that matters more than any benchmark. Most of what runs in a lab is a Linux service that does not need its own kernel, and putting thirty of those in containers rather than VMs is the difference between a host that is comfortable and one that is full. The tradeoff: a container shares the host kernel, so it cannot run a different one and its isolation boundary is weaker than a VM's.

ESXi has no equivalent. Containers there mean a VM running a container runtime.

## ESXi: The Enterprise Standard

ESXi is polished. The vSphere client is fast and well-organized. vMotion (live migration) works flawlessly. The ecosystem of third-party tools and integrations is massive. If you are studying for VMware certifications or want to match what most enterprises run, ESXi is the obvious choice.

Worth being precise about what is free and what is not, because most of the good parts are not. Bare ESXi manages one host. vMotion, the distributed switch, DRS and the rest are vCenter features and require licenses. A single free ESXi host is a hypervisor, not a cluster, and much of what people admire about VMware is the cluster.

vCenter is also the cost people forget when they praise ESXi's thin footprint: even the smallest vCenter 8 appliance wants 2 vCPUs, 14 GB of RAM and several hundred gigabytes of disk before it manages anything. The hypervisor is thin. The platform is not.

The downside is licensing. The paid licenses are expensive for a homelab, and when you are experimenting freely, licensing friction is a real concern.

Be careful repeating any specific claim about VMware licensing, mine included. Since the Broadcom acquisition closed in late 2023 the terms have moved repeatedly: perpetual licenses gave way to subscription in December 2023, SKUs were consolidated into bundles, and per-core minimums appeared. The free hypervisor was discontinued in February 2024, then reinstated in April 2025 as ESXi 8.0 Update 3e, a download from the Broadcom support portal with the license embedded. Broadcom's knowledge base article for that edition lists its terms: no vCenter, so no vMotion, DRS or HA; no VADP-based backups; at most two physical CPUs per host and 8 vCPUs per VM; and no support. Check the current terms yourself. The stable takeaway is directional rather than numeric: VMware now designs for large enterprises, and a homelab is not a customer it targets.

There is a second friction that bites homelabs harder than it bites enterprises: the hardware compatibility list. ESXi ships drivers for hardware VMware supports, which is enterprise hardware. A consumer NIC or a desktop SATA controller may simply not be seen. Proxmox, being Debian, drives anything Linux drives, which is most things.

ESXi also refuses to install rather than fall back to a generic driver. Realtek NICs, which are on most consumer motherboards, are not supported, and whole generations of [RAID](/blog/raid-levels-comparison) controllers were dropped between major versions. Boot media tightened too: ESXi 8 requires a boot disk of at least 32 GB of persistent storage, with 128 GB recommended, and SD cards and USB sticks have been deprecated as standalone boot devices since 7.0 Update 3, because the ESX-OSData partition writes to them constantly and wears them out.

## Proxmox: The Open-Source Powerhouse

Proxmox VE is built on Debian Linux with KVM for virtual machines and LXC for containers. It is completely free to use with no feature limitations. The web interface is functional (it listens on port 8006 over HTTPS, not 443), and you get full command-line access to the underlying Linux system, which means you can do anything the OS can do.

"No feature limitations" is the part worth dwelling on. Clustering, live migration, high availability and replication are all in the free product. The paid subscription buys the enterprise package repository and support, not features. That is the opposite of the VMware model, and for a lab it is the whole argument.

That repository split produces the first thing that will confuse you. A fresh install has the enterprise repository (`pve-enterprise`) enabled, so your first `apt update` fails with a 401 from `enterprise.proxmox.com`. Nothing is broken and you have not been locked out. Switching to the `pve-no-subscription` repository is a documented, expected step. The genuine tradeoff is that the no-subscription repo is slightly less validated than the enterprise one, and you get a nag dialog at login.

Proxmox also has native ZFS support, which is a big deal if you care about data integrity and storage flexibility. You can create ZFS pools directly from the Proxmox interface and use them for VM storage.

Native means the installer will build a root ZFS pool, and the web UI manages datasets and snapshots directly. Combined with KVM, that gives you snapshots that are genuinely cheap and replication between nodes that ships only changed blocks. ESXi's answer is VMFS or vSAN, and neither gives you end to end checksumming on commodity disks.

ZFS also caches in RAM, in the ARC, which is usually why a host "has no memory left" for VMs. Hosts installed on ZFS since Proxmox VE 8.1 cap the ARC at 10 percent of RAM, at most 16 GiB, in `/etc/modprobe.d/zfs.conf`. Anything else gets the ZFS default of half the RAM or more, so set `zfs_arc_max` in that file yourself.

Snapshot behavior depends entirely on which storage type you picked, and this is where new users get stuck. On ZFS, Ceph and LVM-thin, snapshots are copy-on-write and effectively free. qcow2 images on a directory store can snapshot too, but creating or deleting one blocks the running VM, for minutes on a large disk. On a raw iSCSI LUN, or on a directory holding raw images, the snapshot button is grayed out and no setting enables it. Thick LVM was in that group until Proxmox VE 9 added snapshots as volume chains, switched on per storage with the `snapshot-as-volume-chain` flag. That is still a technology preview, and it only covers disks created after you enable it. Choose the storage type with snapshots in mind on day one, because changing it later means copying every disk.

The contrast with VMware matters because people carry the habit across. An ESXi snapshot creates a delta file that every subsequent write lands in, so performance degrades the longer it lives and consolidation gets slower the bigger it grows. VMware's guidance is to treat snapshots as short-lived, a day or two, never as backups. A ZFS or Ceph snapshot has no such decay, which is why keeping one for a month is routine on Proxmox and a support case on VMware.

## Clustering, and the part that surprises people

Proxmox clusters use Corosync for membership and quorum, and quorum is majority based. Two nodes is therefore a trap: lose either and the survivor has one vote out of two, which is not a majority, so the cluster goes read-only. Guests already running keep running, but you cannot start a VM or change any configuration, which is exactly the recovery you built the cluster for. Run three nodes, or add a lightweight quorum device as the third vote. Every "my two node Proxmox cluster froze" story is this.

Corosync wants a low latency network to itself, and sharing it with storage traffic is the usual cause of a cluster that fences nodes under load. What it needs is consistent latency, not bandwidth: Proxmox asks for under 5 ms between nodes and says a dedicated 1 Gbit NIC is enough in most situations. A burst of backup or Ceph replication traffic delays Corosync tokens, the cluster concludes a node is gone, and the node reacts. Give it a dedicated NIC and VLAN carrying nothing else, and configure a second ring for redundancy.

Understand what that reaction is before enabling HA. A node that loses quorum while running HA-managed guests hard reboots itself by watchdog after roughly a minute, so the cluster can safely start those guests elsewhere without two nodes ever writing the same disk. That is correct behavior, and it is alarming the first time you see it. The third vote that prevents it need not be a third server: a QDevice is a small daemon (`corosync-qnetd`) on any always-on Linux box, a Raspberry Pi included, holding a tie-breaking vote and running no workloads. Set it up on day one or run standalone nodes, because a two node cluster without one is worse than no cluster.

## PCIe passthrough, and the group rule

Proxmox can hand a real GPU or HBA straight to a guest. Enable IOMMU in the BIOS (often labeled VT-d). AMD hosts, and Intel hosts on kernel 6.8 or newer, then have it on by default; older Intel kernels also need `intel_iommu=on` on the kernel command line. Then comes the rule people fight for hours: you pass through an entire IOMMU group, not a single device. If your GPU shares a group with a USB controller and a SATA controller, all three leave the host together. Sharing a group only with its own HDMI audio function or its root port is fine. Check before you buy the card:

```bash
pvesh get /nodes/$(hostname)/hardware/pci --pci-class-blacklist ""
```

The grouping is a property of the motherboard's PCIe topology. A different slot sometimes lands the card in a cleaner group, but no amount of configuration changes it safely.

## My Experience

I ran ESXi for a year before switching most of my lab to Proxmox. The switch was driven by three things: licensing costs, ZFS support, and the flexibility of having a full Linux system underneath.

Proxmox handles my workloads just as well as ESXi did. VM performance is effectively identical (both use hardware virtualization). Live migration works, and it does not strictly require shared storage: Proxmox can migrate a running guest along with its local disks, copying the disk in the background before the final cutover. Shared or replicated storage is still much faster and is what you want for anything you migrate often, but the local-disk path is genuinely useful for evacuating a host before maintenance. On VMware the equivalent, vMotion combined with Storage vMotion, needs vCenter and a paid license. Backups are straightforward with Proxmox Backup Server, which is another free tool from the same team.

"Effectively identical" is not hand-waving. Both run guests on the CPU's virtualization extensions, with second level address translation handling memory in hardware, so the hypervisor is not in the path for ordinary instructions. They differ in paravirtualized drivers, virtio on KVM against VMXNET3 and PVSCSI on VMware, and both are good. Use them. A guest left on emulated e1000 or IDE is slow on either platform, and that misconfiguration is behind most benchmark posts claiming one destroys the other.

Windows is the catch on KVM. Linux guests have virtio drivers built into the kernel and Windows does not, so a Windows installer on a virtio disk reaches disk selection and reports no drives. Attach the virtio-win ISO as a second CD drive and load the driver from it during setup.

Proxmox Backup Server deserves more than a clause. It does deduplicated, incremental, client side encrypted backups with verification, and restores individual files out of a VM image. Incrementals use QEMU dirty bitmaps for changed block tracking, so a nightly run on a large VM reads only the blocks that changed rather than the whole disk. The comparison point matters: VMware ships no backup product with the hypervisor at all, so the equivalent is a third party tool such as Veeam, whose free tier covers a limited number of workloads. PBS is the piece that closed the last real gap for me.

## What I Miss from ESXi

The vSphere client is genuinely better than the Proxmox web UI. It is more responsive, more polished, and handles large environments more gracefully. VMware's snapshot management is also more intuitive, and vMotion is slightly more reliable than Proxmox's live migration in my experience.

Past the interface, there are capabilities Proxmox simply does not have. There is no DRS equivalent, so nothing rebalances guests across the cluster based on load and you place them yourself. There is no distributed virtual switch with the same feature set. Ceph is the answer to vSAN and it is more powerful, but it is also much harder to operate correctly and it wants at least three nodes with fast dedicated networking before it behaves. And the third party ecosystem for monitoring, backup and orchestration is far thinner.

One more honest point, specifically for a student: VCP is a credential hiring managers recognize. Proxmox training exists and is good, and it does not carry the same weight on a resume yet. If the goal is a job in a VMware shop, keeping ESXi running somewhere in the lab is worth the friction, and nesting it as a VM on top of Proxmox is a perfectly reasonable way to have both.

## Bottom Line

For a homelab, Proxmox wins on value. You get enterprise-class virtualization with no licensing restrictions, native ZFS, and full Linux flexibility. For enterprise environments or certification study, ESXi remains the standard. There is no wrong choice. Pick the one that matches your goals.

As a rule: pick ESXi when the goal is to practice what an employer runs. Pick Proxmox when the goal is to run workloads, when you want ZFS or containers, or when your hardware is not on anybody's compatibility list.

And skip both for bare KVM when virtualization is a component of something else rather than the point of the machine, such as a CI runner spinning up short-lived VMs or a developer box with two test guests. Neither needs clustering, HA or a web UI, and `virsh` plus a few libvirt XML files is less to maintain than a whole hypervisor distribution.

## References

- [Proxmox VE Administration Guide](https://pve.proxmox.com/pve-docs/pve-admin-guide.html)
- [Proxmox VE Cluster Manager](https://pve.proxmox.com/pve-docs/chapter-pvecm.html)
- [Proxmox VE High Availability](https://pve.proxmox.com/pve-docs/chapter-ha-manager.html)
- [Proxmox VE Storage](https://pve.proxmox.com/pve-docs/chapter-pvesm.html)
- [KVM](https://linux-kvm.org/page/Main_Page)
- [libvirt](https://libvirt.org/)
- [LXC](https://en.wikipedia.org/wiki/LXC)
- [VMware ESXi](https://en.wikipedia.org/wiki/VMware_ESXi)
- [Second Level Address Translation](https://en.wikipedia.org/wiki/Second_Level_Address_Translation)
- [VMware by Broadcom Dramatically Simplifies Offer Lineup and Licensing Model](https://www.broadcom.com/company/news/articles/cloud/vmware-by-broadcom-business-transformation)
- [Broadcom terminates VMware's free ESXi hypervisor](https://www.theregister.com/2024/02/13/broadcom_ends_free_esxi_vsphere)
- [VMware ESXi 8.0 Update 3e now available as a Free Hypervisor](https://knowledge.broadcom.com/external/article/399823/vmware-esxi-80-update-3e-now-available-a.html)
- [ESXi Hardware Requirements (vSphere 8.0)](https://techdocs.broadcom.com/us/en/vmware-cis/vsphere/vsphere/8-0/esx-installation-and-setup/installing-and-setting-up-esxi-install/esxi-requirements-install/esxi-hardware-requirements-install.html)
