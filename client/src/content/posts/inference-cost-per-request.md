
## Why I Build The Model Before I Pick The Hardware

Anyone can tell you a model is expensive to run. That is not useful. What is
useful is a small spreadsheet that turns "one request with this input length
and that output length" into a number of seconds and a number of cents, using
inputs you measured rather than inputs somebody advertised.

Every figure in this post is a placeholder. I am deliberately not quoting
throughput or price numbers, because those change and because the whole point
is to substitute your own measurements. What is durable is the shape of the
arithmetic.

## Two Phases, Two Completely Different Cost Shapes

A request has a prefill phase and a decode phase, and they are bottlenecked on
different resources. Conflating them is the single most common mistake in
capacity planning for inference.

**Prefill** processes your entire input at once. Every input token goes through
the network in parallel, which means the accelerator has a large matrix
multiply to chew on and can keep its arithmetic units busy. Prefill is compute
bound. The useful rule of thumb is roughly two floating point operations per
parameter per token for a forward pass, so prefill cost scales as
`2 * P * T_in` where `P` is parameter count and `T_in` is input tokens.

**Decode** generates one token at a time. Each step depends on the previous
one, so there is no parallelism across the sequence. For a single request, the
accelerator must read essentially the whole weight matrix from memory to
produce one token, then do it again. The arithmetic per step is tiny relative
to the bytes moved, so decode is memory bandwidth bound. Time per token is
approximately `bytes_of_weights / memory_bandwidth`, and the arithmetic
throughput of the chip barely enters into it.

That asymmetry drives everything. Long inputs and short outputs are cheap per
token and stress compute. Short inputs and long outputs are expensive per token
and stress bandwidth. Two requests with identical total token counts can differ
several fold in cost.

## From Time To Money

Once you have a time per request, money is straightforward. You need three
things you can actually look up or measure: what the hardware cost, how long
you expect to keep it, and what electricity costs where it sits, including the
cooling overhead.

```python
from dataclasses import dataclass

@dataclass
class CostModel:
    # All of these are placeholders. Measure or look up your own.
    prefill_tokens_per_sec: float   # measured, at your batch size
    decode_tokens_per_sec: float    # measured, at your batch size
    hardware_cost: float            # what the machine cost, currency units
    amortize_years: float           # how long before you replace it
    watts_under_load: float         # measured at the wall, whole machine
    price_per_kwh: float
    pue: float = 1.4                # facility overhead multiplier
    utilization: float = 0.35       # fraction of wall clock actually serving

    @property
    def cost_per_busy_second(self) -> float:
        seconds_per_year = 365 * 24 * 3600
        busy = seconds_per_year * self.amortize_years * self.utilization
        capital = self.hardware_cost / busy
        kw = (self.watts_under_load * self.pue) / 1000.0
        power = kw * self.price_per_kwh / 3600.0
        return capital + power

    def request(self, tokens_in: int, tokens_out: int) -> dict:
        prefill_s = tokens_in / self.prefill_tokens_per_sec
        decode_s = tokens_out / self.decode_tokens_per_sec
        total_s = prefill_s + decode_s
        return {
            "prefill_s": round(prefill_s, 4),
            "decode_s": round(decode_s, 4),
            "total_s": round(total_s, 4),
            "cost": total_s * self.cost_per_busy_second,
        }
```

Fill in your own measurements and the model tells you two things immediately:
which phase dominates for your traffic mix, and how sensitive the answer is to
utilization. That last one surprises people. Capital cost per request is
divided by busy seconds, so a machine that is idle 90 percent of the time costs
ten times as much per request as the same machine kept busy. For a lot of
self hosted deployments, the dominant cost is not power or silicon, it is
idleness.

## The Levers That Actually Move The Number

**Batching.** Decode reads the weights once per step regardless of how many
sequences are in the batch, so a batch of eight costs barely more per step than
a batch of one and produces eight tokens. This is why throughput per accelerator
climbs steeply with concurrency until you run out of memory for the per
sequence state. It is also why measuring at batch size one and extrapolating
gives you a wildly pessimistic capacity number.

**Output length.** Because decode dominates, capping maximum output tokens is
usually the single biggest cost control you have. A request that rambles for
2000 tokens when 200 would do costs ten times as much in the expensive phase.

**Cache hits.** If a shared prefix, a system preamble, a document header,
repeats across requests, the prefill work for that prefix can be reused.
Restructuring prompts so the stable part comes first is free money.

**Input hygiene.** Every token you send is a token you paid to encode. This is
where the tokenizer work pays off: trimming boilerplate reduces prefill
directly.

## Where The Model Lies To You

Be honest about the limits. Time per request is not latency under load; queueing
delay stacks on top and grows nonlinearly as you approach saturation. Tail
latency is what users feel, and it is not in this arithmetic. Utilization is a
guess until you have production traffic, and traffic is bursty, so sizing for
average utilization gives you a service that falls over at peak.

I still build the model first. Not because it is precise, but because it makes
the sensitivities visible before I spend anything. When the spreadsheet says the
answer is dominated by idle capital, the fix is consolidation or a smaller
machine, not a faster one. When it says decode dominates, the fix is batching
and output caps. Those are different projects, and guessing which one you are
in is expensive.

## References

- [FLOPS](https://en.wikipedia.org/wiki/FLOPS)
- [Roofline model](https://en.wikipedia.org/wiki/Roofline_model)
- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
- [Transformer (deep learning architecture)](https://en.wikipedia.org/wiki/Transformer_%28deep_learning_architecture%29)
- [Power usage effectiveness](https://en.wikipedia.org/wiki/Power_usage_effectiveness)
- [vLLM documentation](https://docs.vllm.ai/en/latest/)
