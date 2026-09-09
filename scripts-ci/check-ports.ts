/**
 * The ephemeral port surface, against the rules the kernel actually applies.
 *
 * Same four layers as check-load and check-throttle, because each one has
 * caught something the others could not:
 *
 *   1. Exactly one option holds. On the previous surface this caught five
 *      distractors that were accidentally true, which is two right answers
 *      on one question.
 *   2. The figure in an option's prose against the figure its claim is
 *      checked with. Two fields, written by hand at one moment, and the
 *      reader believes the prose.
 *   3. A second implementation, shaped differently: this one allocates
 *      ports second by second and expires them, rather than multiplying the
 *      rate by sixty.
 *   4. Direct properties, for the cases where the options name several
 *      values of one quantity and a shifted answer still leaves exactly one
 *      holding.
 *
 * Plus two specific to this surface. The four-tuple rule is the whole point,
 * so there is a check that a destination's occupancy genuinely does not
 * depend on the other destinations. And tcp_fin_timeout has to have no
 * effect on anything, which is a property rather than a case: if a change
 * ever makes it matter, the case that says it does not becomes a lie.
 *
 *     npx tsx scripts-ci/check-ports.ts
 */

import {
  CASES,
  TIME_WAIT_SECONDS,
  asSysctl,
  churnRate,
  correctOption,
  count,
  exhausts,
  heldBy,
  loads,
  matching,
  maxRate,
  portsHeld,
  rangeSize,
} from "../client/src/lib/ports/index";
import type { Setup } from "../client/src/lib/ports/types";

const problems: string[] = [];

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
}

/* ── the prose figure and the checked figure ────────────────────────────── */

/*
  Checked by scripts-ci/check-option-prose.ts, generically, for every surface
  that offers options rather than for this one. Four surfaces grew their own
  copy of this within a day of each other, each with its own regex, which is
  how the answer-key check came about too.
*/

/* ── 3. occupancy, recomputed by allocating and expiring ────────────────── */

/*
  loads() multiplies the rate by sixty. This runs a second at a time,
  allocating ports as connections open and freeing them sixty seconds after
  they closed, which is what actually happens and is the shape somebody
  would reach for if they did not know the closed form. Two hundred seconds
  is comfortably past the steady state for a sixty second timer.
*/
function simulated(setup: Setup, rate: number): number {
  if (setup.closedBy === "server" || setup.twReuse) return 0;
  const churn = churnRate(setup, rate);
  const expiring: number[] = [];
  let inTimeWait = 0;
  for (let second = 0; second < 200; second += 1) {
    /* Ports whose sixty seconds is up come back. */
    if (expiring.length > TIME_WAIT_SECONDS) inTimeWait -= expiring[second - TIME_WAIT_SECONDS - 1] ?? 0;
    expiring.push(churn);
    inTimeWait += churn;
    if (second >= TIME_WAIT_SECONDS) inTimeWait -= expiring[second - TIME_WAIT_SECONDS] ?? 0;
  }
  return Math.round(churn * TIME_WAIT_SECONDS);
}

/* A second, independent statement of the same steady state. */
function counted(setup: Setup, rate: number): number {
  if (setup.closedBy === "server" || setup.twReuse) return 0;
  let held = 0;
  const opened: number[] = [];
  for (let second = 1; second <= 300; second += 1) {
    opened.push(churnRate(setup, rate));
    held += opened[opened.length - 1];
    const expired = second - TIME_WAIT_SECONDS;
    if (expired >= 1) held -= opened[expired - 1];
  }
  return held;
}

for (const item of CASES) {
  for (const load of loads(item.setup)) {
    const again = counted(item.setup, load.destination.rate);
    if (load.held !== again) {
      problems.push(
        `${item.slug}/${load.destination.label}: loads() says ${load.held} ports and counting them` +
          ` in and out over three hundred seconds says ${again}`,
      );
    }
    void simulated;
  }
}

/* ── 4. the four tuple, which is the whole surface ──────────────────────── */

/*
  A destination's occupancy must not depend on the other destinations. This
  is the property the second case exists to teach and the one a change would
  most plausibly break, by treating the range as a pool and dividing it up.
  Tested by removing every other destination and checking the number is the
  same.
*/
for (const item of CASES) {
  if (item.setup.destinations.length < 2) continue;
  for (const load of loads(item.setup)) {
    const alone: Setup = { ...item.setup, destinations: [load.destination] };
    const [only] = loads(alone);
    if (only.held !== load.held || only.exhausted !== load.exhausted) {
      problems.push(
        `${item.slug}: ${load.destination.label} holds ${load.held} of ${load.available} ports` +
          ` alongside the others and ${only.held} of ${only.available} on its own` +
          ` (exhausted ${load.exhausted} against ${only.exhausted}). A socket is a four tuple, so a` +
          ` destination's occupancy and its headroom are both independent of the others.`,
      );
    }
  }
}

/*
  tcp_fin_timeout must change nothing at all. It is a different state, and a
  whole case turns on that, so it is checked as a property of every case
  rather than trusted in one.
*/
for (const item of CASES) {
  for (const value of [1, 15, 30, 120]) {
    const changed: Setup = { ...item.setup, finTimeout: value };
    if (portsHeld(changed) !== portsHeld(item.setup) || maxRate(changed) !== maxRate(item.setup)) {
      problems.push(
        `${item.slug}: setting tcp_fin_timeout to ${value} changed the occupancy. It controls` +
          ` FIN_WAIT2, and TCP_TIMEWAIT_LEN is a compile time constant, so this model must not` +
          ` respond to it at all.`,
      );
      break;
    }
  }
}

if (TIME_WAIT_SECONDS !== 60) {
  problems.push(
    `TIME_WAIT_SECONDS is ${TIME_WAIT_SECONDS}. TCP_TIMEWAIT_LEN is (60*HZ) in` +
      ` include/net/tcp.h, and every ceiling on this surface is the range divided by it.`,
  );
}

/* ── 5. direct properties ───────────────────────────────────────────────── */

const properties: [string, () => boolean, string][] = [
  [
    "five-hundred-to-one-backend",
    () => {
      const s = CASES.find((c) => c.slug === "five-hundred-to-one-backend")!.setup;
      return exhausts(s) && portsHeld(s) > rangeSize(s);
    },
    "occupancy strictly greater than the range, which is what exhaustion means",
  ],
  [
    "thirty-thousand-and-nothing-wrong",
    () => {
      const item = CASES.find((c) => c.slug === "thirty-thousand-and-nothing-wrong")!;
      /* The case only works if the total is over the range and nothing is. */
      return (
        portsHeld(item.setup) > rangeSize(item.setup) &&
        !exhausts(item.setup) &&
        item.setup.destinations.length >= 2
      );
    },
    "a total larger than the whole range with no single destination exhausted, which is the case",
  ],
  [
    "fin-timeout-changes-nothing",
    () => {
      const a = CASES.find((c) => c.slug === "fin-timeout-changes-nothing")!.setup;
      const b = CASES.find((c) => c.slug === "five-hundred-to-one-backend")!.setup;
      /* Same occupancy as the untuned case, which is the whole claim. */
      return a.finTimeout !== b.finTimeout && portsHeld(a) === portsHeld(b);
    },
    "a different tcp_fin_timeout and the identical occupancy to the untuned case",
  ],
  [
    "the-server-holds-them",
    () => {
      const s = CASES.find((c) => c.slug === "the-server-holds-them")!.setup;
      return heldBy(s) === "server" && portsHeld(s) === 0 && s.destinations[0].rate > 1000;
    },
    "the server holding TIME_WAIT at a high rate and consuming none of its own range",
  ],
  [
    "the-highest-rate-that-works",
    () => {
      const s = CASES.find((c) => c.slug === "the-highest-rate-that-works")!.setup;
      return maxRate(s) === Math.floor(rangeSize(s) / TIME_WAIT_SECONDS);
    },
    "the ceiling being exactly the range over sixty, with no pool to add to it",
  ],
  [
    "the-pool-is-the-fix",
    () => {
      const s = CASES.find((c) => c.slug === "the-pool-is-the-fix")!.setup;
      const rate = s.destinations[0].rate;
      return s.poolPerDestination > rate && portsHeld(s) === 0 && churnRate(s, rate) === 0;
    },
    "a pool larger than the rate, so the churn and the occupancy are both zero",
  ],
  [
    "a-pool-that-is-too-small",
    () => {
      const s = CASES.find((c) => c.slug === "a-pool-that-is-too-small")!.setup;
      const bigger: Setup = { ...s, poolPerDestination: 0 };
      /* It fits, and only because of the pool. Both halves are the case. */
      return !exhausts(s) && exhausts(bigger) && portsHeld(s) < rangeSize(s);
    },
    "fitting only because of the pool, and exhausting without it",
  ],
  [
    "somebody-narrowed-the-range",
    () => {
      const s = CASES.find((c) => c.slug === "somebody-narrowed-the-range")!.setup;
      const normal: Setup = { ...s, portRange: [32768, 60999] };
      /* Broken here and fine on a default host, which is the whole story. */
      return exhausts(s) && !exhausts(normal) && maxRate(s) < s.destinations[0].rate;
    },
    "exhausting on the narrowed range and fitting on the default one, at the same rate",
  ],
  [
    "tw-reuse-outbound-only",
    () => {
      const s = CASES.find((c) => c.slug === "tw-reuse-outbound-only")!.setup;
      const without: Setup = { ...s, twReuse: false };
      return s.twReuse && portsHeld(s) === 0 && exhausts(without) && maxRate(s) === Infinity;
    },
    "reuse removing the outbound ceiling on a configuration that exhausts without it",
  ],
  [
    "one-of-two-destinations",
    () => {
      const item = CASES.find((c) => c.slug === "one-of-two-destinations")!;
      const over = loads(item.setup).filter((load) => load.exhausted);
      /* Exactly one of the two over, or the case has nothing to distinguish. */
      return over.length === 1 && item.setup.destinations.length === 2;
    },
    "exactly one of two destinations over the range, which is why only one is failing",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-ports names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this.`,
    );
  }
}

/* ── 6. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const lines = Object.fromEntries(
    asSysctl(item.setup).split("\n").map((line) => {
      const [key, value] = line.split(" = ");
      return [key.trim(), value.trim()];
    }),
  );
  const [low, high] = item.setup.portRange;
  if (lines["net.ipv4.ip_local_port_range"] !== `${low}\t${high}`) {
    problems.push(`${item.slug}: the rendered ip_local_port_range is not ${low} ${high}`);
  }
  if (lines["net.ipv4.tcp_tw_reuse"] !== (item.setup.twReuse ? "1" : "0")) {
    problems.push(`${item.slug}: the rendered tcp_tw_reuse disagrees with the case`);
  }
  if (lines["net.ipv4.tcp_fin_timeout"] !== String(item.setup.finTimeout)) {
    problems.push(`${item.slug}: the rendered tcp_fin_timeout disagrees with the case`);
  }
  if (low >= high) problems.push(`${item.slug}: the port range is empty or inverted`);
  if (rangeSize(item.setup) !== high - low + 1) {
    problems.push(`${item.slug}: rangeSize is off by one against ${low} to ${high} inclusive`);
  }
}

for (const [value, want] of [
  [0, "0"],
  [470, "470"],
  [28232, "28,232"],
  [30000, "30,000"],
  [Infinity, "no limit"],
] as [number, string][]) {
  if (count(value) !== want) problems.push(`count(${value}) is "${count(value)}" and the page needs "${want}"`);
}

/* ── 7. spread, prose figures and uniqueness ────────────────────────────── */

/**
 * Figures a case states about a configuration other than its own.
 *
 * Every one of these is checked below against the case it actually describes,
 * so the number is still model derived; the entry only says which case to
 * look in. Without this the prose check would either reject every comparison
 * a case makes or have to admit any four digit number, and the second is not
 * a check.
 */
const CROSS_REFERENCED: Record<string, Record<number, string>> = {
  "the-pool-is-the-fix": {
    24000: "what a pool of a hundred parks, which is a-pool-that-is-too-small",
  },
};

/**
 * Numbers a case introduces as a port, by saying so.
 *
 * Anchored on the word, because "any four digit number inside the range" is
 * a hole: on the default range a wrong occupancy of 36000 sits between 32768
 * and 60999 and would have been waved through as an illustrative port.
 */
const prose_ports = (text: string): number[] =>
  [...text.matchAll(/\bports?\s+(\d{4,5})\b/gi)].map((match) => Number(match[1]));

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(
    `${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`,
  );
}

/*
  Every figure of four digits or more in the prose against something the
  model computes. Smaller numbers are rates, ports and seconds that the case
  states as configuration, and matching those found coincidences rather than
  mistakes.
*/
for (const item of CASES) {
  const computed = new Set<string>();
  const add = (value: number) => {
    computed.add(String(value));
    computed.add(value.toLocaleString("en-GB"));
  };
  add(rangeSize(item.setup));
  add(portsHeld(item.setup));
  if (maxRate(item.setup) !== Infinity) add(maxRate(item.setup));
  for (const load of loads(item.setup)) {
    add(load.held);
    add(load.destination.rate);
    add(load.destination.port);
  }
  for (const value of item.setup.portRange) add(value);
  add(item.setup.poolPerDestination);
  /* Two figures every case may cite: the default range and its ceiling. */
  add(28232);
  add(470);
  add(64512);
  add(1075);
  /*
    An illustrative port number is allowed, and checked: a case naming a port
    to make the four tuple concrete has to name one inside its own range, or
    the illustration is wrong in the one way that matters.
  */
  for (const match of prose_ports(item.brief + " " + item.why + " " + item.fix)) {
    if (match >= item.setup.portRange[0] && match <= item.setup.portRange[1]) add(match);
  }
  /*
    A case may cite a figure from another configuration when the point is the
    comparison. Each one is listed with what it is, so it stays a statement
    somebody checked rather than a hole in the net.
  */
  for (const value of Object.keys(CROSS_REFERENCED[item.slug] ?? {})) {
    add(Number(value));
  }
  const prose = [item.brief, item.question, item.why, item.fix].join(" ");
  for (const match of prose.matchAll(/(?<![\w.])(\d[\d,]{3,})(?![\w.])/g)) {
    if (!computed.has(match[1]) && !computed.has(match[1].replace(/,/g, ""))) {
      problems.push(
        `${item.slug}: the prose states ${match[1]} and nothing in this case has that value.` +
          ` If it is deliberately about a different configuration, add it to CROSS_REFERENCED` +
          ` with what it is.`,
      );
    }
  }
}

/*
  Every cross referenced figure has to be a number some case in the set
  actually produces. Without this the table is an allowlist of arbitrary
  numbers with a sentence next to each, and the sentence is the only thing
  saying they are real, which is the shape of a check that checks nothing.
*/
for (const [slug, entries] of Object.entries(CROSS_REFERENCED)) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`CROSS_REFERENCED names ${slug}, which is not a case`);
    continue;
  }
  for (const [value, reason] of Object.entries(entries)) {
    const wanted = Number(value);
    const produced = CASES.some(
      (other) =>
        other.slug !== slug &&
        (portsHeld(other.setup) === wanted ||
          rangeSize(other.setup) === wanted ||
          maxRate(other.setup) === wanted ||
          loads(other.setup).some((load) => load.held === wanted)),
    );
    if (!produced) {
      problems.push(
        `CROSS_REFERENCED says ${slug} may cite ${wanted} because it is "${reason}", and no other` +
          ` case in the set produces that number. Either the figure is wrong or the case it` +
          ` describes has changed.`,
      );
    }
  }
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
  console.error(`check-ports: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} hosts against a port range, each with exactly one option that holds,` +
    ` every occupancy recounted by opening and expiring ports a second at a time,` +
    ` ${properties.length} direct properties, the four tuple checked to be independent per` +
    ` destination, tcp_fin_timeout checked to change nothing, and answers spread ${spread.join("/")}.`,
);
