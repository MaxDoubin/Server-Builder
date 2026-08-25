
## The confusing failure

You get an out of memory error asking for a few hundred megabytes. You check
the card and it says a couple of gigabytes are free. Both statements are true
at the same time, and understanding why is the difference between guessing at
batch sizes forever and actually fixing the workload.

The short version: device memory allocations need contiguous address ranges,
and the free space on your card is not one range. It is a lot of small ranges
with live tensors sitting between them.

## What the caching allocator is doing

Asking the driver for memory is slow and synchronizing. So every serious
framework puts a caching allocator in front of it. The allocator grabs large
segments from the driver, carves blocks out of them for your tensors, and when
you free a tensor the block goes back to the allocator's own free list rather
than to the driver.

That is why two numbers exist and why they disagree:

```python
import torch

alloc = torch.cuda.memory_allocated() / 1024**3
resv = torch.cuda.memory_reserved() / 1024**3
print(f"allocated by tensors: {alloc:.2f} GiB")
print(f"reserved from driver: {resv:.2f} GiB")
print(torch.cuda.memory_summary(abbreviated=True))
```

`memory_allocated` is what your live tensors occupy. `memory_reserved` is what
the process has taken from the driver and is holding in its pools. The tool
that reads the driver sees only the reserved number, which is why external
monitoring shows a process pinning most of the card while the framework
insists it has room.

Reuse is size-sensitive. A freed 512 MiB block satisfies a later 512 MiB
request instantly. It does not help a request for 600 MiB unless it happens to
sit next to enough adjacent free space in the same segment. Blocks are split
to serve smaller requests, and the leftover slivers are what accumulate.

## Where the holes come from

Fragmentation is created by variety, not by volume. A workload that allocates
the same shapes over and over reaches a steady state after a few iterations
and then never touches the driver again. A workload with changing shapes keeps
asking for sizes that do not match anything on the free list.

The usual sources:

- Variable sequence lengths. Every distinct padded length is a distinct
  allocation size.
- Variable batch sizes, especially a serving path that batches whatever
  arrived in the last window.
- A long-lived allocation made in the middle of a run, which lands in the
  middle of a segment and permanently splits it.
- Mixing a large one-off operation, such as loading or converting weights,
  into the same pool as steady-state activations.
- Repeated grow-then-shrink patterns during evaluation between training steps.

Time matters as much as size. A tiny tensor that lives for the entire run and
happens to sit at the midpoint of a big segment is worse than a large tensor
that is freed immediately.

## Things that actually help

Reduce shape variety. Bucket sequence lengths to a small set of fixed values
and pad to the bucket. Eight buckets that repeat forever fragment far less
than a continuous distribution of lengths, even though bucketing wastes a
little compute on padding. This is the single highest-return change in most
serving code.

Allocate the big, long-lived things first. Load weights, build persistent
buffers, and reserve any workspace before the run starts churning. Anything
permanent that gets created late is a permanent hole.

Warm up with the worst case. Run one iteration at your maximum shape before
serving traffic. If it fits then, the allocator has already carved out
segments large enough, and later smaller requests fit inside them. If it does
not fit then, you would rather find out at startup than at hour six.

Do not scatter empty-cache calls through the hot path. Releasing cached
segments back to the driver does defragment the pool, but it also throws away
the cache you built and forces synchronization, and calling it every iteration
is a well-known way to make a job slower and no more stable. Use it once
between distinct phases, such as after loading and before serving.

Keep one process per device where you can. Two processes on one card each keep
their own pool and neither can use the other's free blocks, so the effective
capacity is lower than the sticker says.

## How I approach it

When a job dies on memory, I do not immediately cut the batch size. Cutting
batch size hides a fragmentation problem and costs throughput permanently. I
check the allocated versus reserved gap first. A small gap means the workload
genuinely needs more memory than exists, and then shrinking shapes or
offloading is the honest fix. A large gap means the memory is there and the
layout is wrong, which is a code problem I can solve without giving up
performance.

Then I look at when the failure happens. Failing on iteration one is a sizing
problem. Failing on iteration four hundred, after hours of clean running, is
almost always fragmentation, and the fix lives in the shapes the code
requests, not in the size of the card.

## References

- https://pytorch.org/docs/stable/notes/cuda.html
- https://docs.nvidia.com/cuda/cuda-c-programming-guide/
- https://en.wikipedia.org/wiki/Fragmentation_(computing)
- https://en.wikipedia.org/wiki/Memory_pool
- https://en.wikipedia.org/wiki/Buddy_memory_allocation
