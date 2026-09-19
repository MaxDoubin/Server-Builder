## The queue was empty for six minutes

A worker holds one HTTP connection to an internal service and reuses it
between batches. Last night the queue was empty from 02:14 to 02:20. At 02:20
the next batch arrived, the worker wrote a request on the connection it had
been holding, and got this:

```
ConnectionResetError(104, 'Connection reset by peer')
```

Nothing was deployed. Nothing restarted. The service had been up for eleven
days and its own access log has no entry at 02:20, because no request reached
it.

At the moment of the write, the socket looked like this:

```
$ ss -tino
State   Recv-Q  Send-Q      Local Address:Port        Peer Address:Port
ESTAB   0       0           10.24.6.31:41562          10.24.19.8:8080
	 cubic wscale:7,7 rto:204 rtt:1.5/0.75 mss:1448 pmtu:1500 lastsnd:360000 lastrcv:360000 lastack:360000
```

Established, nothing queued, and 360000 milliseconds since anything was sent
or received. Both kernels agree the connection exists. The device between them
stopped agreeing ten seconds earlier.

## TCP has no idle timeout. The path has several

This is the part that makes the folklore feel right. An established TCP
connection with nothing to say costs neither end anything. There is no timer
in the socket counting down to a close. Left alone, the two sockets would be
there next year.

The path is not the protocol. Every stateful device between the two ends is
holding a row in a table with a countdown on it, and when the countdown
reaches zero the row is deleted. Nobody is told. The documented defaults:

- **netfilter conntrack**: `nf_conntrack_tcp_timeout_established`, "default
  432000 (5 days)". Effectively forever, which is why a developer who has only
  ever tested between two Linux boxes has never met any of this.
- **AWS Network Load Balancer**: "The default idle timeout value for TCP flows
  is 350 seconds."
- **AWS Application Load Balancer**: `idle_timeout.timeout_seconds`, "The
  default is 60 seconds."
- **Azure Load Balancer**: "The default is 4 minutes for all rule types."
- **Cloud NAT**: TCP established connection idle timeout, 1200 seconds.

Plus whatever the firewall appliance shipped with, usually between 300 and
3600, and not written down anywhere the application team reads.

The smallest of those numbers is the only one that matters, and it is never in
the application's configuration. Six minutes of silence against a 350 second
timeout is not a close call.

## Keepalive is off

The usual answer at this point is TCP keepalive, and the usual answer is wrong
twice. The first is that it is not running.

RFC 1122, section 4.2.3.6:

> Implementors MAY include "keep-alives" in their TCP implementations,
> although this practice is not universally accepted. If keep-alives are
> included, the application MUST be able to turn them on or off for each TCP
> connection, and they MUST default to off.

Linux obeys that. Keepalive is a per-socket option and a socket sends no
probes unless something set `SO_KEEPALIVE` on it. `net.ipv4.tcp_keepalive_time`
says nothing about whether any socket opted in, which is why reading the
sysctl is not evidence of anything.

The evidence is in a command you already run. `ss -o` prints a
`timer:(keepalive,...)` field for a socket that has one, and nothing at all for
a socket that does not. The output above has no timer field. That socket was
never going to probe.

Some libraries set it for you. libpq does. Go's `net.Dialer` does, with an
interval of its own. A plain `socket()` and `connect()` does not.

## And at its defaults it is two hours late

The second way the answer is wrong is the one that survives switching it on.
From `ip-sysctl`:

- `tcp_keepalive_time`: "Default: 2hours."
- `tcp_keepalive_probes`: "Default value: 9."
- `tcp_keepalive_intvl`: "Default value: 75sec i.e. connection will be aborted
  after ~11 minutes of retries."

So the first probe goes out 7200 seconds after the connection goes quiet. Every
device in the list above except stock conntrack forgot the flow in the first
twenty minutes. Against the 300 second branch firewall the first probe is 6900
seconds late, and turning keepalive on changed nothing at all about whether the
flow survives.

There is a trap here worth naming, because it is the fix people apply after
the first incident. The three knobs are a **sequence, not a rate**. `tcp_keepalive_time` decides when probing starts. `tcp_keepalive_intvl`
and `tcp_keepalive_probes` describe only the tail after it has started and
nothing has been answered. Setting `intvl` to 10 and `probes` to 3 across the
fleet moves dead peer detection from 7875 seconds to 7230 and leaves the first
probe exactly where it was. The ticket gets closed and the next incident is
identical.

The knob is `tcp_keepalive_time`, and better than the sysctl is the socket
option, because the right interval depends on the path this connection takes
and not on the host:

```c
int on = 1, idle = 120, intvl = 30, cnt = 5;
setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &on,    sizeof on);
setsockopt(fd, IPPROTO_TCP, TCP_KEEPIDLE,  &idle,  sizeof idle);
setsockopt(fd, IPPROTO_TCP, TCP_KEEPINTVL, &intvl, sizeof intvl);
setsockopt(fd, IPPROTO_TCP, TCP_KEEPCNT,   &cnt,   sizeof cnt);
```

120 against a 300 second firewall puts two probes inside every window, so one
lost probe is not one lost connection. A third of the smallest timeout in the
path is a reasonable rule.

The same thing at the application's layer often works better, and Azure's
documentation says why: "Use application layer keepalives when the connection
is proxied somewhere in the path, because a proxy can terminate the TCP
connection that transport-layer keepalives refresh." An HTTP/2 PING every 45
seconds lands twenty six times inside a 1200 second Cloud NAT window, and it
survives a proxy that a kernel probe does not reach past.

## What the write gets: a reset, or fifteen minutes of nothing

The incident at the top was the good version. The NLB documents what it does:
"If a client or target sends data after the idle timeout period elapses, the
client receives a TCP RST packet to indicate that the connection is no longer
valid." One round trip, `ECONNRESET`, loud and retryable.

Azure's default is the other one: "Load Balancer's default behavior is to
silently drop flows when the idle timeout of a flow is reached."

Now nothing is sent to either end. The application's write succeeds into the
socket buffer. The segment is retransmitted with the RTO doubling from
`TCP_RTO_MIN` and clamped at `TCP_RTO_MAX`, which `include/net/tcp.h` defines
as 200 ms and 120 s. `ip-sysctl` puts the total on the end of that:

> Given a value of N, a hypothetical TCP connection following exponential
> backoff with an initial RTO of TCP_RTO_MIN would retransmit N times before
> killing the connection at the (N+1)th RTO. The default value of 15 yields a
> hypothetical timeout of 924.6 seconds and is a lower bound for the effective
> timeout.

Ten intervals doubling from 200 ms sum to 204.6 seconds, then six more at the
120 second ceiling, and 924.6 is the total.

So: an application behind an Azure Load Balancer goes quiet for 600 seconds.
The flow is deleted at 240. The request arrives at 600 and the thread writing
it is stuck for 924.6 seconds more, failing at 1524.6 seconds from the start of
the silence. That is longer than the patience of the person watching it, which
is why the on-call restart at the fifteen minute mark came first and the write
never got to fail at all. It went in the postmortem as a database problem.

Two fixes, at different layers. Enable TCP reset on idle timeout on the rule:
"Endpoints receiving TCP RST packets close the corresponding socket
immediately." And bound the write with `TCP_USER_TIMEOUT`, the per-connection
version of `tcp_retries2`. PostgreSQL exposes it as `tcp_user_timeout`,
alongside `tcp_keepalives_idle`, whose documentation is worth reading
carefully: "A value of 0 (the default) selects the operating system's default."
Zero is what it ships as, so a pool that looks deliberately configured is
running the stock two hours.

## The one job keepalive is actually for

None of the above is an argument against keepalive. It is an argument against
its defaults. There is exactly one failure nothing else finds, and keepalive
finds it.

A peer that vanishes. Power cut, kernel panic, cable pulled. No FIN, no RST, no
ICMP. Nothing arrives and nothing is expected, so the retransmission timer
never starts: it starts only when something is unacknowledged. A conntrack row
is refreshed by the probes and would last five days anyway. If nothing probes, that socket is `ESTABLISHED` until
the process restarts.

With `SO_KEEPALIVE` set and the defaults untouched, the kernel works it out
after 7200 + 9 x 75 = 7875 seconds. Two hours and eleven minutes, and `ss`
prints the countdown as `131min` the whole way.

Compare an application that does its own: ssh with `ServerAliveInterval 60` and
`ServerAliveCountMax 3` disconnects after 180 seconds, because `ssh_config`
defines the count as "the number of server alive messages which may be sent
without ssh receiving any messages back from the server". Forty times faster,
on the same socket, and it also proves the far end's sshd is answering rather
than just its kernel. Note that `ServerAliveInterval` defaults to 0, meaning no
messages at all, while `TCPKeepAlive` defaults to on: the setting that is on by
default is the slow one.

## Reading it on a real machine

```
$ ss -tino state established
$ sysctl net.ipv4.tcp_keepalive_time net.ipv4.tcp_keepalive_intvl net.ipv4.tcp_keepalive_probes
$ sudo conntrack -L -p tcp --state ESTABLISHED
```

The first says whether this socket has a keepalive timer and how long it has
been quiet. The second says what it would be if it had one. The third shows the
row and the seconds left on it.

Then three questions:

1. What is the smallest idle timeout in the path? Not the one you control, the
   smallest. If you cannot name it, that is the finding.
2. Does anything write inside it? A keepalive probe, an application heartbeat,
   or a pool that evicts idle connections sooner. If the answer is
   `tcp_keepalive_time`, the answer is no.
3. When the path drops a flow, does the next write get a reset or silence? That
   difference is 924.6 seconds of an incident, and it is a checkbox on the load
   balancer.

You can work through ten of these, including the one where lowering two of the
three keepalive knobs accomplishes nothing and the one where the peer no longer
exists, at [the connection was fine until nobody spoke for six
minutes](/keepalive).

Related: [nothing translates the reply](/blog/nothing-translates-the-reply) is
the same conntrack table losing a packet in the other direction,
[it ran out at four hundred and
seventy](/blog/it-ran-out-at-four-hundred-and-seventy) is the other timer on
this socket that nobody can name the units of, and
[database connection pooling](/blog/database-connection-pooling) is where these
idle connections come from in the first place.

## References

- [RFC 1122, section 4.2.3.6, TCP Keep-Alives](https://www.rfc-editor.org/rfc/rfc1122#section-4.2.3.6)
- [ip-sysctl, on tcp_keepalive_time, tcp_keepalive_intvl, tcp_keepalive_probes and tcp_retries2](https://docs.kernel.org/networking/ip-sysctl.html)
- [tcp(7), on SO_KEEPALIVE, TCP_KEEPIDLE, TCP_KEEPINTVL, TCP_KEEPCNT and TCP_USER_TIMEOUT](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [nf_conntrack-sysctl, on nf_conntrack_tcp_timeout_established](https://docs.kernel.org/networking/nf_conntrack-sysctl.html)
- [Network Load Balancer connection idle timeout, and the RST it sends](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/network-load-balancers.html#connection-idle-timeout)
- [Application Load Balancer attributes, including idle_timeout.timeout_seconds](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#load-balancer-attributes)
- [Azure Load Balancer TCP reset and idle timeout](https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-tcp-reset)
- [Cloud NAT timeouts and their defaults](https://cloud.google.com/nat/docs/tune-nat-configuration)
- [ssh_config(5), on ServerAliveInterval, ServerAliveCountMax and TCPKeepAlive](https://man.openbsd.org/ssh_config.5)
- [PostgreSQL connection settings, on tcp_keepalives_idle and tcp_user_timeout](https://www.postgresql.org/docs/current/runtime-config-connection.html)