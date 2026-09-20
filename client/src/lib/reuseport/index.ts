/** The port sharing surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedReuseport, recordSolvedReuseport } from "./progress";

import { CASES } from "./data/cases";
export const reuseportCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
