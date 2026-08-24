
## The thing a cache tier actually fixes

Spinning disks are not slow at everything. A modern 7200 RPM drive streams sequential data at a respectable rate. What it cannot do is seek. Average rotational latency plus head movement puts a random read in the several millisecond range, which caps a single drive at a couple hundred random IOPS no matter what you attach it to. Flash does the same operation in tens of microseconds and does not care where the block is.

So the question a cache tier answers is narrow: does your workload do a lot of random access to a subset of the data that would fit on a smaller fast device? If yes, a tier is transformative. Virtual machine images, database files, container layers, and metadata heavy filesystems all fit that shape.

If your workload streams large files end to end, a cache tier does nothing useful. The bulk array was already fast at that, and you have added a layer that has to decide, on every access, whether to promote a block it will never see again. Some implementations detect sequential access and bypass the cache for exactly this reason.

## dm-cache and bcache, briefly

Linux gives you two mature options at the block layer.

**dm-cache** is a device mapper target, usually driven through LVM as `lvmcache`. It composes a fast device and a slow device into one logical volume, with a separate metadata volume tracking which blocks live where. Because it is LVM, it fits into a stack you probably already have, and you can add or remove the cache from an existing volume without recreating it.

**bcache** is a standalone caching layer with its own on disk format. Both the backing device and the cache device are formatted with `make-bcache`, and a new `/dev/bcacheN` appears. It has good sequential detection and a well developed writeback implementation, at the cost of needing to be planned before you put a filesystem down, since formatting the backing device is a destructive step.

I default to `lvmcache` when the storage is already LVM, which is most of the time, because attaching a cache is reversible.

```bash
# Assume vg0 holds a large slow LV called "data" on spinning disks,
# and /dev/nvme0n1 has been added to vg0 as a fast PV.

# Cache data volume plus its metadata, sized at roughly 1000:1
lvcreate -L 200G  -n data_cache     vg0 /dev/nvme0n1
lvcreate -L 200M  -n data_cache_meta vg0 /dev/nvme0n1

# Combine them into a cache pool
lvconvert --type cache-pool \
  --poolmetadata vg0/data_cache_meta \
  --cachemode writethrough \
  vg0/data_cache

# Attach the pool to the slow volume
lvconvert --type cache --cachepool vg0/data_cache vg0/data

# Inspect
lvs -o +cache_mode,chunk_size,cache_total_blocks,cache_used_blocks,cache_read_hits,cache_read_misses vg0
```

Detaching is a single `lvconvert --uncache vg0/data`, which flushes dirty blocks back and returns the volume to its original state. That reversibility is worth a lot when you are not sure a cache will help.

## Writeback is a durability decision

This is the part to get right before anything else.

In **writethrough** mode, a write is acknowledged only after it has reached the slow device. The cache holds a copy so subsequent reads are fast, but the fast device holds nothing the backing device does not already have. Lose the cache device entirely and you lose nothing but performance.

In **writeback** mode, a write is acknowledged as soon as it lands on the fast device, and it is flushed to the backing device later. Write latency drops enormously. It also means that at any given moment there is data that exists only on the cache device. Lose that device and you have lost writes the application was told were durable, and worse, you have lost them from arbitrary points across the volume, which means filesystem corruption rather than a few missing files.

So the honest rule: writeback requires the cache device to be as reliable as the array it is fronting. In practice that means mirrored fast devices, and it means power loss protection on those devices, since a consumer SSD that acknowledges a flush before the data leaves its volatile buffer defeats the whole chain. If you cannot commit to both, run writethrough and take the read benefit only.

## Sizing and endurance

Size the cache to the working set, not to the array. The working set is the data actually touched in a window that matters, and it is usually far smaller than total capacity. A cache holding ten percent of a volume can serve the large majority of requests if access is skewed, and access is almost always skewed. Doubling a cache that already hits 95 percent of the time buys you very little.

The way to find out is to measure. `lvs` exposes hit and miss counters for a cache pool, and the ratio over a representative day tells you whether to grow it. Start smaller than you think and grow, because growing is easy and the counters will tell you when.

Endurance is the constraint people forget. Every promotion into the cache is a write to the flash device, and on a workload with poor locality the tier can churn constantly, writing far more to the SSD than the application ever wrote. Check the drive's endurance rating in drive writes per day, then check what you are actually doing to it:

```bash
smartctl -A /dev/nvme0n1 | grep -Ei 'percentage_used|data_units_written|media_errors'
```

If percentage used is climbing noticeably in the first months, the cache is thrashing and either the cache is too small or the workload is not cacheable.

## When to skip the tier

Two cases. If the fast device is large enough to hold everything you care about, just put the data on it and use the spinning disks for bulk and backup. A tier is a compromise for when you cannot afford all flash, and every compromise has a management cost.

And if your slow tier is already fast enough for the workload, adding a cache is complexity that buys nothing while introducing a new failure domain and a new thing to explain to whoever inherits the system. Measure the actual latency profile first. A cache tier should be the answer to a number you can point at, not a default.

## References

- https://docs.kernel.org/admin-guide/device-mapper/cache.html
- https://docs.kernel.org/admin-guide/bcache.html
- https://man7.org/linux/man-pages/man7/lvmcache.7.html
- https://man7.org/linux/man-pages/man8/lvconvert.8.html
- https://en.wikipedia.org/wiki/Bcache
