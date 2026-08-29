
## The problem

You have a Mac holding real work, you keep reading that APFS has snapshots and clones and checksums, and you want to know whether that is enough to trust it with data you cannot lose. Or you are running a mixed lab and trying to decide which side of the wire holds the authoritative copy. The short version is that APFS is a very good filesystem that solves a different problem than a server filesystem solves, and the gap is specific enough to name.

## What APFS is

Apple File System (APFS) is Apple's modern filesystem, introduced in 2017 to replace HFS+. It shipped first on iOS 10.3 in the spring of that year and then on macOS 10.13 High Sierra in the fall. It was designed primarily for flash storage (SSDs) and supports features like snapshots, clones, strong encryption, space sharing, and crash protection through copy-on-write metadata.

HFS+ was designed for spinning disks and a single volume per partition. It used a journal to recover from crashes, it had 32-bit file IDs, and it had no concept of a snapshot. APFS replaced essentially all of that. File IDs are 64-bit, timestamps are nanosecond resolution, the default block size is 4096 bytes, and the on-disk structures are copy-on-write rather than journalled.

## How copy-on-write actually works here

This is the mechanism that everything else in APFS is built on, so it is worth being precise about it.

When APFS modifies a metadata block, it does not overwrite the old one. It writes a new copy somewhere else and then updates the pointer to it, and that pointer update itself propagates upward until it reaches a superblock. The final write that commits the whole change is a single atomic superblock update. If power drops halfway through, the old superblock is still valid and still points at a fully consistent older state. That is why APFS does not need a journal replay and why `fsck_apfs` is usually fast.

The important qualifier: APFS applies copy-on-write to metadata. User data blocks are handled differently, and by default a normal write to an existing file can overwrite in place. That distinction matters when you get to integrity, below.

The same mechanism gives you clones for free. A clone is a second directory entry that points at the same data blocks with a reference count, so duplicating a 50 GB file costs a few kilobytes until one of the copies is modified. Then only the changed blocks diverge.

## Containers and volumes

The part that trips people up is that an APFS "partition" is not a volume. The GPT partition holds an APFS *container*, and the container holds one or more *volumes*. All volumes in a container draw from the same free space pool, which is what Apple means by space sharing. You do not size them up front the way you size an ext4 partition.

Since macOS 10.15 Catalina, a standard Mac boot container has more volumes than most people expect: a read-only System volume, a writable Data volume, plus Preboot, Recovery, and VM. They are stitched together into what looks like one filesystem by a firmlink. This is why `df` output on a modern Mac looks strange and why the same bytes appear to be mounted twice.

```bash
diskutil apfs list
```

Correct output looks roughly like this:

```
APFS Container (1 found)
|
+-- Container disk3 8F2A1C40-...
    ====================================================
    APFS Container Reference:     disk3
    Size (Capacity Ceiling):      2000398934016 B (2.0 TB)
    Capacity In Use By Volumes:   412316860416 B (412.3 GB) (20.6% used)
    Capacity Not Allocated:       1588082073600 B (1.6 TB) (79.4% free)
    |
    +-< Physical Store disk0s2 ...
    |
    +-> Volume disk3s1 (Macintosh HD, APFS System, Not Encrypted)
    +-> Volume disk3s5 (Macintosh HD - Data, APFS Data, Encrypted)
```

The container-level numbers are the ones that are actually true. Per-volume free space is a projection of the shared pool.

## Snapshots and clones, worked

Here is the clone behaviour on a real volume. `mkfile` and `cp -c` both ship with macOS, and `cp -c` is the flag that calls `clonefile(2)` instead of copying blocks.

```bash
cd /tmp
mkfile 1g big.bin
df -h /System/Volumes/Data | tail -1
cp -c big.bin big-clone.bin
df -h /System/Volumes/Data | tail -1
du -sh big.bin big-clone.bin
```

What correct output shows: the two `df` lines report almost identical available space, differing by kilobytes rather than by a gigabyte, while `du` reports `1.0G` for each file. That is not a bug in `du`. Each file legitimately references a gigabyte of blocks, and the blocks are shared. Drop the `-c` and the second `df` line loses a full gigabyte.

Snapshots work the same way at volume scale. Time Machine takes local snapshots automatically, and you can force one:

```bash
tmutil localsnapshot
tmutil listlocalsnapshots /
```

Output is a list of snapshot names in the form `com.apple.TimeMachine.2026-08-25-101500.local`. You can mount one read only and pull a single file out of it:

```bash
mkdir /tmp/snap
sudo mount_apfs -o ro -s com.apple.TimeMachine.2026-08-25-101500.local \
  /System/Volumes/Data /tmp/snap
ls /tmp/snap/Users
```

That is genuinely useful and it is instant. It is also not a backup, for reasons in the mistakes section.

## What APFS does well

APFS is excellent for its intended use case: Apple devices with SSDs. Snapshots are instant and space-efficient. Encryption is hardware-accelerated and transparent. Space sharing lets multiple volumes share a single storage pool dynamically, which is perfect for devices with fixed internal storage.

File operations on APFS are fast because the filesystem was designed around the characteristics of flash storage rather than spinning disks. It issues TRIM, it handles sparse files natively, and directory sizing is computed rather than walked, so getting the size of a large tree is quick.

Encryption is the other genuine strength. FileVault on APFS is volume-level AES, keyed through the Secure Enclave or T2 on hardware that has one, and the crypto runs in dedicated silicon in the storage path. You do not pay the CPU cost of a software-only stack.

## Where APFS falls short for servers

APFS does not checksum file data. It checksums metadata (directory structures, file attributes) using Fletcher-64, but not the actual file contents. This means APFS cannot detect or correct silent data corruption, which is a critical gap for server storage. ZFS, by contrast, checksums every block of data and can self-heal when corruption is detected.

There is also no scrub. Nothing in APFS periodically walks your data verifying it is still what you wrote. `diskutil verifyVolume` and `fsck_apfs` check that the structures are coherent, which is a different question from whether your file contents are intact. A flipped bit inside a photo passes every check APFS knows how to run.

APFS also does not support software [RAID](/blog/raid-levels-comparison). There is no APFS equivalent of ZFS RAIDZ or Linux md RAID. For redundant storage, you need either hardware RAID (which APFS sits on top of) or Apple's AppleRAID layer, which Disk Utility exposes as mirroring, striping, and concatenation only. There is no parity RAID in the box, and because AppleRAID sits below APFS, a mirror can tell you the two sides disagree but has no checksum to decide which side is right.

Last, replication. ZFS has `zfs send` and `zfs receive`, which move snapshot deltas between machines as a stream. APFS snapshots are local objects, and there is no general purpose, scriptable equivalent exposed to you.

## APFS vs ZFS

For server storage:

- **Data integrity:** ZFS wins. Checksumming and self-healing are essential for data you care about.
- **RAID:** ZFS wins. RAIDZ provides integrated software RAID with flexible configurations.
- **Snapshots:** Both are excellent. APFS snapshots are lighter-weight for typical desktop use. ZFS snapshots are more powerful for server backup workflows (send/receive).
- **Encryption:** APFS is more tightly integrated with Apple hardware. ZFS encryption works but is a newer addition.
- **Performance on SSDs:** APFS is optimized for Apple's specific SSD controllers. ZFS performs well on SSDs but was originally designed for spinning disks.
- **Verification:** ZFS wins outright. There is no APFS scrub.

The ZFS side of that is checkable. On the storage box:

```bash
sudo zpool scrub tank
zpool status tank
```

Correct output ends with a scan line and an error line:

```
  scan: scrub repaired 0B in 03:12:44 with 0 errors on Sun Aug 24 06:12:44 2026
errors: No known data errors
```

If a disk had returned bad data that the checksum caught, the `CKSUM` column for that device would be non-zero and the scrub would report blocks repaired. There is no command on the APFS side that produces the equivalent answer.

## My approach

On my Mac Pro, I use APFS for the boot volume and local workspace because it is the native macOS filesystem and works seamlessly with Apple's tools. For any data that needs integrity guarantees or redundancy, I store it on ZFS pools running on my Dell servers.

Concretely, the Mac writes active project files locally on APFS for speed, and a scheduled `rsync` pushes finished work to a ZFS dataset over the network. The ZFS side is the copy with checksums, snapshots on a retention schedule, and a monthly scrub. If the Mac's SSD silently rots a block, the version that matters is elsewhere and verifiable.

This hybrid approach uses each filesystem where it is strongest.

## Common mistakes

**Treating local snapshots as backups.** APFS local snapshots live in the same container as the data they snapshot. If the SSD fails, they die with it. macOS also purges them automatically under disk pressure, so the one you were counting on may not be there. A snapshot protects you from your own `rm`, not from hardware.

**Misreading free space.** `df` on APFS reports purgeable space as available, and snapshots hold blocks that no live file references. You can see 300 GB free and still get "disk full" on a write. Check the container with `diskutil apfs list`, and clear held blocks with `tmutil deletelocalsnapshots <date>` or `tmutil thinlocalsnapshots / <bytes> 4`.

**Expecting `cp` to clone.** Only `cp -c`, Finder's Duplicate, and a direct `clonefile(2)` call produce clones. A backup script using plain `cp` or `rsync` writes full copies, and a workflow that assumed cheap duplicates fills the volume overnight.

**Case sensitivity mismatch.** macOS formats APFS case-insensitive by default. If you create a case-sensitive volume for a build tree, you get correct behaviour for source code but break applications that assume otherwise, and copying from case-sensitive to case-insensitive silently collides `README` with `readme`. Pick one per volume and know which one you picked.

**Assuming encryption implies integrity.** FileVault stops someone reading the disk. It does nothing about a flipped bit, and because the data is enciphered in blocks, a single bit error damages the whole block rather than one byte. Encryption and integrity are separate properties and APFS only provides one of them.

## References

- https://en.wikipedia.org/wiki/Apple_File_System
- https://en.wikipedia.org/wiki/HFS_Plus
- https://en.wikipedia.org/wiki/Copy-on-write
- https://en.wikipedia.org/wiki/ZFS
- https://openzfs.github.io/openzfs-docs/
- https://en.wikipedia.org/wiki/Data_scrubbing
