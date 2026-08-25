
## Flash cannot overwrite in place

This one physical fact drives everything else about SSD behavior. NAND is
written in pages, typically a few kilobytes, but it can only be erased in
blocks, which are hundreds of pages grouped together. You cannot change a page
in place. To modify data you write a new page somewhere else, mark the old one
invalid, and eventually erase the whole block that contains it after
relocating whatever is still valid inside it.

That relocation is garbage collection, and it is the source of write
amplification: the ratio of bytes actually written to NAND versus bytes the
host asked to write.

```
WAF = NAND writes / host writes
```

A WAF of 1.0 is the ideal, and sequential large writes get close to it. A WAF
of 4 means your drive is burning through its endurance four times faster than
your workload suggests. I have seen much worse than 4 on the wrong workload
with the wrong drive.

## Where the amplification comes from

**Small random writes.** If you write 4 KiB into the middle of a block, the
controller eventually has to relocate the rest of that block to reclaim it.
The smaller and more scattered your writes, the more valid data gets copied
per erase.

**A full drive.** This is the big one. Garbage collection needs free blocks to
work with. At 95 percent full the controller is constantly shuffling to find
space, and amplification climbs steeply. Overprovisioning, whether the drive's
hidden reserve or space you deliberately leave unpartitioned, is buying the
controller room to work.

**No TRIM.** Without discard, the drive does not know which logical blocks the
filesystem considers dead, so it faithfully relocates data nobody wants
anymore.

**Misaligned partitions and mismatched block sizes.** A filesystem or database
writing 8 KiB records into an unaligned layout turns one logical write into
two physical ones before the controller even gets involved.

## Reading what the drive is telling you

Every decent drive reports this. For NVMe:

```bash
sudo nvme smart-log /dev/nvme0n1
# percentage_used            : 7%
# data_units_written         : 41203118
# host_read_commands         : ...
# media_errors               : 0
# unsafe_shutdowns           : 3
```

`data_units_written` is counted in units of 1000 blocks of 512 bytes, so
multiply by 512000 to get bytes. `percentage_used` is the controller's own
estimate of consumed endurance and it can exceed 100.

For SATA, smartmontools:

```bash
sudo smartctl -a /dev/sda | grep -Ei 'wear|written|reallocat|life|error'
```

Vendor specific attributes vary, which is annoying, but most drives expose
both host writes and NAND writes somewhere in the vendor log, and the ratio is
the number you want. A small script that samples this weekly and stores the
delta tells you your real WAF under your real workload, which is worth far
more than any datasheet figure.

```bash
#!/usr/bin/env bash
# log NVMe endurance counters for trend analysis
dev=${1:-/dev/nvme0n1}
ts=$(date -Iseconds)
sudo nvme smart-log -o json "$dev"   | jq -r --arg ts "$ts" --arg dev "$dev"       '[$ts, $dev, .data_units_written, .percentage_used, .media_errors]
       | @csv' >> /var/log/nvme-endurance.csv
```

Trend over months beats a single reading. A drive at 7 percent used means
nothing until you know whether it took two years or two weeks to get there.

## Workloads that punish the wrong drive

Some things are genuinely hostile to consumer flash, and putting them on a
drive with low endurance and no power loss protection is how people lose
weekends:

- database write ahead logs and journals, which are small, constant, and
  synchronous
- a hypervisor's swap or a busy VM's disk image doing random 4 KiB writes
- ZFS with a separate intent log device, which takes a stream of synchronous
  writes by design
- metrics and logging systems, which append forever and compact periodically
- container build caches, which churn enormous amounts of short lived data

The distinguishing feature of enterprise drives here is not raw speed. It is
sustained write behavior once the fast cache is exhausted, a much larger
overprovisioned reserve, and power loss protection capacitors so a synchronous
write can be acknowledged when it reaches the drive's buffer instead of after
it reaches NAND. That last one is why an enterprise drive can be
enormously faster at synchronous workloads while looking similar on a
sequential benchmark.

## What I actually do

Match the drive class to the write pattern instead of buying the fastest
number. Leave real free space, because a drive kept at 80 percent full will
outlive the same drive kept at 98 percent. Make sure discard is happening,
preferably as a weekly `fstrim.timer` rather than the `discard` mount option,
since batched trims cause less interference. Put the write heavy thing on the
drive that was built for write heavy things, and keep the read mostly bulk
data somewhere cheaper.

And monitor. Endurance failure is one of the few hardware failures that
announces itself well in advance if you are looking. There is no excuse for
being surprised by it.

## References

- [Write amplification](https://en.wikipedia.org/wiki/Write_amplification)
- [S.M.A.R.T.](https://en.wikipedia.org/wiki/S.M.A.R.T.)
- [TRIM](https://en.wikipedia.org/wiki/Trim_%28computing%29)
- [smartmontools](https://www.smartmontools.org/)
- [nvme-cli](https://github.com/linux-nvme/nvme-cli)
- [NVM Express specifications](https://nvmexpress.org/specifications/)
