/**
 * The modification notice on a cover photo's credit line.
 *
 * Every credited cover is a derivative: script/sourceCoverImage.py center
 * crops the source to 16:9 and saves it at 1600x900, and the older covers
 * were made the same way. CC BY 4.0 and BY-SA 4.0 (section 3(a)(1)(B))
 * require indicating that the material was modified, and the 2.0 to 3.0
 * licenses require a credit identifying the original's use in the
 * adaptation. Saying it once here, rather than in each post's data, means a
 * new cover is credited correctly without anyone remembering to.
 */

import type { CoverCredit } from "./postIndex";

export const COVER_MODIFICATION = "Cropped and resized";

/** The notice for one credit, or null when the cover is unmodified. */
export function coverModification(credit: CoverCredit): string | null {
  if (credit.modified === false) return null;
  return credit.modified ?? COVER_MODIFICATION;
}
