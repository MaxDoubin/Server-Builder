
## The Problem

Most network documentation is either nonexistent or so outdated that it is worse than useless. Outdated documentation gives you false confidence. You think you know how the network is configured, but the documentation does not match reality, and you make decisions based on wrong information.

There is a cheap way to find out which one you have. Pick five specific facts out of your documentation at random, an IP address, a VLAN assignment, a port number, a firmware version, a cable run, and go verify each one against the live device. If more than one is wrong, nobody should be trusting any of it, including you. Run that audit once a quarter. It takes twenty minutes and it is the only honest measure of whether the rest of this effort is working.

## What I Document

My documentation covers four categories:

**1. Topology diagrams.** Visual maps showing how devices connect, including interface names, IP addresses, and VLAN assignments. I update these whenever I add or remove equipment.

**2. IP address management (IPAM).** A spreadsheet listing every IP address assignment, what device it belongs to, and which VLAN it is on. This prevents duplicate IPs and makes it easy to find available addresses.

**3. Configuration backups.** Automated nightly backups of every network device configuration. Stored in git so I can see what changed and when.

**4. Runbooks.** Step-by-step procedures for common tasks: adding a new VLAN, configuring a switch port, troubleshooting a connectivity issue, failing over to a backup. Written so someone unfamiliar with the network could follow them.

### Diagrams: draw three, not one

The mistake almost everyone makes is trying to put physical cabling, [VLANs](/blog/vlan-segmentation-guide), and IP subnets on a single canvas. By the time you have twelve devices it is unreadable and you stop updating it. Split it by layer:

- **Layer 1** shows what is physically plugged into what, including patch panel port numbers and cable IDs. This is the diagram you need when a link is down.
- **Layer 2** shows VLANs, trunk links, which VLANs are allowed on each trunk, and where the [spanning tree](/blog/spanning-tree-protocol-deep-dive) root is. This is the diagram you need when a loop takes out a segment.
- **Layer 3** shows subnets, gateway addresses, and routing between them. This is the diagram you need when two hosts cannot reach each other.

On every diagram, label **both ends of every link with the actual interface name**. "Core switch to access switch" tells you nothing at 2 AM. "Core Gi1/0/47 to Access-2 Gi1/0/48" tells you exactly which port to check and which cable to reseat. If you take one thing from this post, take that.

You can also stop the layer 1 and layer 2 diagrams from drifting by generating them instead of drawing them. Every managed switch worth owning speaks LLDP, so `lldpcli show neighbors` on a Linux host or the equivalent `show lldp neighbors detail` on a switch gives you the real adjacency table, port by port, straight from the devices. A diagram derived from LLDP output cannot be out of date, because it is a report rather than a drawing.

### IPAM: document the convention, not just the entries

A spreadsheet is fine up to a few hundred addresses. What it cannot do is validate anything: nothing stops you typing the same address twice, nothing records who changed a row or when, and it lives on one machine. NetBox or phpIPAM add uniqueness constraints, change history, and an API you can query from scripts, which is the point at which your documentation can start driving your automation rather than trailing behind it.

Whichever you use, write down the **allocation convention** at the top, because that is the part people forget and it is the part that prevents collisions:

```
10.0.X.1        gateway (FortiGate VLAN interface)
10.0.X.2-.9     network infrastructure (switches, APs, PDUs)
10.0.X.10-.99   static server assignments
10.0.X.100-.199 DHCP pool
10.0.X.200-.254 reserved / future
```

Two address-space traps are worth calling out. First, RFC 1918 gives you 10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16, and you should stay well away from 192.168.0.0/24 and 192.168.1.0/24 because every consumer router on earth defaults to one of them. The day you VPN into your lab from a hotel and both ends are 192.168.1.0/24, routing collapses and there is no fix from the road. Second, 100.64.0.0/10 is carrier-grade NAT space and 169.254.0.0/16 is link-local; neither is yours to allocate, and RFC 6890 is the registry that lists every such reserved block.

### Config backups: back up the right thing, and scrub it

RANCID and Oxidized are the two standard tools for this. Both log into devices on a schedule, pull the running configuration, and commit it to version control, which gives you `git diff` between any two nights for free. That is genuinely the most valuable thing in this whole list: when something breaks after a change, the diff tells you exactly what changed instead of you trying to remember.

Three failure modes to design around:

**Plaintext secrets in the repo.** Device configs contain SNMP community strings, RADIUS and TACACS shared keys, VPN pre-shared keys, and local password hashes. A repository of network configs is a complete map of how to get into your network. Keep it private, and understand that adding a `.gitignore` later does nothing: once a secret is committed it lives in the history forever and must be treated as compromised. Scrub the secrets on the way in, or encrypt the repo with something like git-crypt or SOPS.

**Diff noise.** Many devices include a timestamp, an uptime counter, or a certificate serial in their configuration output, so you get a diff every single night whether or not anything changed. If every backup produces a diff, you will stop reading them within a week. Filter those lines out at collection time.

**Backups you have never restored.** A configuration file is not a backup until you have proven you can push it onto a replacement device and get a working switch. Do that once, on purpose, on a spare, and write down how long it took.

### Runbooks: every one needs a rollback

A runbook that only describes the forward path is a one-way door. Each procedure should have the exact commands to run, the output you expect to see if it worked, and the specific steps to undo it. Include the "how do I know it worked" line, because that is what turns a procedure into something a stressed person can follow.

## Tools

I use draw.io for topology diagrams because it is free, exports to multiple formats, and runs in a browser. For IPAM, a simple spreadsheet works for my scale. For configuration backups, I use Python scripts that pull configs via SSH and commit them to a git repository.

The git approach for configurations is powerful. When something breaks after a change, I can diff the current configuration against the last known good configuration and see exactly what changed.

Store the draw.io files as `.drawio` XML in the same git repository as the configs rather than exporting a PNG and losing the source. The XML diffs badly but it version-controls fine, and it means the diagram and the configuration it describes move together.

## The Test

Good documentation passes the "2 AM test": if your network goes down at 2 AM and you are half asleep, can you find the information you need to diagnose and fix the problem? If the answer is no, your documentation needs work.

The version of this test that catches most people is not "can I find it" but "can I reach it." If the wiki is a VM on the cluster that just died, if the IPAM spreadsheet is on a NAS behind the switch you are trying to fix, or if the credentials are in a password manager that syncs over the VPN that is currently down, then during an outage your documentation does not exist. Keep an offline copy of the minimum set: a printed or PDF rack sheet, a local git clone on your laptop, and the out-of-band access details. Those out-of-band details are their own category worth writing down explicitly: iDRAC and [IPMI](/blog/ipmi-remote-management) addresses, console server ports, the serial console baud rate, and the local break-glass account on each device.

## Keeping It Current

The hardest part of documentation is keeping it updated. I make it a rule: no infrastructure change is complete until the documentation is updated. The change log, the diagram, the IPAM spreadsheet, everything gets updated as part of the change process, not after.

This is the same idea NIST formalizes in SP 800-128 as configuration management: you maintain an approved baseline, every change goes through a defined process, and the baseline is updated as part of that process rather than reconstructed afterward. The reason it is written down as a standard is that "I will document it later" fails universally, in every organization, at every scale. The only version that works is making the documentation update part of the change itself, so that skipping it means the change is not finished.

## References

- https://csrc.nist.gov/pubs/sp/800/128/upd1/final
- https://www.rfc-editor.org/rfc/rfc1918
- https://www.rfc-editor.org/rfc/rfc6890
- https://netboxlabs.com/docs/netbox/
- https://www.shrubbery.net/rancid/
- https://git-scm.com/docs/git-diff
