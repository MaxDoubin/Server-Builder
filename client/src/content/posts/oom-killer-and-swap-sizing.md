
## Allocation is a promise, not a delivery

Linux hands out memory it does not have. When a process calls `malloc` and the kernel returns an address, nothing has been committed except an entry in the page tables saying this range is valid. Physical pages arrive later, on the first write to each page, through a page fault. This is overcommit, and it is on by default because most programs reserve far more than they touch.

That design is why "out of memory" is a runtime surprise rather than a failed allocation. The allocation succeeded. The write is what fails, and a write cannot return an error to a program that is just storing a value in a struct. So the kernel has to resolve the shortfall some other way, and its last resort is to kill something.

You can change this policy:

```bash
# 0 = heuristic (default), 1 = always overcommit, 2 = strict accounting
sysctl vm.overcommit_memory
sysctl -w vm.overcommit_memory=2
sysctl -w vm.overcommit_ratio=80
```

Mode 2 refuses allocations beyond swap plus a percentage of RAM, so `malloc` returns NULL instead of the kernel killing a process later. It sounds appealing and it is right for some workloads, but plenty of software handles a NULL from `malloc` by crashing anyway, and JVMs and databases that reserve huge virtual arenas will refuse to start. I have only used it on single purpose boxes where I controlled everything running.

## How the kernel picks a victim

When reclaim fails, the OOM killer scans processes and scores them. The score is dominated by resident set size: memory the process actually has in RAM, plus swap and page table overhead, expressed roughly as a fraction of available memory. Then it is adjusted by `oom_score_adj`, a per process knob from -1000 to 1000. A value of -1000 makes a process ineligible entirely.

You can read both:

```bash
for p in $(pgrep -d' ' -f .); do
  printf "%7s %5s %5s %s\n" "$p" \
    "$(cat /proc/$p/oom_score 2>/dev/null)" \
    "$(cat /proc/$p/oom_score_adj 2>/dev/null)" \
    "$(tr -d '\0' < /proc/$p/comm 2>/dev/null)"
done | sort -k2 -rn | head
```

The important consequence is that the biggest process usually dies, and on most servers the biggest process is the one doing the actual work. The database gets killed, not the leaky agent that caused the pressure. If you have a process that must survive, bias it explicitly:

```bash
echo -800 > /proc/$(pidof postgres)/oom_score_adj
```

and if you have something you would rather lose first, bias it the other way with a positive number. Do not set -1000 on more than one thing. If nothing is eligible, the kernel panics instead.

The kill is always logged. `dmesg` gives you the full picture: the invoking process, the memory breakdown, a table of candidates with their scores, and the final "Out of memory: Killed process" line. That table is the most useful forensic artifact you will get, because it shows what memory looked like at the moment of the decision rather than after the fact.

## Swap is reclaim headroom, not spare RAM

The persistent myth is that swap exists so you can run more than you have. On a server, that is not what it is for. Swap gives the reclaim path somewhere to put anonymous pages that are not being used, so that RAM can hold the things that are.

Without swap, the kernel can only reclaim file backed pages: page cache, mapped executables, shared libraries. Anonymous memory is unreclaimable. So a memory hungry process with a large idle heap forces the kernel to evict cache it needs, and you get a machine that thrashes on disk reads while gigabytes of never touched heap sit in RAM. Zero swap does not prevent memory pressure, it just removes one of the kernel's options and makes the OOM kill arrive more abruptly.

`vm.swappiness` sets the balance between reclaiming anonymous pages and file pages. It is a ratio, not a percentage of memory, and the default of 60 leans toward keeping cache. On a box with fast NVMe swap, higher values are defensible. On a box whose working set must never touch disk, 10 is a reasonable floor. I do not set it to 0 because that is close to telling the kernel to never swap anonymous pages, which puts you back in the no swap situation.

For sizing, the honest answer is that it depends on what you want swap to do. A few gigabytes is enough to let reclaim breathe on a general purpose server. Sizing swap to hold your entire working set means the machine will survive pressure by becoming unusably slow, which is often worse than a fast failure. Hibernation is the one case that genuinely needs swap at least the size of RAM, and servers do not hibernate.

## Watch pressure, not free memory

`free -m` is close to useless as an alarm signal, because a healthy Linux box shows very little free memory by design. Cache is doing its job. The number worth watching is pressure stall information, which reports the percentage of time tasks were stalled waiting on memory:

```bash
cat /proc/pressure/memory
# some avg10=0.00 avg60=0.00 avg300=0.00 total=0
# full avg10=0.00 avg60=0.00 avg300=0.00 total=0
```

`some` rising means at least one task is waiting on reclaim. `full` rising means everything is. A `some avg60` that climbs past a few percent is a machine in trouble well before any kill happens, and it is the metric I alert on. Free memory tells you what the kernel is holding. Pressure tells you whether the kernel is struggling to hold it.

## References

- https://docs.kernel.org/admin-guide/sysctl/vm.html
- https://www.kernel.org/doc/html/latest/admin-guide/mm/concepts.html
- https://docs.kernel.org/accounting/psi.html
- https://man7.org/linux/man-pages/man5/proc.5.html
- https://man7.org/linux/man-pages/man8/swapon.8.html
- https://en.wikipedia.org/wiki/Out_of_memory
