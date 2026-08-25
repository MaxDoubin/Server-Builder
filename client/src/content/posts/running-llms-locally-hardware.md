
## Why run a model on your own gear

I run models locally for the same reason I run my own DNS and my own hypervisor: I learn more when I own the failure. A hosted endpoint hides the interesting part. When the tokens come out slowly on my own box, I can go find out exactly why, and that answer turns out to be a hardware lesson, not a machine learning lesson.

This post is the mental model I use before I try to run anything. It is deliberately vendor neutral, because the arithmetic does not care whose logo is on the card.

## The three numbers that decide everything

Every local inference question reduces to three quantities.

**Memory capacity** decides whether the model runs at all. Weights have to live somewhere the accelerator can reach. If they do not fit, you either spill to system RAM or you do not run.

**Memory bandwidth** decides how fast a single stream of tokens comes out. This is the one people miss. Generating one token requires reading essentially the whole active weight set once. So the ceiling on tokens per second is bandwidth divided by the bytes you have to read, not the raw FLOPs on the spec sheet.

**Compute throughput** decides prefill speed and batch throughput. Processing a long prompt is a big matrix multiply and it is genuinely compute bound. Generating token 1,001 is not.

That split is why a machine can chew through a 20,000 token prompt quickly and then dribble out the response. Two different bottlenecks, one after the other.

## Doing the arithmetic before you buy anything

Here is the estimate I run first. It is rough on purpose, but it gets you inside a factor of two, which is enough to reject bad plans.

```python
GIB = 1024 ** 3

def weight_bytes(params_billions, bits):
    # Bytes of weights at a given quantization level.
    return params_billions * 1e9 * (bits / 8)

def decode_ceiling(params_billions, bits, bandwidth_gb_s, efficiency=0.7):
    # Upper bound on single-stream tokens/sec. Memory bound, not FLOP bound.
    gb_read_per_token = weight_bytes(params_billions, bits) / 1e9
    return (bandwidth_gb_s * efficiency) / gb_read_per_token

for bits in (16, 8, 4):
    size = weight_bytes(8, bits) / GIB
    for bw in (100, 400, 900):
        print(f"8B @ {bits:2d}-bit  {size:5.1f} GiB  "
              f"{bw:3d} GB/s -> ~{decode_ceiling(8, bits, bw):5.1f} tok/s")
```

Two things fall out of this immediately. First, a system with lots of slow memory will load a big model and then generate at a speed you will hate. Second, halving the bit width roughly doubles your ceiling, because you halved the bytes read per token.

## Quantization is a memory trick first

People talk about quantization as a quality tradeoff, which it is, but operationally it is a bandwidth trick. Going from 16 bit to 8 bit weights halves the footprint and halves the bytes read per token. Going to 4 bit halves it again.

The quality cost is not linear and it is not uniform across models. Some layers tolerate aggressive quantization and some do not, which is why modern quantization schemes keep certain tensors at higher precision and why calibration data matters. My rule: quantize until the outputs stop being useful for my actual task, measured on my own prompts, not on somebody else's leaderboard.

Note that the KV cache is separate from the weights and often is not quantized by default. On long contexts it can rival the weights for memory. That deserves its own post.

## CPU, accelerator, and the unified memory middle

Three shapes of machine, three profiles.

A CPU with several memory channels gives you a lot of capacity for very little money and comparatively little bandwidth. It will run large models. It will run them slowly, and adding cores past a point does nothing because you are waiting on DRAM, not on arithmetic.

A discrete accelerator gives you an order of magnitude more bandwidth in a much smaller capacity envelope. This is the right shape for interactive use, right up until the model does not fit, at which point the offloaded layers drag the whole thing down to system memory speed.

Unified memory designs sit in between: capacity closer to a CPU, bandwidth well above DDR but below a high end discrete card. They are genuinely useful for large models at modest speeds.

## The checks I run, and what they change

Before I blame software, I confirm what the hardware is doing.

```bash
# Memory geometry: channels, speed, and populated slots drive bandwidth
sudo dmidecode -t memory | grep -E 'Size:|Speed:|Locator:' | grep -v 'No Module'

# CPU cache and core topology
lscpu | grep -E 'Model name|Socket|Core|Thread|NUMA'

# Free system memory, minus the cache lie
free -g

# If there is an accelerator, confirm it is on the bus at full width
sudo lspci -vv | grep -A2 -E 'VGA|3D controller' | grep -E 'LnkSta|LnkCap'
```

That last one has caught me more than once. A card negotiating a narrower link than it advertises turns a bandwidth problem into a mystery until you look.

All of which changes how I plan. I stopped asking "can I run this model" and started asking "at what precision, at what context length, and at what tokens per second do I stop caring." Those three answers pick the hardware for you. Everything else is tuning.

## References

- [PyTorch CUDA semantics](https://pytorch.org/docs/stable/notes/cuda.html)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
- [lspci(8) manual page](https://man7.org/linux/man-pages/man8/lspci.8.html)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
