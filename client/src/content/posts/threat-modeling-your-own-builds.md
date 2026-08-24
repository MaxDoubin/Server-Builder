
## Four questions

Threat modeling has a reputation as a heavyweight enterprise process with special software and a two day workshop. It is not. It is four questions, and you can answer them for a personal project in an afternoon.

What are we building? What can go wrong? What are we going to do about it? Did we do a good job?

That is the whole method. Everything else, every framework and diagram notation, is scaffolding to help you answer question two without missing something obvious.

## Draw the thing, honestly

Start with a diagram. Not an architecture diagram for a presentation, a working sketch that shows what actually exists.

Put on it: every process, every place data is stored, every flow between them, and every external entity that touches the system. Then draw trust boundaries as lines wherever the level of trust changes. Across the internet edge. Between an authenticated user and an anonymous one. Between a VLAN with your workstations and one with untrusted devices. Between a container and its host.

The boundaries are where the interesting problems live, because a boundary is a place where something is checked or, more usefully, a place where you forgot to check.

Two rules for the diagram. It must reflect reality, including the temporary thing you set up six months ago and never removed. And it must include the management and monitoring paths, because those are frequently the least protected and the most powerful.

## Finding threats without a framework fetish

For each element and each flow, ask what an attacker could do. STRIDE is a useful prompt list, not a religion:

Spoofing, meaning pretending to be someone else. Tampering, meaning modifying data in transit or at rest. Repudiation, meaning doing something without a trace. Information disclosure, meaning reading what you should not. Denial of service. Elevation of privilege.

Walk each flow and each store, and for each one ask the six. Most will not apply. The value is in the ones that make you pause.

For personal infrastructure I add a seventh that no framework lists: what happens when I am the threat. Fat fingered command, forgotten firewall rule left open during testing, a credential in a repository, a backup that has never been restored. Realistically, self inflicted incidents outnumber attacks for anything not exposed to the internet, and the mitigations are cheap.

## Rank by what you would actually do

Do not build a risk matrix with numeric scores you invented. Sort into three buckets instead.

Fix now: the threat is realistic, the impact is serious, and the fix is something you can do this week. Management interface reachable from an untrusted network. Default credential still in place. Backups that have never been test restored.

Fix later, written down: real but lower impact, or expensive to address. This bucket exists so the item is a decision rather than an oversight.

Accept, with a reason: you thought about it and chose not to act. Write the reason. "Physical access to the building is out of scope for my home network" is a legitimate position; forgetting to consider it is not.

## Write it down so it survives

The output is not the diagram, it is a short document you will actually reread. I keep it in the repository next to the thing it describes.

```yaml
system: internal metrics stack
reviewed: 2026-06-16
assets:
  - name: metrics database
    why_it_matters: contains host inventory and traffic patterns
  - name: dashboard credentials
    why_it_matters: reused elsewhere if leaked, so rotate on any suspicion
trust_boundaries:
  - untrusted VLAN to management VLAN
  - browser to dashboard (authentication)
  - collector to database (service credential)
threats:
  - id: T1
    description: collector credential grants write access to all metrics
    boundary: collector to database
    stride: elevation of privilege
    decision: fix now
    mitigation: per collector credentials scoped to their own tables
  - id: T2
    description: dashboard reachable from untrusted VLAN
    boundary: untrusted VLAN to management VLAN
    stride: information disclosure
    decision: fix now
    mitigation: firewall rule, deny by default, allow management VLAN only
  - id: T3
    description: no audit log of dashboard queries
    stride: repudiation
    decision: accept
    reason: single operator, low value, revisit if others get access
```

Structured text beats a diagram in a screenshot, because you can diff it. When the design changes, the change shows up in review.

## Redo it when the design changes

A threat model is only accurate at the moment you wrote it. Adding a new service, opening a port, granting someone access, or connecting a new network invalidates parts of it.

I re read mine whenever I add something that crosses a boundary, and completely whenever I change the network layout. It takes twenty minutes when the document already exists. Compare that to the time cost of discovering, months later, that a service you exposed for one afternoon of testing has been reachable ever since.

## References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [Microsoft Threat Modeling Tool threat categories (STRIDE)](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [NIST SP 800-30 Rev. 1: Guide for Conducting Risk Assessments](https://csrc.nist.gov/pubs/sp/800/30/r1/final)
- [Threat model](https://en.wikipedia.org/wiki/Threat_model)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
