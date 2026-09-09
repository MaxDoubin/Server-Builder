/**
 * Turning four facts about your estate into a place in the queue.
 *
 * The decision itself is a table lookup, and that is the point: the judgment
 * was made once, by people who wrote down their reasoning, and applying it is
 * mechanical. What is not mechanical is reading an advisory and a description
 * of your own systems and coming out with the four facts. That is what the
 * exercise is for.
 *
 * The comparison functions exist because the disagreement is the lesson. A
 * queue sorted by base score and a queue sorted by this rarely match, and
 * seeing by how much is more convincing than being told.
 */

import { TREE, keyFor } from "./data/tree";
import type { Finding, Points, Priority } from "./types";

/** Where a finding belongs, from the published tree. */
export function priorityFor(points: Points): Priority {
  const found = TREE[keyFor(points)];
  /*
    The table is complete: all 72 combinations are present, and CI checks
    that. So a miss here is a type that has grown a value the table has not,
    which is worth failing loudly rather than defaulting to something safe
    looking.
  */
  if (!found) throw new Error(`no row in the deployer tree for ${keyFor(points)}`);
  return found;
}

/** How urgent each priority is, for ordering a queue. */
export const URGENCY: Record<Priority, number> = {
  immediate: 3,
  "out-of-cycle": 2,
  scheduled: 1,
  defer: 0,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  immediate: "Immediate",
  "out-of-cycle": "Out-of-cycle",
  scheduled: "Scheduled",
  defer: "Defer",
};

/**
 * The qualitative rating the specification attaches to a base score.
 *
 * Here so that a finding's printed severity can be checked against its score
 * rather than believed. A vendor that prints Critical beside a 7.4 has made a
 * mistake, and an exercise that reproduces the mistake teaches it.
 */
export function severityFor(cvss: number): Finding["severity"] {
  if (cvss >= 9.0) return "Critical";
  if (cvss >= 7.0) return "High";
  if (cvss >= 4.0) return "Medium";
  return "Low";
}

/** The queue as a scanner hands it to you: highest base score first. */
export const byScore = (findings: Finding[]): Finding[] =>
  [...findings].sort((a, b) => b.cvss - a.cvss || a.id.localeCompare(b.id));

/**
 * The queue by what to do about it, and base score only inside a tier.
 *
 * Base score is not a tiebreak anybody has justified; it is here because
 * within one tier something has to go first, and it is the ordering a reader
 * arrives with, which makes the tiers the only thing that changed.
 */
export const byPriority = (findings: Finding[]): Finding[] =>
  [...findings].sort(
    (a, b) =>
      URGENCY[priorityFor(b.points)] - URGENCY[priorityFor(a.points)] ||
      b.cvss - a.cvss ||
      a.id.localeCompare(b.id),
  );

/**
 * How far each finding moves between the two queues.
 *
 * Positive means the base score queue had it too low: it should be worked
 * sooner than a scanner suggests. Negative means the opposite, and those are
 * the ones that eat a week.
 */
export function displacement(findings: Finding[]): Map<string, number> {
  const scored = byScore(findings).map((finding) => finding.id);
  const ranked = byPriority(findings).map((finding) => finding.id);
  const out = new Map<string, number>();
  for (const [index, id] of scored.entries()) out.set(id, index - ranked.indexOf(id));
  return out;
}

/** The worst single disagreement, in queue positions. */
export const worstMove = (findings: Finding[]): number =>
  Math.max(0, ...[...displacement(findings).values()].map(Math.abs));

/**
 * How many pairs the two queues order differently, out of all pairs.
 *
 * Kendall's tau distance, unnormalised. One number for "how wrong is the
 * scanner's order", which does not depend on which finding you look at.
 */
export function invertedPairs(findings: Finding[]): { inverted: number; pairs: number } {
  const ranked = byPriority(findings).map((finding) => finding.id);
  const scored = byScore(findings).map((finding) => finding.id);
  let inverted = 0;
  let pairs = 0;
  for (let i = 0; i < scored.length; i += 1) {
    for (let j = i + 1; j < scored.length; j += 1) {
      pairs += 1;
      if (ranked.indexOf(scored[i]) > ranked.indexOf(scored[j])) inverted += 1;
    }
  }
  return { inverted, pairs };
}

/** Findings whose tier the base score ordering cannot see at all. */
export const misrankedByScore = (findings: Finding[]): Finding[] =>
  findings.filter((finding) => {
    const move = displacement(findings).get(finding.id) ?? 0;
    return Math.abs(move) >= 3;
  });
