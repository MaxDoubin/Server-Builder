/**
 * Rendering a line, and reading one back.
 *
 * The parser exists for CI rather than for the page: every line in the data
 * is rendered to text and parsed back, and anything that does not survive
 * the round trip fails the build. Synthetic logs drift into shapes no real
 * daemon emits, and a log that does not look like a log teaches somebody to
 * recognize something they will never see.
 */

import type { Case, Line } from "./types";

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const STAMP = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "2-digit",
  timeZone: "UTC",
});

/** The wall clock time of a line, from the case's epoch and the line's offset. */
export const timeOf = (item: Case, line: Line): Date =>
  new Date(Date.parse(item.epoch) + line.at * 1000);

/** "14:03:22", which is what the page shows in its own column. */
export const clock = (item: Case, line: Line): string => CLOCK.format(timeOf(item, line));

/** A full syslog line, which is what the parser below reads. */
export function render(item: Case, line: Line): string {
  const when = timeOf(item, line);
  /*
    en-GB renders "17 Feb" and syslog writes "Feb 17". Reading the parts out
    of the formatter and reassembling them keeps the locale from deciding
    what a log line looks like, which is not the locale's business.
  */
  const [day, month] = STAMP.format(when).split(" ");
  return `${month} ${day} ${CLOCK.format(when)} ${line.host} ${line.process}: ${line.message}`;
}

/**
 * Read a rendered line back.
 *
 * Deliberately strict. A permissive parser would accept the malformed lines
 * this is here to catch, which would make the check worthless.
 */
export function parse(text: string): { host: string; process: string; message: string } | null {
  const match = /^[A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} ([a-z0-9][a-z0-9.-]*) ([^\s:]+(?:\[\d+\])?): (.+)$/.exec(
    text,
  );
  if (!match) return null;
  return { host: match[1], process: match[2], message: match[3] };
}
