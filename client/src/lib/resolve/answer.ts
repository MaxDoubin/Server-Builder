/**
 * Which option is right, worked out rather than declared.
 *
 * The case describes a symptom and offers four things somebody might
 * conclude from it. The resolver runs against the same world the trace box
 * uses, and the option naming what it reached is the answer. Nothing in the
 * data says which one that is, so an option cannot be marked right by a
 * number that has drifted away from the prose beside it.
 *
 * There is deliberately no fallback. If no option names the outcome, or more
 * than one does, this returns nothing and the page has no answer to show,
 * which is a loud failure rather than a quiet wrong one. CI checks every case
 * has exactly one, so the loud failure is not reachable from a shipped build.
 */

import { WORLD } from "./data/world";
import type { Case, Option } from "./data/cases";
import { resolve } from "./resolver";

/** Every option whose claim names what the resolver actually reached. */
export const matching = (item: Case): Option[] => {
  const reached = resolve(WORLD, item.name, item.type).outcome;
  return item.options.filter((option) => option.names === reached);
};

/** The one right option, or nothing when the case does not have exactly one. */
export const correctOption = (item: Case): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};
