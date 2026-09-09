/**
 * The quota surface, against the enforcement rules it claims to model.
 *
 * The lesson of check-load applies here and harder. Exactly-one has no power
 * over a shifted answer when the options name several values of one
 * quantity, and it has no power at all over an option whose prose and whose
 * machine readable claim disagree. So both of those are checked directly,
 * and every run is recomputed by a second implementation shaped differently.
 *
 * One check here is new. Several of these cases exist to contrast two
 * configurations, and the contrast is the content: 20 percent as 20/100 and
 * as 10/50 have to differ, or the case teaches nothing. Those pairings are
 * asserted, because a change that quietly collapses them leaves ten cases
 * that all pass and half of them pointless.
 *
 *     npx tsx scripts-ci/check-throttle.ts
 */

import {
  CASES,
  arrivedBy,
  asCpuMax,
  asCpuStat,
  everThrottled,
  exhaustsAt,
  finishesAt,
  limitCpus,
  matching,
  ms,
  periodCount,
  rate,
  run,
  stat,
  correctOption,
} from "../client/src/lib/throttle/index";
import type { Setup } from "../client/src/lib/throttle/types";

const problems: string[] = [];

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers, and the page marks whichever` +
        ` the model returns.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
}

/* ── 2. the prose figure and the checked figure ─────────────────────────── */

for (const item of CASES) {
  for (const option of item.options) {
    const says = option.says;
    const lead = /^(\d+(?:\.\d+)?)\s*(ms|percent|%)?/.exec(option.claim.trim());
    if (!lead) continue;
    const shown = Number(lead[1]);
    const want =
      says.about === "exhausts-at" || says.about === "finishes-at"
        ? says.ms
        : says.about === "periods-throttled"
          ? says.count
          : says.about === "utilisation"
            ? says.percent
            : null;
    if (want === null) continue;
    if (shown !== want) {
      problems.push(
        `${item.slug}/${option.id}: the claim opens with ${shown} and is checked against ${want}.` +
          ` A reader believes the prose.`,
      );
    }
  }
}

/* ── 3. the enforcement loop, recomputed differently ────────────────────── */

/*
  run() steps period by period and does the arithmetic in closed form. This
  walks wall clock in tenth-millisecond ticks and spends quota a tick at a
  time, which is the shape a person would reach for first and is far slower
  and much harder to get subtly wrong. If the two disagree about total CPU
  spent or about which periods were throttled, one of them is lying.
*/
function ticked(setup: Setup): { used: number; throttled: number; stalls: number } {
  const TICK = 0.1;
  const speed = rate(setup);
  let carried = 0;
  let backlog = 0;
  let used = 0;
  let throttled = 0;
  let stalls = 0;

  for (let n = 0; n < periodCount(setup); n += 1) {
    const start = n * setup.periodMs;
    for (const arrival of setup.arrivals) {
      if (arrival.at >= start && arrival.at < start + setup.periodMs) backlog += arrival.cpuMs;
    }
    let left = setup.quotaMs + carried;
    const had = left;
    let stalled = 0;
    for (let t = 0; t < setup.periodMs - 1e-9; t += TICK) {
      if (backlog <= 1e-9) continue;
      if (left <= 1e-9) {
        stalled += TICK;
        continue;
      }
      const spend = Math.min(speed * TICK, left, backlog);
      left -= spend;
      backlog -= spend;
      used += spend;
    }
    if (stalled > 1e-9) {
      throttled += stalled;
      stalls += 1;
    }
    carried = Math.min(setup.burstMs, Math.max(0, left));
    void had;
  }
  return { used: Math.round(used * 100) / 100, throttled: Math.round(throttled * 10) / 10, stalls };
}

for (const item of CASES) {
  const periods = run(item.setup);
  const s = stat(item.setup);
  const again = ticked(item.setup);
  const used = Math.round(periods.reduce((total, p) => total + p.usedMs, 0) * 100) / 100;
  if (Math.abs(used - again.used) > 0.5) {
    problems.push(
      `${item.slug}: the two recomputations disagree on CPU spent: ${used}ms against ${again.used}ms`,
    );
  }
  if (s.nrThrottled !== again.stalls) {
    problems.push(
      `${item.slug}: run() found ${s.nrThrottled} throttled periods and walking the clock found` +
        ` ${again.stalls}`,
    );
  }
  if (Math.abs(s.throttledMs - again.throttled) > 0.5) {
    problems.push(
      `${item.slug}: throttled time is ${s.throttledMs}ms one way and ${again.throttled}ms the other`,
    );
  }
}

/* ── 4. the two halves of the model have to agree with each other ───────── */

/*
  exhaustsAt and everThrottled are different functions answering the same
  question, and they disagreed once: a group whose quota exactly equals what
  its threads can spend in a period ran flat out to the boundary, which
  exhaustsAt reported as exhausting at 100ms and cpu.stat reported as not
  throttled at all. Both readings are defensible and only one can be on the
  page.
*/
for (const item of CASES) {
  const at = exhaustsAt(item.setup);
  const ever = everThrottled(item.setup);
  if ((at === null) === ever) {
    problems.push(
      `${item.slug}: exhaustsAt says ${at} and everThrottled says ${ever}. Those are the same` +
        ` question and the page shows both answers.`,
    );
  }
  if (at !== null && at >= item.setup.periodMs) {
    problems.push(`${item.slug}: the quota runs out at ${at}ms of a ${item.setup.periodMs}ms period`);
  }
  const s = stat(item.setup);
  if ((s.nrThrottled > 0) !== ever) {
    problems.push(`${item.slug}: cpu.stat says ${s.nrThrottled} throttled and everThrottled says ${ever}`);
  }
  if (s.utilisation > 1.0001) {
    problems.push(
      `${item.slug}: utilisation is ${(s.utilisation * 100).toFixed(1)} percent of quota with a` +
        ` burst of ${item.setup.burstMs}ms, which is more than the group is allowed`,
    );
  }
}

/* ── 5. direct properties, where exactly-one has nothing to say ─────────── */

const properties: [string, () => boolean, string][] = [
  [
    "four-threads-one-cpu",
    () => {
      const s = CASES.find((c) => c.slug === "four-threads-one-cpu")!.setup;
      return exhaustsAt(s) === s.periodMs / s.threads && limitCpus(s) === 1;
    },
    "a limit of exactly one CPU whose quota runs out at one over the thread count of the period",
  ],
  [
    "thirty-percent-and-throttled",
    () => {
      const s = CASES.find((c) => c.slug === "thirty-percent-and-throttled")!.setup;
      const st = stat(s);
      /* Well under the limit on average, and throttled anyway. Both halves. */
      return st.utilisation < 0.5 && st.nrThrottled > 0;
    },
    "utilisation under half the limit while periods are still being throttled, which is the case",
  ],
  [
    "forty-threads-half-a-cpu",
    () => {
      const s = CASES.find((c) => c.slug === "forty-threads-half-a-cpu")!.setup;
      /* The drain rate is the cores, not the threads. If those were equal the
         case would not distinguish the two mistakes. */
      return rate(s) === s.cores && s.threads > s.cores && (exhaustsAt(s) ?? 99) < 2;
    },
    "more threads than cores, so the drain rate is the core count, and under 2ms of running per period",
  ],
  [
    "more-threads-finished-sooner",
    () => {
      const s = CASES.find((c) => c.slug === "more-threads-finished-sooner")!.setup;
      const single: Setup = { ...s, threads: 1 };
      const many = finishesAt(s);
      const one = finishesAt(single);
      /* The counterintuitive half: throttled and still sooner. */
      return many !== null && one !== null && many < one && everThrottled(s) && !everThrottled(single);
    },
    "the threaded version throttled and finishing sooner than the single threaded one, which is never throttled",
  ],
  [
    "the-burst-absorbs-it",
    () => {
      const s = CASES.find((c) => c.slug === "the-burst-absorbs-it")!.setup;
      const without: Setup = { ...s, burstMs: 0 };
      /*
        Burst removes every stall and finishes the spike sooner. The second
        half of that was written as "and leaves the completion time
        unchanged", which was true of a version of finishesAt that reported
        the work done a period before it arrived. It is not true of the
        model: banking four quiet periods lets the spike run straight
        through, and it lands 175ms earlier.
      */
      const withBurst = finishesAt(s);
      const withoutBurst = finishesAt(without);
      return (
        !everThrottled(s) &&
        everThrottled(without) &&
        withBurst !== null &&
        withoutBurst !== null &&
        withBurst < withoutBurst &&
        s.burstMs > 0
      );
    },
    "burst removing every stall and finishing the spike sooner than the same workload without it",
  ],
  [
    "not-everything-is-throttling",
    () => {
      const s = CASES.find((c) => c.slug === "not-everything-is-throttling")!.setup;
      /* Physically incapable of being throttled: threads times period is the quota. */
      return !everThrottled(s) && rate(s) * s.periodMs <= s.quotaMs;
    },
    "a group that cannot be throttled by any workload, because its threads cannot spend the quota",
  ],
  [
    "threads-past-the-cores",
    () => {
      const s = CASES.find((c) => c.slug === "threads-past-the-cores")!.setup;
      const four: Setup = { ...s, threads: 4 };
      /* Two hundred threads behaves exactly as four do, which is the point. */
      return s.threads >= 50 && exhaustsAt(s) === exhaustsAt(four);
    },
    "two hundred threads exhausting the quota at the same instant four would",
  ],
  [
    "it-arrived-after-the-quota-went",
    () => {
      const item = CASES.find((c) => c.slug === "it-arrived-after-the-quota-went")!;
      const late = item.setup.arrivals[1];
      const gone = exhaustsAt(item.setup);
      /* The second arrival has to land inside the stall or there is no case. */
      return gone !== null && late !== undefined && late.at > gone && late.at < item.setup.periodMs;
    },
    "the second request arriving after the quota is gone and before the period ends",
  ],
  [
    "the-limit-is-not-a-core-count",
    () => {
      const s = CASES.find((c) => c.slug === "the-limit-is-not-a-core-count")!.setup;
      return stat(s).utilisation === 1 && !everThrottled(s);
    },
    "utilisation at exactly 100 percent of the quota with nothing throttled",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-throttle names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this.`,
    );
  }
}

/* ── 5b. arrivals, which decide when work is available to do ────────────── */

/*
  arrivedBy is what stops finishesAt reporting a completion before all the
  work has turned up. Without it a case whose second request arrives in a
  later period would be declared finished at the end of the first, because
  the backlog reached zero there. So: every case's last arrival has to be
  accounted for, and no case may be reported finished before its last piece
  of work has arrived.
*/
for (const item of CASES) {
  const last = [...item.setup.arrivals].sort((a, b) => b.at - a.at)[0];
  if (!last) {
    problems.push(`${item.slug}: no work arrives at all`);
    continue;
  }
  /*
    arrivedBy against run()'s own folding, period by period. These are two
    statements of the same boundary rule written in different places, and
    when they disagreed by one instant a case finished before its work
    arrived.
  */
  let folded = 0;
  for (const period of run(item.setup)) {
    folded += item.setup.arrivals.filter(
      (arrival) => arrival.at >= period.at && arrival.at < period.at + item.setup.periodMs,
    ).length;
    const seen = arrivedBy(item.setup, period.at + item.setup.periodMs).length;
    if (seen !== folded) {
      problems.push(
        `${item.slug}: by the end of period ${period.n}, run() has folded in ${folded} arrivals` +
          ` and arrivedBy reports ${seen}. The two disagree about which period a boundary` +
          ` arrival belongs to.`,
      );
      break;
    }
  }
  const done = finishesAt(item.setup);
  if (done !== null && done < last.at) {
    problems.push(
      `${item.slug}: finishes at ${done}ms and the last work arrives at ${last.at}ms, so it` +
        ` finished before it started`,
    );
  }
  if (last.at >= item.setup.windowMs) {
    problems.push(`${item.slug}: work arrives at ${last.at}ms, after the ${item.setup.windowMs}ms window ends`);
  }
}

/* ── 6. the contrasts that are the content ──────────────────────────────── */

/*
  The period case is about two configurations with the same ratio behaving
  differently. If a change makes them behave the same, every option still
  reads sensibly and the case has nothing in it.
*/
{
  const item = CASES.find((c) => c.slug === "the-period-not-the-ratio");
  if (!item) {
    problems.push("check-throttle names the-period-not-the-ratio and it is gone");
  } else {
    const short = item.setup;
    const long: Setup = { ...short, periodMs: short.periodMs * 2, quotaMs: short.quotaMs * 2 };
    if (limitCpus(short) !== limitCpus(long)) {
      problems.push("the-period-not-the-ratio: the two configurations are no longer the same limit");
    }
    if (stat(short).nrThrottled === stat(long).nrThrottled) {
      problems.push(
        "the-period-not-the-ratio: both periods now throttle the same number of times, so the case" +
          " has no contrast left in it",
      );
    }
    if (exhaustsAt(short) === exhaustsAt(long)) {
      problems.push("the-period-not-the-ratio: both configurations exhaust at the same instant");
    }
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

/*
  cpu.max and cpu.stat are the two files a reader would actually look at, and
  the page prints both. They are formatters, so a wrong field still produces
  a plausible line, and the numbers in them are parsed back here.
*/
for (const item of CASES) {
  const [quota, period] = asCpuMax(item.setup).split(" ").map(Number);
  if (quota !== Math.round(item.setup.quotaMs * 1000) || period !== Math.round(item.setup.periodMs * 1000)) {
    problems.push(`${item.slug}: cpu.max reads "${asCpuMax(item.setup)}" for a ${item.setup.quotaMs}/${item.setup.periodMs} case`);
  }
  const s = stat(item.setup);
  const fields = Object.fromEntries(
    asCpuStat(item.setup).split("\n").map((line) => {
      const [key, value] = line.split(" ");
      return [key, Number(value)];
    }),
  );
  if (fields.nr_periods !== s.nrPeriods) problems.push(`${item.slug}: cpu.stat nr_periods disagrees with stat()`);
  if (fields.nr_throttled !== s.nrThrottled) problems.push(`${item.slug}: cpu.stat nr_throttled disagrees with stat()`);
  if (Math.abs(fields.throttled_usec - s.throttledMs * 1000) > 1) {
    problems.push(`${item.slug}: cpu.stat throttled_usec is ${fields.throttled_usec} and stat() says ${s.throttledMs}ms`);
  }
  if (fields.nr_throttled > fields.nr_periods) {
    problems.push(`${item.slug}: cpu.stat claims more throttled periods than periods`);
  }
}

for (const [value, want] of [
  [0.5, "0.5ms"],
  [25, "25ms"],
  [1.5625, "1.56ms"],
  [100, "100ms"],
  [1000, "1s"],
  [1500, "1.5s"],
] as [number, string][]) {
  if (ms(value) !== want) problems.push(`ms(${value}) is "${ms(value)}" and the page needs "${want}"`);
}

/* ── 8. spread, prose figures and uniqueness ────────────────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(
    `${Math.max(...spread)} of ${CASES.length} answers are in the same option position` +
      ` (${spread.join("/")}). Clicking the same slot every time should not score.`,
  );
}

/*
  Every millisecond figure in the prose against something the model computes.
  Whole numbers are excluded: they are thread counts, core counts and quota
  settings, and matching those found coincidences rather than mistakes.
*/
for (const item of CASES) {
  const computed = new Set<string>();
  for (const period of run(item.setup)) {
    if (period.exhaustedAt !== null) computed.add(period.exhaustedAt.toFixed(1));
    computed.add(period.throttledMs.toFixed(1));
    computed.add(period.usedMs.toFixed(1));
  }
  for (const value of [exhaustsAt(item.setup), finishesAt(item.setup), stat(item.setup).throttledMs]) {
    if (value !== null) computed.add(value.toFixed(1));
  }
  /* Configuration is stated in the prose as often as results are. */
  for (const value of [item.setup.periodMs, item.setup.quotaMs, item.setup.burstMs, item.setup.windowMs]) {
    computed.add(value.toFixed(1));
  }
  for (const arrival of item.setup.arrivals) computed.add(arrival.cpuMs.toFixed(1));
  const prose = [item.brief, item.question, item.why, item.fix].join(" ");
  for (const match of prose.matchAll(/(?<![\w.])(\d+\.\d)(?![\w.\d])/g)) {
    if (!computed.has(match[1])) {
      problems.push(
        `${item.slug}: the prose states ${match[1]} and nothing in this run has that value`,
      );
    }
  }
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
  console.error(`check-throttle: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cgroups against a quota, each with exactly one option that holds, every run` +
    ` recomputed by walking the clock in tenth milliseconds, ${properties.length} direct` +
    ` properties, cpu.max and cpu.stat parsed back, and answers spread ${spread.join("/")}.`,
);
