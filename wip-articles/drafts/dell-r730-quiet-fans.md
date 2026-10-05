## The problem

You have a Dell PowerEdge R730, or one of its older siblings, the R720 or R710, somewhere people can hear it, and the fans are too loud to live with. You need to know whether something in the build is forcing them up, which Dell settings can bring them down, and how to run the community's manual override without cooking the server.

## Why an R730 runs louder than Dell's numbers

Dell rates a typically configured R730 at 28 dBA idle and 33 to 39 dBA operating, measured at about 23 degrees C in a 24U rack enclosure, according to the [R730 Technical Guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf). The same guide equates 30 dBA with a quiet library. If yours sounds nothing like that, the thermal controller is reacting to something specific. Dell's [PCIe cooling white paper](https://dl.dell.com/manuals/common/poweredge_pcie_cooling.pdf) explains that the installed hardware sets a baseline fan speed, and "Fan speeds may never go below this level unless the inlet ambient temperature or system configuration changes."

| Cause | How to confirm | Supported fix |
| --- | --- | --- |
| Non-Dell PCIe card | Message PCI3018 in the Lifecycle Controller log | Disable the third-party response |
| Non-certified drive | Fans jump when the drive goes in | Use a Dell-certified drive |
| "L" CPU, GPU or PCIe SSD | Check the parts list | None; the design runs louder |
| Missing cover, shroud or blank | Fans at maximum, amber temperature light | Put the part back |
| Performance profile | BIOS or iDRAC profile changed from default | DAPC or Minimum Power |
| Outdated firmware | Fans high with nothing else wrong | Update iDRAC, BIOS and CPLD singly first |

Third-party cards are a common trigger: Dell's 2015 white paper says the server ["automatically provisions additional cooling for the card."](https://fohdeesha.com/docs/store/perc/ThirdPartyPCIFanResponse.pdf) Owners report one R730xd [idling at 43 percent and locked at 66 percent with a PCIe device installed](https://www.dell.com/community/en/conversations/poweredge-hardware-general/how-to-quiet-r730xd-fans-lower-idle-fan-speed/647fa279f4ccf8a8de7fd4ad), and another with a Mellanox ConnectX-3 running each fan at [about 17,000 rpm against roughly 5,000 without it](https://forums.developer.nvidia.com/t/dell-pe-r730xd-fans-running-too-fast-because-of-connectx-3-pcie-card/207266).

Drives have no off switch. Dell's [fan noise article](https://www.dell.com/support/kbdoc/en-us/000227912/poweredge-how-to-identify-and-troubleshoot-some-common-causes-of-fan-noise) warns that uncertified third-vendor hardware can run the fans "higher than normal or even at maximum speed," and one R730xd owner reports fans going [from 1 percent PWM (2,160 rpm) to 39 to 50 percent (about 8,960 rpm)](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/r730xd-non-certified-ssd-fan-increasenoise/647f8600f4ccf8a8de4f001b) after adding a non-Dell SSD, unchanged by disabling the third-party response.

Dell's acoustic notes add a surprise: 65W "low-power" CPUs such as the E5-2650L v3 have lower temperature limits and, under moderate or heavy load, run "about twice as loud as typical configurations," as does any GPGPU card. The [R730 Owner's Manual](https://dl.dell.com/topicspdf/poweredge-r730-dsms_owners-manual_en-us.pdf) requires a component or a blank in every bay and fan slot and warns never to run without the air shroud.

## Which iDRAC8 settings can lower fan speed

The thermal controls are under Overview > Hardware > Fans > Setup in the iDRAC8 web interface, or iDRAC Settings > Thermal in F2 System Setup, according to the [iDRAC8 User's Guide](https://dl.dell.com/content/manual40338704-integrated-dell-remote-access-controller-8-version-2-70-70-70-user-s-guide.pdf?language=en-us). Only one of them is a quieting control.

### Thermal profile and the BIOS system profile

Default follows the BIOS System Profile. Maximum Performance gives "Generally, higher fan speeds at idle and stress loads." Minimum Power gives "Generally, lower fan speeds at idle and stress loads," overriding the BIOS profile's thermal behavior, and Dell recommends a reboot after changing it. The R730's BIOS default, Performance Per Watt Optimized (DAPC), runs quieter than Performance Optimized, according to the technical guide. If a previous owner picked Performance, revert it ([server BIOS settings](/blog/server-bios-configuration)) or override it from the iDRAC:

```
racadm set system.thermalsettings.ThermalProfile 2    # 2 = Minimum Power
racadm get system.thermalsettings.ThermalProfile
```

### Offset and minimum fan speed only add airflow

Fan Speed Offset raises fans "over baseline fan speeds," Minimum Fan Speed keeps them from running "lower than the defined minimum speed," and a lower Maximum Exhaust Temperature Limit (default 70 degrees C) works by adding airflow. None of them goes below the baseline, so their quieting use is undoing someone else's changes. The User's Guide says 255 means no offset and no user minimum, and it documents all of these settings as persistent through reboots and iDRAC or BIOS updates.

```
racadm get system.thermalsettings.FanSpeedOffset     # want 255
racadm get system.thermalsettings.MinimumFanSpeed    # want 255
racadm set system.thermalsettings.FanSpeedOffset 255
```

### Turning off the third-party PCIe card response

This is the supported switch that lowers the floor, published for 13th generation servers including the R730 and R730xd in [KB 000135682](https://www.dell.com/support/kbdoc/en-us/000135682/poweredge-how-to-disable-the-third-party-pcie-card-default-cooling-response). Check the Lifecycle Controller log for message PCI3018 first; the 2015 white paper says that without it, "applying these commands will have no effect on fan speeds."

```
# Status, local form (the KB shows -I lanplus)
ipmitool -I open raw 0x30 0xce 0x01 0x16 0x05 0x00 0x00 0x00
 16 05 00 00 00 05 00 00 00 00    <- enabled; ending 05 00 01 00 00 means disabled
# Disable, then enable again
ipmitool -I open raw 0x30 0xce 0x00 0x16 0x05 0x00 0x00 0x00 0x05 0x00 0x01 0x00 0x00
ipmitool -I open raw 0x30 0xce 0x00 0x16 0x05 0x00 0x00 0x00 0x05 0x00 0x00 0x00 0x00
```

Over racadm it is `racadm set system.thermalsettings.ThirdPartyPCIFanResponse 0`. The User's Guide and the [iDRAC8 RACADM CLI Guide](https://dl.dell.com/topicspdf/idrac8-lifecycle-controller-v2818181_cli-guide_en-us.pdf) define 0 as Disabled, but the 2015 white paper uses 1 to disable. Trust the two newer documents, which define the attribute, and confirm with `racadm get`. Disabling returns the fans to the baseline, not below it. Dell's PCIe paper advises leaving the response on unless you understand the card's cooling needs; its example of a safe case is a card with its own fan.

## The raw IPMI override, byte by byte

When the baseline is still too loud, the homelab community uses Dell OEM commands that take the fans away from the thermal controller entirely.

```
ipmitool raw 0x30 0x30 0x01 0x00         # manual mode
ipmitool raw 0x30 0x30 0x02 0xff 0x14    # every fan to 0x14, which is 20 percent
ipmitool raw 0x30 0x30 0x01 0x01         # automatic again
```

The [ipmitool man page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in) gives the syntax as `raw <netfn> <cmd> [<data>]`. Only the first byte's meaning comes from a standard; the rest is community documentation:

| Bytes | Meaning | Source |
| --- | --- | --- |
| First `0x30` | Network function; 30h to 3Fh is the vendor-specific (OEM) range | [IPMB specification](https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/ipmp-spec-v1.0.pdf) |
| Second `0x30` | Command number within Dell's OEM function | ipmitool syntax |
| `0x01 0x00` | Stop adjusting fans "no matter the temp" | [White-Raven cheat sheet](https://github.com/White-Raven/PowerEdge-IPMItools) |
| `0x01 0x01` | Return control to the BIOS or iDRAC profile | White-Raven cheat sheet |
| `0x02 0xff` | Set speed; `0xff` means every fan at once | [tigerblue77 README](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker) |
| Last byte | Percentage in hex, `0x00` to `0x64` | [Hess Industria](https://blog.hessindustria.com/quiet-fans-on-dell-poweredge-servers-via-ipmi/) |

`printf '0x%02x\n' 20` prints `0x14`, which is how you convert other percentages. Run the commands on the server, where Linux needs the OpenIPMI kernel driver, or remotely with `-I lanplus -H <idrac> -U <user> -E`, where `-E` reads the password from the IPMI_PASSWORD environment variable. The account must be an iDRAC Administrator.

The right speed is a matter of owner reports. Hess Industria found 11 percent quietest on an R730 because "the lower speeds had a lower frequency sound which was actually more noticeable." [SPX Labs](https://www.spxlabs.com/blog/2019/3/16/silence-your-dell-poweredge-server) measured about 50 dB at idle and 40 dB at 20 percent on an R330, though the author was unsure whether the UPS was louder. The tigerblue77 project lists the commands as available on iDRAC 6, 7 and 8, which covers the [R710](https://i.dell.com/sites/doccontent/business/solutions/engineering-docs/en/Documents/server-poweredge-r710-tech-guidebook.pdf) (iDRAC6) and the [R720](https://i.dell.com/sites/content/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R720-Spec-Sheet.pdf) (iDRAC7), though one iDRAC6 machine, an R510, refused `0xff` and took the command one fan at a time.

The cost is in White-Raven's wording: manual mode holds the speed "no matter the temp." Nothing raises the fans under load unless something you run does.

## A watchdog that hands the fans back

This script holds a fixed speed while temperatures are low and returns control to the iDRAC when any sensor gets hot or the sensors cannot be read.

```bash
#!/usr/bin/env bash
# fan-watchdog.sh
LIMIT=70       # hand back to automatic at or above this, in degrees C
RESUME=60      # take manual control again only below this
SPEED=0x14     # 20 percent, in hex
INTERVAL=15    # seconds between checks

auto()   { ipmitool raw 0x30 0x30 0x01 0x01 >/dev/null; }
manual() { ipmitool raw 0x30 0x30 0x01 0x00 >/dev/null &&
           ipmitool raw 0x30 0x30 0x02 0xff "$SPEED" >/dev/null; }

trap auto EXIT              # any normal exit returns control to the iDRAC
trap 'exit 1' INT TERM HUP  # signals become a normal exit

while true; do
  # Hottest sensor that returned a reading; empty if nothing could be read
  max=$(ipmitool sdr type temperature 2>/dev/null |
        awk -F'|' '/degrees C/ { t = $5 + 0; if (t > m) m = t }
                   END { if (m > 0) printf "%d\n", m }')
  if [ -z "$max" ] || [ "$max" -ge "$LIMIT" ]; then
    auto
  elif [ "$max" -lt "$RESUME" ]; then
    manual
  fi
  sleep "$INTERVAL" & wait $!   # wait, unlike sleep, is interrupted by signals
done
```

Each sensor line ends in a reading such as `28 degrees C`; sensors showing `No Reading` are skipped. At or above LIMIT, or with no reading at all, the script switches to automatic. Below RESUME it reasserts manual mode every cycle, which also recovers from an iDRAC reset, and in between it changes nothing, so it does not flap. The EXIT trap hands control back on Ctrl+C or a systemd stop.

Intel lists a [Tcase of 79 degrees C for the E5-2660 v3](https://www.intel.com/content/www/us/en/products/sku/81706/intel-xeon-processor-e52660-v3-25m-cache-2-60-ghz/specifications.html) used in Dell's typical R730 build, and the tigerblue77 README suggests a threshold slightly below Tcase, so look up your own CPU before choosing LIMIT. Run the script as a systemd service with `Restart=always` ([systemd units that behave](/blog/systemd-units-that-behave)) and test it under a synthetic CPU load before trusting it, as Hess advises. The tigerblue77 Docker image is a maintained alternative that applies Dell's default profile when it stops.

## What changes on an R740 with iDRAC9

Community reports agree on the cutoff: iDRAC9 accepts the raw commands up to firmware 3.30.30.30 and refuses them from 3.34.34.34, with 3.31 and 3.32 unreported. In a [Dell community thread](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-eng-is-taking-away-fan-speed-control-away-from-users-idrac-3343434/647f8593f4ccf8a8de47aa9b), a T440 owner got "Insufficient privilege level," and a Dell representative answered, "Going forward access is not going to be allowed as it affects the thermal algorithms and cooling the system." Once an iDRAC9 has taken the June 2024 release (7.00.00.172 on 14th generation servers), it cannot be downgraded to 4.40.10.00 or older, according to [KB 000225924](https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers), so there is no road back to 3.30.30.30.

An [R740](/blog/dell-poweredge-r740-deep-dive) keeps Dell's own options: Minimum Power and, where the platform supports it, Sound Cap, which caps CPU power "to limit fan speed" at a performance cost, per Dell's [custom cooling paper](https://downloads.dell.com/manuals/common/customcooling_poweredge_idrac9.pdf). The third-party response became a per-slot setting with "no customer-facing support" over IPMI:

```
racadm get system.pcieslotlfm.1                   # LFMMode=Automatic is the default
racadm set system.pcieslotlfm.1.lfmmode disabled
```

The custom cooling paper also says the server will not let fans drop below the threshold it needs. If the override matters to you, check the iDRAC9 version before buying or updating an R740.

## Replacing the fans with quieter ones

The R730 has six hot-swappable fans with N+1 redundancy. One owner [swapped all six for Noctua fans](https://www.dell.com/community/en/conversations/rack-servers/r730-noise-when-additional-cards-are-plugged-in/647f9a73f4ccf8a8dee193be) that are "half the depth," soldering the Dell plugs onto the Noctua leads, and reports they "didnt push past 1600rpm," with no heat issues even with a Quadro P2000 installed. That is one report, not a recipe. The risk is the iDRAC deciding a fan has failed: Dell's fan noise article lists a failed fan first among the causes of fans running high, and one R710 owner's log shows ["Fan 1 RPM is operating less than the lower critical threshold"](https://www.dell.com/community/en/conversations/poweredge-hardware-general/fan-problems-with-r710-fan-1-rpm-is-operating-less-than-the-lower-critical-threshold/647f7654f4ccf8a8de462748) with every fan near 12,000 rpm. Compare each fan's Lower Critical value from `ipmitool sensor list` with the replacement's minimum speed first.

## What breaks

**The watchdog dies and the fans stay at 20 percent.** SIGKILL cannot be trapped, so an out-of-memory kill or a stop timeout skips the handback and leaves the fans, in the tigerblue77 README's words, "with nothing left to raise them." A local watchdog also dies with a hung OS. Fix: run it under systemd with `Restart=always`, don't shorten the stop timeout, and choose a static speed that keeps idle temperatures well under LIMIT.

**Manual mode outlives the session that set it.** SPX Labs said the setting "stuck, even after a few reboots," [angrysysadmins](https://angrysysadmins.tech/index.php/2022/01/grassyloki/idrac-7-8-lower-fan-noise-on-dell-servers/) says it "sometimes does sometimes not survive," and Hess says any iDRAC reset (firmware update, software reset, sustained power outage) restores automatic mode. Fix: assume it survives an OS reboot, start the watchdog at boot, and when you retire it, send `raw 0x30 0x30 0x01 0x01` and listen for the ramp.

**The fans are loud again after a firmware update.** An iDRAC update resets the iDRAC, which drops manual mode, even though Dell documents its supported thermal settings as persistent. Fix: after any update, read back `ThirdPartyPCIFanResponse` and the `0xce` status, and let the watchdog reassert manual mode.

**The raw commands return "Insufficient privilege level."** A non-Administrator account gets the same completion code, [0xd4](https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_strings.c), as a firmware without the commands, and on iDRAC9 3.34.34.34 or later it is the firmware. Fix: use an Administrator account, which Dell's KB also requires for the `0xce` commands; on newer iDRAC9 there is no fix.

**Remote commands time out.** They need IPMI over LAN enabled (`racadm set iDRAC.IPMILan.Enable 1`), and CISA warns that [attackers "can easily identify and access"](https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi) Internet-facing IPMI systems. Fix: run locally with `-I open`, or keep the iDRAC on a management network, as covered in [IPMI and out-of-band management](/blog/ipmi-remote-management).

**A passive card misbehaves with the third-party response off.** The angrysysadmins write-up lists "packet loss on nics, loss of tcp states, hdd disconnects and smart errors." Fix: re-enable the response for any card without its own fan.

## What this means

Work from the cause outward: blanks and shroud, then DAPC or Minimum Power, then the third-party response if PCI3018 is logged. If the cause was a card, a profile or a missing part, that may be the whole fix, and it stays supported. Reach for the raw override only when the remaining floor is still too loud, and only with a watchdog you have watched hand control back under load. On an R740, iDRAC9 3.30.30.30 is the line: past it, Dell's settings are all you get.

## References

- https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf
- https://i.dell.com/sites/doccontent/business/solutions/engineering-docs/en/Documents/server-poweredge-r710-tech-guidebook.pdf
- https://i.dell.com/sites/content/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R720-Spec-Sheet.pdf
- https://dl.dell.com/topicspdf/poweredge-r730-dsms_owners-manual_en-us.pdf
- https://dl.dell.com/content/manual40338704-integrated-dell-remote-access-controller-8-version-2-70-70-70-user-s-guide.pdf?language=en-us
- https://dl.dell.com/topicspdf/idrac8-lifecycle-controller-v2818181_cli-guide_en-us.pdf
- https://www.dell.com/support/kbdoc/en-us/000135682/poweredge-how-to-disable-the-third-party-pcie-card-default-cooling-response
- https://fohdeesha.com/docs/store/perc/ThirdPartyPCIFanResponse.pdf
- https://dl.dell.com/manuals/common/poweredge_pcie_cooling.pdf
- https://downloads.dell.com/manuals/common/customcooling_poweredge_idrac9.pdf
- https://www.dell.com/support/kbdoc/en-us/000227912/poweredge-how-to-identify-and-troubleshoot-some-common-causes-of-fan-noise
- https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers
- https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in
- https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_strings.c
- https://www.intel.com/content/dam/www/public/us/en/documents/product-briefs/ipmp-spec-v1.0.pdf
- https://www.intel.com/content/www/us/en/products/sku/81706/intel-xeon-processor-e52660-v3-25m-cache-2-60-ghz/specifications.html
- https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi
- https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker
- https://github.com/White-Raven/PowerEdge-IPMItools
- https://blog.hessindustria.com/quiet-fans-on-dell-poweredge-servers-via-ipmi/
- https://www.spxlabs.com/blog/2019/3/16/silence-your-dell-poweredge-server
- https://angrysysadmins.tech/index.php/2022/01/grassyloki/idrac-7-8-lower-fan-noise-on-dell-servers/
- https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-eng-is-taking-away-fan-speed-control-away-from-users-idrac-3343434/647f8593f4ccf8a8de47aa9b
- https://www.dell.com/community/en/conversations/poweredge-hardware-general/how-to-quiet-r730xd-fans-lower-idle-fan-speed/647fa279f4ccf8a8de7fd4ad
- https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/r730xd-non-certified-ssd-fan-increasenoise/647f8600f4ccf8a8de4f001b
- https://www.dell.com/community/en/conversations/rack-servers/r730-noise-when-additional-cards-are-plugged-in/647f9a73f4ccf8a8dee193be
- https://www.dell.com/community/en/conversations/poweredge-hardware-general/fan-problems-with-r710-fan-1-rpm-is-operating-less-than-the-lower-critical-threshold/647f7654f4ccf8a8de462748
- https://forums.developer.nvidia.com/t/dell-pe-r730xd-fans-running-too-fast-because-of-connectx-3-pcie-card/207266
