/**
 * Why the transfer is slow, when the link is not.
 *
 * "We bought more bandwidth and it did not get faster" is one of the most
 * reliably true sentences in this job, and it is almost never a mystery. A
 * single TCP stream is capped by the window it is allowed to keep in flight
 * divided by the time it takes to get an acknowledgement back, and neither of
 * those numbers is on the invoice. A gigabit link across an ocean with a
 * default 64KiB window carries about three and a half megabits.
 *
 * So this models the three ceilings a stream actually sits under, says which
 * one is binding, and shows what changes if you move each of them. The point
 * is not the arithmetic. The point is that upgrading the one on the invoice is
 * usually the one that does nothing.
 */

export interface Link {
  /** Link rate in bits per second. */
  bandwidth: number;
  /** Round trip time in milliseconds. */
  rtt: number;
  /** Packet loss as a fraction: 0.0001 is one packet in ten thousand. */
  loss: number;
  /** The receiver's advertised window in bytes, after window scaling. */
  window: number;
  /** Maximum segment size in bytes. Payload, so not counting headers. */
  mss: number;
}

/** Which of the three ceilings the stream is actually sitting under. */
export type Ceiling = "link" | "window" | "loss";

/**
 * What is actually costing the time.
 *
 * The three ceilings, plus a fourth answer that is not a ceiling at all. A
 * transfer small enough to finish while the window is still opening never
 * reaches any of them: it is paying round trips, and the honest answer to
 * "why is this slow" is the ramp. Leaving that out would have made one of
 * these cases teach the wrong lesson, since its steady-state ceiling sits at
 * eighty-four per cent of the line and is not anybody's problem.
 */
export type Limit = Ceiling | "ramp";

export interface Analysis {
  /** Bandwidth-delay product in bytes: how much has to be in flight to fill the pipe. */
  bdp: number;
  /** The link rate itself, in bits per second. */
  linkLimit: number;
  /** Window over round trip, in bits per second. */
  windowLimit: number;
  /** The Mathis bound, in bits per second. Null when the loss rate is zero. */
  lossLimit: number | null;
  /** The smallest of the three, which is what the stream gets. */
  throughput: number;
  binding: Ceiling;
  /** The window a stream would need to fill this link, in bytes. Equal to the BDP. */
  windowToFill: number;
  /** Throughput as a fraction of the link rate, 0 to 1. */
  utilisation: number;
}

export interface Transfer {
  /** Total wall clock seconds, including the handshake and the slow start ramp. */
  seconds: number;
  /** Round trips spent in slow start before the window opens fully. */
  slowStartRounds: number;
  /** Seconds spent in the ramp, which is the part a bandwidth upgrade cannot touch. */
  slowStartSeconds: number;
  /** Seconds at the steady rate afterwards. Zero for a transfer that finishes while ramping. */
  steadySeconds: number;
  /** True when the whole transfer completes before the window ever opens fully. */
  finishedRamping: boolean;
}

export interface Case {
  slug: string;
  title: string;
  /** The complaint, in the words somebody would actually use. */
  complaint: string;
  link: Link;
  /** How much is being moved, in bytes. */
  bytes: number;
  /** The answer: what is actually costing the time. */
  binding: Limit;
  /** What to change, and what it does. Shown after the reader has answered. */
  fix: string;
  /** The trap: the change somebody reaches for that does nothing. */
  redHerring: string;
}
