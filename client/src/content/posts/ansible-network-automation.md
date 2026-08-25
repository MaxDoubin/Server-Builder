
## Why automate network configuration

You have a change to make on twelve switches, and you know from experience that by switch nine you will have fat-fingered a VLAN name or forgotten to save. Then somebody asks whether all twelve are actually consistent, and the only honest answer is that you would have to log into each one to find out.

Manual configuration is slow, error-prone, and does not scale. When you have ten switches and need to add a new VLAN, logging into each one individually and repeating the same commands ten times is tedious and introduces inconsistency. Automation makes configuration changes fast, consistent, and repeatable.

The part that matters more than speed is that a playbook is a written record. The intended state of the network is in a file you can read, diff, and put in git. Six months later you can answer "why is this VLAN here" by reading a commit message instead of guessing.

## How Ansible connects to network devices

Unlike servers where Ansible pushes changes via SSH and runs commands on the remote host, network devices are typically managed by connecting from the Ansible control node and issuing CLI commands over SSH. Ansible uses connection plugins like `network_cli` for this.

This distinction matters because it changes what can go wrong. On a server, Ansible copies a Python module to the target and executes it there. On a switch there is no Python and no filesystem to copy to, so all the logic runs on the control node and only text goes over the wire. Ansible opens an SSH session, drops into the CLI, sends commands, and parses what comes back.

There are three connection plugins you will meet:

- `network_cli` drives the SSH command line, which is what almost everything supports.
- `netconf` speaks NETCONF, the XML-based configuration protocol defined in RFC 6241, carried over SSH on port 830.
- `httpapi` speaks to a REST or RESTCONF style API over HTTPS.

Prefer a structured transport when the platform has a good one, because you get real data back instead of scraped text. In practice most brownfield networks are `network_cli` and that is fine.

One implementation detail is worth knowing because it explains a whole class of timeouts. Ansible does not open a new SSH session per task. It spawns a persistent `ansible-connection` helper process that holds the session open across the play. Two timeouts govern it: `persistent_connect_timeout` for establishing the session and `persistent_command_timeout` for how long a single command may take before Ansible gives up. Both default to 30 seconds. A command that takes longer than that, and `write memory` on a busy device absolutely can, will fail the task even though the device is working normally.

## Prerequisites on the device

Automation fails at the login prompt more often than anywhere else. Before writing a playbook, make sure the device is ready.

On Cisco IOS that means SSH is actually enabled, which requires a hostname, a domain name, and an RSA key, because the key name is derived from the first two:

```
hostname core-sw-01
ip domain-name lab.example.com
crypto key generate rsa modulus 2048
ip ssh version 2
username ansible privilege 15 secret <password>
line vty 0 15
 transport input ssh
 login local
```

Then confirm you can log in by hand, once, before you ever run a playbook. If `ssh ansible@192.168.1.10` does not drop you straight at an enabled prompt, Ansible will not do better.

## Basic inventory

```yaml
# inventory.yml
all:
  children:
    switches:
      hosts:
        core-sw-01:
          ansible_host: 192.168.1.10
          ansible_network_os: ios
          ansible_user: ansible
          ansible_password: "{{ vault_switch_password }}"
          ansible_connection: network_cli
        core-sw-02:
          ansible_host: 192.168.1.11
          ansible_network_os: ios
```

Repeating the same four connection settings on every host gets old fast. Move the shared parts into group variables so the inventory only carries what is genuinely per-device:

```yaml
# group_vars/switches.yml
ansible_connection: ansible.netcommon.network_cli
ansible_network_os: cisco.ios.ios
ansible_user: ansible
ansible_password: "{{ vault_switch_password }}"
```

Use the fully qualified collection names in new work. `ios` still resolves, but `cisco.ios.ios` is unambiguous and is what current documentation assumes. The collection itself is not bundled with `ansible-core`, so install it first:

```bash
ansible-galaxy collection install cisco.ios
```

Verify the inventory parses the way you think it does before you run anything against it:

```bash
ansible-inventory -i inventory.yml --graph
```

```
@all:
  |--@switches:
  |  |--core-sw-01
  |  |--core-sw-02
  |--@ungrouped:
```

## Simple VLAN playbook

```yaml
# add_vlan.yml
- name: Add VLAN to all access switches
  hosts: switches
  gather_facts: no

  tasks:
    - name: Create VLAN
      cisco.ios.ios_vlans:
        config:
          - vlan_id: 200
            name: NEW_SEGMENT
            state: active
        state: merged

    - name: Save configuration
      cisco.ios.ios_config:
        save_when: modified
```

Two notes on that. `gather_facts: no` is correct here because the standard fact gathering module expects a Linux-like host and will fail on a switch. If you want device facts, use `cisco.ios.ios_facts` explicitly.

The save step uses `ios_config` with `save_when: modified` rather than sending `write memory` as a raw command. The difference is idempotence: `save_when: modified` compares the running and startup configurations and only writes when they actually differ, so a no-op run stays a no-op instead of reporting a change every time.

## A worked example: dry run first, then apply

Never let the first thing a playbook does to production be a write. Run it in check mode with diff enabled:

```bash
ansible-playbook -i inventory.yml add_vlan.yml --check --diff
```

On a switch that does not yet have VLAN 200, correct output shows the intended change and a nonzero changed count, with nothing actually committed:

```
TASK [Create VLAN] *************************************************************
--- before
+++ after
@@ -1,4 +1,7 @@
 {
+    "vlan_id": 200,
+    "name": "NEW_SEGMENT",
+    "state": "active"
 }
changed: [core-sw-01]
changed: [core-sw-02]

PLAY RECAP *********************************************************************
core-sw-01  : ok=1  changed=1  unreachable=0  failed=0
core-sw-02  : ok=1  changed=1  unreachable=0  failed=0
```

Then drop `--check` to apply it. The recap looks the same. Now run it a second time, and this is the run that tells you whether your automation is trustworthy:

```
PLAY RECAP *********************************************************************
core-sw-01  : ok=2  changed=0  unreachable=0  failed=0
core-sw-02  : ok=2  changed=0  unreachable=0  failed=0
```

`changed=0` on the second run is the pass condition. If a playbook reports changes every time you run it, it is not describing a state, it is just typing commands for you, and you cannot use it as a compliance check.

## Idempotency

Ansible is designed to be idempotent: running a playbook multiple times produces the same result. If the VLAN already exists, the playbook skips creating it. This makes automation safe to run repeatedly and makes it practical to run on a schedule as a configuration compliance check.

The network resource modules give you finer control over what idempotent means, through the `state` parameter:

- `merged` adds what you specified and leaves everything else alone. This is the safe default.
- `replaced` makes the listed objects match your config exactly, replacing their existing settings, but does not touch objects you did not list.
- `overridden` makes the whole resource match your config, which means anything on the device that is not in your playbook gets removed.
- `deleted` removes the listed objects.
- `gathered` reads the current state and returns it without changing anything.

`overridden` is the one to be careful with. Running an `overridden` VLAN task with a config block listing only VLAN 200 will remove every other VLAN on the switch. It is the right tool for enforcing a golden config and the wrong tool for adding one VLAN.

## Ansible Vault

Store credentials securely using Ansible Vault:

```bash
# Encrypt a password
ansible-vault encrypt_string 'mypassword' --name vault_switch_password

# Run playbook with vault password
ansible-playbook add_vlan.yml --ask-vault-pass
```

The output of `encrypt_string` is a YAML snippet you paste into a variables file, so the secret lives encrypted in git rather than in your shell history. For unattended runs, replace `--ask-vault-pass` with `--vault-password-file`, pointing at a file that is outside the repository and readable only by the user running the playbook. A vault password file committed next to the vault it unlocks protects nothing.

## What breaks

**Host key verification stops the play before it starts.** The first connection to a device Ansible has never seen fails with a host key error, and because network devices regenerate their keys whenever someone runs `crypto key generate rsa` again, this recurs. The wrong fix is disabling host key checking globally. The right fix is populating `known_hosts` deliberately as part of provisioning the device, so a key change is a signal rather than noise.

**Paging blocks the session.** Devices with `--More--` paging enabled will hang mid-output waiting for a keypress, and the task dies at the command timeout with no useful error. Ansible's IOS platform normally handles this by disabling paging on connect, but custom or unrecognised prompts break the detection. Setting `terminal length 0` in the automation user's line configuration removes the problem at the source.

**Privilege level surprises.** If the automation account lands in user EXEC mode rather than privileged EXEC, every configuration task fails in a way that reads like a syntax error. Either give the account privilege 15 directly, or set `become: yes` with `become_method: enable` and supply the enable secret. Pick one and be consistent, because half-configured escalation fails intermittently depending on the device.

**Forgetting that the default is five hosts at a time.** Ansible runs with five forks by default, so a change across forty switches goes out in eight waves. That is usually what you want, but if you assumed it was all at once you will misread the timing of an outage. For risky changes, go the other way and set `serial: 1` so a failure stops the run after one device instead of after five.

**Treating a playbook as a rollback plan.** A playbook that adds a VLAN does not remove it. If your change goes wrong at 2 a.m., you need the reverse playbook already written and tested, or a copy of the pre-change configuration. Pull the running configuration into a file at the start of any change run and commit it. That backup is worth more than the automation.

## References

- https://docs.ansible.com/ansible/latest/index.html
- https://www.rfc-editor.org/rfc/rfc6241
- https://www.rfc-editor.org/rfc/rfc8040
- https://www.rfc-editor.org/rfc/rfc7950
- https://en.wikipedia.org/wiki/Ansible_(software)
- https://en.wikipedia.org/wiki/Jinja_(template_engine)
