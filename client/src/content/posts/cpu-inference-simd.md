
## A CPU Is Not A Bad Matrix Machine

There is a reflex that says accelerators are for models and CPUs are for
everything else. It is a useful heuristic and it is also frequently wrong for
small and mid sized models, batch jobs where latency is not critical, and
anything you want to run on hardware you already own.

The interesting question is not whether a CPU can do it. It obviously can. The
question is whether the software you are running is using the machine's vector
units, and the honest answer for a default install is often that it is using
some of them, badly.

## The Vector Units You Actually Have

Every mainstream CPU for the last two decades has SIMD: single instruction,
multiple data. One instruction applies the same operation to a whole register
full of values at once. On x86 that lineage runs through SSE, AVX, AVX2, and
AVX-512, with register widths of 128, 256, and 512 bits respectively. On ARM it
is NEON with 128 bit registers, and SVE where the width is implementation
defined and the code is written to be width agnostic.

Width translates directly into work per instruction. A 256 bit register holds
eight 32 bit floats or sixteen 16 bit values. A 512 bit register holds twice
that. Newer parts also add instructions aimed specifically at this workload,
such as dot product instructions over low precision integers, which do a
multiply and accumulate across several lanes in one go.

Find out what you have before you tune anything.

```bash
# x86: the flags line is the inventory.
lscpu | tr ' ' '\n' | grep -E '^(avx|avx2|avx512|f16c|fma|amx|vnni)' | sort -u

# ARM: same idea, different names.
grep -m1 Features /proc/cpuinfo | tr ' ' '\n' | grep -E 'asimd|sve|i8mm|bf16'

# Physical cores, threads per core, and sockets.
lscpu | grep -E '^(CPU\(s\)|Thread|Core|Socket|Model name)'
```

If your runtime was built with a generic baseline so it runs anywhere, it may be
emitting SSE2 on a machine that supports AVX-512. That is a large factor left on
the floor, and it is invisible unless you check.

## Fused Multiply Add And Why GEMM Is Everything

Almost all of the arithmetic in a transformer forward pass is dense matrix
multiplication. Attention projections, the feed forward blocks, and the output
head are all general matrix multiply, or GEMM. If GEMM is fast, inference is
fast; nothing else is close in share of total work.

The core operation inside GEMM is multiply and accumulate: take a product and
add it to a running total. Fused multiply add does both in one instruction with
one rounding step, which roughly doubles arithmetic throughput compared to a
separate multiply and add, and is more accurate as a bonus. Checking for the
`fma` flag above is checking whether the fast path exists.

The reason a naive triple nested loop is slow is not the instruction count. It
is that the same values get fetched from memory over and over. Good GEMM
implementations block the computation so that a tile of the output stays
resident in registers while tiles of the inputs stream through cache. The
blocking factors are chosen to fit the register file and the cache levels of the
specific microarchitecture, which is why a hand tuned or auto tuned BLAS beats
straightforward code by a very large margin.

You almost never write this yourself. What you do is make sure the runtime is
linked against a BLAS implementation tuned for your CPU rather than a reference
one, and that the kernels it selects at load time match the ISA you found above.

## Threads: More Is Not More

The default in a lot of software is to spawn one thread per logical CPU. For
this workload that is usually wrong.

Simultaneous multithreading gives two logical CPUs per physical core that share
one set of execution units, including the vector units. A vectorized GEMM kernel
already keeps those units close to saturated, so the second thread on a core
mostly adds scheduling overhead and cache pressure. Start with one thread per
physical core and measure before going higher.

Oversubscription is worse than it sounds because these workloads use barrier
synchronization between layers. Every thread waits for the slowest one. If the
OS descheduled a thread, the whole step stalls. Leave a core free for the rest
of the system rather than claiming all of them.

```bash
# Physical cores only, one thread each.
CORES=$(lscpu -p=Core,Socket | grep -v '^#' | sort -u | wc -l)

OMP_NUM_THREADS=$CORES \
OMP_PROC_BIND=close \
OMP_PLACES=cores \
  ./your-runtime --threads "$CORES" ...

# Confirm placement rather than trusting it.
pidstat -t -p "$(pgrep -f your-runtime)" 1 5
```

Pinning matters as much as counting. A thread that migrates between cores
abandons a warm cache. `OMP_PROC_BIND` and `OMP_PLACES` handle this for OpenMP
based runtimes, and `taskset` gives you a blunt instrument when the runtime does
not expose the knobs.

## Data Layout, Precision, And How I Check

Two more levers are worth knowing.

Layout: kernels want contiguous data in the direction they stride. Weights are
frequently repacked at load time into a layout the kernel prefers, which is why
some runtimes have a noticeable startup delay and then run fast. If you are
loading a model repeatedly in a short lived process, that repack is pure
overhead and caching the packed form is worth doing.

Precision: narrower types mean more values per vector register and therefore
more lanes of work per instruction. Support is uneven and hardware specific, so
this is a case where you benchmark on the machine in front of you rather than
reading a table.

Run a fixed prompt, measure tokens per second, then change one thing at a time:
thread count, pinning, BLAS backend, precision. Keep a small text file of the
results. The first two changes usually account for most of the improvement, and
without measurement you cannot tell which two.

## References

- [Single instruction, multiple data](https://en.wikipedia.org/wiki/Single_instruction,_multiple_data)
- [Advanced Vector Extensions](https://en.wikipedia.org/wiki/Advanced_Vector_Extensions)
- [AVX-512](https://en.wikipedia.org/wiki/AVX-512)
- [Basic Linear Algebra Subprograms](https://en.wikipedia.org/wiki/Basic_Linear_Algebra_Subprograms)
- [lscpu(1)](https://man7.org/linux/man-pages/man1/lscpu.1.html)
- [OpenMP specifications](https://www.openmp.org/specifications/)
