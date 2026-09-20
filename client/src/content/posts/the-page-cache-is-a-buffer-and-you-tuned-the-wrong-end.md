## Four numbers nobody has read

Every Linux host has these, and almost nobody has looked at them:

```
$ cat /proc/sys/vm/dirty_ratio                 20
$ cat /proc/sys/vm/dirty_background_ratio      10
$ cat /proc/sys/vm/dirty_expire_centisecs      3000
$ cat /proc/sys/vm/dirty_writeback_centisecs    500
```

The advice that comes with them is remarkably consistent and wrong in three
separate ways. It says they are percentages of RAM, that `dirty_ratio` is the
one that matters, and that raising it makes writes faster. I went and measured
all three on the machine this was written on.

## It is not a percentage of RAM

From `mm/page-writeback.c`:

```c
static unsigned long global_dirtyable_memory(void)
{
	unsigned long x;

	x = global_zone_page_state(NR_FREE_PAGES);
	x -= min(x, totalreserve_pages);

	x += global_node_page_state(NR_INACTIVE_FILE);
	x += global_node_page_state(NR_ACTIVE_FILE);
```

Free pages, plus the file backed LRU, less the reserves the allocator will not
hand out. **Anonymous memory is not in that sum**, and correctly so: a page of
heap has nowhere to be written back to, so it cannot be part of a limit on
how much can be waiting to be written.

That means the base moves. It shrinks exactly when a process starts using
memory, which is exactly when you would least like your writeback thresholds
to quietly drop.

To show it rather than assert it, I set `dirty_background_ratio` to 1 and
`dirty_ratio` to 2, wrote 2.5 GiB with `dd`, and sampled `/proc/meminfo`
every 20 milliseconds for the peak:

```
memory free            dirtyable 14.90 GiB   peak Dirty 147.0 MiB
9 GiB held anonymous   dirtyable  5.85 GiB   peak Dirty  57.0 MiB
```

Dirtyable memory fell to 0.39 of what it was. The ceiling fell to 0.39 of what
it was. Held against dirtyable it was 0.96% and then 0.95%; held against
`MemTotal` it moved from 0.91% to 0.35%.

If the ratio were a percentage of installed memory, the second number would
have been 147 MiB as well.

The practical consequence: two machines with identical hardware and identical
`sysctl.d` files have thresholds nothing like each other if one of them runs a
large heap. A 128 GiB box with a 96 GiB JVM has a quarter of the writeback
headroom its twin has, and nothing in either machine's configuration says so.

## It is not the knob that runs

Look again at those two runs. Both had `dirty_ratio` at 2 and both settled at
1, which was `dirty_background_ratio`.

The two thresholds do different jobs.
`balance_dirty_pages_ratelimited()` wakes the flusher threads at the
background threshold, and the writing process carries on untouched.
`dirty_ratio` is where the writing process itself is made to wait.

A writer only reaches the second one by outrunning its device. If the disk
retires pages at least as fast as the workload makes them, the queue stops
growing where the flushers were woken and the hard limit is never consulted
at all. Tripling it changes nothing, because nothing was ever reading it.

So the number that decides how much dirty data your machine normally holds is
`dirty_background_ratio`, and it is the one nobody touches.

## Raising it does not buy throughput

On a machine that *is* stalling, `dirty_ratio` is being read, and raising it
does change something. Consider a log shipper writing 200 MiB a second onto a
device that retires 120.

Once the flushers are running, 80 MiB a second has nowhere to go. The queue
climbs from the background threshold to the hard one and the writer is then
held to the device's rate, because that is the only rate the system can
actually sustain. Raising `dirty_ratio` from 20 to 50 does not make the disk
faster. It moves the wall further away, so the workload runs longer before it
hits it, and it takes the queue from about 2 GiB to about 5 GiB.

That difference is the part worth naming. Everything between what the disk has
written and the hard threshold has been acknowledged to the application and
exists only in volatile memory. Raising the ceiling to smooth out stalls is a
decision to lose more on a power cut, and it is usually made without anyone
saying so out loud.

## A closed file is not a written file

The last two knobs are the ones with the most surprising behavior, because
below the background threshold *nothing is in a hurry at all*.

`dirty_expire_centisecs` is how old a page must be before a flusher will
consider it. `dirty_writeback_centisecs` is how often a flusher wakes up to
look. The defaults are 30 seconds and 5 seconds.

I wrote 64 MiB to an idle disk, well under the background threshold, and
watched `Dirty` in `/proc/meminfo`:

```
t= 0.0s  wrote 64 MiB, Dirty = 64.0 MiB above idle
t= 5.0s  Dirty =   64.0 MiB
t=10.0s  Dirty =   64.0 MiB
t=15.0s  Dirty =   64.0 MiB
t=20.0s  Dirty =   64.0 MiB
t=25.0s  Dirty =   64.0 MiB
t=30.0s  Dirty =   64.0 MiB
t=35.0s  Dirty =    0.0 MiB
```

Thirty seconds in which not one byte moved, on an idle machine with an idle
disk, and then the whole thing at once. Thirty for the expiry, and up to five
more waiting for a flusher to notice. **Thirty five seconds** in which a file
that `close()` returned successfully on was nowhere but RAM.

This is not a bug and it is not tuning gone wrong. Delaying is the entire
value of a write back cache: it lets the kernel coalesce, order and skip
writes. But it means `close()` is not a durability barrier, the flusher
interval is not a durability bound, and anything that has to survive the
machine needs `fsync`. The cost of that call is the whole point of it.

## The knob that reads back as zero

One more, because it turns a typo into silence.

Each threshold has two forms, a ratio and an absolute. They are one setting
with two faces, they are mutually exclusive, and the last write wins:

```
start        dirty_ratio 20   dirty_bytes 0
set bytes    dirty_ratio 0    dirty_bytes 104857600
set ratio    dirty_ratio 20   dirty_bytes 0
```

Writing either one zeroes the other. So a `sysctl.d` file that sets both, in
whichever order the files happen to be read, silently applies one of them.
And when you go to check, the knob you meant to set reads `0`, which looks
exactly like a kernel that does not support it.

There is also nothing checking that the two thresholds are the right way
round. Set `dirty_background_ratio` to 40 and `dirty_ratio` to 10 and both
writes succeed. The flusher wake now sits above the hard limit, so nothing
drains before the writer meets the wall, and the machine stalls on a device
that could have kept up without trying. From a `sysctl` listing it looks
generous.

## What to actually do

**Read the base, not just the ratio.** `MemFree` plus `Cached` in
`/proc/meminfo` is roughly what the percentage is taken against. On a host
with a large resident process it will be much smaller than you expect.

**Tune `dirty_background_ratio` if you want to move where the queue sits.**
`dirty_ratio` is a backstop. Changing it only affects a machine that is
already stalling.

**Use the bytes forms on a fleet.** If a threshold needs to be the same number
of bytes everywhere, `dirty_background_bytes` says so. A ratio deliberately
tracks a moving base, which is a feature until it is a surprise.

**Size the ceiling by what you can afford to lose.** On a saturated device the
hard threshold is the size of the hole a power cut leaves.

**Do not reach for any of this before measuring.** `grep -E 'Dirty|Writeback'
/proc/meminfo` in a loop during the workload tells you whether the queue is
anywhere near either threshold. Most of the time it is not, and the stall
being investigated is somewhere else entirely.

## The short version

The ratios are of dirtyable memory, which excludes anonymous pages and shrinks
as the machine gets busy. The queue settles at `dirty_background_ratio`, not
at `dirty_ratio`, because a writer only reaches the second by outrunning its
disk. Raising `dirty_ratio` on a saturated device buys seconds between stalls
and pays in unwritten data. And under the background threshold a closed file
can sit in volatile memory for thirty five seconds, because that is what a
write back cache is for.

## Sources

- [Documentation/admin-guide/sysctl/vm.rst, on the dirty knobs](https://docs.kernel.org/admin-guide/sysctl/vm.html)
- [mm/page-writeback.c, global_dirtyable_memory and the threshold arithmetic](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/page-writeback.c)
- [proc(5), on the Dirty and Writeback fields of /proc/meminfo](https://man7.org/linux/man-pages/man5/proc.5.html)
- [fsync(2), on what actually makes a write durable](https://man7.org/linux/man-pages/man2/fsync.2.html)

All measurements in this piece were taken on Linux 6.18.44 with 15.7 GiB of
memory, and every sysctl was restored afterward.
