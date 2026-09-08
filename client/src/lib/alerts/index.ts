/** The alerting surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedAlerts, recordSolvedAlert } from "./progress";

import { CASES } from "./data/cases";
export const alertCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
