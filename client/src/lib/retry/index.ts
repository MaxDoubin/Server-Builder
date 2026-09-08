/** The retry amplification surface. */
export { CHAINS } from "./data/chains";
export * from "./model";
export * from "./types";
export { loadSolvedRetries, recordSolvedRetry } from "./progress";

import { CHAINS } from "./data/chains";
export const chainFor = (slug: string) => CHAINS.find((item) => item.slug === slug);
