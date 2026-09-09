/**
 * Self-contained challenges with a flag to find.
 *
 * Shaped after the National Cyber League's categories, because that is what
 * the readers most likely to use this are preparing for, and because those
 * categories are a genuinely good taxonomy of "things you can practice on
 * your own with no infrastructure".
 *
 * HOW THE FLAG IS CHECKED, AND WHAT THAT IS WORTH. The flag itself is not in
 * the page. A SHA-256 of it is, and the answer box hashes what you type and
 * compares. That is not security and this file does not pretend it is: the
 * walkthrough is right there in the same bundle, and anyone who opens the
 * network tab can read it. The hash exists so that a flag cannot be found by
 * accident with ctrl-F, which is the only failure mode that actually costs a
 * reader anything.
 *
 * The page says all of this out loud. A static site pretending to be a
 * competition would be theatre, and the honest version is more useful: the
 * answer is available whenever you decide you want it.
 */

export type ChallengeCategory =
  | "Encoding"
  | "Cryptography"
  | "Log analysis"
  | "Network traffic"
  | "Forensics"
  | "Enumeration"
  | "Password cracking";

export type ChallengeDifficulty = "easy" | "medium" | "hard";

export interface Artefact {
  kind: "text" | "hex" | "log" | "table" | "note";
  title?: string;
  lines: string[];
}

export interface Challenge {
  slug: string;
  title: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  /** One line on the card. */
  tagline: string;
  /** What you are being asked for, in the second person. */
  brief: string[];
  artefacts: Artefact[];
  /** Lowercase SHA-256 hex of the flag, which is compared after normalizing. */
  flagHash: string;
  /** Shown next to the answer box: "acme{...}" or "an IPv4 address". */
  flagShape: string;
  hints: string[];
  /**
   * True when the answer is one of the values in the artefact rather than
   * something derived from it.
   *
   * "Which of these six addresses got in" and "decode this blob" are
   * different exercises. In the first the answer has to be printed in front
   * of the reader, and the skill is picking the right row; in the second the
   * flag must not appear anywhere they can see it. The CI check enforces the
   * second rule and needs to be told which challenges are the first kind.
   */
  answerIsInTheData?: boolean;
  /** The full method, shown after solving or on request. */
  walkthrough: string[];
  reading?: { label: string; href: string }[];
}

/**
 * How a submitted flag is compared.
 *
 * Case and surrounding whitespace are forgiven because they are typing, not
 * understanding. Nothing else is: a flag with a character wrong is wrong, and
 * softening that would remove the only feedback the exercise gives.
 */
export const normaliseFlag = (text: string): string => text.trim().toLowerCase();

/** SHA-256 hex, via the platform. Async because Web Crypto is. */
export async function hashFlag(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(normaliseFlag(text));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkFlag(challenge: Challenge, given: string): Promise<boolean> {
  if (!given.trim()) return false;
  return (await hashFlag(given)) === challenge.flagHash;
}
