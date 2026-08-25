
## What a connection actually costs

On PostgreSQL every client connection is a separate backend process. Forking
it costs time, and it carries per-backend memory that is not shared: sort and
hash workspace, catalog caches, prepared statement plans. Add a TLS handshake
and authentication on top and a fresh connection is far more expensive than
the query you wanted to run.

So applications keep connections open and hand them out. That is the pool. The
part people skip is that the pool is also a concurrency limit, and it is
usually the only one in the system. Whatever number you put in the config is
the maximum number of statements your database will ever run at once from that
application.

## Sizing is about the server, not the users

The instinct is to size the pool by expected users. That is backwards. Beyond
a certain point, more concurrent queries do not increase throughput, they just
divide the same CPU and disk into thinner slices while adding lock contention
and context switching. Latency rises for everyone and total work done stays
flat or drops.

Size instead from what the database machine can genuinely do at once: its
CPU cores and its storage parallelism. A pool a small multiple of core count
is a sane starting point for a workload that is mostly CPU-bound in the
database. Workloads dominated by waiting on disk can support somewhat more,
since a waiting backend is not using a core. Then measure.

The number that tells you whether the pool is right is not utilization, it is
how long clients wait to get a connection. If wait time is near zero and the
database is busy, the pool is fine. If wait time is climbing while the
database CPU is nowhere near saturated, something is holding connections
without using them, and the fix is in the application, not the pool size.

Also remember that pools multiply. Ten application instances with a pool of
twenty each is two hundred backends, and the database only sees the total.
Adding replicas of your app quietly raises database concurrency unless you put
an external pooler in the middle.

## An external pooler and its modes

PgBouncer sits between the application and the server and multiplexes many
client connections onto few server connections. The mode matters more than any
other setting.

```ini
[databases]
appdb = host=10.20.0.11 port=5432 dbname=appdb

[pgbouncer]
listen_addr = 10.20.0.5
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 20
max_client_conn = 2000
reserve_pool_size = 5
server_idle_timeout = 300
query_wait_timeout = 10
```

Session mode assigns a server connection for the whole client session, which
is safe but saves you almost nothing beyond avoiding reconnect cost.
Transaction mode returns the server connection at COMMIT, which is where the
real multiplexing happens: two thousand mostly idle clients can share twenty
backends.

Transaction mode has rules. Anything that carries state across transactions
breaks: session-level `SET` that you expect to persist, `LISTEN` and `NOTIFY`,
advisory locks held outside a transaction, temporary tables, and server-side
prepared statements unless the pooler and driver support tracking them. Read
your driver's documentation before switching, because these failures are
intermittent and look like data bugs rather than pool bugs.

## The failure mode to expect

Pool exhaustion almost never comes from too much traffic. It comes from
connections held longer than they should be.

The classic version: a request opens a transaction, then makes an HTTP call to
another service inside it, then commits. Under normal conditions this is
invisible. When the other service slows to a few seconds, every in-flight
request holds a database connection while doing nothing, the pool empties,
and every unrelated query starts queueing behind it. The database looks
perfectly healthy the entire time.

The rules I hold to:

- No network calls inside a transaction, ever.
- Set a statement timeout on the server side, not just in the client, so a
  runaway query cannot hold a backend indefinitely.
- Set an acquisition timeout on the pool, so a request fails fast rather than
  piling up.
- Keep transactions short enough that you would be comfortable seeing them in
  a log.

## Watching it

The database has the answers. This shows what backends are doing and how long
they have been doing it:

```sql
SELECT state,
       count(*) AS conns,
       max(now() - state_change) AS longest
FROM pg_stat_activity
WHERE datname = 'appdb'
GROUP BY state
ORDER BY conns DESC;
```

A large `idle in transaction` count with a growing age is the exhaustion
pattern above, caught before it becomes an outage. A large plain `idle` count
just means your pool is bigger than it needs to be, which wastes memory but
does not hurt much.

Graph three things over time: connections in use, client wait time to acquire,
and the count of idle-in-transaction backends. Those three make almost every
pool problem obvious, and none of them are visible from the application's
error log.

## References

- https://www.postgresql.org/docs/current/runtime-config-connection.html
- https://www.postgresql.org/docs/current/monitoring-stats.html
- https://www.pgbouncer.org/config.html
- https://www.pgbouncer.org/usage.html
- https://en.wikipedia.org/wiki/Connection_pool
