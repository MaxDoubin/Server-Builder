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
   * Articles that cover what this surface makes you do.
   *
   * Two of two hundred and sixty articles linked to a practise surface, and
   * one surface of twenty linked back. Somebody finishing an article on path
   * MTU had no idea there was a page that walks a packet down one, and
   * somebody on that page had no idea there were three articles about it.
   * Two halves of a site that did not know about each other.
   *
   * Curated by hand rather than matched on keywords. I generated candidates
   * by keyword to find them, and the scoring put an article about memory
   * bandwidth at the top for the throughput surface and missed the one
   * actually written for it, because relevance here is a judgement and not a
   * word count. CI checks every slug resolves; it cannot check that the
   * article is worth reading next, and neither can a regex.
   */
  reading?: string[];
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
  { href: "/scenarios", eyebrow: "Decide", title: "Incident scenarios", group: "decide" , reading: ["incident-response-methodology", "runbooks-infrastructure-teams"] },
  { href: "/triage", eyebrow: "Judge", title: "Phishing triage", group: "decide" , reading: ["spf-dkim-dmarc", "the-authentication-passed-anyway"] },
  { href: "/challenges", eyebrow: "Find", title: "Capture the flag", group: "decide" , reading: ["ncl-competition-lessons", "log-analysis-methodology"] },
  { href: "/patch", eyebrow: "Rank", title: "The queue is sorted wrong", group: "decide" , reading: ["a-base-score-is-not-a-queue", "threat-modeling-small-networks", "incident-response-methodology"] },

  { href: "/labs", eyebrow: "Diagnose", title: "Hands-on labs", group: "diagnose" , reading: ["a-shell-that-has-to-be-right", "cli-tools-i-actually-use", "linux-disk-io-troubleshooting"] },
  { href: "/logs", eyebrow: "Read", title: "Read the log", group: "diagnose" , reading: ["log-analysis-methodology", "syslog-centralized-logging", "firewall-log-analysis"] },
  { href: "/capture", eyebrow: "Read", title: "Packet captures", group: "diagnose"  , reading: ["troubleshooting-packet-captures", "wireshark-packet-analysis"] },
  { href: "/vlan", eyebrow: "Follow", title: "The frame that arrived untagged", group: "diagnose" , reading: ["the-request-arrived-the-reply-did-not", "vlan-segmentation-guide", "network-access-control-8021x"] },
  { href: "/clock", eyebrow: "Measure", title: "Four errors, none of which says the word time", group: "diagnose" , reading: ["ntp-enterprise-networks", "how-totp-codes-actually-work", "certificate-lifetimes-are-200-days-now"] },
  { href: "/space", eyebrow: "Compare", title: "No space left on device", group: "diagnose" , reading: ["linux-disk-io-troubleshooting", "filesystem-journal-explained", "prometheus-server-monitoring"] },
  { href: "/cache", eyebrow: "Read", title: "The page that showed somebody else's name", group: "diagnose" , reading: ["http-caching-headers-etags", "caching-model-endpoint", "the-disk-was-not-full"] },
  { href: "/oom", eyebrow: "Predict", title: "Something has to die", group: "diagnose" , reading: ["minus-one-thousand-is-not-a-hint", "oom-killer-and-swap-sizing", "cgroups-v2-resource-limits"] },
  { href: "/units", eyebrow: "Order", title: "It started before the thing it needs", group: "diagnose" , reading: ["systemd-units-that-behave", "init-scripts-to-systemd-units", "systemd-service-hardening"] },
  { href: "/nat", eyebrow: "Trace", title: "It works from outside", group: "diagnose" , reading: ["nothing-translates-the-reply", "netfilter-hook-order", "firewall-policy-design"] },
  { href: "/alerts", eyebrow: "Predict", title: "The graph crossed the line", group: "diagnose" , reading: ["the-alert-was-pending-all-day", "prometheus-server-monitoring", "network-monitoring-system-build"] },
  { href: "/load", eyebrow: "Predict", title: "Forty, and idle", group: "diagnose" , reading: ["forty-and-nothing-was-running", "linux-disk-io-troubleshooting", "linux-page-cache-and-io"] },
  { href: "/resolve", eyebrow: "Trace", title: "DNS resolution", group: "diagnose"  , reading: ["four-faults-one-sentence", "recursive-resolver-internals", "dns-negative-caching"] },
  { href: "/chain", eyebrow: "Attribute", title: "Certificate chains", group: "diagnose"  , reading: ["ssl-tls-certificates-explained", "certificate-rotation-automation", "certificate-lifetimes-are-200-days-now"] },
  { href: "/mtu", eyebrow: "Trace", title: "Ping works and the transfer hangs", group: "diagnose" , noProgress: "a model to explore rather than a set of exercises with answers" , reading: ["mtu-mismatch-troubleshooting", "mtu-black-hole-troubleshooting", "jumbo-frames-path-mtu"] },
  { href: "/handshake", eyebrow: "Sequence", title: "Protocol handshakes", group: "diagnose" , noProgress: "a sequence to step through rather than a scored set" , reading: ["post-quantum-tls-handshake-bytes", "network-access-control-8021x", "pxe-network-boot"] },

  { href: "/firewall", eyebrow: "Order", title: "Firewall exercises", group: "compute" , reading: ["first-match-wins", "firewall-policy-design", "netfilter-hook-order"] },
  { href: "/route", eyebrow: "Resolve", title: "Longest prefix wins", group: "compute" , noProgress: "a lookup tool with worked examples rather than a scored set" , reading: ["first-match-wins", "bgp-for-network-engineers", "ospf-routing-protocol"] },
  { href: "/allocate", eyebrow: "Divide", title: "Address plans", group: "compute" , reading: ["subnetting-practical-guide", "alignment-is-what-runs-out"] },
  { href: "/array", eyebrow: "Size", title: "Array calculator", group: "compute" , noProgress: "a calculator; nothing to be part-way through" , reading: ["raid-rebuild-risk-math", "zfs-arc-l2arc-tuning"] },
  { href: "/transfer", eyebrow: "Measure", title: "Why the transfer is slow", group: "compute" , reading: ["the-invoice-is-not-the-ceiling", "tcp-congestion-control-basics", "queueing-theory-for-operators"] },
  { href: "/retry", eyebrow: "Multiply", title: "Three retries, four layers", group: "compute" , reading: ["the-broken-one-feels-faster", "queueing-theory-for-operators", "incident-response-methodology"] },
  { href: "/permissions", eyebrow: "Resolve", title: "The first class that matches", group: "compute" , reading: ["permissions-do-not-add-up", "first-match-wins", "linux-server-hardening"] },
  { href: "/restore", eyebrow: "Recover", title: "You have backups, not restores", group: "compute" , noProgress: "a model to run rather than a scored set" , reading: ["three-copies-one-credential", "restore-drills-that-matter", "backup-strategy-321-rule"] },

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
