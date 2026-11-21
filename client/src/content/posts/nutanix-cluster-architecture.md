## Why the storage controller moved into a VM

A traditional virtualization stack has three tiers: servers that run virtual machines (VMs), a storage network, and a dedicated storage array with its own controllers. Hyperconverged infrastructure (HCI) collapses those tiers. Each server contributes its local drives, and software turns the drives of all servers into one shared pool.

Nutanix's version of this idea has one design choice that explains most of its behavior: the storage controller is not a kernel module and not a separate appliance. It is an ordinary virtual machine, called the Controller VM (CVM), and one runs on every node. The CVM owns the node's drives, serves all storage input/output (I/O) for the VMs on that host, and talks to the CVMs on every other node to keep the data replicated.

This explainer follows Nutanix's public documentation and the Nutanix Bible, the vendor's own architecture book at nutanixbible.com. Nutanix's core software, AOS (which the Bible glosses as the Nutanix core software that runs in every CVM), has changed a lot across releases, so where a behavior is tied to a release, the release is named. Numbers the Bible gives without a version come from the edition read for this article, whose pages carry a 2025 copyright line and name no release. Treat every such timer and threshold as version dependent.

## Nodes, blocks and the cluster

A node is one physical server: central processing units (CPUs), memory, network ports and local drives (solid-state drives, or SSDs, and in hybrid systems also hard disk drives, or HDDs). The Bible uses "block" for the chassis, which holds one, two or four nodes, and "rack" for a physical unit that holds one or more blocks.

Every node runs two layers of software:

- A hypervisor that runs the guest VMs. The Bible names ESXi (VMware), AHV (Nutanix's own) and Hyper-V (Microsoft). Which hypervisors a current AOS release supports was not checked for this article and depends on the release, so none is claimed here.
- The CVM, which runs the Nutanix software and, in the Bible's words, serves all of the I/O operations for the hypervisor and every VM on that host.

A cluster is a group of these nodes managed as one system. Adding a node adds compute, capacity and another storage controller at once, so background work such as rebuilds spreads across more controllers.

### How the CVM gets the drives

The CVM needs direct control of the drives, not virtual disks handed to it by the hypervisor. Nutanix does this with passthrough:

- On AHV, the whole storage controller is handed to the CVM with PCI (Peripheral Component Interconnect) passthrough, so the CVM talks to the drives without the hypervisor in the way.
- On ESXi, the same is done with VMware's VMDirectPath I/O.
- On Hyper-V, the Bible says the storage devices are passed through to the CVM.

The hypervisor then mounts storage back from its local CVM over the network stack inside the host. On ESXi, the Bible describes an internal virtual switch (vSwitchNutanix) where the host has the address 192.168.5.1 and the CVM has 192.168.5.2, and calls this the primary storage communication path. The main I/O service, Stargate, presents storage to the hypervisor over NFS (Network File System), iSCSI (Internet Small Computer Systems Interface) or SMB (Server Message Block), depending on the hypervisor.

Nutanix lists mobility, resiliency, upgrades and performance as its reasons for a VM-based controller. The key consequence is that the CVM can reboot or fail while its host keeps running, with storage served by other CVMs; rolling AOS upgrades rely on this. The cost is the CPU and memory each node gives to its CVM. [Ceph](/blog/ceph-distributed-storage-intro) takes the opposite approach, running storage daemons directly on the host operating system.

## What runs inside the CVM

The CVM is a bundle of distributed services. Most run on every node and elect a leader for coordination work. The main ones in the Bible's component list:

| Service | Role (paraphrased from the Nutanix Bible) |
|---|---|
| Stargate | All data I/O; the interface the hypervisor talks to. Runs on every node. |
| Cassandra (accessed through Medusa) | Distributed key-value store for cluster metadata. |
| Zookeeper (accessed through Zeus) | Cluster configuration: hosts, Internet Protocol (IP) addresses, state. Runs on three nodes with an elected leader. |
| Curator | MapReduce-style background scans: rebuilds, disk balancing, scrubbing. Full scan about every 6 hours, partial scan every hour. |
| Prism | The web interface, command-line interface and REST (Representational State Transfer) application programming interface. |
| Cerebro | Snapshot scheduling and replication to remote sites. |

On AHV clusters there is also Acropolis, which manages VMs. An Acropolis worker runs on every CVM and one elected Acropolis leader handles scheduling and, as covered below, restarting VMs after a host failure.

## AHV versus ESXi on the same storage

**AHV** is the Acropolis Hypervisor, Nutanix's own. The Bible describes it as based on Linux, QEMU (a machine emulator and virtualizer) and KVM (Kernel-based Virtual Machine). AOS drives it through libvirt and hides those details behind Prism. Networking uses Open vSwitch (OVS), with a separate internal Linux bridge carrying storage traffic between the CVM and the host. VM disks are reached over iSCSI. Each AHV host runs an iSCSI redirector that checks the health of every Stargate in the cluster and points QEMU at a healthy one, preferring the local CVM.

AHV's disk path changed over releases. The original path ran through QEMU's single-threaded main loop; a lighter, multi-queue path called Frodo (also called AHV Turbo) replaced it. The Bible says Frodo is enabled by default on VMs powered on after AOS 5.5.X.

**ESXi** on Nutanix keeps VMware's own management and networking. The CVM presents a container to the host as a datastore over the internal vSwitchNutanix path described earlier, and the Bible's tooling notes refer to an NFS adapter for that traffic. VM restarts after a host failure come from the hypervisor's own high availability (HA) feature rather than from Acropolis. A comparison of the hypervisors themselves, outside Nutanix, is in [Proxmox vs ESXi](/blog/proxmox-vs-esxi).

The choice does not change how data is protected. It changes the management plane, VM restarts, networking and how a CVM outage is routed around.

## The Distributed Storage Fabric

The Distributed Storage Fabric (DSF) is Nutanix's name for the distributed storage layer formed by all the CVMs together. The Bible and Nutanix's French product page still use that name; the current English product page calls the same layer AOS Storage.

### Storage constructs

The drives from all nodes form a storage pool. Administrators carve containers out of that pool (a container is roughly what the hypervisor sees as a datastore or share), and settings such as the replication factor are set per container. Inside, each VM disk is a vDisk. The Bible describes a vDisk as made of extents, which are logically contiguous chunks of data, and those extents are stored in extent groups, which are physically contiguous files on the drives.

### The write path

When a VM writes, the request goes to Stargate on the local CVM. Stargate decides where the write lands:

- **OpLog.** Bursty random writes go to the OpLog, a journal-like staging area on SSD that coalesces writes and drains them sequentially later.
- **Extent Store.** Sustained random and sequential writes go straight to the Extent Store, the persistent bulk storage that spans all drive tiers. The Bible says a write stream counts as sequential when more than 1.5 MB of write I/O to a vDisk is outstanding.

Data later moves between tiers under information lifecycle management (ILM), which promotes hot data and demotes cold data.

### Replication factor 2 and 3

Redundancy comes from the replication factor (RF), the number of copies of each piece of data the cluster keeps. When a write lands in the local OpLog, the Bible says it is synchronously replicated to the OpLog of one more CVM (RF2) or two more CVMs (RF3) before the write is acknowledged to the host. A checksum is computed as data is written and stored with its metadata, and every read recomputes the checksum. If a copy does not match, the system reads another replica and replaces the bad one. A background scrubber also checks extent groups when the drives are not busy.

Replicas are not fixed mirror pairs: OpLog peers are chosen per 1 GB of vDisk data based on factors such as response time and capacity, so every node shares the load.

Metadata has its own replication. Metadata lives in the Cassandra-based ring and is replicated with a majority vote enforced by the Paxos consensus algorithm. The Bible ties data RF and metadata RF together through a fault tolerance (FT) level:

- **FT1:** data RF2, metadata RF3. The cluster tolerates one failure.
- **FT2:** data RF3, metadata RF5. The cluster tolerates two failures.

The Bible notes these FT levels as supported as of AOS 5.0, and its awareness table lists 5 nodes as the minimum for FT2 with node awareness, which fits metadata needing five copies.

Two newer details, both from Nutanix's AOS 6 announcement:

- **RF1 since AOS 6.** Before AOS 6, RF could only be 2 or 3. AOS 6 added containers with RF1, meaning no redundant copy, aimed at applications that protect their own data. Without a second copy, the cluster cannot rebuild that data after a failure, so RF1 is a deliberate exception.
- **Reserve Rebuild Capacity.** AOS 6 also added a setting that reserves the capacity of the largest node, so that after a node failure there is room to rebuild back to full resiliency.

A related idea is what the Bible calls resilient capacity: total capacity minus the space needed to rebuild after the tolerated failures. Past that line, a cluster may survive a failure but cannot restore full redundancy.

### Block and rack awareness

By default, the failure domain is the node, so replicas land on different nodes. With enough blocks (the Bible says at least 3 for block awareness), replicas are spread across blocks so a whole chassis can be lost. Rack awareness works the same way but requires the administrator to define racks.

## Data locality

Because each VM's I/O goes through its local CVM, Nutanix tries to keep a copy of each VM's data on that same node. Writes always land locally first, with replicas on other nodes. If a VM moves to another host (live migration or an HA restart), its old data is still on the previous node, so reads are forwarded over the network to the remote CVM at first.

Locality then recovers in two ways:

- **Cache locality.** Remote data is pulled into the local Stargate's Unified Cache at 4 KB granularity. This follows vDisk ownership, which moves to the new node's CVM. The Bible says the previous Stargate gives up the vDisk after it sees remote I/O for 300 or more seconds.
- **Extent group locality.** The actual extent groups are migrated to the new node's drives, but only when access thresholds are met: per the Bible, 3 touches for random or 10 for sequential access within a 10-minute window.

Migration happens only on reads, to avoid flooding the network.

A related change applies to metadata: as of AOS 5.10, metadata is split into global and local parts (before that, all of it was global) to keep more lookups on the local node.

## Prism Element versus Prism Central

Prism is the management layer, and it comes in two forms:

- **Prism Element (PE)** is built into every cluster. It manages one cluster. The Prism service runs on every CVM with an elected leader that handles web requests; other CVMs redirect browsers to the leader. The cluster's virtual IP address always sits on the current leader and moves to a newly elected one after a failure.
- **Prism Central (PC)** is an optional VM appliance that manages many clusters from one place. It can run on one of the clusters it manages. Multi-cluster features live here, as do some newer features such as the disaster recovery dashboard added with AOS 6.0.

The Bible recommends Prism Central for more than one cluster or site. Prism Central also has its own version numbers (Nutanix material cites releases such as PC 2020.9 and Prism Central 2023.3), so a feature may need both a minimum AOS and a minimum Prism Central release.

## What a failure does

The Bible describes three failure levels and their effect on VMs:

| Failure | VM restart (HA event) | Failed I/O | Latency |
|---|---|---|---|
| Disk | No | No | No impact |
| CVM | No | No | Potentially higher, since I/O crosses the network |
| Node | Yes | No | No impact once restarted |

### Disk failure

When Stargate sees I/O errors or timeouts, it marks the disk offline, and a service called Hades runs S.M.A.R.T. (Self-Monitoring, Analysis and Reporting Technology) checks. A Curator scan starts immediately to find which data lived on that disk and where the other replicas are, then spreads the rebuild across all nodes. Rebuilds start at once rather than after a waiting period. Why rebuild speed matters for any redundant array of independent disks (RAID) or replicated system is covered in [RAID rebuild risk math](/blog/raid-rebuild-risk-math).

### CVM failure

A CVM can go down from a power-off, an upgrade reboot or a crash. The host and its VMs keep running. How I/O gets rerouted depends on the hypervisor:

- **ESXi and Hyper-V:** a process the Bible calls CVM Autopathing, using a script named HA.py, changes routes on the host so traffic for the internal CVM address (192.168.5.2) goes to the external IP of a CVM on another node. The datastore stays mounted.
- **AHV:** the iSCSI redirector notices the local Stargate stopped responding to its health checks and redirects QEMU's iSCSI login to a healthy Stargate elsewhere.

In both cases, when the local CVM comes back and is stable, it takes over as the primary path again. The visible cost is extra network latency while I/O is remote.

### Node failure

When a node goes down, its VMs stop and HA restarts them on other nodes. On AHV, the Acropolis leader does this: when its libvirt connection to the host drops and does not come back within the timeout, it restarts that host's VMs elsewhere, and the Bible says this should happen within 120 seconds. AHV's optional Guarantee mode reserves room so all failed VMs fit; since AOS 5.0 it uses only segment-based reservation (earlier releases also offered host-based). On ESXi, the restart comes from VMware's HA rather than from Acropolis.

Meanwhile Curator finds the replicas that lived on the dead node and the whole cluster rebuilds them. The Bible says that if the node stays down for a prolonged period (30 minutes), its CVM is removed from the metadata ring, and it is added back after it has been up and stable for a while. Once restarted, VMs do their I/O through their new local CVM, and data locality gradually moves their data to them.

## Limits and common mistakes

- **Running full.** Replication protects only if there is free space to rebuild into.
- **Assuming RF3 or block awareness on a small cluster.** The Bible lists five nodes as the FT2 minimum with node awareness, and block awareness needs at least three blocks.
- **Using rack awareness as a stretched cluster.** The Bible says spanning one cluster across two rooms or buildings with block or rack awareness is theoretically possible but not recommended, and points to synchronous or near-synchronous replication, optionally with a metro cluster, instead. AOS 6.0 added AHV Metro Availability for that purpose.
- **Reading old numbers as current.** Timers and thresholds quoted here come from the Bible edition read, not a named release. Check the documentation for your AOS version.

## Study notes

- Each node runs a hypervisor plus one CVM, which owns the drives through passthrough and serves that host's storage I/O.
- DSF (now marketed as AOS Storage) is the storage layer formed by all CVMs. Stargate does I/O, Cassandra holds metadata, Curator repairs.
- A write is acknowledged only after it reaches one (RF2) or two (RF3) other CVMs. FT1 is data RF2 with metadata RF3; FT2 is data RF3 with metadata RF5.
- Version markers: FT levels as of AOS 5.0, Frodo default after AOS 5.5.X, split metadata in AOS 5.10, RF1 and Reserve Rebuild Capacity in AOS 6.
- Prism Element manages one cluster; Prism Central manages many.
- Disk failure: rebuild, no VM impact. CVM failure: I/O reroutes, higher latency. Node failure: VMs restart elsewhere and data rebuilds.

## Sources

- [The Nutanix Cloud Bible: Hyperconverged Platform](https://www.nutanixbible.com/2c-book-of-basics-hyperconverged-platform.html)
- [The Nutanix Cloud Bible: Distributed System](https://www.nutanixbible.com/2d-book-of-basics-distributed-system.html)
- [The Nutanix Cloud Bible: Cluster Components](https://www.nutanixbible.com/2f-book-of-basics-cluster-components.html)
- [The Nutanix Cloud Bible: AOS Architecture](https://www.nutanixbible.com/4a-book-of-aos-architecture.html)
- [The Nutanix Cloud Bible: Data I/O Path](https://www.nutanixbible.com/4g-book-of-aos-data-io-path.html)
- [The Nutanix Cloud Bible: Data Resilience and HA](https://www.nutanixbible.com/4i-book-of-aos-data-resilience-and-ha.html)
- [The Nutanix Cloud Bible: AHV Architecture](https://www.nutanixbible.com/5a-book-of-ahv-architecture.html)
- [The Nutanix Cloud Bible: How Nutanix AHV Works](https://www.nutanixbible.com/5b-book-of-ahv-how-it-works.html)
- [The Nutanix Cloud Bible: VMware vSphere Architecture](https://www.nutanixbible.com/6a-book-of-vsphere-architecture.html)
- [The Nutanix Cloud Bible: How vSphere on Nutanix Works](https://www.nutanixbible.com/6b-book-of-vsphere-how-it-works.html)
- [The Nutanix Cloud Bible: Prism Architecture](https://www.nutanixbible.com/3a-book-of-prism-architecture.html)
- [Nutanix blog: Announcing Nutanix AOS 6](https://www.nutanix.com/blog/announcing-aos-6)
- [Nutanix product page: AOS Storage](https://www.nutanix.com/products/nutanix-cloud-infrastructure/distributed-storage)
- [Nutanix product page (French): Distributed Storage Fabric](https://www.nutanix.com/fr/products/nutanix-cloud-infrastructure/distributed-storage)
