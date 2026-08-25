/*
  Service worker for maxdoubin.com.
  Purpose: let someone keep reading a blog post they already opened when the
  connection drops, and make repeat visits cheap. Nothing more than that.

  A service worker outlives the deploy that installed it, so the failure mode
  for getting this wrong is not "the offline page looks bad", it is "every
  returning visitor sees a permanently broken site and cannot clear it
  themselves". The rules below exist because of that.

  1. CACHE_VERSION is part of every cache name, and activate deletes every
     cache this version does not own. Bumping the version is therefore a full
     reset, and stale entries can never accumulate across deploys.

  2. HTML IS NEVER SERVED CACHE-FIRST. This is the one that bricks sites.
     A prerendered document hard-codes content-hashed asset filenames
     (/assets/index-CV8h2284.js). After a redeploy those files are gone. Serve
     a cached document first and the browser asks for asset URLs that now 404,
     the entry script never runs, and the visitor gets a blank page on every
     load until they clear site data. Navigations go to the network first and
     only fall back to cache when the network actually fails, which means an
     old document is only ever shown to someone who is offline, and it is a
     strict improvement over the browser's own error page.

  3. Cache-first is correct for /assets/* precisely because those names are
     content-hashed: the URL changes whenever the bytes do, so a hit can never
     be stale. Images are cache-first too, with a bounded cache. Their paths
     are not hashed, so a replaced cover can be served stale until the next
     version bump. That is a deliberate trade for offline reading.

  4. Only same-origin GET is touched. Cross-origin (Google Fonts) is left
     alone: caching opaque responses burns quota and tells us nothing about
     whether they succeeded. Offline, type falls back to the system stack.

  5. /api/* is skipped. Those calls are answered inside the page by
     lib/local-api, and a cached API response would be a correctness bug.

  6. skipWaiting plus clients.claim, so a fix ships on the next load rather
     than waiting for every tab to close. Safe here only because of rule 2:
     a newly activated worker has empty caches, and every miss falls through
     to the network.
*/

const CACHE_VERSION = "v1";
const PAGES_CACHE = `maxdoubin-pages-${CACHE_VERSION}`;
const ASSETS_CACHE = `maxdoubin-assets-${CACHE_VERSION}`;
const IMAGES_CACHE = `maxdoubin-images-${CACHE_VERSION}`;

const OWNED_CACHES = [PAGES_CACHE, ASSETS_CACHE, IMAGES_CACHE];

// Bound the image cache. 236 post covers at roughly 300KB each would be 70MB
// of someone's disk quota for a portfolio site, and hitting the quota makes
// every later cache.put reject.
const IMAGE_CACHE_LIMIT = 80;

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i;

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0a0b0d;color:#e8e8e6;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
       padding:24px;text-align:center}
  h1{font-size:15px;letter-spacing:.24em;text-transform:uppercase;color:#c3f53c;margin:0 0 12px}
  p{margin:0;color:#8a8a86;max-width:32em}
</style></head>
<body><div><h1>Offline</h1>
<p>This page has not been visited before, so there is no local copy of it.
Reconnect and reload.</p></div></body></html>`;

// ---------------------------------------------------------------------------
// install: take over as soon as possible, and warm the shell so the very first
// offline navigation has something to fall back to.
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGES_CACHE);
        // Only the home document. Anything larger is guesswork about what the
        // visitor will read, and a failed precache must not block install.
        await cache.add(new Request("/", { cache: "reload" }));
      } catch {
        // Offline at install time, or storage refused. Not fatal: the worker
        // still installs and fills its caches from real traffic.
      }
      await self.skipWaiting();
    })(),
  );
});

// ---------------------------------------------------------------------------
// activate: drop every cache that is not one of this version's, then claim
// open pages. The "not in OWNED_CACHES" test rather than a prefix match also
// clears caches left behind by any earlier naming scheme.
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => !OWNED_CACHES.includes(name))
            .map((name) => caches.delete(name)),
        );
      } catch {
        // Nothing we can do; serving from the network still works.
      }
      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Anything not answered with event.respondWith() below falls straight
  // through to the browser's normal networking, which is the safe default.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  // Range requests (media seeking) need a 206, and a cached 200 cannot answer
  // one. Leave them entirely alone.
  if (request.headers.has("range")) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(event, request));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event, request, ASSETS_CACHE, 0));
    return;
  }

  if (request.destination === "image" || IMAGE_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(event, request, IMAGES_CACHE, IMAGE_CACHE_LIMIT));
    return;
  }

  // feed.xml, sitemap.xml, the manifest, security.txt: small, rarely read,
  // and always worth being current. Untouched.
});

/**
 * Documents. Network wins whenever it answers at all; the cache is a fallback
 * for a failed request, never a shortcut past one. See rule 2 at the top.
 */
async function networkFirst(event, request) {
  let cache = null;
  try {
    cache = await caches.open(PAGES_CACHE);
  } catch {
    // Storage unavailable (private mode, quota policy). Straight to network.
    return fetch(request);
  }

  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      event.waitUntil(putSafely(cache, request, response.clone()));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Unvisited page while offline. The home document at least renders the
    // shell and the nav, which beats a browser error.
    const shell = await cache.match("/");
    if (shell) return shell;

    return new Response(OFFLINE_HTML, {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

/**
 * Hashed assets and images. A hit is returned without touching the network;
 * a miss is fetched and stored.
 */
async function cacheFirst(event, request, cacheName, limit) {
  let cache = null;
  try {
    cache = await caches.open(cacheName);
  } catch {
    return fetch(request);
  }

  const cached = await cache.match(request);
  if (cached) return cached;

  // No catch here on purpose: if the network fails and we have no copy, the
  // request should fail exactly as it would with no service worker installed,
  // so the page's own error handling (App.tsx retries chunk loads) still sees
  // a real network error rather than a synthesised response.
  const response = await fetch(request);
  if (isCacheable(response)) {
    event.waitUntil(
      putSafely(cache, request, response.clone()).then(() =>
        limit > 0 ? trimCache(cacheName, limit) : undefined,
      ),
    );
  }
  return response;
}

/**
 * Only store a plain, successful, same-origin response. "basic" excludes
 * opaque cross-origin responses, and the no-store check honours anything the
 * origin explicitly marked uncacheable.
 */
function isCacheable(response) {
  if (!response || !response.ok || response.type !== "basic") return false;
  const control = response.headers.get("Cache-Control") || "";
  return !control.includes("no-store");
}

async function putSafely(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch {
    // Quota exceeded or the entry is not storable. Never let this reject into
    // the fetch handler.
  }
}

/**
 * Keep the newest `limit` entries. cache.keys() returns insertion order, so
 * dropping from the front is a rough LRU: good enough, and far cheaper than
 * tracking access times.
 */
async function trimCache(cacheName, limit) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const excess = keys.length - limit;
    if (excess <= 0) return;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    // Trimming is housekeeping; failing it must not break a response.
  }
}
