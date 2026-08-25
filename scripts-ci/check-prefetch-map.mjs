/**
 * Every lazily routed page must be registered for hover prefetching.
 *
 * prefetchOnHover.ts holds a hand-maintained map from path to dynamic import.
 * Its own header told the next person to add an entry alongside each new
 * lazy() in App.tsx. That instruction was followed for nineteen routes and
 * missed for the next thirty-seven, so hovering a tool page, the resume, the
 * NCL guides or anything else added later did nothing at all. The failure is
 * invisible: the link still works, it is just slower than it was designed to
 * be, and nothing in the build noticed for months.
 *
 * So the rule is enforced here instead of documented and hoped for.
 */

import { readFileSync } from "node:fs";

const APP = "client/src/App.tsx";
const PREFETCH = "client/src/lib/prefetchOnHover.ts";

/** Components rendered inside a Route that are wrappers, not the page. */
const WRAPPERS = new Set([
  "RouteLoading",
  "GameLoading",
  "Suspense",
  "OpsRoute",
  "GameProvider",
  "BuildProvider",
]);

/**
 * Routes that intentionally have no prefetch entry.
 *
 * The 404 is reachable only by typing a bad URL, so there is no link to hover
 * and nothing to warm. "/" is a static import already in the entry chunk.
 */
const EXEMPT_MODULES = new Set(["@/pages/cinematic/CinematicNotFound"]);

const app = readFileSync(APP, "utf8");
const prefetch = readFileSync(PREFETCH, "utf8");

const componentToModule = new Map(
  [...app.matchAll(/const (\w+)\s*=\s*lazyWithRetry\(\(\)\s*=>\s*\n?\s*import\("(@\/pages\/[^"]+)"\)/g)].map(
    (m) => [m[1], m[2]],
  ),
);

/** path -> module, for every <Route> that renders a lazy page. */
const routed = [];
for (const block of app.matchAll(/<Route path="([^"]+)"[^>]*>([\s\S]*?)<\/Route>/g)) {
  const [, path, body] = block;
  for (const el of body.matchAll(/<(\w+)\s*\/>/g)) {
    const name = el[1];
    if (WRAPPERS.has(name)) continue;
    const mod = componentToModule.get(name);
    if (mod) {
      routed.push({ path, module: mod });
      break;
    }
  }
}
for (const m of app.matchAll(/<Route path="([^"]+)" component=\{(\w+)\}/g)) {
  const mod = componentToModule.get(m[2]);
  if (mod) routed.push({ path: m[1], module: mod });
}

const registered = new Set([...prefetch.matchAll(/import\("(@\/pages\/[^"]+)"\)/g)].map((m) => m[1]));

const missing = routed.filter(
  (r) => !EXEMPT_MODULES.has(r.module) && !registered.has(r.module),
);

// A stale entry is the mirror failure: a module the router no longer uses,
// still speculatively fetched on hover.
const routedModules = new Set(routed.map((r) => r.module));
const stale = [...registered].filter((m) => !routedModules.has(m));

if (routed.length === 0) {
  console.error("FAIL  parsed no routes out of App.tsx, so this check proved nothing.");
  console.error("      The route or lazy() syntax probably changed; fix this script.");
  process.exit(1);
}

if (missing.length || stale.length) {
  if (missing.length) {
    console.error(`FAIL  ${missing.length} routed page(s) have no hover prefetch entry.`);
    console.error("      Add each to EXACT_ROUTES or PREFIX_ROUTES in prefetchOnHover.ts:\n");
    for (const r of missing) {
      const key = r.path.includes(":") ? `${r.path.split(":")[0]}` : r.path;
      console.error(`        "${key}": { load: () => import("${r.module}") },`);
    }
  }
  if (stale.length) {
    console.error(`\nFAIL  ${stale.length} prefetch entr(y/ies) point at a module no route renders:`);
    for (const m of stale) console.error(`        ${m}`);
  }
  process.exit(1);
}

console.log(
  `OK  all ${routed.length} routed pages are registered for hover prefetching.`,
);
