
## Beyond the Basics

Most people use iDRAC for its virtual console and power controls. But iDRAC 9 has features that make server management significantly easier if you take the time to set them up.

Before any of it: check your license tier, because it decides what you actually have. iDRAC9 ships in Basic, Express, and Enterprise, with a Datacenter tier above that. **Virtual Console and Virtual Media require Enterprise.** A used PowerEdge bought off eBay very often arrives with Express, which means the two features people assume are built in simply are not there, and the buttons in the web UI are greyed out with no explanation of why. Dell offers a 30 day Enterprise trial you can activate from the licensing page to confirm that is what you are looking at before you go buy a license.

Two more things to get right on day one. Newer PowerEdge systems no longer ship with the old `root` / `calvin` default; they generate a unique password at the factory and print it on the pull-out information tag on the front of the chassis. And if the chassis has a dedicated iDRAC network port, use it rather than shared-LOM mode. In shared mode the iDRAC rides on a host NIC, so the day you reconfigure bonding or a VLAN on the host you lose out-of-band access to the machine you were trying to fix, which defeats the entire point of out-of-band management.

## Virtual Media

Virtual Media lets you mount an ISO file from your workstation to the server's virtual optical drive. This means you can install an operating system remotely without burning a disc or plugging in a USB drive. I use this constantly for OS installations and recovery boot media.

To use it, open the virtual console, go to Virtual Media, and map your local ISO file. The server sees it as a physical DVD drive.

It works, but understand the data path: every block the server reads travels from your workstation's disk, through the browser, across the network to the iDRAC, and into the emulated drive. Over a LAN that is tolerable. Over a VPN or a slow uplink a Windows Server installation can genuinely take hours, and if your laptop sleeps or the browser tab closes, the mount drops and the install dies partway through.

The fix is Remote File Share, which tells the iDRAC to mount the ISO itself from an NFS or CIFS share, taking your workstation out of the loop entirely:

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

## Automated Alerts

iDRAC can send email alerts for hardware events: disk failures, memory errors, temperature warnings, power supply issues, and more. Configure SMTP settings in iDRAC and select which events trigger alerts.

I have alerts configured for anything that indicates a hardware problem. Getting an email about a predictive disk failure gives me time to order a replacement before the drive actually dies.

The configuration is layered, and missing a layer is why people report that alerts "do not work." You need the global alert switch on, the SMTP server configured, at least one destination email address enabled, and the specific event category and severity selected in the alert filter grid. All four. Turning on the SMTP server and adding an address does nothing if the category filter is still empty.

The other trap is authentication. Older iDRAC9 firmware had no SMTP authentication or TLS at all, so it could only relay through a server that accepted unauthenticated mail from its IP. Support for SMTP authentication and SSL/TLS arrived in later 4.x firmware. If you are on older firmware, or you just want this to be reliable, point iDRAC at a small Postfix or msmtp relay on your LAN and let that host deal with Gmail or your provider. That also means one place to fix when a provider changes its rules, rather than one per server.

Note that [IPMI](/blog/ipmi-remote-management) Platform Event Traps and email alerts are separate mechanisms. `iDRAC.IPMILan.AlertEnable` governs the former and is unrelated to whether email goes out, which is a common source of confusion when copying racadm snippets around.

## Firmware Updates

iDRAC can update server firmware (BIOS, iDRAC itself, drive firmware, NIC firmware) from its web interface. Dell hosts a firmware catalog that iDRAC can check against your current versions and identify what needs updating.

I schedule firmware reviews quarterly. Keeping firmware current prevents known bugs and closes security vulnerabilities.

Order matters. Update the iDRAC and Lifecycle Controller firmware **first**, then BIOS, then everything else. The iDRAC is what applies the other updates, so an old iDRAC applying a new BIOS package is the combination most likely to fail. Updates that require a host reboot are staged into the Lifecycle Controller and applied during the next boot, which can leave the machine sitting at a blank screen for 20 to 40 minutes. Do not power cycle it there. Interrupting an iDRAC flash is one of the few ways to genuinely brick a PowerEdge. iDRAC keeps exactly one previous version available for rollback, so you can back out one bad update but not two.

When an update does fail, the classic symptom is that everything you schedule afterward sits at "Scheduled" forever and nothing ever runs. A stuck job at the head of the queue blocks every job behind it. The fix is one command and it is the single most useful piece of racadm trivia there is:

```bash
racadm jobqueue view
racadm jobqueue delete -i JID_CLEARALL_FORCE
```

While you are collecting recovery commands: `racadm racreset` soft-resets the iDRAC itself in about two minutes without touching the running host. An iDRAC that has been up for a year and has become slow, or whose web UI has stopped loading, is almost always fixed by that, and it is safe to run on a production machine.

## Performance Monitoring

The built-in performance monitoring shows real-time and historical CPU, memory, I/O, and power usage. This data is useful for capacity planning and for correlating performance issues with specific hardware events.

For anything beyond eyeballing a graph, pull the data out over Redfish rather than scraping the GUI. Redfish is the DMTF's standard management API: HTTPS and JSON, and the same resource paths work against HPE iLO and Lenovo XCC, so what you learn is not Dell-specific.

```bash
curl -sk -u lab-admin:'...' \
  https://10.0.10.31/redfish/v1/Chassis/System.Embedded.1/Power | jq .
```

That returns power supply state, voltages, and the current wattage reading as structured data you can graph. Continuous telemetry streaming, as opposed to polling, is a Datacenter license feature.

## Lifecycle Controller

The Lifecycle Controller is a separate environment built into iDRAC that provides hardware diagnostics, OS deployment tools, and [RAID](/blog/raid-levels-comparison) configuration. It boots independently of the OS and does not require any installed software. It is essentially a built-in recovery environment that is always available.

You reach it with F10 during POST. Two caveats: it can be disabled in BIOS, in which case F10 does nothing and you will assume the feature is missing; and the Part Replacement feature, which automatically restores firmware and configuration onto a newly installed component, only works if it was enabled *before* you swapped the part. Turn it on now, on every server, so it is there when you need it.

## RACADM

For scripting and automation, RACADM is iDRAC's command-line interface. You can configure every iDRAC setting via RACADM commands, which means you can script the setup of multiple servers identically.

```bash
racadm set iDRAC.NIC.DNSRacName LabServer01
racadm set iDRAC.IPMILan.AlertEnable Enabled
racadm set iDRAC.Users.2.Password NewSecurePassword
```

This is how I configure iDRAC on new servers. Run the script, and every setting is applied consistently.

One security note about that third line and about remote racadm generally: **a password on the command line is visible in your shell history and to any user on the box via `ps`.** For remote invocations use a credentials file instead of `-p`, or upload an SSH public key with `racadm sshpkauth` and drive the firmware racadm over SSH with key authentication.

Which brings up the part of iDRAC that matters most for anyone studying security. Leave IPMI over LAN disabled unless something specifically needs it. IPMI 2.0's RAKP handshake will hand a password hash for any valid username to an unauthenticated remote attacker for offline cracking (CVE-2013-4786), and cipher suite 0 permits outright authentication bypass on implementations that allow it. Dell's own iDRAC had a critical IPMI flaw of its own in CVE-2014-8272, where predictable session IDs let an attacker inject commands into a privileged session. These are protocol-level problems, not bugs you patch away, which is why Redfish exists. Put every iDRAC on a dedicated management VLAN with no route to the internet, and go look at how many are publicly exposed on Shodan if you want a reason to take that seriously.

## References

- https://downloads.dell.com/topicspdf/idrac_3_31_ug_en-us.pdf
- https://downloads.dell.com/topicspdf/v4_00_cliguide_en-us.pdf
- https://en.wikipedia.org/wiki/Redfish_(specification)
- https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface
- https://www.cve.org/CVERecord?id=CVE-2013-4786
- https://www.kb.cert.org/vuls/id/843044
