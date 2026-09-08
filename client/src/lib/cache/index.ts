/** The shared cache surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedCaches, recordSolvedCache } from "./progress";

import { CASES } from "./data/cases";
export const cacheCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
