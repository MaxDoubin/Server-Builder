/**
 * Every award and leadership role the site advertises must appear in the
 * claim ledger.
 *
 * /verify only works if it is complete. A ledger that quietly omits the one
 * claim a reader wanted to check is worse than no ledger, because the page
 * promises "every substantive claim on this site" and would be lying.
 *
 * The two lists that are easy to grow without thinking are
 * siteConfig.achievements and siteConfig.leadership, so those are enforced
 * here. Matching is loose on purpose: the ledger phrases a claim the way a
 * reader would search for it, not the way the marketing copy does, so a
 * significant word from the achievement title has to show up somewhere in
 * the ledger entry rather than the whole string matching.
 */

import { readFileSync } from "node:fs";

const CONFIG = "client/src/lib/siteConfig.ts";
const CLAIMS = "client/src/lib/claims.ts";
const INDEX = "client/index.html";

const config = readFileSync(CONFIG, "utf8");
const indexHtml = readFileSync(INDEX, "utf8");
const claims = readFileSync(CLAIMS, "utf8").toLowerCase();

/** Words too common to prove anything if they happen to appear in the ledger. */
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "state", "of", "in",
  "at", "a", "an", "on", "to", "national", "student", "school", "club",
  "former", "member", "lead", "council", "nevada", "city", "south", "cta",
]);

function significantWords(phrase) {
  return [...phrase.toLowerCase().matchAll(/[a-z0-9+#.]{3,}/g)]
    .map((m) => m[0])
    .filter((w) => !STOP.has(w));
}

/** Pull a named array of objects out of the config source and read one field. */
function fieldValues(source, arrayName, field) {
  const start = source.indexOf(`${arrayName}: [`);
  if (start === -1) throw new Error(`could not find ${arrayName} in ${CONFIG}`);
  let depth = 0;
  let end = start;
  for (let i = source.indexOf("[", start); i < source.length; i += 1) {
    if (source[i] === "[") depth += 1;
    else if (source[i] === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const block = source.slice(start, end);
  const re = new RegExp(`${field}:\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
  return [...block.matchAll(re)].map((m) => m[1]);
}

const failures = [];

function require_(kind, phrases) {
  for (const phrase of phrases) {
    const words = significantWords(phrase);
    if (words.length === 0) continue;
    const hit = words.some((w) => claims.includes(w));
    if (!hit) {
      failures.push(`${kind}: "${phrase}" has no matching entry in ${CLAIMS}`);
    }
  }
}

/** The `award` array inside the Person JSON-LD block in index.html. */
function schemaAwards() {
  const match = indexHtml.match(/"award"\s*:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error(`could not find the award array in ${INDEX}`);
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

const achievements = fieldValues(config, "achievements", "title");
const orgs = fieldValues(config, "leadership", "org");
const awards = schemaAwards();

if (achievements.length === 0 || orgs.length === 0 || awards.length === 0) {
  console.error(
    `FAIL  parsed ${achievements.length} achievements, ${orgs.length} leadership roles and ${awards.length} schema awards; the parser is broken, not the data.`,
  );
  process.exit(1);
}

require_("achievement", achievements);
require_("leadership role", orgs);
require_("Person schema award", awards);

if (failures.length > 0) {
  console.error("FAIL  the claim ledger at /verify is missing entries.\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    `\n  Add a claim to CLAIM_GROUPS in ${CLAIMS} with an honest status,` +
      `\n  or remove the boast from ${CONFIG}. Do not leave it unlisted.`,
  );
  process.exit(1);
}

console.log(
  `OK  all ${achievements.length} achievements, ${orgs.length} leadership roles and ${awards.length} schema awards appear in the claim ledger.`,
);
