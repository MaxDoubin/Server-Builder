/**
 * Every address plan has to be solvable, and unsolved to begin with.
 *
 * The solvable half is not obvious for this one. A set of host counts and a
 * block can be arithmetically infeasible, and it is easy to write by accident:
 * I wrote one, and the first run of this caught it while I was still calling
 * it an exercise. A problem with no answer is not a hard problem, it is a
 * broken one, so every solution is replayed here and every requirement has to
 * come back satisfied.
 *
 * There is also a table of address arithmetic worked out by hand, because
 * everything above is the reviewer checking itself against the same code that
 * would be wrong.
 */

import { PROBLEMS } from "../client/src/lib/allocate/data/problems";
import { review } from "../client/src/lib/allocate/review";
import {
  contains,
  format,
  isAligned,
  isCidr,
  overlaps,
  parseCidr,
  prefixForHosts,
  sizeOf,
  usableIn,
} from "../client/src/lib/allocate/cidr";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

const seen = new Set<string>();
let requirementCount = 0;

for (const problem of PROBLEMS) {
  if (seen.has(problem.slug)) note(problem.slug, "duplicate slug");
  seen.add(problem.slug);
  requirementCount += problem.requirements.length;

  const block = parseCidr(problem.block);
  if (!isCidr(block)) {
    note(problem.slug, `the block does not parse: ${block.error}`);
    continue;
  }
  if (!isAligned(block)) note(problem.slug, `${problem.block} is not a network address`);

  const solved = review(problem, problem.solution);
  if (!solved.solved) {
    for (const finding of solved.findings.filter((f) => !f.ok)) {
      note(problem.slug, `the solution fails "${finding.requirementId}": ${finding.message}`);
    }
  }

  const empty = review(problem, {});
  if (empty.solved) note(problem.slug, "an empty plan already passes, so there is nothing to do");

  /*
    Feasibility, computed independently of the solution.

    Summing the rounded-up block sizes is a lower bound on what the plan costs,
    and if that exceeds the block there is no arrangement that fits. It will
    not catch every infeasible problem, because alignment can waste space this
    sum does not model, but it catches the one I actually wrote.
  */
  const floor = problem.requirements.reduce(
    (sum, requirement) => sum + sizeOf(prefixForHosts(requirement.hosts)),
    0,
  );
  if (floor > sizeOf(block.prefix)) {
    note(
      problem.slug,
      `the requirements need at least ${floor} addresses and ${problem.block} has ${sizeOf(block.prefix)}. No arrangement fits.`,
    );
  }

  /* Every "within" constraint has to be inside the block and satisfiable. */
  for (const requirement of problem.requirements) {
    if (!requirement.within) continue;
    const within = parseCidr(requirement.within);
    if (!isCidr(within)) {
      note(problem.slug, `${requirement.id}: within does not parse`);
      continue;
    }
    if (!contains(block, within)) {
      note(problem.slug, `${requirement.id}: within ${requirement.within} is outside the block`);
    }
    if (usableIn(within.prefix) < requirement.hosts) {
      note(
        problem.slug,
        `${requirement.id}: needs ${requirement.hosts} hosts and its within block holds ${usableIn(within.prefix)}`,
      );
    }
  }

  /* Grouped "within" constraints have to be jointly satisfiable too. */
  const groups = new Map<string, number>();
  for (const requirement of problem.requirements) {
    if (!requirement.within) continue;
    groups.set(
      requirement.within,
      (groups.get(requirement.within) ?? 0) + sizeOf(prefixForHosts(requirement.hosts)),
    );
  }
  for (const [where, needed] of groups) {
    const parsed = parseCidr(where);
    if (!isCidr(parsed)) continue;
    if (needed > sizeOf(parsed.prefix)) {
      note(
        problem.slug,
        `the subnets constrained to ${where} need at least ${needed} addresses and it holds ${sizeOf(parsed.prefix)}`,
      );
    }
  }

  /* Every solution entry must correspond to a requirement, and vice versa. */
  const ids = new Set(problem.requirements.map((r) => r.id));
  for (const key of Object.keys(problem.solution)) {
    if (!ids.has(key)) note(problem.slug, `the solution allocates ${key}, which is not a requirement`);
  }
  for (const id of ids) {
    if (!(id in problem.solution)) note(problem.slug, `the solution has nothing for ${id}`);
  }

  if (problem.hints.length < 2) note(problem.slug, "fewer than two hints");
  if (problem.debrief.length < 2) note(problem.slug, "the debrief is too thin");
  if (problem.requirements.length < 3) note(problem.slug, "fewer than three requirements");
}

/* Address arithmetic, worked out by hand. */
const USABLE: [number, number][] = [
  [24, 254],
  [25, 126],
  [26, 62],
  [27, 30],
  [28, 14],
  [29, 6],
  [30, 2],
  [31, 2],
  [32, 1],
  [16, 65534],
  [20, 4094],
];
for (const [prefix, want] of USABLE) {
  const got = usableIn(prefix);
  if (got !== want) problems.push(`usable in a /${prefix} should be ${want}, got ${got}`);
}

const NEEDED: [number, number][] = [
  // One host is a /32 host route, not a /31. I wrote 31 here first and the
  // check was right: a /31 spends two addresses on one host for no reason.
  [1, 32],
  [2, 31],
  [3, 29],
  [6, 29],
  [7, 28],
  [14, 28],
  [15, 27],
  [100, 25],
  [126, 25],
  [127, 24],
  [254, 24],
  [400, 23],
  [4000, 20],
];
for (const [hosts, want] of NEEDED) {
  const got = prefixForHosts(hosts);
  if (got !== want) problems.push(`${hosts} hosts should need a /${want}, got /${got}`);
}

/* Alignment and overlap, in both directions. */
const ALIGNED: [string, boolean][] = [
  ["192.168.10.0/24", true],
  ["192.168.10.128/25", true],
  ["192.168.10.64/25", false],
  ["10.40.3.0/23", false],
  ["10.40.2.0/23", true],
  ["172.16.5.14/31", true],
  ["172.16.5.13/31", false],
  ["10.80.16.0/20", true],
  ["10.80.8.0/20", false],
];
for (const [text, want] of ALIGNED) {
  const parsed = parseCidr(text);
  if (!isCidr(parsed)) {
    problems.push(`alignment: ${text} did not parse`);
    continue;
  }
  const got = isAligned(parsed);
  if (got !== want) problems.push(`${text} aligned should be ${want}, got ${got}`);
}

const OVERLAPS: [string, string, boolean][] = [
  ["192.168.30.0/25", "192.168.30.64/26", true],
  ["192.168.30.0/25", "192.168.30.128/26", false],
  ["10.0.0.0/8", "10.255.255.255/32", true],
  ["10.0.0.0/8", "11.0.0.0/8", false],
  ["192.168.30.0/24", "192.168.30.0/24", true],
];
for (const [first, second, want] of OVERLAPS) {
  const a = parseCidr(first);
  const b = parseCidr(second);
  if (!isCidr(a) || !isCidr(b)) {
    problems.push(`overlap: ${first} or ${second} did not parse`);
    continue;
  }
  const got = overlaps(a, b);
  if (got !== want) problems.push(`${format(a)} against ${format(b)} should be ${want}, got ${got}`);
}

/* Malformed input must be refused with a message, not silently normalised. */
const REFUSALS: [string, RegExp][] = [
  ["192.168.1.0", /needs a prefix/],
  ["192.168.1.0/33", /above 32/],
  ["192.168.1.256/24", /not four octets/],
  ["192.168.1/24", /not four octets/],
  ["192.168.1.0/ab", /not a number/],
];
for (const [text, pattern] of REFUSALS) {
  const parsed = parseCidr(text);
  if (isCidr(parsed)) {
    problems.push(`refusals: "${text}" parsed cleanly and should not have`);
    continue;
  }
  if (!pattern.test(parsed.error)) {
    problems.push(`refusals: "${text}" was refused with "${parsed.error}", not matching ${pattern}`);
  }
}

if (problems.length) {
  console.error(`\ncheck-allocate: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${PROBLEMS.length} address plans, ${requirementCount} requirements, every solution satisfies every one and every empty plan does not. ` +
    `${USABLE.length + NEEDED.length + ALIGNED.length + OVERLAPS.length} hand-computed results agree with the arithmetic, and ${REFUSALS.length} malformed CIDRs are refused.`,
);
