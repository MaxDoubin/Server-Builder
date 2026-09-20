/** The concurrent append surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedAppend, recordSolvedAppend } from "./progress";

import { CASES } from "./data/cases";
export const appendCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
