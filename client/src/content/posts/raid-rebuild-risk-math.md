
## The window is the whole problem

Redundancy does not mean a disk failure is a non event. It means a disk failure starts a clock. Until the array is rebuilt, you are running with less redundancy than you designed for, and for single parity that means no redundancy at all. Everything about rebuild risk comes down to how long that window is and what can happen inside it.

Start with the length of the window. A rebuild has to write the entire capacity of the replacement drive, and to do that it has to read the corresponding data from every surviving member. The rebuild rate is bounded by the slowest of: the write speed of the new drive, the aggregate read speed of the survivors, and whatever share of the drives your array is willing to spend while still serving production traffic.

```python
def rebuild_hours(capacity_tb, sustained_mb_s, foreground_share=0.5):
    # Time to write one full replacement drive, given a share of throughput
    bytes_total = capacity_tb * 1_000_000_000_000
    effective = sustained_mb_s * 1_000_000 * (1 - foreground_share)
    return bytes_total / effective / 3600

for cap in (4, 8, 16, 20):
    print(f"{cap:>3} TB  idle {rebuild_hours(cap, 180, 0):5.1f} h"
          f"   busy {rebuild_hours(cap, 180, 0.7):6.1f} h")
```

Run that and the shape is obvious. Drive capacity has grown far faster than sustained sequential throughput on spinning media, so rebuild time scales roughly with capacity. A large modern drive in a busy array is not a one hour job. It can be a multi day job, and it is a multi day job during which the array is degraded and every surviving drive is being read end to end at full rate.

## Why the second failure is not independent

The textbook calculation multiplies annualized failure rates as if drives fail independently. They do not.

Drives in the same array were usually bought at the same time, from the same production run, and have spun the same hours in the same chassis at the same temperature with the same vibration. Failure rates follow a bathtub curve: elevated in the first weeks, low through the middle of life, rising at the end. Members of one array move along that curve together. When one reaches the rising part, its siblings are close behind.

Then there is the rebuild itself. A rebuild is the heaviest sequential read workload the array will ever see, applied to every surviving drive at once, for hours or days. If a marginal drive is going to fail, this is when. The rebuild is not a neutral observer of the second failure, it is a contributing cause.

## Unrecoverable read errors, honestly

The other failure mode is not a dead drive but a single bad sector. Consumer drive specifications commonly quote an unrecoverable read error rate on the order of one sector per 10^14 bits read, with enterprise drives typically an order of magnitude better. During a single parity rebuild, one URE on a surviving drive means that stripe cannot be reconstructed.

The naive math says: read 10^14 bits, which is around 12.5 TB, and you expect a URE. Since a rebuild reads the full capacity of every surviving member, large single parity arrays look doomed.

That naive math is wrong in ways worth understanding. The specification is a conservative upper bound rather than an observed rate, real drives generally do better, and errors are not uniformly distributed. But the directional conclusion survives the correction: single parity across many large drives is a bet that gets worse as capacity grows, and the failure it exposes is not always fatal for the whole array. Modern implementations often lose one stripe and log it rather than aborting the rebuild, which is a much better outcome, and one reason filesystem level checksums matter. Knowing which file is damaged is far better than knowing something somewhere is.

## What I actually do about it

Five practices, in order of how much they buy you.

**Scrub on a schedule.** A scrub reads every block and verifies parity or checksums while the array is healthy and redundant. It finds the latent bad sector months before a rebuild would find it, and it can repair it while there is still parity to repair from. Monthly is a reasonable cadence. An array that is never scrubbed is an array where all the errors are saved up for the worst possible moment.

**Use double parity or mirrors for large drives.** With [RAID](/blog/raid-levels-comparison) 6 or equivalent, a URE during a rebuild is recoverable because there is a second parity block. Mirrored pairs rebuild by copying one drive rather than reading all of them, which shortens the window and reduces the load, at the cost of half your raw capacity.

**Keep a hot spare, and mind the shelf spare.** A hot spare removes human latency from the front of the window. It does nothing about the rebuild itself, but the time between failure and someone noticing is often longer than the rebuild.

**Do not buy the whole array from one batch.** Mixing purchase dates or vendors decorrelates the failure curve a little. It complicates procurement, and it is still worth it.

**Remember what RAID is for.** Erasure coding and replication both protect against device failure. Neither protects against deletion, corruption written through the filesystem, or a controller that scribbles. An array is availability, not backup. The number of people who learn that distinction during a rebuild is higher than it should be.

## The comparison that matters

Replication and erasure coding solve the same problem with different arithmetic. Three way replication stores 3x the data and rebuilds by copying, which is fast and simple, and any two failures are survivable. Erasure coding with, say, 8 data and 3 parity fragments stores about 1.4x and survives three failures, but reconstruction requires reading eight fragments, possibly across a network, for every degraded object.

That trade is the real design question in any distributed storage system, and it is the same question as RAID 6 versus mirrors, scaled up. Cheap capacity, expensive recovery, or expensive capacity, cheap recovery. Pick deliberately, and size the rebuild window before you commit.

## References

- https://en.wikipedia.org/wiki/Standard_RAID_levels
- https://en.wikipedia.org/wiki/RAID
- https://en.wikipedia.org/wiki/Erasure_code
- https://www.kernel.org/doc/html/latest/admin-guide/md.html
- https://man7.org/linux/man-pages/man8/mdadm.8.html
- https://man7.org/linux/man-pages/man4/md.4.html
