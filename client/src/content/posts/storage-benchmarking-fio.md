
## Four numbers, not one

"How fast is this disk" is not a question with one answer. There are four, and a device can be excellent at one and terrible at another.

Sequential throughput in MB/s, which matters for backups, media, and bulk copies. Random IOPS at small block sizes, which matters for databases, VM images, and anything with a lot of small files. Latency, usually at a stated percentile, which is what users actually feel. And consistency, meaning what happens to all three after the device has been busy for a while.

Vendor sheets quote the first two under ideal conditions. Your workload cares more about the last two.

## Why your first benchmark was wrong

There are four classic ways to measure nothing.

The page cache. Linux caches file data in RAM. A read test on a file that fits in memory measures RAM, and you get numbers that no storage device could produce. The fix is direct IO, or a working set several times larger than system memory, or both.

Short runs. Consumer SSDs write incoming data to a fast buffer region and flush it later. A thirty second write test may never leave that buffer. Run long enough to exhaust it and you see the real sustained rate, which can be dramatically lower.

Wrong queue depth. A single threaded, queue depth one test measures latency, not throughput. Flash devices need many outstanding requests to reach their rated IOPS. Testing a database workload at queue depth 64 is equally wrong in the other direction.

Fresh drive. A never used device performs better than one that has been filled and rewritten, because garbage collection has nothing to do yet. Precondition it if you care about steady state.

## A job file I trust

I keep this and edit the top section per run:

```ini
[global]
ioengine=libaio
direct=1
filename=/mnt/test/fio.dat
size=16G
runtime=300
time_based=1
ramp_time=30
group_reporting=1
percentile_list=50:95:99:99.9

[seq-read]
rw=read
bs=1M
iodepth=32
numjobs=1
stonewall

[seq-write]
rw=write
bs=1M
iodepth=32
numjobs=1
stonewall

[rand-read-4k]
rw=randread
bs=4k
iodepth=32
numjobs=4
stonewall

[rand-write-4k]
rw=randwrite
bs=4k
iodepth=32
numjobs=4
stonewall

[latency-qd1]
rw=randread
bs=4k
iodepth=1
numjobs=1
stonewall
```

The parts that matter: `direct=1` bypasses the page cache, `ramp_time` discards the warm up, `time_based` with a long `runtime` gets past write buffers, `stonewall` runs the sections in sequence rather than all at once, and `percentile_list` gives you tail latency rather than just an average.

Run it and keep the output:

```bash
sudo fio storage.fio --output-format=json --output=results-$(date +%F).json
```

## Reading the output

For the sequential jobs, read bandwidth. For the random jobs, read IOPS. For the queue depth one job, read the completion latency percentiles and ignore bandwidth entirely.

The number I look at hardest is `clat` at the 99.9th percentile. Averages hide the behavior that causes complaints. A device with a good average and a 99.9th percentile in the hundreds of milliseconds will produce a system that feels randomly broken, and nobody will be able to reproduce it on demand.

Also watch for a bandwidth number that starts high and collapses partway through the run. `fio` prints periodic status; if throughput drops off a cliff at minute two, you found the write buffer boundary and everything before it was fiction.

## Comparing fairly

If you are comparing two devices or two configurations, change exactly one thing. Same block sizes, same queue depths, same runtime, same filesystem, same fill level, same test file size. Write the parameters down next to the results, because in a month you will not remember whether the good number came from a queue depth of 32 or 1.

Two more habits. Benchmark through the layer you will actually use: if the workload runs on a VM on a filesystem on a RAID set, testing the raw device tells you about the device, not about your stack. And never point a write test at a filename on a device that holds data, because `fio` will happily create and overwrite exactly what you told it to.

## The honest limitation

Synthetic benchmarks tell you the shape of a device's performance. They do not tell you how your application will behave, because real workloads mix reads and writes, have locality, and come in bursts. Use `fio` to compare hardware and to sanity check a configuration change. Use production metrics to decide whether the storage is actually your problem. I have replaced a drive that benchmarked poorly and changed nothing about the symptom, because the bottleneck was somewhere else entirely.

## References

- [fio documentation](https://fio.readthedocs.io/en/latest/fio_doc.html)
- [Linux kernel administration guide](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/)
