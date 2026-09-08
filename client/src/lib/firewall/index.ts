/** The firewall registry, and the one function the page and CI share. */
import { evaluate } from "./evaluate";
import { parseRuleset } from "./parse";
import { EXERCISES, type Exercise } from "./data/exercises";
import type { Action } from "./types";

export const getExercise = (slug: string): Exercise | undefined =>
  EXERCISES.find((exercise) => exercise.slug === slug);

export interface Check {
  label: string;
  expect: Action;
  got: Action | null;
  pass: boolean;
}

/**
 * Run every expectation against a ruleset.
 *
 * A parse error is not a failure of any single expectation, so it comes back
 * as `got: null` on all of them and the caller says what happened once.
 */
export function checkRuleset(exercise: Exercise, source: string): Check[] {
  const parsed = parseRuleset(source);
  if (Array.isArray(parsed)) {
    return exercise.expectations.map((e) => ({
      label: e.label,
      expect: e.expect,
      got: null,
      pass: false,
    }));
  }
  return exercise.expectations.map((e) => {
    const got = evaluate(parsed, e.packet).verdict;
    return { label: e.label, expect: e.expect, got, pass: got === e.expect };
  });
}

export const isSolved = (exercise: Exercise, source: string): boolean =>
  checkRuleset(exercise, source).every((check) => check.pass);

export * from "./types";
export * from "./parse";
export * from "./evaluate";
export { EXERCISES, EXERCISE_ORDER } from "./data/exercises";
export type { Exercise, Expectation, Difficulty } from "./data/exercises";
