
## The Pitch and the Catch

The pitch for machine learning on network telemetry is appealing. Signatures only catch what someone has already characterised. A model that learns normal behaviour could flag the unusual without knowing in advance what unusual looks like.

The catch is arithmetic, and it is the first thing I would check on any such system. Everything else, the model architecture, the feature engineering, the training pipeline, is downstream of whether the numbers can work at all.

This post is my opinion on how to evaluate the idea, not a report on any particular product. The reasoning is what transfers.

## Your Features Are Flow Records

Full packet capture at any real scale is impractical to store and expensive to process, so the input to almost any network analytics system is flow records: IPFIX, NetFlow, or sFlow samples.

A flow record is a summary of a conversation: source and destination address and port, protocol, byte and packet counts, start and end timestamps, TCP flags seen, and the interfaces involved. You lose payload. You keep a compact description of who talked to whom, when, and how much.

Derived features are where the signal usually lives, and they are mostly ratios and rates rather than raw counts:

- Bytes per packet, which separates bulk transfer from interactive traffic and from beaconing
- Ratio of outbound to inbound bytes, which is what makes exfiltration visible
- Number of distinct destinations per source per interval, which is the scanning signature
- Regularity of inter arrival times, since automated communication is far more periodic than human driven traffic
- Fraction of connections that failed to complete, another scanning and misconfiguration indicator

Note that these are all things you can compute with a query and a threshold. Hold that thought.

## The Base Rate Problem

Here is the arithmetic I would insist on seeing, using hypothetical but plausible figures to illustrate the shape of the problem.

Suppose a network generates one million flow records per day, and suppose one hundredth of one percent of them relate to something genuinely worth investigating. That is 100 interesting flows and 999,900 uninteresting ones.

Now suppose a detector that is very good by the standards of this field: it catches 99 percent of the interesting flows, and it has a false positive rate of one tenth of one percent.

```python
total          = 1_000_000
malicious      = int(total * 0.0001)      # 100
benign         = total - malicious        # 999,900
true_positives = malicious * 0.99         # 99
false_positives = benign * 0.001          # about 1,000

precision = true_positives / (true_positives + false_positives)
print(f"alerts per day: {true_positives + false_positives:.0f}")
print(f"precision: {precision:.1%}")
# alerts per day: 1099
# precision: 9.0%
```

Ninety nine percent detection and a one in a thousand false positive rate produce about eleven false alarms for every true one, and eleven hundred alerts a day. No team triages that. The queue gets ignored within a week, and an ignored queue detects nothing regardless of how good the model is.

This is the base rate fallacy, and it is not a flaw in the model. It is a consequence of rare events being rare. The lesson is that false positive rate, not detection rate, decides whether a detector is deployable. Getting the false positive rate to one in ten thousand while holding detection matters far more than pushing detection from 99 to 99.5 percent.

So the first question I would ask any vendor or any project is not "what is your accuracy." It is "at what false positive rate, on a network of what size, and how many alerts per day does that produce."

## Seasonality and Drift

Network traffic is intensely periodic and models that ignore that produce garbage.

There is a daily cycle, a weekly cycle with weekends looking nothing like weekdays, and calendar effects like holidays and, in a school setting, breaks and exam periods. A model trained on one part of the cycle flags the rest of it. Any baseline needs to be computed per time bucket, comparing Tuesday at 10am to other Tuesdays at 10am, not to a global average.

Then there is drift. Networks change constantly: new services, new devices, changed routing, a migration that moves traffic between segments. Every one of those shifts the definition of normal, so a model trained three months ago describes a network that no longer exists. Continuous retraining is required, which introduces its own problem: if an attacker's activity is present during the training window, the model learns it as normal. Slow, patient activity is precisely what adaptive baselining is worst at catching.

## What I Would Deploy First

If I were building detection for a network I ran, I would start with the least sophisticated thing that works and only add complexity where I could show the simple version failing.

Start with inventory and rules. Most real detections come from knowing what should be talking to what. A workstation VLAN host connecting directly to a management interface is not an anomaly requiring a model, it is a policy violation that a firewall rule should have prevented and a log should show.

Add simple statistical baselines next. A moving average with a standard deviation band, computed per hour of week per segment, catches a surprising amount and has the enormous advantage of being explainable. When it fires you can see exactly why.

```python
def ewma_baseline(series, alpha=0.3, k=4.0):
    """Flag points more than k mean-absolute-deviations from a
    smoothed baseline. Deliberately simple and fully explainable."""
    mean, mad, flags = series[0], 0.0, []
    for i, x in enumerate(series):
        deviation = abs(x - mean)
        if i > 20 and mad > 0 and deviation > k * mad:
            flags.append((i, x, round(mean, 2)))
        mean = alpha * x + (1 - alpha) * mean
        mad = alpha * deviation + (1 - alpha) * mad
    return flags
```

Only after that would I consider a learned model, and I would hold it to a specific standard: it must find something the rules and baselines do not, at a false positive rate the team can actually absorb, measured on my network rather than in a general benchmark.

I would also insist on explainability. An alert that says "anomalous" with a score attached is nearly useless to a responder. An alert that says "this host contacted 400 distinct external addresses in 5 minutes, against a normal range of 5 to 20 for this hour" is immediately actionable. If the system cannot produce the second kind of message, it will not survive contact with an on call rotation.

## The Honest Summary

I think there is real value in this space, mostly in reducing noise and in ranking alerts rather than in generating new ones from nothing. Where I stay sceptical is any claim of catching novel attacks with a low enough false positive rate to be usable, because the base rate arithmetic is unforgiving and it does not care how good the model is.

Run the numbers first. If the alert volume is not something a real team can work through every day, nothing else about the system matters.

## References

- [RFC 7011: Specification of the IPFIX Protocol](https://www.rfc-editor.org/rfc/rfc7011.html)
- [RFC 3176: InMon Corporation's sFlow](https://www.rfc-editor.org/rfc/rfc3176.html)
- [Base rate fallacy](https://en.wikipedia.org/wiki/Base_rate_fallacy)
- [Precision and recall](https://en.wikipedia.org/wiki/Precision_and_recall)
- [Concept drift](https://en.wikipedia.org/wiki/Concept_drift)
- [Zeek documentation](https://docs.zeek.org/en/master/)
