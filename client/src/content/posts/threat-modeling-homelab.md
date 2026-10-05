
## Why Bother When It Is Just a Lab

The objection I hear is that a home lab is not a target worth modeling. That is wrong in two ways.

First, a lot of attacks are not targeted at all. Automated scanning finds an exposed service, tries known credentials, and moves on. Nobody chose you, and that makes no difference to the outcome.

Second, and more importantly for me, the lab is where I practice the reasoning. Threat modeling is a skill you build by doing it repeatedly on systems you fully understand. Doing it on my own infrastructure, where I know every design decision because I made it, is far more instructive than doing it on a case study.

A threat model is really just four questions. What am I working on, and what in it is worth protecting. What can go wrong, and who or what would make it go wrong. What am I going to do about it. Did I do a good enough job. Everything else is structure to keep you honest.

The order matters more than the formality. Most people skip straight to the third question, buy a security product, and never establish what they were defending or from whom. That is how you end up with a next generation firewall guarding a flat network where every device can reach every other device.

## Draw the Trust Boundaries First

Before enumerating threats, draw the system. Not a network diagram with every cable, but a data flow diagram showing where data goes and where it crosses from one level of trust to another.

Four kinds of element are enough: external entities you do not control, processes, data stores, and data flows. Draw each flow as an arrow with a direction, labeled with what travels over it and by which protocol. Direction is what tells you whether a firewall rule is meaningful or theater, and an arrow you cannot label is a part of your own system you do not understand yet.

The boundaries are the interesting part. A boundary is any place where data or a request moves between zones that trust each other differently: the internet reaching your edge, a guest network reaching an internal service, a container reaching the host, a user reaching an admin interface, a backup leaving the building.

Almost every real vulnerability lives on a boundary. Data that stays entirely inside one trust zone is rarely where the interesting failure is. So enumerate boundaries carefully, and for each one write down what is supposed to be allowed across it. That statement of intent becomes the thing you test against later. Then ask of every crossing what the receiving side assumes about the data, and what happens if that assumption is false.

Three boundaries people consistently miss. The management plane, meaning out of band controllers, hypervisor consoles, and the admin pages on switches, cameras and printers, is a trust boundary with enormous power behind it and it deserves to be modeled explicitly. Backups are a boundary in both directions: data leaves, and restore paths let data back in. And anything a third party can reach into: a vendor cloud that phones home, a remote support agent, a device holding an outbound tunnel open to its manufacturer.

## STRIDE as a Checklist, Not a Religion

STRIDE is a mnemonic for six categories of threat, each the violation of the security property in parentheses. Walk each element and each boundary crossing, not the network as a whole, and ask the six questions.

**Spoofing** (authentication). Can something claim to be something it is not? Unauthenticated services, reused credentials, and any protocol without mutual authentication.

**Tampering** (integrity). Can data or configuration be modified in transit or at rest? Unencrypted management traffic, writable shares, unsigned firmware.

**Repudiation** (non-repudiation). Could an action happen with no record? Missing or local only logs, shared accounts with no attribution.

**Information disclosure** (confidentiality). Can data leak? Overly broad shares, verbose errors, snapshots and backups with weaker access control than the source.

**Denial of service** (availability). Can availability be destroyed? Resource exhaustion, a single point of failure, a filled disk.

**Elevation of privilege** (authorization). Can a low privilege position become a high privilege one? Flat networks, over privileged service accounts, containers running as root with the host filesystem mounted.

The value is not that these categories are profound. It is that walking a fixed list stops you thinking only about the attacks you already find interesting. Left to instinct, most people model exactly one category and call it done.

Write each threat you find as a specific chain: the asset, the entry point, and the impact. "Guest laptop gets malware, guest network can reach the management VLAN, attacker reaches the hypervisor console, every virtual machine is compromised" is a threat. "Malware is bad" is not.

For personal infrastructure I add a seventh question that no framework lists: what happens when I am the threat. A fat fingered command, a test firewall rule never removed, a credential committed to a repository, a backup that has never been restored. For anything not exposed to the internet, self inflicted incidents realistically outnumber attacks, and the mitigations are cheap.

I keep the output as a plain file in version control, next to the configuration it describes, because a threat model that is not written down is just a mood.

```yaml
# threat-model.yaml
asset: internal-services
boundaries:
  - name: guest-vlan -> services-vlan
    intent: "HTTP/HTTPS to one reverse proxy address only. Nothing else."
  - name: backup-media -> outside the lab
    intent: "Encrypted data only. Useless without the key."
threats:
  - id: TM-01
    boundary: guest-vlan -> services-vlan
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
    last_verified: 2026-06-20
    status: implemented
  - id: TM-02
    boundary: backup-media -> outside the lab
    category: information-disclosure
    scenario: Backup media readable if physically removed.
    likelihood: low
    impact: high
    controls: [encryption at rest on backup targets]
    verification: Attempt to mount a backup volume on an unrelated host.
    status: implemented
  - id: TM-03
    category: elevation-of-privilege
    scenario: Targeted attacker with a browser zero day on the admin workstation.
    likelihood: low
    impact: high
    status: accepted
    reason: Out of scope for the value of these assets.
    revisit: If any service here starts holding other people's data.
```

The `verification` field is the one that makes this document worth maintaining. A control you have never tested is an assumption, and assumptions are what threat modeling exists to eliminate.

## Rank by Consequence, Not Cleverness

The temptation is to prioritize the most interesting attacks. Resist it. Rank by likelihood times impact, and be honest about likelihood.

A sophisticated attack requiring physical access and specialized equipment is fascinating and, for most labs, close to irrelevant. An exposed management interface with a default password is boring and is how systems actually get taken.

Impact deserves the same honesty. In a lab, most compromises cost time. A few cost data that is genuinely hard to recreate, or provide a foothold into something that matters more. Those are the ones worth real investment, and identifying them means asking what a compromise of each asset would let someone reach next. Lateral movement potential is often a bigger deal than the value of the asset itself, which is the entire argument for segmentation. A low value service that shares credentials or a flat network with something important is a pivot point: score it by what it can reach, not by what it holds.

Keep the scoring coarse: high, medium, or low on each axis. A numeric score with two decimal places is precision you invented. Work outward from the high by high corner, and let the corners set the action:

- **High impact, likely:** fix it this week. That default password lives here.
- **High impact, unlikely:** mitigate and document it, or put an expensive fix on a written fix later list.
- **Low impact, likely:** fix it if the fix is cheap.
- **Low impact, unlikely:** write it down and explicitly accept it.

## Turning the Model Into Controls

A threat model that does not change the system is an essay. Each identified threat should produce one of four outcomes, recorded explicitly: mitigate with a control, eliminate by removing the feature, transfer by moving the risk elsewhere, or accept with a documented reason.

When you mitigate, prefer structural controls to detective ones: segmentation that makes a path impossible beats an alert telling you the path was used. On a small network the highest value moves are boring ones. Management interfaces on a segment ordinary devices cannot route to. Guests and consumer gear that phones home on their own internet only segment. Remote administration off on the internet facing device. Unique credentials (a password manager) and multi factor authentication on anything exposed. Backups an attacker holding your credentials cannot delete: the control that turns a catastrophe into a bad weekend.

Accepting risk is legitimate. Writing down that you accepted it, and why, is what separates a decision from an oversight. TM-03 above is the shape: a reason, and the condition that reopens it. When something goes wrong later, the model tells you whether you missed it or chose it, and those demand very different responses.

## Test the Deny, Not the Allow

The fourth question is the one people skip. Every control needs a test you can run and a date you last ran it. For network controls the tests are short:

```bash
# From the guest VLAN, prove the management network is unreachable
nmap -Pn -p 22,80,443,8006 10.90.0.0/24 --open

# From outside your network, confirm nothing unexpected answers on the edge
nmap -Pn -sT -p- --open <external-address>

# What is actually listening on this host?
ss -tulpn
```

Run each one from the segment the threat model says should be blocked, not from your admin machine where everything works. For the edge, that means from outside your network entirely. And only scan networks you own or have written permission to test.

The same rule applies beyond the network: test the mitigation, not the intention. If the mitigation is "logs are shipped off host," delete a log locally and confirm the copy survived. A mitigation that exists only in the file is worse than none, because it stops you worrying about a threat that is still live.

Then revisit the model when the system changes. Every new service, segment, external exposure, integration, or kind of data invalidates part of it. I rerun it whenever I add something that crosses a boundary, and reread all of it whenever the network layout changes, which is far cheaper than an annual review that has to reconstruct six months of changes from memory.

## The Habit Worth Building

Threat modeling has made me a better builder, not just a better defender. Once you have asked "what happens when this control fails" enough times, you start designing so that a single failure is survivable. Segmentation, least privilege, and defense in depth stop being vocabulary and become the obvious way to build. So does the practical core of zero trust, which needs no product: stop treating network location as authentication, and make every hop prove itself.

## References

- [OWASP: threat modeling](https://owasp.org/www-community/Threat_Modeling)
- [OWASP threat modeling cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [STRIDE model](https://en.wikipedia.org/wiki/STRIDE_model)
- [Microsoft threat modeling: STRIDE categories](https://learn.microsoft.com/en-us/azure/security/develop/threat-modeling-tool-threats)
- [Threat model](https://en.wikipedia.org/wiki/Threat_model)
- [NIST SP 800-30 Rev. 1: Guide for Conducting Risk Assessments](https://csrc.nist.gov/pubs/sp/800/30/r1/final)
- [NIST SP 800-207: Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [Nmap reference guide](https://nmap.org/book/man.html)
