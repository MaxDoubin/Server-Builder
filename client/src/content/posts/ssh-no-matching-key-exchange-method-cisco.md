
## The short answer

"no matching key exchange method found" means the OpenSSH client and the switch share no key exchange algorithm, and the client will not fall back to one it treats as weak. [OpenSSH 7.0](https://www.openssh.org/txt/release-7.0) (August 2015) disabled `diffie-hellman-group1-sha1` and `ssh-dss` by default, [8.2](https://www.openssh.org/txt/release-8.2) (February 2020) dropped `diffie-hellman-group14-sha1` from the default proposal, and [8.8](https://www.openssh.org/txt/release-8.8) (September 2021) disabled RSA signatures made with SHA-1, which is the only plain RSA host key algorithm in Cisco's older algorithm lists. For one switch, append what the "Their offer" line shows: `ssh -oKexAlgorithms=+diffie-hellman-group14-sha1 -oHostKeyAlgorithms=+ssh-rsa admin@switch`, and choose group14 over group1 whenever the switch offers it. Put the same options in a `Host` block in `~/.ssh/config` and confirm them with `ssh -G`. The lasting fix is on the switch: a 2048-bit RSA key and `ip ssh version 2` on classic IOS 15, or IOS XE 17.x, where Cisco's [17.12 guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-12/configuration_guide/sec/b_1712_sec_9300_cg/ssh_algorithms_for_common_criteria_certification.html) lists curve25519 and ECDH key exchange and `rsa-sha2-512` host keys by default. Each negotiation step fails separately, so expect a second error, host key and then cipher, after the first fix.

## What does "no matching key exchange method found" mean?

Both sides of an SSH connection send ordered lists of algorithms first. [RFC 4253](https://www.rfc-editor.org/rfc/rfc4253) says "If no algorithm satisfying all these conditions can be found, the connection fails, and both sides MUST disconnect." OpenSSH reports which list failed and prints what the other side offered. The reason strings live in [ssherr.c](https://github.com/openssh/openssh-portable/blob/master/ssherr.c), and [packet.c](https://github.com/openssh/openssh-portable/blob/master/packet.c) builds the line as `Unable to negotiate with <host> port <port>: <reason>. Their offer: <list>`.

| Message | Negotiation step | Client option that changes it |
|---|---|---|
| `no matching key exchange method found` | Key exchange | `KexAlgorithms` |
| `no matching host key type found` | Host key signature | `HostKeyAlgorithms` |
| `no matching cipher found` | Encryption | `Ciphers` |
| `no matching MAC found` | Message integrity | `MACs` |

The options are documented in [ssh_config(5)](https://man.openbsd.org/ssh_config). Only the first failing step is reported: in [kex.c](https://github.com/openssh/openssh-portable/blob/master/kex.c) the client chooses the key exchange first, then the host key algorithm, then ciphers, MACs and compression, and records the peer's list for whichever choice fails. The host key case has its own write-up in no matching host key type found, ssh-rsa. A connection that closes before negotiation starts, such as `kex_exchange_identification: Connection closed by remote host`, is a different failure, covered in [the MaxStartups post](/blog/the-connection-refused-by-a-daemon-doing-nothing).

To see everything a switch offers without trial and error, Nmap's [ssh2-enum-algos](https://nmap.org/nsedoc/scripts/ssh2-enum-algos.html) script says that "If verbosity is set, the offered algorithms are each listed by type." The [Nmap command builder](/tools/nmap-command-builder) assembles the flags.

```bash
nmap -v -p 22 --script ssh2-enum-algos 10.10.10.2
```

## Which OpenSSH releases turned the legacy algorithms off, and why?

Most rows change defaults rather than remove code, so the old algorithms can be switched back on until 10.0 removes DSA.

| OpenSSH | Date | What changed for a client talking to old gear |
|---|---|---|
| [7.0](https://www.openssh.org/txt/release-7.0) | 2015-08-11 | 1024-bit `diffie-hellman-group1-sha1` and `ssh-dss` disabled by default at run-time |
| [7.2](https://www.openssh.org/txt/release-7.2) | 2016-02-29 | blowfish-cbc, cast128-cbc, arcfour and rijndael-cbc aliases off in ssh; MD5-based and truncated HMACs off; group exchange minimum raised to 2048 bits |
| [7.4](https://www.openssh.org/txt/release-7.4) | 2016-12-19 | `3des-cbc` removed from the client's default proposal |
| [7.6](https://www.openssh.org/txt/release-7.6) | 2017-10-03 | "ssh(1): do not offer CBC ciphers by default"; RSA keys under 1024 bits refused |
| [8.2](https://www.openssh.org/txt/release-8.2) | 2020-02-14 | `diffie-hellman-group14-sha1` removed from the default key exchange for client and server |
| [8.8](https://www.openssh.org/txt/release-8.8) | 2021-09-26 | RSA signatures using SHA-1 (`ssh-rsa`) disabled by default |
| [10.0](https://www.openssh.org/txt/release-10.0) | 2025-04-09 | DSA removed entirely; sshd stops offering finite-field Diffie-Hellman by default |

### Why group1 went first

The group in `diffie-hellman-group1-sha1` is 1024 bits. Logjam researchers estimate that ["an academic team can break a 768-bit prime and that a nation-state can break a 1024-bit prime,"](https://weakdh.org/) and their [server guidance](https://weakdh.org/sysadmin.html) says "at the very least, you should disable Group 1 support." [RFC 9142](https://www.rfc-editor.org/rfc/rfc9142) calls the group "too weak to be retained" and marks `diffie-hellman-group1-sha1` SHOULD NOT. It gives `diffie-hellman-group14-sha1` a MAY with the advice to "put at the end of the list of negotiated key exchanges," and makes `diffie-hellman-group14-sha256` a MUST. Group14 with SHA-1 is the less bad SHA-1 method, and group14 with SHA-256 is better still.

### Why old gear has only these algorithms

RFC 4253 made `diffie-hellman-group1-sha1`, `diffie-hellman-group14-sha1`, `ssh-dss` and `3des-cbc` REQUIRED, so vendors built exactly those. The OpenSSH 7.4 notes acknowledge the cost: removing 3DES "may cause problems connecting to older devices using the default configuration, but it's highly likely that such devices already need explicit configuration for key exchange and hostkey algorithms already anyway."

### Why ssh-rsa fails even though RSA is fine

The key is fine. The [8.5 notes](https://www.openssh.org/txt/release-8.5) explain that an `ssh-rsa` key can sign with `rsa-sha2-256`, `rsa-sha2-512` or `ssh-rsa` (RSA with SHA-1), and "Only the last of these is being turned off by default." The 8.8 notes give the reason: chosen-prefix SHA-1 collisions cost under USD 50,000. [RFC 8332](https://www.rfc-editor.org/rfc/rfc8332) defines the SHA-2 variants and says implementations "SHOULD start to disable "ssh-rsa" in their default configurations." A switch that signs only with SHA-1 fails with `Their offer: ssh-rsa`, as [an owner report](https://chrisjhart.com/Cisco-IOS-SSH-Key-Type/) from a switch whose prompt reads C3560-CX shows.

### What a current client still accepts

The 10.0 notes say of finite-field Diffie-Hellman that "The client is unchanged and continues to support these methods by default," and the current [kex-names.c](https://github.com/openssh/openssh-portable/blob/master/kex-names.c) still builds group1, group14-sha1 and SHA-1 group exchange when OpenSSL is present, so the names can be appended. DSA is the exception. The [9.8 notes](https://www.openssh.org/txt/release-9.8) disabled it at compile time (portable OpenSSH needs `--enable-dsa-keys`) and 10.0 removed it, so `+ssh-dss` cannot work in a 10.x client.

A working connection can still print a warning. OpenSSH [10.1](https://www.openssh.org/txt/release-10.1) (October 2025) added "a warning when the connection negotiates a non-post quantum key agreement algorithm," controlled by the `WarnWeakCrypto` option. The ssh_config(5) manual says the `no-pq-kex` flag disables only that warning. Cisco's 17.12 defaults list no post-quantum method, so expect the warning even after the fix. It is not a failure.

## How do you connect once without weakening every other host?

Append the algorithm for a single command. The [OpenSSH legacy page](https://www.openssh.org/legacy.html) explains that "The '+' before the list instructs ssh to append the algorithm to the client's default set rather than replacing the default," and adds that "By appending, you will automatically upgrade to the best supported algorithm when the server starts supporting it." The man page agrees that `+` appends, `-` removes and `^` moves entries to the front.

```bash
# Key exchange: use the strongest name in "Their offer"
ssh -oKexAlgorithms=+diffie-hellman-group14-sha1 admin@10.10.10.2

# Only group1 on offer (a school IT blog reports this on IOS 12.x)
ssh -oKexAlgorithms=+diffie-hellman-group1-sha1 admin@10.10.10.2

# Then the host key, if the next error names ssh-rsa
ssh -oKexAlgorithms=+diffie-hellman-group14-sha1 -oHostKeyAlgorithms=+ssh-rsa admin@10.10.10.2
```

Leave the `+` off and the option replaces the whole default list, which drops every modern algorithm. A [school IT blog](https://techblog.glendaleacademy.org/cisco/openssh-and-cisco) shows that form for IOS 12.x devices reached from Ubuntu 16.04, whose `Their offer` line listed only group1. It works against such a switch but would fail against any better one.

Pick the name from the offer, not from habit. Two owner reports show a switch offering `diffie-hellman-group-exchange-sha1,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1`, [one on a C3560-CX](https://chrisjhart.com/Cisco-IOS-SSH-Key-Exchange-Algorithms/) and [one from a Raspberry Pi](https://gist.github.com/rdapaz/015a4a3f95e51a12b1871091f8fd5305), and both fixes enabled group1 even though group14 was on offer. Under RFC 9142 group14 is the better choice.

Check that the client build knows the name before blaming the switch. Per [ssh(1)](https://man.openbsd.org/ssh), `ssh -Q kex` lists the supported key exchange algorithms, `ssh -Q key-sig` all key types and signature algorithms, and `ssh -Q cipher` the symmetric ciphers. To test whether a switch can do better than SHA-1 at all, the 8.2 notes give a command: connect "after removing the ssh-rsa algorithm from ssh(1)'s allowed list."

```bash
ssh -oHostKeyAlgorithms=-ssh-rsa admin@10.10.10.2
```

If that fails with no other host key type available, the notes say "the server software on that host should be upgraded." The manual allows `-v` up to three times for more detail on any step.

## What goes in ~/.ssh/config for one switch, and how does ssh -G confirm it?

A `Host` block scopes the options to one device. The block extends the stanza in the 8.8 release notes, which sets `HostkeyAlgorithms` and `PubkeyAcceptedAlgorithms` for one old host, with a `KexAlgorithms` line added.

```text
# ~/.ssh/config
Host sw-closet
    HostName 10.10.10.2
    User admin
    KexAlgorithms +diffie-hellman-group14-sha1
    HostKeyAlgorithms +ssh-rsa
    PubkeyAcceptedAlgorithms +ssh-rsa

Host *
    ServerAliveInterval 30
```

Two ssh_config(5) rules decide whether this works. First, "for each configuration directive, the first specified value will be used," so "more host-specific declarations should be given near the beginning of the file." Put the switch block above `Host *`. Second, a `Host` block applies to the declarations that follow "up to the next Host or Match keyword," and a single `*` gives global defaults. Never put the legacy options under `Host *`, because the client would then accept the weak algorithms from every server.

`ssh -G` shows what the client will do without connecting. The manual says it "causes ssh to print its configuration after evaluating Host and Match blocks and exit."

```bash
ssh -G sw-closet | grep -i -E '^(kexalgorithms|hostkeyalgorithms|pubkeyacceptedalgorithms) '
ssh -G some-linux-host | grep -i -E '^(kexalgorithms|hostkeyalgorithms) '
```

For the switch, each list should end with the name you appended. For an unrelated host the lists should be the unmodified defaults, which is the point of scoping. If the switch output shows no change, a more general `Host` pattern earlier in the file set the value first, or the name typed on the command line does not match the `Host` pattern.

`PubkeyAcceptedAlgorithms` matters only for public key login. The 8.8 notes say the workaround covers "connection and/or user authentication," and the 8.5 notes renamed the old `PubkeyAcceptedKeyTypes` keyword to it. Password login needs only the first two lines. For key setup see [SSH key-based authentication](/blog/ssh-key-based-authentication), and for how a bare `KexAlgorithms` line replaces the default list, see [SSH hardening for Linux servers](/blog/ssh-hardening-linux-servers).

## How do you make a classic IOS 15 switch offer something better?

Do it from the console. On classic IOS the options come down to the key, the SSH version and the Diffie-Hellman size. The sequence follows the hostname, domain name and key steps in Cisco's [15E guide](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_usr_ssh/configuration/15-e/sec-usr-ssh-15-e-book/sec-secure-shell-v2.html).

```text
Switch# configure terminal
Switch(config)# hostname sw-closet
sw-closet(config)# ip domain-name lab.example
sw-closet(config)# crypto key generate rsa modulus 2048
sw-closet(config)# ip ssh version 2
sw-closet(config)# ip ssh dh min size 2048
sw-closet(config)# end
sw-closet# show ip ssh
```

The pieces, with IOS mode basics in [Cisco IOS fundamentals](/blog/cisco-ios-fundamentals):

- **SSH version.** Cisco's [command reference](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/security/d1/sec-d1-cr-book/sec-cr-i3.html) says that without `ip ssh version` the switch runs in "compatibility mode, that is, Version 1 and Version 2 are both supported," and that the `2` keyword makes sure the router "will not inadvertently establish a weaker SSH Version 1 connection."
- **Key size.** The 15E guide says the RSA key pair "must be greater than or equal to 768 bits" for SSH version 2. A 768-bit key satisfies IOS but not current OpenSSH: since 7.6 the client refuses RSA keys under 1024 bits, and [ssh-rsa.c](https://github.com/openssh/openssh-portable/blob/master/ssh-rsa.c) returns `SSH_ERR_KEY_LENGTH` when verifying a signature against a smaller key, which ssherr.c prints as "Invalid key length." RFC 8332 notes that NIST "disallows RSA and DSA keys shorter than 2048 bits for US government use" and calls it "prudent to follow this advice also outside of US government use."
- **Diffie-Hellman size.** The 15E guide says Cisco's SSH has "traditionally used 768-bit modulus," and its feature table lists "DH Group 14 and Group 16 exchange support" for the 15.2(1)E train. The command reference says IOS SSH supports group14-sha1 at 2048 bits and SHA-1 group exchange at 2048 and 4096 bits, negotiates only groups at or above the configured minimum, and defaults `ip ssh dh min size` to 2048, so the sequence above only pins that value. The command was introduced in 12.4(20)T and integrated into 15.1(2)S. On an older image the offer line, not the guide, shows what the switch can do.
- **Algorithm lists.** The command reference shows `ip ssh server algorithm hostkey` arriving in 15.5(1)S and 15.5(2)T, `encryption` in 15.5(2)S, and `kex` in IOS XE 16.3. Type `ip ssh server algorithm ?` to see whether the image has them. The host key command accepts only `x509v3-ssh-rsa` and `ssh-rsa`, so there is no `rsa-sha2` option there, and `no matching host key type found` needs the client option or a newer train.

Generating a new key changes the host key. The next connection prints the `REMOTE HOST IDENTIFICATION HAS CHANGED` warning from [sshconnect.c](https://github.com/openssh/openssh-portable/blob/master/sshconnect.c), and `ssh-keygen -R sw-closet` clears the stale entry, since the [ssh-keygen(1)](https://man.openbsd.org/ssh-keygen) manual says -R "Removes all keys belonging to the specified hostname (with optional port number) from a known_hosts file." Cisco's [IOS XE guide](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9400/software/release/17-14/configuration_guide/sec/b_1714_sec_9400_cg/secure_shell_version_2_support.html) warns "When you delete the RSA key pair, you automatically disable the SSH server," so use the console.

The 15E guide adds that the SSH server "requires you to have a k9 (Triple Data Encryption Standard [3DES]) software image depending on your release," so a used classic IOS switch on a no-crypto image needs a different image first. For IOS XE hardware, [the used Catalyst 9300 guide](/blog/used-catalyst-9300-for-a-lab) covers the license checks.

## Which IOS XE commands set the lists on a Catalyst 9300, and what does show ip ssh print?

On IOS XE the defaults moved a long way between 16.9 and 17.12. The table collects what Cisco's Catalyst 9300 guides for [16.9](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/16-9/configuration_guide/sec/b_169_sec_9300_cg/m9_169_sec_secure_shell_algorithms_cg.html), [17.3](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/sec/b_173_sec_9300_cg/ssh_algorithms_for_common_criteria_certification.html) and 17.12 list as defaults.

| IOS XE guide | Host key order | Key exchange | Encryption |
|---|---|---|---|
| 16.9 | x509v3-ssh-rsa, ssh-rsa | not in the guide | aes128-ctr, aes192-ctr, aes256-ctr |
| 17.3 | x509v3-ssh-rsa, rsa-sha2-512, rsa-sha2-256, ssh-rsa | not in the guide | aes128-gcm, aes256-gcm, then the CTR ciphers |
| 17.12 | rsa-sha2-512, rsa-sha2-256, ssh-rsa | curve25519-sha256, curve25519-sha256@libssh.org, ecdh-sha2-nistp256, nistp384, nistp521, diffie-hellman-group14-sha256, diffie-hellman-group16-sha512 | chacha20-poly1305, AES-GCM, then the CTR ciphers |

Read this against the OpenSSH timeline. A 9300 on a 16.x image lists `ssh-rsa` as its only plain RSA host key algorithm (`x509v3-ssh-rsa` is the certificate form), so if the guide matches the image, an OpenSSH 8.8 or newer client fails with `no matching host key type found`. By 17.3 the guide adds the two SHA-2 variants, which an 8.8 client accepts without options. For key exchange, the command reference says `ip ssh server algorithm kex` arrived in IOS XE 16.3 with ECDH first and `diffie-hellman-group14-sha1` last, and its supported list has no group1. Cisco's [17.14 guide for the Catalyst 9400](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9400/software/release/17-14/configuration_guide/sec/b_1714_sec_9400_cg/secure_shell_version_2_support.html), which shares the IOS XE 17.x train, adds that "Starting from Cisco IOS XE Release 17.10," `diffie-hellman-group14-sha1` and the `hmac-sha1`, `hmac-sha2-256` and `hmac-sha2-512` MACs are "removed from the default list." The break now runs the other way for an old client that supports none of the remaining methods.

The commands take an ordered list, and the 17.12 guide's syntax shows `ip ssh {server | client} algorithm kex` plus a server-only `hostkey` form. On a 17.12 image, for example:

```text
configure terminal
 ip ssh server algorithm kex curve25519-sha256 ecdh-sha2-nistp256 diffie-hellman-group14-sha256
 ip ssh server algorithm hostkey rsa-sha2-512 rsa-sha2-256
 end
show ip ssh
```

To admit an old client instead, append `diffie-hellman-group14-sha1`, which the 17.12 guide lists as supported but not default. The command reference shows the rejection `% SSH command rejected: All kex algorithms cannot be disabled` if the last method is removed, a `no` form removes one algorithm at a time, and `default ip ssh server algorithm kex` restores the default order.

`show ip ssh` prints the active lists. Cisco's 17.3 sample shows these lines:

```text
MAC Algorithms: hmac-sha2-256-etm, hmac-sha2-512-etm,hmac-sha2-256,hmac-sha2-512
Hostkey Algorithms: x509v3-ssh-rsa, rsa-sha2-512, rsa-sha2-256,ssh-rsa
```

Trust the device over the page. The 17.3 and 17.12 pages carry typos such as `ssh-rsaa`, and the 17.12 chapter states "Starting from Cisco IOS XE Amsterdam 17.1.1, SHA1 is not supported" while still listing `ssh-rsa` and `hmac-sha1` as supported. To confirm from the client, run the `-ssh-rsa` test from the earlier section: success means the switch signs with SHA-2.

## What if the switch can never be upgraded?

Then the client carries the legacy settings, scoped to that switch.

### Ciphers

`no matching cipher found` appears when nothing in the switch's list is still offered by the client, typically a CBC-only list. OpenSSH 7.6 stopped offering CBC by default and 7.4 removed `3des-cbc` from the client proposal. The fix is `-oCiphers=+aes128-cbc` or a `Ciphers +aes128-cbc` line in the host block. Cisco's command reference lists the 15.5(2)S default order as `aes128-ctr, aes192-ctr, aes256-ctr, aes128-cbc, 3des-cbc, aes192-cbc, aes256-cbc`, so a switch with that default offers CTR first and needs no option.

### PuTTY

PuTTY warns instead of refusing. Its [documentation](https://the.earth.li/~sgtatham/putty/latest/htmldoc/Chapter4.html) says "If the first algorithm PuTTY finds is below the 'warn below here' line, you will see a warning box," and describes Group 1 as "a well-known 1024-bit group, used with the SHA-1 hash function" that "may be the only method supported by very old server software." Its host key list includes DSA, so PuTTY remains an option for DSA-only devices that OpenSSH 10 cannot reach.

### The switch as the client

The same negotiation runs in reverse when a switch copies a configuration to a server with SCP. The [10.0 notes](https://www.openssh.org/txt/release-10.0) say sshd now removes the `diffie-hellman-group*` and `diffie-hellman-group-exchange-*` methods from its default list, so a switch whose client side can only offer finite-field Diffie-Hellman fails against a default 10.x server. The fix has the same shape as before: add the one method the switch can offer back with a `KexAlgorithms +` line in the server's [sshd_config(5)](https://man.openbsd.org/sshd_config), which still lists those methods as supported, or use an IOS XE release whose `ip ssh client algorithm kex` accepts ECDH, as the 17.12 guide lists.

### Which fix goes where

| Symptom | Client fix | Switch fix |
|---|---|---|
| Key exchange error, offer lists group1 only | `+diffie-hellman-group1-sha1` | Newer image with group14 or ECDH |
| Key exchange error, offer includes group14-sha1 | `+diffie-hellman-group14-sha1` | Same |
| `no matching host key type found`, offer `ssh-rsa` | `HostKeyAlgorithms +ssh-rsa` | IOS XE with `rsa-sha2` host keys |
| `Invalid key length` | None; OpenSSH refuses RSA keys under 1024 bits | Regenerate a 2048-bit RSA key |
| `no matching cipher found`, CBC only | `Ciphers +aes128-cbc` | CTR or GCM ciphers on a newer image |

Keep the weakened options on one admin host, limited to a `Host` block for that switch, and reach the switch only from there. The 8.2 notes separate the risks: a SHA-1 collision against a certificate gives an attacker "effectively unlimited time," while forging a host key signature has only "the relatively brief LoginGraceTime window." Neither makes the setting safe for general use, so retire the switch when the budget allows. Anyone running an [SSH certificate authority](/blog/ssh-certificate-authority) should also note that 8.2 removed `ssh-rsa` from the accepted CA signature algorithms.

## Sources

- [OpenSSH: Legacy algorithms](https://www.openssh.org/legacy.html)
- [OpenSSH: Release notes 7.0](https://www.openssh.org/txt/release-7.0)
- [OpenSSH: Release notes 7.2](https://www.openssh.org/txt/release-7.2)
- [OpenSSH: Release notes 7.4](https://www.openssh.org/txt/release-7.4)
- [OpenSSH: Release notes 7.6](https://www.openssh.org/txt/release-7.6)
- [OpenSSH: Release notes 8.2](https://www.openssh.org/txt/release-8.2)
- [OpenSSH: Release notes 8.5](https://www.openssh.org/txt/release-8.5)
- [OpenSSH: Release notes 8.8](https://www.openssh.org/txt/release-8.8)
- [OpenSSH: Release notes 9.8](https://www.openssh.org/txt/release-9.8)
- [OpenSSH: Release notes 10.0](https://www.openssh.org/txt/release-10.0)
- [OpenSSH: Release notes 10.1](https://www.openssh.org/txt/release-10.1)
- [OpenBSD: ssh(1) manual](https://man.openbsd.org/ssh)
- [OpenBSD: ssh_config(5) manual](https://man.openbsd.org/ssh_config)
- [OpenBSD: sshd_config(5) manual](https://man.openbsd.org/sshd_config)
- [OpenBSD: ssh-keygen(1) manual](https://man.openbsd.org/ssh-keygen)
- [OpenSSH Portable source: ssherr.c](https://github.com/openssh/openssh-portable/blob/master/ssherr.c)
- [OpenSSH Portable source: packet.c](https://github.com/openssh/openssh-portable/blob/master/packet.c)
- [OpenSSH Portable source: kex.c](https://github.com/openssh/openssh-portable/blob/master/kex.c)
- [OpenSSH Portable source: kex-names.c](https://github.com/openssh/openssh-portable/blob/master/kex-names.c)
- [OpenSSH Portable source: ssh-rsa.c](https://github.com/openssh/openssh-portable/blob/master/ssh-rsa.c)
- [OpenSSH Portable source: sshconnect.c](https://github.com/openssh/openssh-portable/blob/master/sshconnect.c)
- [IETF: RFC 4253, The Secure Shell (SSH) Transport Layer Protocol](https://www.rfc-editor.org/rfc/rfc4253)
- [IETF: RFC 8332, Use of RSA Keys with SHA-256 and SHA-512 in the Secure Shell (SSH) Protocol](https://www.rfc-editor.org/rfc/rfc8332)
- [IETF: RFC 9142, Key Exchange (KEX) Method Updates and Recommendations for Secure Shell (SSH)](https://www.rfc-editor.org/rfc/rfc9142)
- [Logjam researchers: Weak Diffie-Hellman and the Logjam Attack](https://weakdh.org/)
- [Logjam researchers: Logjam, PFS Deployment Guide](https://weakdh.org/sysadmin.html)
- [Cisco: Cisco IOS Security Command Reference, Commands D to L, ip source-track through ivrf](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/security/d1/sec-d1-cr-book/sec-cr-i3.html)
- [Cisco: Secure Shell Configuration Guide, IOS Release 15E, Secure Shell Version 2 Support](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_usr_ssh/configuration/15-e/sec-usr-ssh-15-e-book/sec-secure-shell-v2.html)
- [Cisco: Security Configuration Guide, Cisco IOS XE 17.14.x (Catalyst 9400 Switches), Secure Shell Version 2 Support](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9400/software/release/17-14/configuration_guide/sec/b_1714_sec_9400_cg/secure_shell_version_2_support.html)
- [Cisco: Security Configuration Guide, Cisco IOS XE Fuji 16.9.x (Catalyst 9300 Switches), SSH Algorithms for Common Criteria Certification](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/16-9/configuration_guide/sec/b_169_sec_9300_cg/m9_169_sec_secure_shell_algorithms_cg.html)
- [Cisco: Security Configuration Guide, Cisco IOS XE Amsterdam 17.3.x (Catalyst 9300 Switches), SSH Algorithms for Common Criteria Certification](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-3/configuration_guide/sec/b_173_sec_9300_cg/ssh_algorithms_for_common_criteria_certification.html)
- [Cisco: Security Configuration Guide, Cisco IOS XE Dublin 17.12.x (Catalyst 9300 Switches), SSH Algorithms for Common Criteria Certification](https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-12/configuration_guide/sec/b_1712_sec_9300_cg/ssh_algorithms_for_common_criteria_certification.html)
- [Nmap: ssh2-enum-algos NSE script](https://nmap.org/nsedoc/scripts/ssh2-enum-algos.html)
- [PuTTY: User Manual, Chapter 4, Configuring PuTTY](https://the.earth.li/~sgtatham/putty/latest/htmldoc/Chapter4.html)
- [Christopher Hart: Cisco IOS, 'No matching key exchange found' During SSH](https://chrisjhart.com/Cisco-IOS-SSH-Key-Exchange-Algorithms/)
- [Christopher Hart: Cisco IOS, 'No matching host key type found' During SSH](https://chrisjhart.com/Cisco-IOS-SSH-Key-Type/)
- [Glendale Academy GAA Techblog: OpenSSH and Cisco](https://techblog.glendaleacademy.org/cisco/openssh-and-cisco)
- [GitHub gist (rdapaz): Negotiate SSH](https://gist.github.com/rdapaz/015a4a3f95e51a12b1871091f8fd5305)
