/**
 * The transcribed decision tree has to be the published one, and the findings
 * have to be honest about which queue they belong in.
 *
 * The tree is somebody else's work copied into this repository, which is the
 * most dangerous kind of data to hold: a single flipped cell produces a page
 * that teaches a wrong judgement with a citation attached to it. Diffing
 * against the source on every build is not an option, because a gate that
 * fails when certcc.github.io has a bad minute is a gate everyone learns to
 * ignore. So the transcription is checked against properties of the tree
 * instead, and the useful one is monotonicity: worsening any single decision
 * point must never lower the priority. The published table satisfies that in
 * all 72 rows and 216 single-step comparisons, so any typo that moves a cell
 * downwards breaks it. Completeness and the two documented invariants are
 * checked as well.
 *
 * The findings are then checked for the thing that makes this surface worth
 * having: the base score queue and the decision queue must genuinely
 * disagree, and must also genuinely agree in places. A set where every
 * finding moves teaches "invert the scanner", which is a new wrong rule
 * rather than the absence of one.
 */

import { readFileSync } from "node:fs";
import {
  FINDINGS,
  TREE,
  byPriority,
  byScore,
  displacement,
  invertedPairs,
  keyFor,
  priorityFor,
  severityFor,
  worstMove,
  URGENCY,
  type Automatable,
  type Exploitation,
  type Exposure,
  type HumanImpact,
  type Points,
  type Priority,
} from "../client/src/lib/patch/index";

const problems: string[] = [];

/* ---------------------------------------------------------------- the tree */

/** In order of severity, worst last. The order is what monotonicity means. */
const EXPLOITATION: Exploitation[] = ["none", "public-poc", "active"];
const EXPOSURE: Exposure[] = ["small", "controlled", "open"];
const AUTOMATABLE: Automatable[] = ["no", "yes"];
const IMPACT: HumanImpact[] = ["low", "medium", "high", "very-high"];

const every: Points[] = [];
for (const exploitation of EXPLOITATION) {
  for (const exposure of EXPOSURE) {
    for (const automatable of AUTOMATABLE) {
      for (const impact of IMPACT) every.push({ exploitation, exposure, automatable, impact });
    }
  }
}

if (every.length !== 72) problems.push(`the four decision points make ${every.length} combinations, not 72`);
if (Object.keys(TREE).length !== 72) {
  problems.push(`the tree holds ${Object.keys(TREE).length} rows rather than 72`);
}
for (const points of every) {
  if (!TREE[keyFor(points)]) problems.push(`the tree has no row for ${keyFor(points)}`);
}
/* And nothing extra, which would mean a key that no combination can produce. */
const reachable = new Set(every.map(keyFor));
for (const key of Object.keys(TREE)) {
  if (!reachable.has(key)) problems.push(`the tree holds "${key}", which no combination of the decision points produces`);
}

/*
  Stop here if the table is not complete.

  Everything below calls priorityFor(), which throws on a missing row rather
  than inventing a safe looking default. Carrying on would replace the clear
  message above with a stack trace, which I found by deleting a row to check
  that deleting a row was caught: it was caught, and then buried.
*/
if (problems.length) {
  console.error(`\ncheck-patch: ${problems.length} problem${problems.length === 1 ? "" : "s"} in the tree itself\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

/**
 * Monotonicity, which is the transcription check.
 *
 * Worsen exactly one point by one step and the priority must not go down.
 * 186 comparisons over the 72 rows, and a single mistyped outcome fails it
 * unless the typo happens to be monotone as well, which the four outcomes
 * make unlikely: three of the four possible wrong values for a given cell
 * break it.
 */
const AXES: [keyof Points, string[]][] = [
  ["exploitation", EXPLOITATION],
  ["exposure", EXPOSURE],
  ["automatable", AUTOMATABLE],
  ["impact", IMPACT],
];
let comparisons = 0;
for (const points of every) {
  for (const [axis, order] of AXES) {
    const at = order.indexOf(points[axis] as string);
    if (at + 1 >= order.length) continue;
    const worse = { ...points, [axis]: order[at + 1] } as Points;
    comparisons += 1;
    if (URGENCY[priorityFor(worse)] < URGENCY[priorityFor(points)]) {
      problems.push(
        `the tree is not monotone: worsening ${axis} from ${points[axis]} to ${order[at + 1]} takes ` +
          `${priorityFor(points)} down to ${priorityFor(worse)} at ${keyFor(points)}`,
      );
    }
  }
}
if (comparisons !== 186) problems.push(`monotonicity ran ${comparisons} comparisons rather than 186`);

/*
  The two invariants the source states in prose, which are worth holding
  separately because they are the shape of the framework rather than a
  detail of it: nothing reaches immediate on fear alone, and nothing being
  exploited is ever deferred.
*/
for (const points of every) {
  const priority = priorityFor(points);
  if (priority === "immediate" && !(points.exploitation === "active" && points.exposure === "open")) {
    problems.push(`${keyFor(points)} is immediate without being both actively exploited and openly exposed`);
  }
  if (priority === "defer" && points.exploitation === "active") {
    problems.push(`${keyFor(points)} defers something that is being exploited`);
  }
}

/* And the published counts, which pin the transcription to a specific version. */
const counts = new Map<Priority, number>();
for (const points of every) {
  const priority = priorityFor(points);
  counts.set(priority, (counts.get(priority) ?? 0) + 1);
}
const PUBLISHED: [Priority, number][] = [
  ["immediate", 3],
  ["out-of-cycle", 20],
  ["scheduled", 42],
  ["defer", 7],
];
for (const [priority, expected] of PUBLISHED) {
  const actual = counts.get(priority) ?? 0;
  if (actual !== expected) {
    problems.push(
      `${actual} rows say ${priority} and the published tree has ${expected}. Either the transcription is wrong or it is from a different version, and both need saying out loud.`,
    );
  }
}

/* ------------------------------------------------------------ the findings */

const ids = new Set<string>();
const traps = new Set<string>();
const tiers = new Map<Priority, number>();

for (const finding of FINDINGS) {
  const where = finding.id;
  if (ids.has(finding.id)) problems.push(`${where}: two findings share this reference`);
  ids.add(finding.id);

  /*
    Deliberately not a CVE. A constructed advisory that looks like a CVE
    identifier will be quoted back at somebody as though it were real.
  */
  if (!/^ADV-\d{4}-\d{4}$/.test(finding.id)) {
    problems.push(`${where}: references are ADV-YYYY-NNNN so that nothing here reads as a real CVE`);
  }

  if (traps.has(finding.trap)) {
    problems.push(`${where}: its trap is one another finding already sets. Ten findings teaching one thing is one finding.`);
  }
  traps.add(finding.trap);
  if (finding.trap.length < 60) problems.push(`${where}: the trap is too short to name a reading`);

  /* The printed severity carries no information the score does not, so it must not disagree with it. */
  if (severityFor(finding.cvss) !== finding.severity) {
    problems.push(
      `${where}: printed ${finding.severity} beside ${finding.cvss}, and the rating scale says ${severityFor(finding.cvss)}`,
    );
  }
  if (finding.cvss < 0 || finding.cvss > 10) problems.push(`${where}: ${finding.cvss} is not a base score`);

  /* The estate notes are the evidence. Without them the exercise is a guess. */
  if (finding.estate.length < 3) {
    problems.push(`${where}: ${finding.estate.length} estate notes is not enough to derive four decision points from`);
  }
  for (const note of finding.estate) {
    if (note.length < 40) problems.push(`${where}: an estate note is too short to be evidence`);
  }
  if (finding.summary.length < 60) problems.push(`${where}: the advisory summary says too little`);

  /* Every decision point needs its reason, or the reveal is an assertion. */
  for (const key of ["exploitation", "exposure", "automatable", "impact"] as (keyof Points)[]) {
    const reason = finding.because[key];
    if (!reason || reason.length < 60) problems.push(`${where}: no usable reason given for ${key}`);
  }

  /*
    And the prose must not give the answer away. A reason that says "so this
    is immediate" turns a judgement into a reading comprehension exercise,
    which is the failure mode of every written scenario question.
  */
  const prose = [finding.summary, finding.trap, ...finding.estate, ...Object.values(finding.because)]
    .join(" ")
    .toLowerCase();
  for (const word of ["out-of-cycle", "defer", "scheduled"]) {
    if (prose.includes(word)) {
      problems.push(`${where}: its prose contains "${word}", which names a tier and hands over the answer`);
    }
  }
  /* "immediate" and "immediately" are ordinary English, so only the tier reading is caught. */
  if (/\bimmediate\b/.test(prose)) {
    problems.push(`${where}: its prose says "immediate", which names a tier and hands over the answer`);
  }

  const priority = priorityFor(finding.points);
  tiers.set(priority, (tiers.get(priority) ?? 0) + 1);
}

if (FINDINGS.length < 8) problems.push(`${FINDINGS.length} findings is too few for two queues to disagree usefully`);

/* All four tiers have to appear, or a tier is defined and never demonstrated. */
for (const [priority] of PUBLISHED) {
  if (!tiers.get(priority)) {
    problems.push(`no finding lands in "${priority}", so that tier is explained and never shown`);
  }
}

/* ------------------------------------------------- the disagreement itself */

/*
  This is the surface's whole reason to exist, so it is a build failure if it
  stops being true. Two queues that agree make a page about nothing.
*/
const worst = worstMove(FINDINGS);
if (worst < 4) {
  problems.push(
    `the worst disagreement between the two queues is ${worst} positions, which is not enough to be worth a page`,
  );
}
const { inverted, pairs } = invertedPairs(FINDINGS);
if (inverted < pairs * 0.1) {
  problems.push(`only ${inverted} of ${pairs} pairs are ordered differently by the two queues`);
}

/*
  And the other direction, which is the one I would have forgotten. If every
  finding moves, the lesson a reader takes is "the scanner is backwards",
  which is a new wrong rule rather than the absence of one.
*/
const moves = displacement(FINDINGS);
const settled = [...moves.values()].filter((move) => move === 0).length;
if (settled < 2) {
  problems.push(
    `only ${settled} findings are in the same place in both queues. A set where everything moves teaches that base score is backwards, which is not true either.`,
  );
}
if (settled > FINDINGS.length * 0.7) {
  problems.push(`${settled} of ${FINDINGS.length} findings do not move, so the two queues barely differ`);
}

/* The top of each queue has to be a different finding, or the picture is dull. */
if (byScore(FINDINGS)[0].id === byPriority(FINDINGS)[0].id) {
  problems.push("both queues start with the same finding, which is the one thing this page needs not to be true");
}

/* --------------------------------------------------------------- the page */

const page = readFileSync("client/src/pages/cinematic/CinematicPatch.tsx", "utf8");
for (const [pattern, complaint] of [
  [/priorityFor\(/, "does not call priorityFor(), so the tier it shows is not the tree's"],
  [/\.because\[/, "does not show why each decision point is what it is"],
  [/byScore\(/, "does not render the base score queue, so there is nothing to disagree with"],
  [/byPriority\(/, "does not render the decision queue"],
  [/displacement\(/, "does not show how far anything moved, which is the argument"],
  [/recordSolvedPatch\(/, "does not record progress, so the surface forgets on reload"],
  [/<ReadAboutThis\s/, "does not link the articles behind it"],
] as [RegExp, string][]) {
  if (!pattern.test(page)) problems.push(`the page ${complaint}`);
}

if (problems.length) {
  console.error(`\ncheck-patch: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  the 72 row tree is complete and monotone over ${comparisons} comparisons, ` +
    `${FINDINGS.length} findings across all four tiers, ${inverted} of ${pairs} pairs ordered differently ` +
    `by base score, worst move ${worst} positions, and ${settled} findings that the scanner already had right.`,
);
