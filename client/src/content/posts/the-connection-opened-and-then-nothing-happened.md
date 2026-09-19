## Four seconds of nothing, on a box at six percent

An nginx instance in front of an application server, 32 cores, and this is the
CPU graph for the window everyone is arguing about:

```
$ mpstat 1 3
Average:  all  5.91  0.00  0.72  0.04  0.00  0.11  0.00  0.00  0.00  93.22
```

Load average under two, no disk wait, no 5xx in the access log, nothing in
dmesg. What the clients report is connections that open and then sit there for
three or four seconds, in clumps.

The number that explains it is here:

```
$ ss -ltn 'sport = :443'
State    Recv-Q   Send-Q       Local Address:Port    Peer Address:Port
LISTEN   512      511                 0.0.0.0:443            0.0.0.0:*

$ nstat -az TcpExtListenOverflows TcpExtListenDrops
#kernel
TcpExtListenOverflows           500                0.0
TcpExtListenDrops               500                0.0
```

Two things in that output are surprising, and one of them is the whole
incident. Send-Q says 511 on a host where `net.core.somaxconn` is 4096, and
Recv-Q says 512, one more than the limit it is measured against.

## listen() does not install the backlog you passed

`__sys_listen_socket()` in `net/socket.c` clamps the argument before the
protocol ever sees it:

```c
somaxconn = READ_ONCE(sock_net(sock->sk)->core.sysctl_somaxconn);
if ((unsigned int)backlog > somaxconn)
        backlog = somaxconn;
```

The man page says the same thing in words, and the adverb is the important
part: "If the backlog argument is greater than the value in
`/proc/sys/net/core/somaxconn`, then it is silently capped to that value."
Silently. No error from `listen()`, no log line, and no API to read back what
you asked for.

Which way the clamp bites depends entirely on the software. systemd is so
resigned to it that `systemd.socket(5)` documents `Backlog=` as defaulting to
4294967295 and then adds: "Note that this value is silently capped by the
`net.core.somaxconn` sysctl, which typically defaults to 4096, so typically the
sysctl is the setting that actually matters." nginx does the opposite. Its
`listen` directive documents `backlog` as defaulting to 511 on Linux, which is
below any modern somaxconn, so on nginx the sysctl is the setting that does not
matter at all.

This is why the standard advice keeps getting repeated and keeps not working.
Raising `net.core.somaxconn` fixes the systemd host and does nothing for the
nginx one: the cap is `min(backlog, somaxconn)`, and a `min` only moves when the
smaller side moves.

Then the second surprise. `sk_acceptq_is_full()` in `include/net/sock.h` carries
a note above it for people who are sure it is wrong:

```c
/* Note: If you think the test should be:
 *	return READ_ONCE(sk->sk_ack_backlog) >= READ_ONCE(sk->sk_max_ack_backlog);
 * Then please take a look at commit 64a146513f8f ("[NET]: Revert incorrect
 * accept queue backlog changes.")
 */
static inline bool sk_acceptq_is_full(const struct sock *sk)
{
	return READ_ONCE(sk->sk_ack_backlog) > READ_ONCE(sk->sk_max_ack_backlog);
}
```

Greater than. So a listener whose Send-Q reads 511 holds 512 completed
connections, and a Recv-Q one above Send-Q is the definition rather than a bug.

For a listening socket those two columns come from the accept queue and nothing
else. `tcp_diag_get_info()` is explicit:

```c
if (inet_sk_state_load(sk) == TCP_LISTEN) {
        r->idiag_rqueue = READ_ONCE(sk->sk_ack_backlog);
        r->idiag_wqueue = READ_ONCE(sk->sk_max_ack_backlog);
}
```

Worth knowing because `ss(8)` itself does not document what those columns mean
on a LISTEN row, and the folklore answer, that they are the SYN queue, is wrong.

## A full queue does not refuse the connection

This is the part that makes it invisible.

When the client's final ACK arrives and the accept queue is full,
`tcp_check_req()` in `net/ipv4/tcp_minisocks.c` does this:

```c
listen_overflow:
	if (!READ_ONCE(sock_net(sk)->ipv4.sysctl_tcp_abort_on_overflow)) {
		inet_rsk(req)->acked = 1;
		return NULL;
	}
```

`tcp_abort_on_overflow` defaults to 0, so the ACK is dropped and nothing is
sent back. No RST. No ICMP. Nothing.

The client has already seen the SYN-ACK, so its `connect()` returned
successfully some time ago. It believes it is connected, and it writes its
request into a socket the server has none to match. That segment is dropped too.

Now two timers are running and neither of them belongs to your application.

The server retransmits the SYN-ACK on the request timer, which is
`req->timeout << req->num_timeout` capped at `TCP_RTO_MAX`, starting from
`TCP_TIMEOUT_INIT` of one second. So retransmissions land at 1, 3, 7, 15 and 31
seconds. ip-sysctl confirms the arithmetic from the other end:
`tcp_synack_retries` "Default value is 5, which corresponds to 31seconds till
the last retransmission with the current initial RTO of 1second."

The client retransmits its data on its own RTO. It measured an RTT during the
handshake, so this is not the one second initial value: Linux floors a computed
RTO at `TCP_RTO_MIN`, which is `HZ/5`, so on a datacenter network it is 200 ms
and then doubles. 200, 600, 1400, 3000, 6200, 12600 milliseconds after the send.

The connection completes on whichever of those fires first after the
application has called `accept()` enough times to leave a slot. Both work:
retransmitted data carries an ACK, and a retransmitted SYN-ACK provokes a
duplicate ACK.

## So where did four seconds come from?

Take the burst from the top of this piece. 1612 handshakes complete in two
seconds, which is 806 a second, against an accept loop getting through 300 a
second. Over the window, 600 are accepted and the queue fills to the 512 it
holds. That leaves 500 connections that finished a handshake and were dropped.

The last of them is behind 500 others waiting for a slot, and the application
frees one every 3.33 ms, so a slot for it exists 1667 ms after the burst.

Nothing tells the client that. Its next chance is the first tick of either
schedule at or after 1667 ms, and the schedules are 200, 600, 1400, 3000 from
the client and 1000, 3000, 7000 from the server. The answer is 3000 ms.

A shortfall of 1.7 seconds in the accept loop cost that client 3 seconds of
dead air, and the difference is the granularity of an exponential backoff
nobody configured. The clumping people report is the same effect: everything
that got dropped lands on the same tick.

## The misconception

The belief is that a server with idle CPU cannot be the reason connections are
timing out, so this must be the network or the client.

The accept queue is not sized by the CPU and it is not drained by the CPU. It
is drained by an application returning from `accept()`. The worst version of
this is a single acceptor thread that blocks: hand the socket to a pool, take a
lock, wait on something that has stopped answering. 400 connections arrive over
five seconds against a framework backlog of 128, so 129 sit in the queue and
271 are dropped, and there is not one accept in the window.

Those 271 do not get in at all. `syn_ack_recalc()` expires the request once
`num_timeout` reaches `tcp_synack_retries`, which is 63 seconds after the SYN:
five retransmissions and one more interval. After that the request is gone, and
the client's next data retransmit at 102.2 seconds reaches a listening socket
with nothing to match, so the listener resets it. Not that anyone sees that:
`tcp_retries2` at its default of 15 buys the client "a hypothetical timeout of
924.6 seconds", per ip-sysctl, and every application timeout in the path fires
long before either number.

Meanwhile: 3 percent CPU, one parked thread in the dump, no errors anywhere.

## The counters, and the one that proves it

`TcpExtListenOverflows` is the proof. It increments only when the accept queue
was full, so it is zero on a healthy listener and it is the shortest path from
symptom to cause on this whole page.

`TcpExtListenDrops` is not that. The overflow path increments both, naming
`LINUX_MIB_LISTENOVERFLOWS` directly and then falling through to
`tcp_listendrop()`. But `tcp_listendrop()` also runs on every other way
`tcp_conn_request()` can give up: a request allocation that fails, a SYN cookie
in an ACK that no longer validates, a route lookup that fails. On the host
above, with a scanner sending it junk all day, ListenOverflows read 500 and
ListenDrops read 618. Alert on the first. Graph the difference separately,
because a jump in it with overflows flat is a different problem entirely.

Two more things to rule out. The SYN queue is a different
queue: `tcp_max_syn_backlog` bounds connections that have not finished
handshaking, and with `tcp_syncookies` at its default of 1, listen(2) notes
that "when syncookies are enabled there is no logical maximum length and this
setting is ignored". Raising it cannot move a number that `min(backlog,
somaxconn)` decides. And check your kernel, because listen(2) also says "Since
Linux 5.4, the default in this file is 4096; in earlier kernels, the default
value is 128." A long-lived 4.19 host is running a cap of 128 no matter what
the application asked for, and every tuning guide written after 2019 quietly
assumes otherwise.

## What to do

```
$ ss -ltn                       # Send-Q is the real cap, Recv-Q the depth
$ nstat -az TcpExtListenOverflows TcpExtListenDrops
$ sysctl net.core.somaxconn net.ipv4.tcp_abort_on_overflow
```

Raise both numbers, in an order that makes the check meaningful: somaxconn
first, then the application's own backlog, then `ss -ltn` to confirm Send-Q
actually moved. On nginx that is `listen 443 ssl backlog=4096`. A listener
created before a sysctl was applied keeps its old cap for life, so restart the
service, not just the sysctl.

Then fix the drain, because a deeper queue only buys time. The accept loop
should accept and hand off, and the hand off must not be able to block: a
bounded queue with a rejection policy, not a lock.

Resist `net.ipv4.tcp_abort_on_overflow=1`. It does what it says, and ip-sysctl
describes it in one flat line: "If listening service is too slow to accept new
connections, reset them. Default state is FALSE." What it trades is a
connection that would have completed three seconds late for one that fails now,
which the client library will retry into the same full queue. Turn it on for an
afternoon of diagnosis and off in the same change, because the symptom it
produces looks exactly like a crash, a firewall, or a load balancer draining.

Then three questions:

1. Is `ListenOverflows` moving? If yes, the queue is the cause and the CPU
   graph is not evidence of anything.
2. Is `Send-Q` the number you configured? If not, find out which of the two
   clamps is binding before changing either.
3. Is it moving at all? If `ListenOverflows` is flat, the queue is exonerated
   and the time is being spent after `accept()` returns.

You can work through ten of these, including the listener whose Recv-Q reads one
above its own limit and the one where raising somaxconn changes nothing, at
[the server is idle and the connections are timing out](/backlog).

For the other number on a box like this that stays flat while something is
badly wrong, [forty, and nothing was
running](/blog/forty-and-nothing-was-running). For why the arrival rate and the
service rate are the only two numbers that matter here, [queueing theory for
operators](/blog/queueing-theory-for-operators). And for where nginx's 511 comes
from in the first place, [nginx as a reverse
proxy](/blog/nginx-reverse-proxy-setup).

## References

- [listen(2), on the somaxconn cap and the 5.4 default](https://man7.org/linux/man-pages/man2/listen.2.html)
- [ip-sysctl, on tcp_abort_on_overflow, tcp_synack_retries and tcp_retries2](https://docs.kernel.org/networking/ip-sysctl.html)
- [sk_acceptq_is_full and the note above it, include/net/sock.h](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/include/net/sock.h)
- [tcp_check_req and the listen_overflow label, net/ipv4/tcp_minisocks.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/ipv4/tcp_minisocks.c)
- [__sys_listen_socket, net/socket.c](https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/tree/net/socket.c)
- [systemd.socket(5), on Backlog= and why the sysctl is what matters](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html)
- [nginx listen directive, on the backlog default of 511](https://nginx.org/en/docs/http/ngx_http_core_module.html#listen)
- [RFC 6298, on the initial RTO and backing off the timer](https://www.rfc-editor.org/rfc/rfc6298)