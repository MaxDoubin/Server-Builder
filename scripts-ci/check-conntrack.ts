/**
 * The conntrack table, checked against arithmetic it does not share with the
 * model, and against the machine this was written on.
 *
 * Two things here are easy to get wrong and impossible to see. The sizing has
 * two cliffs and a fallback, so an off-by-one in a comparison moves a whole
 * class of host into the wrong bucket count and every answer stays plausible.
 * And the eviction rule is a single bit, so inverting it makes the surface
 * teach the opposite of what the kernel does while every page still renders.
 *
 * So both are recomputed in a shape the model does not use:
 *
 *   the sizing, by walking memory upward one gibibyte at a time and checking
 *   that the bucket count only ever steps at the two boundaries the source
 *   names, never between them and never backwards. The model branches; this
 *   watches the function's shape.
 *
 *   the eviction rule, against the condition from early_drop_list itself
 *   rather than against the model's table, so the two have to agree on every
 *   flow type.
 *
 * And the numbers are anchored to a real kernel. The host this was written on
 * reports, from /proc/sys/net/netfilter and /proc/net/stat/nf_conntrack:
 *
 *   15 GiB of memory, nothing forcing the hash size
 *   nf_conntrack_max = 262144, nf_conntrack_buckets = 262144, a 1:1 ratio
 *   nf_conntrack_tcp_timeout_established = 432000
 *   nf_conntrack_udp_timeout = 30
 *   with the limit lowered to 20 and the table filled with established
 *   connections: drop +296, early_drop +0
 *
 * Those are asserted below, so a change that drifts away from the kernel
 * fails the build rather than shipping.
 */

import { CASES } from "../client/src/lib/conntrack/data/cases";
import {
  ASSURED,
  EVICTION_RANGE,
  TIMEOUTS,
  asCounters,
  asSysctl,
  autoBuckets,
  buckets,
  correctOption,
  count,
  earlyDropHelps,
  entriesHeld,
  holds,
  human,
  matching,
  maxEntries,
  maxFactor,
  overflows,
  ratio,
  timeoutSeconds,
} from "../client/src/lib/conntrack/model";
import type { Case, Flow, Setup } from "../client/src/lib/conntrack/types";

const problems: string[] = [];
const note = (message: string) => problems.push(message);

/* -------------------------------------- the sizing, watched rather than read */

/**
 * The bucket count as a function of memory has exactly two steps.
 *
 * The model branches on two comparisons. This walks a gibibyte at a time from
 * 1 to 512 and asserts the shape the source implies: the value never falls,
 * it changes at 2 and at 5 (the first whole gibibytes strictly greater than
 * 1 and than 4), and it changes nowhere else. A comparison written as >= or a
 * boundary moved by one shows up as a step in the wrong place.
 */
{
  const steps: number[] = [];
  let previous = autoBuckets(1);
  for (let gib = 2; gib <= 512; gib += 1) {
    const here = autoBuckets(gib);
    if (here < previous) note(`autoBuckets falls between ${gib - 1} and ${gib} GiB, from ${previous} to ${here}`);
    if (here !== previous) steps.push(gib);
    previous = here;
  }
  if (steps.length !== 2 || steps[0] !== 2 || steps[1] !== 5) {
    note(`autoBuckets should step at exactly 2 and 5 GiB and it steps at ${steps.join(", ") || "nowhere"}`);
  }
  if (autoBuckets(1) !== 8192) note(`a gibibyte should give 8192 buckets and gives ${autoBuckets(1)}`);
  if (autoBuckets(2) !== 65_536) note(`two gibibytes should give 65536 and gives ${autoBuckets(2)}`);
  if (autoBuckets(5) !== 262_144) note(`five gibibytes should give 262144 and gives ${autoBuckets(5)}`);
  /* The floor, which only a very small machine reaches. */
  if (autoBuckets(0) < 1024) note(`the 1024 floor is not applied: zero gibibytes gives ${autoBuckets(0)}`);
}

/* ------------------------------------------- the eviction rule, independently */

/*
  early_drop_list skips an entry when IPS_ASSURED is set. Assured means the
  flow has been seen in both directions past any handshake, which is a
  property of the flow state and not of the protocol, so it is stated here
  from that definition rather than copied from the model's table.
*/
const TWO_WAY: Record<Flow, boolean> = {
  "tcp-established": true,
  "tcp-syn-sent": false,
  "tcp-time-wait": false,
  udp: false,
  "udp-stream": true,
};
for (const flow of Object.keys(TWO_WAY) as Flow[]) {
  if (ASSURED[flow] !== TWO_WAY[flow]) {
    note(`${flow}: the model calls it ${ASSURED[flow] ? "" : "not "}assured and two-way traffic says otherwise`);
  }
  const probe: Setup = { host: "probe", ramGiB: 16, forcedBuckets: null, flowsPerSecond: 1, flow, activeSeconds: 0 };
  if (earlyDropHelps(probe) === ASSURED[flow]) {
    note(`${flow}: earlyDropHelps should be the opposite of assured and it is not`);
  }
}
if (EVICTION_RANGE !== 8) note(`NF_CT_EVICTION_RANGE is 8 and the model says ${EVICTION_RANGE}`);

/* ------------------------------------------------ what this kernel reports */

const KERNEL = { ramGiB: 15, max: 262_144, buckets: 262_144, tcpEstablished: 432_000, udp: 30 };
{
  const host: Setup = { host: "measured", ramGiB: KERNEL.ramGiB, forcedBuckets: null, flowsPerSecond: 0, flow: "udp", activeSeconds: 0 };
  if (buckets(host) !== KERNEL.buckets) {
    note(`the host this was measured on has ${KERNEL.buckets} buckets and the model gives ${buckets(host)}`);
  }
  if (maxEntries(host) !== KERNEL.max) {
    note(`that host reports nf_conntrack_max ${KERNEL.max} and the model gives ${maxEntries(host)}`);
  }
  if (ratio(host) !== 1) note(`that host's max over buckets is 1 and the model gives ${ratio(host)}`);
  if (maxFactor(host) !== 1) note(`max_factor on the auto-sizing path is 1 and the model gives ${maxFactor(host)}`);
  if (maxFactor({ ...host, forcedBuckets: 65_536 }) !== 8) note("max_factor with the hash size forced should be 8");
  if (TIMEOUTS["tcp-established"] !== KERNEL.tcpEstablished) {
    note(`nf_conntrack_tcp_timeout_established is ${KERNEL.tcpEstablished} and the model says ${TIMEOUTS["tcp-established"]}`);
  }
  if (TIMEOUTS.udp !== KERNEL.udp) note(`nf_conntrack_udp_timeout is ${KERNEL.udp} and the model says ${TIMEOUTS.udp}`);
}

/*
  The measurement that gives the surface its point: a table of established
  connections produced drops and no evictions. Stated as the property it
  demonstrates rather than as the raw counters, because the counters are of
  that one run and the property is of the kernel.
*/
{
  const assured: Setup = { host: "measured", ramGiB: 15, forcedBuckets: null, flowsPerSecond: 200, flow: "tcp-established", activeSeconds: 60 };
  if (!overflows(assured)) note("the measured overflow case does not overflow in the model");
  if (earlyDropHelps(assured)) {
    note("a table of established connections was measured dropping 296 packets with zero evictions, and the model says early_drop helps");
  }
}

/* ------------------------------------------------------------ every case */

if (CASES.length < 10) note(`only ${CASES.length} cases, which is too few for a surface`);

const seenSlugs = new Set<string>();
const seenBreaks = new Set<string>();
const answerAt = new Map<number, number>();
let withAutoSizing = 0;
let withForcedSizing = 0;
let evictable = 0;

for (const item of CASES as Case[]) {
  const { setup, slug } = item;

  if (seenSlugs.has(slug)) note(`${slug} appears twice`);
  seenSlugs.add(slug);
  if (seenBreaks.has(item.breaks)) note(`${slug} breaks a belief another case already breaks: "${item.breaks}"`);
  seenBreaks.add(item.breaks);

  for (const [field, value] of Object.entries(setup)) {
    if (typeof value === "number" && !Number.isInteger(value)) {
      note(`${slug} has a fractional ${field} (${value}); every input here is a whole count or second`);
    }
  }
  if (setup.ramGiB < 1) note(`${slug} has ${setup.ramGiB} GiB of memory, which is not a host`);
  if (setup.forcedBuckets !== null) withForcedSizing += 1;
  else withAutoSizing += 1;
  if (earlyDropHelps(setup)) evictable += 1;

  /* The limit, from the two pieces, against the model's single answer. */
  if (maxFactor(setup) * buckets(setup) !== maxEntries(setup)) {
    note(`${slug}: max_factor times buckets is not what maxEntries returns`);
  }
  if (ratio(setup) !== maxFactor(setup)) note(`${slug}: the ratio and max_factor disagree`);
  if (setup.forcedBuckets !== null && buckets(setup) !== setup.forcedBuckets) {
    note(`${slug} forces ${setup.forcedBuckets} buckets and the model uses ${buckets(setup)}`);
  }

  /* Occupancy, summed per flow rather than multiplied. */
  let summed = 0;
  for (let i = 0; i < setup.flowsPerSecond; i += 1) summed += setup.activeSeconds + timeoutSeconds(setup);
  if (summed !== entriesHeld(setup)) {
    note(`${slug}: summing each flow's holding time gives ${summed} and the model gives ${entriesHeld(setup)}`);
  }
  if (overflows(setup) !== entriesHeld(setup) > maxEntries(setup)) {
    note(`${slug}: overflows disagrees with the entries against the limit`);
  }

  /* The rendered blocks have to describe this host and not another. */
  const sysctl = asSysctl(setup);
  if (!new RegExp(`nf_conntrack_max = ${maxEntries(setup)}$`, "m").test(sysctl)) {
    note(`${slug}: the rendered sysctl does not state nf_conntrack_max ${maxEntries(setup)}`);
  }
  if (!new RegExp(`nf_conntrack_buckets = ${buckets(setup)}$`, "m").test(sysctl)) {
    note(`${slug}: the rendered sysctl does not state nf_conntrack_buckets ${buckets(setup)}`);
  }
  if ((setup.forcedBuckets !== null) !== sysctl.includes("max_factor is 8")) {
    note(`${slug}: the rendered sysctl disagrees with the setup about whether the hash size was forced`);
  }
  const counters = asCounters(setup);
  const saysTableFull = counters.includes("table full");
  if (saysTableFull !== (overflows(setup) && !earlyDropHelps(setup))) {
    note(
      `${slug}: the rendered counters ${saysTableFull ? "print" : "do not print"} the table full line, and this host ` +
        `${overflows(setup) ? "overflows" : "does not overflow"} with early_drop ${earlyDropHelps(setup) ? "able" : "unable"} to help`,
    );
  }

  /* Exactly one option holds, judged here and by the model's own dispatcher. */
  const truths = item.options.filter((option) => holds(option.says, setup));
  if (truths.length !== 1) {
    note(`${slug} has ${truths.length} true options (${truths.map((o) => o.id).join(", ") || "none"}); it must have exactly one`);
  } else {
    answerAt.set(item.options.indexOf(truths[0]), (answerAt.get(item.options.indexOf(truths[0])) ?? 0) + 1);
    if (correctOption(item)?.id !== truths[0].id) {
      note(`${slug}: correctOption returns ${correctOption(item)?.id ?? "nothing"} where the one true option is ${truths[0].id}`);
    }
  }
  if (matching(item).length !== truths.length) {
    note(`${slug}: this check finds ${truths.length} true and matching() finds ${matching(item).length}`);
  }
  if (item.options.length !== 4) note(`${slug} offers ${item.options.length} options rather than four`);
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) note(`${slug} reuses an option id`);
  if (!item.question.trim().endsWith("?")) note(`${slug}'s question is not a question`);
  for (const field of ["why", "fix", "brief", "breaks"] as const) {
    if (item[field].trim().length < 40) note(`${slug} has almost nothing in its ${field}`);
  }
}

for (const [position, howMany] of answerAt) {
  if (howMany > CASES.length / 2) {
    note(`${howMany} of ${CASES.length} answers sit at position ${position}, which is a pattern worth more than the reasoning`);
  }
}

/*
  And the set has to cover both halves of what the surface claims. A set that
  only ever auto-sizes cannot teach that forcing the hash size changes the
  factor, and one where early_drop always fails cannot teach that it sometimes
  works.
*/
if (withForcedSizing < 2) note(`only ${withForcedSizing} cases force the hash size, so the factor of eight is barely shown`);
if (withAutoSizing < 5) note(`only ${withAutoSizing} cases auto-size, which is the path almost every host takes`);
if (evictable < 3) note(`only ${evictable} cases have entries early_drop could take, so the mechanism looks useless`);
if (evictable > CASES.length - 3) note(`only ${CASES.length - evictable} cases have a table early_drop cannot save, which is the point of the surface`);

/* human and count are what every rendered number goes through. */
if (human(432_000) !== "5 days") note(`432000 seconds should read "5 days" and reads "${human(432_000)}"`);
if (human(30) !== "30s") note(`30 seconds should read "30s" and reads "${human(30)}"`);
if (human(120) !== "2min") note(`120 seconds should read "2min" and reads "${human(120)}"`);
if (count(262_144) !== "262,144") note(`262144 should read "262,144" and reads "${count(262_144)}"`);

if (problems.length) {
  console.error(`\ncheck-conntrack: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} hosts, each with one option that holds; the bucket count steps only at 2 and 5 GiB across ` +
    `512 walked, the assured rule agrees with two-way traffic on all ${Object.keys(TIMEOUTS).length} flow types, and the model ` +
    `reproduces the measured kernel: 262,144 max against 262,144 buckets, and no eviction from a table of established connections.`,
);
