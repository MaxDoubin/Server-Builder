/**
 * Which option is right, worked out rather than declared.
 *
 * The case presents a chain and a symptom and offers four things somebody
 * might conclude. The validator runs, and the option asserting what it found
 * is the answer. Nothing in the data says which one that is, so an option
 * cannot be marked right by a number that has drifted from the prose beside
 * it, and a change to the validator that moves a fault fails CI instead of
 * quietly teaching the wrong lesson.
 *
 * There is deliberately no fallback: no match or several returns nothing, and
 * CI proves every case has exactly one, so a shipped build never gets there.
 */

import type { ChainCase, Option } from "./data/cases";
import { validate } from "./validate";

/**
 * Every option asserting what the validator found.
 *
 * An option has to name a fault to be a candidate. Blaming a party without
 * naming a fault is not a claim about the chain, and letting it match would
 * make "The kiosk's clock is wrong" correct on any case the client has to
 * fix, which is most of them.
 */
export const matching = (item: ChainCase): Option[] => {
  const found = validate(item.presented, item.store, item.hostname, item.now, item.extra ?? []);
  return item.options.filter(
    (option) =>
      option.names !== null &&
      option.names === found.fault &&
      (option.blames === null || option.blames === found.owner),
  );
};

/** The one right option, or nothing when the case does not have exactly one. */
export const correctOption = (item: ChainCase): Option | null => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};
