import type { Claim, Setup } from "./types";

/** The budget, for the whole path resolution. Measured: 40 opens, 41 does not. */
export const MAX_TRAVERSALS = 40;

/** ELOOP itself, which is errno 40 as well. The two forties are unrelated. */
export const ELOOP = 40;

/**
 * Whether this call walks the final component.
 *
 * open and stat follow it; lstat and readlink are about the link itself. All
 * four resolve the directories leading up to it, which is the part that gets
 * missed.
 */
export function followsFinal(setup: Setup): boolean {
  if (setup.call === "lstat" || setup.call === "readlink") return false;
  /* O_NOFOLLOW is a flag on open. It says nothing about stat, which follows
     the final component whatever else is set. The first version of this let
     it suppress the follow for any call, and the gate caught it. */
  if (setup.call === "open" && setup.noFollow) return false;
  return true;
}

/**
 * Traversals the path asks for, before the budget is applied.
 *
 * A cyclic chain asks for an unbounded number: that is what a cycle is, and
 * the only reason the walk ever comes back is the counter.
 */
export function demanded(setup: Setup): number {
  if (followsFinal(setup) && setup.cyclicFinal) return Number.POSITIVE_INFINITY;
  return setup.leadingHops + (followsFinal(setup) ? setup.finalHops : 0);
}

/**
 * Traversals the walk actually performs.
 *
 * Not the same as what the path asks for, and the difference is the point: the
 * kernel stops the moment the counter is spent rather than finishing the
 * chain and then complaining. A path asking for forty four performs forty one.
 */
export function spent(setup: Setup): number {
  return Math.min(demanded(setup), MAX_TRAVERSALS + 1);
}

/** What is left of the budget. Minus one on anything that overran it. */
export function headroom(setup: Setup): number {
  return MAX_TRAVERSALS - spent(setup);
}

/** Whether the budget covered what the path asked for. */
export function withinBudget(setup: Setup): boolean {
  return demanded(setup) <= MAX_TRAVERSALS;
}

/** Whether O_NOFOLLOW refuses the final component for being a link. */
export function refusedByNoFollow(setup: Setup): boolean {
  return setup.noFollow && setup.call === "open" && setup.finalHops > 0;
}

/** Whether the call returns rather than failing. */
export function succeeds(setup: Setup): boolean {
  return withinBudget(setup) && !refusedByNoFollow(setup);
}

/**
 * Which of the three things this ELOOP is reporting.
 *
 * The order is the kernel's: the walk spends the budget on the directories
 * before it ever reaches the final component, so an exhausted budget is
 * reported before O_NOFOLLOW has anything to say. No case has two of these
 * true at once, and the gate enforces that, so the order never decides an
 * answer.
 */
export function reason(setup: Setup): string {
  if (followsFinal(setup) && setup.cyclicFinal) return "the budget, spent going round a cycle";
  if (!withinBudget(setup)) return "the budget, forty traversals for the whole path";
  if (refusedByNoFollow(setup)) return "O_NOFOLLOW, and the last component is a link";
  return "nothing";
}

/** What the call returns. */
export function result(setup: Setup): string {
  return succeeds(setup) ? `${setup.call} returns` : `${setup.call} fails with ELOOP`;
}

/** A count of traversals, written the way a person would say it. */
export function humanHops(n: number): string {
  if (n === 0) return "no symlinks";
  return `${n} traversal${n === 1 ? "" : "s"}`;
}

/** The lines a reader would gather before answering. */
export function asWalk(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "the path", value: setup.path, unit: `on ${setup.host}` },
    { name: "the call", value: setup.call, unit: followsFinal(setup) ? "follows the last component" : "does NOT follow the last component" },
    { name: "leading directories", value: humanHops(setup.leadingHops), unit: "every call pays these, whichever call it is" },
    { name: "the last component", value: setup.finalHops === 0 ? "not a link" : humanHops(setup.finalHops), unit: setup.cyclicFinal ? "and the chain closes on itself" : "an ordinary chain" },
    { name: "O_NOFOLLOW", value: setup.noFollow ? "set" : "not set", unit: "refuses a final link, and reports ELOOP for it" },
    { name: "the budget", value: String(MAX_TRAVERSALS), unit: "for the WHOLE path, not per chain or per component" },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "succeeds":
      return claim.value === succeeds(setup);
    case "reason":
      return claim.name === reason(setup);
    case "spent":
      return claim.value === spent(setup);
    case "headroom":
      return claim.value === headroom(setup);
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
