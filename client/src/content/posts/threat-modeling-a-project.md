
## Four questions

Every threat modeling framework I have read boils down to the same four questions:

1. What are we building?
2. What can go wrong?
3. What are we going to do about it?
4. Did we do a good job?

Everything else is scaffolding to help you answer those honestly. You do not need a tool, a license, or a two day workshop. You need a drawing and about an hour.

## Question one: draw the data flow

Not an architecture diagram. A data flow diagram. The difference matters: an architecture diagram shows boxes you own, a data flow diagram shows data moving between them, and attacks happen to data in motion and at rest.

Draw four kinds of thing:

- **External entities**: users, third party APIs, anything you do not control.
- **Processes**: your services, your scripts, your jobs.
- **Data stores**: databases, object storage, log files, that config file with the token in it.
- **Data flows**: arrows, labeled with what is actually traveling and over what protocol.

If you cannot label an arrow, you do not understand your own system yet. That discovery alone justifies the exercise.

## Question two: trust boundaries and the STRIDE prompt list

A trust boundary is any line where data crosses from something you trust less to something you trust more. Browser to server. Internet to DMZ. DMZ to internal VLAN. Unprivileged process to privileged daemon. Third party API response into your parser.

Draw those boundaries on the diagram as dashed lines. Now here is the useful part: almost every interesting vulnerability lives on a boundary crossing. If you are short on time, ignore everything else and interrogate the crossings.

For each crossing ask: what does the receiving side assume about this data, and what happens if that assumption is false?

Then walk the crossing through STRIDE, which is a mnemonic for six categories of thing that go wrong. I use it as a checklist against each element of the diagram, not as a taxonomy to argue about.

- **Spoofing**: can someone claim to be someone else? (authentication)
- **Tampering**: can data be modified in flight or at rest? (integrity)
- **Repudiation**: can someone deny doing it? (logging)
- **Information disclosure**: can data leak? (confidentiality)
- **Denial of service**: can someone make it unavailable? (availability)
- **Elevation of privilege**: can someone do more than they should? (authorization)

Walk each box and arrow and ask all six. Most will not apply. The ones that do will surprise you, and it takes ten minutes.

## Question three: rank by loss, not by cleverness

New security students, myself very much included at the start, rank threats by how cool the attack is. That is backwards. Rank by what you actually lose.

I score two axes crudely: impact if it happens, and how hard it is to pull off. High impact and easy gets fixed now. High impact and hard gets a documented mitigation and a note. Low impact and easy gets fixed if it is cheap. Low impact and hard gets written down and explicitly accepted.

That last category matters. Writing "we accept this risk, here is why" is a legitimate outcome. Silently ignoring it is not.

## Write it down where it will be read

I keep the model in the repo, next to the code, in version control. It changes when the code changes, and the diff shows up in review.

```yaml
# threat-model.yml
system: internal metrics dashboard
last_reviewed: 2026-05-19

boundaries:
  - name: internet-to-dmz
    from: untrusted browser
    to: reverse proxy
  - name: app-to-db
    from: dashboard service
    to: metrics database

threats:
  - id: T-001
    boundary: internet-to-dmz
    category: spoofing
    description: >
      Session cookie is accepted without binding to any client property,
      so a stolen cookie is a full account takeover.
    impact: high
    difficulty: low
    status: mitigated
    mitigation: >
      Short session lifetime, Secure and HttpOnly and SameSite=Lax flags,
      rotation on privilege change.

  - id: T-002
    boundary: app-to-db
    category: elevation_of_privilege
    description: >
      Dashboard service connects with a database account that can write
      and drop tables, but the dashboard only ever reads.
    impact: high
    difficulty: medium
    status: mitigated
    mitigation: read-only database role, verified in CI

  - id: T-003
    boundary: internet-to-dmz
    category: denial_of_service
    description: Expensive aggregate query reachable with no rate limit.
    impact: medium
    difficulty: low
    status: accepted
    rationale: >
      Internal-only exposure behind VPN, query timeout capped at 5s.
      Revisit if this is ever published externally.
```

## Question four: did we do a good job?

Check two things later. Did the mitigations actually get built, and do they actually work? A mitigation listed in a YAML file and never implemented is worse than no mitigation, because it stops you from worrying about a threat that is still live.

The version I run on a school project takes under an hour and it consistently finds one thing I would otherwise have shipped. That is a good return on an hour.

## References

- [OWASP Threat Modeling](https://owasp.org/www-community/Threat_Modeling)
- [OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [Threat model on Wikipedia](https://en.wikipedia.org/wiki/Threat_model)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
