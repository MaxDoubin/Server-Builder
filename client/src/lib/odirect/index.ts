/** The direct I/O surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedOdirect, recordSolvedOdirect } from "./progress";

import { CASES } from "./data/cases";
export const odirectCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
