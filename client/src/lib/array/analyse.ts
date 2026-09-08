/**
 * The arithmetic.
 *
 * Capacities are decimal terabytes throughout, because that is how disks are
 * sold and how every capacity conversation starts. The difference from tebibytes
 * is about 9 per cent and it is the single most common "where did my space go"
 * question, so it is stated rather than quietly applied.
 */

import { MIN_DISKS, type Analysis, type Array as DiskArray, type Level } from "./types";

const TB = 1e12;

/** Parity disks by level. RAID 10 is a special case: half the disks. */
export function parityDisksFor(level: Level, disks: number): number {
  switch (level) {
    case "raid0":
      return 0;
    case "raid1":
      return disks - 1;
    case "raid10":
      return Math.floor(disks / 2);
    case "raid5":
    case "raidz1":
      return 1;
    case "raid6":
    case "raidz2":
      return 2;
    case "raidz3":
      return 3;
  }
}

/**
 * Guaranteed simultaneous failures survived.
 *
 * RAID 10 is the interesting one and the reason this is not just "parity
 * disks". A ten-disk RAID 10 survives one failure for certain, survives up to
 * five if they land in different mirrors, and dies on the second if it lands
 * on the partner of the first. Quoting the best case as the tolerance is how
 * people end up surprised, so this returns the guarantee.
 */
export function toleranceFor(level: Level, disks: number): number {
  switch (level) {
    case "raid0":
      return 0;
    case "raid1":
      return disks - 1;
    case "raid10":
      return 1;
    case "raid5":
    case "raidz1":
      return 1;
    case "raid6":
    case "raidz2":
      return 2;
    case "raidz3":
      return 3;
  }
}

/**
 * Observed URE rate, expressed as an exponent.
 *
 * Field studies consistently find rates better than the specification, which
 * is a warranty bound rather than a measurement. Two orders of magnitude is a
 * conservative reading of that literature and it is the figure used for the
 * second probability, which exists to show how much the conclusion moves when
 * the input does.
 */
const OBSERVED_BETTER_BY = 2;

/**
 * Probability of at least one error in `bits` reads at one per 10^exponent.
 *
 * NOT 1 - (1 - r)^n, which is the textbook form and which silently returns
 * zero here. A rate of 1e-17 subtracted from 1 rounds to exactly 1.0 in a
 * float64, because the gap between 1 and the next representable number is
 * about 2.2e-16, so the whole expression collapses. I wrote it that way first
 * and it reported a one-in-a-trillion chance for a rebuild that is really
 * about one in sixty.
 *
 * log1p and expm1 exist precisely for this: both are accurate for arguments
 * near zero, where the naive subtraction has already lost every significant
 * digit.
 */
function atLeastOne(bits: number, exponent: number): number {
  const rate = Math.pow(10, -exponent);
  return -Math.expm1(bits * Math.log1p(-rate));
}

export function analyse(array: DiskArray): Analysis {
  const { level, disks, diskTb, rebuildMbs, ureExponent } = array;
  const parityDisks = parityDisksFor(level, disks);
  const tolerance = toleranceFor(level, disks);
  const dataDisks = disks - parityDisks;

  const rawTb = disks * diskTb;
  const usableTb = dataDisks * diskTb;

  /*
    Bytes read to rebuild one disk.

    On a parity array every surviving member is read in full, which is why the
    rebuild cost grows with the array. On a mirror only the partner is read,
    which is the whole argument for RAID 10 and the thing the URE calculation
    is really about.
  */
  /*
    A level with no redundancy has no rebuild, and reporting one is worse than
    reporting nothing: sixteen days and a URE probability for a RAID 0 reads as
    a recovery that exists. It does not. The disk is gone and so is the array.
  */
  const canRebuild = tolerance > 0;
  const survivors = !canRebuild ? 0 : level === "raid1" || level === "raid10" ? 1 : disks - 1;
  const rebuildReadBytes = survivors * diskTb * TB;
  const rebuildSeconds = canRebuild ? rebuildReadBytes / (rebuildMbs * 1e6) : 0;

  const bitsRead = rebuildReadBytes * 8;
  const ureProbability = canRebuild ? atLeastOne(bitsRead, ureExponent) : 0;
  const ureProbabilityObserved = canRebuild
    ? atLeastOne(bitsRead, ureExponent + OBSERVED_BETTER_BY)
    : 0;

  const notes: string[] = [];
  if (disks < MIN_DISKS[level]) {
    notes.push(`${level} needs at least ${MIN_DISKS[level]} disks.`);
  }
  if (level === "raid0") {
    notes.push(
      "No redundancy at all. One disk failure loses the array, and the probability of that grows with every disk added.",
    );
  }
  if (level === "raid10") {
    notes.push(
      `Survives one failure for certain and up to ${Math.floor(disks / 2)} if they land in different mirrors. The guarantee is one, because the second failure hitting the partner of the first is the case that decides.`,
    );
  }
  if (level === "raid5" || level === "raidz1") {
    notes.push(
      "Single parity. A second failure during the rebuild loses everything, and the rebuild window is exactly when the surviving disks are working hardest.",
    );
  }
  if (survivors > 1) {
    notes.push(
      `Rebuilding reads all ${survivors} surviving members in full, so the rebuild cost grows with the array rather than with the failed disk.`,
    );
  }

  const ureConsequence =
    level === "raid5" || level === "raidz1"
      ? "On a traditional RAID 5 controller a URE during rebuild can abort the whole rebuild. On Linux md and on RAIDZ1 it loses the affected stripe and continues, which is a file, not the array."
      : tolerance >= 2
        ? "With a second parity there is another copy of the stripe, so a URE during a single-disk rebuild is corrected rather than fatal. That is most of the argument for double parity."
        : level === "raid1" || level === "raid10"
          ? "A mirror rebuild reads only the partner, so both the exposure and the consequence are a fraction of a parity array's."
          : "No redundancy remains, so there is nothing to reconstruct from.";

  return {
    level,
    disks,
    parityDisks,
    tolerance,
    usableTb,
    rawTb,
    efficiency: rawTb === 0 ? 0 : usableTb / rawTb,
    rebuildReadBytes,
    rebuildSeconds,
    ureProbability,
    ureProbabilityObserved,
    ureConsequence,
    notes,
  };
}

export const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "no time at all";
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)} minutes`;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
};

export const formatProbability = (p: number): string => {
  if (p >= 0.995) return "essentially certain";
  if (p >= 0.01) return `${(p * 100).toFixed(1)} per cent`;
  if (p >= 0.0001) return `${(p * 100).toFixed(3)} per cent`;
  return `about 1 in ${Math.round(1 / Math.max(p, 1e-12)).toLocaleString()}`;
};

/** Tebibytes, for the "where did my space go" line. */
export const tbToTib = (tb: number): number => (tb * TB) / 2 ** 40;
