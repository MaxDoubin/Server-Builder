/** The exit status surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedExit, recordSolvedExit } from "./progress";

import { CASES } from "./data/cases";
export const exitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
