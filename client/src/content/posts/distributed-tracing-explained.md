## One request, many services, no single log

A request to a modern web application rarely stays in one program. A click might pass through a load balancer, a gateway, an authentication service, a database, and a background worker that sends an email later. Each component writes its own logs and metrics. When the request is slow or fails, the question is simple to ask and hard to answer: which hop was responsible?

Metrics can say that latency went up, and logs can say what one process saw, but neither ties together the separate pieces of work that belonged to one user request. Distributed tracing records the path of a single request through every service it touches, with timing for each step.

This article covers traces and spans, context propagation, the World Wide Web Consortium (W3C) header standard, OpenTelemetry's span model, sampling, the common ways traces break, a curl based propagation check, and what traces cannot answer.

## Traces and spans

### The span

A span is one unit of work: an incoming HTTP (Hypertext Transfer Protocol) request handled by a server, an outgoing call to another service, a database query, or a function worth timing. Every span has a name, a start time, an end time, and two identifiers. The span identifier is unique to that span. The trace identifier is shared by every span that belongs to the same request.

Each span (except the first) also records the identifier of its parent span. That single field turns independent records into a tree.

### The trace

A trace is the full set of spans that share one trace identifier. The span with no parent is the root span; in the OpenTelemetry documentation's words, it marks the beginning and end of the entire operation. A tracing backend rebuilds the tree and usually draws it as a waterfall: one bar per span, indented under its parent, on a shared timeline.

The spans in a trace can come from different processes, services, and machines. So something has to carry the trace identifier and the parent's span identifier from one machine to the next.

## Context propagation

OpenTelemetry describes context as an object that contains the information the sending and receiving services need, and propagation as "the mechanism that moves context between services and processes." In practice, propagation has two halves:

- **Inject.** On an outgoing call, instrumentation writes the trace identifier and the calling span's identifier into the request, usually as HTTP headers.
- **Extract.** The receiving service reads those headers, rebuilds the context, and creates its server span as a child of the caller's span.

Repeat that at every hop and the whole request carries one trace identifier from the edge to the deepest dependency. Instrumentation libraries normally do both halves automatically for common HTTP clients, HTTP servers, and remote procedure call (RPC) frameworks.

Services written in different languages and instrumented by different vendors must agree on header names and format. That agreement is the W3C Trace Context standard, and OpenTelemetry's default propagator uses its headers.

## The W3C Trace Context standard

Trace Context is a W3C Recommendation. The current Recommendation is dated 23 November 2021 and updates the February 2020 Recommendation with editorial changes only. It defines two HTTP headers: `traceparent` and `tracestate`. The specification says vendors must accept these header names in any case and should send them in lowercase.

### The traceparent header

`traceparent` carries the four fields every participant needs, separated by hyphens. This is the example from the specification:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

Field by field:

| Field | Length | Example | Meaning |
|---|---|---|---|
| version | 2 hexadecimal (hex) characters | `00` | Format version. `00` is the current version; `ff` is invalid. |
| trace-id | 32 hex characters (16 bytes) | `4bf92f3577b34da6a3ce929d0e0e4736` | Identifies the whole trace. All zeros is invalid. |
| parent-id | 16 hex characters (8 bytes) | `00f067aa0ba902b7` | The span identifier of the caller's span, which becomes the parent of the receiver's span. All zeros is invalid. |
| trace-flags | 2 hex characters | `01` | Bit field. The rightmost bit is the sampled flag. |

Hex digits must be lowercase. Adding up the fields, a well-formed version `00` header value is exactly 55 characters long: 2 + 32 + 16 + 2 hex characters plus 3 hyphens.

The name "parent-id" is from the receiver's point of view: to the sender, it is the identifier of the span that made the call. A service that forwards the request onward replaces the parent-id with its own span identifier, so the value changes at every hop while the trace-id stays the same.

The trace-flags field in the 2021 Recommendation defines only one flag. When the sampled flag (`01`) is set, the specification says it "denotes that the caller may have recorded trace data." The other bits are reserved, and vendors must set them to zero. A newer draft, Trace Context Level 2 (a Candidate Recommendation Draft dated March 2024, not yet a Recommendation), adds a `random-trace-id` flag (bit value `02`).

If the trace-id or parent-id is invalid, the receiver must ignore the `traceparent` and, per the processing model, start a new trace. A receiver that sees a higher version than it understands should still try to parse the known fields using the version `00` layout.

### The tracestate header

`traceparent` is small and vendor neutral. `tracestate` carries vendor specific trace identification data, so a request that crosses systems watched by different tracing products keeps each product's information.

It is a comma separated list of `key=value` pairs. This example, from the specification, has entries from two systems:

```
tracestate: rojo=00f067aa0ba902b7,congo=t61rcWkgMzE
```

Rules from the specification:

- There can be at most 32 list members.
- Each key appears only once, because an entry represents that vendor's last position in the trace.
- When a vendor updates its entry, the entry moves to the left of the list, so the most recently updated vendor is first.
- Values are limited to 256 printable ASCII (American Standard Code for Information Interchange) characters and cannot contain commas or equals signs.

## How OpenTelemetry represents spans

OpenTelemetry is an open source project that provides the application programming interfaces (APIs), software development kits (SDKs), and data formats that many tracing setups use. In its trace API, a valid trace identifier is a 16 byte array and a valid span identifier an 8 byte array, each with at least one nonzero byte. Those sizes match the 32 and 16 hex characters in `traceparent`.

### Span context

Every span has an immutable span context made of four parts:

- the trace identifier
- the span identifier
- the trace flags (including the sampled flag)
- the trace state (the vendor key/value pairs from `tracestate`)

That is the same information the two headers carry. A span context that was extracted from an incoming request is marked as remote, which is how the SDK knows its parent lives in another process.

### What else a span holds

On top of the span context, the OpenTelemetry documentation lists:

- **Name** of the operation.
- **Parent span identifier**, empty for root spans.
- **Start and end timestamps.**
- **Attributes**: key/value metadata, such as an HTTP route or a database system name.
- **Span events**: timestamped annotations marking a single moment within the span, such as an exception being thrown.
- **Span links**: references to other spans that are causally related but are not the parent.
- **Status**: `Unset` (the default, no error recorded), `Error`, or `Ok` (a developer explicitly marked the operation as successful).
- **Span kind**: `Server` for a synchronous incoming call, `Client` for a synchronous outgoing call, `Internal` for work that does not cross a process boundary (the default), `Producer` for creating a job that may be processed later, and `Consumer` for processing such a job, possibly long after the producer span ended.

## Sampling: deciding which traces to keep

The OpenTelemetry sampling guide suggests considering sampling at around 1,000 or more traces per second, and says systems producing only tens of small traces per second or fewer may not need it. The two main approaches differ in when the decision is made.

### Head-based sampling

Head sampling makes the decision as early as possible, typically when the root span is created. A common form keeps a fixed fraction of traces chosen from the trace identifier, so every service that sees the same trace identifier can reach the same answer.

The decision travels with the request in the sampled flag. In OpenTelemetry SDKs, the default sampler is `ParentBased(root=AlwaysOn)`: a span with no parent is always sampled, and a span with a remote parent follows that parent's sampled flag, recording if it was set and dropping if it was not.

The OpenTelemetry documentation calls head sampling easy to understand, easy to configure, and efficient. But because the decision happens before the request has done anything, it cannot be based on what happens later. The documentation notes that head sampling alone cannot ensure that all traces containing an error are kept. If the rate is 1 percent, roughly 99 percent of failing requests are dropped.

### Tail-based sampling

Tail sampling waits until all or most of a trace's spans have arrived and then decides. Because it can see the whole trace, it can keep every trace that contains an error, keep traces whose total latency is above a threshold, sample based on span attributes, or apply different rates to high volume and low volume services.

The OpenTelemetry documentation describes tail samplers as stateful systems that must accept and store a large amount of data. In the OpenTelemetry Collector's tail sampling processor, traces are held in memory for a decision wait period (30 seconds by default) before the policy runs, and the documentation states that all spans for a given trace must be received by the same collector instance. Running several instances therefore needs a load balancing layer in front.

### What each can and cannot catch

- Head sampling is cheap but blind to outcomes: rare errors and slow requests are sampled at the same rate as everything else.
- Tail sampling can catch rare errors and slow outliers, but only for spans that actually reach the sampler. If a service never exported its spans, or a span arrives after the decision wait period, the decision is made without it.
- Combining them (a head rate to cut volume, then tail rules) works, but no tail rule can recover what the head sampler already dropped.

## What makes traces break

When a trace looks cut in half, or shows up as two unrelated traces, the cause is usually one of these.

### A service or proxy that drops the header

If any component between two instrumented services does not forward `traceparent`, the downstream service sees no incoming context. Following the rules above, it starts a fresh trace with a new trace identifier. The result is two traces where there should be one.

The specification expects pass-through components such as proxies to forward the headers unmodified, and requires tracing tools to propagate both headers. When that fails, common culprits are uninstrumented services that build new outgoing requests without copying headers, gateways that forward only an allowlist of headers, and HTTP clients that bypass the instrumented library. The OpenTelemetry context propagation page also warns that incoming context from untrusted sources can be forged, so some edge components intentionally strip or restart traces at the boundary. That is a design choice with the same symptom.

### Async hops inside a process

Inside a single process, the instrumentation has to know which span is "current" when the next operation starts. Code that hands work to a thread pool, a callback, or a scheduled task can lose that current context if the language or framework does not carry it along. The new work then becomes its own root span, with no network hop involved.

### Message queues

With a message queue, the producer moves on and the consumer may pick the message up much later. There is no HTTP request to carry a header, so context has to travel inside the message.

The OpenTelemetry messaging conventions say a producer should attach a "creation context" to each message, ideally in a way intermediaries cannot change, and that when a message passes through intermediaries, all components must propagate context down the chain. They also note that a span can only have one parent, so when a consumer receives a batch of messages from many producers, span links are the only way to connect it to all of them. A consumer that ignores the message's context, or a broker or bridge that strips message headers, splits the trace at the queue.

### Clock skew

Each span's timestamps come from the clock of the machine that recorded it. The OpenTelemetry API specification says start and end times must be recorded at the time the corresponding API is called, so they reflect whatever that host's clock reads. If two machines disagree about the time, a child span can appear to start before its parent, or a gap can appear that never happened. The tree stays correct, but the waterfall misleads. Keeping clocks synchronized with Network Time Protocol (NTP) is the fix; the post on [why the clock is the last thing anybody checks](/blog/the-clock-is-the-last-thing-anybody-checks) covers how far skew reaches beyond tracing.

## Checking propagation with curl

The idea: send a request with a `traceparent` header whose trace-id is known in advance, then search the tracing backend for that exact trace-id.

First, build a well-formed header. `openssl rand -hex` produces lowercase hex, which is what the specification requires:

```bash
TRACE_ID=$(openssl rand -hex 16)   # 32 hex characters
PARENT_ID=$(openssl rand -hex 8)   # 16 hex characters
TP="00-${TRACE_ID}-${PARENT_ID}-01"
echo "$TP"
echo -n "$TP" | wc -c              # should print 55
```

Then send it to the entry point of the system:

```bash
curl -sv -H "traceparent: $TP" https://app.example.internal/api/orders
```

The trailing `01` sets the sampled flag. With the default `ParentBased` sampler described above, a service that receives this header will treat the caller as a sampled parent and record its spans. With `00`, the same default would drop them.

Then look up `$TRACE_ID` in the tracing backend:

- **The trace exists, and the entry service's server span has `$PARENT_ID` as its parent.** The edge extracted the header correctly.
- **Every service in the request path appears under that one trace-id.** Propagation works end to end.
- **The trace stops partway.** The last service that appears is the one that did not inject the header on its outgoing call, or the next hop dropped it. Look for a separate, newer trace with a different trace-id that starts at the following service.
- **No trace with that trace-id exists at all.** Either the entry point is not instrumented, something in front of it removed the header, the service is not exporting spans, or a sampler ignored the flag.

Repeating the test against each internal service, and through each proxy in front of one (for example an [Nginx reverse proxy](/blog/nginx-reverse-proxy-setup)), finds the exact hop that loses the header.

## What traces do not tell you

- **Only what was instrumented.** Time spent in an uninstrumented library, a garbage collection pause, or a kernel wait shows up only as an unexplained gap inside a span.
- **Only what was sampled.** With head sampling at a low rate, the trace for the one request a user complained about is very likely not stored.
- **Not aggregate health.** One trace is one request. Error rates and long term trends are the job of metrics, covered in the post on [Prometheus monitoring](/blog/prometheus-server-monitoring).
- **Not why.** A span can show that a database call took two seconds. It does not say whether the cause was a missing index or lock contention.
- **Not exact timing across machines.** A span's duration comes from one clock, but comparing spans on different hosts depends on how well their clocks agree.
- **Not a security log.** Trace context arrives in ordinary request headers that any client can set, as the curl test shows. The OpenTelemetry documentation also advises against putting credentials or personal data in baggage (extra key/value pairs propagated alongside trace context), because it can be logged or sent to untrusted downstream services.

Tracing works best alongside metrics and logs. Its contribution is the shape of a single request: which services it touched, in what order, and where the time went. That shape depends on one 55 character header surviving every hop.

## Sources

- https://www.w3.org/TR/trace-context/
- https://www.w3.org/TR/trace-context-2/
- https://opentelemetry.io/docs/concepts/signals/traces/
- https://opentelemetry.io/docs/concepts/context-propagation/
- https://opentelemetry.io/docs/concepts/sampling/
- https://opentelemetry.io/docs/specs/otel/trace/api/
- https://opentelemetry.io/docs/specs/otel/trace/sdk/
- https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
- https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/tailsamplingprocessor/README.md