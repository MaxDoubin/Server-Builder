
## The sentence that starts every one of these

"We bought more bandwidth and it did not get faster."

It is one of the most reliably true sentences in this job. It is also, almost
always, not a mystery. A single TCP stream sits under three ceilings, only one
of them is the number on the invoice, and the one on the invoice is usually
not the one it is resting on.

Here is the whole of the first ceiling, and it fits on one line:

```
throughput = window / round trip
```

A sender can have some amount of data unacknowledged and in flight. When that
amount is used up, it stops and waits for an acknowledgement, which takes one
round trip to arrive. So the rate is what it managed to put out there,
divided by how long it waits. Nothing in that expression is the line rate.

## The number that surprises people

A gigabit circuit between London and New York. Round trip about 80ms, which is
close to the speed of light in glass and not going to improve. A receive
window left at the classic 64KiB.

```
65,536 bytes x 8 bits = 524,288 bits
524,288 bits / 0.080 seconds = 6,553,600 bits per second
```

**6.6 Mbps.** On a gigabit circuit. That is 0.66 per cent of what was bought,
and everything is working exactly as designed.

The other direction is more useful when you are sizing something. How much has
to be in flight to fill this pipe?

```
1,000,000,000 bits/sec / 8 = 125,000,000 bytes/sec
125,000,000 x 0.080 = 10,000,000 bytes
```

Ten megabytes. That number has a name, the bandwidth-delay product, and it is
the single most useful quantity in this entire subject. It is how much data
the path holds when it is full, and any window smaller than it leaves the
circuit idle waiting for acknowledgements. Ours is 64KiB against a 10MB pipe:
about one part in a hundred and fifty.

Window scaling (RFC 7323) has been on by default in every operating system
you are likely to be running for well over a decade, so the honest version of
this story in 2026 is usually not a hard 64KiB cap. It is autotuning that has
been capped by a `net.ipv4.tcp_rmem` maximum somebody set in 2014, a device
in the path clamping the window scale option, or an application setting
`SO_RCVBUF` explicitly and thereby turning autotuning off. The arithmetic is
the same. The reason is just less obvious than it used to be.

## The second ceiling, which has no line rate in it at all

Now put a little loss on the path. Not congestion, just the sort of low-grade
loss a long path picks up: two packets in ten thousand.

TCP's response to loss is to halve the window and climb back linearly. The
average of that sawtooth, over a long transfer, is the Mathis bound:

```
throughput <= (MSS / RTT) x (C / sqrt(p))
```

where C is about 1.22 and p is the loss rate. Look at what is not in that
expression. There is no bandwidth term. The line rate does not appear
anywhere. You can buy a hundred gigabit circuit and this ceiling will not
move by one bit per second.

For a 1460 byte MSS, a 60ms round trip, and p of 0.0002:

```
1460 x 8 = 11,680 bits
11,680 / 0.060 = 194,667
194,667 x 1.2247 / sqrt(0.0002) = 194,667 x 86.6 = ~17 Mbps
```

That is the whole answer to "we went from 100 Mbps to 1 Gbps and nothing
changed". Both circuits were above the ceiling. The ceiling was made of loss.

The square root is the part worth internalising. Cutting loss by a factor of
one hundred multiplies throughput by ten, not by one hundred. It is also why
loss rates that look negligible are not: going from 0.05 per cent to 0.005 per
cent is worth a factor of three, and nobody would ever describe either figure
as a problem out loud.

Mathis is a model of a Reno-shaped sawtooth, not a law of nature. CUBIC
recovers faster on long paths and BBR does not use loss as its congestion
signal at all, so a modern stack will frequently beat this number. Treat it
as the shape of the answer rather than the answer: throughput falls with the
square root of loss, and bandwidth is not in the expression.

## The third answer is not a ceiling

I built a page for this and it forced me to admit there is a fourth case
that none of the three ceilings explains.

A five megabyte file, a hundred megabit path, two hundred milliseconds of
round trip, no loss, a one megabyte window. The steady-state ceiling is the
window one, 42 Mbps, and at 42 Mbps five megabytes is under a second. It takes
just over two.

Slow start is the reason. A connection does not begin at its window; it begins
at ten segments (RFC 6928) and doubles every round trip. Fourteen and a half
kilobytes, then twenty-nine, then fifty-eight, and so on:

```
round 1:     14,600 bytes
round 2:     29,200
round 3:     58,400
round 4:    116,800
round 5:    233,600
round 6:    467,200
round 7:    934,400
            ---------
            1,854,200 bytes, in 7 x 200ms = 1.4 seconds
```

Add one round trip to open the connection and that is 1.6 seconds gone before
the transfer is up to speed, with about two thirds of a second of actual
transfer left to do. The ramp is most of the job.

The ramp costs the same seven round trips at any line rate, because it is
counted in round trips. This is why a faster line does nothing measurable for
a page made of small files, and why the same bytes as one stream is quick on
the same connection. It is also why connection reuse, HTTP/2, and putting a
cache near the reader are the interventions that work, and the circuit upgrade
is not.

## Working out which one you are on

Three numbers, and you need all three before you have an opinion.

**Round trip.** `ping` will do. This is the one people skip because it feels
like it cannot matter, and it is in the denominator of two of the three
ceilings.

**Window actually in use.** Not the configured maximum, the one on the wire:

```bash
ss -tin dst 203.0.113.10
# look at: rcv_space, cwnd, rtt, retrans, bytes_retrans
```

`cwnd` is in segments here, so multiply by the MSS to compare it against your
bandwidth-delay product. If `cwnd` x MSS is well under the BDP and `retrans`
is climbing, you are on the loss ceiling. If it is well under the BDP and
retransmits are flat, something is capping the window.

**Loss.** `retrans` from the same output, or the retransmission rate from a
capture. Note that this is the loss the sender saw, which is what the ceiling
is made of, and it is often nothing like the loss a synthetic probe reports.

Then check yourself against the parallel-stream test, which takes ten seconds
and settles the argument:

```bash
iperf3 -c host -t 30        # one stream
iperf3 -c host -t 30 -P 8   # eight streams
```

If eight streams go roughly eight times faster, the limit was per-stream:
window or loss, and the circuit is fine. If eight streams go the same speed
as one, you have found the actual link ceiling and the invoice is the right
place to look after all. This is also, incidentally, why browser speed tests
show numbers your file transfers never see. They open many connections
precisely so that the per-stream ceiling does not appear.

## What to do about each one

**Window limited.** Let autotuning have room. On Linux the relevant knobs are
`net.ipv4.tcp_rmem` and `net.ipv4.tcp_wmem`, and the maximum wants to be
comfortably above the bandwidth-delay product of your longest path rather than
whatever it was when the machine was built. Check that the application is not
setting `SO_RCVBUF` itself, because doing so disables autotuning entirely and
pins the window at whatever it asked for.

**Loss limited.** Go and find it. Loss on a path nobody is congesting is a
fault: a duplex mismatch, a dying optic, a policer somebody forgot about, a
firewall doing more work than it can. Failing that, use more streams, which is
why every serious transfer tool has a concurrency setting and why the cloud
ones default to parallel parts.

**Ramp limited.** Stop paying the ramp. Reuse connections, put a cache near
the reader, and stop opening one connection per file.

**Link limited.** Buy more bandwidth. This is the case where the invoice is
the right place to look, and in my experience it is the rarest of the four by
a distance.

## The habit worth building

When somebody says a transfer is slow, ask for the round trip before you ask
for anything else. It is in the denominator of two of the three ceilings and
it never appears in the description of the problem, because nobody thinks
distance is a networking parameter. Half of these end there.

There is an [interactive version of all this](/transfer) on the site: move the
four inputs and watch which ceiling takes over, then work out which is binding
on ten complaints written the way people actually report them. Each one also
names the expensive change that would have done nothing, which is the part
worth knowing.

## References

- [RFC 7323: TCP Extensions for High Performance](https://www.rfc-editor.org/rfc/rfc7323.html)
- [RFC 6928: Increasing TCP's Initial Window](https://www.rfc-editor.org/rfc/rfc6928.html)
- [RFC 5681: TCP Congestion Control](https://www.rfc-editor.org/rfc/rfc5681.html)
- [Mathis et al., The Macroscopic Behavior of the TCP Congestion Avoidance Algorithm](https://dl.acm.org/doi/10.1145/263932.264023)
- [RFC 9438: CUBIC for Fast and Long-Distance Networks](https://www.rfc-editor.org/rfc/rfc9438.html)
- [Cardwell et al., BBR: Congestion-Based Congestion Control](https://queue.acm.org/detail.cfm?id=3022184)
- [ss(8)](https://man.archlinux.org/man/ss.8)
- [iperf3 documentation](https://iperf.fr/iperf-doc.php)
