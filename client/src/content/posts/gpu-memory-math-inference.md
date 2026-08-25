
## Three consumers, not one

Accelerator memory during inference gets eaten by three things, and only one of them is on the model card.

1. **Weights.** Parameter count times bytes per parameter. Predictable, static, easy.
2. **The KV cache.** Grows with context length and with concurrency. This is the one that surprises people.
3. **Everything else.** Runtime context, activation buffers for the current forward pass, workspace for the attention kernels, and allocator fragmentation. Budget headroom for it rather than trying to compute it exactly.

If you only budget for item one, you will build a machine that loads the model and then falls over the first time somebody pastes in a long document.

## The KV cache formula

During generation, the model caches the key and value projections for every token it has already seen, for every layer, so it does not have to recompute them. That cache is linear in sequence length and linear in batch size.

```python
def kv_cache_bytes(layers, kv_heads, head_dim, seq_len, batch=1, dtype_bytes=2):
    # Two tensors (K and V) per layer, per KV head, per token.
    # kv_heads is the number of key/value heads, which under grouped-query
    # attention is smaller than the number of query heads.
    return 2 * layers * kv_heads * head_dim * seq_len * batch * dtype_bytes


def report(name, layers, kv_heads, head_dim, params_b, weight_bits):
    gib = 1024 ** 3
    weights = params_b * 1e9 * weight_bits / 8 / gib
    print(f"{name}: weights {weights:.1f} GiB @ {weight_bits}-bit")
    for ctx in (4096, 16384, 65536):
        for batch in (1, 8, 32):
            kv = kv_cache_bytes(layers, kv_heads, head_dim, ctx, batch) / gib
            print(f"   ctx={ctx:6d} batch={batch:3d}  KV {kv:8.2f} GiB  "
                  f"total ~{weights + kv:8.2f} GiB")

# Hypothetical mid-size model: 32 layers, 8 KV heads, head_dim 128
report("example-8B", layers=32, kv_heads=8, head_dim=128,
       params_b=8, weight_bits=4)
```

Run that and watch what happens. The weights stay put. The KV cache goes from a rounding error at short context and batch one to larger than the weights themselves at long context with real concurrency.

Grouped-query attention is the reason modern models are tolerable here. Sharing key and value heads across multiple query heads cuts the cache by the grouping factor directly. When you are comparing two models of similar size, the KV head count is a more important operational number than the parameter count.

## Concurrency is a memory decision

This is the part that trips up people coming from web services. In a normal API you scale concurrency with CPU and connection limits. In an inference server, each concurrent request holds its own KV cache for as long as it is generating. Concurrency is bought with memory.

That means your maximum batch size is not a throughput tuning parameter you can set freely. It is bounded by:

```
usable_memory - weights - runtime_overhead >= batch * per_request_kv
```

And per request KV depends on how long that request's context gets. A serving stack that assumes worst case context for every slot will admit far fewer requests than one that allocates cache in pages as the sequence grows, which is exactly why paged attention style allocators matter: they cut the waste from over provisioning, they do not change the underlying arithmetic.

## The order I turn the knobs

When a configuration does not fit, I work through these in order, cheapest quality cost first.

**Cap the context length.** Most workloads do not need the maximum the model supports. Setting a realistic ceiling is free and it is the single biggest lever.

**Quantize the KV cache.** Going from 16 bit to 8 bit cache halves the biggest variable term. Quality impact is usually smaller than quantizing the weights by the same amount.

**Lower the batch ceiling.** Costs throughput, not quality. Fine if your workload is latency sensitive and low concurrency anyway.

**Quantize the weights.** Real quality tradeoff, measure it on your own prompts.

**Shard across devices.** Tensor parallelism splits weights and cache across accelerators but adds interconnect traffic on every layer, so it wants a fast link between them.

**Offload layers to system memory.** Last resort. It works, and it drops you to system memory bandwidth for the offloaded portion, which you will feel on every single token.

## Leave headroom on purpose

I plan to about 85 percent of physical memory, not 100. Allocator fragmentation is real, kernel workspaces vary with sequence length, and an out of memory error mid generation takes down the request that triggered it plus, depending on the server, the ones sharing the batch. The last 15 percent buys you a service that degrades instead of crashing.

Measure the real thing once it is running. Steady state memory after a load test tells you more than any formula, and the formula's job is only to stop you from buying the wrong hardware.

## References

- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
