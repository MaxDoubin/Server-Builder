
## The problem

A server stops responding. SSH times out, the web app is down, and the machine is in a closet, another building, or a colocation cage two hours away. You do not know whether the kernel panicked, a drive died, the power supply failed, or somebody unplugged the wrong cable. Without out-of-band management you are guessing, and eventually you are driving.

## What is out-of-band management

Out-of-band (OOB) management means you can control and monitor a server independently of the main operating system. Even if the OS is crashed, the disk is failed, or the machine is powered off, you can still access the hardware remotely. This is accomplished through a dedicated management controller that has its own network interface, its own processor, and its own firmware.

On Dell servers, this is called iDRAC. On HP servers, it is iLO. On Supermicro, it is IPMI/BMC. The underlying protocol for all of them is IPMI (Intelligent Platform Management Interface), though each vendor adds their own web interface and features on top.

The generic name for the chip is the BMC, or baseboard management controller: a small system-on-chip soldered to the motherboard with its own RAM and flash. It boots when the server is plugged in, not when the server is powered on. Standby power is enough to run it, which is the whole point.

## Why it matters

In a production environment, walking up to a server to plug in a monitor and keyboard is not always possible. The server might be in a different building, a different city, or a colocation facility where physical access takes time.

In a homelab, it still matters. My servers are in a closet, and I manage them entirely from my desk. If an OS hangs during a kernel update, I can remote into iDRAC, access the virtual console, and fix it without getting up. That might sound like a convenience, but multiply it by dozens of incidents over time and it becomes essential.

The other thing it buys you is evidence. The BMC keeps a system event log that survives OS crashes and reboots, so you can read what the hardware saw instead of reconstructing it from a syslog that stopped mid-sentence.

## How it works

The management controller sits on a dedicated ARM processor on the server motherboard. It has its own ethernet port (or shares one with the host via a feature called shared LOM). It runs its own lightweight OS and web server.

Underneath the web interface, the BMC is a sensor and command bus. Temperature sensors, fan tachometers, voltage rails, and power supply controllers hang off I2C and SMBus links that the BMC polls directly. It does not ask the operating system for any of this, which is why the readings keep working when the OS is gone. Sensor readings and thresholds are published as SDRs (sensor data records), and events that cross a threshold get written to the SEL (system event log).

When you connect to the iDRAC web interface, you can:

- View hardware health (temperatures, fan speeds, power draw)
- Access a virtual console (like plugging in a monitor remotely)
- Mount virtual media (boot from an ISO stored on your workstation)
- Power cycle the server
- Update firmware
- View system event logs

There are two ways to reach the BMC. Over the network, IPMI uses RMCP and RMCP+ on UDP port 623. From the host operating system itself, the BMC is reachable over an internal interface (usually KCS, the keyboard controller style interface), which Linux exposes through the `ipmi_si` and `ipmi_devintf` drivers as `/dev/ipmi0`. That in-band path is how a running server reads its own sensors without touching the network at all.

## A worked example with ipmitool

`ipmitool` is the standard client. Use `-I lanplus` for anything modern, because that selects IPMI 2.0 RMCP+ with encryption rather than the older cleartext IPMI 1.5 session.

```bash
# Is the machine on, and did anything trip?
ipmitool -I lanplus -H 192.0.2.20 -U admin -P 'REDACTED' chassis status
```

Correct output looks like this:

```
System Power         : on
Power Overload       : false
Power Interlock      : inactive
Main Power Fault     : false
Power Control Fault  : false
Power Restore Policy : previous
Last Power Event     :
Chassis Intrusion    : inactive
Front-Panel Lockout  : inactive
Drive Fault          : false
Cooling/Fan Fault    : false
```

Every line reading `false` or `inactive` is what you want. `Drive Fault : true` or `Cooling/Fan Fault : true` tells you the hardware already knows something you do not.

Reading sensors and the event log:

```bash
ipmitool -I lanplus -H 192.0.2.20 -U admin -P 'REDACTED' sdr list
ipmitool -I lanplus -H 192.0.2.20 -U admin -P 'REDACTED' sel list
```

`sdr list` prints one line per sensor with its value and an `ok`, `nc` (non-critical), or `cr` (critical) state. `sel list` prints timestamped hardware events, and that is the log that tells you a power supply dropped input at 03:14.

Power control, when the OS is unreachable:

```bash
ipmitool ... chassis power soft    # ACPI power button event, graceful
ipmitool ... chassis power cycle   # cuts power and brings it back
ipmitool ... chassis identify 60   # blink the chassis ID LED for 60 seconds
```

Serial over LAN is the underrated feature. Configure the host's kernel console on a serial port, tell the BMC to bridge it, and `ipmitool ... sol activate` gives you a text console that works over a slow link and captures boot messages. On the Linux side that means adding something like `console=ttyS0,115200n8 console=tty0` to the kernel command line. Matching the baud rate to the BMC's serial configuration is the part people miss, and a mismatch shows up as a screen of garbage characters rather than an error.

Locally, on the server itself, drop the network arguments entirely and run `ipmitool sensor list` after loading `ipmi_si` and `ipmi_devintf`. If `/dev/ipmi0` does not appear, the platform either has no BMC or is not exposing a KCS interface.

## Setting it up safely

The most important thing is to put your management interfaces on a separate, isolated network. Never put iDRAC or IPMI on the same network as your production traffic. These management interfaces have had security vulnerabilities in the past, and exposing them to the internet is asking for trouble.

I have a dedicated management VLAN that only my administration workstation can reach. The iDRAC interfaces get static IPs on this VLAN, and the firewall blocks all traffic to them from any other segment.

The reason to be this strict is specific, not vague. IPMI 2.0's RAKP session setup returns a hash derived from the user's password to a requester that has not authenticated yet, which means anyone who can send a packet to UDP 623 can collect that hash and crack it offline. That is CVE-2013-4786, it is a property of the protocol rather than one vendor's bug, and the practical mitigation is network isolation plus long random passwords. Cipher suite 0, which some BMCs still accept, is worse: it disables authentication entirely. Disable it if your BMC lets you.

A BMC is also, functionally, a small computer with full control of the host, and its firmware deserves the same patching discipline as anything else on your network.

## Redfish, the successor

IPMI is old and the specification is no longer being developed. The replacement is Redfish, a DMTF standard that does the same job over HTTPS with a JSON REST API instead of raw UDP. Modern iDRAC, iLO, and Supermicro BMCs all speak it, and it is far easier to script:

```bash
curl -sk -u admin:'REDACTED' \
  https://192.0.2.20/redfish/v1/Systems/System.Embedded.1 | jq .PowerState
```

A healthy response is a JSON document describing the system, and that one field returns `"On"` or `"Off"`. If you are writing new automation, write it against Redfish and keep `ipmitool` for the older boxes.

## What breaks

**Shared LOM steals your management access.** If the BMC shares a physical port with the host NIC and you put that port into an LACP bond or change its VLAN tagging, management traffic can stop arriving while the host keeps working. You will not notice until the day you need the console. Use the dedicated management port if the server has one, and test BMC reachability after any change to host networking.

**The BMC hangs but the server keeps running.** BMC firmware is software, and it locks up. The fix is a cold reset of the controller rather than a reboot of the host: `ipmitool mc reset cold` from the host over the in-band interface. That restarts the management controller without touching the running OS, and it saves a trip to unplug the machine.

**Virtual media dies partway through an install.** Mounting an ISO from your workstation means the installer is reading from a network share that can stall, and the symptom is a freeze at a random package. Host the image close to the server rather than serving it from a laptop on WiFi.

**Default credentials outlive the deployment.** Dell historically shipped iDRAC with root/calvin, and used gear bought secondhand very often still has it. Newer PowerEdge systems ship with a unique factory password printed on a tag, which is better, but only if you change it. Change the default password before the interface ever touches a network, and audit accounts with `ipmitool user list 1`.

**Time is wrong, so the event log lies.** BMCs frequently ship with no NTP configured and drift badly. Then you correlate a SEL entry against your syslog and the timestamps are twenty minutes apart, and you chase the wrong event. Point the BMC at the same NTP source as everything else.

## Practical tips

Change the default password immediately. Enable HTTPS and disable HTTP. Keep the firmware updated. Set up email alerts for hardware failures so you know about a failed drive before it becomes a failed array. And document the IP addresses and credentials somewhere secure.

Two additions. Test the console before you need it, including virtual media boot, because discovering that Java-only console redirection will not run in your browser is a bad thing to learn during an outage. And script the boring parts: a loop that runs `chassis status` and `sel list` across every BMC and diffs the result against yesterday will find a failing fan long before it takes a machine down.

## References

- https://en.wikipedia.org/wiki/Intelligent_Platform_Management_Interface
- https://en.wikipedia.org/wiki/Out-of-band_management
- https://www.kernel.org/doc/html/latest/driver-api/ipmi.html
- https://wiki.archlinux.org/title/IPMI
- https://en.wikipedia.org/wiki/Redfish_(specification)
- https://csrc.nist.gov/pubs/sp/800/193/final
