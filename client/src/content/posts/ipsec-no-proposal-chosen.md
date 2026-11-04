
## The short answer

NO_PROPOSAL_CHOSEN is IKEv2 notify type 14. It means the responder compared the SA payload it received with its own policy, found no suite with one acceptable transform of every type, and, as [RFC 7296](https://www.rfc-editor.org/rfc/rfc7296) requires, rejected every proposal. In IKE_SA_INIT no IKE SA exists afterward; in IKE_AUTH or CREATE_CHILD_SA the IKE SA survives and only the child SA (or the rekey) fails. The initiator's log usually says only that the notify arrived, while the responder's log lists both proposal sets: strongSwan prints "received proposals" and "configured proposals", FortiGate prints "incoming proposal" and "my proposal". Compare encryption with key length, PRF, integrity (absent with AES-GCM), Diffie-Hellman group, ESN and, for child SAs, the PFS group. Lifetimes are not negotiated, so a lifetime difference alone does not raise this error, and a PFS mismatch can stay hidden until the first rekey. A set built from [RFC 8247](https://www.rfc-editor.org/rfc/rfc8247) MUST-level algorithms that every platform below can express is AES-CBC with a 256-bit key, HMAC-SHA2-256, PRF_HMAC_SHA2_256 and group 14, with AES-GCM-16 (a SHOULD) as the AEAD option. Two documented upgrade traps: [FortiOS 7.6.5 changed the default DH groups](https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/230510/changes-in-default-behavior) from 14 and 5 to 20 and 21 for CLI configuration, and per [strongSwan's Windows notes](https://docs.strongswan.org/docs/latest/interop/windowsClients.html) the built-in Windows IKEv2 client proposes only modp1024 by default.

## What does NO_PROPOSAL_CHOSEN mean in IKEv2, and which exchange raised it?

RFC 7296 section 2.7 says "The responder MUST accept a single proposal or reject them all and return an error," and names that error NO_PROPOSAL_CHOSEN. The accepted suite "MUST contain exactly one transform of each type included in the proposal." The RFC's example of three ciphers and two integrity algorithms yields six acceptable combinations, so peers need one overlap per transform type, not identical lists. Section 3.10 defines the notify as "None of the proposed crypto suites was acceptable" and adds that it can serve as a "generic" Child SA error, including when a USE_TRANSPORT_MODE or IPCOMP_SUPPORTED notify is unacceptable. [WireGuard versus IPsec](/blog/wireguard-vs-ipsec-tunnels) covers why IPsec has this negotiation layer.

The type numbers below come from the [IANA IKEv2 registry](https://www.iana.org/assignments/ikev2-parameters/ikev2-parameters.xhtml).

| Exchange | Type | What it negotiates | What NO_PROPOSAL_CHOSEN does | Visible in a capture |
|---|---|---|---|---|
| IKE_SA_INIT | 34 | IKE SA algorithms, nonces, first Diffie-Hellman exchange | The exchange fails and no IKE SA exists | Yes, sent in the clear |
| IKE_AUTH | 35 | Identities, authentication, the first child SA (no key exchange payload) | The IKE SA is still created, the child SA is missing | No, encrypted |
| CREATE_CHILD_SA | 36 | New child SAs, rekeys of IKE and child SAs, optional PFS key exchange | The rekey or new child fails | No, encrypted |

RFC 7296 section 1.2 says "All messages following the initial exchange are cryptographically protected." It lists NO_PROPOSAL_CHOSEN among the IKE_AUTH errors that "do not prevent an IKE SA from being set up," and section 2.21.1 says that in IKE_SA_INIT "any error notification causes the exchange to fail." Because that notify is unauthenticated, the recipient "should continue trying for some time before giving up."

Vendor menus still say "phase 2." RFC 7296 calls the initial exchanges (IKE_SA_INIT and IKE_AUTH, the latter carrying the first child SA) "known in IKEv1 as Phase 1," so on an IKEv2 tunnel "phase 1" settings shape the IKE SA and "phase 2" settings shape child SAs. [RFC 9395](https://www.rfc-editor.org/rfc/rfc9395) (April 2023) deprecated IKEv1.

## How do you tell an IKE_SA_INIT mismatch from a child SA mismatch in the logs?

Read the responder first. Netgate's [IPsec log guide](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-logs.html) says that in its failed-connection examples the initiator "does not receive messages about specific items that do not match, so the responder logs are much more informative," because "it would be insecure to provide messages to a potential attacker that would give them information about how the tunnel is configured." RFC 7296 takes the same position in its INVALID_SYNTAX entry: "more detailed error information should be written to a console or log."

| Platform | Initiator sees | Responder logs |
|---|---|---|
| strongSwan, IKE_SA_INIT | "received NO_PROPOSAL_CHOSEN notify error", per [ike_init.c](https://github.com/strongswan/strongswan/blob/master/src/libcharon/sa/ikev2/tasks/ike_init.c) | "received proposals" and "configured proposals" at level 1, then "no acceptable proposal found" |
| strongSwan, child SA | "received NO_PROPOSAL_CHOSEN notify, no CHILD_SA built", per [child_create.c](https://github.com/strongswan/strongswan/blob/master/src/libcharon/sa/ikev2/tasks/child_create.c) | The same two dumps, or "no acceptable traffic selectors found" for a selector mismatch |
| FortiGate | "notify msg received: NO-PROPOSAL-CHOSEN" | "incoming proposal:" and "my proposal, gw NAME:" lines, then "no proposal chosen" |
| pfSense | The strongSwan strings above, because pfSense writes a strongSwan [swanctl.conf](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-connections.html); Netgate's IKEv1 samples print "received NO_PROPOSAL_CHOSEN error notify" | The same two dumps, then "no proposal found" in Netgate's samples, at Status > System Logs, IPsec tab |

In current strongSwan source, [proposal.c](https://github.com/strongswan/strongswan/blob/master/src/libstrongswan/crypto/proposal/proposal.c) logs both lists at level 1 when selection fails and each "no acceptable" transform line at level 2. FortiGate's wording comes from Fortinet's [no proposal chosen](https://community.fortinet.com/fortigate-3/troubleshooting-tip-no-proposal-chosen-negotiate-sa-error-202876) and [KE payload](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ipsec-vpn-down-due-to-mismatched-dh-group-in-ke-payload-208310) articles. A [February 2012 post on the strongSwan users list](https://lists.strongswan.org/pipermail/users/2012-February/002550.html) (strongSwan 4.6.1, a user report) shows an IKE_SA_INIT failure from the responder side, abridged here:

```text
charon: 05[CFG] selecting proposal:
charon: 05[CFG]   no acceptable DIFFIE_HELLMAN_GROUP found
charon: 05[CFG] received proposals: IKE:AES_CBC_128/HMAC_MD5_96/PRF_HMAC_MD5/MODP_1536
charon: 05[CFG] configured proposals: IKE:AES_CBC_128/HMAC_MD5_96/PRF_HMAC_MD5
charon: 05[IKE] received proposals inacceptable
charon: 05[ENC] generating IKE_SA_INIT response 0 [ N(NO_PROP) ]
```

The received proposal has MODP_1536 and the configured one has no group, so the group is the culprit. The poster reported that the tunnel came up once the IKEv2 connection was moved ahead of an IKEv1 one in `ipsec.conf`, and that editing the IKEv1 suite changed the "configured" dump. That dump shows what the responder actually compared, which may not be the connection being edited.

A capture can confirm the first exchange only. [Wireshark](/blog/wireshark-packet-analysis)'s [ISAKMP reference](https://www.wireshark.org/docs/dfref/i/isakmp.html) lists the fields `isakmp.exchangetype` and `isakmp.notify.msgtype`, which combine into `isakmp.exchangetype == 34 && isakmp.notify.msgtype == 14` for IKE_SA_INIT rejections (the [Wireshark filters](/tools/wireshark-filters) page has the syntax). IKE_AUTH and CREATE_CHILD_SA replies are encrypted.

## Which parameters must match, and which are never negotiated?

One value per transform type has to overlap. RFC 7296 section 3.3.3 sets which types each protocol needs.

| Transform type | IANA type | IKE SA | ESP child SA |
|---|---|---|---|
| Encryption (ENCR) | 1 | Mandatory | Mandatory |
| Pseudorandom function (PRF) | 2 | Mandatory | Not used |
| Integrity (INTEG) | 3 | Mandatory with non-AEAD ciphers | Optional, absent with AEAD |
| Diffie-Hellman group | 4 | Mandatory | Optional, this is PFS |
| Extended sequence numbers (ESN) | 5 | Not used | Mandatory |

Several mismatches hide inside that table.

- **Key length.** RFC 7296 section 3.3.5 says transforms such as ENCR_AES_CBC must always carry a Key Length attribute, and "proposals not containing it MUST be rejected," so AES-128 and AES-256 are different offers. [RFC 8247](https://www.rfc-editor.org/rfc/rfc8247) keeps 192-bit keys at MAY.
- **AEAD versus classic.** [RFC 5282 section 8](https://www.rfc-editor.org/rfc/rfc5282) says an integrity algorithm "MUST NOT be selected" with an authenticated encryption algorithm. strongSwan's [proposal documentation](https://docs.strongswan.org/docs/latest/config/proposals.html) says AEAD and classic algorithms "must not be used in the same proposal," so offering both takes two proposals, and an AEAD proposal needs an explicit PRF.
- **PRF.** With classic ciphers, strongSwan derives the PRF from the integrity algorithm if none is configured. A Fortinet [debug excerpt](https://community.fortinet.com/fortigate-3/troubleshooting-tip-no-proposal-chosen-negotiate-sa-error-202876) shows both `AUTH_HMAC_SHA2_256_128` and `PRF_HMAC_SHA2_256` in one proposal.
- **ESN.** An initiator that supports ESN usually offers both values, and per RFC 7296 a single ESN transform with value 1 "means that using normal (non-extended) sequence numbers is not acceptable." strongSwan assumes `noesn` when neither keyword is set.

Lifetimes are not in the table because they are not negotiated. RFC 7296 section 2.8 says "in IKEv1 SA lifetimes were negotiated" but in IKEv2 each end enforces its own policy, and the shorter side "will end up always being the one to request the rekeying." Netgate's [connection guide](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-connections.html) states that "Lifetime mismatches do not cause a failure in phase 1 or phase 2." Defaults differ: strongSwan rekeys the IKE SA every 4 hours and a child SA every hour, per its [renewal docs](https://docs.strongswan.org/docs/latest/config/rekeying.html), and FortiOS uses `keylife` 86400 for phase 1 and `keylifeseconds` 43200 for phase 2, per the [7.4.2](https://docs.fortinet.com/document/fortigate/7.4.2/cli-reference/333620) and [7.6.5](https://docs.fortinet.com/document/fortigate/7.6.5/cli-reference/252893715) CLI references.

## How do FortiGate, pfSense, strongSwan, Cisco and Windows name the same algorithms and groups?

The IANA registry fixes the numbers, and each vendor picks its own label. The strongSwan column comes from its [proposal keyword tables](https://docs.strongswan.org/docs/latest/config/proposals.html), FortiOS from the 7.4.2 phase 1 reference above, and Windows from Microsoft's [Set-VpnConnectionIPsecConfiguration](https://learn.microsoft.com/en-us/powershell/module/vpnclient/set-vpnconnectionipsecconfiguration) page.

| IANA transform | strongSwan | FortiOS phase 1 | Windows cmdlet |
|---|---|---|---|
| ENCR_AES_CBC (12), 256-bit key | `aes256` | `aes256-sha256` (cipher and hash as one keyword) | `AES256` |
| ENCR_AES_GCM_16 (20), 256-bit key | `aes256gcm16` | `aes256gcm-prfsha256` | `GCMAES256` |
| AUTH_HMAC_SHA2_256_128 (12) | `sha256` | the `sha256` half of the keyword | `SHA256` for IKE, `SHA256128` for ESP |
| PRF_HMAC_SHA2_256 (5) | `prfsha256` | the `prfsha256` suffix on AEAD keywords | Not set separately |
| Group 14, 2,048-bit MODP | `modp2048` | `dhgrp 14` | `Group14`, PFS `PFS2048` |
| Group 19, 256-bit ECP | `ecp256` | `dhgrp 19` | `ECP256` |
| Group 20, 384-bit ECP | `ecp384` | `dhgrp 20` | `ECP384` |
| Group 31, Curve25519 | `x25519` | `dhgrp 31` | Not offered |

FortiOS phase 2 uses shorter names. strongSwan's [FortiGate interoperability page](https://docs.strongswan.org/docs/latest/interop/fortinet.html) pairs the phase 2 lines `set proposal aes128gcm aes256gcm aes128-sha256 aes256-sha256` and `set dhgrp 31 15 14` with `esp_proposals = aes128gcm16-aes256gcm16-x25519`. pfSense uses a GUI list, and its [phase 1 page](https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/configure-p1.html) says a GCM tunnel uses the hash "solely as a PRF."

[Cisco IOS](/blog/cisco-ios-fundamentals) XE takes `encryption`, `integrity` and `group` lines inside a `crypto ikev2 proposal`, which is used only once a policy references it, per Cisco's [IOS XE 17 guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_conn_ike2vpn/configuration/xe-17/sec-flex-vpn-xe-17-book/sec-cfg-ikev2-flex.html). The guide's smart-default proposal is AES-CBC-256, integrity and PRF SHA512 and SHA384, and groups 19, 14, 21 and 5. Another section says the default groups are 2 and 5, so trust `show crypto ikev2 proposal` on the live router. The ASA's `crypto ikev2 policy` takes `encryption`, `integrity`, `group`, `prf` and `lifetime seconds`.

Group sizes compare only within one family. [RFC 8247](https://www.rfc-editor.org/rfc/rfc8247) section 2.4 and the [IANA registry](https://www.iana.org/assignments/ikev2-parameters/ikev2-parameters.xhtml) give these ratings and sizes.

| Group | IANA size | RFC 8247 status |
|---|---|---|
| 1 | 768-bit MODP | MUST NOT |
| 2 | 1,024-bit MODP | SHOULD NOT |
| 5 | 1,536-bit MODP | SHOULD NOT |
| 14 | 2,048-bit MODP | MUST |
| 15 | 3,072-bit MODP | Not mentioned |
| 19 | 256-bit random ECP | SHOULD |
| 20, 21, 31 | 384-bit ECP, 521-bit ECP, Curve25519 | Not mentioned |

RFC 8247 rates the 256-bit group 19 above the 1,536-bit group 5, so a peer that offers only group 2 or 5 is offering what the standard discourages. Groups it does not mention "MAY be implemented," and [RFC 9395](https://www.rfc-editor.org/rfc/rfc9395) says such algorithms were left in a state of "MAY be used."

## How do INVALID_KE_PAYLOAD, TS_UNACCEPTABLE and AUTHENTICATION_FAILED differ?

Each points at a different layer of the negotiation.

| Notify | Type | Raised when | First check |
|---|---|---|---|
| NO_PROPOSAL_CHOSEN | 14 | No overlap in a transform type, or a "generic" child SA failure | The two proposal dumps |
| INVALID_KE_PAYLOAD | 17 | The initiator's key exchange group differs from the one the responder chose | The group the responder names |
| AUTHENTICATION_FAILED | 24 | IKE_AUTH authentication failed | PSK, IDs, certificates |
| TS_UNACCEPTABLE | 38 | The responder's policy accepts no part of the proposed traffic selectors | Subnets on both sides |

RFC 7296 section 3.10.1 lists all four, with the INVALID_KE_PAYLOAD rules in sections 1.2 and 1.3.1. **INVALID_KE_PAYLOAD** carries "the accepted Diffie-Hellman group number" in two octets, and the initiator "MUST again propose its full set of acceptable cryptographic suites" on the retry. Per strongSwan's [proposal documentation](https://docs.strongswan.org/docs/latest/config/proposals.html), it costs one extra round trip when the peers share a group but the initiator guessed another. If they share no group at all, the answer is NO_PROPOSAL_CHOSEN, as in the 2012 log above. Fortinet's [KE payload article](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ipsec-vpn-down-due-to-mismatched-dh-group-in-ke-payload-208310) shows `mismatched DH group in KE payload, selected 14, received 5` followed by `sending INVALID_KE notify`, and warns that the IKE debug "may not output the exact error due to a DH group," with a sample showing only `notify msg received: NO-PROPOSAL-CHOSEN`.

**TS_UNACCEPTABLE** is a policy answer about subnets, not algorithms. RFC 7296 section 2.9 says the responder sends it when its policy "does not allow it to accept any part of the proposed Traffic Selectors," and otherwise narrows the selectors. Netgate's [connection guide](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-connections.html) gives a /24 against a /32 in the phase 2 networks as one example of the small mismatches behind failed tunnels, and the [subnet calculator](/tools/subnet-calculator) settles the arithmetic. **AUTHENTICATION_FAILED** means no IKE SA. RFC 7296 section 2.21.2 lists "invalid shared secret, invalid ID, untrusted certificate issuer, revoked or expired certificate." A wrong clock can make a valid certificate look expired, as [the clock article](/blog/the-clock-is-the-last-thing-anybody-checks) shows.

Sometimes the proposals match and the error appears anyway. A transport versus tunnel mode disagreement can do it, per the RFC 7296 definition above, and so can the following.

- **Wrong gateway match on FortiGate.** Fortinet's [no proposal chosen article](https://community.fortinet.com/fortigate-3/troubleshooting-tip-no-proposal-chosen-negotiate-sa-error-202876) says the error "is likely due to a gateway address mismatch" and shows identical AES-CBC and SHA2-256 proposals on both sides. A dial-up server needs `set local-gw` when clients target a secondary address, and an ADVPN spoke needs the same `network-id` as its hub.
- **Not installable.** strongSwan's [child_create.c](https://github.com/strongswan/strongswan/blob/master/src/libcharon/sa/ikev2/tasks/child_create.c) answers NO_PROPOSAL_CHOSEN when it cannot install the selected child SA (it logs "unable to install inbound and outbound IPsec SA (SAD) in kernel" first), so a kernel without the algorithm can look like a mismatch.

A tunnel that comes up but stalls on large transfers has an [MTU problem](/blog/mtu-and-jumbo-frames), not a proposal one.

## Which debug commands show both peers' proposals on each platform?

**FortiGate.** Fortinet's [IKE debugging article](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ipsec-tunnel-debugging-ike-92770) gives this sequence for FortiOS 7.4.1 and later. Before 7.4.1 the filter command is spelled `log-filter`, and on 7.2 and earlier the address filter is `dst-addr4`. The [FortiGate CLI essentials](/blog/fortigate-cli-essentials) article covers the command families.

```text
diagnose vpn ike log filter clear
diagnose vpn ike log filter rem-addr4 203.0.113.5
diagnose debug application ike -1
diagnose debug console timestamp enable
diagnose debug enable
# reproduce the failure, then stop
diagnose debug disable
diagnose debug reset
```

**strongSwan.** The [logging documentation](https://docs.strongswan.org/docs/latest/config/logging.html) calls level 1 "a good default to see whats going on" and says level 2 adds "more detailed debugging control flow." A file logger with a raised default looks like this:

```conf
charon {
  filelog {
    charon {
      path = /var/log/charon.log
      default = 2
      flush_line = yes
    }
  }
}
```

[`swanctl --log`](https://docs.strongswan.org/docs/latest/swanctl/swanctlLog.html) receives only levels 0 and 1, which still include the failed-selection dumps, and [`swanctl --rekey --child NAME`](https://docs.strongswan.org/docs/latest/swanctl/swanctlRekey.html) forces the CREATE_CHILD_SA that exposes a PFS disagreement.

**pfSense.** Netgate's [log guide](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-logs.html) says to open VPN > IPsec, Advanced Settings, set IKE SA, IKE Child SA and Configuration Backend to Diag, and set the rest to Control. The [connection guide](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-connections.html) adds `swanctl --initiate --ike conX` and `swanctl --initiate --child conX` to start each portion from the shell, and says to look for UDP 500 and 4500 in the firewall log ([port reference](/tools/port-reference)).

**Cisco.** Per the IOS XE guide, `show crypto ikev2 proposal` prints the default and configured proposals, `crypto logging ikev2` enables IKEv2 syslog messages and `crypto ikev2 diagnose error` enables error diagnostics, both disabled by default. On an ASA, `show crypto ikev2 sa detail` and `show running-config crypto ikev2` are documented in the [ASA guide](https://www.cisco.com/c/en/us/td/docs/security/asa/asa922/configuration/vpn/asa-922-vpn-config/vpn-site2site.html).

## Why did a working tunnel start failing after an upgrade or at the first rekey?

**FortiOS 7.6.5.** Fortinet's [release notes](https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/230510/changes-in-default-behavior) list Bug ID 1107163: the default DH groups changed "from 14 and 5 to 20 and 21 when configured from the CLI," and VPNs on the old defaults "will be updated to DH groups 14, 20 and 21 when upgraded." A peer that offers none of the new set gets NO_PROPOSAL_CHOSEN. Fortinet's [upgrade tip](https://community.fortinet.com/fortigate-3/technical-tip-ipsec-tunnels-not-connecting-after-upgrade-to-v7-6-5-or-above-220185) says the change "can affect tunnels negotiated with peers on older FortiOS versions" and that after manually setting matching groups on both peers the tunnels "should resume connectivity." [FortiOS 7.6 versus 7.4](/blog/fortios-7-6-vs-7-4) covers the other branch differences.

**The first rekey.** The first child SA made in IKE_AUTH never carries a key exchange. strongSwan's renewal documentation says that if peers disagree on PFS "it will not be known until the CHILD_SA is first rekeyed with a CREATE_CHILD_SA exchange (and fails)," and that childless IKE SAs, available since 5.8.0, surface the mismatch at start. Netgate's [phase 2 page](https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/configure-p2.html) says the same for pfSense: the first child SA uses the phase 1 DH group, so a PFS mismatch can fail "after the first child SA expires."

**Windows clients.** The strongSwan Windows notes say Windows 7 up to Windows 11 propose `3des-aes128-aes192-aes256-sha1-sha256-sha384-modp1024` by default. The registry value `NegotiateDH2048_AES256` set to 1 or 2 enables AES-256-CBC and modp2048. The Windows client "can't handle unsupported Diffie Hellman groups," so a strongSwan gateway that starts an IKE rekey must use modp2048 first. A client with no PFS group configured returns error 13816 when the server proposes any key exchange method, even `none`, which strongSwan has included in its default ESP proposals since 6.0.2.

## Which proposal set interoperates while following RFC 8247?

RFC 8247 sets what implementations must support, not what to deploy: section 1.4 says it "does not give any recommendations for the use of algorithms."

| Item | IKE SA | Child SA (ESP) |
|---|---|---|
| Encryption | AES-CBC (MUST) and AES-GCM-16 (SHOULD), for 128 and 256-bit keys | AES-CBC and AES-GCM-16 are both MUST in [RFC 8221](https://www.rfc-editor.org/rfc/rfc8221) for 128 and 256-bit keys |
| Integrity | HMAC-SHA2-256-128 (MUST), none with AES-GCM | HMAC-SHA2-256-128 (MUST), none with AES-GCM |
| PRF | PRF_HMAC_SHA2_256 (MUST) | Not used |
| Group | 14 (MUST), 19 (SHOULD) | Optional PFS; if used, one group both ends accept, and Netgate's [phase 2 page](https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/configure-p2.html) calls 14 the optimal choice |
| Avoid | 3DES (MAY), SHA-1 (MUST-), groups 2 and 5 (SHOULD NOT), group 1, MD5, DES, NULL (MUST NOT) | 3DES (SHOULD NOT), MD5 (MUST NOT) |

A strongSwan configuration with the AEAD proposal first and a classic fallback (addresses and authentication omitted):

```conf
connections {
  site-b {
    version = 2
    proposals = aes256gcm16-prfsha256-modp2048,aes256-sha256-modp2048
    children {
      lan {
        esp_proposals = aes256gcm16-modp2048,aes256-sha256-modp2048
      }
    }
  }
}
```

The FortiOS equivalent (interface, gateway and authentication omitted), using keywords from the 7.4.2 and 7.6.5 references and strongSwan's interop page:

```text
config vpn ipsec phase1-interface
    edit "site-b"
        set ike-version 2
        set proposal aes256gcm-prfsha256 aes256-sha256
        set dhgrp 14
    next
end
config vpn ipsec phase2-interface
    edit "site-b-p2"
        set phase1name "site-b"
        set proposal aes256gcm aes256-sha256
        set pfs enable
        set dhgrp 14
    next
end
```

The 7.4.2 reference shows `ike-version` defaulting to 1, so set it explicitly, and the 7.6.5 phase 2 page shows `pfs` defaulting to enable. On IOS XE the matching IKE half is a `crypto ikev2 proposal` with `encryption aes-cbc-256`, `integrity sha256` and `group 14`, attached through a `crypto ikev2 policy`.

## Sources

- [IETF: RFC 7296, Internet Key Exchange Protocol Version 2 (IKEv2)](https://www.rfc-editor.org/rfc/rfc7296)
- [IETF: RFC 8247, Algorithm Implementation Requirements and Usage Guidance for IKEv2](https://www.rfc-editor.org/rfc/rfc8247)
- [IETF: RFC 8221, ESP and AH Algorithm Requirements](https://www.rfc-editor.org/rfc/rfc8221)
- [IETF: RFC 5282, Authenticated Encryption Algorithms in the IKEv2 Encrypted Payload](https://www.rfc-editor.org/rfc/rfc5282)
- [IETF: RFC 9395, Deprecation of IKEv1 and Obsoleted Algorithms](https://www.rfc-editor.org/rfc/rfc9395)
- [IANA: Internet Key Exchange Version 2 (IKEv2) Parameters](https://www.iana.org/assignments/ikev2-parameters/ikev2-parameters.xhtml)
- [strongSwan: Algorithm Proposals (Cipher Suites)](https://docs.strongswan.org/docs/latest/config/proposals.html)
- [strongSwan: IKE and IPsec SA Renewal](https://docs.strongswan.org/docs/latest/config/rekeying.html)
- [strongSwan: Logging](https://docs.strongswan.org/docs/latest/config/logging.html)
- [strongSwan: Windows Clients](https://docs.strongswan.org/docs/latest/interop/windowsClients.html)
- [strongSwan: Fortinet Devices](https://docs.strongswan.org/docs/latest/interop/fortinet.html)
- [strongSwan: swanctl --log](https://docs.strongswan.org/docs/latest/swanctl/swanctlLog.html)
- [strongSwan: swanctl --rekey](https://docs.strongswan.org/docs/latest/swanctl/swanctlRekey.html)
- [strongSwan source: ike_init.c](https://github.com/strongswan/strongswan/blob/master/src/libcharon/sa/ikev2/tasks/ike_init.c)
- [strongSwan source: child_create.c](https://github.com/strongswan/strongswan/blob/master/src/libcharon/sa/ikev2/tasks/child_create.c)
- [strongSwan source: proposal.c](https://github.com/strongswan/strongswan/blob/master/src/libstrongswan/crypto/proposal/proposal.c)
- [strongSwan users list: NO_PROPOSAL_CHOSEN error when IKEv1 and IKEv2 have closely resemble but not exact suites](https://lists.strongswan.org/pipermail/users/2012-February/002550.html)
- [Netgate: Troubleshooting IPsec Logs](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-logs.html)
- [Netgate: Troubleshooting IPsec Connections](https://docs.netgate.com/pfsense/en/latest/troubleshooting/ipsec-connections.html)
- [Netgate: IPsec Phase 1 Settings](https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/configure-p1.html)
- [Netgate: IPsec Phase 2 Settings](https://docs.netgate.com/pfsense/en/latest/vpn/ipsec/configure-p2.html)
- [Fortinet: FortiOS 7.6.5 Release Notes, Changes in default behavior](https://docs.fortinet.com/document/fortigate/7.6.5/fortios-release-notes/230510/changes-in-default-behavior)
- [Fortinet: FortiOS 7.4.2 CLI Reference, config vpn ipsec phase1-interface](https://docs.fortinet.com/document/fortigate/7.4.2/cli-reference/333620)
- [Fortinet: FortiOS 7.6.5 CLI Reference, config vpn ipsec phase2-interface](https://docs.fortinet.com/document/fortigate/7.6.5/cli-reference/252893715)
- [Fortinet Community: Technical Tip, IPsec tunnels not connecting after upgrade to v7.6.5 or above](https://community.fortinet.com/fortigate-3/technical-tip-ipsec-tunnels-not-connecting-after-upgrade-to-v7-6-5-or-above-220185)
- [Fortinet Community: Troubleshooting Tip, IPsec VPN down due to mismatched DH group in KE payload](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ipsec-vpn-down-due-to-mismatched-dh-group-in-ke-payload-208310)
- [Fortinet Community: Troubleshooting Tip, No Proposal Chosen, Negotiate SA Error](https://community.fortinet.com/fortigate-3/troubleshooting-tip-no-proposal-chosen-negotiate-sa-error-202876)
- [Fortinet Community: Troubleshooting Tip, IPsec tunnel debugging IKE](https://community.fortinet.com/fortigate-3/troubleshooting-tip-ipsec-tunnel-debugging-ike-92770)
- [Cisco: Configuring Internet Key Exchange Version 2, IOS XE 17.x](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_conn_ike2vpn/configuration/xe-17/sec-flex-vpn-xe-17-book/sec-cfg-ikev2-flex.html)
- [Cisco: ASA 9.22 VPN Configuration Guide, LAN-to-LAN IPsec VPNs](https://www.cisco.com/c/en/us/td/docs/security/asa/asa922/configuration/vpn/asa-922-vpn-config/vpn-site2site.html)
- [Microsoft: Set-VpnConnectionIPsecConfiguration](https://learn.microsoft.com/en-us/powershell/module/vpnclient/set-vpnconnectionipsecconfiguration)
- [Wireshark: Display Filter Reference, Internet Security Association and Key Management Protocol](https://www.wireshark.org/docs/dfref/i/isakmp.html)
