
## What hardening is actually for

You have a fresh Linux install with a public IP, or a VM on a lab network that will eventually hold something you care about. The default configuration works, which is the problem: it was built to work everywhere, not to be safe in your specific situation. Hardening is the process of removing the parts you are not using and constraining the parts you are.

None of what follows is clever. It is a short list of things that stop the attacks that actually happen, done the same way on every machine so you can tell at a glance when one is wrong.

## Start with updates

The single most important thing you can do for server security is keep it updated. Unpatched vulnerabilities are how most systems get compromised. I run unattended-upgrades on all my Debian/Ubuntu servers for security patches, and I schedule a maintenance window monthly for larger updates that require reboots.

```bash
apt update && apt upgrade -y
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

That last command writes `/etc/apt/apt.conf.d/20auto-upgrades` with the two settings that matter, one to refresh the package lists on a schedule and one to actually apply upgrades. Out of the box it applies the security pocket only, which is the behaviour you want on a server: security fixes land automatically, feature updates wait for you.

Verify it rather than assuming. This runs the whole process without changing anything and prints what it would have done:

```bash
unattended-upgrade --dry-run --debug
```

Correct output ends with a list of the packages it considered and a line confirming no packages needed upgrading, or naming the ones it would install. If it prints that unattended upgrades are disabled, the config from `dpkg-reconfigure` did not take.

One more piece people skip: a kernel update does nothing until you reboot. The file `/var/run/reboot-required` exists when the system is waiting on one. Either check it from your monitoring or set `Unattended-Upgrade::Automatic-Reboot` and a reboot window in `/etc/apt/apt.conf.d/50unattended-upgrades` and let the machine handle it.

## SSH configuration

SSH is usually the primary way you access a server, which makes it the primary target for attackers. My SSH hardening configuration:

- Disable root login: `PermitRootLogin no`
- Use key-based authentication only: `PasswordAuthentication no`
- Change the default port (not security, but reduces noise)
- Limit which users can SSH in: `AllowUsers maxdoubin`
- Use fail2ban to block brute force attempts

The critical habit is verifying the effective configuration rather than the file you edited. Modern distributions ship an `Include /etc/ssh/sshd_config.d/*.conf` line at the top of the main config, and sshd takes the first value it sees for most keywords. A drop-in file that sets `PasswordAuthentication yes` and sorts before your change wins, silently. Ask the daemon what it thinks:

```bash
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|maxauthtries|allowusers)'
```

Correct output on a hardened box:

```
permitrootlogin no
pubkeyauthentication yes
passwordauthentication no
maxauthtries 3
allowusers maxdoubin
```

Everything sshd prints there is lowercase and reflects the merged configuration including drop-ins. If the file says one thing and `sshd -T` says another, `sshd -T` is right. Run `sshd -t` to syntax check before restarting, and keep your existing session open while you test the new one from a second terminal.

For reference, the upstream default for `MaxAuthTries` is 6, and `PermitRootLogin` defaults to prohibit-password on current OpenSSH, so root cannot log in with a password but can with a key unless you set it to `no`.

## Firewall

I use ufw (Uncomplicated Firewall) or iptables depending on the distribution. The principle is simple: deny everything by default, then explicitly allow only the traffic you need.

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.0.10.0/24 to any port 22
ufw enable
```

This allows SSH only from my management VLAN and blocks everything else inbound.

Confirm with `ufw status verbose`, which prints the default policies and every rule. The output should show `Default: deny (incoming), allow (outgoing)` followed by your allow rules. If the rule list is empty and the default is deny, you are about to lose your session.

Pair the firewall with a look at what is actually listening, because a closed port on the firewall and a service that should not be running at all are different problems:

```bash
ss -tulpn
```

Every line is a socket accepting connections, with the process name attached. Anything bound to `0.0.0.0` or `[::]` that you cannot explain is either a service to disable or a rule to write. Databases in particular ship bound to all interfaces on plenty of distributions.

## Kernel network settings

A handful of sysctl values close off old network tricks. Put them in a file under `/etc/sysctl.d/` so they survive reboots:

```
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.tcp_syncookies = 1
kernel.dmesg_restrict = 1
```

Apply with `sysctl --system` and check any single value with `sysctl net.ipv4.tcp_syncookies`, which should print `net.ipv4.tcp_syncookies = 1`. Leave `net.ipv4.ip_forward` at 0 unless the machine is deliberately a router; a host that forwards packets it was never meant to forward is a bridge between segments you thought were separate.

## User management

Every person gets their own account. No shared accounts, no sharing passwords. Sudo is configured so users can elevate privileges when needed, and all sudo usage is logged.

I also disable any accounts that are not actively needed. Default service accounts that ship with the OS or installed packages get locked.

Locking is where people get it wrong, so be specific about what you mean. `passwd -l user` prepends an exclamation mark to the password hash, which disables password login and nothing else. That account can still log in with an SSH key, still run cron jobs, and still be switched to by root. To actually stop an account, expire it and remove its shell:

```bash
usermod --expiredate 1 olduser
usermod --shell /usr/sbin/nologin olduser
```

Then remove their key from every `authorized_keys` file, which is the step everyone forgets and the reason centralised key management exists.

Sudo rules belong in files under `/etc/sudoers.d/`, edited with `visudo -f`, never by hand. `visudo` refuses to save a file that fails its syntax check, and a broken sudoers file means nobody on the machine can elevate.

## Logging

I send all system logs to a central [syslog](/blog/syslog-centralized-logging) server using rsyslog. This means that even if a server is compromised and the attacker clears local logs, the copies on the syslog server are intact.

Log everything. Disk space is cheap. Missing logs during an incident investigation is expensive.

Two details make that actually true. Ship over TCP rather than UDP so bursts are not silently dropped, and make sure the receiving server's own firewall accepts the traffic, because a collector that is not listening looks exactly like a quiet network. Test end to end with `logger -p auth.notice "hardening test from $(hostname)"` and then grep for that string on the collector. If it is not there, fix the pipeline now, not during an incident.

Authentication events land in `/var/log/auth.log` on Debian family systems and `/var/log/secure` on Red Hat family systems. Those are the files that show sudo usage, SSH accepts, and failed passwords, so they are the ones that matter most on the collector.

## File permissions

Review file permissions on sensitive files. `/etc/shadow` should only be readable by root. SSH keys should be 600. Configuration files should not be world-readable if they contain credentials.

On Debian family systems `/etc/shadow` is mode 640 owned by `root:shadow`, so root and the shadow group can read it and nobody else. Private keys must be 600 and `~/.ssh` must be 700, because sshd runs strict mode checks by default and will refuse to use a key whose file or parent directory is group or world writable. That refusal is silent from the client side, which is why key auth mysteriously stops working after someone copies a home directory around.

A quick audit of setuid binaries is worth running once per build:

```bash
find / -xdev -type f -perm -4000 -printf '%M %u %p\n' 2>/dev/null
```

You will get a short list containing things like `passwd`, `sudo`, and `mount`. Anything on that list that you or an application installed deserves a hard look, because a setuid binary is a program that runs as its owner no matter who starts it.

These are basics, but basics done consistently are more valuable than advanced techniques done sporadically.

## What breaks

**Enabling the firewall before allowing your own SSH.** The connection drops mid-command and the box is now unreachable. Always add the allow rule first, and on a machine with no console, arrange a rollback before you start: `echo 'ufw disable' | at now + 5 minutes` gives you a safety net you can cancel once you confirm you are still connected.

**Editing sshd_config and being overridden by a drop-in.** Cloud images in particular ship a file in `/etc/ssh/sshd_config.d/` that enables password authentication, and because the include sits at the top and first match wins, your edit lower in the main file does nothing. `sshd -T` is the only honest answer.

**Automatic updates that never take effect.** The packages install, the kernel is still the old one, and the machine has been waiting on a reboot for four months. Monitor for `/var/run/reboot-required` or configure an automatic reboot window.

**Locking an account with `passwd -l` and considering it done.** Password login is disabled; key login, cron, and existing sessions are not. Expire the account, change the shell, and remove the keys.

**Central logging that was never verified.** UDP syslog to a collector whose firewall drops port 514 produces no errors anywhere. Send a known string with `logger` and confirm it arrives.

**Fixing a permissions error with `chmod 777`.** It makes the symptom go away and creates a world writable path, which on a config file holding credentials is worse than the original failure. Work out which user needs access and grant that.

## References

- https://man7.org/linux/man-pages/man5/sshd_config.5.html
- https://man7.org/linux/man-pages/man5/sudoers.5.html
- https://man7.org/linux/man-pages/man5/shadow.5.html
- https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html
- https://wiki.archlinux.org/title/Security
- https://csrc.nist.gov/publications/detail/sp/800-123/final
