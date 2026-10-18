
## The problem

A 17th generation PowerEdge just arrived, or is about to sit in the same rack as your R640s and R740s, and its management controller says iDRAC10. You need to know what is actually different from iDRAC9: which license tier to buy, which features moved, which tools and scripts stop working, and which factory defaults will break the monitoring you already run.

## Which servers run iDRAC10 and which stay on iDRAC9

The iDRAC version is fixed by the server's hardware generation, not by firmware you pick. Dell's iDRAC10 release notes describe it as [designed for Dell PowerEdge servers from the 17th generation onwards](https://www.dell.com/support/kbdoc/en-us/000305325/idrac10-versions-and-release-notes), and the systems table names the R470, R570, R670, R770, R6715, R7715, R6725, R7725 and a set of XE platforms. The oldest iDRAC10 build in that table is 1.10.17.00, dated December 11, 2024.

iDRAC9 [spans 14th, 15th and 16th generations of PowerEdge servers](https://www.delltechnologies.com/asset/en-my/products/unified-workspace/briefs-summaries/openmanage-licensing-guide.pdf), so servers from those generations stay on iDRAC9 whatever firmware they run. If you own 14th generation gear, the support clock is already running: Dell says [feature development for iDRAC9 on 14th Generation PowerEdge servers ended on June 30, 2023](https://www.dell.com/support/kbdoc/en-us/000178016), with software maintenance for iDRAC9 continuing until February 1, 2027. For the hardware side of that timeline, see the [R740 and R640 end of life dates](/blog/poweredge-r740-end-of-life).

In daily use the jump is smaller than the version number suggests. ServeTheHome's R770 review says the server [utilizes iDRAC 10 which feels much like an extension of older generations](https://www.servethehome.com/dell-poweredge-r770-review-a-fluid-new-2u-intel-xeon-nvidia-server/3/), with inventory down to a low level of detail and an HTML5 iKVM. Dell itself says [iDRAC10 is built on top of the iDRAC9 legacy](https://www.dell.com/support/kbdoc/en-us/000348267).

## What changed in the controller hardware

The bigger break is underneath the web interface. According to [Dell's iDRAC10 support article](https://www.dell.com/support/kbdoc/en-us/000348267), iDRAC10 has four cores at 1 GHz in a 64-bit architecture, memory doubled to 2GB of DDR4, and it is based on Nuvoton Arbel silicon that is FIPS 140-3 certified. Nuvoton describes the Arbel NPCM8mnx family as its [fourth-generation BMC with a quad A35 CPU running at 1 GHz](https://www.nuvoton.com/products/cloud-computing/ibmc/), plus a dedicated security processor enclave that serves both the BMC and the platform.

Two design choices stand out:

- **The firmware base is OpenBMC.** Dell states the software is built on OpenBMC with proprietary Dell intellectual property on top.
- **The BMC lives on a module.** Dell says its DC-SCM includes the iDRAC10, BIOS and compute FPGA logic, and that PowerEdge servers follow Open Compute Project recommendations for modular hardware. The DC-SCM specification [aims to move common server management, security and control features from a typical motherboard into a module](https://opensource.googleblog.com/2022/05/DC-SCM-compatible-FPGA-based-open-source-BMC-hardware-platform.html).

Dell also lists SHA-384 and SHA-512 authentication, a hardware-based Root-of-Trust, a new integrated security enclave, rebootless updates for the iDRAC itself, NVMe SSDs and the PE backplane, and telemetry with 24 distinct component mappings including CPUs, memory, drives, GPUs and DPUs. The web interface changed too: beginning with version 1.20.60.50, which the release notes date to September 1, 2025, iDRAC10 has a new modular user interface. Screenshots and runbooks written for iDRAC9 menus need updating.

## Licensing: three tiers replace four

iDRAC9 had four tiers: Basic, Express, Enterprise and Datacenter. Basic was standard on 100 to 500 series rack and tower servers, and Express was standard on 600 series and up. iDRAC10 collapses that to Core, Enterprise and Datacenter, and Core is free on every 17th generation server. Dell's [July 2026 OpenManage licensing guide](https://www.delltechnologies.com/asset/en-my/products/unified-workspace/briefs-summaries/openmanage-licensing-guide.pdf) gives these prices:

| License | iDRAC9 on 16th gen | iDRAC10 on 17th gen |
|---|---|---|
| Free tier | Basic (100 to 500 series) or Express (600 series and up) | Core (all servers) |
| Enterprise at point of sale | $831 | $1,394 (bundle) |
| Datacenter at point of sale | $1,171 | $1,785 (bundle) |
| Enterprise added later | $1,039 | $1,433 |
| Datacenter added later | $1,464 | $1,911 |
| SEKM and SCV | Sold separately ($249 and $99) | Included with Enterprise and Datacenter at point of sale |

The iDRAC10 bundles include Secure Enterprise Key Manager and Secured Component Verification, so the fair comparison adds those to the iDRAC9 price: $831 plus $249 plus $99 is $1,179 for a 16th generation Enterprise setup with both, still less than the $1,394 iDRAC10 Enterprise bundle. If you never use external key management or supply chain verification, the bundle is simply a price increase. Datacenter is the default tier on PowerEdge XE platforms.

Features also moved between tiers:

- **Virtual Console and Virtual Media still need Enterprise.** The [iDRAC10 licensed features table](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/licensed-features-in-idrac10?guid=guid-44303818-e0ed-4b62-8482-cb8fce18b7b3&lang=en-us) marks both, along with directory services, power capping and remote [syslog](/blog/syslog-centralized-logging), as unavailable on Core. That matches iDRAC9, where the licensing guide places all of these in the Enterprise column (see [what the iDRAC9 Enterprise license includes](/blog/idrac-9-enterprise-license)).
- **Some Datacenter features moved down.** The iDRAC9 licensing table puts serial data log, SMART logs for storage drives and BIOS Live Scanning in the Datacenter column. The 1.30 user guide marks serial data logs and SMART logs as available on Enterprise and Datacenter, and BIOS Live Scanning on every tier.
- **Thermal customization stayed in Datacenter.** PCIe airflow customization (LFM), Custom Exhaust Control, Custom Delta-T control, System Airflow Consumption and Custom PCIe inlet temperature are Datacenter only in the 1.30 user guide, the same column iDRAC9 used. iDRAC10 also lists Advanced Thermal Management under Enterprise. Owners tuning fans with the [iDRAC9 thermal settings](/blog/idrac-fan-speed-offset) should expect PCIe airflow customization to need the top tier on iDRAC10 as well.
- **Datacenter keeps the accelerator and telemetry features.** The licensing guide lists Telemetry, Advanced Power Management, Device-Level Lockdown Mode, Discrete GPU Sensor Monitoring, DLC Monitoring and Leak Detection, and GPU Telemetry as Datacenter only.

Dell's licensing guide shows Idle Server Detection in Enterprise and Datacenter, while the 1.30 user guide table marks it unavailable in all three tiers and [OpenManage Enterprise 4.6](https://www.dell.com/support/kbdoc/000364705/openmanage-enterprise-4-6-support-matrix?lang=en) lists it as unsupported for 17th generation power management, so do not buy a tier for that feature alone.

Licenses do not travel between generations. The licensing guide says iDRAC 10 and iDRAC 9 licenses cannot be installed or transferred to a different generation server, and Dell's [license types page](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/types-of-licenses?guid=guid-cb1dabb2-95b3-4002-adbb-c60bb1c38367&lang=en-us) says a perpetual license is bound to the Service Tag. Dell offers [30-day Enterprise and Datacenter trials for 17th generation servers](https://www.dell.com/support/kbdoc/en-us/000176472), and a trial can be imported only once per product.

## What Dell removed in iDRAC10

The 1.30 user guide has a [deprecated features table](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/deprecated-features?guid=guid-b824d720-af93-457f-bea1-1faacdf6d376&lang=en-us) where every entry is marked Removed, which Dell defines as code removed and no longer functional:

| Removed in iDRAC10 | What it means for you |
|---|---|
| WSMan | Any tool or script still speaking WS-Management stops working. Move it to Redfish or RACADM. |
| Group Manager | iDRAC9 Enterprise listed Group Manager with 250 node support. It is gone on iDRAC10, so plan fleet management around a console such as OpenManage Enterprise. |
| TLS 1.1 | The code is removed, and the web server default is TLS 1.3 and higher. |
| vFlash | Anything that relied on vFlash stops working. |
| Local Key Management (LKM) | Dell says LKM is replaced by iLKM, so key management built on LKM needs rework. |
| AD Extended Schema | Active Directory authentication that relies on the extended schema stops working. Directory services (AD, LDAP) remain in the licensed features table for Enterprise and Datacenter. |
| Software [RAID](/blog/raid-levels-comparison), Memory NVDIMM | Removed from the iDRAC10 code. |
| Two-factor authentication (simple, email) | Removed. The licensed features table still lists Easy Multi Factor Authentication, RSA SecurID 2FA and one-time password MFA. |
| SerialLog and CPURegisters metric reports | Those two telemetry reports no longer exist. |

WSMan is the removal that matters most for existing automation. On iDRAC9 it sat next to the other management interfaces: Dell's licensing guide lists [WS-MAN alongside Redfish, IPMI 2.0, RACADM and SSH](https://www.delltechnologies.com/asset/en-my/products/unified-workspace/briefs-summaries/openmanage-licensing-guide.pdf) in the Basic column. Other software had already moved on: the OpenStack Ironic docs say [the -wsman driver interfaces have been deprecated](https://docs.openstack.org/ironic/2024.1/admin/drivers/idrac.html) and name the redfish interfaces as the forward path.

## Interfaces that carry over and defaults that changed

Most access paths survive. The iDRAC10 user guide lists the [web interface, RACADM (local, remote and firmware), the RESTful API with Redfish, SSH and IPMITool](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/interfaces-and-protocols-to-access-idrac?guid=guid-f053e3a8-cc8e-4e81-9aee-c3da006256ea&lang=en-us), plus direct access through a labeled Type-C USB port. The licensed features table shows IPMI 2.0, Redfish and Quick Sync 2 on every tier, Core included. SMB 2.0 to 3.11 is supported for file shares, and SMBv1 is not.

<figure>
<img src="/images/blog/idrac-10-vs-idrac-9/photo-1.jpg" alt="Members of the hackers.mu group working on TLS 1.3 support during the IETF 100 Hackathon" width="1400" height="1050" loading="lazy" decoding="async">
<figcaption>Members of the Mauritian group hackers.mu adapting applications to TLS 1.3 during the IETF 100 Hackathon in November 2017. iDRAC10's web server defaults to TLS 1.3 and higher, so clients that only speak TLS 1.2 fail the handshake. Photo: Wedgeantilles0, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Hackers.mu_working_on_TLS_1.3_during_the_IETF_100_Hackathon.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The factory defaults are where iDRAC10 behaves differently. Comparing the security configuration guides for [iDRAC9 version 7.x](https://www.dell.com/support/manuals/en-us/idrac9-lifecycle-controller-v7.x-series/idrac9_scg_tta/default-configuration-values?guid=guid-bfcb8585-5927-4945-b35a-aaf04e597e3c&lang=en-us) and [iDRAC10 version 1.30](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_scg/default-configuration-values?guid=guid-76d1e8c0-0949-4304-b03e-8d66102174c3&lang=en-us):

| Setting | iDRAC9 7.x default | iDRAC10 1.30 default |
|---|---|---|
| Web server TLS protocol | TLS 1.2 only | TLS 1.3 and higher |
| SNMP agent | Enabled | Disabled |
| IPMI over LAN | Disabled | Disabled |
| VNC server | Disabled | Disabled |
| Serial over LAN | Enabled | Enabled |
| NTP | Disabled | Disabled |

The two that matter are TLS and SNMP. A monitoring box polling iDRAC9 over SNMP gets nothing from a fresh iDRAC10 until you turn the agent on, and any client stuck on TLS 1.2 fails the handshake. You can check the settings from an SSH session into the iDRAC, where firmware RACADM runs, using the same `racadm get` syntax Dell documents for [TLS settings](https://dell.com/support/kbdoc/en-us/000208968/idrac-cve-vulnerabilities-cve-2000-0146-cve-2002-0748-cve-1999-0517-securing-virtual-console-with-tls-1-2):

```
racadm get iDRAC.Webserver.TLSProtocol
racadm get iDRAC.SNMP.AgentEnable
racadm get iDRAC.IPMILan.Enable
```

On a factory-default iDRAC10, the security guide's defaults are TLS 1.3 and higher for the first attribute and disabled for the other two. To enable the SNMP agent, set the attribute to 1, the value the iDRAC9 guide lists as Enabled for the same attribute:

```
racadm set iDRAC.SNMP.AgentEnable 1
```

The login story matches iDRAC9, which also shipped with a random default password: the [unique default password](https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/secure-default-password?guid=guid-e9e027d4-d884-4e62-8fcf-265a548c0dcf&lang=en-us) is printed on the system information tag, unless calvin was chosen when the server was ordered. The [iDRAC default password reset steps](/blog/idrac-default-password) cover both iDRAC9 and iDRAC10.

## Which management tools already support iDRAC10

- **Dell's Redfish scripts.** The [iDRAC-Redfish-Scripting repository](https://github.com/dell/iDRAC-Redfish-Scripting) lists 12G through 17G servers and a minimum of iDRAC10 firmware 1.10.17.00.
- **Ansible.** The dellemc.openmanage collection [changelog](https://raw.githubusercontent.com/dell/dellemc-openmanage-ansible-modules/collections/CHANGELOG.rst) shows its first iDRAC10 enhancement in release 9.8.0, with known gaps such as PatrolReadRatePercent, which cannot be set on iDRAC10.
- **OpenManage Enterprise.** The 4.6 support matrix lists 17th generation servers with iDRAC firmware 1.20.50.50 and later, and says license-based features need that version too.

## What breaks

**OpenManage Enterprise 3.10 may fail to discover 17th generation servers.**
One owner reported on the [Dell Community forum](https://www.dell.com/community/en/conversations/dell-openmanage-enterprise/http-status-404-operation-failed-eemi-code-cgen1013/69e8a63a5256992330b62206) that OME 3.10.2 failed to discover 20 new R770s with an HTTP 404 and EEMI code CGEN1013, and a reply in the thread said OME 3.10 does not support iDRAC10. The poster reported that moving to OME 4.6 fixed it. Fix: upgrade to OME 4.6 and run iDRAC10 firmware 1.20.50.50 or later, the minimum in Dell's 4.6 support matrix.

<figure>
<img src="/images/blog/idrac-10-vs-idrac-9/photo-2.jpg" alt="Jenkins web page showing the text output of an Ansible playbook run" width="1400" height="887" loading="lazy" decoding="async">
<figcaption>Output of an Ansible playbook run displayed in Jenkins, in a 2016 screenshot. Dell's dellemc.openmanage Ansible collection added its first iDRAC10 enhancement in release 9.8.0. Photo: Claudia Meindl, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Ansible-playbook-output-jenkins.png">Wikimedia Commons</a>.</figcaption>
</figure>

**WS-Man scripts and older provisioning drivers fail.**
WSMan is removed outright, not deprecated, and Ironic's -wsman interfaces are deprecated upstream. Fix: rewrite calls against Redfish, use Dell's Redfish scripts or the Ansible collection, and switch Ironic nodes to the redfish interfaces.

**Older clients cannot open the web UI or API.**
The web server defaults to TLS 1.3 and higher, and TLS 1.1 code is gone. Fix: update the client library or OS, and confirm the setting with `racadm get iDRAC.Webserver.TLSProtocol` before blaming the network.

**SNMP polling returns nothing.**
The SNMP agent ships disabled on iDRAC10, unlike iDRAC9 7.x. Fix: `racadm set iDRAC.SNMP.AgentEnable 1`, or move monitoring to Redfish.

**An iDRAC9 license file will not import.**
Licenses are tied to one generation, and Dell says importing a license purchased for a different generation fails. Fix: buy a 17th generation license, or import the 30-day trial once to evaluate.

## What this means

Treat iDRAC10 as iDRAC9 on new hardware with a cleanup pass. RACADM, Redfish, IPMI and the web UI are all still there, but WSMan, Group Manager and vFlash are gone, TLS 1.3 and a disabled SNMP agent are the new defaults, and the free tier is now Core. Before a 17th generation server joins a mixed rack, upgrade OpenManage Enterprise to 4.6, move any WS-Man scripts to Redfish, pick the tier by the feature you need, Virtual Console (Enterprise) or GPU telemetry (Datacenter), and budget for higher license prices that cannot be reused from your 16th generation fleet.

## References

- https://www.dell.com/support/kbdoc/en-us/000348267
- https://www.dell.com/support/kbdoc/en-us/000305325/idrac10-versions-and-release-notes
- https://www.delltechnologies.com/asset/en-my/products/unified-workspace/briefs-summaries/openmanage-licensing-guide.pdf
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/deprecated-features?guid=guid-b824d720-af93-457f-bea1-1faacdf6d376&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/licensed-features-in-idrac10?guid=guid-44303818-e0ed-4b62-8482-cb8fce18b7b3&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/interfaces-and-protocols-to-access-idrac?guid=guid-f053e3a8-cc8e-4e81-9aee-c3da006256ea&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/types-of-licenses?guid=guid-cb1dabb2-95b3-4002-adbb-c60bb1c38367&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_ug/secure-default-password?guid=guid-e9e027d4-d884-4e62-8fcf-265a548c0dcf&lang=en-us
- https://www.dell.com/support/manuals/en-us/poweredge-r6715/idrac10_1.30.xx_scg/default-configuration-values?guid=guid-76d1e8c0-0949-4304-b03e-8d66102174c3&lang=en-us
- https://www.dell.com/support/manuals/en-us/idrac9-lifecycle-controller-v7.x-series/idrac9_scg_tta/default-configuration-values?guid=guid-bfcb8585-5927-4945-b35a-aaf04e597e3c&lang=en-us
- https://www.dell.com/support/kbdoc/en-us/000178016
- https://www.dell.com/support/kbdoc/en-us/000176472
- https://www.dell.com/support/kbdoc/000364705/openmanage-enterprise-4-6-support-matrix?lang=en
- https://dell.com/support/kbdoc/en-us/000208968/idrac-cve-vulnerabilities-cve-2000-0146-cve-2002-0748-cve-1999-0517-securing-virtual-console-with-tls-1-2
- https://www.servethehome.com/dell-poweredge-r770-review-a-fluid-new-2u-intel-xeon-nvidia-server/3/
- https://www.nuvoton.com/products/cloud-computing/ibmc/
- https://opensource.googleblog.com/2022/05/DC-SCM-compatible-FPGA-based-open-source-BMC-hardware-platform.html
- https://docs.openstack.org/ironic/2024.1/admin/drivers/idrac.html
- https://github.com/dell/iDRAC-Redfish-Scripting
- https://raw.githubusercontent.com/dell/dellemc-openmanage-ansible-modules/collections/CHANGELOG.rst
- https://www.dell.com/community/en/conversations/dell-openmanage-enterprise/http-status-404-operation-failed-eemi-code-cgen1013/69e8a63a5256992330b62206
