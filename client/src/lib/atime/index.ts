/** The access time surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedAtime, recordSolvedAtime } from "./progress";

import { CASES } from "./data/cases";
export const atimeCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
