/** The descriptor limit surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedLimits, recordSolvedLimit } from "./progress";

import { CASES } from "./data/cases";
export const limitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
