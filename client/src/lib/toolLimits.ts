/**
 * Ceilings the tool pages enforce, and quote in their own prose.
 *
 * They live here rather than in the page components because toolNotes.ts
 * interpolates them into the explanatory text. A note that says "stops after
 * six levels" while the code stops after eight is a bug the reader finds
 * before anyone else does, so the number is read from one place.
 */

/** CIDR visualizer: how many split levels the diagram draws. */
export const MAX_LEVELS = 6;

/** CIDR visualizer: how many resulting blocks the list enumerates. */
export const MAX_LISTED = 64;

/** Regex tester: how long a match may run in the worker before it is cut off. */
export const TIME_BUDGET_MS = 250;
