/**
 * Backup retention and storage model.
 *
 * The model simulates one backup per day on a real Gregorian calendar and
 * asks, on every day of a steady-state year, which backups the policy keeps
 * and which further backups those depend on. A backup can only be deleted
 * once nothing retained depends on it, so the set on disk is the policy set
 * closed under dependencies. That closure is why a "keep 7 days" policy with
 * weekly fulls and daily incrementals holds up to 13 backups: the oldest
 * kept incremental still needs its full and every incremental before it.
 *
 * Calendar conventions, all deterministic:
 *   - Day 0 is Sunday 7 January 2001, the first Sunday of that year.
 *   - Weekly points are the Sunday backups.
 *   - Monthly points are the first Sunday backup of each month.
 *   - Yearly points are the first Sunday backup of each January.
 *   - Weekly fulls run every Sunday; monthly fulls on the first Sunday of
 *     the month, so every monthly and yearly point is a full.
 *
 * Size model, in units of one full backup before compression:
 *   - full: 1
 *   - incremental: the daily change fraction c
 *   - differential k days after its full: min(k * c, 1), the no-overlap
 *     bound. Real change concentrates in hot blocks, so this is conservative.
 *
 * No React or DOM here, so the arithmetic is unit tested on its own.
 */

export type Scheme = "full" | "incremental" | "differential" | "forever";
export type Cadence = "weekly" | "monthly";
export type RetentionMode = "simple" | "gfs";
export type PointKind = "F" | "I" | "D";

export const SCHEMES: Scheme[] = ["full", "incremental", "differential", "forever"];

/** Caps that bound the simulation. Each is far past ordinary policy. */
export const MAX_DAYS = 3650;
export const MAX_WEEKLY = 520;
export const MAX_MONTHLY = 240;
export const MAX_YEARLY = 30;
export const MAX_LOCK_DAYS = 3650;
export const MAX_COPIES = 10;
export const MAX_RATIO = 100;
/** Largest full backup accepted, in bytes (one exabyte). */
export const MAX_FULL_BYTES = 1e18;
/** Days of steady state examined to find the peak. Covers every weekday and month alignment. */
export const EVAL_DAYS = 400;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_MS = 86_400_000;
const START_MS = Date.UTC(2001, 0, 7);

export interface Policy {
  mode: RetentionMode;
  /** Simple mode: keep the last N daily backups. */
  days: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export interface ModelInput {
  policy: Policy;
  /** Share of the full that changes each day, 0 to 1. */
  changeFraction: number;
  cadence: Cadence;
  /** Immutability window: backups younger than this cannot be deleted. 0 for none. */
  lockDays: number;
}

export interface StripCell {
  /** Days before the peak day, or null for a day after it. */
  age: number | null;
  kind: PointKind | null;
  /** On disk at the peak. */
  kept: boolean;
  /** Kept by the retention policy itself rather than only as a dependency or by a lock. */
  policy: boolean;
  /** Backups a restore of this point reads, if it is on disk. */
  chain: number;
}

export interface SchemeOk {
  scheme: Scheme;
  available: true;
  policyMin: number;
  policyMax: number;
  diskMin: number;
  diskMax: number;
  /** Logical size on disk at the peak, in units of one full backup. */
  peakUnits: number;
  minUnits: number;
  peakWeekday: string;
  peakCounts: Record<PointKind, number>;
  /** Longest restore chain among the backups on disk, in files. */
  longestChain: number;
  /** Age of the oldest backup on disk at the peak, in days. */
  oldestAge: number;
  /** Six calendar weeks ending with the peak day's week, Sunday first. */
  strip: StripCell[];
  /** Backups on disk older than the strip, and their size in fulls. */
  olderCount: number;
  olderUnits: number;
}

export interface SchemeUnavailable {
  scheme: Scheme;
  available: false;
  reason: string;
}

export type SchemeResult = SchemeOk | SchemeUnavailable;

export type Parsed = { ok: true; value: number } | { ok: false; message: string };

/* ----------------------------------------------------------------- parsing */

const DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/** Parse a non-negative decimal typed by a person, with a message naming the field. */
export function parseNumber(
  raw: string,
  label: string,
  opts: { min: number; max: number; integer?: boolean },
): Parsed {
  const text = raw.trim();
  if (text === "") return { ok: false, message: `${label} is empty.` };
  if (text.startsWith("-")) return { ok: false, message: `${label} cannot be negative.` };
  if (!DECIMAL.test(text)) {
    return { ok: false, message: `${label} should be a plain number, such as ${opts.integer ? "7" : "2.5"}.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, message: `${label} is too large.` };
  if (opts.integer && !Number.isInteger(value)) {
    return { ok: false, message: `${label} should be a whole number.` };
  }
  if (value < opts.min) return { ok: false, message: `${label} must be at least ${formatPlain(opts.min)}.` };
  if (value > opts.max) return { ok: false, message: `${label} can be at most ${formatPlain(opts.max)}.` };
  return { ok: true, value };
}

function formatPlain(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** Null when the policy keeps something, otherwise a reason. */
export function policyProblem(policy: Policy): string | null {
  if (policy.mode === "simple") return policy.days >= 1 ? null : "Keep at least one day.";
  if (policy.daily + policy.weekly + policy.monthly + policy.yearly === 0) {
    return "Every tier is zero, so nothing would be kept. Set at least one count above zero.";
  }
  return null;
}

/* ----------------------------------------------------------------- formats */

export type UnitSystem = "si" | "iec";

/** Bytes with three significant digits, in decimal (GB) or binary (GiB) units. */
export function formatBytes(bytes: number, system: UnitSystem): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  const base = system === "si" ? 1000 : 1024;
  const units =
    system === "si" ? ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB"] : ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB"];
  let value = bytes;
  let i = 0;
  while (value >= base && i < units.length - 1) {
    value /= base;
    i += 1;
  }
  if (i === 0) return `${Math.round(value)} B`;
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[i]}`;
}

/* -------------------------------------------------------------- simulation */

interface Calendar {
  length: number;
  evalStart: number;
  kind: Record<Exclude<Scheme, "forever">, Uint8Array>;
  base: Record<Exclude<Scheme, "forever">, Int32Array>;
  monthly: number[];
  yearly: number[];
}

const KIND_F = 0;
const KIND_I = 1;
const KIND_D = 2;
const KIND_LETTER: PointKind[] = ["F", "I", "D"];

/** Days needed before every tier has filled, so the evaluation year is steady state. */
function warmUp(input: ModelInput): number {
  const p = input.policy;
  const daily = p.mode === "simple" ? p.days : p.daily;
  const weekly = p.mode === "simple" ? 0 : p.weekly;
  const monthly = p.mode === "simple" ? 0 : p.monthly;
  const yearly = p.mode === "simple" ? 0 : p.yearly;
  // Monthly fulls can make a chain up to five weeks long, so allow for it.
  return Math.max(daily, input.lockDays, 7 * weekly, 31 * monthly + 31, 366 * yearly + 366) + 70;
}

function buildCalendar(input: ModelInput): Calendar {
  const evalStart = warmUp(input);
  const length = evalStart + EVAL_DAYS;
  const monthly: number[] = [];
  const yearly: number[] = [];
  const fullKind = new Uint8Array(length);
  const fullBase = new Int32Array(length);
  const incKind = new Uint8Array(length);
  const incBase = new Int32Array(length);
  const diffKind = new Uint8Array(length);
  const diffBase = new Int32Array(length);
  let lastFull = 0;
  for (let t = 0; t < length; t++) {
    const sunday = t % 7 === 0;
    let firstSunday = false;
    let firstSundayOfYear = false;
    if (sunday) {
      const date = new Date(START_MS + t * DAY_MS);
      firstSunday = date.getUTCDate() <= 7;
      firstSundayOfYear = firstSunday && date.getUTCMonth() === 0;
    }
    if (firstSunday) monthly.push(t);
    if (firstSundayOfYear) yearly.push(t);
    const isFull = input.cadence === "weekly" ? sunday : firstSunday;
    if (isFull) lastFull = t;
    fullKind[t] = KIND_F;
    fullBase[t] = t;
    incKind[t] = isFull ? KIND_F : KIND_I;
    incBase[t] = lastFull;
    diffKind[t] = isFull ? KIND_F : KIND_D;
    diffBase[t] = lastFull;
  }
  return {
    length,
    evalStart,
    kind: { full: fullKind, incremental: incKind, differential: diffKind },
    base: { full: fullBase, incremental: incBase, differential: diffBase },
    monthly,
    yearly,
  };
}

/** Index of the last element of a sorted array that is at most `value`, or -1. */
function lastAtMost(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

interface Retained {
  list: number[];
  policyCount: number;
}

/**
 * The policy set on day E, plus anything the lock still protects. Stamps
 * `pol` and `ret` with `gen` so membership checks are O(1) without clearing.
 */
function retainedOn(
  E: number,
  input: ModelInput,
  cal: Calendar,
  pol: Int32Array,
  ret: Int32Array,
  gen: number,
): Retained {
  const list: number[] = [];
  let policyCount = 0;
  const addPolicy = (t: number) => {
    if (t < 0 || pol[t] === gen) return;
    pol[t] = gen;
    policyCount += 1;
    if (ret[t] !== gen) {
      ret[t] = gen;
      list.push(t);
    }
  };
  const p = input.policy;
  const daily = p.mode === "simple" ? p.days : p.daily;
  for (let t = E - daily + 1; t <= E; t++) addPolicy(t);
  if (p.mode === "gfs") {
    const lastSunday = E - (E % 7);
    for (let k = 0; k < p.weekly; k++) addPolicy(lastSunday - 7 * k);
    const m = lastAtMost(cal.monthly, E);
    for (let k = 0; k < p.monthly && m - k >= 0; k++) addPolicy(cal.monthly[m - k]);
    const y = lastAtMost(cal.yearly, E);
    for (let k = 0; k < p.yearly && y - k >= 0; k++) addPolicy(cal.yearly[y - k]);
  }
  for (let t = Math.max(0, E - input.lockDays + 1); t <= E; t++) {
    if (ret[t] !== gen) {
      ret[t] = gen;
      list.push(t);
    }
  }
  return { list, policyCount };
}

interface DiskState {
  count: number;
  units: number;
  counts: [number, number, number];
  longest: number;
  oldest: number;
}

function sizeOf(kind: number, t: number, base: number, c: number): number {
  if (kind === KIND_F) return 1;
  if (kind === KIND_I) return c;
  return Math.min((t - base) * c, 1);
}

function chainOf(kind: number, t: number, base: number): number {
  if (kind === KIND_F) return 1;
  if (kind === KIND_I) return t - base + 1;
  return 2;
}

/**
 * Close the retained list under dependencies and total what is on disk.
 * An incremental needs its full and every incremental between them; a
 * differential needs only its full. Walking down a chain stops at the first
 * backup already on disk, because every backup is added together with the
 * rest of its chain below it. That holds in any processing order, so the
 * list needs no sorting and each backup is visited once.
 */
function closeOver(
  list: number[],
  kindArr: Uint8Array,
  baseArr: Int32Array,
  c: number,
  disk: Int32Array,
  gen: number,
): DiskState {
  const state: DiskState = { count: 0, units: 0, counts: [0, 0, 0], longest: 0, oldest: Infinity };
  const add = (v: number) => {
    disk[v] = gen;
    const kind = kindArr[v];
    const base = baseArr[v];
    state.count += 1;
    state.units += sizeOf(kind, v, base, c);
    state.counts[kind] += 1;
    const chain = chainOf(kind, v, base);
    if (chain > state.longest) state.longest = chain;
    if (v < state.oldest) state.oldest = v;
  };
  for (const t of list) {
    const kind = kindArr[t];
    if (kind === KIND_I) {
      for (let v = t; v >= baseArr[t]; v--) {
        if (disk[v] === gen) break;
        add(v);
      }
    } else {
      if (disk[t] !== gen) add(t);
      if (kind === KIND_D && disk[baseArr[t]] !== gen) add(baseArr[t]);
    }
  }
  return state;
}

function forever(input: ModelInput): SchemeResult {
  if (input.policy.mode === "gfs") {
    return {
      scheme: "forever",
      available: false,
      reason:
        "An incremental-forever chain merges each expiring point into the full, so nothing older than the daily window survives. Weekly, monthly and yearly points need periodic fulls.",
    };
  }
  if (input.lockDays > 0) {
    return {
      scheme: "forever",
      available: false,
      reason:
        "Rolling the oldest increment into the full rewrites the full, which a locked file does not allow. Immutable repositories need periodic fulls.",
    };
  }
  const n = input.policy.days;
  const c = input.changeFraction;
  const units = 1 + (n - 1) * c;
  const strip: StripCell[] = [];
  // Peak day: any day looks the same, so draw it ending on a Saturday.
  for (let i = 0; i < 42; i++) {
    const age = 41 - i;
    const kept = age < n;
    strip.push({
      age,
      kind: kept ? (age === n - 1 ? "F" : "I") : null,
      kept,
      policy: kept,
      chain: kept ? n - age : 0,
    });
  }
  return {
    scheme: "forever",
    available: true,
    policyMin: n,
    policyMax: n,
    diskMin: n,
    diskMax: n,
    peakUnits: units,
    minUnits: units,
    peakWeekday: "any day",
    peakCounts: { F: 1, I: n - 1, D: 0 },
    longestChain: n,
    oldestAge: n - 1,
    strip,
    // Ages 42 and up fall before the strip; the oldest of them is the full.
    olderCount: Math.max(0, n - 42),
    olderUnits: n > 42 ? 1 + (n - 43) * c : 0,
  };
}

/** Run the model for every scheme. Inputs are assumed validated. */
export function simulate(input: ModelInput): SchemeResult[] {
  const cal = buildCalendar(input);
  const c = input.changeFraction;
  const pol = new Int32Array(cal.length).fill(-1);
  const ret = new Int32Array(cal.length).fill(-1);
  const chained: Exclude<Scheme, "forever">[] = ["full", "incremental", "differential"];
  const disks = chained.map(() => new Int32Array(cal.length).fill(-1));

  interface Track {
    policyMin: number;
    policyMax: number;
    diskMin: number;
    diskMax: number;
    peakUnits: number;
    minUnits: number;
    peakDay: number;
    peakState: DiskState | null;
    longest: number;
  }
  const tracks: Track[] = chained.map(() => ({
    policyMin: Infinity,
    policyMax: 0,
    diskMin: Infinity,
    diskMax: 0,
    peakUnits: -1,
    minUnits: Infinity,
    peakDay: cal.evalStart,
    peakState: null,
    longest: 0,
  }));

  for (let E = cal.evalStart; E < cal.length; E++) {
    const { list, policyCount } = retainedOn(E, input, cal, pol, ret, E);
    chained.forEach((scheme, i) => {
      const s = closeOver(list, cal.kind[scheme], cal.base[scheme], c, disks[i], E);
      const tr = tracks[i];
      tr.policyMin = Math.min(tr.policyMin, policyCount);
      tr.policyMax = Math.max(tr.policyMax, policyCount);
      tr.diskMin = Math.min(tr.diskMin, s.count);
      tr.diskMax = Math.max(tr.diskMax, s.count);
      tr.minUnits = Math.min(tr.minUnits, s.units);
      tr.longest = Math.max(tr.longest, s.longest);
      if (
        s.units > tr.peakUnits + 1e-12 ||
        (Math.abs(s.units - tr.peakUnits) <= 1e-12 && tr.peakState && s.count > tr.peakState.count)
      ) {
        tr.peakUnits = s.units;
        tr.peakDay = E;
        tr.peakState = s;
      }
    });
  }

  const results: SchemeResult[] = chained.map((scheme, i) => {
    const tr = tracks[i];
    const E = tr.peakDay;
    // Re-run the peak day into fresh stamps so the strip can read membership.
    const pol2 = new Int32Array(cal.length).fill(-1);
    const ret2 = new Int32Array(cal.length).fill(-1);
    const disk2 = new Int32Array(cal.length).fill(-1);
    const { list } = retainedOn(E, input, cal, pol2, ret2, 1);
    const state = closeOver(list, cal.kind[scheme], cal.base[scheme], c, disk2, 1);
    const kindArr = cal.kind[scheme];
    const baseArr = cal.base[scheme];
    const weekStart = E - (E % 7);
    const stripStart = weekStart - 35;
    const strip: StripCell[] = [];
    for (let k = 0; k < 42; k++) {
      const t = stripStart + k;
      if (t > E) {
        strip.push({ age: null, kind: null, kept: false, policy: false, chain: 0 });
        continue;
      }
      const kept = disk2[t] === 1;
      strip.push({
        age: E - t,
        kind: KIND_LETTER[kindArr[t]],
        kept,
        policy: pol2[t] === 1,
        chain: kept ? chainOf(kindArr[t], t, baseArr[t]) : 0,
      });
    }
    let olderCount = 0;
    let olderUnits = 0;
    for (let t = Math.max(0, state.oldest); t < stripStart; t++) {
      if (disk2[t] === 1) {
        olderCount += 1;
        olderUnits += sizeOf(kindArr[t], t, baseArr[t], c);
      }
    }
    return {
      scheme,
      available: true,
      policyMin: tr.policyMin,
      policyMax: tr.policyMax,
      diskMin: tr.diskMin,
      diskMax: tr.diskMax,
      peakUnits: state.units,
      minUnits: tr.minUnits,
      peakWeekday: WEEKDAYS[E % 7],
      peakCounts: { F: state.counts[KIND_F], I: state.counts[KIND_I], D: state.counts[KIND_D] },
      longestChain: tr.longest,
      oldestAge: E - state.oldest,
      strip,
      olderCount,
      olderUnits,
    };
  });

  results.push(forever(input));
  return results;
}
