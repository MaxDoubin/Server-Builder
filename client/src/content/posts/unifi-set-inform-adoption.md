
## The short answer

Running `set-inform http://<host>:8080/inform` over SSH on a factory-default UniFi device points it at a Network application that automatic discovery cannot reach, such as one on another subnet, VLAN or site. Ubiquiti's [Layer 3 adoption article](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3) states one requirement for remote adoption: unrestricted TCP 8080 between the device and the application. Its [Device Adoption article](https://help.ui.com/hc/en-us/articles/360012622613-UniFi-Device-Adoption) gives `set-inform` as the step to try when a device on a different VLAN or subnet does not appear. Ubiquiti's [SSH article](https://help.ui.com/hc/en-us/articles/204909374-Connecting-to-UniFi-with-Debug-Tools-SSH) lists `ui` / `ui` for new access points and switches, `ubnt` / `ubnt` on older ones, and `root` for gateways and consoles. To skip SSH, hand out the address with [DHCP option 43](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3): one field on a UniFi gateway, or hex on other DHCP servers, where `0104c0a8030a` means 192.168.3.10 and a block starting with `02` carries a full inform URL. A DNS A record named `unifi` works too, because a device that has not been pointed elsewhere still has the default inform URL, [http://unifi:8080/inform](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption). A device still owned by another application must be factory reset first, and Ubiquiti says the physical reset button [does not remove it](https://help.ui.com/hc/en-us/articles/205143490-How-to-Reset-UniFi-Devices-to-Factory-Defaults) from that application.

## What does set-inform do, and when do you need it instead of automatic discovery?

Adoption is the hand-off that puts a UniFi device under a Network application's control. On a shared network the device is discovered and listed as Pending Adoption. Ubiquiti's [Device Adoption article](https://help.ui.com/hc/en-us/articles/360012622613-UniFi-Device-Adoption) says that when a device does not appear, TCP 8080 and UDP 10001 must be open between the application host, the devices, and any gateways, firewalls or antivirus software in between. A [LinITX guide](https://blog.linitx.com/?p=3884) describes the same split: Layer 2 adoption uses self-discovery when the devices and the application are on the same network, and Layer 3 adoption over SSH is for an application at a remote location.

Remote adoption means telling the device where the application is. That address is the inform URL, the endpoint on TCP 8080 where device and application communicate, and a factory-default device uses `http://unifi:8080/inform`, per [HostiFi](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption). The `set-inform` command rewrites it. Layer 2 discovery is the default, and Ubiquiti's Layer 3 article covers the SSH, DHCP and DNS routes:

| Method | What it needs | Best for |
|---|---|---|
| Layer 2 discovery | Same network as the application, UDP 10001 and TCP 8080 | A flat home or small office network |
| `set-inform` over SSH | SSH access to the device, its login, TCP 8080 to the application | One device, or a remote site with no control of DHCP |
| DHCP option 43 | Control of the DHCP server for the device's VLAN | Many devices on a VLAN, or devices that reset |
| DNS name `unifi` | An A record the device's resolver can answer | Sites where DNS is easier to change than DHCP |

A fifth route, zero-touch provisioning, assigns a device to a site before it is unboxed. Ubiquiti's [ZTP article](https://help.ui.com/hc/en-us/articles/23954985107351-UniFi-Zero-Touch-Provisioning-ZTP-and-Device-Replacement) lists UniFi Network 8.2.71 or later, UniFi OS 4.0 or later and a supported device, which includes several U7 models, the E7 family and the UDB line. Ubiquiti's [Layer 3 article](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3) also says a device cycles through every inform option it has, ZTP code included, and the first one to resolve and respond adopts it. A stale DNS record or DHCP option can therefore pull a device toward an old application.

Adoption governs management only: per Ubiquiti's [self-hosting article](https://help.ui.com/hc/en-us/articles/34210126298775-Self-Hosting-UniFi), devices of an offline self-hosted UniFi OS Server continue to run on their last available configuration. The [enterprise vs consumer Wi-Fi](/blog/enterprise-wifi-vs-consumer) article covers the management and data plane split.

## Which SSH username and password does a factory-default UniFi device accept?

Ubiquiti's [SSH article](https://help.ui.com/hc/en-us/articles/204909374-Connecting-to-UniFi-with-Debug-Tools-SSH) gives the defaults before setup or adoption. Third-party guides differ on some of them, and Ubiquiti's own list separates older hardware from newer.

| Device class | Ubiquiti's default | Other guides |
|---|---|---|
| Access points and switches | `ui` / `ui`; `ubnt` / `ubnt` on older hardware | [HostiFi](https://www.hostifi.com/support/unifi-ssh-commands-guide): older AP firmware is `ubnt` / `ubnt`, some newer devices `ui` / `ui` |
| Gateways and consoles | `root` / `ui`; `root` / `ubnt` on older hardware | HostiFi: UXG models are `root` / `ubnt`. [Unihosted](https://www.unihosted.com/blog/how-to-set-inform-in-unifi-a-guide): gateways take `root` with `ui` or `ubnt` |

SSH is on by default for network devices. On consoles it is off until you enable it under Settings > Control Plane > Console, per the same Ubiquiti article.

```bash
ssh ui@192.168.20.45
```

Replace the address with the device's DHCP lease, and use `ubnt@` or `root@` where the table says so. The defaults apply only to a device that has never been adopted or has been reset. A login that fails on a unit you believe is new points to an earlier adoption, and the reset section below covers that case. The admin workstation also needs TCP 22 to the device, which Unihosted lists among the [ports to open](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks), so check the firewall between the two VLANs. A [VLAN segmentation](/blog/vlan-segmentation-guide) design that blocks management traffic by default will block this too.

## How do you run set-inform, and why do some guides say to run it twice?

Connect over SSH, run the command with the application's address, then read the result with `info`.

```bash
ssh ui@192.168.20.45
set-inform http://192.168.3.10:8080/inform
info
```

HostiFi says the URL ["must start with http:// and end with :8080/inform"](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption), and that `info` displays the URL the device is set to use, per its [SSH commands guide](https://www.hostifi.com/support/unifi-ssh-commands-guide). Ubiquiti's [Layer 3 article](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3) accepts an IP address or a fully qualified domain name in the URL. HostiFi recommends the server's DNS name rather than its IP address, in which case the name must resolve from the device's VLAN. Unihosted gives the readings to look for in `info` output:

| Status in `info` | Meaning, per Unihosted |
|---|---|
| `Status: Connected` | The device reaches the application |
| `Status: Timeout` | A firewall is blocking TCP 8080, or the URL has a typo |
| `Status: Server Reject` | Same two suspects |

Once the device appears in the application, click Adopt. Guides split on repetition. Unihosted's [troubleshooting guide](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks) says to run the command twice: "First time tells the device where to go, second time confirms and saves it." A [LinITX guide](https://blog.linitx.com/?p=3884) from September 2021 runs it once and repeats the set-inform and Adopt steps only if the device has not appeared after 10 to 15 minutes. Ubiquiti's [Device Adoption article](https://help.ui.com/hc/en-us/articles/360012622613-UniFi-Device-Adoption) says that for a device on a different VLAN or subnet the command may need to be repeated after the device appears in UniFi. The sequence that satisfies all three is to run it, adopt, read `info`, and run it again if the status is not Connected.

The setting may not stick. A February 2024 post on the [Lawrence Systems forum](https://forums.lawrencesystems.com/t/unifi-l3-persistent-inform-url/20405) reported that adopted devices went back to the default inform URL after an update or reboot. The poster relayed UniFi support saying that any configuration applied over SSH "may vanish after reboot" and that DHCP option 43 is strongly recommended for Layer 3 adoption. A poster named LTS_Tom said he had never had a problem with set-inform on switches and APs. A later poster reported devices falling back to `unifi:8080/inform` after a reboot and said the inform host override was already set to the controller's address. Those reports conflict and none confirms a fix, so for more than a handful of devices use option 43 or DNS and treat `set-inform` as the manual override.

One more setting controls what devices learn after adoption. The application can push its own inform address to every adopted device: Ubiquiti's [migration article](https://help.ui.com/hc/en-us/articles/360008976393-Backups-and-Migration-in-UniFi) enables the Override Inform Host toggle and enters the new console's IP, and the [LinuxServer documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/) says to set the Inform Host to "a hostname or IP address accessible by your devices", warning that the menu location moves between releases. The [jacobalberty unifi-docker README](https://github.com/jacobalberty/unifi-docker) says that for a container you "MUST" override the Inform Host IP with the Docker host's address, because the container usually gets an internal 172.17.x.x address. It also offers a `SYSTEM_IP` environment variable as one way to set it.

## How do DHCP option 43 and the unifi DNS name adopt devices on another subnet or VLAN?

DHCP option 43 is the vendor-specific information option. [RFC 2132](https://www.rfc-editor.org/rfc/rfc2132) defines it as code 43 with a minimum length of 1, "an opaque object of n octets." A vendor that encodes several items inside it should use a sequence of code, length and value fields with no magic cookie, and code 255, if present, marks the end of the encapsulated items. The sub-option codes are left to the vendor. Ubiquiti's hex format fits that layout: `01` is its code for the application's IPv4 address, `04` is the length, and four address octets follow.

On a UniFi gateway, the setting is a field named Option 43 Application Host Address in the network's settings, where the IP address of the remote Network application goes, per Ubiquiti's [Layer 3 article](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3) and the [UniFi support reply](https://forums.lawrencesystems.com/t/unifi-l3-persistent-inform-url/20405) quoted on the Lawrence Systems forum. Third-party DHCP servers need the hex. Ubiquiti's article gives two forms and says they can be joined in one value for redundancy, with the IP portion first. Unihosted says option 43 [can only be used with an IP address](https://www.unihosted.com/blog/how-to-set-inform-in-unifi-a-guide) and that a hostname is not allowed. That sits oddly with Ubiquiti's `02` form, which carries a full URL as text, so the IP form is the safe choice and the URL form is worth testing before relying on a hostname in it.

| Form | Bytes | Hex for 192.168.3.10 | Layout |
|---|---|---|---|
| IP address | 6 | `0104c0a8030a` | `01`, length `04`, four address octets |
| Inform URL | 33 | `021f687474703a2f2f3139322e3136382e332e31303a383038302f696e666f726d` | `02`, length `1f`, the URL as ASCII |
| Both | 39 | the IP block followed by the URL block, no separators | Redundancy |

The `0104c0a8030a` example and the `02` plus `1f` length byte come from [Ubiquiti's Layer 3 article](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3). The URL `http://192.168.3.10:8080/inform` is 31 characters, which is `1f`, so the URL form is 2 header bytes plus 31 for 33 bytes, and the combined value is 6 plus 33 for 39 bytes. A short script produces all three strings without hand conversion, and the [base converter](/tools/base-converter) checks a single byte.

```python
import ipaddress
ip = ipaddress.ip_address("192.168.3.10").packed
url = b"http://192.168.3.10:8080/inform"
sub1 = bytes([1, len(ip)]) + ip
sub2 = bytes([2, len(url)]) + url
print(sub1.hex(), sub2.hex(), (sub1 + sub2).hex(), sep="\n")
```

Some servers want the pairs separated by colons, such as `01:04:c0:a8:03:0a`. The ISC DHCP server builds option 43 from a vendor option space, so the IP form translates into sub-option 1 with an `ip-address` type. ISC's [option documentation](https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcp-options) shows the `option space` and `vendor-option-space` statements and says regular scoping rules apply. ISC's examples do not cover UniFi, so the block below applies ISC's syntax to Ubiquiti's sub-option 1 layout, and the check below confirms the result.

```
option space ubnt code width 1 length width 1 hash size 3;
option ubnt.unifi-address code 1 = ip-address;

subnet 192.168.20.0 netmask 255.255.255.0 {
  range 192.168.20.100 192.168.20.200;
  vendor-option-space ubnt;
  option ubnt.unifi-address 192.168.3.10;
}
```

For dnsmasq, the [man page](https://www.thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html) lists colon-separated hex digits as a data type for `--dhcp-option`, so the raw form is a single line. The same page says `--dhcp-option-force` works the same way except that the option is always sent, even if the client does not ask for it in its parameter request list. As with ISC, the documentation does not mention UniFi, so confirm the result with the check below.

```
dhcp-option=43,01:04:c0:a8:03:0a
```

Confirm the server really sends it before blaming the device. A poster on the OpenWrt forum used nmap's `broadcast-dhcp-discover` script to read the value back, which printed `Vendor Specific Information: 0104C0A80002`. That [thread](https://forum.openwrt.org/t/dhcp-option-43-vendor-specific-information-and-unifi-ap/101648) never confirmed an adoption, so the output proves only that the option was on the wire. The [Nmap documentation](https://nmap.org/nsedoc/scripts/broadcast-dhcp-discover.html) says the script uses a fixed MAC address by default and needs a privileged user, so a server that filters option 43 by MAC address or client class may answer differently than it does for a real device. Run it from a host on the same VLAN as the device:

```bash
sudo nmap --script broadcast-dhcp-discover
```

A capture of the DHCP Offer and ACK shows the same bytes, and the [packet capture](/blog/troubleshooting-packet-captures) article covers where to take one.

DNS needs no vendor option at all. Ubiquiti's Layer 3 article has a DNS method in which the DNS server is configured so that a name resolves to the remote Network installation, and Unihosted says a [factory-reset device always searches](https://www.unihosted.com/blog/how-to-set-inform-in-unifi-a-guide) for a hostname called exactly `unifi`. Check the record from a host on the device's VLAN with `nslookup unifi`, and read the [DNS fundamentals](/blog/dns-fundamentals-infrastructure) article if the answer depends on a search domain. Stale entries cause trouble with both methods: Unihosted's [troubleshooting guide](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks) lists a leftover option 43 or DNS override as a cause of a device reverting to an old controller, which fits the first-to-respond behavior above.

For a site across the internet, use the application's public address or hostname with the same `:8080/inform` form. Ubiquiti's Layer 3 article says a controller behind a remote gateway with a public IP needs TCP 8080 forwarded to it, and that the method will not work when that gateway has a private address, which is double NAT. Ubiquiti's answer to that case is to contact the ISP.

## Which ports must be open between the device and the Network application?

Ubiquiti's [Required Ports Reference](https://help.ui.com/hc/en-us/articles/218506997-Required-Ports-Reference) says that in a full UniFi deployment with native gateways these ports are opened automatically, so the table matters on self-hosted servers, third-party gateways and restrictive firewalls. Ubiquiti lists TCP 8080 as ingress to the application.

| Port | Purpose | Where it comes from |
|---|---|---|
| TCP 8080 | Device and application communication (the inform endpoint) | Ubiquiti's port reference; the one requirement in the Layer 3 article |
| UDP 10001 | Device discovery during adoption | Ubiquiti's port reference; named with TCP 8080 in the Device Adoption article |
| UDP 3478 | STUN, used for device adoption and communication | Ubiquiti's port reference; named with TCP 8080 as an example in the self-hosting article |
| TCP 8443 | Application web GUI and API | Ubiquiti's port reference |
| TCP 6789 | UniFi mobile speed test | Ubiquiti's port reference |
| TCP 22 | SSH from the admin workstation to the device | [Unihosted's list](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks) |

For containers, the [LinuxServer documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/) adds two optional ports: UDP 1900 for the setting that makes the controller discoverable on the local network, and UDP 5514 for remote syslog. The [jacobalberty unifi-docker README](https://github.com/jacobalberty/unifi-docker) says a minimal installation requires 8080, 8443, 3478 and 10001 to be exposed.

For a Layer 3 deployment, Ubiquiti's remote adoption article names one requirement, TCP 8080 between the device and the application. Ubiquiti's port reference also lists UDP 3478 for adoption and communication, so a rule that includes it matches the reference. UDP 10001 is the discovery port that the Device Adoption article ties to a device appearing as Pending Adoption, the same-network case that `set-inform` bypasses. Write the rule as a narrow allow from the management VLAN to the application's address, and use the [port reference tool](/tools/port-reference) to confirm the well-known services on the others.

## Why does a device stay on Adopting or show Adoption Failed, and how do you factory reset it?

These are the causes that Ubiquiti and the hosting guides document, ordered by how quickly each can be checked.

| Symptom | Likely cause | Fix |
|---|---|---|
| Never appears as Pending Adoption | Different VLAN, or TCP 8080 and UDP 10001 blocked | Open them on the same network, or use set-inform, option 43 or DNS |
| `info` shows `Timeout` or `Server Reject` | Firewall on TCP 8080, or a typo in the URL | Test from the device's VLAN, fix the URL |
| Pending Adoption (Update Required) loops | The device needs newer firmware and the Adopt and Upgrade button fails | Update manually over SSH, per [HostiFi](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption) |
| Managed by Other, or refuses adoption | Still bound to another application | Factory reset, or reassign it |
| Adopts, then goes offline | Wrong inform host pushed (typical for containers), or fallback to the default URL after reboot, per [owner reports](https://forums.lawrencesystems.com/t/unifi-l3-persistent-inform-url/20405) | Correct Override Inform Host; use option 43 or DNS |
| Nothing works across sites | Double NAT at the remote gateway | Contact the ISP, per Ubiquiti |

For the firmware case, HostiFi links a guide to upgrading over SSH. The [LinITX guide](https://blog.linitx.com/?p=3884) runs `upgrade` followed by the download link from ui.com/download, and Unihosted [adds](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks) that firmware older than 3.x should be updated by hand and the device reset before retrying. Use the build that matches the model.

For Managed by Other, Ubiquiti's [reset article](https://help.ui.com/hc/en-us/articles/205143490-How-to-Reset-UniFi-Devices-to-Factory-Defaults) says the label appears when a device was managed by another instance, including after a console was factory restored. Its three options are to restore the console from a backup taken while the device was managed, factory restore the device and adopt it again, or reassign it through the UniFi Network mobile app, which only the account owner can do and only if they signed in while the device was still managed.

There are three ways to reset a device:

1. **Physical button.** Ubiquiti says to hold Reset for 5 to 10 seconds depending on the device, or until the LEDs show the restore has begun, with power connected throughout. Too short a hold reboots the device and too long enters TFTP Recovery Mode. On a PoE device, keep the switch port energized for the whole hold; the [PoE](/blog/power-over-ethernet-poe) article covers the power budget.
2. **Forget in the application.** Under the device's Manage section, Forget in UniFi Network unmanages the device and resets it to factory defaults, per Ubiquiti's [reset article](https://help.ui.com/hc/en-us/articles/205143490-How-to-Reset-UniFi-Devices-to-Factory-Defaults). The button alone [does not remove the device](https://help.ui.com/hc/en-us/articles/205143490-How-to-Reset-UniFi-Devices-to-Factory-Defaults) from the application it was adopted to, so a physically reset device can still be listed there.
3. **SSH.** The command HostiFi lists is `syswrapper.sh restore-default & set-default &`, described as resetting the UniFi device to its factory default settings. [HostiFi's adoption guide](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption) also suggests `set-default` when `info` still shows the default inform URL. The LinITX guide prefixes `sudo`. Afterward the factory defaults in the credentials table apply again.

```bash
syswrapper.sh restore-default
```

## Which SSH credentials apply after adoption, and where are they set?

Adopted devices stop using the factory defaults. Ubiquiti's SSH article says network devices take a random password, shown under UniFi Devices > Device Updates and Settings, in the Device SSH Settings menu, where Device SSH Authentication lives. Consoles and gateways use `root`, and a gateway that shares the Network application's password takes that one. Unihosted points to [the same menu](https://www.unihosted.com/blog/how-to-set-inform-in-unifi-a-guide) for previously adopted devices.

HostiFi describes the older location: credentials are set per site under Settings > System > Advanced > Device Authentication, and with several sites the passwords differ and are [generated and set automatically by the controller](https://www.hostifi.com/support/unifi-ssh-commands-guide). Menu paths vary by version, so search the settings for "Device Authentication" if the one above is missing. Forgetting a device in the application resets it, as described in the reset section above, so the defaults in the first table apply again.

Public keys go in the same area. Ubiquiti's [SSH keys article](https://help.ui.com/hc/en-us/articles/235247068-Adding-SSH-Keys-to-UniFi-Devices) gives Settings > System > Advanced > Device Authentication > SSH Keys and, in another step, Settings > Devices > Device Updates and Settings > Device SSH Settings, and says the private key must never be shared. The [SSH key authentication](/blog/ssh-key-based-authentication) article covers generating and restricting a key pair.

## Sources

- [Ubiquiti: Remote Adoption (Layer 3)](https://help.ui.com/hc/en-us/articles/204909754-Remote-Adoption-Layer-3)
- [Ubiquiti: Required Ports Reference](https://help.ui.com/hc/en-us/articles/218506997-Required-Ports-Reference)
- [Ubiquiti: UniFi - Device Adoption](https://help.ui.com/hc/en-us/articles/360012622613-UniFi-Device-Adoption)
- [Ubiquiti: Connecting to UniFi with Debug Tools & SSH](https://help.ui.com/hc/en-us/articles/204909374-Connecting-to-UniFi-with-Debug-Tools-SSH)
- [Ubiquiti: How to Reset UniFi Devices to Factory Defaults](https://help.ui.com/hc/en-us/articles/205143490-How-to-Reset-UniFi-Devices-to-Factory-Defaults)
- [Ubiquiti: UniFi Zero-Touch Provisioning (ZTP) and Device Replacement](https://help.ui.com/hc/en-us/articles/23954985107351-UniFi-Zero-Touch-Provisioning-ZTP-and-Device-Replacement)
- [Ubiquiti: Backups and Migration in UniFi](https://help.ui.com/hc/en-us/articles/360008976393-Backups-and-Migration-in-UniFi)
- [Ubiquiti: Self-Hosting UniFi](https://help.ui.com/hc/en-us/articles/34210126298775-Self-Hosting-UniFi)
- [Ubiquiti: Adding SSH Keys to UniFi Devices](https://help.ui.com/hc/en-us/articles/235247068-Adding-SSH-Keys-to-UniFi-Devices)
- [IETF: RFC 2132, DHCP Options and BOOTP Vendor Extensions](https://www.rfc-editor.org/rfc/rfc2132)
- [ISC: DHCP 4.4 manual pages, dhcp-options](https://kb.isc.org/docs/isc-dhcp-44-manual-pages-dhcp-options)
- [dnsmasq: manual page](https://www.thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)
- [Nmap: broadcast-dhcp-discover NSE script](https://nmap.org/nsedoc/scripts/broadcast-dhcp-discover.html)
- [HostiFi: UniFi SSH Commands Guide](https://www.hostifi.com/support/unifi-ssh-commands-guide)
- [HostiFi: Troubleshooting UniFi Cloud Adoption](https://www.hostifi.com/support/unifi-troubleshooting-unifi-cloud-adoption)
- [Unihosted: How to Set Inform in UniFi](https://www.unihosted.com/blog/how-to-set-inform-in-unifi-a-guide)
- [Unihosted: Troubleshooting Device Adoption Across Networks](https://www.unihosted.com/blog/troubleshooting-device-adoption-across-networks)
- [LinITX: How to Guide, Ubiquiti UniFi L3 SSH Connection and Adoption](https://blog.linitx.com/?p=3884)
- [LinuxServer.io: unifi-network-application documentation](https://docs.linuxserver.io/images/docker-unifi-network-application/)
- [GitHub: jacobalberty/unifi-docker README](https://github.com/jacobalberty/unifi-docker)
- [Lawrence Systems forum: UniFi L3 persistent inform URL](https://forums.lawrencesystems.com/t/unifi-l3-persistent-inform-url/20405)
- [OpenWrt forum: DHCP Option 43 (Vendor Specific Information) and Unifi AP](https://forum.openwrt.org/t/dhcp-option-43-vendor-specific-information-and-unifi-ap/101648)
