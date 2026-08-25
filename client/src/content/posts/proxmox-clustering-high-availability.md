
## Why Cluster

A single Proxmox node is useful, but a cluster is where the platform gets interesting. With a cluster, you can live-migrate VMs between nodes, balance workloads, and configure automatic failover so that if a node fails, its VMs restart on surviving nodes.

The mechanism underneath all of that is pmxcfs, the Proxmox cluster file system mounted at `/etc/pve`. Every guest config, storage definition, and user is a file there, replicated to every node in real time and backed by Corosync. That is why any node can manage any guest, and it is also why quorum loss is felt so immediately: when the cluster loses quorum, `/etc/pve` goes read-only.

## Network Requirements

Before clustering, you need a plan for your networks:

- **Cluster communication network:** Used for Proxmox corosync traffic (cluster heartbeats and state sync). This should be a dedicated, low-latency link. 10GbE is nice to have, but bandwidth is not the constraint here.
- **VM traffic network:** Regular network for VMs.
- **Storage network:** If you are using shared storage (Ceph or iSCSI), it needs its own network.

Mixing cluster traffic with VM traffic works but is not recommended for production.

The Proxmox documentation is specific about what corosync actually needs: latency under 5 milliseconds between all nodes, and it notes that above roughly 10 ms a cluster of more than three nodes is unlikely to stay stable. It also says plainly that corosync does not use much bandwidth and that a dedicated 1 Gbit NIC is enough in most situations. The failure mode is jitter, not saturation. This is why a dedicated 1 GbE link beats a shared 10 GbE link: what kills corosync is a backup job or a migration filling the queue for 400 milliseconds.

Corosync 3 uses the Kronosnet transport, which supports up to 8 links. Configure at least two, on physically different networks, and set priorities so the dedicated link is preferred:

```bash
pvecm create my-cluster --link0 10.10.10.1,priority=20 --link1 10.20.20.1,priority=15
```

A bond is not a substitute for a second corosync link. A bond hides link failure from corosync, which sounds good until the failure mode is a switch forwarding traffic slowly rather than dropping it.

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

Four things will bite you here, all documented and all easy to hit anyway.

A joining node cannot hold any guests. `pvecm add` overwrites everything in `/etc/pve` on the joining node, and guest IDs would collide, so the join refuses. If the node already has VMs, back them up with `vzdump` and restore them under new IDs after the join.

The join needs root SSH access on TCP 22 to the existing node, with the root password. All nodes should be on the same Proxmox version before you cluster them.

Live migration only works between nodes whose CPUs are from the same vendor. Mixing an Intel node and an AMD node in one cluster is allowed, but you will be doing offline migrations between them.

Changing a node's IP after clustering is a real procedure, not an edit. You change it in `/etc/pve/corosync.conf`, and you must increment `config_version` in the same edit or the other nodes will ignore your change.

## Quorum and Fencing

Proxmox uses quorum to decide which nodes are authoritative. In a two-node cluster, you need a quorum device (a third vote, even a small VM or a NAS) to avoid split-brain scenarios. Three-node clusters have natural quorum.

Each node gets one vote by default, and quorum is a simple majority. The QDevice runs `corosync-qnetd` and must live outside the cluster: a Raspberry Pi, a NAS, or any always-on Linux host works, but putting it on a VM inside the cluster it is arbitrating defeats the entire point.

The symptom of quorum loss is distinctive and confuses people the first time. You can SSH into the node fine. The web UI loads. But you cannot start a VM, cannot edit anything, and get "cluster not ready - no quorum?" That is `/etc/pve` in read-only mode doing exactly what it should.

There is an escape hatch, `pvecm expected 1`, which forces the node to consider itself quorate. It exists for recovery, mostly for removing a dead node with `pvecm delnode` when the survivors are below quorum. Running it on a node while the other side of a partition is still alive and serving is how you get two copies of the same VM writing to the same disk.

Fencing ensures that a failed node is truly offline before its VMs are restarted elsewhere. Without proper fencing, two instances of the same VM could run simultaneously, causing data corruption.

Modern Proxmox does this without any external power controller, and this is worth being precise about because a lot of older advice says otherwise. Proxmox VE 3.x used the Red Hat cluster stack and needed a configured fencing device such as IPMI or iDRAC power control. The `ha-manager` stack in current releases uses watchdog-based self-fencing instead. Each node's local resource manager pets a watchdog; a node that loses quorum stops petting it, and the watchdog resets that node after 60 seconds. Proxmox uses a hardware watchdog if one is available and falls back to the Linux `softdog` kernel watchdog otherwise. If your server exposes an IPMI watchdog timer, pointing Proxmox at it is strictly better than softdog, because softdog is a kernel timer and a sufficiently wedged kernel will not fire it.

## The Failure Timeline

Understanding HA means understanding that everything is a clock, and the clocks have to line up.

When a node dies, the surviving nodes must form a new corosync membership. Corosync's token timeout grows with cluster size: it is a base token value plus a per-node token coefficient. That coefficient defaults to 650 milliseconds, and since Proxmox VE 9.2 new clusters are created with an explicit 125 milliseconds instead, specifically to shorten membership reformation.

The reason that matters is the 60 second watchdog. Proxmox documents that with HA enabled, membership reformation must complete in under 45 seconds so the new membership exists before the failed node's watchdog fires. In a large cluster with the old 650 ms coefficient, that budget is not automatic.

So the real recovery time for an HA VM is not "instant." It is the fence timeout, plus membership reformation, plus the HA manager's scheduling round, plus the guest's own boot time. Expect a couple of minutes, and design around that rather than being surprised by it.

## High Availability Groups

Configure HA groups to control which nodes can host specific VMs:

```bash
ha-manager add vm:100
ha-manager set vm:100 --state started --group ha-group1
```

Note that HA groups are deprecated as of Proxmox VE 9.0 and are migrated automatically to HA node affinity rules. New configurations should use rules, which also added resource affinity so you can keep two guests together or force them apart:

```bash
ha-manager rules add node-affinity prefer-fast --resources vm:100 --nodes node1:2,node2:1
ha-manager rules add resource-affinity keep-apart --affinity negative --resources vm:100,vm:101
```

Two defaults to know: `max_restart` and `max_relocate` are both 1. A guest that fails to start gets one retry on the same node and one relocation attempt, then goes to the `error` state and stays there until a human clears it. That is deliberate. A guest that crashes because its storage is gone should not migrate around the cluster crashing on every node in turn.

## Shared Storage

HA VM migration requires shared storage so both source and destination nodes can access the VM disk. Ceph, NFS, and iSCSI are all supported. Ceph is native to Proxmox and integrates cleanly, though it has its own complexity and resource requirements.

Concretely, Ceph pools in Proxmox default to `size = 3` and `min_size = 2`. That means three replicas of every object, so usable capacity is about one third of raw, and I/O blocks entirely if fewer than two replicas are available. Blocked I/O is not a graceful degradation: guests whose disks stop responding will start throwing filesystem errors. This is the main reason Ceph wants three nodes minimum, matching the HA requirement.

Give Ceph its own network and make it fast. Recovery after an OSD failure rebalances real data across that network, and if it shares a link with corosync you have built a cluster that fences itself every time a disk dies.

The hardware detail that catches homelabs: Ceph issues small synchronous writes, and consumer SSDs without power loss protection handle those by flushing to NAND every time. A drive advertising 500 MB/s can deliver single-digit megabytes per second under Ceph's write pattern. Enterprise SSDs with a protected write cache are not a luxury here.

## What Clustering Does Not Give You

A cluster is not a backup. Corosync replicates configuration, and Ceph replicates blocks, which means it also faithfully replicates your accidental `rm -rf`. Run `vzdump` or Proxmox Backup Server regardless.

HA is not zero downtime. It restarts a guest on another node, which from inside the VM is indistinguishable from someone pulling the power cord. Anything that needs true continuity needs application-level clustering inside the guests.

A cluster also concentrates risk. Three standalone nodes fail one at a time. A three node cluster with a bad corosync network can fence all of them. And a stretched cluster across a WAN link fails the 5 ms latency requirement almost by definition. Two independent clusters with replication between them is the right answer for two sites, not one cluster spanning both.

## References

- https://pve.proxmox.com/pve-docs/chapter-pvecm.html
- https://pve.proxmox.com/pve-docs/chapter-ha-manager.html
- https://pve.proxmox.com/pve-docs/chapter-pveceph.html
- https://manpages.debian.org/bookworm/corosync/corosync.conf.5.en.html
- https://corosync.github.io/corosync/
- https://docs.ceph.com/en/latest/rados/configuration/pool-pg-config-ref/
