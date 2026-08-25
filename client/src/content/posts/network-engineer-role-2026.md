
## What Has Changed

The network engineer of five years ago spent most of their time on physical infrastructure: racking switches, running cables, configuring VLANs, and troubleshooting Layer 2 problems. While all of that still exists, the center of gravity has shifted.

Today, a significant portion of enterprise networking happens in software. Cloud networking, overlay fabrics, SD-WAN, and software-defined controllers mean that network configuration is increasingly declarative, API-driven, and version-controlled.

Concretely, that means a set of interfaces that did not exist in most job descriptions a decade ago. NETCONF, standardized in RFC 6241, runs over SSH on TCP 830 and exchanges structured configuration with an explicit candidate-commit-rollback model instead of a terminal session. RESTCONF (RFC 8040) exposes the same data over HTTPS for anyone who would rather write against a REST API. Both are shaped by YANG data models, which is what makes "the interface description field" a typed, validated path rather than a position in a text file.

Telemetry moved too. SNMP polls on an interval and gives you whatever the device felt like counting. gNMI and the OpenConfig models push subscriptions: the device streams a value when it changes, at subsecond resolution, without you asking every sixty seconds. On a fabric with thousands of interfaces, that difference is not incremental.

The campus and data center designs changed underneath all of it. Large Layer 2 domains held together by spanning tree are giving way to routed access and EVPN-VXLAN fabrics, where the loop prevention is a routing protocol rather than a protocol whose job is to break links on purpose.

## What Has Not Changed

The fundamentals remain completely relevant. If you do not understand IP routing, BGP, spanning tree, and firewall policy design, you cannot be effective regardless of what tools are in use. The abstractions built on top of these fundamentals require understanding what is underneath to troubleshoot effectively.

Take BGP, which is now the control plane for the data center fabric, the WAN, the internet edge, and half the cloud interconnects you will ever build. The timers in RFC 4271 have not moved: the default Hold Time is 90 seconds and the keepalive interval is one third of that, 30 seconds. That means a session can be dead for a minute and a half before the protocol notices, which is why BFD exists and why anyone who tells you BGP converges instantly has not watched it fail.

The operational hazards have not moved either. RFC 7454 collects the practices that keep BGP from ruining your afternoon: filter what you accept, filter what you announce, and set maximum-prefix limits so a neighbor's mistake becomes their outage rather than yours. Origin validation with RPKI, specified in RFC 6811, is now normal rather than exotic, and it exists because "trust the AS path" was never a security model.

The physical layer did not go anywhere either. Somebody still has to know which fiber is which, that a bad optic can produce corrupt frames instead of a clean link failure, and that the answer to a mystery is sometimes a patch cable.

## Skills That Are Growing in Importance

**Automation:** Network engineers who can write Python and Ansible, use APIs, and work with version control systems are significantly more valuable than those who cannot. Config-as-code is becoming standard practice.

**Cloud networking:** AWS VPCs, Azure VNets, and GCP networking are now core skills for most enterprise network teams. Hybrid connectivity (Direct Connect, ExpressRoute, VPN) between on-premises and cloud is ubiquitous.

**Security integration:** The boundary between network engineering and network security has blurred. Network engineers are expected to understand and implement security controls, not just hand off to a separate security team.

## The Details People Get Wrong

Cloud networking looks like traditional networking with new names, which is exactly the trap. Three specifics account for a lot of wasted time.

AWS reserves five IP addresses in every subnet: the network address, the VPC router, the DNS address, one held for future use, and the broadcast address. A /28 therefore gives you 11 usable addresses, not 14, and the smallest subnet AWS permits is a /28. Size subnets on that arithmetic or watch an autoscaling group fail to launch.

A VPC's primary CIDR block cannot be changed after creation. You can attach additional CIDR blocks later, but you cannot resize the original, so the ten minutes you spend on addressing at the start is the cheapest ten minutes in the project.

VPC peering is not transitive. If A peers with B and B peers with C, A cannot reach C. People discover this after building a hub-and-spoke topology out of peerings and wondering why the spokes cannot talk. Transit Gateway exists for that, and it costs money per attachment and per gigabyte, which is a design input.

And the rule that applies everywhere: overlapping address space cannot be routed between. An on-premises 10.0.0.0/16 and a VPC 10.0.0.0/16 will never talk to each other properly no matter what you buy. Address planning is still the most valuable unglamorous skill in this job.

On the security side, NIST SP 800-207 is worth reading properly rather than absorbing through vendor slides. Its core assertion is that network location is not a trust signal, which has a specific consequence for network engineers: the perimeter firewall stops being the control and per-session, per-identity policy becomes the control. Segmentation still matters, but it is a blast-radius tool now, not an authentication mechanism.

## What Automation Cannot Fix

Automating a broken design does not fix it. It applies it faster, to more devices, at three in the morning.

The specific technical skill that separates a working automation practice from a dangerous one is idempotence. A playbook that appends a line to a config is not idempotent, and running it twice produces a device that does not match the model you think you have. A playbook that declares intent and converges toward it can run a hundred times safely. Config drift detection matters for the same reason: your repository is only the source of truth if something checks that reality agrees with it.

The failure mode of a junior engineer who learned automation before protocols is that they cannot tell when the tool is lying. The module reports `changed: true`, the device rejected the line, and the playbook is green. You need enough of the underlying protocol to look at the device and know what right looks like.

The 2026 version of this problem is generated configuration. A model will produce an ACL that is syntactically perfect, well commented, and wrong in an ordering-dependent way that only fails under a specific traffic pattern. Plausible and wrong is worse than obviously wrong, and it moves the valuable work toward verification: config analysis before deployment, lab validation, and tests that assert reachability rather than assert that a command was accepted.

## What I Am Focusing On

The combination of deep fundamentals with automation and cloud skills is the most valuable place to be. A network engineer who can troubleshoot a BGP route leak AND write an Ansible playbook to fix it AND understand how that routing decision propagates in a cloud environment is solving genuinely hard problems.

That combination is not common, which makes it worth investing in.

For me at this stage that means the boring order: protocols first, because they are the part that does not get deprecated. Then packet captures, because every abstraction eventually fails in a way that only the wire explains. Then automation on top, applied to a lab I actually run, because a playbook that has never touched real hardware has never been tested.

The thing I keep reminding myself is that the tooling turns over every few years and the fundamentals do not. A person who learned subnetting, TCP behavior, and routing loop prevention in 2010 can read a 2026 EVPN fabric. A person who only learned one vendor's CLI in 2010 cannot.

## References

- https://www.rfc-editor.org/rfc/rfc4271
- https://www.rfc-editor.org/rfc/rfc6241
- https://www.rfc-editor.org/rfc/rfc7454
- https://www.rfc-editor.org/rfc/rfc6811
- https://csrc.nist.gov/pubs/sp/800/207/final
- https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html
