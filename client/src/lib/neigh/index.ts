/** The neighbor table surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedNeigh, recordSolvedNeigh } from "./progress";

import { CASES } from "./data/cases";
export const neighCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
