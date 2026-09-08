/**
 * The alerting cases have to be the evaluation loop, and the prose has to
 * match the loop.
 *
 * The first half runs every case a second time with a differently shaped
 * implementation and requires exactly one option to hold.
 *
 * The second asserts the rules directly, because the corpus cannot reach
 * them. Every case has one answer by construction, so a model where the for
 * clause accumulated instead of resetting would still give ten cases one
 * answer each, and three of them would be wrong. The state machine is four
 * rules and each is checked on a fixture built for it.
 *
 * The third is the one that has earned its place twice on other surfaces:
 * every duration written in the prose has to be a quantity the case can
 * produce. A case explaining that it fires at ten minutes, next to a model
 * that fires at nine, is a page arguing with itself.
 */

import { CASES } from "../client/src/lib/alerts/data/cases";
import {
  STATE_LABEL,
  active,
  asYaml,
  clock,
  correctOption,
  evaluationTimes,
  firesAt,
  holds,
  matching,
  run,
  scrapeTimes,
  servesStaleUntil,
  staleFrom,
  stateAt,
  valueAt,
  type Claim,
  type Setup,
  type State,
} from "../client/src/lib/alerts/index";

const problems: string[] = [];

const SHAPES: Claim["about"][] = ["fires-at", "never-fires", "state-at", "serves-stale-until", "nothing"];

/**
 * Durations a case states that are not quantities of that case, with why.
 *
 * One entry, and it is a hypothetical rather than a figure: the rounding
 * paragraph illustrates the rule with a for clause nobody in the case wrote.
 * A page may say "writing 90s produces the same alert as 120s" without there
 * being a 90 anywhere in its own timeline.
 */
const ILLUSTRATIVE: Record<string, string[]> = {
  "for-shorter-than-the-interval": ["90s"],
};

/**
 * The state machine again, written as a fold over a boolean sequence.
 *
 * Deliberately a different shape: it takes the activity as a list of booleans
 * and never looks at samples or thresholds, so the two implementations share
 * nothing but the rules they are both meant to follow.
 */
function refold(setup: Setup, activity: boolean[]): State[] {
  const hold = setup.rule.holdFor ?? 0;
  const keep = setup.rule.keepFiringFor ?? 0;
  const step = setup.evaluationInterval;
  let run = 0;
  let sinceActive = Infinity;
  let firing = false;
  return activity.map((on) => {
    if (on) {
      run += 1;
      sinceActive = 0;
      /* Elapsed since the run began is one step less than its length. */
      if ((run - 1) * step >= hold) {
        firing = true;
        return "firing";
      }
      return "pending";
    }
    run = 0;
    sinceActive += step;
    if (firing && sinceActive < keep) return "firing";
    firing = false;
    return "inactive";
  });
}

/** Every duration a case can honestly state, in seconds. */
function derivable(setup: Setup): number[] {
  const out = new Set<number>([
    setup.scrapeInterval,
    setup.evaluationInterval,
    setup.lookback,
    setup.window,
    setup.rule.holdFor ?? 0,
    setup.rule.keepFiringFor ?? 0,
  ]);
  const fires = firesAt(setup);
  if (fires !== null) out.add(fires);
  const stale = staleFrom(setup);
  if (stale !== null) out.add(stale);
  const serves = servesStaleUntil(setup);
  if (serves !== null) out.add(serves);
  for (const sample of setup.series.samples) out.add(sample.at);
  /* And the runs of consecutive active evaluations, which is what for measures. */
  let length = 0;
  for (const entry of run(setup)) {
    if (entry.active) {
      length += 1;
      out.add(length * setup.evaluationInterval);
      out.add((length - 1) * setup.evaluationInterval);
    } else {
      length = 0;
    }
  }
  out.delete(0);
  return [...out];
}

const slugs = new Set<string>();
const breaks = new Set<string>();
const shapesUsed = new Set<string>();
const statesReached = new Set<State>();
const positions: number[] = [];

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: duplicate slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) problems.push(`${item.slug}: two cases break the same belief`);
  breaks.add(item.breaks);

  const setup = item.setup;
  const evaluations = run(setup);
  for (const entry of evaluations) statesReached.add(entry.state);

  /* The state machine, recomputed from the activity alone. */
  const again = refold(setup, evaluations.map((entry) => entry.active));
  for (let at = 0; at < evaluations.length; at += 1) {
    if (evaluations[at].state !== again[at]) {
      problems.push(
        `${item.slug}: at ${clock(evaluations[at].at)} the model says ${evaluations[at].state}` +
          ` and the fold says ${again[at]}`,
      );
    }
  }

  /* Sanity on the setup itself. */
  if (setup.window % setup.evaluationInterval !== 0) {
    problems.push(`${item.slug}: the window is not a whole number of evaluations`);
  }
  if (setup.series.samples.some((sample) => sample.at % setup.scrapeInterval !== 0)) {
    problems.push(`${item.slug}: a sample lands between scrapes`);
  }
  if (setup.series.samples.length === 0) problems.push(`${item.slug}: no samples at all`);
  if (setup.lookback !== 300) {
    problems.push(`${item.slug}: uses a lookback of ${setup.lookback}, and every case should use the default`);
  }

  /* Exactly one option holds. */
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} of ${item.options.length} options hold. Exactly one has to.` +
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

  /*
    The right option has to name a time the rule is actually evaluated at. The
    wrong ones do not, and several of them deliberately name the time a reader
    expects instead, which is the whole of two cases.
  */
  const answer = correctOption(item);
  const when =
    answer && (answer.says.about === "fires-at" || answer.says.about === "state-at" || answer.says.about === "serves-stale-until")
      ? answer.says.at
      : null;
  if (when !== null && !evaluationTimes(setup).includes(when)) {
    problems.push(`${item.slug}: the answer names ${clock(when)}, which is not a time the rule is evaluated at`);
  }

  /*
    Every duration in the prose has to be one the case produces.

    Distractor claims are excluded, for the same reason: a wrong option that
    says "at 150s, thirty seconds after the condition started" is wrong on
    purpose and naming a second that does not exist is how it is wrong. The
    right option's claim is checked, along with everything the case asserts in
    its own voice.
  */
  const sizes = derivable(setup);
  const prose = `${item.brief} ${item.why} ${item.fix} ${item.name} ${item.question} ${answer?.claim ?? ""}`;
  const excused = new Set(ILLUSTRATIVE[item.slug] ?? []);
  for (const found of prose.matchAll(/\b(\d+)\s?(s|ms|m|seconds|second|minutes|minute)\b/g)) {
    const value = Number(found[1]);
    const unit = found[2];
    if (unit === "ms") continue;
    if (excused.has(found[0])) continue;
    const seconds = unit.startsWith("m") && unit !== "ms" ? value * 60 : value;
    if (!sizes.includes(seconds)) {
      problems.push(
        `${item.slug}: the prose says "${found[0]}" and no interval, hold, fire time or run length in` +
          ` this case is ${seconds} seconds.`,
      );
    }
  }

  /* And the rendered rule has to say what the rule is. */
  const yaml = asYaml(setup.rule);
  if (!yaml.includes(setup.rule.alert)) problems.push(`${item.slug}: the rendered rule omits its own name`);
  /* Anchored, because keep_firing_for: contains the substring for: too. */
  const hasFor = /^ {2}for:/m.test(yaml);
  if (setup.rule.holdFor && !hasFor) problems.push(`${item.slug}: the rule has a hold and renders no for:`);
  if (!setup.rule.holdFor && hasFor) problems.push(`${item.slug}: the rule renders a for: it does not have`);
  if (setup.rule.test.op === "absent" && !yaml.includes("absent(")) {
    problems.push(`${item.slug}: an absent() rule does not render as absent()`);
  }
}

/* A hypothetical listed for a case that no longer says it is stale. */
for (const [slug, figures] of Object.entries(ILLUSTRATIVE)) {
  const item = CASES.find((entry) => entry.slug === slug);
  if (!item) {
    problems.push(`ILLUSTRATIVE names ${slug}, which is not a case`);
    continue;
  }
  const said = `${item.brief} ${item.why} ${item.fix} ${item.name} ${item.question}`;
  for (const figure of figures) {
    if (!said.includes(figure)) problems.push(`ILLUSTRATIVE lists "${figure}" for ${slug}, which no longer says it`);
  }
}

for (const shape of SHAPES) {
  if (!shapesUsed.has(shape)) problems.push(`no option uses the claim shape "${shape}"`);
}
for (const shape of shapesUsed) {
  if (!SHAPES.includes(shape as Claim["about"])) problems.push(`an option uses the unknown claim shape "${shape}"`);
}
for (const state of Object.keys(STATE_LABEL) as State[]) {
  if (!statesReached.has(state)) problems.push(`no case ever reaches the ${state} state`);
}
if (CASES.filter((item) => firesAt(item.setup) === null).length === 0) {
  problems.push("every case fires, so the surface never shows the failure it is about");
}
if (CASES.filter((item) => firesAt(item.setup) !== null).length === 0) {
  problems.push("no case fires at all");
}

const counts = new Map<number, number>();
for (const spot of positions) counts.set(spot, (counts.get(spot) ?? 0) + 1);
if (counts.size < 4) problems.push(`the answer only ever sits in ${counts.size} of the four option positions`);
for (const [spot, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(`${count} of ${CASES.length} answers are option ${spot + 1}; a reader who always picks it passes`);
  }
}

/*
  The four rules of the state machine, each on a fixture built for it.

  A boolean pattern and an expectation, so that a model getting one rule wrong
  fails on that rule rather than on whichever case happens to notice.
*/
const fixture = (activity: boolean[], rule: Partial<Setup["rule"]>): Setup => ({
  scrapeInterval: 60,
  evaluationInterval: 60,
  lookback: 300,
  window: (activity.length - 1) * 60,
  series: {
    metric: "m",
    samples: activity.map((on, at) => ({ at: at * 60, value: on ? 10 : 0 })),
  },
  rule: { alert: "A", metric: "m", test: { op: ">", threshold: 5 }, ...rule },
});

const states = (activity: boolean[], rule: Partial<Setup["rule"]>): string =>
  run(fixture(activity, rule))
    .map((entry) => entry.state[0])
    .join("");

/* No for clause: active is firing, at once. */
if (states([false, true, true], {}) !== "iff") {
  problems.push(`a rule with no for gave "${states([false, true, true], {})}", not "iff"`);
}
/* A for clause rounds up to the evaluation interval. */
if (states([true, true, true], { holdFor: 30 }) !== "pff") {
  problems.push(`for: 30s on a 60s interval gave "${states([true, true, true], { holdFor: 30 })}", not "pff"`);
}
if (states([true, true, true], { holdFor: 60 }) !== "pff") {
  problems.push("for: 60s and for: 30s on a 60s interval are not the same alert, and they should be");
}
if (states([true, true, true, true], { holdFor: 120 }) !== "ppff") {
  problems.push("for: 120s did not take two intervals to satisfy");
}
/* One inactive evaluation clears the clock rather than pausing it. */
if (states([true, true, false, true, true], { holdFor: 120 }) !== "ppipp") {
  problems.push(
    `an inactive evaluation did not clear the for clock: got "${states([true, true, false, true, true], { holdFor: 120 })}",` +
      ' expected "ppipp"',
  );
}
/* keep_firing_for holds a firing alert and does nothing for a pending one. */
if (states([true, true, false, false], { keepFiringFor: 120 }) !== "ffff") {
  problems.push(`keep_firing_for did not hold a firing alert: "${states([true, true, false, false], { keepFiringFor: 120 })}"`);
}
if (states([true, true, false, false, false], { keepFiringFor: 120 }) !== "ffffi") {
  problems.push("keep_firing_for did not expire on time");
}
if (states([true, false, true], { holdFor: 300, keepFiringFor: 300 }) !== "pip") {
  problems.push("keep_firing_for rescued a pending alert, and it only applies to a firing one");
}

/*
  Staleness against lookback, which is the difference between two failures
  that look identical in the rule and five minutes apart in the timeline.
*/
const vanishing = (own: boolean): Setup => ({
  scrapeInterval: 60,
  evaluationInterval: 60,
  lookback: 300,
  window: 900,
  series: {
    metric: "m",
    ownTimestamps: own || undefined,
    samples: [0, 60, 120].map((at) => ({ at, value: 10 })),
  },
  rule: { alert: "A", metric: "m", test: { op: ">", threshold: 5 } },
});
if (staleFrom(vanishing(false)) !== 180) {
  problems.push(`a target that stopped answering was marked stale at ${staleFrom(vanishing(false))}, not 180`);
}
if (staleFrom(vanishing(true)) !== null) {
  problems.push("an exporter setting its own timestamps got a stale marker, and it should not");
}
if (valueAt(vanishing(false), 180) !== null) problems.push("a stale series still returned a value");
if (valueAt(vanishing(true), 180) !== 10) problems.push("a series with no stale marker stopped returning its last value");
/* The lookback boundary is exclusive: exactly one lookback later is nothing. */
if (valueAt(vanishing(true), 120 + 299) !== 10) problems.push("the lookback ended a second early");
if (valueAt(vanishing(true), 120 + 300) !== null) problems.push("the lookback did not end at exactly 300 seconds");
if (servesStaleUntil(vanishing(true)) !== 360) {
  problems.push(`the last evaluation with a value was ${servesStaleUntil(vanishing(true))}, not 360`);
}
if (servesStaleUntil(vanishing(false)) !== null) {
  problems.push("a stale series was reported as serving values after it went stale");
}

/* absent() is the inverse of everything else. */
const missing: Setup = { ...vanishing(false), rule: { alert: "A", metric: "m", test: { op: "absent" } } };
if (active(missing, 60)) problems.push("absent() was active while the series had a value");
if (!active(missing, 180)) problems.push("absent() was not active once the series went stale");
if (firesAt(missing) !== 180) problems.push(`absent() fired at ${firesAt(missing)}, not at the first evaluation with nothing`);

/* And the scaffolding: scrapes, evaluations, and the state lookup. */
const grid = fixture([true, true, true], {});
if (scrapeTimes(grid).length !== 3) problems.push("scrapeTimes does not cover the window");
if (evaluationTimes(grid).length !== 3) problems.push("evaluationTimes does not cover the window");
if (stateAt(grid, 61) !== "inactive") problems.push("stateAt returned a state for a time that is not an evaluation");
if (holds({ about: "nothing" }, grid)) problems.push("the nothing claim holds of something");
if (clock(90) !== "1m30s" || clock(300) !== "5m" || clock(45) !== "45s") {
  problems.push(`clock() renders badly: ${clock(90)}, ${clock(300)}, ${clock(45)}`);
}

if (problems.length) {
  console.error(`check-alerts: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const silent = CASES.filter((item) => firesAt(item.setup) === null).length;
console.log(
  `OK  ${CASES.length} alerting runs, each with exactly one option that holds, ${silent} of them never firing,` +
    ` all ${statesReached.size} states reached, the state machine agreeing with a second implementation,` +
    ` and every duration in the prose one the case produces.`,
);
