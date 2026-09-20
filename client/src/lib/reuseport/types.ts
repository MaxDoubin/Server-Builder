/**
 * An even spread is not a stable one.
 *
 * Measured on the host this was written on, Linux 6.18.44, over loopback TCP,
 * by binding several listeners to one port with SO_REUSEPORT and counting
 * where connections landed.
 *
 * FIRST, what the option is for. Without it, a second bind to the same address
 * and port fails:
 *
 *     the first bind to 127.0.0.1:18080    succeeded
 *     the second bind to the same port     EADDRINUSE, "Address already in use"
 *
 * With it on every listener, they all bind, and 400 connections spread evenly:
 *
 *     four listeners        [0] 107  [1]  99  [2]  97  [3]  97
 *     the same four again   [0]  90  [1]  97  [2] 103  [3] 110
 *     three listeners       [0] 127  [1] 141  [2] 132
 *     five listeners        [0]  76  [1]  65  [2]  90  [3]  71  [4]  98
 *
 * Even every time, whatever the count. That is the half everybody measures.
 *
 * SECOND, and this is the surface: even says nothing about stable. The same
 * eight clients, each connecting from a fixed source port so that the 4-tuple
 * never changes and only the listener set does:
 *
 *     source port   four listeners   three   five
 *     40001         0                0       0
 *     40002         2                2       3     moved
 *     40003         2                1       3     moved
 *     40004         1                1       2     moved
 *     40005         2                1       2     moved
 *     40006         3                2       3     moved
 *     40007         1                0       1     moved
 *     40008         1                1       1
 *
 *     4 of 8 moved when one listener left
 *     3 of 8 moved when two joined
 *
 * The kernel hashes the connection's 4-tuple across the current set of
 * listeners, so changing the size of the set re-routes a large part of the
 * hash space. A client that was going to worker 2 goes to worker 1, and the
 * only thing that changed was somebody else's process count.
 *
 * That is why a rolling restart loses connections. A SYN that arrived at a
 * listener which then closed has its handshake finished by nobody: the
 * retransmitted SYN hashes somewhere else, and the half open state does not
 * move with it. SO_REUSEPORT distributes. It does not consistently hash.
 *
 * Not modeled: the actual connection loss during a restart, which needs a
 * client counting failed handshakes under a real reload; UDP, which shares the
 * option and little else; SO_ATTACH_REUSEPORT_CBPF and the eBPF variant, which
 * replace the hash with a program and are the fix for this; listeners that
 * differ in backlog or bind address; and anything off loopback.
 */

/** What changed about the set of listeners. */
export type Change = "nothing" | "one left" | "one joined" | "two joined" | "all restarted";

export interface Setup {
  /** The machine, so a case names something. */
  host: string;
  /** What is listening. */
  job: string;
  /** The port they all bind. */
  port: number;
  /** Whether every listener set SO_REUSEPORT. */
  reusePort: boolean;
  /** How many listeners there were to begin with. */
  before: number;
  /** What then happened to the set. */
  change: Change;
  /** How many connections arrive. */
  connections: number;
}

export type Claim =
  /** Whether the listeners can all bind at all. */
  | { about: "binds"; value: boolean }
  /** How many connections one listener gets, once the change has settled. */
  | { about: "each"; value: number }
  /** How many listeners are serving afterwards. */
  | { about: "after"; value: number }
  /** The share of clients whose listener changes, as a percentage. */
  | { about: "moved"; value: number }
  /** Whether a client keeps landing on the listener it had. */
  | { about: "stable"; value: boolean }
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
