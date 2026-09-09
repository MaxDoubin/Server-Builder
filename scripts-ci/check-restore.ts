/**
 * The restore model has to do its arithmetic right and keep its scenarios
 * honest about what they demonstrate.
 *
 * The check that earns its place is the last one. Every scenario claims a
 * lesson in its trap text, and a scenario whose copies all survive its own
 * incident is not teaching that lesson: it is a backup posture that worked,
 * described as if it had not. So the survival outcome is compared against
 * what the scenario says about itself, and the set as a whole has to cover
 * both the case where nothing survives and the case where the fix is one
 * field different.
 *
 * The arithmetic is pinned against transfer times worked out by hand,
 * because a megabytes-per-second to gigabytes-per-hour conversion is exactly
 * the kind of thing that is out by a factor of 1.024 forever and looks
 * plausible the whole time.
 */

import { SCENARIOS } from "../client/src/lib/restore/data/scenarios";
import { assess, assessAll, best, domains, duration, hoursToMove, reaches } from "../client/src/lib/restore/model";
import type { Copy, Incident } from "../client/src/lib/restore/types";

const problems: string[] = [];
const close = (a: number, b: number, tolerance = 0.005) => Math.abs(a - b) <= Math.abs(b) * tolerance;

/* ------------------------------------------------- arithmetic by hand */

/*
  100 MB/s is 100 * 3600 / 1024 = 351.5625 GB per hour, so 1000 GB takes
  1000 / 351.5625 = 2.8444 hours. The 1024 is the whole point: using 1000
  gives 2.7778 and is wrong by 2.4 per cent in the direction that flatters
  the estimate.
*/
const HAND: [string, number, number][] = [
  ["1000 GB at 100 MB/s", hoursToMove(1000, 100), 1000 / ((100 * 3600) / 1024)],
  ["2400 GB at 120 MB/s", hoursToMove(2400, 120), 5.68888888888889],
  ["10000 GB at 90 MB/s", hoursToMove(10000, 90), 31.6049382716049],
  ["120 GB at 180 MB/s", hoursToMove(120, 180), 0.18962962962963],
];
for (const [label, got, want] of HAND) {
  if (!close(got, want)) problems.push(`${label}: the model says ${got}, hand arithmetic says ${want}`);
}
/* Nothing takes negative time, and nothing moves instantly. */
if (hoursToMove(0, 100) !== 0) problems.push("moving nothing takes time");
if (hoursToMove(100, 100) <= 0) problems.push("moving something takes no time");

/* ------------------------------------------- the survival rules, by hand */

const copy = (over: Partial<Copy>): Copy => ({
  name: "c", medium: "disk", intervalHours: 24, retentionDays: 30, sharesWith: "none",
  immutable: false, retrievalHours: 0, restoreMbps: 100, everRestored: true, ...over,
});

const RULES: [Incident, Partial<Copy>, boolean, string][] = [
  ["array-failure", { sharesWith: "array" }, false, "a copy on the failed array"],
  ["array-failure", { sharesWith: "site" }, true, "a copy elsewhere in the building"],
  ["site-loss", { sharesWith: "site" }, false, "a copy in the lost building"],
  ["site-loss", { sharesWith: "array" }, false, "a copy on the array in the lost building"],
  ["site-loss", { sharesWith: "account" }, true, "a copy offsite under the same account"],
  ["ransomware", { sharesWith: "account", immutable: false }, false, "a writable copy under the taken credential"],
  ["ransomware", { sharesWith: "account", immutable: true }, true, "an immutable copy under the taken credential"],
  ["ransomware", { sharesWith: "array", immutable: true }, true, "an immutable copy on the array"],
  ["ransomware", { sharesWith: "none", immutable: false }, true, "a copy the credential cannot reach"],
  ["accidental-delete", { medium: "snapshot", intervalHours: 0.02 }, false, "a continuous replica"],
  ["accidental-delete", { medium: "disk", intervalHours: 24 }, true, "a nightly backup"],
];
for (const [incident, over, shouldSurvive, label] of RULES) {
  const destroyed = reaches(incident, copy(over));
  if (shouldSurvive && destroyed) problems.push(`${incident}: ${label} should survive and the model says "${destroyed}"`);
  if (!shouldSurvive && !destroyed) problems.push(`${incident}: ${label} should not survive and the model says it does`);
}

/* --------------------------------------------------- every scenario */

const slugs = new Set<string>();
let nothingSurvives = 0;
let somethingSurvives = 0;
const incidents = new Set<Incident>();

for (const scenario of SCENARIOS) {
  if (slugs.has(scenario.slug)) problems.push(`${scenario.slug}: two scenarios share a slug`);
  slugs.add(scenario.slug);
  incidents.add(scenario.incident);

  if (scenario.copies.length < 2) problems.push(`${scenario.slug}: one copy is not a backup posture`);
  if (scenario.brief.length < 100) problems.push(`${scenario.slug}: the brief is too short to reason from`);
  if (scenario.trap.length < 150) problems.push(`${scenario.slug}: the trap does not explain itself`);
  if (scenario.gigabytes <= 0) problems.push(`${scenario.slug}: has nothing to restore`);

  for (const item of scenario.copies) {
    if (item.restoreMbps <= 0) problems.push(`${scenario.slug}: ${item.name} restores at ${item.restoreMbps} MB/s`);
    if (item.retrievalHours < 0) problems.push(`${scenario.slug}: ${item.name} has negative retrieval time`);
    if (item.retentionDays < 0) problems.push(`${scenario.slug}: ${item.name} has negative retention`);
    /*
      Cold and tape are cheap because they are slow to reach. A cold copy
      that is instantly available is not modeling anything real, and a
      reader would take the wrong lesson about the trade.
    */
    if ((item.medium === "cold" || item.medium === "tape") && item.retrievalHours < 1) {
      problems.push(`${scenario.slug}: ${item.name} is ${item.medium} and available in under an hour`);
    }
    if (item.medium === "snapshot" && item.sharesWith === "none" && item.intervalHours > 1) {
      problems.push(`${scenario.slug}: ${item.name} is called a snapshot and behaves like a backup`);
    }
    /* A verdict must be reachable for every copy, not throw or return nonsense. */
    const verdict = assess(scenario, item);
    if (verdict.usable && !Number.isFinite(verdict.hours)) {
      problems.push(`${scenario.slug}: ${item.name} is usable and takes forever`);
    }
    if (!verdict.usable && verdict.reason.length < 10) {
      problems.push(`${scenario.slug}: ${item.name} is unusable and does not say why`);
    }
  }

  /* The ordering has to put usable copies first and the quickest of those first. */
  const ordered = assessAll(scenario);
  let seenUnusable = false;
  for (const row of ordered) {
    if (!row.verdict.usable) seenUnusable = true;
    else if (seenUnusable) problems.push(`${scenario.slug}: a usable copy is ordered after an unusable one`);
  }
  const usable = ordered.filter((row) => row.verdict.usable);
  for (let i = 1; i < usable.length; i += 1) {
    if (usable[i].verdict.hours < usable[i - 1].verdict.hours) {
      problems.push(`${scenario.slug}: the usable copies are not ordered by recovery time`);
    }
  }

  const chosen = best(scenario);
  if (chosen === null) nothingSurvives += 1;
  else {
    somethingSurvives += 1;
    if (!chosen.verdict.usable) problems.push(`${scenario.slug}: the chosen copy is not usable`);
    if (chosen.verdict.hours !== usable[0].verdict.hours) {
      problems.push(`${scenario.slug}: the chosen copy is not the quickest usable one`);
    }
  }

  /*
    A scenario has to demonstrate something. Every copy surviving means the
    posture worked and the trap text is describing a problem that did not
    happen, which is the one failure that would read as fine.
  */
  if (ordered.every((row) => row.verdict.usable)) {
    problems.push(
      `${scenario.slug}: every copy survives its own incident, so it demonstrates nothing. ` +
        `The trap text describes a failure the model does not produce.`,
    );
  }

  if (domains(scenario.copies) < 1) problems.push(`${scenario.slug}: counts fewer than one failure domain`);
}

/* Both outcomes have to appear, or the surface argues one thing and never shows the other. */
if (nothingSurvives < 1) {
  problems.push("no scenario loses everything, and that is the outcome the whole surface is warning about");
}
if (somethingSurvives < 3) {
  problems.push(`only ${somethingSurvives} scenarios recover; a page where nothing ever works teaches despair rather than backups`);
}
if (incidents.size < 4) {
  problems.push(`only ${incidents.size} kinds of incident; the survival rules differ per incident and most go unexercised`);
}

/*
  The pair that makes the argument: two scenarios differing in one field,
  one losing everything and one recovering. Without it the immutability
  point is an assertion rather than a demonstration.
*/
const pair = SCENARIOS.filter((s) => s.incident === "ransomware");
if (pair.length < 2 || !pair.some((s) => best(s) === null) || !pair.some((s) => best(s) !== null)) {
  problems.push(
    "the ransomware scenarios do not contrast: one has to lose everything and one has to recover, " +
      "or the point about immutability is never actually shown",
  );
}

if (problems.length) {
  console.error(`\ncheck-restore: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${SCENARIOS.length} scenarios across ${incidents.size} kinds of incident, ${HAND.length} transfer times and ` +
    `${RULES.length} survival rules checked against arithmetic done by hand, ${nothingSurvives} losing everything ` +
    `and ${somethingSurvives} recovering, the quickest in ${duration(Math.min(...SCENARIOS.map((s) => best(s)?.verdict.hours ?? Infinity)))}.`,
);
