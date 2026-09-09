/**
 * The triage inbox has to agree with itself.
 *
 * Each message is written with the hard signals it carries and the innocent
 * ones it wears, and both lists are also derivable from the headers by the
 * detectors the page itself uses. This asserts the two match exactly, in both
 * directions, and the second direction is the one that earns its keep: it is
 * easy to write a message meant to be clean and give it a lookalike domain by
 * accident, or to move a hyphen and quietly delete the only finding in a
 * message the analysis still calls hostile.
 *
 * Nothing here renders. It reads the data, runs the same functions the browser
 * runs, and compares.
 */

import { MESSAGES } from "../client/src/lib/triage/index";
import { detectRedHerrings, detectSignals, detectTells, editDistance, KNOWN_BRANDS, lookalikeOf } from "../client/src/lib/triage/signals";
import { domainOf, hostOf, registrableOf } from "../client/src/lib/triage/types";

const problems: string[] = [];
const note = (id: string, message: string) => problems.push(`${id}: ${message}`);

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

const seen = new Set<string>();

for (const message of MESSAGES) {
  if (seen.has(message.id)) note(message.id, "duplicate id");
  seen.add(message.id);

  const tells = detectTells(message);
  const herrings = detectRedHerrings(message);

  if (!sameSet(tells, message.tells)) {
    note(
      message.id,
      `tells disagree. written [${[...message.tells].sort().join(", ") || "none"}], detected [${tells.join(", ") || "none"}]`,
    );
  }
  if (!sameSet(herrings, message.redHerrings)) {
    note(
      message.id,
      `red herrings disagree. written [${[...message.redHerrings].sort().join(", ") || "none"}], detected [${herrings.join(", ") || "none"}]`,
    );
  }

  /*
    The verdict has to follow from the tells, or the exercise is unmarkable.
    A message with a hard signal is hostile and a message with none is not:
    if a message needed a judgment call the detectors cannot make, the page
    would be scoring the reader against an opinion.
  */
  if (message.verdict === "phish" && tells.length === 0) {
    note(message.id, "called a phish but carries no hard signal a reader could point at");
  }
  if (message.verdict === "legitimate" && tells.length > 0) {
    note(message.id, `called legitimate but carries hard signals: ${tells.join(", ")}`);
  }

  /*
    Two-label domains only. registrableOf takes the last two labels, which is
    wrong under a multi-label public suffix, and the simple rule is only exact
    if the data stays inside it.
  */
  const hosts = [
    domainOf(message.fromAddress),
    domainOf(message.returnPath),
    domainOf(message.to),
    ...(message.replyTo ? [domainOf(message.replyTo)] : []),
  ];
  for (const host of hosts) {
    if (!host) note(message.id, "an address has no domain");
    const labels = host.split(".").filter(Boolean);
    if (labels.length >= 2) {
      const suffix = labels.slice(-2).join(".");
      if (/^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(suffix)) {
        note(message.id, `${host} uses a multi-label suffix, which registrableOf gets wrong`);
      }
    }
  }

  if (message.analysis.length < 2) note(message.id, "analysis is too thin to be worth reading");
  if (message.body.length === 0) note(message.id, "no body");
  if (message.received.length < 2) note(message.id, "a Received chain of one hop is not a chain");

  for (const link of message.links) {
    if (!/^https?:\/\//.test(link.href)) note(message.id, `link href is not a URL: ${link.href}`);
    if (!hostOf(link.href)) note(message.id, `link href has no host: ${link.href}`);
  }

  /*
    Nothing invented should collide with a real domain someone might visit.
    Anything that is not a known brand has to sit under a reserved name, so
    that a reader who copies an address out of the page and pastes it into a
    browser reaches nothing.
  */
  const RESERVED = /(^|\.)(example|invalid|test|localhost)$|(^|\.)example\.(com|net|org)$/;
  const FICTIONAL = ["northbay.edu", "orionsupply.com", "hartline.com", "orion-supply.com"];
  for (const host of new Set([...hosts, ...message.links.map((l) => hostOf(l.href))])) {
    if (!host) continue;
    const registrable = registrableOf(host);
    if (KNOWN_BRANDS.includes(registrable)) continue;
    if (FICTIONAL.includes(registrable)) continue;
    if (RESERVED.test(host)) continue;
    if (registrable === "gmail.com" || registrable === "google.com" || registrable === "forms.gle") continue;
    if (registrable === "bit.ly") continue;
    if (/^(microsoft-storage|secure-esign|ups-trackcentre|northbay-msg|paypa1|docs-share|okta-verify)\.[a-z]+$/.test(registrable)) {
      continue;
    }
    note(message.id, `${host} is neither a real brand, a fictional one, nor a reserved name`);
  }
}

/* An inbox of nothing but phish teaches the wrong reflex. */
const legit = MESSAGES.filter((m) => m.verdict === "legitimate").length;
if (legit < 4) problems.push(`only ${legit} legitimate messages; the false positive is half the lesson`);
const withHerrings = MESSAGES.filter(
  (m) => m.verdict === "legitimate" && m.redHerrings.length >= 2,
).length;
if (withHerrings < 3) {
  problems.push(
    `only ${withHerrings} legitimate messages carry two or more red herrings; the easy ones prove nothing`,
  );
}
const oneTell = MESSAGES.filter((m) => m.verdict === "phish" && m.tells.length === 1).length;
if (oneTell < 2) {
  problems.push(`only ${oneTell} hostile messages turn on a single signal; those are the hard ones`);
}

/* ----------------------------------------- the lookalike detection itself */

/*
  editDistance, lookalikeOf and detectSignals were exported and named by
  nothing in this file until a check over every logic file found them. The
  first is what decides whether a domain is a lookalike, which is the single
  most consequential judgment this surface makes: too loose and it teaches
  people to distrust their own suppliers, too tight and it teaches them to
  trust a typosquat.
*/

/*
  Levenshtein has four properties that pin it completely, and a wrong
  implementation fails at least one of them. Checked over generated strings
  rather than a table, because a table would only cover what I thought of.
*/
let editSeed = 0x2b7e15;
const nextEdit = () => {
  editSeed ^= editSeed << 13;
  editSeed >>>= 0;
  editSeed ^= editSeed >>> 17;
  editSeed ^= editSeed << 5;
  editSeed >>>= 0;
  return editSeed;
};
const ALPHABET = "abcdefgo0l1-.";
const word = (length) => {
  let out = "";
  for (let index = 0; index < length; index += 1) out += ALPHABET[nextEdit() % ALPHABET.length];
  return out;
};

let triangleChecks = 0;
for (let round = 0; round < 2000; round += 1) {
  const a = word(nextEdit() % 12);
  const b = word(nextEdit() % 12);
  const c = word(nextEdit() % 12);

  /* Identity: nothing differs from itself. */
  if (editDistance(a, a) !== 0) problems.push(`editDistance("${a}", itself) is ${editDistance(a, a)}`);

  /* Symmetry: it is a distance, not a direction. */
  if (editDistance(a, b) !== editDistance(b, a)) {
    problems.push(`editDistance is not symmetric on "${a}" and "${b}"`);
  }

  /* Non-negative, and zero only for equal strings. */
  const distance = editDistance(a, b);
  if (distance < 0) problems.push(`editDistance("${a}", "${b}") is negative`);
  if (distance === 0 && a !== b) problems.push(`editDistance says "${a}" and "${b}" are the same string`);

  /* At least the length difference, at most the longer length. */
  if (distance < Math.abs(a.length - b.length)) {
    problems.push(`editDistance("${a}", "${b}") is ${distance}, below their length difference`);
  }
  if (distance > Math.max(a.length, b.length)) {
    problems.push(`editDistance("${a}", "${b}") is ${distance}, above the longer length`);
  }

  /* Deleting from the empty string costs one per character. */
  if (editDistance(a, "") !== a.length) problems.push(`editDistance("${a}", "") is not its length`);

  /* Triangle inequality, which is the one a greedy implementation fails. */
  if (editDistance(a, c) > editDistance(a, b) + editDistance(b, c)) {
    problems.push(`the triangle inequality fails on "${a}", "${b}", "${c}"`);
  }
  triangleChecks += 1;

  /* And one edit is exactly one, which is what the lookalike threshold rests on. */
  if (a.length > 0) {
    const swapped = `${a.slice(0, -1)}${a.slice(-1) === "x" ? "y" : "x"}`;
    if (editDistance(a, swapped) !== 1) {
      problems.push(`changing the last character of "${a}" cost ${editDistance(a, swapped)}`);
    }
    if (editDistance(a, `${a}z`) !== 1) problems.push(`appending one character to "${a}" cost more than 1`);
  }
}
if (triangleChecks < 2000) problems.push(`only ${triangleChecks} triangle checks ran`);

/*
  lookalikeOf, from both sides. A brand is never a lookalike of itself, a
  brand one character out is caught, and the boundary case the code comments
  call out has to hold: a longer word that merely contains a brand's name is
  not a lookalike of it.
*/
for (const brand of KNOWN_BRANDS) {
  if (lookalikeOf(brand) !== null) {
    problems.push(`lookalikeOf flagged the real ${brand} as a lookalike of ${lookalikeOf(brand)}`);
  }
  const label = brand.split(".")[0];
  const suffix = brand.slice(brand.indexOf("."));
  /* One character removed from the label is within the threshold. */
  if (label.length > 3) {
    const typo = `${label.slice(0, -1)}${suffix}`;
    if (lookalikeOf(typo) === null) problems.push(`lookalikeOf missed the typosquat ${typo} of ${brand}`);
  }
  /* And the brand's label glued into a longer word is not, on a bare substring. */
  const glued = `${label}schools.com`;
  if (glued !== brand && lookalikeOf(glued) === brand && label.length > 4) {
    problems.push(`lookalikeOf flagged ${glued} as ${brand} on a bare substring`);
  }
}
if (lookalikeOf("example.invalid") !== null) {
  problems.push("lookalikeOf flagged an unrelated domain");
}

/* detectSignals is the two detectors together and must be exactly that. */
for (const message of MESSAGES) {
  const both = detectSignals(message);
  const tells = detectTells(message);
  const herrings = detectRedHerrings(message);
  if (JSON.stringify(both.tells) !== JSON.stringify(tells)) {
    problems.push(`${message.id}: detectSignals disagrees with detectTells`);
  }
  if (JSON.stringify(both.redHerrings) !== JSON.stringify(herrings)) {
    problems.push(`${message.id}: detectSignals disagrees with detectRedHerrings`);
  }
}

if (problems.length) {
  console.error(`\ncheck-triage: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

const phish = MESSAGES.length - legit;
console.log(
  `OK  ${MESSAGES.length} messages, ${phish} hostile and ${legit} not, every written signal matches what the detectors find in the headers.`,
);
