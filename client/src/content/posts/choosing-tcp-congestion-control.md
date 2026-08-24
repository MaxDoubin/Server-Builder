
## What the algorithm is for

TCP has to guess how much data the network between two endpoints can absorb.
There is no signal telling a sender the capacity of the path, so the sender
probes: increase the send rate, watch what happens, back off when the network
pushes back. Congestion control is the policy for that loop, and it lives
entirely in the sender.

That last point matters. You can change congestion control on your server
without touching clients, routers, or anything in the middle. It is a unilateral
knob, which is unusual for networking, and it is why it is worth understanding.

## The loss based family

The classical algorithms treat packet loss as the congestion signal. Grow the
window until a packet drops, cut the window, grow again. This is the sawtooth
pattern in every textbook, and Reno is the canonical form.

CUBIC, the Linux default for many years, is the modern refinement. Instead of
growing linearly it uses a cubic function of the time since the last congestion
event: it grows quickly at first, flattens out near the window size where loss
last happened, then probes past that point if nothing breaks. The design goal
was to fill high bandwidth, high latency paths faster than Reno while staying
fair to it.

The assumption baked into all of this is that loss means congestion. That was
true when the internet was mostly wired and buffers were small. It is less true
now, in two ways.

Wireless links lose packets for reasons unrelated to congestion, and a loss
based algorithm reacts to random corruption by throttling for no reason. And
deep buffers in intermediate devices mean the network absorbs a large excess of
packets before dropping any, so the sender keeps increasing its rate while
latency climbs. That is bufferbloat: the connection is not losing packets, it is
just filling a giant queue, and every other flow sharing that queue pays in
delay.

## The model based approach

BBR takes a different angle. Rather than waiting for loss, it continuously
estimates two properties of the path: the bottleneck bandwidth, and the round
trip propagation time without queuing. It then paces sending at the estimated
bandwidth and keeps roughly one bandwidth delay product of data in flight,
which is the amount needed to keep the pipe full without building a queue.

The consequences are concrete. On paths with random loss, BBR does not collapse
the way loss based algorithms do, because loss is not its primary signal. On
paths with deep buffers it keeps latency low, because it is deliberately not
filling the queue. Pacing also smooths bursts, which is friendlier to shallow
buffered switches.

The tradeoffs are also real. Fairness between BBR and loss based flows sharing a
bottleneck is a genuinely researched problem and the answer depends heavily on
buffer depth and version. It relies on estimates that can be wrong on paths with
variable capacity or aggressive traffic shaping. And it is a more complex
mechanism, which means more ways for the model to disagree with reality.

## Actually changing it

Linux implements congestion control as pluggable modules.

```bash
# what is available and what is in use
sysctl net.ipv4.tcp_available_congestion_control
sysctl net.ipv4.tcp_congestion_control

# load a module if it is not compiled in
modprobe tcp_bbr

# set the default for new sockets
sysctl -w net.ipv4.tcp_congestion_control=bbr

# make it persistent, and use a queue discipline that supports pacing
cat >/etc/sysctl.d/90-tcp.conf <<'EOF'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
sysctl --system
```

The `fq` queue discipline line is not optional if you care about doing this
properly. BBR paces packets, and pacing works best with a queue discipline built
for it. Setting the algorithm without the qdisc gives you a partial
implementation of the idea.

To see what a live connection is doing:

```bash
ss -ti state established '( dport = :443 )'
```

That prints the algorithm, current congestion window, smoothed round trip time,
retransmit counts, and delivery rate per socket. It is the fastest way to check
whether a change did anything, and reading it under real load is far more
informative than a synthetic test.

## How I decide

I do not switch defaults reflexively. CUBIC is a good algorithm and the default
exists for a reason. My reasoning goes like this.

I consider a change when the server is sending large amounts of data over long
or lossy paths: media, backups to another site, downloads to distant clients. A
long fat path with even a small random loss rate is where loss based algorithms
underperform most visibly, and it is the clearest case for a model based one.

I leave it alone for short, clean paths. Inside a data center or a single site,
round trip times are sub millisecond and loss is near zero. The congestion
control algorithm is barely engaged and you are optimising something that is not
the bottleneck.

And I measure before and after with the same tool, on the same path, at the same
time of day. Congestion control interacts with everything else on the network,
so a change that helps one flow can hurt a neighbour. If you cannot measure the
difference, you did not need to make the change.

The deeper habit here is reading the assumptions rather than the recommendation.
Every one of these algorithms is a model of what the network is like. Knowing
which model matches your network is the whole skill.

## References

- [RFC 5681: TCP Congestion Control](https://www.rfc-editor.org/rfc/rfc5681.html)
- [RFC 9438: CUBIC for Fast and Long-Distance Networks](https://www.rfc-editor.org/rfc/rfc9438.html)
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [RFC 3168: Explicit Congestion Notification](https://www.rfc-editor.org/rfc/rfc3168.html)
- [Linux network sysctl documentation](https://docs.kernel.org/admin-guide/sysctl/net.html)
