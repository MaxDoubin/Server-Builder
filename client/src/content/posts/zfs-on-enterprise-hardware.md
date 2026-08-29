
## Why ZFS

You have a PowerEdge with a stack of drives in it, you want a filesystem that will tell you when something is quietly rotting, and the [RAID](/blog/raid-levels-comparison) controller in the front of the machine is standing in your way. That is the whole problem in one sentence, and most of the work in getting ZFS running on Dell hardware is convincing the storage controller to get out of the way and then choosing a pool layout you will not regret in two years.

ZFS is a filesystem and volume manager that handles things most filesystems leave to external tools. It does its own RAID (called RAIDZ), snapshots, compression, deduplication, checksumming, and self-healing. Once you use ZFS, going back to traditional RAID controllers and ext4 feels primitive.

The killer feature is data integrity. ZFS checksums every block of data and can detect and correct silent corruption automatically. In a homelab where you are storing data you care about, that matters.

## How the integrity guarantee actually works

Two design decisions do the heavy lifting. First, ZFS is copy-on-write: it never overwrites a live block. A modified block is written somewhere new and the pointer to it is updated afterwards, all the way up a tree of block pointers to a root block called the uberblock. Either the whole transaction group lands or none of it does, so there is no fsck and no equivalent of the parity RAID write hole.

Second, a block's checksum lives in the parent block pointer rather than beside the data. If a drive returns the wrong sector, stale data, or a flipped bit, the parent's checksum will not match what came back. In a redundant configuration ZFS reads the good copy from another disk, hands the correct data to the application, and rewrites the bad block. That is the self-healing, and `zpool status` counts it in the CKSUM column. It is also why ZFS wants raw disks: a controller presenting one logical volume has already hidden which physical drive returned the bad read.

## Setting it up on a PowerEdge

Running ZFS on Dell hardware requires some decisions. The PERC RAID controller that comes standard with most PowerEdge servers wants to manage the drives itself. For ZFS, you want the OS to see the raw drives. That means either flashing the PERC to IT mode (so it acts as a simple HBA) or using a separate HBA card.

I went with flashing the PERC H330 to IT mode on one of my R740s. The process involves downloading the firmware from Broadcom, booting into the UEFI shell, and running the flash utility. It is straightforward if you follow the steps carefully, but it is permanent (or at least annoying to reverse), so make sure you want ZFS before committing.

Two alternatives are worth knowing before you pick up a flash utility. Several PERC models expose a non-RAID or HBA mode in the controller setup screen, which passes drives through without reflashing anything, and Dell sells the HBA330, a plain host bus adapter with no RAID personality at all. Either is less risk than a firmware crossflash.

What you must not do is the workaround people reach for first: creating a single drive RAID 0 volume per disk so the OS "sees" each drive. That looks like passthrough and is not. The controller still owns the drive, writes its own metadata, usually hides SMART data and the drive serial, and may cache writes in a way ZFS does not know about. Verify before you build anything: real HBA mode means `lsblk` shows every physical disk individually and `smartctl -a /dev/sda` returns a full SMART report with the manufacturer's model and serial rather than a Dell virtual disk. If `smartctl` cannot read the drive, ZFS is not seeing the hardware either.

## Pool layout

My main ZFS pool is a RAIDZ2 configuration across 8 drives. RAIDZ2 gives me double parity, meaning I can lose any two drives simultaneously without data loss. For a homelab, that is a good balance between capacity and safety.

I also run a separate pool of mirrored SSDs for VM storage. Mirrors give the best random I/O performance, which is what VMs need most.

```bash
zpool create tank raidz2 /dev/sda /dev/sdb /dev/sdc /dev/sdd /dev/sde /dev/sdf /dev/sdg /dev/sdh
zpool create fast mirror /dev/nvme0n1 /dev/nvme1n1
```

Two refinements I would add to that command in production. Set `ashift` explicitly, and reference disks by stable identifiers rather than kernel names:

```bash
zpool create -o ashift=12 -O compression=lz4 -O atime=off \
  tank raidz2 \
  /dev/disk/by-id/scsi-35000c500a1b2c3d4 \
  /dev/disk/by-id/scsi-35000c500a1b2c3d5 \
  ...
```

`ashift` is the base-2 logarithm of the sector size ZFS will use, so `ashift=12` means 4096 byte sectors. Almost every modern drive is physically 4K even when it reports 512 byte logical sectors for compatibility, and if ZFS believes the 512 byte lie it does read-modify-write on every operation. It is set per vdev at creation and cannot be changed afterwards.

The `by-id` paths matter because `/dev/sda` is assigned in whatever order the kernel enumerates devices at boot. Add a controller, move a cable, and the letters shuffle. ZFS labels its disks and usually copes, but troubleshooting a degraded pool is far easier when the name in `zpool status` contains the serial of the drive you need to pull out of the chassis.

One more thing to hold onto: parity level is fixed for the life of a vdev. OpenZFS 2.3 added the ability to expand a RAIDZ vdev by one disk at a time, but that adds width, not parity, and existing data keeps its original data to parity ratio until it is rewritten. Plan the parity level like it is permanent, because functionally it is.

## A worked example: verifying the pool is healthy

The single most useful command:

```bash
zpool status -v tank
```

```
  pool: tank
 state: ONLINE
  scan: scrub repaired 0B in 07:42:11 with 0 errors on Sun Aug  9 08:12:33 2026
config:

	NAME                        STATE     READ WRITE CKSUM
	tank                        ONLINE       0     0     0
	  raidz2-0                  ONLINE       0     0     0
	    scsi-35000c500a1b2c3d4  ONLINE       0     0     0
	    scsi-35000c500a1b2c3d5  ONLINE       0     0     0
	    scsi-35000c500a1b2c3d6  ONLINE       0     0     0
	    scsi-35000c500a1b2c3d7  ONLINE       0     0     0

errors: No known data errors
```

Correct output is `ONLINE` everywhere, zeros in all three error columns, a recent scrub, and the final line reading "No known data errors". Non-zero CKSUM on one disk with zeros elsewhere is the classic signature of a failing drive or a bad cable, and it is a warning you get long before the drive drops out.

Scrubs surface latent corruption. Start one with `zpool scrub tank` and `zpool status` gains a progress line with a percentage and an estimated finish time. Monthly is a reasonable cadence for spinning disks, and most distributions already ship a timer for it, so confirm yours is enabled rather than assume.

Check that compression is doing something useful:

```bash
zfs get compression,compressratio,recordsize tank
```

```
NAME  PROPERTY       VALUE     SOURCE
tank  compression    lz4       local
tank  compressratio  1.47x     -
tank  recordsize     128K      default
```

And configure the event daemon so a failing disk emails you instead of sitting quietly in `zpool status`. Set `ZED_EMAIL_ADDR` in `/etc/zfs/zed.d/zed.rc` and enable the `zfs-zed` service. A pool that degrades with nobody watching is just a slower way to lose data.

## Compression and snapshots

I enable LZ4 compression on all datasets by default. LZ4 is fast enough that it actually improves performance in many cases because you are writing less data to disk. The compression ratios vary by workload, but I typically see 1.3x to 1.8x on general data.

LZ4 also has an early abort: it gives up quickly on incompressible data, so already compressed files like video and archives cost almost nothing to attempt. That is why leaving it on globally is right rather than something to tune per dataset. For cold, bulky, compressible data with CPU to spare, `zstd` compresses harder at higher cost.

`recordsize` is the tuning knob that actually moves numbers. The default is 128K, and it is a maximum rather than a fixed size, so small files do not waste a whole record. Databases that read and write in fixed pages are the exception: matching recordsize to the page size avoids reading 128K to service an 8K or 16K request. Changing it only affects newly written data, so set it before you load the data in.

Snapshots are the other game changer. I take automated snapshots every hour and keep daily snapshots for 30 days. Rolling back a VM or recovering a deleted file takes seconds instead of hours.

Snapshots are nearly free at creation, because copy-on-write means a snapshot is just a reference to blocks that already exist, and they cost space only as live data diverges from them. Two consequences: deleting a large file frees nothing while a snapshot still references its blocks, and a snapshot is not a backup, because it dies with the pool. Use `zfs send` to get a copy onto other hardware.

## Lessons learned

ZFS rewards careful planning. Choose your pool layout thoughtfully because changing it later means destroying and recreating the pool. Buy drives from different batches to avoid correlated failures. And always have more RAM than you think you need, because ZFS uses memory aggressively for caching.

On the RAM question, the widely repeated "1 GB per TB" rule is folklore that came from deduplication guidance and does not apply to ordinary pools. What is true: the ARC on Linux defaults to using about half of system memory, that memory is reclaimable so it is not lost, and dedup genuinely does need several gigabytes per terabyte of unique data because its table has to stay resident. Give ZFS plenty of RAM for cache, and leave deduplication off unless you have measured that your data actually dedupes. Compression gets you most of the saving for a fraction of the cost.

## What breaks

**A pool built with the wrong ashift.** Create a vdev on 512e drives without `ashift=12` and ZFS uses 512 byte sectors, turning every write into a read-modify-write inside the drive. Performance is poor from day one and there is no fix short of recreating the pool. Pass `-o ashift=12` explicitly rather than trusting autodetection, which relies on the drive telling the truth about its physical sector size.

**Someone types `zpool add` when they meant `zpool attach`.** `attach` adds a mirror to an existing device. `add` creates a brand new top level vdev. Run `zpool add tank /dev/sdi` on a raidz2 pool and you have just striped your carefully protected pool with a single unprotected disk. Use `zpool add -n` first, which prints exactly what the command would do without doing it.

**The pool fills past about 80 percent and everything gets slow.** As a copy-on-write filesystem, ZFS needs contiguous free space to write efficiently. As the pool fills, the allocator switches to a slower best-fit strategy and fragmentation rises. Plan capacity to stay below 80 percent and watch the `CAP` and `FRAG` columns in `zpool list`.

**An SLOG is added expecting a general write cache.** The separate log device only accelerates synchronous writes, which means NFS with sync exports, iSCSI, and databases. Asynchronous writes never touch it. A consumer SSD without power loss protection is actively harmful here, since surviving a power cut is the entire point of the device.

**Snapshots accumulate forever and the pool fills with no obvious culprit.** Every hourly snapshot pins the blocks that existed when it was taken, so a busy dataset can hold many times its apparent size in history. Check with `zfs list -t snapshot -o name,used -s used` and set an automatic pruning policy from the start, not after the pool is full.

## References

- https://openzfs.github.io/openzfs-docs/
- https://openzfs.github.io/openzfs-docs/man/master/8/zpool-create.8.html
- https://openzfs.github.io/openzfs-docs/man/master/7/zfsprops.7.html
- https://openzfs.github.io/openzfs-docs/man/master/8/zpool-scrub.8.html
- https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Workload%20Tuning.html
- https://wiki.archlinux.org/title/ZFS
