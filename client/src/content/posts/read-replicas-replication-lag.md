
## What a replica really is

A read replica is a second database that continuously applies the primary's
write-ahead log. It is not a copy job and it is not a periodic sync. It is a
server permanently stuck in recovery, replaying a stream of changes as they
arrive, and serving read-only queries from whatever state it has reached.

That framing explains everything else. The replica is always behind, by some
amount, because the change has to be generated, shipped, received, and
replayed before it is visible. Usually that amount is milliseconds. The
engineering problem is what happens when it is not.

## Where lag comes from

Four places, and they fail differently.

Generation and shipping. A burst of writes produces log faster than the
network moves it. This is the benign case: lag rises with the burst and drains
afterward.

Apply throughput. The primary generates changes using many concurrent
backends. The replica replays them with far less parallelism. A write pattern
that the primary handles comfortably can outrun the replica's ability to apply
it, and this lag does not drain, it grows for as long as the load lasts.

Conflicting queries. A long-running read on the replica needs rows that the
replay wants to remove. The replica must either pause replay or cancel the
query. Both are configurable and both are unpleasant: pausing means lag grows,
cancelling means analytics jobs die at random. If you set a long grace period
so reports finish, you have chosen unbounded lag.

Storage. The replica is often cheaper hardware than the primary, on the theory
that it only serves reads. Replay is a write workload, and a replica that
cannot sustain the primary's write rate will never catch up.

## Measuring it correctly

The number most dashboards show is a time delta, and it lies in both
directions.

On an idle database, time-based lag can read as growing simply because the
last replayed transaction gets older while nothing new arrives. On a busy
database, a small time delta can hide a large backlog if the replica is
applying quickly but receiving faster.

Look at byte positions and at the stages separately:

```sql
SELECT client_addr,
       state,
       sent_lsn,
       write_lsn,
       flush_lsn,
       replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_bytes_behind,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

The three stages tell you which failure you have. A gap between `sent_lsn` and
`write_lsn` is network or receiver. A gap between `flush_lsn` and `replay_lsn`
is apply throughput or a replay conflict, and that is the one that does not
fix itself. Alert on `replay_bytes_behind` with a threshold in bytes, and
separately on lag duration, and require both to be sane.

Also watch replication slots. A slot guarantees the primary keeps WAL until
the replica consumes it, which is exactly what you want until a replica goes
away and the primary fills its disk holding segments for a consumer that is
never coming back. Bound it with `max_slot_wal_keep_size` and alert on slot
size.

## The bug this creates

A user updates their profile, the write goes to the primary, the redirect
issues a read, the read is routed to a replica that has not applied the change
yet, and the user sees their old data. They hit refresh, get a different
replica, and see the new data. This is read-your-writes violation and it is
the single most common consequence of adding replicas.

Options, roughly in order of how much I like them:

Route by intent, not by query type. Sessions that just wrote read from the
primary for a short window. Simple, cheap, and it covers the case people
actually notice.

Carry a position token. After a write, capture the log position and require
any subsequent read to run on a replica that has replayed at least that far,
falling back to the primary otherwise. This is precise and it is more
plumbing.

```python
def read_conn(pool, min_lsn=None):
    if min_lsn is None:
        return pool.replica()
    r = pool.replica()
    if r.scalar("SELECT pg_last_wal_replay_lsn() >= %s", (min_lsn,)):
        return r
    return pool.primary()
```

Use synchronous commit for the transactions that need it. The primary waits
for a replica to confirm before returning. This eliminates the window for
those writes and adds a network round trip to every one of them, so apply it
per transaction, never globally.

Send only genuinely lag-tolerant work to replicas: reports, exports, search
indexing, dashboards. Anything a user will look at immediately after acting
stays on the primary. Deciding this per query, deliberately, is more reliable
than any automatic router.

## Failover is a separate problem

A replica that can serve reads is not automatically a safe failover target. If
replication is asynchronous, promoting a replica that was 500 milliseconds
behind discards 500 milliseconds of committed transactions. The clients that
made those writes were told they succeeded.

Decide in advance whether you can accept that. If you cannot, you need at
least one synchronous replica and you need to accept the commit latency that
comes with it. If you can, write down how much loss is acceptable and alert
when lag exceeds it, because that alert threshold is your real recovery point
objective whether you called it that or not.

The other half is fencing. Two servers both believing they are primary will
happily accept conflicting writes, and merging that afterwards is not a
procedure, it is a negotiation. Whatever promotes a replica must be certain
the old primary is gone.

## References

- https://www.postgresql.org/docs/current/warm-standby.html
- https://www.postgresql.org/docs/current/monitoring-stats.html
- https://www.postgresql.org/docs/current/runtime-config-replication.html
- https://dev.mysql.com/doc/refman/8.0/en/replication.html
- https://en.wikipedia.org/wiki/Replication_(computing)
