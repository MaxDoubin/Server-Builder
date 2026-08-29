## The problem

Something on the network is slow, intermittent, or resetting, and the logs on both ends say nothing useful. The application team says it is the network, the network team says it is the application, and neither has evidence. A packet capture is how you stop guessing, but only if you take it in the right place, filter it usefully, and know what a healthy conversation looks like so you can spot the sick one.

## When to reach for packet captures

Use packet captures when layer 2-4 problems are not obvious from interface statistics and logs. Common scenarios: unexplained TCP retransmissions, connection resets, intermittent connectivity, suspected firewall misconfigurations, and application performance issues where the application team blames the network.

Before you capture, check the cheaper sources. `ip -s link` and the switch's interface counters will tell you about CRC errors, drops, and discards in one command. If an interface is showing input errors climbing, you have your answer and do not need a capture at all. Captures are for the problems where every counter is clean and the behaviour still makes no sense.

## Capturing in the right place

The most common mistake is capturing in the wrong place. To diagnose a problem, you need captures on both sides of the suspected failure point:

- Client-side capture shows what the client sent and received
- Server-side capture shows what the server sent and received
- A mismatch between them tells you where packets are being dropped or modified

For a firewall issue, capture on both the inside and outside interfaces simultaneously.

You have three ways to get the traffic. Capturing on the host itself is easiest and lies to you the most, because it sees the packet before the NIC has finished with it. A SPAN or mirror port on the switch copies traffic from one or more ports to a monitor port, which is what I use most of the time. A physical TAP sits inline and is the only method that cannot drop frames under load, because it is not sharing a forwarding path with production traffic.

The limitation of SPAN worth knowing up front: the mirror destination has the same speed as any other port. Mirroring two saturated 1 Gb ports into one 1 Gb monitor port means the switch discards the excess, and those discards look exactly like network loss in your capture. If you are chasing loss, mirror one direction at a time or use a TAP.

Also make sure the clocks agree. Two captures taken on machines whose time differs by 400 ms are almost useless for deciding which side was late. Check that both hosts are synchronised before you start, not after.

## Capture filters and display filters are different languages

This trips up everyone once. A capture filter uses BPF syntax and decides what gets written to disk. A display filter uses [Wireshark](/blog/wireshark-packet-analysis)'s own syntax and decides what you see afterwards. They are not interchangeable, and typing one where the other belongs gives a syntax error or, worse, silently matches nothing.

```
# capture filter (BPF): what tcpdump and dumpcap accept
host 192.168.1.100 and tcp port 443

# display filter (Wireshark): what the filter bar accepts
ip.addr == 192.168.1.100 && tcp.port == 443
```

`host` versus `ip.addr`, `and` versus `&&`, `tcp port 443` versus `tcp.port == 443`. Same intent, different grammar.

## Filtering effectively

Capturing everything is usually too much data. Use display filters in Wireshark to focus on what matters:

```
# Filter to a specific host
ip.addr == 192.168.1.100

# Show only TCP problems
tcp.analysis.flags && !tcp.analysis.ack

# Show DNS traffic
dns

# Show TLS handshakes
ssl.handshake

# Show HTTP requests
http.request
```

One note on that TLS line: `ssl` is the historical name and still works as an alias, but the current dissector is `tls`, so `tls.handshake.type == 1` for ClientHello and `tls.handshake.type == 2` for ServerHello are what the documentation uses now. Both resolve.

`tcp.analysis.flags` is worth understanding rather than just copying. It is not a field in the packet. Wireshark generates it by tracking the state of each TCP stream and flagging anything that looks anomalous. That means it is an opinion, not a fact: a capture that missed the original packet will show the real transmission as a retransmission, because Wireshark never saw the first copy.

## What to look for

**TCP retransmissions:** The sender is not receiving acknowledgments. Usually indicates packet loss.

**TCP resets (RST):** An abrupt connection termination. Could be a firewall blocking mid-session, a crashed service, or a NAT timeout.

**ICMP unreachable messages:** The return path might be failing while the forward path works.

**Time deltas:** In the time column, large deltas before a packet indicate delay at the sending side. Large deltas before an ACK indicate delay at the receiving side.

**Window size zero:** The receiver's buffer is full. Application is not reading data fast enough.

Two more patterns come up constantly.

**Duplicate ACKs.** The receiver keeps acknowledging the same sequence number because it is getting later segments but not the missing one. Three duplicate ACKs trigger fast retransmit, so a burst of three followed by a retransmission is TCP recovering normally. A long run of them means the retransmission is not getting through either.

**ICMP type 3 code 4, fragmentation needed.** This is a router telling you the packet is too big for the next hop and the do-not-fragment bit was set. If you see these, path MTU discovery is doing its job. If you see a connection that completes its handshake and then stalls the moment real data flows, and you see no ICMP at all, you probably have a PMTU black hole where a firewall is filtering the ICMP that would have told the sender to send smaller packets.

## Capturing on Linux

```bash
# Capture on eth0 to a file
tcpdump -i eth0 -w capture.pcap host 192.168.1.100

# Rotate files every 100MB, keep 10 files
tcpdump -i eth0 -w capture.pcap -C 100 -W 10
```

The units on `-C` are millions of bytes, not mebibytes, so `-C 100` rotates at 100,000,000 bytes. With `-W 10` you have bounded the capture at roughly one gigabyte on disk, which is the point: an unbounded capture on a busy interface will fill the root filesystem and take the box down with it.

A few flags I add by reflex. `-n` disables name resolution, which stops tcpdump generating its own DNS traffic into your capture. `-s 0` sets an unlimited snaplen, though modern tcpdump already defaults to 262144 bytes, which is effectively unlimited for Ethernet. `-e` prints the link-layer header, which you need when you are chasing VLAN tags or MAC addresses. Add `-Z` if you want it to drop privileges after opening the interface.

Do not use `-i any` when Layer 2 matters. On Linux it captures with a synthetic cooked-mode header rather than the real Ethernet header, so MAC addresses and VLAN tags are not there to look at.

## A worked example

Say a file transfer between 10.0.20.5 and 10.0.30.42 is slow. Capture on the server for two minutes with a filter, then measure rather than scroll.

```bash
tcpdump -i eth0 -n -w /var/tmp/slow.pcap host 10.0.30.42 and tcp port 445
```

Confirm you actually caught something:

```bash
capinfos -c -u /var/tmp/slow.pcap
```

```
File name:           /var/tmp/slow.pcap
Number of packets:   61 k
Capture duration:    120.114 seconds
```

Now count retransmissions by direction:

```bash
tshark -r /var/tmp/slow.pcap -Y tcp.analysis.retransmission \
  -T fields -e ip.src -e ip.dst | sort | uniq -c | sort -rn
```

```
    418 10.0.20.5	10.0.30.42
      3 10.0.30.42	10.0.20.5
```

That is the answer. 418 retransmissions from the server toward the client and effectively none coming back means loss is on the server-to-client path, not the reverse. Roughly 0.7 percent of the packets in this capture, which is more than enough to collapse TCP throughput. Next step is to capture at the client at the same time and see whether those 418 packets arrived, which tells you whether they were lost in the network or never really left.

Check for zero windows before you blame the network at all:

```bash
tshark -r /var/tmp/slow.pcap -Y tcp.analysis.zero_window -T fields -e ip.src | sort | uniq -c
```

No output means no zero windows, so the receiving application was keeping up. Output here would have meant the problem was a slow reader, not loss.

## What breaks

**Checksum offload makes every outbound packet look corrupt.** When you capture on the sending host, the NIC has not computed the checksum yet, so Wireshark flags thousands of "incorrect checksum" errors on traffic that is completely fine. Turn off the checksum validation in Wireshark's TCP preferences, or capture somewhere other than the sender, before you go hunting for a corruption problem that does not exist.

**Segmentation offload shows frames bigger than the MTU.** With TSO and GRO enabled, the kernel hands the NIC one large buffer and the NIC splits it, so a capture on the host shows a 20000 byte "frame" on a 1500 byte link. Those are not real frames and their timing is not real timing. Disable with `ethtool -K eth0 tso off gso off gro off` while capturing, or capture off-box.

**The NIC strips the VLAN tag before you see it.** Hardware VLAN offload removes the 802.1Q tag on receive, so a capture on a trunked host shows untagged frames and you conclude tagging is broken. `ethtool -K eth0 rxvlan off` puts the tag back in the capture.

**A snaplen from an old habit truncates the payload.** Copying `-s 96` out of an old runbook gives you headers and nothing else, and you find out after the incident is over. If the capture shows `[Packet size limited during capture]`, that is what happened.

**The mirror port silently drops what you are looking for.** Covered above and it is the cruellest failure mode, because the missing packets look like exactly the network loss you are investigating. Compare the packet count at the source port counters against what landed in your file before you trust a SPAN capture that shows loss.

## References

- https://www.tcpdump.org/manpages/tcpdump.1.html
- https://www.tcpdump.org/manpages/pcap-filter.7.html
- https://www.wireshark.org/docs/man-pages/tshark.html
- https://www.rfc-editor.org/rfc/rfc9293
- https://www.rfc-editor.org/rfc/rfc1191
- https://en.wikipedia.org/wiki/Port_mirroring
