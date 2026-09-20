/** The descriptor set surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedFdset, recordSolvedFdset } from "./progress";

import { CASES } from "./data/cases";
export const fdsetCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
