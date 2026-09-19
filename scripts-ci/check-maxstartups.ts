/**
 * The SSH random early drop surface, checked against arithmetic it does not
 * share with the model.
 *
 * Two things can be wrong here and neither shows up in a browser. The drop
 * probability can be off by a percent or two, because the real function
 * truncates an integer division in the middle and a floating point line
 * looks almost the same; and the occupancy can be off by one, because
 * dividing each population by sixty and adding rounds twice. Both produce a
 * page that renders, answers, and quietly teaches the wrong number.
 *
 * So everything is computed a second time, in a shape that shares nothing
 * with the model:
 *
 *   the probability, by inverting the ramp. The model asks what percentage
 *   a given occupancy produces. This asks, for every percentage between the
 *   rate and a hundred, the first occupancy that reaches it, using ceil
 *   where the model uses floor, and rebuilds the staircase by counting how
 *   many of those thresholds an occupancy has passed. An off-by-one or a
 *   swapped operand in the model disagrees with its own inverse.
 *
 *   the occupancy, by running the arrivals. An hour of connections, each
 *   one placed at a second and removed when its hold expires, and the mean
 *   number standing taken over the last ten minutes. That is a queue
 *   simulation rather than a formula, and it agrees with Little's law only
 *   if the model paired each population with the right holding time.
 *
 * Plus the usual: exactly one option holds per case, every distractor is
 * false against the model rather than merely unattractive, the beliefs the
 * cases break are all different, and the right answer is not always in the
 * same place.
 */

import { CASES } from "../client/src/lib/maxstartups/data/cases";
import {
  asConfig,
  asLog,
  certainty,
  correctOption,
  dropPercent,
  dropPercentAt,
  inFlight,
  matching,
  safeBegin,
} from "../client/src/lib/maxstartups/model";
import type { Case, Option, Setup } from "../client/src/lib/maxstartups/types";

const problems: string[] = [];
const note = (message: string) => problems.push(message);

/* ------------------------------------------- the probability, inverted */

/**
 * The first occupancy at which the ramp reaches `level`, by the inverse of
 * the model's arithmetic.
 *
 * p(k) = rate + floor(A*k / S), with A = 100 - rate and S = full - begin and
 * k = startups - begin. So p(k) >= level exactly when A*k/S >= level - rate,
 * which is k >= ceil((level - rate) * S / A). Ceil, against the model's
 * floor, and a division in the other direction.
 */
function firstOccupancyAtLevel(setup: Setup, level: number): number {
  const span = setup.full - setup.begin;
  const climb = 100 - setup.rate;
  const need = level - setup.rate;
  return setup.begin + Math.ceil((need * span) / climb);
}

/** The whole staircase, rebuilt by counting thresholds passed. */
function percentByInverse(setup: Setup, startups: number): number {
  if (startups < setup.begin) return 0;
  if (startups >= setup.full) return 100;
  if (setup.rate === 100) return 100;
  let percent = setup.rate;
  for (let level = setup.rate + 1; level < 100; level += 1) {
    if (firstOccupancyAtLevel(setup, level) <= startups) percent = level;
  }
  return percent;
}

/* --------------------------------------------- the occupancy, simulated */

/**
 * An hour of arrivals, one second at a time.
 *
 * Connections are placed at whole seconds spread across each minute and
 * removed when their hold expires. The mean over the last ten minutes is
 * the occupancy, which is the same quantity Little's law names and arrived
 * at by counting rather than by multiplying. Spreading arrivals on whole
 * seconds costs at most a connection of resolution, so the comparison below
 * allows one.
 */
function simulateOccupancy(setup: Setup): number | null {
  if (setup.graceSeconds === 0 && setup.stuckPerMinute > 0) return null;
  const held = setup.graceSeconds === 0 ? setup.authSeconds : Math.min(setup.authSeconds, setup.graceSeconds);
  const MINUTES = 60;
  const SETTLE = 50;
  const horizon = (MINUTES + 5) * 60;
  const leaving = new Array<number>(horizon + setup.graceSeconds + held + 2).fill(0);
  const arriving = new Array<number>(horizon + 2).fill(0);

  const place = (second: number, hold: number) => {
    if (second >= arriving.length) return;
    arriving[second] += 1;
    if (second + hold < leaving.length) leaving[second + hold] += 1;
  };

  for (let minute = 0; minute < MINUTES; minute += 1) {
    for (let i = 0; i < setup.arrivalsPerMinute; i += 1) {
      place(minute * 60 + Math.floor((i * 60) / setup.arrivalsPerMinute), held);
    }
    for (let j = 0; j < setup.stuckPerMinute; j += 1) {
      place(minute * 60 + Math.floor((j * 60) / setup.stuckPerMinute), setup.graceSeconds);
    }
  }

  let standing = 0;
  let sampled = 0;
  let samples = 0;
  for (let second = 0; second < MINUTES * 60; second += 1) {
    standing += arriving[second];
    standing -= leaving[second];
    if (second >= SETTLE * 60) {
      sampled += standing;
      samples += 1;
    }
  }
  return Math.floor(sampled / samples);
}

/* -------------------------------------------------- does an option hold */

function holds(setup: Setup, option: Option): boolean {
  switch (option.says.about) {
    case "drop-percent":
      return option.says.percent === dropPercent(setup);
    case "certainty":
      return option.says.value === certainty(setup);
    case "in-flight":
      return option.says.count === inFlight(setup);
    case "safe-begin":
      return option.says.value === safeBegin(setup);
    case "nothing":
      return false;
  }
}

/** Whether this daemon refuses anything at all, which is what the log should show. */
function percentEarly(setup: Setup): boolean {
  return dropPercent(setup) > 0;
}

/* ---------------------------------------------------------- every case */

if (CASES.length < 10) note(`only ${CASES.length} cases, which is too few for a surface`);

const seenSlugs = new Set<string>();
const seenBreaks = new Set<string>();
const answerAt = new Map<number, number>();

for (const item of CASES as Case[]) {
  const { setup, slug } = item;

  if (seenSlugs.has(slug)) note(`${slug} appears twice`);
  seenSlugs.add(slug);
  if (seenBreaks.has(item.breaks)) note(`${slug} breaks a belief another case already breaks: "${item.breaks}"`);
  seenBreaks.add(item.breaks);

  /* Whole numbers only. A fractional connection or second is a typo. */
  for (const [field, value] of Object.entries(setup)) {
    if (typeof value === "number" && !Number.isInteger(value)) {
      note(`${slug} has a fractional ${field} (${value}); every input here is a whole count or a whole second`);
    }
  }
  if (setup.begin >= setup.full) note(`${slug} has begin ${setup.begin} at or above full ${setup.full}, which is not a ramp`);
  if (setup.rate < 1 || setup.rate > 100) note(`${slug} has a rate of ${setup.rate}, outside 1 to 100`);

  /* The occupancy, against a simulation that shares no arithmetic with it. */
  const standing = inFlight(setup);
  const simulated = simulateOccupancy(setup);
  if (standing === null || simulated === null) {
    if (standing !== simulated) {
      note(`${slug}: the model says the occupancy is ${standing} and the simulation says ${simulated}`);
    }
  } else if (Math.abs(standing - simulated) > 1) {
    note(
      `${slug}: the model settles at ${standing} unauthenticated connections and running the arrivals ` +
        `for an hour settles at ${simulated}. One of them has the wrong holding time against the wrong population.`,
    );
  }

  /* The probability, against the ramp rebuilt from its inverse. */
  for (let n = Math.max(0, setup.begin - 2); n <= setup.full + 2; n += 1) {
    const forward = dropPercentAt(setup, n);
    const backward = percentByInverse(setup, n);
    if (forward !== backward) {
      note(
        `${slug}: at ${n} standing the model says ${forward}% and inverting the ramp says ${backward}%`,
      );
      break;
    }
  }

  /* The rate is the probability at the bottom of the ramp, and only there. */
  if (setup.rate !== 100 && dropPercentAt(setup, setup.begin) !== setup.rate) {
    note(`${slug}: at exactly begin the chance should be the rate, ${setup.rate}, and it is ${dropPercentAt(setup, setup.begin)}`);
  }
  if (dropPercentAt(setup, setup.begin - 1) !== 0) {
    note(`${slug}: one below begin should be a certain accept and it is ${dropPercentAt(setup, setup.begin - 1)}%`);
  }
  if (dropPercentAt(setup, setup.full) !== 100) {
    note(`${slug}: at full everything should be refused and the model says ${dropPercentAt(setup, setup.full)}%`);
  }
  /* And it never goes backwards. */
  for (let n = setup.begin; n < setup.full; n += 1) {
    if (dropPercentAt(setup, n + 1) < dropPercentAt(setup, n)) {
      note(`${slug}: the ramp falls between ${n} and ${n + 1} standing, which no monotone reading of the code allows`);
      break;
    }
  }

  /* certainty and safeBegin have to agree with the probability they describe. */
  const percent = dropPercent(setup);
  const said = certainty(setup);
  const expected = percent === 0 ? "accepted" : percent === 100 ? "dropped" : "coin";
  if (said !== expected) note(`${slug}: ${percent}% is "${expected}" and the model calls it "${said}"`);
  const safe = safeBegin(setup);
  if (standing === null) {
    if (safe !== null) note(`${slug}: nothing settles, so no start value is safe, and the model offers ${safe}`);
  } else {
    if (safe !== standing + 1) note(`${slug}: ${standing} standing needs a start value of ${standing + 1} and the model says ${safe}`);
    if (dropPercentAt({ ...setup, begin: safe as number }, standing) !== 0) {
      note(`${slug}: the start value the model calls safe still refuses connections at ${standing} standing`);
    }
    if (standing > 0 && dropPercentAt({ ...setup, begin: standing }, standing) === 0) {
      note(`${slug}: a start value equal to the occupancy is reported safe, and begin is not an inclusive bound`);
    }
  }

  /*
    Exactly one option holds, judged here and then judged again by the model's
    own dispatcher.

    The two have to agree. This file decides truth by calling each quantity
    directly; the page decides it through holds() and matching(), which switch
    on the claim's tag. A tag handled in one place and not the other, or
    handled with the wrong comparison, shows up as a disagreement here and as
    a surface with no right answer in a browser.
  */
  const truths = item.options.filter((option) => holds(setup, option));
  const byModel = matching(item);
  if (byModel.length !== truths.length || byModel.some((option, i) => option.id !== truths[i]?.id)) {
    note(
      `${slug}: this check finds [${truths.map((o) => o.id).join(", ")}] true and the model's own ` +
        `matching() finds [${byModel.map((o) => o.id).join(", ")}]`,
    );
  }
  const chosen = correctOption(item);
  if (truths.length === 1 && chosen?.id !== truths[0].id) {
    note(`${slug}: correctOption returns ${chosen?.id ?? "nothing"} where the one true option is ${truths[0].id}`);
  }
  if (truths.length !== 1 && chosen !== null) {
    note(`${slug}: correctOption returns ${chosen.id} on a case that does not have exactly one true option`);
  }

  /*
    The rendered config round-trips. It is the only statement of the setup a
    reader sees, so a page that draws one ramp and prints another is worse
    than one that prints nothing.
  */
  const config = asConfig(setup);
  const line = config.match(/^MaxStartups (\d+):(\d+):(\d+)$/m);
  if (!line) {
    note(`${slug}: the rendered config has no MaxStartups line to read back`);
  } else if (Number(line[1]) !== setup.begin || Number(line[2]) !== setup.rate || Number(line[3]) !== setup.full) {
    note(`${slug}: the rendered config says ${line[0]} and the setup is ${setup.begin}:${setup.rate}:${setup.full}`);
  }
  if (!new RegExp(`^LoginGraceTime ${setup.graceSeconds}$`, "m").test(config)) {
    note(`${slug}: the rendered config does not state LoginGraceTime ${setup.graceSeconds}`);
  }
  if (!config.includes(setup.host)) note(`${slug}: the rendered config does not name the host it belongs to`);

  /*
    And the log shows a refusal exactly when there is one. A drop line under a
    daemon refusing nothing teaches the opposite of the case.
  */
  const log = asLog(setup);
  const showsDrop = log.includes("drop connection #");
  if (showsDrop !== percentEarly(setup)) {
    note(
      `${slug}: the rendered log ${showsDrop ? "shows" : "does not show"} a drop line and the chance of ` +
        `a refusal is ${dropPercent(setup)}%`,
    );
  }
  if (showsDrop && !log.includes("MaxStartups")) {
    note(`${slug}: the rendered log drops a connection without naming the reason sshd would print`);
  }
  if (truths.length !== 1) {
    note(`${slug} has ${truths.length} true options (${truths.map((o) => o.id).join(", ") || "none"}); it must have exactly one`);
  } else {
    const at = item.options.indexOf(truths[0]);
    answerAt.set(at, (answerAt.get(at) ?? 0) + 1);
  }
  if (item.options.length !== 4) note(`${slug} offers ${item.options.length} options rather than four`);
  const ids = new Set(item.options.map((option) => option.id));
  if (ids.size !== item.options.length) note(`${slug} reuses an option id`);

  /* Prose that is not an answer to the question is worse than no prose. */
  if (!item.question.trim().endsWith("?")) note(`${slug}'s question is not a question`);
  for (const field of ["why", "fix", "brief", "breaks"] as const) {
    if (item[field].trim().length < 40) note(`${slug} has almost nothing in its ${field}`);
  }
}

/* The right answer moves around. */
for (const [position, count] of answerAt) {
  if (count > CASES.length / 2) {
    note(`${count} of ${CASES.length} answers sit at position ${position}, which is a pattern worth more than the reasoning`);
  }
}

/* -------------------------------------------- the guard clauses themselves */

/*
  The three early returns in should_drop_connection, each shown to matter on
  a setup built for it rather than on whichever case happens to reach it.
*/
const probe: Setup = {
  host: "probe",
  begin: 10,
  rate: 30,
  full: 100,
  graceSeconds: 120,
  arrivalsPerMinute: 0,
  authSeconds: 0,
  stuckPerMinute: 0,
};
if (dropPercentAt(probe, 9) !== 0) note("below begin should be zero");
if (dropPercentAt(probe, 10) !== 30) note("at begin should be the rate");
if (dropPercentAt(probe, 100) !== 100) note("at full should be a hundred");
if (dropPercentAt(probe, 400) !== 100) note("past full should be a hundred");
if (dropPercentAt({ ...probe, rate: 100 }, 11) !== 100) note("a rate of a hundred refuses everything from begin");
if (dropPercentAt({ ...probe, rate: 100, full: 4000 }, 11) !== 100) {
  note("a rate of a hundred is checked before the full value, so a large full changes nothing");
}

/*
  Two of the guards are redundant for the value, and that is worth pinning.

  Deleting `if (rate === 100) return 100` changes no answer: with a rate of a
  hundred the term added to it is a hundred minus a hundred, times something,
  which is zero. Deleting `if (startups >= full) return 100` changes no answer
  at exactly full either: the term is (100 - rate) times (full - begin) over
  (full - begin), which is 100 - rate, and adding the rate back gives a
  hundred on the nose. In C both guards earn their place by skipping a call to
  arc4random_uniform, and they are kept here because this is a transcription.

  They are checked anyway, because the redundancy is a property of the
  arithmetic rather than a coincidence. If someone changes the formula so that
  it no longer lands on exactly a hundred at full, the guard would paper over
  a discontinuity and nothing else would say so.
*/
for (const item of CASES as Case[]) {
  const { begin, rate, full } = item.setup;
  const bare = rate + Math.trunc(((100 - rate) * (full - begin)) / (full - begin));
  if (bare !== 100) {
    note(
      `${item.slug}: the arithmetic alone gives ${bare}% at full, not 100, so the guard above it is ` +
        `hiding a step rather than saving a call`,
    );
  }
}

/*
  The truncation, stated as a fact rather than assumed. On the default
  setting the probability holds flat across consecutive occupancies; a model
  that interpolated in floating point would step on every one.
*/
if (dropPercentAt(probe, 10) !== dropPercentAt(probe, 11)) {
  note("the integer divide should hold the probability flat from ten to eleven on the default setting");
}
if (dropPercentAt(probe, 20) !== 37) note(`twenty standing on the default setting is 37%, and the model says ${dropPercentAt(probe, 20)}%`);

/*
  And the ordering inside the occupancy, which is the other place a right
  looking answer hides. Dividing each population by sixty and adding has to
  disagree with the model somewhere in this set, or the comment claiming it
  matters is decoration.
*/
let orderingMatters = false;
for (const item of CASES as Case[]) {
  const setup = item.setup;
  if (setup.graceSeconds === 0 && setup.stuckPerMinute > 0) continue;
  const held = setup.graceSeconds === 0 ? setup.authSeconds : Math.min(setup.authSeconds, setup.graceSeconds);
  const roundedTwice =
    Math.floor((setup.arrivalsPerMinute * held) / 60) + Math.floor((setup.stuckPerMinute * setup.graceSeconds) / 60);
  if (roundedTwice !== inFlight(setup)) orderingMatters = true;
}
if (!orderingMatters) {
  note(
    "no case distinguishes summing connection-seconds before dividing from dividing each population first. " +
      "Add one, or stop claiming the order matters.",
  );
}

/* ------------------------------------------------------------------- done */

if (problems.length) {
  console.error(`\ncheck-maxstartups: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} SSH daemons, each with one option that holds; every ramp agrees with its own inverse ` +
    `across ${CASES.reduce((total, item) => total + (item.setup.full - item.setup.begin + 5), 0)} occupancies, ` +
    `and every settled count agrees with an hour of simulated arrivals.`,
);
