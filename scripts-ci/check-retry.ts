/**
 * The arithmetic has to be right, and there must be no answer key.
 *
 * The design of the data is the main safeguard here and it is worth stating.
 * No chain declares which option is correct. Each declares which quantity is
 * being asked for, the model computes it, and the correct option is the one
 * whose value matches. So the check below is not "does the declared answer
 * agree with the model" but "does exactly one option agree with the model",
 * which is stronger: it catches a case whose prose and arithmetic have
 * drifted, and it catches two options that are accidentally both right. Both
 * happened while these were being written, and the second one is the sort of
 * thing that survives review forever, because reading four plausible options
 * does not tell you that two of them evaluate to the same number.
 *
 * Then the model is checked against the rules rather than against the chains,
 * over generated inputs, with the generated corpus measured first. That
 * discipline came from finding a property test on a neighbouring surface that
 * had been passing for an hour against four thousand degenerate inputs.
 */

import { readFileSync } from "node:fs";
import {
  CHAINS,
  abandoning,
  amplification,
  answerTime,
  canonical,
  correctOption,
  delays,
  elapsed,
  healthy,
  ms,
  needsAtLeast,
  orphaned,
  requestsAt,
  synchronised,
  truncatingCaller,
  unsafeRetries,
  type Ask,
  type Caller,
  type Chain,
} from "../client/src/lib/retry/index";

const problems: string[] = [];
const ASK_KINDS: Ask["kind"][] = ["amplification", "requests-at", "elapsed", "truncates", "orphaned"];

/* -------------------------------------------------------------- the chains */

const slugs = new Set<string>();
const breaks = new Set<string>();
const asks = new Set<string>();
const positions = new Map<number, number>();

for (const chain of CHAINS) {
  const where = chain.slug;
  if (slugs.has(chain.slug)) problems.push(`${where}: two chains share this slug`);
  slugs.add(chain.slug);
  asks.add(chain.ask.kind);

  if (breaks.has(chain.breaks)) {
    problems.push(`${where}: breaks a belief another chain already breaks. Eight chains teaching one thing is one chain.`);
  }
  breaks.add(chain.breaks);
  if (chain.breaks.length < 50) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (chain.why.length < 250) problems.push(`${where}: the explanation is too short to explain the arithmetic`);
  if (chain.brief.length < 120) problems.push(`${where}: the brief does not set up a situation`);
  if (!chain.question.trim().endsWith("?") && !/milliseconds\.$/.test(chain.question)) {
    problems.push(`${where}: the question does not read as a question`);
  }

  if (chain.callers.length < 1) problems.push(`${where}: a chain needs at least one caller`);
  for (const caller of chain.callers) {
    const at = `${where}/${caller.name}`;
    if (!Number.isInteger(caller.attempts) || caller.attempts < 1) {
      problems.push(`${at}: ${caller.attempts} attempts. One means no retry; there is no zero.`);
    }
    if (caller.timeout <= 0) problems.push(`${at}: a timeout of ${caller.timeout} is not a timeout`);
    if (caller.factor < 1) problems.push(`${at}: a backoff factor below 1 shortens each wait, which nothing does`);
    if (caller.jitter < 0 || caller.jitter > 1) problems.push(`${at}: jitter is a fraction of the delay`);
    if (caller.attempts > 1 && caller.backoff === 0 && caller.factor > 1) {
      problems.push(`${at}: a zero base delay with a multiplier stays zero, so the backoff does nothing`);
    }
    if (delays(caller).length !== caller.attempts - 1) {
      problems.push(`${at}: ${delays(caller).length} delays for ${caller.attempts} attempts; the last attempt is not followed by a wait`);
    }
  }
  if (chain.leaf.latency <= 0) problems.push(`${where}: the dependency has to take some time to answer`);

  /* ---- the options, and the one check this file exists for ---- */

  const ids = new Set(chain.options.map((option) => option.id));
  if (chain.options.length !== 4) problems.push(`${where}: ${chain.options.length} options rather than four`);
  if (ids.size !== chain.options.length) problems.push(`${where}: two options share an id`);

  const values = chain.options.map((option) => option.value);
  if (new Set(values).size !== values.length) {
    problems.push(`${where}: two options carry the same value, so they are the same answer written twice`);
  }
  for (const option of chain.options) {
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
    if (!option.claim.includes(option.value) && !/^(none|[a-z ]+)$/.test(option.value)) {
      /* A numeric value has to appear in the prose, or the reader and the checker are reading different things. */
      const spelled = Number(option.value);
      if (Number.isFinite(spelled) && !new RegExp(`\\b${option.value}\\b`).test(option.claim.replace(/,/g, ""))) {
        problems.push(`${where}: option ${option.id} claims "${option.claim.slice(0, 40)}" and carries the value ${option.value}, which the prose does not say`);
      }
    }
  }

  const truth = canonical(chain);
  const matching = chain.options.filter((option) => option.value === truth);
  if (matching.length === 0) {
    problems.push(
      `${where}: the model computes ${truth} for a ${chain.ask.kind} question and no option says that. One of the two is wrong and it is not the model.`,
    );
    continue;
  }
  if (matching.length > 1) {
    problems.push(`${where}: ${matching.length} options match the computed answer ${truth}`);
  }
  const position = chain.options.findIndex((option) => option.value === truth);
  positions.set(position, (positions.get(position) ?? 0) + 1);

  /* correctOption() has to agree, since the page uses it to mark the answer. */
  if (correctOption(chain)?.value !== truth) {
    problems.push(`${where}: correctOption() disagrees with canonical(), so the page would mark the wrong option`);
  }
}

if (CHAINS.length < 6) problems.push(`${CHAINS.length} chains is too few to cover the failure modes`);

for (const kind of ASK_KINDS) {
  if (!asks.has(kind)) problems.push(`no chain asks a "${kind}" question, so that part of the model is never exercised`);
}
for (const [position, count] of positions) {
  if (count > CHAINS.length * 0.45) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${CHAINS.length} chains`);
  }
}

/*
  And the set has to demonstrate the things it is about. A page of eight
  chains where nothing amplifies badly, nothing truncates, and nothing is
  correctly configured teaches none of the three.
*/
if (!CHAINS.some((chain) => amplification(chain) >= 27)) {
  problems.push("no chain amplifies to 27 or more, so the multiplication never gets alarming");
}
if (!CHAINS.some((chain) => truncatingCaller(chain))) {
  problems.push("no chain has a caller whose budget is smaller than its callee's");
}
if (!CHAINS.some((chain) => !truncatingCaller(chain) && orphaned(chain) === 0)) {
  problems.push("no chain is correctly configured, so a reader has no control to recognize");
}
if (!CHAINS.some((chain) => orphaned(chain) > 0)) problems.push("no chain orphans any work");
if (!CHAINS.some((chain) => unsafeRetries(chain).length > 0)) {
  problems.push("no chain retries something that is not safe to repeat, which is the one this cannot be budgeted out of");
}
if (!CHAINS.some((chain) => synchronised(chain).length > 0)) {
  problems.push("no chain backs off without jitter, so the herd is described and never shown");
}

/* -------------------------------------------- the model, against the rules */

let seed = 0x9e3779b9;
const next = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed;
};
const pick = <T,>(list: T[]): T => list[next() % list.length];
const between = (low: number, high: number) => low + (next() % (high - low + 1));

function randomChain(): Chain {
  const depth = 1 + (next() % 4);
  const callers: Caller[] = [];
  for (let index = 0; index < depth; index += 1) {
    callers.push({
      name: `layer${index}`,
      attempts: 1 + (next() % 4),
      timeout: between(1, 40) * 250,
      backoff: pick([0, 50, 100, 250, 500]),
      factor: pick([1, 1, 2, 3]),
      jitter: pick([0, 0, 0.1, 0.3]),
      idempotent: next() % 2 === 0,
    });
  }
  return {
    slug: "generated",
    name: "generated",
    brief: "",
    callers,
    /*
      A distinctive name, because a generator that calls every dependency
      "leaf" cannot fail a property about preserving the name. A blinding that
      made healthy() rewrite it passed 6,000 rounds for exactly that reason.
    */
    leaf: { name: `dep-${next() % 10000}`, latency: between(1, 40) * 250 },
    ask: { kind: "amplification" },
    question: "",
    options: [],
    why: "",
    breaks: "",
  };
}

const ROUNDS = 6000;
const failures: string[] = [];
const note = (message: string) => {
  if (!failures.includes(message)) failures.push(message);
};

/* What the corpus contained, so the properties are not passing on nothing. */
let withTruncation = 0;
let withoutTruncation = 0;
let withOrphans = 0;
let multiLayer = 0;
let amplified = 0;

for (let round = 0; round < ROUNDS; round += 1) {
  const chain = randomChain();
  const depth = chain.callers.length;

  if (truncatingCaller(chain)) withTruncation += 1;
  else withoutTruncation += 1;
  if (orphaned(chain) > 0) withOrphans += 1;
  if (depth > 1) multiLayer += 1;
  if (amplification(chain) >= 8) amplified += 1;

  /*
    Rule: amplification is the product of the attempt counts. Recomputed here
    rather than called, so a bug in requestsAt shows up as a disagreement
    instead of being confirmed by the function that shares its assumption.
  */
  const product = chain.callers.reduce((total, caller) => total * caller.attempts, 1);
  if (amplification(chain) !== product) {
    note(`amplification is ${amplification(chain)} where the product of attempts is ${product}`);
  }
  if (requestsAt(chain, 0) !== 1) note("the top of the chain sees more than the one action that started it");
  if (requestsAt(chain, depth) !== amplification(chain)) {
    note("requestsAt at full depth disagrees with amplification");
  }

  /*
    Rule: retries multiply, so taking one layer down to a single attempt
    divides the whole product by that layer's old attempt count. This is the
    claim the surface is built on and the one an additive implementation
    fails.
  */
  const target = next() % depth;
  const was = chain.callers[target].attempts;
  const single: Chain = {
    ...chain,
    callers: chain.callers.map((caller, index) => (index === target ? { ...caller, attempts: 1 } : caller)),
  };
  if (amplification(single) * was !== amplification(chain)) {
    note(`setting one layer to a single attempt did not divide the product by its ${was} attempts`);
  }

  /* Rule: more attempts anywhere never makes the user wait less. */
  const more: Chain = {
    ...chain,
    callers: chain.callers.map((caller, index) =>
      index === target ? { ...caller, attempts: caller.attempts + 1 } : caller,
    ),
  };
  if (elapsed(more) < elapsed(chain)) note("adding an attempt made the whole call faster");

  /* Rule: a slower dependency never makes the user wait less. */
  const slower: Chain = { ...chain, leaf: { ...chain.leaf, latency: chain.leaf.latency + 250 } };
  if (elapsed(slower) < elapsed(chain)) note("a slower dependency made the whole call faster");

  /*
    Rule: the innermost layer is never the truncating one. It has no callee
    with a policy of its own, so giving up on a slow dependency is a timeout
    working rather than a budget that is too small. The first version of the
    model got this wrong and blamed the driver on every chain with a slow
    database, which is the one timeout that was correct.
  */
  const truncates = truncatingCaller(chain);
  if (truncates && truncates === chain.callers[depth - 1]) {
    note("the innermost layer was named as the one whose budget is too small");
  }

  /* Rule: nothing is orphaned exactly when no layer gives up on live work. */
  if ((orphaned(chain) > 0) !== (abandoning(chain).length > 0)) {
    note("orphaned work and abandoning callers disagree");
  }

  /*
    needsAtLeast() is the timeout a layer would need for the one below it to
    finish first, which is the number the page tells a reader to go and set.
    So it has to be exactly the point where truncation stops: at that timeout
    the layer no longer abandons its callee, and one millisecond under it
    still does.
  */
  for (let index = 0; index < depth; index += 1) {
    const need = needsAtLeast(chain, index);
    const generous: Chain = {
      ...chain,
      callers: chain.callers.map((caller, at) => (at === index ? { ...caller, timeout: need } : caller)),
    };
    if (abandoning(generous).includes(generous.callers[index])) {
      note(`a layer given needsAtLeast(${index}) still abandoned its callee`);
    }
    if (need > 1) {
      const mean: Chain = {
        ...chain,
        callers: chain.callers.map((caller, at) => (at === index ? { ...caller, timeout: need - 1 } : caller)),
      };
      if (!abandoning(mean).includes(mean.callers[index])) {
        note(`a layer one millisecond under needsAtLeast(${index}) did not abandon anything`);
      }
    }
  }

  /*
    healthy() replaces a leaf's latency and nothing else, which is what makes
    it usable as a control: the chain it returns has to differ in exactly that
    one number.
  */
  {
    const quick = healthy(chain.leaf, 1);
    if (quick.latency !== 1) note("healthy() did not set the latency it was given");
    if (quick.name !== chain.leaf.name) note("healthy() changed the leaf's name");
    if (healthy(chain.leaf, chain.leaf.latency).latency !== chain.leaf.latency) {
      note("healthy() with the existing latency changed it");
    }
  }

  /* Rule: a layer's answer time is at least its attempts times what it waits for. */
  for (let index = 0; index < depth; index += 1) {
    const caller = chain.callers[index];
    const floor = caller.attempts * Math.min(caller.timeout, answerTime(chain, index + 1));
    if (answerTime(chain, index) < floor) {
      note(`a layer answered faster than its own attempts allow at depth ${index}`);
    }
  }
}

for (const failure of failures) problems.push(`the model breaks its own rule: ${failure}`);

/*
  The corpus check. A property that never met an input able to fail it is a
  comment, and this section had exactly that problem on a sibling surface.
*/
if (withTruncation < ROUNDS / 20) problems.push(`only ${withTruncation} of ${ROUNDS} generated chains truncate`);
if (withoutTruncation < ROUNDS / 20) problems.push(`only ${withoutTruncation} of ${ROUNDS} generated chains are cleanly budgeted`);
if (withOrphans < ROUNDS / 20) problems.push(`only ${withOrphans} of ${ROUNDS} generated chains orphan work`);
if (multiLayer < ROUNDS / 2) problems.push(`only ${multiLayer} of ${ROUNDS} generated chains have more than one layer, so multiplication is barely tested`);
if (amplified < ROUNDS / 10) problems.push(`only ${amplified} of ${ROUNDS} generated chains amplify to 8 or more`);

/*
  ms() renders a duration, and a reader believes what it renders.

  Table-driven at the boundary rather than by property, because the boundary
  is the whole behavior: under a second it reads in milliseconds, at or over
  it reads in seconds, and a whole number of seconds drops the decimal. A
  formatter that lies still lies to a reader.
*/
for (const [value, want] of [
  [0, "0ms"],
  [1, "1ms"],
  [999, "999ms"],
  [1000, "1s"],
  [1500, "1.5s"],
  [2000, "2s"],
  [4600, "4.6s"],
  [60000, "60s"],
] as [number, string][]) {
  if (ms(value) !== want) problems.push(`ms(${value}) reads "${ms(value)}" rather than "${want}"`);
}
/* And it has to be monotonic, or a longer wait can print as a shorter one. */
{
  let previous = -1;
  for (const value of [0, 1, 250, 999, 1000, 1001, 1500, 2000, 5000, 30000]) {
    const shown = ms(value);
    const parsed = shown.endsWith("ms") ? Number(shown.slice(0, -2)) : Number(shown.slice(0, -1)) * 1000;
    if (parsed < previous) problems.push(`ms() is not monotonic: ${value} reads "${shown}"`);
    previous = parsed;
  }
}

/* A hand-worked example, so the recursion is pinned to a number I can check on paper. */
{
  const worked: Chain = {
    ...randomChain(),
    callers: [
      { name: "outer", attempts: 2, timeout: 10000, backoff: 1000, factor: 1, jitter: 0, idempotent: true },
      { name: "inner", attempts: 3, timeout: 500, backoff: 100, factor: 2, jitter: 0, idempotent: true },
    ],
    leaf: { name: "slow", latency: 5000 },
  };
  /*
    inner: three attempts of 500 (its timeout, since the leaf is slower) plus
    waits of 100 and 200, so 1800. outer: two attempts of 1800 (under its
    10000 timeout) plus one wait of 1000, so 4600. Six requests reach the leaf.
  */
  if (answerTime(worked, 1) !== 1800) problems.push(`the worked inner layer came to ${answerTime(worked, 1)} rather than 1800`);
  if (elapsed(worked) !== 4600) problems.push(`the worked example came to ${elapsed(worked)} rather than 4600`);
  if (amplification(worked) !== 6) problems.push(`the worked example amplifies to ${amplification(worked)} rather than 6`);
  if (truncatingCaller(worked)) problems.push("the worked example should have no layer whose budget is too small");
  if (orphaned(worked) !== 6) problems.push(`the worked example orphans ${orphaned(worked)} rather than 6`);
}

/* --------------------------------------------------------------- the page */

const page = readFileSync("client/src/pages/cinematic/CinematicRetry.tsx", "utf8");
for (const [pattern, complaint] of [
  [/correctOption\(/, "does not ask the model which option is right, so it carries an answer key of its own"],
  [/amplification\(/, "does not show the amplification factor, which is the number nobody writes down"],
  [/requestsAt\(/, "does not show the fan-out per layer"],
  [/elapsed\(|answerTime\(/, "does not show what the user waits"],
  [/truncatingCaller\(/, "does not name the layer whose budget is too small"],
  [/recordSolvedRetry\(/, "does not record progress, so the surface forgets on reload"],
  [/<ReadAboutThis\s/, "does not link the articles behind it"],
] as [RegExp, string][]) {
  if (!pattern.test(page)) problems.push(`the page ${complaint}`);
}

if (problems.length) {
  console.error(`\ncheck-retry: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CHAINS.length} chains across ${asks.size} question kinds, each with exactly one option matching the model, ` +
    `${breaks.size} distinct beliefs broken, worst amplification ${Math.max(...CHAINS.map(amplification))}, ` +
    `and the model held its own rules over ${ROUNDS} generated chains (${withTruncation} truncating, ${withoutTruncation} clean).`,
);
