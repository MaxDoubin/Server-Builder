
## What quantization actually changes

Quantization is the practice of storing model weights in fewer bits than the
format they were trained in. Training usually happens in a 16 bit float
format like bfloat16, sometimes with 32 bit accumulators. Serving does not
have to. If you can represent each weight with 8 bits, or 4, the model takes
less memory and, more importantly for generation speed, fewer bytes have to
move from memory to the compute units for every token.

The mechanics are the same idea as quantizing any signal. You take a range of
real values and map it onto a small set of integers. You store the integers
plus enough metadata to reconstruct an approximation of the original. What
changes between schemes is how the range is chosen, how fine grained the
metadata is, and whether the arithmetic is done in the low precision format
or upconverted first.

## The arithmetic, first pass

The naive calculation is parameters times bits divided by eight:

```python
def naive_gb(param_billions, bits):
    return param_billions * 1e9 * bits / 8 / 1e9


for bits in (16, 8, 6, 4):
    print(bits, round(naive_gb(8, bits), 2), "GB")
```

An 8 billion parameter model is roughly 16 GB at bfloat16, 8 GB at 8 bits,
and 4 GB at 4 bits. That is the number people quote, and it is close enough
to plan with, but it is always optimistic.

## Block scales, and why 4 bit is not exactly 0.5 bytes per weight

You cannot map an entire weight matrix onto 16 integer levels and expect the
result to be useful. The values in a tensor span a wide range, and outliers
wreck a single global scale. Practical schemes therefore quantize in small
blocks, commonly on the order of 32 or 64 weights, and store a scale (and
often a zero point or minimum) per block in higher precision.

That metadata is real memory:

```python
def real_gb(param_billions, bits, block=32, scale_bits=16, zero_bits=16):
    n = param_billions * 1e9
    weight_bits = n * bits
    meta_bits = (n / block) * (scale_bits + zero_bits)
    return (weight_bits + meta_bits) / 8 / 1e9


def effective_bpw(bits, block=32, scale_bits=16, zero_bits=16):
    return bits + (scale_bits + zero_bits) / block


print(round(effective_bpw(4), 2), "bits per weight effective")
print(round(real_gb(8, 4), 2), "GB")
```

With a 32 weight block and 16 bit scale plus 16 bit zero point, a nominal
4 bit format costs about 5 bits per weight in practice. Smaller blocks mean
better accuracy and more overhead. Some formats use a coarser second level
scale to claw part of that back.

On top of that, most schemes leave some tensors alone. Embeddings, the output
projection, layer norms, and sometimes the attention key and value
projections are commonly kept at higher precision because they are
disproportionately sensitive. So the file on disk lands above the naive
number, and the runtime footprint lands above the file, because the KV cache,
activations, and the framework itself all want memory too.

My planning rule: take the naive number, add about 25 percent for format
overhead and preserved tensors, then add the KV cache for the context length
I actually intend to use, then leave headroom. If that total does not fit
with room to spare, the model does not fit.

## What you lose

Quantization is lossy, and the loss is not evenly distributed across tasks.
In my experience the degradation shows up first in the places that need
precision rather than fluency: long chains of arithmetic, strict format
adherence, code that has to compile, and recall of rare specifics. Casual
conversational quality holds up much longer, which is exactly why informal
"it still sounds fine" testing is misleading.

Two other properties matter operationally. Weight-only quantization shrinks
the memory traffic for weights but leaves activations in higher precision,
which is the common case for local serving. Activation quantization is harder
because activations have runtime dependent outliers. And calibration based
methods, which use a small sample of representative data to choose scales,
produce better results than pure round to nearest, but they inherit whatever
bias is in the calibration set.

## How I decide what to run

The question I ask is not "what is the best quantization," it is "what is the
largest model I can hold at my target context, and is the quantized large
model better than the unquantized small one." Usually it is. A bigger model
at reduced precision tends to beat a smaller model at full precision for the
same memory budget, up to a point, and that point arrives fast below roughly
4 bits per weight, where quality tends to fall off sharply rather than
gracefully.

Practical checklist before I commit to a format:

1. Compute the real footprint including block overhead, not the naive one.
2. Add the KV cache at my real context length, not the default.
3. Run a task specific check, ideally something with a right answer, and
   compare against the higher precision version of the same model.
4. Measure decode speed, since fewer bytes per weight should show up directly
   as more tokens per second. If it does not, something else is the
   bottleneck and the smaller format is not buying what I thought.

Write down the exact format used alongside any result you record. "The 8B
model" is not a reproducible statement. "The 8B model at roughly 5 effective
bits per weight, 8k context" is.

## References

- [Quantization (signal processing)](https://en.wikipedia.org/wiki/Quantization_(signal_processing))
- [bfloat16 floating-point format](https://en.wikipedia.org/wiki/Bfloat16_floating-point_format)
- [IEEE 754](https://en.wikipedia.org/wiki/IEEE_754)
- [PyTorch quantization documentation](https://pytorch.org/docs/stable/quantization.html)
