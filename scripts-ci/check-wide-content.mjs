/**
 * Guard the escape hatch for content that is wider than a phone.
 *
 * A table, a code block or a diagram is often wider than 375px and there is
 * nothing to be done about that: a five column comparison does not become a
 * four column one because the reader is on a train. The only question is what
 * happens to the surplus, and there are exactly two answers. Either the
 * element sits in its own horizontal scroller, and the reader swipes to the
 * rest of it, or it does not, and the surplus is clipped by whichever ancestor
 * has `overflow: hidden` and is gone. Not truncated with an ellipsis, not
 * shrunk, not reachable by scrolling the page: gone, with nothing on screen to
 * suggest anything is missing.
 *
 * That shipped. `marked` emits a bare `<table>`, the article column sits
 * inside an `overflow-hidden` ancestor, and thirteen posts quietly lost their
 * right-hand column on a phone. The fix was a renderer extension that wraps
 * every table in a scroller; this gate is what stops the wrapper going away
 * again, because nothing about a bare table looks wrong on a desktop and the
 * regression would ship exactly the same way twice.
 *
 * Three things are checked, all against build output rather than source, so
 * this cannot be satisfied by a rule that does not survive the bundler:
 *
 *   1. Every table in a prerendered page is inside a `.post-table-scroll`.
 *   2. That class actually scrolls in the shipped CSS.
 *   3. Prose `pre` still scrolls in the shipped CSS.
 *
 * Run `npm run build` first: with no build output there is nothing to check
 * and the gate says so rather than passing on an empty set.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";

const OUT = path.resolve("dist/public");
const WRAPPER = "post-table-scroll";

const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(OUT)) {
  console.error(`No build output at ${OUT}. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (full.endsWith(ext)) out.push(full);
  }
  return out;
}

// 1. Every table reachable.
//
// The wrapper opens immediately before the table, so a bounded look-behind is
// enough and avoids parsing the whole document. 320 characters is generous:
// the wrapper carries a class, a tabindex, a role and a label, and nothing
// else is allowed between it and the table.
const pages = walk(OUT, ".html");
let tables = 0;
const bare = [];

for (const page of pages) {
  const html = readFileSync(page, "utf8");
  for (const m of html.matchAll(/<table[\s>]/g)) {
    tables += 1;
    const before = html.slice(Math.max(0, m.index - 320), m.index);
    if (!before.includes(WRAPPER)) {
      bare.push(`${path.relative(OUT, page)} (byte ${m.index})`);
    }
  }
}

if (pages.length === 0) fail("No prerendered pages found. Did the build run?");

if (bare.length) {
  fail(
    `${bare.length} of ${tables} tables are not inside a .${WRAPPER}, so on a\n` +
      `  phone their right-hand columns are clipped with no way to scroll to them:\n` +
      bare.slice(0, 12).map((b) => `    ${b}`).join("\n") +
      (bare.length > 12 ? `\n    ... and ${bare.length - 12} more` : "") +
      `\n  Every markdown renderer must go through marked.use(scrollableTables).`,
  );
}

// 2 and 3. The affordance has to survive into the shipped CSS. A wrapper that
// does not scroll is worse than no wrapper, because it looks like the problem
// was handled.
const sheets = existsSync(path.join(OUT, "assets"))
  ? walk(path.join(OUT, "assets"), ".css")
  : [];
if (sheets.length === 0) fail("No stylesheet in the build output to check.");

const css = sheets.map((s) => readFileSync(s, "utf8")).join("\n");
// Minified CSS drops the space after the colon, so match either form.
const scrolls = (selector) => {
  const i = css.indexOf(selector);
  if (i === -1) return null;
  // A declaration block is short; the property must be inside this one.
  const block = css.slice(i, css.indexOf("}", i) + 1);
  return /overflow-x:\s*auto/.test(block);
};

for (const [selector, what] of [
  [`.${WRAPPER}`, "the table scroller"],
  [".cinematic-prose pre", "a prose code block"],
]) {
  const r = scrolls(selector);
  if (r === null) fail(`\`${selector}\` is not in the shipped CSS, so ${what} has no rule at all.`);
  else if (!r) fail(`\`${selector}\` is in the shipped CSS but no longer sets overflow-x: auto, so ${what} clips instead of scrolling.`);
}

if (failures.length) {
  console.error("Content wider than a phone has to stay reachable.\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(
  `ok: ${tables} tables across ${pages.length} pages are all inside a scroller, ` +
    `and both scrollers survive into the shipped CSS.`,
);
