## The report is always the same

Somebody says a name does not resolve. That sentence covers at least four
distinct faults, and they need four different people to fix them.

I built a simulated internet to make the difference visible: nine zones, no
caching, and a resolver that records every query it sends. Caching is what
makes these intermittent, so leaving it out is the point rather than a
simplification.

Here is where each fault stops.

```
No glue at the parent                     2 queries
Nameserver has no address                 3 queries
Alias to a name that does not exist       5 queries
Lame delegation                           6 queries
Two aliases pointing at each other        9 queries
```

The number of round trips before it gives up is itself diagnostic, and it is
the first thing `dig +trace` shows you.

## Lame delegation

The parent zone delegates a name to a server, and that server answers and says
it is not authoritative. The delegation outlived the hosting.

What makes this hard is not the fault, it is that it looks exactly like a
firewall from the client side: you asked, and you did not get useful data. The
difference is that a firewall gives you silence and a lame server gives you a
reply. If there is a response in the trace, it is not a network problem.

The other confusing part is that nothing changed on the side that broke.
Somebody decommissioned a nameserver somewhere else, and the record pointing at
it was never anybody's job. The fix is at the parent, and nobody inside the
child zone can make it, which is worth knowing before you spend an afternoon
inspecting a zone file that is correct.

## No glue

A zone is served by nameservers whose own names are inside it. To find their
addresses a resolver has to ask the servers for that zone, which are the things
it is trying to find.

```
01 www.quarry.example A @ a.root-servers.net
   referral to example
02 www.quarry.example A @ a.gtld-servers.example
   referral to ns1.quarry.example, ns2.quarry.example, no glue
```

Two queries and it stops. Glue breaks the circle: A records for those
hostnames, held at the parent and handed out with the referral. They are the
parent's copy of the child's data, which is exactly why they go stale when the
child renumbers and nobody tells the registrar.

The cruel part is that the zone file is correct. Every record inside the zone
is right, including the A records for its own nameservers, and none of it can
be reached. The fault survives every check the zone's owner knows how to run,
because all of those checks run against the zone.

Two ways out. Add glue at the parent, which the registrar does, or put the
nameservers on names outside the zone. That second option is why plenty of
organisations run their nameservers under a completely separate domain.

## A delegation to nothing

The delegation exists and names a host that has no address record anywhere. No
query is ever sent, because there is nowhere to send it.

Worth separating from lame, and the trace does it in one step: lame means the
server answered and disclaimed the zone, this means there is no server at all.
It is usually a typo in a delegation or a nameserver hostname that was planned
and never created, and like lame it is invisible from inside the child zone
because the child zone is not where the mistake is.

## An alias to nowhere

```
mail.northbay.example  CNAME  mail.gone.example
mail.gone.example      NXDOMAIN
```

The alias resolves perfectly. Its target does not exist, and the NXDOMAIN comes
from a name the person reporting the problem never typed.

This is why an NXDOMAIN on a name you can see in your own zone file is not a
contradiction. The zone is fine; what is missing is somewhere else, and in this
case it is a whole zone that was never created. Follow the CNAME before you
open the zone file.

Note also what following a CNAME costs. The resolution restarts at the root
with the new name, which is why a chain of two aliases takes nine queries and
one direct name takes three. That is the whole of the answer to "why is the
first load slow and everything after it fine".

## NXDOMAIN is not NODATA

The one everyone gets wrong, and the one with real operational consequences.

NOERROR with zero answers means the name exists and has no record of the type
you asked for. NXDOMAIN means the name does not exist, which is a fact about
every type at once, and a resolver caches it that way.

A dual-stack client asking AAAA and then A is not misbehaving. The AAAA NODATA
in your logs is the normal case for a host without IPv6, and an application
that logs it as a DNS error is producing noise that will eventually hide
something real.

## Two aliases pointing at each other

Each zone is individually valid. Neither record is wrong on its own. Together
they never terminate, and a resolver detects it with a hop limit rather than
by understanding it, so what a client sees is a delay followed by SERVFAIL.

That reads as a server problem and it is a data problem. It usually happens
when two teams each add an alias pointing at the other's canonical name, and
nothing in a zone file check catches it because no single zone is invalid.

## The check that keeps this honest

Every case on the page states an outcome, and CI runs the resolver and refuses
the build if the stated diagnosis and the actual outcome disagree. That is
exactly how a page like this rots: a trace and an explanation that no longer
match, both looking entirely correct.

Writing the resolver turned up two bugs of my own that are worth naming because
both are conceptual rather than typos.

The first: delegation was picking the deepest zone on the path, so the root
referred straight to a second-level domain and skipped the TLD entirely. A root
server holds NS records for the TLD and that is the whole of its opinion. It is
now driven by the NS records a zone actually holds, which is both correct and
what a real server does.

The second: it tried only the first server in a delegation, which made a
two-server zone with one dead server look broken. It fails over now, and that
case is on the page as a control, because a redundancy that works is worth
recognising as quickly as a fault.

## References

- [RFC 1034: domain names, concepts and facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [RFC 1035: domain names, implementation and specification](https://www.rfc-editor.org/rfc/rfc1035)
- [RFC 2308: negative caching of DNS queries](https://www.rfc-editor.org/rfc/rfc2308)
- [RFC 8499: DNS terminology, including bailiwick and glue](https://www.rfc-editor.org/rfc/rfc8499)
- [RFC 1912: common DNS operational and configuration errors](https://www.rfc-editor.org/rfc/rfc1912)
