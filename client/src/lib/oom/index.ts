/** The OOM killer surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedOoms, recordSolvedOom } from "./progress";

import { CASES } from "./data/cases";
export const oomCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
