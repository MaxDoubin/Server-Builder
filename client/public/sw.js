/*
  Service worker for maxdoubin.com.

  Purpose: let someone keep reading an article they already opened when the
  connection drops, make repeat visits instant, and give the installed app
  something to boot from with no network at all. Nothing more than that.

  A service worker outlives the deploy that installed it, so the failure mode
  for getting this wrong is not "the offline page looks bad", it is "every
  returning visitor sees a permanently broken site and cannot clear it
  themselves". Every rule below exists because of a specific way that happens.

  1. CACHE_VERSION is part of every cache name, and activate deletes every
     cache this version does not own. Bumping the version is a full reset, so
     stale entries cannot accumulate across deploys. Bump it whenever the
     shape of what is stored changes, not just when a bug is fixed.

  2. NO HTML DOCUMENT IS EVER SERVED WITHOUT A REVALIDATION BEHIND IT.
     This is the rule that stops sites bricking. A prerendered document hard
     codes content hashed asset filenames (/assets/index-BkpAYz8l.js). After a
     redeploy those files are gone from the CDN. A document served from cache
     with no refresh scheduled would keep asking for asset URLs that now 404,
     forever, and the reader has no way to clear it. So documents are stale
     while revalidate: the cached copy is handed over immediately and a fresh
     one is pulled in the background for next time. The staleness window is
     exactly one page load, never longer.

  3. Even one stale load is capped by MAX_STALE_DOCUMENT_MS. Past that age a
     cached document is treated as a fallback only, and the network goes
     first. A document cached three weeks ago is far more likely to reference
     assets the CDN has dropped than one cached this morning, and the reader
     is more likely to want the current text.

  4. Cache first is correct for /assets/* and for the Google Fonts files
     precisely because those names are content hashed: the URL changes
     whenever the bytes do, so a hit can never be stale and revalidating one
     is pure waste. The hash IS the revalidation. This is also what makes
     rule 2 survivable: when a slightly stale document asks for last deploy's
     chunk, this worker still has that exact file.

  5. EVERY CACHE IS BOUNDED. Nothing here re-installs on a content deploy,
     because sw.js only changes when this file changes, so activate almost
     never runs and cannot be relied on to evict anything. Without a per cache
     ceiling the asset cache grows by a few hundred KB per deploy forever and
     surfaces months later as a QuotaExceededError, at which point every
     cache.put silently fails and the site quietly stops working offline.
     Numbers below are sized against the real build: 336 documents averaging
     30KB, 336 asset files totalling 5.9MB, 471 post covers with a 477KB
     worst case.

  6. Only GET is touched, and cross origin is limited to the two Google Fonts
     hosts. /api/* is skipped: those calls are answered inside the page by
     lib/local-api, and a cached API response would be a correctness bug.

  7. skipWaiting plus clients.claim, so a fix ships on the next load rather
     than waiting for every tab to close. Safe here only because a newly
     activated worker has empty caches and every miss falls through to the
     network.

  8. The offline document is a string in this file rather than a separate
     /offline.html. A fallback that has to be fetched from a cache can be
     missing at exactly the moment it is needed (install ran while offline,
     storage refused the write, the entry got trimmed). A string cannot.
     It also keeps a non route out of dist/public, which the CI checks walk
     expecting every HTML file to be a crawlable page with a canonical.
*/

const CACHE_VERSION = "v2";

const SHELL_CACHE = `maxdoubin-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `maxdoubin-assets-${CACHE_VERSION}`;
const IMAGES_CACHE = `maxdoubin-images-${CACHE_VERSION}`;
const FONTS_CACHE = `maxdoubin-fonts-${CACHE_VERSION}`;
const DATA_CACHE = `maxdoubin-data-${CACHE_VERSION}`;

const OWNED_CACHES = [SHELL_CACHE, ASSETS_CACHE, IMAGES_CACHE, FONTS_CACHE, DATA_CACHE];

/*
  Per cache entry ceilings. See rule 5. Trimming drops from the front of
  cache.keys(), which is insertion order, so the oldest entries go first and
  a deploy's worth of superseded asset hashes ages out on its own.

  Shell: 60 documents at ~30KB is under 2MB, and 60 articles is far more than
  a reader gets through between deploys.
  Assets: 120 covers the five entry files plus a long session of route and
  post body chunks, without ever holding the whole 5.9MB build.
  Images: 80 covers at a 40KB median is around 3MB. The old comment here was
  right that unbounded covers would be 70MB of someone's phone.
  Fonts: 4 families is 4 stylesheets plus their woff2 files.
  Data: search-index.json alone is 532KB, so this one stays tiny.
*/
const CACHE_LIMITS = {
  [SHELL_CACHE]: 60,
  [ASSETS_CACHE]: 120,
  [IMAGES_CACHE]: 80,
  [FONTS_CACHE]: 24,
  [DATA_CACHE]: 8,
};

/*
  Refuse to store anything larger than this. One oversized file can consume
  the whole origin quota by itself, and once the quota is gone every later
  cache.put rejects, including the small ones that matter. The largest thing
  the site legitimately serves today is a 477KB cover, so this only ever
  fires on something that should not be in a cache anyway.
*/
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

/** See rule 3. A day is comfortably longer than a reading session. */
const MAX_STALE_DOCUMENT_MS = 24 * 60 * 60 * 1000;

const FONT_STYLESHEET_ORIGIN = "https://fonts.googleapis.com";
const FONT_FILE_ORIGIN = "https://fonts.gstatic.com";

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i;

/** Vite emits the shell's entry files as /assets/<name>-<hash>.<ext>. */
const ASSET_REFERENCE = /(?:src|href)="(\/assets\/[^"]+)"/g;

/** Guard against a malformed shell document turning install into a crawl. */
const MAX_PRECACHED_ASSETS = 12;

/*
  Static data the app fetches at runtime. Listed explicitly rather than
  matched by extension so that robots.txt, humans.txt, llms.txt, security.txt
  and the 61KB sitemap do not quietly take up quota nobody asked for.

  search-index.json is the one that earns its place: without it the search box
  in an installed app is dead the moment the network is, and with it a reader
  who has searched once can search the whole archive offline.
*/
function isStaticData(url) {
  return (
    url.pathname === "/search-index.json" ||
    url.pathname === "/feed.xml" ||
    url.pathname.startsWith("/data/")
  );
}

/*
  The offline document.

  Colours are the brand tokens from client/src/index.css read literally:
  obsidian #090a0b, graphite #151619, iron #35373b, bone #eeece7, bone dim
  #bfbab0, ash #898d94, signal #ccff00. Literals rather than var() because
  nothing else loads here.

  No external stylesheet and no webfont: this document only ever renders when
  the network has already failed, so anything it has to fetch is one more
  thing that will not arrive. The font stack degrades to the system face,
  which is what the rest of the site does before its webfonts land anyway.
*/
const OFFLINE_DOCUMENT = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#090a0b">
<meta name="robots" content="noindex">
<title>Offline | Max Doubin</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       padding:24px;background:#090a0b;color:#eeece7;
       font:400 15px/1.7 "Space Grotesk",Inter,system-ui,-apple-system,sans-serif;
       -webkit-font-smoothing:antialiased}
  main{max-width:34rem;width:100%}
  .tag{display:inline-flex;align-items:center;gap:.6em;margin:0 0 1.6em;
       font-family:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
       font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ccff00}
  .dot{width:6px;height:6px;border-radius:50%;background:#ccff00;opacity:.85}
  h1{margin:0 0 .5em;font-size:clamp(1.6rem,6vw,2.2rem);line-height:1.1;
     letter-spacing:-.03em;font-weight:500}
  p{margin:0 0 1em;color:#bfbab0}
  .panel{margin:1.8em 0 0;padding:1em 1.1em;border:1px solid #35373b;border-radius:6px;
         background:#151619;color:#898d94;font-size:13px}
  .panel b{color:#eeece7;font-weight:500}
  .row{display:flex;flex-wrap:wrap;gap:.7em;margin-top:1.8em}
  a.btn,button.btn{display:inline-block;padding:.62em 1.15em;border-radius:4px;
       font:inherit;font-size:13px;letter-spacing:.02em;cursor:pointer;
       text-decoration:none;border:1px solid #35373b;background:transparent;color:#eeece7}
  button.btn{border-color:#ccff00;color:#090a0b;background:#ccff00}
  a.btn:hover{border-color:#898d94}
  button.btn:hover{filter:brightness(1.08)}
  .fine{margin-top:2.2em;font-family:"JetBrains Mono",ui-monospace,monospace;
        font-size:11px;letter-spacing:.06em;color:#898d94}
</style></head>
<body><main>
  <div class="tag"><span class="dot"></span>No connection</div>
  <h1>This page is not stored on your device.</h1>
  <p>The request could not reach maxdoubin.com, and this page has not been
     opened here before, so there is no local copy to fall back on.</p>
  <div class="panel">
    <b>What still works.</b> Every page you have already read is kept on this
    device and opens normally, offline included. Reconnect and this page will
    load, then it joins them.
  </div>
  <div class="row">
    <button class="btn" type="button" onclick="location.reload()">Try again</button>
    <a class="btn" href="/">Go to the home page</a>
  </div>
  <p class="fine">HTTP 503 &middot; served by the site's own service worker</p>
</main></body></html>`;

/*
  A document this worker synthesises carries only the headers set here, so it
  gets no CSP from _headers. Everything it needs is inline and it loads
  nothing, so the policy can be almost entirely 'none'. no-store keeps a 503
  out of the HTTP cache, where it would outlive the outage that caused it.
*/
function offlineResponse() {
  return new Response(OFFLINE_DOCUMENT, {
    status: 503,
    statusText: "Offline",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
        "img-src 'self' data:; base-uri 'none'; form-action 'none'",
    },
  });
}

// ---------------------------------------------------------------------------
// install
//
// Warm the shell: the home document plus the handful of hashed files it
// references. That is roughly 850KB and it is the difference between an
// installed app that boots offline after one visit and one that needs two,
// because the worker is not controlling the page during the visit that
// registers it and never sees those first asset requests.
//
// This is deliberately not the 336 prerendered pages. Those are 10MB, most of
// them will never be opened, and guessing which ones would be is exactly the
// thing that makes a phone install feel expensive. Everything else is cached
// on visit.
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precacheShell();
      } catch {
        // Offline at install time, or storage refused. Not fatal: the worker
        // still installs and fills its caches from real traffic.
      }
      await self.skipWaiting();
    })(),
  );
});

async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);

  // cache: "reload" so the shell comes from the CDN, not from an HTTP cache
  // entry that may predate the current deploy.
  const request = new Request("/", { cache: "reload" });
  const response = await fetch(request);
  if (!isStorable(response)) return;

  const html = await response.clone().text();
  await shell.put(request, response);

  const references = new Set();
  for (const match of html.matchAll(ASSET_REFERENCE)) {
    references.add(match[1]);
    if (references.size >= MAX_PRECACHED_ASSETS) break;
  }
  if (references.size === 0) return;

  // Default cache mode on purpose: /assets/* is immutable for a year, so the
  // browser answers these from its own HTTP cache with no network at all.
  const assets = await caches.open(ASSETS_CACHE);
  await Promise.all(
    [...references].map(async (path) => {
      try {
        const asset = await fetch(path);
        if (isStorable(asset)) await assets.put(path, asset);
      } catch {
        // One missing chunk must not fail the whole install.
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// activate: drop every cache this version does not own, turn on navigation
// preload, then claim open pages. Testing "not in OWNED_CACHES" rather than
// matching a prefix also clears caches left behind by any earlier naming
// scheme, which a prefix match would miss.
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

      // Starts the network request for a navigation in parallel with waking
      // this worker up, which on a cold phone is 100ms or more off the front
      // of every navigation that has to go to the network. The document
      // handler below always consumes event.preloadResponse, so the browser
      // never has to cancel one and log a warning about it.
      try {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      } catch {
        // Unsupported. fetch() handles the same job, just later.
      }

      await self.clients.claim();
    })(),
  );
});

// ---------------------------------------------------------------------------
// fetch
//
// Anything not answered with event.respondWith() falls straight through to
// the browser's normal networking, which is the safe default for everything
// this worker has no opinion about.
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Range requests (media seeking) need a 206, and a cached 200 cannot answer
  // one. Leave them entirely alone.
  if (request.headers.has("range")) return;

  // Google Fonts. The files are content addressed and immutable, so cache
  // first. The stylesheet that names them needs its own handling, below.
  if (url.origin === FONT_FILE_ORIGIN) {
    event.respondWith(cacheFirst(event, request, FONTS_CACHE));
    return;
  }
  if (url.origin === FONT_STYLESHEET_ORIGIN) {
    event.respondWith(fontStylesheet(event, request));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(documentStrategy(event, request));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(event, request, ASSETS_CACHE));
    return;
  }

  if (request.destination === "image" || IMAGE_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(event, request, IMAGES_CACHE));
    return;
  }

  if (isStaticData(url)) {
    event.respondWith(staleWhileRevalidate(event, request, DATA_CACHE));
    return;
  }

  // sitemap.xml, robots.txt, the manifest, security.txt: small, rarely read,
  // and always worth being current. Untouched.
});

/**
 * Documents. Stale while revalidate inside the freshness window, network
 * first outside it, offline document as the last resort. See rules 2 and 3.
 */
async function documentStrategy(event, request) {
  const cache = await openCache(SHELL_CACHE);
  if (!cache) {
    // Storage unavailable (private mode, a quota policy). Straight through.
    try {
      return await fromNetwork(event, request);
    } catch {
      return offlineResponse();
    }
  }

  const cached = await cache.match(request);

  if (cached && !isOlderThan(cached, MAX_STALE_DOCUMENT_MS)) {
    // Hand over the copy we have and refresh it behind the reader's back, so
    // the next load of this URL is current. One load of staleness, no more.
    event.waitUntil(revalidate(event, request, cache, SHELL_CACHE));
    return cached;
  }

  try {
    const response = await fromNetwork(event, request);
    if (isStorable(response)) {
      event.waitUntil(store(cache, request, response.clone(), SHELL_CACHE));
    }
    return response;
  } catch {
    // Offline. An expired copy still beats an error page by a mile.
    if (cached) return cached;

    /*
      Deliberately NOT falling back to the cached home document here.

      Serving "/" for /blog/some-post leaves the reader's address bar saying
      one thing while the page says another, and once React hydrates it routes
      on the real pathname and tries to load a post body chunk that is not
      cached either, so it fails anyway. The offline document below is the
      honest answer: it says what happened and offers the home page as a link
      the reader chooses to follow.
    */
    return offlineResponse();
  }
}

/**
 * Navigation preload hands back a response that was already in flight while
 * this worker was starting. It resolves to undefined when preload is off or
 * unsupported, which is the normal case on Safari.
 */
async function fromNetwork(event, request) {
  let preloaded;
  try {
    preloaded = await event.preloadResponse;
  } catch {
    // A failed preload is not a reason to skip the ordinary attempt.
    preloaded = undefined;
  }
  return preloaded || fetch(request);
}

/** The background half of stale while revalidate for documents. */
async function revalidate(event, request, cache, cacheName) {
  try {
    const response = await fromNetwork(event, request);
    if (isStorable(response)) await store(cache, request, response, cacheName);
  } catch {
    // Offline, and the reader already has the copy they asked for. Nothing
    // to report and nothing to fix.
  }
}

/**
 * Content hashed assets, same origin images, font files. A hit is returned
 * without touching the network, because the URL cannot outlive its bytes.
 */
async function cacheFirst(event, request, cacheName) {
  const cache = await openCache(cacheName);
  if (!cache) return fetch(request);

  const cached = await cache.match(request);
  if (cached) return cached;

  // No catch here on purpose: if the network fails and there is no copy, the
  // request should fail exactly as it would with no worker installed, so the
  // page's own handling (lazyWithRetry in App.tsx retries chunk loads) still
  // sees a real network error rather than a synthesised response.
  const response = await fetch(request);
  if (isStorable(response)) {
    event.waitUntil(store(cache, request, response.clone(), cacheName));
  }
  return response;
}

/**
 * Small same origin data files. Instant from cache, refreshed behind it, so
 * the search index works offline without ever being more than one load out
 * of date.
 */
async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await openCache(cacheName);
  if (!cache) return fetch(request);

  const cached = await cache.match(request);
  const network = fetch(request).then(async (response) => {
    if (isStorable(response)) {
      await store(cache, request, response.clone(), cacheName);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

/**
 * The Google Fonts stylesheet.
 *
 * The browser asks for this in no-cors mode, so plain fetch(request) can only
 * ever hand back an opaque response: status 0, headers unreadable. A captive
 * portal login page and a real stylesheet are indistinguishable that way, and
 * this site is read on filtered school networks where that is not a
 * hypothetical. Caching the wrong one would wedge the whole site into system
 * fonts until the next CACHE_VERSION bump.
 *
 * The Google Fonts CSS endpoint sends Access-Control-Allow-Origin: *, so
 * asking for the same URL in cors mode gives a response whose status can
 * actually be checked before it is stored. Responding to a no-cors request
 * with a cors response is allowed and the stylesheet applies normally.
 *
 * Stale while revalidate rather than cache first, because unlike the font
 * files this URL is not content addressed: Google reissues it with new
 * gstatic paths when a family is updated.
 */
async function fontStylesheet(event, request) {
  const cache = await openCache(FONTS_CACHE);
  if (!cache) return fetch(request);

  const cached = await cache.match(request);
  const refresh = (async () => {
    const verifiable = new Request(request.url, {
      mode: "cors",
      credentials: "omit",
    });
    const response = await fetch(verifiable);
    if (isStorable(response)) {
      await store(cache, request, response.clone(), FONTS_CACHE);
    }
    return response;
  })();

  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }

  try {
    return await refresh;
  } catch {
    // The cors request was blocked or failed. Hand the browser the ordinary
    // opaque one rather than no stylesheet at all; it just does not get
    // stored.
    return fetch(request);
  }
}

/**
 * Only store a response we can actually read the status of, that the origin
 * did not mark uncacheable, and that is not big enough to matter on its own.
 *
 * An opaque response has status 0, so response.ok already excludes it; the
 * explicit type check is there to say that is intentional rather than lucky.
 */
function isStorable(response) {
  if (!response || !response.ok) return false;
  if (response.type !== "basic" && response.type !== "cors") return false;

  const control = response.headers.get("Cache-Control") || "";
  if (control.includes("no-store")) return false;

  // Absent on a chunked response, in which case this check simply does not
  // fire. It is a guard against the obvious case, not an accounting system.
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_ENTRY_BYTES) return false;

  return true;
}

/**
 * True when the response is older than maxAgeMs, or when its age cannot be
 * established at all. Unprovable freshness counts as stale: the cost of
 * being wrong that way is one network request, and the cost of being wrong
 * the other way is serving a document from before the last three deploys.
 */
function isOlderThan(response, maxAgeMs) {
  const date = response.headers.get("date");
  if (!date) return true;
  const age = Date.now() - new Date(date).getTime();
  // NaN from an unparseable header, and a negative age from a skewed clock,
  // both fail this and are treated as stale.
  return !(age >= 0 && age < maxAgeMs);
}

/** caches.open throws outright where storage is denied. Never let that pass. */
async function openCache(name) {
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
}

async function store(cache, request, response, cacheName) {
  try {
    await cache.put(request, response);
  } catch {
    // Quota exceeded, or the entry is not storable. Never let this reject
    // into a fetch handler and turn a cached write into a failed page load.
    return;
  }
  await trim(cacheName);
}

/**
 * Keep the newest CACHE_LIMITS[cacheName] entries. cache.keys() returns
 * insertion order, so dropping from the front is a rough LRU: good enough,
 * and far cheaper than tracking access times on every hit. It ages out old
 * deploys' asset hashes first, which is exactly the order wanted.
 */
async function trim(cacheName) {
  const limit = CACHE_LIMITS[cacheName];
  if (!limit) return;
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const excess = keys.length - limit;
    if (excess <= 0) return;
    await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  } catch {
    // Trimming is housekeeping. Failing it must not break a response.
  }
}
