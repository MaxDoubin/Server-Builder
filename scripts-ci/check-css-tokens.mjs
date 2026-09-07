/**
 * Every custom property the source asks for has to exist.
 *
 * CSS drops an invalid declaration silently. `background: hsl(var(--nope))`
 * is not an error, it is nothing: the element simply has no background, the
 * page still renders, and the build still passes. There is no console
 * warning, no failed request, no red anything.
 *
 * That shipped. `--brand-void` was used in seven places across four cinematic
 * pages and was never defined, so the stat grids on /racks/wired and
 * /racks/build showed their divider wash through cells that were meant to be
 * dark panels, and the rack builder's name input had no field behind its
 * text. It survived review because a missing background looks like a design
 * choice unless you happen to know what it was supposed to look like.
 *
 * So: collect every `var(--token)` referenced from the client source, collect
 * every `--token:` declared in the stylesheets, and fail on the difference.
 *
 * Tokens with a fallback (`var(--x, black)`) are exempt, because a fallback
 * is the author saying the property may legitimately be absent. Anything a
 * third-party stylesheet defines would have to be added to KNOWN below, with
 * a note saying where it comes from.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const SRC = path.resolve("client/src");

/**
 * Defined somewhere other than our own stylesheets.
 *
 * Tailwind emits these from its own base layer, so they are real at runtime
 * but never appear as a declaration we wrote.
 */
const KNOWN = new Set([
  "--tw-ring-color",
  "--tw-ring-offset-color",
  "--tw-ring-offset-shadow",
  "--tw-ring-offset-width",
  "--tw-ring-shadow",
  "--tw-shadow",
  "--tw-shadow-colored",
  "--tw-translate-x",
  "--tw-translate-y",
  "--tw-gradient-from",
  "--tw-gradient-to",
  "--tw-gradient-stops",
  // Radix sets these on the element from JS at runtime.
  "--radix-accordion-content-height",
  "--radix-collapsible-content-height",
  "--radix-popper-anchor-width",
  "--radix-popper-available-height",
  "--radix-popper-available-width",
  "--radix-popper-transform-origin",
  "--radix-select-trigger-height",
  "--radix-select-trigger-width",
  "--radix-dropdown-menu-content-available-height",
  "--radix-navigation-menu-viewport-height",
  "--radix-navigation-menu-viewport-width",
  "--radix-toast-swipe-end-x",
  "--radix-toast-swipe-move-x",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const declared = new Set(KNOWN);
const used = new Map(); // token -> [where]

for (const file of files) {
  // Comments are blanked rather than deleted: a note explaining a token is
  // not a use of it, but the line numbers in the report have to still match
  // the file, so the newlines inside each comment are kept.
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, ""),
  );

  // A declaration: `--brand-iron: 220 6% 22%;`. Anywhere, including inside a
  // style prop, because that defines it for that subtree. In a style object
  // the key is quoted, so the closing quote sits between the name and the
  // colon: `"--sidebar-width": SIDEBAR_WIDTH`.
  for (const m of text.matchAll(/(--[A-Za-z0-9_-]+)["']?\s*:/g)) declared.add(m[1]);

  // A reference: `var(--brand-iron)`. A second argument is a fallback, which
  // makes the token optional by design, so those are skipped.
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g)) {
    if (m[2] === ",") continue;
    const rel = path.relative(process.cwd(), file);
    const line = text.slice(0, m.index).split("\n").length;
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(`${rel}:${line}`);
  }
}

const missing = [...used.keys()].filter((t) => !declared.has(t)).sort();

if (missing.length) {
  console.error(
    "Custom properties used but never defined. CSS drops these silently, so\n" +
      "whatever they were meant to paint is simply not painted:\n",
  );
  for (const t of missing) {
    const at = used.get(t);
    console.error(`  ${t}  (${at.length} use${at.length === 1 ? "" : "s"})`);
    for (const w of at.slice(0, 6)) console.error(`      ${w}`);
    if (at.length > 6) console.error(`      ... and ${at.length - 6} more`);
    console.error("");
  }
  console.error(
    "  Define it in client/src/index.css, or give the reference a fallback\n" +
      "  if it is genuinely optional.",
  );
  process.exit(1);
}

console.log(
  `check-css-tokens: ${used.size} referenced custom properties across ` +
    `${files.length} files, all defined.`,
);
