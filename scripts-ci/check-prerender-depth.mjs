/**
 * Fail the build if a route prerenders no readable content.
 *
 * The prerenderer writes a real <div id="root"> body so that anything which
 * does not run JavaScript reads the page. Nineteen routes were missed:
 * /resume, /projects, /contact, /certifications, /cyber-club, /timeline,
 * /now, /uses, /archive, /paths, /links, /colophon, /ask, /subscribe,
 * /roadmap, /flashcards, /coding-camps, /study-timer, plus the
 * /ncl hub. Each shipped 297 characters: the site nav, and nothing else.
 * React filled them in on the client, which does not help a crawler, a
 * preview card, or an assistant answering a question about the site. The
 * resume page in particular was an empty document to every one of them.
 *
 * The nav is subtracted before measuring, because it is injected into every
 * page and would otherwise mask exactly the failure this catches: with it
 * counted, an empty page scores 297 and a real one scores 500, which is not
 * a gap a threshold can sit in safely.
 *
 * The floor is deliberately low. It is not a content-quality bar, it is a
 * did-anything-render check. The thinnest legitimate page today is a tool
 * page at 199 characters, which is a heading plus one sentence of what the
 * tool does; a nav-only page measures near zero.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const DIST = path.resolve("dist/public");
const FLOOR = 150;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Readable text inside the root div, with the injected site nav removed. */
function bodyText(html) {
  const start = html.indexOf('<div id="root">');
  if (start === -1) return null;
  const end = html.indexOf("<script", start);
  let body = html.slice(start, end === -1 ? html.length : end);
  /*
    Strip whole <style> and <script> elements, contents included, before the
    tag strip. Stripping tags alone leaves what was between them: the critical
    CSS injected into #root is about 1,100 characters, so every page scored
    1,100 for free and a genuinely empty one would have cleared the floor
    without a word of prose on it. A gate that always passes is worse than no
    gate, because it is trusted.
  */
  body = body.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  body = body.replace(/<nav aria-label="Site">[\s\S]*?<\/nav>/g, " ");
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const thin = [];
let checked = 0;

for (const file of walk(DIST)) {
  const rel = path.relative(DIST, file);
  const text = bodyText(readFileSync(file, "utf8"));

  if (text === null) {
    thin.push(`${rel}: no <div id="root"> in the document at all`);
    continue;
  }

  checked += 1;
  if (text.length < FLOOR) {
    thin.push(
      `${rel}: ${text.length} characters of body text, needs ${FLOOR}\n` +
        `    Give the route a rootContent in script/prerender.ts. Pages in the\n` +
        `    STANDALONE list read theirs from STANDALONE_CONTENT, keyed by dir.`,
    );
  }
}

if (thin.length) {
  console.error("Routes that prerender nothing a crawler can read:\n");
  for (const t of thin) console.error(`  ${t}\n`);
  process.exit(1);
}

console.log(
  `check-prerender-depth: ${checked} pages, all above ${FLOOR} characters of body text`,
);
