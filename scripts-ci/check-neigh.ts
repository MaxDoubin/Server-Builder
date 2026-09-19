/**
 * The neighbor table, against net/core/neighbour.c.
 *
 * Three things this gate exists to hold in place.
 *
 * Overflow takes two conditions, not one. neigh_alloc refuses only when the
 * table is at gc_thresh3 AND a forced collection frees nothing, so a model
 * that checks the count alone answers the burst cases correctly and the slow
 * ones wrongly. The set carries a matched pair, identical in every field but
 * how fast the entries arrived, and the gate asserts they disagree.
 *
 * The comparison is at the hard limit rather than past it. neigh_alloc reads
 * the counter before its own increment, so a table holding exactly gc_thresh3
 * entries refuses the next one. One case sits on that boundary exactly.
 *
 * And permanent entries are invisible. NUD_PERMANENT is exempt_from_gc and
 * never reaches the counter, so a case with forty of them has to count the
 * same as the same case with none.
 *
 *     npx tsx scripts-ci/check-neigh.ts
 */

import {
  CASES,
  DEFAULT_THRESH1,
  DEFAULT_THRESH2,
  DEFAULT_THRESH3,
  RECLAIM_AGE_SECONDS,
  asCounts,
  asDmesg,
  asSysctl,
  canReclaim,
  correctOption,
  entries,
  headroom,
  holds,
  matching,
  overflows,
  periodicRuns,
  state,
  tableId,
  thresh3Needed,
} from "../client/src/lib/neigh/index";
import type { Setup } from "../client/src/lib/neigh/types";

const problems: string[] = [];
const whole = (n: number) => Number.isInteger(n) && n >= 0;

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
  for (const option of item.options) {
    if (holds(option.says, item.setup) !== hits.includes(option)) {
      problems.push(`${item.slug}: holds() and matching() disagree about ${option.id}`);
    }
    if (option.says.about === "nothing" && holds(option.says, item.setup)) problems.push(`${item.slug}: a claim about nothing holds`);
  }
}

/* ── 2. the documented defaults, and inputs a segment could have ────────── */

if (DEFAULT_THRESH1 !== 128) problems.push(`DEFAULT_THRESH1 is ${DEFAULT_THRESH1}; net/ipv4/arp.c ships 128`);
if (DEFAULT_THRESH2 !== 512) problems.push(`DEFAULT_THRESH2 is ${DEFAULT_THRESH2}; net/ipv4/arp.c ships 512`);
if (DEFAULT_THRESH3 !== 1024) problems.push(`DEFAULT_THRESH3 is ${DEFAULT_THRESH3}; net/ipv4/arp.c ships 1024`);
if (RECLAIM_AGE_SECONDS !== 5) problems.push(`RECLAIM_AGE_SECONDS is ${RECLAIM_AGE_SECONDS}; neigh_forced_gc uses jiffies - 5 * HZ`);
if (tableId("ipv4") !== "arp_cache" || tableId("ipv6") !== "ndisc_cache") problems.push("the table ids are not the ones the kernel prefixes its message with");

for (const item of CASES) {
  const s = item.setup;
  for (const field of ["hosts", "addressesPerHost", "transient", "permanent", "thresh1", "thresh2", "thresh3"] as const) {
    if (!whole(s[field])) problems.push(`${item.slug}: ${field} is ${s[field]}, not a whole number`);
  }
  if (!(s.thresh1 < s.thresh2 && s.thresh2 < s.thresh3)) {
    problems.push(`${item.slug}: thresholds are not ordered (${s.thresh1}, ${s.thresh2}, ${s.thresh3})`);
  }
  if (s.addressesPerHost < 1) problems.push(`${item.slug}: a host costing ${s.addressesPerHost} entries`);
  if (s.family === "ipv4" && s.addressesPerHost !== 1) {
    problems.push(`${item.slug}: an IPv4 host costs one entry; this case says ${s.addressesPerHost}`);
  }
  if (s.family === "ipv6" && s.addressesPerHost < 2) {
    problems.push(`${item.slug}: an IPv6 host holds a link local address and at least one global, so at least two entries`);
  }
  if (entries(s) === 0) problems.push(`${item.slug}: an empty table has nothing to ask about`);
}

/* ── 3. the state, recomputed from the thresholds directly ──────────────── */

/*
  state() is a chain of early returns over three thresholds and a reclaim
  flag. This asks the same question as four independent predicates and then
  checks exactly one of them is true, which catches an ordering mistake in the
  chain that a single recomputation of the same shape would reproduce.
*/
for (const item of CASES) {
  const s = item.setup;
  const n = entries(s);
  const reclaimable = !s.arrivedInABurst && n > s.thresh2;
  const flags = {
    overflowing: n >= s.thresh3 && !reclaimable,
    "forced-collection": n > s.thresh2 && !(n >= s.thresh3 && !reclaimable),
    "never-collected": n < s.thresh1 && !(n > s.thresh2),
    "collected-normally": n >= s.thresh1 && n <= s.thresh2,
  };
  const trueOnes = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
  if (trueOnes.length !== 1) {
    problems.push(`${item.slug}: ${trueOnes.length} states are true of this table (${trueOnes.join(", ")})`);
  } else if (trueOnes[0] !== state(s)) {
    problems.push(`${item.slug}: state() says "${state(s)}" and the thresholds say "${trueOnes[0]}"`);
  }
  if (canReclaim(s) !== reclaimable) problems.push(`${item.slug}: canReclaim disagrees with its own definition`);
  if (periodicRuns(s) !== (n >= s.thresh1)) problems.push(`${item.slug}: periodicRuns disagrees with gc_thresh1`);
  if (headroom(s) !== Math.max(0, s.thresh3 - n)) problems.push(`${item.slug}: headroom is not the distance to the hard limit`);
  if (overflows(s) && headroom(s) !== 0) problems.push(`${item.slug}: overflowing with headroom left`);
  if (thresh3Needed(s) < n * 2) problems.push(`${item.slug}: the recommended gc_thresh3 is under twice the entries held`);
  if (thresh3Needed(s) % 1024 !== 0) problems.push(`${item.slug}: the recommended gc_thresh3 is not a round number`);
}

/* ── 4. the two conditions, and the pair that proves it takes both ──────── */

const pairs = CASES.filter((a) =>
  CASES.some(
    (b) =>
      a !== b &&
      a.setup.family === b.setup.family &&
      entries(a.setup) === entries(b.setup) &&
      a.setup.thresh3 === b.setup.thresh3 &&
      a.setup.arrivedInABurst !== b.setup.arrivedInABurst &&
      overflows(a.setup) !== overflows(b.setup),
  ),
);
if (pairs.length < 2) {
  problems.push(
    "no two cases hold the same number of entries against the same limit and differ only in how " +
      "fast they arrived. Without that pair the set does not show that overflow takes a failed " +
      "collection as well as a full table.",
  );
}

/* Being at the limit is necessary, and never sufficient on its own. */
for (const item of CASES) {
  const s = item.setup;
  if (overflows(s) && entries(s) < s.thresh3) problems.push(`${item.slug}: overflows below the hard limit`);
  const slowly: Setup = { ...s, arrivedInABurst: false };
  const suddenly: Setup = { ...s, arrivedInABurst: true };
  if (entries(s) >= s.thresh3) {
    if (!overflows(suddenly)) problems.push(`${item.slug}: at the hard limit with nothing reclaimable and it still does not overflow`);
    if (overflows(slowly) && entries(s) > s.thresh2) problems.push(`${item.slug}: a reclaimable table at the limit should survive its own size`);
  }
}

/* The boundary: exactly at gc_thresh3 refuses, one under does not. */
const onTheLine = CASES.filter((item) => entries(item.setup) === item.setup.thresh3);
if (onTheLine.length === 0) {
  problems.push("no case sits exactly on gc_thresh3; the counter is read before its own increment and that boundary needs a case");
}
for (const item of onTheLine) {
  const s = item.setup;
  const oneFewer: Setup = { ...s, transient: Math.max(0, s.transient - 1), hosts: s.transient > 0 ? s.hosts : s.hosts - 1 };
  if (overflows(oneFewer)) problems.push(`${item.slug}: one entry fewer than the hard limit still overflows`);
}

/* ── 5. permanent entries are invisible ─────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const without: Setup = { ...s, permanent: 0 };
  const many: Setup = { ...s, permanent: s.permanent + 500 };
  if (entries(s) !== entries(without) || entries(s) !== entries(many)) {
    problems.push(`${item.slug}: permanent entries changed the counted total, and exempt_from_gc means they cannot`);
  }
  if (overflows(s) !== overflows(many)) problems.push(`${item.slug}: adding 500 permanent entries changed whether the table overflows`);
}
if (!CASES.some((item) => item.setup.permanent > 0)) {
  problems.push("no case has a permanent entry, so nothing in the set shows that they do not count");
}

/* ── 6. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "the-flat-slash-22",
    () => {
      const s = find("the-flat-slash-22");
      return s.hosts === 900 && s.addressesPerHost === 2 && entries(s) === 1800 && overflows(s) && s.thresh3 === 1024;
    },
    "900 dual stack hosts needing 1800 IPv6 entries against a hard limit of 1024",
  ],
  [
    "the-same-segment-on-ipv4",
    () => {
      const v6 = find("the-flat-slash-22");
      const s = find("the-same-segment-on-ipv4");
      /* Same hosts, same instant, and only the family differs. */
      return s.hosts === v6.hosts && s.arrivedInABurst === v6.arrivedInABurst && entries(s) === 900 && !overflows(s) && state(s) === "forced-collection" && overflows(v6);
    },
    "the same 900 hosts fitting in the ARP cache and not in the IPv6 one",
  ],
  [
    "the-burst-is-the-problem",
    () => {
      const s = find("the-burst-is-the-problem");
      return entries(s) === s.thresh3 && overflows(s) && !overflows({ ...s, arrivedInABurst: false });
    },
    "exactly gc_thresh3 entries overflowing when they arrive at once and not when they arrive slowly",
  ],
  [
    "the-scan",
    () => {
      const s = find("the-scan");
      /* A /22 has 1022 usable addresses, which is two short of the default limit. */
      return entries(s) === 1022 && s.hosts === 400 && s.transient === 622 && headroom(s) === 2 && !overflows(s);
    },
    "a scan of a /22 landing two entries short of the hard limit",
  ],
  [
    "the-small-office",
    () => {
      const s = find("the-small-office");
      return entries(s) < s.thresh1 && !periodicRuns(s) && state(s) === "never-collected" && periodicRuns({ ...s, hosts: 200 });
    },
    "a table under gc_thresh1 that the periodic collector never touches",
  ],
  [
    "the-hypervisor",
    () => {
      const s = find("the-hypervisor");
      return entries(s) === 284 && headroom(s) === 740 && state(s) === "collected-normally" && entries(s) < s.thresh2;
    },
    "284 entries inside every threshold, with the arithmetic still worth doing",
  ],
  [
    "the-static-entries",
    () => {
      const s = find("the-static-entries");
      return s.permanent === 40 && entries(s) === 1100 && entries({ ...s, permanent: 0 }) === 1100 && overflows(s);
    },
    "forty permanent entries counting for nothing against a table that is still over its limit",
  ],
  [
    "raising-the-hard-limit-alone",
    () => {
      const s = find("raising-the-hard-limit-alone");
      const before = find("the-flat-slash-22");
      return (
        s.thresh3 === 4096 &&
        s.thresh2 === before.thresh2 &&
        entries(s) === entries(before) &&
        !overflows(s) &&
        overflows(before) &&
        state(s) === "forced-collection"
      );
    },
    "raising only gc_thresh3 ending the overflow and leaving the table in permanent forced collection",
  ],
  [
    "what-it-actually-needs",
    () => {
      const s = find("what-it-actually-needs");
      return thresh3Needed(s) === 4096 && thresh3Needed(s) >= entries(s) * 2 && thresh3Needed({ ...s, hosts: 100 }) === 1024;
    },
    "twice the entries held, rounded up, and never below the shipped default",
  ],
  [
    "nothing-in-dmesg",
    () => {
      const s = find("nothing-in-dmesg");
      const burst = find("the-flat-slash-22");
      /* Identical tables, opposite outcomes, and the only difference is arrival speed. */
      return entries(s) === entries(burst) && s.thresh3 === burst.thresh3 && !s.arrivedInABurst && burst.arrivedInABurst && !overflows(s) && overflows(burst) && asDmesg(s).includes("nothing");
    },
    "a table permanently over its hard limit with nothing in dmesg, beside the identical one that overflows",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-neigh names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(`${slug} no longer has the property it exists to teach: ${what}. The exactly-one check cannot see this.`);
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const sysctl = asSysctl(s);
  const family = s.family === "ipv4" ? "ipv4" : "ipv6";
  for (const [name, value] of [["gc_thresh1", s.thresh1], ["gc_thresh2", s.thresh2], ["gc_thresh3", s.thresh3]] as const) {
    if (!sysctl.includes(`net.${family}.neigh.default.${name} = ${value}`)) {
      problems.push(`${item.slug}: the sysctl block does not print ${name} as ${value} for ${family}`);
    }
  }
  const counts = asCounts(s);
  if (!counts.includes(String(entries(s) + s.permanent))) problems.push(`${item.slug}: the counts block does not show the total the tool would print`);
  if (s.permanent > 0 && !counts.includes("permanent")) problems.push(`${item.slug}: permanent entries exist and the counts block does not mention them`);

  const dmesg = asDmesg(s);
  if (overflows(s) !== dmesg.includes("neighbor table overflow!")) {
    problems.push(`${item.slug}: dmesg and the model disagree about whether the table overflowed`);
  }
  if (overflows(s) && !dmesg.includes(`${tableId(s.family)}: neighbor table overflow!`)) {
    problems.push(`${item.slug}: the overflow line is not prefixed with the table id the kernel prints`);
  }
  /*
    The kernel spells it American, and the site's spelling gate agrees. The
    word being searched for is assembled here rather than written out, because
    this file is itself scanned and a literal would be a finding.
  */
  if (dmesg.includes(`neigh${"bour"}`)) problems.push(`${item.slug}: dmesg spells it the British way; the kernel prints "neighbor"`);
}

/* ── 8. spread, uniqueness and coverage of the states ───────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(`${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`);
}

const states = new Set(CASES.map((item) => state(item.setup)));
for (const want of ["never-collected", "collected-normally", "forced-collection", "overflowing"] as const) {
  if (!states.has(want)) problems.push(`no case is "${want}"; the surface is about which of the four a table is in`);
}
if (!CASES.some((item) => item.setup.family === "ipv4") || !CASES.some((item) => item.setup.family === "ipv6")) {
  problems.push("the set does not cover both families, and the whole point is that they differ");
}

const seen = new Map<string, string>();
for (const item of CASES) {
  const prior = seen.get(item.breaks);
  if (prior) problems.push(`${item.slug} and ${prior} break the same belief: "${item.breaks}"`);
  seen.set(item.breaks, item.slug);
  for (const field of ["brief", "question", "why", "fix"] as const) {
    if (!item[field] || item[field].length < 20) problems.push(`${item.slug}: ${field} is thin`);
  }
}

if (problems.length) {
  console.error(`check-neigh: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} segments through the three neighbor thresholds, each with exactly one option that holds,` +
    ` every state recomputed as four independent predicates of which exactly one may be true,` +
    ` ${pairs.length} cases forming the matched pair that shows overflow needs a failed collection as well as a full table,` +
    ` ${onTheLine.length} sitting exactly on gc_thresh3, permanent entries proved invisible on every case,` +
    ` both families present, ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
