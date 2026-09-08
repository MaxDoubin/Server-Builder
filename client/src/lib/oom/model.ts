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
  /*
    The kernel does `adj *= totalpages / 1000` in integer arithmetic, so the
    normaliser is truncated before it is multiplied. On a machine that is not
    a round number of gigabytes this is not the same as scaling by a
    thousandth, and getting it wrong moves scores by tens of MiB.
  */
  const perThousandth = Math.trunc(total / 1000);
  return task.rss + task.swap + task.pageTables + task.oomScoreAdj * perThousandth;
}

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
 * Ties go to the task the walk reached first, because `select_bad_process`
 * only replaces its choice on a strictly greater score. That is worth being
 * exact about: a pool of identical workers is a pool of ties, and a model
 * that picked the last one would disagree with the kernel on the only
 * scenario where it matters.
 */
export function chosen(machine: Machine, trigger: Trigger): Process | null {
  const { candidates, total } = scope(machine, trigger);
  let best: Process | null = null;
  let bestPoints = -Infinity;
  for (const task of candidates) {
    const points = badness(task, total);
    if (points === null) continue;
    if (points > bestPoints) {
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

/** How much of the machine one adj setting is worth, which is the surprise. */
export const adjWorth = (adj: number, total: number): number => adj * Math.trunc(total / 1000);

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
