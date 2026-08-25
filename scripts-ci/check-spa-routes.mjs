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

import { readFileSync, existsSync } from "node:fs";
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
  "/study/:exam/:domain": "study",
};

const rules = redirects
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split(/\s+/)[0]);

function coveredByRule(route) {
  return rules.some((rule) => {
    if (rule === route) return true;
    if (rule.endsWith("/*")) return route.startsWith(rule.slice(0, -1));
    if (rule === "/*") return true;
    return false;
  });
}

function prerendered(route) {
  if (route === "/") return existsSync(path.join(DIST, "index.html"));
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
