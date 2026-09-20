/** The page cache surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedPagecache, recordSolvedPagecache } from "./progress";

import { CASES } from "./data/cases";
export const pagecacheCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
