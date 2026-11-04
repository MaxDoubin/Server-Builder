
## The short answer

A Supermicro BMC treats a fan reading that falls to its lower critical threshold as a failing fan: it logs a "Lower Critical going low" event and, per the [smfc project documentation](https://github.com/petersulyok/smfc), sets every fan in that cooling zone back to 100 percent. When the reading climbs back above the threshold the event clears, the fans slow down, the quiet fan drops below the line again, and the loop repeats every few seconds. The fix is to lower the three lower thresholds on the affected fan to values under its slowest in-spec speed, for example `ipmitool sensor thresh FAN1 lower 100 200 300`, which sets lower non-recoverable, lower critical and lower non-critical in that order per the [ipmitool manual](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in). X10 and X11 boards work in steps of 100 rpm, and owner reports differ on whether a value rounds to the nearest hundred or down, so read the values back. Fan mode did not help one X11SSL-CF owner, who [reported that none of the four modes made a difference](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712) and that the cycling ended after he lowered the thresholds. For scale, Noctua lists [460 rpm at 20 percent PWM](https://www.noctua.at/en/products/nf-a12x25-pwm/specifications) for the NF-A12x25 PWM and [200 rpm](https://www.noctua.at/en/products/nf-a12x25-ls-pwm/specifications) for the LS-PWM, and Supermicro's [IPMICFG guide](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf) shows a 600 rpm low limit in its sample output. Check the values again after a BMC firmware update.

## Why do Supermicro fans spin up to full speed and back down every few seconds?

The BMC reads each fan's speed and compares it with up to six stored limits, per the [smfc README](https://github.com/petersulyok/smfc). When a reading is too low, the BMC assumes the fan is stalling and tries to recover it. The author of a long-running [TrueNAS forum guide](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/), a moderator writing in 2014, says the BMC "automatically attempts to recover stalling" fans "by spinning them up to maximum (PWM set to 100% speed)." The smfc FAQ for loud, spinning-up fans gives the same cause: an assertion, meaning "the rotational speed of a fan went above or below an IPMI threshold," after which "IPMI switched back that zone to full rotational speed." Supermicro's X11SCZ-F/Q manual and X12/H12 BMC guide do not describe the response.

A quiet fan makes this a loop. For example, a fan that idles at 300 rpm sits below a 500 rpm limit even though nothing is wrong. At 100 percent it speeds past the limit, and the IPMI specification says a low-going threshold clears once the reading rises "negative_hysteresis+1 counts above the threshold" (section 35.13.3 of the [IPMI 2.0 specification](https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/ipmi-second-gen-interface-spec-v2-rev1-1.pdf)). The event then clears, the fan slows, and the next dip trips the limit again. The smfc README's [example event log](https://github.com/petersulyok/smfc), from a fan-control setup on a Supermicro board, shows the pattern, with an assertion and a deassertion three seconds apart:

```text
1 | 10/19/2023 | 05:15:35 PM CEST | Fan #0x46 | Lower Critical going low  | Asserted
2 | 10/19/2023 | 05:15:35 PM CEST | Fan #0x46 | Lower Non-recoverable going low  | Asserted
3 | 10/19/2023 | 05:15:38 PM CEST | Fan #0x46 | Lower Non-recoverable going low  | Deasserted
4 | 10/19/2023 | 05:15:38 PM CEST | Fan #0x46 | Lower Critical going low  | Deasserted
```

Owners describe the same pattern. An X11SSL-CF owner wrote in 2018 that fans "were spooling up and down every few seconds" with [Fractal Design Venturi HP fans](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712). A November 2015 X10SL7-F owner on the [thresholds guide](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-2) described fans that kept switching between off and "full blast," and wrote that lowering the lower thresholds "got them running constantly." A 2016 X10SL7-F owner using Noctua NF-F12 PWM fans [saw FANA dip to about 500 rpm](https://www.truenas.com/community/threads/loud-noctua-pwm-fans.47672/) in state "cr" for critical before the fans spun back up to full.

### How do you confirm the thresholds are the cause?

Two checks help:

- `ipmitool sel list` should show fan entries such as "Lower Critical going low", the check the [smfc FAQ](https://github.com/petersulyok/smfc) gives for loud, spinning-up fans.
- `ipmitool sensor | grep -i fan` shows each reading beside its limits. An X11SSL-CF owner [saw the fans dropping to about 300 rpm](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712) in a once-per-second loop of `ipmitool sensor list all`.

If the event log holds no fan entries, the cause is elsewhere, for example lowered CPU temperature thresholds (see "What breaks" below).

Most owner reports cited here come from X10, X11 and H12 boards, and the [X10 versus X11 comparison](/blog/supermicro-x10-vs-x11) lists which BMC chip each family uses. Two boundaries apply. The X11SCZ-Q has no BMC: its [manual](https://www.supermicro.com/manuals/motherboard/X11/MNL-2086.pdf) puts the F model's fan control on the BMC and the Q model's on the Super I/O. The smfc README also says X8 boards [do not implement the BMC's Full mode](https://github.com/petersulyok/smfc). Dell and HPE fan controls are in [iDRAC fan speed offset](/blog/idrac-fan-speed-offset), [quieting an R730](/blog/dell-r730-quiet-fans) and [DL360p Gen8 fan noise](/blog/proliant-dl360p-gen8-fan-noise); those are settings and overrides, not a threshold response.

## What are the six IPMI fan thresholds, and which one triggers the full-speed recovery?

Each fan sensor has three lower and three upper limits. Supermicro's [Embedded BMC/IPMI User's Guide](https://www.supermicro.com/manuals/other/embedded_bmc_ipmi.pdf) lists them on its Sensor Readings with Thresholds page as Low NR, Low CT, Low NC, High NC, High CT and High NR, and says an item reading below Low CT "is in a critical state." The IPMI specification's terminal-mode text commands (section 14.7.8) call non-critical a "warning," critical "fatal" and non-recoverable "potential damage."

| ipmitool name | Threshold | Evidence about full speed |
|---|---|---|
| `lnc` | Lower Non-Critical | Not named as a full-speed trigger in the smfc README |
| `lcr` | Lower Critical | The smfc README names crossing it, or the upper critical, as the trigger; an [X11SSL-CF owner](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712) traced the cycle to it |
| `lnr` | Lower Non-Recoverable | Asserts with `lcr` in the smfc log above; one owner got [105 emails about non-recoverable fan speeds](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/) and his board changed its fan mode |
| `unc`, `ucr`, `unr` | Upper limits | The smfc README says an upper critical crossing also resets the zone to 100 percent |

Lower critical is the best-supported trigger. Lower non-recoverable sits below it, so a fan that crosses both asserts both, as in the log above. Three details matter in practice:

- **Zones.** The smfc README groups fans into a CPU or system zone, zone 0, with FAN1, FAN2 and so on, and a peripheral zone, zone 1, with FANA and FANB. One quiet fan on FANA therefore sends the whole peripheral zone to full speed.
- **Rounding.** The README says X10 and X11 thresholds are "RPM values rounded to the nearest hundreds," defined for each fan. The thresholds guide says setting [540 sets 500 and 550 sets 600](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/), which is nearest-hundred rounding, while a 2022 poster wrote that the BMC would [round all values down to a multiple of 100](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-8). Newer boards differ: a [sensor table from H12-based systems](https://forums.truenas.com/t/supermicro-fan-control/14398?page=3) shows limits of 140, 420 and 25340, all multiples of 140, so do not assume a 100 rpm step.
- **Fewer thresholds on new boards.** The README says the AST2600 BMC on X13 boards implements [only a Lower Critical threshold](https://github.com/petersulyok/smfc). Supermicro's [X12 and H12 BMC guide](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) lists four limits on its Sensor tab: "Low NR," "Low CT," "High NR" and "High CT."

None of the Supermicro documents cited here lists default fan thresholds. The sample output in the [IPMICFG guide](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf), dated December 2012, shows FAN1 and FAN2 reading 1800 rpm with a 600 rpm low limit and an 18975 rpm high limit, without saying which threshold the column shows. An H12SSL-I owner reported a [BMC default of 420 rpm lower critical](https://forums.unraid.net/topic/175202-ipmi-fan-control-with-supermicro-motherboards/) with 140 rpm hysteresis. A TrueNAS regular wrote in an [X11SSL-F thread](https://www.truenas.com/community/threads/supermicro-x11ssl-f-fan-control.85265/) that the "defaults are for fast spinning server fans and work badly with quiet, slow spinning fans."

## How do you read and set fan thresholds with ipmitool sensor thresh?

Read the table, then write the three lower values for the fan that dips. The ipmitool manual says `sensor list` lists "sensors and thresholds in a wide table format." The smfc README's sample rows, set with `lower 0 100 200` and `upper 1600 1700 1800`, read in the order reading, unit, status, `lnr`, `lcr`, `lnc`, `unc`, `ucr`, `unr`:

```text
FAN1             | 500.000    | RPM        | ok    | 0.000     | 100.000   | 200.000   | 1600.000  | 1700.000  | 1800.000
FANA             | 500.000    | RPM        | ok    | 0.000     | 100.000   | 200.000   | 1600.000  | 1700.000  | 1800.000
FAN3             | na         |            | na    | na        | na        | na        | na        | na        | na
```

```bash
ipmitool sensor | grep -i fan
ipmitool sensor thresh FAN1 lower 100 200 300
ipmitool sensor get FAN1
```

Replace `FAN1` with the sensor name from the table, which the thresholds guide says is case-sensitive. From another machine, the manual documents `-I lanplus -H <address> -U <username>`, and `-E` reads the password from the `IPMI_PASSWORD` or `IPMITOOL_PASSWORD` environment variable:

```bash
export IPMI_PASSWORD='your-bmc-password'
ipmitool -I lanplus -H BMC_ADDRESS -U ADMIN -E sensor thresh FANA lower 100 200 300
```

Reaching the BMC safely is covered in [IPMI and out-of-band management](/blog/ipmi-remote-management). Then pick values:

1. Find the fan's lowest speed from its data sheet, including tolerance. For an X11SSL-F owner whose NF-A6x25 PWM fans produced [over 400 warnings](https://www.truenas.com/community/threads/supermicro-x11ssl-f-fan-control.85265/) about "lower critical going low," a TrueNAS regular worked from the sheet's 550 rpm at 20 percent PWM to a lowest in-spec speed near 440 rpm and suggested 400, 300 and 200 for the non-critical, critical and non-recoverable thresholds.
2. Put `lnc` at or below that speed in 100 rpm steps, with `lcr` and `lnr` one and two steps lower. The same regular's earlier example for an NF-A12x25 reads: "The BMC rounds by 100 rpm so lnc would be 300, and then lc and lnr at 200 and 100."
3. Keep the upper critical and non-recoverable limits above the fan's maximum plus its tolerance. Noctua's [infosheet](https://cdn.noctua.at/media/noctua_nf_a12x25_pwm_infosheet_en_web.pdf) lists the NF-A12x25 PWM's 2000 rpm maximum as +/-10 percent, so it can reach 2200. The smfc README's example for an NF-F12 PWM, listed at 1500 rpm, is `ipmitool sensor thresh FAN1 upper 1600 1700 1800`.
4. Read the table back, then watch the readings and the event log for a few minutes.

Order matters. The IPMI specification says "the application issuing this command is responsible for ensuring that thresholds for a sensor are set in the proper order," and the thresholds guide warns that ipmitool accepts out-of-order values and that the effects of them are unknown. A 2022 poster wrote that the BMC wants the values [in logical order](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-8), so use distinct ascending numbers.

## Which fan mode should you pick: Standard, Full, Optimal, Heavy IO or PUE2?

For a quiet board, Supermicro's [FAQ 28514](https://www.supermicro.com/en/support/faqs/faq.php?faq=28514) answers a question about an X11DP-family workstation by recommending Optimal and naming fan mode and CPU temperature as the factors behind the noise difference. Mode and thresholds are separate controls, though. The mode picks the BMC's fan curve, while the thresholds decide when a fan counts as failing, and the [X11SSL-CF owner](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712) wrote that after trying all four modes "none of them make any difference." He ended the cycling by lowering the lower thresholds on four fans to `100 200 200`.

| Mode | X11SCZ-F/Q manual wording | Other documented notes |
|---|---|---|
| Standard | "normal system cooling" | IPMICFG value 0; the X12/H12 guide calls it "for power savings" |
| Full | "full speed for maximum system cooling" | IPMICFG value 1 |
| Optimal | "normal PCI-E add-on card area cooling" | IPMICFG value 2; the X12/H12 guide says it balances "system performance and power savings" |
| Heavy I/O | "higher PCI-E add-on card area cooling" | [FAQ 16758](https://www.supermicro.com/en/support/faqs/faq.php?faq=16758) limits it to X10 boards with a dual cooling zone |
| PUE2 | "best power efficiency and maximum noise reduction" | FAQ 16758 lists a "PUE Optimal" mode only on specific X10 boards with a single cooling design |

The wording comes from the Fan Speed Modes table in the [X11SCZ-F/Q manual](https://www.supermicro.com/manuals/motherboard/X11/MNL-2086.pdf). The [X12 and H12 BMC guide](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) offers four modes on its Fans tab and no PUE. The [IPMICFG guide](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf) documents `-fan` to read the mode and `-fan <mode>` to set it, with 0 Standard, 1 Full and 2 Optimal.

Raw ipmitool commands are an owner-found alternative that Supermicro's documents do not list: an X10SL7-F owner gave `ipmitool raw 0x30 0x45 0x0` to read the mode and `ipmitool raw 0x30 0x45 0x1 <n>` to set it, with 0 Standard, 1 Full, 2 Optimal and 4 Heavy I/O, in a [2016 thread](https://www.truenas.com/community/threads/loud-noctua-pwm-fans.47672/). A [ServeTheHome resource](https://forums.servethehome.com/index.php?resources/supermicro-x9-x10-x11-fan-speed-control.20/) agrees, lists no value 3, and says Optimal holds the peripheral zone near 30 percent while Heavy IO holds it at 75 percent. Physical server [notes](https://nullroute.lt/docs/supermicro.html) on X11SCM boards say Optimal lets fans "stay at 20% when the load is low." That matters for low-RPM fans, because 20 percent duty is where Noctua's minimum speeds sit.

Manual duty-cycle control does not bypass the thresholds. In the smfc README's model, a fan in Full mode that oversteps the lower or upper critical value sends the zone back to 100 percent, so a fixed 20 percent duty that produces a reading under `lcr` would trip the same loop.

## How low can the thresholds go for Noctua and other low-RPM fans?

Low enough that the fan's slowest normal speed sits clear of the lowest limit. [Noctua's PWM white paper](https://cdn.noctua.at/media/Noctua_PWM_specifications_white_paper.pdf) says fan speed scales "broadly linear" between maximum at 100 percent PWM and the specified minimum at 20 percent, using the NF-A12x25 PWM as its example (2000 rpm maximum, 450 rpm minimum). Operation below 20 percent is "not officially supported in the Intel specification," and most Noctua PWM fans "will stop at 0% duty-cycle."

The lowest in-spec column subtracts 20 percent, the tolerance Noctua lists on the NF-F12 PWM's minimum speed as [quoted in the smfc README](https://github.com/petersulyok/smfc). A TrueNAS regular [quoted the same 20 percent](https://www.truenas.com/community/threads/supermicro-x11ssl-f-fan-control.85265/) from the NF-A6x25 PWM data sheet, and the other rows use the same margin as an assumption. The last column is arithmetic in 100 rpm steps, not a tested value.

| Fan | Minimum at 20% PWM | Lowest in spec (minus 20%) | `lower` values (lnr lcr lnc) |
|---|---|---|---|
| NF-F12 PWM | 300 rpm, per the smfc README quoting Noctua | 240 rpm | `0 100 200`, the README's own example |
| NF-A12x25 PWM | [460 rpm](https://www.noctua.at/en/products/nf-a12x25-pwm/specifications); the white paper says 450 | 368 rpm | `100 200 300` |
| NF-A12x25 G2 PWM | [360 rpm](https://www.noctua.at/en/products/nf-a12x25-g2-pwm/specifications) | 288 rpm | `0 100 200` |
| NF-A12x25 LS-PWM | [200 rpm](https://www.noctua.at/en/products/nf-a12x25-ls-pwm/specifications) | 160 rpm | `0 0 100` |

The LS-PWM row shows the limit of the approach. With 100 rpm steps, the lowest in-spec speed leaves room for one nonzero threshold, so the other two sit at zero. Reports differ on whether that is accepted: one TrueNAS regular wrote that his lower non-recoverable and critical were [set to zero](https://www.truenas.com/community/threads/loud-noctua-pwm-fans.47672/) and prevented the cycling, while another wrote that Supermicro BMCs [want the values in logical order](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-8).

Lowering thresholds also delays the alert. With `lcr` at 200 rpm, a fan that degrades from 460 rpm to 250 rpm raises nothing, so keep `lcr` as high as the quiet fans allow and treat the temperature sensors as the backstop.

Low-noise adapters change the speed range. Noctua's infosheets show the Low-Noise Adaptor cutting the NF-A12x25 PWM's [maximum from 2000 to 1700 rpm](https://cdn.noctua.at/media/noctua_nf_a12x25_pwm_infosheet_en_web.pdf) and the LS-PWM's [from 1200 to 900 rpm](https://cdn.noctua.at/media/noctua_nf_a12x25_ls_pwm_infosheet_en_web.pdf), and the smfc README warns that LNA or ULNA cables and Y-cables change the threshold math.

## Do threshold changes survive a BMC reset, ipmicfg -fd or a firmware update?

Supermicro's documents give no definite answer, so test it. Neither the X12/H12 guide nor the IPMICFG guide says whether a threshold written with ipmitool lives in flash or RAM.

- **Firmware updates.** The X12 and H12 guide says the update "preserves the existing configuration, SDR, and SSL certificates" by default. The smfc README says that after a BMC firmware update "you have to configure IPMI thresholds again." Read the table after every update.
- **Factory default.** `IPMICFG -fd` is documented as "Reset IPMI to the factory default," and the web interface's Factory Default page lets users "restore IPMI to the factory default settings." Neither says what happens to thresholds, so assume a reset can bring the originals back.
- **Plain BMC restarts.** The web interface offers Unit Reset, and ipmitool offers `mc reset` with `warm` or `cold`. Owner reports are mixed. In one [X11 thread](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712), an X10SDV owner wrote after `ipmitool bmc reset cold` that "so far the fans haven't spun up like they did before," and an X11SSL-CF owner needed a BMC reset from the web interface after repeated reboots failed.
- **Power.** In January 2016, an X11SSH-F owner and an A1SRi-2758F owner reported that threshold changes did not register until they [removed power](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-3) from the board (one unplugged the cable "for a few minutes"), not just restarted it.

A workable routine is to set the thresholds, run `ipmitool mc reset cold`, read the table, power-cycle the machine, and read it again. Keep the commands in a script: a TrueNAS poster advised running an ipmitool fan script as a [post-init task](https://forums.truenas.com/t/how-to-stop-fan-ramping/32346) under System > Advanced Settings > Init/Shutdown Scripts, and the smfc README ships `ipmi/set_ipmi_threshold.sh` for setting all thresholds.

## What breaks

**Fans still cycle after the new thresholds.** The value may not have been stored, a rounding step may have moved it, or the fan may dip lower than the new limit. Fix: read the table back, watch the readings for several minutes, and lower `lcr` and `lnr` one step at a time. Check any fan-control script too: a January 2026 X11SSH-LN4F poster [traced odd behavior](https://forums.truenas.com/t/supermicro-fan-control/14398?page=3) to swapped zone settings in its configuration.

**The thresholds change but the fans stay at full speed.** The fan mode may have changed. One owner wrote that his board [responded to the alerts](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/) by switching its mode to Full Speed or High I/O Speed, and that it stayed in Full Speed after a shutdown, though the web interface said otherwise, until he cycled power completely. An X10SL7-F owner [fixed full-speed fans](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-3) with `ipmitool bmc reset warm`. Fix, following those reports: set the mode back to Optimal or Standard, run `ipmitool mc reset warm`, and if the fans still do not respond, remove AC power for a few minutes.

**Fans jump to full speed when the CPU warms up.** Lowered CPU temperature thresholds send the fans to full speed "as soon as the upper values of the CPU temperature are reached," per Supermicro's [FAQ 16301](https://www.supermicro.com/en/support/faqs/faq.php?faq=16301), and fan thresholds will not help. Fix: restore the CPU temperature thresholds and check `ipmitool sdr type Temperature`, a command the manual documents.

**A drive or add-on card runs hot after quieting.** A card with no fan of its own depends on chassis airflow. Fix: choose Heavy I/O where the board offers it, which the [X12 and H12 BMC guide](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) says "will boost cooling to the add-on card zone," watch card temperatures, and see [LSI 9300-8i cooling](/blog/lsi-9300-8i-cooling).

**An empty or moved fan header raises alarms.** [Thomas-Krenn](https://www.thomas-krenn.com/de/wiki/IPMI_Fan_Sensor_meldet_Lower_Non-Recoverable_Fehler) documents "Lower Non-Recoverable - Going Low" events from fan sensors with no fan attached on X8SIL-F and X7SPE-HF boards, and the [Mini-ITX owner](https://www.jeffgeerling.com/blog/2022/making-noctua-fans-work-quietly-supermicro-motherboard/) saw FAN1 read as off after moving a plug. Fix: plug fans into the headers the chassis expects, or hide unused sensors as the Thomas-Krenn page's linked article describes.

## Sources

- [ipmitool: manual page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [Intel: IPMI Second Generation Interface Specification v2.0 rev 1.1](https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/ipmi-second-gen-interface-spec-v2-rev1-1.pdf)
- [Supermicro: X11SCZ-F/Q User's Manual](https://www.supermicro.com/manuals/motherboard/X11/MNL-2086.pdf)
- [Supermicro: BMC User's Manual for X12 and H12](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf)
- [Supermicro: Embedded BMC/IPMI User's Guide](https://www.supermicro.com/manuals/other/embedded_bmc_ipmi.pdf)
- [Supermicro: IPMICFG Utility User's Guide](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf)
- [Supermicro FAQ 16301: IPMI thresholds and fan control](https://www.supermicro.com/en/support/faqs/faq.php?faq=16301)
- [Supermicro FAQ 16758: Fan modes in X10 boards](https://www.supermicro.com/en/support/faqs/faq.php?faq=16758)
- [Supermicro FAQ 28514: Fan speed on the X11DP](https://www.supermicro.com/en/support/faqs/faq.php?faq=28514)
- [Noctua: PWM specifications white paper](https://cdn.noctua.at/media/Noctua_PWM_specifications_white_paper.pdf)
- [Noctua: NF-A12x25 PWM infosheet](https://cdn.noctua.at/media/noctua_nf_a12x25_pwm_infosheet_en_web.pdf)
- [Noctua: NF-A12x25 LS-PWM infosheet](https://cdn.noctua.at/media/noctua_nf_a12x25_ls_pwm_infosheet_en_web.pdf)
- [Noctua: NF-A12x25 PWM specifications](https://www.noctua.at/en/products/nf-a12x25-pwm/specifications)
- [Noctua: NF-A12x25 G2 PWM specifications](https://www.noctua.at/en/products/nf-a12x25-g2-pwm/specifications)
- [Noctua: NF-A12x25 LS-PWM specifications](https://www.noctua.at/en/products/nf-a12x25-ls-pwm/specifications)
- [GitHub: petersulyok smfc, Supermicro fan control README](https://github.com/petersulyok/smfc)
- [TrueNAS Community: How To, change IPMI sensor thresholds using ipmitool](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/)
- [TrueNAS Community: How To, change IPMI sensor thresholds (page 2)](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-2)
- [TrueNAS Community: How To, change IPMI sensor thresholds (page 3)](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-3)
- [TrueNAS Community: How To, change IPMI sensor thresholds (page 8)](https://www.truenas.com/community/threads/how-to-change-ipmi-sensor-thresholds-using-ipmitool.53620/page-8)
- [TrueNAS Community: Supermicro X11 and fan speeds](https://www.truenas.com/community/threads/supermicro-x11-fan-speeds.69712)
- [TrueNAS Community: Loud Noctua PWM Fans](https://www.truenas.com/community/threads/loud-noctua-pwm-fans.47672/)
- [TrueNAS Community: Supermicro X11SSL-F fan control](https://www.truenas.com/community/threads/supermicro-x11ssl-f-fan-control.85265/)
- [TrueNAS Forums: How to Stop Fan Ramping](https://forums.truenas.com/t/how-to-stop-fan-ramping/32346)
- [TrueNAS Forums: Supermicro Fan Control](https://forums.truenas.com/t/supermicro-fan-control/14398?page=3)
- [Unraid Forums: IPMI fan control with Supermicro motherboards](https://forums.unraid.net/topic/175202-ipmi-fan-control-with-supermicro-motherboards/)
- [ServeTheHome: Supermicro X9, X10, X11 fan speed control](https://forums.servethehome.com/index.php?resources/supermicro-x9-x10-x11-fan-speed-control.20/)
- [Jeff Geerling: Making Noctua fans work (quietly) with a Supermicro motherboard](https://www.jeffgeerling.com/blog/2022/making-noctua-fans-work-quietly-supermicro-motherboard/)
- [nullroute.lt: Physical server notes, Supermicro](https://nullroute.lt/docs/supermicro.html)
- [Thomas-Krenn: IPMI Fan Sensor meldet Lower Non-Recoverable Fehler](https://www.thomas-krenn.com/de/wiki/IPMI_Fan_Sensor_meldet_Lower_Non-Recoverable_Fehler)
