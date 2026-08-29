
## What Is a PDU

A PDU (Power Distribution Unit) is essentially a rack-mountable power strip, but they range from simple to very sophisticated. At the basic level, a PDU takes input power and distributes it across multiple outlets for your servers. At the high end, a smart PDU monitors per-outlet power consumption, supports remote power cycling of individual outlets, and provides environmental monitoring.

Two form factors matter when you go shopping. A 1U or 2U horizontal PDU bolts into the rack rails and consumes rack units you would rather give to servers. A 0U vertical PDU mounts in the rear channel using toolless buttons and consumes no rack units, but it needs a rack deep enough to accept it without fouling the server rails or the rear cable path. Measure before you order.

## Types of PDUs

**Basic PDU:** A rack-mount power strip. Takes one input, provides multiple outputs. No monitoring, no management. Cheap and reliable.

**Metered PDU:** Adds a display showing total power draw. Useful for knowing how much power your rack is consuming, but no per-outlet visibility.

**Monitored PDU:** Shows per-outlet power consumption via a web interface or SNMP. This is where it gets useful for a serious lab because you can see exactly how much power each server draws.

**Switched PDU:** Everything a monitored PDU does, plus you can remotely power-cycle individual outlets. This is incredibly useful when a server hangs and iDRAC is not responding.

Two honest caveats. Check the metering accuracy spec, not just the presence of a display: inexpensive metered units are often only good to within a few percent, which is fine for "am I near the limit" and useless for attributing watts to individual workloads. And a switched outlet is a hard power cut. It does not flush write caches or unmount filesystems, so cutting power mid-write is how you find out whether your filesystem journaling actually works. Try a graceful shutdown through [IPMI](/blog/ipmi-remote-management) or iDRAC first. Many switched PDUs also enforce a minimum off-time of several seconds during a reboot cycle, because the PSU's bulk capacitors need to discharge before the board will cold-start. If your one-second power blip does not bring the server back, that is why.

## Sizing: The 80 Percent Rule

This is the number that governs everything else. The National Electrical Code (NFPA 70) requires a branch circuit supplying a continuous load, defined as one running for three hours or more, to be rated at 125 percent of that load. Servers are the textbook continuous load. Turning that around, you may load a circuit to no more than 80 percent of its rating.

That produces a small table worth memorizing:

| Circuit | Nameplate | Continuous limit (80%) |
| --- | --- | --- |
| 15 A at 120 V | 1800 VA | 1440 VA |
| 20 A at 120 V | 2400 VA | 1920 VA |
| 20 A at 208 V | 4160 VA | 3328 VA |
| 30 A at 208 V | 6240 VA | 4992 VA |

A PowerEdge R740 with a moderate VM load draws somewhere around 250 to 350 W in practice, well under its 750 W supply rating. At 300 W each, a single 20 A 120 V circuit holds about six of them before you hit 1920 VA. The same circuit at 208 V holds eleven. That is the entire argument for higher voltage in one sentence.

Nameplate ratings on the PSU are not the number to plan with. A 750 W supply is a ceiling, not a consumption figure, and sizing your circuits off nameplate will have you buying capacity you never use. Measure with the PDU you already have, or with a plug-in meter, and plan off measured draw plus headroom.

The other constraint is inrush. Server power supplies pull a surge several times steady-state current for a few milliseconds at power-on, so eight servers coming up simultaneously after a utility outage can trip a breaker that carries them without complaint at steady state. Breakers have a fast magnetic trip in addition to the slow thermal one: IEC curve classes B, C, and D trip instantaneously at roughly 3 to 5, 5 to 10, and 10 to 20 times rated current. Switched PDUs solve this with a configurable per-outlet power-on delay. Two or three seconds between outlets and the problem disappears.

## What I Use

I run two APC metered PDUs in my rack, mounted vertically on opposite sides. Having two PDUs provides redundancy. Each server has dual power supplies, one connected to each PDU. If one PDU fails or needs to be serviced, every server continues running on the other power supply.

The metered display tells me total rack power consumption at a glance, which is useful for tracking power costs and ensuring I am not overloading the circuit.

## Redundancy Costs Half Your Capacity

Here is the part people get wrong, and it defeats the entire purpose of an A/B design: each feed must be able to carry the whole rack by itself. When feed A dies, every dual-PSU server instantly pulls its full draw from feed B. If both feeds were sitting comfortably at 70 percent, feed B is now at 140 percent and trips, converting a single PDU failure into a total rack outage. The redundant design has made things worse than one feed would have.

So the real budget is 50 percent of each feed's continuous limit. On two 20 A 120 V circuits, that is 960 VA of normal load per side, 1920 VA total for the rack, not the 3840 VA the two circuits look like they offer.

Also confirm the two feeds are on different breakers. Two PDUs plugged into the same circuit protect you against a PDU failure and nothing else.

## Outlet Types

In the US, most server PDUs use C13/C14 connectors for standard equipment and C19/C20 connectors for high-draw devices. Make sure you have enough of each type for your equipment. My R740s use C13 connections, while the UPS input uses a C19/C20.

The ratings behind those part numbers, all from IEC 60320: C13/C14 is rated 10 A at 250 V under IEC, and 15 A under the North American UL variant. C19/C20 is rated 16 A IEC, 20 A UL. That is the reason high-draw gear uses C19: a single C13 cord physically cannot carry the current a loaded 2U server or a large UPS needs.

The connector detail that catches people is C15 and C16. A C15 is the high-temperature version of a C13, rated to 120 C instead of 70 C, and it carries a notch. A C15 plug fits a C14 inlet, so it works everywhere a C13 works, but a C13 plug does not fit a C16 inlet because the ridge on the C16 blocks it. If equipment came with an oddly-notched cord, that is why, and a generic C13 will not substitute.

On the input side you are dealing with NEMA, not IEC. A 15 A 120 V circuit terminates in a 5-15R, a 20 A one in a 5-20R with the sideways T-slot, and 30 A circuits are almost always twist-lock (L5-30 at 120 V, L6-30 at 240 V). A 5-20P plug does not fit a 5-15R outlet, deliberately. If you buy a PDU with an L6-30P on the end and your wall has a 5-20R, you are calling an electrician, so check the input plug first.

## Voltage

Running servers on 208V or 240V instead of 120V improves power supply efficiency and reduces current draw per device. Many enterprise PDUs are designed for higher voltage inputs. If your electrical setup supports it, 208V or 240V is the better choice for a rack with multiple servers.

I currently run on 120V because that is what my circuit supports, but if I expand further, rewiring for 240V would be the smart move.

The mechanism is worth understanding rather than taking on faith. Power is volts times amps, so a 750 W load draws 6.25 A at 120 V and 3.6 A at 208 V. Resistive losses scale with the square of current, so cutting current by 42 percent cuts those losses by about 66 percent. The 80 PLUS program encodes this directly: the same tier has higher efficiency thresholds in the 230 V internal redundant category than in the 115 V one. For reference, 115 V Gold requires 87 percent at 20 percent load, 90 percent at 50 percent, and 87 percent at 100 percent; Titanium requires 90, 92, 94, and 90 percent at 10, 20, 50, and 100 percent load.

Two consequences follow. Efficiency peaks around half load, so a 1100 W supply carrying a 200 W server runs at 18 percent load and is measurably less efficient than a 495 W supply doing the same job; oversizing PSUs costs real watts. And because the 100 percent column is lower than the 50 percent column, running near the limit is also the least efficient place to run.

One more term you will meet on spec sheets: power factor. VA is volts times amps; watts is the part of that doing useful work, and power factor is the ratio. Modern server supplies use active PFC and sit at 0.95 or better, so VA and watts are close enough to treat as the same number. Consumer UPS units are where this bites. A "1500 VA" UPS rated at 900 W has a power factor of 0.6, and your 1000 W of servers will overload it despite the big number on the box. Size UPS units by watts.

## Management and Security

A networked PDU is an embedded computer with a web server, and it is usually one running firmware nobody has updated since it shipped. Treat it accordingly.

Change the default credentials first. Put the management interface on the management VLAN with no route to the internet and none from user [VLANs](/blog/vlan-segmentation-guide). If the unit only supports SNMPv1 or v2c, the community string is a plaintext password readable by anyone who can capture the traffic; SNMPv3, whose architecture is defined in RFC 3411, adds real authentication and encryption. Keep SNMP read-only unless you truly need writes, because SNMP write access to a switched PDU means anyone who learns the community string can power off your rack.

## What a PDU Will Not Do

A PDU is not a UPS. It has no battery, and unless the datasheet specifically says surge suppression, it has no surge protection and no line conditioning either. Everything downstream of a basic PDU sees exactly the power quality that came in. If you want ride-through for outages, that is a separate box, and the PDU plugs into it rather than the other way around.

A monitored PDU also cannot tell you why consumption changed, only that it did. Per-outlet metering says server 3 went from 250 W to 400 W; it takes host-level monitoring to say a runaway process is pinning eight cores.

And no PDU fixes a circuit that is too small. If your rack needs 4 kW and the room has one 20 A 120 V circuit, the answer is an electrician, not a better power strip.

## References

- https://en.wikipedia.org/wiki/IEC_60320
- https://en.wikipedia.org/wiki/NEMA_connector
- https://en.wikipedia.org/wiki/80_Plus
- https://www.nfpa.org/codes-and-standards/nfpa-70-standard-development/70
- https://en.wikipedia.org/wiki/Power_factor
- https://www.rfc-editor.org/rfc/rfc3411
