
## The question everyone asks wrong

The first thing people ask about running a model locally is "how many parameters." That number tells you almost nothing on its own. What you actually need is bytes of memory in three buckets: the weights, the key/value cache, and the runtime slop around both. If you can do that arithmetic on paper, you stop guessing and you stop downloading twenty gigabytes to find out it will not load.

I do this math before I touch a download, because it also tells me the second thing I care about: how fast the thing will be. Memory capacity decides whether it runs. Memory bandwidth decides whether it is usable.

## Bucket one: weights

Weight memory is parameters times bytes per parameter. That is the whole formula.

At 16-bit precision each parameter is two bytes, so a 7 billion parameter model wants roughly 14 GB just to sit in memory. At 8-bit it is roughly 7 GB. At 4-bit it is roughly 3.5 GB, plus a bit of overhead because quantized formats store scale and zero point metadata per block of weights. Call it 10 to 20 percent above the naive number and you will not be surprised.

Quantization is not free. Reducing precision loses information, and how much that hurts depends on the format and on what you are asking the model to do. My rule is that 8-bit is close to invisible for most tasks, 4-bit is usually fine for chat and summarizing, and anything below 4-bit is a science experiment I would not put behind a service.

## Bucket two: the KV cache

This is the bucket that surprises people, because it grows with usage rather than sitting still.

During generation, the model caches a key and a value vector for every token, in every layer, for every attention head that has its own key/value projection. The size is:

    2 * layers * kv_heads * head_dim * bytes_per_element * sequence_length * batch_size

The leading 2 is because you store both K and V. Models using grouped query attention share key/value projections across several query heads, which is why `kv_heads` is often much smaller than the total attention head count, and why the cache is far cheaper on those models than it used to be.

The important property is that this term is linear in context length and linear in concurrent requests. A long context feature is a memory feature, not just a config flag.

## Bucket three: everything else

Then there is the slop: the framework's CUDA or Metal context, activation buffers for the forward pass, the allocator's fragmentation, and whatever the serving layer reserves up front. I budget 1 to 2 GB of headroom on a dedicated accelerator and more if I am also driving a display from the same device. If you fill memory to 99 percent you will get an allocation failure on a long prompt at 2 in the morning instead of at your desk.

Putting all three buckets in one function makes the trade offs visible:

```python
def model_memory_gb(params_b, bits, layers, kv_heads, head_dim,
                    ctx=8192, batch=1, kv_bits=16, overhead_gb=1.5):
    gib = 1024 ** 3
    weights = params_b * 1e9 * (bits / 8) * 1.10        # +10% for quant metadata
    kv = 2 * layers * kv_heads * head_dim * (kv_bits / 8) * ctx * batch
    return {
        "weights_gb": round(weights / gib, 2),
        "kv_cache_gb": round(kv / gib, 2),
        "total_gb": round((weights + kv) / gib + overhead_gb, 2),
    }

# a 7B-class model, 32 layers, 8 KV heads, head_dim 128, 8k context
print(model_memory_gb(7, 4, 32, 8, 128))
```

Change `ctx` to 32768 and watch the second number move while the first one does not. That is the whole lesson.

## Speed follows from the same numbers

Single stream token generation is memory bandwidth bound, not compute bound. To produce one token the hardware has to read essentially every weight once. So the ceiling on tokens per second is roughly memory bandwidth divided by the size of the weights in memory. A 4 GB quantized model on a device with a few hundred GB/s of bandwidth has a theoretical ceiling in the tens of tokens per second, and real systems land meaningfully below the ceiling because of cache behavior and kernel overhead.

Two consequences I rely on. First, quantizing does not just help you fit, it makes generation faster, because there are fewer bytes to stream. Second, offloading layers to system RAM is a cliff, not a slope: the moment part of the model lives behind a PCIe link that is an order of magnitude slower than local memory, that part dominates and the whole thing crawls.

## How I decide what to run

I want weights plus KV cache at my target context to fit in device memory with headroom left over. If it does not fit, I try one step more aggressive on quantization before I try offloading, because offloading trades a capacity problem for a bandwidth problem and bandwidth problems feel worse. If it still does not fit, I pick a smaller model. A smaller model that answers in two seconds beats a bigger one that answers in ninety.

## References

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [Quantization (signal processing)](https://en.wikipedia.org/wiki/Quantization_(signal_processing))
