
## What Is a PDU

A PDU (Power Distribution Unit) is essentially a rack-mountable power strip, but they range from simple to very sophisticated. At the basic level, a PDU takes input power and distributes it across multiple outlets for your servers. At the high end, a smart PDU monitors per-outlet power consumption, supports remote power cycling of individual outlets, and provides environmental monitoring.

## Types of PDUs

**Basic PDU:** A rack-mount power strip. Takes one input, provides multiple outputs. No monitoring, no management. Cheap and reliable.

**Metered PDU:** Adds a display showing total power draw. Useful for knowing how much power your rack is consuming, but no per-outlet visibility.

**Monitored PDU:** Shows per-outlet power consumption via a web interface or SNMP. This is where it gets useful for a serious lab because you can see exactly how much power each server draws.

**Switched PDU:** Everything a monitored PDU does, plus you can remotely power-cycle individual outlets. This is incredibly useful when a server hangs and iDRAC is not responding.

## What I Use

I run two APC metered PDUs in my rack, mounted vertically on opposite sides. Having two PDUs provides redundancy. Each server has dual power supplies, one connected to each PDU. If one PDU fails or needs to be serviced, every server continues running on the other power supply.

The metered display tells me total rack power consumption at a glance, which is useful for tracking power costs and ensuring I am not overloading the circuit.

## Outlet Types

In the US, most server PDUs use C13/C14 connectors for standard equipment and C19/C20 connectors for high-draw devices. Make sure you have enough of each type for your equipment. My R740s use C13 connections, while the UPS input uses a C19/C20.

## Voltage

Running servers on 208V or 240V instead of 120V improves power supply efficiency and reduces current draw per device. Many enterprise PDUs are designed for higher voltage inputs. If your electrical setup supports it, 208V or 240V is the better choice for a rack with multiple servers.

I currently run on 120V because that is what my circuit supports, but if I expand further, rewiring for 240V would be the smart move.
