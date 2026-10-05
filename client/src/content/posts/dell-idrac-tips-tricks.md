
## Beyond the Basics

Most people use iDRAC for its virtual console and power controls. But iDRAC 9 has features that make server management significantly easier if you take the time to set them up.

Before any of it: check your license tier, because it decides what you actually have. iDRAC9 ships in Basic, Express, and Enterprise, with a Datacenter tier above that. **Virtual Console and Virtual Media require Enterprise.** A used PowerEdge bought off eBay very often arrives with Express, which means the two features people assume are built in simply are not there, and the buttons in the web UI are grayed out with no explanation of why. Dell offers a 30 day Enterprise trial you can activate from the licensing page to confirm that is what you are looking at before you go buy a license.

The installed license is listed under Configuration, then Licenses. Express still covers health monitoring, power control, the Lifecycle Controller and the Redfish API. Datacenter adds telemetry streaming and finer thermal controls that matter at fleet scale and almost nowhere else.

Two more things to get right on day one. Newer PowerEdge systems no longer ship with the old `root` / `calvin` default; they generate a unique password at the factory and print it on the pull-out information tag on the front of the chassis. That is better, but the credential is still written on the outside of the box, so change it. And if the chassis has a dedicated iDRAC network port, use it rather than shared-LOM mode. In shared mode the iDRAC rides on a host NIC, so the day you reconfigure bonding or a VLAN on the host you lose out-of-band access to the machine you were trying to fix, which defeats the entire point of out-of-band management. It also puts your management plane on your data plane, so a compromised host is one VLAN away from the controller that owns it.

## Virtual Media

Virtual Media lets you mount an ISO file from your workstation to the server's virtual optical drive. This means you can install an operating system remotely without burning a disc or plugging in a USB drive. I use this constantly for OS installations and recovery boot media.

To use it, open the virtual console, go to Virtual Media, and map your local ISO file. The server sees it as a physical DVD drive.

It works, but understand the data path: every block the server reads travels from your workstation's disk, through the browser, across the network to the iDRAC, and into the emulated drive. Over a LAN that is tolerable. Over a VPN or a slow uplink a Windows Server installation can genuinely take hours, and if your laptop sleeps or the browser tab closes, the mount drops and the install dies partway through.

The fix is Remote File Share, also an Enterprise feature, which tells the iDRAC to mount the ISO itself from an NFS or CIFS share, taking your workstation out of the loop entirely:

```bash
racadm -r 10.0.10.31 -u lab-admin -p '...' remoteimage -c \
  -l //10.0.10.20/isos/ubuntu-24.04-live-server-amd64.iso
```

Pair it with a one-shot boot override so you do not have to catch F11 on the console:

```bash
racadm set iDRAC.serverboot.FirstBootDevice VCD-DVD
racadm set iDRAC.serverboot.BootOnce Enabled
racadm serveraction powercycle
```

`BootOnce` matters. Without it the server boots the virtual CD on every restart, including the one at the end of the installer, and you get to watch the installation start over.

PXE is the other way off the slow path. Either one leaves browser-mounted media for what it does well: rescue work and small driver images.

## Automated Alerts

iDRAC can send email alerts for hardware events: disk failures, memory errors, temperature warnings, power supply issues, and more. Configure SMTP settings in iDRAC and select which events trigger alerts.

I have alerts configured for anything that indicates a hardware problem. Getting an email about a predictive disk failure gives me time to order a replacement before the drive actually dies.

The configuration is layered, and missing a layer is why people report that alerts "do not work." You need the global alert switch on, the SMTP server configured, at least one destination email address enabled, and the specific event category and severity selected in the alert filter grid. All four. Turning on the SMTP server and adding an address does nothing if the category filter is still empty.

The other trap is authentication. Older iDRAC9 firmware had no SMTP authentication or TLS at all, so it could only relay through a server that accepted unauthenticated mail from its IP. Support for SMTP authentication and SSL/TLS arrived in later 4.x firmware. If you are on older firmware, or you just want this to be reliable, point iDRAC at a small Postfix or msmtp relay on your LAN and let that host deal with Gmail or your provider. That also means one place to fix when a provider changes its rules, rather than one per server.

Note that [IPMI](/blog/ipmi-remote-management) Platform Event Traps and email alerts are separate mechanisms. `iDRAC.IPMILan.AlertEnable` governs the former and is unrelated to whether email goes out, which is a common source of confusion when copying racadm snippets around.

Email is not the only transport either. On an Enterprise license, remote [syslog](/blog/syslog-centralized-logging) is worth configuring alongside it, because it gets the System Event Log and the Lifecycle log off the BMC and into the same place as everything else you search. SNMP traps make sense if you already run a trap receiver, and Redfish EventService subscriptions are the modern option: the iDRAC pushes JSON events to an HTTP endpoint you control.

Set NTP on the controller while you are in there. A BMC with a drifting clock timestamps its own logs wrongly, which makes lining up a hardware event against an application log much harder than it needs to be, and it will break certificate validation once you replace the self-signed certificate.

## Firmware Updates

iDRAC can update server firmware (BIOS, iDRAC itself, drive firmware, NIC firmware) from its web interface. Dell hosts a firmware catalog that iDRAC can check against your current versions and identify what needs updating.

That check is the Lifecycle Controller's repository update: it compares every installed component against the catalog and stages only the updates that apply. It can pull from downloads.dell.com directly or from a local repository built with Dell Repository Manager, which is what you want once your iDRACs sit on a management network with no route to the internet.

I schedule firmware reviews quarterly. Keeping firmware current prevents known bugs and closes security vulnerabilities.

Order matters. Update the iDRAC and Lifecycle Controller firmware **first**, then BIOS, then everything else. The iDRAC is what applies the other updates, so an old iDRAC applying a new BIOS package is the combination most likely to fail. Updates that require a host reboot are staged into the Lifecycle Controller and applied during the next boot, which can leave the machine sitting at a blank screen for 20 to 40 minutes. Do not power cycle it there. Interrupting an iDRAC flash is one of the few ways to genuinely brick a PowerEdge. iDRAC keeps exactly one previous version available for rollback, so you can back out one bad update but not two.

When an update does fail, the classic symptom is that everything you schedule afterward sits at "Scheduled" forever and nothing ever runs, or that new jobs are refused because the Lifecycle Controller reports it is in use. A stuck job at the head of the queue blocks every job behind it. The fix is one command and it is the single most useful piece of racadm trivia there is:

```bash
racadm jobqueue view
racadm jobqueue delete -i JID_CLEARALL_FORCE
```

While you are collecting recovery commands: `racadm racreset` soft-resets the iDRAC itself in about two minutes without touching the running host. An iDRAC that has been up for a year and has become slow, or whose web UI has stopped loading, is almost always fixed by that, and it is safe to run on a production machine. It is also the next step when a cleared queue still will not accept new jobs.

## Performance Monitoring

The built-in performance monitoring shows real-time and historical CPU, memory, I/O, and power usage. This data is useful for capacity planning and for correlating performance issues with specific hardware events. The power graphs come with Express; the CPU, memory and I/O utilization views need Enterprise.

For anything beyond eyeballing a graph, pull the data out over Redfish rather than scraping the GUI. Redfish is the DMTF's standard management API: HTTPS and JSON, and the same resource tree works against HPE iLO and Lenovo XCC (only the member IDs, like Dell's `System.Embedded.1`, differ), so what you learn is not Dell-specific.

```bash
curl -sk -u lab-admin:'...' \
  https://10.0.10.31/redfish/v1/Chassis/System.Embedded.1/Power | jq .
```

That returns power supply state, voltages, and the current wattage reading as structured data you can graph. Continuous telemetry streaming, as opposed to polling, is a Datacenter license feature.

Keep the scope in mind, though. iDRAC watches hardware, and only hardware. It will tell you a DIMM logged correctable errors and a fan is out of spec. It has no idea that your application is returning 500s, that a filesystem is full, or that a service failed to start. Out-of-band management and OS-level monitoring are two different jobs, and you need both.

## Automating with Redfish

The service root at `/redfish/v1` answers without authentication by design, which makes it a handy reachability test and also means anyone who can route to the BMC learns what it is. Everything below it needs credentials.

The `-k` in the power reading example above disables certificate verification. That is fine on a lab bench and wrong in a script that runs every night. iDRAC ships with a self-signed certificate; issue it one from your internal CA, install it under iDRAC Settings, and drop the flag, as the examples below do. Redfish changes things as well as reading them; power control, for instance, is a POST to an action:

```bash
curl -s -u lab-admin:'...' -X POST -H "Content-Type: application/json" \
  -d '{"ResetType": "On"}' \
  https://10.0.10.31/redfish/v1/Systems/System.Embedded.1/Actions/ComputerSystem.Reset
```

For anything that makes more than a few calls, open a session instead of sending basic auth with every request. Dell describes basic auth as the equivalent of logging in and out on every operation. A session logs in once and returns a token:

```bash
curl -s -D - -o /dev/null -H "Content-Type: application/json" \
  -d @idrac-login.json \
  https://10.0.10.31/redfish/v1/SessionService/Sessions | grep -i -E 'x-auth-token|location'
```

Keeping `UserName` and `Password` in a file like `idrac-login.json` also keeps them out of your shell history. Send the token as an `X-Auth-Token` header on later requests, and `DELETE` the session URI from the `Location` header when you finish, because the iDRAC caps how many sessions can be open at once.

Configuration changes are asynchronous. A request that modifies BIOS or RAID settings typically returns 202 Accepted with a `Location` header pointing at a job, and the change is staged rather than applied. Scripts that assume the setting took effect because the call returned 2xx are the most common Redfish bug there is. Poll the job until it reports Completed, and remember that BIOS changes only apply at the next reboot, which Redfish expresses as an `ApplyTime` of `OnReset` in the `@Redfish.SettingsApplyTime` annotation.

## Lifecycle Controller

The Lifecycle Controller is a separate environment built into iDRAC that provides hardware diagnostics, OS deployment tools, and [RAID](/blog/raid-levels-comparison) configuration. It boots independently of the OS and does not require any installed software. It is essentially a built-in recovery environment that is always available.

You reach it with F10 during POST. Two caveats: it can be disabled in BIOS, in which case F10 does nothing and you will assume the feature is missing; and the Part Replacement feature, which automatically restores firmware and configuration onto a newly installed component, only works if it was enabled *before* you swapped the part. Turn it on now, on every server, so it is there when you need it.

The Lifecycle Controller also keeps its own log, separate from the System Event Log. The SEL records hardware events from sensors; the Lifecycle log records configuration and firmware activity: who changed what, which job ran, which update succeeded. When you are reconstructing why a server rebooted at 3am you need both, and `racadm getsel` and `racadm lclog view` print them.

## Group Manager

With more than one PowerEdge, iDRAC Group Manager gives you a single console for the whole group, running on the iDRACs themselves with no software to install: group health, user accounts and alert settings applied to every member, and inventory export. It needs the Enterprise license, and the catch is how members find each other: over IPv6 link-local networking, so every member has to sit on the same layer 2 segment. That is fine when all your iDRACs share one management VLAN and useless the moment they are in different racks on different subnets. iDRAC8 and older cannot join, and Dell's user guide recommends groups of up to 100 servers. Past that, or across subnets, you are looking at OpenManage Enterprise, a separate appliance you have to run and patch.

## RACADM

For scripting and automation, RACADM is iDRAC's command-line interface. You can configure every iDRAC setting via RACADM commands, which means you can script the setup of multiple servers identically.

```bash
racadm set iDRAC.NIC.DNSRacName LabServer01
racadm set iDRAC.IPMILan.AlertEnable Enabled
racadm set iDRAC.Users.2.Password NewSecurePassword
```

This is how I configure iDRAC on new servers. Run the script, and every setting is applied consistently.

One security note about that third line and about remote racadm generally: **a password on the command line is visible in your shell history and to any user on the box via `ps`.** For remote invocations use a credentials file instead of `-p`, or upload an SSH public key with `racadm sshpkauth` and drive the firmware racadm over SSH with key authentication.

Which brings up the part of iDRAC that matters most for anyone studying security. Anyone who reaches the BMC has something very close to physical access, because it can power cycle the host, mount media and open a console underneath the operating system. Leave IPMI over LAN (UDP 623) disabled unless something specifically needs it. IPMI 2.0's RAKP handshake will hand a password hash for any valid username to an unauthenticated remote attacker for offline cracking (CVE-2013-4786), and cipher suite 0 permits outright authentication bypass on implementations that allow it. Dell's own iDRAC had a critical IPMI flaw of its own in CVE-2014-8272, where predictable session IDs let an attacker inject commands into a privileged session. These are protocol-level problems, not bugs you patch away, which is why Redfish exists. If something genuinely needs IPMI, such as a fencing agent or an older monitoring tool that speaks nothing else, restrict it to the management VLAN and make sure cipher suite 0 stays disabled. Put every iDRAC on a dedicated management VLAN with no route to the internet, and go look at how many are publicly exposed on Shodan if you want a reason to take that seriously.

Keep the BMC's own firmware current, too. It runs signed Dell firmware and supports the sort of detect-and-recover behavior described in NIST SP 800-193, but that only helps if you keep it updated. A BMC three years behind on firmware, reachable from a user VLAN, with IPMI enabled, is a worse security position than having no out-of-band management at all, because it is a permanent way into every server you own that nobody is watching.

## References

- [Integrated Dell Remote Access Controller 9 Version 3.31.31.31 User's Guide](https://downloads.dell.com/topicspdf/idrac_3_31_ug_en-us.pdf)
- [Integrated Dell Remote Access Controller 9 RACADM CLI Guide](https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf)
- [Dell DRAC](https://en.wikipedia.org/wiki/Dell_DRAC)
- [Redfish (specification)](https://en.wikipedia.org/wiki/Redfish_(specification))
- [DMTF Redfish](https://redfish.dmtf.org/)
- [DSP0266: Redfish Specification 1.22.0](https://www.dmtf.org/sites/default/files/standards/documents/DSP0266_1.22.0.pdf)
- [Intelligent Platform Management Interface](https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface)
- [CVE-2013-4786](https://www.cve.org/CVERecord?id=CVE-2013-4786)
- [Multiple Dell iDRAC IPMI v1.5 implementations use insufficiently random session ID values](https://www.kb.cert.org/vuls/id/843044)
- [NIST SP 800-193: Platform Firmware Resiliency Guidelines](https://csrc.nist.gov/pubs/sp/800/193/final)
