/**
 * Every address plan has to be solvable, and unsolved to begin with.
 *
 * The solvable half is not obvious for this one. A set of host counts and a
 * block can be arithmetically infeasible, and it is easy to write by accident:
 * I wrote one, and the first run of this caught it while I was still calling
 * it an exercise. A problem with no answer is not a hard problem, it is a
 * broken one, so every solution is replayed here and every requirement has to
 * come back satisfied.
 *
 * There is also a table of address arithmetic worked out by hand, because
 * everything above is the reviewer checking itself against the same code that
 * would be wrong.
 */

import { PROBLEMS } from "../client/src/lib/allocate/data/problems";
import { review } from "../client/src/lib/allocate/review";
import {
  broadcastOf,
  contains,
  format,
  isAligned,
  isCidr,
  maskFor,
  networkOf,
  overlaps,
  parseAddress,
  parseCidr,
  prefixForHosts,
  sizeOf,
  toDotted,
  usableIn,
} from "../client/src/lib/allocate/cidr";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

const seen = new Set<string>();
let requirementCount = 0;

for (const problem of PROBLEMS) {
  if (seen.has(problem.slug)) note(problem.slug, "duplicate slug");
  seen.add(problem.slug);
  requirementCount += problem.requirements.length;

  const block = parseCidr(problem.block);
  if (!isCidr(block)) {
    note(problem.slug, `the block does not parse: ${block.error}`);
    continue;
  }
  if (!isAligned(block)) note(problem.slug, `${problem.block} is not a network address`);

  const solved = review(problem, problem.solution);
  if (!solved.solved) {
    for (const finding of solved.findings.filter((f) => !f.ok)) {
      note(problem.slug, `the solution fails "${finding.requirementId}": ${finding.message}`);
    }
  }

  const empty = review(problem, {});
  if (empty.solved) note(problem.slug, "an empty plan already passes, so there is nothing to do");

  /*
    Feasibility, computed independently of the solution.

    Summing the rounded-up block sizes is a lower bound on what the plan costs,
    and if that exceeds the block there is no arrangement that fits. It will
    not catch every infeasible problem, because alignment can waste space this
    sum does not model, but it catches the one I actually wrote.
  */
  const floor = problem.requirements.reduce(
    (sum, requirement) => sum + sizeOf(prefixForHosts(requirement.hosts)),
    0,
  );
  if (floor > sizeOf(block.prefix)) {
    note(
      problem.slug,
      `the requirements need at least ${floor} addresses and ${problem.block} has ${sizeOf(block.prefix)}. No arrangement fits.`,
    );
  }

  /* Every "within" constraint has to be inside the block and satisfiable. */
  for (const requirement of problem.requirements) {
    if (!requirement.within) continue;
    const within = parseCidr(requirement.within);
    if (!isCidr(within)) {
      note(problem.slug, `${requirement.id}: within does not parse`);
      continue;
    }
    if (!contains(block, within)) {
      note(problem.slug, `${requirement.id}: within ${requirement.within} is outside the block`);
    }
    if (usableIn(within.prefix) < requirement.hosts) {
      note(
        problem.slug,
        `${requirement.id}: needs ${requirement.hosts} hosts and its within block holds ${usableIn(within.prefix)}`,
      );
    }
  }

  /* Grouped "within" constraints have to be jointly satisfiable too. */
  const groups = new Map<string, number>();
  for (const requirement of problem.requirements) {
    if (!requirement.within) continue;
    groups.set(
      requirement.within,
      (groups.get(requirement.within) ?? 0) + sizeOf(prefixForHosts(requirement.hosts)),
    );
  }
  for (const [where, needed] of groups) {
    const parsed = parseCidr(where);
    if (!isCidr(parsed)) continue;
    if (needed > sizeOf(parsed.prefix)) {
      note(
        problem.slug,
        `the subnets constrained to ${where} need at least ${needed} addresses and it holds ${sizeOf(parsed.prefix)}`,
      );
    }
  }

  /* Every solution entry must correspond to a requirement, and vice versa. */
  const ids = new Set(problem.requirements.map((r) => r.id));
  for (const key of Object.keys(problem.solution)) {
    if (!ids.has(key)) note(problem.slug, `the solution allocates ${key}, which is not a requirement`);
  }
  for (const id of ids) {
    if (!(id in problem.solution)) note(problem.slug, `the solution has nothing for ${id}`);
  }

  if (problem.hints.length < 2) note(problem.slug, "fewer than two hints");
  if (problem.debrief.length < 2) note(problem.slug, "the debrief is too thin");
  if (problem.requirements.length < 3) note(problem.slug, "fewer than three requirements");
}

/* Address arithmetic, worked out by hand. */
const USABLE: [number, number][] = [
  [24, 254],
  [25, 126],
  [26, 62],
  [27, 30],
  [28, 14],
  [29, 6],
  [30, 2],
  [31, 2],
  [32, 1],
  [16, 65534],
  [20, 4094],
];
for (const [prefix, want] of USABLE) {
  const got = usableIn(prefix);
  if (got !== want) problems.push(`usable in a /${prefix} should be ${want}, got ${got}`);
}

const NEEDED: [number, number][] = [
  // One host is a /32 host route, not a /31. I wrote 31 here first and the
  // check was right: a /31 spends two addresses on one host for no reason.
  [1, 32],
  [2, 31],
  [3, 29],
  [6, 29],
  [7, 28],
  [14, 28],
  [15, 27],
  [100, 25],
  [126, 25],
  [127, 24],
  [254, 24],
  [400, 23],
  [4000, 20],
];
for (const [hosts, want] of NEEDED) {
  const got = prefixForHosts(hosts);
  if (got !== want) problems.push(`${hosts} hosts should need a /${want}, got /${got}`);
}

/* Alignment and overlap, in both directions. */
const ALIGNED: [string, boolean][] = [
  ["192.168.10.0/24", true],
  ["192.168.10.128/25", true],
  ["192.168.10.64/25", false],
  ["10.40.3.0/23", false],
  ["10.40.2.0/23", true],
  ["172.16.5.14/31", true],
  ["172.16.5.13/31", false],
  ["10.80.16.0/20", true],
  ["10.80.8.0/20", false],
];
for (const [text, want] of ALIGNED) {
  const parsed = parseCidr(text);
  if (!isCidr(parsed)) {
    problems.push(`alignment: ${text} did not parse`);
    continue;
  }
  const got = isAligned(parsed);
  if (got !== want) problems.push(`${text} aligned should be ${want}, got ${got}`);
}

const OVERLAPS: [string, string, boolean][] = [
  ["192.168.30.0/25", "192.168.30.64/26", true],
  ["192.168.30.0/25", "192.168.30.128/26", false],
  ["10.0.0.0/8", "10.255.255.255/32", true],
  ["10.0.0.0/8", "11.0.0.0/8", false],
  ["192.168.30.0/24", "192.168.30.0/24", true],
];
for (const [first, second, want] of OVERLAPS) {
  const a = parseCidr(first);
  const b = parseCidr(second);
  if (!isCidr(a) || !isCidr(b)) {
    problems.push(`overlap: ${first} or ${second} did not parse`);
    continue;
  }
  const got = overlaps(a, b);
  if (got !== want) problems.push(`${format(a)} against ${format(b)} should be ${want}, got ${got}`);
}

/* Malformed input must be refused with a message, not silently normalized. */
const REFUSALS: [string, RegExp][] = [
  ["192.168.1.0", /needs a prefix/],
  ["192.168.1.0/33", /above 32/],
  ["192.168.1.256/24", /not four octets/],
  ["192.168.1/24", /not four octets/],
  ["192.168.1.0/ab", /not a number/],
];
for (const [text, pattern] of REFUSALS) {
  const parsed = parseCidr(text);
  if (isCidr(parsed)) {
    problems.push(`refusals: "${text}" parsed cleanly and should not have`);
    continue;
  }
  if (!pattern.test(parsed.error)) {
    problems.push(`refusals: "${text}" was refused with "${parsed.error}", not matching ${pattern}`);
  }
}

/* ------------------------------------------- the address arithmetic itself */

/*
  Five functions here were exported and named by nothing in this file until a
  check over every logic file found them: parseAddress, toDotted, maskFor,
  networkOf and broadcastOf. They are the arithmetic a router does, and this
  page exists to teach it, so a quiet bug in any of them would teach it wrong
  with a straight face.

  Generated rather than tabulated, because the failure modes are all at the
  edges: JavaScript's bitwise operators are signed, a shift count of 32 is
  taken modulo 32 and returns its input, and >>> 0 is the only thing keeping
  any of it unsigned.
*/
let cidrSeed = 0x4d2c1f;
const nextCidr = () => {
  cidrSeed ^= cidrSeed << 13;
  cidrSeed >>>= 0;
  cidrSeed ^= cidrSeed >>> 17;
  cidrSeed ^= cidrSeed << 5;
  cidrSeed >>>= 0;
  return cidrSeed;
};

/* Every prefix length, every round, because 0, 31 and 32 are the whole risk. */
for (let round = 0; round < 4000; round += 1) {
  const value = nextCidr();

  /* toDotted and parseAddress are inverses over the whole 32-bit space. */
  const dotted = toDotted(value);
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(dotted)) {
    problems.push(`toDotted(${value}) produced "${dotted}"`);
  }
  for (const octet of dotted.split(".")) {
    if (Number(octet) > 255) problems.push(`toDotted(${value}) produced the octet ${octet}`);
  }
  if (parseAddress(dotted) !== value) {
    problems.push(`toDotted then parseAddress turned ${value} into ${parseAddress(dotted)}`);
  }

  for (let prefix = 0; prefix <= 32; prefix += 1) {
    const mask = maskFor(prefix);

    /* A mask is exactly `prefix` ones followed by zeros, and nothing else. */
    let ones = 0;
    for (let bit = 31; bit >= 0; bit -= 1) {
      if ((mask & (1 << bit)) !== 0) ones += 1;
      else break;
    }
    let population = 0;
    for (let bit = 0; bit < 32; bit += 1) if ((mask >>> bit) & 1) population += 1;
    if (ones !== prefix || population !== prefix) {
      problems.push(`maskFor(${prefix}) is ${toDotted(mask)}, which is ${ones} leading and ${population} total ones`);
    }
    if (mask < 0) problems.push(`maskFor(${prefix}) came back signed`);

    const cidr = { base: value, prefix };
    const network = networkOf(cidr);
    const broadcast = broadcastOf(cidr);

    if (network < 0 || broadcast < 0) problems.push(`prefix ${prefix} produced a signed result`);
    if (broadcast < network) problems.push(`prefix ${prefix}: broadcast is below the network address`);

    /* The block spans exactly as many addresses as its prefix allows. */
    if (broadcast - network + 1 !== sizeOf(prefix)) {
      problems.push(`prefix ${prefix} spans ${broadcast - network + 1} addresses and sizeOf says ${sizeOf(prefix)}`);
    }

    /* Masking is idempotent: a network address is its own network. */
    if (networkOf({ base: network, prefix }) !== network) {
      problems.push(`prefix ${prefix}: masking a network address moved it`);
    }
    if (!isAligned({ base: network, prefix })) {
      problems.push(`prefix ${prefix}: a network address was not reported as aligned`);
    }

    /* And the block contains its own ends and nothing outside them. */
    if (!contains(cidr, { base: network, prefix: 32 })) {
      problems.push(`prefix ${prefix}: the block does not contain its own network address`);
    }
    if (!contains(cidr, { base: broadcast, prefix: 32 })) {
      problems.push(`prefix ${prefix}: the block does not contain its own broadcast address`);
    }
    if (prefix > 0 && network > 0 && contains(cidr, { base: network - 1, prefix: 32 })) {
      problems.push(`prefix ${prefix}: the block contains the address below it`);
    }
    if (prefix > 0 && broadcast < 0xffffffff && contains(cidr, { base: broadcast + 1, prefix: 32 })) {
      problems.push(`prefix ${prefix}: the block contains the address above it`);
    }
  }
}

/* The two ends of the space, by hand, since a generator may never hit them. */
for (const [value, want] of [
  [0, "0.0.0.0"],
  [0xffffffff, "255.255.255.255"],
  [0x0a000001, "10.0.0.1"],
  [0xc0a80101, "192.168.1.1"],
] as [number, string][]) {
  if (toDotted(value) !== want) problems.push(`toDotted(${value}) is "${toDotted(value)}" rather than "${want}"`);
  if (parseAddress(want) !== value) problems.push(`parseAddress("${want}") is ${parseAddress(want)} rather than ${value}`);
}
if (maskFor(0) !== 0) problems.push(`maskFor(0) is ${maskFor(0)} rather than 0`);
if (maskFor(32) !== 0xffffffff) problems.push(`maskFor(32) is ${maskFor(32)} rather than 4294967295`);
if (maskFor(24) !== 0xffffff00) problems.push(`maskFor(24) is ${maskFor(24)} rather than 255.255.255.0`);

/* And what parseAddress must refuse, since a lenient parser accepts a typo. */
for (const bad of ["", "10.0.0", "10.0.0.1.2", "10.0.0.256", "10.0.0.-1", "ten.0.0.1", "10..0.1", "10.0.0.1/24"]) {
  if (parseAddress(bad) !== null) problems.push(`parseAddress("${bad}") returned ${parseAddress(bad)} rather than refusing`);
}

if (problems.length) {
  console.error(`\ncheck-allocate: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${PROBLEMS.length} address plans, ${requirementCount} requirements, every solution satisfies every one and every empty plan does not. ` +
    `${USABLE.length + NEEDED.length + ALIGNED.length + OVERLAPS.length} hand-computed results agree with the arithmetic, and ${REFUSALS.length} malformed CIDRs are refused.`,
);
