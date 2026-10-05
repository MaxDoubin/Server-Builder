
## The short answer

Fan Speed Offset on iDRAC9 can only make an R640 or R740 louder: Low, Medium, High and Max add airflow on top of the baseline that Dell's thermal controller calculates, and Off, the default, adds none. Minimum Fan Speed in PWM percent is a floor, not a setpoint, so no supported setting holds the fans at a fixed 20 percent. What lowers noise is removing a cause, such as a leftover offset, a low exhaust limit or the response to a third-party card, which you can disable one slot at a time. Owner reports say raw [IPMI](/blog/ipmi-remote-management) fan commands stopped working at iDRAC9 3.34.34.34 in June 2019, and Dell says firmware from June 2024 cannot be rolled back to 4.40.10.00 or older.

## Where are the iDRAC9 fan and thermal settings, and what does each one do?

They share one page. In the iDRAC9 web interface open Configuration > System Settings > Hardware Settings > Cooling Configuration, per [Dell KB 000257346](https://www.dell.com/support/kbdoc/en-us/000257346/poweredge-how-to-change-the-fan-speed-offset). On the server, press F2 at boot and open iDRAC Settings > Thermal, per Dell's [custom cooling white paper](https://downloads.dell.com/manuals/common/customcooling_poweredge_idrac9.pdf).

| Setting | What it does | Values | racadm object |
|---|---|---|---|
| Thermal Profile Optimization | Base fan algorithm; anything but Default overrides the BIOS System Profile | Default, Maximum Performance, Minimum Power, Sound Cap | `ThermalProfile` |
| Maximum Exhaust Temperature Limit | Adds airflow to hold exhaust air under a limit | Default 70 C, down to 40 C where supported | `AirExhaustTemp` |
| Fan Speed Offset | Adds a fixed step above baseline | Off, Low, Medium, High, Max | `FanSpeedOffset` |
| Minimum Fan Speed in PWM | Floor under all system fans | Default or Custom percent | `MinimumFanSpeed` |
| PCIe Airflow Settings | Per-slot response for third-party cards | Automatic, Custom, Disabled | `System.PCIeSlotLFM.3` |

The first four live in `System.ThermalSettings`. Dell's paper sets three ground rules: the options "apply to server system fans and do not influence fans that are located in peripheral devices such as power supplies or PCIe cards," the server "does not allow fan speeds to drop below the threshold that is required to cool the server," and settings persist through "system reboot, power cycling, iDRAC, or BIOS updates," so a previous owner's offset stays until you clear it.

The KB says the page "requires an Enterprise or Datacenter license," and Dell's [iDRAC9 User's Guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) makes Express the default on 600-series and higher rack servers, which covers the R640 and R740. A fan-control project maintainer reported an R640 on Express with the whole section editable and [Redfish returning the same attributes](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker/issues/360), so test before assuming either.

## What do Fan Speed Offset and Minimum Fan Speed in PWM do?

Both raise fans and neither lowers them below the baseline, which comes from your hardware and inlet temperature. Dell's [R740 Technical Guide](https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r740-r740xd-technical-guide-addcpulist-180912.pdf) says open-loop fan control "uses system configuration to determine fan speed based on system inlet air temperature."

<figure>
<img src="/images/blog/idrac-fan-speed-offset/server-interior.jpg" alt="The inside of a 1U Dell server, showing its row of system fans" width="1200" height="698" loading="lazy" decoding="async">
<figcaption>The inside of a 2013 Dell 1U server and its row of system fans. Fan Speed Offset and Minimum Fan Speed act on these system fans, not on fans inside power supplies or PCIe cards. Photo: arichnad, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Inside_of_webserver.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

### Fan Speed Offset adds a step above the baseline

An offset "causes fan speeds to increase by the offset percentage value over baseline fan speeds," in four steps spread between the typical baseline and full speed. The white paper puts them at +25, +50, +75 and +100 percent, but the user guide says the values depend on the system and shows 23, 47, 66 and 100. `racadm get System.ThermalSettings` shows yours in `FanSpeedLowOffsetVal`, `FanSpeedMediumOffsetVal`, `FanSpeedHighOffsetVal` and `FanSpeedMaxOffsetVal`.

| Option | racadm value | Dell's description |
|---|---|---|
| Low | 0 | Drives fan speeds to a moderate fan speed |
| Medium | 2 | Drives fan speeds close to medium |
| High | 1 | Drives fan speeds close to full speed |
| Max | 3 | Drives fan speeds to full speed |
| Off | 255 | Default: no additional offset |

The numbering is out of order: High is 1 and Medium is 2. Off "should not be construed as the fan is not running or that fan speeds cannot change." For noise, Off is the only useful value.

### Minimum Fan Speed in PWM sets a floor

The option, set in PWM (pulse-width modulation) percent, lets you "stipulate a lowest setting below which fans cannot drop." Fans "can run higher than the fan speed that the MFS option sets unless set to 100-percent, but not lower," and 0% PWM "does not indicate that the fan is off." The web interface offers Default, "determined by the system cooling algorithm," or Custom, and a racadm read of 255 means no custom value is applied.

Custom values run from `MFSMinimumLimit` to `MFSMaximumLimit`, which depend on the hardware. The December 2020 user guide quotes 9 to 100 and calls the range dynamic. The fan-control project maintainer recorded [5 percent on an R640, 7 percent on an R740 and 35 percent on an R740xd](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker/issues/360), and an R7425 owner reported a range of [100 to 100 after adding a passively cooled Tesla P40](https://www.dell.com/community/en/conversations/power-cooling/r7425-fans-at-100-with-passively-cooled-gpu-installed-idrac9-7x-firmware/689753751739533d7f4d376a), where Dell's moderator suggested the GPU enablement kit. Offset and floor combine: the algorithm "calculates the appropriate fan speed that meets all the customization requests."

## Which thermal profile and exhaust limit suit a quiet server?

Default thermal profile follows the BIOS System Profile. Dell says Maximum Performance gives "Generally, higher fan speeds at idle and stress loads" and Minimum Power gives "Generally, lower fan speeds." Sound Cap, on supported platforms, caps CPU power "to limit fan speed" at a performance cost. A Level1Techs poster [recommends the Performance Per Watt](https://forum.level1techs.com/t/noob-needs-help-with-dell-r640s/252667?page=2) BIOS profile, a report rather than Dell guidance; the [server BIOS settings](/blog/server-bios-configuration) article covers that side.

Reboot after a profile change. Dell's user guide and KB say "You must reboot the system for the settings to take effect," yet the 2019 white paper lists the web interface as "No reboot required." Reboot, then read the fan RPM.

The exhaust limit defaults to 70 C, a lower limit adds airflow, and holding it "cannot be guaranteed under all conditions." One Level1Techs report had an R640 on iDRAC 7.00.00.184 idling at 17 percent under Proxmox after the owner removed two NICs and two NVMe drives, set the minimum to its new floor of 17, and moved the exhaust target from 40 C back to 70 C. That changed several things at once, so treat it as a pointer.

## How do you stop a third-party PCIe card from spinning the fans up?

On an R640 or R740 you switch the response off one slot at a time, and Dell lists the feature under the [Datacenter license](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_release-notes1_en-us.pdf). Dell's [PCIe cooling white paper](https://downloads.dell.com/manuals/common/poweredge_pcie_cooling.pdf) says the server detects cards it cannot identify and gives them "a default cooling response that is based on an estimate of the cooling requirements for the card," set from the slot's power delivery expectations, "not actual card power consumption." The user guide names the log entry PCI3018; the paper calls it "informational only." In the web interface, PCIe Airflow Settings sit below the fan settings on the same Cooling Configuration page, where LFM Mode and Custom LFM, a value in linear feet per minute, set the response.

<figure>
<img src="/images/blog/idrac-fan-speed-offset/p40-blower.jpg" alt="A Tesla P40 card fitted with an add-on blower fan inside a desktop case" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A Tesla P40, a passively cooled 250 W card, fitted with an add-on blower in a desktop case. Cards without their own fan depend on chassis airflow, so leave the default cooling response on for them. Photo: Tim Sheerman-Chase, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Be_Quiet_PC_Case_Interior_with_GTX_3060_and_P40.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The response "can only be turned off one slot at a time," there is "no universal disable flag," and there is "no customer-facing support" for it over IPMI. Dell advises against disabling it "unless you have a good understanding of the PCIe adapter cooling requirements," and the fans may not slow anyway, because they still run for everything else.

The 13th generation global switch does not work here. Dell's iDRAC9 User's Guide documents a `ThirdPartyPCIFanResponse` object, but it returned "ERROR: Invalid object specified" for an R640 owner on iDRAC9 7.00.00.174 in a [February 2025 thread](https://www.dell.com/community/en/conversations/poweredge-hardware-general/set-systemthermalsettingsthirdpartypcifanresponse-0/67b6f243ec3bc06a19e10211), and a Dell Community "Elder" told a T640 owner in 2018 that the [command "is not valid for an iDRAC9"](https://www.dell.com/community/en/conversations/systems-management-general/idrac9-impossible-to-modify-fan-response-for-3rd-party-pci-cards/647f78adf4ccf8a8de6c1b96). Dell's 13G procedure is [KB 000135682](https://www.dell.com/support/kbdoc/en-us/000135682), and [quieting an R730](/blog/dell-r730-quiet-fans) is the 13th generation companion to this article.

Leave the response on for cards that depend on chassis airflow. NVIDIA's [Tesla P40 data sheet](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/documents/nvidia-p40-datasheet.pdf) lists 250 W with "Passive" cooling. Dell's [fan noise KB](https://www.dell.com/support/kbdoc/en-us/000227912/poweredge-how-to-identify-and-troubleshoot-some-common-causes-of-fan-noise) says unsupported hardware "might cause the system to run the fans higher than normal or even at maximum speed," and drives count: the R640 report above blamed Micron U.3 NVMe drives after fans sat near 61 percent in POST.

## What changed across iDRAC9 firmware, and did Dell remove raw IPMI fan control?

Owner reports, and Dell support replies that owners relay, say yes. Dell's release notes for 3.30.30.30, 3.32.32.32, 3.34.34.34, 3.36.36.36, 3.40.40.40, 4.00.00.00 and 4.20.20.20 do not mention removing fan or IPMI commands, and the [3.34.34.34 notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes2_en-us.pdf) list Cascade Lake and DDR4 2933 support plus a few fixes.

The evidence is secondhand. A T440 owner reported ipmitool failing with "Insufficient privilege level" on 3.34.34.34 and quoted Dell support in a [community thread](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-eng-is-taking-away-fan-speed-control-away-from-users-idrac-3343434/647f8593f4ccf8a8de47aa9b): "Going forward access is not going to be allowed as it affects the thermal algorithms and cooling the system." A [Linux-PowerEdge list message](https://www.mail-archive.com/linux-poweredge@dell.com/msg05292.html) from a non-Dell poster relays the same answer, and the [fan-control project README](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker) lists the commands as available up to 3.30.30.30.

| Firmware | Date | What matters for fans |
|---|---|---|
| 3.00.00.00 | June 2017 | [First iDRAC9 guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf) already covers offset and floor; Sound Cap is "new in the 14th generation" |
| 3.30.30.30 | March 2019 | Dell's white paper recommends this or newer; last to accept raw fan commands, per reports |
| 3.34.34.34 | June 2019 | Raw fan commands refused, per reports |
| 3.36.36.36 | September 2019 | [Fix 141512](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes3_en-us.pdf): fans at 100 percent on some R740xd builds with an HBA330 |
| 4.00.00.00 | December 2019 | Datacenter license tier added; PCIe airflow customization and custom exhaust listed under it |
| 7.00.00.172 | June 2024 | New bootloader; no rollback to 4.40.10.00 or older |
| 7.00.00.185 | August 2026 | Latest 14G release, a security fix |

Dates come from [KB 000178115](https://www.dell.com/support/kbdoc/en-us/000178115/idrac9-versions-and-release-notes) and [KB 000178016](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9), which says 14G feature development "ended on June 30, 2023." One Level1Techs poster reported fans near 12 percent on 3.36.36.36 and near 30 percent on 4.00.00.00 and later.

The old workaround, downgrading to 3.30.30.30, closes once a server takes the June 2024 release. [KB 000225924](https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers) says iDRAC9 "cannot downgrade/rollback to iDRAC9 firmware 4.40.10.00 or older" afterward, because the bootloader "is not backward compatible." Guides such as an [April 2024 post](https://kovasky.me/blogs/fan_control/) still say to downgrade.

## What are the exact racadm and Redfish commands?

SSH is on by default, and Dell's guide says firmware RACADM over SSH needs no IP, user name or password on the command line.

```
ssh root@IDRAC_IP
racadm get System.ThermalSettings
```

A trimmed copy of Dell's 2019 sample output shows the fields to read; your numbers will differ:

```
#FanSpeedLowOffsetVal=25
#FanSpeedMediumOffsetVal=50
#FanSpeedHighOffsetVal=75
FanSpeedOffset=Off
#MFSMaximumLimit=100
#MFSMinimumLimit=12
MinimumFanSpeed=255
ThermalProfile=Default Thermal Profile Settings
```

```
racadm set System.ThermalSettings.FanSpeedOffset 255   # Off; 0 Low, 2 Medium, 1 High, 3 Max
racadm set System.ThermalSettings.MinimumFanSpeed 45   # between MFSMinimumLimit and MFSMaximumLimit
racadm set System.ThermalSettings.ThermalProfile 2     # 0 Default, 1 Max Performance, 2 Min Power, 3 Sound Cap
racadm set System.ThermalSettings.AirExhaustTemp 255   # 255 is 70 C; 0 to 4 are 40 to 60 C
racadm get system.pcieslotlfm.3                        # check #3rdPartyCard=Yes and LFMMode
racadm set system.pcieslotlfm.3.lfmmode disabled       # or automatic, or custom with customlfm
```

A successful set prints "Object value modified successfully," and an unsupported exhaust value fails with "RAC947: Invalid object value specified." To clear a custom floor, choose Default in the web interface. From a management station, Dell's guide says the `-r` option runs racadm over the network.

Redfish reaches the same attributes through Dell's `DellAttributes` resource, which the [Redfish API Guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_api-guide_en-us.pdf) places under `/redfish/v1/Managers/System.Embedded.1/Attributes`, supports `$select`, and gates writes behind the SystemControl privilege. A Dell staff answer on the [community forum](https://www.dell.com/community/en/conversations/systems-management-general/redfish-api-for-updating-thermal-prifile-and-fan-speed-offset-in-idrac89/647f8545f4ccf8a8de42bfa1) shows the body format.

```
curl -sk -u root:PASSWORD 'https://IDRAC_IP/redfish/v1/Managers/System.Embedded.1/Attributes?$select=ThermalSettings.1.FanSpeedOffset'

curl -sk -u root:PASSWORD -X PATCH -H 'Content-Type: application/json' \
  -d '{"Attributes":{"ThermalSettings.1.FanSpeedOffset":"Off"}}' \
  https://IDRAC_IP/redfish/v1/Managers/System.Embedded.1/Attributes
```

Values are the names Off, Low, Medium, High and Max, and `ThermalSettings.1.MinimumFanSpeed` takes a number. Dell's [scripting repository](https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/SetIdracLcSystemAttributesREDFISH.py) uses the longer path `/redfish/v1/Managers/iDRAC.Embedded.1/Oem/Dell/DellAttributes/System.Embedded.1`, and the maintainer reports 404 on it with 3.x firmware, so try the other path if one fails. Slot attributes should follow the same pattern, such as `PCIeSlotLFM.3.LFMMode`; GET first to confirm names. Because `-k` skips certificate checks, keep the iDRAC on a management network, as CISA advises for [IPMI traffic](https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi).

Redfish adds no fan control that racadm lacks; the maintainer's summary is that `MinimumFanSpeed` "cannot do what `FAN_SPEED` does." To watch results, run `racadm getsensorinfo`, or `ipmitool sdr type Fan`, which uses the sensor type filter in the [ipmitool manual](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in).

## What settings suit a quiet homelab R640 or R740?

Undo changes first, then remove causes. Dell's [R640 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf) rates continuous operation at 10 to 35 C, and the baseline follows inlet temperature, so a cooler room helps. The [R740 deep dive](/blog/dell-poweredge-r740-deep-dive) covers the rest of the hardware.

<figure>
<img src="/images/blog/idrac-fan-speed-offset/hot-aisle.jpg" alt="A long aisle between rows of black server cabinets on a raised floor" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A row of server cabinets. The iDRAC's baseline fan speed follows inlet air temperature, so a cooler room lowers it. Photo: Robert.Harker, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Cabinet_Asile.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

1. Run `racadm get System.ThermalSettings`. You want `FanSpeedOffset=Off`, `MinimumFanSpeed=255`, an exhaust limit of 70 C and a profile of Default or Minimum Power.
2. Put the BIOS System Profile on Performance Per Watt if it was changed, per the Level1Techs report.
3. Check the Lifecycle Controller log for PCI3018, and disable the response only for slots holding cards with their own cooling.
4. Test suspect drives and cards by removing them.
5. Close the cover, update the iDRAC, and cool the room. The [iDRAC tips](/blog/dell-idrac-tips-tricks) article covers reaching the iDRAC safely.
6. Reboot, then read RPM with `racadm getsensorinfo`.

Reports in the Level1Techs thread run from 12 to about 30 percent at idle, so expect that, not silence.

## What breaks

**Fans run far above idle after you add a drive, NIC or GPU.** The controller gives hardware it cannot identify a precautionary default response. Fix: check for PCI3018, disable the response for that slot only if the card has its own cooling, and test by removing the drive. An offset only makes it louder.

**`racadm set system.thermalsettings.ThirdPartyPCIFanResponse 0` returns "Invalid object specified."** That object is a 13th generation feature, and reports say it is absent on 14G. Fix: use the slot's `LFMMode` under `System.PCIeSlotLFM`.

**ipmitool raw fan commands return "Insufficient privilege level."** Firmware from 3.34.34.34 refuses them, and a non-administrator account gets the same code, 0xd4, which ipmitool's [source](https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_strings.c) defines that way. Fix: confirm the account is an Administrator; if it is, no supported fix exists and the June 2024 bootloader blocks the downgrade, so use the settings above.

**Setting the offset to 1 turns the fans up to High, not Low.** Dell's index order is 0 Low, 1 High, 2 Medium, 3 Max, 255 Off. Fix: read `FanSpeedOffset` back after each change, or use the names through Redfish.

**A setting seems to do nothing.** Profile changes want a reboot, the floor range may have collapsed to the hardware's minimum, and the license may block the page. Fix: reboot, read `MFSMinimumLimit` and `MFSMaximumLimit`, and check Configuration > Licenses.

**Fans run at full speed for no clear reason.** [KB 000140533](https://www.dell.com/support/kbdoc/en-us/000140533/poweredge-14g-one-or-more-system-fans-unexpectedly-running-at-full-speed) says outdated iDRAC firmware causes this on 14G models including the R640, R740 and R740XD, and [KB 000227912](https://www.dell.com/support/kbdoc/en-us/000227912/poweredge-how-to-identify-and-troubleshoot-some-common-causes-of-fan-noise) adds a lost link to the sensors and a removed cover. Fix: update to 7.00.00.185, seat the cover, and read the Lifecycle Controller log.

## Frequently asked questions

### Can I set a fixed fan speed such as 20 percent on iDRAC9?

Not with a supported setting. The offset adds airflow, the minimum is a floor, and per owner reports the raw IPMI commands that set a fixed speed stopped working at 3.34.34.34. Remove the causes of a high baseline and lower the inlet temperature instead.

### Does Fan Speed Offset Off mean the fans are off or at their quietest?

Neither. Off is the default, and the baseline applies with no added offset. The quietest speed is whatever baseline your hardware and inlet temperature produce.

### Do I need an iDRAC Enterprise license for these settings?

Dell's KB says yes, and its user guide lists PCIe airflow customization as Datacenter only. Express is the default on this class of server, yet one R640 owner on Express reported the section editable, so try a racadm write before buying a license.

## What this means

On an R640 or R740, treat iDRAC9's thermal settings as a way to undo noise, not to tune it. Set the offset to Off, the minimum to Default, the exhaust limit to 70 C and the profile to Default or Minimum Power, then fix whatever raises the baseline, usually an unrecognized card or drive. If you wanted a fixed 20 percent, the community route ended with 3.34.34.34 in June 2019, so choose quieter hardware or a cooler room.

## References

- [Dell KB 000257346: How to change the Server Thermal and Fan Settings](https://www.dell.com/support/kbdoc/en-us/000257346/poweredge-how-to-change-the-fan-speed-offset)
- [Dell white paper: Custom Cooling Fan Options for Dell EMC PowerEdge Servers (October 2019)](https://downloads.dell.com/manuals/common/customcooling_poweredge_idrac9.pdf)
- [Dell white paper: PCIe Card Cooling with Dell EMC PowerEdge Servers (December 2019)](https://downloads.dell.com/manuals/common/poweredge_pcie_cooling.pdf)
- [Dell: iDRAC9 User's Guide, December 2020 Rev. A02](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf)
- [Dell: iDRAC9 3.00.00.00 User's Guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf)
- [Dell: iDRAC9 Redfish API Guide, firmware 4.20.20.20](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_api-guide_en-us.pdf)
- [Dell: iDRAC9 3.34.34.34 Release Notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes2_en-us.pdf)
- [Dell: iDRAC9 3.36.36.36 Release Notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v33-series_release-notes3_en-us.pdf)
- [Dell: iDRAC9 4.00.00.00 Release Notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_release-notes1_en-us.pdf)
- [Dell KB 000178115: iDRAC9 Versions and Release Notes](https://www.dell.com/support/kbdoc/en-us/000178115/idrac9-versions-and-release-notes)
- [Dell KB 000178016: iDRAC9 Support and Management Guide](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9)
- [Dell KB 000225924: RAC0181 firmware downgrade failures on 14G and 15G servers](https://www.dell.com/support/kbdoc/en-us/000225924/rac0181-idrac9-firmware-downgrade-failures-on-14-15g-poweredge-servers)
- [Dell KB 000140533: 14G system fans run at full speed unexpectedly](https://www.dell.com/support/kbdoc/en-us/000140533/poweredge-14g-one-or-more-system-fans-unexpectedly-running-at-full-speed)
- [Dell KB 000227912: Common causes of fan noise](https://www.dell.com/support/kbdoc/en-us/000227912/poweredge-how-to-identify-and-troubleshoot-some-common-causes-of-fan-noise)
- [Dell KB 000135682: Disable the third-party PCIe card cooling response on 13G servers](https://www.dell.com/support/kbdoc/en-us/000135682)
- [Dell: PowerEdge R740 and R740xd Technical Guide](https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r740-r740xd-technical-guide-addcpulist-180912.pdf)
- [Dell: PowerEdge R640 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r640-technical-guide.pdf)
- [Dell Community: Dell ENG is taking away fan speed control (iDRAC 3.34.34.34)](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-eng-is-taking-away-fan-speed-control-away-from-users-idrac-3343434/647f8593f4ccf8a8de47aa9b)
- [Dell Community: set system.thermalsettings.ThirdPartyPCIFanResponse 0](https://www.dell.com/community/en/conversations/poweredge-hardware-general/set-systemthermalsettingsthirdpartypcifanresponse-0/67b6f243ec3bc06a19e10211)
- [Dell Community: iDRAC9 impossible to modify fan response for 3rd party PCI cards](https://www.dell.com/community/en/conversations/systems-management-general/idrac9-impossible-to-modify-fan-response-for-3rd-party-pci-cards/647f78adf4ccf8a8de6c1b96)
- [Dell Community: R7425 fans at 100 percent with a passively cooled GPU](https://www.dell.com/community/en/conversations/power-cooling/r7425-fans-at-100-with-passively-cooled-gpu-installed-idrac9-7x-firmware/689753751739533d7f4d376a)
- [Dell Community: Redfish API for updating thermal profile and fan speed offset](https://www.dell.com/community/en/conversations/systems-management-general/redfish-api-for-updating-thermal-prifile-and-fan-speed-offset-in-idrac89/647f8545f4ccf8a8de42bfa1)
- [Linux-PowerEdge list: iDRAC9 unable to set manual fan response after 3.34.34.34](https://www.mail-archive.com/linux-poweredge@dell.com/msg05292.html)
- [GitHub: tigerblue77 Dell iDRAC fan controller README](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker)
- [GitHub: tigerblue77 issue 360, what Redfish still offers](https://github.com/tigerblue77/Dell_iDRAC_fan_controller_Docker/issues/360)
- [GitHub: Dell iDRAC-Redfish-Scripting, SetIdracLcSystemAttributesREDFISH.py](https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/SetIdracLcSystemAttributesREDFISH.py)
- [Level1Techs forum: Noob needs help with Dell R640s](https://forum.level1techs.com/t/noob-needs-help-with-dell-r640s/252667?page=2)
- [kovasky.me: iDRAC 9 manual fan control on Dell PowerEdge servers](https://kovasky.me/blogs/fan_control/)
- [ipmitool manual page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [ipmitool source: completion code strings](https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_strings.c)
- [NVIDIA: Tesla P40 data sheet](https://www.nvidia.com/content/dam/en-zz/Solutions/design-visualization/documents/nvidia-p40-datasheet.pdf)
- [CISA: Risks of Using the Intelligent Platform Management Interface (IPMI)](https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi)
