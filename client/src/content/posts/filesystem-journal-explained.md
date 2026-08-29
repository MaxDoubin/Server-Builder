
## Two different problems wearing one name

Ask why a filesystem has a journal and most people say "so you do not lose
data in a power cut". That is not quite what it does, and the gap between what
it does and what people think it does is where surprising data loss lives.

There are two separate problems.

**Metadata consistency** is about the filesystem's own bookkeeping. Creating a
file touches an inode, a directory entry, a block bitmap, and a free space
counter. Those writes are not atomic together. A crash halfway through leaves
structures that disagree: a block marked allocated with nothing pointing at it,
or a directory entry pointing at an inode that was never written. The journal
solves this.

**Data durability** is about whether the bytes an application wrote are on
stable media. That is a different question with a different answer, and the
journal mostly does not address it.

A journal turns a multi step metadata update into something atomic. The
filesystem writes a description of the intended change to a dedicated area,
waits for that to be durable, marks it committed, and only then applies the
change to its final locations. After a crash, recovery reads the journal: a
transaction that was fully committed gets replayed, and one that was not gets
discarded. Either way the filesystem is structurally consistent within seconds
instead of requiring a full scan of every inode.

That last part is the real win. Journalling did not primarily arrive to prevent
corruption, it arrived so that mounting a large filesystem after a crash takes
seconds rather than hours.

## The ext4 modes, and what each one costs

ext4 exposes the tradeoff directly through a mount option.

`data=ordered` is the default. Metadata goes through the journal. File data
does not, but it is forced out to its final location before the metadata
transaction that references it commits. That ordering is the point: it makes
it impossible for a newly extended file to point at blocks that still contain
somebody else's old data.

`data=journal` writes file data through the journal as well. Everything is
written twice, throughput drops, and direct I/O is not supported in this mode.
It gives the strongest crash semantics of the three, and it is a deliberate
choice for a small filesystem holding something precious, not a default.

`data=writeback` journals only metadata with no ordering guarantee for data.
It is the fastest and the most surprising: after a crash a file can be the
right size with stale blocks from a previously deleted file inside it. That is
an information disclosure problem as well as a data problem.

```bash
# What is this filesystem actually doing?
dumpe2fs -h /dev/nvme0n1p2 | grep -Ei 'features|journal|mount options'
tune2fs -l /dev/nvme0n1p2 | grep -i 'default mount options'
grep ' / ' /proc/mounts

# Commit interval: how long a transaction can sit unflushed
mount -o remount,commit=5 /data
```

The commit interval is worth knowing. By default a journal transaction is
flushed every few seconds, so the worst case for metadata is a few seconds of
work. Raising it reduces write amplification on a busy filesystem and widens
the window you lose in a crash. That is a real dial, not a micro optimisation.

## What the journal does not do

**It is not a substitute for fsync.** An application that writes and returns
without flushing has handed bytes to the page cache and nothing more. A journal
guarantees the filesystem structure is sane after a crash. It does not promise
your file has content. If durability matters, the application has to ask for
it, and the write path underneath has to honour the flush rather than lying
about it.

**It does not detect corruption.** ext4 checksums its metadata and its journal,
which catches a torn or garbled structure. It does not checksum file data at
all. A bit that flips on the platter, in a cable, or in a controller comes back
to you silently. XFS is in the same position: metadata CRCs, no data checksums.
Copy on write filesystems that checksum data, like ZFS and btrfs, are answering
a different question than journalling ones, which is why "which is safer"
depends entirely on which failure you are worried about.

**It does not help if the hardware lies.** Journalling depends on being able to
say "these blocks must be durable before those blocks". That is implemented as
cache flush and forced unit access requests down the stack. A drive with a
volatile write cache that reports completion early, or a [RAID](/blog/raid-levels-comparison) controller with
an unprotected cache, breaks the ordering the journal is built on. The
filesystem is correct and the data is still wrong.

**Journal replay is not a consistency check.** Replaying a journal makes the
filesystem mountable. It does not verify the rest of the structure. If you have
reason to suspect real corruption, run a full check explicitly on an unmounted
filesystem.

## How I actually think about it

The journal is one layer in a stack of guarantees, and each layer has a
narrow, specific promise. The filesystem promises its own structures are
consistent. The flush primitives promise ordering, if the hardware is honest.
The application promises durability, if it calls the right function and checks
the return value. Backups promise recovery from everything the other three
missed.

People reach for the journal to cover all four, and it covers exactly one.
Knowing which one saves you from the two bad conclusions: assuming a crash
cannot lose recent work because the filesystem is journalled, and assuming a
journalled filesystem will tell you when a drive starts returning garbage.
Neither is true, and the fixes for them live in different layers entirely.

## References

- [Linux kernel: ext4 documentation](https://docs.kernel.org/filesystems/ext4/index.html)
- [Linux kernel: filesystem journalling API](https://docs.kernel.org/filesystems/journalling.html)
- [mount(8) manual page](https://man7.org/linux/man-pages/man8/mount.8.html)
- [fsync(2) manual page](https://man7.org/linux/man-pages/man2/fsync.2.html)
- [tune2fs(8) manual page](https://man7.org/linux/man-pages/man8/tune2fs.8.html)
- [Journaling file system](https://en.wikipedia.org/wiki/Journaling_file_system)
