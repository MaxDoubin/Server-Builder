
## Two different questions

When output changes between runs, people jump to one explanation and stop. There are actually two independent sources of variation, and they need separate fixes.

The first is deliberate. The model produces a probability distribution over the next token, and the sampler picks from it. Temperature, top_p, top_k, and repetition penalties all shape that draw, and unless the draw is seeded, it is different every time. This is by design, and turning it off is a configuration change.

The second is not deliberate. Even with sampling disabled, the numbers going into that distribution can differ slightly between runs, and if two candidate tokens have nearly equal probability, a difference far below any threshold you would call meaningful can flip which one wins. That is a numerical property of how the computation is executed, and no sampling parameter turns it off.

## Turning off the deliberate part

Greedy decoding, meaning always take the highest probability token, removes the sampler entirely. If you keep sampling, seed everything that draws random numbers.

```python
import os, random
import numpy as np
import torch

def pin_randomness(seed: int = 1337) -> None:
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    # Ask the framework to refuse nondeterministic kernels rather than
    # silently pick one. This raises if no deterministic version exists.
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False
```

Two things in there are worth calling out. `cudnn.benchmark` normally lets the library try several algorithm implementations and keep the fastest for a given shape, which means the algorithm chosen can depend on what else the machine was doing at the time. Turning it off costs a little performance and removes that variable. And `use_deterministic_algorithms` is the honest setting: rather than quietly substituting a nondeterministic kernel, it raises an error so you know the guarantee is not available.

## The part that survives seeding

Floating point addition is not associative. `(a + b) + c` and `a + (b + c)` can give different results, because each intermediate is rounded to the nearest representable value.

```python
import numpy as np

x = np.array([1.0, 1e16, -1e16, 1.0], dtype=np.float64)
print(x[0] + x[1] + x[2] + x[3])          # 2.0 or 0.0 depending on order
print(((x[0] + x[1]) + x[2]) + x[3])      # 0.0
print(x[0] + (x[1] + x[2]) + x[3])        # 2.0
```

That example is exaggerated to make the rounding visible, but the effect exists at every scale, and it matters enormously for what a GPU does. A matrix multiplication is a very large number of sums, and a parallel implementation splits those sums across thousands of threads and combines partial results in whatever order the threads finish. Change the number of threads, the tile size, the reduction tree, or the algorithm chosen for a given shape, and the order changes, and the last bits of the result change with it.

Now stack the places that can change between two runs:

- A different batch composition, because the shape changed which kernel was selected.
- A different accelerator model, or a different driver or math library version.
- A different level of parallelism, because thread or stream counts were tuned to the machine.
- Reduced precision accumulation, where fewer mantissa bits make the rounding coarser and the divergence larger.

None of these are bugs. They are the cost of running a very large reduction in parallel as fast as possible. Bit exact reproducibility and maximum throughput are in genuine tension, and every serving stack chooses throughput.

## Where the difference becomes visible

A difference in the tenth decimal place of a logit almost never changes anything. It changes the output only when two tokens are nearly tied, and then the greedy pick flips, and because generation is autoregressive, that one different token conditions everything after it. A single flip early in a response can produce a completely different paragraph.

Which explains a pattern that confuses people: most of the time output is identical, and occasionally it diverges completely. That is not a system behaving intermittently. That is a system that is stable except at the ties, where a tiny perturbation gets amplified by the sequential structure of generation.

## What to actually do

I do not chase bit exactness in production. It is expensive, it constrains the serving stack, and it is not what most systems need. What I do instead is control determinism where it changes decisions.

**For evaluation runs, pin everything and record it.** An eval that cannot be re-run is not a measurement. Pin the model artifact by hash, the runtime and library versions, the decoding parameters, the seed, and the batch size, and record all of it with the results. Then a difference between two eval runs means a real change rather than a mystery.

```yaml
eval_run:
  model_sha256: "6f1c9b2e..."
  runtime: "vendor-runtime 1.2.3"
  framework: "torch 2.x"
  decoding:
    temperature: 0.0
    top_p: 1.0
    max_tokens: 512
    seed: 1337
  batch_size: 1
  hardware: "single accelerator, exclusive"
```

Batch size of one and exclusive access matter more than they look. Sharing a device with other work changes scheduling and can change results.

**For tests, do not assert on exact strings.** Assert on properties: the JSON parses, the required fields exist, the value falls in a range, the classification is correct. A test that compares output to a stored string will fail on the next library upgrade for reasons that have nothing to do with quality.

**For production, log enough to explain a difference.** Model hash, runtime version, decoding parameters, and seed on every request. When someone reports that the same input gave a different answer yesterday, you want to answer that in one query rather than one week.

The underlying idea is not specific to machine learning. Any system built on parallel floating point arithmetic has this property, and numerical computing has known it for decades. What is new is that the output is text a person reads, so the difference is visible in a way a slightly different residual in a simulation never was.

## References

- https://pytorch.org/docs/stable/notes/randomness.html
- https://en.wikipedia.org/wiki/IEEE_754
- https://en.wikipedia.org/wiki/Floating-point_arithmetic
- https://numpy.org/doc/stable/reference/random/index.html
- https://docs.python.org/3/library/random.html
