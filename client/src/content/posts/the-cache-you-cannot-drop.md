## Plenty of cache, and no memory

A machine has sixteen gigabytes. `free` says 1.2 GB of buff/cache, which
everybody knows is memory you get back for free. The database will not start,
the allocator is failing, and somebody runs `echo 3 >
/proc/sys/vm/drop_caches` to clear it out.

Nothing happens.

Here are two runs on that machine, each writing exactly one gibibyte, each
from the same clean baseline:

```
a real file on disk        MemFree     Cached      Shmem   MemAvailable
  clean                   14896456     212780      13164       14856712
  written                 13817736    1261688      12992       14840752
  after drop_caches       14901160     212360      12992       14860988

a file in tmpfs            MemFree     Cached      Shmem   MemAvailable
  clean                   14924388     212652      12992       14893824
  written                 13874728    1261392    1061396       13836480
  after drop_caches       13871756    1261232    1061568       13832524
```

Cached reads 1261 MB in both. In the first it is memory the kernel hands back
the instant anything asks, and the drop hands it back. In the second the same
command on the same machine frees nothing at all.

## What the column actually is

Before going further, the arithmetic, because two of its three terms surprise
people. Measured against one atomic copy of `/proc/meminfo` taken next to one
`free -k`:

```
free's buff/cache  =  Buffers + Cached + SReclaimable
                      8704 + 230000 + 24828  =  263532     free said 263532
free's shared      =  Shmem
                      12996                                free said 12996
```

The reclaimable slab is in there, which catches people reconciling by hand on
a box with a lot of dentries. And **Shmem is inside Cached**, which is the one
that matters: a tmpfs page is counted in Shmem, and in Cached, and in
buff/cache, all at once, in a column whose entire reputation is "you can have
this back."

## Why one of them comes back and the other does not

It is not about which column the page is in. It is about whether the kernel
has anywhere to put it.

A page of an ordinary file is a copy of something on a disk. Reclaiming it
means writing it out if it is dirty and then forgetting it, and the file is
still there to read it from again. A tmpfs page is not a copy of anything. The
file *is* the pages. There is no disk behind it, and on a machine with no swap
there is nowhere else either, so reclaiming it would mean losing the data, and
the kernel will not do that.

So `drop_caches` looks at the tmpfs pages, finds no backing store, and moves
on. This is not a bug or an oversight; it is the only correct thing it could
do. The bug is that `free` prints the two in one column.

## The baseline does not go either

Worth noticing in those rows: the drop took Cached from 1261688 to 212360, not
to zero. The 212 MB baseline survived.

That surprised me enough to go back and check, because my first model of this
had `drop_caches` clearing the lot. It does not, and the reason is that most
of a running system's baseline page cache is *mapped*: the text pages of
every binary and shared library currently executing. Mapped pages are not
droppable while something is using them.

So the honest rule is narrower than the folklore: `drop_caches` returns clean
unmapped page cache and the reclaimable slab. On an idle machine that is
almost everything. On a working one it is the part you just added.

## Deleting is not enough either

```
512 MiB in /dev/shm, then rm with one descriptor still open

  written                 Shmem 537096    df says 512M used
  unlinked, fd still open Shmem 537096    df says 512M used
  fd closed               Shmem  12992    df says 0
```

The ordinary unlink rule, applied to a filesystem where the space is RAM.
`lsof +L1` finds it, or walk `/proc/*/fd` looking for links marked
`(deleted)`. The memory comes back when the process does.

## No space left, with fourteen gigabytes free

```
mount -t tmpfs -o size=16M tmpfs small
writing 32 MiB       stopped at exactly 16777216 bytes
the error            errno 28 ENOSPC, "No space left on device"
MemFree at the time  14782776 kB
```

Fourteen gigabytes of unused memory, and the write fails with a message about
a device running out of space. The `size=` option is the only thing that
stopped it.

And the option people most often leave off:

```
mount -t tmpfs tmpfs somewhere    df says 7.9G
MemTotal                          16481980 kB
```

The default is half of RAM. That is a default, not a recommendation, and
nothing stops a runaway job walking all the way to it. Mount tmpfs with an
explicit size, chosen from what the box can spare.

One more, because the unit matters when the unit is memory: a one byte file on
tmpfs reports 4096 bytes used by both `df` and `du`. A million small cache
entries is four gigabytes.

## The field that was right all along

Look again at the MemAvailable column in the two runs. The real file did not
move it: 14856712 to 14840752, which is drift. The tmpfs file cost the whole
gibibyte: 14893824 to 13836480.

`MemAvailable` already knows everything this article is about. It has been in
`/proc/meminfo` since 2014, it is an estimate of how much you could allocate
without swapping, and it excludes tmpfs because tmpfs is not reclaimable. It
needs no interpretation and no subtraction.

## What to do

- **Alert on MemAvailable.** Not MemFree, which is low on every healthy
  machine by design. Not total minus buff/cache, which is the arithmetic this
  whole article is a warning about.
- **Read `shared` next to `buff/cache`.** Same line of output. `buff/cache`
  minus `shared` is roughly what a reclaim would get you; `shared` is what
  you have actually spent.
- **Do not run `drop_caches` to make room.** The kernel would have evicted
  exactly those pages the moment anything needed them, and you have thrown
  away a warm cache to watch a number change. It is a benchmarking tool.
- **Give every tmpfs an explicit `size=`**, and remember that `/dev/shm`,
  container scratch dirs, and anything under `/run` are all tmpfs.
- **When memory is missing and `free` says there is cache**, check
  `/proc/meminfo` for Shmem first. If Shmem is large, go and find which mount
  it is: `df -h -t tmpfs` lists every one of them and what it is holding.

## Sources

- [proc(5), on the fields in /proc/meminfo](https://man7.org/linux/man-pages/man5/proc.5.html)
- [tmpfs(5), on size=, the default of half of RAM, and what tmpfs is](https://man7.org/linux/man-pages/man5/tmpfs.5.html)
- [free(1), which documents its own columns](https://man7.org/linux/man-pages/man1/free.1.html)
- [The kernel commit that added MemAvailable, with the reasoning](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=34e431b0ae398fc54ea69ff85ec700722c9da773)
- [The kernel documentation on drop_caches and what it does not do](https://docs.kernel.org/admin-guide/sysctl/vm.html)

Every measurement here was taken on Linux 6.18.44 with 16481980 kB of RAM and
no swap. Swap changes the picture: with it, tmpfs pages are swappable, so they
are reclaimable after all, at the price of a page fault to disk. Nothing here
was measured with swap on, and cgroup v2's memory.stat, which charges tmpfs to
whichever cgroup faulted the page in rather than the one that wrote it, was
not measured at all.

The ten machines on [The cache you cannot drop](/pagecache) are the same
model, one question each.
