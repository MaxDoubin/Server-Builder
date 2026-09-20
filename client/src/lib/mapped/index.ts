/** The file mapping surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedMapped, recordSolvedMapped } from "./progress";

import { CASES } from "./data/cases";
export const mappedCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
