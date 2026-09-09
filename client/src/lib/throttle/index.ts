/** The CPU quota surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedThrottles, recordSolvedThrottle } from "./progress";

import { CASES } from "./data/cases";
export const throttleCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
