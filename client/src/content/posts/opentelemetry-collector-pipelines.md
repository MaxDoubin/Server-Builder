## A program in the middle of the telemetry path

Instrumented software produces traces, metrics, and logs, and something has to carry them to a backend. The simplest option is for each application to send directly. The OpenTelemetry Collector is the other option: a separate program that sits in the middle, accepts telemetry, works on it, and forwards it.

The OpenTelemetry documentation describes the Collector as a vendor-agnostic way to receive, process, and export telemetry data. In practice that means one process can accept data in several formats (OpenTelemetry's own protocol, Jaeger, [Prometheus](/blog/prometheus-server-monitoring), and others), clean or reshape it, and send it to one or more open source or commercial backends. The documentation adds that this removes the need to run and maintain several separate agents or collectors.

This article covers the Collector's building blocks, pipelines, deployment patterns, processor ordering, default ports, and distributions, and ends with a small configuration checked against Collector version 0.165.0.

Traces and context propagation are covered in [Distributed tracing explained](/blog/distributed-tracing-explained), and in-process instrumentation in [What an APM agent actually measures](/blog/what-an-apm-agent-actually-measures) (APM: application performance monitoring). This article starts after the telemetry has left the process.

## When a Collector is worth running

The Collector is optional. The project's own introduction says that for trying OpenTelemetry out, or in development and small environments, sending data directly to a backend is a reasonable way to get value quickly. In general, though, the documentation recommends running a Collector alongside services, because the service can hand off its data quickly while the Collector takes care of retries, batching, encryption, or filtering out sensitive fields.

The OpenTelemetry Protocol (OTLP) exporters in the language software development kits (SDKs) assume a local Collector endpoint by default, so a Collector on the same host can start receiving without application changes.

## The five kinds of component

A Collector configuration file, written in YAML (YAML Ain't Markup Language), is built from components. The documentation groups them into four classes that touch telemetry inside pipelines, plus extensions that do not.

### Receivers

Receivers get data into the Collector. They can be push based (an application sends to a listening port) or pull based (the Collector scrapes or reads a source). The most common is the `otlp` receiver, which accepts OTLP over gRPC (an open source remote procedure call framework) and over HTTP (Hypertext Transfer Protocol). Other receivers read log files, scrape Prometheus endpoints, collect host metrics, or accept Jaeger and Zipkin formats. Every Collector configuration needs at least one receiver.

### Processors

Processors sit between receivers and exporters and change the data on its way through: filtering, dropping, renaming, sampling, adding attributes, or grouping data into batches. They are optional. The order in which processors are listed in a pipeline is the order in which they run, which turns out to matter a great deal (see the section on ordering below).

### Exporters

Exporters send data out of the Collector to a backend, a file, another Collector, or the console. As with receivers, there must be at least one. Most exporters need at least a destination and security settings such as Transport Layer Security (TLS) certificates or authentication.

### Connectors

A connector joins two pipelines. It acts as an exporter at the end of one pipeline and as a receiver at the start of another. The documentation's example is counting span events: a processor can filter spans inside a traces pipeline, but it cannot turn them into metrics for a metrics pipeline. A connector such as `count` can consume traces in one pipeline and emit metrics into another. Connectors can also replicate or route data. None are configured by default.

### Extensions

Extensions add capabilities that do not handle telemetry directly, such as health monitoring, service discovery, or authentication. The `health_check` extension, for example, publishes an HTTP status endpoint.

## Configuring a component does not turn it on

A central rule of Collector configuration is that defining a component and enabling it are separate steps. The top-level `receivers`, `processors`, `exporters`, `connectors`, and `extensions` sections only describe components and their settings. Nothing runs until the component is referenced in the `service` section.

The documentation repeats this for every component class: if it is configured but not referenced under `service`, it is not enabled.

### The service section

The `service` section has three subsections:

- `extensions`: a list of the extensions to start.
- `pipelines`: the data paths, described next.
- `telemetry`: settings for the Collector's own logs and metrics about itself.

### One pipeline per signal

Each entry under `pipelines` has a signal type as its key: `traces`, `metrics`, or `logs`. Each pipeline lists its `receivers`, its `processors` (in order), and its `exporters`. A pipeline only carries one signal type, so a Collector that handles all three signals normally declares three pipelines.

Components are referenced by an identifier in the form `type[/name]`. The `otlp` receiver could appear twice in one file as `otlp` and `otlp/2`, each with its own settings, as long as the identifiers are unique. Pipelines use the same syntax, so a configuration can hold `traces` and `traces/2` side by side.

The same receiver, processor, or exporter may appear in more than one pipeline. The documentation notes one subtlety: when a processor is referenced in several pipelines, each pipeline gets its own separate instance of that processor. A receiver shared by several pipelines, on the other hand, fans the same data out to all of them.

## OTLP over gRPC and HTTP

OTLP is OpenTelemetry's own wire protocol for all signals. The OTLP specification says the default network port for OTLP/gRPC is 4317 and the default network port for OTLP/HTTP is 4318.

The Collector's `otlp` receiver supports both transports. Each is enabled by listing it under `protocols`, and a transport left out of the list is disabled. In version 0.165.0 the receiver's documentation gives the defaults as `localhost:4317` for gRPC and `localhost:4318` for HTTP. Over HTTP, data is posted to a path per signal, which defaults to `/v1/traces`, `/v1/metrics`, and `/v1/logs`, and the receiver also accepts OTLP's JSON (JavaScript Object Notation) encoding.

The `localhost` default is deliberate. The configuration documentation notes that its own example configurations use the unspecified address `0.0.0.0` only as a convenience, that the Collector itself defaults to `localhost`, and that binding to `localhost` is generally preferable when all clients are local. It links to the project's guidance on safeguards against denial of service attacks for the reasoning. When senders run on other hosts or in other containers, a `localhost` bind cannot reach them, so a wider address is needed, and controlling who can reach the port becomes the operator's job.

## Agent and gateway deployment patterns

The Collector is a single binary; deployments differ in where it runs and what sends to it.

### Agent pattern

In the agent pattern, a Collector runs alongside the application or on the same host, for example as a sidecar container or as a Kubernetes DaemonSet (one copy per node). Applications instrumented with an SDK send OTLP to that nearby Collector, and the Collector forwards to one or more backends. The documentation lists its advantages as being straightforward to start with and giving a clear one-to-one mapping between an application and its Collector. The disadvantages it lists are limited scalability for teams and infrastructure, and inflexibility for complex or changing deployments.

An agent on the host is also a natural place to run host-level receivers, such as the file log and host metrics receivers.

### Gateway pattern

In the gateway pattern, applications or other Collectors send to a single OTLP endpoint provided by one or more Collector instances running as a standalone service. The documentation says such an endpoint is typically provided per cluster, per data center, or per region. A standard load balancer can spread traffic across the gateway instances.

Some processing needs related data to arrive at the same instance. Tail sampling is the standard example: a decision about a whole trace can only be made where all of its spans are collected (the tail sampling trade-offs are discussed in [Distributed tracing explained](/blog/distributed-tracing-explained)). For that case the documentation describes a two-tier setup. The first tier runs the load-balancing exporter, which can route by trace identifier, and the second tier runs the processors that need complete traces.

### Combining them

The patterns are not exclusive. The agent documentation lists other Collectors (using the OTLP exporter) as a source of data, and the gateway documentation lists applications or other Collectors, so an agent tier can forward to a gateway tier. Each added tier is one more network hop and one more service to operate.

## The memory limiter and batch processors

The processor overview in the core Collector repository lists two processors, `memory_limiter` and `batch`, and gives both a fixed place in its recommended order. Their position in the pipeline is part of how they work.

### What memory_limiter does

The memory limiter exists to prevent the Collector from running out of memory. It checks memory usage periodically and works with two thresholds:

- The hard limit is set by `limit_mib` (or `limit_percentage` of available memory in a container).
- The soft limit equals the hard limit minus `spike_limit_mib`. The documentation suggests about 20 percent of the hard limit as a starting value for the spike allowance.

When usage passes the soft limit, the processor starts refusing data by returning an error to the component before it in the pipeline. That error is marked as temporary, and receivers are expected to retry and may push back on their own senders. When usage passes the hard limit, it also forces garbage collection (GC). Normal operation resumes once usage falls below the soft limit.

The documentation is candid about the limits of this approach. Incoming data can use memory before the limiter gets a chance to reject it, especially with receivers other than OTLP. Data is lost if the component in front of the limiter does not retry after a refusal. The processor is described as a safeguard, not a substitute for sizing the Collector properly. The documentation also recommends setting the Go runtime's `GOMEMLIMIT` environment variable to 80 percent of the Collector's hard memory limit in addition to configuring the processor.

### What batch does

The batch processor groups spans, metric data points, or log records into batches before they move on. According to its documentation, batching compresses better and reduces the number of outgoing connections. A batch is sent when it reaches `send_batch_size` items (default 8192) or when `timeout` expires (default 200 milliseconds), whichever comes first. `send_batch_max_size` puts an upper bound on batch size and splits larger batches.

### Why the order matters

The core processor documentation gives a recommended order and the reason for each position:

| Position | Processor | Reason given in the documentation |
|---|---|---|
| 1 | `memory_limiter` | Must be first so it can shed load before later processors build up data that cannot be flushed |
| 2 | Sampling or filtering processors | Drop unwanted data early so it is not processed further |
| 3 | Processors that read request context (for example `k8sattributes`) | Must run before batching, because batching clears the request context |
| 4 | Transform or enrichment processors | Only enrich data that will actually be exported |
| 5 | `batch` | Batch after filtering and transformation, so discarded or still-changing data is not batched |

Putting `memory_limiter` first is what makes its backpressure useful. The memory limiter documentation says the first position ensures backpressure can be sent to the receivers and reduces the chance of dropped data. By the same logic, a limiter placed after `batch` would only act once the batch processor had already accepted and buffered the data.

Putting `batch` late is about not wasting work. Batching spans that a sampler then throws away spends memory and processing time on data that never leaves. The context rule is less obvious: a batch combines data from many incoming requests, so per-request information is no longer attached afterward.

### The batching story is changing

Batching is also available inside exporters, through the exporter helper's `sending_queue` setting with a `batch` block. In version 0.165.0 it is off by default and enabled with `batch: {}`. The core processor documentation now says to prefer an exporter's own batching where available, and the agent pattern examples on opentelemetry.io use it.

The core repository's changelog shows the direction. Version 0.158.0 added a queue and batch processor (named `queuebatch` at the time, renamed `queue_batch` in 0.162.0) described as a replacement for the legacy batch processor, built on the same queue and batch logic as exporters. Version 0.165.0 promoted it to beta for traces, metrics, and logs, and added a startup warning when a pipeline combines the batch processor with exporter batching. The batch processor is still present and still listed at beta stability in 0.165.0, so existing configurations keep working, but new configurations should pick one batching mechanism per pipeline, not both.

## Distributions: core, contrib, and others

A distribution is a particular set of components compiled into one binary. The project's releases repository currently lists six distributions: `otelcol` (core), `otelcol-contrib`, `otelcol-k8s`, `otelcol-otlp`, `otelcol-prometheus`, and `otelcol-ebpf-profiler`. (The last one relates to extended Berkeley Packet Filter profiling, introduced in [eBPF observability basics](/blog/ebpf-observability-basics).)

### Core

The core distribution contains the components from the main Collector repository plus a small selection of contrib components tied to open source projects, such as the file log, host metrics, Prometheus, Jaeger, Kafka, and Zipkin receivers, the health check and pprof extensions, and processors such as `filter`, `transform`, and `attributes`. Its README describes it as a "classic" distribution that no longer accepts new components from outside the core repository.

### Contrib

The contrib distribution includes all the components from both the core and contrib repositories, including vendor-supported ones. Its README recommends it as a good starting point for trying configurations, and recommends limiting a production Collector to only the components an environment needs, both to shrink the binary and to reduce the attack surface. The tool for building such a reduced binary is the OpenTelemetry Collector Builder (`ocb`).

The practical consequence for configuration: a component name only works if the running distribution includes it. A configuration copied from contrib documentation can fail on a core binary because the component simply is not compiled in.

## A small, valid configuration

The configuration below targets Collector version 0.165.0 and uses only components included in the core `otelcol` distribution of that version. Each key and default was checked by reading that version's component READMEs, the memory limiter's configuration source file, the changelog, and the core distribution's manifest. The file was not run through the `otelcol` binary, so the `validate` command shown after it is the way to confirm it on a real install. The endpoint `gateway.example.com` is a placeholder, and the memory figures are illustrative rather than recommendations.

```yaml
extensions:
  health_check:
    endpoint: localhost:13133

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: localhost:4317
      http:
        endpoint: localhost:4318

processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 400
    spike_limit_mib: 80
  batch:
    send_batch_size: 8192
    timeout: 200ms

exporters:
  debug:
    verbosity: basic
  otlp_grpc:
    endpoint: gateway.example.com:4317

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp_grpc, debug]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [otlp_grpc, debug]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [debug]
```

Notes on the example:

- **Exporter names changed in 0.144.0.** The gRPC OTLP exporter is now `otlp_grpc` and the HTTP one is `otlp_http`. The old names `otlp` and `otlphttp` still load as deprecated aliases in 0.165.0, and the `otlp_http` README says the alias will be removed in a future version. Older tutorials use the old names. The receiver is still called `otlp`.
- **TLS is on by default for the OTLP exporter.** The exporter documentation says it requires TLS by default. Sending to a plaintext endpoint needs `tls: insecure: true`, which is only appropriate on a trusted network.
- **`check_interval` is not optional in practice.** Its documented default is `0s`, but the memory limiter's validation code (`config.go`) rejects any value that is not greater than zero, and the README recommends 1 second. One of `limit_mib` or `limit_percentage` must also be set.
- **The logs pipeline exports only to `debug`.** Each pipeline chooses its own exporters, which is the main reason to keep pipelines separate per signal.

The documentation describes a `validate` command for checking a file before starting the Collector:

```bash
otelcol validate --config=config.yaml
```

## Limits and common mistakes

- **Defined but not wired in.** A component configured at the top level but missing from `service` silently does nothing.
- **Processor order reversed.** `batch` before `memory_limiter`, or a sampler after `batch`, works but defeats the purpose of both.
- **Two batching layers.** Combining the batch processor with exporter batching batches the same data twice. Version 0.165.0 warns about it at startup.
- **Relying on the limiter alone.** The memory limiter refuses data; it does not size the Collector. Refused data is lost if the sender does not retry.

## Sources

- https://opentelemetry.io/docs/collector/
- https://opentelemetry.io/docs/collector/configuration/
- https://opentelemetry.io/docs/collector/deploy/agent/
- https://opentelemetry.io/docs/collector/deploy/gateway/
- https://opentelemetry.io/docs/collector/distributions/
- https://opentelemetry.io/docs/specs/otlp/
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/processor/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/processor/batchprocessor/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/processor/memorylimiterprocessor/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/processor/queuebatchprocessor/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/receiver/otlpreceiver/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/exporter/otlpexporter/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/exporter/otlphttpexporter/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/exporter/debugexporter/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/exporter/exporterhelper/README.md
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/internal/memorylimiter/config.go
- https://github.com/open-telemetry/opentelemetry-collector/blob/v0.165.0/CHANGELOG.md
- https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.165.0/extension/healthcheckextension/README.md
- https://github.com/open-telemetry/opentelemetry-collector-releases/blob/main/README.md
- https://github.com/open-telemetry/opentelemetry-collector-releases/blob/v0.165.0/distributions/otelcol/manifest.yaml
- https://github.com/open-telemetry/opentelemetry-collector-releases/blob/v0.165.0/distributions/otelcol/README.md
- https://github.com/open-telemetry/opentelemetry-collector-releases/blob/v0.165.0/distributions/otelcol-contrib/README.md
