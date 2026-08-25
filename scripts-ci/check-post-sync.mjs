/**
 * blogPosts.source.ts and content/posts/*.md must hold the same articles.
 *
 * The archive lives in two places on purpose. The TypeScript is the source
 * the build reads; the markdown is the file a person edits, because it is
 * the one with the article in it and the one the "suggest an edit" link
 * points at. script/syncPostBodies.ts reconciles them, and the build runs it
 * before generating, so an edit to either survives.
 *
 * What that does not survive is an edit landing between the sync and the
 * commit. That happened: a post was rewritten after the sync had already
 * folded its previous draft into the TypeScript, so the two halves were
 * committed a few seconds apart holding different drafts of the same
 * article, and the build legitimately changed the source on the next run.
 *
 * This compares the two directly rather than asking git whether the build
 * dirtied anything. It is a pure function of the working tree, so it gives
 * the same answer locally with uncommitted work in progress as it does on a
 * clean CI checkout, which means it can be run before committing rather than
 * only discovering the problem afterwards.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SOURCE = "client/src/lib/blogPosts.source.ts";
const MD_DIR = "client/src/content/posts";

/** Undo the escaping script/syncPostBodies.ts applies when writing a body in. */
function unescapeFromTemplate(literal) {
  let out = "";
  for (let i = 0; i < literal.length; i += 1) {
    if (literal[i] === "\\" && i + 1 < literal.length) {
      const next = literal[i + 1];
      if (next === "\\" || next === "`") {
        out += next;
        i += 1;
        continue;
      }
      if (next === "$" && literal[i + 2] === "{") {
        out += "${";
        i += 2;
        continue;
      }
    }
    out += literal[i];
  }
  return out;
}

/**
 * Every `content:` template literal in the source, keyed by slug.
 *
 * Scanned by hand rather than with a regex: article bodies are full of
 * fenced code blocks, and a lazy match would end at the first backtick.
 */
function sourceBodies(source) {
  const bodies = new Map();
  const slugRe = /^\s*slug: "([a-z0-9][a-z0-9-]*)",$/gm;

  for (const match of source.matchAll(slugRe)) {
    const slug = match[1];
    const contentAt = source.indexOf("\n    content: `", match.index);
    if (contentAt === -1) continue;
    const nextPost = source.indexOf('\n    slug: "', match.index + 1);
    if (nextPost !== -1 && contentAt > nextPost) continue;

    const start = contentAt + "\n    content: `".length;
    let i = start;
    while (i < source.length) {
      if (source[i] === "\\") {
        i += 2;
        continue;
      }
      if (source[i] === "`") break;
      i += 1;
    }
    if (i >= source.length) {
      console.error(`FAIL  unterminated content template for ${slug}`);
      process.exit(1);
    }
    bodies.set(slug, unescapeFromTemplate(source.slice(start, i)));
  }
  return bodies;
}

const source = readFileSync(SOURCE, "utf8");
const bodies = sourceBodies(source);

if (bodies.size === 0) {
  console.error(
    `FAIL  parsed zero post bodies out of ${SOURCE}; the parser is broken, not the data.`,
  );
  process.exit(1);
}

const files = readdirSync(MD_DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => f.slice(0, -3))
  .sort();

const mismatched = [];
const orphanedMarkdown = [];
const missingMarkdown = [];

for (const slug of files) {
  const expected = bodies.get(slug);
  if (expected === undefined) {
    orphanedMarkdown.push(slug);
    continue;
  }
  const actual = readFileSync(path.join(MD_DIR, `${slug}.md`), "utf8");
  if (actual !== expected) {
    mismatched.push({
      slug,
      md: actual.split(/\s+/).filter(Boolean).length,
      ts: expected.split(/\s+/).filter(Boolean).length,
    });
  }
}
for (const slug of bodies.keys()) {
  if (!files.includes(slug)) missingMarkdown.push(slug);
}

const problems = mismatched.length + orphanedMarkdown.length + missingMarkdown.length;
if (problems > 0) {
  console.error("FAIL  the archive's two halves disagree.\n");
  for (const m of mismatched) {
    console.error(
      `  ${m.slug}: markdown has ${m.md} words, the source has ${m.ts}`,
    );
  }
  for (const slug of orphanedMarkdown) {
    console.error(`  ${slug}: markdown file with no entry in the source`);
  }
  for (const slug of missingMarkdown) {
    console.error(`  ${slug}: in the source but has no markdown file`);
  }
  console.error(
    "\n  The markdown is the newer edit in almost every case. Run" +
      "\n  `npx tsx script/syncPostBodies.ts && npx tsx script/generatePostIndex.ts`" +
      "\n  and commit both halves in the same commit.",
  );
  process.exit(1);
}

console.log(`OK  all ${files.length} posts match between the source and the markdown.`);
