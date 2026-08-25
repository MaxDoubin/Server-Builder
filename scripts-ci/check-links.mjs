#!/usr/bin/env node
/**
 * Internal link check over the prerendered output.
 *
 * Walks every dist/public/**\/*.html and resolves each internal href and src
 * against the files actually on disk, using the same directory-index rule the
 * host uses: /foo is served from /foo/index.html.
 *
 * Both root-relative ("/blog/x") and site-absolute ("https://maxdoubin.com/
 * blog/x") forms count as internal, because script/prerender.ts writes the
 * static crawler content with absolute URLs. Other hosts, mailto:, tel:, and
 * bare "#anchor" links are ignored.
 *
 * Why it matters here specifically: client/public/_redirects contains
 *   /* /index.html 200
 * so a broken internal link does not 404. It silently serves the home page
 * document instead, complete with the home page's title, description and
 * canonical. A crawler sees a duplicate of the home page; a reader sees the
 * site "work" while the URL is wrong. Nothing surfaces it except this check.
 *
 * A failure usually means one of two things: a nav or content link was added
 * before the matching entry in script/prerender.ts, or a page was renamed and
 * something still points at the old path.
 *
 * Usage: node scripts-ci/check-links.mjs   (after npm run build)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");
const SITE_ORIGIN = "https://maxdoubin.com";

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

/** Root-relative path for an internal link, or null if the link is external. */
function toInternalPath(value) {
  if (value.startsWith(`${SITE_ORIGIN}/`) || value === SITE_ORIGIN) {
    return value.slice(SITE_ORIGIN.length) || "/";
  }
  // "//cdn.example.com/x" is protocol-relative and external.
  if (value.startsWith("//")) return null;
  if (value.startsWith("/")) return value;
  return null;
}

/** Does this path resolve to a real file, directory-index rules included? */
function resolves(urlPath) {
  const clean = urlPath.split("#")[0].split("?")[0];
  if (clean === "" || clean === "/") {
    return existsSync(path.join(DIST, "index.html"));
  }

  // Refuse to walk out of dist, and decode %20 style escapes in filenames.
  let decoded;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    decoded = clean;
  }
  const target = path.join(DIST, decoded);
  if (!target.startsWith(DIST)) return false;

  if (existsSync(target) && statSync(target).isFile()) return true;
  // Prerendered pages are flat files: /verify is served from verify.html.
  // The directory form is still accepted for anything copied in as-is.
  if (existsSync(`${target}.html`)) return true;
  return existsSync(path.join(target, "index.html"));
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  fail("No HTML files in dist/public. The prerender step did not run.");
}

// link -> the pages that contain it, so a failure names somewhere to look.
const links = new Map();
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const internal = toInternalPath(match[1]);
    if (internal === null) continue;
    checked += 1;
    if (!links.has(internal)) links.set(internal, new Set());
    links.get(internal).add(path.relative(DIST, page));
  }
}

const broken = [...links.entries()].filter(([target]) => !resolves(target));

console.log(
  `Checked ${checked} internal references (${links.size} unique) across ` +
    `${pages.length} HTML files.`,
);

if (broken.length > 0) {
  const detail = broken
    .map(([target, sources]) => {
      const from = [...sources].slice(0, 3).join(", ");
      const more = sources.size > 3 ? ` (+${sources.size - 3} more)` : "";
      return `  ${target}\n      referenced by: ${from}${more}`;
    })
    .join("\n");
  fail(`${broken.length} internal link(s) do not resolve to a file:\n${detail}`);
}

console.log("\nOK  every internal link resolves.");
