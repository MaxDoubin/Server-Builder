/** The systemd start rate limit surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedStartlimit, recordSolvedStartlimit } from "./progress";

import { CASES } from "./data/cases";
export const startlimitCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
