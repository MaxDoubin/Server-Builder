
## Measuring Power

You cannot optimize what you do not measure. I use three levels of power monitoring:

1. **Kill-A-Watt meter** on the rack's input circuit for total rack power draw
2. **PDU displays** showing per-PDU power consumption
3. **iDRAC power monitoring** showing per-server real-time and historical power usage

Together, these give me a complete picture of where power is going.

Know the limits of each tool before you trust a number. A Kill A Watt is rated to 15 A and about 1875 W, so it cannot legally or safely sit in front of a rack pulling more than that, and consumer meters lose accuracy badly at low loads. A metered PDU is typically specified to around 1 percent accuracy and does not care about load level. iDRAC's reading comes from the power supply's own instrumentation and is the number to trust for a single server. Also watch the units: a Kill A Watt reports both watts and volt-amps, and only watts is what you are billed for. Modern server supplies use active power factor correction and run above 0.95 power factor, so the two numbers are close, but a cheap UPS rated in VA will have a lower watt rating and the watt rating is the one that binds.

For the per-server number without leaving the shell, [IPMI](/blog/ipmi-remote-management) exposes it directly:

```bash
# Instantaneous system power draw, in watts
ipmitool -I lanplus -H 10.0.10.31 -U root -P '...' dcmi power reading
```

## What I Found

When I first measured, my rack was drawing about 1,600 watts continuously. At my electricity rate, that works out to roughly $140 per month. Not trivial.

The arithmetic is worth internalizing because it makes every future decision fast. There are 8,760 hours in a year, so about 730 hours in an average month, which gives you a one-line rule: **kilowatts times 730 equals kilowatt-hours per month.** So 1.6 kW times 730 is roughly 1,170 kWh per month, and at about $0.12 per kWh that is $140. Your own rate is the variable that matters most here; US residential rates vary by more than a factor of three between states, so a rack that costs $140 a month in one place costs $350 in another.

Breaking it down:
- Dell R740 #1: ~500W (heavily loaded with VMs)
- Dell R740 #2: ~450W (moderate load)
- Mac Pro: ~280W (mostly idle)
- Networking equipment: ~80W
- UPS overhead: ~60W

That 60 W of UPS overhead is not a rounding error, it is the conversion loss. A double-conversion (online) UPS rectifies AC to DC and inverts it back continuously, and that costs 3 to 8 percent of throughput power the entire time it is running. A line-interactive UPS passes utility power through untouched until it needs to intervene, so its idle loss is far lower. If you do not have equipment that genuinely needs a perfectly conditioned sine wave, line-interactive is the cheaper choice to run.

Before going further, check your circuit. A standard NEMA 5-15 outlet on a 15 A, 120 V branch circuit is 1,800 VA nominal, but the National Electrical Code limits a **continuous** load, defined as three hours or more, to 80 percent of the breaker rating. That is 12 A, or 1,440 VA. A rack pulling 1,600 W continuously is over the limit for a single 15 A circuit. It needs a 20 A circuit (16 A continuous, 1,920 VA) or it needs to be split across two circuits. This is the part of homelab power that is a safety issue rather than a cost issue, and it is the reason to know your total draw even if you do not care about the bill.

## Optimizations

**BIOS power profiles:** Switching from "Performance" to "Performance Per Watt (OS)" on both R740s saved about 80W total with no noticeable performance impact.

The reason that works is C-states. Dell's "Performance" system profile disables processor C-states and C1E and pins the CPU to its maximum P-state, so the cores never drop into a low-power idle even when they have nothing to do. "Performance Per Watt (OS)" hands control to the operating system's governor instead. On Linux with the `intel_pstate` driver that means the `powersave` governor, and here is the misconception that costs people this saving: `powersave` on `intel_pstate` is not slow. It still ramps to turbo frequencies under load within microseconds; it just does not hold maximum frequency while idle. Check what you actually have with `cpupower frequency-info`, and confirm the cores are reaching deep C-states with `turbostat`, which reports package power from the CPU's own RAPL counters alongside C-state residency.

**Redundant power supplies:** the one I would add to this list. Power supply efficiency is a curve, not a constant. An 80 PLUS Platinum unit is certified at roughly 94 percent efficiency at 50 percent load but only around 90 percent at 20 percent load, and efficiency falls off a cliff below that. Two redundant 1,100 W supplies sharing a 300 W server load are each running at about 14 percent, in the worst part of the curve. Dell's Hot Spare mode puts one supply into standby and loads the other into its efficient band, typically recovering 15 to 30 W per server, while still keeping the standby unit ready. It is enabled in iDRAC under power configuration and it is free.

**Idle server management:** The Mac Pro was drawing 280W while barely being used. I configured it to sleep when idle and wake on network access. Average draw dropped to about 40W.

**Consolidating VMs:** By rebalancing VM placement, I was able to keep R740 #2 at lower utilization, which reduced its power draw by about 60W.

**After optimization:** Total rack draw dropped from 1,600W to about 1,100W. That is a 30% reduction and saves roughly $40 per month.

Check that against the rule: 0.5 kW saved times 730 hours is 365 kWh per month, which at $0.12 is about $44. The numbers line up, which is how you know the meter and the math agree.

## Temperature and Power

Server power draw is closely linked to cooling. Higher ambient temperatures cause fans to spin faster, which uses more power, which generates more heat. Keeping the rack area cool (below 75F) helps keep fan speeds and power draw lower.

I added better ventilation to the closet housing my rack, which dropped ambient temperature by about 5 degrees and resulted in measurably lower fan speeds and power consumption.

Fans are a bigger lever than they look, because fan power follows the affinity laws: airflow scales linearly with RPM but **power scales with the cube of RPM.** Dropping fan speed by 20 percent cuts fan power roughly in half. That is why a handful of degrees of ambient temperature shows up so clearly on the meter, and it is why the single worst power regression in a PowerEdge homelab is the third-party PCIe card problem. Install an HBA, NIC, or NVMe drive that iDRAC does not recognize and it loses thermal telemetry for that slot, assumes the worst, and pins the chassis fans to a high fixed floor. On an R740 that can add well over 100 W and make the server audibly unbearable. The fix is one line:

```bash
# Stop iDRAC from ramping fans for unrecognized PCIe cards
racadm set system.thermalsettings.ThirdPartyPCIeCardFanResponse 0
```

Use it only if you know the card actually has adequate airflow, because the safety behavior exists for a reason.

The other half of the thermal story is the cost of removing the heat. Essentially 100 percent of the electrical power a server consumes becomes heat in the room. Converting units, 1 W is 3.412 BTU per hour, so a 1,600 W rack dumps about 5,460 BTU/hr into a closet. Air conditioning that away is not free either: a window unit with a coefficient of performance around 3 spends roughly a third of the heat load in additional electricity, so the true marginal cost of the rack in a cooled space is closer to 1.3 times its own draw. ASHRAE's recommended inlet air envelope for data center equipment is 18 to 27 degrees C (64 to 81 F), and the top of that range is warmer than most people run their labs. You do not need it cold, you need it inside the envelope and you need the hot exhaust not to recirculate back to the intakes.

## The Long-Term View

Power costs add up over years. A 500W reduction saves over $500 per year at typical electricity rates. When evaluating new equipment, I now factor in power consumption alongside purchase price, performance, and features. A server that costs less but draws more power may actually cost more over its lifetime.

The check: 500 W times 8,760 hours is 4,380 kWh a year, about $525 at $0.12 per kWh. Compare that against a used server's purchase price and the conclusion is uncomfortable. A $300 R720 that idles 120 W higher than a $700 R740 costs you roughly $126 more per year to run, so the cheaper server is the more expensive one inside three years, before counting the extra cooling and the extra noise. Get an idle wattage figure for anything you are considering, not just a peak figure, because a homelab spends the overwhelming majority of its life idle. If you can only measure one number on a piece of equipment, measure idle draw.

## References

- https://en.wikipedia.org/wiki/80_Plus
- https://www.kernel.org/doc/html/latest/admin-guide/pm/intel_pstate.html
- https://man.archlinux.org/man/ipmitool.1
- https://man.archlinux.org/man/turbostat.8
- https://en.wikipedia.org/wiki/National_Electrical_Code
- https://www.eia.gov/energyexplained/electricity/prices-and-factors-affecting-prices.php
