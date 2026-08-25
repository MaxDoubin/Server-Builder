
## Why bother when nobody is attacking you

The honest objection to threat modeling on personal infrastructure is that
nobody is targeting you specifically. Mostly true. What is also true is that
automated scanning targets everything, and that the discipline of writing down
what you are protecting and from whom is the fastest way to stop wasting effort
on controls that do not matter while ignoring the one that does.

I do this because it changes my defaults. Without a model, security work turns
into a list of hardening tips applied at random. With one, I can say out loud
why a service is exposed, what happens if it is compromised, and what the blast
radius is. That is a much better position to be in, and it is exactly the
reasoning a real security role expects you to be able to do.

## Four questions, in order

The framing I use is the one that keeps showing up in serious guidance, and it
is four questions:

1. What are we working on?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good enough job?

Question one is a diagram. Not a pretty one. Boxes for processes, cylinders for
data stores, arrows for data flows, and, most importantly, lines around trust
boundaries. A trust boundary is anywhere data crosses from something you control
less to something you control more: the internet to your edge, a guest VLAN to a
server VLAN, an unauthenticated endpoint to an authenticated one, a container to
the host.

Almost every interesting vulnerability lives on a trust boundary. If your
diagram has no boundaries drawn, you have not finished the diagram.

## What can go wrong: STRIDE as a checklist

STRIDE is a mnemonic for six categories of thing that goes wrong, and its value
is that it is exhaustive enough to catch what you would have skipped:

- **Spoofing**: someone claims to be a principal they are not.
- **Tampering**: someone modifies data or code in transit or at rest.
- **Repudiation**: someone does something and there is no evidence it happened.
- **Information disclosure**: data reaches someone who should not have it.
- **Denial of service**: the thing stops being available.
- **Elevation of privilege**: someone gains capabilities they were not granted.

Walk each element of your diagram against each letter. Most cells are boring.
The point is to make the interesting ones visible instead of hoping you thought
of them.

I keep the output in a file next to the service config, in the repo, so it is
reviewed when the service changes:

```yaml
service: notes
owner: me
exposure: internet, behind reverse proxy
data_sensitivity: personal notes, no credentials, no PII of others
trust_boundaries:
  - internet -> reverse proxy
  - reverse proxy -> app container
  - app container -> database

threats:
  - id: T1
    stride: spoofing
    description: attacker authenticates as me with a stolen or guessed password
    likelihood: medium
    impact: high
    mitigation: passkey or TOTP second factor, rate limit on login, alert on
      new device
    status: implemented

  - id: T2
    stride: elevation_of_privilege
    description: container escape from app to host
    likelihood: low
    impact: high
    mitigation: rootless runtime, no privileged flag, read only root filesystem,
      dedicated host user, service on its own VLAN
    status: partial

  - id: T3
    stride: repudiation
    description: no record of admin actions, cannot reconstruct an incident
    likelihood: high
    impact: medium
    mitigation: ship application and proxy logs off host to central collector
      with append only retention
    status: implemented

accepted_risks:
  - id: T4
    description: sophisticated targeted attacker with a browser zero day
    reason: out of scope for the value of this asset
```

The `accepted_risks` section is not a cop out, it is the most useful part.
Writing down what you are choosing not to defend against is what makes the rest
of the document a decision rather than a wish list.

## Ranking without pretending to be precise

Do not build a numeric risk score with two decimal places. You do not have the
data. What works is a coarse likelihood by impact grid, high, medium, low on
each axis, and then handle the high by high cells first.

The one adjustment I make is to weight blast radius heavily. A low value service
that shares credentials with, or sits on the same flat network as, something
important is not a low risk service. It is a pivot point. Modeling each service
in isolation is the classic mistake, and it is why segmentation and unique
credentials per service pay off more than almost any individual hardening
setting.

This is also the practical core of zero trust as a design principle: stop
treating network location as authentication, and make every hop prove itself.
You do not need a product to apply that idea, you need to stop assuming the
inside of your network is friendly.

## Did we do a good enough job

The last question is the one people skip. Two cheap checks close the loop.

Test the mitigation, not the intention. If the mitigation is "container cannot
reach the management VLAN," open a shell in the container and try to reach the
management VLAN. If the mitigation is "logs are shipped off host," delete a log
locally and confirm the copy survived.

Then set a revisit trigger. Mine is: any time a service gains a new inbound
path, a new data type, or a new integration, the model gets reread. Not on a
calendar, on a change. Calendars get ignored, changes are when the model
actually becomes wrong.

A threat model that lives in a file next to the code and gets edited when the
code changes is worth ten polished ones that were written once for a class
assignment and never opened again.

## References

- [OWASP threat modeling](https://owasp.org/www-community/Threat_Modeling)
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [Microsoft threat modeling: STRIDE categories](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
