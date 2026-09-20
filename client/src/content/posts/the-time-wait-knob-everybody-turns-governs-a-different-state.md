## The advice that does nothing

Somebody opens an incident because a host has tens of thousands of sockets in
TIME_WAIT. Within a few minutes a runbook or a search result says the same
thing it has said for fifteen years: lower `net.ipv4.tcp_fin_timeout`. It gets
applied fleet wide that afternoon, and the count does not move.

It does not move because that knob has nothing to do with TIME_WAIT. It
governs a different state, and the difference is measurable in about ninety
seconds.

## The measurement that settles it

Set the knob as low as anybody would dare, open a loopback connection, close
both ends, and watch `/proc/net/tcp` until the socket disappears.

```
tcp_fin_timeout set to 5 (was 60)
client port 56994: FIN_WAIT2  (closer, waiting for the peer's FIN)
client port 56994: TIME_WAIT  (peer FIN seen and ACKed)
  t+ 60.2s  TIME_WAIT -> None

TIME_WAIT lasted 60.2s with tcp_fin_timeout=5
```

Sixty seconds, with the knob at five.

TIME_WAIT runs for `TCP_TIMEWAIT_LEN`, which `include/net/tcp.h` defines as
`60 * HZ`. It is a constant in a header, fixed when the kernel was compiled.
Nothing in `/proc/sys` reaches it. You can set `tcp_fin_timeout` to 1, the
lowest value the kernel accepts, and TIME_WAIT is still a minute.

The reason it is sixty seconds is not arbitrary. TIME_WAIT exists so the
closing side can absorb a retransmitted FIN and so that stray segments from
the old connection die before the same four tuple can be reused. RFC 9293
puts it at twice the maximum segment lifetime. Shortening it does not make the
old segments go away, it just stops you from noticing them.

## The state the knob does govern

The knob is not useless. It is named after the state it actually controls, and
people read the name as if it said something else.

`FIN_WAIT2` is where a socket sits after it has closed and while it waits for
the peer's FIN. On an orphaned socket, one whose process has gone, that wait is
exactly what `tcp_fin_timeout` bounds. Same host, same method, two settings:

```
  fin_timeout= 5  t+  0.0s  None -> FIN_WAIT1
  fin_timeout= 5  t+  0.3s  FIN_WAIT1 -> FIN_WAIT2
  fin_timeout= 5  t+  5.3s  FIN_WAIT2 -> None

  fin_timeout=20  t+  0.0s  None -> FIN_WAIT1
  fin_timeout=20  t+  0.3s  FIN_WAIT1 -> FIN_WAIT2
  fin_timeout=20  t+ 20.9s  FIN_WAIT2 -> None
```

5.3 seconds and 20.9 seconds. It does what it says. It is a FIN timeout, and
TIME_WAIT is not waiting for a FIN.

So the usual advice has a real cost even when it appears to do nothing. It
shortens a timeout that was protecting you against peers that go quiet
mid-close, and it does that silently, on every host in the fleet, while the
number in the ticket stays where it was.

## TIME_WAIT lands on whoever hangs up first

The second surprise is about which machine accumulates them. Watching both
ends of a connection where the client closed first:

```
after the CLIENT (56658) closes first:
    39193 -> 56658  CLOSE_WAIT      the server
    56658 -> 39193  FIN_WAIT2       the client
```

The client walks FIN_WAIT1 to FIN_WAIT2 to TIME_WAIT. The server sits in
CLOSE_WAIT and never enters TIME_WAIT at all.

TIME_WAIT belongs to whoever sends the first FIN. A server drowning in it is a
server that closes its own connections, and the common way to arrange that is
a keepalive timeout on the server shorter than the client's. The client thinks
the connection is still good, the server hangs up first, and the server keeps
the socket for a minute.

That makes the lever a configuration change rather than a sysctl: raise the
server's idle timeout above the client's and the first FIN moves to the client,
taking the TIME_WAIT with it.

It also means that a pile of CLOSE_WAIT is a completely different bug.
CLOSE_WAIT is the kernel waiting for **your** process to call `close()`, and no
timeout will clear it, because the kernel is not the one being slow.

## The ceiling is arithmetic, not a sysctl

On a client, TIME_WAIT matters for exactly one reason: it holds a four tuple.
That is a counting problem with a known answer.

```
ip_local_port_range      32768 60999
ephemeral ports          28,232
TIME_WAIT length         60s
ceiling to ONE dst       470.5 connections per second, sustained
```

470 a second to any one destination address and port. Past that, the range is
exhausted and `connect()` starts returning `EADDRNOTAVAIL`.

The thing that gets missed is the denominator. What has to be unique is the
whole four tuple, not the local port, so a second destination address doubles
the ceiling and a pool of six multiplies it by six. This is why the same code
exhausts ports against a single backend and is completely healthy against a
load balanced set, with nothing about the client changed.

Widening `ip_local_port_range` to the full sixteen bits takes 28,232 to about
64,000, which is roughly twice the headroom and then you are out of integers.
Adding destinations, or not opening a connection per request in the first
place, is where the actual room is.

## The two knobs people reach for next

`net.ipv4.tcp_tw_reuse` lets the connect path take over a TIME_WAIT slot the
local host owns. Two things about it are routinely missed. It only serves
**outbound** connections, so it does nothing at all for a server holding
TIME_WAIT from its own closes. And it needs `net.ipv4.tcp_timestamps` to tell
a stray old segment from a new one, so a hardening baseline that turned
timestamps off to hide uptime has quietly turned reuse off too.

The modern default is worth reading carefully:

```
tcp_tw_reuse   2      0 off, 1 on, 2 loopback only
tcp_timestamps 1
```

`2` is not `on`. It covers loopback and nothing else.

`net.ipv4.tcp_tw_recycle` is the other half of every old tuning guide, and it
is gone. There is no such file on a modern kernel; it was removed in 4.12. It
dropped connections from clients that shared a source address without sharing
a timestamp clock, which describes every NAT on the internet, and it had been
breaking things quietly for years before it was taken out. A runbook that
still sets it is a runbook nobody has read in a decade.

## The cap that counts sockets, not seconds

`net.ipv4.tcp_max_tw_buckets` caps how **many** sockets may be in TIME_WAIT.
It has never had anything to do with how long.

```
tcp_max_tw_buckets 65536      2.32x the whole ephemeral range
```

Past the cap the kernel destroys the excess immediately and logs
`TCP: time wait bucket table overflow`. That log line is sometimes read as
proof the tuning worked. It is the opposite: it is the kernel telling you it is
skipping the protocol's safety window, on an arbitrary subset of connections,
because you gave it no other option.

## What to actually do

In order of how much it helps:

1. **Stop opening so many connections.** Pooling, or keepalive that actually
   stays alive, removes the problem rather than moving it. Everything else on
   this list is a workaround.
2. **Work out which end closes first,** and if it is the server, ask whether it
   should be. An idle timeout shorter than the client's is usually an accident.
3. **Spread across destinations.** The ceiling is per four tuple, so this is
   real headroom, not a trick.
4. **On a client tier, turn on `tcp_tw_reuse`,** and check that
   `tcp_timestamps` is 1 while you are there, because reuse without it does
   nothing.
5. **Leave `tcp_fin_timeout` alone** unless FIN_WAIT2 is what you are actually
   looking at. It is a real knob for a real state, and it is not this one.

And if you find TIME_WAIT sockets on a host and nothing is actually failing,
the correct action is usually none. They are a bounded, expected cost of
closing connections. A count is not an incident until something returns an
error.

## Sources

- [RFC 9293, TCP, on TIME-WAIT and 2MSL](https://www.rfc-editor.org/rfc/rfc9293.html)
- [include/net/tcp.h, where TCP_TIMEWAIT_LEN is defined](https://elixir.bootlin.com/linux/latest/source/include/net/tcp.h)
- [Documentation/networking/ip-sysctl.rst](https://docs.kernel.org/networking/ip-sysctl.html)
- [tcp(7), on tcp_fin_timeout, tcp_tw_reuse and tcp_max_tw_buckets](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [Vincent Bernat, Coping with the TCP TIME-WAIT state on busy Linux servers](https://vincent.bernat.ch/en/blog/2014-tcp-time-wait-state-linux)

Every measurement here was taken on Linux 6.18.44 by watching `/proc/net/tcp`
on loopback connections. `tcp_fin_timeout` was restored after each run, and
nothing else was changed.

The ten hosts on [Still a minute](/timewait) are the same model, one question
each.
