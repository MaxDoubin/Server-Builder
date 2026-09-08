/**
 * Two tables that look identical and resolve conflicts in opposite ways.
 *
 * A firewall chain is ordered and the first rule that matches decides. A
 * routing table is not ordered at all: the longest prefix wins no matter
 * where it sits in the output, and reading it top to bottom is the single
 * most common way to get the wrong answer. Both are lists of prefixes with
 * actions attached, both are printed as a wall of text, and the habit you
 * build reading one is actively wrong for the other.
 *
 * Administrative distance is the second trap. It is a tie-break within one
 * prefix length and nothing else: a static route with a distance of 1 does
 * not beat an OSPF route with a distance of 110 by being more trusted, and
 * an OSPF /24 beats a static /16 every time. People reach for the distance
 * column first because it is the one that looks like a priority, and it is
 * the last thing consulted rather than the first.
 */

export type Protocol = "connected" | "static" | "ospf" | "bgp" | "rip" | "eigrp";

export interface Route {
  /** Network address in dotted quad, without the length. */
  network: string;
  /** Prefix length in bits, 0 to 32. */
  length: number;
  /** Where matching traffic is sent. Null for a directly connected network. */
  nextHop: string | null;
  iface: string;
  protocol: Protocol;
  /**
   * Administrative distance: how much the router trusts the source.
   *
   * Only ever consulted between two routes of the same prefix length.
   */
  distance: number;
  /** The protocol's own cost. Breaks a tie when distance also ties. */
  metric: number;
}

export interface Table {
  slug: string;
  name: string;
  /** What this table is for, and what makes it worth reading. */
  brief: string;
  routes: Route[];
  /** Destinations worth resolving against it, each with the reason. */
  probes: Probe[];
}

export interface Probe {
  destination: string;
  /**
   * The route a careless reader picks, as an index into `routes`.
   *
   * Null when the obvious answer is also the right one. Where there is one,
   * it is named so the page can say what the trap was rather than only that
   * there was one.
   */
  trap: number | null;
  /** Why the winner wins, shown after the reader has chosen. */
  why: string;
}

/** What a lookup produced. */
export interface Lookup {
  /** Every route whose prefix contains the destination, longest first. */
  candidates: number[];
  /** The index of the route that wins, or null when nothing matches. */
  winner: number | null;
  /** What settled it, once more than one route matched. */
  decidedBy: "only match" | "prefix length" | "distance" | "metric" | "nothing matched";
}
