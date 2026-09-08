/**
 * Every chain case has to reach the fault and the owner it claims.
 *
 * The owner is the half that matters and the half that would rot silently.
 * A case whose explanation says "only the client can fix this" while the
 * validator names the server is a page that teaches someone to open a ticket
 * with the wrong team, and nothing about it looks broken.
 *
 * There is also a table of name matches worked out from RFC 6125, because the
 * wildcard rule is the one piece of this that people implement from memory and
 * get wrong in the same two ways every time.
 */

import { CHAIN_CASES } from "../client/src/lib/chain/data/cases";
import { validate } from "../client/src/lib/chain/validate";
import { at, nameMatches } from "../client/src/lib/chain/types";

const problems: string[] = [];

const seen = new Set<string>();
const faults = new Set<string>();
const owners = new Set<string>();

for (const item of CHAIN_CASES) {
  if (seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
  seen.add(item.id);

  const result = validate(item.presented, item.store, item.hostname, item.now, item.extra ?? []);
  faults.add(result.fault);
  owners.add(result.owner);

  if (result.fault !== item.fault) {
    problems.push(`${item.id}: claims ${item.fault}, the validator reaches ${result.fault}`);
  }
  if (result.owner !== item.owner) {
    problems.push(
      `${item.id}: claims ${item.owner} has to fix it, the validator says ${result.owner}. ` +
        `Naming the wrong party is the failure this check exists for.`,
    );
  }
  if (result.steps.length === 0) problems.push(`${item.id}: no steps, so there is nothing to read`);
  if (item.options.length < 3) problems.push(`${item.id}: fewer than three options is not a choice`);
  if (item.answer < 0 || item.answer >= item.options.length) {
    problems.push(`${item.id}: the answer index is outside the options`);
  }
  if (new Set(item.options).size !== item.options.length) {
    problems.push(`${item.id}: two options say the same thing`);
  }
  if (item.explain.length < 2) problems.push(`${item.id}: the explanation is too thin`);

  /* Dates must be sane, or a case means something different than intended. */
  for (const cert of [...item.presented, ...(item.extra ?? [])]) {
    if (at(cert.notBefore) >= at(cert.notAfter)) {
      problems.push(`${item.id}: ${cert.subject} is not valid before it is valid`);
    }
    for (const san of cert.sans) {
      const bare = san.replace(/^\*\./, "");
      if (!/(^|\.)(example|invalid|test|localhost)$/.test(bare)) {
        problems.push(`${item.id}: ${san} is not under a reserved suffix`);
      }
    }
  }
}

if (!CHAIN_CASES.some((item) => item.fault === "ok")) {
  problems.push("no case validates cleanly; a set made only of faults teaches that TLS never works");
}
if (faults.size < 5) problems.push(`only ${faults.size} distinct faults across ${CHAIN_CASES.length} cases`);
if (owners.size < 3) {
  problems.push(
    `only ${owners.size} distinct owners; the point of the exercise is that the same padlock means different people`,
  );
}

/*
  RFC 6125 wildcard matching, worked out by hand.

  A wildcard covers exactly one label. The two everyone gets wrong are the
  bare domain (not covered) and a deeper label (also not covered), and both
  are here in both directions.
*/
const MATCHES: [string, string, boolean][] = [
  ["www.example", "www.example", true],
  ["www.example", "*.example", true],
  ["example", "*.example", false],
  ["a.b.example", "*.example", false],
  ["a.b.example", "*.b.example", true],
  ["WWW.Example", "www.example", true],
  ["www.example", "*.EXAMPLE", true],
  ["wwwexample", "*.example", false],
  [".example", "*.example", false],
  ["www.example", "www.other", false],
];
for (const [host, pattern, want] of MATCHES) {
  const got = nameMatches(host, pattern);
  if (got !== want) {
    problems.push(`name match: ${host} against ${pattern} should be ${want}, got ${got}`);
  }
}

if (problems.length) {
  console.error(`\ncheck-chain: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CHAIN_CASES.length} chain cases across ${faults.size} faults and ${owners.size} owners, ` +
    `every stated fault and every named owner matches the validator, and ${MATCHES.length} wildcard rules hold.`,
);
