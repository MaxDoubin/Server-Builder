/** The socket receive buffer surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedRcvbuf, recordSolvedRcvbuf } from "./progress";

import { CASES } from "./data/cases";
export const rcvbufCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
