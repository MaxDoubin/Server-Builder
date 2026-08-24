
## Three things people conflate

Ask why a ZFS pool feels slow and you will get three suggestions: add RAM, add a cache device, add a log device. They address different problems, and two of the three are frequently recommended for situations they do nothing about.

The layers are ARC, L2ARC, and the ZIL with its optional separate log device. Understanding what each one is for takes about ten minutes and prevents a lot of wasted money.

## ARC is the read cache, and it is the important one

The Adaptive Replacement Cache lives in RAM and holds recently used data and metadata. It is called adaptive because it maintains two lists, one for blocks used once recently and one for blocks used repeatedly, and it shifts the balance between them based on what is actually being hit. It also keeps ghost entries, which are records of evicted blocks with no data attached, so it can tell when it evicted something it should not have and adjust.

That design makes it noticeably better than a simple least recently used cache under mixed workloads, particularly when a large sequential job would otherwise flush everything useful out of a plain LRU.

The practical consequence is straightforward: RAM is the highest leverage upgrade for read heavy workloads on ZFS, and nothing else on this list substitutes for it. Before changing anything, look at the hit ratio.

```bash
# Live view of hit rates and cache composition
arcstat 1 10

# Current size, target size, and the metadata share
awk '/^(size|c|c_max|arc_meta_used)/ {printf "%-16s %s\n", $1, $3}' \
  /proc/spl/kstat/zfs/arcstats
```

If the hit ratio is already high, adding cache is not your problem. Go look at the pool layout, the record size, or the workload itself. If the ratio is poor and the working set is bigger than RAM, now you have a real question to answer.

Setting a maximum matters on a machine that does other things. ZFS will happily grow ARC to consume most of memory and release it under pressure, but the release is not instant, and on a virtualization host that behavior can look like memory starvation.

```ini
# /etc/modprobe.d/zfs.conf   (values in bytes, applied at module load)
options zfs zfs_arc_max=8589934592
options zfs zfs_arc_min=2147483648
```

## L2ARC is a second tier, with a cost people forget

An L2ARC device is flash that holds blocks evicted from ARC, giving you a slower but larger read cache. It sounds free. It is not, for one specific reason: every block in L2ARC needs a header in ARC to track it. Adding a large cache device consumes RAM that would otherwise hold actual data.

So a machine short on RAM can get slower after adding L2ARC, because the headers displace cached blocks. That is the single most common way this goes wrong.

L2ARC also fills slowly by design, throttled so it does not interfere with normal operation, and historically it did not survive reboots, so a machine that reboots often may never warm it up. Persistent L2ARC exists in current implementations and helps a lot with that, but the warming behavior still means you should measure over days rather than minutes.

My rule: max out RAM first, then consider L2ARC only if the working set genuinely exceeds what RAM can hold and the hit ratio proves it.

## The SLOG is not a write cache

This is the big one. ZFS batches writes into transaction groups in memory and flushes them periodically. That is true for every write, and no separate device changes it.

The ZFS Intent Log exists for a narrower purpose: when an application requests a synchronous write, the caller must not be told the write completed until it is durable. The ZIL provides that durability record so the promise can be kept without waiting for the full transaction group flush. A separate log device, a SLOG, moves that intent log onto a fast device with power loss protection.

Which means a SLOG only helps synchronous writes. Ordinary asynchronous writes, which is most of what a file copy or a general purpose file server does, never touch it. Adding a log device to speed up an async workload accomplishes nothing at all, and I have watched people buy hardware to fix a problem it cannot reach.

Where it genuinely helps: NFS exports with sync semantics, databases issuing sync commits, and virtual machine storage over iSCSI or NFS where the guest is flushing. Check whether your workload is even synchronous before shopping.

```bash
# Are writes to this dataset synchronous at all?
zpool iostat -v 1

# Dataset sync policy: standard honors the application, always forces sync
zfs get sync tank/vmstore
```

Two warnings. Setting `sync=disabled` will make sync workloads dramatically faster by simply breaking the durability promise, and an unclean shutdown can then lose acknowledged writes. It is a legitimate choice for scratch data and a terrible one for anything else. And a SLOG device without power loss protection provides a durability guarantee it cannot actually honor, which defeats the entire purpose.

## The special vdev, which is often the real answer

A special allocation class vdev holds metadata and, if configured, small blocks, on dedicated fast devices. For workloads dominated by directory traversal and small file access, this frequently does more than L2ARC would, because metadata operations stop hitting spinning disks entirely.

The catch is serious: a special vdev is part of the pool, not a cache. Lose it and you lose the pool. It must be redundant, at the same level you would demand of any data vdev.

## The order I actually work in

Measure the hit ratio and the workload's sync behavior first. Add RAM. Check record size against the access pattern, since a mismatch causes read amplification that no cache layer fixes. Consider a special vdev if metadata is the bottleneck. Consider L2ARC if the working set is genuinely too large for RAM. Add a SLOG only if the workload is actually synchronous.

Almost every ZFS performance complaint I have looked at was answered somewhere in the first three steps.

## References

- [OpenZFS documentation](https://openzfs.github.io/openzfs-docs/)
- [ZFS overview](https://en.wikipedia.org/wiki/ZFS)
- [Adaptive replacement cache](https://en.wikipedia.org/wiki/Adaptive_replacement_cache)
- [FreeBSD handbook: ZFS](https://docs.freebsd.org/en/books/handbook/zfs/)
