/** The SSH random early drop surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedMaxstartups, recordSolvedMaxstartups } from "./progress";

import { CASES } from "./data/cases";
export const maxstartupsCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
