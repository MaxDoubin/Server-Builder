
## What Nmap Does

Nmap (Network Mapper) is a network scanning tool that discovers hosts, services, and vulnerabilities on a network. It is the standard tool for network reconnaissance in both legitimate security assessment and competitive cybersecurity.

## Basic Scans

The simplest scan discovers which hosts are up on a network:

```bash
nmap -sn 10.0.20.0/24
```

This sends ICMP echo requests and ARP requests to every address in the subnet and reports which ones respond. It is fast and non-intrusive. I use it regularly to audit what devices are on each VLAN.

## Port Scanning

A port scan checks which TCP or UDP ports are open on a target:

```bash
nmap -sS -p- 10.0.20.5
```

The `-sS` flag does a SYN scan (half-open scan), which is faster and less likely to be logged than a full TCP connection. The `-p-` flag scans all 65,535 ports. Without it, Nmap only scans the top 1,000 ports by default.

## Service Detection

Once you know which ports are open, service detection tells you what is actually running:

```bash
nmap -sV -p 22,80,443,3306 10.0.20.5
```

This connects to each open port and analyzes the response to determine the service name and version. It is incredibly useful for inventory and for finding outdated software versions.

## OS Detection

Nmap can identify the operating system of a target by analyzing how it responds to specific network probes:

```bash
nmap -O 10.0.20.5
```

This is based on TCP/IP stack fingerprinting. Different operating systems implement TCP slightly differently, and Nmap maintains a database of these fingerprints.

## In Competition

NCL and similar competitions often present scenarios where you need to discover services, identify versions, and find vulnerabilities. Knowing Nmap well means you can complete the reconnaissance phase quickly and move on to the actual challenge.

The most important habit is to always scan methodically. Do a host discovery first, then port scan the live hosts, then do service detection on open ports. Jumping straight to a full scan of everything wastes time and generates noise.

## Lab Practice

I regularly scan my own lab environment to practice and to verify my security posture. If a port is open that should not be, I want to know about it. Nmap is the fastest way to validate that my firewall rules are working as intended.
