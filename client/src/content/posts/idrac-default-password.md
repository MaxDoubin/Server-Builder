
## The short answer

The username is [root on every generation](https://www.dell.com/support/kbdoc/en-us/000133536/dell-poweredge-what-is-the-default-username-and-password-for-idrac). On 11th to 13th generation PowerEdge servers (iDRAC6, iDRAC7, iDRAC8) the password is calvin and the factory IP is 192.168.0.120. On 14th generation and newer (iDRAC9, iDRAC10) the IP comes from DHCP and the password is unique to each server and printed on the pull-out information tag, unless calvin was chosen when the server was ordered. If the tag is missing or the password was changed, set a new one from the host with local racadm, ipmitool or F2 System Setup, and keep the iDRAC on its own management network.

## What are the default iDRAC username and password on each generation?

The username has always been root. The password and the factory IP mode changed, and the break falls between the 13th and 14th generations.

| Generation | Example models | iDRAC | Default password | Factory IP |
|---|---|---|---|---|
| 11th | R610, R710 | iDRAC6 | calvin | Static 192.168.0.120 |
| 12th | R620, R720 | iDRAC7 | calvin | Static 192.168.0.120 |
| 13th | R630, R730 | iDRAC8 | calvin | Static 192.168.0.120 |
| 14th to 16th | R640, R740, R650, R750, R660, R760 | iDRAC9 | Unique, on the tag (calvin if ordered) | DHCP |
| 17th | R670, R770 | iDRAC10 | Unique, on the tag (calvin if ordered) | DHCP, IPv4 and IPv6 |

The calvin rows come from the [iDRAC6 guide](https://dl.dell.com/manuals/all-products/esuprt_electronics/esuprt_software/esuprt_remote_ent_sys_mgmt/integrated-dell-remote-access-cntrllr-6-for-monolithic-srvr-v1.95_user's%20guide_en-us.pdf), the [iDRAC7 and iDRAC8 RACADM guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2818181_cli-guide_en-us.pdf) and the [R730 manual](https://downloads.dell.com/topicspdf/poweredge-r730_owners-manual_en-us.pdf), and generation names follow [Dell's generation list](https://www.dell.com/support/kbdoc/en-us/000137343/how-to-identify-which-generation-your-dell-poweredge-server-belongs-to).

The change arrived with iDRAC9. Firmware [3.00.00.00, released in June 2017](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_release-notes_en-us.pdf), made the default password random and printed on the system information tag unless calvin was selected when ordering. [Dell's iDRAC9 guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf) lists the C6420, M640 and FC640 as exceptions that ship with calvin. [Dell's iDRAC10 security guide](https://www.dell.com/support/manuals/en-us/poweredge-r670/idrac10_1.xx_scg/secure-default-password?guid=guid-57cf489b-3f4a-4b0e-bb62-6af06037edb3&lang=en-us) repeats the unique password and the calvin ordering option.

## Where is the iDRAC9 and iDRAC10 default password?

It is on the pull-out information tag at the front of the chassis, the slide-out panel that also carries the Service Tag. Dell's KB puts the unique password on the [pull-out Service Tag at the front, near the server asset tag](https://www.dell.com/support/kbdoc/en-us/000133536/dell-poweredge-what-is-the-default-username-and-password-for-idrac). The same slide-out label panel is the "information tag" in the [R740 manual](https://downloads.dell.com/topicspdf/poweredge-r740_owners-manual_en-us.pdf), the "luggage tag" in the [R740 technical guide](https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r740-r740xd-technical-guide-addcpulist-180912.pdf) and the "Express Service Tag" in the [R770 technical guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r770-technical-guide.pdf).

On an R740 the label shows the iDRAC MAC address and the secure password, and the manual says the information may instead be on a sticker on the chassis. Scanning the tag's QR code with OpenManage Mobile [logs you in only while the credentials are still at their defaults](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf).

If calvin was ordered, the tag shows no password, because Dell says the legacy password is then not available there. On a used server, a tag with no password line therefore points to calvin, while a printed password that fails means someone changed it. A factory reset only restores the shipped value, which you cannot read without the tag, so on a tagless server set a new password instead.

## What is the default iDRAC IP address, and how do you find it?

From the 14th generation on, DHCP is on at the factory, so there is no fixed default; 13th generation and older use 192.168.0.120. The iDRAC9 [release notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_release-notes_en-us.pdf) say DHCP is enabled by default and earlier generations defaulted to a static address, and [Dell's iDRAC10 KB](https://www.dell.com/support/kbdoc/en-us/000374138/set-up-idrac10-ip-address-and-log-in-to-idrac10) says IPv4 and IPv6 both ship with DHCP. The [iDRAC6 guide](https://dl.dell.com/manuals/all-products/esuprt_electronics/esuprt_software/esuprt_remote_ent_sys_mgmt/integrated-dell-remote-access-cntrllr-6-for-monolithic-srvr-v1.95_user's%20guide_en-us.pdf) lists static 192.168.0.120 as its default.

<figure>
<img src="/images/blog/idrac-default-password/r610-r720-lcd.jpg" alt="Dell PowerEdge R610 and R720 servers in a rack with their front LCD panels lit" width="1200" height="802" loading="lazy" decoding="async">
<figcaption>A PowerEdge R610 and R720 with their front LCD panels. On servers with an LCD, the panel can show the iDRAC address. Photo: Dell Inc., <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Dell_PowerEdge_R610_and_R720.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Dell's pages are not consistent here. The default password KB gives both 192.168.0.120 and "DHCP enabled by default" without splitting by generation, and the [iDRAC9 4.40 guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) still uses 192.168.0.120 in a static-IP racadm example. Trust the release notes and the manual for your generation, because they are tied to a firmware version. The iDRAC6 guide says the address fields become zeros when DHCP finds no server, but no iDRAC9 or iDRAC10 document cited here covers that case, so do not count on a fallback to 192.168.0.120.

Plug into the dedicated iDRAC port, which the iDRAC9 [security guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_administrator-guide_en-us.pdf) lists as the default NIC selection. On an R730 the manual says to use the iDRAC port card or Ethernet connector 1 on the system board.

Ways to find the address:

1. Read the LCD. On an R740 the optional bezel LCD shows it under View, then iDRAC IP, and sets DHCP or static under Setup, then iDRAC.
2. Open F2 System Setup, then iDRAC Settings, then Network, as [Dell's iDRAC9 network KB](https://www.dell.com/support/kbdoc/en-us/000177212/dell-poweredge-how-to-configure-the-idrac9-and-the-lifecycle-controller-network-ip) describes. On iDRAC10, Dell says POST displays the IPv4 and IPv6 addresses.
3. Match the iDRAC MAC address from the tag against your DHCP server's lease list.
4. From the host OS, run the commands below and read the IP Address line.
5. On servers with a front micro-USB iDRAC Direct port, connect a laptop. The iDRAC9 guide says the laptop acquires 169.254.0.4, the iDRAC takes 169.254.0.3, and Windows may need an RNDIS driver.

```
racadm getniccfg
ipmitool lan print 1
```

## What are the default iDRAC ports?

The web interface, Redfish and remote racadm use TCP 443, SSH uses TCP 22, and IPMI over LAN uses UDP 623. This table follows the iDRAC9 security guide, which calls them the default ports and says most can be changed.

| Port | Protocol | Function | Changeable |
|---|---|---|---|
| 22 | TCP | SSH | Yes |
| 80 | TCP | HTTP, redirects to HTTPS by default | Yes |
| 161 | UDP | SNMP agent | Yes |
| 443 | TCP | HTTPS: web interface, Redfish, remote racadm | Yes |
| 623 | UDP | IPMI (RMCP and RMCP+) | No |
| 5900 | TCP | Virtual console and virtual media | Yes |
| 5901 | TCP | VNC, opens only when VNC is enabled | Yes |

The same guide's defaults table leaves IPMI over LAN disabled on iDRAC9. Telnet also existed on older generations and on iDRAC9 until firmware 4.40.00.00, and the [iDRAC8 guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf) calls it unencrypted and disabled by default.

## How do you reset the iDRAC password?

Use the method that matches what you can reach: a host OS login gets a no-reboot reset, a keyboard and monitor gets F2 System Setup, and a working iDRAC login gets the web interface. Dell's security guide notes that host administrators can use local RACADM and the iDRAC Settings utility without being iDRAC users.

### F2 System Setup (needs a reboot)

1. Restart the server and press F2 during POST to open System Setup.
2. Open iDRAC Settings, then User Configuration, then Change Password.
3. Enter the new password, then choose Back, Finish and Yes to save.

The same iDRAC Settings page has Reset iDRAC configurations to defaults, which wipes everything instead of one password.

### Local racadm (no reboot)

Install racadm from Dell's iDRAC Tools in the host OS. [Dell's KB](https://www.dell.com/support/kbdoc/en-uk/000206945/how-to-use-idrac-from-guestos-centos-rhel-esxi-using-racadm-idrac-tools) runs install_racadm.sh for Linux and ESXi. Dell says the default account is index 2, but a user [may have a different index number on each iDRAC](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf), so read the name first.

```
racadm get iDRAC.Users.2.UserName
racadm set iDRAC.Users.2.Password "NEW-PASSWORD"
```

### ipmitool from the host (no reboot)

ipmitool reaches the controller through the host's IPMI device, so no iDRAC login is needed. [Dell's VxRail KB](https://www.dell.com/support/kbdoc/en-us/000013629/vxrail-how-to) uses these commands to reset the iDRAC root password: list the users on channel 1, read root's ID (2 in Dell's example), then set the password.

```
ipmitool user list 1
ipmitool user set password 2
```

Leave the password off the second command. The [ipmitool source](https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_user.c) then prompts for it twice, which keeps it out of shell history, and prints the last line below on success. The [man page](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in) still says an omitted password is cleared, so watch for the prompt.

```
Password for user 2:
Password for user 2:
Set User Password command successful (user 2)
```

### LCD and Lifecycle Controller

The LCD only shows or sets the address and cannot change a password. Lifecycle Controller (F10 at POST) opens an Initial Setup Wizard on first start, and one page sets the iDRAC network, account name and password, with [DHCP as the default option](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_Users-Guide7_en-us.pdf).

## What does racresetcfg do, and what is the password afterward?

It wipes iDRAC settings back to factory, and the password afterward depends on the generation and the option. On iDRAC7 and iDRAC8 the [RACADM guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2818181_cli-guide_en-us.pdf) says the name and password become root and calvin and the IP becomes 192.168.0.120. The [iDRAC9 CLI guide](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf) and the [iDRAC10 page](https://www.dell.com/support/manuals/en-us/poweredge-r7715/idrac10_1.xx_racadm_cli/racresetcfg?guid=guid-6553437b-d19c-4d20-9d6e-b537c62af4eb&lang=en-us) add options.

| Command | Applies to | Password afterward |
|---|---|---|
| `racadm racresetcfg` | iDRAC7, iDRAC8 | root and calvin, IP 192.168.0.120 |
| `racadm racresetcfg -all` | iDRAC9, iDRAC10 | The shipping value: the tag's unique password, or calvin if ordered |
| `racadm racresetcfg -rc` | iDRAC9, iDRAC10 | root and calvin |
| `racadm racresetcfg -f` | iDRAC9, iDRAC10 | Contradictory in Dell's guide, see below |

The iDRAC9 [user's guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf) says to check the system badge for the default user name and password after racresetcfg, which points to the shipping value, but the CLI guide does not state the bare command's result, so pick -all or -rc. The CLI guide also contradicts itself on -f: the option list says "force", while the example says to preserve user and network settings. The web interface offers [three outcomes under Maintenance, Diagnostics, Reset iDRAC to Default Settings](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf): keep user and network settings, reset to the shipping value, or reset to root and calvin.

`racadm racreset` is a different command that restarts the controller and is not described as restoring defaults. Dell also warns that changing the system board jumpers to make calvin the default is permanent, and a factory reset cannot return the unique password.

## How do you keep iDRAC from becoming a security problem?

Change the default password on day one, keep the iDRAC on its own network, and leave IPMI over LAN off unless you need it.

<figure>
<img src="/images/blog/idrac-default-password/bmc-chip.jpg" alt="An ASPEED AST2400 baseboard management controller chip on a motherboard" width="1200" height="951" loading="lazy" decoding="async">
<figcaption>An ASPEED AST2400, a common baseboard management controller on other vendors' boards, not an iDRAC. Every BMC runs below the operating system, which is why its default credentials matter. Photo: Phiarc, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:ASPEED_AST2400_BMC_Baseboard_management_controller.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Default credentials are an easy target. Rapid7's [Metasploit module](https://www.rapid7.com/db/modules/auxiliary/scanner/http/dell_idrac/) attempts logins with the default iDRAC credentials and was tested against iDRAC 6, 7, 8 and 9. iDRAC warns about defaults with Default Password Warning (SEC0701) and Force Change of Password, but Dell's defaults table has Force Change off at the factory.

Dell's [security guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_administrator-guide_en-us.pdf) says iDRAC is not designed or intended to be connected directly to the Internet. It recommends the dedicated port on a separate, firewalled management network, plus IP range filtering and System Lockdown Mode.

The June 2023 [CISA and NSA BMC guidance](https://www.cisa.gov/news-events/alerts/2023/06/14/cisa-and-nsa-release-joint-guidance-hardening-baseboard-management-controllers-bmcs) says hardened credentials, firmware updates and network segmentation options are often overlooked, leading to a vulnerable BMC. [SecurityWeek's summary](https://www.securityweek.com/cisa-nsa-share-guidance-on-hardening-baseboard-management-controllers/) lists changing default credentials and isolating BMC connections with a VLAN, because access to a BMC could let attackers disable the TPM or UEFI Secure Boot. A firewall with a separate management VLAN does that job, and [Running a FortiGate Firewall in a Homelab](/blog/fortigate-firewall-homelab) covers a segmented lab setup.

IPMI over LAN is off by default and should stay off. The IPMI 2.0 handshake returns a password hash to anyone who asks about a valid user, as [Rapid7's IPMI research](https://www.rapid7.com/blog/post/2013/07/02/a-penetration-testers-guide-to-ipmi/) describes and Dell's scanner table lists as CVE-2013-4786 for iDRAC 7, 8 and 9. Dell recommends disabling the service or at least disabling Cipher 0 and segmenting the traffic, and its defaults table gives root no IPMI LAN privilege.

[ServeTheHome's iDRACula report](https://www.servethehome.com/idracula-vulnerability-impacts-millions-of-legacy-dell-emc-servers/) of September 28, 2018 says the firmware-replacement attack is not a vulnerability on 14th generation servers and needs physical access or remote access with a valid login, which an unchanged root and calvin would supply. For why a long password beats complexity rules, see [NIST Password Guidelines: 15 Characters, No Complexity Rules](/blog/nist-password-rules-changed).

## What breaks

**The right password is refused, then every attempt is rejected.** iDRAC blocks a source IP address after repeated failures. Dell's iDRAC9 defaults have blocking on, with three failures in 60 seconds triggering a 60-second penalty. SSH clients may show "Connection closed by remote host", and the counter resets after a successful login. Fix: stop whatever keeps retrying, such as monitoring or a saved password, wait 60 seconds, or sign in from another address.

**A used server has no tag, or the tag's password fails.** The tag is gone or someone changed the password, and resetting to the shipping value only brings back the password you cannot read. Fix: try calvin if the tag shows no password, otherwise set a new password from the host with F2, local racadm or ipmitool, or run `racadm racresetcfg -rc` for root and calvin and change it at once. If every host-side change is refused, a previous owner may have disabled local configuration, which Dell says leaves the F2 and local RACADM settings view-only and blocks IPMITool changes; it can be re-enabled under iDRAC Settings, Services, Local Configurations with an administrator login.

<figure>
<img src="/images/blog/idrac-default-password/dell-server.jpg" alt="A stack of 1U Dell PowerEdge servers in a rack, seen from a low angle" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A stack of 1U Dell servers. A used server often arrives without its information tag, and the reset methods above are the way back in. Photo: Omnespsx, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Servidor_Dell.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

**racresetcfg drops your session and your address.** iDRAC is unresponsive for about 30 seconds and returns to factory network settings, and Dell's web reset steps say the IP is then not accessible until you set it from the front panel or BIOS. Erasing SEKM settings can also lock storage devices that iDRAC secures. Fix: run it from the console or host OS, run `racadm sekm disable` first if you use SEKM, or choose the web option that keeps user and network settings.

**ipmitool cannot open /dev/ipmi0.** The IPMI driver is not loaded, and the [open interface source](https://raw.githubusercontent.com/ipmitool/ipmitool/master/src/plugins/open/open.c) reports "Could not open device at /dev/ipmi0 or /dev/ipmi/0 or /dev/ipmidev/0". Fix: run `modprobe ipmi_si` and `modprobe ipmi_devintf` (with ipmi_msghandler, the modules the man page lists), then check for /dev/ipmi0. The [kernel documentation](https://docs.kernel.org/driver-api/ipmi.html) says the driver detects the interface itself when SMBIOS describes it. On ESXi use racadm.

**The browser will not load the iDRAC page.** Old iDRAC firmware can offer only old protocols, and the [Mozilla security blog](https://blog.mozilla.org/security/2018/10/15/removing-old-versions-of-tls/) says Firefox would drop TLS 1.0 and 1.1 in March 2020, with Chrome, Edge and Safari planning the same. An IT services blog says modern browsers refuse iDRAC6 until its firmware is [updated to 2.92, the last release](https://falconitservices.com/dell-idrac6-secure-connection-fails/), and that Edge or Internet Explorer in compatibility mode can still reach the old interface to do it. Fix: update the firmware, using the old browser only for that step. Afterward set TLS 1.2 only, which Dell's scanner table recommends (on iDRAC8, `racadm set idrac.webserver.tlsprotocol 2`). A certificate warning alone is normal, because iDRAC9 ships with a self-signed certificate.

**A strong new password works in the web interface but not in ipmitool.** ipmitool rejects IPMI 2.0 passwords over 20 characters, and the Lifecycle Controller guide lists 1 to 20 characters while the iDRAC9 guide lists 1 to 40. Fix: use a random password of 20 characters or fewer from Dell's recommended character set.

## Frequently asked questions

### Why is the iDRAC default password not working?

Four causes cover most cases: a 14th generation or newer server with a unique password on its tag, a password someone changed, your IP blocked after failures, or a password longer than one interface accepts. Check the tag, wait out the 60-second block, then reset locally.

### How do I reset the iDRAC password without rebooting the server?

Use local racadm or ipmitool from the host operating system. Neither needs an iDRAC login or a reboot. On ESXi, install racadm from iDRAC Tools first; Dell staff told an owner locked out of several R740s that [racadm is available for ESXi](https://www.dell.com/community/en/conversations/systems-management-general/reset-lost-idrac9-password/647f9115f4ccf8a8de27d813) too (an owner report). For a remote Windows host, Dell's iDRAC9 guide says to log in with a remote desktop client and then use local RACADM.

### Does iDRAC10 use the same default password as iDRAC9?

Yes in practice: a unique password on the tag, calvin as an order-time option, and a reset that returns to the shipped value. The R670 and R770 CSP Editions can run Open Server Manager instead, and [Dell says](https://www.dell.com/support/kbdoc/en-us/000240160/conversion-from-open-server-manager-to-idrac10) its network settings are separate from iDRAC10's, so confirm which controller you have.

### Is iDRAC the same thing as IPMI?

No. Dell's security guide calls IPMI one of iDRAC's management interfaces, which also include the web interface, remote racadm and Redfish. [IPMI and Out-of-Band Management Explained](/blog/ipmi-remote-management) covers the protocol.

## What this means

Treat the password as a property of the generation. Type root and calvin up to the 13th generation, read the tag on anything newer, and expect calvin on the C6420, M640 and FC640 or when the tag shows no password. On a used server, skip the guessing: set a new password from the host with local racadm or ipmitool, put the iDRAC on its own VLAN, leave IPMI over LAN off and use a random password of 20 characters or fewer. After that, [Dell iDRAC Tips and Tricks for Power Users](/blog/dell-idrac-tips-tricks) covers what the controller can do.

## References

- [Dell KB 000133536: PowerEdge iDRAC default username and password guide](https://www.dell.com/support/kbdoc/en-us/000133536/dell-poweredge-what-is-the-default-username-and-password-for-idrac)
- [Dell KB 000137343: PowerEdge servers by generation](https://www.dell.com/support/kbdoc/en-us/000137343/how-to-identify-which-generation-your-dell-poweredge-server-belongs-to)
- [iDRAC6 version 1.95 User's Guide](https://dl.dell.com/manuals/all-products/esuprt_electronics/esuprt_software/esuprt_remote_ent_sys_mgmt/integrated-dell-remote-access-cntrllr-6-for-monolithic-srvr-v1.95_user's%20guide_en-us.pdf)
- [iDRAC7 and iDRAC8 version 2.81.81.81 RACADM CLI Guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2818181_cli-guide_en-us.pdf)
- [iDRAC8 version 2.75.75.75 User's Guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf)
- [Dell PowerEdge R730 Owner's Manual](https://downloads.dell.com/topicspdf/poweredge-r730_owners-manual_en-us.pdf)
- [iDRAC9 with Lifecycle Controller 3.00.00.00 Release Notes](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_release-notes_en-us.pdf)
- [iDRAC9 version 3.00.00.00 User's Guide](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v30-series_users-guide_en-us.pdf)
- [iDRAC9 version 4.40.00.00 User's Guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf)
- [iDRAC9 Security Configuration Guide, April 2021](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_administrator-guide_en-us.pdf)
- [iDRAC9 RACADM CLI Guide, version 4.00](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf)
- [iDRAC10 Security Configuration Guide: Secure default password](https://www.dell.com/support/manuals/en-us/poweredge-r670/idrac10_1.xx_scg/secure-default-password?guid=guid-57cf489b-3f4a-4b0e-bb62-6af06037edb3&lang=en-us)
- [iDRAC10 RACADM CLI Reference Guide: racresetcfg](https://www.dell.com/support/manuals/en-us/poweredge-r7715/idrac10_1.xx_racadm_cli/racresetcfg?guid=guid-6553437b-d19c-4d20-9d6e-b537c62af4eb&lang=en-us)
- [Dell KB 000374138: Set up iDRAC10 IP address and log in](https://www.dell.com/support/kbdoc/en-us/000374138/set-up-idrac10-ip-address-and-log-in-to-idrac10)
- [Dell KB 000177212: Configure iDRAC9 and Lifecycle Controller network settings](https://www.dell.com/support/kbdoc/en-us/000177212/dell-poweredge-how-to-configure-the-idrac9-and-the-lifecycle-controller-network-ip)
- [Dell KB 000013629: VxRail, reset the root password of the iDRAC](https://www.dell.com/support/kbdoc/en-us/000013629/vxrail-how-to)
- [Dell KB 000206945: Use racadm in iDRAC Tools from a guest OS](https://www.dell.com/support/kbdoc/en-uk/000206945/how-to-use-idrac-from-guestos-centos-rhel-esxi-using-racadm-idrac-tools)
- [Dell KB 000240160: Open Server Manager and iDRAC10 conversion](https://www.dell.com/support/kbdoc/en-us/000240160/conversion-from-open-server-manager-to-idrac10)
- [Dell PowerEdge R740 Installation and Service Manual](https://downloads.dell.com/topicspdf/poweredge-r740_owners-manual_en-us.pdf)
- [Dell PowerEdge R740 and R740xd Technical Guide](https://i.dell.com/sites/csdocuments/Merchandizing_Docs/ja/poweredge-r740-r740xd-technical-guide-addcpulist-180912.pdf)
- [Dell PowerEdge R770 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r770-technical-guide.pdf)
- [Dell Lifecycle Controller User's Guide (iDRAC9 v4.x)](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_Users-Guide7_en-us.pdf)
- [Dell Community: Reset lost iDRAC9 password](https://www.dell.com/community/en/conversations/systems-management-general/reset-lost-idrac9-password/647f9115f4ccf8a8de27d813)
- [ipmitool man page source (GitHub)](https://raw.githubusercontent.com/ipmitool/ipmitool/master/doc/ipmitool.1.in)
- [ipmitool source: lib/ipmi_user.c (GitHub)](https://raw.githubusercontent.com/ipmitool/ipmitool/master/lib/ipmi_user.c)
- [ipmitool source: open interface, open.c (GitHub)](https://raw.githubusercontent.com/ipmitool/ipmitool/master/src/plugins/open/open.c)
- [Linux kernel documentation: The Linux IPMI Driver](https://docs.kernel.org/driver-api/ipmi.html)
- [CISA: CISA and NSA release joint guidance on hardening BMCs](https://www.cisa.gov/news-events/alerts/2023/06/14/cisa-and-nsa-release-joint-guidance-hardening-baseboard-management-controllers-bmcs)
- [SecurityWeek: CISA, NSA share guidance on hardening BMCs](https://www.securityweek.com/cisa-nsa-share-guidance-on-hardening-baseboard-management-controllers/)
- [Rapid7: A Penetration Tester's Guide to IPMI and BMCs](https://www.rapid7.com/blog/post/2013/07/02/a-penetration-testers-guide-to-ipmi/)
- [Rapid7: Dell iDRAC Default Login (Metasploit module)](https://www.rapid7.com/db/modules/auxiliary/scanner/http/dell_idrac/)
- [ServeTheHome: iDRACula vulnerability impacts legacy Dell EMC servers](https://www.servethehome.com/idracula-vulnerability-impacts-millions-of-legacy-dell-emc-servers/)
- [Mozilla Security Blog: Removing old versions of TLS](https://blog.mozilla.org/security/2018/10/15/removing-old-versions-of-tls/)
- [Falcon IT Services: Dell iDRAC6 secure connection fails](https://falconitservices.com/dell-idrac6-secure-connection-fails/)
