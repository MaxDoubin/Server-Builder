/**
 * Ephemeral port occupancy, per destination, at steady state.
 *
 * The arithmetic is one multiplication. Everything interesting is in what
 * gets multiplied and what the product is compared against, and both of
 * those are wrong in the version most people carry in their heads.
 *
 * From include/net/tcp.h for the constant, tcp(7) for the sysctls, and
 * ip(7) for the range.
 */

import type { Case, Closer, Load, Option, Setup } from "./types";

/**
 * TIME_WAIT, in seconds.
 *
 *   #define TCP_TIMEWAIT_LEN (60*HZ)
 *
 * A compile time constant in include/net/tcp.h with no sysctl behind it. The
 * one people set is tcp_fin_timeout, which is a different state, and the
 * confusion is understandable because the same header defines
 * TCP_FIN_TIMEOUT as TCP_TIMEWAIT_LEN, so the two default to the same
 * number. Only one of them moves.
 */
export const TIME_WAIT_SECONDS = 60;

/** How many ports the range actually holds. Inclusive at both ends. */
export const rangeSize = (setup: Setup): number =>
  setup.portRange[1] - setup.portRange[0] + 1;

/**
 * New connections per second, per destination, after pooling.
 *
 * A pool of N held connections serves the first N connections per second
 * without opening anything, because each one is returned and reused inside
 * the second. Beyond that the overflow opens and closes, and only the
 * overflow lands in TIME_WAIT. This is why a pool is the fix that changes
 * the shape: it subtracts from the rate rather than dividing the occupancy.
 */
export const churnRate = (setup: Setup, rate: number): number =>
  Math.max(0, rate - setup.poolPerDestination);

/**
 * Ports held per destination, and whether that destination exhausts.
 *
 * Per destination, because the socket lookup is on the four tuple. The same
 * local port is free to be used again for a different (daddr, dport), so
 * the range is not a global pool being shared out: every destination gets
 * the whole range to itself, and one of them running out says nothing about
 * the others.
 */
export function loads(setup: Setup): Load[] {
  const available = rangeSize(setup);
  return setup.destinations.map((destination) => {
    /*
      A server holding TIME_WAIT holds it on its listening port against the
      client's ephemeral port, so the varying half of the tuple is the
      client's and the server burns none of its own range. The count is real
      and it is not a port problem.
    */
    if (setup.closedBy === "server") {
      return { destination, held: 0, available, exhausted: false };
    }
    const churn = churnRate(setup, destination.rate);
    /*
      tcp_tw_reuse lets an outgoing connection take over a TIME_WAIT socket
      when the timestamps make it safe, so the sockets still exist and stop
      being an obstacle to opening new ones.
    */
    const held = setup.twReuse ? 0 : Math.round(churn * TIME_WAIT_SECONDS);
    return { destination, held, available, exhausted: held > available };
  });
}

/** Every ephemeral port in TIME_WAIT, across every destination. */
export const portsHeld = (setup: Setup): number =>
  loads(setup).reduce((total, load) => total + load.held, 0);

/** Does any single destination run out of range? */
export const exhausts = (setup: Setup): boolean =>
  loads(setup).some((load) => load.exhausted);

/**
 * The highest rate to one destination this configuration sustains.
 *
 * The range divided by sixty seconds, plus whatever the pool absorbs for
 * free. Infinite when the sockets are not held at all, which is the server
 * closing or tw_reuse being on.
 */
export function maxRate(setup: Setup): number {
  if (setup.closedBy === "server" || setup.twReuse) return Infinity;
  return Math.floor(rangeSize(setup) / TIME_WAIT_SECONDS) + setup.poolPerDestination;
}

/** Which end holds the TIME_WAIT sockets. Whoever closed first. */
export const heldBy = (setup: Setup): Closer => setup.closedBy;

/** Does a claim hold of a host? */
export function holds(claim: Case["options"][number]["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "ports-held":
      return portsHeld(setup) === claim.count;
    case "exhausts":
      return exhausts(setup);
    case "fits":
      return !exhausts(setup);
    case "max-rate":
      return maxRate(setup) === claim.perSecond;
    case "held-by":
      return heldBy(setup) === claim.side;
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries a port range, some destinations with rates, and which
 * end closes. The model does the arithmetic. CI requires exactly one option
 * to hold.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** A count as a person would say it. */
export const count = (value: number): string =>
  value === Infinity ? "no limit" : value.toLocaleString("en-GB");

/** The sysctls a reader would actually look at. */
export function asSysctl(setup: Setup): string {
  return [
    `net.ipv4.ip_local_port_range = ${setup.portRange[0]}\t${setup.portRange[1]}`,
    `net.ipv4.tcp_tw_reuse = ${setup.twReuse ? 1 : 0}`,
    `net.ipv4.tcp_fin_timeout = ${setup.finTimeout}`,
  ].join("\n");
}

