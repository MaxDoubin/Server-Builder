
## The curve everyone learns the hard way

A system runs fine at half capacity. Traffic grows twenty percent and it still
runs fine. Traffic grows another twenty percent and response times triple.
Nothing was deployed, no hardware changed, and the CPU graph went from
comfortable to alarming without passing through concerning.

This is not mysterious. It is the shape of a queue, and you can predict it
with arithmetic that fits on one screen.

Start with Little's law, which is the most useful thing in this whole area
because it makes no assumptions about arrival patterns or service time
distributions at all:

    L = lambda * W

The average number of items in a system equals the arrival rate multiplied by
the average time each one spends there. It is an identity, not a model. It
means if you know two of the three you know the third, and it converts between
quantities you can measure and quantities you care about. Two hundred requests
per second with an average response time of 150 milliseconds means thirty
requests are in flight at all times, so a worker pool of ten is already the
bottleneck and no amount of tuning will fix that.

## Where the cliff comes from

Now add a model. For a single server with random arrivals and exponential
service times, the classic M/M/1 result is that the average time in the system
is one divided by the difference between the service rate and the arrival
rate. Rewritten in terms of utilization, the queue delay is proportional to
`rho / (1 - rho)`, and the total response time is the service time multiplied
by `1 / (1 - rho)`.

That denominator is the entire story.

```python
service_time_ms = 10.0

print(f"{'util':>6}  {'multiplier':>10}  {'response ms':>11}")
for rho in (0.50, 0.70, 0.80, 0.90, 0.95, 0.98, 0.99):
    multiplier = 1.0 / (1.0 - rho)
    print(f"{rho:>6.2f}  {multiplier:>10.1f}  {service_time_ms * multiplier:>11.1f}")
```

At half utilization the queue doubles your response time. At eighty percent it
is five times the service time. At ninety five percent it is twenty times, and
at ninety nine it is a hundred. The work per request never changed. Only the
waiting did.

This is why "we have plenty of headroom, we are only at 80 percent" is a
misreading. Eighty percent utilization is not eighty percent of the way to
trouble. It is already well up the curve, and the remaining twenty percent of
capacity buys you almost no latency budget.

## Variability is the other half

The M/M/1 model assumes a specific amount of randomness. Real systems are
usually worse, and Kingman's approximation shows what that costs:

    Wq ~= ( rho / (1 - rho) ) * ( (ca^2 + cs^2) / 2 ) * ts

`ca` and `cs` are the coefficients of variation of the arrival intervals and
the service times, and `ts` is the mean service time. The first term is the
utilization cliff. The second term is a multiplier for how irregular your
world is.

The practical reading: reducing variability improves latency without adding
any capacity at all. An endpoint whose service time ranges from 5 milliseconds
to 5 seconds punishes every request behind a slow one. Splitting slow and fast
work into separate pools, capping the worst case with a timeout, and making
batch jobs arrive on a jittered schedule instead of exactly on the hour all
push that second term down.

It also explains why one pool of ten workers beats ten pools of one. Pooling
lets a free server take the next request instead of it waiting behind a busy
one, and the benefit grows exactly where the cliff is steepest.

## What this changes in practice

**Pick a utilization target, not a utilization limit.** Decide the response
time you need, work backwards through the multiplier, and set your scaling
threshold there. For latency sensitive services that usually lands somewhere
well below what a capacity spreadsheet would suggest.

**Expect the tail to break first.** Averages hide the cliff. The p99 is
dominated by queue depth, so it degrades long before the mean looks bad. Graph
percentiles, and graph the queue itself: run queue length, worker pool
saturation, accept queue depth, listen backlog overflows.

```bash
uptime                                   # load average is a queue length
vmstat 1 5                               # r column: threads waiting to run
ss -ltn                                  # Recv-Q on a listener is backlog depth
nstat -az TcpExtListenOverflows          # nonzero means you dropped connections
```

**Retries are a positive feedback loop.** A retry adds to lambda at precisely
the moment mu has dropped. That is how a small slowdown becomes an outage.
Retry budgets, exponential backoff with jitter, and circuit breakers exist to
keep the arrival rate from rising during the failure.

**Bound every queue.** An unbounded queue does not prevent overload, it hides
it, converting a fast rejection into a slow timeout while burning memory.
Bound the queue, shed load when it fills, and return an honest error. A user
who gets an immediate failure retries once. A user who waits thirty seconds
for a timeout retries angrily, several times.

**Admission control beats autoscaling for spikes.** Scaling takes minutes and
the cliff arrives in seconds. A concurrency cap in front of the service keeps
you on the flat part of the curve while capacity catches up.

None of this requires deriving anything. Little's law and one over one minus
rho, taken seriously, will predict most of the capacity surprises you would
otherwise meet during an incident.

## References

- [Little's law](https://en.wikipedia.org/wiki/Little%27s_law)
- [M/M/1 queue](https://en.wikipedia.org/wiki/M/M/1_queue)
- [Kingman's formula](https://en.wikipedia.org/wiki/Kingman%27s_formula)
- [Queueing theory](https://en.wikipedia.org/wiki/Queueing_theory)
- [uptime(1) manual page](https://man7.org/linux/man-pages/man1/uptime.1.html)
- [Prometheus: histograms and summaries](https://prometheus.io/docs/practices/histograms/)
