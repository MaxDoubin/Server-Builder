
## It already happened

A lot of writing about the certificate lifetime reduction is still in the
future tense. It is not. The first step landed on 15 March 2026, and every
publicly trusted TLS certificate issued since then has a maximum validity of
200 days.

If you renew annually, the renewal you did in February was the last one-year
certificate you will ever buy for a public name, and the one you do next is
good for a bit over six months.

## The schedule, from the document that binds

This is not a vendor's roadmap. It is the CA/Browser Forum Baseline
Requirements, section 6.3.2, which is what every publicly trusted CA is
audited against. The table there reads:

| Issued on or after | Issued before | Maximum validity |
| --- | --- | --- |
|  | 2026-03-15 | 398 days |
| 2026-03-15 | 2027-03-15 | **200 days** |
| 2027-03-15 | 2029-03-15 | 100 days |
| 2029-03-15 |  | 47 days |

The prose either side of that table has a detail the table does not, and it is
the one that will catch an automation pipeline out. Each step is written twice:

> Subscriber Certificates issued on or after 2026-03-15 and before 2027-03-15
> SHOULD NOT have a Validity Period greater than 199 days and MUST NOT have a
> Validity Period greater than 200 days.

199 SHOULD, 200 MUST. The reason is arithmetic, and the BRs spell it out: a day
is 86,400 seconds, and "any amount of time greater than this, including
fractional seconds and/or leap seconds, shall represent an additional day". Ask
for exactly the maximum and a rounding you did not think about turns a 200 day
certificate into a 201 day certificate, which is a misissuance. So the
requirements tell you, in normative language, not to ask for the maximum.

If you have a script with `--days 200` in it, change it to 199. If you have one
with 398 in it, it stopped working in March.

## What changes about how you run things

The validity number is the headline and it is not the interesting part. The
interesting part is what a 47 day certificate does to an organisation's
assumptions.

**Renewal stops being an event.** At 398 days it is something a person does,
badly, once a year, from a calendar reminder that may or may not still point at
someone who works there. At 200 days it is twice a year and the same person
usually still exists. At 47 days it is roughly eight times a year, and at that
frequency a manual process is not a process, it is a queue of outages waiting
for a holiday.

**Your inventory becomes the constraint.** Automating renewal for the
certificates you know about is easy. The ones that take a site down are the
ones nobody listed: the appliance a vendor installed in 2019, the internal
tool on a public name, the load balancer somebody configured by hand. Those
survive an annual cycle because a year is long enough for the person who
remembers to still be there. They do not survive eight cycles a year.

**Certificate Transparency is your inventory.** This is the practical
suggestion worth acting on today. Every publicly trusted certificate is logged,
the logs are public, and you can query them for your own domains. A CT search
for your organisation's names will find certificates you did not know existed,
because it lists what was issued rather than what you remember deploying. It is
the only inventory method that does not depend on already knowing.

## The other half of the ballot

Validity got the attention. The reuse periods for domain validation changed
alongside it and will bite sooner in some setups:

| From | Domain and IP validation reuse |
| --- | --- |
| 2026-03-15 | 200 days |
| 2027-03-15 | 100 days |
| 2029-03-15 | **10 days** |

That last row is the one to plan for. Ten days means a CA cannot lean on a
validation you passed last quarter: you prove control of the name again, very
nearly every time you issue. Any workflow where domain validation is a
one-off performed by a different team, at a different time, with a DNS change
raised as a ticket, stops working. It has to become part of issuance, which in
practice means ACME.

## And a change that is not about time at all

Two other requirements took effect on the same date and got almost no
coverage, both about [DNSSEC](/blog/dns-security-dnssec):

> DNSSEC validation back to the IANA DNSSEC root trust anchor MUST be performed
> on all DNS queries associated with the validation of domain authorization or
> control by the Primary Network Perspective.

with a companion clause for CAA lookups, and a third saying CAs "MUST NOT use
local policy to disable DNSSEC validation" on those queries.

Read that from the subscriber's side. If your zone is signed and your signing
is broken, in a way that resolvers with validation disabled would happily
ignore, your CA is now required to notice. A SERVFAIL from a DNSSEC failure
"MUST NOT be treated as permission to issue". A zone that has been quietly
misconfigured for two years and works fine for everyone will fail validation
the next time you need a certificate, which at 47 days is next month.

If you sign your zones, test them now, while a failure is an inconvenience
rather than an outage.

## What to actually do

In rough order of how much grief each one saves:

1. **Find out what you have.** Query Certificate Transparency for your domains
   before you do anything else. You cannot automate renewal for a certificate
   you do not know about, and the ones you do not know about are the ones that
   will page you.
2. **Get ACME in front of everything you can.** It is not the only way to
   automate this, but it is the one with the widest client support, and the
   10 day validation reuse period in 2029 assumes something like it.
3. **Fix the `--days` constants.** 199, not 200. The BRs specifically tell you
   not to ask for the ceiling and explain why.
4. **Check the things ACME cannot reach.** Appliances with a web UI and no API,
   embedded management controllers, anything where the certificate is uploaded
   by hand. These are the real work and the timeline for them is 2029, which
   sounds distant and is two renewal cycles of procurement.
5. **Validate your DNSSEC** if your zones are signed.
6. **Alert on age, not on expiry.** An alert that fires seven days before
   expiry was reasonable at 398 days. At 47, seven days is fifteen percent of
   the certificate's life, and the useful signal is "this should have renewed
   by now and did not", which fires much earlier and points at the automation
   rather than at the clock.

The direction here is not really about certificates. It is that a compromised
key stays useful for exactly as long as the certificate naming it stays valid,
revocation has never worked reliably at internet scale, and shortening the
window is the mitigation that does not depend on revocation working. Every
step in the table is that argument winning again.

## References

- [CA/Browser Forum Baseline Requirements for TLS Server Certificates](https://raw.githubusercontent.com/cabforum/servercert/main/docs/BR.md) (section 6.3.2 for validity, 4.2.1 for validation data reuse, 1.2.2 for the schedule of relevant dates)
- [Ballot SC081v3: Introduce Schedule of Reducing Validity and Data Reuse Periods](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/)
- [RFC 8555: Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555.html)
- [RFC 8657: CAA Record Extensions for Account URI and ACME Method Binding](https://www.rfc-editor.org/rfc/rfc8657.html)
- [RFC 6962: Certificate Transparency](https://www.rfc-editor.org/rfc/rfc6962.html)
- [RFC 8659: DNS Certification Authority Authorization (CAA) Resource Record](https://www.rfc-editor.org/rfc/rfc8659.html)
- [RFC 4033: DNS Security Introduction and Requirements](https://www.rfc-editor.org/rfc/rfc4033.html)
