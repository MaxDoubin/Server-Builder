/**
 * It ran out of ports and there are twenty eight thousand of them.
 *
 * Three things decide whether a host runs out of ephemeral ports, and the
 * one everybody reaches for is not among them.
 *
 * A connection is identified by four values, not one. The kernel's socket
 * lookup is on (saddr, sport, daddr, dport), so the same local port can be
 * in use for a hundred different destinations at once. Exhaustion is per
 * destination, and a client making five hundred connections a second to one
 * backend is in trouble where the same client spread across ten backends is
 * nowhere near it.
 *
 * TIME_WAIT is sixty seconds and it is a compile time constant.
 * TCP_TIMEWAIT_LEN is (60*HZ) in include/net/tcp.h and there is no sysctl
 * for it. So the steady state occupancy is simply the rate times sixty, and
 * that number either fits in the range or it does not.
 *
 * The knob people turn is tcp_fin_timeout, and it does nothing here.
 * TCP_FIN_TIMEOUT is defined as TCP_TIMEWAIT_LEN, so the default is the same
 * sixty, which is exactly why the two get confused. But the sysctl controls
 * FIN_WAIT2, the BSD style deadlock breaker for a peer that never sends its
 * FIN. Setting it to 15 changes a state this problem is not in.
 *
 * And whoever closes first holds TIME_WAIT, which decides whose problem it
 * is. Nothing here models retransmission or the handshake: one host against
 * one port range is where all of these go wrong.
 */

/** Somewhere connections are made to. */
export interface Destination {
  /** How it would be written, for the display. */
  label: string;
  address: string;
  port: number;
  /** New connections per second to this destination. */
  rate: number;
}

/** Which end sends the first FIN, and therefore holds TIME_WAIT. */
export type Closer = "client" | "server";

export interface Setup {
  /** ip_local_port_range, inclusive at both ends. */
  portRange: [number, number];
  destinations: Destination[];
  closedBy: Closer;
  /**
   * net.ipv4.tcp_tw_reuse.
   *
   * Lets a new outgoing connection take over a TIME_WAIT socket when the
   * timestamps say it is safe. Outbound only, and useless to a listening
   * server, which is the half that gets missed.
   */
  twReuse: boolean;
  /**
   * A connection pool holding this many connections open per destination.
   *
   * The actual fix, and the only one on this list that changes the shape of
   * the problem rather than the size: N held connections cost N ports
   * whatever the request rate is.
   */
  poolPerDestination: number;
  /**
   * net.ipv4.tcp_fin_timeout, in seconds.
   *
   * Carried only so a case can set it to something small and the model can
   * ignore it, because that is the point.
   */
  finTimeout: number;
}

export interface Load {
  destination: Destination;
  /** Ephemeral ports this destination holds in TIME_WAIT at steady state. */
  held: number;
  /** Ports available for this destination, which is the whole range. */
  available: number;
  /** Whether this destination alone exhausts the range. */
  exhausted: boolean;
}

/**
 * A claim about a host.
 *
 * Five shapes. The two that matter are how many ports are actually held,
 * which is where the four-tuple comes in, and the highest rate the
 * configuration sustains, which is the number somebody needs before they
 * choose a pool size.
 */
export type Claim =
  /** Ephemeral ports in TIME_WAIT at steady state, across everything. */
  | { about: "ports-held"; count: number }
  /** Some destination exhausts the range. */
  | { about: "exhausts" }
  /** Nothing exhausts, with room to spare. */
  | { about: "fits" }
  /** The highest connections per second to one destination this sustains. */
  | { about: "max-rate"; perSecond: number }
  /** Which end holds the TIME_WAIT sockets. */
  | { about: "held-by"; side: Closer }
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
  setup: Setup;
  question: string;
  options: Option[];
  why: string;
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
