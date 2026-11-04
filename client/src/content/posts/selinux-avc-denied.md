
## The short answer

An `avc: denied` record means SELinux policy has no rule that lets the process type in `scontext` perform the logged permission on the target type in `tcontext` for that `tclass`. Red Hat's [troubleshooting chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) says that "in most cases, SELinux denials are signs of misconfiguration," and tells administrators to check for a labeling problem first, then for a service configured in a way SELinux was never told about, before generating policy with `audit2allow`. In practice a wrong file label is fixed with `semanage fcontext` plus `restorecon`, a service on a nonstandard port with `semanage port -a`, and an access that policy gates behind a switch with `setsebool -P`. If nothing is logged although access fails, ordinary Unix permissions may have refused first, the audit daemon may not be running, or a `dontaudit` rule may be hiding the denial, which `semodule -DB` lifts. To test SELinux as the cause without loosening everything, [`semanage permissive -a httpd_t`](https://man7.org/linux/man-pages/man8/semanage-permissive.8.html) makes one domain permissive.

## How do you read an avc: denied line field by field?

Find the records with `ausearch`, using every SELinux message type. This is the [ausearch manual's](https://man7.org/linux/man-pages/man8/ausearch.8.html) own example for SELinux logs. The manual says "Recent is 10 minutes ago," and `-i` interprets numeric values as text.

```bash
ausearch -m AVC,USER_AVC,SELINUX_ERR,USER_SELINUX_ERR -i -ts recent
```

Red Hat's sample record shows Apache reading a directory:

```text
type=AVC msg=audit(1395177286.929:1638): avc:  denied  { read } for  pid=6591 comm="httpd" name="webpages" dev="0:37" ino=2112 scontext=system_u:system_r:httpd_t:s0 tcontext=system_u:object_r:nfs_t:s0 tclass=dir
```

| Field | Meaning | In the sample |
|---|---|---|
| `type=AVC` | Kernel-generated; `USER_AVC` comes from user-space object managers | Kernel |
| `msg=audit(time:serial)` | Timestamp and serial; the `type=SYSCALL` record with the same serial adds the executable and UIDs | `1395177286.929:1638` |
| `avc: denied` | The action taken; `granted` appears when an `auditallow` rule asked for a record | Denied |
| `{ read }` | The refused permission; `getattr`, `read` and `write` are the common ones | `read` |
| `pid`, `comm` | Process ID and command name | 6591, `httpd` |
| `name` or `path`, `dev`, `ino` | The object; the `name` field is not always present | `webpages` |
| `scontext` | Source context, `user:role:type:level`; the type is the domain | `httpd_t` |
| `tcontext` | Target context in the same format | `nfs_t` |
| `tclass` | Object class: `file`, `dir`, `tcp_socket` and so on | `dir` |
| `permissive=0` or `1` | `1` when a denied permission was allowed anyway by global or per-domain permissive mode | Not shown |

The field meanings come from Red Hat's [audit-log section](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) and the [SELinux Notebook](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/auditing.md), which dates `permissive=` to Linux 4.17. The kernel's [avc.c](https://github.com/torvalds/linux/blob/master/security/selinux/avc.c) writes `permissive=0` when the access was refused and `1` when it went through. Red Hat's [introduction](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/getting-started-with-selinux_using-selinux) adds that a D-Bus message the policy forbids produces a `USER_AVC` and a timed-out call.

The same introduction explains the cases where no record exists: SELinux rules "are checked after DAC rules," so "no SELinux denial is logged if the traditional DAC rules prevent the access." A plain `Permission denied` with no AVC is often a mode or ownership problem, covered in [how Unix permission classes are chosen](/blog/permissions-do-not-add-up), [the umask ceiling](/blog/a-ceiling-and-not-a-request) and the [chmod calculator](/tools/chmod-calculator).

## Is the denial a file label, a port, or a boolean?

Read `tclass`, the permission and the target type together. They usually point to one of three repairs.

| Record shows | Likely cause | Confirm with | Repair |
|---|---|---|---|
| `tclass=file` or `dir`; target type such as `var_t`, `default_t`, `user_home_t` or `samba_share_t` | Wrong file label | `matchpathcon -V`, `ls -Z`, `restorecon -n -v` | `semanage fcontext` and `restorecon` |
| `{ name_bind }` on `tcp_socket` | Service listening on a port whose type its domain may not bind | `semanage port -l` | `semanage port -a` |
| `{ name_connect }` on `tcp_socket` | Outbound connection to a port type the domain may not reach | `getsebool -a`, `semanage boolean -l`, `semanage port -l` | `setsebool -P` for a matching boolean; otherwise a port type the domain may reach |
| Target type of a mounted filesystem such as `nfs_t` or `cifs_t` | Default label of the mount, controlled by a boolean | `semanage boolean -l` | `setsebool -P` |

Red Hat's [non-standard configuration example](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) shows the first two rows. Apache told to listen on port 3131 fails with `(13)Permission denied: AH00072: make_sock: could not bind to address [::]:3131`. After the port is fixed, the content returns 403 Forbidden because `/var/test_www/html` carries `var_t`. The [troubleshooting chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) adds that `/srv` is labeled `var_t` on RHEL, files in new top-level directories can get `default_t`, and Apache is denied both. Its port denial reads:

```text
type=AVC msg=audit(1225948455.061:294): avc:  denied  { name_bind } for  pid=4997 comm="httpd" src=9876 scontext=unconfined_u:system_r:httpd_t:s0 tcontext=system_u:object_r:port_t:s0 tclass=tcp_socket
```

The Notebook's [permission reference](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/object_classes_permissions.md) says `name_bind` controls the relationship "between a socket and the port number" and `name_connect` means "Connect to a specific port type." The first sample record has an `nfs_t` target. Red Hat's [chapter on booleans](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) says NFS client mounts get that default label and that booleans such as `httpd_use_nfs` ("Allow httpd to access nfs file systems") control access, so a denial like that points to a boolean first, not a relabel. For access the default policy does not cover, the same guide says to "start by searching for a boolean that matches your use case," else use "a matching SELinux type or even create a local policy module."

### What does audit2why add?

`audit2allow -w`, also run as `audit2why`, classifies each record against the loaded policy. The common verdicts below come from the [audit2allow script](https://github.com/SELinuxProject/selinux/blob/main/python/audit2allow/audit2allow):

```bash
ausearch -m AVC,USER_AVC -ts recent --raw | audit2allow -w
```

| Verdict printed | Meaning |
|---|---|
| `The boolean X was set incorrectly.` | A boolean would allow it; the output includes the matching `setsebool -P` command |
| `Missing type enforcement (TE) allow rule.` | No rule and no boolean; the output suggests `audit2allow` |
| `Missing role allow rule.` or `Typebounds violation.` | A role-pair or parent-type allow rule is missing |
| `Unknown - would be allowed by active policy` | The policy changed since the denial, or an in-memory boolean differs from the permanent one |

A mislabeled file usually gets the missing-rule verdict too, because policy has no rule for that pair of types either. That is why labeling comes first: the verdict is not an instruction to write a rule.

Confirm a service's domain with `ps -efZ | grep name`. In Red Hat's [custom application example](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/writing-a-custom-selinux-policy_using-selinux) a daemon with no policy runs as `unconfined_service_t`, and denials began only after its own policy was installed.

### How many ports does a port type cover?

A confined service can listen only on the port types its policy allows. The counts below come from Fedora's [corenetwork.te.in](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/kernel/corenetwork.te.in), and Red Hat's [guide](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) shows the same `http_port_t` and `http_cache_port_t` lists in `semanage port -l` output.

| Port type | Default TCP ports | Count |
|---|---|---|
| `ssh_port_t` | 22 | 1 |
| `smtp_port_t` | 25, 465, 587 | 3 |
| `http_port_t` | 80, 81, 443, 488, 8008, 8009, 8443, 9000 | 8 |
| `http_cache_port_t` | 8080, 8118, 8123, 10001-10010 | 13 |

The [semanage-port manual](https://man7.org/linux/man-pages/man8/semanage-port.8.html) uses sshd on port 8991 as its example, which is why [moving sshd off port 22](/blog/ssh-hardening-linux-servers) fails on an SELinux system until the new port is labeled. The [port reference](/tools/port-reference) lists what each number is normally used for.

## How do you fix a file label so it survives a relabel?

Record the correct label in policy with `semanage fcontext`, then apply it with `restorecon`. Red Hat's [troubleshooting chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) moves a website to `/srv/myweb`. The `matchpathcon` line is the comparison step Red Hat's [non-standard configuration chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) uses, pointed at the new path:

```bash
matchpathcon /var/www/html /srv/myweb
semanage fcontext -a -t httpd_sys_content_t "/srv/myweb(/.*)?"
restorecon -R -v /srv/myweb
```

The troubleshooting chapter notes that "The semanage utility does not change the context," so the `restorecon` step is required. Its [RHEL 7 guide](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/sect-security-enhanced_linux-working_with_selinux-selinux_contexts_labeling_files) says rules added this way "are persistent, even if the file system is relabeled," and says to put quotation marks around a regular expression such as `/web(/.*)?`.

To make a new tree match an existing one, use an equivalence rule. This is the Apache example from the same non-standard configuration chapter, for a relocated document root. Red Hat runs `restorecon -Rv /var/`; here the relabel is narrowed to the new tree:

```bash
semanage fcontext -a -e /var/www /var/test_www
restorecon -R -v /var/test_www
```

The [semanage-fcontext manual](https://man7.org/linux/man-pages/man8/semanage-fcontext.8.html) warns that "substitution based on another substitution does not work," so point each rule at the original path. Preview any relabel first: the [restorecon manual](https://man7.org/linux/man-pages/man8/restorecon.8.html) says `-n` changes nothing, and with `-v` it lists the files whose labels would change.

### Why is chcon the wrong tool?

`chcon -t httpd_sys_content_t /web` fixes the denial immediately and then disappears. Red Hat's RHEL 7 guide says "changes made with the chcon command are not persistent across file-system relabels, or the execution of the restorecon command." Use it to test a theory, then record the real rule.

### Why does a moved file keep the wrong label?

The label follows the file on `mv`. Red Hat's [label maintenance chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/sect-security-enhanced_linux-working_with_selinux-maintaining_selinux_labels_) says files and directories "keep their current SELinux context when they are moved," and its example leaves `user_home_t` on a file moved into `/var/www/html`. A copy creates a new file labeled by the destination's rules, unless `cp --preserve=context` carries the old label along. It advises copying rather than moving, and the RHEL 9 [troubleshooting chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) repairs an already moved file with `restorecon -v`.

## How do you fix a port or boolean denial?

For a port, assign the service's port to a type its domain may bind. Red Hat's [Apache example](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) and the semanage-port manual use the same form:

```bash
semanage port -l | grep http_port_t
semanage port -a -t http_port_t -p tcp 3131
semanage port -a -t ssh_port_t -p tcp 8991
```

Red Hat's [troubleshooting chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) explains the flags: `-a` adds a record, `-t` sets the type and `-p` the protocol. List your own additions with `semanage port -l -C`. If the port already has a type, `-a` does not fail. The [semanage source](https://github.com/SELinuxProject/selinux/blob/main/python/semanage/seobject.py) prints `Port tcp/N already defined, modifying instead` and changes the type, and it refuses to delete a mapping that comes from policy with `Port tcp/N is defined in policy, cannot be deleted`.

For a boolean, find it, read what it does, and set it persistently:

```bash
getsebool -a | grep httpd_can_network
semanage boolean -l | grep httpd_can_network
setsebool -P httpd_can_network_connect_db on
```

Red Hat's [guide](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux) says `-P` makes the change persistent across restarts, that it "requires a rebuild of the entire policy" and may take time, and that clearer descriptions in `semanage boolean -l` come with the `selinux-policy-devel` package. The [setsebool manual](https://man7.org/linux/man-pages/man8/setsebool.8.html) adds that without `-P` "only the current boolean value is affected."

Choose the narrowest boolean that covers the access. In Fedora's [Apache policy](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/contrib/apache.te), `httpd_can_network_connect` is described as "Allow HTTPD scripts and modules to connect to the network using TCP" and expands to `corenet_tcp_connect_all_ports(httpd_t)`. The [corenet interface](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/kernel/corenetwork.if.in) defines that as `allow $1 port_type:tcp_socket name_connect;`, so it opens every port type. `httpd_can_network_connect_db` opens only database port types such as MySQL, PostgreSQL, MSSQL and Oracle, and Red Hat's troubleshooting chapter uses it for Apache talking to MariaDB. A reverse proxy such as the one in [the nginx proxy guide](/blog/nginx-reverse-proxy-setup) is an outbound `name_connect` too. Fedora's [apache.fc](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/contrib/apache.fc) labels `/usr/bin/nginx` with `httpd_exec_t`, the Apache executable type, so confirm the domain with `ps -efZ` before choosing.

After any repair, repeat the failing action and run `ausearch -m AVC -i -ts recent`. Red Hat's verification step expects `<no matches>`.

## Why does nothing show up in the audit log even though access fails?

The commands below collect the evidence for each cause, in order.

```bash
auditctl -s                                   # pid 0: auditd is not running; lost: dropped records
grep -o 'audit=[^ ]*' /proc/cmdline           # audit=0 turns kernel audit off
journalctl _TRANSPORT=audit | grep AVC        # records read from the kernel audit subsystem
journalctl -t setroubleshoot                  # Red Hat's check when auditd runs but ausearch is empty
dmesg | grep -i -e type=1300 -e type=1400     # Red Hat's check when auditd is not running
semodule -DB                                  # also log dontaudit denials
semodule -B                                   # restore the dontaudit rules afterward
```

**Auditing is off or not collecting.** The [auditctl manual](https://man7.org/linux/man-pages/man8/auditctl.8.html) says a `pid` of 0 in `auditctl -s` "indicates that the audit daemon is not running," and the `lost` entry counts records discarded because the kernel queue overflowed. The [kernel parameter documentation](https://docs.kernel.org/admin-guide/kernel-parameters.html) says `audit=0` means "kernel audit is disabled and can not be enabled until the next reboot." Without auditd the records go elsewhere. The [journald.conf manual](https://man7.org/linux/man-pages/man5/journald.conf.5.html) says `Audit=` defaults to yes in the default namespace, the [journal fields manual](https://man7.org/linux/man-pages/man7/systemd.journal-fields.7.html) marks audit-sourced entries `_TRANSPORT=audit`, and the [audit2allow manual](https://man7.org/linux/man-pages/man1/audit2allow.1.html) says that without the audit package the messages land in `/var/log/messages`.

**A dontaudit rule suppresses it.** The Notebook's [access vector rules page](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/avc_rules.md) says a `dontaudit` rule "stops the auditing of denial messages" for events known to happen harmlessly, with the example `dontaudit traceroute_t { port_type -port_t }:tcp_socket name_bind;`. Its [permission reference](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/object_classes_permissions.md) adds that when a denied `access()` or `faccessat()` call meets a `dontaudit` rule on `audit_access`, no AVC event is written. Red Hat's fix is `semodule -DB` to log everything, then `semodule -B`. The [semodule manual](https://man7.org/linux/man-pages/man8/semodule.8.html) describes `-D` as temporarily removing dontaudits, reverting "whenever policy is rebuilt."

**SELinux is not the blocker.** Red Hat's last step is `setenforce 0` and a retry: "If the problem still occurs, something different than SELinux is blocking your scenario." Other layers include the [systemd sandboxing settings](/blog/systemd-service-hardening), a firewall and ordinary modes, all part of [a hardened server's layers](/blog/linux-server-hardening).

**The search missed it.** `-ts recent` covers ten minutes, and a denied D-Bus message is logged as a `USER_AVC`, so search all four message types.

## How do you put one domain in permissive mode instead of the whole system?

```bash
semanage permissive -a httpd_t
# reproduce the failure
ausearch -m AVC,USER_AVC -i -ts recent
semanage permissive -d httpd_t
```

The domain keeps running normally but logs what it would have been denied, with `permissive=1` in each record. The [semanage-permissive manual](https://man7.org/linux/man-pages/man8/semanage-permissive.8.html) lists current domains with `-l`, split into builtin and customized types, and says `-d` can remove only domains added with `semanage permissive`. The [semanage source](https://github.com/SELinuxProject/selinux/blob/main/python/semanage/seobject.py) installs a module named `permissive_httpd_t` containing `(typepermissive httpd_t)`, and the Notebook's [modes page](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/modes.md) stores such a module under its `400` directory and notes that `sestatus` does not display per-domain modes.

The system-wide alternative is `setenforce 0`, which Red Hat's [introduction](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/getting-started-with-selinux_using-selinux) says does not persist across reboots. The same chapter warns that permissive domains "can compromise security of your system" and recommends caution, "for example, when debugging a specific scenario." Red Hat's [permissive mode procedure](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/changing-selinux-states-and-modes_using-selinux) adds "Each AVC is logged only once in this case." One permissive run can also reveal several denials where enforcement showed one. That is an inference: the introduction says an enforced denial blocks the operation and "the process receives an error," and a program that stops at its first error never reaches its later accesses. Collect them all, fix labels, ports and booleans, then remove the permissive record and test again.

## When is audit2allow the right answer?

After labels, ports and booleans are ruled out, and only for a specific, understood access. Red Hat's [guidance](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) is that you "should not use audit2allow to generate a local policy module as your first option," because labeling problems and configuration changes you "forgot to tell SELinux about" are more common.

Three situations qualify:

1. **A policy gap.** Red Hat's [example](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) is a new PostgreSQL release performing an action the shipped policy has not seen. The route is a local module plus a support case against the `selinux-policy` component with the output of `audit2allow -w -a` and `audit2allow -a`.
2. **A confined custom application.** Red Hat's [custom policy chapter](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/writing-a-custom-selinux-policy_using-selinux) builds a policy with `sepolicy generate --init`, then runs `ausearch -m AVC -ts recent | audit2allow -R`, which suggests a `logging_write_generic_logs(mydaemon_t)` macro. Because "rules suggested by audit2allow can be incorrect for certain cases," it inspects the macro with `macro-expander` first.
3. **A harmless denial.** The [audit2allow manual](https://man7.org/linux/man-pages/man1/audit2allow.1.html) says some denials "are not fatal to the application," in which case a `dontaudit` rule from `-D` may be preferable to an `allow` rule.

The same manual warns against "blindly implementing the sometimes broad changes recommended by this utility" and says a new domain or type is often better. A label denial shows why: for Red Hat's 403 example, whose log shows `httpd` denied `getattr` on the file, an illustrative rule in the manual's output format would read `allow httpd_t var_t:file { getattr open read };`. Red Hat says files created in `/srv` inherit `var_t`, so that rule would cover every such tree, where one `semanage fcontext` line would have scoped the access to the website.

When it is the right tool, scope the input to one process and review the file before loading it:

```bash
ausearch -c 'mydaemon' --raw | audit2allow -m local > local.te
cat local.te
ausearch -c 'mydaemon' --raw | audit2allow -M my-mydaemon
semodule -i my-mydaemon.pp
semodule -lfull | grep my-mydaemon
semodule -r my-mydaemon
```

The `-a` option reads the whole audit and message log; the manual's `-l` option limits input to after the last policy reload. On RHEL, custom rules carry a support caveat. Red Hat's [local module procedure](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux) warns "Red Hat does not support creating SELinux policy modules with custom rules because this falls outside of the Production Support Scope of Coverage," says to use only rules Red Hat provides, and lists local modules at priority 400.

## What breaks after a fix that looked right?

**A fix vanishes after a relabel or reboot.** A `chcon` label disappears at relabel, and a `setsebool` without `-P` leaves the boot-time default unchanged, per its [manual](https://man7.org/linux/man-pages/man8/setsebool.8.html). Fix: record labels with `semanage fcontext`, run `restorecon`, confirm with `semanage fcontext -l -C`, and repeat booleans with `-P`.

**`restorecon -R` leaves a directory alone.** The restorecon manual says a file labeled with a customizable type is not reset "unless the -F option is used," and lists the types in `/etc/selinux/{SELINUXTYPE}/contexts/customizable_types`. Fix: add `-F` after checking that the label really is wrong.

**A new rule relabels more than intended.** The semanage-fcontext manual says local rules are matched "from most recent one to the oldest, with first match being used," and that expressions should be "as specific as possible." Fix: anchor the path and review `semanage fcontext -l -C`.

**A port moves away from another service.** `semanage port -a` on a port that already has a type modifies it, per the source. Fix: run `semanage port -l | grep PORT` first, and remove only your own records with `-d`.

**A container cannot read a bind mount.** [Podman's documentation](https://docs.podman.io/en/latest/markdown/podman-run.1.html) says "Podman does not change the labels set by the OS," and that `:z` (shared) or `:Z` (private) on the volume relabels it. It warns "Do not relabel system files and directories," and offers `--security-opt label=disable` for a whole home directory. Fix: use `:z` or `:Z` on a dedicated directory.

**dontaudit rules stay disabled after `semodule -DB`.** The audit log grows noisy with known harmless events until `semodule -B` rebuilds them. Fix: run it as soon as the evidence is collected.

**Mislabeled files after a spell in system-wide permissive mode.** Red Hat's [warning](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/changing-selinux-states-and-modes_using-selinux) is that "users and processes might label various file-system objects incorrectly," and that objects created while SELinux is disabled get no label. Fix: preview with `restorecon -n -v -R` on the affected tree, then run it without `-n` before returning to enforcing.

**A service started by hand gets the wrong label.** Red Hat's introduction says to start services with `systemctl start` "to avoid incorrect SELinux labeling." Fix: start it through systemd and read the AVC for that run.

## Sources

- [Red Hat: Troubleshooting problems related to SELinux (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/troubleshooting-problems-related-to-selinux_using-selinux)
- [Red Hat: Getting started with SELinux (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/getting-started-with-selinux_using-selinux)
- [Red Hat: Changing SELinux states and modes (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/changing-selinux-states-and-modes_using-selinux)
- [Red Hat: Configuring SELinux for applications and services with non-standard configurations (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/configuring-selinux-for-applications-and-services-with-non-standard-configurations_using-selinux)
- [Red Hat: Writing a custom SELinux policy (RHEL 9)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_selinux/writing-a-custom-selinux-policy_using-selinux)
- [Red Hat: SELinux contexts, labeling files (RHEL 7)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/sect-security-enhanced_linux-working_with_selinux-selinux_contexts_labeling_files)
- [Red Hat: Maintaining SELinux labels (RHEL 7)](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/7/html/selinux_users_and_administrators_guide/sect-security-enhanced_linux-working_with_selinux-maintaining_selinux_labels_)
- [SELinux Notebook: Auditing SELinux Events](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/auditing.md)
- [SELinux Notebook: Access Vector Rules](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/avc_rules.md)
- [SELinux Notebook: SELinux Permissive and Enforcing Modes](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/modes.md)
- [SELinux Notebook: Object Classes and Permissions](https://github.com/SELinuxProject/selinux-notebook/blob/main/src/object_classes_permissions.md)
- [SELinux project: audit2allow script source](https://github.com/SELinuxProject/selinux/blob/main/python/audit2allow/audit2allow)
- [SELinux project: semanage seobject.py source](https://github.com/SELinuxProject/selinux/blob/main/python/semanage/seobject.py)
- [Fedora selinux-policy: corenetwork.te.in](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/kernel/corenetwork.te.in)
- [Fedora selinux-policy: corenetwork.if.in](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/kernel/corenetwork.if.in)
- [Fedora selinux-policy: apache.te](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/contrib/apache.te)
- [Fedora selinux-policy: apache.fc](https://github.com/fedora-selinux/selinux-policy/blob/rawhide/policy/modules/contrib/apache.fc)
- [Linux kernel source: security/selinux/avc.c](https://github.com/torvalds/linux/blob/master/security/selinux/avc.c)
- [man7.org: ausearch(8)](https://man7.org/linux/man-pages/man8/ausearch.8.html)
- [man7.org: auditctl(8)](https://man7.org/linux/man-pages/man8/auditctl.8.html)
- [man7.org: audit2allow(1)](https://man7.org/linux/man-pages/man1/audit2allow.1.html)
- [man7.org: semanage-fcontext(8)](https://man7.org/linux/man-pages/man8/semanage-fcontext.8.html)
- [man7.org: semanage-port(8)](https://man7.org/linux/man-pages/man8/semanage-port.8.html)
- [man7.org: semanage-permissive(8)](https://man7.org/linux/man-pages/man8/semanage-permissive.8.html)
- [man7.org: semodule(8)](https://man7.org/linux/man-pages/man8/semodule.8.html)
- [man7.org: setsebool(8)](https://man7.org/linux/man-pages/man8/setsebool.8.html)
- [man7.org: restorecon(8)](https://man7.org/linux/man-pages/man8/restorecon.8.html)
- [man7.org: journald.conf(5)](https://man7.org/linux/man-pages/man5/journald.conf.5.html)
- [man7.org: systemd.journal-fields(7)](https://man7.org/linux/man-pages/man7/systemd.journal-fields.7.html)
- [Linux kernel documentation: The kernel's command-line parameters](https://docs.kernel.org/admin-guide/kernel-parameters.html)
- [Podman documentation: podman-run](https://docs.podman.io/en/latest/markdown/podman-run.1.html)
