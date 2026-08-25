
## The number on the box is rarely the number that binds

Every accelerator spec sheet leads with peak floating point throughput. It is a
real number and it is almost never the thing limiting your workload. The
limiting factor for a large fraction of real work, and for nearly all
autoregressive model inference, is how many bytes per second the chip can pull
from its own memory.

The reason is arithmetic intensity: the ratio of floating point operations
performed to bytes moved. Every kernel has one. Every chip has a ratio of peak
compute to peak bandwidth. Compare the two and you know which resource you will
run out of first.

## The roofline, in one paragraph

Plot achievable performance against arithmetic intensity. At low intensity you
are limited by bandwidth, and performance rises linearly as intensity rises. At
some point you hit the chip's peak compute and the line goes flat. The graph
looks like a roof: a slanted part and a flat part. The corner is the machine
balance point, the arithmetic intensity at which a kernel transitions from
memory bound to compute bound.

Modern accelerators have very high machine balance. Peak floating point
throughput has grown faster than memory bandwidth for years, which pushes the
corner further right and means more kernels land on the slanted, bandwidth
limited side. This is why so much accelerator engineering is about memory:
wider buses, stacked memory, bigger caches, and fusing operations so
intermediate results never leave fast memory.

## Where common workloads land

**Large matrix multiplication with big batches.** High intensity. Each element
loaded participates in many operations. Compute bound. This is the case the
marketing number describes, and it is why training benchmarks look good.

**Autoregressive decode, one token at a time.** Every weight is read from memory
and used in roughly two floating point operations. Intensity is close to the
worst case possible. Hard memory bound.

**Prompt processing, or prefill.** All the prompt tokens go through at once, so
the same weight read is amortised across many tokens. Intensity is high.
Compute bound. This is why a long prompt and a long generation feel like
completely different workloads on the same model.

**Elementwise operations, normalisation, activation functions.** Almost no
arithmetic per byte. Bandwidth bound, always, which is why kernel fusion exists.

```python
def roofline(mem_bw_gb_s, peak_tflops, arithmetic_intensity):
    """Achievable TFLOPS at a given FLOPs-per-byte ratio."""
    bandwidth_limit = mem_bw_gb_s * 1e9 * arithmetic_intensity / 1e12
    balance = (peak_tflops * 1e12) / (mem_bw_gb_s * 1e9)
    return {
        "machine_balance_flops_per_byte": round(balance, 1),
        "achievable_tflops": round(min(bandwidth_limit, peak_tflops), 2),
        "bound": "memory" if bandwidth_limit < peak_tflops else "compute",
    }

# batched matmul: high intensity
print(roofline(1000, 300, 200))
# single-stream decode: about 0.5 FLOPs per byte at 16-bit weights
print(roofline(1000, 300, 0.5))
```

Run those two and the gap is enormous. The second case uses a tiny fraction of
the chip's arithmetic capability no matter how good the chip is at arithmetic.
That is not a software problem you can optimise away, it is the shape of the
computation.

## What this implies when comparing hardware

If your workload is decode heavy, rank candidates by memory bandwidth and memory
capacity, in that order, and treat floating point throughput as a tiebreaker. A
chip with half the peak compute and the same bandwidth will produce roughly the
same tokens per second on a single stream.

Capacity and bandwidth usually travel together, because both come from the
memory subsystem design, but not always. Some products pair a large amount of
slower memory with a fast chip, which is great for fitting a big model and
disappointing for generation speed. Others do the reverse. Read both numbers.

Unified memory architectures, where the CPU and accelerator share one pool, are
an interesting middle case. Capacity can be very large relative to a discrete
card, and bandwidth sits somewhere between conventional system memory and
dedicated high bandwidth memory. For running a model too big for a discrete
card, that tradeoff can be exactly right. For maximum throughput per stream it
is not.

The system side matters less than people expect. The link between host and
accelerator carries the model once at load time and then small amounts of
activation data. A narrower link makes loading slower and steady state
generation about the same. Do not over invest there for inference, though it
does matter for training pipelines that stream data continuously.

## How to get bandwidth bound work to go faster

There are only a few honest options, and they all reduce to moving fewer bytes.

Reduce precision. Half the bytes per weight is roughly half the read time per
token. This is the single biggest lever available and it is why quantization is
so central to local inference.

Batch. Reading the weights once and using them for many sequences raises
arithmetic intensity directly. This does not help a single user waiting on a
single response, but it transforms throughput for a server with concurrent
requests.

Fuse kernels so intermediate tensors stay in registers or on chip memory instead
of round tripping through main memory. Frameworks do a lot of this for you and
it is worth knowing why the compiled path is faster than the eager one.

Keep the working set resident. Spilling to host memory over a link that is an
order of magnitude slower than local memory will dominate everything else.

## The takeaway

When I evaluate any accelerator, my first question is bytes per second, my
second is capacity, and my third is what the software stack supports. Peak
floating point comes fourth, and mostly matters for training and prefill.

The nice thing about reasoning from arithmetic intensity is that it does not go
stale. Product generations turn over constantly. The ratio of operations to
bytes in a matrix vector multiply is fixed by mathematics, and it will predict
which side of the roofline you land on for as long as the hardware looks
anything like it does now.

## References

- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [High Bandwidth Memory](https://en.wikipedia.org/wiki/High_Bandwidth_Memory)
- [CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/index.html)
- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [Transformer (deep learning architecture)](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29)
