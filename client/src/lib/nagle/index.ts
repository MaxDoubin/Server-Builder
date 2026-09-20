/** The Nagle and delayed acknowledgement surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedNagle, recordSolvedNagle } from "./progress";

import { CASES } from "./data/cases";
export const nagleCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
