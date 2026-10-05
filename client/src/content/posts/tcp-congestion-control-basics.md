
## Why a Fast Link Can Feel Slow

Someone reports that a transfer between two sites runs at a fraction of the available bandwidth. The interface counters show plenty of headroom, there are no errors, and the link is nowhere near saturated. The usual conclusion is that something must be broken.

Often nothing is broken. TCP is doing exactly what it was designed to do, and the design has consequences that are unintuitive until you have seen the mechanism.

The starting point is the bandwidth delay product. A sender can only have so much unacknowledged data outstanding, bounded by the receive window and the congestion window. To keep a pipe full, that outstanding amount must be at least the bandwidth times the round trip time.

```
BDP = bandwidth * RTT

1 Gbit/s over an 80 ms path:
  125,000,000 bytes/s * 0.080 s = 10,000,000 bytes = about 10 MB
```

Ten megabytes of data must be in flight to keep that link busy. If the window is 64 KB, the theoretical maximum is 64 KB per 80 ms round trip, which is about 6.5 Mbit/s. On a gigabit link. Nothing is broken and you are getting less than one percent of the capacity.

This is why window scaling exists, and it is why long fat networks were a problem worth naming. It also explains the pattern where the same transfer is fast locally and slow across a WAN: the bandwidth did not change, the round trip time did, and the window that was ample at 1 ms is starvation at 80 ms.

## Loss Based Control and Bufferbloat

Classical congestion control treats packet loss as the signal that the network is full. The sender increases its window until something drops, backs off sharply, and climbs again. That sawtooth is the behavior underneath Reno and, with a different growth curve tuned for high bandwidth paths, CUBIC, which has been the Linux default for a long time.

CUBIC sets its window as a cubic function of the time since the last loss. After backing off, the window grows quickly, flattens out near the size where loss last happened, then probes past that point if nothing breaks. The design goal was to fill high bandwidth, high latency paths faster than Reno while staying fair to it.

The assumption is that loss means congestion. That was reasonable when buffers were small. It causes two problems now.

On links with any physical loss that is not congestion, such as some wireless paths, the sender misreads random loss as a full network and backs off when it should not.

More importantly, buffers got large. When a router has a very deep buffer, congestion does not cause loss, it causes queueing. Packets are not dropped, they are delayed, sometimes by hundreds of milliseconds. The sender sees no loss, keeps increasing its window, and fills the buffer further. Round trip time climbs and climbs while throughput stays flat.

That is bufferbloat, and it is the reason a single large upload can make an entire connection feel unusable while bandwidth graphs look fine. Interactive traffic is sitting behind a bulk transfer in a queue hundreds of milliseconds deep. The metric that shows it is latency under load, and almost nobody graphs that.

## BBR Models the Path Instead

BBR takes a different approach: rather than waiting for loss, it estimates the path's available bandwidth and minimum round trip time, and paces sending to match. The goal is to operate at the point where the pipe is full but the queue is not, which means keeping roughly one bandwidth delay product in flight.

In practice it behaves well on paths with non congestive loss and it avoids filling deep buffers, which keeps latency low under load. Pacing also smooths bursts, which is friendlier to switches with shallow buffers. The tradeoffs are real and worth knowing: its fairness when sharing a bottleneck with loss based flows depends on conditions, buffer sizing, and BBR version; its estimates can be wrong on paths with variable capacity or aggressive traffic shaping; and it is not a universal improvement in every topology. It is a tool with a profile, not a strictly better algorithm.

Switching it on Linux is trivial, which makes it easy to test honestly:

```bash
# What is available and what is in use.
sysctl net.ipv4.tcp_available_congestion_control
sysctl net.ipv4.tcp_congestion_control

# If bbr is not listed, it is usually a module that is not loaded yet.
sudo modprobe tcp_bbr

# Try BBR, paired with a fair-queueing qdisc for pacing.
sudo sysctl -w net.core.default_qdisc=fq
sudo sysctl -w net.ipv4.tcp_congestion_control=bbr

# Persist it.
cat <<'EOF' | sudo tee /etc/sysctl.d/90-tcp.conf
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF
```

The `fq` pairing is the efficient way to pace rather than a hard requirement: since kernel 4.13, TCP paces internally when the qdisc does not, so BBR still works without it.

Change it on the sender. Congestion control governs how fast a host transmits, so the machine sending the bulk of the data is the one whose setting matters. Nothing else has to change: clients, routers, and everything in the middle stay as they are.

## Deciding Whether to Switch

I do not switch defaults reflexively. CUBIC is a good algorithm and the default exists for a reason.

The clearest case for a change is a server sending large amounts of data over long or lossy paths: media, backups to another site, downloads to distant clients. A long fat path with even a small random loss rate is where loss based algorithms underperform most visibly.

Short, clean paths are the opposite. Inside a data center or a single site, round trip times are under a millisecond and loss is near zero, so the algorithm is rarely what limits throughput.

Either way, measure before and after with the same tool, on the same path, at the same time of day. Congestion control interacts with everything else on the network, so a change that helps one flow can hurt a neighbor. If you cannot measure the difference, you did not need to make the change.

## Buffers, AQM, and Where the Latency Lives

The other half of the problem lives in the network, not the endpoints. Active queue management drops or marks packets before a buffer is full, giving senders an early signal instead of letting the queue grow without bound.

`fq_codel` combines fair queueing across flows with a controller that targets a bounded queueing delay rather than a queue length in bytes. The fair queueing part is what stops one bulk transfer from starving everything else. It is a sensible default on almost any interface that can become a bottleneck.

```bash
# What is on the interface now.
tc qdisc show dev eth0

# Apply fq_codel.
sudo tc qdisc replace dev eth0 root fq_codel

# Watch for drops and, more tellingly, ECN marks.
tc -s qdisc show dev eth0
```

Explicit congestion notification is worth enabling where the path supports it, because it lets routers signal congestion by marking a bit rather than by discarding a packet. A signal without a retransmission is strictly better when both ends understand it.

## What to Check on Your Own Boxes

When someone reports slow transfers, this is the order I work through.

Measure the round trip time and compute the bandwidth delay product. Compare it to the window actually in use. This alone explains a large share of cases.

```bash
# Live per-socket TCP internals: cwnd, rtt, retransmits, pacing rate.
ss -tin

# Look for: cwnd:<N> rtt:<ms>/<var> retrans:<x/y> bytes_retrans:<n>

# Narrow it to what a server is sending, here from local port 443.
ss -tin state established '( sport = :443 )'
```

The same output names the algorithm and the delivery rate for each socket, which makes it the fastest way to check whether a change did anything. Read it under real load, which tells you far more than a synthetic test.

A small congestion window with no retransmissions points at a window or buffer limit, not congestion. A window that grows then collapses repeatedly points at real loss. Rising round trip time under load with no loss at all is the bufferbloat signature.

Check for retransmissions across the system, and check whether they correlate with load:

```bash
nstat -az | grep -Ei 'retrans|TCPLoss|TCPTimeouts'
```

Then check the obvious physical things, because congestion control is a poor explanation for a duplex mismatch or a failing optic. Interface error counters first, algorithms second.

## The Framing That Helps

TCP is a control loop. It is constantly estimating how much data the path can hold and adjusting. Almost every strange throughput problem is that control loop responding correctly to a signal you have not looked at yet: a round trip time that is larger than you assumed, a buffer that is deeper than you assumed, or loss that is not congestion.

Once you think of it that way, the diagnostic path is obvious. Find out what signal the sender is seeing, and the behavior stops being mysterious.

## References

- [RFC 5681: TCP Congestion Control](https://www.rfc-editor.org/rfc/rfc5681.html)
- [RFC 9438: CUBIC for Fast and Long-Distance Networks](https://www.rfc-editor.org/rfc/rfc9438.html)
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293.html)
- [RFC 8290: The FlowQueue-CoDel Packet Scheduler and AQM](https://www.rfc-editor.org/rfc/rfc8290.html)
- [RFC 3168: Explicit Congestion Notification](https://www.rfc-editor.org/rfc/rfc3168.html)
- [Linux kernel: IP sysctl reference](https://docs.kernel.org/networking/ip-sysctl.html)
- [Linux network sysctl documentation](https://docs.kernel.org/admin-guide/sysctl/net.html)
- [Bufferbloat](https://en.wikipedia.org/wiki/Bufferbloat)
- [TCP congestion control](https://en.wikipedia.org/wiki/TCP_congestion_control)
