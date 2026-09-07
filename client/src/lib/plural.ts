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
 *   `${n} ${pluralise(n, "digit")}`            -> "1 digit" / "12 digits"
 *   `${n} ${pluralise(n, "entry", "entries")}` -> "1 entry" / "3 entries"
 *
 * English only, and deliberately so: it takes the irregular plural as an
 * argument rather than trying to derive one.
 */
export function pluralise(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}
