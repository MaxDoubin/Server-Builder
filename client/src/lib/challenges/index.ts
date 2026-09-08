/** The challenge registry. */
import type { Challenge, ChallengeDifficulty } from "./types";
import { SET_ONE } from "./data/set-one";

export const CHALLENGES: Challenge[] = SET_ONE;

export const getChallenge = (slug: string): Challenge | undefined =>
  CHALLENGES.find((challenge) => challenge.slug === slug);

export const CHALLENGE_ORDER: ChallengeDifficulty[] = ["easy", "medium", "hard"];

export * from "./types";
