
## The short answer

The username is ADMIN on every Supermicro generation. The password is ADMIN on X9 boards and on older X10, X11 and H11 boards, but since November 2019 new X10, X11, H11, H12 and later boards ship with a unique password of exactly 10 uppercase letters, per [Supermicro's BMC Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf). It is printed on a non-removable sticker near the BMC chip or the serial number label and on a removable one that belongs on the chassis or service tag, and the motherboard sticker wins if the two differ. If both are gone, Supermicro [has difficulty checking who owns a server](https://www.supermicro.com/en/support/faqs/faq.php?faq=41692) and points to a reset from the host OS as root, with `ipmicfg -user setpwd 2 <new>` or `ipmitool user set password 2 <new>`. On a unique-password board, a factory reset restores that password, not ADMIN, unless `ipmicfg -fd 3` or the web option for ADMIN/ADMIN is chosen. The BMC takes its address from DHCP by default. Ten letters is only about 47 bits, and Lava researchers reported in 2026 that eight GPUs can search the whole space in about an hour, so keep the BMC on an [isolated management network](/blog/ipmi-remote-management) and replace the factory password.

## What are the default Supermicro IPMI username and password on each generation?

The username is ADMIN throughout. The password changed once, with the per-board passwords that began shipping in late 2019.

| Board | Default login | Basis |
|---|---|---|
| X9, such as the X9DRH-iTF | ADMIN / ADMIN, no unique-password firmware | [X9 manual](https://www.supermicro.com/manuals/other/X9_SMT_IPMI.pdf), [Supermicro FAQ 32732](https://www.supermicro.com/en/support/faqs/faq.php?faq=32732) |
| X10, X11, H11 built before the change | ADMIN / ADMIN | [Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf) |
| X10, X11, H11 shipped since the change | ADMIN plus a unique password | [Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf) |
| H12, X12, X13, H13, B13 | ADMIN plus a unique password | [X12/H12 manual](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf), [X13/H13/B13 manual](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf) |
| X14 | ADMIN plus a unique password | [X14DBM-AP BMC page](https://www.supermicro.com/en/support/manuals/product/motherboard/x14dbm-ap/Content/software/bmc.htm) |

The X9 manual says "The manufacturer default username and password are ADMIN/ADMIN." Supermicro's FAQ for an X9DRH-iTF owner says X9 boards are end of life and do not support the unique-password firmware, and that updating the firmware on an X9 board does not change the password or assign a unique one.

The change was announced as a BMC security feature. The [Supermicro announcement page](https://www.supermicro.com/en/support/BMC_Unique_Password) says it covers new X10, X11, H11, H12 and all future products, and that Supermicro "will no longer use the default password “ADMIN” for new devices or systems." The guide limits it to factory programming: for systems "not assigned a unique password, the default setting of user id=ADMIN and password=ADMIN will be used." A used X10 or X11 board from before the rollout is therefore an ADMIN/ADMIN board unless a previous owner changed it. For used boards, see the [X10 vs X11 comparison](/blog/supermicro-x10-vs-x11) and [buying used enterprise gear](/blog/buying-used-enterprise-gear).

The reason is California Senate Bill 327. [Civil Code section 1798.91.04](https://codes.findlaw.com/ca/civil-code/civ-sect-1798-91-04/) deems a connected device with a means of authentication outside a local network to have a reasonable security feature if "The preprogrammed password is unique to each device manufactured," or if the device "requires a user to generate a new means of authentication" before first access. The [Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf) says the law applies from January 1, 2020, and that Supermicro cannot ship one customer-chosen password across systems because every password must be unique and assigned at manufacturing. The documents differ on timing: the guide says stickers start in November 2019, while the [X12/H12 manual](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) says "mid-December 2019" in one FAQ answer and "Effective as of January 1, 2020" in its appendix, which the [X13/H13/B13 manual](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf) repeats. Boards from the changeover weeks can be either kind, so look for the sticker instead of trusting the date. The [iDRAC default password guide](/blog/idrac-default-password) covers the Dell equivalent.

The guide specifies "a string of exactly 10 uppercase alphabetic letters," chosen to avoid mixing up look-alike letters and digits. The X12/H12 and X13/H13/B13 manuals both word it as "at least 10 alphabetic uppercase characters," and the X13 manual adds that the passwords contain no lowercase letters or numbers, so a character that looks like a zero is the letter O.

## Where is the unique password printed, and what if both stickers are gone?

Each board has two stickers, according to the [Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf):

- **Non-removable:** placed near the BMC chip and/or the motherboard serial number label.
- **Removable:** placed on CPU1's plastic protective cover, and meant to be moved to the chassis or service tag so the first login does not need the lid off. On a purchased server, that second sticker is already on the service tag.

The password is on the bottom row, just below the IPMI MAC address, which also makes the sticker the quickest way to find the BMC's MAC for a DHCP lease lookup. Chassis placement varies, per the same guide:

| System | Where the sticker is |
|---|---|
| Single-node 2U | Outward side of the service tag |
| Single-node 1U | Opposite or bottom side of the service tag |
| 2U4N and 2U2N BigTwin or TwinPro | Back of each node tray, next to the serial number label |
| 1U Twin without a service tag | Above the first hard drive of each node |

The X13 manual adds that most systems have a pull-out tag showing the BMC MAC and the password, and the rest carry the sticker on the top or front of the chassis. Supermicro marks affected shipments with a notice in the plastic wrap and an identifier on the shipping label.

If the two stickers disagree, the guide says "use the motherboard sticker. The motherboard sticker is always correct." After a motherboard swap, the guide says to place the removable sticker from the new board over the old one on the chassis or service tag.

When both are gone, there are two routes:

1. **Ask Supermicro, if you bought direct.** The guide says customers who bought directly can request soft copies from a sales representative or Supermicro's customer portal, and that it can provide them only to direct customers, not to buyers through a distributor.
2. **Reset from the host OS.** This is the route [Supermicro FAQ 41692](https://www.supermicro.com/en/support/faqs/faq.php?faq=41692) gives to an owner who lost the BMC password. Supermicro's answer says it has difficulty checking ownership and walks through `ipmitool` and IPMICFG instead.

## How do you reset the IPMI password from the host OS with ipmicfg or ipmitool?

Both tools talk to the BMC through the host's local interface, so neither asks for the current BMC password, which is why Supermicro offers them to an owner who lost it. Per FAQ 41692, both commands need root on the Linux OS. The FAQ's asker had lost the OS root password too, so the DOS and UEFI builds below are the fallback when root is gone. The [IPMICFG guide](https://www.supermicro.com/wdl/utility/IPMICFG/IPMICFG_UserGuide.pdf) lists these modules for the Linux build:

```bash
sudo modprobe ipmi_msghandler
sudo modprobe ipmi_devintf
sudo modprobe ipmi_si
```

The [ipmitool man page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in) says the open interface uses the OpenIPMI driver, with a device at `/dev/ipmi0` (or `/dev/ipmi/0` under udev). IPMICFG is a download from Supermicro's [IPMI Utilities page](https://www.supermicro.com/en/solutions/management-software/ipmi-utilities), and the guide names the Linux 64-bit binary `IPMICFG-Linux.x86_64`.

With IPMICFG, list the users and set the password on ID 2, where the guide's `-user list` example shows ADMIN:

```bash
sudo ./IPMICFG-Linux.x86_64 -user list
sudo ./IPMICFG-Linux.x86_64 -user setpwd 2 'new-password-here'
```

With ipmitool, FAQ 41692 uses channel 1 for the user list and ID 2 for ADMIN:

```bash
sudo ipmitool user list 1
sudo ipmitool user set password 2 'new-password-here'
```

Always give the password on the command line, because the man page says a `user set password` call with no password clears it to NULL. The man page also takes an optional trailing `16` or `20` that sets the maximum password length, so use `20` for a password longer than 16 characters.

A server with no installed operating system can still be reset from boot media, because IPMICFG also runs from [DOS and the UEFI shell](https://www.supermicro.com/en/solutions/management-software/ipmi-utilities). Jeff Geerling's [2022 write-up](https://www.jeffgeerling.com/blog/2022/resetting-ipmi-and-upgrading-bios-on-supermicro-motherboard-under-freebsd-or-not/) reports using a FreeDOS USB drive with the DOS folder from the IPMICFG download after the Linux binary would not run on FreeBSD.

Four limits apply:

- **Password rules.** The X13 manual's web interface wants 8 to 20 characters (the X12 manual says 8 to 19), at least three of lowercase, uppercase, digits and special characters, and not the username reversed. Neither manual says whether the host-side tools apply the same rules.
- **Disabled ADMIN.** Geerling reported that ADMIN showed "No" in the Enable column of `-user list`, so setting a password was not enough and he reset the whole BMC with `ipmicfg -fd 2`. The ipmitool man page lists `user enable <userid>` for this, but neither Supermicro nor Geerling shows it used on a Supermicro board.
- **KCS limits.** The [X12/H12](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) and [X13/H13/B13](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf) manuals have a KCS Control setting that caps what host-side commands can do, from Administrator down to Callback, and X13 adds a Disable KCS option. A previous owner may have set it.
- **X14 tooling.** The IPMI Utilities page says IPMICFG, SMCIPMITool and IPMIView are not supported on X14, H14 or later, and recommends SAA and SSM. The X14DBM-AP page still says the password "can be reset using the Supermicro IPMICFG tool," so read the manual for the exact board.

## What does a factory default reset set the password back to?

It depends on which option is chosen. The web interface and IPMICFG each offer three choices that line up, though the two documents describe them differently:

| Choice | Web option, per the [X13/H13/B13 manual](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf) | IPMICFG option, per the [IPMICFG guide](https://www.supermicro.com/wdl/utility/IPMICFG/IPMICFG_UserGuide.pdf) |
|---|---|---|
| 1 | Remove current settings but preserve user configurations | `-fd 1`: "Preserves the configurations in the 'Users' section." |
| 2 | Restore to factory default: removes all users, resets ADMIN to the factory default password | `-fd 2`: "Restores the factory defaults and the default password of the motherboard." |
| 3 | Set user defaults to ADMIN/ADMIN: removes all users, resets ADMIN to ADMIN | `-fd 3`: "Sets user's password to ADMIN." |

The X13 manual adds that the "Factory default password is the unique password for X12 and next generation platforms." So on a board with a unique password, option 2 brings back the sticker password. On a board without one, the guide's rule applies and the default is ADMIN. The IPMICFG guide does not say whether options 2 and 3 remove other users.

IPMICFG also has `-fdl` for factory default with a clean LAN configuration and `-fde` for a clean FRU and LAN. The IPMICFG guide's revision history says the options on `-fd` were added in revision 1.8, dated January 2020. The [2012 revision of the guide](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf) lists only `-fd` and `-fde`, so older builds have no option to choose.

Owner reports do not all match the documentation. A commenter on [ServeTheHome's reset guide](https://www.servethehome.com/reset-supermicro-ipmi-password-default-lost-login/) wrote in February 2024 that on an H12DSi-N6, `-fd 3` ended with the motherboard sticker password working, while `-fd 2` returned "This command is not supported." That does not match the guide's description of option 3, so treat it as one owner's result on one board and run `-user list` and a test login after any reset.

Two other operations do less than people expect:

- **Config restore.** The X13 manual says a saved BMC configuration does not carry passwords, "Passwords cannot be transferred or overridden by another BMC/IPMI Configuration", and does not save IP addresses.
- **Firmware updates.** The [X12/H12 manual](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) offers preserve options for the BMC configuration, SDR and SSL certificate, and says the update preserves them by default. FAQ 32732 says an X9 firmware update leaves the password alone, and that if the update resets to factory defaults, ADMIN/ADMIN works on those boards.

## What is the default IPMI network setting, and how do you find the BMC's address?

The default is DHCP on a failover port. The X9 manual says "DHCP is the default setting" and that the LAN interface default is Failover, which connects through the shared LAN port or the dedicated IPMI port with precedence given to the dedicated one. The X12/H12 manual says "The DHCP (Dynamic Host Configuration Protocol) is on by default," and the X13 manual describes failover as the first shared LAN and the dedicated LAN.

Four ways to find the address:

1. **DHCP lease table.** Look up the BMC's MAC, which is printed just above the password on the sticker, on the router or DHCP server.
2. **From the host.** `ipmicfg -m` shows the IPv4 address and MAC per the IPMICFG guide, and the man page says `ipmitool lan print` prints the first LAN channel it finds:

```bash
sudo ./IPMICFG-Linux.x86_64 -m
sudo ipmitool lan print
```

3. **From the BIOS.** The X12/H12 manual puts it under Server Management, then BMC Network Configuration, where the address source can be switched between DHCP and static.
4. **With no DHCP server.** The same manual describes cabling a laptop directly to the IPMI or shared port and setting a static address on both ends, since no router is involved.

To set a static address from the host, the IPMICFG guide lists these options:

```bash
sudo ./IPMICFG-Linux.x86_64 -dhcp off
sudo ./IPMICFG-Linux.x86_64 -m 192.0.2.20
sudo ./IPMICFG-Linux.x86_64 -k 255.255.255.0
sudo ./IPMICFG-Linux.x86_64 -g 192.0.2.1
```

## Is a 10-letter password strong enough, and how do you lock the BMC down?

The unique password protects against the old problem, a published default that works everywhere. It is a thin secret in other ways. The username is fixed, because the [X12/H12](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf) manual says the Administrator account cannot be deleted and the [X13/H13/B13](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf) manual says it cannot be deleted or disabled. The format is public, and an IPMI 2.0 flaw lets anyone who can reach UDP port 623 collect a password-derived value to guess against offline. [Rapid7's 2013 guide](https://rapid7.com/blog/post/2013/07/02/a-penetration-testers-guide-to-ipmi) describes that exchange and lists ADMIN/ADMIN as the Supermicro default. [Lava's 2026 research](https://lava.security/research/bmc-exposure-alert) measured it, with a May 6, 2026 scan:

- 36,872 internet-exposed hosts answered IPMI on UDP 623.
- 24,650 of them returned password-derived material before authentication.
- Supermicro hardware was over half of the responding BMCs, and the old ADMIN:ADMIN pair matched only a few hundred.
- The 26^10 factory space, about 141 trillion candidates, "could be searched in approximately one hour" on an eight-GPU server running Hashcat. Each captured response is cracked separately.
- On two X13DEM boards at a bare-metal GPU provider whose policy allowed testing, the recovered passwords matched the 10-letter format. The researchers did not log in.
- Lava reports that Supermicro called the scenario plausible and said it will review longer passwords or an expanded character set for future hardware.

The table converts search space to bits, assuming random letters:

| Password | Search space | Bits |
|---|---|---|
| ADMIN / ADMIN | 1, because it is published | 0 |
| 10 uppercase letters | 26^10 = 141,167,095,653,376 | 47.0 |
| 15 lowercase letters | 26^15, about 1.68 x 10^21 | 70.5 |

Rounded to whole bits, the rows are 0, 47 and 71. At the rate implied by Lava's one-hour figure, the 15-letter row, which is 26^5 times larger, would take roughly 1,350 years, by arithmetic and not a measurement. Fifteen characters is NIST's floor: [SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html) requires single-factor passwords to be "a minimum of 15 characters in length" and says verifiers should accept at least 64. That standard governs digital identity services, not BMCs, so it is a yardstick here, as covered in [NIST's password rule changes](/blog/nist-password-rules-changed). The X13 web interface asks for three character classes, so an all-lowercase password would not meet its stated rules. Use a long mixed-class password, up to the 19 or 20 character limit of the web interface, and check candidates with the [password entropy tool](/tools/password-entropy).

Then reduce what can reach the BMC. The X13 manual's port page lists these defaults, and says most can be changed except the web SSL port:

| Port | Service | Default |
|---|---|---|
| TCP 443 | Web SSL | On, cannot be changed |
| TCP 80 | Web | On |
| TCP 22 | SSH | On |
| TCP 623 | Virtual media | On |
| UDP 623 | IPMI LAN | On |
| UDP 161 | SNMP | Off |

The X12 manual also lists the iKVM port, TCP 5900, as on by default. If a board lets you turn off the IPMI LAN port, UDP 623, that removes the exposure Lava measured, but IPMI-over-LAN tools such as `ipmitool -I lanplus` stop working, so check what depends on it first. For a firewall, the X13 manual's list of BMC ports is 80 and 443 TCP, 623 UDP, 5900 TCP, 623 TCP, 22 TCP and 8889 TCP for WS-MAN. The [port reference tool](/tools/port-reference) covers the protocols.

The remaining steps:

1. **Replace the password at first login.** The unique password is a starting value, and Supermicro's guide says the IPMI web interface or IPMICFG can change it. The [announcement page](https://www.supermicro.com/en/support/BMC_Unique_Password) also offers a sample Python script that resets the password to ADMIN or sets a chosen one, after a user agreement.
2. **Turn on failed-login lockout.** Both manuals give a threshold of 1 to 5 failed attempts, a counter reset interval and a lockout duration.
3. **Add IP access control rules.** Both manuals allow up to 10 rules, and the default policy is off with a default rule of ACCEPT.
4. **Set a web session timeout.** The default is 0, meaning no timeout, in the X12 manual, and 30 minutes in the X13 manual.
5. **Isolate the network.** [CISA's 2013 alert](https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi), now marked as archived content, says to restrict IPMI traffic "to a management VLAN segment with strong network controls" and to set "strong, unique passwords." A [VLAN segmentation guide](/blog/vlan-segmentation-guide) covers the layout.
6. **Close off legacy options.** Lava's advice includes disabling IPMI 1.5, cipher suite 0, anonymous accounts and NONE authentication where the BMC allows it.

## What breaks after a reset, an update or a board swap?

- **ADMIN/ADMIN is rejected.** The board has a unique password. Why: Supermicro stopped using ADMIN for new systems from late 2019. Fix: read the sticker, using the motherboard one if two differ, or reset from the host.
- **Repeated guesses lock the account.** Why: both BMC manuals document a lockout threshold of 1 to 5 failed attempts. Fix: wait out the lockout duration, or have another administrator use the unlock action the X12 manual lists in the user table.
- **A factory reset does not give ADMIN.** Why: the plain restore option returns the factory default password, which is the unique one on newer boards. Fix: use `-fd 3` or the ADMIN/ADMIN web option, then change the password before the BMC goes back on the network.
- **IPMICFG reports an error right after `-fd`.** The ServeTheHome commenter saw "Failed to get the IPMI Firmware Revision. Completion Code=FFh" after `-fd 3` and said they waited 10 minutes before the IP and MAC came back. Why: the BMC is restarting. Fix: wait, and do not remove power, since the web interface prompt during a reset tells you to leave power in place until the BMC is back online.
- **A host-side change leaves no log entry.** [FAQ 28796](https://www.supermicro.com/en/support/faqs/faq.php?faq=28796) says an X11DDW-NT on IPMI firmware 1.43 did not record an in-band `ipmitool user set password 2` in the event log, while web and out-of-band changes were logged, and the fix is firmware 1.55. Why: the FAQ gives no cause, only the firmware update as the fix. Fix: update the firmware, and treat anyone with root on the host as able to reset the BMC password.

## Sources

- [Supermicro: BMC Unique Password Guide](https://www.supermicro.com/support/BMC_Unique_Password_Guide.pdf)
- [Supermicro: BMC Unique Password Security Feature, November 2019](https://www.supermicro.com/en/support/BMC_Unique_Password)
- [Supermicro: FAQ 32732, unique password and X9 firmware updates](https://www.supermicro.com/en/support/faqs/faq.php?faq=32732)
- [Supermicro: FAQ 41692, lost BMC ADMIN password](https://www.supermicro.com/en/support/faqs/faq.php?faq=41692)
- [Supermicro: FAQ 28796, in-band password change not logged](https://www.supermicro.com/en/support/faqs/faq.php?faq=28796)
- [Supermicro: IPMICFG User's Guide, revision 1.15](https://www.supermicro.com/wdl/utility/IPMICFG/IPMICFG_UserGuide.pdf)
- [Supermicro: Utility User's Guide IPMICFG, 2012 revision](https://www.supermicro.com/wdl/ISO_Extracted/CDR-X9-UP_1.22_for_Intel_X9_UP_platform/IPMI/IPMICFG/Supermicro_Utility_User_Guide_IPMICFG.pdf)
- [Supermicro: IPMI Utilities](https://www.supermicro.com/en/solutions/management-software/ipmi-utilities)
- [Supermicro: X9 SMT IPMI User's Guide](https://www.supermicro.com/manuals/other/X9_SMT_IPMI.pdf)
- [Supermicro: BMC User's Manual for X12 and H12](https://www.supermicro.com/manuals/other/BMC_Users_Guide_X12_H12.pdf)
- [Supermicro: BMC User's Manual for X13, H13 and B13](https://www.supermicro.com/manuals/other/BMC_IPMI_X13_H13_B13.pdf)
- [Supermicro: X14DBM-AP BMC page](https://www.supermicro.com/en/support/manuals/product/motherboard/x14dbm-ap/Content/software/bmc.htm)
- [ipmitool: manual page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [Lava: BMC exposure research](https://lava.security/research/bmc-exposure-alert)
- [Rapid7: A Penetration Tester's Guide to IPMI](https://rapid7.com/blog/post/2013/07/02/a-penetration-testers-guide-to-ipmi)
- [CISA: Risks of Using the Intelligent Platform Management Interface (IPMI)](https://www.cisa.gov/news-events/alerts/2013/07/26/risks-using-intelligent-platform-management-interface-ipmi)
- [NIST: SP 800-63B-4, Digital Identity Guidelines](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [FindLaw: California Civil Code section 1798.91.04](https://codes.findlaw.com/ca/civil-code/civ-sect-1798-91-04/)
- [ServeTheHome: Reset Supermicro IPMI Password to Default](https://www.servethehome.com/reset-supermicro-ipmi-password-default-lost-login/)
- [Jeff Geerling: Resetting IPMI and upgrading BIOS on a Supermicro motherboard](https://www.jeffgeerling.com/blog/2022/resetting-ipmi-and-upgrading-bios-on-supermicro-motherboard-under-freebsd-or-not/)
