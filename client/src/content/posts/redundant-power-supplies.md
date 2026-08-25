
## The Problem They Solve

A server with a single power supply has a single point of failure. If that PSU fails, the server goes down. In a production environment, unplanned downtime is expensive. Redundant power supplies eliminate the PSU as a single point of failure.

They are worth the money because power supplies are, statistically, among the parts most likely to fail. They contain the only electrolytic capacitors and the only fan in a component that spends its life converting mains AC into low-voltage DC while sitting in the hottest airflow path in the chassis. Capacitors dry out, fans seize, and both are wear-out failures rather than random ones, which means the risk rises the longer the server has been running.

## How Redundancy Works

Enterprise servers typically support 1+1 or 2+1 redundancy. In a 1+1 configuration, two PSUs share the load equally. If one fails, the other takes the full load without interruption. The server keeps running. You get an alert, you replace the failed unit during business hours, and there is no outage.

The PSUs connect to the server's power distribution board, which handles the load sharing and failover automatically. Modern enterprise PSUs support hot-swap, meaning you can remove the failed unit and install a replacement while the server is running.

The load sharing is not literally a switchover. Both supplies are energised and each carries roughly half the current, so when one dies there is nothing to switch: the remaining unit simply sees its share double, and the bulk capacitance on the distribution board covers the microseconds while its regulation loop catches up. That is why the transition is invisible to the operating system.

There is a subtlety in the word "redundant" that catches people. **Two power supplies are only redundant if one of them can carry the entire load on its own.** A server with two 495 W supplies drawing 600 W is not redundant, it is load-shared, and losing one drops the machine. Dell and HPE both report this: iDRAC will show the power supply state as "Redundancy Lost" or "Redundancy Degraded" rather than an outright fault, and that warning is easy to scroll past. Check it after any upgrade that adds GPUs, drives, or CPUs, because the configuration that was comfortably redundant last year may not be now.

Related trap: do not mix wattages. A 750 W and a 1100 W unit in the same chassis will typically post an error and run the system in a non-redundant mode, because the firmware has no safe way to share load between supplies with different capabilities. Keep matched pairs, and keep a spare of the same part number.

## The Efficiency Wrinkle

Switching power supplies are not equally efficient at all loads. The 80 PLUS certification programme measures efficiency at 10, 20, 50, and 100 percent of rated load, and every tier peaks near the middle: an 80 PLUS Titanium unit in the internal redundant category is specified around 96 percent at half load but only around 90 percent at 10 percent load.

That has a direct consequence for redundant pairs. Two supplies each carrying 25 percent of their rating are running further down the efficiency curve than one supply carrying 50 percent, so a redundant server is measurably less efficient than a single-supply one at the same workload. Vendors solve this with a hot spare mode, which Dell exposes in iDRAC, that puts one PSU into a low-power standby state and runs the other at a more efficient load point, waking the standby unit in milliseconds if the active one falters. It is worth enabling on a fleet and worth understanding before you enable it, because it trades a tiny amount of transition risk for a real reduction in your power bill.

## Connecting to Separate Circuits

Redundant PSUs only provide real protection if they connect to independent power sources. In a data center, each PSU connects to a separate PDU on a separate circuit, ideally fed from separate UPS units and ultimately separate utility feeds.

In a homelab, you can approximate this by running each PSU to a different outlet on a different circuit, ideally on different breakers. It is not full enterprise-grade redundancy, but it protects against a tripped breaker or a failed power strip.

Here is the number that ruins A/B power designs: **in a true A/B rack, each side can only be loaded to 50 percent in steady state**, because when one side fails the other has to carry everything. Racks are routinely built with both PDUs at 70 or 80 percent, which looks efficient and works perfectly until an A-side maintenance window, at which point the B side inherits 160 percent of its capacity and trips its breaker. The failure of one feed then takes down the whole rack, which is the exact outcome the dual feed was purchased to prevent.

Layer the branch circuit derating on top. The National Electrical Code treats anything running for three hours or more as a continuous load and requires the circuit to be sized at 125 percent of it, which in practice means never loading a circuit past 80 percent of its rating. A 20 A circuit at 120 V gives you 16 A usable, or 1920 W. The same 20 A at 208 V gives 3328 W, which is a large part of why racks are fed at higher voltages. Combine the two rules and a pair of 20 A 208 V feeds supports about 3300 W of rack load with real A/B redundancy, not 6600 W.

Two more physical details. Server cords use IEC 60320 C13 and C14 connectors up to 10 A and C19 and C20 for higher current, and none of them lock by default. Use cords with retention clips or the vendor's cord locks, because the most common cause of an outage in a dual-corded server is a cord that worked loose in a rail slide, not a supply that failed. And plan for inrush: every PSU draws a large surge at power-on, so a whole rack restarting simultaneously after an outage can trip an upstream breaker. Servers have a BIOS setting for AC recovery behaviour, and staggering it across a rack rather than setting everything to power on immediately is worth the ten minutes it takes.

## Checking PSU Health

Dell iDRAC provides real-time PSU status, including input voltage, output power, and health state. You can see whether each PSU is active and contributing to the load, which is essential for confirming that redundancy is actually working.

```bash
# Via racadm
racadm getsensorinfo | grep -i power
```

On non-Dell hardware, or when you want one command that works across vendors, `ipmitool` reads the same sensors from the BMC:

```bash
# Per-supply state and readings
ipmitool sdr type "Power Supply"

# Chassis-level power draw, useful for the redundancy math above
ipmitool dcmi power reading
```

The three things worth alerting on are the redundancy state itself, the input voltage of each supply, and the total chassis draw. Input voltage is the one people forget, and it is the most useful of the three: if the A feed's voltage sags or disappears, you learn that a PDU or a breaker has a problem while the server is still happily running on B. Without that alert, you find out at the same moment the B feed fails, which is far too late.

## What Redundant PSUs Do Not Cover

They protect against one specific failure and are sometimes mistaken for general availability. Inside the chassis, the power distribution board that the supplies plug into is itself a single point of failure, as is the motherboard, the backplane, and the RAID controller. If a workload genuinely cannot go down, the answer is two servers, not one server with two supplies.

They also do nothing about correlated failures upstream. Two PSUs plugged into two PDUs that are fed by the same UPS, or the same panel, or the same utility drop, share every failure mode above the point where they diverge. Trace the path back and find where the two feeds actually become one, because that point is your real availability limit.

And they do not solve the single-corded device problem. Most access switches, plenty of firewalls, and nearly all small appliances have one power inlet, so putting them in an A/B rack achieves nothing unless you add a rack-level automatic transfer switch to give them a synthetic second feed. A rack where the servers are dual-corded and the top-of-rack switch is not is a rack that loses network connectivity when the A feed drops, servers running or otherwise.

## In Practice

I run all my lab servers with redundant PSUs and connect them to separate circuits. I have tested failover by unplugging one PSU while the server was running, and in every case the server continued without any interruption. The investment in a second PSU is minimal compared to the cost of an unexpected shutdown.

The testing is the part that matters, and it needs a rule attached: pull the cord, not the supply. Yanking the PSU module tests the hot-swap path, which is fine, but unplugging the cord tests the whole chain including the PDU outlet, the cord, and the inlet, which is where the faults actually live. Do it once per server when it is commissioned, confirm the alert fires and reaches you, plug it back in, and confirm the redundancy state returns to normal. A redundancy alert nobody receives is the same as no redundancy at all, and the only way to know it works is to break something on purpose while you are standing there.

## References

- https://en.wikipedia.org/wiki/Power_supply_unit_(computer)
- https://en.wikipedia.org/wiki/80_Plus
- https://en.wikipedia.org/wiki/IEC_60320
- https://en.wikipedia.org/wiki/Power_distribution_unit
- https://en.wikipedia.org/wiki/National_Electrical_Code
- https://man.archlinux.org/man/ipmitool.1
