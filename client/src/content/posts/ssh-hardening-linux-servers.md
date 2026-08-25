
## Why default SSH is not enough

You stood up a server, opened port 22 so you could reach it, and the auth log is now thousands of lines of strangers trying to log in as root. Nothing has gone wrong yet. The question is what to change, in what order, without locking yourself out of a machine you may not have console access to.

A server with SSH exposed on port 22 will see hundreds or thousands of brute-force login attempts per day. Most of them come from automated bots scanning the internet. Default SSH configuration allows password authentication, which means a weak password is all that separates your server from unauthorized access.

## What is actually happening when you connect

Worth understanding before you change settings, because the settings map onto the phases.

SSH runs two protocols in sequence. The transport layer, specified in RFC 4253, negotiates algorithms, performs a key exchange to derive session keys, and proves the server's identity with its host key. Your client checks that host key against `~/.ssh/known_hosts` and refuses to continue if it changed. That check is the only thing standing between you and a machine in the middle, and it is why the scary warning about a changed host key deserves an actual investigation rather than deleting the line.

Then the authentication layer, RFC 4252, runs inside that encrypted channel. The `publickey` method is not "send the key and hope". The client signs a blob that includes the session identifier from the key exchange, so the signature is bound to this connection and cannot be replayed against another server. That is the structural reason keys beat passwords: a password is a secret you hand to whatever is on the other end, and a signature is not reusable by whoever receives it.

## Key-based authentication

The most important change is disabling password authentication and requiring key pairs. Generate a key pair on your workstation and copy the public key to the server:

```bash
ssh-keygen -t ed25519 -C "admin@myserver"
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server
```

Then in `/etc/ssh/sshd_config`:

```
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
```

Ed25519 is specified for SSH in RFC 8709 and is the sensible default on anything modern. Test that the key works before you disable passwords. That order is not optional, and reversing it is the single most common way people lock themselves out.

## Other critical settings

```
# Disable root login entirely
PermitRootLogin no

# Limit login attempts per connection
MaxAuthTries 3

# Use only modern algorithms
KexAlgorithms curve25519-sha256,diffie-hellman-group16-sha512
Ciphers aes256-gcm@openssh.com,chacha20-poly1305@openssh.com
MACs hmac-sha2-256-etm@openssh.com,hmac-sha2-512-etm@openssh.com

# Idle timeout
ClientAliveInterval 300
ClientAliveCountMax 2

# Limit which users can log in
AllowUsers admin deployer

# Disable X11 forwarding unless needed
X11Forwarding no
```

Some numbers behind those, so you know what you are changing from. `MaxAuthTries` defaults to 6. `LoginGraceTime` defaults to 120 seconds, which is how long a connection may sit unauthenticated before the server drops it. `MaxStartups` defaults to `10:30:100`, meaning that beyond 10 concurrent unauthenticated connections the server starts randomly refusing new ones at a 30 percent probability, rising to certain refusal at 100. That last one explains the mysterious intermittent "connection reset" during a scan or a mass deployment: it is the server defending itself, not a network fault.

`PermitRootLogin` deserves a note. Current OpenSSH defaults it to `prohibit-password`, so root cannot use a password but can still use a key. Setting it to `no` is a real change, not a restatement of the default.

## Verify the running configuration, not the file

Modern distributions put `Include /etc/ssh/sshd_config.d/*.conf` at the top of the main config, and for most keywords sshd takes the first value it encounters. A drop-in file that sorts early can quietly override the edit you just made lower down in the main file. Cloud images ship exactly such a file, and it often enables password authentication.

Ask the daemon instead:

```bash
sshd -t && sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|maxauthtries|port|allowusers)'
```

Correct output on a hardened server:

```
port 2222
permitrootlogin no
pubkeyauthentication yes
passwordauthentication no
maxauthtries 3
allowusers admin deployer
```

`sshd -t` returns silently when the config parses and prints a file and line number when it does not. Never restart sshd without running it first.

Then prove the lockout works from the client side, from a machine that has no key installed:

```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no admin@server
```

The correct result is an immediate `Permission denied (publickey).` If you get a password prompt, password authentication is still enabled somewhere and `sshd -T` will tell you where to look.

Restarting the daemon does not kill established sessions, because each session is a forked child process. Keep your current connection open anyway and test the new configuration from a second terminal. If the new one fails, you still have the old one to fix it with.

## Port change and Fail2Ban

Changing SSH to a non-standard port (e.g., 2222) reduces automated scanning noise significantly. It is security by obscurity and not a substitute for real controls, but it is a low-cost way to reduce log clutter.

Two things bite people here. On distributions that start SSH through systemd socket activation, the `Port` directive in `sshd_config` is ignored entirely, because systemd owns the listening socket. You change it with a socket override instead:

```bash
systemctl edit ssh.socket
# add:
# [Socket]
# ListenStream=
# ListenStream=2222
systemctl daemon-reload
systemctl restart ssh.socket
```

The empty `ListenStream=` matters. Without it you add a port rather than replacing the default. Confirm with `ss -tlnp | grep sshd` or, under socket activation, `systemctl status ssh.socket`.

On SELinux systems, the policy only permits sshd to bind the ports labelled `ssh_port_t`. Add yours before restarting:

```bash
semanage port -a -t ssh_port_t -p tcp 2222
```

Skip that and sshd fails to start with a permission denied on bind, which reads like a firewall problem and is not.

Fail2ban monitors failed login attempts and automatically blocks IPs after a configurable number of failures:

```bash
apt install fail2ban
systemctl enable fail2ban
```

The shipped defaults ban for 10 minutes after 5 failures inside a 10 minute window. Raise `bantime` well beyond that on an internet-facing box; a 10 minute ban barely inconveniences a patient scanner. Check that the jail is actually running and catching things:

```bash
fail2ban-client status sshd
```

```
Status for the jail: sshd
|- Filter
|  |- Currently failed: 2
|  |- Total failed:     1394
|  `- File list:        /var/log/auth.log
`- Actions
   |- Currently banned: 7
   |- Total banned:     212
```

A `Total failed` of 0 on a server that has been up for a week means the filter is reading the wrong place, not that nobody has tried.

With key-based auth, a changed port, and fail2ban in place, your SSH attack surface is dramatically reduced.

## What breaks

**MaxAuthTries counts every key your agent offers.** If your agent holds five identities and the right one is fourth in line, a server set to `MaxAuthTries 3` disconnects you before it is tried, and the error says too many authentication failures rather than anything useful. Fix it on the client with `IdentitiesOnly yes` and an explicit `IdentityFile` in `~/.ssh/config`, so only the relevant key is offered.

**Port changed in sshd_config on a socket-activated system.** The daemon restarts cleanly, reports no error, and keeps listening on 22. Edit the socket unit, not the config file.

**Port changed without updating SELinux.** sshd refuses to start and the message points at the bind, not at policy. `semanage port -a` first.

**Replacing the algorithm lists instead of amending them.** A bare `Ciphers` line replaces the default list outright, so anything you left out is gone, including whatever your backup appliance or older switch needs. Prefixing with `-` removes specific algorithms from the default and `+` appends, which is usually what you actually want. Check what your build supports with `ssh -Q cipher` and `ssh -Q kex` before you paste a list from anywhere.

**Fail2ban reading a log file that no longer exists.** Several distributions have stopped installing rsyslog by default, so there is no `/var/log/auth.log` and the sshd jail silently catches nothing. Set the jail to the systemd backend so it reads the journal, then confirm with `fail2ban-client status sshd`.

**Banning yourself.** Fat-finger a passphrase from the office a few times and your own address is in the ban list. Put your management network in `ignoreip`, and know that `fail2ban-client set sshd unbanip 10.0.10.22` exists before you need it from a phone.

**Disabling password auth on a machine with no other way in.** If the key is wrong and the console is a data centre two hours away, this is your whole evening. Confirm key login works, confirm a second administrator's key works, and only then set `PasswordAuthentication no`.

## References

- https://man7.org/linux/man-pages/man5/sshd_config.5.html
- https://man7.org/linux/man-pages/man8/sshd.8.html
- https://www.rfc-editor.org/rfc/rfc4252
- https://www.rfc-editor.org/rfc/rfc4253
- https://www.rfc-editor.org/rfc/rfc8709
- https://wiki.archlinux.org/title/OpenSSH
