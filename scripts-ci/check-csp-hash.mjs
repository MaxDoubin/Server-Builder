#!/usr/bin/env node
/**
 * The CSP script hash must match the script it is there to allow.
 *
 * script-src in client/public/_headers no longer carries 'unsafe-inline'. It
 * names one sha256 instead, for the boot veil in client/index.html, which has
 * to run before the first paint and so cannot be a module.
 *
 * That is a strictly better policy and a strictly more fragile one. Edit a
 * character of that script, or let a build step reformat it, and the hash no
 * longer matches: the veil silently stops running and every visitor sees the
 * page before the entrance animation. Nothing else would notice, because the
 * page still works.
 *
 * So this recomputes the hash from the built HTML and compares. It also fails
 * if a second executable inline script appears anywhere in the build, because
 * that script would be blocked in production and pass every other check here.
 *
 * type="application/ld+json" blocks are ignored on purpose. The HTML parser
 * treats them as data blocks and never prepares them as scripts, so script-src
 * does not gate them, and there are 730 of them.
 *
 * Inline event handlers (onload="...", onclick="...") are the same problem in
 * a different place. Without 'unsafe-inline' or 'unsafe-hashes' the browser
 * refuses every one of them, and again the page mostly works: the Google Fonts
 * sheet sat at media="print" on every page because the onload that was meant
 * to flip it to "all" never ran. So any on*= attribute in built HTML fails.
 *
 * Usage: node scripts-ci/check-csp-hash.mjs   (after npm run build)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const DIST = path.resolve("dist/public");
const HEADERS = "client/public/_headers";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".html")) out.push(full);
  }
  return out;
}

const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  process.exit(1);
};

const pages = walk(DIST);
if (pages.length === 0) fail("no HTML in dist/public. The build did not run.");

/** Inline <script> with no src, excluding data blocks. */
const INLINE = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g;

/**
 * Inline event-handler attributes. Script, style and comment bodies go first
 * so prose and JSON-LD cannot match, then each tag has its quoted attribute
 * values blanked so a value that merely mentions "onload=" cannot either.
 */
const NOT_MARKUP = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const QUOTED = /"[^"]*"|'[^']*'/g;
const HANDLER = /[\s"'/](on[a-z]+)\s*=/gi;

function inlineHandlers(html) {
  const out = [];
  for (const tag of html.replace(NOT_MARKUP, "").match(TAG) ?? []) {
    for (const m of tag.replace(QUOTED, '""').matchAll(HANDLER)) {
      out.push({ attr: m[1].toLowerCase(), tag: tag.replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  return out;
}

const found = new Map(); // hash -> { count, sample, body }
const handlers = new Map(); // "attr tag" -> { count, sample, attr, tag }
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  for (const h of inlineHandlers(html)) {
    const key = `${h.attr} ${h.tag}`;
    const seen = handlers.get(key) ?? { count: 0, sample: path.relative(DIST, file), ...h };
    seen.count += 1;
    handlers.set(key, seen);
  }
  for (const m of html.matchAll(INLINE)) {
    const attrs = m[1];
    if (/type\s*=\s*["']application\/(ld\+json|json)["']/i.test(attrs)) continue;
    const body = m[2];
    const hash = `sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`;
    const seen = found.get(hash) ?? { count: 0, sample: path.relative(DIST, file), body };
    seen.count += 1;
    found.set(hash, seen);
  }
}

const headers = readFileSync(HEADERS, "utf8");
const csp = headers.split("\n").find((l) => l.trim().startsWith("Content-Security-Policy:"));
if (!csp) fail(`no Content-Security-Policy line in ${HEADERS}.`);

const declared = new Set([...csp.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]));

if (/script-src[^;]*'unsafe-inline'/.test(csp)) {
  fail(
    `script-src carries 'unsafe-inline' again in ${HEADERS}.\n\n` +
      `  That makes the hash below decorative: any injected inline script runs.\n` +
      `  If a new inline script needs allowing, add its hash, not the keyword.`,
  );
}

const missing = [...found.entries()].filter(([h]) => !declared.has(h));
if (missing.length > 0) {
  console.error(
    `FAIL  ${missing.length} executable inline script(s) in the build are not allowed by the CSP:\n`,
  );
  for (const [hash, info] of missing) {
    console.error(`  ${hash}`);
    console.error(`    on ${info.count} page(s), e.g. ${info.sample}`);
    console.error(`    starts: ${info.body.trim().slice(0, 90).replace(/\s+/g, " ")}`);
  }
  console.error(
    `\n  Either the boot script changed, in which case put the hash above into\n` +
      `  script-src in ${HEADERS}, or something added a second inline script,\n` +
      `  in which case it is blocked in production and should become a module.`,
  );
  process.exit(1);
}

const stale = [...declared].filter((h) => !found.has(h));
if (stale.length > 0) {
  console.error(`FAIL  ${stale.length} sha256 hash(es) in the CSP match nothing in the build:\n`);
  for (const h of stale) console.error(`  ${h}`);
  console.error(
    `\n  A hash that allows nothing is a hash nobody will notice is wrong.\n` +
      `  Remove it from ${HEADERS}, or work out which script it was for.`,
  );
  process.exit(1);
}

if (handlers.size > 0) {
  console.error(
    `FAIL  ${handlers.size} inline event handler(s) in the build, which the CSP refuses to run:\n`,
  );
  for (const info of handlers.values()) {
    console.error(`  ${info.attr}= on ${info.count} page(s), e.g. ${info.sample}`);
    console.error(`    ${info.tag}`);
  }
  console.error(
    `\n  script-src has no 'unsafe-inline' and no 'unsafe-hashes', so the browser\n` +
      `  drops these silently. Attach the listener from a bundled module instead.`,
  );
  process.exit(1);
}

const total = [...found.values()].reduce((a, v) => a + v.count, 0);
console.log(
  `check-csp-hash: ${found.size} executable inline script(s) across ${pages.length} pages ` +
    `(${total} instances), every one allowed by a hash in _headers, no 'unsafe-inline', and no inline event handlers.`,
);
