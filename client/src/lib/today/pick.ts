/**
 * One item from every practice surface, chosen by the date.
 *
 * WHY DETERMINISTIC RATHER THAN RANDOM. Two readers comparing notes should be
 * looking at the same thing, a link to today's page should still show today's
 * items when it is opened twice, and a page that reshuffles on every render is
 * a page nobody can refer to. The date is the seed and that is the whole of
 * the state: nothing is stored, nothing is fetched.
 *
 * WHY A ROTATION RATHER THAN A HASH. A hash of the date would repeat and skip:
 * over thirty days it would show some items five times and others never.
 * Indexing by day number modulo the list length walks every item in order
 * before repeating any, which is what "come back tomorrow" should mean.
 *
 * The offset per surface stops all ten lists advancing in lockstep, so two
 * surfaces of the same length do not stay paired forever.
 */

/** Days since the Unix epoch, in UTC. Local midnight would make it disagree across a border. */
export const dayNumber = (now: Date = new Date()): number =>
  Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);

/**
 * Pick one item for a given day.
 *
 * `offset` is a per-surface constant so the lists do not advance together.
 * Returns undefined only for an empty list, which the caller treats as a
 * surface with nothing to show rather than as an error.
 */
export function pickFor<T>(items: readonly T[], day: number, offset: number): T | undefined {
  if (items.length === 0) return undefined;
  const index = (((day + offset) % items.length) + items.length) % items.length;
  return items[index];
}
