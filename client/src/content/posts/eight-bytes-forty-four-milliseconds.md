## The same eight bytes, nine hundred times slower

A client sends a four byte length, then a four byte body, then waits for the
reply. Both ends are on the same machine. Here is what that costs, against the
same eight bytes handed over in one call:

```
one write of 8 bytes, then read       0.05 ms    stalled  0/40
two writes of 4 bytes, then read     44.48 ms    stalled 39/40
```

No network. No disk. No server-side work of any kind. The difference is
entirely that the application called `send` twice instead of once.

"Stalled" counts the rounds that took over ten milliseconds, and each figure is
the median of at least thirty round trips.

## Two correct behaviors, one deadlock

**Nagle's algorithm**, on the sender: while there is unacknowledged data
outstanding, do not send a segment smaller than one MSS. It exists so that a
terminal session typing one character at a time does not put a forty byte
header around each keystroke.

**The delayed acknowledgement**, on the receiver: do not acknowledge
immediately. An acknowledgement on its own carries no data, and there may be
a reply along shortly that can carry it for free. So wait a little.

Now run the exchange:

1. The client writes four bytes. Nothing is outstanding, so they leave at once.
2. The client writes four more. Something *is* outstanding now and four bytes
   is less than an MSS, so the sender holds them.
3. The server has four bytes of an eight byte request. It cannot reply. It has
   nothing to say, so it does not acknowledge either. Its timer starts.
4. Everybody waits.

The timer fires, the acknowledgement goes out, the held four bytes follow, the
server has a whole request, and the reply comes back. Neither end did anything
wrong. Neither end has a bug. The application has a bug, and it is that it
called `send` twice.

## The timer is not forty milliseconds

Everybody writes forty milliseconds, including me, for years. Over fifty nine
stalls on this host:

```
minimum   40.89 ms
median    44.03 ms
maximum   49.89 ms
```

Close enough that "about forty" is a fair thing to say out loud, and far enough
that a budget built on exactly 40 will be wrong.

## One timer, not one per write

This is the part that gets estimated wrongly, and it matters because it changes
what you conclude about a serializer that writes each field separately.

```
two writes     44.35 ms
three writes   44.15 ms
eight writes   44.02 ms
```

Every write after the first is appended to the same held segment while it
waits. Eight writes cost what two cost. It is still worth fixing eight sends
that should be one, but for the system calls, not for the timers.

## The fix everybody tries first

```
TCP_NODELAY on the SENDER              0.05 ms    stalled  0/30
TCP_QUICKACK on the receiver           0.05 ms    stalled  0/30
one write instead of two               0.05 ms    stalled  0/30
TCP_NODELAY on the RECEIVER           44.05 ms    stalled 29/30
```

Forty four milliseconds with `TCP_NODELAY` set on the receiving socket, which
is identical to setting nothing at all.

`TCP_NODELAY` is per socket and it governs what **that socket** does with its
own outgoing data. The server is not holding anything. It is reading, and then
waiting. The data being held belongs to the client. Setting the option on the
busy end, the end under load, the end you happen to own, is the natural thing
to try and it is the wrong socket.

This is worth dwelling on because the failure mode is so quiet: the change ships,
the graph does not move, and the conclusion is usually "it must not be Nagle
then" rather than "it must not be that socket".

## When you cannot change the sender

Sometimes the writer is a vendor binary. Then break the other half of the
deadlock: `TCP_QUICKACK` on your own socket tells the receiver to acknowledge
at once. Set it again before every `recv`, because Linux clears it by itself
as the connection settles.

## It is worst where the network is fastest

The timer is a fixed forty four milliseconds. The link is not. So the damage is
the ratio between them:

```
loopback, 0.05 ms round trip      881 times slower
same rack, 0.3 ms                 148 times slower
cross region, 30 ms                 2 times slower
```

A team that tests against a service in another region sees a round trip go from
30 ms to 74 ms and calls it a slow day. The same code, once that service moves
into the same rack, goes from 0.3 ms to 44.3 ms, and now the graph is a
horizontal line at forty four milliseconds that no amount of server tuning
moves, because there is nothing on the server to tune.

Moving a service closer made the system slower. That is the shape of the bug
report you will actually get.

## How to recognize it

The tell is a **flat floor**. Not a slow average, not a long tail: a latency
distribution with a hard edge at forty something milliseconds and almost
nothing below it, on an operation that should take microseconds. CPU is idle at
both ends. The server's own timing says it answered in fifty microseconds. The
client says forty four milliseconds. Both are telling the truth.

`ss -ti` on the connection, or a packet capture, settles it: you will see the
gap between the client's first segment and the server's acknowledgement, with
nothing in it.

## What to do about it

1. **Build the message, then send it once.** This needs no socket option and no
   agreement with the other end, and it is the shape that is fast by default.
   `writev` or `sendmsg` if you do not want to copy.
2. **Set `TCP_NODELAY` on the socket that writes,** for anything
   request-and-response. Almost every RPC library already does; if yours has an
   option for it, it is on for a reason.
3. **Check which socket you set it on.** Half the reason this bug survives is
   that the first fix went to the wrong end and appeared to disprove the
   diagnosis.
4. **If you cannot change the writer, use `TCP_QUICKACK`** on the reader,
   before every read.
5. **Do not conclude from a WAN test that you are fine.** The closer the two
   ends get, the worse this is.

## One thing I could not pin down

A first write large enough avoids the stall: with the MSS at 32741, a 70000
byte write followed by a four byte write ran in 0.09 ms. Finding the exact
boundary produced a rule that does not hold. The flip is between 65486 and
65487 bytes handed over, which looks like a rule about the total, and it is
not:

```
65487 bytes as 4 + 65483          0.06 ms    stalled  0/40
65487 bytes as 32743 + 32744     44.00 ms    stalled 39/40
65486 bytes as 1 + 1 + 65484      0.08 ms    stalled  0/40
```

Same total, opposite outcomes, in both directions. That is segmentation
behavior on an interface with a 65536 byte MTU, and I could not reduce it to
anything worth stating, so the model on the practice page says nothing about it
and keeps every case far below one segment. If you are sending enough data to
be near that boundary, you are not in the failure mode this article is about.

## Sources

- [tcp(7), on TCP_NODELAY, TCP_CORK and TCP_QUICKACK](https://man7.org/linux/man-pages/man7/tcp.7.html)
- [RFC 896, Nagle's original note on congestion collapse](https://www.rfc-editor.org/rfc/rfc896.html)
- [RFC 1122, section 4.2.3.2, on the delayed acknowledgement](https://www.rfc-editor.org/rfc/rfc1122.html)
- [RFC 9293, the consolidated TCP specification](https://www.rfc-editor.org/rfc/rfc9293.html)
- [setsockopt(2)](https://man7.org/linux/man-pages/man2/setsockopt.2.html)

Every measurement here was taken on Linux 6.18.44, over loopback, with a client
and a server in one process, each figure the median of at least thirty round
trips.

The ten connections on [Eight bytes, forty four
milliseconds](/nagle) are the same model, one question each.
