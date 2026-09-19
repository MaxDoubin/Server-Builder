/** The search list surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedNdots, recordSolvedNdots } from "./progress";

import { CASES } from "./data/cases";
export const ndotsCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
