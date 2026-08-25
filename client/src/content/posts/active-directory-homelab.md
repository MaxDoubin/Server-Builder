
## Why Active Directory

Active Directory (AD) is Microsoft's directory service, and it is the backbone of identity management in most enterprise environments. Understanding how AD works, how to configure it, and how to troubleshoot it is essential for anyone working in enterprise networking or cybersecurity.

I set up a full AD domain in my homelab to practice in an environment where mistakes are safe and learning is the priority.

The thing that makes AD worth learning as a security topic specifically is that it is an authentication system, a configuration management system, and a database, all wearing one name. Kerberos handles the authentication (AD implements Kerberos V5, RFC 4120), LDAP is the query interface, DNS is how anything finds anything, and Group Policy is the configuration layer bolted on top. When AD breaks, it is almost never "AD" that broke. It is one of those four.

## The Setup

My AD lab runs on two Windows Server 2022 VMs. One is the primary domain controller, and the other is a secondary domain controller for redundancy. Both are running DNS, which is required for AD to function.

The domain is a standard .local domain (not best practice for production, but fine for a lab). I created organizational units (OUs) for servers, workstations, and users, and applied different Group Policy Objects (GPOs) to each.

It is worth being specific about why `.local` is a bad choice, because "not best practice" undersells it. RFC 6762 reserves the `.local` top-level domain for Multicast DNS. Any host implementing mDNS, which means every Mac, every Linux box running Avahi, and modern Windows, is supposed to resolve `.local` names by multicasting to 224.0.0.251 (or ff02::fb) on UDP 5353 rather than querying your DNS server. The resulting failure is maddening because it is partial: Windows clients join the domain fine while a Mac on the same VLAN cannot resolve the domain controller at all, and nothing in the error mentions mDNS. The correct choice is a subdomain of a domain you actually own, such as `ad.example.com`.

Two more setup details matter more than they look. Each DC should point its primary DNS at the *other* DC and its secondary at itself; a DC pointing only at itself can end up in the "island" state where it cannot locate replication partners after a reboot. And do not hand out a public resolver to domain-joined clients over DHCP. The single most common domain join failure, "An Active Directory Domain Controller for the domain could not be contacted," is almost always a client using 8.8.8.8, which has no idea your `_ldap._tcp.dc._msdcs` records exist. Point clients at the DCs and configure forwarders on the DCs instead.

## Group Policy

Group Policy is where AD gets powerful. GPOs let you enforce configuration across every machine and user in the domain. I have policies for:

- Password complexity and rotation requirements
- Disabling USB storage on workstations
- Configuring Windows Firewall settings
- Deploying software packages automatically
- Restricting which users can log into specific machines

The GPO inheritance model takes some time to understand, but once you get it, you can manage hundreds of machines from a single console.

The processing order is LSDOU: Local policy, then Site, then Domain, then each OU from the top of the tree down. Later processing wins, which is why an OU-level setting beats a domain-level one. Two modifiers change this. Enforced (formerly "No Override") on a link makes that GPO win over anything processed later, and Block Inheritance on an OU stops inherited GPOs from applying. Enforced beats Block Inheritance, always.

The part that reliably confuses people is link order within a single OU. When several GPOs are linked at one OU, link order 1 is applied *last*, which means it wins. The number in the GUI is a priority, not a sequence, and it reads backwards from how it behaves.

Clients refresh policy on a 90 minute interval with a random offset of 0 to 30 minutes, so the real worst case is two hours. Domain controllers refresh every 5 minutes. If you change a GPO and nothing happens, that is usually all it is, and `gpupdate /force` on the client settles the question. Some settings, notably software installation and folder redirection, only apply at boot or logon regardless.

Two failure modes worth knowing before you hit them:

**Password policy on an OU does nothing.** Domain account policy comes from GPOs linked at the *domain* level and applies to the whole domain. Linking a GPO with password settings to the Users OU is a no-op, and there is no warning. The classic Default Domain Policy values are a 42 day maximum password age, a 7 character minimum length, 24 remembered passwords, and account lockout disabled. If you need different policies for different groups, the mechanism is Fine-Grained Password Policies, which are PSO objects applied to groups and require a domain functional level of Windows Server 2008 or higher.

**Security filtering silently breaks after MS16-072.** Since the June 2016 update, GPOs are retrieved in the computer's security context rather than the user's. If you tighten security filtering on a user-targeted GPO by removing Authenticated Users, the computer can no longer read the GPO, and the policy stops applying to everyone. The fix is to leave Authenticated Users (or Domain Computers) with Read permission while granting Apply only to your target group. Any guide written before mid-2016 gets this wrong.

Be honest about software deployment. GPO software installation handles MSI packages only, installs at boot for computer-assigned packages, needs the client to reach the distribution share at that moment, and has no reporting worth the name. It demonstrates the concept and handles a handful of machines. Real fleets use Intune, Configuration Manager, or winget driven by something with actual state tracking.

## DNS Integration

AD depends heavily on DNS. Every domain controller registers SRV records that clients use to find the DC. If DNS is broken, AD is broken. I learned this the hard way when a misconfigured DNS forwarder caused domain joins to fail. The error messages were unhelpful, and it took significant time to trace the problem back to DNS.

Always check DNS first. If AD is not working, DNS is the most likely culprit.

The records in question are SRV records as defined in RFC 2782, and they live in a predictable place. `_ldap._tcp.dc._msdcs.<domain>` lists the domain controllers, `_kerberos._tcp.<domain>` lists the KDCs, and `_gc._tcp.<domain>` lists global catalog servers. You can check them from any client without special tooling:

```
nslookup -type=srv _ldap._tcp.dc._msdcs.ad.example.com
```

If that returns nothing, stop troubleshooting AD and fix DNS. If it returns a DC that no longer exists, you have stale records, which happens when a DC is removed without a clean demotion.

Time deserves its own paragraph because it is the second most common cause of "AD is broken" and it never announces itself. Kerberos rejects tickets whose timestamps differ from the server's clock by more than the maximum tolerance, which defaults to 5 minutes. Cross that line and authentication fails with KRB_AP_ERR_SKEW while ping, DNS, and everything else look healthy. In a virtualized lab this is a standing hazard: hypervisor guest time synchronization and the domain time hierarchy both try to set the clock, and snapshotting a DC and resuming it hours later reliably breaks logons. The domain's authoritative clock is the PDC Emulator FSMO role holder, so point that one DC at an external NTP source, let everything else follow the domain hierarchy, and disable hypervisor time sync on the DCs.

While on FSMO roles: there are five, two forest-wide (Schema Master, Domain Naming Master) and three per-domain (PDC Emulator, RID Master, Infrastructure Master). Most of them can be offline for a while without anyone noticing, which is exactly why homelabs get bitten. The RID Master hands out pools of 500 relative identifiers to each DC; when a DC exhausts its pool and cannot reach the RID Master, you can no longer create users, groups, or computer accounts on it. Also note the tombstone lifetime, 180 days for any forest built on Server 2003 SP1 or later. A domain controller powered off longer than that cannot be brought back into replication. It has to be forcibly removed from the directory and rebuilt, and if you shut your lab down over a summer, that is the DC you will be rebuilding.

Replication timings are worth knowing so you know when to stop waiting. Within a site, DCs use change notification with about a 15 second delay before the first partner is notified. Between sites, the default replication interval is 180 minutes. A change that has not propagated after three hours is a problem; a change that has not propagated after thirty seconds is normal.

## Security Considerations

AD is a prime target in real-world attacks. Compromising a domain controller means owning the entire domain. In my lab, I practice common attack techniques (in an isolated environment) to understand how they work and how to defend against them. Kerberoasting, pass-the-hash, and DCSync are all things that work if AD is not configured carefully.

Understanding the attacks makes me better at configuring the defenses.

Each of those maps to a specific defense, and the defenses are more interesting than the attacks:

**Kerberoasting** works because any authenticated user can request a service ticket for any account with a Service Principal Name, and that ticket is encrypted with the service account's password hash. The attacker takes it offline and cracks at whatever rate their GPU allows, with no lockout and no failed logon events. Two things make it hard: password length, and encryption type. RC4-HMAC tickets crack orders of magnitude faster than AES256 ones, so forcing AES on service accounts matters. The real answer is group Managed Service Accounts, where Windows generates the password itself and rotates it every 30 days by default. Nobody cracks a random 120 character password.

**Pass-the-hash** works because NTLM authentication proves you know the hash, not the password, so a hash stolen from one machine's memory authenticates elsewhere. The defenses are structural rather than technical: never log on to a workstation with Domain Admin credentials, because doing so places those credentials in that workstation's memory where any local admin can take them. That habit is the core of Microsoft's tiered administration model. Add unique local administrator passwords (LAPS) so one compromised local admin hash does not open every machine, and put admin accounts in the Protected Users group, which blocks NTLM for them, forces AES, and caps their TGT at four hours.

**DCSync** is not really an exploit. It is an attacker using the replication protocol as designed, asking a DC for password hashes while claiming to be another DC. It requires the "Replicating Directory Changes" and "Replicating Directory Changes All" rights, which legitimately belong only to domain controllers and a small number of service accounts. So the defense is an audit rather than a patch: enumerate who actually holds those rights on the domain object, and remove anyone who should not.

One rule for lab practice: the attack lab must not route to anything you care about. Tools that dump credentials and forge tickets do not know they are in a lab, and neither does a mistyped target IP. Put the domain on an isolated VLAN with no path to your real network.

## References

- https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/get-started/virtual-dc/active-directory-domain-services-overview
- https://learn.microsoft.com/en-us/troubleshoot/windows-server/active-directory/naming-conventions-for-computer-domain-site-ou
- https://www.rfc-editor.org/rfc/rfc6762
- https://www.rfc-editor.org/rfc/rfc2782
- https://www.rfc-editor.org/rfc/rfc4120
- https://attack.mitre.org/techniques/T1558/003/
