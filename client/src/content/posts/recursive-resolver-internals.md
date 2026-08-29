
## Three Different Things Called A DNS Server

When somebody says "the DNS server," they could mean any of three roles, and
the troubleshooting is completely different for each.

A **stub resolver** is the thing inside your operating system's libc or its
local daemon. It knows almost nothing. It takes a name from an application,
sends one query to a configured address, and believes the answer. It does not
walk anything.

A **forwarder** takes queries and passes them to another resolver, usually
caching the results. Most home routers are forwarders. They contribute a cache
and a point of policy and nothing else.

A **recursive resolver** is the one that does the real work: given a name and
no prior knowledge, it finds the answer by asking authoritative servers, one
level at a time. Everything below is about that.

## The Walk Down The Tree

Suppose the cache is completely cold and someone asks for
`api.example.com` type A. The resolver does this:

1. Ask a root server for `api.example.com`. The root does not know, but it is
   authoritative for the root zone, so it returns a **referral**: the NS records
   for `com` and, usually, glue A and AAAA records for those name servers.
2. Ask a `com` server the same question. Same story: a referral to the name
   servers for `example.com`, with glue if those name servers live inside the
   zone being delegated.
3. Ask an `example.com` server. This one is authoritative for the zone, so it
   answers with the A record and the authoritative answer flag set.

Three key details people get wrong. The resolver asks the *full* name at every
step, not one label at a time. The root does not "know about" example.com in
any sense, it just knows who is authoritative for `com`. And the resolver seeds
this whole process from a static list of root server addresses, the root hints,
which is the only DNS data that arrives out of band.

Aliases add a wrinkle. A CNAME answer is not the end of the query. The resolver
restarts the walk for the target name, which may itself be a CNAME. A chain
several links long is normal for anything behind a CDN, and each new link may
mean a fresh set of referrals.

## The Cache Is The Product

A recursive resolver that did the full walk every time would be unusable. The
cache is not an optimization bolted on, it is the reason the system scales, and
the caching rules are more subtle than "remember for the TTL."

**Positive caching** keeps the answer for the TTL the authoritative server set.
Nothing controversial there, except that the TTL is a promise about staleness
that everyone in the chain gets to shorten and nobody is supposed to lengthen.

**Negative caching** is the one people forget. When a name does not exist, the
NXDOMAIN response comes with an SOA record in the authority section, and the
minimum field of that SOA governs how long the negative answer may be cached.
This is why a typo you fixed thirty seconds ago still fails, and why a newly
created record sometimes takes longer to appear than its own TTL suggests. If
something resolved as NXDOMAIN before it existed, you are waiting on the SOA
minimum, not on the record.

**Serve stale** lets a resolver return expired data when it cannot reach the
authoritative servers. It trades correctness for availability during an
outage, and it is a good trade far more often than not, because a slightly old
address is usually better than no address.

**Prefetch** lets the resolver refresh a popular record shortly before its TTL
expires, so users never pay the miss.

## Message Size, EDNS, And Fallback

Original DNS over UDP capped a message at 512 bytes. Anything larger set the
truncated bit and the client was supposed to retry over TCP. [DNSSEC](/blog/dns-security-dnssec) and IPv6
records blew past that limit routinely, so EDNS added an OPT pseudo record that
lets a client advertise a larger buffer it can receive.

That advertisement is where things break. If you claim you can accept a large
UDP response and something in the path fragments it, or a middlebox drops
fragments or drops DNS over TCP entirely, you get an intermittent failure that
looks like "big records do not work." Advertising a more conservative buffer
size and making sure TCP port 53 is genuinely reachable fixes most of it.
Assuming DNS is UDP only is one of the most durable firewall mistakes there is.

## Watching It Happen

The fastest way to understand any of this is to make the resolver show its work.

```bash
# Do the recursion yourself, one referral at a time.
dig +trace api.example.com

# Ask one specific authoritative server, no recursion, so you see
# the raw referral rather than a cached final answer.
dig @a.gtld-servers.net example.com NS +norecurse

# Look at the SOA minimum: this governs how long NXDOMAIN is cached.
dig example.com SOA +short

# Confirm TCP works. If this fails and UDP succeeds, you have a
# path problem waiting to bite you on any large response.
dig +tcp example.com A

# See whether an answer came from cache: TTL counting down between
# two runs against the same resolver means it is cached.
dig @192.0.2.53 example.com A | grep -E '^example'
sleep 5
dig @192.0.2.53 example.com A | grep -E '^example'
```

That last trick is the one I use most. A TTL that is a round number is a fresh
authoritative answer. A TTL that is counting down is a cache hit, and the
remaining value tells you exactly how long you are stuck with it. When someone
says a DNS change "has not propagated," what is almost always true is that one
resolver in the path is holding a value with time left on it, and no amount of
waiting on the authoritative side will change that.

## References

- [RFC 1034: Domain Names, Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034.html)
- [RFC 1035: Domain Names, Implementation and Specification](https://www.rfc-editor.org/rfc/rfc1035.html)
- [RFC 2308: Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308.html)
- [RFC 6891: Extension Mechanisms for DNS (EDNS(0))](https://www.rfc-editor.org/rfc/rfc6891.html)
- [RFC 8767: Serving Stale Data to Improve DNS Resiliency](https://www.rfc-editor.org/rfc/rfc8767.html)
- [Unbound documentation](https://unbound.docs.nlnetlabs.nl/en/latest/)
