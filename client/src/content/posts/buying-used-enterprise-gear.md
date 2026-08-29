
## The reason this market exists

Large operators replace equipment on a schedule, not on failure. Gear leaves a data center because a depreciation cycle ended or a platform standard changed, not because it stopped working. That is why a machine that cost a serious amount new can be had for a small fraction a few years later, still with plenty of service life in it.

Learning on that gear is genuinely different from learning on a virtual machine. Out of band management, redundant power, hot swap backplanes, real switching silicon with a real CLI: none of that has a good simulator. If you want to understand infrastructure, touching it matters. The trick is not overpaying in ways that do not show up on the price tag.

## What actually fails, in order

After enough acquisitions you learn that failures cluster in a predictable set of parts.

**Fans and bearings.** They have run continuously for years. A fan that whines on spin up is on its way out, and a failed fan in a chassis with aggressive thermal policy will ramp every other fan to maximum and make the machine unlivable.

**Power supply capacitors.** Electrolytics age with heat and hours. Visible bulging is the obvious sign, but the common failure is a supply that works until asked for a load step and then drops the rail.

**Batteries.** [RAID](/blog/raid-levels-comparison) controller cache batteries, CMOS cells, and the battery in a UPS are all consumables that were probably at end of life when the unit was retired. A controller with a dead cache battery drops back to write through mode, and the machine gets mysteriously slow rather than obviously broken.

**Drives.** Always assume the drives are the oldest part. Enterprise drives are rated for continuous duty and often have very high power on hours, and the drive is the one component whose failure loses data rather than availability.

**Thermal interface material.** Old paste turns to chalk. On a machine that will run under load, replacing it is an hour of work that changes the thermal behaviour completely.

Notice what is not on that list: the parts most people worry about. Processors and memory rarely wear out. Motherboards mostly work or do not.

## The things that are expensive to discover later

Some costs are not repairs, they are structural.

**Licensing and firmware behind support contracts.** Some vendors put firmware updates, and sometimes management features, behind an active support entitlement tied to the serial number. Buying secondhand can mean buying a machine you cannot patch. Check the vendor's policy for that product line before you buy, not after.

**Proprietary consumables.** Drive caddies, rail kits, and riser cards that exist only as vendor parts can cost a meaningful fraction of the price of the machine, and rail kits in particular are chassis specific.

**Power and noise.** An older platform doing the same work as a newer one for twice the wattage is not a bargain if it runs continuously. Do the arithmetic in your local cost per kilowatt hour before you buy, because a machine can easily cost more per year to run than it cost to acquire. Noise is the same category of mistake. Data center airflow designs assume nobody is in the room.

**Locked management controllers.** A BMC still bound to the previous owner's directory, or a switch with a configuration you cannot clear without console access, is a machine you do not fully own yet. Ask whether it has been reset to defaults, and get the console cable.

## The receiving checklist

Everything I take in gets the same first day treatment before it is trusted with anything.

```bash
# 1. Inventory and health from the service processor
ipmitool fru print
ipmitool sel list            # event log from the previous owner
ipmitool sensor list | grep -Ei 'fan|temp|volt'
ipmitool sel clear           # only after you have read it

# 2. Every drive, full SMART picture
for d in /dev/sd? /dev/nvme?n1; do
  echo "=== $d ==="
  smartctl -i -A -H "$d" 2>/dev/null | \
    grep -Ei 'model|serial|power_on|reallocated|pending|percentage used|health'
done

# 3. Long self test on every drive, then check results tomorrow
for d in /dev/sd?; do smartctl -t long "$d"; done

# 4. Memory, overnight, before anything real runs on it
memtester 8G 3        # per-process check while the OS runs
# or boot memtest86+ from USB for a full pass over all installed memory

# 5. Load and thermals together
stress-ng --cpu $(nproc) --matrix 0 --timeout 30m --metrics-brief
watch -n5 'sensors; ipmitool sensor list | grep -i fan'
```

The system event log is the most underrated item there. It is a written record of what the machine complained about at its previous job: correctable memory errors, PSU dropouts, thermal events. Read it before you clear it.

Infant mortality is real. Components that survive their first weeks of duty tend to keep going, so a burn in period is not paranoia, it is sampling the part of the curve where failures cluster. I run new arrivals hard for several days on nothing important, and only then give them a real job.

## When used is the wrong answer

Buy new, or do not buy at all, when the workload is latency sensitive enough that a generational gap matters, when the machine will run continuously and the power delta pays for a new one within a couple of years, when the gear lives somewhere people sleep, or when you would need vendor support to sleep at night.

And be honest about the hidden cost that never shows up in the price: your time. A cheap machine that needs three weekends of parts hunting cost more than the difference. The best value in this market is boring, well documented, high volume platforms with a large secondhand parts supply, because that is what turns a failure into a twenty dollar replacement instead of a project.

## References

- https://man.archlinux.org/man/smartctl.8
- https://en.wikipedia.org/wiki/Self-Monitoring,_Analysis_and_Reporting_Technology
- https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface
- https://en.wikipedia.org/wiki/Bathtub_curve
- https://www.memtest.org/
