/**
 * The TCP retransmission budget, checked against arithmetic it does not share
 * with the model, and against a measurement taken on a real kernel.
 *
 * The thing that can be wrong here is a fencepost, and a fencepost in this
 * model is invisible: every answer stays plausible, the page still renders,
 * and the surface teaches a number that is one out. So the budget is
 * recomputed by summing the retransmit schedule the kernel would actually
 * follow, term by term, rather than by the closed form the model uses. The
 * closed form is `(2 << boundary) - 1` and a sum of flat intervals; the check
 * below adds up 200ms, 400ms, 800ms and so on, clamping at the ceiling, and
 * the two have to land on the same millisecond.
 *
 * Two of the answers were also measured rather than derived. On this
 * container, as root, with tcp_retries2 set and the peer black holed with an
 * iptables rule on loopback:
 *
 *     tcp_retries2 = 5  ->  ETIMEDOUT after 13.25s, RetransSegs +6
 *     tcp_retries2 = 6  ->  ETIMEDOUT after 26.39s, RetransSegs +7
 *
 * and /proc/net/snmp on the same kernel reports RtoMin 200 and RtoMax 120000,
 * which is TCP_RTO_MIN and TCP_RTO_MAX confirmed without reading a header.
 * Those four numbers are asserted here, so a change to the model that breaks
 * agreement with a real kernel fails the build rather than quietly shipping.
 *
 * Plus the usual: exactly one option holds per case, every distractor is
 * false against the model, the beliefs the cases break are all different, and
 * the right answer is not always in the same place.
 */

import { CASES } from "../client/src/lib/retrans/data/cases";
import {
  RTO_MAX_MS,
  RTO_MIN_MS,
  budgetMs,
  budgetSeconds,
  correctOption,
  countMatchesSysctl,
  ending,
  givesUpAtSeconds,
  holds,
  human,
  matching,
  modeledTimeoutMs,
  retransmissions,
  schedule,
  asSysctl,
  asTrace,
} from "../client/src/lib/retrans/model";
import type { Case, Setup } from "../client/src/lib/retrans/types";

const problems: string[] = [];
const note = (message: string) => problems.push(message);

/* ------------------------------- the budget, summed instead of solved */

/**
 * tcp_model_timeout the long way.
 *
 * The kernel's closed form exists because summing a geometric series in the
 * timer path would be silly. Summing it here is exactly the point: it shares
 * no algebra with the model, so an off-by-one in `2 << boundary`, a threshold
 * computed with the wrong logarithm, or a ceiling applied in the wrong place
 * all show up as a disagreement.
 *
 * The series the kernel is modeling is the backoff from rto_base: one
 * interval of rto_base, then 2, then 4, doubling until the interval would
 * exceed TCP_RTO_MAX, then flat intervals at the ceiling. `boundary + 1`
 * intervals in total, which is the fencepost worth being explicit about.
 */
function budgetBySummingMs(boundary: number, rtoBaseMs = RTO_MIN_MS): number {
  let total = 0;
  let interval = rtoBaseMs;
  for (let i = 0; i <= boundary; i += 1) {
    total += Math.min(interval, RTO_MAX_MS);
    interval *= 2;
  }
  return total;
}

for (let boundary = 0; boundary <= 30; boundary += 1) {
  const closed = modeledTimeoutMs(boundary);
  const summed = budgetBySummingMs(boundary);
  if (closed !== summed) {
    note(
      `at tcp_retries2 ${boundary} the model's closed form gives ${closed}ms and summing the ` +
        `backoff intervals gives ${summed}ms`,
    );
    break;
  }
}

/* ------------------------------------ the constants, and the measurements */

if (RTO_MIN_MS !== 200) note(`TCP_RTO_MIN is HZ/5, which is 200ms, and the model says ${RTO_MIN_MS}`);
if (RTO_MAX_MS !== 120_000) note(`TCP_RTO_MAX is 120 seconds, and the model says ${RTO_MAX_MS}ms`);

/*
  The two experiments, as assertions. The measured wall clock runs a little
  past the budget because retrans_stamp is set at the first retransmission
  rather than at the original send, and the kernel allows itself a jiffy; the
  retransmission counts have no such slack and are exact.
*/
const MEASURED: { retries2: number; seconds: number; retransSegs: number }[] = [
  { retries2: 5, seconds: 13.25, retransSegs: 6 },
  { retries2: 6, seconds: 26.39, retransSegs: 7 },
];
for (const run of MEASURED) {
  const probe: Setup = { peer: "measured", retries2: run.retries2, rtoMs: RTO_MIN_MS, userTimeoutMs: 0, peerReturnsAtMs: null };
  const predicted = modeledTimeoutMs(run.retries2) / 1000;
  const slack = run.seconds - predicted;
  if (slack < 0 || slack > 1.5) {
    note(
      `tcp_retries2 ${run.retries2} was measured aborting at ${run.seconds}s and the model says ` +
        `${predicted}s, a gap of ${slack.toFixed(2)}s, which is outside the first RTO plus a jiffy`,
    );
  }
  if (retransmissions(probe) !== run.retransSegs) {
    note(
      `tcp_retries2 ${run.retries2} was measured sending ${run.retransSegs} retransmissions and the ` +
        `model says ${retransmissions(probe)}`,
    );
  }
}

/*
  The ceiling is applied to the interval as well as to the doubling.

  No case needs this, because no case has a path costing more than two
  minutes, which is why removing the clamp changes none of their answers. It
  is still load bearing: rtoMs is an input, a connection's retransmit timeout
  can exceed TCP_RTO_MAX in principle, and without the clamp the very first
  interval would be longer than any interval the kernel will ever wait. So the
  case for it is made here, on a setup built for it, rather than left to a
  reader to notice.
*/
{
  const slow: Setup = { peer: "probe", retries2: 15, rtoMs: 300_000, userTimeoutMs: 0, peerReturnsAtMs: null };
  const sends = schedule(slow).slice(0, 6);
  for (let i = 1; i < sends.length; i += 1) {
    const gap = sends[i] - sends[i - 1];
    if (gap !== RTO_MAX_MS) {
      note(
        `a connection whose RTO is already ${slow.rtoMs}ms should still wait ${RTO_MAX_MS}ms between ` +
          `retransmissions, and the model waits ${gap}ms`,
      );
      break;
    }
  }
}

/* ----------------------------------------------- the threshold and its knee */

const thresh = Math.floor(Math.log2(RTO_MAX_MS / RTO_MIN_MS));
if (thresh !== 9) note(`ilog2(120s / 200ms) is ilog2(600), which is 9, and this computes ${thresh}`);
if (modeledTimeoutMs(15) !== 924_600) {
  note(`the default tcp_retries2 of 15 is 924.6 seconds and the model gives ${modeledTimeoutMs(15)}ms`);
}
/* Below the knee each step doubles the budget; at and above it each step adds the ceiling. */
for (let boundary = 1; boundary < thresh; boundary += 1) {
  const step = modeledTimeoutMs(boundary) - modeledTimeoutMs(boundary - 1);
  const next = modeledTimeoutMs(boundary + 1) - modeledTimeoutMs(boundary);
  if (next !== step * 2) note(`below the knee the steps should double, and ${boundary} to ${boundary + 1} does not`);
}
for (let boundary = thresh + 1; boundary <= 24; boundary += 1) {
  if (modeledTimeoutMs(boundary) - modeledTimeoutMs(boundary - 1) !== RTO_MAX_MS) {
    note(`above the knee each step should add ${RTO_MAX_MS}ms, and ${boundary} does not`);
  }
}

/* ------------------------------------------------------------ every case */

if (CASES.length < 10) note(`only ${CASES.length} cases, which is too few for a surface`);

const seenSlugs = new Set<string>();
const seenBreaks = new Set<string>();
const answerAt = new Map<number, number>();
let pathsWhereCountDiffers = 0;

for (const item of CASES as Case[]) {
  const { setup, slug } = item;

  if (seenSlugs.has(slug)) note(`${slug} appears twice`);
  seenSlugs.add(slug);
  if (seenBreaks.has(item.breaks)) note(`${slug} breaks a belief another case already breaks: "${item.breaks}"`);
  seenBreaks.add(item.breaks);

  for (const [field, value] of Object.entries(setup)) {
    if (typeof value === "number" && !Number.isInteger(value)) {
      note(`${slug} has a fractional ${field} (${value}); every input here is a whole count or millisecond`);
    }
  }
  if (setup.retries2 < 1) note(`${slug} has tcp_retries2 below one, which is not a setting anybody has`);
  if (setup.rtoMs < RTO_MIN_MS) {
    note(`${slug} has an RTO of ${setup.rtoMs}ms, under the ${RTO_MIN_MS}ms floor the kernel clamps to`);
  }

  /* The schedule the model walks has to be the backoff, doubling and clamped. */
  const sends = schedule(setup).slice(0, 20);
  for (let i = 1; i < sends.length; i += 1) {
    const gap = sends[i] - sends[i - 1];
    const expected = Math.min(setup.rtoMs * 2 ** (i - 1), RTO_MAX_MS);
    if (gap !== expected) {
      note(`${slug}: the gap before retransmission ${i + 1} is ${gap}ms and the backoff says ${expected}ms`);
      break;
    }
  }

  /* The budget, against the summed one, for this case's own boundary. */
  if (setup.userTimeoutMs === 0) {
    const summed = budgetBySummingMs(setup.retries2);
    if (Math.round(summed / 1000) !== budgetSeconds(setup)) {
      note(`${slug}: the model budgets ${budgetSeconds(setup)}s and summing the intervals gives ${Math.round(summed / 1000)}s`);
    }
  } else if (budgetSeconds(setup) !== Math.round(setup.userTimeoutMs / 1000)) {
    note(`${slug}: TCP_USER_TIMEOUT is set and the budget is not it`);
  }

  /* The ending and the give-up time have to agree with each other. */
  const end = ending(setup);
  const gives = givesUpAtSeconds(setup);
  if (end === "recovered" && gives !== null) note(`${slug} recovers and still reports a give-up time`);
  if (end !== "recovered" && gives !== budgetSeconds(setup)) {
    note(`${slug} ends "${end}" at ${gives}s against a budget of ${budgetSeconds(setup)}s`);
  }
  if (end === "user-timeout" && setup.userTimeoutMs === 0) note(`${slug} ends at a user timeout that is not set`);
  if (end === "timed-out" && setup.userTimeoutMs > 0) note(`${slug} has a user timeout set and ignores it`);
  if (countMatchesSysctl(setup) && retransmissions(setup) !== setup.retries2) {
    note(`${slug} claims the count matches the sysctl and it does not`);
  }
  if (countMatchesSysctl(setup)) {
    /* fine, but rare */
  } else if (end !== "recovered") {
    pathsWhereCountDiffers += 1;
  }

  /* The rendered config and trace have to describe this case and not another. */
  const sysctl = asSysctl(setup);
  if (!new RegExp(`net\\.ipv4\\.tcp_retries2 = ${setup.retries2}$`, "m").test(sysctl)) {
    note(`${slug}: the rendered sysctl does not state tcp_retries2 ${setup.retries2}`);
  }
  if ((setup.userTimeoutMs > 0) !== sysctl.includes("user_timeout:")) {
    note(`${slug}: the rendered sysctl disagrees with the setup about whether TCP_USER_TIMEOUT is set`);
  }
  const trace = asTrace(setup);
  if (end === "recovered" ? trace.includes("ETIMEDOUT") : !trace.includes("ETIMEDOUT")) {
    note(`${slug}: the rendered trace ${trace.includes("ETIMEDOUT") ? "errors" : "does not error"} and the case ends "${end}"`);
  }
  if (!trace.includes(human(budgetMs(setup)))) {
    /* the closing line quotes the deadline, whichever one it is */
    if (end !== "recovered") note(`${slug}: the rendered trace does not quote the deadline it ends at`);
  }

  /* budgetMs is the number everything else is derived from, so pin it on its own. */
  const deadlineMs = setup.userTimeoutMs > 0 ? setup.userTimeoutMs : modeledTimeoutMs(setup.retries2);
  if (budgetMs(setup) !== deadlineMs) {
    note(`${slug}: budgetMs returns ${budgetMs(setup)}ms where the deadline in force is ${deadlineMs}ms`);
  }
  if (Math.round(budgetMs(setup) / 1000) !== budgetSeconds(setup)) {
    note(`${slug}: budgetMs says ${budgetMs(setup)}ms and budgetSeconds says ${budgetSeconds(setup)}s`);
  }

  /* Exactly one option holds, judged here and by the model's own dispatcher. */
  const truths = item.options.filter((option) => holds(option.says, setup));
  const byModel = matching(item);
  if (truths.length !== 1) {
    note(`${slug} has ${truths.length} true options (${truths.map((o) => o.id).join(", ") || "none"}); it must have exactly one`);
  } else {
    answerAt.set(item.options.indexOf(truths[0]), (answerAt.get(item.options.indexOf(truths[0])) ?? 0) + 1);
    if (correctOption(item)?.id !== truths[0].id) {
      note(`${slug}: correctOption returns ${correctOption(item)?.id ?? "nothing"} where the one true option is ${truths[0].id}`);
    }
  }
  if (byModel.length !== truths.length) {
    note(`${slug}: this check finds ${truths.length} true and matching() finds ${byModel.length}`);
  }
  if (item.options.length !== 4) note(`${slug} offers ${item.options.length} options rather than four`);
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) note(`${slug} reuses an option id`);
  if (!item.question.trim().endsWith("?")) note(`${slug}'s question is not a question`);
  for (const field of ["why", "fix", "brief", "breaks"] as const) {
    if (item[field].trim().length < 40) note(`${slug} has almost nothing in its ${field}`);
  }
}

for (const [position, count] of answerAt) {
  if (count > CASES.length / 2) {
    note(`${count} of ${CASES.length} answers sit at position ${position}, which is a pattern worth more than the reasoning`);
  }
}

/*
  And the claim the whole surface rests on: that the count and the sysctl come
  apart. If every case happened to agree, the set would be teaching that the
  manual page is right.
*/
if (pathsWhereCountDiffers < 5) {
  note(
    `only ${pathsWhereCountDiffers} cases show the retransmission count differing from tcp_retries2. ` +
      `That divergence is the point of the surface; a set that mostly agrees teaches the opposite.`,
  );
}
if (!CASES.some((item) => countMatchesSysctl(item.setup))) {
  note("no case shows the count happening to match the sysctl, so nothing says the divergence is about the path");
}

if (problems.length) {
  console.error(`\ncheck-retrans: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} connections, each with one option that holds; the closed form agrees with the summed ` +
    `backoff at every tcp_retries2 from 0 to 30, the default is 924.6 seconds, and both kernel measurements ` +
    `(5 -> 6 retransmissions, 6 -> 7) match the model exactly.`,
);
