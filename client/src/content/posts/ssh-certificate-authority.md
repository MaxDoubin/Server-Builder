
## The sprawl problem

The standard way to grant SSH access is to append a public key to
`~/.ssh/authorized_keys` on every host the person needs. It works, and it
falls apart at exactly the point you need it not to.

Access is now scattered across every machine. Nobody can answer "who can log
into this box" without reading files on the box. Nobody can answer "what can
this person reach" without reading files on every box. And revocation means
finding and removing a key everywhere it was ever copied, including the host
somebody built last month from an old image.

The other half of the problem is host identity. The first time you connect,
SSH shows a fingerprint and asks if you trust it. Almost everyone types yes
without checking, so the protection is theoretical. Rebuild the host and
everyone gets a scary warning they are trained to ignore.

OpenSSH solves both with certificates, and it has for a long time.

## How SSH certificates work

An SSH certificate is a public key plus signed metadata: a validity window, a
key ID, a list of principals, and a set of permitted extensions. It is signed
by a CA key, which is just an ordinary SSH keypair you decided to treat as
authoritative. This is not X.509 and there is no chain: one signature, one CA.

There are two independent certificate types, and using only one is a common
half-measure.

User certificates let a host verify a person without holding their key. Host
certificates let a person verify a host without trust on first use.

Create the CAs, keeping them separate so you can rotate one without the other:

```bash
ssh-keygen -t ed25519 -f /root/ca/user_ca -C "user CA" -N ""
ssh-keygen -t ed25519 -f /root/ca/host_ca -C "host CA" -N ""
```

Sign a user key. The `-n` list is principals, `-V` is validity, `-I` is the
key ID that will appear in the server's auth log:

```bash
ssh-keygen -s /root/ca/user_ca \
  -I "max@lab-2026-07-17" \
  -n admin,deploy \
  -V +8h \
  -O clear -O permit-pty -O source-address=10.20.0.0/24 \
  max_ed25519.pub
```

That writes `max_ed25519-cert.pub` next to the key. The client sends it
automatically when the cert file sits beside the private key.

Sign a host key on each server:

```bash
ssh-keygen -s /root/ca/host_ca \
  -I "web01" -h \
  -n web01.lab.internal,10.20.0.31 \
  -V +52w \
  /etc/ssh/ssh_host_ed25519_key.pub
```

## Configuring both ends

On the server, trust the user CA and present the host certificate:

```
# /etc/ssh/sshd_config
TrustedUserCAKeys /etc/ssh/user_ca.pub
HostCertificate /etc/ssh/ssh_host_ed25519_key-cert.pub
HostKey /etc/ssh/ssh_host_ed25519_key
RevokedKeys /etc/ssh/revoked_keys.krl
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
PasswordAuthentication no
```

`AuthorizedPrincipalsFile` is the piece that makes this a real authorization
model. A file at `/etc/ssh/auth_principals/root` containing `admin` means only
certificates carrying the `admin` principal may log in as root on that host.
Principals are roles, and they are decided by the CA at signing time, not by
the username the person types.

On the client, trust the host CA in `known_hosts`:

```
@cert-authority *.lab.internal ssh-ed25519 AAAAC3NzaC1lZDI1... host CA
```

Now every host signed by that CA verifies silently, forever, including hosts
that do not exist yet and hosts you rebuild.

## Short lifetimes instead of revocation

Certificates can be revoked with a key revocation list, and you should
maintain one for the emergency case. But the real answer is not revoking, it
is expiring.

Issue user certificates with a lifetime measured in hours. Someone
authenticates to the signing service in the morning, gets a certificate good
for the workday, and it stops working on its own. A stolen laptop is a
problem for the rest of the day, not forever. There is no fleet-wide cleanup
because there was never anything to clean up on the hosts.

Host certificates get long lifetimes since rotating them means touching
servers, but keep them well short of infinite so that a forgotten
decommissioned host eventually stops being able to prove it is you.

## What this buys and what it costs

You get one place that decides access, an auth log that records the key ID and
principals for every login, host verification that actually works, and
revocation that mostly happens by itself.

The cost is honest. The CA private key is now the crown jewel, and it belongs
offline or in hardware, not on the jump box. You need something to sign
certificates on demand, even if that is a small script behind an
authentication check. And you need a break-glass path, because a signing
service outage otherwise locks you out of everything at once. Keep one
emergency key in `authorized_keys` on critical hosts, in a sealed envelope
somewhere, and audit for its use.

## References

- https://man.openbsd.org/ssh-keygen
- https://man.openbsd.org/sshd_config
- https://man7.org/linux/man-pages/man1/ssh-keygen.1.html
- https://www.openssh.com/manual.html
- https://en.wikipedia.org/wiki/OpenSSH
