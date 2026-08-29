
## Why Runbooks Fail

Most runbooks fail for the same reasons. They are written once and never updated. They assume too much context. They describe what the system does rather than what the operator should do. They live in a wiki no one can find during an incident.

Good runbooks are written for an engineer who is stressed at 2 AM and needs to solve a specific problem without having to think about things they should not need to think about.

Each of those failures has a recognizable shape, and once you can name the shape you can avoid it.

**The stale command.** The runbook says `service payment restart`. Since it was written, the host was rebuilt on a distribution where `service` is a thin shim, or the workload moved into a container and there is no init script at all. The symptom is nasty: a command that exits 0 and changes nothing, and an operator who now believes the restart happened and starts looking somewhere else. The fix is to name the exact tool and the exact expected output for every command, so a no-op is visible instead of silent.

**The hardcoded hostname.** `payment-server-01.prod` was the only one when the runbook was written. There are four now, behind a load balancer. The operator restarts one, the alert does not clear, and the next fifteen minutes go into deciding whether the runbook is wrong or the diagnosis is wrong. Write the step against an inventory query that returns the current set, and include the query itself.

**The prose runbook.** Someone wrote three good paragraphs explaining how the queue drains. That is real documentation, and it is not a runbook. Nobody reads paragraphs at 2 AM. Split it: background lives in a design doc the runbook links to, and the runbook is numbered steps.

**The unfindable runbook.** The document is excellent and the on-call engineer has never seen it. The fix is mechanical. Put the runbook link in the alert itself. [Prometheus](/blog/prometheus-server-monitoring) alerting rules carry an `annotations` block, and a `runbook_url` annotation rides through Alertmanager into the notification, so the page that wakes you up contains the link to the page that tells you what to do.

There is a fifth failure that only shows up in the worst incidents: the runbook hosted on the infrastructure that is currently broken. If the wiki runs on the cluster that is down, or sits behind the identity provider that is the outage, you have no runbook. Keep an exported copy in a different failure domain. A PDF on a laptop is unglamorous and it works.

## The Structure That Works

**Title and purpose:** One sentence. "Restart the payment processing service when it becomes unresponsive." Not "Payment Service Runbook."

**When to use this:** What symptoms trigger this runbook? High latency on checkout? A specific alert firing? Be specific. Name the alert by its exact alertname so a search for the alert text finds this document.

**Prerequisites:** What access does the engineer need? What tools? Is there a maintenance window required? Name the exact group or role that grants the access, not "prod access", because the person reading this at 2 AM may need to request it and cannot guess what to ask for.

**Steps:** Numbered, specific, and actionable. Not "check the service health" but "run `systemctl status payment-service` and verify it shows Active: active (running)."

**Validation:** How does the engineer know it worked? What output or metric confirms success? Prefer a metric with a threshold over a vibe. "Checkout p99 latency back under 400 ms on the dashboard" beats "site feels fine."

**Escalation:** If the runbook does not resolve the issue, who do you contact? What information do you gather before escalating? Escalate to a rotation, never to a named person. People change teams and the runbook does not.

## Example Step Format

```
Step 3: Restart the service

ssh admin@payment-server-01.prod
sudo systemctl restart payment-service

Expected output:
[output of systemctl status payment-service]
Active: active (running) since ...

If the service fails to start, see Step 6 (Escalation).
```

The expected output block is the part that carries the weight. Without it, "restart the service" is a hope. With it, the operator has a decision point: matched or did not match, continue or escalate.

Real systems have branches, and the branches are worth writing down because they are where people get stuck. Two systemd behaviors account for a surprising share of confused restarts. First, a unit that ignores SIGTERM does not stop instantly. systemd waits `TimeoutStopSec` and then sends SIGKILL, and the shipped default from `systemd-system.conf` is 90 seconds. So a restart that appears hung for a minute and a half is often just working. Second, systemd rate limits restarts: the defaults are `DefaultStartLimitBurst=5` within `DefaultStartLimitIntervalSec=10s`. Trip that and the unit refuses to start at all, with a message about the start request being repeated too quickly and a result of `start-limit-hit`. The service is not broken in a new way. It is locked out.

```
Step 4: If the restart is refused

systemctl status payment-service
  -> "start request repeated too quickly" / result 'start-limit-hit'

sudo systemctl reset-failed payment-service
sudo systemctl start payment-service

Do NOT loop on restart. Five failed starts in ten seconds
is what put the unit in this state. If it fails again after
reset-failed, go to Step 6 and take the journal with you:

journalctl -u payment-service --since '-15 min' --no-pager
```

That last line matters more than it looks. Half of a good escalation is arriving with the evidence already collected, because the person you escalate to will ask for exactly that and the logs may have rotated by the time they do.

## When Not To Write a Runbook

Runbooks are for known failure modes with known fixes. That boundary is real and it is worth respecting.

If a step in your document says "investigate the root cause", you are not writing a runbook. You are writing a diagnostic guide. Both are valuable, they get used at different moments, and mixing them produces a document that is too long to follow under pressure and too shallow to actually debug with. Label them separately.

If a runbook has been executed five times and every execution was byte-for-byte identical, it should be a script or an automated remediation, not a document a human retypes at 2 AM. If there is a reason it cannot be automated, and there often is, that reason is the most important sentence in the runbook and it belongs at the top. "This cannot be automated because the failover is destructive if the primary is actually alive" tells the operator why they are being asked to think.

A runbook that ends in "open a vendor case" is a perfectly good runbook. Say so in the first line so nobody burns forty minutes before making the call.

The one thing a runbook genuinely cannot supply is judgment about whether the documented fix is safe right now. A restart procedure that is correct during a normal Tuesday can be the wrong move during a partial data corruption event. The best runbooks state their own preconditions, and the best operators still check them.

## Keeping Runbooks Current

A runbook is only useful if it matches reality. Assign ownership. When the system changes, the runbook changes. After every incident where a runbook was used, update it to reflect what actually worked. Run through runbooks in tabletop exercises before you need them in production.

Make the currency visible. Put a "last verified" line at the top with a date and the name of the person who verified it, and treat a runbook that has not been executed or walked through in a year as untested, because it is. Tie the review to change, not to a calendar reminder: the pull request that renames a service is the pull request that fixes the runbook.

Exercises are worth the time. A discussion-based tabletop is cheap, it finds the wrong assumptions, and it finds them before those assumptions cost you an outage. NIST SP 800-61 makes the companion point that lessons-learned activity is a phase of the incident lifecycle rather than an optional extra, and the SRE material on postmortem culture is the practical version of the same argument: the runbook fix is an action item with an owner and a due date, not a good intention.

The most honest quality metric I know for a runbook library is small and slightly uncomfortable: of the runbooks executed this quarter, how many needed to be corrected mid-incident? If that number is not near zero, the library is decoration.

Runbooks are living documentation. Treat them that way.

## References

- https://sre.google/sre-book/managing-incidents/
- https://sre.google/workbook/incident-response/
- https://sre.google/workbook/postmortem-culture/
- https://csrc.nist.gov/pubs/sp/800/61/r2/final
- https://man7.org/linux/man-pages/man5/systemd-system.conf.5.html
- https://prometheus.io/docs/practices/alerting/
