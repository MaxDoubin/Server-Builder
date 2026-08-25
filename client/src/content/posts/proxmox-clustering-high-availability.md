
## Why Cluster

A single Proxmox node is useful, but a cluster is where the platform gets interesting. With a cluster, you can live-migrate VMs between nodes, balance workloads, and configure automatic failover so that if a node fails, its VMs restart on surviving nodes.

## Network Requirements

Before clustering, you need a plan for your networks:

- **Cluster communication network:** Used for Proxmox corosync traffic (cluster heartbeats and state sync). This should be a dedicated, low-latency link. 10GbE is ideal.
- **VM traffic network:** Regular network for VMs.
- **Storage network:** If you are using shared storage (Ceph or iSCSI), it needs its own network.

Mixing cluster traffic with VM traffic works but is not recommended for production.

## Creating a Cluster

On the first node:
```bash
pvecm create my-cluster
```

On subsequent nodes:
```bash
pvecm add 192.168.1.10  # IP of the first node
```

Verify cluster status:
```bash
pvecm status
```

## Quorum and Fencing

Proxmox uses quorum to decide which nodes are authoritative. In a two-node cluster, you need a quorum device (a third vote, even a small VM or a NAS) to avoid split-brain scenarios. Three-node clusters have natural quorum.

Fencing ensures that a failed node is truly offline before its VMs are restarted elsewhere. Without proper fencing, two instances of the same VM could run simultaneously, causing data corruption. Configure IPMI/iDRAC-based fencing so the cluster can power-cycle failed nodes.

## High Availability Groups

Configure HA groups to control which nodes can host specific VMs:

```bash
ha-manager add vm:100
ha-manager set vm:100 --state started --group ha-group1
```

## Shared Storage

HA VM migration requires shared storage so both source and destination nodes can access the VM disk. Ceph, NFS, and iSCSI are all supported. Ceph is native to Proxmox and integrates cleanly, though it has its own complexity and resource requirements.
