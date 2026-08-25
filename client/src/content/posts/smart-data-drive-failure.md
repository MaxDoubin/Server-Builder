
## What SMART is good for

Self-Monitoring, Analysis and Reporting Technology is a set of counters and thresholds a drive maintains about itself. Every modern drive exposes it. It is genuinely useful and it is genuinely oversold.

The honest summary: a large fraction of drives fail with no prior SMART warning at all, so a clean SMART report is weak evidence of health. But when specific attributes start moving, that is strong evidence of trouble. SMART is a smoke detector, not a crystal ball. Asymmetric information is still information.

## The attributes that matter on spinning disks

Ignore most of the list. These are the ones I act on:

- **Reallocated Sector Count (5).** Sectors that failed and were remapped to spares. Any nonzero value means the drive has already had unrecoverable media problems. A stable small number is tolerable. A number that is climbing is a drive on its way out.
- **Current Pending Sector Count (197).** Sectors that failed to read and are waiting to be reallocated on the next write. This is the one I care about most. Pending sectors are data you may not be able to read back.
- **Offline Uncorrectable (198).** Sectors the drive could not correct during its own offline scan.
- **Reported Uncorrectable Errors (187).** Errors the drive could not fix with error correction.
- **Command Timeout (188).** Commands that did not complete in time. Often cabling, backplane, or power rather than the drive, so check the physical path before condemning the disk.
- **Spin Retry Count (10).** The motor struggling to spin up. Mechanical, and rarely improves.

Raw values are vendor specific and the normalized values are frequently useless. Watch the direction of travel, not the absolute number. A drive going from 0 to 8 pending sectors in a week matters far more than a drive that has sat at 24 reallocated sectors for two years.

## Flash speaks a different language

For SSDs and NVMe the vocabulary changes entirely:

- **Percentage Used** or media wearout indicator. An estimate of consumed write endurance. Crossing 100 does not mean immediate death, it means the drive is past its rated endurance.
- **Available Spare** and its threshold. The pool of replacement blocks. Falling toward the threshold is a genuine warning.
- **Media and Data Integrity Errors.** Uncorrectable errors reported to the host. Should be zero. Any nonzero value is worth investigating.
- **Unsafe Shutdowns.** High counts point at a power problem, not a drive problem, and power problems eat data.
- **Data Units Written.** Use it to compute your actual write rate and project when endurance runs out.

## The commands

```bash
# Full report, human readable. -x is the everything view.
sudo smartctl -x /dev/sda

# NVMe health log, which is where the flash counters live
sudo smartctl -a /dev/nvme0
sudo nvme smart-log /dev/nvme0

# Kick off tests: short is a couple of minutes, long reads the whole surface
sudo smartctl -t short /dev/sda
sudo smartctl -t long  /dev/sda

# Results of past self tests, newest first
sudo smartctl -l selftest /dev/sda

# Drives behind a RAID controller need the device type specified
sudo smartctl -a -d megaraid,0 /dev/sda
```

That last one catches people out. A hardware RAID controller hides the physical drives, and without the right `-d` flag you get nothing useful. Check what your controller needs.

## Automate it or it will not happen

Nobody remembers to run `smartctl` by hand. Let the daemon do it.

```ini
# /etc/smartd.conf
# -a           all standard checks
# -o on        enable automatic offline testing
# -S on        enable attribute autosave
# -s (S/../.././02|L/../../6/03)  short test daily at 02:00,
#              long test Saturday at 03:00
# -W 4,45,55   report temp change of 4C, warn at 45C, critical at 55C
# -m           where to send warnings
# -M exec      run a script on any warning

/dev/sda -a -o on -S on -s (S/../.././02|L/../../6/03) -W 4,45,55 \
  -m root -M exec /usr/local/sbin/smart-alert.sh

DEVICESCAN -a -o on -S on -s (S/../.././02|L/../../6/03) -W 4,45,55 \
  -m root -M exec /usr/local/sbin/smart-alert.sh
```

Better still, export the values into your existing metrics system so you get history and can see the slope. A single reading tells you a number. A graph tells you whether it is moving, and moving is the whole signal.

```bash
#!/usr/bin/env bash
# Emit key attributes as Prometheus textfile metrics
out=/var/lib/node_exporter/textfile_collector/smart.prom
: > "$out.tmp"
for d in /dev/sd?; do
  n=$(basename "$d")
  sudo smartctl -A "$d" | awk -v dev="$n" '
    $1 == 5   { printf "smart_reallocated_sectors{device=\"%s\"} %d\n", dev, $10 }
    $1 == 197 { printf "smart_pending_sectors{device=\"%s\"} %d\n",     dev, $10 }
    $1 == 198 { printf "smart_offline_uncorrectable{device=\"%s\"} %d\n", dev, $10 }
  ' >> "$out.tmp"
done
mv "$out.tmp" "$out"
```

## What I do with a suspect drive

First, check the physical path. Timeouts and reset storms are often a cable, a backplane slot, or marginal power. Reseat and swap the cable before ordering a replacement.

Second, verify redundancy right now. Confirm the array is healthy and the backup is current before touching anything. The most dangerous moment in a drive's life is the rebuild after a sibling failed, because that is when every remaining drive gets read end to end and latent bad sectors surface all at once.

Third, act on pending sectors. Rising pending sectors on a drive holding data I care about means it gets replaced. The cost of a drive is trivially less than the cost of a rebuild that fails halfway.

Fourth, scrub regularly. A monthly scrub or patrol read finds latent errors while you still have redundancy to repair them from, instead of during a rebuild when you do not. This is the single highest value habit on the list, and it is the one most people skip.

And keep believing your backups more than your SMART data. SMART is one signal. Redundancy plus tested restores is the actual plan.

## References

- [smartmontools](https://www.smartmontools.org/)
- [S.M.A.R.T. on Wikipedia](https://en.wikipedia.org/wiki/S.M.A.R.T.)
- [NVM Express specifications](https://nvmexpress.org/specifications/)
- [Prometheus node exporter](https://github.com/prometheus/node_exporter)
