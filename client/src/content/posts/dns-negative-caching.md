
## The Failure That Looks Like Broken Caching

The pattern is always the same. Someone adds a host record, tests it from the
authoritative server, gets the right answer, and then spends twenty minutes
convinced DNS is broken because half the network still says the name does not
exist. Restarting things does not help. Waiting does, eventually, which is the
detail that gives it away.

What is happening is negative caching. A resolver that receives a "no such name"
answer is allowed to remember that answer, and the length of time it remembers
is not controlled by the record you just created. It is controlled by the zone's
SOA record, which you probably have not looked at since the zone was created.

## What RFC 2308 Actually Specifies

RFC 2308 defines negative caching for DNS. When an authoritative server answers
NXDOMAIN, or answers NODATA (the name exists but has no record of the requested
type), it returns the zone's SOA record in the authority section. The resolver
uses that SOA to decide how long to cache the negative answer.

The value it uses is the minimum of two numbers: the SOA record's own TTL, and
the MINIMUM field in the SOA RDATA. That MINIMUM field originally meant
something else entirely in RFC 1034, and RFC 2308 redefined it as the negative
caching TTL. This is why a zone written years ago with a large MINIMUM will hold
onto NXDOMAIN answers for a long time even though every positive record in it
has a short TTL.

So you can have a zone where every A record has a sixty second TTL and negative
answers persist for hours. Nothing is misconfigured in the sense of being
invalid. It is just that the two TTLs come from different places and only one of
them is the one people tune.

## Where The Countdown Actually Lives

There is rarely one cache between the client and the authoritative server.
Working outward, you typically have the application's own resolver cache, a
stub resolver on the host, a recursive resolver on the network, possibly a
forwarder in front of that, and then whatever the upstream provider runs.

Each of those independently starts a countdown when it receives an answer. A
recursive resolver that answers from cache decrements the TTL it reports, so you
can read the remaining lifetime directly.

```bash
# Ask the recursive resolver twice and watch the TTL count down.
dig @192.0.2.53 www.example.com A +noall +answer
sleep 5
dig @192.0.2.53 www.example.com A +noall +answer

# For a negative answer, the interesting part is the AUTHORITY section.
dig @192.0.2.53 nosuchhost.example.com A +noall +authority

# Compare against the authoritative server, which never serves from cache.
dig @ns1.example.com nosuchhost.example.com A +noall +authority

# Read the SOA fields directly. The last number is MINIMUM.
dig @ns1.example.com example.com SOA +short
# ns1.example.com. hostmaster.example.com. 2026072601 7200 3600 1209600 3600
#                                          serial     refresh retry expire minimum
```

If the authoritative server gives the right answer and the recursive resolver
does not, you have found your cache. If the recursive resolver is correct and
the client is not, the stale copy is on the client or in the application.

## Fixing It Now Versus Fixing It Properly

To fix it now, flush the specific name rather than the whole cache. Blowing away
an entire resolver cache on a busy network causes a burst of upstream queries
right when you are already troubleshooting. BIND exposes per name flushing
through rndc, and most other resolvers have an equivalent.

```bash
# BIND: flush one name from the default view instead of everything.
rndc flushname nosuchhost.example.com

# systemd-resolved on a client, and confirming what it currently holds.
resolvectl flush-caches
resolvectl query nosuchhost.example.com
```

Fixing it properly means treating TTL as a change management parameter. Before a
planned migration, lower the relevant TTLs at least one old TTL interval ahead
of the change, so that by the time you cut over, every cache in the path is
holding a short lived copy. Then raise them again afterward. The same applies to
the SOA MINIMUM if you are about to create names that clients have already been
asking for, which happens constantly during a rollout when monitoring probes a
hostname before it exists.

## Two Related Behaviours, And The Order I Check Things In

RFC 8020 says that an NXDOMAIN for a name implies that nothing exists beneath
it. If the resolver has cached NXDOMAIN for example.com, a query for
api.example.com can be answered from that cached negative without going
upstream. This is correct and it is efficient, and it means one bad negative
answer for a parent name can suppress an entire subtree. When a whole branch of
your namespace disappears at once, this is the mechanism to check.

RFC 8767 goes the other direction. It permits a resolver to serve expired data
when it cannot reach the authoritative servers, which trades strict correctness
for availability during an outage. If your resolver has stale answer serving
enabled, "the TTL expired" stops being a guarantee that the next answer is
fresh. That is usually the behaviour you want, but you should know it is on
before you use TTL expiry as a reasoning tool.

When a name resolves inconsistently, I do not start by clearing caches. I start
by asking each layer in turn and comparing. Authoritative first, then recursive,
then the host stub, then the application. The layer where the answer changes is
the layer holding the stale copy, and the SOA tells me how long it intends to
hold it. That takes about ninety seconds with dig and saves the twenty minutes
of restarting services that do not need restarting.

## References

- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308.html)
- [RFC 1034: Domain Names, Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034.html)
- [RFC 8020: NXDOMAIN Really Means There Is Nothing Underneath](https://www.rfc-editor.org/rfc/rfc8020.html)
- [RFC 8767: Serving Stale Data to Improve DNS Resiliency](https://www.rfc-editor.org/rfc/rfc8767.html)
- [BIND 9 Administrator Reference Manual](https://bind9.readthedocs.io/en/latest/)
- [resolv.conf(5)](https://man7.org/linux/man-pages/man5/resolv.conf.5.html)
