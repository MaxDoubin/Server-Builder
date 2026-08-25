
## Why Centralize Logs

Logs on individual devices are hard to search across, get lost when devices fail, and can be tampered with by an attacker who compromises the device. Centralizing logs to a dedicated server solves all three problems.

A central log server lets you search across all your infrastructure from one place, retain logs longer than individual devices can store, and preserve logs even if a device is compromised or fails.

## Facilities, Severities, and the PRI Number

Every syslog message begins with a priority value in angle brackets, and understanding it makes filtering rules stop feeling arbitrary. The PRI is a single number computed as `facility * 8 + severity`.

Severity runs 0 to 7: emerg, alert, crit, err, warning, notice, info, debug. Note that lower is more urgent, which is the opposite of what most people guess, and that `*.info` in a selector means "info and everything more severe," not "info only." Facility identifies the subsystem: kern is 0, user 1, mail 2, daemon 3, auth 4, syslog 5, cron 9, authpriv 10, and local0 through local7 occupy 16 to 23. Network gear almost always lets you pick a local facility, which is the clean way to separate switch logs from server logs on arrival.

So `<34>` decodes to facility 4 and severity 2: an authentication subsystem critical message. Setting a device's logging level to `informational` and wondering why the log server is drowning is usually a severity misunderstanding, since informational is 6 and pulls in everything above it.

Two formats coexist. RFC 3164 is an informational document that describes what BSD syslog implementations were already doing in 2001, with a 1024 byte message limit and a timestamp carrying no year and no timezone. RFC 5424 is the actual standard: RFC 3339 timestamps with fractional seconds and offset, explicit app-name and procid fields, and structured data key-value pairs. Receivers must accept at least 480 octets and should accept 2048. Most network appliances still emit 3164, most modern Linux daemons can emit 5424, and your server has to handle both.

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

Add one thing to the UDP input before you rely on it:

```bash
module(load="imudp" rcvbufSize="16m")
```

UDP has no flow control, so when the receive socket buffer fills, the kernel discards datagrams silently and the sender never learns. The bursts that overflow it are precisely the ones you care about: a switch storming, a service crash-looping, a brute force attempt. Raise `net.core.rmem_max` on the host to match, or the request for a 16 MB buffer is quietly clamped.

Put `/var/log/remote` on its own filesystem. A log server that fills its root partition stops logging and frequently stops working, and the classic version of this outage is one misbehaving host emitting debug output at ten thousand lines per second overnight.

## Configuring Clients

On each server you want to log centrally:

```bash
# /etc/rsyslog.conf
*.* @@192.168.1.50:514  # TCP
# or
*.* @192.168.1.50:514   # UDP
```

Network devices (switches, firewalls) send syslog natively. Configure the syslog server IP and severity level in the device's management interface.

Windows does not speak syslog at all. It writes to the Event Log, so a Windows host needs either a forwarder that translates events to syslog or Windows Event Forwarding into a collector that does. Budget for that; discovering it after building the rest is a common surprise.

## UDP, TCP, and What Reliable Actually Means

The double `@@` is TCP and the single `@` is UDP, and people reasonably assume TCP means the messages arrive. It does not quite mean that.

TCP guarantees delivery into the receiver's kernel buffer. It does not guarantee the receiving daemon read the message, and it certainly does not guarantee the message reached disk. If the log server is killed with data in its socket buffer, those messages are gone and the sender's TCP stack reported success. For genuine end-to-end acknowledgement you need RELP, rsyslog's own protocol, which acknowledges at the application layer after the message is accepted.

TCP framing is its own trap. RFC 6587 documents two ways to delimit messages on a stream: octet-counting, where each message is prefixed by its length, and non-transparent framing, where messages are separated by a trailing newline. rsyslog uses non-transparent framing by default. If one end expects octet counts and the other sends newline-delimited text, you get messages concatenated into one giant line or split at every embedded newline, and the symptom looks like corruption rather than a protocol mismatch.

For anything crossing an untrusted network, use TLS. RFC 5425 defines syslog over TLS on port 6514, and mutual certificate authentication is the only mechanism in the whole stack that actually authenticates a sender.

The other half of reliability is what happens when the log server is down. By default rsyslog buffers in a bounded memory queue and starts discarding when it is full. Give the forwarding action a disk-assisted queue so an hour of maintenance does not become an hour of missing logs:

```bash
action(type="omfwd" target="192.168.1.50" port="514" protocol="tcp"
       queue.type="LinkedList" queue.filename="fwd-server"
       queue.maxdiskspace="1g" queue.saveOnShutdown="on"
       action.resumeRetryCount="-1")
```

`action.resumeRetryCount="-1"` means retry forever instead of giving up, and `queue.saveOnShutdown` writes the queue to disk on a clean restart rather than dropping it.

## Loki and Grafana for Search

rsyslog handles collection and storage. Grafana Loki provides a log aggregation and query system that integrates natively with Grafana dashboards. The combination gives you:

- A unified interface for metrics and logs
- Full-text log search across all sources
- Log alerts that trigger when specific patterns appear
- Correlation between metrics spikes and log events

Understand how Loki achieves that cheaply, because it changes how you configure it. Loki does not build a full-text inverted index. It indexes only the label set of each stream and stores the log lines themselves as compressed chunks. A query first selects streams by label, then brute-force scans the matching chunks for your pattern. A query with a tight selector like `{host="sw-core-1", job="syslog"}` is fast. A query that scans everything is a linear read of your entire retention window.

The failure mode that follows is cardinality. Every unique combination of label values is a separate stream, so putting a client IP, a session ID, or a request ID in a label multiplies your streams into the millions and Loki falls over. Labels are for things with a small, bounded set of values: host, job, facility, severity, environment. Everything else stays in the log line and gets filtered at query time.

## Log Retention and Security

Define a log retention policy. Security logs often need to be kept for 90 days or longer for compliance. Protect the log server: logs are forensic evidence, and they must be trustworthy. Use a dedicated network path for syslog traffic, restrict write access to log files, and consider sending logs offsite or to an immutable storage destination for high-security environments.

Where the numbers come from matters. PCI DSS requires audit log history to be retained for at least 12 months with the most recent three months immediately available for analysis, and NIST SP 800-92 is the general guide for building a log management program rather than a specific number. Pick your retention from whichever regime actually applies to you and write down why, because "90 days" repeated without a source is how policies end up unsatisfiable.

Three security properties are worth being blunt about.

**The hostname field is not authenticated.** Over plain UDP or TCP, any host that can reach port 514 can send a message claiming to be your domain controller. Firewall the port to known sources, and use TLS client certificates where the logs will be used as evidence.

**Log injection is real.** A message containing an embedded newline can forge what looks like an additional log line from another program. rsyslog escapes control characters on receipt by default, and people disable that setting to make multi-line Java stack traces readable. Understand the trade you are making.

**Absence is a signal.** An attacker who gets root on a host stops its logging before doing anything interesting. A log pipeline that only alerts on bad messages will never notice. Alert on a source that has gone quiet: if a host normally sends a few hundred messages an hour and sends zero for thirty minutes, that is worth a page.

## References

- https://www.rfc-editor.org/rfc/rfc5424
- https://www.rfc-editor.org/rfc/rfc3164
- https://www.rfc-editor.org/rfc/rfc5425
- https://www.rfc-editor.org/rfc/rfc6587
- https://www.rsyslog.com/doc/configuration/modules/imudp.html
- https://csrc.nist.gov/pubs/sp/800/92/final
