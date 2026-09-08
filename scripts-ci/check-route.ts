/**
 * The routing table surface has to do address arithmetic correctly and
 * teach the rule it claims to teach.
 *
 * Three groups of check.
 *
 * The arithmetic is pinned against masks and boundaries worked out by hand.
 * JavaScript's bitwise operators return signed 32 bit values, so a mask of
 * 255.255.255.0 comes back as -256 without a >>> 0 and every comparison
 * after that is wrong in a way that still looks right for small prefixes.
 * The boundary cases are where that shows: a /0, a /32, and the last address
 * of a block against the first address of the next one.
 *
 * The lookups are replayed. Every probe's stated trap must be a route that
 * actually contains the destination and must not be the winner, because a
 * trap that is the right answer is not a trap, and one that does not match
 * at all is a route nobody would have picked.
 *
 * And the surface has to earn its existence: it is here to contrast longest
 * prefix with the first-match rule people bring over from firewalls, so
 * enough probes must be ones where the two disagree. A set where reading top
 * to bottom always gives the right answer teaches nothing.
 */

import { TABLES } from "../client/src/lib/route/data/tables";
import {
  contains,
  firstMatch,
  lookup,
  maskFor,
  prefixOf,
  rangeOf,
  toDotted,
  toInt,
} from "../client/src/lib/route/model";
import type { Route } from "../client/src/lib/route/types";

const problems: string[] = [];

/* ----------------------------------------------- arithmetic by hand */

const HAND: { label: string; got: () => unknown; want: unknown }[] = [
  { label: "0.0.0.0", got: () => toInt("0.0.0.0"), want: 0 },
  { label: "255.255.255.255", got: () => toInt("255.255.255.255"), want: 4294967295 },
  /* 10*2^24 + 20*2^16 + 40*2^8 + 17 = 167772160 + 1310720 + 10240 + 17 */
  { label: "10.20.40.17", got: () => toInt("10.20.40.17"), want: 169093137 },
  /* 192*2^24 + 168*2^16 + 10*2^8 + 53 */
  { label: "192.168.10.53", got: () => toInt("192.168.10.53"), want: 3232238133 },
  { label: "a /0 mask", got: () => maskFor(0), want: 0 },
  { label: "a /8 mask", got: () => maskFor(8), want: 4278190080 },
  /* The one that comes back as -256 without the unsigned shift. */
  { label: "a /24 mask", got: () => maskFor(24), want: 4294967040 },
  { label: "a /32 mask", got: () => maskFor(32), want: 4294967295 },
  { label: "a /31 mask", got: () => maskFor(31), want: 4294967294 },
  { label: "round tripping an address", got: () => toDotted(169093137), want: "10.20.40.17" },
  { label: "round tripping the broadcast", got: () => toDotted(4294967295), want: "255.255.255.255" },
];

for (const row of HAND) {
  const got = row.got();
  if (got !== row.want) problems.push(`${row.label}: the model says ${got}, hand arithmetic says ${row.want}`);
}

/* Nothing that is not an address may parse as one. */
for (const bad of ["10.20.40", "10.20.40.256", "10.20.40.17.1", "ten.20.40.17", "", "10.20.40.-1", "10.20.40.0/24"]) {
  if (toInt(bad) !== null) problems.push(`"${bad}" parsed as an address and is not one`);
}

/* A /0 contains everything and a /32 contains exactly one address. */
const everything: Route = { network: "0.0.0.0", length: 0, nextHop: null, iface: "x", protocol: "static", distance: 1, metric: 0 };
for (const address of ["0.0.0.0", "10.20.40.17", "255.255.255.255", "8.8.8.8"]) {
  if (!contains(everything, toInt(address)!)) problems.push(`a /0 does not contain ${address}`);
}
const host: Route = { ...everything, network: "192.168.10.53", length: 32 };
if (!contains(host, toInt("192.168.10.53")!)) problems.push("a /32 does not contain its own address");
for (const near of ["192.168.10.52", "192.168.10.54"]) {
  if (contains(host, toInt(near)!)) problems.push(`a /32 contains ${near}, which is a different address`);
}

/*
  Block boundaries. 10.20.40.255 is the last address of 10.20.40.0/24 and
  10.20.41.0 is the first of the next block, which is the off-by-one that a
  signed shift or an inclusive comparison gets wrong.
*/
const block: Route = { ...everything, network: "10.20.40.0", length: 24 };
if (!contains(block, toInt("10.20.40.255")!)) problems.push("a /24 does not contain its last address");
if (contains(block, toInt("10.20.41.0")!)) problems.push("a /24 contains the first address of the next block");
if (!contains(block, toInt("10.20.40.0")!)) problems.push("a /24 does not contain its own network address");

/* Ranges, counted by hand: a /24 is 256 addresses, a /31 is 2, a /32 is 1. */
const RANGES: [number, string, string, string, number][] = [
  [24, "10.20.40.0", "10.20.40.0", "10.20.40.255", 256],
  [31, "10.20.40.0", "10.20.40.0", "10.20.40.1", 2],
  [32, "10.20.40.7", "10.20.40.7", "10.20.40.7", 1],
  [16, "172.16.0.0", "172.16.0.0", "172.16.255.255", 65536],
  [8, "10.0.0.0", "10.0.0.0", "10.255.255.255", 16777216],
];
for (const [length, network, first, last, count] of RANGES) {
  const range = rangeOf({ ...everything, network, length });
  if (range.first !== first || range.last !== last || range.addresses !== count) {
    problems.push(
      `${network}/${length}: the model says ${range.first} to ${range.last} (${range.addresses}), ` +
        `hand arithmetic says ${first} to ${last} (${count})`,
    );
  }
}

/* ------------------------------------------------------ every table */

const slugs = new Set<string>();
let disagreements = 0;
let probeCount = 0;
const decisions = new Set<string>();

for (const table of TABLES) {
  if (slugs.has(table.slug)) problems.push(`${table.slug}: two tables share a slug`);
  slugs.add(table.slug);

  if (table.routes.length < 3) problems.push(`${table.slug}: ${table.routes.length} routes is not a table`);
  if (table.brief.length < 100) problems.push(`${table.slug}: the brief is too short to reason from`);

  for (const route of table.routes) {
    if (toInt(route.network) === null) problems.push(`${table.slug}: "${route.network}" is not an address`);
    if (route.length < 0 || route.length > 32) problems.push(`${table.slug}: a /${route.length} is not a prefix length`);
    if (route.distance < 0 || route.distance > 255) problems.push(`${table.slug}: a distance of ${route.distance} is not one`);
    /*
      A network address with host bits set is a configuration error that
      real routers reject, and one written into a teaching table would have
      somebody copying it.
    */
    const network = toInt(route.network);
    if (network !== null && ((network & maskFor(route.length)) >>> 0) !== network) {
      problems.push(
        `${table.slug}: ${prefixOf(route)} has host bits set; the network address is ${toDotted((network & maskFor(route.length)) >>> 0)}`,
      );
    }
    /* Connected routes have no next hop, and everything else needs one. */
    if (route.protocol === "connected" && route.nextHop !== null) {
      problems.push(`${table.slug}: ${prefixOf(route)} is connected and has a next hop`);
    }
    if (route.protocol !== "connected" && route.nextHop === null && route.iface !== "null0") {
      problems.push(`${table.slug}: ${prefixOf(route)} has no next hop and is not a blackhole`);
    }
  }

  for (const probe of table.probes) {
    probeCount += 1;
    if (toInt(probe.destination) === null) {
      problems.push(`${table.slug}: "${probe.destination}" is not an address`);
      continue;
    }
    const result = lookup(table, probe.destination);
    decisions.add(result.decidedBy);

    if (result.winner === null) {
      problems.push(`${table.slug}: nothing in the table carries ${probe.destination}`);
      continue;
    }
    /* The winner must actually contain the destination. */
    if (!contains(table.routes[result.winner], toInt(probe.destination)!)) {
      problems.push(`${table.slug}: ${probe.destination} resolved to a prefix that does not contain it`);
    }
    /* And it must be the longest of the matches, which is the rule itself. */
    const longest = Math.max(
      ...table.routes.filter((route) => contains(route, toInt(probe.destination)!)).map((route) => route.length),
    );
    if (table.routes[result.winner].length !== longest) {
      problems.push(
        `${table.slug}: ${probe.destination} resolved to a /${table.routes[result.winner].length} ` +
          `and a /${longest} also contains it`,
      );
    }

    if (probe.why.length < 120) problems.push(`${table.slug}: the explanation for ${probe.destination} does not explain`);

    if (probe.trap !== null) {
      if (probe.trap < 0 || probe.trap >= table.routes.length) {
        problems.push(`${table.slug}: the trap for ${probe.destination} is not a route in the table`);
        continue;
      }
      /* A trap that is the answer is not a trap. */
      if (probe.trap === result.winner) {
        problems.push(`${table.slug}: the trap for ${probe.destination} is the route that wins`);
      }
      /* A trap nothing would match is a route nobody would have picked. */
      if (!contains(table.routes[probe.trap], toInt(probe.destination)!)) {
        problems.push(
          `${table.slug}: the trap for ${probe.destination} is ${prefixOf(table.routes[probe.trap])}, ` +
            `which does not contain it, so nobody would pick it`,
        );
      }
    }

    if (firstMatch(table, probe.destination) !== result.winner) disagreements += 1;
  }
}

/*
  The surface exists to contrast longest prefix with first match. If reading
  top to bottom always gave the right answer, none of this would be worth a
  page, so a majority of probes have to be ones where the two disagree.
*/
if (disagreements < Math.ceil(probeCount / 2)) {
  problems.push(
    `only ${disagreements} of ${probeCount} probes distinguish longest prefix from first match; ` +
      `the rest could be answered by reading the table in order, which is the habit this page exists to break`,
  );
}

/* Every tie-break should be exercised, or a whole branch of the rule is untested. */
for (const needed of ["prefix length", "distance", "metric", "only match"]) {
  if (!decisions.has(needed)) {
    problems.push(`no probe is decided by "${needed}", so that branch of the rule is never shown`);
  }
}

if (problems.length) {
  console.error(`\ncheck-route: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${TABLES.length} tables and ${probeCount} lookups, ${HAND.length} results checked against arithmetic done by hand, ` +
    `every tie-break exercised, and ${disagreements} of ${probeCount} probes where reading the table in order gives the wrong answer.`,
);
