## The problem

You open a capture with two hundred thousand packets in it and you need one answer: which host sent the credentials, where the connection died, what the server actually replied. Scrolling is not going to find it. What finds it is a filter you can write from memory and knowing which of Wireshark's statistics windows answers your particular question in one click.

## More than a packet viewer

Wireshark is the most powerful network analysis tool available, and it is free. But most people only scratch the surface. They open a capture, scroll through packets, and get overwhelmed by the volume of data. The real power of Wireshark comes from knowing how to filter, follow streams, and extract the information you actually need.

## Capture filters versus display filters

Capture filters limit what Wireshark records. Display filters limit what you see after capture. For troubleshooting, I usually capture everything and use display filters to narrow down. For long-running captures, I use capture filters to avoid filling the disk.

They are also two different languages, which is the part that catches people. Capture filters are BPF, the same syntax tcpdump takes: `tcp port 443 and host 10.0.20.5`. Display filters are Wireshark's own: `tcp.port == 443 && ip.addr == 10.0.20.5`. Typing one into the other's box gives you either a red filter bar or a filter that quietly matches nothing.

Common display filters I use constantly:

```
ip.addr == 10.0.20.5
tcp.port == 443
dns
http.request
tcp.analysis.retransmission
```

## The syntax worth memorising

Five operators cover almost everything.

```
# equality, inequality, ranges
tcp.port == 443
ip.ttl < 64
tcp.port in {80 443 8080}

# substring match anywhere in the bytes
frame contains "password"
http.host contains "login"

# regular expression, case-insensitive
frame matches "(?i)passw(or)?d"

# field presence, with no value test at all
http.authorization
dns.flags.rcode != 0
```

Two of those deserve a note. `contains` searches raw bytes, so it works on any field including `frame` itself, which is how you sweep an entire capture for a string without knowing which protocol carried it. `matches` takes a PCRE-style regular expression, which is slower but lets you look for patterns rather than literals.

Watch out for one trap that produces wrong answers rather than errors. `ip.addr != 10.0.20.5` does not mean what it looks like. A packet has two address fields, so the expression is true whenever *either* one differs, which is almost always. The correct form is `!(ip.addr == 10.0.20.5)`. The same applies to every field that occurs more than once in a packet.

## Following streams

When I am troubleshooting a specific connection, I right-click a packet and select "Follow TCP Stream." This reconstructs the entire conversation between two endpoints in order, which is invaluable for understanding what happened in an HTTP request, an SMTP exchange, or any other protocol.

Notice what happens to the filter bar when you do that: it fills in with `tcp.stream eq 7`. Wireshark numbers every TCP conversation in the file from zero, and that index is the fastest way to isolate a conversation once you have found one interesting packet in it. `udp.stream` does the same for UDP.

## Statistics that beat scrolling

Before filtering anything, two windows tell you what is in the file.

**Statistics > Protocol Hierarchy** breaks the whole capture down by protocol with packet and byte counts. If you expected an HTTPS-heavy capture and the hierarchy is 80 percent DNS, you have learned something before writing a single filter.

**Statistics > Conversations** lists every pair of endpoints with packet counts, byte counts, and duration, and it sorts. The top talker in a capture is usually either the answer or the noise you need to filter out.

**Statistics > Capture File Properties** gives you the capture duration, the number of dropped packets recorded by the capture engine, and the snaplen. Check the dropped count before trusting any conclusion about loss.

**Analyze > Expert Information** collects every warning and error Wireshark's dissectors generated, grouped by type. It is the fastest way to see that a capture contains 4000 retransmissions and 12 resets without knowing to look for them.

## Competition use

In NCL competitions, Wireshark challenges typically give you a capture file and ask you to extract specific information. Common tasks include identifying what credentials were transmitted in plaintext, finding DNS queries to suspicious domains, and reconstructing file transfers.

The key to speed in competitions is knowing your filters cold. If you have to look up filter syntax during a timed challenge, you are losing minutes. I practice by generating my own captures in the lab and querying them until the syntax is automatic.

Here is the credentials question done from the command line, which is faster than the GUI once you know the field names. FTP sends its login in the clear, and the commands are named fields:

```bash
tshark -r ctf.pcap \
  -Y 'ftp.request.command == "USER" || ftp.request.command == "PASS"' \
  -T fields -e frame.number -e ip.src -e ftp.request.command -e ftp.request.arg
```

```
17	10.0.50.14	USER	labuser
21	10.0.50.14	PASS	hunter2-not-really
```

Frame numbers, the client that sent them, and the arguments. The same shape works for any plaintext protocol: `http.authorization` for HTTP basic auth, `telnet.data` for telnet, `pop.request.parameter` for POP3.

When you do not know which protocol carried the string, sweep the bytes instead:

```bash
tshark -r ctf.pcap -Y 'frame matches "(?i)passw(or)?d"' -T fields -e frame.number -e _ws.col.protocol
```

And to see what is even in the file:

```bash
tshark -r ctf.pcap -q -z io,phs
```

```
===================================================================
Protocol Hierarchy Statistics
Filter:

eth                                      frames:48213 bytes:39104882
  ip                                     frames:48090 bytes:39093410
    tcp                                  frames:44012 bytes:37882110
      http                               frames:1204 bytes:1902334
      ftp                                frames:96 bytes:8814
    udp                                  frames:4078 bytes:1211300
      dns                                frames:3944 bytes:1180122
===================================================================
```

Ninety-six FTP frames in a capture of forty-eight thousand. That is where to look, and the hierarchy found it in one command.

For file recovery challenges, **File > Export Objects** carves reassembled objects straight out of the capture for HTTP, SMB, TFTP, and email, writing them to disk as real files. That is usually the intended solution when a challenge asks what image was downloaded.

## Coloring rules

I customize Wireshark's coloring rules to highlight problems immediately. TCP retransmissions get a red background. DNS errors get yellow. RST packets (connection resets) get orange. This means I can open a capture and immediately spot problem areas without reading every packet.

Coloring rules live in a file called `colorfilters` inside your Wireshark profile directory, so they can be copied between machines or kept in version control. Better still, put them in a **configuration profile** (right-click the profile area in the status bar). I keep one profile tuned for troubleshooting, with time displayed as seconds since the previous displayed packet, and a different profile for competition work with different columns. Switching profiles takes one click and changes columns, colors, and preferences together.

## Export and scripting

For large-scale analysis, I use tshark (Wireshark's command-line counterpart) to extract specific fields into CSV format, then process the data with Python. This is much faster than scrolling through millions of packets in the GUI.

```bash
tshark -r capture.pcap -T fields -e frame.time -e ip.src -e ip.dst -e tcp.dstport -Y "tcp.flags.syn==1" > connections.csv
```

Add `-E header=y -E separator=,` when you want a real CSV with a header row rather than tab-separated output. And if a capture is too large to open in the GUI at all, `editcap` will cut it down first: `editcap -c 100000 big.pcap chunk.pcap` splits it into files of 100,000 packets each, and `editcap -A` and `-B` trim by absolute start and stop time.

## Decrypting TLS

Most traffic worth analysing is encrypted, and Wireshark can read it if you have the session keys. You do not need the server's private key, and with TLS 1.3 that would not help anyway because the key exchange is always ephemeral.

Instead, have the client write out its session secrets:

```bash
export SSLKEYLOGFILE=/tmp/keys.log
firefox &
```

Then point Wireshark at the file under Preferences > Protocols > TLS > (Pre)-Master-Secret log filename. HTTPS in that capture becomes readable HTTP. Firefox, Chrome, and curl all honour the variable. This is the legitimate way to debug your own TLS traffic, and it only works for traffic whose client cooperated.

## What breaks

**Running the GUI as root.** Wireshark's dissectors parse hostile input from the network, and they have had memory-safety bugs. Capture with `dumpcap` or grant the capability with `setcap cap_net_raw,cap_net_admin+eip`, then analyse as a normal user. On Debian-family systems, adding yourself to the `wireshark` group and re-logging in is the supported path.

**"Incorrect checksum" everywhere on a host capture.** Checksum offload means the NIC fills these in after Wireshark sees the packet. It is not corruption. Turn off checksum validation in the TCP and IP protocol preferences before you chase it.

**Trusting `tcp.analysis` flags on a partial capture.** Those flags are generated by Wireshark's own stream tracking, not read from the packets. If your capture started mid-conversation or dropped packets, perfectly normal traffic is labelled as retransmissions and out-of-order segments. Check the dropped-packet count in the file properties first.

**Name resolution changing what you see.** With network name resolution enabled, Wireshark issues its own DNS lookups, which appear in a live capture and pollute it. Keep it off unless you specifically want it.

**Filtering with `!=` on a repeated field.** Described above and worth restating, because it silently returns almost every packet instead of erroring. Wrap the equality in `!()` instead.

## Building intuition

The best way to get good at packet analysis is to capture your own traffic and study it. Set up a span port on your switch, capture for an hour, and explore what you see. You will learn more about how protocols actually work than any textbook can teach.

Pick one protocol at a time and watch it do something you already understand. Load a page and follow the DNS query, the TCP handshake, and the TLS ClientHello in order. Once you have seen a healthy version of a conversation, the broken one stands out immediately, and that recognition is the whole skill.

## References

- https://www.wireshark.org/docs/man-pages/wireshark-filter.html
- https://www.wireshark.org/docs/man-pages/tshark.html
- https://www.wireshark.org/docs/dfref/
- https://www.wireshark.org/docs/man-pages/editcap.html
- https://www.rfc-editor.org/rfc/rfc959
- https://en.wikipedia.org/wiki/Wireshark
