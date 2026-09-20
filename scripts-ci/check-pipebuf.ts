/**
 * The atomic write set, checked by running the writers rather than by asking
 * whether a number is under four thousand and ninety six.
 *
 * The model is three conditions in a row and that is the right shape for a
 * page. It is the wrong shape for a check, because the interesting property is
 * not the guarantee, which is easy; it is the SECOND rule, that records
 * dividing the capacity are safe by arithmetic rather than by promise, and
 * that any writer with a different size destroys it. A condition can encode
 * that backwards and still look right on every uniform case.
 *
 * So the gate below simulates the pipe. It fills it record by record, round
 * robin between the writers, and a record is torn when the space left is less
 * than the record and more than nothing: the writer gets part of it in and
 * blocks. Whether a writer can tear falls out of running it.
 *
 * The fixtures at the bottom were measured on the host this was written on,
 * with a detector that took three attempts; the first two both appeared to
 * show the POSIX guarantee being violated and both were wrong.
 */
import { CASES } from "../client/src/lib/pipebuf/data/cases";
import {
  DEFAULT_CAPACITY,
  PIPE_BUF,
  PIPE_MAX_SIZE,
  alignsWithCapacity,
  asSetup,
  atRisk,
  because,
  claimHolds,
  correctOption,
  granted,
  guaranteed,
  humanSize,
  recordsAtRisk,
  refused,
  tears,
  tearsHere,
  uniform,
} from "../client/src/lib/pipebuf/model";
import type { Setup } from "../client/src/lib/pipebuf/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------- the pipe, filled record by record */

/**
 * Run the writers against a pipe and see whose records get split.
 *
 * A writer offers a whole record. If it fits, it goes in. If the pipe is full,
 * the writer waits and the reader drains it. If it PART fits, that is the
 * interesting case: the writer gets some bytes in and blocks holding the rest,
 * and anybody who writes next lands in the middle of it. A write at or under
 * PIPE_BUF never part fits, because the kernel refuses to split one.
 */
function simulate(setup: Setup, rounds = 4000): Set<number> {
  const torn = new Set<number>();
  if (setup.target === "file") return torn;

  /*
    Bytes stream through the pipe and the reader takes them out at the other
    end, so the place a writer can be interrupted comes round every `capacity`
    bytes. Track how far into the current capacity the stream has got. A record
    that straddles that boundary is the one that gets split, because the writer
    fills the pipe, blocks, and whoever writes next lands inside it.

    Except at or under PIPE_BUF, where the kernel refuses to split a write at
    all: it waits for the boundary to pass and puts the whole record in after
    it. That one rule is the entire guarantee.
  */
  /*
    The order the writers get the pipe matters, and it must not be a strict
    rotation. With four writers at 8193 on a 65536 pipe the boundary comes
    round every 7.998 records, which in a strict rotation lands on the same
    writer every single time, so three of the four look safe. They are not:
    the real run tore all four, because the scheduler does not take turns.
    A seeded generator stands in for it, so the result is deterministic
    without being regular.
  */
  let seed = 0x2545f491;
  const nextWriter = () => {
    /* xorshift32, and the index comes off the HIGH bits. The low bits of a
       linear congruential generator have a period of four, which is another
       perfect rotation and made three of four writers look safe again. */
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed |= 0;
    return ((seed >>> 16) & 0x7fff) % setup.writers.length;
  };

  let offset = 0;
  for (let round = 0; round < rounds; round += 1) {
    for (let turn = 0; turn < setup.writers.length; turn += 1) {
      const w = nextWriter();
      const size = setup.writers[w];
      const straddles = offset !== 0 && offset + size > setup.capacity;
      if (!straddles) {
        offset = (offset + size) % setup.capacity;
      } else if (size <= PIPE_BUF) {
        offset = size % setup.capacity;
      } else {
        torn.add(w);
        offset = (offset + size - setup.capacity) % setup.capacity;
      }
    }
  }
  return torn;
}


for (const c of CASES) {
  const ran = simulate(c.setup);

  for (let w = 0; w < c.setup.writers.length; w += 1) {
    if (ran.has(w) !== tears(c.setup, w)) {
      fail(`${c.slug}: writer ${w} at ${c.setup.writers[w]} ${ran.has(w) ? "tore" : "did not tear"} in the run and tears() says ${tears(c.setup, w)}`);
    }
    /* The guarantee is absolute: a write at or under PIPE_BUF never tears,
       whatever anyone else on the pipe is doing. */
    if (c.setup.writers[w] <= PIPE_BUF && ran.has(w)) {
      fail(`${c.slug}: writer ${w} at ${c.setup.writers[w]} tore, and PIPE_BUF is ${PIPE_BUF}`);
    }
  }

  if (atRisk(c.setup) !== c.setup.writers.filter((_, w) => tears(c.setup, w)).length) {
    fail(`${c.slug}: atRisk does not count the writers that tear`);
  }
  if (c.setup.target === "pipe" && ran.size !== atRisk(c.setup)) {
    fail(`${c.slug}: the run tore ${ran.size} writers and atRisk says ${atRisk(c.setup)}`);
  }
  if (tearsHere(c.setup) !== tears(c.setup, c.setup.underTest)) {
    fail(`${c.slug}: tearsHere is not about the writer under test`);
  }
  if (recordsAtRisk(c.setup) !== (tearsHere(c.setup) ? c.setup.records : 0)) {
    fail(`${c.slug}: recordsAtRisk disagrees with whether this writer tears`);
  }
  if (guaranteed(c.setup.writers[c.setup.underTest]) !== c.setup.writers[c.setup.underTest] <= PIPE_BUF) {
    fail(`${c.slug}: guaranteed() is not simply "at or under PIPE_BUF"`);
  }
  if (uniform(c.setup) !== (new Set(c.setup.writers).size === 1)) {
    fail(`${c.slug}: uniform() disagrees with whether the sizes are all the same`);
  }

  /* because() and tears() must never disagree about the outcome. */
  const safe = because(c.setup) !== "over PIPE_BUF with nothing to align it, so it tears";
  if (safe === tearsHere(c.setup)) {
    fail(`${c.slug}: because() says "${because(c.setup)}" and tears says ${tearsHere(c.setup)}`);
  }

  /* The capacity has to be something F_SETPIPE_SZ would actually give, unless
     the request was refused, in which case the pipe keeps what it had. */
  if (c.setup.target === "pipe" && !refused(c.setup.requested) && c.setup.capacity !== granted(c.setup.requested)) {
    fail(`${c.slug}: asked for ${c.setup.requested}, which grants ${granted(c.setup.requested)}, and the capacity is ${c.setup.capacity}`);
  }
  if (c.setup.underTest < 0 || c.setup.underTest >= c.setup.writers.length) {
    fail(`${c.slug}: the writer under test is not one of the writers`);
  }
  if (c.setup.writers.length < 2) fail(`${c.slug}: interleaving needs at least two writers`);
}

/* ------------------------- the guarantee, against everything that could break it */

{
  const base: Setup = { ...CASES[0].setup, target: "pipe", requested: DEFAULT_CAPACITY, capacity: DEFAULT_CAPACITY };
  let rows = 0;
  let tornRows = 0;
  for (const mine of [1, 512, 4095, 4096]) {
    for (const others of [[4096], [4097], [5000], [8192], [20_000], [200_000], [4096, 20_000], [5000, 8192, 65_536]]) {
      for (const capacity of [4096, 8192, 65_536, 131_072]) {
        const s: Setup = { ...base, capacity, requested: capacity, writers: [mine, ...others], underTest: 0 };
        rows += 1;
        if (tears(s, 0)) {
          fail(`guarantee: ${mine} bytes tore next to ${others.join(",")} on a ${capacity} pipe`);
        }
        if (simulate(s).has(0)) {
          fail(`guarantee: the run tore ${mine} bytes next to ${others.join(",")}`);
        }
        if (atRisk(s) > 0) tornRows += 1;
      }
    }
  }
  if (rows < 100) fail(`guarantee: only ${rows} rows`);
  if (tornRows < 50) fail(`guarantee: only ${tornRows} rows had anyone at risk, which is too few to be checking anything`);
}

/* ------------------- and the alignment, which is not a guarantee at all */

{
  const base: Setup = { ...CASES[0].setup, target: "pipe", requested: DEFAULT_CAPACITY, capacity: DEFAULT_CAPACITY, underTest: 0 };
  /* Uniform and dividing: safe. Uniform and not dividing: torn. */
  for (const size of [8192, 16_384, 32_768]) {
    const aligned: Setup = { ...base, writers: [size, size, size, size] };
    if (!alignsWithCapacity(aligned)) fail(`align: ${size} divides 65536 and alignsWithCapacity says otherwise`);
    if (tears(aligned, 0)) fail(`align: four writers at ${size} tore`);
    if (simulate(aligned).size !== 0) fail(`align: the run tore four writers at ${size}`);
  }
  for (const size of [4097, 5000, 8193, 12_288, 20_000]) {
    const skewed: Setup = { ...base, writers: [size, size, size, size] };
    if (alignsWithCapacity(skewed)) fail(`align: ${size} does not divide 65536 and alignsWithCapacity says it does`);
    if (!tears(skewed, 0)) fail(`align: four writers at ${size} did not tear`);
    if (!simulate(skewed).has(0)) fail(`align: the run did not tear four writers at ${size}`);
  }

  /*
    The point of the whole surface: that safety is arithmetic, and one writer
    with any other size removes it from EVERYBODY, including writers that did
    not change. A condition that treated alignment as a property of a writer
    rather than of the whole pipe passes every uniform case above and fails
    here.
  */
  for (const size of [8192, 16_384, 32_768]) {
    for (const intruder of [5000, 4097, 12_288, 20_000]) {
      const spoiled: Setup = { ...base, writers: [size, size, size, intruder] };
      if (alignsWithCapacity(spoiled)) fail(`align: ${size} writers with a ${intruder} writer still counted as aligned`);
      if (!tears(spoiled, 0)) fail(`align: a ${intruder} writer did not break the ${size} writers`);
      if (atRisk(spoiled) !== 4) fail(`align: ${atRisk(spoiled)} of four at risk with a ${intruder} writer, and all four are over PIPE_BUF`);
      /* But a small intruder takes nobody with it, because it cannot be split. */
      const harmless: Setup = { ...base, writers: [size, size, size, 4096] };
      if (alignsWithCapacity(harmless)) fail(`align: a 4096 writer among ${size} writers counted as aligned`);
      if (!tears(harmless, 0)) fail(`align: the ${size} writers survived a 4096 intruder, and alignment is gone either way`);
      if (tears(harmless, 3)) fail(`align: the 4096 writer tore`);
      if (atRisk(harmless) !== 3) fail(`align: ${atRisk(harmless)} at risk and the 4096 writer is not one of them`);
    }
  }
}

/* --------------------------------------- a file is not a pipe, and why */

{
  const base: Setup = { ...CASES[0].setup, requested: DEFAULT_CAPACITY, capacity: DEFAULT_CAPACITY, underTest: 0 };
  for (const writers of [[512, 200_000], [4096, 4096], [20_000, 20_000, 5000], [8193, 8193]]) {
    const onAFile: Setup = { ...base, target: "file", writers };
    const onAPipe: Setup = { ...base, target: "pipe", writers };
    if (atRisk(onAFile) !== 0) fail(`file: ${writers.join(",")} on a file put ${atRisk(onAFile)} at risk`);
    if (simulate(onAFile).size !== 0) fail(`file: the run tore something on a file`);
    if (because(onAFile) !== "a file, where writes did not interleave here") {
      fail(`file: the reason given is "${because(onAFile)}"`);
    }
    /* And the same writers on a pipe are not all safe, or the contrast is empty. */
    if (writers.some((w) => w > PIPE_BUF) && atRisk(onAPipe) === 0 && !alignsWithCapacity(onAPipe)) {
      fail(`file: ${writers.join(",")} was safe on a pipe too, so the pair proves nothing`);
    }
  }
}

/* ------------------------------------ what F_SETPIPE_SZ actually grants */

{
  for (const [ask, get] of [[1, 4096], [4095, 4096], [4096, 4096], [4097, 8192], [8192, 8192], [40_000, 65_536], [61_440, 65_536], [65_536, 65_536], [65_537, 131_072], [1_048_576, 1_048_576]] as const) {
    if (granted(ask) !== get) fail(`resize: asking for ${ask} granted ${granted(ask)} and ${get} was measured`);
    if (refused(ask)) fail(`resize: ${ask} was refused and it is granted`);
  }
  if (granted(PIPE_MAX_SIZE + 1) !== 0) fail(`resize: one byte over pipe-max-size was granted ${granted(PIPE_MAX_SIZE + 1)}`);
  if (!refused(2_097_152)) fail(`resize: two megabytes was not refused`);
  if (PIPE_MAX_SIZE !== 1_048_576) fail(`resize: pipe-max-size is ${PIPE_MAX_SIZE} and 1048576 was measured`);
  /* Every granted size is a power of two, which is the rule underneath. */
  for (let ask = 1; ask <= 200_000; ask += 997) {
    const got = granted(ask);
    if (got === 0) fail(`resize: ${ask} was refused and it is under pipe-max-size`);
    if ((got & (got - 1)) !== 0) fail(`resize: ${ask} granted ${got}, which is not a power of two`);
    if (got < ask) fail(`resize: ${ask} granted ${got}, which is smaller`);
    if (got / 2 >= ask && got > PIPE_BUF) fail(`resize: ${ask} granted ${got} and half of that would have done`);
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

  const numbers = c.options
    .map((o) => (o.says.about === "atRisk" || o.says.about === "granted" ? `${o.says.about}:${o.says.value}` : null))
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
    const checked = o.says.about === "atRisk" || o.says.about === "granted" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole bytes`);
    if (typeof v === "number" && v < 0) fail(`${c.slug}: ${k} is negative`);
  }
  for (const size of c.setup.writers) {
    if (!Number.isInteger(size) || size < 1) fail(`${c.slug}: a writer sending ${size} bytes`);
  }
  if (c.setup.records < 1) fail(`${c.slug}: nobody writes anything`);

  const lines = asSetup(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asSetup rendered ${lines.length} lines and there are six figures`);
  if (!lines.some((l) => /NEVER interleaved/.test(l.unit))) {
    fail(`${c.slug}: asSetup does not state the guarantee`);
  }
  if (!lines.some((l) => /never fills mid record/.test(l.unit))) {
    fail(`${c.slug}: asSetup does not give the reader the capacity over record figure`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* All four reasons have to appear, or the set teaches one of them. */
{
  const reasons = new Set(CASES.map((c) => because(c.setup)));
  for (const wanted of [
    "at or under PIPE_BUF, which is guaranteed",
    "the records divide the capacity, which is luck",
    "over PIPE_BUF with nothing to align it, so it tears",
    "a file, where writes did not interleave here",
  ]) {
    if (!reasons.has(wanted)) fail(`no case ends in "${wanted}", and the four are the whole subject`);
  }
  if (!CASES.some((c) => c.setup.target === "file")) fail(`no case writes to a file`);
  if (!CASES.some((c) => refused(c.setup.requested))) fail(`no case has a resize that was refused`);
}

{
  if (humanSize(4096) !== "4 KiB") fail(`humanSize(4096) is "${humanSize(4096)}"`);
  if (humanSize(5000) !== "5000 B") fail(`humanSize(5000) is "${humanSize(5000)}"`);
  if (humanSize(512) !== "512 B") fail(`humanSize(512) is "${humanSize(512)}"`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Measured on the host this was written on, kernel 6.18.44, four writers on one
  pipe of 65536, 200 records each, three runs per configuration. Torn records
  counted as maximal runs of one writer's character in the raw stream, which is
  the only detector of the three tried that another writer's torn record
  cannot fool.

    size 4096   0, 0, 0        divides 65536
    size 4097   84, 81, 76
    size 5000   103, 78, 72
    size 8192   0, 0, 0        divides 65536
    size 8193   125, 125, 139
    size 12288  146, 136, 132
    size 16384  0, 0, 0        divides 65536
    size 20000  354, 311, 354
    size 32768  0, 0, 0        divides 65536

    three at 4096 with one at 5000   the 4096 writers: 200 of 200, every run
    two at 4096 with two at 20000    the 4096 writers: 200 of 200, every run
    one at 512 with three at 20000   the 512 writer:   200 of 200, every run
    three at 8192 with one at 5000   the 8192 writers lost 6, 6 and 14

    on a file, O_APPEND, two at 512 and two at 200000: every writer 200 of 200
*/
{
  const base: Setup = {
    host: "the host these came from",
    target: "pipe",
    requested: 65_536,
    capacity: 65_536,
    writers: [4096, 4096, 4096, 4096],
    underTest: 0,
    records: 200,
  };

  for (const [size, torn] of [[4096, false], [4097, true], [5000, true], [8192, false], [8193, true], [12_288, true], [16_384, false], [20_000, true], [32_768, false]] as const) {
    const s: Setup = { ...base, writers: [size, size, size, size] };
    if (tears(s, 0) !== torn) {
      fail(`measured: four writers at ${size} ${torn ? "tore" : "did not tear"} and the model says ${tears(s, 0)}`);
    }
  }

  /* The guarantee held in every mixed run. */
  for (const writers of [[4096, 4096, 4096, 5000], [4096, 4096, 20_000, 20_000], [512, 20_000, 20_000, 20_000]] as const) {
    const s: Setup = { ...base, writers: [...writers] };
    for (let w = 0; w < writers.length; w += 1) {
      if (writers[w] <= PIPE_BUF && tears(s, w)) {
        fail(`measured: the ${writers[w]} byte writer came out whole 200 of 200 and the model tears it`);
      }
      if (writers[w] > PIPE_BUF && !tears(s, w)) {
        fail(`measured: the ${writers[w]} byte writer lost records and the model keeps it whole`);
      }
    }
  }

  /* The 8192 writers, before and after the sidecar. */
  const clean: Setup = { ...base, writers: [8192, 8192, 8192, 8192] };
  const spoiled: Setup = { ...base, writers: [8192, 8192, 8192, 5000] };
  if (tears(clean, 0)) fail(`measured: four writers at 8192 tore nothing and the model tears them`);
  if (!tears(spoiled, 0)) fail(`measured: adding a 5000 byte writer made the 8192 writers lose records`);
  if (atRisk(clean) !== 0) fail(`measured: ${atRisk(clean)} at risk on the clean pipe`);
  if (atRisk(spoiled) !== 4) fail(`measured: ${atRisk(spoiled)} at risk once the sidecar joined and all four lost records`);

  /* The file. */
  const file: Setup = { ...base, target: "file", writers: [512, 512, 200_000, 200_000] };
  if (atRisk(file) !== 0) fail(`measured: every writer on the file came out whole and the model puts ${atRisk(file)} at risk`);
  const sameOnAPipe: Setup = { ...file, target: "pipe" };
  if (atRisk(sameOnAPipe) !== 2) fail(`measured: the same writers on a pipe put the two large ones at risk and the model says ${atRisk(sameOnAPipe)}`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-pipebuf: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} atomic write cases: a pipe filled record by record agrees with the model on every case, a write at ` +
    `or under PIPE_BUF survives every company across 128 rows, records that divide the capacity are safe until one writer ` +
    `differs and then all of them tear, F_SETPIPE_SZ rounds to a power of two and refuses past pipe-max-size, and the ` +
    `measured nine sizes, four mixed runs, the sidecar and the file all reproduce.`,
);
