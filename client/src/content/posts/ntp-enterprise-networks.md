
## Why Time Matters

Time synchronization is invisible when it works and catastrophic when it does not. Kerberos authentication (the backbone of Active Directory) fails if clocks are more than five minutes apart. TLS certificate validation uses timestamps. Log correlation across multiple systems is impossible if logs have different timestamps. [DNSSEC](/blog/dns-security-dnssec) and many security protocols depend on accurate time.

The five minute figure is not folklore, it is the default maximum clock skew configured in MIT Kerberos and in Active Directory, and it exists to bound replay attacks on authenticators. Cross it and users get "clock skew too great" rather than anything that hints at the real cause.

## How NTP Works

NTP (Network Time Protocol) synchronizes clocks using a hierarchy called stratum. Stratum 0 devices are atomic clocks or GPS receivers. Stratum 1 servers connect directly to Stratum 0 sources. Stratum 2 servers sync from Stratum 1, and so on.

NTP measures the round-trip delay to the time server and uses statistical algorithms to estimate clock offset and drift. It then adjusts the local clock gradually rather than jumping, which prevents the kind of time discontinuities that break applications.

The measurement itself is four timestamps in a 48 byte packet on UDP port 123. The client records when it sent the request (T1), the server records when it arrived (T2) and when it replied (T3), and the client records the arrival of the reply (T4). From those, round-trip delay is `(T4 - T1) - (T3 - T2)` and offset is `((T2 - T1) + (T3 - T4)) / 2`. The subtraction of the server's own processing time is why NTP tolerates a slow server, and the halving of the remainder is why it assumes the network is symmetric. That assumption is the protocol's main weakness: an asymmetric path, such as a congested uplink with an idle downlink, produces an offset error of roughly half the asymmetry, and no amount of averaging removes it.

Stratum is a 8-bit field with meaningful values 1 through 15. Stratum 16 means unsynchronised, and a server advertising 16 is telling you it does not know the time. If `chronyc tracking` reports stratum 16 on a machine you believe is working, that is the whole diagnosis right there.

## Deploying NTP in an Enterprise Network

The recommended pattern:
1. Two or three internal NTP servers sync from external Stratum 1/2 sources
2. All internal devices sync from the internal servers, not directly from the internet
3. The firewall only allows the internal NTP servers to reach external NTP

```bash
# /etc/chrony.conf on the internal NTP server
pool pool.ntp.org iburst
allow 192.168.0.0/16  # Allow clients in this range
```

Use `pool`, not `server`, for a pool hostname. This matters more than it looks. `server pool.ntp.org` resolves the name once and uses a single address, so you end up with exactly one upstream source and none of the redundancy the pool exists to provide. The `pool` directive resolves the name to multiple addresses and keeps a working set of them, replacing members that go unreachable.

How many upstream sources you need comes from the selection algorithm rather than taste. With one source you cannot detect that it is wrong. With two you learn they disagree but not which one to believe. Three lets a majority outvote a single falseticker, and four means you still have a majority after one source fails. RFC 8633, the NTP best current practices document, recommends at least four. Your internal servers should each have four or more upstreams even though your clients only need the two or three internal ones.

`iburst` sends a short burst of packets at startup instead of one per poll interval, which brings a fresh machine into sync in a few seconds rather than several minutes. There is no reason to omit it.

If you are pointing significant numbers of devices at the public pool, read its usage guidelines first. The pool is donated capacity, and vendors shipping products that hammer it are a recurring problem the project has had to deal with.

## Configuring Clients

```bash
# /etc/chrony.conf on a client
server 192.168.1.10 iburst prefer  # Internal NTP server 1
server 192.168.1.11 iburst          # Internal NTP server 2

makestep 1.0 3

# Check synchronization status
chronyc tracking
chronyc sources -v
```

`makestep 1.0 3` is the line most people leave out and then regret. By default chronyd corrects the clock by slewing, which adjusts the rate rather than jumping, and the maximum slew rate is bounded. Correcting a one hour error by slewing takes days. `makestep 1.0 3` says: for the first three updates after startup, if the offset exceeds one second, step the clock instead. That covers the cases that actually happen, which are a VM restored from a snapshot, a machine with a dead CMOS battery, and a device that booted before the network came up.

## Network Devices

Configure network switches and firewalls to use your internal NTP servers:

```
ntp server 192.168.1.10 prefer
ntp server 192.168.1.11
```

Remember that many embedded devices source their NTP queries from UDP port 123 rather than an ephemeral port. Stateful firewall rules written for a normal client/server pattern sometimes drop the replies, and the symptom is a switch that never leaves stratum 16 while a Linux host on the same VLAN syncs fine.

## Reading chronyc Output

`chronyc sources -v` prefixes each source with a state character, and knowing them turns a wall of numbers into an answer:

- `*` the source currently being used
- `+` an acceptable source being combined with the selected one
- `-` excluded by the combining algorithm
- `x` a falseticker, meaning its time disagrees with the majority
- `~` too variable to trust
- `?` unreachable

An `x` next to a source is the interesting one, because it means the sources are voting and this one lost. A row of `?` means the packets are not getting through at all, which is a firewall question, not a time question.

From `chronyc tracking`, the fields to alert on are **System time**, which is the current offset from the selected source, **Frequency**, the rate correction in parts per million being applied to the local oscillator, and **Leap status**, which should read Normal. A healthy LAN client sits in the tens of microseconds. A frequency of more than about 50 ppm suggests a genuinely poor oscillator or, more often, a virtual machine.

## What Goes Wrong

**The hypervisor and chrony fight over the clock.** VMware Tools, Hyper-V Integration Services, and the QEMU guest agent can all periodically set the guest clock from the host. Running that alongside chronyd produces an oscillating offset that never settles, because two controllers are correcting the same variable. Pick one. Inside a VM, disabling the hypervisor's periodic sync and letting chrony do the work is normally correct.

**A stratum 16 server that clients happily use.** Some devices will sync to a server regardless of what stratum it advertises, so a broken internal NTP server can propagate its own wrong idea of the time across a site. Monitor the internal servers' stratum and offset directly rather than assuming a reachable server is a correct one.

**Leap smear mixed with real leap seconds.** Several large public providers spread a leap second across roughly 24 hours instead of inserting it, and a smeared server and an unsmeared server disagree by up to half a second during the smear window. Mixing the two in one source list means the selection algorithm marks somebody a falseticker at exactly the moment you would rather it did not. Use all smeared or all unsmeared sources, never a blend. This is a shrinking problem, since the 27th CGPM resolved in 2022 to stop inserting leap seconds by 2035, but it is not gone yet.

**NTP as a DDoS amplifier.** The old `monlist` query returned up to 600 recent client addresses in response to one small packet, which made unpatched ntpd an amplifier with a gain in the hundreds and drove a wave of large attacks in 2013 and 2014. If you expose NTP at all, expose the time service only. chrony's `allow` directive grants time service and nothing else, while remote command access is a separate `cmdallow` that defaults to localhost, which is the right shape.

**No authentication.** Plain NTP has none in practice, so anyone who can intercept or spoof the traffic can move your clocks, and moving clocks defeats certificate expiry checks and Kerberos ticket lifetimes. Network Time Security, specified in RFC 8915, fixes this by establishing keys over TLS on port 4460 and then authenticating the NTP packets themselves. chrony supports it with a single keyword on the server line, and it is worth using for any source outside your own network.

## When NTP Is Not Enough

NTP over a LAN with chrony realistically holds tens of microseconds; over the internet, single digit milliseconds is a good result. That is ample for logs, Kerberos, and certificates.

It is not ample for everything. Financial trade timestamping regimes, telecom synchronisation, and industrial control can require sub-microsecond alignment, and getting there means PTP (IEEE 1588) with hardware timestamping in the NICs and switches, or a local GPS-disciplined clock. If someone hands you a requirement measured in microseconds, NTP over ordinary switches is not the tool, and no amount of tuning will make it one.

## Monitoring Time

Monitor your NTP infrastructure. A drifted clock that goes unnoticed can cause subtle, hard-to-diagnose failures. Track the offset and jitter of your internal NTP servers and alert if they fall out of acceptable ranges.

## References

- https://www.rfc-editor.org/rfc/rfc5905
- https://www.rfc-editor.org/rfc/rfc8633
- https://www.rfc-editor.org/rfc/rfc8915
- https://chrony-project.org/doc/4.6/chrony.conf.html
- https://man.archlinux.org/man/chronyc.1
- https://www.ntppool.org/en/use.html
