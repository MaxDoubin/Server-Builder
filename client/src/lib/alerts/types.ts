/**
 * The graph crosses the line and nothing fires.
 *
 * An alerting rule is not a question asked of a graph. It is a question asked
 * at a fixed cadence, of whatever value the query engine can find at that
 * instant, and every surprise on this surface comes from one of those two
 * words.
 *
 * The cadence: Prometheus evaluates every evaluation_interval, and a
 * condition that was true between two evaluations was never true as far as
 * the rule is concerned. A spike shorter than the interval can be plain on
 * the graph and invisible to the alert.
 *
 * The instant: an instant query takes the newest sample less than the
 * lookback period ago, five minutes by default. So a rule can go on
 * evaluating a value from a target that has stopped answering, and it can
 * also stop dead the moment a scrape returns nothing, and which of those
 * happens depends on whether the exporter sets its own timestamps.
 *
 * And the `for` clause is not a timer that pauses. Prometheus checks the
 * alert continues to be active during each evaluation, so one evaluation
 * where it is not resets the clock to zero rather than holding it.
 */

/** One scraped sample. Times are seconds from the start of the window. */
export interface Sample {
  at: number;
  value: number;
}

export interface Series {
  metric: string;
  /**
   * The samples the target actually returned.
   *
   * A scrape time with no sample here is a scrape that returned nothing for
   * this series, which is what marks it stale.
   */
  samples: Sample[];
  /**
   * Whether the exporter puts its own timestamps on samples.
   *
   * This changes what happens when the data stops. An ordinary target that
   * stops exporting a series gets a stale marker at the next scrape and the
   * series disappears from queries at once. An exporter that sets its own
   * timestamps does not, so the last value is served for the whole lookback
   * period before the series disappears, and a rule keeps firing on data
   * that stopped arriving five minutes ago.
   */
  ownTimestamps?: boolean;
}

export interface Rule {
  alert: string;
  metric: string;
  /**
   * The comparison, or absent() for a rule about the series not being there.
   *
   * absent() is the only way to alert on a target that stopped answering,
   * because a threshold on a series that returns nothing returns nothing, and
   * an alert whose expression returns nothing is not firing.
   */
  test: { op: ">" | "<"; threshold: number } | { op: "absent" };
  /** Seconds the condition has to hold. Absent means fire on the first one. */
  holdFor?: number;
  /** Seconds to keep firing after the condition was last true. */
  keepFiringFor?: number;
}

export interface Setup {
  /** How often the target is scraped, in seconds. */
  scrapeInterval: number;
  /** How often the rule is evaluated, in seconds. */
  evaluationInterval: number;
  /** The instant query lookback, five minutes unless somebody changed it. */
  lookback: number;
  series: Series;
  rule: Rule;
  /** How long the window runs, in seconds. */
  window: number;
}

export type State = "inactive" | "pending" | "firing";

export interface Evaluation {
  at: number;
  /** What the query returned, or null when the series had nothing to give. */
  value: number | null;
  /** Whether the expression produced an element at this instant. */
  active: boolean;
  state: State;
}

/**
 * A claim about the run.
 *
 * Four shapes, because the cases ask four different questions and collapsing
 * them would lose the two that matter: when it fires, and whether a value the
 * rule saw was a value the target had actually sent.
 */
export type Claim =
  /** It reaches firing, first at this second. */
  | { about: "fires-at"; at: number }
  /** It never reaches firing in the window. */
  | { about: "never-fires" }
  /** It is in this state at this second. */
  | { about: "state-at"; at: number; state: State }
  /** The query still returns a value this long after the last sample. */
  | { about: "serves-stale-until"; at: number }
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
