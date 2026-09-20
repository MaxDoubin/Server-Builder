import type { Claim, Setup } from "./types";

/** The relatime day, hard coded in the kernel rather than tunable. */
export const DAY_SECONDS = 86_400;

/* --------------------------------------------- the three relatime rules */

/**
 * mtime is at least as new as atime: the file changed since it was last read.
 *
 * Ages run backwards from now, so "at least as new" is "not as old".
 */
export function mtimeRule(setup: Setup): boolean {
  return setup.mtimeAge <= setup.atimeAge;
}

/** ctime is at least as new as atime: the inode changed since it was read. */
export function ctimeRule(setup: Setup): boolean {
  return setup.ctimeAge <= setup.atimeAge;
}

/** The stored atime is a day old or more. */
export function dayRule(setup: Setup): boolean {
  return setup.atimeAge >= DAY_SECONDS;
}

/** How many of the three fire. The gate uses this to refuse ambiguity. */
export function rulesFiring(setup: Setup): number {
  return [mtimeRule(setup), ctimeRule(setup), dayRule(setup)].filter(Boolean).length;
}

/** What relatime alone would decide, before anything blocks it. */
export function relatimeWouldUpdate(setup: Setup): boolean {
  return rulesFiring(setup) > 0;
}

/* --------------------------------------------------- what stops it dead */

/**
 * What refuses the update for a given target, or "" when nothing does.
 *
 * The order is the kernel's: the inode's own flag, then the mount's noatime,
 * then nodiratime for a directory, and the read-only mount last, because that
 * one is not part of the decision at all. atime_needs_update says yes and
 * then touch_atime asks the mount for write access and is told no.
 *
 * No case in this set has two of these true at once, and the gate enforces
 * that, so the order never decides an answer.
 */
export function blockedFor(setup: Setup, target: "file" | "directory"): string {
  if (setup.inodeNoatime) return "the A flag on the inode";
  if (setup.mountOption === "noatime") return "noatime on the mount";
  if (setup.mountOption === "nodiratime" && target === "directory") return "nodiratime on the mount";
  if (setup.readOnly) return "the mount is read-only";
  return "";
}

/** What refuses the update for the thing this case is reading. */
export function blockedBy(setup: Setup): string {
  return blockedFor(setup, setup.target);
}

/* ------------------------------------------------------- the whole answer */

/** Whether this read moves atime. */
export function updates(setup: Setup): boolean {
  if (blockedBy(setup) !== "") return false;
  return relatimeWouldUpdate(setup);
}

/**
 * The rule that let the update through, named.
 *
 * Only meaningful where exactly one rule fires, which is the only place the
 * cases ask about it.
 */
export function reason(setup: Setup): string {
  if (!updates(setup)) return "none";
  if (mtimeRule(setup)) return "mtime";
  if (ctimeRule(setup)) return "ctime";
  return "day";
}

/* ------------------------------------------------ what a read pass costs */

/**
 * Inodes a read-only pass over filesInPass files dirties.
 *
 * Measured: 1059 files under /usr/share/doc, none of them read that day,
 * dirtied 1059 inodes on the first pass and none on the second.
 */
export function inodesDirtied(setup: Setup): number {
  if (blockedFor(setup, "file") !== "") return 0;
  return setup.filesInPass - setup.filesFreshInPass;
}

/* ------------------------------------------- what a cleanup script sees */

/** The age of the stored atime once this read is done, in seconds. */
export function atimeAgeAfterRead(setup: Setup): number {
  return updates(setup) ? 0 : setup.atimeAge;
}

/** Whether a rule of "not accessed in N days" selects the file after the read. */
export function selectedByCleanup(setup: Setup): boolean {
  return atimeAgeAfterRead(setup) >= setup.cleanupDays * DAY_SECONDS;
}

/* ---------------------------------------------------------- for the page */

/**
 * An age in seconds, written the way a person would say it.
 *
 * The years tier is here because one case is a container image whose files
 * carry a fixed build date in 1999, and "9759.3 days ago" is a number nobody
 * can read.
 */
export function humanAge(seconds: number): string {
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 4 * DAY_SECONDS) return `${(seconds / 3600).toFixed(1)} h ago`;
  if (seconds < 730 * DAY_SECONDS) return `${(seconds / DAY_SECONDS).toFixed(1)} days ago`;
  return `${(seconds / (365.25 * DAY_SECONDS)).toFixed(1)} years ago`;
}

/** The lines a reader would gather before answering, with their scope named. */
export function asStat(setup: Setup): { name: string; value: string; unit: string }[] {
  const flags = setup.inodeNoatime ? "A" : "none";
  return [
    { name: "mount options", value: `${setup.readOnly ? "ro" : "rw"},${setup.mountOption}`, unit: `${setup.host}, from /proc/mounts` },
    { name: "being read", value: setup.target === "directory" ? "a directory, listed" : "a file, read", unit: "what the program does" },
    { name: "Access", value: humanAge(setup.atimeAge), unit: "the stored atime" },
    { name: "Modify", value: humanAge(setup.mtimeAge), unit: "the stored mtime" },
    { name: "Change", value: humanAge(setup.ctimeAge), unit: "the stored ctime" },
    { name: "lsattr", value: flags, unit: "per-inode flags" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "updates":
      return claim.value === updates(setup);
    case "reason":
      return claim.name === reason(setup);
    case "blocked":
      return claim.name === blockedBy(setup);
    case "dirtied":
      return claim.value === inodesDirtied(setup);
    case "cleanup":
      return claim.value === selectedByCleanup(setup);
    case "nothing":
      return false;
  }
}

/**
 * The option the model says is right.
 *
 * The page calls this rather than reading an answer out of the data, which is
 * the property check-answer-keys exists to hold.
 */
export function correctOption(item: { setup: Setup; options: { id: string; says: Claim }[] }) {
  return item.options.find((option) => claimHolds(option.says, item.setup));
}
