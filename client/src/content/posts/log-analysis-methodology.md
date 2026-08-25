
## Logs tell the truth

Something broke twenty minutes ago, a user has given you a vague description of it, and you have a terminal open on the machine. The question is not whether the answer is in the logs. It usually is. The question is how to get from millions of lines to the six that matter without reading any of the rest.

When a system is misbehaving, logs are the first place I look. Unlike user reports or symptoms, logs provide objective, timestamped records of what the system actually did. They do not lie (though they can be incomplete or misleading if you do not know what you are looking at).

## My process

1. **Define the problem clearly.** What broke? When did it start? What changed?
2. **Identify which logs to check.** System logs, application logs, authentication logs, and network device logs each tell different parts of the story.
3. **Narrow the time window.** If the problem started at 2:30 PM, focus on logs from 2:15 PM to 2:45 PM. Looking at hours of logs wastes time.
4. **Search for errors and warnings first.** Grep for ERROR, WARN, FAIL, and DENIED. These keywords surface the most relevant entries quickly.
5. **Expand from there.** Once you find a relevant log entry, look at the entries before and after it for context.

Step one carries most of the weight. "The website is down" is not a problem definition. "HTTPS requests to the reverse proxy started returning 502 at about 14:30, and it affects every backend" is a definition, and it tells you which three logs to open. If you cannot state the problem in one sentence with a time in it, spend another two minutes with the person who reported it rather than opening a log file.

## Where the logs actually are

On a modern Linux system you have two overlapping stores, and knowing which one you are in saves a lot of confusion.

The **journal** is systemd's binary log, queried with `journalctl`. It holds kernel messages, everything services write to stdout and stderr, and structured metadata about which unit, PID, and user produced each line. It is not a text file and grep cannot read it directly.

**Plain text files under `/var/log`** are written by rsyslog or by applications themselves. `/var/log/syslog` or `/var/log/messages` for general system messages, `/var/log/auth.log` or `/var/log/secure` for authentication, and per-application directories like `/var/log/nginx/`.

If the journal is empty after a reboot, the machine is storing it in memory only. Persistent journals require `/var/log/journal` to exist; create it and restart systemd-journald and history survives reboots.

## Tools

For quick searches, I use grep and awk on the command line:

```bash
grep -i "error" /var/log/syslog | tail -50
journalctl --since "2026-02-10 14:00" --until "2026-02-10 15:00"
```

The journalctl options I use constantly, beyond the time window:

- `-u sshd.service` restricts to one unit.
- `-p err` filters by priority. The syslog severities defined in RFC 5424 run 0 for emergency through 7 for debug, and `-p err` means severity 3 and anything more severe.
- `-b` is the current boot, `-b -1` the previous one. That is the fastest way to see what happened before an unexplained reboot.
- `-f` follows in real time, which is how you watch a failure you can reproduce.
- `-o short-iso` prints unambiguous timestamps, and `--utc` forces UTC.
- `_SYSTEMD_UNIT=`, `_PID=`, and `_UID=` filter on the structured fields journald records, which is more precise than grepping the message text.

## A worked example

A user cannot log in to a lab box and thinks their account is locked. Start narrow, on the unit and the window:

```bash
journalctl -u ssh.service --since "14:15" --until "14:45" -o short-iso
```

Correct output looks like a handful of lines with clear verbs:

```
2026-02-10T14:22:41-0800 lab01 sshd[2841]: Failed password for invalid user admin from 203.0.113.9 port 41234 ssh2
2026-02-10T14:22:43-0800 lab01 sshd[2841]: Connection closed by invalid user admin 203.0.113.9 port 41234 [preauth]
2026-02-10T14:31:02-0800 lab01 sshd[2907]: Accepted publickey for maxdoubin from 10.0.10.22 port 52118 ssh2: ED25519 SHA256:0Zr...
```

Two things fall out immediately. The user who complained is not in this output at all, which means their connection never reached sshd and the problem is upstream: firewall, routing, or the wrong hostname. And there is unrelated brute force noise from an external address, which is normal background but worth counting.

To count it, aggregate rather than read:

```bash
journalctl -u ssh.service --since today --no-pager \
  | grep 'Failed password' \
  | grep -oE 'from [0-9.]+' \
  | sort | uniq -c | sort -rn | head
```

```
    412 from 203.0.113.9
     37 from 198.51.100.44
      2 from 10.0.10.31
```

The external addresses are bots. The internal one is a person with a stale key or a typo in their username, and that is the line worth following up.

For more complex analysis, I pipe log data into Python scripts that parse timestamps, extract fields, and aggregate patterns. A small one that buckets failures per source per minute makes a slow, patient brute force visible where a raw count does not:

```python
import re
import sys
from collections import Counter

PATTERN = re.compile(
    r"^(?P<ts>\S+)\s+\S+\s+sshd\[\d+\]:\s+Failed password.*?from (?P<ip>[\d.]+)"
)

buckets = Counter()
for line in sys.stdin:
    match = PATTERN.match(line)
    if match:
        minute = match.group("ts")[:16]  # YYYY-MM-DDTHH:MM
        buckets[(minute, match.group("ip"))] += 1

for (minute, ip), count in buckets.most_common(10):
    print(f"{minute}  {ip:<15} {count}")
```

Feed it with `journalctl -u ssh.service --since today -o short-iso --no-pager | python3 count_failures.py`. Output is one line per busy minute:

```
2026-02-10T14:22  203.0.113.9     118
2026-02-10T14:23  203.0.113.9      94
2026-02-10T09:07  10.0.10.31        2
```

## Common patterns

Some log patterns I have learned to recognize immediately:

- **Rapid repeated authentication failures:** Brute force attempt or misconfigured service.
- **Disk I/O errors:** Failing drive. Check SMART data and replace.
- **Connection refused messages:** Service is not running, port is blocked, or wrong IP.
- **Out of memory (OOM) kills:** A process consumed too much RAM and the kernel killed it. Need more memory or the application has a memory leak.

Two additions I have picked up since. A **kernel message about a task blocked for more than 120 seconds** points at storage that has stopped responding, not at the process named in the message. And **a service that restarts on a regular cadence** with nothing between the restarts is usually being killed by its supervisor for failing a health check, so the interesting log is the supervisor's, not the application's.

Also learn the difference between "connection refused" and "connection timed out". Refused means something actively rejected you, so the packet reached a host and nothing was listening on that port. Timed out means no answer at all, which points at a firewall dropping silently or a route that goes nowhere. Those two words send you to completely different places.

## What breaks

**Grepping for the wrong word.** Not every failure says "error". Search for `-iE 'error|fail|denied|refused|timeout|panic|fatal'` and use `-i`, because half of the software on any machine capitalises differently from the other half.

**Timezone mismatch between sources.** journalctl prints local time by default, most application logs are UTC, and a firewall may be on a third setting. Two logs of the same incident then appear to describe events hours apart. Force one representation with `-o short-iso` or `--utc`, and prefer RFC 3339 timestamps with an explicit offset wherever you control the format.

**The window you need was rotated away.** logrotate has already deleted the file, or the journal hit its size cap. Check retention before you need it: `journalctl --disk-usage` tells you how much is stored, and the settings in journald.conf control the cap. On containers this is worse, because recreating a container discards its logs entirely unless they were shipped somewhere first.

**journald silently rate limiting.** When a service floods the log, journald drops messages and records a line saying it suppressed some number of them from that unit. If your timeline has a hole in it during the busiest moment, search for "Suppressed" before concluding nothing happened.

**Treating absence of a log as absence of an event.** A process that dies before it opens its log file writes nothing at all. So does a service that was never started. When the log is empty, verify the service actually ran, with `systemctl status` and the journal for the unit, rather than assuming the subsystem is healthy.

**Trusting local logs on a host you suspect is compromised.** An attacker with root can edit them. This is the entire argument for the next section.

## Centralized logging

Checking logs on individual servers is fine for a few machines. Once you have more than five, centralized logging is essential. I send all syslog data to a central server where I can search across all machines from one interface. This also means I have log copies even if the original server's logs are lost.

Two rules make it useful rather than decorative. Ship over TCP, because UDP silently drops exactly when a burst of interesting events arrives. And synchronise clocks with NTP across everything that logs, because cross-machine correlation is the whole point and it is impossible if two hosts disagree about what time it is.

## The NCL connection

Log analysis is a major category in the National Cyber League competition. The skills transfer directly: you get a set of logs and need to extract specific information, identify attacks, and answer questions about what happened. The methodology is identical to real-world troubleshooting.

The competition format rewards the same habit that works at work: read the question, narrow the window, aggregate before you read line by line. The people who do badly at log analysis challenges are usually scrolling. The people who do well have already turned the file into a count of something.

## References

- https://man7.org/linux/man-pages/man1/journalctl.1.html
- https://man7.org/linux/man-pages/man7/systemd.journal-fields.7.html
- https://man7.org/linux/man-pages/man5/journald.conf.5.html
- https://www.rfc-editor.org/rfc/rfc5424
- https://www.rfc-editor.org/rfc/rfc3339
- https://docs.python.org/3/library/re.html
