
## Why automate

You have a rack of switches, a firewall, and a couple of routers, and every Friday you log into each one by hand to copy the running config somewhere safe and confirm nothing has drifted. It works. It also takes an hour, and the one week you skip it is the week something is wrong.

Configuring network devices manually works fine when you have two switches. When you have ten, or twenty, or a hundred, manual configuration becomes error-prone and time-consuming. Automation ensures consistency, saves time, and reduces human error.

In my lab, I use Python to automate configuration backups, monitoring checks, and bulk configuration changes. None of these scripts are clever. They are short, boring, and they run on a schedule, which is exactly what you want from anything that touches network gear.

## Set up an isolated environment first

Do not install network libraries into the system Python. Distributions ship their own packages there, and a `pip install` that upgrades a shared dependency can break unrelated system tools:

```bash
python3 -m venv ~/netauto
source ~/netauto/bin/activate
pip install netmiko pysnmp
pip freeze > requirements.txt
```

Pinning matters more here than in most Python work. Netmiko and PySNMP have both changed their public APIs across major versions, and a script that quietly stops working at 2 a.m. because a dependency moved is not a script you can trust.

## Netmiko for device access

Netmiko is a Python library that simplifies SSH connections to network devices. It handles the quirks of different vendors (Cisco, Fortinet, Juniper, etc.) and provides a clean interface for sending commands and receiving output.

What it does for you is unglamorous and important. It opens an SSH session on TCP port 22, waits for the device prompt, disables paging so output does not stop at a `--More--`, sends your command, and reads until the prompt returns. Every one of those steps is a place where a hand-rolled SSH script breaks against a vendor that does something slightly different.

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

The `device_type` string is not cosmetic. It selects the driver that knows the prompt pattern, the paging command, and how to enter enable and config mode. `cisco_ios`, `cisco_nxos`, `arista_eos`, `juniper_junos`, and `fortinet` are common ones. If you pick the wrong one you usually get a timeout waiting for a prompt that never matches.

Three methods cover almost everything. `send_command(cmd)` runs a show command and waits for the prompt, which is what you want for anything read-only. `send_config_set([...])` takes a list of lines, enters configuration mode, sends them, and exits, handling the mode transitions for you. `send_command_timing(cmd)` reads based on inter-character delay instead of a prompt match, for commands that prompt for confirmation.

## A worked example: nightly backup with change detection

A backup you never look at is half a backup. What I want to know is whether anything changed, and writing the configs into a git repository gives me that for free:

```python
#!/usr/bin/env python3
import logging
from pathlib import Path
from netmiko import ConnectHandler
from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException

logging.basicConfig(filename="/var/log/netbackup.log", level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(message)s")

DEVICES = [
    {"name": "core-sw", "host": "10.0.10.2", "device_type": "cisco_ios"},
    {"name": "access-sw1", "host": "10.0.10.3", "device_type": "cisco_ios"},
]

OUTDIR = Path("/srv/netbackup/configs")
failures = 0

for d in DEVICES:
    params = {
        "device_type": d["device_type"],
        "host": d["host"],
        "username": "backup",
        "use_keys": True,
        "key_file": "/home/netauto/.ssh/id_ed25519",
        "conn_timeout": 15,
    }
    try:
        with ConnectHandler(**params) as conn:
            cfg = conn.send_command("show running-config")
        # Strip the timestamp line so unchanged configs produce no diff
        lines = [l for l in cfg.splitlines() if not l.startswith("! Last configuration change")]
        (OUTDIR / f"{d['name']}.cfg").write_text("\n".join(lines) + "\n")
        logging.info("backed up %s (%d lines)", d["name"], len(lines))
    except (NetmikoTimeoutException, NetmikoAuthenticationException) as e:
        failures += 1
        logging.error("FAILED %s: %s", d["name"], e)

raise SystemExit(1 if failures else 0)
```

Then let git do the diffing:

```bash
cd /srv/netbackup && git add -A && git commit -m "nightly $(date -I)" || echo "no changes"
```

A healthy run looks like this in the log, and produces `no changes` from git:

```
2026-08-24 02:00:04 INFO backed up core-sw (1184 lines)
2026-08-24 02:00:11 INFO backed up access-sw1 (612 lines)
```

That "no changes" line is the whole point. On the night somebody edits a switch, git commits a diff, and the diff is a precise record of what changed and when. Filtering the `! Last configuration change` line matters because IOS writes a timestamp into the running config, and without stripping it every backup shows as modified and the signal disappears into noise.

## Paramiko for custom SSH

For tasks where Netmiko's abstraction gets in the way, I use Paramiko directly. Paramiko is the SSH library that Netmiko is built on, and it gives you lower-level control over the SSH connection.

The cases where I drop down to Paramiko are narrow: pulling a file over SFTP, running something on a Linux box where there is no prompt weirdness to handle, or talking to a device whose prompt is so unusual that fighting Netmiko's expect logic is more work than reading the channel myself. If you find yourself reimplementing paging suppression and prompt matching in Paramiko, go back to Netmiko.

Use keys, not passwords, in both libraries. A password in a script is a password in git history. A dedicated `backup` user at a read-only privilege level with an SSH key is the right shape for automation credentials.

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

Numbers worth knowing. SNMP polling runs over UDP port 161, and traps the device sends unprompted go to UDP port 162 on your collector. `sysUpTime` is reported in hundredths of a second, so divide by 100 before printing it. Interface counters in the original `ifTable` are 32 bits, which wraps in seconds on a loaded 10 Gbps link, so use the 64-bit counters in `ifXTable` (`ifHCInOctets` and `ifHCOutOctets`) on anything fast.

Community strings in SNMPv1 and v2c are sent in cleartext, and `public` is the default read community on far too much equipment. Use SNMPv3, which adds real authentication and encryption, on anything reachable from a network you do not fully control. If you are stuck with v2c on a lab switch, change the community string and restrict polling by ACL to your monitoring host.

Be aware that PySNMP's import paths and synchronous helpers have shifted between major releases. Whatever version you install, pin it, and check the version's own documentation rather than assuming a snippet from a few years ago still imports.

## Structured APIs beat screen scraping

Everything above parses text meant for humans. That works, and on older gear it is the only option, but it is brittle: a vendor changes a column header and your parser silently returns garbage. Where the device supports it, use a structured interface instead. NETCONF (RFC 6241) exchanges XML configuration and state over SSH, conventionally on TCP port 830, with an explicit model of candidate versus running configuration and a real commit operation. RESTCONF (RFC 8040) exposes the same YANG data models over HTTPS with JSON or XML payloads. The Python client for NETCONF is `ncclient`; for RESTCONF you need nothing beyond `requests`. The parsing code you never write is the parsing code that never breaks.

## Practical scripts

My most-used automation scripts:

1. **Config backup:** Connects to every network device and saves the running config. Runs nightly via cron.
2. **Port audit:** Checks which ports are up, which are down, and which have errors. Outputs a report.
3. **VLAN audit:** Pulls VLAN assignments from all switches and checks for inconsistencies.
4. **Uptime check:** Queries sysUpTime from all devices and flags any that have rebooted unexpectedly.

Each script is simple, focused, and reliable. They save me hours of manual checking every week.

The uptime check has earned its keep most often. A switch that rebooted at 3 a.m. and came back up looks normal by morning; the only evidence is the counter resetting, and unless something watches it you find out much later, while debugging something unrelated.

## Running it on a schedule

Cron runs with a minimal environment and almost no `PATH`, so use absolute paths and call the virtual environment's interpreter directly:

```
0 2 * * * /home/netauto/netauto/bin/python /opt/netauto/backup.py
```

Exit non-zero on failure, as the example does, so cron's mail notices. Make every script safe to run twice: if a config-push script is not idempotent, a retry after a partial failure can leave the device worse off than the failure did.

## What breaks

**The script hangs on one unreachable device.** Netmiko's default connection timeout is generous, and a loop over fifty devices with no per-device timeout will sit there. Set `conn_timeout` explicitly, wrap each device in try/except, and count failures instead of aborting the loop.

**Paging eats your output.** Roll your own SSH connection and the device sends `--More--` after a screen of output and waits. Your read blocks, or you capture a truncated config and write it over a good backup. Send `terminal length 0` on IOS-style devices first, or let Netmiko handle it.

**Wrong `device_type` produces a timeout, not an error.** Netmiko waits for a prompt pattern that will never match, which sends you hunting for a network problem that does not exist. If a device that pings and accepts SSH by hand times out in Netmiko, suspect the driver string before the network.

**SNMP counters wrap and produce absurd rates.** A 32-bit octet counter rolls over at 4,294,967,295. Subtract the previous sample without handling that and you get a huge negative number or a nonsense spike. Use the 64-bit `ifXTable` counters, and treat any negative delta as a wrap or a reboot rather than plotting it.

**Credentials in the repository.** The most common mistake and the hardest to undo, because git keeps history. Use SSH keys, keep secrets in a file outside the repo with mode 600, and add that path to `.gitignore` before the first commit rather than after.

## References

- https://docs.python.org/3/library/venv.html
- https://docs.python.org/3/library/logging.html
- https://man7.org/linux/man-pages/man5/crontab.5.html
- https://www.rfc-editor.org/rfc/rfc6241
- https://www.rfc-editor.org/rfc/rfc8040
- https://en.wikipedia.org/wiki/Simple_Network_Management_Protocol
