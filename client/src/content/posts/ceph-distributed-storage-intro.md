
## The design decision everything follows from

Most distributed storage systems keep a table somewhere that says which server holds which piece of data. That table has to be consulted on every operation, kept consistent, and made highly available, and it becomes the scaling bottleneck.

Ceph made a different choice. There is no lookup table for object placement. Instead, any client that has the cluster map can compute where an object belongs using an algorithm called CRUSH, Controlled Replication Under Scalable Hashing. Give it an object name and the map and it deterministically produces the list of devices that should hold that object. Every client computes the same answer independently, so clients talk directly to the storage daemons without a metadata server in the data path.

That one decision explains the architecture, the failure behavior, and most of the operational surprises. Everything below is a consequence of it.

### The pieces, briefly

An OSD, or object storage daemon, is one process managing one storage device. A machine with twelve drives typically runs twelve OSDs, not one. OSDs handle reads, writes, replication to peers, recovery, and reporting their own state.

Monitors maintain the cluster map: which OSDs exist, which are up and in, the CRUSH map, and the pool definitions. They form a quorum using a consensus protocol, which is why you run an odd number and why three is the practical minimum. Monitors are not in the data path. They publish the map, clients cache it, and clients do the rest.

Manager daemons handle metrics, dashboards, and orchestration modules. A metadata server is only needed for the POSIX filesystem layer, not for block or object access.

## Placement groups: the layer that confuses everyone

CRUSH does not map objects directly to OSDs. It maps objects to placement groups, then maps placement groups to OSDs. That indirection exists for a practical reason: tracking hundreds of millions of individual objects for replication and recovery would be unmanageable, while tracking a few thousand placement groups is easy. A PG is a bucket of objects that move, replicate, recover, and scrub together.

The count matters. Too few and data distributes unevenly, because there are not enough buckets to average out, and recovery involves large chunks. Too many and every OSD carries per PG memory and CPU overhead, and peering after a change becomes expensive. Modern clusters have an autoscaler that adjusts this for you based on pool usage, and letting it work is usually the right call.

PG states are the cluster's vocabulary for what is happening. `active+clean` is healthy. `degraded` means some replicas are missing but data is available. `undersized` means fewer replicas exist than the pool wants. `peering` means OSDs are agreeing on the authoritative state of a PG. `backfilling` and `recovering` mean data is being rebuilt. Learning to read these is most of learning to operate Ceph.

## Failure domains are the whole point of the CRUSH map

The CRUSH map is a hierarchy: root, then datacenter, room, rack, chassis, host, and finally OSD. A pool's rule says which level to spread replicas across. Set the failure domain to host and CRUSH will never place two replicas of the same PG on the same machine, so losing a machine costs at most one replica. Set it to rack and you survive losing a rack.

This is where people get burned. If the failure domain is host but you only have two hosts and the pool wants three replicas, CRUSH cannot satisfy the rule, and PGs sit permanently undersized. The cluster is not broken, it is correctly refusing to violate your own policy. The fix is more hosts or an honest change to the policy.

```bash
ceph -s                                  # overall health, PG states, capacity
ceph osd tree                            # the CRUSH hierarchy with weights
ceph health detail                       # why HEALTH_WARN, specifically
ceph osd pool ls detail                  # size, min_size, rules per pool
ceph pg dump_stuck                       # PGs that stopped making progress
ceph osd df tree                         # per OSD utilization and variance
```

## size and min_size, the two numbers that decide availability

`size` is how many copies the pool wants. `min_size` is how few copies are enough to keep accepting writes. When available copies drop below `min_size`, the affected PGs stop serving I/O rather than risk divergence.

The classic mistake is setting `size=2, min_size=1` because it saves space. Now a single OSD failure leaves one copy, and writes continue against it. If that surviving device fails or was already silently corrupt, you have no way to determine what the correct data was. `size=3, min_size=2` exists because it lets you lose one device and keep writing while still having two copies to compare.

Erasure coding trades CPU and latency for capacity, and it is a good fit for large objects written once and read often, like backups and archives. For block storage backing virtual machines, replication is usually the better answer because of the small random write pattern.

## What actually goes wrong

**Uneven fullness.** CRUSH is statistical, so OSDs do not fill perfectly evenly, and the cluster hits its full ratio when the fullest device does, not the average. The balancer module exists for this. Watch the variance column in `ceph osd df`.

**Recovery starving clients.** After a failure the cluster wants to restore redundancy quickly, and that traffic competes with client I/O. There are settings to throttle recovery, and the right choice depends on whether you care more about being redundant sooner or being responsive now. Decide that before an incident, not during one.

**Clock skew.** Monitors need synchronized clocks for their quorum. Untrustworthy time produces cluster warnings that look like storage problems. Run proper time synchronization on every node.

**Network as the real bottleneck.** Every write goes to the primary OSD and then out to replicas, so a three replica write puts real traffic on the back end. Ceph clusters generally want a separate cluster network for replication and recovery, and they want it to be fast. A cluster that seems mysteriously slow is often network bound.

## Would I run it at home

Honestly, only to learn it, and that is a perfectly good reason. Ceph pays off at a scale where you have enough hosts for meaningful failure domains and enough demand to justify the operational weight. Below that, simpler storage with good backups will serve you better and wake you up less.

But it is worth understanding, because the ideas, deterministic placement, explicit failure domains, and quorum for metadata, show up all over distributed systems. Learn it on three small nodes, break it deliberately, watch it recover, and read the PG states while it happens.

## References

- [Ceph architecture](https://docs.ceph.com/en/latest/architecture/)
- [CRUSH maps](https://docs.ceph.com/en/latest/rados/operations/crush-map/)
- [Placement groups](https://docs.ceph.com/en/latest/rados/operations/placement-groups/)
- [Erasure coded pools](https://docs.ceph.com/en/latest/rados/operations/erasure-code/)
- [Ceph on Wikipedia](https://en.wikipedia.org/wiki/Ceph_(software))
