
## Same model, opposite resource profile

People talk about "AI infrastructure" as if it were one thing. It is at least two, and they want opposite things from a machine. If you are planning capacity, the single most useful question is which side of this line you are on.

Training consumes a fixed dataset over a long run to produce weights. Inference takes finished weights and serves requests. That difference in shape changes memory, network, storage, and failure behavior.

## Memory: weights versus weights plus baggage

Inference needs the weights, a working buffer, and a cache for the tokens it has generated so far. That is roughly it.

Training needs the weights, plus gradients the same size as the weights, plus optimizer state that is commonly two additional values per parameter, plus activations saved from the forward pass so the backward pass can use them. The classic rule of thumb for a mixed precision run with a momentum based optimizer is that model state alone lands somewhere near four to six times the size of the weights before you count activations, and activations scale with batch size and sequence length.

That is why a model you can serve comfortably on a single device can be untrainable on the same device. It is not a compute limit. It is bookkeeping.

## Compute: two different bottlenecks, even within inference

Training is throughput work. You want every unit busy, you can pick your batch size freely, and nobody is waiting on an individual example. It is compute bound almost by construction.

Inference splits in two. Prefill, where the model processes the prompt, is compute bound: lots of tokens, all available at once, big efficient matrix multiplications. Decode, where it emits one token at a time, is memory bandwidth bound: the arithmetic per token is small but the whole weight set has to be read to produce it.

This is why a long prompt and a long answer stress different parts of the same box, and why "tokens per second" without saying which phase you measured is a meaningless number.

## Networking: a fabric versus a load balancer

Distributed training synchronizes gradients between workers on every step. That is a lot of traffic in a tight pattern with everyone waiting on the slowest participant, which is why serious training clusters spend real money on low latency, high bandwidth, non blocking fabrics. Latency spikes there do not slow one job, they stall all of it.

Inference has no such pattern. Requests are independent. What you need is ordinary front end networking, a load balancer, and enough bandwidth to move prompts and responses, which are small. If a vendor is selling you a training fabric for an inference deployment, that is a signal.

## Storage and the data path

Training is a streaming read problem. You read a large dataset repeatedly, shuffled, and if the pipeline cannot keep the accelerators fed you burn expensive hardware waiting on disk. Sequential throughput and enough parallel readers matter; you also want checkpoint writes to be fast, because a checkpoint is a large synchronous write that pauses everything.

Inference is a load once problem. You read the weights at startup and then storage goes nearly idle. The one thing worth optimizing is cold start: if your service restarts and takes minutes to read weights off slow storage, that is your outage length during a rolling deploy.

## What this means for planning

```text
                 Training                      Inference
Memory           weights x4-6 + activations    weights + KV cache
Compute          throughput bound              prefill compute, decode bandwidth
Network          synchronized, latency critic  independent requests
Storage          sustained streaming reads     one big read at startup
Scaling unit     the whole job                 one replica
Failure          restart from checkpoint       drop one replica, retry
Utilization      near 100% by design           bursty, follows users
```

The failure row is the one people miss. A training job is a single long lived unit of work: lose a node and you restart from the last checkpoint, so checkpoint frequency is a real design decision. An inference deployment is a fleet of interchangeable replicas: lose one, health checks pull it out, requests retry. Those need completely different operational treatment, and treating a training run like a web service is how you lose a week of compute to a node reboot.

So the practical advice splits the same way. If you are building to serve models, buy memory capacity and bandwidth, keep the network boring, and put your effort into batching, queueing, and cold start time.

If you are building to train, the accelerator interconnect and the data pipeline will decide whether you get value out of the hardware, and checkpointing discipline will decide whether you keep it.

If you are learning, do inference first. It is cheaper, it fits on hardware you can actually get, and every concept you learn about memory and bandwidth transfers directly to the training side later.

## References

- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
