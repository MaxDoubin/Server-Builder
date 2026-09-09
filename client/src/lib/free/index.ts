/** The memory estimate surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedFree, recordSolvedFree } from "./progress";

import { CASES } from "./data/cases";
export const freeCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
