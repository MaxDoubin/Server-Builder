
## The counter measures time, not work

The utilization percentage that `nvidia-smi` prints, and that most dashboards
graph as if it were CPU utilization, is the fraction of the sample period
during which at least one kernel was resident on the device. That is the whole
definition. It says nothing about how many of the streaming multiprocessors
were busy, how wide the vectors were, or whether the arithmetic units did
anything at all.

A kernel that launches a single thread and loops for a second reports 100
percent utilization on a card with tens of thousands of usable threads. A well
optimised pipeline that finishes early and idles between requests reports
something lower while doing vastly more work. Reading this counter as "the GPU
is full" is the accelerator equivalent of reading load average as CPU percent.

I got burned by this once and now I treat that number as a liveness check: is
the device doing anything? Yes or no. For anything else I look elsewhere.

## Three different meanings of full

There are at least three separate ceilings, and only one of them is usually
the one you are hitting.

**Occupancy** is how many warps are resident per SM versus the hardware
maximum. Low occupancy usually comes from register pressure or shared memory
per block, and it means the scheduler cannot hide memory latency. High
occupancy is not automatically good either, since a memory bound kernel with
perfect occupancy is still waiting on DRAM.

**Memory bandwidth** is how close you are to the achievable DRAM throughput.
For a large fraction of the work people actually run on accelerators, this is
the real ceiling, and adding compute capability changes nothing.

**Compute throughput** is the arithmetic rate, which is the ceiling that
marketing numbers describe and that most real kernels never approach.

The roofline model puts these on one picture. Work out arithmetic intensity,
which is useful floating point operations divided by bytes moved to and from
memory, then compare it to the ridge point of the device, which is peak
arithmetic rate divided by peak bandwidth. Below the ridge you are memory
bound, above it you are compute bound.

```python
def roofline(flops, bytes_moved, peak_flops, peak_bytes_per_s):
    '''Classify a kernel. Fill in the two peak numbers from the datasheet
    for the device you actually have, not from a review.'''
    intensity = flops / bytes_moved            # FLOP per byte
    ridge = peak_flops / peak_bytes_per_s      # FLOP per byte
    if intensity < ridge:
        attainable = intensity * peak_bytes_per_s
        bound = "memory"
    else:
        attainable = peak_flops
        bound = "compute"
    return {
        "intensity": intensity,
        "ridge_point": ridge,
        "bound_by": bound,
        "attainable_flops": attainable,
    }
```

The reason this matters operationally: if the arithmetic says you are memory
bound, then no amount of kernel tuning, batching strategy, or a faster card
with the same memory subsystem changes your throughput. Reducing bytes moved
does.

## What I graph instead

Power draw is the most honest single signal I have found. Arithmetic units
burn power. A device sitting at 100 percent reported utilization while pulling
a small fraction of its board power limit is spending its time waiting, not
computing. It costs nothing to collect and it correlates with real work far
better than the utilization counter does.

Clock frequency next to power tells you about capping. If clocks sag while
power sits at the limit, you are power limited. If clocks sag while power is
below the limit and temperature is high, you are thermally limited, and the
answer is airflow, not code.

```bash
# One row per second, easy to pipe into a file or a collector
nvidia-smi --query-gpu=timestamp,utilization.gpu,utilization.memory,memory.used,power.draw,clocks.sm,temperature.gpu --format=csv,noheader,nounits -l 1

# Compact live view including throttle reasons
nvidia-smi dmon -s pucm
```

Memory used is worth graphing separately from memory utilization, because
they are unrelated. Utilization of memory is the percentage of time the memory
controller was reading or writing. Memory used is capacity. A device can be at
95 percent capacity and 5 percent bandwidth utilization, which means you fit
but you are not moving data.

Then, above all of that, the number that actually matters: end to end request
latency percentiles and completed work per second at the service boundary.
Device counters explain why the service metric moved. They are not a
substitute for it.

## How I reason about a slow accelerator

My order of questions, roughly:

1. Is the device doing anything at all? Utilization near zero with a busy
   host means the bottleneck is upstream: data loading, preprocessing, a
   single threaded Python loop, or a synchronous copy.
2. Is power near the board limit? If yes, the device is genuinely working and
   the answer is algorithmic or a different device.
3. If power is low but utilization is high, look for tiny kernels, launch
   overhead, and host synchronisation. Many small launches keep the "at least
   one kernel resident" counter pegged while the machine idles between them.
4. Is the transfer path the problem? Bytes crossing PCIe at every step will
   dominate anything the device does.
5. Only then start reading occupancy and profiling individual kernels.

The general lesson transfers well beyond accelerators. Any counter named
"utilization" deserves one question before you trust it: utilization of what,
measured how? Time based counters and capacity based counters answer different
questions, and dashboards happily plot them on the same axis.

## References

- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [CUDA](https://en.wikipedia.org/wiki/CUDA)
- [Thermal design power](https://en.wikipedia.org/wiki/Thermal_design_power)
- [Linux kernel GPU driver documentation](https://docs.kernel.org/gpu/index.html)
- [Prometheus: histograms and summaries](https://prometheus.io/docs/practices/histograms/)
