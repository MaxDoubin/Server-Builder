## Twenty six gigabytes available, and it is swapping

The ticket says the change did not work. Somebody set `vm.swappiness` to 10 on
a database host last week, believing the machine would then hold off swapping
until memory was ninety percent used:

```
$ sysctl vm.swappiness
vm.swappiness = 10

$ free -h
               total        used        free      shared  buff/cache   available
Mem:            62Gi        34Gi       2.1Gi       1.1Gi        26Gi        26Gi
Swap:          8.0Gi       2.4Gi       5.6Gi
```

Twenty six gigabytes the kernel says a process could have, and 2.4 gigabytes of
anonymous memory out on a disk. So either the setting is ignored or it needs to
go lower.

Neither. Nothing in the reclaim path compares `vm.swappiness` against a
quantity of memory, a fraction of memory, or a percentage of anything. It is a
weight on one decision, it is read only after the kernel has already committed
to reclaiming, and the decision to reclaim is made elsewhere, by numbers this
knob never touches.

## What the documentation says, and what it said for a decade

From `Documentation/admin-guide/sysctl/vm.rst`:

> This control is used to define the rough relative IO cost of swapping and
> filesystem paging, as a value between 0 and 200. At 100, the VM assumes equal
> IO cost and will thus apply memory pressure to the page cache and swap-backed
> pages equally; lower values signify more expensive swap IO, higher values
> indicates cheaper.

Relative cost, between two things. There is no sentence about when swapping
starts, because the knob does not decide that.

That paragraph arrived in Linux 5.8, merged in June 2020. For more than a
decade before it, the same section opened with:

> This control is used to define how aggressive the kernel will swap memory
> pages. Higher values will increase aggressiveness, lower values decrease the
> amount of swap.

Which is where the folklore comes from, and it is hard to blame anybody. "How
aggressive" sounds like a dial on one behavior, a range that stopped at 100
reads as a percentage, and a default of 60 invites you to finish the sentence
yourself. The wrong model even gives the right advice most of the time: lower
the number, see less swapping. Nothing contradicts it, so it survives.

## Reclaim begins at the watermarks

From `/proc/zoneinfo`:

```
Node 0, zone   Normal
  pages free     232534
        min      10394
        low      12992
        high     15590
```

Pages, so multiply by four kilobytes: about 41, 51 and 61 MiB on a node
managing 4.8 GiB. When free memory falls past `low`, kswapd wakes and reclaims
until the zone is back above `high`. If an allocation cannot be satisfied above
`min`, the allocating task reclaims in its own context, which is what direct
reclaim means and why it arrives as latency rather than as a graph.

That is the whole trigger, and it is about one percent of the node, not forty
percent of it. The setting that moves it is `vm.watermark_scale_factor`,
documented as controlling "the amount of memory left in a node/system before
kswapd is woken up and how much memory needs to be free before kswapd goes back
to sleep". If you wanted the machine to start reclaiming sooner, that is the
knob. Swappiness is not read anywhere in this part.

## The arithmetic the number appears in

Reclaim has to split its scan between two lists. Anonymous pages can only be
freed by writing them to swap. File-backed pages can be dropped and read from
the filesystem again. `get_scan_count()` in `mm/vmscan.c` picks the split, and
its `calculate_pressure_balance()` helper does the arithmetic:

```c
	ap = swappiness * (total_cost + 1);
	ap /= anon_cost + 1;

	fp = (MAX_SWAPPINESS - swappiness) * (total_cost + 1);
	fp /= file_cost + 1;

	fraction[WORKINGSET_ANON] = ap;
	fraction[WORKINGSET_FILE] = fp;
	*denominator = ap + fp;
```

`MAX_SWAPPINESS` is 200, defined in `mm/internal.h`. The setting is a numerator
and the file side gets the rest of 200. At the default of 60, anon starts with
60 and file with 140. At 10, anon starts with 10 and file with 190: nineteen to
one against swapping, which is a preference and not a prohibition.

`anon_cost` and `file_cost` are measured rather than configured. The comment
above the block makes the pressure on each list inversely proportional to the
cost of reclaiming it, "as determined by the share of pages that are
refaulting, times the relative IO cost of bringing back a swapped out anonymous
page vs reloading a filesystem page (swappiness)". Refaults are pages the
kernel evicted and had to fetch back, counted in `workingset_refault_anon` and
`workingset_refault_file`. The kernel already knows which list is expensive to
take from. Swappiness is a thumb on that scale.

Which is why the host in the ticket swapped. With 26 GiB of page cache to work
through, the file list started every scan with nineteen twentieths of the
pressure and the other twentieth landed on anonymous memory, pass after pass,
for a week.

## Zero, and the plus one that stopped it being zero

> At 0, the kernel will not initiate swap until the amount of free and
> file-backed pages is less than the high watermark in a zone.

A condition, not an off switch. Before Linux 3.5 it was not even that much,
because the numerator carried a plus one:

```c
-	ap = (anon_prio + 1) * (reclaim_stat->recent_scanned[0] + 1);
+	ap = anon_prio * (reclaim_stat->recent_scanned[0] + 1);
```

Satoru Moriya's 2012 commit fe35004fbf9e removed it, so that 0 produces a
weight of 0 instead of 1. The message is blunt about the old behavior: "with
current reclaim implementation, the kernel may swap out even if we set
swappiness=0 and there is pagecache in RAM".

Even now, 0 is advisory during global reclaim:

```c
	/*
	 * Global reclaim will swap to prevent OOM even with no
	 * swappiness, but memcg users want to use this knob to
	 * disable swapping for individual groups completely when
	 * using the memory controller's swap limit feature would be
	 * too expensive.
	 */
	if (cgroup_reclaim(sc) && !swappiness) {
		scan_balance = SCAN_FILE;
		goto out;
	}
```

Inside a cgroup, 0 means never. For the machine as a whole it means not until
the file list and the free pages together can no longer cover the high
watermark, and at that point `sc->file_is_tiny` is set and the scan is forced
onto anonymous memory regardless. One more branch separates 0 from 1: at the
last and most desperate reclaim priority, `if (!sc->priority && swappiness)`
gives a nonzero setting an equal scan of both lists, and 0 skips it. If you
want swap held back as a last resort but still used as one, 1 says that.

I ran hosts at 0 for years believing it was the same as having no swap device.
What it bought me was a machine that sat at zero for weeks, wrote out about 300
MB during one nightly backup, and then sat at 300 MB forever, because nothing
pulls a page back except a fault on it. Lowering the number afterwards undoes
nothing. `swapoff -a` is the only thing that does, and the only real off
switch.

## Two hundred, for devices faster than the filesystem

The ceiling moved from 100 to 200 in 5.8, in commit c843966c556d by Johannes
Weiner, for the case where the premise has flipped: "With the advent of fast
random IO devices (SSDs, PMEM) and in-memory swap devices such as zswap, it's
possible for swap to be much faster than filesystems, and for swapping to be
preferable over thrashing filesystem caches."

The documentation gives the conversion:

> For example, if the random IO against the swap device is on average 2x faster
> than IO from the filesystem, swappiness should be 133 (x + 2x = 200, 2x =
> 133.33).

A ratio of two IO costs, out of 200. The ceiling is enforced in the sysctl
table with `SYSCTL_ZERO` and `SYSCTL_TWO_HUNDRED`:

```
# echo 201 > /proc/sys/vm/swappiness
bash: echo: write error: Invalid argument
```

On zram or zswap, check `vm.page-cluster` too. It is swap readahead, and its
default of three means eight pages fetched on every swap-in fault: a reasonable
bet against a seek, a poor one against a decompression.

## cgroup v2 does not have memory.swappiness

This is the knob people go looking for and do not find. It is a cgroup v1 file,
and the v1 documentation says so in its own table: "Per memcg knob does not
exist in cgroup v2." The kernel says it out loud in `mm/memcontrol-v1.c` when
you write to the v1 file on a non-root cgroup:

```c
		pr_info_once("Per memcg swappiness does not exist in cgroup v2. "
			     "See memory.reclaim or memory.swap.max there\n ");
```

Under v2, `mem_cgroup_swappiness()` returns the global `vm_swappiness` for
every cgroup. There is one value on the machine.

What v2 gives instead is a different kind of thing. `memory.swap.max` is a
"swap usage hard limit", and the documentation is exact about reaching it:
"anonymous memory of the cgroup will not be swapped out". Zero there is the
per-workload off switch that swappiness 0 was being used to approximate.

One v2 interface still takes a swappiness value, and only for a single
proactive reclaim call:

```
# echo "1G swappiness=max" > /sys/fs/cgroup/system.slice/app.service/memory.reclaim
```

> The valid range for swappiness is [0-200, max], setting swappiness=max
> exclusively reclaims anonymous memory.

`max` maps to `SWAPPINESS_ANON_ONLY`, defined as `MAX_SWAPPINESS + 1`, which is
201: a value the sysctl itself will not accept.

## Read the result, not the setting

```
$ grep -E 'pgsteal_(anon|file)|pswp' /proc/vmstat
pgsteal_anon 824190
pgsteal_file 51339664
pswpin 183407
pswpout 812553
```

Sixty two file pages reclaimed for every anonymous one, and `pswpout` minus
`pswpin` is the 629,146 pages now in swap. The setting did exactly what it was
set to do, and it was never going to produce zero. Next to that, read
`/proc/pressure/memory`, which measures time actually lost to reclaim instead
of counting pages, and watch the page cache over hours, for the same reason
[the free column](/blog/the-free-column-was-always-going-to-be-zero) was always
going to be small.

## The questions, in order

1. Is the machine reclaiming at all? That is the watermarks in `/proc/zoneinfo`
   and the `allocstall_*` counters, not swappiness.
2. When it reclaims, what does it take? `pgsteal_anon` against `pgsteal_file`.
   That ratio is the only thing this knob moves.
3. Is swap on this host faster or slower than the filesystem? That is the
   question the number asks. On zram the default is wrong, in the direction
   nobody expects.
4. Is this really a per-workload question? Then it is `memory.swap.max` and
   `memory.high`, because there is no per-cgroup swappiness in v2 to set.
5. Do you want less swapping, or none? Zero is less. `swapoff` is none, and
   choosing it is a decision about
   [what should die when memory runs out](/blog/oom-killer-and-swap-sizing),
   not a performance setting.

Whatever you set, set it in `/etc/sysctl.d/`, where the next boot will find it.

You can work through the other end of this, where there is nothing left to
reclaim and the kernel picks a victim, at
[which process the OOM killer kills](/oom).

## References

- [Documentation/admin-guide/sysctl/vm.rst, on swappiness and page-cluster](https://docs.kernel.org/admin-guide/sysctl/vm.html)
- [mm/vmscan.c, get_scan_count and the pressure balance](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/vmscan.c)
- [The commit that raised the ceiling to 200, and why](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=c843966c556d7370bb32e7319a6d164cb8c70ae2)
- [The 3.5 commit that made swappiness 0 mean zero](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=fe35004fbf9eaf67482b074a2e032abb9c89b1dd)
- [Documentation/admin-guide/cgroup-v2.rst, on memory.reclaim and memory.swap.max](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Documentation/admin-guide/cgroup-v1/memory.rst, on the knob that did not carry over](https://docs.kernel.org/admin-guide/cgroup-v1/memory.html)
- [swapon(8), and swapoff, the actual off switch](https://man7.org/linux/man-pages/man8/swapon.8.html)