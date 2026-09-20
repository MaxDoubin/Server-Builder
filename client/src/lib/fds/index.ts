/** The open file descriptor limit surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedFds, recordSolvedFds } from "./progress";

import { CASES } from "./data/cases";
export const fdsCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
