/**
 * The throughput surface has to agree with its own arithmetic.
 *
 * Three kinds of check, and the third is the one that earns its place.
 *
 * First, every case's declared answer is replayed against the model. A case
 * whose stated binding is not the binding the model computes is an exercise
 * that marks a correct reader wrong.
 *
 * Second, the model is checked against arithmetic done by hand rather than by
 * the model. Numbers in this file were worked out on paper: if the code and
 * this file agree, either both are right or somebody changed both, and the
 * second is at least a deliberate act.
 *
 * Third, and this is the useful one: every throughput figure quoted in the
 * prose has to match a figure the model actually produces. Explanations go
 * stale the moment a parameter is edited, and a case that says "about 14
 * Mbps" beside a model that computes 17 is worse than one with no number at
 * all, because the reader will believe the sentence. This caught four wrong
 * figures the first time it ran, all of them mine.
 */

import { CASES } from "../client/src/lib/transfer/data/cases";
import {
  MATHIS,
  analyse,
  bdpBytes,
  bindingFor,
  duration,
  lossLimit,
  size,
  timeToTransfer,
  windowLimit,
} from "../client/src/lib/transfer/model";
import type { Limit, Link } from "../client/src/lib/transfer/types";

const problems: string[] = [];
const KiB = 1024;
const MiB = 1024 * 1024;

/** Within a tenth of a per cent, which is tighter than any figure here is quoted to. */
const close = (a: number, b: number, tolerance = 0.001) =>
  Math.abs(a - b) <= Math.abs(b) * tolerance;

/* ------------------------------------------------ arithmetic done by hand */

/*
  Every expected value below was computed away from the code.

  BDP    = bandwidth / 8 * rtt
  window = window * 8 / rtt
  Mathis = mss * 8 / rtt * sqrt(3/2) / sqrt(loss)
*/
const HAND: { label: string; got: () => number; want: number }[] = [
  /* 1e9 / 8 * 0.010 = 1_250_000 */
  { label: "BDP of 1 Gbps at 10ms", got: () => bdpBytes({ bandwidth: 1e9, rtt: 10, loss: 0, window: 0, mss: 1460 }), want: 1_250_000 },
  /* 1e9 / 8 * 0.150 = 18_750_000 */
  { label: "BDP of 1 Gbps at 150ms", got: () => bdpBytes({ bandwidth: 1e9, rtt: 150, loss: 0, window: 0, mss: 1460 }), want: 18_750_000 },
  /* 1e10 / 8 * 0.002 = 2_500_000 */
  { label: "BDP of 10 Gbps at 2ms", got: () => bdpBytes({ bandwidth: 1e10, rtt: 2, loss: 0, window: 0, mss: 1460 }), want: 2_500_000 },
  /* 65536 * 8 / 0.150 = 524288 / 0.15 = 3_495_253.333... */
  { label: "64KiB over 150ms", got: () => windowLimit({ bandwidth: 1e9, rtt: 150, loss: 0, window: 64 * KiB, mss: 1460 }), want: 3_495_253.3333333335 },
  /* 65536 * 8 / 0.600 = 524288 / 0.6 = 873_813.333... */
  { label: "64KiB over 600ms", got: () => windowLimit({ bandwidth: 5e7, rtt: 600, loss: 0, window: 64 * KiB, mss: 1460 }), want: 873_813.3333333334 },
  /* 524288 * 8 / 0.002 = 4194304 / 0.002 = 2_097_152_000 */
  { label: "512KiB over 2ms", got: () => windowLimit({ bandwidth: 1e10, rtt: 2, loss: 0, window: 512 * KiB, mss: 1460 }), want: 2_097_152_000 },
  /* 32768 * 8 / 0.0002 = 262144 / 0.0002 = 1_310_720_000 */
  { label: "32KiB over 0.2ms", got: () => windowLimit({ bandwidth: 2.5e10, rtt: 0.2, loss: 0, window: 32 * KiB, mss: 1460 }), want: 1_310_720_000 },
  /* 11680 / 0.1 * 1.2247448713915890 / 0.01 = 116800 * 122.47448713915891 = 14_305_020.09... */
  { label: "Mathis at 100ms, 1e-4, 1460B", got: () => lossLimit({ bandwidth: 1e9, rtt: 100, loss: 1e-4, window: 0, mss: 1460 })!, want: 14_305_020.09795219 },
  /* 11680 / 0.06 * 1.2247448713915890 / sqrt(2e-4) */
  { label: "Mathis at 60ms, 2e-4, 1460B", got: () => lossLimit({ bandwidth: 1e9, rtt: 60, loss: 2e-4, window: 0, mss: 1460 })!, want: (11680 / 0.06) * (Math.SQRT2 * Math.sqrt(0.75) / Math.sqrt(2e-4)) },
  /* The constant itself: sqrt(3/2). */
  { label: "the Mathis constant", got: () => MATHIS, want: 1.224744871391589 },
];

for (const row of HAND) {
  const got = row.got();
  if (!close(got, row.want)) {
    problems.push(`${row.label}: model says ${got}, hand arithmetic says ${row.want}`);
  }
}

/* ------------------------------------------------------- model behavior */

/* No loss is not the same as unimaginably small loss, and the page says so. */
if (lossLimit({ bandwidth: 1e9, rtt: 50, loss: 0, window: 0, mss: 1460 }) !== null) {
  problems.push("a loss rate of zero should have no Mathis bound at all, not an enormous one");
}

/* Throughput must fall as loss rises. A sign error here would invert the lesson. */
let previous = Infinity;
for (const loss of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) {
  const value = lossLimit({ bandwidth: 1e9, rtt: 50, loss, window: 0, mss: 1460 })!;
  if (value >= previous) problems.push(`the loss bound did not fall between the step before ${loss} and it`);
  previous = value;
}

/* A quarter of the loss should double the bound, not quadruple it: the square root is the point. */
const atOne = lossLimit({ bandwidth: 1e9, rtt: 50, loss: 4e-4, window: 0, mss: 1460 })!;
const atQuarter = lossLimit({ bandwidth: 1e9, rtt: 50, loss: 1e-4, window: 0, mss: 1460 })!;
if (!close(atQuarter / atOne, 2)) {
  problems.push(`quartering the loss changed the bound by ${(atQuarter / atOne).toFixed(3)}, and the square root says it should be 2`);
}

/* A stream can never be handed more than the wire. */
for (const link of CASES.map((item) => item.link)) {
  const result = analyse(link);
  if (result.throughput > link.bandwidth) {
    problems.push(`a case reports ${result.throughput} bps over a ${link.bandwidth} bps link`);
  }
  if (result.utilisation > 1.0000001) {
    problems.push(`a case reports ${(result.utilisation * 100).toFixed(1)} per cent of its own link`);
  }
}

/*
  A window sized exactly to the pipe is link limited, not window limited.
  Sending somebody to change the one setting that is already correct is the
  worst answer this page could give, so the tie-break is checked rather than
  assumed.
*/
const exact: Link = { bandwidth: 1e9, rtt: 10, loss: 0, window: 1_250_000, mss: 1460 };
if (analyse(exact).binding !== "link") {
  problems.push(`a window sized exactly to the pipe reported "${analyse(exact).binding}" rather than "link"`);
}

/*
  A transfer of nothing is not an error and not an eternity.
  timeToTransfer must still return the handshake and stop.
*/
const empty = timeToTransfer({ bandwidth: 1e9, rtt: 20, loss: 0, window: 1 * MiB, mss: 1460 }, 0);
if (!close(empty.seconds, 0.02) || empty.slowStartRounds !== 0) {
  problems.push(`moving no bytes took ${empty.seconds}s over ${empty.slowStartRounds} rounds`);
}

/*
  Slow start, counted by hand.

  Ten segments of 1460 is 14600 bytes, doubling each round, against a ceiling
  of min(window, BDP). For a 1MiB window on a 100 Mbps 200ms path the BDP is
  2.5MB, so the ceiling is the window at 1048576 bytes. The rounds are 14600,
  29200, 58400, 116800, 233600, 467200, 934400: seven of them, because the
  eighth would be 1868800 and the window stops it. That is 1854200 bytes,
  which is 14600 * (2^7 - 1) = 14600 * 127.
*/
const ramp = timeToTransfer({ bandwidth: 1e8, rtt: 200, loss: 0, window: 1 * MiB, mss: 1460 }, 5 * MiB);
if (ramp.slowStartRounds !== 7) problems.push(`slow start took ${ramp.slowStartRounds} rounds where seven was counted by hand`);
if (!close(ramp.slowStartSeconds, 1.4)) problems.push(`the ramp took ${ramp.slowStartSeconds}s where 7 x 200ms was counted by hand`);
/* 5 * 1048576 - 14600 * 127 = 5242880 - 1854200 = 3388680 bytes over a 41943040 bps window ceiling. */
if (!close(ramp.steadySeconds, (3_388_680 * 8) / ((1 * MiB * 8) / 0.2))) {
  problems.push(`the steady phase took ${ramp.steadySeconds}s where hand arithmetic says ${(3_388_680 * 8) / ((1 * MiB * 8) / 0.2)}`);
}

/* Something small enough to finish inside the first window never leaves slow start. */
const tiny = timeToTransfer({ bandwidth: 1e9, rtt: 50, loss: 0, window: 1 * MiB, mss: 1460 }, 10_000);
if (!tiny.finishedRamping || tiny.steadySeconds !== 0) {
  problems.push("a transfer smaller than the initial window was reported as reaching a steady rate");
}

/* ----------------------------------------------------------- every case */

const seenBindings = new Set<Limit>();
const slugs = new Set<string>();

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: two cases share a slug`);
  slugs.add(item.slug);
  seenBindings.add(item.binding);

  const computed = bindingFor(item.link, item.bytes);
  if (computed !== item.binding) {
    problems.push(`${item.slug}: says "${item.binding}" but the model computes "${computed}"`);
  }

  if (item.link.loss < 0 || item.link.loss >= 1) problems.push(`${item.slug}: loss of ${item.link.loss} is not a fraction`);
  if (item.link.mss < 500 || item.link.mss > 9000) problems.push(`${item.slug}: an MSS of ${item.link.mss} is not a real one`);
  if (item.link.rtt <= 0) problems.push(`${item.slug}: a round trip has to take some time`);
  if (item.bytes <= 0) problems.push(`${item.slug}: has nothing to transfer`);

  if (item.complaint.length < 120) problems.push(`${item.slug}: the complaint is too short to reason from`);
  if (item.fix.length < 100) problems.push(`${item.slug}: the fix does not explain itself`);
  if (item.redHerring.length < 60) problems.push(`${item.slug}: the red herring is not one`);
  if (item.fix === item.redHerring) problems.push(`${item.slug}: the fix and the red herring are the same sentence`);

  /*
    The complaint must not name the answer. "The window is too small" in the
    complaint turns the exercise into reading comprehension.
  */
  const tell = item.complaint.toLowerCase();
  for (const word of ["window scaling is too", "bandwidth-delay", "mathis", "the window is too small"]) {
    if (tell.includes(word)) problems.push(`${item.slug}: the complaint gives the answer away with "${word}"`);
  }
}

for (const needed of ["link", "window", "loss", "ramp"] as Limit[]) {
  if (!seenBindings.has(needed)) {
    problems.push(`no case is limited by "${needed}", so a reader never has to consider it`);
  }
}

/* ------------------------------- every number in the prose has to be real */

/**
 * Line rates somebody might name as a hypothetical rather than a result.
 *
 * "A 10 Gbps circuit would move the same 6.6 Mbps" quotes two figures and
 * only one of them is computed. Kept explicit, because a general "allow
 * round numbers" rule would let a wrong computed figure through whenever it
 * happened to be round.
 */
const CATALOGUE_RATES = new Set([
  10e6, 100e6, 1e9, 2.5e9, 5e9, 10e9, 25e9, 40e9, 50e6, 100e9, 400e9,
]);

const UNIT: Record<string, number> = { kbps: 1e3, Mbps: 1e6, Gbps: 1e9 };

for (const item of CASES) {
  const result = analyse(item.link);
  const real = [result.linkLimit, result.windowLimit, result.throughput];
  if (result.lossLimit !== null) real.push(result.lossLimit);

  for (const prose of [item.fix, item.redHerring]) {
    for (const match of prose.matchAll(/(\d+(?:\.\d+)?)\s*(kbps|Mbps|Gbps)/g)) {
      const quoted = Number(match[1]) * UNIT[match[2]];
      if (CATALOGUE_RATES.has(quoted)) continue;
      /*
        A figure the complaint itself reports is the reader's own observation,
        not a claim about the model, so quoting it back is allowed. The match
        is verbatim rather than numeric: an explanation that rounds the user's
        number differently from the user has still changed it.
      */
      if (item.complaint.includes(match[0])) continue;
      /*
        Two per cent, because the prose rounds: "about 17 Mbps" for 17.0
        and "6.6 Mbps" for 6.554 are both honest, and "14 Mbps" for 17 is not.
      */
      if (!real.some((value) => close(value, quoted, 0.02))) {
        problems.push(
          `${item.slug}: the prose says ${match[0]}, which is not within two per cent of any figure the model produces ` +
            `(${real.map((value) => (value / 1e6).toFixed(2) + " Mbps").join(", ")})`,
        );
      }
    }
  }
}

/* ------------------------------------------------------ what gets rendered */

/*
  duration() and size() are what a reader actually sees, and a formatter that
  lies still lies. Both are pinned at their unit boundaries, because the
  boundary is the whole behavior, and then checked for monotonicity, because
  a longer transfer that prints as a shorter one is worse than a wrong unit.

  Both were exported and named by nothing in this file until a check over the
  models found them. Three functions elsewhere in the same state turned out to
  be breakable in silence.
*/
for (const [seconds, want] of [
  [Infinity, "never"],
  [0, "0 ms"],
  [0.5, "500 ms"],
  [0.999, "999 ms"],
  [1, "1.0 s"],
  [9.94, "9.9 s"],
  [10, "10 s"],
  [89, "89 s"],
  [90, "1.5 min"],
  [599, "10.0 min"],
  [600, "10 min"],
  [5399, "90 min"],
  [5400, "1.5 h"],
  [7200, "2.0 h"],
] as [number, string][]) {
  if (duration(seconds) !== want) {
    problems.push(`duration(${seconds}) reads "${duration(seconds)}" rather than "${want}"`);
  }
}

for (const [bytes, want] of [
  [0, "0 B"],
  [1023, "1023 B"],
  [1024, "1 KiB"],
  [1024 * 1024 - 1, "1024 KiB"],
  [1024 * 1024, "1.00 MiB"],
  [10 * 1024 * 1024 - 1, "10.00 MiB"],
  [10 * 1024 * 1024, "10 MiB"],
  [1024 ** 3, "1.00 GiB"],
  [5 * 1024 ** 3, "5.00 GiB"],
] as [number, string][]) {
  if (size(bytes) !== want) problems.push(`size(${bytes}) reads "${size(bytes)}" rather than "${want}"`);
}

/*
  Monotonic, read back through the unit. A rendering that goes backwards over
  a boundary is the failure mode these two invite, because each tier rounds
  to a different number of places.
*/
const UNITS: Record<string, number> = { ms: 0.001, s: 1, min: 60, h: 3600 };
let previousSeconds = -1;
for (const seconds of [0, 0.5, 0.999, 1, 5, 9.9, 10, 60, 89, 90, 300, 599, 600, 3600, 5399, 5400, 7200, 36000]) {
  const shown = duration(seconds);
  const [value, unit] = shown.split(" ");
  const back = Number(value) * UNITS[unit];
  if (back < previousSeconds) problems.push(`duration() went backwards: ${seconds} reads "${shown}"`);
  previousSeconds = back;
}

const SCALES: Record<string, number> = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };
let previousBytes = -1;
for (const bytes of [0, 512, 1023, 1024, 4096, 1024 ** 2 - 1, 1024 ** 2, 5 * 1024 ** 2, 10 * 1024 ** 2, 1024 ** 3, 8 * 1024 ** 3]) {
  const shown = size(bytes);
  const [value, unit] = shown.split(" ");
  const back = Number(value) * SCALES[unit];
  if (back < previousBytes) problems.push(`size() went backwards: ${bytes} reads "${shown}"`);
  previousBytes = back;
}

if (problems.length) {
  console.error(`\ncheck-transfer: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cases, every declared limit replayed against the model, ${HAND.length} results checked against ` +
    `arithmetic done by hand, and every throughput quoted in the prose matched to a figure the model produces.`,
);
