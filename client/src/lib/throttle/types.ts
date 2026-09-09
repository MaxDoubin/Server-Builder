/**
 * The container is using thirty percent of its limit and it is stalling.
 *
 * CFS bandwidth control is a quota per period, not a rate. Within each
 * period a cgroup may use `quota` microseconds of CPU time; once that is
 * spent every thread in the group stops until the next period boundary. The
 * quota is CPU time, and threads spend it in parallel.
 *
 * Those two sentences produce every surprise here.
 *
 * A group with four runnable threads and one CPU of quota spends 100ms of
 * quota in 25ms of wall clock, and then nothing in it runs for 75ms. Average
 * utilisation over the period is exactly at the limit, and the application
 * spent three quarters of the time stopped. Take the thread count to forty
 * and it spends its quota in 2.5ms and is stopped for 97.5.
 *
 * Worse, and this is the one that gets misdiagnosed: a group that uses well
 * under its limit on average can still be throttled in every single period,
 * because the average is taken over the window and the quota is enforced per
 * period. A dashboard showing 30 percent of the limit and a p99 of 400ms is
 * not a contradiction, it is the expected reading.
 *
 * Nothing here models the scheduler's choice of which thread runs. One
 * cgroup against one quota is where all of these go wrong, and a run queue
 * would be scenery.
 */

/** How much work arrives, and when. Times are milliseconds. */
export interface Arrival {
  /** Wall clock millisecond the work becomes runnable. */
  at: number;
  /** CPU milliseconds it needs in total, across all its threads. */
  cpuMs: number;
  /** What it is, for the timeline. */
  label: string;
}

export interface Setup {
  /** Cores the host actually has, which bounds real parallelism. */
  cores: number;
  /** Runnable threads in the cgroup. They spend the quota in parallel. */
  threads: number;
  /** cpu.cfs_period_us, in milliseconds. The kernel default is 100. */
  periodMs: number;
  /**
   * cpu.cfs_quota_us, in milliseconds of CPU time per period.
   *
   * Kubernetes writes `limits.cpu` here: a limit of 1 is a quota equal to
   * the period, a limit of 0.5 is half of it. The unit is CPU time, so a
   * quota equal to the period is one core's worth and not "one core".
   */
  quotaMs: number;
  /**
   * cpu.cfs_burst_us, in milliseconds. Unused quota that may be carried
   * forward, capped at this. Zero is the default and the traditional
   * behaviour.
   */
  burstMs: number;
  arrivals: Arrival[];
  /** How long the window runs, in milliseconds. */
  windowMs: number;
}

/** One enforcement interval. */
export interface Period {
  /** Index, from zero. */
  n: number;
  /** Wall clock millisecond it starts. */
  at: number;
  /** Quota available at the start, the carried burst included. */
  availableMs: number;
  /** CPU milliseconds actually spent. */
  usedMs: number;
  /** Wall clock offset into the period at which the quota ran out, or null. */
  exhaustedAt: number | null;
  /** Wall clock milliseconds the group spent stopped in this period. */
  throttledMs: number;
  /** CPU milliseconds of work still outstanding at the end. */
  backlogMs: number;
}

/** What cpu.stat reports, which is the only evidence most people have. */
export interface Stat {
  nrPeriods: number;
  nrThrottled: number;
  throttledMs: number;
  /** Mean CPU used per period as a fraction of the quota. */
  utilisation: number;
}

/**
 * A claim about a run.
 *
 * Five shapes. The first two are the ones that carry the lesson: when in the
 * period the quota runs out, and how long a piece of work actually takes,
 * which are the two questions a utilisation graph cannot answer.
 */
export type Claim =
  /** The quota runs out this many milliseconds into a period at steady state. */
  | { about: "exhausts-at"; ms: number }
  /** The work that arrived finishes at this wall clock millisecond. */
  | { about: "finishes-at"; ms: number }
  /** This many of the window's periods were throttled. */
  | { about: "periods-throttled"; count: number }
  /** Mean CPU used as a percentage of the quota, to the nearest whole. */
  | { about: "utilisation"; percent: number }
  /** Nothing is throttled anywhere in the window. */
  | { about: "never-throttled" }
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
