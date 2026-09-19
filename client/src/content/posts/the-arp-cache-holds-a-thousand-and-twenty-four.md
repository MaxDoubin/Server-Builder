## A segment that worked for two years, until everything rebooted at once

One flat 10.20.0.0/22 on a campus floor. About 900 devices, dual stack, in
production for two years with no complaints. A switch stack is replaced on a
Saturday, everything reboots, and on Monday some machines cannot reach some
other machines. Not all of them, and not the same ones twice.

The switches are fine. Nothing is saturated. The thing that broke is a kernel
table nobody sized, because almost nobody knows it has a size:

```
$ sysctl -a | grep neigh.default.gc_thresh
net.ipv4.neigh.default.gc_thresh1 = 128
net.ipv4.neigh.default.gc_thresh2 = 512
net.ipv4.neigh.default.gc_thresh3 = 1024
net.ipv6.neigh.default.gc_thresh1 = 128
net.ipv6.neigh.default.gc_thresh2 = 512
net.ipv6.neigh.default.gc_thresh3 = 1024
```

Those are the shipped defaults, in `net/ipv4/arp.c` and `net/ipv6/ndisc.c`,
and they have not moved in a very long time. 900 hosts on IPv4 is 900 entries,
which fits. The same 900 hosts on IPv6 is at least 1800, which does not.

## Three thresholds, three different jobs

The usual mental model is that `gc_thresh3` is the size of the table and the
other two are warnings on the way there. That is wrong about all three.

**`gc_thresh1` is a floor on the collector, not a floor on the table.** In
`neigh_periodic_work()`:

```c
if (atomic_read(&tbl->entries) < READ_ONCE(tbl->gc_thresh1))
        goto out;
```

Below 128 entries the periodic collector returns without walking anything, so
a small segment's stale entries simply sit there. That is harmless on a small
segment and it matters on a large one, because leaving `gc_thresh1` at 128
while raising `gc_thresh3` to 16384 tells the collector to keep working on a
table it can barely dent.

**`gc_thresh2` is the target of a forced collection, not a limit.** In
`neigh_forced_gc()`:

```c
int max_clean = atomic_read(&tbl->gc_entries) -
                READ_ONCE(tbl->gc_thresh2);
u64 tmax = ktime_get_ns() + NSEC_PER_MSEC;
unsigned long tref = jiffies - 5 * HZ;
```

It tries to get back down to `gc_thresh2`, it has one millisecond to do it,
and it may only take entries untouched for five seconds. Nothing about
crossing this threshold is an error and nothing is logged, so a table that
lives permanently above it is doing extra work on every new neighbor with no
indication anywhere.

**`gc_thresh3` is the hard limit, and it is exact.** In `neigh_alloc()`:

```c
entries = atomic_inc_return(&tbl->gc_entries) - 1;
gc_thresh3 = READ_ONCE(tbl->gc_thresh3);
if (entries >= gc_thresh3 ||
    (entries >= READ_ONCE(tbl->gc_thresh2) &&
     time_after(now, READ_ONCE(tbl->last_flush) + 5 * HZ))) {
        if (!neigh_forced_gc(tbl) && entries >= gc_thresh3) {
                net_info_ratelimited("%s: neighbor table overflow!\n",
                                     tbl->id);
```

`entries` is read before this allocation's own increment, so a table holding
exactly 1024 refuses the 1025th.

## The condition that is actually two conditions

Read that inner `if` again, because it is the part that decides which networks
break and which ones merely creak.

Being at the hard limit is not sufficient. The kernel first calls
`neigh_forced_gc()`, and only when that returns false, meaning it freed
nothing, does the allocation fail. And a forced collection may only take
entries that have been untouched for five seconds.

So the same table with the same number of entries behaves in two completely
different ways depending on how those entries arrived:

- **Accumulated over an afternoon.** Plenty of entries are older than five
  seconds. Every allocation past the limit evicts one to admit one, forever.
  Nothing fails. Nothing is logged. The only symptom is that talking to a
  machine you have not talked to recently costs an extra round trip.
- **Arrived inside five seconds**, because the floor just came back from a
  power cut. Nothing is old enough to reclaim, the collection frees nothing,
  and the allocation is refused.

That is why this failure follows maintenance windows, power events and
scanners, and why the segment is fine again an hour later, and why nobody can
reproduce it on Tuesday.

## Why IPv6 costs more than twice as much

A host has one IPv4 address on the segment and one entry in `arp_cache`.

The same host has a link local address, at least one global address, and one
entry per address in `ndisc_cache`. Turn on privacy extensions and it has a
new temporary address every day, each of which is resolved and cached
separately while it is in use. A host that is also doing Duplicate Address
Detection and talking to a multicast group adds more.

So the ratio is not one to one, and it is not reliably one to two either. It
is one to at least two and occasionally more, against a table with identical
defaults to the IPv4 one. The practical consequence is that a dual stack
segment hits its IPv6 limit at roughly half the host count where it would hit
its IPv4 limit, and since nothing about IPv6 is usually monitored, it fails
first and silently.

## Things that look like fixes and are not

**Adding static entries.** Somebody adds `ip neigh add ... nud permanent` for
the forty machines that matter. Those forty will always resolve, because
`NUD_PERMANENT` sets `exempt_from_gc` and `neigh_alloc` jumps straight past
the counter for them. They are invisible to every threshold, which means they
also free nothing, and the other thousand hosts still fail intermittently.

**Raising `gc_thresh3` alone.** The overflow messages stop, which is real
progress, and the table now sits permanently above `gc_thresh2` with a forced
collection attempted on every allocation. The failure became a cost, and the
cost is invisible. Raise all three and keep their shape.

**Sizing to the number you measured.** 1800 entries does not mean
`gc_thresh3` of 1800. The moments a table is asked for more than it holds are
exactly the unusual ones: a scan, a renumber, a broadcast storm, everything
rebooting. Twice the steady count is the usual guidance and it is cheap, since
an entry is a few hundred bytes and the difference between 1800 and 4096 is
well under a megabyte.

## The scanner that took itself down

A vulnerability scanner on the same segment, pointed at the /22 it lives in.
400 machines answer. The scan touches all 1022 usable addresses.

An entry is created when resolution *starts*, not when it succeeds, so every
address gets one in the INCOMPLETE state while the ARP request goes out, and
the 622 with nothing behind them hold theirs until they are reclaimed. That is
1022 entries in a few seconds, against a hard limit of 1024.

Two entries of headroom. The scan does not quite take the host down by itself,
and it does the moment that host also has to resolve its gateway and one other
neighbor. The outage is on the scanner, not on anything it scanned, which is
not where anybody looks.

## What to check, in order

1. `ip -4 neigh show | wc -l` and `ip -6 neigh show | wc -l`, separately.
   They are different tables with different counters and the same limits.
2. Count entries rather than hosts. A dual stack host is at least three
   entries across the two tables.
3. Compare against all three thresholds, not just the third. Above
   `gc_thresh2` is a working table doing hidden work; above `gc_thresh1` is
   where the collector starts existing at all.
4. Check `/proc/net/stat/arp_cache` and `/proc/net/stat/ndisc_cache` for the
   `table_fulls` column. It counts the failures that `dmesg` rate limited
   away.
5. If it only breaks after reboots and maintenance, that is the age condition,
   not a different bug. Size for the cold start.
6. Search `dmesg` for `neighbor table overflow`, spelled American, and prefixed
   with the table name: `arp_cache: neighbor table overflow!`. Older kernels
   printed `Neighbour table overflow.` with no prefix, which is the string
   most search results still show and the reason the current one is hard to
   find.

## References

- [net/core/neighbour.c](https://github.com/torvalds/linux/blob/master/net/core/neighbour.c), for neigh_alloc, neigh_forced_gc, neigh_periodic_work and the overflow message
- [net/ipv4/arp.c](https://github.com/torvalds/linux/blob/master/net/ipv4/arp.c), where arp_tbl ships gc_thresh1 128, gc_thresh2 512 and gc_thresh3 1024
- [net/ipv6/ndisc.c](https://github.com/torvalds/linux/blob/master/net/ipv6/ndisc.c), where nd_tbl ships exactly the same three
- [ip-neighbour(8)](https://man7.org/linux/man-pages/man8/ip-neighbour.8.html), for the states an entry moves through and for nud permanent
- [RFC 4861, Neighbor Discovery for IP version 6](https://www.rfc-editor.org/rfc/rfc4861), for why an IPv6 host has more than one address to resolve
- [RFC 8981, Temporary Address Extensions for SLAAC](https://www.rfc-editor.org/rfc/rfc8981), for privacy addresses and how many of them a host holds at once