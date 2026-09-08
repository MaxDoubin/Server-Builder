/** The address plan registry. */
export { PROBLEMS, PROBLEM_ORDER } from "./data/problems";
export { review } from "./review";
export * from "./cidr";
export * from "./types";

import { PROBLEMS } from "./data/problems";
export const getProblem = (slug: string) => PROBLEMS.find((p) => p.slug === slug);
