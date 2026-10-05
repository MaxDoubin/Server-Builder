
## The question everybody asks first

Whenever somebody in Cyber Club finds out I run a lab, the question is the same: can it run a big language model. The honest answer is that "can it run" is the wrong question. Almost anything can run a model if you are patient enough. The useful question is how fast, at what context length, for how many people at once. Once you frame it that way, the hardware conversation gets concrete, because the limits are arithmetic.

## Prefill is compute bound, decode is memory bound

A transformer doing inference has two phases with completely different resource profiles, and mixing them up is why people get confusing results.

**Prefill** is the model reading your prompt. Every token in the prompt goes through the network together, so the accelerator does big matrix multiplications with a lot of arithmetic per byte loaded from memory. That phase is compute bound. It scales with raw floating point throughput.

**Decode** is the model writing. It emits one token, feeds it back in, and emits the next. For a single stream, each of those steps has to pull essentially every weight in the model out of memory to produce one token. The arithmetic intensity is terrible: you move gigabytes to do a small amount of math. That phase is memory bandwidth bound.

This is the roofline model applied to something you can feel. A device with impressive peak throughput and modest memory bandwidth will chew through a long prompt quickly and then dribble out tokens.

## A ceiling you can compute in your head

For single stream decode, the upper bound on speed is memory bandwidth divided by the bytes of weights read per token.

```python
def decode_ceiling(param_billions, bits_per_weight, bandwidth_gb_s):
    # Rough upper bound on single-stream tokens per second.
    weight_bytes = param_billions * 1e9 * bits_per_weight / 8
    return bandwidth_gb_s * 1e9 / weight_bytes


# 8B parameters at 4 bits is about 4 GB of weights.
# On a hypothetical device with 400 GB/s of usable bandwidth:
print(round(decode_ceiling(8, 4, 400)))   # ~100 tokens/sec ceiling
print(round(decode_ceiling(70, 4, 400)))  # ~11 tokens/sec ceiling
```

Real numbers land somewhere below the ceiling, often half to two thirds of it, because attention reads the cache too, kernels have launch overhead, and sampling is not free. But the ceiling tells you the order of magnitude before you spend a dollar, and it explains why a model that is ten times bigger is roughly ten times slower on the same device.

## The KV cache is the part that surprises people

Weights are the fixed cost. The key/value cache is the variable one, and it grows linearly with context length and with the number of concurrent requests:

```python
def kv_cache_gb(layers, kv_heads, head_dim, seq_len, batch=1, bytes_per=2):
    # 2 tensors (K and V) per layer
    total = 2 * layers * kv_heads * head_dim * seq_len * batch * bytes_per
    return total / 1e9


print(round(kv_cache_gb(32, 8, 128, 32768), 2))
```

Two things fall out of that. First, grouped query attention, where many query heads share a smaller number of key/value heads, cuts this cost directly, which is why nearly every recent architecture uses it. Second, the cache competes with the weights for the same pool of memory. A model that "fits" at short context may not fit at long context with several users attached.

## Where the other bottlenecks hide

- **Offload.** If part of the model lives in system RAM and streams over the host bus for every token, the bus becomes your bandwidth number, and it is far below on-package memory bandwidth. A little offload costs a lot of speed.
- **Batching.** Serving several requests at once reads the weights once per step for the whole batch, so aggregate throughput climbs a lot while per-user speed degrades slowly. This is why serving stacks care so much about continuous batching, and why a benchmark run with batch size one tells you almost nothing about a shared service.
- **[Quantization](/blog/local-llm-memory-math).** Fewer bits per weight means fewer bytes read per token, so it speeds up decode directly rather than only saving space. Formats also differ in whether they dequantize to floating point before the math or run integer kernels directly, so two files of the same size can decode at noticeably different rates. If a smaller format does not show up as more tokens per second, something other than weight bandwidth is the bottleneck, and the smaller format is not buying what you thought.

## Capacity versus bandwidth

Capacity buys you the ability to run the model at all. Bandwidth buys you speed. That is a real trade, not a marketing trick, and the three common shapes of machine sit at different points on it.

A CPU with several memory channels gives you a lot of capacity for very little money and comparatively little bandwidth. It will run large models, slowly, and adding cores past a point does nothing for decode because you are waiting on DRAM, not on arithmetic.

A discrete accelerator gives you roughly an order of magnitude more bandwidth in a much smaller capacity envelope. That is the right shape for interactive use, right up until the model does not fit and the offloaded layers drag everything down to system memory speed.

Unified memory designs sit in between. They can hold very large models, often at lower peak bandwidth than dedicated accelerator memory but well above a typical desktop's DDR, which makes them genuinely useful for large models at modest speeds.

## Check the hardware before the software

Before I blame software, I confirm what the hardware is doing.

```bash
# Memory geometry: channels, speed, and populated slots drive bandwidth
sudo dmidecode -t memory | grep -E 'Size:|Speed:|Locator:' | grep -v 'No Module'

# Sockets, cores, and NUMA layout
lscpu | grep -E 'Model name|Socket|Core|Thread|NUMA'

# Capacity: read the "available" column, not "free"
free -g

# Accelerator link: find its bus address, then compare the link it
# supports (LnkCap) with the link it actually negotiated (LnkSta)
lspci | grep -E 'VGA|3D controller'
sudo lspci -vv -s 01:00.0 | grep -E 'LnkCap:|LnkSta:'
```

Peak DRAM bandwidth is channels times transfer rate times 8 bytes, so six populated channels of DDR4-2933 top out near 141 GB/s per socket. For each module, dmidecode prints both the rated and the configured speed. The configured one is what you get, so use it when you work out the bandwidth to feed into the ceiling formula above.

The link check has caught me more than once. A card negotiating a narrower link than it advertises turns a bandwidth problem into a mystery until you look, and it matters most when anything is offloaded, because then the bus is your bandwidth number. Compare the width first: many cards drop link speed at idle to save power, so read the speed under load.

## How I spec a box for this

For an interactive single user, my priority order is capacity first (weights plus KV cache at the context length I actually want), then memory bandwidth, then compute. For anything shared, capacity and bandwidth still come first, but compute climbs the list because prefill starts to dominate as soon as people paste long documents into it.

The other half of the answer is not the model at all. It is power draw, airflow, the serving process, and the monitoring around it. The accelerator is the interesting part for about a week. After that, the part I actually maintain is a service with a queue in front of it.

When I benchmark, I report prefill and decode separately, at a fixed prompt length and a fixed context, and I write down which quantization I used. A single "tokens per second" number with none of that context is a number nobody can reproduce, including me a month later.

## References

- [Transformer (deep learning architecture)](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture))
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [Memory bandwidth](https://en.wikipedia.org/wiki/Memory_bandwidth)
- [NVIDIA mixed precision training guide](https://docs.nvidia.com/deeplearning/performance/mixed-precision-training/index.html)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
