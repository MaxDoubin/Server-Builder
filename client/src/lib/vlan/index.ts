/** The VLAN tagging surface. */
export { PATHS } from "./data/paths";
export * from "./model";
export * from "./types";
export { loadSolvedVlans, recordSolvedVlan } from "./progress";

import { PATHS } from "./data/paths";
export const vlanPathFor = (slug: string) => PATHS.find((item) => item.slug === slug);
