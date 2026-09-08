/**
 * The DNS world has to produce the failures its cases claim.
 *
 * Every case names an outcome, and the whole exercise is the reader learning
 * to tell those outcomes apart. If a case says "lame delegation" and the
 * engine actually returns no-glue, the page teaches the wrong lesson while
 * looking entirely correct: a trace appears, a diagnosis appears, and the two
 * do not match.
 *
 * It also checks the world itself. Every name has to be under a reserved or
 * documentation suffix, because a reader who copies a hostname out of a page
 * about broken DNS and pastes it into a resolver should reach nothing at all.
 */

import { CASES } from "../client/src/lib/resolve/data/cases";
import { WORLD } from "../client/src/lib/resolve/data/world";
import { resolve } from "../client/src/lib/resolve/resolver";
import { inZone } from "../client/src/lib/resolve/types";

const problems: string[] = [];

/* Every case's stated outcome has to be the one the engine reaches. */
const seen = new Set<string>();
const outcomes = new Set<string>();
for (const item of CASES) {
  if (seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
  seen.add(item.id);
  outcomes.add(item.outcome);

  const result = resolve(WORLD, item.name, item.type);
  if (result.outcome !== item.outcome) {
    problems.push(
      `${item.id}: says ${item.outcome}, the resolver reaches ${result.outcome} for ${item.name} ${item.type}`,
    );
  }
  if (result.queries.length === 0) {
    problems.push(`${item.id}: no queries, so there is no trace to read`);
  }
  if (item.options.length < 3) problems.push(`${item.id}: fewer than three options is not a choice`);
  if (item.answer < 0 || item.answer >= item.options.length) {
    problems.push(`${item.id}: the answer index is outside the options`);
  }
  if (new Set(item.options).size !== item.options.length) {
    problems.push(`${item.id}: two options say the same thing`);
  }
  if (item.explain.length < 2) problems.push(`${item.id}: the explanation is too thin`);
}

/*
  The failures have to be varied. Eight cases that all reach nxdomain would be
  eight ways of asking the same question.
*/
if (outcomes.size < 5) {
  problems.push(`only ${outcomes.size} distinct outcomes across ${CASES.length} cases`);
}
if (!CASES.some((item) => item.outcome === "answer")) {
  problems.push("no case resolves successfully; an exercise made only of faults teaches paranoia");
}

/*
  Nothing here may resolve anywhere real. Reserved suffixes only, per RFC 2606
  and RFC 6761, plus the documentation ranges for addresses.
*/
const RESERVED = /(^|\.)(example|invalid|test|localhost)$/;
const DOC_RANGE = /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|198\.41\.0\.|199\.9\.14\.)/;
const ROOT_EXEMPT = ["a.root-servers.net", "b.root-servers.net"];

const names = new Set<string>();
for (const zone of WORLD.zones) {
  if (zone.origin) names.add(zone.origin);
  for (const server of zone.servers) names.add(server);
  for (const record of zone.records) {
    names.add(record.name);
    if (record.type === "NS" || record.type === "CNAME") names.add(record.value);
  }
}
for (const host of Object.keys(WORLD.hosts)) names.add(host);
for (const name of names) {
  if (ROOT_EXEMPT.includes(name)) continue;
  if (!RESERVED.test(name)) problems.push(`${name} is not under a reserved suffix`);
}
for (const [host, ip] of Object.entries(WORLD.hosts)) {
  if (!DOC_RANGE.test(ip)) problems.push(`${host} has ${ip}, which is not a documentation address`);
}
for (const zone of WORLD.zones) {
  for (const record of zone.records) {
    if (record.type !== "A") continue;
    if (!DOC_RANGE.test(record.value)) {
      problems.push(`${record.name} A ${record.value} is not a documentation address`);
    }
  }
}

/*
  Structural checks on the world, so a fault stays the fault it was written to
  be. Each of these was a real bug at some point in building this.
*/
for (const zone of WORLD.zones) {
  if (zone.servers.length === 0) problems.push(`${zone.origin || "the root"} has no servers`);
  if (!zone.origin) continue;
  const parent = WORLD.zones.find(
    (candidate) =>
      candidate.origin !== zone.origin &&
      inZone(zone.origin, candidate.origin) &&
      candidate.records.some((r) => r.type === "NS" && r.name === zone.origin),
  );
  if (!parent) problems.push(`${zone.origin} exists with no delegation from any parent`);
}

/* Glue is only meaningful for hosts inside the zone being delegated. */
for (const [parent, hosts] of Object.entries(WORLD.glue)) {
  for (const host of hosts) {
    const owner = WORLD.zones.find(
      (zone) => zone.origin !== parent && inZone(host, zone.origin) && zone.servers.includes(host),
    );
    if (!owner && !host.endsWith("gtld-servers.example")) {
      problems.push(`${parent || "the root"} holds glue for ${host}, which serves no zone here`);
    }
  }
}

/* A handful of lookups with the walk worked out by hand. */
const WALKS: [string, string, string, number][] = [
  ["www.northbay.example", "A", "answer", 3],
  ["northbay.example", "TXT", "nodata", 3],
  ["nothere.northbay.example", "A", "nxdomain", 3],
  ["portal.northbay.example", "A", "answer", 9],
  ["hartline.example", "MX", "answer", 3],
];
for (const [name, type, outcome, queries] of WALKS) {
  const result = resolve(WORLD, name, type as never);
  if (result.outcome !== outcome) {
    problems.push(`walk: ${name} ${type} should be ${outcome}, got ${result.outcome}`);
  }
  if (result.queries.length !== queries) {
    problems.push(
      `walk: ${name} ${type} should take ${queries} queries, took ${result.queries.length}. ` +
        `A change in the number of round trips is a change in the delegation depth.`,
    );
  }
}

/* The root must refer to the TLD, not straight to a zone two levels down. */
const first = resolve(WORLD, "www.northbay.example", "A").queries[0];
if (!first || !first.response.includes("referral to example")) {
  problems.push(
    `the root's first response is "${first?.response ?? "nothing"}". It should refer to example: ` +
      `a root server holds NS for the TLD and knows nothing about anything below it.`,
  );
}

if (problems.length) {
  console.error(`\ncheck-resolve: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cases across ${outcomes.size} distinct outcomes, ${WORLD.zones.length} zones, ` +
    `every stated diagnosis matches what the resolver reaches, and every name is under a reserved suffix.`,
);
