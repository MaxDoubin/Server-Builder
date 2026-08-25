/**
 * Splits the blog archive into one markdown file per post plus a metadata
 * index, and writes both into client/src.
 *
 * The archive used to be a single 1.1MB TypeScript array with every article
 * body inline. Any page that touched it, including the listing and the
 * homepage's three recent links, downloaded all of them. Now the bodies sit
 * in client/src/content/posts and load one at a time.
 *
 * Reads client/src/lib/blogPosts.source.ts, which stays the place to add or
 * edit a post. Run with: npx tsx script/generatePostIndex.ts
 */

import { writeFile, mkdir, readdir, unlink } from "fs/promises";
import path from "path";

const { blogPosts } = await import("../client/src/lib/blogPosts.source.ts");

const ROOT = path.resolve(".");
const MD_DIR = path.join(ROOT, "client/src/content/posts");
await mkdir(MD_DIR, { recursive: true });

const slugs = new Set<string>();
for (const post of blogPosts) {
  if (slugs.has(post.slug)) throw new Error(`duplicate slug: ${post.slug}`);
  // The slug becomes a filename and a URL, so keep it to a known-safe shape
  // rather than trusting whatever a future post declares.
  if (!/^[a-z0-9][a-z0-9-]*$/.test(post.slug)) {
    throw new Error(`unsafe slug: ${post.slug}`);
  }
  slugs.add(post.slug);
  await writeFile(path.join(MD_DIR, `${post.slug}.md`), post.content, "utf8");
}

// Drop bodies for posts that no longer exist, so a renamed or deleted post
// does not leave an orphan file that still gets bundled.
for (const file of await readdir(MD_DIR)) {
  if (file.endsWith(".md") && !slugs.has(file.slice(0, -3))) {
    await unlink(path.join(MD_DIR, file));
    console.log(`removed orphaned body: ${file}`);
  }
}

const j = (value: unknown) => JSON.stringify(value);
const out: string[] = [];

out.push(`/**
 * Generated post metadata. Do not edit by hand.
 *
 * Bodies live one file per post in client/src/content/posts and load on
 * demand, so a reader downloads the article they asked for instead of all
 * ${blogPosts.length} of them. Regenerate with script/generatePostIndex.ts.
 */

export interface CoverCredit {
  /** Author as named by the source, plain text. */
  author: string;
  /** Human-readable licence, e.g. "CC BY-SA 4.0". */
  license: string;
  /** Canonical licence deed. */
  licenseUrl: string;
  /** The file's description page at the source. */
  sourceUrl: string;
}

/**
 * Everything about a post except its body.
 *
 * wordCount is precomputed because the listing pages show a read time and
 * were calling content.split() to get it, which meant rendering a list of
 * titles pulled in every word of every article.
 */
export interface PostMeta {
  slug: string;
  title: string;
  /** First published, ISO date. */
  date: string;
  /** Substantially rewritten on this date, ISO. Absent if never rewritten. */
  updated?: string;
  tags: string[];
  excerpt: string;
  coverImage: string;
  coverCredit?: CoverCredit;
  draft?: boolean;
  wordCount: number;
}

export const postIndex: PostMeta[] = [`);

for (const post of blogPosts) {
  const wordCount = post.content.split(/\s+/).filter(Boolean).length;
  out.push("  {");
  out.push(`    slug: ${j(post.slug)},`);
  out.push(`    title: ${j(post.title)},`);
  out.push(`    date: ${j(post.date)},`);
  if (post.updated) out.push(`    updated: ${j(post.updated)},`);
  out.push(`    tags: ${j(post.tags)},`);
  out.push(`    excerpt: ${j(post.excerpt)},`);
  out.push(`    coverImage: ${j(post.coverImage)},`);
  if (post.coverCredit) out.push(`    coverCredit: ${j(post.coverCredit)},`);
  if (post.draft) out.push("    draft: true,");
  out.push(`    wordCount: ${wordCount},`);
  out.push("  },");
}
out.push("];");
out.push("");

await writeFile(
  path.join(ROOT, "client/src/lib/postIndex.ts"),
  out.join("\n"),
  "utf8",
);
console.log(`wrote ${blogPosts.length} bodies and postIndex.ts`);
