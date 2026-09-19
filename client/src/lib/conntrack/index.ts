/** The connection tracking table surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedConntrack, recordSolvedConntrack } from "./progress";

import { CASES } from "./data/cases";
export const conntrackCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
