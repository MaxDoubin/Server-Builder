/**
 * The ENOSPC surface: six filesystems, one message, six things to do.
 *
 * Two halves, and the second is the one that matters.
 *
 * The cases carry no cause. Each declares a filesystem in the terms the
 * kernel holds it in and one write, the model works out which of the six
 * refused the write, and the correct option is whichever names that. So a
 * case whose prose describes one fault while its numbers describe another
 * fails here rather than teaching the wrong reading. Exactly one option must
 * match, which also catches two options that are secretly the same answer.
 *
 * Then the model is held to the rules over generated filesystems, rather than
 * over the cases, because a model that agrees with six hand-written examples
 * has been checked against six hand-written examples. The properties are the
 * ones the surface exists to teach:
 *
 *   df counts every allocated block, including the ones nothing can reach
 *   du counts only what it can walk to, so df minus du is the invisible part
 *   space and inodes are independent budgets and a write needs both
 *   the reserve applies to everybody except root
 *   a quota is invisible to df and reports a different errno
 *
 * And one check written because of a bug on another surface: any percentage a
 * case states in its prose has to be one the model computes. The /clock page
 * carried a sentence claiming its tolerances spanned two orders of magnitude,
 * in five places, for a set that spans one. Twelve gates and not one of them
 * read prose. This reads prose.
 */

import {
  CASES,
  CAUSE_LABEL,
  availableTo,
  candidates,
  correctOption,
  dfAvailable,
  dfPercent,
  dfUsed,
  duTotal,
  errnoFor,
  failure,
  human,
  inodePercent,
  invisible,
  reserved,
  type Case,
  type Cause,
  type Filesystem,
  type Write,
} from "../client/src/lib/space/index";

const problems: string[] = [];

/* ---------------------------------------------------------- the cases */

const slugs = new Set<string>();
const breaks = new Set<string>();
const seen = new Map<Cause, number>();
const positions = new Map<number, number>();

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) problems.push(`${where}: two cases share this slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) {
    problems.push(`${where}: breaks a belief another case already breaks. Six cases teaching one thing is one case.`);
  }
  breaks.add(item.breaks);

  if (item.breaks.length < 35) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (item.why.length < 300) problems.push(`${where}: the explanation is too short to work through`);
  if (item.fix.length < 120) problems.push(`${where}: the fix is too short to be actionable, and the fix is the point`);
  if (item.brief.length < 120) problems.push(`${where}: the brief does not set up a situation`);
  if (!item.question.trim().endsWith("?")) problems.push(`${where}: the question does not read as a question`);

  const fs = item.filesystem;
  if (!fs.mount.startsWith("/")) problems.push(`${where}: the mount point is not a path`);
  if (dfUsed(fs) > fs.totalBlocks) {
    problems.push(`${where}: ${human(dfUsed(fs))} accounted for on a ${human(fs.totalBlocks)} filesystem`);
  }
  if (fs.usedInodes > fs.totalInodes) problems.push(`${where}: more inodes used than exist`);
  if (fs.reservedFraction < 0 || fs.reservedFraction > 0.5) {
    problems.push(`${where}: a reserve of ${fs.reservedFraction} is not a reserve`);
  }
  for (const quota of fs.quotas) {
    if (quota.usedBlocks > quota.limitBlocks) {
      problems.push(`${where}: ${quota.user} is already over quota, so the write never gets a say`);
    }
  }

  /*
    The write has to fail. A case where it succeeds has no answer, and it is
    the failure mode of hand-written filesystem arithmetic: change one figure
    and the write quietly fits.
  */
  const cause = failure(fs, item.write);
  if (!cause) {
    problems.push(`${where}: the write succeeds, so the case has nothing to diagnose`);
    continue;
  }
  seen.set(cause, (seen.get(cause) ?? 0) + 1);

  /* Exactly one option names it, and no two options name the same cause. */
  if (item.options.length !== 4) problems.push(`${where}: ${item.options.length} options rather than four`);
  const ids = new Set(item.options.map((option) => option.id));
  if (ids.size !== item.options.length) problems.push(`${where}: two options share an id`);
  const causes = new Set(item.options.map((option) => option.cause));
  if (causes.size !== item.options.length) {
    problems.push(`${where}: two options name the same cause, so they are the same answer written twice`);
  }
  for (const option of item.options) {
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
  }
  const matching = item.options.filter((option) => option.cause === cause);
  if (matching.length === 0) {
    problems.push(
      `${where}: the write fails because ${CAUSE_LABEL[cause]} and no option says so.` +
        ` ${errnoFor(cause)}, and the tell is that ${tellOf(item)}.`,
    );
  }
  if (matching.length > 1) problems.push(`${where}: ${matching.length} options name the derived cause`);
  const chosen = correctOption(item);
  if (chosen && matching[0] && chosen.id !== matching[0].id) {
    problems.push(`${where}: correctOption() disagrees, so the page would mark the wrong option`);
  }
  if (chosen) {
    const index = item.options.findIndex((option) => option.id === chosen.id);
    positions.set(index, (positions.get(index) ?? 0) + 1);
  }

  /*
    Every percentage the prose states has to be one the model computes.

    This is the check that would have caught the /clock sentence. A number
    written next to the data it describes is a copy, and copies drift.
  */
  const stated = [...item.brief.matchAll(/(\d+)\s?%/g)].map((match) => Number(match[1]));
  const computed = [dfPercent(fs), inodePercent(fs)];
  for (const value of stated) {
    if (!computed.includes(value)) {
      problems.push(
        `${where}: the brief says ${value}% and the model computes ${computed[0]}% of blocks` +
          ` and ${computed[1]}% of inodes. One of them is wrong and it is not the model.`,
      );
    }
  }
}

function tellOf(item: Case): string {
  const cause = failure(item.filesystem, item.write);
  return cause ? `df says ${dfPercent(item.filesystem)}% and du finds ${human(duTotal(item.filesystem))}` : "nothing";
}

/* ------------------------------------------------------- the set as a whole */

if (CASES.length < 6) problems.push(`${CASES.length} cases is too few to cover six causes`);

/*
  All six causes have to appear, because the whole claim of the surface is
  that one message covers six faults. Five of six is a different page.
*/
for (const cause of ["blocks", "unlinked", "inodes", "reserve", "quota", "shadowed"] as Cause[]) {
  if (!seen.has(cause)) problems.push(`no case is ${CAUSE_LABEL[cause]}, so one of the six is only described`);
}
for (const [position, count] of positions) {
  if (count > CASES.length * 0.45) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${CASES.length} cases`);
  }
}

/*
  And both errnos, because EDQUOT printing as "Disk quota exceeded" while
  everything else prints as "No space left on device" is the one hint the
  message itself gives, and a set with no quota case never shows it.
*/
const errnos = new Set(CASES.map((item) => errnoFor(failure(item.filesystem, item.write)!)));
for (const errno of ["ENOSPC", "EDQUOT"]) {
  if (!errnos.has(errno)) problems.push(`no case produces ${errno}`);
}

/*
  At least one case where df and du agree and at least one where they do not,
  because "compare two numbers" is only a habit if both outcomes appear.
*/
if (!CASES.some((item) => invisible(item.filesystem) === 0)) {
  problems.push("no case where df and du agree, so the comparison always pays off and teaches the wrong reflex");
}
if (!CASES.some((item) => invisible(item.filesystem) > 0)) {
  problems.push("no case where df and du disagree, which is the whole method");
}

/*
  And at least one case where two numbers are not enough. Four of the six are
  identifiable from df and du alone; unlinked and shadowed blocks are not
  distinguishable that way, and a set that never lands there would teach that
  two commands always settle it.
*/
if (!CASES.some((item) => candidates(item.filesystem, item.write).causes.length > 1)) {
  problems.push("every case is settled by df and du, so nothing shows where a third observation is needed");
}

/* ------------------------------------------------ the model, over generated */

/*
  xorshift32, not an LCG masked to 31 bits.

  The permissions gate on this site shipped with a generator whose low bits
  had a period of eight, so `next() % 6` locked onto a subset and four
  thousand rounds of property tests ran against paths that all died at the
  first directory. The corpus is measured below for the same reason.
*/
let seed = 0x2f6e21;
function next(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed >>> 0;
}
const upto = (n: number) => next() % n;
const between = (low: number, high: number) => low + upto(high - low + 1);

const G = 1024 * 1024;

function generate(): { fs: Filesystem; write: Write } {
  const totalBlocks = between(1, 400) * G;
  /*
    Split the used blocks three ways with a bias towards zero on the two
    invisible kinds, because a filesystem where most of the space is behind a
    mount is the interesting case and not the common one.
  */
  const used = Math.floor((totalBlocks * between(0, 100)) / 100);
  const unlinkedShare = upto(4) === 0 ? between(0, 90) : 0;
  const shadowedShare = upto(5) === 0 ? between(0, 90 - unlinkedShare) : 0;
  const unlinkedBlocks = Math.floor((used * unlinkedShare) / 100);
  const shadowedBlocks = Math.floor((used * shadowedShare) / 100);

  const totalInodes = between(1, 40) * 100_000;
  const users = ["app", "runner", "postgres", "root"];
  const user = users[upto(users.length)];
  /*
    Whose quota it is, which is not always the writer's.

    The first version of this generator used the writer for both, so a
    blinding that read fs.quotas[0] instead of the writer's own quota passed
    every property. A limit on somebody else is the commonest arrangement on
    a real host and the one the code shape invites getting wrong.
  */
  const quotaUser = upto(2) === 0 ? user : users[upto(users.length)];

  return {
    fs: {
      mount: "/generated",
      totalBlocks,
      namedBlocks: used - unlinkedBlocks - shadowedBlocks,
      unlinkedBlocks,
      shadowedBlocks,
      reservedFraction: [0, 0.01, 0.05][upto(3)],
      totalInodes,
      usedInodes: Math.floor((totalInodes * between(0, 100)) / 100),
      quotas:
        upto(3) === 0
          ? [{ user: quotaUser, limitBlocks: between(1, 200) * G, usedBlocks: between(0, 199) * G }]
          : [],
    },
    write: {
      user,
      blocks: between(0, 20) * G,
      files: upto(3) === 0 ? 0 : between(1, 5000),
      what: "a generated write",
    },
  };
}

const ROUNDS = 4000;
const corpus = {
  refused: 0,
  succeeded: 0,
  byCause: new Map<Cause, number>(),
  gapped: 0,
  quotaBound: 0,
  quotaOnSomebodyElse: 0,
  inodesFull: 0,
  rootWrites: 0,
};

for (let round = 0; round < ROUNDS; round += 1) {
  const { fs, write } = generate();
  /* A quota above the filesystem's own capacity is a quota that does nothing. */
  for (const quota of fs.quotas) quota.usedBlocks = Math.min(quota.usedBlocks, quota.limitBlocks);

  const cause = failure(fs, write);
  if (cause) {
    corpus.refused += 1;
    corpus.byCause.set(cause, (corpus.byCause.get(cause) ?? 0) + 1);
  } else {
    corpus.succeeded += 1;
  }
  if (invisible(fs) > 0) corpus.gapped += 1;
  if (fs.quotas.length > 0) corpus.quotaBound += 1;
  if (fs.quotas.length > 0 && fs.quotas[0].user !== write.user) corpus.quotaOnSomebodyElse += 1;
  if (fs.usedInodes === fs.totalInodes) corpus.inodesFull += 1;
  if (write.user === "root") corpus.rootWrites += 1;

  const at = `round ${round}`;

  /* df counts everything allocated, whether or not anything can reach it. */
  if (dfUsed(fs) !== fs.namedBlocks + fs.unlinkedBlocks + fs.shadowedBlocks) {
    problems.push(`${at}: df is not counting every allocated block`);
  }

  /* du walks names, so it can never exceed what df counts. */
  if (duTotal(fs) > dfUsed(fs)) problems.push(`${at}: du found more than df counts, which is impossible`);
  if (dfUsed(fs) - duTotal(fs) !== invisible(fs)) {
    problems.push(`${at}: the df minus du gap is not the invisible blocks`);
  }

  /* Available never goes negative, and never exceeds what is actually free. */
  const free = fs.totalBlocks - dfUsed(fs);
  if (dfAvailable(fs) < 0) problems.push(`${at}: df reported negative availability`);
  if (dfAvailable(fs) > Math.max(0, free)) problems.push(`${at}: df offered more than is free`);

  /*
    The reserve applies to everybody except root. So a write that root can
    make and another user cannot, with room in the filesystem, is the reserve
    and nothing else.
  */
  const asRoot = failure(fs, { ...write, user: "root" });
  if (cause === "reserve" && asRoot !== null && asRoot !== "quota") {
    problems.push(`${at}: blamed the reserve on a write root could not make either (${asRoot})`);
  }
  if (write.user !== "root" && asRoot === null && cause !== null && cause !== "quota") {
    if (cause !== "reserve") {
      problems.push(`${at}: root succeeds and ${write.user} fails because ${CAUSE_LABEL[cause]}, which is not user specific`);
    }
  }

  /*
    availableTo() has to mean what it says, exactly.

    A write of precisely that many blocks succeeds and one block more does
    not, which pins it from both sides. Nothing tested this function at all
    until a blinding that made it ignore quotas passed every property, and it
    is the number the page shows a reader as what they actually have.
  */
  const room = availableTo(fs, write.user);
  const exact = failure(fs, { ...write, blocks: room, files: 0 });
  const oneMore = failure(fs, { ...write, blocks: room + 1, files: 0 });
  if (exact !== null) problems.push(`${at}: a write of exactly availableTo() blocks failed with ${exact}`);
  if (oneMore === null) problems.push(`${at}: a write of one block more than availableTo() succeeded`);

  /*
    Inodes and blocks are independent budgets. A write that creates no files
    consumes no inodes, so it can never fail for want of them.
  */
  if (failure(fs, { ...write, files: 0 }) === "inodes") {
    problems.push(`${at}: a write creating no files was refused for want of inodes`);
  }
  /*
    Sharpened, because the version above can only fail on a filesystem with
    more inodes used than it has, which the case checks already forbid and
    the generator cannot produce. Appending to an existing file on a
    filesystem with every inode spent has to work, and that is reachable.
  */
  if (fs.usedInodes === fs.totalInodes && failure({ ...fs, totalBlocks: fs.totalBlocks + write.blocks }, { ...write, files: 0 }) === "inodes") {
    problems.push(`${at}: appending to an existing file was refused on a filesystem with no inodes left`);
  }

  /*
    And the reverse: giving a filesystem all the inodes in the world must
    never turn an inode failure into a success by itself if the blocks are
    also gone. It must change the answer to whatever else is wrong.
  */
  if (cause === "inodes") {
    const roomy = failure({ ...fs, totalInodes: fs.usedInodes + write.files + 1 }, write);
    if (roomy === "inodes") problems.push(`${at}: still out of inodes after being given more`);
  }

  /* A quota reports EDQUOT and everything else reports ENOSPC. */
  if (cause && errnoFor(cause) === "EDQUOT" && cause !== "quota") {
    problems.push(`${at}: ${cause} reported EDQUOT`);
  }

  /*
    Removing a quota can only help. This is the property that catches a quota
    check reading the wrong user, which is the mistake the shape of the data
    invites.
  */
  if (fs.quotas.length > 0) {
    const unlimited = failure({ ...fs, quotas: [] }, write);
    if (cause === null && unlimited !== null) {
      problems.push(`${at}: removing the quota turned a success into ${unlimited}`);
    }
    if (cause === "quota" && unlimited === "quota") problems.push(`${at}: still quota bound with no quotas`);
    /*
      A limit on somebody else has nothing to do with this write, whatever
      state it is in. Reading the wrong row is the mistake here, and it looks
      correct on any host where the writer is the only user with a quota.
    */
    if (fs.quotas[0].user !== write.user) {
      if (cause === "quota") problems.push(`${at}: blamed ${fs.quotas[0].user}'s quota for a write by ${write.user}`);
      if (cause !== unlimited) {
        problems.push(`${at}: ${fs.quotas[0].user}'s quota changed the verdict for ${write.user} from ${unlimited} to ${cause}`);
      }
    }
  }

  /* Where the bytes went never changes whether there is room for the write. */
  const rearranged = failure(
    { ...fs, namedBlocks: dfUsed(fs), unlinkedBlocks: 0, shadowedBlocks: 0 },
    write,
  );
  const blockish = (value: Cause | null) =>
    value === "blocks" || value === "unlinked" || value === "shadowed" ? "blocks" : value;
  if (blockish(cause) !== blockish(rearranged)) {
    problems.push(`${at}: moving the same blocks between named, unlinked and shadowed changed the verdict`);
  }
}

/*
  Measure the corpus before trusting a single property above.

  Every one of these bounds is a thing the generator has actually failed to
  produce at some point on this site, and each time the properties passed
  against nothing.
*/
if (corpus.refused < ROUNDS * 0.2) problems.push(`only ${corpus.refused} of ${ROUNDS} writes were refused`);
if (corpus.succeeded < ROUNDS * 0.1) problems.push(`only ${corpus.succeeded} of ${ROUNDS} writes succeeded`);
if (corpus.gapped < ROUNDS * 0.1) {
  problems.push(`only ${corpus.gapped} of ${ROUNDS} filesystems had blocks du cannot reach`);
}
if (corpus.quotaBound < ROUNDS * 0.1) problems.push(`only ${corpus.quotaBound} of ${ROUNDS} had a quota at all`);
if (corpus.quotaOnSomebodyElse < 100) {
  problems.push(
    `only ${corpus.quotaOnSomebodyElse} of ${ROUNDS} had a quota belonging to somebody other than the` +
      ` writer, so reading the wrong quota row would go unnoticed`,
  );
}
if (corpus.inodesFull < 20) {
  problems.push(`only ${corpus.inodesFull} of ${ROUNDS} filesystems had every inode spent`);
}
if (corpus.rootWrites < ROUNDS * 0.1) problems.push(`only ${corpus.rootWrites} of ${ROUNDS} writes were as root`);
for (const cause of ["blocks", "inodes", "reserve", "quota"] as Cause[]) {
  const count = corpus.byCause.get(cause) ?? 0;
  if (count < 20) problems.push(`the generator produced ${count} ${cause} refusals, so that property ran on nothing`);
}

/* ----------------------------------------------------------------- report */

if (problems.length) {
  console.error(`check-space: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const spread = [...corpus.byCause.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([cause, count]) => `${count} ${cause}`)
  .join(", ");
console.log(
  `OK  ${CASES.length} filesystems, all six causes covered, each deriving one cause that exactly one` +
    ` option names, ${CASES.length} distinct beliefs broken, and the model held to the rules over` +
    ` ${ROUNDS} generated filesystems (${corpus.refused} refused: ${spread}).`,
);
