import type { Change, Claim, Setup } from "./types";

/** How the set of listeners changes size. */
export function delta(change: Change): number {
  switch (change) {
    case "nothing":
      return 0;
    case "one left":
      return -1;
    case "one joined":
      return 1;
    case "two joined":
      return 2;
    /* Every worker is replaced, so the count comes back to where it was. */
    case "all restarted":
      return 0;
  }
}

/** How many listeners are serving once the change has settled. */
export function after(setup: Setup): number {
  return Math.max(0, setup.before + delta(setup.change));
}

/** Whether they can all bind the port at all. */
export function binds(setup: Setup): boolean {
  return setup.reusePort || setup.before <= 1;
}

/**
 * How many connections one listener gets.
 *
 * The spread is even to within the noise of a few hundred connections, so the
 * model states the even share and the cases carry counts that divide.
 */
export function each(setup: Setup): number {
  const serving = after(setup);
  if (!binds(setup) || serving <= 0) return 0;
  return Math.floor(setup.connections / serving);
}

/** The greatest common divisor, for the share that stays put. */
function gcd(a: number, b: number): number {
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/**
 * The share of clients whose listener changes, as a percentage.
 *
 * A client keeps its listener when its hash lands in the same slot across both
 * sets, which is when h mod n equals h mod m. Over one period of the two, of
 * length lcm(n, m), there are exactly min(n, m) such values, one for each slot
 * both sets have. So the share that stays is min(n, m) over lcm(n, m) and
 * everything else moves.
 *
 * This said one over the larger of the two until the gate dealt connections
 * out and disagreed. The two forms coincide whenever n and m are coprime,
 * which four and three are and four and five are, so both of the measured
 * pairs agreed with the wrong formula. Four to six did not: a quarter of the
 * hash space stays rather than a sixth, and 66 percent move rather than 83.
 */
export function movedPercent(setup: Setup): number {
  const from = setup.before;
  const to = after(setup);
  if (!binds(setup) || from <= 0 || to <= 0) return 0;
  /* Restarting every worker replaces the whole set, so nobody keeps anything. */
  if (setup.change === "all restarted") return 100;
  /*
    A set the same size as itself needs no special case: lcm(n, n) is n and
    min(n, n) is n, so the general form already gives nought. There was a
    guard here saying so, and blinding removed it without the gate noticing,
    which is how you find out a line is doing nothing.
  */
  const lcm = (from / gcd(from, to)) * to;
  return Math.round((1 - Math.min(from, to) / lcm) * 100);
}

/** Whether a client keeps the listener it had. */
export function stable(setup: Setup): boolean {
  return movedPercent(setup) === 0;
}

/** Whether the set changed size at all. */
export function resized(setup: Setup): boolean {
  return delta(setup.change) !== 0;
}

/** What the change is called, as an operator would say it. */
export function asChange(change: Change): string {
  switch (change) {
    case "nothing":
      return "nothing changes";
    case "one left":
      return "one worker exits";
    case "one joined":
      return "one worker starts";
    case "two joined":
      return "two workers start";
    case "all restarted":
      return "every worker is replaced, one at a time";
  }
}

/** A count, written the way a reader would say it. */
export function asCount(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

/** The lines a reader would gather before answering. */
export function asReuseport(setup: Setup): { name: string; value: string; unit: string }[] {
  return [
    {
      name: "the listeners",
      value: asCount(setup.before, "listener"),
      unit: `${setup.job} on ${setup.host}, all bound to port ${setup.port}`,
    },
    {
      name: "SO_REUSEPORT",
      value: setup.reusePort ? "set on every one" : "not set",
      unit: setup.reusePort
        ? "so they all bind, which without it is EADDRINUSE on the second"
        : "so the second bind fails and there is only ever one listener",
    },
    {
      name: "what changes",
      value: asChange(setup.change),
      unit: resized(setup)
        ? `the set goes from ${setup.before} to ${after(setup)}`
        : "the set is the same size afterwards",
    },
    {
      name: "connections",
      value: `${setup.connections}`,
      unit: "arriving after the change has settled, from clients the kernel has not seen before",
    },
    {
      name: "the spread",
      value: binds(setup) && after(setup) > 0 ? `${each(setup)} each` : "none of them arrive",
      unit: "even, to within the noise, whatever the count is",
    },
    {
      name: "the hash",
      value: `over ${after(setup)}`,
      unit: "the kernel picks by hashing the connection's four tuple across the current set, and that is not a consistent hash",
    },
  ];
}

/** One place that decides a claim, so the gate and the page cannot disagree. */
export function claimHolds(claim: Claim, setup: Setup): boolean {
  switch (claim.about) {
    case "binds":
      return claim.value === binds(setup);
    case "each":
      return claim.value === each(setup);
    case "after":
      return claim.value === after(setup);
    case "moved":
      return claim.value === movedPercent(setup);
    case "stable":
      return claim.value === stable(setup);
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
