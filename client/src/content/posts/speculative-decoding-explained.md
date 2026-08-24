
## Why generation is slow in an annoying way

Text generation is sequential by construction. Each token depends on every
token before it, so a model produces one token, appends it, and runs again.
The frustrating part is that a single forward pass for one token barely
exercises the hardware. Nearly all of the time goes into moving weights from
memory into the compute units, and then a tiny amount of arithmetic happens
before the next pass starts the same movement again.

That means a single-stream generation is limited by memory movement, not by
arithmetic capacity. The accelerator is mostly waiting. If you could give it
several tokens of work per weight load, you would get more output for the same
memory traffic.

Speculative decoding is a way to do exactly that without changing the answer.

## The draft and verify loop

Use two models. A small fast one, the draft model, and the real one, the
target model. The draft proposes several tokens ahead. The target then
evaluates all of the proposed positions in one forward pass and decides how
many to keep.

The key insight is that checking a proposed sequence costs one pass, not one
pass per token. The target model can score positions in parallel because it
already has the candidate tokens sitting in front of it. Producing tokens is
sequential. Verifying tokens is not.

```python
def speculative_step(target, draft, prefix, k=4):
    # 1. draft proposes k tokens, one at a time, cheaply
    proposal = []
    ctx = list(prefix)
    for _ in range(k):
        t = draft.sample_next(ctx)
        proposal.append(t)
        ctx.append(t)

    # 2. target scores all k+1 positions in a single forward pass
    target_dists = target.forward_positions(prefix, proposal)

    # 3. accept the longest prefix of the proposal the target agrees with
    accepted = []
    for i, tok in enumerate(proposal):
        if target_accepts(target_dists[i], tok):
            accepted.append(tok)
        else:
            # replace the first rejected token with the target's own choice
            accepted.append(sample_from(corrected(target_dists[i])))
            return prefix + accepted
    # everything accepted: take a free bonus token from the extra position
    accepted.append(sample_from(target_dists[k]))
    return prefix + accepted
```

Notice the last two branches. On a rejection you do not throw the whole round
away, you keep everything up to the disagreement and take the target's token
at that position. On full acceptance you get one extra token free, because the
verification pass already computed a distribution for the position after the
last proposed token.

The acceptance test is what makes this exact rather than approximate. Done
correctly, with the right rejection and correction rule, the tokens coming out
follow the same distribution the target model would have produced on its own.
This is not a quality tradeoff. It is the same output, arrived at faster.

## The arithmetic that decides whether it helps

Let k be how many tokens you propose per round and a be the average number
accepted. Each round costs one target pass plus k draft passes. If the draft
model costs a fraction c of a target pass, the cost per round is roughly
`1 + k*c` target passes and produces about `a + 1` tokens.

So the speedup is about `(a + 1) / (1 + k*c)`.

Three things fall out of that expression:

- Acceptance rate dominates. If the draft agrees with the target most of the
  time, you win big. If it agrees rarely, you paid for the draft passes and
  got almost nothing.
- The draft must be genuinely cheap. A draft that costs a third of the target
  eats the gain before acceptance even matters.
- k has an optimum. Larger k means more potential tokens per round but also
  more wasted draft work when an early rejection throws away the tail. Past
  the point where acceptance typically stops, extra k is pure cost.

Acceptance is workload dependent. Predictable text with lots of boilerplate,
repeated structure, or long shared vocabulary accepts well. Dense reasoning
where the target keeps making choices the draft would not accepts poorly. The
same pair of models can behave very differently on two prompt distributions.

## When I would not bother

Speculative decoding buys back idle hardware. If your hardware is not idle,
there is nothing to buy back.

A server already running many concurrent requests is doing plenty of
arithmetic per weight load, because it is amortizing the same weights across
many sequences. Adding speculation there competes for the same compute and
can make aggregate throughput worse even while individual responses look
faster. The classic win case is the opposite: one user, one stream, latency
that a person is sitting there waiting on.

There is also a memory cost. The draft model occupies device memory that the
target model is not using, and on a card that was already tight that tradeoff
is not obviously good.

## How I would evaluate it

This is my own approach, not a rule handed down. I would fix a prompt set that
looks like real traffic and measure three numbers on it: average tokens
accepted per round, end-to-end latency per request, and total tokens per
second across the whole server under the concurrency I actually run.

Then I would check that the outputs are distributionally the same as the
target alone, because an implementation bug in the acceptance rule shows up as
subtly worse text rather than as an error. Same prompts, same seed, compare.

If accepted tokens per round is low, the answer is a better draft, not a
larger k. A draft trained or distilled from the same family usually agrees far
more often than an unrelated small model of similar size, and agreement is the
entire economics of the technique.

## References

- https://en.wikipedia.org/wiki/Speculative_execution
- https://en.wikipedia.org/wiki/Autoregressive_model
- https://huggingface.co/docs/transformers/generation_strategies
- https://docs.vllm.ai/en/latest/
- https://en.wikipedia.org/wiki/Large_language_model
