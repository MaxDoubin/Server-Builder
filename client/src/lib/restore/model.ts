/**
 * Which copies survive, and what they cost to use.
 *
 * The survival rules are the interesting part and they are all the same
 * shape: an incident destroys a failure domain, and every copy inside that
 * domain goes with it no matter how many there are.
 */

import type { Copy, Incident, Scenario, Verdict } from "./types";

/** Restore throughput converts to gigabytes per hour: MB/s x 3600 / 1024. */
export const hoursToMove = (gigabytes: number, restoreMbps: number): number =>
  gigabytes / ((restoreMbps * 3600) / 1024);

/**
 * Does this incident reach this copy?
 *
 * Ransomware is the case people get wrong. It does not destroy a failure
 * domain in the physical sense; it destroys everything a live credential can
 * write to, which is a different and usually larger set. An immutable copy
 * survives it even when it shares an account, because immutability is
 * precisely a hold that no live credential can lift.
 */
export function reaches(incident: Incident, copy: Copy): string | null {
  switch (incident) {
    case "array-failure":
      return copy.sharesWith === "array" ? "on the array that failed" : null;
    case "site-loss":
      return copy.sharesWith === "array" || copy.sharesWith === "site"
        ? "in the building that is gone"
        : null;
    case "ransomware":
      if (copy.immutable) return null;
      if (copy.sharesWith === "array") return "on the array, and mounted, so it was encrypted too";
      if (copy.sharesWith === "account") {
        return "reachable with the credential the attacker took, and not immutable";
      }
      return null;
    case "accidental-delete":
      /* A delete propagates to any copy that syncs rather than versions. */
      return copy.medium === "snapshot" && copy.intervalHours < 1
        ? "syncing continuously, so the delete replicated before anybody noticed"
        : null;
    case "silent-corruption":
      return null;
    default:
      return null;
  }
}

/**
 * What one copy is worth against one incident.
 *
 * Recovery point is the backup interval plus the detection lag, because the
 * newest copy is only useful if it predates the problem. For silent
 * corruption that lag is the whole story: a copy written every hour for
 * thirty days is worthless if the corruption started thirty-one days ago,
 * and this is the case where retention rather than frequency decides.
 */
export function assess(scenario: Scenario, copy: Copy): Verdict {
  const destroyed = reaches(scenario.incident, copy);
  if (destroyed) return { usable: false, reason: destroyed, hours: Infinity, rpoHours: Infinity };

  if (copy.excludes) {
    return {
      usable: false,
      reason: `the job excludes ${copy.excludes}, so this data was never in it`,
      hours: Infinity,
      rpoHours: Infinity,
    };
  }

  /*
    Corruption that predates every copy you kept is not recoverable from any
    of them, and the frequency does not help: the question is whether
    retention reaches back past the start.
  */
  if (scenario.incident === "silent-corruption" && copy.retentionDays * 24 < scenario.detectionHours) {
    return {
      usable: false,
      reason: `kept for ${copy.retentionDays} days and the corruption started ${Math.round(scenario.detectionHours / 24)} days ago, so every copy has it`,
      hours: Infinity,
      rpoHours: Infinity,
    };
  }

  const transfer = hoursToMove(scenario.gigabytes, copy.restoreMbps);
  return {
    usable: true,
    reason: "",
    hours: copy.retrievalHours + transfer + scenario.rebuildHours,
    rpoHours: copy.intervalHours + scenario.detectionHours,
  };
}

/** Every copy's verdict, best recovery time first. */
export function assessAll(scenario: Scenario): { copy: Copy; verdict: Verdict; index: number }[] {
  return scenario.copies
    .map((copy, index) => ({ copy, verdict: assess(scenario, copy), index }))
    .sort((a, b) => Number(b.verdict.usable) - Number(a.verdict.usable) || a.verdict.hours - b.verdict.hours);
}

/** The copy you would actually restore from, or null when there is not one. */
export function best(scenario: Scenario): { copy: Copy; verdict: Verdict; index: number } | null {
  const usable = assessAll(scenario).filter((row) => row.verdict.usable);
  return usable.length ? usable[0] : null;
}

/**
 * How many independent failure domains the copies actually span.
 *
 * The 3-2-1 rule counts copies, media and sites, and the number that
 * matters is none of those: it is how many ways there are to lose all of
 * them at once. An immutable copy is its own domain, because that is what
 * immutability buys.
 */
export function domains(copies: Copy[]): number {
  const seen = new Set<string>();
  for (const copy of copies) {
    if (copy.immutable) {
      /* Immutability is a domain of one: nothing with a live credential reaches it. */
      seen.add(`immutable:${copy.name}`);
    } else if (copy.sharesWith === "none") {
      /*
        A copy sharing nothing with production is independent of production
        and of the other copies, so it counts once for itself.

        Collapsing these into a single "none" bucket was the first version
        and it undercounted: two separate offsite copies read as one domain,
        which is the opposite of what this function is for.
      */
      seen.add(`independent:${copy.name}`);
    } else {
      seen.add(copy.sharesWith);
    }
  }
  return seen.size;
}

/** Hours as something a person reads. */
export function duration(hours: number): string {
  if (!Number.isFinite(hours)) return "never";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}
