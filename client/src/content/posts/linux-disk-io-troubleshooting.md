
## Start With the Complaint, Not the Tool

The worst way to debug slow storage is to open a monitoring tool and start looking for a red number. You will find one, because something is always the highest value on a busy machine, and then you will optimize it and nothing will improve.

Start with the complaint and turn it into a measurable statement. "The database is slow" becomes "commit latency at the ninety fifth percentile went from 4 milliseconds to 90 milliseconds starting Tuesday afternoon." Now you have a metric, a threshold, and a time window. Everything after that is narrowing.

## Reading iostat Properly

The workhorse is `iostat` from the sysstat package. Skip the first sample, it is an average since boot and it lies about the present.

```bash
# Extended stats, per device, 2 second intervals, skip the summary line.
iostat -dxmt 2 | grep -v '^$'
```

The columns that matter:

`r/s` and `w/s` are IOPS. `rMB/s` and `wMB/s` are throughput. Those two pairs together tell you the average request size, which immediately says whether the workload is small random operations or large sequential ones.

`r_await` and `w_await` are the average time in milliseconds a request spent in the queue plus service. This is the number closest to what your application feels. Rising await with flat IOPS means the device is struggling. Rising await with rising IOPS means you are simply asking for more.

`aqu-sz` is the average queue depth. Combine it with await using Little's Law: concurrency equals throughput times latency. A queue depth of 32 with 10 millisecond waits is a device saturated by a deep pipeline. A queue depth of 1 with 10 millisecond waits is a device that is just slow, and adding parallelism might actually help.

`%util` is the trap. It measures the percentage of time the device had at least one request in flight. On a single spinning disk that is a genuine saturation signal. On an SSD or NVMe device, which service dozens of commands concurrently across many queues, a device can sit at 100 percent util while running at a fraction of its capability. I have watched people chase a 100 percent util alarm on NVMe for an afternoon. Ignore the number on those devices and look at await and queue depth instead.

## Finding the Guilty Process

Device level stats tell you the disk is busy. They do not tell you who is making it busy.

```bash
# Per process read and write rates, sorted by activity.
pidstat -d 2 5

# Interactive view of the same thing.
iotop -oPa

# Which processes are currently blocked on I/O (state D).
ps -eo state,pid,comm,wchan:32 | awk '$1=="D"'
```

The last one is underrated. A process in uninterruptible sleep is waiting on the kernel, usually storage, and the wait channel often names the exact function it is stuck in.

Then there is pressure stall information, which answers "how much time is real work being lost to I/O waiting" directly rather than by inference:

```bash
cat /proc/pressure/io
# some avg10=27.31 avg60=19.04 avg300=8.22 total=...
# full avg10=11.02 avg60=7.88  avg300=3.10 total=...
```

`some` is the share of time at least one task was stalled on I/O. `full` is the share of time every runnable task was stalled, which means the machine got no useful work done at all. A rising `full` value is one of the cleanest saturation signals Linux exposes, and it works per cgroup too, so you can attribute pressure to a specific container or service.

## Separating Latency, Throughput, and IOPS

Most storage arguments are people talking past each other because they are optimizing different quantities.

A device can deliver high throughput and terrible latency, which is exactly what happens with large sequential reads queued deeply. It can deliver low latency and low throughput, which is a lightly loaded device doing small requests. IOPS with no request size attached is a marketing number: 100,000 IOPS at 4 KB is 400 MB/s, while 100,000 IOPS at 128 KB would be 12.8 GB/s, and no one is quoting the second one honestly.

So when you profile, always capture request size alongside the rate. And when someone hands you a storage benchmark, the first question is what block size and what queue depth.

## Reproducing It With fio

Guessing ends when you can reproduce the pattern deliberately. `fio` lets you describe the workload precisely and replay it.

```ini
; database-ish.fio
; Small random reads at moderate concurrency, the classic OLTP shape.
[global]
ioengine=libaio
direct=1
runtime=60
time_based=1
group_reporting=1
filename=/mnt/data/fiotest

[random-read-4k]
rw=randread
bs=4k
iodepth=16
numjobs=4

[sequential-write-1m]
rw=write
bs=1m
iodepth=4
numjobs=1
stonewall
```

```bash
fio database-ish.fio --output-format=normal
```

Two warnings. `direct=1` bypasses the page cache, which is what you want when measuring the device and not what you want when measuring the application's real experience. And `filename` pointed at a raw block device will destroy its contents, so always test against a file on a filesystem unless you genuinely mean to wipe the device.

Compare the fio result to what the application is experiencing. If fio shows the device is capable of far more than the application is getting, the problem is above the device: filesystem, sync behavior, single threaded access, or lock contention. If fio matches the poor numbers, the device really is the limit and you are shopping, not tuning.

## The Order I Work In

Define the symptom as a number with a time window. Look at await and queue depth, not utilization percentage. Attribute the load to a process or a cgroup. Check pressure stall information to confirm the machine is genuinely losing work. Reproduce the shape with fio to establish what the hardware can actually do. Only then change something, and change one thing.

The discipline is the whole trick. Storage problems reward people who measure and punish people who tune from memory.

## References

- [iostat(1) manual page](https://man7.org/linux/man-pages/man1/iostat.1.html)
- [pidstat(1) manual page](https://man7.org/linux/man-pages/man1/pidstat.1.html)
- [Linux kernel: pressure stall information](https://docs.kernel.org/accounting/psi.html)
- [fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html)
- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
