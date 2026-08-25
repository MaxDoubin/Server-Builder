
## An opinion piece, clearly labelled

Everything below is my analysis, not reporting. I am not describing any specific product or claiming what any vendor has shipped. I am writing down the framework I would use to judge a claim, because the marketing in this space runs well ahead of the evidence and I would rather have a checklist than a vibe.

## Start with what the work actually is

Before evaluating a tool, be honest about where the hours go. In most security operations the time sinks are: triaging a large volume of alerts that are mostly not incidents, gathering context that lives in five different systems, writing up what happened, keeping detection content current, and chasing the same misconfiguration across many hosts.

Notice that very little of that is "detect the attack nobody has seen." Most of it is retrieval, correlation, and writing. That matters, because retrieval, correlation, and writing are exactly what language models are good at, and detection of novel attacks is exactly what they are not obviously good at.

It is also worth remembering that machine learning has been in security tooling for a long time and the successes are unglamorous: spam classification, malware family clustering, anomaly detection on numeric telemetry, user behaviour baselines. Those work because they operate on large volumes of labelled or structured data with a clear signal.

If a problem can be solved with a threshold, a rule, or a well understood classifier, use that. It is cheaper, faster, deterministic, explainable, and testable. Reaching for a language model when a `WHERE` clause would do is a common and expensive mistake.

## Three jobs I would plausibly hand a model

Context assembly. Given an alert, pull the asset owner, recent changes, the user's normal behaviour, related tickets, and relevant threat intel into one summary. This is retrieval and formatting, the output is checkable against sources, and being wrong is annoying rather than dangerous.

Translation between representations. Turning a plain description into a query in your SIEM's language, converting a detection rule between formats, explaining a piece of obfuscated script, summarizing what a config change does. The analyst still reads and runs the result, so there is a human check built in.

First draft writing. Incident timelines, post incident reports, ticket summaries, customer notifications. The facts come from the analyst, the model handles the structure and the prose. This is where I think the honest time savings are, and it is boring, which is why nobody advertises it.

## Three jobs I would not hand a model

Autonomous response. Isolating a host, disabling an account, or blocking a range based on a model's judgement with nobody in the loop. The failure mode is a self inflicted outage, and prompt injection through attacker controlled log content makes it worse: an attacker who can write text into your logs can potentially influence a system that reads them.

Being the detection itself. If the model decides what is malicious, you cannot explain a decision to an auditor, you cannot unit test it, its behaviour changes when the model changes, and you cannot reason about what it will miss. Deterministic detections with a model assisting the analyst is a much better division of labour.

Anything where a confident wrong answer is expensive and unverifiable. If a human cannot cheaply check the output, the output has no business being trusted.

## The questions I would ask

What is the baseline, measured how? "Reduces triage time" against what starting point, on whose alerts?

What is the false negative rate, not just the false positive rate? Anything that suppresses alerts is a filter, and a filter's dangerous error is the one it hides.

Can I see the evidence for each conclusion, linked to the source records? If it cannot cite, an analyst has to redo the work anyway.

What happens when the model is wrong, and who notices? Is there a review path, or does the output flow straight into a ticket nobody re reads?

Where does my data go, what is retained, and for how long? Security telemetry is among the most sensitive data an organization has.

Can I evaluate it on my own data before buying? A demo on curated examples proves nothing.

I keep those as a literal scorecard, one file per tool under evaluation, so the comparison is written down rather than remembered:

```yaml
tool: alert-triage-assistant
evaluated_on: our own alert sample, 200 alerts, 2 weeks
baseline: median analyst triage time, measured before rollout
questions:
  false_negative_rate: unknown           # blocker, must be measured
  cites_evidence: yes, links to source events
  human_in_loop_for_actions: yes, read only integration
  data_retention: 30 days, vendor side   # needs review
  offline_eval_possible: yes
decision: pilot on low severity queue only, re-evaluate in 60 days
```

If the important rows come back as "unknown" and the vendor cannot fill them in, that is the answer.

## The part nobody markets

Whatever you deploy becomes infrastructure you have to run. It needs monitoring, an on call story, version pinning, a rollback plan, and a way to tell whether its output quality has drifted. It becomes a dependency during an incident, which means it needs to work when other things are broken.

And it is a new attack surface: a system that ingests attacker influenced text and has access to your security data is a target worth attacking. I would threat model it exactly as carefully as I would threat model the SIEM itself.

My overall position, held loosely: this is a genuine productivity tool for the writing and retrieval parts of the job, an obvious risk in the decision making parts, and the deciding factor for any specific claim is whether the vendor can show you evidence on your own data rather than on theirs.

## References

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST SP 800-61 Rev. 2: Computer Security Incident Handling Guide](https://csrc.nist.gov/pubs/sp/800/61/r2/final)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
