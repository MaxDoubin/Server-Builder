/**
 * The load average is forty and the CPU is idle.
 *
 * Every misreading of this number comes from one of three things, and none
 * of them is arithmetic anybody gets wrong. They are all assumptions about
 * what the number is.
 *
 * It is a count, not a percentage. There is no ceiling at 1.0 and none at
 * the core count either. A load of 40 means forty tasks wanted to be
 * somewhere they were not.
 *
 * It counts uninterruptible sleep. `nr_running + nr_uninterruptible` is what
 * gets sampled, so a host with a dead NFS mount or a disk that has stopped
 * answering carries a load of 40 at two percent CPU. The number is not
 * telling you the processor is busy. It is telling you tasks are waiting,
 * and it does not distinguish waiting for a core from waiting for a device.
 *
 * It is exponentially damped. The one minute figure reaches 63 percent of a
 * step change after one minute, not 100, so a load that has just started
 * climbing always reads low, and one that has just stopped always reads
 * high. Reading it once tells you very little about now.
 *
 * Nothing here models scheduling. One number, sampled and folded, is where
 * all of these go wrong, and a run queue would be scenery.
 */

/**
 * A stretch of time during which the counts hold steady.
 *
 * Two counts rather than one, because the whole point of the surface is that
 * the kernel adds them together and the operator has to take them apart
 * again.
 */
export interface Phase {
  /** How long this phase lasts, in seconds. */
  seconds: number;
  /** Tasks on a CPU or waiting for one. */
  running: number;
  /** Tasks in uninterruptible sleep, which is almost always waiting on IO. */
  blocked: number;
  /** What is happening, for the timeline. */
  label: string;
}

export interface Setup {
  /** How many CPUs the scheduler has to place work on. */
  cores: number;
  /** The load averages at second zero, as three plain numbers. */
  start: [number, number, number];
  phases: Phase[];
}

/** One of the three figures /proc/loadavg prints. */
export type Which = "one" | "five" | "fifteen";

export interface Sample {
  /** Seconds from the start of the window. */
  at: number;
  /** nr_running at this sample. */
  running: number;
  /** nr_uninterruptible at this sample. */
  blocked: number;
  /** What the kernel folds in: the sum of the two above. */
  active: number;
  /** The three averages after this sample, as plain numbers. */
  one: number;
  five: number;
  fifteen: number;
}

/**
 * What the load is actually telling you, once you have taken the sum apart.
 *
 * This is the question the number cannot answer and the reason a page like
 * this exists: 40 from forty runnable tasks and 40 from forty tasks stuck on
 * a dead mount are the same 40, and they are not the same incident.
 */
export type Cause =
  /** More runnable tasks than cores, and little or no uninterruptible sleep. */
  | "cpu"
  /** Mostly uninterruptible sleep. The processors have nothing to do. */
  | "io"
  /** Both: oversubscribed and blocking. */
  | "both"
  /** Neither. The number is high and nothing is actually contended. */
  | "neither";

/**
 * A claim about a run.
 *
 * Five shapes, because collapsing them would lose the two that carry the
 * lesson: what the figure reads at a stated moment, which is the damping,
 * and what is actually wrong, which is the sum having two halves.
 */
export type Claim =
  /** This figure reads this value at this second, to two decimal places. */
  | { about: "reads"; which: Which; at: number; value: number }
  /** The highest this figure reaches anywhere in the window. */
  | { about: "peaks"; which: Which; value: number }
  /** Load per core at this second, to two decimal places. */
  | { about: "per-core"; at: number; value: number }
  /** What the number is actually reporting. */
  | { about: "blames"; cause: Cause }
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
