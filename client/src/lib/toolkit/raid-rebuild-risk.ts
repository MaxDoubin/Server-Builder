/**
 * RAID rebuild risk, in the classic simplified model.
 *
 * The model treats every bit read during a rebuild as an independent trial
 * that fails with probability 1/R, where R is the drive's unrecoverable read
 * error (URE) specification: "1 sector per 10^14 bits read" becomes
 * p = 10^-14. The chance of at least one error across n bits is then
 *
 *     P = 1 - (1 - p)^n
 *
 * which has to be computed as -expm1(n * log1p(-p)). Written the obvious
 * way, 1 - p is rounded to a double before the power is taken: at p = 1e-16
 * it becomes 1 - 1.11e-16, an 11 percent error in p, and below about
 * 5.6e-17 it becomes exactly 1 and the answer is zero at every drive size.
 *
 * The RAID 6 single-failure case needs two errors at the same stripe
 * position on two different surviving disks before a block is lost, which
 * is a binomial tail evaluated per 4 KiB sector row. Its value is often
 * near 1e-18, far below what 1 - P0 - P1 can resolve, so the tail is summed
 * term by term in log space when it is small.
 *
 * Pure functions only, no React and no DOM, so all of it can be unit tested.
 */

/* ----------------------------------------------------------------- parsing */

export type Parsed = { kind: "empty" } | { kind: "ok"; value: number } | { kind: "error"; message: string };

/** Longer than this is not a number anybody typed on purpose. */
export const MAX_INPUT_LENGTH = 40;

const PLAIN = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d*)?$/;

interface NumberRule {
  /** Field name at the start of a sentence, such as "Disk size". */
  label: string;
  min: number;
  max: number;
  /** When false, the minimum itself is refused (a strict greater-than). */
  minInclusive?: boolean;
  integer?: boolean;
  /** Appended to limits in messages, such as " MB/s". */
  unit?: string;
  example: string;
}

function fmtLimit(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/**
 * Parses a plain positive number: 12, 2.5, .5, 1e3 or 1,000. Commas count
 * only as thousands separators, because "1,5" could mean either one and a
 * half or fifteen and guessing wrong is worse than asking.
 */
export function parseNumber(raw: string, rule: NumberRule): Parsed {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (trimmed.length > MAX_INPUT_LENGTH) {
    return { kind: "error", message: `${rule.label} is longer than ${MAX_INPUT_LENGTH} characters. Enter a plain number such as ${rule.example}.` };
  }
  let text = trimmed.replace(/[\s_]/g, "");
  if (text.startsWith("+")) text = text.slice(1);
  if (text.startsWith("-")) return { kind: "error", message: `${rule.label} cannot be negative.` };
  if (text.includes(",")) {
    if (!GROUPED.test(text)) {
      return { kind: "error", message: "Commas are read as thousands separators, as in 1,000. For a fraction, use a point: 2.5." };
    }
    text = text.replace(/,/g, "");
  }
  if (!PLAIN.test(text)) return { kind: "error", message: `${rule.label} must be a plain number, such as ${rule.example}.` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "error", message: `${rule.label} is too large.` };
  if (rule.integer && !Number.isInteger(value)) return { kind: "error", message: `${rule.label} must be a whole number.` };
  const unit = rule.unit ?? "";
  if (rule.minInclusive === false ? value <= rule.min : value < rule.min) {
    return {
      kind: "error",
      message:
        rule.minInclusive === false
          ? `${rule.label} must be greater than ${fmtLimit(rule.min)}${unit}.`
          : `${rule.label} must be at least ${fmtLimit(rule.min)}${unit}.`,
    };
  }
  if (value > rule.max) return { kind: "error", message: `${rule.label} can be at most ${fmtLimit(rule.max)}${unit}.` };
  return { kind: "ok", value };
}

/* ------------------------------------------------------------------ inputs */

export type SizeUnit = "GB" | "TB" | "TiB";

export const SIZE_UNITS: { id: SizeUnit; bytes: number; note: string }[] = [
  { id: "GB", bytes: 1e9, note: "1 GB is 10^9 bytes, the unit on a drive label." },
  { id: "TB", bytes: 1e12, note: "1 TB is 10^12 bytes, the unit on a drive label." },
  { id: "TiB", bytes: 2 ** 40, note: "1 TiB is 2^40 bytes, about 1.0995 TB, the unit most operating systems report." },
];

/** One disk larger than this is not a disk anyone can buy. */
export const MAX_DISK_BYTES = 1e15;
export const MAX_SURVIVORS = 1000;
export const MAX_SPEED_MBPS = 100_000;

/** The three specification classes the tool compares. */
export const URE_CLASSES: { exp: number; label: string; note: string }[] = [
  { exp: 14, label: "1 in 10^14", note: "Desktop and many NAS drives" },
  { exp: 15, label: "1 in 10^15", note: "Enterprise nearline and pro NAS drives" },
  { exp: 16, label: "1 in 10^16", note: "Enterprise 10K and 15K SAS drives" },
];

/**
 * The sector row a RAID 6 reconstruction works across. Advanced Format
 * drives have 4096-byte physical sectors, and Linux md reconstructs in
 * page-sized (4 KiB) stripe units.
 */
export const SECTOR_BYTES = 4096;

const YEAR_SECONDS = 365.25 * 86400;

export function parseDiskSize(raw: string, unit: SizeUnit): Parsed {
  const parsed = parseNumber(raw, { label: "Disk size", min: 0, minInclusive: false, max: 1e18, example: "12" });
  if (parsed.kind !== "ok") return parsed;
  const bytes = parsed.value * (SIZE_UNITS.find((u) => u.id === unit)?.bytes ?? 1e12);
  if (bytes > MAX_DISK_BYTES) return { kind: "error", message: "Disk size can be at most 1,000 TB (1 PB) per disk." };
  if (bytes < SECTOR_BYTES) return { kind: "error", message: "Disk size must be at least one 4 KiB sector." };
  return { kind: "ok", value: bytes };
}

export function parseSurvivors(raw: string): Parsed {
  return parseNumber(raw, { label: "Surviving disks", min: 1, max: MAX_SURVIVORS, integer: true, example: "7" });
}

export function parseSpeed(raw: string): Parsed {
  return parseNumber(raw, {
    label: "Rebuild speed",
    min: 0,
    minInclusive: false,
    max: MAX_SPEED_MBPS,
    unit: " MB/s",
    example: "150",
  });
}

/** Annualized failure rate in percent. Empty means "leave this out". */
export function parseAfr(raw: string): Parsed {
  return parseNumber(raw, { label: "Annualized failure rate", min: 0, max: 99, unit: " percent", example: "1.5" });
}

/* ------------------------------------------------------------ probability */

/**
 * P(at least one event) over n independent trials of probability p, and its
 * complement, both computed without cancellation: log(1 - p)^n is
 * n * log1p(-p), and 1 - e^x is -expm1(x).
 */
export function atLeastOne(p: number, n: number): { fail: number; survive: number } {
  if (!(p > 0) || !(n > 0)) return { fail: 0, survive: 1 };
  if (p >= 1) return { fail: 1, survive: 0 };
  const logSurvive = n * Math.log1p(-p);
  return { fail: -Math.expm1(logSurvive), survive: Math.exp(logSurvive) };
}

/**
 * P(X >= 2) for X ~ Binomial(n, s).
 *
 * For a small mean the tail is summed from k = 2 upward in log space, where
 * each term is at most mean / (k + 1) times the one before, so a few dozen
 * terms reach full double precision. For a larger mean, 1 - P(0) - P(1) is
 * at least a few thousandths and the direct form is accurate.
 */
export function atLeastTwo(n: number, s: number): number {
  if (!(n >= 2) || !(s > 0)) return 0;
  if (s >= 1) return 1;
  const l1 = Math.log1p(-s);
  if (n * s < 0.1) {
    const ls = Math.log(s);
    let logC = Math.log(n) + Math.log(n - 1) - Math.LN2;
    let sum = 0;
    for (let k = 2; k <= n && k <= 80; k += 1) {
      if (k > 2) logC += Math.log(n - k + 1) - Math.log(k);
      const term = Math.exp(logC + k * ls + (n - k) * l1);
      sum += term;
      if (term <= sum * 1e-17) break;
    }
    return Math.min(1, sum);
  }
  const p0 = Math.exp(n * l1);
  const p1 = n * s * Math.exp((n - 1) * l1);
  return Math.min(1, Math.max(0, 1 - p0 - p1));
}

/* ---------------------------------------------------------------- analysis */

export interface RaidInputs {
  diskBytes: number;
  survivors: number;
  /** URE specification exponent: 14 means one error per 10^14 bits. */
  ureExp: number;
  speedMBps: number;
  /** Annualized failure rate as a fraction, or null to leave it out. */
  afr: number | null;
}

export interface Scenario {
  id: "raid5" | "raid6-one" | "raid6-two";
  level: string;
  situation: string;
  arrayDisks: number;
  minSurvivors: number;
  applicable: boolean;
  /** What has to go wrong for a block to be lost. */
  lossRule: string;
  fail: number;
  survive: number;
}

export interface RaidResult {
  rebuildSeconds: number;
  readBytes: number;
  bitsRead: number;
  expectedUres: number;
  /** P(at least one URE over everything read), the RAID 5 figure. */
  anyUre: { fail: number; survive: number };
  /** P(two UREs at the same sector row), the RAID 6 single-failure figure. */
  pairUre: { fail: number; survive: number };
  /** P(another surviving disk fails outright during the rebuild), or null. */
  secondFailure: number | null;
  scenarios: Scenario[];
}

/** Rebuild time: the replacement disk is written end to end at the given rate (decimal MB/s). */
export function rebuildSeconds(diskBytes: number, speedMBps: number): number {
  return diskBytes / (speedMBps * 1e6);
}

/** P(at least one URE) while reading `bits` bits from drives rated 1 in 10^exp. */
export function ureProbability(bits: number, exp: number): { fail: number; survive: number } {
  return atLeastOne(10 ** -exp, bits);
}

/**
 * P(some sector row loses two of its `survivors` sectors to UREs), which is
 * what it takes to lose a block in a RAID 6 set that is already missing one
 * disk. Each 4 KiB sector fails with 1 - (1 - p)^32768.
 */
export function pairProbability(diskBytes: number, survivors: number, exp: number): { fail: number; survive: number } {
  const sector = atLeastOne(10 ** -exp, SECTOR_BYTES * 8).fail;
  const perRow = atLeastTwo(survivors, sector);
  return atLeastOne(perRow, Math.ceil(diskBytes / SECTOR_BYTES));
}

/**
 * P(at least one of `disks` drives fails outright within `seconds`), with
 * each drive's lifetime exponential at the rate implied by its AFR:
 * AFR = 1 - e^(-lambda * 1 year).
 */
export function secondFailureProbability(afr: number, disks: number, seconds: number): number {
  if (!(afr > 0) || !(disks > 0) || !(seconds > 0)) return 0;
  if (afr >= 1) return 1;
  const lambda = -Math.log1p(-afr) / YEAR_SECONDS;
  return -Math.expm1(-disks * lambda * seconds);
}

export function analyze(input: RaidInputs): RaidResult {
  const { diskBytes, survivors, ureExp, speedMBps, afr } = input;
  const seconds = rebuildSeconds(diskBytes, speedMBps);
  const readBytes = diskBytes * survivors;
  const bitsRead = readBytes * 8;
  const anyUre = ureProbability(bitsRead, ureExp);
  const pairUre = pairProbability(diskBytes, survivors, ureExp);

  const scenarios: Scenario[] = [
    {
      id: "raid5",
      level: "RAID 5",
      situation: "one disk failed",
      arrayDisks: survivors + 1,
      minSurvivors: 2,
      applicable: survivors >= 2,
      lossRule: "Any single URE: no redundancy is left to rebuild that stripe from.",
      ...anyUre,
    },
    {
      id: "raid6-one",
      level: "RAID 6",
      situation: "one disk failed",
      arrayDisks: survivors + 1,
      minSurvivors: 3,
      applicable: survivors >= 3,
      lossRule: "Two UREs in the same 4 KiB stripe row on different disks. One is rebuilt from the second parity.",
      ...pairUre,
    },
    {
      id: "raid6-two",
      level: "RAID 6",
      situation: "two disks failed",
      arrayDisks: survivors + 2,
      minSurvivors: 2,
      applicable: survivors >= 2,
      lossRule: "Any single URE, the same exposure as degraded RAID 5.",
      ...anyUre,
    },
  ];

  return {
    rebuildSeconds: seconds,
    readBytes,
    bitsRead,
    expectedUres: bitsRead / 10 ** ureExp,
    anyUre,
    pairUre,
    secondFailure: afr === null ? null : secondFailureProbability(afr, survivors, seconds),
    scenarios,
  };
}

/* -------------------------------------------------------------- formatting */

/** "61.7%", "0.0877%", "99.970%", "< 0.000001%". Three significant digits where that means something. */
export function formatPercent(fail: number, survive: number): string {
  if (!(fail > 0)) return "0%";
  if (fail < 1e-8) return "< 0.000001%";
  if (fail < 0.999) {
    const pct = fail * 100;
    const decimals = Math.min(8, Math.max(0, 2 - Math.floor(Math.log10(pct))));
    return `${pct.toFixed(decimals)}%`;
  }
  const rest = survive * 100;
  if (!(rest >= 1e-6)) return "> 99.999999%";
  const decimals = Math.min(7, Math.max(1, 1 - Math.floor(Math.log10(rest))));
  return `${(100 - rest).toFixed(decimals)}%`;
}

const SCALES: [number, string][] = [
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
];

/** A count such as 1.6, 1,140, 2.35 million or 3.10 × 10^18. */
export function formatCount(x: number): string {
  if (!Number.isFinite(x)) return "more than 10^308";
  if (x < 10) return String(Number(x.toPrecision(2)));
  if (x < 1e6) return Number(x.toPrecision(3)).toLocaleString("en-US");
  if (x >= 1e15) {
    const exp = Math.floor(Math.log10(x));
    const mant = x / 10 ** exp;
    return `${mant.toFixed(2)} × 10^${exp}`;
  }
  for (const [scale, word] of SCALES) {
    if (x >= scale) return `${Number((x / scale).toPrecision(3))} ${word}`;
  }
  return String(x);
}

/** "about 1 in 1,140" for rare events, or the odds of a clean rebuild when failure is nearly certain. */
export function formatOdds(fail: number, survive: number): string | null {
  if (!(fail > 0)) return null;
  if (fail <= 0.5) return `about 1 in ${formatCount(1 / fail)}`;
  if (survive > 0 && survive < 0.1) return `a clean rebuild about 1 in ${formatCount(1 / survive)}`;
  return null;
}

/**
 * "10 h 25 min", "3 min 20 s", "2 days 4 h". Each branch rounds to its own
 * resolution first, so 3599.8 seconds reads "1 h" rather than "60 min".
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  if (seconds < 0.5) return "under 1 s";
  if (seconds < 59.5) return `${Math.round(seconds)} s`;
  if (seconds < 3599.5) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s ? `${m} min ${s} s` : `${m} min`;
  }
  if (seconds < 86370) {
    const total = Math.round(seconds / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  if (seconds > 100 * YEAR_SECONDS) return "more than 100 years";
  const total = Math.round(seconds / 3600);
  const d = Math.floor(total / 24);
  const h = total % 24;
  const days = `${d} ${d === 1 ? "day" : "days"}`;
  return h ? `${days} ${h} h` : days;
}

/** Bytes in decimal units, three significant digits: "84.0 TB". */
export function formatBytes(bytes: number): string {
  const units: [number, string][] = [
    [1e15, "PB"],
    [1e12, "TB"],
    [1e9, "GB"],
    [1e6, "MB"],
    [1e3, "kB"],
  ];
  for (const [scale, name] of units) {
    if (bytes >= scale) return `${Number((bytes / scale).toPrecision(3))} ${name}`;
  }
  return `${Math.round(bytes)} B`;
}

/** A plain number with up to three significant digits, in scientific form when very small or large. */
export function formatSig(x: number): string {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) return "--";
  const abs = Math.abs(x);
  if (abs < 1e-3 || abs >= 1e9) {
    const exp = Math.floor(Math.log10(abs));
    return `${(x / 10 ** exp).toFixed(2)} × 10^${exp}`;
  }
  return Number(x.toPrecision(3)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}
