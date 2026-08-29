
## This is an opinion piece

Everything below is how I currently think about this, not a report on what anyone has shipped. I am a student running a lab, not an operator of a production network at scale, and I would rather be clear about that than pretend otherwise. Take it as a framework for evaluating claims, including my own.

## The unglamorous prerequisite

Before any of this is worth discussing: if your inventory is a spreadsheet somebody last updated in the fall, your device naming is inconsistent, your configs are not in version control, and your logs are not centralized, then adding a model to your operation changes nothing. It will produce confident output derived from bad data.

Every genuinely useful application I can think of depends on structured, current, machine readable knowledge of the network. Which means the boring work, source of truth inventory, config in git, centralized logging with consistent fields, is the prerequisite and also the part that delivers most of the value on its own.

That is not a dodge. It is the actual finding. The data plumbing is the project.

## Where I think it fits

**Log and alert triage.** A model summarizing three hundred correlated [syslog](/blog/syslog-centralized-logging) lines into "these forty messages are one interface flapping, here is the interface" is doing something genuinely hard for a human at 3am and easy for a language model. It is a reading comprehension task over text, which is exactly the shape of the problem these models are good at.

**Explaining a config diff.** A diff of two device configurations is precise and unreadable. "This change adds VLAN 40 to the trunk on ports 1 through 8 and removes the storm control threshold" is a summary a reviewer can act on. The diff remains the source of truth. The summary is a reading aid.

**First drafts of runbooks and documentation.** Documentation does not get written because writing it is tedious. A generated first draft that a human corrects is much more likely to exist than a blank page. The correction step is not optional.

**Querying inventory in plain language.** Translating "which access switches are still running the old firmware and have uplinks to the distribution layer" into a query against a structured source of truth. Notice this is a translation task producing a query that runs deterministically. The model does not answer the question, it writes the lookup.

**Baselining and anomaly surfacing.** Worth separating: most of the good anomaly detection in network operations is classical statistics and time series work, not language models. Where a model helps is at the end, turning a flagged anomaly into a readable explanation with context attached.

## Where I would not put it

**Autonomous configuration change.** Not because the model cannot generate valid configuration, it usually can, but because the failure mode is unbounded. A bad access control entry or a routing change can partition a network from the very management plane you would use to fix it. Generation, yes. Review and approval by a human, always.

**As the only thing looking at an alert.** Deterministic thresholds and rules should still exist. A model summarizing on top of them is an improvement. A model replacing them means your monitoring is now nondeterministic, and you cannot write a test for it.

**Anywhere a precise audit trail is required.** Change control wants to know exactly what was done and why. "The assistant suggested it" is not an answer that survives a post incident review.

**Anything involving secrets in the prompt.** Device configs are full of credentials, community strings, and keys. If they go into a prompt, know exactly where that prompt goes and who retains it. Strip secrets during collection, not later.

## Guardrails I would insist on

If I were putting an assistant anywhere near a network, I would write the policy before the code.

```yaml
# ops-assistant-policy.yml
identity:
  # The assistant never has its own standing privileges.
  credentials: per-operator, short-lived, no shared service account

capabilities:
  read:
    allowed: [inventory, config_repo, syslog_index, metrics]
    redact: [passwords, snmp_communities, psk, api_keys, certificates]
  write:
    allowed: []          # nothing writes directly to a device
    proposal_only: true  # output is a pull request, never a push

change_flow:
  - assistant generates candidate config as a diff
  - diff runs through the existing linter and policy checks
  - diff applied in a lab or dry-run mode first
  - named human approves in the normal change process
  - deployment executed by the existing automation, not the assistant

limits:
  max_tool_calls_per_request: 12
  wall_clock_timeout_seconds: 120
  blast_radius: single device per proposal

audit:
  log: [prompt, retrieved_context, tool_calls, output, approver]
  retention_days: 400
  egress: allowlist only, no arbitrary outbound requests
```

The core idea in that file: the assistant proposes, the existing pipeline disposes. Everything already built for safe change, linting, staging, review, rollback, stays in the path. You are adding a drafting step at the front, not replacing the machinery.

## How I would evaluate a claim, and where I land

When something promises AI powered network operations, these are the questions I would ask.

What is the false positive rate, measured on a network like mine? What happens when it is wrong, and who notices? Does it need write credentials, and can it work read only? Where does my configuration data go, and is it retained or used for training? Can I reproduce a given output later for a post incident review? What does it do when the data it depends on is stale, and does it say so or does it guess?

If the answers are vague, the product is probably a wrapper around a prompt, and I can write that myself with better guardrails.

So the honest position. I think the reading, summarizing, and drafting applications are real and available to anyone with clean data. I think autonomous operation is a bad trade for the foreseeable future, because the value is convenience and the risk is a network partition. And I think most of the benefit people attribute to the model actually comes from the data hygiene they had to do first.

## References

- [Prometheus documentation](https://prometheus.io/docs/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NetBox documentation](https://netboxlabs.com/docs/netbox/)
- [Ansible documentation](https://docs.ansible.com/)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
