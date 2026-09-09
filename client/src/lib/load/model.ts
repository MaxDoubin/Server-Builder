/**
 * The fold the kernel actually does, in the fixed point it actually uses.
 *
 * This could be written in floating point with `Math.exp(-5/60)` and it would
 * be close. It is not written that way, because the interesting behaviour is
 * in the parts that a clean exponential does not have: eleven bits of
 * fraction, a rounding term that only applies while the load is rising, and
 * a sample period that is five seconds plus one tick rather than five
 * seconds. Modelling the idea instead of the code gives you a curve that is
 * right to about a percent and wrong about everything this page is for.
 *
 * From include/linux/sched/loadavg.h and kernel/sched/loadavg.c.
 */

import type { Cause, Case, Option, Sample, Setup, Which } from "./types";

/** Bits of fraction. 1.0 is 2048. */
export const FSHIFT = 11;
export const FIXED_1 = 1 << FSHIFT;

/**
 * The decay per sample for each figure, as the kernel's fixed point.
 *
 * 1884/2048 is 0.919922 and exp(-5/60) is 0.920044, so the kernel's own
 * constant is not the exponential either. Using the exponential here would
 * disagree with a real /proc/loadavg in the third decimal place and the
 * point of this file is to agree with it.
 */
export const EXP_1 = 1884;
export const EXP_5 = 2014;
export const EXP_15 = 2037;

/**
 * The sample period, in seconds.
 *
 * LOAD_FREQ is 5*HZ+1, not 5*HZ. The extra tick is deliberate: a period that
 * divides evenly into a second aliases against anything that itself runs on
 * a round schedule, and a cron job that starts every five seconds would be
 * sampled either always or never. At HZ=250 this is 5.004 seconds, which is
 * what the model uses, so a long window drifts off a round number of
 * seconds exactly the way a real one does.
 */
export const HZ = 250;
export const LOAD_FREQ = (5 * HZ + 1) / HZ;

/**
 * One fold. This is calc_load() from the header, transcribed.
 *
 *   newload = load * exp + active * (FIXED_1 - exp);
 *   if (active >= load) newload += FIXED_1-1;
 *   return newload / FIXED_1;
 *
 * The conditional is the part worth keeping, and I had it backwards until I
 * ran it both ways. `active >= load` is true while the load is climbing
 * towards the count and false while it is falling away from it, so the term
 * is a rounding-up applied to the rise only. What it buys is the last unit:
 * without it a load rising to a steady eight settles at 7.99 and stays
 * there, because eleven bits of truncation per fold cost exactly as much as
 * the last fold gains. The decay does not use the term at all and is
 * identical with or without it, reaching a true zero after 94 folds either
 * way. I had written that the term was what got an idle machine to zero.
 * It is what gets a busy one to eight.
 */
export function calcLoad(load: number, exp: number, active: number): number {
  let newload = load * exp + active * (FIXED_1 - exp);
  if (active >= load) newload += FIXED_1 - 1;
  return Math.floor(newload / FIXED_1);
}

/** Fixed point to the number a person reads, at the precision /proc prints. */
export const asNumber = (fixed: number): number => Math.round((fixed / FIXED_1) * 100) / 100;

/** The number a person reads back to fixed point. */
export const asFixed = (value: number): number => Math.round(value * FIXED_1);

/** How long the whole window runs, in seconds. */
export const windowOf = (setup: Setup): number =>
  setup.phases.reduce((total, phase) => total + phase.seconds, 0);

/** The counts in force at a given second. */
export function countsAt(setup: Setup, at: number): { running: number; blocked: number } {
  let edge = 0;
  for (const phase of setup.phases) {
    edge += phase.seconds;
    if (at < edge) return { running: phase.running, blocked: phase.blocked };
  }
  const last = setup.phases[setup.phases.length - 1];
  return last ? { running: last.running, blocked: last.blocked } : { running: 0, blocked: 0 };
}

/**
 * Every sample in the window, with the three figures after each fold.
 *
 * The kernel samples the instantaneous count at the tick and folds that one
 * number in. It does not integrate over the interval, which is why a burst
 * that begins and ends between two samples contributes nothing at all: the
 * work happened and the load average has no record of it.
 */
export function run(setup: Setup): Sample[] {
  const total = windowOf(setup);
  let one = asFixed(setup.start[0]);
  let five = asFixed(setup.start[1]);
  let fifteen = asFixed(setup.start[2]);
  const out: Sample[] = [];

  for (let n = 1; n * LOAD_FREQ <= total + 1e-9; n += 1) {
    const at = n * LOAD_FREQ;
    const { running, blocked } = countsAt(setup, at);
    const active = (running + blocked) * FIXED_1;
    one = calcLoad(one, EXP_1, active);
    five = calcLoad(five, EXP_5, active);
    fifteen = calcLoad(fifteen, EXP_15, active);
    out.push({
      at,
      running,
      blocked,
      active: running + blocked,
      one: asNumber(one),
      five: asNumber(five),
      fifteen: asNumber(fifteen),
    });
  }
  return out;
}

/**
 * What a figure reads at a given second.
 *
 * /proc/loadavg is read at an arbitrary moment and returns whatever the last
 * fold left, so this is the most recent sample at or before the second
 * asked about, not an interpolation.
 */
export function readAt(setup: Setup, which: Which, at: number): number {
  let value = setup.start[which === "one" ? 0 : which === "five" ? 1 : 2];
  for (const sample of run(setup)) {
    if (sample.at > at) break;
    value = sample[which];
  }
  return value;
}

/**
 * The highest a figure reaches anywhere in the window, the reading at second
 * zero included.
 *
 * Including the start is not a detail. A case that opens part way through an
 * incident and watches it recover has its highest reading before the first
 * fold, and a peak taken over the samples alone would report a number lower
 * than the one `readAt(setup, which, 0)` returns for the same window, which
 * is two functions disagreeing about the same run.
 */
export function peak(setup: Setup, which: Which): number {
  const start = setup.start[which === "one" ? 0 : which === "five" ? 1 : 2];
  return run(setup).reduce((high, sample) => Math.max(high, sample[which]), start);
}

/** Load per core, which is the figure people believe they are already reading. */
export const perCore = (setup: Setup, at: number): number =>
  Math.round((readAt(setup, "one", at) / setup.cores) * 100) / 100;

/**
 * What the number is actually reporting, taken from the counts rather than
 * from the total.
 *
 * Judged over the busiest phase rather than averaged, because an incident is
 * a thing that happened at a moment and an average across a window that is
 * mostly idle would call every incident "neither".
 *
 * The thresholds: runnable tasks are contended only once there are more of
 * them than there are cores, since that is the definition of a queue.
 * Uninterruptible sleep is contended at any depth worth mentioning, because
 * one task stuck in D state is one task that cannot be killed.
 */
export function blame(setup: Setup): Cause {
  const worst = [...setup.phases].sort(
    (a, b) => b.running + b.blocked - (a.running + a.blocked),
  )[0];
  if (!worst) return "neither";
  const queued = worst.running > setup.cores;
  const stuck = worst.blocked >= 1;
  if (queued && stuck) return "both";
  if (queued) return "cpu";
  if (stuck) return "io";
  return "neither";
}

/** Does a claim hold of a run? */
export function holds(claim: Case["options"][number]["says"], setup: Setup): boolean {
  switch (claim.about) {
    case "reads":
      return readAt(setup, claim.which, claim.at) === claim.value;
    case "peaks":
      return peak(setup, claim.which) === claim.value;
    case "per-core":
      return perCore(setup, claim.at) === claim.value;
    case "blames":
      return blame(setup) === claim.cause;
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
 * The data carries a core count and a timeline of task counts. The model
 * does the fold. CI requires exactly one option to hold, so an option set
 * that has drifted from its own timeline fails the build rather than
 * teaching somebody a number the kernel would not print.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** Seconds as a person would say them. */
export function clock(seconds: number): string {
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`;
}

/** The line /proc/loadavg would print at a given second. */
export function procLine(setup: Setup, at: number): string {
  const { running, blocked } = countsAt(setup, at);
  const three = (["one", "five", "fifteen"] as Which[])
    .map((which) => readAt(setup, which, at).toFixed(2))
    .join(" ");
  return `${three} ${running + 1}/${running + blocked + 92} ${4000 + Math.round(at)}`;
}

export const CAUSE_LABEL: Record<Cause, string> = {
  cpu: "tasks queued for a core",
  io: "tasks in uninterruptible sleep",
  both: "queued for a core and blocked on a device",
  neither: "nothing contended",
};
