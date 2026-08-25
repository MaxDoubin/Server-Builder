
## What PoE Does

Power over Ethernet delivers electrical power over standard Ethernet cabling, allowing devices like IP phones, wireless access points, and security cameras to operate without a separate power supply. A PoE switch powers the device through the same cable that carries data.

The power is DC, injected at roughly 48 V, and it travels on the same twisted pairs as the data using a technique called phantom power: the voltage is applied common-mode across a pair while the data rides differentially on that same pair. The two do not interfere because they occupy different modes, which is why PoE could be retrofitted onto cabling installed years before anyone thought of it.

## The Standards

**PoE (IEEE 802.3af):** Original standard, up to 15.4W per port. Sufficient for basic IP phones and low-power APs.

**PoE+ (IEEE 802.3at):** Up to 30W per port. Handles most access points and PTZ cameras.

**PoE++ (IEEE 802.3bt):** Up to 60W (Type 3) or 90W (Type 4) per port. Powers high-performance APs, thin clients, and even small displays.

Two numbers matter for every one of these, and vendors quote whichever one flatters them. The first is what the switch puts out at the port. The second is what the device is guaranteed to receive after cable losses, which the standard budgets at up to 12.5 percent over a full 100 m run. So 802.3af is 15.4 W at the port and 12.95 W guaranteed at the device. 802.3at is 30 W out and 25.5 W in. 802.3bt Type 3 is 60 W out and 51 W in, and Type 4 is 90 W out and 71.3 W in. If a product page advertises "100 W PoE", that is marketing rather than 802.3bt, because Type 4 tops out at 90 W from the source. Cisco's UPOE and UPOE+ are 60 W and 90 W respectively.

The other split is how many pairs are used. 802.3af and 802.3at power two pairs. The standard defines Alternative A, which uses the data pairs (1/2 and 3/6), and Alternative B, which uses the spare pairs (4/5 and 7/8) on 100BASE-TX. The switch picks one and a compliant device has to accept either. 802.3bt uses all four pairs, which is how it reaches 90 W without exceeding the per-conductor current limit. This is why a run that works fine for a phone can fail for a Type 3 access point: if a pair is broken, or a cheap patch cable only landed two pairs, 100 Mbps data still works and 4-pair PoE does not.

Power classes are how the switch learns how much to reserve. Classes 0 through 4 come from 802.3af and 802.3at, with Class 4 meaning 30 W. 802.3bt added Classes 5 through 8, with Class 8 being the 71.3 W device. Class 0 is the "I did not tell you" class and makes the switch reserve a full 15.4 W whether the device needs it or not.

## Planning PoE Budgets

Every PoE switch has a total power budget shared across all ports. A 24-port switch might have a 370W budget. If you connect 24 PoE+ devices drawing 25W each, that is 600W, which exceeds the budget. Some ports will not receive full power.

Calculate your power requirements before deploying. Group high-power devices carefully and check the switch's documentation for per-port power limits and total budget.

That 370 W figure is not arbitrary. It is a switch sized so that 24 ports of Class 3 802.3af, at 15.4 W each for 369.6 W total, fit exactly. The same switch supports only 12 ports at full PoE+, and if you are deploying Wi-Fi 6E or Wi-Fi 7 access points that want Type 3 power, it supports six. Vendors sell the same chassis with different power supplies for exactly this reason, so check the installed PSU part number rather than the datasheet's maximum.

What happens when you exceed the budget is worth knowing before it happens to you. The switch does not brown out every port. It allocates by port priority, which on Cisco gear you set with `power inline port priority`, and denies power to the lowest priority ports still asking for it. Those devices simply never come up. Leave 15 to 20 percent headroom, because a camera with its infrared illuminators on at night draws considerably more than the same camera at noon, and the budget is evaluated live.

## How It Works

The switch (PSE - Power Sourcing Equipment) applies a small voltage to the cable and checks for a signature resistor in the connected device (PD - Powered Device). If the signature matches an IEEE 802.3 profile, power is enabled. This prevents accidents with non-PoE equipment.

Concretely, detection means the PSE applies a low voltage in the region of 2.8 to 10 V and measures the slope of current against voltage, looking for a 25 kilohm signature resistance. Only if it finds one does it move to classification, applying a higher voltage around 15.5 to 20.5 V and measuring the current the device draws to read its class. Only then does the full 48 V appear. The whole handshake takes well under a second, and it is why you can plug a laptop into a PoE port without destroying it.

After power is up, negotiation can continue in software. LLDP, specifically the 802.3 power-via-MDI TLV, lets the device and the switch refine the allocation: a device that classified as Class 4 but only needs 18 W can say so and hand the rest back to the budget. This is why enabling LLDP on a PoE switch often frees more capacity than expected, and why disabling it can make a marginal deployment stop working.

## What Actually Goes Wrong

**The access point reboots in a loop.** Every two or three minutes the AP drops off and comes back. This is almost always power, not the network. Either the switch budget is exhausted and the port is being denied, or the device negotiated 802.3af when it wanted 802.3at. Many APs will boot on af power but disable a radio, disable the USB port, or run the radios at reduced transmit power, so a second symptom is an AP that comes up with one band missing. Run `show power inline` on the switch and compare what is allocated against what the device is asking for.

**Passive PoE meets a standards-compliant device.** Consumer and older prosumer gear sometimes ships passive injectors that put 24 V on the spare pairs with no detection handshake at all. Plugging a compliant 802.3af device into one of those, or a 24 V passive device into a proper PoE switch, ranges from "does not work" to "releases smoke". Passive PoE and 802.3af are not the same technology and share only the connector.

**Copper-clad aluminium cable.** CCA patch and bulk cable is sold cheaply and looks identical to the real thing. Its DC resistance is substantially higher than solid copper, so voltage drop over a long run is worse, more of the budget turns into heat inside the wall, and it is a genuine fire concern at Type 3 and Type 4 current levels. Buy solid copper, and be suspicious of any bulk cable priced well under the going rate.

**Heat in cable bundles.** Current through copper makes heat, and a bundle of forty-eight cables all delivering 802.3bt power in a warm ceiling void gets hot enough to raise insertion loss and shorten cable life. TIA's TSB-184-A exists specifically to give derating guidance for bundle size and ambient temperature. Cat6A, with its larger conductors, runs cooler under the same load than Cat5e and is the sane choice for new high-power installs.

**Marginal terminations.** A punch-down with a partially seated conductor passes a wire-map test and shows link. Under 600 mA of PoE current it heats, resistance rises, the voltage at the device sags, and the device resets. The symptom is hardware that works at low load and fails under load, which reads like a software problem and is not.

## Practical Considerations

- Check that the cable quality supports PoE, particularly for longer runs
- Use cable testers that can verify PoE voltage and current
- Consider inline PoE injectors for individual devices in environments without PoE switches
- Monitor per-port power consumption in the switch management interface for troubleshooting
- Ground and surge-protect anything outdoors, because a copper run to a rooftop camera is a path for a nearby strike straight into your switch
- Put cameras and APs you care about on a switch that is itself on a UPS, since PoE means the switch is now their power supply too

## Where PoE Stops

The 100 m limit is Ethernet's, not PoE's, but it binds all the same. PoE extenders exist and work by regenerating the signal mid-run, at the cost of latency, another failure point, and often half the available power on the far side. Past that distance the right answer is fiber to a small remote enclosure with local power, not a chain of extenders.

There is also a ceiling on power. Type 4 at 90 W covers access points, small displays, thin clients, and door controllers. It does not cover a workstation, a NAS, or anything with a spinning disk array, and stretching for it means paying a switch premium to solve a problem an outlet solves for nothing.

PoE simplifies physical deployments significantly. The ability to mount an AP or camera anywhere you can run a cable, without running power separately, is a real advantage. It is at its best exactly where mains power is expensive to install: ceilings, exterior walls, poles, anywhere an electrician would otherwise have to be involved. Inside a rack, where every device is a foot from a PDU, it mostly just moves your single point of failure into the switch.

## References

- https://en.wikipedia.org/wiki/Power_over_Ethernet
- https://standards.ieee.org/ieee/802.3/7071/
- https://en.wikipedia.org/wiki/Ethernet_over_twisted_pair
- https://en.wikipedia.org/wiki/Category_5_cable
- https://en.wikipedia.org/wiki/Twisted_pair
- https://en.wikipedia.org/wiki/Link_Layer_Discovery_Protocol
