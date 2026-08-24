
## Defense in Depth

No single control is sufficient. A network designed for security has multiple independent layers. If an attacker bypasses the perimeter firewall, they still face internal segmentation. If they compromise a server, they cannot reach other segments without traversing another control point.

Defense in depth means assuming any individual control will fail and designing so that failure does not cascade.

## Least Privilege Network Access

Every device and every user should only have network access to what they need. A printer should not be able to reach your domain controllers. A guest WiFi network should not be able to reach anything internal. A database server should only accept connections from the application servers that query it.

Enforce this with firewall rules, ACLs, and VLAN segmentation. Document what should be allowed and deny everything else by default.

## Separate Management Plane

Network device management (SSH, HTTPS, SNMP) should never ride on the same network as production traffic. Create a dedicated management VLAN or network. Only devices with a specific need to manage infrastructure can reach the management plane.

This means that even if an attacker compromises a server, they cannot reach your router's management interface because it is on a physically or logically separate network.

## Assume Breach

Design the network assuming an attacker will eventually get in. The question is not whether the perimeter will be breached, but what they can do once inside. Micro-segmentation, zero-trust access controls, and comprehensive logging all limit the damage from a successful intrusion.

## Visibility by Default

You cannot defend what you cannot see. Every network should have:
- Centralized logging from all devices
- Flow data (NetFlow, sFlow, or IPFIX) for traffic analysis
- DNS query logging
- Authentication event logging

Security without visibility is guesswork. Build observability into the network from day one.
