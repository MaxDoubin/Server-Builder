/**
 * The connection was refused, and the daemon was not busy.
 *
 * MaxStartups counts connections that have not finished authenticating. Not
 * sessions, not logins, not load. A connection occupies one of those slots
 * from the moment it is accepted until authentication succeeds or
 * LoginGraceTime expires, and a host with four idle CPUs and no sessions on
 * it can be refusing connections because ninety of those slots are held by
 * clients that are merely slow.
 *
 * What makes it hard to read is that the refusal is a coin toss. sshd(8)
 * does not start refusing at a number, it starts refusing with a
 * probability at a number and works up to certainty at another.
 * sshd_config(5): "Alternatively, random early drop can be enabled by
 * specifying the three colon separated values start:rate:full (e.g.
 * "10:30:60"). The default is 10:30:100." So on a stock daemon the eleventh
 * concurrent unauthenticated connection has a thirty percent chance of
 * being dropped, the same command run again works, and nothing about the
 * machine changed in between.
 *
 * The arithmetic is sshd.c, should_drop_connection(), with the comment it
 * carries:
 *
 *     / *
 *      * returns 1 if connection should be dropped, 0 otherwise.
 *      * dropping starts at connection #max_startups_begin with a probability
 *      * of (max_startups_rate/100). the probability increases linearly until
 *      * all connections are dropped for startups > max_startups
 *      * /
 *     static int
 *     should_drop_connection(int startups)
 *     {
 *             int p, r;
 *
 *             if (startups < options.max_startups_begin)
 *                     return 0;
 *             if (startups >= options.max_startups)
 *                     return 1;
 *             if (options.max_startups_rate == 100)
 *                     return 1;
 *
 *             p  = 100 - options.max_startups_rate;
 *             p *= startups - options.max_startups_begin;
 *             p /= options.max_startups - options.max_startups_begin;
 *             p += options.max_startups_rate;
 *             r = arc4random_uniform(100);
 *
 *             debug_f("p %d, r %d", p, r);
 *             return (r < p) ? 1 : 0;
 *     }
 *
 * Every one of those is integer arithmetic, so the curve the comment calls
 * linear is a staircase: the divide truncates, and on the default setting
 * the probability holds flat across several values of startups before it
 * steps. The model here does the same truncation rather than a floating
 * point line, because the difference is visible at the numbers people
 * actually configure.
 *
 * The other half is how the slots fill, which is arrival rate times holding
 * time and nothing cleverer. LoginGraceTime defaults to 120 seconds, so a
 * client that connects and never authenticates holds its slot for two
 * minutes. Ten of those a minute is twenty slots standing, which is already
 * twice the default start value, from ten connections a minute that a
 * graph of the network would not even show.
 *
 * Not modeled: PerSourceMaxStartups and PerSourceNetBlockSize, which apply a
 * second limit per source address, and PerSourcePenalties, which is a
 * different mechanism with its own timers. drop_connection() checks the
 * penalty first and MaxStartups second, so a penalised source is refused
 * whatever these numbers say.
 */

/** Whether the outcome is settled or a throw of the dice. */
export type Certainty =
  /** The guard clauses refuse it outright. */
  | "dropped"
  /** Below the start value, so nothing is refused. */
  | "accepted"
  /** Somewhere on the ramp: it depends on arc4random_uniform. */
  | "coin";

export interface Setup {
  /** The daemon, so the rendered config and log lines name something. */
  host: string;
  /** MaxStartups start. Below this, nothing is dropped. Default 10. */
  begin: number;
  /** MaxStartups rate, as a percentage. The chance at exactly `begin`. Default 30. */
  rate: number;
  /** MaxStartups full. At or above this, everything is dropped. Default 100. */
  full: number;
  /** LoginGraceTime in seconds. Default 120. Zero means no limit at all. */
  graceSeconds: number;
  /** Connections a minute from clients that do authenticate. */
  arrivalsPerMinute: number;
  /** Seconds one of those spends unauthenticated before it gets in. */
  authSeconds: number;
  /** Connections a minute that never authenticate and sit out the grace. */
  stuckPerMinute: number;
}

export type Claim =
  /** The chance, as a whole percentage, that the next connection is refused. */
  | { about: "drop-percent"; percent: number }
  /** Whether the next connection's fate is settled, and which way. */
  | { about: "certainty"; value: Certainty }
  /**
   * Unauthenticated connections standing in steady state, rounded down.
   * Null when nothing clears them and the count has no steady state.
   */
  | { about: "in-flight"; count: number | null }
  /** The smallest MaxStartups start value that would refuse none of them. */
  | { about: "safe-begin"; value: number | null }
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
