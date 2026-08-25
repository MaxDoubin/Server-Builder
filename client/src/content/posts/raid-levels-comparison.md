
## What RAID does

You have a pile of drives and a choice to make, and every guide you find either lists the levels without telling you which to pick or tells you to pick one without explaining why. The decision comes down to three things you are trading against each other: usable capacity, how many drives can die, and what happens to write performance. Once you can see those three numbers for each level, the choice usually makes itself.

RAID (Redundant Array of Independent Disks) combines multiple physical drives into a logical unit for performance, redundancy, or both. The RAID level determines how data is distributed across the drives and how many drives can fail before data is lost.

One thing to fix in your head before anything else: RAID gives you availability, not safety. It keeps a machine running through a hardware failure. It does not protect you from deleting a file, from ransomware, from a bad write, or from the building burning down, because every one of those changes gets faithfully replicated to every drive in the array.

## RAID 0: speed, no safety

RAID 0 stripes data across all drives with no redundancy. You get the combined capacity and performance of all drives, but if any single drive fails, all data is lost. I use RAID 0 for temporary scratch space where speed matters and the data is expendable.

Worth internalising how the risk scales: RAID 0 is less reliable than a single drive, and it gets worse with every drive you add, because the array dies if any member dies. Four drives in RAID 0 have roughly four times the annual failure probability of one drive.

## RAID 1: simple mirror

RAID 1 mirrors data across two drives. You get the capacity of one drive with the read performance of two. If either drive fails, the other has a complete copy. I use RAID 1 for boot drives on my servers because simplicity and reliability matter more than capacity.

Reads can be served from either member, so read throughput scales. Writes go to both members and complete when the slower one finishes, so write throughput is roughly that of a single drive. Recovery is the fastest of any level because it is a straight copy with no parity to compute.

## RAID 5: balance

RAID 5 stripes data across three or more drives with one drive's worth of parity. Any single drive can fail without data loss. You lose one drive's worth of capacity to parity. RAID 5 is popular but has a dangerous weakness: during a rebuild after a drive failure, a second failure means total data loss. With modern large drives, rebuilds take hours or days.

The parity is nothing exotic. For each stripe, the parity block is the XOR of the data blocks in that stripe, and the parity blocks are distributed across all the drives rather than concentrated on one. Losing a drive means every read of the missing block has to reconstruct it by XORing everything else in the stripe, which is why a degraded RAID 5 array is dramatically slower as well as dramatically more fragile.

The cost shows up on small writes. Changing one block requires reading the old data block and the old parity block, computing the new parity, then writing both back. Four I/O operations for one logical write, the classic read-modify-write penalty.

## RAID 6: better safety

RAID 6 is like RAID 5 but with double parity. Any two drives can fail simultaneously without data loss. I prefer RAID 6 over RAID 5 for any array larger than four drives because the probability of a second failure during a rebuild is higher than most people realize.

The second parity block is not a second XOR, because that would carry no new information. It is a Reed-Solomon syndrome computed over a Galois field, which is what allows the array to solve for two unknowns instead of one. The practical costs are more CPU during writes and a six operation penalty per small write instead of four.

Here is the argument for RAID 6 stated properly, because the numbers are checkable. Drives are specified with an unrecoverable read error rate, commonly one sector per 10^14 bits read on consumer class drives and one per 10^15 or better on enterprise class. 10^14 bits is 12.5 terabytes. A rebuild has to read every remaining sector on every surviving drive, so a five drive array of 8 TB consumer disks asks for something on the order of 32 TB of flawless reading at exactly the moment you have no redundancy left. You do not need a whole second drive to fail. One unreadable sector in the wrong place is enough with single parity. RAID 6 tolerates that, which is the real reason to use it.

## RAID 10: performance and redundancy

RAID 10 combines mirroring and striping. Pairs of drives are mirrored, and the mirrors are striped together. You get excellent read and write performance with the ability to survive at least one drive failure per mirror pair. The downside is that you lose 50% of your total capacity.

I use RAID 10 for VM storage where I/O performance is the priority. Random read and write performance on RAID 10 is significantly better than RAID 5 or 6.

Note the "at least" carefully. A RAID 10 across six drives can survive three failures if they land in three different mirror pairs, or die from two failures if both hit the same pair. It is not a guaranteed two drive tolerance, it is luck weighted in your favour. The upside is that rebuilds only read one drive, the surviving partner, so they are fast and they do not stress the whole array.

## The comparison in one place

For an array of N identical drives:

| Level | Usable capacity | Drives that can fail | Small write penalty | Min drives |
| --- | --- | --- | --- | --- |
| RAID 0 | N | 0 | 1 | 2 |
| RAID 1 | 1 drive | N-1 | 2 | 2 |
| RAID 5 | N-1 | 1 | 4 | 3 |
| RAID 6 | N-2 | 2 | 6 | 4 |
| RAID 10 | N/2 | 1 per mirror pair | 2 | 4 |

The write penalty column is the one people skip and then get surprised by. If you need a certain number of write IOPS from the array, divide the raw drive IOPS by that penalty before you decide whether the drives are fast enough.

## A worked example: building and checking a RAID 6

Linux software RAID with mdadm is the version worth learning, because you can inspect every part of it. Six drives, double parity, default 512 KiB chunk:

```bash
sudo mdadm --create /dev/md0 --level=6 --raid-devices=6 \
  --chunk=512 /dev/sd[b-g]
cat /proc/mdstat
```

```
Personalities : [raid6] [raid5] [raid4]
md0 : active raid6 sdg[5] sdf[4] sde[3] sdd[2] sdc[1] sdb[0]
      15627544576 blocks super 1.2 level 6, 512k chunk, algorithm 2 [6/6] [UUUUUU]
      [>....................]  resync =  1.3% (51372544/3906886144) finish=412.1min speed=157832K/sec
      bitmap: 30/30 pages [120KB], 65536KB chunk
```

Read that status line carefully, because it is the whole health summary. `[6/6]` means six devices expected and six present. `[UUUUUU]` is one character per member, `U` for up. A failed drive shows as `[6/5]` and `[U_UUUU]`, and the underscore tells you which slot. The initial resync is normal on a new array and the array is usable while it runs, just slower.

Persist the configuration so the array assembles at boot, and confirm the detail view:

```bash
sudo mdadm --detail --scan | sudo tee -a /etc/mdadm/mdadm.conf
sudo mdadm --detail /dev/md0
```

The detail output should show `State : clean`, `Active Devices : 6`, and `Failed Devices : 0` once the resync completes.

Then set up scrubbing, which is the part most people never do. A scrub reads every stripe and verifies parity, so latent bad sectors are found while you still have redundancy rather than during a rebuild:

```bash
echo check | sudo tee /sys/block/md0/md/sync_action
cat /sys/block/md0/md/mismatch_cnt
```

`mismatch_cnt` should be 0 on a healthy array. A non-zero count on RAID 1 or RAID 10 is sometimes benign, because unused blocks can legitimately differ, but on RAID 5 or 6 it means parity did not agree with data and you should investigate the drives. Most distributions ship a monthly scrub timer already; check that yours is enabled rather than assuming.

## Software RAID vs hardware RAID

Hardware RAID controllers (like Dell's PERC cards) handle RAID in dedicated hardware. Software RAID (like Linux mdadm or ZFS RAIDZ) does it in the CPU. Modern CPUs are fast enough that software RAID performs comparably to hardware RAID for most workloads, and software RAID gives you more flexibility and visibility into what the array is doing.

The one thing a hardware controller still brings is a battery or supercapacitor backed write cache, which lets it acknowledge writes before they reach the platters and survive a power cut. That is a genuine advantage for small synchronous writes. It is also conditional: if the battery is dead or in a learn cycle, most controllers silently drop from write-back to write-through and your array gets slower with no obvious cause. Not every card has cache at all, and an entry level controller without one gives you the lock-in of hardware RAID with none of the benefit.

The lock-in is real. Array metadata is written in the controller's own format, so recovering the array generally means finding another controller from the same family. With mdadm or ZFS, any machine that can see the drives can import the array.

I use ZFS RAIDZ2 (which is conceptually similar to RAID 6) for my bulk storage and hardware RAID 1 for boot drives.

## What breaks

**The write hole eats a stripe during a power cut.** In parity RAID a stripe update is not atomic: data and parity are separate writes, and if power fails between them the stripe is internally inconsistent. Worse, you cannot tell which half is wrong, so a later rebuild reconstructs garbage confidently. Hardware controllers solve this with a protected cache, mdadm offers a write journal or partial parity log, and ZFS RAIDZ sidesteps it entirely with copy-on-write and variable width stripes. If you run parity RAID with none of those, add a UPS and mean it.

**A drive failed weeks ago and nobody knew.** An array in degraded state keeps serving data perfectly, so there is no user visible symptom until the second failure. `mdadm --monitor` with an email address, or a check that alerts on anything other than `[UUUU]` in `/proc/mdstat`, costs ten minutes and is the single highest value thing on this list.

**All the drives came from the same batch.** Identical drives, manufactured in the same week, spun up on the same day, in the same thermal environment, wear at the same rate. Correlated failure is exactly the assumption RAID's reliability math does not make. Buy from different batches or different vendors, and treat a second failure during a rebuild as likely rather than as bad luck.

**No hot spare, so the degraded window is however long shipping takes.** The dangerous period is between failure and the completed rebuild. A hot spare shrinks that from days to hours by starting the rebuild automatically. Add one with `mdadm --add`, and remember it does nothing unless monitoring confirms the rebuild actually started.

**Filesystem alignment does not match the stripe geometry.** A misaligned filesystem turns one logical write into a read-modify-write across two stripes, and the array performs far below what the drives can do. When you make the filesystem, tell it the geometry: for ext4, `mkfs.ext4 -E stride=<chunk/block>,stripe-width=<stride * data disks>`, and for XFS, `mkfs.xfs -d su=512k,sw=4` on the six drive RAID 6 above.

**Someone expands the array and assumes the filesystem grew too.** Growing an array with `mdadm --grow` changes the block device, not the filesystem on it. Until you run `resize2fs` or `xfs_growfs`, the extra space is invisible, and the reshape itself is a long, fully exposed operation that you should have a current backup before starting.

## References

- https://en.wikipedia.org/wiki/Standard_RAID_levels
- https://en.wikipedia.org/wiki/Nested_RAID_levels
- https://man7.org/linux/man-pages/man8/mdadm.8.html
- https://man7.org/linux/man-pages/man4/md.4.html
- https://wiki.archlinux.org/title/RAID
- https://openzfs.github.io/openzfs-docs/Basic%20Concepts/RAIDZ.html
