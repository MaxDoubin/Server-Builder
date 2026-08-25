
## Same model, two different problems

People say "AI hardware" as if it is one category. It is two. A machine built to train a model and a machine built to serve one have different memory profiles, different network requirements, different storage patterns, and different failure modes. Buying one when you need the other is an expensive mistake.

Here is how I separate them.

## What training holds in memory

Inference needs the weights. Training needs the weights plus everything required to compute and apply an update.

- The parameters themselves.
- A gradient for every parameter.
- Optimizer state. Adam style optimizers keep two running moments per parameter.
- Saved activations from the forward pass, because the backward pass needs them.
- Often a higher precision master copy of the weights for the update step.

```python
GIB = 1024 ** 3

def training_state_gib(params_b, param_bytes=2, grad_bytes=2,
                       master_bytes=4, moment_bytes=8):
    # A common mixed-precision layout: bf16 params and grads, fp32 master
    # weights, fp32 first and second moments. Exact numbers vary by
    # optimizer and framework, so treat this as an order-of-magnitude tool.
    per_param = param_bytes + grad_bytes + master_bytes + moment_bytes
    return params_b * 1e9 * per_param / GIB

def inference_gib(params_b, weight_bits=16):
    return params_b * 1e9 * weight_bits / 8 / GIB

for p in (1, 7, 13, 70):
    print(f"{p:3d}B params: inference(16-bit) {inference_gib(p):7.1f} GiB   "
          f"training state {training_state_gib(p):7.1f} GiB")
```

The ratio is the point. Before you have stored a single activation, training state is several times the inference footprint. Add activations, which scale with batch size and sequence length, and the gap widens further. Activation checkpointing trades compute for memory to claw some of it back, and that tradeoff is one of the main tuning dials in training.

## Interconnect is where they truly diverge

This is the difference that costs money.

Data parallel training synchronizes gradients across all workers every step. That is an all-reduce over a tensor the size of the model, at every step, for the entire run. The interconnect is in the critical path of every iteration, so a slow link does not just reduce throughput a little, it can dominate the step time entirely. This is why training clusters use specialized high bandwidth fabrics between accelerators and why topology and placement matter so much.

Inference replicas, by contrast, are usually independent. Each one holds the full model and answers requests on its own. They talk to a load balancer, not to each other. Ordinary datacenter networking is completely adequate.

The exception is a model too large for one device, where tensor parallelism splits each layer across accelerators. Now there is a collective operation inside every forward pass and the interconnect matters again, though the volume is smaller than a gradient all-reduce.

Practical rule: independent inference replicas run fine on a normal network. Anything that shards a single model, training or serving, wants the fastest link you can put between those devices.

## Storage and the data pipeline

Training is read heavy and sustained. It wants high throughput sequential reads, and it wants them shuffled, which is exactly the access pattern that punishes naive storage layouts. Storing a dataset as millions of individual small files makes the filesystem the bottleneck. Packing into large sharded archives read sequentially with a shuffle buffer fixes it. Training also writes checkpoints periodically, which is a large bursty write that can stall the whole job if the storage cannot absorb it.

Inference reads the model once at startup and then essentially nothing. The storage question becomes cold start time: how fast can a new replica load weights and become ready. That matters for autoscaling and for rolling restarts, and it is a completely different requirement than dataset throughput.

## Utilization and thermals

A training run is a long, steady, near constant load. Every accelerator is busy, drawing near peak power, for hours or days. That is a sustained thermal and power problem, and the practical consequence is that your cooling and your power delivery need to handle the steady state, not the average.

Inference is spiky and latency sensitive. You provision headroom you deliberately do not use, because using it would blow your tail latency. A serving fleet running at 90 percent utilization is a serving fleet about to miss its latency target.

Also: training tolerates interruption if you checkpoint. Inference does not tolerate interruption at all, because there is a user waiting. That single difference reshapes how you do maintenance on each.

## How I would size each

For a training box, I would prioritize accelerator memory capacity first, interconnect between accelerators second, and dataset read throughput third. Core count on the host CPU matters mostly for data loading and preprocessing, which is a real bottleneck people underestimate.

For a serving box, I would prioritize memory bandwidth first, memory capacity second (enough for weights plus your worst case KV cache), and then boring reliability: redundant power, health checks, and the ability to drain a node without dropping requests.

Most homelabs and most small teams are doing inference, occasionally fine tuning something small. Build for that, and rent the training machine on the rare occasions you genuinely need one.

## References

- [PyTorch documentation](https://pytorch.org/docs/stable/index.html)
- [PyTorch distributed overview](https://pytorch.org/docs/stable/distributed.html)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [NVIDIA CUDA documentation](https://docs.nvidia.com/cuda/)
