/**
 * Something has to die, and it is not the process you are watching.
 *
 * The out of memory killer is the most misread thing in Linux memory
 * management, and the misreadings are all reasonable. It kills the biggest
 * process, people say. It kills whatever asked for the memory that could not
 * be found. `oom_score_adj` nudges it. None of those is true, and the actual
 * rule is four lines of arithmetic that anybody can do:
 *
 *     badness = rss + swap + page tables + oom_score_adj * (total / 1000)
 *
 * Everything surprising about the killer falls out of that line.
 *
 *   the biggest process survives      a negative adj is worth a percentage
 *                                       of the whole machine, not a nudge
 *   the allocator survives            the process that hit the wall is not
 *                                       a term in the expression at all
 *   RES is the wrong column           swap and page tables are in the sum
 *                                       and `top` shows neither by default
 *   the busiest workers survive       shared pages are counted in full in
 *                                       every process that maps them, so
 *                                       forks look identical and modest
 *   a cgroup kills the wrong thing    a memcg OOM only sees its own tasks,
 *                                       and total is the limit, not the RAM
 *   nothing gets killed               -1000 is not "unlikely", it is never,
 *                                       and a machine can run out of victims
 *
 * The numbers here are in MiB rather than pages, because the expression is a
 * proportion and stays exact either way, and because nobody reads pages.
 */

/** oom_score_adj at its floor: never a candidate, whatever it is using. */
export const IMMUNE = -1000;

export interface Process {
  name: string;
  pid: number;
  /**
   * Resident set, in MiB. The RES column, and the first term.
   *
   * Shared pages are in here in full, once for every process that maps them.
   * The kernel makes no attempt to divide them, which is why a pool of forked
   * workers all score the same and all score modestly, however much memory
   * they are collectively holding down.
   */
  rss: number;
  /** Anonymous pages moved to swap. Still charged here, and `top` hides it. */
  swap: number;
  /**
   * Page tables for this address space, in MiB.
   *
   * Roughly two thousandths of what a process maps, at 4K pages. Small until
   * a process maps a great deal, and then not small: this is the documented
   * reason to give a database huge pages, because two hundred backends each
   * mapping the same forty gigabyte segment each pay for their own tables.
   */
  pageTables: number;
  /**
   * How much of `rss` is shared with other processes.
   *
   * Recorded because it explains the arithmetic, not because it changes it.
   * Nothing subtracts this. It is here so a case can say "these eight look
   * like twenty gigabytes and are holding down five".
   */
  sharedOfRss?: number;
  oomScoreAdj: number;
  /** The cgroup v2 path this task is in. */
  cgroup: string;
  /**
   * pid 1 and kernel threads, which are never candidates.
   *
   * A separate flag rather than an adj of -1000, because the kernel checks
   * them separately and because setting -1000 on init would imply somebody
   * chose it.
   */
  unkillable?: boolean;
}

export interface Cgroup {
  path: string;
  /** memory.max in MiB, or null for "max". */
  max: number | null;
  /**
   * memory.oom.group: kill every task in the cgroup, not just the worst one.
   *
   * Off by default, and on for anything whose processes are useless
   * individually. Without it a worker dies and the supervisor carries on
   * with a hole in it.
   */
  oomGroup?: boolean;
}

export interface Machine {
  /** MiB of RAM. */
  ram: number;
  /** MiB of swap, which counts towards `total` for a system OOM. */
  swap: number;
  cgroups: Cgroup[];
  processes: Process[];
}

/**
 * What ran out.
 *
 * A system OOM considers every task and normalises against RAM plus swap. A
 * cgroup OOM considers only tasks in that cgroup and its descendants, and
 * normalises against the cgroup's limit, which is usually far smaller and
 * makes every adj in it worth far less.
 */
export type Trigger = { kind: "system" } | { kind: "cgroup"; path: string };

export interface Option {
  id: string;
  claim: string;
  /**
   * The pids this option says the kernel kills.
   *
   * An empty array is the claim that it kills nothing, which is right for a
   * machine with no killable task left. `null` is a claim about something the
   * model does not decide, so it can never match, which is what a distractor
   * should do.
   */
  names: number[] | null;
}

export interface Case {
  slug: string;
  name: string;
  brief: string;
  machine: Machine;
  trigger: Trigger;
  question: string;
  options: Option[];
  why: string;
  /** What to do about it, which differs case to case. */
  fix: string;
  /** The belief this case breaks. Unique across the set. */
  breaks: string;
}
