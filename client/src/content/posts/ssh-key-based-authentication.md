
## Why keys are better than passwords

You are typing the same password into six servers a day, or you set up a key once and it works on one host and silently falls back to a password prompt on another, and you have no idea why. Key authentication is not complicated, but it fails quietly, and quiet failures are the hard kind.

A password is a shared secret. It can be guessed, phished, or leaked. An SSH key pair is asymmetric. The private key never leaves your machine. The server only holds your public key. Even if the server is compromised, your private key is not exposed.

Keys are also more convenient at scale. You can authorize a key on hundreds of servers, and logging in to any of them requires no passwords or prompts.

The mechanism, briefly, because it explains the failure modes. Under the `publickey` method in RFC 4252, the client signs a blob that includes the session identifier negotiated during key exchange. The server verifies that signature against the public key it has on file. The signature is bound to that one session, so a server that receives it cannot turn around and use it to log in somewhere else as you. A password can be replayed by whoever catches it. A signature cannot.

## Generating a key pair

```bash
# Generate an Ed25519 key (modern, fast, secure)
ssh-keygen -t ed25519 -C "admin@workstation" -f ~/.ssh/id_ed25519

# Or RSA if you need compatibility with older systems
ssh-keygen -t rsa -b 4096 -C "admin@workstation" -f ~/.ssh/id_rsa
```

Always set a passphrase. The passphrase encrypts the private key on disk, so even if someone steals your laptop, they cannot use the key without the passphrase.

Ed25519 is EdDSA over Curve25519, standardised for SSH in RFC 8709. Its key size is fixed by the curve, so `-b` does nothing for that type; passing it is harmless but pointless. The public key is short enough to fit comfortably on one line, which matters more than it sounds like it should, for reasons in the failure section below.

Two files come out. `id_ed25519` is the private key and never leaves the machine. `id_ed25519.pub` is the public key and is safe to paste anywhere. Learn to recognise which is which at a glance, because the mistake of installing the wrong one is common and confusing.

The fingerprint is how you refer to a key without pasting it:

```bash
ssh-keygen -lf ~/.ssh/id_ed25519.pub
```

```
256 SHA256:5xB9pmBqQ0oq5Vp3z1EhZ9kK8b0Wc2y0oQnDh4Zk8pM admin@workstation (ED25519)
```

Keep that fingerprint. When a server logs `Accepted publickey for admin from 10.0.10.22 port 52118 ssh2: ED25519 SHA256:5xB9...`, that string is how you prove which key was used, which is the only way to audit key usage after the fact.

## Distributing the public key

```bash
# Copy to a server (simplest method)
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server

# Or manually append to authorized_keys
cat ~/.ssh/id_ed25519.pub | ssh user@server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

Permissions decide whether this works. sshd runs strict mode checks by default and refuses any key whose file or containing directories are writable by anyone but the owner:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519
```

The home directory itself counts too. A home directory that is group writable, which happens on systems where every user shares a primary group, causes sshd to reject the key with nothing shown to the client except a password prompt.

Each line in `authorized_keys` is one key and may carry options in front of it. This is the part most people never use and it is where the real value is:

```
from="10.0.10.0/24",restrict ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH... admin@workstation
restrict,command="/usr/local/bin/backup-receive" ssh-ed25519 AAAAC3Nz... backup@nas
```

`from=` limits which source addresses may use that key. `command=` forces one command regardless of what the client asks for, which is how you give an automated job exactly one capability. `restrict` disables port forwarding, agent forwarding, X11, and PTY allocation all at once, and you re-enable individually with options like `pty` if you need them. A deployment key with no restrictions is a full interactive shell for anyone who copies the file.

## Verifying it worked

Do not trust the absence of a password prompt. Ask the client what it did:

```bash
ssh -v admin@server exit 2>&1 | grep -E 'Offering|Server accepts|Authenticated'
```

Correct output names the key file and the method:

```
debug1: Offering public key: /home/max/.ssh/id_ed25519 ED25519 SHA256:5xB9...
debug1: Server accepts key: /home/max/.ssh/id_ed25519 ED25519 SHA256:5xB9...
Authenticated to server ([10.0.10.50]:22) using "publickey".
```

If the last line says `using "password"` or `using "keyboard-interactive"`, key authentication failed and you fell back. On the server, the reason is in the auth log or journal, and it is usually explicit: `Authentication refused: bad ownership or modes for directory /home/admin`.

## Using ssh-agent

The SSH agent stores your decrypted private key in memory so you only need to enter the passphrase once per session:

```bash
eval $(ssh-agent)
ssh-add ~/.ssh/id_ed25519
```

Check what the agent currently holds with `ssh-add -l`, which prints one line per loaded key in the same fingerprint format as before, or `The agent has no identities.` when it is empty.

Two refinements worth adopting. `ssh-add -t 3600` loads a key that the agent forgets after an hour, which limits the window in which a stolen laptop is a live credential. And `AddKeysToAgent yes` in `~/.ssh/config` loads a key on first use instead of requiring you to remember `ssh-add`, which stops the habit of running `eval $(ssh-agent)` in every terminal and accumulating a dozen orphan agents that each hold your key.

Agent forwarding deserves a warning. `ForwardAgent yes` exposes your agent socket on the remote host, and anyone with root there can use it to authenticate as you to anything your key opens, for as long as you are connected. Use `ProxyJump` instead, which tunnels through the intermediate host without ever exposing the agent to it:

```
Host prod-db
  Hostname 10.0.30.15
  User admin
  ProxyJump bastion.example.net
```

## SSH config for multiple keys and hosts

```
# ~/.ssh/config
Host prod-*
  User deploy
  IdentityFile ~/.ssh/id_ed25519_prod
  ForwardAgent no

Host lab-server
  Hostname 192.168.1.50
  User admin
  IdentityFile ~/.ssh/id_ed25519_lab
  Port 2222
```

Add `IdentitiesOnly yes` to any block with an explicit `IdentityFile`. Without it, the client offers every key in the agent before the one you named, and a server with `MaxAuthTries 3` will disconnect you before it reaches the right key. The error, "Too many authentication failures", describes the symptom and hides the cause.

Check what the client will actually do for a given host with `ssh -G lab-server`, which prints the fully merged configuration the same way `sshd -T` does on the server side. First match wins in this file, so a broad `Host *` block at the top overrides everything below it.

## Key rotation

Rotate SSH keys periodically. When an employee leaves, remove their public key from authorized_keys on every server. This is why centralized key management (via LDAP, Teleport, or HashiCorp Vault SSH) makes sense at scale. Manual key management across hundreds of servers is error-prone.

The structural fix is SSH certificates. You create a certificate authority key once, sign user public keys with a validity window, and configure servers to trust the CA instead of individual keys:

```bash
ssh-keygen -s ca_key -I max@example -n admin,deploy -V +8h ~/.ssh/id_ed25519.pub
```

That produces `id_ed25519-cert.pub`, valid for eight hours, listing the principals it may log in as. The server needs one line, `TrustedUserCAKeys /etc/ssh/ca.pub`, and no per-user key distribution at all. Revocation stops being a search across every host, because the certificate expires on its own. Inspect one with `ssh-keygen -L -f id_ed25519-cert.pub`, which prints the principals, the validity window, and the extensions.

Until you get there, keep an inventory. A key with no owner recorded is a key nobody will ever dare remove.

## What breaks

**Permissions, silently.** A group writable home directory or a `.ssh` at 755 makes sshd ignore the key and fall through to the next method. The client shows a password prompt and no explanation. The server log says exactly what is wrong, so read it there.

**Installing the private key by mistake.** Pasting `id_ed25519` instead of `id_ed25519.pub` into `authorized_keys` never works, and it has now put your private key on the server. Regenerate the pair, do not just delete the line.

**A wrapped key line.** Each entry in `authorized_keys` must be on exactly one line. Copying a public key through a chat window or a text editor with hard wrapping inserts newlines that turn one valid key into several invalid ones. Count lines with `wc -l` and compare against the number of keys you expect.

**Too many identities offered.** The agent offers keys in its own order and the server counts each as an attempt. Set `IdentitiesOnly yes` with an explicit `IdentityFile` per host.

**Removing a key from one file and calling it revoked.** People accumulate access in places you forget to check: `root`'s own `authorized_keys`, a shared service account, the legacy `authorized_keys2` file that some sshd builds still read, and a second key that person generated on their home machine. Audit by fingerprint across every account, not by name.

**Passphrase-free keys for automation with no restrictions.** A CI runner needs an unattended key, which is fine, but that key should carry `from=` and `command=` in `authorized_keys` so it can do one thing from one place. An unrestricted automation key is a root shell that nobody rotates.

## References

- https://man7.org/linux/man-pages/man1/ssh-keygen.1.html
- https://man7.org/linux/man-pages/man1/ssh-agent.1.html
- https://man7.org/linux/man-pages/man5/ssh_config.5.html
- https://man7.org/linux/man-pages/man8/sshd.8.html
- https://www.rfc-editor.org/rfc/rfc4252
- https://www.rfc-editor.org/rfc/rfc8709
