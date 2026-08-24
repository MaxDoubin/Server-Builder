
## Why Automate

Configuring network devices manually works fine when you have two switches. When you have ten, or twenty, or a hundred, manual configuration becomes error-prone and time-consuming. Automation ensures consistency, saves time, and reduces human error.

In my lab, I use Python to automate configuration backups, monitoring checks, and bulk configuration changes.

## Netmiko for Device Access

Netmiko is a Python library that simplifies SSH connections to network devices. It handles the quirks of different vendors (Cisco, Fortinet, Juniper, etc.) and provides a clean interface for sending commands and receiving output.

```python
from netmiko import ConnectHandler

device = {
    "device_type": "cisco_ios",
    "host": "10.0.10.2",
    "username": "admin",
    "password": "securepassword",
}

connection = ConnectHandler(**device)
output = connection.send_command("show running-config")
connection.disconnect()

with open("switch_backup.txt", "w") as f:
    f.write(output)
```

This script connects to a Cisco switch, pulls the running configuration, and saves it to a file. I run it nightly on every network device to maintain configuration backups.

## Paramiko for Custom SSH

For tasks where Netmiko's abstraction gets in the way, I use Paramiko directly. Paramiko is the SSH library that Netmiko is built on, and it gives you lower-level control over the SSH connection.

## SNMP with PySNMP

For monitoring, I use PySNMP to query SNMP data from network devices. This lets me pull interface statistics, CPU usage, and environmental data programmatically.

```python
from pysnmp.hlapi import *

iterator = getCmd(
    SnmpEngine(),
    CommunityData("public"),
    UdpTransportTarget(("10.0.10.2", 161)),
    ContextData(),
    ObjectType(ObjectIdentity("SNMPv2-MIB", "sysUpTime", 0))
)

errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
for varBind in varBinds:
    print(f"{varBind[0]} = {varBind[1]}")
```

## Practical Scripts

My most-used automation scripts:

1. **Config backup:** Connects to every network device and saves the running config. Runs nightly via cron.
2. **Port audit:** Checks which ports are up, which are down, and which have errors. Outputs a report.
3. **VLAN audit:** Pulls VLAN assignments from all switches and checks for inconsistencies.
4. **Uptime check:** Queries sysUpTime from all devices and flags any that have rebooted unexpectedly.

Each script is simple, focused, and reliable. They save me hours of manual checking every week.
