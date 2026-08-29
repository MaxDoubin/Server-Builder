/**
 * Every canonical must point at the page it is on.
 *
 * A canonical is the one tag that can delete a page from Google while the
 * page itself looks perfect. It is not advice about a duplicate; it is the
 * page telling a crawler "index that URL instead of me". Point /resume at
 * the home page and /resume stops existing in search results, silently, with
 * no error anywhere in the build and nothing visible to a reader.
 *
 * The risk here is structural, not hypothetical. script/prerender.ts writes
 * all 335 pages from one dist/public/index.html template by regex
 * substitution, and the template ships with the home page's canonical
 * already in it. So the default state of every new page is "canonical points
 * at the home page". A route added with a canonical left unset, or a
 * substitution that silently misses, does not produce an empty tag that
 * check-meta would catch. It produces a valid canonical for the wrong page.
 *
 * check-meta already asks whether a canonical exists and whether titles and
 * descriptions are unique. It never reads the canonical's value. This does:
 *
 *   - exactly one canonical per page, because two is the same as none
 *     (Google discards the signal when a page names two different URLs)
 *   - absolute, so it resolves the same from any path
 *   - https, because the http form is a different origin to a crawler
 *   - on maxdoubin.com exactly, not www and not a preview deployment
 *   - no query string and no fragment, which split one page into many
 *   - and the path must equal the path the file is actually served at
 *
 * og:url is checked against the canonical too. When they disagree the page
 * tells a crawler one thing and a link preview another, and the two answers
 * come from different lines in prerender.ts, so they drift independently.
 *
 * Usage: node scripts-ci/check-canonical.mjs   (after npm run build)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");
const ORIGIN = "https://maxdoubin.com";

/*
  404.html is the one page with no canonical, on purpose. It is served for
  URLs that do not exist, so there is no address it could honestly point at.
  It carries noindex instead, which is the correct signal. check-meta.mjs
  documents the same exemption for the same reason.
*/
const NO_CANONICAL = new Set(["404.html"]);

function fail(message) {
  console.error(`\nFAIL  ${message}\n`);
  process.exit(1);
}

function htmlFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

/**
 * The URL a built file is actually served at.
 *
 * Pages are emitted flat: dist/public/blog/foo.html is served at /blog/foo,
 * because Cloudflare Pages strips the .html. The home page is the origin with
 * no trailing slash, which is the form the build already writes and the form
 * every internal link uses.
 */
function servedUrl(rel) {
  if (rel === "index.html") return ORIGIN;
  const withoutExt = rel.slice(0, -".html".length).replace(/\/index$/, "");
  return `${ORIGIN}/${withoutExt}`;
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  fail(`dist/public not found. Run "npm run build" first.`);
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  fail("No HTML files in dist/public. The prerender step did not run.");
}

const problems = [];
let checked = 0;
let ogChecked = 0;

for (const file of pages) {
  const rel = path.relative(DIST, file);
  const html = readFileSync(file, "utf8");
  const expected = servedUrl(rel);

  const found = [
    ...html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]*)"[^>]*>/gi),
  ].map((m) => m[1].trim());

  if (found.length === 0) {
    if (!NO_CANONICAL.has(rel)) {
      problems.push(
        `${rel}\n      no canonical at all; it should be ${expected}`,
      );
    }
    continue;
  }

  if (NO_CANONICAL.has(rel)) {
    problems.push(
      `${rel}\n      has a canonical (${found[0]}) but must not have one.\n` +
        `      It is served for URLs that do not exist, so no URL is honest here.`,
    );
    continue;
  }

  if (found.length > 1) {
    problems.push(
      `${rel}\n      ${found.length} canonical tags: ${found.join(", ")}\n` +
        `      Two canonicals is the same as none; Google discards the signal.`,
    );
    continue;
  }

  checked += 1;
  const value = found[0];

  if (value === "") {
    problems.push(`${rel}\n      empty canonical href; it should be ${expected}`);
    continue;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    problems.push(
      `${rel}\n      canonical "${value}" is not an absolute URL.\n` +
        `      A relative canonical resolves differently depending on the path ` +
        `it is read from.\n      Use ${expected}`,
    );
    continue;
  }

  const faults = [];
  if (url.protocol !== "https:") {
    faults.push(`scheme is ${url.protocol.replace(":", "")}, must be https`);
  }
  if (url.host !== "maxdoubin.com") {
    faults.push(`host is ${url.host}, must be maxdoubin.com`);
  }
  if (url.search) faults.push(`carries a query string (${url.search})`);
  if (url.hash) faults.push(`carries a fragment (${url.hash})`);

  // Compare paths only once scheme and host are known good, so the message
  // names one fault rather than three restatements of the same one.
  if (faults.length === 0) {
    const actual = `${url.origin}${url.pathname}`.replace(/\/$/, "") || ORIGIN;
    if (actual !== expected) {
      faults.push(
        `points at ${actual}\n      but this file is served at ${expected}`,
      );
    }
  }

  if (faults.length > 0) {
    problems.push(`${rel}\n      ${faults.join("\n      ")}`);
    continue;
  }

  const og = [
    ...html.matchAll(/<meta\b[^>]*\bproperty="og:url"[^>]*\bcontent="([^"]*)"[^>]*>/gi),
  ].map((m) => m[1].trim());
  if (og.length > 0) {
    ogChecked += 1;
    const mismatched = og.filter((u) => u !== value);
    if (mismatched.length > 0) {
      problems.push(
        `${rel}\n      og:url ${mismatched[0]}\n` +
          `      does not match the canonical ${value}.\n` +
          `      The page tells a crawler one URL and a link preview another.`,
      );
    }
  }
}

/*
  The gate must be able to fail.

  If the canonical tag were reformatted so this regex stopped matching, every
  page would report "no canonical", which is loud. The dangerous direction is
  the opposite: a change that makes the file list empty, or one that makes
  every page look exempt, would leave this printing OK while checking
  nothing. So the count of canonicals actually parsed has to line up with the
  count of pages that are supposed to have one.
*/
const expectedCanonicals = pages.length - NO_CANONICAL.size;
if (checked < expectedCanonicals && problems.length === 0) {
  fail(
    `Parsed ${checked} canonicals from ${pages.length} pages but expected ` +
      `${expectedCanonicals}, and yet found nothing wrong. That combination ` +
      `means this gate stopped reading the output rather than that the output ` +
      `is clean. Fix the parse in scripts-ci/check-canonical.mjs.`,
  );
}

console.log(
  `Checked ${checked} canonicals across ${pages.length} pages ` +
    `(${NO_CANONICAL.size} exempt), and ${ogChecked} og:url values against them.`,
);

if (problems.length > 0) {
  const shown = problems.slice(0, 20).map((p) => `  ${p}`).join("\n");
  const more = problems.length > 20 ? `\n  ... and ${problems.length - 20} more` : "";
  fail(
    `${problems.length} page(s) with a bad canonical:\n${shown}${more}\n\n` +
      `  A canonical naming another page removes this one from search results,\n` +
      `  silently. Set the right value in the page's entry in ` +
      `script/prerender.ts\n  (the canonical field of its PageMeta), or in its ` +
      `useSEO call if the route\n  is not prerendered.`,
  );
}

console.log(
  `\nOK  every canonical is absolute, https, on maxdoubin.com, free of query ` +
    `and\n    fragment, and names the URL its own page is served at.`,
);
