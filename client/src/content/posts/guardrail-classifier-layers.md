
## The difference that matters

Adding "never discuss X" to a system prompt is not a control. It is a request
made to the same component you are trying to constrain, evaluated by the same
process, with no separate record of whether it worked. When it fails there is
nothing to alert on because nothing observed the failure.

A guardrail, in the operational sense, is a distinct component that inspects
input or output and returns a decision. It has a score, a threshold, a
latency, a failure mode, and a log line. Those five properties are what make
it something you can run, measure, and tune, rather than something you hope
about.

The model doing the classifying can be small. It usually should be. The point
is that it is separate.

## Precision, recall, and the threshold you have to pick

Any classifier makes two kinds of mistake. It flags something benign, a false
positive, or it misses something it should have caught, a false negative. You
cannot minimize both at once by tuning; you can only choose where on the
tradeoff to sit.

That choice belongs to the category, not to the system as a whole. A category
where a miss is severe and a false alarm is a minor annoyance gets an
aggressive threshold. A category where false positives block ordinary
legitimate work gets a conservative one and probably a review path rather than
a hard block.

The failure I would watch for is a guardrail tuned to a threshold that makes
the metrics look good on an evaluation set built out of obvious examples.
Obvious examples are not the hard part. Build the evaluation set from real
traffic, including the near-miss cases that live right at the boundary, and
report performance separately on the easy and hard slices. A number averaged
over both hides exactly the behavior you need to see.

Base rates matter too. If the thing you are catching is genuinely rare, even a
classifier with strong-looking accuracy produces a flagged pile that is mostly
false positives, simply because there are so many more negatives to draw them
from. Whoever reviews the flagged pile needs to know that going in, or they
will learn to dismiss everything.

## Where to put it

Three positions, and they catch different things.

On the input, before the model runs. Cheapest, because you can reject without
paying for generation. Only sees what the user sent.

On the output, before it reaches the user. Catches problems regardless of how
they arose, which is the point, but you have already paid for generation and
you may have to discard a response you streamed part of.

On tool calls and retrieved content, between the model and anything with side
effects. This is the position I think is most undervalued. The model asking to
call a tool with particular arguments is a decision you can evaluate against
policy before anything happens, and unlike text, tool calls are structured and
easy to check exactly.

Streaming complicates output checks. If tokens leave as they are produced, a
check that runs on the complete response runs too late. The options are to
buffer, to check incrementally on sentence boundaries, or to accept that a
partial bad output may reach the client and be retracted. Pick one on purpose
instead of discovering the answer in production.

## The middleware shape

```python
from dataclasses import dataclass

@dataclass
class Verdict:
    allow: bool
    category: str | None
    score: float
    latency_ms: float
    degraded: bool = False

def check(classifier, text, thresholds, budget_ms=250, fail_closed=True):
    try:
        scores, elapsed = classifier.score(text, timeout_ms=budget_ms)
    except (TimeoutError, ConnectionError):
        # the guardrail itself is unavailable
        return Verdict(allow=not fail_closed, category="guardrail_unavailable",
                       score=0.0, latency_ms=budget_ms, degraded=True)

    worst, worst_score = None, 0.0
    for category, score in scores.items():
        if score >= thresholds[category] and score > worst_score:
            worst, worst_score = category, score

    return Verdict(allow=worst is None, category=worst,
                   score=worst_score, latency_ms=elapsed)
```

Two details in there are the ones that get skipped. The per-category threshold
dictionary, rather than one global number, because the categories genuinely
have different costs. And the explicit behavior when the classifier is down,
which is a decision about whether an outage of your safety layer becomes an
outage of your product or a silent removal of your safety layer.

Fail closed on the categories where a miss is unacceptable. Fail open on the
ones where it is not, but emit a loud signal so that "the guardrail has been
off for three days" is impossible to miss. Never leave the choice implicit,
because the implicit answer is always fail open.

## Budget and observability

Every guardrail sits in the request path and adds latency. Two input checks
and two output checks at a couple hundred milliseconds each is most of a
second before the real work is counted. Set a total budget for the safety
layer, hold it, and run independent checks concurrently rather than in
sequence.

Then log enough to tune. For every request: which checks ran, each score, the
threshold in force, the decision, and the latency. Scores, not just decisions.
A log of decisions alone cannot answer whether moving a threshold from 0.8 to
0.7 would have caught last week's incident, and that is precisely the question
you will be asked.

Track the block rate per category as a time series. A sudden change is
information either way. A spike usually means either a new pattern in traffic
or a deployment that changed behavior. A drop to zero almost always means
something broke, and without the time series it looks exactly like everything
being fine.

## The honest limitation

A classifier layer is defense in depth, not a proof. It has a measurable error
rate and it will be wrong on some inputs, including inputs someone constructed
specifically to be wrong on. It reduces how often bad output escapes and
gives you a record of what it caught. It does not make the underlying system
incapable of producing bad output.

Which means the guardrail is not a substitute for the boring controls: least
privilege on anything the model can invoke, hard limits on what actions are
reachable at all, and treating model output as untrusted input to whatever
consumes it next. Those hold even when the classifier is wrong.

## References

- https://owasp.org/www-project-top-10-for-large-language-model-applications/
- https://www.nist.gov/itl/ai-risk-management-framework
- https://en.wikipedia.org/wiki/Precision_and_recall
- https://en.wikipedia.org/wiki/Confusion_matrix
- https://en.wikipedia.org/wiki/Defense_in_depth_(computing)
