
## Why DNS Security Matters

DNS translates domain names to IP addresses. If an attacker can manipulate DNS responses, they can redirect traffic to malicious servers, intercept credentials, or block legitimate services entirely. DNS cache poisoning, DNS hijacking, and DNS-based data exfiltration are all real attack categories.

The reason cache poisoning was ever practical is worth understanding. Classic DNS runs over UDP with no session state, so a resolver matches a response to its question using only the 16-bit query ID, the source port, and the question itself. Get those right before the real server answers and the resolver believes you. The response to the 2008 Kaminsky attack, described in RFC 5452, was source port randomisation, which pushes the attacker's guessing space from 16 bits to roughly 32. That is a mitigation, not a fix. DNSSEC is the fix.

## DNSSEC

DNSSEC (DNS Security Extensions) adds cryptographic signatures to DNS records. When a resolver queries a DNSSEC-enabled zone, it verifies that the response is signed by the correct key. This prevents an attacker from injecting fake responses.

DNSSEC creates a chain of trust from the root zone down to individual domains. Each level signs the next level's keys. If you are querying `example.com`, the resolver verifies the `com` zone's signature on the `example.com` key, and the root zone's signature on `com`.

Four record types carry the whole scheme. **DNSKEY** holds a zone's public keys. **RRSIG** holds a signature over a record set, together with the inception and expiration times of that signature. **DS** lives in the *parent* zone and is a hash of the child's key, which is the link in the chain. **NSEC** or **NSEC3** proves that a name genuinely does not exist, so an attacker cannot forge a denial.

In practice zones use two keys. The key signing key (KSK) signs only the DNSKEY record set, and the DS record in the parent is a hash of it. The zone signing key (ZSK) signs everything else. The split exists because updating the DS record in the parent requires talking to your registrar, which is slow and manual, so you keep the KSK stable for a year or more and rotate the shorter ZSK on your own schedule. RFC 7344 defines CDS and CDNSKEY records, which let a child publish the DS it wants and have a cooperating parent pick it up automatically. Use that if your registrar supports it, because manual DS updates are where rollovers go wrong.

To verify DNSSEC is working:
```bash
dig +dnssec example.com
# Look for the AD (Authenticated Data) flag in the response
```

Read that flag carefully, because this is the detail beginners get wrong. The AD bit means *the resolver you asked* says it validated the answer. It says nothing about the path between you and that resolver, which is plain UDP that anyone on the way can rewrite, AD bit and all. Seeing AD only tells you something if you trust the resolver and the channel to it. If you want to validate locally, run a validating resolver on the machine or use `delv`, which does the chain verification itself rather than taking a flag's word for it.

## What Breaks

**Expired signatures.** Every RRSIG carries an expiry timestamp, commonly 30 days out with re-signing every week or two. If the signing automation stops, nothing appears wrong for weeks and then the entire zone goes dark for every validating resolver on the internet, all at once. This is not a degradation, it is a total outage, and it is the single largest operational risk DNSSEC introduces. Monitor the time remaining on your RRSIGs as a first-class alert, with a threshold measured in days, not hours.

**A DS record that no longer matches.** After a KSK rollover, the parent's DS still hashes the old key while the zone publishes the new one. The chain is broken and the zone is unreachable through every validating resolver, while continuing to work perfectly for anyone who is not validating. Do rollovers by publishing both keys, waiting out the parent's DS TTL plus a margin, and only then withdrawing the old one.

**The symptom is always SERVFAIL.** A validation failure does not return a helpful error, it returns SERVFAIL, which looks identical to the server being down. The one-command diagnosis is `dig +cd example.com`, where `+cd` sets checking disabled and tells the resolver to skip validation. If it answers with `+cd` and SERVFAILs without, the problem is DNSSEC and not the network.

**Clock skew.** Signature validity is a comparison against the system clock. A resolver whose time is wrong by more than the signature's validity margin rejects perfectly good signatures. Worse, there is a bootstrapping trap: if your NTP servers are configured by hostname, a machine with a bad clock cannot resolve them to fix the clock. Configure at least one time source by IP address on validating resolvers.

**Responses that no longer fit.** Signatures make responses large, which is why DNSSEC needs EDNS0 (RFC 6891) to negotiate a UDP payload beyond the original 512-byte limit. Advertise too large a buffer and the reply gets IP-fragmented, and middleboxes drop fragments, giving intermittent timeouts on exactly the largest responses. The DNS Flag Day 2020 recommendation is to advertise 1232 bytes and let truncation push the query to TCP. RFC 7766 makes TCP support mandatory, but firewall rules written in 2005 often disagree, so check that port 53 is open on TCP too.

**Zone enumeration.** NSEC proves a name does not exist by pointing at the next name that does, so walking the chain dumps every name in the zone. NSEC3 hashes the names instead, but they are still crackable offline for anything short or dictionary-based, and the iteration count meant to slow that down mostly just costs resolver CPU. RFC 9276 now recommends zero extra iterations and an empty salt. If hiding hostnames is the goal, DNSSEC is the wrong tool.

**Algorithm choice.** RFC 8624 sets out what to implement. In practice, use algorithm 13 (ECDSA P-256 with SHA-256) rather than algorithm 8 (RSA with SHA-256) for a new zone. The signatures are 64 bytes instead of 256 for a 2048-bit RSA key, which meaningfully reduces response size and the fragmentation problem above. Anything based on SHA-1, algorithms 5 and 7, is deprecated and should be rolled off.

## What DNSSEC Does Not Do

DNSSEC provides origin authentication and integrity. It does not provide confidentiality. Every query and every signed answer is still sent in the clear, so an observer learns exactly what you are looking up. It does not tell you whether the address you got back belongs to a good actor, only that the zone's owner really published it: a phishing domain can be perfectly signed. It does nothing about denial of service against the name servers themselves, and it makes DNS a slightly better amplification reflector, since DNSKEY responses are large. That is part of why RFC 8482 replaced sprawling ANY responses with a minimal synthesised answer, and why authoritative servers run response rate limiting.

It also stops at the resolver unless you extend it. The last hop from your machine to the resolver is unprotected by DNSSEC, which is what the next section is for.

## DNS over HTTPS (DoH) and DNS over TLS (DoT)

Traditional DNS queries are sent in plaintext. Anyone on the network path can see what domains you are resolving. DoH and DoT encrypt DNS queries:

- **DoT (RFC 7858):** DNS over TLS on port 853. Easy to block if an organization needs to inspect or filter DNS.
- **DoH (RFC 8484):** DNS over HTTPS on port 443. Looks like regular web traffic, harder to block.

Both improve privacy by preventing passive observation of DNS queries. In enterprise environments, DoT is often preferred because it is easier to manage at the network level.

There is now a third, DNS over QUIC on port 853 (RFC 9250), which gets DoT's properties without TCP head-of-line blocking. And there are two very different security postures available, set out in RFC 8310: opportunistic privacy, which encrypts if it can and silently falls back to plaintext if it cannot, and strict privacy, which authenticates the resolver's certificate and fails closed. Opportunistic mode protects you against a passive eavesdropper and not against an active one, since anyone who can block port 853 can force the fallback. If encryption is a requirement rather than a nicety, configure strict mode and accept that resolution breaks when the resolver is unreachable.

Understand what these protocols authenticate. DoT and DoH secure the channel to the resolver and prove you are talking to the resolver you meant. They say nothing about whether the resolver is telling the truth. DNSSEC secures the data regardless of who hands it to you. They solve different halves of the problem and the complete answer is both.

The operational surprise with DoH is that applications turn it on without asking the network. A browser using DoH bypasses your DHCP-supplied resolver entirely, which breaks split-horizon DNS for internal names and silently defeats DNS-layer filtering. Firefox checks a canary domain, `use-application-dns.net`, and disables its DoH if a network answers NXDOMAIN for it. That canary is a convention, not a guarantee, and other clients ignore it.

## DNS Filtering

DNS-layer filtering blocks connections to known-malicious domains before a TCP connection is even attempted. Tools like Pi-hole block ad and tracking domains. Enterprise platforms like Cisco Umbrella provide threat intelligence and policy-based filtering.

Implementing DNS filtering is one of the highest-value, lowest-cost security controls you can deploy. Block domains associated with malware command-and-control, phishing, and known-bad infrastructure at the DNS layer and you stop a significant portion of threats before they get started.

Be clear-eyed about the ways around it. Malware that connects to a hardcoded IP address never asks a question you can block. Devices with a hardcoded resolver, which is common in IoT and consumer streaming hardware, ignore whatever you handed out over DHCP, and the usual answer is a NAT rule that redirects outbound port 53 to your own resolver. Neither of those helps against DoH, which is why filtering deployments increasingly need to block known DoH endpoints as well.

There is also a direct conflict between filtering and validation, and it is worth knowing before you hit it. Filtering works by lying: returning NXDOMAIN or a sinkhole address for a name that really exists. If that name is in a DNSSEC-signed zone and the client validates for itself, the lie fails validation and the client gets SERVFAIL instead of a clean block. Between a resolver that both filters and validates and a client that trusts it, this works fine. The moment a validating stub or a DoH-enabled browser is in the picture, the block turns into an unexplained failure.

## References

- https://www.rfc-editor.org/rfc/rfc9364
- https://www.rfc-editor.org/rfc/rfc4033
- https://www.rfc-editor.org/rfc/rfc5155
- https://www.rfc-editor.org/rfc/rfc7858
- https://www.rfc-editor.org/rfc/rfc8484
- https://man.archlinux.org/man/dig.1
