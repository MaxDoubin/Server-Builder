/** The unit ordering surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedUnits, recordSolvedUnit } from "./progress";

import { CASES } from "./data/cases";
export const unitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
