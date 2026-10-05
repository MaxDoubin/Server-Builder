
## SMTP has no idea who you are

The original mail protocol lets any host connect to any other host and claim to be anyone. There is no authentication in the envelope and none in the message headers. Everything built since is a bolt on that tries to answer the question SMTP never asked: is this sender allowed to send as this domain?

Three mechanisms answer three different versions of that question, and confusing them is the source of most misconfiguration. Each one checks a different field, and knowing which field a receiver checked is most of the work when you are debugging a rejection.

## SPF answers: is this IP allowed to send for this domain

SPF is a DNS TXT record listing the hosts permitted to send mail for a domain. The receiver takes the domain from the SMTP envelope sender, the `MAIL FROM` address, looks up the record, and checks whether the connecting IP is in the list.

```dns
example.org.  IN  TXT  "v=spf1 mx include:_spf.provider.example ip4:203.0.113.10 -all"
```

The mechanisms evaluate left to right, first match wins. `-all` is a hard fail for anything else, `~all` is a soft fail meaning treat as suspicious, and `?all` is neutral, which is the same as publishing nothing useful. Publishing `~all` forever is common and mostly pointless: it tells receivers you are not confident in your own record.

Two limits matter. SPF has a hard limit of ten DNS lookups during evaluation. Every `include`, `a`, `mx`, `ptr`, and `exists` mechanism costs one, as does a `redirect` modifier, and lookups inside nested includes count against the same budget. Chain a few provider includes and you exceed it, at which point evaluation returns permerror and the whole thing fails in a way nobody notices until deliverability drops. Check your lookup count when you add an include. If you use several hosted senders, consolidate them or flatten includes into `ip4:` and `ip6:` ranges rather than chaining includes forever, knowing that a flattened record has to be updated whenever a provider's addresses change.

The second limit is fundamental: SPF validates the envelope sender, which is not what the recipient sees. The `From:` header can say anything. And SPF breaks on forwarding, because a forwarding server relays the message from its own IP, which is not in your record.

## DKIM answers: was this message modified in transit

DKIM signs the message. The sending server computes a signature over selected headers and the body using a private key, and attaches it as a header. The public key lives in DNS under a selector.

```dns
mail2026._domainkey.example.org.  IN  TXT  "v=DKIM1; k=rsa; p=MIIBIjANBgkq..."
```

```
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.org;
 s=mail2026; h=from:to:subject:date:message-id; bh=...; b=...
```

The `d=` tag is the signing domain and the `h=` tag lists which headers are covered. A receiver fetches `s=` plus `_domainkey` plus `d=` from DNS, verifies, and gets a cryptographic statement that this message body and those headers came from someone holding that domain's key.

Sign the headers that carry identity: From, which RFC 6376 requires, plus To, Subject, Date, Message-ID, and Reply-To. Signing headers that intermediate systems legitimately rewrite is a good way to generate mystery failures.

DKIM survives forwarding, which SPF does not, as long as nothing rewrites the signed content. Mailing lists that append a footer or rewrite the subject break the signature, which is a real and common problem rather than an edge case, and the reason lists usually re-sign messages as themselves.

Use a selector with a date or version in it so you can rotate keys by publishing a new selector, signing with it, and removing the old one after the last signed message has aged out.

## DMARC answers: what should I do, and tell me about it

DMARC is where the two combine into something enforceable. It does two things nothing else does.

First, **alignment**. DMARC requires that the domain validated by SPF or DKIM matches the domain in the `From:` header that a human actually sees. That is the gap the other two leave open. A message can pass SPF for `bounces.spammer.example` while displaying `From: billing@yourbank.example`, and without alignment nobody catches it. DMARC passes only if at least one mechanism both passes and aligns.

Second, **policy and reporting**.

```dns
_dmarc.example.org.  IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.org; fo=1; adkim=s; aspf=r; pct=100"
```

- `p=` is the policy: `none`, `quarantine`, or `reject`.
- `rua=` is where aggregate reports go, and this is the part people skip.
- `adkim` and `aspf` set alignment strictness. Relaxed allows a subdomain to align with the organizational domain, strict requires an exact match.

## Rolling it out without losing mail

The order matters, and rushing it is how you drop legitimate mail from a system nobody remembered.

1. **Publish SPF and DKIM first.** Sign everything, from every system that sends: the mail server, the ticketing system, the monitoring alerts, the thing in the closet that emails a nightly report.
2. **Publish `p=none` with `rua=`.** This changes nothing about delivery. It asks the world to send you daily aggregate reports in XML listing every IP that sent mail claiming your domain, and whether it passed.
3. **Read the reports for several weeks.** This is the entire value of the exercise. You will find senders you forgot about. Everybody does. Fix or authorize each legitimate one before you go further.
4. **Move to `p=quarantine`,** optionally with `pct=` to ramp gradually.
5. **Move to `p=reject`** once the reports are clean.

Then the forwarding problem. Legitimate forwarders and mailing lists break SPF and sometimes DKIM, and under `p=reject` that mail is refused. ARC exists to address this by letting intermediaries record the authentication results they saw, so a downstream receiver can choose to trust that chain. Support is uneven, so the practical answer is still to know which forwarding paths your users depend on before you enforce.

## Parked domains need records too

A domain you own and never send from is the easiest one to spoof, because nobody is watching it. Publish records that say it sends nothing: an SPF record that authorizes no one, a wildcard DKIM record with an empty key, which marks every selector as revoked, and a DMARC policy of reject.

```dns
example.net.                IN  TXT  "v=spf1 -all"
*._domainkey.example.net.   IN  TXT  "v=DKIM1; p="
_dmarc.example.net.         IN  TXT  "v=DMARC1; p=reject"
```

## What this does not do

None of this proves the content is honest. A spammer who owns `totally-legit-invoices.example` can publish perfect SPF, DKIM, and DMARC and pass every check. Authentication proves the domain is really the domain. It does nothing about lookalike domains, display-name spoofing where the address is a free webmail account, or a genuinely compromised account sending from your own infrastructure. That is still worth a lot: once your domain is hard to forge, the attacker has to use a different one, and a different domain is something a receiving filter, a mail rule, or an alert user can actually notice.

One last point, because it is the reason to do any of this: these records do not protect your inbox. They protect everyone else's inbox from mail that claims to be you. Publishing a strict DMARC policy is how you stop your domain from being a convenient return address for someone else's phishing, and it is one of the few security controls where the work is a handful of DNS records and some patience.

## References

- [RFC 7208: Sender Policy Framework (SPF) for Authorizing Use of Domains in Email, Version 1](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376: DomainKeys Identified Mail (DKIM) Signatures](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 7489: Domain-based Message Authentication, Reporting, and Conformance (DMARC)](https://www.rfc-editor.org/rfc/rfc7489)
- [RFC 8617: The Authenticated Received Chain (ARC) Protocol](https://www.rfc-editor.org/rfc/rfc8617)
- [RFC 5321: Simple Mail Transfer Protocol](https://www.rfc-editor.org/rfc/rfc5321)
- [DMARC](https://en.wikipedia.org/wiki/DMARC)
- [NIST SP 800-177 Rev. 1: Trustworthy Email](https://csrc.nist.gov/publications/detail/sp/800-177/rev-1/final)
