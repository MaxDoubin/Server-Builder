
## Four questions, in order

Threat modeling has a reputation for being a heavyweight enterprise process with diagrams nobody reads. Stripped down, it is four questions, and they work just as well on a home network as on a product.

What are we building? What can go wrong? What are we going to do about it? Did we do a good job?

The order matters more than the formality. Most people skip straight to the third question, buy a security product, and never establish what they were defending or from whom. That is how you end up with a next generation firewall guarding a flat network where every device can reach every other device.

## Question one: what are we building

Draw it. Not a pretty diagram, a napkin one, but it has to be accurate, which usually means discovering two or three things you had forgotten were connected.

The elements worth capturing are the ones that matter for security decisions: what data exists and where it lives, which systems are reachable from the internet, where the boundaries between zones sit, and how someone authenticates to each part. For a home or small office network that is typically an internet edge, a set of internal segments, some remote access path, and a handful of things that hold data you would actually miss.

Two categories always get missed. The first is management interfaces: switch and router web UIs, out of band controllers, hypervisor consoles, camera and printer admin pages. They are frequently the weakest software on the network and the most valuable to an attacker. The second is anything a third party can reach into: a vendor cloud that phones home, a remote support agent, a device that maintains an outbound tunnel to a manufacturer.

Write down data flows as arrows with a direction. Direction is what tells you whether a firewall rule is meaningful or theater.

## Question two: what can go wrong

Now walk the diagram and be specific. Vague worry produces vague controls. STRIDE is a useful prompt because it forces you through categories you would not think of unaided: spoofing, tampering, repudiation, information disclosure, denial of service, elevation of privilege. Apply it per element, not to the network as a whole.

For each item, name the asset, the entry point, and the impact. "Guest laptop gets malware, guest network can reach the management VLAN, attacker reaches the hypervisor console, all virtual machines compromised" is a threat. "Malware is bad" is not.

I keep it in a plain table in the repository where I keep everything else, because a threat model that lives in someone's head is not a threat model.

```yaml
- id: T-004
  asset: hypervisor management interface
  entry: any host on the general user VLAN
  threat: credential stuffing or unpatched management UI exploit
  impact: full control of all guests and their storage
  likelihood: medium
  mitigation:
    - management VLAN reachable only from an admin jump host
    - unique credentials with multi factor where supported
    - management interfaces excluded from any general purpose route
  status: partial
  verified: 2026-06-20
```

The `verified` field is doing real work. A mitigation you have not tested since you wrote it down is an assumption.

## Question three: what are we going to do

Now, and only now, controls. Order them by the impact and likelihood you just recorded, and prefer structural fixes over detective ones. Segmentation that makes a path impossible beats an alert telling you the path was used.

For a small network the highest value moves are usually the boring ones. Put management interfaces on a segment that ordinary devices cannot route to. Give untrusted devices, meaning guests and consumer gear that phones home, their own segment with internet access and nothing else. Turn off remote administration on the internet facing device. Use unique credentials everywhere, which really means use a password manager. Get multi factor authentication on anything exposed. Keep backups that an attacker holding your credentials cannot delete, which is the control that turns a catastrophe into a bad weekend.

Notice how few of those cost money. Threat modeling tends to produce configuration work rather than purchases, which is exactly why vendors are not the ones evangelizing it.

## Question four: did we do a good job

Verification is the step that separates a document from a practice. Every mitigation should have a test you can run and a date you last ran it.

```bash
# From the user VLAN, prove the management network is unreachable
nmap -Pn -p 22,80,443,8006 10.90.0.0/24 --open

# Confirm nothing unexpected is listening on the edge
nmap -Pn -sT -p- --open <external-address>

# What is actually listening on this host?
ss -tulpn
```

Run these from the segment the threat model says should be blocked, not from your admin machine where everything works. Test the deny, not the allow. And only scan networks you own or have written permission to test, which on your own equipment is easy and everywhere else is not optional.

## Why this is worth an evening

The exercise changes what you build. Once the diagram exists and the flows have directions, you stop adding services to whatever segment is convenient, because you can see the blast radius. It also translates directly to interviews and competition work, where the ability to reason about attack paths is worth more than knowing tool syntax.

Then set a reminder to revisit it every few months. Networks accumulate. The model has to keep up or it becomes fiction with a timestamp.

## References

- [OWASP threat modeling](https://owasp.org/www-community/Threat_Modeling)
- [STRIDE model](https://en.wikipedia.org/wiki/STRIDE_model)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [Nmap reference guide](https://nmap.org/book/man.html)
