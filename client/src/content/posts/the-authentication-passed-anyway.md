## The number that shaped the whole thing

I built a triage inbox for this site: fourteen messages, real headers, and a
verdict to give on each one. Then I counted how the authentication results fell
out.

```
Hostile, SPF + DKIM + DMARC all pass    8 of 9
Hostile, authentication fails           1 of 9
Genuine, SPF + DKIM + DMARC all pass    4 of 5
Genuine, one check fails                1 of 5
```

Eight of the nine hostile messages authenticate perfectly. One of the five
genuine ones does not.

I did not set out to produce that distribution. I wrote each message to be a
realistic instance of a category, and this is what fell out, because it is what
falls out in a real mailbox. A domain costs about ten dollars and publishing
correct SPF, DKIM and DMARC records for it takes twenty minutes. Nobody sending
phishing at any scale skips that step, because mail that fails authentication
gets filed in bulk before a human sees it.

## What the green ticks actually claim

The three mechanisms are frequently taught as though they answer "is this
message trustworthy". They do not. They answer a narrower question that is
worth stating exactly.

SPF asks whether the host that connected is one the envelope sender's domain
authorised to send for it. DKIM asks whether a signature over the message
verifies against a key the signing domain publishes. DMARC asks whether either
of those passed **and** was aligned with the domain in the From header, and it
lets that domain's owner say what to do when the answer is no.

Every one of those is a question about custody of a domain. None of them is a
question about the honesty of whoever holds it. When microsoft-storage.com sends
you mail and all three pass, what you have learned is that microsoft-storage.com
really sent it. Nobody was disputing that.

The inference people make is the reverse one, and it is sound: a message that
**fails** DMARC on a domain with a published policy is one the domain owner is
telling you to distrust. That is a genuine signal and the one hostile message in
my inbox that fails is caught by it instantly. It is just not the common case.

## Which leaves the domain

If authentication does not separate the two groups, something has to, and in
this inbox it is overwhelmingly the domain itself. Counting the hard signals
across all fourteen messages:

```
lookalike-domain      7
display-name-spoof    7
link-host-mismatch    3
dangerous-attachment  2
spf-fail              1
dkim-fail             1
dmarc-fail            1
```

The imitation domains come in two shapes and it is worth being able to name
both, because the advice "check the sender's domain" only defends against one of
them.

The first is a near miss: `paypa1.com` with a digit for a letter,
`orion-supply.com` for a supplier who is `orionsupply.com`. One hyphen. In the
inbox that one is the hardest message in the set, because the tone is calm, the
attachment is a real PDF, and there is nothing else to find.

The second is not a misspelling at all:

```
docusign.net.secure-esign.com
adobe.com.docs-share.example
```

Every character of `docusign.net` is correct. Hostnames are read right to left,
so the registrable domain is `secure-esign.com` and everything left of it is
labels its owner can invent. This shape survives "check the domain" completely,
because a reader who checks by scanning for a familiar name finds one.

## The half of the exercise that is about not raising a ticket

Five of the fourteen messages are genuine, and they carry thirteen of the
twenty-nine soft flags in the inbox between them. That is the part I care most
about.

A payroll bulletin whose envelope sender is the vendor's bounce domain, because
that is how every third-party sender works. A freight notice whose DKIM
signature fails, because it came through a mailing list that rewrote the
headers, while SPF still aligns and DMARC still passes. A service desk ticket
with a Reply-To on another domain, an envelope sender to match, and a shortened
link, all three of which are the ticketing platform working as designed.

And a supplier writing to say they have changed banks, from their real domain,
fully authenticated, asking you to act on it soon.

That last one sits a few messages below a forgery from a lookalike of the same
supplier. The forgery is calmer. The genuine one has the urgency, the payment
change and the attachment; the fake has none of those and one hyphen in a
domain. Any heuristic built on tone gets both of them wrong.

I put those five in because a triage exercise made only of obvious phish trains
a reflex that costs real money in a different currency. Raise a phishing ticket
on your own service desk and you have spent someone's afternoon, taught your
colleagues that the report button is noise, and made the next real report
slightly less likely to be believed. False positives are not free. They are
just billed to a different account.

## Scoring the reason, not only the verdict

The page keeps two numbers. How many messages you called correctly, and how many
of those calls cited a signal that is actually in the headers.

The second number exists because the first one is easy to get by feel. Nine of
fourteen are hostile; guessing "phish" on anything with an exclamation mark gets
you a respectable score and teaches you nothing that transfers. A verdict you
cannot point at a header for is a guess that happened to land, and it will not
land on the message that is written properly.

So after you report something, the page asks which signal settles it, and marks
that separately. Citing "SPF did not pass" on a message where SPF passed is
counted as a correct verdict reached for a reason that is not there.

## Keeping the analysis and the artefact in step

The failure mode for hand-written material like this is silent. Fourteen
messages, each with headers and a paragraph of analysis, both written by me.
Move a hyphen in a domain and the only finding in a message disappears while the
analysis still calls it hostile. The page renders. The verdict shows. The reader
is taught something untrue and nothing anywhere reports a problem.

So both lists on every message are derived mechanically from the headers, by the
same functions the page uses, and CI asserts that what is written down equals
what the detectors find, in both directions.

```
OK  14 messages, 9 hostile and 5 not, every written signal matches
    what the detectors find in the headers.
```

The second direction is the one that earns its keep. A claimed signal that is
absent is a bug I would probably catch reading it back. A signal that is present
and unclaimed is one I would not: a message I wrote to be clean that picked up a
lookalike domain by accident is still a plausible-looking message, and it would
sit there marking anyone who correctly spotted it as wrong.

The first run failed four times. Three were a bug in my own detector, a regex
for "does this link text name a host" that rejected `outlook.office365.com`
because it could not cope with a digit in a label. My hand-written lists were
right and the detector was wrong, which is the other direction the check works
in and the reason it is worth running both ways.

## References

- [RFC 7208: Sender Policy Framework](https://www.rfc-editor.org/rfc/rfc7208)
- [RFC 6376: DomainKeys Identified Mail](https://www.rfc-editor.org/rfc/rfc6376)
- [RFC 7489: DMARC](https://www.rfc-editor.org/rfc/rfc7489)
- [RFC 2606: reserved top-level DNS names](https://www.rfc-editor.org/rfc/rfc2606)
- [FBI IC3 on business email compromise](https://www.ic3.gov/CrimeInfo/BEC)
- [CISA guidance on phishing](https://www.cisa.gov/topics/cyber-threats-and-advisories/types-cyber-threats/phishing)
