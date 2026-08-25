
## What Nmap Does

Nmap (Network Mapper) is a network scanning tool that discovers hosts, services, and vulnerabilities on a network. It is the standard tool for network reconnaissance in both legitimate security assessment and competitive cybersecurity.

The thing to internalize before you run a single scan is what Nmap actually gives you. It sends a probe, waits, and reports what came back. Every word in the output is an inference from that reply, or from the absence of one. "Filtered" usually means nothing answered at all, which could be a firewall, a dropped packet, or a host that is simply off. Nmap is very good at the measurement and completely agnostic about what the measurement means. That interpretation is your job.

The other thing to settle first is authorization. Scanning hosts you do not own or have written permission to test is, depending on where you live, a policy violation at best and a crime at worst. Scope in writing, then scan.

## Basic Scans

The simplest scan discovers which hosts are up on a network:

```bash
nmap -sn 10.0.20.0/24
```

This sends ICMP echo requests and ARP requests to every address in the subnet and reports which ones respond. It is fast and non-intrusive. I use it regularly to audit what devices are on each VLAN.

What Nmap actually sends depends on where you are and who you are. On a local Ethernet segment, running as root, Nmap uses ARP requests and nothing else, regardless of what other ping options you passed, because a host firewall cannot silently drop ARP and still function on the network. That is why an ARP-based `-sn` across a /24 finishes in a second or two and is close to ground truth. Off the local segment, the default probe set is the equivalent of `-PE -PS443 -PA80 -PP`: an ICMP echo request, a TCP SYN to port 443, a TCP ACK to port 80, and an ICMP timestamp request. Any one reply marks the host up.

The failure mode that catches everyone: run `-sn` against a remote subnet full of live Windows machines and get "0 hosts up." Windows Firewall drops inbound ICMP echo in the Public profile by default, and if 443 and 80 are also closed, nothing replies. The host is alive and you have concluded it is dead. The fix is `-Pn`, which skips discovery and treats every address as up. It is not free: Nmap then port-scans every address whether or not anything is there, and dead addresses are the slowest because Nmap retries each probe before giving up.

## Port Scanning

A port scan checks which TCP or UDP ports are open on a target:

```bash
nmap -sS -p- 10.0.20.5
```

The `-sS` flag does a SYN scan (half-open scan), which is faster and less likely to be logged than a full TCP connection. The `-p-` flag scans all 65,535 ports. Without it, Nmap only scans the top 1,000 ports by default.

Be precise about "less likely to be logged," because people repeat it as if `-sS` were invisible. The handshake never completes, so the application never sees it: sshd writes no log line, nginx writes no access entry. That is the whole benefit. Any stateful firewall or IDS spots a SYN scan immediately, because a burst of SYNs to hundreds of ports from one source with no completed sessions is about the most obvious pattern on a network.

Three of Nmap's six port states carry most of the information. **Open** means a SYN/ACK came back. **Closed** means an RST came back, which proves the host is up and reachable. **Filtered** means nothing came back after retries, or an ICMP unreachable arrived, which means a device in the path is dropping the probe. If your firewall rules are working, an unauthorized scan should produce filtered rather than closed, because a closed response confirms the host exists.

The default 1,000 ports are not a curated list of important ports. They come from frequency data in `nmap-services`, recording how often each port was found open in large-scale scanning. That is a good prior for the internet and a bad one for a CTF box or an internal application, both of which routinely park services on high ports. `-p-` covers 1 through 65535; port 0 is excluded unless you ask for `-p0-`.

Timing is worth understanding rather than cargo-culting. The default is `-T3`. `-T4` sets the initial round-trip timeout to 500 ms, caps the maximum at 1250 ms, drops max retries from 10 to 6, and caps the dynamic TCP scan delay at 10 ms. `-T5` cuts retries to 2 and imposes a 15 minute per-host timeout, so hosts can silently vanish from your results with nothing in the output saying so. That is the reason not to use `-T5` for work you plan to act on.

UDP deserves its own warning:

```bash
nmap -sU --top-ports 100 10.0.20.5
```

An open UDP port usually sends nothing back, so Nmap reports `open|filtered` and cannot resolve the ambiguity. Closed is inferred from an ICMP port unreachable, type 3 code 3. Linux rate-limits those replies to roughly one per second by default, so a full 65,536-port UDP scan against a single Linux host takes more than 18 hours, and no scanner-side tuning fixes that. Scan the top 100 or 200 UDP ports, accept that you are sampling, and add `-sV` so Nmap sends real protocol payloads to well-known ports instead of empty datagrams.

## Service Detection

Once you know which ports are open, service detection tells you what is actually running:

```bash
nmap -sV -p 22,80,443,3306 10.0.20.5
```

This connects to each open port and analyzes the response to determine the service name and version. It is incredibly useful for inventory and for finding outdated software versions.

Mechanically, `-sV` works off `nmap-service-probes`, a database of probe strings paired with regular expressions matched against the responses. Intensity runs 0 to 9 and defaults to 7; `--version-light` is intensity 2 and is much faster, `--version-all` is 9.

Three failure modes matter. `-sV` only runs against open ports, so it says nothing about filtered ones. Behind a reverse proxy you learn about the proxy: `-sV` on port 443 of a load balancer reports the load balancer, not the application servers behind it. And version strings lie, which is the mistake that produces bad scan reports. Debian, Ubuntu, and Red Hat backport security fixes without changing the advertised version, so an OpenSSH banner reading 8.2p1 on Ubuntu 20.04 may have every relevant CVE patched. Concluding "vulnerable" from a banner is how you hand someone a report full of findings that are not real.

`-sV` is also genuinely intrusive. It opens real connections and sends deliberately strange payloads to see how services react, and it has crashed printers, embedded management controllers, and old industrial equipment.

## OS Detection

Nmap can identify the operating system of a target by analyzing how it responds to specific network probes:

```bash
nmap -O 10.0.20.5
```

This is based on TCP/IP stack fingerprinting. Different operating systems implement TCP slightly differently, and Nmap maintains a database of these fingerprints.

Specifically, Nmap sends probes with unusual TCP option and flag combinations, then compares the responses against `nmap-os-db` on initial window size, TCP options ordering, IP ID generation, timestamp behavior, and ICMP reply quirks. It needs raw packet access, so it requires root.

The prerequisite people miss is that OS detection wants at least one open and one closed TCP port on the target for a confident result. With only open ports, or only filtered ones, the fingerprint is incomplete. `--osscan-limit` skips hosts that do not meet the condition rather than wasting probes.

Where it breaks down:

- Anything rewriting TCP options in transit, including firewalls doing normalization and most NAT devices, corrupts the fingerprint. You get "No exact OS matches" or a confident wrong answer.
- Containers share the host kernel, so every container on a Docker host fingerprints as the host's Linux kernel. OS detection cannot see containers at all.
- `--osscan-guess` prints near matches with a confidence percentage. Under roughly 90 percent is a hint, not a finding.

## In Competition

NCL and similar competitions often present scenarios where you need to discover services, identify versions, and find vulnerabilities. Knowing Nmap well means you can complete the reconnaissance phase quickly and move on to the actual challenge.

The most important habit is to always scan methodically. Do a host discovery first, then port scan the live hosts, then do service detection on open ports. Jumping straight to a full scan of everything wastes time and generates noise.

Under a clock, run two scans in parallel. Start a fast one for immediate answers:

```bash
nmap -Pn -n -T4 --top-ports 200 --open -oA quick 10.0.20.5
```

`-n` skips DNS resolution, often the slowest single component on a large range, and `--open` hides the noise. Then start `-p-` in a second terminal under a different `-oA` basename and work the quick results while it runs. Competition boxes hide services on high ports specifically to punish people who only scan the top 1,000.

`-oA` writes `.nmap`, `.xml`, and `.gnmap` at once, and rescanning to recover output you did not save costs more than the flag ever will. `--reason` is the other flag worth muscle memory: it prints the packet that decided each port state. Be careful with `-A`, which bundles `-O`, `-sV`, `-sC`, and `--traceroute`, four intrusive operations at once.

## What Nmap Will Not Tell You

Nmap is a discovery tool, not a vulnerability scanner. The NSE `vuln` category is a modest set of specific checks, not coverage. If the question is "which of my hosts are missing patches," the answer is authenticated scanning with Greenbone or Nessus, or reading your package manager's output. Nmap answers "what is listening," which is narrower. It also cannot resolve the ambiguity in `filtered`: a dropped probe and a powered-off host produce the same result. And it says nothing about whether a service is configured well. An open 443 with a modern TLS configuration and an unauthenticated admin panel behind it looks exactly like a hardened one.

## Lab Practice

I regularly scan my own lab environment to practice and to verify my security posture. If a port is open that should not be, I want to know about it. Nmap is the fastest way to validate that my firewall rules are working as intended.

The detail that makes this useful rather than decorative is scanning from the right place. Scanning my servers from the same VLAN tells me what the servers are running, and nothing about my firewall, because the traffic never crosses it. The scan that validates policy is the one launched from the guest VLAN, where the expected result is a wall of `filtered`. If I see `closed` instead, packets are reaching the host and my rule is a reject rather than a drop.

The second habit is diffing. `ndiff` compares two XML outputs and prints what changed, so a monthly scan saved with `-oX` answers the question that matters: what is listening this month that was not listening last month. A newly open port nobody opened on purpose is the highest-value alert a homelab can generate.

## References

- https://nmap.org/book/man.html
- https://nmap.org/book/synscan.html
- https://nmap.org/book/scan-methods-udp-scan.html
- https://nmap.org/book/osdetect.html
- https://nmap.org/book/performance-timing-templates.html
- https://nmap.org/book/legal-issues.html
