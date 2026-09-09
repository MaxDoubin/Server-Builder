## The alert fires every night and the machine is fine

A 32 GiB application server, up eleven days. `free -h` says this:

```
               total        used        free      shared  buff/cache   available
Mem:          32.0Gi       2.6Gi       240Mi         0Ki      29.2Gi      29.1Gi
Swap:            0Ki         0Ki         0Ki
```

There is a monitoring rule on the free column and it has been paging every
night for a month. Somebody has been asked to size the replacement.

The machine has 29.1 GiB available and needs nothing. The free column was
always going to be small, because an operating system that leaves memory
unused is wasting it: the page cache grows until something needs the space
back, and on any server that has been up for a week the free column has gone
to approximately nothing by design.

The column that answers the question is four to the right, and it is not a
measurement.

## MemAvailable, in full

The kernel comment above `si_mem_available` in `mm/show_mem.c` calls it an
estimate of what userspace can allocate "without causing swapping or OOM". The
function is short enough to read in one go:

```c
available = global_zone_page_state(NR_FREE_PAGES) - totalreserve_pages;

pagecache = global_node_page_state(NR_ACTIVE_FILE) +
            global_node_page_state(NR_INACTIVE_FILE);
pagecache -= min(pagecache / 2, wmark_low);
available += pagecache;

reclaimable = global_node_page_state_pages(NR_SLAB_RECLAIMABLE_B) +
              global_node_page_state(NR_KERNEL_MISC_RECLAIMABLE);
reclaimable -= min(reclaimable / 2, wmark_low);
available += reclaimable;

if (available < 0)
        available = 0;
```

Three additions and two subtractions. Free, less the reserves the kernel will
not hand out. Plus the page cache, less what has to stay. Plus reclaimable
slab, less the same.

It was added in 2014, in commit 34e431b0ae39, precisely because everybody was
computing free plus buffers plus cache themselves and getting it wrong.

## The subtraction is the interesting half

`min(pagecache / 2, wmark_low)`. Which arm wins changes the whole character of
the answer, and it changes with the size of the machine.

On the server above, the page cache is 28 GiB and the low watermarks total
about 180 MiB. Half the cache is 14 GiB. The watermark is much smaller, so the
watermark is what gets subtracted, and **nearly all of the cache counts as
available**: 27.8 of 28 GiB.

On a 4 GiB host that has just booted with 300 MiB of cache, half the cache is
150 MiB and the watermark is 180 MiB. Now half is smaller, so **half the cache
is kept back**.

The rule everybody remembers, that about half the page cache is available, is
the second case. Most servers are the first. If you are going to reconstruct
this number by hand rather than read it, the question to ask first is which
arm applies, and on anything with more than a gigabyte or so of cache it is
the watermark and the answer is nearly all of it.

## Where the estimate is wrong

It is an estimate. Two situations make it optimistic and it does not know
about either.

**tmpfs.** Shared memory and tmpfs pages live on the file LRU lists, which is
exactly where `si_mem_available` looks for the page cache, so they are counted
as reclaimable. They are the one kind of page on those lists that cannot be
dropped: there is no file behind them to read back from, so the only way out
is swap.

A 16 GiB build host with 6 GiB of tmpfs and no swap reports 9.0 GiB available.
About 5.9 GiB of that is the tmpfs. A step needing 5 GiB, comfortably inside
what the kernel is offering, does not fit. Add 8 GiB of swap and MemAvailable
does not change at all, because swap is not memory and the estimate does not
count it, but the same step now succeeds: the tmpfs pages have somewhere to
go. Swap on a machine with plenty of memory is not there to be used, it is
there so that the pages which cannot be dropped can at least be moved.

Subtract `Shmem` on any host with a large tmpfs and no swap. It is in
`/proc/meminfo`, and it is the `shared` column of `free -h`, which is the one
column of that output nobody has ever read.

**Dirty pages.** A dirty page is counted as available, and that is correct: it
will become available. It becomes available at the speed of the device under
it. On a host with 8 GiB dirty and 23.2 GiB available, a 20 GiB allocation
succeeds and about 15 GiB of it arrives immediately while the rest waits for
writeback. The symptom is a stall, which gets diagnosed as the disk, which is
where it is happening and not why.

`si_mem_available` does not subtract `Dirty` and should not: the estimate is
about the destination, not the journey. But if you are making a latency
promise, read `Dirty` and `Writeback` next to it.

## The used column is a residue

`free` computes used as total minus free minus buff/cache. Nothing tracks it
and nothing chose it: it is what is left over after the cache, so it moves
whenever the cache moves, which is constantly.

Two readings of the same server ten minutes apart, nothing deployed and no
process started or stopped, and the used column goes from 2.6 GiB to 8.5 GiB.
What happened is that something read a large file and displaced 6 GiB of cache.
Not one byte of anonymous memory was allocated. It is the column people
screenshot and it has the least meaning in the output.

For what programs are actually holding:

```
$ grep -E 'AnonPages|Mapped' /proc/meminfo
```

or the sum of `Pss` across `/proc/*/smaps_rollup`. Those move when something
allocates and stay still when the cache churns.

## What a machine in trouble actually looks like

Not a small free column, because the healthy machine had that too.

The signal is a **collapsed page cache**. On an 8 GiB host where the cache has
been squeezed down to 260 MiB, the kernel has already been reclaiming hard and
there is nothing left to reclaim. MemAvailable reads 216 MiB and says so
directly. A 2 GiB allocation there will swap if it can and be killed if it
cannot.

So the thing to graph is the cache size over hours. A shrinking page cache is
the early warning that an alert on MemFree can never give you, because MemFree
looked exactly the same on the healthy machine.

## One more shape, which surprises people

MemAvailable can be *lower* than MemFree.

A 2 GiB instance that has just booted has 1.5 GiB free and no page cache at
all. The first line of the estimate is free minus `totalreserve_pages`, and
there is no cache to add back, so available comes out below free. That is the
estimate being honest: the reserves exist for allocations that cannot fail and
they will not be handed to userspace.

It is the one shape where the free column looks generous and the available
column is the smaller and more accurate number, which is the opposite of the
situation everybody is warned about.

## Reading it on a real machine

```
$ grep -E 'MemTotal|MemFree|MemAvailable|Shmem|Dirty|SReclaimable' /proc/meminfo
```

Available is the number to alert on. Free is the one that was always going to
be small.

```
$ cat /proc/pressure/memory
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
full avg10=0.00 avg60=0.00 avg300=0.00 total=0
```

Pressure stall information measures time actually spent stalled on memory
rather than predicting whether reclaim might cost something. If you are
building an admission controller, this is the input, and MemAvailable is not:
it is a good number to alert on and a poor one to make automatic decisions
from at the edge of the machine, because it does not know what the cached data
is worth or what is about to start.

Then three questions:

1. Is the page cache shrinking? That is pressure. A small free column on its
   own is not.
2. Is there a large `Shmem` and no swap? Subtract it before believing the
   estimate.
3. Is `Dirty` large? Then the memory is available and not immediately, and the
   thing you will see is a stall.

And take the alert off MemFree. It was never going to tell you anything, and
after a month of nightly pages the useful signal from that channel is zero.

You can work through ten of these, including the one where the estimate is
wrong by six gigabytes and the one where available is less than free, at
[two hundred megabytes free](/free).

## References

- [mm/show_mem.c, si_mem_available in full](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/show_mem.c)
- [The commit that added MemAvailable, and why](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=34e431b0ae398fc54ea69ff85ec700722c9da773)
- [proc_meminfo(5), on the fields themselves](https://man7.org/linux/man-pages/man5/proc_meminfo.5.html)
- [Documentation/filesystems/proc.rst, on MemAvailable, Dirty and the rest](https://docs.kernel.org/filesystems/proc.html)
