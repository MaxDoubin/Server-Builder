/**
 * Marks posts that were substantially rewritten, so the schema can say so.
 *
 * BlogPosting carries datePublished and dateModified, and until now both
 * were the publication date on every post. That was accurate while the
 * archive sat still. It stopped being accurate the moment articles started
 * being rewritten from 250 words to 1500 with a reference list attached: a
 * reader who saw the old version has no way to tell the new one exists, and
 * a crawler is told nothing changed.
 *
 * Rather than trusting anyone to remember, this compares each post body
 * against a base revision and stamps `updated` on the ones that actually
 * moved. Typo fixes do not qualify; the thresholds below are deliberately
 * blunt so that only a real rewrite trips them.
 *
 *   npx tsx script/stampUpdated.ts                  # against origin/main, today
 *   npx tsx script/stampUpdated.ts main 2026-08-25  # explicit base and date
 *   npx tsx script/stampUpdated.ts --dry-run
 */

import { readFile, writeFile } from "fs/promises";
import { execFileSync } from "child_process";
import path from "path";

const SOURCE = path.resolve("client/src/lib/blogPosts.source.ts");

/** A rewrite is a word count change of at least this fraction, or this many words. */
const MIN_FRACTION = 0.15;
const MIN_WORDS = 150;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function gitShow(ref: string, file: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Bodies at the base revision, keyed by slug.
 *
 * Prefers the per-post markdown files. Falls back to parsing the bodies out
 * of blogPosts.source.ts, because the markdown split happened on a branch
 * and comparing against main would otherwise see no posts at all and
 * conclude nothing was ever rewritten.
 */
function baseBodies(baseRef: string, slugs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  let anyMarkdown = false;
  for (const slug of slugs) {
    const md = gitShow(baseRef, `client/src/content/posts/${slug}.md`);
    if (md !== null) {
      out.set(slug, md);
      anyMarkdown = true;
    }
  }
  if (anyMarkdown) return out;

  const source =
    gitShow(baseRef, "client/src/lib/blogPosts.source.ts") ??
    // Before the markdown split the archive lived in blogPosts.ts itself.
    gitShow(baseRef, "client/src/lib/blogPosts.ts");
  if (source === null) return out;
  const slugRe = /^\s*slug: "([a-z0-9][a-z0-9-]*)",$/gm;
  for (const match of source.matchAll(slugRe)) {
    const slug = match[1];
    const contentAt = source.indexOf("\n    content: `", match.index);
    if (contentAt === -1) continue;
    const nextPost = source.indexOf('\n    slug: "', (match.index ?? 0) + 1);
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
    if (i < source.length) out.set(slug, source.slice(start, i));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const baseRef = args[0] ?? "origin/main";
  const stamp = args[1] ?? new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stamp)) {
    throw new Error(`not an ISO date: ${stamp}`);
  }

  const source = await readFile(SOURCE, "utf8");
  const { blogPosts } = await import("../client/src/lib/blogPosts.source.ts");

  const bodies = baseBodies(baseRef, blogPosts.map((p: { slug: string }) => p.slug));
  if (bodies.size === 0) {
    throw new Error(`found no post bodies at ${baseRef}; wrong ref?`);
  }

  const rewritten: { slug: string; before: number; after: number }[] = [];
  for (const post of blogPosts) {
    if (post.updated) continue;
    const before = bodies.get(post.slug);
    // Absent at the base revision means new, not rewritten.
    if (before === undefined) continue;
    const b = words(before);
    const a = words(post.content);
    if (b === 0) continue;
    const delta = Math.abs(a - b);
    if (delta < MIN_WORDS && delta / b < MIN_FRACTION) continue;
    rewritten.push({ slug: post.slug, before: b, after: a });
  }

  if (rewritten.length === 0) {
    console.log(`no post has been rewritten since ${baseRef}`);
    return;
  }

  let out = source;
  for (const { slug } of rewritten) {
    const marker = `    slug: "${slug}",\n`;
    const at = out.indexOf(marker);
    if (at === -1) throw new Error(`could not locate slug ${slug} in the source`);
    const dateLine = out.indexOf("\n    date: ", at);
    const dateEnd = out.indexOf("\n", dateLine + 1);
    if (dateLine === -1 || dateEnd === -1) {
      throw new Error(`could not locate the date line for ${slug}`);
    }
    out = `${out.slice(0, dateEnd)}\n    updated: "${stamp}",${out.slice(dateEnd)}`;
  }

  for (const r of rewritten) {
    console.log(`  ${r.slug}: ${r.before} to ${r.after} words`);
  }
  console.log(`${rewritten.length} posts marked as rewritten on ${stamp}.`);

  if (dryRun) {
    console.log("(dry run, nothing written)");
    return;
  }
  await writeFile(SOURCE, out, "utf8");
}

await main();
