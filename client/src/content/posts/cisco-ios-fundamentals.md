
## Navigating IOS Modes

Cisco IOS has several privilege levels and configuration modes:

```
Router>           # User EXEC mode (read-only)
Router# enable    # Privileged EXEC mode (full show commands)
Router# conf t    # Global configuration mode
Router(config)#   # Now in global config

Router(config)# interface GigabitEthernet0/0
Router(config-if)#   # Interface config submode
```

`end` or `Ctrl+Z` returns to privileged EXEC from any config mode. `exit` is different: it goes up exactly one level, so from interface config it lands you in global config, not at the prompt.

The prompt character tells you where you are, and reading it correctly saves a lot of confusion. `>` is user EXEC, privilege level 1, where you can look at very little. `#` is privileged EXEC, privilege level 15, where you can see everything and reload the device. IOS actually supports privilege levels 0 through 15 and you can assign individual commands to intermediate levels, which is how you give a helpdesk read access to interface counters without handing over level 15.

The passwords behind those modes are worth getting right on day one. `enable password` stores the string with Type 7 encryption, which is a Vigenere cipher that any online decoder reverses in a second; it exists for shoulder-surfing, not for security. `enable secret` stores a hash instead. `service password-encryption` only upgrades plaintext passwords to Type 7, so it does not help. Use `enable secret` and, on modern IOS, `enable algorithm-type scrypt secret <password>` for a Type 9 hash.

Two lines belong in every device you will ever type on:

```
no ip domain-lookup
line con 0
  logging synchronous
  exec-timeout 15 0
```

`no ip domain-lookup` stops IOS from treating a mistyped command as a hostname and trying to resolve it, which hangs your session for several seconds while it queries DNS. `logging synchronous` stops log messages from interleaving with the command you are typing. Without it, an interface flapping mid-command makes the line unreadable. `exec-timeout 15 0` logs you out after fifteen idle minutes; `exec-timeout 0 0` disables the timeout entirely and is how forgotten console sessions become an audit finding.

## Essential Show Commands

```
show version           # IOS version, uptime, hardware
show running-config    # Current active configuration
show interfaces        # Interface status, statistics, errors
show ip interface brief # Quick summary of all interfaces
show ip route          # Routing table
show cdp neighbors     # Connected Cisco devices
show vlan brief        # VLAN database (on switches)
show spanning-tree     # STP state
show log               # System log
```

`show ip interface brief` has two status columns and the combination is a diagnosis, not just a status:

- `up / up` is working.
- `up / down` means layer 1 is fine and layer 2 is not: an encapsulation mismatch on a serial link, or keepalives not being answered.
- `down / down` is physical: no cable, wrong cable, or the far end is off.
- `administratively down / down` means somebody typed `shutdown`. Every Cisco router interface ships shut down by default, which is why a brand new interface with a correct IP address passes no traffic until you type `no shutdown`.

`show interfaces` gives you the error counters, and the two that actually mean something specific are CRC errors and late collisions. A handful of CRCs over months is cable noise. CRC errors climbing steadily on one side plus late collisions on the other is a duplex mismatch, which happens when one end is hard-coded to full duplex and the other autonegotiated to half. The link works, throughput is terrible, and nothing reports an error. Fix it by setting both ends to autonegotiate, or both ends hard-coded, never one of each.

Remember that all of those counters are cumulative since boot or since the last `clear counters`. A device with 400 CRC errors and 300 days of uptime is fine. Run `clear counters`, wait five minutes, and look again if you want to know whether the problem is happening now.

`show cdp neighbors` uses Cisco Discovery Protocol, which advertises every 60 seconds with a 180 second hold time, so a neighbour that just went away lingers for up to three minutes. CDP is Cisco proprietary and layer 2, meaning it does not cross a router, and it broadcasts your device model, IOS version, and the port you are plugged into to anything on the wire. Run `no cdp enable` on ports facing users or untrusted networks. LLDP, standardised as IEEE 802.1AB, does the same job across vendors and is off by default on IOS until you type `lldp run`.

The output filters are the other half of the help system. `show run | include ip address` greps, `show run | section interface` prints whole configuration blocks, and `show run | begin router bgp` starts output at the first match. `terminal length 0` turns off the `--More--` paging so you can capture a full config into a terminal log.

## Basic Interface Configuration

```
interface GigabitEthernet0/0
  description UPLINK_TO_CORE
  ip address 10.0.0.1 255.255.255.0
  no shutdown
```

The `description` is not decoration. It is the only place the answer to "what is plugged into this port" lives, and it shows up in `show ip interface brief` output on modern IOS and in most monitoring tools.

Interface naming differs between platforms and it trips people up. On a router, `GigabitEthernet0/0` is slot/port. On a stackable switch, `GigabitEthernet1/0/1` is switch-number/module/port, so the leading `1` is the stack member, not the slot. Type the wrong form and IOS reports an invalid interface rather than telling you the naming scheme changed.

## VLAN Configuration on Switches

```
vlan 100
  name SERVERS

interface GigabitEthernet1/0/1
  switchport mode access
  switchport access vlan 100

interface GigabitEthernet1/0/24
  switchport mode trunk
  switchport trunk allowed vlan 100,200,300
```

The VLAN ID field in an 802.1Q tag is 12 bits, giving 0 through 4095, with 0 and 4095 reserved, so the usable range is 1 to 4094. Cisco splits that into the normal range 1 to 1005, of which 1002 to 1005 are reserved for legacy Token Ring and FDDI, and the extended range 1006 to 4094. VTP versions 1 and 2 cannot propagate extended-range [VLANs](/blog/vlan-segmentation-guide), so a VLAN 2000 created on one switch will not appear on its VTP neighbours. VLAN 1 exists by default and cannot be deleted.

The 802.1Q tag adds four bytes to the frame, taking the maximum from 1518 to 1522. Any device in the path that does not accept these baby giants drops full-size tagged frames while small ones pass, producing the maddening symptom where ping works and file transfers hang.

Now the line in that config block that causes real outages: `switchport trunk allowed vlan 100,200,300` **replaces** the entire allowed list. Type it on a live trunk that was carrying VLANs 10, 20, and 30 and you have just cut those three VLANs off the link. The command you want when adding is `switchport trunk allowed vlan add 400`, and there is a matching `remove` keyword. Check with `show interfaces trunk` before and after, every time.

Two more trunk facts. First, the Cisco default on many switch ports is `switchport mode dynamic auto`, which negotiates via DTP. Two `dynamic auto` ports both wait for the other to start and never form a trunk. Always configure both ends explicitly and add `switchport nonegotiate` on the trunk so DTP frames stop leaving the port at all. Second, the native VLAN, VLAN 1 by default, is the one carried untagged across a trunk. If the two ends disagree about which VLAN that is, untagged traffic silently lands in the wrong VLAN on the far side. CDP detects and logs this as a native VLAN mismatch, which is one of the few times CDP earns its keep.

## Saving Configuration

```
copy running-config startup-config
```

Or the shortcut: `write`. Always save after making changes. The running config is what is active; the startup config is what loads on boot. They are separate files.

Specifically, the running config lives in RAM and the startup config lives in NVRAM. Every command you type takes effect the instant you press Enter and is gone on the next power cycle until you copy it. There is no "apply" step and no confirmation, which is the opposite of how NX-OS, IOS XR, and Junos work with their candidate configurations and explicit `commit`.

The practical consequence is that a mistake on a remote device locks you out immediately, and this is where the classic IOS safety net comes in:

```
reload in 10
! make your risky change, verify you still have access
reload cancel
```

If the change breaks your connectivity, you cannot type `reload cancel`, the device reboots in ten minutes, and it comes back on the last saved startup config. Nobody has to drive to the site. Do not save the config until you have cancelled the reload.

For a real rollback capability rather than a blunt reboot, `archive` with `path` configured plus `configure replace` lets you roll back to a stored configuration file, but it only works if you set it up before you needed it. Config register `0x2102` is the normal default and means boot from flash and load the startup config; `0x2142` tells the router to skip the startup config, which is the password recovery procedure and also a good way to accidentally boot a blank device.

## The IOS Help System

Type `?` at any point to see available commands. This works in all modes. `show ip ?` shows all sub-commands of `show ip`. Learning to use the help system is as important as memorizing specific commands.

The spacing before `?` changes what you get. `show ip?` with no space lists commands starting with "ip". `show ip ?` with a space lists the arguments that can follow `show ip`. Tab completes a partial keyword, and IOS accepts any abbreviation that is unambiguous, which is why `sh ip int br` works and `s` alone does not.

From inside configuration mode you do not need to leave to run a show command: `do show ip interface brief` works from any config prompt. And when IOS answers a command with `% Invalid input detected at '^' marker`, the caret points at the exact character where parsing failed. Read the caret position before you retype the whole line.

## References

- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9500/software/release/17-16/command_reference/b_1716_9500_cr/using_the_command_line_interface.html
- https://www.cisco.com/c/en/us/td/docs/ios/fundamentals/command/reference/cf_book/cf_c1.html
- https://www.cisco.com/c/en/us/td/docs/routers/ios/config/17-x/syst-mgmt/b-system-management/m_cm-config-files-0.html
- https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst2960/software/release/15-0_2_se/configuration/guide/scg2960/swvlan.html
- https://en.wikipedia.org/wiki/IEEE_802.1Q
- https://en.wikipedia.org/wiki/Cisco_Discovery_Protocol
