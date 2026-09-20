## The reload that drops connections

A service runs four workers behind SO_REUSEPORT. A deploy restarts them one at
a time, gracefully, each one draining before it exits. Every worker reports
healthy throughout. The load balancer sees a handful of connection failures
anyway, and they are not on the worker that was restarting.

The evenness is not the problem. The evenness is real, and it is the thing
that gets measured before the option ships.

## The half that gets measured

Without the option, a second bind to the same address and port is refused:

```
the first bind to 127.0.0.1:18080    succeeded
the second bind to the same port     EADDRINUSE, "Address already in use"
```

With `SO_REUSEPORT` set on every socket before it binds, they all bind, and
400 connections land like this:

```
four listeners        [0] 107  [1]  99  [2]  97  [3]  97
the same four again   [0]  90  [1]  97  [2] 103  [3] 110
three listeners       [0] 127  [1] 141  [2] 132
five listeners        [0]  76  [1]  65  [2]  90  [3]  71  [4]  98
```

Even at four, even at four again, even at three, even at five. Nothing here is
misleading and nothing here is wrong. It is just answering a different
question from the one the outage asks.

## The half that does not

Same program, but now eight clients each connect from a **fixed source port**,
so the four tuple is identical on every run and the only thing that changes is
how many listeners exist:

```
source port   four listeners   three   five
  40001              0             0       0
  40002              2             2       3     moved
  40003              2             1       3     moved
  40004              1             1       2     moved
  40005              2             1       2     moved
  40006              3             2       3     moved
  40007              1             0       1     moved
  40008              1             1       1

4 of 8 moved when one listener left
3 of 8 moved when two joined
```

Nothing about client 40003 changed. Its address did not change, its port did
not change, the server's address and port did not change. Somebody else's
process count changed, and it started arriving at a different worker.

## Why, and how much

The kernel picks a listener by hashing the connection's four tuple and taking
the result modulo the number of sockets in the group. That is a hash, and it
distributes well, which is where the evenness comes from. It is not a
*consistent* hash, and consistency is a separate property that nothing here
provides.

A client keeps its worker only when its hash falls in the same slot under both
sizes, that is when `h mod n` equals `h mod m`. Over one full period of the
two, of length `lcm(n, m)`, exactly `min(n, m)` values satisfy that, one per
slot the two sets share. So the share that stays is

```
min(n, m) / lcm(n, m)
```

and everything else moves. Four listeners to three: 1 in 12 stays, 92 percent
move. Four to five: 1 in 20, 95 percent. Four to six: a quarter stays, because
4 and 6 share a factor, and 66 percent move rather than 83.

The measured 4 of 8 and 3 of 8 are eight samples of that, which is far too few
to see 92 percent in, and they are the right order of magnitude for "most of
them."

**I had this formula wrong.** The first version said the share that stays is
`1 / max(n, m)`, which is what you get if you reason about the larger set
alone. It agrees with the correct answer whenever the two counts are coprime,
and both of the pairs I measured, 4 to 3 and 4 to 5, are coprime. The
disagreement only appeared when a checker dealt hashed connections out across
both sets and counted, at 4 to 6, where the two formulas differ by 17
percentage points. Two measurements agreeing with a wrong rule is not a rule.

## Which is why the restart loses handshakes

A SYN arrives, hashes to worker 2, and worker 2 puts a half open connection in
its own queue. Worker 2 then exits. The client retransmits the SYN, it hashes
over the new set of three, and it arrives at worker 1, which has never heard
of it and has no half open state to complete. The handshake does not resume;
it starts over, or it times out.

The half open state does not travel, because it does not live in the port. It
lives in the listening socket that accepted the SYN, and that socket is gone.
Draining does not help: draining finishes the connections a worker already
accepted, and this one was never accepted.

The window is small, one retransmit timeout wide, per worker, per restart. On
a service taking thousands of connections a second, restarting six workers, it
is not small at all.

## What to do about it

- **Do not assume a client stays put.** Anything that caches per worker on the
  strength of "the same client comes back here" is wrong by construction, at
  any worker count above one. This includes per worker connection pools to a
  backend, per worker rate limiter state, and per worker sticky sessions.
- **Replace the hash.** `SO_ATTACH_REUSEPORT_CBPF` and its eBPF sibling let
  you supply the selection function instead of taking the kernel's. That is the
  actual fix for the restart, and it is how you get a consistent hash or a
  "send new work only to the new generation" policy.
- **Overlap the generations.** Start the new workers, let them bind alongside
  the old ones, and only then retire the old ones. The set size still changes
  twice, but at no point is it smaller than it was, and no SYN arrives at a
  port with fewer listeners than the one that took its predecessor.
- **Count failed handshakes, not worker health.** Every worker being up is
  compatible with this failure. `ListenDrops` and `ListenOverflows` in
  `/proc/net/netstat` are the counters that move, and a client that counts its
  own connect failures is better than either.
- **Do not reach for SO_REUSEPORT to make a restart seamless.** It makes a
  restart *possible* without a socket handoff, which is a real and useful
  thing. Seamless is a different feature and needs the BPF variant.

## Sources

- [socket(7), on SO_REUSEPORT and what it requires of every socket in the group](https://man7.org/linux/man-pages/man7/socket.7.html)
- [The Linux Foundation networking documentation on the reuseport group](https://docs.kernel.org/networking/index.html)
- [LWN on the SO_REUSEPORT merge and what it was for](https://lwn.net/Articles/542629/)
- [LWN on SO_ATTACH_REUSEPORT_CBPF, which is the fix](https://lwn.net/Articles/667058/)
- [Cloudflare on why SO_REUSEPORT loses connections during a restart](https://blog.cloudflare.com/the-sad-state-of-linux-socket-balancing/)

Every figure here was measured on Linux 6.18.44 over loopback TCP. The
connection loss during a real reload was not measured, and neither was UDP,
which shares the option and little else, nor listeners that differ in their
backlog or bind address, nor anything off 127.0.0.1.

The ten pools on [Even is not stable](/reuseport) are the same model, one
question each.
