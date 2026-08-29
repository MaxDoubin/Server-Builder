/**
 * Structural validity of the prerendered HTML.
 *
 * Five blog posts ship a second <div id="root"> buried inside a <pre> block,
 * and the shell markup that came with it leaves <pre>, <code>, <article> and
 * <main> unclosed for the rest of the document. The cause is a $ substitution
 * in script/prerender.ts and check-prerender-splice.mjs owns it; what matters
 * here is that nothing noticed. Every other gate on this build passed. The
 * page had a title, a description, a canonical, valid JSON-LD, resolving
 * links and enough body text to clear the prerender-depth floor, so eleven
 * checks said the page was fine while a third of the article sat inside a
 * stylesheet.
 *
 * A duplicate id is the quiet half of that. Two elements answering to the
 * same id means getElementById returns whichever came first, every "#id"
 * anchor lands on one of them by luck, and a <label for> points at whichever
 * the parser reached first. Nothing throws. The page just behaves like a
 * different page than the one in the source.
 *
 * So this parses each built document properly, with the attribute quoting
 * and the raw-text elements and the implied end tags that a real parser has,
 * and reports the four structural faults that break a page silently:
 *
 *   - the same id twice on one page
 *   - an <a> inside an <a>, which no browser will nest and every browser
 *     will silently flatten into something the author did not write
 *   - a block element inside a <p>, which closes the <p> early and moves
 *     every following node up a level from where the markup put it
 *   - an element that is never closed, or closed out of order
 *
 * Usage: node scripts-ci/check-html-validity.mjs   (after npm run build)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist/public");

/**
 * Faults that already exist in the build, with the reason each is not fixed
 * here. This is a ratchet, not an exemption: a page listed below may only
 * carry the kinds of fault named for it, any other page failing anything
 * fails the build, and a page that has been fixed but is still listed also
 * fails the build so the list cannot outlive the bug.
 *
 * Every entry below is one root cause: injectRootContent in
 * script/prerender.ts passes rendered article HTML as the replacement
 * argument of String.replace, so a "$&" in the article splices the page
 * shell into the middle of it. See scripts-ci/check-prerender-splice.mjs for
 * the full explanation and the one-line fix. Owner: script/prerender.ts.
 */
const KNOWN = {
  "blog/constrained-decoding-structured-output.html": ["duplicate-id", "unclosed"],
  "blog/idempotence-and-config-drift.html": ["duplicate-id", "unclosed"],
  "blog/linux-disk-io-troubleshooting.html": ["duplicate-id", "unclosed"],
  "blog/linux-network-tuning-without-cargo-cult.html": ["duplicate-id", "unclosed"],
  "blog/secrets-without-a-vault-team.html": ["duplicate-id", "unclosed"],
};

/**
 * The one orphan </div> that every page carries, from the same function.
 *
 * injectRootContent replaces `<div id="root"> ... </div> <style>` with a
 * string that closes #root itself:
 *
 *     `<div id="root">${CSS}<div id="prerender">${content}</div></div>\n    <style>`
 *
 * The template's own `</div>` after the spinner's <style> block is not part
 * of the match, so it survives, and every document ends with two <div> opens
 * against three closes. Browsers drop an unmatched end tag, so nothing looks
 * wrong, but the served markup is invalid on all 336 pages.
 *
 * Narrowly scoped on purpose: only a `</div>` with nothing after it but
 * `</body>` and `</html>` is waved through. A stray close anywhere else is a
 * new bug and still fails the build.
 *
 * Fix: either extend the pattern to `[\\s\\S]*?</div>\\s*<style>[\\s\\S]*?</style>\\s*</div>`
 * and emit the closing `</div>` once, or drop one `</div>` from the
 * replacement string. Owner: script/prerender.ts.
 */
const KNOWN_TRAILING_DIV = "trailing </div> from injectRootContent";

/** Elements that never have an end tag. */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Elements whose contents are text, not markup. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

/**
 * Block elements that close an open <p> when they start. This is the HTML5
 * rule, not a preference: the parser moves them out of the paragraph, so the
 * tree the author wrote and the tree the browser builds are different.
 */
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
  "h4", "h5", "h6", "header", "hgroup", "hr", "main", "menu", "nav", "ol",
  "p", "pre", "search", "section", "table", "ul",
]);

/**
 * Elements whose end tag may be omitted, and the start tags that imply it.
 * Without these a perfectly legal table or list reads as a pile of unclosed
 * elements and the gate cries wolf on correct markup.
 */
const IMPLIED_END = {
  li: new Set(["li"]),
  dt: new Set(["dt", "dd"]),
  dd: new Set(["dt", "dd"]),
  td: new Set(["td", "th", "tr"]),
  th: new Set(["td", "th", "tr"]),
  tr: new Set(["tr"]),
  thead: new Set(["tbody", "tfoot"]),
  tbody: new Set(["tbody", "tfoot"]),
  option: new Set(["option", "optgroup"]),
  optgroup: new Set(["optgroup"]),
  p: CLOSES_P,
};

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

/** 1-based line number of an offset, so an error points somewhere openable. */
function lineAt(html, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < html.length; i += 1) {
    if (html[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Every tag in the document, in order.
 *
 * Attribute values are scanned with their quoting respected, so a ">" inside
 * an attribute does not end the tag early. Raw-text elements are skipped
 * whole: CSS full of ">" selectors and JS full of "<" comparisons are not
 * markup and must not be parsed as any.
 */
function scanTags(html) {
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
    // <!doctype>, <![CDATA[ ... , and processing instructions.
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    const head = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 80));
    if (!head) {
      // A bare "<" in text. Not a tag.
      i = lt + 1;
      continue;
    }

    const isClose = head[1] === "/";
    const name = head[2].toLowerCase();

    let j = lt + head[0].length;
    let selfClosing = false;
    while (j < html.length) {
      const c = html[j];
      if (c === '"' || c === "'") {
        const end = html.indexOf(c, j + 1);
        j = end === -1 ? html.length : end + 1;
        continue;
      }
      if (c === ">") break;
      if (c === "/" && html[j + 1] === ">") {
        selfClosing = true;
        j += 1;
        continue;
      }
      j += 1;
    }

    out.push({
      close: isClose,
      name,
      start: lt,
      raw: html.slice(lt, Math.min(j + 1, html.length)),
      selfClosing,
    });
    i = j + 1;

    // Skip the body of a raw-text element so its contents are never parsed.
    if (!isClose && !selfClosing && RAW_TEXT.has(name)) {
      const closeRe = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(i);
      const m = closeRe.exec(rest);
      if (!m) {
        // No end tag at all. Report it as unclosed and stop: everything after
        // this point is text as far as the browser is concerned.
        out.push({ close: false, name: `${name}:unterminated`, start: lt, raw: "", selfClosing: false });
        break;
      }
      out.push({ close: true, name, start: i + m.index, raw: m[0], selfClosing: false });
      i += m.index + m[0].length;
    }
  }

  return out;
}

/** Every structural fault in one document. */
function inspect(html) {
  const faults = [];
  const stack = [];
  const ids = new Map();
  let anchorDepth = 0;
  let tagCount = 0;

  const add = (kind, offset, detail, extra = {}) =>
    faults.push({ kind, line: lineAt(html, offset), detail, ...extra });

  const tags = scanTags(html);

  /** Is this the last tag in the document apart from </body> and </html>? */
  const atDocumentEnd = (index) =>
    tags
      .slice(index + 1)
      .every((t) => t.close && (t.name === "body" || t.name === "html"));

  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (tag.name.endsWith(":unterminated")) {
      add("unclosed", tag.start, `<${tag.name.split(":")[0]}> is never closed`);
      continue;
    }
    tagCount += 1;

    if (!tag.close) {
      const id = /\sid="([^"]*)"/.exec(tag.raw);
      if (id) {
        const seen = ids.get(id[1]);
        if (seen !== undefined) {
          add(
            "duplicate-id",
            tag.start,
            `id="${id[1]}" already used at line ${seen} on this page`,
          );
        } else {
          ids.set(id[1], lineAt(html, tag.start));
        }
      }

      // Implied end tags, applied before anything else looks at the stack.
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const implied = IMPLIED_END[top.name];
        if (!implied || !implied.has(tag.name)) break;
        if (top.name === "p" && tag.name !== "p") {
          add(
            "block-in-p",
            tag.start,
            `<${tag.name}> inside the <p> opened at line ${lineAt(html, top.start)}. ` +
              `The parser closes the <p> here, so everything after it moves up a level.`,
          );
        }
        stack.pop();
      }

      if (VOID.has(tag.name) || tag.selfClosing) continue;

      if (tag.name === "a") {
        anchorDepth += 1;
        if (anchorDepth > 1) {
          add("nested-a", tag.start, `<a> inside an <a>; browsers will not nest these`);
        }
      }
      stack.push(tag);
      continue;
    }

    // An end tag.
    if (tag.name === "a") anchorDepth = Math.max(0, anchorDepth - 1);

    const at = stack.map((t) => t.name).lastIndexOf(tag.name);
    if (at === -1) {
      add(
        "stray-close",
        tag.start,
        `</${tag.name}> with no matching <${tag.name}>`,
        { trailingDiv: tag.name === "div" && atDocumentEnd(index) },
      );
      continue;
    }
    // Anything above the match was left open.
    for (let k = stack.length - 1; k > at; k -= 1) {
      const orphan = stack[k];
      if (IMPLIED_END[orphan.name]) continue; // legally omitted
      add(
        "unclosed",
        orphan.start,
        `<${orphan.name}> is still open at </${tag.name}> (line ${lineAt(html, tag.start)})`,
      );
    }
    stack.length = at;
  }

  for (const open of stack) {
    if (open.name === "html" || open.name === "body") continue;
    add("unclosed", open.start, `<${open.name}> is never closed`);
  }

  return { faults, tagCount };
}

if (!existsSync(DIST) || !statSync(DIST).isDirectory()) {
  fail(`dist/public not found. Run "npm run build" first.`);
}

const pages = htmlFiles(DIST);
if (pages.length === 0) {
  fail("No HTML files in dist/public. The prerender step did not run.");
}

const failures = [];
const knownHits = [];
const seenKnown = new Set();
let trailingDivPages = 0;
let totalTags = 0;

for (const file of pages) {
  const rel = path.relative(DIST, file);
  const html = readFileSync(file, "utf8");
  const { faults, tagCount } = inspect(html);
  totalTags += tagCount;

  const allowed = KNOWN[rel];
  for (const fault of faults) {
    const where = `${rel}:${fault.line}`;
    if (fault.trailingDiv) {
      trailingDivPages += 1;
      continue;
    }
    if (allowed && allowed.includes(fault.kind)) {
      seenKnown.add(rel);
      knownHits.push(`  ${where}  [${fault.kind}] ${fault.detail}`);
      continue;
    }
    failures.push(`  ${where}\n      [${fault.kind}] ${fault.detail}`);
  }
}

/*
  The gate must be able to fail. If the parser stopped seeing tags, every
  document is trivially valid and this check silently approves anything,
  which is the failure mode that let the spliced pages through eleven other
  checks in the first place.
*/
if (totalTags < pages.length * 10) {
  fail(
    `Parsed only ${totalTags} tags across ${pages.length} pages. The built ` +
      `output changed shape and this gate is no longer reading it, so it ` +
      `proved nothing. Fix scanTags in this file before trusting a pass.`,
  );
}

console.log(
  `Parsed ${totalTags} tags across ${pages.length} prerendered pages.`,
);

const stale = Object.keys(KNOWN).filter((rel) => !seenKnown.has(rel));
if (stale.length > 0) {
  fail(
    `${stale.length} page(s) in the KNOWN list are now structurally valid:\n` +
      stale.map((r) => `  ${r}`).join("\n") +
      `\n\n  That is the fix landing. Delete these entries from KNOWN in\n` +
      `  scripts-ci/check-html-validity.mjs so the list cannot outlive the bug.`,
  );
}

if (trailingDivPages === 0) {
  fail(
    `No page carries the ${KNOWN_TRAILING_DIV} any more.\n\n` +
      `  That is the fix landing in injectRootContent. Delete ` +
      `KNOWN_TRAILING_DIV\n  and the trailingDiv branch from ` +
      `scripts-ci/check-html-validity.mjs, so a\n  stray </div> at the end of ` +
      `a document fails the build again.`,
  );
}
console.log(
  `  ${trailingDivPages}/${pages.length} pages carry the known ` +
    `${KNOWN_TRAILING_DIV} (see the comment on KNOWN_TRAILING_DIV).`,
);

if (knownHits.length > 0) {
  console.log(
    `\n${knownHits.length} known fault(s) on ${seenKnown.size} page(s), ` +
      `all from the injectRootContent substitution bug:`,
  );
  for (const hit of knownHits.slice(0, 12)) console.log(hit);
  if (knownHits.length > 12) console.log(`  ... and ${knownHits.length - 12} more`);
  console.log(`  Root cause and fix: scripts-ci/check-prerender-splice.mjs`);
}

if (failures.length > 0) {
  const shown = failures.slice(0, 25).join("\n");
  const more = failures.length > 25 ? `\n  ... and ${failures.length - 25} more` : "";
  fail(
    `${failures.length} structural fault(s) in the built HTML:\n${shown}${more}\n\n` +
      `  duplicate-id   two elements answer to one id; anchors and <label for>\n` +
      `                 bind to whichever the parser reached first. Give one a\n` +
      `                 different id in the component that renders it.\n` +
      `  nested-a       remove the inner <a>; make it a <span> and move the\n` +
      `                 href to the outer element.\n` +
      `  block-in-p     the <p> closes early. Use a <div> instead of the <p>,\n` +
      `                 or move the block element out of it.\n` +
      `  unclosed       add the missing end tag in the component or the\n` +
      `                 markdown that produced this page.`,
  );
}

console.log(
  `\nOK  every page parses cleanly: no duplicate ids, no nested anchors, ` +
    `no blocks inside a <p>, every element closed.`,
);
