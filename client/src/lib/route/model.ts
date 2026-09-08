/**
 * Address arithmetic and the lookup.
 *
 * Everything here works on unsigned 32 bit integers, and the >>> 0 that
 * appears after every shift is not decoration. JavaScript's bitwise
 * operators produce signed 32 bit results, so 255.255.255.0 as a mask comes
 * back as -256 without it, and every comparison after that is wrong in a way
 * that still looks plausible for the first few test cases.
 */

import type { Lookup, Route, Table } from "./types";

/** Dotted quad to an unsigned 32 bit integer, or null if it is not one. */
export function toInt(address: string): number | null {
  const parts = address.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = ((value << 8) | octet) >>> 0;
  }
  return value;
}

/** And back again. */
export const toDotted = (value: number): string =>
  [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");

/** The mask for a prefix length. A /0 is all zeroes, which the shift cannot express. */
export const maskFor = (length: number): number =>
  length === 0 ? 0 : (0xffffffff << (32 - length)) >>> 0;

/** Whether an address falls inside a prefix. */
export function contains(route: Route, address: number): boolean {
  const network = toInt(route.network);
  if (network === null) return false;
  const mask = maskFor(route.length);
  return ((address & mask) >>> 0) === ((network & mask) >>> 0);
}

/** The prefix as it is written: 10.20.0.0/16. */
export const prefixOf = (route: Route): string => `${route.network}/${route.length}`;

/** The usable range, for showing what a prefix actually covers. */
export function rangeOf(route: Route): { first: string; last: string; addresses: number } {
  const network = toInt(route.network) ?? 0;
  const mask = maskFor(route.length);
  const first = (network & mask) >>> 0;
  const last = (first | (~mask >>> 0)) >>> 0;
  return { first: toDotted(first), last: toDotted(last), addresses: last - first + 1 };
}

/**
 * Resolve a destination against a table.
 *
 * The order is longest prefix, then administrative distance, then metric,
 * and the order matters more than any individual step: distance is a
 * tie-break within one prefix length rather than a priority across the
 * table. Returning what decided it, and not only the winner, is the point of
 * the whole surface.
 */
export function lookup(table: Table, destination: string): Lookup {
  const address = toInt(destination);
  if (address === null) return { candidates: [], winner: null, decidedBy: "nothing matched" };

  const candidates = table.routes
    .map((route, index) => ({ route, index }))
    .filter((row) => contains(row.route, address))
    .sort(
      (a, b) =>
        b.route.length - a.route.length ||
        a.route.distance - b.route.distance ||
        a.route.metric - b.route.metric,
    );

  if (candidates.length === 0) {
    return { candidates: [], winner: null, decidedBy: "nothing matched" };
  }

  const [best, runnerUp] = candidates;
  let decidedBy: Lookup["decidedBy"] = "only match";
  if (runnerUp) {
    if (runnerUp.route.length !== best.route.length) decidedBy = "prefix length";
    else if (runnerUp.route.distance !== best.route.distance) decidedBy = "distance";
    else decidedBy = "metric";
  }

  return { candidates: candidates.map((row) => row.index), winner: best.index, decidedBy };
}

/**
 * What a firewall would have done with the same list.
 *
 * The contrast is the lesson, so it is computed rather than asserted: the
 * first route in written order whose prefix contains the destination, which
 * is the answer somebody brings over from reading iptables.
 */
export function firstMatch(table: Table, destination: string): number | null {
  const address = toInt(destination);
  if (address === null) return null;
  const index = table.routes.findIndex((route) => contains(route, address));
  return index === -1 ? null : index;
}
