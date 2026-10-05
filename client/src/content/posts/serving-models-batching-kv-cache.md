
## One request is a bad benchmark

Almost every "how fast is this model" number you see was measured with a single request and no other load. That tells you the best case latency for one lucky user and nothing about capacity.

Serving is a queueing problem, and the standard questions apply unchanged: how many requests are in flight, how long they wait before service starts, how long service takes, and what happens when arrivals outpace service. Little's law ties them together: the average number of requests in the system equals the arrival rate times the average time each one spends there.

What you actually need to know is how many concurrent users a host can carry before latency crosses the line where the product feels broken. Getting there means understanding three things: the two phases of generation, how batching exploits them, and why the key/value cache is your real capacity limit.

## Two phases, two bottlenecks

Prefill processes the whole prompt at once. Every token is available, so the work is large dense matrix multiplication and the hardware runs near its compute limit. Prefill cost grows with prompt length and it determines time to first token.

Decode produces one token at a time, each depending on the last. The arithmetic per token is small, but producing it requires reading essentially all of the model weights out of memory. So decode is bandwidth bound, and it determines the inter token latency that a user perceives as typing speed.

Those two facts drive everything else. A long prompt with a short answer is a prefill problem. A short prompt with a long answer is a bandwidth problem. Tuning for one does not help the other.

## Why batching works

Here is the key insight: during decode, the weights get read from memory regardless of how many sequences you are processing. Serving one user reads the whole model to produce one token. Serving sixteen users reads the whole model once to produce sixteen tokens.

So aggregate throughput rises almost linearly with batch size until you run out of memory or hit the compute limit, while per user speed barely changes. Batching is close to free throughput, which is why nobody serious serves requests one at a time. The "close to" is real, though: each sequence's own KV cache also has to be read at every step, so inter token latency creeps up as the batch and the contexts grow. Trading a little per user latency for a lot of host throughput is the whole capacity planning problem in one sentence.

Naive static batching wastes most of that, because it collects a fixed group, runs it to completion, and makes short requests wait for the longest one. Continuous batching, which every modern serving stack implements, keeps a running set of sequences and swaps a finished one out for a queued one at each decode step. Utilization goes way up and queue time goes way down. It also turns admission from a batching question into a memory question.

## The KV cache is your capacity limit

Every active sequence holds a key/value cache proportional to its length. Total KV memory is what is left after the weights, and it is a fixed budget:

```python
def concurrency(total_gb, weight_gb, layers, kv_heads, head_dim,
                avg_tokens=2048, kv_bits=16, reserve_gb=2.0):
    gib = 1024 ** 3
    budget = (total_gb - weight_gb - reserve_gb) * gib
    per_token = 2 * layers * kv_heads * head_dim * (kv_bits / 8)
    per_seq = per_token * avg_tokens
    return int(budget // per_seq)

print(concurrency(24, 4.2, 32, 8, 128, avg_tokens=2048))
```

Change `avg_tokens` from 2048 to 8192 and watch capacity divide by four. That is the single most important operational fact about serving: allowing longer contexts reduces how many users you can serve, proportionally, and it does it silently until you hit the wall.

So your real concurrency limit is not a request count you configured. It is however many sequences fit in the cache at their current lengths. Little's law shows why this bites under load: at a steady arrival rate, anything that makes requests take longer puts more of them in flight at once, each holding its own slice of the cache.

Two mitigations worth knowing. Paged attention stores the cache in fixed size blocks instead of contiguous per sequence reservations, the same idea as virtual memory paging, which removes most of the fragmentation waste and is why modern servers fit far more concurrent sequences than naive math predicts. And prefix caching reuses the cache for a shared prompt prefix across requests, which is a large win when every request starts with the same long system prompt.

## Queueing, timeouts, backpressure

When the batch is full, new requests queue. If arrivals exceed capacity, the queue grows without bound and everyone gets a terrible experience instead of some people getting a good one.

Set a maximum queue depth and reject beyond it with a clear retry signal. Set a request timeout and a maximum generation length so one pathological request cannot hold a slot forever. Cap the output tokens per request, because an unbounded generation is an unbounded resource commitment. Size the timeout for the longest legitimate generation, not the typical one, and make sure a client disconnect actually cancels the work. Otherwise you are burning a slot generating tokens nobody will read.

Rejecting load is not failure. It is the behavior that keeps the accepted load fast.

## Readiness and request logs

Load the model at startup and fail the readiness check until it is loaded, so an orchestrator does not route traffic to a process still reading weights off disk. Keep liveness separate from readiness, because a node busy with a big batch is not a node that needs restarting.

Log the shape of every request, not the content: request id, prompt token count, output token count, queue time, and total time. That log answers most capacity questions after the fact, and it is the difference between "it felt slow yesterday" and knowing exactly which prompt length distribution shifted.

## What I measure

Four metrics, always at percentiles, never as averages: time to first token, which is prefill plus queue wait; inter token latency, which is decode speed; end to end request latency; and total output tokens per second across the host.

Record the latencies as histograms, so the median and the tail come out of the same data, and alert on the tail. Next to them, export three gauges that explain the latencies: queue depth, running batch size, and how much of the KV cache is in use.

```python
from prometheus_client import Histogram, Gauge

TTFT = Histogram(
    "inference_ttft_seconds",
    "Time to first token",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
)
ITL = Histogram(
    "inference_inter_token_seconds",
    "Time between generated tokens",
    buckets=(0.005, 0.01, 0.02, 0.05, 0.1, 0.25),
)
QUEUE_DEPTH = Gauge("inference_queue_depth", "Requests waiting for a slot")
BATCH_SIZE = Gauge("inference_batch_size", "Sequences in the running batch")
CACHE_USED = Gauge("inference_kv_cache_fraction", "KV cache blocks in use")
```

Read together, those signals answer most questions about a slow endpoint. Time to first token climbing while inter token latency holds steady is a queueing problem, not a model problem. Queue depth rising while batch size stays flat means you are at capacity. A cache fraction near one means the scheduler cannot admit another sequence no matter how much compute sits idle. A large batch with high inter token latency is the system trading latency for throughput exactly as designed, and the only question is whether that is the trade you wanted.

Then a small load generator that ramps concurrency and records all four, so I get a curve instead of a point. Give it traffic shaped like the real thing: a realistic spread of prompt lengths and output lengths, with requests arriving on their own schedule instead of in synchronized bursts. The curve has a knee. Below it, throughput rises and latency is flat. Above it, throughput plateaus and latency climbs while requests sit in queue. Your operating limit is just below the knee, and no amount of reading spec sheets will tell you where it is on your hardware with your prompts.

Write that number down, because it should drive your admission limit and your autoscaling threshold. Then push past it on purpose and confirm the server sheds the excess with fast rejections, rather than letting every request slow down until they all time out.

## References

- [vLLM documentation](https://docs.vllm.ai/en/latest/)
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- [GQA: Training Generalized Multi-Query Transformer Models](https://arxiv.org/abs/2305.13245)
- [Hugging Face Transformers documentation](https://huggingface.co/docs/transformers/index)
- [Prometheus documentation](https://prometheus.io/docs/introduction/overview/)
- [Prometheus histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [Queueing theory](https://en.wikipedia.org/wiki/Queueing_theory)
- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
