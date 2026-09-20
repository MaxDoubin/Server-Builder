/** The exec argument budget surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedArgmax, recordSolvedArgmax } from "./progress";

import { CASES } from "./data/cases";
export const argmaxCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
