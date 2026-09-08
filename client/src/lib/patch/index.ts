/** The patch prioritisation surface. */
export { FINDINGS } from "./data/findings";
export { TREE, keyFor } from "./data/tree";
export * from "./model";
export * from "./types";
export { loadSolvedPatches, recordSolvedPatch } from "./progress";

import { FINDINGS } from "./data/findings";
export const findingFor = (id: string) => FINDINGS.find((item) => item.id === id);
