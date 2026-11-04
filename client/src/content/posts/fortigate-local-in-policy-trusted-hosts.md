
## The short answer

Trusted hosts and local-in policies are two separate source filters on FortiGate administrative access, and FortiOS checks the local-in policy first. Trusted hosts are a per-account list (`trusthost1` to `trusthost10`, plus `ip6-trusthost1` to `ip6-trusthost10`) where an unset entry means any address. A local-in policy matches traffic addressed to the FortiGate itself by interface, source, destination and service. An ACCEPT match still goes through the account's trusted hosts, and a DENY match drops the connection without consulting them. Two traps follow: one administrator account without trusted hosts keeps the login page reachable from every address, and local-in policies have no implicit deny, so an accept rule for the management subnet does nothing until a deny rule for the same services sits below it. Fortinet's workaround for [CVE-2022-40684](https://www.fortiguard.com/psirt/FG-IR-22-377) and [CVE-2024-55591](https://www.fortiguard.com/psirt/FG-IR-24-535) is exactly that pair of rules, and the second advisory says trusted hosts achieve the same result only when every GUI user has them configured. Local-in policies are CLI-only through FortiOS 7.4 and have a GUI page from 7.6.0. Apply the pair under `cfg-save revert` so a typo reboots into the old configuration, not a lockout.

## What is the difference between trusted hosts and a local-in policy, and which does FortiOS check first?

Fortinet's [FortiOS 7.6.5 Administration Guide](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/363127/local-in-policy) says local-in policies "control inbound traffic that is going to a FortiGate interface," and that trusted hosts "can be configured under an administrator to restrict the hosts that can access the administrative service."

| | Trusted hosts | Local-in policy |
|---|---|---|
| Where it is set | `config system admin`, one list per account | `config firewall local-in-policy` |
| Matches on | Source address | Interface, source, destination, service, schedule |
| Covers | Administrator logins | Per Fortinet, [all traffic destined for the device itself](https://community.fortinet.com/fortigate-3/technical-tip-impact-of-local-in-policies-and-trusted-hosts-configuration-on-fortigate-access-194861) |
| Default | Any IPv4 address (`0.0.0.0 0.0.0.0`) and any IPv6 address (`::/0`), per the [CLI reference](https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/16620/config-system-admin) | None defined in the [7.2.8 guide](https://docs.fortinet.com/document/fortigate/7.2.8/administration-guide/363127/local-in-policy): "no restrictions on local-in traffic" |
| Ping | Not governed since FortiOS 6.0, per a [Fortinet tip](https://community.fortinet.com/fortigate-3/technical-tip-ping-is-allowed-when-trusted-hosts-are-configured-96438) | Can filter it |
| Per-service control | A permitted host reaches every enabled admin protocol | Services chosen in each rule |
| SSO administrators | [Cannot use trusted hosts](https://community.fortinet.com/fortigate-3/technical-tip-system-administrator-best-practices-for-fortigate-and-fortiproxy-92241) | Applies to the source address |

### The local-in policy is checked first

A Fortinet technical tip says local-in policies take effect first for all traffic going directly to the FortiGate, with trusted hosts acting as a second filter. The CIS FortiGate benchmark agrees in its impact note for [item 2.4.6, as reproduced by Tenable](https://www.tenable.com/audits/items/CIS_Fortigate_7.0.x_v1.4.0_L1.audit:a591d12f17e7d64adf905cda79b3b928): local-in policies are processed before trusted host configurations. The [tip on combining them](https://community.fortinet.com/fortigate-3/technical-tip-impact-of-local-in-policies-and-trusted-hosts-configuration-on-fortigate-access-194861) gives the outcomes below.

| Local-in policy result | Trusted hosts | Outcome |
|---|---|---|
| Matches ACCEPT | Source in the list | Allowed |
| Matches ACCEPT | Source not in the list | Dropped by the trusted host check |
| Matches DENY | Not checked | Dropped |
| No policy matches | Source in the list | Allowed |
| No policy matches | Account has no list | Allowed from any address |

The tip's worked example has a local-in accept rule for 10.128.202.0/24 on port1 (10.21.4.84) and an administrator trusted only at 10.128.202.253. A test from 10.128.202.254 matches the accept rule and still fails: a sniffer shows repeated SYN packets to port 443 and no SYN-ACK. The last two rows follow from the tip's statement that trusted hosts decide alone when no local-in policy applies, plus the [CLI default](https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/16620/config-system-admin) of any address.

### The interface setting is a third control

Neither filter turns a service on. A Fortinet [ingress filtering tip](https://community.fortinet.com/fortigate-3/technical-tip-filter-ingress-traffic-going-to-the-fortigate-using-local-in-policy-92952) says a permitted host reaches ICMP, SSH and HTTPS "if these protocols have been activated on the interface," and the [administrator best practices](https://community.fortinet.com/fortigate-3/technical-tip-system-administrator-best-practices-for-fortigate-and-fortiproxy-92241) tip says to run `unset allowaccess` on the external interface, allow only `https ssh` where administration is needed, and "never allow HTTP or Telnet administrative access to a FortiGate interface."

## Why does one admin account without trusted hosts leave the login page open to every address?

Because each account is judged on its own list, and an empty list is the same as `0.0.0.0 0.0.0.0`. The [CLI reference](https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/16620/config-system-admin) describes each entry as "Any IPv4 address or subnet address and netmask from which the administrator can connect to the FortiGate unit" and lists the default as any address, with `::/0` for the `ip6-trusthost` entries. Fortinet's [best practices tip](https://community.fortinet.com/fortigate-3/technical-tip-system-administrator-best-practices-for-fortigate-and-fortiproxy-92241) states the consequence: "If one account is left without configuring a Trusted Host, users will be able to see the FortiGate login page." The advisory for CVE-2024-55591 makes the same point from the other side: ["the trusthost feature achieves the same as the local-in policies above"](https://www.fortiguard.com/psirt/FG-IR-24-535) only if all GUI users are configured with it, and it calls the local-in policies "the preferred workaround."

The table above lists two more gaps: SSO accounts cannot use the list, so only a local-in policy filters them, and ping is outside its scope. A third is display. The CIS remediation for [item 2.4.2](https://www.tenable.com/audits/items/CIS_FortiGate_7.4.x_v1.0.1_L1.audit:ecb99c356cb50a7191ffbd3baa20a9f8) warns that some FortiOS versions show only the first three trusted hosts in the GUI, so audit from the CLI.

Look in each account for a missing `trusthost1` line or a `0.0.0.0 0.0.0.0` value:

```
show system admin
```

A scoped account looks like this. The best practices tip says FortiOS acts on the first match, so put specific entries above any `0.0.0.0 0.0.0.0` entry, and add the VPN subnet for remote administrators:

```
config system admin
    edit "netadmin"
        set trusthost1 192.168.50.0 255.255.255.0
        set trusthost2 10.8.0.0 255.255.255.0
    next
end
```

The same tip warns that losing access to the trusted network leaves console access as the only recovery path. The [rule-order article](/blog/first-match-wins) shows why first-match evaluation makes ordering matter.

## How do you write a local-in policy that allows HTTPS and SSH only from a management subnet?

Create an address group, an accept rule for it, then a deny rule for the same services. This is the structure in Fortinet's workaround for [CVE-2022-40684](https://www.fortiguard.com/psirt/FG-IR-22-377): an address group of management IPs, a first policy accepting HTTP and HTTPS from it, and a second denying both from all sources. The version below adds SSH and uses `lan` as the interface holding the management subnet; substitute your own names.

```
config firewall address
    edit "mgmt-subnet"
        set subnet 192.168.50.0 255.255.255.0
    next
end
config firewall addrgrp
    edit "MGMT_IPs"
        set member "mgmt-subnet"
    next
end
config firewall local-in-policy
    edit 1
        set intf "lan"
        set srcaddr "MGMT_IPs"
        set dstaddr "all"
        set action accept
        set service "HTTPS" "SSH"
        set schedule "always"
        set status enable
    next
    edit 2
        set intf "any"
        set srcaddr "all"
        set dstaddr "all"
        set action deny
        set service "HTTPS" "SSH"
        set schedule "always"
        set status enable
    next
end
```

Policy 2 names the `any` interface, as Fortinet's advisory example does, and Fortinet's [local-in tip](https://community.fortinet.com/fortigate-3/technical-tip-local-in-policy-does-not-work-as-expected-and-forwards-all-traffic-109904) says `any` is how a deny covers every interface. A management host on a second interface therefore needs its own accept rule above it. Enter the accept rule first: Fortinet's [save mode tip](https://community.fortinet.com/fortigate-3/technical-tip-configuration-file-save-mode-for-configuration-changes-96154) says that in the default mode changes take effect "as soon as they are executed by entering either next or end," so each entry is live at its `next`.

### Can one rule do the job with negation?

Yes. Fortinet's [trusted-host impact tip](https://community.fortinet.com/fortigate-3/technical-tip-impact-of-local-in-policies-and-trusted-hosts-configuration-on-fortigate-access-194861) and [login-attempt tip](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053) show a single deny rule with `srcaddr-negate enable`, which denies every source except the group:

```
config firewall local-in-policy
    edit 1
        set intf "any"
        set srcaddr "MGMT_IPs"
        set srcaddr-negate enable
        set dstaddr "all"
        set action deny
        set service "HTTPS" "SSH"
        set schedule "always"
    next
end
```

Negation reads backwards in a ruleset, so keep the services explicit and test from a host outside the group before saving.

### What about custom admin ports and the HA management interface?

If the GUI or SSH listens on a custom port, the services in both rules must match it. [Fortinet's advisory](https://www.fortiguard.com/psirt/FG-IR-22-377) says to create custom service objects that use the administrative port settings and use them in place of HTTP and HTTPS. A [custom-port tip](https://community.fortinet.com/fortigate-3/technical-tip-configure-local-in-policy-to-restrict-unauthorized-administrative-access-with-custom-https-port-222620) explains why: a policy using the default HTTPS service "will not be effective since it has TCP/443 by default." The [best practices tip](https://community.fortinet.com/fortigate-3/technical-tip-system-administrator-best-practices-for-fortigate-and-fortiproxy-92241) moves the ports with `set admin-sport 7734` and `set admin-ssh-port 2345`, which would need services like these:

```
config firewall service custom
    edit "ADMIN-HTTPS"
        set tcp-portrange 7734
    next
    edit "ADMIN-SSH"
        set tcp-portrange 2345
    next
end
```

An HA reserved management interface needs `set ha-mgmt-intf-only enable` in the policy. The 7.6.5 guide says an error is generated without it, and Fortinet's [HA management tip](https://community.fortinet.com/fortigate-3/technical-tip-how-to-configure-a-local-in-policy-on-a-ha-reserved-management-interface-113667) says it "can only be configured in the management VDOM."

## Why do local-in policies have no implicit deny, and how do you add the deny rule yourself?

Fortinet's [7.6.5 guide](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/363127/local-in-policy) states it plainly: "Unlike IPv4 policies, there is no default implicit deny policy," and "The implicit deny policy should be placed at the bottom of the list of local-in-policies." The [ingress tip](https://community.fortinet.com/fortigate-3/technical-tip-filter-ingress-traffic-going-to-the-fortigate-using-local-in-policy-92952) adds that "there is no 'implicit denied' rule created, and then, all the traffic will go to the FortiGate," and names the cost of a catch-all: "SSLVPN, dynamic routing protocols, HA, etc" would be blocked. Name the services in the deny rule instead of using `ALL`.

The default action points the other way. The guide says "if no action is set manually, then the action will default to `deny`." A rule written without `set action` is a deny, so the accept rule must say `accept`. Fortinet's own examples rely on this: the catch-all in the [local-in tip](https://community.fortinet.com/fortigate-3/technical-tip-local-in-policy-does-not-work-as-expected-and-forwards-all-traffic-109904) and the policy in the [interface hardening tip](https://community.fortinet.com/fortigate-3/technical-tip-securing-the-fortigate-administrative-interface-against-brute-force-attacks-226168) carry no action line at all.

| Rules in place | Result |
|---|---|
| Accept rule only | Nothing is blocked. Fortinet's symptom text: "the traffic that is supposed to be denied is all being sent through" |
| Deny rule only | Everyone is denied, including the management subnet |
| Accept, then deny | Intended behavior |
| Deny, then accept | The accept rule is never reached, which is why the guide puts the deny at the bottom of the list |

The guide's own example uses ping: policy 2 accepts PING from 172.16.200.0/24 to port1, policy 3 denies PING from all sources, and other subnets are dropped by policy 3. Its debug flow reads "iprope_in_check() check failed on policy 3, drop," naming the rule that matched.

### What default local-in policy ships on a new unit?

The 7.2.8 guide says "By default, no local-in policies are defined." FortiOS 7.6.1 added a default policy on the `any` interface, per the [7.6 New Features entry](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/695423/enhanced-security-with-default-local-in-policy-7-6-1). It matches the Internet Service sources `Malicious-Malicious.Server`, `Tor-Exit.Node` and `Tor-Relay.Node`, and the 7.6.5 guide says it is "automatically added when a FortiGate is in factory default setting" or a new VDOM is created. The guide says it can be added by hand on 7.4.4 and higher. Fortinet's [interface hardening tip](https://community.fortinet.com/fortigate-3/technical-tip-securing-the-fortigate-administrative-interface-against-brute-force-attacks-226168) warns that a blocklist like this "does not replace trusted hosts or explicit local-in restrictions."

### How do you see what the deny rule blocks?

Local traffic logging is off by default, according to a [Fortinet tip](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053). The 7.6.5 guide gives the CLI below. In the GUI, open Log & Report > Log Settings > Global Settings, set Local traffic logging to Specify, and set "Log local-in traffic" to Per policy. Entries appear under Log & Report > Local Traffic.

```
config log setting
    set local-in-policy-log enable
end
config firewall local-in-policy
    edit 2
        set logtraffic enable
    next
end
```

## Which FortiOS versions show local-in policies in the GUI, and how do you enable the feature?

Creation moved to the GUI in 7.6.0. Before that, only the CLI could write them.

| FortiOS | What changed | Source |
|---|---|---|
| 7.2.x | "Local-in policies can only be created or edited in the CLI" | [7.2.8 guide](https://docs.fortinet.com/document/fortigate/7.2.8/administration-guide/363127/local-in-policy) |
| 7.4.x | Still CLI-only: "configurable only from CLI for FortiOS v7.4 and below"; CLI-created policies are "not displayed in GUI" | [Login-attempt tip](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053), [ingress tip](https://community.fortinet.com/fortigate-3/technical-tip-filter-ingress-traffic-going-to-the-fortigate-using-local-in-policy-92952) |
| 7.4.4 and higher | Internet Service Database objects usable as a source | [7.6.5 guide](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/363127/local-in-policy) |
| 7.4.6 and 7.6.x | SD-WAN zones selectable as the interface | [Fortinet tip](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053) |
| 7.6.0 and higher | Custom policies created and edited under Policy & Objects > Local-In Policy, with IPv4 and IPv6 tabs | [7.6.0 New Features](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/308650/gui-support-for-local-in-policies) |

The GUI page is hidden until feature visibility is on. A [Fortinet tip on the GUI](https://community.fortinet.com/fortigate-3/technical-tip-creating-a-local-in-policy-ipv4-and-ipv6-on-gui-175336) says to enable Local-In Policy under System > Feature Visibility, and gives the CLI equivalent:

```
config system settings
    set gui-local-in-policy enable
end
```

The [login-attempt tip](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053) says GUI creation starts at FortiOS 7.6.6 in one sentence and "Starting v7.6" in another. The 7.6.0 New Features page and several other tips say 7.6.0, so check the unit in front of you. [A poster on the Fortinet forum](https://community.fortinet.com/support-forum-92/fortigate-7-4-5-not-blocking-incoming-management-access-attempts-186610) with a 7.4.5 unit found that a CLI-created policy did not appear in the GUI, which Fortinet staff said was expected. The [FortiOS 7.6 and 7.4 comparison](/blog/fortios-7-6-vs-7-4) covers the other branch differences.

## What did Fortinet's advisories for CVE-2022-40684 and CVE-2024-55591 tell owners to do?

Fortinet pointed owners at this setup in three advisories for FortiOS administrative-interface flaws, and CISA lists three of the four CVEs as exploited, per the [KEV catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog).

| Advisory | CVE and base score | FortiOS affected | Advisory published | CISA KEV |
|---|---|---|---|---|
| [FG-IR-22-377](https://www.fortiguard.com/psirt/FG-IR-22-377) | [CVE-2022-40684](https://nvd.nist.gov/vuln/detail/CVE-2022-40684), 9.8 | 7.0.0 to 7.0.6, 7.2.0 to 7.2.1 | Oct 10, 2022 | [Added 2022-10-11, due 2022-11-01](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2022-40684), 21 days |
| [FG-IR-23-001](https://www.fortiguard.com/psirt/FG-IR-23-001) | [CVE-2023-25610](https://nvd.nist.gov/vuln/detail/CVE-2023-25610), 9.8 | 7.2.0 to 7.2.3, 7.0.0 to 7.0.9, 6.4.0 to 6.4.11, 6.2.0 to 6.2.12 | Mar 7, 2023 | [Not in the KEV catalog](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json); Fortinet knew of no exploitation |
| [FG-IR-24-535](https://www.fortiguard.com/psirt/FG-IR-24-535) | [CVE-2024-55591](https://nvd.nist.gov/vuln/detail/CVE-2024-55591), 9.8 | 7.0.0 to 7.0.16 | Jan 14, 2025 | [Added 2025-01-14, due 2025-01-21](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2024-55591), 7 days |
| [FG-IR-24-535](https://www.fortiguard.com/psirt/FG-IR-24-535) | [CVE-2025-24472](https://nvd.nist.gov/vuln/detail/CVE-2025-24472), 8.1 | 7.0.0 to 7.0.16 | Jan 14, 2025 (CVE added Feb 11, 2025) | [Added 2025-03-18, due 2025-04-08](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2025-24472), 21 days |

Each advisory's workaround for the administrative interface is the same in outline: disable HTTP and HTTPS administrative access, or restrict source addresses with local-in policies. FG-IR-22-377 and FG-IR-24-535 both add custom service objects for non-default ports. [FG-IR-23-001](https://www.fortiguard.com/psirt/FG-IR-23-001) adds that an HA reserved management interface needs a different policy setup, and [FG-IR-24-535](https://www.fortiguard.com/psirt/FG-IR-24-535) calls a non-standard administrator username helpful but not an authentication point, since the websocket does not authenticate. CVE-2025-24472 travels through the Security Fabric, so that advisory's step is `config system csf` with `set status disable`; [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-24472) says it needs the Security Fabric enabled and an attacker who knows the upstream and downstream serial numbers.

Four details:

- **The workaround is a stopgap.** The fixes are upgrades: 7.0.7 or 7.2.2 for CVE-2022-40684, and 7.0.17 for CVE-2024-55591. Whether a used unit can take them depends on its firmware license, which the [FortiGate homelab license article](/blog/fortigate-homelab-license) covers.
- **The exploitation notes are specific.** The FG-IR-22-377 page says Fortinet knew of exploitation, tells owners to check logs for `user=Local_Process_Access`, and reports attackers adding a `super_admin` account named `fortigate-tech-support`. CISA marks all three KEV entries as known to be used in ransomware campaigns.
- **Equal scores, different deadlines.** CVE-2022-40684 and CVE-2024-55591 share the score 9.8 and the vector `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`, yet CISA allowed 21 days for the first and 7 for the second. A base score does not rank them, which is the argument of [A base score is not a queue](/blog/a-base-score-is-not-a-queue).
- **Scores differ between pages.** FortiGuard's FG-IR-24-535 page lists a single 9.8, while NVD shows Fortinet's own 8.1 for CVE-2025-24472, with `AC:H`. Enter the vector in the [CVSS calculator](/tools/cvss-calculator) to watch attack complexity move the score.

## How do you test the lockdown without cutting off your own session?

Use the configuration save mode that undoes a change on a timer. A [Fortinet tip](https://community.fortinet.com/fortigate-3/technical-tip-configuration-file-save-mode-for-configuration-changes-96154) lists three modes: automatic, the default; manual, where commands "take effect but do not become part of the saved configuration"; and revert, which "allows the operator to restore the system to its previous configuration state" if the timer expires before `execute cfg save`. The default timeout is 600 seconds.

```
config system global
    set cfg-save revert
    set cfg-revert-timeout 300
end
```

The [revert-mode tip](https://community.fortinet.com/fortigate-3/technical-tip-using-the-save-option-set-cfg-save-revert-to-automatically-reboot-and-revert-to-a-previous-configuration-of-a-fortigate-93653) says an unconfirmed change makes the FortiGate reload the last saved configuration, that a reboot can follow, and that in an HA pair "all members will reboot and revert to the previous config." On a single homelab firewall that is an outage while the unit restarts, not a console trip.
1. Open a second admin session from an allowed host, and keep console access ready.
2. Turn on revert mode, then enter the accept rule and the deny rule in that order.
3. Test from a host outside the group. The expected result is no login page.
4. Watch the drop with the sniffer and the debug flow below.
5. Confirm from the allowed host that HTTPS and SSH still work and that an administrator with trusted hosts can log in.
6. Run `execute cfg save` before the timer ends. The revert-mode tip says new changes must be saved this way within the timeout. Returning `cfg-save` to `automatic`, the default, is a separate decision, because a unit left in revert mode needs the same save after every later change.

For step 4, repeated SYN packets with no SYN-ACK mean a drop, as in the worked example above. The [CLI essentials article](/blog/fortigate-cli-essentials) explains the sniffer arguments and the debug flow output.

```
diagnose sniffer packet any "host 203.0.113.50 and port 443" 4 0 l
```

Debug flow names the rule that dropped the packet. Fortinet's 7.6.5 guide shows the line to look for, "iprope_in_check() check failed on policy" followed by the ID of your deny rule. The sequence below follows the CLI essentials article, filtered to the outside host:

```
diagnose debug reset
diagnose debug flow filter addr 203.0.113.50
diagnose debug flow show console enable
diagnose debug enable
diagnose debug flow trace start 10
```

The [firewall policy design article](/blog/firewall-policy-design) covers where a management zone fits among forward policies.

## What goes wrong after the lockdown?

**The management subnet is locked out too.** The accept rule has no `set action accept`, sits below the deny, or names the wrong interface. Fix: log in at the console, run `show firewall local-in-policy`, and correct the order and action. Revert mode turns this into a timed reboot instead of a console trip.

**The accept rule matches and the login still fails.** The administrator's trusted hosts do not include the source, which gives the SYN-without-SYN-ACK pattern. Fix: add the subnet, including any VPN subnet, to the account's trusted hosts.

**SSL VPN, routing or HA stops after adding the deny.** Fortinet's [ingress tip](https://community.fortinet.com/fortigate-3/technical-tip-filter-ingress-traffic-going-to-the-fortigate-using-local-in-policy-92952) warns that a blanket deny blocks these, and a deny on HTTPS also matches any other service answering on port 443. Fix: name specific services instead of `ALL`, and move the admin GUI to its own port if another service answers on 443.

**Ping still works from anywhere.** Trusted hosts do not govern ping on management interfaces from FortiOS 6.0. Fix: add an accept rule for the trusted group and a deny for everyone else with the `PING` service, which is the structure in Fortinet's [ping tip](https://community.fortinet.com/fortigate-3/technical-tip-ping-is-allowed-when-trusted-hosts-are-configured-96438).

**A firewall policy that denies the scanners changes nothing.** Firewall policies govern traffic passing through the unit. In a [forum thread](https://community.fortinet.com/support-forum-92/fortigate-7-4-5-not-blocking-incoming-management-access-attempts-186610), a poster's deny policy did not stop attempts on the management interface, and Fortinet staff pointed to local-in policies. Fix: write it as a local-in policy.

## Sources

- [Fortinet Docs: Local-in policy (7.6.5 Administration Guide)](https://docs.fortinet.com/document/fortigate/7.6.5/administration-guide/363127/local-in-policy)
- [Fortinet Docs: Local-in policy (7.2.8 Administration Guide)](https://docs.fortinet.com/document/fortigate/7.2.8/administration-guide/363127/local-in-policy)
- [Fortinet Docs: GUI support for local-in policies (New Features)](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/308650/gui-support-for-local-in-policies)
- [Fortinet Docs: Default local-in policy 7.6.1 (New Features)](https://docs.fortinet.com/document/fortigate/7.6.0/new-features/695423/enhanced-security-with-default-local-in-policy-7-6-1)
- [Fortinet Docs: config system admin (7.2.1 CLI Reference)](https://docs.fortinet.com/document/fortigate/7.2.1/cli-reference/16620/config-system-admin)
- [Fortinet Community: Local-in policies and trusted hosts impact](https://community.fortinet.com/fortigate-3/technical-tip-impact-of-local-in-policies-and-trusted-hosts-configuration-on-fortigate-access-194861)
- [Fortinet Community: Local-in policy against unauthorized logins](https://community.fortinet.com/fortigate-3/technical-tip-use-local-in-policy-to-restrict-unauthorized-login-attempts-to-administrative-access-of-fortigate-158053)
- [Fortinet Community: Local-in policy on the GUI](https://community.fortinet.com/fortigate-3/technical-tip-creating-a-local-in-policy-ipv4-and-ipv6-on-gui-175336)
- [Fortinet Community: Ping is allowed when trusted hosts are configured](https://community.fortinet.com/fortigate-3/technical-tip-ping-is-allowed-when-trusted-hosts-are-configured-96438)
- [Fortinet Community: System administrator best practices](https://community.fortinet.com/fortigate-3/technical-tip-system-administrator-best-practices-for-fortigate-and-fortiproxy-92241)
- [Fortinet Community: Securing the administrative interface](https://community.fortinet.com/fortigate-3/technical-tip-securing-the-fortigate-administrative-interface-against-brute-force-attacks-226168)
- [Fortinet Community: Filter ingress traffic with local-in-policy](https://community.fortinet.com/fortigate-3/technical-tip-filter-ingress-traffic-going-to-the-fortigate-using-local-in-policy-92952)
- [Fortinet Community: Local-in policy forwards all traffic](https://community.fortinet.com/fortigate-3/technical-tip-local-in-policy-does-not-work-as-expected-and-forwards-all-traffic-109904)
- [Fortinet Community: Local-in policy with a custom HTTPS port](https://community.fortinet.com/fortigate-3/technical-tip-configure-local-in-policy-to-restrict-unauthorized-administrative-access-with-custom-https-port-222620)
- [Fortinet Community: Local-in policy on an HA management interface](https://community.fortinet.com/fortigate-3/technical-tip-how-to-configure-a-local-in-policy-on-a-ha-reserved-management-interface-113667)
- [Fortinet Community: Configuration file save mode](https://community.fortinet.com/fortigate-3/technical-tip-configuration-file-save-mode-for-configuration-changes-96154)
- [Fortinet Community: Using cfg-save revert](https://community.fortinet.com/fortigate-3/technical-tip-using-the-save-option-set-cfg-save-revert-to-automatically-reboot-and-revert-to-a-previous-configuration-of-a-fortigate-93653)
- [Fortinet Community forum: FortiGate 7.4.5 not blocking management access](https://community.fortinet.com/support-forum-92/fortigate-7-4-5-not-blocking-incoming-management-access-attempts-186610)
- [FortiGuard PSIRT: FG-IR-22-377](https://www.fortiguard.com/psirt/FG-IR-22-377)
- [FortiGuard PSIRT: FG-IR-23-001](https://www.fortiguard.com/psirt/FG-IR-23-001)
- [FortiGuard PSIRT: FG-IR-24-535](https://www.fortiguard.com/psirt/FG-IR-24-535)
- [NVD: CVE-2022-40684](https://nvd.nist.gov/vuln/detail/CVE-2022-40684)
- [NVD: CVE-2023-25610](https://nvd.nist.gov/vuln/detail/CVE-2023-25610)
- [NVD: CVE-2024-55591](https://nvd.nist.gov/vuln/detail/CVE-2024-55591)
- [NVD: CVE-2025-24472](https://nvd.nist.gov/vuln/detail/CVE-2025-24472)
- [CISA: Known Exploited Vulnerabilities Catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
- [CISA: KEV Catalog JSON feed](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json)
- [CISA: KEV Catalog, CVE-2022-40684](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2022-40684)
- [CISA: KEV Catalog, CVE-2024-55591](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2024-55591)
- [CISA: KEV Catalog, CVE-2025-24472](https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2025-24472)
- [Tenable: CIS FortiGate 7.4.x item 2.4.2, trusted hosts](https://www.tenable.com/audits/items/CIS_FortiGate_7.4.x_v1.0.1_L1.audit:ecb99c356cb50a7191ffbd3baa20a9f8)
- [Tenable: CIS FortiGate 7.0.x item 2.4.6, local-in policies](https://www.tenable.com/audits/items/CIS_Fortigate_7.0.x_v1.4.0_L1.audit:a591d12f17e7d64adf905cda79b3b928)
