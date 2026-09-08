/** The resolver registry. */
export { WORLD } from "./data/world";
export { CASES } from "./data/cases";
export type { Case, Option } from "./data/cases";
export { resolve } from "./resolver";
export { correctOption, matching } from "./answer";
export * from "./types";
export { loadSolvedResolves, recordSolvedResolves } from "./progress";
