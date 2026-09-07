
## Every fix worked, and the site stayed broken

For about a week this site had a bug I could not reproduce and could not stop
hearing about. The rack pages would load partway and stall. I would find a
cause, fix it, deploy it, check the deployed files with curl, confirm the fix
was live, and be told it was still broken. Then I would find another cause.

Three of those causes were real, and fixing them changed nothing, because none
of them was the reason the page in front of the reader was broken. The reason
was that the reader was not running any of the code I kept deploying.

## What a document actually is

A modern single page application's HTML is not the page. It is a manifest. It
is a short file whose entire job is to name the JavaScript and CSS bundles that
are the page:

```html
<script type="module" src="/assets/index-D8kR2p.js"></script>
<link rel="stylesheet" href="/assets/index-9fLm0x.css">
```

Those hashes are content hashes. Change one line of source and the bundle gets
a new name, the old name stops existing, and the new HTML points at the new
name. That is the whole cache-busting scheme and it is a good one: assets can
be cached forever precisely because their names change when their contents do.

It works on exactly one condition. The document has to be current. A document
is a map of which files exist, and an old map is not a slightly worse map, it
is a map of a place that has been demolished.

## The cache policy that did it

The service worker had this shape, and if you have written one you have
probably written this shape:

```js
// Documents: serve from cache if the copy is fresh enough,
// and revalidate in the background.
if (cached && !isOlderThan(cached, 24 * 60 * 60 * 1000)) {
  event.waitUntil(revalidate(request));
  return cached;
}
```

Stale-while-revalidate. It is the standard recommendation, it makes repeat
visits instant, and for a document on a site that deploys often it is a
loaded gun.

Read what it does on the third day of a busy week. A reader visited on Monday
and the worker cached Monday's document. I deployed on Tuesday, twice on
Wednesday. Cloudflare has long since dropped Monday's bundles. On Thursday the
reader opens the site, the worker checks its copy, decides eighteen hours old
is fresh enough, and serves Monday's manifest. The browser dutifully requests
`/assets/index-D8kR2p.js`, which has not existed since Tuesday, and gets a 404.

What the reader sees depends on where the missing chunk was. If it was the
entry bundle, a blank page. If it was a lazily loaded route, that route throws
and the error boundary catches it. If it was one model in a set of ten, the
progress readout stops at ninety percent and stays there forever.

That last one is what I spent a week chasing.

## The bit that makes it vicious

The natural thing to do with a broken page is reload it. Reloading requests
the document again, which the service worker answers from the same cache, so
you get the same broken document. And because the entry is revalidated in the
background, a reload that happens to be served by the *old* worker can write
another copy of a stale document back into the cache.

So the user-facing symptom is a page that is broken, stays broken when you
reload it, and is fine on any device that has never visited before. Which is
every device I was testing on, because I was testing in a fresh browser
against a fresh deployment, where there is no cached document at all and the
network is the only source. My testing was structurally incapable of seeing
the bug.

## The fix, which is four lines

Documents go network-first. Not stale-while-revalidate, not
cache-first-with-a-freshness-window. Network first, with the cache as the
offline fallback it was always meant to be:

```js
const DOCUMENT_NETWORK_TIMEOUT_MS = 4000;

try {
  const response = await Promise.race([
    fromNetwork(event, request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("slow")), cached ? DOCUMENT_NETWORK_TIMEOUT_MS : 30000),
    ),
  ]);
  if (isStorable(response)) {
    event.waitUntil(store(cache, request, response.clone(), SHELL_CACHE));
  }
  return response;
} catch {
  // Only now, and only because there is nothing better.
  if (cached) return cached;
  ...
}
```

The timeout is the part worth explaining. Network-first with no timeout means
a reader on a bad connection waits out the full request before getting the
cached copy, which is worse than what we had. Four seconds is long enough that
a normal request wins and short enough that a stalled one does not hold the
page hostage, and the race only applies when there is a cached copy to fall
back to. With nothing cached there is nothing to fall back to, so it waits the
full thirty.

The assets keep their old policy, and should. Their names are content hashes.
A cached `index-D8kR2p.js` is byte-identical to the one on the server or it
does not exist. Cache-first is not just safe there, it is the entire reason
for hashing the names.

## Getting the old worker out

Deploying the fix does not fix anybody, which is the second thing that
surprised me. The old worker is still installed and still controlling open
tabs, and a page controlled by the old worker gets the old worker's cache
policy, including for the request that would fetch the new worker's document.

Two things move it along. The cache version string is in every cache name, so
bumping it means `activate` deletes every cache that is not on the new list:

```js
const CACHE_VERSION = "v3";                 // was v2
const SHELL_CACHE  = `maxdoubin-shell-${CACHE_VERSION}`;
const ASSET_CACHE  = `maxdoubin-assets-${CACHE_VERSION}`;
```

And the reader has to close the tab. Not reload it: close it. A service worker
update installs in the background and then waits, because taking over from a
running worker mid-session can leave a page half-served by each. It activates
when the last client controlling it goes away. `skipWaiting()` shortcuts that
and I did not use it, because it trades this problem for a page whose already
loaded chunks and newly fetched chunks come from different builds.

## Testing it, which took longer than fixing it

I had already claimed three times that something was fixed and been wrong, so
this one needed a test rather than an assertion. The test had to answer one
question: does the worker serve a stale document, yes or no.

```text
1. serve the real production build the way Pages serves it
2. open /racks/wired, wait for navigator.serviceWorker.controller
3. write a poisoned document into the shell cache: a valid page whose
   <script> names /assets/index-GONEFOREVER.js
4. reload
5. did the poison come back?
```

Two things made this harder than it reads.

The first is that a service worker needs a secure context, and the site's own
registration code unregisters the worker on localhost so that development is
not fighting a cache. So the test runs against a hosts-file entry with
Chromium launched with `--unsafely-treat-insecure-origin-as-secure` pointed at
it. My first attempt skipped this, found no controller, no cache and no
failure, and looked exactly like a pass. It was not a pass, it was a test that
had not run.

The second is that a test only means something if it can fail. So I ran the
whole thing again with the old stale-first worker in place:

```text
with the fix (v3, network-first)
  4. after reload: title="The wired UniFi rack" | stale script present: false
     PASS: network won, poison ignored
  5. canvas present: true | page errors: none

control (v2, stale-first), same test
  4. after reload: title="STALE" | stale script present: true
     FAIL: served the poisoned document
  5. canvas present: false
```

The control failing is the whole value of the exercise. Without it I have a
green check mark and no evidence it is measuring anything. With it I know the
test reproduces the exact reported symptom under the old code and does not
under the new.

## What I would tell myself a week earlier

**A document is a manifest, not a page.** Caching it stale means serving a list
of files that may not exist. There is no freshness window short enough to make
that safe on a site that deploys more than once a day.

**Verifying a deployment is not verifying a delivery.** Every `curl` I ran
against the origin was correct and none of it was evidence, because the bug
lived between the origin and the reader. Fetching a file proves the file is
there. It does not prove that is the file anybody gets.

**A bug you cannot reproduce may be a bug about state you do not have.** A
fresh browser is a browser with no cache, no worker and no history, and if the
bug is in accumulated state then a fresh browser is the one client guaranteed
not to have it. Reproducing it meant deliberately constructing the state:
install the worker, poison the cache, then reload.

**Fix the delivery before you fix anything else.** The three earlier causes
were all real, and one of them, a load window that deadlocked, was worse than
what it replaced. But shipping them was pointless while the readers reporting
the problem were running a build from Monday. Until the document is current,
nothing else you deploy has happened.

## References

- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [W3C Service Workers specification: the activation algorithm](https://www.w3.org/TR/service-workers/#activation-algorithm)
- [MDN: Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [Google Web Fundamentals: The Offline Cookbook](https://web.dev/articles/offline-cookbook)
- [Vite: static asset handling and content hashing](https://vite.dev/guide/assets)
- [Cloudflare Pages: build output and caching](https://developers.cloudflare.com/pages/configuration/serving-pages/)
