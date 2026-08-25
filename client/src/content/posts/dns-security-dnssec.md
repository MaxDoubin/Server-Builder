
## Why DNS security matters

You typed the right domain name and landed on the wrong server. The connection completes, nothing looks unusual, and the only sign anything went wrong is a certificate warning you might click through. That is what a successful DNS attack looks like from the inside.

DNS translates domain names to IP addresses. If an attacker can manipulate DNS responses, they can redirect traffic to malicious servers, intercept credentials, or block legitimate services entirely. DNS cache poisoning, DNS hijacking, and DNS-based data exfiltration are all real attack categories.

## The threat model, concretely

There are three distinct positions an attacker can occupy, and they call for different defences.

**On-path.** The attacker sits between you and your resolver: the coffee shop access point, a compromised switch, a hostile ISP. Classic DNS is plaintext UDP with no authentication, so they can read your queries and forge replies. Whoever answers first wins.

**Off-path.** The attacker cannot see your traffic but can guess at it. A DNS response is matched to its query by the 16-bit transaction ID, the source port, and the question itself. Flood a resolver with guesses while a real query is outstanding and you can occasionally land a forgery, which then poisons the cache for every client behind it. This is the Kaminsky class of attack. The mitigations that followed are source port randomisation, query name case randomisation (often called 0x20 encoding), and DNS cookies.

**Authoritative side.** Nobody attacks the packets at all. They compromise the registrar account or the zone file and change the record at the source. No amount of transport encryption helps here, which is worth remembering when someone tells you encrypted DNS solves DNS security.

## DNSSEC

DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records. When a resolver queries a DNSSEC-enabled zone, it verifies that the response is signed by the correct key. This prevents an attacker from injecting fake responses.

DNSSEC creates a chain of trust from the root zone down to individual domains. Each level signs the next level's keys. If you are querying `example.com`, the resolver verifies the `com` zone's signature on the `example.com` key, and the root zone's signature on `com`.

Underneath, four record types do the work:

- **DNSKEY** holds a zone's public keys. Most zones run two: a zone signing key (ZSK) that signs the ordinary records, and a key signing key (KSK) that signs the DNSKEY set itself. Splitting them lets you roll the ZSK often without touching the parent.
- **RRSIG** is the signature over a set of records. Every signed record set has one, and each RRSIG carries an inception time and an expiration time.
- **DS** lives in the *parent* zone and is a hash of the child's KSK. This is the link in the chain. `com` publishes a DS for `example.com`, and the root publishes a DS for `com`.
- **NSEC** or **NSEC3** proves that a name does not exist, by signing the gap between two names that do. Without it, an attacker could strip a real answer and pass the empty response off as a signed "no such name". NSEC3 hashes the names so the zone cannot be enumerated by walking it.

The chain terminates at the root zone's key signing key, which is the one key a validating resolver has to trust out of band. It ships with the resolver software and is published by IANA as the root trust anchor. Everything else is verified rather than trusted.

Two things DNSSEC does not do, and people constantly assume it does. It provides no confidentiality: a signed response is still plaintext and still readable by anyone on the path. And it says nothing about whether a domain is trustworthy. A phishing domain can be perfectly DNSSEC signed. DNSSEC guarantees that the answer you got is the answer the zone owner published, and that is all it guarantees.

## Checking that validation is actually happening

To verify DNSSEC is working:
```bash
dig +dnssec example.com
# Look for the AD (Authenticated Data) flag in the response
```

A validated response looks like this in the header:

```
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 19204
;; flags: qr rd ra ad; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1
```

The `ad` in the flags is the whole point: the resolver that answered you validated the chain and it checked out. You will also see an RRSIG alongside the A record, which is the signature itself. Note where validation happened: at the recursive resolver, not on your machine. The flag is a claim made over an unauthenticated link, so it is worth exactly as much as your trust in that resolver and the path to it. That is the gap DoT and DoH close.

You can also see the failure case deliberately. A validating resolver returns `SERVFAIL` for a zone with broken signatures, and no answer at all, which is why DNSSEC failures present as "the domain does not work" rather than as a warning. To find out whether a `SERVFAIL` is a signing problem, ask again with checking disabled:

```bash
dig +cd example.com
```

`+cd` tells the resolver to skip validation. If the query fails normally and succeeds with `+cd`, you have a DNSSEC problem, not a connectivity problem. That single comparison is the fastest triage step there is.

To walk the chain yourself and see exactly where it breaks, `delv +vtrace example.com` prints each validation step, and `dig DS example.com` shows what the parent zone publishes about the child.

## DNS over HTTPS (DoH) and DNS over TLS (DoT)

Traditional DNS queries are sent in plaintext. Anyone on the network path can see what domains you are resolving. DoH and DoT encrypt DNS queries:

- **DoT (RFC 7858):** DNS over TLS on port 853. Easy to block if an organization needs to inspect or filter DNS.
- **DoH (RFC 8484):** DNS over HTTPS on port 443. Looks like regular web traffic, harder to block.

Both improve privacy by preventing passive observation of DNS queries. In enterprise environments, DoT is often preferred because it is easier to manage at the network level.

The useful way to think about these alongside DNSSEC: DNSSEC authenticates the *data*, end to end from the zone owner. DoT and DoH authenticate and encrypt the *channel* between your stub resolver and one chosen upstream. Neither replaces the other. DNSSEC without encrypted transport leaks every name you look up. Encrypted transport without DNSSEC securely delivers whatever your resolver decided to tell you.

Both also carry an operational cost plain DNS does not: TLS needs a working clock and trust store on the client. A machine whose time is badly wrong cannot complete the handshake, and if it also needs DNS to reach an NTP server by hostname, you have built a deadlock that only a hardcoded IP address breaks.

## DNS filtering

DNS-layer filtering blocks connections to known-malicious domains before a TCP connection is even attempted. Tools like Pi-hole block ad and tracking domains. Enterprise platforms like Cisco Umbrella provide threat intelligence and policy-based filtering.

Implementing DNS filtering is one of the highest-value, lowest-cost security controls you can deploy. Block domains associated with malware command-and-control, phishing, and known-bad infrastructure at the DNS layer and you stop a significant portion of threats before they get started.

It is also the control most likely to be quietly bypassed, and the reason is DoH. A browser using its own DoH resolver does not ask your network's DNS server anything. Your filtering, your split DNS, and your query logs all stop applying to it, and nothing tells you it happened. Decide explicitly how to handle that: block the known resolver endpoints, publish the canary domain that signals network DNS policy is in force, or run your own DoH endpoint so encrypted DNS still lands on your filter.

The other thing worth logging is query volume per client. DNS tunnelling, where data is exfiltrated inside the labels of queries to a domain the attacker controls, does not look unusual in any single query. It looks unusual as a rate: one host making thousands of unique subdomain lookups against one parent domain, with long random-looking labels. Alert on that shape, not on individual names.

## What breaks

**Expired signatures.** RRSIG records have a hard expiration timestamp. When one passes, the zone does not degrade gracefully, it becomes `SERVFAIL` for every validating resolver on the internet while working perfectly for non-validating ones. That split is why the outage reports are so confusing: half your users are fine and half cannot reach you at all. Automate re-signing and monitor RRSIG expiration as a metric.

**A KSK rollover that forgets the parent.** Generate a new key signing key, sign the zone with it, and if you have not updated the DS record at your registrar, the chain from parent to child breaks and the zone goes dark. The correct order: publish the new DNSKEY, wait out the old TTLs, update the DS at the parent, wait again, then retire the old key. There is no way to rush it, because the wait is other people's caches.

**Firewalls that drop large DNS responses.** Signed responses are much bigger than unsigned ones and often exceed the classic 512 byte UDP payload limit. If a middlebox blocks TCP port 53, or drops fragmented UDP, or strips EDNS(0), you get intermittent resolution failures for signed zones only. Isolate it by forcing each path in turn: `dig +dnssec +bufsize=1232` to shrink the response, and `dig +tcp` to prove TCP works at all.

**Trusting the AD flag from a stub resolver.** Your application sees `ad` and concludes the answer was validated. What it actually knows is that some resolver claimed so, over a plaintext link that an on-path attacker can rewrite, flag and all. Either validate locally on the host, or reach a resolver you trust over DoT or DoH, and treat the flag as meaningless otherwise.

**Clock skew on the validator.** Signature validity is checked against the resolver's own clock. A resolver whose time is hours off rejects perfectly valid signatures as not yet valid or already expired, for every signed zone at once. If DNSSEC breaks everywhere simultaneously, check NTP first.

## References

- https://www.rfc-editor.org/rfc/rfc4033
- https://www.rfc-editor.org/rfc/rfc4034
- https://www.rfc-editor.org/rfc/rfc4035
- https://www.rfc-editor.org/rfc/rfc7858
- https://www.rfc-editor.org/rfc/rfc8484
- https://www.iana.org/dnssec/files
