## Two numbers on one screen, and they do not disagree

Somebody sends you a screenshot with two things circled. `uptime` says the
load average is 41. `top` says the processors are two percent busy. The
implication is that one of them is lying.

Neither is. They are measuring different things, and the load average is not
measuring the thing almost everybody thinks it is. It is not a percentage, it
is not a share of the machine, and it is not about the processors. It is a
count of tasks that wanted to be somewhere they were not, and the arithmetic
that produces it is four lines in `kernel/sched/loadavg.c`:

```c
nr_active = this_rq->nr_running - adjust;
nr_active += (long)this_rq->nr_uninterruptible;
```

```c
avenrun[0] = calc_load(avenrun[0], EXP_1, active);
avenrun[1] = calc_load(avenrun[1], EXP_5, active);
avenrun[2] = calc_load(avenrun[2], EXP_15, active);
```

Everything surprising about the number falls out of those two fragments. The
first is a sum of two unlike things. The second is a filter, and both halves
are worth being exact about.

## It is a count, and nothing divides it

There is no ceiling. Not at 1.0, which is a myth from single processor
machines, and not at the core count either. A load of 41 means forty one
tasks were counted, and on a sixteen core host that is two and a half deep
and on a two core host it is twenty deep, and the number is 41 in both cases.

This is the single most consequential thing about it, because it means the
figure cannot be compared between machines and cannot be thresholded without
knowing what it is running on. An alert that fires at 5 means "slightly
loaded" on a thirty two core build host and "the queue is two and a half deep
and something is wrong" on a pair. Copying that threshold into a template is
how a monitoring system produces a page a day that everybody learns to close.

Divide by `nproc` before you compare it to anything. And then notice that
dividing is not something the number invites you to do, which is why almost
nobody does.

## The other half of the sum is not the processors

`nr_uninterruptible` is added to `nr_running` before anything is folded, and
that is where the screenshot comes from.

A task in uninterruptible sleep is one the kernel has put to sleep in a place
where it cannot take a signal, which is what happens when it is inside a
syscall waiting for a device to answer. It is not on a processor. It is not
waiting for a processor. It is not doing anything at all. It counts exactly
as much as a task burning a core flat out.

So a filer that stops answering, forty threads that touch it, and a load
average of 41 on a machine at two percent CPU. Nothing is wrong with the
processors, nothing is wrong with the scheduler, and adding cores would not
change the number by one.

`proc_loadavg(5)` describes those tasks as "waiting for disk I/O", which is
the common case and not the definition. D state is uninterruptible sleep of
any kind: a dead NFS mount, a SAN path failing over, a device driver in a
retry loop, occasionally a kernel lock. What they have in common is that they
cannot be killed, which is the other thing worth knowing about them. `SIGKILL`
does not reach a task in D state. It sits there until the thing it is waiting
for answers or the machine reboots.

Which means a permanent load of exactly 1.00 on an idle machine is close to
diagnostic. Somebody ran `df` an hour ago, it touched a mount whose server is
gone, and that process is now a fixture. It will still be there next month.

## The damping, in both directions

The three figures are the same count run through three exponential filters,
and the constants are in `include/linux/sched/loadavg.h`:

```c
#define FSHIFT   11
#define FIXED_1  (1<<FSHIFT)
#define LOAD_FREQ (5*HZ+1)
#define EXP_1    1884
#define EXP_5    2014
#define EXP_15   2037
```

One time constant gets you 1 - 1/e of a step change, which is 63 percent. Not
100. So a machine that has just gone from idle to eight busy tasks does not
read 8 after a minute, and one whose incident ended a minute ago does not read
zero.

Both directions cause incidents. A batch job that runs twenty four tasks for
two minutes peaks at 20.48 rather than 24, because two minutes is only two
time constants. And a minute after the last of those tasks exits, with nothing
runnable and nothing blocked anywhere on the box, the one minute figure still
reads 7.52. Every "the load was high when I looked and there was nothing to
find" is this.

The fix is not a better threshold. Read it twice, a minute apart. One reading
gives you a number and two give you a direction, and the direction is the only
part that says whether you are looking at something happening or something
that has already stopped.

Better still, read all three at once and treat them as a shape. One below five
below fifteen means recovering. The reverse means it is getting worse. All
three equal means it has been like this for longer than fifteen minutes. A
dashboard that plots one of them has thrown away the only easy inference the
number supports.

## The one minute average has not had a minute

Here is the part I did not know until I modeled it.

`LOAD_FREQ` is `5*HZ+1`, not `5*HZ`. At HZ=250 that is 5.004 seconds, and the
extra tick is deliberate: a sampling period that divides evenly into a second
aliases against anything that itself runs on a round schedule, so a job
starting every five seconds would be caught either always or never.

The consequence is small and exact. Eleven samples fit into the first sixty
seconds, not twelve. So a machine stepping from idle to eight runnable tasks
reads **4.81** at the one minute mark, where the textbook 8(1 - 1/e) says
5.06. The twelfth sample lands at 60.05 seconds and takes it there.

Nobody will ever page you about a difference of 0.25. It is worth knowing
anyway, because it is the difference between a model of the number and the
number, and I only found it by writing the model against the source instead of
against the idea.

While I was there: `EXP_1` is 1884/2048, which is 0.919922, and `exp(-5/60)` is
0.920044. The kernel's own constant is not the exponential either. Eleven bits
of fraction is what it has.

## The rounding term, which I had backwards

`calc_load` has a line in it that looks like a rounding detail:

```c
newload = load * exp + active * (FIXED_1 - exp);
if (active >= load)
        newload += FIXED_1-1;
return newload / FIXED_1;
```

I wrote in a comment that this was what lets a decaying load actually reach
zero instead of hanging at 0.01 forever. That is wrong in both halves, and
running it both ways says so.

`active >= load` is true while the load is climbing towards the count and
false while it is falling away from it, so the term applies to the rise only.
The decay does not use it, and is bit for bit identical with and without it,
reaching a true zero after 94 folds either way.

What the term actually buys is the last unit on the way up. Without it, a load
rising towards a steady eight settles at 7.99 and stays there forever, because
eleven bits of truncation per fold cost exactly what the fold gains. It is not
what gets an idle machine to zero. It is what gets a busy one to eight.

Two things agreeing is not evidence when the same belief wrote both, and a
comment is not a test.

## A burst between two samples never happened

The kernel samples the instantaneous count at the tick and folds that one
number in. It does not integrate over the interval.

So: four cores, a hook forks sixty four processes, they run for two seconds
and exit, and the whole thing happens between the sample at 0 and the sample
at 5.004 seconds. Sixteen times oversubscribed, and the load average peaks at
exactly zero. There is no record. The graph is flat and the machine was on
fire.

If you need to see short bursts, the load average is the wrong instrument at
any resolution, because the problem is not the averaging window. Process
accounting sees them, an eBPF exec trace sees them, and pressure stall
information sees them, because all three count events rather than sampling a
level.

## What to read instead

```
$ cat /proc/loadavg
41.00 38.58 24.62 2/133 4900
```

The fourth field is the one nobody reads. Runnable over total, and a load of
41 next to a runnable count of 2 is the entire diagnosis without opening
another tool.

```
$ vmstat 1
 r  b   swpd   free   buff  cache ...
 1 40      0 3421196  88132 1899444
```

`r` and `b` are the sum taken apart: runnable in one column, uninterruptible
in the other. This is the single most useful thing to run when the load
average is high, and it answers in one second which half of the sum you are
looking at.

```
$ ps -eo pid,state,wchan:32,cmd | awk '$2 == "D"'
```

Names the tasks in D state and the kernel function each is stuck in. The
`wchan` column is usually enough to say which mount or which device.

```
$ cat /proc/pressure/cpu
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
```

Pressure stall information is the quantity people believe they are reading off
the load average: the share of time runnable tasks spent waiting rather than
the number of them. It is normalized, it is comparable between machines, and
it is zero on a box with eight tasks on eight cores and rises the moment the
ninth arrives. If you are building alerting today and you have a kernel newer
than 4.20, alert on this and use the load average for the thing it is good at,
which is being a rough number you can hold in your head.

## The three questions

1. How much of it is `nr_uninterruptible`? `vmstat 1`, the `b` column. If it
   is most of the number, this is not a CPU incident and no amount of capacity
   will help.
2. What is it per core? Divide by `nproc`. The raw figure means something
   different on every machine.
3. Which way is it going? Compare the one, five and fifteen minute figures.
   The number alone cannot tell you whether you have arrived during or after.

None of those is about the value of the number, and the value of the number is
the only thing anybody looks at.

You can work through ten of these, including the one where the load is forty
on an idle machine and the one where the burst never happened, at
[forty, and idle](/load).

## References

- [include/linux/sched/loadavg.h, the constants and calc_load itself](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/linux/sched/loadavg.h)
- [kernel/sched/loadavg.c, the fold and what counts as active](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/kernel/sched/loadavg.c)
- [proc_loadavg(5), on the five fields and what the first three average](https://man7.org/linux/man-pages/man5/proc_loadavg.5.html)
- [Documentation/accounting/psi.rst, on pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [vmstat(8), for the r and b columns](https://man7.org/linux/man-pages/man8/vmstat.8.html)
