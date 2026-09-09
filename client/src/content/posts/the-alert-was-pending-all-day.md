## The dashboard is alarming and the alert history is empty

Somebody sends you a screenshot. The line is over the threshold for most of
the day, in a colour chosen to be upsetting, and the alert on that exact
expression has never fired. Not fired and resolved. Never fired.

The rule is not broken and the threshold is not wrong. The alert and the graph
are answering different questions, and the whole difference is in two
clauses: an alerting rule is a question asked **at a fixed cadence**, of
whatever value the query engine can find **at that instant**. Almost every one
of these ends up being one of those two.

## for does not accumulate, and it does not pause

Here is a rule and a metric that spends four minutes out of every five over
the line:

```yaml
- alert: JobsSlow
  expr: job_runtime_seconds > 120
  for: 5m
```

Evaluated every minute, the state at each evaluation goes:

```
p p p p i p p p p i p p p p i p
```

Pending, four times, then one inactive evaluation, then pending four times
again, for as long as you care to run it. It never fires. The metric is over
the threshold at thirteen of those sixteen evaluations.

The documentation says Prometheus will check that the alert continues to be
active during each evaluation, and "continues" is doing all the work. The
clause is not a budget that fills up and it is not a stopwatch that pauses. It
is a start time, and an evaluation where the expression returns nothing clears
that start time. The next active evaluation begins a new one from zero.

So `for` longer than the period of a flapping metric produces silence, and it
produces it in the most convincing way possible: the alert goes pending on
schedule, every time, and somebody watching the alerts page sees it flicker
amber and assumes that means it is working.

The same mechanism with one dip is less dramatic and more common. Four minutes
in, one evaluation under the line, and a rule with `for: 5m` fires at ten
minutes instead of five. Nothing in the notification says the clock restarted.

## for rounds up to the evaluation interval

`for: 30s` on a rule group evaluated every sixty seconds is `for: 60s`. So is
`for: 1s`. And `for: 90s` is `for: 120s`.

This falls out of the clause being checked only at evaluations. The alert
becomes active at some evaluation, no time has yet elapsed, so it is pending;
the next evaluation is a whole interval later, and whatever the clause said,
that is the earliest it can be satisfied.

It matters because the number in the rule looks like a delay in seconds and is
not one. If you want a genuinely faster alert, the evaluation interval is the
thing to change, and it is a property of the rule group rather than of the
rule. If you want the number to mean what it says, write it as a multiple of
that interval.

There is a second consequence worth having in your head. On a target scraped
every sixty seconds, in a group evaluated every fifteen, a `for: 30s` is
satisfied by three consecutive evaluations reading the same sample. The
condition was confirmed by one measurement, looked at three times. A `for`
shorter than the scrape interval is confirming the clock, not the metric.

## A spike shorter than the interval never happened

Fifteen second scrapes, sixty second evaluations, and latency at 900ms for
half a minute. The graph draws it, because the graph draws samples. The rule
never sees it, because at every evaluation the newest sample is one of the
0.2s ones on either side.

Scrape resolution decides what a dashboard can show. Evaluation interval
decides what an alert can see. On most installations these are different
numbers and nobody has thought about the gap between them since the day the
config was written.

The fix is to alert on something that survives the gap: `max_over_time` on the
scrape window as a recording rule, or a threshold on a rate rather than on an
instantaneous value. Either makes a short spike visible at any evaluation
after it. Dropping the evaluation interval to the scrape interval also works
and costs you an evaluation of every rule four times as often.

## The instant, and two different ways for data to stop

An instant query takes the newest sample less than the lookback period ago,
five minutes by default. That is not the same as "the last value", and it is
not the same as "the value now".

When a target stops returning a series it was previously returning, Prometheus
writes a stale marker, and a query evaluated after that marker returns nothing
for that series. Nothing, not the old value. So:

```yaml
- alert: DiskAlmostFull
  expr: disk_used_ratio > 0.9
  for: 2m
```

is firing, the exporter dies, and at the next evaluation the expression
returns no elements, so the alert has nothing to be active about and it
resolves. You get a resolved notification. The disk did not get any emptier.
Your monitoring told you the problem went away because it stopped being able
to tell you anything at all.

Now the same failure on an exporter that puts its own timestamps on samples: a
federation endpoint, a pushgateway, anything scraping something else and
passing values through. Those do not get a stale marker. The last sample stays
the newest one, so the rule keeps evaluating it, and keeps firing, for the
full lookback period after the data stopped arriving.

Same failure, two opposite outcomes, and the gap between them is the lookback
period less one scrape interval: on the numbers above, one resolves a minute
after the data stops and the other holds on for six. Nothing in the rule
distinguishes them. Which of your targets set their own timestamps is a
short list, and it is worth knowing, because it changes what every alert on
them means.

## absent() is the only expression that notices nothing

A threshold on a series that returns nothing returns nothing, and an alert
whose expression returns nothing is not firing. There is no arrangement of
comparison operators that fixes this, because the problem is not the
comparison.

```yaml
- alert: DiskMetricMissing
  expr: absent(disk_used_ratio)
  for: 5m
```

`absent()` returns an element when its argument returns none, which makes it
the inverse of everything else you write. Pair it with the threshold alert for
anything whose disappearance matters, and give it a `for` long enough to
survive a restart of the exporter. `up == 0` does the same job for a whole
target; `absent()` does it for one series, which is what you want when a
target answers and has quietly stopped exporting one metric.

The shape to look for in an alert history is a resolved notification that
nobody acted on. Something resolved itself, and either it genuinely did, or
the thing measuring it went away.

## keep_firing_for, and the one interval nobody expects

`keep_firing_for` holds a firing alert up for a while after the condition stops
being met. It is the only thing in the state machine that survives an inactive
evaluation, and it exists for a condition that is genuinely present and
intermittently unmeasurable, where a resolve and a re-fire produce two
notifications and a false sense that something was done.

Two things about it are worth knowing precisely.

It only protects a **firing** alert. A pending one has no such grace, and the
same evaluation that would have been forgiven clears its `for` clock instead.

And the clock starts later than the sentence suggests. The documentation says
it keeps the alert firing "for the specified duration after the firing
condition was last met". The code stamps the clock at the first evaluation that
missed, which is one interval after that:

```go
if a.State == StateFiring && r.keepFiringFor > 0 {
        if a.KeepFiringSince.IsZero() {
                a.KeepFiringSince = ts
        }
        if ts.Sub(a.KeepFiringSince) < r.keepFiringFor {
                keepFiring = true
        }
}
```

The `ts` it stores is the evaluation doing the noticing, not the one before it,
so the grace runs an evaluation interval longer than the sentence reads. That
same `StateFiring` in the first line is the other half: it is the reason a
pending alert gets none of this.
I wrote a model of this from the sentence, and it was wrong by exactly that,
which is not a difference you would ever notice from the outside and is
exactly the sort of thing to read the source for.

## Seeing it on a real Prometheus

The alerts page shows pending and firing with the time each became active. An
alert that is permanently pending and never firing is the flap case, and it is
invisible in any notification history because it never produced one.

`ALERTS{alertstate="pending"}` is itself a series, so you can graph how long a
rule spends pending. A sawtooth there is a `for` clause being cleared over and
over.

For a rule that should have fired, evaluate its expression as an instant query
at the timestamp you care about, rather than as a range. The range is what the
graph drew. The instant is what the rule asked, and if the two disagree, that
disagreement is the whole answer.

And keep `up` and `scrape_duration_seconds` next to any metric you alert on,
because they are how you tell a value that changed from a target that stopped
answering. For the rest of the setup around these rules, the retention
arithmetic and the Alertmanager defaults that decide when a notification
actually arrives, there is a longer piece on
[running a Prometheus server](/blog/prometheus-server-monitoring).

## The four questions, in order

1. Is the condition true **at an evaluation**, or only between them? Compare
   the evaluation interval against the width of the thing you are trying to
   catch.
2. Does it stay true for `for` **consecutive** evaluations? One that misses is
   enough to clear the clock.
3. Is `for` a multiple of the evaluation interval? If not, it is the next
   multiple up.
4. When the data stops, does the series go stale or linger? That decides
   whether this alert resolves or keeps firing, and it depends on the
   exporter rather than on the rule.

None of those are about the threshold, and the threshold is the first thing
everybody changes.

You can work through ten of these, including the one that is pending all day,
at [the graph crossed the line](/alerts).

## References

- [Prometheus, on alerting rules and the for clause](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Prometheus, on staleness and the lookback period](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [rules/alerting.go, where keep_firing_for is implemented](https://github.com/prometheus/prometheus/blob/main/rules/alerting.go)
- [Prometheus, on absent() and the other query functions](https://prometheus.io/docs/prometheus/latest/querying/functions/)
- [Alertmanager configuration, for group_wait and repeat_interval](https://prometheus.io/docs/alerting/latest/configuration/)
