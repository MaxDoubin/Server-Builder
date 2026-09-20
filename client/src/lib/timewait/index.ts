/** The TIME_WAIT surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedTimewait, recordSolvedTimewait } from "./progress";

import { CASES } from "./data/cases";
export const timewaitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
