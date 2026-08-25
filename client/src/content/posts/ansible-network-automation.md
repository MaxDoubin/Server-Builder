
## Why Automate Network Configuration

Manual configuration is slow, error-prone, and does not scale. When you have ten switches and need to add a new VLAN, logging into each one individually and repeating the same commands ten times is tedious and introduces inconsistency. Automation makes configuration changes fast, consistent, and repeatable.

The consistency argument is the important one. Ten hand-configured switches drift: one has a typo in the VLAN name, one never got the change because the session dropped, one has an extra `switchport trunk allowed vlan` line from a project two years ago. Drift is invisible until the day it causes an outage. A playbook that can be re-run turns "we think they match" into "we verified they match this morning."

## How Ansible Connects to Network Devices

Unlike servers where Ansible pushes changes via SSH and runs commands on the remote host, network devices are typically managed by connecting from the Ansible control node and issuing CLI commands over SSH. Ansible uses connection plugins like `network_cli` for this.

The distinction matters more than it sounds. On a Linux server Ansible copies a Python module to the target, runs it, and collects JSON. A Catalyst switch has no Python and no writable filesystem you can drop a module into, so with `network_cli` the module executes on the control node and only the resulting CLI text crosses the SSH session. Everything is therefore screen scraping: Ansible sends `show vlan`, parses the output, works out the delta, and sends configuration lines.

Two consequences follow. First, `gather_facts: no` belongs in every network play, because the default fact gathering tries to run `setup`, which needs Python on the target and will fail or hang. Use `cisco.ios.ios_facts` when you actually want device facts. Second, the control node needs the collection installed (`ansible-galaxy collection install cisco.ios`) plus `paramiko` or `ansible-pylibssh`. The most common first error, `Unable to automatically determine host network os`, means `ansible_network_os` is missing or misspelled, not that the device is unreachable.

## Basic Inventory

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

Note that `core-sw-02` inherits nothing here: every variable is set per host, so the second switch has no `ansible_network_os`, no user, and no connection plugin, and the play will fail on it. Put shared settings in a group `vars` block instead:

```yaml
    switches:
      vars:
        ansible_network_os: cisco.ios.ios
        ansible_connection: ansible.netcommon.network_cli
        ansible_user: ansible
        ansible_password: "{{ vault_switch_password }}"
      hosts:
        core-sw-01:
          ansible_host: 192.168.1.10
        core-sw-02:
          ansible_host: 192.168.1.11
```

The fully qualified collection names (`cisco.ios.ios`, `ansible.netcommon.network_cli`) are the current form. The short names `ios` and `network_cli` still resolve through the collection redirect, but FQCNs are unambiguous when two collections define the same short name.

If the device requires an enable password, add `ansible_become: yes`, `ansible_become_method: enable`, and `ansible_become_password`. Without it, every configuration task fails with a permission error while `show` commands work fine, which is a confusing pair of symptoms until you know the cause.

## Simple VLAN Playbook

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
      cisco.ios.ios_command:
        commands:
          - write memory
```

The `state: merged` on the module is doing critical work and is easy to get wrong. The resource modules accept several states and they are not variations on a theme:

- `merged` adds what you listed and leaves everything else alone. This is what you want almost always.
- `replaced` rewrites the listed objects to match your config exactly, removing attributes you did not specify on those objects.
- `overridden` makes the entire VLAN database on the device match your list, which means it deletes every VLAN you did not mention. Running `overridden` with a single VLAN in `config` against a production switch removes all the others. This has taken down real networks.
- `gathered`, `rendered`, and `parsed` produce data without touching the device, and are how you build the initial config from what is already there.

Also be careful with the VLAN ID itself. Cisco standard-range VLANs are 1 to 1005, with 1002 to 1005 reserved for legacy Token Ring and FDDI, and extended range is 1006 to 4094. VTP version 1 and 2 cannot propagate extended-range VLANs, so a VLAN 2000 created on one switch in a VTP domain will not appear on the others and the playbook will look like it silently did nothing on some hosts.

`write memory` runs unconditionally in this playbook, including on hosts where nothing changed, which produces a "changed" result every run and makes it impossible to tell real changes from noise. Gate it:

```yaml
    - name: Save configuration
      cisco.ios.ios_config:
        save_when: modified
```

`save_when: modified` compares the running and startup configs and only writes when they differ.

## Idempotency

Ansible is designed to be idempotent: running a playbook multiple times produces the same result. If the VLAN already exists, the playbook skips creating it. This makes automation safe to run repeatedly and makes it practical to run on a schedule as a configuration compliance check.

Idempotency comes from the module, not from Ansible. `ios_vlans` and the other resource modules read the current state, compute a diff, and send only the missing lines, so a second run reports `ok` instead of `changed`. `ios_command` has no idea what it is sending, so it reports `changed` every single time. `ios_config` sits in between: it compares the lines you give it against the running config and pushes only the differences.

This is why a playbook full of `ios_command` tasks is not automation, it is a slower version of copying and pasting. If you cannot tell from `ansible-playbook` output whether anything actually changed, you cannot use the playbook as a compliance check.

The compliance-check pattern is `--check` plus `--diff`:

```bash
ansible-playbook add_vlan.yml --check --diff
```

`--check` runs without applying changes and `--diff` prints the configuration lines that would be sent. Run that on a schedule and any output at all means a device has drifted. Note that `--check` support depends on the module: resource modules and `ios_config` handle it properly, `ios_command` cannot and will simply skip.

## Ansible Vault

Store credentials securely using Ansible Vault:

```bash
# Encrypt a password
ansible-vault encrypt_string 'mypassword' --name vault_switch_password

# Run playbook with vault password
ansible-playbook add_vlan.yml --ask-vault-pass
```

Vault encrypts with AES-256 and the ciphertext is safe to commit. What is not safe is the surrounding habit. Three things go wrong:

- Encrypting the value but leaving the plaintext in your shell history. `ansible-vault encrypt_string 'mypassword'` puts the password in `~/.bash_history`. Run it without the value argument and type the secret at the prompt instead.
- Debug tasks that print the decrypted variable. `no_log: true` on any task that touches a credential keeps it out of the output and out of CI logs.
- Committing a vault password file. Use `--vault-password-file` pointing somewhere outside the repository, or `--ask-vault-pass` interactively, and put the path in `.gitignore` either way.

Vault does not solve key rotation, does not give you an audit trail of who decrypted what, and one shared vault password means everyone with the repo has every credential. Past a couple of people, move to HashiCorp Vault or CyberArk and have Ansible look up secrets at run time.

## Where CLI Scraping Runs Out

`network_cli` is parsing text meant for humans. A firmware upgrade that changes the column widths of `show interfaces status` can break a parser, and error handling is limited to matching prompts and known error strings. It is also slow: every task is a round trip over an interactive SSH session, so a play across fifty switches spends most of its time waiting. `strategy: free` and raising `forks` in `ansible.cfg` help, since the default of 5 forks means fifty devices run in ten sequential batches.

Where the platform supports it, the structured alternatives are better. NETCONF (RFC 6241) exchanges XML over SSH with real transactions, candidate configurations, and commit and rollback. RESTCONF (RFC 8040) exposes the same YANG models over HTTP. Ansible reaches those through the `ansible.netcommon.netconf` connection plugin and the `netconf_config` module. On IOS XE, IOS XR, and Junos, prefer them.

Finally, Ansible is push-based and stateless. It has no continuous reconciliation loop and no memory of what it did last time, so it will not notice that somebody logged into a switch at 2 a.m. and changed something. The scheduled `--check --diff` run is how you close that gap, and it only works if you actually read the output.

## References

- https://www.mankier.com/1/ansible-playbook
- https://www.mankier.com/1/ansible-vault
- https://github.com/ansible-collections/cisco.ios
- https://www.rfc-editor.org/rfc/rfc6241
- https://www.rfc-editor.org/rfc/rfc8040
- https://en.wikipedia.org/wiki/Ansible_(software)
