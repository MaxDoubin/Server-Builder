
## The Principle of Least Privilege

Every firewall policy should allow exactly what is needed and nothing more. This is the principle of least privilege applied to network traffic. The default posture should be deny-all, with explicit allow rules for each legitimate traffic flow.

In practice, this means starting with a policy that blocks everything, then adding rules one at a time as you identify what needs to be allowed. It is more work upfront, but it is dramatically more secure than starting with allow-all and trying to block bad traffic.

## My Methodology

Before writing any policies, I map out every traffic flow I need to support:

1. What source zone needs to reach what destination zone?
2. What protocol and port does the traffic use?
3. Is the traffic bidirectional or one-way?
4. Does it need deep packet inspection?

I document each flow in a table, then translate each row into a firewall policy.

## Zone-Based Design

I organize my firewall policies by zone. Each VLAN maps to a zone, and policies control traffic between zones. This is cleaner than per-interface policies because it abstracts the physical topology.

Example zones in my FortiGate:
- Management
- Servers
- Users
- IoT
- Guest
- Internet

## Policy Order

FortiGate (and most firewalls) evaluates policies top to bottom and applies the first match. This means specific rules must come before general rules. A common mistake is putting a broad allow rule above a specific deny rule, which effectively makes the deny rule useless.

I organize my policies in groups: inter-zone allow rules first, then zone-to-internet rules, then the implicit deny-all at the bottom.

## Logging

Every policy should log traffic, at minimum for session start. Logging lets you verify that policies are working as intended and provides forensic data for security investigations. I enable full logging on security policies and session-start logging on routine traffic policies.

## Regular Review

Firewall policies are not set-and-forget. I review my policies monthly to remove stale rules, tighten overly broad rules, and verify that the policy set matches the current network design. This discipline prevents policy bloat, where rules accumulate over time and nobody knows what half of them do.
