/**
 * The load surface, checked against the kernel arithmetic it claims to model.
 *
 * Five things, and the first is the only one that is really about the cases.
 *
 *   1. Exactly one option holds of each case. Nothing declares an answer, so
 *      an option set that has drifted from its own timeline fails here.
 *   2. The number a reader sees in an option's prose is the number the claim
 *      is checked against. These are two fields, they are written by hand at
 *      the same moment, and the one the reader believes is the prose.
 *   3. The fold is recomputed a second time, shaped differently, and has to
 *      agree exactly.
 *   4. Direct properties, on cases where the exactly-one check has no power.
 *      Four options naming four numbers means a wrong answer still leaves
 *      exactly one holding, so the check passes and the reader learns the
 *      wrong number. Only a property on the function catches that.
 *   5. Spread, prose figures, and uniqueness.
 *
 *     npx tsx scripts-ci/check-load.ts
 */

import {
  CASES,
  EXP_1,
  EXP_5,
  EXP_15,
  FIXED_1,
  LOAD_FREQ,
  asFixed,
  asNumber,
  blame,
  calcLoad,
  correctOption,
  countsAt,
  matching,
  clock,
  peak,
  perCore,
  procLine,
  readAt,
  run,
  windowOf,
} from "../client/src/lib/load/index";
import type { Setup, Which } from "../client/src/lib/load/types";

const problems: string[] = [];

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold of the model, not one` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. Either the timeline changed under the options or two options say the same thing.`,
    );
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
}

/* ── 2. the prose figure and the checked figure ─────────────────────────── */

/*
  Checked by scripts-ci/check-option-prose.ts, generically, for every surface
  that offers options rather than for this one.

  Four surfaces grew their own copy of this within a day of each other, each
  with its own regex, which is how the answer-key check came about too.
  Writing it once also gave it to /nat and /alerts, which had thirteen and
  three options quoting a figure that nothing compared.
*/

/* ── 3. the fold, recomputed differently ────────────────────────────────── */

/*
  run() places samples by multiplying: the nth is at n * LOAD_FREQ. This walks
  the window instead, a tick at a time, folding whenever it crosses a sample
  boundary. Same arithmetic, opposite shape, and it is the placement rather
  than the arithmetic that an off-by-one lives in: a version that folded at
  n=0 as well would be one sample ahead everywhere and every figure on the
  page would be wrong by one fold.
*/
function walked(setup: Setup): { one: number; five: number; fifteen: number; folds: number } {
  const TICK = 1 / 250;
  const total = windowOf(setup);
  let one = asFixed(setup.start[0]);
  let five = asFixed(setup.start[1]);
  let fifteen = asFixed(setup.start[2]);
  let next = LOAD_FREQ;
  let folds = 0;
  for (let t = TICK; t <= total + 1e-9; t += TICK) {
    if (t + 1e-9 < next) continue;
    const { running, blocked } = countsAt(setup, next);
    const active = (running + blocked) * FIXED_1;
    one = calcLoad(one, EXP_1, active);
    five = calcLoad(five, EXP_5, active);
    fifteen = calcLoad(fifteen, EXP_15, active);
    folds += 1;
    next += LOAD_FREQ;
  }
  return { one: asNumber(one), five: asNumber(five), fifteen: asNumber(fifteen), folds };
}

for (const item of CASES) {
  const samples = run(item.setup);
  const last = samples[samples.length - 1];
  const again = walked(item.setup);
  if (!last) {
    problems.push(`${item.slug}: the window is shorter than one sample period`);
    continue;
  }
  if (again.folds !== samples.length) {
    problems.push(
      `${item.slug}: run() folded ${samples.length} samples and walking the window folded` +
        ` ${again.folds}. One of them places the samples wrongly.`,
    );
  }
  for (const which of ["one", "five", "fifteen"] as Which[]) {
    if (last[which] !== again[which]) {
      problems.push(
        `${item.slug}: the two recomputations disagree on ${which}: ${last[which]} against` +
          ` ${again[which]}`,
      );
    }
  }
}

/* ── 4. direct properties ───────────────────────────────────────────────── */

/*
  Each of these is a fact about the situation rather than about the option
  set, so it survives an option being reworded, reordered or renumbered. The
  cases they guard are the ones where the four options name four values of
  the same quantity: there, moving the right answer moves the model with it
  and the exactly-one check has nothing to say.
*/
const properties: [string, () => boolean, string][] = [
  [
    "the-mount-stopped-answering",
    () => {
      const item = CASES.find((c) => c.slug === "the-mount-stopped-answering")!;
      const at = 900;
      const { running, blocked } = countsAt(item.setup, at);
      return readAt(item.setup, "one", at) > 40 && running <= 1 && blocked === 40;
    },
    "a load above 40 with at most one runnable task, which is the whole case",
  ],
  [
    "one-minute-is-not-one-minute",
    () => {
      const item = CASES.find((c) => c.slug === "one-minute-is-not-one-minute")!;
      const atMinute = readAt(item.setup, "one", 60);
      const steady = 8;
      const textbook = Math.round(steady * (1 - Math.exp(-1)) * 100) / 100;
      /* Below the steady state, and below the textbook figure, because the
         eleventh sample lands at 55.04 and the twelfth at 60.05. */
      return atMinute < textbook && textbook < steady && Math.floor(60 / LOAD_FREQ) === 11;
    },
    "the one minute reading at 60s below both the steady state and 8(1-1/e), with 11 samples in the minute",
  ],
  [
    "eight-on-thirty-two",
    () => {
      const item = CASES.find((c) => c.slug === "eight-on-thirty-two")!;
      return (
        readAt(item.setup, "one", 600) === 8 &&
        perCore(item.setup, 600) < 0.3 &&
        item.setup.cores === 32
      );
    },
    "a load of 8 that is under a third of a core each, so the raw figure and the per core figure disagree",
  ],
  [
    "it-is-still-high-and-it-is-over",
    () => {
      const item = CASES.find((c) => c.slug === "it-is-still-high-and-it-is-over")!;
      const { running, blocked } = countsAt(item.setup, 180);
      return running === 0 && blocked === 0 && readAt(item.setup, "one", 180) > 5;
    },
    "a reading above 5 on a machine with nothing runnable and nothing blocked",
  ],
  [
    "fifteen-never-noticed",
    () => {
      const item = CASES.find((c) => c.slug === "fifteen-never-noticed")!;
      return peak(item.setup, "fifteen") < 1 && peak(item.setup, "one") > 5;
    },
    "the one minute figure over 5 while the fifteen minute figure never reaches 1",
  ],
  [
    "the-burst-between-samples",
    () => {
      const item = CASES.find((c) => c.slug === "the-burst-between-samples")!;
      const busiest = Math.max(...item.setup.phases.map((p) => p.running + p.blocked));
      return peak(item.setup, "one") === 0 && busiest >= 16 * item.setup.cores;
    },
    "sixteen times oversubscribed and a peak of exactly zero, which is the case",
  ],
  [
    "which-way-is-it-going",
    () => {
      const item = CASES.find((c) => c.slug === "which-way-is-it-going")!;
      const one = readAt(item.setup, "one", 300);
      const fifteen = readAt(item.setup, "fifteen", 300);
      return fifteen > one * 4;
    },
    "the fifteen minute figure more than four times the one minute figure at the same instant",
  ],
  [
    "one-hung-df",
    () => {
      const item = CASES.find((c) => c.slug === "one-hung-df")!;
      return (
        readAt(item.setup, "fifteen", 3600) === 1 &&
        readAt(item.setup, "one", 3600) === 1 &&
        countsAt(item.setup, 3600).running === 0
      );
    },
    "all three figures at exactly 1.00 with nothing runnable at all",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-load names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this, because the options name four values of one quantity and moving the` +
        ` answer moves the model with it.`,
    );
  }
}

/* ── 5. what the page renders, against what the model computed ──────────── */

/*
  procLine() builds the /proc/loadavg the page prints, and it is the only
  place a reader sees all three figures at once. It is also the easiest thing
  on the page to get quietly wrong, because it formats rather than computes
  and a formatter that reads the wrong field still produces a plausible line.
  So the line is parsed back and compared against the three functions it is
  supposed to be showing.
*/
for (const item of CASES) {
  for (const at of [0, Math.round(windowOf(item.setup) / 2), Math.round(windowOf(item.setup))]) {
    const line = procLine(item.setup, at);
    const fields = line.split(" ");
    if (fields.length !== 5) {
      problems.push(`${item.slug}: /proc/loadavg at ${at}s has ${fields.length} fields, not five`);
      continue;
    }
    const shown: [Which, string][] = [
      ["one", fields[0]],
      ["five", fields[1]],
      ["fifteen", fields[2]],
    ];
    for (const [which, text] of shown) {
      const want = readAt(item.setup, which, at).toFixed(2);
      if (text !== want) {
        problems.push(
          `${item.slug}: the /proc/loadavg line at ${at}s shows ${which} as ${text} and readAt` +
            ` gives ${want}. The page prints this line.`,
        );
      }
    }
    const [running, entries] = fields[3].split("/").map(Number);
    const counts = countsAt(item.setup, at);
    if (running !== counts.running + 1) {
      problems.push(
        `${item.slug}: the running field at ${at}s is ${running} and the case has` +
          ` ${counts.running} runnable tasks plus the reader's own shell`,
      );
    }
    if (entries <= counts.running + counts.blocked) {
      problems.push(
        `${item.slug}: /proc/loadavg claims ${entries} scheduling entities at ${at}s, which is not` +
          ` more than the ${counts.running + counts.blocked} tasks this case already has`,
      );
    }
  }
}

/*
  clock() writes the phase edges the page shows. Sixty seconds has to be one
  minute rather than 60s, and ninety has to keep its remainder, because a
  timeline reading "1m" for both is a timeline that has lost the difference
  between the cases.
*/
for (const [seconds, want] of [
  [0, "0s"],
  [30, "30s"],
  [59, "59s"],
  [60, "1m"],
  [90, "1m30s"],
  [120, "2m"],
  [900, "15m"],
  [3600, "60m"],
] as [number, string][]) {
  if (clock(seconds) !== want) {
    problems.push(`clock(${seconds}) is "${clock(seconds)}" and the page needs "${want}"`);
  }
}
if (new Set(CASES.flatMap((item) => item.setup.phases.map((p) => clock(p.seconds)))).size < 2) {
  problems.push("every phase in every case formats to the same duration, so the timelines are flat");
}

/* ── 6. the constants, the spread, the prose and the uniqueness ─────────── */

/*
  The three decay constants against the exponentials they stand for. The
  header says they are 1/exp(5sec/1min) and so on as fixed point, so a
  transcription error is a constant that is close to a different exponential
  or to nothing at all. A tenth of a percent is tighter than the rounding the
  kernel's own 11 bits allow and loose enough that the kernel's values pass.
*/
for (const [name, value, seconds] of [
  ["EXP_1", EXP_1, 60],
  ["EXP_5", EXP_5, 300],
  ["EXP_15", EXP_15, 900],
] as [string, number, number][]) {
  const want = Math.exp(-5 / seconds);
  const got = value / FIXED_1;
  if (Math.abs(got - want) / want > 0.001) {
    problems.push(
      `${name} is ${value}/${FIXED_1} = ${got.toFixed(6)}, and 1/exp(5s/${seconds}s) is` +
        ` ${want.toFixed(6)}. That is not the constant it claims to be.`,
    );
  }
}

if (Math.abs(LOAD_FREQ - 5) < 1e-9) {
  problems.push(
    `LOAD_FREQ is exactly 5 seconds. The kernel uses 5*HZ+1 ticks, and the extra tick is the` +
      ` reason the one minute figure has folded eleven samples at the one minute mark rather than` +
      ` twelve. A model without it gets a case wrong and looks right.`,
  );
}

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
const worst = Math.max(...spread);
if (worst > CASES.length / 2) {
  problems.push(
    `${worst} of ${CASES.length} answers are in the same option position (${spread.join("/")}).` +
      ` Somebody clicking the same slot every time should not score.`,
  );
}

/*
  Every load-shaped figure in the prose against something the model computes.

  A figure is load-shaped if it is written to two decimal places, which is
  how /proc/loadavg prints and how every reading on this page is quoted.
  Whole numbers are excluded deliberately: they are core counts, task counts
  and durations, and matching those against readings found agreement by
  coincidence more often than it found a mistake.
*/
for (const item of CASES) {
  const computed = new Set<string>();
  for (const sample of run(item.setup)) {
    for (const which of ["one", "five", "fifteen"] as Which[]) computed.add(sample[which].toFixed(2));
    /*
      Sample times too, and for the same reason as the readings rather than
      to get past the check. The prose says the twelfth sample lands at 60.05
      seconds, which is a claim about LOAD_FREQ that is exactly as easy to
      get wrong as a reading: a model with a 5 second period would put it at
      60.00 and the sentence would be quietly false. Admitting the times
      means the check reads them as well.
    */
    computed.add(sample.at.toFixed(2));
  }
  for (const value of item.setup.start) computed.add(value.toFixed(2));
  for (const at of [60, 120, 180, 300, 600, 900, 3600]) {
    if (at > windowOf(item.setup)) continue;
    computed.add(perCore(item.setup, at).toFixed(2));
  }
  const prose = [item.brief, item.question, item.why, item.fix].join(" ");
  for (const match of prose.matchAll(/(?<![\w.])(\d+\.\d{2})(?![\w.])/g)) {
    if (!computed.has(match[1])) {
      problems.push(
        `${item.slug}: the prose states ${match[1]} and no reading in this run has that value.` +
          ` Either the timeline changed or the figure was typed.`,
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
  if (blame(item.setup) === "neither" && item.setup.phases.some((p) => p.running > item.setup.cores)) {
    problems.push(`${item.slug}: blamed on nothing while a phase has more runnable tasks than cores`);
  }
}

if (problems.length) {
  console.error(`check-load: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} load runs, each with exactly one option that holds, every reading` +
    ` recomputed by walking the window and agreeing to the fixed-point unit,` +
    ` ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
