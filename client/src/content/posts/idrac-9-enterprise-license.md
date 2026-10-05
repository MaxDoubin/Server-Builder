
## The short answer

iDRAC9 Enterprise is the paid license that adds the HTML5 virtual console, virtual media, Remote File Share, Group Manager and directory login to 14th, 15th and 16th generation PowerEdge servers. Rack and tower servers ship with [Basic (100 to 500 series) or Express (600 series and up)](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf), and neither includes the console. Check what you have under Configuration, then Licenses, or with `racadm license view`, and try Dell's 30-day Enterprise trial, which can be imported once per product, before you buy. A license is perpetual but bound to one service tag and one server generation, and Dell's own prices for the 14th generation Enterprise upgrade ranged from $492 in its online store on October 5, 2026 to $1,039 in its July 2026 licensing guide.

## What are the iDRAC9 license tiers?

iDRAC9 has four tiers, Basic, Express, Enterprise and Datacenter, and [it spans 14th, 15th and 16th generation PowerEdge servers](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf). Basic is standard on 100 to 500 series rack and tower servers, Express is standard on 600 series and higher, and Enterprise and Datacenter are upgrades for any server. In practice an R740 or R640 ships with Express and an R240 or R440 ships with Basic, unless Enterprise was ordered with the server.

Blades are the exception: the virtual console [is a licensed feature for rack and tower servers and "available by default in blade servers"](https://www.dell.com/support/kbdoc/en-us/000179797/dell-poweredge-idrac-virtual-console), and the guides list those blades under an Express for Blades column. Dell's documents disagree on which models qualify. The licensing guide puts the M640 there but the MX740c under plain Express, while the [4.40 user's guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) calls Express for Blades the default on M6XX and MXXXX systems, so read the Licenses page on the blade itself.

Datacenter is the newest iDRAC9 tier, introduced with [firmware 4.00.00.00 in December 2019](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_release-notes1_en-us.pdf). StorageReview's [February 18, 2020 overview](https://www.storagereview.com/review/dell-emc-idrac9-v4-0-overview) says the Enterprise features are also included in Datacenter.

Dell's support page says an iDRAC9 license is [perpetual, valid for the life of a server and bound to the Service Tag of a unique server](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9), and that [feature development for iDRAC9 on 14th generation servers ended on June 30, 2023](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9). A license bought for an R740 today unlocks a finished feature set; the [R740 end of life dates](/blog/poweredge-r740-end-of-life) cover the rest of the lifecycle.

## What does each iDRAC9 license unlock?

Express adds monitoring extras, Enterprise adds remote presence and fleet features, and Datacenter adds telemetry and thermal controls on top of everything in Enterprise. This table follows the [iDRAC9 7.xx user's guide from June 2024](https://onlineimages.techmikeny.com/CTOPDF/IDRAC9_User_Guide.pdf).

| Feature | Basic | Express | Enterprise | Datacenter |
|---|---|---|---|---|
| Web UI, Redfish, IPMI 2.0, RACADM, SSH, SNMP, serial-over-LAN | Yes | Yes | Yes | Yes |
| NTP, email alerts, power graphs, crash screen capture, remote OS deployment | No | Yes | Yes | Yes |
| HTML5 virtual console | No | No | Yes | Yes |
| Virtual media (ISO or USB from your PC) | No | No | Yes | Yes |
| Virtual folders, Remote File Share | No | No | Yes | Yes |
| Console collaboration (six users), chat, VNC | No | No | Yes | Yes |
| Group Manager (up to 250 servers) | No | No | Yes | Yes |
| Directory login (AD, LDAP), smart-card two-factor, single sign-on, lockdown mode | No | No | Yes | Yes |
| Remote [syslog](/blog/syslog-centralized-logging), out-of-band performance monitoring, power capping | No | No | Yes | Yes |
| Crash video capture, boot capture | No | No | Yes | Yes |
| Telemetry streaming | No | No | No | Yes |
| PCIe airflow (LFM) customization, custom exhaust and delta-T control | No | No | No | Yes |

Dell's guides change with firmware, and some features moved down the tiers, so read the guide for your version. The 4.40 guide lists SMART logs for storage drives as Datacenter-only and scheduled repository updates as Enterprise and up, while the 7.xx guide lists both for every tier. The 7.xx guide also lists exhaust-temperature settings on every tier for 14th generation servers, but Datacenter-only for 15th and 16th generation.

## What changed with iDRAC10 Core, Enterprise and Datacenter?

iDRAC10 on 17th generation PowerEdge servers has three tiers, Core, Enterprise and Datacenter, with no Basic or Express. Dell describes [a simplified license structure compared with iDRAC9](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf), and Core is free and [included with all Gen17 servers](https://www.itpro.com/infrastructure/servers-and-storage/dell-idrac10-review-the-best-remote-server-management-solution-just-got-even-better).

The console is still the dividing line. In [Dell's iDRAC10 guide](https://gfx3.senetic.com/akeneo-catalog/6/7/d/b/67db6c38029beb8d409a682d5abd9cce384f66f9_1785307_RCYKN_icecat_multimedia_other_digital_assets_6_en_GB.pdf) (1.20.xx, December 2025), virtual console, virtual media and Remote File Share are No on Core and Yes on Enterprise. Three differences from iDRAC9 matter:

- Email alerting, which iDRAC9 Express included, needs Enterprise on iDRAC10, though SNMP traps and gets stay on every tier.
- Smart-card two-factor login moved up to Datacenter, while Easy Multi Factor Authentication is in Enterprise.
- Enterprise and Datacenter come [bundled with Secure Enterprise Key Management and Secure Component Verification licenses at point of sale](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf).

| Feature | Core | Enterprise | Datacenter |
|---|---|---|---|
| Virtual console, virtual media, Remote File Share | No | Yes | Yes |
| Directory services (AD, LDAP) | No | Yes | Yes |
| Email alerting | No | Yes | Yes |
| Smart-card two-factor | No | No | Yes |
| Telemetry, PCIe airflow customization | No | No | Yes |

iDRAC10 licenses are [tied to a server generation](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf) just like iDRAC9 licenses, and Dell lists [30-day trials for iDRAC10 Enterprise and Datacenter](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses).

## How do you check which iDRAC license is installed?

Open Configuration, then Licenses in the iDRAC9 web interface. Dell's guide says [the Licensing page displays the licenses associated with devices](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf). From a shell, run `racadm license view`; Dell's [RACADM guide](https://gfx3.senetic.com/akeneo-catalog/f/0/6/a/f06a644a0e48069b7654a11c4af01bdac856ff5d_1747759_CDKHV_icecat_multimedia_other_digital_assets_5_en_GB.pdf) shows output like this (abbreviated):

<figure>
<img src="/images/blog/idrac-9-enterprise-license/server-row.jpg" alt="Racks of servers in a data center" width="1200" height="800" loading="lazy" decoding="async">
<figcaption>Racks of servers in a data center. On any iDRAC9 the installed license shows under Configuration, then Licenses, or with racadm license view. Photo: Victor Grigas, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Wikimedia_Foundation_Servers-8055_35.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

```
racadm license view
iDRAC.Embedded.1
        Status               = OK
        Device               = iDRAC.Embedded.1
        Device Description   = iDRAC
        Unique Identifier    = H1VGF2S
                License #1
                        Status               = OK
                        License Description  = iDRAC Enterprise License
                        License Type         = PERPETUAL
                        License Bound        = H1VGF2S
                        Expiration           = Not Applicable
```

On your server, License Bound should show your service tag; Dell says that once a license is bound you [see the bound tag with the license details](https://www.dell.com/support/kbdoc/en-us/000353269/lic008-the-license-binding-id-does-not-match-the-device-unique-identifierdge-lic008-the-license-binding-id-does-not-match-the-device-unique-identifier). `racadm getsvctag` prints the tag, and the web interface shows it under [System, then Overview](https://www.dell.com/support/contents/en-us/article/product-support/self-support-knowledgebase/locate-service-tag/server-storage).

A missing license shows up as features that are absent, because [only licensed features are available in the interfaces](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf). Launching the virtual console without the license returns [LIC501, "A required license is missing or expired"](https://www.dell.com/support/kbdoc/en-us/000189590/dell-emc-vxrail-error-shown-in-idrac-virtual-console-lic501-a-required-license-is-missing-or-expired).

For several servers, Dell points to [Dell License Manager for one-to-many license management](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf). Dell's [open-source Redfish script](https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/IdracLicenseManagementOemREDFISH.py) lists installed licenses with `--get`, can also export, import and delete them, and prompts for the password if you leave out `-p`:

```
python3 IdracLicenseManagementOemREDFISH.py -ip IDRAC_IP -u USER --get
```

## How does the iDRAC9 trial license work?

Dell offers [30-day trial licenses for iDRAC9 Enterprise and Datacenter](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses) on 14th, 15th and 16th generation servers. To use one:

1. Open Dell's trial licenses page and agree to the terms and conditions to download.
2. Download the row for your generation, such as "14th Generation PowerEdge servers with iDRAC9 Enterprise Trial License (30 days)".
3. Extract the ZIP to get the XML license file.
4. In iDRAC9, go to Configuration, then Licenses, and choose Import under License Options.

Dell's two documents describe the clock differently. The trial page says the evaluation period [begins from the date of downloading](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses), while the iDRAC guide says the [timer runs when power is applied to the system and cannot be extended](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf). Treat the download date as day one and download only when you are ready to test.

You cannot repeat it: [a trial license can only be imported one time per product](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses). Dell's [trial terms](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses) also say you may not use it in a production environment. A July 2020 forum post described a Dell [240-day Enterprise offer](https://forums.servethehome.com/index.php?threads/dell-idrac-8-9-enterprise-extended-trial-license-240-days.29653/), and a June 2021 reply in that thread says it was no longer available. Dell's current page lists only 30-day iDRAC trials.

## How are iDRAC licenses bound to a server?

Each license is an XML file issued for one service tag and one server generation. [iDRAC9 licenses differ across 14G, 15G and 16G](https://www.dell.com/support/kbdoc/en-us/000353269/lic008-the-license-binding-id-does-not-match-the-device-unique-identifierdge-lic008-the-license-binding-id-does-not-match-the-device-unique-identifier), and Dell's licensing guide says an [import for a different generation fails](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf). A license bought with the server is installed at the factory. One bought later sits in your Dell account, where the [Digital Locker functions have moved to My Account](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf). To get the file:

<figure>
<img src="/images/blog/idrac-9-enterprise-license/cable-management.jpg" alt="The back of Dell PowerEdge 1950 servers with cable management arms" width="1200" height="798" loading="lazy" decoding="async">
<figcaption>The back of Dell PowerEdge 1950 servers. An iDRAC license is bound to one service tag and one server generation, so it stays with the machine. Photo: ShakataGaNai, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Cable_Management_Dell_1950.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

1. Sign in to a Dell account [linked to the service tag](https://www.dell.com/support/kbdoc/en-us/000183997/idrac9-enterprise-license-retrieval-from-dell-digital-locker) and open Software Licenses.
2. Select the iDRAC license and choose Download Key, after [checking that the Service Tag is correct](https://www.dell.com/support/kbdoc/en-us/000130349/how-to-obtain-idrac-enterprise-licenses-from-dell-digital-locker-ddl).
3. Extract the ZIP, then import the XML file in the web interface (Configuration, Licenses, Import), with RACADM, or through Redfish.

```
racadm license import -f License.xml -c idrac.embedded.1
```

Import needs [Login, Configure iDRAC and Server Control privileges](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf), and the Redfish ImportLicense action takes [a base-64 encoded string of the XML license file](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_api-guide_en-us.pdf). Dell's iDRAC guide also warns that although you can export the factory-installed license, [you cannot import it](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf), so reinstall from My Account or your purchase email.

A license does not move to a different server, so a used server's license stays with its service tag. In a [July 2024 Dell Community thread](https://www.dell.com/community/en/conversations/poweredge-hardware-general/lost-idrac-enterprise/66a0ff898e75fa46cbe8f1aa) about an iDRAC7 server, a moderator told the new owner to transfer ownership of the tag to their name with Dell's Ownership Transfer form. The moderator added that if Dell's records show Express for the tag, that is what the server was purchased with; in that case Enterprise would be a new purchase.

### Can you use a license file issued for another server?

No. License files are signed and tied to a service tag. Dell License Manager's troubleshooting list includes the error [The digital signature is invalid](https://downloads.dell.com/topicspdf/license-manager_users-guide6_en-us.pdf), and the iDRAC guide says a license is imported [if it passes the validation checks](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf). Using a file issued for another server is outside Dell's terms: the [license agreement](https://dell.com/learn/us/en/tda/terms-conditions/art-software-license-agreements) requires License Keys to come from Dell or an authorized provider, forbids transferring them to anyone else, and forbids circumventing technological use restrictions. This article does not link to or describe sources of unlicensed keys. The legitimate free routes are the license your server shipped with, the 30-day trial, and recovering the license that belongs to your own service tag through My Account.

## How much does an iDRAC9 Enterprise license cost?

Dell's own prices for the 14th generation Enterprise upgrade ranged from [$492 in its online store](https://www.dell.com/en-us/shop/idrac-license-enterprise/apd/385-bbkw/software) to [$1,039 in its licensing guide](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf), and the store price is lower than the guide's in every row below. The guide figures are its after-sale prices from the July 2026 edition, and the store prices were fetched from the public pages on October 5, 2026. Dell's store page says its pricing is for online purchases only, so prices from other channels can differ.

| Item | Dell guide, after sale (July 2026) | Dell US store (October 5, 2026) |
|---|---|---|
| [iDRAC9 Enterprise, 14G (385-BBKW)](https://www.dell.com/en-us/shop/idrac-license-enterprise/apd/385-bbkw/software) | $1,039 | $492.00 |
| [iDRAC9 Enterprise, 15G (385-BBPP)](https://www.dell.com/en-us/shop/idrac-license/apd/385-bbpp/software) | $1,039 | $332.52 |
| [iDRAC9 Enterprise, 16G (528-CTIE)](https://www.dell.com/en-us/shop/idrac-license/apd/528-ctie/software) | $1,039 | $706.52 |
| [iDRAC9 Datacenter, 14G (528-CIBH)](https://www.dell.com/en-us/shop/idrac-license/apd/528-cibh/software) | $1,464 | $689.00 |
| [iDRAC9 Express, 14G, 100 to 500 series (385-BBLB)](https://www.dell.com/en-us/shop/idrac-license/apd/385-bblb/software) | $549 | $249.00 |
| [iDRAC10 Enterprise, 17G (634-CSHX)](https://www.dell.com/en-us/shop/idrac-license/apd/634-cshx/software) | $1,433 | $974.44 |
| [iDRAC10 Datacenter, 17G (634-CSHZ)](https://www.dell.com/en-us/shop/idrac-license/apd/634-cshz/software) | $1,911 | $1,299.48 |

The guide also lists $831 for the 14th generation Enterprise license ordered with the server. If you buy from anyone other than Dell, remember that Dell binds each license to one service tag and that its agreement requires License Keys to come from Dell or an authorized provider. Ask how the file will be issued for your tag, then confirm that `racadm license view` shows your tag next to License Bound.

## Is Enterprise worth it, and what can you do without it?

Skip Enterprise if the server sits within reach and you mostly need alerts, power control and firmware updates. Buy it, or use the trial for a one-off job, if you need a graphical console or an ISO mounted on a server you cannot walk up to. ServeTheHome's R760 review notes that [iDRAC 9 Enterprise gives "the full HTML5 iKVM functionality"](https://www.servethehome.com/dell-poweredge-r760-review-the-mainstream-2u-dual-intel-xeon-server/3/).

<figure>
<img src="/images/blog/idrac-9-enterprise-license/nersc-rack.jpg" alt="The back of a server rack with small blue LED screens on each machine" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>The back of a rack at NERSC. Without Enterprise, serial over LAN, PXE boot and a USB stick in the server cover much of what the virtual console and virtual media do. Photo: Derrick Coetzee from Berkeley, CA, USA, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Rear_of_rack_at_NERSC_data_center_-_closeup.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Missing without Enterprise | Documented workaround | What you still miss |
|---|---|---|
| Graphical console | IPMI serial-over-LAN | Video, mouse, graphical installers |
| Virtual media | USB stick in the server, one-time PXE boot, OS deployment from an NFS or CIFS share | Remote rescue ISOs |
| Group Manager | RACADM or Redfish scripts per server | One screen for a fleet |
| Directory login | Local iDRAC users with roles | Central accounts |
| Remote syslog | SNMP traps (every tier), email alerts (Express and up) | A syslog stream |

Serial-over-LAN works on every tier. Dell's guide says it lets you [view the progress of a server during POST and reconfigure the BIOS setup program](https://onlineimages.techmikeny.com/CTOPDF/IDRAC9_User_Guide.pdf), once BIOS serial redirection and the iDRAC SOL setting are on:

```
ipmitool -H IDRAC_IP -I lanplus -U USER -P PASSWORD sol activate
```

Press `~` then `.` to leave; the [ipmitool manual](https://manpages.debian.org/testing/ipmitool/ipmitool.1.en.html) lists that escape sequence. For installs, the first boot device list in the iDRAC guide includes PXE and can apply to the next boot only, so a [PXE network install](/blog/pxe-network-boot) can start with nobody at the machine, and [OS deployment through Server Configuration Profiles](https://onlineimages.techmikeny.com/CTOPDF/IDRAC9_User_Guide.pdf) pulls the media from an NFS or CIFS share on Express and up. For background see [IPMI and out-of-band management](/blog/ipmi-remote-management), and for day-to-day settings see [Dell iDRAC tips and tricks](/blog/dell-idrac-tips-tricks).

Enterprise is worth the money when the server is remote, when you reinstall often, when a team needs directory login, or when you manage several servers. A single R740 on a shelf rarely needs it, and Datacenter's extras, telemetry streaming and PCIe airflow control, are aimed at [large data centers](https://www.storagereview.com/review/dell-emc-idrac9-v4-0-overview), according to StorageReview.

## What breaks

**The import fails with LIC008, "The license binding ID does not match the device unique identifier."** The license is bound to another service tag or generation, or was never bound to yours. Fix: in My Account choose Download Key, enter your service tag in capitals, and confirm the generation matches your server. If it was bound to the wrong tag, contact Dell Technical Support.

**Launching the console returns LIC501.** The message says a required license is missing or expired, so the server has Basic or Express, the trial ran out, or the Enterprise license was [changed or deleted](https://www.dell.com/support/kbdoc/en-us/000189590/dell-emc-vxrail-error-shown-in-idrac-virtual-console-lic501-a-required-license-is-missing-or-expired). Fix: check Configuration, then Licenses, and import an Enterprise license.

**The console is still unavailable right after a successful import.** The web interface needs a fresh session before it shows licensed features. Fix: log out and back in, as [Dell's guide](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf) says.

**The license stops working after a motherboard replacement.** The new board carries a different service tag until the original is restored, and the license is bound to the old one. In a November 2024 Dell Community thread a moderator told an R740 owner that [the bound license is tied with the service tag](https://www.dell.com/community/en/conversations/rack-servers/the-license-binding-id-does-not-match-the-device-unique-identifier/6733af3a7b3cd535d9749deb), and that once the tag was updated Dell could generate a new license file. Fix: [Easy Restore can restore the service tag and licenses](https://onlineimages.techmikeny.com/CTOPDF/IDRAC9_User_Guide.pdf); otherwise ask Dell to reissue the file.

**Launch Virtual Console is grayed out in OpenManage Enterprise although the iDRAC has Enterprise.** A January 2021 [Dell Community thread](https://www.dell.com/community/en/conversations/dell-openmanage-enterprise/remote-console-launch-virtual-console-button-grayed-out/647f8f65f4ccf8a8de074ced) about OpenManage Enterprise 3.5 reports the console was unavailable for servers discovered in-band over SSH but available when discovered through the iDRAC IP address with Redfish. Fix: rediscover the server that way.

**A second trial import fails.** Dell allows one trial import per product. Fix: buy a perpetual license, or stay on Express and use the workarounds above.

## Frequently asked questions

### Is iDRAC9 Enterprise free?

Not by default. Basic or Express comes with the server unless Enterprise was ordered with it, and Enterprise is otherwise a paid upgrade. The only free route Dell currently lists is the 30-day trial.

### Does the iDRAC9 Enterprise license expire?

No. Dell calls it perpetual and valid for the life of the server. Only the trial expires, after 30 days.

### Can I use a license from another server or generation?

No. The license is bound to one service tag, a 16th generation license will not import on a 14th generation server, and using a file issued for another server is outside Dell's license agreement.

### Where do I download my iDRAC9 license file?

Sign in to My Account with an account linked to your service tag, open Software Licenses, select the iDRAC license and choose Download Key. You get a ZIP containing the XML license file, which you import under Configuration, Licenses. If the server shipped with the license, an export of it cannot be imported again, so use the My Account download or your purchase email.

### Is iDRAC10 Core enough, or do I need Enterprise?

Core keeps the web interface, Redfish, IPMI, RACADM, SSH, serial-over-LAN and SNMP, but not the virtual console, virtual media, directory login or email alerting. Those need Enterprise. For a server you can reach physically, Core is usually enough.

## What this means

For a single homelab server, run the 30-day trial first, then decide. If you only need alerts, power control and firmware updates, Express is enough, and serial-over-LAN plus a USB stick or PXE covers installs. If you need a console on a server you cannot reach, Enterprise is the tier to buy. Dell's price differs between its store and its guide, so compare both, and confirm License Bound after import.

## References

- [OpenManage Portfolio Software Licensing Guide, July 2026 (Dell)](https://www.delltechnologies.com/asset/en-us/products/servers/industry-market/openmanage-portfolio-software-licensing-guide.pdf)
- [iDRAC9 User's Guide, December 2020, firmware 4.40 (Dell)](https://downloads.dell.com/topicspdf/44010ug_en-us.pdf)
- [iDRAC9 User's Guide 7.xx Series, June 2024 (Dell PDF copy hosted by TechMikeNY)](https://onlineimages.techmikeny.com/CTOPDF/IDRAC9_User_Guide.pdf)
- [iDRAC10 Version 1.20.xx User's Guide, December 2025 (Dell PDF copy hosted by Senetic)](https://gfx3.senetic.com/akeneo-catalog/6/7/d/b/67db6c38029beb8d409a682d5abd9cce384f66f9_1785307_RCYKN_icecat_multimedia_other_digital_assets_6_en_GB.pdf)
- [iDRAC9 RACADM CLI Guide, 2024 (Dell PDF copy hosted by Senetic)](https://gfx3.senetic.com/akeneo-catalog/f/0/6/a/f06a644a0e48069b7654a11c4af01bdac856ff5d_1747759_CDKHV_icecat_multimedia_other_digital_assets_5_en_GB.pdf)
- [iDRAC9 Version 4.00.00.00 Release Notes (Dell)](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_release-notes1_en-us.pdf)
- [iDRAC9 Redfish API Guide, firmware 4.20.20.20 (Dell)](https://downloads.dell.com/topicspdf/idrac9-lifecycle-controller-v4x-series_api-guide_en-us.pdf)
- [Dell EMC License Manager 1.5 User's Guide (Dell)](https://downloads.dell.com/topicspdf/license-manager_users-guide6_en-us.pdf)
- [Dell iDRAC9 Support and Management Guide for PowerEdge Servers, KB 000178016](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9)
- [Trial Licenses for iDRAC, OpenManage Enterprise and DPAT, KB 000176472](https://www.dell.com/support/kbdoc/en-us/000176472/idrac-cmc-openmanage-enterprise-openmanage-integration-with-microsoft-windows-admin-center-openmanage-integration-with-servicenow-and-dpat-trial-licenses)
- [How to Retrieve an iDRAC9 Enterprise License from Dell Digital Locker, KB 000183997](https://www.dell.com/support/kbdoc/en-us/000183997/idrac9-enterprise-license-retrieval-from-dell-digital-locker)
- [How to Obtain iDRAC Licenses from My Account, KB 000130349](https://www.dell.com/support/kbdoc/en-us/000130349/how-to-obtain-idrac-enterprise-licenses-from-dell-digital-locker-ddl)
- [LIC008: The license binding ID does not match the device unique identifier, KB 000353269](https://www.dell.com/support/kbdoc/en-us/000353269/lic008-the-license-binding-id-does-not-match-the-device-unique-identifierdge-lic008-the-license-binding-id-does-not-match-the-device-unique-identifier)
- [Error Shown in iDRAC Virtual Console LIC501, KB 000189590](https://www.dell.com/support/kbdoc/en-us/000189590/dell-emc-vxrail-error-shown-in-idrac-virtual-console-lic501-a-required-license-is-missing-or-expired)
- [How to Launch the iDRAC Virtual Console, KB 000179797](https://www.dell.com/support/kbdoc/en-us/000179797/dell-poweredge-idrac-virtual-console)
- [Locate Your Server's Service Tag (Dell)](https://www.dell.com/support/contents/en-us/article/product-support/self-support-knowledgebase/locate-service-tag/server-storage)
- [Dell End User License Agreement, revised October 23, 2024](https://dell.com/learn/us/en/tda/terms-conditions/art-software-license-agreements)
- [Dell store: iDRAC License - Enterprise, part 385-BBKW](https://www.dell.com/en-us/shop/idrac-license-enterprise/apd/385-bbkw/software)
- [Dell store: iDRAC9 Enterprise 15G, part 385-BBPP](https://www.dell.com/en-us/shop/idrac-license/apd/385-bbpp/software)
- [Dell store: iDRAC9 Enterprise 16G, part 528-CTIE](https://www.dell.com/en-us/shop/idrac-license/apd/528-ctie/software)
- [Dell store: iDRAC9 Datacenter 14G upgrade, part 528-CIBH](https://www.dell.com/en-us/shop/idrac-license/apd/528-cibh/software)
- [Dell store: iDRAC9 Express, PE200-500 series, part 385-BBLB](https://www.dell.com/en-us/shop/idrac-license/apd/385-bblb/software)
- [Dell store: iDRAC10 Enterprise 17G, part 634-CSHX](https://www.dell.com/en-us/shop/idrac-license/apd/634-cshx/software)
- [Dell store: iDRAC10 Datacenter 17G, part 634-CSHZ](https://www.dell.com/en-us/shop/idrac-license/apd/634-cshz/software)
- [Dell Community: the license binding ID does not match the device unique identifier](https://www.dell.com/community/en/conversations/rack-servers/the-license-binding-id-does-not-match-the-device-unique-identifier/6733af3a7b3cd535d9749deb)
- [Dell Community: lost iDRAC Enterprise license on a used Dell R320](https://www.dell.com/community/en/conversations/poweredge-hardware-general/lost-idrac-enterprise/66a0ff898e75fa46cbe8f1aa)
- [Dell Community: Remote Console Launch Virtual Console button grayed out](https://www.dell.com/community/en/conversations/dell-openmanage-enterprise/remote-console-launch-virtual-console-button-grayed-out/647f8f65f4ccf8a8de074ced)
- [Dell iDRAC10 review (ITPro)](https://www.itpro.com/infrastructure/servers-and-storage/dell-idrac10-review-the-best-remote-server-management-solution-just-got-even-better)
- [Dell EMC iDRAC9 V4.0 Overview (StorageReview)](https://www.storagereview.com/review/dell-emc-idrac9-v4-0-overview)
- [Dell PowerEdge R760 Review (ServeTheHome)](https://www.servethehome.com/dell-poweredge-r760-review-the-mainstream-2u-dual-intel-xeon-server/3/)
- [Dell iDRAC (8 and 9) Enterprise Extended Trial License (240 days), ServeTheHome forums](https://forums.servethehome.com/index.php?threads/dell-idrac-8-9-enterprise-extended-trial-license-240-days.29653/)
- [IdracLicenseManagementOemREDFISH.py, Dell iDRAC-Redfish-Scripting (GitHub)](https://github.com/dell/iDRAC-Redfish-Scripting/blob/master/Redfish%20Python/IdracLicenseManagementOemREDFISH.py)
- [ipmitool manual page (Debian)](https://manpages.debian.org/testing/ipmitool/ipmitool.1.en.html)
