## A socket that outlived the machine

A database failover takes four seconds. The application notices fifteen
minutes later.

The pool still holds a connection to the old primary. The host is gone, the
address does not answer, and every write on that socket is sitting in the
kernel being retransmitted. Nothing in the application is broken: it is
blocked in `send`, waiting for a TCP stack that has not given up yet and, by
its own rules, is not close to giving up.

The setting that governs this is `tcp_retries2`, and reading its
documentation is what makes the behavior confusing rather than clear.

## What the manual page says

From tcp(7):

> **tcp_retries2** (integer; default: 15; since Linux 2.2)
>
> The maximum number of times a TCP packet is retransmitted in established
> state before giving up. The default value is 15, which corresponds to a
> duration of approximately between 13 to 30 minutes, depending on the
> retransmission timeout. The RFC 1122 specified minimum limit of 100 seconds
> is typically deemed too short.

Two claims there. It is a maximum number of retransmissions, and the duration
depends on the retransmission timeout. Neither is true of the code.

## What the kernel does

`net/ipv4/tcp_timer.c`:

```c
static bool retransmits_timed_out(struct sock *sk,
				  unsigned int boundary,
				  unsigned int timeout)
{
	struct tcp_sock *tp = tcp_sk(sk);
	unsigned int start_ts, delta;

	if (!inet_csk(sk)->icsk_retransmits)
		return false;

	start_ts = tp->retrans_stamp;
	if (likely(timeout == 0)) {
		unsigned int rto_base = TCP_RTO_MIN;

		if ((1 << sk->sk_state) & (TCPF_SYN_SENT | TCPF_SYN_RECV))
			rto_base = tcp_timeout_init(sk);
		timeout = tcp_model_timeout(sk, boundary, rto_base);
	}
	...
```

The counter is checked once, for zero, and then ignored. What actually decides
the question is `delta`, the wall clock since `retrans_stamp`, against
`timeout`. The `boundary` argument, which is `tcp_retries2`, is an input to a
model that produces a number of milliseconds.

And note where `rto_base` comes from. It is `TCP_RTO_MIN`. The override to the
connection's own initial timeout applies only in the two SYN states. For an
established connection, the model is built from a constant.

```c
static unsigned int tcp_model_timeout(struct sock *sk,
				      unsigned int boundary,
				      unsigned int rto_base)
{
	unsigned int linear_backoff_thresh, timeout;

	linear_backoff_thresh = ilog2(tcp_rto_max(sk) / rto_base);
	if (boundary <= linear_backoff_thresh)
		timeout = ((2 << boundary) - 1) * rto_base;
	else
		timeout = ((2 << linear_backoff_thresh) - 1) * rto_base +
			(boundary - linear_backoff_thresh) * tcp_rto_max(sk);
	return jiffies_to_msecs(timeout);
}
```

`include/net/tcp.h` supplies the two constants:

```c
#define TCP_RTO_MAX_SEC 120
#define TCP_RTO_MAX	((unsigned)(TCP_RTO_MAX_SEC * HZ))
#define TCP_RTO_MIN	((unsigned)(HZ / 5))
```

So `linear_backoff_thresh` is `ilog2(120 / 0.2)`, which is `ilog2(600)`, which
is 9. At the default boundary of 15 the second branch applies:

```
(2^10 - 1) * 200ms  +  (15 - 9) * 120s
     204.6 s        +       720 s       =  924.6 s
```

**924.6 seconds.** Fifteen minutes and twenty-five seconds, on every Linux host
in the world, whatever the path, whatever the round trip time, whatever the
connection's measured RTO. The "13 to 30 minutes, depending on the
retransmission timeout" in the manual page describes a dependency the code does
not have.

## Measuring it

The derivation is only as good as my reading, so I ran it. Root on a Linux
container, a listener on loopback, an `iptables` rule dropping the server's
replies so nothing the client sends is ever acknowledged, and the system-wide
`RetransSegs` counter sampled either side.

First, the constants, from the same kernel, without reading a header:

```
$ grep -A1 '^Tcp:' /proc/net/snmp | head -2
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens ...
Tcp: 1 200 120000 -1 ...
```

`RtoMin 200`, `RtoMax 120000`. Then two runs, at values small enough to wait
for:

| `tcp_retries2` | model says | measured abort | model sends | measured `RetransSegs` |
|---|---|---|---|---|
| 5 | 12.6 s | 13.25 s | 6 | **6** |
| 6 | 25.4 s | 26.39 s | 7 | **7** |

The wall clock runs a little past the modeled budget because `retrans_stamp`
is set at the *first retransmission* rather than at the original send, so one
RTO elapses before the clock starts, and the kernel allows itself a jiffy of
slack besides. The retransmission counts have no such fuzz, and they are one
more than the number in the sysctl.

That is worth saying plainly. **Set `tcp_retries2` to 5 and you get 6
retransmissions.** The series `(2 << boundary) - 1` sums `boundary + 1` terms,
so the budget always covers one more interval than the name suggests.

## The part that actually bites

The off-by-one is a curiosity. This is the problem:

| path RTO | budget | retransmissions |
|---|---|---|
| 200 ms | 924.6 s | 16 |
| 300 ms | 924.6 s | 16 |
| 600 ms | 924.6 s | 15 |
| 1 s | 924.6 s | 14 |
| 2 s | 924.6 s | 13 |
| 5 s | 924.6 s | 12 |

The deadline is modeled from a constant. The retransmission schedule is not:
it backs off from the connection's real RTO, doubling until it hits the 120
second ceiling. A connection with a 5 second RTO reaches that ceiling in five
doublings rather than ten, and burns the same 924.6 second budget in twelve
attempts instead of sixteen.

So the worse the path, the *fewer* chances to recover in the same amount of
time. Which is precisely backwards from what you would design, and invisible
from the setting's name.

At around 600 ms the count happens to come out at 15 and the sysctl looks
honest. That is the coincidence that keeps the misunderstanding alive: somebody
tests on a path of roughly that shape, sees fifteen retransmissions, and
concludes the documentation is right.

## The knee at nine

One more thing the name hides. The relationship between the sysctl and the
time is exponential below the threshold and linear above it:

| `tcp_retries2` | budget |
|---|---|
| 3 | 3.0 s |
| 5 | 12.6 s |
| 8 | 102.2 s |
| 9 | 204.6 s |
| 10 | 324.6 s |
| 15 | 924.6 s |
| 20 | 1524.6 s |

Below nine, each step doubles. At nine and above, each step adds a flat two
minutes. Halving the sysctl from 15 to 8 does not halve the wait; it cuts it by
a factor of nine. Raising it from 15 to 20 does not double it; it adds exactly
ten minutes.

Neither behavior is documented anywhere, and no arithmetic you do in your head
from the numbers 8, 9 and 10 will tell you that 8 is 102 seconds and 10 is 325.

## What to do instead

`TCP_USER_TIMEOUT`. It is the third argument to `retransmits_timed_out`, and
the model is built *only* when that argument is zero:

```c
	if (likely(timeout == 0)) {
		...
		timeout = tcp_model_timeout(sk, boundary, rto_base);
	}
```

Pass a non-zero value and the model is never built, the constant is never
consulted, and your milliseconds are the deadline:

```c
unsigned int ms = 20000;
setsockopt(fd, IPPROTO_TCP, TCP_USER_TIMEOUT, &ms, sizeof(ms));
```

It is the only setting in this entire mechanism whose value means what it says.
It is per socket, so a database client can have twenty second failure detection
on a host where everything else waits a quarter of an hour, with no sysctl, no
reboot, and no conversation with whoever owns the machine.

Most connection pool libraries expose it. If yours does not, it is four lines
around the socket.

## One argument for the default

Before shortening this everywhere: the same patience that leaves a dead socket
sitting for fifteen minutes is what carries a live one through a switch reboot.
A forty-five second outage on a 300 ms path costs eight retransmissions and the
application never learns it happened. Set `TCP_USER_TIMEOUT` to five seconds
across a fleet and you have converted every transient blip into a reconnect
storm.

The point is not that the default is too long. It is that the number you set to
change it does not mean what its name says, does not do what its documentation
says, and produces a different outcome on every path in your estate.

## The short version

`tcp_retries2` is not a count. It is an index into a modeled time budget, and
the model is built from a compile-time constant rather than from your
connection. The default is 924.6 seconds everywhere. The number of
retransmissions that actually go out is one more than the sysctl on a fast path
and fewer on a slow one. The curve has a knee at nine that nothing documents.
And `TCP_USER_TIMEOUT` is the one knob here that is a deadline rather than a
parameter.
