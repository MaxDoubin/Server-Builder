
## The Problem

Most network documentation is either nonexistent or so outdated that it is worse than useless. Outdated documentation gives you false confidence. You think you know how the network is configured, but the documentation does not match reality, and you make decisions based on wrong information.

## What I Document

My documentation covers four categories:

**1. Topology diagrams.** Visual maps showing how devices connect, including interface names, IP addresses, and VLAN assignments. I update these whenever I add or remove equipment.

**2. IP address management (IPAM).** A spreadsheet listing every IP address assignment, what device it belongs to, and which VLAN it is on. This prevents duplicate IPs and makes it easy to find available addresses.

**3. Configuration backups.** Automated nightly backups of every network device configuration. Stored in git so I can see what changed and when.

**4. Runbooks.** Step-by-step procedures for common tasks: adding a new VLAN, configuring a switch port, troubleshooting a connectivity issue, failing over to a backup. Written so someone unfamiliar with the network could follow them.

## Tools

I use draw.io for topology diagrams because it is free, exports to multiple formats, and runs in a browser. For IPAM, a simple spreadsheet works for my scale. For configuration backups, I use Python scripts that pull configs via SSH and commit them to a git repository.

The git approach for configurations is powerful. When something breaks after a change, I can diff the current configuration against the last known good configuration and see exactly what changed.

## The Test

Good documentation passes the "2 AM test": if your network goes down at 2 AM and you are half asleep, can you find the information you need to diagnose and fix the problem? If the answer is no, your documentation needs work.

## Keeping It Current

The hardest part of documentation is keeping it updated. I make it a rule: no infrastructure change is complete until the documentation is updated. The change log, the diagram, the IPAM spreadsheet, everything gets updated as part of the change process, not after.
