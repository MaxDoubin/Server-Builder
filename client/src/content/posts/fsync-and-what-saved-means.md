
## write() is not a promise

When a program calls `write()` and gets a success return, the data is in the
kernel's page cache. That is all that happened. The kernel will flush it to the
device at some point, on its own schedule, according to writeback tuning you
probably have not looked at.

If the machine loses power in that window, the data is gone, and the program was
told the write succeeded. This is not a bug, it is the design: buffering is what
makes filesystem performance tolerable. But it means durability is something you
have to ask for explicitly, and knowing how to ask is the difference between a
storage system you can trust and one you assume you can.

## The layers

There are more places your data can sit than people expect.

1. **Application buffer.** Language runtimes buffer. A Python file object holds
   data until you flush it. `write()` was never called.
2. **Kernel page cache.** After `write()`, before writeback.
3. **Device write cache.** Drives have volatile RAM caches and will acknowledge
   a write that is only in that cache.
4. **Controller cache.** RAID controllers add another layer, which is why
   battery or capacitor backed cache exists as a product.
5. **The actual persistent medium.**

Each layer makes things faster and adds a place to lose data. `fsync()` is the
call that says "push this file's data through all of it and do not return until
it is durable." On Linux it is expected to flush the device cache too, and on
modern filesystems it does.

## Getting it right in code

```python
import os

def atomic_write(path, data: bytes):
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
    try:
        os.write(fd, data)
        os.fsync(fd)          # file contents are durable
    finally:
        os.close(fd)

    os.rename(tmp, path)      # atomic replacement within a filesystem

    # the rename itself lives in the directory, which also needs a flush
    dfd = os.open(os.path.dirname(path) or ".", os.O_RDONLY)
    try:
        os.fsync(dfd)
    finally:
        os.close(dfd)
```

The directory fsync is the step almost everyone omits. `rename()` is atomic,
meaning you will never see a half replaced file, but the directory entry
recording that rename is itself buffered metadata. Without flushing the
directory you can come back after a power loss to find the old file, or in some
filesystem configurations neither name resolving to your data.

The pattern, write to temp, fsync the file, rename, fsync the directory, is the
standard recipe for "replace a file durably." It is worth memorising because
config management, package managers, and databases all do exactly this.

If you are using buffered I/O in a runtime, flush the runtime buffer before
fsync or you are syncing an empty file with great confidence.

## fdatasync, O_SYNC, and the cheaper options

`fsync()` flushes data and all metadata. `fdatasync()` flushes data and only the
metadata required to read it back, skipping things like the modification
timestamp. For append heavy workloads that difference is measurable, because it
can avoid a separate metadata journal write.

`O_SYNC` and `O_DSYNC` on `open()` make every write synchronous. Simple and
usually slower than batching writes and calling fsync once, because you lose the
ability to merge.

The general rule: sync at transaction boundaries, not at every write. What
counts as a transaction is an application decision, and it is the same decision
a database makes when it groups commits.

## Why databases write twice

Once you understand fsync, write ahead logging makes obvious sense. Random
updates scattered across a large data file would require syncing many locations.
Instead the database appends a description of the change to a sequential log,
syncs that one file, and only then applies changes to the data pages lazily.

The log write is sequential and small, so one sync covers an entire transaction.
Recovery replays the log. This is why a database can be both durable and fast,
and it is the same trick a journaling filesystem uses for metadata.

It also explains a configuration setting people turn off without understanding
it. PostgreSQL has a parameter controlling whether the write ahead log is
flushed at commit. Turning it off makes commits faster and means a crash can
lose recently committed transactions while leaving the database structurally
intact. That is a legitimate choice for a rebuildable analytics replica and an
unacceptable one for anything you cannot reconstruct. The point is to make it a
choice.

## Verifying instead of assuming

Two things I check on any storage I intend to trust.

**Does the device honour flush?** Consumer drives have historically been caught
acknowledging flushes they did not perform. You cannot easily test this without
pulling power, which is exactly the test: write a known sequence with syncs,
cut power at the wall, and see what survived. Do it once on a new drive class
before that class holds anything important.

**Is the write cache where I think it is?**

```bash
# device write cache state
sudo hdparm -W /dev/sda
cat /sys/block/sda/queue/write_cache      # "write back" or "write through"

# filesystem mount options, look for nobarrier, which disables flushes
findmnt -no OPTIONS /var/lib/data

# writeback tuning: how much dirty data the kernel will hold
sysctl vm.dirty_ratio vm.dirty_background_ratio vm.dirty_expire_centisecs
```

Finding `nobarrier` in a mount option list is a red flag. Someone turned off
write barriers for performance, usually years ago, usually on the assumption
that a battery backed controller made it safe. Verify that assumption still
holds, because batteries age and controllers get replaced.

The theme across all of this: durability is a property you configure and
verify, not one you receive by default. A backup you have never restored and a
sync you have never tested are the same category of thing.

## References

- [fsync(2) manual page](https://man7.org/linux/man-pages/man2/fsync.2.html)
- [open(2) manual page](https://man7.org/linux/man-pages/man2/open.2.html)
- [PostgreSQL: reliability and the write-ahead log](https://www.postgresql.org/docs/current/wal-reliability.html)
- [SQLite: atomic commit](https://sqlite.org/atomiccommit.html)
- [Write-ahead logging](https://en.wikipedia.org/wiki/Write-ahead_logging)
- [Journaling file system](https://en.wikipedia.org/wiki/Journaling_file_system)
