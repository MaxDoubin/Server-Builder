## The DNS dashboard is red and nothing is broken

A checkout service in a Kubernetes cluster calls `api.stripe.com` once per
order. The cluster's DNS pods are running hot, the p99 for name resolution is
up, and the CoreDNS dashboard is mostly one color: NXDOMAIN. Somebody opens a
ticket against the DNS team. The DNS team checks their upstream forwarders,
finds nothing, and closes it.

Both sides are right. Every lookup of that hostname from that pod sends ten
DNS queries, eight of them for names that do not exist, and every one of
those eight is answered correctly. The resolver is doing exactly what it was
told to do, and what it was told is written in two lines of a file that
kubelet generates and nobody reads:

```
search prod.svc.cluster.local svc.cluster.local cluster.local ec2.internal
nameserver 10.96.0.10
options ndots:5
```

## The rule, as the man page states it

resolv.conf(5) describes `ndots` in one sentence: "Resolver queries having
fewer than ndots dots (default is 1) in them will be attempted using each
component of the search path in turn until a match is found."

Read it slowly, because every word carries weight. The stub resolver in glibc
counts the dots in the name the program passed. If there are fewer than
`ndots`, it appends each search domain in turn and asks for that, in order,
stopping at the first one that answers. Only when every search domain has
failed does it ask for the name exactly as written. If there are at least
`ndots` dots, the order flips: the name as written goes first, and the search
list is consulted only if that fails.

`api.stripe.com` has two dots. Two is fewer than five. So the resolver asks
for these, in this order:

```
api.stripe.com.prod.svc.cluster.local
api.stripe.com.svc.cluster.local
api.stripe.com.cluster.local
api.stripe.com.ec2.internal
api.stripe.com
```

Five names. And every one of them is asked for twice, because a program
calling `getaddrinfo` with `AF_UNSPEC` gets an A query and an AAAA query for
each attempt. Ten queries on the wire. Eight of them are for names that
cannot exist, each returning NXDOMAIN, and the tenth answers. That is the
dashboard.

The [search list surface](/ndots) walks this for ten names, and the first
of them is exactly this pod. If you want to see the list rather than read
about it, that is where it is drawn.

## Why five

Kubernetes did not pick `ndots:5` carelessly. Inside a cluster, a service is
reachable as `db` from its own namespace, as `db.billing` from another, and as
`db.billing.svc.cluster.local` from anywhere. The middle form has one dot. If
`ndots` were the glibc default of 1, `db.billing` would have at least `ndots`
dots and the resolver would try it as an absolute name first. There is no
top-level domain called `billing`, so that costs two NXDOMAINs before the
search list even starts, on every cross-namespace lookup the cluster performs.

With `ndots:5`, every name the cluster hands out has fewer dots than the
threshold, and every one of them goes search-first, which is the order that
finds them on the first or second attempt. The setting is correct for the
names inside the cluster. It is wrong for every name outside it. The same
file cannot say both, and kubelet chose the inside.

The cost of getting this wrong in the other direction is smaller than people
expect, but it is real. Set `ndots:1` on a pod that resolves `db.billing`
and that name costs six queries: two for `db.billing` as written, which does
not exist, then two for `db.billing.prod.svc.cluster.local`, which does not
exist either, then two for `db.billing.svc.cluster.local`, which does. Under
`ndots:5` the same name costs four. Lowering the threshold is not free; it
moves the waste from external names to internal ones.

## The three ways out, and what each costs

**A trailing dot.** `api.stripe.com.` with a dot on the end is a fully
qualified name. The resolver strips the dot, asks for the name once per
address family, and never looks at the search list. Two queries instead of
ten. This is the only fix that lives entirely inside the application, and it
is the one code review will flag as a typo, so the comment above it matters.
Test the whole request rather than the lookup alone: a few HTTP clients and
TLS libraries carry the trailing dot into the Host header or the SNI, and
some servers do not like it there.

**ndots:2.** A `dnsConfig` on the pod with `options: [{name: ndots, value:
"2"}]` leaves the search list intact and changes the threshold. `api.stripe.com`
has two dots, two is not fewer than two, so it goes absolute-first and costs
two queries. `db.billing` has one dot, one is fewer than two, so it stays
search-first and still costs four. Two is the smallest value that keeps
every name the cluster hands out on the search-first side, which is why it
is the right number rather than one.

**A caching resolver in front.** NodeLocal DNSCache or a similar local cache
answers the eight NXDOMAINs from memory after the first time, for as long as
the negative TTL allows. The queries still happen; they stop leaving the
node. This is the fix for a fleet where you cannot change every workload,
and it is the only one that does not require knowing which names are
external. [Negative caching](/blog/dns-negative-caching) covers what the
resolver is allowed to remember and for how long.

## The search list is an order

A build server has three search domains: `eng.example.com`,
`ops.example.com`, `example.com`, in that order. A script fetches from a
host called `intranet`, which exists only as `intranet.example.com`. Every
lookup of that name from that machine sends six queries: two NXDOMAINs for
`intranet.eng.example.com`, two for `intranet.ops.example.com`, and then the
two that answer. Four failures before every success, forever, because the
domain that answers is listed last.

The list is not a set the resolver searches in parallel. glibc walks it in
the order written and stops at the first answer. Put the domain that answers
most often first, or stop using bare names in scripts at all. A script does
not benefit from the convenience the search list exists to provide.

## Six, and then unlimited

Older glibc silently used at most six search domains. resolv.conf(5) records
it: in glibc 2.25 and earlier the search list is limited to six domains with
a total of 256 characters, and since 2.26 it is unlimited.

This produces a bug that comes and goes with the operating system. A
resolv.conf with seven search domains works on a current host and fails on a
CentOS 7 box with glibc 2.17, where the seventh entry is read and dropped
without a word. A hostname that lives in the seventh domain costs fourteen
queries there, six suffixed attempts plus the name as written, each for A and
AAAA, and then the resolver reports the name unknown. Move that domain into
the first six and it resolves. Nothing in any log says why.

A search list with seven entries is also a sign that names are being typed
bare in places they should be written in full.

## The failure that is worse than slow

Everything so far costs time. One arrangement costs correctness.

Suppose the node's search domain is `internal.example.com`, and years ago
somebody added a wildcard A record for `*.internal.example.com` pointing at
an internal proxy, so that new hostnames would resolve without a ticket. A
pod calls `api.stripe.com`. Two dots, fewer than five, search first. The
three cluster domains return NXDOMAIN. The fourth attempt is
`api.stripe.com.internal.example.com`.

A wildcard matches any name beneath its zone at any depth when no closer
name exists. RFC 4592 spells this out, and it means
`api.stripe.com.internal.example.com` matches `*.internal.example.com`. The
resolver receives NOERROR and an address, and stops. The real name is never
asked for. The connection goes to the internal proxy. If the client checks
the TLS certificate, it fails on the name and somebody eventually finds this.
If it does not, the request is delivered to the wrong host with no error
recorded anywhere.

RFC 1535, from 1993, is titled "A Security Problem and Proposed Correction
With Widely Deployed DNS Software," and the problem it describes is exactly
this: search lists that append suffixes to names that were meant to be
complete, producing lookups the user never intended. The proposed
correction was the `ndots` behavior described above. Thirty years later the
correction is what makes Kubernetes cost ten queries per name, and the
original problem is still one wildcard record away.

Never put a zone that has a wildcard into a search list, and never add a
wildcard to a zone that is in one. To audit, ask for a random label under
each search domain with `dig`; a search domain that answers for a name you
made up has a wildcard in it.

## Counting it at scale

The query count is a property of the name, the resolv.conf, and the program
together, and any one of the three can double it.

The checkout pod under load opens 500 new connections a second to
`api.stripe.com` and its HTTP client does not cache lookups. Eight NXDOMAINs
per connection is 4,000 NXDOMAINs a second from one pod, plus 1,000 real
queries. That load is proportional to connections, not to distinct hostnames.
A service that talks to a single external API can dominate a cluster's DNS
traffic, and the DNS team, looking at the names being asked for, will see
nothing they recognize.

The same pod, if its runtime asked for IPv4 only, would send five queries
instead of ten, because the AAAA half of every attempt is never sent. That is
an observation, not a fix. Halving DNS traffic by refusing IPv6 trades a DNS
problem for a different one.

## What is not modeled here

This is the glibc stub resolver, which is what almost every process on a
Linux host uses. musl, which Alpine images ship, walks the search list
differently and sends its queries in parallel. systemd-resolved has its own
rules for which interfaces' search domains apply. Browsers carry their own
resolvers. The shape of the problem is the same everywhere; the exact counts
are glibc's. When the numbers on your dashboard do not match the ones above,
the first question is which resolver the program is actually using.

## The questions, in order

1. How many dots are in the name, and what is `ndots`? Fewer means
   search-first; at least `ndots` means the name as written goes first.
2. How many search domains are there, and in what order? Each one before the
   answer is two wasted queries, and on glibc before 2.26 only the first six
   count.
3. Does the name end in a dot? If so, none of the above applies and the
   lookup costs one attempt.
4. Does any search domain have a wildcard record in it? If so, the wrong
   answer arrives before the right name is asked for.
5. How many new connections a second, and does the client cache? DNS load
   here is connections times wasted attempts, not hostnames.

## References

- [resolv.conf(5)](https://man7.org/linux/man-pages/man5/resolv.conf.5.html), for the ndots sentence, the search list, and the six-domain limit before glibc 2.26
- [glibc resolv/res_query.c](https://sourceware.org/git/?p=glibc.git;a=blob;f=resolv/res_query.c), where the search walk is implemented
- [Kubernetes: DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/), for the generated resolv.conf and the dnsConfig field
- [RFC 4592, The Role of Wildcards in the Domain Name System](https://www.rfc-editor.org/rfc/rfc4592), for wildcards matching at any depth
- [RFC 1535, A Security Problem and Proposed Correction With Widely Deployed DNS Software](https://www.rfc-editor.org/rfc/rfc1535), for the original search-list problem and the ndots correction
- [RFC 2308, Negative Caching of DNS Queries](https://www.rfc-editor.org/rfc/rfc2308), for how long an NXDOMAIN may be remembered
- [Kubernetes: NodeLocal DNSCache](https://kubernetes.io/docs/tasks/administer-cluster/nodelocaldns/), for caching at the node
