/**
 * The page cache surface, recomputed a second way.
 *
 * The model is four closed forms and a switch. buffCache adds three numbers,
 * shared adds two, freed picks a branch. A gate that checks those by adding
 * the same numbers again proves nothing, and the failure mode of a switch is
 * a branch nobody wrote, which a second copy of the switch also would not have.
 *
 * So this one itemizes. It builds the column as a list of contributors, each
 * with a size and two properties: whether it is Shmem, and whether
 * drop_caches can take it. Then it adds the list up, filters it, and compares.
 * Two things fall out that no formula can state:
 *
 *   - every kilobyte in the column belongs to exactly one contributor, so a
 *     figure that is counted twice or not at all shows up as a total that does
 *     not reconcile
 *   - every contributor is classified by both properties, so a kind of memory
 *     nobody decided about is a failure rather than a silent zero
 *
 * The fixtures at the bottom are the measured readings of /proc/meminfo.
 *
 *     npx tsx scripts-ci/check-pagecache.ts
 */

import { CASES } from "../client/src/lib/pagecache/data/cases";
import type { Attempt, Setup, Store } from "../client/src/lib/pagecache/types";
import {
  PAGE_KB,
  after,
  asAttempt,
  asSize,
  asStore,
  availableCostKb,
  buffCache,
  cached,
  claimHolds,
  correctOption,
  costKb,
  freed,
  honestColumn,
  pinned,
  reclaimableCache,
  shared,
  survives,
  asPagecache,
} from "../client/src/lib/pagecache/model";

const problems: string[] = [];
const fail = (line: string) => problems.push(line);

/* ------------------------------------------------------- the second shape */

interface Contributor {
  /** What this memory is, in the words a reader would use. */
  what: string;
  /** How much of it, in kibibytes. */
  kb: number;
  /** Whether /proc/meminfo counts it in Shmem. */
  isShmem: boolean;
  /** Whether echo 3 > drop_caches hands it back. */
  dropTakesIt: boolean;
  /** Whether removing the file hands it back. */
  deleteTakesIt: boolean;
}

/**
 * Everything in the buff/cache column, one entry at a time.
 *
 * The baseline page cache is here as its own entry and drop_caches does not
 * take it, which is what the measurement said: Cached went 212780 up to
 * 1261688 and back down to 212360, so the gibibyte came back and the baseline
 * stayed. Most of a baseline like that is the mapped pages of whatever is
 * running, and those are not droppable.
 */
function itemize(setup: Setup): Contributor[] {
  const list: Contributor[] = [
    { what: "Buffers", kb: setup.buffersKb, isShmem: false, dropTakesIt: false, deleteTakesIt: false },
    {
      what: "the page cache that was already there",
      kb: setup.baseCacheKb - setup.baseShmemKb,
      isShmem: false,
      dropTakesIt: false,
      deleteTakesIt: false,
    },
    {
      what: "the tmpfs that was already there",
      kb: setup.baseShmemKb,
      isShmem: true,
      dropTakesIt: false,
      deleteTakesIt: false,
    },
    {
      what: "reclaimable slab",
      kb: setup.reclaimableKb,
      isShmem: false,
      dropTakesIt: true,
      deleteTakesIt: false,
    },
  ];
  /* And what this job put there, which is the only entry that moves. */
  list.push(
    pinned(setup)
      ? {
          what: "this job's bytes, in tmpfs",
          kb: costKb(setup),
          isShmem: true,
          /* Nowhere to write it back to, so nothing can drop it. */
          dropTakesIt: false,
          deleteTakesIt: true,
        }
      : {
          what: "this job's bytes, in the page cache",
          kb: costKb(setup),
          isShmem: false,
          dropTakesIt: true,
          /* Already reclaimable; removing the file does not hand memory back. */
          deleteTakesIt: false,
        },
  );
  return list;
}

/** What an attempt takes, entry by entry. */
function takenBy(attempt: Attempt, entry: Contributor): boolean {
  switch (attempt) {
    case "nothing":
      return false;
    case "drop_caches":
      return entry.dropTakesIt;
    case "delete":
      return entry.deleteTakesIt;
    case "delete while open":
      /* The inode is gone from the directory and the pages are not. */
      return false;
  }
}

function compare(where: string, setup: Setup): void {
  const list = itemize(setup);

  /* --- every kilobyte belongs to exactly one entry --- */
  const total = list.reduce((sum, entry) => sum + entry.kb, 0);
  if (total !== buffCache(setup)) {
    fail(`${where}: the entries add up to ${total} and the column reads ${buffCache(setup)}`);
    return;
  }
  for (const entry of list) {
    if (entry.kb < 0) fail(`${where}: "${entry.what}" is ${entry.kb}, and no amount of memory is negative`);
  }
  /* And no entry is nameless, which is how one gets forgotten. */
  const names = new Set(list.map((entry) => entry.what));
  if (names.size !== list.length) fail(`${where}: two entries share a name, so one of them cannot be found`);

  /* --- Shmem is the entries that are Shmem --- */
  const shmem = list.filter((entry) => entry.isShmem).reduce((sum, entry) => sum + entry.kb, 0);
  if (shmem !== shared(setup)) {
    fail(`${where}: the Shmem entries add up to ${shmem} and the model says ${shared(setup)}`);
  }
  /* Cached is everything but Buffers and the slab, by the same walk. */
  const inCached = list
    .filter((entry) => entry.what !== "Buffers" && entry.what !== "reclaimable slab")
    .reduce((sum, entry) => sum + entry.kb, 0);
  if (inCached !== cached(setup)) {
    fail(`${where}: the Cached entries add up to ${inCached} and the model says ${cached(setup)}`);
  }
  if (reclaimableCache(setup) !== inCached - shmem) {
    fail(`${where}: Cached less Shmem is ${inCached - shmem} and the model says ${reclaimableCache(setup)}`);
  }

  /* --- and the attempt takes what it takes --- */
  const taken = list.filter((entry) => takenBy(setup.attempt, entry)).reduce((sum, entry) => sum + entry.kb, 0);
  if (taken !== freed(setup)) {
    fail(`${where}: walking the entries, ${asAttempt(setup.attempt)} takes ${taken} and the model says ${freed(setup)}`);
  }
  if (after(setup) !== total - taken) {
    fail(`${where}: ${total} less ${taken} is ${total - taken} and the model says ${after(setup)}`);
  }

  /* --- the two things the surface exists to say --- */

  /*
    Nothing that is Shmem is ever taken by drop_caches. Asserted over every
    entry rather than for the one the case happens to be about, because the
    claim is about the kind of memory and not about this job.
  */
  for (const entry of list) {
    if (entry.isShmem && entry.dropTakesIt) {
      fail(`${where}: "${entry.what}" is Shmem and drop_caches is said to take it`);
    }
    if (!entry.isShmem && entry.deleteTakesIt) {
      fail(`${where}: "${entry.what}" is not Shmem and removing a file is said to hand it back`);
    }
  }

  /*
    The column reads the same whichever store the bytes went to. This is the
    whole surface, and no arrangement of cases could show it, so it is checked
    by writing the same amount to the other store and requiring the figure to
    be identical.
  */
  const elsewhere: Setup = { ...setup, store: setup.store === "tmpfs" ? "disk" : "tmpfs" };
  if (buffCache(elsewhere) !== buffCache(setup)) {
    fail(`${where}: the column reads ${buffCache(setup)} here and ${buffCache(elsewhere)} for the same bytes in ${asStore(elsewhere.store)}, and it should read the same`);
  }
  if (cached(elsewhere) !== cached(setup)) {
    fail(`${where}: Cached differs between the two stores, and it does not`);
  }
  /* And everything else about them differs. */
  if (costKb(setup) > 0) {
    if (shared(elsewhere) === shared(setup)) {
      fail(`${where}: Shmem reads the same for both stores, and it is the figure that tells them apart`);
    }
    if (availableCostKb(elsewhere) === availableCostKb(setup)) {
      fail(`${where}: the cost to MemAvailable is the same for both stores, and it is not`);
    }
  }

  /* --- and what follows from the rest --- */

  if (availableCostKb(setup) !== (pinned(setup) ? costKb(setup) : 0)) {
    fail(`${where}: the cost to MemAvailable is ${availableCostKb(setup)}`);
  }
  const stillThere = !list
    .filter((entry) => entry.what.startsWith("this job"))
    .every((entry) => takenBy(setup.attempt, entry));
  if (survives(setup) !== stillThere) {
    fail(`${where}: the job's own entry is ${stillThere ? "still there" : "gone"} and survives says ${survives(setup)}`);
  }
  if (freed(setup) > buffCache(setup)) fail(`${where}: more was freed than was in the column`);
  if (freed(setup) < 0) fail(`${where}: a negative amount was freed`);
  if (honestColumn(setup).includes("MemAvailable") !== pinned(setup)) {
    fail(`${where}: honestColumn says "${honestColumn(setup)}" for ${asStore(setup.store)}`);
  }
  if (costKb(setup) % PAGE_KB !== 0) fail(`${where}: ${costKb(setup)} is not a whole number of pages`);
}

for (const item of CASES) compare(item.slug, item.setup);

/* --------------------------- and so does everything the model can take */

let exhaustive = 0;
for (const totalKb of [2 * 1024 * 1024, 16481980]) {
  for (const baseCacheKb of [0, 4, 212780, 1048576]) {
    for (const baseShmemKb of [0, 4, 12992]) {
      if (baseShmemKb > baseCacheKb) continue; /* Shmem is inside Cached. */
      for (const wroteKb of [0, 1, 4, 5, 4096, 512 * 1024, 1048576]) {
        for (const store of ["disk", "tmpfs"] as Store[]) {
          for (const attempt of ["nothing", "drop_caches", "delete", "delete while open"] as Attempt[]) {
            for (const reclaimableKb of [0, 24944]) {
              exhaustive += 1;
              compare(
                `${asSize(totalKb)} machine, ${asSize(wroteKb)} into ${store}, base ${baseCacheKb}/${baseShmemKb}, ${attempt}`,
                { host: "h", job: "a probe", totalKb, baseCacheKb, baseShmemKb, reclaimableKb, buffersKb: 8700, wroteKb, store, attempt },
              );
            }
          }
        }
      }
    }
  }
}

/* --------------------------------------------------------- the cases hold up */

const slugs = new Set<string>();
const breaks = new Set<string>();
const names = new Set<string>();
const setups = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) fail(`${where}: two cases share a slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) fail(`${where}: two cases break the same belief, "${item.breaks}"`);
  breaks.add(item.breaks);
  if (names.has(item.name)) fail(`${where}: two cases share a name`);
  names.add(item.name);
  const shape = JSON.stringify(item.setup);
  if (setups.has(shape)) fail(`${where}: two cases have the same setup, so one of them teaches nothing new`);
  setups.add(shape);

  for (const [field, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is an amount of memory`);
  }
  if (item.setup.baseShmemKb > item.setup.baseCacheKb) {
    fail(`${where}: Shmem is inside Cached and this case has more of the first than the second`);
  }
  if (buffCache(item.setup) > item.setup.totalKb) {
    fail(`${where}: the column reads more than the machine has`);
  }
  if (item.setup.wroteKb < 1) fail(`${where}: a job that wrote nothing teaches nothing`);

  const holds = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (holds.length !== 1) fail(`${where}: ${holds.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    const number = /^(\d[\d,.]*)/.exec(option.claim.trim());
    if (number) {
      const bare = number[1].replace(/[,.]$/, "");
      if (leading.has(bare)) fail(`${where}: two options open with ${bare}, which a reader reads as the same answer`);
      leading.add(bare);
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== holds[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asPagecache(item.setup);
  if (lines.length !== 6) fail(`${where}: asPagecache rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asPagecache line is missing a part`);
  if (!lines[2].unit.includes("Shmem is inside")) fail(`${where}: the Cached line has to say Shmem is inside it`);
  if (!lines[4].unit.includes("Buffers plus Cached plus SReclaimable")) fail(`${where}: the column line has to say what the column is`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------- the measured readings reproduce

    Linux 6.18.44, MemTotal 16481980 kB, no swap. Figures in kB.

    one atomic copy of /proc/meminfo next to one free -k:
      Buffers 8704 + Cached 230000 + SReclaimable 24828 = 263532, free: 263532
      Shmem 12996, free's shared: 12996

    1 GiB to an ordinary file      MemFree     Cached      Shmem   MemAvailable
      clean                       14896456     212780      13164       14856712
      written                     13817736    1261688      12992       14840752
      after drop_caches           14901160     212360      12992       14860988

    1 GiB to tmpfs                 MemFree     Cached      Shmem   MemAvailable
      clean                       14924388     212652      12992       14893824
      written                     13874728    1261392    1061396       13836480
      after drop_caches           13871756    1261232    1061568       13832524

    512 MiB in tmpfs, rm with a descriptor still open:
      written                     Shmem 537096,  df 512M used
      unlinked, fd open           Shmem 537096,  df 512M used
      fd closed                   Shmem  12992,  df 0
*/
{
  const GIB = 1024 * 1024;
  const disk: Setup = {
    host: "the host these came from", job: "a probe", totalKb: 16481980,
    baseCacheKb: 212780, baseShmemKb: 13164, reclaimableKb: 24944, buffersKb: 8700,
    wroteKb: GIB, store: "disk", attempt: "nothing",
  };
  const shm: Setup = {
    host: "the host these came from", job: "a probe", totalKb: 16481980,
    baseCacheKb: 212652, baseShmemKb: 12992, reclaimableKb: 27324, buffersKb: 8700,
    wroteKb: GIB, store: "tmpfs", attempt: "nothing",
  };
  /*
    The readings were taken seconds apart around a 1 GiB write, so each carries
    the drift of an idle machine: Cached rose by 1048908 against a clean
    gibibyte of 1048576, which is the writing process's own pages. 2 MiB is the
    precision of the measurement and not a tolerance picked to pass.
  */
  const near = (label: string, got: number, want: number, slack = 2048) => {
    if (Math.abs(got - want) > slack) fail(`measured: ${label} came to ${want} and the model says ${got}`);
  };

  near("Cached after a gibibyte to disk", cached(disk), 1261688);
  if (shared(disk) !== 13164) fail(`measured: an ordinary file did not move Shmem`);
  if (availableCostKb(disk) !== 0) fail(`measured: an ordinary file did not move MemAvailable`);
  if (survives({ ...disk, attempt: "drop_caches" })) fail(`measured: drop_caches took the ordinary file's cache`);
  near("what drop_caches freed on disk", freed({ ...disk, attempt: "drop_caches" }), 1261688 - 212360 + 24944);

  near("Cached after a gibibyte to tmpfs", cached(shm), 1261392);
  near("Shmem after a gibibyte to tmpfs", shared(shm), 1061396);
  near("what tmpfs cost MemAvailable", availableCostKb(shm), 14893824 - 13836480, 12000);
  if (freed({ ...shm, attempt: "drop_caches" }) !== shm.reclaimableKb) {
    fail(`measured: drop_caches freed nothing of the tmpfs, Cached went 1261392 to 1261232`);
  }
  if (!survives({ ...shm, attempt: "drop_caches" })) fail(`measured: the tmpfs bytes were still there afterwards`);

  /* The point of the whole surface, in one line. */
  near("the two Cached figures are the same", cached(disk) - cached(shm), 1261688 - 1261392, 400);

  /* 512 MiB, unlinked with a descriptor open. */
  const held: Setup = { ...shm, wroteKb: 512 * 1024, baseShmemKb: 12992, attempt: "delete while open" };
  near("Shmem with the file unlinked and open", shared(held), 537096);
  if (freed(held) !== 0) fail(`measured: unlinking with a descriptor open freed nothing, df still said 512M`);
  if (!survives(held)) fail(`measured: the bytes were still there while the descriptor was`);
  if (freed({ ...held, attempt: "delete" }) !== 512 * 1024) fail(`measured: closing the descriptor freed all of it, df went to 0`);
  if (survives({ ...held, attempt: "delete" })) fail(`measured: and the bytes were gone`);

  /* free's own arithmetic, from the atomic read. */
  const snap: Setup = {
    host: "h", job: "a probe", totalKb: 16481980,
    baseCacheKb: 230000, baseShmemKb: 12996, reclaimableKb: 24828, buffersKb: 8704,
    wroteKb: 4, store: "disk", attempt: "nothing",
  };
  if (buffCache({ ...snap, wroteKb: 0 }) !== 263532) fail(`measured: free's buff/cache was Buffers + Cached + SReclaimable, 263532`);
  if (shared({ ...snap, wroteKb: 0 }) !== 12996) fail(`measured: free's shared was Shmem, 12996`);

  /*
    Written as literals rather than against the model's constant, because a
    check of the page size cannot be written in terms of the page size.
  */
  if (PAGE_KB !== 4) fail(`the page measured 4 kB and the model says ${PAGE_KB}`);
  if (costKb({ ...shm, wroteKb: 1 }) !== 4) fail(`measured: a one byte file on tmpfs cost 4096 bytes by df and du`);
  if (costKb({ ...shm, wroteKb: 4 }) !== 4) fail(`4 kB is one page`);
  if (costKb({ ...shm, wroteKb: 5 }) !== 8) fail(`5 kB is two`);
  if (costKb({ ...shm, wroteKb: 0 }) !== 0) fail(`nothing is no pages`);
  if (asSize(1048576) !== "1 GiB") fail(`asSize got gibibytes wrong: ${asSize(1048576)}`);
  if (asSize(4) !== "4 kB") fail(`asSize got kilobytes wrong: ${asSize(4)}`);
  /*
    Every name is its own name. Written as "all of them differ" rather than as
    one assertion per value, because what goes wrong with a renderer is that
    two cases collapse into one, and blinding found two that did: asStore
    returning "tmpfs" for both stores, and asAttempt naming a command for the
    case where nothing was run.
  */
  if (asStore("tmpfs") !== "tmpfs") fail(`asStore names the mount`);
  if (asStore("disk") === asStore("tmpfs")) fail(`asStore gives the two stores the same name`);
  if (!asStore("disk").includes("file")) fail(`asStore says what the other one is`);
  const named = (["nothing", "drop_caches", "delete", "delete while open"] as Attempt[]).map(asAttempt);
  if (new Set(named).size !== named.length) fail(`two attempts render as the same words: ${named.join(" / ")}`);
  if (!asAttempt("drop_caches").includes("drop_caches")) fail(`asAttempt names the command`);
  if (asAttempt("nothing").includes("/proc") || asAttempt("nothing").includes("rm ")) {
    fail(`asAttempt names a command for the case where nothing was run: "${asAttempt("nothing")}"`);
  }
  if (!asAttempt("delete while open").includes("open")) fail(`asAttempt says what is still holding it`);
}

if (problems.length > 0) {
  console.error(`\ncheck-pagecache: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const line of problems.slice(0, 30)) console.error(`  ${line}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} pagecache cases: itemizing the buff/cache column one contributor at a time, adding it up and filtering it ` +
    `by what each attempt can take, agrees with the model on every one of them and on ${exhaustive} combinations of machine size, ` +
    `baseline, amount written, store and attempt; every kilobyte belongs to exactly one contributor and every contributor is ` +
    `classified both ways; the measured readings reproduce, including the two runs whose Cached figures match to within the drift ` +
    `of the readings while one survives drop_caches and the other does not; and the column reads the same for both stores ` +
    `everywhere, while Shmem and the cost to MemAvailable never do.`,
);
