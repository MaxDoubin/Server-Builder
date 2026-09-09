/**
 * The unit cases have to be what systemd does, and the prose has to cover it.
 *
 * Three halves, which is one more than a half allows.
 *
 * The first recomputes every case with a second implementation and requires
 * exactly one option to hold. The data carries unit files and a systemctl
 * command and no answer, so an option set that has drifted from its own unit
 * files fails the build rather than teaching the wrong rule.
 *
 * The second exercises the rules the corpus cannot reach. Every case has one
 * answer by construction, which means no case can show what happens when a
 * rule is applied the other way round: there is no case where Requires=
 * without After= blocks, because that is not a thing systemd does, and a
 * model that did it would still produce ten cases with one answer each. So
 * each rule is asserted directly, in both directions.
 *
 * The third is that every directive a case declares has to be named in its
 * own prose. A case that uses BindsTo= and never says the word leaves the
 * reader to infer the rule from the answer, which is the opposite of the
 * exercise.
 */

import { CASES } from "../client/src/lib/units/data/cases";
import {
  correctOption,
  cycleIn,
  directivesOf,
  edgesOf,
  holds,
  levels,
  matching,
  meansStarted,
  noticesABrokenExec,
  orderOf,
  ordered,
  outcomeOf,
  pull,
  run,
  unitNamed,
  type Claim,
  type StartType,
  type Unit,
} from "../client/src/lib/units/index";

const problems: string[] = [];

/** Every claim shape, so a shape nothing uses is a dead branch in holds. */
const SHAPES: Claim["about"][] = [
  "active",
  "inactive",
  "not-pulled",
  "ordered",
  "unordered",
  "active-not-running",
  "cycle",
  "nothing",
];

/** Every directive the type offers, so a field nothing uses is dead data. */
const DIRECTIVES = ["Requires", "Wants", "Requisite", "BindsTo", "PartOf", "After", "Before"] as const;

/**
 * Directives declared by no case, with why.
 *
 * Before= is the inverse of After= and the model supports it, but every unit
 * file in the set writes the ordering from the depending side, because that
 * is where it belongs: a unit should not reach into another unit's ordering.
 * Keeping the support and not using it is deliberate.
 */
const UNUSED_DIRECTIVES: Record<string, string> = {
  Before:
    "the inverse of After= and supported by the model, deliberately unused in the cases because" +
    " ordering belongs on the unit that depends, not on the one depended upon",
};

/** A second implementation of the transaction, walked breadth first by level. */
function reachable(units: Unit[], start: string[]): Set<string> {
  const found = new Set<string>();
  let frontier = start.filter((name) => unitNamed(units, name));
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const name of frontier) {
      if (found.has(name)) continue;
      found.add(name);
      const unit = unitNamed(units, name)!;
      for (const other of [...(unit.requires ?? []), ...(unit.wants ?? []), ...(unit.bindsTo ?? [])]) {
        if (!found.has(other) && unitNamed(units, other)) next.push(other);
      }
    }
    frontier = next;
  }
  return found;
}

const slugs = new Set<string>();
const breaks = new Set<string>();
const shapesUsed = new Set<string>();
const directivesUsed = new Set<string>();
const typesUsed = new Set<StartType>();
const positions: number[] = [];

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: duplicate slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) problems.push(`${item.slug}: two cases break the same belief`);
  breaks.add(item.breaks);

  const outcome = outcomeOf(item);

  /* The transaction, recomputed. */
  const mine = reachable(item.units, item.start);
  if (mine.size !== outcome.transaction.length || !outcome.transaction.every((name) => mine.has(name))) {
    problems.push(
      `${item.slug}: the transaction is [${outcome.transaction.join(", ")}], recomputed as [${[...mine].join(", ")}]`,
    );
  }

  /* Every unit named anywhere has to exist, or the case is about a typo. */
  for (const unit of item.units) {
    typesUsed.add(unit.type);
    for (const [name, value] of directivesOf(unit)) {
      directivesUsed.add(name);
      for (const other of value.split(" ")) {
        if (!unitNamed(item.units, other)) {
          problems.push(`${item.slug}: ${unit.name} names ${other} in ${name}=, which is not a unit here`);
        }
      }
    }
  }
  for (const name of item.start) {
    if (!unitNamed(item.units, name)) problems.push(`${item.slug}: starts ${name}, which is not a unit here`);
  }
  for (const name of item.stop ?? []) {
    if (!unitNamed(item.units, name)) problems.push(`${item.slug}: stops ${name}, which is not a unit here`);
  }

  /* Exactly one option holds. This is how the page finds the answer. */
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} of ${item.options.length} options hold of the outcome.` +
        ` Exactly one has to.` +
        (hits.length > 1 ? ` These do: ${hits.map((hit) => hit.id).join(", ")}.` : ""),
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
  for (const option of item.options) {
    shapesUsed.add(option.says.about);
    if (option.claim.length < 25) problems.push(`${item.slug}: option ${option.id} is too short to be a claim`);
  }

  /* A cycle makes every pair on it ordered, so an ordering claim is unsound. */
  if (outcome.cycle) {
    for (const option of item.options) {
      if (option.says.about === "ordered" || option.says.about === "unordered") {
        problems.push(
          `${item.slug}: has an ordering cycle and an option claiming ${option.says.about}.` +
            ` Every pair on a cycle is reachable from every other, so such a claim is meaningless here.`,
        );
      }
    }
  }

  /* Every directive the case declares has to be named in its own prose. */
  const prose = `${item.brief} ${item.why} ${item.fix} ${item.name} ${item.options.map((o) => o.claim).join(" ")}`;
  for (const unit of item.units) {
    for (const [name] of directivesOf(unit)) {
      if (!prose.includes(`${name}=`)) {
        problems.push(
          `${item.slug}: ${unit.name} declares ${name}= and no prose in the case mentions it,` +
            ` so the reader has to infer the rule from the answer.`,
        );
      }
    }
  }
  /* And a type whose behavior is the answer has to be named. */
  if (item.units.some((unit) => unit.execWorks === false && !noticesABrokenExec(unit.type))) {
    if (!prose.includes("Type=simple")) {
      problems.push(`${item.slug}: turns on Type=simple not noticing a broken binary and never says Type=simple`);
    }
  }
}

/* Every claim shape has to be used, or holds has a branch nothing reaches. */
for (const shape of SHAPES) {
  if (!shapesUsed.has(shape)) {
    problems.push(`no option uses the claim shape "${shape}", so its branch in holds is never exercised`);
  }
}
for (const shape of shapesUsed) {
  if (!SHAPES.includes(shape as Claim["about"])) problems.push(`an option uses the unknown claim shape "${shape}"`);
}

/* Every directive has to be used, or excused. */
for (const name of DIRECTIVES) {
  if (!directivesUsed.has(name) && !(name in UNUSED_DIRECTIVES)) {
    problems.push(`no case declares ${name}=, so the model's support for it is untested by the corpus`);
  }
  if (directivesUsed.has(name) && name in UNUSED_DIRECTIVES) {
    problems.push(`UNUSED_DIRECTIVES excuses ${name}= and a case declares it`);
  }
}
if (typesUsed.size < 3) problems.push(`only ${typesUsed.size} distinct Type= values across the set`);
for (const type of Object.keys(meansStarted) as StartType[]) {
  if (meansStarted[type].length < 12) problems.push(`meansStarted has no real description for Type=${type}`);
}

/* And no positional tell. */
const counts = new Map<number, number>();
for (const at of positions) counts.set(at, (counts.get(at) ?? 0) + 1);
if (counts.size < 4) {
  problems.push(
    `the answer only ever sits in ${counts.size} of the four option positions, so two of them are never right`,
  );
}
for (const [at, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(`${count} of ${CASES.length} answers are option ${at + 1}; a reader who always picks it passes`);
  }
}

/*
  The rules, asserted directly and in both directions.

  Every case above has exactly one answer, which is a property of the case
  set rather than of the model: a model that had Requires= block without
  After= would still give ten cases one answer each, and four of them would
  be wrong. So the rules are tested here on machines built for the purpose.
*/
const two = (a: Partial<Unit>, b: Partial<Unit>): Unit[] => [
  { name: "a.service", description: "a", type: "notify", ...a },
  { name: "b.service", description: "b", type: "notify", ...b },
];

/*
  Requires= without After=: b fails and a starts anyway.

  Started in both orders on purpose. Without an ordering edge the walk order
  is the transaction order, and with the dependency second its failure is not
  yet known when the unit is considered, so a model that wrongly blocked on
  an unordered failure would still produce the right answer. This assertion
  was written that way first and passed against exactly that bug. The second
  line is the one with the power: the dependency is walked first, has already
  failed, and must still not block.
*/
for (const start of [["a.service"], ["b.service", "a.service"]]) {
  const loose = run(two({ requires: ["b.service"] }, { execWorks: false }), start);
  if (!loose.active.includes("a.service")) {
    problems.push(
      `Requires= without After= blocked the unit when started as ${start.join(" then ")},` +
        " and systemd.unit(5) makes that conditional on After= being set",
    );
  }
}
/* Requires= with After=: b fails and a does not start. */
const tight = run(two({ requires: ["b.service"], after: ["b.service"] }, { execWorks: false }), ["a.service"]);
if (tight.active.includes("a.service")) {
  problems.push("Requires= with After= did not block the unit when the dependency failed");
}
/* Wants= with After=: never blocks. */
const weak = run(two({ wants: ["b.service"], after: ["b.service"] }, { execWorks: false }), ["a.service"]);
if (!weak.active.includes("a.service")) problems.push("a failed Wants= blocked the unit");
/* Requisite= does not pull, and fails when the other is not already up. */
const absent = run(two({ requisite: ["b.service"], after: ["b.service"] }, {}), ["a.service"]);
if (absent.transaction.includes("b.service")) problems.push("Requisite= pulled the unit into the transaction");
if (absent.active.includes("a.service")) problems.push("Requisite= did not fail against an inactive unit");
if (!absent.notPulled.includes("b.service")) problems.push("a Requisite= unit is not reported as not pulled in");
/* Requisite= against a unit already running: fine. */
const present = run(two({ requisite: ["b.service"], after: ["b.service"] }, { alreadyActive: true }), ["a.service"]);
if (!present.active.includes("a.service")) problems.push("Requisite= failed against a unit that was already active");

/* Type=simple does not notice a broken binary; every other type does. */
for (const type of Object.keys(meansStarted) as StartType[]) {
  const outcome = run([{ name: "a.service", description: "a", type, execWorks: false }], ["a.service"]);
  const noticed = !outcome.active.includes("a.service");
  if (noticed !== noticesABrokenExec(type)) {
    problems.push(`Type=${type} ${noticed ? "noticed" : "did not notice"} a broken binary, which is backwards`);
  }
}

/* BindsTo= follows the other unit down; Wants= does not. */
const bound = run(two({ bindsTo: ["b.service"], after: ["b.service"] }, {}), ["a.service"], ["b.service"]);
if (bound.active.includes("a.service")) problems.push("BindsTo= did not follow the other unit down");
const wanted = run(two({ wants: ["b.service"], after: ["b.service"] }, {}), ["a.service"], ["b.service"]);
if (!wanted.active.includes("a.service")) problems.push("Wants= followed the other unit down");

/* PartOf= is one way. */
const downward = run(
  [
    { name: "parent.service", description: "p", type: "notify", wants: ["child.service"] },
    { name: "child.service", description: "c", type: "notify", partOf: ["parent.service"] },
  ],
  ["parent.service"],
  ["parent.service"],
);
if (downward.active.includes("child.service")) problems.push("PartOf= did not propagate a stop downward");
const upward = run(
  [
    { name: "parent.service", description: "p", type: "notify", wants: ["child.service"] },
    { name: "child.service", description: "c", type: "notify", partOf: ["parent.service"] },
  ],
  ["parent.service"],
  ["child.service"],
);
if (!upward.active.includes("parent.service")) problems.push("PartOf= propagated a stop upward, and it is one way");

/* Ordering: transitive, not symmetric, and empty without After=. */
const chain: [string, string][] = [
  ["a.service", "b.service"],
  ["b.service", "c.service"],
];
if (!ordered(chain, "a.service", "c.service")) problems.push("ordered() is not transitive");
if (ordered(chain, "c.service", "a.service")) problems.push("ordered() is symmetric, and ordering is not");
if (ordered(chain, "a.service", "a.service")) problems.push("ordered() says a unit is ordered against itself");
if (edgesOf(two({ requires: ["b.service"] }, {}), ["a.service", "b.service"]).length !== 0) {
  problems.push("a requirement produced an ordering edge");
}
/* An After= naming a unit outside the transaction produces no edge. */
if (edgesOf(two({ after: ["b.service"] }, {}), ["a.service"]).length !== 0) {
  problems.push("After= produced an edge against a unit that is not in the transaction");
}
/* Before= is the same edge from the other end. */
const fromAfter = edgesOf(two({ after: ["b.service"] }, {}), ["a.service", "b.service"]);
const fromBefore = edgesOf(two({}, { before: ["a.service"] }), ["a.service", "b.service"]);
if (JSON.stringify(fromAfter) !== JSON.stringify(fromBefore)) {
  problems.push("Before= and After= do not describe the same edge");
}

/* A cycle is found, and leaves the order undefined rather than guessed. */
const loop: [string, string][] = [
  ["a.service", "b.service"],
  ["b.service", "c.service"],
  ["c.service", "a.service"],
];
const found = cycleIn(["a.service", "b.service", "c.service"], loop);
if (!found || found.length !== 3) problems.push(`a three unit cycle was reported as ${JSON.stringify(found)}`);
if (orderOf(["a.service", "b.service", "c.service"], loop) !== null) {
  problems.push("a cycle produced a start order, and systemd's choice of deleted edge is not predictable");
}
if (cycleIn(["a.service", "b.service"], [["a.service", "b.service"]]) !== null) {
  problems.push("a plain edge was reported as a cycle");
}
const straight = orderOf(["b.service", "a.service"], [["a.service", "b.service"]]);
if (JSON.stringify(straight) !== JSON.stringify(["a.service", "b.service"])) {
  problems.push(`the order of one edge came out as ${JSON.stringify(straight)}`);
}

/*
  levels() has to mean what the page says it means: everything in one group
  starts at the same moment, and every group is after the one before it.

  Checked over every case rather than on a fixture, because the claim the page
  makes is about these graphs. A model that put an ordered pair in one group
  would draw two units as simultaneous when one waits for the other, which is
  the misreading the whole surface is about.
*/
for (const item of CASES) {
  const outcome = outcomeOf(item);
  const groups = levels(outcome.transaction, outcome.edges);
  if (outcome.cycle) {
    if (groups !== null) problems.push(`${item.slug}: has a cycle and levels() still grouped it`);
    continue;
  }
  if (!groups) {
    problems.push(`${item.slug}: has no cycle and levels() refused to group it`);
    continue;
  }
  if (groups.flat().length !== outcome.transaction.length) {
    problems.push(`${item.slug}: levels() covers ${groups.flat().length} of ${outcome.transaction.length} units`);
  }
  for (const group of groups) {
    for (const one of group) {
      for (const other of group) {
        if (one !== other && (ordered(outcome.edges, one, other) || ordered(outcome.edges, other, one))) {
          problems.push(`${item.slug}: ${one} and ${other} are in one group and are ordered against each other`);
        }
      }
    }
  }
  for (let at = 1; at < groups.length; at += 1) {
    for (const name of groups[at]) {
      if (!groups[at - 1].some((before) => ordered(outcome.edges, before, name))) {
        problems.push(`${item.slug}: ${name} is in group ${at + 1} and nothing in the group before it orders it`);
      }
    }
  }
}

/* pull() reports what it did not reach, and only real units. */
const named = pull(two({ after: ["b.service"], requisite: ["b.service"] }, {}), ["a.service"]);
if (!named.notPulled.includes("b.service")) problems.push("pull() does not report a named unit it did not reach");
const ghost = pull([{ name: "a.service", description: "a", type: "notify", after: ["ghost.service"] }], ["a.service"]);
if (ghost.notPulled.length !== 0) problems.push("pull() reports a unit that does not exist as not pulled in");

/* And holds() refuses the claim that asserts nothing. */
const anyOutcome = outcomeOf(CASES[0]);
if (holds({ about: "nothing" }, anyOutcome, CASES[0].units)) problems.push("the nothing claim holds of something");

if (problems.length) {
  console.error(`check-units: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const units = CASES.reduce((sum, item) => sum + item.units.length, 0);
console.log(
  `OK  ${CASES.length} cases over ${units} unit files, each with exactly one option that holds,` +
    ` all ${shapesUsed.size} claim shapes exercised, every declared directive named in its own prose,` +
    ` and the six ordering rules asserted in both directions.`,
);
