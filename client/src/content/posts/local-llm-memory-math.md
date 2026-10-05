
## The question everyone asks wrong

The first thing people ask about running a model locally is "how many parameters." That number tells you almost nothing on its own. What you actually need is bytes of memory in three buckets: the weights, the key/value cache, and the runtime slop around both. If you can do that arithmetic on paper, you stop guessing and you stop downloading twenty gigabytes to find out it will not load.

I do this math before I touch a download, because it also tells me the second thing I care about: how fast the thing will be. Memory capacity decides whether it runs. Memory bandwidth decides whether it is usable.

## Bucket one: weights

Weight memory is parameters times bytes per parameter. That is the whole formula.

At 16-bit precision (bfloat16 or fp16, the usual release formats) each parameter is two bytes, so a 7 billion parameter model wants roughly 14 GB just to sit in memory. At 8-bit it is roughly 7 GB. At 4-bit it is roughly 3.5 GB, plus overhead, because a quantized format is never exactly its nominal bit width.

A single scale for a whole tensor would be wrecked by outliers, so formats quantize in small blocks, commonly 32 or 64 weights, and store a 16-bit scale per block, often with a zero point beside it. With 32-weight blocks the scale adds half a bit per weight and a zero point adds another half, so a "4-bit" file lands near 4.5 to 5 bits per weight, about 12 to 25 percent above the naive number. Smaller blocks mean less error and more metadata. Most formats also keep sensitive tensors, such as the embeddings and output projection, at higher precision. Plan on 4.5 to 5 bits per weight for a 4-bit model and you will not be surprised.

Quantization is not free. Reducing precision loses information, and how much that hurts depends on the format and on what you are asking the model to do. My rule is that 8-bit is close to invisible for most tasks, 4-bit is usually fine for chat and summarizing, and anything below 4-bit is a science experiment I would not put behind a service.

The loss shows up first where precision matters more than fluency: long chains of arithmetic, strict output formats, code that has to compile, recall of rare specifics. Conversational quality holds up much longer, which is why "it still sounds fine" is a misleading test. Compare against the higher precision version of the same model on something with a right answer. Larger models also tolerate quantization better than small ones, so for a fixed memory budget a bigger model at 4-bit often beats a smaller one at 8 or 16 bits, until you go below roughly 4 bits per weight and quality falls off sharply rather than gracefully.

## Bucket two: the KV cache

This is the bucket that surprises people, because it grows with usage rather than sitting still.

During generation, the model caches a key and a value vector for every token, in every layer, for every attention head that has its own key/value projection. The size is:

```
2 * layers * kv_heads * head_dim * bytes_per_element * sequence_length * batch_size
```

The leading 2 is because you store both K and V. Models using grouped query attention share key/value projections across several query heads, which is why `kv_heads` is often much smaller than the total attention head count, and why the cache is far cheaper on those models than it used to be. The saving is the grouping factor, so between two models of similar size, the KV head count matters more operationally than the parameter count.

The important property is that this term is linear in context length and linear in concurrent requests. A long context feature is a memory feature, not just a config flag.

Each request holds its own cache for as long as it is generating, so concurrency is bought with memory, and the batch ceiling is not a throughput setting you can pick freely. It is bounded by:

```
usable_memory - weights - runtime_overhead >= batch * per_request_kv
```

A server that reserves worst case context for every slot admits far fewer requests than one that allocates cache in pages as each sequence grows. That is why paged attention allocators matter: they cut the waste from over provisioning, but they do not change the arithmetic.

## Bucket three: everything else

Then there is the slop: the framework's CUDA or Metal context, activation buffers for the forward pass, the allocator's fragmentation, and whatever the serving layer reserves up front. I budget 1 to 2 GB of headroom on a dedicated accelerator and more if I am also driving a display from the same device. If you fill memory to 99 percent you will get an allocation failure on a long prompt at 2 in the morning instead of at your desk.

For anything shared, I plan the whole budget to about 85 percent of physical memory. Kernel workspaces vary with sequence length, and an out of memory error mid generation takes down the request that triggered it plus, depending on the server, everything sharing its batch. The last 15 percent buys a service that degrades instead of crashing.

Putting all three buckets in one function makes the trade offs visible:

```python
def model_memory_gb(params_b, bits, layers, kv_heads, head_dim,
                    ctx=8192, batch=1, kv_bits=16, overhead_gb=1.5):
    gib = 1024 ** 3
    weights = params_b * 1e9 * (bits / 8)    # effective bits, block metadata included
    kv = 2 * layers * kv_heads * head_dim * (kv_bits / 8) * ctx * batch
    return {
        "weights_gb": round(weights / gib, 2),
        "kv_cache_gb": round(kv / gib, 2),
        "total_gb": round((weights + kv) / gib + overhead_gb, 2),
    }

# a 7B-class model at nominal 4-bit (~5 effective bits), 32 layers,
# 8 KV heads, head_dim 128, 8k context
print(model_memory_gb(7, 5, 32, 8, 128))
```

Change `ctx` to 32768 and watch the second number move while the first one does not. That is the whole lesson. This model's cache costs 128 KiB per token at 16-bit, so 8k of context is 1 GiB, 32k is 4 GiB, and four concurrent 32k sequences are 16 GiB, roughly four times the weights. Set `kv_bits` to 8 and every one of those halves.

## Speed follows from the same numbers

Single stream token generation is memory bandwidth bound, not compute bound. To produce one token the hardware has to read essentially every weight once. So the ceiling on tokens per second is roughly memory bandwidth divided by the size of the weights in memory. A 4 GB quantized model on a device with a few hundred GB/s of bandwidth has a theoretical ceiling in the tens of tokens per second, and real systems land meaningfully below the ceiling because of cache behavior and kernel overhead.

Two consequences I rely on. First, quantizing does not just help you fit, it makes generation faster, because there are fewer bytes to stream. Second, offloading layers to system RAM is a cliff, not a slope: the moment part of the model lives behind a PCIe link that is an order of magnitude slower than local memory, that part dominates and the whole thing crawls.

The speed side, prompt processing included, gets its full treatment in [what actually limits local LLM inference](/blog/local-llm-inference-limits).

## How I decide what to run

I want weights plus KV cache at my target context to fit in device memory with headroom left over. Target context means the context length and concurrency I will actually use, not the maximum the model supports; most people configure a window they will never fill and pay for it in cache. If the weights alone are over about 80 percent of device memory, I drop a precision level or pick a smaller model right away.

When a configuration does not fit, I turn the knobs in this order, cheapest quality cost first:

1. **Cap the context length.** Free, and usually the single biggest lever.
2. **Quantize the KV cache.** Going from 16-bit to 8-bit halves the biggest variable term, usually for a small quality cost. Many runtimes leave the cache at 16-bit by default even when the weights are quantized, so check.
3. **Lower the concurrency ceiling.** Costs throughput, not quality.
4. **Quantize the weights one step further.** This one costs real quality, so measure it on your own prompts.
5. **Shard across devices, if you have more than one.** Tensor parallelism splits weights and cache across accelerators but adds interconnect traffic on every layer, so it wants a fast link between them.
6. **Offload layers to system RAM.** Last, because offloading trades a capacity problem for a bandwidth problem and bandwidth problems feel worse.

If it still does not fit, I pick a smaller model. A smaller model that answers in two seconds beats a bigger one that answers in ninety.

Whatever I land on, I test with a real long prompt, because that is where it will break. Once it is running, steady state memory after a load test tells you more than any formula. The formula's job is to stop you from downloading, or buying, the wrong thing.

## References

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [Quantization (signal processing)](https://en.wikipedia.org/wiki/Quantization_(signal_processing))
- [Half-precision floating-point format](https://en.wikipedia.org/wiki/Half-precision_floating-point_format)
- [bfloat16 floating-point format](https://en.wikipedia.org/wiki/Bfloat16_floating-point_format)
