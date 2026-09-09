/**
 * The enforcement loop, one period at a time.
 *
 * Two quantities and they are in different units, which is the whole
 * difficulty. Quota is CPU time. A period is wall clock time. Threads
 * convert between them at a rate of one CPU millisecond per wall
 * millisecond each, so the exchange rate is the number of threads that can
 * actually run, which is min(threads, cores).
 *
 * Everything else here is bookkeeping over that one conversion.
 *
 * From Documentation/scheduler/sched-bwc.rst and the cgroup v2 cpu
 * controller. Nothing models the per-CPU slice silos: they let a group
 * briefly exceed quota by at most 1ms per CPU of unreturned slice, which is
 * real and is not what any of these cases turn on.
 */

import type { Arrival, Case, Option, Period, Setup, Stat } from "./types";

/**
 * CPU milliseconds the group can spend per wall millisecond.
 *
 * Threads beyond the core count do not make the quota drain faster, because
 * they are not running. This is the one place the host's size enters: two
 * hundred threads on a four core node drain quota at four, not two hundred.
 */
export const rate = (setup: Setup): number => Math.min(setup.threads, setup.cores);

/** Periods that start inside the window. */
export const periodCount = (setup: Setup): number =>
  Math.max(0, Math.ceil(setup.windowMs / setup.periodMs));

/**
 * Work that has become runnable strictly before an instant.
 *
 * Strictly, and that is the whole content of this function. A period is the
 * half-open interval [at, at + periodMs), and run() folds an arrival into
 * the period containing its timestamp, so an arrival landing exactly on a
 * boundary belongs to the period starting there and not to the one ending.
 * Asking "has everything arrived by the end of period n" means passing the
 * start of period n+1 and excluding anything sitting on it.
 *
 * With this inclusive it disagreed with run() by one boundary, and
 * finishesAt reported a case as complete at 302.5ms whose last piece of work
 * arrived at 400ms. It finished before it started and nothing said so.
 */
export const arrivedBy = (setup: Setup, before: number): Arrival[] =>
  setup.arrivals.filter((arrival) => arrival.at < before);

/**
 * The whole run, period by period.
 *
 * Within a period the group runs at `rate` until either the work runs out or
 * the quota does. If the quota goes first the group is throttled for the
 * rest of the period, whatever else it had to do, and whatever the host has
 * spare. That last part is what makes this different from being slow: the
 * cores are idle and the threads are not allowed on them.
 */
export function run(setup: Setup): Period[] {
  const out: Period[] = [];
  const speed = rate(setup);
  let carried = 0;
  let backlog = 0;
  let done = 0;

  for (let n = 0; n < periodCount(setup); n += 1) {
    const at = n * setup.periodMs;
    /* Work that became runnable during this period is available in it. */
    for (const arrival of setup.arrivals) {
      if (arrival.at >= at && arrival.at < at + setup.periodMs) backlog += arrival.cpuMs;
    }

    const available = setup.quotaMs + carried;
    /* The most the group could physically use, if quota were unlimited. */
    const capable = speed * setup.periodMs;
    const wanted = Math.min(backlog, capable);
    const used = Math.min(wanted, available);

    /*
      Exhausted only when the quota is what stopped it, and only when it
      stopped it early.

      Two ways to end a period having spent everything. A group that ran out
      of work with quota to spare is idle, not throttled, and the difference
      is the entire diagnosis. A group whose quota happens to equal what its
      threads could physically consume in one period runs flat out to the
      boundary and is not stopped either: it never sat idle, and the next
      period arrives exactly as it needs it. Only the first of those is
      throttling, so the test is that the quota ran out strictly before the
      period did. Without the third clause a two thread group with two CPUs
      of quota reported exhausting at 100ms while cpu.stat showed nothing
      throttled, which is two functions describing the same period two ways.
    */
    const exhausted =
      used >= available && backlog > used && available / speed < setup.periodMs;
    const exhaustedAt = exhausted ? available / speed : null;
    const throttledMs = exhaustedAt === null ? 0 : setup.periodMs - exhaustedAt;

    backlog -= used;
    done += used;
    /*
      Unused quota carries forward, up to cfs_burst_us. With the default
      burst of zero this is always zero, which is the traditional behaviour:
      a period that underruns simply loses the difference.
    */
    carried = Math.min(setup.burstMs, Math.max(0, available - used));

    out.push({ n, at, availableMs: available, usedMs: used, exhaustedAt, throttledMs, backlogMs: backlog });
  }
  void done;
  return out;
}

/** What cpu.stat would report at the end of the window. */
export function stat(setup: Setup): Stat {
  const periods = run(setup);
  const throttled = periods.filter((period) => period.throttledMs > 0);
  const used = periods.reduce((total, period) => total + period.usedMs, 0);
  return {
    nrPeriods: periods.length,
    nrThrottled: throttled.length,
    throttledMs: Math.round(throttled.reduce((total, p) => total + p.throttledMs, 0) * 1000) / 1000,
    utilisation: periods.length === 0 ? 0 : used / (periods.length * setup.quotaMs),
  };
}

/**
 * How far into a period the quota runs out, once the group is saturated.
 *
 * The steady state rather than the first period, because the first can be
 * short of work. Null when it never runs out.
 */
export function exhaustsAt(setup: Setup): number | null {
  const hits = run(setup)
    .filter((period) => period.exhaustedAt !== null)
    .map((period) => period.exhaustedAt as number);
  if (hits.length === 0) return null;
  /* The value it settles on, which is the last one, not the first. */
  return Math.round(hits[hits.length - 1] * 1000) / 1000;
}

/**
 * When the work that arrived is finally all done, in wall clock.
 *
 * This is the number a user experiences and the one no utilisation graph
 * shows. It is computed to the millisecond inside the period that finishes
 * it, because finishing 3ms into a 100ms period and finishing at the end of
 * it are not the same answer.
 */
export function finishesAt(setup: Setup): number | null {
  const speed = rate(setup);
  for (const period of run(setup)) {
    if (period.backlogMs > 0 || period.usedMs === 0) continue;
    const arrivedYet = arrivedBy(setup, period.at + setup.periodMs);
    if (arrivedYet.length !== setup.arrivals.length) continue;
    return Math.round((period.at + period.usedMs / speed) * 1000) / 1000;
  }
  return null;
}

/** Whether anything anywhere in the window was stopped by the quota. */
export const everThrottled = (setup: Setup): boolean =>
  run(setup).some((period) => period.throttledMs > 0);

/** The limit as Kubernetes writes it, which is quota over period. */
export const limitCpus = (setup: Setup): number =>
  Math.round((setup.quotaMs / setup.periodMs) * 1000) / 1000;

/** Does a claim hold of a run? */
export function holds(claim: Case["options"][number]["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "exhausts-at":
      return exhaustsAt(setup) === claim.ms;
    case "finishes-at":
      return finishesAt(setup) === claim.ms;
    case "periods-throttled":
      return stat(setup).nrThrottled === claim.count;
    case "utilisation":
      return Math.round(stat(setup).utilisation * 100) === claim.percent;
    case "never-throttled":
      return !everThrottled(setup);
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] =>
  item.options.filter((option) => holds(option.says, item.setup));

/**
 * The option that is right, found rather than declared.
 *
 * The data carries a quota, a period, a thread count and some work. The
 * model runs the enforcement loop. CI requires exactly one option to hold,
 * so an option set that has drifted from its own numbers fails the build.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Milliseconds as a person would say them. */
export function ms(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}s`;
  return Number.isInteger(value) ? `${value}ms` : `${Math.round(value * 100) / 100}ms`;
}

/** The cgroup v2 file the limit is actually written in. */
export const asCpuMax = (setup: Setup): string =>
  `${Math.round(setup.quotaMs * 1000)} ${Math.round(setup.periodMs * 1000)}`;

/** What cpu.stat would print. */
export function asCpuStat(setup: Setup): string {
  const s = stat(setup);
  const periods = run(setup);
  const used = periods.reduce((total, period) => total + period.usedMs, 0);
  return [
    `usage_usec ${Math.round(used * 1000)}`,
    `nr_periods ${s.nrPeriods}`,
    `nr_throttled ${s.nrThrottled}`,
    `throttled_usec ${Math.round(s.throttledMs * 1000)}`,
  ].join("\n");
}
