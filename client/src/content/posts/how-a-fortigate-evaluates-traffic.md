## What this explains, and which release

This explainer follows one new connection through a FortiGate, Fortinet's firewall product line, in the order Fortinet's public documentation describes it: policy match, inspection mode, security profiles, Secure Sockets Layer and Transport Layer Security (SSL/TLS) inspection, and network address translation (NAT). It ends with the Security Fabric, which this article reads as context around the policy engine and not a stage inside it (that reading is the article's own, not a Fortinet statement). It is a reading of documentation. No device was tested.

Every behavior is pinned to FortiOS 7.6, the FortiGate operating system. The main source is the FortiOS 7.6.8 Administration Guide on docs.fortinet.com, the newest 7.6 release in the library's version list in November 2026. The list also showed 8.0.0 through 8.0.2, which were not read, so 8.0 is unchecked and behavior there may differ. The Best Practices pages cited carry a 7.6.0 header, defaults come from the 7.6.8 command-line interface (CLI) reference, and Fortinet Community tips, written for older releases, are labeled where used. Branch differences are in [FortiOS 7.6 vs 7.4](/blog/fortios-7-6-vs-7-4).

## The short version

A FortiGate is a stateful firewall. Traffic that starts a new connection is checked against the policy list in order, and the first policy that matches decides what happens. If none matches, the implicit deny drops it. Each session gets an entry in the session table, which the documentation says can show the number of the policy it matches, and that policy carries the remaining decisions: inspection mode, security profiles, SSL inspection and NAT. The session-table page describes the firewall as stateful, tracking sessions so that only packets consistent with the session state pass, which is why replies belong to an existing session.

| Question | Decided by | Default for a new policy in 7.6.8 |
|---|---|---|
| Is the traffic allowed? | First matching policy, else the implicit deny | Action is deny |
| How is content examined? | The policy's inspection mode | Flow-based |
| What is looked for? | Security profiles attached to the policy | None attached |
| Can encrypted content be read? | The policy's SSL inspection profile | no-inspection |
| Is the source address rewritten? | The policy's NAT setting, or the central source NAT table | NAT off |

## Step 1: matching a policy

### What a policy matches on

The Administration Guide lists seven match parameters: incoming interface, outgoing interface, source address, destination address, user identity, service and schedule. A service is a protocol and port definition. The guide contrasts it with application control, which examines packets to find the protocol actually in use. Traffic that matches no policy is denied.

Direction follows whoever starts the conversation, and each direction in which sessions can start needs its own policy. By default, FortiOS does not run a reverse-path check on reply traffic that matches an allowed session by its Internet Protocol (IP) tuple, so a reply may return on a different interface. The 7.6.7 release notes describe a setting, `src-check-reply` under `config system settings`, that "functions like strict Reverse Path Forwarding checks for reply packets"; its `disable` option is marked as the default. This article did not test it, and with it enabled a reply on a different interface may be checked and dropped. The session-table page adds that checking for a policy match is where features such as NAT, scanning and traffic shaping can be applied.

Routing matters before the match. The Policy match tool works only if the relevant route exists, and the sample trace in the packet-flow page prints the next-hop route lookup before the line that reports the matched policy. Software-defined wide area network (SD-WAN) rules are policy-routing options that pick a member link, so they sit on the routing side. [FortiGate SD-WAN configuration](/blog/fortigate-sdwan-configuration) covers that half.

### First match wins

Fortinet's Best Practices guide states it directly: "When traffic matches a policy, further policies are not processed." The graphical user interface (GUI) By Sequence view lists policies in the order they are checked, and the Interface Pair view groups the same policies by interface pair. A Policy match tool takes traffic parameters and highlights the matching policy, provided the route exists and the unit is not in transparent mode.

A broad rule above a narrow one makes the narrow one unreachable, which [firewall policy design](/blog/firewall-policy-design) treats at length. The documented exception involves virtual IPs (VIPs), the objects used for destination NAT. The Best Practices page says policies that include a VIP, or that have `match-vip` enabled, have priority over other policies. Its example is a deny policy listed first and an accept policy that uses a VIP as its destination: traffic from the denied source to the VIP is not blocked until `match-vip` is enabled on the deny policy. The setting exists only on deny policies, and the page says that in FortiOS 7.2.4 and later it is enabled by default in new deny policies, so an older deny is worth checking.

### The implicit deny

When no policy matches, traffic is dropped, and the Best Practices guide says not to override the implicit deny. The 7.6.8 CLI reference lists `fwpolicy-implicit-log`, under `config log setting`, with a default of disable, so the drops are silent unless logging is turned on. A Fortinet Community tip written for FortiGate 5.6 to 6.4 says enabling it can generate a large volume of logs and suggests a narrower explicit deny below the allow rules. A 2022 tip adds that traffic aimed at the FortiGate itself and blocked by the implicit deny is logged as local traffic, not forward traffic. That boundary is the subject of [local-in policies and trusted hosts](/blog/fortigate-local-in-policy-trusted-hosts).

## Step 2: inspection mode, flow or proxy

Each policy has an inspection mode, set with `inspection-mode` in the CLI. In 7.6.8, flow-based is the default for new policies and the recommended mode unless proxy-specific features are needed. Fortinet's definition is that flow-based inspection "takes a snapshot of content packets and uses pattern matching to identify security threats in the content." Proxy-based inspection instead reconstructs the content passing through and inspects the reconstruction.

- **Flow-based.** The whole file is not held. Packets are inspected one by one, but the last packet is held until the scan returns a verdict, so some buffering still happens. On a violation a reset packet goes to the receiver and the connection ends. Packets are otherwise unchanged.
- **Proxy-based.** The whole file, message or page is held until inspection finishes. On a violation the payload is dropped and a replacement message is sent.

Proxy mode has controls for the cost of holding content: size limits that block or ignore large files, and client comforting, which sends small portions of the payload during scanning so the receiving user does not time out. Features available only with proxy-based inspection include video filter, inline cloud access security broker (CASB), Internet Content Adaptation Protocol (ICAP), web application firewall (WAF), content disarm, SSL offloading, explicit web proxy and zero trust network access (ZTNA). The guide says most proxy features are not supported on models with 2 GB of memory or less.

## Step 3: security profiles

A security profile is a named object that says what to look for, and it does nothing until a policy references it. Fortinet's Best Practices guide puts the split this way: policies control what traffic is allowed where, and profiles define what to look for in it. In the CLI, `utm-status` must be enabled before profile fields apply. This sketch uses field names from the 7.6.8 CLI reference and profile names from the guide. It shows where each piece attaches and is not a tested configuration. Its service is HTTPS, and a service is matched by protocol and port, so the policy admits traffic on the ports the HTTPS service defines, not only traffic that is really Hypertext Transfer Protocol Secure (HTTPS). The application list `default` monitors all applications instead of blocking the ones that are not HTTPS, so another protocol on those ports can pass unless a profile blocks it. The interface names are placeholders.

```
config firewall policy
    edit 10
        set srcintf "lan"
        set dstintf "wan1"
        set srcaddr "all"
        set dstaddr "all"
        set action accept
        set schedule "always"
        set service "HTTPS"
        set inspection-mode flow
        set utm-status enable
        set ssl-ssh-profile "certificate-inspection"
        set av-profile "default"
        set webfilter-profile "default"
        set ips-sensor "default"
        set application-list "default"
        set nat enable
    next
end
```

The four main profile types, per the 7.6.8 pages:

- **Antivirus.** Flow-based by default, with `default` and `wifi-default` preloaded. It needs a FortiGuard Antivirus subscription, and definitions download only if at least one policy with an antivirus profile is enabled.
- **Web filter.** A content filter, a Uniform Resource Locator (URL) filter and FortiGuard categories, applied in the order URL filter, FortiGuard, content filter, script filter, then antivirus scanning. Preloaded: `default`, `monitor-all` and `wifi-default`.
- **Intrusion prevention system (IPS).** A sensor is a set of signatures and filters that defines what the IPS engine scans. Predefined sensors include `all_default`, `default` and `high_security`. Definitions download only if a policy uses an IPS profile, and Fortinet recommends tuning a sensor to its environment.
- **Application control.** Sensors choose an action for each recognized application, detected by IPS protocol decoders even on non-standard ports. Preloaded: `default` (which monitors all applications), `wifi-default` and `block-high-risk`. It needs a FortiGuard Application Control subscription.

The guide also describes a policy-based next-generation firewall (NGFW) mode, which allows applications and URL categories directly in policies and supports only flow-mode profiles. This article covers the profile-based mode.

## Step 4: SSL inspection

A profile can only read what the FortiGate can see. Fortinet describes SSL inspection as what lets antivirus, web filtering and email filtering apply to encrypted traffic. Each policy names an SSL/SSH (Secure Shell) inspection profile. The guide lists the preloaded `certificate-inspection`, `deep-inspection` and `no-inspection`, which are read-only and can be cloned, plus an editable `custom-deep-inspection`. With no security profile enabled a policy uses `no-inspection`, and once any profile is enabled the guide says to change it.

| Profile | What the FortiGate reads | Must clients trust the FortiGate's certificate authority (CA)? |
|---|---|---|
| `no-inspection` | Presumably nothing inside the TLS session (inferred from the name; the guide lists the profile without describing it) | Presumably no |
| `certificate-inspection` | Headers up to the SSL/TLS layer, not the content | Only to avoid warnings on HTTPS block pages |
| `deep-inspection` | The decrypted content | Yes |

### Certificate inspection

Fortinet positions certificate inspection for cases where scanning content is unwanted for privacy reasons but control over reachable sites is still wanted. The SSL/SSH profile has a setting that compares the Server Name Indication (SNI), the TLS extension in which a client names the server it wants (Request for Comments 6066), with the name fields of the certificate the server returns. One catch: when a web filter blocks an HTTPS page, the replacement page is served over HTTPS, and the guide says its certificate is signed by the FortiGate CA. Clients that do not trust that CA see a warning on the block page.

### Deep inspection and why clients must trust a CA

Deep inspection works by impersonation. The guide says the FortiGate poses as the recipient of the client's SSL session, decrypts the content, inspects it, then re-encrypts it and sends it to the real server. For its half of the conversation with the client, the FortiGate must present a certificate for the requested site that it signed itself, using a CA certificate from its own store. By default that is `Fortinet_CA_SSL`, and an uploaded CA can be chosen instead.

A client accepts a server certificate only if it chains to a CA the client already trusts, which the post on [TLS certificates](/blog/ssl-tls-certificates-explained) walks through. Browsers do not ship with `Fortinet_CA_SSL`, so the guide says they show an untrusted-certificate warning for each re-signed certificate until the CA is imported. The documented fix is to download the CA from the profile and install it in the client's trusted root store, with Windows group policy suggested for an Active Directory domain. The guide also says, "Never import the Fortinet_CA_Untrusted certificate into your browser," and ties lingering warnings to that second certificate. The profile page describes one option for server certificates that fail validation as re-signing the certificate as trusted and another as keeping it untrusted, which suggests that Fortinet_CA_Untrusted signs for the second case. That is an inference: the guide does not say so.

Two consequences follow, both reasoning from how certificate trust works, not claims from the guide. Clients that cannot be given the CA, such as unmanaged guest devices, are poor candidates for deep inspection. And a CA that clients trust can sign a certificate for any site, so its private key deserves the protection given to any internal root.

Traffic can be exempted by address, by FortiGuard web category or through an allowlist of reputable websites. The profile page says Finance and Banking, Health and Wellness and Personal Privacy are added to the exemption list by default, as the categories most likely to include applications that require a specific certificate.

## NAT in a policy

NAT is configured on or beside the matching policy, and the guide splits it into source NAT (SNAT) and destination NAT (DNAT).

- **Static SNAT.** Enabling NAT on a policy with the outgoing interface address rewrites the source to that address. The Static SNAT page counts 60,416 available port numbers for that one address, which it says can serve 60,416 internal addresses reaching the same service, defined as one protocol, destination address and destination port.
- **Dynamic SNAT.** An IP pool supplies the translated address. The guide describes four Internet Protocol version 4 (IPv4) pool types: overload, one-to-one (no port translation), fixed port range and port block allocation.
- **Central SNAT.** A separate rule table read from the top down until one matches, applied after a security policy. It is off by default, and when enabled the per-policy NAT option is skipped.
- **DNAT.** A VIP maps an external address to an internal one and is chosen as the policy's destination. This is the VIP whose priority over ordinary policies was described under first match.

One ordering question is left open on purpose. The Central SNAT page says its rules apply to traffic after a security policy, while the packet-flow page's sample trace prints the line that chooses the SNAT address and port before the line that reports the matched policy. The documentation does not reconcile the two, so this article makes no claim about the exact internal order. What the trace does show is that later packets of the same connection match the existing session and have SNAT applied, with no further policy line.

## The Security Fabric

Fortinet describes the Security Fabric as an architecture that "interconnects discrete security solutions into an integrated whole." The 7.6.8 guide names four visible parts: a topology view, security rating checks, fabric connectors for cloud and partner platforms, and automation that pairs an event trigger with actions.

For the evaluation path, the visible link is address objects. The `FABRIC_DEVICE` dynamic address group, which represents Fortinet devices connected to the Fabric, can be used as an address in firewall policies, and its contents fill in dynamically. None of the Fabric pages read describes it changing the match order or the inspection path, so this article reads it as shared context around the policy engine and not a stage in the per-packet decision. That is the article's reading, not a Fortinet statement, and the Fabric pages were read only at an introductory level. One capacity note: models with 2 GB of memory, including the 40F, 50G and 60F series, can authorize up to five devices as a Fabric root.

## Limits and common mistakes

- **A deny that misses a VIP.** Without `match-vip`, a deny policy can be outranked by a later policy that uses a VIP as its destination.
- **Policy changes and live sessions.** The default `firewall-session-dirty` setting, `check-all`, flags affected sessions for revalidation after a policy or routing change, and sessions that no longer conform are dropped. `check-new` applies changes to new sessions only.
- **Same-interface forwarding.** Starting in 7.6.5, `allow-traffic-redirect` is disabled by default, and the guide says it is disabled after an upgrade even if it was enabled before. Traffic leaving through its arrival interface then needs an IPv4 policy or it meets the implicit deny.
- **Port mapping differs by mode.** In deep inspection, protocol port mapping applies only to proxy-based inspection, and flow-based inspection scans all ports regardless.
- **Tracing offloaded sessions.** Flow debugging does not work for traffic offloaded to Fortinet's NP6 or NP7 processors, and the guide suggests testing with ping-style Internet Control Message Protocol traffic or disabling offload.

## Study notes

- List the seven policy match parameters from memory, then add the two stages outside them: routing before the match and the session table after it.
- Explain why a flow policy resets a connection while a proxy policy shows a replacement page.
- Predict what a client sees under each SSL profile when the CA is not installed.

## Sources

- [FortiOS 7.6.8 Administration Guide: Firewall policy](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/656084/firewall-policy)
- [Administration Guide: Inspection modes](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/721410/inspection-modes)
- [Administration Guide: Flow mode inspection](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/659145/flow-mode-inspection-default-mode)
- [Administration Guide: Proxy mode inspection](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/969330/proxy-mode-inspection)
- [Administration Guide: Inspection mode feature comparison](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/922096/inspection-mode-feature-comparison)
- [Administration Guide: Antivirus introduction](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/723287/antivirus-introduction)
- [Administration Guide: Web filter introduction](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/155426/web-filter-introduction)
- [Administration Guide: Intrusion prevention](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/565562/intrusion-prevention)
- [Administration Guide: Application control](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/302748/application-control)
- [Administration Guide: NGFW policy](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/243446/ngfw-policy)
- [Administration Guide: SSL & SSH Inspection](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/929997/ssl-ssh-inspection)
- [Administration Guide: Certificate inspection](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/505842/certificate-inspection)
- [Administration Guide: Deep inspection](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/122078/deep-inspection)
- [Administration Guide: Configuring an SSL/SSH inspection profile](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/709167/configuring-an-ssl-ssh-inspection-profile)
- [Administration Guide: Static SNAT](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/898655/static-snat)
- [Administration Guide: Dynamic SNAT](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/29961/dynamic-snat)
- [Administration Guide: Central SNAT](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/421028/central-snat)
- [Administration Guide: Destination NAT](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/728694/destination-nat)
- [Administration Guide: Using a session table](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/562859/using-a-session-table)
- [Administration Guide: Debugging the packet flow](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/54688/debugging-the-packet-flow)
- [Administration Guide: SD-WAN implicit rule](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/216765/implicit-rule)
- [Administration Guide: Fortinet Security Fabric](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/286973/fortinet-security-fabric)
- [Administration Guide: Dynamic policy, Fabric devices](https://docs.fortinet.com/document/fortigate/7.6.8/administration-guide/146433/dynamic-policy-fabric-devices)
- [Best Practices (7.6): Policies](https://docs.fortinet.com/document/fortigate/7.6.8/best-practices/862226/policies)
- [Best Practices (7.6): Policy configuration changes](https://docs.fortinet.com/document/fortigate/7.6.8/best-practices/54033/policy-configuration-changes)
- [CLI Reference 7.6.8: config firewall policy](https://docs.fortinet.com/document/fortigate/7.6.8/cli-reference/333889629/config-firewall-policy)
- [CLI Reference 7.6.8: config log setting](https://docs.fortinet.com/document/fortigate/7.6.8/cli-reference/196223761/config-log-setting)
- [FortiOS 7.6.7 Release Notes: New features or enhancements](https://docs.fortinet.com/document/fortigate/7.6.7/fortios-release-notes/743723/new-features-or-enhancements)
- [Fortinet Community: Implicit deny logs](https://community.fortinet.com/fortigate-3/technical-tip-implicit-deny-logs-96617)
- [Fortinet Community: Unable to see implicit deny logs](https://community.fortinet.com/fortigate-3/troubleshooting-tip-unable-to-see-implicit-deny-logs-119638)
- [RFC 6066: Server Name Indication](https://www.rfc-editor.org/rfc/rfc6066.txt)
