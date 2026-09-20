import type { Claim, Event, Kind, Party, Setup } from "./types";

/**
 * Which list a lock goes on.
 *
 * fcntl locks and open file description locks are the same kind of record and
 * conflict with each other. flock keeps a separate list and conflicts with
 * neither, in either direction. Measured across all nine combinations, twice,
 * once between processes and once within one.
 */
export function world(kind: Kind): "flock" | "record" {
  return kind === "flock" ? "flock" : "record";
}

/** What a lock of this kind belongs to. Every difference between them is this. */
export function ownerOf(kind: Kind): string {
  return kind === "fcntl" ? "the process" : "the open file description";
}

/**
 * Who a lock of this kind, taken by this party, belongs to.
 *
 * Two locks have the same owner, and therefore do not conflict, only when these
 * agree. The forked child shares the holder's description and not its process,
 * which is why it can take an OFD lock the holder is holding and cannot take an
 * fcntl one.
 */
export function identity(kind: Kind, party: Party | "the holder"): string {
  if (kind === "fcntl") {
    if (party === "another process") return "the second process";
    if (party === "the forked child") return "the child process";
    return "the holder's process";
  }
  if (party === "the holder" || party === "the forked child") return "the holder's description";
  return "a second description";
}

/** Whether the holder still has the lock by the time it is asked for. */
export function stillHeld(setup: Setup): boolean {
  let held = true;
  for (const event of setup.events) {
    if (event === "closed another descriptor" && setup.held === "fcntl") held = false;
    if (event === "the child unlocked" && setup.held !== "fcntl") held = false;
  }
  return held;
}

/** Why the holder lost it, or the empty string if it did not. */
export function lostBecause(setup: Setup): string {
  if (stillHeld(setup)) return "";
  if (setup.events.includes("closed another descriptor") && setup.held === "fcntl") {
    return "closing any descriptor to the file drops that process's fcntl locks on it";
  }
  return "the lock belongs to the description, so the child's unlock released it";
}

/** Whether the two byte ranges touch. flock is the whole file and always does. */
export function overlaps(setup: Setup): boolean {
  if (setup.held === "flock" || setup.asking === "flock") return true;
  const holderEnd = setup.holderLength === 0 ? Infinity : setup.holderStart + setup.holderLength;
  const askerEnd = setup.askerLength === 0 ? Infinity : setup.askerStart + setup.askerLength;
  return setup.holderStart < askerEnd && setup.askerStart < holderEnd;
}

/** Two shared locks never conflict. */
export function bothShared(setup: Setup): boolean {
  return !setup.holderExclusive && !setup.askerExclusive;
}

/** Whether the party asking already owns the lock that is in its way. */
export function sameOwner(setup: Setup): boolean {
  return identity(setup.asking, setup.asker) === identity(setup.held, "the holder");
}

/** Whether the second party gets the lock. */
export function granted(setup: Setup): boolean {
  if (!stillHeld(setup)) return true;
  if (world(setup.asking) !== world(setup.held)) return true;
  if (!overlaps(setup)) return true;
  if (bothShared(setup)) return true;
  return sameOwner(setup);
}

/**
 * The reason, in the order the kernel decides it.
 *
 * The order matters and the page and the gate both read it from here, because a
 * case where two reasons would both be true should name the first one.
 */
export function why(setup: Setup): string {
  if (!stillHeld(setup)) return lostBecause(setup);
  if (world(setup.asking) !== world(setup.held)) {
    return "flock and fcntl keep separate lists and do not see each other";
  }
  if (!overlaps(setup)) return "the byte ranges do not overlap";
  if (bothShared(setup)) return "two shared locks do not conflict";
  if (sameOwner(setup)) return `both locks belong to ${identity(setup.held, "the holder")}`;
  return `a conflicting lock is held by ${identity(setup.held, "the holder")}`;
}

/** How a range reads when a person says it out loud. */
export function humanRange(start: number, length: number): string {
  if (length === 0) return `byte ${start} to the end of the file`;
  if (length === 1) return `byte ${start}`;
  return `bytes ${start} to ${start + length - 1}`;
}

/** What the call is written as in a program. */
export function callOf(kind: Kind, exclusive: boolean): string {
  if (kind === "flock") return `flock(fd, ${exclusive ? "LOCK_EX" : "LOCK_SH"})`;
  if (kind === "ofd") return `fcntl(fd, F_OFD_SETLK, ${exclusive ? "F_WRLCK" : "F_RDLCK"})`;
  return `fcntl(fd, F_SETLK, ${exclusive ? "F_WRLCK" : "F_RDLCK"})`;
}

/** The lines a reader would gather before answering. */
export function asLocks(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "the holder took", value: callOf(setup.held, setup.holderExclusive), unit: `on ${setup.path}, ${setup.held === "flock" ? "the whole file" : humanRange(setup.holderStart, setup.holderLength)}` },
    { name: "which belongs to", value: ownerOf(setup.held), unit: "and this is where every difference between the three comes from" },
    { name: "since then", value: setup.events.length === 0 ? "nothing" : setup.events.join(", then "), unit: "what happened to the holder in between" },
    { name: "asking is", value: setup.asker, unit: "which descriptor it is using" },
    { name: "asking with", value: callOf(setup.asking, setup.askerExclusive), unit: `${setup.asking === "flock" ? "the whole file" : humanRange(setup.askerStart, setup.askerLength)}` },
    { name: "same lock list", value: world(setup.asking) === world(setup.held) ? "yes" : "no", unit: "flock keeps its own, fcntl and OFD share one" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "granted":
      return claim.value === granted(setup);
    case "stillHeld":
      return claim.value === stillHeld(setup);
    case "owner":
      return claim.name === ownerOf(setup.held);
    case "why":
      return claim.name === why(setup);
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

/** Kept honest by the gate: every event the model knows how to apply. */
export const EVENTS: Event[] = ["closed another descriptor", "the child unlocked"];
