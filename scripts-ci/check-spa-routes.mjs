/**
 * Every route the app answers must actually be served by the host.
 *
 * Cloudflare Pages serves a static file if one exists at the path, applies
 * _redirects otherwise, and falls through to 404.html. The site used to
 * paper over all of that with `/* /index.html 200`, which served the app
 * shell for every URL on earth and told Google that maxdoubin.com/asdf was a
 * real page. Removing the catch-all fixed the soft 404s and introduced a new
 * way to break the site: add a route to App.tsx, forget to prerender it and
 * forget to list it in _redirects, and it now 404s at real visitors.
 *
 * So the two halves are checked against each other. A route passes if it is
 * prerendered, or if a rewrite in _redirects covers it. Nothing else passes.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const APP = "client/src/App.tsx";
const REDIRECTS = "client/public/_redirects";
const DIST = "dist/public";

const app = readFileSync(APP, "utf8");
const redirects = readFileSync(REDIRECTS, "utf8");

/**
 * Dynamic route families, and the directory whose contents prove they are
 * prerendered. `/blog/:slug` is covered because every slug in the index has
 * its own directory, so an unknown slug SHOULD reach 404.html.
 */
const DYNAMIC_COVERED_BY = {
  "/blog/:slug": "blog",
  "/topics/:tag": "topics",
  "/ncl/:slug": "ncl",
  "/racks/:slug": "racks",
  "/study/:exam": "study",
  "/study/:exam/:domain": "study",
};

const ruleLines = redirects
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const rules = ruleLines.map((l) => l.split(/\s+/)[0]);

/*
  A rewrite target must not end in .html.

  Cloudflare Pages strips the .html extension from a rewrite target the same
  way it does from a request path, so `/noc /index.html 200` turns into a 308
  to / and the rewrite never happens. That shipped: every simulator dashboard
  and the whole legacy site redirected to the home page, and nothing local
  caught it because the rule was present and well formed. The target is `/`.
*/
const htmlTargets = ruleLines
  .map((l) => l.split(/\s+/))
  .filter((parts) => parts.length >= 2 && /\.html$/.test(parts[1]))
  .map((parts) => `${parts[0]} -> ${parts[1]}`);

if (htmlTargets.length > 0) {
  console.error(
    "FAIL  a rewrite target ends in .html, which Cloudflare Pages turns into\n" +
      "      a redirect, defeating the rewrite.\n",
  );
  for (const t of htmlTargets) console.error(`  ${t}`);
  console.error("\n  Use `/` as the target instead of `/index.html`.");
  process.exit(1);
}

function coveredByRule(route) {
  return rules.some((rule) => {
    if (rule === route) return true;
    if (rule.endsWith("/*")) return route.startsWith(rule.slice(0, -1));
    if (rule === "/*") return true;
    return false;
  });
}

/** Every .html the build wrote, absolute paths. */
function allPages(dir = DIST) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...allPages(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function prerendered(route) {
  if (route === "/") return existsSync(path.join(DIST, "index.html"));
  const flat = path.join(DIST, `${route.slice(1)}.html`);
  if (existsSync(flat)) return true;
  return existsSync(path.join(DIST, route.slice(1), "index.html"));
}

const routes = [...new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]))];
if (routes.length < 20) {
  console.error(
    `FAIL  parsed only ${routes.length} routes out of ${APP}; the parser is broken, not the data.`,
  );
  process.exit(1);
}

if (!existsSync(path.join(DIST, "404.html"))) {
  console.error(
    "FAIL  dist/public/404.html is missing. Without it Cloudflare Pages has\n" +
      "      nothing to serve for an unmatched URL. script/prerender.ts writes it.",
  );
  process.exit(1);
}

if (rules.includes("/*")) {
  console.error(
    "FAIL  _redirects contains a `/*` catch-all. That answers 200 OK for every\n" +
      "      URL that does not exist, which Google reads as a soft 404 and which\n" +
      "      is what this gate exists to prevent. Enumerate the routes instead.",
  );
  process.exit(1);
}

const unreachable = [];
for (const route of routes) {
  if (route === "*" || route === "/:rest*") continue;
  if (route.includes(":")) {
    const dir = DYNAMIC_COVERED_BY[route];
    if (dir && existsSync(path.join(DIST, dir))) continue;
    if (coveredByRule(route.replace(/\/:[^/]+/g, "/x"))) continue;
    unreachable.push(`${route} (dynamic, no prerendered ${dir ?? "directory"} and no rewrite)`);
    continue;
  }
  if (prerendered(route) || coveredByRule(route)) continue;
  unreachable.push(route);
}

/*
  Every published path must have a published parent.

  /study/ccna/ip-connectivity resolved while /study/ccna returned a 404, on
  the live site, for all three certifications. Trimming a URL back a level is
  ordinary navigation and crawlers do it too, so a deep page whose parent is
  a dead end is a broken hierarchy the site publishes itself.

  This walks the built output rather than the route table, because the route
  table is what looked correct: /study/:exam/:domain was registered and
  served, and nothing in it said the level above was missing.
*/
const built = new Set();
for (const file of allPages()) {
  const rel = path.relative(DIST, file);
  if (rel === "404.html") continue;
  built.add(rel === "index.html" ? "/" : "/" + rel.slice(0, -".html".length));
}

const orphanParents = new Map();
for (const page of built) {
  if (page === "/") continue;
  const parts = page.slice(1).split("/");
  for (let i = 1; i < parts.length; i += 1) {
    const parent = "/" + parts.slice(0, i).join("/");
    if (built.has(parent) || coveredByRule(parent)) continue;
    if (!orphanParents.has(parent)) orphanParents.set(parent, page);
  }
}

if (orphanParents.size > 0) {
  console.error("FAIL  these paths are published but their parent 404s.\n");
  for (const [parent, child] of orphanParents) {
    console.error(`  ${parent}   is the parent of ${child}, and is not a page`);
  }
  console.error(
    "\n  Someone who trims a URL, and any crawler that does the same, lands on" +
      "\n  a dead end inside a path this site publishes. Give the parent a page" +
      "\n  in script/prerender.ts, or a rewrite in " + REDIRECTS + ".",
  );
  process.exit(1);
}

if (unreachable.length > 0) {
  console.error("FAIL  these routes would 404 at real visitors.\n");
  for (const r of unreachable) console.error(`  ${r}`);
  console.error(
    `\n  Either prerender the route in script/prerender.ts, or add a rewrite` +
      `\n  for it to ${REDIRECTS}. A route in neither place is unreachable.`,
  );
  process.exit(1);
}

console.log(
  `OK  all ${routes.length} routes are served, and unknown URLs reach 404.html.`,
);
