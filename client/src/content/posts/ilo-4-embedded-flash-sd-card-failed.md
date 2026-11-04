
## The short answer

On an HPE ProLiant Gen8 or Gen9 server, "Embedded Flash/SD-CARD" in the iLO 4 self-test points at the NAND, a [4 GB flash chip](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) that is [embedded on the system board](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US) and [stores Active Health System (AHS) logs, OneView profiles and Intelligent Provisioning](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US), or at a failed SD card. HPE's documented repair is a fixed sequence: update iLO 4 to 2.61 or later, format the NAND, check iLO Health, and if it is still Degraded, shut the server down, remove AC power and format again. Formatting from the Onboard Administrator, HPQLOCFG, PowerShell or HPONCFG needs iLO 4 2.44 or later, and the web interface's "Format Embedded Flash and reset iLO" button needs 2.61 and [appears only while iLO Health is Degraded](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US). If the iLO is still Degraded after the second format, HPE's advisory calls for a system board replacement. The format erases AHS logs and Intelligent Provisioning, so reboot the server and reinstall Intelligent Provisioning afterward. One owner report describes a worn chip that showed the warning again shortly after a format while the host operating system kept running, so what that owner lost was iLO monitoring, not the server.

## What does "Embedded Flash/SD-CARD" failing on iLO 4 mean?

iLO 4 is the server's out-of-band management controller (the [IPMI article](/blog/ipmi-remote-management) covers the category), and it runs diagnostic self-tests and publishes one result. HPE's user guide defines iLO Health as ["based on the combined results of the iLO diagnostic self-tests"](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-DE11DD4A-9282-4425-93A4-D79370A9AE5A.html&docLocale=en_US), with two values, OK and Degraded. From firmware 2.61 on, a failed flash self-test also puts a warning on the login page and an "iLO Health" status on the Overview and Diagnostics pages, per [HPE advisory a00048622](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US).

The flash is the NAND. The [iLO 4 2.82 User Guide](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US) calls the Embedded Flash "also called the NAND" and "a partition of nonvolatile flash memory that is embedded on the system board." HPE says it [began using NAND in ProLiant servers with Gen8](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00049583en_us), and that Gen8 Intelligent Provisioning is ["built into the server on its NAND chip"](https://support.hpe.com/hpesc/public/docDisplay?docId=c03456549&docLocale=en_US), which is why F10 at POST boots from it. The label also names an SD card, and iLO does watch the internal slot: the guide lists an ["SD-Card Status"](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-DE11DD4A-9282-4425-93A4-D79370A9AE5A.html&docLocale=en_US) field described as "The status of the internal SD card," and HPE has a [separate advisory](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00050883en_us) for an Embedded Flash/SD Card that may intermittently fail to mount on iLO 4 2.60 or earlier, where "the boot will not complete" if the OS is on the card. On Gen9, System Utilities has an [Internal SD Card Slot](https://support.hpe.com/hpesc/public/docDisplay?docId=c04398276&page=s_enable_disable_internal_SD_slot.html&docLocale=en_US) switch under System Options > USB Options, set to Enabled or Disabled.

An owner who removed a failed 32 GB SD card from a DL360e Gen8 on iLO 2.78 still saw ["NAND read failure"](https://be-virtual.net/hpe-proliant-removing-sd-card-ilo-degraded/) on the Diagnostics page, so pulling the card did not clear the line. The strings below come from HPE's advisory and from owner reports:

| Where it appears | Text | Reported by |
|---|---|---|
| Login page | "iLO Self-Test reports a problem with: Embedded Flash/SD-CARD. View details on Diagnostics page." | Owner reports ([one](https://be-virtual.net/hpe-proliant-removing-sd-card-ilo-degraded/), [two](https://blog.fernvenue.com/archives/hpe-proliant-signs-of-age/)) |
| Diagnostics | "Embedded media manager failed initialization" | [HPE advisory c04996097](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) |
| Diagnostics | "The AHS file system mount failed with (No such device)" or "(I/O error)" | HPE advisory c04996097 |
| Diagnostics | "Controller firmware revision 2.09.00 Could not partition embedded media device" | HPE advisory c04996097 |
| Diagnostics | "Controller firmware revision 2.10.00 Embedded media initialization failed due to media write-verify test failure" | Owner reports ([one](https://gbeifuss.github.io/p/resolving-hp-ilo-nand-error/), [two](https://blog.fernvenue.com/archives/hpe-proliant-signs-of-age/)) |
| Active Health System | "bb_dl_disabled" when downloading the log | HPE advisory c04996097 |
| Intelligent Provisioning | F10 does not start it | HPE advisory c04996097 |
| OneView | "Remote Insight/Integrated Lights-Out Self-Test Error 8192", or "Blob Store is not yet initialized. and Status: 126" | HPE advisory c04996097 |

The "controller firmware revision" in these strings is not the iLO version. HPE lists "Controller Firmware Version 2.09.00 may fail to restart" under Embedded Media Errors in [advisory c04996097](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097), which suggests the number belongs to the embedded media controller. Two owner reports that quote 2.10.00 and state their iLO version ran iLO 4 [2.79](https://gbeifuss.github.io/p/resolving-hp-ilo-nand-error/) and [2.78](https://be-virtual.net/hpe-proliant-removing-sd-card-ilo-degraded/), so the number cannot tell you whether your iLO is current. HPE published the first revision of advisory c04996097 on March 31, 2016, so the failure is old and well documented.

## Which Gen8 and Gen9 servers and iLO 4 firmware does the advisory cover?

HPE's scope line reads "Any HPE ProLiant Gen8-series or HPE ProLiant Gen9-series servers with iLO 4." The [NAND format advisory](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US) lists platforms that include the DL360p, DL380p and ML350p Gen8, the MicroServer Gen8, the BL460c Gen8 and Gen9 blades, and the DL360, DL380 and ML350 Gen9. Gen10 servers use iLO 5, which got the same NAND write change in firmware 1.30 according to the [HPE notice](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00049583en_us), but this repair is written for iLO 4. The [iLO generations article](/blog/ilo-6-vs-ilo-7) maps iLO versions to server generations, and the [DL360p Gen8 fan article](/blog/proliant-dl360p-gen8-fan-noise) covers another iLO 4 symptom on the same hardware.

Firmware decides which repair paths exist:

| iLO 4 version | What HPE ties to it |
|---|---|
| 2.44 | Minimum to format the NAND at all; only the web interface method needs more (2.61) |
| 2.50 or older | Run `oemHP_clearRESTapistate` in the iLO CLI before the post-format reboot |
| 2.53 or newer | The post-format reboot repopulates RIS and RESTful data by itself |
| 2.55 | Adds AuxPwrCycle, the remote equivalent of removing AC power |
| 2.60 or earlier | The embedded flash or SD card may intermittently fail to mount |
| 2.61 | Adds the Format button, the login warning and the iLO Health status; reduces NAND writes |
| 2.82 | Release notes published March 2023 recommend this version |

The 2.44, 2.50, 2.53 and 2.55 rows and the first three items in the 2.61 row come from [advisory a00048622](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US), the reduced NAND writes in the 2.61 row from the [write algorithm notice](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00049583en_us), the 2.60 row from [advisory a00050883](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00050883en_us), and the 2.82 row from the [iLO 4 v2.82 release notes](https://support.hpe.com/hpesc/public/docDisplay?docId=c03334036en_us&docLocale=en_US), which say "Recommended to update to HPE iLO 4 2.82 version" and supersede 2.81. The release notes list three fixed items and none concerns the NAND, and HPE's own repair sequence still ends in a board replacement after the firmware update.

HPE calls 2.61 a ["critical update"](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) that improves the write algorithm for the embedded 4 GB flash. The [write algorithm notice](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00049583en_us) explains that 2.61 tailors "the AHS NAND program cycles to the optimal block size NAND writes" for HPE's chips, and says NAND cells have "a defined number of program/erase cycles," and that once the reserved blocks or write count reach a limit "NAND writes will be disabled." The same limit on flash write cycles is why write amplification matters on SSDs, which the [SSD write amplification article](/blog/write-amplification-ssd-endurance) covers. The notice also recommends against downgrading below 2.60, because that restores the older write algorithm.

One upgrade path is risky. [HPE advisory a00060355](https://support.hpe.com/hpesc/public/docDisplay?docId=a00060355en_us&docLocale=en_US) says Gen8 servers on iLO 4 2.30 or earlier "may experience corrupted NAND memory" after upgrading to 2.61, and the fix is to reformat the NAND after the upgrade. An owner who took DL380 G9 servers from iLO 1.4 to 2.79 [reported](https://gbeifuss.github.io/p/resolving-hp-ilo-nand-error/) that two thirds showed the NAND warning afterward.

## In what order does HPE say to fix it?

Advisory c04996097 gives seven steps "completed in the order specified." The [advisory](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) puts the conditions in its overview:

1. Upgrade iLO 4 to 2.61 or later.
2. Format the NAND by one of the methods in the next section.
3. Check iLO status. If it is normal, skip to step 6.
4. If it is still degraded, schedule a maintenance window, shut the server down, perform an AC power pull (DL and ML servers) or an E-fuse reset (blades), and format again.
5. Check iLO status again. If it is normal, continue to step 6.
6. Reboot the server, reinstall Intelligent Provisioning, and refresh the server in OneView if it is managed there.
7. If the iLO is still degraded after steps 1 to 4, replace the system board.

HPE says a format can be done "while the server is online in most cases." The exception is a VMware ESXi host that boots from the embedded SD card: HPE strongly recommends shutting ESXi down for the format, and for iLO firmware updates and iLO resets on such hosts.

## How do you format the NAND from the web interface, HPONCFG or PowerShell?

Log in with administrator-level credentials. The [iLO 4 guide](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US) lists the Configure iLO Settings privilege and a Degraded health status as prerequisites, and it adds that "an experienced support organization" should have recommended the format. [Advisory a00048622](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US) documents five methods:

| Method | Needs | Where it runs |
|---|---|---|
| Web interface | iLO 4 2.61 | Browser, Information > Diagnostics |
| Onboard Administrator CLI | 2.44 | Blades in c3000 and c7000 enclosures only |
| HPQLOCFG | 2.44 | Windows host, local or remote |
| PowerShell | 2.44 | Windows, iLO cmdlets 1.x |
| HPONCFG | 2.44 | Linux or VMware host |

### Web interface

Open Information > Diagnostics and click the "iLO Health" link. HPE says that link, and so the "Format Embedded Flash and reset iLO" button behind it, [shows only when iLO Health is Degraded](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US). Per the [user guide](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US), iLO warns that the process erases all data on the Embedded Flash, asks for confirmation, formats, and then resets itself. The advisory adds that the self-test warning may still display because of browser caching.

### Script methods

All four script methods send the same RIBCL script. HPE says to save it as Force_Format.xml and to replace the user name and password on line 2:

```xml
<RIBCL VERSION="2.0">
<LOGIN USER_LOGIN="adminname" PASSWORD="password">
<RIB_INFO MODE="write">
<FORCE_FORMAT VALUE="all"/>
</RIB_INFO>
</LOGIN>
</RIBCL>
```

From Windows, HPQLOCFG sends the script to a remote iLO. Put the file in the folder that holds the utility, which is `C:\Program Files (x86)\Hewlett-Packard\HPLights-OutConfiguration Utility` by default, and run:

```bat
HPQLOCFG.exe -s <IPofTargetiLO> -u <iLO-Username> -p <Password-For-iLO> -f Force_Format.xml
```

From PowerShell, HPE requires the iLO cmdlets at version 1.5.0.1 or earlier, because version 2.x does not include the Invoke-HPiLORIBCLCommand cmdlet. Both versions can be installed on the same machine.

```powershell
$xml = ([string](Get-Content "C:\RIBCL_XML\Force_Format.xml"))
Invoke-HPiLORIBCLCommand -Server <iLO-IP> -Username Administrator -Password <password> -RIBCLCommand $xml -DisableCertificateAuthentication
```

If the PowerShell commands are accepted, the output shows a WARNING status with the message "Forcing a format of the partition after the iLO reset." On a Linux or VMware host, run HPONCFG from `/opt/hp/tools`:

```bash
cd /opt/hp/tools
./hponcfg -f Force_Format.xml
```

Success prints "Script succeeded for IP:XXX.XXX.XXX.XXX." The advisory's revision table mentions `-i` for the Linux command, but its instructions use `-f`, and the [iLO 4 scripting guide](https://support.hpe.com/hpesc/public/docDisplay?docId=c03334058&docLocale=en_US) defines `-f` as reading the script from a file and `-i` as reading it from standard input. The same guide says HPONCFG on the host needs an Administrator or root account on the host. On a blade, the Onboard Administrator method pastes the same XML after `HPONCFG <bay #> << end_marker`, using the bay number of the blade.

### How do you confirm it worked?

HPE lists four checks for iLO 4 2.61 or newer:

- The login page no longer shows the self-test warning, after refreshing the browser cache.
- iLO Health on the Overview page reads OK.
- The iLO Event Log contains "Embedded Flash/SD-CARD: One or more storage devices have been formatted".
- The Diagnostics page shows the iLO self-test as normal.

If the format fails, HPE says "additional steps will be required," which leads to the next section.

## Why does HPE say an AC power removal may be needed?

HPE does not give a reason. Its wording is that "A server AC power removal may be required (prior to the NAND format) in order for the NAND format to be successful." For ML and DL servers that means shutting down and disconnecting the power cables "for a few seconds." For blades it means an E-fuse reset, which is `reset server #` in the Onboard Administrator CLI, where # is the bay number. Firmware 2.55 added AuxPwrCycle so the equivalent can be done remotely, and the [advisory](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US) gives no syntax for it.

The two advisories place the power pull differently. The format advisory says it may be needed before the format, while [c04996097](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) makes it step 4, after a first format leaves the iLO degraded. If the server has to be shut down for step 4 anyway, the format advisory's wording permits doing the pull before the first format.

Owner reports fit the second order. An administrator with DL380 G9 servers said resetting iLO and cycling the server did nothing, the format left the same error, and removing the power cord for 15 seconds cleared it, in a [December 2021 post](https://gbeifuss.github.io/p/resolving-hp-ilo-nand-error/). A [2019 post](https://kallesplayground.wordpress.com/2019/06/24/hpe-ilo-problem-with-embedded-flash-sd-card/) on two BL490c Gen9 blades says the format cleared one and the other needed an E-fuse reset from the Onboard Administrator. The DL360e Gen8 owner above reported that removing power and restarting iLO left the health Degraded, and that the eventual fix took about three hours.

A caution for blades under OneView: if the NAND is inaccessible, advisory c04996097 says an E-fuse reset means the server "will not be able to be brought back under management until the NAND issue is remediated," which causes an unexpected outage. A profile that is unassigned cannot be reassigned until the NAND is repaired.

## What do you lose, and how do you reinstall Intelligent Provisioning afterward?

The format erases everything on the Embedded Flash, and per the [iLO 4 guide](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US), external providers such as Intelligent Provisioning and the BIOS "must be reconfigured." Concretely:

- **AHS history.** An HPE support article says a NAND format ["will clear Entire AHS entries."](https://support.hpe.com/hpesc/public/docDisplay?docId=sf000079969en_us&docLocale=en_US) The same article covers a milder case, an AHS log that stops collecting current boot entries on iLO 4 2.61 or newer because the system cannot overwrite existing NAND data. Its first fix is to clear the log from the iLO web interface under Active Health System log, Show Advanced Settings, and the format is the alternative.
- **The OneView blob store.** The format wipes it, so refresh the server in OneView and mark old errors cleared.
- **Intelligent Provisioning.** Reinstall it, then confirm it shows as installed on the System Information, Firmware Information page.

If the server was on during the format, reboot it. On 2.53 or newer the reboot repopulates the RIS and RESTful data. On 2.50 or older, connect to the iLO CLI first and run `oemHP_clearRESTapistate`, which the scripting guide spells `oemhpe_clearRESTAPIstate` and describes as clearing "any data cache stored by the HPE RESTful interface."

Intelligent Provisioning comes in two lines for these servers: 1.x for Gen8 and 2.x for Gen9, with 3.x reserved for Gen10, per [advisory c04996097](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097). A Windows or Linux host can reinstall it online with a package from HPE, while a VMware host needs the offline recovery media. The advisory says the DVD can be reused and can be mounted remotely through iLO virtual media. The versions it lists are Gen8 recovery media 1.70 from October 2017 and Gen9 recovery media 2.70(b) from February 2018, so check HPE's revision history for anything newer.

## When is the fix a system board replacement?

When steps 1 to 4 leave iLO Health Degraded. HPE's step 7 says to contact HPE support, open a case, and during a maintenance window shut the server down, unassign any OneView profile, replace the system board, enter the server model and serial number through RBSU, update to iLO 4 2.61 or later, check iLO status, and reassign the profile. That fits the user guide's description of the NAND as embedded on the system board: HPE's documented remedy names the board, not a flash module. The advisory assumes a support case, and it does not say whether a used server without a contract qualifies, so ask HPE before counting on that route.

One owner report shows how a worn board can behave. A [September 2025 post](https://blog.fernvenue.com/archives/hpe-proliant-signs-of-age/) about two DL388p Gen8 servers in service for about ten years says the Format Embedded Flash button appeared to work, but the same warning returned shortly afterward, and the author concluded the NAND was worn. The author also reported that this does not affect the normal operation of the services on the server's OS, and used `ssacli` to watch the array and drives without iLO. HPE's [Management Component Pack](https://downloads.linux.hpe.com/SDR/project/mcp/) lists `ssacli` as the "HPE Command Line Smart Storage Administration Utility." The [P420i HBA mode article](/blog/smart-array-p420i-hba-mode) covers the Smart Array controller in these Gen8 servers.

For a used purchase, the iLO login page is a free test. A Gen8 or Gen9 unit on 2.61 or newer shows the self-test warning there, so log in before paying. On older firmware the warning is not on the login page, so open the Diagnostics page, where [HPE lists](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097) messages such as "Embedded media manager failed initialization." The [used enterprise gear article](/blog/buying-used-enterprise-gear) has a receiving checklist to run alongside it.

## What can go wrong during the fix?

**There is no "Format Embedded Flash and reset iLO" button.** The button needs iLO 4 2.61 and a Degraded iLO Health status. Fix: update the iLO, or use a script method on 2.44 or newer. If iLO Health reads OK, the button is hidden by design: HPE's guide lists a Degraded iLO Health as a prerequisite for the format.

**The warning is still on the login page after the format.** HPE says browser caching can keep it on screen, so refresh the cache and read iLO Health and the Event Log instead. If the log lacks the "have been formatted" line, do the AC power pull or E-fuse reset and format again.

**The warning comes back shortly after a format.** The DL388p Gen8 owner above read that as a worn chip. Fix: monitor storage from the OS with `ssacli`, or follow step 7.

**The error appeared right after a firmware upgrade.** HPE says Gen8 servers on 2.30 or earlier may corrupt the NAND on the way to 2.61. Fix: format the NAND after the upgrade, as HPE directs, and expect to lose AHS history.

**`Invoke-HPiLORIBCLCommand` is not recognized.** The 2.x cmdlets lack it. Fix: install iLO cmdlets 1.5.0.1 or earlier beside the newer version.

**An ESXi host boots from the SD card.** HPE strongly recommends shutting ESXi down before the format, a firmware update or an iLO reset. If the card fails to mount on 2.60 or earlier, the boot will not complete. Fix: update to 2.61 and reboot.

**A OneView server cannot be added or a profile cannot be assigned.** OneView uses the NAND blob store. Fix: repair the NAND first, then refresh the server.

**Intelligent Provisioning does nothing on F10 after the format.** The format removed it. Fix: reinstall it from HPE's package or recovery media and check the Firmware Information page.

## Sources

- [HPE: Advisory, How to Format the NAND Used to Store AHS logs, OneView Profiles, and Intelligent Provisioning (a00048622)](https://support.hpe.com/hpesc/public/docDisplay?docId=a00048622en_us&docLocale=en_US)
- [HPE: Advisory, AHS Logs and OneView Profiles May Be Unavailable Causing iLO Self-Test Error 8192, Embedded Media Manager and Other Errors (c04996097)](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-c04996097)
- [HPE: Notice, Critical iLO 5 Firmware 1.30 and iLO 4 Firmware 2.61 Include Write Algorithm Enhancements That Prolong NAND Life (a00049583)](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00049583en_us)
- [HPE: Advisory, Gen8 Servers with iLO 4 Firmware 2.30 (or Earlier) May Corrupt NAND After Upgrade to iLO 4 2.61 (a00060355)](https://support.hpe.com/hpesc/public/docDisplay?docId=a00060355en_us&docLocale=en_US)
- [HPE: Advisory, Embedded Flash/SD Card May Intermittently Fail To Be Mounted with iLO 4 (a00050883)](https://support.hpe.com/hpesc/public/docDisplay?docId=emr_na-a00050883en_us)
- [HPE: iLO 4 2.82 User Guide, Formatting the Embedded Flash](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-CC78938D-F80A-441F-947B-566BA87E0214.html&docLocale=en_US)
- [HPE: iLO 4 2.82 User Guide, System status details](https://support.hpe.com/hpesc/public/docDisplay?docId=sd00001038en_us&page=GUID-DE11DD4A-9282-4425-93A4-D79370A9AE5A.html&docLocale=en_US)
- [HPE: iLO 4 v2.82 Release Notes](https://support.hpe.com/hpesc/public/docDisplay?docId=c03334036en_us&docLocale=en_US)
- [HPE: iLO 4 Scripting and Command Line Guide, April 2021](https://support.hpe.com/hpesc/public/docDisplay?docId=c03334058&docLocale=en_US)
- [HPE: ProLiant Gen8-series or Gen9-series Servers with iLO 4, How to Fix Incomplete AHS Log (sf000079969)](https://support.hpe.com/hpesc/public/docDisplay?docId=sf000079969en_us&docLocale=en_US)
- [HPE: Notice, Intelligent Provisioning Replaces SmartStart Media in ProLiant Gen8-Series Servers (c03456549)](https://support.hpe.com/hpesc/public/docDisplay?docId=c03456549&docLocale=en_US)
- [HPE: UEFI System Utilities User Guide for HPE ProLiant Gen9 Servers and HPE Synergy, Internal SD Card Slot](https://support.hpe.com/hpesc/public/docDisplay?docId=c04398276&page=s_enable_disable_internal_SD_slot.html&docLocale=en_US)
- [HPE Software Delivery Repository: Management Component Pack](https://downloads.linux.hpe.com/SDR/project/mcp/)
- [Greg Beifuss: Resolving HP iLO NAND Error](https://gbeifuss.github.io/p/resolving-hp-ilo-nand-error/)
- [Kalle's playground: HPE iLO problem with Embedded Flash/SD-CARD](https://kallesplayground.wordpress.com/2019/06/24/hpe-ilo-problem-with-embedded-flash-sd-card/)
- [Be-Virtual.net: HPE ProLiant Removing SD Card iLO Degraded](https://be-virtual.net/hpe-proliant-removing-sd-card-ilo-degraded/)
- [fernvenue's Blog: HPE ProLiant, Signs of Age](https://blog.fernvenue.com/archives/hpe-proliant-signs-of-age/)
