
## The problem

You run a small FortiGate (a 40F, 60F, 70F, 80F or one of the small G-series models) on FortiOS 7.4, and the firmware page keeps offering 7.6. Or you just bought a unit and have to pick a branch. The two branches differ in what they remove, how long Fortinet supports them and which hardware they run on, and on the smallest models 7.6 takes SSL VPN away entirely, so you need to know what the upgrade costs before you click it.

## How FortiOS 7.6 and 7.4 compare

FortiOS 7.4 reached general availability on May 11, 2023 and 7.6 followed on July 25, 2024, according to the lifecycle tables on [endoflife.date](https://endoflife.date/fortios) and [jimber.io](https://jimber.io/blog/fortios-7-4-end-of-support/). In March 2026 Fortinet [extended the support dates of both branches by one year](https://community.fortinet.com/fortigate-3/technical-tip-fortios-end-of-support-change-for-fortios-v7-4-and-v7-6-224876) under Customer Support Bulletin CSB-260330-1, so tables published before then show End of Engineering Support and End of Support dates a year earlier.

| | FortiOS 7.4 | FortiOS 7.6 |
|---|---|---|
| General availability | May 11, 2023 | July 25, 2024 |
| End of Engineering Support | May 11, 2027 | July 25, 2028 |
| End of Support | November 11, 2028 | January 25, 2030 |
| Mature tag | Builds past 7.4.5 | 7.6.5 and later |
| Build Fortinet recommends (June 2026) | 7.4.11 | 7.6.6 |
| SSL VPN on 40F, 60F, 61F | Yes | Removed in 7.6.0 |
| SSL VPN tunnel mode elsewhere | Yes, on models that support SSL VPN | Removed in 7.6.3 on all models |
| Proxy features on 2 GB models | Removed in 7.4.4 | Removed in 7.6.0, email protocols back in 7.6.5 |
| 60E, 80E, 90E in the release notes | Yes (7.4.11) | No (7.6.7) |

The two support dates mean different things. After End of Engineering Support, a branch "enters a must-fix support phase," in endoflife.date's words: maintenance builds are produced only for industry-wide critical issues and PSIRT vulnerabilities. After End of Support, Fortinet's [customer service tip](https://community.fortinet.com/customer-service-42/customer-service-tip-end-of-support-firmware-and-lts-183585) says it "has no obligation to provide any support until the firmware is returned to a supportable version." Counted from October 2026, 7.4 has about 7 months of full engineering support left against about 21 for 7.6, and about 25 months until End of Support against about 39.

## Which small FortiGates can run 7.6

Hardware decides the question before features do. The [FortiOS 7.4.11 release notes](https://docs.fortinet.com/document/fortigate/7.4.11/fortios-release-notes/) list the FG-60E, FG-61E, FG-80E, FG-81E, FG-90E and FG-91E. The [7.6.7 release notes](https://docs.fortinet.com/document/fortigate/7.6.7/fortios-release-notes/) list the FG-30G, FG-40F, FG-50G, FG-60F, FG-61F, FG-70F, FG-70G, FG-80F, FG-90G and FG-100F, and do not list the 60E, 80E or 90E. If you own one of those three, 7.4 is the newest branch whose release notes name your model, and 7.4 reaches End of Support on November 11, 2028. Replacing a 60E is covered in [FortiGate 60E to 60F migration](/blog/fortigate-60e-to-60f-migration).

<figure>
<img src="/images/blog/fortios-7-6-vs-7-4/photo-1.jpg" alt="Partly assembled equipment rack holding networking and server hardware at a large computer party" width="1050" height="1400" loading="lazy" decoding="async">
<figcaption>A rack under construction at The Gathering 2019 computer party in Hamar, Norway, holding Fortinet and Supermicro hardware. Which FortiOS branch a FortiGate can run depends first on its model, and the 7.6.7 release notes do not list the 60E, 80E or 90E. Photo: DiFronzo, <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:The_Gathering_2019_-_Rack_%28under_constructions%29_%2847730325011%29.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Fortinet's own pick per model comes from its [Recommended Release tip](https://community.fortinet.com/fortigate-3/technical-tip-recommended-release-for-fortios-116639), which says its table is "the latest as of June 2026" and is reviewed every quarter. It requires "40,000 or more FortiGates" running the build and no high-severity vulnerabilities without a mitigation or workaround.

| Model | Recommended build | Branch |
|---|---|---|
| 30G, 31G | 7.4.11 | 7.4 |
| 40F | 7.6.6 | 7.6 |
| 50G, 51G | 7.6.6 | 7.6 |
| 60E, 80E, 90E | 7.4.11 | 7.4 |
| 60F | 7.6.6 | 7.6 |
| 70F, 80F, 100F | 7.6.6 | 7.6 |
| 70G, 71G | 7.6.6 | 7.6 |
| 90G | 7.6.6 | 7.6 |

The 30G stands out: 7.6 supports it, yet Fortinet still recommends 7.4.11. [NetWorks Group's October 1, 2026 recommendations](https://networksgroup.com/blog/recommendation-for-fortinet-devices) make the same exception, advising 7.6.6 for F-series and G-series devices except the 30G and 31G, which it keeps on 7.4.11.

## What 7.6 removes from SSL VPN

SSL VPN is the biggest functional difference between the branches, and the change arrives in three steps.

1. **FortiOS 7.6.0, 2 GB models.** On the 40F, 60F, 61F and their FortiWiFi versions, plus 2 GB FortiGate Rugged 60F units, SSL VPN web and tunnel mode [are removed](https://docs.fortinet.com/document/fortigate/7.6.1/fortios-release-notes/877104) and "will no longer be available from the GUI or CLI." Settings are not carried over, and Fortinet's [SSL VPN support tip](https://community.fortinet.com/t5/FortiGate/Technical-Tip-SSL-VPN-support-on-FortiGate-models/ta-p/359125) lists these families as having "no SSL VPN support in v7.6.0 and later."
2. **FortiOS 7.6.3, every model.** Tunnel mode is [replaced with IPsec VPN](https://docs.fortinet.com/document/fortigate/7.6.3/fortios-release-notes/173430). Fortinet states that "SSL VPN tunnel mode is no longer available in the GUI and CLI" and "Settings will not be upgraded from previous versions."
3. **FortiOS 7.6.3, web mode.** Web mode is renamed Agentless VPN, but it is [not supported on](https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/877104/agentless-vpn-formerly-ssl-vpn-web-mode-not-supported-on-some-fortigate-series-models) the 40F, 50G, 60F, 61F, 2 GB Rugged 60F, 70G, 90G or 91G.

The result on 7.6.3 and later: a 40F, 50G, 60F, 70G or 90G has no SSL VPN of any kind, and a 70F, 80F or 100F keeps only the browser-based Agentless VPN. FortiClient users in tunnel mode lose access on every model.

On 7.4 the 40F and 60F families keep SSL VPN. Fortinet's [SSL VPN support tip](https://community.fortinet.com/t5/FortiGate/Technical-Tip-SSL-VPN-support-on-FortiGate-models/ta-p/359125) says future 7.2 and 7.4 releases are not expected to remove it from F-series models. The small G-series is already different on 7.4: the same tip says the 90G/91G and lower do not support SSL VPN, the 30G and 50G never did, and for the 70G "the feature will not be supported starting v7.4.8." NetWorks Group instead lists the 50G, 70G and 90G as losing SSL VPN in 7.4.9. Either way, staying on 7.4 does not save SSL VPN on a small G-series box.

The replacement is IPsec dial-up. Fortinet's [SSL VPN to IPsec migration guide](https://docs.fortinet.com/document/fortigate/7.4.4/ssl-vpn-to-ipsec-vpn-migration/126460) explains that "IPsec when configured to use IKE version 2 supports configuring TCP as its transport method using port 443" and advises moving to IPsec before upgrading to 7.6.3 or later. Because Fortinet publishes the guide for 7.4.4 as well as 7.6, you can build the IPsec tunnel and move users while still on 7.4, then upgrade.

## What else changes on 2 GB models

The 40F, 60F and 61F are 2 GB models, and both branches already trimmed them. Starting with 7.4.4, [FortiOS no longer supports proxy-related features](https://docs.fortinet.com/document/fortigate/7.4.5/fortios-release-notes/768039) on the "40F, 60E, 60F, 80E, and 90E series devices, along with their variants." 7.6.0 drops them too, according to a [Fortinet special notice for low-end units](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Special-Notice-for-low-end-units-lt-2Gb-RAM/ta-p/328294).

7.6 gives one piece back. The same notice says that starting with 7.6.5 and 8.0.0, "proxy-based inspection for email protocols has been reinstated" on models with 2 GB of RAM. It covers SMTP/SMTPS, POP3/POP3S, IMAP/IMAPS and NNTP, and any traffic that matches the policy but belongs to a non-email protocol is dropped.

7.6 also costs some CPU. In 7.6.0 the IPS `cp-accel-mode` default [changed from advanced to none](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/121361) on the "FortiGate and FortiWiFi 4xF/6xF families." Fortinet made the change to lower memory use and warns of a "performance impact as CPU will do the pre-match" inside IPS. If a 40F or 60F runs IPS, expect higher CPU use after the upgrade.

## Maturity, security fixes and FortiOS 8.0

Fortinet tags each build as Feature (GA.F) or Mature (GA.M). Its [terminology tip](https://community.fortinet.com/fortigate-3/technical-tip-fortios-firmware-version-terminology-185718) says "Once a Minor Version has its first Mature release, future patches in that train are also expected to be marked as Mature." Fortinet's [Mature release tip](https://community.fortinet.com/t5/FortiGate/Technical-Tip-Firmware-release-for-a-Mature-version/ta-p/317830) says a Mature branch gets bug fixes and no added features, that 7.4 builds past 7.4.5 are Mature and that 7.6 had no Mature release as of August 2025. The [BOLL blog reported](https://blog.boll.ch/fortios-7-6-5-what-you-should-know-about-the-new-mature-release/) on December 29, 2025 that 7.6 moved to Mature with 7.6.5. That removes the maturity argument for staying on 7.4.

Security fixes land in both branches. Fortinet's advisory [FG-IR-26-060](https://www.fortiguard.com/psirt/FG-IR-26-060) (CVE-2026-24858), a FortiCloud SSO authentication bypass published January 27, 2026, scored 9.8, was marked known exploited, and was fixed in 7.4.11 and 7.6.6. After 7.4 reaches End of Engineering Support on May 11, 2027, it gets builds only for industry-wide critical issues and PSIRT vulnerabilities.

FortiOS 8.0 is the newest branch, released April 21, 2026, per endoflife.date. NetWorks Group says it "does not recommend using FortiOS 8.0.X on any Fortinet devices at this time," citing IPsec and config sync bugs, and Fortinet's June 2026 table lists no 8.0 build for any model.

## How to check your unit before upgrading

Start with the version and maturity tag. Fortinet's example output shows the format, where GA.F means Feature and GA.M means Mature:

```
get system status
```

```
Version: FortiGate-61F v7.6.0,build3401,240724 (GA.F)
```

Confirm the memory class. Fortinet's 7.6 release notes use this command to find the affected 2 GB models: a total RAM figure below 2000 MB means the unit is one of them.

```
diagnose hardware sysinfo conserve
```

Check the firmware license, because it can block the jump to a new branch. On FortiOS 7.4.2 and later, [Fortinet's administration guide](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/299518/how-the-fortigate-firmware-license-works) says enforcement is based on the expiry date of the current firmware license. If that date is earlier than the first GA release date of the target major or minor version, "the firmware update to that version will not be allowed," and the guide's example upgrade from 7.4.0 to 7.6.3 fails with "Command fail. Return code -180." The FMWR (Firmware & General Updates) line in this output is that expiry date, and the guide also shows `diagnose test update info contract | grep FMWR` for just that line:

```
diagnose test update info
```

```
FMWR,Mon May 6 16:00:00 2024
```

That sample line, from a [Fortinet license tip](https://community.fortinet.com/fortigate-3/technical-tip-how-to-view-license-details-via-cli-and-gui-95031), shows a license that expired before 7.6.0 shipped on July 25, 2024, so that unit could not move to 7.6 without a renewal. More on running without a contract is in [FortiGate homelab license](/blog/fortigate-homelab-license).

Then plan the hops. Fortinet's [Upgrade Path Tool](https://docs.fortinet.com/upgrade-tool) "returns the shortest tested upgrade path between your current firmware and a target release," treats each hop as a full firmware install, and says to back up the configuration and license file first. If you are new to the CLI commands above, [FortiGate CLI essentials](/blog/fortigate-cli-essentials) covers the basics.

Finally, read the 7.6.5 changes that apply on upgrade. The [password policy](https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/799879) requires an uppercase letter, a lowercase letter, a number, a special character and "A minimum length of 12 characters." The [changes in default behavior](https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/230510/changes-in-default-behavior) move IPsec DH defaults from groups 14 and 5 to 20 and 21 when configured from the CLI, switch FortiGuard updates from automatic to daily, and disable `allow-traffic-redirect` even where you had it enabled. On G-series units, Fortinet's [FortiCare registration enforcement](https://community.fortinet.com/fortigate-3/technical-tip-enforcing-forticare-registration-starting-from-v7-2-11-v7-4-8-v7-6-5-v8-0-0-199927) starts at 7.2.11, 7.4.8, 7.6.5 and 8.0.0, so an unregistered G-series box can hit that wall on either branch.

## What breaks

**Remote users cannot connect after the upgrade.**
Fortinet says SSL VPN settings "will not be upgraded from previous versions" on 2 GB models at 7.6.0 and for tunnel mode on every model at 7.6.3, and that customers "must migrate their SSL VPN tunnel mode configuration to IPsec VPN before upgrading to FortiOS 7.6.3."
Fix: build an IKEv2 IPsec dial-up tunnel over TCP 443 on 7.4, move every user to it, then upgrade.

**The upgrade fails with Return code -180.**
The FMWR license expired before the target branch's first GA release, so the FortiGate refuses the image.
Fix: renew the Firmware & General Updates entitlement before upgrading, or stay on your current 7.4 build. The check only guards upgrades: Fortinet's guide says downgrades between major or minor versions are not blocked.

**The admin login demands a new password after 7.6.5.**
The password policy is enforced at login, and Fortinet says that if your password does not comply, "you must change your password before you can log in to the GUI or CLI."
Fix: set a compliant password of 12 or more characters on every admin account while still on 7.4.

**A 7.4 spoke cannot reliably use the ADVPN easy configuration key from a 7.6 hub.**
Fortinet's [ADVPN compatibility tip](https://community.fortinet.com/fortigate-3/technical-tip-advpn-vpn-wizard-compatibility-limitations-between-fortios-v7-4-and-v7-6-218221) says the 7.6 wizard builds ADVPN tunnels with IKEv2 by default while 7.4 uses IKEv1, and that the key's field names and number of fields differ between versions.
Fix: "configure the ADVPN settings manually instead of using an easy configuration key."

**The new IPsec dial-up tunnel fails while users type a FortiToken code.**
The default IKE negotiation timeout is 30 seconds, and Fortinet's [FortiToken dial-up tip](https://community.fortinet.com/fortigate-3/technical-tip-ipsec-dial-up-tunnel-using-ikev2-with-fortitoken-2fa-for-local-users-201395) says extending it "may be necessary."
Fix: raise it on the phase 1 interface (Fortinet's example uses 50 seconds):

```
config vpn ipsec phase1-interface
    edit "Test-Dialup"
        set negotiate-timeout 50
    next
end
```

**Traffic redirected on the same interface stops after 7.6.5.**
Fortinet changed `allow-traffic-redirect` and `ipv6-allow-traffic-redirect` from enable to disable, so traffic that arrives on an interface and leaves on the same one now needs a firewall policy that explicitly allows it. The upgrade applies the new value even if you had them enabled.
Fix: add an explicit firewall policy for that traffic, or turn both settings back on under `config system global`.

## What this means

Pick the branch by model first. A 60E, 80E or 90E stays on 7.4.11 and needs a replacement plan before November 11, 2028. A 30G or 31G stays on 7.4.11, as Fortinet recommends. A 40F, 60F, 70F, 80F, 100F, 50G, 70G or 90G should move to 7.6.6, Fortinet's recommended build, which gives you support to January 25, 2030, a Mature branch and, on 2 GB units, email proxy inspection back.

Do the SSL VPN work before the upgrade, not after. On a 40F or 60F the first 7.6 build removes SSL VPN completely, and on every model 7.6.3 removes tunnel mode. If you cannot move users to IPsec yet, stay on 7.4.11 and finish the migration before 7.4 drops to critical fixes only on May 11, 2027. Check the FMWR date first: if it predates July 25, 2024, 7.6 is closed to you until you renew. Skip 8.0 for now.

## References

- https://endoflife.date/fortios
- https://community.fortinet.com/fortigate-3/technical-tip-fortios-end-of-support-change-for-fortios-v7-4-and-v7-6-224876
- https://community.fortinet.com/customer-service-42/customer-service-tip-end-of-support-firmware-and-lts-183585
- https://jimber.io/blog/fortios-7-4-end-of-support/
- https://docs.fortinet.com/document/fortigate/7.4.11/fortios-release-notes/
- https://docs.fortinet.com/document/fortigate/7.6.7/fortios-release-notes/
- https://community.fortinet.com/fortigate-3/technical-tip-recommended-release-for-fortios-116639
- https://networksgroup.com/blog/recommendation-for-fortinet-devices
- https://docs.fortinet.com/document/fortigate/7.6.1/fortios-release-notes/877104
- https://docs.fortinet.com/document/fortigate/7.6.3/fortios-release-notes/173430
- https://docs.fortinet.com/document/fortigate/7.6.4/fortios-release-notes/877104/agentless-vpn-formerly-ssl-vpn-web-mode-not-supported-on-some-fortigate-series-models
- https://community.fortinet.com/t5/FortiGate/Technical-Tip-SSL-VPN-support-on-FortiGate-models/ta-p/359125
- https://docs.fortinet.com/document/fortigate/7.4.4/ssl-vpn-to-ipsec-vpn-migration/126460
- https://docs.fortinet.com/document/fortigate/7.4.5/fortios-release-notes/768039
- https://community.fortinet.com/t5/FortiGate/Technical-Tip-Special-Notice-for-low-end-units-lt-2Gb-RAM/ta-p/328294
- https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/121361
- https://community.fortinet.com/fortigate-3/technical-tip-fortios-firmware-version-terminology-185718
- https://community.fortinet.com/t5/FortiGate/Technical-Tip-Firmware-release-for-a-Mature-version/ta-p/317830
- https://blog.boll.ch/fortios-7-6-5-what-you-should-know-about-the-new-mature-release/
- https://www.fortiguard.com/psirt/FG-IR-26-060
- https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/299518/how-the-fortigate-firmware-license-works
- https://community.fortinet.com/fortigate-3/technical-tip-how-to-view-license-details-via-cli-and-gui-95031
- https://docs.fortinet.com/upgrade-tool
- https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/799879
- https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/230510/changes-in-default-behavior
- https://community.fortinet.com/fortigate-3/technical-tip-enforcing-forticare-registration-starting-from-v7-2-11-v7-4-8-v7-6-5-v8-0-0-199927
- https://community.fortinet.com/fortigate-3/technical-tip-advpn-vpn-wizard-compatibility-limitations-between-fortios-v7-4-and-v7-6-218221
- https://community.fortinet.com/fortigate-3/technical-tip-ipsec-dial-up-tunnel-using-ikev2-with-fortitoken-2fa-for-local-users-201395
