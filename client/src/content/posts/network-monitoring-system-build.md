
## Why Build Your Own

Commercial network monitoring tools are expensive and often overkill for a lab or small environment. Building your own gives you deep understanding of how monitoring works and exactly the visibility you need without paying for features you never use.

The honest counterpoint: you are also signing up to maintain it. A turnkey system like LibreNMS or Zabbix will auto-discover a switch, pick sane graphs, and be useful in an afternoon. A [Prometheus](/blog/prometheus-server-monitoring) stack will not do any of that for you. Build your own when the learning is part of the point, or when you have a specific question the packaged tools answer badly. Do not build your own because it looked cheaper.

## The Stack

My monitoring stack uses four main components:

**SNMP polling with Prometheus SNMP Exporter:** Collects interface statistics, CPU and memory utilization, and other metrics from network devices via SNMP. Prometheus scrapes these metrics on a schedule and stores them. SNMP itself lives on UDP 161 for polling and UDP 162 for traps, and the exporter sits between Prometheus and the device, translating an HTTP scrape into an SNMP walk.

**Grafana for visualization:** Grafana connects to Prometheus and renders dashboards. You can build exactly the views you need: interface utilization graphs, device health panels, and alert history.

**Alertmanager for notifications:** When metrics cross thresholds, Alertmanager routes alerts to email or other destinations. A down interface or a device with 95 percent CPU should wake you up.

**[Syslog](/blog/syslog-centralized-logging) collection with Loki:** Devices send syslog messages to a central collector. Loki stores them, and Grafana lets you search and correlate logs with metrics.

## Setting Up SNMP

First, enable SNMP on your devices with a strong community string or, better, SNMPv3 with authentication and encryption. Then configure the SNMP Exporter with the appropriate module for your device type.

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'snmp'
    static_configs:
      - targets:
        - 192.168.1.1  # FortiGate
        - 192.168.1.10  # Cisco switch
    metrics_path: /snmp
    params:
      module: [if_mib]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - target_label: __address__
        replacement: localhost:9116
```

Those `relabel_configs` are the part people copy without reading, and they are the whole trick. Prometheus normally scrapes the target address directly. Here the first rule copies the device IP into the `target` URL parameter, and the second rewrites the address Prometheus actually connects to so it points at the exporter on port 9116. Delete either rule and Prometheus will try to fetch `http://192.168.1.10/snmp` from the switch itself, get nothing, and mark the target down. Most "my SNMP exporter returns no data" problems are this.

On the security side, be clear-eyed about SNMPv2c: the community string is sent in cleartext in every request. Anyone who can see the traffic can read your entire device MIB tree, which includes interface descriptions, ARP tables, and often the running configuration path. The default community on far too much gear is still `public`. SNMPv3 fixes this properly with the User-based Security Model in RFC 3414, but only in `authPriv` mode. Configuring SNMPv3 with `noAuthNoPriv` gets you the complexity of v3 with the security of v1.

## The Counter32 Trap

This is the single most common way a homegrown SNMP dashboard produces confident, wrong numbers.

RFC 2863 defines `ifInOctets` and `ifOutOctets` in the interface table as Counter32. A 32-bit counter holds 4,294,967,296 values. A 1 Gbps interface running at line rate moves 125,000,000 bytes per second, so that counter wraps in about 34 seconds. At 10 Gbps it wraps in roughly 3.4 seconds.

Prometheus `rate()` detects a counter reset by noticing the value went down, and compensates by adding the pre-reset value back. That works for one wrap. With a 60 second scrape interval on a busy gigabit link you get two wraps between samples, and there is no way to recover the missing laps from two data points. Your graph will show a plausible number that is silently too low.

The fix is in the same RFC. The `ifXTable` provides `ifHCInOctets` and `ifHCOutOctets` as Counter64, which will not wrap in any human timeframe. Counter64 does not exist in SNMPv1, so you must poll with v2c or v3 to get them, and the `if_mib` module in snmp_exporter already walks the high-capacity table. Verify with `snmpwalk` that your device actually populates it, because some low-end gear exposes the OIDs and leaves them at zero.

The same RFC is also why your graphs sometimes swap ports after a reboot. `ifIndex` is not guaranteed stable across a reload or a module insertion on many platforms, so the series you labelled "uplink" can quietly become a different physical port. Label your metrics by `ifName` or `ifAlias` rather than index, and set a real description on every port so `ifAlias` is worth reading.

## Scrape Timeouts and Holes in Graphs

Prometheus defaults to `scrape_interval: 1m` and `scrape_timeout: 10s`, and the timeout can never exceed the interval. A full `if_mib` walk against a 48-port switch is a lot of SNMP round trips, and on a device with a slow management CPU it can take longer than ten seconds. The symptoms are a `context deadline exceeded` line in the exporter log, `up` flipping to 0, and gaps in every panel.

Three fixes, in the order I try them. Raise `scrape_timeout` toward the interval. Reduce what you walk: the snmp_exporter generator lets you build a module with only the tables you actually graph, and a smaller walk is a faster walk. Finally, tune `max_repetitions`, which controls how many rows a single GetBulk request asks for. GetBulk is defined in RFC 3416 and exists precisely so you do not need one round trip per row, but a high value can overflow a small device's UDP buffer and a low value costs round trips.

Remember that SNMP runs over UDP. A dropped response and a slow device look identical to the poller. Aggressive polling of cheap switches is a real way to spike the management plane and cause the very timeouts you are debugging, so start at 60 seconds and only go faster where you can prove you need it.

## Alert Rules That Do Not Wake You For Nothing

An alert that fires on a single bad scrape will flap. Put a `for:` duration on every rule so the condition has to persist. Then understand the Alertmanager timers, because they decide what your phone actually does: `group_wait` defaults to 30s, so the first notification for a new group is held briefly to collect related alerts, `group_interval` defaults to 5m for subsequent notifications about that group, and `repeat_interval` defaults to 4h before an unresolved alert nags you again.

The beginner mistake is alerting on every interface going down. On an access port, "down" means a user unplugged a laptop. Alert on uplinks and infrastructure links by name, alert on error and discard counters that are increasing, and alert on the monitoring system itself. If the exporter dies, every device looks healthy, which is the worst possible failure mode for a monitoring stack.

## What to Monitor

Focus first on the things that cause outages or degraded service: interface utilization and error rates, device CPU and memory, [BGP](/blog/bgp-for-network-engineers) session state if applicable, and power supply status. Add more metrics over time as you understand your environment better.

The goal is not to collect everything. It is to make sure you find out about real problems before your users do.

## Sizing the TSDB

Capacity planning here is easy arithmetic and worth doing once. The Prometheus documentation gives the formula directly: `needed_disk_space = retention_time_seconds * ingested_samples_per_second * bytes_per_sample`, and states that Prometheus averages only 1 to 2 bytes per sample after compression.

Work an example. A 48-port switch under the `if_mib` module produces roughly 15 series per interface once you count octets, packets, errors, discards, speed, and status, so call it 700 series per switch. Ten devices is 7,000 series. At a 60 second scrape that is about 117 samples per second. Over the default 15 day retention, 1,296,000 seconds times 117 times 2 bytes is around 300 MB. A lab monitoring stack is not a storage problem. It becomes one when someone enables a module that walks every routing table entry.

## Syslog Is Two Formats Pretending To Be One

Loki will happily ingest whatever your devices send, which hides the fact that "syslog" means two different things. RFC 5424 is the modern format with RFC 3339 timestamps that include a timezone, structured data fields, and a defined message length that receivers must support to at least 480 octets and should support to 2048. The older BSD format described in RFC 3164 has no year and no timezone in its timestamp and caps the whole packet at 1024 bytes.

Two symptoms follow. Logs from a device still emitting the old format land with the collector's guess at the year, which is why people find January log entries dated to last year. And long messages, exactly the verbose ones a firewall emits during an incident, get truncated mid-field. Set devices to RFC 5424 where the platform supports it.

The other thing to get right in Loki is label cardinality. Loki indexes labels, not log content. A label whose value is a source IP or a request ID creates a separate stream per value, and streams are the unit of cost. Keep labels to host, job, facility, and severity, then filter on everything else with LogQL at query time.

## What This Stack Cannot Tell You

Polling every 60 seconds averages away microbursts. A queue that overflowed for 200 milliseconds and dropped frames will not move a one minute utilization average at all. It will move `ifOutDiscards`, which is a counter and therefore remembers. Watch discards and errors, not just utilization, and treat a nonzero discard rate on a link that looks 30 percent utilized as the interesting signal it is.

SNMP also tells you that a link is full without telling you who filled it. For that you need flow export: NetFlow, sFlow, or IPFIX as standardized in RFC 7011. Those are a different pipeline with a different storage profile, and they answer a question polling structurally cannot.

Finally, polling samples state at intervals, so it misses transient events entirely. A link that flaps down and back up between two scrapes leaves no trace in your metrics. The device knows it happened, and it will say so in a trap or a syslog line. That is the real reason the log pipeline sits next to the metrics pipeline rather than replacing it.

## References

- https://www.rfc-editor.org/rfc/rfc2863
- https://www.rfc-editor.org/rfc/rfc3414
- https://www.rfc-editor.org/rfc/rfc5424
- https://prometheus.io/docs/prometheus/latest/storage/
- https://prometheus.io/docs/alerting/latest/configuration/
- https://grafana.com/docs/loki/latest/get-started/labels/
