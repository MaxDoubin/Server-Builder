## A transfer that got slower after it was tuned

Somebody raises `net.core.rmem_max`, adds a `setsockopt(SO_RCVBUF, ...)` to
the transfer client, and throughput goes down. The change is small, the
reasoning is sound, and the result is the opposite of what was intended.

There are four separate traps in socket buffer tuning, and that outcome needs
only the last one. I measured all four on one host.

## The sysctls next to each other are in different units

```
$ cat /proc/sys/net/ipv4/tcp_mem
191742	255659	383484
$ cat /proc/sys/net/ipv4/tcp_rmem
4096	131072	33554432
$ cat /proc/sys/net/core/rmem_max
4194304
```

`tcp_mem` is in **pages**. `tcp_rmem` and `tcp_wmem`, directly beside it, are
in **bytes**. Nothing in the names says so and nothing warns you.

The arithmetic settles it. That host has 15.7 GiB. Read as pages, the high
mark is 383484 x 4096 = 1.46 GiB, which is 9.3 percent of memory: a number
somebody chose. Read as bytes it is 0.4 MiB, or 0.0023 percent, which is not a
number anybody would choose for anything.

`/proc/net/sockstat`'s `mem` column is in pages too, so if you are comparing
the two, at least they agree with each other.

The failure mode here is a well meant tightening. Set all three `tcp_mem`
values to `262144` intending a quarter of a megabyte and you have set one
gibibyte, four thousand times more, and collapsed the three marks into one.

## The default is not doubled, and what you set is

```python
>>> s = socket.socket()
>>> s.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
131072                      # tcp_rmem's default, exactly, ratio 1.0

>>> s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 131072)
>>> s.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
262144                      # the same number, set, ratio 2.0
```

`sock_setsockopt` stores twice the requested value, so half the buffer can go
on `sk_buff` overhead rather than payload. The doubling is a property of the
assignment, not of the field.

This matters because the usual way to check a change is to read the value
before and after. Ask for 65536 on a stock host and it reads back 131072,
which is exactly `tcp_rmem`'s default, and the natural conclusion is that the
kernel refused to go below the default and rounded up. It did not. It doubled
what you asked for, and the answer coinciding with the default is a
coincidence of the numbers.

## It is clamped in silence

```python
>>> s.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 16 * 1024 * 1024)
>>> s.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)
8388608                     # 2 x rmem_max, not 2 x what was asked
```

`setsockopt` returned success. The request was clamped to
`net.core.rmem_max` before the doubling, and nothing anywhere reports that it
happened. A program that checks the return value and not the value learns
nothing at all.

## And setting it turns autotuning off

This is the one that costs throughput, and it is the one that makes the
opening story happen.

A socket nobody has touched is autotuned: the kernel grows and shrinks
`sk_rcvbuf` as the connection's needs change, and it may take it all the way
to `tcp_rmem`'s third value. On that host, **32 MiB**.

The moment you call `setsockopt(SO_RCVBUF, ...)`, the kernel stops doing that
for the life of the socket. Nothing turns it back on: not idleness, not a
change in the path, not the buffer turning out to be wrong. And the ceiling
you are now pinned under is a different sysctl: `net.core.rmem_max`, doubled,
which on that host is **8 MiB**.

```
leave it alone   autotuning may reach tcp_rmem[2]     32 MiB
tune it          pinned at 2 x rmem_max                8 MiB
```

So the largest buffer the tuning can possibly ask for is a quarter of what
doing nothing would have allowed. Raising `net.core.rmem_max` on a host where
nothing calls `setsockopt` does nothing at all, because that sysctl only ever
applies to programs that do.

Two ceilings, two sysctls, routinely left at values that do not match, and
which one applies depends on nothing but whether a line of code exists.

## What tcp_mem's three marks actually do

While we are here, they are three behaviors and not one limit with two
warnings:

- **Below the first**, the kernel does not do the global accounting at all.
  A zero in `sockstat`'s `mem` column on a lightly loaded host means you are
  under this mark, not that accounting is broken. Measured on a quiet box: 42
  established connections, `TCP: ... mem 0`.
- **Between the first and second**, it charges normally.
- **Past the second**, it enters the pressure state and begins *shrinking per
  socket buffers*. This is the interesting one, because it shows up as
  throughput falling on every connection at once and as an error nowhere.
- **Past the third**, it refuses allocations.

The gap between the second and third marks is where the kernel gets to
degrade instead of fail. Closing it, which is what setting all three equal
does, converts a slowdown into an outage.

## What to actually do

**Do not set SO_RCVBUF** unless you have a requirement autotuning cannot
meet. It is the right default for almost everything, and especially for
anything long lived over a path whose latency you do not control.

**If you must set it**, raise `net.core.rmem_max` to at least half of
`tcp_rmem`'s third value first, or you are capping the thing you meant to
widen. And read the value back afterward, because the clamp is silent.

**To widen autotuned sockets**, raise `tcp_rmem`'s third value.
`net.core.rmem_max` is not the knob for that, however much it sounds like it.

**Convert tcp_mem before believing it**, and keep the three marks apart.

**Halve what getsockopt tells you** to get the size you asked for.

## Sources

- [socket(7), on SO_RCVBUF and the doubling](https://man7.org/linux/man-pages/man7/socket.7.html)
- [tcp(7), on tcp_mem, tcp_rmem and autotuning](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [Documentation/networking/ip-sysctl.rst](https://docs.kernel.org/networking/ip-sysctl.html)
- [net/core/sock.c, sock_setsockopt's SO_RCVBUF path](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/core/sock.c)

Every measurement here was taken on Linux 6.18.44 with 15.7 GiB of memory.
Only socket options were changed, so there was nothing to restore.
