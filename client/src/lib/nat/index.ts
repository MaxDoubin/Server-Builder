/** The address translation surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedNats, recordSolvedNat } from "./progress";

import { CASES } from "./data/cases";
export const natCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
