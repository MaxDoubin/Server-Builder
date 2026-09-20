/** The dirty page writeback surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedWriteback, recordSolvedWriteback } from "./progress";

import { CASES } from "./data/cases";
export const writebackCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
