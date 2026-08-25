/**
 * Build-time full-text search index over post bodies.
 *
 * The search box scored titles, tags and excerpts only, so the archive could
 * hold 163,000 words about PMTUD, hashcat and NUMA and answer "no results"
 * for every one of them. The bodies are the reason to have a search box at
 * all.
 *
 * Shipping the bodies to the client is not an option: that is the 1.1MB
 * problem the archive was split up to solve. So this emits an inverted index
 * (term -> post ordinals) to dist/public/search-index.json, which the client
 * fetches once, on the first keystroke, and never during page load. It does
 * not enter any bundle and does not count against the entry budget.
 *
 * Terms appearing in more than 40 percent of posts are dropped: they cost
 * postings and separate nothing. Rare terms are deliberately kept, because a
 * term in two posts out of 236 is exactly the query this index exists for.
 */

import { readFile, writeFile, readdir } from "fs/promises";
import path from "path";

const POSTS_DIR = path.resolve("client/src/content/posts");
const OUT = path.resolve("dist/public/search-index.json");

/** Terms that carry no signal in technical prose. */
const STOP = new Set(
  ("the a an and or of for to in on with is are was were be been it its this that these those " +
    "you your we our i my as at by from if then than so not no but can will would should could " +
    "may might do does did done have has had he she they them their there here what when where " +
    "which who whom how why all any both each few more most other some such only own same too " +
    "very just don now use used using one two also into out up down over under again further once")
    .split(" "),
);

/** Words shorter than this are noise; `ip` and `os` lose to their expansions. */
const MIN_TERM = 3;
/** A term in more than this share of posts separates nothing. */
const MAX_DOC_RATIO = 0.4;

function tokenise(text: string): Set<string> {
  const out = new Set<string>();
  // Keep +, ., # and _ inside tokens so "security+", "802.11", "c#" and
  // "proxy_pass" survive as single searchable terms.
  for (const m of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9+.#_-]{1,}/g)) {
    // Trailing sentence punctuation is not part of the word: "pmtud." must
    // index as "pmtud". Trailing + and # are left alone, because they carry
    // meaning in "security+", "network+" and "c#".
    const t = m[0].replace(/[._-]+$/, "");
    if (t.length >= MIN_TERM && !STOP.has(t)) out.add(t);
  }
  return out;
}

export async function generateSearchIndex(): Promise<void> {
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith(".md")).sort();
  const slugs: string[] = [];
  const perDoc: Array<Set<string>> = [];

  for (const file of files) {
    const body = await readFile(path.join(POSTS_DIR, file), "utf-8");
    slugs.push(file.slice(0, -3));
    perDoc.push(tokenise(body));
  }

  const df = new Map<string, number>();
  for (const toks of perDoc) {
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const ceiling = slugs.length * MAX_DOC_RATIO;
  const terms: Record<string, number[]> = {};
  for (let i = 0; i < perDoc.length; i += 1) {
    for (const t of perDoc[i]) {
      if ((df.get(t) ?? 0) > ceiling) continue;
      (terms[t] ??= []).push(i);
    }
  }

  const payload = JSON.stringify({ slugs, terms });
  await writeFile(OUT, payload, "utf-8");
  console.log(
    `search-index.json: ${slugs.length} posts, ${Object.keys(terms).length} terms, ${Math.round(payload.length / 1024)} KB`,
  );
}
