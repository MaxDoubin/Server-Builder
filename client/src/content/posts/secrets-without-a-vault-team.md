
## The failure mode

Every homelab and every small team arrives at the same place. A credential is
needed by a script. The script gets committed. The credential goes with it,
either directly or in a config file somebody forgot was tracked. Later the
repository gets pushed somewhere, or shared with a classmate, and the secret
is out.

The second failure mode is subtler and more common: the secret is not in git,
it is in a world readable file in a home directory, or in a shell profile, or
in an environment variable visible in the process list of anything that runs
as that user. It never leaks publicly, but any compromise of any process on
that host inherits every credential the user has.

You do not need an enterprise secrets platform to fix both of those. You need
a threat model and three habits.

## Threat model first

Write down what you are defending against, because the answer changes the
tooling. For a lab I care about, in order:

1. **Accidental disclosure.** Committing to git, pasting into a chat, copying
   a config to a shared machine. Most likely, and cheapest to prevent.
2. **Lateral movement after a single host compromise.** One machine falls
   over, and the attacker collects credentials that reach everything else.
3. **Physical access to a powered-off machine.** Disk encryption's problem,
   worth stating so you know it is handled elsewhere.

What I am explicitly not defending against at home is an attacker with root
on a running host reading a secret out of a live process's memory. That is a
real risk, and mitigating it requires hardware backed key storage and a
threat model that justifies the effort.

## Three tiers that fit a small setup

**Tier 1: encrypted files in git.** For configuration that has to be version
controlled alongside code. Encrypt the values, commit the ciphertext, keep
the decryption key out of the repository.

**Tier 2: files on disk with strict permissions, delivered to services by the
init system.** For runtime credentials on a host.

**Tier 3: short lived tokens issued on demand.** The best option, and only
worth building when you have something to issue against, such as an internal
certificate authority or an identity provider. If you can use certificates
with a short lifetime instead of a long lived static secret, do it and skip
the other two.

## Encrypting files you keep in git

The pattern I use is a file encryptor driven by a modern asymmetric key. Keys
live on the machines that need them, never in the repository.

```bash
# Generate a key for this host, protect it
age-keygen -o /etc/lab/age.key
chmod 600 /etc/lab/age.key
grep 'public key' /etc/lab/age.key       # the recipient string

# Encrypt only the values, keeping keys readable in the diff
export SOPS_AGE_KEY_FILE=/etc/lab/age.key
sops --encrypt --age age1exampleexamplerecipient... \
     --encrypted-regex '^(password|token|key|secret)$' \
     secrets.yaml > secrets.enc.yaml

git add secrets.enc.yaml
sops --decrypt secrets.enc.yaml | head
```

Two details make this pleasant to live with. Encrypting only the values means
a diff still shows which key changed, so code review works. And listing
several recipients means several machines or people can decrypt without
sharing one key, which is what you want when you rotate a machine out.

Back the private keys up somewhere offline. An encrypted repository whose
only key was on the dead disk is an elaborate way to delete your
configuration.

Add a guard so plaintext cannot be committed by accident:

```bash
# .gitignore
secrets.yaml
*.plain.yaml
.env

# A pre-commit hook that refuses obvious plaintext
grep -rInE '(BEGIN (RSA|OPENSSH) PRIVATE KEY|aws_secret_access_key)' \
  --exclude-dir=.git . && { echo "possible secret in tree"; exit 1; }
```

## Getting secrets into a service without environment variables

Environment variables are the default and they are leaky. They are inherited
by child processes, they show up in crash dumps and error trackers, and on
some systems they are readable from the process table.

systemd has a better mechanism. Credentials are passed to a unit through a
directory that only that service can read, and the path is handed to the
process in an environment variable rather than the value itself:

```ini
[Unit]
Description=Lab API worker

[Service]
ExecStart=/usr/local/bin/worker
LoadCredential=api_token:/etc/lab/creds/api_token
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
```

The service reads `$CREDENTIALS_DIRECTORY/api_token`. The file is not
readable by other users, it is not in the process environment, and it does
not persist in a place a backup will sweep up. The hardening directives below
it cost nothing and shrink what a compromised worker can reach.

## Rotation is the part everyone skips

A secret with no expiry is a secret forever. The practical minimum:

- Keep an inventory. A simple table of every credential, what it is for,
  where it lives, and when it was last changed. If you cannot list them, you
  cannot rotate them.
- Rotate on staff change, on suspicion, and on a schedule. For a lab,
  annually for low risk items and immediately for anything that was ever
  handled carelessly is a reasonable policy, and a written policy beats a
  perfect one you invented after the incident.
- Make rotation cheap. If changing a database password requires editing four
  files on three hosts by hand, it will not happen. Wiring it through one
  encrypted config and one restart is what makes the habit survive.
- Prefer credentials that expire on their own. Certificates and short lived
  tokens rotate whether or not you remember, which is their real advantage
  over a strong static password.

Scope matters as much as rotation. One credential per service, per
environment, with the narrowest permissions that work. It is more objects to
manage and it means a leak is a contained incident rather than a full rebuild.

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [NIST SP 800-57 Part 1 Rev. 5: Key Management](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- [systemd.exec(5) credentials and sandboxing](https://man.archlinux.org/man/systemd.exec.5)
- [Key management](https://en.wikipedia.org/wiki/Key_management)
