## Fifty certificates were issued that week and none were on the server

A container build ran `certbot certonly` as a step, wrote the result into the
image, and shipped it. The image was rebuilt on every merge. The production
host had its own `certbot.timer`, from before anyone set up CI.

Both asked for the same two names. The build won every time, because it ran
during the day and the timer ran at 03:00 into an empty bucket. Certbot starts
trying thirty days out, so this had been in the timer's journal every night
for a month, and nobody reads that journal:

```
too many certificates (5) already issued for this exact set of identifiers
in the last 168h0m0s, retry after 2026-09-11 02:47:09 UTC: see
https://letsencrypt.org/docs/rate-limits/#new-certificates-per-exact-set-of-identifiers
```

The certificates the build got were real, publicly trusted, and baked into
image layers that were rebuilt over them. The one being served stopped being
valid on a Thursday morning.

The number everybody quotes is fifty a week. Five were issued, so that limit
was never close. The limit that fired allows five, and almost nothing written
about rate limits is about that one.

## The issuance limits, as the page states them today

| Limit | Allowance | Refill | Overrides |
| --- | --- | --- | --- |
| New Certificates per Registered Domain | 50 every 7 days | 1 per 202 minutes | on request |
| New Certificates per Exact Set of Identifiers | 5 every 7 days | 1 per 34 hours | none |
| New Orders per Account | 300 every 3 hours | 1 per 36 seconds | on request |
| Authorization Failures per Identifier per Account | 5 every hour | 1 per 12 minutes | none |
| Consecutive Authorization Failures per Identifier per Account | 1,152 | 1 per day | none |

The page carries a last-updated date, and today it reads August 5, 2026. Read
it rather than this table. The second row used to be the Duplicate Certificate
limit, and half the internet still calls it that.

## It is a bucket, not a calendar

The page states the mechanism: "Limits are calculated, per request, using a
token bucket algorithm."

So "every 7 days" is not a window that resets on Monday. It is a burst size
and a drip. Fifty per seven days is one token every 201.6 minutes, documented
as 202. Five per seven days is one token every 33.6 hours, documented as 34.

That changes the remedy. Having emptied the exact-set bucket, the usual advice
to wait a week is wrong in both directions: you do not have to, and it does
not hand you five. Thirty-four hours gives you one. The `retry after`
timestamp is that arithmetic already done, and the only number in the message
worth acting on.

## Registered domain means the thing you bought

"A registered domain is, generally speaking, the part of the domain you
purchased from your domain name registrar." In `www.example.com` it is
`example.com`, and in `new.blog.example.co.uk` it is `example.co.uk`, because
"we use the Public Suffix List to identify registered domains".

Fifty is generous at that granularity: a dozen services behind one domain is a
dozen certificates, and you will not run out. But it is global to
the registered domain rather than to your account, so two hosts with two ACME
accounts on one domain draw from the same fifty. Splitting the account does
not split the bucket.

## The one that actually fires

The exact-set limit keys on the full identifier list, "ignoring capitalization
and the order of identifiers". So `example.com` alone is one set, and
`example.com` plus `www.example.com` is a different set with its own
independent five: adding a name creates a brand new bucket.

That is why the folklore fix works and why it is a bad habit. Padding the SAN
list with a throwaway name buys five more issuances, spends from the fifty
every time, and leaves a certificate whose subject alternative names are a
record of your outages.

On the [90 day classic profile](/blog/certificate-lifetimes-are-200-days-now)
a well behaved renewer asks about six times a year. A pipeline that issues on
every deploy asks six times before lunch.

## Renewals are exempt, and the hole is in exactly the wrong place

This is the sentence everybody half remembers, and the half they drop is the
half that matters. The documentation gives two cases.

For clients that speak ARI: "Renewals coordinated by ARI offer the unique
benefit of being exempt from all rate limits." For everyone else, an order
"can still be considered a renewal of an earlier certificate if it contains
the exact same set of identifiers, ignoring capitalization and the order of
identifiers", and those orders are "exempt from the New Orders per Account and
New Certificates per Registered Domain rate limits. However, unlike ARI
renewals, these orders would still be subject to Authorization Failures per
Identifier per Account and New Certificates per Exact Set of Identifiers."

Read the second case twice. A renewal is by definition a request for the same
identifier set, and the exact-set limit exists precisely to stop a client
asking for the same thing over and over. Exempting renewals from it would
exempt the loop it was built to catch, so the exemption you were counting on
covers the limit you were never going to hit.

ARI is the way out, and it is worth seeing why it can be. Under RFC
9773 the ACME directory gains a `renewalInfo` field, and a GET against it
returns the authority's own opinion about when to come back:

```json
{
  "suggestedWindow": {
    "start": "2026-11-18T14:02:11Z",
    "end": "2026-11-28T14:02:11Z"
  }
}
```

The client picks a random time inside that window. The authority is not
exempting a promise, it is exempting its own schedule.

That matters more as lifetimes shrink. Short-lived certificates are "valid for
160 hours, just over six days", and three nodes renewing one identifier set
independently at two thirds of life come to about 4.7 issuances a week: the
whole budget, before anything goes wrong.

## Failed validation has two budgets behind it

The hourly one: "Up to 5 authorization failures per identifier can be incurred
by one account every hour. The ability to incur authorization failures refills
at a rate of 1 per identifier every 12 minutes." It reads:

```
too many failed authorizations (5) for "example.com" in the last 1h0m0s,
retry after 2026-09-19 11:14:03 UTC: see
https://letsencrypt.org/docs/rate-limits/#authorization-failures-per-identifier-per-account
```

Behind it sits a slower one most people meet once: "Up to 1,152 consecutive
authorization failures per identifier can be incurred by one account. The
ability to incur authorization failures refills at a rate of 1 per identifier
every day and resets to zero if an authorization for that identifier is
successfully validated."

The reset condition is the design. A hook that occasionally times out clears
its counter on the next success and never approaches 1,152. A hook writing the
TXT record into the wrong zone never succeeds, so nothing resets it, and it
drains a counter refilling at one per day. That ends in a pause on the
identifier, with a link in the error to a self-service portal that lifts it.

## Wildcards move the pressure onto a different bucket

DNS-01 is not optional for a wildcard. Of HTTP-01 the documentation says
flatly "This challenge cannot be used to issue wildcard certificates", and
that it "can only be done on port 80". DNS-01 puts a TXT record at
`_acme-challenge.<YOUR_DOMAIN>`, and you "can use CNAME records or NS records
to delegate answering the challenge to other DNS zones", which is how a
renewal robot gets the narrowest credential possible.

An order covering both `example.com` and `*.example.com` needs two challenge
values at that one `_acme-challenge.example.com` name, at the same time. A
provider API that replaces a TXT record rather than appending serves only the
second, one authorization fails, and you have spent from the hourly failure
budget rather than from any certificate budget.

The rate limit effect cuts both ways. Twelve names as twelve certificates is
twelve against the fifty and twelve independent buckets of five. One wildcard
is one against the fifty and a single bucket of five shared by everything
behind it. Better for the limit you were not hitting, worse for the one you
were.

## Staging costs nothing, but it is not your test suite

The staging directory is
`https://acme-staging-v02.api.letsencrypt.org/directory`, and its limits are
not a slightly larger production. As documented, New Certificates per
Registered Domain "is 30000 per second" and New Certificates per Exact Set of
Identifiers "is 30000 per week".

Two things staging does not do. Its roots are named things like "(STAGING)
Pretend Pear X1", and the page is clear: "Do not add the staging root or
intermediate to a trust store that you use for ordinary browsing or other
activities, since they are not audited or held to the same standards as our
production roots." Accounts are separate too, so a key registered against
production does not exist there.

A staging run proves the plumbing and nothing about trust, which is the right
division of labor: the plumbing breaks fifty times. But the page draws a line
most CI advice misses. Staging "is not a great fit for integration with
development environments or continuous integration (CI)", because the network
calls add instability and it "offers no way to 'fake' DNS or challenge
validation success". For that Let's Encrypt ships Pebble, "a small ACME server
purpose built for CI and development environments". Staging is the rehearsal
before production. Pebble is the test suite that runs on every commit.

```
$ certbot certonly --dns-cloudflare \
    --server https://acme-staging-v02.api.letsencrypt.org/directory \
    -d example.com -d '*.example.com'
```

`certbot renew --dry-run` does the same for the renewal path: it runs the
whole cycle against staging and throws the result away.

## What to change

Issuance is state, not a build artifact. A certificate belongs to the host
that serves it, or to a secret store it reads, never to an image layer that
gets rebuilt. One issuer per identifier set, everything else consumes what it
produced.

Turn on ARI, because it is the only exemption covering the limit that fires.
Rehearse against staging and run test suites against Pebble. Delete
`--force-renewal` from anything on a schedule: `certbot renew` is a no-op when
the certificate is not due, and that no-op is the feature.

And alert on what the server is serving rather than on what sits in
`/etc/letsencrypt/live`, because here those were different files for a month.
That loop is covered in
[the renewal loop and its five steps](/blog/certificate-rotation-automation).

## The questions, in order

1. Which limit fired? The error names it and links its section. `already
   issued for "example.com"` is the fifty. `for this exact set of
   identifiers` is the five.
2. What does `retry after` say? That is the refill arithmetic already done,
   and it is never a Monday.
3. How many separate things issue for this identifier set? More than one is
   the bug, and the loser is the one on the server.
4. Does the client ask ARI? If not, the renewal exemption does not cover the
   limit that fired.
5. Is every pipeline off production? Rehearsals belong on staging, test
   suites on Pebble.

None of those are about the fifty, and the fifty is the first number everybody
looks up.

You can work through ten broken chains, including the ones where the
certificate is valid and the server is serving the wrong file, at
[a chain that does not validate](/chain).

## References

- [Let's Encrypt, Rate Limits](https://letsencrypt.org/docs/rate-limits/)
- [Let's Encrypt, Staging Environment](https://letsencrypt.org/docs/staging-environment/)
- [Let's Encrypt, Challenge Types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt, Certificate Profiles](https://letsencrypt.org/docs/profiles/)
- [RFC 9773, ACME Renewal Information (ARI) Extension](https://www.rfc-editor.org/rfc/rfc9773.html)
- [RFC 8555, Automatic Certificate Management Environment (ACME)](https://www.rfc-editor.org/rfc/rfc8555.html)
- [boulder/ratelimits/limiter.go, where the error strings are built](https://github.com/letsencrypt/boulder/blob/main/ratelimits/limiter.go)
- [Pebble, a small ACME server for CI](https://github.com/letsencrypt/pebble)
- [The Public Suffix List](https://publicsuffix.org/)