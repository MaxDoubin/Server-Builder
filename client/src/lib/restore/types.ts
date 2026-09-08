/**
 * You do not have backups. You have restores, and you have not tested them.
 *
 * Every organisation that lost data had backups. That is not a paradox and
 * it is not carelessness: a backup is a job that reports success, and a
 * restore is a thing nobody does until the worst day of the year. The gap
 * between the two is where the losses live.
 *
 * Three specific gaps, and this models all three.
 *
 * A copy is only a copy if the incident cannot reach it. A snapshot on the
 * array that failed is gone with the array. A replica reachable with the
 * credential the attacker took is encrypted alongside the original. Three
 * copies behind one identity is one copy with extra steps, and the 3-2-1
 * rule is about failure domains rather than about the number three.
 *
 * Recovery point is not the backup interval. It is the interval plus how
 * long the problem went unnoticed, and for silent corruption that second
 * term is measured in weeks and is usually longer than the retention.
 *
 * Recovery time is not the transfer. It is finding out what to restore,
 * getting the media back, moving the bytes at restore speed rather than
 * backup speed, rebuilding whatever sat on top, and proving it is right.
 * The transfer is often the smallest of the five.
 */

/** How a copy is stored, which decides what can destroy it and how fast it comes back. */
export type Medium = "snapshot" | "disk" | "object" | "cold" | "tape";

/** What went wrong, which decides which copies survive. */
export type Incident =
  | "array-failure"
  | "ransomware"
  | "accidental-delete"
  | "silent-corruption"
  | "site-loss";

export interface Copy {
  name: string;
  medium: Medium;
  /** How often it is written, in hours. */
  intervalHours: number;
  /** How long it is kept, in days. */
  retentionDays: number;
  /**
   * The failure domain it shares with production.
   *
   * "array" means the same disks, "site" the same building, "account" the
   * same credentials, and "none" a genuinely separate one. This is the
   * field the 3-2-1 rule is actually about.
   */
  sharesWith: "array" | "site" | "account" | "none";
  /** Whether the copy is immutable once written: a hold no live credential can lift. */
  immutable: boolean;
  /** Hours before the media can even be read. Cold storage and offsite tape are not instant. */
  retrievalHours: number;
  /** Restore throughput in megabytes per second. Rarely the same as the backup's. */
  restoreMbps: number;
  /** A path or pattern the job does not cover. The most expensive field here. */
  excludes?: string;
  /** Whether a restore from this copy has ever actually been performed. */
  everRestored: boolean;
}

export interface Scenario {
  slug: string;
  name: string;
  brief: string;
  /** What has to come back, in gigabytes. */
  gigabytes: number;
  /** Hours between the problem starting and somebody noticing. */
  detectionHours: number;
  /** Hours of work to rebuild what sat on top once the bytes are back. */
  rebuildHours: number;
  copies: Copy[];
  incident: Incident;
  /** What people conclude, and why it is wrong. Shown after they have answered. */
  trap: string;
}

/** What a copy is worth against one incident. */
export interface Verdict {
  usable: boolean;
  /** Why not, when it is not. */
  reason: string;
  /** Hours from deciding to restore until the data is back, when it is usable. */
  hours: number;
  /** Worst-case data loss in hours, when it is usable. */
  rpoHours: number;
}
