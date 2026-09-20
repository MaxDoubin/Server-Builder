/** The memory you freed and still hold. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedMalloctrim, recordSolvedMalloctrim } from "./progress";

import { CASES } from "./data/cases";
export const malloctrimCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
