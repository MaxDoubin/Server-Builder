
## When to Reach for Packet Captures

Use packet captures when layer 2-4 problems are not obvious from interface statistics and logs. Common scenarios: unexplained TCP retransmissions, connection resets, intermittent connectivity, suspected firewall misconfigurations, and application performance issues where the application team blames the network.

## Capturing in the Right Place

The most common mistake is capturing in the wrong place. To diagnose a problem, you need captures on both sides of the suspected failure point:

- Client-side capture shows what the client sent and received
- Server-side capture shows what the server sent and received
- A mismatch between them tells you where packets are being dropped or modified

For a firewall issue, capture on both the inside and outside interfaces simultaneously.

## Filtering Effectively

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

## What to Look For

**TCP retransmissions:** The sender is not receiving acknowledgments. Usually indicates packet loss.

**TCP resets (RST):** An abrupt connection termination. Could be a firewall blocking mid-session, a crashed service, or a NAT timeout.

**ICMP unreachable messages:** The return path might be failing while the forward path works.

**Time deltas:** In the time column, large deltas before a packet indicate delay at the sending side. Large deltas before an ACK indicate delay at the receiving side.

**Window size zero:** The receiver's buffer is full. Application is not reading data fast enough.

## Capturing on Linux

```bash
# Capture on eth0 to a file
tcpdump -i eth0 -w capture.pcap host 192.168.1.100

# Rotate files every 100MB, keep 10 files
tcpdump -i eth0 -w capture.pcap -C 100 -W 10
```
