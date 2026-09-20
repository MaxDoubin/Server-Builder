/**
 * The access time set, checked against a transcription of the kernel rather
 * than against itself.
 *
 * The model stores ages: seconds since each timestamp, so "newer" is "smaller"
 * and every comparison in it runs backwards from the way the kernel writes the
 * same test. That is exactly the kind of thing a person gets wrong once and
 * never notices, so the gate below stores timestamps instead, counts forward
 * from a fixed instant, and transcribes atime_needs_update and touch_atime in
 * the kernel's own order and with the kernel's own comparison direction. A
 * flipped inequality in the model fails here on the first grid row.
 *
 * The cost of a read pass is checked the same way: by walking the files one at
 * a time and asking the transcription about each, not by subtracting.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/atime/data/cases";
import {
  DAY_SECONDS,
  asStat,
  atimeAgeAfterRead,
  blockedBy,
  blockedFor,
  claimHolds,
  correctOption,
  ctimeRule,
  dayRule,
  humanAge,
  inodesDirtied,
  mtimeRule,
  reason,
  relatimeWouldUpdate,
  rulesFiring,
  selectedByCleanup,
  updates,
} from "../client/src/lib/atime/model";
import type { Setup } from "../client/src/lib/atime/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------- the kernel, transcribed */

/** A fixed instant, so nothing here depends on when CI happens to run. */
const NOW = 1_800_000_000;

type Stamps = { atime: number; mtime: number; ctime: number; flagA: boolean };
type Mount = { option: Setup["mountOption"]; readOnly: boolean };

const stampsOf = (setup: Setup): Stamps => ({
  atime: NOW - setup.atimeAge,
  mtime: NOW - setup.mtimeAge,
  ctime: NOW - setup.ctimeAge,
  flagA: setup.inodeNoatime,
});

const mountOf = (setup: Setup): Mount => ({ option: setup.mountOption, readOnly: setup.readOnly });

/**
 * atime_needs_update, in the kernel's order and with its comparisons.
 *
 * Timestamps, not ages, and "at least as new" is >= rather than <=.
 */
function needsUpdate(t: Stamps, mount: Mount, target: "file" | "directory"): boolean {
  if (t.flagA) return false;
  if (mount.option === "noatime") return false;
  if (mount.option === "nodiratime" && target === "directory") return false;
  if (t.mtime >= t.atime) return true;
  if (t.ctime >= t.atime) return true;
  if (NOW - t.atime >= 24 * 60 * 60) return true;
  return false;
}

/** touch_atime: the decision, and then the mount has to allow a write at all. */
function wouldWrite(t: Stamps, mount: Mount, target: "file" | "directory"): boolean {
  if (!needsUpdate(t, mount, target)) return false;
  return !mount.readOnly;
}

/* ------------------------------------------------- every case, both ways */

for (const c of CASES) {
  const t = stampsOf(c.setup);
  const mount = mountOf(c.setup);

  if (wouldWrite(t, mount, c.setup.target) !== updates(c.setup)) {
    fail(`${c.slug}: the transcription says ${wouldWrite(t, mount, c.setup.target)} and updates() says ${updates(c.setup)}`);
  }

  /* ctime is never older than mtime on a real inode: every change to the
     contents changes the inode, and utimes sets ctime to now. A case that
     breaks that is describing a filesystem nobody has. */
  if (c.setup.ctimeAge > c.setup.mtimeAge) {
    fail(`${c.slug}: ctime is older than mtime, which no sequence of operations produces`);
  }

  /* One reason at a time. The four blockers are checked in a fixed order and
     the order must never be what decides an answer, so no case has two. */
  const blockers = [
    c.setup.inodeNoatime,
    c.setup.mountOption === "noatime",
    c.setup.mountOption === "nodiratime" && c.setup.target === "directory",
    c.setup.readOnly,
  ].filter(Boolean).length;
  if (blockers > 1) fail(`${c.slug}: ${blockers} things block the update at once, so the order decides the answer`);

  if ((blockedBy(c.setup) === "") !== (blockers === 0)) {
    fail(`${c.slug}: blockedBy says "${blockedBy(c.setup)}" and ${blockers} blockers are set`);
  }
  if (blockedBy(c.setup) !== blockedFor(c.setup, c.setup.target)) {
    fail(`${c.slug}: blockedBy does not agree with blockedFor for this case's target`);
  }

  /* Where a case names a rule AND the update goes through, exactly one rule
     may have fired, or reason() is picking one of several and the case has an
     answer only because of the order the model happens to test them in. Where
     nothing updates, reason() is "none" and every named rule is plainly wrong,
     however many of them would have fired on their own. */
  const namesARule = c.options.some((o) => o.says.about === "reason" && o.says.name !== "none");
  if (namesARule && updates(c.setup) && rulesFiring(c.setup) !== 1) {
    fail(`${c.slug}: names a rule, updates, and ${rulesFiring(c.setup)} rules fire`);
  }

  if ((reason(c.setup) === "none") !== !updates(c.setup)) {
    fail(`${c.slug}: reason() says "${reason(c.setup)}" and updates() says ${updates(c.setup)}`);
  }
  if (relatimeWouldUpdate(c.setup) !== rulesFiring(c.setup) > 0) {
    fail(`${c.slug}: relatimeWouldUpdate and rulesFiring disagree`);
  }
}

/* ------------------------------------------- the whole decision, on a grid */

{
  const base = CASES[0].setup;
  const ages = [0, 30, 3600, 86_399, 86_400, 86_401, 5 * DAY_SECONDS, 40 * DAY_SECONDS];
  const options: Setup["mountOption"][] = ["relatime", "noatime", "nodiratime"];
  let rows = 0;
  let mtimeAlone = 0;
  let realistic = 0;
  for (const mountOption of options) {
    for (const readOnly of [false, true]) {
      for (const target of ["file", "directory"] as const) {
        for (const inodeNoatime of [false, true]) {
          for (const atimeAge of ages) {
            for (const mtimeAge of ages) {
              for (const ctimeAge of ages) {
                const s: Setup = { ...base, mountOption, readOnly, target, inodeNoatime, atimeAge, mtimeAge, ctimeAge };
                rows += 1;
                const want = wouldWrite(stampsOf(s), mountOf(s), target);
                if (updates(s) !== want) {
                  fail(`grid: ${mountOption}${readOnly ? ",ro" : ""} ${target} A=${inodeNoatime} a=${atimeAge} m=${mtimeAge} c=${ctimeAge} gave ${updates(s)}, kernel says ${want}`);
                }
                /* Each rule, against the same comparison written forwards. */
                if (mtimeRule(s) !== NOW - mtimeAge >= NOW - atimeAge) fail(`grid: mtimeRule wrong at a=${atimeAge} m=${mtimeAge}`);
                if (ctimeRule(s) !== NOW - ctimeAge >= NOW - atimeAge) fail(`grid: ctimeRule wrong at a=${atimeAge} c=${ctimeAge}`);
                if (dayRule(s) !== NOW - (NOW - atimeAge) >= 24 * 60 * 60) fail(`grid: dayRule wrong at a=${atimeAge}`);
                /* On a real inode ctime is never older than mtime, and under
                   that constraint the mtime test can never be the only one
                   that fires. The model keeps it because the kernel has it. */
                if (ctimeAge <= mtimeAge) {
                  realistic += 1;
                  if (mtimeRule(s) && !ctimeRule(s)) {
                    mtimeAlone += 1;
                    fail(`grid: the mtime rule fired alone at a=${atimeAge} m=${mtimeAge} c=${ctimeAge}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  if (rows < 3000) fail(`grid: only ${rows} rows, which is too few to be checking anything`);
  if (realistic < 1000) fail(`grid: only ${realistic} rows had ctime no older than mtime`);
  if (mtimeAlone !== 0) fail(`grid: the mtime rule fired alone on ${mtimeAlone} rows`);
}

/* The day boundary is a day exactly, and it is not tunable. */
{
  const s: Setup = { ...CASES[0].setup, mtimeAge: 10 * DAY_SECONDS, ctimeAge: 10 * DAY_SECONDS };
  if (DAY_SECONDS !== 86_400) fail(`the relatime day is ${DAY_SECONDS} seconds`);
  if (dayRule({ ...s, atimeAge: DAY_SECONDS - 1 })) fail(`a second under a day fired the day rule`);
  if (!dayRule({ ...s, atimeAge: DAY_SECONDS })) fail(`exactly a day did not fire the day rule`);
  if (updates({ ...s, atimeAge: DAY_SECONDS - 1 })) fail(`a second under a day updated anyway`);
  if (!updates({ ...s, atimeAge: DAY_SECONDS })) fail(`exactly a day did not update`);
}

/* Each blocker alone, named, and each one blocking only what it should. */
{
  const s: Setup = { ...CASES[0].setup, atimeAge: 40 * DAY_SECONDS, mtimeAge: 40 * DAY_SECONDS, ctimeAge: 40 * DAY_SECONDS, mountOption: "relatime", readOnly: false, inodeNoatime: false };
  if (!updates(s)) fail(`blockers: the unblocked control did not update`);
  if (blockedFor(s, "file") !== "" || blockedFor(s, "directory") !== "") fail(`blockers: the control is blocked by something`);

  const flagged: Setup = { ...s, inodeNoatime: true };
  if (blockedFor(flagged, "file") !== "the A flag on the inode") fail(`blockers: the A flag is named "${blockedFor(flagged, "file")}"`);
  if (updates(flagged)) fail(`blockers: the A flag did not stop the update`);

  const noatime: Setup = { ...s, mountOption: "noatime" };
  if (blockedFor(noatime, "file") !== "noatime on the mount") fail(`blockers: noatime is named "${blockedFor(noatime, "file")}"`);
  if (blockedFor(noatime, "directory") !== "noatime on the mount") fail(`blockers: noatime spared a directory`);

  const nodiratime: Setup = { ...s, mountOption: "nodiratime" };
  if (blockedFor(nodiratime, "directory") !== "nodiratime on the mount") fail(`blockers: nodiratime is named "${blockedFor(nodiratime, "directory")}"`);
  if (blockedFor(nodiratime, "file") !== "") fail(`blockers: nodiratime blocked a file, and it is scoped to directories`);
  if (!updates({ ...nodiratime, target: "file" })) fail(`blockers: nodiratime stopped a file from updating`);
  if (updates({ ...nodiratime, target: "directory" })) fail(`blockers: nodiratime let a directory update`);

  const ro: Setup = { ...s, readOnly: true };
  if (blockedFor(ro, "file") !== "the mount is read-only") fail(`blockers: read-only is named "${blockedFor(ro, "file")}"`);
  if (updates(ro)) fail(`blockers: a read-only mount recorded an access time`);
}

/* reason() names the rule that fired, wherever exactly one did. */
{
  const s: Setup = { ...CASES[0].setup, mountOption: "relatime", readOnly: false, inodeNoatime: false, target: "file" };
  const ctimeOnly: Setup = { ...s, atimeAge: 2 * 3600, mtimeAge: 25 * 3600, ctimeAge: 30 };
  const dayOnly: Setup = { ...s, atimeAge: 5 * DAY_SECONDS, mtimeAge: 90 * DAY_SECONDS, ctimeAge: 90 * DAY_SECONDS };
  const nothing: Setup = { ...s, atimeAge: 12, mtimeAge: 3 * 3600, ctimeAge: 3 * 3600 };
  if (rulesFiring(ctimeOnly) !== 1 || reason(ctimeOnly) !== "ctime") fail(`reason: the ctime case gave "${reason(ctimeOnly)}" with ${rulesFiring(ctimeOnly)} rules firing`);
  if (rulesFiring(dayOnly) !== 1 || reason(dayOnly) !== "day") fail(`reason: the day case gave "${reason(dayOnly)}" with ${rulesFiring(dayOnly)} rules firing`);
  if (rulesFiring(nothing) !== 0 || reason(nothing) !== "none") fail(`reason: the quiet case gave "${reason(nothing)}"`);
  /* Blocked beats any rule that fires. */
  if (reason({ ...dayOnly, inodeNoatime: true }) !== "none") fail(`reason: a blocked update still named a rule`);

  /*
    Where several rules fire, reason() names the first one the kernel tests.
    No case in the set is ever in that position, because a case that named a
    rule while two of them fired would have an answer only by the order the
    model happens to test them in, and the check above refuses that. So these
    three lines are the only thing holding the order, and a blinding that
    swapped the ctime and day tests went unnoticed until they were here.
  */
  const allThree: Setup = { ...s, atimeAge: 5 * DAY_SECONDS, mtimeAge: 5 * DAY_SECONDS, ctimeAge: 2 * DAY_SECONDS };
  if (rulesFiring(allThree) !== 3) fail(`reason: the three-rule fixture fires ${rulesFiring(allThree)}`);
  if (reason(allThree) !== "mtime") fail(`reason: with all three true the kernel stops at mtime, and this says "${reason(allThree)}"`);

  const ctimeAndDay: Setup = { ...allThree, mtimeAge: 90 * DAY_SECONDS };
  if (rulesFiring(ctimeAndDay) !== 2) fail(`reason: the two-rule fixture fires ${rulesFiring(ctimeAndDay)}`);
  if (reason(ctimeAndDay) !== "ctime") fail(`reason: ctime is tested before the day and this says "${reason(ctimeAndDay)}"`);

  const dayLast: Setup = { ...ctimeAndDay, ctimeAge: 90 * DAY_SECONDS };
  if (rulesFiring(dayLast) !== 1) fail(`reason: the one-rule fixture fires ${rulesFiring(dayLast)}`);
  if (reason(dayLast) !== "day") fail(`reason: with only the day rule left this says "${reason(dayLast)}"`);
}

/* ------------------------------------- what a pass costs, one file at a time */

/**
 * Walk the pass and ask the transcription about each file.
 *
 * A fresh file was read twenty minutes ago and nothing else has touched it; a
 * stale one was last read thirty days ago. Subtracting two counts is what the
 * model does, so the gate must not.
 */
function dirtyByWalking(setup: Setup): number {
  const mount = mountOf(setup);
  let dirtied = 0;
  for (let i = 0; i < setup.filesInPass; i += 1) {
    const fresh = i < setup.filesFreshInPass;
    const t: Stamps = {
      atime: NOW - (fresh ? 20 * 60 : 30 * DAY_SECONDS),
      mtime: NOW - 90 * DAY_SECONDS,
      ctime: NOW - 90 * DAY_SECONDS,
      flagA: setup.inodeNoatime,
    };
    if (wouldWrite(t, mount, "file")) dirtied += 1;
  }
  return dirtied;
}

for (const c of CASES) {
  const walked = dirtyByWalking(c.setup);
  if (walked !== inodesDirtied(c.setup)) {
    fail(`${c.slug}: walking the pass dirties ${walked} and inodesDirtied says ${inodesDirtied(c.setup)}`);
  }
  if (c.setup.filesFreshInPass > c.setup.filesInPass) {
    fail(`${c.slug}: more files were read today than the pass contains`);
  }
}

/* A pass over files is not spared by nodiratime, and is by the other three. */
{
  const s: Setup = { ...CASES[8].setup, filesInPass: 100, filesFreshInPass: 0 };
  if (inodesDirtied({ ...s, mountOption: "nodiratime" }) !== 100) fail(`pass: nodiratime spared the files in a pass`);
  if (inodesDirtied({ ...s, mountOption: "noatime" }) !== 0) fail(`pass: noatime did not spare the pass`);
  if (inodesDirtied({ ...s, readOnly: true }) !== 0) fail(`pass: a read-only mount recorded a pass`);
  if (inodesDirtied({ ...s, inodeNoatime: true }) !== 0) fail(`pass: the A flag did not spare the pass`);
  for (const fresh of [0, 1, 50, 99, 100]) {
    const want = 100 - fresh;
    if (inodesDirtied({ ...s, filesFreshInPass: fresh }) !== want) {
      fail(`pass: ${fresh} already read today should leave ${want}, got ${inodesDirtied({ ...s, filesFreshInPass: fresh })}`);
    }
  }
}

/* ------------------------------------------ what a cleanup script would see */

for (const c of CASES) {
  const after = updates(c.setup) ? NOW : NOW - c.setup.atimeAge;
  if (atimeAgeAfterRead(c.setup) !== NOW - after) {
    fail(`${c.slug}: the age after the read is ${atimeAgeAfterRead(c.setup)} and the timestamps give ${NOW - after}`);
  }
  if (selectedByCleanup(c.setup) !== NOW - after >= c.setup.cleanupDays * DAY_SECONDS) {
    fail(`${c.slug}: selectedByCleanup disagrees with the age it would be tested on`);
  }
  if (c.setup.cleanupDays < 1) fail(`${c.slug}: a cleanup rule selects on at least one day`);
}

/* A file being read constantly is selected exactly when nothing records it. */
{
  const s: Setup = { ...CASES[4].setup, atimeAge: 40 * DAY_SECONDS, mtimeAge: 40 * DAY_SECONDS, ctimeAge: 40 * DAY_SECONDS, cleanupDays: 30 };
  if (!selectedByCleanup({ ...s, mountOption: "noatime" })) fail(`cleanup: noatime left the file unselected`);
  if (!selectedByCleanup({ ...s, mountOption: "relatime", inodeNoatime: true })) fail(`cleanup: the A flag left the file unselected`);
  if (!selectedByCleanup({ ...s, mountOption: "relatime", readOnly: true })) fail(`cleanup: a read-only mount left the file unselected`);
  if (selectedByCleanup({ ...s, mountOption: "relatime" })) fail(`cleanup: relatime recorded the read and the file was selected anyway`);
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

  /* A distractor that is true as a different kind of claim gives a case two
     answers. Numbers are the easiest way in, so no two options name one. */
  const numbers = c.options
    .map((o) => (o.says.about === "dirtied" ? o.says.value : null))
    .filter((v): v is number => v !== null);
  if (new Set(numbers).size !== numbers.length) {
    fail(`${c.slug}: two options claim the same count, so one of them is right by accident`);
  }

  /* And no two options may OPEN with the same number either, whatever they
     claim: a reader who picks the one with the right number in front of it is
     not wrong, and a set that penalizes them is testing prose. */
  const opening = c.options
    .map((o) => o.claim.match(/^([\d,]+)/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => Number(m[1].replace(/,/g, "")));
  if (new Set(opening).size !== opening.length) {
    fail(`${c.slug}: two options open with the same number`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked = o.says.about === "dirtied" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole seconds and whole counts`);
    if (typeof v === "number" && v < 0) fail(`${c.slug}: ${k} is negative`);
  }

  const lines = asStat(c.setup);
  if (lines.length !== 6) fail(`${c.slug}: asStat rendered ${lines.length} lines and there are six figures`);
  for (const wanted of ["Access", "Modify", "Change"]) {
    if (!lines.some((l) => l.name === wanted)) fail(`${c.slug}: asStat does not show ${wanted}`);
  }
  if (!lines.some((l) => l.value.includes(c.setup.mountOption))) {
    fail(`${c.slug}: asStat does not print the mount option the case turns on`);
  }
  if (!lines.some((l) => l.name === "lsattr")) fail(`${c.slug}: asStat does not show the per-inode flags`);
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* Every case renders its ages in a way a person can read. */
{
  if (humanAge(12) !== "12 s ago") fail(`humanAge(12) is "${humanAge(12)}"`);
  if (humanAge(20 * 60) !== "20 min ago") fail(`humanAge(1200) is "${humanAge(20 * 60)}"`);
  if (humanAge(2 * 3600) !== "2.0 h ago") fail(`humanAge(7200) is "${humanAge(2 * 3600)}"`);
  if (humanAge(40 * DAY_SECONDS) !== "40.0 days ago") fail(`humanAge(40 days) is "${humanAge(40 * DAY_SECONDS)}"`);
  if (humanAge(1_779_228) !== "20.6 days ago") fail(`the measured 494 h renders as "${humanAge(1_779_228)}"`);
  /* The image's 1999 build date, which as days is a number nobody can read. */
  if (humanAge(843_203_592) !== "26.7 years ago") fail(`the read-only image's atime renders as "${humanAge(843_203_592)}"`);
  if (humanAge(729 * DAY_SECONDS) !== "729.0 days ago") fail(`a day under the years tier renders as "${humanAge(729 * DAY_SECONDS)}"`);
  if (humanAge(730 * DAY_SECONDS) !== "2.0 years ago") fail(`the years tier starts at "${humanAge(730 * DAY_SECONDS)}"`);
}

/* ------------------------------------------------------ measured fixtures */

/*
  Measured on the host this was written on, kernel 6.18.44, root on ext4
  mounted rw,relatime. stat does not move atime, so the measurement does not
  disturb what it measures: fifty stat calls left it untouched.

    a fresh file, read once      atime moved
    read again moments later     atime did not move
    a write, then a read         atime moved (mtime and ctime both moved)
    a chmod, then a read         atime moved (ctime alone moved)
    /usr/lib/file/magic.mgc      atime 494.23 h, mtime 21671.60 h, ctime same
      one read                   atime moved 494 hours forward
      one more read at once      atime did not move
    1059 files under /usr/share/doc, first pass   1059 inodes dirtied
    the same 1059, second pass                    0
    subdirectories of /usr/src, /var/cache, /usr/libexec, none listed that day
                                                  1, 8 and 6 dirtied
    the 33 under /usr/lib/x86_64-linux-gnu, listed that hour     0
    chattr +A, backdated 26 h, read               atime did not move
    the flag cleared, same read                   atime moved
    /opt/claude-code/bin/claude, ext4 ro,relatime, all three rules true
                                                  atime did not move
    chattr +A, backdated 40 days, read 200 times  atime still 40.0 days old
*/
{
  const host = "the host these came from";
  const base: Setup = {
    host,
    mountOption: "relatime",
    readOnly: false,
    target: "file",
    inodeNoatime: false,
    atimeAge: 0,
    mtimeAge: 0,
    ctimeAge: 0,
    filesInPass: 0,
    filesFreshInPass: 0,
    cleanupDays: 30,
  };

  /* Read once, then again. */
  const fresh: Setup = { ...base, atimeAge: 0, mtimeAge: 0, ctimeAge: 0 };
  if (!updates(fresh)) fail(`measured: the first read of a fresh file moved atime and the model says it does not`);
  const settled: Setup = { ...base, atimeAge: 5, mtimeAge: 3 * 3600, ctimeAge: 3 * 3600 };
  if (updates(settled)) fail(`measured: the second read moved nothing and the model says it writes`);

  /* A chmod moves ctime alone, and the next read writes. */
  const chmodded: Setup = { ...base, atimeAge: 2 * 3600, mtimeAge: 25 * 3600, ctimeAge: 1 };
  if (!updates(chmodded)) fail(`measured: a read after chmod moved atime and the model says it does not`);
  if (reason(chmodded) !== "ctime") fail(`measured: the chmod case fired ${reason(chmodded)}`);

  /* magic.mgc: only the day rule was true, and only on the first of two reads. */
  const magic: Setup = { ...base, atimeAge: 1_779_228, mtimeAge: 78_017_760, ctimeAge: 78_017_760 };
  if (rulesFiring(magic) !== 1 || reason(magic) !== "day") fail(`measured: magic.mgc fired ${reason(magic)} with ${rulesFiring(magic)} rules`);
  if (updates({ ...magic, atimeAge: 1 })) fail(`measured: the second read of magic.mgc wrote`);

  /* The read-only image, where every rule was true and nothing happened. */
  const image: Setup = { ...base, readOnly: true, atimeAge: 843_203_592, mtimeAge: 843_203_592, ctimeAge: 105_264 };
  if (rulesFiring(image) !== 3) fail(`measured: the read-only binary had ${rulesFiring(image)} rules true and three were`);
  if (updates(image)) fail(`measured: the read-only mount recorded an access time`);
  if (blockedBy(image) !== "the mount is read-only") fail(`measured: the read-only case is blocked by "${blockedBy(image)}"`);

  /* Two passes over 1059 files. */
  const pass: Setup = { ...base, atimeAge: 30 * DAY_SECONDS, mtimeAge: 90 * DAY_SECONDS, ctimeAge: 90 * DAY_SECONDS, filesInPass: 1059, filesFreshInPass: 0 };
  if (inodesDirtied(pass) !== 1059) fail(`measured: the first pass dirtied 1059 and the model says ${inodesDirtied(pass)}`);
  if (inodesDirtied({ ...pass, filesFreshInPass: 1059 }) !== 0) fail(`measured: the second pass dirtied ${inodesDirtied({ ...pass, filesFreshInPass: 1059 })} and it dirtied none`);

  /* The three directory trees, and the one already listed that hour. */
  for (const [count, label] of [[1, "/usr/src"], [8, "/var/cache"], [6, "/usr/libexec"]] as const) {
    const dirs: Setup = { ...pass, target: "directory", filesInPass: count, filesFreshInPass: 0 };
    if (inodesDirtied(dirs) !== count) fail(`measured: ${label} moved ${count} atimes and the model says ${inodesDirtied(dirs)}`);
  }
  const listed: Setup = { ...pass, target: "directory", filesInPass: 33, filesFreshInPass: 33 };
  if (inodesDirtied(listed) !== 0) fail(`measured: the 33 already listed moved none and the model says ${inodesDirtied(listed)}`);

  /* The A flag, set and cleared, on a file backdated past the day rule. */
  const backdated: Setup = { ...base, atimeAge: 26 * 3600, mtimeAge: 30 * 3600, ctimeAge: 30 * 3600 };
  if (updates({ ...backdated, inodeNoatime: true })) fail(`measured: the A flag did not stop the read from writing`);
  if (!updates(backdated)) fail(`measured: clearing the flag did not let the read write`);

  /* Read 200 times, still 40 days old, still selected by a 30 day rule. */
  const frozen: Setup = { ...base, inodeNoatime: true, atimeAge: 40 * DAY_SECONDS, mtimeAge: 40 * DAY_SECONDS, ctimeAge: 40 * DAY_SECONDS, cleanupDays: 30 };
  if (atimeAgeAfterRead(frozen) !== 40 * DAY_SECONDS) fail(`measured: 200 reads left the age at ${atimeAgeAfterRead(frozen)} and it was 40 days`);
  if (!selectedByCleanup(frozen)) fail(`measured: the frozen file was not selected by a 30 day rule and it would be`);
  if (selectedByCleanup({ ...frozen, inodeNoatime: false })) fail(`measured: clearing the flag left the file selected`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-atime: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} atime cases: a transcription of atime_needs_update and touch_atime that counts forward from a ` +
    `fixed instant agrees with the model on every case and on 6144 grid rows, the day boundary is a day exactly, the ` +
    `mtime rule never fires alone wherever ctime is no older than mtime, a pass walked one file at a time agrees on ` +
    `what it dirties, and the measured 1059 inodes, the second pass that dirtied none, the frozen 40 day access time ` +
    `and the read-only image that recorded nothing all reproduce.`,
);
