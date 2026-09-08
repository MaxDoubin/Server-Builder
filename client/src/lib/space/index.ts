/** The ENOSPC surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedSpaces, recordSolvedSpace } from "./progress";

import { CASES } from "./data/cases";
export const spaceCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
