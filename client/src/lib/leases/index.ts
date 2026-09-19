/** The lease timing surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedLeases, recordSolvedLeases } from "./progress";

import { CASES } from "./data/cases";
export const leasesCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
