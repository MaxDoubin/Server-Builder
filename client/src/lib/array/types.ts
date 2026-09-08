/**
 * Disk arrays: what survives, how long the rebuild takes, and what the
 * unrecoverable read error number actually tells you.
 *
 * THE REASON THIS EXISTS. "RAID 5 is dead" is one of the most repeated claims
 * in storage, and the arithmetic behind it is repeated far less often than the
 * conclusion. The usual calculation takes a manufacturer's URE figure of one
 * in 10^14 bits, multiplies it by the bits read during a rebuild, and
 * announces that a rebuild of a large array is essentially certain to fail.
 *
 * That calculation is worth doing, and this page does it. It is also wrong in
 * a specific way that matters: the spec figure is a warranty bound rather than
 * a measured rate, observed rates are considerably better, errors are not
 * independent, and a URE during a rebuild loses a stripe rather than the
 * array on any implementation written this century. A page that prints the
 * scary number without saying that is repeating a rumour with a decimal point
 * in it.
 *
 * So both numbers are here, side by side, and the page argues about them.
 */

export type Level = "raid0" | "raid1" | "raid5" | "raid6" | "raid10" | "raidz1" | "raidz2" | "raidz3";

export interface Array {
  level: Level;
  /** Number of member disks. */
  disks: number;
  /** Capacity of one disk in terabytes, decimal (as sold). */
  diskTb: number;
  /**
   * Sustained rebuild throughput in megabytes per second.
   *
   * The default is deliberately not the disk's sequential rate. A rebuild
   * competes with production reads, and an array that rebuilds at full speed
   * is an array nobody is using.
   */
  rebuildMbs: number;
  /** Manufacturer's unrecoverable read error rate, as the exponent: 14 means 1 in 10^14 bits. */
  ureExponent: number;
}

export interface Analysis {
  level: Level;
  disks: number;
  /** Disks whose capacity is spent on redundancy. */
  parityDisks: number;
  /** Simultaneous failures survived, guaranteed. */
  tolerance: number;
  /** Usable capacity in TB. */
  usableTb: number;
  /** Raw capacity in TB. */
  rawTb: number;
  efficiency: number;
  /** Bytes that must be read to rebuild one failed disk. */
  rebuildReadBytes: number;
  /** Seconds to rebuild one disk at the given rate. */
  rebuildSeconds: number;
  /** Naive probability that at least one URE occurs during a full rebuild. */
  ureProbability: number;
  /** The same with a measured rate rather than the spec bound. */
  ureProbabilityObserved: number;
  /** What a URE during rebuild actually costs on this level. */
  ureConsequence: string;
  notes: string[];
}

export const LEVEL_LABEL: Record<Level, string> = {
  raid0: "RAID 0, striped",
  raid1: "RAID 1, mirrored",
  raid5: "RAID 5, single parity",
  raid6: "RAID 6, double parity",
  raid10: "RAID 10, striped mirrors",
  raidz1: "RAIDZ1, single parity",
  raidz2: "RAIDZ2, double parity",
  raidz3: "RAIDZ3, triple parity",
};

/** Minimum member count for each level. */
export const MIN_DISKS: Record<Level, number> = {
  raid0: 2,
  raid1: 2,
  raid5: 3,
  raid6: 4,
  raid10: 4,
  raidz1: 3,
  raidz2: 4,
  raidz3: 5,
};
