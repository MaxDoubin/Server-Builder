
## Fewer tools, known deeply

There is a genre of article that lists forty command line utilities you should install. I have never found those useful, because the win is not in having many tools, it is in knowing a few of them well enough to reach for the right one without thinking.

This is my actual short list, with the specific reason each one displaced whatever I used before.

## The list, and what each one replaced

### ss instead of netstat

`netstat` is deprecated on most distributions and reads from a slower interface. `ss` does the same job, faster, with better filtering.

```bash
ss -tulpn                       # listening TCP and UDP sockets with processes
ss -tn state established        # current connections, numeric
ss -tn dst 10.0.5.0/24          # only to a given network
ss -ti                          # per socket TCP internals: rtt, cwnd, retransmits
```

That last one is underused. When someone says a transfer is slow, `ss -ti` shows round trip time, congestion window, and retransmit counts per socket. Retransmits climbing points at the network. A small window with no retransmits and low RTT points at the application.

### mtr instead of ping and traceroute

A traceroute is one sample per hop, which is exactly the wrong sample size for intermittent loss. `mtr` runs continuously and reports loss and latency per hop over time.

```bash
mtr -rwzbc 200 1.1.1.1
```

Report mode, wide output, both hostname and address, two hundred cycles. Run that for a few minutes when someone reports flaky connectivity and you get evidence instead of anecdote.

The interpretation trap is worth stating: loss shown at a middle hop with no loss at hops beyond it is not loss. It is a router deprioritizing responses to expiring packets, which is normal. Loss that starts at a hop and persists through every hop after it is real. That single rule prevents a lot of wrongly blamed transit providers.

### jq for anything that returns JSON

Every API, most modern CLI tools, and a lot of logs return JSON. Parsing it with grep and cut is how you get a script that breaks the first time a field order changes.

```bash
# What ports is each container publishing?
docker inspect $(docker ps -q) \
  | jq -r '.[] | "\(.Name) \(.NetworkSettings.Ports | keys | join(","))"'

# Filter structured logs by level and pull a few fields
journalctl -o json --since "1 hour ago" \
  | jq -r 'select(.PRIORITY <= "3") | "\(.__REALTIME_TIMESTAMP) \(.MESSAGE)"'
```

Two features carry most of the value: `select()` for filtering and string interpolation for output shaping. Learn those and the rest of the language can wait until you need it.

### ripgrep for searching a tree

`grep -r` works. `rg` is dramatically faster on a large tree, respects ignore files by default, and skips binaries without being told.

```bash
rg -n 'listen\s+\d+' /etc/nginx      # line numbers, regex
rg -t py 'def main'                  # only Python files
rg -l 'TODO' --stats                 # matching files plus a summary
rg -A3 -B3 'permission denied'       # context around each hit
```

The default of honoring ignore files is the real change in behavior. Searching a repository no longer returns three thousand hits from a dependency directory.

### tmux, mostly for one reason

Panes and windows are nice. Session persistence is the reason it is on every server I administer. Start work in a tmux session, lose your connection, reconnect, run `tmux attach`, and the long running job is still there. Doing a package upgrade or a filesystem operation over SSH without a persistent session is a bet on your network holding.

```bash
tmux new -s upgrade      # named session
# detach with ctrl-b then d
tmux ls
tmux attach -t upgrade
```

### tcpdump, even when Wireshark is available

Wireshark is the better analysis tool. `tcpdump` is the better capture tool, because it is already installed on the box where the problem is happening and it does not need a GUI.

```bash
tcpdump -ni eth0 -c 200 -w /tmp/cap.pcap 'host 10.0.5.20 and port 443'
tcpdump -ni eth0 'tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'
```

Capture to a file on the server, copy it to a workstation, open it in Wireshark. The second command shows SYNs without ACKs, which is what a connection attempt reaching nothing looks like, and it answers the question "is the traffic even arriving" in about four seconds.

### dig, and the one flag that matters

```bash
dig +trace example.com A
dig @9.9.9.9 example.com A +short
dig example.com MX +noall +answer
```

`+trace` walks delegation from the root and shows you which nameserver actually answers. That is the difference between "DNS is broken" and "this resolver has a stale cached record while the authoritative server is correct," and those two problems have entirely different fixes.

## The general principle

Every tool above replaced something I already had with something that answers a question faster or more honestly. That is the bar. Adding a utility because it looks nice in a screenshot means one more thing to remember and one more thing that is missing when you SSH into a machine you do not control.

Which is the other half of this: know the plain versions too. `grep`, `netstat`, and the built-in shell are on every box, including the locked down one you will eventually have to fix at an inconvenient time. Nice tools for your machines, portable knowledge for everyone else's.

## References

- [ss(8)](https://man7.org/linux/man-pages/man8/ss.8.html)
- [jq manual](https://jqlang.github.io/jq/manual/)
- [ripgrep](https://github.com/BurntSushi/ripgrep)
- [tmux](https://github.com/tmux/tmux/wiki)
- [tcpdump manual](https://www.tcpdump.org/manpages/tcpdump.1.html)
- [mtr](https://github.com/traviscross/mtr)
