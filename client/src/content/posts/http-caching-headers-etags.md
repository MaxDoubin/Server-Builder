
## Two mechanisms, not one

HTTP caching has exactly two moving parts and people constantly conflate them.

Freshness lets a cache serve a response without asking anyone. The origin
states a lifetime, the cache counts down, and while the response is fresh no
request leaves the cache at all. This is where the speed comes from.

Validation lets a cache ask "is this still good?" cheaply. The cache holds a
stale copy plus a token, sends the token, and the origin answers 304 Not
Modified with no body if nothing changed. This saves bandwidth but still costs
a full round trip.

If you configure validators and no freshness lifetime, every request still
goes to the origin. It will be small and fast, but it is still a round trip
per object, and people are surprised their cache "is not working."

## Cache-Control directives that matter

The response directives worth knowing, from RFC 9111:

- `max-age=N` seconds of freshness for any cache.
- `s-maxage=N` overrides `max-age` for shared caches only. This is how you
  cache aggressively at your reverse proxy while keeping browsers
  conservative.
- `no-cache` does not mean do not store. It means store it, but revalidate
  before every reuse. This is the directive people mean when they reach for
  `no-store`.
- `no-store` means do not write it down anywhere. Use it for genuinely
  sensitive responses, not as a general safety blanket.
- `private` means a browser may cache it but a shared cache must not. Get this
  wrong on a personalized page and one user sees another user's data.
- `immutable` promises the body will never change for this URL, so a client
  should not revalidate even on a reload.
- `stale-while-revalidate=N` from RFC 5861 lets a cache serve a stale copy
  immediately and refresh in the background. It smooths out the latency
  spike every time an object expires.

A response with no explicit lifetime is not automatically uncacheable.
Heuristic freshness lets a cache invent a lifetime from `Last-Modified`. If
you have never thought about caching, intermediaries may already be caching
your responses for durations you did not choose. Being explicit is the point.

## Validators and the 304 flow

An `ETag` is an opaque token for a specific representation. A strong ETag
promises byte-for-byte identity. A weak one, written `W/"..."`, promises only
semantic equivalence, which is what you want if your server gzips at varying
compression levels or reorders equivalent content.

```
HTTP/1.1 200 OK
ETag: "9f2c4a1e"
Last-Modified: Wed, 15 Jul 2026 09:11:04 GMT
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

The client comes back with `If-None-Match: "9f2c4a1e"` and gets a 304 with no
body if the tag still matches. `Last-Modified` and `If-Modified-Since` do the
same job with one-second resolution, which is too coarse for anything that
changes often. Send both when you can, prefer the ETag, and never generate an
ETag from something unstable across your own servers. A tag derived from an
inode number will differ between two load-balanced backends serving identical
files, and every request will miss.

Range requests use validators too. `If-Range` lets a client resume a partial
download only if the resource has not changed underneath it.

## The cache key and Vary

A cache stores responses under a key. By default that key is the method and
the URL, and nothing else. `Vary` adds request headers to the key.

```
Vary: Accept-Encoding
```

That is almost always correct and almost always necessary if you compress.
Without it a cache may hand a gzipped body to a client that did not ask for
one.

`Vary: Cookie` is technically correct for personalized responses and
practically useless, because it splits the cache into one entry per distinct
cookie value, which is one entry per user. If a response depends on identity,
mark it `private` and stop trying to cache it in a shared tier.
`Vary: User-Agent` has the same problem multiplied by the number of browser
build strings in the world.

## Making it concrete at the proxy

```nginx
location /static/ {
    # content-hashed filenames: safe to cache forever
    add_header Cache-Control "public, max-age=31536000, immutable";
    etag on;
}

location /api/ {
    proxy_pass http://app_backend;
    proxy_cache api_zone;
    proxy_cache_key "$request_method$scheme$host$request_uri";
    proxy_cache_valid 200 30s;
    proxy_cache_use_stale updating error timeout;
    proxy_cache_background_update on;
    proxy_cache_lock on;
    add_header X-Cache-Status $upstream_cache_status;
}
```

`proxy_cache_lock` is the one people leave off. Without it, an expired hot
object lets every concurrent request through to the backend at the same
moment. With it, one request refreshes and the rest wait.

The `X-Cache-Status` header is how you debug any of this. Ask for the same
object twice and read it:

```bash
curl -sSI https://example.org/api/items | grep -Ei 'x-cache|cache-control|etag|age'
```

`Age` tells you how long the shared cache has held the response. If `Age`
never grows, nothing is being reused and your lifetime is not being applied.

## The pattern I default to

Content-addressed assets, meaning filenames containing a hash of the content,
get a one-year `max-age` plus `immutable`. Changing the content changes the
URL, so there is no invalidation problem to solve.

HTML and API responses get a short `s-maxage`, a real ETag, and
`stale-while-revalidate` so an expiry does not become a latency spike.
Anything user-specific gets `private` and never enters the shared tier. That
covers most of what a normal service serves, and it fails safe: the worst
outcome is a few seconds of staleness on a shared object, not one account
seeing another account's page.

## References

- https://www.rfc-editor.org/rfc/rfc9111
- https://www.rfc-editor.org/rfc/rfc9110
- https://www.rfc-editor.org/rfc/rfc5861
- https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- https://en.wikipedia.org/wiki/HTTP_ETag
