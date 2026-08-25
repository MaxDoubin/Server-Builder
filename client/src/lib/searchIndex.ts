/**
 * Lazy full-text index over post bodies.
 *
 * The search box scored titles, tags and excerpts, so the archive answered
 * "no results" for PMTUD, hashcat, NUMA and every other term that only ever
 * appears inside an article. The bodies are the reason to have search at all.
 *
 * The bodies themselves are 1.1MB and stay off the critical path: this
 * fetches a prebuilt inverted index (script/generateSearchIndex.ts) on the
 * first keystroke, not on page load. Nothing here is bundled, so the entry
 * budget is untouched, and a reader who never searches never pays for it.
 */

import { useEffect, useState } from "react";

interface RawIndex {
  /** Post slugs, in the ordinal order the postings refer to. */
  slugs: string[];
  /** term -> ordinals of the posts whose body contains it. */
  terms: Record<string, number[]>;
}

export interface BodyIndex {
  /** Slugs whose body contains `term`, or an empty set. */
  lookup(term: string): ReadonlySet<string>;
  /** Slugs whose body contains a term starting with `prefix`. */
  lookupPrefix(prefix: string): ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

function build(raw: RawIndex): BodyIndex {
  const cache = new Map<string, ReadonlySet<string>>();
  return {
    lookup(term) {
      const hit = raw.terms[term];
      if (!hit) return EMPTY;
      return new Set(hit.map((i) => raw.slugs[i]));
    },
    lookupPrefix(prefix) {
      if (prefix.length < 3) return EMPTY;
      const cached = cache.get(prefix);
      if (cached) return cached;
      // A reader typing "subnet" should match "subnetting". Exact terms are
      // checked first by the caller, so this only runs when that missed.
      const out = new Set<string>();
      for (const term of Object.keys(raw.terms)) {
        if (term.startsWith(prefix)) {
          for (const i of raw.terms[term]) out.add(raw.slugs[i]);
        }
      }
      cache.set(prefix, out);
      return out;
    },
  };
}

let inflight: Promise<BodyIndex | null> | null = null;

/** Fetch once per page load, shared by every caller. */
function load(): Promise<BodyIndex | null> {
  if (inflight) return inflight;
  inflight = fetch("/search-index.json")
    .then((r) => (r.ok ? (r.json() as Promise<RawIndex>) : null))
    .then((raw) => (raw && raw.slugs ? build(raw) : null))
    .catch(() => {
      // Search still works on titles, tags and excerpts. Let the next
      // keystroke try again rather than failing for the rest of the session.
      inflight = null;
      return null;
    });
  return inflight;
}

/**
 * Returns the index once it has arrived, or null until then.
 *
 * `active` gates the fetch so the index is requested on the first real
 * interaction rather than whenever the component mounts.
 */
export function useBodyIndex(active: boolean): BodyIndex | null {
  const [index, setIndex] = useState<BodyIndex | null>(null);

  useEffect(() => {
    if (!active || index) return;
    let cancelled = false;
    void load().then((i) => {
      if (!cancelled && i) setIndex(i);
    });
    return () => {
      cancelled = true;
    };
  }, [active, index]);

  return index;
}
