/**
 * Every prerendered page must be in the sitemap, or be noindex on purpose.
 *
 * The sitemap's top-level URLs are written by hand in script/prerender.ts,
 * beside a STANDALONE list that is also written by hand. Two hand-maintained
 * lists describing the same set of pages is the shape that already cost this
 * site two pages: the National Cyber League guide slugs were listed once for
 * the static pages and once for the sitemap, both listed seven, and the data
 * had nine. Two guides existed in the app and in nothing a crawler could
 * reach.
 *
 * Rather than ask anyone to remember, this compares what the build actually
 * wrote against what the sitemap actually lists. A page may be absent only if
 * its own HTML says noindex, which is a decision the page itself records.
 *
 * The reverse is checked too. A sitemap entry with no page behind it sends
 * crawlers to a 404 and costs crawl budget on a site with 300-plus URLs.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const DIST = path.resolve("dist/public");
const SITE = "https://maxdoubin.com";

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (e.endsWith(".html")) out.push(full);
  }
  return out;
}

/** "/blog/foo" for blog/foo.html, "/" for index.html. */
function routeFor(rel) {
  if (rel === "index.html") return "/";
  return "/" + rel.slice(0, -".html".length);
}

const sitemapXml = readFileSync(path.join(DIST, "sitemap.xml"), "utf8");
const listed = new Set(
  [...sitemapXml.matchAll(new RegExp(`<loc>${SITE}([^<]*)</loc>`, "g"))].map((m) => {
    const p = m[1];
    return p.length > 1 ? p.replace(/\/$/, "") : "/";
  }),
);

if (listed.size === 0) {
  console.error("check-sitemap-coverage: parsed 0 URLs from sitemap.xml, so this gate is checking nothing.");
  process.exit(1);
}

const missing = [];
const noindexed = [];
const pages = new Set();

for (const file of walk(DIST)) {
  const rel = path.relative(DIST, file);
  // 404.html is the host's fallback document, not a route.
  if (rel === "404.html") continue;

  const route = routeFor(rel);
  pages.add(route);
  if (listed.has(route)) continue;

  const html = readFileSync(file, "utf8");
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) {
    noindexed.push(route);
    continue;
  }
  missing.push(route);
}

const orphans = [...listed].filter((r) => !pages.has(r));

if (missing.length || orphans.length) {
  if (missing.length) {
    console.error(`${missing.length} prerendered page(s) are absent from sitemap.xml:\n`);
    for (const r of missing) console.error(`  ${r}`);
    console.error(
      "\n  Add the URL in writeSitemap in script/prerender.ts, or give the page\n" +
        "  a noindex robots meta if it is deliberately not for crawlers.",
    );
  }
  if (orphans.length) {
    console.error(`\n${orphans.length} sitemap URL(s) have no page behind them:\n`);
    for (const r of orphans) console.error(`  ${r}   sends a crawler to a 404`);
  }
  process.exit(1);
}

console.log(
  `check-sitemap-coverage: ${pages.size} pages, ${listed.size} in the sitemap, ` +
    `${noindexed.length} noindex by design (${noindexed.join(", ") || "none"})`,
);
