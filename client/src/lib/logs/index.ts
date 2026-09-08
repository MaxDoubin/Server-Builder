/** The log reading surface. */
export { CASES } from "./data/cases";
export * from "./format";
export * from "./types";
export { loadSolvedLogs, recordSolvedLog } from "./progress";

import { CASES } from "./data/cases";
export const logCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
