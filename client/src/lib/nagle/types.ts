/**
 * Two small writes and a read, which costs forty four milliseconds.
 *
 * Measured on the host this was written on, kernel 6.18.44, over loopback,
 * with a client and a server in one process. Each figure is the median of at
 * least thirty round trips, and "stalled" counts the rounds over ten
 * milliseconds.
 *
 *     one write of 8 bytes, then read       0.05 ms    stalled  0/40
 *     two writes of 4 bytes, then read     44.48 ms    stalled 39/40
 *     the same two writes, TCP_NODELAY      0.05 ms    stalled  0/40
 *     the same 8 bytes in one write         0.05 ms    stalled  0/40
 *
 * Nothing about the network changed. The same eight bytes, over loopback, to
 * the same process, take nine hundred times longer because the application
 * called send twice instead of once.
 *
 * WHY. Nagle's algorithm says: while there is unacknowledged data outstanding,
 * do not send a segment smaller than one MSS. The first write goes out at
 * once, because nothing is outstanding. The second is small and now something
 * IS outstanding, so the sender holds it. Meanwhile the receiver has four
 * bytes, cannot answer until it has eight, and its delayed acknowledgement
 * timer says there is no hurry: an acknowledgement on its own carries nothing,
 * so it waits in case some data comes along to carry it. Each side is waiting
 * correctly and the pair of them is deadlocked until the timer fires.
 *
 * WHAT THE TIMER IS. Everybody writes forty milliseconds. Over fifty nine
 * stalls on this host:
 *
 *     minimum 40.89 ms    median 44.03 ms    maximum 49.89 ms
 *
 * ONE STALL, NOT ONE PER WRITE. This is the part people get wrong when they
 * estimate the cost. Every write after the first coalesces into the same held
 * segment, so the price is one timer however many there are:
 *
 *     two writes     44.35 ms
 *     three writes   44.15 ms
 *     eight writes   44.02 ms
 *
 * WHO HAS TO FIX IT. Three things remove it and one popular thing does not:
 *
 *     TCP_NODELAY on the SENDER              0.08 ms    stalled  0/30
 *     TCP_QUICKACK on the receiver           0.05 ms    stalled  0/30
 *     one write instead of two               0.05 ms    stalled  0/30
 *     TCP_NODELAY on the RECEIVER           44.05 ms    stalled 29/30
 *
 * The last line is the measurement worth keeping. TCP_NODELAY governs the
 * socket's own sends, so setting it on the end that is reading does nothing
 * for the end that is writing, and it is the first thing people try.
 *
 * WHAT IS NOT MODELED, and the reason. A first write large enough avoids the
 * stall: with the MSS at 32741, a 70000 byte write then a 4 byte write ran in
 * 0.09 ms. Locating that boundary produced a rule that did not hold. The flip
 * is between 65486 and 65487 bytes handed over, which looks like a rule about
 * the total, and it is not one:
 *
 *     65487 bytes as 4 + 65483          0.06 ms    stalled  0/40
 *     65487 bytes as 32743 + 32744     44.00 ms    stalled 39/40
 *     65486 bytes as 1 + 1 + 65484      0.08 ms    stalled  0/40
 *
 * Same total, opposite outcomes, both directions. That is segmentation
 * behavior on an interface with a 65536 byte MTU, and it did not reduce to
 * anything this model could state honestly, so it states nothing. Every case
 * here keeps its payload far below one segment, where the behavior is not in
 * doubt, and the gate enforces that.
 *
 * Also not modeled: TCP_CORK, which holds data deliberately and has its own
 * rules; how long TCP_QUICKACK stays set, which Linux resets on its own; and
 * what happens when the receiving application is slow rather than waiting.
 */

export interface Setup {
  /** What the two ends are, so the case names something. */
  host: string;
  /** Bytes the application hands the socket, in order, before it waits. */
  writes: number[];
  /** TCP_MAXSEG on the socket. Every case stays far below it. */
  mss: number;
  /** TCP_NODELAY on the sending socket: the end that writes twice. */
  nodelaySender: boolean;
  /** TCP_NODELAY on the receiving socket, which governs its own sends. */
  nodelayReceiver: boolean;
  /** TCP_QUICKACK, set on the receiver before each read. */
  quickackReceiver: boolean;
  /** The delayed acknowledgement, in milliseconds. Measured at 44 here. */
  delayedAckMs: number;
  /** A round trip with nothing held, in microseconds. The link's own speed. */
  baseUs: number;
  /** Round trips the application makes. */
  requests: number;
}

/** A change somebody proposes. Only some of them touch the deadlock. */
export type Change =
  /** TCP_NODELAY on the end that writes. */
  | "nodelay-sender"
  /** TCP_NODELAY on the end that reads. The popular one. */
  | "nodelay-receiver"
  /** TCP_QUICKACK on the end that reads, before every read. */
  | "quickack-receiver"
  /** Hand the socket everything in a single call. */
  | "one-write"
  /** Leave it alone. */
  | "nothing";

export type Claim =
  /** Whether a round trip waits on the acknowledgement timer. */
  | { about: "stalls"; value: boolean }
  /** That this change removes the stall. */
  | { about: "fix"; change: Change }
  /** Timers waited per round trip, which is one or none, never one per write. */
  | { about: "stallsPerRequest"; value: number }
  /** What one round trip costs, in microseconds. */
  | { about: "roundTripUs"; value: number }
  /** Round trips a second this application manages. */
  | { about: "requestsPerSecond"; value: number }
  /** How much slower the stall makes it. */
  | { about: "slowdown"; value: number }
  /** What the whole run costs, in milliseconds. */
  | { about: "totalMs"; value: number }
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
