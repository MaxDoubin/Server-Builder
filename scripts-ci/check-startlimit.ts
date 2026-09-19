/**
 * The systemd start rate limit, against src/basic/ratelimit.c.
 *
 * Three things this gate exists to hold in place.
 *
 * The window is fixed, not sliding. That single fact decides every case in
 * the set: a unit whose restart cycle walks past the end of the interval
 * resets the counter and can crash forever, while a faster one fills the
 * window and is stopped for good. A sliding-window implementation would give
 * the same answer on the fast cases and the opposite answer on the slow ones,
 * so the gate recomputes each case with a closed form derived from the fixed
 * window, and separately proves the two windows disagree on this set.
 *
 * The comparison is strictly greater than. Two cases land a start at exactly
 * the interval boundary and are refused by it. If that comparison were ever
 * relaxed to greater-or-equal they would both flip, so both are pinned
 * directly, and so is the pair of cases that differ only by a tenth of a
 * second of crash time.
 *
 * And the defaults are the documented ones. Five starts, ten seconds, a
 * hundred milliseconds, all from systemd.unit(5) and systemd.service(5).
 *
 *     npx tsx scripts-ci/check-startlimit.ts
 */

import {
  CASES,
  DEFAULT_BURST,
  DEFAULT_INTERVAL_MS,
  DEFAULT_RESTART_SEC_MS,
  WALK_LIMIT,
  asJournal,
  asStatus,
  asUnit,
  attempts,
  correctOption,
  cycleMs,
  ending,
  givesUpAtMs,
  holds,
  human,
  limitEnabled,
  matching,
  rateLimited,
  restarts,
  safeRestartSecMs,
  startsBeforeFailing,
  stillRestarting,
} from "../client/src/lib/startlimit/index";
import type { Setup } from "../client/src/lib/startlimit/types";

const problems: string[] = [];
const whole = (n: number) => Number.isInteger(n) && n >= 0;

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
  for (const option of item.options) {
    if (holds(option.says, item.setup) !== hits.includes(option)) {
      problems.push(`${item.slug}: holds() and matching() disagree about ${option.id}`);
    }
    if (option.says.about === "nothing" && holds(option.says, item.setup)) problems.push(`${item.slug}: a claim about nothing holds`);
  }
}

/* ── 2. the documented defaults, and inputs a unit file could hold ──────── */

if (DEFAULT_BURST !== 5) problems.push(`DEFAULT_BURST is ${DEFAULT_BURST}; systemd.unit(5) says DefaultStartLimitBurst is 5`);
if (DEFAULT_INTERVAL_MS !== 10_000) problems.push(`DEFAULT_INTERVAL_MS is ${DEFAULT_INTERVAL_MS}; DefaultStartLimitIntervalSec is 10s`);
if (DEFAULT_RESTART_SEC_MS !== 100) problems.push(`DEFAULT_RESTART_SEC_MS is ${DEFAULT_RESTART_SEC_MS}; systemd.service(5) says RestartSec defaults to 100ms`);

for (const item of CASES) {
  const s = item.setup;
  if (!s.unit.endsWith(".service")) problems.push(`${item.slug}: unit "${s.unit}" is not a service unit`);
  if (s.crashAfterMs !== null && !whole(s.crashAfterMs)) problems.push(`${item.slug}: crashAfterMs ${s.crashAfterMs} is not a whole number of milliseconds`);
  for (const field of ["restartSecMs", "burst", "intervalMs"] as const) {
    if (!whole(s[field])) problems.push(`${item.slug}: ${field} is ${s[field]}, not a whole number`);
  }
  if (!whole(s.exitCode) || s.exitCode > 255) problems.push(`${item.slug}: exit code ${s.exitCode} is not a status a process can exit with`);
  if (s.restart === "no" && s.crashAfterMs === null) problems.push(`${item.slug}: nothing happens in this case at all`);
  if (s.exitCode === 0 && s.restart === "on-failure" && s.crashAfterMs === null) problems.push(`${item.slug}: nothing happens in this case at all`);
}

/* ── 3. the walk, recomputed in closed form ─────────────────────────────── */

/*
  attempts() transcribes ratelimit_below() and steps through the unit's life.
  This derives the same answer arithmetically from the fixed window: with a
  constant cycle, the start that would be refused is the one at burst x cycle
  after the window opened, and the window has not elapsed at that moment
  exactly when burst x cycle <= interval. Two routes to one number, and a
  sliding window would give a different one.
*/
function byArithmetic(s: Setup): { limited: boolean; atMs: number | null; starts: number } {
  if (s.crashAfterMs === null || s.restart === "no" || (s.restart === "on-failure" && s.exitCode === 0)) {
    return { limited: false, atMs: null, starts: 1 };
  }
  if (s.burst === 0 || s.intervalMs === 0) return { limited: false, atMs: null, starts: WALK_LIMIT };
  const cycle = s.crashAfterMs + s.restartSecMs;
  const refusedAt = s.burst * cycle;
  if (refusedAt <= s.intervalMs) return { limited: true, atMs: refusedAt, starts: s.burst };
  return { limited: false, atMs: null, starts: WALK_LIMIT };
}

for (const item of CASES) {
  const s = item.setup;
  const other = byArithmetic(s);
  if (rateLimited(s) !== other.limited) {
    problems.push(`${item.slug}: the walk says ${rateLimited(s) ? "refused" : "never refused"} and the arithmetic says the opposite`);
  }
  if (givesUpAtMs(s) !== other.atMs) {
    problems.push(`${item.slug}: the walk gives up at ${givesUpAtMs(s)} and the arithmetic says ${other.atMs}`);
  }
  if (startsBeforeFailing(s) !== other.starts) {
    problems.push(`${item.slug}: the walk counts ${startsBeforeFailing(s)} starts and the arithmetic says ${other.starts}`);
  }
}

/*
  And the point of the whole surface: a sliding window would answer
  differently. If it would not, the set is not exercising the thing it is
  about.
*/
function slidingWindowWouldLimit(s: Setup): boolean {
  if (s.crashAfterMs === null || s.burst === 0 || s.intervalMs === 0) return false;
  if (s.restart === "no" || (s.restart === "on-failure" && s.exitCode === 0)) return false;
  const cycle = s.crashAfterMs + s.restartSecMs;
  /* Under a sliding window, any burst starts within one interval trips it, wherever they fall. */
  return (s.burst - 1) * cycle <= s.intervalMs;
}
const disagree = CASES.filter((item) => slidingWindowWouldLimit(item.setup) !== rateLimited(item.setup));
if (disagree.length === 0) {
  problems.push(
    "every case answers the same under a sliding window as under systemd's fixed one, so the set " +
      "does not exercise the distinction it exists to teach",
  );
}

/* ── 4. the boundary, which is one comparison ───────────────────────────── */

const atBoundary = CASES.filter((item) => givesUpAtMs(item.setup) === item.setup.intervalMs);
if (atBoundary.length < 2) {
  problems.push(`${atBoundary.length} case(s) land a refused start exactly on the interval; the strictly-greater-than comparison needs at least two`);
}
for (const item of atBoundary) {
  const s = item.setup;
  /* One millisecond later and the window has elapsed, so the same unit survives. */
  const slower: Setup = { ...s, restartSecMs: s.restartSecMs + 1 };
  if (rateLimited(slower)) {
    problems.push(`${item.slug}: one more millisecond of RestartSec still trips the limit, so this is not the boundary it is presented as`);
  }
}

/* ── 5. internal consistency ────────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const walk = attempts(s);
  if (walk.length === 0) problems.push(`${item.slug}: no start was attempted at all`);
  if (walk[0].atMs !== 0) problems.push(`${item.slug}: the first start is not at zero`);
  if (walk.some((a, i) => i > 0 && a.atMs <= walk[i - 1].atMs)) problems.push(`${item.slug}: starts are not in increasing order of time`);
  if (walk.filter((a) => !a.allowed).length > 1) problems.push(`${item.slug}: the walk continued past a refused start`);
  if (rateLimited(s) && walk[walk.length - 1].allowed) problems.push(`${item.slug}: refused, yet the last attempt was allowed`);
  if (startsBeforeFailing(s) !== walk.filter((a) => a.allowed).length) problems.push(`${item.slug}: the start count is not the allowed attempts`);
  if (limitEnabled(s) !== (s.burst > 0 && s.intervalMs > 0)) problems.push(`${item.slug}: limitEnabled disagrees with the two settings`);
  if (!limitEnabled(s) && rateLimited(s)) problems.push(`${item.slug}: the limit is off and a start was refused`);
  if (rateLimited(s) && startsBeforeFailing(s) !== s.burst) problems.push(`${item.slug}: refused after ${startsBeforeFailing(s)} starts with a burst of ${s.burst}`);
  if (stillRestarting(s) !== (!rateLimited(s) && restarts(s))) problems.push(`${item.slug}: stillRestarting disagrees with its own definition`);
  if (ending(s) === "running" && s.crashAfterMs !== null) problems.push(`${item.slug}: ends running and yet it crashes`);
  if (ending(s) === "rate-limited" && !rateLimited(s)) problems.push(`${item.slug}: ends rate-limited without being refused`);
  if ((cycleMs(s) === null) !== (s.crashAfterMs === null)) problems.push(`${item.slug}: a cycle exists only if there is a crash`);
  /* The repair the model proposes has to actually repair it. */
  const safe = safeRestartSecMs(s);
  if (safe === null && rateLimited(s)) {
    problems.push(`${item.slug}: refused, and no RestartSec under ten minutes avoids it, which is worth stating rather than returning null`);
  }
  if (safe !== null) {
    if (!rateLimited(s)) problems.push(`${item.slug}: a safe RestartSec is offered for a unit that was never limited`);
    if (rateLimited({ ...s, restartSecMs: safe })) problems.push(`${item.slug}: the "safe" RestartSec of ${safe} still trips the limit`);
    if (safe >= 2000 && !rateLimited({ ...s, restartSecMs: safe - 1000 })) {
      problems.push(`${item.slug}: a whole second less than the "smallest safe" RestartSec is also safe, so it is not the smallest`);
    }
  }
}

/* ── 6. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "the-fast-crash",
    () => {
      const s = find("the-fast-crash");
      return s.crashAfterMs === 500 && s.restartSecMs === 100 && cycleMs(s) === 600 && startsBeforeFailing(s) === 5 && givesUpAtMs(s) === 3000;
    },
    "a 600 millisecond cycle filling the burst in 2.4 seconds and being refused at 3",
  ],
  [
    "the-slow-crash",
    () => {
      const fast = find("the-fast-crash");
      const s = find("the-slow-crash");
      /* Same unit, same policy, same limiter: only the crash time differs, and it flips the outcome. */
      return (
        s.restartSecMs === fast.restartSecMs &&
        s.burst === fast.burst &&
        s.intervalMs === fast.intervalMs &&
        s.restart === fast.restart &&
        s.crashAfterMs === 2300 &&
        !rateLimited(s) &&
        rateLimited(fast) &&
        stillRestarting(s) &&
        /* The counter does fill; the window elapsing is the only reason it survives. */
        attempts(s).some((a) => a.countInWindow === s.burst) &&
        slidingWindowWouldLimit(s)
      );
    },
    "the same unit crashing slower restarting forever where the fast one is stopped, and only because the window resets",
  ],
  [
    "exactly-at-the-boundary",
    () => {
      const s = find("exactly-at-the-boundary");
      return (
        s.restartSecMs * s.burst === s.intervalMs &&
        givesUpAtMs(s) === 10_000 &&
        !rateLimited({ ...s, restartSecMs: s.restartSecMs + 1 }) &&
        safeRestartSecMs(s) === 3000
      );
    },
    "RestartSec of interval over burst being refused at exactly the interval, and one millisecond more surviving",
  ],
  [
    "what-would-have-saved-it",
    () => {
      const s = find("what-would-have-saved-it");
      return (
        safeRestartSecMs(s) === 2000 &&
        rateLimited({ ...s, restartSecMs: 1000 }) &&
        !rateLimited({ ...s, restartSecMs: 2000 }) &&
        /* Not simply interval over burst, because the crash time is part of the cycle. */
        s.intervalMs / s.burst === 2000 &&
        s.crashAfterMs === 500
      );
    },
    "two seconds of RestartSec saving a unit that one second does not",
  ],
  [
    "the-limit-switched-off",
    () => {
      const s = find("the-limit-switched-off");
      return s.burst === 0 && !limitEnabled(s) && stillRestarting(s) && !rateLimited(s) && rateLimited({ ...s, burst: 5 });
    },
    "a burst of zero disabling the limiter on a unit that a burst of five would stop",
  ],
  [
    "it-exited-cleanly",
    () => {
      const s = find("it-exited-cleanly");
      return s.exitCode === 0 && s.restart === "on-failure" && !restarts(s) && startsBeforeFailing(s) === 1 && ending(s) === "left-alone" && rateLimited({ ...s, exitCode: 1 });
    },
    "a clean exit under on-failure not restarting, where the same unit exiting 1 is rate limited",
  ],
  [
    "the-interval-widened",
    () => {
      const slow = find("the-slow-crash");
      const s = find("the-interval-widened");
      /* The same unit as the slow crash, with a wider window, and now it fails. */
      return s.crashAfterMs === slow.crashAfterMs && s.restartSecMs === slow.restartSecMs && s.intervalMs === 60_000 && givesUpAtMs(s) === 12_000 && !rateLimited(slow);
    },
    "widening the interval from ten seconds to sixty turning a forever-restarting unit into a failed one",
  ],
  [
    "the-burst-raised-to-fifty",
    () => {
      const s = find("the-burst-raised-to-fifty");
      const window = Math.floor(s.intervalMs / (s.crashAfterMs! + s.restartSecMs)) + 1;
      return s.burst === 50 && window < s.burst && !rateLimited(s) && stillRestarting(s) && rateLimited({ ...s, burst: 5 });
    },
    "a burst larger than the window can hold behaving as no limit at all",
  ],
  [
    "a-tenth-of-a-second",
    () => {
      const s = find("a-tenth-of-a-second");
      const faster: Setup = { ...s, crashAfterMs: 2000 };
      return s.crashAfterMs === 1900 && rateLimited(s) && !rateLimited(faster) && givesUpAtMs(s) === 10_000;
    },
    "100 milliseconds of crash time deciding whether the unit is dead and quiet or alive and burning",
  ],
  [
    "fifteen-hundred-milliseconds-into-boot",
    () => {
      const s = find("fifteen-hundred-milliseconds-into-boot");
      return s.crashAfterMs === 200 && givesUpAtMs(s) === 1500 && startsBeforeFailing(s) === 5 && ending(s) === "rate-limited";
    },
    "a unit spending its whole allowance in the first second and a half of boot",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-startlimit names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(`${slug} no longer has the property it exists to teach: ${what}. The exactly-one check cannot see this.`);
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

const readings: [number, string][] = [
  [100, "100ms"],
  [1000, "1s"],
  [2500, "2.5s"],
  [10_000, "10s"],
  [60_000, "1min"],
];
for (const [ms, want] of readings) {
  if (human(ms) !== want) problems.push(`human(${ms}) reads "${human(ms)}" rather than "${want}"`);
}

for (const item of CASES) {
  const s = item.setup;
  const unit = asUnit(s);
  if (!unit.includes(`Restart=${s.restart}`)) problems.push(`${item.slug}: the unit file does not print Restart=${s.restart}`);
  if (s.restartSecMs !== DEFAULT_RESTART_SEC_MS && !unit.includes(`RestartSec=${human(s.restartSecMs)}`)) {
    problems.push(`${item.slug}: RestartSec is not the default and the unit file does not print it`);
  }
  if (s.restartSecMs === DEFAULT_RESTART_SEC_MS && unit.includes("RestartSec=")) {
    problems.push(`${item.slug}: the unit file prints a RestartSec line for the default value`);
  }
  if (s.burst !== DEFAULT_BURST && !unit.includes(`StartLimitBurst=${s.burst}`)) problems.push(`${item.slug}: the unit file does not print StartLimitBurst=${s.burst}`);
  if (s.intervalMs !== DEFAULT_INTERVAL_MS && !unit.includes("StartLimitIntervalSec=")) problems.push(`${item.slug}: the unit file does not print StartLimitIntervalSec`);
  if (s.burst === DEFAULT_BURST && unit.includes("StartLimitBurst=")) problems.push(`${item.slug}: the unit file prints StartLimitBurst for the default value`);

  const journal = asJournal(s);
  const started = (journal.match(/Started /g) ?? []).length;
  const shown = Math.min(startsBeforeFailing(s), 12);
  if (started !== shown) problems.push(`${item.slug}: the journal shows ${started} starts and the walk allowed ${shown} in that span`);
  if (rateLimited(s) !== journal.includes("Start request repeated too quickly")) {
    problems.push(`${item.slug}: the journal and the model disagree about whether a start was refused`);
  }
  if (rateLimited(s) !== journal.includes("start-limit-hit")) problems.push(`${item.slug}: the journal's result does not match the outcome`);
  /* The counter it prints is the in-window one, so it can never exceed the burst. */
  for (const m of journal.matchAll(/\(start (\d+) of (\d+) in this window\)/g)) {
    if (Number(m[1]) > Number(m[2])) problems.push(`${item.slug}: the journal prints "start ${m[1]} of ${m[2]}", which cannot happen`);
  }
  /*
    When a reset happens among the attempts the journal actually prints, the
    counter has to be seen going back to 1. Asserted against the walk rather
    than against the burst, because a unit whose burst is larger than the
    window can hold has no reset inside the printed span and correctly shows
    none.
  */
  const printed = attempts(s).slice(0, 12);
  const resetsInView = printed.filter((a, i) => i > 0 && a.countInWindow === 1).length;
  const backToOne = [...journal.matchAll(/\(start (\d+) of/g)].map((m) => Number(m[1])).filter((c) => c === 1).length;
  if (backToOne !== resetsInView + (printed.length > 0 && printed[0].countInWindow === 1 ? 1 : 0)) {
    problems.push(`${item.slug}: the journal shows the counter at 1 ${backToOne} times and the walk resets it ${resetsInView} times in that span`);
  }

  const status = asStatus(s);
  if (rateLimited(s) && !status.includes("reset-failed")) problems.push(`${item.slug}: a failed unit's status does not name the command that clears it`);
  if (ending(s) === "restarting-forever" && !status.includes("auto-restart")) problems.push(`${item.slug}: a restarting unit's status does not say so`);
}

/* ── 8. spread, uniqueness and coverage of the endings ──────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(`${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`);
}

const endings = new Set(CASES.map((item) => ending(item.setup)));
for (const want of ["rate-limited", "restarting-forever", "left-alone"] as const) {
  if (!endings.has(want)) problems.push(`no case ends "${want}"; the surface is about which of these a unit reaches`);
}

const seen = new Map<string, string>();
for (const item of CASES) {
  const prior = seen.get(item.breaks);
  if (prior) problems.push(`${item.slug} and ${prior} break the same belief: "${item.breaks}"`);
  seen.set(item.breaks, item.slug);
  for (const field of ["brief", "question", "why", "fix"] as const) {
    if (!item[field] || item[field].length < 20) problems.push(`${item.slug}: ${field} is thin`);
  }
}

if (problems.length) {
  console.error(`check-startlimit: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} units through systemd's start limiter, each with exactly one option that holds,` +
    ` every outcome recomputed in closed form from the fixed window, ${disagree.length} case${disagree.length === 1 ? "" : "s"} where a sliding` +
    ` window would answer differently, ${atBoundary.length} landing on the interval boundary that one extra millisecond saves,` +
    ` all three endings present, ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
