/** The proportional set size surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedPss, recordSolvedPss } from "./progress";

import { CASES } from "./data/cases";
export const pssCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
