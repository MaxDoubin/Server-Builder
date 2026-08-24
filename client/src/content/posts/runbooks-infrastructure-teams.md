
## Why Runbooks Fail

Most runbooks fail for the same reasons. They are written once and never updated. They assume too much context. They describe what the system does rather than what the operator should do. They live in a wiki no one can find during an incident.

Good runbooks are written for an engineer who is stressed at 2 AM and needs to solve a specific problem without having to think about things they should not need to think about.

## The Structure That Works

**Title and purpose:** One sentence. "Restart the payment processing service when it becomes unresponsive." Not "Payment Service Runbook."

**When to use this:** What symptoms trigger this runbook? High latency on checkout? A specific alert firing? Be specific.

**Prerequisites:** What access does the engineer need? What tools? Is there a maintenance window required?

**Steps:** Numbered, specific, and actionable. Not "check the service health" but "run `systemctl status payment-service` and verify it shows Active: active (running)."

**Validation:** How does the engineer know it worked? What output or metric confirms success?

**Escalation:** If the runbook does not resolve the issue, who do you contact? What information do you gather before escalating?

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

## Keeping Runbooks Current

A runbook is only useful if it matches reality. Assign ownership. When the system changes, the runbook changes. After every incident where a runbook was used, update it to reflect what actually worked. Run through runbooks in tabletop exercises before you need them in production.

Runbooks are living documentation. Treat them that way.
