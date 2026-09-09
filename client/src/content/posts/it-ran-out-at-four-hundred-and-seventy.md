## Cannot assign requested address

An application starts logging connection failures under load. The error, if
you are lucky enough to see the real one rather than a wrapper's paraphrase,
is `EADDRNOTAVAIL`, which the C library renders as "cannot assign requested
address".

The host has 28,232 ephemeral ports. The backend it is talking to is idle.
Nothing is listening on anything relevant, no firewall changed, and the
number of connections in flight is a few hundred.

The arithmetic is two numbers and one of them is a constant:

```
28232 ports / 60 seconds = 470 connections per second
```

That is the ceiling, to one destination, on a default Linux host, and it is
an order of magnitude below what "twenty eight thousand ports" suggests.

## Sixty seconds, and there is no knob

Every connection the host closes leaves the local port in TIME_WAIT, and it
stays there for:

```c
#define TCP_TIMEWAIT_LEN (60*HZ) /* how long to wait to destroy TIME-WAIT
                                  * state, about 60 seconds     */
```

A compile time constant in `include/net/tcp.h`. There is no sysctl behind it.
You cannot shorten it, and the steady state occupancy is therefore the
connection rate times sixty, always.

The reason it exists is worth a sentence, because "just remove it" comes up
every time. A closed connection's final ACK can be lost, in which case the
peer retransmits its FIN and needs something to answer. And a delayed
duplicate from the old connection can still be wandering the network; if the
same four tuple is reused immediately, that packet arrives inside a different
connection and is accepted. Two minutes of maximum segment lifetime is the
theory and sixty seconds is what Linux picked.

## The knob everyone turns instead

`net.ipv4.tcp_fin_timeout`. Set it to 15, the guides say, and TIME_WAIT
clears four times faster.

It does not, because `tcp_fin_timeout` is a different state. It is FIN_WAIT2:
the timer for a socket that has closed and is waiting for a peer that may
never send its own FIN. `tcp(7)` says so directly, describing it as "how many
seconds to wait for a final FIN packet before the socket is forcibly closed"
and noting it is a violation of the specification required to prevent denial
of service.

The confusion is completely understandable, and it is the kernel's fault:

```c
#define TCP_FIN_TIMEOUT	TCP_TIMEWAIT_LEN
```

The default for one is *defined as* the other. Both are sixty. They look like
the same knob at the same value. Only one of them moves, and it is not the one
in the way.

## A socket is four values, not one

Here is the part that turns this from a capacity problem into a design
question.

A local port is not "in use". A *socket* is in use, and a socket is
`(saddr, sport, daddr, dport)`. When `connect()` picks an ephemeral port, the
kernel calls `__inet_check_established`, which builds a cookie from both
addresses and a pair from both ports:

```c
INET_ADDR_COOKIE(acookie, saddr, daddr);
const __portpair ports = INET_COMBINED_PORTS(inet->inet_dport, lport);
...
if (likely(inet_match(net, sk2, acookie, ports, dif, sdif))) {
```

and rejects the candidate only when the **whole tuple** already exists. Local
port 41000 can be in TIME_WAIT against ten different backends simultaneously
and still be free for an eleventh.

So exhaustion is per destination. Which produces the two readings that look
identical and are not:

- Five hundred connections a second to one database. 30,000 sockets, one
  destination, a range of 28,232. Broken.
- Five hundred connections a second spread over ten backends. 30,000 sockets,
  3,000 per destination, the same range. Nowhere near anything.

`ss -tan state time-wait | wc -l` prints 30,000 in both cases. That number, on
its own, tells you nothing at all. The one that matters is the split:

```
$ ss -tan state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
  30000 10.0.1.20
```

One line means you have a problem. Ten lines of three thousand means you do
not.

## Whoever closes first holds it

TIME_WAIT sits on the end that sent the first FIN. That decides whose problem
it is, and the answer is less symmetrical than it sounds.

A client that closes holds TIME_WAIT on its own ephemeral port against the
server's fixed address and port. The varying half of the tuple is the client's
own range, and that range is what runs out.

A server that closes holds TIME_WAIT on its listening port, say 443, against
the client's address and ephemeral port. The varying half is the client's. The
server consumes none of its own ephemeral range, because it never allocated
from it. Three hundred thousand sockets in TIME_WAIT on a busy front end is
memory and hash table pressure, and it is emphatically not port exhaustion,
and the two have nothing in common as problems.

If the socket count itself is the concern, `tcp_max_tw_buckets` caps it.
`tcp(7)` is blunt about what that is for: "This limit exists only to prevent
simple denial-of-service attacks", and over the cap the kernel closes sockets
and prints a warning. It is a guard rail, not a tuning parameter.

## What actually helps, in order of how much

**A connection pool.** This is the only one that changes the shape rather than
the size. A pooled connection is not closed, it is handed back, so it never
enters TIME_WAIT at all. Six hundred held connections serve five hundred
requests a second with a TIME_WAIT count of zero. The pool has to be per
destination, and a pool smaller than the arrival rate leaves the overflow
churning: a hundred connections against five hundred a second still parks
24,000 ports, which fits and has almost no headroom.

**More destinations.** Not usually something you choose, but it explains why
the same client code is fine against a load balanced pool of ten and fails
against a single primary.

**`tcp_tw_reuse`.** A new outgoing connection takes over a matching TIME_WAIT
socket when the timestamps say the old one cannot still have packets in
flight. You can see the path in the same function: it finds the TIME_WAIT
socket, calls `tcp_twsk_unique`, and on success unhashes the old one and
increments `LINUX_MIB_TIMEWAITRECYCLED`. Two limits. It is outbound only, so a
server drowning in TIME_WAIT gets nothing from it, and it needs timestamps at
both ends.

Its sibling `tcp_tw_recycle` applied the same idea to inbound connections
using per-host timestamps, which broke every client behind a NAT because
several hosts share an address and their timestamps do not agree. It was
removed in 4.12 rather than fixed. If a tuning guide still recommends it, the
guide predates 2017 and you should not trust the rest of it either.

**A wider range.** Linear and it runs out quickly. The whole unprivileged
space is 64,512 ports, which buys 1,075 connections a second and no more.

## And one that makes it worse

`ip_local_port_range` defaults to 32768 60999, which
`Documentation/networking/ip-sysctl.rst` states directly. A hardening baseline
that narrows it to 10000 20000 leaves 10,001 ports and a ceiling of 166
connections a second, and a service doing two hundred, which worked
everywhere else, now fails on the new image.

There is no security value in a narrow ephemeral range on a host making
outbound connections. The ports are the client's own, nothing is listening on
them, and no scanner cares. If a baseline demands it, the exception is the fix
and this arithmetic is what to put in the ticket.

## Reading it on a real host

```
$ sysctl net.ipv4.ip_local_port_range
net.ipv4.ip_local_port_range = 32768	60999
```

Divide the width by sixty. That is your ceiling per destination.

```
$ ss -tan state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn
```

The split, which is the only view that means anything. Compare the largest
line against the ceiling, not the total against the range.

```
$ ss -tan state time-wait | head -3
```

Look at whose port varies. If the local port is always the same, you are the
server and this is not your ephemeral range.

Then three questions:

1. Which destination? Not how many sockets. One destination over the ceiling
   with a large total is the normal shape of this, and a large total spread
   evenly is nothing.
2. Which end closes? A server holding TIME_WAIT is a different problem with a
   different fix, and often with no fix needed.
3. Is there a pool, and is it per destination and larger than the rate? That
   is the answer, and everything else on this page is what to do while you
   build it.

And if somebody has already set `tcp_fin_timeout`, put it back. It changed
nothing, and leaving it there means the next person spends an afternoon
believing TIME_WAIT is fifteen seconds on this host.

You can work through ten of these, including the one holding thirty thousand
sockets with nothing wrong and the one that broke at two hundred a second, at
[out of ports](/ports).

## References

- [net/ipv4/inet_hashtables.c, where the four tuple is compared](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/ipv4/inet_hashtables.c)
- [include/net/tcp.h, for TCP_TIMEWAIT_LEN and TCP_FIN_TIMEOUT](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/net/tcp.h)
- [tcp(7), on tcp_tw_reuse, tcp_fin_timeout and tcp_max_tw_buckets](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [Documentation/networking/ip-sysctl.rst, on ip_local_port_range and its defaults](https://docs.kernel.org/networking/ip-sysctl.html)
