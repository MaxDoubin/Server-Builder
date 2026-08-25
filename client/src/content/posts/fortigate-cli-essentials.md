
## Why Learn the CLI

The FortiGate GUI is well designed and handles most tasks fine. But when you are troubleshooting a production issue under pressure, the CLI is faster, more precise, and more scriptable. It also gives you access to diagnostic tools and detailed output that the GUI does not expose.

Before anything else, learn the difference between the three command families, because mixing them up is the source of most beginner confusion. `get` displays current operational state including defaults and live values. `show` displays only configuration that differs from the factory default, which is why `show firewall policy` on a fresh unit prints almost nothing. `diagnose` reaches into the running system for debugging, and `execute` performs an immediate action that cannot be undone. `execute factoryreset` does not ask twice.

When `show` output looks suspiciously short, run `show full-configuration` for the same object. That prints every setting including defaults, and it is how you find the one option somebody changed three years ago.

## Essential Show Commands

```bash
# Show interface status and IP assignments
get system interface

# Show routing table
get router info routing-table all

# Show firewall policies
show firewall policy

# Show active sessions
diagnose sys session list

# Show BGP neighbors and state
get router info bgp summary

# Show hardware and version info
get system status
```

Two of those need a warning attached.

`diagnose sys session list` with no filter dumps the entire session table to your terminal. On a busy firewall that is hundreds of thousands of entries, and the output will run for many minutes while your SSH session is effectively unusable. Always set a filter first:

```bash
diagnose sys session filter clear
diagnose sys session filter dst 192.168.1.100
diagnose sys session filter dport 443
diagnose sys session list
```

The same filter applies to `diagnose sys session clear`, and that is the dangerous one. Run `diagnose sys session clear` without a filter and you flush every session on the firewall, dropping every established connection through it. That is a self-inflicted outage in one command with no confirmation prompt. Type the filter, run `diagnose sys session stat` to confirm the match count looks sane, then clear.

For `get router info bgp summary`, the column you care about is `State/PfxRcd`. A peer that is working shows a number, which is the count of prefixes received. Anything else, `Idle`, `Active`, `Connect`, `OpenSent`, is a peer that is not up, and `Active` in particular means the local side is trying and failing to establish TCP 179, not that everything is fine. RFC 4271 defines the state machine those names come from.

There is also a distinction worth knowing between `get router info routing-table all`, which shows the RIB (what the routing protocols decided), and `get router info kernel`, which shows the FIB (what is actually programmed into the forwarding path). When traffic goes somewhere the routing table says it should not, compare the two.

## Packet Capture

FortiGate has a built-in packet sniffer that is invaluable for troubleshooting:

```bash
# Capture traffic on port1 matching a host
diagnose sniffer packet port1 "host 192.168.1.100" 4 0 l

# The parameters: interface, filter, verbosity, count (0 = unlimited), timestamp format
```

The verbosity levels documented by Fortinet are:

- `1` prints the packet header only
- `2` prints the header and the data from the IP layer
- `3` prints the header and the data from the Ethernet layer
- `4` prints the header of packets with the interface name

Levels `5` and `6` are the interface-name variants of `2` and `3`. So `4` is not a full packet capture, which is a common misreading. If you need the actual payload bytes, use `3` or `6`; if you only need to know which interface a packet arrived on and left through, `4` is exactly right and much easier to read.

The timestamp argument takes `a` for absolute UTC, `l` for absolute local time, and anything else gives you time relative to the start of the capture. Use `l` when you need to correlate the capture against a log entry.

The filter is standard BPF syntax, the same language `tcpdump` uses, so `host`, `net`, `port`, `and`, `or`, and `not` all work as expected. `diagnose sniffer packet any "host 10.0.0.5" 4 0 l` captures across all interfaces, which is the fastest way to see whether a packet reached the firewall at all.

Now the failure mode that wastes the most time: on models with NP6 or NP7 network processors, established sessions are offloaded to hardware and never touch the CPU. The sniffer runs on the CPU. So you will see the first few packets of a session and then nothing, and conclude that traffic stopped when it is actually flowing fine at line rate. If a capture goes quiet on a session you know is active, disable offload for the test with `set auto-asic-offload disable` on the relevant firewall policy, or accept that you are only going to see session setup.

## Debug Flow

The debug flow tool shows you exactly what the FortiGate does with each packet through the policy engine:

```bash
diagnose debug reset
diagnose debug flow filter addr 192.168.1.100
diagnose debug flow show console enable
diagnose debug enable
diagnose debug flow trace start 10
```

This output tells you which policy matches the traffic, whether NAT is applied, and whether the packet is allowed or dropped. It is the fastest way to diagnose connectivity problems.

Read the output for a small number of specific lines. `allocate a new session` means this is the first packet of a new session and you are about to see the full decision path. `find a route` tells you the egress interface and gateway that were chosen; if that is the wrong interface, your problem is routing, not policy. `Allowed by Policy-N` names the policy ID that matched, and `Denied by forward policy check` means nothing matched and the implicit deny caught it. `reverse path check fail, drop` is the FortiGate's RPF check rejecting a packet that arrived on an interface the routing table would not use to reach that source, which is the classic symptom of asymmetric routing.

Debug flow has the same offload blind spot as the sniffer, and one more limitation on top: it traces packets that create or modify a session. Packets on an already-established session take the fast path and produce no output. So if you start the debug after the user reproduced the problem, you will see nothing. Start the debug, then have them retry.

`diagnose debug flow trace start 10` limits the trace to ten packets, which is almost always what you want. Without a count on a busy interface the console fills faster than you can read it. Add `diagnose debug console timestamp enable` when you need to line the trace up against a session table or a log.

## HA Status

```bash
# Check HA cluster status
diagnose sys ha status

# Show which unit is primary
get system ha status
```

When two units refuse to form a cluster, the checks in order are: identical hardware model, identical firmware build (not just version, the build number), matching group name and group ID, and heartbeat interfaces that are actually connected. FGCP heartbeat traffic uses its own Ethernet types (0x8890, 0x8891, 0x8893) rather than IP, so it will not traverse a router and any switch doing aggressive filtering can silently break it.

When the cluster is formed but behaving oddly, `diagnose sys ha checksum show` is the tool. It prints a checksum of the configuration on each member; if they differ, the units are out of sync and the secondary is running a configuration you did not intend. Forcing a resync is `execute ha synchronize start` on the secondary.

## Tips

Always run `diagnose debug disable` and `diagnose debug reset` when you are done debugging. Leaving debug enabled affects performance. And document any changes you make in the CLI, because the GUI does not always show CLI-only configurations clearly.

Two more habits worth building. First, run `execute backup config tftp <filename> <server-ip>` before any risky change. FortiOS has no equivalent of the IOS `reload in 5` safety net, so if you lock yourself out of a remote firewall your only recovery is a console cable or somebody on site. Local revisions via `execute revision list config` help, but only if the unit is still reachable.

Second, if the CLI is producing `command parse error` on a command you know exists, check your scope. On a unit with VDOMs enabled, most `config system` settings live in the global scope and firewall objects live inside each VDOM. `config global` and `config vdom` then `edit <name>` move you between them, and the same command is genuinely invalid in the wrong place.

Two operational numbers worth remembering: `get system performance status` reports CPU and memory alongside a 1, 10, 30, and 60 minute average, and the memory figure is what drives conserve mode. When memory use crosses the red threshold (88 percent by default) the FortiGate enters conserve mode and stops accepting new sessions that require proxy-based inspection. Users experience that as "some websites do not load" while ping and the firewall itself look completely healthy.

## References

- https://docs.fortinet.com/document/fortigate/7.0.2/administration-guide/680228/performing-a-sniffer-trace-cli-and-packet-capture
- https://docs.fortinet.com/document/fortigate/7.6.6/administration-guide/54688/debugging-the-packet-flow
- https://docs.fortinet.com/document/fortigate/7.4.0/cli-reference
- https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/63913/check-ha-synchronization-status
- https://www.tcpdump.org/manpages/pcap-filter.7.html
- https://www.rfc-editor.org/rfc/rfc4271
