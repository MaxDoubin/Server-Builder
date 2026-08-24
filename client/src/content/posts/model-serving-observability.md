
## An inference endpoint is a queue with an accelerator attached

The mistake I see most often when people put a model behind an API is treating it as a special category of software. It is not. It is a latency sensitive service with an expensive fixed capacity backend, and forty years of queueing theory applies unchanged.

Once you frame it that way, the diagnostic questions become familiar. How many requests are in flight? How long do they wait before service starts? How long does service take? What happens when arrival rate exceeds service rate? Every one of those has a standard answer, and none of them require knowing anything about transformers.

## Measure the two phases separately

Generation splits into prefill, which processes the prompt, and decode, which emits tokens one at a time. They have different cost drivers, so a single latency number hides the actual problem.

Three metrics cover it:

**Time to first token** is queue wait plus prefill. It rises when the system is busy or when prompts get longer. If it climbs while decode speed is unchanged, you have a queueing problem, not a model problem.

**Inter-token latency** is the time between successive tokens during decode. It rises when the batch grows, when the KV cache grows, or when memory bandwidth is being shared. It is what makes output feel sluggish even after it starts.

**Tokens per second in aggregate** is the throughput number, and it goes up as you batch more, usually while both latency numbers get worse. That tension is the whole capacity planning problem in one sentence.

Record them as histograms, never averages. An average latency is a number that describes nobody's experience. Report the median and the tail together, and alert on the tail.

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

Those five signals answer nearly every question anyone will ask about a slow endpoint. Queue depth rising with stable batch size means you are capacity limited. Cache fraction near one means the scheduler cannot admit more sequences no matter how much compute is idle. Batch size high with inter-token latency high means the system is trading latency for throughput exactly as designed, and the question is whether that is the trade you wanted.

## Continuous batching, and why the cache is the real capacity limit

Naive batching waits to collect several requests, runs them together, and returns when the longest finishes. That penalizes short requests badly and wastes capacity when the batch is not full.

Continuous batching instead adds and removes sequences from the running batch at each step. A finished sequence leaves immediately and a waiting one takes its place. This is now standard in serious serving stacks and it changes admission from a batching question to a memory question.

Because here is the constraint: admitting a sequence means reserving KV cache for it, and the cache is finite. Your effective concurrency limit is not a request count you configured, it is however many sequences fit in cache at their current lengths. Long contexts consume the same pool that concurrency does. That is why an endpoint that handles fifty short conversations comfortably can stall at five long document analyses, and why "how many users can this serve" has no answer without specifying context length.

Paged cache allocation, which allocates the cache in fixed blocks instead of contiguous per sequence reservations, exists to reduce the fragmentation waste in that pool. It is the same idea as virtual memory paging, applied to attention state.

## Load testing that resembles reality

A benchmark with fixed length prompts and one request at a time tells you almost nothing. Your load test needs the shape of real traffic: a realistic distribution of prompt lengths, a realistic distribution of output lengths, and concurrency that arrives on its own schedule rather than in a synchronized burst.

Ramp concurrency until the tail latency crosses whatever you have decided is unacceptable. That concurrency, minus headroom, is your capacity. Write it down, because it is the number that should drive your admission limit and your autoscaling threshold.

Test the overload case deliberately, too. When arrivals exceed capacity, an unbounded queue means every request gets slower until they all time out, which is the worst possible outcome. Reject early with a clear status once the queue passes a threshold. Fast failure is a feature.

## Operational things that are not about the model

Load the model at startup and fail the health check until it is ready, so an orchestrator does not route traffic to a process still reading weights off disk. Separate liveness from readiness, because a node busy with a big batch is not a node that needs restarting. Set request timeouts that account for the longest legitimate generation, and make sure a client disconnect actually cancels the work, otherwise you are burning capacity generating tokens nobody will read.

Log the request id, prompt token count, output token count, queue time, and total time for every request. Not the content, the shape. That log alone answers most capacity questions after the fact, and it is the difference between "it felt slow yesterday" and knowing exactly which prompt length distribution shifted.

## Why this framing matters

None of this is specific to any model or serving framework. It is the same discipline you would apply to a database connection pool or an image resizing service: understand the constraint, measure the queue, publish tail latency, cap admission, and fail fast when saturated.

The constraint just happens to be memory holding attention state rather than connections or CPU. Name the constraint, instrument it, and the operations work becomes ordinary.

## References

- [Queueing theory](https://en.wikipedia.org/wiki/Queueing_theory)
- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
- [Prometheus histograms and summaries](https://prometheus.io/docs/practices/histograms/)
- [OpenTelemetry documentation](https://opentelemetry.io/docs/)
- [vLLM documentation](https://docs.vllm.ai/)
