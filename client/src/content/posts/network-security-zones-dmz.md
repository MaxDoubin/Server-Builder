
## The Zone Model

A security zone is a group of systems with similar trust levels and security requirements. Traffic between zones is controlled by firewall policies. Traffic within a zone may or may not be inspected, depending on your requirements.

The classic zone model has three zones:
- **Inside (LAN):** Trusted internal network
- **Outside (WAN/Internet):** Untrusted external network
- **DMZ:** Semi-trusted zone for systems that must be accessible from outside

## Why Zones Matter

Without zones, a compromised internal host can reach any other internal system directly. Zones limit blast radius. If a web server in the DMZ is compromised, the attacker is stuck in the DMZ. They cannot reach your database servers on the internal network because the firewall blocks DMZ-to-LAN traffic.

## Designing a DMZ

The DMZ sits between the inside and outside zones. Systems in the DMZ need to be reachable from the internet (like web servers or email servers) but should not have access to internal systems.

Key firewall rules:
- **Outside to DMZ:** Allow specific inbound traffic (HTTP/443 to web servers, 25 to mail servers)
- **DMZ to Inside:** Deny by default. Allow specific exceptions only (like a web server querying a database on a dedicated database VLAN)
- **Inside to DMZ:** Allow for administration, deny for general browsing
- **Inside to Outside:** Allow with inspection

## Beyond the Basic DMZ

More mature environments add additional zones:
- **Server VLAN:** Isolated from user workstations but trusted more than the DMZ
- **Management VLAN:** For out-of-band device management (iDRAC, switch management)
- **Guest WiFi:** Fully isolated from everything internal
- **IoT:** Isolated from trusted systems

Each additional zone adds security but also adds management complexity. Start with the basics and add complexity only when you have a clear reason for it.
