
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

```end`` or `Ctrl+Z`` returns to privileged EXEC from any config mode.

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

## Basic Interface Configuration

```
interface GigabitEthernet0/0
  description UPLINK_TO_CORE
  ip address 10.0.0.1 255.255.255.0
  no shutdown
```

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

## Saving Configuration

```
copy running-config startup-config
```

Or the shortcut: `write`. Always save after making changes. The running config is what is active; the startup config is what loads on boot. They are separate files.

## The IOS Help System

Type `?` at any point to see available commands. This works in all modes. `show ip ?` shows all sub-commands of `show ip`. Learning to use the help system is as important as memorizing specific commands.
