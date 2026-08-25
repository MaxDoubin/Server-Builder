
## Why a Reverse Proxy

Without a reverse proxy, every service in your lab needs its own port. Accessing Grafana is port 3000, Proxmox is 8006, your web apps are on random ports. A reverse proxy sits in front of all these services and routes traffic based on the hostname in the request. You access everything on port 443 with a proper domain name.

It also centralizes TLS. Instead of managing certificates on each service, you terminate TLS at the proxy and forward unencrypted traffic internally.

That last sentence hides a real security decision. Traffic between the proxy and the backend is now plaintext on the wire. On a single host where the backend listens on `127.0.0.1` that is fine, because the packets never leave the loopback interface. Across a VLAN shared with anything you do not fully control, it is not, and you either need `proxy_pass https://...` to a backend with its own certificate or a network segment you trust.

## Basic Nginx Configuration

```nginx
# /etc/nginx/sites-available/grafana
server {
    listen 443 ssl;
    server_name grafana.lab.internal;

    ssl_certificate /etc/nginx/ssl/lab.crt;
    ssl_certificate_key /etc/nginx/ssl/lab.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Those four `proxy_set_header` lines are not optional decoration. By default nginx sends `Host: $proxy_host`, which is the literal `127.0.0.1:3000` from the `proxy_pass` line. A backend that builds absolute URLs, and Grafana is one, will then redirect your browser to `http://127.0.0.1:3000/login` and the login loop begins. Setting `Host $host` fixes it. Note that `$host` is the hostname without the port and `$http_host` is the raw header including the port, so use `$http_host` only if the backend genuinely needs to see a non-standard port.

`X-Forwarded-Proto` matters for the same reason. Without it the backend sees a plain HTTP request, decides the user is not on HTTPS, and either redirects to HTTPS (a loop, since the proxy already terminated it) or refuses to set a `Secure` cookie.

`X-Forwarded-For` deserves a warning. `$proxy_add_x_forwarded_for` appends `$remote_addr` to whatever the client already sent, and nginx does not validate any of it. If your nginx is directly internet-facing, a client can send a forged `X-Forwarded-For` header and your backend will happily log or trust it. At the trust boundary, overwrite rather than append: `proxy_set_header X-Forwarded-For $remote_addr;`. The `X-` headers are also de-facto convention, not a standard. RFC 7239 defines a single standardized `Forwarded` header that carries the same information; most software still expects the `X-` versions.

Three defaults will bite you before anything else does:

- `proxy_read_timeout` defaults to `60s`. Any long-poll, streaming response, or slow report generation dies at exactly sixty seconds with a 504. If failures cluster suspiciously around one minute, this is why.
- `proxy_connect_timeout` also defaults to `60s`, and the nginx documentation notes it "cannot usually exceed 75 seconds" because of the operating system's own TCP connect timeout. Raising it past 75 does nothing.
- `client_max_body_size` defaults to `1m`. Uploads larger than a megabyte return `413 Request Entity Too Large` from nginx, which never reaches the backend, so the backend logs are empty and you waste an hour looking in the wrong place.

Learn to read the two error codes. A `502 Bad Gateway` means nginx could not get a usable response: the backend is down, refused the connection, or sent something malformed. A `504 Gateway Timeout` means the backend accepted the connection and then did not answer in time. They point at completely different problems.

## WebSocket Support

Some services (Proxmox console, Grafana live updates) use WebSockets. Add these lines to the location block:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

All three are required. nginx proxies with HTTP/1.0 by default, and the `Upgrade` mechanism that RFC 6455 uses to turn an HTTP request into a WebSocket only exists in HTTP/1.1. Miss `proxy_http_version 1.1` and the handshake fails with a `400` or the connection just closes.

The symptom of a half-configured WebSocket proxy is distinctive: the page loads perfectly and then nothing updates. The Proxmox noVNC console shows a black rectangle, Grafana dashboards render once and freeze. Check the browser console for a failed `wss://` connection before you suspect the application.

Even with the handshake working, `proxy_read_timeout 60s` closes an idle WebSocket after a minute. Raise it in the WebSocket location, or make sure the application sends pings.

## Internal PKI

For a homelab, create your own Certificate Authority. Add its certificate to your browser's trusted CAs, and all your internal services get valid HTTPS without certificate warnings.

```bash
# Create a CA key and certificate
openssl req -x509 -nodes -newkey rsa:4096 -keyout ca.key   -out ca.crt -days 3650 -subj "/CN=Lab CA"
```

That gives you the CA. The certificate you actually serve is a separate one, signed by it, and here is where nearly everyone gets stuck: a `/CN=grafana.lab.internal` subject is not enough. Chrome stopped honouring Common Name for hostname matching in 2017 and every current browser requires a `subjectAltName` extension. A certificate without SAN produces `ERR_CERT_COMMON_NAME_INVALID` no matter how correctly you installed the CA.

```bash
# Server key and CSR
openssl req -nodes -newkey rsa:2048 -keyout grafana.key \
  -out grafana.csr -subj "/CN=grafana.lab.internal"

# Sign it, with a SAN, valid under 398 days
openssl x509 -req -in grafana.csr -CA ca.crt -CAkey ca.key \
  -CAcreateserial -out grafana.crt -days 397 \
  -extfile <(printf "subjectAltName=DNS:grafana.lab.internal")
```

The 397 day figure is not arbitrary. Apple platforms reject TLS server certificates with a validity period longer than 398 days, so a lab certificate issued for ten years works in Firefox on your desktop and fails on every iPhone in the house. Ten years is fine for the CA itself, which is not subject to that limit.

One more nginx-specific detail: `ssl_certificate` must point at the leaf certificate followed by any intermediates, concatenated into one file, leaf first. If you serve only the leaf, browsers that have cached the intermediate from another site will succeed while `curl`, `openssl s_client`, and Java clients fail with an unknown-issuer error. An inconsistent failure across clients almost always means an incomplete chain.

Finally, `ssl_ciphers HIGH:!aNULL:!MD5` is the nginx default and is looser than it looks; it still permits CBC and 3DES suites on many OpenSSL builds. It also has no effect on TLS 1.3, whose cipher suites are configured separately in OpenSSL. Use the Mozilla intermediate list if you want a defensible setting.

## Rate Limiting

Add basic rate limiting to prevent abuse:

```nginx
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}

location /api/ {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://backend;
}
```

`limit_req_zone` has to live in the `http` block; `limit_req` goes in `http`, `server`, or `location`. Putting the zone directive inside a `server` block is a config-test failure, not a runtime one, so always run `nginx -t` before `systemctl reload nginx`.

The `10m` is a shared memory zone, and the documentation gives you the arithmetic: a state occupies 64 bytes on 32-bit platforms and 128 bytes on 64-bit, so one megabyte holds about 16 thousand 64-byte states or about 8 thousand 128-byte states. On a 64-bit server, `10m` tracks roughly 80,000 source addresses. When the zone fills, the least recently used entry is evicted. `$binary_remote_addr` rather than `$remote_addr` is deliberate: it stores the raw 4 or 16 bytes instead of the text form.

`rate=10r/s` is enforced as a leaky bucket at millisecond resolution, meaning one request per 100 ms, not ten requests at the top of each second. `burst=20` allows a queue of twenty excess requests, and `nodelay` serves those immediately rather than spacing them out. Past the burst, nginx returns `503` by default; `limit_req_status 429;` gives clients the more accurate status.

The failure mode that matters: if nginx sits behind Cloudflare, another proxy, or a NAT gateway, `$binary_remote_addr` is the address of that intermediary. Every one of your users shares a single bucket, and legitimate traffic starts getting 503s at ten requests per second in total. The fix is the real IP module, `set_real_ip_from <proxy CIDR>;` plus `real_ip_header X-Forwarded-For;`, which rewrites `$remote_addr` to the true client before the limit is evaluated.

## Where Nginx Stops

Open source nginx has passive upstream health checking only. `max_fails` (default 1) and `fail_timeout` (default 10s) mark a backend unavailable after a failed real request, which means one user eats an error before the backend is taken out. Active health checks that probe a backend before sending it traffic are an nginx Plus feature. HAProxy does active checks in its free version, and that is a legitimate reason to pick it instead.

Nginx is also not a web application firewall, not an identity provider, and not a certificate manager. For request inspection you add ModSecurity or run something purpose-built in front; for authentication you use `auth_request` with a service like oauth2-proxy; for certificates you run certbot or use Caddy, which does ACME automatically. Reaching for nginx configuration to solve those is how you end up with a thousand-line config nobody can safely change.

## References

- https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
- https://nginx.org/en/docs/http/websocket.html
- https://nginx.org/en/docs/http/configuring_https_servers.html
- https://www.rfc-editor.org/rfc/rfc7239
- https://docs.openssl.org/3.0/man1/openssl-req/
