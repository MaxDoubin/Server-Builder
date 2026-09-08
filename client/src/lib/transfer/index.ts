/** The throughput surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedTransfers, recordSolvedTransfer } from "./progress";

import { CASES } from "./data/cases";
export const caseFor = (slug: string) => CASES.find((item) => item.slug === slug);
