/**
 * The OOM cases have to be arithmetic, and the prose has to match it.
 *
 * Two halves. The first recomputes every case a second time, shaped
 * differently from the model, and requires exactly one option to name what
 * dies: the data carries a machine and a trigger and no answer, so a case
 * whose options have drifted from its own numbers fails the build.
 *
 * What the second half does not do is worth stating, because it would be easy
 * to read more into a passing run than it earns. It proves a figure is *a*
 * quantity the case produces, not *the* one meant. There are about forty
 * derivable sizes per case once margins are counted, so a wrong figure can
 * land within a tenth of an unrelated one and pass. It caught five real
 * errors on its first run and a sixth after the normaliser changed, and it
 * would not catch a figure that is wrong by a rounding. Digits are compared
 * exactly, which is why every computed figure in the prose is written as one.
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
  PAGES_PER_MIB,
  adjUnit,
  adjWorth,
  badness,
  cgroupAt,
  chosen,
  committed,
  correctOption,
  fattestSurvives,
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
  "page-tables-are-memory": ["48 GiB", "forty eight gigabyte"],
  "a-hundred-is-not-a-nudge": ["256 GiB", "fifty one gigabytes"],
};

/**
 * How far a figure written in words may sit from the quantity it names.
 *
 * A tenth was the first guess and it was too loose to be a check: replacing
 * "minus 2.8 GiB" with "about minus nine gigabytes" passed, because nine
 * gigabytes is within a tenth of the gap between two of the resident sizes.
 * The loosest honest rounding in the prose is "over fourteen gigabytes" for
 * 14.4, at 2.8%, so the band is set just above that. Anything needing more
 * slack than this is a figure that should be written as digits, which are
 * compared exactly.
 */
const WORD_TOLERANCE = 0.04;

/**
 * The kernel expression again, in pages, accumulating rather than scaling.
 *
 * Deliberately a different shape from the model: it counts in the kernel's
 * own unit, floors the normaliser by subtracting a remainder rather than by
 * calling trunc, and reaches the adj share by adding one point at a time.
 * Two implementations that agree by both calling Math.trunc on the same
 * expression would agree about a mistake, which is what happened here once
 * already with the tie rule.
 */
function recompute(task: Process, total: number): number | null {
  if (task.unkillable === true) return null;
  if (task.oomScoreAdj === IMMUNE) return null;
  const pages = (task.rss + task.swap + task.pageTables) * 256;
  const totalPages = total * 256;
  const per = (totalPages - (totalPages % 1000)) / 1000;
  let share = 0;
  for (let i = 0; i < Math.abs(task.oomScoreAdj); i += 1) share += per;
  return (pages + (task.oomScoreAdj < 0 ? -share : share)) / 256;
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

  /* And what one cgroup's tasks add up to, which is what "twenty gigabytes
     between them" means and what nothing on the machine reports. */
  const perCgroup = new Map<string, number>();
  for (const task of machine.processes) {
    perCgroup.set(task.cgroup, (perCgroup.get(task.cgroup) ?? 0) + task.rss);
  }
  for (const sum of perCgroup.values()) out.add(sum);

  /* A margin between two scores is the point of half these cases. */
  for (const one of points) for (const other of points) if (one > other) out.add(one - other);
  /* And a margin between two resident sizes, which is what `top` shows. */
  const sizes = machine.processes.map((task) => task.rss);
  for (const one of sizes) for (const other of sizes) if (one > other) out.add(one - other);

  return [...out];
}

/**
 * Numbers written as words, which the digit scan below cannot see.
 *
 * This half exists because the digit scan let one through. "The JVM scores
 * about minus two and a half gigabytes" was wrong by a third of a gigabyte
 * after the normaliser was corrected, and no check noticed, because the site
 * writes numbers out in prose and the check only read digits. A gate that
 * covers the figures you happen to have typed as digits is not a gate on the
 * figures.
 *
 * Word figures are compared loosely, at a tenth, because prose rounds on
 * purpose: "two hundred megabytes" for 204 MiB is correct English and
 * "204.0 megabytes" would be worse writing. Digits stay strict.
 */
const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "twenty four", "two hundred", "eleven and a half", or nothing. */
function fromWords(tokens: string[]): number | null {
  let value = 0;
  let seen = false;
  let half = false;
  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at];
    if (token === "and" && tokens[at + 1] === "a" && tokens[at + 2] === "half") {
      if (!seen) return null;
      half = true;
      at += 2;
      continue;
    }
    if (half) return null;
    if (token === "hundred") {
      if (!seen) return null;
      value *= 100;
      continue;
    }
    if (!(token in WORDS)) return null;
    value += WORDS[token];
    seen = true;
  }
  return seen ? value + (half ? 0.5 : 0) : null;
}

/** Every "<words> gigabytes" in a passage, as a value and the phrase used. */
function wordFigures(prose: string): { phrase: string; value: number; gib: boolean }[] {
  const tokens = prose.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean);
  const out: { phrase: string; value: number; gib: boolean }[] = [];
  for (let at = 0; at < tokens.length; at += 1) {
    const unit = tokens[at];
    if (unit !== "gigabytes" && unit !== "gigabyte" && unit !== "megabytes" && unit !== "megabyte") {
      continue;
    }
    /* The longest run of words before it that parses as a number wins. */
    for (let back = Math.max(0, at - 5); back < at; back += 1) {
      const run = tokens.slice(back, at);
      const value = fromWords(run);
      if (value !== null) {
        out.push({ phrase: `${run.join(" ")} ${unit}`, value, gib: unit.startsWith("gigabyte") });
        break;
      }
    }
  }
  return out;
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
  if (!fattestSurvives(item)) biggestDies += 1;

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

  /* And the same figures written out, at a tenth rather than exactly. */
  for (const { phrase, value, gib } of wordFigures(prose)) {
    if (allowed.has(phrase)) continue;
    const wanted = gib ? value * 1024 : value;
    if (!sizes.some((size) => Math.abs(size - wanted) <= Math.max(1, wanted * WORD_TOLERANCE))) {
      problems.push(
        `${item.slug}: the prose says "${phrase}" and no quantity in this case is within` +
          ` ${WORD_TOLERANCE * 100}% of it. Either the figure is wrong or it is a hypothetical` +
          ` needing an entry in HYPOTHETICAL.`,
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
  useless as picking it every time. The target is half, so that "the biggest
  one" carries no information at all and a reader has to do the arithmetic.

  The count is also rendered on the page, in the practice hub, in the home
  act and in the prerendered body, all four from fattestSurvives. They said
  "four of the ten" by hand while the computed body said five, which is the
  same bug as an answer key: a number about the model, typed next to it.
*/
const survives = CASES.length - biggestDies;
if (biggestDies === 0) {
  problems.push("in no case is the largest candidate the victim, which teaches that it never is");
}
if (survives === 0) {
  problems.push("the largest candidate is always the victim, so guessing works every time");
}
if (Math.abs(survives - CASES.length / 2) > CASES.length * 0.15) {
  problems.push(
    `the largest candidate survives in ${survives} of ${CASES.length} cases. The target is half,` +
      ` so that picking the biggest process carries no information either way.`,
  );
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

  This assertion was written the wrong way round first, from memory, and it
  passed against a model that was wrong the same way. Reading mm/oom_kill.c
  settled it: oom_evaluate_task skips on `points < oc->chosen_points`, so an
  equal score falls through to select and replaces the standing choice. The
  last equal task wins. Two things agreeing is not evidence when the same
  belief wrote both of them.
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
if (chosen(tied, system)?.pid !== 12) {
  problems.push("a tie does not go to the task the walk reached last, which is what the kernel does");
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
  The normaliser truncates, and it truncates a page count.

  These are properties rather than magic numbers, because the numbers here
  were wrong once: the model kept its figures in MiB and truncated there,
  which is a different operation from truncating pages and moved every adj by
  about a fortieth. The last assertion is the one that catches it. On a
  512 MiB cgroup a thousandth of the memory is 131 pages, which is half a
  mebibyte; a model truncating MiB would make it nothing at all, and every
  adj inside a sub-gigabyte cgroup would silently stop counting.
*/
if (adjWorth(0, 99999) !== 0) problems.push("an adj of zero is worth something");
if (adjWorth(-100, 4608) !== -adjWorth(100, 4608)) problems.push("adjWorth is not symmetric about zero");
if (adjWorth(1000, 16384) > 16384) problems.push("an adj of 1000 is worth more than the whole machine");
if (adjWorth(1000, 16384) < 16384 * 0.999) problems.push("an adj of 1000 is worth much less than the machine");
if (adjUnit(1001) !== 1) problems.push(`adjUnit(1001) is ${adjUnit(1001)}; the truncation is not happening`);
if (adjUnit(1000) !== adjUnit(1001)) problems.push("1000 and 1001 MiB give different adj units, so nothing is truncated");
if (adjUnit(512) <= 0) {
  problems.push("one adj point is worth nothing in a 512 MiB cgroup, which means the truncation is in the wrong unit");
}
if (adjUnit(512) * PAGES_PER_MIB !== 131) {
  problems.push(`a thousandth of a 512 MiB cgroup is ${adjUnit(512) * PAGES_PER_MIB} pages, not 131`);
}

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
      .matchAll(/[0-9]+(?:\.[0-9]+)? ?(?:GiB|MiB|gigabytes|megabytes)/g)].length +
    wordFigures([item.brief, item.why, item.fix, item.name, ...item.options.map((o) => o.claim)].join(" ")).length,
  0,
);
console.log(
  `OK  ${CASES.length} OOM cases, each with exactly one option naming what the kernel kills,` +
    ` ${survives} of them where the largest candidate survives, and all ${figures} sizes` +
    ` stated in prose, in digits or in words, are quantities the case produces.`,
);
