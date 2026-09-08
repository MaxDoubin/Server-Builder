/**
 * The one list of things on this site you do rather than read.
 *
 * There was no such list. The home page act had one, the practise hub had a
 * different one, and check-home-links had a third typed into it by hand.
 * They disagreed, silently, and the way I found out was counting: the array
 * calculator was in neither the act nor the hub, so a full surface was
 * reachable only from the footer, and six surfaces added in one day were in
 * both but in none of the gate's twelve hard-coded routes.
 *
 * That last part is the worst of it. The gate exists specifically to catch
 * "a surface nobody can find from the front page", and it kept a hand-typed
 * list of what to look for, which is the same failure applied to itself.
 *
 * So this file is the identity of each surface and nothing else: where it
 * lives, what kind of thinking it asks for, and the situation a reader is in
 * when they want it. The act and the hub still write their own copy, because
 * one is a terse grid and the other is a page that explains itself, and
 * both still read their counts from the registries they describe. What they
 * no longer do is decide independently which surfaces exist: CI checks each
 * against this file in both directions, so a surface missing from either one
 * fails the build rather than going quietly missing for a month.
 */

/**
 * What kind of work the surface asks for.
 *
 * Grouped by the reader's situation rather than by subject, because the
 * subject is not what somebody arrives knowing. They know something is
 * broken, or that they have a call to make, or that a number has to be
 * right, and eighteen undifferentiated cards make them read all eighteen to
 * find out which. On a phone that was twelve screens of scrolling.
 */
export type PractiseGroup = "diagnose" | "decide" | "compute" | "ground";

export const GROUP_HEADING: Record<PractiseGroup, string> = {
  diagnose: "Something is broken and you have to find it",
  decide: "There is a call to make and not enough information",
  compute: "There is a number and it has to be right",
  ground: "You are covering the ground",
};

export const GROUP_BLURB: Record<PractiseGroup, string> = {
  diagnose:
    "Evidence in front of you and a fault behind it. These give you the evidence and nothing else.",
  decide:
    "No amount of further reading resolves these. You commit, and then you find out.",
  compute:
    "Rules with exact answers, and a habit from somewhere adjacent that gives you the wrong one.",
  ground:
    "Reference and drill. Slower to pay off than the rest, and the thing the rest rests on.",
};

export interface PractiseSurface {
  href: string;
  /** The short label the act uses as an eyebrow. */
  eyebrow: string;
  /** The name both surfaces show. */
  title: string;
  group: PractiseGroup;
  /**
   * Why this surface is not in the daily rotation, when it is not.
   *
   * /today says it offers one thing from every practise surface, and for a
   * while that was false: five surfaces had never been added to its list and
   * the page's own copy claimed otherwise. Absent is now a declaration with
   * a reason rather than an omission nobody noticed, and CI reads it.
   */
  noRotation?: string;
  /**
   * Why this surface has no progress line on /today, when it has none.
   *
   * A calculator has nothing to be part-way through. An exercise with right
   * answers does, and leaving it out of the panel is a bug rather than a
   * design.
   */
  noProgress?: string;
}

/**
 * Every practise surface, in the order the groups read.
 *
 * Adding one here and nowhere else fails CI with the places it is missing
 * from named, which is the entire point of the file.
 */
export const PRACTISE_SURFACES: PractiseSurface[] = [
  { href: "/scenarios", eyebrow: "Decide", title: "Incident scenarios", group: "decide" },
  { href: "/triage", eyebrow: "Judge", title: "Phishing triage", group: "decide" },
  { href: "/challenges", eyebrow: "Find", title: "Capture the flag", group: "decide" },

  { href: "/labs", eyebrow: "Diagnose", title: "Hands-on labs", group: "diagnose" },
  { href: "/logs", eyebrow: "Read", title: "Read the log", group: "diagnose" },
  { href: "/capture", eyebrow: "Read", title: "Packet captures", group: "diagnose"  },
  { href: "/resolve", eyebrow: "Trace", title: "DNS resolution", group: "diagnose"  },
  { href: "/chain", eyebrow: "Attribute", title: "Certificate chains", group: "diagnose"  },
  { href: "/mtu", eyebrow: "Trace", title: "Ping works and the transfer hangs", group: "diagnose" , noProgress: "a model to explore rather than a set of exercises with answers" },
  { href: "/handshake", eyebrow: "Sequence", title: "Protocol handshakes", group: "diagnose" , noProgress: "a sequence to step through rather than a scored set" },

  { href: "/firewall", eyebrow: "Order", title: "Firewall exercises", group: "compute" },
  { href: "/route", eyebrow: "Resolve", title: "Longest prefix wins", group: "compute" , noProgress: "a lookup tool with worked examples rather than a scored set" },
  { href: "/allocate", eyebrow: "Divide", title: "Address plans", group: "compute" },
  { href: "/array", eyebrow: "Size", title: "Array calculator", group: "compute" , noProgress: "a calculator; nothing to be part-way through" },
  { href: "/transfer", eyebrow: "Measure", title: "Why the transfer is slow", group: "compute" },
  { href: "/restore", eyebrow: "Recover", title: "You have backups, not restores", group: "compute" , noProgress: "a model to run rather than a scored set" },

  { href: "/glossary", eyebrow: "Look up", title: "Glossary", group: "ground" , noRotation: "reference, not an exercise: there is nothing to get right", noProgress: "nothing to be part-way through" },
  { href: "/flashcards", eyebrow: "Recall", title: "Flashcards", group: "ground" , noRotation: "has its own spaced-repetition schedule, and a second scheduler picking one card would fight it", noProgress: "the SM-2 scheduler is the progress, and it does not reduce to a fraction" },
  { href: "/study", eyebrow: "Plan", title: "Exam objectives", group: "ground" , noRotation: "a plan rather than a drill: picking one domain a day is not how anybody revises", noProgress: "tracked per exam on the study pages themselves" },
  { href: "/tools", eyebrow: "Compute", title: "Browser tools", group: "ground" , noRotation: "utilities you reach for with a job in hand, not things to be handed", noProgress: "nothing to be part-way through" },
];

/** The groups in reading order, each with its surfaces. */
export const GROUPS: PractiseGroup[] = ["decide", "diagnose", "compute", "ground"];

export const surfacesIn = (group: PractiseGroup): PractiseSurface[] =>
  PRACTISE_SURFACES.filter((surface) => surface.group === group);

export const PRACTISE_ROUTES: string[] = PRACTISE_SURFACES.map((surface) => surface.href);
