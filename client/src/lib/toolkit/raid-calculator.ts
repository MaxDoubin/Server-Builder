/**
 * RAID capacity, fault tolerance and throughput arithmetic.
 *
 * Capacities are carried as whole bytes in BigInt, parsed exactly from the
 * decimal text the reader typed, so 7.68 TB is 7,680,000,000,000 bytes and
 * nothing passes through a float until it is formatted for display. A drive
 * maker's TB is 10^12 bytes and the TiB an operating system reports is
 * 2^40 bytes, so both are shown.
 *
 * Capacity per set. A set is the group of disks one redundancy scheme covers:
 * the whole array for RAID 0, 1, 5 and 6, one mirror pair for RAID 10, and
 * one span for RAID 50 and 60. Every disk in a set contributes only as much
 * as the smallest disk in it, so with k disks of which the smallest is m:
 *
 *     RAID 0 or JBOD      k * m  (JBOD: the plain sum, nothing is limited)
 *     RAID 1              m      (every disk holds the same data)
 *     RAID 5 / span of 50 (k - 1) * m
 *     RAID 6 / span of 60 (k - 2) * m
 *     RAID 10 pair        m
 *
 * and the array holds the sum of its sets. For the levels with several sets
 * the disks are sorted largest first and cut into consecutive groups. For
 * groups of equal size that is the arrangement with the least waste, which
 * the unit tests confirm by trying every grouping on small arrays.
 *
 * A controller that stripes strictly across sets gives every set the
 * capacity of the smallest one. That figure is reported as well, because it
 * is lower whenever the sets are not identical.
 *
 * Fault tolerance. "Worst" is the number of failures the array survives
 * whichever disks they hit, "best" is the most it can survive if they land
 * in the most favorable places. They differ only for RAID 10, 50 and 60.
 *
 * Throughput is a ratio to one disk, ideal and ignoring the controller and
 * the bus. Sequential figures count the disks that carry data: a parity
 * layout spends 1 disk's worth (RAID 5) or 2 (RAID 6) of every set on
 * parity. Random reads can use every spindle. A small random write costs
 * the write penalty in disk operations: 1 for RAID 0 and JBOD, the number
 * of copies for a mirror, 2 for RAID 10, 4 for RAID 5 (read old data and old
 * parity, write both) and 6 for RAID 6 (the same with two parities), so the
 * random write rate is disks divided by penalty.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ------------------------------------------------------------- levels */

export type LevelId = "jbod" | "raid0" | "raid1" | "raid5" | "raid6" | "raid10" | "raid50" | "raid60";

export interface LevelInfo {
  id: LevelId;
  label: string;
  /** Fewest disks in one set: the whole array, a mirror pair, or a span. */
  minPerSet: number;
  /** Fewest disks for the whole array, with two spans where the level has spans. */
  minDisks: number;
  usesSpans: boolean;
  /** One line on how the level lays data out. */
  layout: string;
}

export const LEVELS: LevelInfo[] = [
  {
    id: "jbod",
    label: "JBOD",
    minPerSet: 1,
    minDisks: 1,
    usesSpans: false,
    layout: "Each disk stands alone, or the disks are joined end to end. No striping and no redundancy.",
  },
  {
    id: "raid0",
    label: "RAID 0",
    minPerSet: 2,
    minDisks: 2,
    usesSpans: false,
    layout: "Data is striped across every disk. No redundancy.",
  },
  {
    id: "raid1",
    label: "RAID 1",
    minPerSet: 2,
    minDisks: 2,
    usesSpans: false,
    layout: "Every disk holds a full copy. With more than two disks it is an n-way mirror, which some controllers do not offer.",
  },
  {
    id: "raid5",
    label: "RAID 5",
    minPerSet: 3,
    minDisks: 3,
    usesSpans: false,
    layout: "Striping with one parity block per stripe, rotated across the disks.",
  },
  {
    id: "raid6",
    label: "RAID 6",
    minPerSet: 4,
    minDisks: 4,
    usesSpans: false,
    layout: "Striping with two parity blocks per stripe, rotated across the disks.",
  },
  {
    id: "raid10",
    label: "RAID 10",
    minPerSet: 2,
    minDisks: 4,
    usesSpans: false,
    layout: "A stripe across mirrored pairs.",
  },
  {
    id: "raid50",
    label: "RAID 50",
    minPerSet: 3,
    minDisks: 6,
    usesSpans: true,
    layout: "A stripe across two or more RAID 5 spans.",
  },
  {
    id: "raid60",
    label: "RAID 60",
    minPerSet: 4,
    minDisks: 8,
    usesSpans: true,
    layout: "A stripe across two or more RAID 6 spans.",
  },
];

const LEVEL_BY_ID = new Map<LevelId, LevelInfo>(LEVELS.map((l) => [l.id, l]));

export function levelInfo(id: LevelId): LevelInfo {
  return LEVEL_BY_ID.get(id) as LevelInfo;
}

/** Capacity limits so a typo cannot ask for an absurd amount of work. */
export const MAX_DISKS = 256;
export const MAX_SPANS = 64;
export const MAX_LIST_CHARS = 2000;
/** 10^18 bytes, a million TB, far beyond any single disk. */
export const MAX_DISK_BYTES = 10n ** 18n;

/* -------------------------------------------------------------- units */

export type Unit = "GB" | "TB" | "GiB" | "TiB";

export const UNIT_BYTES: Record<Unit, bigint> = {
  GB: 10n ** 9n,
  TB: 10n ** 12n,
  GiB: 2n ** 30n,
  TiB: 2n ** 40n,
};

export const UNITS: Unit[] = ["GB", "TB", "GiB", "TiB"];

const TB = UNIT_BYTES.TB;
const TIB = UNIT_BYTES.TiB;

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * value / unit, rounded half up, with thousands separators and no trailing
 * zeros. Two decimals down to a hundredth of a unit, then more, so 5 GB in TB
 * does not read as zero. A nonzero value too small for that shows as "<".
 */
export function formatScaled(value: bigint, unit: bigint, decimals?: number): string {
  if (value === 0n) return "0";
  let places = decimals;
  if (places === undefined) {
    if (value * 100n >= unit) places = 2;
    else if (value * 10000n >= unit) places = 4;
    else places = 6;
  }
  const scale = 10n ** BigInt(places);
  const scaled = (value * scale * 2n + unit) / (unit * 2n);
  // A nonzero value must not read as zero.
  if (scaled === 0n) return `<0.${"0".repeat(Math.max(places, 1) - 1)}1`;
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");
  return `${group(whole.toString())}${frac ? `.${frac}` : ""}`;
}

export function formatTB(bytes: bigint): string {
  return formatScaled(bytes, TB);
}

export function formatTiB(bytes: bigint): string {
  return formatScaled(bytes, TIB);
}

/** A ratio as a percentage with one decimal, such as 71.4 or 75. */
export function formatPercent(fraction: number): string {
  const text = (fraction * 100).toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** A multiplier such as 1.5 or 6, to at most two decimals. */
export function formatMultiplier(value: number): string {
  const text = value.toFixed(2);
  return text.replace(/\.?0+$/, "");
}

/* ------------------------------------------------------------ parsing */

export type Field = "count" | "size" | "mixed" | "spans";

export interface Failure {
  ok: false;
  field: Field;
  message: string;
}

/** Digits with an optional fraction: 8, 7.68, .5. Commas are refused because 1,5 is ambiguous. */
function parseSizeToken(token: string, unit: Unit, field: Field): { ok: true; bytes: bigint } | Failure {
  const text = token.trim();
  if (text === "") return { ok: false, field, message: "Enter a disk size, such as 8 or 7.68." };
  if (text.length > 30) return { ok: false, field, message: "That number is too long. Enter a plain size such as 8 or 7.68." };
  if (text.includes(",")) {
    return { ok: false, field, message: "Use a point for a fraction, as in 7.68. Commas are not read as separators." };
  }
  const match = /^(\d*)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[1] === "" && match[2] === undefined)) {
    return { ok: false, field, message: `"${text}" is not a size. Enter a plain positive number such as 8 or 7.68.` };
  }
  const whole = match[1] === "" ? 0n : BigInt(match[1]);
  const fraction = match[2] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = whole * denominator + (fraction === "" ? 0n : BigInt(fraction));
  const bytes = (numerator * UNIT_BYTES[unit]) / denominator;
  if (bytes <= 0n) return { ok: false, field, message: "A disk size must be greater than zero." };
  if (bytes > MAX_DISK_BYTES) {
    return { ok: false, field, message: "That disk is larger than 1,000,000 TB. Check the number and the unit." };
  }
  return { ok: true, bytes };
}

export function parseCount(raw: string): { ok: true; count: number } | Failure {
  const text = raw.trim();
  if (text === "") return { ok: false, field: "count", message: "Enter the number of disks." };
  if (!/^\d+$/.test(text)) {
    return { ok: false, field: "count", message: "The number of disks must be a whole number, such as 8." };
  }
  if (text.length > 6) return { ok: false, field: "count", message: `This tool handles up to ${MAX_DISKS} disks.` };
  const count = Number(text);
  if (count < 1) return { ok: false, field: "count", message: "Enter at least 1 disk." };
  if (count > MAX_DISKS) return { ok: false, field: "count", message: `This tool handles up to ${MAX_DISKS} disks.` };
  return { ok: true, count };
}

export function parseSpans(raw: string): { ok: true; spans: number } | Failure {
  const text = raw.trim();
  if (text === "") return { ok: false, field: "spans", message: "Enter the number of spans." };
  if (!/^\d+$/.test(text) || text.length > 6) {
    return { ok: false, field: "spans", message: "The number of spans must be a whole number, such as 2." };
  }
  const spans = Number(text);
  if (spans < 2) return { ok: false, field: "spans", message: "A striped set of spans needs at least 2 spans." };
  if (spans > MAX_SPANS) return { ok: false, field: "spans", message: `This tool handles up to ${MAX_SPANS} spans.` };
  return { ok: true, spans };
}

/**
 * Sizes as a list: "4, 4, 8" or with counts, "4x2, 8x4". Commas, semicolons
 * and whitespace separate entries, and x, X, * or the multiplication sign
 * joins a size to its count.
 */
export function parseSizeList(raw: string, unit: Unit): { ok: true; sizes: bigint[] } | Failure {
  if (raw.length > MAX_LIST_CHARS) {
    return { ok: false, field: "mixed", message: `That list is longer than ${MAX_LIST_CHARS.toLocaleString("en-US")} characters. Use the size x count form, such as 8x24.` };
  }
  const tokens = raw.split(/[\s,;]+/).filter((t) => t !== "");
  if (tokens.length === 0) {
    return { ok: false, field: "mixed", message: "List the disk sizes, such as 4, 4, 8 or 4x2, 8x4." };
  }
  const sizes: bigint[] = [];
  for (const token of tokens) {
    const at = token.search(/[xX*×]/);
    let sizeText = token;
    let times = 1;
    if (at >= 0) {
      sizeText = token.slice(0, at);
      const countText = token.slice(at + 1);
      if (!/^\d+$/.test(countText) || countText.length > 6) {
        return { ok: false, field: "mixed", message: `"${token}" needs a whole number after the x, as in 8x4.` };
      }
      times = Number(countText);
      if (times < 1) return { ok: false, field: "mixed", message: `"${token}" repeats a disk zero times.` };
    }
    const parsed = parseSizeToken(sizeText, unit, "mixed");
    if (!parsed.ok) return parsed;
    if (sizes.length + times > MAX_DISKS) {
      return { ok: false, field: "mixed", message: `That is more than ${MAX_DISKS} disks. This tool handles up to ${MAX_DISKS}.` };
    }
    for (let i = 0; i < times; i += 1) sizes.push(parsed.bytes);
  }
  return { ok: true, sizes };
}

export interface SetupInput {
  mode: "same" | "mixed";
  count: string;
  size: string;
  mixed: string;
  unit: Unit;
}

/** Turns the form's text into one list of disk sizes in bytes. */
export function resolveSizes(input: SetupInput): { ok: true; sizes: bigint[] } | Failure {
  if (input.mode === "mixed") return parseSizeList(input.mixed, input.unit);
  const count = parseCount(input.count);
  if (!count.ok) return count;
  const size = parseSizeToken(input.size, input.unit, "size");
  if (!size.ok) return size;
  return { ok: true, sizes: Array.from({ length: count.count }, () => size.bytes) };
}

/* -------------------------------------------------------- calculation */

export type SetKind = "jbod" | "stripe" | "mirror" | "raid5" | "raid6";

export interface SetPlan {
  index: number;
  kind: SetKind;
  /** Disk sizes in this set, largest first. */
  sizes: bigint[];
  /** The smallest disk, which limits every disk in the set (not JBOD). */
  minSize: bigint;
  raw: bigint;
  usable: bigint;
}

export interface Perf {
  seqRead: number;
  seqWrite: number;
  rndRead: number;
  /** Disks divided by the write penalty. */
  rndWrite: number;
  /** Mirror reads reach their figure only when requests are spread across the copies. */
  readIsUpperBound: boolean;
}

export interface RaidResult {
  ok: true;
  level: LevelInfo;
  diskCount: number;
  /** Sets in the array: spans for 50 and 60, mirror pairs for 10, otherwise 1. */
  setCount: number;
  perSet: number;
  sets: SetPlan[];
  raw: bigint;
  usable: bigint;
  /** Space on larger disks that the smallest disk of their set leaves unused. */
  mismatchWaste: bigint;
  /** Space spent on mirrors or parity. */
  redundancy: bigint;
  /** Usable divided by raw, from 0 to 1. */
  efficiency: number;
  tolerance: { worst: number; best: number };
  /** Chance that a second, random failure is fatal after the first. Only for RAID 10 and 50. */
  secondFailureFatal: number | null;
  penalty: number;
  /** One line on what a small write turns into. */
  penaltyDetail: string;
  perf: Perf;
  /** For 10, 50 and 60 with unequal sets: the capacity if every set is cut to the smallest. */
  strictStripeUsable: bigint | null;
  minDisks: number;
}

function descending(sizes: bigint[]): bigint[] {
  return [...sizes].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
}

function minOf(sizes: bigint[]): bigint {
  return sizes.reduce((m, s) => (s < m ? s : m));
}

function sum(sizes: bigint[]): bigint {
  return sizes.reduce((t, s) => t + s, 0n);
}

/** Spans that divide n evenly and leave at least `minPerSpan` disks in each, at least 2. */
export function validSpanCounts(diskCount: number, minPerSpan: number): number[] {
  const out: number[] = [];
  for (let s = 2; s <= MAX_SPANS && s * minPerSpan <= diskCount; s += 1) {
    if (diskCount % s === 0) out.push(s);
  }
  return out;
}

function listNumbers(values: number[]): string {
  if (values.length === 1) return String(values[0]);
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

function parityOf(kind: SetKind, k: number): number {
  if (kind === "raid5") return 1;
  if (kind === "raid6") return 2;
  if (kind === "mirror") return k - 1;
  return 0;
}

function writePenalty(level: LevelId, perSet: number): { penalty: number; detail: string } {
  switch (level) {
    case "jbod":
    case "raid0":
      return { penalty: 1, detail: "1 operation: the block is written once, to the one disk that holds it." };
    case "raid1":
      return {
        penalty: perSet,
        detail: `${perSet} operations: the block is written to every one of the ${perSet} disks.`,
      };
    case "raid10":
      return { penalty: 2, detail: "2 operations: the block is written to both disks of one mirror pair." };
    case "raid5":
    case "raid50":
      return {
        penalty: 4,
        detail: "4 operations: read the old data and the old parity, then write the new data and the new parity.",
      };
    default:
      return {
        penalty: 6,
        detail: "6 operations: read the old data and both old parities, then write the new data and both new parities.",
      };
  }
}

export function calculate(levelId: LevelId, sizes: bigint[], spansWanted: number): RaidResult | Failure {
  const level = levelInfo(levelId);
  const n = sizes.length;
  if (n === 0) return { ok: false, field: "count", message: "Enter at least 1 disk." };
  if (n > MAX_DISKS) return { ok: false, field: "count", message: `This tool handles up to ${MAX_DISKS} disks.` };

  let spans = 1;
  if (level.usesSpans) {
    spans = spansWanted;
    if (!Number.isInteger(spans) || spans < 2) {
      return { ok: false, field: "spans", message: "A striped set of spans needs at least 2 spans." };
    }
    if (n < level.minDisks) {
      return {
        ok: false,
        field: "count",
        message: `${level.label} needs at least ${level.minDisks} disks: 2 spans of ${level.minPerSet}. ${n} ${n === 1 ? "disk is" : "disks are"} not enough.`,
      };
    }
    if (n % spans !== 0) {
      const fits = validSpanCounts(n, level.minPerSet);
      return {
        ok: false,
        field: "spans",
        message: `${level.label} needs the same number of disks in every span, and ${n} disks do not divide into ${spans} spans.${
          fits.length > 0 ? ` Spans that fit ${n} disks: ${listNumbers(fits)}.` : ""
        }`,
      };
    }
    if (n / spans < level.minPerSet) {
      const fits = validSpanCounts(n, level.minPerSet);
      return {
        ok: false,
        field: "spans",
        message: `Each ${level.label} span needs at least ${level.minPerSet} disks, and ${spans} spans of ${n} disks leaves ${n / spans}.${
          fits.length > 0 ? ` Spans that fit ${n} disks: ${listNumbers(fits)}.` : ""
        }`,
      };
    }
  } else if (n < level.minDisks) {
    return {
      ok: false,
      field: "count",
      message: `${level.label} needs at least ${level.minDisks} disks. ${n} ${n === 1 ? "disk is" : "disks are"} not enough.`,
    };
  }
  if (level.id === "raid10" && n % 2 !== 0) {
    return {
      ok: false,
      field: "count",
      message:
        "RAID 10 pairs the disks into mirrors, so the count must be even. Linux md also offers a raid10 layout that accepts an odd count, but hardware controllers do not.",
    };
  }

  const sorted = descending(sizes);
  const sets: SetPlan[] = [];
  const addSet = (kind: SetKind, group: bigint[]) => {
    const minSize = minOf(group);
    const k = BigInt(group.length);
    let usable: bigint;
    if (kind === "jbod") usable = sum(group);
    else if (kind === "stripe") usable = k * minSize;
    else if (kind === "mirror") usable = minSize;
    else if (kind === "raid5") usable = (k - 1n) * minSize;
    else usable = (k - 2n) * minSize;
    sets.push({ index: sets.length, kind, sizes: group, minSize, raw: sum(group), usable });
  };

  let perSet: number;
  switch (level.id) {
    case "jbod":
      perSet = n;
      addSet("jbod", sorted);
      break;
    case "raid0":
      perSet = n;
      addSet("stripe", sorted);
      break;
    case "raid1":
      perSet = n;
      addSet("mirror", sorted);
      break;
    case "raid5":
      perSet = n;
      addSet("raid5", sorted);
      break;
    case "raid6":
      perSet = n;
      addSet("raid6", sorted);
      break;
    case "raid10":
      perSet = 2;
      for (let i = 0; i < n; i += 2) addSet("mirror", sorted.slice(i, i + 2));
      break;
    default: {
      perSet = n / spans;
      const kind: SetKind = level.id === "raid50" ? "raid5" : "raid6";
      for (let i = 0; i < n; i += perSet) addSet(kind, sorted.slice(i, i + perSet));
    }
  }

  const raw = sum(sizes);
  const usable = sets.reduce((t, s) => t + s.usable, 0n);
  // What each set could hold if every disk were as large as its smallest.
  const limited = sets.reduce((t, s) => t + s.minSize * BigInt(s.sizes.length), 0n);
  const mismatchWaste = level.id === "jbod" ? 0n : raw - limited;
  const redundancy = level.id === "jbod" ? 0n : limited - usable;

  const setCount = sets.length;
  const { penalty, detail } = writePenalty(level.id, perSet);

  let tolerance: { worst: number; best: number };
  switch (level.id) {
    case "jbod":
    case "raid0":
      tolerance = { worst: 0, best: 0 };
      break;
    case "raid1":
      tolerance = { worst: n - 1, best: n - 1 };
      break;
    case "raid5":
      tolerance = { worst: 1, best: 1 };
      break;
    case "raid6":
      tolerance = { worst: 2, best: 2 };
      break;
    case "raid10":
      tolerance = { worst: 1, best: n / 2 };
      break;
    case "raid50":
      tolerance = { worst: 1, best: spans };
      break;
    default:
      tolerance = { worst: 2, best: 2 * spans };
  }

  let secondFailureFatal: number | null = null;
  if (level.id === "raid10") secondFailureFatal = 1 / (n - 1);
  else if (level.id === "raid50") secondFailureFatal = (perSet - 1) / (n - 1);

  let perf: Perf;
  switch (level.id) {
    case "jbod":
      perf = { seqRead: 1, seqWrite: 1, rndRead: 1, rndWrite: 1, readIsUpperBound: false };
      break;
    case "raid0":
      perf = { seqRead: n, seqWrite: n, rndRead: n, rndWrite: n, readIsUpperBound: false };
      break;
    case "raid1":
      perf = { seqRead: n, seqWrite: 1, rndRead: n, rndWrite: n / penalty, readIsUpperBound: true };
      break;
    case "raid5":
      perf = { seqRead: n - 1, seqWrite: n - 1, rndRead: n, rndWrite: n / penalty, readIsUpperBound: false };
      break;
    case "raid6":
      perf = { seqRead: n - 2, seqWrite: n - 2, rndRead: n, rndWrite: n / penalty, readIsUpperBound: false };
      break;
    case "raid10":
      perf = { seqRead: n, seqWrite: n / 2, rndRead: n, rndWrite: n / penalty, readIsUpperBound: true };
      break;
    case "raid50":
      perf = { seqRead: n - spans, seqWrite: n - spans, rndRead: n, rndWrite: n / penalty, readIsUpperBound: false };
      break;
    default:
      perf = { seqRead: n - 2 * spans, seqWrite: n - 2 * spans, rndRead: n, rndWrite: n / penalty, readIsUpperBound: false };
  }

  let strictStripeUsable: bigint | null = null;
  if (setCount > 1) {
    const smallest = sets.reduce((m, s) => (s.usable < m ? s.usable : m), sets[0].usable);
    const strict = smallest * BigInt(setCount);
    if (strict !== usable) strictStripeUsable = strict;
  }

  return {
    ok: true,
    level,
    diskCount: n,
    setCount,
    perSet,
    sets,
    raw,
    usable,
    mismatchWaste,
    redundancy,
    efficiency: Number((usable * 1000000n) / raw) / 1000000,
    tolerance,
    secondFailureFatal,
    penalty,
    penaltyDetail: detail,
    perf,
    strictStripeUsable,
    minDisks: level.minDisks,
  };
}

/* --------------------------------------------------------- comparison */

export interface ComparisonRow {
  level: LevelInfo;
  result: RaidResult | null;
  /** Why the level cannot be built from these disks. */
  reason: string | null;
}

/** Every level applied to the same disks, with the spans value used for RAID 50 and 60. */
export function compareLevels(sizes: bigint[], spans: number): ComparisonRow[] {
  return LEVELS.map((level) => {
    const result = calculate(level.id, sizes, spans);
    return result.ok ? { level, result, reason: null } : { level, result: null, reason: result.message };
  });
}

/* ------------------------------------------------------------ diagram */

export interface DiskBar {
  size: bigint;
  /** Height as a percentage of the largest disk, 0 to 100. */
  heightPct: number;
  /** Shares of the bar, in percent of this disk, summing to 100. */
  dataPct: number;
  redundancyPct: number;
  unusedPct: number;
}

export interface SetBars {
  set: SetPlan;
  bars: DiskBar[];
}

/**
 * Each disk split into the part that holds data, the part spent on mirrors or
 * parity, and the part its set cannot use because a smaller disk limits it.
 */
export function diskBars(result: RaidResult): SetBars[] {
  let largest = 0n;
  for (const set of result.sets) for (const size of set.sizes) if (size > largest) largest = size;
  return result.sets.map((set) => {
    const k = set.sizes.length;
    const share = parityOf(set.kind, k) / k;
    const bars = set.sizes.map((size): DiskBar => {
      const used = set.kind === "jbod" ? size : set.minSize;
      const usedFrac = Number((used * 1000000n) / size) / 1000000;
      const redundancyPct = usedFrac * share * 100;
      const dataPct = usedFrac * (1 - share) * 100;
      return {
        size,
        heightPct: Number((size * 10000n) / largest) / 100,
        dataPct,
        redundancyPct,
        unusedPct: Math.max(0, 100 - dataPct - redundancyPct),
      };
    });
    return { set, bars };
  });
}

/** Most disks the diagram draws, so a 256 disk array stays a readable page. */
export const MAX_DIAGRAM_DISKS = 64;

export interface DiagramWindow {
  sets: SetBars[];
  /** Disks drawn. */
  shown: number;
  /** Disks in the array. */
  total: number;
  truncated: boolean;
}

/** The first `limit` disks in order, cutting the last set short if it straddles the limit. */
export function diagramWindow(sets: SetBars[], limit: number = MAX_DIAGRAM_DISKS): DiagramWindow {
  const total = sets.reduce((t, s) => t + s.bars.length, 0);
  const out: SetBars[] = [];
  let shown = 0;
  for (const entry of sets) {
    if (shown >= limit) break;
    const bars = entry.bars.slice(0, limit - shown);
    out.push({ set: entry.set, bars });
    shown += bars.length;
  }
  return { sets: out, shown, total, truncated: shown < total };
}

/** Largest set the cell-by-cell layout sketch is drawn for. */
export const MAX_SKETCH_DISKS = 10;

export interface Sketch {
  /** Rows of cell labels, one cell per disk. */
  rows: string[][];
  caption: string;
}

/**
 * A common layout for the first few stripes, as in Linux md's left-symmetric
 * default: parity moves one disk to the left on each row. Other
 * implementations rotate differently. Capacity and tolerance do not change.
 */
export function layoutSketch(levelId: LevelId, diskCount: number, perSet: number): Sketch | null {
  const k = levelId === "raid10" ? diskCount : perSet;
  if (levelId === "jbod" || k < 2 || k > MAX_SKETCH_DISKS) return null;

  const rows: string[][] = [];
  switch (levelId) {
    case "raid0": {
      for (let r = 0; r < 3; r += 1) rows.push(Array.from({ length: k }, (_, c) => `D${r * k + c}`));
      return { rows, caption: "Blocks are written round-robin across the disks. D is a data block, numbered in the order written." };
    }
    case "raid1": {
      for (let r = 0; r < 3; r += 1) rows.push(Array.from({ length: k }, () => `D${r}`));
      return { rows, caption: "Every disk holds the same blocks. D is a data block." };
    }
    case "raid10": {
      const pairs = k / 2;
      for (let r = 0; r < 3; r += 1) {
        rows.push(Array.from({ length: k }, (_, c) => `D${r * pairs + Math.floor(c / 2)}`));
      }
      return { rows, caption: "Disks sit in mirrored pairs, and blocks are striped across the pairs. D is a data block." };
    }
    case "raid5":
    case "raid50": {
      const count = Math.min(k, 5);
      let next = 0;
      for (let r = 0; r < count; r += 1) {
        const parity = (k - 1 - r + k * count) % k;
        const row = new Array<string>(k).fill("");
        row[parity] = "P";
        for (let i = 1; i < k; i += 1) row[(parity + i) % k] = `D${next++}`;
        rows.push(row);
      }
      return {
        rows,
        caption:
          levelId === "raid50"
            ? "Span 1 shown. Every span uses this layout and data is striped across the spans. P is parity, D is a data block."
            : "P is parity and D is a data block. The parity block moves one disk left on each row.",
      };
    }
    default: {
      const count = Math.min(k, 5);
      let next = 0;
      for (let r = 0; r < count; r += 1) {
        const p = (k - 2 - r + k * count) % k;
        const q = (p + 1) % k;
        const row = new Array<string>(k).fill("");
        row[p] = "P";
        row[q] = "Q";
        for (let i = 1; i < k - 1; i += 1) row[(q + i) % k] = `D${next++}`;
        rows.push(row);
      }
      return {
        rows,
        caption:
          levelId === "raid60"
            ? "Span 1 shown. Every span uses this layout and data is striped across the spans. P and Q are the two parities, D is a data block."
            : "P and Q are the two parities and D is a data block. Both move one disk left on each row.",
      };
    }
  }
}
