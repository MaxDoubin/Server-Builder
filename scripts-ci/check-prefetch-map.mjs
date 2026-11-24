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

/*
  Tool pages share one route, /tools/:slug, which renders no lazy const of
  its own: it asks the slug map in TOOL_MAP for the page. So the generic parse
  above cannot see it, and without this block every tool would drop out of
  the check unnoticed. Hover prefetch has to go through the same map, from a
  "/tools/" prefix entry keyed per path (one shared key would warm only the
  first tool hovered), or hovering a tool card warms nothing. The map itself
  resolves every registry slug, which check-palette.ts proves page by page.
*/
const TOOL_MAP = "@/pages/tools/toolPages";
const toolProblems = [];
if (/<Route path="\/tools\/:slug"/.test(app)) {
  if (!app.includes(`import("${TOOL_MAP}")`)) {
    toolProblems.push(`App.tsx serves /tools/:slug but does not load ${TOOL_MAP}`);
  }
  const toolPrefix = prefetch.match(/"\/tools\/":\s*\{([\s\S]*?)\n\s*\},/);
  if (!toolPrefix) {
    toolProblems.push(`prefetchOnHover.ts has no "/tools/" entry in PREFIX_ROUTES`);
  } else {
    if (!toolPrefix[1].includes(`import("${TOOL_MAP}")`)) {
      toolProblems.push(`the "/tools/" prefetch entry does not load ${TOOL_MAP}`);
    }
    if (!/\bloadToolPage\(/.test(toolPrefix[1])) {
      toolProblems.push(`the "/tools/" prefetch entry does not ask the map for the hovered tool's page`);
    }
    if (!/\bperPath:\s*true\b/.test(toolPrefix[1])) {
      toolProblems.push(`the "/tools/" prefetch entry is not keyed per path, so only the first tool hovered would warm`);
    }
  }
  routed.push({ path: "/tools/:slug", module: TOOL_MAP });
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

if (toolProblems.length) {
  console.error(`FAIL  tool pages are not wired for hover prefetching:\n`);
  for (const problem of toolProblems) console.error(`        ${problem}`);
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
