
## Why the log exists at all

A database page is larger than the unit the storage layer promises to write
atomically. If the machine loses power halfway through writing a page, you get
a page that is half old and half new, which is worse than either.

The write-ahead rule fixes this: before any change touches a data page, a
record describing that change is durably written to a sequential log. Recovery
then has a script. Replay the log from the last known-good point, redo
anything that was committed but not yet applied to the data files, and discard
anything that was not committed.

Two properties fall out of this and both are useful. Sequential writes are
much friendlier to storage than scattered page writes, so the log costs less
than you would guess. And a commit only has to make the log durable, not the
data pages, so commit latency depends on the log device rather than on the
whole working set.

## From crash recovery to time travel

Here is the part that people miss. The same log that lets you recover from a
crash lets you recover to a moment of your choosing, because the log is an
ordered record of every change the database ever made.

Take a copy of the data files at some point, keep every log segment produced
after that copy, and you can reconstruct the database as it existed at any
instant covered by the log. That is point in time recovery, and it is
qualitatively different from a nightly dump. A dump gives you last night. PITR
gives you one second before the mistake.

The three ingredients are a base backup, an unbroken chain of archived log
segments from that backup forward, and a recovery target.

## Setting up the archive

In PostgreSQL, the log is the WAL and it lives in 16 MiB segments. Archiving
copies each completed segment somewhere durable before the server recycles it.

```ini
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /srv/wal/%f && cp %p /srv/wal/%f'
archive_timeout = 300
max_wal_size = 4GB
```

The `test ! -f` guard is not decoration. `archive_command` must never
overwrite an existing file and must return non-zero on any failure. If it
returns success without actually persisting the segment, the server recycles
the original and your chain has a hole in it, which you will discover during
a recovery and not before.

`archive_timeout` forces a segment switch on a quiet database so your
recovery window does not silently stretch to hours just because nothing is
being written.

Take the base backup with the tool built for it:

```bash
pg_basebackup -h db01 -U replicator \
  -D /srv/backups/base-2026-07-27 \
  --wal-method=stream --checkpoint=fast --progress
```

`--wal-method=stream` pulls the WAL generated during the backup alongside the
files, so the backup is self-consistent even if archiving hiccups while it
runs.

## Recovering to a target

Recovery is: put the base backup in place, tell the server where the archived
segments are, tell it when to stop.

```ini
# postgresql.conf on the recovery instance
restore_command = 'cp /srv/wal/%f %p'
recovery_target_time = '2026-07-27 14:22:00-07'
recovery_target_action = 'pause'
```

`recovery_target_action = 'pause'` is the setting I would never leave out. The
server replays to the target and then stops, still in recovery, waiting. You
connect, look around, and confirm this is really the state you wanted. If you
overshot, you stop the server, adjust the target, and replay again from the
base backup. If you had let it promote automatically, it would have started
writing a new timeline and going back would be a bigger job.

Targets are not only timestamps. You can recover to a named restore point you
created before a risky migration, to a specific transaction ID, or to the
earliest point at which the backup is merely consistent. The named restore
point is underrated: `SELECT pg_create_restore_point('pre-migration')` costs
nothing and gives you an exact, unambiguous place to rewind to.

Timelines are worth understanding before you need them. When a recovered
server is promoted, it starts a new timeline so that WAL written after the
promotion cannot be confused with WAL from the original history. That is what
makes it safe to recover repeatedly to different targets from one base backup.

## What breaks this

The chain is the fragile part, and it fails quietly.

A failed `archive_command` that the monitoring never noticed means every
recovery target after that point is unreachable. Watch the archiver: PostgreSQL
exposes `pg_stat_archiver` with a count of failures and the name of the last
failed segment. Alert on failures increasing and on the age of the last
successful archive, not just on disk space.

A base backup older than your archive retention is not a backup. If you keep
30 days of WAL and your newest base backup is 40 days old, you have nothing.
Take base backups on a schedule tied to retention, and verify the two windows
overlap with room to spare.

Replay time is also not free. Recovering across two weeks of WAL on a busy
system means replaying two weeks of changes, single-threaded, from a target
you cannot skip ahead in. If your recovery objective is measured in minutes,
take base backups often enough that the replay span is short. That tradeoff,
backup frequency against replay time, is the actual design decision in a PITR
setup, and it is worth doing the arithmetic on your own write volume rather
than copying someone else's schedule.

## References

- https://www.postgresql.org/docs/current/wal-intro.html
- https://www.postgresql.org/docs/current/continuous-archiving.html
- https://www.postgresql.org/docs/current/app-pgbasebackup.html
- https://en.wikipedia.org/wiki/Write-ahead_logging
- https://www.sqlite.org/wal.html
