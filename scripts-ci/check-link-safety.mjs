/**
 * Links in the built HTML that are unsafe to follow or unsafe to load.
 *
 * Two faults, one gate, because both are "this URL attribute is wrong in a
 * way no reader will ever report".
 *
 * 1. target="_blank" without rel="noopener".
 *
 *    The opened page gets a live window.opener handle back to ours and can
 *    navigate it anywhere, so a link to a site that later turns hostile can
 *    replace the tab behind it with a copy of this one. It is also a
 *    performance bug on older engines, where the new document runs on the
 *    same process and its work janks the page the reader came from.
 *
 *    Current browsers imply noopener for target="_blank", which is exactly
 *    why this needs a gate rather than a habit: the failure is invisible on
 *    the machine of whoever adds the link, and lands on whoever is still on
 *    an older browser. 36 anchors in client/src already carry both, so the
 *    convention is established and the only job here is to keep it.
 *
 * 2. Any http:// or protocol-relative URL.
 *
 *    An http:// subresource on an https page is blocked outright as mixed
 *    content, so the image or script simply never loads and the page looks
 *    broken in a way the build cannot see. An http:// link is not blocked;
 *    it is downgraded, which strips the referrer, hands the reader's request
 *    to anyone on the path, and costs a redirect on arrival.
 *
 *    This checks real URL attributes only, never page text. Blog posts are
 *    full of http:// inside code samples (proxy_pass http://backend, an iPXE
 *    boot URL, a localhost metrics endpoint) and every one of those is
 *    correct as written. Attribute or nothing.
 *
 * Usage: node scripts-ci/check-link-safety.mjs   (after npm run build)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");

/**
 * Insecure URLs that already exist in the build, with the fix for each.
 *
 * A ratchet, not an exemption: anything not listed fails the build, and an
 * entry that no longer matches anything also fails the build, so the list
 * cannot outlive the bug it documents.
 */
const KNOWN_INSECURE = {
  "http://factordb.com/":
    "client/src/lib/nclGuides.ts, the factordb tool entry. The host serves " +
    "https\n      correctly, so the fix is the single character: " +
    "https://factordb.com/",
};

/** Attributes that hold a URL, by element. */
const URL_ATTRS = {
  a: ["href"],
  area: ["href"],
  link: ["href"],
  img: ["src", "srcset"],
  source: ["src", "srcset"],
  script: ["src"],
  iframe: ["src"],
  embed: ["src"],
  audio: ["src"],
  video: ["src", "poster"],
  track: ["src"],
  input: ["src", "formaction"],
  button: ["formaction"],
  form: ["action"],
  object: ["data"],
};

/**
 * <meta> content is a URL only for these. Everything else in a content
 * attribute is prose, and prose mentioning http:// is not a broken link.
 */
const URL_META = new Set([
  "og:image",
  "og:image:url",
  "og:image:secure_url",
  "og:url",
  "og:audio",
  "og:video",
  "twitter:image",
  "twitter:player",
]);

/** Elements whose contents are text, not markup. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

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

function lineAt(html, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < html.length; i += 1) {
    if (html[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Every start tag in the document, with its attributes.
 *
 * Quoting is respected so a ">" inside an attribute does not end the tag
 * early, and raw-text elements are skipped whole so CSS and JS are never
 * mistaken for markup.
 */
function startTags(html) {
  const out = [];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 80));
    if (!head) {
      i = lt + 1;
      continue;
    }
    const isClose = head[1] === "/";
    const name = head[2].toLowerCase();

    let j = lt + head[0].length;
    while (j < html.length) {
      const c = html[j];
      if (c === '"' || c === "'") {
        const end = html.indexOf(c, j + 1);
        j = end === -1 ? html.length : end + 1;
        continue;
      }
      if (c === ">") break;
      j += 1;
    }

    const raw = html.slice(lt, Math.min(j + 1, html.length));
    if (!isClose) {
      const attrs = {};
      for (const m of raw.matchAll(/\b([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*"([^"]*)"/g)) {
        attrs[m[1].toLowerCase()] = m[2];
      }
      out.push({ name, attrs, start: lt, raw });
    }
    i = j + 1;

    if (!isClose && RAW_TEXT.has(name) && !/\/>$/.test(raw)) {
      const m = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(i));
      if (!m) break;
      i += m.index + m[0].length;
    }
  }

  return out;
}

/** srcset is "url 1x, url 2x"; everything else is a single URL. */
function urlsIn(attr, value) {
  if (attr !== "srcset") return [value.trim()];
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean);
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  fail(`dist/public not found. Run "npm run build" first.`);
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  fail("No HTML files in dist/public. The prerender step did not run.");
}

const unsafeTarget = [];
const insecure = [];
const knownHits = new Map();
let anchors = 0;
let externalAnchors = 0;
let blankTargets = 0;
let urlsChecked = 0;

for (const file of pages) {
  const rel = path.relative(DIST, file);
  const html = readFileSync(file, "utf8");

  for (const tag of startTags(html)) {
    const where = `${rel}:${lineAt(html, tag.start)}`;

    if (tag.name === "a" && tag.attrs.href !== undefined) {
      anchors += 1;
      if (/^https?:\/\//i.test(tag.attrs.href)) externalAnchors += 1;
    }

    // 1. target="_blank" must carry rel="noopener".
    if (tag.attrs.target === "_blank") {
      blankTargets += 1;
      const rel_ = (tag.attrs.rel || "").toLowerCase().split(/\s+/);
      if (!rel_.includes("noopener") && !rel_.includes("noreferrer")) {
        unsafeTarget.push(
          `  ${where}\n      ${tag.raw.slice(0, 130)}\n` +
            `      opens a new tab and hands it a live window.opener back to ` +
            `this page.`,
        );
      }
    }

    // 2. No http:// and no protocol-relative URLs.
    const attrList =
      tag.name === "meta"
        ? URL_META.has((tag.attrs.property || tag.attrs.name || "").toLowerCase())
          ? ["content"]
          : []
        : URL_ATTRS[tag.name] || [];

    for (const attr of attrList) {
      const value = tag.attrs[attr];
      if (value === undefined) continue;
      for (const url of urlsIn(attr, value)) {
        if (!url) continue;
        urlsChecked += 1;

        if (/^http:\/\//i.test(url)) {
          if (KNOWN_INSECURE[url]) {
            if (!knownHits.has(url)) knownHits.set(url, []);
            knownHits.get(url).push(where);
            continue;
          }
          insecure.push(
            `  ${where}\n      <${tag.name} ${attr}="${url}">\n` +
              `      http:// on an https page: a subresource is blocked as mixed ` +
              `content,\n      a link is downgraded and leaks the referrer.`,
          );
          continue;
        }

        if (url.startsWith("//") && !url.startsWith("///")) {
          insecure.push(
            `  ${where}\n      <${tag.name} ${attr}="${url}">\n` +
              `      protocol-relative URL: it inherits http when the page is ` +
              `ever loaded\n      over http, and resolves to nothing from a ` +
              `file:// or non-web context.`,
          );
        }
      }
    }
  }
}

/*
  The gate must be able to fail.

  Both halves of this check are currently near-vacuous by luck rather than by
  design: the build has one insecure URL and zero target="_blank", because
  every _blank anchor in client/src lives in a component that only renders on
  the client. If the tag scanner broke, the output would be identical to a
  clean pass. So the population it walked has to be shown to be real before a
  pass means anything.
*/
if (anchors < pages.length) {
  fail(
    `Parsed ${anchors} anchors across ${pages.length} pages. Every page ships ` +
      `a site nav,\n  so this is far too few: the tag scanner is no longer ` +
      `reading the build and a\n  pass here would prove nothing. Fix startTags ` +
      `in scripts-ci/check-link-safety.mjs.`,
  );
}
if (externalAnchors === 0 || urlsChecked < pages.length) {
  fail(
    `Walked ${urlsChecked} URL attributes and found ${externalAnchors} external ` +
      `links across\n  ${pages.length} pages. That is not a clean build, that is ` +
      `a broken parse.\n  Fix URL_ATTRS and startTags in ` +
      `scripts-ci/check-link-safety.mjs.`,
  );
}

console.log(
  `Walked ${urlsChecked} URL attributes across ${pages.length} pages: ` +
    `${anchors} anchors\n(${externalAnchors} external), ${blankTargets} opening ` +
    `in a new tab.`,
);

const stale = Object.keys(KNOWN_INSECURE).filter((url) => !knownHits.has(url));
if (stale.length > 0) {
  fail(
    `${stale.length} entr(y/ies) in KNOWN_INSECURE no longer appear in the build:\n` +
      stale.map((u) => `  ${u}`).join("\n") +
      `\n\n  That is the fix landing. Delete them from KNOWN_INSECURE in\n` +
      `  scripts-ci/check-link-safety.mjs so the list cannot outlive the bug.`,
  );
}

if (knownHits.size > 0) {
  console.log(`\n${knownHits.size} known insecure URL(s), not yet fixed:`);
  for (const [url, wheres] of knownHits) {
    console.log(`  ${url}  (${wheres.length} page: ${wheres.join(", ")})`);
    console.log(`      ${KNOWN_INSECURE[url]}`);
  }
}

const problems = [];
if (unsafeTarget.length > 0) {
  problems.push(
    `${unsafeTarget.length} link(s) open a new tab without rel="noopener":\n` +
      unsafeTarget.slice(0, 15).join("\n") +
      (unsafeTarget.length > 15 ? `\n  ... and ${unsafeTarget.length - 15} more` : "") +
      `\n\n  Add rel="noopener noreferrer" alongside target="_blank" on each.`,
  );
}
if (insecure.length > 0) {
  problems.push(
    `${insecure.length} insecure URL(s):\n` +
      insecure.slice(0, 15).join("\n") +
      (insecure.length > 15 ? `\n  ... and ${insecure.length - 15} more` : "") +
      `\n\n  Change each to https://. If the host genuinely has no https, drop ` +
      `the link\n  rather than shipping a downgrade.`,
  );
}

if (problems.length > 0) fail(problems.join("\n\n"));

console.log(
  `\nOK  every new-tab link carries rel="noopener", and every URL attribute ` +
    `is\n    https or same-origin.`,
);
