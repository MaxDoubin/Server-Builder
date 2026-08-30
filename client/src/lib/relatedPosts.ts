/**
 * What to read next, chosen by subject rather than only by tag.
 *
 * The first version of this scored on shared tags weighted by rarity, which
 * is the right instinct: a tag on five posts says far more than one on
 * ninety. It has one failure mode, and this archive walked straight into
 * it. Six posts here are about path MTU. They carry `networking` and
 * `operations`, the two commonest tags on the site, and then one differing
 * third tag each: storage, routing, linux, switching, troubleshooting. On
 * tags alone none of the six scores highly against any other, so every one
 * of them sent readers somewhere else and a reader who landed on any of
 * them had no route to the other five. Six pages competing for one query
 * with nothing tying them together is the worst arrangement available.
 *
 * Titles knew what tags did not. Every one of those posts says MTU in its
 * title, and MTU appears in six titles out of 238, which by the same
 * inverse-frequency logic that makes a rare tag valuable makes it a very
 * strong signal. So the score is now shared tags plus shared title terms,
 * both weighted by how rare they are across the archive, on one scale so
 * neither can swamp the other: a term in six posts is worth 1/6, exactly
 * what a tag on six posts is worth.
 *
 * Terms come from the title and the slug together, because a slug often
 * carries a word the title phrases away (`pmtud`, `blackhole`), and both
 * are the author's own description of the subject.
 *
 * It is a heuristic and it is not perfect. Two shared moderately rare words
 * can outscore one perfect one, so an SSH hardening post now leads with
 * 802.1X access control rather than SSH keys: "access" and "control" are
 * each rare enough in titles to add up. Measured across the archive the
 * trade is clearly worth it. Posts whose read-next list contains anything
 * sharing a subject term went from 106 of 238 to 224, and the failures it
 * replaced were worse than the ones it introduces: a post on DNS negative
 * caching used to recommend TCP congestion control, and six posts on path
 * MTU recommended each other zero times between them.
 */

import type { PostMeta } from "./postIndex";

/**
 * Words that appear everywhere and mean nothing about subject.
 *
 * Deliberately short. Anything genuinely common gets weighted into
 * irrelevance by its own document frequency, so this only has to catch the
 * grammar, not curate a vocabulary.
 */
const STOPWORDS = new Set([
  // Grammar.
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "doing", "done", "for", "from", "had",
  "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "must",
  "not", "of", "on", "or", "should", "so", "than", "that", "the", "their",
  "them", "then", "they", "this", "to", "up", "was", "were", "what", "when",
  "where", "which", "while", "who", "why", "will", "with", "would", "you",
  "your",
  // Prepositions and connectives that read as subject terms but are not.
  // "power over ethernet" and "the MTU black hole" share "over", and on
  // rarity alone that scored as high as sharing "mtu".
  "about", "across", "after", "before", "because", "between", "during",
  "inside", "over", "through", "under", "until", "without",
  // Generic verbs and qualifiers. Every one of these turned up in the
  // frequency band where real subject terms live, which is why a list is
  // needed at all: rarity cannot tell "mtu" from "really".
  "actually", "again", "always", "another", "any", "anything", "bad", "best",
  "better", "big", "come", "comes", "each", "else", "even", "ever", "every",
  "everything", "few", "first", "get", "gets", "give", "gives", "good", "got",
  "just", "keep", "keeps", "know", "known", "knows", "last", "less", "like",
  "little", "long", "look", "looks", "made", "make", "makes", "many", "more",
  "most", "much", "need", "needs", "never", "new", "next", "nothing", "old",
  "one", "only", "other", "others", "own", "people", "put", "real", "really",
  "right", "said", "same", "say", "says", "see", "sees", "short", "simply",
  "small", "some", "something", "still", "such", "take", "takes", "tell",
  "tells", "thing", "things", "think", "told", "too", "two", "use", "used",
  "uses", "using", "very", "want", "wants", "way", "ways", "well", "work",
  "working", "works", "worst", "yet",
  // Article furniture. These describe the writing, not the subject, and a
  // shared "explained" says only that two posts are both explanations.
  "basics", "building", "choosing", "explained", "fundamentals", "guide",
  "matter", "matters", "practical", "running", "run",
]);

/** Subject-bearing terms in a post's own words: its title and its slug. */
export function termsOf(post: Pick<PostMeta, "title" | "slug">): Set<string> {
  const raw = `${post.title} ${post.slug.replace(/-/g, " ")}`.toLowerCase();
  const out = new Set<string>();
  for (const word of raw.split(/[^a-z0-9+]+/)) {
    // Two characters is never a subject, and the site name is on 134 titles.
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    out.add(word);
  }
  out.delete("max");
  out.delete("doubin");
  return out;
}

/** How much one shared thing is worth: rare says more than common. */
function weights<T>(groups: Iterable<Iterable<T>>): Map<T, number> {
  const counts = new Map<T, number>();
  for (const group of groups) {
    for (const item of group) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  const out = new Map<T, number>();
  counts.forEach((n, item) => out.set(item, 1 / n));
  return out;
}

/**
 * The `count` posts most about the same subject as `current`.
 *
 * Ties break toward the newer post, so an evergreen subject surfaces the
 * most recent treatment of it first.
 */
export function relatedPosts(current: PostMeta, all: PostMeta[], count = 3): PostMeta[] {
  const others = all.filter((p) => p.slug !== current.slug);
  const tagWeight = weights(all.map((p) => p.tags));
  const termWeight = weights(all.map((p) => termsOf(p)));
  const myTerms = termsOf(current);

  return others
    .map((p) => {
      let score = 0;
      for (const t of p.tags) {
        if (current.tags.includes(t)) score += tagWeight.get(t) ?? 0;
      }
      for (const term of termsOf(p)) {
        if (myTerms.has(term)) score += termWeight.get(term) ?? 0;
      }
      return { post: p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1))
    .slice(0, count)
    .map((x) => x.post);
}
