
## What PoE Does

Power over Ethernet delivers electrical power over standard Ethernet cabling, allowing devices like IP phones, wireless access points, and security cameras to operate without a separate power supply. A PoE switch powers the device through the same cable that carries data.

## The Standards

**PoE (IEEE 802.3af):** Original standard, up to 15.4W per port. Sufficient for basic IP phones and low-power APs.

**PoE+ (IEEE 802.3at):** Up to 30W per port. Handles most access points and PTZ cameras.

**PoE++ (IEEE 802.3bt):** Up to 60W (Type 3) or 100W (Type 4) per port. Powers high-performance APs, thin clients, and even small displays.

## Planning PoE Budgets

Every PoE switch has a total power budget shared across all ports. A 24-port switch might have a 370W budget. If you connect 24 PoE+ devices drawing 25W each, that is 600W, which exceeds the budget. Some ports will not receive full power.

Calculate your power requirements before deploying. Group high-power devices carefully and check the switch's documentation for per-port power limits and total budget.

## How It Works

The switch (PSE - Power Sourcing Equipment) applies a small voltage to the cable and checks for a signature resistor in the connected device (PD - Powered Device). If the signature matches an IEEE 802.3 profile, power is enabled. This prevents accidents with non-PoE equipment.

## Practical Considerations

- Check that the cable quality supports PoE, particularly for longer runs
- Use cable testers that can verify PoE voltage and current
- Consider inline PoE injectors for individual devices in environments without PoE switches
- Monitor per-port power consumption in the switch management interface for troubleshooting

PoE simplifies physical deployments significantly. The ability to mount an AP or camera anywhere you can run a cable, without running power separately, is a real advantage.
