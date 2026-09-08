/** The clock skew surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedClocks, recordSolvedClock } from "./progress";

import { CASES } from "./data/cases";
export const clockCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
