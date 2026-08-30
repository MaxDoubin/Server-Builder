/**
 * Client-side search over the post index.
 *
 * The listing already holds metadata for every post, so searching titles,
 * tags and excerpts costs one pass over an array that is in memory anyway.
 * No index is shipped, no request is made, and the whole thing works on a
 * static host.
 *
 * The box does two jobs at once: the dropdown is a quick jump to one post,
 * and the same ranked result set is handed back to the listing so the cards
 * below narrow as you type. Tag filtering and pagination are applied by the
 * listing on top of whatever comes back from here.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import type { PostMeta } from "@/lib/postIndex";
import { useBodyIndex } from "@/lib/searchIndex";

/** Long enough to skip most intermediate keystrokes, short enough to feel live. */
const DEBOUNCE_MS = 120;
const MAX_SUGGESTIONS = 8;

/**
 * Field weights. A title hit is the strongest signal a reader can give us,
 * a tag hit says the post is about the subject, and an excerpt hit only
 * says the words appear somewhere near the top of the article.
 */
const SCORE = {
  titleStart: 120,
  titleWord: 90,
  titlePart: 60,
  tagExact: 55,
  tagStart: 45,
  tagPart: 30,
  excerpt: 15,
  /**
   * Weakest signal that still counts. A body hit means the post discusses
   * the term somewhere, which is worth less than a title or tag match but
   * is the difference between finding a post and being told the archive has
   * nothing on the subject.
   */
  body: 10,
  bodyPrefix: 6,
} as const;

interface Haystack {
  post: PostMeta;
  title: string;
  tags: string[];
  excerpt: string;
}

interface Props {
  /** Corpus to search. Usually every published post. */
  posts: PostMeta[];
  /**
   * Ranked matches, or null when the box is empty so the listing can fall
   * back to its own ordering.
   */
  onResults: (results: PostMeta[] | null) => void;
  className?: string;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Score one token against one post. Zero means the token did not match.
 *
 * `bodyHit` and `bodyPrefixHit` are resolved by the caller from the lazily
 * fetched body index, so this stays a pure function of what it is given.
 */
function scoreToken(
  hay: Haystack,
  token: string,
  bodyHit: boolean,
  bodyPrefixHit: boolean,
): number {
  let best = 0;

  const titleAt = hay.title.indexOf(token);
  if (titleAt === 0) best = SCORE.titleStart;
  else if (titleAt > 0) {
    // A hit at a word boundary is a real word match; mid-word is weaker.
    best = /\s|[-/(]/.test(hay.title[titleAt - 1]) ? SCORE.titleWord : SCORE.titlePart;
  }

  for (const tag of hay.tags) {
    if (tag === token) best = Math.max(best, SCORE.tagExact);
    else if (tag.startsWith(token)) best = Math.max(best, SCORE.tagStart);
    else if (tag.includes(token)) best = Math.max(best, SCORE.tagPart);
  }

  if (best === 0 && hay.excerpt.includes(token)) best = SCORE.excerpt;
  if (best === 0 && bodyHit) best = SCORE.body;
  if (best === 0 && bodyPrefixHit) best = SCORE.bodyPrefix;

  return best;
}

/** Character ranges in `text` covered by any token, merged and in order. */
function matchRanges(text: string, tokens: string[]): Array<[number, number]> {
  const lower = text.toLowerCase();
  const found: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      found.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  found.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const range of found) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/**
 * The matching substrings wrapped in <mark>.
 *
 * Built as React nodes rather than an HTML string so a post title can
 * contain angle brackets without any escaping question arising.
 */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  const ranges = matchRanges(text, tokens);
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark
        key={`${start}-${i}`}
        className="rounded-[2px] bg-[hsl(var(--brand-signal)/0.22)] px-0.5 text-[hsl(var(--brand-bone))]"
      >
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export function BlogSearch({ posts, onResults, className = "" }: Props) {
  const [, setLocation] = useLocation();
  /**
   * Seed from ?q= in the URL.
   *
   * The WebSite schema in index.html declares a SearchAction whose target is
   * /blog?q={search_term_string}. That is what lets Google offer a sitelinks
   * search box for the site, and it is a promise: whatever a searcher types
   * arrives here as a query parameter. Nothing read it, so every such search
   * landed on the unfiltered archive.
   *
   * Read once, lazily, so the initial render already has the term rather than
   * flashing the full list and then filtering.
   */
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q")?.slice(0, 120) ?? "";
  });
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reactId = useId();
  const inputId = `blog-search-${reactId}`;
  const listId = `blog-search-list-${reactId}`;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  /*
    Mirror the settled query back into the URL so a search can be linked,
    bookmarked and shared, and so reloading keeps the results.

    replaceState rather than pushState: one history entry per keystroke would
    make the back button useless, and this runs on the debounced value rather
    than on every character for the same reason. Only ever touches ?q=, so
    any other parameter on the URL survives.
  */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get("q") ?? "";
    if (current === debounced) return;
    if (debounced) url.searchParams.set("q", debounced);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [debounced]);

  const haystacks = useMemo<Haystack[]>(
    () =>
      posts.map((post) => ({
        post,
        title: post.title.toLowerCase(),
        tags: post.tags.map((t) => t.toLowerCase()),
        excerpt: post.excerpt.toLowerCase(),
      })),
    [posts],
  );

  const tokens = useMemo(
    () => normalise(debounced).split(" ").filter(Boolean),
    [debounced],
  );

  // Requested on the first keystroke, never during page load. Until it
  // lands, results come from titles, tags and excerpts exactly as before.
  const bodyIndex = useBodyIndex(tokens.length > 0);

  /**
   * Every token has to match something, so "bgp filtering" does not return
   * each post that mentions either word. Ties break on date, newest first.
   */
  const results = useMemo<PostMeta[] | null>(() => {
    if (tokens.length === 0) return null;

    // Resolve each token against the body index once, not once per post.
    const bodySets = tokens.map((token) => {
      if (!bodyIndex) return { exact: null, prefix: null };
      const exact = bodyIndex.lookup(token);
      return {
        exact,
        prefix: exact.size > 0 ? null : bodyIndex.lookupPrefix(token),
      };
    });

    const scored: Array<{ post: PostMeta; score: number }> = [];
    for (const hay of haystacks) {
      let total = 0;
      let matchedAll = true;
      for (let i = 0; i < tokens.length; i += 1) {
        const sets = bodySets[i];
        const s = scoreToken(
          hay,
          tokens[i],
          sets.exact ? sets.exact.has(hay.post.slug) : false,
          sets.prefix ? sets.prefix.has(hay.post.slug) : false,
        );
        if (s === 0) {
          matchedAll = false;
          break;
        }
        total += s;
      }
      if (matchedAll) scored.push({ post: hay.post, score: total });
    }
    scored.sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1));
    return scored.map((s) => s.post);
  }, [haystacks, tokens, bodyIndex]);

  // Kept in a ref so the listing can pass an inline callback without this
  // effect re-firing on every one of its renders.
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  });

  /**
   * Publish only when the result set actually changed.
   *
   * The parent stores what it gets in state, so publishing an equal-but-new
   * array on every render would be an endless render loop if `posts` ever
   * arrives with a fresh identity. Comparing slugs makes that impossible
   * rather than merely unlikely.
   */
  const publishedRef = useRef<PostMeta[] | null>(null);
  useEffect(() => {
    const previous = publishedRef.current;
    const same =
      previous === results ||
      (previous !== null &&
        results !== null &&
        previous.length === results.length &&
        previous.every((p, i) => p.slug === results[i].slug));
    if (same) return;
    publishedRef.current = results;
    onResultsRef.current(results);
  }, [results]);

  const suggestions = results ? results.slice(0, MAX_SUGGESTIONS) : [];

  useEffect(() => {
    setActive(0);
  }, [debounced]);

  const showPanel = open && tokens.length > 0;

  const clear = () => {
    setQuery("");
    setDebounced("");
    setOpen(false);
    setActive(0);
  };

  const go = (post: PostMeta) => {
    setOpen(false);
    setLocation(`/blog/${post.slug}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (query) {
        event.preventDefault();
        // The mobile nav also listens for Escape. This one is ours.
        event.stopPropagation();
        clear();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if (next < 0) return suggestions.length - 1;
        if (next > suggestions.length - 1) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      const choice = suggestions[active];
      if (showPanel && choice) {
        event.preventDefault();
        go(choice);
      }
    }
  };

  return (
    <div className={`relative ${className}`} data-testid="blog-search">
      <label htmlFor={inputId} className="sr-only">
        Search field notes by title, tag or summary
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono-tight text-sm text-[hsl(var(--brand-ash))]"
        >
          /
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            showPanel && suggestions[active] ? `${listId}-option-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          placeholder={`Search ${posts.length} field notes`}
          data-testid="input-blog-search"
          className="min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] py-3 pl-9 pr-24 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          // 32px of drawn button on a control that is mostly used on a phone.
          // The pseudo-element takes the hit area to 44 inside the input's own
          // 44px row, so the target grows and nothing moves.
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              clear();
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            data-testid="button-clear-search"
            className="absolute right-2 top-1/2 inline-flex min-h-[32px] -translate-y-1/2 items-center rounded-md border border-[hsl(var(--brand-iron))] px-3 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))] transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
          >
            Esc
          </button>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {results === null
          ? ""
          : `${results.length} post${results.length === 1 ? "" : "s"} match ${debounced}`}
      </p>

      {showPanel && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.97)] shadow-2xl backdrop-blur-md"
          // Keeps the input focused so the listbox stays open through a click.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            className="max-h-[min(60vh,420px)] overflow-y-auto"
          >
            {suggestions.map((post, i) => (
              <li
                key={post.slug}
                id={`${listId}-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(post)}
                data-testid={`search-result-${post.slug}`}
                className={`cursor-pointer border-b border-[hsl(var(--brand-iron)/0.5)] px-4 py-3 last:border-b-0 ${
                  i === active ? "bg-[hsl(var(--brand-signal)/0.1)]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`mt-[7px] h-[6px] w-[6px] shrink-0 rounded-full ${
                      i === active
                        ? "bg-[hsl(var(--brand-signal))]"
                        : "bg-[hsl(var(--brand-iron))]"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-display text-sm leading-snug text-[hsl(var(--brand-bone-dim))]">
                      <Highlight text={post.title} tokens={tokens} />
                    </div>
                    <div className="mt-1 line-clamp-1 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      <Highlight text={post.excerpt} tokens={tokens} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="font-mono-tight text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
                        >
                          <Highlight text={tag} tokens={tokens} />
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {suggestions.length === 0 && (
              // A listbox may only own options, and this row is a message
              // rather than something to choose, so it drops its own
              // semantics instead of leaving a bare li inside the listbox.
              // The count is announced by the live region above either way.
              <li
                role="presentation"
                className="px-4 py-5 text-center font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                data-testid="search-no-results"
              >
                No field notes match that.
              </li>
            )}
          </ul>
          {results && results.length > suggestions.length && (
            <div className="border-t border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {results.length - suggestions.length} more below
            </div>
          )}
        </div>
      )}
    </div>
  );
}
