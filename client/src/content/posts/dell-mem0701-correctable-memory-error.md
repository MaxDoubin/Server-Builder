
## The short answer

MEM0701 is a Warning that a DIMM's correctable error rate passed the limit the server firmware allows, logged as "Correctable memory error rate exceeded" with the DIMM location. Dell's message reference calls it ["an early indicator of a possible future uncorrectable error"](https://www.manualsdir.com/manuals/620821/dell-poweredge-vrtx.html?page=378) and says to reinstall the memory, but Dell's guidance for 14th generation servers is to restart without moving the DIMM so the BIOS can run memory retraining and [Post Package Repair](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) (PPR), then look for MEM0804 (repaired) or MEM0805 (repair failed, replace the DIMM). MEM0702 is the same message at Critical severity (Warning from 14G BIOS 2.4.x), [MEM0802 replaces it](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) on 14G RDIMM and LRDIMM systems from BIOS 2.5.x, and MEM0005 reports a persistent error limit. One event is not a verdict: Dell's memory RAS white paper says [some correctable errors per DIMM are "unavoidable"](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf), and Google's fleet study found [8.2 percent of DIMMs and 32.2 percent of machines](https://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf) had at least one a year. On 13th generation servers, [BIOS 2.3.x could reboot the machine](https://www.dell.com/support/kbdoc/en-us/000141221/dell-poweredge-13g-possible-reboot-after-correctable-memory-errors) after the event, and a [repost of Dell's notice](https://matjamsharing.blogspot.com/2017/09/dell-r430-r530-r630-r730-r830-r930-m630.html) gives 2.4.3 as the R630 and R730 fix.

## What do MEM0701, MEM0702, MEM0802 and MEM0005 mean, and how serious is each?

All four report correctable errors on one DIMM, errors the platform detected and corrected, which Dell's [white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) says "will not disrupt operation of PowerEdge servers." Dell's Event and Error Messages Reference (the PowerEdge VRTX edition, [mirrored here](https://www.manualsdir.com/manuals/620821/dell-poweredge-vrtx.html?page=378)) lists MEM0701 as Severity 2 (Warning) in the System Health category, with the response "Re-install the memory component. If the problem continues, contact support." The same entry says no LCD message is defined, so the front panel can stay quiet. Dell's [PMem 100 guide](https://www.dell.com/support/manuals/en-us/poweredge-r740/dcpmm_ug_pub/events-during-runtime?guid=guid-c7ba5af1-7aa3-4c2e-8a84-e5ea7993d3c8&lang=en-us) repeats that action.

| ID | What it reports | Severity | Dell's response |
|---|---|---|---|
| MEM0701 | Correctable memory error rate exceeded for a DIMM | Warning | Reinstall the memory; on 14G, restart so retraining and PPR run |
| MEM0702 | Same text | Critical at first, Warning from BIOS 2.4.x (December 2019) on 14G | Same as MEM0701 |
| MEM0802 | Replaces MEM0702 on RDIMM and LRDIMM, BIOS 2.5.x or later | Not stated | Restart so PPR runs; do not move the DIMM |
| MEM0005 | Persistent correctable error limit reached | Critical | Restart so retraining and PPR run |
| MEM8000 | Correctable error logging disabled for a DIMM | Not stated | Reseat the DIMM, do not swap or move it |
| MEM0804 | PPR succeeded (replaces MEM9060) | Not stated | None, no replacement needed |
| MEM0805 | PPR failed (replaces UEFI0278) | Not stated | Replace the DIMM |

Severities, retraining triggers and the MEM0802, MEM0804 and MEM0805 replacements come from [Dell KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors). The MEM8000 action comes from Dell's [memory RAS white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf), which on MEM0805 says "Contact Dell technical support" where the KB says to replace. Dell's 14G and 15G guidance also names MEM5104 as a threshold event and MEM7114 as a failed repair, per [KB 000194574](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events).

The MEM0701 and MEM0702 pair shows up in operator logs. A Wikimedia operations ticket from April 2019 records [the same line for DIMM_A5](https://phabricator.wikimedia.org/T221502) at 13:33:36 as Non-Critical and at 13:56:56 as Critical, and a December 2017 ticket logs [DIMM_B2](https://phabricator.wikimedia.org/T183176) the same way seven minutes apart. Neither prints the message ID, but a Non-Critical then Critical pair matches the severities Dell lists. The [ECC RAM explainer](/blog/ecc-ram-explained) covers why an ECC server corrects these without crashing.

## Is one correctable error a reason to replace the DIMM?

No, and Dell has said so in writing. The white paper says that "some correctable errors per DIMM is unavoidable and does not inherently warrant a memory module replacement," while firmware monitors "DIMM capacity, rates of correctable errors, and effectiveness of available self-healing." [KB 000194574](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events) says continuing to run a system that reports correctable errors, without restarting for self-repair, does not raise the risk of uncorrectable errors, and recommends replacement only when a repair fails and the system logs MEM0805 or MEM7114.

The field data points the same direction with a caveat. Google's study of DDR1, DDR2 and FBDIMM memory over 2.5 years, [Schroeder, Pinheiro and Weber at SIGMETRICS 2009](https://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf), is older than DDR4 and not a Dell dataset, but its Table 1 sets the base rates:

| Measure, per year (fleet-wide) | Share | In 10,000 |
|---|---|---|
| Machines with a correctable error | 32.2 percent | 3,220 |
| DIMMs with a correctable error | 8.2 percent | 820 |
| Machines with an uncorrectable error | 1.29 percent | 129 |
| DIMMs with an uncorrectable error | 0.22 percent | 22 |

A DIMM with a correctable error in a month was between 27 and more than 400 times as likely to log an uncorrectable one that month as a DIMM without one, and 9 to 47 times as likely in the following month, depending on platform. The absolute odds stayed low, though: [1.7 to 2.3 percent](https://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf) per month on the two platforms the paper quotes. Its authors concluded that replacing DIMMs solely on correctable errors "might be worth the price only in environments where the cost of downtime is high enough to outweigh the cost of the relatively high rate of false positives." Errors also cluster: the top 20 percent of DIMMs with errors produced over 94 percent of all errors, and in more than 85 percent of cases an error was followed by another in the same month.

Dell staff on its community forum have not been uniform. In a 2021 thread on an R630, a Dell staff reply said the "Correctable ECC logging limit reached" warning [means logging is disabled](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-poweredge-r630-correctable-ecc-logging-limit-reached-warning/647f9358f4ccf8a8de561474) and suggested a swap test. In a 2024 thread on an R730 with BIOS 2.18.1, a Dell moderator answered a DIMM A10 "Correctable Memory Error Log Limit Reached" alert with ["The error means it's time for a replacement, I'm afraid"](https://www.dell.com/community/en/conversations/poweredge-hardware-general/poweredge-r730-dimm-a10-correctable-memory-error-log-limit-reached/65f1d8a2415a967d318cc062). Those are individual replies, while the KB is Dell's published position.

| Situation | Dell's guidance |
|---|---|
| First MEM0701, MEM0702 or MEM0802 | Restart at the earliest convenience, do not move the DIMM |
| MEM0804 after the restart | No action, no replacement |
| MEM0805 or UEFI0278 | Replace the DIMM |
| Retraining fails, or the same errors keep occurring | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) says replacement is not necessary unless retraining fails (UEFI0106) or these same errors continue to occur |
| MEM8000 | Reseat the DIMM, do not move it, contact support if it persists |

## How do you find the slot and the error history?

The location is in the message itself, written as a socket name such as DIMM_A5 or B2. Dell's [memory troubleshooting article](https://www.dell.com/support/kbdoc/en-us/000304931/powerege-general-memory) says to check the Lifecycle Controller log and follow its recommended actions for a single failing DIMM, and to contact support when several DIMMs report errors. The [iDRAC tips](/blog/dell-idrac-tips-tricks) article covers sending both the System Event Log (SEL) and the Lifecycle log off the BMC with remote [syslog](/blog/syslog-centralized-logging), and the [server memory architecture](/blog/server-memory-architecture) article explains how DIMM slots map to each CPU's channels.

From a shell on the iDRAC, Dell's [RACADM CLI guide](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf) documents these commands:

```bash
ssh root@IDRAC_IP
racadm getsel -i                                # number of SEL records
racadm getsel -o                                # one line per SEL record
racadm lclog view -s warning,critical           # Lifecycle log, Warning and Critical records only
racadm lclog view -k MEM                        # Lifecycle log, records that match a string
racadm hwinventory                              # hardware inventory, including DIMM entries
```

To keep a copy on the workstation, run `ssh root@IDRAC_IP "racadm getsel -o" > sel-before.txt`. The guide says `getsel -o` shows each record on a single line, `lclog view -k` filters on a string and `-s` takes Warning, Critical and Info. Its `hwinventory` sample output lists a module as `DIMM.Socket.A1` with Manufacturer, PartNumber, SerialNumber, Size and Speed, which is what a support case or a replacement order needs. The `-k` filter is the one to test first: in a [2018 Dell Community thread](https://www.dell.com/community/Rack-Servers/racadm-lclog-view-k-lt-string-gt-doesn-t-work/td-p/6238030) on a 13th generation server, Dell staff said it works on 14G but not on 12G or 13G firmware, so on older iDRACs run `racadm lclog view` over ssh from the workstation and filter the text with `grep`. For a remote read over [IPMI](/blog/ipmi-remote-management), the [ipmitool manual](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in) documents `sel list` and `sel elist`, and `elist` also prints the sensor ID behind each event.

```bash
ipmitool -I lanplus -H IDRAC_IP -U root -a sel elist | grep -i -E "memory|dimm"
```

On a Linux host, the kernel's [RAS documentation](https://docs.kernel.org/admin-guide/RAS/main.html) describes a per-DIMM `dimm_ce_count` file under the EDAC (Error Detection And Correction) tree and says the count "is very important to examine" because correctable errors "provide early indications that a DIMM is beginning to fail."

```bash
grep -H . /sys/devices/system/edac/mc/mc*/dimm*/dimm_ce_count
grep -H . /sys/devices/system/edac/mc/mc*/dimm*/dimm_label
```

That tree is filled in by the EDAC driver for the CPU's memory controller, while Dell's MEM messages come from the server firmware, so treat the iDRAC log as the record of threshold events and the EDAC counts as a second view. Save the SEL before clearing it: a used server's log is a record of what the machine reported at its previous job, as the [used enterprise gear](/blog/buying-used-enterprise-gear) checklist advises.

## What are DDR4 self-healing and Post Package Repair on 14th generation servers?

Self-healing is Dell's name for two BIOS actions that run at the next boot after a threshold event: memory retraining and PPR. [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) covers servers with first and second generation Xeon Scalable processors on BIOS 2.1.x or later, and Dell's [white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) lists the R640 and R740 among them (the [R740 deep dive](/blog/dell-poweredge-r740-deep-dive) covers that platform).

### What do retraining and PPR do?

Retraining runs early in boot and tunes signal timing and margining for each DIMM and slot, which drift with configuration changes, BIOS memory reference code changes, operating temperature and DIMM age, per [the KB](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors). The KB says PPR "repairs a failing memory location by disabling the location or address at the hardware layer" so that a spare row is used instead. [The white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) calls it a JEDEC-defined capability in which a module swaps a degraded row for a spare, through electrical fusing that is permanent. JEDEC requires at least one spare row per DRAM bank group. Dell requires a significantly larger number in genuine Dell DIMMs, and says any genuine Dell RDIMM or LRDIMM rated 2666 MT/s or higher has the extended pool. The paper makes no equivalent promise for other modules, so spare-row headroom on third-party memory is unconfirmed.

PPR can only happen at the start of boot, before memory training and test, and the BIOS may promote a warm reset to a cold one. [The KB](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) says MEM0701, MEM0702 and MEM0005 schedule both actions for the next restart, and warns "DO NOT change DIMM slot locations until the PPR operation has been run," because the repair is scheduled on a specific slot. That differs from the swap test Dell staff suggested in the 2021 R630 thread: on BIOS 2.1.x or later, Dell's first step is a restart without moving anything. The BIOS can also act without a reboot. Per [the white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf), on x4 DIMMs with two or more ranks per channel, Adaptive Double Device Data Correction maps out a failing DRAM bank when its error count nears a BIOS threshold, and Memory Page Retire asks the OS to stop using 4 KB pages.

### What changed by BIOS version?

| BIOS (14G Intel) | Change | Source |
|---|---|---|
| 2.1.x | MEM0701, MEM0702 and MEM0005 schedule retraining and PPR | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) |
| 2.4.x, December 2019 | MEM0702 lowered from Critical to Warning; needs a December 2019 or newer iDRAC | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) |
| 2.5.x, February 2020 | MEM0802, MEM0804 and MEM0805 added for RDIMM and LRDIMM; Correctable Error Logging option arrives (2.5.4 per [KB 000194574](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events)) | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) |
| 2.7.x, July 2020 | MEM8000 and MEM0001 schedule PPR; 2.7.7 adds repair after consumed uncorrectable errors and covers "questionable" locations | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors), [white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) |
| 2.8.2, September 2020 | MEM9072 (uncorrectable error found by patrol scrub) schedules PPR | [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) |
| 2.13.3, March 2022 onward | Correctable Error Logging defaults to Disabled | [KB 000194574](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events) |

KB 000194574 excludes 14th generation AMD servers such as the 64x5 and 74x5, which lack the automatic repair feature, and a [PowerFlex KB](https://www.dell.com/support/kbdoc/en-uk/000307996/powerflex-poweredge-dimm-ecc-correctable-memory-memxxxx-errors) gives 13th generation nodes on BIOS 2.8.x or later the same restart-first advice.

### What does the Correctable Error Logging setting change, and what is MEM8000?

Dell added the Correctable Error Logging option in 14G Intel BIOS 2.5.4 so customers could turn off reporting of threshold events, and [KB 000194574](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events) says many did. Since March 2022, Dell BIOS updates ship with it Disabled: 14G Intel BIOS 2.13.3 or later, 15G Intel 1.5.5 or later and 15G AMD 2.6.5 or later. With logging off, the BIOS still schedules the repair, and a failed repair is still logged as MEM0805 or MEM7114. The setting sits under BIOS Settings > Memory Settings, in F2 System Setup or the iDRAC web interface, and Dell's [17G tuning guide](https://www.dell.com/en-us/infohub/articles/dell-poweredge-17g-server-bios-settings-for-optimized-performance-r7725-r6725-r7715-r6715) still lists it as Disabled by default, described as "Enable or disable logging of correctable memory threshold error." A quiet SEL therefore does not prove a quiet DIMM.

MEM8000 is a different case. The white paper says the system is "encountering correctable errors at a rate and pattern that may impact system performance," so logging was "temporarily disabled" at that DIMM, and BIOS 2.7.7 changed its signaling after an uptick in MEM8000 events that component failure analysis did not substantiate. A Dell staff member told a poster in a [2022 community thread](https://www.dell.com/community/en/conversations/systems-management-general/ecc-error-threshold/647f9e3af4ccf8a8de2cd125) that logging "is suspended, until cleared." The same poster quoted an unnamed Dell article as saying an SEL entry is written once per 10 correctable errors on a DIMM and that reporting "gets turned off after 10 such occurrences," which the poster read as about 100 errors. That thread is the only source for the figure here, and the Dell staff who replied did not confirm a number.

## Why did some 13th generation servers reboot after a correctable error?

BIOS 2.3.x on 13th generation PowerEdge servers could reboot after a correctable error was written to the SEL. [Dell KB 000141221](https://www.dell.com/support/kbdoc/en-us/000141221/dell-poweredge-13g-possible-reboot-after-correctable-memory-errors) describes it as rare and seen only on 2.3.x, mostly on the R630 and R730 but possible across 13G, and the fix is a newer BIOS. A [September 2017 repost of Dell's notice](https://matjamsharing.blogspot.com/2017/09/dell-r430-r530-r630-r730-r830-r930-m630.html) gives the mechanism and the fixed versions. A change in 2.3.x added SPD logging with a null pointer dereference that, once the critical correctable threshold was exceeded, could cause a machine check or lockup. The repost's sample Lifecycle log lists SYS1003 (System CPU Resetting) and SYS1001 (System is turning off) alongside a MEM0702 entry.

| Model (per the repost) | BIOS with the fix |
|---|---|
| R630, R730 | 2.4.3 |
| R430, R530, T430, T630, C4130, C6320, all modular blades | 2.4.2 |
| R830 | 1.4.2 |

The repost lists the T130, R230, T330, R330 and R930 as not affected, and says to troubleshoot normally if errors continue after the update. It is a copy and Dell's article is the authority, so check the model against the KB. The [R730 vs R730xd](/blog/dell-r730-vs-r730xd) comparison covers the hardware side, and the [BIOS configuration](/blog/server-bios-configuration) article covers memory settings.

## How do you clear the error and test whether it comes back?

Update first, restart without moving anything, and then watch the logs. Dell's [memory troubleshooting article](https://www.dell.com/support/kbdoc/en-us/000304931/powerege-general-memory) lists the initial steps, and the self-healing KB adds the restart rule.

1. Check firmware and update the CPLD (where the model has one), iDRAC and BIOS, per KB 000304931. Servers on BIOS 2.0 or earlier need the update to get self-healing at all, per [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors).
2. Save the SEL with `racadm getsel -o`, then restart without moving DIMMs. The [white paper](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) warns the BIOS "may initiate more reboots during this process."
3. Read the log for MEM0804 (repaired), MEM0805 (replace) or UEFI0106 (retraining failed).
4. If errors persist, Dell's steps are to power off and drain the server, reseat the memory modules, clear the SEL (`racadm clrsel`, which the [CLI guide](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf) says removes all records and needs Clear Logs permission), restart, and collect a SupportAssist (TSR) log to check for new memory messages.
5. Use a swap test only when repair has been tried. In the 2021 R630 thread, Dell staff advised clearing the log and [swapping with a matching DIMM](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-poweredge-r630-correctable-ecc-logging-limit-reached-warning/647f9358f4ccf8a8de561474): an error that follows the DIMM means a bad DIMM, and one that stays at the slot points to the board.

A memory tester helps less than it sounds. [MemTest86's ECC page](https://www.memtest86.com/ecc.htm) says it polls errors from chipset and memory controller registers, that "there is no common ECC error framework," and that out-of-band monitoring through a BMC can explain missing reports. A pass on the screen is therefore weaker evidence than a clean iDRAC log, and a quiet day proves little. In Google's data, [more than 93 percent of the time](https://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf) a machine that saw a correctable error saw at least one more within the same year, so compare the SEL and EDAC counts after a week and a month. In the 2019 Wikimedia case, a reboot did not clear the alerts, the ticket was closed as resolved on May 6 when the host recovered on its own, and it was [reopened on May 30](https://phabricator.wikimedia.org/T221502) for a DIMM swap.

## What breaks

**New message IDs show as "unknown" in the SEL.** Dell says the MEM08xx messages need a February 2020 or newer iDRAC, and the MEM0702 warning needs December 2019 or newer. Fix: update the iDRAC, per [KB 000053203](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors).

**An R630 or R730 reboots by itself right after MEM0702.** This matches the BIOS 2.3.x defect in [KB 000141221](https://www.dell.com/support/kbdoc/en-us/000141221/dell-poweredge-13g-possible-reboot-after-correctable-memory-errors). Fix: update the BIOS to 2.4.3 or newer, then troubleshoot any remaining errors normally.

**A DIMM was moved before the restart, and the result is hard to read.** PPR is scheduled against a specific slot, and [Dell says](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) to leave DIMMs in place until it has run. Fix: put the DIMM back, restart, and read the log for MEM0804 or MEM0805 before judging the slot.

**The SEL shows no MEM0701, yet a DIMM looks unhealthy.** On 14G and 15G, Correctable Error Logging has defaulted to Disabled since March 2022, so threshold events are not logged by default. On 13G, owners report a "log limit reached" alert instead, as in the 2021 R630 and 2024 R730 threads, where the R730 poster saw it in the iDRAC memory health section. Fix: read the Memory page in the iDRAC and the Lifecycle log for MEM0804 and MEM0805, and re-enable the setting only if you want threshold events logged.

**MEM0805 appears after the restart.** PPR failed, and [Dell's KB](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors) says to replace the DIMM. The [white paper's](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf) larger spare-row pool is promised only for genuine Dell modules. Fix: replace it, and note the part and serial numbers from `racadm hwinventory` for the order or the support case.

**The same slot keeps reporting after a swap or a replacement.** A [Dell staff reply](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-poweredge-r630-correctable-ecc-logging-limit-reached-warning/647f9358f4ccf8a8de561474) says an error that stays at the slot after a swap suggests the board. Fix: update BIOS and iDRAC, reseat the module, and contact support if several DIMMs report errors, per [KB 000304931](https://www.dell.com/support/kbdoc/en-us/000304931/powerege-general-memory).

## Sources

- [Dell KB 000053203: What is DDR4 Self-healing with Intel Xeon Scalable Processors](https://www.dell.com/support/kbdoc/en-us/000053203/what-is-ddr4-self-healing-on-dell-poweredge-servers-with-intel-xeon-scalable-processors)
- [Dell KB 000194574: 14G Intel and 15G PowerEdge Servers, Managing Correctable Error Threshold Events](https://www.dell.com/support/kbdoc/en-us/000194574/14g-intel-and-15g-intel-amd-poweredge-servers-ddr4-memory-managing-correctable-error-threshold-events)
- [Dell KB 000304931: PowerEdge Memory Issues Troubleshooting Guidelines](https://www.dell.com/support/kbdoc/en-us/000304931/powerege-general-memory)
- [Dell KB 000141221: PowerEdge 13G Possible Reboot After Correctable Memory Errors](https://www.dell.com/support/kbdoc/en-us/000141221/dell-poweredge-13g-possible-reboot-after-correctable-memory-errors)
- [Dell KB 000307996: PowerFlex PowerEdge DIMM ECC Correctable Memory MEMXXXX Errors](https://www.dell.com/support/kbdoc/en-uk/000307996/powerflex-poweredge-dimm-ecc-correctable-memory-memxxxx-errors)
- [Dell: Memory Errors and PowerEdge YX4X Server Memory RAS Features, revision 1.1 (July 2020)](https://dl.dell.com/manuals/common/dellemc_poweredge_yx4x_memoryras_v1_1.pdf)
- [Dell: PowerEdge VRTX Event and Error Messages Reference, MEM0701 and MEM0702 entries (mirror)](https://www.manualsdir.com/manuals/620821/dell-poweredge-vrtx.html?page=378)
- [Dell: PMem 100 Series User's Guide, Events During Runtime](https://www.dell.com/support/manuals/en-us/poweredge-r740/dcpmm_ug_pub/events-during-runtime?guid=guid-c7ba5af1-7aa3-4c2e-8a84-e5ea7993d3c8&lang=en-us)
- [Dell: iDRAC9 RACADM CLI Guide, July 2020](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf)
- [Dell InfoHub: PowerEdge 17G Server BIOS Settings for Optimized Performance](https://www.dell.com/en-us/infohub/articles/dell-poweredge-17g-server-bios-settings-for-optimized-performance-r7725-r6725-r7715-r6715)
- [Schroeder, Pinheiro, Weber: DRAM Errors in the Wild, SIGMETRICS 2009](https://www.cs.toronto.edu/~bianca/papers/sigmetrics09.pdf)
- [Linux kernel documentation: RAS and EDAC](https://docs.kernel.org/admin-guide/RAS/main.html)
- [ipmitool manual page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [MemTest86: ECC Support](https://www.memtest86.com/ecc.htm)
- [Dell Community: ecc error threshold](https://www.dell.com/community/en/conversations/systems-management-general/ecc-error-threshold/647f9e3af4ccf8a8de2cd125)
- [Dell Community: Dell Poweredge R630 Correctable ECC logging limit reached warning](https://www.dell.com/community/en/conversations/poweredge-hardware-general/dell-poweredge-r630-correctable-ecc-logging-limit-reached-warning/647f9358f4ccf8a8de561474)
- [Dell Community: PowerEdge R730 DIMM A10 Correctable Memory Error Log Limit Reached](https://www.dell.com/community/en/conversations/poweredge-hardware-general/poweredge-r730-dimm-a10-correctable-memory-error-log-limit-reached/65f1d8a2415a967d318cc062)
- [Dell Community: racadm lclog view -k does not work](https://www.dell.com/community/Rack-Servers/racadm-lclog-view-k-lt-string-gt-doesn-t-work/td-p/6238030)
- [Wikimedia Phabricator: T221502, db1099 is having memory issues](https://phabricator.wikimedia.org/T221502)
- [Wikimedia Phabricator: T183176, cp4032 memory error](https://phabricator.wikimedia.org/T183176)
- [matjamsharing blog: repost of Dell's notice on 13G reboots after correctable memory errors (September 2017)](https://matjamsharing.blogspot.com/2017/09/dell-r430-r530-r630-r730-r830-r930-m630.html)
