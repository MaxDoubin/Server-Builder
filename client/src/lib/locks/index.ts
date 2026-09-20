/** The file locking surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedLocks, recordSolvedLocks } from "./progress";

import { CASES } from "./data/cases";
export const locksCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
