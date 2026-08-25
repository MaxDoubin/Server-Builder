
## Get the threat model right first

LUKS protects data on a powered-off device, or on a device that has been
removed from a running system without its key. That is the whole scope.

It defends against a stolen drive, a drive returned under warranty with your
data still on it, a decommissioned server sold with the platters intact, and a
laptop left in a car. Those are real and common, and they are the reason to
turn it on.

It does not defend against anything that happens on a booted machine. Once the
volume is unlocked, the master key is in kernel memory and every read and
write is transparently decrypted. An attacker with a shell on a running host
sees plaintext files. Ransomware on a running host encrypts your already
encrypted disk quite happily. Full disk encryption and access control solve
different problems, and treating one as coverage for the other is the mistake
worth avoiding.

## How LUKS is put together

The clever part of LUKS is indirection. The data on the disk is encrypted with
a randomly generated master key, and the master key never leaves the header.
Your passphrase does not encrypt the data. It unlocks a keyslot that contains
a wrapped copy of the master key.

That indirection is why you can have several passphrases for one volume, add a
new one without rewriting a single sector, and remove a compromised one
instantly. It is also why the header is precious: destroy it and the master
key is gone, and the data is unrecoverable no matter how good your passphrase
was.

LUKS2 stores that header in JSON with a binary keyslot area, supports Argon2
as the key derivation function, and keeps a secondary copy of the header for
resilience. Argon2 matters: it is memory-hard, so it resists the parallel
brute force that a plain iterated hash does not. The derivation cost is tuned
at format time based on the machine doing the formatting, which is worth
remembering if you format on a fast box and unlock on a small one.

The actual sector encryption is done by dm-crypt, a device mapper target in
the kernel. `aes-xts-plain64` is the standard choice, with a key size of 512
bits meaning two 256-bit keys because XTS uses two.

## Setting one up

```bash
# format the partition as LUKS2
cryptsetup luksFormat --type luks2 \
  --cipher aes-xts-plain64 --key-size 512 \
  --pbkdf argon2id --hash sha256 \
  /dev/sdb1

# open it, creating /dev/mapper/vault
cryptsetup open /dev/sdb1 vault

mkfs.ext4 /dev/mapper/vault
mount /dev/mapper/vault /srv/vault

# inspect what you built
cryptsetup luksDump /dev/sdb1
```

`luksDump` shows the keyslots in use, the derivation parameters, and the
cipher. Read it once on every volume you create, because it is the only way to
confirm you got what you thought you asked for.

Back up the header immediately, and store the backup somewhere that is not the
encrypted volume:

```bash
cryptsetup luksHeaderBackup /dev/sdb1 \
  --header-backup-file /secure/offline/sdb1-luks-header.img
```

Treat that file as equivalent to the disk itself. Anyone holding the header
backup plus one valid passphrase can decrypt the data, and a header backup
taken before you removed a keyslot still contains that removed keyslot.

## Unlocking a headless machine

A server in a rack has nobody to type a passphrase after a power event. There
are three honest options and each has a tradeoff worth stating plainly.

A keyfile on unencrypted storage means the machine unlocks itself, and anyone
who takes both the drive and the boot media gets everything. That is fine when
the encrypted volume is a removable data disk and the boot disk stays bolted
into the chassis, and useless when someone carries off the whole server.

Network-bound unlock has the machine fetch a key from a server on the local
network at boot. Steal the drive, take it home, and it does not unlock because
the key service is not reachable. This preserves most of the value of
encryption for the theft case, at the cost of running one more service that
must be up before your storage is.

TPM-sealed keys bind the key to the boot measurements of that specific
machine. The drive alone is useless and no network is required. The cost is
that legitimate firmware or bootloader changes alter the measurements and lock
you out, so you need a recovery passphrase and the discipline to keep it.

For a persistent mapping, `/etc/crypttab` describes it:

```
# name   source device                              key file     options
vault    UUID=6f1a4d9c-1c22-4c0b-9a1b-7c3f5b21e8aa  none         luks,discard,timeout=60
```

Use the UUID, never `/dev/sdb1`. Device names move around between boots and
the failure that causes is confusing out of proportion to how easy it is to
avoid.

## Operational details people skip

`discard` passes TRIM through to the underlying SSD. It helps the drive
maintain performance and it leaks which sectors are unused, which reveals a
rough shape of your data. On a general purpose server I take the tradeoff. On
a volume whose usage pattern is itself sensitive, I do not.

Rotate passphrases with `luksAddKey` followed by `luksKillSlot`, in that
order, verifying the new one unlocks before you kill the old one. Never run
`luksChangeKey` on a volume you cannot afford to lose access to during the
operation.

And when you decommission a drive, remember what you get for free: destroying
the header, with `cryptsetup luksErase` or by overwriting the first few
megabytes, renders the whole volume unrecoverable in seconds. That is far
faster than overwriting the entire device, and for encrypted media it is the
sanitization step that actually matters.

## References

- https://man7.org/linux/man-pages/man8/cryptsetup.8.html
- https://man7.org/linux/man-pages/man5/crypttab.5.html
- https://docs.kernel.org/admin-guide/device-mapper/dm-crypt.html
- https://en.wikipedia.org/wiki/Linux_Unified_Key_Setup
- https://csrc.nist.gov/publications/detail/sp/800-111/final
