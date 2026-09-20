/** The atomic write size surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedPipebuf, recordSolvedPipebuf } from "./progress";

import { CASES } from "./data/cases";
export const pipebufCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
