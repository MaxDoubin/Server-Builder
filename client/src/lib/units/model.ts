/**
 * The transaction, the ordering, and what ends up running.
 *
 * Four steps, kept apart because each one is a different question and the
 * whole subject is that people answer them as though they were one:
 *
 *   pull      which units enter the transaction at all
 *   order     which of them are ordered against which
 *   run       what starts, in that order, and what a failure blocks
 *   settle    what an explicit stop drags down with it
 *
 * The rules are systemd.unit(5) and systemd.service(5) rather than a
 * reasonable reading of them, and where the two differ the manual wins. The
 * sharpest case of that is in `run`: a failed Requires= dependency only
 * blocks a unit when After= is also set, which is a sentence people read the
 * first half of.
 */

import type { Case, Claim, Failure, Option, Outcome, StartType, Unit } from "./types";

const listed = (unit: Unit, key: "requires" | "wants" | "requisite" | "bindsTo" | "partOf" | "after" | "before") =>
  unit[key] ?? [];

/** Everything that pulls another unit into the transaction. */
const pulls = (unit: Unit): string[] => [
  ...listed(unit, "requires"),
  ...listed(unit, "wants"),
  ...listed(unit, "bindsTo"),
];

/**
 * Every dependency that can stop this unit from starting, with whether it is
 * ordered against it.
 *
 * The pairing is the point. Requires= and BindsTo= only block when After= is
 * set on the same unit, because a transaction with no ordering starts both at
 * once and this one has already gone by the time the other fails.
 */
const blockers = (unit: Unit): { name: string; ordered: boolean }[] => {
  const after = new Set(listed(unit, "after"));
  return [...listed(unit, "requires"), ...listed(unit, "bindsTo")].map((name) => ({
    name,
    ordered: after.has(name),
  }));
};

export const unitNamed = (units: Unit[], name: string): Unit | undefined =>
  units.find((unit) => unit.name === name);

/**
 * What "started" means for a type, in words.
 *
 * simple is the default, and it is forked rather than executed: systemd has
 * called fork and not yet waited for execve, so the unit is active before the
 * kernel has been asked to run the binary at all.
 */
export const meansStarted: Record<StartType, string> = {
  simple: "the process has been forked, before execve",
  exec: "the binary has been executed",
  forking: "the parent process has exited",
  oneshot: "the process has run and exited",
  notify: "the service has sent READY=1",
};

/** Does this type notice a binary that cannot be run? */
export const noticesABrokenExec = (type: StartType): boolean => type !== "simple";

/** Units reached from the start set, following the pulling dependencies. */
export function pull(units: Unit[], start: string[]): { transaction: string[]; notPulled: string[] } {
  const seen: string[] = [];
  const queue = [...start];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.includes(name)) continue;
    const unit = unitNamed(units, name);
    if (!unit) continue;
    seen.push(name);
    for (const next of pulls(unit)) if (!seen.includes(next)) queue.push(next);
  }
  /*
    Named and not reached. Requisite= is here by design rather than by
    omission: it is a requirement that deliberately does not pull, so a unit
    listed only there never enters the transaction, and a reader who expects
    it to has the wrong model of the directive.
  */
  const named = new Set<string>();
  for (const name of seen) {
    const unit = unitNamed(units, name);
    if (!unit) continue;
    for (const other of [...pulls(unit), ...listed(unit, "requisite"), ...listed(unit, "after"), ...listed(unit, "before")]) {
      named.add(other);
    }
  }
  return {
    transaction: seen,
    notPulled: [...named].filter((name) => !seen.includes(name) && unitNamed(units, name)).sort(),
  };
}

/** Ordering edges among the transaction, as [before, after]. */
export function edgesOf(units: Unit[], transaction: string[]): [string, string][] {
  const out: [string, string][] = [];
  const inside = (name: string) => transaction.includes(name);
  for (const name of transaction) {
    const unit = unitNamed(units, name)!;
    for (const other of listed(unit, "after")) if (inside(other)) out.push([other, name]);
    for (const other of listed(unit, "before")) if (inside(other)) out.push([name, other]);
  }
  /* An edge declared from both ends is one edge. */
  return out.filter(
    ([before, after], at) => out.findIndex(([b, a]) => b === before && a === after) === at,
  );
}

/** A cycle in the ordering, as the units on it, or null. */
export function cycleIn(transaction: string[], edges: [string, string][]): string[] | null {
  const next = (name: string) => edges.filter(([before]) => before === name).map(([, after]) => after);
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const walk = (name: string): string[] | null => {
    if (state.get(name) === "open") return stack.slice(stack.indexOf(name));
    if (state.get(name) === "done") return null;
    state.set(name, "open");
    stack.push(name);
    for (const child of next(name)) {
      const found = walk(child);
      if (found) return found;
    }
    stack.pop();
    state.set(name, "done");
    return null;
  };
  for (const name of transaction) {
    const found = walk(name);
    if (found) return found;
  }
  return null;
}

/**
 * A start order, or null when a cycle leaves it undefined.
 *
 * Kahn's algorithm with a stable tie-break on the transaction order, so two
 * units nothing orders come out in the order they were pulled in. That is a
 * presentation choice and not a claim: systemd starts them in parallel, and
 * `unordered` is what the model says about such a pair.
 */
export function orderOf(transaction: string[], edges: [string, string][]): string[] | null {
  if (cycleIn(transaction, edges)) return null;
  const waiting = new Map(transaction.map((name) => [name, edges.filter(([, after]) => after === name).length]));
  const out: string[] = [];
  while (out.length < transaction.length) {
    const ready = transaction.filter((name) => !out.includes(name) && waiting.get(name) === 0);
    if (ready.length === 0) return null;
    const name = ready[0];
    out.push(name);
    for (const [before, after] of edges) {
      if (before === name) waiting.set(after, (waiting.get(after) ?? 0) - 1);
    }
  }
  return out;
}

/**
 * Units grouped by when they can start: everything in one group at once.
 *
 * A model concept rather than a drawing aid. systemd starts a transaction as
 * parallel as the ordering allows, so two units in the same group here really
 * do start at the same moment, and the reader's question on half these cases
 * is exactly whether two units are in the same group. A unit's group is one
 * past the last of everything ordered before it.
 *
 * Null on a cycle, for the same reason the order is null: which edge systemd
 * deletes is not something the unit files decide.
 */
export function levels(transaction: string[], edges: [string, string][]): string[][] | null {
  const order = orderOf(transaction, edges);
  if (!order) return null;
  const depth = new Map<string, number>();
  for (const name of order) {
    const before = edges.filter(([, after]) => after === name).map(([b]) => depth.get(b) ?? 0);
    depth.set(name, before.length === 0 ? 0 : Math.max(...before) + 1);
  }
  const deepest = Math.max(0, ...depth.values());
  const out: string[][] = [];
  for (let at = 0; at <= deepest; at += 1) {
    out.push(order.filter((name) => depth.get(name) === at));
  }
  return out;
}

/** Is there a path from one unit to another through the ordering edges? */
export function ordered(edges: [string, string][], before: string, after: string): boolean {
  const seen = new Set<string>();
  const queue = [before];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (name === after && name !== before) return true;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const [from, to] of edges) if (from === name) queue.push(to);
  }
  return false;
}

/**
 * What starts, what fails, and what an explicit stop drags with it.
 *
 * Walked in the start order so that a dependency's outcome is known before
 * the unit that depends on it is considered. Where there is no order, the
 * transaction order is used, which is exactly the case where the answer does
 * not depend on it: an unordered dependency cannot block anything.
 */
export function run(units: Unit[], start: string[], stop: string[] = []): Outcome {
  const { transaction, notPulled } = pull(units, start);
  const edges = edgesOf(units, transaction);
  const cycle = cycleIn(transaction, edges);
  const order = orderOf(transaction, edges);

  const active = new Set(units.filter((unit) => unit.alreadyActive).map((unit) => unit.name));
  const failed: Failure[] = [];
  const note = (unit: string, why: Failure["why"]) => {
    if (!failed.some((entry) => entry.unit === unit)) failed.push({ unit, why });
    active.delete(unit);
  };

  for (const name of order ?? transaction) {
    const unit = unitNamed(units, name)!;

    /* Requisite= is not pulled in, so it has to be running already. */
    const missing = listed(unit, "requisite").find((other) => !active.has(other));
    if (missing !== undefined) {
      note(name, "requisite-inactive");
      continue;
    }

    /* A failed dependency blocks this unit only when After= is also set. */
    const blocked = blockers(unit).find(
      (dep) => dep.ordered && failed.some((entry) => entry.unit === dep.name),
    );
    if (blocked) {
      note(name, "dependency-failed");
      continue;
    }

    /* And the binary. Type=simple never finds out. */
    if (unit.execWorks === false && noticesABrokenExec(unit.type)) {
      note(name, "exec-failed");
      continue;
    }
    active.add(name);
  }

  /*
    Explicit stops, and what follows them down. BindsTo= goes because the
    binding says this unit may never be active without the other. PartOf=
    goes because stopping the listed unit propagates here. Requires= also
    propagates an explicit stop, with or without After=, which is the one
    place Requires= acts without needing ordering.
  */
  let changed = true;
  const stopped = new Set(stop);
  while (changed) {
    changed = false;
    for (const unit of units) {
      if (!active.has(unit.name)) continue;
      const gone = (name: string) => stopped.has(name) || !active.has(name);
      if (listed(unit, "bindsTo").some(gone) || listed(unit, "requires").some((n) => stopped.has(n))) {
        note(unit.name, "stopped-with-binding");
        stopped.add(unit.name);
        changed = true;
      } else if (listed(unit, "partOf").some((n) => stopped.has(n))) {
        note(unit.name, "stopped-with-parent");
        stopped.add(unit.name);
        changed = true;
      }
    }
    for (const name of stop) {
      if (active.delete(name)) changed = true;
    }
  }

  return {
    transaction,
    edges,
    cycle,
    order,
    active: [...active].sort(),
    failed,
    notPulled,
  };
}

/** Does a claim hold of an outcome? */
export function holds(claim: Claim, outcome: Outcome, units: Unit[]): boolean {
  switch (claim.about) {
    case "active": {
      const want = new Set(claim.units);
      return want.size === outcome.active.length && outcome.active.every((name) => want.has(name));
    }
    case "inactive":
      return !outcome.active.includes(claim.unit);
    case "not-pulled":
      return outcome.notPulled.includes(claim.unit);
    case "ordered":
      return ordered(outcome.edges, claim.before, claim.after);
    case "unordered":
      return (
        outcome.transaction.includes(claim.a) &&
        outcome.transaction.includes(claim.b) &&
        !ordered(outcome.edges, claim.a, claim.b) &&
        !ordered(outcome.edges, claim.b, claim.a)
      );
    case "active-not-running": {
      const unit = unitNamed(units, claim.unit);
      return (
        unit !== undefined &&
        outcome.active.includes(claim.unit) &&
        unit.execWorks === false &&
        !noticesABrokenExec(unit.type)
      );
    }
    case "cycle":
      return outcome.cycle !== null;
    case "nothing":
      return false;
  }
}

export const outcomeOf = (item: Case): Outcome => run(item.units, item.start, item.stop);

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case): Option[] => {
  const outcome = outcomeOf(item);
  return item.options.filter((option) => holds(option.says, outcome, item.units));
};

/**
 * The option that is right, found rather than declared.
 *
 * The data carries unit files and a systemctl command. The model works out
 * what happens. CI requires exactly one option to match, so an option set
 * that has drifted from its own unit files fails the build.
 */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** The directives one unit declares, for the rendered unit file. */
export function directivesOf(unit: Unit): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, name] of [
    ["requires", "Requires"],
    ["wants", "Wants"],
    ["requisite", "Requisite"],
    ["bindsTo", "BindsTo"],
    ["partOf", "PartOf"],
    ["after", "After"],
    ["before", "Before"],
  ] as const) {
    const values = listed(unit, key);
    if (values.length > 0) out.push([name, values.join(" ")]);
  }
  return out;
}
