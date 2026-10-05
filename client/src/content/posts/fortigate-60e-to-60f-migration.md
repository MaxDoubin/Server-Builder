
## The problem

Your FortiGate 60E loses Fortinet support on December 29, 2026, and a FortiGate 60F is the obvious replacement. You want the old configuration running on the new unit without retyping it, and without finding out after cutover that a port name, a certificate or a FortiGuard license did not come across.

## When the 60E stops getting support

[Fortinet's Product Life Cycle portal](https://support.fortinet.com/welcome/#/lifecycle) lists the FortiGate-60E with an end of order date of December 29, 2021, a last service extension date of December 29, 2025, and an end of support date of December 29, 2026. [Jimber's lifecycle timeline](https://jimber.io/blog/fortigate-hardware-end-of-life-timeline/), which cites the JavaScript-only portal, shows the same dates. Fortinet [defines the last service extension date](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Product-Life-Cycle-Information-on-Fortinet/ta-p/194438?externalId=FD49527&sliceId=1) as the last day it accepts an extension of a support or security subscription contract, so a 60E contract that lapses now cannot be renewed. After end of support, Fortinet "is under no obligation to provide support services."

Check the SKU on the label, because variants have their own dates: the 60E-POE, for example, is supported until October 14, 2027. The 60F has no end of order date announced yet.

## What the 60F changes in hardware and port names

The 60E is "Powered by SPU SoC3," according to its [datasheet](https://www.firewalls.com/pub/media/wysiwyg/datasheets/Fortinet/FG-FW-60E.pdf), and Fortinet's hardware acceleration guide says [the SOC3 includes](https://docs.fortinet.com/document/fortigate/7.6.5/hardware-acceleration/567256/np6lite-processors) "a CPU, the NP6Lite network processor, and a CP9Lite content processor." The 60F uses the [SOC4 with an NP6XLite and a CP9XLite](https://docs.fortinet.com/document/fortigate/7.4.6/hardware-acceleration/758378/fortigate-60f-and-61f-fast-path-architecture). The content processor is where IPsec speeds up: the CP9XLite has five IPsec VPN engines and the CP9Lite has one, [per Fortinet](https://docs.fortinet.com/document/fortigate/7.4.3/hardware-acceleration/340357/cp9-cp9xlite-and-cp9lite-capabilities).

| Spec | FortiGate 60E | FortiGate 60F |
|---|---|---|
| Security SoC | SoC3 (NP6Lite, CP9Lite) | SoC4 (NP6XLite, CP9XLite) |
| Memory | 2 GB | 2 GB |
| Firewall, 1518/512/64-byte UDP | 3/3/3 Gbps | 10/10/6 Gbps |
| IPsec VPN, 512-byte | 2 Gbps | 6.5 Gbps |
| IPS, enterprise mix | 400 Mbps | 1.4 Gbps |
| NGFW | 250 Mbps | 1 Gbps |
| Threat protection | 200 Mbps | 700 Mbps |
| SSL inspection, average HTTPS | 135 Mbps | 630 Mbps |
| Concurrent TCP sessions | 1.3 million | 700,000 |
| New TCP sessions per second | 30,000 | 35,000 |

The 60F figures come from its [current datasheet](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/fortigate-fortiwifi-60f-series.pdf). Neither datasheet lists memory, but the [FortiOS 7.4.4 release notes](https://docs.fortinet.com/document/fortigate/7.4.4/fortios-release-notes/768039/2-gb-ram-fortigate-models-no-longer-support-fortios-proxy-related-features) put both models in the 2 GB group. One number goes down: the 60F is rated for fewer concurrent sessions.

Fortinet's 60E datasheet URL now redirects to the 60F sheet, so the 60E column uses the June 2019 revision a reseller still hosts. An [August 2017 revision](https://www.corporatearmor.com/documents/fortinet_fortigate_61e_datasheet.pdf) lists SSL inspection at 175 Mbps, but it tested one TLS 1.2 cipher, while the 2019 revision and the 60F sheet average several HTTPS cipher suites. I trust the 2019 figure for that reason.

### Port names on each model

Both units have ten gigabit RJ45 data ports, an RJ45 console port and a USB 3.0 port. The 60E [information supplement](https://cdn2.hubspot.net/hubfs/2599369/Hardware%20Manuals/Fortinet/FG-FWF-60E-61E-POE-Supplement.pdf) shows Ethernet ports 1 to 7 plus WAN and DMZ ports. The 60F [QuickStart guide](https://fortinetweb.s3.amazonaws.com/docs.fortinet.com/v2/attachments/fd70142f-ff2f-11e9-8977-00505692583a/FG-FWF-40F-60F-Series-QSG.pdf) lists Ethernet ports 1 to 5, DMZ, WAN1, WAN2 and "FortiLink Ports A & B." The FortiOS names below come from Fortinet's [60F port list](https://docs.fortinet.com/document/fortigate/7.6.1/hardware-acceleration/758378/fortigate-60f-and-61f-fast-path-architecture) and the [NetBox device library entry for the 60E](https://netboxlabs.com/ndx/fortinet/fortinet-fg-60e/).

| Panel label | 60E name in FortiOS | 60F name in FortiOS |
|---|---|---|
| WAN1, WAN2 | wan1, wan2 | wan1, wan2 |
| DMZ | dmz | dmz |
| Ethernet 1 to 5 | internal1 to internal5 | internal1 to internal5 |
| 60E ports 6 and 7, 60F ports A and B | internal6, internal7 | a, b |

Only two names change. The catch is that a and b are not plain ports out of the box. Fortinet's [tip on using ports A and B](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Using-FortiGate-Port-A-and-Port-B-as-regular/ta-p/355255) shows them as members of an aggregate interface named fortilink, although the datasheet says they "can be reconfigured as regular ports as needed."

## Which FortiOS version both units can run

Fortinet's [Technical Tip on cross-model restores](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-load-convert-a-FortiGate-configuration-file/ta-p/197247) sets the rules. For an encrypted backup, "the FortiGate model, FortiOS version, and backup password must match." For an unencrypted backup the model must match and the same version is highly recommended, because FortiOS tries to upgrade the configuration during restore and can change it in unexpected ways. Both units go on the same build first.

The 60E sets the ceiling. The [FortiOS 7.4.12 release notes](https://docs.fortinet.com/document/fortigate/7.4.12/fortios-release-notes/760203/introduction-and-supported-models) list the FG-60E and the FG-60F. The [7.6.0](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/760203/introduction-and-supported-models), [7.6.7](https://docs.fortinet.com/document/fortigate/7.6.7/fortios-release-notes/760203/introduction-and-supported-models) and [8.0.1](https://docs.fortinet.com/document/fortigate/8.0.1/fortios-release-notes/760203/introduction-and-supported-models) notes list the FG-60F but not the FG-60E, and the lifecycle portal gives 7.4 as the 60E's last supported software version.

| FortiOS branch | 60E | 60F | Engineering support ends | Support ends |
|---|---|---|---|---|
| 7.4 | Yes (last) | Yes | May 11, 2027 | November 11, 2028 |
| 7.6 | No | Yes | July 25, 2028 | January 25, 2030 |
| 8.0 | No | Yes | April 21, 2029 | October 21, 2030 |

The dates come from [endoflife.date](https://endoflife.date/fortios), which tracks Fortinet's lifecycle data. FortiOS 7.2 reached end of support on September 30, 2026, so match on the newest 7.4 patch that lists both models.

Two version traps apply to both units. From 7.4.4, FortiOS dropped proxy-related features (proxy-based inspection, explicit and transparent proxies, ZTNA and more) on the 40F, 60E, 60F, 80E and 90E series; a [Fortinet notice](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Special-Notice-for-low-end-units-lt-2Gb-RAM/ta-p/328294) says only email proxy inspection returned, in 7.6.5 and 8.0.0. A 60F does not bring proxy mode back. Second, the 60F datasheet says "SSL VPN not supported on FortiOS 7.6.0 and above," so move remote users to IPsec before upgrading the 60F past 7.4.

## Three ways to move the configuration

### FortiConverter, free for FortiGate-to-FortiGate

Fortinet's [FortiConverter FAQ](https://www.fortinet.com/content/dam/fortinet/assets/resources/faq-forticonverter.pdf), dated August 1, 2026, says: "We offer complimentary FortiConverter Service to existing FortiGate customers upgrading to new FortiGate models." Third-party conversions stay paid. [BOLL](https://blog.boll.ch/how-to-transfer-a-fortigate-configuration-to-a-newer-model/), a [Fortinet distributor](https://www.boll.ch/fortinet/), dates the change to June 20, 2025. Fortinet's [best-practices guide](https://docs.fortinet.com/document/fortigate/7.6.0/best-practices/341043/migration) still calls FortiConverter "a one time, paid service." I trust the newer FAQ and the FortiConverter Service pages, which address this case directly.

You claim the license in the support portal with the Get Free License button, against the 60F's serial, and [only unentitled devices can be selected](https://docs.fortinet.com/document/forticonverter-service/25.1.0/online-help/724941/get-free-license-for-fortigate-conversion). Read that page's condition first: your submission is used for AI training, and "There is no option to opt out of AI training after the ticket submission." Expect about two to three business days, per the FAQ, and a converted config file plus a report.

From FortiOS 7.4.0 the ticket can start [from the new unit's setup screen](https://docs.fortinet.com/document/fortigate/7.4.0/new-features/819483/forticonverter-in-the-gui): enable Allow FortiConverter to obtain config file once under System > Settings on the 60E, choose Migrate Config with FortiConverter on the 60F, then map interfaces. Per the FAQ, managed FortiSwitch, FortiAP, FortiToken and FortiManager pieces are out of scope, hardware switches become software switches where the target cannot build them in hardware, and the default admin password is reset. In general, VPN pre-shared keys, certificates and local users stay valid if the FortiOS version is above 5.6.

### Editing the backup header (unsupported)

Fortinet documents this method in its [best-practices guide](https://docs.fortinet.com/document/fortigate/7.6.0/best-practices/541336/migrating-a-fortigate-configuration-manually-using-configuration-files), but the Technical Tip is explicit: "Fortinet Support does not provide support for configuration files that were manually modified to migrate a configuration from one FortiGate model to another."

The lines starting with # identify the model and build. Fortinet's example swaps an 80F header for a 100F header, and a [60F backup on 7.4.11](https://community.fortinet.com/fortigate-3/technical-tip-how-to-download-fortigate-configuration-file-debug-log-from-gui-and-cli-96675) begins like the third line:

```
#config-version=FGT80F-7.0.6-FW-build0366-220606:opmode=0:vdom=0:user=admin
#config-version=FGT100F-7.0.6-FW-build0366-220606:opmode=0:vdom=0:user=admin
#config-version=FGT60F-7.4.11-FW-build2878-260126:opmode=0:vdom=0:user=szhao
```

A 60E file carries FGT60E in the same position, [owners report](https://community.fortinet.com/t5/Support-Forum/Fortigate-Firewall-upgrade-from-60E-to-60F/td-p/66293). BOLL's method is the cleanest: back up the 60F after it reaches the matching build, copy every line that starts with # (config-version, conf_file_ver, buildno, global_vdom), and replace the matching lines in the 60E file.

Then rename ports. Owners [report mapping](https://community.fortinet.com/support-forum-92/fortigate-upgrade-from-60e-to-60f-using-config-203165) 60E ports 6 and 7 to 60F ports A and B. In a plain-text editor (the Tip warns that rich-text editors "can replace ASCII characters"), replace "internal6" and "internal7" with "a" and "b" everywhere, including the member list of the default hardware switch, which Fortinet says is [named internal or lan](https://docs.fortinet.com/document/fortigate/7.6.0/administration-guide/100999/hardware-switch) depending on the model. References also sit in policies, routes, SD-WAN, IPsec, zones, DHCP servers, VIPs and local-in policies. Before the backup, ask the 60E where each port is used and compare hardware switches on both units, using commands from a [Fortinet tip](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-delete-the-default-virtual-Hardware-Switch/ta-p/196365):

```
diagnose sys cmdb refcnt show system.interface.name internal6
diagnose sys cmdb refcnt show system.interface.name internal7
show system interface | grep -f 'set type hard-switch'
```

### Rebuilding from the CLI

The third path starts the 60F from defaults and pastes in only what you want: address objects, services, policies, routes. The Tip confirms that individual sections "can be manually migrated by copying the required configuration" from the old backup. It takes longest, but it leaves years of stale objects behind, and you fix interface names only in what you paste. If the CLI is new to you, start with [FortiGate CLI essentials](/blog/fortigate-cli-essentials).

## A cutover procedure that keeps a way back

1. Register the 60F. The QuickStart guide ties FortiGuard updates, firmware upgrades and support to registration, and the free FortiConverter license needs the serial. Out of the box the 60F answers at `https://192.168.1.99` on port 1, user admin, blank password.
2. Put both units on the same 7.4 build with Fortinet's [Upgrade Path Tool](https://docs.fortinet.com/upgrade-tool), which "returns the shortest tested upgrade path."
3. On the 60E, check whether private-data-encryption is enabled under config system global, and find its 32-digit key if it is.
4. Back up the 60E in FortiOS format. Use an unencrypted file for the header method, and leave Password mask off, because it [replaces secrets with FortinetPasswordMask](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/598820/support-backing-up-configurations-with-password-masking-7-2-1). Keep an untouched copy.
5. Convert the file with FortiConverter or the header edit.
6. Restore on the 60F while it is cabled only to your laptop, from the GUI or from the CLI as in [Fortinet's TFTP example](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Restoring-a-config-file-from-the-CLI-by-using-TFTP/ta-p/191392) (its file name and server address shown). A good restore looks like this:

<figure>
<img src="/images/blog/fortigate-60e-to-60f-migration/fortigate-in-lab-rack.jpg" alt="A Fortinet firewall cabled beside a switch and a server on a lab bench" width="1200" height="1600" loading="lazy" decoding="async">
<figcaption>A FortiGate cabled in beside a switch and a server at The Gathering 2019 in Norway. Keep the old unit wired and ready until the new one has carried real traffic. Photo: DiFronzo, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:The_Gathering_2019_-_Switch,_server_and_firewall_(46813726365).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

```
execute restore config tftp test.conf 10.82.2.2
This operation will overwrite the current setting and could possibly reboot the system!
Do you want to continue? (y/n)
Connect to TFTP server 10.82.2.2 ...
Get file from TFTP server OK.
File check OK.
```

7. After the reboot, read the error log, as Fortinet's procedure does. The second line below is Fortinet's [example of an error](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Configuration-is-partially-lost-after-upgrade/ta-p/197603): VDOM, config path, failed command. Fix the file and restore until no model-related errors remain.

```
diagnose debug config-error-log read
"unset" "post-lang" @ root.firewall.profile-protocol-options.scan.ftp:command parse error (error -61)
```

8. Power the 60E off without wiping it, then move the cables. Never run both: after the restore they share every IP address.
9. Test each WAN, DHCP scope, VPN and inspection profile, then sort out licenses.

## What breaks

**The GUI rejects the file with "Invalid configuration file or password required."**

The Tip names this error for files that were not converted. The usual causes are an encrypted backup, mismatched builds, or a header that still says FGT60E.

Fix: match the build exactly, use an unencrypted file for the header method, and paste in the 60F's own # lines.

**Policies, DHCP or the switch point at ports that do not exist.**

A 60F has no internal6 or internal7, which is why Fortinet's procedure has you edit the interface layout before restoring and read the error log after.

Fix: rename before restoring and confirm in the error log. If the restored config keeps a fortilink interface, remove a and b from its `set member "a" "b"` line before using them elsewhere.

**Passwords and keys come back wrong.**

With private-data-encryption on, a restore to new hardware without the key causes "all encrypted passwords (except the system admin) to be lost," per [Fortinet's tip](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-restore-a-backup-configuration-file-with/ta-p/195668). A masked backup restores the mask, not the secret.

Fix: enable private-data-encryption on the 60F with the same key before restoring, never restore a masked file, and set a new admin password after a FortiConverter migration.

**Browsers or VPN clients warn about certificates after cutover.**

The Fortinet_Factory certificate is [unique to each device](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Explanation-on-Fortinet-Factory-certificate/ta-p/388146) and does not exist in the backup, and Fortinet [recommends](https://community.fortinet.com/fortigate-3/technical-tip-regenerate-the-fortinet-ca-ssl-ca-certificate-used-for-ssl-inspection-94749) that the SSL inspection CA be unique to each FortiGate. Anything that used or trusted the 60E's built-in [certificates](/blog/ssl-tls-certificates-explained) can see different ones on the 60F.

Fix: point admin access and VPNs at certificates you control. For deep inspection, push the 60F's CA to clients, or import the old Fortinet_CA_SSL from the backup under a new name and select it in the profiles, which [owners report works](https://community.fortinet.com/t5/Support-Forum/Migrate-Fortinet-CA-SSL-from-old-Fortigate-to-a-new-one/m-p/239777) where overwriting the default does not.

**FortiGuard, FortiCare and FortiToken stay with the 60E's serial.**

Contracts are registered against a serial number, and for moving them Fortinet says ["ONLY RMA Transfer will be approved."](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Requirements-for-Contract-Transfer-Request/ta-p/299780) The exception is the [Trade-Up program](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Registering-products-and-transferring/ta-p/266001) when you bought a compatible stand-alone unit rather than a bundle. FortiToken Mobile licenses shipped on or after August 4, 2025 [move only for an RMA](https://community.fortinet.com/fortiauthenticator-8/technical-tip-migrating-users-and-fortitokens-to-another-fortigate-fortiauthenticator-95879).

Fix: buy a 60F bundle or new contracts and register them, and open a Customer Service ticket for older token licenses with both serials and the EFT license SKU.

**Proxy policies or SSL VPN stop working.**

Both models lost proxy features at 7.4.4. Even on the builds that brought email proxy back, traffic matching a proxy policy for a non-email protocol "will be dropped," per Fortinet's notice. SSL VPN goes away once the 60F runs 7.6.

Fix: convert proxy policies to flow-based inspection before the migration, and move remote access to IPsec before upgrading the 60F past 7.4.

## What this means

Match both units on the same 7.4 build, then pick a path. FortiConverter is free for this upgrade and does the mapping for you, at the cost of a few business days and Fortinet's AI-training terms. For a small or sensitive config, the header edit works on this pair because only two port names change, but it is unsupported, so keep the 60E powered off and intact until the 60F has run cleanly. Budget for new FortiGuard and FortiCare contracts on the 60F's serial, and finish before December 29, 2026. In a [homelab FortiGate](/blog/fortigate-firewall-homelab) the steps are identical, with fewer objects to check.

## References

- [Fortinet Support: welcome](https://support.fortinet.com/welcome/#/lifecycle)
- [Jimber: fortigate hardware end of life timeline](https://jimber.io/blog/fortigate-hardware-end-of-life-timeline/)
- [Fortinet Community: t5 / Customer-Service / Customer-Service-Tip-Product-Life-Cycle-Information-on-F](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Product-Life-Cycle-Information-on-Fortinet/ta-p/194438?externalId=FD49527&sliceId=1)
- [firewalls.com: FG FW 60E](https://www.firewalls.com/pub/media/wysiwyg/datasheets/Fortinet/FG-FW-60E.pdf)
- [corporatearmor.com: fortinet fortigate 61e datasheet](https://www.corporatearmor.com/documents/fortinet_fortigate_61e_datasheet.pdf)
- [Fortinet: fortigate fortiwifi 60f series](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/fortigate-fortiwifi-60f-series.pdf)
- [cdn2.hubspot.net: FG FWF 60E 61E POE Supplement](https://cdn2.hubspot.net/hubfs/2599369/Hardware%20Manuals/Fortinet/FG-FWF-60E-61E-POE-Supplement.pdf)
- [fortinetweb.s3.amazonaws.com: FG FWF 40F 60F Series QSG](https://fortinetweb.s3.amazonaws.com/docs.fortinet.com/v2/attachments/fd70142f-ff2f-11e9-8977-00505692583a/FG-FWF-40F-60F-Series-QSG.pdf)
- [Fortinet Docs: np6lite processors](https://docs.fortinet.com/document/fortigate/7.6.5/hardware-acceleration/567256/np6lite-processors)
- [Fortinet Docs: fortigate 60f and 61f fast path architecture](https://docs.fortinet.com/document/fortigate/7.4.6/hardware-acceleration/758378/fortigate-60f-and-61f-fast-path-architecture)
- [Fortinet Docs: fortigate 60f and 61f fast path architecture](https://docs.fortinet.com/document/fortigate/7.6.1/hardware-acceleration/758378/fortigate-60f-and-61f-fast-path-architecture)
- [Fortinet Docs: cp9 cp9xlite and cp9lite capabilities](https://docs.fortinet.com/document/fortigate/7.4.3/hardware-acceleration/340357/cp9-cp9xlite-and-cp9lite-capabilities)
- [netboxlabs.com: fortinet fg 60e](https://netboxlabs.com/ndx/fortinet/fortinet-fg-60e/)
- [netboxlabs.com: fortinet fg 60f](https://netboxlabs.com/ndx/fortinet/fortinet-fg-60f/)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-Using-FortiGate-Port-A-and-Port-B-as-regular / ta](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Using-FortiGate-Port-A-and-Port-B-as-regular/ta-p/355255)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-How-to-load-convert-a-FortiGate-configuration-fil](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-load-convert-a-FortiGate-configuration-file/ta-p/197247)
- [Fortinet Docs: introduction and supported models](https://docs.fortinet.com/document/fortigate/7.4.12/fortios-release-notes/760203/introduction-and-supported-models)
- [Fortinet Docs: introduction and supported models](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/760203/introduction-and-supported-models)
- [Fortinet Docs: introduction and supported models](https://docs.fortinet.com/document/fortigate/7.6.7/fortios-release-notes/760203/introduction-and-supported-models)
- [Fortinet Docs: introduction and supported models](https://docs.fortinet.com/document/fortigate/8.0.1/fortios-release-notes/760203/introduction-and-supported-models)
- [Fortinet Docs: 2 gb ram fortigate models no longer support fortios proxy related features](https://docs.fortinet.com/document/fortigate/7.4.4/fortios-release-notes/768039/2-gb-ram-fortigate-models-no-longer-support-fortios-proxy-related-features)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-Special-Notice-for-low-end-units-lt-2Gb-RAM / ta-](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Special-Notice-for-low-end-units-lt-2Gb-RAM/ta-p/328294)
- [endoflife.date: fortios](https://endoflife.date/fortios)
- [Fortinet: faq forticonverter](https://www.fortinet.com/content/dam/fortinet/assets/resources/faq-forticonverter.pdf)
- [Fortinet Docs: get free license for fortigate conversion](https://docs.fortinet.com/document/forticonverter-service/25.1.0/online-help/724941/get-free-license-for-fortigate-conversion)
- [blog.boll.ch: how to transfer a fortigate configuration to a newer model](https://blog.boll.ch/how-to-transfer-a-fortigate-configuration-to-a-newer-model/)
- [boll.ch: fortinet](https://www.boll.ch/fortinet/)
- [Fortinet Docs: migration](https://docs.fortinet.com/document/fortigate/7.6.0/best-practices/341043/migration)
- [Fortinet Docs: forticonverter in the gui](https://docs.fortinet.com/document/fortigate/7.4.0/new-features/819483/forticonverter-in-the-gui)
- [Fortinet Docs: migrating a fortigate configuration manually using configuration files](https://docs.fortinet.com/document/fortigate/7.6.0/best-practices/541336/migrating-a-fortigate-configuration-manually-using-configuration-files)
- [Fortinet Community: technical tip how to download fortigate configuration file debug log from gui and cli 9667](https://community.fortinet.com/fortigate-3/technical-tip-how-to-download-fortigate-configuration-file-debug-log-from-gui-and-cli-96675)
- [Fortinet Community: t5 / Support-Forum / Fortigate-Firewall-upgrade-from-60E-to-60F / td-p / 66293](https://community.fortinet.com/t5/Support-Forum/Fortigate-Firewall-upgrade-from-60E-to-60F/td-p/66293)
- [Fortinet Community: fortigate upgrade from 60e to 60f using config 203165](https://community.fortinet.com/support-forum-92/fortigate-upgrade-from-60e-to-60f-using-config-203165)
- [Fortinet Docs: hardware switch](https://docs.fortinet.com/document/fortigate/7.6.0/administration-guide/100999/hardware-switch)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-How-to-delete-the-default-virtual-Hardware-Switch](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-delete-the-default-virtual-Hardware-Switch/ta-p/196365)
- [Fortinet Docs: upgrade tool](https://docs.fortinet.com/upgrade-tool)
- [Fortinet Docs: support backing up configurations with password masking 7 2 1](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/598820/support-backing-up-configurations-with-password-masking-7-2-1)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-Restoring-a-config-file-from-the-CLI-by-using-TFT](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Restoring-a-config-file-from-the-CLI-by-using-TFTP/ta-p/191392)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-Configuration-is-partially-lost-after-upgrade / t](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Configuration-is-partially-lost-after-upgrade/ta-p/197603)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-How-to-restore-a-backup-configuration-file-with /](https://community.fortinet.com/t5/FortiGate/Technical-Tip-How-to-restore-a-backup-configuration-file-with/ta-p/195668)
- [Fortinet Community: t5 / FortiGate / Technical-Tip-Explanation-on-Fortinet-Factory-certificate / ta-](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Explanation-on-Fortinet-Factory-certificate/ta-p/388146)
- [Fortinet Community: technical tip regenerate the fortinet ca ssl ca certificate used for ssl inspection 94749](https://community.fortinet.com/fortigate-3/technical-tip-regenerate-the-fortinet-ca-ssl-ca-certificate-used-for-ssl-inspection-94749)
- [Fortinet Community: t5 / Support-Forum / Migrate-Fortinet-CA-SSL-from-old-Fortigate-to-a-new-one / m](https://community.fortinet.com/t5/Support-Forum/Migrate-Fortinet-CA-SSL-from-old-Fortigate-to-a-new-one/m-p/239777)
- [Fortinet Community: t5 / Customer-Service / Customer-Service-Tip-Requirements-for-Contract-Transfer-](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Requirements-for-Contract-Transfer-Request/ta-p/299780)
- [Fortinet Community: t5 / Customer-Service / Customer-Service-Tip-Registering-products-and-transferri](https://community.fortinet.com/t5/Customer-Service/Customer-Service-Tip-Registering-products-and-transferring/ta-p/266001)
- [Fortinet Community: technical tip migrating users and fortitokens to another fortigate fortiauthenticator 9587](https://community.fortinet.com/fortiauthenticator-8/technical-tip-migrating-users-and-fortitokens-to-another-fortigate-fortiauthenticator-95879)
