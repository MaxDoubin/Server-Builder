/**
 * Six incidents, and the copies that turn out not to be copies.
 *
 * Each one has a backup posture that would pass an audit. The job runs, it
 * reports success, the retention meets the policy, and there are three
 * copies. Then something happens and between zero and one of them is worth
 * anything, for a reason that was visible in the configuration the whole
 * time and that nobody had cause to look at.
 */

import type { Scenario } from "../types";

export const SCENARIOS: Scenario[] = [
  {
    slug: "three-copies-one-account",
    name: "Three copies, one credential",
    brief:
      "Ransomware on a Friday evening. The estate has an hourly snapshot, a nightly replica to a second array, and a nightly push to object storage. Three copies, two media, and the runbook says this is 3-2-1.",
    gigabytes: 2400,
    detectionHours: 3,
    rebuildHours: 4,
    incident: "ransomware",
    copies: [
      { name: "Hourly array snapshot", medium: "snapshot", intervalHours: 1, retentionDays: 7, sharesWith: "array", immutable: false, retrievalHours: 0, restoreMbps: 900, everRestored: true },
      { name: "Nightly replica, second array", medium: "disk", intervalHours: 24, retentionDays: 14, sharesWith: "account", immutable: false, retrievalHours: 0, restoreMbps: 300, everRestored: true },
      { name: "Nightly push to object storage", medium: "object", intervalHours: 24, retentionDays: 90, sharesWith: "account", immutable: false, retrievalHours: 0.5, restoreMbps: 120, everRestored: false },
    ],
    trap:
      "Three copies and none of them survive, because all three are writable by the service account the attacker took. The 3-2-1 rule is about failure domains and not about the number three: what it is asking for is a copy nothing in the blast radius can reach. One object lock on the third copy would have made this a bad weekend instead of a company-ending one.",
  },
  {
    slug: "the-immutable-one",
    name: "The same estate, with one object lock",
    brief:
      "Identical to the previous incident in every respect but one: the object storage bucket has a fourteen day compliance hold. The attacker had the same credential and the same access.",
    gigabytes: 2400,
    detectionHours: 3,
    rebuildHours: 4,
    incident: "ransomware",
    copies: [
      { name: "Hourly array snapshot", medium: "snapshot", intervalHours: 1, retentionDays: 7, sharesWith: "array", immutable: false, retrievalHours: 0, restoreMbps: 900, everRestored: true },
      { name: "Nightly replica, second array", medium: "disk", intervalHours: 24, retentionDays: 14, sharesWith: "account", immutable: false, retrievalHours: 0, restoreMbps: 300, everRestored: true },
      { name: "Object storage, fourteen day hold", medium: "object", intervalHours: 24, retentionDays: 90, sharesWith: "account", immutable: true, retrievalHours: 0.5, restoreMbps: 120, everRestored: false },
    ],
    trap:
      "One field changed and the outcome changed with it. Immutability is not another copy, it is a copy the incident cannot reach, and that is the only property that ever mattered. Note the restore rate: 120 MB/s against 2.4TB is most of a working day before anybody touches the rebuild, and the last time anyone read from this bucket was never.",
  },
  {
    slug: "the-excluded-directory",
    name: "The job that succeeded every night for a year",
    brief:
      "A controller failure took the array with it. The backup job has reported success every night for fourteen months and the monitoring agrees. The database lives on a mount added nine months ago.",
    gigabytes: 800,
    detectionHours: 1,
    rebuildHours: 6,
    incident: "array-failure",
    copies: [
      { name: "Nightly file-level backup", medium: "disk", intervalHours: 24, retentionDays: 30, sharesWith: "none", immutable: false, retrievalHours: 0, restoreMbps: 200, excludes: "/var/lib/postgresql, added to the ignore list during a noisy migration and never removed", everRestored: false },
      { name: "Weekly full to tape", medium: "tape", intervalHours: 168, retentionDays: 365, sharesWith: "none", immutable: true, retrievalHours: 6, restoreMbps: 140, everRestored: true },
    ],
    trap:
      "A job reporting success is reporting that it did what it was told, not that what it was told is what you need. Nothing about an exclusion looks like a failure: the run is faster, the report is green, and the gap is invisible until the day you need the thing that was excluded. The weekly tape has it, and it is a week old and six hours away.",
  },
  {
    slug: "the-corruption-that-predates-everything",
    name: "Corruption older than the retention",
    brief:
      "A reporting discrepancy turns out to be a bad migration that has been silently writing wrong values for five weeks. Backups are hourly, tested, immutable and offsite. The recovery point objective on paper is one hour.",
    gigabytes: 300,
    detectionHours: 840,
    rebuildHours: 8,
    incident: "silent-corruption",
    copies: [
      { name: "Hourly snapshot, thirty day retention", medium: "object", intervalHours: 1, retentionDays: 30, sharesWith: "none", immutable: true, retrievalHours: 0.25, restoreMbps: 250, everRestored: true },
      { name: "Monthly archive to cold storage", medium: "cold", intervalHours: 720, retentionDays: 2555, sharesWith: "none", immutable: true, retrievalHours: 12, restoreMbps: 60, everRestored: false },
    ],
    trap:
      "Every hourly copy contains the corruption, because the corruption is older than the oldest one. Frequency answers a question nobody is asking here: what decides this is retention reaching back past the start, and the only copy that does is a monthly archive twelve hours away in cold storage that has never been read from. A recovery point measured in hours means nothing against a problem measured in weeks.",
  },
  {
    slug: "cold-storage-arithmetic",
    name: "The archive that takes longer to fetch than to move",
    brief:
      "A ten terabyte dataset has to come back after a site loss. It is in cold archival storage, which is the cheap tier, and the business has been told recovery is a matter of hours.",
    gigabytes: 10000,
    detectionHours: 1,
    rebuildHours: 3,
    incident: "site-loss",
    copies: [
      { name: "Local disk backup", medium: "disk", intervalHours: 6, retentionDays: 30, sharesWith: "site", immutable: false, retrievalHours: 0, restoreMbps: 400, everRestored: true },
      { name: "Cold archival storage", medium: "cold", intervalHours: 24, retentionDays: 3650, sharesWith: "none", immutable: true, retrievalHours: 14, restoreMbps: 90, everRestored: false },
    ],
    trap:
      "The local copy is in the building that is gone, which leaves the archive. Fourteen hours before the first byte is readable, then thirty-two more to move ten terabytes at 90 MB/s, then the rebuild. The storage tier that saves the most money is the one that costs the most time, and that trade is made once at design and paid once at the worst possible moment.",
  },
  {
    slug: "the-sync-that-is-not-a-backup",
    name: "The sync that replicated the delete",
    brief:
      "Somebody removed the wrong directory tree at 09:40. It is continuously replicated to a second site for availability, and there is a nightly backup that has never been restored from.",
    gigabytes: 120,
    detectionHours: 2,
    rebuildHours: 1,
    incident: "accidental-delete",
    copies: [
      { name: "Continuous replication to site B", medium: "snapshot", intervalHours: 0.02, retentionDays: 0, sharesWith: "none", immutable: false, retrievalHours: 0, restoreMbps: 500, everRestored: true },
      { name: "Nightly backup, thirty days", medium: "disk", intervalHours: 24, retentionDays: 30, sharesWith: "none", immutable: false, retrievalHours: 0, restoreMbps: 180, everRestored: false },
    ],
    trap:
      "Replication is an availability feature and it did exactly what it promises: the delete was at site B within seconds. A copy that follows the original is not a backup, because the thing you are protecting against is a change, and it replicates changes. The nightly is the answer here, and it is up to twenty-six hours old by the time anybody notices.",
  },
];

export const scenarioFor = (slug: string) => SCENARIOS.find((item) => item.slug === slug);
