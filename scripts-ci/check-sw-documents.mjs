/**
 * The service worker's document strategy, exercised against a fake network.
 *
 * This file is the one on the site whose failure mode is not "a page looks
 * wrong" but "every returning visitor is stuck on a broken build and cannot
 * clear it themselves", because a worker outlives the deploy that installed
 * it. It has already been rewritten once for exactly that: it used to serve
 * any cached document under a day old, which on a site that deploys several
 * times an afternoon meant handing back a manifest naming chunk files the
 * CDN no longer had, on every reload, permanently.
 *
 * A browser test of this is not worth what it costs. Getting a real worker to
 * take control, then throttling only its fetches and not the page's, then
 * reading its caches, took an afternoon and produced results that changed
 * between runs. The logic under test is ordinary asynchronous JavaScript, so
 * it is run here directly: sw.js is evaluated with a fake CacheStorage and a
 * fetch stub the test controls, and the four things a reader can experience
 * are each asserted.
 *
 * Usage: node scripts-ci/check-sw-documents.mjs
 */

import { readFileSync } from "node:fs";

const SW = "client/public/sw.js";
const ORIGIN = "https://maxdoubin.com";

/* -------------------------------------------------------------------------
   Fakes. Small on purpose: only what sw.js actually touches.
   ------------------------------------------------------------------------- */

/** Responses the worker will accept: response.type must be basic or cors. */
function basic(body, init = {}) {
  const response = new Response(body, init);
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

class FakeCache {
  constructor() {
    this.entries = new Map();
  }
  async match(request) {
    const hit = this.entries.get(keyOf(request));
    return hit ? hit.clone() : undefined;
  }
  async put(request, response) {
    this.entries.set(keyOf(request), response);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  async delete(request) {
    return this.entries.delete(keyOf(request));
  }
}

const keyOf = (request) => (typeof request === "string" ? request : request.url);

function fakeCaches() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
}

/** A navigation request. Node's Request refuses mode "navigate", so: */
const navigation = (path) => ({
  url: ORIGIN + path,
  method: "GET",
  mode: "navigate",
  destination: "document",
  headers: new Headers(),
});

function fetchEvent(request, preload) {
  const pending = [];
  return {
    request,
    preloadResponse: Promise.resolve(preload),
    answer: undefined,
    respondWith(promise) {
      this.answer = promise;
    },
    waitUntil(promise) {
      pending.push(Promise.resolve(promise).catch(() => undefined));
    },
    /** What the browser does at the end of the event: let the work finish. */
    settle: () => Promise.all(pending),
  };
}

/**
 * Load sw.js and hand back its event handlers.
 *
 * new Function rather than an import, because sw.js is a classic worker
 * script with no exports that expects `self` and `caches` to exist.
 */
function loadWorker(fetchStub) {
  const source = readFileSync(SW, "utf8");
  const handlers = {};
  const self = {
    location: { origin: ORIGIN },
    registration: { navigationPreload: { enable: async () => {} } },
    clients: { claim: async () => {}, matchAll: async () => [] },
    skipWaiting: async () => {},
    addEventListener: (name, handler) => {
      handlers[name] = handler;
    },
  };
  const caches = fakeCaches();
  // eslint-disable-next-line no-new-func
  new Function("self", "caches", "fetch", source)(self, caches, fetchStub);
  if (!handlers.fetch) throw new Error("sw.js registered no fetch handler");
  return { handlers, caches, self };
}

/* -------------------------------------------------------------------------
   The scenarios.
   ------------------------------------------------------------------------- */

const SHELL = "maxdoubin-shell-v3";
const failures = [];
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** Drive one navigation through the worker and report what the reader got. */
async function navigate(worker, path, preload) {
  const event = fetchEvent(navigation(path), preload);
  worker.handlers.fetch(event);
  if (!event.answer) throw new Error(`worker did not answer ${path}`);
  const started = Date.now();
  const response = await event.answer;
  const body = await response.clone().text();
  return { response, body, ms: Date.now() - started, settle: event.settle };
}

const cachedBody = async (worker, path) => {
  const cache = worker.caches.stores.get(SHELL);
  const hit = cache && (await cache.match(ORIGIN + path));
  return hit ? hit.text() : null;
};

console.log("service worker, document strategy:\n");

/* 1. Ordinary load. The network answers, the reader gets it, it is cached. */
{
  const worker = loadWorker(async () => basic("FRESH", { headers: { "Content-Type": "text/html" } }));
  const { body } = await navigate(worker, "/blog");
  await (await navigate(worker, "/blog")).settle();
  check("a fast network is what the reader gets", body === "FRESH", `got ${JSON.stringify(body)}`);
  check("and it lands in the cache", (await cachedBody(worker, "/blog")) === "FRESH");
}

/*
   2. The regression this gate exists for.

   A slow network with a cached copy: the reader gets the copy rather than
   waiting, AND the response that lost the race is still stored. Dropping it
   is the bug: the cache would still hold the old document, so the next load
   would time out against the same slow connection and serve the same stale
   manifest, and so would the one after it. The staleness outlives the outage.
*/
{
  const worker = loadWorker(async () => later(5500, basic("SECOND", { headers: { "Content-Type": "text/html" } })));
  const cache = await worker.caches.open(SHELL);
  await cache.put(ORIGIN + "/blog", basic("FIRST"));

  const { body, ms, settle } = await navigate(worker, "/blog");
  check("a slow network falls back to the cached copy", body === "FIRST", `got ${JSON.stringify(body)}`);
  check("within the timeout, not after it", ms < 5000, `took ${ms}ms`);

  await settle();
  check(
    "and the response that lost the race is still stored",
    (await cachedBody(worker, "/blog")) === "SECOND",
    `cache holds ${JSON.stringify(await cachedBody(worker, "/blog"))}`,
  );
}

/* 3. Offline with a cached copy: the copy, however old. */
{
  const worker = loadWorker(async () => {
    throw new TypeError("Failed to fetch");
  });
  const cache = await worker.caches.open(SHELL);
  await cache.put(ORIGIN + "/blog", basic("OFFLINE COPY"));
  const { body, response } = await navigate(worker, "/blog");
  check("offline, a cached copy is served", body === "OFFLINE COPY" && response.status === 200);
}

/* 4. Offline with nothing cached: the worker's own 503, not a browser error. */
{
  const worker = loadWorker(async () => {
    throw new TypeError("Failed to fetch");
  });
  const { body, response } = await navigate(worker, "/never-visited");
  check(
    "offline with no copy gives the worker's offline document",
    response.status === 503 && body.includes("not stored on your device"),
    `status ${response.status}`,
  );
  check(
    "which is marked noindex and unstorable",
    body.includes('name="robots" content="noindex"') &&
      response.headers.get("Cache-Control") === "no-store",
  );
}

/* 5. A redirect must never be cached: a cached redirected response breaks
      navigations outright, and _redirects means this origin serves them. */
{
  const worker = loadWorker(async () => {
    const response = basic("REDIRECTED BODY");
    Object.defineProperty(response, "redirected", { value: true });
    return response;
  });
  const { settle } = await navigate(worker, "/legacy/blog");
  await settle();
  check("a redirected response is never stored", (await cachedBody(worker, "/legacy/blog")) === null);
}

console.log("");
if (failures.length) {
  console.error(`FAIL  ${failures.length} of the document strategy's guarantees do not hold.`);
  process.exit(1);
}
console.log("OK  the service worker's document strategy holds on all five paths.");
