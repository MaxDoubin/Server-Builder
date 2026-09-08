/** The capture registry. */
import type { Capture } from "./types";
import { credentialsInTheClear } from "./data/credentials-in-the-clear";
import { theBeacon } from "./data/the-beacon";

export const CAPTURES: Capture[] = [credentialsInTheClear, theBeacon];

export const getCapture = (slug: string): Capture | undefined =>
  CAPTURES.find((capture) => capture.slug === slug);

export * from "./types";
export { compileFilter } from "./filter";
