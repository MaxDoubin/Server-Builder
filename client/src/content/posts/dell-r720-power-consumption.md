
## The short answer

A Dell PowerEdge R720 idles at about 85 to 150 watts in common two-CPU builds and draws roughly 215 to 410 watts at full load, depending on drives, memory and cards. Dell's [ENERGY STAR data sheet](https://i.dell.com/sites/doccontent/business/large-business/en/Documents/22-Dell-PowerEdge-R720-1100W-E5-2640-Family-Data-Sheet.pdf) measured 85.8 W idle for a minimal build and 144.7 W for a typical one, and Dell's tuned [SPECpower runs](https://open.spec.org/power_ssj2008/results/res2012q2/power_ssj2008-20120417-00452.html) idled at 51 to 54 W with one power supply and one SSD. At the July 2026 [US average residential price](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_3) of 18.31 cents per kilowatt-hour, 100 W around the clock costs about $160 a year. The biggest levers are drive and card count, a Performance Per Watt BIOS profile with C-states enabled, and Hot Spare for the power supplies.

## How many watts does a Dell R720 use?

Every published test used a different build, so the useful answer is a set of reference points from SPEC, Dell, a test lab and a reviewer, all on 2012-era E5-2600 hardware.

<figure>
<img src="/images/blog/dell-r720-power-consumption/r720xd.jpg" alt="Three Dell PowerEdge R720xd servers stacked in a rack with their drive bays visible" width="1200" height="802" loading="lazy" decoding="async">
<figcaption>Three PowerEdge R720xd servers, the storage version of the R720. Every published power test used a different build, and drive count is one of the biggest levers. Photo: Dell Inc., <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R720xd_(1).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Source | Build | Idle (W) | Full load (W) |
|---|---|---|---|
| SPECpower_ssj2008, four Dell results ([00435](https://www.spec.org/power_ssj2008/results/res2012q1/power_ssj2008-20120306-00435.html), [00452](https://open.spec.org/power_ssj2008/results/res2012q2/power_ssj2008-20120417-00452.html), [00569](https://www.spec.org/power_ssj2008/results/res2012q4/power_ssj2008-20121030-00569.html), [00578](https://www.spec.org/power_ssj2008/results/res2012q4/power_ssj2008-20121113-00578.html)) | 2 CPUs, 24 GB, one 495 or 750 W supply, one SATA SSD, tuned | 51.0 to 53.8 | 230 to 250 |
| [Dell ENERGY STAR sheet](https://i.dell.com/sites/doccontent/business/large-business/en/Documents/22-Dell-PowerEdge-R720-1100W-E5-2640-Family-Data-Sheet.pdf), minimum | 2 x E5-2640, 2 x 2 GB, one 10K SAS drive, PERC H310, two 1100 W | 85.8 | 216.8 |
| [Dell white paper](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/comparing-dell-r720-and-hp-proliant-dl380p-gen8-servers.pdf), July 2012 | 2 x E5-2660, 4 x 8 GB, two 15K SAS drives on PERC H710P, two 750 W | 87.5 | 303 |
| [Principled Technologies](https://www.principledtechnologies.com/Dell/R720_power_0312.pdf), March 2012 | 2 x E5-2680, 8 x 8 GB, four SAS drives, PERC H710P, two 750 W | 112.0 | 363.3 |
| [Alphr review](https://www.alphr.com/dell/31827/dell-poweredge-r720-review/), May 1, 2012 | 2 x E5-2680, five 10K SAS drives, PERC H710P, two 750 W | 120 | 358 |
| Dell ENERGY STAR sheet, typical | 2 x E5-2640, 8 x 8 GB, six 10K SAS drives, PERC H710, two 1100 W | 144.7 | 276.9 |
| Dell ENERGY STAR sheet, maximum | 2 x E5-2640, 16 x 32 GB, 16 drives, 10GbE and Fibre Channel cards, three PERC controllers, two 1100 W | 263.7 | 409.5 |

Full-load figures are not comparable across rows: SPEC runs a Java server workload, Dell's sheet used SiSoft Sandra Dhrystone, Principled Technologies a SQL Server test, and the review SiSoft Sandra. Dell's sheet also calls its figure sustained average power, not absolute peak.

Owner reports land in the same band, though they are forum reports, not controlled tests. A [2016 Unraid post](https://forums.unraid.net/topic/51733-taming-a-12th-gen-dell-poweredge/) about the 2U 12th-generation PowerEdge line, with two E5-2650 CPUs, four 16 GB 1.35 V DIMMs, a flashed PERC H310 and six 7,200 rpm drives, reported 84 W idle and 120 to 130 W with the drives spun up. A [2021 ServeTheHome thread](https://forums.servethehome.com/index.php?threads/dell-r730-vs-r720-power-usage.31985/) reported an R720xd with two E5-2650 v2 CPUs, 128 GB, four hard drives and two SSDs at about 145 W "at basically idle," and an R720 with 16 SSDs and six VMs at 220 to 260 W.

## Why do R720 power numbers differ so much?

Idle readings run from 51 W to 264 W across these sources, and the build explains most of the gap. Dell's July 2012 white paper and one SPEC result both used two E5-2660 CPUs with prefetchers disabled and System DBPM (DAPC) power management, yet Dell's two-supply build with a PERC H710P, two 15K drives and 32 GB idled at 87.5 W against 52.7 W for the one-supply, one-SSD, 24 GB build. Dell does not split the gap by part, but those are the parts that differ.

Four more things move the number:

- **Line voltage.** SPEC measured at 208 V and Dell's data sheets at 115 V, and Dell's [efficiency guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/power-efficiency-how-to-13g-servers_030216.pdf) says 115 V operation can reduce overall efficiency by about 2%.
- **Temperature.** Principled Technologies measured 363.3 W peak at 72 F inlet air and 394.2 W at 104 F, an 8.5% increase.
- **What "idle" means.** SPEC's active idle is an operating system doing nothing, with the disk and display set to sleep after one minute. A host running VMs idles higher.
- **Anecdotes without a baseline.** A [2019 blog post](https://dan.langille.org/2019/10/12/dell-r720-reducing-power-consumption/) estimated a 120 W saving, but its author wrote "I did not check power consumption before making this change."

## What drives idle and load draw on an R720?

With the CPU model held constant, Dell's three ENERGY STAR builds idled at 85.8, 144.7 and 263.7 W, so memory, drives and cards alone can triple idle draw.

### CPUs

Dell's [final technical guide](https://dl.dell.com/manuals/all-products/esuprt_ser_stor_net/esuprt_poweredge/poweredge-r720_reference-guide_en-us.pdf) lists E5-2600 and E5-2600 v2 processors from 60 W to 135 W TDP. TDP is a cooling target, not a reading: [Intel](https://www.intel.com/content/www/us/en/support/articles/000055611/processors.html) says "Power consumption is less than TDP under lower loads," so CPU choice matters most under sustained load.

<figure>
<img src="/images/blog/dell-r720-power-consumption/xeon-e5-2670.jpg" alt="An Intel Xeon E5-2670 processor seated in its socket" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A Xeon E5-2670 in its socket, from the E5-2600 family the R720 was built for. Photo: Porsche613, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Intel_Xeon_E5_2670_in_Socket_R_IMG_20180812_010825.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| CPU | Cores | Base clock | TDP |
|---|---|---|---|
| E5-2650L | 8 | 1.8 GHz | 70 W |
| E5-2660 | 8 | 2.2 GHz | 95 W |
| E5-2670 | 8 | 2.6 GHz | 115 W |
| E5-2680 | 8 | 2.7 GHz | 130 W |
| E5-2630L v2 | 6 | 2.4 GHz | 60 W |
| [E5-2650L v2](https://www.intel.com/content/www/us/en/products/sku/75270/intel-xeon-processor-e52650l-v2-25m-cache-1-70-ghz/specifications.html) | 10 | 1.7 GHz | 70 W |
| [E5-2670 v2](https://www.intel.com/content/www/us/en/products/sku/75275/intel-xeon-processor-e52670-v2-25m-cache-2-50-ghz/specifications.html) | 10 | 2.5 GHz | 115 W |
| [E5-2690 v2](https://www.intel.com/content/www/us/en/products/sku/75279/intel-xeon-processor-e52690-v2-25m-cache-3-00-ghz/specifications.html) | 10 | 3.0 GHz | 130 W |

Dell's guide prints 60 W for the E5-2650L v2 while Intel's page says 70 W, so the table uses Intel's figure. A single CPU saves one package's draw, but the [owner's manual](https://dl.dell.com/topicspdf/poweredge-r720_owners-manual_en-us.pdf) says PCIe slots 1 through 4 need both processors, and DIMM sockets B1 to B12 belong to the second.

### Memory

The R720 has 24 DIMM slots and four memory channels per CPU. Dell's efficiency guide says "two 4GB DIMMs will use more power than a single 8GB DIMM," and that x8 DIMMs use less than x4. Dell's [BIOS paper](https://downloads.dell.com/solutions/general-solution-resources/White%20Papers/12g_bios_tuning_for_performance_power.pdf) says 1.35 V low-voltage modules "will reduce overall power consumption."

### Drives and storage controllers

A spinning drive costs watts as long as it spins. [Seagate's data sheet](https://www.seagate.com/www-content/product-content/ironwolf/files/ironwolf-pro-ds1914-3-1701gb.pdf) lists 4.4 to 7.6 W idle and 0.6 to 0.8 W in standby for its 7,200 rpm 3.5-inch drives, so eight spinning drives account for roughly 35 to 61 W. Dell says SSDs typically use less than hard drives, and suggests software [RAID](/blog/raid-levels-comparison) for four drives or fewer to drop the RAID adapter.

### Power supplies

The R720 takes two hot-plug supplies. Dell's technical guide lists these options, with efficiency as targets at four load points:

<figure>
<img src="/images/blog/dell-r720-power-consumption/psu-pair.jpg" alt="Two hot-swap server power supplies, one pulled partly out of its bay" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A pair of hot-swap power supplies, here in a Fujitsu Primergy. Dell's Hot Spare setting keeps the second supply on standby, one of the levers for cutting R720 idle draw. Photo: Mixabest, <a href="https://creativecommons.org/publicdomain/mark/1.0/">Public domain</a>, via <a href="https://commons.wikimedia.org/wiki/File:FSC_Primergy_TX200_0015.JPG">Wikimedia Commons</a>.</figcaption>
</figure>

| Supply | Input | Efficiency at 10 / 20 / 50 / 100% load | Max heat (BTU/hr) |
|---|---|---|---|
| 495 W Platinum | 100 to 240 V AC | 82 / 90 / 94 / 91% | 1,908 |
| 750 W Platinum | 100 to 240 V AC | 82 / 90 / 94 / 91% | 2,891 |
| 750 W Titanium | 200 to 240 V AC only | 90 / 94 / 96 / 91% | 2,843 |
| 1100 W Platinum | 100 to 240 V AC | 89 / 93 / 94.5 / 92% | 4,100 |
| 1100 W DC | -48 to -60 V DC | 80 / 88 / 91 / 88% | 4,416 |

Efficiency is lowest at light load, and two redundant supplies split it equally. With two 495 W units, a 100 W server puts each near 10% of its rating, where Dell's target is 82%. Hot Spare sleeps one supply, so the other carries about 20%, where the target is 90%. For 100 W of internal load, that is 100 / 0.82 = 122 W at the wall against 100 / 0.90 = 111 W, an 11 W gap from targets, not a measurement.

Per the owner's manual, Hot Spare wakes both supplies above 50% load and sleeps one below 20%. Dell's documents disagree on the default: the technical guide says disabled, the [RACADM reference](https://dl.dell.com/topicspdf/idrac7-8-with-lc-v2.20.20.20_reference-guide_en-us.pdf) says enabled, so run `racadm get System.Power.Hotspare.Enable`. It is set under Overview, Server, Power/Thermal, Power Configuration. [Redundant Power Supplies](/blog/redundant-power-supplies) covers the mechanics.

### Fans, temperature and add-in cards

Dell's [thermal white paper](https://i.dell.com/sites/content/business/solutions/whitepapers/en/Documents/advanced-thermal-control.pdf) says the Maximum performance setting cools more aggressively "at the expense of increased fan power," and that a fan speed offset "causes fan speeds to increase" over the calculated speed, so an offset only adds watts. Fan power follows the cube of speed: the [U.S. Department of Energy](https://www1.eere.energy.gov/manufacturing/tech_assistance/pdfs/motor.pdf) notes a 20% speed cut can cut power by about 50%. One ServeTheHome owner on an R730xd reported 165 W rising to 182 W with "no other change than fan speed."

### BIOS system profile

The R720 ships with Performance Per Watt Optimized (DAPC), per the owner's manual. Dell's BIOS paper says disabling C-states in the Performance profile raised Windows idle power by 66% against profiles that enable them, and its chart labels read 1.00 for Performance and 0.34 for the rest, about three to one. In Linux the intel_idle driver forces some C-states on anyway: Performance measured 0.56 against 0.36 for DAPC. Dell tested the highest-TDP CPUs and 128 GB, so ratios will differ on a leaner build.

DAPC kept performance "within 2%" of the Performance profile. Custom has no defaults of its own: its sub-options take the state of the last profile selected, so a used server can arrive with C-states off.

## How much does an R720 cost to run per year?

Yearly kWh is watts x 8,760 hours / 1,000, and cost is kWh x your rate. The table uses the US average residential price for July 2026, 18.31 cents per kWh ([EIA Table 5.3](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_3), released September 24, 2026), and California's 33.61 cents ([Table 5.6.A](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a)) as a high example. Worked row: 145 x 8,760 / 1,000 = 1,270.2 kWh, and 1,270.2 x $0.1831 = $232.57. Prices vary widely and the EIA's rolling 12-month US average is 17.99 cents, so use your own rate.

| Average draw | Matches | kWh per year | At 18.31 cents | At 33.61 cents |
|---|---|---|---|---|
| 50 W | Near SPEC's tuned idle | 438 | $80 | $147 |
| 90 W | Dell minimal build idle | 788 | $144 | $265 |
| 145 W | Dell typical build idle | 1,270 | $233 | $427 |
| 220 W | Low end of one owner's VM host | 1,927 | $353 | $648 |
| 300 W | Between Dell's typical and maximum full load | 2,628 | $481 | $883 |

These figures cover the server only. Dell's data sheets add data-center overhead at a PUE of 2.0 to their kWh-per-year estimates, so do not compare those with this table.

## How do you measure an R720's real power draw?

iDRAC7 already measures it, so check there before buying a meter.

1. **iDRAC web interface.** Open Overview, Server, Power/Thermal, Power Monitoring for present, average, minimum and peak power. Dell's [iDRAC7 guide](https://dl.dell.com/topicspdf/integrated-dell-remote-access-cntrllr-7-v1.50.50_users-guide_en-us.pdf) lists real-time monitoring at every license level, graphing at Express and Enterprise, and capping at Enterprise only, and says Express ships by default on 600 and higher series rack servers such as the R720. History is lost when iDRAC restarts, per the [v2.20.20.20 guide](https://dl.dell.com/topicspdf/idrac7-8-with-lc-v2.20.20.20_users-guide_en-us.pdf). Dell's [data sheet](https://i.dell.com/sites/doccontent/business/large-business/en/Documents/22-Dell-PowerEdge-R720-1100W-E5-2640-Family-Data-Sheet.pdf) gives the accuracy as plus or minus 1% above 125 W, 1.25 W from 50 to 125 W, and 5 W below 50 W.
2. **Front LCD.** The View menu has a Power entry that shows watts or BTU/hr.
3. **Command line.** Remote ipmitool needs [IPMI](/blog/ipmi-remote-management) Over LAN enabled under Overview, iDRAC Settings, Network, and RACADM over SSH needs SSH enabled under Services on the same page. These use [ipmitool's Dell extension](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in) and RACADM:

   ```bash
   # Present draw in watts
   ipmitool -I lanplus -H IDRAC_IP -U USER -P 'PASSWORD' delloem powermonitor powerconsumption watt

   # Peak watts and a cumulative kWh counter
   ipmitool -I lanplus -H IDRAC_IP -U USER -P 'PASSWORD' delloem powermonitor

   # From an SSH session to iDRAC
   racadm getconfig -g cfgServerPower -o cfgServerActualPowerConsumption
   ```

   The second command prints lines such as `Reading : 1719.3 kWh` and `Peak Reading : 370 W` in the [PowerEdge-IPMItools README](https://github.com/White-Raven/PowerEdge-IPMItools), so kWh divided by hours gives your average draw. If a command returns nothing on Express, use the web interface or the LCD. The generic `ipmitool dcmi power reading` is not expected to work here; see What breaks.
4. **Plug-in meter.** A meter at the wall gives an independent check, and it is how to read standby power, which Dell does not publish for the R720; a [Dell moderator](https://www.dell.com/community/en/conversations/poweredge-hardware-general/typical-poweredge-power-consumption-when-in-standby-mode/647fa041f4ccf8a8de53f241) suggested third-party metering for that. With two supplies, meter both cords and add the readings. [Monitoring and Reducing Server Power Consumption](/blog/power-consumption-monitoring) covers meter limits and the watts-versus-volt-amps trap.

## How do you cut R720 power draw?

Start with the BIOS profile, then drives, fans and power supplies. The table runs from the largest saving the sources support to the smallest, and your own watts depend on your build.

| Change | What the sources show | Trade-off |
|---|---|---|
| Set Performance Per Watt (DAPC) with C States and C1E on | Up to two-thirds of idle draw from a Performance profile with C-states off (Dell lab) | Latency jitter in some loads |
| Spin down or remove unused drives, or use SSDs | 3.6 to 7.0 W per 3.5-inch drive moved from idle to standby | Capacity; spin-up delay |
| Thermal mode Minimum power, offset Default | 17 W swing from fan speed alone (one R730xd owner) | Hotter parts |
| Enable Hot Spare, or run one supply | About 11 W at 100 W load on 495 W supplies (Dell targets) | Little gain above 50% load; one supply has no redundancy |
| Turn Turbo Boost off | 80 to 84% of Turbo-on power under load in three Dell tests | Turbo gave 6 to 14% more performance |
| L-series CPUs, or remove the second CPU | 60 to 70 W TDP against 95 to 130 W; no measured idle figure found | Lower clocks; one CPU disables PCIe slots 1 to 4 |
| Cap power (Enterprise) | Lowers peak, not idle: idle stayed 111.6 to 111.9 W at every cap | Throttles CPUs under load |
| Fewer, larger low-voltage DIMMs; disable unused devices and USB | Dell lists both as savers; no R720 watt figure | Small effect, less room to grow |

## When does replacing an R720 make sense?

Replacement pays off only when a much smaller machine can carry the workload, because a newer server saves less than you might expect.

Dell's [R730 SPECpower result](https://www.spec.org/power_ssj2008/results/res2015q1/power_ssj2008-20150203-00686.html), with two E5-2699 v3 CPUs, 64 GB, one 750 W supply and one SSD, idled at 46.9 W against 52.7 W for the comparable R720 result, and drew 272 W against 250 W at full load while doing about 2.5 times the work. One owner who replaced an R720 and an R720xd with R730xd servers reported about 60 to 70 W less on the busy host (two CPUs down to one) and about 20 W less on the backup host (four more drives), and said the savings "will take a long time to make up the cost difference."

A small machine saves far more. [Apple lists](https://support.apple.com/en-us/103253) 4 W idle for the 2024 Mac mini with the M4 chip, and [ServeTheHome measured](https://www.servethehome.com/intel-core-i3-n305-and-n100-2-port-10g-2-port-2-5gbe-appliance/4/) 14 to 15 W at the wall for an N100 appliance with 10GbE ports and [7.4 to 8 W](https://www.servethehome.com/cwwk-crazy-a-small-6w-tdp-cpu-homelab-super-system/5/) for a smaller one. Replacing a 90 W idle with 4 W saves 86 x 8,760 / 1,000 = 753 kWh a year, or $138 at 18.31 cents and $253 at California's rate.

A $600 replacement (an assumed price) pays back in 4.3 years at the US average and 2.4 years in California. You give up iDRAC, hot-swap bays and 24 DIMM slots, so this suits light workloads only.

## What breaks

**Power capping is missing in iDRAC.** Dell's license table lists capping for iDRAC7 Enterprise only, and the R720 ships with Express. Fix: install an Enterprise license, or skip capping, since in Dell's lab a cap lowered peak power but left idle near 112 W.

**`ipmitool dcmi power reading` is not expected to work.** Dell's feature table lists DCMI 1.5 for iDRAC8 but not iDRAC7 at any license level. Fix: use `delloem powermonitor`, RACADM or the web interface.

**Idle is far above the 85 to 150 W band.** C-states and C1E may be off, drives may be spinning, or fans may be pinned. Fix: set Performance Per Watt (DAPC), confirm C States and C1E are on, then remove drives and cards one at a time while watching iDRAC.

**Hot Spare changes nothing, or a PDU shows warnings.** Both supplies wake above 50% load, and with supplies on separate circuits the sleeping side carries little current, which Dell says triggers warnings. Fix: judge it at idle, choose the primary supply on the circuit you want loaded, or turn Hot Spare off.

**A replacement supply triggers a mismatch.** Dell requires matching type and maximum output, and says identical supplies on different input voltages can also trigger one. Fix: replace only the supply with the flashing indicator, with a match for the other; Dell warns that swapping the working supply can cause an error and an unexpected shutdown.

**Fans run fast after adding a card or drive.** Dell says high-powered cards raise noise, and one Unraid poster reported firmware that floors fans at 2,000 rpm with any PCIe card or more than one SAS drive, and revisions that floor them at 4,000 rpm or 75% for some cards. Fix: set iDRAC Settings, Thermal to Minimum power with the offset at Default, check firmware revisions, and test with the card removed. [Dell R730 Quiet Fans](/blog/dell-r730-quiet-fans) covers the next generation.

## Frequently asked questions

### How many watts does a Dell R720 use at idle?

Expect 85 to 150 W for a typical two-CPU build with a few drives, matching Dell's 85.8 and 144.7 W and owner reports of 84 to 145 W. A stripped build with one supply and one SSD reached 51 to 54 W in SPEC's tuned runs, and a build full of drives and cards reached 263.7 W.

### What power supply does an R720 need?

The R720 accepts 495, 750 (Platinum or Titanium) and 1100 W AC supplies, plus an 1100 W DC unit. Dell's maximum ENERGY STAR build drew 409.5 W at full load, and a Dell moderator quoted a 605 W maximum from the regulatory datasheet, with no configuration stated. Choose the smallest supply that covers your measured peak with margin, since efficiency is lowest at light load, and install a matched pair.

### Is there an R720 power consumption calculator?

Dell's 12th-generation tool was the Energy Smart Solution Advisor, named in the technical guide. Its newer Enterprise Infrastructure Planning Tool may not model older servers: a [2017 forum reply](https://www.dell.com/community/PowerEdge-Hardware-General/Is-there-an-up-to-date-Dell-Capacity-Planner-or-similar/td-p/4742901) says it "does not include older servers." Build your own estimate: take idle watts from iDRAC, multiply by 8.76 for kWh per year, then by your rate.

### Can an R720 run on one power supply?

Yes. Dell's manual calls one installed supply non-redundant (1 + 0), and the SPEC runs used one. You lose protection against a supply or circuit failure, and the single supply must cover your peak load.

## What this means

A tuned, lightly loaded R720 settles around 85 to 150 W, roughly $135 to $240 a year at the US average price. Measure idle with iDRAC first, confirm the Performance Per Watt (DAPC) profile with C-states on, enable Hot Spare, and remove drives and cards you do not use. Replace the server only when the savings pay for the new machine within the time you will keep it. Size a UPS from the measured watts, as [How to Size a UPS for a Home Server Rack](/blog/ups-sizing-homelab) explains.

## References

- [SPECpower_ssj2008 result 00435, Dell PowerEdge R720 (E5-2670)](https://www.spec.org/power_ssj2008/results/res2012q1/power_ssj2008-20120306-00435.html)
- [SPECpower_ssj2008 result 00452, Dell PowerEdge R720 (E5-2660)](https://open.spec.org/power_ssj2008/results/res2012q2/power_ssj2008-20120417-00452.html)
- [SPECpower_ssj2008 result 00569, Dell PowerEdge R720 (E5-2660)](https://www.spec.org/power_ssj2008/results/res2012q4/power_ssj2008-20121030-00569.html)
- [SPECpower_ssj2008 result 00578, Dell PowerEdge R720 (E5-2660)](https://www.spec.org/power_ssj2008/results/res2012q4/power_ssj2008-20121113-00578.html)
- [SPECpower_ssj2008 result 00686, Dell PowerEdge R730 (E5-2699 v3)](https://www.spec.org/power_ssj2008/results/res2015q1/power_ssj2008-20150203-00686.html)
- [Dell ENERGY STAR Power and Performance Data Sheet, PowerEdge R720](https://i.dell.com/sites/doccontent/business/large-business/en/Documents/22-Dell-PowerEdge-R720-1100W-E5-2640-Family-Data-Sheet.pdf)
- [Dell: Comparing Power Efficiency of the Dell PowerEdge R720 and HP ProLiant DL380p Gen8](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/documents/comparing-dell-r720-and-hp-proliant-dl380p-gen8-servers.pdf)
- [Principled Technologies: Dell PowerEdge R720 power technologies](https://www.principledtechnologies.com/Dell/R720_power_0312.pdf)
- [Alphr: Dell PowerEdge R720 review](https://www.alphr.com/dell/31827/dell-poweredge-r720-review/)
- [Dell: PowerEdge R720 and R720xd Technical Guide](https://dl.dell.com/manuals/all-products/esuprt_ser_stor_net/esuprt_poweredge/poweredge-r720_reference-guide_en-us.pdf)
- [Dell: PowerEdge R720 and R720xd Owner's Manual](https://dl.dell.com/topicspdf/poweredge-r720_owners-manual_en-us.pdf)
- [Dell: iDRAC7 Version 1.50.50 User's Guide](https://dl.dell.com/topicspdf/integrated-dell-remote-access-cntrllr-7-v1.50.50_users-guide_en-us.pdf)
- [Dell: iDRAC8 and iDRAC7 Version 2.20.20.20 User's Guide](https://dl.dell.com/topicspdf/idrac7-8-with-lc-v2.20.20.20_users-guide_en-us.pdf)
- [Dell: iDRAC8 and iDRAC7 Version 2.20.20.20 RACADM Command Line Interface Reference Guide](https://dl.dell.com/topicspdf/idrac7-8-with-lc-v2.20.20.20_reference-guide_en-us.pdf)
- [Dell: BIOS Performance and Power Tuning Guidelines for 12th Generation Servers](https://downloads.dell.com/solutions/general-solution-resources/White%20Papers/12g_bios_tuning_for_performance_power.pdf)
- [Dell: Advanced Thermal Control, Optimizing across Environments and Power Goals](https://i.dell.com/sites/content/business/solutions/whitepapers/en/Documents/advanced-thermal-control.pdf)
- [Dell: Power Efficiency How To for the Dell PowerEdge Server Portfolio](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/power-efficiency-how-to-13g-servers_030216.pdf)
- [Dell Community: Is there an up-to-date Dell Capacity Planner or similar?](https://www.dell.com/community/PowerEdge-Hardware-General/Is-there-an-up-to-date-Dell-Capacity-Planner-or-similar/td-p/4742901)
- [Dell Community: Typical PowerEdge power consumption when in standby mode](https://www.dell.com/community/en/conversations/poweredge-hardware-general/typical-poweredge-power-consumption-when-in-standby-mode/647fa041f4ccf8a8de53f241)
- [EIA Electric Power Monthly, Table 5.3: Average Price of Electricity to Ultimate Customers](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_3)
- [EIA Electric Power Monthly, Table 5.6.A: Average Price of Electricity by State](https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a)
- [Intel: Thermal Design Power (TDP) in Intel Processors](https://www.intel.com/content/www/us/en/support/articles/000055611/processors.html)
- [Intel: Xeon Processor E5-2650L v2 specifications](https://www.intel.com/content/www/us/en/products/sku/75270/intel-xeon-processor-e52650l-v2-25m-cache-1-70-ghz/specifications.html)
- [Intel: Xeon Processor E5-2670 v2 specifications](https://www.intel.com/content/www/us/en/products/sku/75275/intel-xeon-processor-e52670-v2-25m-cache-2-50-ghz/specifications.html)
- [Intel: Xeon Processor E5-2690 v2 specifications](https://www.intel.com/content/www/us/en/products/sku/75279/intel-xeon-processor-e52690-v2-25m-cache-3-00-ghz/specifications.html)
- [Seagate: IronWolf Pro 3.5-inch HDD data sheet](https://www.seagate.com/www-content/product-content/ironwolf/files/ironwolf-pro-ds1914-3-1701gb.pdf)
- [U.S. Department of Energy: Improving Motor and Drive System Performance, a Sourcebook for Industry](https://www1.eere.energy.gov/manufacturing/tech_assistance/pdfs/motor.pdf)
- [Apple: Mac mini power consumption and thermal output (BTU) information](https://support.apple.com/en-us/103253)
- [ServeTheHome: Intel Core i3-N305 and N100 2-port 10G 2-port 2.5GbE Appliance](https://www.servethehome.com/intel-core-i3-n305-and-n100-2-port-10g-2-port-2-5gbe-appliance/4/)
- [ServeTheHome: CWWK Crazy, a Small 6W TDP CPU Homelab Super System](https://www.servethehome.com/cwwk-crazy-a-small-6w-tdp-cpu-homelab-super-system/5/)
- [ServeTheHome forums: Dell R730 vs R720 power usage](https://forums.servethehome.com/index.php?threads/dell-r730-vs-r720-power-usage.31985/)
- [Unraid forums: Taming a 12th gen Dell PowerEdge](https://forums.unraid.net/topic/51733-taming-a-12th-gen-dell-poweredge/)
- [Dan Langille: Dell R720, reducing power consumption](https://dan.langille.org/2019/10/12/dell-r720-reducing-power-consumption/)
- [ipmitool manual page source (GitHub)](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [PowerEdge-IPMItools README (GitHub)](https://github.com/White-Raven/PowerEdge-IPMItools)
