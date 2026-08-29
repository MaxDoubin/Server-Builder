
## Why the R740

The Dell PowerEdge R740 is a 2U rack server that hits a sweet spot between performance, expandability, and availability on the used market. I have multiple R740s in my lab, and they handle the bulk of my virtualization and storage workloads.

The R740 supports dual Intel Xeon Scalable processors, up to 3 TB of DDR4 ECC memory across 24 DIMM slots, and has room for up to 16 2.5-inch drives or 8 3.5-inch drives depending on the chassis configuration. For a homelab, that kind of flexibility is exactly what you want.

It is a 14th generation PowerEdge, introduced in 2017 on the LGA 3647 socket. First generation Xeon Scalable (Skylake-SP) works out of the box, and second generation (Cascade Lake) works with a BIOS update, which is worth knowing because Cascade Lake parts are often cheaper per core on the used market now.

## Memory: The Part People Get Wrong

Twenty-four DIMM slots sounds like "put memory anywhere". It is not.

Each CPU has six memory channels and twelve slots, two slots per channel. Bandwidth scales with populated channels, so you populate in multiples of six per socket. The most common used-server mistake is buying four or eight sticks because that is what desktops use. Eight DIMMs across six channels leaves two channels carrying double the load, the controller paces the whole set to the imbalance, and you give up bandwidth for no saving. Buy six, or twelve.

The second thing: with only one CPU installed, half the DIMM slots and several of the PCIe slots are electrically dead, because they hang off the second socket. A single-CPU R740 is a twelve-slot machine, not a twenty-four-slot machine. Check what you are actually buying.

Third, this takes registered ECC memory: RDIMMs, or LRDIMMs if you are chasing the 3 TB ceiling with 128 GB modules. Unbuffered desktop DDR4 will not post. And the advertised speed is a ceiling, not a promise. The actual clock is the lowest of what the DIMMs, the CPU's memory controller, and the population rules allow. A Xeon Gold 6130 caps at 2666 MT/s whatever the sticks are rated for.

Fourth, and the one that survives correct population: memory attached to socket 1 is remote to socket 0, and reaching it crosses the interconnect at higher latency. That is NUMA. A VM sized larger than one socket's share of memory can be markedly slower than the same VM that fits inside a single node, so size guests to fit a NUMA node where the workload allows it.

## iDRAC: The Killer Feature

One of the things that separates enterprise servers from consumer hardware is out-of-band management. Dell's iDRAC (Integrated Dell Remote Access Controller) gives you full remote control over the server, even when the OS is not running. You can monitor hardware health, view real-time power consumption, access the console remotely, and even mount virtual media for OS installations.

I cannot overstate how much this matters in a lab environment. When you are testing things and inevitably break an OS installation, being able to remotely access the console and reinstall without physically touching the machine saves hours.

Now the honest part, and it is the thing to check before you buy: the two features I just praised are license-gated. iDRAC9 comes in Express, Enterprise, and Datacenter tiers. **Virtual Console and Virtual Media require Enterprise.** An Express-licensed R740 gives you health monitoring, power readings, and a web UI, and no remote screen. A used server listed without mentioning the license usually has Express, and the licence is a real cost added after the fact. If the listing says "iDRAC Enterprise", that is worth actual money.

Practical access notes. iDRAC defaults to DHCP on the dedicated management port, with 192.168.0.120 as the static fallback. Older units use `root` / `calvin`; later ones have a unique default password printed on the pull-out service tag at the front of the chassis. Change it either way, and put the iDRAC on a management VLAN with no route to the internet. It is a full computer with its own network stack and power control over your server, and it runs whether or not the host is powered on. A BMC exposed to the internet is the classic way an otherwise well run lab gets owned.

For automation, iDRAC9 exposes a Redfish API over HTTPS, which is the modern way to script inventory, power state, and firmware updates. [IPMI](/blog/ipmi-remote-management) over LAN also exists but is disabled by default on iDRAC9 and has to be turned on deliberately, which is the correct default given IPMI's authentication history.

```bash
# Chassis power state and sensor readings over IPMI, once enabled.
ipmitool -I lanplus -H 10.0.10.20 -U root -P '<password>' chassis status
ipmitool -I lanplus -H 10.0.10.20 -U root -P '<password>' sdr type temperature
```

## Storage Configuration

I run my R740s with a mix of SSDs and spinning drives. The front bays hold NVMe and SATA SSDs for VM storage, while a separate chassis extension handles bulk storage on larger drives. The PERC H740P [RAID](/blog/raid-levels-comparison) controller handles the hardware RAID, though I have been experimenting with passing drives through to ZFS for more flexibility.

That last experiment deserves a warning, because it is where the R740 and ZFS genuinely fight each other. The H740P is a RAID controller with 8 GB of battery-backed cache and no true IT mode. Its "Non-RAID" disks are presented to the OS, but the I/O still crosses the RAID stack and its cache. ZFS assumes it owns the write path: it needs SMART data to pass through unmodified, and it needs a write to be on stable media when the drive says it is. A cache it cannot see or flush undermines the guarantee ZFS exists to provide, and putting each disk in a single-drive RAID 0 to fake passthrough does not help. The right part is the HBA330, a plain SAS host bus adapter in IT mode that is cheap on the used market. Swap the controller rather than fighting the H740P.

The backplane is the other trap. The R740 ships in several backplane configurations: 8 or 12 by 3.5 inch, and 8, 16, or 24 by 2.5 inch. NVMe support is not a property of the drive bay, it is a property of the backplane plus the PCIe extender cables and risers that feed it. You cannot put a U.2 NVMe drive into a SAS/SATA bay and have it work. Confirm the backplane part before you buy NVMe drives for it.

Same story with PCIe: the R740 supports up to eight PCIe 3.0 slots, but those slots live on riser cards that are separate, frequently missing from used systems, and specific to a configuration. A server sold "with 8 slots available" and no risers in the box has zero slots available.

## Noise and Power

The honest truth about running enterprise servers at home is that they are loud and power-hungry. An R740 under load pulls around 400 to 600 watts, and the fans are not subtle. I have spent time tuning fan profiles through iDRAC and making sure the ambient temperature stays reasonable, but it is never going to be silent.

If you are considering one for a homelab, plan for the power bill and the noise. It is worth it for the capabilities, but go in with realistic expectations.

Some numbers to plan against. Idle is much better than load: a modestly configured R740 with two mid-range Xeons and a handful of drives sits around 100 to 150 watts doing nothing. The 400 to 600 watt figure is real work. At 130 watts idle and typical residential rates, you are looking at a meaningful but survivable monthly line item, and the delta between idle and load is what your UPS sizing has to cover.

Power supplies come in 495 W, 750 W, 1100 W, 1600 W, 2000 W, and 2400 W flavors, all 80 PLUS Platinum or Titanium, normally installed as a redundant pair. The gotcha for anyone in North America: the high-wattage units require 200 to 240 V input to deliver their rated output. On a 120 V circuit a 2000 W supply derates to roughly half. If you are on standard household 120 V, the 750 W or 1100 W supplies are the sensible choice and the big ones buy you nothing.

**The single biggest cause of an unexpectedly loud R740 is a third-party PCIe card.** The chassis reads thermal telemetry from Dell-branded cards to set fan speed. Install a used Mellanox NIC or an off-brand HBA and the firmware has no thermal data for it, so it falls back to a conservative high fan baseline and the server howls at idle forever. This is not a fault. A "Third Party PCIe Card Default Cooling Response" setting, exposed through iDRAC and IPMI, turns the baseline back down. Know it exists before concluding the server is broken.

One more caveat on fan tuning: newer iDRAC9 firmware removed the raw IPMI commands the homelab community used for manual fan curves. If manual fan control matters to you, check what your current firmware supports before you flash a newer one, because the update is not straightforward to reverse.

Finally, POST is slow. Memory training and controller initialization mean two to four minutes from power button to boot device, and the screen is blank for much of it. It is not dead. It is counting your DIMMs.

One last conversion worth doing before you pick a room: at 3.412 BTU per hour per watt, 400 to 600 watts is roughly 1,400 to 2,050 BTU/hr per machine. Two R740s is a small space heater running continuously, and that, not the noise, is usually what decides whether a closet works.

## What It Cannot Do

Be clear-eyed about the ceiling. This is PCIe 3.0 throughout, so a modern NVMe drive rated at 7 GB/s delivers about half that. It is DDR4, not DDR5. Per-core performance from a 2017 to 2019 Xeon is well behind a current desktop CPU, so a workload that needs fast single threads will be slower here than on a machine that cost less. And no amount of tuning makes a 2U chassis with 60 mm fans quiet enough for a bedroom.

The R740 is the right answer when you want many cores, a lot of ECC memory, real out-of-band management, and hot-swap drive bays for less than the price of one modern workstation. It is the wrong answer when you want low idle power, silence, or the fastest possible single thread. For those, a mini PC or a modern desktop board wins, and it is not close.

## Getting One

Used R740s are available from resellers and auction sites. Prices vary a lot based on configuration, but you can get a solid base system for a reasonable price and add memory and drives over time. Buy from reputable sellers, check the service tag for warranty status, and inspect the drive backplane before committing.

The checklist I now run before buying, all of it from the sections above: how many CPUs, how many DIMMs and in what population, which iDRAC licence, which storage controller, which backplane, are the risers present, which PSUs and at what input voltage, and are rails included. Rails are the sneaky one. They are chassis-specific, frequently missing, and cost more separately than you expect.

## References

- https://en.wikipedia.org/wiki/Dell_PowerEdge
- https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface
- https://redfish.dmtf.org/
- https://en.wikipedia.org/wiki/Registered_memory
- https://en.wikipedia.org/wiki/Non-uniform_memory_access
- https://man.archlinux.org/man/ipmitool.1
