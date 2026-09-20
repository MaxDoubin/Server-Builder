## RSS did not move

You freed it. The batch is done, every record is gone, and `ps` still shows
the same resident size it showed at the peak. Somebody says the allocator
keeps memory and moves on, and that is true, and it is not an explanation,
because sometimes it does not.

Here is the same program twice. Twenty thousand kilobyte allocations, all of
them touched, then all of them freed. Resident size read out of
`/proc/self/statm`:

```
20000 x 1 kB allocated and touched      RSS  22092 kB
all 20000 freed                         RSS   1912 kB
```

Twenty megabytes, back to the kernel, from `free()` alone. No
`malloc_trim`, no allocator tuning, nothing.

Now the same program with one record still referenced, the last one allocated:

```
20000 x 1 kB allocated and touched      RSS  22088 kB
19999 freed, the last one held          RSS  22088 kB
```

Not one page. One kilobyte out of twenty megabytes decides whether twenty
megabytes comes back, and it is not the kilobyte that matters, it is where it
sits.

## The rule is about the top, not the total

glibc's heap is a region grown with `brk`, and `brk` moves at one end.
`free()` can shrink it only when the free space reaches that end, and it
only bothers when the free space there passes `M_TRIM_THRESHOLD`, which is
128 kB by default. Then it leaves `M_TOP_PAD` behind, which is also 128 kB.

Measured one size per process, with `M_MMAP_THRESHOLD` pinned high so
everything came from `brk`:

```
 128 kB freed at the top of the heap   RSS  1676 -> 1676    kept
 131 kB                                RSS  1672 -> 1672    kept
 132 kB                                RSS  1680 -> 1676    one page back
 136 kB                                RSS  1684 -> 1676    two pages
8192 kB                                RSS  9740 -> 1676    all of it
```

So when everything is freed, the chunks coalesce into one region that reaches
the top, the trim fires, and you get it all. When anything at all is still
live above the free space, the top chunk never grows and `free()` does
nothing. Sixteen bytes is enough:

```
8 MB allocated, freed with nothing above it     RSS  9812 -> 1748 kB
8 MB allocated, 16 bytes above it, then freed   RSS  9812 -> 9812 kB
```

## malloc_trim reaches the middle, and fragmentation is not what you think

`malloc_trim(0)` walks the arena's free chunks and calls `MADV_DONTNEED`
on whole free pages anywhere in it, not only at the top. So it can recover
what `free()` cannot.

How much it recovers is the interesting part. Same twenty thousand chunks,
same twenty megabytes, different survivors:

```
survivors                 after free()      after malloc_trim(0)
none                          1908 kB              1780 kB
every 100th  (200 kB live)   22084 kB              2788 kB
every 10th   (2 MB live)     22084 kB             11892 kB
every other  (10 MB live)    22084 kB             22084 kB
```

Read the last two rows next to each other. The run holding **two megabytes**
got ten megabytes back. The run holding **ten megabytes** got nothing, not one
page, and stayed at twenty two.

The page is the unit. A survivor pins the whole 4 kB page it sits in, and a
page is only released if nothing live is anywhere in it. Survivors every
hundredth chunk are 104 kB apart, so twenty five pages between each pair come
back. Survivors every other chunk are about two kilobytes apart, so no whole
page anywhere in that heap is free, and there is nothing to hand back.

**Fragmentation is not a quantity of live data. It is a spacing.** Two hundred
kilobytes of survivors cost a megabyte of resident memory here, a factor of
five, and that factor is the page rather than a leak.

## The same allocation, twice, behaving differently

Above `M_MMAP_THRESHOLD` (128 kB), glibc asks the kernel for a mapping of its
own instead of using the heap, and `free()` unmaps it immediately. That is
the behavior everybody remembers, and it is real. Three rounds of the same
ten megabyte allocation in one process:

```
round 1  allocated   RSS 11928 kB   mmapped 10489856  in 1 mapping
round 1  freed       RSS  1684 kB   mmapped        0
round 2  allocated   RSS 11924 kB   mmapped        0   from the heap
round 2  freed       RSS 11924 kB   nothing came back
round 3  allocated   RSS 11924 kB
round 3  freed       RSS 11924 kB
```

The same call. The same size. The same process. The first one maps and
unmaps; the second and third come out of the heap and stay.

glibc does this deliberately: freeing an mmapped chunk sets
`mmap_threshold` to that chunk's size, on the reasoning that a program
repeating an allocation should not pay for a mapping every time. The cost is
that it stops getting the memory back, and nothing announces the change.

Note the exact figures, because they matter. The mapping is 10489856 bytes,
the request rounded up to a page. The second request's chunk is 10485776
bytes, which is *under* the new threshold, so it goes to the heap. The
threshold is set from the mapping and compared against the chunk, and those
are different numbers.

## One allocation that switches the trim off for good

The adjustment moves `trim_threshold` too, to twice the new
`mmap_threshold`. Which means one large allocate-and-free, anywhere in the
process's life, can stop the automatic trim from ever firing again.

Measured: the identical twenty megabyte workload run twice in one process,
with one allocate-touch-free of the named size in between.

```
 1 MB in between    the second run's free() gave it back
 8 MB               gave it back
 9 MB               gave it back
10 MB               gave back NOTHING
11, 12, 13, 16 MB   nothing
30, 31 MB           nothing
32 MB               gave it back
33, 64 MB           gave it back
```

There is a **band**. Below it, twice the size is still smaller than your
working set, so the trim fires. Inside it, twice the size is larger than your
working set and the trim can never fire again. Above it, at
`DEFAULT_MMAP_THRESHOLD_MAX`, which is 32 MiB on 64-bit, glibc stops
adjusting at all and you are back to the defaults.

**A 33 MB allocation is cheaper here than a 20 MB one**, permanently, for
every unrelated allocation the process makes afterwards.

The lower edge, 10 MB, is a property of this workload: it is where twice the
size passes the 20 MB of free space at the top. Yours will be somewhere else.
The upper edge is a constant and yours will be the same.

## The heap does not shrink and the memory still comes back

Worth separating, because people argue about it using the same words for two
different things:

```
                              VmSize    VmRSS   VmData
at the start                    2564     1416       96
20000 x 1 kB allocated         23052    22152    20584
all but 200 freed              23052    22152    20584
after malloc_trim(0)           22944     2856    20476
the last 200 freed, trimmed     2740     1848      272
```

After the trim, `VmSize` is still 22.9 MB and `VmRSS` is 2.8 MB. The heap's
address space did not shrink, because the survivors are scattered through it
and `brk` only moves at the end. The pages came back anyway, through
`MADV_DONTNEED`, which discards anonymous pages outright. Both sentences are
true at once, about different lines of the same file.

## The mistake that decided what could be measured

The first RSS reader used `fopen` on `/proc/self/statm`. `fopen`
allocates a `BUFSIZ` stdio buffer and touches it, so every reading taken
*after* a `free()` came out 64 kB higher than the reading before it, on
every size, and the automatic trim looked as if it never happened at all.

The fix is one file descriptor opened before anything is measured and
`pread` into a static buffer, with nothing in between that can reach
`malloc`. It is obvious once you see it and it produced a page of confident
wrong readings first.

## What to do

- **Do not conclude "the allocator keeps memory" from RSS.** Call
  `malloc_trim(0)` and read it again. If RSS drops, glibc was holding pages
  it could return and nobody asked. If it does not, you have real
  fragmentation and no allocator call will help.
- **Trim at the seams.** After a batch, after a request, after a compaction:
  anywhere the live set is briefly small. That is the moment the free pages
  are contiguous and there is something to give back.
- **Call `mallopt(M_MMAP_THRESHOLD, n)` before your first large
  allocation** if you care about resident memory. The value barely matters;
  making the call at all sets `no_dyn_threshold` and stops glibc
  reconfiguring itself behind you.
- **Pool the long lived objects separately.** The survivors' *spacing* is what
  costs you, so allocate anything that outlives a request from its own arena
  and the rest of the heap comes back whole.
- **Watch VmRSS, not VmSize,** when you want to know what the machine is
  paying for. They diverge by twenty megabytes in the table above and neither
  of them is lying.

## Sources

- [mallopt(3), on M_MMAP_THRESHOLD, M_TRIM_THRESHOLD and M_TOP_PAD](https://man7.org/linux/man-pages/man3/mallopt.3.html)
- [malloc_trim(3)](https://man7.org/linux/man-pages/man3/malloc_trim.3.html)
- [mallinfo2(3), which is where the arena and mapping figures came from](https://man7.org/linux/man-pages/man3/mallinfo.3.html)
- [madvise(2), on what MADV_DONTNEED does to anonymous pages](https://man7.org/linux/man-pages/man2/madvise.2.html)
- [proc(5), on statm and the VmSize, VmRSS and VmData lines of status](https://man7.org/linux/man-pages/man5/proc.5.html)
- [The glibc manual on the malloc implementation](https://www.gnu.org/software/libc/manual/html_node/The-GNU-Allocator.html)

Every figure here was measured on Linux 6.18.44 with glibc 2.39 on x86-64,
4 kB pages, single threaded, built with `-O0`. Threads change it: a
per-thread arena is an mmapped heap and is returned on a different rule.
jemalloc, tcmalloc and musl are all different allocators with different
answers. Transparent huge pages change what a page means here, and none of
this was measured under real memory pressure, only against VmRSS.

The ten heaps on [The memory you freed and still hold](/malloctrim) are the
same model, one question each.
