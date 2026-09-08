/**
 * The interval algebra has to agree with counting, and no case may carry an
 * answer key.
 *
 * The model works out which clock offsets are consistent with a set of
 * observations by intersecting intervals and subtracting them. That is the
 * right way to do it and it is also the sort of thing that is nearly right:
 * an off-by-one on the complement of a closed interval puts the boundary
 * second in both the passing and the failing set, and a case then has two
 * correct answers that nobody notices because both look plausible in prose.
 *
 * So everything is computed twice. The model does interval arithmetic. This
 * file walks every second in the fortnight either side of correct, asks the
 * rules directly whether that offset explains the observations, and stitches
 * the answers into spans. The two have to match exactly, on every case and on
 * generated ones. Brute force is slow and stupid and cannot be subtly wrong.
 */

import { readFileSync } from "node:fs";
import {
  CASES,
  HORIZON,
  consistent,
  correctOption,
  explains,
  narrowed,
  passing,
  readable,
  satisfies,
  spanText,
  width,
  type Check,
  type Rule,
  type Span,
} from "../client/src/lib/clock/index";

const problems: string[] = [];

/**
 * The consistent set, found by asking about every second.
 *
 * The independent implementation. It shares nothing with the model except the
 * rules themselves, so an error in the interval algebra shows up as a
 * disagreement rather than being confirmed by a second function that made the
 * same assumption.
 */
function bruteForce(checks: Check[]): Span[] {
  const spans: Span[] = [];
  let start: number | null = null;
  for (let offset = -HORIZON; offset <= HORIZON; offset += 1) {
    if (explains(checks, offset)) {
      if (start === null) start = offset;
    } else if (start !== null) {
      spans.push({ from: start, to: offset - 1 });
      start = null;
    }
  }
  if (start !== null) spans.push({ from: start, to: HORIZON });
  return spans;
}

const same = (a: Span[], b: Span[]) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------- the cases */

const slugs = new Set<string>();
const breaks = new Set<string>();
const positions = new Map<number, number>();
const kinds = new Set<Rule["kind"]>();
let works = 0;
let fails = 0;

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) problems.push(`${where}: two cases share this slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) {
    problems.push(`${where}: breaks a belief another case already breaks. Eight cases teaching one thing is one case.`);
  }
  breaks.add(item.breaks);
  if (item.breaks.length < 45) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (item.why.length < 300) problems.push(`${where}: the explanation is too short to work through the bounds`);
  if (item.brief.length < 120) problems.push(`${where}: the brief does not set up a situation`);
  if (!item.question.trim().endsWith("?")) problems.push(`${where}: the question does not read as a question`);
  if (item.checks.length < 2) problems.push(`${where}: one observation cannot bound anything from both sides`);

  for (const check of item.checks) {
    kinds.add(check.rule.kind);
    if (check.observed === "works") works += 1;
    else fails += 1;
    if (check.message.length < 10) problems.push(`${where}: a check has no error text, and the text is the point`);
    if (check.label.length < 15) problems.push(`${where}: a check's label says too little`);
    const span = passing(check.rule);
    if (span.from > span.to) problems.push(`${where}: "${check.label}" can never pass`);
    if (check.rule.kind === "mutual" && check.rule.tolerance <= 0) {
      problems.push(`${where}: "${check.label}" is a mutual comparison with no tolerance, which is a window`);
    }
  }

  /* The two implementations have to agree, which is the reason this file exists. */
  const byAlgebra = consistent(item.checks);
  const byCounting = bruteForce(item.checks);
  if (!same(byAlgebra, byCounting)) {
    problems.push(
      `${where}: the interval algebra says ${JSON.stringify(byAlgebra)} and counting every second says ${JSON.stringify(byCounting)}`,
    );
  }

  if (byCounting.length === 0) {
    problems.push(`${where}: no clock explains these observations, so the case contradicts itself`);
    continue;
  }
  const span = narrowed(item.checks);
  if (!span) {
    problems.push(
      `${where}: the observations allow ${byCounting.length} separate ranges, so there is no single answer. Add a check that bounds one side.`,
    );
    continue;
  }

  /*
    An answer has to be a diagnosis. A fortnight wide says nothing, and a
    single second is a puzzle rather than an exercise in reading symptoms.
  */
  if (width(span) < 5) problems.push(`${where}: the answer is ${width(span)} seconds wide, which is a puzzle`);
  if (width(span) > 20 * 86400) problems.push(`${where}: the answer is ${width(span)} seconds wide, which is not a diagnosis`);

  const ids = new Set(item.options.map((option) => option.id));
  if (item.options.length !== 4) problems.push(`${where}: ${item.options.length} options rather than four`);
  if (ids.size !== item.options.length) problems.push(`${where}: two options share an id`);
  const ranges = item.options.map((option) => `${option.from}:${option.to}`);
  if (new Set(ranges).size !== ranges.length) {
    problems.push(`${where}: two options claim the same range, so they are the same answer written twice`);
  }
  for (const option of item.options) {
    if (option.from > option.to) problems.push(`${where}: option ${option.id} runs backwards`);
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
  }

  const matching = item.options.filter((option) => option.from === span.from && option.to === span.to);
  if (matching.length === 0) {
    problems.push(
      `${where}: the observations allow ${spanText(span)} (${span.from} to ${span.to}) and no option claims that range.`,
    );
    continue;
  }
  if (matching.length > 1) problems.push(`${where}: ${matching.length} options claim the answer's range`);
  if (correctOption(item)?.id !== matching[0].id) {
    problems.push(`${where}: correctOption() disagrees, so the page would mark the wrong option`);
  }
  const position = item.options.findIndex((option) => option.from === span.from && option.to === span.to);
  positions.set(position, (positions.get(position) ?? 0) + 1);
}

if (CASES.length < 6) problems.push(`${CASES.length} cases is too few`);
for (const [position, count] of positions) {
  if (count > CASES.length * 0.45) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${CASES.length} cases`);
  }
}
for (const kind of ["mutual", "window"] as Rule["kind"][]) {
  if (!kinds.has(kind)) problems.push(`no case uses a "${kind}" rule, so half the model is never exercised`);
}
if (works < 4) problems.push(`only ${works} observations across the set are of something working`);
if (fails < 4) problems.push(`only ${fails} observations across the set are of something failing`);

/*
  The set has to show the range of tolerances, because the ordering of them is
  the thing that makes this diagnosable at all. A page where every answer is
  minutes teaches that skew is always minutes.
*/
const widths = CASES.map((item) => width(narrowed(item.checks) ?? { from: 0, to: 0 }));
if (!widths.some((w) => w < 300)) problems.push("no case narrows to under five minutes");
if (!widths.some((w) => w > 86400)) problems.push("no case is a matter of days, so the wide skews are never shown");

/* A peer that is itself wrong, which is the case people never think of. */
if (!CASES.some((item) => item.checks.some((c) => c.rule.kind === "mutual" && c.rule.peerOffset !== 0))) {
  problems.push("no case has a tolerant peer whose own clock is wrong, so the report-from-the-wrong-host case is missing");
}
/* And a case where the clock is correct, so the answer is not always a fault. */
if (!CASES.some((item) => { const s = narrowed(item.checks); return s !== null && s.from <= 0 && s.to >= 0; })) {
  problems.push("no case allows a correct clock, so a reader learns the answer is always skew");
}

/* -------------------------------------- the model, against the rules */

let seed = 0x71303;
const next = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed;
};
const pick = <T,>(list: T[]): T => list[next() % list.length];

const TOLERANCES = [30, 60, 300, 900];
const EDGES = [-86400, -3600, -300, -90, -20, 0, 20, 300, 3600, 86400];

function randomChecks(): Check[] {
  const count = 1 + (next() % 4);
  const checks: Check[] = [];
  for (let i = 0; i < count; i += 1) {
    const mutual = next() % 2 === 0;
    const rule: Rule = mutual
      ? { kind: "mutual", peer: "peer", peerOffset: pick(EDGES), tolerance: pick(TOLERANCES) }
      : (() => {
          const a = pick(EDGES);
          const b = pick(EDGES);
          return { kind: "window", from: Math.min(a, b), to: Math.max(a, b) } as Rule;
        })();
    checks.push({
      label: "generated check",
      rule,
      observed: next() % 2 === 0 ? "works" : "fails",
      message: "generated",
    });
  }
  return checks;
}

/*
  Fewer rounds than the other property suites, because each one walks 2.4
  million offsets. A thousand cases is 2.4 billion evaluations and takes about
  a minute, which is the price of having the answer checked by something that
  cannot be subtly wrong.
*/
const ROUNDS = 400;
const failures: string[] = [];
const note = (message: string) => {
  if (!failures.includes(message)) failures.push(message);
};

let empty = 0;
let single = 0;
let several = 0;

for (let round = 0; round < ROUNDS; round += 1) {
  const checks = randomChecks();
  const byAlgebra = consistent(checks);
  const byCounting = bruteForce(checks);
  if (!same(byAlgebra, byCounting)) {
    note(`algebra and counting disagree: ${JSON.stringify(byAlgebra)} against ${JSON.stringify(byCounting)}`);
  }
  if (byCounting.length === 0) empty += 1;
  else if (byCounting.length === 1) single += 1;
  else several += 1;

  /* Rule: every offset in a returned span has to explain the observations. */
  for (const span of byAlgebra) {
    for (const offset of [span.from, span.to, Math.floor((span.from + span.to) / 2)]) {
      if (!explains(checks, offset)) note("a returned span contains an offset that does not explain the observations");
    }
    /* And the seconds just outside must not, or the span is too wide. */
    for (const offset of [span.from - 1, span.to + 1]) {
      if (offset >= -HORIZON && offset <= HORIZON && explains(checks, offset)) {
        note("a span stops one second early, so its boundary is wrong");
      }
    }
  }

  /* Rule: a rule passes exactly inside its own interval. */
  for (const check of checks) {
    const span = passing(check.rule);
    for (const [offset, want] of [
      [span.from, true],
      [span.to, true],
      [span.from - 1, false],
      [span.to + 1, false],
    ] as [number, boolean][]) {
      if (satisfies(check.rule, offset) !== want) note("a rule's boundary is off by one second");
    }
  }
}

for (const failure of failures) problems.push(`the model breaks its own rule: ${failure}`);
if (single < ROUNDS / 20) problems.push(`only ${single} of ${ROUNDS} generated observation sets narrowed to one range`);
if (several < ROUNDS / 20) problems.push(`only ${several} of ${ROUNDS} generated sets allowed several ranges`);
if (empty < ROUNDS / 50) problems.push(`only ${empty} of ${ROUNDS} generated sets were contradictory, so that path is barely tested`);

/* Direction is half the diagnosis, so the wording has to carry it. */
if (!readable(-90).includes("slow")) problems.push(`readable(-90) is "${readable(-90)}" and does not say slow`);
if (!readable(90).includes("fast")) problems.push(`readable(90) is "${readable(90)}" and does not say fast`);
if (readable(0) !== "correct") problems.push(`readable(0) is "${readable(0)}"`);

/* ---------------------------------------------------------- the page */

const page = readFileSync("client/src/pages/cinematic/CinematicClock.tsx", "utf8");
for (const [pattern, complaint] of [
  [/correctOption\(/, "does not ask the model which option is right, so it carries an answer key of its own"],
  [/consistent\(/, "does not compute the consistent range"],
  [/passing\(/, "does not show each observation's own interval, which is the working"],
  [/check\.message/, "does not show the error the operator actually saw, which is the whole subject"],
  [/spanText\(|readable\(/, "does not put the answer into words, so it reads as two numbers"],
  [/recordSolvedClock\(/, "does not record progress, so the surface forgets on reload"],
  [/<ReadAboutThis\s/, "does not link the articles behind it"],
] as [RegExp, string][]) {
  if (!pattern.test(page)) problems.push(`the page ${complaint}`);
}

if (problems.length) {
  console.error(`\ncheck-clock: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cases, each narrowing to one range that exactly one option claims, ${breaks.size} distinct ` +
    `beliefs broken, and the interval algebra agreed with counting every second over ${ROUNDS} generated sets ` +
    `(${single} single, ${several} several, ${empty} contradictory).`,
);
