## Four messages, one cause, and only one of them says so

I built a page that asks the reverse question about clock skew: not "given the
skew, what breaks", which is arithmetic, but "given what broke and what did
not, how wrong is the clock". Eight cases, 23 observations between them.

Then I counted how many of those 23 error messages mention time at all.

```
Observations                              23
Failures among them                       12
Failure messages naming time or clock      5
Distinct strings among those five          2
```

Five of twelve, and four of those five are the same string:

```
krb5: KRB_AP_ERR_SKEW: clock skew too great
```

Kerberos is the only thing in the stack that tells you. The fifth is a TLS
error, and it does technically say the word, but look at where:

```
x509: certificate has expired or is not yet valid: current time is
before 2026-09-08T18:04:00Z
```

The subject of that sentence is the certificate. The clue is in a subordinate
clause after a colon, and by the time a reader gets there they have already
opened the certificate in another window. Which is not a criticism of the
message. It is accurate and it is even ordered sensibly, because the
certificate is what failed to validate. It is just that the accurate,
sensibly ordered message sends people to the wrong file.

The other seven failures say nothing about time at all:

```
Invalid authentication code, please try again
SERVFAIL, validation failure: signature has expired or is not yet valid
certificate has expired
```

And then there is the failure that produces no message at all. In one case a
login on one host is recorded at 02:14:07 and a password change on another at
02:14:31, and the investigation is about to conclude that somebody logged in
and then changed the password. The observations available are a rejected
one-time code and a thirty-five second old certificate that will not validate,
which put the clock at least thirty-six seconds behind, which puts the login
at 02:14:43 or later, which is after the password change and not before it.
The order in the logs is the reverse of the order of events.

Nothing warned anybody, because two timestamps from two hosts sort perfectly
well whether or not they mean the same thing. That is the case for one clock
rather than agreement between clocks.

## The tolerances are not on one scale

This is the part that makes the reverse question answerable, and it is the
part I got wrong in my own prose, which I will come back to.

Across these cases, the checks that tolerate anything at all allow 300 seconds
and 30 seconds. A certificate's notBefore and an RRSIG's inception allow
nothing: the edge is an edge.

```
Kerberos, default clockskew      300 s
One-time code, a step either way  30 s
Certificate window, RRSIG          0 s
```

So they break in a fixed order as a clock drifts, and the set of things that
are currently broken tells you roughly where you are. Codes failing while
Kerberos still works means somewhere between half a minute and five minutes.
That is the whole trick.

## The check with no tolerance is the one that measures

Here is the more useful version of that, and it surprised me.

For each case I removed one observation at a time and asked how wide the
answer got:

```
case                            answer   without its zero-tolerance check
the-certificate-is-fine           179 s   1,209,479 s  (a fortnight, all slow)
both-wrong-together            86,399 s   no single range
the-code-is-invalid               259 s   no single range
fast-not-slow                 518,399 s   no single range
a-tolerant-peer-that-is-wrong      60 s   no single range
bogus-not-broken              255,599 s   no single range
inside-every-tolerance             50 s   320 s
the-logs-that-lie                 264 s   no single range
```

In six of the eight cases, removing the zero-tolerance observation leaves the
observations unable to pin the clock to a single range at all. Not wider:
disjoint. And in the two remaining ones it goes from 179
seconds to every offset from a fortnight slow up to two minutes slow, and
from 50 seconds to 320.

The reason is that a tolerant check tells you almost nothing when it passes.
"Kerberos works" means you are inside five minutes of the domain controller,
which is a 600 second statement. A certificate issued twenty seconds ago
validating means you are no more than twenty seconds behind, full stop. There
is no grace period on notBefore to absorb your error.

Which turns into an actual diagnostic move, and it is not the one people make.
The instinct is to go and check the thing the message named. The useful thing
is to go and find something with a hard edge and a known age, and try it. Ask
for a certificate and use it immediately. Look at an RRSIG's inception. Those
measure. Retrying the login does not.

## Two hosts that are both wrong agree perfectly

The skew that matters is relative, which means a host can be thirteen days out
and look completely healthy from the inside.

One of the eight cases is a pair of application servers, both twelve and a
half days behind. Everything between them works: the mutual TLS, the load
balancer health checks, the replication. A private certificate issued a
fortnight ago still validates, because the clock has not fallen behind its
notBefore. A public certificate issued twelve days ago does not.

That pair of observations is the measurement. The pair agreeing with each
other is the least informative fact available, and it is the one that gets
checked first, because it is the one you can check from the machine you are
already logged into.

## Six of eight answers rule out a correct clock

Worth stating plainly, because it is the reason to run any of this: in six of
the eight cases the observations exclude zero outright. The clock is provably
wrong from the symptoms alone, before anybody runs `chronyc tracking`.

The answers themselves span four orders of magnitude, from 50 seconds to
518,399 seconds, which is about six days.

```
narrowest answer         50 s
widest answer       518,399 s
ratio                10,368x
```

That range is why the page draws its axis on a symmetric log scale. A linear
axis that fits thirteen days makes a thirty second window invisible, and one
that fits thirty seconds cannot draw thirteen days at all.

## Most observation sets do not pin it down

The gate that checks all this generates random observation sets and compares
two independent implementations. That gave me a number I did not expect:

```
400 generated observation sets
  narrow to exactly one range     159
  allow several disjoint ranges   115
  no clock explains them          126
```

Only two in five sets of observations pin the clock to a single range. Nearly
a third are contradictory, meaning no clock offset in a fortnight either side
of correct produces them.

Both numbers are practical. If your observations allow two disjoint ranges,
you need one more probe, and the one to reach for is the tightest tolerance
you can get a known timestamp out of. And if nothing explains your
observations, the clock is not the whole story: something in that list is
broken for its own reasons, and treating the set as a measurement will give
you a confident wrong answer.

That third case is the one worth internalising. "No offset explains this" is
information, and it is the thing a person diagnosing by feel will never
notice, because a person diagnosing by feel is looking for a story that fits
most of the evidence.

## The check that only catches a rounding error

The gate does two things. It intersects the intervals, and then it walks every
second from minus a fortnight to plus a fortnight and counts which offsets
produce the observed results, and requires the two to agree exactly.

That felt like belt and braces when I wrote it. It caught two of my eleven
deliberate breakages that nothing else did:

```
=== off by one on the complement ===
  the interval algebra says [{"from":-300,"to":-120}]
  and counting every second says [{"from":-300,"to":-121}]
```

One second, at one boundary. Every case still had exactly one matching option,
every answer was still the right order of magnitude, and every sentence on the
page still read correctly. The only thing that noticed was the second
implementation, and the reason to write a second implementation is that
interval arithmetic is the exact sort of thing that comes out nearly right.

## The sentence I got wrong five times

While computing the numbers for this article, I found that my own prose said
the tolerances "differ by two orders of magnitude". It appeared in five
places: the type definitions, the page header, the prerendered body, the meta
description, and inside one case's explanation.

They differ by one. Three hundred to thirty is a factor of ten. Then there is
a cliff to zero, which is not an order of magnitude at all, and which is the
genuinely interesting part I had buried.

One gate on this surface, a few dozen assertions in it, blinded fourteen ways
to prove each one caught what it was for, and not one of them reads prose. So the fix was not to write
a prose checker. It was to stop writing the numbers down: the page now renders
them from the cases, and there is a gate asserting the cases keep at least two
graded tolerances and at least one hard edge, so the rendered sentence stays
worth rendering.

A number in a sentence next to the data it describes is a copy, and copies
drift. The only reliable fix is to have one of them.

## Then run NTP, obviously

None of this is an argument against monitoring. It is an argument about what to
monitor. `systemctl is-active chronyd` reports a daemon that has never once
managed to step the clock as fine, and that is the exact failure every case
here is built on.

Alert on the offset. And alert on it for the things that are not servers,
because the domain controllers are usually right and the appliance, the
switch, the hypervisor host and the laptop that has been suspended for a week
are usually not.

You can work through the eight cases at [the clock is the last thing anybody
checks](/clock).

## References

- [RFC 4120: the Kerberos V5 protocol, on clock skew](https://www.rfc-editor.org/rfc/rfc4120)
- [RFC 5280: certificate validity periods](https://www.rfc-editor.org/rfc/rfc5280)
- [RFC 6238: TOTP, and its time-step tolerance](https://www.rfc-editor.org/rfc/rfc6238)
- [RFC 4033: DNSSEC introduction and requirements](https://www.rfc-editor.org/rfc/rfc4033)
- [RFC 4034: RRSIG inception and expiration](https://www.rfc-editor.org/rfc/rfc4034)
- [chrony documentation](https://chrony-project.org/documentation.html)
- [RFC 5905: NTPv4](https://www.rfc-editor.org/rfc/rfc5905)
