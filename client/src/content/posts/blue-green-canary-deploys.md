
## Two strategies, one goal

Both techniques exist to separate two events that a naive deploy welds
together: putting new code on machines, and sending users to it. Once those
are separate you can undo the second without redoing the first, and undoing is
what you need at three in the morning.

Blue-green runs two complete environments. Blue is live, green gets the new
version, you verify green in isolation, then you move all traffic at once.
Rollback is moving it back, and it takes as long as a config reload.

Canary keeps one environment and shifts traffic gradually. A small percentage
goes to the new version, you watch, you increase, or you abort. The exposure
during a bad release is bounded by the percentage rather than by how fast
someone notices.

## What blue-green buys and costs

The appeal is the rollback. The old version is not deprovisioned, not scaled
down, and not partially upgraded. It is sitting there fully warmed with its
caches and connections intact, and going back is a routing change.

The cost is double capacity for the duration, which is cheap on elastic
infrastructure and expensive on hardware you own. The subtler cost is that a
cutover is all or nothing. If the new version has a defect that only appears
under real production traffic, every user meets it simultaneously. You find
out fast, but everyone found out with you.

Blue-green is the right choice when the change is hard to evaluate on a slice,
when you need a clean cutover for correctness reasons, or when you cannot
tolerate two versions writing to the same data at once.

```nginx
upstream app_blue  { server 10.20.0.41:8080; server 10.20.0.42:8080; }
upstream app_green { server 10.20.0.51:8080; server 10.20.0.52:8080; }

# flip this one line and reload
upstream app_live  { server 10.20.0.41:8080; server 10.20.0.42:8080; }

server {
    listen 443 ssl;
    location / { proxy_pass http://app_live; }

    # verification path, not routed to real users
    location /__green/ { proxy_pass http://app_green/; allow 10.20.0.0/24; deny all; }
}
```

The staging path that points at the idle environment is the part worth
copying. It lets you run the real health and smoke checks against the real
deployment, in the real network, before anyone touches it.

## What canary buys and costs

Canary limits blast radius. Send two percent of traffic to the new version,
and a serious defect affects two percent of requests for the length of the
observation window rather than one hundred percent until someone reacts.

It also gives you a controlled comparison. Both versions serve real traffic at
the same moment under the same conditions, so you can compare their error
rates and latencies directly rather than against yesterday's numbers under
yesterday's load.

The cost is time and discipline. A canary that advances on a timer without
looking at anything is a slow deploy, not a safe one. You need metrics with
enough volume to be meaningful at the canary percentage, and abort criteria
written down before the deploy starts.

```bash
#!/usr/bin/env bash
set -euo pipefail

for pct in 2 10 25 50 100; do
  ./set-canary-weight.sh "$pct"
  echo "canary at ${pct}%, observing"
  sleep 300

  err=$(./query-metric.sh 'canary_error_ratio')
  p99=$(./query-metric.sh 'canary_latency_p99_ms')

  if (( $(echo "$err > 0.01" | bc -l) )) || (( $(echo "$p99 > 800" | bc -l) )); then
    echo "abort: err=${err} p99=${p99}"
    ./set-canary-weight.sh 0
    exit 1
  fi
done
echo "promoted"
```

Note the thresholds are named as constants in one place and the abort is
automatic. A human deciding "that looks a bit high" at each step will approve
a bad release eventually, usually late in the day.

## The database is where both strategies break

Neither technique helps you if the two versions cannot coexist against one
schema. During any gradual rollout, and during the rollback window of a
blue-green cutover, old and new code are both live against the same data.

The discipline is expand then contract, across at least three deploys:

Expand. Add the new column as nullable, add the new table, add the new enum
value. Deploy the schema change alone. Old code ignores it entirely.

Migrate and dual write. New code writes both the old and new shape and reads
whichever is authoritative. Backfill existing rows in batches. Both versions
work against this schema, which is the property that makes rollback safe.

Contract. Only after the old version is genuinely gone and you are confident
you will not roll back to it, stop writing the old shape and drop it. This is
a separate deploy, usually days later.

The rule I hold to: a schema change must never be in the same deploy as the
code that requires it. Breaking that rule is how a rollback becomes an
incident, because the code went back and the data did not.

Two other things that must be backward compatible during any overlap: message
formats on queues, since a canary may produce messages the old consumers read,
and cached values, since two versions sharing a cache with different
serialization will read each other's entries.

## How I would choose

Small, frequent, behavior-affecting changes to a service with real traffic
volume: canary. The whole value is catching what testing did not, on a slice,
with automatic abort.

Infrastructure-level changes, runtime or dependency upgrades, anything where
running two versions simultaneously is itself the risk: blue-green, with a
thorough verification pass against the idle environment first.

Low traffic services: blue-green, because a two percent canary on low volume
produces too few requests to detect anything, and you have a rollback rather
than a statistically meaningless observation window.

And in every case, the deploy is not done when the code is live. It is done
when someone has confirmed the thing works and the rollback path has been
tested at least once on purpose, at a time of your choosing, rather than for
the first time during an outage.

## References

- https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
- https://nginx.org/en/docs/http/ngx_http_upstream_module.html
- https://en.wikipedia.org/wiki/Blue-green_deployment
- https://en.wikipedia.org/wiki/Continuous_delivery
- https://en.wikipedia.org/wiki/Feature_toggle
