
## Four algorithms, and what each one gets wrong

**Fixed window** counts requests per calendar minute and resets. It is one
counter and one expiry, which is why everyone starts here. It also allows
double your intended rate across a window boundary: a client can spend the
whole budget in the last second of one window and the whole budget in the
first second of the next.

**Sliding window log** stores a timestamp per request and counts the ones
inside the trailing window. Exact, and it costs memory proportional to the
rate multiplied by the window, per client. Fine for expensive endpoints with
low limits, bad as a general purpose front door.

**Sliding window counter** keeps the current and previous fixed window counts
and interpolates between them by how far into the current window you are. It
is an approximation, it costs two integers, and it removes the boundary burst.
This is the pragmatic default for HTTP APIs.

**Token bucket** refills tokens at a constant rate up to a cap. A request
takes tokens if any are available. Rate and burst are separate knobs, which is
the property the other three lack, and it is why the algorithm turns up
everywhere from API gateways to traffic shapers.

```python
import time


class TokenBucket:
    '''Allow `rate` operations per second, tolerating bursts of `burst`.'''

    def __init__(self, rate, burst):
        self.rate = float(rate)
        self.capacity = float(burst)
        self.tokens = float(burst)
        self.updated = time.monotonic()

    def allow(self, cost=1.0):
        now = time.monotonic()
        self.tokens = min(
            self.capacity, self.tokens + (now - self.updated) * self.rate
        )
        self.updated = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

    def retry_after(self, cost=1.0):
        '''Seconds until `cost` tokens exist. Send this to the client.'''
        deficit = max(0.0, cost - self.tokens)
        return deficit / self.rate if self.rate else float("inf")
```

Note that there is no background timer. Tokens are computed lazily from the
elapsed time on each call, which is what makes the algorithm cheap enough to
run per client in a hot path. The monotonic clock matters: with wall clock
time, an NTP step backwards makes the bucket refill negative tokens.

A leaky bucket is the same picture inverted. Instead of tokens accumulating
for the client to spend, requests fill a queue that drains at a fixed rate.
Token bucket permits bursts and rejects excess. Leaky bucket smooths output
and delays excess. Use the first at an API edge where clients can retry, and
the second where a downstream system genuinely cannot absorb a spike.

## The identity question is harder than the algorithm

Every limiter needs a key, and the key is where the design actually lives.

Source IP is the default and it is wrong in both directions. Carrier grade
NAT, campus networks, and corporate egress put thousands of unrelated users
behind one address, so an IP limit that protects you also locks out a school.
Meanwhile a single attacker with a pool of addresses is not limited at all,
and IPv6 hands out enormous per customer allocations, so if you must limit by
IPv6 address, limit by a /64 rather than a /128.

Better keys, in rough order of preference: authenticated account or API key,
then session, then IP as a fallback for unauthenticated traffic only. Do not
trust a forwarded client address header unless the request arrived from a
proxy you operate, and strip that header at your edge so a client cannot set
it themselves.

Then layer the limits. One per account for fairness, one per IP for abuse, and
one global concurrency cap so a single popular customer cannot take the
service down while remaining inside their own quota.

## Not all requests cost the same

A rate limit counting requests treats a cheap lookup and an expensive report
identically. Two fixes.

Weight the cost. The token bucket above takes a `cost` argument for exactly
this reason: charge an expensive endpoint more tokens.

More importantly, for anything with variable and long service times, limit
concurrency rather than rate. A rate limit says "ten per second" and says
nothing about how many are in flight. If each takes thirty seconds you now
have three hundred concurrent requests, all of your workers, and a queue. A
semaphore with a hard ceiling and a short acquisition timeout is the control
that actually protects the resource.

## Tell the client what happened

Rejecting a request without explanation guarantees a retry storm. Return 429,
not 500, so clients and their libraries can distinguish "you are going too
fast" from "we are broken". Include `Retry-After` with a real number derived
from the limiter state rather than a constant, otherwise every rejected client
retries at the same moment.

At the edge, the same thing declaratively:

```nginx
limit_req_zone $binary_remote_addr zone=perip:10m rate=10r/s;
limit_req_status 429;
limit_req_log_level warn;

server {
    location /api/ {
        # Allow a burst of 20 to pass immediately, reject beyond that
        limit_req zone=perip burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

`burst` without `nodelay` queues and delays. `burst` with `nodelay` allows the
burst through immediately and rejects the rest. The first is a leaky bucket,
the second is a token bucket, and the difference is one keyword that people
copy without reading.

Two last things I would not skip. Run new limits in a log only mode first and
look at how many real users you would have rejected, because the first
production limit is almost always too tight. And keep an allowlist for your
own health checks and monitoring, because the day you throttle your own
probes is the day the dashboard goes green during an outage.

## References

- [Token bucket](https://en.wikipedia.org/wiki/Token_bucket)
- [Leaky bucket](https://en.wikipedia.org/wiki/Leaky_bucket)
- [RFC 6585: Additional HTTP Status Codes](https://www.rfc-editor.org/rfc/rfc6585)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [nginx ngx_http_limit_req_module](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)
- [OWASP Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
