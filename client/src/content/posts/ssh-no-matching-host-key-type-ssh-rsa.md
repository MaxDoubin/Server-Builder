## The short answer

`Unable to negotiate with HOST port 22: no matching host key type found. Their offer: ssh-rsa` means the device can sign its host key only with RSA and SHA-1, and [OpenSSH 8.8](https://www.openssh.org/txt/release-8.8) (September 26, 2021) turned that signature off by default. The RSA key itself is fine: the release notes say "there is no need to replace ssh-rsa keys," because the same key can sign with SHA-2 once the device's software supports it. Until it does, scope an override to that one device with `HostKeyAlgorithms +ssh-rsa` in a `Host` block of `~/.ssh/config`, and confirm it with `ssh -G`. That fixes this error on its own. Add `PubkeyAcceptedAlgorithms +ssh-rsa` only if login then fails with `no mutual signature algorithm`, and `KexAlgorithms` or `Ciphers` lines only if a later `Their offer:` line names something you need. The notes recommend enabling RSA with SHA-1 "only as a stopgap measure." If the next error is about key exchange on a Cisco switch, the [no matching key exchange method article](/blog/ssh-no-matching-key-exchange-method-cisco) covers that case in full.

## What does "no matching host key type found. Their offer: ssh-rsa" mean?

At the start of every SSH connection, both sides send lists of the algorithms they support, one list per job: key exchange, host key, cipher and message authentication code (MAC). OpenSSH ends the handshake when the two lists for one job share nothing, and it prints the other side's list. The sentence is built in [packet.c](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/packet.c) of the 9.9p1 source as `Unable to negotiate with %s: %s. Their offer: %s`, and the reasons come from [ssherr.c](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/ssherr.c): "no matching host key type found," "no matching key exchange method found," "no matching cipher found" and "no matching MAC found." Both ssh and sshd are built from that file, so a server logs the same sentence when an old client is the side that offers too little.

```text
$ ssh admin@192.0.2.10
Unable to negotiate with 192.0.2.10 port 22: no matching host key type found. Their offer: ssh-rsa
```

The name `ssh-rsa` covers two things: a key format and a signature algorithm. [RFC 8332](https://www.rfc-editor.org/rfc/rfc8332) says SSH originally defined "ssh-rsa" for authentication "using RSA with SHA-1," and it adds two new algorithms, rsa-sha2-256 and rsa-sha2-512, that "reuse the "ssh-rsa" public key format." Existing RSA keys work with the new algorithms "without requiring re-encoding or affecting already trusted key fingerprints," so an entry in `known_hosts` stays valid. The [8.5 notes](https://www.openssh.org/txt/release-8.5) say the same thing from the OpenSSH side: an ssh-rsa key can sign with rsa-sha2-256, rsa-sha2-512 or ssh-rsa, and "Only the last of these is being turned off by default." OpenSSH has supported the SHA-2 pair since [7.2](https://www.openssh.org/txt/release-7.2) (February 29, 2016). A device that offers only `ssh-rsa` runs SSH software that never adopted RFC 8332.

The reason for the change is the cost of breaking SHA-1. The 8.8 notes say it is possible to create chosen-prefix SHA-1 collisions for "<USD$50K," and the researchers behind [SHA-1 is a Shambles](https://sha-mbles.github.io/) estimate that their attack costs "about 45k USD." The [8.2 notes](https://www.openssh.org/txt/release-8.2) explain where the exposure is worst: certificates are at special risk because an attacker has "effectively unlimited time in which to craft a collision," while an attack on a live login has to fit inside "the relatively brief LoginGraceTime window." RFC 8332 says implementations SHOULD "start to disable "ssh-rsa" in their default configurations." OpenSSH announced the change in 8.2 (February 14, 2020) and shipped it in 8.8.

Which clients hit the error depends on the OpenSSH version they ship.

| Distribution | OpenSSH client | ssh-rsa host key signature on by default |
|---|---|---|
| Debian 11 | 8.4p1 | Yes |
| Ubuntu 22.04 | 8.9p1 | No |
| Debian 12 | 9.2p1 | No |
| Debian 13 | 10.0p1 | No |

Versions come from the [Debian](https://packages.debian.org/search?keywords=openssh-client&searchon=names&suite=all&section=all) and [Ubuntu](https://packages.ubuntu.com/jammy/openssh-client) package archives. The [SSH hardening guide](/blog/ssh-hardening-linux-servers) covers the server side of the same negotiation.

## Which OpenSSH release turned off which legacy algorithm?

Each row below is a default that changed, taken from that release's notes. A device that fails on several rows at once runs software older than the oldest change involved.

| Release | Date | What changed |
|---|---|---|
| [7.0](https://www.openssh.org/txt/release-7.0) | 2015-08-11 | diffie-hellman-group1-sha1 and ssh-dss off at run time; SSH protocol 1 off at compile time |
| [7.2](https://www.openssh.org/txt/release-7.2) | 2016-02-29 | RSA signatures with SHA-256 and SHA-512 added; blowfish-cbc, cast128-cbc, arcfour, MD5-based and truncated HMACs off by default in ssh |
| [7.4](https://www.openssh.org/txt/release-7.4) | 2016-12-19 | 3des-cbc out of the client's default proposal |
| [7.6](https://www.openssh.org/txt/release-7.6) | 2017-10-03 | hmac-ripemd160, arcfour, blowfish and CAST removed; RSA keys under 1024 bits refused; CBC ciphers not offered by the client by default |
| [8.2](https://www.openssh.org/txt/release-8.2) | 2020-02-14 | diffie-hellman-group14-sha1 out of the default key exchange proposal for client and server; ssh-rsa deprecation announced |
| [8.5](https://www.openssh.org/txt/release-8.5) | 2021-03-03 | UpdateHostKeys on by default; PubkeyAcceptedKeyTypes renamed PubkeyAcceptedAlgorithms |
| [8.8](https://www.openssh.org/txt/release-8.8) | 2021-09-26 | RSA signatures with SHA-1 off by default |
| [9.7](https://www.openssh.org/txt/release-9.7) and [9.8](https://www.openssh.org/txt/release-9.8) | 2024-03-11 and 2024-07-01 | DSA made optional at compile time, then disabled at compile time by default |
| [10.0](https://www.openssh.org/txt/release-10.0) | 2025-04-09 | DSA removed; sshd stops offering finite field Diffie-Hellman key exchange by default, and the client is unchanged |

The 7.4 notes explain the 3DES change: "64-bit block ciphers are not safe in 2016," and they admit the change "may cause problems connecting to older devices." The 9.7 notes give the case against DSA, the algorithm behind `ssh-dss` keys: it is limited to a "160 bit private key" and SHA-1, which they estimate at "only 80 bits symmetric equivalent."

Disabled and removed are different. A disabled algorithm comes back with one config line. A removed one does not: the 7.6 notes removed hmac-ripemd160 and the arcfour, blowfish and CAST ciphers, and 10.0 removed DSA, so `HostKeyAlgorithms +ssh-dss` does nothing on a current client.

## How do you reach one old device without weakening every connection?

First see what the device offers. A `-vv` run prints both sides' lists, using the labels in [kex.c](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/kex.c), plus the software version the device announces.

```bash
ssh -vv admin@192.0.2.10 2>&1 | grep -E 'KEXINIT proposal|KEX algorithms|host key algorithms|ciphers ctos|MACs ctos|remote software version'
```

The lines after `peer server KEXINIT proposal` are the device's lists. The lines after `local client KEXINIT proposal` are your own. The [ssh2-enum-algos](https://nmap.org/nsedoc/scripts/ssh2-enum-algos.html) script reports the same lists from a scan, as `nmap --script ssh2-enum-algos target`, and the [nmap command builder](/tools/nmap-command-builder) assembles the rest of the command line. `ssh -Q kex`, `ssh -Q cipher`, `ssh -Q mac` and `ssh -Q key` list what your own client supports, per the [legacy options page](https://www.openssh.org/legacy.html).

For a single connection, pass the options on the command line.

```bash
ssh -o HostKeyAlgorithms=+ssh-rsa admin@192.0.2.10
```

To make it permanent for that device only, put it in a `Host` block with an alias.

```text
Host old-switch
    HostName 192.0.2.10
    User admin
    HostKeyAlgorithms +ssh-rsa
```

The 8.8 notes give a two-line stanza that also adds `PubkeyAcceptedAlgorithms +ssh-rsa`, and they say why: the options re-enable RSA/SHA-1 "to allow connection and/or user authentication." These are separate negotiations. [ssh_config(5)](https://man.openbsd.org/ssh_config) defines `HostKeyAlgorithms` as "the host key signature algorithms that the client wants to use" and `PubkeyAcceptedAlgorithms` as "the signature algorithms that will be used for public key authentication." The host key error at the top of this article needs only the first. The second lets your own RSA key sign with SHA-1, so leave it out until login fails with `no mutual signature algorithm`, [covered below](#why-does-no-mutual-signature-algorithm-appear-with-an-rsa-key). A password login or an Ed25519 key never needs it.

The same page defines the `+` prefix: the algorithms "will be appended to the default set instead of replacing them," so the strong algorithms stay first. A bare `HostKeyAlgorithms ssh-rsa` replaces the defaults, which is the weakening this approach avoids. The same page says "the first obtained value for each directive is used," so "more host-specific declarations should be given near the beginning of the file, and general defaults at the end." Put the stanza above any `Host *` block, then check the result.

```bash
ssh -G old-switch | grep -i '^hostkeyalgorithms'
```

`ssh -G` prints the configuration ssh would use for that host without connecting. The line should end with `ssh-rsa`. If you later add `PubkeyAcceptedAlgorithms`, check it the same way, and in a config file shared with clients older than 8.5 spell it `PubkeyAcceptedKeyTypes`, which the 8.5 notes kept as an alias.

Other tools follow the same stanza. The [scp(1)](https://man.openbsd.org/scp) page says `-o` passes options to ssh "in the format used in ssh_config(5)," and sftp and git over SSH run ssh, so they read `~/.ssh/config` too.

Fedora and Red Hat systems add a layer. Fedora's [design note](https://www.fedoraproject.org/wiki/Changes/OpenSSH_Crypto_Policy) says the OpenSSH client follows a system-wide crypto policy and that "You can always overwrite the system-wide policy using user-specific configuration files in ~/.ssh/config or on the command line." Red Hat's [RHEL 9 documentation](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/security_hardening/using-the-system-wide-cryptographic-policies_security-hardening) describes a `DEFAULT:SHA1` policy, set with `update-crypto-policies --set DEFAULT:SHA1`, that allows SHA-1 signatures again. That command is system-wide and reaches far beyond one switch, so try the per-host override first and check it with `ssh -G`.

## What other errors appear once the host key is accepted?

Negotiation fails one list at a time, so `ssh-rsa` is often only the first of several errors. Each `Their offer:` line shows what the device can do, and each fix should add only an algorithm from that line. Prefer the strongest one that appears there.

| Error | Per-host option | Dropped from the client default in |
|---|---|---|
| no matching key exchange method found | `KexAlgorithms +diffie-hellman-group14-sha1` | 8.2 |
| no matching key exchange method found | `KexAlgorithms +diffie-hellman-group1-sha1` | 7.0 |
| no matching cipher found | `Ciphers +aes128-cbc` or `Ciphers +3des-cbc` | 7.6 for CBC, 7.4 for 3des-cbc |
| no matching MAC found | `MACs +` the name in the offer, such as `hmac-md5` | 7.2 |

The ssh_config(5) page lists `3des-cbc` and `aes128-cbc` as supported ciphers but leaves them out of the default list, which is why the `+` form works for them.

[RFC 9142](https://www.rfc-editor.org/rfc/rfc9142) ranks the two key exchanges. It says the group1 group "with approximately 80 bits of security is too weak to be retained." It allows diffie-hellman-group14-sha1 as a "MAY" for legacy devices but says it "should be put at the end of the list." An offer that lists both group14 and group1 needs only group14. The [Cisco key exchange article](/blog/ssh-no-matching-key-exchange-method-cisco) goes through this error step by step.

### Why does "no mutual signature algorithm" appear with an RSA key?

After the host key passes, the client must sign with its own key. For an RSA key, [sshconnect2.c](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/sshconnect2.c) picks the first RSA entry in `PubkeyAcceptedAlgorithms` that also appears in the server's `server-sig-algs` list, an extension where a server names the signature algorithms it accepts. An old device sends no such list, so the only candidate is plain `ssh-rsa`. RFC 8332 anticipated this: against a server without the extension, clients "MAY default to an "ssh-rsa" signature." Since 8.8 the client's own list lacks `ssh-rsa`, so no candidate is left. The source also special-cases OpenSSH 7.4 servers, which it treats as supporting both SHA-2 algorithms even without the list.

With `-v`, the probe step logs `send_pubkey_test: no mutual signature algorithm`. If the client gets as far as signing, it logs `sign_and_send_pubkey: no mutual signature supported`. Either way the login ends with `Permission denied (publickey)` if no other method works. Adding `PubkeyAcceptedAlgorithms +ssh-rsa` to the same `Host` block fixes it. An Ed25519 key avoids RSA altogether if the device accepts one. OpenSSH has supported Ed25519 since 6.5, per the 8.2 notes, and the [key-based authentication guide](/blog/ssh-key-based-authentication) covers generating one.

### What if the old side is the client?

The mirror case is a Linux server running 8.8 or later that rejects an old client's RSA key. [auth2-pubkey.c](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/auth2-pubkey.c) logs `userauth_pubkey: signature algorithm ssh-rsa not in PubkeyAcceptedAlgorithms`. [sshd_config(5)](https://man.openbsd.org/sshd_config) allows `PubkeyAcceptedAlgorithms` after a `Match` line, so one source address can be exempted.

```text
Match Address 192.0.2.50
    PubkeyAcceptedAlgorithms +ssh-rsa
```

The same page does not list `KexAlgorithms`, `HostKeyAlgorithms`, `Ciphers` or `MACs` among the keywords allowed after `Match`. Those are settled before the server knows who is connecting. A device that needs them, such as a switch that pushes backups over SCP and can only do `diffie-hellman-group14-sha1`, calls for a second sshd on another port, started with `sshd -f` as described in [sshd(8)](https://man.openbsd.org/sshd), and a firewall rule that admits only that device.

```text
# /etc/ssh/sshd_config_legacy
Port 2222
HostKeyAlgorithms +ssh-rsa
KexAlgorithms +diffie-hellman-group14-sha1
```

## How do you fix it on the device instead?

The durable fix is device software that offers rsa-sha2 or a better host key type. The 8.5 notes give a test for clients that still accept ssh-rsa: connect with `ssh -oHostKeyAlgorithms=-ssh-rsa user@host`, and if host key verification fails and no other supported type is available, "the server software on that host should be upgraded." On 8.8 and later the plain error at the top of this article is already that test result. Regenerating the RSA key does not help, because the trouble is the hash and not the key.

### Cisco IOS and IOS XE

On older Cisco software, `ssh-rsa` is usually the second error after a key exchange failure. The [Cisco key exchange article](/blog/ssh-no-matching-key-exchange-method-cisco) covers the device side: what a classic IOS 15 switch can be made to offer, the IOS XE commands that set the algorithm lists, and what `show ip ssh` prints. The [IOS fundamentals](/blog/cisco-ios-fundamentals) article covers the basics of the command line.

### Dell iDRAC

Dell's [KB 000293934](https://www.dell.com/support/kbdoc/en-us/000293934/supported-ssh-cryptography-schemes-for-idrac9-firmware-7-xx-xx-xx) lists the host key algorithms for iDRAC9 firmware 7.xx as rsa-sha2-512, rsa-sha2-256, ecdsa-sha2-nistp256 and ssh-ed25519, with no plain ssh-rsa. An iDRAC9 that offers only `ssh-rsa` is on older firmware, and a firmware update is the fix. Check your own unit with the `-vv` command above, because only the offer settles it. The flip side is in the same KB: iDRAC "7.10.50.00 and higher does not support Diffie-Hellman KEX algorithms." Its key exchange list is down to curve25519 and the ecdh-sha2 methods, so a very old SSH client can no longer reach a current iDRAC. The [iDRAC tips](/blog/dell-idrac-tips-tricks) article covers racadm over SSH.

### Dropbear in routers and appliances

Many routers and storage appliances embed Dropbear, a small SSH server, and its [changelog](https://github.com/mkj/dropbear/blob/master/CHANGES) dates the same transition. Release 2020.79 (June 15, 2020) added rsa-sha2 signatures, with "No changes are needed to hostkeys/authorized_keys entries." Release 2022.82 (April 1, 2022) disabled group1 key exchange by default and notes that the server side had been off by default since 2018. Release 2022.83 (November 14, 2022) disabled DSS by default. Release 2025.87 (March 5, 2025) disabled SHA-1 algorithms by default. Firmware built on a Dropbear older than 2020.79 can only sign RSA host keys with ssh-rsa, so the override stays until the vendor ships an update. The `remote software version` line in the `-vv` output names the release.

### Paramiko and scripts

The same change reaches Python tooling. The [Paramiko changelog](https://www.paramiko.org/changelog.html) says 2.9.0 (December 23, 2021) added RFC 8332 support and that "action is required if your target systems do not support either RSA2 or the server-sig-algs protocol extension." The action is the `disabled_algorithms` option, set to turn off the two rsa-sha2 names for that device. Release 5.0.0 (May 9, 2026) "Removed support for verifying/signing with RSA keys using SHA-1 hashing," along with the SHA-1 key exchanges. A script on Paramiko 5 cannot reach an ssh-rsa-only device at all, so pin an earlier release for that job until the device is updated, or run the job through the OpenSSH client with the stanza above. The [network automation in Python](/blog/python-network-automation) article covers the tooling.

## What breaks?

**The override is ignored.** The stanza sits below a `Host *` block, so the first value wins. Move it above, and check with `ssh -G`. On Fedora and Red Hat systems, also check the crypto policy.

**The error changes after the first fix.** That is expected, because each list negotiates separately. Add only what the new `Their offer:` line names.

**The host key passes and the login fails with `Permission denied (publickey)`.** The client has no permitted signature for its RSA key. Add `PubkeyAcceptedAlgorithms +ssh-rsa` to the stanza, or use an Ed25519 key.

**The client refuses even with the override.** The device offers something OpenSSH removed and did not just disable, such as DSA or the arcfour, blowfish and CAST ciphers. Update the device. If that is impossible, an old OpenSSH client kept in an isolated virtual machine is a sounder stopgap than weakening the main one.

**Every connection to the device prints a new warning.** The [10.1 notes](https://www.openssh.org/txt/release-10.1) add "a warning when the connection negotiates a non-post quantum key agreement algorithm," controlled by a new `WarnWeakCrypto` option, "defaulting to on." An old device cannot do post-quantum key exchange, so the warning is accurate. The ssh_config(5) source for the current development version says `WarnWeakCrypto no-pq-kex` turns off just this warning and `no` turns off all of them. Setting it in that device's stanza hides a true statement, so leave it on everywhere else.

**scp fails after a client update.** The [9.0 notes](https://www.openssh.org/txt/release-9.0) switched scp to the SFTP protocol by default, and the scp(1) page says `-O` forces the legacy protocol, which "may be necessary for servers that do not implement SFTP."

**Old certificates are rejected.** The 8.2 notes removed ssh-rsa from the algorithms accepted for certificate signatures (`CASignatureAlgorithms`) and made ssh-keygen sign new certificates with rsa-sha2-512 by default. Certificates signed with an RSA certificate authority key and SHA-1 need re-signing, as the [SSH certificate authority](/blog/ssh-certificate-authority) article describes.

**The connection drops before any algorithm list appears.** That is not a negotiation failure. The [daemon that refuses connections](/blog/the-connection-refused-by-a-daemon-doing-nothing) article covers the `MaxStartups` limit, which sshd_config(5) sets to `10:30:100` by default.

## Sources

- [OpenSSH: Release notes for 7.0](https://www.openssh.org/txt/release-7.0)
- [OpenSSH: Release notes for 7.2](https://www.openssh.org/txt/release-7.2)
- [OpenSSH: Release notes for 7.4](https://www.openssh.org/txt/release-7.4)
- [OpenSSH: Release notes for 7.6](https://www.openssh.org/txt/release-7.6)
- [OpenSSH: Release notes for 8.2](https://www.openssh.org/txt/release-8.2)
- [OpenSSH: Release notes for 8.5](https://www.openssh.org/txt/release-8.5)
- [OpenSSH: Release notes for 8.8](https://www.openssh.org/txt/release-8.8)
- [OpenSSH: Release notes for 9.0](https://www.openssh.org/txt/release-9.0)
- [OpenSSH: Release notes for 9.7](https://www.openssh.org/txt/release-9.7)
- [OpenSSH: Release notes for 9.8](https://www.openssh.org/txt/release-9.8)
- [OpenSSH: Release notes for 10.0](https://www.openssh.org/txt/release-10.0)
- [OpenSSH: Release notes for 10.1](https://www.openssh.org/txt/release-10.1)
- [OpenSSH: Legacy options](https://www.openssh.org/legacy.html)
- [OpenBSD: ssh_config(5)](https://man.openbsd.org/ssh_config)
- [OpenBSD: sshd_config(5)](https://man.openbsd.org/sshd_config)
- [OpenBSD: sshd(8)](https://man.openbsd.org/sshd)
- [OpenBSD: scp(1)](https://man.openbsd.org/scp)
- [OpenSSH source: packet.c, 9.9p1](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/packet.c)
- [OpenSSH source: ssherr.c, 9.9p1](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/ssherr.c)
- [OpenSSH source: kex.c, 9.9p1](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/kex.c)
- [OpenSSH source: sshconnect2.c, 9.9p1](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/sshconnect2.c)
- [OpenSSH source: auth2-pubkey.c, 9.9p1](https://github.com/openssh/openssh-portable/blob/V_9_9_P1/auth2-pubkey.c)
- [IETF: RFC 8332, Use of RSA Keys with SHA-256 and SHA-512 in the Secure Shell (SSH) Protocol](https://www.rfc-editor.org/rfc/rfc8332)
- [IETF: RFC 9142, Key Exchange (KEX) Method Updates and Recommendations for Secure Shell (SSH)](https://www.rfc-editor.org/rfc/rfc9142)
- [Leurent and Peyrin: SHA-1 is a Shambles](https://sha-mbles.github.io/)
- [Debian: Package search for openssh-client](https://packages.debian.org/search?keywords=openssh-client&searchon=names&suite=all&section=all)
- [Ubuntu: Package openssh-client in jammy](https://packages.ubuntu.com/jammy/openssh-client)
- [Nmap: ssh2-enum-algos NSE script](https://nmap.org/nsedoc/scripts/ssh2-enum-algos.html)
- [Fedora Project: OpenSSH Crypto Policy change](https://www.fedoraproject.org/wiki/Changes/OpenSSH_Crypto_Policy)
- [Red Hat: Security hardening, using the system-wide cryptographic policies (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/security_hardening/using-the-system-wide-cryptographic-policies_security-hardening)
- [Dell: KB 000293934, Supported SSH cryptography schemes for iDRAC9 firmware 7.xx.xx.xx](https://www.dell.com/support/kbdoc/en-us/000293934/supported-ssh-cryptography-schemes-for-idrac9-firmware-7-xx-xx-xx)
- [Dropbear SSH: CHANGES](https://github.com/mkj/dropbear/blob/master/CHANGES)
- [Paramiko: Changelog](https://www.paramiko.org/changelog.html)