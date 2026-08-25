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

/*
  Citation count, generated rather than written down.

  The claim ledger at /verify states how many reference URLs the archive
  carries and how many were checked. That is the page whose entire purpose is
  not containing stale claims, so the number cannot be a literal somebody has
  to remember to update when a post is added. Counted the same way
  script/checkPostLinks.mjs counts, skipping fenced code so an example
  http://127.0.0.1:3000 in an nginx config is not mistaken for a citation.
*/
function countCitations(markdown: string): number {
  const urls = new Set<string>();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.replace(/`[^`]*`/g, "").matchAll(/https?:\/\/[^\s<>"'`\]]+/g)) {
      let url = match[0].replace(/[.,;:]+$/, "");
      while (url.endsWith(")") && (url.split(")").length > url.split("(").length)) {
        url = url.slice(0, -1);
      }
      url = url.replace(/[.,;:]+$/, "");
      if (url) urls.add(url);
    }
  }
  return urls.size;
}

const allCitations = new Set<string>();
for (const post of blogPosts) {
  let inFence = false;
  for (const line of post.content.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.replace(/`[^`]*`/g, "").matchAll(/https?:\/\/[^\s<>"'`\]]+/g)) {
      let url = match[0].replace(/[.,;:]+$/, "");
      while (url.endsWith(")") && (url.split(")").length > url.split("(").length)) {
        url = url.slice(0, -1);
      }
      url = url.replace(/[.,;:]+$/, "");
      if (url) allCitations.add(url);
    }
  }
}
void countCitations;

// Cover image attribution links are checked alongside the citations, because
// a CC BY credit that 404s is a licensing problem rather than an
// inconvenience. They are counted separately so /verify can say which is
// which instead of quoting one total and calling it all references.
const attributionUrls = new Set<string>();
for (const post of blogPosts) {
  if (!post.coverCredit) continue;
  if (post.coverCredit.sourceUrl) attributionUrls.add(post.coverCredit.sourceUrl);
  if (post.coverCredit.licenseUrl) attributionUrls.add(post.coverCredit.licenseUrl);
}

out.push("/**");
out.push(" * Unique external reference URLs in the article text.");
out.push(" *");
out.push(" * Generated, along with the two counts below. The claim ledger at");
out.push(" * /verify quotes these, and a number that goes stale on the page about");
out.push(" * not making stale claims would be the worst possible place for one.");
out.push(" */");
out.push(`export const CITATION_COUNT = ${allCitations.size};`);
out.push("");
out.push("/** Unique cover image attribution and licence URLs. */");
out.push(`export const ATTRIBUTION_URL_COUNT = ${attributionUrls.size};`);
out.push("");
out.push("/** Everything script/checkPostLinks.mjs requests: the two sets above, deduplicated. */");
out.push(
  `export const CHECKED_URL_COUNT = ${new Set([...allCitations, ...attributionUrls]).size};`,
);
out.push("");

await writeFile(
  path.join(ROOT, "client/src/lib/postIndex.ts"),
  out.join("\n"),
  "utf8",
);
console.log(`wrote ${blogPosts.length} bodies and postIndex.ts`);
