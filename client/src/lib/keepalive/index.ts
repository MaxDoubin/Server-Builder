/** The idle connection surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedKeepalive, recordSolvedKeepalive } from "./progress";

import { CASES } from "./data/cases";
export const keepaliveCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
