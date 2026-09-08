/**
 * The evaluation loop, at the cadence Prometheus actually uses.
 *
 * Three steps, and every case turns on one of them.
 *
 *   scrapes    what the target returned, and when it returned nothing
 *   valueAt    what an instant query finds at an arbitrary time, which is
 *                not the same question, because of staleness and lookback
 *   run        the state machine over the evaluations, where `for` counts
 *                consecutive active evaluations rather than elapsed time
 *
 * Times are seconds from the start of the window. Nothing here models label
 * sets, because one alert on one series is where all of these go wrong and a
 * second series would be scenery.
 */

import type { Case, Claim, Evaluation, Sample, Series, Setup, State } from "./types";

/** The times the target is scraped, whether or not it answered. */
export const scrapeTimes = (setup: Setup): number[] => {
  const out: number[] = [];
  for (let at = 0; at <= setup.window; at += setup.scrapeInterval) out.push(at);
  return out;
};

/** The times the rule is evaluated. */
export const evaluationTimes = (setup: Setup): number[] => {
  const out: number[] = [];
  for (let at = 0; at <= setup.window; at += setup.evaluationInterval) out.push(at);
  return out;
};

const sampleAt = (series: Series, at: number): Sample | undefined =>
  series.samples.find((sample) => sample.at === at);

/**
 * When the series was marked stale, or null if it never was.
 *
 * An ordinary target that stops returning a series gets a stale marker at the
 * scrape where it stopped, and queries after that point return nothing at
 * all. An exporter that sets its own timestamps does not get one, which is
 * why the two behave completely differently when the data stops.
 */
export function staleFrom(setup: Setup): number | null {
  if (setup.series.ownTimestamps) return null;
  let seen = false;
  for (const at of scrapeTimes(setup)) {
    const sample = sampleAt(setup.series, at);
    if (sample) {
      seen = true;
      continue;
    }
    if (seen) return at;
  }
  return null;
}

/**
 * What an instant query returns at a given time.
 *
 * The newest sample less than the lookback period ago, and nothing at all
 * once the series has been marked stale. Those are two different reasons to
 * get nothing back and they happen at very different times.
 */
export function valueAt(setup: Setup, at: number): number | null {
  const stale = staleFrom(setup);
  if (stale !== null && at >= stale) return null;
  let best: Sample | undefined;
  for (const sample of setup.series.samples) {
    if (sample.at > at) continue;
    if (at - sample.at >= setup.lookback) continue;
    if (!best || sample.at > best.at) best = sample;
  }
  return best ? best.value : null;
}

/** Does the expression produce an element at this instant? */
export function active(setup: Setup, at: number): boolean {
  const value = valueAt(setup, at);
  if (setup.rule.test.op === "absent") return value === null;
  if (value === null) return false;
  return setup.rule.test.op === ">" ? value > setup.rule.test.threshold : value < setup.rule.test.threshold;
}

/**
 * The whole run, evaluation by evaluation.
 *
 * The `for` clause is the part worth being exact about. Prometheus checks the
 * alert continues to be active during each evaluation, so an evaluation where
 * it is not active does not pause the clock, it clears it: the next active
 * evaluation starts a new one from zero. A rule with for: 5m and a metric
 * that dips below the line once every four minutes never fires at all.
 */
export function run(setup: Setup): Evaluation[] {
  const hold = setup.rule.holdFor ?? 0;
  const keep = setup.rule.keepFiringFor ?? 0;
  const out: Evaluation[] = [];
  let activeSince: number | null = null;
  /*
    When the alert stopped matching, which is what keep_firing_for counts
    from. Not the last evaluation where it was active: rules/alerting.go sets
    KeepFiringSince at the first evaluation with no result and compares
    ts.Sub(a.KeepFiringSince) against the duration, so the grace begins one
    interval later than "after the condition was last met" reads. I had it the
    other way round from the sentence in the documentation, which is a
    reasonable reading of the sentence and not what the code does.
  */
  let keepFiringSince: number | null = null;
  let firing = false;

  for (const at of evaluationTimes(setup)) {
    const value = valueAt(setup, at);
    const on = active(setup, at);
    let state: State = "inactive";

    if (on) {
      if (activeSince === null) activeSince = at;
      keepFiringSince = null;
      if (at - activeSince >= hold) {
        firing = true;
        state = "firing";
      } else {
        state = "pending";
      }
    } else {
      activeSince = null;
      /*
        keep_firing_for holds a firing alert up, and it is the only thing here
        that survives an inactive evaluation. A pending alert has no such
        grace: the same evaluation clears its clock.
      */
      if (firing && keep > 0) {
        if (keepFiringSince === null) keepFiringSince = at;
        if (at - keepFiringSince < keep) {
          state = "firing";
        } else {
          firing = false;
          keepFiringSince = null;
          state = "inactive";
        }
      } else {
        firing = false;
        keepFiringSince = null;
        state = "inactive";
      }
    }
    out.push({ at, value, active: on, state });
  }
  return out;
}

/** The first second at which the alert is firing, or null. */
export function firesAt(setup: Setup): number | null {
  const first = run(setup).find((entry) => entry.state === "firing");
  return first ? first.at : null;
}

/** The state at a given evaluation time, or inactive if it is not one. */
export function stateAt(setup: Setup, at: number): State {
  const entry = run(setup).find((evaluation) => evaluation.at === at);
  return entry ? entry.state : "inactive";
}

/**
 * The last second at which a query still returns a value, after the samples
 * have stopped.
 *
 * Null when the samples never stop, because then the question is not being
 * asked. This is the difference between a stale marker and a lookback, and
 * it is five minutes wide.
 */
export function servesStaleUntil(setup: Setup): number | null {
  const last = [...setup.series.samples].sort((a, b) => b.at - a.at)[0];
  if (!last) return null;
  const scrapes = scrapeTimes(setup);
  if (!scrapes.some((at) => at > last.at)) return null;
  let latest: number | null = null;
  for (const at of evaluationTimes(setup)) {
    if (at > last.at && valueAt(setup, at) !== null) latest = at;
  }
  return latest;
}

/** Does a claim hold of a run? */
export function holds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "fires-at":
      return firesAt(setup) === claim.at;
    case "never-fires":
      return firesAt(setup) === null;
    case "state-at":
      return stateAt(setup, claim.at) === claim.state;
    case "serves-stale-until":
      return servesStaleUntil(setup) === claim.at;
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case) => item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries samples, a rule and two intervals. The model runs the
 * loop. CI requires exactly one option to hold, so an option set that has
 * drifted from its own samples fails the build.
 */
export const correctOption = (item: Case) => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Seconds as a person would say them. */
export function clock(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`;
}

/** The rule as it would be written in a rules file. */
export function asYaml(rule: Setup["rule"]): string {
  const expr =
    rule.test.op === "absent" ? `absent(${rule.metric})` : `${rule.metric} ${rule.test.op} ${rule.test.threshold}`;
  const lines = [`- alert: ${rule.alert}`, `  expr: ${expr}`];
  if (rule.holdFor) lines.push(`  for: ${clock(rule.holdFor)}`);
  if (rule.keepFiringFor) lines.push(`  keep_firing_for: ${clock(rule.keepFiringFor)}`);
  return lines.join("\n");
}

export const STATE_LABEL: Record<State, string> = {
  inactive: "inactive",
  pending: "pending",
  firing: "firing",
};
