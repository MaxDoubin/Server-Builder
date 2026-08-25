
## Measure first, or you are just guessing

Search for Linux network tuning and you get a list of twenty sysctls to paste
in. Some of those values were reasonable on a kernel from a decade ago, several
are now defaults, and a few are actively harmful. None of them come with a way
to tell whether they helped.

So the rule I hold to: do not change a value until you can name the counter
that is going to move. If you cannot name the counter, you do not have a
problem you understand, and you will not be able to tell whether the change
worked.

## The counters that matter, in order

Start at the driver and work up.

```bash
# drops, errors, and per queue detail from the NIC driver
ethtool -S eth0 | grep -Ev ': 0$'

# ring buffer sizes: current versus hardware maximum
ethtool -g eth0

# offloads currently enabled
ethtool -k eth0

# kernel level per interface counters
ip -s -s link show eth0

# socket level: overflows, pruning, retransmits
nstat -az | grep -Ei 'drop|overflow|prune|retrans|listen'
ss -tin state established | head -40
```

What each is telling you:

- **rx_dropped or rx_no_buffer climbing** means packets arrived faster than the
  driver could hand them off. Small bursts point at ring buffer size; sustained
  drops point at CPU.
- **rx_missed_errors** means the NIC itself could not get packets across the
  bus. That is a hardware or PCIe level problem, not a sysctl problem.
- **ListenOverflows and ListenDrops** mean your application's accept queue is
  full. Fix the application or its backlog, not the network.
- **TCPRetransSegs relative to OutSegs** is your loss signal. A retransmission
  rate above a fraction of a percent on a LAN means something is genuinely
  broken.

That triage matters because these have completely different fixes and they all
present as "the network is slow."

## Ring buffers and interrupt handling

If you are dropping on bursts and the maximum is higher than the current
setting, raising the ring is a legitimate fix:

```bash
ethtool -g eth0            # check Pre-set maximums first
ethtool -G eth0 rx 4096 tx 4096
```

Larger rings absorb bursts at the cost of latency and cache pressure. They do
not create CPU capacity. If you are dropping steadily rather than in bursts,
the ring change just delays the drop.

For steady drops, look at where the interrupts land. Receive side scaling
spreads flows across queues, and each queue's interrupt is pinned to a CPU. If
every queue lands on CPU 0, you have one core doing all the packet processing
while the rest idle.

```bash
grep eth0 /proc/interrupts        # which CPUs are taking the interrupts
ethtool -l eth0                   # queue counts
ethtool -c eth0                   # interrupt coalescing settings
```

On a NUMA machine, also confirm the NIC's interrupts and the application are on
the same node as the card. Crossing NUMA nodes for every packet is a real and
frequently overlooked cost.

## Offloads: mostly leave them on

Checksum offload, segmentation offload, and generic receive offload move work
into the NIC and reduce per packet CPU cost substantially. Leave them enabled.

The two exceptions are worth knowing:

**Packet capture.** With GRO and LRO active, tcpdump shows you enormous
coalesced segments that never existed on the wire. If you are debugging MSS,
MTU, or segmentation behavior, disable them for the duration and turn them back
on afterward.

```bash
ethtool -K eth0 gro off lro off    # temporarily, for capture only
```

**Bridging and routing.** LRO in particular is problematic when the host
forwards traffic, because it reassembles segments that then have to be
resegmented. Many drivers handle this automatically now, but if you are
forwarding, verify.

## Socket buffers and the bandwidth delay product

Autotuning handles this well for most workloads, and the maximums only matter
when the product of bandwidth and round trip time exceeds them. That is a long
fat network: high speed over long distance. On a LAN with sub millisecond
latency, raising buffer maximums accomplishes nothing.

The calculation:

```
BDP (bytes) = bandwidth (bits/sec) / 8 * RTT (seconds)

10 Gbit/s over 80 ms  = 1.25e9 * 0.08  = 100 MB
10 Gbit/s over 0.2 ms = 1.25e9 * 0.0002 = 250 KB
```

The first case needs tuning. The second is nowhere near the defaults.

```ini
# /etc/sysctl.d/90-net.conf, only if your BDP justifies it
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 131072 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq
```

Note the middle value in `tcp_rmem` is the default, and the third is the
autotuning ceiling. Raising the ceiling lets autotuning go further when needed.
Raising the default forces every socket to allocate more, which wastes memory
across thousands of connections. Change the ceiling, leave the default alone.

## The unglamorous conclusion

Confirm the negotiated link speed and duplex before anything else. Look for
errors and drops. Check whether one CPU is saturated with soft interrupts.
Compute your bandwidth delay product before touching a buffer. Then measure
again with `iperf3` between the same two hosts before and after every single
change, one change at a time.

Most of the time the answer is not a sysctl. It is a bad cable, a duplex
mismatch, an MTU problem, an application with a small accept backlog, or one
core pinned at 100 percent. Tuning the kernel does not fix any of those, and
reaching for sysctls first is how you spend a day making a machine slightly
worse.

## References

- [ethtool(8)](https://man7.org/linux/man-pages/man8/ethtool.8.html)
- [Scaling in the Linux Networking Stack](https://docs.kernel.org/networking/scaling.html)
- [Linux sysctl: net documentation](https://docs.kernel.org/admin-guide/sysctl/net.html)
- [Segmentation offloads](https://docs.kernel.org/networking/segmentation-offloads.html)
- [RFC 7323: TCP Extensions for High Performance](https://www.rfc-editor.org/rfc/rfc7323.html)
- [iperf3](https://software.es.net/iperf/)
