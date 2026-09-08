/**
 * The daily selection has to cover everything and repeat nothing early.
 *
 * The failure this guards against is quiet: a surface whose list is renamed
 * or emptied simply stops appearing, and the page still renders a tidy grid
 * with one fewer card. Nobody notices that the labs have not been offered
 * for a month.
 *
 * It happened anyway, because this file kept a hand-typed list of the
 * surfaces to expect. Five were built and never added to the rotation, so
 * they never appeared on a page whose own copy says it offers one thing from
 * every practise surface, and the check agreed with the page because both
 * were reading the same incomplete list. Three surfaces with progress stores
 * had no line in the progress panel for the same reason.
 *
 * The expected set is derived from the practise registry now. A surface that
 * should not rotate declares why, in the registry, and this reads that
 * declaration: absent is a decision with a reason rather than an omission.
 */

import { cycleDays, picksFor } from "../client/src/lib/today/index";
import { pickFor } from "../client/src/lib/today/pick";
import { PRACTISE_SURFACES } from "../client/src/lib/practiseSurfaces";
import { readFileSync } from "node:fs";

const problems: string[] = [];

/*
  Every surface that has not declared otherwise must appear, every day.
*/
const rotating = PRACTISE_SURFACES.filter((surface) => !surface.noRotation);
const EXPECTED = rotating.map((surface) => surface.href.slice(1));

/*
  The rotation's surface names have to match the registry's routes. "captures"
  against /capture is the kind of near-miss that makes a derived check quietly
  compare nothing, so the mapping is explicit and checked rather than assumed.
*/
const ALIAS: Record<string, string> = { capture: "captures" };
const expectedNames = EXPECTED.map((name) => ALIAS[name] ?? name);

for (const surface of PRACTISE_SURFACES) {
  if (surface.noRotation && surface.noRotation.length < 20) {
    problems.push(`${surface.href} says it does not rotate and the reason is too short to be one`);
  }
  if (surface.noProgress && surface.noProgress.length < 20) {
    problems.push(`${surface.href} says it has no progress line and the reason is too short to be one`);
  }
}


const today = picksFor(0);
for (const surface of expectedNames) {
  if (!today.some((pick) => pick.surface === surface)) {
    problems.push(
      `${surface} is a practise surface with no declared reason to sit out, and it is missing from the selection`,
    );
  }
}
if (today.length !== expectedNames.length) {
  problems.push(`expected ${expectedNames.length} picks, got ${today.length}`);
}
/* And nothing that declared itself out may sneak back in. */
for (const surface of PRACTISE_SURFACES.filter((item) => item.noRotation)) {
  const name = ALIAS[surface.href.slice(1)] ?? surface.href.slice(1);
  if (today.some((pick) => pick.surface === name)) {
    problems.push(`${surface.href} declares it does not rotate and it is in the selection`);
  }
}

/*
  The progress panel is the same rule. A surface with a progress store and no
  line is invisible on the page that summarises how far you have got, which is
  the whole reason that page exists.
*/
const panel = readFileSync("client/src/lib/today/progress.ts", "utf8");
for (const surface of PRACTISE_SURFACES) {
  const listed = panel.includes(`href: "${surface.href}"`);
  if (!surface.noProgress && !listed) {
    problems.push(`${surface.href} has no line in the progress panel and no declared reason`);
  }
  if (surface.noProgress && listed) {
    problems.push(`${surface.href} declares it has no progress and appears in the panel`);
  }
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
  if (picks.length !== expectedNames.length) {
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
