/**
 * The published deployer decision tree, transcribed.
 *
 * All 72 rows of it, which is every combination of the four decision points:
 * three states of exploitation, three of exposure, two of automatability and
 * four of human impact. Transcribed rather than reimplemented, because the
 * value of using somebody else's framework is entirely lost if you rewrite
 * its judgments as your own heuristics along the way.
 *
 * Source: CERT/CC, SSVC deployer decision tree.
 * https://certcc.github.io/SSVC/howto/deployer_tree/
 *
 * Two properties of the table are worth seeing before you use it, and CI
 * checks both so that a bad transcription shows up as a failure rather than
 * as a subtly wrong lesson:
 *
 *   Only three of the 72 rows say immediate, and all three need exploitation
 *   to be active and exposure to be open. Nothing you merely fear reaches the
 *   top of the queue.
 *
 *   No row with active exploitation says defer. Something being exploited in
 *   the wild always gets scheduled at least, whatever else is true of it.
 */

import type { Points, Priority } from "../types";

export const TREE: Record<string, Priority> = {
  "none|small|no|low": "defer",
  "none|small|no|medium": "defer",
  "none|small|no|high": "scheduled",
  "none|small|no|very-high": "scheduled",
  "none|small|yes|low": "defer",
  "none|small|yes|medium": "scheduled",
  "none|small|yes|high": "scheduled",
  "none|small|yes|very-high": "scheduled",
  "none|controlled|no|low": "defer",
  "none|controlled|no|medium": "scheduled",
  "none|controlled|no|high": "scheduled",
  "none|controlled|no|very-high": "scheduled",
  "none|controlled|yes|low": "scheduled",
  "none|controlled|yes|medium": "scheduled",
  "none|controlled|yes|high": "scheduled",
  "none|controlled|yes|very-high": "scheduled",
  "none|open|no|low": "defer",
  "none|open|no|medium": "scheduled",
  "none|open|no|high": "scheduled",
  "none|open|no|very-high": "scheduled",
  "none|open|yes|low": "scheduled",
  "none|open|yes|medium": "scheduled",
  "none|open|yes|high": "scheduled",
  "none|open|yes|very-high": "out-of-cycle",
  "public-poc|small|no|low": "defer",
  "public-poc|small|no|medium": "scheduled",
  "public-poc|small|no|high": "scheduled",
  "public-poc|small|no|very-high": "scheduled",
  "public-poc|small|yes|low": "scheduled",
  "public-poc|small|yes|medium": "scheduled",
  "public-poc|small|yes|high": "scheduled",
  "public-poc|small|yes|very-high": "scheduled",
  "public-poc|controlled|no|low": "defer",
  "public-poc|controlled|no|medium": "scheduled",
  "public-poc|controlled|no|high": "scheduled",
  "public-poc|controlled|no|very-high": "scheduled",
  "public-poc|controlled|yes|low": "scheduled",
  "public-poc|controlled|yes|medium": "scheduled",
  "public-poc|controlled|yes|high": "scheduled",
  "public-poc|controlled|yes|very-high": "out-of-cycle",
  "public-poc|open|no|low": "scheduled",
  "public-poc|open|no|medium": "scheduled",
  "public-poc|open|no|high": "scheduled",
  "public-poc|open|no|very-high": "out-of-cycle",
  "public-poc|open|yes|low": "scheduled",
  "public-poc|open|yes|medium": "scheduled",
  "public-poc|open|yes|high": "out-of-cycle",
  "public-poc|open|yes|very-high": "out-of-cycle",
  "active|small|no|low": "scheduled",
  "active|small|no|medium": "scheduled",
  "active|small|no|high": "out-of-cycle",
  "active|small|no|very-high": "out-of-cycle",
  "active|small|yes|low": "scheduled",
  "active|small|yes|medium": "out-of-cycle",
  "active|small|yes|high": "out-of-cycle",
  "active|small|yes|very-high": "out-of-cycle",
  "active|controlled|no|low": "scheduled",
  "active|controlled|no|medium": "scheduled",
  "active|controlled|no|high": "out-of-cycle",
  "active|controlled|no|very-high": "out-of-cycle",
  "active|controlled|yes|low": "out-of-cycle",
  "active|controlled|yes|medium": "out-of-cycle",
  "active|controlled|yes|high": "out-of-cycle",
  "active|controlled|yes|very-high": "out-of-cycle",
  "active|open|no|low": "scheduled",
  "active|open|no|medium": "out-of-cycle",
  "active|open|no|high": "out-of-cycle",
  "active|open|no|very-high": "immediate",
  "active|open|yes|low": "out-of-cycle",
  "active|open|yes|medium": "out-of-cycle",
  "active|open|yes|high": "immediate",
  "active|open|yes|very-high": "immediate",
};

/** The key shape the table is indexed by. Kept next to the table it serves. */
export const keyFor = (points: Points): string =>
  `${points.exploitation}|${points.exposure}|${points.automatable}|${points.impact}`;
