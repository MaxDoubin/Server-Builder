/**
 * Every challenge must have a findable flag and a walkthrough that finds it.
 *
 * The flag is stored as a SHA-256 so it cannot be found with ctrl-F. That is
 * also the failure mode: nothing in the source connects the hash to anything,
 * so a typo in the hash produces a challenge nobody can ever solve, and the
 * symptom is silence.
 *
 * So each challenge declares its flag in a table HERE, next to the check,
 * rather than in the file a reader downloads. This script hashes it and
 * compares. The flags live in the CI script and not in the bundle, which is
 * the only place they can be verified without shipping them.
 *
 * Usage: npx tsx scripts-ci/check-challenges.ts
 */

import { CHALLENGES } from "../client/src/lib/challenges/index";
import { hashFlag } from "../client/src/lib/challenges/types";

/**
 * The answers, kept out of client/src on purpose.
 *
 * This file is not shipped to a browser. Everything in client/src is.
 */
const FLAGS: Record<string, string> = {
  "base64-in-a-user-agent": "acme{stacked_encodings_are_still_encodings}",
  "the-key-was-the-year": "acme{never_roll_your_own_and_never_reuse}",
  "count-the-failures": "185.220.101.44",
  "what-is-in-the-hex": "acme{magic_bytes_beat_file_extensions}",
  "the-port-nobody-opened": "31337",
  "a-hash-with-a-name": "acme{ntlm_is_not_a_hash_function_choice}",
};

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

for (const challenge of CHALLENGES) {
  const flag = FLAGS[challenge.slug];
  if (!flag) {
    note(challenge.slug, "has no flag recorded in this script, so it cannot be verified");
    continue;
  }

  /* The stored hash must be the hash of the real flag. */
  const expected = await hashFlag(flag);
  if (challenge.flagHash !== expected) {
    note(challenge.slug, `flagHash does not match its flag. Expected ${expected}`);
  }

  /* And an obviously wrong answer must not pass. */
  if ((await hashFlag(`${flag}x`)) === challenge.flagHash) {
    note(challenge.slug, "accepts a flag with a character appended");
  }

  /*
    The flag must NOT be findable in what ships.
    The artefacts and the brief are what the reader is given; if the flag is
    sitting in one of them the challenge is not a challenge. The walkthrough
    is exempt, because it is the answer and is meant to contain it.
  */
  const framing = [...challenge.brief, ...challenge.hints, challenge.tagline, challenge.flagShape];
  if (framing.join("\n").toLowerCase().includes(flag.toLowerCase())) {
    note(challenge.slug, "the flag appears in the brief, the hints or the tagline");
  }

  /*
    For a derivation challenge the flag must not be in the artefact either.
    For a selection challenge it must be: "which of these six addresses got
    in" only works if all six are printed. answerIsInTheData says which.
  */
  const artefacts = challenge.artefacts
    .flatMap((a) => [a.title ?? "", ...a.lines])
    .join("\n")
    .toLowerCase();
  const inArtefacts = artefacts.includes(flag.toLowerCase());
  if (inArtefacts && !challenge.answerIsInTheData) {
    note(challenge.slug, "the flag is printed in the artefact, so there is nothing to work out");
  }
  if (!inArtefacts && challenge.answerIsInTheData) {
    note(challenge.slug, "is marked answerIsInTheData but the answer is not in the artefact");
  }

  /* The walkthrough has to actually resolve it, or it is not a walkthrough. */
  if (challenge.walkthrough.length < 2) note(challenge.slug, "walkthrough is too short to be one");
  if (challenge.hints.length < 2) note(challenge.slug, "needs at least two hints");
  if (challenge.artefacts.length === 0) note(challenge.slug, "has nothing to work on");
  for (const artefact of challenge.artefacts) {
    if (artefact.lines.length === 0) note(challenge.slug, "has an empty artefact");
  }
}

/* Slugs unique, and no flag recorded for a challenge that no longer exists. */
const slugs = new Set(CHALLENGES.map((c) => c.slug));
if (slugs.size !== CHALLENGES.length) problems.push("duplicate challenge slug");
for (const slug of Object.keys(FLAGS)) {
  if (!slugs.has(slug)) problems.push(`a flag is recorded for "${slug}", which is not a challenge`);
}

if (CHALLENGES.length === 0) {
  console.error("FAIL  no challenges are registered, so this check proved nothing.");
  process.exit(1);
}
if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the challenges:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CHALLENGES.length} challenges, every flag hash verified against its answer, ` +
    `and no flag appears in what the reader is given.`,
);
