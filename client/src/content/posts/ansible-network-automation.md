
## Why Automate Network Configuration

Manual configuration is slow, error-prone, and does not scale. When you have ten switches and need to add a new VLAN, logging into each one individually and repeating the same commands ten times is tedious and introduces inconsistency. Automation makes configuration changes fast, consistent, and repeatable.

## How Ansible Connects to Network Devices

Unlike servers where Ansible pushes changes via SSH and runs commands on the remote host, network devices are typically managed by connecting from the Ansible control node and issuing CLI commands over SSH. Ansible uses connection plugins like `network_cli` for this.

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

## Idempotency

Ansible is designed to be idempotent: running a playbook multiple times produces the same result. If the VLAN already exists, the playbook skips creating it. This makes automation safe to run repeatedly and makes it practical to run on a schedule as a configuration compliance check.

## Ansible Vault

Store credentials securely using Ansible Vault:

```bash
# Encrypt a password
ansible-vault encrypt_string 'mypassword' --name vault_switch_password

# Run playbook with vault password
ansible-playbook add_vlan.yml --ask-vault-pass
```
