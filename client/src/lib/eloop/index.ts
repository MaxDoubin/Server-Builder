/** The symlink traversal budget surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedEloop, recordSolvedEloop } from "./progress";

import { CASES } from "./data/cases";
export const eloopCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
