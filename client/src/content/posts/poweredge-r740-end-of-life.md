
## The short answer

Dell has not published an end-of-life or end-of-service-life date for the standalone PowerEdge R740 or R640, so any single date you see online is a reseller's estimate. Dell has published dates for appliances built on the same hardware (end of standard support August 31, 2028 for PowerFlex R640 and R740xd nodes) and one hard cutoff for 14th-generation servers: iDRAC9 software maintenance ends February 1, 2027. Your own service tag's expiry governs parts and phone support. The servers keep running past every date; BIOS 2.28.1 arrived in August 2026, and Windows Server 2022 and ESXi 8.0 are the newest Windows and VMware versions Dell lists for them.

## What does end of life mean for a PowerEdge server?

Six different dates get called end of life, and each ends something different.

<figure>
<img src="/images/blog/poweredge-r740-end-of-life/server-racks.jpg" alt="Rows of rack-mounted 1U servers with blue status lights in a data center" width="1200" height="800" loading="lazy" decoding="async">
<figcaption>Racks of 1U servers in a Wikimedia Foundation data center. An end-of-support date changes what Dell will fix, not whether machines like these keep running. Photo: Victor Grigas, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Wikimedia_Foundation_Servers-8055_35.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Date | What it ends | Set by |
|---|---|---|
| End of sale (Dell: EOL) | Ordering new units | Dell |
| Warranty | Included hardware repair; [3 years standard](https://www.delltechnologies.com/asset/en-us/products/multi-product/legal-pricing/h4276-emc-prod-warranty-maint-table.pdf) for R-series 400s and up | Dell, per service tag |
| End of standard support (EOSS) | Basic and ProSupport coverage | Dell |
| End of service life (EOSL) | General support | Dell, per service tag |
| End of software maintenance | New iDRAC security fixes | Dell |
| Third-party maintenance | Break-fix after Dell stops; one vendor claims 7 to 10 years after EOL | The maintenance firm |

The first four are Dell's hardware lifecycle dates. Dell's [end-of-life spreadsheet](https://supportkb.dell.com/attachment/ka0Do0000003IXsIAM/Dell-Hardware-Release-and-End-of-Service-Life-Notifications_pkb_en_US_1.xlsx) for converged infrastructure and storage does not cover standalone servers, but its wording is Dell's. End of standard support is the date after which "Standard support (Basic, ProSupport, ProSupport MC, ProSupport Plus) is no longer available," and at end of service life Dell "may continue to offer limited support and/or maintenance only on a time and materials basis." Security fixes follow a separate clock: Dell's [ProSupport service description](https://i.dell.com/sites/csdocuments/Legal_Docs/en/us/dell-prosupport-for-infrastructure-sd-en.pdf) says it "does not guarantee the availability of security updates."

## What has Dell published for the R740 and R640?

Dell says no per-model schedule exists. A Dell moderator wrote on July 17, 2026 that Dell ["does not provide a publicly documented End of Life (EOL) or End of Support Life (EOSL) schedule for PowerEdge servers"](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r740/6a572d2f50a08a1eb3bea760). Dell's firmware plan already outruns the five to seven years staff cite: the R740 and R640 [shipped in July 2017](https://datacenternews.asia/story/generation-14-dell-emc-announces-availability-latest-server), and iDRAC9 maintenance runs to February 2027.

The spreadsheet, dated October 2, 2026, has no row for a standalone R640, R740, R630 or R730, but it lists appliances sold on the same hardware:

| Dell product | End of life | End of standard support |
|---|---|---|
| PowerFlex Appliance R640 | August 7, 2023 | August 31, 2028 |
| PowerFlex Appliance R740XD | August 7, 2023 | August 31, 2028 |
| Azure Stack Hub 14G R640 | November 17, 2023 | November 30, 2028 |
| Azure Stack Hub 14G R740XD | November 17, 2023 | November 30, 2028 |

Dell's [PowerFlex notice](https://www.dell.com/support/kbdoc/en-us/000305299/powerflex-hardware-and-software-end-of-service-dates) defines end of standard support as "five (5) years after the End of Sale," and these dates fit that rule. Two Dell hints also point away from an early end of sale. The [December 2025 Windows Server matrix](https://dl.dell.com/content/manual83982175-dell-poweredge-microsoft-windows-server-os-support.pdf?language=en-us) stars nearly every 14G model as discontinued but not the R640, R740 or R940, and a Dell moderator said on June 22, 2023 the R740 was ["still available but in Limited Quantities"](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r740-not-discontinue/64a3fbbef4ccf8a8dea4d246).

To get the date for your own server:

1. Read the Service Tag from the front pull-out tab, or run a command below.
2. Enter it on Dell's support site and open Service Events.
3. Turn off "Only show active events" to see the End of Service Life date, [per Dell moderators](https://www.dell.com/community/en/conversations/rack-servers/poweredge-servers-end-of-life-and-end-of-support-life/64e67ef5c362560b91c0043e).

```
# On the server, from a Linux shell
sudo dmidecode -s system-serial-number

# Over SSH to the iDRAC
racadm getsvctag
```

Both commands come from [Dell's service tag guide](https://www.dell.com/support/contents/en-us/article/product-support/self-support-knowledgebase/locate-service-tag/server-storage).

## Why do other sites show different dates?

None of them cites a Dell notice for the standalone servers, and they contradict each other.

| Source | R640 | R740 | Basis |
|---|---|---|---|
| Dell, appliance variants | EOSS August 31, 2028 (PowerFlex) or November 30, 2028 (Azure Stack Hub) | Same, for the R740XD | Dell tables |
| [hardwarewartung](https://www.hardwarewartung.com/en/dell-poweredge-eol-eosl-2/) (maintenance vendor) | EOL January 20, 2023; EOSL March 31, 2027 | EOL Q4 2023; EOSL August 31, 2028 | None cited |
| [icd3s](https://icd3s.com/end-of-life/dell/poweredge-r740/) (reseller) | End of sale October 31, 2023; EOSL December 31, 2028 | Same | Links a Dell KB that returns 404 |

Two of these cannot both be right. hardwarewartung ends R640 support 17 months before the R740, while Dell gives its R640 and R740XD nodes identical dates, and December 31, 2028 falls after every Dell appliance date. hardwarewartung itself says that for standalone servers [Dell publishes no fixed EOL or EOSL dates](https://www.hardwarewartung.com/en/dell-poweredge-r740-r740xd-eol-and-eosl/).

Trust them in this order: your service tag's record, then Dell's appliance dates (real, but for a different product), then reseller tables, which are estimates from firms that sell extended coverage.

## What about the R630 and R730?

They preview the end. Dell's last 13th-generation BIOS is [2.19.0, released March 18, 2024](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=km6p8), and its last iDRAC8 build is [2.86.86.86, released April 3, 2024](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=vwf72).

| | R630 and R730 (13G) | R640 and R740 (14G) |
|---|---|---|
| Launch | [2014](https://www.dell.com/community/en/conversations/rack-servers/eol-and-eos-r630/647f9f57f4ccf8a8de4226fa) | July 2017 |
| Management controller | iDRAC8; maintenance ended February 2024 | iDRAC9; maintenance ends February 1, 2027 |
| Newest Windows Server on Dell's OS page | 2019 | 2022 |
| Newest ESXi on Dell's OS page | 7.0 | 8.0 |

Dell's [iDRAC8 notice](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8) says it "reaches the End of Software Maintenance as of February 2024," which matches hardwarewartung's 13G end of support. Both generations reach their last firmware roughly nine to ten years after launch, so if 14G follows, expect its last BIOS within months of February 2027.

## What keeps working after each date?

Downloads, hardware and Dell-listed operating systems keep working; new fixes and Dell parts logistics are what stop. The dates that matter, in order:

| Date | What happens | Source |
|---|---|---|
| October 31, 2023 | End of sale, as quoted by one reseller | No Dell source |
| December 31, 2023 | Intel ends baseline updates for Skylake-SP | [Intel](https://www.intel.com/content/www/us/en/support/topics/support-and-servicing-for-processors.html) |
| June 30, 2025 | Intel ends baseline updates for Cascade Lake | Intel |
| October 2026 | Windows Server 2022 leaves mainstream support | [Microsoft](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2022) |
| January 2027 | Windows Server 2016 extended support ends | [Microsoft](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2016) |
| February 1, 2027 | iDRAC9 software maintenance ends for 14G | Dell |
| September 30, 2027 | OpenManage Server Administrator sustenance ends | [Dell](https://www.dell.com/support/kbdoc/en-us/000224826/omsa-eol-landing-page) |
| October 11, 2027 | ESXi 8 general support ends | Third party |
| August 31 and November 30, 2028 | End of standard support, Dell's R640 and R740XD appliances | Dell |
| December 31, 2028 | EOSL, as quoted by one reseller | No Dell source |
| October 11, 2029 | ESXi 8 technical guidance ends | Broadcom |
| October 2031 | Windows Server 2022 extended support ends | Microsoft |

### Firmware, BIOS and iDRAC

Dell's [iDRAC9 notice](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9) says 14G feature development ended June 30, 2023 and "Software maintenance for iDRAC9 will continue until February 01, 2027." Since July 2023 Dell has shipped nine releases, each labeled "Discretionary Sev1 security fix," the newest 7.00.00.185 in August 2026.

The fixes matter. [DSA-2026-355](https://www.dell.com/support/kbdoc/en-us/000505000/dsa-2026-355-security-update-for-dell-poweredge-server-for-intel-2026-security-advisories-2026-3-ipu) (September 1, 2026, High) lists the R640 and R740 as affected below BIOS 2.28.1. [DSA-2026-392](https://www.dell.com/support/kbdoc/en-us/000504998/dsa-2026-392-security-update-for-dell-idrac9-and-idrac10-vulnerability) (September 3, CVSS 7.2) covers iDRAC9 below 7.00.00.184, and [DSA-2026-415](https://www.dell.com/support/kbdoc/en-us/000509006/dsa-2026-415-security-update-for-dell-idrac9-and-idrac10-vulnerability) (September 14) sets 7.00.00.185. Dell's [published minimums](https://www.dell.com/support/kbdoc/en-us/000227230/minimum-recommended-and-latest-code-versions-for-dell-technologies-poweredge), BIOS 2.25.0 and iDRAC 7.00.00.173, sit below all three.

After February 1, 2027 the downloads stay: "Released iDRAC firmware updates are available regardless of support contract." BIOS has no published end date, and [BIOS 2.28.1](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=188CW) still carries Intel's 2026.3 platform update although Intel's baseline servicing for these CPUs ended in 2023 and 2025, so the BIOS end is Dell's call. A contract does not change this: Dell's [Post Standard Support terms](https://i.dell.com/sites/csdocuments/Legal_Docs/en/us/post-standard-support-en.pdf) say "Hot fixes including security patches are not available."

### Windows Server

Windows Server 2022 is the newest version Dell lists for the R740 and R640. Dell's supported-OS pages for the [R740](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r740) and [R640](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r640) stop at 2022 LTSC, and its matrix marks both models "Qualified" for 2022, 2019 and 2016 with no 2025 column for 14G.

Dell's documents disagree on 2025. The notes for [BIOS 2.22.2](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=f8gph) (October 1, 2024) say "Support for Microsoft Windows Server 2025 Operating System for R740 and R640," but a Dell engineer [wrote on December 26, 2025](https://www.dell.com/community/en/conversations/poweredge-hardware-general/windows-server-2025-compatibility-and-official-driver-support-for-poweredge-r740/694e8377de43d31695a522b0) that "The Poweredge R740 does not support Server 2025, nor do I see it being added." Trust the matrix and the engineer, because a release-note line is not a qualification. Treat 2025 as "may install, no Dell support."

### VMware ESXi

ESXi 8.0 is the last version Dell certifies on these servers, and ESXi 9 works only in a deprecated, confirm-with-the-vendor state. Dell's [vSphere 8.0 list](https://www.dell.com/support/kbdoc/en-us/000217592/dell-poweredge-servers-certified-for-vmware-vsphere-8-0) includes the R640 and R740 but not the R630 or R730. Broadcom lists [end of technical guidance for ESXi 8.0 as October 11, 2029](https://ftpdocs.broadcom.com/cadocs/0/contentimages/Product_EOTG_Dates.pdf), and [Rimini Street](https://www.riministreet.com/blog/vmware-vsphere-8-end-of-support-5-smart-moves-it-leaders-are-making/), a third-party support vendor, puts general support's end at October 11, 2027.

Dell's [ESXi 9.x matrix](https://dl.dell.com/content/manual23955509-vmware-vsphere-esxi-9-x-on-dell-poweredge-systems-compatibility-matrix.pdf?language=en-us) (May 2026, Rev. A03) starts at the R750 and R650. Broadcom's [CPU notice](https://knowledge.broadcom.com/external/article/428874) (updated September 18, 2026) says Cascade Lake is "operating in Deprecated Mode for VCF 9, and is still supported," while Skylake-SP, "previously Discontinued in VCF 9.0," is now "supported in Deprecated Mode for VCF 9.x" through an override install path. Hardware, BIOS and firmware support "is the responsibility of the OEM system / server providers."

So ESXi 9 is a bridge, not a destination, and a Cascade Lake host (the "2nd Generation" Xeon Scalable in Dell's [R740 spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/poweredge-r740-spec-sheet.pdf)) is the cleaner candidate. An April 2026 owner post said the R640 "is not supported on vmware 9," before Broadcom's September change.

### Proxmox VE and Linux

Proxmox VE runs on both models, and nobody certifies it, so the evidence is owner reports. In an [R640 compatibility thread](https://forum.proxmox.com/threads/dell-poweredge-r640-compatibility.182931/), one poster wrote in April 2026 that "there is no official Proxmox PVE+Dell HCL," and another reported "Our R640/R740xd systems running 9.1 have had no issues at all," using H740p [RAID](/blog/raid-levels-comparison) controllers with XFS. Proxmox's [requirements page](https://pve.proxmox.com/wiki/System_Requirements) says "Neither ZFS nor Ceph are compatible with a hardware RAID controller."

[Proxmox VE 9.2](https://pve.proxmox.com/wiki/Roadmap) shipped May 21, 2026 with kernel 7.0. Releases are supported ["at least as long as the corresponding Debian version"](https://pve.proxmox.com/wiki/FAQ). Proxmox's [Backup Server roadmap](https://pbs.proxmox.com/wiki/Roadmap) lists kernel 6.17 boot failures on certain Dell servers, helped by enabling SR-IOV Global and I/OAT DMA, and one R640 owner wrote in August 2026 that the 9.2 installer found no disks (unanswered). Dell's own [Red Hat matrix](https://linux.dell.com/files/supportmatrix/RHEL_Support_Matrix.pdf) stops at RHEL 9.5 for these models, and its [Ubuntu matrix](https://linux.dell.com/files/supportmatrix/Ubuntu_LTS_Support_Matrix.pdf) lists 22.04 LTS but not 24.04 or 26.04.

## What does this mean for a homelab or small business in 2026?

A homelab can keep an R740 or R640 for years if the iDRAC stays unreachable from untrusted networks. A small business should treat February 1, 2027 and its service tag expiry as the real deadlines.

<figure>
<img src="/images/blog/poweredge-r740-end-of-life/eqiad-cluster.jpg" alt="A tall open rack filled from top to bottom with servers" width="1200" height="1792" loading="lazy" decoding="async">
<figcaption>A full rack in Wikimedia's EQIAD data center in Ashburn, Virginia. Photo: RobH, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Eqiadwmf_9038.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

For a homelab, update to BIOS 2.28.1 and iDRAC9 7.00.00.185, put the iDRAC on a management VLAN with no internet route (the [iDRAC tips](/blog/dell-idrac-tips-tricks) article covers settings), and run ESXi 8.0 or Proxmox VE 9 ([Proxmox vs ESXi](/blog/proxmox-vs-esxi) compares them). The [R740 deep dive](/blog/dell-poweredge-r740-deep-dive) covers the hardware. [The Register reported](https://www.theregister.com/2025/04/14/vmware_free_esxi_returns/) in April 2025 that Broadcom brought back a free vSphere Hypervisor 8 download.

For a small business, stay current on BIOS and iDRAC while a contract is live, because Dell's ProSupport terms exclude services needed after a customer skips an advised fix. Afterward you have three paths: Dell's Post Standard Support (at Dell's "sole discretion," no security patches), third-party maintenance (one vendor says it ["does not supply Dell or any other OEM software"](https://www.servnetuk.com/server-end-of-life/dell-poweredge-14g-r740-r640)), or replacement.

## What should you buy next?

Buy by the software you need: a used R740 still fits Windows Server 2022, ESXi 8 and Proxmox, while Dell-listed Windows Server 2025 or ESXi 9 starts at the 15th generation.

| Generation | Processors | Memory and PCIe | Windows Server 2025 | ESXi 9 |
|---|---|---|---|---|
| 14G ([R740](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/poweredge-r740-spec-sheet.pdf)) | 2nd Gen Xeon Scalable, up to 28 cores | 24 DDR4 slots, 2933 MT/s, PCIe Gen 3 | Not listed | Not listed |
| 15G ([R750](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/dell-emc-poweredge-r750-spec-sheet.pdf)) | 3rd Gen, up to 40 cores | 32 DDR4 slots, 3200 MT/s, PCIe Gen 4 | Qualified | Listed |
| 16G ([R760](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760-spec-sheet.pdf)) | 4th or 5th Gen, up to 56 or 64 cores | 32 DDR5 slots, 4800 or 5600 MT/s | Qualified | Listed |
| 17G ([R770](https://www.delltechnologies.com/asset/en-my/products/servers/technical-support/poweredge-r770-spec-sheet.pdf)) | Xeon 6, up to 144 E-cores | 32 DDR5 slots, 6400 MT/s | Qualified | Listed |

A used R750 or R650 is the oldest generation Dell lists for both Windows Server 2025 and ESXi 9. Skip the 13th generation now: its last firmware shipped in spring 2024, and Dell lists neither Windows Server 2022 nor ESXi 8 for it. Check the service tag of any used unit before paying, as in [How I Evaluate Used Enterprise Gear](/blog/buying-used-enterprise-gear).

## Pre-end-of-support checklist

Work through these in order, ideally before February 1, 2027.

1. Look up the service tag and screenshot the End of Service Life date with "Only show active events" turned off.
2. Update BIOS to 2.28.1 and iDRAC9 to 7.00.00.185 or newer.
3. Export the iDRAC configuration first, using Dell's [export and import KB](https://www.dell.com/support/kbdoc/en-us/000114972/export-and-import-idrac-configuration-information).
4. Download and archive the final BIOS, iDRAC, RAID controller, network card and drive firmware, which [Dell offers free](https://www.dell.com/support/kbdoc/en-us/000128194).
5. Isolate the iDRAC on a management network with no inbound internet path.
6. Decide the support path before the contract lapses: renew ProSupport, ask about Post Standard Support, sign third-party maintenance, or replace.
7. Stock spares for what fails first: power supplies, fans, memory and drives.
8. Pick the OS path, test one host, and set a replacement date.

## What breaks

**Windows Server 2025 on a 14G server gets you no Dell support.** Dell's OS pages and matrix list 2022 as newest, and a Dell engineer said 14G will not be added despite the BIOS 2.22.2 note. Fix: run Windows Server 2022, or get Dell's answer in writing for your service tag first.

**The ESXi 9 installer may refuse a Skylake-SP host.** Broadcom discontinued Skylake-SP in 9.0 and now supports it only through an override procedure, and Dell's matrix lists no 14G server. Fix: stay on ESXi 8.0, or use Cascade Lake processors and confirm hardware support with Dell.

**New iDRAC security fixes stop after February 1, 2027.** Dell defines the end of software maintenance as the last date for "any software maintenance releases, security updates, or issue fixes." Fix: install 7.00.00.185 or newer first, keep the iDRAC off reachable networks, and retire any host that must pass a firmware audit.

**A 13th-generation host reboots in a loop when you install Proxmox VE 9.1.** Kernel 6.17 fails on some Dell servers, and one R730xd owner got a Dell error on the next boot. Fix: enable SR-IOV Global and I/OAT DMA in the BIOS, or boot kernel 6.14.

## Frequently asked questions

### Is the PowerEdge R740 end of life?

Dell has not announced an end of life for the standalone R740. Its December 2025 matrix does not star it as discontinued, resellers quote late 2023 for end of sale, and its firmware was still being updated in August 2026.

### When does the R640 reach end of service life?

No Dell source gives a date for the standalone R640. Dell's PowerFlex R640 node reaches end of standard support on August 31, 2028 and its Azure Stack Hub R640 on November 30, 2028. Resellers say March 31, 2027 or December 31, 2028, so use the service tag lookup.

### Will Dell still update R740 firmware in 2027?

iDRAC9 fixes are scheduled to end on February 1, 2027, and Dell has announced no end date for BIOS updates. The 13th generation received its last BIOS in March 2024, weeks after iDRAC8 maintenance ended, so expect the last 14G BIOS near February 2027.

### Can an R740 run Windows Server 2025 or ESXi 9?

Dell lists neither for 14th generation, and its documents disagree on Windows Server 2025. Broadcom still supports Cascade Lake, and Skylake-SP through an override, in ESXi 9.x deprecated mode. Choose Windows Server 2022 or ESXi 8.0 if you need Dell-listed support.

## What this means

Treat the R740 and R640 as safe to run until your service tag's support expires, and as a managed risk after February 1, 2027. Update BIOS and iDRAC now, lock down the management network, pick Windows Server 2022, ESXi 8.0 or Proxmox VE 9, and set a replacement date no later than the second half of 2028. Buy an R750 or newer if you need Dell-listed Windows Server 2025 or ESXi 9.

## References

- [Dell Technologies: 3 years standard](https://www.delltechnologies.com/asset/en-us/products/multi-product/legal-pricing/h4276-emc-prod-warranty-maint-table.pdf)
- [Dell Support: End-of-life spreadsheet](https://supportkb.dell.com/attachment/ka0Do0000003IXsIAM/Dell-Hardware-Release-and-End-of-Service-Life-Notifications_pkb_en_US_1.xlsx)
- [Dell: ProSupport service description](https://i.dell.com/sites/csdocuments/Legal_Docs/en/us/dell-prosupport-for-infrastructure-sd-en.pdf)
- [Dell Community: Does not provide a publicly documented End of Life (EOL) or End of Support Life (EOSL) schedule for PowerEdge servers](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r740/6a572d2f50a08a1eb3bea760)
- [DataCenter News Asia: Shipped in July 2017](https://datacenternews.asia/story/generation-14-dell-emc-announces-availability-latest-server)
- [Dell Support: PowerFlex notice](https://www.dell.com/support/kbdoc/en-us/000305299/powerflex-hardware-and-software-end-of-service-dates)
- [Dell: December 2025 Windows Server matrix](https://dl.dell.com/content/manual83982175-dell-poweredge-microsoft-windows-server-os-support.pdf?language=en-us)
- [Dell Community: Still available but in Limited Quantities](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r740-not-discontinue/64a3fbbef4ccf8a8dea4d246)
- [Dell Community: Per Dell moderators](https://www.dell.com/community/en/conversations/rack-servers/poweredge-servers-end-of-life-and-end-of-support-life/64e67ef5c362560b91c0043e)
- [Dell Support: Dell's service tag guide](https://www.dell.com/support/contents/en-us/article/product-support/self-support-knowledgebase/locate-service-tag/server-storage)
- [hardwarewartung.com: Hardwarewartung](https://www.hardwarewartung.com/en/dell-poweredge-eol-eosl-2/)
- [icd3s.com: Icd3s](https://icd3s.com/end-of-life/dell/poweredge-r740/)
- [hardwarewartung.com: Dell publishes no fixed EOL or EOSL dates](https://www.hardwarewartung.com/en/dell-poweredge-r740-r740xd-eol-and-eosl/)
- [Dell Support: 2.19.0, released March 18, 2024](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=km6p8)
- [Dell Support: 2.86.86.86, released April 3, 2024](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=vwf72)
- [Dell Community: 2014](https://www.dell.com/community/en/conversations/rack-servers/eol-and-eos-r630/647f9f57f4ccf8a8de4226fa)
- [Dell Support: IDRAC8 notice](https://www.dell.com/support/kbdoc/en-us/000178044/support-for-integrated-dell-remote-access-controller-8-idrac8)
- [intel.com: Intel](https://www.intel.com/content/www/us/en/support/topics/support-and-servicing-for-processors.html)
- [Microsoft Learn: Microsoft](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2022)
- [Microsoft Learn: Microsoft](https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2016)
- [Dell Support: Dell](https://www.dell.com/support/kbdoc/en-us/000224826/omsa-eol-landing-page)
- [Dell Support: IDRAC9 notice](https://www.dell.com/support/kbdoc/en-us/000178016/support-for-integrated-dell-remote-access-controller-9-idrac9)
- [Dell Support: DSA-2026-355](https://www.dell.com/support/kbdoc/en-us/000505000/dsa-2026-355-security-update-for-dell-poweredge-server-for-intel-2026-security-advisories-2026-3-ipu)
- [Dell Support: DSA-2026-392](https://www.dell.com/support/kbdoc/en-us/000504998/dsa-2026-392-security-update-for-dell-idrac9-and-idrac10-vulnerability)
- [Dell Support: DSA-2026-415](https://www.dell.com/support/kbdoc/en-us/000509006/dsa-2026-415-security-update-for-dell-idrac9-and-idrac10-vulnerability)
- [Dell Support: Published minimums](https://www.dell.com/support/kbdoc/en-us/000227230/minimum-recommended-and-latest-code-versions-for-dell-technologies-poweredge)
- [Dell Support: BIOS 2.28.1](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=188CW)
- [Dell: Post Standard Support terms](https://i.dell.com/sites/csdocuments/Legal_Docs/en/us/post-standard-support-en.pdf)
- [Dell Support: R740](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r740)
- [Dell Support: R640](https://www.dell.com/support/home/en-us/drivers/supportedos/poweredge-r640)
- [Dell Support: BIOS 2.22.2](https://www.dell.com/support/home/en-us/drivers/driversdetails?driverid=f8gph)
- [Dell Community: Wrote on December 26, 2025](https://www.dell.com/community/en/conversations/poweredge-hardware-general/windows-server-2025-compatibility-and-official-driver-support-for-poweredge-r740/694e8377de43d31695a522b0)
- [Dell Support: VSphere 8.0 list](https://www.dell.com/support/kbdoc/en-us/000217592/dell-poweredge-servers-certified-for-vmware-vsphere-8-0)
- [ftpdocs.broadcom.com: End of technical guidance for ESXi 8.0 as October 11, 2029](https://ftpdocs.broadcom.com/cadocs/0/contentimages/Product_EOTG_Dates.pdf)
- [riministreet.com: Rimini Street](https://www.riministreet.com/blog/vmware-vsphere-8-end-of-support-5-smart-moves-it-leaders-are-making/)
- [Dell: ESXi 9.x matrix](https://dl.dell.com/content/manual23955509-vmware-vsphere-esxi-9-x-on-dell-poweredge-systems-compatibility-matrix.pdf?language=en-us)
- [Broadcom: CPU notice](https://knowledge.broadcom.com/external/article/428874)
- [Dell: R740 spec sheet](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/poweredge-r740-spec-sheet.pdf)
- [Proxmox: R640 compatibility thread](https://forum.proxmox.com/threads/dell-poweredge-r640-compatibility.182931/)
- [Proxmox: Requirements page](https://pve.proxmox.com/wiki/System_Requirements)
- [Proxmox: Proxmox VE 9.2](https://pve.proxmox.com/wiki/Roadmap)
- [Proxmox: At least as long as the corresponding Debian version](https://pve.proxmox.com/wiki/FAQ)
- [Proxmox: Backup Server roadmap](https://pbs.proxmox.com/wiki/Roadmap)
- [Dell Support: Red Hat matrix](https://linux.dell.com/files/supportmatrix/RHEL_Support_Matrix.pdf)
- [Dell Support: Ubuntu matrix](https://linux.dell.com/files/supportmatrix/Ubuntu_LTS_Support_Matrix.pdf)
- [The Register: The Register reported](https://www.theregister.com/2025/04/14/vmware_free_esxi_returns/)
- [servnetuk.com: Does not supply Dell or any other OEM software](https://www.servnetuk.com/server-end-of-life/dell-poweredge-14g-r740-r640)
- [Dell Technologies: R750](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/dell-emc-poweredge-r750-spec-sheet.pdf)
- [Dell Technologies: R760](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760-spec-sheet.pdf)
- [Dell Technologies: R770](https://www.delltechnologies.com/asset/en-my/products/servers/technical-support/poweredge-r770-spec-sheet.pdf)
- [Dell Support: Export and import KB](https://www.dell.com/support/kbdoc/en-us/000114972/export-and-import-idrac-configuration-information)
- [Dell Support: Dell offers free](https://www.dell.com/support/kbdoc/en-us/000128194)
