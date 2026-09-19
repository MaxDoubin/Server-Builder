/** The accept queue surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedBacklog, recordSolvedBacklog } from "./progress";

import { CASES } from "./data/cases";
export const backlogCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
