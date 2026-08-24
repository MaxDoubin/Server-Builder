/**
 * Formatting for the plain YYYY-MM-DD dates on posts.
 *
 * `new Date("2026-05-09")` is parsed as UTC midnight, per the ECMAScript
 * date-only form. Rendering that with toLocaleDateString then converts to
 * the reader's zone, so anyone west of Greenwich sees the day before:
 * every post on this site was dated one day early for readers in the
 * Americas, Las Vegas included.
 *
 * Splitting the string and building a local date avoids the round trip
 * entirely. The date on a post is a calendar date, not an instant, so it
 * should never have been through a timezone in the first place.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Parse a YYYY-MM-DD string as a date in the reader's own timezone. */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** "May 9, 2026" */
export function formatPostDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "May 2026", for grouping headings. */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return iso;
  return `${MONTHS[m - 1]} ${y}`;
}

/** "9 May", compact form for dense lists. */
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MONTHS[m - 1].slice(0, 3)}`;
}
