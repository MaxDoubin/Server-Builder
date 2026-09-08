/**
 * The daily selection has to cover everything and repeat nothing early.
 *
 * The failure this guards against is quiet: a surface whose list is renamed or
 * emptied simply stops appearing, and the page still renders a tidy grid with
 * one fewer card. Nobody notices that the labs have not been offered for a
 * month.
 */

import { cycleDays, picksFor } from "../client/src/lib/today/index";
import { pickFor } from "../client/src/lib/today/pick";

const problems: string[] = [];

/*
  Every surface must appear, every day. A missing one is the failure above.
*/
const EXPECTED = [
  "scenarios",
  "labs",
  "captures",
  "challenges",
  "triage",
  "firewall",
  "resolve",
  "chain",
  "allocate",
  "transfer",
  "logs",
];

const today = picksFor(0);
for (const surface of EXPECTED) {
  if (!today.some((pick) => pick.surface === surface)) {
    problems.push(`${surface} is missing from the selection`);
  }
}
if (today.length !== EXPECTED.length) {
  problems.push(`expected ${EXPECTED.length} picks, got ${today.length}`);
}

/* Deterministic: the same day must give the same answer. */
for (const day of [0, 1, 12345, 20704, -3]) {
  const first = picksFor(day);
  const second = picksFor(day);
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    problems.push(`day ${day} is not deterministic`);
  }
  for (const pick of first) {
    if (!pick.title.trim()) problems.push(`day ${day}: ${pick.surface} has an empty title`);
    if (!pick.blurb.trim()) problems.push(`day ${day}: ${pick.surface} has an empty blurb`);
    if (!pick.href.startsWith("/")) problems.push(`day ${day}: ${pick.surface} href is not a path`);
    if (pick.outOf < 1) problems.push(`day ${day}: ${pick.surface} claims a list of ${pick.outOf}`);
  }
}

/* Negative days must not throw or index out of range: the modulo has to be the positive one. */
for (const day of [-1, -7, -1000]) {
  const picks = picksFor(day);
  if (picks.length !== EXPECTED.length) {
    problems.push(`day ${day} produced ${picks.length} picks; a negative day number broke the index`);
  }
}

/*
  A rotation, not a hash: over N days a list of N must show every item exactly
  once. This is the property that makes "come back tomorrow" mean something.
*/
const LISTS = [3, 6, 8, 9, 14, 20];
for (const length of LISTS) {
  const items = Array.from({ length }, (_, i) => i);
  const seen = new Set<number>();
  for (let day = 0; day < length; day += 1) {
    const value = pickFor(items, day, 0);
    if (value === undefined) {
      problems.push(`rotation over ${length}: day ${day} picked nothing`);
      continue;
    }
    if (seen.has(value)) problems.push(`rotation over ${length}: repeated ${value} within one cycle`);
    seen.add(value);
  }
  if (seen.size !== length) {
    problems.push(`rotation over ${length}: covered ${seen.size} of ${length} in one cycle`);
  }
}

/* An empty list yields nothing rather than throwing. */
if (pickFor([], 5, 0) !== undefined) problems.push("an empty list should pick nothing");

/*
  Over one full cycle of each surface, that surface's item must change every
  day rather than sticking. Checking the first surface's slug across a fortnight
  catches an offset or modulo that has collapsed to a constant.
*/
const fortnight = new Set<string>();
for (let day = 0; day < 14; day += 1) {
  const pick = picksFor(day).find((p) => p.surface === "labs");
  if (pick) fortnight.add(pick.href);
}
if (fortnight.size < 5) {
  problems.push(`labs offered only ${fortnight.size} distinct items across 14 days`);
}

if (cycleDays() < 100) {
  problems.push(`the whole selection repeats every ${cycleDays()} days, which is suspiciously short`);
}

if (problems.length) {
  console.error(`\ncheck-today: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${EXPECTED.length} surfaces in every day's selection, deterministic across positive and negative day numbers, ` +
    `a true rotation over ${LISTS.length} list sizes, and a full cycle of ${cycleDays().toLocaleString()} days.`,
);
