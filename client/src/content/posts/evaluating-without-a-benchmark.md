
## Public Benchmarks Answer Somebody Else's Question

Every time a new model appears, the conversation is about scores on named
benchmarks. Those numbers are not useless, but they are answering a question
that is not yours. A benchmark measures performance on a fixed distribution of
tasks assembled by other people for general comparison. Your application has one
task, one input distribution, and one definition of a good answer.

There is also the contamination problem. Widely published test sets have a way
of ending up in training data, and a score that reflects memorization tells you
nothing about a document the model has never seen. That is not an accusation
against anyone, it is a structural consequence of training on large scrapes of
the public internet.

So the practical question is: how do you evaluate for your own use, with no
benchmark, limited time, and no annotation budget? It is more tractable than it
looks.

## Freeze A Small Set Of Real Inputs

Start with real traffic, or the closest thing you have. Fifty to two hundred
examples is enough to be useful and small enough that you will actually maintain
it. Below about fifty, the noise swamps everything.

Sample deliberately rather than randomly. You want the common case represented,
because that is most of your volume, but you also want the awkward ones:
the ambiguous inputs, the ones in another language, the empty and malformed
ones, the adversarial ones, and every case that has caused an incident. That
last category is the most valuable set you own, because those are regressions
you have already paid for once.

Then freeze it. Put it in version control. Do not regenerate it casually,
because a moving evaluation set means you can never compare across time, and
comparison across time is the entire point. Add to it deliberately, in commits,
with a note about why.

Hold some of it back. If you tune prompts against every example you have, you
have fit to your evaluation set and your numbers will be optimistic in exactly
the way a benchmark is.

## Write The Rubric Before You Look At Any Output

This is the step that separates evaluation from opinion. Before you see a single
response, write down what makes an answer good, in terms specific enough that
two people would grade the same output the same way.

Vague: "the summary is high quality." Gradeable: "every named entity in the
summary appears in the source; the summary is under 80 words; the stated
severity matches the source; no recommendation appears that the source does not
support."

Prefer binary or three point scales over five and seven point ones. People are
bad at fine distinctions and good at yes or no. A checklist of six binary
criteria gives you more reliable signal than one holistic score out of ten, and
it tells you *which* thing broke when the number drops.

Write the rubric first because it is very hard to define quality honestly after
you have seen which system produced which output. That is not dishonesty, it is
how anchoring works, and the defense is procedural.

## Do Not Fool Yourself About Sample Size

With 100 examples and a system that succeeds 80 times, the point estimate is 80
percent. The uncertainty around that is not small. A rough approximation for the
standard error of a proportion is the square root of `p * (1 - p) / n`, which
here is about 4 percentage points, so a 95 percent interval spans roughly 72 to
88 percent. A rival system scoring 84 percent on the same 100 examples has not
demonstrated anything.

The fix is not always more examples. It is paired comparison. Run both systems
on the *same* inputs and count only the examples where they differ. Shared
difficulty cancels out, and you need far fewer examples to detect a real
difference.

```python
import random

def paired_bootstrap(scores_a, scores_b, rounds=10_000, seed=0):
    '''Fraction of resamples where A beats B on the same inputs.'''
    assert len(scores_a) == len(scores_b)
    rng = random.Random(seed)
    n = len(scores_a)
    idx = range(n)
    wins = 0
    for _ in range(rounds):
        sample = [rng.choice(idx) for _ in range(n)]
        a = sum(scores_a[i] for i in sample) / n
        b = sum(scores_b[i] for i in sample) / n
        wins += (a > b)
    return wins / rounds

def disagreements(scores_a, scores_b):
    '''The only examples worth reading by hand.'''
    return [i for i, (a, b) in enumerate(zip(scores_a, scores_b)) if a != b]

# confidence near 0.5 means you have not measured a difference,
# whatever the two averages happen to look like.
```

The `disagreements` helper matters as much as the statistics. Reading the twelve
examples where two systems differ teaches you more in twenty minutes than
staring at two averages ever will.

## Judges, Agreement, And Gates

Grading by hand does not scale, so people use a model as a judge. This works
better than you would expect and fails in specific ways: judges favour longer
answers, favour outputs that look like their own style, and are sensitive to the
order options are presented in. Randomize order, and check for length bias by
looking at whether the judge's preference correlates with response length.

Calibrate the judge before you trust it. Grade thirty examples yourself, have
the judge grade the same thirty, and measure agreement with something that
accounts for chance agreement rather than raw percentage. If the judge does not
agree with you at a level you would accept from a human colleague, fix the rubric
before automating anything, because you are about to scale up a disagreement.

Then wire it into the pipeline. The evaluation runs on every prompt change,
every model change, and every retrieval change. It reports per criterion, not
just an aggregate, because an aggregate hides which thing broke. It fails the
build on the regression suite, the examples drawn from real incidents, and
merely reports on the rest.

None of this is sophisticated. It is a frozen test set, a written rubric,
honesty about sample size, and a gate in continuous integration. It is the same
discipline as writing tests for code, applied to a component whose output is not
deterministic. The lack of glamour is precisely why so few people do it, and why
doing it is such a large advantage.

## References

- [Precision and recall](https://en.wikipedia.org/wiki/Precision_and_recall)
- [Confidence interval](https://en.wikipedia.org/wiki/Confidence_interval)
- [Inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability)
- [Cohen's kappa](https://en.wikipedia.org/wiki/Cohen%27s_kappa)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [MLflow documentation](https://mlflow.org/docs/latest/index.html)
