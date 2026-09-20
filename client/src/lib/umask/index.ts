/** The umask surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedUmask, recordSolvedUmask } from "./progress";

import { CASES } from "./data/cases";
export const umaskCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
