
## The output everyone misreads

Someone runs `free -h` on a server, sees almost no free memory, and panics. Then they add RAM, or worse, they start killing services.

The page cache is not wasted memory. Linux keeps recently read file data in RAM because unused RAM does nothing for you. That cache is instantly reclaimable when a process actually needs the memory. The column that answers "how much can I still allocate" is `available`, not `free`.

```bash
free -h
#               total   used   free   shared  buff/cache   available
# Mem:           125Gi   38Gi  1.2Gi    1.1Gi        86Gi        84Gi
```

Read that as: 38 GiB genuinely in use, 86 GiB holding cached file data, and about 84 GiB obtainable right now by a process that asks. A server in that state is healthy. A server with high `used` and low `available` is the one to worry about.

## The read path

When a process reads a file, the kernel checks the page cache first. Hit, and the data is a memcpy away. Miss, and it goes to the block device, stores the result in the cache, and hands it over.

The kernel also reads ahead: on a detected sequential pattern it pulls in more than you asked for, betting you will want the next chunk. This is why a sequential read of a large file is dramatically faster than random reads of the same total volume, even on flash.

You can see readahead and change it per device:

```bash
blockdev --getra /dev/sda        # sectors of readahead
blockdev --setra 256 /dev/sda    # 128 KiB
```

Raising it helps large sequential workloads like backups and media. Lowering it helps random small read workloads, where aggressive readahead is pure waste. Databases usually want it low, since they do their own caching and their own prefetching.

## The write path is where surprises live

Writes go into the page cache and are marked dirty. The write syscall returns as soon as it lands in memory. The kernel flushes dirty pages to the device later, in the background.

That is fast and it is a lie about durability, which is fine as long as you know it. The moment you actually need the data on stable storage, you call `fsync`, and that is where the real cost appears.

Two sets of knobs govern the flushing:

```bash
# Percentages of available memory
sysctl vm.dirty_background_ratio   # start flushing in the background
sysctl vm.dirty_ratio              # block writers until flushed

# Or absolute byte thresholds, better on large-memory machines
sysctl vm.dirty_background_bytes
sysctl vm.dirty_bytes

sysctl vm.dirty_expire_centisecs   # age at which a page must be written
```

The classic pathology: on a machine with a lot of RAM, the default ratio based thresholds allow an enormous pool of dirty pages to accumulate. Everything is fast, then the threshold is hit and every writer stalls at once while gigabytes flush to a device that cannot absorb them quickly. The symptom is periodic, seconds long, whole system freezes with no obvious trigger.

The fix is to set the byte based limits to something the storage can actually flush in a couple of seconds, so writeback is continuous rather than catastrophic.

## Watching it happen

```bash
# Dirty and in-flight bytes, right now
grep -E '^(Dirty|Writeback|MemAvailable):' /proc/meminfo

# Blocks in and out per second, plus io wait
vmstat 1 10

# Per-device queue depth, utilization, and await
iostat -x 2

# Who is doing the writing
sudo iotop -oPa
```

The number I watch first is `Dirty` in `/proc/meminfo` during the problem. If it climbs into the gigabytes before collapsing, you have found your stall. If `iostat` shows `%util` pinned at 100 with a large `aqu-sz` and rising `await`, the device is simply saturated and no amount of tuning fixes it.

## Direct I/O and double caching

Databases and some storage systems open files with `O_DIRECT` to bypass the page cache entirely. They do this because they maintain their own buffer pool and know their access patterns better than the kernel does. Caching the same data twice wastes memory and adds a copy.

The same argument applies one level up. ZFS keeps its own ARC, which is separate from the page cache, so on a ZFS system you are budgeting two caches and you need to cap the ARC deliberately rather than letting it and the page cache fight over the same RAM. Virtual machines create the same shape of problem: the guest caches, the host caches, and the same block sits in memory twice. Hypervisor cache mode settings exist exactly to control which layer is allowed to cache.

## The rules I follow

Do not tune anything until you have a measurement showing which path is the problem. Read stalls and write stalls have different fixes and identical complaints from users.

Set dirty limits in bytes, not percentages, on any machine with a lot of memory. Size them to roughly one or two seconds of your storage's real write throughput.

Pick one caching layer per data path and turn the others down. Double caching is invisible until you are short on memory, and then it is the whole problem.

And leave the page cache alone otherwise. Dropping caches to make `free` look nicer is a way to make your server slower for the next several minutes and learn nothing.

## References

- [Linux kernel: virtual memory sysctl documentation](https://docs.kernel.org/admin-guide/sysctl/vm.html)
- [proc(5) manual page](https://man7.org/linux/man-pages/man5/proc.5.html)
- [open(2) manual page, including O_DIRECT](https://man7.org/linux/man-pages/man2/open.2.html)
- [vmstat(8) manual page](https://man7.org/linux/man-pages/man8/vmstat.8.html)
- [Page cache on Wikipedia](https://en.wikipedia.org/wiki/Page_cache)
