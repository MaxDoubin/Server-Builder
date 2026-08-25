
## Why Bother When It Is Just a Lab

The objection I hear is that a home lab is not a target worth modelling. That is wrong in two ways.

First, a lot of attacks are not targeted at all. Automated scanning finds an exposed service, tries known credentials, and moves on. Nobody chose you, and that makes no difference to the outcome.

Second, and more importantly for me, the lab is where I practice the reasoning. Threat modelling is a skill you build by doing it repeatedly on systems you fully understand. Doing it on my own infrastructure, where I know every design decision because I made it, is far more instructive than doing it on a case study.

A threat model is really just four questions. What am I protecting. Who or what might come after it. What could go wrong. What am I going to do about it. Everything else is structure to keep you honest.

## Draw the Trust Boundaries First

Before enumerating threats, draw the system. Not a network diagram with every cable, but a data flow diagram showing where data goes and where it crosses from one level of trust to another.

The boundaries are the interesting part. A boundary is any place where data or a request moves between zones that trust each other differently: the internet reaching your edge, a guest network reaching an internal service, a container reaching the host, a user reaching an admin interface, a backup leaving the building.

Almost every real vulnerability lives on a boundary. Data that stays entirely inside one trust zone is rarely where the interesting failure is. So enumerate boundaries carefully, and for each one write down what is supposed to be allowed across it. That statement of intent becomes the thing you test against later.

Two boundaries people consistently miss. The management plane, meaning out of band controllers, hypervisor consoles, and switch admin interfaces, is a trust boundary with enormous power behind it and it deserves to be modelled explicitly. And backups are a boundary in both directions: data leaves, and restore paths let data back in.

## STRIDE as a Checklist, Not a Religion

STRIDE is a mnemonic for six categories of threat. Walk each boundary and ask the six questions.

**Spoofing.** Can something claim to be something it is not? Unauthenticated services, reused credentials, and any protocol without mutual authentication.

**Tampering.** Can data or configuration be modified in transit or at rest? Unencrypted management traffic, writable shares, unsigned firmware.

**Repudiation.** Could an action happen with no record? Missing or local only logs, shared accounts with no attribution.

**Information disclosure.** Can data leak? Overly broad shares, verbose errors, snapshots and backups with weaker access control than the source.

**Denial of service.** Can availability be destroyed? Resource exhaustion, a single point of failure, a filled disk.

**Elevation of privilege.** Can a low privilege position become a high privilege one? Flat networks, over privileged service accounts, containers running as root with the host filesystem mounted.

The value is not that these categories are profound. It is that walking a fixed list stops you thinking only about the attacks you already find interesting. Left to instinct, most people model exactly one category and call it done.

I keep the output as a plain file in version control, because a threat model that is not written down is just a mood.

```yaml
# threat-model.yaml
asset: internal-services
  boundary: guest-vlan -> services-vlan
  intent: "HTTP/HTTPS to one reverse proxy address only. Nothing else."
  threats:
    - id: TM-01
      category: elevation-of-privilege
      scenario: >
        A compromised device on the guest VLAN reaches a management
        interface because the inter-VLAN rule is broader than intended.
      likelihood: medium
      impact: high
      controls:
        - default-deny between VLANs, explicit allow per service
        - management interfaces on a separate VLAN with no guest path
      verification: >
        Quarterly: from a guest-VLAN host, scan the services range and
        confirm only the proxy port answers.
      status: implemented
    - id: TM-02
      category: information-disclosure
      scenario: Backup media readable if physically removed.
      likelihood: low
      impact: high
      controls: [encryption at rest on backup targets]
      verification: Attempt to mount a backup volume on an unrelated host.
      status: implemented
```

The `verification` field is the one that makes this document worth maintaining. A control you have never tested is an assumption, and assumptions are what threat modelling exists to eliminate.

## Rank by Consequence, Not Cleverness

The temptation is to prioritise the most interesting attacks. Resist it. Rank by likelihood times impact, and be honest about likelihood.

A sophisticated attack requiring physical access and specialised equipment is fascinating and, for most labs, close to irrelevant. An exposed management interface with a default password is boring and is how systems actually get taken.

Impact deserves the same honesty. In a lab, most compromises cost time. A few cost data that is genuinely hard to recreate, or provide a foothold into something that matters more. Those are the ones worth real investment, and identifying them means asking what a compromise of each asset would let someone reach next. Lateral movement potential is often a bigger deal than the value of the asset itself, which is the entire argument for segmentation.

## Turning the Model Into Controls

A threat model that does not change the system is an essay. Each identified threat should produce one of four outcomes, recorded explicitly: mitigate with a control, eliminate by removing the feature, transfer by moving the risk elsewhere, or accept with a documented reason.

Accepting risk is legitimate. Writing down that you accepted it, and why, is what separates a decision from an oversight. When something goes wrong later, the model tells you whether you missed it or chose it, and those demand very different responses.

Then revisit it when the system changes. Every new service, every new segment, every new external exposure invalidates part of the model. I re run it whenever I add something that crosses a boundary, which is far cheaper than an annual review that has to reconstruct six months of changes from memory.

## The Habit Worth Building

Threat modelling has made me a better builder, not just a better defender. Once you have asked "what happens when this control fails" enough times, you start designing so that a single failure is survivable. Segmentation, least privilege, and defence in depth stop being vocabulary and become the obvious way to build.

## References

- [OWASP: threat modeling](https://owasp.org/www-community/Threat_Modeling)
- [OWASP threat modeling cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [STRIDE model](https://en.wikipedia.org/wiki/STRIDE_model)
- [NIST SP 800-30 Rev. 1: Guide for Conducting Risk Assessments](https://csrc.nist.gov/pubs/sp/800/30/r1/final)
- [MITRE ATT&CK](https://attack.mitre.org/)
