/**
 * One h1 per page, and no skipped heading levels.
 *
 * Headings are how a screen reader user moves around a page. Most will pull
 * up a list of them and jump, which makes the heading outline the page's
 * table of contents whether or not it was written as one. Two things break
 * that: a page with no h1 has no title in the outline, and a jump from h1 to
 * h3 implies a section that is not there.
 *
 * Three pages shipped with no h1. Their React source has one, but /racks/build,
 * /racks/wired and /teardown are mostly a WebGL canvas, so the prerenderer
 * writes hand-authored prose for them instead of rendering the component, and
 * those three blocks started at h2 where the other thirty nine start at h1.
 * The heading a crawler and a screen reader actually got was one level too
 * deep for the whole page.
 *
 * This reads the built HTML rather than the source for that exact reason: the
 * source was already right. What ships is the only thing worth checking.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import path from "path";

const OUT = path.resolve("dist/public");

if (!existsSync(OUT)) {
  console.error(`No build output at ${OUT}. Run \`npm run build\` first.`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".html")) out.push(full);
  }
  return out;
}

const strip = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const noH1 = [];
const manyH1 = [];
const skipped = [];
let checked = 0;

for (const file of walk(OUT)) {
  const html = readFileSync(file, "utf8");
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: Number(m[1]),
    text: strip(m[2]).slice(0, 48),
  }));
  // A page with no headings at all is a redirect stub or an asset shell, not
  // a document with a broken outline.
  if (headings.length === 0) continue;
  checked += 1;

  const rel = path.relative(OUT, file);
  const ones = headings.filter((h) => h.level === 1);
  if (ones.length === 0) noH1.push(`${rel} (starts at h${headings[0].level}: "${headings[0].text}")`);
  else if (ones.length > 1) manyH1.push(`${rel} (${ones.length}: ${ones.map((h) => `"${h.text}"`).join(", ")})`);

  let previous = null;
  for (const h of headings) {
    if (previous !== null && h.level > previous + 1) {
      skipped.push(`${rel}: h${previous} straight to h${h.level} at "${h.text}"`);
      break;
    }
    previous = h.level;
  }
}

const failures = [];
if (noH1.length) {
  failures.push(
    `${noH1.length} page${noH1.length === 1 ? " has" : "s have"} no h1, so the outline a screen\n` +
      `  reader jumps through has no page title in it:\n` +
      noH1.slice(0, 10).map((s) => `    ${s}`).join("\n") +
      (noH1.length > 10 ? `\n    ... and ${noH1.length - 10} more` : ""),
  );
}
if (manyH1.length) {
  failures.push(
    `${manyH1.length} page${manyH1.length === 1 ? " has" : "s have"} more than one h1, so the outline\n` +
      `  claims the page is several documents:\n` +
      manyH1.slice(0, 10).map((s) => `    ${s}`).join("\n") +
      (manyH1.length > 10 ? `\n    ... and ${manyH1.length - 10} more` : ""),
  );
}
if (skipped.length) {
  failures.push(
    `${skipped.length} page${skipped.length === 1 ? " skips" : "s skip"} a heading level, which implies a\n` +
      `  section that is not there:\n` +
      skipped.slice(0, 10).map((s) => `    ${s}`).join("\n") +
      (skipped.length > 10 ? `\n    ... and ${skipped.length - 10} more` : ""),
  );
}

if (failures.length) {
  console.error("Heading outlines that would mislead somebody navigating by them:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(
  `check-heading-order: ${checked} pages, each with exactly one h1 and no skipped levels.`,
);
