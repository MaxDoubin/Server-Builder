
## The objection, and why it is wrong

Writing an incident report when nobody else will read it feels like paperwork for its own sake. I know what broke. I fixed it. Why write it down?

Because I do not know what broke, I know what I concluded at two in the morning while I was tired and wanted it to be over. Those are different things, and the distance between them is where the next outage lives.

The second reason is memory. Six months from now the same symptom appears and I will half remember something similar. Half remembering is worse than not remembering, because it sends me down the path that worked last time on a problem that only looks the same. A written record turns half memory into a lookup.

The third reason is that writing forces sequencing. Reconstructing a timeline in order surfaces gaps you did not notice while you were inside it: the twenty minutes you spent on the wrong subsystem, the alert that fired before you noticed, the fix you applied without knowing why it worked.

## Blameless still applies when you are the only name

"Blameless" sounds like a policy for protecting other people's feelings. It is not. It is an epistemics rule.

The moment a writeup identifies a person as the cause, the analysis stops. "I made a mistake" is not a finding, it is a full stop. The useful question is why the mistake was available: why the system let a single command with no confirmation delete production data, why the config with a typo passed validation, why nothing caught it for four hours.

When you are the only operator, blaming yourself is easy and comfortable, and it is exactly as useless as blaming a colleague. The discipline is the same: every time you write "I forgot" or "I should have been more careful", treat it as an unfinished sentence. Finish it with what would have made forgetting harmless.

## The timeline is the artifact

Everything else in a postmortem is opinion. The timeline is evidence, and I write it first, from logs and command history rather than from memory.

```bash
# Reconstruct what I actually ran, with timestamps
HISTTIMEFORMAT="%F %T " history | tail -100

# What the machine thought was happening
journalctl --since "2026-07-11 21:00" --until "2026-07-12 01:00" -p warning

# When did monitoring first know
# (pull the alert firing time from your alerting system, not your memory)
```

Two columns: what the system did, and what I did. Absolute timestamps, not relative. Include the boring rows, especially the gaps, because a forty minute gap between the first alert and the first human action is itself a finding about how alerts reach you.

Mark three moments explicitly: when it started, when someone knew, and when it was resolved. Time to detection and time to recovery are the two numbers worth tracking across incidents, and they point at different fixes. Slow detection is a monitoring problem. Slow recovery is a runbook or tooling problem.

## The template I use

```text
## INC-2026-07-11: Lab DNS resolution failed for 3h12m

**Impact.** Internal name resolution failed for all lab hosts from 21:14
to 00:26. Anything with a hardcoded IP kept working. No data loss.
Detection: 47 minutes after onset, by me noticing, not by an alert.

### Timeline
| Time  | System | Me |
| ----- | ------ | -- |
| 21:14 | Resolver container exits, restart loop begins | |
| 21:14 | No alert fires | |
| 22:01 | | Notice a name failing to resolve, start looking |
| 22:20 | | Restart the container, it exits again |
| 23:05 | | Find the config parse error in the logs |
| 00:26 | Resolution restored | Revert the config change |

### What happened
A zone file edit introduced a syntax error. The service validated
config only at startup, so the error was not caught at write time.
It crash looped, and nothing was watching for that.

### Contributing factors
- No pre-commit validation on zone files.
- No alert on container restart count.
- Only one resolver, so a single failure was total.
- The change was made without a rollback plan, at night.

### What I am changing
| Action | Type | By |
| ------ | ---- | -- |
| Add zone syntax check to the deploy script | prevent | 2026-07-14 |
| Alert on restart count above 3 in 10 minutes | detect | 2026-07-14 |
| Stand up a second resolver, different host | mitigate | 2026-07-27 |

### What went right
Reverting was clean because the config was in version control.
```

The "what went right" section is not decoration. If you only ever record failures, you stop noticing which of your habits are load bearing, and eventually you drop one.

## Action items are where postmortems die

Almost every postmortem I have read, mine included, ends with a list of ambitious improvements that never happen. The pattern is predictable: the items are too large, they have no date, and there is no mechanism to revisit them.

Three rules fix most of it.

**Classify each item as prevent, detect, or mitigate.** A list that is all prevention means you believe you can eliminate failure, which you cannot. Detection and mitigation items are usually smaller and pay off across incidents you have not had yet.

**Make each item small enough to do in one sitting.** "Improve monitoring" never happens. "Add an alert on container restart count" happens on Tuesday.

**Give it a date and put it somewhere you will see it.** An action item that lives only in the postmortem document is a wish.

Then reread your old postmortems on a schedule. Quarterly is enough. What you are looking for is repetition: the same contributing factor showing up in three writeups is a much stronger signal than it was in any one of them, and it usually points at something structural you have been routing around instead of fixing.

That is the real payoff of doing this alone. Nobody is going to notice the pattern across your incidents for you. The document is the only thing standing between you and solving the same problem four times.

## References

- https://sre.google/sre-book/postmortem-culture/
- https://csrc.nist.gov/pubs/sp/800/61/r2/final
- https://en.wikipedia.org/wiki/Root_cause_analysis
- https://en.wikipedia.org/wiki/Five_whys
- https://en.wikipedia.org/wiki/Just_culture
- https://man7.org/linux/man-pages/man1/journalctl.1.html
