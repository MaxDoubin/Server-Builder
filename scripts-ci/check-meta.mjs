#!/usr/bin/env node
/**
 * Per-page SEO metadata check over the prerendered output.
 *
 * Fails when a page is missing a <title>, a <meta name="description">, or a
 * <link rel="canonical">, and when two pages share a title or a description.
 *
 * The duplicate half is the one that actually catches things. Every page is
 * built by script/prerender.ts from the same dist/public/index.html template
 * and gets its metadata by regex substitution over that template. When a new
 * route is added with writePage() but its title or description is left at the
 * default, or a substitution silently misses, the page inherits the home
 * page's metadata instead of failing. The output looks fine; two URLs just
 * quietly compete for the same query, and a crawler picks one.
 *
 * Usage: node scripts-ci/check-meta.mjs   (after npm run build)
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

if (!existsSync(DIST)) {
  fail(`dist/public not found. Run "npm run build" first.`);
}

function htmlFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

/** The route a file is served at, for readable error messages. */
function routeOf(file) {
  const relative = path.relative(DIST, file);
  if (relative === "index.html") return "/";
  // Pages are emitted flat as <path>.html; 404.html keeps its name because
  // Cloudflare looks for it by that exact filename.
  if (relative === "404.html") return "/404.html";
  return `/${relative.replace(/\.html$/, "").replace(/(?:^|\/)index$/, "")}`;
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  fail("No HTML files in dist/public. The prerender step did not run.");
}

const titles = new Map();
const descriptions = new Map();
const missing = [];

for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const route = routeOf(file);

  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim();
  const description = (
    html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || []
  )[1]?.trim();
  const canonical = (
    html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || []
  )[1]?.trim();

  /*
    404.html is the one page with no canonical, on purpose.

    It is served for URLs that do not exist, so there is no address it could
    honestly point at. Claiming one would either name a page that also does
    not exist, or tell Google this content lives at some real URL. It carries
    noindex instead, which is the correct signal, and Google ignores canonical
    on a non-200 response anyway. It still needs a title and a description.
  */
  const isNotFoundPage = route === "/404.html";

  const absent = [];
  if (!title) absent.push("title");
  if (!description) absent.push("description");
  if (!canonical && !isNotFoundPage) absent.push("canonical");
  if (absent.length > 0) missing.push(`  ${route}  missing: ${absent.join(", ")}`);

  if (title) titles.set(title, [...(titles.get(title) || []), route]);
  if (description) {
    descriptions.set(description, [...(descriptions.get(description) || []), route]);
  }
}

const duplicates = (map, label) =>
  [...map.entries()]
    .filter(([, routes]) => routes.length > 1)
    .map(([value, routes]) => {
      const snippet = value.length > 70 ? `${value.slice(0, 70)}...` : value;
      return `  ${label} "${snippet}"\n      shared by: ${routes.join(", ")}`;
    });

const duplicateTitles = duplicates(titles, "title");
const duplicateDescriptions = duplicates(descriptions, "description");

console.log(
  `Checked ${pages.length} prerendered pages: ` +
    `${titles.size} distinct titles, ${descriptions.size} distinct descriptions.`,
);

const problems = [];
if (missing.length > 0) {
  problems.push(`${missing.length} page(s) with missing metadata:\n${missing.join("\n")}`);
}
if (duplicateTitles.length > 0) {
  problems.push(`${duplicateTitles.length} duplicate title(s):\n${duplicateTitles.join("\n")}`);
}
if (duplicateDescriptions.length > 0) {
  problems.push(
    `${duplicateDescriptions.length} duplicate description(s):\n${duplicateDescriptions.join("\n")}`,
  );
}

if (problems.length > 0) {
  fail(
    `${problems.join("\n\n")}\n\n` +
      `  Each route needs its own title, description and canonical, set in ` +
      `script/prerender.ts\n  (or in the page's useSEO call for routes that ` +
      `are not prerendered).`,
  );
}

console.log("\nOK  every page has a unique title, a unique description, and a canonical.");
