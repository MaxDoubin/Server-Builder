/**
 * The selection, as `mm/oom_kill.c` does it.
 *
 * Two functions carry the whole thing. `badness` is the score for one task,
 * and it is the kernel's expression with nothing added: no heuristics about
 * uptime, no preference for the allocating process, no attempt to divide
 * shared pages between the processes mapping them. `chosen` walks the
 * candidates and keeps the highest, and the tie rule is the kernel's, which
 * is that a later task has to be strictly higher to displace an earlier one.
 *
 * Everything a reader gets wrong about this page is in those two functions,
 * so they are the only place a case can be wrong.
 */

import { IMMUNE, type Case, type Cgroup, type Machine, type Option, type Process, type Trigger } from "./types";

/**
 * The badness of one task, or null when it is not a candidate.
 *
 * null rather than a very low number, because the kernel returns LONG_MIN and
 * then skips: an immune task is not a last resort, it is not in the running.
 * A machine of immune tasks has no victim, and that is a real state with its
 * own kernel message, not a state the arithmetic can produce.
 */
export function badness(task: Process, total: number): number | null {
  if (task.unkillable) return null;
  if (task.oomScoreAdj === IMMUNE) return null;
  return task.rss + task.swap + task.pageTables + adjWorth(task.oomScoreAdj, total);
}

/**
 * Pages per MiB, which is to say four kilobyte pages.
 *
 * The unit matters here and not only for readability. The kernel counts in
 * pages, and it truncates: `adj *= totalpages / 1000`. Truncating a page
 * count and truncating a MiB count are not the same operation, and this file
 * kept its figures in MiB first and truncated there, which moved every adj by
 * about a fortieth. On a 16 GiB host that is eighty megabytes of error in a
 * number the page invites the reader to reproduce.
 *
 * x86-64 and the usual arm64 build both use 4 KiB pages. A kernel built for
 * 16K or 64K pages would move the truncation again, which is a good reminder
 * that this term is an artefact of an implementation rather than a law.
 */
export const PAGES_PER_MIB = 256;

/**
 * What one point of oom_score_adj is worth, in MiB.
 *
 * A thousandth of total memory, truncated to a whole page count first. The
 * truncation is why an adj is not exactly a thousandth of anything: on a
 * 1001 MiB cgroup one point is worth 1 MiB rather than 1.001.
 */
export const adjUnit = (total: number): number =>
  Math.trunc((total * PAGES_PER_MIB) / 1000) / PAGES_PER_MIB;

/** How much of the machine one adj setting is worth, which is the surprise. */
export const adjWorth = (adj: number, total: number): number => adj * adjUnit(total);

export const cgroupAt = (machine: Machine, path: string): Cgroup | undefined =>
  machine.cgroups.find((group) => group.path === path);

/** A task is in a cgroup if it is in it or under it. */
export const inCgroup = (task: Process, path: string): boolean =>
  task.cgroup === path || task.cgroup.startsWith(`${path}/`);

/**
 * Who is in the running, and what the scores are normalised against.
 *
 * The second half is the part people miss. A system OOM normalises against
 * RAM plus swap; a cgroup OOM normalises against the cgroup's limit. An adj
 * of -100 on a task in a 512 MiB cgroup is worth 51 MiB, and the same adj on
 * the same task under a system OOM on a 256 GiB host is worth 26 GiB. The
 * setting did not change. What it is a proportion of did.
 */
export function scope(machine: Machine, trigger: Trigger): { candidates: Process[]; total: number } {
  if (trigger.kind === "system") {
    return { candidates: machine.processes, total: machine.ram + machine.swap };
  }
  const group = cgroupAt(machine, trigger.path);
  return {
    candidates: machine.processes.filter((task) => inCgroup(task, trigger.path)),
    total: group?.max ?? machine.ram + machine.swap,
  };
}

/** Every candidate with a score, worst first, for the reveal table. */
export function scored(machine: Machine, trigger: Trigger): { task: Process; points: number | null }[] {
  const { candidates, total } = scope(machine, trigger);
  return [...candidates]
    .map((task) => ({ task, points: badness(task, total) }))
    .sort((a, b) => {
      if (a.points === null && b.points === null) return 0;
      if (a.points === null) return 1;
      if (b.points === null) return -1;
      return b.points - a.points;
    });
}

/**
 * The task the kernel selects, or null when there is nothing to select.
 *
 * Ties go to the task the walk reached last. This is worth being exact
 * about, and I had it backwards from memory until I read the source:
 *
 *     points = oom_badness(task, oc->totalpages);
 *     if (points == LONG_MIN || points < oc->chosen_points)
 *             goto next;
 *     select:
 *
 * The skip is on strictly less, so an equal score falls through and replaces
 * the standing choice. A pool of identical forked workers is a pool of exact
 * ties, and that is the one scenario where the rule is observable, so a model
 * that kept the first would be wrong precisely where it is asked.
 */
export function chosen(machine: Machine, trigger: Trigger): Process | null {
  const { candidates, total } = scope(machine, trigger);
  let best: Process | null = null;
  let bestPoints = -Infinity;
  for (const task of candidates) {
    const points = badness(task, total);
    if (points === null) continue;
    if (points >= bestPoints) {
      best = task;
      bestPoints = points;
    }
  }
  return best;
}

/**
 * Everything that dies.
 *
 * One task, unless the cgroup that hit its limit has memory.oom.group set, in
 * which case every task in it goes, including the ones that were idle and the
 * one somebody was reading the logs of. That setting is why a unit either
 * recovers cleanly or does not come back at all, and it is off by default,
 * which is how you get a supervisor running with a hole in it.
 */
export function killed(machine: Machine, trigger: Trigger): Process[] {
  const pick = chosen(machine, trigger);
  if (!pick) return [];
  if (trigger.kind === "cgroup" && cgroupAt(machine, trigger.path)?.oomGroup) {
    return machine.processes.filter((task) => inCgroup(task, trigger.path));
  }
  return [pick];
}

/** What the machine is holding, for the header. Shared pages counted once. */
export function committed(machine: Machine): number {
  let total = 0;
  for (const task of machine.processes) {
    total += task.rss - (task.sharedOfRss ?? 0) + task.swap + task.pageTables;
  }
  /* One copy of whatever is shared, taken from the largest sharer. */
  const shared = machine.processes.map((task) => task.sharedOfRss ?? 0);
  return total + Math.max(0, ...shared);
}

/**
 * MiB, in the units a human would have used.
 *
 * One decimal always, with a trailing zero dropped, because rounding to
 * whole gigabytes above ten made 11800 MiB print as "12 GiB" next to a brief
 * that called it eleven and a half. On a page whose entire subject is that
 * the numbers decide, a display that disagrees with the prose beside it is
 * the same bug as prose that disagrees with the model.
 */
export function human(mib: number): string {
  const sign = mib < 0 ? "-" : "";
  const size = Math.abs(mib);
  if (size < 1024) return `${sign}${Math.round(size)} MiB`;
  const gib = (size / 1024).toFixed(1).replace(/\.0$/, "");
  return `${sign}${gib} GiB`;
}

/**
 * Does the largest task the kernel will consider survive?
 *
 * Exported because four places wanted to say how often it does, and all four
 * said "four of the ten" while the prerendered page computed five. The count
 * is a fact about the corpus, so it is derived once here and rendered
 * everywhere, and the gate asserts it is near half: a set where the obvious
 * answer is always wrong teaches "never pick the big one", which is its own
 * superstition, and a set where it is usually right teaches nothing at all.
 *
 * Largest among the candidates rather than on the machine, because a reader
 * looking at `top` and reasoning about the killer has already excluded the
 * tasks it cannot touch. A machine with no victim counts as survival: the
 * biggest process is still running.
 */
export function fattestSurvives(item: Case): boolean {
  const { candidates, total } = scope(item.machine, item.trigger);
  const live = candidates.filter((task) => badness(task, total) !== null);
  if (live.length === 0) return true;
  const fattest = [...live].sort((a, b) => b.rss - a.rss)[0];
  return !killed(item.machine, item.trigger).some((task) => task === fattest);
}

/**
 * The option that is right, found rather than declared.
 *
 * The same rule as the rest of these surfaces: the data carries a machine and
 * a trigger, the model works out what dies, and CI requires exactly one
 * option to name that set. Nothing in the data says which option it is.
 */
export const correctOption = (item: Case): Option | undefined => {
  const dead = killed(item.machine, item.trigger).map((task) => task.pid);
  return item.options.find((option) => option.names !== null && sameSet(option.names, dead));
};

/** Two pid lists naming the same set, order and duplicates aside. */
export function sameSet(left: number[], right: number[]): boolean {
  const one = new Set(left);
  const other = new Set(right);
  return one.size === other.size && [...one].every((pid) => other.has(pid));
}
