/**
 * Difficulty labels for posts.
 *
 * IMPORTANT: these labels are DERIVED, not hand-authored. No post carries a
 * difficulty in its front matter. The label below is computed from the two
 * things the generated index actually knows about a post, its tags and its
 * word count, using the fixed scoring rules in this file. Nobody sat down
 * and graded them.
 *
 * That makes the label a hint about the assumed background, not a promise.
 * It answers "roughly how much do I need to already know before this is
 * readable", and it will be wrong at the margins, which is why it is shown
 * as a small badge next to the read time rather than as a gate.
 *
 * The rules, in full:
 *
 *   start at 0
 *   +2   for each DEPTH_TAGS tag, capped at +4
 *        (subjects that only come up once the basics are behind you)
 *   +1   for each DOMAIN_TAGS tag past the first, capped at +2
 *        (a post sitting across three technical domains assumes more)
 *   -3   if any ORIENTATION_TAGS tag is present
 *        (career, learning and community posts are essays, not references)
 *   -1   if any AUDIENCE_TAGS tag is present
 *        (written from a hobby-scale perspective rather than a datacentre one)
 *   +1   if wordCount >= 950, -1 if wordCount <= 520
 *        (length is a weak proxy for depth, so it only ever moves one step)
 *
 *   score <= 0        beginner
 *   score 1 to 2      intermediate
 *   score >= 3        advanced
 *
 * Over the current archive that splits roughly 69 / 105 / 62, which is the
 * shape we want: no bucket so small it is useless as a filter.
 *
 * If a tag is not in any set below it contributes nothing. New tags are
 * therefore safe, they just pull a post toward the middle until listed.
 */

import type { PostMeta } from "./postIndex";

export type Difficulty = "beginner" | "intermediate" | "advanced";

/** Display order, and the order the listing filter renders them in. */
export const DIFFICULTIES: readonly Difficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

/** Subjects that assume the fundamentals are already in place. */
const DEPTH_TAGS = new Set([
  "architecture",
  "bgp",
  "containers",
  "datacenter",
  "encryption",
  "high-availability",
  "ipv6",
  "kubernetes",
  "memory",
  "ml",
  "ospf",
  "performance",
  "proxmox",
  "qos",
  "virtualization",
  "vxlan",
  "zfs",
]);

/** Technical subject areas. Breadth across these is itself a difficulty signal. */
const DOMAIN_TAGS = new Set([
  "ai",
  "automation",
  "cisco",
  "cybersecurity",
  "dns",
  "firewall",
  "fortinet",
  "hardware",
  "linux",
  "monitoring",
  "networking",
  "operations",
  "power",
  "routing",
  "security",
  "servers",
  "storage",
  "switching",
  "troubleshooting",
  "windows",
  "wireless",
  "wireshark",
]);

/** Posts about the practice rather than the technology. */
const ORIENTATION_TAGS = new Set([
  "career",
  "community",
  "competition",
  "documentation",
  "education",
  "history",
  "learning",
  "technology",
]);

/** Hobby-scale framing, which usually means more setup and less assumed context. */
const AUDIENCE_TAGS = new Set(["apple", "homelab", "mac-pro"]);

const LONG_POST = 950;
const SHORT_POST = 520;

/** The raw score behind the label. Exported for tests and for tuning. */
export function difficultyScore(post: Pick<PostMeta, "tags" | "wordCount">): number {
  let depth = 0;
  let domain = 0;
  for (const tag of post.tags) {
    if (DEPTH_TAGS.has(tag)) depth += 1;
    if (DOMAIN_TAGS.has(tag)) domain += 1;
  }

  let score = Math.min(depth * 2, 4) + Math.min(Math.max(domain - 1, 0), 2);

  if (post.tags.some((t) => ORIENTATION_TAGS.has(t))) score -= 3;
  if (post.tags.some((t) => AUDIENCE_TAGS.has(t))) score -= 1;

  if (post.wordCount >= LONG_POST) score += 1;
  else if (post.wordCount <= SHORT_POST) score -= 1;

  return score;
}

export function postDifficulty(post: Pick<PostMeta, "tags" | "wordCount">): Difficulty {
  const score = difficultyScore(post);
  if (score <= 0) return "beginner";
  if (score <= 2) return "intermediate";
  return "advanced";
}

/**
 * One line explaining what the label means, for the badge's title attribute
 * and for the filter row. Deliberately phrased as assumed background rather
 * than as a judgement about the reader.
 */
export const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  beginner: "Assumes little background. Derived from tags and length.",
  intermediate: "Assumes you know the fundamentals. Derived from tags and length.",
  advanced: "Assumes working knowledge of the subject. Derived from tags and length.",
};

/** Short glyph so the badge never depends on colour alone. */
export const DIFFICULTY_MARK: Record<Difficulty, string> = {
  beginner: "•",
  intermediate: "••",
  advanced: "•••",
};
