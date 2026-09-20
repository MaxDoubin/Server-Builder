/**
 * The overcommit set, checked against page arithmetic rather than the model's
 * expression.
 *
 * Everything here rests on one number, CommitLimit, and the way to get it
 * wrong is to compute it in kilobytes. The kernel floors a page count and
 * then multiplies, so this gate re-derives the limit by counting pages a
 * block at a time and never touches a kilobyte until the end. A model that
 * floors at the wrong point is off by a couple of kilobytes, which is exactly
 * the discrepancy that made the measured host look like rounding noise.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/overcommit/data/cases";
import {
  PAGE_KB,
  asSysctl,
  claimHolds,
  commitLimitKb,
  committedPercentOfLimit,
  committedPercentOfRam,
  correctOption,
  headroomKb,
  human,
  limitPercentOfRam,
  modeName,
  oomPossible,
  refuses,
  refusesWithMemoryFree,
} from "../client/src/lib/overcommit/model";
import type { Setup } from "../client/src/lib/overcommit/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* -------------------------------------------- the limit, counted in pages */

/**
 * vm_commit_limit, written as the kernel writes it and then some.
 *
 * The ratio is applied to a page count, the result is floored there, swap
 * pages are added whole, and only then does anything become kilobytes. The
 * page total is reached by adding blocks rather than by dividing, so a model
 * that has the page size wrong disagrees with a count.
 */
function limitByCountingPages(setup: Setup): number {
  let ramPages = 0;
  for (let kb = 0; kb + PAGE_KB <= setup.ramKb; kb += PAGE_KB * 1024) {
    ramPages += Math.min(1024, (setup.ramKb - kb) / PAGE_KB);
  }
  ramPages = Math.floor(ramPages);
  let swapPages = 0;
  for (let kb = 0; kb + PAGE_KB <= setup.swapKb; kb += PAGE_KB * 1024) {
    swapPages += Math.min(1024, (setup.swapKb - kb) / PAGE_KB);
  }
  swapPages = Math.floor(swapPages);
  const allowed =
    setup.kbytes > 0
      ? Math.floor(setup.kbytes / PAGE_KB)
      : Math.floor((ramPages * setup.ratio) / 100);
  return (allowed + swapPages) * PAGE_KB;
}

for (const c of CASES) {
  const counted = limitByCountingPages(c.setup);
  if (counted !== commitLimitKb(c.setup)) {
    fail(`${c.slug}: counting pages gives ${counted} kB and commitLimitKb says ${commitLimitKb(c.setup)} kB`);
  }
  if (commitLimitKb(c.setup) % PAGE_KB !== 0) {
    fail(`${c.slug}: CommitLimit ${commitLimitKb(c.setup)} kB is not a whole number of pages`);
  }
  if (headroomKb(c.setup) !== commitLimitKb(c.setup) - c.setup.committedKb) {
    fail(`${c.slug}: headroom does not agree with the limit less what is committed`);
  }
}

/* ------------------------------------------------------- sweep the ratio */

/*
  Across the whole accepted range the limit has to rise with the ratio, never
  fall, and agree with the page count at every step. A kilobyte based formula
  drifts from this by two or three kilobytes at most settings and lands on it
  exactly at the round ones, which is how it survives a spot check.
*/
{
  const base: Setup = { ...CASES[0].setup, kbytes: 0, swapKb: 0 };
  let previous = -1;
  let matched = 0;
  let drifted = 0;
  for (let ratio = 0; ratio <= 300; ratio += 1) {
    const s: Setup = { ...base, ratio };
    const counted = limitByCountingPages(s);
    const got = commitLimitKb(s);
    if (got !== counted) fail(`ratio sweep: at ${ratio} the model says ${got} and the count says ${counted}`);
    if (got < previous) fail(`ratio sweep: the limit fell from ${previous} to ${got} as the ratio rose`);
    const naive = Math.floor((s.ramKb * ratio) / 100);
    if (naive !== got) drifted += 1;
    matched += 1;
    previous = got;
  }
  if (matched !== 301) fail(`ratio sweep: ${matched} settings were walked`);
  if (drifted < 100) {
    fail(`ratio sweep: a kilobyte formula only drifted at ${drifted} of 301 settings, which is too few to be checking anything`);
  }
}

/* Swap is added whole, and the ratio never touches it. */
for (const swapKb of [0, 1_048_576, 8_388_608, 33_554_432]) {
  for (const ratio of [25, 50, 100]) {
    const s: Setup = { ...CASES[0].setup, swapKb, ratio, kbytes: 0 };
    const noSwap = commitLimitKb({ ...s, swapKb: 0 });
    if (commitLimitKb(s) !== noSwap + swapKb) {
      fail(`swap: ${swapKb} kB at ratio ${ratio} moved the limit by ${commitLimitKb(s) - noSwap} kB`);
    }
  }
}

/* kbytes replaces the ratio rather than adding to it. */
for (const kbytes of [1_048_576, 12_582_912, 40_000_000]) {
  for (const ratio of [0, 50, 200]) {
    const s: Setup = { ...CASES[0].setup, kbytes, ratio, swapKb: 0 };
    if (commitLimitKb(s) !== kbytes) {
      fail(`kbytes: ${kbytes} at ratio ${ratio} gave ${commitLimitKb(s)}, and the ratio should be inert`);
    }
  }
}

/* --------------------------------------------- refusal, mode by mode */

/*
  Only strict accounting refuses, and it refuses exactly one kilobyte past the
  limit. Walk every mode against a request that straddles the boundary.
*/
{
  const base: Setup = { ...CASES[0].setup, swapKb: 0, ratio: 50, kbytes: 0 };
  const limit = commitLimitKb(base);
  for (const mode of [0, 1, 2] as const) {
    for (const committedKb of [0, 1_000_000, limit - 1, limit, limit + 1]) {
      const room = limit - committedKb;
      for (const delta of [-1, 0, 1]) {
        const wantKb = Math.max(0, room + delta);
        const s: Setup = { ...base, mode, committedKb, wantKb };
        const want = mode === 2 && committedKb + wantKb > limit;
        if (refuses(s) !== want) {
          fail(`refusal: mode ${mode}, committed ${committedKb}, want ${wantKb} gave ${refuses(s)}, expected ${want}`);
        }
      }
    }
  }
}

/*
  The three modes are named, and each name is tied to what that mode does.

  Checking only that the names are distinct is not enough, and this is not
  hypothetical: swapping "strict" and "always" in the table left every case
  with exactly one holding option, because the swap moved which option that
  was rather than how many. The set stayed self consistent and completely
  wrong. So the name has to answer for the behavior.
*/
{
  const seen = new Set<string>();
  for (const mode of [0, 1, 2] as const) {
    const name = modeName({ ...CASES[0].setup, mode });
    if (!name || seen.has(name)) fail(`mode ${mode} is named "${name}", which is missing or a duplicate`);
    seen.add(name);
  }
  if (seen.size !== 3) fail(`the modes produced ${seen.size} names and there are three modes`);

  const base: Setup = { ...CASES[0].setup, swapKb: 0, ratio: 50, kbytes: 0 };
  const over: Setup = { ...base, committedKb: commitLimitKb(base), wantKb: 1_048_576 };
  for (const mode of [0, 1, 2] as const) {
    const name = modeName({ ...over, mode });
    const refusing = refuses({ ...over, mode });
    if (name === "strict" && !refusing) fail(`the mode named "strict" let an allocation past the limit through`);
    if (name !== "strict" && refusing) fail(`the mode named "${name}" refused something, and only strict refuses`);
  }
  if (modeName({ ...base, mode: 0 }) !== "heuristic") fail(`mode 0 is the heuristic, named "${modeName({ ...base, mode: 0 })}"`);
  if (modeName({ ...base, mode: 1 }) !== "always") fail(`mode 1 never refuses, named "${modeName({ ...base, mode: 1 })}"`);
  if (modeName({ ...base, mode: 2 }) !== "strict") fail(`mode 2 is the hard wall, named "${modeName({ ...base, mode: 2 })}"`);
}

/* A promise the machine cannot keep is exactly a limit above RAM plus swap. */
for (const ratio of [0, 50, 99, 100, 101, 150, 300]) {
  for (const swapKb of [0, 4_194_304]) {
    const s: Setup = { ...CASES[0].setup, ratio, swapKb, kbytes: 0 };
    const want = commitLimitKb(s) > s.ramKb + s.swapKb;
    if (oomPossible(s) !== want) {
      fail(`oomPossible: ratio ${ratio} with ${swapKb} kB of swap gave ${oomPossible(s)}, expected ${want}`);
    }
  }
}

/* Refusing while the memory is there is the case the surface is named for. */
for (const c of CASES) {
  const want = refuses(c.setup) && c.setup.wantKb <= c.setup.availableKb;
  if (refusesWithMemoryFree(c.setup) !== want) {
    fail(`${c.slug}: refusesWithMemoryFree says ${refusesWithMemoryFree(c.setup)} and the pair says ${want}`);
  }
}

/* The two percentages are different questions and must not be one function. */
for (const c of CASES) {
  const ofLimit = Math.round((100 * c.setup.committedKb) / commitLimitKb(c.setup));
  const ofRam = Math.round((100 * c.setup.committedKb) / c.setup.ramKb);
  if (committedPercentOfLimit(c.setup) !== ofLimit) fail(`${c.slug}: committedPercentOfLimit disagrees with the division`);
  if (committedPercentOfRam(c.setup) !== ofRam) fail(`${c.slug}: committedPercentOfRam disagrees with the division`);
  if (limitPercentOfRam(c.setup) !== Math.round((100 * commitLimitKb(c.setup)) / c.setup.ramKb)) {
    fail(`${c.slug}: limitPercentOfRam disagrees with the division`);
  }
}
{
  /* On the measured host they are 48.6 and 24.3, which round apart. */
  const s = CASES[0].setup;
  if (committedPercentOfLimit(s) === committedPercentOfRam(s)) {
    fail(`percentages: the measured host reads the same against the limit and against RAM, so the case does not bite`);
  }
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const previous = seenBreaks.get(c.breaks);
  if (previous) fail(`${c.slug}: breaks the same belief as ${previous}, "${c.breaks}"`);
  seenBreaks.set(c.breaks, c.slug);

  const holds = c.options.map((o, i) => [i, claimHolds(o.says, c.setup)] as const).filter(([, v]) => v);
  if (holds.length !== 1) {
    fail(`${c.slug}: ${holds.length} options hold, and a case has exactly one answer`);
    continue;
  }
  answerAt.push(holds[0][0]);

  const asked = correctOption(c);
  if (asked?.id !== c.options[holds[0][0]].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the scan finds ${c.options[holds[0][0]].id}`);
  }

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  /* Two options naming the same number is a right answer by accident. */
  const numbers = c.options
    .map((o) => (o.says.about === "limit-kb" || o.says.about === "headroom-kb" || o.says.about === "limit-pct-of-ram" ? o.says.value : null))
    .filter((v): v is number => v !== null);
  if (new Set(numbers).size !== numbers.length) {
    fail(`${c.slug}: two options name the same number, so one of them is right by accident`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked =
      o.says.about === "limit-kb" || o.says.about === "headroom-kb" || o.says.about === "limit-pct-of-ram"
        ? o.says.value
        : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole kilobytes`);
  }
  if (c.setup.ramKb <= 0) fail(`${c.slug}: MemTotal is ${c.setup.ramKb}`);
  if (c.setup.ratio < 0) fail(`${c.slug}: overcommit_ratio is ${c.setup.ratio}`);
  if (c.setup.availableKb > c.setup.ramKb) fail(`${c.slug}: MemAvailable is above MemTotal`);

  const lines = asSysctl(c.setup);
  if (lines.length !== 8) fail(`${c.slug}: asSysctl rendered ${lines.length} lines and there are eight figures`);
  if (!lines.some((l) => /RAM ALONE/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not say that the ratio applies to RAM alone`);
  }
  if (!lines.some((l) => /RESERVED not touched/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not say that Committed_AS counts reservations`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* ------------------------------------------------------ measured fixtures */

/*
  Read from /proc/meminfo on the host this was written on, kernel 6.18.44.
  vm.overcommit_ratio was walked and then restored; the mode was never
  changed, because putting a live container into strict accounting to watch
  it refuse things is not a measurement worth taking.

    MemTotal 16481980 kB, SwapTotal 0, Committed_AS 4006572 kB
    ratio  25 ->  4120492      ratio 100 -> 16481980
    ratio  50 ->  8240988      ratio 150 -> 24722968
    ratio  80 -> 13185584
*/
{
  const measured: Setup = {
    host: "the host these came from",
    ramKb: 16_481_980,
    swapKb: 0,
    mode: 0,
    ratio: 50,
    kbytes: 0,
    committedKb: 4_006_572,
    availableKb: 14_596_178,
    wantKb: 0,
  };

  const walked: [number, number][] = [
    [25, 4_120_492],
    [50, 8_240_988],
    [80, 13_185_584],
    [100, 16_481_980],
    [150, 24_722_968],
  ];
  for (const [ratio, expected] of walked) {
    const got = commitLimitKb({ ...measured, ratio });
    if (got !== expected) fail(`measured: ratio ${ratio} read ${expected} kB and the model says ${got} kB`);
  }

  /* The default here is half the machine, and that is the whole surface. */
  if (limitPercentOfRam(measured) !== 50) {
    fail(`measured: the default limit is 50 percent of RAM and the model says ${limitPercentOfRam(measured)}`);
  }

  /* 48.6 against the limit, 24.3 against the hardware. */
  if (committedPercentOfLimit(measured) !== 49) {
    fail(`measured: Committed_AS is 48.6 percent of the limit and the model rounds to ${committedPercentOfLimit(measured)}`);
  }
  if (committedPercentOfRam(measured) !== 24) {
    fail(`measured: Committed_AS is 24.3 percent of RAM and the model rounds to ${committedPercentOfRam(measured)}`);
  }

  /* 4.04 GiB of headroom against 13.92 GiB free, which is the trap. */
  if (human(headroomKb(measured)) !== "4.04 GiB") {
    fail(`measured: headroom was 4.04 GiB and the model renders ${human(headroomKb(measured))}`);
  }
  if (human(measured.availableKb) !== "13.9 GiB") {
    fail(`measured: MemAvailable renders as ${human(measured.availableKb)}`);
  }

  /* Mode 0 refuses nothing, and the same request in mode 2 is refused. */
  const big = { ...measured, wantKb: 5_242_880 };
  if (refuses(big)) fail(`measured: the host is mode 0 and the model refused a 5 GiB request`);
  if (!refuses({ ...big, mode: 2 })) fail(`measured: 5 GiB against 4.04 GiB of headroom should be refused in mode 2`);
  if (!refusesWithMemoryFree({ ...big, mode: 2 })) {
    fail(`measured: that refusal happens with 13.92 GiB free, which is the point of the surface`);
  }
  if (oomPossible(measured)) fail(`measured: a limit of half the machine cannot exceed the machine`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-overcommit: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} overcommit cases: CommitLimit counted in pages agrees with the model at all 301 ratios, ` +
    `swap is added whole and overcommit_kbytes makes the ratio inert, refusal happens in strict mode alone and ` +
    `exactly one kilobyte past the limit, and the five measured ratios, the 48.6 against 24.3 percent split and ` +
    `the 4.04 GiB of headroom under 13.92 GiB of free memory all reproduce.`,
);
