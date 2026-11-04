
## The short answer

Proxmox VE 8 reached end of life in August 2026 per the [Proxmox FAQ lifecycle table](https://pve.proxmox.com/wiki/FAQ), and the supported way off it is an in-place apt upgrade from the latest 8.4 (pve-manager 8.4.1 or newer) to Proxmox VE 9 on Debian 13 "trixie," as laid out in the [official 8 to 9 guide](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9). The sequence is: update to the last 8.4 packages, run `pve8to9 --full` until it reports no failures, switch every Debian and Proxmox repository from bookworm to trixie (the guide writes the new ones as deb822 `.sources` files), run `apt dist-upgrade`, and reboot. Keep at least 5 GB free on the root file system (ideally more than 10 GB) and a console that does not depend on the host's own network. A cluster is upgraded one node at a time, and hyper-converged Ceph must already be on Squid 19.2. The changes that break existing hosts are `/etc/sysctl.conf` no longer being read, containers with systemd 230 or older no longer running because cgroup v1 is gone, NICs that the newer kernel can rename, the removed `VM.Monitor` privilege, and LVM autoactivation on shared storage.

## When did Proxmox VE 8 reach end of life, and what happens if you stay on it?

The FAQ ties the schedule to Debian: Proxmox VE versions are ["supported at least as long as the corresponding Debian version is supported by the Debian Security Team, i.e. approximately 3 years after its initial release."](https://pve.proxmox.com/wiki/FAQ) Its table gives Proxmox VE 8 an end of life of 2026-08. The 8 to 9 guide's cgroup section gives only an estimate, ["estimated EOL is July 2026"](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9). [Debian's releases page](https://www.debian.org/releases/) lists bookworm at 2026-07-11 plus a separate LTS column to 2028-06-30, but the FAQ names the Security Team, not LTS, so 2028 does not extend the Proxmox date. That wording is a floor, and the FAQ promises nothing beyond it for a host that stays on 8.

| Proxmox VE | Debian base | First release | Proxmox EOL | Months of support |
|---|---|---|---|---|
| 6 | 10 (buster) | 2019-07 | 2022-09 | 38 |
| 7 | 11 (bullseye) | 2021-07 | 2024-07 | 36 |
| 8 | 12 (bookworm) | 2023-06 | 2026-08 | 38 |
| 9 | 13 (trixie) | 2025-08 | tba | 14 so far |

Month counts subtract the FAQ's year-month values, and the 14 for Proxmox VE 9 runs to October 2026. Each line ran roughly three years, ending when or just after its Debian base ended. Debian puts trixie at 2028-08-09, but the FAQ says tba.

The [Roadmap](https://pve.proxmox.com/wiki/Roadmap) lists 8.4 (April 9, 2025, kernel 6.8.12-9 by default, 6.14 opt-in) as the newest 8.x release, so a host that stays has no later 8.x to move to. Meanwhile 9.0 arrived August 5, 2025, 9.1 on November 19, 2025 with kernel 6.17, and 9.2 on May 21, 2026 with kernel 7.0 and QEMU 11.0. A co-installed Proxmox Backup Server has its own path in the [PBS 3 to 4 how-to](https://pbs.proxmox.com/wiki/Upgrade_from_3_to_4), which the PVE guide links as a prerequisite. The [Proxmox VE vs ESXi](/blog/proxmox-vs-esxi) article covers 9.0's snapshots as volume chains on thick LVM, which the Roadmap still lists as a technology preview.

## What does pve8to9 check, and how do you clear each warning?

`pve8to9` ships in the latest 8.4 packages. Per the [upgrade guide](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9), run `pve8to9` for the standard checks and `pve8to9 --full` at least once before upgrading. It "only checks and reports things," changes nothing, and cannot know every customization, so rerun it after each fix and again after the upgrade.

```bash
pve8to9 --full
```

The [source in Proxmox's pve-manager repository](https://git.proxmox.com/?p=pve-manager.git;a=blob;f=PVE/CLI/pve8to9.pm;hb=refs/heads/master) (read from master; the pve-manager 8.4.21 package carries every check in the table below, though master has newer ones) prefixes each line PASS, INFO, SKIP, NOTICE, WARN or FAIL and ends with a summary of passed, skipped, warning and failure counts. Without `--full` it skips the container cgroup v2 check and says so. Treat every FAIL as a blocker and read every WARN.

| Report | What to do |
|---|---|
| proxmox-ve package is too old | On the 8.x repositories run `apt update` and `apt dist-upgrade` until `pveversion` reports 8.4.1 or newer |
| Mixed old and new package repository suites | Use one base suite on every Proxmox and Debian repository; ask the vendor about third-party ones |
| Legacy spelling `pvetest` | The [Roadmap](https://pve.proxmox.com/wiki/Roadmap) says the test repository is now `pve-test` |
| Lost quorum, offline nodes, fewer than three quorum-providing nodes | Bring every node online first. A two-node cluster can use a [QDevice for a third vote](https://pve.proxmox.com/pve-docs/chapter-pvecm.html) |
| systemd-boot meta-package installed | The guide says it is safe to remove unless you set up systemd-boot by hand |
| UEFI without `grub-efi-amd64`, or ESP not at `/boot/efi` | Mount the ESP at `/boot/efi` and make it mount at boot, per the source; install the meta-package, for which the guide gives `[ -d /sys/firmware/efi ] && apt install grub-efi-amd64` |
| LVM autoactivation | Run `/usr/share/pve-manager/migrations/pve-lvm-disable-autoactivation`; strongly recommended for shared LVM, optional for local-only |
| `/etc/sysctl.conf` has settings | Move them to `/etc/sysctl.d/` (below) |
| `maxfiles` in `/etc/vzdump.conf` | The source says it "was deprecated with PVE 7.x and is getting dropped with PVE 9." Use [`prune-backups`](https://pve.proxmox.com/pve-docs/chapter-vzdump.html) |
| Custom role references `VM.Monitor` | The privilege is gone; edit the role |
| Container lacks unified cgroup v2 support (`--full` only) | Upgrade the container OS (below) |
| DKMS modules found, or an old `70-persistent-net.rules` | Out-of-tree drivers must support the new kernel; the source says the udev file means NICs are likely to be renamed and to replace it with a systemd `.link` file |

The same source warns when the node's hostname does not resolve to an address configured on it, and when only `systemd-timesyncd` keeps time, recommending chrony, ntpsec or openntpd.

## How do you switch the repositories to trixie and the new .sources format?

First get the node current on 8.4 and work from a console or a `tmux` or `screen` session. The [guide](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9) says not to upgrade from the web interface's virtual console because it is interrupted mid-upgrade, and recommends testing on an identical non-production machine first when only SSH is available. [iDRAC's virtual console](/blog/dell-idrac-tips-tricks), an Enterprise license feature, is the usual out-of-band option on a PowerEdge.

```bash
apt update
apt dist-upgrade
pveversion
```

Then point the Debian entries at trixie. The guide's commands rewrite the classic one-line files, and it says to comment out anything still naming bookworm:

```bash
sed -i 's/bookworm/trixie/g' /etc/apt/sources.list
sed -i 's/bookworm/trixie/g' /etc/apt/sources.list.d/pve-enterprise.list
```

The Proxmox VE 9 repositories use deb822 style. Enterprise subscribers create this file, run `apt update` and `apt policy`, and only then delete the old `pve-enterprise.list`:

```bash
cat > /etc/apt/sources.list.d/pve-enterprise.sources << EOF
Types: deb
URIs: https://enterprise.proxmox.com/debian/pve
Suites: trixie
Components: pve-enterprise
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF
```

Hosts without a subscription use `proxmox.sources` with URI `http://download.proxmox.com/debian/pve` and component `pve-no-subscription`, and must remove the PVE 8 entry from `sources.list`, `pve-install-repo.list` or wherever it lives. The [Package Repositories page](https://pve.proxmox.com/wiki/Package_Repositories) gives the same stanzas, says `Enabled: no` in the enterprise entry stops its error messages on a host with no key, and shows Debian's side as `debian.sources` with `trixie`, `trixie-updates` and `trixie-security`.

Hyper-converged Ceph hosts also need `ceph.sources`, pointing at `ceph-squid` with component `enterprise` (URI `https://enterprise.proxmox.com/debian/ceph-squid`) or `no-subscription` (URI `http://download.proxmox.com/debian/ceph-squid`), after Ceph itself is on Squid. A 401 from the enterprise repository means the subscription needs a refresh: `pvesubscription update --force`. Remove any backports line, since the guide says the upgrade was not tested with backports packages. Debian's [sources.list(5)](https://manpages.debian.org/trixie/apt/sources.list.5.en.html) says the one-line style "is deprecated and may eventually be removed, but not before 2029." After the upgrade, `apt modernize-sources` converts what is left, keeps old files with a `.bak` suffix, and previews changes if you answer "n."

Confirm `apt update` shows no errors, then upgrade:

```bash
systemctl disable --now systemd-journald-audit.socket
apt dist-upgrade
```

The first line is the guide's advice for keeping kernel audit messages out of the journal during the upgrade. The guide says `dist-upgrade` takes under 5 minutes on a fast SSD server and "up to 60 minutes or more" on a slow spinning disk. For configuration prompts, the guide says to keep your version of `/etc/issue` (Proxmox regenerates it) and, if unsure, `/etc/default/grub`, and to take the maintainer's version of `/etc/lvm/lvm.conf`, `/etc/ssh/sshd_config` (which swaps `ChallengeResponseAuthentication` for `KbdInteractiveAuthentication`) and `/etc/chrony/chrony.conf` when you made no changes.

Then rerun `pve8to9` and reboot. The guide says to reboot even if the host already ran the 6.14 opt-in kernel on PVE 8, because the kernel was rebuilt with the PVE 9 compiler and ABI.

## Which changes in Proxmox VE 9 break existing hosts?

### Settings that silently stop applying

The `systemd-sysctl` in Proxmox VE 9 no longer honors `/etc/sysctl.conf`, per the guide, so values there are not applied after the reboot. The [Debian trixie release notes](https://www.debian.org/releases/trixie/release-notes/issues.html) agree. The guide names two victims: the `rp_filter` override that older EVPN exit-node documentation placed in `sysctl.conf`, and IP forwarding. The [sysctl.d(5) man page](https://man7.org/linux/man-pages/man5/sysctl.d.5.html) says files are read in lexicographic order and the latest name wins, which is why the guide asks for a two-digit prefix.

```bash
grep -v -E '^[[:space:]]*([#;]|$)' /etc/sysctl.conf
printf 'net.ipv4.ip_forward = 1\n' > /etc/sysctl.d/90-local.conf
```

The first command lists active lines in the legacy file; recreate each under `/etc/sysctl.d/`. The [network tuning article](/blog/linux-network-tuning-without-cargo-cult) uses the same layout.

Debian also made `/tmp` a tmpfs, capped at 50 percent of RAM by default, and per its [release notes](https://www.debian.org/releases/trixie/release-notes/issues.html) files in the old `/tmp` are hidden once it mounts after the reboot. `systemctl mask tmp.mount` plus a reboot restores the old behavior. The guide adds that `/tmp` and `/var/tmp` are now cleaned while the system runs, while Debian's [notes](https://www.debian.org/releases/trixie/release-notes/issues.html) say the upgrade creates `/etc/tmpfiles.d/tmp.conf` to keep the old cleanup, so check which applies.

### Containers: cgroup v1 is gone

Proxmox VE has defaulted to pure cgroup v2 since 7.0, but the Roadmap says that with 9.0 the hybrid hierarchy can no longer be switched back on with a kernel parameter. The [container documentation](https://pve.proxmox.com/pve-docs/chapter-pct.html) says containers need systemd 231 or newer, or no systemd at all, and the guide says systemd 230 or older, such as CentOS 7 or Ubuntu 16.04, is unsupported. The documented fixes are to upgrade the guest distribution, update its systemd from backports, or move the workload to a virtual machine. The checker also flags `lxc.cgroup.` keys in container configs as ignored under v2, usually fixed with the `lxc.cgroup2.` prefix. The [cgroup limits article](/blog/cgroups-resource-limits) covers the v2 interface.

PVE 9 also ships AppArmor 4.1. The Roadmap says most problems with older profiles are fixed by adding `abi <abi/3.0>,` to the profile, and lists a known issue with Docker inside an LXC container (bug 6538). New containers are unprivileged by default, per the [container documentation](https://pve.proxmox.com/pve-docs/chapter-pct.html), and the Roadmap says creating a privileged one now needs `Sys.Modify` in most cases.

### Network names

The guide warns that the newer kernel recognizes more hardware features, such as virtual functions, and that names often derive from the PCI address, so some NICs change name. The Roadmap adds that PVE 9 accepts alternative names in network and firewall configuration, but "in some cases, the previous primary name might not be available as an alternative name after the upgrade." [Debian's notes](https://www.debian.org/releases/trixie/release-notes/issues.html) name two triggers, the i40e driver and firmware exposing the `_SUN` ACPI object, and suggest `udevadm test-builtin net_setup_link` after the upgrade but before rebooting. A forum poster who tried an in-place 8.4 to 9.2 upgrade on a four-node Cisco UCS M5 cluster [reported the management NICs vanishing](https://forum.proxmox.com/threads/moving-from-8-4-to-9-2.185401/) on each attempt although the checks came up clean, and a reply pointed to the wiki's name-change item. The Roadmap says the `pve-network-interface-pinning` tool can pin names before the upgrade. The command is in the `pve-manager` package from 8.4.9 on (8.4.9 package contents), so finish the 8.4 update first. The [administration guide](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html) documents it:

```bash
pve-network-interface-pinning generate
diff -y /etc/network/interfaces /etc/network/interfaces.new
```

It writes `.link` files to `/usr/local/lib/systemd/network` and rewrites old names in `/etc/network/interfaces`, `host.fw` and the SDN controller and fabric files, leaving `.new` copies to diff. A reboot applies the names, and `/etc/pve/firewall/cluster.fw` is not updated. Two more items, per the Roadmap and the guide: a VirtIO vNIC with an unset MTU now inherits the bridge MTU instead of 1500, and a Ceph full-mesh `post-up` line that restarts `frr.service` can deadlock at boot, so the guide replaces it with a conditional `is-active` form.

### Privileges, storage and third-party software

The privilege and GlusterFS rows come from the [Roadmap](https://pve.proxmox.com/wiki/Roadmap) 9.0 notes, and the Veeam and plugin rows from the [upgrade guide](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9).

| Change | Effect |
|---|---|
| `VM.Monitor` removed | Replaced by `Sys.Audit` and finer guest agent privileges; custom roles need editing |
| `VM.Replicate` added | Replication jobs need it on `/vms/<vmid>` |
| GlusterFS dropped | Move guests or mount it manually as Directory storage |
| QEMU machine version 10.0 or newer | The guide says Veeam backups fail for those VMs; pin `9.2+pve1` or postpone |
| Third-party storage plugins | Wait until the author supports PVE 9 |

Hardware matters too. The guide calls hardware more than 10 years old less tested, reporting Ceph "illegal instruction" errors on an AMD Opteron 2427 and a Turion II Neo N54L, and says PCI passthrough VMs failed to start on kernel 6.14 for some users, with pinning an older kernel as the workaround. The [GPU passthrough article](/blog/gpu-passthrough-proxmox) covers the host setup. NVIDIA vGPU hosts need GRID 18.3 (driver 570.158.02) or newer first, and the Roadmap says 9.1's kernel 6.17 needed vGPU 19.4.

## How do you upgrade a cluster one node at a time?

Start healthy. [`pvecm status`](https://pve.proxmox.com/pve-docs/chapter-pvecm.html) must show a quorate cluster with every node present, and the cluster documentation says all nodes should run the same version and that HA needs at least three nodes for reliable quorum, so treat mixed versions as temporary. Upgrade hyper-converged Ceph first, per the [Reef to Squid page](https://pve.proxmox.com/wiki/Ceph_Reef_to_Squid): set `ceph osd set noout`, upgrade the packages on every node, restart the monitors one node at a time, then the managers, then the OSDs one node at a time, run `ceph osd require-osd-release squid` once every OSD runs Squid, restart any CephFS MDS daemons, and unset `noout`.

Guest migration sets the order. The guide says migrating from an older Proxmox VE to a newer one "will always work," while newer to older "may work, but is generally not supported." Empty the first node and upgrade it, then move guests from the next node onto upgraded nodes, never back.

For HA-managed guests, [node maintenance mode](https://pve.proxmox.com/pve-docs/chapter-ha-manager.html) moves them and records the origin node so they can return:

```bash
ha-manager crm-command node-maintenance enable pve2
# on pve2's console: pve8to9 --full, repositories, dist-upgrade, reboot
pve8to9
pvecm status
ha-manager crm-command node-maintenance disable pve2
```

Services that cannot leave a node do not move. The HA documentation says, under the migrate shutdown policy, that a service must not be locally bound, for example by hardware passthrough, and that if strict node affinity rules leave no available node the shutdown "will hang until you manually intervene," so stop such guests by hand before the node's turn. Maintenance mode also survives a reboot: per the same documentation it ends only when disabled with the command above or when the manager status is cleared.

After the last node reaches 9, the guide says HA groups migrate to HA rules automatically, and `journalctl -eu pve-ha-crm` on the active CRM node explains any trouble. The [HA article](/blog/proxmox-clustering-high-availability) shows the rules that replace groups. If Ceph shows `HEALTH_ERR` for "insecure key types" after the first monitor node reboots, the guide says services stay operational, to resume the upgrade, and to migrate the keys once every node is on 9.

## Should you upgrade in place or reinstall and restore?

The guide lists both as supported. In place needs apt familiarity. A new installation from the 9.x ISO "will delete all data on the existing host," so guests come back from backup. The reinstall checklist: back up all guests and `/etc` (at least `/etc/pve`, `/etc/passwd`, `/etc/network/interfaces`, `/etc/resolv.conf`), install, force-reload the browser, rebuild the cluster if any, restore `/etc/pve/storage.cfg` and the firewall files, then restore guests. Prove the backups first; the [restore drills article](/blog/restore-drills-that-matter) covers an honest test.

A cluster node is removed first and joins again after the install. The [cluster documentation](https://pve.proxmox.com/pve-docs/chapter-pvecm.html) says a node that runs Ceph must first have its OSDs, metadata servers, monitor and manager destroyed, and that the node must be powered off before `pvecm delnode` and kept from returning with its old configuration, since "the cluster could end up broken." Afterward, delete the stale `/etc/pve/nodes/<name>` directory, remove the node from HA rules, and run `pvecm updatecerts` on the rejoined node if SSH complains about a fingerprint.

Hardware can decide it. The Roadmap says the 9.2 installer's kernel 7.0.2-6 has problems with RAID controllers on `megaraid_sas` and certain NVMe drives in JBOD mode, fixed in 7.0.14-15, and recommends installing from the 9.1 ISO and then upgrading. That driver serves the PERC H730 ([HBA mode article](/blog/perc-h730-hba-mode)). Since 9.1 the installer can also pin interface names.

Choose in place when `pve8to9 --full` ends clean, console access exists and the backups restore. The guide recommends a rehearsal on identical or similar hardware; choose reinstall when that rehearsal fails. A forum poster whose in-place attempts kept losing NICs [reported that a fresh 9.2 install](https://forum.proxmox.com/threads/moving-from-8-4-to-9-2.185401/) on a standalone M5 saw all of them, though the thread's reply traced the loss to the guide's known name-change issue, for which the guide points to interface pinning.

## What breaks during the upgrade, and how do you recover?

**The upgrade stops partway.** A network failure can leave it half done. Fix: `apt -f install`, then `apt dist-upgrade` again, per the guide's troubleshooting section.

**apt warns that it is attempting to remove the meta-package `proxmox-ve`.** The guide says one or more installed packages cannot be upgraded because their trixie repository is not configured. Fix: add the trixie equivalent, or restore the old configuration, `apt update`, remove packages from that repository and restart. On Proxmox VE installed over plain Debian, run `apt remove linux-image-amd64` first.

**No network after the reboot.** A renamed NIC leaves `/etc/network/interfaces` naming a device that is gone. Fix: at the console, run `ip -br link`, correct the name in `/etc/network/interfaces`, then run the pinning tool.

**The host hangs at boot with a Ceph full mesh.** FRR now depends on `networking.service`. Fix: boot the Rescue Boot entry in the Advanced menu of the Proxmox VE ISO and edit `/etc/network/interfaces`, per the guide.

**GRUB reports ``disk `lvmid/...` not found``.** This hits UEFI hosts with root on LVM. Fix: `apt install grub-efi-amd64` before rebooting; ZFS root and legacy BIOS hosts are not affected.

**`Check of pool pve/data failed (status:64). Manual repair required`.** Fix: `lvconvert --repair pve/data`. The guide says the cause is under investigation.

**A PowerEdge fails to boot kernel 6.17.** The Roadmap's 9.1 notes report machine check errors on some Dell PowerEdge servers while 6.14 boots, and say enabling SR-IOV Global and I/OAT DMA in firmware helps. An [owner's blog post](https://einstein.astro.gla.ac.uk/jscott/blog/2026/20260428_proxmox_dell_r630_boot_failure/) describes an R630 boot loop, with machine check errors in the iDRAC log, that those settings resolved. Fix: enable them, or pin the old kernel:

```bash
proxmox-boot-tool kernel list
proxmox-boot-tool kernel pin 6.14.11-4-pve
```

The [administration guide](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html) says to remove a pin as soon as possible so the latest security patches apply, with `proxmox-boot-tool kernel unpin`.

**Packages end up half installed.** In an August 2025 forum thread an Intel i219-V owner [reported the NIC down after the upgrade](https://forum.proxmox.com/threads/upgraded-to-proxmox-ve-9-intel-i219-v-nic-down-network-wont-work.169150/) with its name unchanged. A reply said a test cluster ended up with many half-broken packages, found with `apt --fix-broken install`, although the upgrade reported no error. The thread has no confirmed cause. Fix: before rebooting, confirm that `apt -f install`, the guide's repair for a partial upgrade, has nothing left to do.

## Sources

- [Proxmox VE Wiki: Upgrade from 8 to 9](https://pve.proxmox.com/wiki/Upgrade_from_8_to_9)
- [Proxmox VE Wiki: FAQ](https://pve.proxmox.com/wiki/FAQ)
- [Proxmox VE Wiki: Roadmap](https://pve.proxmox.com/wiki/Roadmap)
- [Proxmox VE Wiki: Package Repositories](https://pve.proxmox.com/wiki/Package_Repositories)
- [Proxmox VE Wiki: Ceph Reef to Squid](https://pve.proxmox.com/wiki/Ceph_Reef_to_Squid)
- [Proxmox VE Administration Guide: Host System Administration](https://pve.proxmox.com/pve-docs/chapter-sysadmin.html)
- [Proxmox VE Administration Guide: Proxmox Container Toolkit](https://pve.proxmox.com/pve-docs/chapter-pct.html)
- [Proxmox VE Administration Guide: Cluster Manager](https://pve.proxmox.com/pve-docs/chapter-pvecm.html)
- [Proxmox VE Administration Guide: High Availability](https://pve.proxmox.com/pve-docs/chapter-ha-manager.html)
- [Proxmox VE Administration Guide: Backup and Restore](https://pve.proxmox.com/pve-docs/chapter-vzdump.html)
- [Proxmox: pve8to9 checklist source (pve-manager repository)](https://git.proxmox.com/?p=pve-manager.git;a=blob;f=PVE/CLI/pve8to9.pm;hb=refs/heads/master)
- Proxmox: pve-manager 8.4.21 package, bookworm pve-no-subscription repository (served over plain HTTP only; its HTTPS certificate does not match the host name): `http://download.proxmox.com/debian/pve/dists/bookworm/pve-no-subscription/binary-amd64/pve-manager_8.4.21_all.deb`
- Proxmox: pve-manager 8.4.9 package, bookworm pve-no-subscription repository (served over plain HTTP only; its HTTPS certificate does not match the host name): `http://download.proxmox.com/debian/pve/dists/bookworm/pve-no-subscription/binary-amd64/pve-manager_8.4.9_all.deb`
- [Proxmox Backup Server Wiki: Upgrade from 3 to 4](https://pbs.proxmox.com/wiki/Upgrade_from_3_to_4)
- [Debian: Release Notes for trixie, Issues to be aware of for trixie](https://www.debian.org/releases/trixie/release-notes/issues.html)
- [Debian: Debian Releases](https://www.debian.org/releases/)
- [Debian Manpages: sources.list(5) for trixie](https://manpages.debian.org/trixie/apt/sources.list.5.en.html)
- [Linux man-pages: sysctl.d(5)](https://man7.org/linux/man-pages/man5/sysctl.d.5.html)
- [Proxmox Support Forum: Moving from 8.4 to 9.2 (owner report)](https://forum.proxmox.com/threads/moving-from-8-4-to-9-2.185401/)
- [Proxmox Support Forum: Upgraded to Proxmox VE 9 - Intel i219-V nic down network wont work (owner report)](https://forum.proxmox.com/threads/upgraded-to-proxmox-ve-9-intel-i219-v-nic-down-network-wont-work.169150/)
- [Owner blog (einstein.astro.gla.ac.uk): Dell PowerEdge R630 machine check error when booting Proxmox 9](https://einstein.astro.gla.ac.uk/jscott/blog/2026/20260428_proxmox_dell_r630_boot_failure/)
