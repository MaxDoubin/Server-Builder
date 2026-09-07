#!/usr/bin/env node
/**
 * Every fixed-position element must say what it does when printed.
 *
 * A position:fixed element is viewport chrome. Print has no viewport: the
 * browser drops it onto the first printed page and leaves it there. Printing
 * a post used to come out with the site header across the top, a "5 min left"
 * pill in the corner, a scroll-progress bar and the toast container, none of
 * which mean anything on paper. Each of those was found by hand, one at a
 * time, and the next one added would not have been found at all.
 *
 * So the rule is mechanical: if an element is fixed, it carries
 * data-print-hide. If some future fixed element really should print, it can
 * be listed in KEEP below with a reason, which is the same decision made
 * once in the open instead of silently.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/*
  A hand-rolled walk rather than fs.globSync: globSync arrived in Node 22 and
  CI runs Node 20, so the glob version passed locally and died in CI on the
  import line. Every other gate in here walks directories this way.
*/
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = walk("client/src");

/** Fixed elements that are meant to reach paper. Empty, so far. */
const KEEP = new Set();

/**
 * A standalone `fixed` class token. Tailwind allows variant prefixes
 * (md:fixed, print:fixed), so the token may carry one. The boundaries stop
 * this matching `fixed-width` or a `fixed` inside prose.
 */
const FIXED = /(?<![\w:-])(?:[a-z0-9-]+:)*fixed(?![\w-])/;

/**
 * Walk back from a position to the `<` that opens the JSX tag it sits in,
 * then forward to that tag's `>`. Quotes and braces are tracked so a `>`
 * inside a string or an expression does not end the tag early.
 */
function tagSpan(src, at) {
  let start = -1;
  for (let i = at; i >= 0; i -= 1) {
    if (src[i] === "<") { start = i; break; }
    if (src[i] === ">") return null; // fell out of a tag: not in one
  }
  if (start < 0) return null;

  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

const problems = [];

for (const file of FILES) {
  const src = readFileSync(file, "utf8");
  // Only look inside className values, so the word "fixed" in a comment or a
  // string of prose is never a finding.
  const classAttr = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
  let m;
  while ((m = classAttr.exec(src)) !== null) {
    const classes = m[1] ?? m[2] ?? m[3] ?? "";
    if (!FIXED.test(classes)) continue;
    const tag = tagSpan(src, m.index);
    if (tag === null) continue;
    if (tag.includes("data-print-hide")) continue;
    const testid = tag.match(/data-testid="([^"]+)"/)?.[1];
    if (testid && KEEP.has(testid)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(`${file}:${line}  fixed element without data-print-hide${testid ? ` (${testid})` : ""}`);
  }
}

if (problems.length > 0) {
  console.error(`check-print-chrome: ${problems.length} fixed element(s) with no print behaviour declared\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nA fixed element prints onto page one and stays there. Add data-print-hide,\n" +
      "or add its data-testid to KEEP in this script with a reason.",
  );
  process.exit(1);
}

console.log(`check-print-chrome: ok (${FILES.length} files)`);
