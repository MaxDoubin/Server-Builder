## Two numbers that look like they cannot both be true

A service has a p99 of 400 milliseconds. Its CPU utilisation graph, against
its own limit, sits at 30 percent all day. Somebody has already concluded the
problem is not CPU, because the container is nowhere near its limit, and the
investigation has moved on to the database.

Both numbers are correct and the conclusion does not follow. The container
spent most of that second stopped, on a node with idle cores, and no
utilisation graph in existence can show you that.

The reason is one sentence from
`Documentation/scheduler/sched-bwc.rst`: within each given period, a task
group is allocated up to quota microseconds of CPU time, and once all quota
has been assigned, additional requests result in threads being throttled.

A quota per period is not a rate. That is the whole article.

## The unit conversion nobody does

Quota is measured in CPU time. A period is measured in wall clock time. They
are different units, and threads are the exchange rate between them.

```
$ cat /sys/fs/cgroup/system.slice/app.service/cpu.max
100000 100000
```

That is Kubernetes `limits.cpu: 1`: a quota of 100 milliseconds of CPU per
100 millisecond period. Read as a rate it says "one core, continuously".

Now give the container four runnable threads. They run at the same time, so
they spend four milliseconds of quota per millisecond of wall clock. The
100ms of quota is gone 25 milliseconds into the period, and every thread in
the group is then stopped until the boundary.

The container runs for 25ms and is stopped for 75ms, ten times a second,
forever. Average utilisation over that second is exactly 100 percent of the
limit, which at least is honest. The version that is not honest is what
happens when the work is intermittent.

## Why the graph cannot see it

Take a batch that needs 300 milliseconds of CPU and runs once a second, on
eight threads, under the same one CPU limit.

Eight threads drain quota at eight. The first period gives it 100ms of quota,
which is gone in 12.5ms, and it is stopped for 87.5. Same again the next
period. It finishes 12.5ms into the third. Work that eight threads should
have done in 37.5 milliseconds took until 212.5.

And the utilisation graph, over that second, reads 30 percent. Three hundred
milliseconds of CPU used out of a thousand available. It is the correct
average and it is useless, because the quota is enforced per period and the
period is one hundred milliseconds. Any averaging window longer than that,
which is every window on every dashboard, cannot represent throttling at all.
You are not looking at a low-resolution version of the truth. You are looking
at a quantity that does not contain it.

The metric that does contain it is next to the one you are reading:

```
$ cat /sys/fs/cgroup/.../cpu.stat
usage_usec 300000
nr_periods 10
nr_throttled 2
throttled_usec 175000
```

Two of ten periods, 175 milliseconds spent stopped. Alert on `nr_throttled`
and stop alerting on utilisation.

## The thread count is the multiplier, and the node decides it

Since threads are the exchange rate, the number of them sets how fast the
quota drains, and the interesting part is what caps it.

A JVM with a forty thread pool on half a CPU of quota, on a thirty two core
node: thirty two of the forty can actually be on a processor, so the drain
rate is thirty two, and 50ms of quota lasts **1.563 milliseconds**. The
container runs for a millisecond and a half and is stopped for 98.4, ten
times a second.

Take two hundred threads instead of forty and nothing changes, because the
rate was never the thread count, it was `min(threads, cores)`. Move the same
pod to a four core node and the drain rate becomes four, and the container now
runs for 25ms per period instead of 1.5.

Which means the same deployment, unchanged, has a different p99 on a different
node pool. Bigger nodes make throttling worse for a threaded application,
because more of its threads can run at once and spend the quota faster. That
is a sentence worth reading twice before the next capacity upgrade.

The fix is to size the runtime's parallelism from the limit rather than from
the machine. `GOMAXPROCS`, or automaxprocs. `-XX:ActiveProcessorCount`, though
a JVM newer than 8u191 reads the cgroup limit itself for
`availableProcessors`. Anything reading `nproc` directly, and there is always
something reading `nproc` directly.

## The period matters as much as the ratio

Two containers, both configured to twenty percent of a CPU by two different
people:

```
20000 100000     # 20ms every 100ms
10000 50000      # 10ms every 50ms
```

Same fraction, same total CPU per second, same utilisation graph. With four
runnable threads, the first runs for 5ms and stops for 95, ten times a second.
The second runs for 2.5ms and stops for 47.5, twenty times a second.

Total time stopped is 950 milliseconds either way. What differs is the longest
single stall, and for anything with a request in flight that is the number
that matters: 95 milliseconds of dead time is a p99 all by itself, and 47.5 is
half of one.

Shorter periods for latency sensitive work, longer periods for batch, which
buys burst capacity instead. `cpu.cfs_period_us` accepts 1ms to 1s. Kubernetes
does not expose it, which is why essentially everything in a cluster is on the
100 millisecond default whether that suits it or not, and why so many p99s in
so many clusters sit suspiciously close to 100 milliseconds.

That, incidentally, is the shape to look for. Throttling does not slow every
request down by the same proportion. It adds a stall whose length depends only
on when in the period the request arrived, so it puts a shoulder in the
latency distribution at roughly the period length. A p99 hovering near 100ms,
or near a multiple of it, is worth suspecting before you profile anything.

## Two things throttling is not

**Being at 100 percent of the limit.** A container with two threads and a limit
of 2 CPUs sits at 100 percent of its quota permanently and is never throttled
once, because two threads cannot spend two CPUs of quota in a 100 millisecond
period however hard they try. It runs flat out to each boundary and the next
period's quota arrives exactly when it needs it. An alert on utilisation fires
here and there is nothing at all to fix.

**Something fewer threads always fixes.** Take one request needing 200ms of
CPU under a one CPU limit. On four threads it spends the first period's quota
in 25ms, waits 75, spends the second period's quota in another 25, and
finishes at 125 milliseconds, having been throttled once. Single threaded it
uses the whole 100ms of each period, is never throttled at all, and finishes
at 200.

The single threaded version has a better throttling metric and is 60 percent
slower. Being throttled is not the same as being slow, and `nr_throttled` is a
number to explain latency with, not a number to minimize.

## What burst actually buys

`cpu.max.burst`, in the kernel since 5.14, lets a group bank quota it did not
use, up to a cap, and spend it later.

A service ticking over at 20ms of CPU per period banks 80 milliseconds each
time. Four quiet periods and a 200ms burst cap later, a request needing 250
milliseconds of CPU arrives and finds 300 available in that single period. It
runs straight through: no stall, and it finishes at 431ms against 606ms for
the same workload with burst off.

The average utilisation is 41 percent in both cases, which is the same number
failing to see the same thing for the third time in this article.

Burst is not free. A group bursting is interference for everything else on the
node, bounded by the burst value, which the documentation is explicit about.
But for request serving with a spiky profile and an average well under the
limit, which describes most request serving, it is close to free.

## Two things I got wrong writing this down

I built a model of the enforcement loop to generate the exercises, and it was
wrong twice in ways worth repeating.

The first: I treated a group that spends its entire quota as throttled. It is
not, necessarily. A group whose quota happens to equal what its threads can
physically spend in one period runs flat out to the boundary and is never
stopped, because the next period arrives exactly as it needs it. Spending
everything and being stopped are different events, and only the second one
appears in `nr_throttled`.

The second was a boundary. Periods are half open intervals, so work arriving
exactly on a boundary belongs to the period starting there. I wrote the
"has all the work arrived yet" test inclusively and the period folding
exclusively, and the model cheerfully reported a request as complete at 302
milliseconds when its last piece of work arrived at 400. It finished before it
started, and nothing in the model complained, because the two halves of the
rule were written in different places and only one of them was ever read at a
time.

## Reading it on a real cluster

```
$ cat /sys/fs/cgroup/<path>/cpu.stat
```

`nr_throttled` over `nr_periods` is the ratio. `throttled_usec` is the wall
clock time the group spent stopped. Neither is on any CPU graph.

```
$ cat /sys/fs/cgroup/<path>/cpu.max
```

Quota and period, in microseconds, in that order. Divide the first by the
second to get the number Kubernetes calls the limit.

Then three questions, in order:

1. How many threads does the runtime think it has? Compare against the limit,
   not against the node.
2. What is the period, and how does it compare to your p99? A shoulder near
   the period length is the signature.
3. Is the average well under the limit? If so, `cpu.max.burst` will probably
   remove most of the stalls without changing the limit at all.

And if `nr_throttled` has been zero all along, the limit is not why the thing
is slow, and you have saved yourself an afternoon.

You can work through ten of these, including the one at thirty percent and the
one that goes faster with more threads, at
[thirty percent, and stalling](/throttle).

## References

- [Documentation/scheduler/sched-bwc.rst, on quota, period, burst and cpu.stat](https://docs.kernel.org/scheduler/sched-bwc.html)
- [Documentation/admin-guide/cgroup-v2.rst, on the cpu controller's cpu.max and cpu.stat](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Kubernetes, on what limits.cpu is converted into](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [cgroups(7), for the hierarchy the limits are written in](https://man7.org/linux/man-pages/man7/cgroups.7.html)
