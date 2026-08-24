
## Why ZFS

ZFS is a filesystem and volume manager that handles things most filesystems leave to external tools. It does its own RAID (called RAIDZ), snapshots, compression, deduplication, checksumming, and self-healing. Once you use ZFS, going back to traditional RAID controllers and ext4 feels primitive.

The killer feature is data integrity. ZFS checksums every block of data and can detect and correct silent corruption automatically. In a homelab where you are storing data you care about, that matters.

## Setting It Up on a PowerEdge

Running ZFS on Dell hardware requires some decisions. The PERC RAID controller that comes standard with most PowerEdge servers wants to manage the drives itself. For ZFS, you want the OS to see the raw drives. That means either flashing the PERC to IT mode (so it acts as a simple HBA) or using a separate HBA card.

I went with flashing the PERC H330 to IT mode on one of my R740s. The process involves downloading the firmware from Broadcom, booting into the UEFI shell, and running the flash utility. It is straightforward if you follow the steps carefully, but it is permanent (or at least annoying to reverse), so make sure you want ZFS before committing.

## Pool Layout

My main ZFS pool is a RAIDZ2 configuration across 8 drives. RAIDZ2 gives me double parity, meaning I can lose any two drives simultaneously without data loss. For a homelab, that is a good balance between capacity and safety.

I also run a separate pool of mirrored SSDs for VM storage. Mirrors give the best random I/O performance, which is what VMs need most.

```bash
zpool create tank raidz2 /dev/sda /dev/sdb /dev/sdc /dev/sdd /dev/sde /dev/sdf /dev/sdg /dev/sdh
zpool create fast mirror /dev/nvme0n1 /dev/nvme1n1
```

## Compression and Snapshots

I enable LZ4 compression on all datasets by default. LZ4 is fast enough that it actually improves performance in many cases because you are writing less data to disk. The compression ratios vary by workload, but I typically see 1.3x to 1.8x on general data.

Snapshots are the other game changer. I take automated snapshots every hour and keep daily snapshots for 30 days. Rolling back a VM or recovering a deleted file takes seconds instead of hours.

## Lessons Learned

ZFS rewards careful planning. Choose your pool layout thoughtfully because changing it later means destroying and recreating the pool. Buy drives from different batches to avoid correlated failures. And always have more RAM than you think you need, because ZFS uses memory aggressively for caching.
