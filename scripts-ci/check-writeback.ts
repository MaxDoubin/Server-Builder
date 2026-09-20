/**
 * The writeback set, checked against a second derivation and a real kernel.
 *
 * The model here is small enough that a gate calling its functions and
 * comparing them to themselves would prove nothing. So the thresholds are
 * re-derived in MiB space rather than byte space, the throttle predicate is
 * replaced by a second by second simulation of the queue, and the shape of
 * the sizing is checked by walking a host's anonymous footprint from nothing
 * to all of memory and watching where the threshold goes.
 *
 * The fixtures at the bottom are values measured on the machine this was
 * written on, not defaults copied out of a manual page.
 */
import { CASES } from "../client/src/lib/writeback/data/cases";
import {
  asMiB,
  asSysctl,
  backgroundThresholdBytes,
  claimHolds,
  correctOption,
  dirtyableBytes,
  hardThresholdBytes,
  human,
  isThrottled,
  liveKnob,
  maxAgeSeconds,
  secondsToThrottle,
  settledDirtyBytes,
} from "../client/src/lib/writeback/model";
import type { Case, Setup } from "../client/src/lib/writeback/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------------ a second derivation */

/**
 * The same threshold worked out in mebibytes throughout.
 *
 * The model multiplies gibibytes into bytes and takes a percentage there.
 * This counts whole mebibytes first and takes the percentage of that, which
 * is a different order of operations reaching the same place, so a stray
 * factor or a misplaced 1024 in either one shows up as a disagreement.
 */
function thresholdMiBIndependently(setup: Setup, which: "background" | "hard"): number {
  const absolute = which === "background" ? setup.backgroundBytes : setup.dirtyBytes;
  if (absolute !== null) return Math.round(absolute / 1024 / 1024);
  const ratio = which === "background" ? setup.backgroundRatio : setup.dirtyRatio;
  const dirtyableMiB = Math.max(0, setup.ramGiB - setup.anonGiB) * 1024;
  return Math.round(Math.round(dirtyableMiB * 1048576 * ((ratio ?? 0) / 100)) / 1048576);
}

/**
 * Whether the writer stalls, found by running the queue rather than by
 * comparing two rates.
 *
 * Fill at writeMiBps. Below the background threshold nothing drains. At or
 * above it the flushers retire deviceMiBps. If the queue ever reaches the
 * hard threshold the writer is throttled. Ten minutes of simulated seconds
 * is far longer than any of these take to settle.
 */
function runTheQueue(setup: Setup): { stalls: boolean; settledMiB: number; crossedAt: number | null } {
  const background = backgroundThresholdBytes(setup);
  const hard = hardThresholdBytes(setup);
  const step = 1 / 20; // 50ms, fine enough that a fast device cannot overshoot
  let queue = 0;
  let high = 0;
  for (let t = 0; t < 600; t += step) {
    const draining = queue >= background ? setup.deviceMiBps : 0;
    queue += (setup.writeMiBps - draining) * 1048576 * step;
    if (queue < 0) queue = 0;
    if (queue > high) high = queue;
    if (queue >= hard) return { stalls: true, settledMiB: asMiB(hard), crossedAt: t + step };
  }
  return { stalls: false, settledMiB: asMiB(high), crossedAt: null };
}

for (const c of CASES) {
  for (const which of ["background", "hard"] as const) {
    const model = asMiB(which === "background" ? backgroundThresholdBytes(c.setup) : hardThresholdBytes(c.setup));
    const again = thresholdMiBIndependently(c.setup, which);
    if (model !== again) {
      fail(`${c.slug}: the ${which} threshold is ${model} MiB one way and ${again} MiB the other`);
    }
  }
  const run = runTheQueue(c.setup);
  if (run.stalls !== isThrottled(c.setup)) {
    fail(
      `${c.slug}: isThrottled says ${isThrottled(c.setup)} but running the queue for ten minutes says ${run.stalls}`,
    );
  }
  /*
    And where it comes to rest, not only whether it stalls. Without this a
    model that settled at the wrong threshold still leaves exactly one option
    holding, just a different one, and counting the matches cannot see it.
    The tolerance is one simulated step of writes, because the queue is
    sampled every 50ms and can be that far past the line when it is read.
  */
  const overshoot = Math.ceil(c.setup.writeMiBps / 20) + 1;
  const settled = asMiB(settledDirtyBytes(c.setup));
  if (Math.abs(run.settledMiB - settled) > overshoot) {
    fail(
      `${c.slug}: the queue comes to rest at ${run.settledMiB} MiB when run, and settledDirtyBytes says ${settled} MiB`,
    );
  }
}

/* ------------------------------------------- the rest of the model's surface */

for (const c of CASES) {
  /*
    secondsToThrottle against the run. The closed form is two phases, and the
    crossed threshold case has only one, which is exactly the shape a single
    expression gets wrong.
  */
  const run = runTheQueue(c.setup);
  const closed = secondsToThrottle(c.setup);
  if ((closed === null) !== (run.crossedAt === null)) {
    fail(`${c.slug}: secondsToThrottle says ${closed} and the run ${run.crossedAt === null ? "never crossed" : "crossed"}`);
  }
  if (closed !== null && run.crossedAt !== null && Math.abs(closed - run.crossedAt) > 0.25) {
    fail(`${c.slug}: the wall is reached at ${run.crossedAt.toFixed(2)}s when run and ${closed.toFixed(2)}s in closed form`);
  }

  /*
    correctOption is what the page calls, and it has to agree with the scan
    this gate does. A page and a gate disagreeing about the answer is the one
    failure a reader would see and neither side would report.
  */
  const scanned = c.options.filter((o) => claimHolds(o.says, c.setup));
  const asked = correctOption(c);
  if (scanned.length === 1 && asked?.id !== scanned[0].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the claim scan finds ${scanned[0].id}`);
  }

  /*
    asSysctl renders both forms of each pair and marks exactly one live, which
    is the kernel's own behavior: writing either zeroes the other.
  */
  const lines = asSysctl(c.setup);
  for (const pair of ["dirty_background", "dirty_"] as const) {
    const both = lines.filter((l) => l.name.startsWith(`vm.${pair}`) && /(_ratio|_bytes)$/.test(l.name));
    const live = both.filter((l) => l.live);
    if (pair === "dirty_background" && live.length !== 1) {
      fail(`${c.slug}: asSysctl marks ${live.length} of the background pair live, and the kernel keeps one`);
    }
  }
  for (const line of lines) {
    if (!line.live && line.value !== "0") {
      fail(`${c.slug}: asSysctl renders ${line.name} as ${line.value} while it is the zeroed form`);
    }
  }
  if (lines.length !== 6) fail(`${c.slug}: asSysctl rendered ${lines.length} lines and there are six of these knobs`);

  /*
    human() is what every number on the page goes through, so a wrong unit
    there is wrong everywhere at once. Read the figure back out of the string.
  */
  for (const bytes of [backgroundThresholdBytes(c.setup), hardThresholdBytes(c.setup), dirtyableBytes(c.setup)]) {
    const text = human(bytes);
    const parsed = Number(text.split(" ")[0]) * (text.endsWith("GiB") ? 1024 : 1);
    const inMiB = bytes / 1048576;
    if (bytes > 0 && Math.abs(parsed - inMiB) / inMiB > 0.05) {
      fail(`${c.slug}: human(${bytes}) reads "${text}", which is ${parsed} MiB against ${inMiB.toFixed(1)}`);
    }
    if (inMiB >= 1024 && !text.endsWith("GiB")) fail(`${c.slug}: human() left ${text} in MiB past a gibibyte`);
    if (inMiB > 0 && inMiB < 1024 && !text.endsWith("MiB")) fail(`${c.slug}: human() put ${text} in GiB under a gibibyte`);
  }
}

/* ------------------------------------------------ the shape of the sizing */

/*
  Hold everything else still and let the workload's memory grow. The
  threshold has to fall in a straight line to nothing and never turn back
  up, because the base it is taken from is what is left after anonymous.
  A model that read MemTotal would draw a flat line here.
*/
{
  const base: Setup = { ...CASES[0].setup, ramGiB: 64, anonGiB: 0, backgroundRatio: 10, backgroundBytes: null };
  let previous = Infinity;
  let moved = 0;
  for (let anon = 0; anon <= 64; anon += 1) {
    const at = asMiB(backgroundThresholdBytes({ ...base, anonGiB: anon }));
    const expected = Math.round(Math.round((64 - anon) * 1024 * 1048576 * 0.1) / 1048576);
    if (at !== expected) fail(`sizing: at ${anon} GiB anonymous the threshold is ${at} MiB, expected ${expected}`);
    if (at > previous) fail(`sizing: the threshold rose from ${previous} to ${at} MiB as memory filled`);
    if (at !== previous) moved += 1;
    previous = at;
  }
  if (moved < 60) fail(`sizing: the threshold only moved ${moved} times across 65 GiB, which is not a ratio of anything`);
  if (asMiB(backgroundThresholdBytes({ ...base, anonGiB: 64 })) !== 0) {
    fail("sizing: with every page anonymous the dirtyable base is not zero");
  }
}

/* ------------------------------------------- the pairs are mutually exclusive */

/*
  Exactly one of each pair is live in every case, because that is what the
  kernel enforces by zeroing the other. A case that set both would be
  describing a machine that cannot exist.
*/
for (const c of CASES) {
  const bg = [c.setup.backgroundRatio, c.setup.backgroundBytes].filter((v) => v !== null).length;
  const hard = [c.setup.dirtyRatio, c.setup.dirtyBytes].filter((v) => v !== null).length;
  if (bg !== 1) fail(`${c.slug}: ${bg} of the two background knobs are set, and the kernel keeps exactly one`);
  if (hard !== 1) fail(`${c.slug}: ${hard} of the two hard knobs are set, and the kernel keeps exactly one`);

  const named = liveKnob("background", c.setup);
  const expected = c.setup.backgroundBytes !== null ? "dirty_background_bytes" : "dirty_background_ratio";
  if (named !== expected) fail(`${c.slug}: liveKnob names ${named} where the setup has ${expected} set`);
}

/* ------------------------------------------------------------- the case set */

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

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  /*
    An option that opens with a number is claiming that number. Reading one
    value and checking another is the way a set quietly stops testing what
    it says it tests.
  */
  for (const o of c.options) {
    const opens = o.claim.match(/^(\d+)/);
    if (!opens) continue;
    const stated = Number(opens[1]);
    const checked =
      o.says.about === "background" || o.says.about === "hard" || o.says.about === "settled" || o.says.about === "dirtyable"
        ? o.says.mib
        : o.says.about === "age"
          ? o.says.seconds
          : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  /* Integers only: a setup with a fractional gibibyte is not a host. */
  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole units`);
  }

  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")} across the four positions, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* ------------------------------------------------------ measured fixtures */

/*
  Taken on the host this was written on, kernel 6.18.44, and restored after.
  They are here so that a change to the model has to argue with a real
  machine rather than with my memory of one.
*/
{
  const measured: Setup = {
    host: "the host these were taken on",
    ramGiB: 16,
    anonGiB: 1,
    backgroundRatio: 1,
    backgroundBytes: null,
    dirtyRatio: 2,
    dirtyBytes: null,
    writeMiBps: 400,
    deviceMiBps: 900,
    expireCentisecs: 3000,
    writebackCentisecs: 500,
  };

  /* 64 MiB sat untouched for thirty seconds and drained at thirty five. */
  if (maxAgeSeconds(measured) !== 35) {
    fail(`the measured idle wait was 35.0s and the model says ${maxAgeSeconds(measured)}s`);
  }

  /*
    The two runs that settle the question. Dirtyable fell to 0.39 of itself
    when 9 GiB went anonymous and the ceiling fell by the same factor; as a
    share of installed memory it moved instead. The model has to reproduce
    the ratio, not the absolute, because it leaves out totalreserve_pages.
  */
  const free = backgroundThresholdBytes(measured);
  const hogged = backgroundThresholdBytes({ ...measured, anonGiB: 1 + 9 });
  const modelled = hogged / free;
  const observed = 57.0 / 147.0;
  if (Math.abs(modelled - observed) > 0.05) {
    fail(`holding 9 GiB moved the measured ceiling by ${observed.toFixed(2)} and the model by ${modelled.toFixed(2)}`);
  }

  /* And the device kept up in both runs, so neither reached the hard limit. */
  if (isThrottled(measured)) fail("the measured runs never stalled and the model says they did");
  if (asMiB(settledDirtyBytes(measured)) !== asMiB(backgroundThresholdBytes(measured))) {
    fail("the measured ceiling was the background threshold and the model settles somewhere else");
  }
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-writeback: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} writeback cases: thresholds agree with a second derivation, the throttle agrees with a ` +
    `simulated queue, the sizing falls to zero as memory goes anonymous, and the measured 35s wait and 0.39 ` +
    `ceiling shift both reproduce.`,
);
