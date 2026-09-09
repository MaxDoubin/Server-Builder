/**
 * Everything the site has must be reachable from the one box that reaches
 * everything.
 *
 * The palette exists because the archive is 258 articles and forty-odd pages
 * behind a nine item navigation bar: everything is reachable and almost
 * nothing is findable. That only holds while the palette knows about every
 * page, and nothing tells you when it stops.
 *
 * It had stopped. Sixteen practice surfaces and reference pages had been
 * built, shipped, linked from the footer and the front door, and none of
 * them was in the palette. Typing "firewall" returned articles that mention
 * firewalls, and not the firewall exercise. Nothing was broken, no gate
 * failed, and the feature had been quietly wrong for as long as those pages
 * had existed.
 *
 * So every static route in App.tsx has to be reachable one of three ways:
 * named in the palette's own PAGES list, generated from a registry the
 * palette loads, or listed here with a reason. The reason is the point. A
 * skip has to be an argument somebody made rather than a hole in a regex.
 *
 * This imports the registries rather than pattern-matching them, so a tool
 * with a route but no registry entry fails here too: that tool is invisible
 * in the palette and the /tools index alike, and nothing else would say so.
 */

import { readFileSync } from "node:fs";
import { TOOLS } from "../client/src/lib/toolsRegistry";
import { RACKS } from "../client/src/lib/racks";

const APP = "client/src/App.tsx";
const PALETTE = "client/src/components/cinematic/CommandPalette.tsx";

const app = readFileSync(APP, "utf8");
const palette = readFileSync(PALETTE, "utf8");

const problems: string[] = [];

/* ------------------------------------------------------- what exists */

const routes = [...new Set([...app.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]))];
if (routes.length < 20) {
  console.error(`FAIL  parsed only ${routes.length} routes out of ${APP}; the parser is broken, not the data.`);
  process.exit(1);
}

/* ---------------------------------------------------- what it reaches */

const named = new Set([...palette.matchAll(/href:\s*"(\/[^"]*)"/g)].map((m) => m[1]));
if (named.size < 30) {
  console.error(`FAIL  parsed only ${named.size} hrefs out of the palette; the parser is broken, not the data.`);
  process.exit(1);
}

/**
 * The registries the palette turns into rows, and the route shape each one
 * produces. Read from the registry itself, so this cannot drift from what
 * the palette actually offers.
 */
const fromRegistry = new Set<string>([
  ...TOOLS.map((tool) => `/tools/${tool.slug}`),
  ...RACKS.map((rack) => `/racks/${rack.slug}`),
]);

/*
  Every registry has to be one the palette actually loads, or this file is
  asserting coverage the reader does not get.
*/
for (const module of ["@/lib/toolsRegistry", "@/lib/racks", "@/lib/postIndex", "@/lib/glossary/index"]) {
  if (!palette.includes(`import("${module}")`)) {
    problems.push(`the palette does not load ${module}, so everything in it is unfindable by name`);
  }
}

/*
  And it has to load them dynamically. A static import puts the module in the
  critical path of every page on the site, which is the mistake the palette's
  own header describes happening twice.
*/
const withoutTypeImports = palette.replace(/^import type .*$/gm, "");
for (const module of ["@/lib/toolsRegistry", "@/lib/racks", "@/lib/postIndex", "@/lib/glossary"]) {
  if (new RegExp(`^import .*from "${module.replace("/", "\\/")}`, "m").test(withoutTypeImports)) {
    problems.push(`the palette imports ${module} statically, which puts it in every page's critical path`);
  }
}

/**
 * Routes that are deliberately not destinations, each with its reason.
 */
const NOT_A_DESTINATION: Record<string, string> = {
  "/:rest*": "the 404 handler",
  "/noc": "a simulator dashboard, reachable only from inside a running game and noindex",
  "/network": "a simulator dashboard, reachable only from inside a running game and noindex",
  "/floor": "a simulator dashboard, reachable only from inside a running game and noindex",
  "/incidents": "a simulator dashboard, reachable only from inside a running game and noindex",
  "/build": "a simulator dashboard, reachable only from inside a running game and noindex",
  "/verify": "linked from the pages making the claims, where the claim is what somebody would search for",
};

for (const route of routes) {
  if (named.has(route)) continue;
  if (fromRegistry.has(route)) continue;
  if (route in NOT_A_DESTINATION) continue;
  if (route.includes(":")) {
    /* A dynamic family is reachable if its index page is named. */
    const parent = route.slice(0, route.indexOf("/:"));
    if (parent && named.has(parent)) continue;
    problems.push(
      `${route} is a dynamic route and its index page ${parent || "/"} is not in the palette. Name the index in PAGES.`,
    );
    continue;
  }
  problems.push(
    `${route} exists but nothing in the palette goes there. Add it to PAGES, or add it to NOT_A_DESTINATION with a reason.`,
  );
}

/* A row pointing at a route that no longer exists is worse than a missing one. */
const routeSet = new Set(routes);
for (const href of named) {
  const target = href.split("#")[0].split("?")[0];
  if (!target || target === "/") continue;
  if (routeSet.has(target) || fromRegistry.has(target)) continue;
  const family = routes.find(
    (route) => route.includes(":") && target.startsWith(route.slice(0, route.indexOf("/:")) + "/"),
  );
  if (family) continue;
  problems.push(`the palette offers ${href}, and no route in ${APP} answers it`);
}

/* A tool in the registry with no route is a row that goes nowhere. */
for (const tool of TOOLS) {
  if (!routeSet.has(`/tools/${tool.slug}`)) {
    problems.push(`the tools registry lists ${tool.slug}, and no route in ${APP} answers /tools/${tool.slug}`);
  }
}
for (const rack of RACKS) {
  const covered = routeSet.has(`/racks/${rack.slug}`) || routes.some((route) => route.startsWith("/racks/:"));
  if (!covered) problems.push(`the racks registry lists ${rack.slug}, and no route answers /racks/${rack.slug}`);
}

if (problems.length) {
  console.error(`\ncheck-palette: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  all ${routes.length} routes are reachable from the palette: ${named.size} named, ` +
    `${fromRegistry.size} generated from the tool and rack registries, and the rest through a named index or a stated exception.`,
);
