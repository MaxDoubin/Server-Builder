/** The TCP retransmission budget surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedRetrans, recordSolvedRetrans } from "./progress";

import { CASES } from "./data/cases";
export const retransCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
