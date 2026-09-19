/** The shared memory surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedShm, recordSolvedShm } from "./progress";

import { CASES } from "./data/cases";
export const shmCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
