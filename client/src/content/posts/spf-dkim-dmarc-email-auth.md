
## The hole SMTP left open

SMTP does not authenticate senders. RFC 5321 gives a message an envelope with
a MAIL FROM address, RFC 5322 gives the message its own From: header, and
nothing in either specification proves the connecting host has any right to
use either domain. Any machine that can open port 25 can claim to be you.

SPF, DKIM, and DMARC are three separate DNS-published mechanisms bolted on
afterwards. People treat them as one thing called "email security." They are
not one thing. Each checks a different field, and knowing which field is the
whole game when you are debugging a rejection.

## SPF authorizes hosts for the envelope sender

SPF publishes a TXT record listing which IP addresses may send mail for a
domain. The receiver looks at the envelope MAIL FROM domain, fetches that
domain's SPF record, and compares the connecting IP to the mechanisms in the
record.

```
example.org.  IN TXT "v=spf1 mx ip4:198.51.100.20 include:_spf.provider.example -all"
```

Two things trip people up. First, SPF checks the envelope sender, not the
From: header the user sees, so a message can pass SPF while showing a
completely different display address. Second, SPF has a hard limit of ten DNS
lookups per evaluation. Every `include`, `a`, `mx`, `ptr`, and `exists`
mechanism costs against that budget, and nested includes count too. Blow the
limit and the result is permerror, which most receivers treat as a failure.
If you use several hosted senders, flatten or consolidate rather than chaining
includes forever.

The final mechanism matters. `-all` means "reject anything else," `~all` means
softfail, and `?all` means you have published nothing useful. SPF also breaks
on plain forwarding, because the forwarder becomes the connecting host while
the envelope sender stays yours.

## DKIM signs the message itself

DKIM takes a different approach: the sending server signs selected headers
and the body with a private key and attaches a DKIM-Signature header. The
public key lives in DNS under a selector.

```
mail2026._domainkey.example.org. IN TXT "v=DKIM1; k=rsa; p=MIIBIjANBgkq..."
```

The signature names the domain (`d=`), the selector (`s=`), the signed header
list (`h=`), and a body hash (`bh=`). A receiver fetches the key, recomputes
the hashes, and verifies. Because the proof travels inside the message, DKIM
survives forwarding as long as nothing rewrites a signed header or modifies
the body. Mailing lists that append footers break it, which is exactly why
they usually re-sign as themselves.

Selectors exist so you can rotate. Publish a new selector, start signing with
it, leave the old key in DNS until nothing in flight still needs it, then
remove the old record. Sign the headers that matter for identity: From,
Subject, Date, To, Message-ID, and Reply-To. Signing headers that intermediate
systems legitimately rewrite is a good way to generate mystery failures.

## DMARC ties them to the visible From

Neither SPF nor DKIM says anything about the address a human reads. DMARC
adds that link. It publishes a policy on the organizational domain and
requires alignment: the domain in the From: header must match the SPF-checked
envelope domain, or match the DKIM `d=` domain. Either one passing with
alignment is enough.

```
_dmarc.example.org. IN TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.org; adkim=s; aspf=r; pct=100"
```

`p=` is the request to receivers: none, quarantine, or reject. `adkim` and
`aspf` set strict or relaxed alignment, where relaxed allows a subdomain to
align with its organizational domain. `rua` is where aggregate XML reports
get sent, and those reports are the actual point of starting at `p=none`.

## How I would roll it out

This is the sequence I use on domains I control, and I would not skip a step
to move faster.

Publish SPF and DKIM first and let them run. Then publish DMARC at `p=none`
with an `rua` address and read reports for a few weeks. Aggregate reports tell
you which source IPs are sending as your domain and whether they align. You
will almost always find a forgotten sender: a ticketing system, a monitoring
box, a form handler on a web host.

Fix or authorize each legitimate source. Then move to `p=quarantine`, watch
again, then `p=reject`. The `pct` tag lets you apply a policy to a fraction of
mail during the transition. Going straight to reject on a domain with real
mail flow is how you discover your invoicing system was never signing
anything.

Do not forget parked domains. A domain you own and never send from should
publish `v=spf1 -all`, a wildcard DKIM record set to revoked, and a DMARC
record at `p=reject`. Unused domains are the easiest ones to spoof because
nobody is watching them.

## What this does not do

None of this proves the content is honest. A spammer who owns
`totally-legit-invoices.example` can publish perfect SPF, DKIM, and DMARC and
pass every check. Authentication proves the domain is really the domain. It
does nothing about lookalike domains, display-name spoofing where the address
is a free webmail account, or a genuinely compromised account sending from
your own infrastructure.

That is still worth doing. Once your domain is hard to forge, the attacker has
to use a different domain, and a different domain is something a receiving
filter, a mail rule, or an alert user can actually notice.

## References

- https://www.rfc-editor.org/rfc/rfc7208
- https://www.rfc-editor.org/rfc/rfc6376
- https://www.rfc-editor.org/rfc/rfc7489
- https://www.rfc-editor.org/rfc/rfc5321
- https://csrc.nist.gov/publications/detail/sp/800-177/rev-1/final
