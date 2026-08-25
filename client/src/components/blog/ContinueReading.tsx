/**
 * "Pick up where you left off" strip for the blog listing.
 *
 * Reads the local reading history written by the post page. The read
 * happens in an effect rather than during render because localStorage is
 * not available while the page is being pre-rendered, and because a value
 * that differs between the static HTML and the first client render would
 * flash.
 *
 * Renders nothing at all when there is no history, which is the normal case
 * for a first visit.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getPostBySlug, readMinutes } from "@/lib/blogPosts";
import type { PostMeta } from "@/lib/postIndex";
import {
  clearHistory,
  unfinishedEntries,
  type ReadingEntry,
} from "@/lib/readingHistory";

interface Item {
  entry: ReadingEntry;
  post: PostMeta;
}

export function ContinueReading() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const resolved: Item[] = [];
    for (const entry of unfinishedEntries(3)) {
      const post = getPostBySlug(entry.slug);
      // A post that has been unpublished since the reader opened it.
      if (post) resolved.push({ entry, post });
    }
    setItems(resolved);
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="continue-reading-heading"
      data-testid="continue-reading"
      className="mt-12 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.35)] p-5 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="continue-reading-heading"
          className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]"
        >
          · Continue reading
        </h2>
        <button
          type="button"
          onClick={() => {
            clearHistory();
            setItems([]);
          }}
          data-testid="button-clear-history"
          className="inline-flex min-h-[24px] items-center py-1 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          Clear
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {items.map(({ entry, post }) => {
          const percent = Math.round(entry.progress * 100);
          const left = Math.max(1, Math.ceil(readMinutes(post) * (1 - entry.progress)));
          return (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                data-testid={`link-continue-${post.slug}`}
                className="group block rounded-md border border-transparent px-2 py-2 transition-colors hover:border-[hsl(var(--brand-iron))] hover:bg-[hsl(var(--brand-obsidian)/0.4)]"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 font-display text-sm leading-snug text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                    {post.title}
                  </span>
                  <span className="shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {percent}% · {left} min left
                  </span>
                </div>
                <div
                  className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress through ${post.title}`}
                >
                  <div
                    className="h-full rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
