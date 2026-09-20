/** The signal delivery surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedSignals, recordSolvedSignals } from "./progress";

import { CASES } from "./data/cases";
export const signalsCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
