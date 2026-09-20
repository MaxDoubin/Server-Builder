## Two hundred arrived, three got in, none were refused

Yesterday's piece on [the accept queue](/blog/the-connection-opened-and-then-nothing-happened)
says this about what an overflow does to a client:

> It drops the final ACK and sends nothing back, so `connect()` has already
> returned and the client's first request goes into silence until a
> retransmission finds room.

That is one of two ways a full accept queue drops a connection, and it is not
the one that fired here. Two hundred clients were pointed at a listener with
room for three, every `connect()` issued non-blocking and all at once:

```
capacity 3 (listen(fd, 2)), server never calls accept()

  arriving   reached ESTABLISHED   server could accept   left in SYN_SENT
         4                     3                     3                  1
         8                     3                     3                  5
        20                     3                     3                 17
        60                     3                     3                 57
       200                     3                     3                197
```

Not one of the 197 believed it was connected. `connect()` had not returned for
any of them, there was nothing to write a request into, and `/proc/net/tcp` on
the server showed the listener plus the three that got in and no trace at all
of the other 197.

## There are two overflow sites and they are not alike

The first is in `tcp_conn_request()`, `net/ipv4/tcp_input.c`, and it runs when
the SYN arrives:

```c
if (sk_acceptq_is_full(sk)) {
        NET_INC_STATS(sock_net(sk), LINUX_MIB_LISTENOVERFLOWS);
        goto drop;
}

req = inet_reqsk_alloc(rsk_ops, sk, !want_cookie);
```

The test is above the allocation. When the queue is already full there is never
a request sock, so there is never a SYN-ACK, so the client stays in SYN_SENT
holding a handshake that the server has no record of. Older kernels guarded
this with `inet_csk_reqsk_queue_young(sk) > 1`, which let the first few
connections through the door anyway. That guard is gone.

The second is in `tcp_v4_syn_recv_sock()`, `net/ipv4/tcp_ipv4.c`, and it runs
when the final ACK arrives:

```c
if (sk_acceptq_is_full(sk))
        goto exit_overflow;

newsk = tcp_create_openreq_child(sk, req, skb);
```

Here the request sock already exists and the SYN-ACK has already gone out, so
the client really is established, really has had `connect()` return, and really
will sit there sending a request into a socket the server will never accept.
This is the path yesterday's piece describes, and it is real. Reaching it needs
the queue to fill in the window between the SYN and the final ACK.

Both counters land in the same place, which is why `ListenOverflows` cannot
tell you which one you have:

```
$ nstat -az TcpExtListenOverflows TcpExtListenDrops
```

The symptom tells you instead. A stalled request on an open connection is the
second. A `connect()` that never returns is the first. In a sustained overload,
where the queue is full before the next SYN turns up, the first is what you get,
and everything written about the second stops applying.

Every measurement below is loopback, where the gap between the SYN and the
final ACK is microseconds. That is exactly why the second site never fired:
200 simultaneous connects could not open the window wide enough to hit it. On a
real network with milliseconds of round trip, it is much easier to hit, and a
service under partial load will produce both.

## It is not a refusal, and that is the whole diagnostic problem

Two ports on the same host, one with nothing listening and one with a full
accept queue:

```
nothing listening        ECONNREFUSED after 0.0001 s
full accept queue        still waiting after 20 s, SO_ERROR still 0
```

A refusal is an answer. It arrives in a tenth of a millisecond, it names the
problem, and every client library turns it into an error you can search for. An
overflow is not an answer. It is indistinguishable, from the client, from a
cable pulled out of a switch, and it stays that way for as long as the client
is willing to wait.

## The retry clock is not the one you remember

Because the client is the one retransmitting, the thing that decides when it
gets another chance is the client's SYN timer. Timing every SYN that hit the
full queue, by watching `ListenOverflows` at 10 ms resolution:

```
net.ipv4.tcp_syn_linear_timeouts   seconds at which a SYN went out
                               0   0, 1, 3, 7, 15, 31
                               1   0, 1, 2, 4, 8, 16, 32
                               2   0, 1, 2, 3, 5, 9, 17, 33
                               4   0, 1, 2, 3, 4, 5, 7, 11, 19, 35
                               8   0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 15, 23, 39
```

Only the top row is the doubling everybody quotes. `tcp_syn_linear_timeouts`
arrived in Linux 6.0 and defaults to 4, so on anything current the client gets
several retries a second apart before the backoff starts. The rule the five
rows agree on is that there are `linear + 1` gaps of one second and then the
doubling begins at two. The extra one is the initial RTO, which is already a
second and is not counted as one of the linear ones.

What it does not buy is patience. Timing a blocking `connect()` into a full
queue all the way to `ETIMEDOUT`:

```
linear_timeouts 0     ETIMEDOUT after 129.5 s
linear_timeouts 4     ETIMEDOUT after 135.1 s
linear_timeouts 8     ETIMEDOUT after 139.2 s
```

Eight percent across the whole range. The sysctl changes when the retries
happen, not how long the client waits in total, and the total is set by
`tcp_syn_retries`, which is 6 by default and means the elapsed time that six
doubling retransmissions would have taken: 1 + 2 + 4 + 8 + 16 + 32 + 64, which
is 127 seconds.

## The slot opens and nobody comes in

A queue of two, filled, one more client waiting, and `accept()` called exactly
once at a chosen moment:

```
  slot opened at   client was in at
           0.2 s             1.02 s
           1.5 s             2.04 s
           2.5 s             3.06 s
           4.0 s             4.08 s
           8.0 s            11.28 s
```

Nothing on the server can tell the client to try again, because the server has
no idea the client exists. The slot sits empty until the client's next SYN
happens to arrive, which in the last row is three and a quarter seconds later.

This is the shape of the latency an overloaded service produces: not a smooth
curve that gets worse with load, but a staircase at 1, 2, 3, 4, 5, 7, 11
seconds, with the steps set by a sysctl on the client and nothing to do with
how long the work takes. If your latency histogram has a spike at exactly one
second and another at exactly three, this is worth ruling out before anything
else.

## somaxconn is read once, inside listen()

```
somaxconn was 4 when listen(fd, 64) ran        5 connections completed
somaxconn raised to 64, socket untouched       5 connections completed
listen(fd, 64) called again on that socket    20 connections completed
```

`__sys_listen_socket()` reads the sysctl, clamps the argument, and hands the
result to the protocol, which stores it in `sk_max_ack_backlog`. Nothing reads
the sysctl again. So the `sysctl -w net.core.somaxconn=4096` in the runbook
changes nothing about anything already running, the dashboard reads 4096 while
the queue is still the old size, and the fix lands at the next restart, which is
usually well after the incident that prompted it.

## The client that gave up still costs you an accept

A queue of three, filled, and then all three clients closed:

```
filled with                                      3
all three clients closed
further connections that then fit                0
connections accept() handed back                 3
recv() on each                                   b'' (end of file)
send() on each                                   EPIPE
```

Hanging up does not release the slot. The queue still counts three, no new
connection can get in, and when the server finally reaches them it pays a full
`accept()`, a read and a failed write for each, for clients that left a minute
ago.

That is the mechanism behind a server that stays pinned at full load after the
traffic has stopped. Every slot is a request that has already timed out at the
other end, the server cannot tell which, and the deeper the queue the further
behind it works. A large backlog does not absorb a burst so much as store it.

## What to do about it

1. **Check the symptom before the theory.** `connect()` that never returns is
   the SYN being dropped. A connection that opens and then stalls is the final
   ACK being dropped. They have the same counter and different causes.
2. **Do not read a silent client as a network problem.** It looks exactly like
   one, on purpose, because the server has said nothing.
3. **Restart the listener after raising somaxconn,** or accept that you have
   changed a number and nothing else.
4. **Measure `ListenOverflows` as a rate, not a total.** It is cumulative since
   boot and it moves every time a SYN bounces, so a single stuck client adds one
   per retransmission.
5. **Treat a deep backlog as a buffer of stale work,** not as headroom. Shedding
   load at the front door beats queueing it where nobody can cancel it.
6. **Compare a small `listen()` argument against `somaxconn`.** The smaller wins,
   and the queue holds one more than the smaller, which is the arithmetic in
   [the piece from yesterday](/blog/the-connection-opened-and-then-nothing-happened).

## Sources

- [listen(2), on the backlog argument and the silent cap](https://man7.org/linux/man-pages/man2/listen.2.html)
- [tcp(7), on tcp_syn_retries, tcp_abort_on_overflow and tcp_max_syn_backlog](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [ip-sysctl.txt, on tcp_syn_linear_timeouts](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)
- [tcp_conn_request(), net/ipv4/tcp_input.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/ipv4/tcp_input.c)
- [tcp_v4_syn_recv_sock(), net/ipv4/tcp_ipv4.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/ipv4/tcp_ipv4.c)
- [connect(2), on ETIMEDOUT and ECONNREFUSED](https://man7.org/linux/man-pages/man2/connect.2.html)

Every measurement here was taken on Linux 6.18.44 over loopback, with
net.core.somaxconn writable, so both halves of the capacity could be moved
rather than one. Counts are from /proc/net/tcp and /proc/net/netstat rather
than from a tool that summarizes them.

The ten listeners on [The server is idle and the connections are timing out](/backlog)
model the second overflow site, where the request sock survives and the server
retransmits the SYN-ACK.
