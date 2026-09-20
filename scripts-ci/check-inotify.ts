/**
 * The inotify set, checked by charging watches one at a time rather than by
 * multiplying, and by draining a queue rather than subtracting.
 *
 * Two rules carry every case and both are easy to state wrongly. A watch is
 * deduplicated per INSTANCE and keyed on the inode, so asking twice inside one
 * instance is free and two instances pay in full; and inotify_init runs before
 * inotify_add_watch, so when both budgets are short the instance limit is the
 * one that reports. So the gate walks the directories per instance with a set,
 * asks for every one of them a second time, and walks the errno precedence
 * across a grid of both budgets instead of trusting an expression.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/inotify/data/cases";
import {
  asSysctl,
  claimHolds,
  correctOption,
  culprit,
  errnoMessage,
  errnoName,
  eventsLost,
  eventsRead,
  fits,
  human,
  instancesFit,
  instancesFree,
  queueOverflows,
  watchesFit,
  watchesFree,
  watchesWanted,
} from "../client/src/lib/inotify/model";
import type { Setup } from "../client/src/lib/inotify/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------- watches, charged one at a time */

/**
 * What the kernel would actually charge, by adding the watches.
 *
 * Deduplication happens per instance against the inode, so each instance gets
 * its own set and every directory is asked for twice: the second pass must
 * cost nothing. A model that deduplicated across instances, or that counted
 * the second add, disagrees with this.
 */
function chargeByAdding(setup: Setup): number {
  let charged = 0;
  for (let instance = 0; instance < setup.instances; instance += 1) {
    const held = new Set<number>();
    for (let pass = 0; pass < 2; pass += 1) {
      for (let inode = 0; inode < setup.directories; inode += 1) {
        if (held.has(inode)) continue;
        held.add(inode);
        charged += 1;
      }
    }
  }
  return charged;
}

for (const c of CASES) {
  const charged = chargeByAdding(c.setup);
  if (charged !== watchesWanted(c.setup)) {
    fail(`${c.slug}: adding the watches charges ${charged} and watchesWanted says ${watchesWanted(c.setup)}`);
  }
  if (watchesFree(c.setup) !== c.setup.maxUserWatches - c.setup.watchesHeldByOthers) {
    fail(`${c.slug}: watchesFree does not account for what other processes hold`);
  }
  if (instancesFree(c.setup) !== c.setup.maxUserInstances - c.setup.instancesHeldByOthers) {
    fail(`${c.slug}: instancesFree does not account for what other processes hold`);
  }
  if (watchesFit(c.setup) !== charged <= watchesFree(c.setup)) {
    fail(`${c.slug}: watchesFit disagrees with the charge against the budget`);
  }
  if (instancesFit(c.setup) !== c.setup.instances <= instancesFree(c.setup)) {
    fail(`${c.slug}: instancesFit disagrees with the count against the budget`);
  }
  if (fits(c.setup) !== (errnoName(c.setup) === "none")) {
    fail(`${c.slug}: fits and errnoName disagree`);
  }
}

/* The second add is free, and a second instance is not. */
{
  const base: Setup = { ...CASES[0].setup, maxUserWatches: 1_000_000, watchesHeldByOthers: 0 };
  for (const directories of [1, 2, 10, 500]) {
    const one = watchesWanted({ ...base, directories, instances: 1 });
    if (one !== directories) fail(`dedup: ${directories} directories in one instance charged ${one}`);
    for (const instances of [2, 3, 5]) {
      const many = watchesWanted({ ...base, directories, instances });
      if (many !== directories * instances) {
        fail(`dedup: ${directories} directories across ${instances} instances charged ${many}`);
      }
      if (many <= one && instances > 1) fail(`dedup: a second instance charged nothing extra`);
    }
  }
}

/* -------------------------------------------------- the errno, in order */

/*
  inotify_init before inotify_add_watch. Walk both budgets across a grid and
  derive the expected errno from that order rather than from the function, so
  a model that checked watches first passes a spot check and fails here.
*/
{
  const base: Setup = { ...CASES[0].setup, maxUserWatches: 1000, maxUserInstances: 10, directories: 100 };
  let bothShort = 0;
  for (const instances of [1, 5, 10, 11, 20]) {
    for (const instancesHeldByOthers of [0, 5, 9, 10]) {
      for (const watchesHeldByOthers of [0, 500, 950, 1000]) {
        const s: Setup = { ...base, instances, instancesHeldByOthers, watchesHeldByOthers };
        const roomForInstances = instances <= s.maxUserInstances - instancesHeldByOthers;
        const roomForWatches = chargeByAdding(s) <= s.maxUserWatches - watchesHeldByOthers;
        const want = !roomForInstances ? "EMFILE" : !roomForWatches ? "ENOSPC" : "none";
        if (errnoName(s) !== want) {
          fail(`errno: instances ${instances}/${instancesHeldByOthers}, watches held ${watchesHeldByOthers} gave ${errnoName(s)}, expected ${want}`);
        }
        if (!roomForInstances && !roomForWatches) {
          bothShort += 1;
          if (errnoName(s) !== "EMFILE") fail(`errno: both budgets short and the watch limit reported`);
        }
      }
    }
  }
  if (bothShort < 4) fail(`errno: only ${bothShort} of the grid had both budgets short, which is too few to be checking the order`);
}

/* Each errno prints the message that sends people to the wrong resource. */
{
  const base: Setup = { ...CASES[0].setup };
  const enospc: Setup = { ...base, maxUserWatches: 1, maxUserInstances: 100, instancesHeldByOthers: 0, directories: 50, instances: 1 };
  const emfile: Setup = { ...base, maxUserInstances: 1, instancesHeldByOthers: 1, instances: 1 };
  if (errnoName(enospc) !== "ENOSPC") fail(`messages: the watch case did not give ENOSPC`);
  if (errnoMessage(enospc) !== "No space left on device") fail(`messages: ENOSPC prints "${errnoMessage(enospc)}"`);
  if (culprit(enospc) !== "fs.inotify.max_user_watches") fail(`messages: ENOSPC blames ${culprit(enospc)}`);
  if (errnoName(emfile) !== "EMFILE") fail(`messages: the instance case did not give EMFILE`);
  if (errnoMessage(emfile) !== "Too many open files") fail(`messages: EMFILE prints "${errnoMessage(emfile)}"`);
  if (culprit(emfile) !== "fs.inotify.max_user_instances") fail(`messages: EMFILE blames ${culprit(emfile)}`);
  /* Neither message names the thing that is actually short. */
  for (const s of [enospc, emfile]) {
    if (errnoMessage(s).includes("inotify")) fail(`messages: "${errnoMessage(s)}" names inotify, and the real one does not`);
    if (errnoMessage(s).includes(culprit(s))) fail(`messages: the message names its own sysctl, which is not what strerror does`);
  }
}

/* ------------------------------------------------ the queue, drained */

/** Push the burst through a queue one event at a time and count what survives. */
function drainQueue(burst: number, limit: number): { read: number; lost: number } {
  let queued = 0;
  let lost = 0;
  for (let i = 0; i < burst; i += 1) {
    if (queued < limit) queued += 1;
    else lost += 1;
  }
  return { read: lost > 0 ? queued + 1 : queued, lost };
}

for (const c of CASES) {
  const drained = drainQueue(c.setup.eventsBurst, c.setup.maxQueuedEvents);
  if (drained.lost !== eventsLost(c.setup)) {
    fail(`${c.slug}: draining loses ${drained.lost} and eventsLost says ${eventsLost(c.setup)}`);
  }
  if (drained.read !== eventsRead(c.setup)) {
    fail(`${c.slug}: draining reads ${drained.read} and eventsRead says ${eventsRead(c.setup)}`);
  }
  if (queueOverflows(c.setup) !== drained.lost > 0) {
    fail(`${c.slug}: queueOverflows disagrees with whether anything was dropped`);
  }
  /* The marker is the only thing the reader gets beyond the queue's worth. */
  if (drained.lost > 0 && drained.read !== c.setup.maxQueuedEvents + 1) {
    fail(`${c.slug}: an overflowing queue should read back the limit plus one marker`);
  }
}

/* The queue is per instance, so opening more does not widen the one that fills. */
{
  const s: Setup = { ...CASES[9].setup };
  for (const instances of [1, 2, 4, 16]) {
    if (eventsLost({ ...s, instances }) !== eventsLost({ ...s, instances: 1 })) {
      fail(`queue: ${instances} instances changed what one instance's burst loses`);
    }
  }
}

/* The boundary: one event under the limit loses nothing, one over loses one. */
{
  const s: Setup = { ...CASES[0].setup, maxQueuedEvents: 1000 };
  if (eventsLost({ ...s, eventsBurst: 1000 }) !== 0) fail(`queue: exactly the limit lost something`);
  if (eventsLost({ ...s, eventsBurst: 1001 }) !== 1) fail(`queue: one past the limit lost ${eventsLost({ ...s, eventsBurst: 1001 })}`);
  if (eventsRead({ ...s, eventsBurst: 1000 }) !== 1000) fail(`queue: exactly the limit read back a marker it should not have`);
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

  /*
    A distractor that is true as a DIFFERENT kind of claim gives a case two
    answers, and it happened here: "500, because the limit is per process"
    claimed the watch count, which really was 500.
  */
  const numbers = c.options
    .map((o) => (o.says.about === "watches" || o.says.about === "free" || o.says.about === "lost" ? o.says.value : null))
    .filter((v): v is number => v !== null);
  if (new Set(numbers).size !== numbers.length) {
    fail(`${c.slug}: two options name the same number, so one of them is right by accident`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked =
      o.says.about === "watches" || o.says.about === "free" || o.says.about === "lost" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole counts`);
    if (typeof v === "number" && v < 0) fail(`${c.slug}: ${k} is negative`);
  }
  if (c.setup.instances < 1) fail(`${c.slug}: a watcher opens at least one instance`);
  if (c.setup.watchesHeldByOthers > c.setup.maxUserWatches) fail(`${c.slug}: other processes hold more than the limit allows`);
  if (c.setup.instancesHeldByOthers > c.setup.maxUserInstances) fail(`${c.slug}: other processes hold more instances than the limit allows`);

  const lines = asSysctl(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asSysctl rendered ${lines.length} lines and there are six figures`);
  if (!lines.some((l) => /ACROSS every process/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not say that the watch limit spans processes`);
  }
  if (!lines.some((l) => /NOT about/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not name the two resources the messages wrongly blame`);
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
  Measured on the host this was written on, kernel 6.18.44, through ctypes.
  Every sysctl was restored after its experiment.

    max_user_watches 130082, max_user_instances 128, max_queued_events 16384
    watches lowered to 200, 181 already held elsewhere -> 19 added, then ENOSPC
      with 19.7 GiB free on the filesystem
    instances lowered to 20, 1 already held -> 19 created, then EMFILE
      with RLIMIT_NOFILE at 20000
    queue lowered to 64, 256 files created -> 65 events read, 192 lost,
      one IN_Q_OVERFLOW marker with wd -1, and every read returned success
    same instance, same directory twice -> the same wd both times
    a second instance on that directory -> 2 watches held by the process
*/
{
  const measured: Setup = {
    host: "the host these came from",
    maxUserWatches: 200,
    maxUserInstances: 20,
    maxQueuedEvents: 64,
    watchesHeldByOthers: 181,
    instancesHeldByOthers: 1,
    directories: 500,
    instances: 1,
    nofileSoft: 20_000,
    diskFreeMiB: 20_173,
    eventsBurst: 256,
  };

  /* 181 held of 200 left exactly 19, which is what the run got. */
  if (watchesFree(measured) !== 19) {
    fail(`measured: 200 less the 181 held is 19 and the model says ${watchesFree(measured)}`);
  }
  if (errnoName(measured) !== "ENOSPC") fail(`measured: asking 500 against 19 should give ENOSPC, got ${errnoName(measured)}`);
  if (errnoMessage(measured) !== "No space left on device") fail(`measured: the message was "${errnoMessage(measured)}"`);

  /* 1 instance held of 20 left 19, which is what the run created. */
  if (instancesFree(measured) !== 19) {
    fail(`measured: 20 less the 1 held is 19 and the model says ${instancesFree(measured)}`);
  }
  if (errnoName({ ...measured, instances: 20, directories: 1 }) !== "EMFILE") {
    fail(`measured: asking 20 instances against 19 should give EMFILE`);
  }

  /* 256 created, 65 read, 192 lost, with the queue at 64. */
  if (eventsLost(measured) !== 192) fail(`measured: 192 events were lost and the model says ${eventsLost(measured)}`);
  if (eventsRead(measured) !== 65) fail(`measured: 65 events were read and the model says ${eventsRead(measured)}`);

  /* Two instances on one directory held two watches. */
  if (watchesWanted({ ...measured, directories: 1, instances: 2 }) !== 2) {
    fail(`measured: two instances on one directory held 2 watches and the model says ${watchesWanted({ ...measured, directories: 1, instances: 2 })}`);
  }
  /* Asking twice inside one instance held one. */
  if (watchesWanted({ ...measured, directories: 1, instances: 1 }) !== 1) {
    fail(`measured: asking twice in one instance held 1 watch`);
  }

  if (human(130_082) !== "130,082") fail(`human() renders the measured limit as ${human(130_082)}`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-inotify: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} inotify cases: watches charged one add at a time agree with the model and the second add is free, ` +
    `the errno grid reports EMFILE before ENOSPC wherever both budgets are short, neither message names what is ` +
    `actually short, a drained queue agrees on what is lost, and the measured 19 watches, 19 instances, 192 dropped ` +
    `events and two instances on one directory all reproduce.`,
);
