
## The problem

Someone with an LSI or Broadcom 9300-8i in a desktop tower or a quiet server case sees read errors, reboots, or a heat sink that seems too hot to touch. They need to know whether heat is the cause and which fan to add. The card has no fan of its own, so the answer depends on how much air moves across its heat sink.

## Why the 9300-8i runs hot without a fan

The 9300-8i is built on the SAS 3008 I/O controller and has eight internal 12 Gb/s ports on a PCIe 3.0 x8 interface, according to a [Scan UK listing](https://www.scan.co.uk/products/8-port-broadcom-sas-9300-8i-single-internal-12gb-s-sataplussas-pcie-30-hba). A [Thomas-Krenn wiki table](https://www.thomas-krenn.com/de/wiki/Broadcom_SAS_9300_HBAs) lists the 9300-8i with eight internal ports and no external ports. A [Starline listing](https://www.starline.de/en/products/broadcom-lsi-sas-9300-8i) gives "Active cooling" as "No." A [DatacenterDisk guide](https://datacenterdisk.com/server-parts/hba/lsi-9300-8i) adds that these cards "were designed for rack chassis with substantial front-to-back airflow, and their heatsinks are passive." For how rack airflow is arranged, see [hot and cold aisle containment](/blog/hot-cold-aisle-containment).

Broadcom's [user guide for the 9300-8e](https://docs.broadcom.com/doc/12354878), version 1.3 dated March 2015, describes the same SAS 3008 controller in its external-port form, with eight external 12 Gb/s SATA and SAS ports. It lists a nominal draw of 14.5 W and a worst case of 22.5 W. Broadcom's [SAS 9206-16e note](https://docs.broadcom.com/doc/12348578), dated November 2013, covers an earlier LSI card. It says the card's heat sinks are there "to dissipate a portion of the heat; however, adequate airflow is also required." The same note explains that the velocity and direction of the air moving around a heat sink set how much heat it removes, so a passive heat sink's temperature depends on the air moving past its fins.

## What airflow the vendor specifies

The 9300-8e guide lists a temperature range of "0 °C to 55 °C (32 °F to 131 °F) (dry bulb)" and a "Minimum airflow: 200 linear feet per minute at 55 °C inlet temperature." Its storage and transit range is -45 °C to +105 °C. Those figures are for the external 9300-8e, so confirm them against documentation for your 9300-8i before you rely on them.

The 9206-16e note explains how the airflow figure is measured. Airflow "is measured in linear feet per minute (LFM) at the heat-sink surface," and the minimum rises as the inlet air warms: 100 LFM at 35 °C, 150 LFM at 45 °C and 200 LFM at 55 °C bay inlet temperature. The same note says "LSI specifies airflow limits in ideal conditions," so real cases may need more air than those minimums.

The same note sets a heat sink ceiling of 110 °C: "The measured heat sink temperature on either heat sink should not exceed 110 °C (230 °F)." That ceiling belongs to the 9206-16e, not the 9300-8i.

## How to check the heat sink without a sensor on the card

Broadcom's method measures two temperatures with the system running its intended maximum workload: the inlet air and the heat sink. The inlet air is "the temperature of the air outside of where the LSI SAS 9206-16e HBA is enclosed." For the heat sink, use an infrared thermometer to measure "the hottest point in the center of the heat sink," or a thermocouple at "the base of the heat sink (between the fins)." The note explains why the heat sink reading matters: "the heat-sink temperature is the best indicator of the temperature inside the chip, mounted to the heat sink." It also says "Most systems require the top cover be in place for proper airflow," so take the readings with the case closed.

<figure>
<img src="/images/blog/lsi-9300-8i-cooling/photo-1.jpg" alt="Handheld infrared thermometer aimed at a hot stovetop, its display reading about 232 degrees Celsius" width="1136" height="1400" loading="lazy" decoding="async">
<figcaption>A handheld infrared thermometer reading a hot stovetop at about 232 °C, with the red dot from its positioning laser on the surface, photographed in 2020. Broadcom's method uses this kind of tool, aimed at the hottest point in the center of the heat sink. Photo: ECTran71, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:IR_thermometer_measuring_stove_temperature.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Do not count on a readout from the card itself. In an [Unraid forum thread about a 9300-16i](https://forums.unraid.net/topic/155951-parse-temperature-of-hba-9300-16i-lsi-sas3008-controller/), a moderator wrote, "AFAIK they don't have a readable temp sensor." A poster who tried storcli64 to read the controller temperature got "cannot execute binary file: Exec format error," and the thread does not show a confirmed fix.

## What overheating looks like in a desktop or quiet chassis

Broadcom's 9206-16e note lists the consequences: "Failure to maintain correct operating conditions (for example, allowing the device to overheat) can cause errors, degrade performance, shorten device lifetime, or damage parts." Owner reports fit that pattern, though few of them tie a symptom to a measured heat sink temperature.

- In a [TrueNAS forum thread from March 28, 2020](https://www.truenas.com/community/threads/upgrade-cooling-on-lsi-9207-8i.83447/), an owner of a 9207-8i suspected the card was overheating after an overnight database workload. The pool's zpool status shows nonzero READ counts on all six disks, each marked "too many errors." The owner had no thermocouple or FLIR camera to check the heat sink.
- In a [TrueNAS thread about cooling a Dell PERC H310](https://www.truenas.com/community/threads/cooling-for-a-dell-perc-h310.61941/post-446537), one member wrote that many LSI chips "are known to become problematic once they're reporting as 90+'C." In the same thread, another post says the [RAID](/blog/raid-levels-comparison) chip "often runs much hotter, as reported by its onboard sensor," and that one card was "reporting 70'C-85'C."
- A [June 2020 Unraid thread about a 9305-24i](https://forums.unraid.net/topic/93331-sas-9305-24i-overheating/) describes reboots: "This causes the system to keep rebooting." The poster added a small fan to the card, and the card still overheated, with the same result after the fans were reversed to the other side of the motherboard section. A member replied that "slapping fans on the heatsink should have solved it no problem" if heat were the cause, and a later reply suggested a flaky power supply.

The inlet air definition matters in a tower. Broadcom's note treats a datacenter's inlet air as the rack's cold aisle temperature. A tower has no cold aisle, so the card's inlet air is whatever the case delivers to its slot.

## Where a fan goes and what owners used

Owners have tried four placements, with these reports.

<figure>
<img src="/images/blog/lsi-9300-8i-cooling/photo-2.jpg" alt="Square Papst 512 F/2 computer cooling fan, 50 by 50 by 15 mm, with its product label visible on the hub" width="1400" height="1400" loading="lazy" decoding="async">
<figcaption>A Papst 512 F/2, a 12 V computer cooling fan measuring 50 by 50 by 15 mm, photographed in 2016. A fan this size matches the roughly 50 mm square OEM LSI cooler that a Level1Techs poster measured. Photo: © Raimond Spekking, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Papst_computer_cooling_fan_512_F-2-2419.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Placement | Air source | If the fan stops | Owner report |
|---|---|---|---|
| Fan on top of the heat sink | The fan | Blocks the card's air path | A TrueNAS member warned that the fan "acts as a huge insulator" because airflow is blocked |
| Fan over the card, blowing down the fins | The fan and chassis airflow | Chassis airflow still passes | A TrueNAS member described another owner's setup like this |
| 80 mm fan in a PCI slot, with room left to the card | The fan and a 140 mm intake fan | Not stated | On a PERC H310, idle RAID chip readings were 46 to 50 °C before the fan and 33 to 35 °C with it |
| Air shroud from the last chassis fan | Existing chassis fan | Shroud still carries chassis air | On a 1U LSI 9271-4i, idle dropped from 62 °C to 46 °C |

The PERC H310 figures and the shroud figure both come from the same [TrueNAS thread](https://www.truenas.com/community/threads/cooling-for-a-dell-perc-h310.61941/post-446537). The shroud result is from a different card, a 1U LSI 9271-4i, so treat it as one owner's report.

Noctua's NF-A4x10 is a 40 mm fan (40x40x10 mm), rated at 12 V and 4500 RPM, plus or minus 10 percent. Per a [QuietPC listing](https://www.quietpc.com/nf-a4x10), its maximum input is 0.6 W, and it is rated for 4.8 CFM of airflow, 1.78 mm H2O of static pressure and 17.9 dB(A) of noise. With its low-noise adapter the same listing gives 3700 RPM, 3.9 CFM, 1.21 mm H2O and 12.9 dB(A).

Owners disagree on fan size. A TrueNAS moderator suggested the Noctua NF-A4x20 FLX along with monitoring, writing "There's a fairly good solution to the 40 mm fan problem: Monitor it." Another member wrote that typical 40 mm fans are "designed just for air movement, not designed for high static pressure," and suggested that two 60 mm fans might be worth considering.

Heat sink sizes vary by card. A [Level1Techs post from September 2025](https://forum.level1techs.com/t/small-projects-and-updates/237209) says the OEM LSI cooler "almost exactly measures to 50mm Square," and that an Inspur-branded 9300-8i "has a different cooler." On that card the fan is a Silverstone FTF 5010, and the poster found "barely enough space to fit a zip tie beneath to mount the fan atop."

On a [FreeBSD forum thread](https://forums.freebsd.org/threads/mounting-a-fan-on-an-lsi-sas-sata-card-heatsink.71854/), a poster mounted a 40x40x15 mm fan on a reflashed LSI 9220-8i with #4 pan-head sheet-metal screws. The same poster described a new 9207-8i heat sink as 44x44x15 mm. Measure your own card before you buy a bracket. Owners also advised monitoring the fan: one member recommended connecting it to the motherboard headers, and a moderator said to monitor it.

## What breaks

- **Air never reaches the fins.** The card is passive and was designed for rack chassis with substantial front-to-back airflow, so a crowded slot in a quiet case can leave the heat sink with little air moving over it. Fix: Measure the heat sink under the intended maximum workload. If it runs hot, add a fan that blows along the fins, or an air shroud fed by an existing chassis fan.
- **A dead fan on the heat sink blocks the card.** A fan sitting on top of the heat sink cuts off the air path when it stops. A TrueNAS member warned that such a fan "acts as a huge insulator" because airflow is blocked. Fix: Mount the fan so chassis air still passes when it stops, and connect it to a motherboard header so a stopped fan shows up in monitoring.
- **READ errors across a whole pool.** One owner's 9207-8i pool showed READ errors on all six disks after an overnight database workload, and the owner suspected the card. Fix: Measure the heat sink under that same workload, and check each drive with SMART ([reading SMART data](/blog/smart-data-drive-failure)) before replacing any disk.
- **Reboots blamed on heat.** On the 9305-24i thread, a small fan on the card did not stop the overheating, and a reply suggested a flaky power supply instead. Fix: Test the power supply and check the system's event logs before you blame heat.
- **Waiting for a readout the card may not provide.** A moderator in the 9300-16i thread wrote, "AFAIK they don't have a readable temp sensor." Fix: Use an infrared thermometer or thermocouple on the heat sink, as Broadcom's note describes, and log the reading with the inlet air temperature.

## What this means

For a 9300-8i in a desktop or quiet case, test before you cool. Run the intended maximum workload with the cover on, record the inlet air, and measure the heat sink with an infrared thermometer or thermocouple. Broadcom's 9206-16e note sets a heat sink ceiling of 110 °C. Until you have figures for the 9300-8i itself, use that number as the reference point. If the heat sink runs high, or read errors appear under load, add a fan over the card that blows down the fins, wire it to a motherboard header, and measure again.

The fan adds little load. The NF-A4x10's 0.6 W maximum is about 4 percent of the 14.5 W nominal draw in Broadcom's 9300-8e guide, which uses the same controller. Its noise rating is 17.9 dB(A), and the 12.9 dB(A) figure with the low-noise adapter is the one to compare against a quiet build.

## References

- https://docs.broadcom.com/doc/12354878
- https://docs.broadcom.com/doc/12348578
- https://www.starline.de/en/products/broadcom-lsi-sas-9300-8i
- https://www.scan.co.uk/products/8-port-broadcom-sas-9300-8i-single-internal-12gb-s-sataplussas-pcie-30-hba
- https://datacenterdisk.com/server-parts/hba/lsi-9300-8i
- https://www.thomas-krenn.com/de/wiki/Broadcom_SAS_9300_HBAs
- https://www.truenas.com/community/threads/cooling-for-a-dell-perc-h310.61941/post-446537
- https://www.truenas.com/community/threads/upgrade-cooling-on-lsi-9207-8i.83447/
- https://forums.unraid.net/topic/93331-sas-9305-24i-overheating/
- https://forums.unraid.net/topic/155951-parse-temperature-of-hba-9300-16i-lsi-sas3008-controller/
- https://forum.level1techs.com/t/small-projects-and-updates/237209
- https://forums.freebsd.org/threads/mounting-a-fan-on-an-lsi-sas-sata-card-heatsink.71854/
- https://www.quietpc.com/nf-a4x10
