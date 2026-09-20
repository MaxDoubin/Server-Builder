import type { Claim, Setup } from "./types";

/** A pointer on this architecture, which every string in the vector costs. */
export const POINTER = 8;

/** MAX_ARG_STRLEN: 32 pages, bisected to the byte at 131071 passing. */
export const MAX_ARG_STRLEN = 32 * 4096;

/** The whole budget: a quarter of the stack limit, which is what getconf prints. */
export function budget(setup: Setup): number {
  return Math.floor(setup.stackBytes / 4);
}

/** What one argument of this length costs: pointer, bytes, terminator. */
export function costPerArg(setup: Setup): number {
  return POINTER + setup.argBytes + 1;
}

/**
 * What the program path costs, which is twice what anyone expects.
 *
 * execve copies bprm->filename onto the new stack in its own right, and then
 * copies the caller's argv, which begins with the same path. Both copies are
 * charged to the same budget, so a long path is paid for twice and only one
 * of the two carries a pointer.
 *
 * Found by a discrepancy rather than by reading: the formula without it fit
 * nine of thirteen measurements and missed four by exactly one argument, and
 * the size of the miss tracked the length of argv[0]. Pinned by holding the
 * argument count fixed and lengthening argv[0] a byte at a time, which gives
 * one byte of resolution: at 175 bytes the vector landed exactly on the
 * budget and every byte after that was E2BIG.
 */
export function programCost(setup: Setup): number {
  return POINTER + setup.programBytes + 1 + (setup.programBytes + 1);
}

/** What argv costs, the program path included. */
export function argvCost(setup: Setup): number {
  return setup.argCount * costPerArg(setup) + programCost(setup);
}

/** What the environment costs: its strings, plus a pointer for each variable. */
export function envCost(setup: Setup): number {
  return setup.envBytes + setup.envCount * POINTER;
}

/** Everything the kernel has to copy onto the new stack. */
export function totalCost(setup: Setup): number {
  return argvCost(setup) + envCost(setup);
}

/** What is left over, which is under one argument whenever a run is at the wall. */
export function headroom(setup: Setup): number {
  return budget(setup) - totalCost(setup);
}

/** Whether any one string is over the per-string cap, which fails on its own. */
export function aStringIsTooLong(setup: Setup): boolean {
  return setup.longestStringBytes >= MAX_ARG_STRLEN;
}

/** Whether the whole vector fits the budget. */
export function withinBudget(setup: Setup): boolean {
  return totalCost(setup) <= budget(setup);
}

/** Whether the exec succeeds. */
export function fits(setup: Setup): boolean {
  return withinBudget(setup) && !aStringIsTooLong(setup);
}

/**
 * Which limit refused it.
 *
 * The kernel checks a single string against MAX_ARG_STRLEN as it copies it,
 * so an over-long string is refused whether or not the total would have fit.
 * No case has both true at once, and the gate enforces that, so this order
 * never decides an answer.
 */
export function refusedBy(setup: Setup): string {
  if (aStringIsTooLong(setup)) return "MAX_ARG_STRLEN, one string of 32 pages or more";
  if (!withinBudget(setup)) return "the budget, a quarter of RLIMIT_STACK";
  return "nothing";
}

/** How many arguments of this length would fit, with this environment. */
export function maxArgs(setup: Setup): number {
  const room = budget(setup) - envCost(setup) - programCost(setup);
  if (room < 0) return 0;
  return Math.floor(room / costPerArg(setup));
}

/** Bytes of actual argument text that budget carries at this argument length. */
export function textBytes(setup: Setup): number {
  return maxArgs(setup) * setup.argBytes;
}

/** What share of the budget is pointers rather than anything you wrote. */
export function pointerShare(setup: Setup): number {
  return Math.round((POINTER / costPerArg(setup)) * 100);
}

/** Bytes, written the way a person would say them. */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

/** The lines a reader would gather before answering. */
export function asLimits(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    { name: "RLIMIT_STACK", value: humanBytes(setup.stackBytes), unit: `${setup.host}, ulimit -s` },
    { name: "getconf ARG_MAX", value: String(budget(setup)), unit: "a quarter of the stack, NOT a constant" },
    { name: "the command line", value: `${setup.argCount} x ${setup.argBytes} B`, unit: `argv[0] is ${setup.programBytes} B and is charged too` },
    { name: "the environment", value: `${setup.envCount} vars, ${setup.envBytes} B`, unit: "charged to the SAME budget" },
    { name: "longest single string", value: String(setup.longestStringBytes), unit: `the cap is ${MAX_ARG_STRLEN}, and it is not tunable` },
    { name: "per argument", value: `${costPerArg(setup)} B`, unit: `${setup.argBytes} of text, 1 NUL, ${POINTER} of pointer` },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "fits":
      return claim.value === fits(setup);
    case "refusedBy":
      return claim.name === refusedBy(setup);
    case "budget":
      return claim.value === budget(setup);
    case "costPerArg":
      return claim.value === costPerArg(setup);
    case "programCost":
      return claim.value === programCost(setup);
    case "maxArgs":
      return claim.value === maxArgs(setup);
    case "textBytes":
      return claim.value === textBytes(setup);
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
