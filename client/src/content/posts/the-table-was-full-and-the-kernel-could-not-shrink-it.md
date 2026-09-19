## The message that names its own cause

```
kernel: nf_conntrack: table full, dropping packet
```

Almost everyone reads this as "the table reached its limit". It is not what
the kernel means. From `net/netfilter/nf_conntrack_core.c`:

```c
	if (unlikely(ct_count > nf_conntrack_max)) {
		if (!early_drop(net, hash)) {
			if (!conntrack_gc_work.early_drop)
				conntrack_gc_work.early_drop = true;
			atomic_dec(&cnet->count);
			if (net == &init_net)
				net_warn_ratelimited("nf_conntrack: table full, dropping packet\n");
```

The table reaching its limit is the *outer* condition. The message is inside
`if (!early_drop(...))`. So the line means: the table is at its limit, the
kernel tried to evict something to make room, and it could not.

Which raises the only question that matters when you see it. Why couldn't it?

## What early_drop is allowed to take

```c
		if (test_bit(IPS_ASSURED_BIT, &tmp->status) ||
		    !net_eq(nf_ct_net(tmp), net) ||
		    nf_ct_is_dying(tmp))
			continue;
```

Anything marked **assured** is skipped. A flow becomes assured when it has
carried traffic in both directions past any handshake, which is to say when
it is a real conversation somebody is having.

So the eviction path is good at exactly one thing: throwing away half-open
connections, abandoned handshakes, and one-way UDP. It is useless against a
table full of working connections, by design, because the alternative would
be a kernel that drops your database session to make room for a port scan.

There is a second limit on it. `early_drop` searches `NF_CT_EVICTION_RANGE`
buckets, which is 8, starting from the new packet's own hash. It is a quick
look nearby, not a sweep of the table.

## Measuring it

I lowered `nf_conntrack_max` to 20 on a quiet host, installed an iptables rule
so conntrack would engage, and opened eighty loopback connections. Forty
sockets came up, sixty failed, and `nf_conntrack_count` pinned at exactly 20.
Then the counters, summed across CPUs from `/proc/net/stat/nf_conntrack`:

```
drop:        +296
early_drop:  +0
insert_failed: +0
```

**296 drops. Zero evictions.** Every entry in that table was an established
connection, so `early_drop` walked its eight buckets, found nothing it was
allowed to touch, and returned false 296 times. The dmesg line appeared
exactly as quoted above.

That is the whole lesson in one pair of counters, and it is why those two
columns are the first thing to read when the message appears. Evictions with
no drops is the table absorbing abuse and working as designed. Drops with no
evictions is real traffic being refused and nothing the kernel can do.

## The limit is not what you think either

Every tuning guide says `nf_conntrack_max` is four or eight times
`nf_conntrack_buckets`. Here is the code that sets it, in
`nf_conntrack_init_start()`:

```c
	unsigned long nr_pages = totalram_pages();
	int max_factor = 8;

	if (!nf_conntrack_htable_size) {
		nf_conntrack_htable_size
			= (((nr_pages << PAGE_SHIFT) / 16384)
			   / sizeof(struct hlist_head));
		if (BITS_PER_LONG >= 64 &&
		    nr_pages > (4 * (1024 * 1024 * 1024 / PAGE_SIZE)))
			nf_conntrack_htable_size = 262144;
		else if (nr_pages > (1024 * 1024 * 1024 / PAGE_SIZE))
			nf_conntrack_htable_size = 65536;

		if (nf_conntrack_htable_size < 1024)
			nf_conntrack_htable_size = 1024;

		max_factor = 1;
	}

	nf_conntrack_max = max_factor * nf_conntrack_htable_size;
```

`max_factor` starts at 8. The branch that sizes the table from memory sets it
to **1** on its last line. That branch runs whenever `nf_conntrack_htable_size`
is zero, which is to say whenever nobody passed a `hashsize` module
parameter or boot argument.

So on an ordinary machine the ratio is one to one. The host I measured this on:

```
$ cat /proc/sys/net/netfilter/nf_conntrack_max
262144
$ cat /proc/sys/net/netfilter/nf_conntrack_buckets
262144
```

15 GiB of memory, past the four gibibyte branch, 262144 buckets, factor of
one, 262144 entries. Exactly one to one.

The four-and-eight folklore describes the configuration where somebody set the
hash size by hand, and it has a consequence people find backwards when they
meet it. Pinning `hashsize=65536` on that same host to "save memory" gives you
`8 × 65536 = 524288` entries: **twice the capacity, from a quarter of the
buckets.** Smaller table, bigger limit, longer chains.

## The sizing has cliffs, not a slope

Because of those two overrides, bucket count as a function of memory is three
values and two steps:

| memory | buckets | max (auto-sized) |
|---|---|---|
| 1 GiB | 8,192 | 8,192 |
| 2 GiB | 65,536 | 65,536 |
| 4 GiB | 65,536 | 65,536 |
| 8 GiB | 262,144 | 262,144 |
| 512 GiB | 262,144 | 262,144 |

A host that went from 4 GiB to 5 has four times the conntrack capacity it had
yesterday. A host that went from 8 GiB to 64 has exactly the same. Neither
change is anywhere in a changelog.

## How long a slot stays taken

The other half of the arithmetic is the timeout, and there is one shipped
default worth knowing by heart:

```
$ cat /proc/sys/net/netfilter/nf_conntrack_tcp_timeout_established
432000
```

Five days.

It is not a mistake. A TCP connection with no traffic is still a valid
connection, and a NAT that forgot it would break long-lived idle sessions. But
it means a connection whose far end vanished, because the process was killed
or the container was replaced or the virtual machine was deleted, holds its
entry until the end of the week.

Run the arithmetic. Occupancy is arrival rate times holding time, and holding
time here is five days:

**One connection per second that never closes cleanly is 432,000 entries.**

That is past the default limit on a host with sixteen gibibytes of memory,
from a workload that opens one connection a second. Meanwhile 500 UDP health
checks a second, at a 30 second timeout, hold about 20,000. The high-rate
workload is cheap and the trickle is fatal, entirely because of the timeout.

## What to actually do

**Read the two counters first.** `drop` and `early_drop` in
`/proc/net/stat/nf_conntrack`, columns 11 and 12, summed across CPUs. They
tell you whether this is abuse being absorbed or traffic being refused.

**Read both sysctls rather than deriving one.** `nf_conntrack_max` and
`nf_conntrack_buckets`, on the host in front of you. Do not compute one from
the other.

**Raise both together.** Raising `max` alone makes the chains longer, which
costs you on every packet.

**Look at the timeout before the size.** On a host that is not carrying long
idle sessions through NAT, dropping
`nf_conntrack_tcp_timeout_established` from five days to a few hours reclaims
more than any amount of resizing, and costs nothing you will notice.

**Consider not tracking at all.** For traffic you are not firewalling by
state, a `NOTRACK` rule in the `raw` table keeps it out of the table entirely.
On a pure forwarding host that is often the whole fix.

## The short version

"Table full" means the kernel tried to evict and failed, and it fails
precisely when the table is full of connections people are using.
`nf_conntrack_max` equals the bucket count on any host that did not have its
hash size forced, not four or eight times it. The bucket count steps at one
and four gibibytes and is flat in between. And an established TCP entry
survives its own connection by five days, so one connection a second is enough
to fill a default table.
