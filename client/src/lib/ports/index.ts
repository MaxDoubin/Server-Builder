/** The ephemeral port surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedPorts, recordSolvedPort } from "./progress";

import { CASES } from "./data/cases";
export const portCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
