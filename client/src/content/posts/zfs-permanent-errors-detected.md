## The short answer

`zpool status -v` prints "errors: Permanent errors have been detected in the following files" under message ID [ZFS-8000-8A](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A/index.html) when a block failed its checksum and ZFS had no good copy left to repair it from. Programs that touch that block "will get an error (EIO)". Current OpenZFS tells the administrator to ["Restore the file in question if possible. Otherwise restore the entire pool from backup."](https://raw.githubusercontent.com/openzfs/zfs/master/cmd/zpool/zpool_main.c)

The order that works: save the listing, find the cause (cable, controller, drive or memory), restore or delete each listed file, deal with any snapshot that still shares the bad block, run `zpool scrub` to the end, confirm "No known data errors", then run `zpool clear`. `zpool clear` resets the device counters. It is the scrub that refreshes the list. Since OpenZFS 2.2.0, [`zpool scrub -e`](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.2.0/man/man8/zpool-scrub.8) re-checks only the files already listed. An entry such as `<0x36>:<0x1c4>` means ZFS could not turn two object numbers into a path, and `<metadata>:<0x2a>` means pool-wide metadata, which no file restore fixes.

Everything below is checked against the OpenZFS documentation, man pages and source. It is a reference, not a war story.

## What does "Permanent errors have been detected" mean?

ZFS stores each block's checksum in the block that points to it. On a read it compares the two, and on a mismatch it tries whatever redundancy it has: the other side of a mirror, RAID-Z parity, or an extra copy. "Permanent" means none of that produced a block that matched. OpenZFS files this as [ZFS-8000-8A](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A/index.html), type Error, severity Critical, described as "A file or directory could not be read due to corrupt data." There is no automated response. The page says "the data cannot be repaired" and that "data may be permanently lost."

This is what a current build prints. The status and action text come from [`zpool_main.c`](https://raw.githubusercontent.com/openzfs/zfs/master/cmd/zpool/zpool_main.c), and the pool layout copies the example on the message page: a two-disk stripe where one disk and the pool line both show 2 in the CKSUM (checksum error) column. The pool, disk and file names are placeholders.

```text
  pool: tank
 state: ONLINE
status: One or more devices has experienced an error resulting in data
	corruption.  Applications may be affected.
action: Restore the file in question if possible.  Otherwise restore the
	entire pool from backup.
   see: https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A
config:

	NAME        STATE     READ WRITE CKSUM
	tank        ONLINE       0     0     2
	  sda       ONLINE       0     0     2
	  sdb       ONLINE       0     0     0

errors: Permanent errors have been detected in the following files:

        /tank/media/2019/trip.mkv
```

The message page still shows an older example whose action line reads "Destroy the pool and restore from backup." The newer text is narrower, and it is the right reading: one damaged file is not a reason to destroy a pool. Without `-v`, the page's example shows only a count, `errors: 1 data errors, use '-v' for a list`.

The same message covers different situations. Oracle's ZFS guide says data corruption "can occur if a pool isn't redundant, if corruption occurred while a pool was degraded, or an unlikely series of events conspired to corrupt multiple copies of a piece of data." Its mirror example: [one half of a mirror "can experience thousands of device errors without ever causing data corruption"](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-zfs-data.html), but an error "on the other side of the mirror in the exact same location" does. The degraded case is the one [RAID rebuild risk math](/blog/raid-rebuild-risk-math) works through: a disk is missing, and a bad sector on a surviving disk has nothing left to heal it.

A pool built on a hardware RAID volume belongs on the list too. OpenZFS says [hardware RAID "will limit opportunities for ZFS to perform self healing on checksum failures"](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html), because the controller hides the redundancy "unless a duplicate copy is stored by ZFS." [HBA mode on a PERC](/blog/perc-h730-hba-mode) gives ZFS the individual disks.

Where the counters land is its own clue. The OpenZFS troubleshooting page says a block ZFS "could not reconstruct" cannot be pinned on one disk, so the [checksum error is reported against every disk holding that block](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html): "A row of disks all showing CKSUM errors is therefore usually one unrecoverable block, not simultaneous failure of the whole row."

### Why does ZFS usually name a file and not metadata?

Because user data gets the fewest copies. These are the defaults, on top of whatever the mirror or RAID-Z layout already provides.

| Block type | Copies written | Where it comes from |
|---|---|---|
| User data | 1 | [`copies` defaults to 1](https://raw.githubusercontent.com/openzfs/zfs/master/module/zcommon/zfs_prop.c) |
| Dataset metadata | 2 | [`redundant_metadata` defaults to `all`](https://openzfs.github.io/openzfs-docs/man/master/7/zfsprops.7.html), where "ZFS stores an extra copy of all metadata" |
| Pool-wide metadata | 3 | A [2010 University of Wisconsin study of ZFS](https://www.usenix.org/legacy/event/fast10/tech/full_papers/zhang.pdf) describes one block address for user data, two for file system metadata and three for pool-wide metadata |

The man page says these copies "are in addition to any redundancy provided by the pool, for example, mirroring or RAID-Z." Its own example is a mirrored pool with `copies=2` and `redundant_metadata=most`, which stores 6 copies of most metadata and 4 copies of data.

So one bad block usually costs one file, and a metadata entry is the unusual case. Lowering `redundant_metadata` trades that away. Per the man page, with `most`, "about 1000 blocks" of user data can be lost to a single corrupt block. With `some` it is "multiple user files or directories," and with `none`, "an entire dataset."

## Which ZFS-8000 message ID is the pool showing?

`zpool status` shows one ID per pool: the first condition that matches in [`libzfs_status.c`](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_status.c). A pool with data errors can therefore also hold a failed disk that the banner never mentions.

| ID | Title | Severity | What ZFS does | What the page asks |
|---|---|---|---|---|
| [8A](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A/index.html) | Corrupted data | Critical | Nothing | Restore the file, or the pool |
| [9P](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-9P/index.html) | Failing device in replicated configuration | Minor | "ZFS has attempted to repair the affected data" | Decide whether to replace the device; if not, `zpool clear` |
| [2Q](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-2Q/index.html) | Missing device in replicated configuration | Major | Activates a hot spare if available | Attach the device and `zpool online` |
| [4J](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-4J/index.html) | Corrupted device label in a replicated configuration | Major | Activates a hot spare if available | `zpool replace` |
| [72](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-72/index.html) | Corrupted pool metadata | Critical | Nothing | If offered, `zpool clear -F` with some data loss; otherwise destroy and restore |
| [3C](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-3C/index.html) | Missing device in non-replicated configuration | Critical | Nothing | Attach the device and `zpool online` |
| [5E](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-5E/index.html) | Corrupted device label in non-replicated configuration | Critical | Nothing | Destroy and re-create the pool from backup |
| [HC](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-HC/index.html), [JQ](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-JQ/index.html) | ZFS pool I/O failures | Major | Nothing. `failmode=wait` blocks all I/O, `continue` blocks writes | Reconnect the devices, then `zpool clear` |

Among these, the check order in the source is: a suspended pool (HC, JQ), then bad devices in a pool with no replicas (3C, 5E), then corrupted pool metadata (72), then persistent data errors (8A). Only after those come missing devices in a replicated pool (2Q, 4J) and devices with error counts (9P). A mirror with one dead disk and one damaged file therefore reports 8A, and the dead disk shows only in the config table. Read the whole tree, not just the ID.

9P is the mild sibling. A redundant pool met a bad read and repaired it, and the status ends with `errors: No known data errors`. The page lists causes that need no replacement: a network device that lost connectivity, a bit flip ("an expected event over long periods of time"), or an administrator who wrote over part of a disk. 8A is what happens when the pool runs out of good copies.

## Why does the list show hex numbers instead of a file name?

The listing is built from two numbers, a dataset object and an object inside it, and ZFS prints whatever it managed to resolve. The code in [`libzfs_pool.c`](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_pool.c) produces these forms.

| Printed | What resolved | What it means |
|---|---|---|
| `/tank/media/2019/trip.mkv` | Dataset, mount point and path | A file in a mounted dataset |
| `tank/media:/2019/trip.mkv` | Dataset and path, not mounted | The same, with no mount point to put in front |
| `tank/media@auto-2026-10-01:/2019/trip.mkv` | A snapshot name and a path | A snapshot still references the bad block |
| `tank/media:<0x1c4>` | Dataset only | The object has no path: deleted, or not a file |
| `<0x36>:<0x1c4>` | Neither | ZFS could not find a dataset for that number, for example because it was destroyed |
| `<metadata>:<0x2a>` | Dataset object 0 | An object in the pool-wide metadata set |

Oracle's guide describes the [same idea](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-file-or-directory.html): when the path cannot be translated, "the dataset name followed by the object's number is displayed," and a `<metadata>` tag marks the pool-wide set. The OpenZFS troubleshooting page says a hex number means "the file has already been deleted, or the dataset is not mounted." One more case from the source: the path lookup refuses anything that is not a file system, so damage inside a zvol (a ZFS block device, such as a VM disk) can only print as `dataset:<0x...>`.

### How do you decode a hex entry?

Convert both numbers to decimal, find the dataset, then ask for the object. The [base converter](/tools/base-converter) does the first step. `zdb` is the read-only ZFS debugger.

```bash
printf '%d\n' 0x36 0x1c4           # 54 and 452
zdb -d tank | grep 'ID 54,'        # which dataset has object number 54
zdb -ddddd tank/media 452          # the object, with a path line if one exists
```

The ID in [`zdb -d`](https://openzfs.github.io/openzfs-docs/man/master/8/zdb.8.html) output is the dataset object number, and the man page's example shows the pool-wide set as `Dataset mos [META], ID 0`. If no dataset has that ID, it is gone. The [zdb source](https://raw.githubusercontent.com/openzfs/zfs/master/cmd/zdb/zdb.c) prints the path line only with five or more `d` flags, and for an object it cannot resolve it prints "on delete queue" or "path not found, possibly leaked". `zdb` reads the disks directly, so on a busy imported pool its output can be slightly stale or fail. Run it again if that happens.

Encryption hides names too. The [scrub man page](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-scrub.8.html) says that if keys are not loaded and an unrepairable error is found, "the file name cannot be included" in the report. The [`head_errlog` feature notes](https://openzfs.github.io/openzfs-docs/man/master/7/zpool-features.7.html) add that snapshots and clones of such file systems cannot be checked for errors. Load the key and scrub again.

## How do you clear the error?

Do the steps in this order. The order is what makes the list shrink.

1. **Save the evidence.** The listing changes as errors are fixed, so keep a copy.

   ```bash
   zpool status -v tank > ~/tank-errors-$(date +%F).txt
   zpool events -v tank > ~/tank-events-$(date +%F).txt
   ```

2. **Find the cause before writing anything new.** OpenZFS says to ["fix the cause first, then clear, then watch whether the counters come back"](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html). The next section covers how. If a disk is failing, replace it and let the resilver (the rebuild onto the new disk) finish first. The [scrub man page](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-scrub.8.html) says ZFS allows only one scrub or resilver at a time.

3. **Restore or delete each listed file.** Oracle's guide says that if the damage is within a file data block, ["the file can be safely removed, thereby clearing the error from the system"](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-file-or-directory.html).

   **Warning: `rm` is permanent.** The damaged file may still be mostly readable, and it may be the only copy. Read the backup copy all the way through first (for example with `sha256sum`), and only then delete.

   ```bash
   sha256sum /mnt/backup/media/2019/trip.mkv      # prove the backup reads end to end
   rm /tank/media/2019/trip.mkv
   cp -a /mnt/backup/media/2019/trip.mkv /tank/media/2019/trip.mkv
   ```

   Do not rely on rsync to fix the file in place. rsync's default ["quick check"](https://download.samba.org/pub/rsync/rsync.1) compares size and modification time, so it can decide there is nothing to transfer. If the damage is in a directory or a file's metadata, the same Oracle guide says "the only choice is to move the file elsewhere," so the original can be restored in its place.

4. **Deal with snapshots.** Snapshots ["initially consume no additional space"](https://openzfs.github.io/openzfs-docs/man/master/7/zfsconcepts.7.html) because they share blocks with the live dataset. Deleting the live file does not free a block a snapshot still holds, which is why `@snapshot` entries show up in the list.

   **Warning: `zfs destroy` on a snapshot cannot be undone,** and it removes every older version of every file in that snapshot, not just the damaged one. Do a dry run first, and check that nothing else needs that snapshot (a replication job, for example).

   ```bash
   zfs list -t snapshot -r -o name,used tank/media
   zfs destroy -nv tank/media@auto-2026-10-01     # -n: dry run, nothing is deleted
   ```

   The man page calls `-n` a [dry run where "No data will be deleted"](https://openzfs.github.io/openzfs-docs/man/master/8/zfs-destroy.8.html). Run the command again without `-n` only when the output is what you expect. A snapshot is a restore source only if it holds a different version of the block. One that shares the bad block is equally damaged, and copying the file out of `.zfs/snapshot` fails the same way. If you would rather keep the snapshot, you can: the entry simply stays in the list until the snapshot ages out.

5. **Scrub to completion.**

   ```bash
   zpool scrub -w tank       # -w waits until the scrub finishes
   zpool status -v tank
   ```

   From OpenZFS 2.2.0, [`zpool scrub -e`](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-scrub.8.html) scrubs only "files with known data errors," which is normally much quicker than a full pass. The pool "must have been scrubbed at least once with the `head_errlog` feature enabled," and an error scrub cannot run alongside another scrub or a resilver.

6. **Confirm, then clear.** The goal is `errors: No known data errors`. Then reset the counters and keep watching.

   ```bash
   zpool clear tank
   zpool status tank
   ```

   Oracle's guide notes this can take more than one round: "If the first scrub and clear iteration does not resolve the corrupted files, run them again."

Each command touches a different thing, which is where most of the confusion comes from.

| Command | Effect on the permanent error list |
|---|---|
| `zpool clear tank` | Not what it is for. The man page says it ["Clears device errors in a pool"](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-clear.8.html), meaning the counters |
| `zpool scrub tank` | When it finishes, the list becomes what the scrub found |
| `zpool scrub -e tank` | The same, over the listed files only |
| Delete the file | With `head_errlog` enabled, the [status man page](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-status.8.html) says removed files "will not be reported in subsequent runs"; otherwise the entry waits for a scrub |
| `zfs destroy tank/media@snap` | Lets go of a block that only the snapshot still held |

The `zpool clear` row matches the code. In the [ioctl source](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/zfs_ioctl.c), the only error log call is the one that reads the log for `zpool status`. The rotation is requested in [`dsl_scan.c`](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/dsl_scan.c) when a scrub or an error scrub ends, and [`spa_errlog.c`](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/spa_errlog.c) then replaces the old list with the errors the scrub recorded.

## Was it the drive, the cable, the controller or memory?

Start with the pattern, because the counters already carry most of the answer. The troubleshooting page defines READ and WRITE as "I/O errors reported by the device itself" and CKSUM as data that "failed its checksum." It says a non-zero CKSUM on a disk that reports no I/O errors ["more often indicates cabling, an HBA, or memory than the disk"](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html). (An HBA, or host bus adapter, is the card the disks plug into.) The [Scrub and Resilver page](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Scrub%20and%20Resilver.html) gives the same advice.

The table below is a starting order for suspects. The first and third rows come straight from those pages. The rest is ordinary fault isolation: whatever the affected disks have in common is the first thing to check.

| Pattern | First suspect | Next check |
|---|---|---|
| READ or WRITE errors on one disk | The drive or its link | Kernel log, then `smartctl -x` |
| Checksum errors on one disk only, back after `zpool clear` | That disk's cable, slot, or the disk | Link error counters, then swap the cable or slot |
| Checksum errors on every disk in a group at once | Often one unrecoverable block, not many bad disks | Timestamps in `zpool events -v` |
| Checksum errors only on disks behind one controller | The controller, its cable or power | Move one thing at a time |
| Checksum errors scattered everywhere, crashes, memory error counts rising | Memory | Error counters, then a memory test |
| One checksum error, clean drive data, nothing else | A one-off | Clear and watch |

Commands for each row:

```bash
zpool status -es tank                    # unhealthy devices only, with slow-I/O counts
zpool events -v tank | less              # one entry per error, with the block and device
dmesg -T | grep -i -E 'zfs|ata[0-9]|mpt3sas|i/o error'
smartctl -x /dev/sda                     # all drive health data, including error logs
smartctl -l sataphy /dev/sda             # SATA link event counters
smartctl -l sasphy /dev/sdb              # SAS link error log
grep . /sys/devices/system/edac/mc/mc*/dimm*/dimm_[cu]e_count
```

The `zpool status -es` and `dmesg -T | grep -i zfs` lines come from the [OpenZFS troubleshooting page](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html); the extra `grep` patterns are additions that assume SATA disks or an LSI-style SAS card. The [smartctl manual](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html) decodes drive error log entries: `UNC` is an uncorrectable error in data, and `ICRC` is an interface CRC error, meaning the data was damaged on the link. A drive that logs `ICRC` is often pointing at its cable or connector. [SMART data](/blog/smart-data-drive-failure) explains the rest.

Each checksum event in `zpool events -v` records where the damage was. The [events man page](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-events.8.html) lists `vdev_path` (which device), `zio_objset`, `zio_object`, `zio_level`, `zio_blkid` and `zio_offset`, and `bad_range_sets` and `bad_range_clears` count how many bits were wrongly set or cleared. A few flipped bits and a whole block of garbage look different there. The man page does not say what each pattern implies, so treat it as a clue only.

The last command reads EDAC, the Linux kernel's memory error reporting, and it only shows anything on a machine with ECC (error-correcting) memory. The kernel's [RAS documentation](https://docs.kernel.org/admin-guide/RAS/main.html) says `dimm_ce_count` "is very important to examine" because corrected errors "provide early indications that a DIMM is beginning to fail." Without ECC there is no such counter, and the OpenZFS hardware page is blunt: ["No technique used in ZFS (or any other filesystem) is capable of protecting against bit flips."](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html) Bad memory can also do quiet damage that never reaches this list. If data is corrupted in RAM before ZFS computes the checksum, the checksum matches the bad data and every later read passes. So a clean `zpool status` does not prove the memory is good. Run several passes of a stand-alone tester such as [Memtest86+](https://www.memtest.org/). [ECC memory](/blog/ecc-ram-explained) covers how corrected errors are counted.

## Why did the error stay after a scrub?

**The scrub did not finish.** The man page says `zpool status -v` lists files with errors ["since the last complete pool scrub"](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-status.8.html). Check the `scan:` line, and let a paused or interrupted scrub run to the end before judging the list.

**The block is still referenced.** A live file that was never rewritten, a snapshot or a clone still holds it. The `@snapshot` entries in the listing name them.

**The data really is damaged.** A scrub that reads the block again and still fails keeps the entry, correctly. That file needs a restore.

**Only `zpool clear` was run.** It resets counters. OpenZFS says: ["Entries persist until a scrub confirms they are gone, so run a scrub after restoring."](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html)

**The key is not loaded.** On an encrypted dataset the scrub cannot attach a name or check snapshots, as described above.

**The cause is still there.** A marginal cable produces new errors during the scrub and refills the list. Fix the path, then scrub again.

**The pool predates 2.2.0 features.** `head_errlog` is in the [2.2.0 feature list](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.2.0/man/man7/zpool-features.7) and absent from the [2.1.15 list](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.1.15/man/man7/zpool-features.7), and the 2.1.15 scrub man page has no `-e`. Without the feature, only a full scrub refreshes the list. Check with `zpool get feature@head_errlog tank`.

A `<metadata>` entry that survives a clean scrub is not stale. The 8A page says corruption in pool-wide metadata can leave "entire datasets" unavailable, and that "the only option is to destroy the pool and re-create the datasets from backup." A backup that has never been read back is a guess, which is the argument of [restore drills that matter](/blog/restore-drills-that-matter), and [the 3-2-1 rule](/blog/backup-strategy-321-rule) covers where the second copy should sit.

## What breaks

**`cp` or rsync fails with "Input/output error" on a listed file.** ZFS returns EIO for a block it cannot verify, as the 8A page says. Fix: restore that file from backup, following step 3.

**rsync from the backup reports nothing to transfer.** The quick check sees matching size and time. Fix: delete the damaged file, then copy, as in step 3.

**A replication job fails on a snapshot.** `zfs send` has to read every block, so it hits the same error, and the [send code](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_sendrecv.c) prints `warning: cannot send` with the dataset name. Fix: restore the file, then send a snapshot taken after the repair. Destroy the snapshots that hold the bad block only after confirming the other side has good data.

**Upgrading the pool to get `scrub -e` locks out older systems.** The feature page marks `head_errlog` as not read-only compatible, and once enabled it stays active for good. A host running 2.1 cannot import the pool afterwards. Fix: run `zpool upgrade` only when no machine that needs this pool is still on an older release.

**The listing misses some paths.** Oracle's guide says that when corrupted blocks have multiple references, such as snapshots, `zpool status -v` ["cannot display all corrupted data paths"](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-file-or-directory.html). Fix: after the scrub, compare the dataset against the backup, not only the files that were listed.

**Counters return after `zpool clear`.** The cause is still present. Fix: change one thing at a time (cable, then slot, then drive) and clear after each, so you can tell which change mattered. If a disk keeps failing, the 9P page says to replace it with `zpool replace`.

**The pool reports ZFS-8000-72, or will not open.** This is damaged pool metadata, not file damage. The page says that if a recovery action is offered, it can be tried with `zpool clear -F`.

**Warning: `zpool clear -F` throws data away.** It rolls the pool back to an earlier state and discards the most recent writes "irreversibly." The page's example loses about 59 seconds of writes. Copy the full `zpool status` output first, and run a scrub afterwards, as the page recommends. If no recovery is offered, the page says "all data within the pool is lost" and the pool has to be destroyed and restored from backup.

## Sources

- [OpenZFS: Message ID ZFS-8000-8A, Corrupted data](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-8A/index.html)
- [OpenZFS: Message ID ZFS-8000-9P, Failing device in replicated configuration](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-9P/index.html)
- [OpenZFS: Message ID ZFS-8000-2Q, Missing device in replicated configuration](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-2Q/index.html)
- [OpenZFS: Message ID ZFS-8000-4J, Corrupted device label in a replicated configuration](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-4J/index.html)
- [OpenZFS: Message ID ZFS-8000-72, Corrupted pool metadata](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-72/index.html)
- [OpenZFS: Message ID ZFS-8000-3C, Missing device in non-replicated configuration](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-3C/index.html)
- [OpenZFS: Message ID ZFS-8000-5E, Corrupted device label in non-replicated configuration](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-5E/index.html)
- [OpenZFS: Message ID ZFS-8000-HC, ZFS pool I/O failures](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-HC/index.html)
- [OpenZFS: Message ID ZFS-8000-JQ, ZFS pool I/O failures](https://openzfs.github.io/openzfs-docs/msg/ZFS-8000-JQ/index.html)
- [OpenZFS: zpool-status(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-status.8.html)
- [OpenZFS: zpool-clear(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-clear.8.html)
- [OpenZFS: zpool-scrub(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-scrub.8.html)
- [OpenZFS: zpool-scrub(8) at release 2.2.0](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.2.0/man/man8/zpool-scrub.8)
- [OpenZFS: zpool-events(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-events.8.html)
- [OpenZFS: zfsprops(7)](https://openzfs.github.io/openzfs-docs/man/master/7/zfsprops.7.html)
- [OpenZFS: zfsconcepts(7)](https://openzfs.github.io/openzfs-docs/man/master/7/zfsconcepts.7.html)
- [OpenZFS: zfs-destroy(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zfs-destroy.8.html)
- [OpenZFS: zdb(8)](https://openzfs.github.io/openzfs-docs/man/master/8/zdb.8.html)
- [OpenZFS: zpool-features(7)](https://openzfs.github.io/openzfs-docs/man/master/7/zpool-features.7.html)
- [OpenZFS: zpool-features(7) at release 2.2.0](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.2.0/man/man7/zpool-features.7)
- [OpenZFS: zpool-features(7) at release 2.1.15](https://raw.githubusercontent.com/openzfs/zfs/zfs-2.1.15/man/man7/zpool-features.7)
- [OpenZFS documentation: Troubleshooting](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Troubleshooting.html)
- [OpenZFS documentation: Scrub and Resilver](https://openzfs.github.io/openzfs-docs/Basic%20Concepts/Operations/Scrub%20and%20Resilver.html)
- [OpenZFS documentation: Hardware](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Hardware.html)
- [OpenZFS source: cmd/zpool/zpool_main.c](https://raw.githubusercontent.com/openzfs/zfs/master/cmd/zpool/zpool_main.c)
- [OpenZFS source: lib/libzfs/libzfs_status.c](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_status.c)
- [OpenZFS source: lib/libzfs/libzfs_pool.c](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_pool.c)
- [OpenZFS source: lib/libzfs/libzfs_sendrecv.c](https://raw.githubusercontent.com/openzfs/zfs/master/lib/libzfs/libzfs_sendrecv.c)
- [OpenZFS source: module/zfs/spa_errlog.c](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/spa_errlog.c)
- [OpenZFS source: module/zfs/dsl_scan.c](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/dsl_scan.c)
- [OpenZFS source: module/zfs/zfs_ioctl.c](https://raw.githubusercontent.com/openzfs/zfs/master/module/zfs/zfs_ioctl.c)
- [OpenZFS source: module/zcommon/zfs_prop.c](https://raw.githubusercontent.com/openzfs/zfs/master/module/zcommon/zfs_prop.c)
- [OpenZFS source: cmd/zdb/zdb.c](https://raw.githubusercontent.com/openzfs/zfs/master/cmd/zdb/zdb.c)
- [Oracle: Repairing a Corrupted File or Directory (Solaris 11.4)](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-file-or-directory.html)
- [Oracle: Repairing Corrupted ZFS Data (Solaris 11.4)](https://docs.oracle.com/en/operating-systems/solaris/oracle-solaris/11.4/manage-zfs/repairing-corrupted-zfs-data.html)
- [University of Wisconsin-Madison: End-to-end Data Integrity for File Systems, A ZFS Case Study (FAST 2010)](https://www.usenix.org/legacy/event/fast10/tech/full_papers/zhang.pdf)
- [Linux kernel documentation: Reliability, Availability and Serviceability (RAS)](https://docs.kernel.org/admin-guide/RAS/main.html)
- [smartmontools: smartctl(8) manual page](https://manpages.ubuntu.com/manpages/noble/man8/smartctl.8.html)
- [Memtest86+: Project home page](https://www.memtest.org/)
- [Samba: rsync(1) manual page](https://download.samba.org/pub/rsync/rsync.1)