/**
 * Pick the singular or plural form of a noun for a count.
 *
 * The site had "1 digits", "1 chars", "1 characters" and "1 seconds" in
 * places a reader reaches by typing one character into a tool. Each is
 * trivial on its own, and each is the sort of thing that makes a page which
 * is otherwise careful look like it is not.
 *
 * The word comes back on its own rather than joined to the number, because
 * the callers format the number differently: some interpolate it raw, some
 * run it through toLocaleString first.
 *
 *   `${n} ${pluralise(n, "digit")}`     -> "1 digit" / "12 digits"
 *   `${n} ${pluralise(n, "address")}`   -> "1 address" / "4 addresses"
 *   `${n} ${pluralise(n, "entry", "entries")}`
 *
 * English only.
 */

/**
 * After a sibilant the regular plural is "es", not "s". This is the rule
 * rather than a guess at an irregular, which is why it lives here: the first
 * caller to pass one of these words got "256 addresss" precisely because the
 * default was a bare "s".
 *
 * Anything genuinely irregular still passes its plural explicitly. A helper
 * that tried to derive "mice" or "quizzes" would be wrong more often than it
 * was right, so it does not try.
 */
const SIBILANT = /(?:s|x|z|ch|sh)$/i;

export function pluralise(count: number, one: string, many?: string): string {
  if (count === 1) return one;
  if (many !== undefined) return many;
  return SIBILANT.test(one) ? `${one}es` : `${one}s`;
}
