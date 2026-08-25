
## Why monitor

You have a lab or a small network, something feels slow, and you have no idea whether the problem started ten minutes ago or three weeks ago. You cannot fix what you cannot see. Without monitoring, you find out about problems when something breaks. With monitoring, you find out about problems before they break anything, and you have data to diagnose the root cause quickly.

The goal is not to collect every metric that exists. The goal is to be able to answer three questions fast: is it up, is it slow, and did something change. Everything below is built around those three questions.

## Decide what you are measuring first

Before installing anything, pick the handful of signals that actually tell you a machine is unhealthy. For hosts and infrastructure, the useful frame is utilisation, saturation, and errors: how busy a resource is, how much work is queued behind it, and how often it is failing. For services that answer requests, the frame is rate, errors, and duration.

Concretely, in my lab that means CPU run queue and steal time rather than just CPU percent, memory available rather than memory free, disk latency rather than just disk space, and interface errors and discards rather than just interface throughput. A network link that is 40 percent utilised but discarding frames is a bigger problem than a link sitting at 90 percent with a clean error counter.

## Prometheus and Grafana

This combination is the backbone of my monitoring stack. Prometheus scrapes metrics from exporters running on each server (CPU, memory, disk, network) and stores them in a time-series database. Grafana visualizes those metrics on dashboards.

The important thing to understand is that Prometheus is a pull system. It does not sit and wait for servers to send it data. On a schedule, it makes an HTTP GET to `/metrics` on each target and parses a plain text response. That design is why a target that disappears is immediately obvious: the scrape fails and the synthetic `up` metric for that target goes to 0.

Default ports worth memorising, because you will type them constantly:

- Prometheus server and web UI: 9090
- node_exporter: 9100
- Alertmanager: 9093
- SNMP exporter: 9116
- Grafana: 3000

A minimal working config looks like this:

```yaml
# /etc/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "node"
    static_configs:
      - targets: ["10.0.10.11:9100", "10.0.10.12:9100"]
        labels:
          site: "lab"
```

If you leave `scrape_interval` out entirely, Prometheus falls back to its built-in default of one minute. The sample config that ships with it sets 15 seconds, which is a better starting point for a lab.

Check the config before restarting anything:

```bash
promtool check config /etc/prometheus/prometheus.yml
```

Correct output is short and boring:

```
Checking /etc/prometheus/prometheus.yml
 SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax
```

You can also confirm an exporter is answering before Prometheus ever touches it:

```bash
curl -s http://10.0.10.11:9100/metrics | grep -m3 '^node_load1'
```

That should print something like `node_load1 0.24`. If curl returns nothing, the problem is the exporter or the firewall, not Prometheus, and you have just saved yourself an hour.

I have dashboards for per-server resource usage, ZFS pool health, network interface traffic, and UPS status. Each dashboard has alerts configured so I get notified if a metric crosses a threshold (like disk usage exceeding 85% or UPS battery dropping below 50%).

## Writing alerts that are worth reading

An alert that fires on every transient blip trains you to ignore alerts. Two habits fix most of that. First, alert on a condition that has persisted, using a `for` clause. Second, alert on symptoms your users would notice, not on every internal counter.

```yaml
groups:
  - name: host
    rules:
      - alert: DiskFillingUp
        expr: (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"}
               / node_filesystem_size_bytes) * 100 < 15
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "{{ $labels.instance }} {{ $labels.mountpoint }} below 15% free"

      - alert: TargetDown
        expr: up == 0
        for: 5m
        labels:
          severity: critical
```

`promtool check rules /etc/prometheus/rules/host.yml` validates the file and prints `SUCCESS: 2 rules found`. Reload Prometheus with `systemctl reload prometheus` or by POSTing to `/-/reload` if you started it with `--web.enable-lifecycle`.

## SNMP monitoring

My switches and FortiGate export metrics via SNMP (Simple Network Management Protocol). I use the Prometheus SNMP exporter to pull these into the same monitoring stack. This gives me visibility into switch port utilization, error counters, and CPU usage on network devices.

SNMP agents listen on UDP port 161. Traps, which are unsolicited messages the device sends when something happens, go to UDP port 162 on the collector. Version 1 and version 2c authenticate with nothing more than a community string sent in clear text, so treat a v2c community as a password that anyone on the path can read. Version 3 adds real authentication and optional encryption and is what you should use on anything reachable beyond a management VLAN.

Test from the command line before wiring anything into the exporter:

```bash
snmpwalk -v2c -c public 10.0.0.2 1.3.6.1.2.1.1.5.0
```

Correct output is a single line naming the device:

```
SNMPv2-MIB::sysName.0 = STRING: core-sw-01
```

For interface counters, walk the 64-bit versions rather than the originals:

```bash
snmpwalk -v2c -c public 10.0.0.2 IF-MIB::ifHCInOctets
```

SNMP is not the most modern protocol, but it is universally supported by network equipment and provides consistent access to device metrics.

## Uptime monitoring

I use a simple tool that pings every critical device every 60 seconds and alerts if anything goes down. It is basic, but knowing that your DNS server is unreachable before your users tell you is valuable.

One caveat: ICMP echo tells you a network stack answered, not that the service is working. A box can reply to ping while its web server has been dead for a day. For anything that matters, add a TCP connect check or an HTTP check against a real endpoint, and check from more than one place if you can, so you can tell "the service is down" apart from "the path from the monitor is down".

## Log aggregation

All syslog data flows to a central log server running rsyslog. I can search across all servers from a single interface, which is essential for troubleshooting issues that span multiple systems.

Syslog has three transports in common use. UDP on port 514 is the traditional one and it silently drops messages under load. TCP on port 514 gives you delivery ordering and back pressure. TLS on port 6514 gives you both plus encryption, which matters because logs routinely contain usernames, source addresses, and occasionally things that should never have been logged at all.

A minimal receiver on the log server:

```
# /etc/rsyslog.d/10-remote.conf
module(load="imtcp")
input(type="imtcp" port="514")

template(name="PerHost" type="string"
         string="/var/log/remote/%HOSTNAME%/%$YEAR%-%$MONTH%-%$DAY%.log")
*.* ?PerHost
```

Validate with `rsyslogd -N1`, which parses the config and exits without starting the daemon. Then prove the path end to end from a client with `logger -n 10.0.10.5 -P 514 -T "hello from web01"` and confirm the line appears under `/var/log/remote/web01/`.

## The dashboard

My main Grafana dashboard shows a high-level view of the entire lab: all servers, all network devices, storage capacity, and any active alerts. I check it once a day, and if anything is yellow or red, I investigate. This proactive approach has caught failing drives, memory errors, and network issues before they caused outages.

The layout rule I follow is that the top row answers "is anything on fire right now" and everything below it is for diagnosis. If I have to scroll to find out whether the lab is healthy, the dashboard is wrong.

## What breaks

**The monitoring host depends on the thing it monitors.** If Prometheus runs on the same hypervisor as your storage, and storage dies, you lose both the service and the evidence. Put the monitoring stack somewhere with as few shared dependencies as possible, and make sure alert delivery does not route through the network segment most likely to fail.

**`rate()` over too short a window returns nothing.** Prometheus needs at least two samples inside the range to compute a rate. With a 15 second scrape interval, `rate(x[15s])` is usually empty. A safe habit is a window of at least four scrape intervals, so `rate(x[1m])` or `rate(x[5m])`.

**32-bit SNMP counters wrap and produce nonsense spikes.** `ifInOctets` is a 32-bit counter, which wraps after about 4.29 GB of traffic. On a gigabit link that can happen in well under a minute, and the graph shows an impossible spike or a negative dip. Use the high capacity `ifHCInOctets` and `ifHCOutOctets` objects from IF-MIB instead, which are 64-bit.

**Prometheus quietly deletes your history.** The default retention is 15 days. If you go looking for the graph of an incident from last month and it is gone, that is why. Raise `--storage.tsdb.retention.time`, and size the disk for it, or send long-term data to remote storage.

**An alert on `up == 0` cannot fire for a target that was never configured.** If a host is decommissioned from the config or a service discovery job stops returning it, the target simply vanishes and no alert exists to fire. Guard the ones you care about with an `absent()` rule, which fires when a named metric stops existing at all.

**Everything alerts at once during a reboot.** Without a `for` clause, one planned restart pages you five times. Add `for: 5m` on host level alerts and configure inhibition in Alertmanager so a critical "host down" suppresses the twenty warnings that follow from it.

## References

- https://prometheus.io/docs/introduction/overview/
- https://grafana.com/docs/grafana/latest/
- https://www.rfc-editor.org/rfc/rfc1157
- https://www.rfc-editor.org/rfc/rfc3411
- https://www.rfc-editor.org/rfc/rfc5424
- https://en.wikipedia.org/wiki/Simple_Network_Management_Protocol
