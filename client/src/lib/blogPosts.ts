/**
 * Public API for the blog archive.
 *
 * Metadata for every post is always available and cheap. Bodies are one
 * markdown file each under content/posts and load on demand through
 * loadPostContent, because inlining all 247 of them meant a reader who
 * opened one article downloaded 1.1MB of the other 235.
 *
 * To add or edit a post, edit blogPosts.source.ts and run
 * `npx tsx script/generatePostIndex.ts`.
 */

import { postIndex, type PostMeta, type CoverCredit } from "./postIndex";

export type { PostMeta, CoverCredit };

/** The metadata half of a post. Named for the callers that predate the split. */
export type BlogPost = PostMeta;

/**
 * One dynamic import per body, so Vite gives each post its own chunk and a
 * reader fetches only the article they asked for.
 */
const bodies = import.meta.glob<string>("../content/posts/*.md", {
  query: "?raw",
  import: "default",
});

const bodyBySlug = new Map<string, () => Promise<string>>();
for (const [filePath, load] of Object.entries(bodies)) {
  const slug = filePath.slice(filePath.lastIndexOf("/") + 1, -3);
  bodyBySlug.set(slug, load);
}

// Bodies are immutable for the life of the page, and a reader can navigate
// back to one, so hold what we have already fetched.
const loaded = new Map<string, string>();

/** A body already in memory, or undefined if it has not been fetched yet. */
export function getLoadedContent(slug: string): string | undefined {
  return loaded.get(slug);
}

/**
 * Fetch one post's markdown.
 *
 * Resolves to null for a slug with no body on disk, which is what a stale
 * link or a hand-typed URL looks like. Callers render their not-found state
 * rather than getting a rejected promise to handle.
 */
export async function loadPostContent(slug: string): Promise<string | null> {
  const cached = loaded.get(slug);
  if (cached !== undefined) return cached;
  const load = bodyBySlug.get(slug);
  if (!load) return null;
  const content = await load();
  loaded.set(slug, content);
  return content;
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return postIndex.find((post) => post.slug === slug && !post.draft);
}

export function getAllPosts(): BlogPost[] {
  return postIndex
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostsByTag(tag: string): BlogPost[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  getAllPosts().forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}

/** Read time in minutes, from the word count baked into the index. */
export function readMinutes(post: BlogPost): number {
  return Math.max(1, Math.ceil(post.wordCount / 200));
}
