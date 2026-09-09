/**
 * Ten runs of one alerting rule, and where each one ends up.
 *
 * Every case is a rule that looks right on a graph and does something else in
 * the evaluation loop. Two of the ten never fire while the metric is over the
 * line most of the window, one fires three hundred seconds later than the for
 * clause says, and one keeps firing on data that stopped arriving.
 *
 * The samples are written as a function of time rather than as arrays,
 * because the shape is the point and a list of forty numbers hides it.
 */

import type { Case, Sample } from "../types";

/**
 * Samples at every scrape time, or nothing where the target did not answer.
 *
 * Returning undefined is a scrape that produced no sample for this series,
 * which is what marks it stale. That is a different thing from a sample of
 * zero and the two behave completely differently, so the shape of this
 * helper matters more than it looks.
 */
const scraped = (interval: number, window: number, value: (at: number) => number | undefined): Sample[] => {
  const out: Sample[] = [];
  for (let at = 0; at <= window; at += interval) {
    const got = value(at);
    if (got !== undefined) out.push({ at, value: got });
  }
  return out;
};

const LOOKBACK = 300;

export const CASES: Case[] = [
  {
    slug: "the-spike-between-evaluations",
    name: "The graph plainly crosses the line and nothing fired",
    brief:
      "Latency spikes to 900ms for half a minute. The dashboard shows it clearly, at fifteen second resolution, and the alert never fired. The rule is right and the threshold is right.",
    setup: {
      scrapeInterval: 15,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 600,
      series: {
        metric: "request_latency_seconds",
        samples: scraped(15, 600, (at) => (at >= 75 && at <= 90 ? 0.9 : 0.2)),
      },
      rule: { alert: "HighLatency", metric: "request_latency_seconds", test: { op: ">", threshold: 0.5 } },
    },
    question: "What does the alert do?",
    options: [
      { id: "at120", claim: "It fires at 120s, at the first evaluation after the spike", says: { about: "fires-at", at: 120 } },
      { id: "never", claim: "Nothing. No evaluation lands inside the spike, so as far as the rule is concerned it never happened", says: { about: "never-fires" } },
      { id: "pending", claim: "It goes pending at 120s and resolves without firing", says: { about: "state-at", at: 120, state: "pending" } },
      { id: "at60", claim: "It fires at 60s, because the samples are what the rule reads", says: { about: "fires-at", at: 60 } },
    ],
    why:
      "The rule is evaluated every sixty seconds and an instant query takes the newest sample at that instant. At 60s the newest sample is the one at 60s, which is 0.2. At 120s it is the one at 120s, also 0.2. The two samples at 900ms sit between evaluations and no query ever asks for a time where they are the newest. Scrape resolution decides what the graph can show; evaluation interval decides what the alert can see, and they are different numbers on most installations.",
    fix:
      "Alert on something that survives the gap. A recording rule with max_over_time on the scrape window, or a threshold on a rate rather than on an instantaneous value, both make a short spike visible at any evaluation after it. Lowering the evaluation interval to the scrape interval also works and costs you an evaluation of every rule four times as often.",
    breaks: "an alert sees what the graph shows",
  },
  {
    slug: "one-dip-resets-the-clock",
    name: "for: 5m, above the line for fourteen minutes, fired at ten",
    brief:
      "Queue depth goes over the threshold and stays there, apart from one evaluation four minutes in where it dips under. The rule says for: 5m and the alert fired at ten minutes.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 900,
      series: {
        metric: "queue_depth",
        samples: scraped(60, 900, (at) => (at === 240 ? 20 : 180)),
      },
      rule: { alert: "QueueBacklog", metric: "queue_depth", test: { op: ">", threshold: 100 }, holdFor: 300 },
    },
    question: "When does it fire?",
    options: [
      { id: "at300", claim: "At 300s, five minutes after it first went over", says: { about: "fires-at", at: 300 } },
      { id: "at540", claim: "At 540s, five minutes of being over in total", says: { about: "fires-at", at: 540 } },
      { id: "at600", claim: "At 600s. The dip cleared the clock, so the five minutes restarted from the evaluation after it", says: { about: "fires-at", at: 600 } },
      { id: "never", claim: "Never, because the run was interrupted", says: { about: "never-fires" } },
    ],
    why:
      "The for clause is not a timer that accumulates and it is not a timer that pauses. Prometheus checks the alert continues to be active during each evaluation, and an evaluation where it is not active clears the start time entirely. So the first four minutes counted for nothing, the clock restarted at 300s, and five minutes later, at 600s, it fired. Fourteen of the fifteen evaluations in that window were over the line.",
    fix:
      "Decide whether you meant five minutes of continuous breach or five minutes of mostly breach, because they are different alerts. Continuous is what for gives you. Mostly is a recording rule: avg_over_time or a count of breaching evaluations over the window, with the threshold on that, and then for can be short because the smoothing has already happened.",
    breaks: "for accumulates the time the condition was true",
  },
  {
    slug: "no-for-fires-at-once",
    name: "No for clause, and no grace at all",
    brief:
      "A rule with no for clause. Error rate goes over the threshold on one scrape, at the two minute mark, and stays there.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 480,
      series: {
        metric: "error_ratio",
        samples: scraped(60, 480, (at) => (at >= 120 ? 0.4 : 0.01)),
      },
      rule: { alert: "ErrorBudgetBurn", metric: "error_ratio", test: { op: ">", threshold: 0.1 } },
    },
    question: "When does it fire?",
    options: [
      { id: "at120", claim: "At 120s. Without a for clause the alert is firing on the first evaluation where the expression returns anything", says: { about: "fires-at", at: 120 } },
      { id: "at180", claim: "At 180s, once a second evaluation has confirmed it", says: { about: "fires-at", at: 180 } },
      { id: "pending", claim: "It sits pending at 120s and fires later", says: { about: "state-at", at: 120, state: "pending" } },
      { id: "never", claim: "Never. A rule with no for clause cannot fire", says: { about: "never-fires" } },
    ],
    why:
      "Alerting rules without the for clause become active on the first evaluation, and active with no hold to wait out is firing. There is no confirmation step and no second opinion. That is occasionally what you want, for a condition that cannot be transient, and it is why a rule with no for on a noisy metric pages somebody for a single bad scrape.",
    fix:
      "Leave for off only where a single evaluation is genuinely enough: a certificate that has expired, a filesystem that is full, a replica count of zero. Anything derived from a rate over a short window will produce single bad evaluations, and for is the cheapest way to require the condition to still be there a minute later.",
    breaks: "an alert always waits to confirm",
  },
  {
    slug: "for-shorter-than-the-interval",
    name: "for: 30s on a rule evaluated every minute",
    brief:
      "Somebody wants a fast alert and sets for: 30s. The rule group is evaluated every sixty seconds. The condition starts at the two minute mark and stays.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 480,
      series: {
        metric: "saturation_ratio",
        samples: scraped(60, 480, (at) => (at >= 120 ? 0.95 : 0.4)),
      },
      rule: { alert: "Saturated", metric: "saturation_ratio", test: { op: ">", threshold: 0.9 }, holdFor: 30 },
    },
    question: "When does it fire?",
    options: [
      { id: "at120", claim: "At 120s. A for shorter than the interval is satisfied immediately", says: { about: "fires-at", at: 120 } },
      { id: "at150", claim: "At 150s, thirty seconds after the condition started", says: { about: "fires-at", at: 150 } },
      { id: "never", claim: "Never. A for shorter than the evaluation interval can never be satisfied", says: { about: "never-fires" } },
      { id: "at180", claim: "At 180s, the next evaluation after thirty seconds have passed, so the for behaves as sixty", says: { about: "fires-at", at: 180 } },
    ],
    why:
      "The alert becomes active at 120s and pending, because no time has yet elapsed since it became active. The clause is checked at evaluations and the next one is at 180s, by which point sixty seconds have passed, so it fires there. Any for below the evaluation interval rounds up to it, and any for that is not a multiple of it rounds up to the next multiple. Writing 30s and 60s produces the same alert, and writing 90s produces the same alert as 120s.",
    fix:
      "Write for as a multiple of the group's evaluation interval, so that the number in the rule is the delay you get. If you want a genuinely faster alert, the interval is the thing to change, and it is a property of the rule group rather than of the rule.",
    breaks: "for is a delay in seconds",
  },
  {
    slug: "the-series-that-vanished",
    name: "The target died and the alert cleared",
    brief:
      "A disk usage alert has been firing for four minutes. Then the exporter stops answering entirely: no samples at all from the five minute mark. The disk did not get any emptier.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 600,
      series: {
        metric: "disk_used_ratio",
        samples: scraped(60, 600, (at) => (at >= 300 ? undefined : 0.97)),
      },
      rule: { alert: "DiskAlmostFull", metric: "disk_used_ratio", test: { op: ">", threshold: 0.9 }, holdFor: 120 },
    },
    question: "What is the alert doing at 300s, the first evaluation with no data?",
    options: [
      { id: "firing", claim: "Still firing. The last value was over the threshold and nothing has contradicted it", says: { about: "state-at", at: 300, state: "firing" } },
      { id: "inactive", claim: "Inactive. The series was marked stale, so the expression returns nothing, and an expression that returns nothing is not an alert", says: { about: "state-at", at: 300, state: "inactive" } },
      { id: "stale", claim: "Still firing until 540s, when the five minute lookback runs out", says: { about: "serves-stale-until", at: 540 } },
      { id: "never", claim: "It never fired in the first place", says: { about: "never-fires" } },
    ],
    why:
      "A target that stops returning a series it was previously returning gets a stale marker at that scrape, and a query evaluated after the marker returns nothing for that series. So the expression produces no elements, the alert has nothing to be active about, and it resolves. Your monitoring told you the disk was fine because it stopped being able to tell you anything at all, and the notification that arrives is a resolved one.",
    fix:
      "Alert on the target being down as well as on what it reports, which is up == 0 or absent() on a series you expect to exist, and route both to the same place. A resolved notification arriving without anybody fixing anything is the shape to look for in the history.",
    breaks: "an alert that resolves means the problem went away",
  },
  {
    slug: "absent-is-the-only-way",
    name: "The rule that notices nothing is there",
    brief:
      "The same dead exporter, with a second rule watching for the series to disappear.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 600,
      series: {
        metric: "disk_used_ratio",
        samples: scraped(60, 600, (at) => (at >= 300 ? undefined : 0.97)),
      },
      rule: { alert: "DiskMetricMissing", metric: "disk_used_ratio", test: { op: "absent" } },
    },
    question: "When does this one fire?",
    options: [
      { id: "at300", claim: "At 300s, the first evaluation where the series returns nothing", says: { about: "fires-at", at: 300 } },
      { id: "never", claim: "Never. absent() needs the series to have never existed", says: { about: "never-fires" } },
      { id: "at0", claim: "At 0s, because absent() is true until the first sample arrives", says: { about: "fires-at", at: 0 } },
      { id: "at540", claim: "At 540s, once the lookback has run out as well", says: { about: "fires-at", at: 540 } },
    ],
    why:
      "absent() returns an element when its argument returns none, which makes it the inverse of every other alert you write: it is the only expression that has something to say about a series that is not there. Here the stale marker at 300s makes the disk series return nothing, absent() produces an element, and with no for clause the alert is firing at that evaluation. It is the alert the previous case needed.",
    fix:
      "Pair a threshold alert with an absent() alert for anything whose disappearance matters, and give the absent() one a for clause long enough to survive a restart of the exporter. up == 0 does the same job for a whole target and absent() does it for one series, which matters when a target answers but has stopped exporting one metric.",
    breaks: "a threshold alert covers the case where the data stops",
  },
  {
    slug: "the-exporter-with-its-own-clock",
    name: "The alert kept firing on data from five minutes ago",
    brief:
      "The same disappearance, from an exporter that puts its own timestamps on the samples it returns. A federation endpoint, or a pushgateway, or anything scraping something else and passing the values through.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 900,
      series: {
        metric: "disk_used_ratio",
        ownTimestamps: true,
        samples: scraped(60, 900, (at) => (at >= 300 ? undefined : 0.97)),
      },
      rule: { alert: "DiskAlmostFull", metric: "disk_used_ratio", test: { op: ">", threshold: 0.9 }, holdFor: 120 },
    },
    question: "The last sample is at 240s. Until when does the query still return a value?",
    options: [
      { id: "at300", claim: "300s. The first scrape with nothing in it ends the series", says: { about: "serves-stale-until", at: 300 } },
      { id: "at480", claim: "480s. There is no stale marker here, so the last sample keeps being the newest one until the lookback runs out", says: { about: "serves-stale-until", at: 480 } },
      { id: "at900", claim: "900s. A sample never expires; it is just old", says: { about: "serves-stale-until", at: 900 } },
      { id: "inactive", claim: "The alert is inactive at 480s", says: { about: "state-at", at: 480, state: "inactive" } },
    ],
    why:
      "A series stops abruptly when its target stops exporting it, and fades out over the lookback period when the exporter set the timestamps itself, because in that case Prometheus never writes a stale marker. So the same failure produces a resolved alert on one kind of target and a firing alert on the other, for five more minutes, on a number nobody has measured since. Both are correct behavior and the difference is invisible in the rule.",
    fix:
      "Know which of your targets set their own timestamps, because it is a small list and it changes what every alert on them means. Where it matters, add a rule on the sample's age rather than on its value: time() minus the timestamp of the last sample, over the threshold you actually care about.",
    breaks: "a series that stops being exported disappears at the same moment whatever produced it",
  },
  {
    slug: "keep-firing-for-holds-it",
    name: "The metric dipped and the page did not resolve",
    brief:
      "A flapping condition and a rule with keep_firing_for. The metric goes under the threshold for exactly one evaluation, three minutes in.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 600,
      series: {
        metric: "replica_lag_seconds",
        samples: scraped(60, 600, (at) => (at === 180 ? 5 : 90)),
      },
      rule: {
        alert: "ReplicaLagging",
        metric: "replica_lag_seconds",
        test: { op: ">", threshold: 30 },
        keepFiringFor: 180,
      },
    },
    question: "What is the alert doing at 180s, during the dip?",
    options: [
      { id: "inactive", claim: "Inactive. The condition is not met, so there is nothing to be firing about", says: { about: "state-at", at: 180, state: "inactive" } },
      { id: "pending", claim: "Pending, while it waits to see whether the condition comes back", says: { about: "state-at", at: 180, state: "pending" } },
      { id: "firing", claim: "Still firing. keep_firing_for holds it up for three minutes after the condition was last met", says: { about: "state-at", at: 180, state: "firing" } },
      { id: "never", claim: "It never fired, because the condition was never continuous", says: { about: "never-fires" } },
    ],
    why:
      "keep_firing_for is the only thing in the state machine that survives an evaluation where the expression is not active. It exists for exactly this: a condition that is genuinely present and intermittently unmeasurable, where a resolve and a re-fire would produce two notifications and a false sense that something was done. Note that it protects a firing alert only. A pending one has no such grace and its clock is cleared by the same evaluation.",
    fix:
      "Reach for keep_firing_for when the resolves are noise and the condition is real, and keep it shorter than the time it would take somebody to act on the resolve. It is not a substitute for a for clause: for stops a spike from paging anybody, keep_firing_for stops a dip from telling them it is over.",
    breaks: "an alert resolves the moment its condition stops being true",
  },
  {
    slug: "the-scrape-is-slower-than-the-rule",
    name: "One new sample, and the for clause satisfied anyway",
    brief:
      "A target scraped every minute, in a rule group evaluated every fifteen seconds, with for: 30s. The value goes over the threshold on the sample at one minute.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 15,
      lookback: LOOKBACK,
      window: 300,
      series: {
        metric: "connection_pool_used",
        samples: scraped(60, 300, (at) => (at >= 60 ? 95 : 20)),
      },
      rule: { alert: "PoolExhausted", metric: "connection_pool_used", test: { op: ">", threshold: 90 }, holdFor: 30 },
    },
    question: "When does it fire?",
    options: [
      { id: "at90", claim: "At 90s. Three evaluations read the same sample, and the third is thirty seconds after the first", says: { about: "fires-at", at: 90 } },
      { id: "at120", claim: "At 120s, once a second scrape has confirmed the value", says: { about: "fires-at", at: 120 } },
      { id: "at60", claim: "At 60s, when the sample arrives", says: { about: "fires-at", at: 60 } },
      { id: "unstable", claim: "It flaps, because three of every four evaluations have no new data", says: { about: "nothing" } },
    ],
    why:
      "An instant query returns the newest sample within the lookback period, so between scrapes it keeps returning the same one. Three consecutive evaluations therefore see the same 95, all three are active, and thirty seconds of evaluations have elapsed, so it fires. The condition was confirmed by a single measurement read three times. Nothing here is wrong, and it is worth knowing that a for clause shorter than the scrape interval is confirming the clock rather than the metric.",
    fix:
      "Make for at least the scrape interval, and preferably a small multiple of it, so that firing means the condition survived a fresh measurement. On a sixty second scrape, for: 30s and for: 60s both mean one sample, and for: 3m means three.",
    breaks: "a for clause means the condition was measured again",
  },
  {
    slug: "the-flap-that-never-fires",
    name: "Over the line four minutes in every five, and silent all day",
    brief:
      "A rule with for: 5m on a metric that dips under the threshold for one evaluation out of every five. Twelve of the fifteen evaluations here are over the line.",
    setup: {
      scrapeInterval: 60,
      evaluationInterval: 60,
      lookback: LOOKBACK,
      window: 900,
      series: {
        metric: "job_runtime_seconds",
        samples: scraped(60, 900, (at) => (at % 300 === 240 ? 40 : 400)),
      },
      rule: { alert: "JobsSlow", metric: "job_runtime_seconds", test: { op: ">", threshold: 120 }, holdFor: 300 },
    },
    question: "What does the alert do across this window?",
    options: [
      { id: "at300", claim: "It fires at 300s, since the condition is met for five minutes in aggregate well before then", says: { about: "fires-at", at: 300 } },
      { id: "never", claim: "Nothing at all. The clock never survives five consecutive evaluations, so it is permanently pending and never firing", says: { about: "never-fires" } },
      { id: "at600", claim: "It fires at 600s, on the second run of four", says: { about: "fires-at", at: 600 } },
      { id: "resolved", claim: "It fires and resolves repeatedly, producing a notification each time", says: { about: "nothing" } },
    ],
    why:
      "Four consecutive active evaluations is four minutes, and the fifth resets the clock, so the alert reaches four minutes of pending over and over and never reaches five. The metric is over the threshold eighty percent of the time and the alert has never once fired. This is the failure mode of a for clause set just above the flap period, and the graph looks so obviously alarming that people assume the alerting is broken rather than the rule.",
    fix:
      "Match the rule to the shape of the data. If the dips are real and brief, smooth the input with avg_over_time or max_over_time so that a single evaluation is not the unit of truth. If the dips are measurement artefacts, keep_firing_for after a shorter for gets you a stable alert. Either way, a for clause longer than the flap period is the one option that produces silence.",
    breaks: "a for clause longer than the noise makes an alert more reliable",
  },
];
