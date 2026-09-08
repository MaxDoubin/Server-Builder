## The log names two processes and they are not the same one

A kernel out of memory dump has two lines people read as one:

```
node invoked oom-killer: gfp_mask=0x100cca(GFP_HIGHUSER_MOVABLE), order=0, oom_score_adj=0
...
Out of memory: Killed process 1104 (postgres) total-vm:4291392kB, anon-rss:3481600kB
```

The first process hit the wall. The second one paid for it. Nothing connects
them except the machine they were both on, and the first line is close to
useless: it names whoever happened to ask for a page at the moment the last
page ran out, which on a busy host is a coin toss. Rescheduling that process
will not help. It was never the problem.

The second line is the interesting one, and the rule that produces it is four
lines of arithmetic in `mm/oom_kill.c`:

```c
points = get_mm_rss(p->mm) + get_mm_counter(p->mm, MM_SWAPENTS) +
        mm_pgtables_bytes(p->mm) / PAGE_SIZE;

/* Normalize to oom_score_adj units */
adj *= totalpages / 1000;
points += adj;
```

The kernel kills the highest. There is no weighting by uptime, no preference
for whoever allocated, and no attempt to work out which part of a shared
mapping belongs to whom. Everything surprising about the OOM killer falls out
of those four lines, and most of the surprises are in the third one.

## The adjustment is not an adjustment

`oom_score_adj` reads like a nudge. It is a small number, it lives in
`/proc/PID/oom_score_adj`, it goes from -1000 to 1000, and it is documented as
biasing the choice. So people set it to -500 meaning "prefer something else"
and to 200 meaning "this one first, if it comes to that".

Look at what the kernel does with it. `adj *= totalpages / 1000` converts the
setting into the same unit as the memory, which is pages, and then adds it. It
is not a multiplier or a percentile. It is a quantity of memory, and the
quantity is a thousandth of the machine per point.

On a 16 GiB host with no swap that is 4,194,304 pages, so a thousandth is
4,194 pages, which is 16.4 MiB. One point of `oom_score_adj` is worth sixteen
megabytes there. Which means:

- `oom_score_adj = 200` adds 3.2 GiB to the score. Not a fifth of the process,
  a fifth of the machine.
- `oom_score_adj = -800` subtracts 12.8 GiB. A process would have to be using
  more than four fifths of the host before it re-entered the running.

And the same settings on a 256 GiB machine are worth 51.2 GiB and 205 GiB.
Nothing about the process changed. The setting is a proportion of whatever it
is set on, which is why copying it out of a template that was written for a
different host size is how you get a service that either never dies or always
does.

There is a truncation in there too, and it is easy to model wrongly. The
division happens first and in integer arithmetic, on a page count. Truncating
a page count is not the same as taking a thousandth: on a 1001 MiB cgroup, one
point is worth exactly 1 MiB rather than 1.001. I got this wrong in a model of
the rule, kept the figures in MiB, truncated there, and moved every score
carrying an adj by about a fortieth before noticing.

## Minus one thousand is a different code path

The number that is not on the scale at all is -1000:

```c
adj = (long)p->signal->oom_score_adj;
if (adj == OOM_SCORE_ADJ_MIN || ...) {
        task_unlock(p);
        return LONG_MIN;
}
```

`OOM_SCORE_ADJ_MIN` is tested before any arithmetic, and the function returns
before computing anything. The task is not scored low. It is not scored. It
cannot be selected however much memory it is holding, and a database sitting
on two thirds of the host with -1000 set is not a likely victim that got lucky,
it is not a candidate.

This is the setting that turns an incident into a worse one. A hardening
checklist that says "set `OOMScoreAdjust=-1000` on your units" applied to every
unit produces a machine with no candidates, and the kernel has nothing to fall
back on:

```
Out of memory and no killable processes...
Kernel panic - not syncing: System is deadlocked on memory
```

A lost process became a lost machine, and the change that did it passed review
as defence in depth. Reserve -1000 for what you need in order to log in and
diagnose, which is `sshd` and the monitoring agent, and let everything that can
be restarted be killable, because a service that dies and comes back is the
mechanism keeping the box up.

## Two terms that are not in top

`top` shows RES. The expression has three memory terms and RES is one of them.

**Swap counts.** `MM_SWAPENTS` is anonymous memory the process owns that
currently lives on disk, and it is charged in full. A JVM with 1.4 GiB resident
and 5.1 GiB swapped owns 6.5 GiB and outranks a browser at 4.5 GiB resident.
Sorting `top` by RES answers "what is in RAM now", and the killer is asking
"who owns the most memory". On a machine that is swapping those are different
questions with different answers.

**Page tables count.** `mm_pgtables_bytes` divided by `PAGE_SIZE` is the third
term, and it is invisible everywhere except `/proc/PID/status`, as `VmPTE`. A
page table entry is eight bytes and it maps four kilobytes, so a process pays
one five hundred and twelfth of what it maps. Mostly that is a rounding error.
It stops being one when a process maps a great deal: a postgres backend
attached to a 48 GiB `shared_buffers` segment carries 96 MiB of page tables,
and a hundred backends attached to the same segment each carry their own copy.

This is a reason to give a large shared segment huge pages, though not the
one the documentation leads with: the kernel's case for them is TLB reach, and
the table saving comes along with it. One entry per 2 MiB instead of one per
4 KiB cuts the table cost by a factor of 512, and on a host with a hundred
backends it is the difference between a rounding error and 9.4 GiB of tables
nobody has accounted for.

## Shared pages are counted in full, per process

`get_mm_rss` counts a shared page in every process that maps it. The kernel
makes no attempt to divide it, which is a defensible choice: dividing would
mean deciding, and there is no answer that is right.

The consequence is that a fork pool is invisible to the killer as a pool. Eight
postgres backends each showing 2.6 GiB resident, of which 2.3 GiB is the same
shared buffer pool, are holding down 4.2 GiB and reading as twenty.
Every one of them scores 2.6 GiB, and every one is beaten by any single process
larger than that. The set of processes that filled the machine survives, and a
virus scanner at 3.8 GiB dies.

So the answer to "which process is using all the memory" is not the answer to
"which process will be killed", and reaching for `ps aux --sort=-rss` gives you
the first one while thinking about the second.

## A cgroup OOM is a different question

This is the one worth checking before anything else, because it changes both
halves of the expression.

When a cgroup hits its `memory.max`, the machine is not out of memory. One
cgroup is out of its allowance, and the candidates are only the tasks inside
it. A backup `rsync` holding twenty four gigabytes in a different cgroup is not
considered, whatever it is doing, and the host having 36 GiB free is not a
contradiction. It is what a limit is for.

The normaliser changes too: `totalpages` becomes the cgroup's limit. An
`oom_score_adj` of 200 inside a 512 MiB cgroup is worth 102 MiB, and the same
200 under a system OOM on the same host is worth gigabytes. The setting did not
change. What it is a proportion of did.

Tell them apart before you investigate, because they lead to opposite
conclusions. A memcg kill names the cgroup in the dump, and
`memory.events` counts them:

```
$ cat /sys/fs/cgroup/system.slice/app.service/memory.events
low 0
high 4213
max 981
oom 12
oom_kill 12
```

If `oom_kill` there is climbing, the machine was never full and the answer is a
limit that is too low or a service that leaks. If it is flat and processes are
dying anyway, the host is oversubscribed.

## What memory.oom.group changes

By default a cgroup OOM kills one task. For anything whose processes are
useless individually that is the wrong shape: a worker dies, the supervisor
carries on with a hole in it, and requests route into the hole. `memory.oom.group`
makes the kill a transaction, so the whole cgroup goes and the unit restarts as
one thing.

It is off by default, which is why the more common version of this incident is
a unit that is up, passing its health check, and half missing.

## One more thing, and I had it backwards

Ties. Two identical forked workers with the same score is not a hypothetical,
it is what a worker pool is, and I wrote from memory that the first one scanned
wins. It does not:

```c
points = oom_badness(task, oc->totalpages);
if (points == LONG_MIN || points < oc->chosen_points)
        goto next;
select:
```

The skip is on strictly less. An equal score falls through to `select` and
replaces the standing choice, so the last equal task scanned is the one that
dies. I had asserted the wrong behaviour in a test, and the test passed,
because the same belief had written both the code and the assertion. Two things
agreeing is not evidence when one of them wrote the other.

## Reading it on a real machine

```
dmesg -T | grep -i -B2 -A25 "invoked oom-killer"
```

The kernel prints its whole candidate table in that dump, with an
`oom_score_adj` column, which is the arithmetic above already done for you.
Read the "Killed process" line and ignore the "invoked oom-killer" one.

```
grep -E "VmRSS|VmSwap|VmPTE" /proc/PID/status
```

Three of the four terms, none of which is in `top`'s default columns.

```
cat /sys/fs/cgroup/<path>/memory.events
```

Which OOM you actually had.

And if you are about to set `oom_score_adj` on something, work out what the
number costs on the machine you are setting it on, in gigabytes, before you set
it. It is a quantity of memory. Treating it as a hint is how a 200 meant as a
tiebreak turns into three gigabytes and kills the wrong service for a year.

You can work through ten of these, including the one that panics, at
[something has to die](/oom).

## References

- [mm/oom_kill.c, the selection itself](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/mm/oom_kill.c)
- [proc_pid_oom_score_adj(5), on the knob itself](https://man7.org/linux/man-pages/man5/proc_pid_oom_score_adj.5.html)
- [proc_pid_status(5), on the VmRSS, VmSwap and VmPTE fields](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)
- [Documentation/admin-guide/cgroup-v2.rst, on memory.max, memory.events and memory.oom.group](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Documentation/admin-guide/mm/transhuge.rst, on what huge pages buy, which is mostly TLB reach](https://docs.kernel.org/admin-guide/mm/transhuge.html)
- [systemd.exec(5), on OOMScoreAdjust and OOMPolicy](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html)
