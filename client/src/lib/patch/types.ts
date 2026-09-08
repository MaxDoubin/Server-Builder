/**
 * Ten advisories, one afternoon, and the queue is sorted wrong.
 *
 * Every vulnerability management tool sorts by CVSS base score, because it is
 * the only number that arrives with the advisory. So the queue puts a 9.8 at
 * the top and a 6.5 near the bottom, and the person working it starts at the
 * top, and that is the wrong order often enough to matter.
 *
 * The CVSS specification says so itself, in as many words: the base score
 * describes the intrinsic characteristics of a vulnerability and is meant to
 * be modified by the temporal and environmental metrics, which almost nobody
 * fills in. A base score cannot know whether the affected component is
 * reachable from where an attacker is, whether the feature is even enabled in
 * your build, whether anybody is exploiting it, or what the machine does. All
 * four change the answer, and none of them is in the number.
 *
 * The four decision points here are the ones CERT/CC settled on for SSVC, and
 * the tree they feed is transcribed in ./data/tree.ts rather than
 * reimplemented. Extracting them correctly from a description of your own
 * estate is the whole skill, and it is where this goes wrong in practice:
 * people read "pre-auth remote code execution, CVSS 9.8" and never get as far
 * as asking whether the thing is reachable.
 *
 * The advisories are constructed. The framework, the scoring system and the
 * numbers about them are real and cited on the page.
 */

/** Is anybody actually using it. */
export type Exploitation = "none" | "public-poc" | "active";

/**
 * How reachable the affected component is, from where an attacker would be.
 *
 * Small is the one people get wrong. It does not mean the host is small or
 * the deployment is small: it means the vulnerable component's attack surface
 * is limited to a handful of local users or is not exposed at all, which
 * includes the very common case of the affected feature not being enabled.
 */
export type Exposure = "small" | "controlled" | "open";

/** Can steps one to four of the kill chain be driven in a loop by a script. */
export type Automatable = "no" | "yes";

/** What it costs the people who depend on the system, safety included. */
export type HumanImpact = "low" | "medium" | "high" | "very-high";

/** What to do about it, which is a schedule rather than a severity. */
export type Priority = "defer" | "scheduled" | "out-of-cycle" | "immediate";

export interface Points {
  exploitation: Exploitation;
  exposure: Exposure;
  automatable: Automatable;
  impact: HumanImpact;
}

export interface Finding {
  /** A vendor advisory reference. Constructed, like every host on this site. */
  id: string;
  product: string;
  /** What the vendor says is wrong, in the vendor's register. */
  summary: string;
  /** The base score as published. */
  cvss: number;
  /**
   * The word the vendor prints beside the score.
   *
   * Derived from the score by the qualitative severity rating scale in the
   * specification, so it carries no information the score does not, and CI
   * checks it against the score rather than trusting it. It is here because
   * it is what people actually react to.
   */
  severity: "Low" | "Medium" | "High" | "Critical";
  /** What your own estate looks like. This is the evidence. */
  estate: string[];
  points: Points;
  /** Why each point is what it is, shown once the reader has answered. */
  because: Record<keyof Points, string>;
  /**
   * The reading this finding is built to catch, named.
   *
   * CI requires every finding to have one and no two to share it, so that ten
   * findings are ten lessons rather than one lesson ten times.
   */
  trap: string;
}
