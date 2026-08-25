
## Why Prometheus

Prometheus is a time-series database and monitoring system designed for dynamic environments. Unlike traditional monitoring tools that push metrics to a central server, Prometheus pulls (scrapes) metrics from target endpoints. This pull model makes it easy to add and remove targets without reconfiguring the monitoring server.

The query language (PromQL) is powerful and expressive. You can aggregate, transform, and calculate derived metrics that reveal system behavior not visible in raw numbers.

The pull model also gives you something free that push systems have to build: a synthetic `up` metric. For every target in every scrape job, Prometheus records `up` as `1` if the scrape succeeded and `0` if it did not. That single series is the most valuable alert in a new deployment, because a target that stops responding is invisible in a push system until somebody notices the silence.

## Setting Up Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['server1:9100', 'server2:9100', 'server3:9100']

  - job_name: 'proxmox'
    static_configs:
      - targets: ['proxmox:9090']
```

If you omit `scrape_interval`, Prometheus defaults to `1m`. The related default is `scrape_timeout: 10s`, and the documentation is explicit that the timeout cannot be greater than the interval. That constraint bites the first time somebody sets `scrape_interval: 5s` on a slow exporter: the config either refuses to load or the scrapes start timing out, and the target flaps between up and down. `evaluation_interval`, which controls how often recording and alerting rules run, also defaults to `1m`.

One detail in the config above is a trap worth naming. Port 9090 is Prometheus's own listening port. If the exporter you are scraping runs on the same host as Prometheus, both processes will try to bind 9090 and the second one loses. Node Exporter is 9100, Alertmanager is 9093, and Pushgateway is 9091. Look up the documented port for any exporter instead of assuming.

## Node Exporter

Install the Prometheus Node Exporter on every Linux server you want to monitor. It exposes hundreds of system metrics including CPU, memory, disk I/O, network, and filesystem usage.

```bash
# Install and start
apt install prometheus-node-exporter
systemctl enable prometheus-node-exporter

# Verify it is running
curl http://localhost:9100/metrics
```

Node Exporter does not measure anything itself. It reads `/proc` and `/sys` and reformats what the kernel already publishes, which is why it is cheap to run and why its numbers match `top` and `iostat`. `node_cpu_seconds_total` is `/proc/stat`, `node_memory_*` is `/proc/meminfo`, and `node_filesystem_*` comes from a `statfs` on each mount.

That also explains its main failure mode in containers. Run Node Exporter in Docker without mounting the host paths and it reports the container's view of the world: the wrong root filesystem, and often the host's CPU count with the container's cgroup limits invisible. Either run it on the host directly, or mount `/proc`, `/sys`, and `/` read-only and pass the matching `--path.procfs`, `--path.sysfs`, and `--path.rootfs` flags.

## Useful PromQL Queries

```
# CPU usage percentage
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100

# Disk I/O utilization
rate(node_disk_io_time_seconds_total[5m]) * 100

# Network traffic
rate(node_network_receive_bytes_total[5m])
```

Every one of those uses `rate()`, and `rate()` is where beginners lose the most time. It only works on counters, it needs at least two samples inside the range to return anything at all, and the recommendation is to choose a range of at least four times the scrape interval. With `scrape_interval: 15s`, a `[5m]` range gives you twenty samples of headroom, which is why `[5m]` is the conventional choice. Write `rate(x[15s])` on a 15 second scrape and you get an empty result with no error, because a single sample is not a rate. An empty result in a graph looks identical to "nothing is wrong."

Use `rate()` for anything that feeds an alert. `irate()` uses only the last two samples in the range, so it reacts instantly and is great for a dashboard of a spiky metric, and terrible for alerting because one unlucky pair of samples can trip a threshold.

The memory query above deliberately uses `MemAvailable` rather than `MemFree`. Linux uses spare RAM for page cache, so `MemFree` on a healthy busy server is close to zero and an alert built on it fires constantly. `MemAvailable` is the kernel's own estimate of how much memory a new workload could actually claim, and it is the number you want.

## Alerting with Alertmanager

```yaml
# alert_rules.yml
groups:
  - name: servers
    rules:
      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
```

Write that `expr` as `cpu_usage > 90` and the rule is syntactically valid, loads without complaint, and never fires, because no exporter publishes a metric called `cpu_usage`. PromQL returns an empty vector for an unknown metric name rather than an error. This is the single most common way a homelab ends up with an alerting config that has never once alerted. Before you commit a rule, paste the `expr` into the Prometheus expression browser and confirm it returns rows right now.

`for: 5m` means the alert goes to the `pending` state on the first evaluation where the expression is true and only becomes `firing` if it is still true five minutes later. This suppresses the momentary spikes that make people mute a channel. The cost is that your detection time is `for` plus up to one `evaluation_interval`.

Alertmanager then handles grouping, silencing, and delivery. Its defaults are worth knowing because they are what you will be debugging: `group_wait` is `30s` (how long to hold the first notification for a group, hoping siblings arrive), `group_interval` is `5m` (how long before sending an update about a group that already notified), and `repeat_interval` is `4h` (how long before re-nagging about an alert that is still firing). If your first alert took thirty seconds longer to arrive than you expected, `group_wait` is why.

Pair Alertmanager with routing rules to send alerts to email, Slack, or PagerDuty based on severity and team ownership.

## Sizing the Disk

Prometheus writes samples into two-hour blocks, then compacts them in the background into larger blocks covering up to 10 percent of the retention time or 31 days, whichever is smaller. If you set neither `--storage.tsdb.retention.time` nor `--storage.tsdb.retention.size`, retention defaults to `15d`.

The capacity formula from the storage documentation is:

```
needed_disk_space = retention_time_seconds * ingested_samples_per_second * bytes_per_sample
```

Prometheus averages 1 to 2 bytes per sample after compression. A Node Exporter target publishes roughly a thousand series, so ten servers at a 15 second interval is about 670 samples per second, which is roughly 1.7 GB at 15 days retention using 2 bytes per sample. That is small. What is not small is cardinality: every unique combination of label values is a separate time series, held in memory in the index. Put a request ID, a client IP, or a full URL path into a label and you can go from a thousand series to a million without changing the sample rate at all. Cardinality, not sample volume, is what kills Prometheus servers.

## What Prometheus Is Not For

Prometheus samples. It does not record every event, and it explicitly does not guarantee it captured every one. That makes it wrong for billing, for audit trails, and for anything where a missing data point is a correctness bug rather than a gap in a graph. Use logs or an event pipeline for those.

It has no clustering. A single Prometheus server is a single point of failure, and the standard answer is not a cluster but two identical servers scraping the same targets independently. Alertmanager does gossip into a cluster and deduplicate, so two Prometheus servers pointed at one Alertmanager cluster will not double-page you.

Local storage is also not durable long-term storage. If you need years of history or a global view across sites, you send data out via remote write to Thanos, Mimir, or a hosted backend. And Prometheus does not do distributed tracing: it will tell you the 99th percentile latency got worse, not which span caused it.

Finally, a stale target simply stops producing samples. Prometheus looks back a default of five minutes for the most recent sample when you query an instant, so a dead exporter leaves its last value visible on dashboards for five minutes before series vanish. Alert on `up == 0`, not on the absence of a graph.

## References

- https://prometheus.io/docs/prometheus/latest/configuration/configuration/
- https://prometheus.io/docs/prometheus/latest/querying/functions/
- https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
- https://prometheus.io/docs/alerting/latest/configuration/
- https://prometheus.io/docs/prometheus/latest/storage/
- https://man7.org/linux/man-pages/man5/proc.5.html
