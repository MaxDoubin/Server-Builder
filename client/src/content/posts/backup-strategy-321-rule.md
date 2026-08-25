
## The rule

You have data you cannot lose, you have a RAID array, and somewhere in the back of your head you know that is not actually a backup. You are right. The question is what a real backup looks like when you are running it yourself, on your own hardware, with no budget for a vendor to hold your hand.

The 3-2-1 rule is simple: keep at least 3 copies of your data, on at least 2 different types of media, with at least 1 copy offsite. It has been the gold standard for backup strategy for decades, and it works. The phrasing comes from photographer Peter Krogh, who wrote it down for digital asset management in the mid 2000s, and it has survived because the arithmetic behind it does not care what decade you are in.

In practice, this means your data exists on your primary storage, a local backup, and a remote backup. If any single thing fails (a drive, a server, a fire), you still have copies.

## Why three copies and not two

Each number in the rule kills a specific class of failure, and it helps to name them.

**Three copies** protects against independent failure. Two copies sounds like enough until you realise that the moment one fails you are running with no redundancy at all, and you have to rebuild while exposed. Three copies means a single loss is annoying, not an emergency.

**Two media types** protects against correlated failure. Eight drives from the same production batch, in the same chassis, on the same power supply, at the same temperature, are not eight independent things. They fail in the same way at around the same time. Different media, different controller, different chassis, and ideally a different vendor breaks that correlation.

**One offsite** protects against site loss. Fire, flood, theft, a burst pipe over the rack, a power event that takes out everything plugged into the same circuit. No amount of on-premises redundancy survives the building.

A modern extension you will see written as 3-2-1-1-0 adds one copy that is offline or immutable, and zero errors on verification. Both additions exist because of ransomware and silent corruption respectively, and both are worth adopting.

## My implementation

**Copy 1: Primary storage.** My data lives on ZFS pools across my Dell servers. ZFS provides checksumming and RAIDZ2 redundancy, so it handles drive failures gracefully. But RAID is not a backup. If I accidentally delete a file, RAID will happily delete it from every drive.

**Copy 2: Local backup.** I use Proxmox Backup Server to take daily backups of all VMs and LXC containers. These backups are stored on a separate server with its own ZFS pool. The backups are deduplicated and compressed, so storage efficiency is excellent.

**Copy 3: Offsite backup.** Critical data is replicated to an offsite location using ZFS send/receive over an encrypted SSH tunnel. This handles the scenario where my entire lab is physically destroyed (fire, theft, natural disaster).

## How the local backups actually work

Proxmox Backup Server is a chunk store. It splits data into content addressed chunks, hashes each one, and only stores a chunk it has not seen before. Virtual machine disk images are split at a fixed chunk size of 4 MiB, and file level archives use variable sized chunks so that inserting a byte near the front of a file does not shift every chunk boundary after it.

The practical consequence is that a "full" backup every night is not a full backup on disk. If a 200 GB VM changes 3 GB of blocks in a day, the second night writes roughly 3 GB of new chunks and references the rest. That is why daily retention for a month is affordable on hardware a student can actually own.

Two details catch people out. The PBS web interface and API listen on TCP 8007, not 8006 like Proxmox VE. And pruning a backup does not free space by itself: prune removes the snapshot's index, and a separate garbage collection pass is what deletes chunks that no index references any more. If you never schedule garbage collection, your datastore grows forever and your prune policy is decorative.

## A worked example: the offsite leg

The offsite copy is a ZFS incremental replication over SSH. First take the snapshot, recursively so child datasets are captured at the same point:

```bash
zfs snapshot -r tank/vm@2026-08-25
```

The very first run has to send everything:

```bash
zfs send -R tank/vm@2026-08-25 \
  | ssh backup@offsite.example.net "zfs receive -F backup/vm"
```

Every run after that sends only the difference between two snapshots. The uppercase `-I` includes every intermediate snapshot, so the far side ends up with the same snapshot history as the source, not just the endpoints:

```bash
zfs send -RI tank/vm@2026-08-24 tank/vm@2026-08-25 \
  | ssh backup@offsite.example.net "zfs receive -F backup/vm"
```

Add `-v` to the send and it prints a size estimate and a progress line to stderr before it starts pushing bytes. What correct looks like is a send that estimates a plausible delta, transfers, and exits 0 with no output from `zfs receive`. Silence from receive is success.

Then verify on the far side rather than trusting the exit code alone:

```bash
ssh backup@offsite.example.net "zfs list -t snapshot -o name,used,refer backup/vm"
```

```
NAME                       USED  REFER
backup/vm@2026-08-23      1.42G   612G
backup/vm@2026-08-24      1.08G   613G
backup/vm@2026-08-25       856M   613G
```

The snapshot you just sent is present, and `USED` on the older snapshots is the amount of data unique to each one. If today's snapshot is missing, the pipeline failed somewhere even if your script reported success, which is exactly why the check is a separate command.

For anything with encrypted datasets, `zfs send -w` sends the raw encrypted blocks so the offsite machine never needs the key. That is the right default for a location you do not physically control.

## Testing backups

A backup you have never tested is not a backup. I schedule quarterly restore tests where I pick a random VM backup and restore it to a test environment. If the restore works and the VM boots cleanly, the backup is valid. If it does not, I fix the backup process immediately.

The mechanical version of that test is short. Point the client at the datastore, list what is there, and pull one archive back to scratch space:

```bash
export PBS_REPOSITORY='backup@pbs@10.0.20.5:8007:main'
proxmox-backup-client snapshot list
proxmox-backup-client restore vm/101/2026-08-24T02:15:00Z \
  drive-scsi0.img.fidx /mnt/restore/disk.raw
```

Correct output from `snapshot list` is a table of backup IDs with their timestamps, sizes, and the archive names inside each one. Correct output from the restore is a progress readout that finishes without a checksum error and leaves a file whose size matches the original disk. Then boot it. A restored image that will not boot is a failed test, not a partial success.

Write down two numbers before you design any of this: your recovery point objective, which is how much data you are willing to lose, and your recovery time objective, which is how long you can be down. Daily backups mean an RPO of up to 24 hours. If that is unacceptable for a particular dataset, that dataset needs replication or hourly snapshots, and no amount of nightly job tuning fixes it.

## Retention

I keep daily backups for 30 days, weekly backups for 12 weeks, and monthly backups for 12 months. This gives me flexibility to recover from problems that are discovered long after they occurred. A ransomware infection that encrypted files two weeks ago would need a backup from before the infection.

That pattern is the classic grandfather-father-son rotation. The reason it beats "keep everything for 90 days" is that the failures you discover late are usually slow ones: a corrupted database that has been quietly writing bad rows, a sync job that has been deleting the wrong directory, an intrusion that predates anything you noticed. Long tail retention costs almost nothing on a deduplicating store and buys you months of hindsight.

## Automation

All of this is automated. Backups run on schedules, retention policies are enforced automatically, and I get email alerts if a backup fails. The only manual part is the quarterly restore test, and even that could be automated if I wanted to invest the time.

The alerting detail that matters: alert on the age of the last successful backup, not only on job failure. A job that fails sends you an email. A job that stopped being scheduled at all sends you nothing, forever, and that is the silence you need to notice.

## What breaks

**The offsite copy is reachable and writable from the machine being backed up.** If your primary server can mount, delete, or overwrite the backup target, then anything running as root on the primary can too, including ransomware. Make the backup side pull rather than push where you can, and where you must push, lock the SSH key down with a forced command in `authorized_keys` so that key can only run the receive, not an arbitrary shell.

**Snapshots get counted as one of the three copies.** A ZFS snapshot is not a copy. It lives in the same pool, shares the same blocks, and dies with the pool. Snapshots are superb for undoing mistakes in seconds and useless against controller failure, a bad flash, or a dropped chassis. Count them as a convenience layer on copy 1, never as copy 2.

**Prune runs, garbage collection does not, and the datastore fills up.** The symptom is confusing: your retention policy looks correct in the UI, the old snapshots are gone from the list, and the disk keeps growing until backups start failing for lack of space. Schedule garbage collection as its own recurring job and check that it reports removed chunks.

**Backups are crash consistent when the workload needed application consistency.** Snapshotting a running VM captures its disk the way a power cut would. Filesystems survive that; a database mid transaction often does not restore cleanly. Install the QEMU guest agent so the hypervisor can freeze the filesystem before the snapshot, and for databases, take a real dump on a schedule and back up the dump file too.

**The encryption key or the restore credentials live only on the machine that died.** This is the failure that turns a good backup into a museum piece. If the PBS encryption key exists only on the host you are trying to rebuild, every chunk on the backup server is unreadable noise. Keep the key material somewhere separate from the systems it protects, print it if you have to, and include "find the key" as a step in the restore test so you notice when you cannot.

**Everything is on one power circuit and one uplink.** Two servers in the same rack, on the same UPS, behind the same switch, are two copies with a lot of shared fate. When you audit the design, ask what single component is upstream of more than one copy, and move something.

## References

- https://pbs.proxmox.com/docs/index.html
- https://openzfs.github.io/openzfs-docs/man/master/8/zfs-send.8.html
- https://openzfs.github.io/openzfs-docs/man/master/8/zfs-snapshot.8.html
- https://man7.org/linux/man-pages/man1/rsync.1.html
- https://en.wikipedia.org/wiki/Backup_rotation_scheme
- https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final
