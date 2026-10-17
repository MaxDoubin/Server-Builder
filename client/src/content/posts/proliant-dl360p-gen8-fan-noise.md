
## The problem

A used HP ProLiant DL360p Gen8 with loud fans at idle does not always have a heat problem. HPE firmware notes and owner reports point to causes that have nothing to do with the room: a drive or PCIe card that iLO 4 cannot read, a firmware bug, or a missing fan blank. You need to know what iLO is reacting to, where to see it, and which changes bring the fans back down.

## How the DL360p Gen8 decides fan speed

On this server, the iLO 4 firmware and hardware control the fans. The [HPE iLO 4 2.81 User Guide](https://pcserverandparts.com/content/Spec%20Sheets/Servers/HP/HP%20Proliant%20DL360%20G9/HPE%20iLO%204%202.81%20User%20Guide.pdf) says the fans "react to the temperatures monitored throughout the system," increasing speed to provide more cooling and decreasing it when cooling is sufficient. Each temperature sensor has a Caution and a Critical threshold. If a reading passes Caution, iLO raises the fans to maximum, and if it stays above Caution for 60 seconds, iLO attempts a graceful shutdown. When a fan fails, iLO may also speed up the remaining fans.

The chassis holds up to eight hot-plug fan modules. [HPE's QuickSpecs](https://support.hpe.com/hpesc/public/api/document/c04128242) say 1-processor models ship with 6 fan modules and 2-processor models with 8. One rotor failure puts the server in degraded mode, and two rotor failures "could provide warning and imminent server shutdown." [Scan lists a refurbished dual-rotor, hot-pluggable fan](https://www.scan.co.uk/products/hp-667882-001-proliant-dl360p-gen8-fan-dual-rotor-hot-pluggable-refurbished) as HP part 667882-001 and marks it no longer available. The [DL360p Gen8 user guide](https://pcserverandparts.com/content/Spec%20Sheets/Servers/HP/HP%20Proliant%20DL360P%20G8/HPE%20Proliant%20DL360p%20Gen8%20Server%20User%20Guide.pdf) sets a rule to check on any used server: install fans 1 and 2 only when processor 2 is installed, and keep fan blanks in bays 1 and 2 on a single-processor machine.

A correctly configured unit still makes noise. HPE declares these bystander sound pressure levels at 23°C ambient:

| Configuration | Tested hardware (HPE) | Idle | Operating |
|---|---|---|---|
| Entry | One E5-2609, one 500GB SAS drive | 33 dBA | 35 dBA |
| Base | One E5-2640, four 500GB SAS drives | 33 dBA | 39 dBA |
| Performance | Two E5-2660, eight 500GB SAS drives | 34 dBA | 42 dBA |

The QuickSpecs also say these levels "do not account for non-Hewlett-Packard installed hardware." A 2012 [IT Pro review](https://www.itpro.com/641473/hp-proliant-dl360p-gen8-server-review/3) of a dual E5-2650 unit measured 92W at idle and 220W under full load, and the reviewer could hear iLO 4 adjusting fan speed as processor load changed. Because iLO raises fan speed for more cooling and lowers it when cooling is sufficient, a fan speed that stays high and flat at idle points to something iLO is reacting to.

## Reading fans and temperatures in iLO 4

In the iLO 4 web interface, open Information, then System Information, then the Fans tab. Each fan shows its location, health status and speed in percent. On servers with fan redundancy, empty bays are hidden until you click "show empty bays," which shows whether bays 1 and 2 are empty on a one-processor machine.

The Temperatures tab on the same screen is the next place to look. Each sensor lists its location, status, reading, and Caution and Critical thresholds. A sensor that is not installed reads N/A, and missing sensors stay hidden until you click "show missing sensors." If a sensor is above Caution, the heat is real and iLO sends the fans to maximum. If every reading sits well below its threshold, look at the drives and cards instead. HPE's Smart Array notes list fixes both for SATA drive temperatures not being reported after a hot insert and for system fans going to 100% when connected drives spun down.

To query iLO from another machine, use [IPMI](/blog/ipmi-remote-management). The iLO 4 guide says IPMI/DCMI over LAN is disabled by default in iLO 4 2.60 and later, and that the port defaults to 623. Its ipmitool example uses the lanplus interface to pull the iLO event log:

```
ipmitool -I lanplus -H <ilo-address> -U <user> -P <password> sel list
```

Correct output is a numbered list of event entries, such as "Power Supply #0x03 | Presence detected | Deasserted" in the guide's sample. Live fan percentages come from the Fans tab.

## What pushes the fans up

Owners report the first three triggers on sibling Gen8 servers that run the same iLO 4. HPE documents the last two in its own notes, one of them as a firmware bug that includes the DL360p Gen8 SE.

| Trigger | Server | Reported fan speed | Source |
|---|---|---|---|
| 1070 graphics card in the x16 slot | DL360e Gen8 | About 45% on the fans nearest the slot | [Level1Techs owner](https://forum.level1techs.com/t/hp-dl360e-g8-gpu/142452) |
| 560SFP+ 10GbE NIC | DL380 Gen8 | 20% rising to 45% | [Proxmox forum owner](https://forum.proxmox.com/goto/post?id=463010) |
| LSI HBA added | ML350 Gen8 | 6% rising to a 27% minimum | [TrueNAS forum owner](https://www.truenas.com/community/goto/post?id=546516) |
| Broadcom NIC firmware 4.0.1.17 (Windows) | DL360p Gen8 SE and others | "Excessively high fan speed" | [HPE advisory c05098585](https://support.hpe.com/hpesc/public/api/document/c05098585) |
| Connected drives spun down | Gen8 with Smart Array P420i | "System fans might go to 100%" | [SPP Gen8 component notes](https://downloads.hpe.com/pub/softlib2/software1/publishable-catalog/p1635959075/v138587/SPP_Gen8.1_Component_Notes.pdf) |

### Drives iLO cannot read

HPE's own firmware notes tie drives to fan speed. The [SPP Gen8 component notes](https://downloads.hpe.com/pub/softlib2/software1/publishable-catalog/p1635959075/v138587/SPP_Gen8.1_Component_Notes.pdf) list Smart Array P420i firmware 8.00 fixes for "System fans might go to 100% if connected drives were spun down" and for SATA drive temperatures not being reported after a hot insert.

An owner reports the same pattern on a DL360e Gen8. The [Level1Techs poster](https://forum.level1techs.com/t/hp-dl360e-g8-gpu/142452) ran an SSD from the onboard SATA chipset and attached an old 2.5-inch hard drive to the P420 controller "just to get the thing to see an HDD temperature to lower the fans from 30% to 18%." To see what a drive reports about itself, read its [SMART data](/blog/smart-data-drive-failure).

### PCIe cards

HP's own documentation singles out some cards. The [HP ROM-Based Setup Utility User Guide](https://www.manualsdir.com/manuals/393253/hp-proliant-bl465c-server-blade-proliant-dl380-server.html?page=123) recommends Increased Cooling "when a 10GbE NIC Card or I/O Accelerator is installed." The Level1Techs owner who installed the graphics card saw the fans nearest the x16 slot at about 45% and attributed it to "the unknown PCIe device."

[ComputingForgeeks](https://computingforgeeks.com/idrac-ilo-fan-power-tuning/) notes that iLO 4 "exposes no supported way to set a fan speed," and the [Silence of the Fans README](https://github.com/kendallgoto/ilo4_unlock) names preventing fans from maxing out when a non-HPE certified PCI-e card is used as a common reason to patch the firmware. Dell is different: it documents an [OEM IPMI command](https://dell.com/support/kbdoc/en-ca/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers) that disables the third-party card response on 13th-generation PowerEdge servers such as the [R730](/blog/dell-r730-quiet-fans).

### Firmware bugs HPE fixed

HPE advisory [c05098585](https://support.hpe.com/hpesc/public/api/document/c05098585) says "excessively high fan speed may be observed" on several Gen8 and Gen9 servers, including the DL360p Gen8 SE and DL380p Gen8, after updating Broadcom 1Gb adapter firmware with version 4.0.1.17 of the NX1 utility for Windows. HPE says the issue has only been observed in Windows. The affected list includes the 331FLR, which the QuickSpecs list as the FlexibleLOM on many DL360p models. The fix is version 5.0.0.7 (B) of the utility.

### Missing blanks and thermal limits

The user guide warns: "To prevent improper cooling and thermal damage, do not operate the server unless all bays are populated with either a component or a blank." It also allows only one of these at a time because of thermal limitations: the 10 SFF drive cage, LRDIMMs, or an E5-2687W processor. A used server that combines them is outside that limit.

## Fixes to try, in order

Work from the cheapest change to the most invasive, and watch the Fans tab after each step.

1. **Fix fan population and blanks.** Fan blanks in bays 1 and 2 with one processor, all eight fans with two, and a drive or blank in every bay.
2. **Check Thermal Configuration.** Press F9 at boot to enter RBSU, then open Thermal Configuration, which the RBSU guide lists under its Advanced Options menu. Optimal Cooling is the default and configures fan speeds "to the minimum required to provide adequate cooling." Increased Cooling operates fans at higher speeds, and Maximum Cooling provides the maximum cooling the platform offers, so set a loud server back to Optimal Cooling.
3. **Update the Smart Array firmware.** The SPP Gen8 notes list P420i firmware 8.00 for the drive and fan fixes above, and DL360p Gen8 System ROM P71 version 2015.07.01. A [reseller's 2026 summary](https://pcserverandparts.com/news/hpe-proliant-generations-explained-2026/) gives iLO 4 2.82, dated March 2, 2023, as the last iLO 4 release, so there is no newer iLO to wait for.
4. **Give iLO a drive it can read.** If the fans settle only after a drive is attached to the Smart Array controller, as in the Level1Techs report, a missing drive temperature was the trigger.
5. **Isolate PCIe cards.** Remove the card and compare. If the fans drop, the card is the trigger, and your choices are a different card or the modified firmware below.

## Modified iLO 4 firmware with a fan command

The [Silence of the Fans](https://github.com/kendallgoto/ilo4_unlock) project patches iLO 4 firmware to add SSH commands, including `fan`, so you can cap individual fans. Its README says v2.77 "is the most recent iLO that has a working patch" because HP removed many of the control utilities that make patching v2.78 and v2.79 useful. Running it means staying on 2.77 rather than moving to a later release such as 2.82. The author tested only a DL380p Gen8 and a DL380e Gen8.

The separate [HP-ILO-Fan-Control](https://github.com/That-Guy-Jack/HP-ILO-Fan-Control) project uses a custom iLO 4 ROM to set a simple fan curve. Its README lists the DL360p Gen8 under tested servers, says the author runs iLO 4 2.60 while working toward 2.77, and recommends adding a small 40mm fan to the [RAID](/blog/raid-levels-comparison) controller on the DL360.

Flashing needs the iLO 4 security override. The Silence of the Fans README describes it as flipping the first DIP switch on the board, and on the DL360p the user guide lists system maintenance switch S1 as iLO security: "On = HP iLO security is disabled." The README flashes from a bare-metal Linux boot, not the web interface, with the patched firmware renamed ilo4_250.bin on a USB key:

```
sudo modprobe -r hpilo
sudo ./flash_ilo4 --direct
```

The README warns that the flash "will be loud" and says to resist the urge to unplug the server. ComputingForgeeks describes a cap such as `fan p 4 max 90` on a 0 to 255 scale. The README also warns that a failed flash cannot be recovered on the board: the iLO flash chip "must be fully desoldered and reprogrammed." If that risk is too high, [how to evaluate used enterprise gear](/blog/buying-used-enterprise-gear) is the place to start for a quieter replacement.

## What breaks

**IPMI queries fail against a working iLO.** iLO 4 2.60 and later ship with IPMI/DCMI over LAN disabled, and the iLO guide says server-side IPMI applications keep working while it is off. Fix: enable IPMI/DCMI over LAN Access in iLO's access settings and query port 623, the default.

**Fans drop after an iLO reset, then climb back.** An [Unraid owner](https://forums.unraid.net/topic/91750-hp-dl360-fan-noise/) with two DL360 Gen8 servers saw fans fall to "30ish %" at the points where iLO had been reset, then ramp toward 95% again. The owner scripted a reset every five minutes for an average of 45% instead of 95%, called it a workaround, and had not found the cause. Fix: find the trigger with the Temperatures tab and the drive and card checks above instead of looping resets.

**Fans go to 100% when drives spin down.** HPE lists this as fixed in Smart Array P420i firmware 8.00. Fix: update the P420i to the 8.00 firmware from the SPP, then watch the Fans tab after the drives go idle.

**Fans stay high after a Broadcom NIC firmware update on Windows.** The advisory ties "excessively high fan speed" to NX1 utility version 4.0.1.17. Fix: update the adapter firmware again with version 5.0.0.7 (B) of the utility.

**Wrong fan population for the processor count.** The user guide says "all fans must be installed in a dual processor configuration" to avoid thermal shutdown, and blanks belong in bays 1 and 2 with one processor. Fix: match fans to processors, then confirm with "show empty bays."

**A patched iLO flash fails partway.** The README says the iLO cannot recover itself from a corrupted flash. Fix: build the 2.77 patch, flash it from a bare-metal Linux boot, leave the server powered until the fans spin down, and only do it on a server you can afford to lose iLO on.

## What this means

The documented and reported causes of a loud DL360p Gen8 are mostly configuration or firmware, not heat. Check fan bays and blanks, confirm Optimal Cooling, update the Smart Array firmware, and give iLO a drive it can read. If a third-party card is the only remaining trigger, iLO 4 offers no supported way to set a fan speed, so the remaining choice is modified firmware that carries real risk.

## References

- https://support.hpe.com/hpesc/public/api/document/c04128242
- https://pcserverandparts.com/content/Spec%20Sheets/Servers/HP/HP%20Proliant%20DL360P%20G8/HPE%20Proliant%20DL360p%20Gen8%20Server%20User%20Guide.pdf
- https://pcserverandparts.com/content/Spec%20Sheets/Servers/HP/HP%20Proliant%20DL360%20G9/HPE%20iLO%204%202.81%20User%20Guide.pdf
- https://www.manualsdir.com/manuals/393253/hp-proliant-bl465c-server-blade-proliant-dl380-server.html?page=123
- https://downloads.hpe.com/pub/softlib2/software1/publishable-catalog/p1635959075/v138587/SPP_Gen8.1_Component_Notes.pdf
- https://support.hpe.com/hpesc/public/api/document/c05098585
- https://www.itpro.com/641473/hp-proliant-dl360p-gen8-server-review/3
- https://github.com/kendallgoto/ilo4_unlock
- https://github.com/That-Guy-Jack/HP-ILO-Fan-Control
- https://computingforgeeks.com/idrac-ilo-fan-power-tuning/
- https://pcserverandparts.com/news/hpe-proliant-generations-explained-2026/
- https://forum.level1techs.com/t/hp-dl360e-g8-gpu/142452
- https://forum.proxmox.com/goto/post?id=463010
- https://www.truenas.com/community/goto/post?id=546516
- https://forums.unraid.net/topic/91750-hp-dl360-fan-noise/
- https://dell.com/support/kbdoc/en-ca/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers
- https://www.scan.co.uk/products/hp-667882-001-proliant-dl360p-gen8-fan-dual-rotor-hot-pluggable-refurbished
