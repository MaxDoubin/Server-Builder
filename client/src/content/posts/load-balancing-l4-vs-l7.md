
## The distinction in one line

A layer 4 load balancer forwards connections. A layer 7 load balancer understands requests.

Everything else follows from that. What it can route on, how well it can health check, whether it can retry, what it does to TLS, and how much it costs you in latency and CPU.

## What each layer sees

At layer 4 the balancer picks a backend based on the connection's five tuple: source address and port, destination address and port, protocol. It then forwards packets. It does not parse the payload, and for most designs it does not need to.

Consequences:

- Very fast and cheap, since there is no parsing and often no re-assembly.
- Protocol agnostic. It will balance anything over TCP or UDP, not just HTTP.
- Once a connection is established it is pinned to one backend for its lifetime. A long lived connection cannot be rebalanced.
- Health checks can only be shallow. "Does the port accept a connection" is not the same question as "is the application working", and a backend that accepts connections while returning errors will keep getting traffic.
- No retries. If a backend fails mid connection, the client sees the failure.

At layer 7 the balancer terminates the client connection, parses the request, and makes a routing decision with full knowledge of it. For HTTP that means path, host header, method, cookies, and headers.

Consequences:

- Routing by content: send `/api/` to one pool and `/static/` to another.
- Real health checks: request a specific endpoint, check the status code and optionally the body.
- Retries and failover on a per request basis, so a single backend failure can be invisible to the client.
- Per request load balancing, which matters enormously for multiplexed protocols where one connection carries many requests. At layer 4, ten requests over one connection all land on the same backend.
- Header manipulation, compression, rate limiting, and request logging with real detail.
- Cost: it terminates and re-establishes connections, parses everything, and uses meaningfully more CPU.

## Health checks are the actual product

I would argue the health check is the most important thing a load balancer does, more than the balancing algorithm. Round robin versus least connections rarely decides an outage. Sending traffic to a broken backend always does.

Three levels, and pick deliberately:

- **Port check**: the socket accepts. Detects a dead process. Misses everything else.
- **Application check**: an HTTP endpoint returns 200. Detects a process that is up but broken.
- **Deep check**: the endpoint verifies the backend's own dependencies, database connectivity and so on, before answering.

Deep checks have a trap. If every backend deep checks the same shared database and that database has a blip, every backend fails its check simultaneously and the load balancer removes the entire pool. Now a degraded system is a completely dead system. I keep the load balancer check shallow enough that it never removes everything, and I separate "should I get traffic" from "am I fully healthy" into two different endpoints.

## Both modes, one config

HAProxy makes the difference explicit, since `mode tcp` and `mode http` are the same software behaving as either kind of balancer.

```
global
    log stdout format raw local0 info
    maxconn 20000

defaults
    log     global
    timeout connect 5s
    timeout client  60s
    timeout server  60s
    retries 3

# Layer 4: pass an arbitrary TCP protocol through, TLS untouched.
frontend pg_read
    bind 10.10.0.5:5432
    mode tcp
    option tcplog
    default_backend pg_replicas

backend pg_replicas
    mode tcp
    balance leastconn
    option tcp-check
    server pg1 10.10.1.11:5432 check inter 3s fall 3 rise 2
    server pg2 10.10.1.12:5432 check inter 3s fall 3 rise 2

# Layer 7: terminate TLS, route by path, retry idempotent requests.
frontend web
    bind 10.10.0.5:443 ssl crt /etc/haproxy/certs/site.pem alpn h2,http/1.1
    mode http
    option httplog
    http-request set-header X-Forwarded-Proto https
    http-request set-header X-Forwarded-For %[src]
    acl is_api path_beg /api/
    use_backend api_pool if is_api
    default_backend web_pool

backend api_pool
    mode http
    balance leastconn
    option httpchk GET /healthz
    http-check expect status 200
    retry-on all-retryable-errors
    server api1 10.10.2.21:8080 check inter 2s fall 3 rise 2
    server api2 10.10.2.22:8080 check inter 2s fall 3 rise 2

backend web_pool
    mode http
    balance roundrobin
    option httpchk GET /healthz
    http-check expect status 200
    server web1 10.10.2.31:8080 check inter 2s fall 3 rise 2
    server web2 10.10.2.32:8080 check inter 2s fall 3 rise 2
```

Note `fall 3 rise 2`: three consecutive failures to remove a backend, two successes to bring it back. Asymmetric on purpose. Slow to eject on a transient blip, and cautious about returning a backend that just came back.

## TLS: terminate, re-encrypt, or pass through

**Terminate** at the balancer. Simplest, gives you full layer 7 features, centralizes certificates, and leaves traffic in the clear behind the balancer.

**Re-encrypt**: terminate, inspect, then open a new TLS connection to the backend. Full features plus encryption on the internal hop. Costs double the crypto work.

**Pass through**: forward the encrypted stream untouched at layer 4. End to end encryption and backends see real client certificates, but you get no layer 7 features at all, because you cannot read what you are forwarding.

You cannot have both content routing and untouched end to end TLS. That is not a product limitation, it is arithmetic.

## How I choose

If it speaks HTTP and I want observability, retries, and path routing, layer 7. If it is a database protocol, a game server, or anything where I need raw throughput and end to end encryption, layer 4. Plenty of real deployments run both, with a fast layer 4 tier in front distributing to layer 7 proxies behind it.

## References

- [HAProxy documentation](https://docs.haproxy.org/)
- [nginx stream module documentation](https://nginx.org/en/docs/stream/ngx_stream_core_module.html)
- [nginx upstream module documentation](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
- [Load balancing on Wikipedia](https://en.wikipedia.org/wiki/Load_balancing_(computing))
