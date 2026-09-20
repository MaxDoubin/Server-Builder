/** The overcommit accounting surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedOvercommit, recordSolvedOvercommit } from "./progress";

import { CASES } from "./data/cases";
export const overcommitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
