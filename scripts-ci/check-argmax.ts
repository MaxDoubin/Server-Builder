/**
 * The exec budget set, checked by laying the vector out string by string.
 *
 * The model multiplies a count by a per-argument cost, which is the right
 * shape for a page and the wrong shape for a check: the whole subject is that
 * the cost of an argument is not its length, and a multiplication can carry
 * the wrong per-argument figure and still look self-consistent everywhere.
 *
 * So the gate below builds the vector. It walks every string the kernel would
 * copy, in the order it would copy them, adding the string, its terminator and
 * its pointer one at a time, and it appends the program path a second time
 * because execve does. The totals fall out of the walk.
 *
 * The fixtures at the bottom are twenty three measurements taken on the host
 * this was written on, and the formula reproduces every one of them exactly.
 */
import { CASES } from "../client/src/lib/argmax/data/cases";
import {
  MAX_ARG_STRLEN,
  POINTER,
  aStringIsTooLong,
  argvCost,
  asLimits,
  budget,
  claimHolds,
  correctOption,
  costPerArg,
  envCost,
  fits,
  headroom,
  humanBytes,
  maxArgs,
  pointerShare,
  programCost,
  refusedBy,
  textBytes,
  totalCost,
  withinBudget,
} from "../client/src/lib/argmax/model";
import type { Setup } from "../client/src/lib/argmax/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------- the vector, laid out in full */

/**
 * Every string the kernel copies, in the order it copies it.
 *
 * execve copies bprm->filename first, then the environment, then argv, which
 * begins with the program path again. Each string costs its own bytes, a NUL
 * and a pointer, except the filename copy, which is not part of either vector
 * and so carries no pointer of its own.
 */
function layOutVector(setup: Setup): { bytes: number; strings: number } {
  let bytes = 0;
  let strings = 0;

  /* bprm->filename, copied in its own right. No pointer: it is not in a vector. */
  bytes += setup.programBytes + 1;
  strings += 1;

  /* envp, one variable at a time. envBytes already counts NAME, = and the NUL. */
  let envSeen = 0;
  for (let i = 0; i < setup.envCount; i += 1) {
    bytes += POINTER;
    envSeen += 1;
  }
  bytes += setup.envBytes;
  strings += envSeen;

  /* argv[0], the path again, this time as part of the vector. */
  bytes += POINTER + setup.programBytes + 1;
  strings += 1;

  /* and then the arguments. */
  for (let i = 0; i < setup.argCount; i += 1) {
    bytes += POINTER + setup.argBytes + 1;
    strings += 1;
  }

  return { bytes, strings };
}

for (const c of CASES) {
  const laid = layOutVector(c.setup);

  if (laid.bytes !== totalCost(c.setup)) {
    fail(`${c.slug}: laying the vector out costs ${laid.bytes} and totalCost says ${totalCost(c.setup)}`);
  }
  if (laid.strings !== c.setup.argCount + c.setup.envCount + 2) {
    fail(`${c.slug}: the vector holds ${laid.strings} strings and it should hold argv, envp, and the path twice`);
  }
  if (budget(c.setup) !== Math.floor(c.setup.stackBytes / 4)) {
    fail(`${c.slug}: the budget is not a quarter of the stack`);
  }
  if (headroom(c.setup) !== budget(c.setup) - laid.bytes) {
    fail(`${c.slug}: headroom disagrees with the laid out vector`);
  }
  if (withinBudget(c.setup) !== laid.bytes <= budget(c.setup)) {
    fail(`${c.slug}: withinBudget disagrees with the laid out vector`);
  }
  if (fits(c.setup) !== (laid.bytes <= budget(c.setup) && c.setup.longestStringBytes < MAX_ARG_STRLEN)) {
    fail(`${c.slug}: fits disagrees with the two limits taken together`);
  }
  if (argvCost(c.setup) + envCost(c.setup) !== laid.bytes) {
    fail(`${c.slug}: argv and envp do not add up to the whole vector`);
  }

  /*
    The wall, found by adding one argument at a time rather than dividing.
    Slow on purpose: dividing is what the model does.
  */
  const wall = (() => {
    let spent = layOutVector({ ...c.setup, argCount: 0 }).bytes;
    let n = 0;
    const each = POINTER + c.setup.argBytes + 1;
    const room = budget(c.setup);
    if (spent > room) return 0;
    while (spent + each <= room && n < 1_000_000) {
      spent += each;
      n += 1;
    }
    return n;
  })();
  if (wall !== maxArgs(c.setup)) {
    fail(`${c.slug}: adding arguments one at a time fits ${wall} and maxArgs says ${maxArgs(c.setup)}`);
  }
  /* And the vector at the wall really does leave less than one more argument. */
  const atWall = { ...c.setup, argCount: wall };
  if (wall > 0) {
    if (!withinBudget(atWall)) fail(`${c.slug}: the vector at the wall does not fit`);
    const over = { ...c.setup, argCount: wall + 1 };
    if (withinBudget(over)) fail(`${c.slug}: one more argument than the wall still fits`);
    if (headroom(atWall) >= costPerArg(c.setup)) {
      fail(`${c.slug}: ${headroom(atWall)} bytes spare at the wall, which is a whole argument of ${costPerArg(c.setup)}`);
    }
  }

  if (textBytes(c.setup) !== maxArgs(c.setup) * c.setup.argBytes) {
    fail(`${c.slug}: textBytes is not the arguments that fit times their length`);
  }
  if (costPerArg(c.setup) !== POINTER + c.setup.argBytes + 1) {
    fail(`${c.slug}: costPerArg is not pointer, bytes and terminator`);
  }
  if (programCost(c.setup) !== 2 * c.setup.programBytes + POINTER + 2) {
    fail(`${c.slug}: the program path is not charged twice`);
  }
  if (aStringIsTooLong(c.setup) !== c.setup.longestStringBytes >= MAX_ARG_STRLEN) {
    fail(`${c.slug}: the per-string cap disagrees with the longest string`);
  }

  /* Only one of the two limits may bite, so the order in refusedBy never decides. */
  const bitten = [!withinBudget(c.setup), aStringIsTooLong(c.setup)].filter(Boolean).length;
  if (bitten > 1) fail(`${c.slug}: both limits bite at once, so the order of the checks decides the answer`);
  if ((refusedBy(c.setup) === "nothing") !== fits(c.setup)) {
    fail(`${c.slug}: refusedBy says "${refusedBy(c.setup)}" and fits says ${fits(c.setup)}`);
  }

  /* A count of arguments is meaningless once one string is over the cap. */
  if (aStringIsTooLong(c.setup) && c.options.some((o) => o.says.about === "maxArgs" || o.says.about === "textBytes")) {
    fail(`${c.slug}: asks how many fit while one string is already over the per-string cap`);
  }

  if (c.setup.longestStringBytes < c.setup.argBytes) {
    fail(`${c.slug}: the longest string is shorter than the arguments`);
  }
  if (c.setup.argCount > 0 && c.setup.longestStringBytes < c.setup.argBytes) {
    fail(`${c.slug}: the longest string cannot be under an argument's length`);
  }
}

/* ------------------------------------- the budget follows the stack limit */

{
  const base: Setup = { ...CASES[0].setup, argBytes: 64, argCount: 0, envCount: 1, envBytes: 4, programBytes: 9, longestStringBytes: 64 };
  let previous = 0;
  for (const mib of [1, 2, 4, 8, 16, 32, 64]) {
    const s: Setup = { ...base, stackBytes: mib * 1024 * 1024 };
    if (budget(s) !== (mib * 1024 * 1024) / 4) fail(`stack: ${mib} MiB gave a budget of ${budget(s)}`);
    const n = maxArgs(s);
    if (n <= previous) fail(`stack: ${mib} MiB fitted ${n} arguments, no more than the ${previous} of half the stack`);
    /* Doubling the stack doubles what fits, to within one argument. */
    if (previous > 0 && Math.abs(n - 2 * previous) > 2) {
      fail(`stack: ${mib} MiB fitted ${n} and twice ${previous} is ${2 * previous}`);
    }
    previous = n;
  }
}

/* ------------------------------- the environment comes out of the same budget */

{
  const base: Setup = { ...CASES[0].setup, argCount: 0, argBytes: 64, programBytes: 9, longestStringBytes: 64 };
  let previous = Infinity;
  for (const [count, bytes] of [[1, 4], [10, 5_000], [50, 100_000], [100, 1_000_000]] as const) {
    const s: Setup = { ...base, envCount: count, envBytes: bytes };
    const n = maxArgs(s);
    if (n >= previous) fail(`env: ${bytes} bytes of environment fitted ${n} arguments, no fewer than a smaller one`);
    if (envCost(s) !== bytes + count * POINTER) fail(`env: the environment costs its strings and a pointer each`);
    previous = n;
  }
  /* An environment past the budget leaves nothing at all, rather than a negative. */
  const drowned: Setup = { ...base, envCount: 1, envBytes: 4_000_000 };
  if (maxArgs(drowned) !== 0) fail(`env: an oversized environment left room for ${maxArgs(drowned)} arguments`);
  if (withinBudget({ ...drowned, argCount: 0 })) fail(`env: an oversized environment fitted anyway`);
}

/* -------------------------------------- the pointer is the whole point */

{
  const base: Setup = { ...CASES[0].setup, argCount: 0, programBytes: 9, envCount: 1, envBytes: 4 };
  /* Short arguments spend most of the budget on pointers; long ones almost none. */
  const short = { ...base, argBytes: 1, longestStringBytes: 1 };
  const long = { ...base, argBytes: 4096, longestStringBytes: 4096 };
  if (pointerShare(short) < 70) fail(`pointer: a one byte argument is only ${pointerShare(short)} percent pointer`);
  if (pointerShare(long) > 1) fail(`pointer: a four kilobyte argument is ${pointerShare(long)} percent pointer`);
  /* And the text a budget carries falls as the arguments get shorter. */
  let previous = 0;
  for (const bytes of [1, 8, 64, 1024, 4096]) {
    const here = textBytes({ ...base, argBytes: bytes, longestStringBytes: bytes });
    if (here <= previous) fail(`pointer: ${bytes} byte arguments carried ${here} bytes of text, no more than shorter ones`);
    previous = here;
  }
}

/* ----------------------------------------------- the per-string cap */

{
  const base: Setup = { ...CASES[0].setup, argCount: 1, programBytes: 9, envCount: 1, envBytes: 4 };
  if (MAX_ARG_STRLEN !== 131_072) fail(`the per-string cap is ${MAX_ARG_STRLEN} and 32 pages is 131072`);
  if (aStringIsTooLong({ ...base, argBytes: 131_071, longestStringBytes: 131_071 })) {
    fail(`cap: 131071 bytes was refused and it execs`);
  }
  if (!aStringIsTooLong({ ...base, argBytes: 131_072, longestStringBytes: 131_072 })) {
    fail(`cap: 131072 bytes was allowed and it does not exec`);
  }
  /* It bites whatever the total is, which is the whole difference between the two limits. */
  const tiny: Setup = { ...base, argCount: 1, argBytes: 200_000, longestStringBytes: 200_000, stackBytes: 1024 * 1024 * 1024 };
  if (withinBudget(tiny) !== true) fail(`cap: the oversized single argument should be well inside a huge budget`);
  if (fits(tiny)) fail(`cap: a 200 KB argument fitted because the budget was large`);
  if (refusedBy(tiny) !== "MAX_ARG_STRLEN, one string of 32 pages or more") {
    fail(`cap: the oversized argument was refused by "${refusedBy(tiny)}"`);
  }

  /*
    When BOTH limits bite, which one gets named is a choice this model makes
    and not a fact about the kernel: from userspace the two are the same
    errno, E2BIG, and nothing distinguishes them. The model names the string
    cap because it is the more specific diagnosis and the more actionable one,
    and no case in the set is ever in that position, which the loop above
    enforces. So these two lines are the only thing holding the choice, and a
    blinding that swapped the order went unnoticed until they were here.
  */
  const both: Setup = { ...base, argCount: 200, argBytes: 200_000, longestStringBytes: 200_000, stackBytes: 1024 * 1024 };
  if (withinBudget(both)) fail(`cap: the both-limits fixture is inside its budget`);
  if (!aStringIsTooLong(both)) fail(`cap: the both-limits fixture has no oversized string`);
  if (refusedBy(both) !== "MAX_ARG_STRLEN, one string of 32 pages or more") {
    fail(`cap: with both limits broken the model names "${refusedBy(both)}" and it names the string cap`);
  }
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const seenSetups = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const shape = JSON.stringify(c.setup);
  if (seenSetups.has(shape)) fail(`${c.slug}: another case has exactly this setup`);
  seenSetups.add(shape);
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

  const numeric = (about: string) =>
    about === "budget" || about === "costPerArg" || about === "programCost" || about === "maxArgs" || about === "textBytes";

  const numbers = c.options
    .map((o) => (numeric(o.says.about) && "value" in o.says ? `${o.says.about}:${o.says.value}` : null))
    .filter((v): v is string => v !== null);
  if (new Set(numbers).size !== numbers.length) fail(`${c.slug}: two options claim the same figure`);

  const opening = c.options
    .map((o) => o.claim.match(/^([\d,]+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1].replace(/,/g, "")));
  if (new Set(opening).size !== opening.length) fail(`${c.slug}: two options open with the same number`);

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked = numeric(o.says.about) && "value" in o.says ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole bytes`);
    if (typeof v === "number" && v < 0) fail(`${c.slug}: ${k} is negative`);
  }
  if (c.setup.stackBytes < 1024 * 1024) fail(`${c.slug}: a stack limit of ${c.setup.stackBytes} is outside anything measured`);
  if (c.setup.programBytes < 1) fail(`${c.slug}: the program has no path`);

  const lines = asLimits(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asLimits rendered ${lines.length} lines and there are six figures`);
  if (!lines.some((l) => /NOT a constant/.test(l.unit))) {
    fail(`${c.slug}: asLimits does not say that ARG_MAX follows the stack limit`);
  }
  if (!lines.some((l) => /SAME budget/.test(l.unit))) {
    fail(`${c.slug}: asLimits does not say that the environment shares the budget`);
  }
  if (!lines.some((l) => /of pointer/.test(l.unit))) {
    fail(`${c.slug}: asLimits does not break an argument down into text, terminator and pointer`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

{
  if (humanBytes(512) !== "512 B") fail(`humanBytes(512) is "${humanBytes(512)}"`);
  if (humanBytes(8 * 1024 * 1024) !== "8.00 MiB") fail(`humanBytes(8 MiB) is "${humanBytes(8 * 1024 * 1024)}"`);
  if (humanBytes(7598) !== "7.4 KiB") fail(`humanBytes(7598) is "${humanBytes(7598)}"`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Twenty three runs on the host this was written on, kernel 6.18.44, by
  execing /bin/true with a bisected argument count and reading errno. Seven
  argument sizes, three environments spanning a megabyte, four stack limits
  spanning eight times, four lengths of argv[0], and the per-string cap
  bisected to the byte at 131071 passing and 131072 failing.
*/
{
  const MiB = 1024 * 1024;
  const inherited = { envCount: 140, envBytes: 7598 };
  const bare = { envCount: 1, envBytes: 4 };
  const base: Setup = {
    host: "the host these came from",
    stackBytes: 8 * MiB,
    argCount: 0,
    argBytes: 64,
    programBytes: 9,
    ...inherited,
    longestStringBytes: 64,
  };

  const measured: [string, Partial<Setup>, number][] = [
    ["1 byte arguments", { argBytes: 1, longestStringBytes: 1 }, 208_840],
    ["2 byte arguments", { argBytes: 2, longestStringBytes: 2 }, 189_855],
    ["3 byte arguments", { argBytes: 3, longestStringBytes: 3 }, 174_033],
    ["8 byte arguments", { argBytes: 8, longestStringBytes: 8 }, 122_847],
    ["64 byte arguments", { argBytes: 64 }, 28_608],
    ["1024 byte arguments", { argBytes: 1024, longestStringBytes: 1024 }, 2_021],
    ["16384 byte arguments", { argBytes: 16_384, longestStringBytes: 16_384 }, 127],
    ["a two variable environment", { envCount: 2, envBytes: 28 }, 28_727],
    ["500 KB of environment", { envCount: 11, envBytes: 500_074 }, 21_876],
    ["a megabyte of environment", { envCount: 21, envBytes: 1_000_144 }, 15_024],
    ["a 2 MiB stack", { stackBytes: 2 * MiB, envCount: 2, envBytes: 28 }, 7_181],
    ["a 4 MiB stack", { stackBytes: 4 * MiB, envCount: 2, envBytes: 28 }, 14_363],
    ["a 16 MiB stack", { stackBytes: 16 * MiB, envCount: 2, envBytes: 28 }, 57_455],
    ["8 byte arguments, one variable", { argBytes: 8, longestStringBytes: 8, ...bare }, 123_359],
    ["1 byte arguments, one variable", { argBytes: 1, longestStringBytes: 1, ...bare }, 209_711],
    ["2 byte arguments, one variable", { argBytes: 2, longestStringBytes: 2, ...bare }, 190_646],
    ["3 byte arguments, one variable", { argBytes: 3, longestStringBytes: 3, ...bare }, 174_759],
    ["5 byte arguments, one variable", { argBytes: 5, longestStringBytes: 5, ...bare }, 149_793],
    ["13 byte arguments, one variable", { argBytes: 13, longestStringBytes: 13, ...bare }, 95_323],
    ["argv[0] of 100 bytes", { argBytes: 8, longestStringBytes: 100, programBytes: 100, ...bare }, 123_348],
    ["argv[0] of 175 bytes", { argBytes: 8, longestStringBytes: 175, programBytes: 175, ...bare }, 123_340],
    ["argv[0] of 250 bytes", { argBytes: 8, longestStringBytes: 250, programBytes: 250, ...bare }, 123_331],
    ["argv[0] of 350 bytes", { argBytes: 8, longestStringBytes: 350, programBytes: 350, ...bare }, 123_319],
  ];

  if (measured.length !== 23) fail(`the fixtures hold ${measured.length} runs and 23 were taken`);

  let onTheWall = 0;
  for (const [label, over, count] of measured) {
    const s: Setup = { ...base, ...over };
    if (maxArgs(s) !== count) {
      fail(`measured: ${label} fitted ${count} arguments and the model says ${maxArgs(s)}`);
      continue;
    }
    /* Every run sat on the wall: one more argument would not have fitted. */
    const at = { ...s, argCount: count };
    if (!withinBudget(at)) fail(`measured: ${label} at ${count} does not fit`);
    if (withinBudget({ ...s, argCount: count + 1 })) fail(`measured: ${label} had room for one more`);
    if (headroom(at) < costPerArg(s)) onTheWall += 1;
  }
  if (onTheWall !== measured.length) {
    fail(`measured: only ${onTheWall} of ${measured.length} runs left under one argument of slack`);
  }

  /* The one that landed exactly on the budget, to the byte. */
  const exact: Setup = { ...base, ...bare, argBytes: 8, longestStringBytes: 175, programBytes: 175, argCount: 123_340 };
  if (headroom(exact) !== 0) {
    fail(`measured: the 175 byte argv[0] run left ${headroom(exact)} bytes and it landed exactly on the budget`);
  }
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-argmax: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} exec budget cases: the vector laid out string by string agrees with the model on every case, ` +
    `the wall found by adding one argument at a time agrees with dividing, doubling the stack doubles what fits, ` +
    `a bigger environment leaves less room every time, and all 23 measured runs reproduce exactly, each leaving ` +
    `under one argument of slack and one of them landing on the budget to the byte.`,
);
