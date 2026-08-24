
## Why Learn the CLI

The FortiGate GUI is well designed and handles most tasks fine. But when you are troubleshooting a production issue under pressure, the CLI is faster, more precise, and more scriptable. It also gives you access to diagnostic tools and detailed output that the GUI does not expose.

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

## Packet Capture

FortiGate has a built-in packet sniffer that is invaluable for troubleshooting:

```bash
# Capture traffic on port1 matching a host
diagnose sniffer packet port1 "host 192.168.1.100" 4 0 l

# The parameters: interface, filter, verbosity (4 = full packet), count (0 = unlimited), timestamp format
```

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

## HA Status

```bash
# Check HA cluster status
diagnose sys ha status

# Show which unit is primary
get system ha status
```

## Tips

Always run `diagnose debug disable` and `diagnose debug reset` when you are done debugging. Leaving debug enabled affects performance. And document any changes you make in the CLI, because the GUI does not always show CLI-only configurations clearly.
