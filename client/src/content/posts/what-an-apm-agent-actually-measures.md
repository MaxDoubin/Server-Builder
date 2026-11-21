## What an APM agent is

Application performance monitoring (APM) measures how a running application behaves from the inside: how long each request takes, how often requests fail, and where the time goes. The measuring is done by an agent, a library added to the application that times the code handling each request and reports summaries to a backend. New Relic's documentation describes adding a small library that instruments the application's code automatically. OpenTelemetry, the vendor-neutral open standard for telemetry (data about a running system), describes zero-code instrumentation the same way: it adds OpenTelemetry capabilities to an application, typically as an agent.

An agent sees what the application sees. That sounds obvious, and it is the key to reading every number it produces. The agent knows when a request reached the application, how long each call to a database or another service took, and whether the code raised an error. It does not know what happened before the request arrived or after the response left.

## What gets instrumented

An agent cannot time arbitrary code. OpenTelemetry's documentation says zero-code instrumentation covers requests and responses, database calls, and message queue calls, and that the application's own code is not typically instrumented. Covering that code takes code-based instrumentation, added by hand. The default measurements fall into three groups.

### Web transactions

New Relic defines a transaction as one logical unit of work. For APM, the most common kind is the web transaction, which covers the activity from when the application receives a web request until the response is sent. Work that does not start with a web request, such as a queue consumer, a scheduled job, or a script, is a non-web or background transaction.

OpenTelemetry models the same idea as a span, a unit of work or operation. A trace is a group of spans, linked by a shared trace identifier and parent identifiers, that describes one request. Spans carry a kind, such as Server or Client, which hints at how a backend should assemble the trace. A span for handling an incoming request is typically Server kind.

Grouping matters. Averaging every request together would mix a fast health check with a slow report, so agents group requests by name. New Relic's documentation says varying parts of a name are consolidated into general categories, with `/user/*/control_panel` as its example. OpenTelemetry's HTTP (Hypertext Transfer Protocol) conventions make the same point for the `http.route` attribute: it must be low-cardinality, meaning few distinct values, keeping static path segments and replacing dynamic ones with placeholders.

### Database calls

Each query the application sends is timed as a sub-operation inside the transaction. New Relic calls the parts of a transaction segments and lists database calls among its examples. In OpenTelemetry, a query is typically a child span of kind Client. In a hypothetical 400 millisecond (ms) request, the breakdown might show 310 ms waiting on the database and the rest in application code.

### External calls

Calls from the application to other services are timed the same way, as segments or Client spans. OpenTelemetry calls the mechanism that links services context propagation, and describes it as the concept that enables distributed tracing: spans created in different services can be correlated and assembled into one trace. Without propagation, each service sees only its own slice.

## The core signals

From those measurements the agent derives a small set of signals.

- **Response time**: how long transactions take, from receipt of the request to the end of the response.
- **Throughput**: how many transactions complete per unit of time, often shown as requests per minute (RPM).
- **Error rate**: the fraction of transactions that end in an error, such as an unhandled exception or a server-side error status.
- **Apdex**: a single score from 0 to 1 that folds response time and errors into one number, covered next.

In OpenTelemetry, response time is a histogram metric named `http.server.request.duration`, measured in seconds, with the request method, status code, route, and an error type as attributes. A histogram counts how many measurements fell into each range of values, which keeps a latency distribution without storing every request.

## Apdex, computed exactly

Apdex stands for Application Performance Index. It is defined by the Apdex Technical Specification, version 1.1, published by the Apdex Alliance on January 22, 2007. The score depends on one number chosen by the operator, the threshold T, in seconds.

The specification defines three performance zones with two thresholds, T and F, where F is four times T:

- Satisfied: zero to T.
- Tolerating: greater than T up to F.
- Frustrated: greater than F.

The formula is:

```
Apdex_T = (satisfied count + tolerating count / 2) / total samples
```

Frustrated samples add nothing to the numerator, but they stay in the denominator. The specification's own example: if 80% of users are satisfied, 10% are tolerating, and 10% are frustrated, the index is 0.85. That is 0.80 plus half of 0.10, with the last 10% contributing zero.

As an arithmetic illustration with invented round numbers, take a T of 0.5 seconds and 1,000 requests. If 600 finish within 0.5 seconds, 300 take between 0.5 and 2 seconds, and 100 take longer than 2 seconds, the score is (600 + 150) / 1,000 = 0.75.

Several rules in the specification are easy to miss:

- **T must be shown with the score.** A score is only meaningful with its threshold, so the specification writes it as `0.85 [5.5]`, or with T as a subscript.
- **Errors count as frustrated.** Server aborts, such as a TCP connection closing in the middle of a task, count as frustrated regardless of the measured time. So do application errors the tool can detect, such as a 404 (not found) reply. New Relic's documentation applies this to server-side errors and warns that a high error rate can sit beside a satisfying average response time and a poor Apdex score.
- **Small groups are flagged.** The normal minimum is 100 samples in a report group, and a result from 1 to 99 samples must carry an asterisk. New Relic's documentation similarly says that below 100 requests per minute there is not enough data for a stable score.
- **The default T is a vendor choice.** The specification recommends 4 seconds. New Relic's documentation gives 0.5 seconds as its default for an application server, and says a threshold set for a key transaction overrides the application's value.

## Transaction traces and why they are sampled

A transaction trace is a detailed snapshot of a single transaction: the function calls, database calls, and external calls inside it, with the time each took. Aggregated signals show that a route got slower. A trace shows one example of why.

Keeping a trace of every request is the expensive end of the range. OpenTelemetry's documentation calls sampling one of the most effective ways to reduce the cost of observability while keeping visibility, and lists the price: compute for the sampler, engineering effort, and the chance of missing critical information with a poor strategy.

New Relic's documentation describes its default as a one-minute harvest cycle, the period in which the agent gathers data before sending it. Any transaction slower than a threshold, either four times the Apdex T or a fixed number of seconds, goes into a pool. At the end of the minute, the agent traces the slowest transaction in the pool. Some agents vary this, and the Java agent also collects occasional non-slow transactions. If no transaction crosses the threshold, no trace appears.

OpenTelemetry describes two broad strategies:

- **Head sampling** decides as early as possible, before the trace is complete. It is simple and efficient, but it cannot look at the whole trace, so it cannot ensure that every trace containing an error is kept.
- **Tail sampling** decides after considering all or most of the spans, so it can keep traces by error, latency, or attribute. The documentation says it is harder to implement and operate, and often vendor-specific.

The consequence is that traces are a deliberately biased sample. Selecting the slowest transaction each minute produces useful examples and a poor picture of typical behavior. Counts, averages, and percentiles belong to the aggregated metrics, which cover every request. Traces explain outliers.

## Custom attributes and tagging

Out of the box, an agent knows the route, the duration, and the status. It does not know which customer, which feature flag, or which release produced a request. Attributes fill that gap.

OpenTelemetry defines attributes as key-value pairs that annotate a span, with string, boolean, or numeric values, or arrays of those. Its documentation recommends adding attributes when a span is created, because a sampler can only use attributes that exist at decision time. It also defines semantic conventions, shared attribute names such as `http.route`, so that different tools agree on what a field means.

New Relic's agents expose the same idea through per-language calls that attach a key and a value to the current transaction, such as `add_custom_attribute` in the Python agent and `AddCustomAttribute` in the .NET agent.

Two cautions apply to any tagging scheme:

- **Cardinality.** Every distinct value of an attribute used for grouping creates another series to store. A plan tier has a handful of values. A user identifier has millions. OpenTelemetry's HTTP metric conventions warn that an attribute based on HTTP headers can let an attacker trigger cardinality limits.
- **Sensitive data.** An attribute is exported with the telemetry, so anything the code puts there, such as an email address or a token, leaves the application. What may be attached is a decision for code review.

## Service levels and SLOs

Service levels turn measurements into promises. Google's Site Reliability Engineering book defines the terms:

- A **service level indicator (SLI)** is a carefully defined quantitative measure of some aspect of the service, such as request latency or availability.
- A **service level objective (SLO)** is a target value or range of values for a service level measured by an SLI.
- A **service level agreement (SLA)** is a contract with users that includes consequences for meeting or missing the objectives. If there is no explicit consequence, the book says you are almost certainly looking at an SLO.

New Relic's service level documentation expresses an SLI as the percentage of good responses out of valid requests, and an SLO as that ratio held to a target over a time window, with 99.9% over the last 28 days as its example. For an APM service, its latency example counts web transactions as valid events and those under a chosen duration as good. Its error example counts all transactions as valid and transaction errors, excluding errors marked as expected, as bad.

An SLO differs from Apdex in an important way. Apdex blends a time threshold, a half-credit zone, and errors into a single index. An SLO states one threshold and one target, such as 99% of requests under 300 ms, so the sentence says exactly what is promised.

## Where the numbers mislead

### Averages hide the tail

The Site Reliability Engineering book explains the problem directly: most requests can be fast while a long tail is much slower, and a simple average can obscure the tail and changes in it. Its example is a service where a typical request takes about 50 ms while 5% of requests are 20 times slower. It advises treating latency as a distribution instead of a single mean.

The tail matters because users meet it. Suppose a page makes 10 independent calls and each has a 1% chance of being slow. The chance that at least one is slow is 1 minus 0.99 to the tenth power, about 9.6%. A rare slow call becomes a noticeable fraction of slow pages.

### Percentiles help, with caveats

A percentile states the value below which a given share of requests fall. The 95th percentile (p95) is the time that 95% of requests beat. Percentiles describe the tail that an average hides, and the book gives SLO examples such as 99.9% of calls completing in under 100 ms.

Percentiles have pitfalls too. A p95 computed separately on each server generally cannot be averaged into a fleet-wide p95. Histogram bucket counts can be merged across servers, and a percentile estimated from the merged buckets. OpenTelemetry notes that aggregation can be exact or estimated, so a percentile read from buckets is only as precise as the boundaries. The recommended boundaries for `http.server.request.duration` run from 0.005 to 10 seconds, so a p99 near 3 seconds is only known to lie between 2.5 and 5 seconds.

### Sampling bias

A set of slow traces is not a sample of traffic. Head sampling at a low rate may drop the one rare error that mattered, and OpenTelemetry's documentation says head sampling cannot ensure that every trace with an error is sampled.

### Apdex has limits

The threshold is a human judgment, and the same traffic can score very differently at two values of T. The score also treats a response just beyond F and one far beyond F identically. Mixing routes with different expectations, such as a search box and a report export, produces a number that describes neither. The specification frames Apdex around the time a human waits on a task, so it is a poor fit for work where nobody is waiting.

### The agent starts timing late

The specification asks that measurements approximate what a user could time with a stopwatch. An in-process agent starts its clock when the application receives the request. Time in a browser, on the network, or waiting in a queue before the application picked the request up is outside what the agent can time, so a dashboard can look healthy while users wait longer than the agent's number.

### Overhead is real

Timing every call costs some central processing unit (CPU) time and memory, and every report costs network traffic. New Relic's APM introduction page states that its agents track performance with minimal overhead, giving a figure of under 3% performance impact. That is a vendor statement, and the real cost depends on the application, the language, and the settings, so it is worth measuring on the actual workload.

## How APM differs from logs, metrics, and infrastructure monitoring

The signals answer different questions:

| Signal | What it records | Good for | Weak at |
| --- | --- | --- | --- |
| APM | Timed work inside the application, per transaction | Which route or call is slow or failing | Anything the agent cannot see |
| Metrics | Aggregated numbers over time | Trends, alerts, capacity | Explaining one request |
| Logs | Timestamped records of discrete events | Detail about one event | Aggregates and timing across calls |
| Infrastructure monitoring | Resource use of hosts, containers, and networks | Saturation of the machines | Which code or route is responsible |

OpenTelemetry describes a metric as a measurement of a service captured at runtime, and says metrics suit aggregate analysis while tracing follows individual request lifecycles. APM is best understood as traces and metrics produced automatically at the application layer. New Relic describes its infrastructure agent as collecting performance and health data about system resources and processes, and its documentation shows log messages related to errors and traces in the same views, which is how the signals connect in practice.

For the log side, see [Log analysis methodology](/blog/log-analysis-methodology). For a metrics system, see [Prometheus server monitoring](/blog/prometheus-server-monitoring). For a view from below the application, which uses eBPF (a kernel feature for running small verified programs), see [eBPF observability basics](/blog/ebpf-observability-basics).

## Sources

- Apdex Technical Specification, version 1.1: https://www.apdex.org/wp-content/uploads/2020/09/ApdexTechnicalSpecificationV11_000.pdf
- New Relic, Apdex: measure user satisfaction: https://docs.newrelic.com/docs/apm/new-relic-apm/apdex/apdex-measure-user-satisfaction/
- New Relic, Transaction traces: https://docs.newrelic.com/docs/apm/transactions/transaction-traces/transaction-traces/
- New Relic, Transactions in APM: https://docs.newrelic.com/docs/apm/transactions/intro-transactions/transactions-new-relic-apm/
- New Relic, APM introduction: https://docs.newrelic.com/docs/apm/new-relic-apm/getting-started/introduction-apm/
- New Relic, Create and edit SLIs and SLOs: https://docs.newrelic.com/docs/service-level-management/create-slm/
- New Relic, Python agent add_custom_attribute: https://docs.newrelic.com/docs/apm/agents/python-agent/python-agent-api/addcustomattribute-python-agent-api/
- New Relic, .NET custom attributes: https://docs.newrelic.com/docs/apm/agents/net-agent/attributes/custom-attributes-net/
- New Relic, Infrastructure monitoring: https://docs.newrelic.com/docs/infrastructure/infrastructure-monitoring/get-started/get-started-infrastructure-monitoring/
- OpenTelemetry, Traces: https://opentelemetry.io/docs/concepts/signals/traces/
- OpenTelemetry, Sampling: https://opentelemetry.io/docs/concepts/sampling/
- OpenTelemetry, Metrics: https://opentelemetry.io/docs/concepts/signals/metrics/
- OpenTelemetry, Zero-code instrumentation: https://opentelemetry.io/docs/concepts/instrumentation/zero-code/
- OpenTelemetry, HTTP metrics semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/http-metrics/
- Google, Site Reliability Engineering, Service Level Objectives: https://sre.google/sre-book/service-level-objectives/