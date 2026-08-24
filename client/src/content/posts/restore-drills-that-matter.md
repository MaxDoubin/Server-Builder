
## The only test that counts

A backup system has exactly one job, and that job is not "produce backups." It
is "give the data back." Those are different, and the gap between them is where
people lose everything.

A backup job can report success while writing an empty archive, backing up a
database mid write in an unrecoverable state, silently skipping a directory
after a permission change, encrypting with a key nobody has a copy of, or
producing a chain of incrementals with a corrupt link in the middle. Every one
of those looks like green checkmarks on a dashboard until the day you need the
data, and then it is too late to find out.

The only evidence that you have a backup is a restore.

## RTO and RPO, in plain terms

Two numbers drive every design decision, and you should be able to state both
for every system you run.

**Recovery point objective** is how much data you are willing to lose,
expressed as time. Nightly backups mean an RPO of up to 24 hours. If losing a
day of a system is unacceptable, nightly backups are the wrong design and no
amount of reliability fixes that.

**Recovery time objective** is how long you can be down. This is the one people
underestimate, because they measure the copy time and forget everything else:
finding the right backup, provisioning replacement hardware, restoring, running
consistency checks, reconfiguring, and verifying. The copy is often the fast
part.

Write both numbers down per system before designing anything. They will differ
wildly. Losing a week of a media library is annoying; losing an hour of
configuration state is a real outage. Backing both up on the same schedule with
the same rigor means overpaying for one and underprotecting the other.

## Design a drill you will actually run

An annual full disaster recovery exercise is a great idea that nobody does. A
five minute monthly drill is a mediocre idea that gets done, and getting done is
what matters. So I tier it.

**Every run, automated:** the backup tool's own integrity check. Verifies
structure and checksums, catches corruption, needs no human.

**Weekly, automated:** restore a small known file to a scratch location and
compare its hash against a stored value. This is the step that catches the
empty archive and the silently skipped directory, because it exercises the
actual read path.

**Monthly, ten minutes of human time:** restore something real to a scratch
location, open it, confirm it is what you think it is. A database dump that
imports and answers a query. A config directory whose files have the content you
expect.

**Quarterly, a real exercise:** rebuild a service from backup onto different
hardware, working only from your documentation, with the original untouched.
Time it. That number is your real RTO, and it is always larger than the one you
assumed.

```bash
#!/usr/bin/env bash
# weekly automated restore verification
set -euo pipefail

REPO=/srv/backups/main
CANARY="etc/canary.txt"
EXPECTED_HASH_FILE=/srv/backups/canary.sha256
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

restic -r "$REPO" check --read-data-subset=5%
restic -r "$REPO" restore latest --target "$WORK" --include "/$CANARY"

actual=$(sha256sum "$WORK/$CANARY" | cut -d' ' -f1)
expected=$(cut -d' ' -f1 < "$EXPECTED_HASH_FILE")

if [[ "$actual" != "$expected" ]]; then
  echo "RESTORE VERIFICATION FAILED: $actual != $expected" >&2
  exit 1
fi

age_days=$(( ( $(date +%s) - $(restic -r "$REPO" snapshots latest --json \
  | jq -r '.[0].time' | xargs -I{} date -d {} +%s) ) / 86400 ))
[[ $age_days -le 2 ]] || { echo "latest snapshot is $age_days days old" >&2; exit 1; }

echo "restore verification ok"
```

Two details there matter. `--read-data-subset` actually reads and verifies data
rather than only checking metadata, which is the difference between a real check
and a fast lie. And the snapshot age check catches the most common backup
failure of all, which is not corruption but a job that quietly stopped running
weeks ago.

## Failures drills find

From doing this, the recurring discoveries:

**The job stopped and nobody noticed.** Alert on the absence of a recent
successful backup, not on failure notifications. A cron job that no longer runs
sends no failure email, and silence reads exactly like success.

**Nobody has the encryption key.** Or it exists only on the machine being backed
up. Test restoring from a different machine, with only what you would have if
the original were gone.

**The database backup is not consistent.** Copying live database files is not a
backup. Use the engine's dump or snapshot mechanism, and verify the dump
actually imports rather than merely existing.

**Permissions and metadata are lost.** Files come back owned by root with wrong
modes and the application will not start. Only a real restore reveals this.

**The restore fills the disk.** You need free space equal to the restore, plus
the working room the process wants. Discovering that during an incident is
memorable in the wrong way.

**The documentation is wrong.** Paths moved, a step is missing, the runbook
assumes a host that no longer exists. Running the drill from the runbook, and
only the runbook, is how it stays accurate.

## The point

The 3-2-1 rule tells you how many copies to keep and where. It says nothing
about whether those copies work. Verification is the part that turns a copy into
a backup, and it is the part almost everyone skips, because unlike buying
storage it never feels urgent until the exact moment it is far too late to
start.

## References

- [restic documentation](https://restic.readthedocs.io/en/stable/)
- [BorgBackup documentation](https://borgbackup.readthedocs.io/en/stable/)
- [NIST SP 800-34 Rev. 1: Contingency Planning Guide](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-34r1.pdf)
- [Disaster recovery](https://en.wikipedia.org/wiki/Disaster_recovery)
- [PostgreSQL backup and restore](https://www.postgresql.org/docs/current/backup.html)
