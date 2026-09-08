/**
 * The port forward works from outside and not from inside.
 *
 * Everything on this surface follows from where in the path the addresses get
 * rewritten, and from the fact that the reply is not routed by the rule that
 * translated the request. The rule is stateful: the first packet of a flow
 * sets up a binding, and every later packet, in both directions, is
 * translated from that binding without any rule being consulted again.
 *
 * So the question is never "does the rule match". It is "where does the reply
 * go, and does it pass back through the box that holds the binding". Four of
 * the ten cases here answer no, and in every one of them the port forward is
 * written correctly.
 *
 * The order is the netfilter hook order, and the two NAT points sit on
 * opposite sides of the routing decision:
 *
 *   prerouting   dstnat, priority -100      the destination is rewritten
 *   routing      which interface it leaves by, decided on the NEW destination
 *   forward      filter, priority 0         sees the translated destination
 *                                             and the original source
 *   postrouting  srcnat, priority +100      the source is rewritten
 *
 * That table answers two questions people get wrong in opposite directions. A
 * filter rule written against the public address never matches, because the
 * destination was rewritten one hook earlier. And a filter rule written
 * against the translated source never matches either, because the source is
 * rewritten one hook later.
 */

/** A machine with one address, and where it sends everything else. */
export interface Host {
  name: string;
  address: string;
  /** The network it is directly on, as a prefix. */
  network: string;
  /** Where it sends anything off its own network. Absent for the internet. */
  gateway?: string;
}

export interface Nic {
  name: string;
  address: string;
  network: string;
}

export type Kind = "dnat" | "snat" | "masquerade";

/** All present conditions have to hold. An absent one matches anything. */
export interface Match {
  /** The interface the packet arrived on. prerouting only. */
  iif?: string;
  /** The interface the packet is about to leave by. postrouting only. */
  oif?: string;
  /** An address or a network prefix. */
  saddr?: string;
  daddr?: string;
  dport?: number;
}

export interface Rule {
  chain: "prerouting" | "postrouting";
  kind: Kind;
  match: Match;
  /** Where dnat and snat send it. masquerade uses the egress address. */
  to?: { address?: string; port?: number };
  /** For the rendered ruleset, so the reader sees what was written. */
  written: string;
}

export interface Router {
  name: string;
  nics: Nic[];
  rules: Rule[];
  /** Where the router itself sends anything it has no route for. */
  upstream?: string;
}

export interface Packet {
  saddr: string;
  sport: number;
  daddr: string;
  dport: number;
}

/** One line of the trace: where the packet was, and what it looked like. */
export interface Step {
  where: string;
  packet: Packet;
  /** What happened here, when something did. */
  note?: string;
}

/**
 * How the exchange ended.
 *
 * Only the first is a working connection. The rest are the four ways it can
 * fail with a correct looking port forward, and telling them apart is the
 * exercise: from the client every one of them is a connection that hangs.
 */
export type Outcome =
  /** The request arrived and the reply came back translated. */
  | "connected"
  /**
   * The reply reached the client and its source address is not the one the
   * client sent to, so the client discards it. The hairpin failure.
   */
  | "reply-from-the-wrong-address"
  /** The reply left by a path with no binding, so nobody untranslated it. */
  | "reply-took-another-path"
  /** Nothing matched, so the packet went to the router itself. */
  | "no-rule-matched"
  /** The destination is not reachable from where the packet started. */
  | "unreachable";

export interface Exchange {
  request: Step[];
  reply: Step[];
  outcome: Outcome;
  /**
   * The source address the server sees, which is a separate question from
   * whether the connection works and the reason one of the fixes is a
   * trade-off rather than a win.
   */
  seenBy: string | null;
}

/**
 * A claim about the exchange.
 *
 * Three shapes, because the cases ask three genuinely different questions:
 * whether it connects, what the server sees in its logs, and what a filter
 * rule at a given hook would be matching against.
 */
export type Claim =
  | { about: "outcome"; is: Outcome }
  /** The address the server sees as the source. */
  | { about: "seen-as"; address: string }
  /** The packet's destination when it reaches the forward filter hook. */
  | { about: "filter-sees"; daddr: string }
  /** Whether the address the world has to reach is one the world can route to. */
  | { about: "wan-routable"; is: boolean }
  /** A claim about something this model does not decide. It never holds. */
  | { about: "nothing" };

export interface Option {
  id: string;
  claim: string;
  says: Claim;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  router: Router;
  hosts: Host[];
  /** Who opens the connection, and to what. */
  from: string;
  packet: Packet;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
