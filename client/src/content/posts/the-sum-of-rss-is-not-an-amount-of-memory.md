## The dashboard said 258 and the machine held 64

A preforking server loads a model into memory, touches all of it, and forks
three workers. Four processes, one copy of the data. Here is what `ps` says
about them:

```
  PID    RSS    PSS COMMAND
 3295  66948  16492 hold
 3297  65828  16435 hold
 3298  65828  16435 hold
 3299  65828  16435 hold

sum of RSS   264432 kB   258.2 MiB
sum of PSS    65794 kB    64.3 MiB
```

There is 64 MiB of memory here. Not 258. The mapping was created once, touched
once, and inherited three times.

Every one of those RSS rows is true. Each of those processes really can reach
64 MiB of resident pages, and if you want to know how much memory that one
process has in front of it, 65828 kB is the honest answer. The number goes
wrong at the instant you add two of them together, because the same page frame
is in both rows at full price, and there is no way to tell from either row that
it is the same frame.

## The divisor

PSS answers the question people actually mean. It is the same walk over the
same page tables, except that each page is divided by the number of processes
mapping it before it is added in. A page in one process is a page. A page in
four is a quarter of a page, four times.

The consequence is the only thing worth remembering about it: the sum of PSS
across every process on a machine is the number of page frames in use. RSS has
no such property and was never meant to.

```
$ grep -H Pss: /proc/[0-9]*/smaps_rollup 2>/dev/null | awk '{s+=$2} END {print s " kB"}'
```

## A read costs nothing and a write costs a page

The same four processes, with each child touching 16 MiB of the mapping after
the fork:

```
what each child did          RSS each   PSS each   anonymous pages
nothing                         65536      16384             65536
read 16 MiB                     65536      16384             65536
wrote 16 MiB                    65536      28672            114688
```

The reading row is identical to the idle row, down to the kilobyte. This
surprises people who have half-remembered copy on write as "the page is faulted
in on first access": the child was not going to fault anything, because
`fork` copied the parent's page tables and the child already had a valid entry
for every page of that mapping. There was nothing left to do.

The writing row is the only one that costs anything, and it costs 48 MiB:
16 MiB per child, three children, three separate copies. Three children writing
the *same* range do not share a copy. A copy is private to the process that
made it, which is the whole point of the flag.

And RSS says 65536 in all three rows. It cannot tell them apart.

## Who pays is not how much

Change nothing except which pages the children write:

```
three children write the same 16 MiB    parent 28672   child 28672   anon 114688
three children write 16 MiB each        parent 20479   child 31402   anon 114688
```

The totals are identical. The 48 MiB of copies is the same 48 MiB. What moved
is the charge, because the number of processes sharing each frame moved: in the
first arrangement the parent is alone on the range that got copied, and in the
second it shares each child's range with the two children that did not write it.

This is worth sitting with, because it is the shape of most PSS confusion in
production. PSS is not a property of a process. It is a property of a process
*and everybody else*. A parent that executes no instructions at all can watch
its own PSS step up because two children stopped sharing with it.

## MAP_SHARED forks differently

Map the same 64 MiB with `MAP_SHARED | MAP_ANONYMOUS` instead, and the fork
behaves in a way that looks broken until you know why:

```
children touched nothing     parent 65536 /  65536    child     0 /    0
children read 16 MiB each    parent 65536 /  53248    child 16384 / 4096
```

A child has an RSS of zero for a region it maps in full. Linux does not copy
page tables for a VMA that a page fault can refill correctly, and a shared
anonymous mapping is one of those:

```c
/*
 * Don't copy ptes where a page fault will fill them correctly.  Fork
 * becomes much lighter when there are big shared or private readonly
 * mappings. The tradeoff is that copy_page_range is more efficient
 * than faulting.
 */
return false;
```

So on a shared mapping, a child's RSS is a record of what it has touched since
the fork, and not of what it can reach. On a private one it is the opposite.
Same tool, same column, two different meanings, decided by a flag that does not
appear in `ps` output.

The second row is the other half of it. Forty eight of those sixty four
megabytes have exactly one process mapping them, so the parent is charged for
them in full, and the word "shared" turns out to describe the flags rather than
the accounting.

## Killing a process raises everybody else's

Four processes sharing 64 MiB. Kill one. Allocate nothing, free nothing:

```
before   16384 kB each, four of them
after    21845 kB each, three of them
```

Nothing happened to the memory. The divisor went from four to three.

If you alert on per process PSS, this fires on every rolling restart, by
construction, on the processes that are staying. The fix is to alert on the sum
across the group, which does not move here, or on the cgroup, which is a third
accounting again and divides nothing at all: it charges a page to whichever
cgroup touched it first and keeps charging that one until the page is freed.

## The kilobyte that goes missing

One detail for anyone who checks the arithmetic and finds it a kilobyte short.
The kernel accumulates PSS in fixed point with twelve fraction bits, and the
division truncates:

```c
mss->pss += (PAGE_SIZE << PSS_SHIFT) / mapcount;
```

A page shared three ways is credited `floor(16777216 / 3)` rather than a third
of a page, losing a unit every time. Twelve thousand two hundred and eighty
eight such pages lose enough to fall one kilobyte short, which is why the
measurement above reads 20479 where the exact division gives 20480. It is
always short and never over, which is the direction you want in a capacity
number.

There is a larger version of the same caveat, and whether you have it depends
on how the kernel was built. The documentation is blunt about it: "Some kernel
configurations do not track the precise number of times a page part of a larger
allocation is mapped. In this case, when calculating the PSS, the average
number of mappings per page in this larger allocation might be used as an
approximation for the number of mappings of a page. The PSS calculation will be
imprecise in this case." So on a host using large folios, read PSS as close
rather than exact.

## What to do

Add up PSS, never RSS. `ps -o pid,rss,pss` gives you both columns side by side
and makes the gap obvious; `/proc/PID/smaps_rollup` is the cheap way to get
the same figure without walking every mapping.

Size a preforking server as one copy of the shared image plus the per worker
dirty pages, which is the same arithmetic the PSS column does for you. A
gigabyte of lookup table behind eight workers that each dirty 16 MiB is
1136 MiB, not eight gigabytes, and a machine that fits gets called a machine
that does not on the strength of a column that was never meant to be summed.

Load large read only structures *before* you fork. Reading them afterwards is
free, measurably and exactly free, and it is one of the few places in systems
work where the obvious optimization is also the real one.

## Sources

- [proc(5), on smaps, smaps_rollup and what Pss means](https://man7.org/linux/man-pages/man5/proc.5.html)
- [The kernel's proc filesystem documentation, on the smaps fields](https://docs.kernel.org/filesystems/proc.html)
- [fork(2), on what a child inherits](https://man7.org/linux/man-pages/man2/fork.2.html)
- [mmap(2), on MAP_PRIVATE against MAP_SHARED](https://man7.org/linux/man-pages/man2/mmap.2.html)
- [ps(1), which has had a pss column for years and nobody uses it](https://man7.org/linux/man-pages/man1/ps.1.html)
- [cgroups(7), on memory.current, which is a third accounting again](https://man7.org/linux/man-pages/man7/cgroups.7.html)

Every measurement here was taken on Linux 6.18.44, with a C program that maps
one region, touches every page of it, forks, and reads Rss and Pss for that one
mapping out of /proc/self/smaps in each process. Swap, file backed mappings,
huge pages and KSM are all outside what was measured, and each of them
complicates the picture in its own direction.

The ten forks on [Four processes, one copy](/pss) are the same model, one
question each.
