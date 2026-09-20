/** The inotify limits surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedInotify, recordSolvedInotify } from "./progress";

import { CASES } from "./data/cases";
export const inotifyCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
