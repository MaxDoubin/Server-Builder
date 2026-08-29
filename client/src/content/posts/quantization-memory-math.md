
## Start with bytes, not adjectives

The most common question in local model land is "will this run on my card," and
the most common answer is somebody guessing. It is arithmetic. A model's
footprint is weights plus key value cache plus a runtime overhead you can
estimate, and all three are computable before you download a single file.

Weights are the easy part. Take the parameter count, multiply by bytes per
parameter, done. A model with 8 billion parameters at 16 bit precision is
8e9 times 2 bytes, which is 16 GB. The same model at 8 bit is 8 GB. At roughly
4 bits it is around 4 GB plus the overhead the [quantization](/blog/model-quantization-by-the-bytes) format carries for
its scaling metadata.

That last point is worth stating clearly: quantization formats are not exactly
their nominal bit width. Weights are grouped into blocks, and each block stores
one or two extra values, a scale and sometimes an offset, so the true cost is
the nominal bits plus a small per block tax. A "4 bit" model in practice lands
somewhere near 4.5 to 5 bits per weight depending on block size. Plan for that,
do not be surprised by it.

## What quantization is actually doing

Quantization maps a range of high precision values onto a smaller set of
representable values. In the affine case you store a scale and a zero point per
block, and each weight becomes a small integer that gets reconstructed on the
fly. The error you introduce is bounded by the step size, so smaller blocks mean
less error and more metadata.

Two things follow from this that matter operationally.

First, precision loss is not uniform across a model. Some tensors are far more
sensitive than others, which is why most formats keep certain layers, commonly
embeddings and some attention projections, at higher precision. The average bits
per weight in a real quantized file is a blend.

Formats also differ in whether they dequantize to a floating point
type before doing the math or run integer kernels directly. That affects speed
as much as size, and it is why two files with the same on disk size can run at
noticeably different rates.

Second, the win is mostly a bandwidth win. Single stream token generation is
bound by how many bytes of weights you have to read per token. Halve the bytes
and you roughly halve the read, which is the real reason quantized models feel
faster, not because the arithmetic got cheaper.

## The KV cache is the part people forget

Weights are static. The key value cache grows with every token in every active
sequence, and it is what actually limits concurrency once the model fits.

For a transformer, the cache holds a key and a value vector per layer per token.
With grouped query attention the cache is sized by the number of key value heads
rather than the number of query heads, which is a large saving on modern models.

```python
def footprint(params_b, bits_per_weight, layers, kv_heads, head_dim,
              seq_len, batch, kv_bytes=2, overhead_gb=1.0):
    weights_gb = params_b * 1e9 * (bits_per_weight / 8) / 1e9
    # 2 tensors (K and V) per layer per token
    kv_bytes_total = (2 * layers * kv_heads * head_dim
                      * seq_len * batch * kv_bytes)
    kv_gb = kv_bytes_total / 1e9
    return {
        "weights_gb": round(weights_gb, 2),
        "kv_cache_gb": round(kv_gb, 2),
        "total_gb": round(weights_gb + kv_gb + overhead_gb, 2),
    }

# 8B model at ~4.5 effective bits, 32 layers, 8 KV heads, head_dim 128,
# 8k context, 4 concurrent sequences
print(footprint(8, 4.5, 32, 8, 128, 8192, 4))
```

Run that with a batch of one and then a batch of sixteen and watch the cache
term overtake everything. This is why a model that "fits" at a short context
falls over the moment you hand it a long document, and why serving frameworks
put so much engineering into cache paging and eviction.

## The overhead you cannot skip

Beyond weights and cache there is a fixed cost: the runtime context, the
compute library workspace, activation buffers for the current forward pass, and
whatever the display is using if the card is also driving a monitor. A gigabyte
or two of headroom is a reasonable planning figure, and running a device to 100
percent of its memory is asking for an allocator failure mid request.

If a model only fits with zero headroom, it does not fit.

## How I actually decide

My order of operations is boring and it works:

1. Compute weights at the precision I want. If that alone is over about 80
   percent of device memory, drop a precision level or pick a smaller model.
2. Compute KV cache at the context length and concurrency I actually need, not
   the maximum the model supports. Most people configure a context window they
   will never fill and pay for it in cache.
3. Add one to two gigabytes of overhead.
4. If the total fits, try it. If it is close, test with a real long prompt,
   because that is where it will break.

The quality question is separate and worth testing rather than theorizing about.
The general pattern people report is that dropping from 16 bit to 8 bit is
usually close to free, 4 bit is a real but often acceptable tradeoff, and below
that degradation becomes obvious. Larger models tolerate aggressive quantization
better than small ones, so a bigger model at lower precision often beats a
smaller model at higher precision for the same memory budget. Test it on your
own task rather than trusting a leaderboard.

The point is that all of this is decidable with a calculator before you spend
an hour downloading. That is the part I want people to take away.

## References

- [Quantization (signal processing)](https://en.wikipedia.org/wiki/Quantization_%28signal_processing%29)
- [Half-precision floating-point format](https://en.wikipedia.org/wiki/Half-precision_floating-point_format)
- [bfloat16 floating-point format](https://en.wikipedia.org/wiki/Bfloat16_floating-point_format)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
