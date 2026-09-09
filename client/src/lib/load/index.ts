/** The load average surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedLoads, recordSolvedLoad } from "./progress";

import { CASES } from "./data/cases";
export const loadCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
