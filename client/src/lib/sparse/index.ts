/** The sparse file surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedSparse, recordSolvedSparse } from "./progress";

import { CASES } from "./data/cases";
export const sparseCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
