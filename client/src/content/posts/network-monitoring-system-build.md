
## Why Build Your Own

Commercial network monitoring tools are expensive and often overkill for a lab, and building your own teaches you how monitoring actually works.

The honest counterpoint: you are also signing up to maintain it. A turnkey system like LibreNMS or Zabbix will auto-discover a switch, pick sane graphs, and be useful in an afternoon. A [Prometheus](/blog/prometheus-server-monitoring) stack will not do any of that for you. Build your own when the learning is part of the point, or when you have a specific question the packaged tools answer badly. Do not build your own because it looked cheaper.

## The Stack

My monitoring stack uses four main components:

**SNMP polling with Prometheus SNMP Exporter:** Collects interface statistics, CPU and memory utilization, and other metrics from network devices via SNMP. SNMP itself lives on UDP 161 for polling and UDP 162 for traps, and the exporter sits between Prometheus and the device, translating an HTTP scrape into an SNMP walk.

**Grafana for visualization:** Grafana connects to Prometheus and renders dashboards. Lay each one out so the top row answers "is anything on fire right now" and everything below it is for diagnosis. If you have to scroll to find out whether the network is healthy, the dashboard is wrong.

**Alertmanager for notifications:** When metrics cross thresholds, Alertmanager routes alerts to email or other destinations. A down uplink or a device pinned at 95 percent CPU should wake you up.

**[Syslog](/blog/syslog-centralized-logging) collection with Loki:** Devices send syslog messages to a central collector. Loki stores them, and Grafana lets you search and correlate logs with metrics.

You will type the default ports constantly: Prometheus 9090, Alertmanager 9093, SNMP exporter 9116, Grafana 3000, and Loki 3100.

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
      auth: [lab_v3]  # a credentials block in snmp.yml
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: localhost:9116
```

Those `relabel_configs` are the part people copy without reading, and they are the whole trick. Prometheus normally scrapes the target address directly. Here the first rule copies the device IP into the `target` URL parameter, the second copies it into the `instance` label, and the third points the connection at the exporter on port 9116. Delete the third and Prometheus fetches `http://192.168.1.10/snmp` from the switch itself and marks the target down; delete the first and the exporter refuses a scrape with no target. Most "my SNMP exporter returns no data" problems are one of those two. Delete the middle one and the scrapes still succeed, but every series is labeled `instance="localhost:9116"` and you cannot tell which device a graph is showing.

On the security side, be clear-eyed about SNMPv2c: the community string is sent in cleartext in every request. Anyone who can see the traffic can read your entire device MIB tree, including interface descriptions and ARP tables. The default community on far too much gear is still `public`, which is also what snmp_exporter falls back to (as `public_v2`) when the `auth` parameter is missing. SNMPv3 fixes this properly with the User-based Security Model in RFC 3414, but only in `authPriv` mode. Configuring SNMPv3 with `noAuthNoPriv` gets you the complexity of v3 with the security of v1.

When a target shows down, test from the bottom up. Ask the device first:

```bash
snmpget -v3 -l authPriv -u prometheus -a SHA -A "$AUTH" -x AES -X "$PRIV" \
  192.168.1.10 SNMPv2-MIB::sysName.0
```

The correct answer is one line naming it, such as `SNMPv2-MIB::sysName.0 = STRING: core-sw-01`. Then ask the exporter exactly what Prometheus asks it, `curl -s 'http://localhost:9116/snmp?target=192.168.1.10&module=if_mib&auth=lab_v3'`, and look for `ifHCInOctets` lines. Finally, `promtool check config /etc/prometheus/prometheus.yml` should print a `SUCCESS` line. If the device answers and the exporter returns metrics, the fault is in the scrape job, almost always the relabeling, and you have just saved yourself an hour.

## The Counter32 Trap

This is the single most common way a homegrown SNMP dashboard produces confident, wrong numbers.

RFC 2863 defines `ifInOctets` and `ifOutOctets` in the interface table as Counter32. A 32-bit counter holds 4,294,967,296 values. A 1 Gbps interface running at line rate moves 125,000,000 bytes per second, so that counter wraps in about 34 seconds. At 10 Gbps it wraps in roughly 3.4 seconds.

Prometheus `rate()` detects a counter reset by noticing the value went down, then assumes the counter restarted from zero. It has no idea that a Counter32 wraps back to zero after 4,294,967,295, so every wrap silently loses the stretch between the last sample and the top of the counter. With a 60 second scrape interval on a busy gigabit link you can also get two wraps between samples, and there is no way to recover the missing laps from two data points. Your graph will show a plausible number that is silently too low.

The fix is in the same RFC. The `ifXTable` provides `ifHCInOctets` and `ifHCOutOctets` as Counter64, which will not wrap in any human timeframe. Counter64 does not exist in SNMPv1, so you must poll with v2c or v3 to get them, and the `if_mib` module in snmp_exporter already walks the high-capacity table. Run `snmpwalk` with the same flags against `IF-MIB::ifHCInOctets` to verify that your device actually populates it, because some low-end gear exposes the OIDs and leaves them at zero.

The same RFC is also why your graphs sometimes swap ports after a reboot. `ifIndex` is not guaranteed stable across a reload or a module insertion on many platforms, so the series you labeled "uplink" can quietly become a different physical port. Label your metrics by `ifName` or `ifAlias` rather than index, and set a real description on every port so `ifAlias` is worth reading.

## Scrape Timeouts and Holes in Graphs

Prometheus defaults to `scrape_interval: 1m` and `scrape_timeout: 10s`, and the timeout can never exceed the interval. A full `if_mib` walk against a 48-port switch is a lot of SNMP round trips, and on a device with a slow management CPU it can take longer than ten seconds. The symptoms are a `context deadline exceeded` line in the exporter log, `up` flipping to 0, and gaps in every panel.

Three fixes, in the order I try them. Raise `scrape_timeout` toward the interval. Reduce what you walk: the snmp_exporter generator lets you build a module with only the tables you actually graph, and a smaller walk is a faster walk. Finally, tune `max_repetitions`, which controls how many rows a single GetBulk request asks for. GetBulk is defined in RFC 3416 and exists precisely so you do not need one round trip per row, but a high value can overflow a small device's UDP buffer and a low value costs round trips.

SNMP runs over UDP, so a dropped response and a slow device look identical to the poller. Aggressive polling of cheap switches is a real way to spike the management plane and cause the very timeouts you are debugging, so start at 60 seconds and only go faster where you can prove you need it.

Not every hole is a failed scrape. `rate()` needs at least two samples inside its range, so at a 60 second interval `rate(ifHCInOctets[1m])` comes back empty or patchy. Give it a range of at least four scrape intervals, such as `[5m]` at 60 seconds.

## Alert Rules That Do Not Wake You For Nothing

An alert that fires on a single bad scrape will flap. Put a `for:` duration on every rule so the condition has to persist. Then understand the Alertmanager timers, because they decide what your phone actually does: `group_wait` defaults to 30s, so the first notification for a new group is held briefly to collect related alerts, `group_interval` defaults to 5m for subsequent notifications about that group, and `repeat_interval` defaults to 4h before an unresolved alert nags you again.

The beginner mistake is alerting on every interface going down. On an access port, "down" means a user unplugged a laptop. Alert on uplinks and infrastructure links by name, alert on error and discard counters that are increasing, and alert on the monitoring system itself. If the exporter dies, every device looks healthy, which is the worst possible failure mode for a monitoring stack.

A rules file that does all three:

```yaml
# /etc/prometheus/rules/snmp.yml
groups:
  - name: snmp
    rules:
      - alert: UplinkDiscards
        expr: rate(ifOutDiscards{ifAlias=~"uplink.*"}[5m]) > 0
        for: 15m
        labels:
          severity: warning
      - alert: SnmpTargetDown
        expr: up{job="snmp"} == 0
        for: 5m
        labels:
          severity: critical
      - alert: FirewallNotScraped
        expr: absent(up{job="snmp", instance="192.168.1.1"})
        for: 5m
        labels:
          severity: critical
```

`up == 0` catches a failing target but not a vanished one: a target dropped from the config or lost to a relabeling mistake has no `up` series left to be zero, and `absent()` is what fires when a named series stops existing. List the file under `rule_files` in `prometheus.yml`, check it with `promtool check rules /etc/prometheus/rules/snmp.yml`, which should report `SUCCESS: 3 rules found`, and reload with `systemctl reload prometheus` or a POST to `/-/reload` if Prometheus runs with `--web.enable-lifecycle`.

One failure often arrives as twenty alerts: when a core switch dies, every device behind it stops answering. Give the switch and everything behind it a shared label in `static_configs`, add an Alertmanager `inhibit_rules` entry whose source matches the switch's own down alert and whose `equal` lists that label, and the dead switch pages you once instead of once per device.

Finally, mind where the monitoring host lives. If Prometheus shares a hypervisor with your storage and the storage dies, you lose the service and the evidence together. Give the stack as few shared dependencies as possible, and keep alert delivery off the segment most likely to fail.

## What to Monitor

Focus first on the things that cause outages or degraded service: interface utilization and error rates, device CPU and memory, [BGP](/blog/bgp-for-network-engineers) session state if applicable, and power supply status. For each resource, watch utilization, saturation, and errors; on an interface that means octets against `ifHighSpeed`, discards, and errors.

Ping and SNMP prove only that the box answered. Its web server may have been dead for a day. For any service that matters, add a TCP connect or HTTP check against the real endpoint (the Prometheus blackbox exporter does ICMP, TCP, and HTTP probes), and run it from more than one place if you can, so that "the service is down" and "the path from the monitor is down" look different.

The goal is not to collect everything. It is to answer three questions before your users ask them: is it up, is it slow, and did something change.

## Sizing the TSDB

Capacity planning here is easy arithmetic and worth doing once. The Prometheus documentation gives the formula directly: `needed_disk_space = retention_time_seconds * ingested_samples_per_second * bytes_per_sample`, and states that Prometheus averages only 1 to 2 bytes per sample after compression.

Work an example. A module trimmed with the generator to octets, packets, errors, discards, speed, and status produces roughly 15 series per interface, so call it 700 series for a 48-port switch. Ten devices is 7,000 series. At a 60 second scrape that is about 117 samples per second. Over the default 15 day retention, 1,296,000 seconds times 117 times 2 bytes is around 300 MB. The stock `if_mib` module, which walks every column of both interface tables, produces more than twice that and still fits under a gigabyte. A lab monitoring stack is not a storage problem. It becomes one when someone enables a module that walks every routing table entry.

The default retention is also why the graph of last month's incident is gone when you go looking for it. Raise `--storage.tsdb.retention.time` (90 days of the example above is under 2 GB), or send long-term data to remote storage.

## Syslog Is Two Formats Pretending To Be One

Loki will happily ingest whatever your devices send, which hides the fact that "syslog" means two different things. RFC 5424 is the modern format with RFC 3339 timestamps that include a timezone, structured data fields, and a defined message length that receivers must support to at least 480 octets and should support to 2048. The older BSD format described in RFC 3164 has no year and no timezone in its timestamp and caps the whole packet at 1024 bytes.

Two symptoms follow. Logs from a device still emitting the old format land with the collector's guess at the year, which is why people find January log entries dated to last year. And long messages, exactly the verbose ones a firewall emits during an incident, get truncated mid-field. Set devices to RFC 5424 where the platform supports it.

The transport is a separate choice. UDP on 514 is the traditional default, and it drops messages silently under load, which is exactly when a firewall has the most to say. TCP, conventionally also on 514, adds ordered delivery and back pressure. TLS on 6514 adds encryption, which matters because logs routinely carry usernames and source addresses. Whichever you choose, prove the path end to end before you trust it: `logger -n 192.168.1.20 -P 514 -T "hello from web01"` sends a test line over TCP from any Linux host, and it should turn up in Grafana.

The other thing to get right in Loki is label cardinality. Loki indexes labels, not log content. A label whose value is a source IP or a request ID creates a separate stream per value, and streams are the unit of cost. Keep labels to host, job, facility, and severity, then filter on everything else with LogQL at query time.

## What This Stack Cannot Tell You

Polling every 60 seconds averages away microbursts. A queue that overflowed for 200 milliseconds and dropped frames will not move a one minute utilization average at all. It will move `ifOutDiscards`, which is a counter and therefore remembers. Watch discards and errors, not just utilization, and treat a nonzero discard rate on a link that looks 30 percent utilized as the interesting signal it is.

SNMP also tells you that a link is full without telling you who filled it. For that you need flow export: NetFlow, sFlow, or IPFIX as standardized in RFC 7011. Those are a different pipeline with a different storage profile, and they answer a question polling structurally cannot.

Finally, polling samples state at intervals, so it misses transient events. A link that flaps down and back up between two scrapes leaves no trace in your status graphs. The device knows exactly what happened, and it will say so in a trap or a syslog line. That is the real reason the log pipeline sits next to the metrics pipeline rather than replacing it.

## References

- [RFC 2863: The Interfaces Group MIB, on Counter32, Counter64 and ifIndex](https://www.rfc-editor.org/rfc/rfc2863)
- [RFC 3414: User-based Security Model (USM) for SNMPv3](https://www.rfc-editor.org/rfc/rfc3414)
- [RFC 5424: The Syslog Protocol](https://www.rfc-editor.org/rfc/rfc5424)
- [Prometheus storage, on retention and the disk sizing formula](https://prometheus.io/docs/prometheus/latest/storage/)
- [Alertmanager configuration, for the grouping timers and inhibit_rules](https://prometheus.io/docs/alerting/latest/configuration/)
- [Loki labels, on cardinality and streams](https://grafana.com/docs/loki/latest/get-started/labels/)
- [Prometheus overview](https://prometheus.io/docs/introduction/overview/)
- [Grafana documentation](https://grafana.com/docs/grafana/latest/)
- [RFC 1157: A Simple Network Management Protocol (SNMP)](https://www.rfc-editor.org/rfc/rfc1157)
- [RFC 3411: An Architecture for Describing SNMP Management Frameworks](https://www.rfc-editor.org/rfc/rfc3411)
- [Simple Network Management Protocol](https://en.wikipedia.org/wiki/Simple_Network_Management_Protocol)
