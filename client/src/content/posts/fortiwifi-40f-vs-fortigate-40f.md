
## The problem

You are choosing between a FortiGate 40F and a FortiWiFi 40F for a small office, a branch or a homelab, and you want to know what the built-in radio changes in power, ports and software limits. The two models have the same dimensions and nearly all of the same rated numbers, so the difference sits in a few rows of the spec table. The rows that matter are the radio, the power and heat figures, and three limits that are listed with different values.

## The ports and processor are the same on both models

Both units have five gigabit RJ45 ports: one WAN port, three internal Ethernet ports and one FortiLink port. Each also has a USB port for a compatible third-party 3G/4G modem, which [Forti1](https://forti1.com/en/fortinet/fortigate/fortigate-40f/) describes as additional WAN connectivity, plus an RJ45 console port. The [FortiGate 40F data sheet from Fortinet](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-40f-series.pdf) lists these interfaces for the FortiGate 40F, and the [AV Firewalls spec table](https://www.avfirewalls.com/fortigate-40f.asp) repeats the same values in both model columns.

The processor is the same on both. [AV Firewalls](https://www.avfirewalls.com/fortigate-40f.asp) names it "Secure SD-WAN ASIC SOC4" under its hardware section, and [Firewalls.com](https://www.firewalls.com/blog/fortigate-40f/) calls it "Fortinet's SoC4 SD-WAN ASIC processor." No listing gives a separate processor for the wireless model. Fortinet's [QuickStart Guide](https://fortinetweb.s3.amazonaws.com/docs.fortinet.com/v2/attachments/fd70142f-ff2f-11e9-8977-00505692583a/FG-FWF-40F-60F-Series-QSG.pdf) covers FG-40F-3G4G and FWF-40F-3G4G as separate models, which is the option if you need a modem in the box, and the [3G4G data sheet](https://cdn.blueally.com/avfirewalls/datasheets/fortigate/fortigate-fortiwifi-40f-3g4g-new2022.pdf) lists the same two model names. [Firewalls.com](https://www.firewalls.com/blog/fortigate-40f/) summarizes the series as "Compact. Fanless. Affordable. Secure."

## The FortiWiFi adds a radio that the FortiGate lacks

The FortiWiFi 40F, sold as FWF-40F, adds a radio that the FortiGate 40F does not have. [Corporate Armor](https://www.corporatearmor.com/brand-detail/fortinet-featured/fortigate-fortiwifi-40f-series/) lists its wireless as "Wireless (802.11a/b/g/n/ac-W2)". [ServNet UK's comparison](https://www.servnetuk.com/compare/vs/fortigate-fg-40f-next-generation-firewall/fortigate-fgr-60f-rugged-firewall/fortigate-fortiwifi-fwf-60f-wireless-firewall) shows "Integrated Wi-Fi" as "No" on the plain 40F. The AV Firewalls table describes a single radio on 2.4 GHz and 5 GHz with 3x3 MU-MIMO, and it does not list separate radios for each band. Its "Maximum Wi-Fi Speeds" row reads "1300 Mbps @ 5 GHz, 450 Mbps @ 2.4 GHz." Those are labeled maximums, so do not plan client throughput from them.

The QuickStart Guide lists "3x WiFi Antennas (WiFi models only)" in its package contents, so the wired unit ships without them.

| Attribute | FortiGate 40F (FG-40F) | FortiWiFi 40F (FWF-40F) |
|---|---|---|
| GE RJ45 ports | 5: 1 WAN, 3 internal, 1 FortiLink | Same |
| USB | 1 | 1 |
| Wireless interface | None | Single radio, 2.4 GHz and 5 GHz, 802.11 a/b/g/n/ac-W2 |
| MU-MIMO | None | 3x3 |
| Maximum Wi-Fi speeds | None | 1300 Mbps at 5 GHz, 450 Mbps at 2.4 GHz |
| Power, average / maximum | 7.74 W / 9.46 W | 14.6 W / 16.6 W |
| Heat dissipation | 52.55 BTU/hr | 56.64 BTU/hr |
| Processor | Secure SD-WAN ASIC SOC4 | Same |

## Power and heat are the clearest hardware difference

The power and heat rows are split by model, so they are the clearest difference after the radio. The FortiGate 40F draws 7.74 W on average and 9.46 W at maximum. The FortiWiFi 40F draws 14.6 W on average and 16.6 W at maximum, and it dissipates 56.64 BTU/hr against 52.55 BTU/hr for the wired unit. Both list an input rating of 12Vdc, 3A, and both measure 1.5 x 8.5 x 6.3 inches, so the difference is in the draw, not the adapter or the footprint.

The FortiWiFi power and heat figures come from the [AV Firewalls table](https://www.avfirewalls.com/fortigate-40f.asp) and the [FortiGate/FortiWiFi 40F Series data sheet](https://cdn.blueally.com/avfirewalls/datasheets/fortigate/fortigate-fortiwifi-40f-series-new.pdf), which carries the same values. Fortinet's own [FortiGate 40F data sheet](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-40f-series.pdf) has a specification table with only FortiGate 40F and 40F-3G4G columns, so it does not list the FortiWiFi draw. For the cellular model it gives 15.8 W and 18.6 W, and that model has no wireless interface.

## Throughput is shared, and three limits disagree

The rated throughput is identical on both models. The firewall rows are labeled as UDP packet tests at 1518, 512 and 64 bytes, so they describe UDP traffic at those sizes. The spec table lists 5/5/5 Gbps of firewall throughput, 1 Gbps of IPS, 800 Mbps of NGFW, 600 Mbps of threat protection, 310 Mbps of SSL inspection, 4.4 Gbps of IPsec VPN at 512 bytes, and 490 Mbps of SSL VPN. It also lists 700,000 concurrent TCP sessions, 35,000 new TCP sessions per second, 200 gateway-to-gateway IPsec tunnels, 250 client-to-gateway tunnels and 8 supported FortiSwitches. The IPsec figure is labeled as a 512-byte test, so read it as that packet size rather than as a general VPN rating. If you inspect HTTPS, compare the 310 Mbps SSL inspection figure with your uplink, because it sits far below the 5 Gbps firewall rating.

Three limits are listed with different values. Forti1 gives firewall throughput as "up to 4 Gbps" in its performance text, while the AV Firewalls table and Fortinet's data sheet give 5 Gbps. AV Firewalls lists 5,000 firewall policies, and Fortinet's FortiGate 40F data sheet lists 2,000. Firewalls.com lists 10 FortiAPs total and 5 in tunnel mode in a post dated February 10, 2020, while AV Firewalls and Fortinet's data sheet list 16 and 8.

## The software limits apply to both models

The radio does not change two FortiOS limits that matter for remote access and inspection. FortiOS 7.4.4 no longer supports proxy-related features on models with 2 GB of RAM or less. Fortinet's [7.4.4 release notes](https://docs.fortinet.com/document/fortigate/7.4.4/fortios-release-notes/768039/2-gb-ram-fortigate-models-no-longer-support-fortios-proxy-related-features) say "This change impacts the FortiGate/FortiWiFi 40F, 60E, 60F, 80E, and 90E series devices," along with their variants. Because the change starts with 7.4.4, check any policy that depends on a proxy feature before you move a unit to that release.

The [7.6.0 release notes](https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/877104/ssl-vpn-removed-from-2gb-ram-models-for-tunnel-and-web-mode) name "FGT-40F/FWF-40F and variants" among the models that lose SSL VPN web and tunnel mode. The note says, "On FortiGate models with 2GB of RAM or below, the SSL VPN web and tunnel mode feature will no longer be available." To check your unit, run:

```
diagnose hardware sysinfo conserve
```

Fortinet's note says to check that the total RAM value is below 2000 MB. For the licensing side of a used unit, see [FortiGate Homelab License: What Works Without a Contract](/blog/fortigate-homelab-license).

## Which one fits a homelab or small office

A homelab that runs [VLANs](/blog/vlan-segmentation-guide) and a few virtual machines behind a wired switch gets nothing from the radio, so the FortiGate 40F is the cleaner choice there. An always-on lab draws the average figure around the clock, so the gap between 7.74 W and 14.6 W is the number that matters for it. A small office that wants one box to serve staff and guests, without a separate access point, is where the FortiWiFi 40F earns its extra power draw.

A firewall does not have to be a dedicated appliance: the Pentium III PC in the photo above runs pfSense as a router. For a lab setup, see [Running a FortiGate Firewall in a Homelab](/blog/fortigate-firewall-homelab).

## What breaks

**Your battery backup is sized for the wired model.** The FortiWiFi 40F draws 14.6 W on average and 16.6 W at maximum, against 7.74 W and 9.46 W for the FortiGate 40F, so a sizing sheet built on the wired figures leaves the radio model short. Fix: size for 16.6 W, and check the FortiWiFi row on the [FortiGate/FortiWiFi 40F Series data sheet](https://cdn.blueally.com/avfirewalls/datasheets/fortigate/fortigate-fortiwifi-40f-series-new.pdf) before you buy, because Fortinet's FortiGate 40F data sheet has no FortiWiFi column.

**SSL VPN web and tunnel mode stop on a 2 GB unit.** Fortinet's 7.6.0 release notes remove them on models with 2GB of RAM or less, and that covers the FWF-40F as well as the FG-40F. Fix: run `diagnose hardware sysinfo conserve`, stay below 7.6.0 if you need those modes, and plan remote access around that limit before you upgrade.

**The FortiAP limit is listed two ways.** Firewalls.com lists 10 total and 5 in tunnel mode, while AV Firewalls and Fortinet's data sheet list 16 and 8. Fix: plan around 16 total and 8 in tunnel mode, the figures in [Fortinet's FortiGate 40F data sheet](https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-40f-series.pdf).

**Firewall policies are listed two ways.** AV Firewalls lists 5,000, while Fortinet's FortiGate 40F data sheet lists 2,000. Fix: plan around 2,000 policies, the vendor figure, and build your rule count from that number.

**Firewall throughput reads as "up to 4 Gbps" on Forti1.** Forti1's performance text says "up to 4 Gbps," while the AV Firewalls table and Fortinet's data sheet give 5 Gbps. A sizing sheet can carry either number. Fix: use the 5 Gbps value, which matches Fortinet's data sheet.

**The wireless rows are maximums, not client speeds.** The 1300 Mbps and 450 Mbps figures are labeled "Maximum Wi-Fi Speeds," so they do not describe what a client gets across a room. Fix: size the wireless side from throughput you measure in your own space, not from the table row.

## What this means

Pick the FortiGate 40F if access points or a separate wireless system handle your Wi-Fi. The wired unit draws less power and has the same ports, processor and rated throughput. Pick the FortiWiFi 40F if one box must provide wireless for a small set of clients and you can budget for 16.6 W at maximum.

Whichever you choose, check the FortiWiFi power row on the series data sheet before you buy, since Fortinet's FortiGate 40F data sheet does not carry it. The FortiGate 40F data sheet lists 16 FortiAPs total and 8 in tunnel mode. If you buy a used unit, check the RAM before you rely on SSL VPN, because a 2 GB unit loses web and tunnel mode on 7.6.0 and later, whichever Wi-Fi model you pick. If you are also weighing the 60F, the [60E to 60F migration guide](/blog/fortigate-60e-to-60f-migration) covers that move.

## References

- https://www.fortinet.com/content/dam/fortinet/assets/data-sheets/pdf/fortigate-fortiwifi-40f-series.pdf
- https://cdn.blueally.com/avfirewalls/datasheets/fortigate/fortigate-fortiwifi-40f-series-new.pdf
- https://cdn.blueally.com/avfirewalls/datasheets/fortigate/fortigate-fortiwifi-40f-3g4g-new2022.pdf
- https://www.avfirewalls.com/fortigate-40f.asp
- https://forti1.com/en/fortinet/fortigate/fortigate-40f/
- https://www.firewalls.com/blog/fortigate-40f/
- https://www.servnetuk.com/compare/vs/fortigate-fg-40f-next-generation-firewall/fortigate-fgr-60f-rugged-firewall/fortigate-fortiwifi-fwf-60f-wireless-firewall
- https://www.corporatearmor.com/brand-detail/fortinet-featured/fortigate-fortiwifi-40f-series/
- https://docs.fortinet.com/document/fortigate/7.4.4/fortios-release-notes/768039/2-gb-ram-fortigate-models-no-longer-support-fortios-proxy-related-features
- https://docs.fortinet.com/document/fortigate/7.6.0/fortios-release-notes/877104/ssl-vpn-removed-from-2gb-ram-models-for-tunnel-and-web-mode
- https://fortinetweb.s3.amazonaws.com/docs.fortinet.com/v2/attachments/fd70142f-ff2f-11e9-8977-00505692583a/FG-FWF-40F-60F-Series-QSG.pdf
