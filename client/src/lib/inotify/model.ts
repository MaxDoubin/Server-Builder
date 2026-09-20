import type { Claim, Setup } from "./types";

/** Watches this program needs: one per directory, per instance, no sharing. */
export function watchesWanted(setup: Setup): number {
  return setup.directories * setup.instances;
}

/** What is left of the user's watch budget once other processes have theirs. */
export function watchesFree(setup: Setup): number {
  return setup.maxUserWatches - setup.watchesHeldByOthers;
}

/** What is left of the user's instance budget. */
export function instancesFree(setup: Setup): number {
  return setup.maxUserInstances - setup.instancesHeldByOthers;
}

/** Whether every instance this program opens can be created. */
export function instancesFit(setup: Setup): boolean {
  return setup.instances <= instancesFree(setup);
}

/** Whether every watch this program adds can be charged. */
export function watchesFit(setup: Setup): boolean {
  return watchesWanted(setup) <= watchesFree(setup);
}

/**
 * The errno the program actually sees.
 *
 * Order matters and is not arbitrary: inotify_init1 runs before
 * inotify_add_watch, so when both budgets are short the instance limit is the
 * one that reports, and raising max_user_watches in response changes nothing.
 */
export function errnoName(setup: Setup): string {
  if (!instancesFit(setup)) return "EMFILE";
  if (!watchesFit(setup)) return "ENOSPC";
  return "none";
}

/** What strerror prints, which is the whole problem. */
export function errnoMessage(setup: Setup): string {
  switch (errnoName(setup)) {
    case "EMFILE":
      return "Too many open files";
    case "ENOSPC":
      return "No space left on device";
    default:
      return "no error";
  }
}

/** The sysctl actually responsible, as against the resource the message names. */
export function culprit(setup: Setup): string {
  switch (errnoName(setup)) {
    case "EMFILE":
      return "fs.inotify.max_user_instances";
    case "ENOSPC":
      return "fs.inotify.max_user_watches";
    default:
      return "nothing";
  }
}

/** Whether everything this program asks for fits. */
export function fits(setup: Setup): boolean {
  return errnoName(setup) === "none";
}

/** Whether the queue overflows before the reader drains it. */
export function queueOverflows(setup: Setup): boolean {
  return setup.eventsBurst > setup.maxQueuedEvents;
}

/**
 * Events dropped when the queue overflows.
 *
 * The reader gets the queue's worth plus one IN_Q_OVERFLOW marker, and the
 * rest are gone. Measured: 256 created, 65 read, 192 lost, no error.
 */
export function eventsLost(setup: Setup): number {
  if (!queueOverflows(setup)) return 0;
  return setup.eventsBurst - setup.maxQueuedEvents;
}

/** Events the reader actually receives, the overflow marker included. */
export function eventsRead(setup: Setup): number {
  if (!queueOverflows(setup)) return setup.eventsBurst;
  return setup.maxQueuedEvents + 1;
}

/** Thousands separators, so 130082 reads as a count. */
export function human(count: number): string {
  return count.toLocaleString("en-US");
}

/** The lines a reader would gather before answering, with their scope named. */
export function asSysctl(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "fs.inotify.max_user_watches", value: String(setup.maxUserWatches), unit: "per real UID, ACROSS every process" },
    { name: "fs.inotify.max_user_instances", value: String(setup.maxUserInstances), unit: "per real UID, across every process" },
    { name: "fs.inotify.max_queued_events", value: String(setup.maxQueuedEvents), unit: "per instance" },
    { name: "held by other processes", value: `${setup.watchesHeldByOthers} watches, ${setup.instancesHeldByOthers} instances`, unit: "same user, already charged" },
    { name: "RLIMIT_NOFILE (soft)", value: String(setup.nofileSoft), unit: "what EMFILE here is NOT about" },
    { name: "free disk", value: `${setup.diskFreeMiB} MiB`, unit: "what ENOSPC here is NOT about" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "errno":
      return claim.name === errnoName(setup);
    case "culprit":
      return claim.name === culprit(setup);
    case "watches":
      return claim.value === watchesWanted(setup);
    case "free":
      return claim.value === watchesFree(setup);
    case "fits":
      return claim.value === fits(setup);
    case "lost":
      return claim.value === eventsLost(setup);
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
