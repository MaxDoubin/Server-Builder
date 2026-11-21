## The short answer

A SATA hard drive that never spins up, never appears in the BIOS and logs no error is often healthy. It is being held in reset by 3.3 V on pin 3 of its power connector. The SATA specification calls that contact P3. Drives built with the optional Power Disable feature from SATA 3.3, abbreviated PWDIS, treat P3 as a control input and not as a power pin. [Western Digital's Ultrastar manuals](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc550-sata-oem-spec.pdf) say that driving P3 high, 2.1 to 3.6 V, disables power to the drive circuitry, and WD's [Power Disable tech brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/tech-brief/tech-brief-western-digital-power-disable-pin.pdf) says some legacy supplies tie pins 1, 2 and 3 together to 3.3 V. The drive is not damaged. The fix is to keep 3.3 V off pin 3 with a Molex-to-SATA adapter, Kapton tape, a power cable with no 3.3 V wire, or a backplane that leaves the pin unpowered. Only some drives have the feature: WD sells it under separate part numbers on the Ultrastar DC HC510 and HC520, marks it in the model number on the [HC555](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc555-sata.pdf), and owners report the same behavior on [shucked white-label WD80EMAZ drives](https://forums.unraid.net/topic/62334-wd-8tb-easy-store-shucked-red-drives-not-recognized/).

## Why does a new drive not spin up on some power supplies and backplanes?

The drive reads 3.3 V on pin 3 as an instruction to stay off. WD's [tech brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/tech-brief/tech-brief-western-digital-power-disable-pin.pdf) says that a new SATA drive with the feature in a legacy chassis or enclosure "may not spin up," that the drive "is not defective," and that 3.3 V on pin 3 "forces the HDD to get stuck in a hard reset condition." Its FAQ gives the symptom in one line: "The HDD will not spin up / power up." There is no error to read because the drive's controller never gets power.

Owner reports fit. In a [December 2017 Unraid thread](https://forums.unraid.net/topic/62334-wd-8tb-easy-store-shucked-red-drives-not-recognized/), two shucked WD80EMAZ 8 TB drives were not recognized on the motherboard ports, a Marvell 9215 card or an ASM1062 card, and a Molex-to-SATA power adapter fixed it. The signal arrives on the power connector, so the data port never mattered. In a [November 2021 thread](https://forums.unraid.net/topic/116299-plz-help-two-wd-drives-wont-spin-up-in-icy-dock-drive-cage), two shucked WD drives spun up behind a USB controller but not in ICY DOCK 5-in-3 cages, and the poster later wrote, "I just applied the 3.3V fix and they both now spin up." A drive that runs over USB and stays silent on internal SATA power is the usual signature.

| | Power source puts 3.3 V on pin 3 (legacy) | Power source leaves pin 3 low or open |
|---|---|---|
| Drive without Power Disable | Spins up | Spins up and ignores any reset request |
| Drive with Power Disable | Held in hard reset, no spin-up | Spins up; a host that drives the pin can power-cycle it |

The same brief covers every cell. You "can safely plug an HDD either with or without the feature into a new or legacy system," and if the legacy system powers P3, "the only side effect is that the HDD will not spin up." A drive without the feature in a new chassis "will just ignore the Hard Reset request and remain powered up." WD is direct about why it wrote the brief: "We don't want customers returning drives that they believe are defective when the problem is with the legacy chassis."

## What does SATA pin P3 do, and what changed in the specification?

P3 was a 3.3 V power contact, then a low-power control signal, then optionally a power-off switch. A SATA power plug has 15 contacts. In the pin table of [SATA-IO's TPR056 proposal](https://sata-io.org/sites/default/files/TPR056r13_SATA32_EnableNewPowerDisableFeatureOnStandardSATA.pdf), P4 to P6, P10 and P12 are ground, P7 to P9 are 5 V, P13 to P15 are 12 V, and P11 carries the activity and staggered spin-up signal. P1 is listed first after the gap between the signal and power segments, so P1 to P3 are the three power contacts nearest the data connector.

| Specification | P1 and P2 | P3 | Source |
|---|---|---|---|
| SATA 3.1 and earlier | 3.3 V | 3.3 V, bused with P1 and P2 on the drive | TPR056 footnote; [WD HC555 manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc555-sata.pdf) |
| SATA 3.2 | Retired | DEVSLP (Device Sleep) signal | TPR056 |
| SATA 3.3 | Retired; tying them together is recommended for legacy use | PWDIS or DEVSLP, never both | TPR056 |

The 3.3 V contacts were nearly unused before the change. A 2011 SATA-IO proposal, [TP037](https://sata-io.org/sites/default/files/TP_037_SATA_TechProp_C110v1_1.pdf), said industry use of those pins for their intended purpose "is limited to a small number of receptacles and Gen I devices." Toshiba's [MG08-D manual](https://toshiba.semicon-storage.com/content/dam/toshiba-ss-v2/master/en/storage/product/data-center-enterprise/eHDD-MG08-D_Product-Manual_r0.pdf) states the drive side plainly: "This drive uses 5 V and 12 V power. 3.3 V power is not used."

Power Disable came from SAS. The TPR056 introduction says Seagate introduced it in T10, the SCSI standards committee, so an initiator or expander can disable power to a device, and that SATA needed it too because many high-capacity SATA drives sit in SAS backplanes. WD's brief says SAS-3 redefined pin 3 from "3.3V Power" to "POWER DISABLE" after the SCSI Trade Association "determined that there were no conflicting legacy concerns," and gives the SATA 3.3 publication date as 2/2/2016. SATA had the legacy problem SAS lacked: "Some legacy SATA power supplies tied P1 (Pin 1), P2 (Pin 2) and P3 (Pin 3) together to 3.3V."

The final SATA 3.3 text is not freely available. The numbers below come from the TPR056 draft, revision 13, which WD's [HC310 manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc300-series/product-manual-ultrastar-dc-hc310-sata-oem-spec.pdf) lists as a reference. WD's manuals quote the same 2.1 to 3.6 V range.

| P3 level at the drive connector | Volts | What the drive does |
|---|---|---|
| Negated, power enabled | -0.5 to 0.7 | Powers up; after a release from the asserted state it performs a power-on reset |
| Asserted, power disabled | 2.1 to 3.6 | Removes power from its circuitry |
| A 3.3 V supply rail at 5 percent tolerance | about 3.14 to 3.47 | Sits inside the asserted window |
| Not connected | n/a | Must be allowed to power up |

The first, second and fourth rows are from TPR056's signal table, which also requires a host that uses the feature to drive the pin actively in both directions. The third row is the standard 5 percent tolerance on the ATX 3.3 V rail, described in [Intel's ATX Version 3 design guide](https://cdrdv2-public.intel.com/336521/336521_Rev2p1a.pdf). The whole range of an in-tolerance supply falls inside the asserted window, so no healthy 3.3 V rail releases the drive. If a multimeter shows about 3.3 V between the third contact and a ground contact on a cable plug, a Power Disable drive on that plug will stay off. DevSleep uses the same pin and the same asserted level, which is why the draft makes the two features mutually exclusive.

## Which drives have Power Disable, and how do you tell?

Only drives built for it. WD's brief says the feature needs "a unique circuit board (PCBA)" and answers the question of enabling it later with "No. This feature is hard wired." It names the Ultrastar DC HC510 as WD's first SATA drive with the option and the He8 and 7K6000 as its first SAS drives.

| Drive | Power Disable | How to tell | Source |
|---|---|---|---|
| WD Ultrastar DC HC510 (8, 10 TB), HC520 (12 TB) SATA | Optional, separate part numbers | 10 TB 512e ISE: 0F27604 without, 0F27452 with. 12 TB 512e ISE: 0F30144 without, 0F29590 with | [WD brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/tech-brief/tech-brief-western-digital-power-disable-pin.pdf) |
| WD Ultrastar DC HC530 SATA | Not offered | Listed only in the "without" table | WD brief |
| WD Ultrastar DC HC310 SATA | Not offered | Every listed model marked "Not supported" | [HC310 manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc300-series/product-manual-ultrastar-dc-hc310-sata-oem-spec.pdf) |
| WD Ultrastar DC HC550 SATA (14 to 18 TB) | No | Model has L in the next-to-last position: WUH721818ALE6L4 | [HC550 manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc550-sata-oem-spec.pdf) |
| WD Ultrastar DC HC555 SATA | Both versions | WUH722020CLE600, 601, 604 yes; CLE6L0, 6L1, 6L4 no | [HC555 manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc555-sata.pdf) |
| Seagate Exos X18 SATA | No: P3 listed as 3.3 V power | Pin table in the manual | [X18 manual](https://www.seagate.com/content/dam/seagate/migrated-assets/www-content/product-content/enterprise-hdd-fam/exos-x18-channel/_shared/en-us/docs/100865854d.pdf) |
| Seagate Exos SATA, 24 to 32 TB | P3 listed as PWRDIS (option) | Manual names no separate part numbers; its sample identify log shows the supported bit as 0 | [Exos SATA manual](https://www.seagate.com/content/dam/seagate/assets/support/internal-hard-drives/enterprise-hard-drives/exos-m/_shared/files/Seagate_Exos_SATA_Product_Manual_32-30-28-24TB_210048100E.pdf) |

Five checks narrow it down.

1. **Part number, for the HC510 and HC520.** WD's brief lists the same model number for both versions, such as HUH721010ALE600, so only the part number on the label separates them.
2. **Model letter, for newer WD drives.** The HC550 and HC555 manuals decode the next-to-last character: "0 = Power Disable Pin 3 support" and "L = Legacy Pin 3 config." An L there is the safe choice for an unknown chassis.
3. **The manual's connector table.** A manual that covers the optional version lists P3 as PWDIS and carries WD's warning: "Drives with this optional feature WILL NOT POWER UP in systems designed to SATA Spec Revision 3.1 or earlier."
4. **Not the SATA version label, and not the identify data alone.** WD's HC310 manual calls the drive "SATA 3.2 compliant with optional SATA 3.3 Power Disable Feature support" while marking every model "Not supported." The TPR056 draft assigns IDENTIFY DEVICE word 78 bit 12 to "Power Disable feature supported," yet the HC550 manual's sample identify table shows that bit set while its model table says no for Power Disable. Treat the bit as a hint, not proof.
5. **Behavior, for white-label drives.** Owners name the WD80EMAZ in [several](https://forums.unraid.net/topic/65241-8tb-easystore-wd-white-label-issue/) [threads](https://forums.unraid.net/topic/116299-plz-help-two-wd-drives-wont-spin-up-in-icy-dock-drive-cage), and one reports [a white-label 14 TB drive](https://forums.unraid.net/topic/73717-solutions-shucked-wd-8tb-easystore-33v-pin-issue). The ICY DOCK poster had one WD80EZAZ that failed and another that worked. None of these threads cites a WD document for those models, so the practical test is whether the drive runs on a Molex adapter and not on a SATA power plug.

## Which power supplies, cables and backplanes still put 3.3 V on pin 3?

Many do. Sliger's [FAQ](https://sliger.com/faq/Why%20is%20my%20drive%20not%20powering%20up%20and%20What%20is%20a%20power%20disable%20enabled%20HDD) says "most consumer power supplies (and nearly all manufactured before 2016) have 5 wires on the SATA power plug" and "If your power cables have only four wires you should not have an issue with the PWDIS pin receiving voltage." Count the wires going into the plug. Five means 3.3 V is present, and it is usually the orange one.

Adapters are the second source. A community developer's [Unraid guide for drives that will not start](https://forums.unraid.net/topic/84038-so-your-new-sas-or-sata-drive-wont-start-spin-up/) says "some cheap SAS-SATA adapters short pins 1-2-3 together." A [StarTech community reply](https://community.startech.com/t/sff8087-to-4x-sff8482-and-3-3v-issue/629) about an SFF-8087 to SFF-8482 breakout says the cable "will simply passthrough the power pins from a SATA power cable," so the supply decides. This matters for SAS drives too. WD's brief says SAS drives are not affected in legacy SAS chassis, which leave the pin unconnected, but a SAS drive fed from a five-wire SATA plug through an adapter is a different case. Toshiba's MG08-D connector table says "Do not supply 3.3 V power if POWER DISABLE feature is used," and a [homelab blogger](https://datahamster.com/2026/06/09/sas-to-sata-gotchas-including-the-3-3v-issue-and-the-best-fix-for-it/) sent back two 6 TB SAS drives as dead on arrival before finding the 3.3 V cause.

Cages and backplanes vary. A [45Drives reply on the 45HomeLab forum](https://forum.45homelab.com/t/hdd-power-disable-feature-pin-3/404) from November 2023 says "The backplanes do not supply Pin3 (P3) with 3.3V power," so both kinds of drive work and the feature "will be ignored by the system." Sliger says its pass-through connectors are passive and pass every pin, so a supply with 3.3 V leaves the drive stuck in "Disabled Mode." A reply in the Unraid guide's thread says "some backplanes have internal circuitry creating 3.3v." Owners reported silent drives in [Norco SS-500 cages](https://forums.unraid.net/topic/65241-8tb-easystore-wd-white-label-issue/), a [Norco 4220](https://forums.unraid.net/topic/79698-solved-my-10tb-wd-white-label-hard-drives-not-recognized/) and the ICY DOCK cages above, and a [December 2017 TrueNAS forum post](https://www.truenas.com/community/threads/pwdis-feature-in-new-sata-drives-to-watch-for.60174) already warned about "a backplane that drives the pin to 3.3 volts."

A power-supply swap can also create the problem in a machine that used to work. A reply in the [shucked 8 TB thread](https://forums.unraid.net/topic/73717-solutions-shucked-wd-8tb-easystore-33v-pin-issue) put it this way: "any new supply will have the 3.3 volt feed on SATA connectors."

## Which fixes work?

Any fix that keeps 3.3 V off pin 3 works, and each one gives up the remote reset feature.

| Fix | Trade-off | Source |
|---|---|---|
| Order the part number without Power Disable | Safest for an unknown chassis; no reset feature | [WD brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/tech-brief/tech-brief-western-digital-power-disable-pin.pdf) |
| Molex-to-SATA power adapter | Carries only 5 V and 12 V; does not help a drive that plugs straight into a backplane | WD brief; [Tom's Hardware](https://www.tomshardware.com/news/hdd-sata-power-disable-feature,36146.html) |
| Kapton tape over the 3.3 V contacts | Inexpensive and reversible; can scrape off or shift | [Unraid thread](https://forums.unraid.net/topic/73717-solutions-shucked-wd-8tb-easystore-33v-pin-issue) |
| Cut the 3.3 V wire on a power extension cable | Permanent; affects every drive on that cable | [Data Hamster](https://datahamster.com/2026/06/09/sas-to-sata-gotchas-including-the-3-3v-issue-and-the-best-fix-for-it/) |
| Four-wire SATA power cable | No 3.3 V wire to begin with | [Sliger FAQ](https://sliger.com/faq/Why%20is%20my%20drive%20not%20powering%20up%20and%20What%20is%20a%20power%20disable%20enabled%20HDD) |
| Backplane that leaves pin 3 unpowered | No per-drive work | [45HomeLab thread](https://forum.45homelab.com/t/hdd-power-disable-feature-pin-3/404) |

WD says that with a Molex-to-SATA connector "you can usually eliminate the problem," because it "effectively removes power from P3 (Pin 3) and allows the drive to spin up normally." Tom's Hardware, in an article by Aris Mpitziopoulos, points out the cost: the drive starts normally but no longer has Power Disable support. If you cut a wire instead, the Data Hamster post says the 3.3 V line is the one closest to the L-shaped side of the SATA power connector, usually orange but gray on some cables, and that the cut end on the supply side stays live and should be cut flush or insulated.

To tape a drive:

1. Power down and unplug the power cable.
2. Find P1 to P3, the three contacts of the power segment nearest the data connector. P3 is the third one counting away from the gap.
3. Cover them with one narrow piece of Kapton (polyimide) tape. In a [Level1Techs thread](https://forum.level1techs.com/t/brand-new-10tb-hdd-appears-to-not-receive-power-solved/147244) one answer said to tape "the left 3 power pins" and another said tape over "pin 3 (or pins 1-3)" should work. The signal is on pin 3 alone, but Toshiba's table says not to feed 3.3 V to the drive at all when Power Disable is in use, so covering all three is the cautious choice.
4. Press the tape flat so it stays put when the plug slides on. Do not cover the fourth contact, which is ground.
5. Reconnect and confirm detection.

List the devices the system can see:

```bash
sudo smartctl --scan
```

Then read the identity of the new drive, replacing `sdX` with the name from the scan:

```bash
sudo smartctl -i /dev/sdX
```

Per the [smartctl manual](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html), `--scan` prints each device name, device type and protocol, and `-i` prints the model number, serial number and firmware version. A drive that was held in reset shows up in neither until P3 is released. Once it appears, read its attributes as in [reading SMART data](/blog/smart-data-drive-failure).

Tape is the least durable choice. The author of the Unraid tape thread used Duck brand tape, wrote that "it worked flawlessly for me" with "zero issues with temperature," and recommends 1 mil, 1/8 inch Kapton as the proper material. A later poster in the same thread used clear office tape on a white-label 14 TB drive and suspected the thin tape had scraped off. In the Unraid guide's thread, a reply to someone who had used nail polish called polyimide tape the proper solution, because the contacts are subject to vibration and the connector is under spring tension.

## Can a server backplane use Power Disable to reset a hung drive?

Yes, in principle, and that is why the feature exists. The TPR056 introduction says a hung drive can be powered off "without having to support independent supply voltage switching to every receptacle connector or require physical removal and insertion." WD's brief says "a smart chassis can provide a management tool to do this function automatically," and that a SATA drive with the feature "will work properly when used on a SAS backplane that supports this feature." In the draft's protocol the host drives pin 3 to at least 2.1 V to cut power, then back to 0.7 V or less, and the drive performs the actions of a power-on reset.

Support looks thin in the sources cited here. A TrueNAS forum regular wrote in August 2019: "I have not seen hardware support for it yet." The 45Drives answer above describes a backplane where the feature is ignored. An SSD maker's [explainer](https://www.ssstc.com/technology/industrial-features-stability/stability-pwdis/) says a host system, server backplane or management controller can use the signal, and advises that when a drive does not start, "the power supply, chassis, and backplane should be checked for compatibility with SATA PWDIS." None of the documents cited in this article names a specific backplane or expander model that drives pin 3, so confirm in the enclosure's own manual before counting on remote resets.

A drive without the feature takes no part. It ignores the request, and it cannot be converted later. Choose the part number for the chassis you own, and see the [expander article](/blog/do-you-need-a-sas-expander-homelab) for SATA drives behind a SAS backplane.

## What breaks

**The drive runs in a USB dock and is silent in the machine.** This is the signature of P3 held high. Fix: power the drive from a Molex adapter as a test. If it spins, apply a permanent fix. If it does not, treat it as an ordinary dead-on-arrival return, because WD says the adapter "usually" solves the problem, not always.

**A taped drive works, then vanishes later.** Thin tape can scrape off or shift when a plug is reseated. Fix: use Kapton, check the contacts again after any cable work, or remove 3.3 V at the cable so the fix does not live on the drive.

**A Molex adapter cannot be used behind a backplane.** The poster with the Norco 4220 could not put an adapter between the drive and the backplane, and Kapton over pin 3 worked. In the Norco SS-500 thread, a poster had two systems with four cages each. One system would not recognize any WD80EMAZ until "the 3.3V tape trick worked." Fix: tape the drive, or find out whether the cage passes 3.3 V through to its bays.

**SAS drives are silent behind an SFF-8482 adapter.** The adapter passes the SATA plug's 3.3 V wire to the same pin on the SAS drive. Fix: feed the adapter from a plug with no 3.3 V wire, or cut that wire on an extension cable.

**A drive ordered without the feature does not reset in a Power Disable backplane.** It ignores the request by design. Fix: order the part number with the feature.

**The drive is detected but reports no capacity or a strange size.** That is not this problem, because the drive is running. One common cause on used enterprise drives is a 520-byte sector format, covered in the [DS4246 guide](/blog/netapp-ds4246-truenas). A used-drive [receiving checklist](/blog/buying-used-enterprise-gear) should include the Molex test for drives that never appear at all.

**Drives spin up together and trip a supply or UPS.** That is inrush current, not Power Disable. Staggered spin-up is a separate, older mechanism on P11. As a TrueNAS forum reply in the PWDIS thread put it, "Staggered spin-up's always been supported." See [UPS sizing](/blog/ups-sizing-homelab) for the power budget side.

## Sources

- [Western Digital: Power Disable Feature tech brief](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/collateral/tech-brief/tech-brief-western-digital-power-disable-pin.pdf)
- [SATA-IO: TPR056r13, Enable new Power Disable feature on standard SATA connector P3 (draft)](https://sata-io.org/sites/default/files/TPR056r13_SATA32_EnableNewPowerDisableFeatureOnStandardSATA.pdf)
- [SATA-IO: TP037, Standard SATA Connector 3.3V Power Pin Assignments (October 12, 2011)](https://sata-io.org/sites/default/files/TP_037_SATA_TechProp_C110v1_1.pdf)
- [Western Digital: Ultrastar DC HC550 SATA hard disk drive specifications, Rev. 1.7](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc550-sata-oem-spec.pdf)
- [Western Digital: Ultrastar DC HC555 SATA hard disk drive specifications, Rev. 2.6](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc500-series/product-manual-ultrastar-dc-hc555-sata.pdf)
- [Western Digital: Ultrastar DC HC310 SATA product manual](https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/data-center-drives/ultrastar-dc-hc300-series/product-manual-ultrastar-dc-hc310-sata-oem-spec.pdf)
- [Toshiba: Enterprise Capacity HDD MG08-D Series Product Manual](https://toshiba.semicon-storage.com/content/dam/toshiba-ss-v2/master/en/storage/product/data-center-enterprise/eHDD-MG08-D_Product-Manual_r0.pdf)
- [Seagate: Exos X18 SATA Product Manual, Rev. D](https://www.seagate.com/content/dam/seagate/migrated-assets/www-content/product-content/enterprise-hdd-fam/exos-x18-channel/_shared/en-us/docs/100865854d.pdf)
- [Seagate: Exos SATA Product Manual, 24 to 32 TB](https://www.seagate.com/content/dam/seagate/assets/support/internal-hard-drives/enterprise-hard-drives/exos-m/_shared/files/Seagate_Exos_SATA_Product_Manual_32-30-28-24TB_210048100E.pdf)
- [Intel: ATX Version 3 Multi Rail Desktop Platform Power Supply Design Guide](https://cdrdv2-public.intel.com/336521/336521_Rev2p1a.pdf)
- [Tom's Hardware: The Pesky PWDIS Feature In Newer SATA Specs](https://www.tomshardware.com/news/hdd-sata-power-disable-feature,36146.html)
- [Sliger: Why is my drive not powering up, and what is a power disable enabled HDD](https://sliger.com/faq/Why%20is%20my%20drive%20not%20powering%20up%20and%20What%20is%20a%20power%20disable%20enabled%20HDD)
- [StarTech.com Community: SFF8087 to 4x SFF8482 and 3.3v issue](https://community.startech.com/t/sff8087-to-4x-sff8482-and-3-3v-issue/629)
- [45HomeLab Forum: HDD Power Disable Feature (Pin 3)](https://forum.45homelab.com/t/hdd-power-disable-feature-pin-3/404)
- [SSSTC: SSD Power Disable Explained, PWDIS and PWRDIS](https://www.ssstc.com/technology/industrial-features-stability/stability-pwdis/)
- [Unraid forum: Wd 8tb (easy store shucked) Red drives not recognized](https://forums.unraid.net/topic/62334-wd-8tb-easy-store-shucked-red-drives-not-recognized/)
- [Unraid forum: 8TB EasyStore WD White Label Issue](https://forums.unraid.net/topic/65241-8tb-easystore-wd-white-label-issue/)
- [Unraid forum: Solutions, Shucked WD 8TB Easystore 3.3v PIN Issue](https://forums.unraid.net/topic/73717-solutions-shucked-wd-8tb-easystore-33v-pin-issue)
- [Unraid forum: My 10TB WD White Label Hard Drives not Recognized](https://forums.unraid.net/topic/79698-solved-my-10tb-wd-white-label-hard-drives-not-recognized/)
- [Unraid forum: So your new SAS (or SATA) drive won't start (spin up)?](https://forums.unraid.net/topic/84038-so-your-new-sas-or-sata-drive-wont-start-spin-up/)
- [Unraid forum: Plz help, two WD drives won't spin up in ICY DOCK drive cage](https://forums.unraid.net/topic/116299-plz-help-two-wd-drives-wont-spin-up-in-icy-dock-drive-cage)
- [Level1Techs forum: Brand-new 10TB HDD appears to not receive power](https://forum.level1techs.com/t/brand-new-10tb-hdd-appears-to-not-receive-power-solved/147244)
- [TrueNAS forum: PWDIS feature in new SATA drives to watch for](https://www.truenas.com/community/threads/pwdis-feature-in-new-sata-drives-to-watch-for.60174)
- [Data Hamster: SAS to SATA gotchas, including the 3.3v issue and the best fix for it](https://datahamster.com/2026/06/09/sas-to-sata-gotchas-including-the-3-3v-issue-and-the-best-fix-for-it/)
- [smartmontools: smartctl(8) manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html)