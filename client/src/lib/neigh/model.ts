/**
 * The three thresholds, as net/core/neighbour.c applies them.
 *
 * The only subtle part is that the hard limit is not a hard limit on its own.
 * neigh_alloc tries a forced collection first and fails the allocation only
 * when that collection frees nothing, so overflow needs two things at once:
 * the table at gc_thresh3, and nothing in it old enough to reclaim.
 */

import type { Case, Family, Option, Setup, State } from "./types";

/** net/ipv4/arp.c and net/ipv6/ndisc.c, both of them, unchanged for years. */
export const DEFAULT_THRESH1 = 128;
export const DEFAULT_THRESH2 = 512;
export const DEFAULT_THRESH3 = 1024;

/** neigh_forced_gc only takes entries untouched for this long. */
export const RECLAIM_AGE_SECONDS = 5;

/** The table name the overflow message is prefixed with. */
export const tableId = (family: Family): string => (family === "ipv4" ? "arp_cache" : "ndisc_cache");

/**
 * Entries this table holds, excluding permanent ones.
 *
 * Permanent entries are exempt_from_gc in neigh_alloc and never reach the
 * counter, which is why adding them does not buy headroom.
 */
export const entries = (setup: Setup): number => setup.hosts * setup.addressesPerHost + setup.transient;

/** Whether a forced collection has anything it is allowed to take. */
export const canReclaim = (setup: Setup): boolean => !setup.arrivedInABurst && entries(setup) > setup.thresh2;

/**
 * Whether a new neighbor can be created.
 *
 * Both halves of the kernel's condition: at or past the hard limit, and a
 * forced collection that frees nothing.
 */
export const overflows = (setup: Setup): boolean => entries(setup) >= setup.thresh3 && !canReclaim(setup);

/** Whether the periodic collector does anything at all. */
export const periodicRuns = (setup: Setup): boolean => entries(setup) >= setup.thresh1;

export function state(setup: Setup): State {
  if (overflows(setup)) return "overflowing";
  if (entries(setup) > setup.thresh2) return "forced-collection";
  if (!periodicRuns(setup)) return "never-collected";
  return "collected-normally";
}

/** Entries left before the hard limit refuses one. Never negative. */
export const headroom = (setup: Setup): number => Math.max(0, setup.thresh3 - entries(setup));

/**
 * A gc_thresh3 with room to spare, rounded up to the next power of two.
 *
 * Twice the entries held is the usual guidance, and a power of two because
 * that is how every example in the wild is written and how the hash table is
 * sized anyway.
 */
export function thresh3Needed(setup: Setup): number {
  const wanted = entries(setup) * 2;
  let n = 1024;
  while (n < wanted) n *= 2;
  return n;
}

export function holds(claim: Option["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "entries":
      return entries(setup) === claim.count;
    case "overflows":
      return overflows(setup) === claim.value;
    case "state":
      return state(setup) === claim.value;
    case "headroom":
      return headroom(setup) === claim.count;
    case "thresh3-needed":
      return thresh3Needed(setup) === claim.count;
    case "nothing":
      return false;
  }
}

export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** The sysctl values as sysctl -a would print them for this family. */
export function asSysctl(setup: Setup): string {
  const f = setup.family === "ipv4" ? "ipv4" : "ipv6";
  return [
    `net.${f}.neigh.default.gc_thresh1 = ${setup.thresh1}`,
    `net.${f}.neigh.default.gc_thresh2 = ${setup.thresh2}`,
    `net.${f}.neigh.default.gc_thresh3 = ${setup.thresh3}`,
  ].join("\n");
}

/** What `ip -s neigh show | wc -l` and friends would report. */
export function asCounts(setup: Setup): string {
  const rows = [
    `# ip -${setup.family === "ipv4" ? "4" : "6"} neigh show | wc -l`,
    `${entries(setup) + setup.permanent}`,
    "",
    `# of those: ${entries(setup)} counted against the thresholds`,
    `#           ${setup.permanent} permanent, exempt from garbage collection`,
  ];
  if (setup.transient > 0) {
    rows.push(`#           ${setup.transient} of the counted ones are for addresses with no host behind them`);
  }
  return rows.join("\n");
}

/** What dmesg shows, which is nothing at all until the table actually fails. */
export function asDmesg(setup: Setup): string {
  if (!overflows(setup)) {
    return state(setup) === "forced-collection"
      ? "# nothing. A forced collection on every allocation is not an error and is not logged."
      : "# nothing. The table is inside its thresholds.";
  }
  return [
    `[  ${(1000 + entries(setup) / 10).toFixed(6)}] ${tableId(setup.family)}: neighbor table overflow!`,
    `[  ${(1000 + entries(setup) / 10 + 0.4).toFixed(6)}] ${tableId(setup.family)}: neighbor table overflow!`,
    "# rate limited, so the count in dmesg is not the count of failures",
  ].join("\n");
}
