
## Why Centralize Logs

Logs on individual devices are hard to search across, get lost when devices fail, and can be tampered with by an attacker who compromises the device. Centralizing logs to a dedicated server solves all three problems.

A central log server lets you search across all your infrastructure from one place, retain logs longer than individual devices can store, and preserve logs even if a device is compromised or fails.

## Setting Up rsyslog as a Central Server

On the log server (Ubuntu):

```bash
# /etc/rsyslog.conf - uncomment these lines to enable UDP and TCP reception
module(load="imudp")
input(type="imudp" port="514")

module(load="imtcp")
input(type="imtcp" port="514")

# Store logs per hostname
template(name="RemoteLogs" type="string" string="/var/log/remote/%HOSTNAME%/%PROGRAMNAME%.log")
*.* ?RemoteLogs
```

## Configuring Clients

On each server you want to log centrally:

```bash
# /etc/rsyslog.conf
*.* @@192.168.1.50:514  # TCP
# or
*.* @192.168.1.50:514   # UDP
```

Network devices (switches, firewalls) send syslog natively. Configure the syslog server IP and severity level in the device's management interface.

## Loki and Grafana for Search

rsyslog handles collection and storage. Grafana Loki provides a log aggregation and query system that integrates natively with Grafana dashboards. The combination gives you:

- A unified interface for metrics and logs
- Full-text log search across all sources
- Log alerts that trigger when specific patterns appear
- Correlation between metrics spikes and log events

## Log Retention and Security

Define a log retention policy. Security logs often need to be kept for 90 days or longer for compliance. Protect the log server: logs are forensic evidence, and they must be trustworthy. Use a dedicated network path for syslog traffic, restrict write access to log files, and consider sending logs offsite or to an immutable storage destination for high-security environments.
