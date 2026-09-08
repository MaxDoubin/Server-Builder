/**
 * The OOM cases have to be arithmetic, and the prose has to match it.
 *
 * Two halves. The first recomputes every case a second time, shaped
 * differently from the model, and requires exactly one option to name what
 * dies: the data carries a machine and a trigger and no answer, so a case
 * whose options have drifted from its own numbers fails the build.
 *
 * The second half is the one that earned its place. Every case explains
 * itself in prose, and the prose is full of figures. Writing them out by hand
 * I got five wrong in one sitting, all the same way: dividing MiB by a
 * thousand instead of 1024, so 5204 MiB became "5.2 GiB" in three places
 * when it is 5.1. Each was defensible on its own and each was a page telling
 * a reader a number that the table below it contradicts. So every figure in
 * the prose has to be a quantity this case can actually produce.
 */

import { CASES } from "../client/src/lib/oom/data/cases";
import {
  IMMUNE,
  adjWorth,
  badness,
  cgroupAt,
  chosen,
  committed,
  correctOption,
  human,
  inCgroup,
  killed,
  sameSet,
  scope,
  scored,
  type Case,
  type Machine,
  type Process,
  type Trigger,
} from "../client/src/lib/oom/index";

const problems: string[] = [];

/**
 * Figures in the prose that the case cannot produce, with why.
 *
 * Both are hypotheticals rather than facts about the machine in front of you,
 * which is the only reason to state a number the reader cannot check against
 * the table.
 */
const HYPOTHETICAL: Record<string, string[]> = {
  "page-tables-are-memory": ["40 GiB"],
  "a-hundred-is-not-a-nudge": ["256 GiB"],
};

/** The kernel expression again, written to accumulate rather than to sum. */
function recompute(task: Process, total: number): number | null {
  if (task.unkillable === true) return null;
  if (task.oomScoreAdj === IMMUNE) return null;
  let points = 0;
  points += task.rss;
  points += task.swap;
  points += task.pageTables;
  let share = 0;
  const per = (total - (total % 1000)) / 1000;
  for (let i = 0; i < Math.abs(task.oomScoreAdj); i += 1) share += per;
  return points + (task.oomScoreAdj < 0 ? -share : share);
}

/** Everything a case can honestly state a size for. */
function derivable(item: Case): number[] {
  const { machine, trigger } = item;
  const out = new Set<number>([machine.ram, machine.swap, machine.ram + machine.swap]);
  for (const group of machine.cgroups) if (group.max !== null) out.add(group.max);

  const { candidates, total } = scope(machine, trigger);
  out.add(total);

  const points: number[] = [];
  for (const task of machine.processes) {
    for (const value of [
      task.rss,
      task.swap,
      task.pageTables,
      task.sharedOfRss ?? 0,
      task.rss + task.swap,
      task.rss + task.swap + task.pageTables,
      Math.abs(adjWorth(task.oomScoreAdj, total)),
    ]) {
      out.add(value);
    }
    const score = badness(task, total);
    if (score !== null) {
      out.add(Math.abs(score));
      if (candidates.includes(task)) points.push(score);
    }
  }

  /* What is on the machine, and what is not. */
  const held = machine.processes.reduce((sum, task) => sum + task.rss + task.swap + task.pageTables, 0);
  out.add(held);
  out.add(machine.ram - held);
  out.add(machine.ram + machine.swap - held);
  out.add(committed(machine));

  /* A margin between two scores is the point of half these cases. */
  for (const one of points) for (const other of points) if (one > other) out.add(one - other);
  /* And a margin between two resident sizes, which is what `top` shows. */
  const sizes = machine.processes.map((task) => task.rss);
  for (const one of sizes) for (const other of sizes) if (one > other) out.add(one - other);

  return [...out];
}

/** Does a stated figure name one of them? */
function states(figure: string, mib: number[]): boolean {
  const match = /^([0-9]+(?:\.[0-9]+)?) ?(GiB|MiB|gigabytes|megabytes)$/.exec(figure);
  if (!match) return false;
  const [, digits, unit] = match;
  const wanted = Number(digits);
  const inGib = unit === "GiB" || unit === "gigabytes";
  return mib.some((value) => {
    if (!inGib) return value === wanted;
    const gib = value / 1024;
    return digits.includes(".") ? gib.toFixed(1) === digits : Math.round(gib) === wanted;
  });
}

const slugs = new Set<string>();
const breaks = new Set<string>();
const triggers = new Set<string>();
const positions: number[] = [];
let biggestDies = 0;
let noVictim = 0;
let severalDie = 0;

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: duplicate slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) problems.push(`${item.slug}: two cases break the same belief`);
  breaks.add(item.breaks);
  triggers.add(item.trigger.kind);

  const { candidates, total } = scope(item.machine, item.trigger);
  if (candidates.length === 0) problems.push(`${item.slug}: nothing is in scope, so there is no exercise`);

  /* The model and a second implementation have to agree on every task. */
  for (const task of item.machine.processes) {
    const mine = badness(task, total);
    const theirs = recompute(task, total);
    if (mine !== theirs) {
      problems.push(`${item.slug}: badness(${task.name}/${task.pid}) is ${mine}, recomputed ${theirs}`);
    }
  }

  /* A cgroup OOM must never reach outside the cgroup. */
  if (item.trigger.kind === "cgroup") {
    const path = item.trigger.path;
    if (!cgroupAt(item.machine, path)) problems.push(`${item.slug}: the trigger names ${path}, which is not a cgroup here`);
    for (const task of candidates) {
      if (!inCgroup(task, path)) problems.push(`${item.slug}: ${task.name} is a candidate and is not in ${path}`);
    }
    for (const task of item.machine.processes) {
      if (!inCgroup(task, path) && candidates.includes(task)) {
        problems.push(`${item.slug}: ${task.name} is outside ${path} and in scope`);
      }
    }
  }

  const dead = killed(item.machine, item.trigger);
  const pick = chosen(item.machine, item.trigger);
  if (dead.length > 0 && !dead.some((task) => task === pick)) {
    problems.push(`${item.slug}: the selected task is not among those killed`);
  }
  if (dead.length === 0) noVictim += 1;
  if (dead.length > 1) severalDie += 1;

  /* Exactly one option names what dies. This is how the page finds the answer. */
  const hits = item.options.filter(
    (option) => option.names !== null && sameSet(option.names, dead.map((task) => task.pid)),
  );
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} of ${item.options.length} options name [${dead
        .map((task) => task.pid)
        .join(", ")}], which is what the kernel kills. Exactly one has to.`,
    );
  } else {
    if (correctOption(item) !== hits[0]) problems.push(`${item.slug}: correctOption picks a different option`);
    positions.push(item.options.indexOf(hits[0]));
  }

  if (item.options.length !== 4) problems.push(`${item.slug}: has ${item.options.length} options rather than four`);
  if (new Set(item.options.map((option) => option.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
  if (new Set(item.options.map((option) => option.claim)).size !== item.options.length) {
    problems.push(`${item.slug}: two options say the same thing`);
  }
  /* Every case needs the "nothing dies" claim available, or its absence is a tell. */
  if (!item.options.some((option) => option.names !== null && option.names.length === 0)) {
    problems.push(`${item.slug}: no option claims nothing is killed, so the one case where that is right stands out`);
  }

  /* Is the obvious answer the right one? Counted, not forbidden. */
  const live = candidates.filter((task) => badness(task, total) !== null);
  const fattest = [...live].sort((a, b) => b.rss - a.rss)[0];
  if (fattest && dead.length === 1 && dead[0] === fattest) biggestDies += 1;

  /* Every figure in the prose has to be a size this case can produce. */
  const sizes = derivable(item);
  const allowed = new Set(HYPOTHETICAL[item.slug] ?? []);
  const prose = [item.brief, item.why, item.fix, item.name, ...item.options.map((option) => option.claim)].join(" ");
  for (const found of prose.matchAll(/([0-9]+(?:\.[0-9]+)?) ?(GiB|MiB|gigabytes|megabytes)/g)) {
    const figure = `${found[1]} ${found[2]}`.replace(/ (?=[GM]iB)/, " ");
    const written = `${found[1]} ${found[2]}`;
    if (allowed.has(written) || allowed.has(figure)) continue;
    if (!states(written, sizes)) {
      problems.push(
        `${item.slug}: the prose says "${written}" and no quantity in this case rounds to it.` +
          ` Either the figure is wrong or it is a hypothetical, and a hypothetical needs an entry in HYPOTHETICAL.`,
      );
    }
  }
}

/* A hypothetical listed for a case that no longer states it is stale. */
for (const [slug, figures] of Object.entries(HYPOTHETICAL)) {
  const item = CASES.find((entry) => entry.slug === slug);
  if (!item) {
    problems.push(`HYPOTHETICAL names ${slug}, which is not a case`);
    continue;
  }
  const prose = [item.brief, item.why, item.fix, item.name, ...item.options.map((option) => option.claim)].join(" ");
  for (const figure of figures) {
    if (!prose.includes(figure)) problems.push(`HYPOTHETICAL lists "${figure}" for ${slug}, which no longer says it`);
  }
}

/*
  The set has to teach the rule rather than a superstition about the rule.

  Most of these cases exist because the obvious answer is wrong, and a set
  where it is always wrong teaches "never pick the big one", which is just as
  useless as picking it every time. So at least one case has to be the
  control where the largest resident process really is the victim.
*/
if (biggestDies === 0) {
  problems.push("in no case is the largest resident process the victim, which teaches that it never is");
}
if (biggestDies > CASES.length / 2) {
  problems.push(`the largest resident process is the victim in ${biggestDies} of ${CASES.length} cases, so guessing works`);
}
if (noVictim === 0) problems.push("no case ends with nothing killed, so the kernel always having a victim goes untested");
if (severalDie === 0) problems.push("no case kills more than one task, so memory.oom.group goes untested");
if (triggers.size < 2) problems.push("every case is the same kind of OOM");

/* And no positional tell. */
const counts = new Map<number, number>();
for (const at of positions) counts.set(at, (counts.get(at) ?? 0) + 1);
for (const [at, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(`${count} of ${CASES.length} answers are option ${at + 1}; a reader who always picks it passes`);
  }
}

/*
  Properties of the model that the corpus cannot reach.

  Every case above has a unique highest score, because a case that did not
  would fail the exactly-one check, so the tie rule is never exercised by the
  data. It is exercised here, because two identical forked workers is the
  scenario where it matters and the one a reader is most likely to meet.
*/
const tied: Machine = {
  ram: 4000,
  swap: 0,
  cgroups: [{ path: "/", max: null }],
  processes: [
    { name: "worker", pid: 11, rss: 1000, swap: 0, pageTables: 10, oomScoreAdj: 0, cgroup: "/" },
    { name: "worker", pid: 12, rss: 1000, swap: 0, pageTables: 10, oomScoreAdj: 0, cgroup: "/" },
  ],
};
const system: Trigger = { kind: "system" };
if (chosen(tied, system)?.pid !== 11) {
  problems.push("a tie does not go to the task the walk reached first, which is what the kernel does");
}

/* An immune task is not a last resort. It is not in the running at all. */
const allImmune: Machine = {
  ram: 4000,
  swap: 0,
  cgroups: [{ path: "/", max: null }],
  processes: [
    { name: "held", pid: 21, rss: 3000, swap: 0, pageTables: 10, oomScoreAdj: IMMUNE, cgroup: "/" },
    { name: "init", pid: 1, rss: 10, swap: 0, pageTables: 2, oomScoreAdj: 0, cgroup: "/", unkillable: true },
  ],
};
if (chosen(allImmune, system) !== null) problems.push("a machine of immune tasks still produces a victim");
if (killed(allImmune, system).length !== 0) problems.push("a machine of immune tasks still kills something");
if (badness(allImmune.processes[0], 4000) !== null) problems.push("an immune task has a score");
if (badness(allImmune.processes[1], 4000) !== null) problems.push("an unkillable task has a score");
if (scored(allImmune, system).some((row) => row.points !== null)) {
  problems.push("scored gives a number to a task that has none");
}
if (scored(tied, system).length !== 2) problems.push("scored drops a candidate");

/*
  The normaliser truncates before it multiplies. On a machine that is not a
  round number of thousands this is not the same as scaling by a thousandth,
  and the difference is what an adj is actually worth.
*/
if (adjWorth(100, 4608) !== 400) problems.push(`adjWorth(100, 4608) is ${adjWorth(100, 4608)}, not 400`);
if (adjWorth(-100, 4608) !== -400) problems.push("adjWorth is not symmetric about zero");
if (adjWorth(1000, 16384) !== 16000) problems.push("an adj of 1000 is not worth the truncated whole machine");
if (adjWorth(0, 99999) !== 0) problems.push("an adj of zero is worth something");

/* Shared pages are counted in full by the kernel and once by the machine. */
const shared: Machine = {
  ram: 8000,
  swap: 0,
  cgroups: [{ path: "/", max: null }],
  processes: [
    { name: "a", pid: 31, rss: 1000, sharedOfRss: 900, swap: 0, pageTables: 0, oomScoreAdj: 0, cgroup: "/" },
    { name: "b", pid: 32, rss: 1000, sharedOfRss: 900, swap: 0, pageTables: 0, oomScoreAdj: 0, cgroup: "/" },
  ],
};
if (badness(shared.processes[0], 8000) !== 1000) problems.push("badness discounts shared pages, and the kernel does not");
if (committed(shared) !== 1100) problems.push(`committed is ${committed(shared)}; two 100 MiB privates and one 900 MiB shared is 1100`);

/* A cgroup limit is what its tasks are scored against, not the machine. */
const capped: Machine = {
  ram: 64000,
  swap: 0,
  cgroups: [
    { path: "/", max: null },
    { path: "/system.slice/small.service", max: 1000 },
  ],
  processes: [
    { name: "held", pid: 41, rss: 500, swap: 0, pageTables: 0, oomScoreAdj: -100, cgroup: "/system.slice/small.service" },
    { name: "other", pid: 42, rss: 40000, swap: 0, pageTables: 0, oomScoreAdj: 0, cgroup: "/" },
  ],
};
const inside = scope(capped, { kind: "cgroup", path: "/system.slice/small.service" });
if (inside.total !== 1000) problems.push(`a cgroup OOM normalises against ${inside.total}, not its limit`);
if (inside.candidates.length !== 1) problems.push("a cgroup OOM considers tasks outside the cgroup");
if (badness(capped.processes[0], inside.total) !== 400) {
  problems.push("an adj inside a small cgroup is worth a share of the limit rather than of the machine");
}
if (badness(capped.processes[0], capped.ram) !== -5900) {
  problems.push("the same adj under a system OOM is not worth a share of the machine");
}
if (!inCgroup({ ...capped.processes[0], cgroup: "/system.slice/small.service/worker" }, "/system.slice/small.service")) {
  problems.push("a task in a descendant cgroup is not counted as inside it");
}
if (inCgroup(capped.processes[1], "/system.slice/small.service")) {
  problems.push("a task outside a cgroup is counted as inside it");
}
if (inCgroup({ ...capped.processes[0], cgroup: "/system.slice/small.service-other" }, "/system.slice/small.service")) {
  problems.push("a cgroup whose path is a prefix of another is treated as its parent");
}

/* sameSet is what decides the answer, so it has to be a set comparison. */
if (!sameSet([1, 2, 3], [3, 2, 1])) problems.push("sameSet depends on order");
if (sameSet([1, 2], [1, 2, 3])) problems.push("sameSet ignores a difference in length");
if (sameSet([1, 2], [1, 3])) problems.push("sameSet accepts a different set of the same size");
if (!sameSet([], [])) problems.push("sameSet says two empty sets differ");

/* And the sizes a reader sees have to read as sizes. */
if (human(512) !== "512 MiB") problems.push(`human(512) is "${human(512)}"`);
if (human(1024) !== "1 GiB") problems.push(`human(1024) is "${human(1024)}"`);
if (human(16384) !== "16 GiB") problems.push(`human(16384) is "${human(16384)}"`);
if (human(-2556) !== "-2.5 GiB") problems.push(`human(-2556) is "${human(-2556)}"`);
/* The case that caused this: whole gigabytes above ten printed 11800 as 12. */
if (human(11800) !== "11.5 GiB") problems.push(`human(11800) is "${human(11800)}", not 11.5 GiB`);
if (human(24118) !== "23.6 GiB") problems.push(`human(24118) is "${human(24118)}"`);

if (problems.length) {
  console.error(`check-oom: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const figures = CASES.reduce(
  (sum, item) =>
    sum +
    [...[item.brief, item.why, item.fix, item.name, ...item.options.map((o) => o.claim)]
      .join(" ")
      .matchAll(/[0-9]+(?:\.[0-9]+)? ?(?:GiB|MiB|gigabytes|megabytes)/g)].length,
  0,
);
console.log(
  `OK  ${CASES.length} OOM cases, each with exactly one option naming what the kernel kills,` +
    ` ${biggestDies} where the largest resident process is the victim, and all ${figures} sizes` +
    ` stated in prose are quantities the case produces.`,
);
