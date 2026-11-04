
## The short answer

"Handshake for peer 1 (endpoint) did not complete after 5 seconds, retrying (try 2)" is WireGuard's retransmit timer firing: a handshake initiation went out, no valid response came back within Rekey-Timeout, which is [5 seconds in the whitepaper](https://www.wireguard.com/papers/wireguard.pdf) and in the kernel's [messages.h](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h), and another one is sent. The kernel makes 20 attempts, about 100 seconds, then gives up until the next outgoing packet starts a new round. The line cannot say why, because WireGuard [sends no response to unauthenticated packets](https://www.wireguard.com/papers/wireguard.pdf) (section 5.1): a closed port, a wrong key and a lost reply look the same from the client. Each initiation is 148 bytes by the [message layout](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h), so `wg show` reading "0 B received, 592 B sent" means four unanswered attempts. Run `tcpdump -ni eth0 udp port 51820` on the server to see whether they arrive, and `echo module wireguard +p > /sys/kernel/debug/dynamic_debug/control`, from the [quickstart](https://www.wireguard.com/quickstart/), to see why the server dropped them. Usual causes are an unopened or unforwarded UDP port, a server behind carrier-grade NAT in [100.64.0.0/10](https://www.rfc-editor.org/rfc/rfc6598), a mismatched public or preshared key and a client clock that runs behind. PersistentKeepalive = 25 holds a NAT mapping open but does not repair a first handshake that never got through.

## What does "did not complete after 5 seconds" mean, and where does the 5 come from?

After sending an initiation, WireGuard waits Rekey-Timeout plus jitter for a handshake response and then sends a new initiation with fresh ephemeral keys, per [section 6.4 of the whitepaper](https://www.wireguard.com/papers/wireguard.pdf). The kernel adds a random delay below one third of a second ([REKEY_TIMEOUT_JITTER_MAX_JIFFIES = HZ / 3](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h)), so retries land about 5.0 to 5.33 seconds apart. The whitepaper's constants table sets the timers involved:

| Timer | Value | Part in this failure |
|---|---|---|
| Rekey-Timeout | 5 s | Gap between initiations; the "5 seconds" in the log line |
| Keepalive-Timeout | 10 s | Plus Rekey-Timeout, 15 s of silence after sending data restarts a handshake, per [timers.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c) |
| Rekey-Attempt-Time | 90 s | How long retries continue |
| Rekey-After-Time | 120 s | Age at which a working session is replaced |
| Reject-After-Time | 180 s | Age at which a session's keys are refused |

The kernel implements Rekey-Attempt-Time as a counter. [messages.h](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h) sets MAX_TIMER_HANDSHAKES to 90 / 5 = 18, and [timers.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c) gives up only when the counter exceeds 18. The log therefore counts from "try 2" to "try 20" and ends with "did not complete after 20 attempts, giving up", roughly 100 seconds after the first attempt. [wireguard-go](https://git.zx2c4.com/wireguard-go/tree/device/timers.go) uses the same test with a shorter message. Giving up does not end the story: the whitepaper says the counter "is reset when a peer explicitly attempts to send a new transport data message," so a continuous ping restarts the cycle and the log runs from "try 2" to "try 20" again and again.

Two details explain why the line sometimes appears late or on the wrong machine.

- A fresh tunnel starts no handshake by itself. The quickstart says WireGuard is ["not a chatty protocol"](https://www.wireguard.com/quickstart/) and transmits only when a peer wants to send. A peer with PersistentKeepalive set sends a keepalive when the interface comes up, per [device.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/device.c), which starts a handshake at once. Without it, a missing "latest handshake" line right after bring-up is normal.
- Either side can log it. A poster running about 300 peers on a CentOS server [saw the line for roughly 200 of them](https://lists.zx2c4.com/pipermail/wireguard/2022-September/007821.html) and asked whether it was expected when the server initiates toward laptops that are off.

The Linux module writes the line with `pr_debug`, so it appears only [after debug logging is enabled](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c). Owner threads on [MikroTik](https://forum.mikrotik.com/t/help-with-wireguard-setup-behind-nat/263748) and [OPNsense](https://forum.opnsense.org/index.php?topic=30540.0) quote it verbatim from router and client logs. A [GL.iNet forum thread](https://forum.gl-inet.com/t/4-x-wireguard-rekey-timeout-troubleshooting/25814) opens by calling it a general message that carries no information about the reason.

## How do you tell whether the initiation ever reached the server?

Read the counters first, then capture on the server. `wg show` prints the transfer line only when a counter is nonzero, per [show.c](https://git.zx2c4.com/wireguard-tools/tree/src/show.c). The transmit counter grows only when the UDP stack accepts the packet ([socket.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/socket.c)), and the receive counter grows only for authenticated packets ([receive.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/receive.c)). Message sizes come from [messages.h](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h): an initiation is 4 + 4 + 32 + 48 + 28 + 16 + 16 = 148 bytes, a response is 92, a cookie reply is 64 and an empty keepalive is 32.

| Client `wg show wg0` | What it means |
|---|---|
| No transfer line, no latest handshake | Nothing left the host: interface down, no route to the endpoint, or no traffic yet |
| `0 B received, 148 B sent` (then 296, 444, 592 ...) | Initiations left, nothing authenticated came back |
| `latest handshake: 3 seconds ago`, `92 B received, 180 B sent` | Done: 148 B initiation plus a 32 B empty [confirmation packet](https://www.wireguard.com/protocol/) sent, 92 B response received, if the tunnel was idle |

On the server, a peer with no `endpoint:` line and no configured endpoint has not had a valid initiation accepted since the interface came up, because an unset endpoint is [learned from authenticated packets](https://www.wireguard.com/papers/wireguard.pdf) (section 2.1). Capture on the server's WAN interface; the [tcpdump manual](https://www.tcpdump.org/manpages/tcpdump.1.html) defines `-i` for the interface and `-n` for no name lookups.

```bash
sudo tcpdump -ni eth0 'udp port 51820'
```

A healthy exchange shows a 148-byte datagram in and a 92-byte datagram out, and a retrying client shows the 148-byte datagram repeating every 5 seconds. Where the capture stops tells you where to look:

| On the server | Likely location of the fault |
|---|---|
| Nothing arrives | Path to the server: port forward, firewall in front, CGNAT, wrong endpoint |
| 148-byte packets arrive, nothing leaves | Host firewall or WireGuard dropping them silently: keys or clock |
| 92-byte replies leave, client counters stay at 0 B received | Reply lost on the way back (wrong egress interface or source address), or rejected by the client (preshared key mismatch) |

One caveat applies to the middle row. Packet sockets work at the [device driver level](https://man7.org/linux/man-pages/man7/packet.7.html), while Netfilter's INPUT hook runs [after routing](https://www.netfilter.org/documentation/HOWTO/netfilter-hacking-HOWTO-3.html), so a capture proves arrival, not acceptance. [Wireshark](/blog/wireshark-packet-analysis) has a WireGuard dissector under the display filter [`wg`](https://wiki.wireshark.org/WireGuard), and the [Wireshark filter reference](/tools/wireshark-filters) and [packet capture troubleshooting](/blog/troubleshooting-packet-captures) cover the rest.

## Is the server's UDP port open and forwarded, or is it behind CGNAT?

Confirm the server listens where the client expects with `wg show wg0 listen-port`, a subcommand listed in [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8). That man page also says an unset ListenPort is chosen randomly, so a server without one can come back on a different port after a restart. Then open the port for UDP, not TCP:

```bash
sudo ufw allow 51820/udp
sudo firewall-cmd --permanent --add-port=51820/udp && sudo firewall-cmd --reload
```

[ufw](https://manpages.ubuntu.com/manpages/noble/man8/ufw.8.html) takes the protocol as a "/protocol" suffix on the port, and [firewalld](https://firewalld.org/documentation/man-pages/firewall-cmd.html) takes `--add-port=portid[-portid]/protocol`. Cloud security groups and the router's port forward are separate layers. A forward must be UDP, must point at the server's LAN address and must target the ListenPort. The GL.iNet [thread](https://forum.gl-inet.com/t/4-x-wireguard-rekey-timeout-troubleshooting/25814) names bad port forwards and ISPs that block UDP among the causes, including one modem that blocked incoming UDP despite a forward.

Port checkers mislead here. Nmap says that when a UDP probe gets no response it ["cannot determine whether the port is open or filtered"](https://nmap.org/book/scan-methods-udp-scan.html), and WireGuard is built to be ["invisible to illegitimate peers and network scanners"](https://www.wireguard.com/papers/wireguard.pdf). A scan can never confirm the port, so use the tcpdump capture above.

### Does the router have a public address?

Compare the WAN address on the router's status page with the address a what-is-my-IP service reports from outside. A WAN address in [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918) space (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) means another NAT sits upstream. An address in 100.64.0.0/10 is the block [RFC 6598](https://www.rfc-editor.org/rfc/rfc6598) reserved as Shared Address Space "to accommodate the needs of Carrier-Grade NAT (CGN) devices." In both cases a forward on your own router cannot be reached from the Internet. The fixes are a public address from the ISP, IPv6 on both ends (the endpoint syntax is `[2607:5300:60:6b0::c05f:543]:2468`, from [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8)), or reversing the roles: put the server on a host with a public address and let the home network connect out. The whitepaper notes that the [initiator and responder can transparently switch roles](https://www.wireguard.com/papers/wireguard.pdf). The [WireGuard and IPsec comparison](/blog/wireguard-vs-ipsec-tunnels) has an example peer block for a branch site.

### Does the reply leave by the interface the request arrived on?

On a multi-WAN firewall it may not. An OPNsense user with two WANs [reported](https://forum.opnsense.org/index.php?topic=30540.0) that "the response is going via the other WAN (not the one the request came from)," and the thread recorded no fix for that setup. The kernel remembers the local source address for a peer and, on each retry, [clears it "in case this is the cause of trouble"](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c), so the next attempt starts from a fresh route lookup. [Why replies take the wrong path](/blog/nothing-translates-the-reply) covers the NAT side and [policy-based routing on Linux](/blog/policy-based-routing-linux) covers pinning replies to the right uplink.

## Do the keys, Endpoint, ListenPort and clock match on both sides?

When packets arrive and nothing answers, the server rejected them silently. With debug logging on, each rejection reason gets its own line, and the whitepaper and kernel explain the difference:

| Mistake | Server debug line | Why |
|---|---|---|
| Client holds the wrong server public key | `Invalid MAC of handshake, dropping packet from 198.51.100.7:40122` | mac1 is keyed from the receiver's public key, per [section 5.4.4](https://www.wireguard.com/papers/wireguard.pdf) and [cookie.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/cookie.c) |
| Server has no peer with the client's key | `Invalid handshake initiation from 198.51.100.7:40122` | The MAC passes, then the [peer lookup](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/noise.c) of the decrypted static key fails |
| Client timestamp not newer than the last one | Same `Invalid handshake initiation` line | The replay check is in the same function |
| Wrong port or endpoint | None | The packet never arrives |

Each line starts with `wireguard: wg0:`, where the module name comes from the [module's Makefile](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/Makefile) and the interface name from the device.

### Are the public keys paired correctly?

Each side needs the other side's public key in its [PublicKey field](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8). A private key pasted where a public key belongs matches no peer and produces one of the first two rows above. Derive the public key with `wg pubkey < privatekey` and compare it with the "public key" line in `wg show` on the same host.

### Do the preshared keys agree?

A PresharedKey enters the handshake in the response message, not the initiation ([protocol page](https://www.wireguard.com/protocol/), [noise.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/noise.c)). A server whose peer has a PSK that the client lacks, or sets differently, accepts the initiation and logs `Receiving handshake initiation` and `Sending handshake response` as if all were well. The client cannot authenticate the reply and logs `Invalid handshake response from 203.0.113.10:51820` ([receive.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/receive.c)). The server's `wg show` lists an endpoint for the peer but no latest handshake.

### Does the Endpoint match, and does it stay current?

The client's Endpoint port must equal the server's ListenPort, or the external port mapped to it. A GL.iNet owner [reported](https://forum.gl-inet.com/t/4-x-wireguard-rekey-timeout-troubleshooting/25814) that a tunnel failing about every 24 hours came back immediately after changing the listen port, and the thread confirmed no root cause.

A hostname Endpoint is resolved when the configuration is applied. [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8) documents `WG_ENDPOINT_RESOLUTION_RETRIES`, default 15 retries with growing delays, for failed lookups. A later DNS change reaches the kernel only when something runs `wg set` again, which is why wireguard-tools ships [reresolve-dns](https://git.zx2c4.com/wireguard-tools/tree/contrib/reresolve-dns/README). Run from cron "every thirty seconds or so," it re-applies the endpoint of any peer whose [last handshake is older than 135 seconds](https://git.zx2c4.com/wireguard-tools/tree/contrib/reresolve-dns/reresolve-dns.sh).

### Can a wrong clock stop the handshake?

Yes. The first message carries an encrypted 12-byte TAI64N timestamp, and the responder "keeps track of the greatest timestamp received per peer and discards packets containing timestamps less than or equal to it" ([whitepaper](https://www.wireguard.com/papers/wireguard.pdf), section 5.1). The kernel builds the value from the [wall clock and rejects any initiation](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/noise.c) whose timestamp does not exceed the stored one. A client that moves backward past its last accepted time is ignored until its clock catches up, and a server restart clears the stored value. A FreeBSD user [reported](https://forums.freebsd.org/threads/wireguard-connection-not-established-due-to-clock-out-of-sync.84824/post-563707) a Raspberry Pi 3 client whose handshake to a pfSense server failed after boot with the system clock about an hour off, and succeeded after about an hour as ntpd closed the gap. The debug line is the same as for an unknown key, so rule out keys first, then compare `date -u` on both hosts. [Clock skew breaks other protocols](/blog/the-clock-is-the-last-thing-anybody-checks) with equally unhelpful messages.

## Why can a handshake complete and still carry no traffic?

That is a different failure with a different symptom: the client shows a recent "latest handshake," and no "did not complete" line appears. A finished handshake proves the port, the keys and the clock are right. What remains is AllowedIPs, routing, forwarding and MTU.

[AllowedIPs](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8) works in both directions: it lists the addresses "from which incoming traffic for this peer is allowed and to which outgoing traffic for this peer is directed." A packet from a source outside the list is dropped and, with debug logging on, [logged](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/receive.c) as `Packet has unallowed src IP (10.99.0.9) from peer 1 (...)`. Peer numbers come from a [module-wide counter](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/peer.c), not from the key. [wg-quick](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8) "infers all routes from the list of peers' allowed IPs," so a missing prefix is also a missing route. `ip route get 10.99.0.2` prints the route [exactly as the kernel sees it](https://man7.org/linux/man-pages/man8/ip-route.8.html), including the interface.

A server that forwards for a LAN needs forwarding on, and [ip_forward](https://docs.kernel.org/networking/ip-sysctl.html) defaults to 0, disabled. wg-quick's PostUp and PostDown keys run script snippets that its [man page](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8) says are "most commonly used to configure custom DNS options or firewall rules."

MTU is not a cause of a failed handshake. An initiation plus 28 bytes of IPv4 and UDP headers is 176 bytes. MTU problems show up only after the handshake, as small packets working and large transfers stalling, which the [MTU and jumbo frames](/blog/mtu-and-jumbo-frames) article describes. wg-quick sets the MTU [automatically from the endpoint or default route](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8) unless the config names one, and the [MTU and MSS calculator](/tools/mtu-mss-calculator) does the arithmetic for the underlay.

## When does PersistentKeepalive matter, and which side needs it?

It matters for a peer behind NAT or a stateful firewall that must receive packets while it is not sending any. The quickstart says that such a peer must keep the NAT mapping valid by sending keepalives, that [25 seconds is "a sensible interval that works with a wide variety of firewalls,"](https://www.wireguard.com/quickstart/) and that the default is 0, off. [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8) accepts 1 to 65535 seconds. A keepalive is an authenticated empty packet, 32 bytes by [messages.h](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h).

The number 25 sits between published limits:

| Source | Figure |
|---|---|
| [RFC 4787](https://www.rfc-editor.org/rfc/rfc4787), REQ-5 | NAT UDP mapping timer "MUST NOT expire in less than two minutes," except for well-known ports, with five minutes recommended |
| [Linux conntrack](https://docs.kernel.org/networking/nf_conntrack-sysctl.html) | `nf_conntrack_udp_timeout` 30 s, `nf_conntrack_udp_timeout_stream` 120 s |
| [RFC 8085](https://www.rfc-editor.org/rfc/rfc8085) | Keepalives "SHOULD NOT" be sent more often than every 15 s, and "a significant fraction" of deployed middleboxes use shorter timeouts than RFC 4787's two minutes |

Twenty-five seconds stays under a 30-second conntrack timer without breaching RFC 8085's floor. The side that needs it is the one behind NAT that the other side must reach first. A laptop that always initiates does not need it, because the whitepaper says roaming means [no requirement for NAT to keep sessions open for long](https://www.wireguard.com/papers/wireguard.pdf). A server with a public address does not need it for its own sake. A site that must accept connections from a public server, such as a home network behind NAT, does. One reply in a MikroTik thread said the setting [belongs on the client device, not on the router](https://forum.mikrotik.com/t/help-with-wireguard-setup-behind-nat/263748) acting as the server, and the thread recorded no confirmed fix.

PersistentKeepalive does not fix a first handshake that cannot get through. It sends traffic, and the failed handshake shows up immediately as a "retrying" line instead of waiting for the first user packet.

## How do you turn on WireGuard's debug log, and what does each line mean?

On Linux, with the kernel module, enable dynamic debug for it, as the [quickstart](https://www.wireguard.com/quickstart/) and [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8) both describe:

```bash
sudo modprobe wireguard
echo module wireguard +p | sudo tee /sys/kernel/debug/dynamic_debug/control
sudo dmesg --follow | grep wireguard
echo module wireguard -p | sudo tee /sys/kernel/debug/dynamic_debug/control
```

The [dynamic debug guide](https://docs.kernel.org/admin-guide/dynamic-debug-howto.html) says `/proc/dynamic_debug/control` exists when the kernel supports it, and that you may need to adjust the kernel loglevel or use ignore_loglevel to see output. The `-p` flag clears it again. [wg(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8) says that on OpenBSD and FreeBSD debugging output is turned on per interface with `ifconfig wg0 debug`, and that on userspace implementations it is customary to set the `LOG_LEVEL` environment variable to `verbose`.

Lines in the packet path go through [net_dbg_ratelimited](https://github.com/torvalds/linux/blob/master/include/linux/net.h), which checks the kernel's rate limiter, so a burst of failures can be thinned out. The timer lines do not use it. The lines below come from [send.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/send.c), [receive.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/receive.c), [socket.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/socket.c), [noise.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/noise.c) and [timers.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c):

| Line, after the `wireguard: wg0:` prefix | Meaning |
|---|---|
| `Sending handshake initiation to peer 1 (203.0.113.10:51820)` | An attempt left; sends are limited to one per 5 s |
| `Handshake for peer 1 (...) did not complete after 5 seconds, retrying (try 2)` | No valid response yet |
| `Handshake for peer 1 (...) did not complete after 20 attempts, giving up` | Retries exhausted; staged packets are purged |
| `No route to 203.0.113.10:51820, error ...` | Local routing failed; nothing was sent |
| `Receiving handshake initiation from peer 1 (...)` | Server accepted a valid initiation |
| `Sending handshake response to peer 1 (...)` | Server replied |
| `Receiving handshake response from peer 1 (...)` | Client got it; the handshake is done |
| `Invalid handshake response from 203.0.113.10:51820` | A reply arrived but did not authenticate, for example because the preshared keys differ |
| `Keypair 2 created for peer 1` | Session keys exist |
| `Receiving cookie response from ...` | The responder is [under load](https://www.wireguard.com/papers/wireguard.pdf) (section 5.3), not facing a key mismatch |
| `Retrying handshake with peer 1 (...) because we stopped hearing back after 15 seconds` | A session that had sent data went silent: Keepalive-Timeout plus Rekey-Timeout |
| `Zeroing out all keys for peer 1 (...), since we haven't received a new one in 540 seconds` | Reject-After-Time times three expired |

The last two rows match the [GL.iNet thread](https://forum.gl-inet.com/t/4-x-wireguard-rekey-timeout-troubleshooting/25814), whose server log showed the 15-second retry line, then the retry lines, then the same 540-second line.

A working order, cheapest check first:

1. Read the transfer counters on the client and the endpoint line on the server.
2. Capture UDP 51820 on the server while the client retries.
3. If nothing arrives, check the forward, the firewall and the WAN address for 100.64.0.0/10.
4. If packets arrive, enable debug logging on both hosts and match the lines to the tables above.
5. Compare `date -u` on both hosts, then Endpoint and ListenPort, then add PersistentKeepalive = 25 on the side behind NAT.

## Sources

- [WireGuard: Next Generation Kernel Network Tunnel (whitepaper)](https://www.wireguard.com/papers/wireguard.pdf)
- [WireGuard: Protocol and Cryptography](https://www.wireguard.com/protocol/)
- [WireGuard: Quickstart](https://www.wireguard.com/quickstart/)
- [WireGuard: wg(8) manual page](https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8)
- [WireGuard: wg-quick(8) manual page](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8)
- [WireGuard: wireguard-tools show.c](https://git.zx2c4.com/wireguard-tools/tree/src/show.c)
- [WireGuard: reresolve-dns README](https://git.zx2c4.com/wireguard-tools/tree/contrib/reresolve-dns/README)
- [WireGuard: reresolve-dns.sh](https://git.zx2c4.com/wireguard-tools/tree/contrib/reresolve-dns/reresolve-dns.sh)
- [WireGuard: wireguard-go device/timers.go](https://git.zx2c4.com/wireguard-go/tree/device/timers.go)
- [Linux kernel: wireguard timers.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/timers.c)
- [Linux kernel: wireguard messages.h](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/messages.h)
- [Linux kernel: wireguard send.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/send.c)
- [Linux kernel: wireguard receive.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/receive.c)
- [Linux kernel: wireguard socket.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/socket.c)
- [Linux kernel: wireguard noise.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/noise.c)
- [Linux kernel: wireguard cookie.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/cookie.c)
- [Linux kernel: wireguard device.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/device.c)
- [Linux kernel: wireguard peer.c](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/peer.c)
- [Linux kernel: wireguard Makefile](https://github.com/torvalds/linux/blob/master/drivers/net/wireguard/Makefile)
- [Linux kernel: include/linux/net.h](https://github.com/torvalds/linux/blob/master/include/linux/net.h)
- [Linux kernel: Dynamic debug how-to](https://docs.kernel.org/admin-guide/dynamic-debug-howto.html)
- [Linux kernel: IP sysctl](https://docs.kernel.org/networking/ip-sysctl.html)
- [Linux kernel: Netfilter conntrack sysctl](https://docs.kernel.org/networking/nf_conntrack-sysctl.html)
- [Linux man-pages: packet(7)](https://man7.org/linux/man-pages/man7/packet.7.html)
- [Linux man-pages: ip-route(8)](https://man7.org/linux/man-pages/man8/ip-route.8.html)
- [Netfilter: Hacking HOWTO, Netfilter Architecture](https://www.netfilter.org/documentation/HOWTO/netfilter-hacking-HOWTO-3.html)
- [tcpdump: manual page](https://www.tcpdump.org/manpages/tcpdump.1.html)
- [Wireshark: WireGuard dissector](https://wiki.wireshark.org/WireGuard)
- [Nmap: UDP scan](https://nmap.org/book/scan-methods-udp-scan.html)
- [Ubuntu manpages: ufw(8)](https://manpages.ubuntu.com/manpages/noble/man8/ufw.8.html)
- [firewalld: firewall-cmd manual](https://firewalld.org/documentation/man-pages/firewall-cmd.html)
- [IETF: RFC 1918, Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918)
- [IETF: RFC 6598, IANA-Reserved IPv4 Prefix for Shared Address Space](https://www.rfc-editor.org/rfc/rfc6598)
- [IETF: RFC 4787, NAT Behavioral Requirements for Unicast UDP](https://www.rfc-editor.org/rfc/rfc4787)
- [IETF: RFC 8085, UDP Usage Guidelines](https://www.rfc-editor.org/rfc/rfc8085)
- [WireGuard mailing list: Constant stream of handshake for peer did not complete](https://lists.zx2c4.com/pipermail/wireguard/2022-September/007821.html)
- [OPNsense forum: Handshake did not complete after 5 seconds, multi-WAN outgoing issue](https://forum.opnsense.org/index.php?topic=30540.0)
- [MikroTik forum: Help with WireGuard setup behind NAT](https://forum.mikrotik.com/t/help-with-wireguard-setup-behind-nat/263748)
- [GL.iNet forum: 4.x WireGuard REKEY-TIMEOUT troubleshooting](https://forum.gl-inet.com/t/4-x-wireguard-rekey-timeout-troubleshooting/25814)
- [FreeBSD forums: Wireguard connection not established due to clock out of sync](https://forums.freebsd.org/threads/wireguard-connection-not-established-due-to-clock-out-of-sync.84824/post-563707)
