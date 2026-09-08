/**
 * The scenario registry.
 *
 * Every scenario is a static import rather than a lazy one: the whole set is
 * a few hundred kilobytes of prose, the index page needs each one's metadata
 * and path count to render a card, and rarity is computed from the graph, so
 * there is nothing useful to defer. The route itself is lazy, which is where
 * the saving actually is.
 */

import type { Difficulty, Scenario } from "./types";
import { diskFullFriday } from "./data/disk-full-friday";
import { eastWingOffline } from "./data/east-wing-offline";
import { invoiceFromTheCeo } from "./data/invoice-from-the-ceo";
import { keyInTheRepo } from "./data/key-in-the-repo";
import { ransomware0214 } from "./data/ransomware-0214";

/** Registration order does not matter: the index groups by difficulty. */
export const SCENARIOS: Scenario[] = [
  invoiceFromTheCeo,
  diskFullFriday,
  keyInTheRepo,
  eastWingOffline,
  ransomware0214,
];

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard", "expert"];

export const getScenario = (slug: string): Scenario | undefined =>
  SCENARIOS.find((scenario) => scenario.slug === slug);

export const scenariosByDifficulty = (): { difficulty: Difficulty; items: Scenario[] }[] =>
  DIFFICULTY_ORDER.map((difficulty) => ({
    difficulty,
    items: SCENARIOS.filter((scenario) => scenario.difficulty === difficulty),
  })).filter((group) => group.items.length > 0);

export const CATEGORIES = (): string[] =>
  [...new Set(SCENARIOS.map((scenario) => scenario.category))].sort((a, b) => a.localeCompare(b, "en"));

export * from "./types";
