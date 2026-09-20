## A limit that is half the machine

Here is `/proc/meminfo` on an untuned 15.72 GiB host with no swap:

```
MemTotal      16481980 kB
SwapTotal            0 kB
CommitLimit    8240988 kB
Committed_AS   4006572 kB
```

`CommitLimit` is half of `MemTotal`. Nothing is misconfigured. The formula is
swap plus `vm.overcommit_ratio` percent of RAM, the ratio defaults to 50, and
there is no swap to add.

That is fine right up until somebody reads those four lines as a capacity
problem, or sets `vm.overcommit_memory` to 2 and turns the smaller number into
a wall.

## The ratio applies to RAM alone

Walking `vm.overcommit_ratio` across five settings on that host and reading
`CommitLimit` back each time:

```
ratio  25 ->  4120492 kB      ratio 100 -> 16481980 kB
ratio  50 ->  8240988 kB      ratio 150 -> 24722968 kB
ratio  80 -> 13185584 kB
```

Two things fall out of the last row. At 150 the limit is half again the
machine's memory, which means `CommitLimit` is not a statement about the
hardware at all. It is an accounting policy, and the kernel will happily set
it above what exists.

And swap is not a percentage. It is added whole:

```
CommitLimit = SwapTotal + MemTotal * overcommit_ratio / 100
```

so an 8 GiB swap file raises the limit by 8 GiB, not by half of it. On a
machine that needs strict accounting, adding swap is the cheapest way to make
the limit survivable, and a machine with no swap has the tightest limit it can
have.

## The arithmetic is done in pages

`vm_commit_limit()` works in page counts, not kilobytes. It floors the page
count *before* converting:

```
16481980 kB  is  4120495 pages
4120495 * 50 / 100  floors to  2060247 pages
2060247 pages  is  8240988 kB
```

Write the same formula in kilobytes and you get 8240990. Two kilobytes, which
is close enough to look like rounding noise in a spreadsheet and wrong in
every capacity script that has ever been written from the documentation. I got
this wrong myself the first time, and only caught it because the measured
numbers disagreed with my own model by exactly the amount a floor loses.

## In the default mode, nothing reads it

`vm.overcommit_memory` has three settings, and the default is not the strict
one:

- **0, heuristic.** The default. Refuses a single allocation that is wild on
  its own terms, and never looks at the running total.
- **1, always.** Refuses nothing. This is what a database or a cache asks for,
  because forking a large process reserves a copy of an address space that
  will never be written, and refusing that reservation is the wrong answer.
- **2, strict.** Compares `Committed_AS` plus the new request against
  `CommitLimit`, and refuses when it does not fit.

In mode 0 `Committed_AS` can sit above `CommitLimit` for weeks on a perfectly
healthy machine. That is not a warning sign. It is the heuristic doing exactly
what it says.

Which means a dashboard plotting `Committed_AS` against `CommitLimit` on a
mode 0 fleet is plotting a ratio nothing enforces.

## And then somebody sets it to 2

The usual reason is to stop the out of memory killer. On the host above,
turning on strict accounting leaves this:

```
CommitLimit    8240988 kB     7.86 GiB, the wall
Committed_AS   4006572 kB     3.82 GiB reserved
headroom       4234416 kB     4.04 GiB before the wall
MemAvailable  14596178 kB    13.92 GiB actually free
```

A worker asking for 5 GiB does not start. Nothing is broken and nothing is
short. Strict mode compares reservations against the limit, and free memory is
not one of the terms.

Raising the ratio to 100 moves the wall to the size of the machine and no
further, and reservations are counted whether or not the pages behind them
were ever touched, so the wall still arrives before the memory does.

## Committed_AS is not memory in use

Worth stating on its own, because it is the source of most of the confusion:

- `Committed_AS` is the sum of what processes have **reserved**. It includes
  pages never touched, it includes copy on write pages counted once per
  mapping, and it does not fall when memory is reclaimed.
- `MemAvailable` is an estimate of what a **new** process could actually use,
  page cache included.

On the host above those are 24.3 percent and 88.6 percent of memory at the
same instant. They are not two measurements of one thing, and either one
exceeding the other is ordinary.

The same figure is also two different percentages depending on the
denominator. `Committed_AS` there is 48.6 percent of `CommitLimit` and 24.3
percent of `MemTotal`. A graph labelled "committed memory" without saying
which is showing a number that is double or half the other one.

## Strict mode does not retire the killer

This is the part that makes mode 2 a bad answer to the question people ask it.

The killer runs when physical memory is exhausted. Strict accounting governs
*promises*, and the two come apart in at least three ways: reservations are
counted rather than pages touched, page cache and shared pages are not in
`Committed_AS` at all, and a ratio above 100 hands out more than exists.

Mode 2 changes when an allocation is refused. It does not change what happens
when the pages are finally written to.

## What to actually do

1. **Leave the mode at 0** unless you have a specific reason. It is the
   default because it is right for most workloads.
2. **If a database or cache vendor asks for mode 1, give it to them.** It is
   not recklessness; it is what forking a large process requires.
3. **If you genuinely want strict accounting, add swap or raise the ratio
   first.** Turning on mode 2 with the ratio at 50 and no swap halves the
   machine, and you will find out at the worst moment.
4. **Alert on `MemAvailable`,** not on `Committed_AS` against `CommitLimit`.
   One of those means something on every host you have.
5. **If you want the killer to stop taking a particular process,** that is
   `oom_score_adj`, and it is a different mechanism entirely.

## Sources

- [Documentation/mm/overcommit-accounting.rst](https://docs.kernel.org/mm/overcommit-accounting.html)
- [Documentation/admin-guide/sysctl/vm.rst, on overcommit_memory, overcommit_ratio and overcommit_kbytes](https://docs.kernel.org/admin-guide/sysctl/vm.html)
- [mm/util.c, where vm_commit_limit computes the page count](https://elixir.bootlin.com/linux/latest/source/mm/util.c)
- [proc(5), on the meminfo fields](https://man7.org/linux/man-pages/man5/proc.5.html)

Every measurement here was taken on Linux 6.18.44 with 15.72 GiB of memory and
no swap. `vm.overcommit_ratio` was walked and restored; the mode was never
changed, because putting a live machine into strict accounting to watch it
refuse things is not a measurement worth taking, so the refusals described
here are computed from the rule rather than observed.

The ten machines on [Half a machine](/overcommit) are the same model, one
question each.
