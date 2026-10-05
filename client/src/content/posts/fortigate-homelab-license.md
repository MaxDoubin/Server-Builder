
## The problem

You have a used FortiGate 40F or 60F from eBay, or you are about to buy one, or you want FortiGate-VM on a hypervisor, and you need to know what runs without paying Fortinet. The answers are scattered across release notes, licensing pages and support articles, and several changed with FortiOS 7.6.

## What a FortiGate still does with no contract

Fortinet's [license expiration page](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/289376/license-expiration) is direct: "The FortiGate will still function as a firewall if any or all of the FortiGuard licenses are expired." Policies, NAT, routing, [VLANs](/blog/vlan-segmentation-guide) and IPsec are FortiOS features, not subscriptions; Yuri Slobodyanyuk's [used FortiGate FAQ](https://yurisk.info/2022/12/19/fortigate-buy-used-most-frequently-asked-questions/) lists IPsec, QoS, VLANs and dynamic routing such as OSPF and BGP as working "out of the box." Fortinet's [SD-WAN ordering guide](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/og-secure-sdwan.pdf) says SD-WAN "can be enabled on all FortiGate models at no additional cost."

A contract buys data: signatures, real-time lookups and firmware. The license page covers each service:

| Service | With no valid license | Paid for by |
|---|---|---|
| IPS | Keeps scanning with the last downloaded signatures | FortiGuard IPS |
| Antivirus | Keeps scanning with the last database | FortiGuard antivirus |
| Application control, Internet Service Database, device and OS identification | Keep working, frozen | FortiCare |
| Web and DNS category filtering | Stops; all web and DNS traffic is dropped by default | FortiGuard web filtering |
| Antispam, outbreak prevention | Stop, because both need live lookups | FortiGuard |
| Firmware | Effectively locked to its current minor version | FortiCare |

That matches the [FortiGate homelab build](/blog/fortigate-firewall-homelab): the signature database freezes at the lapse date rather than disappearing. One refinement: application control is not a FortiGuard add-on. Fortinet lists its signatures among the base services "included with all FortiCare support contracts," and the [60F datasheet](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-60f-series.pdf) marks application control "included with FortiCare Subscription."

Register the unit first, since no licenses show until you do ([FortiGuard status tip](https://community.fortinet.com/fortigate-3/technical-tip-verifying-and-troubleshooting-fortiguard-updates-status-and-versions-96886)). Then this command shows each package's expiry and last update:

```
diagnose autoupdate versions
Contract Expiry Date: Fri Jan 21 2022
Last Updated using scheduled update on Sun Apr 25 07:21:32 2021
```

## Why firmware, not signatures, is the real limit

**Downloads.** FortiCloud's documentation is plain: "[Firmware image downloads](https://docs.fortinet.com/document/forticloud/26.1.0/forticare/878850/firmware-images) are available only for registered products with an active support contract."

<figure>
<img src="/images/blog/fortigate-homelab-license/fortigate-6501f.jpg" alt="The front of a white FortiGate 6501F appliance with rows of network ports" width="1200" height="464" loading="lazy" decoding="async">
<figcaption>A FortiGate 6501F, one of Fortinet's data center models. Whatever the size, firmware downloads need a registered unit with an active support contract. Photo: Premeditated, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Fortinet_FortiGate_6501F.png">Wikimedia Commons</a>.</figcaption>
</figure>

**On-box enforcement.** On FortiOS 7.4.2 and later, the FortiGate compares its Firmware & General Updates (FMWR) expiry date with the release date of the first GA build of the target major or minor version, and refuses the upgrade if the license expired first. That covers images uploaded in the GUI or pushed over TFTP, not only FortiGuard downloads. [Fortinet's example](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/299518/how-the-fortigate-firmware-license-works) of a blocked TFTP upgrade ends in `Command fail. Return code -180`. Downgrades are not blocked. The date on the FMWR line here is your firmware license expiry:

```
diagnose test update info contract | grep FMWR
```

**Required patch upgrades.** Since FortiOS 7.4.9 and 7.6.4, a FortiGate with an invalid FMWR license schedules a [required upgrade](https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/320693/required-firmware-upgrades-for-fortigates-with-invalid-support-contracts-or-that-have-reached-eoes) to the newest patch of its current minor version. You can push it back seven days at a time with `execute auto-upgrade delay-installation`, but you cannot cancel it.

Fortinet's pages disagree on two details. The [8.0 new features entry](https://docs.fortinet.com/document/fortigate/8.0.0/new-features/153433/enhancements-to-required-upgrade-when-firmware-license-is-invalid-or-device-is-eoes) says 7.4.8, not 7.4.9. The [7.6.4 guide](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/320693/required-firmware-upgrades-for-fortigate-appliances-with-invalid-support-contracts-or-that-have-reached-eoes) warned the upgrade "may fail where the firmware download is blocked by FDS," while the 7.6.7 and 8.0 guides say a ForcedUpdate flag tells FortiGuard to "ignore the license check." Trust the newer text, because it documents a specific protocol change.

In practice, a no-contract unit lives on the minor version it shipped with, plus its patches, and those matter. Fortinet's advisory [FG-IR-24-015](https://www.fortiguard.com/psirt/FG-IR-24-015), an out-of-bounds write in the SSL VPN daemon scored 9.6, was [fixed in 7.4.3 and 7.2.7](https://www.rapid7.com/blog/post/2024/02/12/etr-critical-fortinet-fortios-cve-2024-21762-exploited/), and [CISA added CVE-2024-21762](https://www.cisa.gov/news-events/alerts/2024/02/09/cisa-adds-one-known-exploited-vulnerability-catalog) to its Known Exploited Vulnerabilities catalog on February 9, 2024.

## SSL VPN on a 40F or 60F after FortiOS 7.6

SSL VPN went away in two steps:

- **FortiOS 7.6.0** removed SSL VPN web and tunnel mode from models with 2 GB of RAM or less: the 40F and its variants, the 60F, the 61F and the FortiGate Rugged 60F. [Settings are not upgraded](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/877104/ssl-vpn-removed-from-2gb-ram-models-for-tunnel-and-web-mode), and the 60F datasheet footnotes "SSL VPN not supported on FortiOS 7.6.0 and above."
- **FortiOS 7.6.3** [replaced tunnel mode with IPsec](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/173430/ssl-vpn-tunnel-mode-replaced-with-ipsec-vpn) on every model. Web mode survives as Agentless VPN on larger models, but [not on](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/877104/agentless-vpn-formerly-ssl-vpn-web-mode-not-supported-on-some-fortigate-series-models) the 40F, 50G, 60F, 61F, 70G, 90G or 91G.

Confirm the memory class with `diagnose hardware sysinfo conserve`: a total RAM value below 2000 MB means a 2 GB model. Those models also lost proxy features in FortiOS 7.4.4: proxy inspection converts to flow mode, and ZTNA, explicit proxy, WAF, video filtering and inline CASB are [no longer supported](https://docs.fortinet.com/document/fortigate/7.6.3/administration-guide/519079/proxy-related-features-not-supported-on-fortigate-2-gb-ram-models).

The replacement is dial-up IPsec, which can run over TCP 443 where UDP 500 and 4500 are blocked. Fortinet's [migration guide](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/155142/migration-from-ssl-vpn-tunnel-mode-to-ipsec-vpn-7-6-3) says TCP transport needs FortiOS 7.4.2 or later and FortiClient 7.4.1 or later. The encapsulation is an IETF standard, [RFC 9329](https://www.rfc-editor.org/rfc/rfc9329).

## Registering a secondhand unit and buying a contract

Registration happens in FortiCloud under Products, Register More, using the serial number, and the [wizard asks](https://docs.fortinet.com/document/forticloud/latest/asset-management/40/registering-assets) for "the Fortinet Partner or Reseller that helped you with your asset." That only works if nobody else holds the serial.

If the previous owner never released it, Fortinet's [unit transfer requirements](https://community.fortinet.com/customer-service-42/customer-service-tip-requirements-for-unit-transfer-request-159244) apply: written approval from both account admins, three email attempts and a phone call, typically 4 to 5 business days. The same page says transfers will be denied when the unit came through unauthorized sales, naming eBay, the gray market, and secondhand or auction sales, plus recycled hardware and transfers between generic accounts such as Gmail. The self-serve [Asset Transfer token](https://community.fortinet.com/customer-service-42/customer-service-tip-self-serve-asset-transfer-functionality-for-unit-device-transfers-in-the-asset-management-portal-205118) is for intercompany moves only, and the FortiOS [GUI transfer](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/388078/transfer-a-device-to-another-forticloud-account) needs the seller's FortiCloud password.

The clean route is a seller who deregisters the unit before the sale. Since FortiOS 7.2.1, an admin can [deregister from the GUI or CLI](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/737278/deregistration-from-the-gui-7-2-1) once the unit has been registered for three years or more. That also deregisters its contracts, so leftover coverage does not travel with the box:

```
diagnose forticare direct-registration product-deregister ACCOUNT_ID PASSWORD
```

Inside three years it fails with `Unit deregistration unsuccessful.`, and the seller has to decommission and then [deregister in the portal](https://docs.fortinet.com/document/forticloud/latest/asset-management/622713/viewing-decommissioned-units).

Buying a contract afterward is not guaranteed. Fortinet's [service terms](https://www.fortinet.com/content/dam/fortinet/assets/legal/Fortinet-Service-Offering-Terms.pdf) define a customer as someone who bought "from an authorized FortiPartner or Fortinet," and let Fortinet terminate service contracts on "transfer of the unit of Product to a third party." Renewals are continuous: coverage starts the day after the old contract expired, and if you register more than 180 days later, the start date is set 180 days before your registration. A long-lapsed unit costs up to six months of backdated time on top of the new term; the terms describe that backdating, not a separate reinstatement fee.

## The FortiGate-VM permanent trial and its exact limits

FortiOS 7.2.1 introduced a [permanent evaluation license](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/7398/permanent-trial-mode-for-fortigate-vm-7-2-1) that "replaces the 15 day evaluation period." It covers private clouds such as VMware ESXi and KVM, which Proxmox uses ([Proxmox vs ESXi](/blog/proxmox-vs-esxi)). The [administration guide](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/441460/permanent-trial-mode-for-fortigate-vm) lists the limits:

| Limit | Permanent trial |
|---|---|
| vCPU and memory | 1 CPU, 2 GB |
| Interfaces, firewall policies, routes | 3 each |
| VDOMs | 2 (root must be the admin type) |
| Encryption | Low only, except GUI management and FortiManager |
| FortiGuard updates, FortiCare support | None |
| Copies | One per FortiCloud account |
| Expiry | None |

Activate it with your FortiCloud login and confirm the reboot prompt; afterward, `get system status` should show the last two lines:

```
execute vm-license-options account-id you@example.com
execute vm-license-options account-password YOUR_PASSWORD
execute vm-license
License Status: Valid
VM Resources: 1 CPU/1 allowed, 2007 MB RAM/2048 MB allowed
```

Fortinet does not list the trial's ciphers, but its [low encryption page](https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/721455/low-encryption-models) says low encryption models "only use 56-bit DES encryption" for IPsec and Agentless VPN and cannot do SSL inspection, and Slobodyanyuk's [test of the older trial](https://yurisk.info/2021/02/28/fortigate-vm-evaluation-license-15-days-limitations/) found "only DES" enabled. [RFC 8247](https://www.rfc-editor.org/rfc/rfc8247) marks DES "MUST NOT" for IKEv2 because it "provides no meaningful security whatsoever," so build DES tunnels only between lab VMs.

The trial cannot be upgraded either: Fortinet's [firmware license page](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/299518/how-the-fortigate-firmware-license-works) says a FortiGate with missing FMWR information "will not be allowed to upgrade," a case that "may occur when running on an EVAL license." Deploy the image of the version you want. Owners report that a redeployed trial VM comes up unlicensed, and Fortinet staff point them to Customer Service to remove the old registration ([forum thread](https://community.fortinet.com/support-forum-92/how-to-redeploy-a-free-vm-trial-fortigate-136509)). The old 15-day license belongs to FortiOS 7.2.0 and earlier and, per Fortinet's [KVM guide](https://docs.fortinet.com/document/fortigate-private-cloud/7.2.0/kvm-administration-guide/504166/fortigate-vm-evaluation-license), disables functionality when it expires.

## The cheapest legitimate ways to run a FortiGate lab

- **Free lessons, paid labs.** The [Fortinet Training Institute](https://helpdesk.training.fortinet.com/support/solutions/articles/73000524102-how-do-i-register-for-the-free-online-self-paced-training-) opens every self-paced lesson free of charge, but "On-demand labs are not included." The [FortiGate Administrator course](https://training.fortinet.com/local/staticpage/view.php?page=library_fortigate-administrator) targets FortiOS 7.4.1 and estimates 12 hours of lecture and 10 of lab, so the lab half needs a purchase or your own FortiGate.
- **The VM trial** costs nothing and covers the [CLI essentials](/blog/fortigate-cli-essentials), policy logic and routing inside its three-interface, three-policy, three-route limit.
- **Used hardware without a contract** is a capable router, firewall, IPsec and SD-WAN box frozen at its minor version. Judge it like any [used enterprise gear](/blog/buying-used-enterprise-gear): price it as it is.
- **Used hardware with a contract**, if a partner will sell one, splits two ways. FortiCare Premium alone covers firmware, application control and the base services. IPS, antivirus and web filtering come from FortiGuard, individually or in bundles such as Enterprise Protection, Unified Threat Protection and Advanced Threat Protection; the 60F datasheet says "All bundles include FortiCare Premium Services." Contents and prices vary by model, term and reseller, so quote both.

## What breaks

**Fortinet will not move the unit to your account.**
It is still registered to the previous owner, and Fortinet denies transfers for eBay and other secondhand purchases. Fix: before paying, have the seller deregister it (from FortiOS after three years, through the portal otherwise), then register the serial yourself. If the seller will not, price it as a no-contract box.

**Every website stops loading after the contract lapses.**
Category filtering needs live FortiGuard ratings, and "Allow websites when a rating error occurs" is [disabled by default](https://community.fortinet.com/fortigate-3/technical-tip-implications-of-having-allow-websites-when-a-rating-error-occurs-enabled-or-disabled-on-the-fortigate-215039), so failed lookups block the page. Fix: remove FortiGuard categories from the profile, or let rating errors pass with the [error-allow option](https://docs.fortinet.com/document/fortigate/7.2.4/cli-reference/399620/config-webfilter-profile). `set options` takes the whole list, so repeat any option already present. Static URL filters keep working.

```
config webfilter profile
    edit "default"
        config ftgd-wf
            set options error-allow
        end
    next
end
```

**An upgrade fails with return code -180.**
The FMWR license expired before the target version's first GA release, which FortiOS 7.4.2 and later enforce on the box. Fix: stay within your current minor version, or renew FortiCare before you try.

**SSL VPN is gone after an upgrade.**
FortiOS 7.6.0 removed it on 2 GB models and 7.6.3 removed tunnel mode everywhere, without migrating settings. Fix: back up the config and build dial-up IPsec before upgrading. FortiOS 7.6.1 made 443 the [default IKE TCP port](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/584870/gui-access-conflict-with-ipsec-tcp-tunnel-on-the-same-interface) on new deployments, which collides with HTTPS admin on the same interface, so move the GUI with `set admin-sport 8443` under `config system global` or change `ike-tcp-port` under `config system settings`.

**FortiGuard, certificates and VPNs fail after a power cut.**
A wrong clock puts certificates outside their validity window, and Fortinet lists failed license validation and stalled signature updates among the [effects of bad time](https://community.fortinet.com/fortigate-3/technical-tip-possible-impacts-of-ntp-sync-failure-or-incorrect-time-on-fortigate-210168), adding: "A faulty battery can cause hardware to be out of NTP sync." Fix: point NTP at a server you trust and [confirm the sync](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ntp-synchronization-issue-97166); correct output begins with `synchronized: yes, ntpsync: enabled`.

```
config system ntp
    set ntpsync enable
    set type custom
    config ntpserver
        edit 1
            set server "pool.ntp.org"
        next
    end
end
diagnose sys ntp status
```

**The VM trial refuses a fourth policy, or the IPsec peer rejects every proposal.**
Those are the three-object limits and the low encryption mode. Fix: design the lab around three interfaces, policies and routes, use DES only between lab VMs, and buy a VM license when you outgrow it.

## What this means

A used 40F or 60F with no contract is still a real router, stateful firewall, IPsec and SD-WAN box, which is enough to learn FortiOS. Check `get system status` before you buy, because that minor version is the one you keep, and have the seller deregister the unit before you pay. Keep the admin interface off the internet, and if you expose a VPN, stay on the newest patch, since patches are the only updates the box can get. SSL VPN tunnel mode on a 2 GB model means staying below 7.6.0; IPsec is the path Fortinet supports from here. Pair it with the free VM trial and Training Institute lessons, and pay for labs or FortiCare only once you know what you need.

## References

- [Fortinet Docs: license expiration](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/289376/license-expiration)
- [yurisk.info: fortigate buy used most frequently asked questions](https://yurisk.info/2022/12/19/fortigate-buy-used-most-frequently-asked-questions/)
- [Fortinet: og secure sdwan](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/og-secure-sdwan.pdf)
- [Fortinet: fortigate fortiwifi 60f series](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-60f-series.pdf)
- [Fortinet Community: technical tip verifying and troubleshooting fortiguard updates status and versions 96886](https://community.fortinet.com/fortigate-3/technical-tip-verifying-and-troubleshooting-fortiguard-updates-status-and-versions-96886)
- [Fortinet Docs: firmware images](https://docs.fortinet.com/document/forticloud/26.1.0/forticare/878850/firmware-images)
- [Fortinet Docs: how the fortigate firmware license works](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/299518/how-the-fortigate-firmware-license-works)
- [Fortinet Docs: required firmware upgrades for fortigates with invalid support contracts or that have reac](https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/320693/required-firmware-upgrades-for-fortigates-with-invalid-support-contracts-or-that-have-reached-eoes)
- [Fortinet Docs: enhancements to required upgrade when firmware license is invalid or device is eoes](https://docs.fortinet.com/document/fortigate/8.0.0/new-features/153433/enhancements-to-required-upgrade-when-firmware-license-is-invalid-or-device-is-eoes)
- [Fortinet Docs: required firmware upgrades for fortigate appliances with invalid support contracts or that](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/320693/required-firmware-upgrades-for-fortigate-appliances-with-invalid-support-contracts-or-that-have-reached-eoes)
- [FortiGuard: FG IR 24 015](https://www.fortiguard.com/psirt/FG-IR-24-015)
- [rapid7.com: etr critical fortinet fortios cve 2024 21762 exploited](https://www.rapid7.com/blog/post/2024/02/12/etr-critical-fortinet-fortios-cve-2024-21762-exploited/)
- [cisa.gov: cisa adds one known exploited vulnerability catalog](https://www.cisa.gov/news-events/alerts/2024/02/09/cisa-adds-one-known-exploited-vulnerability-catalog)
- [Fortinet Docs: ssl vpn removed from 2gb ram models for tunnel and web mode](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/877104/ssl-vpn-removed-from-2gb-ram-models-for-tunnel-and-web-mode)
- [Fortinet Docs: ssl vpn tunnel mode replaced with ipsec vpn](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/173430/ssl-vpn-tunnel-mode-replaced-with-ipsec-vpn)
- [Fortinet Docs: agentless vpn formerly ssl vpn web mode not supported on some fortigate series models](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/877104/agentless-vpn-formerly-ssl-vpn-web-mode-not-supported-on-some-fortigate-series-models)
- [Fortinet Docs: proxy related features not supported on fortigate 2 gb ram models](https://docs.fortinet.com/document/fortigate/7.6.3/administration-guide/519079/proxy-related-features-not-supported-on-fortigate-2-gb-ram-models)
- [Fortinet Docs: migration from ssl vpn tunnel mode to ipsec vpn 7 6 3](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/155142/migration-from-ssl-vpn-tunnel-mode-to-ipsec-vpn-7-6-3)
- [rfc-editor.org: rfc9329](https://www.rfc-editor.org/rfc/rfc9329)
- [Fortinet Docs: registering assets](https://docs.fortinet.com/document/forticloud/latest/asset-management/40/registering-assets)
- [Fortinet Community: customer service tip requirements for unit transfer request 159244](https://community.fortinet.com/customer-service-42/customer-service-tip-requirements-for-unit-transfer-request-159244)
- [Fortinet Community: customer service tip self serve asset transfer functionality for unit device transfers in ](https://community.fortinet.com/customer-service-42/customer-service-tip-self-serve-asset-transfer-functionality-for-unit-device-transfers-in-the-asset-management-portal-205118)
- [Fortinet Docs: transfer a device to another forticloud account](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/388078/transfer-a-device-to-another-forticloud-account)
- [Fortinet Docs: deregistration from the gui 7 2 1](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/737278/deregistration-from-the-gui-7-2-1)
- [Fortinet Docs: viewing decommissioned units](https://docs.fortinet.com/document/forticloud/latest/asset-management/622713/viewing-decommissioned-units)
- [Fortinet: Fortinet Service Offering Terms](https://www.fortinet.com/content/dam/fortinet/assets/legal/Fortinet-Service-Offering-Terms.pdf)
- [Fortinet Docs: permanent trial mode for fortigate vm 7 2 1](https://docs.fortinet.com/document/fortigate/7.2.0/new-features/7398/permanent-trial-mode-for-fortigate-vm-7-2-1)
- [Fortinet Docs: permanent trial mode for fortigate vm](https://docs.fortinet.com/document/fortigate/7.6.4/administration-guide/441460/permanent-trial-mode-for-fortigate-vm)
- [Fortinet Docs: low encryption models](https://docs.fortinet.com/document/fortigate/8.0.0/administration-guide/721455/low-encryption-models)
- [yurisk.info: fortigate vm evaluation license 15 days limitations](https://yurisk.info/2021/02/28/fortigate-vm-evaluation-license-15-days-limitations/)
- [rfc-editor.org: rfc8247](https://www.rfc-editor.org/rfc/rfc8247)
- [Fortinet Community: how to redeploy a free vm trial fortigate 136509](https://community.fortinet.com/support-forum-92/how-to-redeploy-a-free-vm-trial-fortigate-136509)
- [Fortinet Docs: fortigate vm evaluation license](https://docs.fortinet.com/document/fortigate-private-cloud/7.2.0/kvm-administration-guide/504166/fortigate-vm-evaluation-license)
- [Fortinet: 73000524102 how do i register for the free online self paced training](https://helpdesk.training.fortinet.com/support/solutions/articles/73000524102-how-do-i-register-for-the-free-online-self-paced-training-)
- [Fortinet: view](https://training.fortinet.com/local/staticpage/view.php?page=library_fortigate-administrator)
- [Fortinet Community: technical tip implications of having allow websites when a rating error occurs enabled or ](https://community.fortinet.com/fortigate-3/technical-tip-implications-of-having-allow-websites-when-a-rating-error-occurs-enabled-or-disabled-on-the-fortigate-215039)
- [Fortinet Docs: config webfilter profile](https://docs.fortinet.com/document/fortigate/7.2.4/cli-reference/399620/config-webfilter-profile)
- [Fortinet Docs: gui access conflict with ipsec tcp tunnel on the same interface](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/584870/gui-access-conflict-with-ipsec-tcp-tunnel-on-the-same-interface)
- [Fortinet Community: technical tip possible impacts of ntp sync failure or incorrect time on fortigate 210168](https://community.fortinet.com/fortigate-3/technical-tip-possible-impacts-of-ntp-sync-failure-or-incorrect-time-on-fortigate-210168)
- [Fortinet Community: troubleshooting tip ntp synchronization issue 97166](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ntp-synchronization-issue-97166)
