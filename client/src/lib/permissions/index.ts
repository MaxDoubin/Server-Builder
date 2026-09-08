/** The file permissions surface. */
export { CASES } from "./data/cases";
export * from "./model";
export * from "./types";
export { loadSolvedPermissions, recordSolvedPermission } from "./progress";

import { CASES } from "./data/cases";
export const permissionCaseFor = (slug: string) => CASES.find((item) => item.slug === slug);
